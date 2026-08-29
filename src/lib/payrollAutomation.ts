/**
 * Pure payroll automation primitives.
 *
 * The input types intentionally use structural, optional fields so callers can
 * pass the existing work-entry, worker, and payroll-allocation records without
 * mapping them through persistence-specific types first.
 */

import {
  fingerprintPayrollSources,
  type PayrollSourceRevisionInput,
} from "./payrollSourceRevision.ts";

export const COMPENSATION_FREQUENCIES = ['MONTHLY', 'DAILY', 'HOURLY'] as const;
export type CompensationFrequency = (typeof COMPENSATION_FREQUENCIES)[number];

export const LABOR_CONTEXTS = [
  'PROJECT',
  'ADMIN_OFFICE',
  'GENERAL_OVERHEAD',
  'UNALLOCATED_REVIEW',
] as const;
export type LaborContext = (typeof LABOR_CONTEXTS)[number];

export const PAYROLL_COMPONENT_TYPES = [
  'EARNING',
  'DEDUCTION',
  'EMPLOYER_COST',
] as const;
export type PayrollComponentType = (typeof PAYROLL_COMPONENT_TYPES)[number];

export const AUTOMATION_MODES = ['MANUAL', 'ASSISTED', 'AUTOMATED'] as const;
export type AutomationMode = (typeof AUTOMATION_MODES)[number];

export const EXCEPTION_SEVERITIES = ['BLOCKING', 'WARNING', 'READY'] as const;
export type ExceptionSeverity = (typeof EXCEPTION_SEVERITIES)[number];

export type DateLike = string | Date;

export interface WorkerCompensationProfile {
  id?: string;
  workerId: string;
  effectiveFrom: DateLike;
  effectiveTo?: DateLike;
  frequency: CompensationFrequency;
  rate: number;
  defaultLaborContext: LaborContext;
  defaultProjectId?: string;
  active?: boolean;
}

export interface WorkerRosterItem {
  id: string;
  name?: string;
  archived?: boolean;
  duplicateKey?: string;
  rate?: number;
  frequency?: CompensationFrequency;
  defaultLaborContext?: LaborContext;
  defaultProjectId?: string;
}

export interface PayrollAssignment {
  id?: string;
  workerId: string;
  effectiveFrom: DateLike;
  effectiveTo?: DateLike;
  rate?: number;
  frequency?: CompensationFrequency;
  laborContext?: LaborContext;
  projectId?: string;
  defaultProjectId?: string;
  overtimeRate?: number;
}

export interface RecurringPayrollComponent {
  id: string;
  workerId: string;
  type: PayrollComponentType;
  code?: string;
  name?: string;
  amount?: number;
  /** Optional percentage, expressed as 0.1 for 10%, of the relevant base. */
  rate?: number;
  effectiveFrom: DateLike;
  effectiveTo?: DateLike;
  active: boolean;
}

export interface ApprovedWorkEntry {
  id: string;
  workerId: string;
  workDate: DateLike;
  approved?: boolean;
  periodId?: string;
  hours?: number;
  days?: number;
  estimatedCost?: number;
  projectId?: string;
  laborContext?: LaborContext;
  assignmentId?: string;
  overtimeHours?: number;
  overtimeRate?: number;
  /** Import provenance used to explain unmatched or ambiguous source rows. */
  importSignal?: {
    status?: 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS';
    workerId?: string;
    workerIds?: string[];
  };
  project?: { id?: string; archived?: boolean; active?: boolean };
  projectArchived?: boolean;
}

export interface ConfirmedAttendanceRecord {
  id?: string;
  workerId: string;
  attendanceDate?: DateLike;
  date?: DateLike;
  workDate?: DateLike;
  periodId?: string;
  recordStatus?: string;
  status?: string;
  confirmed?: boolean;
  regularMinutes?: number;
  paidDayFraction?: number;
  overtimeMinutes?: number;
  [key: string]: unknown;
}

export interface LeaveRequestRecord {
  id?: string;
  workerId: string;
  startDate?: DateLike;
  endDate?: DateLike;
  leaveDate?: DateLike;
  status?: string;
  paid?: boolean;
  [key: string]: unknown;
}

export interface OvertimeRequestRecord {
  id?: string;
  workerId: string;
  periodId?: string;
  overtimeDate?: DateLike;
  workDate?: DateLike;
  date?: DateLike;
  requestedMinutes?: number;
  approvedMinutes?: number;
  approvedHours?: number;
  overtimeRate?: number;
  rate?: number;
  status?: string;
  projectId?: string;
  laborContext?: LaborContext;
  [key: string]: unknown;
}

export interface PayrollHolidayRecord {
  id?: string;
  holidayDate?: DateLike;
  date?: DateLike;
  active?: boolean;
  [key: string]: unknown;
}

export interface ExistingPayrollAllocation {
  id?: string;
  workerId?: string;
  workEntryId?: string;
  amount: number;
  projectId?: string;
  laborContext?: LaborContext;
  confirmed?: boolean;
}

export interface PayrollPeriod {
  id: string;
  startDate: DateLike;
  endDate: DateLike;
  sourceRevision?: number;
}

export interface PayrollAutomationInput {
  period: PayrollPeriod;
  workEntries?: ApprovedWorkEntry[];
  profiles?: WorkerCompensationProfile[];
  assignments?: PayrollAssignment[];
  recurringComponents?: RecurringPayrollComponent[];
  workers?: WorkerRosterItem[];
  existingPayrollAllocations?: ExistingPayrollAllocation[];
  mode?: AutomationMode;
  /** Amount tolerance used for allocation and reconciliation checks. */
  tolerance?: number;
  /** An explicit rule may be supplied for overtime rows. */
  overtimeRule?: { multiplier?: number; rateFor?: (workerId: string, workDate: DateLike) => number | undefined };
  /** Confirmed attendance is the primary regular-pay source when present. */
  confirmedAttendance?: ConfirmedAttendanceRecord[];
  attendance?: ConfirmedAttendanceRecord[];
  attendanceRecords?: ConfirmedAttendanceRecord[];
  /** Leave and holiday records are source inputs; no absence deduction is inferred. */
  leave?: LeaveRequestRecord[];
  leaves?: LeaveRequestRecord[];
  leaveRequests?: LeaveRequestRecord[];
  /** Only APPROVED explicit overtime requests are consumed by the new workflow. */
  overtime?: OvertimeRequestRecord[];
  overtimeRequests?: OvertimeRequestRecord[];
  /** Active holiday records are fingerprinted and never create absence deductions. */
  holidays?: PayrollHolidayRecord[];
  payrollHolidays?: PayrollHolidayRecord[];
  /** Project identity/status is a payroll source only when referenced by a source row. */
  projects?: readonly unknown[];
  sourceRevision?: number;
  periodSourceRevision?: number;
}

