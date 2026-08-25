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

test("bootstraps and generates a zero-worker semi-monthly horizon idempotently", () => {
  const schedule = createDefaultPayrollSchedule("2026-08-25");
  assert.equal(schedule.effectiveFrom, "2026-08-16");
  const first = ensurePayrollPeriodsAndRuns({
    schedules: [schedule],
    periods: [],
    runs: [],
    referenceDate: "2026-08-25",
    previous: 2,
    next: 2,
  });
  const current = first.periods.find((period) => period.periodStart === "2026-08-16");

  // Period generation is schedule-driven, not worker-driven.
  assert.ok(first.periods.length > 0);
  assert.equal(first.periods.length, 3, "the effectiveFrom boundary limits the previous side of the horizon");
  assert.equal(current?.periodEnd, "2026-08-31");
  assert.equal(current?.payDate, "2026-09-02");
  assert.equal(first.selectedPeriodId, current?.id);
  assert.equal(first.createdRuns.length, 1);
  assert.equal(first.runs.filter((run) => run.status === "DRAFT").length, 1);
  assert.equal(first.runs[0]?.periodId, current?.id);

  const second = ensurePayrollPeriodsAndRuns({
    schedules: [schedule],
    periods: first.periods,
    runs: first.runs,
    referenceDate: "2026-08-25",
    previous: 2,
    next: 2,
  });
  assert.equal(second.createdPeriods.length, 0);
  assert.equal(second.createdRuns.length, 0);
  assert.deepEqual(second.periods.map((period) => period.id), first.periods.map((period) => period.id));
  assert.deepEqual(second.runs.map((run) => run.id), first.runs.map((run) => run.id));
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

test("keeps data-bearing prospective history when a schedule version changes", () => {
  const v1 = {
    ...createDefaultPayrollSchedule("2026-01-01").versions![0]!,
    id: "schedule-1-v1",
    scheduleId: "schedule-1",
    frequency: "MONTHLY" as const,
    effectiveFrom: "2026-01-01",
    payDateRule: { type: "SAME_PERIOD_END" as const },
  };
  const v2 = {
    ...v1,
    id: "schedule-1-v2",
    version: 2,
    frequency: "SEMI_MONTHLY" as const,
    effectiveFrom: "2026-09-01",
    payDateRule: { type: "BUSINESS_DAYS" as const, offsetDays: 2 },
  };
  const schedule = {
    ...createDefaultPayrollSchedule("2026-01-01"),
    id: "schedule-1",
    frequency: "MONTHLY" as const,
    versions: [v1, v2],
  };
  const historical = {
    id: "period-history",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    scheduleId: "schedule-1",
    scheduleVersionId: v1.id,
    autoGenerated: true,
    status: "OPEN" as const,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
  const result = ensurePayrollPeriodsAndRuns({
    schedules: [schedule],
    periods: [historical],
    runs: [],
    workEntries: [{ id: "work-1", workerId: "worker-1", periodId: historical.id, workDate: "2026-09-10", regularHours: 8, overtimeHours: 0, daysWorked: 1, rate: 100, status: "DRAFT" }],
    referenceDate: "2026-09-10",
    previous: 1,
    next: 1,
  });
  assert.equal(result.periods.find((period) => period.id === historical.id)?.periodEnd, "2026-09-30");
  assert.equal(result.periods.some((period) => period.id === historical.id), true);
});
