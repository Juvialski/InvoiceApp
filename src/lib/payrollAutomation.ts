/**
 * Pure payroll automation primitives.
 *
 * The input types intentionally use structural, optional fields so callers can
 * pass the existing work-entry, worker, and payroll-allocation records without
 * mapping them through persistence-specific types first.
 */

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
}

export interface PayrollAutomationInput {
  period: PayrollPeriod;
  workEntries: ApprovedWorkEntry[];
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
}

export interface CalculationSourceMetadata {
  kind:
    | 'ASSIGNMENT_OVERRIDE'
    | 'COMPENSATION_PROFILE'
    | 'WORKER_ROSTER'
    | 'WORK_ENTRY'
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
  const mode = input.mode ?? 'ASSISTED';
  const tolerance = input.tolerance ?? 0.01;
  const entries = input.workEntries.filter((entry) => inPeriod(entry, input.period));
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

export const constructPayrollDraft = buildPayrollDraft;
export const resolveEffectiveCompensation = resolveCompensation;
