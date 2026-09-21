import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import test from "node:test";
import { MemoryStorageProvider } from "../src/lib/storage/providers/memoryProvider.ts";
import { createManagedDocumentRouter } from "../src/server/managedDocuments/managedDocumentRouter.ts";
import type { StorageAuthContext } from "../src/server/storage/storageRouter.ts";

const COMPANY_ID = "11111111-2222-4333-8444-555555555555";
const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function authContext(supabase: any = {}): StorageAuthContext {
  return { accessToken: "synthetic-token", companyId: COMPANY_ID, user: { id: USER_ID } as any, supabase };
}

function startServer(options: Parameters<typeof createManagedDocumentRouter>[0]) {
  const app = express();
  app.use(express.json({ limit: "16mb" }));
  app.use("/api/managed-documents", createManagedDocumentRouter(options));
  const server = http.createServer(app);
  return new Promise<{ server: http.Server; port: number }>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as { port: number }).port }));
  });
}

test("managed document upload validates, stores privately, and commits through the server RPC", async () => {
  const storage = new MemoryStorageProvider();
  let rpcPayload: any;
  const serverClient = {
    rpc: async (name: string, args: any) => {
      assert.equal(name, "server_create_managed_document_with_version");
      rpcPayload = args;
      return {
        data: {
          document: { id: args.p_payload.documentId, company_id: COMPANY_ID, title: args.p_payload.title, category: args.p_payload.category, origin: "MANUAL_UPLOAD", status: "ACTIVE", current_version_id: args.p_payload.versionId, created_at: "2026-09-21T00:00:00Z", updated_at: "2026-09-21T00:00:00Z" },
          version: { id: args.p_payload.versionId, document_id: args.p_payload.documentId, version_number: 1, source_origin: "MANUAL_UPLOAD", original_filename: args.p_payload.fileName, mime_type: args.p_payload.mimeType, size_bytes: args.p_payload.sizeBytes, sha256: args.p_payload.sha256, created_at: "2026-09-21T00:00:00Z" },
        },
        error: null,
      };
    },
  };
  const { server, port } = await startServer({
    authorizer: async () => authContext(),
    primaryProviderSupplier: () => storage,
    serverSupabaseSupplier: () => serverClient as any,
  });
  try {
    const fileData = Buffer.from("%PDF-1.7 managed document").toString("base64");
    const response = await fetch(`http://127.0.0.1:${port}/api/managed-documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileData, fileName: "warranty.pdf", mimeType: "application/pdf", title: "Warranty Certificate", category: "WARRANTY_CERTIFICATE" }),
    });
    assert.equal(response.status, 201);
    const payload = await response.json() as any;
    assert.equal(payload.data.title, "Warranty Certificate");
    assert.equal(payload.data.versions[0].originalFilename, "warranty.pdf");
    assert.equal(rpcPayload.p_actor_user_id, USER_ID);
    assert.match(rpcPayload.p_payload.storagePath, new RegExp(`^companies/${COMPANY_ID}/managed-documents/`));
    assert.equal(rpcPayload.p_payload.storageBucket, "company-managed-documents");
    assert.equal(storage.size(), 1);
    assert.equal(JSON.stringify(payload).includes("storagePath"), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("managed document upload stops at the permission gate", async () => {
  const { server, port } = await startServer({
    authorizer: async () => { throw Object.assign(new Error("forbidden"), { status: 403, code: "FORBIDDEN" }); },
    primaryProviderSupplier: () => new MemoryStorageProvider(),
    serverSupabaseSupplier: () => ({ rpc: async () => { throw new Error("must not reach RPC"); } }) as any,
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/managed-documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileData: Buffer.from("%PDF-1.7").toString("base64"), fileName: "blocked.pdf", mimeType: "application/pdf", title: "Blocked", category: "GENERAL_UPLOAD" }),
    });
    assert.equal(response.status, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
