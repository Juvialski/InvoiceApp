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

test("Backup Configuration: Explicit S3/B2 provider requires complete endpoint, bucket, access key, and secret", () => {
  // 1. Missing bucket -> throws StorageConfigurationError
  assert.throws(
    () =>
      loadStorageConfig({
        STORAGE_BACKUP_PROVIDER: "s3",
        STORAGE_BACKUP_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
        STORAGE_BACKUP_ACCESS_KEY_ID: "key-123",
        STORAGE_BACKUP_SECRET_ACCESS_KEY: "secret-456",
      }),
    (err: any) => {
      assert.ok(err instanceof StorageConfigurationError);
      assert.ok(err.message.includes("Incomplete backup storage provider configuration"));
      return true;
    },
  );

  // 2. Missing secret key -> throws StorageConfigurationError
  assert.throws(
    () =>
      loadStorageConfig({
        STORAGE_BACKUP_PROVIDER: "b2",
        BACKBLAZE_B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
        BACKBLAZE_B2_BUCKET: "my-b2-bucket",
        BACKBLAZE_B2_ACCESS_KEY_ID: "key-123",
      }),
    (err: any) => {
      assert.ok(err instanceof StorageConfigurationError);
      assert.ok(err.message.includes("Incomplete backup storage provider configuration"));
      return true;
    },
  );

  // 3. No backup provider specified -> returns undefined backupProvider (cleanly disabled)
  const emptyConfig = loadStorageConfig({});
  assert.equal(emptyConfig.backupProvider, undefined);
  assert.equal(emptyConfig.backupS3, undefined);

  // 4. Complete B2 configuration -> loads successfully
  const validConfig = loadStorageConfig({
    STORAGE_BACKUP_PROVIDER: "b2",
    BACKBLAZE_B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
    BACKBLAZE_B2_BUCKET: "my-b2-bucket",
    BACKBLAZE_B2_ACCESS_KEY_ID: "key-123",
    BACKBLAZE_B2_SECRET_ACCESS_KEY: "secret-456",
  });
  assert.equal(validConfig.backupProvider, "s3");
  assert.equal(validConfig.backupS3?.bucket, "my-b2-bucket");
});

