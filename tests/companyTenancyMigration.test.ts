import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationNames = [
  "20260824090000_company_tenancy_rbac_foundation.sql",
  "20260824091000_company_tenancy_backfill.sql",
  "20260824092000_company_tenancy_integrity.sql",
  "20260824093000_company_tenancy_rls_and_admin_rpcs.sql",
  "20260824094000_company_tenancy_rpc_rewrites.sql",
  "20260824095000_company_tenancy_storage_and_verification.sql",
  "20260824100000_company_tenancy_security_contract.sql",
  "20260824101000_company_tenancy_sql_corrections.sql",
] as const;
const sql = migrationNames.map((name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")).join("\n");
const platformMaintenance = readFileSync(new URL("../supabase/migrations/20260828152000_single_company_platform_maintenance.sql", import.meta.url), "utf8");

const tenantTables = [
  "gmail_connections", "gmail_sync_state", "email_messages", "source_documents", "vendors", "invoices",
  "invoice_line_items", "invoice_extractions", "invoice_review_events", "projects", "invoice_project_allocations",
  "expenses", "workers", "project_worker_assignments", "departments", "worker_compensation_profiles",
  "recurring_payroll_components", "payroll_schedules", "payroll_schedule_versions", "payroll_periods", "work_entries",
  "payroll_runs", "payroll_entries", "payroll_project_allocations", "payroll_adjustments", "project_accounting_events",
  "labor_cost_centers", "payroll_import_batches", "payroll_import_rows", "payroll_import_templates",
];

test("company backfill covers every persisted tenant table and fails closed", () => {
  for (const table of tenantTables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} add column if not exists company_id uuid`));
  }
  assert.match(sql, /alter column company_id set not null/);
  assert.match(sql, /add constraint %I foreign key \(company_id\) references public\.companies\(id\)/);
  assert.match(sql, /Company backfill left % row\(s\) without company_id/);
  assert.match(sql, /Company backfill is ambiguous/);
  assert.match(sql, /Company ownership is immutable/);
});

test("database security contract exposes the exact lead RPC names", () => {
  for (const functionName of [
    "public.has_company_permission", "public.get_my_company_access", "public.bootstrap_platform_admin",
    "public.claim_company_invitations", "public.platform_create_company", "public.platform_update_company",
    "public.platform_invite_company_member", "public.platform_update_company_member",
    "public.platform_list_company_members", "public.platform_list_access_audit", "public.verify_company_tenancy",
  ]) {
    assert.match(sql, new RegExp(`create (?:or replace )?function ${functionName.replaceAll(".", "\\.")}`));
  }
  assert.match(sql, /email_confirmed_at/);
  assert.match(sql, /auth\.uid\(\)/);
});

test("single-company closure removes inherited platform identities without embedding a developer email", () => {
  assert.match(platformMaintenance, /forward-only deployment migration/i);
  assert.match(platformMaintenance, /delete from public\.platform_admins\s*;/i);
  assert.match(platformMaintenance, /delete from public\.platform_admin_allowlist\s*;/i);
  assert.doesNotMatch(platformMaintenance, /@[a-z0-9.-]+\.[a-z]{2,}/i);
  assert.match(platformMaintenance, /explicitly after deployment/i);
});

test("SECURITY DEFINER functions pin search_path and direct writes stay closed", () => {
  for (const match of sql.matchAll(/security definer/gi)) {
    const tail = sql.slice(match.index ?? 0, (match.index ?? 0) + 220);
    assert.match(tail, /set search_path = ''/i, `SECURITY DEFINER near offset ${match.index} must pin search_path`);
  }
  assert.match(sql, /revoke all on table public\.platform_admin_allowlist from anon, authenticated/);
  assert.match(sql, /revoke insert, update, delete on table public\.company_members/);
  assert.match(sql, /revoke execute on function public\.platform_create_company/);
  assert.match(sql, /revoke execute on function private\.write_company_audit/);
});

test("RLS, same-company integrity, and company-path storage are explicit", () => {
  assert.match(sql, /create policy company_access_contract_select on public\.invoices/);
  assert.match(sql, /public\.has_company_permission\(company_id, 'invoices\.read'\)/);
  assert.match(sql, /create policy "company invoice originals insert"/);
  assert.match(sql, /private\.storage_company_id/);
  assert.match(sql, /legacy_storage_company_id/);
  assert.doesNotMatch(sql, /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
  assert.match(sql, /validate_invoice_ownership/);
  assert.match(sql, /validate_payroll_entry_ownership/);
  assert.match(sql, /validate_payroll_import_row_ownership/);
  assert.match(sql, /payroll_schedules_one_active_per_company/);
  assert.match(sql, /on conflict \(company_id, invoice_id, project_id\)/);
});

test("migration is non-destructive and preserves immutable/history checks", () => {
  assert.doesNotMatch(sql, /drop table\s+/i);
  assert.match(sql, /invoice_extractions.*allow_update.*false/s);
  assert.match(sql, /invoice_review_events.*allow_update.*false/s);
  assert.match(sql, /Immutable invoice extraction snapshots and review history cannot be changed/);
  assert.match(sql, /payroll_entries\.finalized_gross_pay/);
  assert.match(sql, /payroll_runs\.finalized_count/);
});
