import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addDateDays, findFirstGeneratablePayrollPeriod, generatePayrollPeriodsAroundReference, type PayrollSchedule } from "../src/lib/payrollSchedule.ts";

const settingsSource = readFileSync(new URL("../src/components/payroll/PayrollScheduleSettings.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../src/components/payroll/PayrollPageV2.tsx", import.meta.url), "utf8");

function weeklySundaySchedule(): PayrollSchedule {
  return {
    id: "schedule-weekly",
    name: "Weekly payroll",
    effectiveFrom: "2026-08-25",
    frequency: "WEEKLY",
    weekEndDay: 0,
    payDateRule: { type: "SAME_PERIOD_END" },
    autoGeneratePeriods: true,
    autoCalculate: false,
    autoCreateRuns: true,
    autoSelectCurrentPeriod: true,
    automationMode: "ASSISTED",
    active: true,
  } as PayrollSchedule;
}

test("next-period recommendation never guesses tomorrow", () => {
  assert.doesNotMatch(settingsSource, /addDateDays\(today,\s*1\)/);
});

test("recommendation asks the domain for the first generatable period and reports diagnostics", () => {
  assert.match(settingsSource, /from "\.\.\/\.\.\/lib\/payrollSchedule"/);
  assert.match(settingsSource, /\bfindFirstGeneratablePayrollPeriod\(/);
  assert.match(settingsSource, /useMemo\(\(\) => recommendNextPeriodStart\(periods, editing, today\)/);
  assert.match(settingsSource, /BIWEEKLY requires an anchor period end\./);
  assert.match(settingsSource, /\{recommendationDiagnostic\}/);
});

test("next-period recommendation ignores a stale lone future row", () => {
  assert.match(settingsSource, /Existing generated periods are an observation/);
  assert.match(settingsSource, /findFirstGeneratablePayrollPeriod\(recommendationCandidate\(editing, recommendationDate\), recommendationDate\)/);
  assert.match(settingsSource, /not from an existing generated period/);
  assert.doesNotMatch(settingsSource, /const upcoming = periods\.filter/);
});

test("inserting a repaired earlier boundary closes it before a stored future version", () => {
  assert.match(settingsSource, /const followingVersion = versions/);
  assert.match(settingsSource, /effectiveTo: addDateDays\(followingVersion\.effectiveFrom, -1\)/);
  assert.match(settingsSource, /Bound the inserted version before that future version/);
});

test("one shared candidate builder feeds both the preview memo and the submit path", () => {
  assert.match(settingsSource, /function buildCandidateSchedule\(/);
  const callSites = settingsSource.match(/buildCandidateSchedule\(editing, schedule, effectiveMode, chosenDate, recommendedStart, today\)/g) || [];
  assert.equal(callSites.length, 2);
  assert.match(settingsSource, /useMemo\(\(\) => buildCandidateSchedule\(editing, schedule, effectiveMode, chosenDate, recommendedStart, today\)/);
});

test("candidate builder materializes the implicit legacy version so history keeps resolving", () => {
  assert.match(settingsSource, /if \(schedule && !versions\.length\)/);
  assert.match(settingsSource, /`\$\{schedule\.id\}:v1`/);
});

test("preview explains mid-cycle skips and distinguishes thrown config errors from the empty-preview line", () => {
  assert.match(settingsSource, /takes effect inside the current/);
  assert.match(settingsSource, /incomplete cycle is skipped/i);
  assert.match(settingsSource, /The first complete payroll period is/);
  assert.match(settingsSource, /semi-monthly/);
  assert.match(settingsSource, /Complete a valid schedule to see the preview\./);
  assert.match(settingsSource, /role="alert"[^>]*>\{preview\.previewError\}/);
});

test("payroll page keeps the boundary-waiting preparation state wired to retry", () => {
  assert.match(pageSource, /"WAITING_FOR_BOUNDARY"/);
  assert.match(pageSource, /waiting for a valid period/);
  assert.match(pageSource, /Open Payroll Schedule settings/);
  assert.match(pageSource, /\(periodPreparationState === "FAILED" \|\| periodPreparationState === "WAITING_FOR_BOUNDARY"\) && onRetryPeriodPreparation/);
});

test("payroll page distinguishes no active period from the selected next period", () => {
  assert.match(pageSource, /selectStablePayrollPeriod/);
  assert.match(pageSource, /actualCurrentPeriod/);
  assert.match(pageSource, /No active period/);
  assert.match(pageSource, /Next:/);
  assert.match(pageSource, /periodJumpLabel/);
  assert.doesNotMatch(pageSource, /selectCurrentPayrollPeriod/);
});

test("weekly sunday schedules skip the incomplete cycle and start at the next complete week", () => {
  const schedule = weeklySundaySchedule();

  const horizon = generatePayrollPeriodsAroundReference(schedule, "2026-08-25", { previous: 0, next: 2 });
  assert.deepEqual(horizon.map((period) => [period.periodStart, period.periodEnd]), [
    ["2026-08-31", "2026-09-06"],
    ["2026-09-07", "2026-09-13"],
    ["2026-09-14", "2026-09-20"],
  ]);

  const first = findFirstGeneratablePayrollPeriod(schedule, "2026-08-25");
  assert.equal(first?.periodStart, "2026-08-31");
  assert.equal(first?.periodEnd, "2026-09-06");
  assert.equal(addDateDays("2026-08-30", 1), "2026-08-31");
});
