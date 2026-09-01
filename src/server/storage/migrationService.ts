/**
 * Server-side Document Migration Service.
 * Manages discovery, incremental execution, verification, physical deduplication,
 * and atomic primary switch across source_documents, engineering_document_revisions, and payroll_import_batches.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type DocumentMigrationRecord,
  type DocumentMigrationDomain,
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

export type MigrationSupportedDomain = DocumentMigrationDomain;

export const STALE_MIGRATION_LEASE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

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

      // Apply relationship and provenance filters
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

        let recordDomain: DocumentMigrationDomain = domain;
        if (domain === "SOURCE_DOCUMENTS") {
          if (row.email_message_id || row.gmail_attachment_id || row.source_type === "EMAIL") {
            recordDomain = "EMAIL_INTAKE";
          } else if (row.source_type === "UPLOAD" && row.document_type === "INVOICE") {
            recordDomain = "INVOICES";
          } else if (row.source_type === "BANK_IMPORT" || row.document_type === "BANK_STATEMENT") {
            recordDomain = "CASH_BANKING";
          } else {
            recordDomain = "SOURCE_DOCUMENTS";
          }
        }

        // Check if active migration record already exists
        const { data: existing } = await client
          .from("document_migration_records")
          .select("*")
          .eq("company_id", companyId)
          .eq("document_domain", recordDomain)
          .eq("document_id", row.id)
          .neq("migration_state", "FAILED")
          .limit(1);

        if (existing && existing.length > 0) {
          discoveredRecords.push(rowToMigrationRecord(existing[0]));
          continue;
        }

        const initial = createInitialMigrationRecord({
          companyId,
          documentDomain: recordDomain,
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
   * Atomic Claim Invariant: Only continues if atomic claim update successfully returns the claimed row.
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
    const now = new Date().toISOString();
    const staleThreshold = new Date(Date.now() - STALE_MIGRATION_LEASE_TIMEOUT_MS).toISOString();

    let query: any = client
      .from("document_migration_records")
      .select("*")
      .eq("company_id", companyId);

    if (typeof query.or === "function") {
      query = query.or(
        `migration_state.in.(DISCOVERED,RETRY_PENDING),and(migration_state.in.(COPYING,VERIFYING),last_attempted_at.is.null),and(migration_state.in.(COPYING,VERIFYING),last_attempted_at.lt.${staleThreshold})`,
      );
    } else if (typeof query.in === "function") {
      query = query.in("migration_state", ["DISCOVERED", "RETRY_PENDING", "COPYING", "VERIFYING"]);
    }

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

      // Atomic claim: Transition to COPYING and only continue if exactly one row was returned.
      // Only fresh DISCOVERED/RETRY_PENDING rows or stale in-progress leases are eligible;
      // terminal migration states must never be reclaimed because of an old timestamp.
      let updateQuery: any = client
        .from("document_migration_records")
        .update({
          migration_state: "COPYING",
          last_attempted_at: now,
          updated_at: now,
        })
        .eq("id", record.id)
        .eq("company_id", companyId);

      if (typeof updateQuery.or === "function") {
        updateQuery = updateQuery.or(
          `migration_state.in.(DISCOVERED,RETRY_PENDING),and(migration_state.in.(COPYING,VERIFYING),last_attempted_at.is.null),and(migration_state.in.(COPYING,VERIFYING),last_attempted_at.lt.${staleThreshold})`,
        );
      } else if (typeof updateQuery.in === "function") {
        updateQuery = updateQuery.in("migration_state", ["DISCOVERED", "RETRY_PENDING", "COPYING", "VERIFYING"]);
      }

      const { data: claimedRows, error: claimError } = await updateQuery.select("*");

      if (claimError || !claimedRows || claimedRows.length === 0) {
        // Another worker claimed this row or active lease is still valid; skip processing
        continue;
      }

      const activeRecord = rowToMigrationRecord(claimedRows[0]);
      const sourceProvider = this.getProviderById(activeRecord.sourceProvider, () => client);
      const targetProvider = this.getProviderById(activeRecord.targetProvider, () => client);

      // Physical Deduplication Check:
      // Look for already verified target object with matching hash within the company
      let targetKeyToUse = activeRecord.targetKey;
      let isDedupReused = false;

      const { data: matchingVerified } = await client
        .from("document_migration_records")
        .select("target_key, target_bucket, target_provider, sha256, size_bytes")
        .eq("company_id", companyId)
        .eq("sha256", activeRecord.sha256)
        .eq("target_provider", activeRecord.targetProvider)
        .eq("target_bucket", activeRecord.targetBucket)
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
          if (actualHash === activeRecord.sha256 && verifiedTargetObj.bytes.byteLength === activeRecord.sizeBytes) {
            targetKeyToUse = candidate.target_key;
            isDedupReused = true;
          }
        } catch {
          // Physical reuse verification failed; proceed to normal copy
        }
      }

      let stepResult: { success: boolean; error?: string; record: DocumentMigrationRecord };

      if (isDedupReused) {
        const stepNow = new Date().toISOString();
        stepResult = {
          success: true,
          record: {
            ...activeRecord,
            targetKey: targetKeyToUse,
            migrationState: "PRIMARY_SWITCH",
            verificationStatus: "MATCHED",
            attempts: activeRecord.attempts + 1,
            lastAttemptedAt: stepNow,
            verifiedAt: stepNow,
            switchedAt: stepNow,
            lastError: undefined,
            updatedAt: stepNow,
          },
        };
      } else {
        stepResult = await executeMigrationStep(
          { ...activeRecord, targetKey: targetKeyToUse },
          sourceProvider,
          targetProvider,
        );
      }

      if (stepResult.success && stepResult.record.migrationState === "PRIMARY_SWITCH") {
        // Atomic Domain Update: Verify update success and exact row count before marking PRIMARY_SWITCH
        let domainUpdateSuccess = false;
        let domainUpdateError: string | undefined;

        if (activeRecord.documentDomain === "INVOICES" || activeRecord.documentDomain === "EMAIL_INTAKE" || activeRecord.documentDomain === "CASH_BANKING" || activeRecord.documentDomain === "SOURCE_DOCUMENTS") {
          const { data: updatedRows, error: updateErr } = await client
            .from("source_documents")
            .update({
              storage_provider: activeRecord.targetProvider,
              storage_bucket: activeRecord.targetBucket,
              storage_path: targetKeyToUse,
            })
            .eq("id", activeRecord.documentId)
            .eq("company_id", companyId)
            .select("id");

          if (updateErr || !updatedRows || updatedRows.length === 0) {
            domainUpdateSuccess = false;
            domainUpdateError = updateErr?.message || "Failed to update source_documents row during primary switch.";
          } else {
            domainUpdateSuccess = true;
          }
        } else if (activeRecord.documentDomain === "ENGINEERING") {
          const { data: updatedRows, error: updateErr } = await client
            .from("engineering_document_revisions")
            .update({
              storage_provider: activeRecord.targetProvider,
              storage_bucket: activeRecord.targetBucket,
              file_path: targetKeyToUse,
            })
            .eq("id", activeRecord.documentId)
            .eq("company_id", companyId)
            .select("id");

          if (updateErr || !updatedRows || updatedRows.length === 0) {
            domainUpdateSuccess = false;
            domainUpdateError = updateErr?.message || "Failed to update engineering_document_revisions row during primary switch.";
          } else {
            domainUpdateSuccess = true;
          }
        } else if (activeRecord.documentDomain === "PAYROLL") {
          const { data: updatedRows, error: updateErr } = await client
            .from("payroll_import_batches")
            .update({
              storage_provider: activeRecord.targetProvider,
              storage_bucket: activeRecord.targetBucket,
              storage_path: targetKeyToUse,
            })
            .eq("id", activeRecord.documentId)
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
          records.push(stepResult.record);

          await client
            .from("document_migration_records")
            .update({
              migration_state: "RETRY_PENDING",
              target_key: targetKeyToUse,
              last_error: domainUpdateError,
              updated_at: new Date().toISOString(),
            })
            .eq("id", activeRecord.id)
            .eq("company_id", companyId);

          continue;
        }

        successCount += 1;
        records.push(stepResult.record);

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
          .eq("id", activeRecord.id)
          .eq("company_id", companyId);

        // Register asynchronous backup intent for newly migrated object using internal server authority
        if (this.backupService) {
          const backupDesc = getBackupStorageDescriptor(process.env);
          if (backupDesc) {
            await this.backupService.registerBackupIntent({
              companyId,
              documentDomain: activeRecord.documentDomain,
              documentId: activeRecord.documentId,
              sourceProvider: activeRecord.targetProvider,
              sourceBucket: activeRecord.targetBucket,
              sourceKey: targetKeyToUse,
              sha256: activeRecord.sha256,
              sizeBytes: activeRecord.sizeBytes,
              replicaProvider: "s3",
              replicaBucket: backupDesc.bucket,
            });
          }
        }
      } else {
        failedCount += 1;
        records.push(stepResult.record);
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
          .eq("id", activeRecord.id)
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