test("Backup Replication: Primary upload succeeds even if backup provider fails (asynchronous failure isolation)", () => {
  const backupError = new Error("Connection timed out to Backblaze B2");
  const isolationResult = assertBackupFailureIsolation(true, backupError);

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

test("Backup Replication: Restart safety - skips re-uploading if replica already exists and matches hash and size", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const docId = "doc-inv-restart";
  const primaryProvider = new MemoryStorageProvider();
  const backupProvider = new MemoryStorageProvider();
  const b2Bucket = "engoryx-company-a-b2-backup";

  const key = `companies/${companyId}/invoices/manual/2026/09/restart-doc.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 Restart safe backup document");

  const primaryPut = await primaryProvider.putObject({
    companyId,
    bucket: "engoryx-production-documents",
    key,
    bytes,
    contentType: "application/pdf",
  });

  // Pre-seed replica provider (simulating crash right after target upload before DB update)
  await backupProvider.putObject({
    companyId,
    bucket: b2Bucket,
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
    replicaBucket: b2Bucket,
  });

  // Retry replication: should detect existing replica and transition cleanly to VERIFYING
  const res = await replicateObjectToBackup(manifest, primaryProvider, backupProvider);
  assert.equal(res.replicationState, "VERIFYING");

  const verifyRes = await verifyBackupReplica(res, backupProvider);
  assert.equal(verifyRes.verified, true);
  assert.equal(verifyRes.record.replicationState, "VERIFIED");
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

test("Restore Drill: Explicit opt-in safety guards", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const backupService = new BackupService({
    supabaseClientSupplier: () => ({} as any),
  });

  // 1. Production + flag true -> rejected
  const prevEnv = process.env.NODE_ENV;
  const prevFlag = process.env.STORAGE_RESTORE_DRILLS_ENABLED;
  try {
    process.env.NODE_ENV = "production";
    process.env.STORAGE_RESTORE_DRILLS_ENABLED = "true";
    await assert.rejects(
      backupService.runRestoreDrill(companyId, "bak-1", `companies/${companyId}/restore/test/doc.pdf`),
      (err: any) => {
        assert.ok(err instanceof StorageError);
        assert.equal(err.code, "RESTORE_DRILLS_DISABLED");
        return true;
      },
    );

    // 2. Development + flag missing -> rejected
    process.env.NODE_ENV = "development";
    delete process.env.STORAGE_RESTORE_DRILLS_ENABLED;
    await assert.rejects(
      backupService.runRestoreDrill(companyId, "bak-1", `companies/${companyId}/restore/test/doc.pdf`),
      (err: any) => {
        assert.ok(err instanceof StorageError);
        assert.equal(err.code, "RESTORE_DRILLS_DISABLED");
        return true;
      },
    );

    // 3. Test + flag missing -> rejected
    process.env.NODE_ENV = "test";
    delete process.env.STORAGE_RESTORE_DRILLS_ENABLED;
    await assert.rejects(
      backupService.runRestoreDrill(companyId, "bak-1", `companies/${companyId}/restore/test/doc.pdf`),
      (err: any) => {
        assert.ok(err instanceof StorageError);
        assert.equal(err.code, "RESTORE_DRILLS_DISABLED");
        return true;
      },
    );

    // 4. Explicit false -> rejected
    process.env.STORAGE_RESTORE_DRILLS_ENABLED = "false";
    await assert.rejects(
      backupService.runRestoreDrill(companyId, "bak-1", `companies/${companyId}/restore/test/doc.pdf`),
      (err: any) => {
        assert.ok(err instanceof StorageError);
        assert.equal(err.code, "RESTORE_DRILLS_DISABLED");
        return true;
      },
    );
  } finally {
    process.env.NODE_ENV = prevEnv;
    process.env.STORAGE_RESTORE_DRILLS_ENABLED = prevFlag;
  }
});

test("Restore Drill: Successfully executes restore verification into test target when explicitly enabled", async () => {
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
    restoreTargetBucket: primaryRestoreBucket,
  });

  assert.equal(drillResult.success, true);
  assert.equal(drillResult.restoredSha256, putResult.ref.sha256);
  assert.equal(drillResult.sizeBytes, bytes.byteLength);
  assert.equal(drillResult.restoreTargetKey, restoreTestKey);

  const restoredObj = await restoreTargetProvider.getObject({
    companyId,
    bucket: primaryRestoreBucket,
    key: restoreTestKey,
  });
  assert.equal(restoredObj.bytes.byteLength, bytes.byteLength);
});

test("BackupService: Idempotency is destination-aware - reuses manifest for same bucket but creates new for new destination", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const sourceKey = `companies/${companyId}/invoices/manual/2026/09/doc-1.pdf`;
  const sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  const dbReplicas: any[] = [
    {
      id: "bak-existing-bucket-a",
      company_id: companyId,
      document_domain: "INVOICES",
      document_id: "doc-inv-1",
      source_provider: "s3",
      source_bucket: "invoice-originals",
      source_key: sourceKey,
      source_sha256: sha256,
      source_size_bytes: 100,
      replica_provider: "s3",
      replica_bucket: "engoryx-backup-bucket-a",
      replica_key: sourceKey,
      replication_state: "VERIFIED",
      verification_status: "MATCHED",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockSupabase: any = {
    from: (_table: string) => ({
      select: () => {
        const filters: Record<string, any> = {};
        const query: any = {
          eq(col: string, val: any) {
            filters[col] = val;
            return query;
          },
          neq(col: string, val: any) {
            filters[col + "_neq"] = val;
            return query;
          },
          in(col: string, vals: any[]) {
            filters[col + "_in"] = vals;
            return query;
          },
          or() {
            return query;
          },
          order() {
            return query;
          },
          async limit() {
            let list = [...dbReplicas];
            if (filters.company_id) list = list.filter((r) => r.company_id === filters.company_id);
            if (filters.source_provider) list = list.filter((r) => r.source_provider === filters.source_provider);
            if (filters.source_bucket) list = list.filter((r) => r.source_bucket === filters.source_bucket);
            if (filters.source_key) list = list.filter((r) => r.source_key === filters.source_key);
            if (filters.source_sha256) list = list.filter((r) => r.source_sha256 === filters.source_sha256);
            if (filters.replica_provider) list = list.filter((r) => r.replica_provider === filters.replica_provider);
            if (filters.replica_bucket) list = list.filter((r) => r.replica_bucket === filters.replica_bucket);
            if (filters.replica_key) list = list.filter((r) => r.replica_key === filters.replica_key);
            if (filters.replication_state_neq) list = list.filter((r) => r.replication_state !== filters.replication_state_neq);
            return { data: list, error: null };
          },
          then(resolve: any) {
            return query.limit().then(resolve);
          },
        };
        return query;
      },
      insert: (record: any) => ({
        select: () => ({
          single: async () => {
            const row = { id: `bak-new-${dbReplicas.length + 1}`, ...record, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            dbReplicas.push(row);
            return { data: row, error: null };
          },
        }),
      }),
    }),
  };


  const backupService = new BackupService({
    supabaseClientSupplier: () => mockSupabase,
  });

  // 1. Same source + same destination bucket A -> reuses existing manifest
  const res1 = await backupService.registerBackupIntent({
    companyId,
    documentDomain: "INVOICES",
    documentId: "doc-inv-1",
    sourceProvider: "s3",
    sourceBucket: "invoice-originals",
    sourceKey,
    sha256,
    sizeBytes: 100,
    replicaProvider: "s3",
    replicaBucket: "engoryx-backup-bucket-a",
  });
  assert.equal(res1?.id, "bak-existing-bucket-a");

  // 2. Same source + new destination bucket B -> creates new manifest
  const res2 = await backupService.registerBackupIntent({
    companyId,
    documentDomain: "INVOICES",
    documentId: "doc-inv-1",
    sourceProvider: "s3",
    sourceBucket: "invoice-originals",
    sourceKey,
    sha256,
    sizeBytes: 100,
    replicaProvider: "s3",
    replicaBucket: "engoryx-backup-bucket-b",
  });
  assert.ok(res2?.id);
  assert.notEqual(res2?.id, "bak-existing-bucket-a");
  assert.equal(res2?.replicaBucket, "engoryx-backup-bucket-b");
});

test("BackupService: Concurrency - atomic claim allows only one concurrent processor to replicate", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const sourceStore = new MemoryStorageProvider();
  const backupStore = new MemoryStorageProvider();
  const key = `companies/${companyId}/invoices/manual/2026/09/concurrency-doc.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 Concurrent backup test");

  const putRes = await sourceStore.putObject({
    companyId,
    bucket: "invoice-originals",
    key,
    bytes,
    contentType: "application/pdf",
  });

  const manifestRecord: any = {
    id: "bak-concurrent-1",
    company_id: companyId,
    document_domain: "INVOICES",
    document_id: "doc-conc-1",
    source_provider: "s3",
    source_bucket: "invoice-originals",
    source_key: key,
    source_sha256: putRes.ref.sha256,
    source_size_bytes: bytes.byteLength,
    replica_provider: "s3",
    replica_bucket: "engoryx-backups",
    replica_key: key,
    replication_state: "PENDING",
    verification_status: "UNVERIFIED",
    attempts: 0,
    max_attempts: 5,
  };

  let claimAttempts = 0;
  const mockSupabase: any = {
    from: (_table: string) => ({
      update: (data: any) => ({
        eq: (_col1: string, _val1: any) => ({
          eq: (_col2: string, _val2: any) => ({
            or: (_filterStr: string) => ({
              select: async () => {
                claimAttempts += 1;
                if (claimAttempts === 1) {
                  // First worker successfully claims row
                  Object.assign(manifestRecord, data);
                  return { data: [{ ...manifestRecord }], error: null };
                }
                // Second concurrent worker gets 0 rows (already claimed)
                return { data: [], error: null };
              },
            }),
          }),
        }),
      }),
    }),
  };

  const backupService = new BackupService({
    supabaseClientSupplier: () => mockSupabase,
    primaryProviderSupplier: () => sourceStore,
    backupProviderSupplier: () => backupStore,
    providerSupplier: () => sourceStore,
  });

  const manifest = {
    id: manifestRecord.id,
    companyId: manifestRecord.company_id,
    documentDomain: "INVOICES" as const,
    documentId: manifestRecord.document_id,
    sourceProvider: "s3" as const,
    sourceBucket: manifestRecord.source_bucket,
    sourceKey: manifestRecord.source_key,
    sha256: manifestRecord.source_sha256,
    sizeBytes: manifestRecord.source_size_bytes,
    replicaProvider: "s3" as const,
    replicaBucket: manifestRecord.replica_bucket,
    replicaKey: manifestRecord.replica_key,
    replicationState: "PENDING" as const,
    verificationStatus: "UNVERIFIED" as const,
    attempts: 0,
    maxAttempts: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Run two concurrent replication calls
  const [worker1Result, worker2Result] = await Promise.all([
    backupService.replicateAndVerifyManifest(manifest),
    backupService.replicateAndVerifyManifest(manifest),
  ]);

  // One worker successfully claimed and completed
  assert.equal(worker1Result.replicationState, "VERIFIED");
  // Second worker skipped because atomic claim returned no rows
  assert.equal(worker2Result.replicationState, "PENDING");
});
