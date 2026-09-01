import test from "node:test";
import assert from "node:assert/strict";
import {
  createStorageProvider,
  getPrimaryStorageProvider,
  getStorageHealth,
  loadStorageConfig,
  MemoryStorageProvider,
  ObjectNotFoundError,
  S3StorageProvider,
  StorageConfigurationError,
  StorageIntegrityError,
  SupabaseStorageProvider,
} from "../src/lib/storage/index.ts";

test("MemoryStorageProvider handles full CRUD lifecycle and integrity", async () => {
  const provider = new MemoryStorageProvider();
  const companyId = "11111111-2222-3333-4444-555555555555";
  const bucket = "invoice-originals";
  const key = `companies/${companyId}/objects/doc-001/v1/sample.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 Mock invoice content");

  // Put
  const putResult = await provider.putObject({
    companyId,
    bucket,
    key,
    bytes,
    contentType: "application/pdf",
  });
  assert.equal(putResult.ref.companyId, companyId);
  assert.equal(putResult.metadata.sizeBytes, bytes.byteLength);

  // Hash mismatch on put
  await assert.rejects(
    provider.putObject({
      companyId,
      bucket,
      key: `companies/${companyId}/objects/doc-002/v1/bad.pdf`,
      bytes,
      contentType: "application/pdf",
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    }),
    StorageIntegrityError,
  );

  // Get
  const getResult = await provider.getObject({ companyId, bucket, key });
  assert.equal(getResult.bytes.byteLength, bytes.byteLength);
  assert.equal(new TextDecoder().decode(getResult.bytes), "%PDF-1.4 Mock invoice content");

  // Head
  const headResult = await provider.headObject({ companyId, bucket, key });
  assert.ok(headResult);
  assert.equal(headResult.sizeBytes, bytes.byteLength);

  // Signed URL
  const signedUrl = await provider.getSignedUrl({ companyId, bucket, key });
  assert.ok(signedUrl.includes(bucket));

  // Delete
  await provider.deleteObject({ companyId, bucket, key });
  const afterDelete = await provider.headObject({ companyId, bucket, key });
  assert.equal(afterDelete, null);

  await assert.rejects(
    provider.getObject({ companyId, bucket, key }),
    ObjectNotFoundError,
  );
});

test("S3StorageProvider works with mock client and preserves sha256/etag metadata", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const bucket = "test-bucket";
  const key = `companies/${companyId}/objects/doc-100/v1/inv.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 Mock S3 content");

  const mockStore = new Map<string, { bytes: Uint8Array; metadata: Record<string, string>; contentType: string }>();

  // Mock S3Client instance
  const { S3Client } = await import("@aws-sdk/client-s3");
  const mockClient = new S3Client({
    endpoint: "https://test-account.r2.cloudflarestorage.com",
    region: "auto",
    credentials: {
      accessKeyId: "SECRET_KEY_ID_ABCD",
      secretAccessKey: "SUPER_SECRET_ACCESS_KEY_XYZ",
    },
  });

  mockClient.send = (async (command: any): Promise<any> => {
    const name = command.constructor.name;
    const input = command.input;

    if (name === "PutObjectCommand") {
      mockStore.set(`${input.Bucket}/${input.Key}`, {
        bytes: input.Body as Uint8Array,
        metadata: input.Metadata || {},
        contentType: input.ContentType || "application/octet-stream",
      });
      return {
        ETag: '"mock-s3-etag-12345"',
      };
    }

    if (name === "GetObjectCommand") {
      const item = mockStore.get(`${input.Bucket}/${input.Key}`);
      if (!item) {
        const notFoundErr = new Error("NoSuchKey");
        notFoundErr.name = "NoSuchKey";
        throw notFoundErr;
      }
      return {
        Body: {
          transformToByteArray: async () => item.bytes,
        },
        ContentType: item.contentType,
        Metadata: item.metadata,
        ETag: '"mock-s3-etag-12345"',
        ContentLength: item.bytes.byteLength,
      };
    }

    if (name === "HeadObjectCommand") {
      const item = mockStore.get(`${input.Bucket}/${input.Key}`);
      if (!item) {
        const notFoundErr = new Error("NotFound");
        notFoundErr.name = "NotFound";
        throw notFoundErr;
      }
      return {
        ContentLength: item.bytes.byteLength,
        ContentType: item.contentType,
        Metadata: item.metadata,
        ETag: '"mock-s3-etag-12345"',
        LastModified: new Date(),
      };
    }

    if (name === "DeleteObjectCommand") {
      mockStore.delete(`${input.Bucket}/${input.Key}`);
      return {};
    }

    throw new Error(`Unhandled mock command: ${name}`);
  }) as any;

  const s3Provider = new S3StorageProvider(
    {
      endpoint: "https://test-account.r2.cloudflarestorage.com",
      bucket,
      accessKeyId: "SECRET_KEY_ID_ABCD",
      secretAccessKey: "SUPER_SECRET_ACCESS_KEY_XYZ",
      region: "auto",
      forcePathStyle: true,
    },
    mockClient,
  );

  // 1. Put
  const putRes = await s3Provider.putObject({
    companyId,
    bucket,
    key,
    bytes,
    contentType: "application/pdf",
  });
  assert.equal(putRes.ref.companyId, companyId);
  assert.equal(putRes.ref.providerId, "s3");

  // 2. Head - verifies explicit sha256 is preserved and etag is distinct
  const headRes = await s3Provider.headObject({ companyId, bucket, key });
  assert.ok(headRes);
  assert.equal(headRes.sizeBytes, bytes.byteLength);
  assert.ok(headRes.sha256);
  assert.equal(headRes.etag, "mock-s3-etag-12345");

  // 3. Get
  const getRes = await s3Provider.getObject({ companyId, bucket, key });
  assert.equal(getRes.bytes.byteLength, bytes.byteLength);
  assert.equal(getRes.metadata.etag, "mock-s3-etag-12345");

  // 4. Presigned URL via AWS SDK presigner
  const presignedUrl = await s3Provider.getSignedUrl({ companyId, bucket, key }, { expiresInSeconds: 600 });
  assert.ok(presignedUrl.includes("X-Amz-Signature"));
  assert.ok(presignedUrl.includes("X-Amz-Credential"));

  // 5. Delete
  await s3Provider.deleteObject({ companyId, bucket, key });
  const afterDelete = await s3Provider.headObject({ companyId, bucket, key });
  assert.equal(afterDelete, null);
});

