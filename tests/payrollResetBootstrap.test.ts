import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultPayrollSchedule, ensurePayrollPeriodsAndRuns } from "../src/lib/payrollWorkflow.ts";
import { generatePayrollPeriodsAroundReference, getPayrollScheduleVersions } from "../src/lib/payrollSchedule.ts";

/**
 * Contract for the payroll workspace factory-reset recovery flow: after every
 * payroll/workforce row is deleted for a company, the app recreates exactly
 * one canonical default schedule and its bounded horizon with zero workers.
 */

function cleanWorkspaceAfterReset(referenceDate = "2026-08-25") {
  const schedule = createDefaultPayrollSchedule(referenceDate);
  const first = ensurePayrollPeriodsAndRuns({ schedules: [schedule], periods: [], runs: [], referenceDate, previous: 2, next: 2 });
  return { schedule, first };
}

test("post-reset default schedule matches the canonical standard profile", () => {
  const { schedule } = cleanWorkspaceAfterReset();
  assert.equal(schedule.name, "Standard semi-monthly payroll");
  assert.equal(schedule.frequency, "SEMI_MONTHLY");
  assert.equal(schedule.effectiveFrom, "2026-08-16");
  assert.deepEqual(schedule.payDateRule, { type: "BUSINESS_DAYS", offsetDays: 2 });
  assert.equal(schedule.autoGeneratePeriods, true);
  assert.equal(schedule.autoCreateRuns, true);
  assert.equal(schedule.autoSelectCurrentPeriod, true);
  assert.equal(schedule.automationMode, "ASSISTED");
  const versions = getPayrollScheduleVersions(schedule as never);
  assert.equal(versions.length, 1);
  assert.equal(versions[0]!.effectiveFrom, "2026-08-16");
});

test("post-reset horizon starts at effectiveFrom and lands Aug 16–31 / pay Sep 2", () => {
  const { schedule } = cleanWorkspaceAfterReset();
  const generated = generatePayrollPeriodsAroundReference(schedule as never, "2026-08-25", { previous: 2, next: 2 });
  // effectiveFrom is Aug 16, so no pre-effective August 1–15 period may exist.
  const boundaries = generated.map((period) => [period.periodStart, period.periodEnd]);
  assert.deepEqual(boundaries, [
    ["2026-08-16", "2026-08-31"],
    ["2026-09-01", "2026-09-15"],
    ["2026-09-16", "2026-09-30"],
  ]);
  const current = generated[0]!;
  assert.equal(current.payDate, "2026-09-02", "BUSINESS_DAYS +2 from Aug 31 skips the weekend to Wednesday Sep 2");
});

test("zero-worker workspace gets exactly one draft run and stays stable across reloads", () => {
  const { schedule, first } = cleanWorkspaceAfterReset();
  assert.ok(first.periods.length >= 3);
  assert.equal(first.createdRuns.length, 1);
  const currentId = first.selectedPeriodId!;
  assert.equal(first.runs.filter((run) => run.status === "DRAFT").length, 1);
  assert.equal(first.runs[0]!.periodId, currentId);

  // Simulated Supabase reload feeding the same persisted rows back in.
  const reloaded = ensurePayrollPeriodsAndRuns({
    schedules: [schedule],
    periods: first.periods,
    runs: first.runs,
    referenceDate: "2026-08-25",
    previous: 2,
    next: 2,
  });
  assert.equal(reloaded.createdPeriods.length, 0);
  assert.equal(reloaded.createdRuns.length, 0);
  assert.deepEqual(reloaded.periods.map((period) => period.id).sort(), first.periods.map((period) => period.id).sort());
  assert.deepEqual(reloaded.runs.map((run) => run.id), first.runs.map((run) => run.id));
  assert.equal(reloaded.selectedPeriodId, first.selectedPeriodId);

  // A third pass (second hard refresh) is still stable.
  const again = ensurePayrollPeriodsAndRuns({
    schedules: [schedule],
    periods: reloaded.periods,
    runs: reloaded.runs,
    referenceDate: "2026-08-25",
    previous: 2,
    next: 2,
  });
  assert.equal(again.createdPeriods.length + again.createdRuns.length, 0);
  assert.equal(again.runs.length, 1);
});
