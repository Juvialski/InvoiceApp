import {
  type DocumentStorageProvider,
  type ObjectLookupQuery,
  type StorageProviderId,
  StorageIntegrityError,
  StorageError,
} from "./types.ts";
import { calculateSha256Hex, normalizeSha256 } from "./dedup.ts";

export type ReplicationState =
  | "PENDING"
  | "COPYING"
  | "VERIFYING"
  | "VERIFIED"
  | "FAILED"
  | "RETRY_PENDING"
  | "PAUSED";

export type BackupVerificationStatus =
  | "UNVERIFIED"
  | "MATCHED"
  | "CORRUPTED"
  | "MISSING";

/**
 * Manifest record representing an independent backup replica of a primary object.
 */
export interface BackupReplicaRecord {
  id: string;
  companyId: string;
  documentDomain?: "INVOICES" | "EMAIL_INTAKE" | "CASH_BANKING" | "PAYROLL" | "ENGINEERING";
  documentId: string;
  sourceProvider: StorageProviderId;
  sourceBucket: string;
  sourceKey: string;
  sha256: string;
  sizeBytes: number;
  replicaProvider: StorageProviderId | "b2" | "gdrive" | "onedrive";
  replicaBucket: string;
  replicaKey: string;
  replicationState: ReplicationState;
  verificationStatus: BackupVerificationStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  lastAttemptedAt?: string;
  firstReplicatedAt?: string;
  lastVerifiedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for registering an asynchronous backup replication intent after primary commit.
 */
export interface RegisterBackupInput {
  companyId: string;
  documentDomain?: "INVOICES" | "EMAIL_INTAKE" | "CASH_BANKING" | "PAYROLL" | "ENGINEERING";
  documentId: string;
  sourceProvider: StorageProviderId;
  sourceBucket: string;
  sourceKey: string;
  sha256: string;
  sizeBytes: number;
  replicaProvider: BackupReplicaRecord["replicaProvider"];
  replicaBucket: string;
  replicaKey?: string;
}

/**
 * Create an initial pending backup replica record.
 */
export function createPendingBackupRecord(input: RegisterBackupInput): BackupReplicaRecord {
  const normalizedHash = normalizeSha256(input.sha256);
  const now = new Date().toISOString();
  const defaultReplicaKey = input.replicaKey || input.sourceKey;

  return {
    id: `bak-${crypto.randomUUID()}`,
    companyId: input.companyId,
    documentDomain: input.documentDomain || "INVOICES",
    documentId: input.documentId,
    sourceProvider: input.sourceProvider,
    sourceBucket: input.sourceBucket,
    sourceKey: input.sourceKey,
    sha256: normalizedHash,
    sizeBytes: input.sizeBytes,
    replicaProvider: input.replicaProvider,
    replicaBucket: input.replicaBucket,
    replicaKey: defaultReplicaKey,
    replicationState: "PENDING",
    verificationStatus: "UNVERIFIED",
    attempts: 0,
    maxAttempts: 5,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Invariant: Backup replication is strictly asynchronous.
 * If a backup replication attempt fails, the primary upload MUST NOT fail.
 */
export function assertBackupFailureIsolation(
  primarySuccess: boolean,
  backupError?: unknown,
): { primaryStatus: "COMMITTED" | "ABORTED"; backupLogged: boolean } {
  if (!primarySuccess) {
    return { primaryStatus: "ABORTED", backupLogged: false };
  }

  if (backupError) {
    // Log diagnostic without throwing or interrupting caller
    console.warn("[Engoryx Backup Foundation] Asynchronous backup replication encountered an issue:", backupError);
    return { primaryStatus: "COMMITTED", backupLogged: true };
  }

  return { primaryStatus: "COMMITTED", backupLogged: false };
}

/**
 * Replicate an object from source provider to independent backup provider.
 */
export async function replicateObjectToBackup(
  record: BackupReplicaRecord,
  sourceProvider: DocumentStorageProvider,
  backupProvider: DocumentStorageProvider,
): Promise<BackupReplicaRecord> {
  const now = new Date().toISOString();
  const attempts = record.attempts + 1;

  try {
    // 1. Fetch source object bytes
    const sourceObj = await sourceProvider.getObject({
      companyId: record.companyId,
      bucket: record.sourceBucket,
      key: record.sourceKey,
    });

    const calculatedSourceHash = await calculateSha256Hex(sourceObj.bytes);
    if (calculatedSourceHash !== record.sha256) {
      throw new StorageIntegrityError(
        `Source object corrupted before backup: expected ${record.sha256}, got ${calculatedSourceHash}`,
      );
    }

    // 2. Put to backup provider
    await backupProvider.putObject({
      companyId: record.companyId,
      bucket: record.replicaBucket,
      key: record.replicaKey,
      bytes: sourceObj.bytes,
      contentType: sourceObj.metadata.contentType || "application/octet-stream",
      sha256: record.sha256,
      customMetadata: {
        "source-provider": record.sourceProvider,
        "source-bucket": record.sourceBucket,
        "document-id": record.documentId,
      },
    });

    return {
      ...record,
      replicationState: "VERIFYING",
      attempts,
      lastAttemptedAt: now,
      firstReplicatedAt: record.firstReplicatedAt || now,
      lastError: undefined,
      updatedAt: now,
    };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const nextState: ReplicationState = attempts >= record.maxAttempts ? "FAILED" : "RETRY_PENDING";
    return {
      ...record,
      replicationState: nextState,
      attempts,
      lastAttemptedAt: now,
      lastError: errorMsg,
      updatedAt: now,
    };
  }
}

/**
 * Verify a backup replica's existence, size, SHA-256 hash, and tenant metadata.
 */
export async function verifyBackupReplica(
  record: BackupReplicaRecord,
  backupProvider: DocumentStorageProvider,
): Promise<{ verified: boolean; error?: string; record: BackupReplicaRecord }> {
  const now = new Date().toISOString();

  try {
    const replicaObj = await backupProvider.getObject({
      companyId: record.companyId,
      bucket: record.replicaBucket,
      key: record.replicaKey,
    });

    // Check size
    if (replicaObj.bytes.byteLength !== record.sizeBytes) {
      const error = `Replica size mismatch: expected ${record.sizeBytes} bytes, got ${replicaObj.bytes.byteLength}`;
      return {
        verified: false,
        error,
        record: {
          ...record,
          replicationState: "FAILED",
          verificationStatus: "CORRUPTED",
          lastError: error,
          updatedAt: now,
        },
      };
    }

    // Check SHA-256
    const calculatedHash = await calculateSha256Hex(replicaObj.bytes);
    if (calculatedHash !== record.sha256) {
      const error = `Replica SHA-256 mismatch: expected ${record.sha256}, got ${calculatedHash}`;
      return {
        verified: false,
        error,
        record: {
          ...record,
          replicationState: "FAILED",
          verificationStatus: "CORRUPTED",
          lastError: error,
          updatedAt: now,
        },
      };
    }

    // Check company boundary metadata
    if (replicaObj.metadata.companyId && replicaObj.metadata.companyId !== record.companyId) {
      const error = `Replica company metadata mismatch: expected ${record.companyId}, got ${replicaObj.metadata.companyId}`;
      return {
        verified: false,
        error,
        record: {
          ...record,
          replicationState: "FAILED",
          verificationStatus: "CORRUPTED",
          lastError: error,
          updatedAt: now,
        },
      };
    }

    return {
      verified: true,
      record: {
        ...record,
        replicationState: "VERIFIED",
        verificationStatus: "MATCHED",
        lastVerifiedAt: now,
        completedAt: now,
        lastError: undefined,
        updatedAt: now,
      },
    };
  } catch (err: any) {
    const error = err instanceof Error ? err.message : String(err);
    const isMissing = /not found|404|no such/i.test(error);
    return {
      verified: false,
      error,
      record: {
        ...record,
        replicationState: "FAILED",
        verificationStatus: isMissing ? "MISSING" : "CORRUPTED",
        lastError: error,
        updatedAt: now,
      },
    };
  }
}

/**
 * Execute a safe restore drill in a test or non-production environment.
 * Locates verified replica, downloads bytes, validates SHA-256/size, and restores
 * to a controlled target destination. NEVER overwrites production.
 */
export async function executeRestoreVerification(input: {
  manifest: BackupReplicaRecord;
  backupProvider: DocumentStorageProvider;
  restoreTargetProvider: DocumentStorageProvider;
  restoreTargetKey: string;
  restoreTargetBucket?: string;
}): Promise<{
  success: boolean;
  restoredSha256: string;
  sizeBytes: number;
  restoreTargetKey: string;
  error?: string;
}> {
  const { manifest, backupProvider, restoreTargetProvider, restoreTargetKey, restoreTargetBucket } = input;

  if (manifest.replicationState !== "VERIFIED") {
    throw new StorageError(
      `Cannot execute restore verification for unverified replica (current state: ${manifest.replicationState})`,
      "RESTORE_UNVERIFIED_REPLICA",
      400,
    );
  }

  // Prevent accidental production overwrite: restoreTargetKey must contain test/restore prefix
  if (!restoreTargetKey.includes("/restore/") && !restoreTargetKey.includes("/test/")) {
    throw new StorageError(
      `Restore verification target key "${restoreTargetKey}" must contain "/restore/" or "/test/" to prevent production overwrite.`,
      "INVALID_RESTORE_TARGET",
      400,
    );
  }

  // 1. Download replica bytes
  const replica = await backupProvider.getObject({
    companyId: manifest.companyId,
    bucket: manifest.replicaBucket,
    key: manifest.replicaKey,
  });

  // 2. Validate SHA-256 and size
  const actualHash = await calculateSha256Hex(replica.bytes);
  if (actualHash !== manifest.sha256 || replica.bytes.byteLength !== manifest.sizeBytes) {
    throw new StorageIntegrityError(
      `Restore verification failed: replica bytes do not match manifest (size: ${replica.bytes.byteLength}/${manifest.sizeBytes}, hash: ${actualHash}/${manifest.sha256})`,
    );
  }

  // 3. Put to target restore destination
  const putResult = await restoreTargetProvider.putObject({
    companyId: manifest.companyId,
    bucket: restoreTargetBucket || manifest.replicaBucket,
    key: restoreTargetKey,
    bytes: replica.bytes,
    contentType: replica.metadata.contentType || "application/octet-stream",
    sha256: manifest.sha256,
  });

  // 4. Verify target bytes
  const verifyTarget = await restoreTargetProvider.getObject({
    companyId: manifest.companyId,
    bucket: restoreTargetBucket || manifest.replicaBucket,
    key: restoreTargetKey,
  });

  const verifiedHash = await calculateSha256Hex(verifyTarget.bytes);
  if (verifiedHash !== manifest.sha256) {
    throw new StorageIntegrityError("Restore target verification failed post-upload integrity check.");
  }

  return {
    success: true,
    restoredSha256: verifiedHash,
    sizeBytes: verifyTarget.bytes.byteLength,
    restoreTargetKey,
  };
}
