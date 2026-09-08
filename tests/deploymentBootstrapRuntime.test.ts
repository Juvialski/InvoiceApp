import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const { Client } = pg;
const runtimeEnabled = process.env.DEPLOYMENT_BOOTSTRAP_RUNTIME_DB === "1";
const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ids = {
  adminUser: "00000000-0000-4000-8000-000000000931",
};

async function connect() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  return client;
}

test("concurrent first deployment bootstrap returns one create and one idempotent result", { skip: !runtimeEnabled }, async () => {
  const admin = await connect();
  const callerOne = await connect();
  const callerTwo = await connect();
  try {
    await admin.query(
      "insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at) values ($1, 'deployment-bootstrap-runtime@test.local', 'x', now(), now(), now()) on conflict (id) do nothing",
      [ids.adminUser],
    );

    const invoke = (client: pg.Client) => client.query(
      "select public.bootstrap_deployment_company($1, $2, $3, $4, $5) as result",
      [ids.adminUser, "Runtime Bootstrap Company", "runtime-bootstrap", "PHP", "Asia/Manila"],
    );
    const results = await Promise.all([invoke(callerOne), invoke(callerTwo)]);
    const payloads = results.map((result) => result.rows[0]?.result as { idempotent?: boolean });
    const idempotentFlags = payloads.map((payload) => payload.idempotent);
    assert.equal(new Set(idempotentFlags).size, 2, "one concurrent call creates and the other reuses the bootstrap");
    assert.ok(idempotentFlags.includes(false));
    assert.ok(idempotentFlags.includes(true));

    const counts = await admin.query(
      "select (select count(*) from public.companies) as companies, (select count(*) from public.deployment_configuration) as configurations, (select count(*) from public.company_members where user_id = $1) as memberships, (select count(*) from public.company_audit_events where event_type = 'COMPANY_CREATED') as audits",
      [ids.adminUser],
    );
    assert.deepEqual(counts.rows[0], { companies: "1", configurations: "1", memberships: "1", audits: "1" });
  } finally {
    try {
      await admin.query("begin");
      await admin.query("set local session_replication_role = 'replica'");
      await admin.query("delete from public.company_audit_events");
      await admin.query("delete from public.company_members");
      await admin.query("delete from public.deployment_configuration");
      await admin.query("delete from public.companies");
      await admin.query("delete from auth.users where id = $1", [ids.adminUser]);
      await admin.query("commit");
    } catch {
      await admin.query("rollback").catch(() => {});
    }
    await callerOne.end();
    await callerTwo.end();
    await admin.end();
  }
});
