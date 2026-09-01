/**
 * Foundational provider-neutral storage interfaces and document contracts.
 * Designed for company-scoped storage isolation, multi-provider abstraction,
 * and immutable document provenance.
 */

export type StorageProviderId = "supabase" | "memory" | "s3" | "gcs" | "custom";

/**
 * Unique identifier referencing a stored physical or logical object.
 */
export interface StoredObjectRef {
  /** Storage backend provider identifier. */
  providerId: StorageProviderId;
  /** Bucket or container name. */
  bucket: string;
  /** Full path/key within the bucket. */
  key: string;
  /** Tenant company ID owning the object. */
  companyId: string;
  /** SHA-256 hex digest of the object contents. */
  sha256?: string;
  /** Total byte size. */
  sizeBytes?: number;
  /** MIME content type. */
  contentType?: string;
  /** Optional version or revision tag. */
  versionId?: string;
}

/**
 * Metadata recorded with or retrieved from a stored object.
 */
export interface ObjectMetadata {
  companyId: string;
  bucket: string;
  key: string;
  sizeBytes: number;
  contentType: string;
  sha256: string;
  etag?: string;
  createdAt?: string;
  updatedAt?: string;
  customMetadata?: Record<string, string>;
}

/**
 * Input payload for storing a new object.
 */
export interface PutObjectInput {
  /** Target tenant company ID. */
  companyId: string;
  /** Destination bucket (optional; defaults to provider's configured bucket). */
  bucket?: string;
  /** Target path or key. */
  key: string;
  /** Raw binary data. */
  bytes: Uint8Array;
  /** Declared MIME type. */
  contentType: string;
  /** Optional pre-calculated SHA-256 hex hash for integrity verification. */
  sha256?: string;
  /** Optional key-value metadata tags. */
  customMetadata?: Record<string, string>;
  /** Whether to overwrite an existing object (defaults to false for immutability). */
  upsert?: boolean;
}

/**
 * Result returned after successfully putting an object into storage.
 */
export interface PutObjectResult {
  ref: StoredObjectRef;
  metadata: ObjectMetadata;
}

/**
 * Options for generating temporary signed access URLs.
 */
export interface ReadUrlOptions {
  /** URL lifetime in seconds (defaults to 3600 / 1 hour). */
  expiresInSeconds?: number;
  /** Suggested download file name for Content-Disposition header. */
  downloadFilename?: string;
  /** Content disposition type (inline or attachment). */
  disposition?: "inline" | "attachment";
}

/**
 * Retrieval result containing raw binary data and verified metadata.
 */
export interface GetObjectResult {
  bytes: Uint8Array;
  metadata: ObjectMetadata;
}

/**
 * Target reference key lookup payload.
 */
export interface ObjectLookupQuery {
  bucket?: string;
  key: string;
  companyId: string;
}

/**
 * Provider-neutral storage provider interface.
 */
export interface DocumentStorageProvider {
  /** Provider identifier. */
  readonly id: StorageProviderId;

  /**
   * Store an object with company isolation and integrity checks.
   */
  putObject(input: PutObjectInput): Promise<PutObjectResult>;

  /**
   * Retrieve raw bytes and verified metadata for an object.
   */
  getObject(query: ObjectLookupQuery): Promise<GetObjectResult>;

  /**
   * Generate a time-bounded signed URL for authenticated reading.
   */
  getSignedUrl(query: ObjectLookupQuery, options?: ReadUrlOptions): Promise<string>;

  /**
   * Delete an object (compensation/cleanup only; durable records should be immutable).
   */
  deleteObject(query: ObjectLookupQuery): Promise<void>;

  /**
   * Inspect object metadata without downloading binary body.
   */
  headObject(query: ObjectLookupQuery): Promise<ObjectMetadata | null>;
}

/**
 * Standard classification of durable documents across Engoryx domains.
 */
export type DocumentDomain =
  | "INVOICES"
  | "EMAIL_INTAKE"
  | "CASH_BANKING"
  | "PAYROLL"
  | "ENGINEERING";

/**
 * Document lifecycle state representing retention and mutability invariants.
 */
export type DocumentImmutabilityPolicy =
  | "IMMUTABLE_ON_COMMIT"       // Document cannot be replaced or deleted once committed to DB
  | "REVERSIBLE_LIFECYCLE"      // Document status can transition (e.g. ARCHIVE/SUPERSEDE) but binary is preserved
  | "TRANSIENT_CLEANUP_ONLY"    // Binary can only be deleted during failure compensation
  | "UNPROVENANCED_EPHEMERAL";  // In-memory or temporary upload not yet linked to DB record

/**
 * Standard Storage Errors.
 */
export class StorageError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = "STORAGE_ERROR", status = 500) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.status = status;
  }
}

export class ObjectNotFoundError extends StorageError {
  constructor(bucket: string, key: string) {
    super(`Object not found: "${bucket}/${key}"`, "OBJECT_NOT_FOUND", 404);
    this.name = "ObjectNotFoundError";
  }
}

export class StorageIntegrityError extends StorageError {
  constructor(message: string) {
    super(message, "STORAGE_INTEGRITY_ERROR", 422);
    this.name = "StorageIntegrityError";
  }
}

export class StorageConfigurationError extends StorageError {
  constructor(message: string) {
    super(message, "STORAGE_CONFIGURATION_ERROR", 503);
    this.name = "StorageConfigurationError";
  }
}

/**
 * S3-compatible provider configuration options.
 */
export interface S3ProviderConfig {
  endpoint: string;
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  publicReadUrl?: string;
}

/**
 * Server-level storage subsystem configuration.
 */
export interface StorageConfig {
  primaryProvider: StorageProviderId;
  s3?: S3ProviderConfig;
  backupProvider?: StorageProviderId;
  backupS3?: S3ProviderConfig;
}

/**
 * Storage health diagnostic summary.
 */
export interface StorageHealthStatus {
  primaryProvider: StorageProviderId;
  backupProvider?: StorageProviderId;
  isConfigured: boolean;
  details: {
    supabaseConfigured: boolean;
    s3Configured: boolean;
    s3Endpoint?: string;
    s3Bucket?: string;
    s3Region?: string;
    backupConfigured?: boolean;
    backupEndpoint?: string;
    backupBucket?: string;
    backupRegion?: string;
  };
}

