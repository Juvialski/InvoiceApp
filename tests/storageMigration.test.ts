import test from "node:test";
import assert from "node:assert/strict";
import {
  createInitialMigrationRecord,
  executeMigrationStep,
  dualReadObject,
  MemoryStorageProvider,
  ObjectNotFoundError,
  StorageIntegrityError,
  StorageError,
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
    targetBucket: "engoryx-custom-r2-bucket",
    sha256,
    sizeBytes: 2048,
  });

  assert.equal(record.companyId, companyId);
  assert.equal(record.documentDomain, "INVOICES");
  assert.equal(record.migrationState, "DISCOVERED");
  assert.equal(record.verificationStatus, "UNVERIFIED");
  assert.equal(record.sha256, sha256.toLowerCase());
  assert.equal(record.targetBucket, "engoryx-custom-r2-bucket");
  assert.equal(record.attempts, 0);
});

test("Storage Migration: Fails closed when primary provider is still Supabase", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const mockSupabase: any = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) };

  const prevEnv = process.env.STORAGE_PRIMARY_PROVIDER;
  try {
    process.env.STORAGE_PRIMARY_PROVIDER = "supabase";
    const migrationService = new MigrationService({
      supabaseClientSupplier: () => mockSupabase,
    });

    await assert.rejects(
      migrationService.discoverEligibleDocuments(companyId, "INVOICES"),
      (err: any) => {
        assert.ok(err instanceof StorageError);
        assert.equal(err.code, "EXTERNAL_PROVIDER_REQUIRED");
        return true;
      },
    );
  } finally {
    process.env.STORAGE_PRIMARY_PROVIDER = prevEnv;
  }
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
    targetBucket: "engoryx-custom-r2-bucket",
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

  // Invariant check: Verify the object is in target provider with configured bucket
  const targetObj = await targetProvider.getObject({
    companyId,
    bucket: "engoryx-custom-r2-bucket",
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

test("Storage Migration: Authoritative domain update failure leaves migration in RETRY_PENDING (never PRIMARY_SWITCH)", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const sourceStore = new MemoryStorageProvider();
  const targetStore = new MemoryStorageProvider();

  const key = `companies/${companyId}/invoices/manual/fail-update.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 Test failure content");
  const putRes = await sourceStore.putObject({
    companyId,
    bucket: "invoice-originals",
    key,
    bytes,
    contentType: "application/pdf",
  });

  const migrationRecords: any[] = [
    {
      id: "mig-fail-1",
      company_id: companyId,
      document_domain: "INVOICES",
      document_id: "doc-missing-row",
      source_provider: "supabase",
      source_bucket: "invoice-originals",
      source_key: key,
      target_provider: "s3",
      target_bucket: "engoryx-custom-r2-bucket",
      target_key: key,
      sha256: putRes.ref.sha256,
      size_bytes: bytes.byteLength,

      migration_state: "DISCOVERED",
      verification_status: "UNVERIFIED",
      attempts: 0,
      max_attempts: 5,
    },
  ];

  const createMockDb = (failDomainUpdate = false) => ({
    from: (table: string) => ({
      select: () => {
        const queryObj: any = {
          filters: {} as Record<string, any>,
          eq(col: string, val: any) {
            this.filters[col] = val;
            return this;
          },
          in(col: string, vals: any[]) {
            this.filters[col + "_in"] = vals;
            return this;
          },
          order() { return this; },
          async limit() {
            let list = [...migrationRecords];
            if (this.filters.company_id) list = list.filter((r) => r.company_id === this.filters.company_id);
            if (this.filters.migration_state_in) list = list.filter((r) => this.filters.migration_state_in.includes(r.migration_state));
            if (this.filters.document_domain) list = list.filter((r) => r.document_domain === this.filters.document_domain);
            if (this.filters.sha256) list = list.filter((r) => r.sha256 === this.filters.sha256);
            if (this.filters.target_provider) list = list.filter((r) => r.target_provider === this.filters.target_provider);
            if (this.filters.target_bucket) list = list.filter((r) => r.target_bucket === this.filters.target_bucket);
            if (this.filters.migration_state) list = list.filter((r) => r.migration_state === this.filters.migration_state);
            if (this.filters.verification_status) list = list.filter((r) => r.verification_status === this.filters.verification_status);
            return { data: list, error: null };
          },
          then(resolve: any) { return this.limit().then(resolve); },
        };
        return queryObj;
      },
      update: (data: any) => {
        const updateObj: any = {
          filters: {} as Record<string, any>,
          eq(col: string, val: any) {
            this.filters[col] = val;
            if (table === "document_migration_records" && col === "id") {
              const item = migrationRecords.find((r) => r.id === val);
              if (item) Object.assign(item, data);
            }
            return this;
          },
          in(col: string, vals: any[]) {
            this.filters[col + "_in"] = vals;
            return this;
          },
          async select() {
            if (failDomainUpdate && (table === "source_documents" || table === "engineering_document_revisions")) {
              return { data: [], error: null };
            }
            const item = migrationRecords.find((r) => r.id === this.filters.id);
            if (item) Object.assign(item, data);
            return { data: item ? [item] : [], error: null };
          },

          then(resolve: any) {
            return this.select().then((res: any) => resolve({ error: null, data: res.data }));
          },
        };
        return updateObj;
      },

    }),
  });

  const migrationService = new MigrationService({
    supabaseClientSupplier: () => createMockDb(true) as any,
    primaryProviderSupplier: () => targetStore,
    providerSupplier: (id) => (id === "supabase" ? sourceStore : targetStore),
  });

  const res = await migrationService.processPendingMigrations(companyId, "INVOICES", 10);
  assert.equal(res.processed, 1);
  assert.equal(res.success, 0);
  assert.equal(res.failed, 1);
  assert.equal(res.records[0].migrationState, "RETRY_PENDING");
  assert.ok(res.records[0].lastError?.includes("Failed to update source_documents"));
});


test("Physical Deduplication during Migration: Identical Engineering Revision bytes share physical S3 key while retaining separate revision rows", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const sourceStore = new MemoryStorageProvider();
  const targetStore = new MemoryStorageProvider();

  const rev1Key = `companies/${companyId}/documents/doc-eng-1/revisions/rev-1/drawing.pdf`;
  const rev2Key = `companies/${companyId}/documents/doc-eng-1/revisions/rev-2/drawing.pdf`;
  const identicalBytes = new TextEncoder().encode("%PDF-1.4 Identical Drawing Binary");

  const putRes = await sourceStore.putObject({
    companyId,
    bucket: "engineering-documents",
    key: rev1Key,
    bytes: identicalBytes,
    contentType: "application/pdf",
  });
  await sourceStore.putObject({
    companyId,
    bucket: "engineering-documents",
    key: rev2Key,
    bytes: identicalBytes,
    contentType: "application/pdf",
  });

  const engRevisions: any[] = [
    { id: "rev-1", company_id: companyId, file_path: rev1Key, storage_provider: "supabase", storage_bucket: "engineering-documents" },
    { id: "rev-2", company_id: companyId, file_path: rev2Key, storage_provider: "supabase", storage_bucket: "engineering-documents" },
  ];

  const migrationRecords: any[] = [
    {
      id: "mig-rev-1",
      company_id: companyId,
      document_domain: "ENGINEERING",
      document_id: "rev-1",
      source_provider: "supabase",
      source_bucket: "engineering-documents",
      source_key: rev1Key,
      target_provider: "s3",
      target_bucket: "engoryx-custom-r2-bucket",
      target_key: rev1Key,
      sha256: putRes.ref.sha256,
      size_bytes: identicalBytes.byteLength,
      migration_state: "PRIMARY_SWITCH",
      verification_status: "MATCHED",
      attempts: 1,
    },
    {
      id: "mig-rev-2",
      company_id: companyId,
      document_domain: "ENGINEERING",
      document_id: "rev-2",
      source_provider: "supabase",
      source_bucket: "engineering-documents",
      source_key: rev2Key,
      target_provider: "s3",
      target_bucket: "engoryx-custom-r2-bucket",
      target_key: rev2Key,
      sha256: putRes.ref.sha256,
      size_bytes: identicalBytes.byteLength,
      migration_state: "DISCOVERED",
      verification_status: "UNVERIFIED",
      attempts: 0,
    },
  ];

  // Pre-seed target store with verified rev-1 key
  await targetStore.putObject({
    companyId,
    bucket: "engoryx-custom-r2-bucket",
    key: rev1Key,
    bytes: identicalBytes,
    contentType: "application/pdf",
  });

  const createMockDb = (failDomainUpdate = false) => ({
    from: (table: string) => ({
      select: () => {
        const queryObj: any = {
          filters: {} as Record<string, any>,
          eq(col: string, val: any) {
            this.filters[col] = val;
            return this;
          },
          in(col: string, vals: any[]) {
            this.filters[col + "_in"] = vals;
            return this;
          },
          order() { return this; },
          async limit() {
            let list = [...migrationRecords];
            if (this.filters.company_id) list = list.filter((r) => r.company_id === this.filters.company_id);
            if (this.filters.migration_state_in) list = list.filter((r) => this.filters.migration_state_in.includes(r.migration_state));
            if (this.filters.document_domain) list = list.filter((r) => r.document_domain === this.filters.document_domain);
            if (this.filters.sha256) list = list.filter((r) => r.sha256 === this.filters.sha256);
            if (this.filters.target_provider) list = list.filter((r) => r.target_provider === this.filters.target_provider);
            if (this.filters.target_bucket) list = list.filter((r) => r.target_bucket === this.filters.target_bucket);
            if (this.filters.migration_state) list = list.filter((r) => r.migration_state === this.filters.migration_state);
            if (this.filters.verification_status) list = list.filter((r) => r.verification_status === this.filters.verification_status);
            return { data: list, error: null };
          },
          then(resolve: any) { return this.limit().then(resolve); },
        };
        return queryObj;
      },
      update: (data: any) => {
        const updateObj: any = {
          filters: {} as Record<string, any>,
          eq(col: string, val: any) {
            this.filters[col] = val;
            return this;
          },
          in(col: string, vals: any[]) {
            this.filters[col + "_in"] = vals;
            return this;
          },
          async select() {
            if (failDomainUpdate && (table === "source_documents" || table === "engineering_document_revisions")) {
              return { data: [], error: null };
            }
            if (table === "engineering_document_revisions") {
              const item = engRevisions.find((r) => r.id === this.filters.id);
              if (item) Object.assign(item, data);
              return { data: item ? [item] : [], error: null };
            }
            const item = migrationRecords.find((r) => r.id === this.filters.id);
            if (item) Object.assign(item, data);
            return { data: item ? [item] : [], error: null };
          },
          then(resolve: any) {
            return this.select().then((res: any) => resolve({ error: null, data: res.data }));
          },
        };
        return updateObj;
      },
    }),
  });

  const migrationService = new MigrationService({
    supabaseClientSupplier: () => createMockDb(false) as any,
    primaryProviderSupplier: () => targetStore,
    providerSupplier: (id) => (id === "supabase" ? sourceStore : targetStore),
  });


  const batchResult = await migrationService.processPendingMigrations(companyId, "ENGINEERING", 10);

  assert.equal(batchResult.processed, 1);
  assert.equal(batchResult.success, 1);

  // INVARIANT 1: Physical S3 key was reused (rev-2 references rev-1 physical key on S3)
  assert.equal(engRevisions[1].file_path, rev1Key);
  assert.equal(engRevisions[1].storage_provider, "s3");

  // INVARIANT 2: Logical revision records remain distinct!
  assert.equal(engRevisions.length, 2);
  assert.equal(engRevisions[0].id, "rev-1");
  assert.equal(engRevisions[1].id, "rev-2");
});

test("Storage Migration: Crash/Resume - verifies existing target object without re-uploading duplicate bytes", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const sourceStore = new MemoryStorageProvider();
  const targetStore = new MemoryStorageProvider();

  const key = `companies/${companyId}/invoices/manual/2026/09/crash-resume.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 Crash resume document content");

  const putRes = await sourceStore.putObject({
    companyId,
    bucket: "invoice-originals",
    key,
    bytes,
    contentType: "application/pdf",
  });

  // Target object was already successfully written before crash
  await targetStore.putObject({
    companyId,
    bucket: "engoryx-custom-r2-bucket",
    key,
    bytes,
    contentType: "application/pdf",
  });

  const record = createInitialMigrationRecord({
    companyId,
    documentDomain: "INVOICES",
    documentId: "doc-crash-1",
    sourceProvider: "supabase",
    sourceBucket: "invoice-originals",
    sourceKey: key,
    targetProvider: "s3",
    targetBucket: "engoryx-custom-r2-bucket",
    sha256: putRes.ref.sha256!,
    sizeBytes: bytes.byteLength,
  });

  // Re-run migration step after crash
  const stepResult = await executeMigrationStep(record, sourceProvider(sourceStore), targetStore);

  assert.equal(stepResult.success, true);
  assert.equal(stepResult.record.migrationState, "PRIMARY_SWITCH");
  assert.equal(stepResult.record.verificationStatus, "MATCHED");
});

function sourceProvider(store: MemoryStorageProvider) {
  return store;
}

test("Storage Migration: Concurrency - atomic claim allows only one concurrent worker to process a record", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const sourceStore = new MemoryStorageProvider();
  const targetStore = new MemoryStorageProvider();

  const key = `companies/${companyId}/invoices/manual/2026/09/conc-mig.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 Concurrency migration test");

  const putRes = await sourceStore.putObject({
    companyId,
    bucket: "invoice-originals",
    key,
    bytes,
    contentType: "application/pdf",
  });

  const sourceDocs = [
    { id: "doc-conc-mig", company_id: companyId, storage_path: key, storage_provider: "supabase", storage_bucket: "invoice-originals" },
  ];

  const migrationRecords: any[] = [
    {
      id: "mig-conc-1",
      company_id: companyId,
      document_domain: "INVOICES",
      document_id: "doc-conc-mig",
      source_provider: "supabase",
      source_bucket: "invoice-originals",
      source_key: key,
      target_provider: "s3",
      target_bucket: "engoryx-custom-r2-bucket",
      target_key: key,
      sha256: putRes.ref.sha256,
      size_bytes: bytes.byteLength,
      migration_state: "DISCOVERED",
      verification_status: "UNVERIFIED",
      attempts: 0,
      max_attempts: 5,
      created_at: new Date().toISOString(),
    },
  ];

  let claimAttempts = 0;
  const mockSupabase: any = {
    from: (table: string) => ({
      select: () => {
        const queryObj: any = {
          filters: {} as Record<string, any>,
          eq(col: string, val: any) { this.filters[col] = val; return this; },
          or() { return this; },
          order() { return this; },
          async limit() { return { data: [...migrationRecords], error: null }; },
          then(resolve: any) { return this.limit().then(resolve); },
        };
        return queryObj;
      },
      update: (data: any) => ({
        eq: (_col1: string, _val1: any) => ({
          eq: (_col2: string, _val2: any) => ({
            or: (_filterStr: string) => ({
              select: async () => {
                if (table === "document_migration_records") {
                  claimAttempts += 1;
                  if (claimAttempts === 1) {
                    Object.assign(migrationRecords[0], data);
                    return { data: [{ ...migrationRecords[0] }], error: null };
                  }
                  // Second concurrent worker gets 0 rows
                  return { data: [], error: null };
                }
                if (table === "source_documents") {
                  Object.assign(sourceDocs[0], data);
                  return { data: [{ id: "doc-conc-mig" }], error: null };
                }
                return { data: [], error: null };
              },
            }),
            select: async () => {
              if (table === "source_documents") {
                Object.assign(sourceDocs[0], data);
                return { data: [{ id: "doc-conc-mig" }], error: null };
              }
              if (table === "document_migration_records") {
                Object.assign(migrationRecords[0], data);
                return { data: [{ ...migrationRecords[0] }], error: null };
              }
              return { data: [], error: null };
            },
          }),
        }),
      }),
    }),
  };

  const migrationService = new MigrationService({
    supabaseClientSupplier: () => mockSupabase,
    primaryProviderSupplier: () => targetStore,
    providerSupplier: (id) => (id === "supabase" ? sourceStore : targetStore),
  });

  // Run two concurrent migration batches
  const [res1, res2] = await Promise.all([
    migrationService.processPendingMigrations(companyId, "INVOICES", 10),
    migrationService.processPendingMigrations(companyId, "INVOICES", 10),
  ]);

  // One worker claimed and succeeded; the other skipped
  assert.equal(res1.success + res2.success, 1);
  assert.equal(res1.processed + res2.processed, 1);
});

