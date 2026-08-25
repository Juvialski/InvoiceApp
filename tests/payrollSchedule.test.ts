import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePayrollPayDate,
  findFirstGeneratablePayrollPeriod,
  generatePayrollPeriod,
  generatePayrollPeriodsAroundReference,
  mergeGeneratedPayrollPeriods,
  resolvePayrollScheduleVersion,
  selectCurrentPayrollPeriod,
  validatePayrollSchedule,
  type PayrollSchedule,
  type PayrollScheduleVersion,
} from "../src/lib/payrollSchedule.ts";
import { ensurePayrollPeriodsAndRuns } from "../src/lib/payrollWorkflow.ts";
import type { PayrollEntry, PayrollPeriod, PayrollRun } from "../src/types.ts";

function schedule(overrides: Partial<PayrollSchedule> = {}): PayrollSchedule {
  return {
    id: "schedule-1",
    effectiveFrom: "2026-01-01",
    frequency: "MONTHLY",
    payDateRule: { type: "SAME_PERIOD_END" },
    autoGeneratePeriods: true,
    autoCalculate: false,
    active: true,
    ...overrides,
  };
}

function version(overrides: Partial<PayrollScheduleVersion> = {}): PayrollScheduleVersion {
  return {
    id: "schedule-1-v1",
    scheduleId: "schedule-1",
    version: 1,
    effectiveFrom: "2026-01-01",
    frequency: "MONTHLY",
    payDateRule: { type: "SAME_PERIOD_END" },
    autoGeneratePeriods: true,
    autoCalculate: false,
    active: true,
    ...overrides,
  };
}

