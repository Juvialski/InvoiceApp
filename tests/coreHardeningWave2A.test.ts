import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260829024150_core_hardening_wave2a_workforce_corrections.sql", import.meta.url),
  "utf8",
);

test("Wave 2A migration is forward-only and adds the worker context/source correction fields", () => {
  assert.match(migration, /alter table public\.workers[\s\S]*add column if not exists default_labor_context/);
  assert.match(migration, /add column if not exists default_project_id uuid/);
  for (const table of ["work_entries", "attendance_records", "leave_requests", "overtime_requests"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table}[\\s\\S]*add column if not exists`));
  }
  assert.doesNotMatch(migration, /drop table|drop schema|drop migration/i);
  assert.match(migration, /workers_default_project_id_fkey/);
  assert.match(migration, /workers_default_labor_context_check/);
});

test("Wave 2A exposes guarded company-scoped lifecycle RPCs and closes direct deletes", () => {
  for (const functionName of [
    "preview_worker_lifecycle",
    "apply_worker_lifecycle",
    "apply_project_worker_assignment_lifecycle",
    "save_worker_compensation_profile",
    "apply_compensation_profile_lifecycle",
    "apply_recurring_component_lifecycle",
    "apply_workforce_source_lifecycle",
  ]) {
    assert.match(migration, new RegExp(`function public\\.${functionName}`));
  }
  assert.match(migration, /private\.require_workforce_permission/);
  assert.match(migration, /private\.deployment_company_id\(\)/);
  assert.match(migration, /private\.has_company_permission/);
  assert.match(migration, /grant execute on function public\.apply_worker_lifecycle/);
  assert.match(migration, /revoke delete on table public\.%I from anon, authenticated/);
  assert.match(migration, /WORKER_DELETED_UNUSED/);
  assert.match(migration, /This employee has historical workforce or payroll records and cannot be permanently deleted/);
});

test("Wave 2A protects consumed history, archived projects, labor contexts, and audit coverage", () => {
  assert.match(migration, /Historically consumed compensation profiles cannot be deleted/);
  assert.match(migration, /Historically consumed payroll components cannot be deleted/);
  assert.match(migration, /Used project assignments cannot be rewritten/);
  assert.match(migration, /Archived projects cannot receive new worker assignments/);
  assert.match(migration, /Only draft work entries without downstream use may be deleted/);
  assert.match(migration, /Only draft attendance may be deleted/);
  assert.match(migration, /Only draft leave requests may be deleted/);
  assert.match(migration, /Only draft overtime requests may be deleted/);
  assert.match(migration, /default_labor_context <> 'PROJECT' and new\.default_project_id is not null/);
  for (const event of [
    "WORKER_OFFBOARDED", "WORKER_REACTIVATED", "PROJECT_ASSIGNMENT_ENDED",
    "COMPENSATION_PROFILE_SUPERSEDED", "COMPENSATION_PROFILE_DELETED_UNUSED", "PAYROLL_COMPONENT_DEACTIVATED", "PAYROLL_COMPONENT_DELETED_UNUSED",
    "WORK_ENTRY_VOIDED", "ATTENDANCE_VOIDED", "LEAVE_CANCELLED", "OVERTIME_CANCELLED",
  ]) assert.match(migration, new RegExp(`'${event}'`));
});

test("Wave 2A SECURITY DEFINER functions pin an empty search path", () => {
  const functionBlocks = [
    "preview_worker_lifecycle",
    "apply_worker_lifecycle",
    "apply_project_worker_assignment_lifecycle",
    "save_worker_compensation_profile",
    "apply_compensation_profile_lifecycle",
    "apply_recurring_component_lifecycle",
    "apply_workforce_source_lifecycle",
  ];
  for (const functionName of functionBlocks) {
    const block = migration.match(new RegExp(`create or replace function public\\.${functionName}[\\s\\S]*?\\$\\$;`))?.[0] || "";
    assert.match(block, /security definer/);
    assert.match(block, /set search_path = ''/);
  }
});
