/**
 * Pure workforce and attendance operations.
 *
 * This module deliberately stops at deterministic domain decisions. It does
 * not read storage, use the current clock, generate ids, or mutate callers'
 * arrays. Date-only values are parsed component-by-component and all date
 * arithmetic uses UTC so a browser timezone cannot move a roster boundary.
 */

import type {
  AttendanceRecord,
  AttendanceRecordStatus,
  AttendanceSource,
  AttendanceStatus,
  EmploymentStatus,
  LeavePartialDay,
  LeaveRequest,
  LeaveStatus,
  OvertimeRequest,
  OvertimeSource,
  OvertimeStatus,
  PayrollHoliday,
  WorkEntry,
  Worker,
} from "../types.ts";

export type DateOnly = string;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type WeekdayName = "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY";

export const DEFAULT_WORKING_DAYS = Object.freeze([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
] as const);

const WEEKDAY_NAMES: readonly WeekdayName[] = Object.freeze([
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
]);
const WEEKDAY_ALIASES: Record<string, Weekday> = {
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  SUN: 0,
  SUNDAY: 0,
  MON: 1,
  MONDAY: 1,
  TUE: 2,
  TUES: 2,
  TUESDAY: 2,
  WED: 3,
  WEDNESDAY: 3,
  THU: 4,
  THUR: 4,
  THURS: 4,
  THURSDAY: 4,
  FRI: 5,
  FRIDAY: 5,
  SAT: 6,
  SATURDAY: 6,
};
const EMPLOYMENT_STATUSES = new Set<EmploymentStatus>(["ACTIVE", "INACTIVE", "ONBOARDING", "OFFBOARDED"]);
const ATTENDANCE_STATUSES = new Set<AttendanceStatus>(["PRESENT", "ABSENT", "PARTIAL", "ON_LEAVE", "REST_DAY", "HOLIDAY", "OFFICIAL_BUSINESS"]);
const ATTENDANCE_RECORD_STATUSES = new Set<AttendanceRecordStatus>(["DRAFT", "CONFIRMED", "VOID"]);
const ATTENDANCE_SOURCES = new Set<AttendanceSource>(["MANUAL", "BULK", "IMPORT", "SYSTEM", "LEAVE"]);
const LEAVE_STATUSES = new Set<LeaveStatus>(["DRAFT", "PENDING", "APPROVED", "REJECTED", "CANCELLED"]);
const LEAVE_PARTIAL_DAYS = new Set<LeavePartialDay>(["FULL", "AM", "PM"]);
const OVERTIME_STATUSES = new Set<OvertimeStatus>(["DRAFT", "PENDING", "APPROVED", "REJECTED", "CANCELLED"]);
const OVERTIME_SOURCES = new Set<OvertimeSource>(["MANUAL", "IMPORT", "SYSTEM", "LEGACY_WORK_ENTRY"]);
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d+))?)?(Z|[+-][01]\d:[0-5]\d)?$/;

export interface WorkforceIssue {
  code: string;
  message: string;
  field?: string;
  workerId?: string;
  date?: DateOnly;
  recordId?: string;
  severity?: "ERROR" | "WARNING";
}

export interface WorkforceValidationResult {
  valid: boolean;
  errors: WorkforceIssue[];
  warnings: WorkforceIssue[];
  /** Combined, ordered issues for callers that use the existing payroll API style. */
  issues: WorkforceIssue[];
}

export interface DateOnlyValidationResult extends WorkforceValidationResult {
  value?: DateOnly;
}

function error(code: string, message: string, details: Omit<WorkforceIssue, "code" | "message" | "severity"> = {}): WorkforceIssue {
  return { code, message, ...details, severity: "ERROR" };
}

function warning(code: string, message: string, details: Omit<WorkforceIssue, "code" | "message" | "severity"> = {}): WorkforceIssue {
  return { code, message, ...details, severity: "WARNING" };
}

function validation(errors: WorkforceIssue[] = [], warnings: WorkforceIssue[] = []): WorkforceValidationResult {
  return { valid: errors.length === 0, errors, warnings, issues: [...errors, ...warnings] };
}

function appendIssues(target: WorkforceIssue[], source: WorkforceIssue[]): void {
  const seen = new Set(target.map((issue) => `${issue.code}|${issue.field || ""}|${issue.workerId || ""}|${issue.date || ""}|${issue.message}`));
  for (const issue of source) {
    const key = `${issue.code}|${issue.field || ""}|${issue.workerId || ""}|${issue.date || ""}|${issue.message}`;
    if (!seen.has(key)) {
      target.push(issue);
      seen.add(key);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function formatDateOnly(date: Date): DateOnly {
  return date.toISOString().slice(0, 10);
}

/** Returns true only for a real calendar date written as exactly YYYY-MM-DD. */
export function isValidDateOnly(value: unknown): value is DateOnly {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = utcDate(year, month, day);
  return Number.isFinite(date.getTime())
    && date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && formatDateOnly(date) === value;
}

export function validateDateOnly(value: unknown, field = "date"): DateOnlyValidationResult {
  if (isValidDateOnly(value)) return { ...validation(), value };
  return {
    ...validation([error("INVALID_DATE_ONLY", `${field} must be a valid YYYY-MM-DD date.`, { field })]),
  };
}

export function assertValidDateOnly(value: unknown, field = "date"): asserts value is DateOnly {
  const result = validateDateOnly(value, field);
  if (!result.valid) throw new Error(result.errors[0]?.message || `${field} must be a valid YYYY-MM-DD date.`);
}

export function compareDateOnly(left: DateOnly, right: DateOnly): -1 | 0 | 1 {
  assertValidDateOnly(left, "left");
  assertValidDateOnly(right, "right");
  return left < right ? -1 : left > right ? 1 : 0;
}

export function addDateDays(date: DateOnly, days: number): DateOnly {
  assertValidDateOnly(date, "date");
  if (!Number.isInteger(days)) throw new Error("days must be an integer.");
  const result = utcDate(...date.split("-").map(Number) as [number, number, number]);
  result.setUTCDate(result.getUTCDate() + days);
  return formatDateOnly(result);
}

export function daysBetweenDates(start: DateOnly, end: DateOnly): number {
  assertValidDateOnly(start, "start");
  assertValidDateOnly(end, "end");
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  return Math.round((utcDate(endYear, endMonth, endDay).getTime() - utcDate(startYear, startMonth, startDay).getTime()) / MS_PER_DAY);
}

export function getWeekday(date: DateOnly): Weekday {
  assertValidDateOnly(date, "date");
  const [year, month, day] = date.split("-").map(Number);
  return utcDate(year, month, day).getUTCDay() as Weekday;
}

export const addDateOnlyDays = addDateDays;
export const dateDaysBetween = daysBetweenDates;

function normalizeWeekday(value: unknown): Weekday | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6) return value as Weekday;
  if (typeof value !== "string") return undefined;
  return WEEKDAY_ALIASES[value.trim().toUpperCase()];
}

function weekdayName(value: Weekday): WeekdayName {
  return WEEKDAY_NAMES[value];
}

function parseTimeOnly(value: unknown): { minutes: number; normalized: string } | undefined {
  if (typeof value !== "string" || !TIME_ONLY.test(value)) return undefined;
  const [hourText, minuteText, secondText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = secondText ? Number(secondText) : 0;
  return { minutes: hour * 60 + minute + second / 60, normalized: `${hourText}:${minuteText}${secondText ? `:${secondText}` : ""}` };
}

interface ParsedDateTime {
  date: DateOnly;
  clockMinutes: number;
  absoluteMinutes: number;
  hasDate: true;
}

interface ParsedClock {
  clockMinutes: number;
  hasDate: false;
}

type ParsedTimeValue = ParsedDateTime | ParsedClock;

function parseTimeValue(value: unknown): ParsedTimeValue | undefined {
  const time = parseTimeOnly(value);
  if (time) return { clockMinutes: time.minutes, hasDate: false };
  if (typeof value !== "string") return undefined;
  const match = DATE_TIME.exec(value);
  if (!match || !isValidDateOnly(match[1])) return undefined;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4] || 0);
  const fraction = match[5] ? Number(`0.${match[5]}`) : 0;
  const [year, month, day] = match[1].split("-").map(Number);
  const base = utcDate(year, month, day);
  base.setUTCHours(hour, minute, second, Math.round(fraction * 1000));
  const suffix = match[6];
  let absoluteMilliseconds = base.getTime();
  if (suffix && suffix !== "Z") {
    const sign = suffix[0] === "+" ? 1 : -1;
    const offset = Number(suffix.slice(1, 3)) * 60 + Number(suffix.slice(4, 6));
    absoluteMilliseconds -= sign * offset * MS_PER_MINUTE;
  }
  return {
    date: match[1],
    clockMinutes: hour * 60 + minute + second / 60 + fraction / 60,
    absoluteMinutes: absoluteMilliseconds / MS_PER_MINUTE,
    hasDate: true,
  };
}

function roundedMinutes(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function normalizeNonNegativeMinutes(value: unknown, field: string, issues: WorkforceIssue[]): number {
  if (value === undefined || value === null || value === "") return 0;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    issues.push(error("INVALID_MINUTES", `${field} must be a finite number.`, { field }));
    return 0;
  }
  if (numberValue < 0) {
    issues.push(error("NEGATIVE_MINUTES", `${field} cannot be negative; it was clamped to zero for preview.`, { field }));
    return 0;
  }
  return roundedMinutes(numberValue);
}

function dateDifferenceInMinutes(start: ParsedDateTime, end: ParsedDateTime): number {
  return end.absoluteMinutes - start.absoluteMinutes;
}

