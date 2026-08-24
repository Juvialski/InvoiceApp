import type {
  PayType,
  PayrollAdjustment,
  ProjectWorkerAssignment,
  Worker,
} from "../types.ts";
import {
  fingerprintPayrollSources,
  type PayrollSourceRevisionInput,
} from "./payrollSourceRevision.ts";

const SNAPSHOT_VERSION = "payroll-calculation-v1";
const EPSILON = 0.01;

export type PayrollAdjustmentInput = Pick<PayrollAdjustment, "type" | "code" | "description" | "amount">;

export interface ManualRateOverride {
  payType?: PayType;
  rate?: number;
}

export interface PayrollRateResolutionInput {
  worker: Pick<Worker, "defaultPayType" | "defaultRate">;
  assignment?: Pick<ProjectWorkerAssignment, "startDate" | "endDate" | "payType" | "rate" | "active">;
  workDate: string;
  manualOverride?: ManualRateOverride;
}

export interface PayrollRateResolution {
  payType: PayType;
  rate: number;
  payTypeSource: "MANUAL" | "ASSIGNMENT" | "WORKER_DEFAULT";
  rateSource: "MANUAL" | "ASSIGNMENT" | "WORKER_DEFAULT";
  assignmentValidForWorkDate: boolean;
}

export interface PayrollCalculationInput {
  payType: PayType;
  rate: number;
  regularHours?: number;
  daysWorked?: number;
  overtimeHours?: number;
  overtimeRate?: number;
  /** Optional multiplier for a missing overtimeRate; no statutory multiplier is assumed. */
  overtimeMultiplier?: number;
  /** Monthly pay is prorated only when this explicit percentage is supplied. */
  monthlyAllocationPercentage?: number;
  adjustments?: PayrollAdjustmentInput[];
}

export interface PayrollValidationIssue {
  field: string;
  message: string;
}

export interface PayrollValidationResult {
  valid: boolean;
  issues: PayrollValidationIssue[];
}

export interface PayrollAdjustmentTotals {
  items: Array<{
    type: PayrollAdjustment["type"];
    code?: string;
    description?: string;
    amount: number;
  }>;
  total: number;
}

export interface PayrollCalculationResult {
  payType: PayType;
  rate: number;
  overtimeRate: number;
  basePay: number;
  regularPay: number;
  overtimePay: number;
  allowances: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  employerCosts: number;
  totalEmployerCost: number;
  earnings: PayrollAdjustmentTotals;
  deductionDetails: PayrollAdjustmentTotals;
  employerCostDetails: PayrollAdjustmentTotals;
  calculationSnapshot: Record<string, unknown>;
}

export interface PayrollProjectAllocationInput {
  projectId: string;
  allocationAmount: number;
  allocationPercentage?: number;
}

export interface PayrollProjectAllocationValidation {
  valid: boolean;
  allocatedAmount: number;
  unallocatedAmount: number;
  allocationPercentage: number;
  issues: PayrollValidationIssue[];
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value);
}

