import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import test from "node:test";
import type { DocumentStorageProvider, ObjectLookupQuery, PutObjectInput } from "../src/lib/storage/types.ts";
import { createEntityMediaRouter } from "../src/server/storage/entityMediaRouter.ts";
import type { StorageAuthContext } from "../src/server/storage/storageRouter.ts";

const COMPANY_ID = "11111111-2222-4333-8444-555555555555";
const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PROJECT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function authContext(supabase: any): StorageAuthContext {
  return { accessToken: "synthetic-token", companyId: COMPANY_ID, user: { id: USER_ID } as any, supabase };
}

function startServer(options: Parameters<typeof createEntityMediaRouter>[0]) {
  const app = express();
  app.use(express.json({ limit: "16mb" }));
  app.use("/api/entity-media", createEntityMediaRouter(options));
  const server = http.createServer(app);
  return new Promise<{ server: http.Server; port: number }>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as { port: number }).port }));
  });
}

function pngBase64(): string {
  return Buffer.from([...PNG_SIGNATURE, 0, 1, 2, 3, 4, 5, 6, 7]).toString("base64");
}

function entityClient() {
  return {
    from: (table: string) => {
      assert.equal(table, "projects");
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        maybeSingle: async () => ({ data: { id: PROJECT_ID, company_id: COMPANY_ID }, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ id: PROJECT_ID }], error: null }).then(resolve),
      };
      return chain;
    },
  };
}