function clockDifferenceInMinutes(start: ParsedTimeValue, end: ParsedTimeValue, allowOvernight: boolean): number {
  if (start.hasDate !== end.hasDate) return Number.NaN;
  if (start.hasDate && end.hasDate) {
    const difference = dateDifferenceInMinutes(start, end);
    if (difference > 0) return difference;
    return allowOvernight && difference === 0 ? 0 : Number.NaN;
  }
  let difference = end.clockMinutes - start.clockMinutes;
  if (difference < 0 && allowOvernight) difference += 24 * 60;
  return difference;
}

export interface AttendanceMinutesInput {
  attendanceDate?: DateOnly;
  scheduledStart?: string;
  scheduledEnd?: string;
  /** Used when schedule times are unavailable. Time-derived duration wins when both times exist. */
  scheduledMinutes?: number;
  breakMinutes?: number;
  actualTimeIn?: string;
  actualTimeOut?: string;
}

export interface AttendanceMinutesResult extends WorkforceValidationResult {
  scheduledMinutes: number;
  breakMinutes: number;
  workedMinutes: number;
  regularMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  overtimeMinutes: number;
}

/**
 * Derives minute fields from a schedule and actual clock values. Regular work
 * is the clamped overlap with the scheduled window after the break; late and
 * undertime are deviations at the two schedule edges, and overtime is only
 * time after scheduled end. Time-only values support a cross-midnight shift.
 */
export function deriveAttendanceMinutes(input: AttendanceMinutesInput): AttendanceMinutesResult {
  const errors: WorkforceIssue[] = [];
  const warnings: WorkforceIssue[] = [];
  if (input.attendanceDate !== undefined && !isValidDateOnly(input.attendanceDate)) {
    errors.push(error("INVALID_DATE_ONLY", "attendanceDate must be a valid YYYY-MM-DD date.", { field: "attendanceDate" }));
  }

  const breakMinutes = normalizeNonNegativeMinutes(input.breakMinutes, "breakMinutes", errors);
  const scheduledStart = input.scheduledStart === undefined ? undefined : parseTimeValue(input.scheduledStart);
  const scheduledEnd = input.scheduledEnd === undefined ? undefined : parseTimeValue(input.scheduledEnd);
  let rawScheduledMinutes = Number.isFinite(Number(input.scheduledMinutes)) ? Math.max(0, Number(input.scheduledMinutes)) : 0;
  let scheduleStartMinutes: number | undefined;
  let scheduleEndMinutes: number | undefined;

  if ((input.scheduledStart === undefined) !== (input.scheduledEnd === undefined)) {
    errors.push(error("INCOMPLETE_SCHEDULE_TIMES", "scheduledStart and scheduledEnd must be provided together.", { field: "scheduledStart/scheduledEnd" }));
  } else if (input.scheduledStart !== undefined && input.scheduledEnd !== undefined) {
    if (!scheduledStart || !scheduledEnd) {
      errors.push(error("INVALID_TIME", "scheduledStart and scheduledEnd must be HH:mm, HH:mm:ss, or an explicit ISO timestamp.", { field: "scheduledStart/scheduledEnd" }));
    } else if (scheduledStart.hasDate !== scheduledEnd.hasDate) {
      errors.push(error("MIXED_TIME_SHAPES", "Schedule start and end must both be time-only or both be dated timestamps.", { field: "scheduledStart/scheduledEnd" }));
    } else {
      const difference = clockDifferenceInMinutes(scheduledStart, scheduledEnd, !scheduledStart.hasDate);
      if (!Number.isFinite(difference) || difference <= 0) {
        errors.push(error("INVALID_SCHEDULE_RANGE", "scheduledEnd must be after scheduledStart; equal dated times are not a schedule.", { field: "scheduledStart/scheduledEnd" }));
      } else {
        rawScheduledMinutes = difference;
        scheduleStartMinutes = scheduledStart.hasDate ? scheduledStart.absoluteMinutes : scheduledStart.clockMinutes;
        scheduleEndMinutes = scheduledEnd.hasDate ? scheduledEnd.absoluteMinutes : scheduledStart.clockMinutes + difference;
      }
    }
  }

  const scheduledMinutes = Math.max(0, roundedMinutes(rawScheduledMinutes - Math.min(breakMinutes, rawScheduledMinutes)));
  const actualIn = input.actualTimeIn === undefined ? undefined : parseTimeValue(input.actualTimeIn);
  const actualOut = input.actualTimeOut === undefined ? undefined : parseTimeValue(input.actualTimeOut);
  let workedMinutes = 0;
  let regularMinutes = 0;
  let lateMinutes = 0;
  let undertimeMinutes = 0;
  let overtimeMinutes = 0;

  if ((input.actualTimeIn === undefined) !== (input.actualTimeOut === undefined)) {
    errors.push(error("INCOMPLETE_ACTUAL_TIMES", "actualTimeIn and actualTimeOut must be provided together.", { field: "actualTimeIn/actualTimeOut" }));
  } else if (input.actualTimeIn !== undefined && input.actualTimeOut !== undefined) {
    if (!actualIn || !actualOut) {
      errors.push(error("INVALID_TIME", "actualTimeIn and actualTimeOut must be HH:mm, HH:mm:ss, or an explicit ISO timestamp.", { field: "actualTimeIn/actualTimeOut" }));
    } else if (actualIn.hasDate !== actualOut.hasDate) {
      errors.push(error("MIXED_TIME_SHAPES", "Actual time in and out must both be time-only or both be dated timestamps.", { field: "actualTimeIn/actualTimeOut" }));
    } else {
      let actualStartMinutes: number;
      let actualEndMinutes: number;
      if (actualIn.hasDate) {
        const difference = dateDifferenceInMinutes(actualIn, actualOut as ParsedDateTime);
        if (!Number.isFinite(difference) || difference <= 0) {
          errors.push(error("INVALID_ACTUAL_RANGE", "actualTimeOut must be after actualTimeIn.", { field: "actualTimeIn/actualTimeOut" }));
          actualStartMinutes = actualIn.absoluteMinutes;
          actualEndMinutes = actualStartMinutes;
        } else {
          actualStartMinutes = actualIn.absoluteMinutes;
          actualEndMinutes = actualStartMinutes + difference;
        }
      } else {
        actualStartMinutes = actualIn.clockMinutes;
        actualEndMinutes = actualOut.clockMinutes;
        if (actualEndMinutes <= actualStartMinutes) actualEndMinutes += 24 * 60;
      }
      const rawWorked = Math.max(0, actualEndMinutes - actualStartMinutes);
      workedMinutes = roundedMinutes(rawWorked - Math.min(breakMinutes, rawWorked));

      if (scheduleStartMinutes !== undefined && scheduleEndMinutes !== undefined && rawScheduledMinutes > 0) {
        const overlap = Math.max(0, Math.min(actualEndMinutes, scheduleEndMinutes) - Math.max(actualStartMinutes, scheduleStartMinutes));
        regularMinutes = Math.min(scheduledMinutes, roundedMinutes(overlap - Math.min(breakMinutes, overlap)));
        lateMinutes = Math.min(scheduledMinutes, roundedMinutes(Math.max(0, actualStartMinutes - scheduleStartMinutes)));
        undertimeMinutes = Math.min(scheduledMinutes, roundedMinutes(Math.max(0, scheduleEndMinutes - actualEndMinutes)));
        overtimeMinutes = roundedMinutes(Math.max(0, actualEndMinutes - scheduleEndMinutes));
      } else {
        regularMinutes = Math.min(scheduledMinutes, workedMinutes);
      }
    }
  }

  return {
    ...validation(errors, warnings),
    scheduledMinutes,
    breakMinutes: Math.min(breakMinutes, roundedMinutes(rawScheduledMinutes)),
    workedMinutes,
    regularMinutes: Math.max(0, Math.min(regularMinutes, scheduledMinutes)),
    lateMinutes: Math.max(0, Math.min(lateMinutes, scheduledMinutes)),
    undertimeMinutes: Math.max(0, Math.min(undertimeMinutes, scheduledMinutes)),
    overtimeMinutes: Math.max(0, overtimeMinutes),
  };
}

export const deriveWorkMinutes = deriveAttendanceMinutes;
export const calculateAttendanceMinutes = deriveAttendanceMinutes;

export interface WorkforceWorker {
  id: string;
  active?: boolean;
  employmentStatus?: EmploymentStatus;
  hireDate?: DateOnly;
  endDate?: DateOnly;
  workingDays?: readonly string[];
  workingHoursStart?: string;
  workingHoursEnd?: string;
  employeeCode?: string;
  displayName?: string;
}

export type WorkerScheduleInput = WorkforceWorker | Worker;

export interface WorkforceContext {
  holidays?: readonly PayrollHoliday[];
  leaveRequests?: readonly LeaveRequest[];
  /** Aliases make the pure helpers convenient for callers that already split their context. */
  leaves?: readonly LeaveRequest[];
  approvedLeaves?: readonly LeaveRequest[];
}

export type WorkerScheduleExclusionReason =
  | "INVALID_WORKER"
  | "INACTIVE"
  | "EMPLOYMENT_STATUS"
  | "BEFORE_HIRE_DATE"
  | "AFTER_END_DATE"
  | "REST_DAY"
  | "HOLIDAY"
  | "ON_LEAVE"
  | "HOLIDAY_AND_LEAVE"
  | "INVALID_SCHEDULE";

