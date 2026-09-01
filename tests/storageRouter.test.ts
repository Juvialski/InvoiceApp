import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { S3Client } from "@aws-sdk/client-s3";
import {
  createStorageRouter,
  StorageApiError,
  type StorageAuthContext,
} from "../src/server/storage/storageRouter.ts";
import {
  compensateFailedUpload,
  getStorageServerServiceRoleClient,
} from "../src/server/storage/storageCompensation.ts";
import { MemoryStorageProvider } from "../src/lib/storage/providers/memoryProvider.ts";
import { S3StorageProvider } from "../src/lib/storage/providers/s3Provider.ts";
import { calculateSha256Hex } from "../src/lib/storage/dedup.ts";
import { getStorageHealth } from "../src/lib/storage/config.ts";
import { StorageError } from "../src/lib/storage/types.ts";

function setupTestServer(options?: Parameters<typeof createStorageRouter>[0]) {
  const app = express();
  app.use(express.json({ limit: "16mb" }));
  app.use("/api/documents", createStorageRouter(options));
  app.get("/api/storage/health", (_req, res) => res.json(getStorageHealth(process.env)));

  const server = http.createServer(app);
  return new Promise<{ server: http.Server; url: string }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

test("Storage Router Authorization: Rejects unauthenticated requests with 401", async () => {
  const { server, url } = await setupTestServer();
  try {
    const res = await fetch(`${url}/api/documents/manual-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileData: "dGVzdA==", mimeType: "application/pdf", fileName: "test.pdf" }),
    });
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.code, "UNAUTHENTICATED");
  } finally {
    server.close();
  }
});

test("Storage Router Authorization: Rejects user with invoices.extract but missing invoices.manage with 403", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const userPermissions = new Set(["invoices.extract", "invoices.read"]); // Has extract, lacks manage

  const { server, url } = await setupTestServer({
    authorizer: async (_req, requiredPermission) => {
      if (!userPermissions.has(requiredPermission)) {
        throw new StorageApiError(403, "FORBIDDEN", `Permission "${requiredPermission}" is required for this operation.`);
      }
      return {
        accessToken: "test-token",
        companyId,
        user: { id: "user-extract-only" } as any,
        supabase: {} as any,
      };
    },
  });

  try {
    const res = await fetch(`${url}/api/documents/manual-source`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer test-token",
        "x-company-id": companyId,
      },
      body: JSON.stringify({
        fileData: Buffer.from("%PDF-1.4 sample content").toString("base64"),
        mimeType: "application/pdf",
        fileName: "invoice.pdf",
      }),
    });

    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.code, "FORBIDDEN");
  } finally {
    server.close();
  }
});

test("Real S3 Router Test: Configured physical bucket 'engoryx-production-documents' is used for upload, DB metadata, signed preview, and compensation", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const configuredBucket = "engoryx-production-documents";
  const s3Store = new Map<string, { bytes: Uint8Array; metadata: Record<string, string>; contentType: string }>();

  // Mock AWS S3 client
  const mockS3Client = new S3Client({
    region: "auto",
    credentials: { accessKeyId: "KEY", secretAccessKey: "SECRET" },
  });

  mockS3Client.send = (async (command: any): Promise<any> => {
    const name = command.constructor.name;
    const input = command.input;

    if (name === "PutObjectCommand") {
      s3Store.set(`${input.Bucket}/${input.Key}`, {
        bytes: input.Body as Uint8Array,
        metadata: input.Metadata || {},
        contentType: input.ContentType || "application/octet-stream",
      });
      return { ETag: '"mock-s3-etag"' };
    }
    if (name === "GetObjectCommand") {
      const item = s3Store.get(`${input.Bucket}/${input.Key}`);
      if (!item) {
        const err = new Error("NoSuchKey");
        err.name = "NoSuchKey";
        throw err;
      }
      return {
        Body: { transformToByteArray: async () => item.bytes },
        ContentType: item.contentType,
        Metadata: item.metadata,
        ETag: '"mock-s3-etag"',
        ContentLength: item.bytes.byteLength,
      };
    }
    if (name === "HeadObjectCommand") {
      const item = s3Store.get(`${input.Bucket}/${input.Key}`);
      if (!item) {
        const err = new Error("NotFound");
        err.name = "NotFound";
        throw err;
      }
      return {
        ContentLength: item.bytes.byteLength,
        ContentType: item.contentType,
        Metadata: item.metadata,
        ETag: '"mock-s3-etag"',
        LastModified: new Date(),
      };
    }
    if (name === "DeleteObjectCommand") {
      s3Store.delete(`${input.Bucket}/${input.Key}`);
      return {};
    }
    throw new Error(`Unhandled command: ${name}`);
  }) as any;

  const s3Provider = new S3StorageProvider(
    {
      endpoint: "https://r2-test.cloudflarestorage.com",
      bucket: configuredBucket, // Configured physical bucket
      accessKeyId: "TEST_KEY",
      secretAccessKey: "TEST_SECRET",
      region: "auto",
      forcePathStyle: true,
    },
    mockS3Client,
  );

  const dbRows: any[] = [];
  const mockSupabase: any = {
    from: (table: string) => {
      if (table === "source_documents") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          }),
          insert: (data: any) => ({
            select: () => ({
              single: async () => {
                const inserted = { id: "doc-uuid-s3-1", ...data };
                dbRows.push(inserted);
                return { data: inserted, error: null };
              },
            }),
          }),
        };
      }
      return {};
    },
  };

  const { server, url } = await setupTestServer({
    authorizer: async () => ({
      accessToken: "valid-token",
      companyId,
      user: { id: "user-manager-1" } as any,
      supabase: mockSupabase,
    }),
    primaryProviderSupplier: () => s3Provider,
    providerSupplier: () => s3Provider,
  });

  try {
    const rawPdf = "%PDF-1.4 S3 Physical Bucket Pilot Content";
    const res = await fetch(`${url}/api/documents/manual-source`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer valid-token",
        "x-company-id": companyId,
      },
      body: JSON.stringify({
        fileData: Buffer.from(rawPdf).toString("base64"),
        mimeType: "application/pdf",
        fileName: "supplier_inv_001.pdf",
      }),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.id, "doc-uuid-s3-1");
    assert.equal(json.storageProvider, "s3");
    // Verify configured physical bucket was used and recorded in DB, NOT hardcoded "invoice-originals"
    assert.equal(json.storageBucket, configuredBucket);
    assert.equal(dbRows[0].storage_bucket, configuredBucket);
    assert.equal(dbRows[0].storage_provider, "s3");
    assert.ok(json.previewUrl.includes(configuredBucket));

    // Verify the object is in s3Store under the configured bucket
    const storedKeys = Array.from(s3Store.keys());
    assert.equal(storedKeys.length, 1);
    assert.ok(storedKeys[0].startsWith(`${configuredBucket}/`));
  } finally {
    server.close();
  }
});

test("S3 Provider: Protects reserved metadata from caller override and enforces tenant isolation on read", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const s3Store = new Map<string, { bytes: Uint8Array; metadata: Record<string, string>; contentType: string }>();

  const mockS3Client = new S3Client({ region: "auto" });
  mockS3Client.send = (async (command: any): Promise<any> => {
    const name = command.constructor.name;
    const input = command.input;
    if (name === "PutObjectCommand") {
      s3Store.set(`${input.Bucket}/${input.Key}`, {
        bytes: input.Body as Uint8Array,
        metadata: input.Metadata || {},
        contentType: input.ContentType,
      });
      return { ETag: '"etag-1"' };
    }
    if (name === "GetObjectCommand") {
      const item = s3Store.get(`${input.Bucket}/${input.Key}`);
      if (!item) throw new Error("NoSuchKey");
      return {
        Body: { transformToByteArray: async () => item.bytes },
        Metadata: item.metadata,
        ContentType: item.contentType,
      };
    }
    throw new Error(`Unhandled: ${name}`);
  }) as any;

  const s3Provider = new S3StorageProvider(
    {
      endpoint: "https://r2.test",
      bucket: "test-bucket",
      accessKeyId: "KEY",
      secretAccessKey: "SECRET",
    },
    mockS3Client,
  );

  const rawBytes = new TextEncoder().encode("%PDF-1.4 Tenant Isolation Test");
  const key = `companies/${companyId}/invoices/manual/2026/09/test.pdf`;

  // Put object with malicious attempt to override reserved metadata
  await s3Provider.putObject({
    companyId,
    key,
    bytes: rawBytes,
    contentType: "application/pdf",
    customMetadata: {
      "company-id": "attacker-company-999", // Attempt to hijack company-id
      "sha256": "fake-hash-000",           // Attempt to hijack sha256
      "user-agent": "Engoryx/1.0",         // Legitimate custom metadata
    },
  });

  const stored = s3Store.get(`test-bucket/${key}`);
  assert.ok(stored);
  // Invariant: Reserved metadata MUST NOT be overwritten by customMetadata
  assert.equal(stored.metadata["company-id"], companyId);
  assert.notEqual(stored.metadata["company-id"], "attacker-company-999");
  assert.equal(stored.metadata["user-agent"], "Engoryx/1.0");

  // Read as authorized company -> succeeds
  const getOk = await s3Provider.getObject({ companyId, key });
  assert.equal(getOk.bytes.byteLength, rawBytes.byteLength);

  // Read as different company -> fails closed with tenant isolation violation
  await assert.rejects(
    s3Provider.getObject({ companyId: "other-company-uuid-8888", key: `companies/other-company-uuid-8888/invoices/manual/2026/09/test.pdf` }),
    StorageError,
  );
});

test("Storage Compensation: Real server-only privileged Supabase cleanup removes uncommitted blob", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const uncommittedKey = `companies/${companyId}/invoices/manual/2026/09/uncommitted-doc.pdf`;
  const removedKeys: string[] = [];

  const mockSupabasePrivileged: any = {
    storage: {
      from: (bucket: string) => ({
        remove: async (keys: string[]) => {
          removedKeys.push(...keys);
          return { data: keys, error: null };
        },
      }),
    },
  };

  // Mock DB with NO row for this uncommitted key
  const mockSupabaseUncommitted: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    }),
  };

  const res = await compensateFailedUpload({
    companyId,
    bucket: "invoice-originals",
    key: uncommittedKey,
    providerId: "supabase",
    supabase: mockSupabaseUncommitted,
    serverSupabaseSupplier: () => mockSupabasePrivileged,
  });

  assert.equal(res.compensated, true);
  assert.deepEqual(removedKeys, [uncommittedKey]);
});

test("Storage Compensation: Committed source documents CANNOT be removed via compensation", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const committedKey = `companies/${companyId}/invoices/manual/2026/09/committed-doc.pdf`;

  // Mock DB where the key IS present in source_documents
  const mockSupabaseWithCommittedDoc: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: async () => ({
              data: [{ id: "committed-source-doc-123" }],
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  await assert.rejects(
    compensateFailedUpload({
      companyId,
      bucket: "invoice-originals",
      key: committedKey,
      providerId: "s3",
      supabase: mockSupabaseWithCommittedDoc,
    }),
    (err: any) => {
      assert.ok(err instanceof StorageError);
      assert.ok(err.message.includes("referenced by committed source document"));
      return true;
    },
  );
});

test("Storage Compensation: Provenance DB failure aborts compensation safely without deleting", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const mockSupabaseDbError: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: async () => ({ data: null, error: { message: "Database connection lost" } }),
          }),
        }),
      }),
    }),
  };

  await assert.rejects(
    compensateFailedUpload({
      companyId,
      bucket: "invoice-originals",
      key: `companies/${companyId}/invoices/manual/2026/09/test.pdf`,
      providerId: "supabase",
      supabase: mockSupabaseDbError,
    }),
    (err: any) => {
      assert.ok(err instanceof StorageError);
      assert.ok(err.message.includes("could not verify source document provenance"));
      return true;
    },
  );
});

test("Storage Router Validation: Rejects invalid or unsupported document uploads with 400 INVALID_DOCUMENT", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const { server, url } = await setupTestServer({
    authorizer: async () => ({
      accessToken: "valid-token",
      companyId,
      user: { id: "user-mgr" } as any,
      supabase: {} as any,
    }),
  });

  try {
    // 1. Missing fileData
    const res1 = await fetch(`${url}/api/documents/manual-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer valid-token", "x-company-id": companyId },
      body: JSON.stringify({ mimeType: "application/pdf", fileName: "test.pdf" }),
    });
    assert.equal(res1.status, 400);
    const json1 = await res1.json();
    assert.equal(json1.code, "INVALID_DOCUMENT");

    // 2. Empty byte payload
    const res2 = await fetch(`${url}/api/documents/manual-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer valid-token", "x-company-id": companyId },
      body: JSON.stringify({ fileData: "", mimeType: "application/pdf", fileName: "test.pdf" }),
    });
    assert.equal(res2.status, 400);
    const json2 = await res2.json();
    assert.equal(json2.code, "INVALID_DOCUMENT");

    // 3. Executable / non-invoice signature -> returns 400 INVALID_DOCUMENT
    const res3 = await fetch(`${url}/api/documents/manual-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer valid-token", "x-company-id": companyId },
      body: JSON.stringify({
        fileData: Buffer.from("MZ executable header").toString("base64"),
        mimeType: "application/x-msdownload",
        fileName: "malware.exe",
      }),
    });
    assert.equal(res3.status, 400);
    const json3 = await res3.json();
    assert.equal(json3.code, "INVALID_DOCUMENT");
  } finally {
    server.close();
  }
});

