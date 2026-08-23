/**
 * Pure payroll schedule/period domain helpers.
 *
 * Dates in this module are ISO calendar dates (YYYY-MM-DD), never timestamps.
 * All arithmetic is performed against UTC midnight so the host timezone cannot
 * change a generated period boundary.
 */

export type DateOnly = string;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type PayrollFrequency = "DAILY" | "WEEKLY" | "BIWEEKLY" | "SEMI_MONTHLY" | "MONTHLY" | "CUSTOM";

export const PAYROLL_FREQUENCIES = Object.freeze({
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  BIWEEKLY: "BIWEEKLY",
  SEMI_MONTHLY: "SEMI_MONTHLY",
  MONTHLY: "MONTHLY",
  CUSTOM: "CUSTOM",
} as const);

export type PayrollPayDateRuleType = "SAME_PERIOD_END" | "CALENDAR_DAYS" | "BUSINESS_DAYS" | "FIXED_FOLLOWING_MONTH" | "MANUAL";

export const PAYROLL_PAY_DATE_RULES = Object.freeze({
  SAME_PERIOD_END: "SAME_PERIOD_END",
  CALENDAR_DAYS: "CALENDAR_DAYS",
  BUSINESS_DAYS: "BUSINESS_DAYS",
  FIXED_FOLLOWING_MONTH: "FIXED_FOLLOWING_MONTH",
  MANUAL: "MANUAL",
} as const);

export interface PayrollPayDateRule {
  type: PayrollPayDateRuleType;
  /** Used by CALENDAR_DAYS and BUSINESS_DAYS. Negative values are supported. */
  offsetDays?: number;
  /** Used by FIXED_FOLLOWING_MONTH. Values above the month length clamp to month-end. */
  dayOfMonth?: number;
}

export interface PayrollScheduleConfiguration {
  frequency: PayrollFrequency;
  /** Weekly period end weekday. Sunday is 0 and Saturday is 6. */
  weekEndDay?: Weekday;
  /** Anchor period end for WEEKLY, BIWEEKLY, or length-based CUSTOM schedules. */
  anchorPeriodEnd?: DateOnly;
  /** A monthly cutoff, e.g. 15 creates periods ending on the 15th and the next cutoff. */
  customCutoffDay?: number;
  /** Alternative practical custom rule: fixed length periods from anchorPeriodEnd. */
  customPeriodLengthDays?: number;
  /** Alternative monthly custom rule; endDay is treated as the cutoff. */
  customPeriodStartDay?: number;
  customPeriodEndDay?: number;
  /** Creates exactly one DRAFT run for each generated period. */
  autoCreateRuns?: boolean;
  /** Selects the current generated period when Payroll opens. */
  autoSelectCurrentPeriod?: boolean;
  automationMode?: "MANUAL" | "ASSISTED" | "AUTOMATED";
}

