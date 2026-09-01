/**
 * Server-side Encrypted Database Backup Service.
 * Coordinates logical export, authenticated AES-256-GCM encryption, independent storage upload,
 * checksum verification, and durable manifest persistence in PostgreSQL (database_backup_runs).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  type DatabaseBackupRunRecord,
  type DatabaseBackupType,
  type DatabaseBackupStatus,
  type DatabaseBackupVerificationStatus,
  type DatabaseBackupConfig,
  DatabaseBackupConfigurationError,
  DatabaseBackupExportError,
} from "../../lib/databaseBackup/types.ts";
import {
  encryptBackupFile,
  encryptDatabasePayload,
  validateEncryptionKey,
} from "../../lib/databaseBackup/crypto.ts";
import {
  loadDatabaseBackupConfig,
  getDatabaseBackupStorageDescriptor,
} from "../../lib/databaseBackup/config.ts";
import {
  type DatabaseExportRunner,
  PostgresDumpExportRunner,
} from "./exportRunner.ts";
import {
  type DocumentStorageProvider,
  type StorageProviderId,
  StorageError,
} from "../../lib/storage/types.ts";
import {
  getBackupStorageProvider,
  getSharedBackupMemoryProvider,
  createStorageProvider,
} from "../../lib/storage/config.ts";
import { getStorageServerServiceRoleClient } from "../storage/storageCompensation.ts";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const STALE_BACKUP_LEASE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export interface DatabaseBackupServiceOptions {
  supabaseClientSupplier?: () => SupabaseClient;
  privilegedClientSupplier?: () => SupabaseClient;
  exportRunner?: DatabaseExportRunner;
  storageProviderSupplier?: (env?: any, clientGetter?: () => SupabaseClient) => DocumentStorageProvider | null;
  configSupplier?: () => DatabaseBackupConfig;
}

export interface CreateBackupInput {
  companyId: string;
  backupType?: DatabaseBackupType;
  databaseScope?: string;
  appVersion?: string;
  schemaVersion?: string;
}

export interface ExecuteBackupResult {
  record: DatabaseBackupRunRecord;
  success: boolean;
  error?: string;
}

function rowToBackupRunRecord(row: Record<string, any>): DatabaseBackupRunRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    backupType: row.backup_type,
    databaseScope: row.database_scope,
    storageProvider: row.storage_provider,
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key,
    encryptionAlgorithm: row.encryption_algorithm || "AES-256-GCM",
    encryptionKeyId: row.encryption_key_id,
    encryptedSizeBytes: Number(row.encrypted_size_bytes || 0),
    encryptedSha256: row.encrypted_sha256,
    plaintextSha256: row.plaintext_sha256 || null,
    pgDumpVersion: row.pg_dump_version || null,
    appVersion: row.app_version || null,
    schemaVersion: row.schema_version || null,
    status: row.status,
    verificationStatus: row.verification_status,
    startedAt: row.started_at,
    completedAt: row.completed_at || null,
    lastVerifiedAt: row.last_verified_at || null,
    lastError: row.last_error || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class DatabaseBackupService {
  private readonly getSupabase: () => SupabaseClient;
  private readonly getPrivilegedSupabase: () => SupabaseClient;
  private readonly exportRunner: DatabaseExportRunner;
  private readonly getStorageProvider: (env?: any, clientGetter?: () => SupabaseClient) => DocumentStorageProvider | null;
  private readonly getConfig: () => DatabaseBackupConfig;

  constructor(options: DatabaseBackupServiceOptions = {}) {
    this.getSupabase = options.supabaseClientSupplier || (() => getStorageServerServiceRoleClient());
    this.getPrivilegedSupabase =
      options.privilegedClientSupplier || options.supabaseClientSupplier || (() => getStorageServerServiceRoleClient());
    this.exportRunner = options.exportRunner || new PostgresDumpExportRunner();
    this.getStorageProvider =
      options.storageProviderSupplier ||
      ((env, getter) => {
        const config = loadDatabaseBackupConfig(env);
        if (config.storageProvider === "memory") {
          return getSharedBackupMemoryProvider();
        }
        if (config.storageProvider === "s3" && config.s3Config) {
          return createStorageProvider("s3", { primaryProvider: "s3", s3: config.s3Config }, getter);
        }
        return getBackupStorageProvider(env, getter);
      });
    this.getConfig = options.configSupplier || (() => loadDatabaseBackupConfig());
  }

  private validateCompanyId(companyId: string): void {
    if (!companyId || typeof companyId !== "string" || !UUID_PATTERN.test(companyId.trim())) {
      throw new StorageError(`Invalid company context for database backup: "${companyId}". Expected UUID.`);
    }
  }

  /**
   * Register a new pending backup run in database_backup_runs.
   */
  async registerBackupIntent(input: CreateBackupInput): Promise<DatabaseBackupRunRecord> {
    this.validateCompanyId(input.companyId);
    const client = this.getPrivilegedSupabase();
    const config = this.getConfig();

    const storageDesc = getDatabaseBackupStorageDescriptor(process.env);
    const storageProvider = storageDesc.providerId;
    const storageBucket = storageDesc.bucket;
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const backupId = crypto.randomUUID();
    const storageKey = `companies/${input.companyId}/database-backups/${dateStr}/${backupId}.engoryx.enc`;

    const { data, error } = await client
      .from("database_backup_runs")
      .insert({
        id: backupId,
        company_id: input.companyId,
        backup_type: input.backupType || "LOGICAL_FULL",
        database_scope: input.databaseScope || "ALL_PUBLIC_TABLES",
        storage_provider: storageProvider,
        storage_bucket: storageBucket,
        storage_key: storageKey,
        encryption_algorithm: "AES-256-GCM",
        encryption_key_id: config.encryption.keyId,
        encrypted_size_bytes: 0,
        encrypted_sha256: "0".repeat(64), // placeholder until encrypted
        status: "PENDING",
        verification_status: "UNVERIFIED",
        app_version: input.appVersion || "0.3.0",
        schema_version: input.schemaVersion || "20260901160000",
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new StorageError(`Failed to register database backup manifest: ${error?.message || "unknown error"}`);
    }

    return rowToBackupRunRecord(data);
  }

  /**
   * Execute the backup workflow for a previously registered manifest record.
   */
  async executeBackupRun(backupRunId: string): Promise<ExecuteBackupResult> {
    const client = this.getPrivilegedSupabase();
    const config = this.getConfig();

    const { data: row, error: fetchErr } = await client
      .from("database_backup_runs")
      .select("*")
      .eq("id", backupRunId)
      .maybeSingle();

    if (fetchErr || !row) {
      throw new StorageError(`Database backup manifest not found: ${backupRunId}`);
    }

    const manifest = rowToBackupRunRecord(row);
    const now = new Date().toISOString();

    // Atomic claim: Transition to EXPORTING
    const { data: claimedRows, error: claimErr } = await client
      .from("database_backup_runs")
      .update({
        status: "EXPORTING",
        updated_at: now,
      })
      .eq("id", manifest.id)
      .eq("status", "PENDING")
      .select("*");

    if (claimErr || !claimedRows || claimedRows.length === 0) {
      return {
        record: manifest,
        success: false,
        error: "Backup run is already in progress or completed.",
      };
    }

    const activeManifest = rowToBackupRunRecord(claimedRows[0]);
    let plaintextDumpPath: string | null = null;
    let encryptedDumpPath: string | null = null;
    let cleanupExport: (() => Promise<void>) | null = null;

    try {
      // 1. Logical Export
      const exportResult = await this.exportRunner.exportLogicalDatabase({
        companyId: activeManifest.companyId,
        backupType: activeManifest.backupType,
        databaseUrl: config.databaseUrl,
      });

      plaintextDumpPath = exportResult.filePath;
      cleanupExport = exportResult.cleanup;

      // 2. Encryption Phase (Transition to ENCRYPTING)
      await client
        .from("database_backup_runs")
        .update({
          status: "ENCRYPTING",
          plaintext_sha256: exportResult.plaintextSha256,
          pg_dump_version: exportResult.pgDumpVersion || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeManifest.id);

      encryptedDumpPath = path.join(os.tmpdir(), `engoryx-enc-${crypto.randomUUID()}.enc`);

      const encryptionResult = await encryptBackupFile({
        sourceFilePath: plaintextDumpPath,
        targetEncryptedPath: encryptedDumpPath,
        key: config.encryption.key,
        keyId: config.encryption.keyId,
      });

      // Cleanup plaintext dump immediately after encryption
      if (cleanupExport) {
        await cleanupExport().catch(() => {});
        cleanupExport = null;
      }

      // 3. Upload Phase (Transition to UPLOADING)
      await client
        .from("database_backup_runs")
        .update({
          status: "UPLOADING",
          encrypted_sha256: encryptionResult.encryptedSha256,
          encrypted_size_bytes: encryptionResult.sizeBytes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeManifest.id);

      const storageProvider = this.getStorageProvider(process.env, () => client);
      if (!storageProvider) {
        throw new DatabaseBackupConfigurationError("Independent backup storage provider is not configured.");
      }

      const encryptedBytes = await fs.readFile(encryptedDumpPath);

      await storageProvider.putObject({
        bucket: activeManifest.storageBucket,
        key: activeManifest.storageKey,
        bytes: new Uint8Array(encryptedBytes),
        contentType: "application/octet-stream",
        companyId: activeManifest.companyId,
      });

      // Cleanup encrypted local file immediately after upload
      await fs.unlink(encryptedDumpPath).catch(() => {});
      encryptedDumpPath = null;

      // 4. Verification Phase (Transition to VERIFYING)
      await client
        .from("database_backup_runs")
        .update({
          status: "VERIFYING",
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeManifest.id);

      const headResult = await storageProvider.headObject({
        companyId: activeManifest.companyId,
        bucket: activeManifest.storageBucket,
        key: activeManifest.storageKey,
      });

      if (!headResult) {
        throw new StorageError("Verification failed: uploaded backup object not found on independent storage provider.");
      }

      if (headResult.sizeBytes !== encryptionResult.sizeBytes) {
        throw new StorageError(
          `Verification failed: remote size (${headResult.sizeBytes} bytes) does not match local encrypted size (${encryptionResult.sizeBytes} bytes).`,
        );
      }

      // If provider supports getObject, verify checksum
      const getResult = await storageProvider.getObject({
        companyId: activeManifest.companyId,
        bucket: activeManifest.storageBucket,
        key: activeManifest.storageKey,
      });

      const downloadedSha256 = crypto.createHash("sha256").update(Buffer.from(getResult.bytes)).digest("hex");
      if (downloadedSha256.toLowerCase() !== encryptionResult.encryptedSha256.toLowerCase()) {
        throw new StorageError(
          `Verification failed: remote SHA-256 (${downloadedSha256}) does not match local encrypted hash (${encryptionResult.encryptedSha256}).`,
        );
      }

      // 5. Mark VERIFIED
      const completedAt = new Date().toISOString();
      const { data: verifiedRows } = await client
        .from("database_backup_runs")
        .update({
          status: "VERIFIED",
          verification_status: "MATCHED",
          completed_at: completedAt,
          last_verified_at: completedAt,
          updated_at: completedAt,
        })
        .eq("id", activeManifest.id)
        .select("*");

      const finalRecord = verifiedRows && verifiedRows[0] ? rowToBackupRunRecord(verifiedRows[0]) : activeManifest;

      return {
        record: finalRecord,
        success: true,
      };
    } catch (err: any) {
      // Safe error recording
      const failureTime = new Date().toISOString();
      const sanitizedError = err?.message || String(err);

      await client
        .from("database_backup_runs")
        .update({
          status: "FAILED",
          verification_status: "CORRUPTED",
          last_error: sanitizedError,
          updated_at: failureTime,
        })
        .eq("id", activeManifest.id);

      const { data: failedRows } = await client
        .from("database_backup_runs")
        .select("*")
        .eq("id", activeManifest.id)
        .maybeSingle();

      const record = failedRows ? rowToBackupRunRecord(failedRows) : activeManifest;

      return {
        record,
        success: false,
        error: sanitizedError,
      };
    } finally {
      // Guaranteed temporary file cleanup
      if (cleanupExport) {
        await cleanupExport().catch(() => {});
      }
      if (encryptedDumpPath) {
        await fs.unlink(encryptedDumpPath).catch(() => {});
      }
    }
  }

  /**
   * Helper to register intent and execute immediately.
   */
  async createAndExecuteBackup(input: CreateBackupInput): Promise<ExecuteBackupResult> {
    const manifest = await this.registerBackupIntent(input);
    return await this.executeBackupRun(manifest.id);
  }

  /**
   * Re-verify an existing backup against remote independent storage.
   */
  async verifyBackupRun(backupRunId: string): Promise<DatabaseBackupRunRecord> {
    const client = this.getPrivilegedSupabase();
    const { data: row, error } = await client
      .from("database_backup_runs")
      .select("*")
      .eq("id", backupRunId)
      .maybeSingle();

    if (error || !row) {
      throw new StorageError(`Database backup run not found: ${backupRunId}`);
    }

    const manifest = rowToBackupRunRecord(row);
    const storageProvider = this.getStorageProvider(process.env, () => client);
    if (!storageProvider) {
      throw new DatabaseBackupConfigurationError("Independent backup storage provider is not configured.");
    }

    const headResult = await storageProvider.headObject({
      companyId: manifest.companyId,
      bucket: manifest.storageBucket,
      key: manifest.storageKey,
    });

    if (!headResult) {
      await client
        .from("database_backup_runs")
        .update({
          verification_status: "MISSING",
          last_error: "Remote backup object missing on independent storage.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", manifest.id);

      throw new StorageError("Remote backup object missing on independent storage.");
    }

    const getResult = await storageProvider.getObject({
      companyId: manifest.companyId,
      bucket: manifest.storageBucket,
      key: manifest.storageKey,
    });

    const downloadedSha256 = crypto.createHash("sha256").update(Buffer.from(getResult.bytes)).digest("hex");
    const matches =
      downloadedSha256.toLowerCase() === manifest.encryptedSha256.toLowerCase() &&
      headResult.sizeBytes === manifest.encryptedSizeBytes;

    const verificationStatus: DatabaseBackupVerificationStatus = matches ? "MATCHED" : "CORRUPTED";
    const now = new Date().toISOString();

    const { data: updated } = await client
      .from("database_backup_runs")
      .update({
        verification_status: verificationStatus,
        last_verified_at: now,
        updated_at: now,
      })
      .eq("id", manifest.id)
      .select("*")
      .single();

    return rowToBackupRunRecord(updated);
  }

  /**
   * List backup runs for a company.
   */
  async listBackupRuns(companyId: string, limit = 50): Promise<DatabaseBackupRunRecord[]> {
    this.validateCompanyId(companyId);
    const client = this.getSupabase();

    const { data, error } = await client
      .from("database_backup_runs")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 100));

    if (error) {
      throw new StorageError(`Failed to list database backups: ${error.message}`);
    }

    return (data || []).map(rowToBackupRunRecord);
  }

  /**
   * Get the latest verified backup run for a company.
   */
  async getLatestVerifiedBackup(companyId: string): Promise<DatabaseBackupRunRecord | null> {
    this.validateCompanyId(companyId);
    const client = this.getSupabase();

    const { data, error } = await client
      .from("database_backup_runs")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "VERIFIED")
      .eq("verification_status", "MATCHED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return rowToBackupRunRecord(data);
  }
}