export interface WorkerScheduleEvaluation extends WorkforceValidationResult {
  workerId: string;
  date: DateOnly;
  eligible: boolean;
  workingDay: boolean;
  normallyExpected: boolean;
  expected: boolean;
  scheduled: boolean;
  weekday?: WeekdayName;
  scheduledStart?: string;
  scheduledEnd?: string;
  scheduledMinutes: number;
  holiday?: PayrollHoliday;
  approvedLeave?: LeaveRequest;
  approvedLeaves: LeaveRequest[];
  exclusionReasons: WorkerScheduleExclusionReason[];
}

function leaveListFromContext(context: WorkforceContext = {}): readonly LeaveRequest[] {
  if (context.leaveRequests) return context.leaveRequests;
  if (context.leaves) return context.leaves;
  return context.approvedLeaves || [];
}

function sameCompany(left: { companyId?: string }, right: { companyId?: string }): boolean {
  return !left.companyId || !right.companyId || left.companyId === right.companyId;
}

function leaveCoversDate(leave: Pick<LeaveRequest, "startDate" | "endDate">, date: DateOnly): boolean {
  return isValidDateOnly(leave.startDate) && isValidDateOnly(leave.endDate) && leave.startDate <= date && date <= leave.endDate;
}

function leaveIsFullDay(leave: Pick<LeaveRequest, "partialDay">): boolean {
  return !leave.partialDay || leave.partialDay === "FULL";
}