export interface PayrollScheduleVersion extends PayrollScheduleConfiguration {
  id: string;
  scheduleId: string;
  version: number;
  effectiveFrom: DateOnly;
  effectiveTo?: DateOnly;
  payDateRule: PayrollPayDateRule;
  autoGeneratePeriods: boolean;
  autoCalculate: boolean;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PayrollSchedule extends PayrollScheduleConfiguration {
  id: string;
  userId?: string;
  name?: string;
  effectiveFrom: DateOnly;
  payDateRule: PayrollPayDateRule;
  autoGeneratePeriods: boolean;
  autoCalculate: boolean;
  active: boolean;
  versions?: PayrollScheduleVersion[];
  createdAt?: string;
  updatedAt?: string;
}

export type PayrollPeriodStatus = "DRAFT" | "OPEN" | "CALCULATED" | "APPROVED" | "PAID" | "VOID" | string;

export interface GeneratedPayrollPeriod {
  periodKey: string;
  scheduleId: string;
  scheduleVersionId: string;
  periodStart: DateOnly;
  periodEnd: DateOnly;
  payDate?: DateOnly;
  status: PayrollPeriodStatus;
  active: boolean;
}

export interface ScheduledPayrollPeriod extends GeneratedPayrollPeriod {
  id?: string;
  locked?: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PayrollScheduleValidationResult {
  valid: boolean;
  issues: string[];
}

export interface GeneratePeriodsOptions {
  previous?: number;
  next?: number;
}

export const PAYROLL_SCHEDULES_STORAGE_KEY = "engineering_payroll_schedules";
export const PAYROLL_SCHEDULE_PERIODS_STORAGE_KEY = "engineering_payroll_schedule_periods";
export const LOCKED_PAYROLL_PERIOD_STATUSES = Object.freeze(["APPROVED", "PAID", "VOID"] as const);

const FREQUENCIES = new Set<string>(Object.values(PAYROLL_FREQUENCIES));
const PAY_DATE_RULE_TYPES = new Set<string>(Object.values(PAYROLL_PAY_DATE_RULES));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

function utcDate(date: DateOnly): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): DateOnly {
  return date.toISOString().slice(0, 10);
}

function isValidDateOnly(value: unknown): value is DateOnly {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = utcDate(value);
  return Number.isFinite(date.getTime()) && formatDate(date) === value;
}

function compareDates(left: DateOnly, right: DateOnly) { return left < right ? -1 : left > right ? 1 : 0; }

export function addDateDays(date: DateOnly, days: number): DateOnly {
  if (!isValidDateOnly(date) || !Number.isInteger(days)) throw new Error("addDateDays requires a valid date-only value and an integer day count.");
  const result = utcDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return formatDate(result);
}

export function daysBetweenDates(start: DateOnly, end: DateOnly): number {
  if (!isValidDateOnly(start) || !isValidDateOnly(end)) throw new Error("daysBetweenDates requires valid date-only values.");
  return Math.round((utcDate(end).getTime() - utcDate(start).getTime()) / MS_PER_DAY);
}

function daysInMonth(year: number, month: number) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }

function monthDate(year: number, month: number, day: number): DateOnly {
  const clampedMonth = month < 1 ? 1 : month > 12 ? 12 : month;
  return formatDate(new Date(Date.UTC(year, clampedMonth - 1, Math.min(day, daysInMonth(year, clampedMonth)) )));
}

function monthAfter(date: DateOnly, months: number): { year: number; month: number } {
  const source = utcDate(date);
  const value = source.getUTCFullYear() * 12 + source.getUTCMonth() + months;
  return { year: Math.floor(value / 12), month: (value % 12) + 1 };
}

