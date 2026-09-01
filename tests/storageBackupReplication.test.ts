import test from "node:test";
import assert from "node:assert/strict";
import {
  assertBackupFailureIsolation,
  createPendingBackupRecord,
  executeRestoreVerification,
  replicateObjectToBackup,
  verifyBackupReplica,
  MemoryStorageProvider,
  StorageIntegrityError,
  StorageError,
} from "../src/lib/storage/index.ts";
import { BackupService } from "../src/server/storage/backupService.ts";

test("Backup Replication: Primary upload succeeds even if backup provider fails (asynchronous failure isolation)", () => {
  const backupError = new Error("Connection timed out to Backblaze B2");
  const isolationResult = assertBackupFailureIsolation(true, backupError);

  // Invariant: Primary write status is COMMITTED regardless of backup provider error
  assert.equal(isolationResult.primaryStatus, "COMMITTED");
  assert.equal(isolationResult.backupLogged, true);
});

test("Backup Replication: Replicates object from primary to independent backup provider and verifies successfully", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const docId = "doc-invoice-500";
  const primaryProvider = new MemoryStorageProvider();
  const backupProvider = new MemoryStorageProvider();

  const key = `companies/${companyId}/invoices/manual/2026/09/invoice-500.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 Authoritative invoice content for replication");

  const primaryPut = await primaryProvider.putObject({
    companyId,
    bucket: "engoryx-production-documents",
    key,
    bytes,
    contentType: "application/pdf",
  });

  const manifest = createPendingBackupRecord({
    companyId,
    documentDomain: "INVOICES",
    documentId: docId,
    sourceProvider: "s3",
    sourceBucket: "engoryx-production-documents",
    sourceKey: key,
    sha256: primaryPut.ref.sha256!,
    sizeBytes: bytes.byteLength,
    replicaProvider: "b2",
    replicaBucket: "engoryx-backblaze-backup",
  });

  assert.equal(manifest.replicationState, "PENDING");
  assert.equal(manifest.verificationStatus, "UNVERIFIED");

  // Step 1: Replicate bytes
  const replicatedManifest = await replicateObjectToBackup(manifest, primaryProvider, backupProvider);
  assert.equal(replicatedManifest.replicationState, "VERIFYING");
  assert.equal(replicatedManifest.attempts, 1);
  assert.ok(replicatedManifest.firstReplicatedAt);

  // Step 2: Verify replica on backup provider
  const verifyResult = await verifyBackupReplica(replicatedManifest, backupProvider);
  assert.equal(verifyResult.verified, true);
  assert.equal(verifyResult.record.replicationState, "VERIFIED");
  assert.equal(verifyResult.record.verificationStatus, "MATCHED");
  assert.ok(verifyResult.record.lastVerifiedAt);
  assert.ok(verifyResult.record.completedAt);

  // Verify object is indeed in backup provider
  const backupObj = await backupProvider.getObject({
    companyId,
    bucket: "engoryx-backblaze-backup",
    key,
  });
  assert.equal(backupObj.bytes.byteLength, bytes.byteLength);
});

test("Backup Verification: Rejects replica with mismatched byte size or corrupted SHA-256 digest", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const backupProvider = new MemoryStorageProvider();
  const key = `companies/${companyId}/invoices/manual/2026/09/corrupt-backup.pdf`;

  // Put 100 bytes in backup provider
  const badBytes = new TextEncoder().encode("Corrupted short content");
  await backupProvider.putObject({
    companyId,
    bucket: "engoryx-backblaze-backup",
    key,
    bytes: badBytes,
    contentType: "application/pdf",
  });

  const manifest = createPendingBackupRecord({
    companyId,
    documentId: "doc-corrupted-replica",
    sourceProvider: "s3",
    sourceBucket: "engoryx-production-documents",
    sourceKey: key,
    sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sizeBytes: 99999, // Expecting 99999 bytes
    replicaProvider: "b2",
    replicaBucket: "engoryx-backblaze-backup",
  });

  const verifyResult = await verifyBackupReplica(manifest, backupProvider);

  assert.equal(verifyResult.verified, false);
  assert.equal(verifyResult.record.replicationState, "FAILED");
  assert.equal(verifyResult.record.verificationStatus, "CORRUPTED");
  assert.ok(verifyResult.error?.includes("size mismatch"));
});

test("Backup Verification: Rejects replica if tenant company ID metadata is mismatched", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const otherCompanyId = "22222222-3333-4444-5555-666666666666";
  const backupProvider = new MemoryStorageProvider();
  const key = `companies/${otherCompanyId}/invoices/manual/2026/09/wrong-company.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 Wrong company content");

  const putResult = await backupProvider.putObject({
    companyId: otherCompanyId,
    bucket: "engoryx-backblaze-backup",
    key,
    bytes,
    contentType: "application/pdf",
  });

  const manifest = createPendingBackupRecord({
    companyId, // Requesting company 1
    documentId: "doc-cross-company",
    sourceProvider: "s3",
    sourceBucket: "engoryx-production-documents",
    sourceKey: key,
    sha256: putResult.ref.sha256!,
    sizeBytes: bytes.byteLength,
    replicaProvider: "b2",
    replicaBucket: "engoryx-backblaze-backup",
  });

  const verifyResult = await verifyBackupReplica(manifest, backupProvider);

  assert.equal(verifyResult.verified, false);
  assert.equal(verifyResult.record.replicationState, "FAILED");
});

