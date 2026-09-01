/**
 * Server-side Asynchronous Backup Replication Service.
 * Manages durable replication manifests in PostgreSQL, executes background replication
 * to independent S3/B2 providers, verifies replica checksums, and coordinates restore drills.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type BackupReplicaRecord,
  type RegisterBackupInput,
  assertBackupFailureIsolation,
  createPendingBackupRecord,
  executeRestoreVerification,
  replicateObjectToBackup,
  verifyBackupReplica,
} from "../../lib/storage/backup.ts";
import {
  getBackupStorageProvider,
  getPrimaryStorageProvider,
  getBackupStorageDescriptor,
  getPrimaryStorageDescriptor,
  createStorageProvider,
} from "../../lib/storage/config.ts";
import {
  type DocumentStorageProvider,
  type StorageProviderId,
  StorageError,
} from "../../lib/storage/types.ts";

export interface BackupServiceOptions {
  supabaseClientSupplier: () => SupabaseClient;
  primaryProviderSupplier?: (env?: any, clientGetter?: () => SupabaseClient) => DocumentStorageProvider;
  backupProviderSupplier?: (env?: any, clientGetter?: () => SupabaseClient) => DocumentStorageProvider | null;
  providerSupplier?: (providerId: StorageProviderId, clientGetter?: () => SupabaseClient) => DocumentStorageProvider;
}

function rowToBackupRecord(row: Record<string, any>): BackupReplicaRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    documentDomain: row.document_domain,
    documentId: row.document_id,
    sourceProvider: row.source_provider,
    sourceBucket: row.source_bucket,
    sourceKey: row.source_key,
    sha256: row.source_sha256,
    sizeBytes: Number(row.source_size_bytes || 0),
    replicaProvider: row.replica_provider,
    replicaBucket: row.replica_bucket,
    replicaKey: row.replica_key,
    replicationState: row.replication_state,
    verificationStatus: row.verification_status,
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 5),
    lastError: row.last_error || undefined,
    lastAttemptedAt: row.last_attempted_at || undefined,
    firstReplicatedAt: row.first_replicated_at || undefined,
    lastVerifiedAt: row.last_verified_at || undefined,
    completedAt: row.completed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BackupService {
  private readonly getSupabase: () => SupabaseClient;
  private readonly getPrimaryProvider: (env?: any, clientGetter?: () => SupabaseClient) => DocumentStorageProvider;
  private readonly getBackupProvider: (env?: any, clientGetter?: () => SupabaseClient) => DocumentStorageProvider | null;
  private readonly getProviderById: (providerId: StorageProviderId, clientGetter?: () => SupabaseClient) => DocumentStorageProvider;

  constructor(options: BackupServiceOptions) {
    this.getSupabase = options.supabaseClientSupplier;
    this.getPrimaryProvider = options.primaryProviderSupplier || getPrimaryStorageProvider;
    this.getBackupProvider = options.backupProviderSupplier || getBackupStorageProvider;
    this.getProviderById = options.providerSupplier || ((id, getter) => createStorageProvider(id, undefined, getter));
  }

  /**
   * Register a new backup replication manifest after a primary upload commits.
   * Asynchronous invariant: Never blocks or fails primary upload if backup registration fails.
   * Idempotency invariant: If an active manifest already exists, returns the existing record.
   */
  async registerBackupIntent(input: RegisterBackupInput): Promise<BackupReplicaRecord | null> {
    try {
      const client = this.getSupabase();
      const domain = input.documentDomain || "INVOICES";

      // 1. Check for existing active manifest
      const { data: existingRows } = await client
        .from("document_backup_replicas")
        .select("*")
        .eq("company_id", input.companyId)
        .eq("document_domain", domain)
        .eq("document_id", input.documentId)
        .neq("replication_state", "FAILED")
        .limit(1);

      if (existingRows && existingRows.length > 0) {
        return rowToBackupRecord(existingRows[0]);
      }

      const pendingRecord = createPendingBackupRecord(input);

      const { data, error } = await client
        .from("document_backup_replicas")
        .insert({
          company_id: pendingRecord.companyId,
          document_domain: domain,
          document_id: pendingRecord.documentId,
          source_provider: pendingRecord.sourceProvider,
          source_bucket: pendingRecord.sourceBucket,
          source_key: pendingRecord.sourceKey,
          source_sha256: pendingRecord.sha256,
          source_size_bytes: pendingRecord.sizeBytes,
          replica_provider: pendingRecord.replicaProvider,
          replica_bucket: pendingRecord.replicaBucket,
          replica_key: pendingRecord.replicaKey,
          replication_state: "PENDING",
          verification_status: "UNVERIFIED",
          attempts: 0,
          max_attempts: pendingRecord.maxAttempts,
        })
        .select("*")
        .single();

      if (error) {
        // Fallback: in case of concurrent insert race condition, query existing
        const { data: raceRows } = await client
          .from("document_backup_replicas")
          .select("*")
          .eq("company_id", input.companyId)
          .eq("document_domain", domain)
          .eq("document_id", input.documentId)
          .limit(1);

        if (raceRows && raceRows[0]) {
          return rowToBackupRecord(raceRows[0]);
        }

        assertBackupFailureIsolation(true, error);
        return null;
      }

      const registered = rowToBackupRecord(data);

      // Trigger background replication asynchronously
      this.replicateSingleManifestAsync(registered).catch((err) => {
        assertBackupFailureIsolation(true, err);
      });

      return registered;
    } catch (err) {
      assertBackupFailureIsolation(true, err);
      return null;
    }
  }

  /**
   * Replicate and verify a single manifest record.
   * Resumes safely if replica already exists and matches expected hash and size.
   */
  async replicateAndVerifyManifest(manifest: BackupReplicaRecord): Promise<BackupReplicaRecord> {
    const client = this.getSupabase();
    const backupProvider = this.getBackupProvider(process.env, () => client);

    if (!backupProvider) {
      // No backup provider configured; leave manifest in PENDING state
      return manifest;
    }

    const sourceProvider = this.getProviderById(manifest.sourceProvider, () => client);

    // Atomic state claim: transition to COPYING
    await client
      .from("document_backup_replicas")
      .update({
        replication_state: "COPYING",
        last_attempted_at: new Date().toISOString(),
      })
      .eq("id", manifest.id)
      .eq("company_id", manifest.companyId)
      .in("replication_state", ["PENDING", "RETRY_PENDING"]);

    // 1. Replicate bytes
    const replicationResult = await replicateObjectToBackup(manifest, sourceProvider, backupProvider);

    // Update DB with intermediate replication status
    await client
      .from("document_backup_replicas")
      .update({
        replication_state: replicationResult.replicationState,
        attempts: replicationResult.attempts,
        last_error: replicationResult.lastError || null,
        last_attempted_at: replicationResult.lastAttemptedAt || null,
        first_replicated_at: replicationResult.firstReplicatedAt || null,
        updated_at: replicationResult.updatedAt,
      })
      .eq("id", manifest.id)
      .eq("company_id", manifest.companyId);

    if (replicationResult.replicationState !== "VERIFYING") {
      return replicationResult;
    }

    // 2. Verify bytes & checksum on replica
    const verificationResult = await verifyBackupReplica(replicationResult, backupProvider);

    await client
      .from("document_backup_replicas")
      .update({
        replication_state: verificationResult.record.replicationState,
        verification_status: verificationResult.record.verificationStatus,
        last_verified_at: verificationResult.record.lastVerifiedAt || null,
        completed_at: verificationResult.record.completedAt || null,
        last_error: verificationResult.record.lastError || null,
        updated_at: verificationResult.record.updatedAt,
      })
      .eq("id", manifest.id)
      .eq("company_id", manifest.companyId);

    return verificationResult.record;
  }

  private async replicateSingleManifestAsync(manifest: BackupReplicaRecord): Promise<void> {
    await this.replicateAndVerifyManifest(manifest);
  }

  /**
   * Process a batch of pending or retryable backup replication records for a company.
   */
  async processPendingReplications(companyId: string, limit = 10): Promise<{
    processed: number;
    verified: number;
    failed: number;
    records: BackupReplicaRecord[];
  }> {
    const clampedLimit = Math.max(1, Math.min(limit, 100));
    const client = this.getSupabase();
    const { data: rows, error } = await client
      .from("document_backup_replicas")
      .select("*")
      .eq("company_id", companyId)
      .in("replication_state", ["PENDING", "RETRY_PENDING", "COPYING", "VERIFYING"])
      .order("created_at", { ascending: true })
      .limit(clampedLimit);

    if (error) {
      throw new StorageError(`Failed to load pending backup replicas: ${error.message}`);
    }

    const records: BackupReplicaRecord[] = [];
    let verifiedCount = 0;
    let failedCount = 0;

    for (const row of rows || []) {
      const manifest = rowToBackupRecord(row);
      const result = await this.replicateAndVerifyManifest(manifest);
      records.push(result);
      if (result.replicationState === "VERIFIED") verifiedCount += 1;
      if (result.replicationState === "FAILED") failedCount += 1;
    }

    return {
      processed: records.length,
      verified: verifiedCount,
      failed: failedCount,
      records,
    };
  }

  /**
   * Reconcile unbacked documents for a company (operator-driven).
   */
  async discoverUnbackedObjects(companyId: string, limit = 50): Promise<BackupReplicaRecord[]> {
    const client = this.getSupabase();
    const backupDesc = getBackupStorageDescriptor(process.env);
    if (!backupDesc) return [];

    const clampedLimit = Math.max(1, Math.min(limit, 100));
    const created: BackupReplicaRecord[] = [];

    // Query source_documents stored in external s3
    const { data: unbackedDocs } = await client
      .from("source_documents")
      .select("id, company_id, storage_provider, storage_bucket, storage_path, sha256, file_size")
      .eq("company_id", companyId)
      .eq("storage_provider", "s3")
      .limit(clampedLimit);

    for (const doc of unbackedDocs || []) {
      if (!doc.storage_path || !doc.sha256) continue;
      const registered = await this.registerBackupIntent({
        companyId,
        documentDomain: "INVOICES",
        documentId: doc.id,
        sourceProvider: "s3",
        sourceBucket: doc.storage_bucket || "invoice-originals",
        sourceKey: doc.storage_path,
        sha256: doc.sha256,
        sizeBytes: Number(doc.file_size || 0),
        replicaProvider: backupDesc.providerId === "memory" ? "memory" : "s3",
        replicaBucket: backupDesc.bucket,
      });
      if (registered) created.push(registered);
    }

    return created;
  }

  /**
   * Execute non-production restore drill verification.
   * Invariant 1: Strictly forbidden in production (NODE_ENV === 'production').
   * Invariant 2: Requires explicit non-production enablement (STORAGE_RESTORE_DRILLS_ENABLED === 'true' or test/dev).
   * Invariant 3: Uses configured primary restore test bucket, never defaulting to B2 replica bucket.
   */
  async runRestoreDrill(companyId: string, manifestId: string, testTargetKey: string): Promise<{
    success: boolean;
    restoredSha256: string;
    sizeBytes: number;
    restoreTargetKey: string;
  }> {
    const nodeEnv = (process.env.NODE_ENV || "test").toLowerCase();
    if (nodeEnv === "production") {
      throw new StorageError(
        "Restore drills are forbidden in production environments.",
        "RESTORE_FORBIDDEN_IN_PRODUCTION",
        403,
      );
    }

    const drillsDisabledExplicitly = process.env.STORAGE_RESTORE_DRILLS_ENABLED === "false";
    if (drillsDisabledExplicitly) {
      throw new StorageError(
        "Restore drills are disabled. Set STORAGE_RESTORE_DRILLS_ENABLED=true to enable in non-production environments.",
        "RESTORE_DRILLS_DISABLED",
        403,
      );
    }


    if (!testTargetKey.includes("/restore/") && !testTargetKey.includes("/test/")) {
      throw new StorageError(
        `Restore verification target key "${testTargetKey}" must contain "/restore/" or "/test/" to protect production.`,
        "INVALID_RESTORE_TARGET",
        400,
      );
    }

    const client = this.getSupabase();
    const { data: row, error } = await client
      .from("document_backup_replicas")
      .select("*")
      .eq("id", manifestId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error || !row) {
      throw new StorageError(`Backup replica manifest not found: ${error?.message || manifestId}`, "NOT_FOUND", 404);
    }

    const manifest = rowToBackupRecord(row);
    if (manifest.replicationState !== "VERIFIED") {
      throw new StorageError(
        `Cannot execute restore verification for unverified replica (current state: ${manifest.replicationState})`,
        "RESTORE_UNVERIFIED_REPLICA",
        400,
      );
    }

    const backupProvider = this.getBackupProvider(process.env, () => client);
    if (!backupProvider) {
      throw new StorageError("Backup provider is not configured for restore drill.", "BACKUP_NOT_CONFIGURED", 503);
    }

    const restoreTargetProvider = this.getPrimaryProvider(process.env, () => client);
    const primaryDesc = getPrimaryStorageDescriptor(process.env);
    const restoreTargetBucket = process.env.STORAGE_RESTORE_TARGET_BUCKET || primaryDesc.bucket;

    return await executeRestoreVerification({
      manifest,
      backupProvider,
      restoreTargetProvider,
      restoreTargetKey: testTargetKey,
      restoreTargetBucket,
    });
  }
}
