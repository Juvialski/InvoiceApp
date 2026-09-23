import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import test from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { createEntityMediaRouter } from "../src/server/storage/entityMediaRouter.ts";

const { Client } = pg;
const runtimeEnabled = process.env.ENTITY_MEDIA_RUNTIME === "1";
const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_STORAGE_SERVER_KEY || "";
const bucket = "entity-media";

function pngBytes(seed: number): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed, seed + 1, seed + 2, seed + 3]);
}

function startServer(options: Parameters<typeof createEntityMediaRouter>[0] = {}) {
  const app = express();
  app.use(express.json({ limit: "16mb" }));
  app.use("/api/entity-media", createEntityMediaRouter(options));
  const server = http.createServer(app);
  return new Promise<{ server: http.Server; port: number }>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as { port: number }).port }));
  });
}

function authHeaders(token: string, companyId: string) {
  return { Authorization: `Bearer ${token}`, "X-Company-Id": companyId, "Content-Type": "application/json" };
}

test("local Supabase Storage entity media supports authorized upload/read/replace/remove and safe failure cleanup", { skip: !runtimeEnabled }, async () => {
  assert.ok(publishableKey, "set the local Supabase publishable/anon key for the runtime cycle");
  assert.ok(serviceRoleKey, "set the local Supabase service role key for the runtime cycle");

  const database = new Client({ connectionString: dbUrl });
  await database.connect();
  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const caller = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const outsider = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const projectId = randomUUID();
  const callerEmail = `r4d-media-${suffix}@test.local`;
  const outsiderEmail = `r4d-outsider-${suffix}@test.local`;
  const password = `R4D-${randomUUID()}!`;
  const previousDeployment = await database.query("select company_id from public.deployment_configuration where singleton = true");
  const companyId = previousDeployment.rows[0]?.company_id as string | undefined;
  if (!companyId) {
    await database.end();
    throw new Error("The local runtime cycle requires the configured deployment company.");
  }
  let callerUserId = "";
  let outsiderUserId = "";
  let membershipId = "";
  let callerToken = "";
  let outsiderToken = "";
  let folder = "";
  let normalServer: http.Server | null = null;
  let failingServer: http.Server | null = null;
  let cleanupError: unknown;

  try {
    const callerCreated = await service.auth.admin.createUser({ email: callerEmail, password, email_confirm: true });
    if (callerCreated.error || !callerCreated.data.user) throw callerCreated.error || new Error("Local test user creation failed.");
    callerUserId = callerCreated.data.user.id;
    const outsiderCreated = await service.auth.admin.createUser({ email: outsiderEmail, password, email_confirm: true });
    if (outsiderCreated.error || !outsiderCreated.data.user) throw outsiderCreated.error || new Error("Local outsider creation failed.");
    outsiderUserId = outsiderCreated.data.user.id;

    const callerLogin = await caller.auth.signInWithPassword({ email: callerEmail, password });
    if (callerLogin.error || !callerLogin.data.session?.access_token) throw callerLogin.error || new Error("Local test user sign-in failed.");
    callerToken = callerLogin.data.session.access_token;
    const outsiderLogin = await outsider.auth.signInWithPassword({ email: outsiderEmail, password });
    if (outsiderLogin.error || !outsiderLogin.data.session?.access_token) throw outsiderLogin.error || new Error("Local outsider sign-in failed.");
    outsiderToken = outsiderLogin.data.session.access_token;

    const membership = await database.query("insert into public.company_members (company_id,user_id,role_key,status) values ($1,$2,'COMPANY_ADMIN','ACTIVE') returning id", [companyId, callerUserId]);
    membershipId = membership.rows[0]?.id || "";
    await database.query("insert into public.projects (id,company_id,user_id,project_code,project_name,status,currency,tax_treatment) values ($1,$2,$3,$4,'R4D Media Runtime Project','ACTIVE','PHP','VAT')", [projectId, companyId, callerUserId, `R4D-${suffix}`]);
    folder = `companies/${companyId}/entity-media/project/${projectId}`;

    const ordinary = await startServer();
    normalServer = ordinary.server;
    const endpoint = `http://127.0.0.1:${ordinary.port}/api/entity-media/PROJECT/${projectId}`;
    const upload = async (seed: number, expectedMediaId: string | null, prefix = endpoint, token = callerToken) => fetch(prefix, {
      method: "POST",
      headers: authHeaders(token, companyId),
      body: JSON.stringify({ fileData: Buffer.from(pngBytes(seed)).toString("base64"), fileName: `synthetic-${seed}.png`, mimeType: "image/png", altText: "Synthetic local Supabase image", expectedMediaId }),
    });

    const firstResponse = await upload(11, null);
    assert.equal(firstResponse.status, 201, "authorized Project manager uploads the first image through the server route");
    const first = await firstResponse.json() as any;
    assert.equal(first.data.media.entityId, projectId);
    assert.equal(first.data.media.contentType, "image/png");
    const firstKey = await database.query("select storage_key from public.entity_media where company_id=$1 and project_id=$2", [companyId, projectId]);
    const firstObjectKey = String(firstKey.rows[0]?.storage_key || "");
    assert.ok(firstObjectKey.startsWith(`${folder}/`));

    const readResponse = await fetch(endpoint, { headers: authHeaders(callerToken, companyId) });
    assert.equal(readResponse.status, 200, "authorized Project reader resolves the current signed image");
    const read = await readResponse.json() as any;
    assert.equal(read.data.media.id, first.data.media.id);
    const imageResponse = await fetch(read.data.media.url);
    assert.equal(imageResponse.status, 200, "signed private object is retrievable");
    assert.deepEqual(new Uint8Array(await imageResponse.arrayBuffer()), pngBytes(11));

    const oldMetadataRow = await service.from("entity_media").select("*").eq("company_id", companyId).eq("project_id", projectId).single();
    assert.equal(oldMetadataRow.error, null);
    const secondResponse = await upload(21, first.data.media.id);
    assert.equal(secondResponse.status, 201, "replacement commits the new image while the previous image was still available");
    const second = await secondResponse.json() as any;
    assert.notEqual(second.data.media.id, first.data.media.id);
    const oldObject = await service.storage.from(bucket).download(firstObjectKey);
    assert.ok(oldObject.error, "superseded object is removed after the replacement is authoritative");

    const beforeForbidden = await service.storage.from(bucket).list(folder, { limit: 20 });
    assert.equal(beforeForbidden.error, null);
    const forbiddenRead = await fetch(endpoint, { headers: authHeaders(outsiderToken, companyId) });
    assert.equal(forbiddenRead.status, 403, "a caller outside the company cannot read or sign media");
    const forbiddenWrite = await upload(31, second.data.media.id, endpoint, outsiderToken);
    assert.equal(forbiddenWrite.status, 403, "a caller outside the company cannot upload media");
    const afterForbidden = await service.storage.from(bucket).list(folder, { limit: 20 });
    assert.deepEqual((afterForbidden.data || []).map((item) => item.name), (beforeForbidden.data || []).map((item) => item.name), "unauthorized upload leaves Storage unchanged");

    const failing = await startServer({
      serverSupabaseSupplier: () => ({
        ...service,
        from: service.from.bind(service),
        storage: service.storage,
        rpc: async (name: string, args: unknown) => name === "server_replace_entity_media"
          ? { data: null, error: Object.assign(new Error("forced runtime metadata failure"), { code: "40001" }) }
          : service.rpc(name, args as any),
      }) as any,
    });
    failingServer = failing.server;
    const failedResponse = await upload(41, second.data.media.id, `http://127.0.0.1:${failing.port}/api/entity-media/PROJECT/${projectId}`);
    assert.equal(failedResponse.status, 409, "stale/failed metadata mutation returns a conflict after safe compensation");
    const afterFailedUpload = await service.storage.from(bucket).list(folder, { limit: 20 });
    assert.equal(afterFailedUpload.error, null);
    assert.deepEqual((afterFailedUpload.data || []).map((item) => item.name), [(second.data.media.id ? String((await service.from("entity_media").select("storage_key").eq("company_id", companyId).eq("project_id", projectId).single()).data?.storage_key).split("/").pop() : "")], "failed metadata mutation removes the unbound new object and preserves the current image");

    const removeResponse = await fetch(`${endpoint}/${encodeURIComponent(second.data.media.id)}`, { method: "DELETE", headers: authHeaders(callerToken, companyId) });
    assert.equal(removeResponse.status, 200, "authorized image removal unbinds the image");
    const noImageResponse = await fetch(endpoint, { headers: authHeaders(callerToken, companyId) });
    assert.equal((await noImageResponse.json() as any).data.media, null);
    const afterRemoval = await service.storage.from(bucket).list(folder, { limit: 20 });
    assert.deepEqual(afterRemoval.data || [], [], "removal cleans up the current private object");
  } finally {
    if (normalServer) await new Promise<void>((resolve) => normalServer!.close(() => resolve()));
    if (failingServer) await new Promise<void>((resolve) => failingServer!.close(() => resolve()));
    if (folder) {
      const remaining = await service.storage.from(bucket).list(folder, { limit: 100 }).catch(() => ({ data: [] as any[] }));
      const keys = (remaining.data || []).map((item: any) => `${folder}/${item.name}`);
      if (keys.length) await service.storage.from(bucket).remove(keys);
    }
    try {
      await database.query("begin");
      if (folder) {
        await database.query("delete from public.entity_media where company_id=$1 and project_id=$2", [companyId, projectId]);
        await database.query("delete from public.entity_media_cleanup_queue where company_id=$1 and storage_key like $2", [companyId, `${folder}/%`]);
      }
      await database.query("delete from public.projects where id=$1 and company_id=$2", [projectId, companyId]);
      if (membershipId) await database.query("delete from public.company_members where id=$1 and company_id=$2", [membershipId, companyId]);
      await database.query("delete from public.company_audit_events where company_id=$1 and (target_id=$2 or target_id=$3 or actor_user_id=$4)", [companyId, projectId, membershipId || null, callerUserId || null]);
      const userIds = [callerUserId, outsiderUserId].filter(Boolean);
      if (userIds.length) await database.query("delete from auth.users where id = any($1::uuid[])", [userIds]);
      await database.query("commit");
    } catch (error) {
      await database.query("rollback").catch(() => {});
      cleanupError = error;
    }
    await database.end();
  }
  if (cleanupError) throw cleanupError;
});
