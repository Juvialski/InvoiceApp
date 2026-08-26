import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePayrollScheduleBootstrapCompatibility,
  createDefaultPayrollSchedule,
  ensurePayrollPeriodsAndRuns,
} from "../src/lib/payrollWorkflow.ts";
import {
  generatePayrollPeriodsAroundReference,
  type PayrollSchedule,
} from "../src/lib/payrollSchedule.ts";
import type { PayrollPeriod, PayrollRun, PayrollEntry, WorkEntry, PayrollAdjustment, AttendanceRecord, LeaveRequest, OvertimeRequest } from "../src/types.ts";
import type { PayrollImportBatch } from "../src/lib/payrollImportPersistence.ts";

function legacyDefaultSchedule(overrides: Partial<PayrollSchedule> = {}): PayrollSchedule {
  return {
    id: "schedule-legacy",
    name: "Standard semi-monthly payroll",
    effectiveFrom: "2026-08-25",
    frequency: "SEMI_MONTHLY",
    payDateRule: { type: "BUSINESS_DAYS", offsetDays: 2 },
    autoGeneratePeriods: true,
    autoCalculate: false,
    autoCreateRuns: true,
    autoSelectCurrentPeriod: true,
    automationMode: "ASSISTED",
    active: true,
    versions: [{
      id: "schedule-legacy:v1",
      scheduleId: "schedule-legacy",
      version: 1,
      effectiveFrom: "2026-08-25",
      frequency: "SEMI_MONTHLY",
      customCutoffDay: 15,
      payDateRule: { type: "BUSINESS_DAYS", offsetDays: 2 },
      autoGeneratePeriods: true,
      autoCalculate: false,
      autoCreateRuns: true,
      autoSelectCurrentPeriod: true,
      automationMode: "ASSISTED",
      active: true,
    }],
    ...overrides,
  };
}

function correctedDefaultSchedule(overrides: Partial<PayrollSchedule> = {}): PayrollSchedule {
  return {
    id: "schedule-corrected",
    name: "Standard semi-monthly payroll",
    effectiveFrom: "2026-08-16",
    frequency: "SEMI_MONTHLY",
    payDateRule: { type: "BUSINESS_DAYS", offsetDays: 2 },
    autoGeneratePeriods: true,
    autoCalculate: false,
    autoCreateRuns: true,
    autoSelectCurrentPeriod: true,
    automationMode: "ASSISTED",
    active: true,
    versions: [{
      id: "schedule-corrected:v1",
      scheduleId: "schedule-corrected",
      version: 1,
      effectiveFrom: "2026-08-16",
      frequency: "SEMI_MONTHLY",
      customCutoffDay: 15,
      payDateRule: { type: "BUSINESS_DAYS", offsetDays: 2 },
      autoGeneratePeriods: true,
      autoCalculate: false,
      autoCreateRuns: true,
      autoSelectCurrentPeriod: true,
      automationMode: "ASSISTED",
      active: true,
    }],
    ...overrides,
  };
}

function emptyContext() {
  return {
    periods: [] as PayrollPeriod[],
    runs: [] as PayrollRun[],
    entries: [] as PayrollEntry[],
    workEntries: [] as WorkEntry[],
    importBatches: [] as PayrollImportBatch[],
    adjustments: [] as PayrollAdjustment[],
    attendanceRecords: [] as AttendanceRecord[],
    leaveRequests: [] as LeaveRequest[],
    overtimeRequests: [] as OvertimeRequest[],
  };
}

test("legacy default schedule with mid-period effectiveFrom is left untouched because generation no longer fails", () => {
  // Updated for the find-first-complete-period domain fix: backdating a
  // legacy default is no longer needed (or performed) because the calendar
  // continues from the first COMPLETE future period without repair.
  const schedule = legacyDefaultSchedule();
  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", emptyContext());

  assert.equal(result.repaired, false);
  assert.match(result.reason, /no repair needed/);
  assert.equal(result.schedule.effectiveFrom, "2026-08-25", "the legacy effectiveFrom must not be rewritten");
  assert.equal(result.schedule.versions?.[0]?.effectiveFrom, "2026-08-25");
});

test("unrepaired legacy default schedule still enables period generation", () => {
  const schedule = legacyDefaultSchedule();
  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", emptyContext());
  assert.equal(result.repaired, false);

  const generated = generatePayrollPeriodsAroundReference(result.schedule, "2026-08-25", { previous: 2, next: 2 });
  assert.ok(generated.length > 0, "Should generate periods without any repair");
  assert.deepEqual(generated.map((p) => [p.periodStart, p.periodEnd]), [
    ["2026-09-01", "2026-09-15"],
    ["2026-09-16", "2026-09-30"],
    ["2026-10-01", "2026-10-15"],
  ]);
  const clippedCycle = generated.find((p) => p.periodStart <= "2026-08-25" && p.periodEnd >= "2026-08-25");
  assert.equal(clippedCycle, undefined, "the partial Aug 16-31 cycle must stay rejected, never clipped or emitted");
  const firstComplete = generated[0]!;
  assert.deepEqual([firstComplete.periodStart, firstComplete.periodEnd, firstComplete.payDate], ["2026-09-01", "2026-09-15", "2026-09-17"]);
});

