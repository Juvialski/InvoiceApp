import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260903120000_rfqs_and_supplier_quotations.sql",
);

test("rfqMigrationSafety: migration file exists and is monotonic with predecessor migrations", () => {
  assert.equal(fs.existsSync(migrationPath), true);
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.ok(sql.length > 500);

  const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
  const allSqlFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const currentIndex = allSqlFiles.indexOf("20260903120000_rfqs_and_supplier_quotations.sql");
  assert.ok(currentIndex > 0, "Migration must be found in supabase/migrations");

  const prevMigration = allSqlFiles[currentIndex - 1];
  const currentTimestamp = "20260903120000_rfqs_and_supplier_quotations.sql".slice(0, 14);
  const prevTimestamp = prevMigration.slice(0, 14);

  assert.ok(
    currentTimestamp >= prevTimestamp,
    `Current migration (${currentTimestamp}) must be monotonically ordered after previous (${prevTimestamp}: ${prevMigration})`,
  );
});

test("rfqMigrationSafety: defines all required RFQ and Supplier Quotation tables with foreign keys and columns", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  // 5 new tables created
  assert.match(sql, /create table if not exists public\.rfqs/i);
  assert.match(sql, /create table if not exists public\.rfq_lines/i);
  assert.match(sql, /create table if not exists public\.rfq_invited_vendors/i);
  assert.match(sql, /create table if not exists public\.supplier_quotations/i);
  assert.match(sql, /create table if not exists public\.supplier_quotation_lines/i);

  // Status check constraints
  assert.match(sql, /status in \('DRAFT',\s*'ISSUED',\s*'CLOSED',\s*'CANCELLED'\)/i);
  assert.match(sql, /status in \('SUBMITTED',\s*'SELECTED',\s*'REJECTED',\s*'CANCELLED'\)/i);

  // RFQ lines columns & checks
  assert.match(sql, /rfq_id uuid not null references public\.rfqs\(id\) on delete cascade/i);
  assert.match(sql, /quantity numeric\(14,\s*4\) not null default 1 check \(quantity > 0\)/i);
  assert.match(sql, /project_cost_code_id uuid references public\.project_cost_codes\(id\)/i);

  // Supplier quotation lines columns & checks
  assert.match(sql, /quotation_id uuid not null references public\.supplier_quotations\(id\) on delete cascade/i);
  assert.match(sql, /rfq_line_id uuid references public\.rfq_lines\(id\)/i);
  assert.match(sql, /is_no_bid boolean not null default false/i);

  // purchase_orders provenance alterations
  assert.match(sql, /alter table public\.purchase_orders/i);
  assert.match(sql, /add column if not exists rfq_id uuid references public\.rfqs\(id\)/i);
  assert.match(sql, /add column if not exists supplier_quotation_id uuid references public\.supplier_quotations\(id\)/i);
});

test("rfqMigrationSafety: registers tables in company tenant catalog and enables strict RLS", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  // Catalog registration with procurement permissions
  assert.match(sql, /insert into private\.company_tenant_policy_catalog/i);
  assert.ok(sql.includes("('rfqs', 'procurement.read', 'procurement.manage'"));
  assert.ok(sql.includes("('rfq_lines', 'procurement.read', 'procurement.manage'"));
  assert.ok(sql.includes("('rfq_invited_vendors', 'procurement.read', 'procurement.manage'"));
  assert.ok(sql.includes("('supplier_quotations', 'procurement.read', 'procurement.manage'"));
  assert.ok(sql.includes("('supplier_quotation_lines', 'procurement.read', 'procurement.manage'"));

  // RLS enabled on all 5 tables
  assert.match(sql, /alter table public\.rfqs enable row level security/i);
  assert.match(sql, /alter table public\.rfq_lines enable row level security/i);
  assert.match(sql, /alter table public\.rfq_invited_vendors enable row level security/i);
  assert.match(sql, /alter table public\.supplier_quotations enable row level security/i);
  assert.match(sql, /alter table public\.supplier_quotation_lines enable row level security/i);

  // Direct client writes rejected by RLS
  assert.match(sql, /create policy rfqs_reject_insert on public\.rfqs for insert to authenticated with check \(false\)/i);
  assert.match(sql, /create policy rfqs_reject_update on public\.rfqs for update to authenticated using \(false\)/i);
  assert.match(sql, /create policy rfqs_reject_delete on public\.rfqs for delete to authenticated using \(false\)/i);

  assert.match(sql, /create policy supplier_quotations_reject_insert on public\.supplier_quotations for insert to authenticated with check \(false\)/i);
  assert.match(sql, /create policy supplier_quotations_reject_update on public\.supplier_quotations for update to authenticated using \(false\)/i);
  assert.match(sql, /create policy supplier_quotations_reject_delete on public\.supplier_quotations for delete to authenticated using \(false\)/i);
});

test("rfqMigrationSafety: defines all required guarded security-definer RPCs", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  // 7 Guarded RPCs
  assert.match(sql, /create or replace function public\.save_rfq/i);
  assert.match(sql, /create or replace function public\.transition_rfq_status/i);
  assert.match(sql, /create or replace function public\.delete_draft_rfq/i);
  assert.match(sql, /create or replace function public\.save_supplier_quotation/i);
  assert.match(sql, /create or replace function public\.select_supplier_quotation/i);
  assert.match(sql, /create or replace function public\.revert_supplier_quotation_selection/i);
  assert.match(sql, /create or replace function public\.convert_quotation_to_draft_po/i);

  // Conversion RPC must enforce DRAFT purchase order status
  assert.match(sql, /'DRAFT'/i);
  assert.match(sql, /convert_quotation_to_draft_po[\s\S]*?'DRAFT'/);
});
