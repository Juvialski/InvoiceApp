import test from "node:test";
import assert from "node:assert/strict";
import {
  createInitialMigrationRecord,
  executeMigrationStep,
  dualReadObject,
  MemoryStorageProvider,
  ObjectNotFoundError,
  StorageIntegrityError,
} from "../src/lib/storage/index.ts";
import { MigrationService } from "../src/server/storage/migrationService.ts";

test("Storage Migration: Discovered legacy Supabase object initializes with normalized hash and DISCOVERED state", () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const docId = "doc-invoice-101";
  const sha256 = "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855";

  const record = createInitialMigrationRecord({
    companyId,
    documentDomain: "INVOICES",
    documentId: docId,
    sourceProvider: "supabase",
    sourceBucket: "invoice-originals",
    sourceKey: `companies/${companyId}/invoices/manual/2026/09/doc.pdf`,
    targetProvider: "s3",
    targetBucket: "engoryx-production-documents",
    sha256,
    sizeBytes: 2048,
  });

  assert.equal(record.companyId, companyId);
  assert.equal(record.documentDomain, "INVOICES");
  assert.equal(record.migrationState, "DISCOVERED");
  assert.equal(record.verificationStatus, "UNVERIFIED");
  assert.equal(record.sha256, sha256.toLowerCase());
  assert.equal(record.attempts, 0);
});

test("Storage Migration: Executes verified copy to target S3 provider and performs PRIMARY_SWITCH without deleting legacy source", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const docId = "doc-inv-202";
  const sourceProvider = new MemoryStorageProvider();
  const targetProvider = new MemoryStorageProvider();

  const key = `companies/${companyId}/invoices/manual/2026/09/doc-202.pdf`;
  const pdfBytes = new TextEncoder().encode("%PDF-1.4 Migration verified source bytes");

  // Put object in source provider (legacy Supabase storage)
  const putResult = await sourceProvider.putObject({
    companyId,
    bucket: "invoice-originals",
    key,
    bytes: pdfBytes,
    contentType: "application/pdf",
  });

  const record = createInitialMigrationRecord({
    companyId,
    documentDomain: "INVOICES",
    documentId: docId,
    sourceProvider: "supabase",
    sourceBucket: "invoice-originals",
    sourceKey: key,
    targetProvider: "s3",
    targetBucket: "engoryx-production-documents",
    sha256: putResult.ref.sha256!,
    sizeBytes: pdfBytes.byteLength,
  });

  // Execute migration step
  const result = await executeMigrationStep(record, sourceProvider, targetProvider);

  assert.equal(result.success, true);
  assert.equal(result.record.migrationState, "PRIMARY_SWITCH");
  assert.equal(result.record.verificationStatus, "MATCHED");
  assert.ok(result.record.verifiedAt);
  assert.ok(result.record.switchedAt);

  // Invariant check: Verify the object is in target provider
  const targetObj = await targetProvider.getObject({
    companyId,
    bucket: "engoryx-production-documents",
    key,
  });
  assert.equal(targetObj.bytes.byteLength, pdfBytes.byteLength);

  // CRITICAL INVARIANT: Source object is PRESERVED (Grace period; NEVER deleted in Wave S3)
  const sourceObjAfter = await sourceProvider.getObject({
    companyId,
    bucket: "invoice-originals",
    key,
  });
  assert.equal(sourceObjAfter.bytes.byteLength, pdfBytes.byteLength);
});

test("Storage Migration: Fails safely and enters RETRY_PENDING if source checksum is corrupted", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const sourceProvider = new MemoryStorageProvider();
  const targetProvider = new MemoryStorageProvider();
  const key = `companies/${companyId}/invoices/manual/2026/09/corrupted.pdf`;
  const pdfBytes = new TextEncoder().encode("%PDF-1.4 Genuine bytes");

  await sourceProvider.putObject({
    companyId,
    bucket: "invoice-originals",
    key,
    bytes: pdfBytes,
    contentType: "application/pdf",
  });

  // Manifest has wrong expected SHA-256
  const record = createInitialMigrationRecord({
    companyId,
    documentDomain: "INVOICES",
    documentId: "doc-corrupted",
    sourceProvider: "supabase",
    sourceBucket: "invoice-originals",
    sourceKey: key,
    targetProvider: "s3",
    targetBucket: "engoryx-production-documents",
    sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    sizeBytes: pdfBytes.byteLength,
  });

  const result = await executeMigrationStep(record, sourceProvider, targetProvider);

  assert.equal(result.success, false);
  assert.equal(result.record.migrationState, "RETRY_PENDING");
  assert.equal(result.record.verificationStatus, "CORRUPTED");
  assert.ok(result.record.lastError?.includes("integrity check failed"));
  assert.equal(result.record.attempts, 1);

  // Object should not exist on target
  await assert.rejects(
    targetProvider.getObject({ companyId, bucket: "engoryx-production-documents", key }),
    ObjectNotFoundError,
  );
});

