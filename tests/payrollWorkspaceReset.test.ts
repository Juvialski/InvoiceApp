import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyPayrollWorkspaceReset,
  assertPayrollWorkspaceResetConfirmation,
  PAYROLL_WORKSPACE_RESET_CONFIRMATION,
  PayrollWorkspaceResetConfirmationError,
  payrollWorkspaceResetPreviewFromResult,
} from "../src/lib/payrollMaintenance.ts";
import { PERMISSION_KEYS } from "../src/utils/accessControl.ts";

const MIGRATION = readFileSync(new URL("../supabase/migrations/20260824124000_payroll_workspace_factory_reset.sql", import.meta.url), "utf8");

test("factory reset confirmation is an exact case-sensitive phrase", () => {
  assert.equal(PAYROLL_WORKSPACE_RESET_CONFIRMATION, "RESET PAYROLL WORKSPACE");
  assert.doesNotThrow(() => assertPayrollWorkspaceResetConfirmation("RESET PAYROLL WORKSPACE"));
  for (const wrong of [undefined, "", "reset payroll workspace", "RESET PAYROLL WORKSPACE ", "RESET UNAPPROVED PAYROLL", "RESET PAYROLL WORK"]) {
    assert.throws(() => assertPayrollWorkspaceResetConfirmation(wrong), PayrollWorkspaceResetConfirmationError);
  }
});

test("reset preview parsing keeps per-table counts and derives the total", () => {
  const preview = payrollWorkspaceResetPreviewFromResult({
    referenceDate: "2026-08-25",
    counts: { payroll_periods: 47, payroll_schedules: 1, workers: 0 },
    totalRows: 48,
    eligible: true,
    applied: false,
  });
  assert.equal(preview.referenceDate, "2026-08-25");
  assert.equal(preview.counts.payroll_periods, 47);
  assert.equal(preview.counts.workers, 0);
  assert.equal(preview.totalRows, 48);
  assert.equal(preview.eligible, true);
  assert.equal(payrollWorkspaceResetPreviewFromResult({}).totalRows, 0);
});

test("client reset call refuses to run without the exact confirmation phrase", async () => {
  await assert.rejects(
    () => applyPayrollWorkspaceReset("RESET PAYROLL WORK"),
    PayrollWorkspaceResetConfirmationError,
  );
  await assert.rejects(() => applyPayrollWorkspaceReset(undefined), PayrollWorkspaceResetConfirmationError);
});

test("migration contract: authenticated, permissioned, company-scoped destructive RPC", () => {
  assert.match(MIGRATION, /create or replace function public\.preview_payroll_workspace_reset/);
  assert.match(MIGRATION, /create or replace function public\.apply_payroll_workspace_reset/);
  // Authentication + company context are mandatory.
  assert.match(MIGRATION, /\(select auth\.uid\(\)\) is null/);
  assert.match(MIGRATION, /private\.has_company_permission\(p_company_id, 'payroll\.settings'\)/);
  assert.match(MIGRATION, /private\.has_company_permission\(p_company_id, 'payroll\.manage'\)/);
  // Exact typed confirmation, enforced server-side.
  assert.match(MIGRATION, /p_confirmation is distinct from 'RESET PAYROLL WORKSPACE'/);
  // Every destructive statement is company-scoped; no global deletes exist.
  const deleteStatements = MIGRATION.match(/delete from public\.\w+[^;]*;/g) || [];
  assert.ok(deleteStatements.length >= 19);
  for (const statement of deleteStatements) assert.match(statement, /company_id = p_company_id/, `unscoped delete: ${statement}`);
  assert.doesNotMatch(MIGRATION, /delete from public\.\w+\s*;/);
  // Lifecycle guards suspended for the transaction and restored afterwards.
  for (const trigger of [
    "scheduled_payroll_period_mutation_guard",
    "payroll_periods_workforce_source_guard",
    "payroll_runs_transition_guard",
    "payroll_entries_mutation_guard",
    "payroll_project_allocations_mutation_guard",
    "payroll_adjustments_mutation_guard",
    "work_entries_finalized_source_guard",
    "attendance_records_finalized_source_guard",
    "leave_requests_finalized_source_guard",
    "overtime_requests_finalized_source_guard",
  ]) {
    assert.match(MIGRATION, new RegExp(`disable trigger ${trigger}`));
    assert.match(MIGRATION, new RegExp(`enable trigger ${trigger}`));
  }
  // Audit trail with per-table counts, no personal content.
  assert.match(MIGRATION, /'PAYROLL_WORKSPACE_RESET'/);
  assert.match(MIGRATION, /private\.write_company_audit\(p_company_id, 'PAYROLL_WORKSPACE_RESET'/);
  assert.match(MIGRATION, /'counts', v_counts/);
  // Company-scoped execution lock.
  assert.match(MIGRATION, /from public\.companies c where c\.id = p_company_id for update/);
  // No one-off production identifiers.
  assert.doesNotMatch(MIGRATION, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  // RPC surface only for authenticated callers.
  assert.match(MIGRATION, /revoke execute on function public\.preview_payroll_workspace_reset\(uuid, date\) from public, anon/);
  assert.match(MIGRATION, /revoke execute on function public\.apply_payroll_workspace_reset\(uuid, date, text\) from public, anon/);
  assert.match(MIGRATION, /grant execute on function public\.preview_payroll_workspace_reset\(uuid, date\) to authenticated/);
  assert.match(MIGRATION, /grant execute on function public\.apply_payroll_workspace_reset\(uuid, date, text\) to authenticated/);
  // Preserved domains must never appear in a delete statement.
  for (const preserved of ["invoices", "projects", "expenses", "vendors", "companies", "company_members", "email_messages", "source_documents", "company_ai_settings", "company_ai_credentials"]) {
    assert.doesNotMatch(MIGRATION, new RegExp(`delete from public\\.${preserved}\\b`));
  }
  assert.match(String(PERMISSION_KEYS.payrollSettings), /payroll\.settings/);
});
