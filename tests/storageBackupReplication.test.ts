import test from "node:test";
import assert from "node:assert/strict";
import {
  assertBackupFailureIsolation,
  createPendingBackupRecord,
  executeRestoreVerification,
  replicateObjectToBackup,
  verifyBackupReplica,
  loadStorageConfig,
  MemoryStorageProvider,
  StorageIntegrityError,
  StorageError,
  StorageConfigurationError,
} from "../src/lib/storage/index.ts";
import { BackupService } from "../src/server/storage/backupService.ts";

test("Backup Configuration: Supabase Storage is rejected as an independent backup provider", () => {
  assert.throws(
    () => loadStorageConfig({ STORAGE_BACKUP_PROVIDER: "supabase" }),
    (err: any) => {
      assert.ok(err instanceof StorageConfigurationError);
      assert.ok(err.message.includes("Supabase Storage cannot be used as an independent backup provider"));
      return true;
    },
  );
});

test("Backup Replication: Primary upload succeeds even if backup provider fails (asynchronous failure isolation)", () => {
  const backupError = new Error("Connection timed out to Backblaze B2");
  const isolationResult = assertBackupFailureIsolation(true, backupError);

  // Invariant: Primary write status is COMMITTED regardless of backup provider error
  assert.equal(isolationResult.primaryStatus, "COMMITTED");
  assert.equal(isolationResult.backupLogged, true);
});

test("Backup Replication: Replicates object to configured B2 bucket and verifies successfully", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const docId = "doc-invoice-500";
  const primaryProvider = new MemoryStorageProvider();
  const backupProvider = new MemoryStorageProvider();
  const configuredB2Bucket = "engoryx-company-a-b2-backup";

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
    replicaProvider: "s3",
    replicaBucket: configuredB2Bucket,
  });

  assert.equal(manifest.replicationState, "PENDING");
  assert.equal(manifest.verificationStatus, "UNVERIFIED");
  assert.equal(manifest.replicaBucket, configuredB2Bucket);

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

  // Verify object is in the exact configured B2 bucket
  const backupObj = await backupProvider.getObject({
    companyId,
    bucket: configuredB2Bucket,
    key,
  });
  assert.equal(backupObj.bytes.byteLength, bytes.byteLength);
});

test("Backup Verification: Rejects replica with mismatched byte size or corrupted SHA-256 digest", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const backupProvider = new MemoryStorageProvider();
  const key = `companies/${companyId}/invoices/manual/2026/09/corrupt-backup.pdf`;

  const badBytes = new TextEncoder().encode("Corrupted short content");
  await backupProvider.putObject({
    companyId,
    bucket: "engoryx-company-a-b2-backup",
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
    replicaProvider: "s3",
    replicaBucket: "engoryx-company-a-b2-backup",
  });

  const verifyResult = await verifyBackupReplica(manifest, backupProvider);

  assert.equal(verifyResult.verified, false);
  assert.equal(verifyResult.record.replicationState, "FAILED");
  assert.equal(verifyResult.record.verificationStatus, "CORRUPTED");
  assert.ok(verifyResult.error?.includes("size mismatch"));
});

test("Restore Drill: Rejected in production environment (NODE_ENV === 'production')", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const backupService = new BackupService({
    supabaseClientSupplier: () => ({} as any),
  });

  const prevEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    await assert.rejects(
      backupService.runRestoreDrill(companyId, "bak-1", `companies/${companyId}/restore/test/doc.pdf`),
      (err: any) => {
        assert.ok(err instanceof StorageError);
        assert.equal(err.code, "RESTORE_FORBIDDEN_IN_PRODUCTION");
        return true;
      },
    );
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});

test("Restore Drill: Successfully executes restore verification into test target using configured restore bucket", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const backupProvider = new MemoryStorageProvider();
  const restoreTargetProvider = new MemoryStorageProvider();
  const b2Bucket = "engoryx-company-a-b2-backup";
  const primaryRestoreBucket = "engoryx-production-documents";

  const originalKey = `companies/${companyId}/invoices/manual/2026/09/inv-600.pdf`;
  const restoreTestKey = `companies/${companyId}/restore/test/2026/09/inv-600-restored.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 Genuine invoice bytes to restore drill");

  const putResult = await backupProvider.putObject({
    companyId,
    bucket: b2Bucket,
    key: originalKey,
    bytes,
    contentType: "application/pdf",
  });

  const manifest = {
    ...createPendingBackupRecord({
      companyId,
      documentId: "doc-600",
      sourceProvider: "s3",
      sourceBucket: primaryRestoreBucket,
      sourceKey: originalKey,
      sha256: putResult.ref.sha256!,
      sizeBytes: bytes.byteLength,
      replicaProvider: "s3" as const,
      replicaBucket: b2Bucket,
    }),
    replicationState: "VERIFIED" as const,
    verificationStatus: "MATCHED" as const,
  };

  const drillResult = await executeRestoreVerification({
    manifest,
    backupProvider,
    restoreTargetProvider,
    restoreTargetKey: restoreTestKey,
    restoreTargetBucket: primaryRestoreBucket, // Uses primary restore bucket, NOT B2 bucket!
  });

  assert.equal(drillResult.success, true);
  assert.equal(drillResult.restoredSha256, putResult.ref.sha256);
  assert.equal(drillResult.sizeBytes, bytes.byteLength);
  assert.equal(drillResult.restoreTargetKey, restoreTestKey);

  // Invariant: Target has verified restored object in the primary bucket
  const restoredObj = await restoreTargetProvider.getObject({
    companyId,
    bucket: primaryRestoreBucket,
    key: restoreTestKey,
  });
  assert.equal(restoredObj.bytes.byteLength, bytes.byteLength);
});

test("BackupService: Idempotent registration returns existing active manifest", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const dbReplicas: any[] = [
    {
      id: "bak-existing-1",
      company_id: companyId,
      document_domain: "INVOICES",
      document_id: "doc-inv-1",
      source_provider: "s3",
      source_bucket: "invoice-originals",
      source_key: "key-1",
      source_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      source_size_bytes: 100,
      replica_provider: "s3",
      replica_bucket: "engoryx-company-a-b2-backup",
      replica_key: "key-1",
      replication_state: "VERIFIED",
      verification_status: "MATCHED",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockSupabase: any = {
    from: (_table: string) => ({
      select: () => ({
        eq: (_col1: string, val1: any) => ({
          eq: (_col2: string, val2: any) => ({
            eq: (_col3: string, val3: any) => ({
              neq: () => ({
                limit: async () => ({
                  data: dbReplicas.filter((r) => r.company_id === val1 && r.document_domain === val2 && r.document_id === val3),
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  };

  const backupService = new BackupService({
    supabaseClientSupplier: () => mockSupabase,
  });

  const res = await backupService.registerBackupIntent({
    companyId,
    documentDomain: "INVOICES",
    documentId: "doc-inv-1",
    sourceProvider: "s3",
    sourceBucket: "invoice-originals",
    sourceKey: "key-1",
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    sizeBytes: 100,
    replicaProvider: "s3",
    replicaBucket: "engoryx-company-a-b2-backup",
  });

  assert.ok(res);
  assert.equal(res.id, "bak-existing-1");
  assert.equal(res.replicationState, "VERIFIED");
});
