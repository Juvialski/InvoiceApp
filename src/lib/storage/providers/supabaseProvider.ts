/**
 * Supabase Storage provider implementation of DocumentStorageProvider.
 * Provides compatibility with existing Supabase storage buckets and RLS policies.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
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

export class SupabaseStorageProvider implements DocumentStorageProvider {
  readonly id = "supabase" as const;
  private readonly getClient: () => SupabaseClient;

  constructor(getClient: () => SupabaseClient) {
    this.getClient = getClient;
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

    const client = this.getClient();
    const { error: uploadError } = await client.storage
      .from(input.bucket)
      .upload(input.key, input.bytes, {
        contentType: input.contentType,
        upsert: input.upsert ?? false,
      });

    if (uploadError) {
      throw new StorageError(`Supabase Storage upload failed: ${uploadError.message}`);
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

    const client = this.getClient();
    const { data: blob, error: downloadError } = await client.storage
      .from(query.bucket)
      .download(query.key);

    if (downloadError || !blob) {
      if (downloadError && /not found|404/i.test(downloadError.message)) {
        throw new ObjectNotFoundError(query.bucket, query.key);
      }
      throw new StorageError(`Supabase Storage download failed: ${downloadError?.message || "Object not found"}`);
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = await calculateSha256Hex(bytes);

    return {
      bytes,
      metadata: {
        companyId: query.companyId,
        bucket: query.bucket,
        key: query.key,
        sizeBytes: bytes.byteLength,
        contentType: blob.type || "application/octet-stream",
        sha256: hash,
      },
    };
  }

  async getSignedUrl(query: ObjectLookupQuery, options?: ReadUrlOptions): Promise<string> {
    this.validateCompanyBoundary(query.companyId, query.key);

    const client = this.getClient();
    const expiresIn = options?.expiresInSeconds || 3600;

    const { data, error } = await client.storage
      .from(query.bucket)
      .createSignedUrl(query.key, expiresIn, {
        download: options?.disposition === "attachment" ? (options.downloadFilename || true) : undefined,
      });

    if (error || !data?.signedUrl) {
      throw new StorageError(`Failed to generate signed URL: ${error?.message || "unknown error"}`);
    }

    return data.signedUrl;
  }

  async deleteObject(query: ObjectLookupQuery): Promise<void> {
    this.validateCompanyBoundary(query.companyId, query.key);

    const client = this.getClient();
    const { error } = await client.storage.from(query.bucket).remove([query.key]);
    if (error) {
      throw new StorageError(`Supabase Storage deletion failed: ${error.message}`);
    }
  }

  async headObject(query: ObjectLookupQuery): Promise<ObjectMetadata | null> {
    this.validateCompanyBoundary(query.companyId, query.key);

    const client = this.getClient();
    // Supabase storage list API to check object existence and metadata
    const pathParts = query.key.split("/");
    const fileName = pathParts.pop() || "";
    const folder = pathParts.join("/");

    const { data, error } = await client.storage.from(query.bucket).list(folder, {
      search: fileName,
      limit: 1,
    });

    if (error || !data || data.length === 0) return null;
    const match = data.find((item) => item.name === fileName);
    if (!match) return null;

    return {
      companyId: query.companyId,
      bucket: query.bucket,
      key: query.key,
      sizeBytes: match.metadata?.size || 0,
      contentType: match.metadata?.mimetype || "application/octet-stream",
      sha256: (match.metadata as Record<string, any>)?.sha256 || "",
      etag: match.metadata?.eTag?.replace(/["']/g, "") || undefined,
      createdAt: match.created_at,
      updatedAt: match.updated_at,
    };
  }
}