test("Storage Migration: Dual-read compatibility seamlessly reads from fallback provider if unmigrated", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const primaryProvider = new MemoryStorageProvider(); // S3 primary (empty)
  const legacyProvider = new MemoryStorageProvider();  // Supabase fallback (has legacy object)

  const legacyKey = `companies/${companyId}/invoices/manual/2026/09/legacy.pdf`;
  const legacyBytes = new TextEncoder().encode("%PDF-1.4 Legacy invoice content");

  await legacyProvider.putObject({
    companyId,
    bucket: "invoice-originals",
    key: legacyKey,
    bytes: legacyBytes,
    contentType: "application/pdf",
  });

  // Query primary first; dualReadObject falls back to legacy provider
  const readResult = await dualReadObject(
    { companyId, bucket: "engoryx-production-documents", key: legacyKey },
    primaryProvider,
    legacyProvider,
    { companyId, bucket: "invoice-originals", key: legacyKey },
  );

  assert.equal(readResult.bytes.byteLength, legacyBytes.byteLength);
  assert.equal(new TextDecoder().decode(readResult.bytes), "%PDF-1.4 Legacy invoice content");
});

test("MigrationService: Discovers and executes incremental batch migration across Engineering and Payroll domains", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const sourceStore = new MemoryStorageProvider();
  const targetStore = new MemoryStorageProvider();

  // Setup engineering revision in source store
  const engKey = `companies/${companyId}/documents/doc-eng-1/revisions/rev-1/blueprint.pdf`;
  const engBytes = new TextEncoder().encode("%PDF-1.4 Engineering Drawing Content");
  const engPut = await sourceStore.putObject({
    companyId,
    bucket: "engineering-documents",
    key: engKey,
    bytes: engBytes,
    contentType: "application/pdf",
  });

  // Mock Supabase DB
  const migrationRecords: any[] = [];
  const engineeringRevisions: any[] = [
    {
      id: "rev-1",
      company_id: companyId,
      file_path: engKey,
      storage_provider: "supabase",
      storage_bucket: "engineering-documents",
      file_fingerprint: `sha256:${engPut.ref.sha256}`,
      file_size_bytes: engBytes.byteLength,
    },
  ];

  const mockSupabase: any = {
    from: (table: string) => ({
      select: () => ({
        eq: (_col1: string, val1: any) => ({
          eq: (_col2: string, val2: any) => ({
            limit: async () => {
              if (table === "engineering_document_revisions") {
                return {
                  data: engineeringRevisions.filter((r) => r.company_id === val1 && r.storage_provider === val2),
                  error: null,
                };
              }
              return { data: [], error: null };
            },
          }),
          in: (_col2: string, states: string[]) => ({
            order: () => ({
              limit: async () => {
                if (table === "document_migration_records") {
                  return {
                    data: migrationRecords.filter((r) => r.company_id === val1 && states.includes(r.migration_state)),
                    error: null,
                  };
                }
                return { data: [], error: null };
              },
            }),
          }),
        }),
      }),
      insert: (data: any) => ({
        select: () => ({
          single: async () => {
            const row = { id: `mig-${migrationRecords.length + 1}`, ...data };
            migrationRecords.push(row);
            return { data: row, error: null };
          },
        }),
      }),
      update: (data: any) => ({
        eq: (_col1: string, val1: any) => ({
          eq: async () => {
            if (table === "engineering_document_revisions") {
              const item = engineeringRevisions.find((r) => r.id === val1);
              if (item) Object.assign(item, data);
            } else if (table === "document_migration_records") {
              const item = migrationRecords.find((r) => r.id === val1);
              if (item) Object.assign(item, data);
            }
            return { error: null };
          },
        }),
      }),
    }),
  };

  const migrationService = new MigrationService({
    supabaseClientSupplier: () => mockSupabase,
    primaryProviderSupplier: () => targetStore,
    providerSupplier: (id) => (id === "supabase" ? sourceStore : targetStore),
  });

  // 1. Discover eligible engineering documents
  const discovered = await migrationService.discoverEligibleDocuments(companyId, "ENGINEERING");
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].documentDomain, "ENGINEERING");
  assert.equal(discovered[0].migrationState, "DISCOVERED");

  // 2. Process pending migration batch
  const batchResult = await migrationService.processPendingMigrations(companyId, 10);
  assert.equal(batchResult.processed, 1);
  assert.equal(batchResult.success, 1);
  assert.equal(batchResult.failed, 0);
  assert.equal(batchResult.records[0].migrationState, "PRIMARY_SWITCH");

  // Invariant: engineering revision table is updated with target provider
  assert.equal(engineeringRevisions[0].storage_provider, "memory");
  assert.equal(engineeringRevisions[0].file_path, engKey);

  // Invariant: byte contents on target provider are verified
  const targetRead = await targetStore.getObject({
    companyId,
    bucket: "engoryx-production-documents",
    key: engKey,
  });
  assert.equal(targetRead.bytes.byteLength, engBytes.byteLength);
});
