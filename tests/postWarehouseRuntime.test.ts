import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;
const runtimeEnabled = process.env.POST_WAREHOUSE_RUNTIME_DB === "1";
const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ids = {
  userOne: "00000000-0000-4000-8000-000000001201",
  userTwo: "00000000-0000-4000-8000-000000001202",
  company: "aaaaaaaa-0000-4000-8000-000000001201",
  projectA: "10000000-0000-4000-8000-000000001201",
  projectB: "10000000-0000-4000-8000-000000001202",
  vendor: "20000000-0000-4000-8000-000000001201",
  invoice: "30000000-0000-4000-8000-000000001201",
  equipment: "40000000-0000-4000-8000-000000001201",
};

async function connect(role?: string) {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  if (role) await client.query(`set role ${role}`);
  return client;
}

async function asUser(client: pg.Client, userId: string) {
  await client.query("set role authenticated");
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

test("post-Warehouse supplier reconciliation and Equipment assignment stay deterministic under concurrent callers", { skip: !runtimeEnabled }, async () => {
  const admin = await connect();
  const userOne = await connect();
  const userTwo = await connect();
  try {
    await admin.query("insert into auth.users (id, email, encrypted_password, created_at, updated_at) values ($1, 'post-runtime-one@test.local', 'x', now(), now()), ($2, 'post-runtime-two@test.local', 'x', now(), now()) on conflict (id) do nothing", [ids.userOne, ids.userTwo]);
    await admin.query("insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id) values ($1, 'Post Runtime Company', 'post-runtime-company', 'ACTIVE', 'PHP', 'Asia/Manila', $2, $2)", [ids.company, ids.userOne]);
    await admin.query("insert into public.company_members (company_id, user_id, role_key, status) values ($1, $2, 'COMPANY_ADMIN', 'ACTIVE'), ($1, $3, 'COMPANY_ADMIN', 'ACTIVE')", [ids.company, ids.userOne, ids.userTwo]);
    await admin.query("insert into public.deployment_configuration (singleton, company_id) values (true, $1) on conflict (singleton) do update set company_id = excluded.company_id", [ids.company]);
    await admin.query("insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment) values ($1, $2, $3, 'POST-RUNTIME-A', 'Runtime Project A', 'ACTIVE', 1000, 1000, 'PHP', 'VAT'), ($4, $2, $3, 'POST-RUNTIME-B', 'Runtime Project B', 'ACTIVE', 1000, 1000, 'PHP', 'VAT')", [ids.projectA, ids.userOne, ids.company, ids.projectB]);
    await admin.query("insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency) values ($1, $2, $3, 'Runtime Supplier', 'runtime supplier', 'PHP')", [ids.vendor, ids.userOne, ids.company]);
    await admin.query("insert into public.invoices (id, user_id, company_id, vendor_id, invoice_number, invoice_date, currency, grand_total, review_status, document_type, current_data) values ($1, $2, $3, $4, 'POST-RUNTIME-INV', current_date, 'PHP', 100, 'NEEDS_REVIEW', 'INVOICE', jsonb_build_object('vendor', jsonb_build_object('name', 'Runtime Supplier'), 'category', 'Materials', 'description', 'Concurrent supplier materials', 'grandTotal', 100))", [ids.invoice, ids.userOne, ids.company, ids.vendor]);
    await asUser(userOne, ids.userOne);
    await asUser(userTwo, ids.userTwo);
    await userOne.query("select public.save_engineering_equipment($1::jsonb)", [JSON.stringify({ id: ids.equipment, companyId: ids.company, assetReference: "POST-RUNTIME-EX", equipmentName: "Runtime Excavator", equipmentSource: "OWNED" })]);

    const expected = await admin.query("select updated_at::text as updated_at from public.invoices where id = $1", [ids.invoice]);
    const allocationPayload = JSON.stringify([{ project_id: ids.projectB, allocation_type: "AMOUNT", allocation_amount: 100 }]);
    const results = await Promise.allSettled([
      userOne.query("select public.verify_supplier_invoice_and_create_expense($1)", [ids.invoice]),
      userTwo.query("select public.replace_invoice_project_allocations($1, $2::jsonb, $3)", [ids.invoice, allocationPayload, expected.rows[0].updated_at]),
    ]);
    assert.equal(results[0]?.status, "fulfilled", "concurrent verification must succeed");
    if (results[1]?.status === "rejected" && (results[1].reason as { code?: string })?.code === "40001") {
      const latest = await admin.query("select updated_at::text as updated_at from public.invoices where id = $1", [ids.invoice]);
      await userTwo.query("select public.replace_invoice_project_allocations($1, $2::jsonb, $3)", [ids.invoice, allocationPayload, latest.rows[0].updated_at]);
    } else {
      assert.equal(results[1]?.status, "fulfilled", "allocation replacement must succeed or be retried from a concrete stale-write response");
    }
    const expense = await admin.query("select project_id from public.expenses where company_id = $1 and supplier_invoice_id = $2", [ids.company, ids.invoice]);
    assert.equal(expense.rowCount, 1, "concurrent verify/allocation creates one Expense");
    assert.equal(expense.rows[0]?.project_id, ids.projectB, "final Expense projection matches the canonical allocation");

    const equipmentResults = await Promise.allSettled([
      userOne.query("select public.assign_engineering_equipment($1, $2, current_date, 'Concurrent A')", [ids.equipment, ids.projectA]),
      userTwo.query("select public.assign_engineering_equipment($1, $2, current_date, 'Concurrent B')", [ids.equipment, ids.projectB]),
    ]);
    assert.equal(equipmentResults.filter((result) => result.status === "fulfilled").length, 1, "only one concurrent Equipment assignment may succeed");
    assert.equal(equipmentResults.filter((result) => result.status === "rejected").length, 1, "the losing Equipment assignment is rejected");
    const activeAssignments = await admin.query("select project_id from public.engineering_equipment_assignments where company_id = $1 and equipment_id = $2 and assignment_end is null", [ids.company, ids.equipment]);
    assert.equal(activeAssignments.rowCount, 1, "database leaves one active Equipment assignment");
  } finally {
    await userOne.end().catch(() => {});
    await userTwo.end().catch(() => {});
    try {
      await admin.query("begin");
      await admin.query("set local session_replication_role = 'replica'");
      await admin.query("delete from public.engineering_equipment_events where company_id = $1", [ids.company]);
      await admin.query("delete from public.engineering_equipment_assignments where company_id = $1", [ids.company]);
      await admin.query("delete from public.engineering_project_equipment where company_id = $1", [ids.company]);
      await admin.query("delete from public.engineering_equipment_registry where company_id = $1", [ids.company]);
      await admin.query("delete from public.expenses where company_id = $1", [ids.company]);
      await admin.query("delete from public.invoice_project_allocations where company_id = $1", [ids.company]);
      await admin.query("delete from public.invoices where company_id = $1", [ids.company]);
      await admin.query("delete from public.vendors where company_id = $1", [ids.company]);
      await admin.query("delete from public.projects where company_id = $1", [ids.company]);
      await admin.query("delete from public.company_document_profiles where company_id = $1", [ids.company]);
      await admin.query("delete from public.company_audit_events where company_id = $1", [ids.company]);
      await admin.query("delete from public.deployment_configuration where singleton = true and company_id = $1", [ids.company]);
      await admin.query("delete from public.company_members where company_id = $1", [ids.company]);
      await admin.query("delete from public.companies where id = $1", [ids.company]);
      await admin.query("delete from auth.users where id = any($1::uuid[])", [[ids.userOne, ids.userTwo]]);
      await admin.query("commit");
    } catch {
      await admin.query("rollback").catch(() => {});
    }
    await admin.end().catch(() => {});
  }
});