test("the unrepaired legacy default schedule produces the full horizon without a future current-period run", () => {
  const schedule = legacyDefaultSchedule();
  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", emptyContext());
  assert.equal(result.repaired, false);

  const ensured = ensurePayrollPeriodsAndRuns({
    schedules: [result.schedule],
    periods: [],
    runs: [],
    entries: [],
    workEntries: [],
    referenceDate: "2026-08-25",
    previous: 2,
    next: 2,
  });
  // No pre-effective periods exist; the horizon starts at the first complete
  // future period and ensure returns it newest-first.
  assert.deepEqual(ensured.periods.map((period) => `${period.periodStart}:${period.periodEnd}`), [
    "2026-10-01:2026-10-15",
    "2026-09-16:2026-09-30",
    "2026-09-01:2026-09-15",
  ]);
  assert.equal(ensured.runs.length, 0, "a future-only horizon must not receive a current-period run");
  const selected = ensured.periods.find((period) => period.id === ensured.selectedPeriodId);
  assert.ok(selected, "a current period must be selected");
});

test("user-authored mid-period schedule generates the future horizon instead of staying empty through ensurePayrollPeriodsAndRuns", () => {
  // Updated for the find-first-complete-period domain fix: this asserted the
  // old buggy behavior (an empty horizon); mid-cycle schedules now continue
  // from the first complete future period.
  const schedule = legacyDefaultSchedule({ name: "Custom payroll schedule" });
  const ensured = ensurePayrollPeriodsAndRuns({
    schedules: [schedule],
    periods: [],
    runs: [],
    entries: [],
    workEntries: [],
    referenceDate: "2026-08-25",
    previous: 2,
    next: 2,
  });
  assert.equal(ensured.periods.length, 3);
  assert.deepEqual(ensured.periods.map((period) => `${period.periodStart}:${period.periodEnd}`).sort(), [
    "2026-09-01:2026-09-15",
    "2026-09-16:2026-09-30",
    "2026-10-01:2026-10-15",
  ]);
  assert.equal(ensured.runs.length, 0, "a future-only horizon must not receive a current-period run");
  assert.notEqual(ensured.selectedPeriodId, undefined);
});

test("already corrected schedule is not repaired again", () => {
  const schedule = correctedDefaultSchedule();
  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", emptyContext());

  assert.equal(result.repaired, false);
  assert.equal(result.schedule.effectiveFrom, "2026-08-16");
});

test("user-authored mid-period schedule is not repaired", () => {
  const schedule = legacyDefaultSchedule({ name: "Custom payroll schedule" });
  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", emptyContext());

  assert.equal(result.repaired, false);
  assert.match(result.reason, /does not match the InvoiceApp standard default profile/);
});

test("WEEKLY AUTOMATED user schedule is not repaired or backdated", () => {
  const schedule: PayrollSchedule = {
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
  };
  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", emptyContext());

  assert.equal(result.repaired, false);
  assert.match(result.reason, /does not match the InvoiceApp standard default profile/);
  assert.equal(result.schedule.effectiveFrom, "2026-08-25", "the mid-cycle effectiveFrom must never be backdated");
  assert.equal(result.schedule.frequency, "WEEKLY");
});

test("schedule with different frequency is not repaired", () => {
  const schedule = legacyDefaultSchedule({ frequency: "MONTHLY" });
  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", emptyContext());

  assert.equal(result.repaired, false);
});

test("schedule with different pay date rule is not repaired", () => {
  const schedule = legacyDefaultSchedule({ payDateRule: { type: "CALENDAR_DAYS", offsetDays: 5 } });
  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", emptyContext());

  assert.equal(result.repaired, false);
});

test("schedule without autoCreateRuns is not repaired", () => {
  const schedule = legacyDefaultSchedule({ autoCreateRuns: false });
  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", emptyContext());

  assert.equal(result.repaired, false);
});

test("inactive schedule is not repaired", () => {
  const schedule = legacyDefaultSchedule({ active: false });
  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", emptyContext());

  assert.equal(result.repaired, false);
});

test("schedule with data-bearing earlier period is not repaired", () => {
  const schedule = legacyDefaultSchedule();
  const context = emptyContext();
  context.periods.push({
    id: "period-earlier",
    scheduleId: "schedule-legacy",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-15",
    status: "APPROVED",
    autoGenerated: true,
    notes: "Finalized payroll period",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  } as PayrollPeriod);

  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", context);
  assert.equal(result.repaired, false);
  assert.match(result.reason, /Earlier data-bearing periods exist/);
});

