/**
 * Foundational backup replication contracts and manifest models.
 * Prepares the architecture for Wave S3 (Independent S3 Replicas e.g. Backblaze B2)
 * and Wave S4 (Encrypted Database Backups & Cloud Drive Archives).
 */

import type { StorageProviderId } from "./types.ts";
import { normalizeSha256 } from "./dedup.ts";

export type ReplicationState =
  | "PENDING"
  | "REPLICATING"
  | "VERIFIED"
  | "FAILED"
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
  firstReplicatedAt?: string;
  lastVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for registering an asynchronous backup replication intent after primary commit.
 */
export interface RegisterBackupInput {
  companyId: string;
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
