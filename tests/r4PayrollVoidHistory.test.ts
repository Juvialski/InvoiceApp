import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ensurePayrollPeriodsAndRuns, createDefaultPayrollSchedule } from "../src/lib/payrollWorkflow.ts";
import type { PayrollPeriod } from "../src/types.ts";

const overview = readFileSync(new URL("../src/components/payroll/PayrollPeriodsOverview.tsx", import.meta.url), "utf8");
const periods = readFileSync(new URL("../src/components/payroll/PayrollPeriods.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260906041647_r4_fx_tax_and_payroll_safety.sql", import.meta.url), "utf8");

test("repeated payroll preparation remains idempotent while VOID history is preserved", () => {
  const schedule = createDefaultPayrollSchedule("2026-09-01");
  const first = ensurePayrollPeriodsAndRuns({ schedules: [schedule], periods: [], runs: [], entries: [], workEntries: [], referenceDate: "2026-09-06", previous: 2, next: 2 });
  const voided: PayrollPeriod = { ...first.periods[0]!, status: "VOID", notes: "Audited historical attempt" };
  const second = ensurePayrollPeriodsAndRuns({ schedules: [schedule], periods: [voided, ...first.periods.slice(1)], runs: [], entries: [], workEntries: [], referenceDate: "2026-09-06", previous: 2, next: 2 });
  assert.ok(second.periods.some((period) => period.id === voided.id && period.status === "VOID"));
  assert.equal(second.periods.filter((period) => period.status !== "VOID" && period.periodStart === voided.periodStart && period.periodEnd === voided.periodEnd).length, 0);
});

test("payroll history defaults to active periods and exposes VOID rows only through an explicit control", () => {
  assert.match(overview, /Include voided/);
  assert.match(overview, /No active payroll periods yet/);
  assert.match(overview, /Voided history/);
  assert.match(periods, /const activePeriods/);
  assert.match(periods, /Include voided/);
  assert.match(migration, /prevent_duplicate_active_payroll_period_boundary/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /p\.status <> 'VOID'/);
});
