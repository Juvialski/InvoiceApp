/**
 * Server-side Document Migration Service.
 * Manages discovery, incremental execution, verification, and primary switch
 * across source_documents, engineering_document_revisions, and payroll_import_batches.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type DocumentMigrationRecord,
  createInitialMigrationRecord,
  executeMigrationStep,
} from "../../lib/storage/migration.ts";
import {
  createStorageProvider,
  getPrimaryStorageProvider,
} from "../../lib/storage/config.ts";
import {
  type DocumentStorageProvider,
  type StorageProviderId,
  StorageError,
} from "../../lib/storage/types.ts";

import type { BackupService } from "./backupService.ts";

export interface MigrationServiceOptions {
  supabaseClientSupplier: () => SupabaseClient;
  primaryProviderSupplier?: (env?: any, clientGetter?: () => SupabaseClient) => DocumentStorageProvider;
  providerSupplier?: (providerId: StorageProviderId, clientGetter?: () => SupabaseClient) => DocumentStorageProvider;
  backupService?: BackupService;
}

function rowToMigrationRecord(row: Record<string, any>): DocumentMigrationRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    documentDomain: row.document_domain,
    documentId: row.document_id,
    sourceProvider: row.source_provider,
    sourceBucket: row.source_bucket,
    sourceKey: row.source_key,
    targetProvider: row.target_provider,
    targetBucket: row.target_bucket,
    targetKey: row.target_key,
    sha256: row.sha256,
    sizeBytes: Number(row.size_bytes || 0),
    migrationState: row.migration_state,
    verificationStatus: row.verification_status,
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 5),
    lastError: row.last_error || undefined,
    lastAttemptedAt: row.last_attempted_at || undefined,
    switchedAt: row.switched_at || undefined,
    verifiedAt: row.verified_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MigrationService {
  private readonly getSupabase: () => SupabaseClient;
  private readonly getPrimaryProvider: (env?: any, clientGetter?: () => SupabaseClient) => DocumentStorageProvider;
  private readonly getProviderById: (providerId: StorageProviderId, clientGetter?: () => SupabaseClient) => DocumentStorageProvider;
  private readonly backupService?: BackupService;

  constructor(options: MigrationServiceOptions) {
    this.getSupabase = options.supabaseClientSupplier;
    this.getPrimaryProvider = options.primaryProviderSupplier || getPrimaryStorageProvider;
    this.getProviderById = options.providerSupplier || ((id, getter) => createStorageProvider(id, undefined, getter));
    this.backupService = options.backupService;
  }

  /**
   * Discover unmigrated documents stored in legacy Supabase Storage and register migration records.
   */
  async discoverEligibleDocuments(
    companyId: string,
    domain: DocumentMigrationRecord["documentDomain"] = "INVOICES",
    limit = 50,
  ): Promise<DocumentMigrationRecord[]> {
    const client = this.getSupabase();
    const primaryProvider = this.getPrimaryProvider(process.env, () => client);
    const targetProviderId = primaryProvider.id;
    const targetBucket = (primaryProvider as any).config?.bucket || "engoryx-production-documents";

    const discoveredRecords: DocumentMigrationRecord[] = [];

    if (domain === "INVOICES" || domain === "EMAIL_INTAKE" || domain === "CASH_BANKING") {
      const { data: rows, error } = await client
        .from("source_documents")
        .select("id,company_id,storage_path,storage_provider,storage_bucket,sha256,file_size,filename")
        .eq("company_id", companyId)
        .eq("storage_provider", "supabase")
        .limit(limit);

      if (error) throw new StorageError(`Failed to discover eligible source documents: ${error.message}`);

      for (const row of rows || []) {
        if (!row.storage_path || !row.sha256) continue;
        const initial = createInitialMigrationRecord({
          companyId,
          documentDomain: domain,
          documentId: row.id,
          sourceProvider: "supabase",
          sourceBucket: row.storage_bucket || "invoice-originals",
          sourceKey: row.storage_path,
          targetProvider: targetProviderId,
          targetBucket,
          targetKey: row.storage_path,
          sha256: row.sha256,
          sizeBytes: Number(row.file_size || 0),
        });

        const { data: inserted, error: insertError } = await client
          .from("document_migration_records")
          .insert({
            company_id: initial.companyId,
            document_domain: initial.documentDomain,
            document_id: initial.documentId,
            source_provider: initial.sourceProvider,
            source_bucket: initial.sourceBucket,
            source_key: initial.sourceKey,
            target_provider: initial.targetProvider,
            target_bucket: initial.targetBucket,
            target_key: initial.targetKey,
            sha256: initial.sha256,
            size_bytes: initial.sizeBytes,
            migration_state: "DISCOVERED",
            verification_status: "UNVERIFIED",
          })
          .select("*")
          .single();

        if (!insertError && inserted) {
          discoveredRecords.push(rowToMigrationRecord(inserted));
        }
      }
    } else if (domain === "ENGINEERING") {
      const { data: rows, error } = await client
        .from("engineering_document_revisions")
        .select("id,company_id,file_path,storage_provider,storage_bucket,file_fingerprint,file_size_bytes")
        .eq("company_id", companyId)
        .eq("storage_provider", "supabase")
        .limit(limit);

      if (error) throw new StorageError(`Failed to discover eligible engineering revisions: ${error.message}`);

      for (const row of rows || []) {
        if (!row.file_path || !row.file_fingerprint) continue;
        const rawSha = row.file_fingerprint.replace(/^sha256:/i, "");
        const initial = createInitialMigrationRecord({
          companyId,
          documentDomain: "ENGINEERING",
          documentId: row.id,
          sourceProvider: "supabase",
          sourceBucket: row.storage_bucket || "engineering-documents",
          sourceKey: row.file_path,
          targetProvider: targetProviderId,
          targetBucket,
          targetKey: row.file_path,
          sha256: rawSha,
          sizeBytes: Number(row.file_size_bytes || 0),
        });

        const { data: inserted, error: insertError } = await client
          .from("document_migration_records")
          .insert({
            company_id: initial.companyId,
            document_domain: initial.documentDomain,
            document_id: initial.documentId,
            source_provider: initial.sourceProvider,
            source_bucket: initial.sourceBucket,
            source_key: initial.sourceKey,
            target_provider: initial.targetProvider,
            target_bucket: initial.targetBucket,
            target_key: initial.targetKey,
            sha256: initial.sha256,
            size_bytes: initial.sizeBytes,
            migration_state: "DISCOVERED",
            verification_status: "UNVERIFIED",
          })
          .select("*")
          .single();

        if (!insertError && inserted) {
          discoveredRecords.push(rowToMigrationRecord(inserted));
        }
      }
    } else if (domain === "PAYROLL") {
      const { data: rows, error } = await client
        .from("payroll_import_batches")
        .select("id,company_id,storage_path,storage_provider,storage_bucket,file_sha256,file_size")
        .eq("company_id", companyId)
        .eq("storage_provider", "supabase")
        .limit(limit);

      if (error) throw new StorageError(`Failed to discover eligible payroll batches: ${error.message}`);

      for (const row of rows || []) {
        if (!row.storage_path || !row.file_sha256) continue;
        const initial = createInitialMigrationRecord({
          companyId,
          documentDomain: "PAYROLL",
          documentId: row.id,
          sourceProvider: "supabase",
          sourceBucket: row.storage_bucket || "payroll-import-sources",
          sourceKey: row.storage_path,
          targetProvider: targetProviderId,
          targetBucket,
          targetKey: row.storage_path,
          sha256: row.file_sha256,
          sizeBytes: Number(row.file_size || 0),
        });

        const { data: inserted, error: insertError } = await client
          .from("document_migration_records")
          .insert({
            company_id: initial.companyId,
            document_domain: initial.documentDomain,
            document_id: initial.documentId,
            source_provider: initial.sourceProvider,
            source_bucket: initial.sourceBucket,
            source_key: initial.sourceKey,
            target_provider: initial.targetProvider,
            target_bucket: initial.targetBucket,
            target_key: initial.targetKey,
            sha256: initial.sha256,
            size_bytes: initial.sizeBytes,
            migration_state: "DISCOVERED",
            verification_status: "UNVERIFIED",
          })
          .select("*")
          .single();

        if (!insertError && inserted) {
          discoveredRecords.push(rowToMigrationRecord(inserted));
        }
      }
    }

    return discoveredRecords;
  }

  /**
   * Process a batch of pending migrations.
   */
  async processPendingMigrations(
    companyId: string,
    limit = 10,
  ): Promise<{
    processed: number;
    success: number;
    failed: number;
    records: DocumentMigrationRecord[];
  }> {
    const client = this.getSupabase();
    const { data: rows, error } = await client
      .from("document_migration_records")
      .select("*")
      .eq("company_id", companyId)
      .in("migration_state", ["DISCOVERED", "RETRY_PENDING", "COPYING", "VERIFYING"])
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) throw new StorageError(`Failed to load pending migrations: ${error.message}`);

    const records: DocumentMigrationRecord[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const row of rows || []) {
      const record = rowToMigrationRecord(row);
      const sourceProvider = this.getProviderById(record.sourceProvider, () => client);
      const targetProvider = this.getProviderById(record.targetProvider, () => client);

      const stepResult = await executeMigrationStep(record, sourceProvider, targetProvider);
      records.push(stepResult.record);

      if (stepResult.success && stepResult.record.migrationState === "PRIMARY_SWITCH") {
        successCount += 1;

        // 1. Update domain table with new primary provider reference
        if (record.documentDomain === "INVOICES" || record.documentDomain === "EMAIL_INTAKE" || record.documentDomain === "CASH_BANKING") {
          await client
            .from("source_documents")
            .update({
              storage_provider: record.targetProvider,
              storage_bucket: record.targetBucket,
              storage_path: record.targetKey,
            })
            .eq("id", record.documentId)
            .eq("company_id", companyId);
        } else if (record.documentDomain === "ENGINEERING") {
          await client
            .from("engineering_document_revisions")
            .update({
              storage_provider: record.targetProvider,
              storage_bucket: record.targetBucket,
              file_path: record.targetKey,
            })
            .eq("id", record.documentId)
            .eq("company_id", companyId);
        } else if (record.documentDomain === "PAYROLL") {
          await client
            .from("payroll_import_batches")
            .update({
              storage_provider: record.targetProvider,
              storage_bucket: record.targetBucket,
              storage_path: record.targetKey,
            })
            .eq("id", record.documentId)
            .eq("company_id", companyId);
        }

        // 2. Update migration record state
        await client
          .from("document_migration_records")
          .update({
            migration_state: "PRIMARY_SWITCH",
            verification_status: "MATCHED",
            verified_at: stepResult.record.verifiedAt,
            switched_at: stepResult.record.switchedAt,
            attempts: stepResult.record.attempts,
            last_error: null,
            updated_at: stepResult.record.updatedAt,
          })
          .eq("id", record.id)
          .eq("company_id", companyId);

        // 3. Register asynchronous backup intent for newly migrated object
        if (this.backupService) {
          this.backupService.registerBackupIntent({
            companyId,
            documentDomain: record.documentDomain,
            documentId: record.documentId,
            sourceProvider: record.targetProvider,
            sourceBucket: record.targetBucket,
            sourceKey: record.targetKey,
            sha256: record.sha256,
            sizeBytes: record.sizeBytes,
            replicaProvider: "s3",
            replicaBucket: "engoryx-backups",
          }).catch((err) => {
            console.warn("[Migration Service] Backup registration warning:", err);
          });
        }
      } else {
        failedCount += 1;
        await client
          .from("document_migration_records")
          .update({
            migration_state: stepResult.record.migrationState,
            verification_status: stepResult.record.verificationStatus,
            attempts: stepResult.record.attempts,
            last_error: stepResult.record.lastError || null,
            last_attempted_at: stepResult.record.lastAttemptedAt || null,
            updated_at: stepResult.record.updatedAt,
          })
          .eq("id", record.id)
          .eq("company_id", companyId);
      }
    }

    return {
      processed: records.length,
      success: successCount,
      failed: failedCount,
      records,
    };
  }
}
