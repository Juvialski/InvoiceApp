import type {
  AttendanceRecord,
  LeaveRequest,
  OvertimeRequest,
  PayrollAdjustment,
  PayrollEntry,
  PayrollPeriod,
  PayrollProjectAllocation,
  PayrollRun,
  PayrollHoliday,
  Project,
  ProjectWorkerAssignment,
  Worker,
  WorkEntry,
} from "../types.ts";
import {
  generatePayrollPeriodsAroundReference,
  generatePayrollPeriod,
  mergeGeneratedPayrollPeriods,
  selectCurrentPayrollPeriod,
  getPayrollScheduleVersions,
  type PayrollSchedule,
  type PayrollScheduleVersion,
  type ScheduledPayrollPeriod,
} from "./payrollSchedule.ts";
import { isPayrollPeriodDataBearing, isSafeToDeletePayrollPeriod, reconcileObsoleteGeneratedPayrollPeriods, retireEmptyGeneratedPayrollRuns, selectPrimaryPayrollSchedule } from "./payrollIntegrity.ts";
import type { PayrollImportBatch } from "./payrollImportPersistence.ts";
import {
  buildPayrollDraft,
  type ApprovedWorkEntry,
  type ConfirmedAttendanceRecord,
  type LeaveRequestRecord,
  type OvertimeRequestRecord,
  type PayrollHolidayRecord,
  type AutomationMode,
  type PayrollAssignment,
  type PayrollDraft,
  type RecurringPayrollComponent,
  type WorkerCompensationProfile,
} from "./payrollAutomation.ts";

export interface PayrollScheduleDefaults {
  id: string;
  name: string;
  effectiveFrom: string;
  frequency: "SEMI_MONTHLY";
  firstCutoffDay: number;
  secondCutoffDay: number;
  payDateRule: { type: "BUSINESS_DAYS"; offsetDays: number };
  autoGeneratePeriods: boolean;
  autoCalculate: boolean;
  autoCreateRuns: boolean;
  autoSelectCurrentPeriod: boolean;
  active: boolean;
  automationMode: "MANUAL" | "ASSISTED" | "AUTOMATED";
  versions?: PayrollScheduleVersion[];
}

export interface EnsurePayrollWorkflowInput {
  schedules: readonly PayrollSchedule[];
  periods: readonly PayrollPeriod[];
  runs: readonly PayrollRun[];
  referenceDate: string;
  previous?: number;
  next?: number;
  entries?: readonly PayrollEntry[];
  workEntries?: readonly WorkEntry[];
  importBatches?: readonly PayrollImportBatch[];
  adjustments?: readonly PayrollAdjustment[];
  attendanceRecords?: readonly AttendanceRecord[];
  leaveRequests?: readonly LeaveRequest[];
  overtimeRequests?: readonly OvertimeRequest[];
  holidays?: readonly PayrollHoliday[];
}

export interface EnsurePayrollWorkflowResult {
  periods: PayrollPeriod[];
  runs: PayrollRun[];
  createdPeriods: PayrollPeriod[];
  createdRuns: PayrollRun[];
  selectedPeriodId?: string;
  retiredPeriodIds: string[];
  integrityIssues: string[];
}

export interface PayrollAutomationRecordInput {
  period: PayrollPeriod;
  run: PayrollRun;
  workers: Worker[];
  assignments: ProjectWorkerAssignment[];
  profiles?: WorkerCompensationProfile[];
  recurringComponents?: RecurringPayrollComponent[];
  workEntries: WorkEntry[];
  attendanceRecords?: AttendanceRecord[];
  leaveRequests?: LeaveRequest[];
  overtimeRequests?: OvertimeRequest[];
  holidays?: PayrollHoliday[];
  projects?: Project[];
  mode?: AutomationMode;
  existingAllocations?: PayrollProjectAllocation[];
  existingEntries?: PayrollEntry[];
  sourceRevision?: number;
}

