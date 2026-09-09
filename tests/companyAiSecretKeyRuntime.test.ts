import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { companyAiServerSupabase } from "../src/server/ai/companyAiServerSupabase.ts";

const { Client } = pg;
const DB_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const RUNTIME_ENABLED = process.env.COMPANY_AI_RPC_RUNTIME_DB === "1";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY?.trim() || "";
const API_URL = (process.env.SUPABASE_LOCAL_API_URL || "http://127.0.0.1:54321").replace(/\/$/, "");

function localHost(value: string) {
  try {
    return /^(127\.0\.0\.1|localhost)$/i.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

const runtimeSkip = !RUNTIME_ENABLED
  ? "COMPANY_AI_RPC_RUNTIME_DB=1 was not set"
  : !localHost(DB_URL)
    ? "refusing company AI runtime mutation against a non-local database"
    : undefined;
const secretKeySkip = runtimeSkip || !SECRET_KEY
  ? runtimeSkip || "SUPABASE_SECRET_KEY was not provided"
  : !/^sb_secret_/.test(SECRET_KEY)
    ? "SUPABASE_SECRET_KEY is not a modern sb_secret_ key"
    : !localHost(API_URL)
      ? "refusing modern secret-key probe against a non-local API"
      : undefined;

const DIRECT_IDS = {
  operator: "10000000-0000-4000-8000-202609091201",
  otherAdmin: "10000000-0000-4000-8000-202609091202",
  companyA: "10000000-0000-4000-8000-202609091211",
  companyB: "10000000-0000-4000-8000-202609091212",
};
const HTTP_IDS = {
  operator: "10000000-0000-4000-8000-202609091301",
  otherAdmin: "10000000-0000-4000-8000-202609091302",
  companyA: "10000000-0000-4000-8000-202609091311",
  companyB: "10000000-0000-4000-8000-202609091312",
};

type RuntimeIds = typeof DIRECT_IDS;

async function connectAs(role?: string) {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  if (role) await client.query(`set role ${role}`);
  return client;
}

async function createFixture(admin: pg.Client, ids: RuntimeIds) {
  await admin.query(
    "insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at) values ($1, $2, 'x', now(), now(), now()), ($3, $4, 'x', now(), now(), now())",
    [ids.operator, `ai-runtime-operator-${ids.operator.slice(-4)}@test.local`, ids.otherAdmin, `ai-runtime-other-${ids.otherAdmin.slice(-4)}@test.local`],
  );
  await admin.query(
    "insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id) values ($1, 'AI Runtime Client A', $3, 'ACTIVE', 'PHP', 'Asia/Manila', $2), ($4, 'AI Runtime Client B', $5, 'ACTIVE', 'USD', 'UTC', $6)",
    [ids.companyA, ids.operator, `ai-runtime-a-${ids.companyA.slice(-4)}`, ids.companyB, `ai-runtime-b-${ids.companyB.slice(-4)}`, ids.otherAdmin],
  );
  await admin.query(
    "insert into public.company_members (company_id, user_id, role_key, status) values ($1, $2, 'COMPANY_ADMIN', 'ACTIVE'), ($1, $3, 'COMPANY_ADMIN', 'ACTIVE')",
    [ids.companyA, ids.operator, ids.otherAdmin],
  );
  await admin.query("insert into public.deployment_configuration (singleton, company_id) values (true, $1)", [ids.companyA]);
  await admin.query(
    "insert into public.company_audit_events (company_id, actor_user_id, event_type, target_type, target_id, metadata) values ($1, null, 'COMPANY_CREATED', 'company', $1, jsonb_build_object('bootstrap', true, 'initial_admin_user_id', $2::text))",
    [ids.companyA, ids.operator],
  );
}

async function cleanupFixture(admin: pg.Client, ids: RuntimeIds) {
  try {
    await admin.query("begin");
    await admin.query("set local session_replication_role = 'replica'");
    await admin.query("delete from public.company_ai_credentials where company_id = any($1::uuid[])", [[ids.companyA, ids.companyB]]);
    await admin.query("delete from public.company_ai_settings where company_id = any($1::uuid[])", [[ids.companyA, ids.companyB]]);
    await admin.query("delete from public.company_audit_events where company_id = any($1::uuid[])", [[ids.companyA, ids.companyB]]);
    await admin.query("delete from public.company_members where company_id = any($1::uuid[])", [[ids.companyA, ids.companyB]]);
    await admin.query("delete from public.deployment_configuration where company_id = any($1::uuid[])", [[ids.companyA, ids.companyB]]);
    await admin.query("delete from public.company_document_profiles where company_id = any($1::uuid[])", [[ids.companyA, ids.companyB]]);
    await admin.query("delete from public.companies where id = any($1::uuid[])", [[ids.companyA, ids.companyB]]);
    await admin.query("delete from auth.users where id = any($1::uuid[])", [[ids.operator, ids.otherAdmin]]);
    await admin.query("commit");
  } catch {
    await admin.query("rollback").catch(() => {});
  }
}

async function expectDenied(client: pg.Client, query: string, values: unknown[] = []) {
  await assert.rejects(
    () => client.query(query, values),
    (error: any) => error?.code === "42501",
  );
}

test("local Postgres roles enforce the server-only AI RPC boundary and deployment scope", { skip: runtimeSkip }, async () => {
  const admin = await connectAs();
  const service = await connectAs("service_role");
  const anon = await connectAs("anon");
  const authenticated = await connectAs("authenticated");
  try {
    await createFixture(admin, DIRECT_IDS);
    await service.query("select set_config('request.jwt.claim.role', '', false)");
    await service.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)");

    const metadata = await service.query("select current_user as role, public.server_get_company_ai_config($1) as metadata", [DIRECT_IDS.companyA]);
    assert.equal(metadata.rows[0]?.role, "service_role");
    assert.equal(metadata.rows[0]?.metadata?.status, "NOT_CONFIGURED");
    assert.equal(metadata.rows[0]?.metadata?.credential_configured, false);
    assert.equal("ciphertext" in metadata.rows[0].metadata, false);
    assert.equal("iv" in metadata.rows[0].metadata, false);
    assert.equal("auth_tag" in metadata.rows[0].metadata, false);

    await expectDenied(anon, "select public.server_get_company_ai_config($1)", [DIRECT_IDS.companyA]);
    await expectDenied(anon, "select public.server_record_company_ai_test($1, 'SUCCESS')", [DIRECT_IDS.companyA]);
    await expectDenied(anon, "select public.bootstrap_deployment_company_ai_credential($1, $2, 'cipher', 'iv', 'tag', 1, '1111')", [DIRECT_IDS.companyA, DIRECT_IDS.operator]);
    await expectDenied(anon, "select public.resolve_company_ai_credential($1)", [DIRECT_IDS.companyA]);
    await expectDenied(anon, "select public.server_mark_company_ai_invalid($1)", [DIRECT_IDS.companyA]);

    await expectDenied(authenticated, "select public.server_get_company_ai_config($1)", [DIRECT_IDS.companyA]);
    await expectDenied(authenticated, "select public.server_record_company_ai_test($1, 'SUCCESS')", [DIRECT_IDS.companyA]);
    await expectDenied(authenticated, "select public.bootstrap_deployment_company_ai_credential($1, $2, 'cipher', 'iv', 'tag', 1, '1111')", [DIRECT_IDS.companyA, DIRECT_IDS.operator]);
    await expectDenied(authenticated, "select public.resolve_company_ai_credential($1)", [DIRECT_IDS.companyA]);
    await expectDenied(authenticated, "select public.server_mark_company_ai_invalid($1)", [DIRECT_IDS.companyA]);

    await expectDenied(service, "select public.server_get_company_ai_config($1)", [DIRECT_IDS.companyB]);
    await expectDenied(service, "select public.server_record_company_ai_test($1, 'SUCCESS')", [DIRECT_IDS.companyB]);
    await expectDenied(service, "select public.bootstrap_deployment_company_ai_credential($1, $2, 'cipher', 'iv', 'tag', 1, '1111')", [DIRECT_IDS.companyB, DIRECT_IDS.otherAdmin]);
    await expectDenied(service, "select public.resolve_company_ai_credential($1)", [DIRECT_IDS.companyB]);
    await expectDenied(service, "select public.server_mark_company_ai_invalid($1)", [DIRECT_IDS.companyB]);
  } finally {
    await service.end().catch(() => {});
    await anon.end().catch(() => {});
    await authenticated.end().catch(() => {});
    await cleanupFixture(admin, DIRECT_IDS);
    await admin.end().catch(() => {});
  }
});

test("the actual local Data API accepts a modern sb_secret_ key for server AI metadata", { skip: secretKeySkip }, async () => {
  const admin = await connectAs();
  try {
    await createFixture(admin, HTTP_IDS);
    const client = companyAiServerSupabase({
      SUPABASE_URL: API_URL,
      SUPABASE_AI_SERVER_KEY: SECRET_KEY,
    } as NodeJS.ProcessEnv);
    const result = await client.rpc("server_get_company_ai_config", { p_company_id: HTTP_IDS.companyA });
    assert.equal(result.error, null, result.error?.message || "modern secret-key RPC call failed");
    assert.equal((result.data as any)?.status, "NOT_CONFIGURED");
    assert.equal((result.data as any)?.credential_configured, false);
    assert.equal("ciphertext" in (result.data as any), false);
    assert.equal("iv" in (result.data as any), false);
    assert.equal("auth_tag" in (result.data as any), false);
  } finally {
    await cleanupFixture(admin, HTTP_IDS);
    await admin.end().catch(() => {});
  }
});