function round(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function isValidRate(value: unknown) {
  const amount = numberValue(value);
  return Number.isFinite(amount) && amount > 0;
}

function isValidPayType(value: unknown): value is PayType {
  return value === "MONTHLY" || value === "DAILY" || value === "HOURLY";
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function isAssignmentValidForWorkDate(
  assignment: Pick<ProjectWorkerAssignment, "startDate" | "endDate" | "active"> | undefined,
  workDate: string,
) {
  return Boolean(
    assignment?.active &&
      isDateOnly(workDate) &&
      isDateOnly(assignment.startDate) &&
      assignment.startDate <= workDate &&
      (!assignment.endDate || (isDateOnly(assignment.endDate) && workDate <= assignment.endDate)),
  );
}

/**
 * Resolves the effective pay type and rate without persistence or statutory rules.
 * An explicitly supplied manual override is honored field-by-field; otherwise a
 * valid assignment for the work date wins, followed by the worker default.
 */
export function resolvePayrollRate(input: PayrollRateResolutionInput): PayrollRateResolution {
  const assignmentValid = isAssignmentValidForWorkDate(input.assignment, input.workDate);
  const manualPayTypeValid = isValidPayType(input.manualOverride?.payType);
  const manualRateValid = isValidRate(input.manualOverride?.rate);
  const assignmentPayTypeValid = assignmentValid && isValidPayType(input.assignment?.payType);
  const assignmentRateValid = assignmentValid && isValidRate(input.assignment?.rate);

  return {
    payType: manualPayTypeValid
      ? input.manualOverride!.payType!
      : assignmentPayTypeValid
        ? input.assignment!.payType!
        : input.worker.defaultPayType,
    rate: round(
      manualRateValid
        ? input.manualOverride!.rate!
        : assignmentRateValid
          ? input.assignment!.rate!
          : numberValue(input.worker.defaultRate),
    ),
    payTypeSource: manualPayTypeValid ? "MANUAL" : assignmentPayTypeValid ? "ASSIGNMENT" : "WORKER_DEFAULT",
    rateSource: manualRateValid ? "MANUAL" : assignmentRateValid ? "ASSIGNMENT" : "WORKER_DEFAULT",
    assignmentValidForWorkDate: assignmentValid,
  };
}

function adjustmentTotals(adjustments: PayrollAdjustmentInput[], type: PayrollAdjustment["type"]): PayrollAdjustmentTotals {
  const items = adjustments
    .filter((adjustment) => adjustment.type === type)
    .map((adjustment) => ({
      type: adjustment.type,
      ...(adjustment.code ? { code: adjustment.code } : {}),
      ...(adjustment.description ? { description: adjustment.description } : {}),
      amount: round(numberValue(adjustment.amount)),
    }));
  return { items, total: round(items.reduce((sum, item) => sum + item.amount, 0)) };
}

export function validatePayrollCalculationInput(input: PayrollCalculationInput): PayrollValidationResult {
  const issues: PayrollValidationIssue[] = [];
  if (!isValidPayType(input.payType)) issues.push({ field: "payType", message: "Pay type must be MONTHLY, DAILY, or HOURLY." });
  if (!isValidRate(input.rate)) issues.push({ field: "rate", message: "Rate must be greater than zero." });

  for (const [field, value] of [["regularHours", input.regularHours], ["daysWorked", input.daysWorked], ["overtimeHours", input.overtimeHours]] as const) {
    if (value !== undefined && (!Number.isFinite(numberValue(value)) || numberValue(value) < 0)) issues.push({ field, message: "Value must be a non-negative number." });
  }
  if (input.overtimeRate !== undefined && (!Number.isFinite(numberValue(input.overtimeRate)) || numberValue(input.overtimeRate) < 0)) issues.push({ field: "overtimeRate", message: "Overtime rate must be a non-negative number." });
  if (input.overtimeMultiplier !== undefined && (!Number.isFinite(numberValue(input.overtimeMultiplier)) || numberValue(input.overtimeMultiplier) <= 0)) issues.push({ field: "overtimeMultiplier", message: "Overtime multiplier must be greater than zero." });
  if (input.monthlyAllocationPercentage !== undefined && (!Number.isFinite(numberValue(input.monthlyAllocationPercentage)) || numberValue(input.monthlyAllocationPercentage) < 0 || numberValue(input.monthlyAllocationPercentage) > 100)) issues.push({ field: "monthlyAllocationPercentage", message: "Monthly allocation percentage must be between 0 and 100." });

  for (const [index, adjustment] of (input.adjustments || []).entries()) {
    if (!["EARNING", "DEDUCTION", "EMPLOYER_COST"].includes(adjustment.type)) issues.push({ field: `adjustments[${index}].type`, message: "Adjustment type is invalid." });
    if (!Number.isFinite(numberValue(adjustment.amount)) || numberValue(adjustment.amount) < 0) issues.push({ field: `adjustments[${index}].amount`, message: "Adjustment amount must be a non-negative number." });
  }
  return { valid: issues.length === 0, issues };
}

/** Calculates labor pay and structured adjustments with a deterministic, JSON-safe snapshot. */
export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const validation = validatePayrollCalculationInput(input);
  if (!validation.valid) throw new Error(validation.issues.map((issue) => `${issue.field}: ${issue.message}`).join(" "));

  const rate = round(input.rate);
  const overtimeHours = numberValue(input.overtimeHours) || 0;
  const monthlyAllocationPercentage = input.monthlyAllocationPercentage === undefined ? 100 : numberValue(input.monthlyAllocationPercentage);
  const regularPay = round(
    input.payType === "HOURLY"
      ? (numberValue(input.regularHours) || 0) * rate
      : input.payType === "DAILY"
        ? (numberValue(input.daysWorked) || 0) * rate
        : rate * monthlyAllocationPercentage / 100,
  );
  const overtimeRate = round(input.overtimeRate !== undefined ? input.overtimeRate : rate * (input.overtimeMultiplier ?? 1));
  const overtimePay = round(overtimeHours * overtimeRate);
  const adjustments = input.adjustments || [];
  const earnings = adjustmentTotals(adjustments, "EARNING");
  const deductionDetails = adjustmentTotals(adjustments, "DEDUCTION");
  const employerCostDetails = adjustmentTotals(adjustments, "EMPLOYER_COST");
  const grossPay = round(regularPay + overtimePay + earnings.total);
  const netPay = round(grossPay - deductionDetails.total);

  const snapshot: Record<string, unknown> = {
    version: SNAPSHOT_VERSION,
    input: {
      payType: input.payType,
      rate,
      regularHours: numberValue(input.regularHours) || 0,
      daysWorked: numberValue(input.daysWorked) || 0,
      overtimeHours,
      overtimeRate,
      ...(input.overtimeMultiplier !== undefined ? { overtimeMultiplier: input.overtimeMultiplier } : {}),
      ...(input.monthlyAllocationPercentage !== undefined ? { monthlyAllocationPercentage: input.monthlyAllocationPercentage } : {}),
      adjustments: adjustments.map((adjustment) => ({ ...adjustment, amount: round(numberValue(adjustment.amount)) })),
    },
    earnings,
    deductions: deductionDetails,
    employerCosts: employerCostDetails,
    totals: { regularPay, overtimePay, grossPay, deductions: deductionDetails.total, netPay, employerCosts: employerCostDetails.total },
  };

  return {
    payType: input.payType,
    rate,
    overtimeRate,
    basePay: regularPay,
    regularPay,
    overtimePay,
    allowances: earnings.total,
    grossPay,
    deductions: deductionDetails.total,
    netPay,
    employerCosts: employerCostDetails.total,
    totalEmployerCost: round(grossPay + employerCostDetails.total),
    earnings,
    deductionDetails,
    employerCostDetails,
    calculationSnapshot: snapshot,
  };
}

export function validatePayrollProjectAllocations(totalLaborCost: number, allocations: PayrollProjectAllocationInput[]): PayrollProjectAllocationValidation {
  const issues: PayrollValidationIssue[] = [];
  const total = round(Math.max(0, numberValue(totalLaborCost) || 0));
  const allocatedAmount = round(allocations.reduce((sum, allocation) => sum + Math.max(0, numberValue(allocation.allocationAmount) || 0), 0));
  const allocationPercentage = total > 0 ? round(allocatedAmount / total * 100) : 0;
  const percentageTotal = round(allocations.reduce((sum, allocation) => sum + Math.max(0, numberValue(allocation.allocationPercentage) || 0), 0));
  if (allocatedAmount > total + EPSILON) issues.push({ field: "allocations", message: "Project labor allocations exceed payroll labor cost." });
  if (percentageTotal > 100 + EPSILON) issues.push({ field: "allocationPercentage", message: "Project labor allocation percentages exceed 100%." });
  allocations.forEach((allocation, index) => {
    if (!allocation.projectId) issues.push({ field: `allocations[${index}].projectId`, message: "Project is required." });
    if (!Number.isFinite(numberValue(allocation.allocationAmount)) || numberValue(allocation.allocationAmount) < 0) issues.push({ field: `allocations[${index}].allocationAmount`, message: "Allocation amount must be non-negative." });
    if (allocation.allocationPercentage !== undefined && (!Number.isFinite(numberValue(allocation.allocationPercentage)) || numberValue(allocation.allocationPercentage) < 0 || numberValue(allocation.allocationPercentage) > 100)) issues.push({ field: `allocations[${index}].allocationPercentage`, message: "Allocation percentage must be between 0 and 100." });
  });
  return { valid: issues.length === 0, allocatedAmount, unallocatedAmount: round(Math.max(0, total - allocatedAmount)), allocationPercentage, issues };
}

export interface PayrollAttendanceRecordLike {
  id?: string;
  workerId: string;
  periodId?: string;
  attendanceDate?: string;
  date?: string;
  recordStatus?: string;
  status?: string;
  confirmed?: boolean;
  regularMinutes?: number;
  regularHours?: number;
  paidDayFraction?: number;
  [key: string]: unknown;
}

export interface PayrollLeaveRecordLike {
  id?: string;
  workerId: string;
  periodId?: string;
  leaveDate?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  paid?: boolean;
  [key: string]: unknown;
}

export interface PayrollOvertimeRequestLike {
  id?: string;
  workerId: string;
  periodId?: string;
  overtimeDate?: string;
  approvedMinutes?: number;
  approvedHours?: number;
  status?: string;
  approved?: boolean;
  overtimeRate?: number;
  rate?: number;
  laborContext?: PayrollLaborContext;
  projectId?: string;
  [key: string]: unknown;
}

export interface PayrollHolidayRecordLike {
  id?: string;
  holidayDate?: string;
  date?: string;
  active?: boolean;
  [key: string]: unknown;
}

export interface PayrollRunCalculationInput {
  runId: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  workers: Worker[];
  assignments: ProjectWorkerAssignment[];
  workEntries: Array<Pick<import("../types.ts").WorkEntry, "id" | "workerId" | "projectId" | "laborContext" | "periodId" | "workDate" | "regularHours" | "overtimeHours" | "daysWorked" | "rate" | "overtimeRate" | "status">>;
  /** Payroll-relevant project identity/status inputs used for source freshness. */
  projects?: readonly unknown[];
  /** Confirmed daily records are the primary regular-pay source when present. */
  attendance?: PayrollAttendanceRecordLike[];
  confirmedAttendance?: PayrollAttendanceRecordLike[];
  attendanceRecords?: PayrollAttendanceRecordLike[];
  leave?: PayrollLeaveRecordLike[];
  leaves?: PayrollLeaveRecordLike[];
  leaveRequests?: PayrollLeaveRecordLike[];
  overtime?: PayrollOvertimeRequestLike[];
  overtimeRequests?: PayrollOvertimeRequestLike[];
  holidays?: PayrollHolidayRecordLike[];
  payrollHolidays?: PayrollHolidayRecordLike[];
  /** Optional compensation aliases are fingerprinted for source freshness. */
  profiles?: readonly unknown[];
  compensationProfiles?: readonly unknown[];
  overtimeRule?: { multiplier?: number; rateFor?: (workerId: string, workDate: string) => number | undefined };
  /** Captured monotonic period revision, when the persistence layer provides one. */
  sourceRevision?: number;
  periodSourceRevision?: number;
}

export interface PayrollRunCalculationResult {
  entries: Array<{
    workerId: string;
    basePay: number;
    regularPay: number;
    overtimePay: number;
    allowances: number;
    grossPay: number;
    deductions: number;
    netPay: number;
    projectAllocatedCost: number;
    calculationSnapshot: Record<string, unknown>;
  }>;
  allocations: Array<{
    workerId: string;
    projectId: string;
    allocationAmount: number;
    allocationPercentage?: number;
    laborContext?: "PROJECT" | "ADMIN_OFFICE" | "GENERAL_OVERHEAD" | "UNALLOCATED_REVIEW";
    source: "TIME_ENTRY";
  }>;
  warnings: string[];
  unallocatedLabor: number;
  sourceFingerprint?: string;
  sourceRevision?: number;
}

function localCalculationId(runId: string, workerId: string) {
  return "payroll:" + runId + ":" + workerId;
}

type PayrollLaborContext = "PROJECT" | "ADMIN_OFFICE" | "GENERAL_OVERHEAD" | "UNALLOCATED_REVIEW";
type PayrollWorkEntry = PayrollRunCalculationInput["workEntries"][number] & { laborContext?: PayrollLaborContext };

interface AllocationBucket {
  laborContext: PayrollLaborContext;
  projectId?: string;
  amount: number;
  weight: number;
  workEntryIds: string[];
  sourceIds: string[];
}

function assignmentForWorkEntry(workerId: string, projectId: string | undefined, workDate: string, assignments: ProjectWorkerAssignment[]) {
  return assignments
    .filter((assignment) => assignment.workerId === workerId && projectId !== undefined && assignment.projectId === projectId && isAssignmentValidForWorkDate(assignment, workDate))
    .sort((left, right) => right.startDate.localeCompare(left.startDate) || left.id.localeCompare(right.id))[0];
}

function assignmentForWorkerDate(workerId: string, workDate: string, assignments: ProjectWorkerAssignment[]) {
  return assignments
    .filter((assignment) => assignment.workerId === workerId && isAssignmentValidForWorkDate(assignment, workDate))
    .sort((left, right) => right.startDate.localeCompare(left.startDate) || left.id.localeCompare(right.id))[0];
}

function sourceDate(record: Record<string, unknown>): string | undefined {
  for (const key of ["attendanceDate", "overtimeDate", "workDate", "leaveDate", "date"]) {
    const value = record[key];
    if (typeof value === "string" && value) return value.slice(0, 10);
  }
  return undefined;
}

function inRunPeriod(date: string | undefined, periodId: string | undefined, input: PayrollRunCalculationInput) {
  return Boolean(date && date >= input.periodStart && date <= input.periodEnd && (!periodId || periodId === input.periodId));
}

function uniqueRecords<T extends { id?: string }>(groups: Array<readonly T[] | undefined>): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const group of groups) {
    for (const record of group ?? []) {
      const key = record.id ? "id:" + record.id : JSON.stringify(record);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(record);
    }
  }
  return result;
}