function id(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `local-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function dateOnly(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function defaultSemiMonthlyEffectiveFrom(referenceDate: string) {
  // A newly created default schedule starts at the current full cutoff, not
  // in the middle of an already-defined period. User-edited versions retain
  // their explicit effectiveFrom and are still prevented from backfilling.
  const day = Number(referenceDate.slice(8, 10));
  return `${referenceDate.slice(0, 8)}${day <= 15 ? "01" : "16"}`;
}

export function createDefaultPayrollSchedule(referenceDate = dateOnly()): PayrollScheduleDefaults {
  const scheduleId = id("schedule");
  const versionId = id("schedule-version");
  const effectiveFrom = defaultSemiMonthlyEffectiveFrom(referenceDate);
  return {
    id: scheduleId,
    name: "Standard semi-monthly payroll",
    effectiveFrom,
    frequency: "SEMI_MONTHLY",
    firstCutoffDay: 15,
    secondCutoffDay: 0,
    payDateRule: { type: "BUSINESS_DAYS", offsetDays: 2 },
    autoGeneratePeriods: true,
    autoCalculate: false,
    autoCreateRuns: true,
    autoSelectCurrentPeriod: true,
    automationMode: "ASSISTED",
    active: true,
    versions: [{ id: versionId, scheduleId, version: 1, effectiveFrom, frequency: "SEMI_MONTHLY", customCutoffDay: 15, payDateRule: { type: "BUSINESS_DAYS", offsetDays: 2 }, autoGeneratePeriods: true, autoCalculate: false, autoCreateRuns: true, autoSelectCurrentPeriod: true, automationMode: "ASSISTED", active: true }],
  };
}

export interface PayrollScheduleCompatibilityResult {
  schedule: PayrollSchedule;
  repaired: boolean;
  reason: string;
}

/**
 * Analyzes a payroll schedule for legacy default bootstrap compatibility.
 *
 * InvoiceApp versions before the payroll automation fix created default
 * semi-monthly schedules with effectiveFrom set to the reference date
 * (e.g., 2026-08-25) instead of the period start (2026-08-16). This
 * prevented period generation because the domain engine refuses to
 * emit partial periods before a version's effectiveFrom.
 *
 * This helper detects that specific legacy pattern and returns a
 * corrected schedule when it is safe to do so. User-authored schedules
 * with intentional mid-period effective dates are never modified.
 */
export function analyzePayrollScheduleBootstrapCompatibility(
  schedule: PayrollSchedule,
  referenceDate: string,
  context: {
    periods: readonly PayrollPeriod[];
    runs: readonly PayrollRun[];
    entries: readonly PayrollEntry[];
    workEntries: readonly WorkEntry[];
    importBatches?: readonly PayrollImportBatch[];
    adjustments?: readonly PayrollAdjustment[];
    attendanceRecords?: readonly AttendanceRecord[];
    leaveRequests?: readonly LeaveRequest[];
    overtimeRequests?: readonly OvertimeRequest[];
  },
): PayrollScheduleCompatibilityResult {
  // Only consider active schedules that auto-generate periods
  if (!schedule.active || !schedule.autoGeneratePeriods) {
    return { schedule, repaired: false, reason: "Schedule is not active or does not auto-generate periods." };
  }

  // Only the standard semi-monthly default created by InvoiceApp is eligible
  const isStandardDefault =
    schedule.name === "Standard semi-monthly payroll" &&
    schedule.frequency === "SEMI_MONTHLY" &&
    schedule.payDateRule?.type === "BUSINESS_DAYS" &&
    schedule.payDateRule?.offsetDays === 2 &&
    schedule.autoCreateRuns === true &&
    schedule.automationMode === "ASSISTED";

  if (!isStandardDefault) {
    return { schedule, repaired: false, reason: "Schedule does not match the InvoiceApp standard default profile." };
  }

  // A legacy default has effectiveFrom on a mid-period date (not 1st or 16th)
  const scheduleDay = Number(schedule.effectiveFrom.slice(8, 10));
  const isMidPeriodEffective = scheduleDay !== 1 && scheduleDay !== 16;
  if (!isMidPeriodEffective) {
    return { schedule, repaired: false, reason: "Schedule effectiveFrom is already at a period boundary." };
  }

  // The active version must also have the same mid-period effectiveFrom
  const versions = getPayrollScheduleVersions(schedule);
  const activeVersion = versions.find((v) => v.active && v.version === 1);
  if (!activeVersion) {
    return { schedule, repaired: false, reason: "No active initial version found." };
  }
  const versionDay = Number(activeVersion.effectiveFrom.slice(8, 10));
  if (versionDay !== scheduleDay) {
    return { schedule, repaired: false, reason: "Schedule and version effectiveFrom dates are inconsistent." };
  }

  // The canonical period for the reference date using a synthetic version
  // with the corrected period-boundary effectiveFrom. The actual version
  // has a mid-period effectiveFrom which prevents generation, so we
  // compute what the period would be if effectiveFrom were at the boundary.
  const correctedEffectiveFrom = `${referenceDate.slice(0, 8)}${scheduleDay <= 15 ? "01" : "16"}`;
  const syntheticVersion: PayrollScheduleVersion = {
    ...activeVersion,
    effectiveFrom: correctedEffectiveFrom,
  };
  const canonicalPeriod = generatePayrollPeriod(syntheticVersion, referenceDate);
  if (!canonicalPeriod) {
    return { schedule, repaired: false, reason: "Cannot determine canonical period for reference date." };
  }
  // Use the synthetic period's start as the corrected effectiveFrom
  const finalCorrectedEffectiveFrom = canonicalPeriod.periodStart;

  // Safety checks: no protected data would be affected by backdating
  const lifecycleContext = {
    runs: context.runs,
    entries: context.entries,
    workEntries: context.workEntries,
    importBatches: context.importBatches,
    adjustments: context.adjustments,
    attendanceRecords: context.attendanceRecords,
    leaveRequests: context.leaveRequests,
    overtimeRequests: context.overtimeRequests,
  };

  // Helper for date comparison (ISO dates compare lexicographically)
  const dateBefore = (a: string, b: string) => a < b;
  const dateAfterOrEqual = (a: string, b: string) => a >= b;

  // 1. No data-bearing period exists before the corrected boundary
  const hasEarlierDataBearingPeriod = context.periods.some((period) => {
    if (period.scheduleId !== schedule.id) return false;
    if (dateAfterOrEqual(period.periodEnd, correctedEffectiveFrom)) return false;
    return isPayrollPeriodDataBearing(period, lifecycleContext);
  });
  if (hasEarlierDataBearingPeriod) {
    return { schedule, repaired: false, reason: "Earlier data-bearing periods exist; cannot backdate." };
  }

  // 2. No finalized/paid/approved periods depend on the current effectiveFrom
  const hasFinalizedPeriodAtCurrentBoundary = context.periods.some((period) => {
    if (period.scheduleId !== schedule.id) return false;
    if (period.periodStart !== schedule.effectiveFrom) return false;
    return ["APPROVED", "PAID"].includes(period.status) || Boolean(period.lockedAt);
  });
  if (hasFinalizedPeriodAtCurrentBoundary) {
    return { schedule, repaired: false, reason: "Finalized period exists at current effective boundary; cannot backdate." };
  }

  // 3. No worker/payroll source records would be reinterpreted
  const hasSourceRecordsBeforeCorrected = context.workEntries.some((entry) => {
    if (entry.periodId) return false; // Only unattached entries could be reinterpreted
    return dateAfterOrEqual(entry.workDate, correctedEffectiveFrom) && dateBefore(entry.workDate, schedule.effectiveFrom);
  });
  if (hasSourceRecordsBeforeCorrected) {
    return { schedule, repaired: false, reason: "Source records exist in the backdated window; cannot backdate." };
  }

  // 4. Current generated horizon is empty because effectiveFrom falls inside the canonical period
  const currentGenerated = generatePayrollPeriodsAroundReference(schedule, referenceDate, { previous: 2, next: 2 });
  if (currentGenerated.length > 0) {
    return { schedule, repaired: false, reason: "Periods already generate correctly; no repair needed." };
  }

  // All safety checks passed: construct corrected schedule
  const correctedSchedule: PayrollSchedule = {
    ...schedule,
    effectiveFrom: correctedEffectiveFrom,
    versions: schedule.versions?.map((version) =>
      version.version === 1 && version.effectiveFrom === schedule.effectiveFrom
        ? { ...version, effectiveFrom: correctedEffectiveFrom }
        : version
    ) || [],
  };

  return {
    schedule: correctedSchedule,
    repaired: true,
    reason: `Legacy default schedule repaired: effectiveFrom ${schedule.effectiveFrom} → ${correctedEffectiveFrom}`,
  };
}

function toScheduledPeriod(period: PayrollPeriod, context: Parameters<typeof isPayrollPeriodDataBearing>[1] = {}): ScheduledPayrollPeriod {
  return {
    id: period.id,
    periodKey: `${period.scheduleId || "legacy"}:${period.periodStart}:${period.periodEnd}`,
    scheduleId: period.scheduleId || "legacy",
    scheduleVersionId: period.scheduleVersionId || "legacy",
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    payDate: period.payDate,
    status: period.status as PayrollPeriod["status"],
    active: period.status !== "VOID",
    // Data-bearing periods are protected from prospective version replacement
    // even when their current status is still OPEN. Finalized status/lock
    // protection remains unchanged.
    locked: Boolean(period.lockedAt) || ["APPROVED", "PAID", "VOID"].includes(period.status) || isPayrollPeriodDataBearing(period, context),
    notes: period.notes,
    createdAt: period.createdAt,
    updatedAt: period.updatedAt,
  };
}

function fromScheduledPeriod(period: ScheduledPayrollPeriod, previous?: PayrollPeriod): PayrollPeriod {
  return {
    id: period.id || previous?.id || id("period"),
    userId: previous?.userId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    payDate: period.payDate,
    scheduleId: period.scheduleId === "legacy" ? previous?.scheduleId : period.scheduleId,
    scheduleVersionId: period.scheduleVersionId === "legacy" ? previous?.scheduleVersionId : period.scheduleVersionId,
    autoGenerated: period.scheduleId !== "legacy" || previous?.autoGenerated,
    lockedAt: previous?.lockedAt,
    status: period.status as PayrollPeriod["status"],
    notes: period.notes,
    createdAt: previous?.createdAt || period.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function boundary(period: Pick<PayrollPeriod, "scheduleId" | "periodStart" | "periodEnd">) {
  return `${period.scheduleId || "legacy"}:${period.periodStart}:${period.periodEnd}`;
}

/** Ensures only a bounded period horizon and one draft run per generated period. */
export function ensurePayrollPeriodsAndRuns(input: EnsurePayrollWorkflowInput): EnsurePayrollWorkflowResult {
  const previous = input.previous ?? 2;
  const next = input.next ?? 2;
  const initialPeriods = [...input.periods];
  const primarySchedule = selectPrimaryPayrollSchedule(input.schedules.filter((schedule) => schedule.active && schedule.autoGeneratePeriods));
  let periods = [...input.periods];
  const generated: ReturnType<typeof generatePayrollPeriodsAroundReference> = [];
  if (primarySchedule) {
    generated.push(...generatePayrollPeriodsAroundReference(primarySchedule, input.referenceDate, { previous, next }));
    const lifecycleContext = {
      runs: input.runs,
      entries: input.entries,
      workEntries: input.workEntries,
      importBatches: input.importBatches,
      adjustments: input.adjustments,
      attendanceRecords: input.attendanceRecords,
      leaveRequests: input.leaveRequests,
      overtimeRequests: input.overtimeRequests,
    };
    const disposableSchedulePeriodIds = new Set(periods.filter((period) => period.scheduleId === primarySchedule.id && period.status === "VOID" && isSafeToDeletePayrollPeriod(period, lifecycleContext)).map((period) => period.id));
    const currentSchedulePeriods = periods.filter((period) => period.scheduleId === primarySchedule.id && !disposableSchedulePeriodIds.has(period.id));
    const merged = mergeGeneratedPayrollPeriods(currentSchedulePeriods.map((period) => toScheduledPeriod(period, lifecycleContext)), generated);
    const byId = new Map(currentSchedulePeriods.map((period) => [period.id, period]));
    const mergedPeriods = merged.map((period) => fromScheduledPeriod(period, period.id ? byId.get(period.id) : undefined));
    const mergedIds = new Set(mergedPeriods.map((period) => period.id));
    periods = [...periods.filter((period) => !disposableSchedulePeriodIds.has(period.id) && (period.scheduleId !== primarySchedule.id || !mergedIds.has(period.id))), ...mergedPeriods];
  }

  const desiredPeriods = generated.map((period) => fromScheduledPeriod(period));
  const horizonEnd = desiredPeriods.reduce((latest, period) => period.periodEnd > latest ? period.periodEnd : latest, input.referenceDate);
  const reconciliation = reconcileObsoleteGeneratedPayrollPeriods(periods, desiredPeriods, {
    referenceDate: input.referenceDate,
    horizonEnd,
    runs: input.runs,
    entries: input.entries,
    workEntries: input.workEntries,
    importBatches: input.importBatches,
    adjustments: input.adjustments,
    attendanceRecords: input.attendanceRecords,
    leaveRequests: input.leaveRequests,
    overtimeRequests: input.overtimeRequests,
  });
  periods = reconciliation.periods;

  const currentCandidates = primarySchedule
    ? periods.filter((period) => period.scheduleId === primarySchedule.id && period.status !== "VOID").map((period) => toScheduledPeriod(period, { runs: input.runs, entries: input.entries, workEntries: input.workEntries, importBatches: input.importBatches, adjustments: input.adjustments, attendanceRecords: input.attendanceRecords, leaveRequests: input.leaveRequests, overtimeRequests: input.overtimeRequests }))
    : [];
  const current = selectCurrentPayrollPeriod(currentCandidates, input.referenceDate);
  if (current) {
    const currentPeriod = periods.find((period) => period.id === current.id);
    if (currentPeriod && currentPeriod.status === "DRAFT") {
      const opened = { ...currentPeriod, status: "OPEN" as const, updatedAt: new Date().toISOString() };
      periods = periods.map((period) => period.id === opened.id ? opened : period);
    }
  }

  let runs = retireEmptyGeneratedPayrollRuns(input.runs, reconciliation.retiredPeriodIds, input.entries || []);
  const createdRuns: PayrollRun[] = [];
  if (primarySchedule && current) {
    const autoCreateRuns = Boolean(primarySchedule.autoCreateRuns ?? primarySchedule.autoCalculate);
    if (autoCreateRuns && !runs.some((run) => run.periodId === current.id)) {
      createdRuns.push({ id: id("run"), periodId: current.id, status: "DRAFT", createdAt: new Date().toISOString(), notes: "Auto-created draft run for the current payroll period." });
    }
  }
  runs = [...createdRuns, ...runs];

  const knownPeriods = new Set(initialPeriods.map((period) => period.id));
  const createdPeriods = periods.filter((period) => !knownPeriods.has(period.id));
  const sortedPeriods = periods.slice().sort((left, right) => right.periodEnd.localeCompare(left.periodEnd) || left.periodStart.localeCompare(right.periodStart));
  return {
    periods: sortedPeriods,
    runs,
    createdPeriods,
    createdRuns,
    selectedPeriodId: primarySchedule?.autoSelectCurrentPeriod === false ? undefined : current?.id,
    retiredPeriodIds: reconciliation.retiredPeriodIds,
    integrityIssues: reconciliation.issues.map((issue) => issue.message),
  };
}

function rosterWorker(worker: Worker) {
  return { id: worker.id, name: worker.displayName, archived: !worker.active, rate: worker.defaultRate, frequency: worker.defaultPayType, defaultLaborContext: "UNALLOCATED_REVIEW" as const };
}

function profileInput(profile: WorkerCompensationProfile) { return { ...profile, effectiveFrom: profile.effectiveFrom instanceof Date ? profile.effectiveFrom.toISOString() : profile.effectiveFrom, effectiveTo: profile.effectiveTo instanceof Date ? profile.effectiveTo.toISOString() : profile.effectiveTo }; }
function assignmentInput(assignment: ProjectWorkerAssignment): PayrollAssignment { return { id: assignment.id, workerId: assignment.workerId, effectiveFrom: assignment.startDate, effectiveTo: assignment.endDate, rate: assignment.rate, frequency: assignment.payType, laborContext: "PROJECT", projectId: assignment.projectId }; }
function workInput(entry: WorkEntry, projects: Project[]): ApprovedWorkEntry {
  const project = projects.find((item) => item.id === entry.projectId);
  return { id: entry.id, workerId: entry.workerId, periodId: entry.periodId, workDate: entry.workDate, approved: entry.status === "APPROVED", hours: entry.regularHours, days: entry.daysWorked, overtimeHours: entry.overtimeHours, overtimeRate: entry.overtimeRate, laborContext: entry.laborContext || (entry.projectId ? "PROJECT" : "UNALLOCATED_REVIEW"), projectId: entry.projectId, project: project ? { id: project.id, archived: project.status === "ARCHIVED", active: project.status !== "ARCHIVED" } : undefined, projectArchived: project?.status === "ARCHIVED" };
}

export function buildAutomaticPayrollDraft(input: PayrollAutomationRecordInput): PayrollDraft {
  return buildPayrollDraft({
    period: { id: input.period.id, startDate: input.period.periodStart, endDate: input.period.periodEnd, sourceRevision: input.period.sourceRevision },
    mode: input.mode || "ASSISTED",
    workers: input.workers.map(rosterWorker),
    profiles: (input.profiles || []).map(profileInput),
    assignments: input.assignments.map(assignmentInput),
    recurringComponents: input.recurringComponents || [],
    workEntries: input.workEntries.map((entry) => workInput(entry, input.projects || [])),
    attendanceRecords: (input.attendanceRecords || []) as unknown as ConfirmedAttendanceRecord[],
    leaveRequests: (input.leaveRequests || []) as unknown as LeaveRequestRecord[],
    overtimeRequests: (input.overtimeRequests || []) as unknown as OvertimeRequestRecord[],
    holidays: (input.holidays || []) as unknown as PayrollHolidayRecord[],
    projects: input.projects || [],
    sourceRevision: input.sourceRevision ?? input.period.sourceRevision,
    existingPayrollAllocations: input.existingAllocations?.map((allocation) => ({ id: allocation.id, amount: allocation.allocationAmount, projectId: allocation.projectId })) || [],
  });
}

export interface PayrollDraftRecords {
  entries: PayrollEntry[];
  allocations: PayrollProjectAllocation[];
}

export function payrollDraftToRecords(draft: PayrollDraft, runId: string, now = new Date().toISOString()): PayrollDraftRecords {
  const entries: PayrollEntry[] = draft.entries.map((entry) => {
    const earnings = entry.components.filter((component) => component.type === "EARNING").reduce((sum, component) => sum + component.amount, 0);
    const projectAllocatedCost = draft.allocations.filter((allocation) => allocation.workerId === entry.workerId && allocation.laborContext === "PROJECT").reduce((sum, allocation) => sum + allocation.amount, 0);
    const context = draft.allocations.find((allocation) => allocation.workerId === entry.workerId && allocation.laborContext !== "PROJECT")?.laborContext;
    return {
      id: id("entry"),
      payrollRunId: runId,
      workerId: entry.workerId,
      basePay: Math.max(0, entry.grossEarnings - earnings),
      regularPay: Math.max(0, entry.grossEarnings - earnings),
      overtimePay: 0,
      allowances: earnings,
      otherEarnings: earnings,
      grossPay: entry.grossEarnings,
      deductions: entry.deductions,
      otherDeductions: entry.deductions,
      employerCosts: entry.employerCosts,
      netPay: Math.max(0, entry.netPay),
      costContext: context ? { type: context, needsReview: context === "UNALLOCATED_REVIEW", label: context } : undefined,
      projectAllocatedCost,
      calculationSnapshot: { ...entry.source, automationMode: draft.mode, workEntryIds: entry.workEntryIds, components: entry.components, exceptions: draft.exceptions, ...(draft.sourceFingerprint ? { sourceFingerprint: draft.sourceFingerprint } : {}), ...(draft.sourceRevision !== undefined ? { sourceRevision: draft.sourceRevision } : {}) },
      createdAt: now,
    };
  });
  const entryIdByWorker = new Map(entries.map((entry) => [entry.workerId, entry.id]));
  const allocations: PayrollProjectAllocation[] = draft.allocations.filter((allocation) => allocation.laborContext === "PROJECT" && allocation.projectId).map((allocation) => ({ id: id("allocation"), payrollEntryId: entryIdByWorker.get(allocation.workerId) || "", projectId: allocation.projectId!, allocationAmount: allocation.amount, allocationPercentage: 0, source: "TIME_ENTRY" as const })).filter((allocation) => allocation.payrollEntryId);
  return { entries, allocations };
}
