/**
 * Server-side Document Migration Service.
 * Manages discovery, incremental execution, verification, physical deduplication,
 * and atomic primary switch across source_documents, engineering_document_revisions, and payroll_import_batches.
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
  getPrimaryStorageDescriptor,
  getBackupStorageDescriptor,
} from "../../lib/storage/config.ts";
import {
  type DocumentStorageProvider,
  type StorageProviderId,
  StorageError,
} from "../../lib/storage/types.ts";
import { calculateSha256Hex } from "../../lib/storage/dedup.ts";
import type { BackupService } from "./backupService.ts";

export type MigrationSupportedDomain =
  | "INVOICES"
  | "EMAIL_INTAKE"
  | "CASH_BANKING"
  | "PAYROLL"
  | "ENGINEERING"
  | "SOURCE_DOCUMENTS";

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
   * Idempotent invariant: Reuses existing active migration records and prevents duplicate entries.
   */
  async discoverEligibleDocuments(
    companyId: string,
    domain: MigrationSupportedDomain = "INVOICES",
    limit = 50,
  ): Promise<DocumentMigrationRecord[]> {
    const primaryDesc = getPrimaryStorageDescriptor(process.env);
    if (!primaryDesc.isExternal && primaryDesc.providerId === "supabase") {
      throw new StorageError(
        "Primary storage provider is currently configured as Supabase. Wave S3 migration from legacy Supabase storage requires a configured external S3/R2 primary provider.",
        "EXTERNAL_PROVIDER_REQUIRED",
        400,
      );
    }

    const clampedLimit = Math.max(1, Math.min(limit, 100));
    const client = this.getSupabase();
    const targetProviderId = primaryDesc.providerId;
    const targetBucket = primaryDesc.bucket;

    const discoveredRecords: DocumentMigrationRecord[] = [];

    if (domain === "INVOICES" || domain === "EMAIL_INTAKE" || domain === "CASH_BANKING" || domain === "SOURCE_DOCUMENTS") {
      let query = client
        .from("source_documents")
        .select("id,company_id,source_type,document_type,email_message_id,gmail_attachment_id,storage_path,storage_provider,storage_bucket,sha256,file_size,filename")
        .eq("company_id", companyId)
        .eq("storage_provider", "supabase");

      // Apply real domain-specific classification filters
      if (domain === "EMAIL_INTAKE") {
        query = query.or("source_type.eq.EMAIL,email_message_id.not.is.null,gmail_attachment_id.not.is.null");
      } else if (domain === "INVOICES") {
        query = query.eq("source_type", "UPLOAD").eq("document_type", "INVOICE");
      } else if (domain === "CASH_BANKING") {
        query = query.or("source_type.eq.BANK_IMPORT,document_type.eq.BANK_STATEMENT");
      }

      const { data: rows, error } = await query.limit(clampedLimit);
      if (error) throw new StorageError(`Failed to discover eligible source documents: ${error.message}`);

      for (const row of rows || []) {
        if (!row.storage_path || !row.sha256) continue;

        // Check if active migration record already exists
        const { data: existing } = await client
          .from("document_migration_records")
          .select("*")
          .eq("company_id", companyId)
          .eq("document_domain", domain)
          .eq("document_id", row.id)
          .neq("migration_state", "FAILED")
          .limit(1);

        if (existing && existing.length > 0) {
          discoveredRecords.push(rowToMigrationRecord(existing[0]));
          continue;
        }

        const initial = createInitialMigrationRecord({
          companyId,
          documentDomain: domain as any,
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
        .limit(clampedLimit);

      if (error) throw new StorageError(`Failed to discover eligible engineering revisions: ${error.message}`);

      for (const row of rows || []) {
        if (!row.file_path || !row.file_fingerprint) continue;

        // Check if active migration record already exists
        const { data: existing } = await client
          .from("document_migration_records")
          .select("*")
          .eq("company_id", companyId)
          .eq("document_domain", "ENGINEERING")
          .eq("document_id", row.id)
          .neq("migration_state", "FAILED")
          .limit(1);

        if (existing && existing.length > 0) {
          discoveredRecords.push(rowToMigrationRecord(existing[0]));
          continue;
        }

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
        .limit(clampedLimit);

      if (error) throw new StorageError(`Failed to discover eligible payroll batches: ${error.message}`);

      for (const row of rows || []) {
        if (!row.storage_path || !row.file_sha256) continue;

        // Check if active migration record already exists
        const { data: existing } = await client
          .from("document_migration_records")
          .select("*")
          .eq("company_id", companyId)
          .eq("document_domain", "PAYROLL")
          .eq("document_id", row.id)
          .neq("migration_state", "FAILED")
          .limit(1);

        if (existing && existing.length > 0) {
          discoveredRecords.push(rowToMigrationRecord(existing[0]));
          continue;
        }

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
   * Process a batch of pending migrations scoped strictly to the requested domain.
   * Resumes safely from existing target uploads and performs conservative physical deduplication.
   */
  async processPendingMigrations(
    companyId: string,
    domain?: MigrationSupportedDomain,
    limit = 10,
  ): Promise<{
    processed: number;
    success: number;
    failed: number;
    records: DocumentMigrationRecord[];
  }> {
    const clampedLimit = Math.max(1, Math.min(limit, 100));
    const client = this.getSupabase();

    let query = client
      .from("document_migration_records")
      .select("*")
      .eq("company_id", companyId)
      .in("migration_state", ["DISCOVERED", "RETRY_PENDING", "COPYING", "VERIFYING"]);

    if (domain) {
      query = query.eq("document_domain", domain);
    }

    const { data: rows, error } = await query
      .order("created_at", { ascending: true })
      .limit(clampedLimit);
    if (error) throw new StorageError(`Failed to load pending migrations: ${error.message}`);


    const records: DocumentMigrationRecord[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const row of rows || []) {
      const record = rowToMigrationRecord(row);
      const sourceProvider = this.getProviderById(record.sourceProvider, () => client);
      const targetProvider = this.getProviderById(record.targetProvider, () => client);

      // Atomic claim: set state to COPYING
      await client
        .from("document_migration_records")
        .update({
          migration_state: "COPYING",
          last_attempted_at: new Date().toISOString(),
        })
        .eq("id", record.id)
        .eq("company_id", companyId)
        .in("migration_state", ["DISCOVERED", "RETRY_PENDING"]);

      // Physical Deduplication Check:
      // Look for already verified target object with matching hash within the company
      let targetKeyToUse = record.targetKey;
      let isDedupReused = false;

      const { data: matchingVerified } = await client
        .from("document_migration_records")
        .select("target_key, target_bucket, target_provider, sha256, size_bytes")
        .eq("company_id", companyId)
        .eq("sha256", record.sha256)
        .eq("target_provider", record.targetProvider)
        .eq("target_bucket", record.targetBucket)
        .eq("migration_state", "PRIMARY_SWITCH")
        .eq("verification_status", "MATCHED")
        .limit(1);

      if (matchingVerified && matchingVerified.length > 0) {
        const candidate = matchingVerified[0];
        try {
          const verifiedTargetObj = await targetProvider.getObject({
            companyId,
            bucket: candidate.target_bucket,
            key: candidate.target_key,
          });
          const actualHash = await calculateSha256Hex(verifiedTargetObj.bytes);
          if (actualHash === record.sha256 && verifiedTargetObj.bytes.byteLength === record.sizeBytes) {
            targetKeyToUse = candidate.target_key;
            isDedupReused = true;
          }
        } catch {
          // Physical reuse verification failed; proceed to normal copy
        }
      }

      let stepResult: { success: boolean; error?: string; record: DocumentMigrationRecord };

      if (isDedupReused) {
        const now = new Date().toISOString();
        stepResult = {
          success: true,
          record: {
            ...record,
            targetKey: targetKeyToUse,
            migrationState: "PRIMARY_SWITCH",
            verificationStatus: "MATCHED",
            attempts: record.attempts + 1,
            lastAttemptedAt: now,
            verifiedAt: now,
            switchedAt: now,
            lastError: undefined,
            updatedAt: now,
          },
        };
      } else {
        stepResult = await executeMigrationStep(
          { ...record, targetKey: targetKeyToUse },
          sourceProvider,
          targetProvider,
        );
      }

      records.push(stepResult.record);

      if (stepResult.success && stepResult.record.migrationState === "PRIMARY_SWITCH") {
        // Atomic Domain Update: Verify update success and exact row count before marking PRIMARY_SWITCH
        let domainUpdateSuccess = false;
        let domainUpdateError: string | undefined;

        if (record.documentDomain === "INVOICES" || record.documentDomain === "EMAIL_INTAKE" || record.documentDomain === "CASH_BANKING" || record.documentDomain === "SOURCE_DOCUMENTS") {
          const { data: updatedRows, error: updateErr } = await client
            .from("source_documents")
            .update({
              storage_provider: record.targetProvider,
              storage_bucket: record.targetBucket,
              storage_path: targetKeyToUse,
            })
            .eq("id", record.documentId)
            .eq("company_id", companyId)
            .select("id");

          if (updateErr || !updatedRows || updatedRows.length === 0) {
            domainUpdateSuccess = false;
            domainUpdateError = updateErr?.message || "Failed to update source_documents row during primary switch.";
          } else {
            domainUpdateSuccess = true;
          }
        } else if (record.documentDomain === "ENGINEERING") {
          const { data: updatedRows, error: updateErr } = await client
            .from("engineering_document_revisions")
            .update({
              storage_provider: record.targetProvider,
              storage_bucket: record.targetBucket,
              file_path: targetKeyToUse,
            })
            .eq("id", record.documentId)
            .eq("company_id", companyId)
            .select("id");

          if (updateErr || !updatedRows || updatedRows.length === 0) {
            domainUpdateSuccess = false;
            domainUpdateError = updateErr?.message || "Failed to update engineering_document_revisions row during primary switch.";
          } else {
            domainUpdateSuccess = true;
          }
        } else if (record.documentDomain === "PAYROLL") {
          const { data: updatedRows, error: updateErr } = await client
            .from("payroll_import_batches")
            .update({
              storage_provider: record.targetProvider,
              storage_bucket: record.targetBucket,
              storage_path: targetKeyToUse,
            })
            .eq("id", record.documentId)
            .eq("company_id", companyId)
            .select("id");

          if (updateErr || !updatedRows || updatedRows.length === 0) {
            domainUpdateSuccess = false;
            domainUpdateError = updateErr?.message || "Failed to update payroll_import_batches row during primary switch.";
          } else {
            domainUpdateSuccess = true;
          }
        }

        if (!domainUpdateSuccess) {
          failedCount += 1;
          stepResult.record.migrationState = "RETRY_PENDING";
          stepResult.record.lastError = domainUpdateError;

          await client
            .from("document_migration_records")
            .update({
              migration_state: "RETRY_PENDING",
              target_key: targetKeyToUse,
              last_error: domainUpdateError,
              updated_at: new Date().toISOString(),
            })
            .eq("id", record.id)
            .eq("company_id", companyId);

          continue;
        }

        successCount += 1;

        // Update migration record state to confirmed PRIMARY_SWITCH
        await client
          .from("document_migration_records")
          .update({
            migration_state: "PRIMARY_SWITCH",
            verification_status: "MATCHED",
            target_key: targetKeyToUse,
            verified_at: stepResult.record.verifiedAt,
            switched_at: stepResult.record.switchedAt,
            attempts: stepResult.record.attempts,
            last_error: null,
            updated_at: stepResult.record.updatedAt,
          })
          .eq("id", record.id)
          .eq("company_id", companyId);

        // Register asynchronous backup intent for newly migrated object
        if (this.backupService) {
          const backupDesc = getBackupStorageDescriptor(process.env);
          if (backupDesc) {
            await this.backupService.registerBackupIntent({
              companyId,
              documentDomain: record.documentDomain,
              documentId: record.documentId,
              sourceProvider: record.targetProvider,
              sourceBucket: record.targetBucket,
              sourceKey: targetKeyToUse,
              sha256: record.sha256,
              sizeBytes: record.sizeBytes,
              replicaProvider: backupDesc.providerId === "memory" ? "memory" : "s3",
              replicaBucket: backupDesc.bucket,
            });
          }
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
