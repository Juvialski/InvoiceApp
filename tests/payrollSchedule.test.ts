import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePayrollPayDate,
  generatePayrollPeriod,
  generatePayrollPeriodsAroundReference,
  mergeGeneratedPayrollPeriods,
  resolvePayrollScheduleVersion,
  selectCurrentPayrollPeriod,
  validatePayrollSchedule,
  type PayrollSchedule,
  type PayrollScheduleVersion,
} from "../src/lib/payrollSchedule.ts";

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
