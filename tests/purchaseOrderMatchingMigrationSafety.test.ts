import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260903100000_purchase_order_invoice_matching.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

test("purchaseOrderMatchingMigrationSafety: migration file exists and is strictly monotonically ordered", () => {
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist");
  assert.ok(migration.length > 500, "Migration file must contain SQL content");

  const migrationDir = path.resolve(__dirname, "../supabase/migrations");
  const sqlFiles = fs.readdirSync(migrationDir).filter((f) => f.endsWith(".sql")).sort();

  const currentIndex = sqlFiles.indexOf("20260903100000_purchase_order_invoice_matching.sql");
  assert.ok(currentIndex > 0, "Migration must be in the sorted file list");

  const previousFile = sqlFiles[currentIndex - 1];
  assert.ok(
    "20260903100000" > previousFile.slice(0, 14),
    `Migration timestamp must be strictly greater than previous (${previousFile})`,
  );
});

test("purchaseOrderMatchingMigrationSafety: creates purchase_order_invoice_matches table with required constraints and partial unique index", () => {
  assert.match(migration, /create table if not exists public\.purchase_order_invoice_matches/i);
  assert.match(migration, /company_id uuid not null references public\.companies\(id\) on delete restrict/i);
  assert.match(migration, /invoice_id uuid not null references public\.invoices\(id\) on delete restrict/i);
  assert.match(migration, /purchase_order_id uuid not null references public\.purchase_orders\(id\) on delete restrict/i);
  assert.match(migration, /match_source text not null default 'MANUAL' check \(match_source in \('MANUAL',\s*'PO_NUMBER_EXACT',\s*'SUGGESTED_CONFIRMED'\)\)/i);
  assert.match(migration, /status text not null default 'CONFIRMED' check \(status in \('CONFIRMED',\s*'UNMATCHED'\)\)/i);
  assert.match(migration, /confirmed_by_user_id uuid references auth\.users\(id\) on delete set null/i);
  assert.match(migration, /confirmed_at timestamptz not null default now\(\)/i);
  assert.match(migration, /unmatched_by_user_id uuid references auth\.users\(id\) on delete set null/i);
  assert.match(migration, /unmatched_at timestamptz/i);
  assert.match(migration, /unmatch_reason text check \(unmatch_reason is null or length\(btrim\(unmatch_reason\)\) between 3 and 500\)/i);
  assert.match(migration, /notes text check \(notes is null or length\(btrim\(notes\)\) <= 1000\)/i);

  // Partial unique index for single active match per invoice
  assert.match(
    migration,
    /create unique index (?:if not exists )?purchase_order_invoice_matches_active_invoice_unique\s+on public\.purchase_order_invoice_matches\s*\(company_id,\s*invoice_id\)\s+where\s+status\s*=\s*'CONFIRMED'/i,
  );

  // General indexes
  assert.match(migration, /create index (?:if not exists )?\w+\s+on public\.purchase_order_invoice_matches\s*\(company_id,\s*invoice_id\)/i);
  assert.match(migration, /create index (?:if not exists )?\w+\s+on public\.purchase_order_invoice_matches\s*\(company_id,\s*purchase_order_id,\s*status\)/i);
  assert.match(migration, /create index (?:if not exists )?\w+\s+on public\.purchase_order_invoice_matches\s*\(company_id,\s*status\)/i);
});

test("purchaseOrderMatchingMigrationSafety: creates purchase_order_invoice_match_lines table with required columns and constraints", () => {
  assert.match(migration, /create table if not exists public\.purchase_order_invoice_match_lines/i);
  assert.match(migration, /company_id uuid not null references public\.companies\(id\) on delete restrict/i);
  assert.match(migration, /match_id uuid not null references public\.purchase_order_invoice_matches\(id\) on delete cascade/i);
  assert.match(migration, /purchase_order_line_id uuid not null references public\.purchase_order_lines\(id\) on delete restrict/i);
  assert.match(migration, /invoice_line_id text not null check \(length\(btrim\(invoice_line_id\)\) >= 1\)/i);
  assert.match(migration, /line_number integer not null default 1 check \(line_number >= 1\)/i);
  assert.match(migration, /matched_quantity numeric\(14,\s*4\) check \(matched_quantity is null or matched_quantity >= 0\)/i);
  assert.match(migration, /matched_amount numeric\(18,\s*2\) check \(matched_amount is null or matched_amount >= 0\)/i);
  assert.match(migration, /notes text check \(notes is null or length\(btrim\(notes\)\) <= 500\)/i);

  // Unique constraint
  assert.match(
    migration,
    /constraint purchase_order_invoice_match_lines_company_match_inv_line_key unique \(company_id,\s*match_id,\s*invoice_line_id\)/i,
  );
});