function isWeekend(date: DateOnly) {
  const weekday = utcDate(date).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function nextOrSameWeekday(date: DateOnly, weekday: Weekday): DateOnly {
  return addDateDays(date, (weekday - utcDate(date).getUTCDay() + 7) % 7);
}

function normalizeAnchor(version: PayrollScheduleVersion): DateOnly {
  if (version.anchorPeriodEnd) return version.anchorPeriodEnd;
  const endDay = version.weekEndDay ?? 6;
  return nextOrSameWeekday(version.effectiveFrom, endDay);
}

function periodKey(scheduleId: string, versionId: string, start: DateOnly, end: DateOnly) {
  return `${scheduleId}:${versionId}:${start}:${end}`;
}

function versionFromSchedule(schedule: PayrollSchedule): PayrollScheduleVersion {
  return {
    id: `${schedule.id}:v1`,
    scheduleId: schedule.id,
    version: 1,
    effectiveFrom: schedule.effectiveFrom,
    frequency: schedule.frequency,
    weekEndDay: schedule.weekEndDay,
    anchorPeriodEnd: schedule.anchorPeriodEnd,
    customCutoffDay: schedule.customCutoffDay,
    customPeriodLengthDays: schedule.customPeriodLengthDays,
    customPeriodStartDay: schedule.customPeriodStartDay,
    customPeriodEndDay: schedule.customPeriodEndDay,
    payDateRule: schedule.payDateRule,
    autoGeneratePeriods: schedule.autoGeneratePeriods,
    autoCalculate: schedule.autoCalculate,
    active: schedule.active,
  };
}

export function resolvePayrollScheduleVersion(schedule: PayrollSchedule, referenceDate: DateOnly): PayrollScheduleVersion {
  assertValidDateOnly(referenceDate, "referenceDate");
  const versions = (schedule.versions?.length ? schedule.versions : [versionFromSchedule(schedule)])
    .filter((version) => version.active && compareDates(version.effectiveFrom, referenceDate) <= 0 && (!version.effectiveTo || compareDates(referenceDate, version.effectiveTo) <= 0))
    .sort((left, right) => left.version - right.version || compareDates(left.effectiveFrom, right.effectiveFrom));
  return versions.at(-1) || (schedule.versions?.find((version) => version.active) || versionFromSchedule(schedule));
}

function assertValidDateOnly(value: unknown, label: string): asserts value is DateOnly {
  if (!isValidDateOnly(value)) throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
}

function validatePayDateRule(rule: PayrollPayDateRule, issues: string[]) {
  if (!rule || !PAY_DATE_RULE_TYPES.has(rule.type)) {
    issues.push("Pay-date rule type is invalid.");
    return;
  }
  if (rule.type === "CALENDAR_DAYS" || rule.type === "BUSINESS_DAYS") {
    if (!Number.isInteger(rule.offsetDays)) issues.push(`${rule.type} requires an integer offsetDays.`);
  }
  if (rule.type === "FIXED_FOLLOWING_MONTH" && (!Number.isInteger(rule.dayOfMonth) || (rule.dayOfMonth as number) < 1 || (rule.dayOfMonth as number) > 31)) {
    issues.push("FIXED_FOLLOWING_MONTH requires dayOfMonth between 1 and 31.");
  }
}

function validateVersion(version: PayrollScheduleVersion, schedule: PayrollSchedule | undefined, issues: string[]) {
  if (!version.id || !version.scheduleId) issues.push("Schedule versions require id and scheduleId.");
  if (!Number.isInteger(version.version) || version.version < 1) issues.push("Schedule version must be a positive integer.");
  if (!isValidDateOnly(version.effectiveFrom)) issues.push(`Schedule version ${version.id || "(unknown)"} has an invalid effectiveFrom.`);
  if (version.effectiveTo && !isValidDateOnly(version.effectiveTo)) issues.push(`Schedule version ${version.id || "(unknown)"} has an invalid effectiveTo.`);
  if (version.effectiveTo && compareDates(version.effectiveTo, version.effectiveFrom) < 0) issues.push(`Schedule version ${version.id || "(unknown)"} ends before it starts.`);
  if (schedule && compareDates(version.effectiveFrom, schedule.effectiveFrom) < 0) issues.push(`Schedule version ${version.id || "(unknown)"} predates its schedule.`);
  validateConfiguration(version, issues);
  validatePayDateRule(version.payDateRule, issues);
}

function validateConfiguration(configuration: PayrollScheduleConfiguration, issues: string[]) {
  if (!FREQUENCIES.has(configuration.frequency)) issues.push("Payroll frequency is invalid.");
  if (configuration.weekEndDay !== undefined && (!Number.isInteger(configuration.weekEndDay) || configuration.weekEndDay < 0 || configuration.weekEndDay > 6)) issues.push("weekEndDay must be a weekday from 0 through 6.");
  if (configuration.anchorPeriodEnd && !isValidDateOnly(configuration.anchorPeriodEnd)) issues.push("anchorPeriodEnd must be a valid date-only value.");
  if (configuration.customCutoffDay !== undefined && (!Number.isInteger(configuration.customCutoffDay) || configuration.customCutoffDay < 1 || configuration.customCutoffDay > 31)) issues.push("customCutoffDay must be between 1 and 31.");
  if (configuration.customPeriodLengthDays !== undefined && (!Number.isInteger(configuration.customPeriodLengthDays) || configuration.customPeriodLengthDays < 1)) issues.push("customPeriodLengthDays must be a positive integer.");
  if (configuration.customPeriodStartDay !== undefined && (!Number.isInteger(configuration.customPeriodStartDay) || configuration.customPeriodStartDay < 1 || configuration.customPeriodStartDay > 31)) issues.push("customPeriodStartDay must be between 1 and 31.");
  if (configuration.customPeriodEndDay !== undefined && (!Number.isInteger(configuration.customPeriodEndDay) || configuration.customPeriodEndDay < 1 || configuration.customPeriodEndDay > 31)) issues.push("customPeriodEndDay must be between 1 and 31.");
  if (configuration.frequency === "BIWEEKLY" && !configuration.anchorPeriodEnd) issues.push("BIWEEKLY schedules require anchorPeriodEnd.");
  if (configuration.frequency === "CUSTOM" && !configuration.customCutoffDay && !configuration.customPeriodLengthDays && !configuration.customPeriodEndDay) issues.push("CUSTOM schedules require a cutoff day, period length, or end day.");
  if (configuration.customPeriodLengthDays && !configuration.anchorPeriodEnd) issues.push("Length-based CUSTOM schedules require anchorPeriodEnd.");
}

export function validatePayrollSchedule(schedule: PayrollSchedule): PayrollScheduleValidationResult {
  const issues: string[] = [];
  if (!schedule || typeof schedule !== "object") return { valid: false, issues: ["Payroll schedule is required."] };
  if (!schedule.id) issues.push("Payroll schedule requires an id.");
  if (!isValidDateOnly(schedule.effectiveFrom)) issues.push("Payroll schedule effectiveFrom must be a valid date-only value.");
  if (typeof schedule.active !== "boolean") issues.push("Payroll schedule active must be boolean.");
  if (typeof schedule.autoGeneratePeriods !== "boolean") issues.push("autoGeneratePeriods must be boolean.");
  if (typeof schedule.autoCalculate !== "boolean") issues.push("autoCalculate must be boolean.");
  validateConfiguration(schedule, issues);
  validatePayDateRule(schedule.payDateRule, issues);
  const versions = schedule.versions || [];
  const ordered = [...versions].sort((left, right) => compareDates(left.effectiveFrom, right.effectiveFrom) || left.version - right.version);
  ordered.forEach((version, index) => {
    validateVersion(version, schedule, issues);
    const next = ordered[index + 1];
    if (next && version.effectiveTo && compareDates(version.effectiveTo, next.effectiveFrom) >= 0) issues.push(`Schedule versions ${version.version} and ${next.version} overlap.`);
  });
  return { valid: issues.length === 0, issues };
}

export function assertValidPayrollSchedule(schedule: PayrollSchedule): asserts schedule is PayrollSchedule {
  const result = validatePayrollSchedule(schedule);
  if (!result.valid) throw new Error(`Invalid payroll schedule: ${result.issues.join(" ")}`);
}

function anchoredPeriod(version: PayrollScheduleVersion, referenceDate: DateOnly, length: number): [DateOnly, DateOnly] {
  const anchor = normalizeAnchor(version);
  const distance = daysBetweenDates(anchor, referenceDate);
  // The anchor is the end of its cycle: dates after it belong to the next
  // cycle, while dates before it remain in the anchored cycle until its start.
  const cycle = Math.ceil(distance / length);
  const end = addDateDays(anchor, cycle * length);
  return [addDateDays(end, -(length - 1)), end];
}

function monthlyCutoffPeriod(referenceDate: DateOnly, cutoffDay: number): [DateOnly, DateOnly] {
  const source = utcDate(referenceDate);
  const thisMonthEnd = monthDate(source.getUTCFullYear(), source.getUTCMonth() + 1, cutoffDay);
  if (compareDates(referenceDate, thisMonthEnd) <= 0) {
    const previous = monthAfter(referenceDate, -1);
    return [addDateDays(monthDate(previous.year, previous.month, cutoffDay), 1), thisMonthEnd];
  }
  const next = monthAfter(referenceDate, 1);
  return [addDateDays(thisMonthEnd, 1), monthDate(next.year, next.month, cutoffDay)];
}

function basePeriodFor(version: PayrollScheduleVersion, referenceDate: DateOnly): [DateOnly, DateOnly] {
  const source = utcDate(referenceDate);
  switch (version.frequency) {
    case "DAILY": return [referenceDate, referenceDate];
    case "WEEKLY": return anchoredPeriod({ ...version, anchorPeriodEnd: normalizeAnchor(version) }, referenceDate, 7);
    case "BIWEEKLY": return anchoredPeriod(version, referenceDate, 14);
    case "SEMI_MONTHLY": {
      const year = source.getUTCFullYear();
      const month = source.getUTCMonth() + 1;
      const firstEnd = monthDate(year, month, 15);
      return compareDates(referenceDate, firstEnd) <= 0 ? [monthDate(year, month, 1), firstEnd] : [monthDate(year, month, 16), monthDate(year, month, daysInMonth(year, month))];
    }
    case "MONTHLY": return [monthDate(source.getUTCFullYear(), source.getUTCMonth() + 1, 1), monthDate(source.getUTCFullYear(), source.getUTCMonth() + 1, daysInMonth(source.getUTCFullYear(), source.getUTCMonth() + 1))];
    case "CUSTOM": {
      if (version.customPeriodLengthDays) return anchoredPeriod(version, referenceDate, version.customPeriodLengthDays);
      return monthlyCutoffPeriod(referenceDate, version.customCutoffDay || version.customPeriodEndDay || 15);
    }
  }
}

function periodForDate(version: PayrollScheduleVersion, referenceDate: DateOnly): [DateOnly, DateOnly] | undefined {
  const [rawStart, rawEnd] = basePeriodFor(version, referenceDate);
  if (compareDates(referenceDate, version.effectiveFrom) < 0) return undefined;
  if (version.effectiveTo && compareDates(rawStart, version.effectiveTo) > 0) return undefined;
  return [compareDates(rawStart, version.effectiveFrom) < 0 ? version.effectiveFrom : rawStart, rawEnd];
}

export function calculatePayrollPayDate(periodEnd: DateOnly, rule: PayrollPayDateRule): DateOnly | undefined {
  assertValidDateOnly(periodEnd, "periodEnd");
  if (!rule || !PAY_DATE_RULE_TYPES.has(rule.type)) throw new Error("Invalid pay-date rule.");
  if (rule.type === "MANUAL") return undefined;
  if (rule.type === "SAME_PERIOD_END") return periodEnd;
  if ((rule.type === "CALENDAR_DAYS" || rule.type === "BUSINESS_DAYS") && !Number.isInteger(rule.offsetDays)) throw new Error(`${rule.type} requires an integer offsetDays.`);
  if (rule.type === "CALENDAR_DAYS") return addDateDays(periodEnd, rule.offsetDays as number);
  if (rule.type === "BUSINESS_DAYS") {
    const direction = (rule.offsetDays as number) < 0 ? -1 : 1;
    let remaining = Math.abs(rule.offsetDays as number);
    let result = periodEnd;
    while (remaining > 0) {
      result = addDateDays(result, direction);
      if (!isWeekend(result)) remaining -= 1;
    }
    return result;
  }
  if (!Number.isInteger(rule.dayOfMonth) || (rule.dayOfMonth as number) < 1 || (rule.dayOfMonth as number) > 31) throw new Error("FIXED_FOLLOWING_MONTH requires dayOfMonth between 1 and 31.");
  const following = monthAfter(periodEnd, 1);
  return monthDate(following.year, following.month, rule.dayOfMonth as number);
}

export function generatePayrollPeriod(versionOrSchedule: PayrollScheduleVersion | PayrollSchedule, referenceDate: DateOnly): GeneratedPayrollPeriod | undefined {
  assertValidDateOnly(referenceDate, "referenceDate");
  const version = "scheduleId" in versionOrSchedule ? versionOrSchedule : resolvePayrollScheduleVersion(versionOrSchedule, referenceDate);
  const period = periodForDate(version, referenceDate);
  if (!period) return undefined;
  const [periodStart, periodEnd] = period;
  return {
    periodKey: periodKey(version.scheduleId, version.id, periodStart, periodEnd),
    scheduleId: version.scheduleId,
    scheduleVersionId: version.id,
    periodStart,
    periodEnd,
    payDate: calculatePayrollPayDate(periodEnd, version.payDateRule),
    status: "DRAFT",
    active: version.active,
  };
}

export function generatePayrollPeriodsAroundReference(versionOrSchedule: PayrollScheduleVersion | PayrollSchedule, referenceDate: DateOnly, options: GeneratePeriodsOptions = {}): GeneratedPayrollPeriod[] {
  assertValidDateOnly(referenceDate, "referenceDate");
  const previousCount = options.previous ?? 1;
  const nextCount = options.next ?? 1;
  if (!Number.isInteger(previousCount) || previousCount < 0 || !Number.isInteger(nextCount) || nextCount < 0) throw new Error("previous and next period counts must be non-negative integers.");
  const schedule = "scheduleId" in versionOrSchedule ? undefined : versionOrSchedule;
  let current = generatePayrollPeriod(versionOrSchedule, referenceDate);
  if (!current) return [];
  const result: GeneratedPayrollPeriod[] = [current];
  const version = "scheduleId" in versionOrSchedule ? versionOrSchedule : resolvePayrollScheduleVersion(versionOrSchedule, referenceDate);
  let previousDate = addDateDays(current.periodStart, -1);
  for (let index = 0; index < previousCount; index += 1) {
    const previous = generatePayrollPeriod(version, previousDate);
    if (!previous || (schedule && previous.periodEnd < schedule.effectiveFrom)) break;
    result.unshift(previous);
    previousDate = addDateDays(previous.periodStart, -1);
  }
  let nextDate = addDateDays(current.periodEnd, 1);
  for (let index = 0; index < nextCount; index += 1) {
    const nextVersion = schedule ? resolvePayrollScheduleVersion(schedule, nextDate) : version;
    const next = generatePayrollPeriod(nextVersion, nextDate);
    if (!next || (nextVersion.effectiveTo && compareDates(next.periodStart, nextVersion.effectiveTo) > 0)) break;
    result.push(next);
    nextDate = addDateDays(next.periodEnd, 1);
  }
  return result;
}

export const generatePayrollPeriods = generatePayrollPeriodsAroundReference;

function isLockedPeriod(period: ScheduledPayrollPeriod) {
  return period.locked === true || LOCKED_PAYROLL_PERIOD_STATUSES.includes(period.status as typeof LOCKED_PAYROLL_PERIOD_STATUSES[number]);
}

function boundaryKey(period: Pick<ScheduledPayrollPeriod, "scheduleId" | "periodStart" | "periodEnd">) {
  return `${period.scheduleId}:${period.periodStart}:${period.periodEnd}`;
}

/**
 * Merge generated periods without changing an existing locked period. Exact
 * schedule/version/boundary matches are idempotent; an unlocked old-version
 * row can be superseded by a prospective version at the same boundary.
 */
export function mergeGeneratedPayrollPeriods(existing: ScheduledPayrollPeriod[], generated: GeneratedPayrollPeriod[]): ScheduledPayrollPeriod[] {
  const byBoundary = new Map<string, ScheduledPayrollPeriod[]>();
  for (const period of existing) {
    const key = boundaryKey(period);
    const rows = byBoundary.get(key) || [];
    rows.push({ ...period, periodKey: period.periodKey || periodKey(period.scheduleId, period.scheduleVersionId, period.periodStart, period.periodEnd) });
    byBoundary.set(key, rows);
  }
  for (const candidate of generated) {
    const key = boundaryKey(candidate);
    const rows = byBoundary.get(key) || [];
    const exactIndex = rows.findIndex((row) => row.scheduleVersionId === candidate.scheduleVersionId && row.periodStart === candidate.periodStart && row.periodEnd === candidate.periodEnd);
    if (exactIndex >= 0) {
      const current = rows[exactIndex];
      if (isLockedPeriod(current)) {
        rows[exactIndex] = current;
      } else {
        const merged = { ...current, ...candidate, status: current.status || candidate.status };
        if (current.id !== undefined) merged.id = current.id;
        rows[exactIndex] = merged;
      }
    } else if (!rows.some(isLockedPeriod)) {
      rows.splice(0, rows.length, { ...candidate });
    }
    byBoundary.set(key, rows);
  }
  return [...byBoundary.values()].flat().sort((left, right) => compareDates(left.periodStart, right.periodStart) || compareDates(left.periodEnd, right.periodEnd) || left.scheduleVersionId.localeCompare(right.scheduleVersionId));
}

export const mergePayrollPeriods = mergeGeneratedPayrollPeriods;

function unpaidOrOpen(period: ScheduledPayrollPeriod) {
  return period.active !== false && period.status !== "VOID" && period.status !== "PAID";
}

export function selectCurrentPayrollPeriod(periods: ScheduledPayrollPeriod[], referenceDate: DateOnly): ScheduledPayrollPeriod | undefined {
  assertValidDateOnly(referenceDate, "referenceDate");
  const eligible = periods.filter((period) => period.active !== false && period.status !== "VOID");
  const current = eligible.filter((period) => period.periodStart <= referenceDate && period.periodEnd >= referenceDate).sort((left, right) => compareDates(right.periodEnd, left.periodEnd) || (right.scheduleVersionId || "").localeCompare(left.scheduleVersionId || ""));
  if (current[0]) return current[0];
  const open = eligible.filter(unpaidOrOpen).sort((left, right) => compareDates(right.periodEnd, left.periodEnd));
  if (open[0]) return open[0];
  return eligible.filter((period) => period.periodStart >= referenceDate).sort((left, right) => compareDates(left.periodStart, right.periodStart))[0]
    || eligible.sort((left, right) => Math.abs(daysBetweenDates(left.periodEnd, referenceDate)) - Math.abs(daysBetweenDates(right.periodEnd, referenceDate)))[0];
}

export const selectCurrentPeriod = selectCurrentPayrollPeriod;

function readJson<T>(key: string, storage: Storage | undefined): T[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, value: T[], storage: Storage | undefined) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* local demo storage can be unavailable or full */ }
}

export function readPayrollSchedulesFromLocal(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  return readJson<PayrollSchedule>(PAYROLL_SCHEDULES_STORAGE_KEY, storage);
}

export function writePayrollSchedulesToLocal(schedules: PayrollSchedule[], storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  writeJson(PAYROLL_SCHEDULES_STORAGE_KEY, schedules, storage);
}

export function readPayrollSchedulePeriodsFromLocal(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  return readJson<ScheduledPayrollPeriod>(PAYROLL_SCHEDULE_PERIODS_STORAGE_KEY, storage);
}

export function writePayrollSchedulePeriodsToLocal(periods: ScheduledPayrollPeriod[], storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  writeJson(PAYROLL_SCHEDULE_PERIODS_STORAGE_KEY, periods, storage);
}
