import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultPayrollSchedule, ensurePayrollPeriodsAndRuns } from "../src/lib/payrollWorkflow.ts";

test("ensures a bounded semi-monthly period horizon and opens only the current draft run", () => {
  const schedule = createDefaultPayrollSchedule("2026-08-01");
  const first = ensurePayrollPeriodsAndRuns({ schedules: [schedule], periods: [], runs: [], referenceDate: "2026-08-20", previous: 2, next: 2 });
  assert.equal(first.createdRuns.length, 1);
  assert.equal(first.runs[0]?.periodId, first.periods.find((period) => period.periodStart === "2026-08-16")?.id);
  assert.equal(first.periods.some((period) => period.periodStart === "2026-08-16" && period.periodEnd === "2026-08-31"), true);
  assert.ok(first.periods.length <= 5);
  assert.equal(first.runs.some((run) => run.periodId === first.periods.find((period) => period.periodStart > "2026-08-20")?.id), false);
  const second = ensurePayrollPeriodsAndRuns({ schedules: [schedule], periods: first.periods, runs: first.runs, referenceDate: "2026-08-20", previous: 2, next: 2 });
  assert.equal(second.createdRuns.length, 0);
  assert.equal(second.createdPeriods.length, 0);
  assert.equal(second.runs.length, first.runs.length);
});

test("preserves an existing future run and approved current run", () => {
  const schedule = createDefaultPayrollSchedule("2026-08-01");
  const first = ensurePayrollPeriodsAndRuns({ schedules: [schedule], periods: [], runs: [], referenceDate: "2026-08-20", previous: 1, next: 2 });
  const currentRun = first.runs[0]!;
  const futurePeriod = first.periods.find((period) => period.periodStart > "2026-08-20")!;
  const futureRun = { id: "future-run", periodId: futurePeriod.id, status: "DRAFT" as const, createdAt: "2026-08-20T00:00:00.000Z" };
  const result = ensurePayrollPeriodsAndRuns({
    schedules: [schedule],
    periods: first.periods,
    runs: [{ ...currentRun, status: "APPROVED" }, futureRun],
    referenceDate: "2026-08-20",
    previous: 1,
    next: 2,
  });
  assert.equal(result.runs.find((run) => run.id === currentRun.id)?.status, "APPROVED");
  assert.equal(result.runs.find((run) => run.id === futureRun.id)?.status, "DRAFT");
  assert.equal(result.createdRuns.length, 0);
});

test("does not replace an approved period when a schedule is edited", () => {
  const schedule = createDefaultPayrollSchedule("2026-08-01");
  const first = ensurePayrollPeriodsAndRuns({ schedules: [schedule], periods: [], runs: [], referenceDate: "2026-08-20", previous: 1, next: 1 });
  const locked = first.periods.find((period) => period.periodStart === "2026-08-16")!;
  const edited = { ...schedule, frequency: "MONTHLY" as const, autoCreateRuns: true };
  const result = ensurePayrollPeriodsAndRuns({ schedules: [edited], periods: [{ ...locked, status: "PAID", lockedAt: "2026-09-01T00:00:00.000Z" }], runs: first.runs, referenceDate: "2026-08-20", previous: 1, next: 1 });
  assert.equal(result.periods.find((period) => period.id === locked.id)?.status, "PAID");
  assert.equal(result.periods.find((period) => period.id === locked.id)?.periodStart, locked.periodStart);
});