test("Storage Router: Backup Replication and Restore Drill API Endpoints", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const primaryProvider = new MemoryStorageProvider();
  const backupProvider = new MemoryStorageProvider();

  const key = `companies/${companyId}/invoices/manual/2026/09/router-bak.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 Router backup test content");
  const putRes = await primaryProvider.putObject({
    companyId,
    bucket: "engoryx-production-documents",
    key,
    bytes,
    contentType: "application/pdf",
  });

  const dbReplicas: any[] = [
    {
      id: "bak-router-1",
      company_id: companyId,
      document_domain: "INVOICES",
      document_id: "doc-1",
      source_provider: "s3",
      source_bucket: "engoryx-production-documents",
      source_key: key,
      source_sha256: putRes.ref.sha256,
      source_size_bytes: bytes.byteLength,
      replica_provider: "b2",
      replica_bucket: "engoryx-backups",
      replica_key: key,
      replication_state: "PENDING",
      verification_status: "UNVERIFIED",
      attempts: 0,
      max_attempts: 5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockSupabase: any = {
    from: (_table: string) => ({
      select: () => {
        const queryObj: any = {
          filters: {} as Record<string, any>,
          eq(col: string, val: any) {
            this.filters[col] = val;
            return this;
          },
          in(col: string, vals: any[]) {
            this.filters[col + "_in"] = vals;
            return this;
          },
          order() { return this; },
          async limit() {
            let list = [...dbReplicas];
            if (this.filters.company_id) list = list.filter((r) => r.company_id === this.filters.company_id);
            if (this.filters.replication_state_in) list = list.filter((r) => this.filters.replication_state_in.includes(r.replication_state));
            return { data: list, error: null };
          },
          async maybeSingle() {
            const match = dbReplicas.find((r) => r.id === this.filters.id && r.company_id === this.filters.company_id);
            return { data: match || null, error: null };
          },
          then(resolve: any) { return this.limit().then(resolve); },
        };
        return queryObj;
      },
      update: (data: any) => {
        const updateObj: any = {
          filters: {} as Record<string, any>,
          eq(col: string, val: any) {
            this.filters[col] = val;
            return this;
          },
          in(col: string, vals: any[]) {
            this.filters[col + "_in"] = vals;
            return this;
          },
          async select() {
            const item = dbReplicas.find((r) => r.id === this.filters.id);
            if (item) Object.assign(item, data);
            return { data: item ? [item] : [], error: null };
          },
          then(resolve: any) {
            const item = dbReplicas.find((r) => r.id === this.filters.id);
            if (item) Object.assign(item, data);
            return resolve({ error: null, data: item ? [item] : [] });
          },
        };
        return updateObj;
      },
    }),
  };


  const { server, url } = await setupTestServer({
    authorizer: async () => ({
      accessToken: "valid-token",
      companyId,
      user: { id: "user-admin" } as any,
      supabase: mockSupabase,
    }),
    primaryProviderSupplier: () => primaryProvider,
    backupProviderSupplier: () => backupProvider,
    providerSupplier: (id) => (id === "s3" ? primaryProvider : backupProvider),
  });

  try {
    // 1. Trigger backup replication batch
    const repRes = await fetch(`${url}/api/documents/replicate-backup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer valid-token", "x-company-id": companyId },
      body: JSON.stringify({ limit: 10 }),
    });
    assert.equal(repRes.status, 200);
    const repJson = await repRes.json();
    assert.equal(repJson.processed, 1);
    assert.equal(repJson.verified, 1);
    assert.equal(dbReplicas[0].replication_state, "VERIFIED");

    // 2. List backup replicas
    const listRes = await fetch(`${url}/api/documents/backups`, {
      method: "GET",
      headers: { "Authorization": "Bearer valid-token", "x-company-id": companyId },
    });
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.backups.length, 1);

    // 3. Execute restore drill
    const drillRes = await fetch(`${url}/api/documents/restore-drill`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer valid-token", "x-company-id": companyId },
      body: JSON.stringify({
        manifestId: "bak-router-1",
        testTargetKey: `companies/${companyId}/restore/test/drill-doc.pdf`,
      }),
    });
    assert.equal(drillRes.status, 200);
    const drillJson = await drillRes.json();
    assert.equal(drillJson.success, true);
    assert.equal(drillJson.restoredSha256, putRes.ref.sha256);
  } finally {
    server.close();
  }
});