test("purchaseOrderMatchingMigrationSafety: registers tables in tenant policy catalog and configures strict RLS", () => {
  // Catalog registration with allow_insert=false, allow_update=false, allow_delete=false
  assert.match(migration, /insert into private\.company_tenant_policy_catalog/i);
  assert.ok(migration.includes("'purchase_order_invoice_matches'"));
  assert.ok(migration.includes("'purchase_order_invoice_match_lines'"));
  assert.ok(migration.includes("false, false, false"));

  // RLS enabled
  assert.match(migration, /alter table public\.purchase_order_invoice_matches enable row level security/i);
  assert.match(migration, /alter table public\.purchase_order_invoice_match_lines enable row level security/i);

  // SELECT policy requires invoices.read AND procurement.read
  assert.match(migration, /has_company_permission\(company_id,\s*'invoices\.read'\)/i);
  assert.match(migration, /has_company_permission\(company_id,\s*'procurement\.read'\)/i);

  // Direct client writes are rejected
  assert.match(migration, /purchase_order_invoice_matches_reject_insert/i);
  assert.match(migration, /purchase_order_invoice_matches_reject_update/i);
  assert.match(migration, /purchase_order_invoice_matches_reject_delete/i);
  assert.match(migration, /purchase_order_invoice_match_lines_reject_insert/i);
  assert.match(migration, /purchase_order_invoice_match_lines_reject_update/i);
  assert.match(migration, /purchase_order_invoice_match_lines_reject_delete/i);

  // Table grants
  assert.match(migration, /grant select on table public\.purchase_order_invoice_matches to authenticated/i);
  assert.match(migration, /grant select on table public\.purchase_order_invoice_match_lines to authenticated/i);
});

test("purchaseOrderMatchingMigrationSafety: guarded mutation RPC confirm_purchase_order_invoice_match enforces required checks", () => {
  assert.match(migration, /create or replace function public\.confirm_purchase_order_invoice_match/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);

  // Auth and permission checks
  assert.match(migration, /v_user_id is null/i);
  assert.match(migration, /has_company_permission\(v_company_id,\s*'invoices\.manage'\)/i);
  assert.match(migration, /has_company_permission\(v_company_id,\s*'procurement\.manage'\)/i);

  // Invoice checks: exists, not VOID
  assert.match(migration, /Invoice not found/i);
  assert.match(migration, /Cannot match a void invoice/i);

  // Purchase order checks: exists, company match, ISSUED or CLOSED only
  assert.match(migration, /Purchase order not found/i);
  assert.match(migration, /Cross-company purchase order match is not permitted/i);
  assert.match(migration, /v_po_status not in \('ISSUED',\s*'CLOSED'\)/i);

  // Currency and vendor checks
  assert.match(migration, /Currency mismatch/i);
  assert.match(migration, /v_inv_vendor_id is null/i);
  assert.match(migration, /v_inv_vendor_id is distinct from v_po_vendor_id/i);

  // Check no active match
  assert.match(migration, /status = 'CONFIRMED'/i);
  assert.match(migration, /An active confirmed match already exists for this invoice/i);

  // Line-level checks
  assert.match(migration, /current_data->'items'/i);
  assert.match(migration, /Duplicate invoice line ID/i);
  assert.match(migration, /Matched lines total amount \(.*?\) exceeds invoice grand total/i);
});

test("purchaseOrderMatchingMigrationSafety: guarded mutation RPC unmatch_purchase_order_invoice enforces required checks", () => {
  assert.match(migration, /create or replace function public\.unmatch_purchase_order_invoice/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);

  // Auth and reason length >= 3
  assert.match(migration, /v_user_id is null/i);
  assert.match(migration, /length\(btrim\(coalesce\(p_reason,\s*''\)\)\) < 3/i);

  // Permission and match existence
  assert.match(migration, /Purchase order match not found/i);
  assert.match(migration, /v_match_row\.status <> 'CONFIRMED'/i);

  // Status update
  assert.match(migration, /status\s*=\s*'UNMATCHED'/i);
  assert.match(migration, /unmatched_by_user_id\s*=\s*v_user_id/i);
  assert.match(migration, /unmatched_at\s*=\s*now\(\)/i);
  assert.match(migration, /unmatch_reason\s*=\s*btrim\(p_reason\)/i);
});
