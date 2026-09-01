/**
 * Server-side Asynchronous Backup Replication Service.
 * Manages durable replication manifests in PostgreSQL, executes background replication
 * to independent S3/B2 providers, verifies replica checksums, and coordinates restore drills.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type BackupReplicaRecord,
  type RegisterBackupInput,
  type BackupDocumentDomain,
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
import { isCompanyScopedPath } from "../../lib/storage/keys.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/i;
export const STALE_BACKUP_LEASE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes


export interface BackupServiceOptions {
  supabaseClientSupplier: () => SupabaseClient;
  privilegedClientSupplier?: () => SupabaseClient;
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
  private readonly getPrivilegedSupabase: () => SupabaseClient;
  private readonly getPrimaryProvider: (env?: any, clientGetter?: () => SupabaseClient) => DocumentStorageProvider;
  private readonly getBackupProvider: (env?: any, clientGetter?: () => SupabaseClient) => DocumentStorageProvider | null;
  private readonly getProviderById: (providerId: StorageProviderId, clientGetter?: () => SupabaseClient) => DocumentStorageProvider;

  constructor(options: BackupServiceOptions) {
    this.getSupabase = options.supabaseClientSupplier;
    this.getPrivilegedSupabase = options.privilegedClientSupplier || options.supabaseClientSupplier;
    this.getPrimaryProvider = options.primaryProviderSupplier || getPrimaryStorageProvider;
    this.getBackupProvider = options.backupProviderSupplier || getBackupStorageProvider;
    this.getProviderById = options.providerSupplier || ((id, getter) => createStorageProvider(id, undefined, getter));
  }

  /**
   * Register a new backup replication manifest after a primary upload commits.
   * Internal server authority invariant: Uses privileged client for manifest persistence so non-admin
   * business users (e.g. invoice/finance roles) safely record backup intent without needing storage.manage.
   * Idempotency invariant: Destination-aware lookup matches existing active manifest for the specific target bucket.
   */
  async registerBackupIntent(input: RegisterBackupInput): Promise<BackupReplicaRecord | null> {
    try {
      if (!input.companyId || !UUID_PATTERN.test(input.companyId)) {
        throw new StorageError(`Invalid company context for backup registration: "${input.companyId}"`);
      }
      if (!isCompanyScopedPath(input.sourceKey, input.companyId)) {
        throw new StorageError(`Backup source key "${input.sourceKey}" violates company boundary for "${input.companyId}".`);
      }
      if (!input.sha256 || !SHA256_HEX_REGEX.test(input.sha256)) {
        throw new StorageError(`Invalid SHA-256 hash for backup registration: "${input.sha256}"`);
      }

      const client = this.getPrivilegedSupabase();
      const domain: BackupDocumentDomain = input.documentDomain || "INVOICES";
      const replicaKey = input.replicaKey || input.sourceKey;

      // 1. Destination-aware idempotency lookup
      const { data: existingRows } = await client
        .from("document_backup_replicas")
        .select("*")
        .eq("company_id", input.companyId)
        .eq("source_provider", input.sourceProvider)
        .eq("source_bucket", input.sourceBucket)
        .eq("source_key", input.sourceKey)
        .eq("source_sha256", input.sha256.toLowerCase())
        .eq("replica_provider", input.replicaProvider)
        .eq("replica_bucket", input.replicaBucket)
        .eq("replica_key", replicaKey)
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
          .eq("source_key", input.sourceKey)
          .eq("replica_bucket", input.replicaBucket)
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
   * Atomic Claim Invariant: Only continues if atomic claim update successfully returns the claimed row.
   * Restart Safety Invariant: If replica bytes already exist on backup provider and match hash/size, skips re-upload.
   */
  async replicateAndVerifyManifest(manifest: BackupReplicaRecord): Promise<BackupReplicaRecord> {
    const client = this.getSupabase();
    const backupProvider = this.getBackupProvider(process.env, () => client);

    if (!backupProvider) {
      // No backup provider configured; leave manifest in PENDING state
      return manifest;
    }

    const now = new Date().toISOString();
    const staleThreshold = new Date(Date.now() - STALE_BACKUP_LEASE_TIMEOUT_MS).toISOString();

    // Atomic claim: Transition to COPYING and only continue if exactly one row was returned
    let updateQuery: any = client
      .from("document_backup_replicas")
      .update({
        replication_state: "COPYING",
        last_attempted_at: now,
        attempts: manifest.attempts + 1,
        updated_at: now,
      })
      .eq("id", manifest.id)
      .eq("company_id", manifest.companyId);

    if (typeof updateQuery.or === "function") {
      updateQuery = updateQuery.or(`replication_state.in.(PENDING,RETRY_PENDING),last_attempted_at.is.null,last_attempted_at.lt.${staleThreshold}`);
    } else if (typeof updateQuery.in === "function") {
      updateQuery = updateQuery.in("replication_state", ["PENDING", "RETRY_PENDING", "COPYING", "VERIFYING"]);
    }

    const { data: claimedRows, error: claimError } = await updateQuery.select("*");

    if (claimError || !claimedRows || claimedRows.length === 0) {
      // Another worker claimed this row or active lease is still valid; skip processing
      return manifest;
    }

    const activeManifest = rowToBackupRecord(claimedRows[0]);
    const sourceProvider = this.getProviderById(activeManifest.sourceProvider, () => client);

    // 1. Replicate bytes (restart-safe inside replicateObjectToBackup)
    const replicationResult = await replicateObjectToBackup(activeManifest, sourceProvider, backupProvider);

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
      .eq("id", activeManifest.id)
      .eq("company_id", activeManifest.companyId);

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
      .eq("id", activeManifest.id)
      .eq("company_id", activeManifest.companyId);

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
    const staleThreshold = new Date(Date.now() - STALE_BACKUP_LEASE_TIMEOUT_MS).toISOString();

    let query: any = client
      .from("document_backup_replicas")
      .select("*")
      .eq("company_id", companyId);

    if (typeof query.or === "function") {
      query = query.or(`replication_state.in.(PENDING,RETRY_PENDING),last_attempted_at.is.null,last_attempted_at.lt.${staleThreshold}`);
    } else if (typeof query.in === "function") {
      query = query.in("replication_state", ["PENDING", "RETRY_PENDING", "COPYING", "VERIFYING"]);
    }

    const { data: rows, error } = await query
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
   * Reconcile unbacked primary documents for a company (operator-driven).
   * Discovers primary objects in source_documents, engineering_document_revisions, and payroll_import_batches
   * that do not yet have an active backup replica for the CURRENT configured backup destination.
   */
  async discoverUnbackedObjects(companyId: string, limit = 50): Promise<BackupReplicaRecord[]> {
    const client = this.getSupabase();
    const backupDesc = getBackupStorageDescriptor(process.env);
    if (!backupDesc) return [];

    const clampedLimit = Math.max(1, Math.min(limit, 100));
    const created: BackupReplicaRecord[] = [];

    // 1. Discover unbacked source_documents stored in external S3
    const { data: unbackedDocs } = await client
      .from("source_documents")
      .select("id, company_id, source_type, document_type, email_message_id, gmail_attachment_id, storage_provider, storage_bucket, storage_path, sha256, file_size")
      .eq("company_id", companyId)
      .eq("storage_provider", "s3")
      .limit(clampedLimit);

    for (const doc of unbackedDocs || []) {
      if (!doc.storage_path || !doc.sha256) continue;

      // Accurate domain provenance classification:
      let domain: BackupDocumentDomain = "SOURCE_DOCUMENTS";
      if (doc.email_message_id || doc.gmail_attachment_id || doc.source_type === "EMAIL") {
        domain = "EMAIL_INTAKE";
      } else if (doc.source_type === "UPLOAD" && doc.document_type === "INVOICE") {
        domain = "INVOICES";
      } else if (doc.source_type === "BANK_IMPORT" || doc.document_type === "BANK_STATEMENT") {
        domain = "CASH_BANKING";
      }

      const registered = await this.registerBackupIntent({
        companyId,
        documentDomain: domain,
        documentId: doc.id,
        sourceProvider: "s3",
        sourceBucket: doc.storage_bucket || "invoice-originals",
        sourceKey: doc.storage_path,
        sha256: doc.sha256,
        sizeBytes: Number(doc.file_size || 0),
        replicaProvider: "s3",
        replicaBucket: backupDesc.bucket,
      });
      if (registered) created.push(registered);
    }

    // 2. Discover unbacked engineering revisions in external S3
    const { data: unbackedEng } = await client
      .from("engineering_document_revisions")
      .select("id, company_id, file_path, storage_provider, storage_bucket, file_fingerprint, file_size_bytes")
      .eq("company_id", companyId)
      .eq("storage_provider", "s3")
      .limit(clampedLimit);

    for (const rev of unbackedEng || []) {
      if (!rev.file_path || !rev.file_fingerprint) continue;
      const rawSha = rev.file_fingerprint.replace(/^sha256:/i, "");
      const registered = await this.registerBackupIntent({
        companyId,
        documentDomain: "ENGINEERING",
        documentId: rev.id,
        sourceProvider: "s3",
        sourceBucket: rev.storage_bucket || "engineering-documents",
        sourceKey: rev.file_path,
        sha256: rawSha,
        sizeBytes: Number(rev.file_size_bytes || 0),
        replicaProvider: "s3",
        replicaBucket: backupDesc.bucket,
      });
      if (registered) created.push(registered);
    }

    // 3. Discover unbacked payroll import batches in external S3
    const { data: unbackedPayroll } = await client
      .from("payroll_import_batches")
      .select("id, company_id, storage_path, storage_provider, storage_bucket, file_sha256, file_size")
      .eq("company_id", companyId)
      .eq("storage_provider", "s3")
      .limit(clampedLimit);

    for (const batch of unbackedPayroll || []) {
      if (!batch.storage_path || !batch.file_sha256) continue;
      const registered = await this.registerBackupIntent({
        companyId,
        documentDomain: "PAYROLL",
        documentId: batch.id,
        sourceProvider: "s3",
        sourceBucket: batch.storage_bucket || "payroll-import-sources",
        sourceKey: batch.storage_path,
        sha256: batch.file_sha256,
        sizeBytes: Number(batch.file_size || 0),
        replicaProvider: "s3",
        replicaBucket: backupDesc.bucket,
      });
      if (registered) created.push(registered);
    }

    return created;
  }

  /**
   * Execute non-production restore drill verification.
   * Invariant 1: Strictly requires NODE_ENV !== 'production' AND STORAGE_RESTORE_DRILLS_ENABLED === 'true'.
   * Invariant 2: Missing NODE_ENV fails closed unless explicit STORAGE_RESTORE_DRILLS_ENABLED === 'true'.
   * Invariant 3: Uses configured primary restore test bucket, never defaulting to B2 replica bucket.
   */
  async runRestoreDrill(companyId: string, manifestId: string, testTargetKey: string): Promise<{
    success: boolean;
    restoredSha256: string;
    sizeBytes: number;
    restoreTargetKey: string;
  }> {
    const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
    const isProd = nodeEnv === "production";
    const explicitFlag = process.env.STORAGE_RESTORE_DRILLS_ENABLED === "true";

    if (isProd || !explicitFlag) {
      throw new StorageError(
        "Restore drills are forbidden unless running in a non-production environment with STORAGE_RESTORE_DRILLS_ENABLED=true.",
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