test("Restore Drill: Successfully executes restore verification into test target and validates restored bytes", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const backupProvider = new MemoryStorageProvider();
  const restoreTargetProvider = new MemoryStorageProvider();

  const originalKey = `companies/${companyId}/invoices/manual/2026/09/inv-600.pdf`;
  const restoreTestKey = `companies/${companyId}/restore/test/2026/09/inv-600-restored.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 Genuine invoice bytes to restore drill");

  const putResult = await backupProvider.putObject({
    companyId,
    bucket: "engoryx-backblaze-backup",
    key: originalKey,
    bytes,
    contentType: "application/pdf",
  });

  const manifest = {
    ...createPendingBackupRecord({
      companyId,
      documentId: "doc-600",
      sourceProvider: "s3",
      sourceBucket: "engoryx-production-documents",
      sourceKey: originalKey,
      sha256: putResult.ref.sha256!,
      sizeBytes: bytes.byteLength,
      replicaProvider: "b2",
      replicaBucket: "engoryx-backblaze-backup",
    }),
    replicationState: "VERIFIED" as const,
    verificationStatus: "MATCHED" as const,
  };

  const drillResult = await executeRestoreVerification({
    manifest,
    backupProvider,
    restoreTargetProvider,
    restoreTargetKey: restoreTestKey,
  });

  assert.equal(drillResult.success, true);
  assert.equal(drillResult.restoredSha256, putResult.ref.sha256);
  assert.equal(drillResult.sizeBytes, bytes.byteLength);
  assert.equal(drillResult.restoreTargetKey, restoreTestKey);

  // Invariant: Target has verified restored object
  const restoredObj = await restoreTargetProvider.getObject({
    companyId,
    bucket: "engoryx-backblaze-backup",
    key: restoreTestKey,
  });
  assert.equal(restoredObj.bytes.byteLength, bytes.byteLength);
});

test("Restore Drill: Rejects restore attempt if target key lacks test/restore safety prefix", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const backupProvider = new MemoryStorageProvider();
  const restoreTargetProvider = new MemoryStorageProvider();

  const manifest = {
    ...createPendingBackupRecord({
      companyId,
      documentId: "doc-unsafe",
      sourceProvider: "s3",
      sourceBucket: "engoryx-production-documents",
      sourceKey: `companies/${companyId}/invoices/manual/test.pdf`,
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      sizeBytes: 0,
      replicaProvider: "b2",
      replicaBucket: "engoryx-backblaze-backup",
    }),
    replicationState: "VERIFIED" as const,
  };

  // Malicious / accidental attempt to overwrite production path directly
  await assert.rejects(
    executeRestoreVerification({
      manifest,
      backupProvider,
      restoreTargetProvider,
      restoreTargetKey: `companies/${companyId}/invoices/manual/production-live.pdf`,
    }),
    (err: any) => {
      assert.ok(err instanceof StorageError);
      assert.equal(err.code, "INVALID_RESTORE_TARGET");
      return true;
    },
  );
});

test("BackupService: End-to-end batch processing and restore drill via service instance", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const primaryStore = new MemoryStorageProvider();
  const backupStore = new MemoryStorageProvider();

  const key = `companies/${companyId}/invoices/manual/2026/09/inv-svc-1.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 BackupService integration bytes");

  const primaryPut = await primaryStore.putObject({
    companyId,
    bucket: "engoryx-production-documents",
    key,
    bytes,
    contentType: "application/pdf",
  });

  const dbReplicas: any[] = [];
  const mockSupabase: any = {
    from: (_table: string) => ({
      insert: (data: any) => ({
        select: () => ({
          single: async () => {
            const row = { id: `bak-${dbReplicas.length + 1}`, ...data };
            dbReplicas.push(row);
            return { data: row, error: null };
          },
        }),
      }),
      select: () => ({
        eq: (_col1: string, val1: any) => ({
          in: (_col2: string, states: string[]) => ({
            order: () => ({
              limit: async () => ({
                data: dbReplicas.filter((r) => r.company_id === val1 && states.includes(r.replication_state)),
                error: null,
              }),
            }),
          }),
          eq: (_col2: string, val2: any) => ({
            maybeSingle: async () => ({
              data: dbReplicas.find((r) => r.id === val1 && r.company_id === val2),
              error: null,
            }),
          }),
        }),
      }),
      update: (data: any) => ({
        eq: (_col1: string, val1: any) => ({
          eq: async () => {
            const item = dbReplicas.find((r) => r.id === val1);
            if (item) Object.assign(item, data);
            return { error: null };
          },
        }),
      }),
    }),
  };

  const backupService = new BackupService({
    supabaseClientSupplier: () => mockSupabase,
    primaryProviderSupplier: () => primaryStore,
    backupProviderSupplier: () => backupStore,
    providerSupplier: (id) => (id === "s3" ? primaryStore : backupStore),
  });

  // 1. Register backup intent
  const registered = await backupService.registerBackupIntent({
    companyId,
    documentId: "doc-svc-1",
    sourceProvider: "s3",
    sourceBucket: "engoryx-production-documents",
    sourceKey: key,
    sha256: primaryPut.ref.sha256!,
    sizeBytes: bytes.byteLength,
    replicaProvider: "b2",
    replicaBucket: "engoryx-backblaze-backup",
  });

  assert.ok(registered);
  assert.equal(dbReplicas.length, 1);

  // 2. Process pending replications
  const processSummary = await backupService.processPendingReplications(companyId, 10);
  assert.equal(processSummary.processed, 1);
  assert.equal(processSummary.verified, 1);
  assert.equal(dbReplicas[0].replication_state, "VERIFIED");
  assert.equal(dbReplicas[0].verification_status, "MATCHED");

  // 3. Run restore drill
  const restoreResult = await backupService.runRestoreDrill(
    companyId,
    dbReplicas[0].id,
    `companies/${companyId}/restore/test/inv-svc-1-restored.pdf`,
  );
  assert.equal(restoreResult.success, true);
  assert.equal(restoreResult.restoredSha256, primaryPut.ref.sha256);
});
