import type { S3ProviderConfig } from "../storage/types.ts";

export type DatabaseBackupType = "LOGICAL_FULL" | "SCHEMA_ONLY" | "DATA_ONLY";

export type DatabaseBackupStatus =
  | "PENDING"
  | "EXPORTING"
  | "ENCRYPTING"
  | "UPLOADING"
  | "VERIFYING"
  | "VERIFIED"
  | "FAILED";

export type DatabaseBackupVerificationStatus =
  | "UNVERIFIED"
  | "MATCHED"
  | "CORRUPTED"
  | "MISSING";

/**
 * Manifest record representing an encrypted logical export of the database.
 */
export interface DatabaseBackupRunRecord {
  id: string;
  companyId: string;
  backupType: DatabaseBackupType;
  databaseScope: string;
  storageProvider: "s3" | "memory";
  storageBucket: string;
  storageKey: string;
  encryptionAlgorithm: "AES-256-GCM";
  encryptionKeyId: string;
  encryptedSizeBytes: number;
  encryptedSha256: string;
  plaintextSha256?: string | null;
  pgDumpVersion?: string | null;
  appVersion?: string | null;
  schemaVersion?: string | null;
  status: DatabaseBackupStatus;
  verificationStatus: DatabaseBackupVerificationStatus;
  startedAt: string;
  completedAt?: string | null;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DatabaseRestoreDrillStatus = "STARTED" | "SUCCESS" | "FAILED";

/**
 * Manifest record tracking non-production restore drill verification exercises.
 */
export interface DatabaseRestoreDrillRecord {
  id: string;
  companyId: string;
  backupRunId: string;
  targetEnvironment: string;
  drillStatus: DatabaseRestoreDrillStatus;
  startedAt: string;
  completedAt?: string | null;
  verifiedSchemaVersion?: string | null;
  verificationSummary: Record<string, unknown>;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Validated encryption key configuration.
 */
export interface BackupEncryptionConfig {
  key: Buffer;
  keyId: string;
  algorithm: "AES-256-GCM";
}

/**
 * Complete database backup configuration.
 */
export interface DatabaseBackupConfig {
  encryption: BackupEncryptionConfig;
  storageProvider: "s3" | "memory";
  s3Config?: S3ProviderConfig;
  restoreDrillsEnabled: boolean;
  restoreTargetUrl?: string;
  databaseUrl?: string;
}

/**
 * Options passed to a database export runner.
 */
export interface LogicalExportOptions {
  companyId: string;
  backupType: DatabaseBackupType;
  databaseUrl?: string;
  targetTables?: string[];
  excludeTables?: string[];
  tempDir?: string;
  customFlags?: string[];
}

/**
 * Result of a logical database export before encryption.
 */
export interface ExportResult {
  filePath: string;
  plaintextSha256: string;
  sizeBytes: number;
  pgDumpVersion?: string;
  cleanup: () => Promise<void>;
}

export type LogicalExportResult = ExportResult;

/**
 * Result of a non-production restore drill.
 */
export interface RestoreResult {
  success: boolean;
  targetEnvironment: string;
  verifiedSchemaVersion?: string;
  verificationSummary?: Record<string, unknown>;
  error?: string;
}

/**
 * Non-secret health inspection status for database backup subsystem.
 */
export interface DatabaseBackupHealthStatus {
  isConfigured: boolean;
  encryptionConfigured: boolean;
  keyId?: string;
  storageProvider?: "s3" | "memory";
  storageConfigured: boolean;
  storageBucket?: string;
  storageEndpoint?: string;
  restoreDrillsEnabled: boolean;
  hasRestoreTarget: boolean;
  hasSourceDatabaseUrl: boolean;
}

/**
 * Error thrown when an encrypted database backup payload has a malformed or missing header prefix.
 */
export class InvalidBackupHeaderError extends Error {
  constructor(message: string = "Invalid backup payload: missing or malformed magic header prefix.") {
    super(message);
    this.name = "InvalidBackupHeaderError";
  }
}

/**
 * Error thrown when ciphertext authentication fails (tampering, wrong key, or corrupted tag).
 */
export class DecryptionAuthenticationError extends Error {
  constructor(
    message: string = "Database backup decryption failed: authentication tag verification failed, wrong key, or corrupted ciphertext.",
  ) {
    super(message);
    this.name = "DecryptionAuthenticationError";
  }
}

/**
 * Error thrown when the backup envelope key ID does not match the expected key ID.
 */
export class KeyIdMismatchError extends Error {
  constructor(message: string = "Mismatched encryption key ID in backup envelope.") {
    super(message);
    this.name = "KeyIdMismatchError";
  }
}

/**
 * Error thrown when an invalid encryption key format or length is provided.
 */
export class InvalidEncryptionKeyError extends Error {
  constructor(message: string = "Invalid encryption key: key must be 32 bytes (256-bit).") {
    super(message);
    this.name = "InvalidEncryptionKeyError";
  }
}

/**
 * Error thrown when database backup configuration is invalid or missing required variables.
 */
export class DatabaseBackupConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseBackupConfigurationError";
  }
}

/**
 * Error thrown during database export or dump execution.
 */
export class DatabaseBackupExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseBackupExportError";
  }
}
