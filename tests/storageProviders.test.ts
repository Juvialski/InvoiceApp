import test from "node:test";
import assert from "node:assert/strict";
import {
  createPresignedS3Url,
  createStorageProvider,
  getPrimaryStorageProvider,
  getStorageHealth,
  loadStorageConfig,
  signS3Request,
  MemoryStorageProvider,
  ObjectNotFoundError,
  S3StorageProvider,
  StorageConfigurationError,
  StorageIntegrityError,
  SupabaseStorageProvider,
} from "../src/lib/storage/index.ts";

test("s3Signer creates valid AWS SigV4 authorization headers", async () => {
  const options = {
    method: "PUT",
    url: "https://my-account.r2.cloudflarestorage.com/my-bucket/companies/11111111-2222-3333-4444-555555555555/objects/doc-1/v1/inv.pdf",
    credentials: {
      accessKeyId: "TEST_ACCESS_KEY",
      secretAccessKey: "TEST_SECRET_KEY_12345",
      region: "auto",
    },
    bodyBytes: new TextEncoder().encode("Hello S3 SigV4"),
    timestamp: new Date("2026-09-01T12:00:00Z"),
  };

  const signed = await signS3Request(options);
  assert.ok(signed.headers.authorization);
  assert.match(
    signed.headers.authorization,
    /^AWS4-HMAC-SHA256 Credential=TEST_ACCESS_KEY\/20260901\/auto\/s3\/aws4_request, SignedHeaders=/,
  );
  assert.equal(signed.headers["x-amz-date"], "20260901T120000Z");
  assert.ok(signed.headers["x-amz-content-sha256"]);
});

test("createPresignedS3Url creates valid presigned URL query parameters", async () => {
  const url = await createPresignedS3Url({
    method: "GET",
    url: "https://my-account.r2.cloudflarestorage.com/my-bucket/companies/11111111-2222-3333-4444-555555555555/objects/doc-1/v1/inv.pdf",
    credentials: {
      accessKeyId: "TEST_ACCESS_KEY",
      secretAccessKey: "TEST_SECRET_KEY_12345",
      region: "auto",
    },
    expiresInSeconds: 1800,
    timestamp: new Date("2026-09-01T12:00:00Z"),
  });

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(
    parsed.searchParams.get("X-Amz-Credential"),
    "TEST_ACCESS_KEY/20260901/auto/s3/aws4_request",
  );
  assert.equal(parsed.searchParams.get("X-Amz-Date"), "20260901T120000Z");
  assert.equal(parsed.searchParams.get("X-Amz-Expires"), "1800");
  assert.ok(parsed.searchParams.get("X-Amz-Signature"));
});

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

test("S3StorageProvider works with mock HTTP fetch and redacts credentials", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const bucket = "test-bucket";
  const key = `companies/${companyId}/objects/doc-100/v1/inv.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 Mock S3 content");

  const mockStore = new Map<string, { bytes: Uint8Array; headers: Record<string, string> }>();

  // Mock global fetch for S3 tests
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || "GET";

    if (method === "PUT") {
      const body = init?.body as unknown as Uint8Array;
      mockStore.set(urlStr.split("?")[0], {
        bytes: body || new Uint8Array(),
        headers: {
          "content-type": (init?.headers as Record<string, string>)?.[("content-type")] || "application/octet-stream",
          "content-length": String(body?.byteLength || 0),
        },
      });
      return new Response(null, { status: 200 });
    }

    if (method === "GET") {
      const item = mockStore.get(urlStr.split("?")[0]);
      if (!item) return new Response("NoSuchKey", { status: 404 });
      return new Response(item.bytes.buffer as ArrayBuffer, {
        status: 200,
        headers: item.headers,
      });
    }

    if (method === "HEAD") {
      const item = mockStore.get(urlStr.split("?")[0]);
      if (!item) return new Response(null, { status: 404 });
      return new Response(null, {
        status: 200,
        headers: item.headers,
      });
    }

    if (method === "DELETE") {
      mockStore.delete(urlStr.split("?")[0]);
      return new Response(null, { status: 204 });
    }

    return new Response("Not found", { status: 404 });
  }) as typeof fetch;

  try {
    const s3Provider = new S3StorageProvider({
      endpoint: "https://test-account.r2.cloudflarestorage.com",
      bucket,
      accessKeyId: "SECRET_KEY_ID_ABCD",
      secretAccessKey: "SUPER_SECRET_ACCESS_KEY_XYZ",
      region: "auto",
      forcePathStyle: true,
    });

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

    // 2. Head
    const headRes = await s3Provider.headObject({ companyId, bucket, key });
    assert.ok(headRes);
    assert.equal(headRes.sizeBytes, bytes.byteLength);

    // 3. Get
    const getRes = await s3Provider.getObject({ companyId, bucket, key });
    assert.equal(getRes.bytes.byteLength, bytes.byteLength);

    // 4. Presigned URL
    const presignedUrl = await s3Provider.getSignedUrl({ companyId, bucket, key }, { expiresInSeconds: 600 });
    assert.ok(presignedUrl.includes("X-Amz-Signature"));

    // 5. Delete
    await s3Provider.deleteObject({ companyId, bucket, key });
    const afterDelete = await s3Provider.headObject({ companyId, bucket, key });
    assert.equal(afterDelete, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadStorageConfig correctly parses provider selection and S3 options", () => {
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

  // In-memory
  const memCfg = loadStorageConfig({ STORAGE_PRIMARY_PROVIDER: "memory" });
  assert.equal(memCfg.primaryProvider, "memory");

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

test("createStorageProvider fails safely on incomplete configuration", () => {
  assert.throws(
    () => createStorageProvider("s3", { primaryProvider: "s3" }),
    StorageConfigurationError,
  );
  assert.throws(
    () => createStorageProvider("supabase"),
    StorageConfigurationError,
  );
});