export interface CalculationSourceMetadata {
  kind:
    | 'ASSIGNMENT_OVERRIDE'
    | 'COMPENSATION_PROFILE'
    | 'WORKER_ROSTER'
    | 'WORK_ENTRY'
    | 'CONFIRMED_ATTENDANCE'
    | 'APPROVED_OVERTIME'
    | 'LEAVE_OR_HOLIDAY'
    | 'RECURRING_COMPONENT'
    | 'CONFIRMED_PAYROLL_ALLOCATION'
    | 'MANUAL';
  sourceIds: string[];
  description: string;
}

export interface ResolvedCompensation {
  workerId: string;
  frequency: CompensationFrequency;
  rate: number;
  laborContext: LaborContext;
  projectId?: string;
  overtimeRate?: number;
  source: CalculationSourceMetadata;
  profile?: WorkerCompensationProfile;
  assignment?: PayrollAssignment;
}

export interface PayrollComponentLine {
  id: string;
  workerId: string;
  type: PayrollComponentType;
  code?: string;
  name?: string;
  amount: number;
  source: CalculationSourceMetadata;
}

export interface PayrollDraftEntry {
  id: string;
  workerId: string;
  periodId: string;
  grossEarnings: number;
  deductions: number;
  employerCosts: number;
  netPay: number;
  workEntryIds: string[];
  components: PayrollComponentLine[];
  source: CalculationSourceMetadata;
}

export interface PayrollDraftAllocation {
  id: string;
  workerId: string;
  amount: number;
  laborContext: LaborContext;
  /** Omitted for overhead and unallocated review; never invent a project id. */
  projectId?: string;
  workEntryIds: string[];
  source: CalculationSourceMetadata;
}

export type PayrollExceptionCode =
  | 'MISSING_RATE'
  | 'UNMATCHED_IMPORT_SIGNAL'
  | 'AMBIGUOUS_IMPORT_SIGNAL'
  | 'INVALID_PROJECT_CONTEXT'
  | 'ARCHIVED_PROJECT_CONTEXT'
  | 'ALLOCATION_MISMATCH'
  | 'DUPLICATE_WORKER'
  | 'NO_ENTRIES'
  | 'OVERTIME_WITHOUT_RULE'
  | 'OVERTIME_CONFLICT'
  | 'RECONCILIATION_DISCREPANCY';

export interface PayrollException {
  code: PayrollExceptionCode;
  severity: Exclude<ExceptionSeverity, 'READY'>;
  message: string;
  workerId?: string;
  workEntryIds?: string[];
  amount?: number;
  expected?: number;
  actual?: number;
}

export interface PayrollDraft {
  mode: AutomationMode;
  entries: PayrollDraftEntry[];
  allocations: PayrollDraftAllocation[];
  exceptions: PayrollException[];
  readiness: ExceptionSeverity;
  trace: CalculationSourceMetadata[];
  totals: {
    grossEarnings: number;
    deductions: number;
    employerCosts: number;
    allocated: number;
  };
  sourceFingerprint?: string;
  sourceRevision?: number;
}

function time(value: DateLike): number {
  const result = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(result) ? Number.NaN : result;
}

function dateKey(value: DateLike): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function activeOn(from: DateLike, to: DateLike | undefined, date: DateLike): boolean {
  const current = time(date);
  const start = time(from);
  const end = to === undefined ? Number.POSITIVE_INFINITY : time(to);
  return Number.isFinite(current) && Number.isFinite(start) && current >= start && current <= end;
}

function mostRecent<T extends { effectiveFrom: DateLike; id?: string }>(items: T[]): T | undefined {
  return [...items].sort((a, b) => {
    const byDate = time(b.effectiveFrom) - time(a.effectiveFrom);
    return byDate || String(a.id ?? '').localeCompare(String(b.id ?? ''));
  })[0];
}