test("loadStorageConfig strictly validates provider selection and fails closed on invalid configs", () => {
  // Default to supabase
  const defaultCfg = loadStorageConfig({});
  assert.equal(defaultCfg.primaryProvider, "supabase");

  // Explicit S3/R2
  const r2Cfg = loadStorageConfig({
    STORAGE_PRIMARY_PROVIDER: "s3",
    CLOUDFLARE_R2_ENDPOINT: "https://abc.r2.cloudflarestorage.com",
    CLOUDFLARE_R2_BUCKET: "engoryx-test-bucket",
    CLOUDFLARE_R2_ACCESS_KEY_ID: "key123",
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: "sec456",
  });
  assert.equal(r2Cfg.primaryProvider, "s3");
  assert.ok(r2Cfg.s3);
  assert.equal(r2Cfg.s3.endpoint, "https://abc.r2.cloudflarestorage.com");
  assert.equal(r2Cfg.s3.bucket, "engoryx-test-bucket");
  assert.equal(r2Cfg.s3.accessKeyId, "key123");

  // In-memory allowed only in non-production
  const memCfg = loadStorageConfig({ STORAGE_PRIMARY_PROVIDER: "memory", NODE_ENV: "test" });
  assert.equal(memCfg.primaryProvider, "memory");

  // In-memory strictly forbidden in production
  assert.throws(
    () => loadStorageConfig({ STORAGE_PRIMARY_PROVIDER: "memory", NODE_ENV: "production" }),
    StorageConfigurationError,
  );

  // Unsupported provider IDs must fail closed, never silently default
  assert.throws(
    () => loadStorageConfig({ STORAGE_PRIMARY_PROVIDER: "gcs" }),
    StorageConfigurationError,
  );
  assert.throws(
    () => loadStorageConfig({ STORAGE_PRIMARY_PROVIDER: "custom" }),
    StorageConfigurationError,
  );
  assert.throws(
    () => loadStorageConfig({ STORAGE_PRIMARY_PROVIDER: "azure" }),
    StorageConfigurationError,
  );

  // Health summary does NOT leak secrets
  const health = getStorageHealth({
    STORAGE_PRIMARY_PROVIDER: "s3",
    CLOUDFLARE_R2_ENDPOINT: "https://abc.r2.cloudflarestorage.com",
    CLOUDFLARE_R2_ACCESS_KEY_ID: "sensitive_key_id",
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: "sensitive_secret_key",
  });
  const healthStr = JSON.stringify(health);
  assert.equal(healthStr.includes("sensitive_key_id"), false);
  assert.equal(healthStr.includes("sensitive_secret_key"), false);
  assert.equal(health.isConfigured, true);
});

test("createStorageProvider fails safely on incomplete or unsupported configuration", () => {
  assert.throws(
    () => createStorageProvider("s3", { primaryProvider: "s3" }),
    StorageConfigurationError,
  );
  assert.throws(
    () => createStorageProvider("supabase"),
    StorageConfigurationError,
  );
  assert.throws(
    () => createStorageProvider("gcs" as any),
    StorageConfigurationError,
  );
});