function approvedLeavesForDate(workerId: string, date: DateOnly, leaves: readonly LeaveRequest[]): LeaveRequest[] {
  return leaves
    .filter((leave) => leave.workerId === workerId && leave.status === "APPROVED" && leaveCoversDate(leave, date))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function getApprovedLeaveForDate(workerId: string, date: DateOnly, leaves: readonly LeaveRequest[]): LeaveRequest | undefined {
  assertValidDateOnly(date, "date");
  return approvedLeavesForDate(workerId, date, leaves)[0];
}

export function getApprovedLeavesForDate(workerId: string, date: DateOnly, leaves: readonly LeaveRequest[]): LeaveRequest[] {
  assertValidDateOnly(date, "date");
  return approvedLeavesForDate(workerId, date, leaves);
}

export const approvedLeaveForDate = getApprovedLeaveForDate;
export const approvedLeavesOnDate = getApprovedLeavesForDate;

export function isDateOnApprovedLeave(workerId: string, date: DateOnly, leaves: readonly LeaveRequest[]): boolean {
  return getApprovedLeavesForDate(workerId, date, leaves).length > 0;
}

export function isFullyOnApprovedLeave(workerId: string, date: DateOnly, leaves: readonly LeaveRequest[]): boolean {
  return getApprovedLeavesForDate(workerId, date, leaves).some(leaveIsFullDay);
}

export const isWorkerOnApprovedLeave = isDateOnApprovedLeave;

export function getHolidayForDate(date: DateOnly, holidays: readonly PayrollHoliday[]): PayrollHoliday | undefined {
  assertValidDateOnly(date, "date");
  return holidays
    .filter((holiday) => holiday.active === true && holiday.holidayDate === date)
    .sort((left, right) => left.id.localeCompare(right.id))[0];
}

export function isHolidayDate(date: DateOnly, holidays: readonly PayrollHoliday[]): boolean {
  return getHolidayForDate(date, holidays) !== undefined;
}

export const isPayrollHoliday = isHolidayDate;

function workerWorkingDays(worker: WorkforceWorker, issues: WorkforceIssue[]): Set<Weekday> {
  const values = worker.workingDays === undefined ? DEFAULT_WORKING_DAYS : worker.workingDays;
  const result = new Set<Weekday>();
  for (const value of values) {
    const parsed = normalizeWeekday(value);
    if (parsed === undefined) issues.push(error("INVALID_WORKING_DAY", `workingDays contains an invalid weekday: ${String(value)}.`, { field: "workingDays", workerId: worker.id }));
    else result.add(parsed);
  }
  return result;
}

function scheduleMinutesForWorker(worker: WorkforceWorker, date: DateOnly, issues: WorkforceIssue[]): number {
  if (worker.workingHoursStart === undefined && worker.workingHoursEnd === undefined) return 0;
  if ((worker.workingHoursStart === undefined) !== (worker.workingHoursEnd === undefined)) {
    issues.push(error("INCOMPLETE_WORKING_HOURS", "workingHoursStart and workingHoursEnd must be provided together.", { field: "workingHoursStart/workingHoursEnd", workerId: worker.id, date }));
    return 0;
  }
  const result = deriveAttendanceMinutes({
    attendanceDate: date,
    scheduledStart: worker.workingHoursStart,
    scheduledEnd: worker.workingHoursEnd,
  });
  appendIssues(issues, result.errors);
  return result.valid ? result.scheduledMinutes : 0;
}

export function evaluateWorkerSchedule(worker: WorkforceWorker, date: DateOnly, context: WorkforceContext = {}): WorkerScheduleEvaluation {
  const errors: WorkforceIssue[] = [];
  const warnings: WorkforceIssue[] = [];
  const workerId = typeof worker?.id === "string" ? worker.id : "";
  const dateResult = validateDateOnly(date, "date");
  if (!dateResult.valid) appendIssues(errors, dateResult.errors);
  if (!workerId) errors.push(error("MISSING_WORKER_ID", "worker.id is required.", { field: "worker.id" }));

  const fallbackDate = isValidDateOnly(date) ? date : "0000-01-01";
  const weekday = isValidDateOnly(date) ? weekdayName(getWeekday(date)) : undefined;
  const exclusionReasons: WorkerScheduleExclusionReason[] = [];
  let eligible = errors.length === 0;
  if (worker.active === false) {
    eligible = false;
    exclusionReasons.push("INACTIVE");
  }
  if (worker.employmentStatus !== undefined) {
    if (!EMPLOYMENT_STATUSES.has(worker.employmentStatus)) {
      errors.push(error("INVALID_EMPLOYMENT_STATUS", "employmentStatus is invalid.", { field: "employmentStatus", workerId }));
      eligible = false;
    } else if (worker.employmentStatus !== "ACTIVE") {
      eligible = false;
      exclusionReasons.push("EMPLOYMENT_STATUS");
    }
  }
  if (worker.hireDate !== undefined) {
    if (!isValidDateOnly(worker.hireDate)) errors.push(error("INVALID_DATE_ONLY", "hireDate must be a valid YYYY-MM-DD date.", { field: "hireDate", workerId }));
    else if (isValidDateOnly(date) && date < worker.hireDate) {
      eligible = false;
      exclusionReasons.push("BEFORE_HIRE_DATE");
    }
  }
  if (worker.endDate !== undefined) {
    if (!isValidDateOnly(worker.endDate)) errors.push(error("INVALID_DATE_ONLY", "endDate must be a valid YYYY-MM-DD date.", { field: "endDate", workerId }));
    else if (isValidDateOnly(date) && date > worker.endDate) {
      eligible = false;
      exclusionReasons.push("AFTER_END_DATE");
    }
  }
  if (worker.hireDate && worker.endDate && isValidDateOnly(worker.hireDate) && isValidDateOnly(worker.endDate) && worker.hireDate > worker.endDate) {
    errors.push(error("INVALID_EMPLOYMENT_RANGE", "hireDate cannot be after endDate.", { field: "hireDate/endDate", workerId }));
    eligible = false;
  }

  const workingDaySet = workerWorkingDays(worker, errors);
  const workingDay = weekday === undefined ? false : workingDaySet.has(getWeekday(fallbackDate));
  if (eligible && !workingDay) exclusionReasons.push("REST_DAY");
  const normallyExpected = eligible && workingDay;
  const holiday = isValidDateOnly(date) ? getHolidayForDate(date, context.holidays || []) : undefined;
  const approvedLeaves = isValidDateOnly(date) ? approvedLeavesForDate(workerId, date, leaveListFromContext(context)) : [];
  const fullLeave = approvedLeaves.some(leaveIsFullDay);
  if (holiday && fullLeave) exclusionReasons.push("HOLIDAY_AND_LEAVE");
  else if (holiday) exclusionReasons.push("HOLIDAY");
  else if (fullLeave) exclusionReasons.push("ON_LEAVE");
  const expected = normallyExpected && !holiday && !fullLeave;
  const scheduleIssues: WorkforceIssue[] = [];
  const scheduledMinutes = scheduleMinutesForWorker(worker, fallbackDate, scheduleIssues);
  appendIssues(errors, scheduleIssues);
  const scheduleValid = scheduleIssues.length === 0;
  const scheduled = expected && scheduleValid;
  if (expected && !scheduleValid) exclusionReasons.push("INVALID_SCHEDULE");
  return {
    ...validation(errors, warnings),
    workerId,
    date,
    eligible,
    workingDay,
    normallyExpected,
    expected,
    scheduled,
    weekday,
    scheduledStart: worker.workingHoursStart,
    scheduledEnd: worker.workingHoursEnd,
    scheduledMinutes,
    holiday,
    approvedLeave: approvedLeaves[0],
    approvedLeaves,
    exclusionReasons: [...new Set(exclusionReasons)],
  };
}

export function isWorkerActiveForDate(worker: WorkforceWorker, date: DateOnly): boolean {
  return evaluateWorkerSchedule(worker, date).eligible;
}

export function isWorkerExpectedOnDate(worker: WorkforceWorker, date: DateOnly, context: WorkforceContext = {}): boolean {
  return evaluateWorkerSchedule(worker, date, context).expected;
}

export function isWorkerScheduledForDate(worker: WorkforceWorker, date: DateOnly, context: WorkforceContext = {}): boolean {
  return evaluateWorkerSchedule(worker, date, context).scheduled;
}

export const workerExpectedOnDate = isWorkerExpectedOnDate;
export const workerScheduledOnDate = isWorkerScheduledForDate;

export interface WorkerScheduleSnapshot extends WorkerScheduleEvaluation {
  status: "SCHEDULED" | "REST_DAY" | "HOLIDAY" | "ON_LEAVE" | "INACTIVE" | "OUTSIDE_EMPLOYMENT" | "INVALID";
  approvedLeaveIds: string[];
  holidayId?: string;
}

function scheduleStatus(evaluation: WorkerScheduleEvaluation): WorkerScheduleSnapshot["status"] {
  if (!evaluation.valid) return "INVALID";
  if (evaluation.scheduled) return "SCHEDULED";
  if (evaluation.holiday) return "HOLIDAY";
  if (evaluation.approvedLeaves.some(leaveIsFullDay)) return "ON_LEAVE";
  if (evaluation.exclusionReasons.includes("INACTIVE") || evaluation.exclusionReasons.includes("EMPLOYMENT_STATUS")) return "INACTIVE";
  if (evaluation.exclusionReasons.includes("BEFORE_HIRE_DATE") || evaluation.exclusionReasons.includes("AFTER_END_DATE")) return "OUTSIDE_EMPLOYMENT";
  return "REST_DAY";
}

export function createWorkerScheduleSnapshot(worker: WorkforceWorker, date: DateOnly, context: WorkforceContext = {}): WorkerScheduleSnapshot {
  const evaluation = evaluateWorkerSchedule(worker, date, context);
  return {
    ...evaluation,
    status: scheduleStatus(evaluation),
    approvedLeaveIds: evaluation.approvedLeaves.map((leave) => leave.id),
    holidayId: evaluation.holiday?.id,
  };
}

export const buildWorkerScheduleSnapshot = createWorkerScheduleSnapshot;
export const snapshotWorkerSchedule = createWorkerScheduleSnapshot;

export interface DailyRosterItem {
  workerId: string;
  date: DateOnly;
  worker: WorkforceWorker;
  displayName?: string;
  employeeCode?: string;
  status: "SCHEDULED";
  expected: true;
  scheduled: true;
  scheduledStart?: string;
  scheduledEnd?: string;
  scheduledMinutes: number;
  breakMinutes: number;
  holiday?: PayrollHoliday;
  approvedLeave?: LeaveRequest;
  approvedLeaves: LeaveRequest[];
}

export interface DailyRosterExclusion {
  workerId: string;
  date: DateOnly;
  status: WorkerScheduleSnapshot["status"];
  reasons: WorkerScheduleExclusionReason[];
  holiday?: PayrollHoliday;
  approvedLeaves: LeaveRequest[];
}

export interface DailyRosterInput extends WorkforceContext {
  date: DateOnly;
  workers: readonly WorkforceWorker[];
}

export interface DailyRoster extends WorkforceValidationResult {
  date: DateOnly;
  items: DailyRosterItem[];
  excluded: DailyRosterExclusion[];
  snapshots: WorkerScheduleSnapshot[];
}

function asDailyRosterInput(inputOrWorkers: DailyRosterInput | readonly WorkforceWorker[], date?: DateOnly, context: WorkforceContext = {}): DailyRosterInput {
  if (Array.isArray(inputOrWorkers)) return { ...context, date: date as DateOnly, workers: inputOrWorkers };
  return inputOrWorkers as DailyRosterInput;
}

export function buildDailyRoster(input: DailyRosterInput): DailyRoster;
export function buildDailyRoster(workers: readonly WorkforceWorker[], date: DateOnly, context?: WorkforceContext): DailyRoster;
export function buildDailyRoster(inputOrWorkers: DailyRosterInput | readonly WorkforceWorker[], date?: DateOnly, context: WorkforceContext = {}): DailyRoster {
  const input = asDailyRosterInput(inputOrWorkers, date, context);
  const errors: WorkforceIssue[] = [];
  const warnings: WorkforceIssue[] = [];
  const dateResult = validateDateOnly(input.date, "date");
  appendIssues(errors, dateResult.errors);
  const snapshots = dateResult.valid
    ? input.workers.map((worker) => createWorkerScheduleSnapshot(worker, input.date, input))
    : [];
  const seenWorkerIds = new Set<string>();
  for (const snapshot of snapshots) {
    appendIssues(errors, snapshot.errors);
    appendIssues(warnings, snapshot.warnings);
    if (seenWorkerIds.has(snapshot.workerId)) errors.push(error("DUPLICATE_WORKER_ID", `Worker ${snapshot.workerId} appears more than once in the roster input.`, { workerId: snapshot.workerId, date: input.date }));
    seenWorkerIds.add(snapshot.workerId);
  }
  const items: DailyRosterItem[] = [];
  const excluded: DailyRosterExclusion[] = [];
  snapshots.forEach((snapshot, index) => {
    const worker = input.workers[index];
    if (snapshot.scheduled) {
      items.push({
        workerId: snapshot.workerId,
        date: snapshot.date,
        worker,
        displayName: worker.displayName,
        employeeCode: worker.employeeCode,
        status: "SCHEDULED",
        expected: true,
        scheduled: true,
        scheduledStart: snapshot.scheduledStart,
        scheduledEnd: snapshot.scheduledEnd,
        scheduledMinutes: snapshot.scheduledMinutes,
        breakMinutes: 0,
        holiday: snapshot.holiday,
        approvedLeave: snapshot.approvedLeave,
        approvedLeaves: [...snapshot.approvedLeaves],
      });
    } else {
      excluded.push({
        workerId: snapshot.workerId,
        date: snapshot.date,
        status: snapshot.status,
        reasons: [...snapshot.exclusionReasons],
        holiday: snapshot.holiday,
        approvedLeaves: [...snapshot.approvedLeaves],
      });
    }
  });
  return { ...validation(errors, warnings), date: input.date, items, excluded, snapshots };
}

export function buildDailyRosterItems(input: DailyRosterInput): DailyRosterItem[];
export function buildDailyRosterItems(workers: readonly WorkforceWorker[], date: DateOnly, context?: WorkforceContext): DailyRosterItem[];
export function buildDailyRosterItems(inputOrWorkers: DailyRosterInput | readonly WorkforceWorker[], date?: DateOnly, context: WorkforceContext = {}): DailyRosterItem[] {
  const roster = Array.isArray(inputOrWorkers)
    ? buildDailyRoster(inputOrWorkers, date as DateOnly, context)
    : buildDailyRoster(inputOrWorkers as DailyRosterInput);
  return roster.items;
}

export interface ScheduleSnapshot extends WorkforceValidationResult {
  date: DateOnly;
  workers: WorkerScheduleSnapshot[];
  rosterItems: DailyRosterItem[];
}

export function buildScheduleSnapshots(input: DailyRosterInput): WorkerScheduleSnapshot[];
export function buildScheduleSnapshots(workers: readonly WorkforceWorker[], date: DateOnly, context?: WorkforceContext): WorkerScheduleSnapshot[];
export function buildScheduleSnapshots(inputOrWorkers: DailyRosterInput | readonly WorkforceWorker[], date?: DateOnly, context: WorkforceContext = {}): WorkerScheduleSnapshot[] {
  const roster = Array.isArray(inputOrWorkers)
    ? buildDailyRoster(inputOrWorkers, date as DateOnly, context)
    : buildDailyRoster(inputOrWorkers as DailyRosterInput);
  return roster.snapshots;
}

export function buildScheduleSnapshot(input: DailyRosterInput): ScheduleSnapshot;
export function buildScheduleSnapshot(workers: readonly WorkforceWorker[], date: DateOnly, context?: WorkforceContext): ScheduleSnapshot;
export function buildScheduleSnapshot(inputOrWorkers: DailyRosterInput | readonly WorkforceWorker[], date?: DateOnly, context: WorkforceContext = {}): ScheduleSnapshot {
  const roster = Array.isArray(inputOrWorkers)
    ? buildDailyRoster(inputOrWorkers, date as DateOnly, context)
    : buildDailyRoster(inputOrWorkers as DailyRosterInput);
  return {
    ...validation(roster.errors, roster.warnings),
    date: roster.date,
    workers: roster.snapshots,
    rosterItems: roster.items,
  };
}

export const createScheduleSnapshot = buildScheduleSnapshot;

export interface LeaveValidationResult extends WorkforceValidationResult {
  leave?: LeaveRequest;
}

export function validateLeaveRequest(leave: Partial<LeaveRequest>): LeaveValidationResult {
  const errors: WorkforceIssue[] = [];
  const warnings: WorkforceIssue[] = [];
  if (!isRecord(leave)) errors.push(error("INVALID_LEAVE", "Leave request must be an object."));
  if (!leave?.id) errors.push(error("MISSING_LEAVE_ID", "Leave request id is required.", { field: "id" }));
  if (!leave?.workerId) errors.push(error("MISSING_WORKER_ID", "Leave request workerId is required.", { field: "workerId" }));
  if (!leave?.leaveType) errors.push(error("MISSING_LEAVE_TYPE", "Leave request leaveType is required.", { field: "leaveType" }));
  if (!isValidDateOnly(leave?.startDate)) errors.push(error("INVALID_DATE_ONLY", "Leave startDate must be a valid YYYY-MM-DD date.", { field: "startDate" }));
  if (!isValidDateOnly(leave?.endDate)) errors.push(error("INVALID_DATE_ONLY", "Leave endDate must be a valid YYYY-MM-DD date.", { field: "endDate" }));
  if (isValidDateOnly(leave?.startDate) && isValidDateOnly(leave?.endDate) && leave.startDate > leave.endDate) errors.push(error("INVALID_LEAVE_RANGE", "Leave startDate cannot be after endDate.", { field: "startDate/endDate", workerId: leave.workerId }));
  if (leave?.partialDay !== undefined && !LEAVE_PARTIAL_DAYS.has(leave.partialDay)) errors.push(error("INVALID_LEAVE_PARTIAL_DAY", "partialDay must be FULL, AM, or PM.", { field: "partialDay" }));
  if (leave?.status !== undefined && !LEAVE_STATUSES.has(leave.status)) errors.push(error("INVALID_LEAVE_STATUS", "Leave status is invalid.", { field: "status" }));
  if (leave?.paid !== undefined && typeof leave.paid !== "boolean") errors.push(error("INVALID_LEAVE_PAID_FLAG", "paid must be boolean when provided.", { field: "paid" }));
  return { ...validation(errors, warnings), leave: leave as LeaveRequest };
}

export function getLeaveDates(leave: Pick<LeaveRequest, "startDate" | "endDate">): DateOnly[] {
  assertValidDateOnly(leave.startDate, "startDate");
  assertValidDateOnly(leave.endDate, "endDate");
  if (leave.startDate > leave.endDate) throw new Error("startDate cannot be after endDate.");
  const dates: DateOnly[] = [];
  for (let date = leave.startDate; date <= leave.endDate; date = addDateDays(date, 1)) dates.push(date);
  return dates;
}

export const expandLeaveDates = getLeaveDates;
export const leaveDates = getLeaveDates;

function leaveDateOverlap(left: LeaveRequest, right: LeaveRequest): boolean {
  if (left.workerId !== right.workerId || !sameCompany(left, right)) return false;
  if (!isValidDateOnly(left.startDate) || !isValidDateOnly(left.endDate) || !isValidDateOnly(right.startDate) || !isValidDateOnly(right.endDate)) return false;
  const start = left.startDate > right.startDate ? left.startDate : right.startDate;
  const end = left.endDate < right.endDate ? left.endDate : right.endDate;
  if (start > end) return false;
  if (left.partialDay === "AM" && right.partialDay === "PM") return false;
  if (left.partialDay === "PM" && right.partialDay === "AM") return false;
  return true;
}

export function leaveRequestsOverlap(left: LeaveRequest, right: LeaveRequest, includeInactive = false): boolean {
  if (!includeInactive && (!(["DRAFT", "PENDING", "APPROVED"] as LeaveStatus[]).includes(left.status) || !(["DRAFT", "PENDING", "APPROVED"] as LeaveStatus[]).includes(right.status))) return false;
  return leaveDateOverlap(left, right);
}

export interface LeaveOverlap {
  workerId: string;
  left: LeaveRequest;
  right: LeaveRequest;
  overlapStart: DateOnly;
  overlapEnd: DateOnly;
}

function overlapPair(left: LeaveRequest, right: LeaveRequest): LeaveOverlap | undefined {
  if (!leaveDateOverlap(left, right)) return undefined;
  return {
    workerId: left.workerId,
    left,
    right,
    overlapStart: left.startDate > right.startDate ? left.startDate : right.startDate,
    overlapEnd: left.endDate < right.endDate ? left.endDate : right.endDate,
  };
}

export function findLeaveOverlaps(requests: readonly LeaveRequest[], candidate?: LeaveRequest, includeInactive = false): LeaveOverlap[] {
  const source = includeInactive ? [...requests] : requests.filter((leave) => ["DRAFT", "PENDING", "APPROVED"].includes(leave.status));
  if (candidate) return source.filter((leave) => leave.id !== candidate.id && (includeInactive || ["DRAFT", "PENDING", "APPROVED"].includes(candidate.status))).map((leave) => overlapPair(leave, candidate)).filter((value): value is LeaveOverlap => Boolean(value));
  const overlaps: LeaveOverlap[] = [];
  for (let leftIndex = 0; leftIndex < source.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < source.length; rightIndex += 1) {
      const pair = overlapPair(source[leftIndex], source[rightIndex]);
      if (pair) overlaps.push(pair);
    }
  }
  return overlaps;
}

