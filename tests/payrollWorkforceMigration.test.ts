import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260824110000_payroll_workforce_operations.sql", import.meta.url),
  "utf8",
);

test("workforce migration is additive and defines all company-scoped source tables", () => {
  for (const table of ["attendance_records", "leave_requests", "overtime_requests", "payroll_holidays"]) {
    assert.match(migration, new RegExp("create table if not exists public\\." + table));
    assert.match(migration, new RegExp(table + ".*company_id", "s"));
  }
  assert.match(migration, /alter table public\.work_entries[\s\S]*drop not null/);
  assert.match(migration, /labor_context/);
  assert.match(migration, /source_revision/);
  assert.match(migration, /calculated_source_revision/);
  assert.doesNotMatch(migration, /drop table public\.(attendance_records|leave_requests|overtime_requests|payroll_holidays)/);
});

test("workforce migration protects tenancy, RLS, finalized sources, stale approval, and maintenance", () => {
  assert.match(migration, /private\.enforce_company_row_boundary/);
  assert.match(migration, /validate_workforce_record_ownership/);
  assert.match(migration, /public\.has_company_permission\(company_id, ''payroll\.detail\.read''\)/);
  assert.match(migration, /public\.has_company_permission\(company_id, ''payroll\.manage''\)/);
  assert.match(migration, /guard_finalized_payroll_workforce_source/);
  assert.match(migration, /Payroll sources changed after calculation/);
  assert.match(migration, /payroll_period_has_workforce_sources/);
  assert.match(migration, /preview_payroll_maintenance/);
  assert.match(migration, /protectedDataBearingPeriods/);
  assert.doesNotMatch(migration, /realtime\./i);
});

const safetyMigration = readFileSync(
  new URL("../supabase/migrations/20260824120000_payroll_safety_hardening.sql", import.meta.url),
  "utf8",
);
const wave7AuthorityMigration = readFileSync(
  new URL("../supabase/migrations/20260831003455_wave7_engineering_revision_authority.sql", import.meta.url),
  "utf8",
);

test("payroll safety migration enforces leave lifecycle and project source freshness without touching history", () => {
  assert.match(safetyMigration, /validate_leave_request_operation/);
  assert.match(safetyMigration, /LEAVE_OVERLAP|Overlapping active leave/);
  assert.match(safetyMigration, /old\.status = 'PENDING'/);
  assert.match(safetyMigration, /old\.status = 'APPROVED'/);
  assert.match(safetyMigration, /tg_table_name = 'projects'/);
  assert.match(safetyMigration, /old\.status is not distinct from new\.status/);
  assert.match(safetyMigration, /p\.status not in \('APPROVED', 'PAID', 'VOID'\)/);
  assert.doesNotMatch(safetyMigration, /drop table/i);
});

test("Wave 7 protects holidays from finalized payroll-source edits", () => {
  assert.match(wave7AuthorityMigration, /create or replace function public\.guard_finalized_payroll_workforce_source[\s\S]*?security invoker\s+set search_path = ''/i);
  assert.match(wave7AuthorityMigration, /v_new ->> 'holiday_date'/);
  assert.match(wave7AuthorityMigration, /v_old ->> 'holiday_date'/);
  assert.match(wave7AuthorityMigration, /payroll_holidays_finalized_source_guard/);
  assert.match(wave7AuthorityMigration, /before insert or update or delete on public\.payroll_holidays/);
  assert.match(wave7AuthorityMigration, /Finalized payroll sources are immutable/);
  assert.match(wave7AuthorityMigration, /revoke execute on function public\.guard_finalized_payroll_workforce_source\(\) from public, anon, authenticated/);
});