test("schedule with finalized period at current boundary is not repaired", () => {
  const schedule = legacyDefaultSchedule();
  const context = emptyContext();
  context.periods.push({
    id: "period-current",
    scheduleId: "schedule-legacy",
    periodStart: "2026-08-25",
    periodEnd: "2026-08-31",
    status: "PAID",
    autoGenerated: true,
    lockedAt: "2026-09-01T00:00:00Z",
    createdAt: "2026-08-25T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  } as PayrollPeriod);

  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", context);
  assert.equal(result.repaired, false);
  assert.match(result.reason, /Finalized period exists at current effective boundary/);
});

test("schedule with work entries in backdated window is not repaired", () => {
  const schedule = legacyDefaultSchedule();
  const context = emptyContext();
  // Work entry in the window [correctedEffectiveFrom, schedule.effectiveFrom) = [2026-08-16, 2026-08-25)
  context.workEntries.push({
    id: "work-1",
    workerId: "worker-1",
    workDate: "2026-08-18",
    status: "APPROVED",
  } as WorkEntry);

  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", context);
  assert.equal(result.repaired, false);
  assert.match(result.reason, /Source records exist in the backdated window/);
});

test("schedule with attendance records in backdated window is not repaired", () => {
  const schedule = legacyDefaultSchedule();
  const context = emptyContext();
  context.attendanceRecords.push({
    id: "att-1",
    workerId: "worker-1",
    attendanceDate: "2026-08-17",
    recordStatus: "CONFIRMED",
  } as AttendanceRecord);

  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", context);
  assert.equal(result.repaired, false);
  assert.match(result.reason, /Source records exist in the backdated window/);
});

test("schedule with overtime requests in backdated window is not repaired", () => {
  const schedule = legacyDefaultSchedule();
  const context = emptyContext();
  context.overtimeRequests.push({
    id: "ot-1",
    workerId: "worker-1",
    overtimeDate: "2026-08-20",
  } as OvertimeRequest);

  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", context);
  assert.equal(result.repaired, false);
  assert.match(result.reason, /Source records exist in the backdated window/);
});

test("schedule with leave overlapping backdated window is not repaired", () => {
  const schedule = legacyDefaultSchedule();
  const context = emptyContext();
  context.leaveRequests.push({
    id: "leave-1",
    workerId: "worker-1",
    startDate: "2026-08-14",
    endDate: "2026-08-18",
  } as LeaveRequest);

  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", context);
  assert.equal(result.repaired, false);
  assert.match(result.reason, /Source records exist in the backdated window/);
});

test("void or period-linked source records outside the window leave the schedule untouched and generating", () => {
  // Updated for the find-first-complete-period domain fix: generation no
  // longer fails for mid-cycle schedules, so repair never triggers and the
  // window-safety records simply leave the schedule untouched.
  const schedule = legacyDefaultSchedule();
  const context = emptyContext();
  context.workEntries.push({ id: "work-linked", workerId: "w1", workDate: "2026-08-20", status: "APPROVED", periodId: "some-period" } as WorkEntry);
  context.workEntries.push({ id: "work-void", workerId: "w1", workDate: "2026-08-21", status: "VOID" } as WorkEntry);
  context.attendanceRecords.push({ id: "att-old", workerId: "w1", attendanceDate: "2026-07-02", recordStatus: "CONFIRMED" } as AttendanceRecord);

  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", context);
  assert.equal(result.repaired, false);
  assert.match(result.reason, /no repair needed/);
  assert.equal(result.schedule.effectiveFrom, "2026-08-25");

  const generated = generatePayrollPeriodsAroundReference(result.schedule, "2026-08-25", { previous: 2, next: 2 });
  assert.ok(generated.length > 0);
});

test("schedule with inconsistent version effectiveFrom is not repaired", () => {
  const schedule = legacyDefaultSchedule({
    versions: [{
      id: "schedule-legacy:v1",
      scheduleId: "schedule-legacy",
      version: 1,
      effectiveFrom: "2026-08-20",
      frequency: "SEMI_MONTHLY",
      customCutoffDay: 15,
      payDateRule: { type: "BUSINESS_DAYS", offsetDays: 2 },
      autoGeneratePeriods: true,
      autoCalculate: false,
      autoCreateRuns: true,
      autoSelectCurrentPeriod: true,
      automationMode: "ASSISTED",
      active: true,
    }],
  });
  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", emptyContext());

  assert.equal(result.repaired, false);
  assert.match(result.reason, /inconsistent/);
});

test("schedule that already generates periods is not repaired", () => {
  const schedule = correctedDefaultSchedule();
  const context = emptyContext();
  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", context);

  assert.equal(result.repaired, false);
  assert.match(result.reason, /Schedule effectiveFrom is already at a period boundary/);
});

test("createDefaultPayrollSchedule produces corrected effectiveFrom for 2026-08-25", () => {
  const schedule = createDefaultPayrollSchedule("2026-08-25");
  assert.equal(schedule.effectiveFrom, "2026-08-16");
  assert.equal(schedule.versions?.[0]?.effectiveFrom, "2026-08-16");
});

test("createDefaultPayrollSchedule produces corrected effectiveFrom for 2026-08-10", () => {
  const schedule = createDefaultPayrollSchedule("2026-08-10");
  assert.equal(schedule.effectiveFrom, "2026-08-01");
  assert.equal(schedule.versions?.[0]?.effectiveFrom, "2026-08-01");
});
