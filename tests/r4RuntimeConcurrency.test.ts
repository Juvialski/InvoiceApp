import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;
const runtimeEnabled = process.env.R4_RUNTIME_DB === "1";
const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ids = {
  user: "00000000-0000-4000-8000-000000000901",
  company: "aaaaaaaa-0000-4000-8000-000000000901",
  project: "10000000-0000-4000-8000-000000000901",
  vendor: "20000000-0000-4000-8000-000000000901",
  invoice: "30000000-0000-4000-8000-000000000901",
};

async function connectAs(role?: string) {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  if (role) await client.query(`set role ${role}`);
  return client;
}

test("R3 supplier verification remains exactly-once under concurrent authenticated retries", { skip: !runtimeEnabled }, async () => {
  const admin = await connectAs();
  const callers: pg.Client[] = [];
  try {
    await admin.query("insert into auth.users (id, email, encrypted_password, created_at, updated_at) values ($1, 'r4-concurrency@test.local', 'x', now(), now()) on conflict (id) do nothing", [ids.user]);
    await admin.query("insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id) values ($1, 'R4 Concurrency Company', 'r4-concurrency', 'ACTIVE', 'PHP', 'Asia/Manila', $2, $2)", [ids.company, ids.user]);
    await admin.query("insert into public.company_members (company_id, user_id, role_key, status) values ($1, $2, 'COMPANY_ADMIN', 'ACTIVE')", [ids.company, ids.user]);
    await admin.query("insert into public.deployment_configuration (singleton, company_id) values (true, $1) on conflict (singleton) do update set company_id = excluded.company_id", [ids.company]);
    await admin.query("insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment) values ($1, $2, $3, 'R4-CONC', 'R4 Concurrency Project', 'ACTIVE', 1000, 800, 'PHP', 'VAT')", [ids.project, ids.user, ids.company]);
    await admin.query("insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency) values ($1, $2, $3, 'R4 Concurrency Supplier', 'r4 concurrency supplier', 'PHP')", [ids.vendor, ids.user, ids.company]);
    await admin.query("insert into public.invoices (id, user_id, company_id, vendor_id, invoice_number, invoice_date, currency, grand_total, review_status, document_type, current_data) values ($1, $2, $3, $4, 'R4-CONC-001', current_date, 'PHP', 125, 'VERIFIED', 'INVOICE', jsonb_build_object('vendor', jsonb_build_object('name', 'R4 Concurrency Supplier'), 'category', 'Materials', 'invoiceNumber', 'R4-CONC-001', 'grandTotal', 125))", [ids.invoice, ids.user, ids.company, ids.vendor]);

    for (let index = 0; index < 2; index += 1) {
      const caller = await connectAs("authenticated");
      callers.push(caller);
      await caller.query("select set_config('request.jwt.claim.sub', $1, false)", [ids.user]);
      await caller.query("begin");
    }

    const results = await Promise.all(callers.map(async (caller) => {
      const result = await caller.query("select public.verify_supplier_invoice_and_create_expense($1) as response", [ids.invoice]);
      await caller.query("commit");
      return result.rows[0]?.response as { expense?: { id?: string } };
    }));

    assert.ok(results.every((result) => result.expense?.id), "both retries return the authoritative Expense");
    const expenses = await admin.query("select id from public.expenses where company_id = $1 and supplier_invoice_id = $2", [ids.company, ids.invoice]);
    assert.equal(expenses.rowCount, 1, "concurrent retries create one Expense row");
    assert.equal(new Set(results.map((result) => result.expense?.id)).size, 1, "concurrent retries return the same Expense identity");
  } finally {
    for (const caller of callers) {
      await caller.query("rollback").catch(() => {});
      await caller.end().catch(() => {});
    }
    await admin.query("delete from public.expenses where company_id = $1 and supplier_invoice_id = $2", [ids.company, ids.invoice]).catch(() => {});
    await admin.query("delete from public.invoices where id = $1", [ids.invoice]).catch(() => {});
    await admin.query("delete from public.projects where id = $1", [ids.project]).catch(() => {});
    await admin.query("delete from public.vendors where id = $1", [ids.vendor]).catch(() => {});
    await admin.query("delete from public.deployment_configuration where singleton = true").catch(() => {});
    await admin.query("delete from public.company_members where company_id = $1", [ids.company]).catch(() => {});
    await admin.query("delete from public.companies where id = $1", [ids.company]).catch(() => {});
    await admin.query("delete from auth.users where id = $1", [ids.user]).catch(() => {});
    await admin.end();
  }
});
