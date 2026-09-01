/**
 * Production S3-compatible DocumentStorageProvider implementation.
 * Uses official modular @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner.
 * Configured for Cloudflare R2, AWS S3, and other S3-compatible private object stores.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  type DocumentStorageProvider,
  type GetObjectResult,
  type ObjectLookupQuery,
  type ObjectMetadata,
  type PutObjectInput,
  type PutObjectResult,
  type ReadUrlOptions,
  type S3ProviderConfig,
  ObjectNotFoundError,
  StorageConfigurationError,
  StorageError,
  StorageIntegrityError,
} from "../types.ts";
import { calculateSha256Hex, normalizeSha256 } from "../dedup.ts";
import { isCompanyScopedPath } from "../keys.ts";

export class S3StorageProvider implements DocumentStorageProvider {
  readonly id = "s3" as const;
  private readonly config: S3ProviderConfig;
  private readonly client: S3Client;

  constructor(config: S3ProviderConfig, injectedClient?: S3Client) {
    if (!config.endpoint) throw new StorageConfigurationError("S3 storage endpoint is required.");
    if (!config.accessKeyId) throw new StorageConfigurationError("S3 accessKeyId is required.");
    if (!config.secretAccessKey) throw new StorageConfigurationError("S3 secretAccessKey is required.");

    this.config = {
      ...config,
      endpoint: config.endpoint.replace(/\/+$/, ""),
      region: config.region || "auto",
      forcePathStyle: config.forcePathStyle ?? true, // Cloudflare R2 default
    };

    this.client =
      injectedClient ||
      new S3Client({
        endpoint: this.config.endpoint,
        region: this.config.region,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
        forcePathStyle: this.config.forcePathStyle,
      });
  }

  private validateCompanyBoundary(companyId: string, key: string): void {
    if (!companyId) throw new StorageError("Tenant company ID is required for storage operations.");
    if (!isCompanyScopedPath(key, companyId)) {
      throw new StorageError(`Storage key "${key}" violates company scope for company "${companyId}".`);
    }
  }

  /**
   * Sanitize error message to prevent access keys or secret keys from leaking in logs.
   */
  private sanitizeError(error: unknown): string {
    let message = error instanceof Error ? error.message : String(error || "unknown error");
    if (this.config.secretAccessKey) {
      message = message.replaceAll(this.config.secretAccessKey, "[REDACTED_SECRET]");
    }
    if (this.config.accessKeyId) {
      message = message.replaceAll(this.config.accessKeyId, "[REDACTED_KEY_ID]");
    }
    return message;
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    this.validateCompanyBoundary(input.companyId, input.key);

    const calculatedHash = await calculateSha256Hex(input.bytes);
    if (input.sha256) {
      const expected = normalizeSha256(input.sha256);
      if (calculatedHash !== expected) {
        throw new StorageIntegrityError(`SHA-256 integrity mismatch: calculated ${calculatedHash}, expected ${expected}`);
      }
    }

    const bucket = input.bucket || this.config.bucket;
    const metadata: Record<string, string> = {
      "company-id": input.companyId,
      "sha256": calculatedHash,
    };

    if (input.customMetadata) {
      for (const [k, v] of Object.entries(input.customMetadata)) {
        metadata[k.toLowerCase()] = String(v);
      }
    }

    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Body: input.bytes,
        ContentType: input.contentType,
        Metadata: metadata,
      });

      await this.client.send(command);

      const objectMeta: ObjectMetadata = {
        companyId: input.companyId,
        bucket,
        key: input.key,
        sizeBytes: input.bytes.byteLength,
        contentType: input.contentType,
        sha256: calculatedHash,
        createdAt: new Date().toISOString(),
        customMetadata: input.customMetadata,
      };

      return {
        ref: {
          providerId: this.id,
          bucket,
          key: input.key,
          companyId: input.companyId,
          sha256: calculatedHash,
          sizeBytes: input.bytes.byteLength,
          contentType: input.contentType,
        },
        metadata: objectMeta,
      };
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(`S3 upload error: ${this.sanitizeError(err)}`);
    }
  }

  async getObject(query: ObjectLookupQuery): Promise<GetObjectResult> {
    this.validateCompanyBoundary(query.companyId, query.key);

    const bucket = query.bucket || this.config.bucket;

    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: query.key,
      });

      const response = await this.client.send(command);
      const byteArray = await response.Body?.transformToByteArray();

      if (!byteArray) {
        throw new ObjectNotFoundError(bucket, query.key);
      }

      const bytes = new Uint8Array(byteArray);
      const calculatedHash = await calculateSha256Hex(bytes);

      // Verify metadata hash if present
      const storedSha256 = response.Metadata?.["sha256"];
      if (storedSha256 && calculatedHash !== normalizeSha256(storedSha256)) {
        throw new StorageIntegrityError(`S3 object failed SHA-256 integrity check: expected ${storedSha256}, calculated ${calculatedHash}`);
      }

      const contentType = response.ContentType || "application/octet-stream";
      const etag = response.ETag?.replace(/["']/g, "") || undefined;

      return {
        bytes,
        metadata: {
          companyId: response.Metadata?.["company-id"] || query.companyId,
          bucket,
          key: query.key,
          sizeBytes: bytes.byteLength,
          contentType,
          sha256: calculatedHash,
          etag,
          customMetadata: response.Metadata,
        },
      };
    } catch (err: any) {
      if (err instanceof StorageError) throw err;
      if (err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        throw new ObjectNotFoundError(bucket, query.key);
      }
      throw new StorageError(`S3 getObject error: ${this.sanitizeError(err)}`);
    }
  }

  async getSignedUrl(query: ObjectLookupQuery, options?: ReadUrlOptions): Promise<string> {
    this.validateCompanyBoundary(query.companyId, query.key);

    const bucket = query.bucket || this.config.bucket;
    const expiresIn = options?.expiresInSeconds || 3600;

    let responseContentDisposition: string | undefined;
    if (options?.disposition === "attachment" && options.downloadFilename) {
      responseContentDisposition = `attachment; filename="${encodeURIComponent(options.downloadFilename)}"`;
    } else if (options?.disposition === "inline") {
      responseContentDisposition = "inline";
    }

    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: query.key,
        ResponseContentDisposition: responseContentDisposition,
      });

      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (err) {
      throw new StorageError(`Failed to generate presigned S3 URL: ${this.sanitizeError(err)}`);
    }
  }

  async deleteObject(query: ObjectLookupQuery): Promise<void> {
    this.validateCompanyBoundary(query.companyId, query.key);

    const bucket = query.bucket || this.config.bucket;

    try {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: query.key,
      });

      await this.client.send(command);
    } catch (err) {
      throw new StorageError(`S3 deleteObject error: ${this.sanitizeError(err)}`);
    }
  }

  async headObject(query: ObjectLookupQuery): Promise<ObjectMetadata | null> {
    this.validateCompanyBoundary(query.companyId, query.key);

    const bucket = query.bucket || this.config.bucket;

    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: query.key,
      });

      const response = await this.client.send(command);
      const storedSha256 = response.Metadata?.["sha256"] || "";
      const etag = response.ETag?.replace(/["']/g, "") || undefined;

      return {
        companyId: response.Metadata?.["company-id"] || query.companyId,
        bucket,
        key: query.key,
        sizeBytes: response.ContentLength || 0,
        contentType: response.ContentType || "application/octet-stream",
        sha256: storedSha256,
        etag,
        updatedAt: response.LastModified ? response.LastModified.toISOString() : undefined,
        customMetadata: response.Metadata,
      };
    } catch (err: any) {
      if (err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw new StorageError(`S3 headObject error: ${this.sanitizeError(err)}`);
    }
  }
}
