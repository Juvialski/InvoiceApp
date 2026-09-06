import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const { Client } = pg;
const runtimeEnabled = process.env.INVENTORY_RUNTIME_DB === "1";
const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ids = {
  userOne: "00000000-0000-4000-8000-000000000971",
  userTwo: "00000000-0000-4000-8000-000000000972",
  company: "aaaaaaaa-0000-4000-8000-000000000971",
  project: "10000000-0000-4000-8000-000000000971",
  item: "20000000-0000-4000-8000-000000000971",
};

async function connect() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  return client;
}

async function asUser(client: pg.Client, userId: string) {
  await client.query("set role authenticated");
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

test("inventory runtime row locking allows only one concurrent issue to commit", { skip: !runtimeEnabled }, async () => {
  const admin = await connect();
  const userOne = await connect();
  const userTwo = await connect();
  try {
    await admin.query("insert into auth.users (id, email, encrypted_password, created_at, updated_at) values ($1, 'inventory-runtime-one@test.local', 'x', now(), now()), ($2, 'inventory-runtime-two@test.local', 'x', now(), now()) on conflict (id) do nothing", [ids.userOne, ids.userTwo]);
    await admin.query("insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id) values ($1, 'Inventory Runtime Company', 'inventory-runtime-company', 'ACTIVE', 'PHP', 'Asia/Manila', $2, $2)", [ids.company, ids.userOne]);
    await admin.query("insert into public.company_members (company_id, user_id, role_key, status) values ($1, $2, 'COMPANY_ADMIN', 'ACTIVE'), ($1, $3, 'COMPANY_ADMIN', 'ACTIVE')", [ids.company, ids.userOne, ids.userTwo]);
    await admin.query("insert into public.deployment_configuration (singleton, company_id) values (true, $1) on conflict (singleton) do update set company_id = excluded.company_id", [ids.company]);
    await admin.query("insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment) values ($1, $2, $3, 'INV-RUNTIME-001', 'Inventory Runtime Project', 'ACTIVE', 1000, 800, 'PHP', 'VAT')", [ids.project, ids.userOne, ids.company]);
    await asUser(userOne, ids.userOne);
    await asUser(userTwo, ids.userTwo);

    await userOne.query("select public.save_inventory_item($1::jsonb)", [JSON.stringify({ id: ids.item, companyId: ids.company, itemName: "Runtime Concrete", itemCode: "INV-RUNTIME-001", stockUnit: "cu.m" })]);
    await userOne.query("select public.record_inventory_movement($1::jsonb)", [JSON.stringify({ companyId: ids.company, itemId: ids.item, movementType: "OPENING", quantity: 10, reason: "Runtime opening count", idempotencyKey: "runtime-opening-001" })]);

    const issue = (client: pg.Client, key: string) => client.query("select public.record_inventory_movement($1::jsonb) as result", [JSON.stringify({ companyId: ids.company, itemId: ids.item, movementType: "PROJECT_ISSUE", quantity: 7, projectId: ids.project, reason: "Concurrent runtime issue", idempotencyKey: key })]);
    const results = await Promise.allSettled([issue(userOne, "runtime-issue-one"), issue(userTwo, "runtime-issue-two")]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1, "exactly one concurrent issue commits");
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.equal((rejected?.reason as { code?: string })?.code, "23514", "the losing issue is rejected by the database balance guard");
    await userOne.query("select public.record_inventory_movement($1::jsonb)", [JSON.stringify({ companyId: ids.company, itemId: ids.item, movementType: "PROJECT_ISSUE", quantity: 2, projectId: ids.project, reason: "Second runtime issue", idempotencyKey: "runtime-issue-three" })]);
    const returnFromProject = (client: pg.Client, key: string) => client.query("select public.record_inventory_movement($1::jsonb) as result", [JSON.stringify({ companyId: ids.company, itemId: ids.item, movementType: "PROJECT_RETURN", quantity: 6, projectId: ids.project, reason: "Concurrent runtime return", idempotencyKey: key })]);
    const returnResults = await Promise.allSettled([returnFromProject(userOne, "runtime-return-one"), returnFromProject(userTwo, "runtime-return-two")]);
    assert.equal(returnResults.filter((result) => result.status === "fulfilled").length, 1, "exactly one concurrent return commits");
    const rejectedReturn = returnResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.equal((rejectedReturn?.reason as { code?: string })?.code, "23514", "the losing return is rejected by the database issued-quantity guard");
    const balance = await admin.query("select on_hand_quantity from public.inventory_item_balances where company_id = $1 and inventory_item_id = $2", [ids.company, ids.item]);
    assert.equal(Number(balance.rows[0]?.on_hand_quantity), 7, "authoritative derived on-hand never becomes negative after concurrent issue and return attempts");
  } finally {
    try {
      await admin.query("begin");
      await admin.query("set local session_replication_role = 'replica'");
      await admin.query("delete from public.company_audit_events where company_id = $1", [ids.company]);
      await admin.query("delete from public.inventory_movements where company_id = $1", [ids.company]);
      await admin.query("delete from public.inventory_items where company_id = $1", [ids.company]);
      await admin.query("delete from public.projects where company_id = $1", [ids.company]);
      await admin.query("delete from public.deployment_configuration where singleton = true and company_id = $1", [ids.company]);
      await admin.query("delete from public.company_members where company_id = $1", [ids.company]);
      await admin.query("delete from public.companies where id = $1", [ids.company]);
      await admin.query("delete from auth.users where id = any($1::uuid[])", [[ids.userOne, ids.userTwo]]);
      await admin.query("commit");
    } catch {
      await admin.query("rollback").catch(() => {});
    }
    await userOne.end();
    await userTwo.end();
    await admin.end();
  }
});
