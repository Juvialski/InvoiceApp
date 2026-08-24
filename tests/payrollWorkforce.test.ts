import test from "node:test";
import assert from "node:assert/strict";
import {
  addDateDays,
  applyAttendanceBatch,
  buildDailyRoster,
  buildScheduleSnapshot,
  deriveAttendanceMinutes,
  findAttendanceDuplicates,
  findLeaveOverlaps,
  getApprovedLeaveDates,
  getLeaveDates,
  isDateOnApprovedLeave,
  isWorkerExpectedOnDate,
  isWorkerScheduledForDate,
  markScheduledWorkersPresent,
  normalizeAttendanceRecord,
  resolveOvertime,
  validateAttendanceRecord,
  validateDateOnly,
  type DailyRosterInput,
  type WorkforceWorker,
} from "../src/lib/payrollWorkforce.ts";
import type { AttendanceRecord, LeaveRequest, OvertimeRequest, PayrollHoliday, WorkEntry } from "../src/types.ts";

const worker = (overrides: Partial<WorkforceWorker> = {}): WorkforceWorker => ({
  id: "worker-1",
  active: true,
  employmentStatus: "ACTIVE",
  workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
  ...overrides,
});

const leave = (overrides: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: "leave-1",
  workerId: "worker-1",
  leaveType: "VACATION",
  startDate: "2026-08-10",
  endDate: "2026-08-11",
  status: "APPROVED",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

const holiday = (overrides: Partial<PayrollHoliday> = {}): PayrollHoliday => ({
  id: "holiday-1",
  holidayDate: "2026-08-10",
  name: "Founders day",
  active: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

function attendance(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: "attendance-1",
    workerId: "worker-1",
    attendanceDate: "2026-08-10",
    scheduledStart: "09:00",
    scheduledEnd: "17:00",
    scheduledMinutes: 480,
    breakMinutes: 0,
    regularMinutes: 480,
    lateMinutes: 0,
    undertimeMinutes: 0,
    overtimeMinutes: 0,
    paidDayFraction: 1,
    attendanceStatus: "PRESENT",
    recordStatus: "DRAFT",
    source: "MANUAL",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

test("validates date-only values and performs UTC calendar arithmetic at boundaries", () => {
  assert.equal(validateDateOnly("2026-02-29").valid, false);
  assert.equal(validateDateOnly("2028-02-29").valid, true);
  assert.equal(validateDateOnly("2026-8-01").valid, false);
  assert.equal(addDateDays("2028-02-29", 1), "2028-03-01");
  assert.equal(addDateDays("2026-01-01", -1), "2025-12-31");
});

test("worker expected and scheduled logic honors status, employment dates, weekdays, hours, holiday, and leave", () => {
  const base = worker({ hireDate: "2026-08-10", endDate: "2026-08-31" });
  assert.equal(isWorkerExpectedOnDate(base, "2026-08-10"), true);
  assert.equal(isWorkerScheduledForDate(base, "2026-08-09"), false);
  assert.equal(isWorkerExpectedOnDate(base, "2026-08-09"), false);
  assert.equal(isWorkerExpectedOnDate({ ...base, active: false }, "2026-08-10"), false);
  assert.equal(isWorkerExpectedOnDate({ ...base, employmentStatus: "ONBOARDING" }, "2026-08-10"), false);
  assert.equal(isWorkerScheduledForDate(base, "2026-08-10", { holidays: [holiday()] }), false);
  assert.equal(isWorkerScheduledForDate(base, "2026-08-11", { leaveRequests: [leave()] }), false);
  assert.equal(isWorkerScheduledForDate({ ...base, workingHoursStart: undefined, workingHoursEnd: undefined }, "2026-08-10"), true);
});

test("daily roster excludes rest days, holidays, approved full-day leave, inactive workers, and out-of-range workers", () => {
  const input: DailyRosterInput = {
    date: "2026-08-10",
    workers: [
      worker(),
      worker({ id: "rest", workingDays: ["TUESDAY"] }),
      worker({ id: "holiday-worker" }),
      worker({ id: "leave-worker" }),
      worker({ id: "inactive", active: false }),
      worker({ id: "not-yet", hireDate: "2026-08-11" }),
    ],
    holidays: [holiday({ id: "h2", holidayDate: "2026-08-10" })],
    leaveRequests: [leave({ id: "l2", workerId: "leave-worker" })],
  };
  const roster = buildDailyRoster({ ...input, holidays: [] });
  assert.equal(roster.valid, true);
  assert.deepEqual(roster.items.map((item) => item.workerId), ["worker-1", "holiday-worker"]);
  assert.equal(buildDailyRoster(input).items.length, 0);
  assert.equal(roster.excluded.find((item) => item.workerId === "rest")?.status, "REST_DAY");
  assert.equal(roster.excluded.find((item) => item.workerId === "leave-worker")?.status, "ON_LEAVE");
});

test("schedule snapshots are deterministic and retain exclusion context", () => {
  const first = buildScheduleSnapshot({ date: "2026-08-10", workers: [worker()], holidays: [] });
  const second = buildScheduleSnapshot({ date: "2026-08-10", workers: [worker()], holidays: [] });
  assert.deepEqual(first, second);
  assert.equal(first.workers[0]?.status, "SCHEDULED");
  assert.equal(first.rosterItems[0]?.scheduledMinutes, 480);
});

test("attendance minute derivation clamps breaks and deviations without negative regular time", () => {
  const late = deriveAttendanceMinutes({ scheduledStart: "09:00", scheduledEnd: "17:00", breakMinutes: 60, actualTimeIn: "09:15", actualTimeOut: "18:00" });
  assert.equal(late.valid, true);
  assert.equal(late.scheduledMinutes, 420);
  assert.equal(late.regularMinutes, 405);
  assert.equal(late.lateMinutes, 15);
  assert.equal(late.undertimeMinutes, 0);
  assert.equal(late.overtimeMinutes, 60);
  const clamped = deriveAttendanceMinutes({ scheduledStart: "09:00", scheduledEnd: "17:00", breakMinutes: 999, actualTimeIn: "18:00", actualTimeOut: "18:01" });
  assert.equal(clamped.scheduledMinutes, 0);
  assert.equal(clamped.regularMinutes, 0);
  assert.equal(clamped.lateMinutes, 0);
  assert.equal(clamped.overtimeMinutes, 61);
  assert.equal(clamped.errors.some((issue) => issue.code === "INVALID_ACTUAL_RANGE"), false);
});

test("attendance validation catches malformed clock and minute fields", () => {
  const result = validateAttendanceRecord(attendance({ attendanceDate: "2026-02-30", regularMinutes: -1, actualTimeIn: "09:00" }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((issue) => issue.code === "INVALID_DATE_ONLY"));
  assert.ok(result.errors.some((issue) => issue.code === "INVALID_MINUTES"));
  assert.ok(result.errors.some((issue) => issue.code === "INCOMPLETE_ACTUAL_TIMES"));
});

test("leave helpers expand approved dates, distinguish inactive requests, and find inclusive overlaps", () => {
  assert.deepEqual(getLeaveDates(leave()), ["2026-08-10", "2026-08-11"]);
  assert.deepEqual(getApprovedLeaveDates("worker-1", "2026-08-01", "2026-08-31", [leave(), leave({ id: "pending", status: "PENDING", startDate: "2026-08-15", endDate: "2026-08-15" })]), ["2026-08-10", "2026-08-11"]);
  assert.equal(isDateOnApprovedLeave("worker-1", "2026-08-10", [leave()]), true);
  const overlaps = findLeaveOverlaps([leave(), leave({ id: "leave-2", startDate: "2026-08-11", endDate: "2026-08-12" })]);
  assert.equal(overlaps.length, 1);
  assert.deepEqual([overlaps[0]?.overlapStart, overlaps[0]?.overlapEnd], ["2026-08-11", "2026-08-11"]);
});

test("duplicate detection and batch upsert normalize one worker/date without producing duplicates", () => {
  const existing = attendance();
  assert.equal(findAttendanceDuplicates([existing, { ...existing, id: "attendance-duplicate" }]).length, 1);
  const preview = applyAttendanceBatch({
    previewOnly: true,
    existingRecords: [existing],
    records: [{ workerId: "worker-1", attendanceDate: "2026-08-10", actualTimeIn: "09:15", actualTimeOut: "17:00", scheduledStart: "09:00", scheduledEnd: "17:00" }],
  });
  assert.equal(preview.valid, true);
  assert.equal(preview.previewOnly, true);
  assert.equal(preview.operations[0]?.operation, "UPDATE");
  assert.equal(preview.records.length, 1);
  const duplicateBatch = applyAttendanceBatch({
    records: [
      { workerId: "worker-1", attendanceDate: "2026-08-10", attendanceStatus: "PRESENT" },
      { workerId: "worker-1", attendanceDate: "2026-08-10", attendanceStatus: "PRESENT" },
    ],
  });
  assert.equal(duplicateBatch.valid, false);
  assert.ok(duplicateBatch.errors.some((issue) => issue.code === "DUPLICATE_ATTENDANCE_BATCH"));
});

test("markScheduledWorkersPresent is a pure, repeatable roster-to-attendance preview", () => {
  const workers = [worker(), worker({ id: "rest", workingDays: ["SUNDAY"] })];
  const first = markScheduledWorkersPresent({ date: "2026-08-10", workers, holidays: [] });
  assert.equal(first.valid, true);
  assert.deepEqual(first.scheduledWorkerIds, ["worker-1"]);
  assert.equal(first.created[0]?.attendanceStatus, "PRESENT");
  assert.equal(first.created[0]?.regularMinutes, 480);
  const second = markScheduledWorkersPresent({ date: "2026-08-10", workers, holidays: [], existingRecords: first.records as AttendanceRecord[] });
  assert.equal(second.valid, true);
  assert.equal(second.records.length, 1);
  assert.equal(second.operations[0]?.operation, "UNCHANGED");
  assert.deepEqual(first.roster.items.map((item) => item.workerId), second.roster.items.map((item) => item.workerId));
});

test("overtime precedence uses approved explicit requests once and surfaces legacy conflicts", () => {
  const requests: OvertimeRequest[] = [{
    id: "ot-1",
    workerId: "worker-1",
    overtimeDate: "2026-08-10",
    requestedMinutes: 90,
    approvedMinutes: 60,
    status: "APPROVED",
    source: "MANUAL",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
  }];
  const entries: WorkEntry[] = [{ id: "entry-1", workerId: "worker-1", workDate: "2026-08-10", overtimeHours: 2, rate: 1, status: "APPROVED" }];
  const explicit = resolveOvertime({ workerId: "worker-1", overtimeDate: "2026-08-10", overtimeRequests: requests, workEntries: entries });
  assert.equal(explicit.overtimeMinutes, 60);
  assert.equal(explicit.source, "EXPLICIT_APPROVED");
  assert.equal(explicit.ignoredLegacyMinutes, 120);
  assert.equal(explicit.conflicts[0]?.code, "EXPLICIT_AND_LEGACY_OVERTIME");
  const fallback = resolveOvertime({ workerId: "worker-1", overtimeDate: "2026-08-10", overtimeRequests: [], workEntries: entries });
  assert.equal(fallback.overtimeMinutes, 120);
  assert.equal(fallback.source, "LEGACY_WORK_ENTRY");
  const approvedZero = resolveOvertime({ workerId: "worker-1", overtimeDate: "2026-08-10", overtimeRequests: [{ ...requests[0], id: "ot-zero", approvedMinutes: 0 }], workEntries: entries });
  assert.equal(approvedZero.overtimeMinutes, 0);
  assert.equal(approvedZero.source, "EXPLICIT_APPROVED");
});

test("normalization supplies deterministic defaults and keeps explicit minute overrides previewable", () => {
  const normalized = normalizeAttendanceRecord({ workerId: "worker-1", attendanceDate: "2026-08-10", scheduledStart: "09:00", scheduledEnd: "17:00", actualTimeIn: "09:10", actualTimeOut: "16:40" });
  assert.equal(normalized.valid, true);
  assert.equal(normalized.record?.attendanceStatus, "PRESENT");
  assert.equal(normalized.record?.lateMinutes, 10);
  assert.equal(normalized.record?.undertimeMinutes, 20);
  assert.equal(normalized.record?.regularMinutes, 450);
  const invalid = normalizeAttendanceRecord({ workerId: "worker-1", attendanceDate: "2026-08-10", regularMinutes: -4 });
  assert.equal(invalid.valid, false);
});
