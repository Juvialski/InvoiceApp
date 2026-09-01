/**
 * Document Storage Migration State Machine and Dual-Read Compatibility Layer.
 * Implements incremental, restartable, and verifiable migration from legacy
 * Supabase Storage to external S3-compatible private object stores (Wave S3).
 */

import {
  type DocumentStorageProvider,
  type GetObjectResult,
  type ObjectLookupQuery,
  type StorageProviderId,
  ObjectNotFoundError,
  StorageError,
  StorageIntegrityError,
} from "./types.ts";
import { calculateSha256Hex, normalizeSha256 } from "./dedup.ts";

export type MigrationState =
  | "DISCOVERED"
  | "COPYING"
  | "VERIFYING"
  | "DUAL_READ"
  | "PRIMARY_SWITCH"
  | "GRACE_PERIOD"
  | "AUDIT_PROOF"
  | "CLEANUP"
  | "FAILED"
  | "RETRY_PENDING";

export type DocumentMigrationDomain =
  | "INVOICES"
  | "EMAIL_INTAKE"
  | "CASH_BANKING"
  | "PAYROLL"
  | "ENGINEERING"
  | "SOURCE_DOCUMENTS";

export interface DocumentMigrationRecord {
  id: string;
  companyId: string;
  documentDomain: DocumentMigrationDomain;

