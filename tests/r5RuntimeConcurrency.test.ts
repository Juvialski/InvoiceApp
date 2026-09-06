import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const { Client } = pg;
const runtimeEnabled = process.env.R5_RUNTIME_DB === "1";
const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ids = {
  userOne: "00000000-0000-4000-8000-000000000951",
  userTwo: "00000000-0000-4000-8000-000000000952",
  company: "aaaaaaaa-0000-4000-8000-000000000951",
  vendor: "20000000-0000-4000-8000-000000000951",
  invoice: "30000000-0000-4000-8000-000000000951",
  source: "40000000-0000-4000-8000-000000000951",
  sourceRaceOne: "40000000-0000-4000-8000-000000000952",
  sourceRaceTwo: "40000000-0000-4000-8000-000000000953",
  project: "10000000-0000-4000-8000-000000000951",
  purchaseOrder: "60000000-0000-4000-8000-000000000951",
  purchaseOrderLine: "70000000-0000-4000-8000-000000000951",
  matchInvoice: "80000000-0000-4000-8000-000000000951",
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

test("R5 two-user runtime checks enforce Vendor, PO match, source, actor, and receipt exactly-once contracts", { skip: !runtimeEnabled }, async () => {
  const admin = await connect();
  const userOne = await connect();
  const userTwo = await connect();
  try {
    await admin.query("insert into auth.users (id, email, encrypted_password, created_at, updated_at) values ($1, 'r5-runtime-one@test.local', 'x', now(), now()), ($2, 'r5-runtime-two@test.local', 'x', now(), now()) on conflict (id) do nothing", [ids.userOne, ids.userTwo]);
    await admin.query("insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id) values ($1, 'R5 Runtime Company', 'r5-runtime-company', 'ACTIVE', 'PHP', 'Asia/Manila', $2, $2)", [ids.company, ids.userOne]);
    await admin.query("insert into public.company_members (company_id, user_id, role_key, status) values ($1, $2, 'COMPANY_ADMIN', 'ACTIVE'), ($1, $3, 'COMPANY_ADMIN', 'ACTIVE')", [ids.company, ids.userOne, ids.userTwo]);
    await admin.query("insert into public.deployment_configuration (singleton, company_id) values (true, $1) on conflict (singleton) do update set company_id = excluded.company_id", [ids.company]);
    await admin.query("insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment) values ($1, $2, $3, 'R5-RUNTIME-PROJECT', 'R5 Runtime Project', 'ACTIVE', 1000, 800, 'PHP', 'VAT')", [ids.project, ids.userOne, ids.company]);
    await asUser(userOne, ids.userOne);
    await asUser(userTwo, ids.userTwo);

    const vendorResults = await Promise.all([
      userOne.query("select public.create_or_update_vendor(jsonb_build_object('name', 'R5 Concurrent Vendor', 'taxId', '555-666-777-000')) as result"),
      userTwo.query("select public.create_or_update_vendor(jsonb_build_object('name', 'R5 Concurrent Vendor', 'taxId', '555-666-777-000')) as result"),
    ]);
    const vendorIds = vendorResults.map((result) => String(result.rows[0].result.vendor.id));
    assert.equal(new Set(vendorIds).size, 1, "concurrent Vendor resolution returns one canonical identity");
    const vendorCount = await admin.query("select count(*)::int as count from public.vendors where company_id = $1 and tax_id = '555-666-777-000'", [ids.company]);
    assert.equal(vendorCount.rows[0].count, 1);

    await admin.query("insert into public.invoices (id, user_id, company_id, invoice_number, invoice_date, currency, grand_total, review_status, document_type, current_data) values ($1, $2, $3, 'R5-RUNTIME-INV', current_date, 'PHP', 10, 'NEEDS_REVIEW', 'INVOICE', '{}'::jsonb)", [ids.invoice, ids.userOne, ids.company]);
    const spoofed = await userTwo.query("insert into public.invoice_review_events (user_id, company_id, invoice_id, event_type, new_value) values ($1, $2, $3, 'R5_RUNTIME_ACTOR', '{}'::jsonb) returning user_id", [ids.userOne, ids.company, ids.invoice]);
    assert.equal(spoofed.rows[0].user_id, ids.userTwo, "database derives the second authenticated actor");

    await userOne.query("insert into public.purchase_orders (id, company_id, po_number, vendor_id, project_id, currency, status, created_by_user_id, updated_by_user_id) values ($1, $2, 'R5-RUNTIME-PO', $3, $4, 'PHP', 'DRAFT', $5, $5)", [ids.purchaseOrder, ids.company, vendorIds[0], ids.project, ids.userOne]);
    await userOne.query("insert into public.purchase_order_lines (id, company_id, purchase_order_id, line_number, description, quantity, unit, unit_price, amount) values ($1, $2, $3, 1, 'R5 runtime PO line', 1, 'lot', 100, 100)", [ids.purchaseOrderLine, ids.company, ids.purchaseOrder]);
    await userOne.query("select public.transition_purchase_order_status($1, 'APPROVED', null)", [ids.purchaseOrder]);
    await userOne.query("select public.transition_purchase_order_status($1, 'ISSUED', null)", [ids.purchaseOrder]);
    await admin.query("insert into public.invoices (id, user_id, company_id, vendor_id, invoice_number, invoice_date, currency, grand_total, review_status, document_type, current_data) values ($1, $2, $3, $4, 'R5-RUNTIME-MATCH', current_date, 'PHP', 100, 'VERIFIED', 'INVOICE', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', 'r5-runtime-line', 'description', 'R5 runtime line'))))", [ids.matchInvoice, ids.userOne, ids.company, vendorIds[0]]);
    const matchLines = JSON.stringify([{ invoiceLineId: "r5-runtime-line", purchaseOrderLineId: ids.purchaseOrderLine, matchedAmount: 100 }]);
    const matchResults = await Promise.allSettled([
      userOne.query("select public.confirm_purchase_order_invoice_match($1, $2, 'MANUAL', 'R5 runtime match', $3::jsonb)", [ids.matchInvoice, ids.purchaseOrder, matchLines]),
      userTwo.query("select public.confirm_purchase_order_invoice_match($1, $2, 'MANUAL', 'R5 runtime match', $3::jsonb)", [ids.matchInvoice, ids.purchaseOrder, matchLines]),
    ]);
    assert.equal(matchResults.filter((result) => result.status === "fulfilled").length, 1, "PO match concurrency creates one active match");
    const rejectedMatch = matchResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.equal((rejectedMatch?.reason as { code?: string })?.code, "23505", "the losing concurrent PO match fails at the unique database contract");

    await admin.query("insert into public.source_documents (id, user_id, company_id, source_type, filename, mime_type, file_size, storage_path, sha256, processing_status) values ($1, $2, $3, 'UPLOAD', 'r5-runtime.pdf', 'application/pdf', 8, 'companies/r5-runtime/r5.pdf', repeat('d', 64), 'STORED')", [ids.source, ids.userOne, ids.company]);
    const sourceInsert = (client: pg.Client, userId: string, sourceId: string, fileName: string) => client.query("insert into public.source_documents (id, user_id, company_id, source_type, filename, mime_type, file_size, storage_path, sha256, processing_status) values ($1, $2, $3, 'UPLOAD', $4, 'application/pdf', 8, $5, repeat('e', 64), 'STORED')", [sourceId, userId, ids.company, fileName, `companies/r5-runtime/${fileName}`]);
    const sourceResults = await Promise.allSettled([sourceInsert(userOne, ids.userOne, ids.sourceRaceOne, "r5-race-one.pdf"), sourceInsert(userTwo, ids.userTwo, ids.sourceRaceTwo, "r5-race-two.pdf")]);
    assert.equal(sourceResults.filter((result) => result.status === "fulfilled").length, 1, "source-document concurrency creates one canonical upload row");
    const rejectedSource = sourceResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.equal((rejectedSource?.reason as { code?: string })?.code, "23505", "the losing concurrent source-document insert fails at the unique database contract");
    const expenseInsert = (client: pg.Client, userId: string, expenseId: string) => client.query("insert into public.expenses (id, user_id, company_id, expense_date, category, description, amount, currency, status, receipt_source_document_id) values ($1, $2, $3, current_date, 'Materials', 'R5 runtime receipt', 10, 'PHP', 'DRAFT', $4)", [expenseId, userId, ids.company, ids.source]);
    const receiptResults = await Promise.allSettled([expenseInsert(userOne, ids.userOne, "50000000-0000-4000-8000-000000000951"), expenseInsert(userTwo, ids.userTwo, "50000000-0000-4000-8000-000000000952")]);
    assert.equal(receiptResults.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = receiptResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.equal((rejected?.reason as { code?: string })?.code, "23505", "the losing concurrent receipt insert fails at the unique database contract");
  } finally {
    try {
      await admin.query("begin");
      // This teardown owns a unique throwaway company. Disable triggers only
      // inside this exact-company transaction so finalized test records do not
      // require production lifecycle deletion paths.
      await admin.query("set local session_replication_role = 'replica'");
      await admin.query("delete from public.invoice_review_events where invoice_id = any($1::uuid[])", [[ids.invoice, ids.matchInvoice]]);
      await admin.query("delete from public.expenses where company_id = $1", [ids.company]);
      await admin.query("delete from public.purchase_order_invoice_matches where company_id = $1 and invoice_id = $2", [ids.company, ids.matchInvoice]);
      await admin.query("delete from public.invoices where company_id = $1", [ids.company]);
      await admin.query("delete from public.purchase_order_lines where id = $1", [ids.purchaseOrderLine]);
      await admin.query("delete from public.purchase_orders where id = $1", [ids.purchaseOrder]);
      await admin.query("delete from public.projects where id = $1", [ids.project]);
      await admin.query("delete from public.source_documents where company_id = $1", [ids.company]);
      await admin.query("delete from public.vendor_master_events where company_id = $1", [ids.company]);
      await admin.query("delete from public.vendors where company_id = $1", [ids.company]);
      await admin.query("delete from public.company_document_profiles where company_id = $1", [ids.company]);
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
