/**
 * S3-compatible DocumentStorageProvider implementation.
 * Supports Cloudflare R2, MinIO, AWS S3, and other S3-compatible private object stores.
 */

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
import { createPresignedS3Url, signS3Request } from "../s3Signer.ts";

export class S3StorageProvider implements DocumentStorageProvider {
  readonly id = "s3" as const;
  private readonly config: S3ProviderConfig;

  constructor(config: S3ProviderConfig) {
    if (!config.endpoint) throw new StorageConfigurationError("S3 storage endpoint is required.");
    if (!config.accessKeyId) throw new StorageConfigurationError("S3 accessKeyId is required.");
    if (!config.secretAccessKey) throw new StorageConfigurationError("S3 secretAccessKey is required.");

    this.config = {
      ...config,
      endpoint: config.endpoint.replace(/\/+$/, ""),
      region: config.region || "auto",
      forcePathStyle: config.forcePathStyle ?? true, // Cloudflare R2 and MinIO use path-style by default
    };
  }

  private validateCompanyBoundary(companyId: string, key: string): void {
    if (!companyId) throw new StorageError("Tenant company ID is required for storage operations.");
    if (!isCompanyScopedPath(key, companyId)) {
      throw new StorageError(`Storage key "${key}" violates company scope for company "${companyId}".`);
    }
  }

  /**
   * Build the full URL for an S3 object key.
   */
  private buildObjectUrl(bucket: string, key: string): string {
    const cleanKey = key.replace(/^\/+/, "");
    if (this.config.forcePathStyle) {
      return `${this.config.endpoint}/${encodeURIComponent(bucket)}/${cleanKey}`;
    }
    const endpointUrl = new URL(this.config.endpoint);
    return `${endpointUrl.protocol}//${bucket}.${endpointUrl.host}/${cleanKey}`;
  }

  /**
   * Sanitize error message to ensure no secret access keys or credentials leak into logs or responses.
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
    const url = this.buildObjectUrl(bucket, input.key);

    const customHeaders: Record<string, string> = {
      "content-type": input.contentType,
      "x-amz-meta-company-id": input.companyId,
      "x-amz-meta-sha256": calculatedHash,
    };

    if (input.customMetadata) {
      for (const [k, v] of Object.entries(input.customMetadata)) {
        customHeaders[`x-amz-meta-${k.toLowerCase()}`] = String(v);
      }
    }

    try {
      const signed = await signS3Request({
        method: "PUT",
        url,
        headers: customHeaders,
        bodyBytes: input.bytes,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
          region: this.config.region,
          service: "s3",
        },
      });

      const response = await fetch(signed.url, {
        method: "PUT",
        headers: signed.headers,
        body: input.bytes as unknown as BodyInit,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new StorageError(`S3 PUT object failed (${response.status}): ${this.sanitizeError(errorText)}`, "S3_UPLOAD_FAILED", response.status);
      }

      const metadata: ObjectMetadata = {
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
        metadata,
      };
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(`S3 upload error: ${this.sanitizeError(err)}`);
    }
  }

  async getObject(query: ObjectLookupQuery): Promise<GetObjectResult> {
    this.validateCompanyBoundary(query.companyId, query.key);

    const bucket = query.bucket || this.config.bucket;
    const url = this.buildObjectUrl(bucket, query.key);

    try {
      const signed = await signS3Request({
        method: "GET",
        url,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
          region: this.config.region,
          service: "s3",
        },
      });

      const response = await fetch(signed.url, {
        method: "GET",
        headers: signed.headers,
      });

      if (response.status === 404) {
        throw new ObjectNotFoundError(bucket, query.key);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new StorageError(`S3 GET object failed (${response.status}): ${this.sanitizeError(errorText)}`, "S3_GET_FAILED", response.status);
      }

      const arrayBuf = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      const hash = await calculateSha256Hex(bytes);

      const contentType = response.headers.get("content-type") || "application/octet-stream";

      return {
        bytes,
        metadata: {
          companyId: query.companyId,
          bucket,
          key: query.key,
          sizeBytes: bytes.byteLength,
          contentType,
          sha256: hash,
        },
      };
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(`S3 getObject error: ${this.sanitizeError(err)}`);
    }
  }

  async getSignedUrl(query: ObjectLookupQuery, options?: ReadUrlOptions): Promise<string> {
    this.validateCompanyBoundary(query.companyId, query.key);

    const bucket = query.bucket || this.config.bucket;
    const baseUrl = this.buildObjectUrl(bucket, query.key);
    const parsed = new URL(baseUrl);

    if (options?.disposition === "attachment" && options.downloadFilename) {
      parsed.searchParams.set("response-content-disposition", `attachment; filename="${encodeURIComponent(options.downloadFilename)}"`);
    } else if (options?.disposition === "inline") {
      parsed.searchParams.set("response-content-disposition", "inline");
    }

    return createPresignedS3Url({
      method: "GET",
      url: parsed.toString(),
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        region: this.config.region,
        service: "s3",
      },
      expiresInSeconds: options?.expiresInSeconds || 3600,
    });
  }

  async deleteObject(query: ObjectLookupQuery): Promise<void> {
    this.validateCompanyBoundary(query.companyId, query.key);

    const bucket = query.bucket || this.config.bucket;
    const url = this.buildObjectUrl(bucket, query.key);

    try {
      const signed = await signS3Request({
        method: "DELETE",
        url,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
          region: this.config.region,
          service: "s3",
        },
      });

      const response = await fetch(signed.url, {
        method: "DELETE",
        headers: signed.headers,
      });

      if (!response.ok && response.status !== 404 && response.status !== 204) {
        const errorText = await response.text().catch(() => "");
        throw new StorageError(`S3 DELETE object failed (${response.status}): ${this.sanitizeError(errorText)}`, "S3_DELETE_FAILED", response.status);
      }
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(`S3 deleteObject error: ${this.sanitizeError(err)}`);
    }
  }

  async headObject(query: ObjectLookupQuery): Promise<ObjectMetadata | null> {
    this.validateCompanyBoundary(query.companyId, query.key);

    const bucket = query.bucket || this.config.bucket;
    const url = this.buildObjectUrl(bucket, query.key);

    try {
      const signed = await signS3Request({
        method: "HEAD",
        url,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
          region: this.config.region,
          service: "s3",
        },
      });

      const response = await fetch(signed.url, {
        method: "HEAD",
        headers: signed.headers,
      });

      if (response.status === 404) return null;
      if (!response.ok) {
        throw new StorageError(`S3 HEAD object failed (${response.status})`, "S3_HEAD_FAILED", response.status);
      }

      const contentLength = Number(response.headers.get("content-length") || 0);
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const sha256 = response.headers.get("x-amz-meta-sha256") || response.headers.get("etag")?.replace(/["']/g, "") || "";
      const lastModified = response.headers.get("last-modified") || undefined;

      return {
        companyId: query.companyId,
        bucket,
        key: query.key,
        sizeBytes: contentLength,
        contentType,
        sha256,
        updatedAt: lastModified ? new Date(lastModified).toISOString() : undefined,
      };
    } catch (err) {
      if (err instanceof ObjectNotFoundError) return null;
      if (err instanceof StorageError) throw err;
      throw new StorageError(`S3 headObject error: ${this.sanitizeError(err)}`);
    }
  }
}