test("Storage Router: Strict Authorization - invoice roles cannot operate or inspect generic storage", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const primaryProvider = new MemoryStorageProvider();

  // Authorizer simulates a user having ONLY 'invoices.manage' and 'invoices.read' (e.g. INVOICE_MANAGER role)
  const { server, url } = await setupTestServer({
    authorizer: async (_req, permission) => {
      if (permission === "invoices.manage" || permission === "invoices.read") {
        return {
          accessToken: "invoice-token",
          companyId,
          user: { id: "user-invoice-manager" } as any,
          supabase: {} as any,
        };
      }
      throw new StorageApiError(403, "FORBIDDEN", "You do not have permission for this company storage operation.");
    },
    primaryProviderSupplier: () => primaryProvider,
  });

  try {
    // 1. invoices.manage cannot call storage migration
    const migRes = await fetch(`${url}/api/documents/migrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer invoice-token", "x-company-id": companyId },
      body: JSON.stringify({ domain: "INVOICES" }),
    });
    assert.equal(migRes.status, 403);
    const migJson = await migRes.json();
    assert.equal(migJson.code, "FORBIDDEN");

    // 2. invoices.manage cannot call backup replication
    const repRes = await fetch(`${url}/api/documents/replicate-backup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer invoice-token", "x-company-id": companyId },
      body: JSON.stringify({ limit: 10 }),
    });
    assert.equal(repRes.status, 403);
    const repJson = await repRes.json();
    assert.equal(repJson.code, "FORBIDDEN");

    // 3. invoices.manage cannot execute restore drill
    const drillRes = await fetch(`${url}/api/documents/restore-drill`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer invoice-token", "x-company-id": companyId },
      body: JSON.stringify({ manifestId: "bak-1", testTargetKey: `companies/${companyId}/restore/test/doc.pdf` }),
    });
    assert.equal(drillRes.status, 403);
    const drillJson = await drillRes.json();
    assert.equal(drillJson.code, "FORBIDDEN");

    // 4. invoices.read cannot list storage backups
    const bakRes = await fetch(`${url}/api/documents/backups`, {
      method: "GET",
      headers: { "Authorization": "Bearer invoice-token", "x-company-id": companyId },
    });
    assert.equal(bakRes.status, 403);
    const bakJson = await bakRes.json();
    assert.equal(bakJson.code, "FORBIDDEN");

    // 5. invoices.read cannot list storage migrations
    const migListRes = await fetch(`${url}/api/documents/migrations`, {
      method: "GET",
      headers: { "Authorization": "Bearer invoice-token", "x-company-id": companyId },
    });
    assert.equal(migListRes.status, 403);
    const migListJson = await migListRes.json();
    assert.equal(migListJson.code, "FORBIDDEN");
  } finally {
    server.close();
  }
});