export const detectLeaveOverlaps = findLeaveOverlaps;

export function getApprovedLeaveDates(workerId: string, startDate: DateOnly, endDate: DateOnly, leaves: readonly LeaveRequest[]): DateOnly[] {
  assertValidDateOnly(startDate, "startDate");
  assertValidDateOnly(endDate, "endDate");
  if (startDate > endDate) throw new Error("startDate cannot be after endDate.");
  const dates = new Set<DateOnly>();
  for (const leave of leaves) {
    if (leave.workerId !== workerId || leave.status !== "APPROVED" || !isValidDateOnly(leave.startDate) || !isValidDateOnly(leave.endDate)) continue;
    const from = leave.startDate > startDate ? leave.startDate : startDate;
    const to = leave.endDate < endDate ? leave.endDate : endDate;
    if (from <= to) for (const date of getLeaveDates({ startDate: from, endDate: to })) dates.add(date);
  }
  return [...dates].sort();
}

export const approvedLeaveDates = getApprovedLeaveDates;

export type AttendanceRecordInput = Partial<AttendanceRecord> & Pick<AttendanceRecord, "workerId" | "attendanceDate">;

export type NormalizedAttendanceRecord = Omit<AttendanceRecord, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

export interface AttendanceNormalizationOptions {
  existing?: Partial<AttendanceRecord>;
  companyId?: string;
  defaultSource?: AttendanceSource;
  defaultRecordStatus?: AttendanceRecordStatus;
  defaultAttendanceStatus?: AttendanceStatus;
  deriveMinutes?: boolean;
}

export interface AttendanceNormalizationResult extends WorkforceValidationResult {
  record?: NormalizedAttendanceRecord;
  value?: NormalizedAttendanceRecord;
}

function definedEntries(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function enumValue<T extends string>(value: unknown, values: Set<T>, fallback: T, field: string, issues: WorkforceIssue[]): T {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string" && values.has(value as T)) return value as T;
  issues.push(error("INVALID_ENUM", `${field} is invalid.`, { field }));
  return fallback;
}

export function validateAttendanceRecord(record: Partial<AttendanceRecord>, options: { requirePersistenceFields?: boolean } = {}): WorkforceValidationResult {
  const errors: WorkforceIssue[] = [];
  const warnings: WorkforceIssue[] = [];
  if (!isRecord(record)) return { ...validation([error("INVALID_ATTENDANCE_RECORD", "Attendance record must be an object.")]) };
  if (!record.workerId) errors.push(error("MISSING_WORKER_ID", "Attendance workerId is required.", { field: "workerId" }));
  if (!isValidDateOnly(record.attendanceDate)) errors.push(error("INVALID_DATE_ONLY", "attendanceDate must be a valid YYYY-MM-DD date.", { field: "attendanceDate" }));
  if (options.requirePersistenceFields && !record.id) errors.push(error("MISSING_ATTENDANCE_ID", "Attendance id is required for a persisted record.", { field: "id" }));
  if (options.requirePersistenceFields && !record.createdAt) errors.push(error("MISSING_CREATED_AT", "createdAt is required for a persisted record.", { field: "createdAt" }));
  if (options.requirePersistenceFields && !record.updatedAt) errors.push(error("MISSING_UPDATED_AT", "updatedAt is required for a persisted record.", { field: "updatedAt" }));
  if (record.attendanceStatus !== undefined && !ATTENDANCE_STATUSES.has(record.attendanceStatus)) errors.push(error("INVALID_ATTENDANCE_STATUS", "attendanceStatus is invalid.", { field: "attendanceStatus" }));
  if (record.recordStatus !== undefined && !ATTENDANCE_RECORD_STATUSES.has(record.recordStatus)) errors.push(error("INVALID_RECORD_STATUS", "recordStatus is invalid.", { field: "recordStatus" }));
  if (record.source !== undefined && !ATTENDANCE_SOURCES.has(record.source)) errors.push(error("INVALID_ATTENDANCE_SOURCE", "source is invalid.", { field: "source" }));
  for (const field of ["scheduledMinutes", "breakMinutes", "regularMinutes", "lateMinutes", "undertimeMinutes", "overtimeMinutes"] as const) {
    const value = record[field];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) errors.push(error("INVALID_MINUTES", `${field} must be a non-negative integer.`, { field }));
  }
  if (record.paidDayFraction !== undefined && (!Number.isFinite(record.paidDayFraction) || record.paidDayFraction < 0 || record.paidDayFraction > 1)) errors.push(error("INVALID_PAID_DAY_FRACTION", "paidDayFraction must be between 0 and 1.", { field: "paidDayFraction" }));
  if ((record.scheduledStart === undefined) !== (record.scheduledEnd === undefined)) errors.push(error("INCOMPLETE_SCHEDULE_TIMES", "scheduledStart and scheduledEnd must be provided together.", { field: "scheduledStart/scheduledEnd" }));
  if (record.scheduledStart !== undefined && !parseTimeValue(record.scheduledStart)) errors.push(error("INVALID_TIME", "scheduledStart is not a supported time value.", { field: "scheduledStart" }));
  if (record.scheduledEnd !== undefined && !parseTimeValue(record.scheduledEnd)) errors.push(error("INVALID_TIME", "scheduledEnd is not a supported time value.", { field: "scheduledEnd" }));
  if ((record.actualTimeIn === undefined) !== (record.actualTimeOut === undefined)) errors.push(error("INCOMPLETE_ACTUAL_TIMES", "actualTimeIn and actualTimeOut must be provided together.", { field: "actualTimeIn/actualTimeOut" }));
  if (record.actualTimeIn !== undefined && !parseTimeValue(record.actualTimeIn)) errors.push(error("INVALID_TIME", "actualTimeIn is not a supported time value.", { field: "actualTimeIn" }));
  if (record.actualTimeOut !== undefined && !parseTimeValue(record.actualTimeOut)) errors.push(error("INVALID_TIME", "actualTimeOut is not a supported time value.", { field: "actualTimeOut" }));
  if (record.scheduledMinutes !== undefined && record.regularMinutes !== undefined && record.regularMinutes > record.scheduledMinutes) errors.push(error("REGULAR_MINUTES_EXCEED_SCHEDULE", "regularMinutes cannot exceed scheduledMinutes.", { field: "regularMinutes" }));
  if (record.scheduledMinutes !== undefined && record.lateMinutes !== undefined && record.lateMinutes > record.scheduledMinutes) errors.push(error("LATE_MINUTES_EXCEED_SCHEDULE", "lateMinutes cannot exceed scheduledMinutes.", { field: "lateMinutes" }));
  if (record.scheduledMinutes !== undefined && record.undertimeMinutes !== undefined && record.undertimeMinutes > record.scheduledMinutes) errors.push(error("UNDERTIME_MINUTES_EXCEED_SCHEDULE", "undertimeMinutes cannot exceed scheduledMinutes.", { field: "undertimeMinutes" }));
  return validation(errors, warnings);
}