function storageHarness(options: { failDeleteKey?: string } = {}) {
  const events: string[] = [];
  const objects = new Map<string, Uint8Array>();
  let current: Record<string, any> | null = null;
  const cleanup: Record<string, any>[] = [];

  const provider: DocumentStorageProvider = {
    id: "supabase",
    putObject: async (input: PutObjectInput) => {
      events.push("put");
      objects.set(input.key, new Uint8Array(input.bytes));
      const bucket = input.bucket || "entity-media";
      return {
        ref: { providerId: "supabase", bucket, key: input.key, companyId: input.companyId, sha256: input.sha256, sizeBytes: input.bytes.byteLength, contentType: input.contentType },
        metadata: { companyId: input.companyId, bucket, key: input.key, sizeBytes: input.bytes.byteLength, contentType: input.contentType, sha256: input.sha256 || "a".repeat(64) },
      };
    },
    getObject: async () => { throw new Error("not used"); },
    getSignedUrl: async (query: ObjectLookupQuery) => `https://storage.test/${encodeURIComponent(query.key)}?token=short-lived`,
    deleteObject: async (query: ObjectLookupQuery) => {
      events.push(`delete:${query.key}`);
      if (query.key === options.failDeleteKey) throw new Error("temporary storage failure");
      objects.delete(query.key);
    },
    headObject: async () => null,
  };

  const serviceClient = {
    rpc: async (name: string, args: Record<string, any>) => {
      if (name === "server_replace_entity_media") {
        events.push("commit");
        if ((current?.id || null) !== (args.p_expected_media_id || null)) return { data: null, error: { code: "40001", message: "EXPECTED_MEDIA_MISMATCH" } };
        if (current) cleanup.push({ id: `cleanup-${current.id}`, company_id: COMPANY_ID, storage_provider: current.storage_provider, storage_bucket: current.storage_bucket, storage_key: current.storage_key, cleanup_reason: "REPLACED", attempt_count: 0 });
        current = {
          id: args.p_media_id,
          company_id: COMPANY_ID,
          entity_type: args.p_entity_type,
          project_id: args.p_entity_type === "PROJECT" ? args.p_entity_id : null,
          equipment_id: null,
          inventory_item_id: null,
          purpose: "COVER",
          storage_provider: args.p_storage_provider,
          storage_bucket: args.p_storage_bucket,
          storage_key: args.p_storage_key,
          content_type: args.p_content_type,
          size_bytes: args.p_size_bytes,
          sha256: args.p_sha256,
          alt_text: args.p_alt_text,
          created_by_user_id: USER_ID,
          updated_by_user_id: USER_ID,
          created_at: "2026-09-23T00:00:00.000Z",
          updated_at: "2026-09-23T00:00:00.000Z",
        };
        return { data: { ...current }, error: null };
      }
      if (name === "server_remove_entity_media") {
        events.push("unbind");
        if (!current || current.id !== args.p_expected_media_id) return { data: null, error: { code: "40001", message: "EXPECTED_MEDIA_MISMATCH" } };
        cleanup.push({ id: `cleanup-${current.id}`, company_id: COMPANY_ID, storage_provider: current.storage_provider, storage_bucket: current.storage_bucket, storage_key: current.storage_key, cleanup_reason: "UNBOUND", attempt_count: 0 });
        const removed = current;
        current = null;
        return { data: { removedMediaId: removed.id, storageKey: removed.storage_key }, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
    from: (table: string) => {
      if (table === "projects") {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: { id: PROJECT_ID, company_id: COMPANY_ID }, error: null }),
          in: () => Promise.resolve({ data: [{ id: PROJECT_ID }], error: null }),
        };
        return chain;
      }
      if (table === "entity_media") {
        let requestedKey = "";
        let requestedProjectId = "";
        const chain: any = {
          select: () => chain,
          eq: (column: string, value: string) => {
            if (column === "storage_key") requestedKey = value;
            if (column === "project_id") requestedProjectId = value;
            return chain;
          },
          maybeSingle: async () => ({ data: current && ((requestedKey && current.storage_key === requestedKey) || (requestedProjectId && current.project_id === requestedProjectId)) ? current : null, error: null }),
        };
        return chain;
      }
      if (table === "entity_media_cleanup_queue") {
        let deletingId = "";
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: async () => ({ data: cleanup.slice(), error: null }),
          delete: () => { deletingId = ""; return chain; },
          then: (resolve: (value: unknown) => unknown) => {
            if (deletingId) {
              const index = cleanup.findIndex((item) => item.id === deletingId);
              if (index >= 0) cleanup.splice(index, 1);
            }
            return Promise.resolve({ data: null, error: null }).then(resolve);
          },
        };
        const baseEq = chain.eq;
        chain.eq = (column: string, value: string) => {
          if (column === "id") deletingId = value;
          return baseEq(column, value);
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
    _current: () => current,
    _cleanup: cleanup,
  };

  return { events, objects, provider, serviceClient, current: () => current, cleanup };
}

test("entity media upload, replacement, and removal keep binding and object cleanup ordered", async () => {
  const harness = storageHarness();
  const authorizations: string[] = [];
  const { server, port } = await startServer({
    authorizer: async (_request, permission) => { authorizations.push(permission); return authContext(entityClient()); },
    primaryProviderSupplier: () => harness.provider,
    providerSupplier: () => harness.provider,
    serverSupabaseSupplier: () => harness.serviceClient as any,
  });
  const base = `http://127.0.0.1:${port}/api/entity-media/PROJECT/${PROJECT_ID}`;
  const upload = (expectedMediaId: string | null) => fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileData: pngBase64(), fileName: "../../Project Cover.png", mimeType: "image/png", altText: "North site cover", expectedMediaId }),
  });
  try {
    const firstResponse = await upload(null);
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json() as any;
    assert.equal(first.data.media.entityType, "PROJECT");
    assert.equal(first.data.media.entityId, PROJECT_ID);
    assert.match(first.data.media.url, /^https:\/\/storage\.test\//);
    assert.equal(JSON.stringify(first).includes("storage_key"), false);
    assert.equal(harness.objects.size, 1);
    assert.deepEqual(harness.events.slice(0, 2), ["put", "commit"]);
    assert.match(harness.current()?.storage_key, new RegExp(`^companies/${COMPANY_ID}/entity-media/project/${PROJECT_ID}/`));

    const oldKey = String(harness.current()?.storage_key);
    harness.events.length = 0;
    const secondResponse = await upload(first.data.media.id);
    assert.equal(secondResponse.status, 201);
    const second = await secondResponse.json() as any;
    assert.notEqual(second.data.media.id, first.data.media.id);
    assert.deepEqual(harness.events.slice(0, 2), ["put", "commit"]);
    assert.equal(harness.events.some((event) => event === `delete:${oldKey}`), true);
    assert.equal(harness.objects.has(oldKey), false);
    assert.equal(harness.objects.size, 1);

    const removeResponse = await fetch(`${base}/${encodeURIComponent(second.data.media.id)}`, { method: "DELETE" });
    assert.equal(removeResponse.status, 200);
    const removed = await removeResponse.json() as any;
    assert.equal(removed.data.media, null);
    assert.equal(removed.data.cleanupPending, false);
    assert.equal(harness.current(), null);
    assert.equal(harness.objects.size, 0);
    assert.ok(authorizations.includes("projects.manage"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("entity media rejects unsupported image bytes before touching Storage", async () => {
  const harness = storageHarness();
  const { server, port } = await startServer({
    authorizer: async () => authContext(entityClient()),
    primaryProviderSupplier: () => harness.provider,
    serverSupabaseSupplier: () => harness.serviceClient as any,
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/entity-media/PROJECT/${PROJECT_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileData: Buffer.from("<svg><script>alert(1)</script></svg>").toString("base64"), fileName: "logo.svg", mimeType: "image/svg+xml", expectedMediaId: null }),
    });
    assert.equal(response.status, 400);
    assert.equal(harness.events.length, 0);
    assert.equal(harness.objects.size, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("entity media permission failure stops before the provider is constructed", async () => {
  let providerConstructed = false;
  const { server, port } = await startServer({
    authorizer: async () => { throw Object.assign(new Error("forbidden"), { status: 403, code: "FORBIDDEN" }); },
    primaryProviderSupplier: () => { providerConstructed = true; throw new Error("must not construct provider"); },
    serverSupabaseSupplier: () => ({ rpc: async () => { throw new Error("must not reach RPC"); } }) as any,
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/entity-media/PROJECT/${PROJECT_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileData: pngBase64(), fileName: "cover.png", mimeType: "image/png", expectedMediaId: null }),
    });
    assert.equal(response.status, 403);
    assert.equal(providerConstructed, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
