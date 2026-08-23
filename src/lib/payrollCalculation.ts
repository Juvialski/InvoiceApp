import type {
  PayType,
  PayrollAdjustment,
  ProjectWorkerAssignment,
  Worker,
} from "../types.ts";

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

export interface PayrollRunCalculationInput {
  runId: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  workers: Worker[];
  assignments: ProjectWorkerAssignment[];
  workEntries: Array<Pick<import("../types.ts").WorkEntry, "id" | "workerId" | "projectId" | "periodId" | "workDate" | "regularHours" | "overtimeHours" | "daysWorked" | "rate" | "overtimeRate" | "status">>;
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
    source: "TIME_ENTRY";
  }>;
  warnings: string[];
  unallocatedLabor: number;
}

function localCalculationId(runId: string, workerId: string) {
  return `payroll:${runId}:${workerId}`;
}

function assignmentForWorkEntry(workerId: string, projectId: string, workDate: string, assignments: ProjectWorkerAssignment[]) {
  return assignments
    .filter((assignment) => assignment.workerId === workerId && assignment.projectId === projectId && isAssignmentValidForWorkDate(assignment, workDate))
    .sort((left, right) => right.startDate.localeCompare(left.startDate) || left.id.localeCompare(right.id))[0];
}

/**
 * Builds a reproducible draft/calculated run from approved, period-linked work
 * entries. Time entries are the only source consumed here; unallocated
 * monthly labor remains visible instead of being silently assigned.
 */
export function calculatePayrollRunFromWorkEntries(input: PayrollRunCalculationInput): PayrollRunCalculationResult {
  const warnings: string[] = [];
  const entriesByWorker = new Map<string, PayrollRunCalculationInput["workEntries"]>();
  for (const entry of input.workEntries) {
    if (entry.status !== "APPROVED") continue;
    if (entry.periodId !== input.periodId || entry.workDate < input.periodStart || entry.workDate > input.periodEnd) continue;
    const current = entriesByWorker.get(entry.workerId) || [];
    current.push(entry);
    entriesByWorker.set(entry.workerId, current);
  }

  const calculatedEntries: PayrollRunCalculationResult["entries"] = [];
  const calculatedAllocations: PayrollRunCalculationResult["allocations"] = [];
  let unallocatedLabor = 0;

  for (const worker of input.workers.filter((item) => item.active).sort((left, right) => left.id.localeCompare(right.id))) {
    const workerEntries = (entriesByWorker.get(worker.id) || []).slice().sort((left, right) => left.workDate.localeCompare(right.workDate) || left.id.localeCompare(right.id));
    if (!workerEntries.length) continue;
    if (!isValidRate(worker.defaultRate)) {
      warnings.push(`${worker.displayName || worker.id} has no positive default rate and was not calculated.`);
      continue;
    }

    const projectCosts = new Map<string, number>();
    const projectWeights = new Map<string, number>();
    const resolutionSnapshots: Record<string, unknown>[] = [];
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
        regularHours: workEntry.regularHours,
        daysWorked: workEntry.daysWorked,
        overtimeHours: workEntry.overtimeHours,
        overtimeRate: workEntry.overtimeRate,
        monthlyAllocationPercentage: resolution.payType === "MONTHLY" ? 0 : undefined,
      });
      const activityWeight = Math.max(0.01, Number(workEntry.daysWorked) || Number(workEntry.regularHours) || Number(workEntry.overtimeHours) || 1);
      const projectLineCost = resolution.payType === "MONTHLY" ? 0 : line.regularPay + line.overtimePay;
      projectCosts.set(workEntry.projectId, round((projectCosts.get(workEntry.projectId) || 0) + projectLineCost));
      projectWeights.set(workEntry.projectId, (projectWeights.get(workEntry.projectId) || 0) + activityWeight);
      regularPay += resolution.payType === "MONTHLY" ? 0 : line.regularPay;
      overtimePay += line.overtimePay;
      monthlyWorker = monthlyWorker && resolution.payType === "MONTHLY";
      resolutionSnapshots.push({ workEntryId: workEntry.id, projectId: workEntry.projectId, workDate: workEntry.workDate, ...resolution, calculated: line.calculationSnapshot });
    }

    const basePay = monthlyWorker ? round(worker.defaultRate) : round(regularPay);
    const grossPay = round(basePay + overtimePay);
    const weightedProjectTotal = [...projectWeights.values()].reduce((sum, value) => sum + value, 0);
    const projectSourceTotal = [...projectCosts.values()].reduce((sum, value) => sum + value, 0);
    const allocationBase = monthlyWorker ? grossPay : projectSourceTotal;
    const allocationsForWorker = [...(monthlyWorker ? projectWeights : projectCosts).entries()]
      .filter(([, value]) => value > 0)
      .map(([projectId, value]) => ({
        projectId,
        allocationAmount: round(monthlyWorker ? allocationBase * value / weightedProjectTotal : value),
      }));
    const projectAllocatedCost = round(allocationsForWorker.reduce((sum, allocation) => sum + allocation.allocationAmount, 0));
    unallocatedLabor += Math.max(0, grossPay - projectAllocatedCost);
    calculatedEntries.push({
      workerId: worker.id,
      basePay,
      regularPay: round(monthlyWorker ? basePay : regularPay),
      overtimePay: round(overtimePay),
      allowances: 0,
      grossPay,
      deductions: 0,
      netPay: grossPay,
      projectAllocatedCost,
      calculationSnapshot: {
        version: SNAPSHOT_VERSION,
        runId: input.runId,
        periodId: input.periodId,
        source: "APPROVED_WORK_ENTRIES",
        workEntryIds: workerEntries.map((entry) => entry.id),
        rateResolutions: resolutionSnapshots,
        unallocatedLabor: round(Math.max(0, grossPay - projectAllocatedCost)),
      },
    });
    for (const allocation of allocationsForWorker) {
      calculatedAllocations.push({ workerId: worker.id, ...allocation, allocationPercentage: grossPay > 0 ? round(allocation.allocationAmount / grossPay * 100) : 0, source: "TIME_ENTRY" });
    }
  }

  for (const entry of input.workEntries) {
    if (entry.status === "APPROVED" && !entry.periodId) warnings.push(`Approved work entry ${entry.id} is not linked to a payroll period and was excluded.`);
  }

  return { entries: calculatedEntries, allocations: calculatedAllocations, warnings, unallocatedLabor: round(unallocatedLabor) };
}