export function normalizeAttendanceRecord(input: AttendanceRecordInput, options: AttendanceNormalizationOptions = {}): AttendanceNormalizationResult {
  const errors: WorkforceIssue[] = [];
  const warnings: WorkforceIssue[] = [];
  const existing = options.existing || {};
  const raw = { ...definedEntries(existing as Record<string, unknown>), ...definedEntries(input as Record<string, unknown>) } as Partial<AttendanceRecord>;
  if (raw.companyId === undefined && options.companyId !== undefined) raw.companyId = options.companyId;
  if (!raw.workerId) errors.push(error("MISSING_WORKER_ID", "Attendance workerId is required.", { field: "workerId" }));
  if (!isValidDateOnly(raw.attendanceDate)) errors.push(error("INVALID_DATE_ONLY", "attendanceDate must be a valid YYYY-MM-DD date.", { field: "attendanceDate" }));
  const attendanceDate = raw.attendanceDate as DateOnly;
  const source = enumValue(raw.source, ATTENDANCE_SOURCES, options.defaultSource || "MANUAL", "source", errors);
  const recordStatus = enumValue(raw.recordStatus, ATTENDANCE_RECORD_STATUSES, options.defaultRecordStatus || "DRAFT", "recordStatus", errors);
  const hasActualTimes = raw.actualTimeIn !== undefined || raw.actualTimeOut !== undefined;
  const attendanceStatus = enumValue(raw.attendanceStatus, ATTENDANCE_STATUSES, options.defaultAttendanceStatus || (hasActualTimes ? "PRESENT" : "ABSENT"), "attendanceStatus", errors);
  const breakMinutes = normalizeNonNegativeMinutes(raw.breakMinutes, "breakMinutes", errors);
  const explicitMinuteFields = new Set(["scheduledMinutes", "regularMinutes", "lateMinutes", "undertimeMinutes", "overtimeMinutes"].filter((field) => Object.prototype.hasOwnProperty.call(input, field)));
  const shouldDerive = options.deriveMinutes !== false;
  const derived = shouldDerive && (!options.existing || ['scheduledStart', 'scheduledEnd', 'breakMinutes', 'actualTimeIn', 'actualTimeOut'].some((field) => Object.prototype.hasOwnProperty.call(input, field))) ? deriveAttendanceMinutes({
    attendanceDate: isValidDateOnly(attendanceDate) ? attendanceDate : undefined,
    scheduledStart: raw.scheduledStart,
    scheduledEnd: raw.scheduledEnd,
    scheduledMinutes: raw.scheduledMinutes,
    breakMinutes,
    actualTimeIn: raw.actualTimeIn,
    actualTimeOut: raw.actualTimeOut,
  }) : undefined;
  if (derived) appendIssues(errors, derived.errors);
  const scheduledMinutes = explicitMinuteFields.has("scheduledMinutes")
    ? normalizeNonNegativeMinutes(raw.scheduledMinutes, "scheduledMinutes", errors)
    : derived?.scheduledMinutes ?? normalizeNonNegativeMinutes(raw.scheduledMinutes, "scheduledMinutes", errors);
  const regularMinutes = explicitMinuteFields.has("regularMinutes") ? normalizeNonNegativeMinutes(raw.regularMinutes, "regularMinutes", errors) : derived?.regularMinutes ?? normalizeNonNegativeMinutes(raw.regularMinutes, "regularMinutes", errors);
  const lateMinutes = explicitMinuteFields.has("lateMinutes") ? normalizeNonNegativeMinutes(raw.lateMinutes, "lateMinutes", errors) : derived?.lateMinutes ?? normalizeNonNegativeMinutes(raw.lateMinutes, "lateMinutes", errors);
  const undertimeMinutes = explicitMinuteFields.has("undertimeMinutes") ? normalizeNonNegativeMinutes(raw.undertimeMinutes, "undertimeMinutes", errors) : derived?.undertimeMinutes ?? normalizeNonNegativeMinutes(raw.undertimeMinutes, "undertimeMinutes", errors);
  const overtimeMinutes = explicitMinuteFields.has("overtimeMinutes") ? normalizeNonNegativeMinutes(raw.overtimeMinutes, "overtimeMinutes", errors) : derived?.overtimeMinutes ?? normalizeNonNegativeMinutes(raw.overtimeMinutes, "overtimeMinutes", errors);
  const paidDayFraction = raw.paidDayFraction === undefined
    ? attendanceStatus === "PRESENT" || attendanceStatus === "OFFICIAL_BUSINESS" ? 1 : attendanceStatus === "PARTIAL" ? 0.5 : 0
    : Number(raw.paidDayFraction);
  if (!Number.isFinite(paidDayFraction) || paidDayFraction < 0 || paidDayFraction > 1) errors.push(error("INVALID_PAID_DAY_FRACTION", "paidDayFraction must be between 0 and 1.", { field: "paidDayFraction" }));
  const record: NormalizedAttendanceRecord = {
    id: typeof raw.id === "string" ? raw.id : undefined,
    companyId: raw.companyId,
    workerId: raw.workerId as string,
    periodId: raw.periodId,
    attendanceDate,
    scheduledStart: raw.scheduledStart,
    scheduledEnd: raw.scheduledEnd,
    scheduledMinutes,
    breakMinutes,
    actualTimeIn: raw.actualTimeIn,
    actualTimeOut: raw.actualTimeOut,
    regularMinutes,
    lateMinutes,
    undertimeMinutes,
    overtimeMinutes,
    paidDayFraction: Number.isFinite(paidDayFraction) ? Math.max(0, Math.min(1, paidDayFraction)) : 0,
    attendanceStatus,
    recordStatus,
    source,
    notes: raw.notes,
    createdBy: raw.createdBy,
    updatedBy: raw.updatedBy,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
  const recordValidation = validateAttendanceRecord(record);
  appendIssues(errors, recordValidation.errors);
  appendIssues(warnings, recordValidation.warnings);
  return { ...validation(errors, warnings), record, value: record };
}

export const normalizeAttendanceUpsert = normalizeAttendanceRecord;
export const normalizeAttendance = normalizeAttendanceRecord;

export interface AttendanceDuplicateGroup {
  key: string;
  companyId?: string;
  workerId: string;
  attendanceDate: DateOnly;
  records: AttendanceRecord[];
}

function attendanceKey(record: Pick<AttendanceRecord, "companyId" | "workerId" | "attendanceDate">): string {
  return `${record.companyId || "(no-company)"}\u0000${record.workerId}\u0000${record.attendanceDate}`;
}

export function findAttendanceDuplicates(records: readonly AttendanceRecord[]): AttendanceDuplicateGroup[] {
  const groups = new Map<string, AttendanceDuplicateGroup>();
  for (const record of records) {
    if (record.recordStatus === "VOID" || !record.workerId || !isValidDateOnly(record.attendanceDate)) continue;
    const key = attendanceKey(record);
    const group = groups.get(key) || { key, companyId: record.companyId, workerId: record.workerId, attendanceDate: record.attendanceDate, records: [] };
    group.records.push(record);
    groups.set(key, group);
  }
  return [...groups.values()].filter((group) => group.records.length > 1);
}

export const detectAttendanceDuplicates = findAttendanceDuplicates;

export function hasAttendanceDuplicate(records: readonly AttendanceRecord[]): boolean {
  return findAttendanceDuplicates(records).length > 0;
}

export interface AttendanceBatchOperation {
  operation: "CREATE" | "UPDATE" | "UNCHANGED";
  key: string;
  record: NormalizedAttendanceRecord;
  previous?: AttendanceRecord;
}

export interface AttendanceBatchInput {
  records: readonly AttendanceRecordInput[];
  existingRecords?: readonly AttendanceRecord[];
  companyId?: string;
  defaultSource?: AttendanceSource;
  defaultRecordStatus?: AttendanceRecordStatus;
  defaultAttendanceStatus?: AttendanceStatus;
  deriveMinutes?: boolean;
  previewOnly?: boolean;
}

export interface AttendanceBatchResult extends WorkforceValidationResult {
  records: NormalizedAttendanceRecord[];
  nextRecords: NormalizedAttendanceRecord[];
  created: NormalizedAttendanceRecord[];
  updated: NormalizedAttendanceRecord[];
  operations: AttendanceBatchOperation[];
  duplicates: AttendanceDuplicateGroup[];
  previewOnly: boolean;
  applied: boolean;
}

function asAttendanceBatchInput(inputOrRecords: AttendanceBatchInput | readonly AttendanceRecordInput[], existingRecords: readonly AttendanceRecord[] = [], options: Omit<AttendanceBatchInput, "records" | "existingRecords"> = {}): AttendanceBatchInput {
  if (Array.isArray(inputOrRecords)) return { ...options, records: inputOrRecords, existingRecords };
  return inputOrRecords as AttendanceBatchInput;
}

function sameRecord(left: NormalizedAttendanceRecord, right: AttendanceRecord): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function applyAttendanceBatch(input: AttendanceBatchInput): AttendanceBatchResult;
export function applyAttendanceBatch(records: readonly AttendanceRecordInput[], existingRecords?: readonly AttendanceRecord[], options?: Omit<AttendanceBatchInput, "records" | "existingRecords">): AttendanceBatchResult;
export function applyAttendanceBatch(inputOrRecords: AttendanceBatchInput | readonly AttendanceRecordInput[], existingRecords: readonly AttendanceRecord[] = [], options: Omit<AttendanceBatchInput, "records" | "existingRecords"> = {}): AttendanceBatchResult {
  const input = asAttendanceBatchInput(inputOrRecords, existingRecords, options);
  const errors: WorkforceIssue[] = [];
  const warnings: WorkforceIssue[] = [];
  const sourceRecords = [...(input.existingRecords || [])];
  const existingDuplicates = findAttendanceDuplicates(sourceRecords);
  if (existingDuplicates.length) {
    for (const duplicate of existingDuplicates) errors.push(error("DUPLICATE_ATTENDANCE", `More than one active attendance record exists for worker ${duplicate.workerId} on ${duplicate.attendanceDate}.`, { workerId: duplicate.workerId, date: duplicate.attendanceDate }));
  }
  const normalizedCandidates: Array<{ input: AttendanceRecordInput; result: AttendanceNormalizationResult }> = [];
  const candidateRecords: NormalizedAttendanceRecord[] = [];
  for (const recordInput of input.records || []) {
    const result = normalizeAttendanceRecord(recordInput, {
      companyId: input.companyId,
      defaultSource: input.defaultSource,
      defaultRecordStatus: input.defaultRecordStatus,
      defaultAttendanceStatus: input.defaultAttendanceStatus,
      deriveMinutes: input.deriveMinutes,
    });
    normalizedCandidates.push({ input: recordInput, result });
    appendIssues(errors, result.errors);
    appendIssues(warnings, result.warnings);
    if (result.record) candidateRecords.push(result.record);
  }
  const candidateDuplicates = findAttendanceDuplicates(candidateRecords as AttendanceRecord[]);
  for (const duplicate of candidateDuplicates) errors.push(error("DUPLICATE_ATTENDANCE_BATCH", `The batch contains more than one active attendance record for worker ${duplicate.workerId} on ${duplicate.attendanceDate}.`, { workerId: duplicate.workerId, date: duplicate.attendanceDate }));
  const duplicates = [...existingDuplicates, ...candidateDuplicates];
  const activeExisting = new Map<string, { record: AttendanceRecord; index: number }>();
  sourceRecords.forEach((record, index) => {
    if (record.recordStatus !== "VOID" && record.workerId && isValidDateOnly(record.attendanceDate) && !activeExisting.has(attendanceKey(record))) activeExisting.set(attendanceKey(record), { record, index });
  });
  const operations: AttendanceBatchOperation[] = [];
  const created: NormalizedAttendanceRecord[] = [];
  const updated: NormalizedAttendanceRecord[] = [];
  const nextRecords: NormalizedAttendanceRecord[] = sourceRecords.map((record) => ({ ...record }));
  if (errors.length === 0) {
    for (const candidate of normalizedCandidates) {
      const previewRecord = candidate.result.record;
      if (!previewRecord) continue;
      const key = attendanceKey(previewRecord as AttendanceRecord);
      const current = activeExisting.get(key);
      const normalized = normalizeAttendanceRecord(candidate.input, {
        existing: current?.record,
        companyId: input.companyId,
        defaultSource: input.defaultSource,
        defaultRecordStatus: input.defaultRecordStatus,
        defaultAttendanceStatus: input.defaultAttendanceStatus,
        deriveMinutes: input.deriveMinutes,
      });
      appendIssues(errors, normalized.errors);
      appendIssues(warnings, normalized.warnings);
      if (!normalized.record) continue;
      if (current) {
        const operation: AttendanceBatchOperation["operation"] = sameRecord(normalized.record, current.record) ? "UNCHANGED" : "UPDATE";
        operations.push({ operation, key, record: normalized.record, previous: current.record });
        if (operation === "UPDATE") {
          updated.push(normalized.record);
          nextRecords[current.index] = normalized.record;
        }
      } else {
        operations.push({ operation: "CREATE", key, record: normalized.record });
        created.push(normalized.record);
        nextRecords.push(normalized.record);
      }
    }
  }
  const valid = errors.length === 0;
  const outputRecords = valid ? nextRecords : sourceRecords.map((record) => ({ ...record }));
  return {
    ...validation(errors, warnings),
    records: outputRecords,
    nextRecords: outputRecords,
    created: valid ? created : [],
    updated: valid ? updated : [],
    operations: valid ? operations : [],
    duplicates,
    previewOnly: input.previewOnly === true,
    applied: valid && input.previewOnly !== true,
  };
}

export const validateAttendanceBatch = applyAttendanceBatch;
export const previewAttendanceBatch = (input: AttendanceBatchInput): AttendanceBatchResult => applyAttendanceBatch({ ...input, previewOnly: true });
export const upsertAttendanceRecords = applyAttendanceBatch;

export interface MarkScheduledWorkersPresentInput extends DailyRosterInput {
  existingRecords?: readonly AttendanceRecord[];
  companyId?: string;
  source?: AttendanceSource;
  recordStatus?: AttendanceRecordStatus;
  previewOnly?: boolean;
}

export interface MarkScheduledWorkersPresentResult extends AttendanceBatchResult {
  roster: DailyRoster;
  scheduledWorkerIds: string[];
  excluded: DailyRosterExclusion[];
}

function markInput(inputOrWorkers: MarkScheduledWorkersPresentInput | readonly WorkforceWorker[], date?: DateOnly, options: Omit<MarkScheduledWorkersPresentInput, "workers" | "date"> = {}): MarkScheduledWorkersPresentInput {
  if (Array.isArray(inputOrWorkers)) return { ...options, date: date as DateOnly, workers: inputOrWorkers };
  return inputOrWorkers as MarkScheduledWorkersPresentInput;
}

export function markScheduledWorkersPresent(input: MarkScheduledWorkersPresentInput): MarkScheduledWorkersPresentResult;
export function markScheduledWorkersPresent(workers: readonly WorkforceWorker[], date: DateOnly, options?: Omit<MarkScheduledWorkersPresentInput, "workers" | "date">): MarkScheduledWorkersPresentResult;
export function markScheduledWorkersPresent(inputOrWorkers: MarkScheduledWorkersPresentInput | readonly WorkforceWorker[], date?: DateOnly, options: Omit<MarkScheduledWorkersPresentInput, "workers" | "date"> = {}): MarkScheduledWorkersPresentResult {
  const input = markInput(inputOrWorkers, date, options);
  const roster = buildDailyRoster(input);
  const errors = [...roster.errors];
  const warnings = [...roster.warnings];
  const existing = [...(input.existingRecords || [])];
  const existingByKey = new Map<string, AttendanceRecord>();
  for (const record of existing) {
    if (record.recordStatus !== "VOID" && record.workerId && isValidDateOnly(record.attendanceDate)) existingByKey.set(attendanceKey(record), record);
  }
  const records: AttendanceRecordInput[] = roster.items.map((item) => {
    const current = existingByKey.get(attendanceKey({ companyId: input.companyId, workerId: item.workerId, attendanceDate: item.date } as AttendanceRecord));
    const breakMinutes = current?.breakMinutes ?? item.breakMinutes;
    const derived = deriveAttendanceMinutes({
      attendanceDate: item.date,
      scheduledStart: item.scheduledStart,
      scheduledEnd: item.scheduledEnd,
      breakMinutes,
      actualTimeIn: current?.actualTimeIn,
      actualTimeOut: current?.actualTimeOut,
    });
    appendIssues(warnings, derived.warnings);
    const hasActual = current?.actualTimeIn !== undefined && current.actualTimeOut !== undefined;
    return {
      id: current?.id,
      companyId: input.companyId ?? current?.companyId,
      workerId: item.workerId,
      periodId: current?.periodId,
      attendanceDate: item.date,
      scheduledStart: item.scheduledStart,
      scheduledEnd: item.scheduledEnd,
      scheduledMinutes: hasActual || current ? derived.scheduledMinutes || item.scheduledMinutes : item.scheduledMinutes,
      breakMinutes,
      actualTimeIn: current?.actualTimeIn,
      actualTimeOut: current?.actualTimeOut,
      regularMinutes: hasActual ? derived.regularMinutes : Math.max(0, (derived.scheduledMinutes || item.scheduledMinutes)),
      lateMinutes: hasActual ? derived.lateMinutes : 0,
      undertimeMinutes: hasActual ? derived.undertimeMinutes : 0,
      overtimeMinutes: hasActual ? derived.overtimeMinutes : 0,
      paidDayFraction: 1,
      attendanceStatus: "PRESENT",
      recordStatus: input.recordStatus || current?.recordStatus || "DRAFT",
      source: input.source || "SYSTEM",
      notes: current?.notes,
      createdBy: current?.createdBy,
      updatedBy: current?.updatedBy,
      createdAt: current?.createdAt,
      updatedAt: current?.updatedAt,
    };
  });
  const batch = applyAttendanceBatch({
    records,
    existingRecords: existing,
    companyId: input.companyId,
    defaultSource: input.source || "SYSTEM",
    defaultRecordStatus: input.recordStatus || "DRAFT",
    defaultAttendanceStatus: "PRESENT",
    previewOnly: input.previewOnly,
  });
  appendIssues(errors, batch.errors);
  appendIssues(warnings, batch.warnings);
  const valid = errors.length === 0;
  const outputRecords = valid ? batch.records : existing.map((record) => ({ ...record }));
  return {
    ...batch,
    ...validation(errors, warnings),
    records: outputRecords,
    nextRecords: outputRecords,
    created: valid ? batch.created : [],
    updated: valid ? batch.updated : [],
    operations: valid ? batch.operations : [],
    applied: valid && input.previewOnly !== true,
    roster,
    scheduledWorkerIds: roster.items.map((item) => item.workerId),
    excluded: roster.excluded,
  };
}

export interface OvertimeResolutionInput {
  workerId: string;
  overtimeDate: DateOnly;
  overtimeRequests?: readonly OvertimeRequest[];
  workEntries?: readonly WorkEntry[];
  legacyWorkEntries?: readonly WorkEntry[];
  companyId?: string;
}

export interface OvertimeConflict {
  code: "EXPLICIT_AND_LEGACY_OVERTIME" | "DUPLICATE_EXPLICIT_REQUEST" | "DUPLICATE_LEGACY_WORK_ENTRY";
  message: string;
  explicitRequestIds: string[];
  legacyWorkEntryIds: string[];
  explicitMinutes: number;
  legacyMinutes: number;
}

export interface OvertimeResolution extends WorkforceValidationResult {
  workerId: string;
  overtimeDate: DateOnly;
  source: "EXPLICIT_APPROVED" | "LEGACY_WORK_ENTRY" | "NONE";
  overtimeMinutes: number;
  explicitMinutes: number;
  legacyMinutes: number;
  ignoredLegacyMinutes: number;
  explicitRequestIds: string[];
  legacyWorkEntryIds: string[];
  conflicts: OvertimeConflict[];
  needsReview: boolean;
}

function asOvertimeInput(inputOrWorker: OvertimeResolutionInput | string, overtimeDate?: DateOnly, overtimeRequests: readonly OvertimeRequest[] = [], workEntries: readonly WorkEntry[] = []): OvertimeResolutionInput {
  return typeof inputOrWorker === "string" ? { workerId: inputOrWorker, overtimeDate: overtimeDate as DateOnly, overtimeRequests, workEntries } : inputOrWorker;
}

export function resolveOvertime(input: OvertimeResolutionInput): OvertimeResolution;
export function resolveOvertime(workerId: string, overtimeDate: DateOnly, overtimeRequests?: readonly OvertimeRequest[], workEntries?: readonly WorkEntry[]): OvertimeResolution;
export function resolveOvertime(inputOrWorker: OvertimeResolutionInput | string, overtimeDate?: DateOnly, overtimeRequests: readonly OvertimeRequest[] = [], workEntries: readonly WorkEntry[] = []): OvertimeResolution {
  const input = asOvertimeInput(inputOrWorker, overtimeDate, overtimeRequests, workEntries);
  const errors: WorkforceIssue[] = [];
  const warnings: WorkforceIssue[] = [];
  const conflicts: OvertimeConflict[] = [];
  if (!input.workerId) errors.push(error("MISSING_WORKER_ID", "workerId is required.", { field: "workerId" }));
  if (!isValidDateOnly(input.overtimeDate)) errors.push(error("INVALID_DATE_ONLY", "overtimeDate must be a valid YYYY-MM-DD date.", { field: "overtimeDate" }));
  const requests = (input.overtimeRequests || []).filter((request) => request.workerId === input.workerId && request.overtimeDate === input.overtimeDate && sameCompany(request, { companyId: input.companyId }));
  const legacy = (input.workEntries ?? input.legacyWorkEntries ?? []).filter((entry) => entry.workerId === input.workerId && entry.workDate === input.overtimeDate);
  const explicitRequestIds: string[] = [];
  const legacyWorkEntryIds: string[] = [];
  const seenExplicit = new Set<string>();
  const seenLegacy = new Set<string>();
  let explicitMinutes = 0;
  let legacyMinutes = 0;
  for (const request of requests.filter((candidate) => candidate.status === "APPROVED")) {
    if (seenExplicit.has(request.id)) {
      conflicts.push({ code: "DUPLICATE_EXPLICIT_REQUEST", message: `Approved overtime request ${request.id} was supplied more than once and counted once.`, explicitRequestIds: [request.id], legacyWorkEntryIds: [], explicitMinutes: 0, legacyMinutes: 0 });
      continue;
    }
    seenExplicit.add(request.id);
    explicitRequestIds.push(request.id);
    const requested = Number(request.requestedMinutes);
    const approved = Number(request.approvedMinutes);
    if (!Number.isFinite(requested) || requested < 0) errors.push(error("INVALID_OVERTIME_MINUTES", `Overtime request ${request.id} requestedMinutes must be non-negative.`, { field: "requestedMinutes", recordId: request.id, workerId: input.workerId, date: input.overtimeDate }));
    if (!Number.isFinite(approved) || approved < 0) errors.push(error("INVALID_OVERTIME_MINUTES", `Overtime request ${request.id} approvedMinutes must be non-negative.`, { field: "approvedMinutes", recordId: request.id, workerId: input.workerId, date: input.overtimeDate }));
    if (Number.isFinite(requested) && Number.isFinite(approved) && approved > requested) warnings.push(warning("APPROVED_EXCEEDS_REQUESTED", `Overtime request ${request.id} approves more minutes than requested; approvedMinutes remains authoritative.`, { recordId: request.id, workerId: input.workerId, date: input.overtimeDate }));
    explicitMinutes += roundedMinutes(approved);
  }
  for (const entry of legacy.filter((candidate) => candidate.status === "APPROVED")) {
    const entryMinutes = roundedMinutes(Number(entry.overtimeHours || 0) * 60);
    if (seenLegacy.has(entry.id)) {
      conflicts.push({ code: "DUPLICATE_LEGACY_WORK_ENTRY", message: `Approved legacy work entry ${entry.id} was supplied more than once and counted once.`, explicitRequestIds: [], legacyWorkEntryIds: [entry.id], explicitMinutes: 0, legacyMinutes: entryMinutes });
      continue;
    }
    seenLegacy.add(entry.id);
    legacyWorkEntryIds.push(entry.id);
    if (!Number.isFinite(Number(entry.overtimeHours || 0)) || Number(entry.overtimeHours || 0) < 0) errors.push(error("INVALID_OVERTIME_HOURS", `Legacy work entry ${entry.id} overtimeHours must be non-negative.`, { field: "overtimeHours", recordId: entry.id, workerId: input.workerId, date: input.overtimeDate }));
    legacyMinutes += entryMinutes;
  }
  const hasApprovedExplicit = explicitRequestIds.length > 0;
  if (hasApprovedExplicit && legacyMinutes > 0) {
    conflicts.push({
      code: "EXPLICIT_AND_LEGACY_OVERTIME",
      message: "Approved explicit overtime is authoritative; legacy work-entry overtime was ignored to prevent double counting.",
      explicitRequestIds: [...explicitRequestIds],
      legacyWorkEntryIds: [...legacyWorkEntryIds],
      explicitMinutes,
      legacyMinutes,
    });
  }
  const source = hasApprovedExplicit ? "EXPLICIT_APPROVED" : legacyMinutes > 0 ? "LEGACY_WORK_ENTRY" : "NONE";
  const resolvedMinutes = hasApprovedExplicit ? explicitMinutes : legacyMinutes;
  return {
    ...validation(errors, warnings),
    workerId: input.workerId,
    overtimeDate: input.overtimeDate,
    source,
    overtimeMinutes: resolvedMinutes,
    explicitMinutes,
    legacyMinutes,
    ignoredLegacyMinutes: hasApprovedExplicit ? legacyMinutes : 0,
    explicitRequestIds,
    legacyWorkEntryIds,
    conflicts,
    needsReview: conflicts.length > 0 || warnings.length > 0,
  };
}

export const resolveOvertimeForDate = resolveOvertime;
export const resolveOvertimeMinutes = resolveOvertime;

export interface OvertimeBatchInput {
  overtimeRequests?: readonly OvertimeRequest[];
  workEntries?: readonly WorkEntry[];
  legacyWorkEntries?: readonly WorkEntry[];
  companyId?: string;
}

export function resolveOvertimeBatch(input: OvertimeBatchInput): OvertimeResolution[] {
  const keys = new Map<string, { workerId: string; overtimeDate: DateOnly }>();
  for (const request of input.overtimeRequests || []) if (request.status === "APPROVED" && isValidDateOnly(request.overtimeDate)) keys.set(`${request.workerId}\u0000${request.overtimeDate}`, { workerId: request.workerId, overtimeDate: request.overtimeDate });
  for (const entry of input.workEntries || input.legacyWorkEntries || []) if (entry.status === "APPROVED" && isValidDateOnly(entry.workDate)) keys.set(`${entry.workerId}\u0000${entry.workDate}`, { workerId: entry.workerId, overtimeDate: entry.workDate });
  return [...keys.values()].sort((left, right) => left.workerId.localeCompare(right.workerId) || left.overtimeDate.localeCompare(right.overtimeDate)).map((key) => resolveOvertime({ ...input, ...key }));
}
