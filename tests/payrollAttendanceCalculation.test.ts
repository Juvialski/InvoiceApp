import assert from "node:assert/strict";
import test from "node:test";
import { calculatePayrollRunFromWorkEntries, type PayrollAttendanceRecordLike, type PayrollOvertimeRequestLike } from "../src/lib/payrollCalculation.ts";
import { fingerprintPayrollSources, validatePayrollRunSourceRevision } from "../src/lib/payrollSourceRevision.ts";
import type { AttendanceRecord, OvertimeRequest, PayrollPeriod, Worker, WorkEntry } from "../src/types.ts";

const worker = (overrides: Partial<Worker> = {}): Worker => ({
  id: "worker-1",
  employeeCode: "E-1",
  firstName: "Ana",
  lastName: "Santos",
  displayName: "Ana Santos",
  employmentType: "REGULAR",
  defaultPayType: "HOURLY",
  defaultRate: 100,
  active: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

const attendance = (overrides: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  id: "attendance-1",
  workerId: "worker-1",
  periodId: "period-1",
  attendanceDate: "2026-08-03",
  scheduledMinutes: 480,
  breakMinutes: 60,
  regularMinutes: 480,
  lateMinutes: 0,
  undertimeMinutes: 0,
  overtimeMinutes: 0,
  paidDayFraction: 1,
  attendanceStatus: "PRESENT",
  recordStatus: "CONFIRMED",
  source: "MANUAL",
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  ...overrides,
});

const period: PayrollPeriod = {
  id: "period-1",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-15",
  status: "OPEN",
  sourceRevision: 3,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function calculate(overrides: Partial<Parameters<typeof calculatePayrollRunFromWorkEntries>[0]> = {}) {
  return calculatePayrollRunFromWorkEntries({
    runId: "run-1",
    periodId: period.id,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    workers: [worker()],
    assignments: [],
    workEntries: [],
    attendanceRecords: [attendance() as unknown as PayrollAttendanceRecordLike],
    sourceRevision: period.sourceRevision,
    ...overrides,
  });
}

test("hourly regular pay uses confirmed attendance as the primary source", () => {
  const result = calculate();
  assert.equal(result.entries[0]?.regularPay, 800);
  assert.equal(result.entries[0]?.grossPay, 800);
  assert.equal(result.entries[0]?.calculationSnapshot.source, "CONFIRMED_ATTENDANCE");
  assert.equal(result.sourceRevision, 3);
  assert.match(result.sourceFingerprint || "", /^payroll-source-v1:/);
});

test("daily attendance uses payable day fractions and monthly attendance does not invent deductions", () => {
  const daily = calculate({ workers: [worker({ defaultPayType: "DAILY", defaultRate: 500 })], attendanceRecords: [attendance() as unknown as PayrollAttendanceRecordLike, attendance({ id: "attendance-2", attendanceDate: "2026-08-04", attendanceStatus: "PARTIAL", paidDayFraction: 0.5, regularMinutes: 240 }) as unknown as PayrollAttendanceRecordLike] });
  assert.equal(daily.entries[0]?.regularPay, 750);
  const monthly = calculate({ workers: [worker({ defaultPayType: "MONTHLY", defaultRate: 40_000 })], attendanceRecords: [attendance({ attendanceStatus: "ABSENT", paidDayFraction: 0, regularMinutes: 0 }) as unknown as PayrollAttendanceRecordLike] });
  assert.equal(monthly.entries[0]?.regularPay, 40_000);
  assert.equal(monthly.entries[0]?.deductions, 0);
});

test("pending overtime is excluded and approved explicit overtime wins over legacy overtime", () => {
  const pending: OvertimeRequest = { id: "ot-pending", workerId: "worker-1", periodId: period.id, overtimeDate: "2026-08-03", requestedMinutes: 120, approvedMinutes: 0, status: "PENDING", source: "MANUAL", createdAt: "2026-08-03T00:00:00.000Z", updatedAt: "2026-08-03T00:00:00.000Z" };
  const approved: OvertimeRequest = { ...pending, id: "ot-approved", requestedMinutes: 120, approvedMinutes: 120, status: "APPROVED" };
  const legacy: WorkEntry = { id: "work-1", workerId: "worker-1", projectId: "project-1", laborContext: "PROJECT", periodId: period.id, workDate: "2026-08-03", regularHours: 8, overtimeHours: 1, rate: 100, status: "APPROVED" };
  const pendingResult = calculate({ overtimeRequests: [pending as unknown as PayrollOvertimeRequestLike], workEntries: [legacy] });
  assert.equal(pendingResult.entries[0]?.overtimePay, 100);
  const approvedResult = calculate({ overtimeRequests: [approved as unknown as PayrollOvertimeRequestLike], workEntries: [legacy] });
  assert.equal(approvedResult.entries[0]?.overtimePay, 200);
  assert.ok(approvedResult.warnings.some((message) => message.includes("conflicts with legacy")));
});

test("admin and overhead labor contexts do not require or persist a fake project allocation", () => {
  const result = calculate({ workers: [worker({ defaultPayType: "HOURLY" })], workEntries: [{ id: "admin-work", workerId: "worker-1", laborContext: "ADMIN_OFFICE", periodId: period.id, workDate: "2026-08-03", regularHours: 8, rate: 100, status: "APPROVED" }] });
  assert.equal(result.entries[0]?.grossPay, 800);
  assert.equal(result.entries[0]?.projectAllocatedCost, 0);
  assert.ok(result.allocations.every((allocation) => allocation.projectId === undefined));
});

test("source fingerprints and revisions deterministically block stale approval", () => {
  const sourceInput = { period, workers: [worker()], attendance: [attendance()] };
  const fingerprint = fingerprintPayrollSources(sourceInput);
  assert.equal(fingerprint, fingerprintPayrollSources({ attendance: [attendance()], workers: [worker()], period }));
  const stale = validatePayrollRunSourceRevision({ run: { calculatedSourceRevision: 3, sourceFingerprint: fingerprint }, period: { sourceRevision: 4 }, sourceInput });
  assert.equal(stale.valid, false);
  assert.equal(stale.stale, true);
  const current = validatePayrollRunSourceRevision({ run: { calculatedSourceRevision: 4, sourceFingerprint: fingerprint }, period: { sourceRevision: 4 }, sourceInput });
  assert.equal(current.valid, true);
  assert.equal(validatePayrollRunSourceRevision({ run: {}, period: { sourceRevision: 4 } }).legacy, true);
});
