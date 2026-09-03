import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260903140000_subcontracts_and_commitments.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

test("subcontracts migration file exists and has strictly monotonically increasing timestamp", () => {
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist");
  assert.ok(migration.length > 500, "Migration file must contain SQL content");

  const migrationDir = path.resolve(__dirname, "../supabase/migrations");
  const sqlFiles = fs.readdirSync(migrationDir).filter((f) => f.endsWith(".sql")).sort();

  const currentIndex = sqlFiles.indexOf("20260903140000_subcontracts_and_commitments.sql");
  assert.ok(currentIndex > 0, "Migration must be in the sorted file list");

  const previousFile = sqlFiles[currentIndex - 1];
  assert.ok(
    "20260903140000" > previousFile.slice(0, 14),
    `Migration timestamp 20260903140000 must be strictly greater than previous (${previousFile})`,
  );
});

test("creates subcontracts table with required structure and constraints", () => {
  assert.match(migration, /create table if not exists public\.subcontracts/i);
  assert.match(migration, /company_id uuid not null references public\.companies\(id\) on delete restrict/i);
  assert.match(migration, /subcontract_number text not null check \(length\(btrim\(subcontract_number\)\) between 1 and 60 and subcontract_number = upper\(btrim\(subcontract_number\)\)\)/i);
  assert.match(migration, /vendor_id uuid not null references public\.vendors\(id\) on delete restrict/i);
  assert.match(migration, /project_id uuid not null references public\.projects\(id\) on delete restrict/i);
  assert.match(migration, /title text not null check \(length\(btrim\(title\)\) between 1 and 255\)/i);
  assert.match(migration, /currency text not null default 'PHP' check \(currency = upper\(currency\) and currency ~ '\^\[A-Z\]\{3\}\$'\)/i);
  assert.match(migration, /status text not null default 'DRAFT' check \(status in \('DRAFT',\s*'APPROVED',\s*'ACTIVE',\s*'CLOSED',\s*'CANCELLED'\)\)/i);
  assert.match(migration, /original_amount numeric\(18,2\) not null default 0 check \(original_amount >= 0\)/i);
  assert.match(migration, /constraint subcontracts_company_id_id_key unique \(company_id, id\)/i);
  assert.match(migration, /constraint subcontracts_company_project_id_key unique \(company_id, project_id, id\)/i);

  // Case-insensitive unique subcontract number per company
  assert.match(migration, /create unique index if not exists subcontracts_company_subcontract_number_unique\s+on public\.subcontracts \(company_id,\s*lower\(subcontract_number\)\)/i);

  // Performance indexes
  assert.match(migration, /create index if not exists subcontracts_company_project_status_idx\s+on public\.subcontracts \(company_id,\s*project_id,\s*status,\s*updated_at desc\)/i);
  assert.match(migration, /create index if not exists subcontracts_company_vendor_idx\s+on public\.subcontracts \(company_id,\s*vendor_id,\s*updated_at desc\)/i);
  assert.match(migration, /create index if not exists subcontracts_company_status_idx\s+on public\.subcontracts \(company_id,\s*status,\s*updated_at desc\)/i);
});

test("creates subcontract_lines table with required columns and cascade/restrict foreign keys", () => {
  assert.match(migration, /create table if not exists public\.subcontract_lines/i);
  assert.match(migration, /company_id uuid not null references public\.companies\(id\) on delete restrict/i);
  assert.match(migration, /subcontract_id uuid not null references public\.subcontracts\(id\) on delete cascade/i);
  assert.match(migration, /line_number integer not null default 1 check \(line_number >= 1\)/i);
  assert.match(migration, /description text not null check \(length\(btrim\(description\)\) between 1 and 500\)/i);
  assert.match(migration, /amount numeric\(18,2\) not null default 0 check \(amount >= 0\)/i);
  assert.match(migration, /quantity numeric\(14,4\) check \(quantity is null or quantity > 0\)/i);
  assert.match(migration, /unit text check \(unit is null or length\(btrim\(unit\)\) between 1 and 50\)/i);
  assert.match(migration, /unit_rate numeric\(18,2\) check \(unit_rate is null or unit_rate >= 0\)/i);
  assert.match(migration, /project_cost_code_id uuid references public\.project_cost_codes\(id\) on delete restrict/i);
  assert.match(migration, /constraint subcontract_lines_company_sc_line_key unique \(company_id, subcontract_id, line_number\)/i);

  assert.match(migration, /create index if not exists subcontract_lines_company_sc_idx\s+on public\.subcontract_lines \(company_id,\s*subcontract_id,\s*line_number asc\)/i);
  assert.match(migration, /create index if not exists subcontract_lines_cost_code_idx\s+on public\.subcontract_lines \(company_id,\s*project_cost_code_id\)/i);
});

test("registers subcontracts and subcontract_lines in tenant policy catalog and configures RLS", () => {
  assert.match(migration, /insert into private\.company_tenant_policy_catalog/i);
  assert.match(migration, /\('subcontracts',\s*'procurement\.read',\s*'procurement\.manage',\s*true,\s*true,\s*true\)/i);
  assert.match(migration, /\('subcontract_lines',\s*'procurement\.read',\s*'procurement\.manage',\s*true,\s*true,\s*true\)/i);

  assert.match(migration, /alter table public\.subcontracts enable row level security/i);
  assert.match(migration, /alter table public\.subcontract_lines enable row level security/i);

  assert.match(migration, /create policy subcontracts_company_select\s+on public\.subcontracts\s+for select to authenticated/i);
  assert.match(migration, /create policy subcontract_lines_company_select\s+on public\.subcontract_lines\s+for select to authenticated/i);
});