/** Mirrors the user-reported broken state: weekly schedule saved mid-cycle. */
function weeklyUserSchedule(overrides: Partial<PayrollSchedule> = {}): PayrollSchedule {
  return {
    id: "schedule-1",
    name: "Weekly payroll",
    effectiveFrom: "2026-08-25",
    frequency: "WEEKLY",
    weekEndDay: 0,
    payDateRule: { type: "BUSINESS_DAYS", offsetDays: 0 },
    autoGeneratePeriods: true,
    autoCalculate: false,
    autoCreateRuns: true,
    autoSelectCurrentPeriod: true,
    automationMode: "AUTOMATED",
    active: true,
    ...overrides,
  };
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function daysInclusive(start: string, end: string): number {
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  return ((Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / 86_400_000) + 1;
}

test("generates daily and anchored weekly periods around a reference date", () => {
  const daily = generatePayrollPeriodsAroundReference(schedule({ frequency: "DAILY" }), "2026-08-12");
  assert.deepEqual(daily.map((period) => [period.periodStart, period.periodEnd]), [
    ["2026-08-11", "2026-08-11"], ["2026-08-12", "2026-08-12"], ["2026-08-13", "2026-08-13"],
  ]);

  const weekly = generatePayrollPeriodsAroundReference(version({ frequency: "WEEKLY", anchorPeriodEnd: "2026-08-09", weekEndDay: 0 }), "2026-08-12");
  assert.deepEqual(weekly.map((period) => [period.periodStart, period.periodEnd]), [
    ["2026-08-03", "2026-08-09"], ["2026-08-10", "2026-08-16"], ["2026-08-17", "2026-08-23"],
  ]);
});

test("generates anchored biweekly periods without local-time drift", () => {
  const period = generatePayrollPeriod(version({ frequency: "BIWEEKLY", anchorPeriodEnd: "2026-08-01" }), "2026-08-15");
  assert.deepEqual(period && [period.periodStart, period.periodEnd], ["2026-08-02", "2026-08-15"]);
});

test("handles semi-monthly February leap years and short months", () => {
  const leap = generatePayrollPeriod(version({ frequency: "SEMI_MONTHLY" }), "2028-02-29");
  const february = generatePayrollPeriod(version({ frequency: "SEMI_MONTHLY" }), "2027-02-28");
  const april = generatePayrollPeriod(version({ frequency: "SEMI_MONTHLY" }), "2027-04-30");
  assert.deepEqual(leap && [leap.periodStart, leap.periodEnd], ["2028-02-16", "2028-02-29"]);
  assert.deepEqual(february && [february.periodStart, february.periodEnd], ["2027-02-16", "2027-02-28"]);
  assert.deepEqual(april && [april.periodStart, april.periodEnd], ["2027-04-16", "2027-04-30"]);
});

test("generates the 2026-08-25 semi-monthly period with its business-day pay date", () => {
  const period = generatePayrollPeriod(version({
    frequency: "SEMI_MONTHLY",
    payDateRule: { type: "BUSINESS_DAYS", offsetDays: 2 },
  }), "2026-08-25");
  assert.deepEqual(period && [period.periodStart, period.periodEnd, period.payDate], ["2026-08-16", "2026-08-31", "2026-09-02"]);
});

test("generates monthly and practical custom cutoff periods", () => {
  const monthly = generatePayrollPeriod(version({ frequency: "MONTHLY" }), "2027-04-30");
  const customBeforeCutoff = generatePayrollPeriod(version({ frequency: "CUSTOM", customCutoffDay: 20 }), "2027-08-10");
  const customAfterCutoff = generatePayrollPeriod(version({ frequency: "CUSTOM", customCutoffDay: 20 }), "2027-08-25");
  assert.deepEqual(monthly && [monthly.periodStart, monthly.periodEnd], ["2027-04-01", "2027-04-30"]);
  assert.deepEqual(customBeforeCutoff && [customBeforeCutoff.periodStart, customBeforeCutoff.periodEnd], ["2027-07-21", "2027-08-20"]);
  assert.deepEqual(customAfterCutoff && [customAfterCutoff.periodStart, customAfterCutoff.periodEnd], ["2027-08-21", "2027-09-20"]);
});

test("supports all requested pay-date rules and clamps following-month dates", () => {
  assert.equal(calculatePayrollPayDate("2027-01-31", { type: "SAME_PERIOD_END" }), "2027-01-31");
  assert.equal(calculatePayrollPayDate("2027-01-31", { type: "CALENDAR_DAYS", offsetDays: 3 }), "2027-02-03");
  assert.equal(calculatePayrollPayDate("2027-01-29", { type: "BUSINESS_DAYS", offsetDays: 1 }), "2027-02-01");
  assert.equal(calculatePayrollPayDate("2027-01-29", { type: "BUSINESS_DAYS", offsetDays: 2 }), "2027-02-02");
  assert.equal(calculatePayrollPayDate("2027-01-31", { type: "FIXED_FOLLOWING_MONTH", dayOfMonth: 31 }), "2027-02-28");
  assert.equal(calculatePayrollPayDate("2027-01-31", { type: "MANUAL" }), undefined);
});

test("validates invalid configurations and provides bounded previous/current/next periods", () => {
  const invalid = validatePayrollSchedule(schedule({ frequency: "BIWEEKLY" }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.issues.join(" "), /anchorPeriodEnd/);

  const periods = generatePayrollPeriodsAroundReference(schedule({ frequency: "MONTHLY" }), "2027-05-15", { previous: 1, next: 1 });
  assert.equal(periods.length, 3);
  assert.deepEqual(periods.map((period) => period.periodStart), ["2027-04-01", "2027-05-01", "2027-06-01"]);
});

test("schedule versions are prospective and locked history is never rewritten", () => {
  const v1 = version({ id: "schedule-1-v1", version: 1, frequency: "MONTHLY", effectiveFrom: "2026-01-01", payDateRule: { type: "SAME_PERIOD_END" } });
  const v2 = version({ id: "schedule-1-v2", version: 2, frequency: "SEMI_MONTHLY", effectiveFrom: "2026-09-01", payDateRule: { type: "CALENDAR_DAYS", offsetDays: 2 } });
  const configured = schedule({ versions: [v1, v2], frequency: "MONTHLY" });
  assert.equal(resolvePayrollScheduleVersion(configured, "2026-08-31").id, "schedule-1-v1");
  assert.equal(resolvePayrollScheduleVersion(configured, "2026-09-10").id, "schedule-1-v2");

  const locked = {
    ...generatePayrollPeriod(v1, "2026-08-15")!,
    id: "locked-period",
    status: "PAID",
    locked: true,
  };
  const prospective = { ...locked, scheduleVersionId: v2.id, periodKey: `schedule-1:${v2.id}:${locked.periodStart}:${locked.periodEnd}`, status: "DRAFT" as const };
  const merged = mergeGeneratedPayrollPeriods([locked], [prospective]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.id, "locked-period");
  assert.equal(merged[0]?.scheduleVersionId, "schedule-1-v1");
});

test("a version effective mid-period never generates a pre-effective period", () => {
  const effectiveVersion = version({
    id: "schedule-1-v2",
    version: 2,
    effectiveFrom: "2026-08-25",
    frequency: "SEMI_MONTHLY",
  });
  assert.equal(generatePayrollPeriod(effectiveVersion, "2026-08-24"), undefined);
  assert.equal(generatePayrollPeriod(effectiveVersion, "2026-08-25"), undefined);
  assert.deepEqual(generatePayrollPeriod(effectiveVersion, "2026-09-01") && [
    generatePayrollPeriod(effectiveVersion, "2026-09-01")?.periodStart,
    generatePayrollPeriod(effectiveVersion, "2026-09-01")?.periodEnd,
  ], ["2026-09-01", "2026-09-15"]);
});

test("period merge is idempotent and current selection prioritizes active current", () => {
  const generated = generatePayrollPeriodsAroundReference(schedule({ frequency: "MONTHLY" }), "2027-05-15");
  const once = mergeGeneratedPayrollPeriods([], generated);
  const twice = mergeGeneratedPayrollPeriods(once, generated);
  assert.deepEqual(twice, once);

  const selected = selectCurrentPayrollPeriod([
    { ...once[0]!, status: "OPEN" },
    { ...once[1]!, status: "DRAFT" },
    { ...once[2]!, status: "DRAFT" },
  ], "2027-05-15");
  assert.equal(selected?.periodStart, "2027-05-01");
});

test("a weekly schedule saved mid-cycle continues from the first complete period instead of an empty horizon", () => {
  const horizon = generatePayrollPeriodsAroundReference(weeklyUserSchedule(), "2026-08-25", { previous: 2, next: 2 });
  assert.equal(horizon.length, 3, "the horizon must not collapse to empty when effectiveFrom falls mid-cycle");
  assert.deepEqual(horizon.map((period) => [period.periodStart, period.periodEnd]), [
    ["2026-08-31", "2026-09-06"],
    ["2026-09-07", "2026-09-13"],
    ["2026-09-14", "2026-09-20"],
  ]);
  for (const period of horizon) {
    assert.notEqual(period.periodStart, "2026-08-25", "no clipped period may start on the mid-cycle effectiveFrom date");
    assert.equal(period.periodStart >= period.periodEnd, false);
  }
});

test("no clipped transitional period is emitted inside the rejected cycle", () => {
  const horizon = generatePayrollPeriodsAroundReference(weeklyUserSchedule(), "2026-08-25", { previous: 2, next: 2 });
  assert.equal(horizon.some((period) => period.periodStart === "2026-08-25"), false);
  assert.equal(horizon.some((period) => period.periodStart === "2026-08-24" && period.periodEnd === "2026-08-30"), false);
  assert.equal(horizon.some((period) => period.periodStart < "2026-08-31"), false);
});

test("a mid-cycle effectiveFrom one day later still yields the same first complete week", () => {
  const shifted = weeklyUserSchedule({ effectiveFrom: "2026-08-26" });
  const horizon = generatePayrollPeriodsAroundReference(shifted, "2026-08-25", { previous: 2, next: 2 });
  assert.equal(horizon.length, 3);
  assert.deepEqual(horizon[0] && [horizon[0].periodStart, horizon[0].periodEnd], ["2026-08-31", "2026-09-06"]);
  const found = findFirstGeneratablePayrollPeriod(shifted, "2026-08-25");
  assert.deepEqual(found && [found.periodStart, found.periodEnd], ["2026-08-31", "2026-09-06"]);
});

test("generated periods carry the legacy schedule-level version identity", () => {
  const horizon = generatePayrollPeriodsAroundReference(weeklyUserSchedule(), "2026-08-25", { previous: 2, next: 2 });
  for (const period of horizon) {
    assert.equal(period.scheduleId, "schedule-1");
    assert.equal(period.scheduleVersionId, "schedule-1:v1", "legacy schedule-level config maps to ${scheduleId}:v1");
    assert.equal(period.status, "DRAFT");
    assert.equal(period.active, true);
    assert.match(period.periodKey, /^schedule-1:schedule-1:v1:/);
  }
});

test("findFirstGeneratablePayrollPeriod returns the first complete week directly for both mid-cycle variants", () => {
  for (const effectiveFrom of ["2026-08-25", "2026-08-26"] as const) {
    const found = findFirstGeneratablePayrollPeriod(weeklyUserSchedule({ effectiveFrom }), "2026-08-25");
    assert.ok(found, `expected a first generatable period for effectiveFrom ${effectiveFrom}`);
    assert.equal(found!.periodStart, "2026-08-31");
    assert.equal(found!.periodEnd, "2026-09-06");
    assert.equal(found!.scheduleVersionId, "schedule-1:v1");
  }
});

test("weekly Friday-ending schedules skip the partial cycle and align to Friday ends", () => {
  const friday = weeklyUserSchedule({ weekEndDay: 5 });
  const horizon = generatePayrollPeriodsAroundReference(friday, "2026-08-25", { previous: 2, next: 3 });
  assert.ok(horizon.length >= 3);
  assert.deepEqual(horizon[0] && [horizon[0].periodStart, horizon[0].periodEnd], ["2026-08-29", "2026-09-04"], "the first complete cycle must end on the Friday after the mid-cycle effectiveFrom");
  for (const period of horizon) {
    assert.equal(daysInclusive(period.periodStart, period.periodEnd), 7);
    assert.equal(weekdayOf(period.periodEnd), 5);
  }
});

test("an effectiveFrom exactly on a valid period start generates the complete current week without skipping", () => {
  // 2026-08-24 is a Monday and a Sunday-ending weekly boundary.
  const aligned = weeklyUserSchedule({ effectiveFrom: "2026-08-24" });
  const horizon = generatePayrollPeriodsAroundReference(aligned, "2026-08-25", { previous: 2, next: 2 });
  assert.deepEqual(horizon.map((period) => [period.periodStart, period.periodEnd]), [
    ["2026-08-24", "2026-08-30"],
    ["2026-08-31", "2026-09-06"],
    ["2026-09-07", "2026-09-13"],
  ]);
  const found = findFirstGeneratablePayrollPeriod(aligned, "2026-08-25");
  assert.deepEqual(found && [found.periodStart, found.periodEnd], ["2026-08-24", "2026-08-30"]);
});

test("semi-monthly schedules saved mid-cycle never emit the clipped half-month", () => {
  const semiMonthly = weeklyUserSchedule({ frequency: "SEMI_MONTHLY", weekEndDay: undefined });
  const horizon = generatePayrollPeriodsAroundReference(semiMonthly, "2026-08-25", { previous: 2, next: 2 });
  assert.deepEqual(horizon.map((period) => [period.periodStart, period.periodEnd]), [
    ["2026-09-01", "2026-09-15"],
    ["2026-09-16", "2026-09-30"],
    ["2026-10-01", "2026-10-15"],
  ]);
  assert.equal(horizon.some((period) => period.periodStart === "2026-08-16" && period.periodEnd === "2026-08-31"), false);
});

test("monthly schedules saved mid-cycle never emit a partial August", () => {
  const monthly = weeklyUserSchedule({ frequency: "MONTHLY", weekEndDay: undefined });
  const horizon = generatePayrollPeriodsAroundReference(monthly, "2026-08-25", { previous: 2, next: 2 });
  assert.deepEqual(horizon.map((period) => [period.periodStart, period.periodEnd]), [
    ["2026-09-01", "2026-09-30"],
    ["2026-10-01", "2026-10-31"],
    ["2026-11-01", "2026-11-30"],
  ]);
  assert.equal(horizon.some((period) => period.periodEnd === "2026-08-31"), false, "no partial August period may be generated");
});

test("biweekly anchored schedules skip the incomplete anchored cycle and stay on the anchor weekday", () => {
  const biweekly = weeklyUserSchedule({
    frequency: "BIWEEKLY",
    anchorPeriodEnd: "2026-08-16",
    effectiveFrom: "2026-08-20",
    weekEndDay: undefined,
  });
  const horizon = generatePayrollPeriodsAroundReference(biweekly, "2026-08-25", { previous: 2, next: 2 });
  assert.deepEqual(horizon.map((period) => [period.periodStart, period.periodEnd]), [
    ["2026-08-31", "2026-09-13"],
    ["2026-09-14", "2026-09-27"],
    ["2026-09-28", "2026-10-11"],
  ]);
  assert.equal(horizon.some((period) => period.periodEnd === "2026-08-30"), false, "the anchored cycle containing the mid-cycle effectiveFrom is incomplete and must be skipped");

  const found = findFirstGeneratablePayrollPeriod(biweekly, "2026-08-25")!;
  assert.deepEqual([found.periodStart, found.periodEnd], ["2026-08-31", "2026-09-13"]);

  for (let index = 0; index < horizon.length; index += 1) {
    const period = horizon[index]!;
    assert.equal(weekdayOf(period.periodEnd), weekdayOf("2026-08-16"), "every anchored cycle ends on the anchor weekday");
    if (index > 0) assert.equal(daysInclusive(horizon[index - 1]!.periodEnd, period.periodEnd), 15, "consecutive biweekly cycles are exactly 14 days apart");
  }
});

test("length-based custom schedules skip the partial cycle and keep complete fixed-length cycles", () => {
  const customLength = weeklyUserSchedule({
    frequency: "CUSTOM",
    customPeriodLengthDays: 10,
    anchorPeriodEnd: "2026-08-16",
    effectiveFrom: "2026-08-20",
    weekEndDay: undefined,
  });
  const horizon = generatePayrollPeriodsAroundReference(customLength, "2026-08-25", { previous: 2, next: 2 });
  assert.deepEqual(horizon.map((period) => [period.periodStart, period.periodEnd]), [
    ["2026-08-27", "2026-09-05"],
    ["2026-09-06", "2026-09-15"],
    ["2026-09-16", "2026-09-25"],
  ]);
  for (const period of horizon) assert.equal(daysInclusive(period.periodStart, period.periodEnd), 10);

  const customCutoff = weeklyUserSchedule({ frequency: "CUSTOM", customCutoffDay: 20, weekEndDay: undefined });
  const cutoffHorizon = generatePayrollPeriodsAroundReference(customCutoff, "2026-08-25", { previous: 2, next: 2 });
  assert.deepEqual(cutoffHorizon.map((period) => [period.periodStart, period.periodEnd]), [
    ["2026-09-21", "2026-10-20"],
    ["2026-10-21", "2026-11-20"],
    ["2026-11-21", "2026-12-20"],
  ]);
  assert.equal(cutoffHorizon.some((period) => period.periodStart === "2026-08-21"), false, "the cutoff cycle already in progress must not be emitted as a partial");
});

test("daily schedules generate single-day periods from the effectiveFrom onward", () => {
  const sameDay = weeklyUserSchedule({ frequency: "DAILY", weekEndDay: undefined });
  const horizon = generatePayrollPeriodsAroundReference(sameDay, "2026-08-25", { previous: 2, next: 2 });
  assert.deepEqual(horizon.map((period) => [period.periodStart, period.periodEnd]), [
    ["2026-08-25", "2026-08-25"],
    ["2026-08-26", "2026-08-26"],
    ["2026-08-27", "2026-08-27"],
  ]);

  const future = weeklyUserSchedule({ frequency: "DAILY", effectiveFrom: "2026-09-01", weekEndDay: undefined });
  const futureHorizon = generatePayrollPeriodsAroundReference(future, "2026-08-25", { previous: 2, next: 2 });
  assert.deepEqual(futureHorizon.map((period) => [period.periodStart, period.periodEnd]), [
    ["2026-09-01", "2026-09-01"],
    ["2026-09-02", "2026-09-02"],
    ["2026-09-03", "2026-09-03"],
  ]);
  assert.equal(futureHorizon.some((period) => period.periodStart < "2026-09-01"), false, "nothing may be generated before a future effectiveFrom");
});

test("version effectiveTo bounds the horizon and stops the forward search", () => {
  const boundedVersion = version({
    id: "schedule-1-v1",
    version: 1,
    effectiveFrom: "2026-08-25",
    effectiveTo: "2026-09-30",
    frequency: "WEEKLY",
    weekEndDay: 0,
    payDateRule: { type: "BUSINESS_DAYS", offsetDays: 0 },
  });
  const boundedSchedule = weeklyUserSchedule({ versions: [boundedVersion] });

  assert.deepEqual(generatePayrollPeriodsAroundReference(boundedSchedule, "2026-08-25", { previous: 2, next: 4 }).map((period) => [period.periodStart, period.periodEnd]), [
    ["2026-08-31", "2026-09-06"],
    ["2026-09-07", "2026-09-13"],
    ["2026-09-14", "2026-09-20"],
    ["2026-09-21", "2026-09-27"],
  ], "the horizon stops at the last complete cycle inside effectiveTo");
  assert.deepEqual(generatePayrollPeriodsAroundReference(boundedVersion, "2026-08-25", { previous: 2, next: 4 }).map((period) => [period.periodStart, period.periodEnd]), [
    ["2026-08-31", "2026-09-06"],
    ["2026-09-07", "2026-09-13"],
    ["2026-09-14", "2026-09-20"],
    ["2026-09-21", "2026-09-27"],
  ]);

  assert.equal(findFirstGeneratablePayrollPeriod(boundedSchedule, "2026-10-05"), undefined, "past effectiveTo with no other versions there is nothing left to generate");
});

test("previous chains never reach before a mid-cycle effectiveFrom", () => {
  const horizon = generatePayrollPeriodsAroundReference(weeklyUserSchedule(), "2026-08-25", { previous: 2, next: 2 });
  for (const period of horizon) {
    assert.ok(period.periodStart >= "2026-08-25", `no emitted period may start before the schedule effectiveFrom, got ${period.periodStart}`);
  }
});

test("forward search crosses a closed version boundary into the next schedule version", () => {
  const closedVersion: PayrollScheduleVersion = {
    ...version({ id: "schedule-1-v1", version: 1, effectiveFrom: "2026-08-25", frequency: "WEEKLY", weekEndDay: 0 }),
    effectiveTo: "2026-08-30",
  };
  const openVersion = version({ id: "schedule-1-v2", version: 2, effectiveFrom: "2026-08-31", frequency: "WEEKLY", weekEndDay: 0 });
  const chained = weeklyUserSchedule({ versions: [closedVersion, openVersion] });

  const horizon = generatePayrollPeriodsAroundReference(chained, "2026-08-25", { previous: 2, next: 2 });
  assert.equal(horizon.length, 3, "crossing a closed version must continue with the next version, not collapse to empty");
  assert.deepEqual(horizon.map((period) => [period.periodStart, period.periodEnd]), [
    ["2026-08-31", "2026-09-06"],
    ["2026-09-07", "2026-09-13"],
    ["2026-09-14", "2026-09-20"],
  ]);
  for (const period of horizon) {
    assert.equal(period.scheduleVersionId, "schedule-1-v2", "periods after the closed boundary must reference the applicable version");
  }

  const first = findFirstGeneratablePayrollPeriod(chained, "2026-08-25");
  assert.equal(first?.scheduleVersionId, "schedule-1-v2");
  assert.deepEqual(first && [first.periodStart, first.periodEnd], ["2026-08-31", "2026-09-06"]);
});

test("boundary-equal version re-link preserves period identity so runs stay linked", () => {
  const closedVersion: PayrollScheduleVersion = {
    ...version({ id: "schedule-1-v1", version: 1, effectiveFrom: "2026-08-25", frequency: "WEEKLY", weekEndDay: 0 }),
    effectiveTo: "2026-08-30",
  };
  const openVersion = version({ id: "schedule-1-v2", version: 2, effectiveFrom: "2026-08-31", frequency: "WEEKLY", weekEndDay: 0 });
  const chained = weeklyUserSchedule({ versions: [closedVersion, openVersion] });

  const stalePeriod: PayrollPeriod = {
    id: "period-1",
    periodStart: "2026-08-31",
    periodEnd: "2026-09-06",
    scheduleId: "schedule-1",
    scheduleVersionId: "schedule-1-v1",
    status: "OPEN",
    autoGenerated: true,
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
  };
  const run: PayrollRun = { id: "run-1", periodId: "period-1", status: "DRAFT", createdAt: "2026-08-25T00:00:00.000Z" };

  const ensured = ensurePayrollPeriodsAndRuns({
    schedules: [chained],
    periods: [stalePeriod],
    runs: [run],
    entries: [],
    workEntries: [],
    referenceDate: "2026-08-25",
    previous: 2,
    next: 2,
  });

  const relinked = ensured.periods.filter((period) => period.periodStart === "2026-08-31" && period.periodEnd === "2026-09-06");
  assert.equal(relinked.length, 1, "no duplicate boundary may appear after the version re-link");
  assert.equal(relinked[0]?.id, "period-1", "the re-linked period keeps its identity");
  assert.equal(relinked[0]?.scheduleVersionId, "schedule-1-v2");
  assert.equal(ensured.runs.filter((run) => run.periodId === "period-1").length, 1, "the existing run must survive the re-link without duplication or orphaning");
  const runPeriodIds = ensured.runs.map((run) => run.periodId).sort();
  assert.equal(new Set(runPeriodIds).size, runPeriodIds.length, "no period may hold more than one run");

  const second = ensurePayrollPeriodsAndRuns({
    schedules: [chained],
    periods: ensured.periods,
    runs: ensured.runs,
    entries: [],
    workEntries: [],
    referenceDate: "2026-08-25",
    previous: 2,
    next: 2,
  });
  assert.deepEqual(second.periods.map((period) => [period.id, period.periodStart, period.periodEnd, period.scheduleVersionId]), ensured.periods.map((period) => [period.id, period.periodStart, period.periodEnd, period.scheduleVersionId]));
  assert.deepEqual(second.runs.map((run) => [run.id, run.periodId, run.status]), ensured.runs.map((run) => [run.id, run.periodId, run.status]));
});

test("a data-bearing OPEN period is re-linked to the governing version without losing data", () => {
  const closedVersion: PayrollScheduleVersion = {
    ...version({ id: "schedule-1-v1", version: 1, effectiveFrom: "2026-08-25", frequency: "WEEKLY", weekEndDay: 0 }),
    effectiveTo: "2026-08-30",
  };
  const openVersion = version({ id: "schedule-1-v2", version: 2, effectiveFrom: "2026-08-31", frequency: "WEEKLY", weekEndDay: 0 });
  const chained = weeklyUserSchedule({ versions: [closedVersion, openVersion] });

  const dataPeriod: PayrollPeriod = {
    id: "period-data",
    periodStart: "2026-09-14",
    periodEnd: "2026-09-20",
    scheduleId: "schedule-1",
    scheduleVersionId: "schedule-1-v1",
    status: "OPEN",
    autoGenerated: true,
    notes: "Reviewer flagged overtime for this week.",
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
  };
  const dataRun: PayrollRun = { id: "run-data", periodId: "period-data", status: "DRAFT", createdAt: "2026-08-25T00:00:00.000Z" };
  const dataEntry: PayrollEntry = { id: "entry-1", payrollRunId: "run-data", workerId: "worker-1", basePay: 0, regularPay: 800, overtimePay: 0, allowances: 0, grossPay: 800, deductions: 0, netPay: 800, projectAllocatedCost: 0, createdAt: "2026-08-26T00:00:00.000Z" };

  const result = ensurePayrollPeriodsAndRuns({
    schedules: [chained],
    periods: [dataPeriod],
    runs: [dataRun],
    entries: [dataEntry],
    workEntries: [],
    referenceDate: "2026-08-25",
    previous: 2,
    next: 2,
  });

  const kept = result.periods.find((period) => period.id === "period-data");
  assert.ok(kept, "the data-bearing period must survive");
  assert.equal(kept!.status, "OPEN");
  assert.equal(kept!.periodStart, "2026-09-14");
  assert.equal(kept!.periodEnd, "2026-09-20");
  assert.equal(kept!.scheduleVersionId, "schedule-1-v2", "the period must reference the version that governs its dates");
  assert.equal(result.runs.some((run) => run.id === "run-data" && run.periodId === "period-data"), true, "the data run stays linked");
  const boundaryKeys = result.periods.map((period) => `${period.periodStart}:${period.periodEnd}`);
  assert.equal(new Set(boundaryKeys).size, boundaryKeys.length, "no duplicate boundaries may be created");
});