  documentId: string;
  sourceProvider: StorageProviderId;
  sourceBucket: string;
  sourceKey: string;
  targetProvider: StorageProviderId;
  targetBucket: string;
  targetKey: string;
  sha256: string;
  sizeBytes: number;
  migrationState: MigrationState;
  verificationStatus: "UNVERIFIED" | "MATCHED" | "CORRUPTED" | "MISSING";
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  lastAttemptedAt?: string;
  switchedAt?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMigrationRecordInput {
  companyId: string;
  documentDomain: DocumentMigrationRecord["documentDomain"];
  documentId: string;
  sourceProvider: StorageProviderId;
  sourceBucket: string;
  sourceKey: string;
  targetProvider: StorageProviderId;
  targetBucket: string;
  targetKey?: string;
  sha256: string;
  sizeBytes: number;
}

/**
 * Initialize a new migration record in DISCOVERED state.
 */
export function createInitialMigrationRecord(input: CreateMigrationRecordInput): DocumentMigrationRecord {
  const normalizedHash = normalizeSha256(input.sha256);
  const now = new Date().toISOString();
  const targetKey = input.targetKey || input.sourceKey;

  return {
    id: `mig-${crypto.randomUUID()}`,
    companyId: input.companyId,
    documentDomain: input.documentDomain,
    documentId: input.documentId,
    sourceProvider: input.sourceProvider,
    sourceBucket: input.sourceBucket,
    sourceKey: input.sourceKey,
    targetProvider: input.targetProvider,
    targetBucket: input.targetBucket,
    targetKey,
    sha256: normalizedHash,
    sizeBytes: input.sizeBytes,
    migrationState: "DISCOVERED",
    verificationStatus: "UNVERIFIED",
    attempts: 0,
    maxAttempts: 5,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Execute an incremental migration step:
 * 1. Read source bytes from sourceProvider.
 * 2. Validate source hash and size.
 * 3. Copy/put object into targetProvider.
 * 4. Verify target object bytes, hash, and metadata.
 * 5. Update state to PRIMARY_SWITCH (source object is PRESERVED, never deleted in S3).
 */
export async function executeMigrationStep(
  record: DocumentMigrationRecord,
  sourceProvider: DocumentStorageProvider,
  targetProvider: DocumentStorageProvider,
): Promise<{ success: boolean; error?: string; record: DocumentMigrationRecord }> {
  const now = new Date().toISOString();
  const attempts = record.attempts + 1;

  try {
    // 1. Download source object
    const sourceObj = await sourceProvider.getObject({
      companyId: record.companyId,
      bucket: record.sourceBucket,
      key: record.sourceKey,
    });

    // 2. Validate integrity before writing
    const sourceHash = await calculateSha256Hex(sourceObj.bytes);
    if (sourceHash !== record.sha256 || sourceObj.bytes.byteLength !== record.sizeBytes) {
      throw new StorageIntegrityError(
        `Source object integrity check failed before migration: expected hash ${record.sha256} / size ${record.sizeBytes}, got hash ${sourceHash} / size ${sourceObj.bytes.byteLength}`,
      );
    }

    // 3. Check if target object already exists and is verified (crash/restart safety)
    let targetAlreadyExists = false;
    try {
      const existingTargetObj = await targetProvider.getObject({
        companyId: record.companyId,
        bucket: record.targetBucket,
        key: record.targetKey,
      });
      const existingHash = await calculateSha256Hex(existingTargetObj.bytes);
      if (existingHash === record.sha256 && existingTargetObj.bytes.byteLength === record.sizeBytes) {
        targetAlreadyExists = true;
      } else {
        throw new StorageIntegrityError(
          `Target object already exists at "${record.targetKey}" but does not match expected SHA-256 hash or size.`,
        );
      }
    } catch (err) {
      if (err instanceof StorageIntegrityError) throw err;
      // Object not found on target yet; proceed to copy
    }

    if (!targetAlreadyExists) {
      await targetProvider.putObject({
        companyId: record.companyId,
        bucket: record.targetBucket,
        key: record.targetKey,
        bytes: sourceObj.bytes,
        contentType: sourceObj.metadata.contentType || "application/octet-stream",
        sha256: record.sha256,
        customMetadata: {
          "migrated-from-provider": record.sourceProvider,
          "migrated-from-bucket": record.sourceBucket,
          "document-id": record.documentId,
        },
      });
    }

    // 4. Verify target object on targetProvider
    const targetObj = await targetProvider.getObject({
      companyId: record.companyId,
      bucket: record.targetBucket,
      key: record.targetKey,
    });

    const targetHash = await calculateSha256Hex(targetObj.bytes);
    if (targetHash !== record.sha256 || targetObj.bytes.byteLength !== record.sizeBytes) {
      throw new StorageIntegrityError(
        `Target object verification failed after migration copy: expected hash ${record.sha256}, got ${targetHash}`,
      );
    }


    // Invariant: Migration never deletes source object in S3 (grace period retention).
    return {
      success: true,
      record: {
        ...record,
        migrationState: "PRIMARY_SWITCH",
        verificationStatus: "MATCHED",
        attempts,
        lastAttemptedAt: now,
        verifiedAt: now,
        switchedAt: now,
        lastError: undefined,
        updatedAt: now,
      },
    };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const nextState: MigrationState = attempts >= record.maxAttempts ? "FAILED" : "RETRY_PENDING";

    return {
      success: false,
      error: errorMsg,
      record: {
        ...record,
        migrationState: nextState,
        verificationStatus: "CORRUPTED",
        attempts,
        lastAttemptedAt: now,
        lastError: errorMsg,
        updatedAt: now,
      },
    };
  }
}

/**
 * Dual-read helper for transitioning objects during rollout.
 * Attempts primary read, falling back to legacy provider if the primary reports ObjectNotFoundError.
 */
export async function dualReadObject(
  primaryQuery: ObjectLookupQuery,
  primaryProvider: DocumentStorageProvider,
  fallbackProvider?: DocumentStorageProvider,
  fallbackQuery?: ObjectLookupQuery,
): Promise<GetObjectResult> {
  try {
    return await primaryProvider.getObject(primaryQuery);
  } catch (err) {
    if ((err instanceof ObjectNotFoundError || (err as any)?.code === "OBJECT_NOT_FOUND") && fallbackProvider) {
      const query = fallbackQuery || primaryQuery;
      return await fallbackProvider.getObject(query);
    }
    throw err;
  }
}