test("trigger guards prevent cross-company vendor / project assignment and archived project activity", () => {
  // Project company validation
  assert.match(migration, /v_project_company_id is distinct from new\.company_id/);
  assert.match(migration, /Subcontract project is outside the company/i);

  // Vendor company validation
  assert.match(migration, /v_vendor_company_id is distinct from new\.company_id/);
  assert.match(migration, /Subcontract vendor is outside the company/i);

  // Archived project validation
  assert.match(migration, /v_project_status = 'ARCHIVED' or v_project_archived_at is not null/);
  assert.match(migration, /Archived projects cannot receive subcontract activity/i);
});

test("trigger guards prevent cross-project and cross-company cost code assignments on lines", () => {
  assert.match(migration, /cc\.project_id = v_sc_project_id\s+and cc\.company_id = new\.company_id/);
  assert.match(migration, /Cost code does not belong to the same project and company/i);
  assert.match(migration, /Archived cost codes cannot receive new subcontract line assignments/i);
});

test("trigger guards enforce draft-only creation, term immutability, and consequential lifecycle permissions", () => {
  // Draft insert check
  assert.match(migration, /Subcontracts must be created as DRAFT/i);

  // Lifecycle permission check
  assert.match(migration, /procurement\.approve permission is required for subcontract lifecycle transitions/i);

  // Transition validation
  assert.match(migration, /Draft subcontracts can only be approved or cancelled/i);
  assert.match(migration, /Approved subcontracts can only be activated or cancelled/i);
  assert.match(migration, /Active subcontracts can only be closed or cancelled/i);
  assert.match(migration, /Closed or cancelled subcontracts cannot undergo further transitions/i);

  // Approval requirements: at least 1 line item and positive original amount
  assert.match(migration, /A subcontract requires at least one line item before approval/i);
  assert.match(migration, /Subcontract original amount must be positive before approval/i);

  // Cancellation reason check
  assert.match(migration, /Cancellation reason is required when cancelling a subcontract/i);

  // Non-draft term immutability
  assert.match(migration, /Approved, active, closed, or cancelled subcontract terms are immutable/i);

  // Non-draft line immutability
  assert.match(migration, /Cannot add lines to a non-draft subcontract/i);
  assert.match(migration, /Cannot modify lines on a non-draft subcontract/i);
  assert.match(migration, /Cannot delete lines from a non-draft subcontract/i);
});

test("recalculates original_amount on header whenever lines change via sync_subcontract_original_amount trigger", () => {
  assert.match(migration, /create or replace function private\.sync_subcontract_original_amount/i);
  assert.match(migration, /select coalesce\(sum\(scl\.amount\), 0\)\s+into v_new_total\s+from public\.subcontract_lines scl/i);
  assert.match(migration, /update public\.subcontracts\s+set original_amount = v_new_total\s+where id = v_sc_id and company_id = v_company_id/i);
  assert.match(migration, /create trigger subcontract_lines_recalculate_header\s+after insert or update or delete on public\.subcontract_lines\s+for each row execute function private\.sync_subcontract_original_amount\(\)/i);
});

test("guarded RPCs are security definer with set search_path = '' and revokes anon access", () => {
  // create_or_update_subcontract
  assert.match(
    migration,
    /create or replace function public\.create_or_update_subcontract[\s\S]*?returns jsonb\s+language plpgsql\s+security definer\s+set search_path = ''/i,
  );
  assert.match(migration, /revoke all on function public\.create_or_update_subcontract\(jsonb,\s*jsonb\) from public,\s*anon/i);
  assert.match(migration, /grant execute on function public\.create_or_update_subcontract\(jsonb,\s*jsonb\) to authenticated/i);

  // transition_subcontract
  assert.match(
    migration,
    /create or replace function public\.transition_subcontract[\s\S]*?returns jsonb\s+language plpgsql\s+security definer\s+set search_path = ''/i,
  );
  assert.match(migration, /revoke all on function public\.transition_subcontract\(uuid,\s*text,\s*text\) from public,\s*anon/i);
  assert.match(migration, /grant execute on function public\.transition_subcontract\(uuid,\s*text,\s*text\) to authenticated/i);

  // delete_draft_subcontract
  assert.match(
    migration,
    /create or replace function public\.delete_draft_subcontract[\s\S]*?returns jsonb\s+language plpgsql\s+security definer\s+set search_path = ''/i,
  );
  assert.match(migration, /revoke all on function public\.delete_draft_subcontract\(uuid\) from public,\s*anon/i);
  assert.match(migration, /grant execute on function public\.delete_draft_subcontract\(uuid\) to authenticated/i);
});

test("project_lifecycle_preflight includes subcontracts count and blocks deletion", () => {
  // Variable declaration
  assert.match(migration, /v_subcontracts bigint;/i);

  // Counting subcontracts for company and project
  assert.match(
    migration,
    /select count\(\*\) into v_subcontracts\s+from public\.subcontracts sc\s+where sc\.company_id = p_company_id and sc\.project_id = p_project_id;/i,
  );

  // Added to v_total
  assert.match(migration, /\+ v_purchase_orders \+ v_subcontracts;/i);

  // Returned in JSON dependencies
  assert.match(migration, /'subcontracts',\s*v_subcontracts/i);
});
