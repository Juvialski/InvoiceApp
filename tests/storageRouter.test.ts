import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import {
  createStorageRouter,
  StorageApiError,
  type StorageAuthContext,
} from "../src/server/storage/storageRouter.ts";
import { compensateFailedUpload } from "../src/server/storage/storageCompensation.ts";
import { MemoryStorageProvider } from "../src/lib/storage/providers/memoryProvider.ts";
import { calculateSha256Hex } from "../src/lib/storage/dedup.ts";
import { getStorageHealth, loadStorageConfig } from "../src/lib/storage/config.ts";
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
    // Attempt manual source upload (requires invoices.manage)
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

test("Storage Router Authorization: Allows user with invoices.manage for manual source upload", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const memoryProvider = new MemoryStorageProvider();
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
                const inserted = { id: "doc-uuid-success-1", ...data };
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
    primaryProviderSupplier: () => memoryProvider,
  });

  try {
    const rawPdf = "%PDF-1.4 Valid Invoice Content";
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
        fileName: "invoice_2026.pdf",
      }),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.id, "doc-uuid-success-1");
    assert.equal(json.filename, "invoice_2026.pdf");
    assert.equal(json.storageProvider, "memory");
    assert.ok(json.previewUrl);
    assert.equal(dbRows.length, 1);
  } finally {
    server.close();
  }
});

test("Storage Router Compensation: Metadata failure triggers compensation cleanup of uncommitted object", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const memoryProvider = new MemoryStorageProvider();
  let compensationCalled = false;
  let compensatedKey = "";

  const mockSupabase: any = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => {
            // Simulate database error on insert
            return { data: null, error: { message: "Simulated DB constraint violation" } };
          },
        }),
      }),
    }),
  };

  const { server, url } = await setupTestServer({
    authorizer: async () => ({
      accessToken: "valid-token",
      companyId,
      user: { id: "user-manager-1" } as any,
      supabase: mockSupabase,
    }),
    primaryProviderSupplier: () => memoryProvider,
    compensator: async (input) => {
      compensationCalled = true;
      compensatedKey = input.key;
      await memoryProvider.deleteObject({ companyId: input.companyId, bucket: input.bucket, key: input.key });
      return { compensated: true };
    },
  });

  try {
    const rawPdf = "%PDF-1.4 Fail Insert Content";
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
        fileName: "fail_doc.pdf",
      }),
    });

    assert.equal(res.status, 500);
    const json = await res.json();
    assert.equal(json.code, "METADATA_INSERT_FAILED");
    assert.equal(compensationCalled, true);
    assert.ok(compensatedKey.includes("fail_doc.pdf"));

    // Verify object was cleaned up from memory provider
    const head = await memoryProvider.headObject({ companyId, bucket: "invoice-originals", key: compensatedKey });
    assert.equal(head, null);
  } finally {
    server.close();
  }
});

test("Storage Router Compensation: Committed/referenced source documents CANNOT be removed via compensation", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const committedKey = `companies/${companyId}/invoices/manual/2026/09/committed-doc.pdf`;

  // Mock DB where the key IS present in source_documents
  const mockSupabaseWithCommittedDoc: any = {
    from: (table: string) => {
      if (table === "source_documents") {
        return {
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
        };
      }
      if (table === "invoices") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  };

  // Attempting to compensate a committed key MUST throw StorageError
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

test("Storage Router Deduplication: Identical file SHA-256 returns existing source document", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const rawPdf = "%PDF-1.4 Dedup Invoice Test";
  const hash = await calculateSha256Hex(new TextEncoder().encode(rawPdf));

  const existingRow = {
    id: "doc-existing-uuid-99",
    filename: "first_upload.pdf",
    mime_type: "application/pdf",
    file_size: rawPdf.length,
    storage_path: `companies/${companyId}/invoices/manual/2026/09/${hash.slice(0, 12)}-uuid-first.pdf`,
    storage_provider: "memory",
    storage_bucket: "invoice-originals",
    sha256: hash,
    processing_status: "STORED",
  };

  const mockSupabase: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [existingRow], error: null }),
            }),
          }),
        }),
      }),
    }),
  };

  const memoryProvider = new MemoryStorageProvider();
  await memoryProvider.putObject({
    companyId,
    bucket: "invoice-originals",
    key: existingRow.storage_path,
    bytes: new TextEncoder().encode(rawPdf),
    contentType: "application/pdf",
  });

  const { server, url } = await setupTestServer({
    authorizer: async () => ({
      accessToken: "valid-token",
      companyId,
      user: { id: "user-1" } as any,
      supabase: mockSupabase,
    }),
    providerSupplier: () => memoryProvider,
  });

  try {
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
        fileName: "second_upload_different_name.pdf",
      }),
    });

    const json = await res.json();
    if (res.status !== 200) {
      console.error("Test 6 response:", res.status, json);
    }
    assert.equal(res.status, 200);
    assert.equal(json.id, "doc-existing-uuid-99");
    assert.equal(json.filename, "first_upload.pdf"); // Reused existing
  } finally {
    server.close();
  }
});