function finiteNonNegative(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Resolve the assignment in force on a date, with deterministic latest-start precedence. */
export function resolveAssignment(
  workerId: string,
  workDate: DateLike,
  assignments: PayrollAssignment[] = [],
): PayrollAssignment | undefined {
  return mostRecent(
    assignments.filter(
      (assignment) => assignment.workerId === workerId && activeOn(assignment.effectiveFrom, assignment.effectiveTo, workDate),
    ),
  );
}

/** Resolve compensation; assignment values override the effective profile/worker fallback. */
export function resolveCompensation(
  workerId: string,
  workDate: DateLike,
  profiles: WorkerCompensationProfile[] = [],
  assignments: PayrollAssignment[] = [],
  worker?: WorkerRosterItem,
): ResolvedCompensation | undefined {
  const assignment = resolveAssignment(workerId, workDate, assignments);
  const profile = mostRecent(
    profiles.filter(
      (candidate) => candidate.workerId === workerId && activeOn(candidate.effectiveFrom, candidate.effectiveTo, workDate),
    ),
  );

  const frequency = assignment?.frequency ?? profile?.frequency ?? worker?.frequency;
  const rate = assignment?.rate ?? profile?.rate ?? worker?.rate;
  if (frequency === undefined || rate === undefined || !Number.isFinite(rate)) return undefined;

  const source: CalculationSourceMetadata = assignment?.rate !== undefined || assignment?.frequency !== undefined
    ? {
        kind: 'ASSIGNMENT_OVERRIDE',
        sourceIds: [assignment.id ?? `${workerId}:${dateKey(workDate)}`],
        description: 'Effective payroll assignment override',
      }
    : profile
      ? {
          kind: 'COMPENSATION_PROFILE',
          sourceIds: [profile.id ?? `${workerId}:${dateKey(workDate)}`],
          description: 'Effective worker compensation profile',
        }
      : {
          kind: 'WORKER_ROSTER',
          sourceIds: [workerId],
          description: 'Worker roster compensation fallback',
        };

  return {
    workerId,
    frequency,
    rate,
    laborContext: assignment?.laborContext ?? profile?.defaultLaborContext ?? worker?.defaultLaborContext ?? 'UNALLOCATED_REVIEW',
    projectId: assignment?.projectId ?? assignment?.defaultProjectId ?? profile?.defaultProjectId ?? worker?.defaultProjectId,
    overtimeRate: assignment?.overtimeRate,
    source,
    profile,
    assignment,
  };
}

function inPeriod(entry: ApprovedWorkEntry, period: PayrollPeriod): boolean {
  if (entry.approved === false || (entry.periodId !== undefined && entry.periodId !== period.id)) return false;
  const work = time(entry.workDate);
  return work >= time(period.startDate) && work <= time(period.endDate);
}

function overlapsPeriod(from: DateLike, to: DateLike | undefined, period: PayrollPeriod): boolean {
  const start = time(from);
  const end = to === undefined ? Number.POSITIVE_INFINITY : time(to);
  return Number.isFinite(start) && start <= time(period.endDate) && end >= time(period.startDate);
}

function componentAmount(component: RecurringPayrollComponent, base: number): number {
  if (component.amount !== undefined) return finiteNonNegative(component.amount);
  return base * finiteNonNegative(component.rate);
}

function exception(
  code: PayrollExceptionCode,
  severity: Exclude<ExceptionSeverity, 'READY'>,
  message: string,
  extra: Partial<PayrollException> = {},
): PayrollException {
  return { code, severity, message, ...extra };
}

export function classifyPayrollExceptions(exceptions: PayrollException[]): ExceptionSeverity {
  if (exceptions.some((item) => item.severity === 'BLOCKING')) return 'BLOCKING';
  if (exceptions.some((item) => item.severity === 'WARNING')) return 'WARNING';
  return 'READY';
}

/**
 * Build a deterministic payroll draft. No input is mutated and no project id is
 * synthesized: allocations without a valid project remain context-only.
 */
export function buildPayrollDraft(input: PayrollAutomationInput): PayrollDraft {
  const hasNewWorkflowSources = Boolean(
    input.confirmedAttendance?.length ||
    input.attendance?.length ||
    input.attendanceRecords?.length ||
    input.leave?.length ||
    input.leaves?.length ||
    input.leaveRequests?.length ||
    input.overtime?.length ||
    input.overtimeRequests?.length ||
    input.holidays?.length ||
    input.payrollHolidays?.length ||
    input.sourceRevision !== undefined ||
    input.periodSourceRevision !== undefined
  );
  if (hasNewWorkflowSources) return buildPayrollDraftFromConfirmedSources(input);
  return buildPayrollDraftLegacy(input);
}

function buildPayrollDraftLegacy(input: PayrollAutomationInput): PayrollDraft {
  const mode = input.mode ?? 'ASSISTED';
  const tolerance = input.tolerance ?? 0.01;
  const entries = (input.workEntries ?? []).filter((entry) => inPeriod(entry, input.period));
  const exceptions: PayrollException[] = [];
  const traces: CalculationSourceMetadata[] = [];
  const workers = input.workers ?? [];
  const workerIds = new Set<string>([
    ...workers.map((worker) => worker.id),
    ...entries.map((entry) => entry.workerId),
    ...(input.profiles ?? []).map((profile) => profile.workerId),
  ]);

  const duplicateGroups = new Map<string, string[]>();
  for (const worker of workers) {
    const key = worker.duplicateKey ?? worker.name?.trim().toLowerCase() ?? worker.id;
    duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), worker.id]);
  }
  for (const ids of duplicateGroups.values()) {
    if (ids.length > 1) {
      exceptions.push(exception('DUPLICATE_WORKER', 'BLOCKING', `Duplicate worker roster records: ${ids.join(', ')}`, { workerId: ids[0] }));
    }
  }

  const byWorker = new Map<string, ApprovedWorkEntry[]>();
  for (const entry of entries) byWorker.set(entry.workerId, [...(byWorker.get(entry.workerId) ?? []), entry]);
  const draftEntries: PayrollDraftEntry[] = [];
  const allocations: PayrollDraftAllocation[] = [];

  for (const workerId of [...workerIds].sort()) {
    const workerEntries = byWorker.get(workerId) ?? [];
    const rosterWorker = workers.find((worker) => worker.id === workerId);
    if (workerEntries.length === 0) {
      exceptions.push(exception('NO_ENTRIES', 'WARNING', `No approved period-linked work entries for ${workerId}`, { workerId }));
    }

    for (const entry of workerEntries) {
      if (entry.importSignal?.status === 'UNMATCHED') {
        exceptions.push(exception('UNMATCHED_IMPORT_SIGNAL', 'BLOCKING', `Import signal did not match a worker for ${entry.id}`, { workerId, workEntryIds: [entry.id] }));
      } else if (entry.importSignal?.status === 'AMBIGUOUS') {
        exceptions.push(exception('AMBIGUOUS_IMPORT_SIGNAL', 'WARNING', `Import signal matched multiple workers for ${entry.id}`, { workerId, workEntryIds: [entry.id] }));
      }
      if (entry.projectArchived || entry.project?.archived) {
        exceptions.push(exception('ARCHIVED_PROJECT_CONTEXT', 'BLOCKING', `Archived project context on work entry ${entry.id}`, { workerId, workEntryIds: [entry.id] }));
      }
      if (entry.projectId !== undefined && entry.projectId.trim() === '') {
        exceptions.push(exception('INVALID_PROJECT_CONTEXT', 'BLOCKING', `Invalid project context on work entry ${entry.id}`, { workerId, workEntryIds: [entry.id] }));
      }
    }

    const firstDate = workerEntries[0]?.workDate ?? input.period.startDate;
    const resolvedByEntry = new Map(
      workerEntries.map((entry) => [entry.id, resolveCompensation(workerId, entry.workDate, input.profiles, input.assignments, rosterWorker)] as const),
    );
    const compensation = resolvedByEntry.get(workerEntries[0]?.id ?? '') ??
      [...resolvedByEntry.values()].find((value): value is ResolvedCompensation => value !== undefined) ??
      resolveCompensation(workerId, firstDate, input.profiles, input.assignments, rosterWorker);
    if (!compensation) {
      exceptions.push(exception('MISSING_RATE', 'BLOCKING', `No effective compensation rate for ${workerId}`, { workerId }));
      continue;
    }
    for (const entry of workerEntries) {
      if (!resolvedByEntry.get(entry.id)) {
        exceptions.push(exception('MISSING_RATE', 'BLOCKING', `No effective compensation rate for ${workerId} on ${dateKey(entry.workDate)}`, { workerId, workEntryIds: [entry.id] }));
      }
    }
    traces.push(compensation.source);
    if (!workerEntries.length && compensation.frequency !== "MONTHLY") continue;

    // Monthly compensation is one period base, independent of number of days/entries.
    let base = compensation.frequency === 'MONTHLY'
      ? compensation.rate
      : workerEntries.reduce((sum, entry) => {
          const entryCompensation = resolvedByEntry.get(entry.id);
          if (!entryCompensation) return sum;
          const quantity = entryCompensation.frequency === 'HOURLY' ? finiteNonNegative(entry.hours) : (entry.days === undefined ? 1 : finiteNonNegative(entry.days));
          return sum + quantity * entryCompensation.rate;
        }, 0);
    base = finiteNonNegative(base);

    let overtime = 0;
    for (const entry of workerEntries) {
      const overtimeHours = finiteNonNegative(entry.overtimeHours);
      if (overtimeHours === 0) continue;
      const entryCompensation = resolvedByEntry.get(entry.id) ?? compensation;
      const overtimeRate = entry.overtimeRate ?? entryCompensation.overtimeRate ??
        (input.overtimeRule?.rateFor ? input.overtimeRule.rateFor(workerId, entry.workDate) :
          input.overtimeRule?.multiplier !== undefined ? entryCompensation.rate * input.overtimeRule.multiplier : undefined);
      if (overtimeRate === undefined) {
        exceptions.push(exception('OVERTIME_WITHOUT_RULE', 'WARNING', `Overtime has no applicable rule for ${entry.id}`, { workerId, workEntryIds: [entry.id] }));
      } else {
        overtime += overtimeHours * overtimeRate;
      }
    }
    base += overtime;

    const activeComponents = (input.recurringComponents ?? []).filter(
      (component) => component.workerId === workerId && component.active && overlapsPeriod(component.effectiveFrom, component.effectiveTo, input.period),
    );
    const componentLines = activeComponents.map((component) => {
      const line: PayrollComponentLine = {
        id: component.id,
        workerId,
        type: component.type,
        name: component.name,
        amount: componentAmount(component, base),
        source: {
          kind: 'RECURRING_COMPONENT',
          sourceIds: [component.id],
          description: 'Active effective-dated recurring payroll component',
        },
      };
      traces.push(line.source);
      return line;
    });

    const earnings = base + componentLines.filter((line) => line.type === 'EARNING').reduce((sum, line) => sum + line.amount, 0);
    const deductions = componentLines.filter((line) => line.type === 'DEDUCTION').reduce((sum, line) => sum + line.amount, 0);
    const employerCosts = componentLines.filter((line) => line.type === 'EMPLOYER_COST').reduce((sum, line) => sum + line.amount, 0);
    draftEntries.push({
      id: `payroll:${input.period.id}:${workerId}`,
      workerId,
      periodId: input.period.id,
      grossEarnings: earnings,
      deductions,
      employerCosts,
      netPay: earnings - deductions,
      workEntryIds: workerEntries.map((entry) => entry.id),
      components: componentLines,
      source: {
        kind: workerEntries.length > 0 ? 'WORK_ENTRY' : compensation.source.kind,
        sourceIds: workerEntries.length > 0 ? workerEntries.map((entry) => entry.id) : compensation.source.sourceIds,
        description: workerEntries.length > 0 ? 'Approved period-linked work entries and effective compensation' : 'Effective compensation without period-linked entries',
      },
    });

    const groupedAllocations = new Map<string, { amount: number; context: LaborContext; projectId?: string; ids: string[] }>();
    if (compensation.frequency === 'MONTHLY') {
      const projectContexts = workerEntries.map((entry) => {
        const assignment = resolveAssignment(workerId, entry.workDate, input.assignments);
        const context = entry.laborContext ?? assignment?.laborContext ?? compensation.laborContext;
        const projectId = entry.projectId ?? assignment?.projectId ?? compensation.projectId;
        return { entry, context, projectId };
      }).filter((item) => item.context !== 'PROJECT' || item.projectId);
      const contexts = projectContexts.length ? projectContexts : [{ entry: undefined, context: compensation.laborContext, projectId: compensation.projectId }];
      const share = (earnings + employerCosts) / contexts.length;
      for (const item of contexts) {
        const key = `${item.context}:${item.projectId ?? ''}`;
        const current = groupedAllocations.get(key) ?? { amount: 0, context: item.context, projectId: item.projectId, ids: [] };
        current.amount += share;
        if (item.entry) current.ids.push(item.entry.id);
        groupedAllocations.set(key, current);
      }
    } else {
      for (const entry of workerEntries) {
        const assignment = resolveAssignment(workerId, entry.workDate, input.assignments);
        const entryCompensation = resolvedByEntry.get(entry.id) ?? compensation;
        const context = entry.laborContext ?? assignment?.laborContext ?? entryCompensation.laborContext;
        const projectId = entry.projectId ?? assignment?.projectId ?? entryCompensation.projectId;
        const amount = (entryCompensation.frequency === 'HOURLY' ? finiteNonNegative(entry.hours) : (entry.days === undefined ? 1 : finiteNonNegative(entry.days))) * entryCompensation.rate;
        const key = `${context}:${projectId ?? ''}`;
        const current = groupedAllocations.get(key) ?? { amount: 0, context, projectId, ids: [] };
        current.amount += amount;
        current.ids.push(entry.id);
        groupedAllocations.set(key, current);
      }
    }
    for (const [key, allocation] of groupedAllocations) {
      const validProject = allocation.context === 'PROJECT' && allocation.projectId !== undefined && allocation.projectId.trim() !== '';
      if (allocation.context === 'PROJECT' && !validProject) {
        exceptions.push(exception('INVALID_PROJECT_CONTEXT', 'BLOCKING', `Project labor has no valid project for ${workerId}`, { workerId, workEntryIds: allocation.ids }));
      }
      allocations.push({
        id: `allocation:${input.period.id}:${workerId}:${key}`,
        workerId,
        amount: allocation.amount,
        laborContext: validProject ? 'PROJECT' : allocation.context === 'PROJECT' ? 'UNALLOCATED_REVIEW' : allocation.context,
        ...(validProject ? { projectId: allocation.projectId } : {}),
        workEntryIds: allocation.ids,
        source: {
          kind: 'WORK_ENTRY',
          sourceIds: allocation.ids.length ? allocation.ids : [workerId],
          description: 'Payroll allocation derived from approved work and labor context',
        },
      });
    }
  }

  const confirmed = (input.existingPayrollAllocations ?? []).filter((allocation) => allocation.confirmed !== false);
  const confirmedByWorker = new Map<string, number>();
  for (const allocation of confirmed) {
    if (allocation.workerId) confirmedByWorker.set(allocation.workerId, (confirmedByWorker.get(allocation.workerId) ?? 0) + allocation.amount);
  }
  for (const workerId of confirmedByWorker.keys()) {
    const generated = allocations.filter((allocation) => allocation.workerId === workerId).reduce((sum, allocation) => sum + allocation.amount, 0);
    const confirmedAmount = confirmedByWorker.get(workerId) ?? 0;
    if (Math.abs(generated - confirmedAmount) > tolerance) {
      exceptions.push(exception('RECONCILIATION_DISCREPANCY', 'WARNING', `Generated payroll allocation differs from confirmed allocation for ${workerId}`, { workerId, expected: confirmedAmount, actual: generated, amount: generated - confirmedAmount }));
    }
  }
  for (const entry of entries) {
    const estimated = entry.estimatedCost;
    if (estimated === undefined) continue;
    const confirmedAmount = confirmed.filter((allocation) => allocation.workEntryId === entry.id).reduce((sum, allocation) => sum + allocation.amount, 0);
    const generatedAmount = allocations.filter((allocation) => allocation.workEntryIds.includes(entry.id)).reduce((sum, allocation) => sum + allocation.amount, 0);
    if (confirmedAmount > 0 && Math.abs(confirmedAmount - generatedAmount) > tolerance) {
      exceptions.push(exception('ALLOCATION_MISMATCH', 'WARNING', `Allocation mismatch for work entry ${entry.id}`, { workerId: entry.workerId, workEntryIds: [entry.id], expected: confirmedAmount, actual: generatedAmount }));
    }
    // estimatedCost is diagnostic only. It is never added to payroll totals or allocations.
    void estimated;
  }

  const totals = {
    grossEarnings: draftEntries.reduce((sum, entry) => sum + entry.grossEarnings, 0),
    deductions: draftEntries.reduce((sum, entry) => sum + entry.deductions, 0),
    employerCosts: draftEntries.reduce((sum, entry) => sum + entry.employerCosts, 0),
    allocated: allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
  };
  return {
    mode,
    entries: draftEntries,
    allocations,
    exceptions,
    readiness: classifyPayrollExceptions(exceptions),
    trace: traces,
    totals,
  };
}