function isConfirmedAttendance(record: PayrollAttendanceRecordLike): boolean {
  const status = String(record.recordStatus ?? record.status ?? "").toUpperCase();
  return status === "" || status === "CONFIRMED" || record.confirmed === true;
}

function isApprovedOvertime(record: PayrollOvertimeRequestLike): boolean {
  return String(record.status ?? "").toUpperCase() === "APPROVED" || (record as Record<string, unknown>).approved === true;
}

function recordId(record: { id?: string }, fallback: string) {
  return record.id || fallback;
}

function positiveAmount(value: unknown) {
  const amount = numberValue(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function approvedOvertimeMinutes(record: PayrollOvertimeRequestLike) {
  const minutes = positiveAmount(record.approvedMinutes);
  return minutes > 0 ? minutes : positiveAmount(record.approvedHours) * 60;
}

function resolveOvertimeRate(input: PayrollRunCalculationInput, workerId: string, date: string, baseRate: number, explicitRate?: number) {
  if (explicitRate !== undefined && Number.isFinite(numberValue(explicitRate)) && numberValue(explicitRate) >= 0) return round(numberValue(explicitRate));
  const ruleRate = input.overtimeRule?.rateFor?.(workerId, date);
  if (ruleRate !== undefined && Number.isFinite(numberValue(ruleRate)) && numberValue(ruleRate) >= 0) return round(numberValue(ruleRate));
  return round(baseRate * (input.overtimeRule?.multiplier ?? 1));
}

function addAllocationBucket(
  buckets: Map<string, AllocationBucket>,
  laborContext: PayrollLaborContext | undefined,
  projectId: string | undefined,
  weight: number,
  amount: number,
  sourceId: string,
  workEntryId?: string,
) {
  const context = laborContext ?? (projectId ? "PROJECT" : "UNALLOCATED_REVIEW");
  const normalizedProjectId = context === "PROJECT" && projectId ? projectId : undefined;
  const key = context + ":" + (normalizedProjectId ?? "");
  const current = buckets.get(key) ?? {
    laborContext: context,
    ...(normalizedProjectId ? { projectId: normalizedProjectId } : {}),
    amount: 0,
    weight: 0,
    workEntryIds: [],
    sourceIds: [],
  };
  current.amount += positiveAmount(amount);
  current.weight += Math.max(0.01, positiveAmount(weight));
  if (workEntryId && !current.workEntryIds.includes(workEntryId)) current.workEntryIds.push(workEntryId);
  if (!current.sourceIds.includes(sourceId)) current.sourceIds.push(sourceId);
  buckets.set(key, current);
}

function contextForWorkEntry(entry: PayrollWorkEntry): PayrollLaborContext {
  if (entry.laborContext) return entry.laborContext;
  return entry.projectId ? "PROJECT" : "UNALLOCATED_REVIEW";
}

/**
 * Builds a reproducible payroll run. Confirmed attendance replaces legacy
 * regular quantities for that worker; legacy work entries remain the fallback
 * when no confirmed attendance exists. Project/context allocation is derived
 * independently from attendance records.
 */
export function calculatePayrollRunFromWorkEntries(input: PayrollRunCalculationInput): PayrollRunCalculationResult {
  const warnings: string[] = [];
  const allAttendance = uniqueRecords([input.confirmedAttendance, input.attendanceRecords, input.attendance]);
  const attendance = allAttendance.filter((record) => {
    const date = sourceDate(record as Record<string, unknown>);
    return isConfirmedAttendance(record) && inRunPeriod(date, record.periodId, input);
  });
  const allLeave = uniqueRecords([input.leaveRequests, input.leaves, input.leave]);
  const allOvertime = uniqueRecords([input.overtimeRequests, input.overtime]);
  const approvedOvertime = allOvertime.filter((record) => {
    const date = sourceDate(record as Record<string, unknown>);
    return isApprovedOvertime(record) && inRunPeriod(date, record.periodId, input) && approvedOvertimeMinutes(record) > 0;
  });
  const allHolidays = uniqueRecords([input.payrollHolidays, input.holidays]);

  const sourceInput: PayrollSourceRevisionInput = {
    period: {
      id: input.periodId,
      startDate: input.periodStart,
      endDate: input.periodEnd,
      ...(Number.isFinite(numberValue(input.sourceRevision ?? input.periodSourceRevision))
        ? { sourceRevision: numberValue(input.sourceRevision ?? input.periodSourceRevision) }
        : {}),
    },
    workers: input.workers,
    attendance: allAttendance,
    leave: allLeave,
    overtime: allOvertime,
    holidays: allHolidays,
    workEntries: input.workEntries,
    assignments: input.assignments,
    profiles: input.profiles,
    compensationProfiles: input.compensationProfiles,
    projects: input.projects,
  };
  const sourceFingerprint = fingerprintPayrollSources(sourceInput);
  const revisionValue = numberValue(input.sourceRevision ?? input.periodSourceRevision);
  const sourceRevision = Number.isFinite(revisionValue) ? revisionValue : undefined;

  const entriesByWorker = new Map<string, PayrollRunCalculationInput["workEntries"]>();
  for (const entry of input.workEntries) {
    if (entry.status !== "APPROVED") continue;
    if (entry.periodId !== input.periodId || entry.workDate < input.periodStart || entry.workDate > input.periodEnd) continue;
    entriesByWorker.set(entry.workerId, [...(entriesByWorker.get(entry.workerId) ?? []), entry]);
  }

  const attendanceByWorker = new Map<string, PayrollAttendanceRecordLike[]>();
  for (const record of attendance) attendanceByWorker.set(record.workerId, [...(attendanceByWorker.get(record.workerId) ?? []), record]);
  for (const records of attendanceByWorker.values()) {
    records.sort((left, right) => String(sourceDate(left as Record<string, unknown>)).localeCompare(String(sourceDate(right as Record<string, unknown>))) || recordId(left, "").localeCompare(recordId(right, "")));
  }

  const calculatedEntries: PayrollRunCalculationResult["entries"] = [];
  const calculatedAllocations: PayrollRunCalculationResult["allocations"] = [];
  let unallocatedLabor = 0;

  for (const worker of input.workers.filter((item) => item.active !== false).sort((left, right) => left.id.localeCompare(right.id))) {
    const workerEntries = (entriesByWorker.get(worker.id) ?? []).slice().sort((left, right) => left.workDate.localeCompare(right.workDate) || left.id.localeCompare(right.id));
    const workerAttendance = (attendanceByWorker.get(worker.id) ?? []).slice();
    const workerExplicitOvertime = approvedOvertime
      .filter((record) => record.workerId === worker.id)
      .sort((left, right) => String(sourceDate(left as Record<string, unknown>)).localeCompare(String(sourceDate(right as Record<string, unknown>))) || recordId(left, "").localeCompare(recordId(right, "")));
    if (!workerEntries.length && !workerAttendance.length && !workerExplicitOvertime.length) continue;
    if (!isValidRate(worker.defaultRate)) {
      warningsForCalculation(warnings, worker);
      continue;
    }

    const usesAttendance = workerAttendance.length > 0;
    const usesExplicitOvertime = workerExplicitOvertime.length > 0;
    const legacyAllocationMode = !usesAttendance && !usesExplicitOvertime;
    const buckets = new Map<string, AllocationBucket>();
    const resolutionSnapshots: Record<string, unknown>[] = [];
    const attendanceSourceIds: string[] = [];
    const overtimeSourceIds: string[] = [];
    let regularPay = 0;
    let overtimePay = 0;
    let monthlyWorker = worker.defaultPayType === "MONTHLY";

    for (const workEntry of workerEntries) {
      const assignment = assignmentForWorkEntry(worker.id, workEntry.projectId, workEntry.workDate, input.assignments);
      const manualOverride = assignment && isValidRate(assignment.rate) ? undefined : { rate: workEntry.rate };
      const resolution = resolvePayrollRate({ worker, assignment, workDate: workEntry.workDate, manualOverride });
      const line = calculatePayroll({
        payType: resolution.payType,
        rate: resolution.rate,
        regularHours: usesAttendance ? 0 : workEntry.regularHours,
        daysWorked: usesAttendance ? 0 : workEntry.daysWorked,
        overtimeHours: 0,
        monthlyAllocationPercentage: resolution.payType === "MONTHLY" ? 0 : undefined,
      });
      const activityWeight = Math.max(0.01, positiveAmount(workEntry.daysWorked) || positiveAmount(workEntry.regularHours) || positiveAmount(workEntry.overtimeHours) || 1);
      const regularSourceAmount = resolution.payType === "MONTHLY" ? 0 : line.regularPay;
      if (!usesAttendance) regularPay += regularSourceAmount;
      const context = contextForWorkEntry(workEntry);
      addAllocationBucket(buckets, context, workEntry.projectId, activityWeight, legacyAllocationMode ? regularSourceAmount : 0, workEntry.id, workEntry.id);
      monthlyWorker = monthlyWorker && resolution.payType === "MONTHLY";
      resolutionSnapshots.push({ workEntryId: workEntry.id, projectId: workEntry.projectId, laborContext: context, workDate: workEntry.workDate, ...resolution, calculated: line.calculationSnapshot, source: usesAttendance ? "CONFIRMED_ATTENDANCE" : "APPROVED_WORK_ENTRY" });
    }

    for (const record of workerAttendance) {
      const date = sourceDate(record as Record<string, unknown>) || input.periodStart;
      const assignment = assignmentForWorkerDate(worker.id, date, input.assignments);
      const resolution = resolvePayrollRate({ worker, assignment, workDate: date });
      const regularMinutes = record.regularMinutes !== undefined ? positiveAmount(record.regularMinutes) : positiveAmount((record as Record<string, unknown>).regularHours) * 60;
      const paidDayFraction = positiveAmount(record.paidDayFraction);
      const quantity = resolution.payType === "HOURLY" ? regularMinutes / 60 : resolution.payType === "DAILY" ? paidDayFraction : 0;
      const amount = round(quantity * resolution.rate);
      if (resolution.payType !== "MONTHLY") regularPay += amount;
      monthlyWorker = monthlyWorker && resolution.payType === "MONTHLY";
      const id = recordId(record, worker.id + ":" + date);
      attendanceSourceIds.push(id);
      resolutionSnapshots.push({ attendanceId: id, attendanceDate: date, regularMinutes, paidDayFraction, ...resolution, regularPay: amount, source: "CONFIRMED_ATTENDANCE" });
    }

    const legacyOvertimeEntries = workerEntries.filter((entry) => positiveAmount(entry.overtimeHours) > 0);
    const explicitDates = new Set<string>();
    for (const request of workerExplicitOvertime) {
      const date = sourceDate(request as Record<string, unknown>);
      if (!date) continue;
      explicitDates.add(date);
      const assignment = assignmentForWorkerDate(worker.id, date, input.assignments);
      const resolution = resolvePayrollRate({ worker, assignment, workDate: date });
      const rate = resolveOvertimeRate(input, worker.id, date, resolution.rate, request.overtimeRate ?? request.rate);
      const minutes = approvedOvertimeMinutes(request);
      const id = recordId(request, worker.id + ":" + date);
      overtimeSourceIds.push(id);
      overtimePay += minutes / 60 * rate;
      const requestContext = request.laborContext ?? (request.projectId ? "PROJECT" : undefined);
      if (requestContext) addAllocationBucket(buckets, requestContext, request.projectId, minutes / 60, legacyAllocationMode ? minutes / 60 * rate : 0, id);
      resolutionSnapshots.push({ overtimeId: id, overtimeDate: date, approvedMinutes: minutes, overtimeRate: rate, overtimePay: round(minutes / 60 * rate), source: "APPROVED_OVERTIME_REQUEST" });
    }

    for (const workEntry of legacyOvertimeEntries) {
      const date = workEntry.workDate.slice(0, 10);
      if (explicitDates.has(date)) {
        warnings.push("Explicit approved overtime conflicts with legacy work-entry overtime on " + workEntry.id + "; legacy overtime was excluded.");
        continue;
      }
      const assignment = assignmentForWorkEntry(worker.id, workEntry.projectId, date, input.assignments);
      const manualOverride = assignment && isValidRate(assignment.rate) ? undefined : { rate: workEntry.rate };
      const resolution = resolvePayrollRate({ worker, assignment, workDate: date, manualOverride });
      const rate = resolveOvertimeRate(input, worker.id, date, resolution.rate, workEntry.overtimeRate);
      const amount = positiveAmount(workEntry.overtimeHours) * rate;
      overtimePay += amount;
      if (legacyAllocationMode) addAllocationBucket(buckets, contextForWorkEntry(workEntry), workEntry.projectId, positiveAmount(workEntry.overtimeHours), amount, workEntry.id, workEntry.id);
      resolutionSnapshots.push({ workEntryId: workEntry.id, workDate: date, overtimeHours: positiveAmount(workEntry.overtimeHours), overtimeRate: rate, overtimePay: round(amount), source: "LEGACY_WORK_ENTRY_OVERTIME" });
    }

    regularPay = round(regularPay);
    overtimePay = round(overtimePay);
    const basePay = monthlyWorker ? round(worker.defaultRate) : regularPay;
    const grossPay = round(basePay + overtimePay);
    if (!buckets.size) addAllocationBucket(buckets, "UNALLOCATED_REVIEW", undefined, 1, legacyAllocationMode ? grossPay : 0, worker.id);
    const totalWeight = [...buckets.values()].reduce((sum, bucket) => sum + bucket.weight, 0);
    const sourceAllocationTotal = [...buckets.values()].reduce((sum, bucket) => sum + bucket.amount, 0);
    const allocationBase = monthlyWorker || usesAttendance || usesExplicitOvertime ? grossPay : sourceAllocationTotal;
    let projectAllocatedCost = 0;

    for (const bucket of buckets.values()) {
      const amount = round(monthlyWorker || usesAttendance || usesExplicitOvertime ? (totalWeight > 0 ? allocationBase * bucket.weight / totalWeight : 0) : bucket.amount);
      const validProject = bucket.laborContext === "PROJECT" && Boolean(bucket.projectId && bucket.projectId.trim());
      if (bucket.laborContext === "PROJECT" && !validProject) warnings.push("Project labor allocation requires a projectId for worker " + worker.id + ".");
      const outputContext = validProject ? "PROJECT" : bucket.laborContext === "PROJECT" ? "UNALLOCATED_REVIEW" : bucket.laborContext;
      if (validProject) projectAllocatedCost = round(projectAllocatedCost + amount);
      const outputAllocation = {
        workerId: worker.id,
        ...(validProject ? { projectId: bucket.projectId } : {}),
        allocationAmount: amount,
        allocationPercentage: grossPay > 0 ? round(amount / grossPay * 100) : 0,
        laborContext: outputContext,
        source: "TIME_ENTRY" as const,
      };
      calculatedAllocations.push(outputAllocation as PayrollRunCalculationResult["allocations"][number]);
    }
    const actualUnallocated = round(Math.max(0, grossPay - projectAllocatedCost));
    unallocatedLabor += actualUnallocated;
    calculatedEntries.push({
      workerId: worker.id,
      basePay,
      regularPay: round(monthlyWorker ? basePay : regularPay),
      overtimePay,
      allowances: 0,
      grossPay,
      deductions: 0,
      netPay: grossPay,
      projectAllocatedCost: round(projectAllocatedCost),
      calculationSnapshot: {
        version: SNAPSHOT_VERSION,
        runId: input.runId,
        periodId: input.periodId,
        source: usesAttendance ? "CONFIRMED_ATTENDANCE" : "APPROVED_WORK_ENTRIES",
        workEntryIds: workerEntries.map((entry) => entry.id),
        attendanceIds: attendanceSourceIds,
        overtimeIds: overtimeSourceIds,
        leaveIds: allLeave.filter((record) => record.workerId === worker.id).map((record) => recordId(record, worker.id)),
        holidayIds: allHolidays.map((record) => recordId(record, "holiday")),
        rateResolutions: resolutionSnapshots,
        overtimeSource: usesExplicitOvertime ? (legacyOvertimeEntries.length ? "APPROVED_AND_LEGACY_WITH_CONFLICT_CHECK" : "APPROVED_OVERTIME_REQUESTS") : legacyOvertimeEntries.length ? "LEGACY_WORK_ENTRIES" : "NONE",
        sourceFingerprint,
        ...(sourceRevision !== undefined ? { sourceRevision } : {}),
        unallocatedLabor: actualUnallocated,
      },
    });
  }

  for (const entry of input.workEntries) {
    if (entry.status === "APPROVED" && !entry.periodId) warnings.push("Approved work entry " + entry.id + " is not linked to a payroll period and was excluded.");
  }

  return {
    entries: calculatedEntries,
    allocations: calculatedAllocations,
    warnings,
    unallocatedLabor: round(unallocatedLabor),
    sourceFingerprint,
    ...(sourceRevision !== undefined ? { sourceRevision } : {}),
  };
}

function warningsForCalculation(warnings: string[], worker: Worker) {
  warnings.push((worker.displayName || worker.id) + " has no positive default rate and was not calculated.");
}
