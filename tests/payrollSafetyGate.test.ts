import assert from "node:assert/strict";
import test from "node:test";
import { calculatePayrollRunFromWorkEntries } from "../src/lib/payrollCalculation.ts";
import { fingerprintPayrollSources, validatePayrollRunSourceRevision } from "../src/lib/payrollSourceRevision.ts";
import { getApprovedLeaveDates, normalizeAttendanceRecord, transitionLeaveRequest } from "../src/lib/payrollWorkforce.ts";
import type { AttendanceRecord, LeaveRequest, PayrollPeriod, Worker } from "../src/types.ts";

const present: AttendanceRecord = {
  id: "attendance-1",
  workerId: "worker-1",
  attendanceDate: "2026-08-10",
  scheduledStart: "08:00",
  scheduledEnd: "17:00",
  scheduledMinutes: 480,
  breakMinutes: 60,
  actualTimeIn: "08:00",
  actualTimeOut: "17:00",
  regularMinutes: 480,
  lateMinutes: 0,
  undertimeMinutes: 0,
  overtimeMinutes: 0,
  paidDayFraction: 1,
  attendanceStatus: "PRESENT",
  recordStatus: "CONFIRMED",
  source: "MANUAL",
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
};

const leave = (overrides: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: "leave-1",
  workerId: "worker-1",
  leaveType: "PERSONAL",
  startDate: "2026-08-10",
  endDate: "2026-08-10",
  status: "PENDING",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

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

const period: PayrollPeriod = {
  id: "period-1",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-15",
  status: "OPEN",
  sourceRevision: 4,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

test("attendance status transitions clear stale clocks and payable values at the domain boundary", () => {
  const absent = normalizeAttendanceRecord({ workerId: present.workerId, attendanceDate: present.attendanceDate, attendanceStatus: "ABSENT", actualTimeIn: undefined, actualTimeOut: undefined }, { existing: present });
  assert.equal(absent.valid, true);
  assert.equal(absent.record?.actualTimeIn, undefined);
  assert.equal(absent.record?.actualTimeOut, undefined);
  assert.equal(absent.record?.regularMinutes, 0);
  assert.equal(absent.record?.paidDayFraction, 0);
  assert.equal(absent.record?.overtimeMinutes, 0);

  const presentAgain = normalizeAttendanceRecord({ workerId: present.workerId, attendanceDate: present.attendanceDate, attendanceStatus: "PRESENT", actualTimeIn: "08:00", actualTimeOut: "17:00" }, { existing: absent.record });
  assert.equal(presentAgain.valid, true);
  assert.equal(presentAgain.record?.regularMinutes, 480);
  assert.equal(presentAgain.record?.paidDayFraction, 1);

  for (const status of ["ON_LEAVE", "REST_DAY", "HOLIDAY"] as const) {
    const result = normalizeAttendanceRecord({ workerId: present.workerId, attendanceDate: present.attendanceDate, attendanceStatus: status }, { existing: present });
    assert.equal(result.valid, true);
    assert.equal(result.record?.actualTimeIn, undefined);
    assert.equal(result.record?.actualTimeOut, undefined);
    assert.equal(result.record?.regularMinutes, 0);
    assert.equal(result.record?.paidDayFraction, 0);
  }

  const cleared = normalizeAttendanceRecord({ workerId: present.workerId, attendanceDate: present.attendanceDate, actualTimeIn: undefined, actualTimeOut: undefined }, { existing: present });
  assert.equal(cleared.valid, true);
  assert.equal(cleared.record?.actualTimeIn, undefined);
  assert.equal(cleared.record?.actualTimeOut, undefined);
});

test("confirmed ABSENT attendance cannot pay stale regular minutes", () => {
  const absent = normalizeAttendanceRecord({ workerId: present.workerId, attendanceDate: present.attendanceDate, attendanceStatus: "ABSENT" }, { existing: present });
  assert.equal(absent.record?.regularMinutes, 0);
  const result = calculatePayrollRunFromWorkEntries({
    runId: "run-1",
    periodId: period.id,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    workers: [worker()],
    assignments: [],
    workEntries: [],
    attendanceRecords: [absent.record as never],
    sourceRevision: period.sourceRevision,
  });
  assert.equal(result.entries[0]?.grossPay, 0);
});

test("leave transitions support approval, rejection, safe cancellation, overlap checks, and roster visibility", () => {
  const pending = leave();
  const approved = transitionLeaveRequest({ ...pending, status: "APPROVED" }, "APPROVED", { existing: pending, requests: [pending] });
  assert.equal(approved.valid, true);
  assert.deepEqual(getApprovedLeaveDates("worker-1", "2026-08-10", "2026-08-10", [approved.leave!]), ["2026-08-10"]);

  const overlap = transitionLeaveRequest({ ...leave({ id: "leave-2", startDate: "2026-08-10", endDate: "2026-08-11" }), status: "APPROVED" }, "APPROVED", { existing: leave({ id: "leave-2" }), requests: [approved.leave!] });
  assert.equal(overlap.valid, false);
  assert.ok(overlap.errors.some((issue) => issue.code === "LEAVE_OVERLAP"));

  const rejected = transitionLeaveRequest({ ...pending, status: "REJECTED" }, "REJECTED", { existing: pending, requests: [pending] });
  assert.equal(rejected.valid, true);
  assert.deepEqual(getApprovedLeaveDates("worker-1", "2026-08-10", "2026-08-10", [rejected.leave!]), []);

  const cancelled = transitionLeaveRequest({ ...approved.leave!, status: "CANCELLED" }, "CANCELLED", { existing: approved.leave, requests: [approved.leave!] });
  assert.equal(cancelled.valid, true);
  const locked = transitionLeaveRequest({ ...approved.leave!, status: "CANCELLED" }, "CANCELLED", { existing: approved.leave, requests: [approved.leave!], finalizedRanges: [{ startDate: "2026-08-01", endDate: "2026-08-15" }] });
  assert.equal(locked.valid, false);
  assert.ok(locked.errors.some((issue) => issue.code === "FINALIZED_LEAVE_LOCKED"));
});

test("project status is part of the relevant payroll source fingerprint", () => {
  const workEntries = [{ id: "work-1", workerId: "worker-1", projectId: "project-1", periodId: period.id, workDate: "2026-08-10", status: "APPROVED" }];
  const activeSources = { period, workers: [worker()], workEntries, projects: [{ id: "project-1", status: "ACTIVE", archivedAt: null }] };
  const archivedSources = { ...activeSources, projects: [{ id: "project-1", status: "ARCHIVED", archivedAt: "2026-08-11T00:00:00.000Z" }] };
  assert.notEqual(fingerprintPayrollSources(activeSources), fingerprintPayrollSources(archivedSources));
  const stale = validatePayrollRunSourceRevision({ run: { calculatedSourceRevision: 4, sourceFingerprint: fingerprintPayrollSources(activeSources) }, period, sourceInput: archivedSources });
  assert.equal(stale.valid, false);
  assert.equal(stale.stale, true);
});

test("payroll calculation does not mutate its input while collecting warnings", () => {
  const input = {
    runId: "run-1",
    periodId: period.id,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    workers: [worker({ defaultRate: 0 })],
    assignments: [],
    workEntries: [{ id: "work-1", workerId: "worker-1", periodId: period.id, workDate: "2026-08-10", regularHours: 8, rate: 100, status: "APPROVED" as const }],
    sourceRevision: period.sourceRevision,
  };
  const before = structuredClone(input);
  const result = calculatePayrollRunFromWorkEntries(input);
  assert.ok(result.warnings.length > 0);
  assert.deepEqual(input, before);
  assert.equal(Object.prototype.hasOwnProperty.call(input, "__warnings"), false);
});
