/**
 * In-memory DocumentStorageProvider for unit testing and deterministic simulation.
 */

import {
  type DocumentStorageProvider,
  type GetObjectResult,
  type ObjectLookupQuery,
  type ObjectMetadata,
  type PutObjectInput,
  type PutObjectResult,
  type ReadUrlOptions,
  ObjectNotFoundError,
  StorageError,
  StorageIntegrityError,
} from "../types.ts";
import { calculateSha256Hex, normalizeSha256 } from "../dedup.ts";
import { isCompanyScopedPath } from "../keys.ts";

export class MemoryStorageProvider implements DocumentStorageProvider {
  readonly id = "memory" as const;
  private readonly store = new Map<string, { bytes: Uint8Array; metadata: ObjectMetadata }>();

  private makeStoreKey(companyId: string, bucket: string, key: string): string {
    return `${companyId}:${bucket}:${key}`;
  }

  private validateCompanyBoundary(companyId: string, key: string): void {
    if (!companyId) throw new StorageError("Tenant company ID is required for storage operations.");
    if (!isCompanyScopedPath(key, companyId)) {
      throw new StorageError(`Storage key "${key}" violates company scope for company "${companyId}".`);
    }
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

    const metadata: ObjectMetadata = {
      companyId: input.companyId,
      bucket: input.bucket,
      key: input.key,
      sizeBytes: input.bytes.byteLength,
      contentType: input.contentType,
      sha256: calculatedHash,
      createdAt: new Date().toISOString(),
      customMetadata: input.customMetadata,
    };

    this.store.set(this.makeStoreKey(input.companyId, input.bucket, input.key), {
      bytes: new Uint8Array(input.bytes),
      metadata,
    });

    return {
      ref: {
        providerId: this.id,
        bucket: input.bucket,
        key: input.key,
        companyId: input.companyId,
        sha256: calculatedHash,
        sizeBytes: input.bytes.byteLength,
        contentType: input.contentType,
      },
      metadata,
    };
  }

  async getObject(query: ObjectLookupQuery): Promise<GetObjectResult> {
    this.validateCompanyBoundary(query.companyId, query.key);

    const item = this.store.get(this.makeStoreKey(query.companyId, query.bucket, query.key));
    if (!item) throw new ObjectNotFoundError(query.bucket, query.key);

    return {
      bytes: new Uint8Array(item.bytes),
      metadata: { ...item.metadata },
    };
  }

  async getSignedUrl(query: ObjectLookupQuery, options?: ReadUrlOptions): Promise<string> {
    this.validateCompanyBoundary(query.companyId, query.key);

    const item = this.store.get(this.makeStoreKey(query.companyId, query.bucket, query.key));
    if (!item) throw new ObjectNotFoundError(query.bucket, query.key);

    const expires = options?.expiresInSeconds || 3600;
    return `https://mock-storage.engoryx.internal/${query.bucket}/${encodeURIComponent(query.key)}?token=mock_sig&expires=${expires}`;
  }

  async deleteObject(query: ObjectLookupQuery): Promise<void> {
    this.validateCompanyBoundary(query.companyId, query.key);
    this.store.delete(this.makeStoreKey(query.companyId, query.bucket, query.key));
  }

  async headObject(query: ObjectLookupQuery): Promise<ObjectMetadata | null> {
    this.validateCompanyBoundary(query.companyId, query.key);
    const item = this.store.get(this.makeStoreKey(query.companyId, query.bucket, query.key));
    return item ? { ...item.metadata } : null;
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}