function automationRecordDate(record: Record<string, unknown> | undefined): DateLike | undefined {
  if (!record) return undefined;
  for (const key of ["attendanceDate", "overtimeDate", "workDate", "leaveDate", "date"]) {
    const value = record[key];
    if (value instanceof Date || typeof value === "string") return value;
  }
  return undefined;
}

function automationInPeriod(record: Record<string, unknown>, period: PayrollPeriod): boolean {
  const date = automationRecordDate(record);
  if (!date) return false;
  if (record.periodId !== undefined && record.periodId !== period.id) return false;
  const current = time(date);
  return Number.isFinite(current) && current >= time(period.startDate) && current <= time(period.endDate);
}

function automationUnique<T extends { id?: string }>(groups: Array<readonly T[] | undefined>): T[] {
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

function automationConfirmed(record: ConfirmedAttendanceRecord): boolean {
  const status = String(record.recordStatus ?? record.status ?? "").toUpperCase();
  return status === "" || status === "CONFIRMED" || record.confirmed === true;
}

function automationApprovedOvertime(record: OvertimeRequestRecord): boolean {
  return String(record.status ?? "").toUpperCase() === "APPROVED" || (record as Record<string, unknown>).approved === true;
}

function automationPositive(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function automationApprovedMinutes(record: OvertimeRequestRecord): number {
  const minutes = automationPositive(record.approvedMinutes);
  return minutes > 0 ? minutes : automationPositive(record.approvedHours) * 60;
}

function automationOvertimeRate(
  input: PayrollAutomationInput,
  workerId: string,
  date: DateLike,
  compensation: ResolvedCompensation,
  explicitRate?: number,
): number | undefined {
  if (explicitRate !== undefined && Number.isFinite(explicitRate) && explicitRate >= 0) return explicitRate;
  if (compensation.overtimeRate !== undefined && Number.isFinite(compensation.overtimeRate) && compensation.overtimeRate >= 0) return compensation.overtimeRate;
  const ruleRate = input.overtimeRule?.rateFor?.(workerId, date);
  if (ruleRate !== undefined && Number.isFinite(ruleRate) && ruleRate >= 0) return ruleRate;
  if (input.overtimeRule?.multiplier !== undefined && Number.isFinite(input.overtimeRule.multiplier) && input.overtimeRule.multiplier > 0) return compensation.rate * input.overtimeRule.multiplier;
  return undefined;
}

interface AutomationAllocationBucket {
  laborContext: LaborContext;
  projectId?: string;
  weight: number;
  sourceIds: string[];
  workEntryIds: string[];
}

function addAutomationAllocationBucket(
  buckets: Map<string, AutomationAllocationBucket>,
  context: LaborContext,
  projectId: string | undefined,
  weight: number,
  sourceId: string,
  workEntryId?: string,
) {
  const normalizedProjectId = context === "PROJECT" && projectId ? projectId : undefined;
  const key = context + ":" + (normalizedProjectId ?? "");
  const current = buckets.get(key) ?? {
    laborContext: context,
    ...(normalizedProjectId ? { projectId: normalizedProjectId } : {}),
    weight: 0,
    sourceIds: [],
    workEntryIds: [],
  };
  current.weight += Math.max(0.01, automationPositive(weight));
  if (!current.sourceIds.includes(sourceId)) current.sourceIds.push(sourceId);
  if (workEntryId && !current.workEntryIds.includes(workEntryId)) current.workEntryIds.push(workEntryId);
  buckets.set(key, current);
}

function buildPayrollDraftFromConfirmedSources(input: PayrollAutomationInput): PayrollDraft {
  const mode = input.mode ?? "ASSISTED";
  const tolerance = input.tolerance ?? 0.01;
  const period = input.period;
  const workEntries = (input.workEntries ?? []).filter((entry) => inPeriod(entry, period));
  const allAttendance = automationUnique([input.confirmedAttendance, input.attendanceRecords, input.attendance]);
  const confirmedAttendance = allAttendance.filter((record) => automationConfirmed(record) && automationInPeriod(record as Record<string, unknown>, period));
  const allLeave = automationUnique([input.leaveRequests, input.leaves, input.leave]);
  const allOvertime = automationUnique([input.overtimeRequests, input.overtime]);
  const approvedOvertime = allOvertime.filter((record) => automationApprovedOvertime(record) && automationInPeriod(record as Record<string, unknown>, period) && automationApprovedMinutes(record) > 0);
  const allHolidays = automationUnique([input.payrollHolidays, input.holidays]);
  const sourceInput: PayrollSourceRevisionInput = {
    period: input.period,
    workers: input.workers ?? [],
    attendance: allAttendance,
    leave: allLeave,
    overtime: allOvertime,
    holidays: allHolidays,
    workEntries,
    profiles: input.profiles ?? [],
    assignments: input.assignments ?? [],
    recurringComponents: input.recurringComponents ?? [],
    projects: input.projects ?? [],
  };
  const sourceFingerprint = fingerprintPayrollSources(sourceInput);
  const sourceRevisionValue = input.sourceRevision ?? input.periodSourceRevision ?? input.period.sourceRevision;
  const sourceRevision = Number.isFinite(sourceRevisionValue) ? sourceRevisionValue : undefined;
  const workers = input.workers ?? [];
  const workerIds = new Set<string>([
    ...workers.map((worker) => worker.id),
    ...workEntries.map((entry) => entry.workerId),
    ...confirmedAttendance.map((record) => record.workerId),
    ...approvedOvertime.map((record) => record.workerId),
    ...(input.profiles ?? []).map((profile) => profile.workerId),
  ]);
  const exceptions: PayrollException[] = [];
  const traces: CalculationSourceMetadata[] = [];
  const duplicateGroups = new Map<string, string[]>();
  for (const worker of workers) {
    const key = worker.duplicateKey ?? worker.name?.trim().toLowerCase() ?? worker.id;
    duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), worker.id]);
  }
  for (const ids of duplicateGroups.values()) {
    if (ids.length > 1) exceptions.push(exception("DUPLICATE_WORKER", "BLOCKING", "Duplicate worker roster records: " + ids.join(", "), { workerId: ids[0] }));
  }

  const entriesByWorker = new Map<string, ApprovedWorkEntry[]>();
  for (const entry of workEntries) entriesByWorker.set(entry.workerId, [...(entriesByWorker.get(entry.workerId) ?? []), entry]);
  const attendanceByWorker = new Map<string, ConfirmedAttendanceRecord[]>();
  for (const record of confirmedAttendance) attendanceByWorker.set(record.workerId, [...(attendanceByWorker.get(record.workerId) ?? []), record]);
  const overtimeByWorker = new Map<string, OvertimeRequestRecord[]>();
  for (const record of approvedOvertime) overtimeByWorker.set(record.workerId, [...(overtimeByWorker.get(record.workerId) ?? []), record]);

  const draftEntries: PayrollDraftEntry[] = [];
  const allocations: PayrollDraftAllocation[] = [];

  for (const workerId of [...workerIds].sort()) {
    const workerEntries = (entriesByWorker.get(workerId) ?? []).slice().sort((left, right) => time(left.workDate) - time(right.workDate) || left.id.localeCompare(right.id));
    const workerAttendance = (attendanceByWorker.get(workerId) ?? []).slice().sort((left, right) => time(automationRecordDate(left as Record<string, unknown>) ?? period.startDate) - time(automationRecordDate(right as Record<string, unknown>) ?? period.startDate) || String(left.id ?? "").localeCompare(String(right.id ?? "")));
    const workerOvertime = (overtimeByWorker.get(workerId) ?? []).slice().sort((left, right) => time(automationRecordDate(left as Record<string, unknown>) ?? period.startDate) - time(automationRecordDate(right as Record<string, unknown>) ?? period.startDate) || String(left.id ?? "").localeCompare(String(right.id ?? "")));
    const rosterWorker = workers.find((worker) => worker.id === workerId);
    if (!workerEntries.length && !workerAttendance.length && !workerOvertime.length) exceptions.push(exception("NO_ENTRIES", "WARNING", "No approved period-linked work entries for " + workerId, { workerId }));

    for (const entry of workerEntries) {
      if (entry.importSignal?.status === "UNMATCHED") exceptions.push(exception("UNMATCHED_IMPORT_SIGNAL", "BLOCKING", "Import signal did not match a worker for " + entry.id, { workerId, workEntryIds: [entry.id] }));
      else if (entry.importSignal?.status === "AMBIGUOUS") exceptions.push(exception("AMBIGUOUS_IMPORT_SIGNAL", "WARNING", "Import signal matched multiple workers for " + entry.id, { workerId, workEntryIds: [entry.id] }));
      if (entry.projectArchived || entry.project?.archived) exceptions.push(exception("ARCHIVED_PROJECT_CONTEXT", "BLOCKING", "Archived project context on work entry " + entry.id, { workerId, workEntryIds: [entry.id] }));
      if (entry.projectId !== undefined && entry.projectId.trim() === "") exceptions.push(exception("INVALID_PROJECT_CONTEXT", "BLOCKING", "Invalid project context on work entry " + entry.id, { workerId, workEntryIds: [entry.id] }));
    }

    const firstDate = workerEntries[0]?.workDate ?? (automationRecordDate(workerAttendance[0] as Record<string, unknown>) ?? period.startDate);
    const resolvedByEntry = new Map(workerEntries.map((entry) => [entry.id, resolveCompensation(workerId, entry.workDate, input.profiles, input.assignments, rosterWorker)] as const));
    const compensation = resolvedByEntry.get(workerEntries[0]?.id ?? "") ?? [...resolvedByEntry.values()].find((value): value is ResolvedCompensation => value !== undefined) ?? resolveCompensation(workerId, firstDate, input.profiles, input.assignments, rosterWorker);
    if (!compensation) {
      exceptions.push(exception("MISSING_RATE", "BLOCKING", "No effective compensation rate for " + workerId, { workerId }));
      continue;
    }
    for (const entry of workerEntries) {
      if (!resolvedByEntry.get(entry.id)) exceptions.push(exception("MISSING_RATE", "BLOCKING", "No effective compensation rate for " + workerId + " on " + dateKey(entry.workDate), { workerId, workEntryIds: [entry.id] }));
    }
    traces.push(compensation.source);
    if (!workerEntries.length && !workerAttendance.length && !workerOvertime.length && compensation.frequency !== "MONTHLY") continue;

    const usesAttendance = workerAttendance.length > 0;
    let base = compensation.frequency === "MONTHLY"
      ? compensation.rate
      : usesAttendance
        ? workerAttendance.reduce((sum, record) => {
            const date = automationRecordDate(record as Record<string, unknown>) ?? period.startDate;
            const recordCompensation = resolveCompensation(workerId, date, input.profiles, input.assignments, rosterWorker) ?? compensation;
            const regularMinutes = record.regularMinutes !== undefined ? automationPositive(record.regularMinutes) : automationPositive((record as Record<string, unknown>).regularHours) * 60;
            const paidDayFraction = automationPositive(record.paidDayFraction);
            const quantity = recordCompensation.frequency === "HOURLY" ? regularMinutes / 60 : recordCompensation.frequency === "DAILY" ? paidDayFraction : 0;
            return sum + quantity * recordCompensation.rate;
          }, 0)
        : workerEntries.reduce((sum, entry) => {
            const entryCompensation = resolvedByEntry.get(entry.id);
            if (!entryCompensation) return sum;
            const quantity = entryCompensation.frequency === "HOURLY" ? automationPositive(entry.hours) : entry.days === undefined ? 1 : automationPositive(entry.days);
            return sum + quantity * entryCompensation.rate;
          }, 0);

    if (usesAttendance) traces.push({
      kind: "CONFIRMED_ATTENDANCE",
      sourceIds: workerAttendance.map((record, index) => record.id ?? workerId + ":attendance:" + index),
      description: "Confirmed attendance is the primary regular-pay source",
    });

    let overtime = 0;
    const explicitDates = new Set<string>();
    for (const request of workerOvertime) {
      const date = automationRecordDate(request as Record<string, unknown>);
      if (!date) continue;
      const requestCompensation = resolveCompensation(workerId, date, input.profiles, input.assignments, rosterWorker) ?? compensation;
      const rate = automationOvertimeRate(input, workerId, date, requestCompensation, request.overtimeRate ?? request.rate);
      const minutes = automationApprovedMinutes(request);
      if (rate === undefined) exceptions.push(exception("OVERTIME_WITHOUT_RULE", "WARNING", "Approved overtime has no applicable rule for " + (request.id ?? workerId), { workerId }));
      else overtime += minutes / 60 * rate;
      explicitDates.add(dateKey(date));
    }
    if (workerOvertime.length) traces.push({
      kind: "APPROVED_OVERTIME",
      sourceIds: workerOvertime.map((request, index) => request.id ?? workerId + ":overtime:" + index),
      description: "Approved explicit overtime requests",
    });

    for (const entry of workerEntries) {
      const overtimeHours = automationPositive(entry.overtimeHours);
      if (!overtimeHours) continue;
      const date = dateKey(entry.workDate);
      if (explicitDates.has(date)) {
        exceptions.push(exception("OVERTIME_CONFLICT", "WARNING", "Explicit approved overtime conflicts with legacy work-entry overtime on " + entry.id + "; legacy overtime was excluded.", { workerId, workEntryIds: [entry.id] }));
        continue;
      }
      const entryCompensation = resolvedByEntry.get(entry.id) ?? compensation;
      const rate = entry.overtimeRate ?? automationOvertimeRate(input, workerId, entry.workDate, entryCompensation);
      if (rate === undefined) exceptions.push(exception("OVERTIME_WITHOUT_RULE", "WARNING", "Overtime has no applicable rule for " + entry.id, { workerId, workEntryIds: [entry.id] }));
      else overtime += overtimeHours * rate;
    }
    base = finiteNonNegative(base + overtime);

    const activeComponents = (input.recurringComponents ?? []).filter((component) => component.workerId === workerId && component.active && overlapsPeriod(component.effectiveFrom, component.effectiveTo, period));
    const componentLines = activeComponents.map((component) => {
      const line: PayrollComponentLine = {
        id: component.id,
        workerId,
        type: component.type,
        code: component.code,
        name: component.name,
        amount: componentAmount(component, base),
        source: { kind: "RECURRING_COMPONENT", sourceIds: [component.id], description: "Active effective-dated recurring payroll component" },
      };
      traces.push(line.source);
      return line;
    });
    const earnings = base + componentLines.filter((line) => line.type === "EARNING").reduce((sum, line) => sum + line.amount, 0);
    const deductions = componentLines.filter((line) => line.type === "DEDUCTION").reduce((sum, line) => sum + line.amount, 0);
    const employerCosts = componentLines.filter((line) => line.type === "EMPLOYER_COST").reduce((sum, line) => sum + line.amount, 0);
    const workerSource: CalculationSourceMetadata = usesAttendance
      ? { kind: "CONFIRMED_ATTENDANCE", sourceIds: workerAttendance.map((record, index) => record.id ?? workerId + ":attendance:" + index), description: "Confirmed attendance and effective compensation" }
      : workerEntries.length
        ? { kind: "WORK_ENTRY", sourceIds: workerEntries.map((entry) => entry.id), description: "Approved period-linked work entries and effective compensation" }
        : workerOvertime.length
          ? { kind: "APPROVED_OVERTIME", sourceIds: workerOvertime.map((request, index) => request.id ?? workerId + ":overtime:" + index), description: "Approved overtime and effective compensation" }
          : compensation.source;
    draftEntries.push({
      id: "payroll:" + period.id + ":" + workerId,
      workerId,
      periodId: period.id,
      grossEarnings: earnings,
      deductions,
      employerCosts,
      netPay: earnings - deductions,
      workEntryIds: workerEntries.map((entry) => entry.id),
      components: componentLines,
      source: workerSource,
    });

    const buckets = new Map<string, AutomationAllocationBucket>();
    for (const entry of workerEntries) {
      const assignment = resolveAssignment(workerId, entry.workDate, input.assignments);
      const entryCompensation = resolvedByEntry.get(entry.id) ?? compensation;
      const context = entry.laborContext ?? assignment?.laborContext ?? entryCompensation.laborContext;
      const projectId = entry.projectId ?? assignment?.projectId ?? entryCompensation.projectId;
      const weight = entryCompensation.frequency === "HOURLY" ? automationPositive(entry.hours) : entry.days === undefined ? 1 : automationPositive(entry.days);
      addAutomationAllocationBucket(buckets, context, projectId, weight, entry.id, entry.id);
    }
    for (const request of workerOvertime) {
      if (request.laborContext || request.projectId) {
        const context = request.laborContext ?? (request.projectId ? "PROJECT" : "UNALLOCATED_REVIEW");
        addAutomationAllocationBucket(buckets, context, request.projectId, automationApprovedMinutes(request) / 60, request.id ?? workerId + ":overtime");
      }
    }
    if (!buckets.size) addAutomationAllocationBucket(buckets, compensation.laborContext, compensation.projectId, 1, workerId);
    const totalWeight = [...buckets.values()].reduce((sum, bucket) => sum + bucket.weight, 0);
    const payableLabor = earnings + employerCosts;
    for (const [key, bucket] of buckets) {
      const validProject = bucket.laborContext === "PROJECT" && Boolean(bucket.projectId && bucket.projectId.trim());
      if (bucket.laborContext === "PROJECT" && !validProject) exceptions.push(exception("INVALID_PROJECT_CONTEXT", "BLOCKING", "Project labor has no valid project for " + workerId, { workerId, workEntryIds: bucket.workEntryIds }));
      const outputContext = validProject ? "PROJECT" : bucket.laborContext === "PROJECT" ? "UNALLOCATED_REVIEW" : bucket.laborContext;
      allocations.push({
        id: "allocation:" + period.id + ":" + workerId + ":" + key,
        workerId,
        amount: totalWeight > 0 ? payableLabor * bucket.weight / totalWeight : 0,
        laborContext: outputContext,
        ...(validProject ? { projectId: bucket.projectId } : {}),
        workEntryIds: bucket.workEntryIds,
        source: {
          kind: usesAttendance ? "CONFIRMED_ATTENDANCE" : workerOvertime.length && !workerEntries.length ? "APPROVED_OVERTIME" : "WORK_ENTRY",
          sourceIds: bucket.sourceIds.length ? bucket.sourceIds : [workerId],
          description: "Payroll allocation derived from labor context, separately from attendance pay source",
        },
      });
    }
  }

  const confirmed = (input.existingPayrollAllocations ?? []).filter((allocation) => allocation.confirmed !== false);
  const confirmedByWorker = new Map<string, number>();
  for (const allocation of confirmed) {
    if (allocation.workerId) confirmedByWorker.set(allocation.workerId, (confirmedByWorker.get(allocation.workerId) ?? 0) + allocation.amount);
  }
  for (const workerId of confirmedByWorker.keys()) {
    const generated = allocations.filter((allocation) => allocation.workerId === workerId).reduce((sum, allocation) => sum + allocation.amount, 0);
    const confirmedAmount = confirmedByWorker.get(workerId) ?? 0;
    if (Math.abs(generated - confirmedAmount) > tolerance) exceptions.push(exception("RECONCILIATION_DISCREPANCY", "WARNING", "Generated payroll allocation differs from confirmed allocation for " + workerId, { workerId, expected: confirmedAmount, actual: generated, amount: generated - confirmedAmount }));
  }
  for (const entry of workEntries) {
    if (entry.estimatedCost === undefined) continue;
    const confirmedAmount = confirmed.filter((allocation) => allocation.workEntryId === entry.id).reduce((sum, allocation) => sum + allocation.amount, 0);
    const generatedAmount = allocations.filter((allocation) => allocation.workEntryIds.includes(entry.id)).reduce((sum, allocation) => sum + allocation.amount, 0);
    if (confirmedAmount > 0 && Math.abs(confirmedAmount - generatedAmount) > tolerance) exceptions.push(exception("ALLOCATION_MISMATCH", "WARNING", "Allocation mismatch for work entry " + entry.id, { workerId: entry.workerId, workEntryIds: [entry.id], expected: confirmedAmount, actual: generatedAmount }));
  }
  const totals = {
    grossEarnings: draftEntries.reduce((sum, entry) => sum + entry.grossEarnings, 0),
    deductions: draftEntries.reduce((sum, entry) => sum + entry.deductions, 0),
    employerCosts: draftEntries.reduce((sum, entry) => sum + entry.employerCosts, 0),
    allocated: allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
  };
  return {
    mode,
    entries: draftEntries,
    allocations,
    exceptions,
    readiness: classifyPayrollExceptions(exceptions),
    trace: traces,
    totals,
    sourceFingerprint,
    ...(sourceRevision !== undefined ? { sourceRevision } : {}),
  };
}

export const constructPayrollDraft = buildPayrollDraft;
export const resolveEffectiveCompensation = resolveCompensation
