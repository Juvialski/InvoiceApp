import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePayrollScheduleBootstrapCompatibility,
  createDefaultPayrollSchedule,
  dateOnly,
} from "../src/lib/payrollWorkflow.ts";
import {
  generatePayrollPeriodsAroundReference,
  type PayrollSchedule,
} from "../src/lib/payrollSchedule.ts";
import type { PayrollPeriod, PayrollRun, PayrollEntry, WorkEntry } from "../src/types.ts";
import type { PayrollImportBatch } from "../src/lib/payrollImportPersistence.ts";
import type { PayrollAdjustment, AttendanceRecord, LeaveRequest, OvertimeRequest } from "../src/types.ts";

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

test("legacy default schedule with mid-period effectiveFrom is repaired", () => {
  const schedule = legacyDefaultSchedule();
  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", emptyContext());

  assert.equal(result.repaired, true);
  assert.equal(result.schedule.effectiveFrom, "2026-08-16");
  assert.equal(result.schedule.versions?.[0]?.effectiveFrom, "2026-08-16");
  assert.match(result.reason, /Legacy default schedule repaired/);
});

test("legacy default schedule repair enables period generation", () => {
  const schedule = legacyDefaultSchedule();
  const context = emptyContext();
  const result = analyzePayrollScheduleBootstrapCompatibility(schedule, "2026-08-25", context);

  assert.equal(result.repaired, true);

  const generated = generatePayrollPeriodsAroundReference(result.schedule, "2026-08-25", { previous: 2, next: 2 });
  assert.ok(generated.length > 0, "Should generate periods after repair");
  const currentPeriod = generated.find(p => p.periodStart <= "2026-08-25" && p.periodEnd >= "2026-08-25");
  assert.deepEqual(currentPeriod && [currentPeriod.periodStart, currentPeriod.periodEnd], ["2026-08-16", "2026-08-31"]);
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