test("Storage Router Read: Content endpoint returns decoded file and rejects SHA-256 mismatch", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const docId = "22222222-3333-4444-8888-666666666666";
  const rawBytes = new TextEncoder().encode("%PDF-1.4 Verified Content");
  const validHash = await calculateSha256Hex(rawBytes);

  const memoryProvider = new MemoryStorageProvider();
  const storagePath = `companies/${companyId}/invoices/manual/2026/09/doc.pdf`;
  await memoryProvider.putObject({
    companyId,
    bucket: "invoice-originals",
    key: storagePath,
    bytes: rawBytes,
    contentType: "application/pdf",
  });

  // 1. Success case
  const mockSupabaseValid: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: docId,
                company_id: companyId,
                storage_path: storagePath,
                storage_provider: "memory",
                storage_bucket: "invoice-originals",
                sha256: validHash,
                filename: "invoice.pdf",
                mime_type: "application/pdf",
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const { server, url } = await setupTestServer({
    authorizer: async () => ({
      accessToken: "valid-token",
      companyId,
      user: { id: "user-reader" } as any,
      supabase: mockSupabaseValid,
    }),
    providerSupplier: () => memoryProvider,
  });

  try {
    const res = await fetch(`${url}/api/documents/${docId}/content`, {
      headers: {
        "Authorization": "Bearer valid-token",
        "x-company-id": companyId,
      },
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.id, docId);
    assert.equal(json.sha256, validHash);
    assert.ok(json.fileData);
  } finally {
    server.close();
  }

  // 2. Hash mismatch case
  const mockSupabaseCorrupt: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: docId,
                company_id: companyId,
                storage_path: storagePath,
                storage_provider: "memory",
                storage_bucket: "invoice-originals",
                sha256: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", // Wrong hash
                filename: "invoice.pdf",
                mime_type: "application/pdf",
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const { server: corruptServer, url: corruptUrl } = await setupTestServer({
    authorizer: async () => ({
      accessToken: "valid-token",
      companyId,
      user: { id: "user-reader" } as any,
      supabase: mockSupabaseCorrupt,
    }),
    providerSupplier: () => memoryProvider,
  });

  try {
    const corruptRes = await fetch(`${corruptUrl}/api/documents/${docId}/content`, {
      headers: {
        "Authorization": "Bearer valid-token",
        "x-company-id": companyId,
      },
    });
    assert.equal(corruptRes.status, 422);
    const corruptJson = await corruptRes.json();
    assert.equal(corruptJson.code, "STORAGE_INTEGRITY_ERROR");
  } finally {
    corruptServer.close();
  }
});

test("Storage Router Validation: Rejects invalid or oversized document uploads", async () => {
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

    // 2. Empty byte payload
    const res2 = await fetch(`${url}/api/documents/manual-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer valid-token", "x-company-id": companyId },
      body: JSON.stringify({ fileData: "", mimeType: "application/pdf", fileName: "test.pdf" }),
    });
    assert.equal(res2.status, 400);

    // 3. Invalid MIME type (e.g. executable)
    const res3 = await fetch(`${url}/api/documents/manual-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer valid-token", "x-company-id": companyId },
      body: JSON.stringify({
        fileData: Buffer.from("MZ executable header").toString("base64"),
        mimeType: "application/x-msdownload",
        fileName: "malware.exe",
      }),
    });
    assert.equal(res3.status, 500); // Thrown from validateInvoiceDocumentBytes
  } finally {
    server.close();
  }
});
