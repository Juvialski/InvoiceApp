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
