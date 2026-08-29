import type {
  AttendanceRecord,
  LeaveRequest,
  OvertimeRequest,
  PayrollEntry,
  PayrollPeriod,
  PayrollRun,
  ProjectWorkerAssignment,
  Worker,
  WorkEntry,
} from "../types.ts";
import type { RecurringPayrollComponent, WorkerCompensationProfile } from "./payrollAutomation.ts";

export const PAYROLL_LIFECYCLE_ENTITIES = [
  "WORKER",
  "PROJECT_ASSIGNMENT",
  "COMPENSATION_PROFILE",
  "RECURRING_COMPONENT",
  "WORK_ENTRY",
  "ATTENDANCE",
  "LEAVE",
  "OVERTIME",
] as const;

export type PayrollLifecycleEntity = (typeof PAYROLL_LIFECYCLE_ENTITIES)[number];

export type PayrollLifecycleAction =
  | "OFFBOARD"
  | "REACTIVATE"
  | "END"
  | "DEACTIVATE"
  | "DELETE_UNUSED"
  | "DELETE_DRAFT"
  | "VOID"
  | "CANCEL";

export interface PayrollLifecycleRequest {
  entity: PayrollLifecycleEntity;
  id: string;
  action: PayrollLifecycleAction;
  reason?: string;
  effectiveDate?: string;
}

export interface WorkerLifecycleData {
  workers: readonly Worker[];
  assignments?: readonly ProjectWorkerAssignment[];
  attendanceRecords?: readonly AttendanceRecord[];
  leaveRequests?: readonly LeaveRequest[];
  overtimeRequests?: readonly OvertimeRequest[];
  workEntries?: readonly WorkEntry[];
  payrollEntries?: readonly PayrollEntry[];
  payrollRuns?: readonly PayrollRun[];
  periods?: readonly PayrollPeriod[];
  compensationProfiles?: readonly WorkerCompensationProfile[];
  recurringComponents?: readonly RecurringPayrollComponent[];
  payrollImportWorkerIds?: readonly string[];
  departmentManagerWorkerIds?: readonly string[];
}

export interface WorkerDependencySummary {
  workerId: string;
  assignmentCount: number;
  attendanceCount: number;
  workEntryCount: number;
  leaveRequestCount: number;
  overtimeRequestCount: number;
  payrollEntryCount: number;
  compensationProfileCount: number;
  recurringComponentCount: number;
  payrollImportRowCount: number;
  departmentManagerCount: number;
  hasOperationalHistory: boolean;
  hasPayrollHistory: boolean;
  canDelete: boolean;
  recommendedAction: "DELETE_UNUSED" | "OFFBOARD";
  blockedReason?: string;
}

export interface AssignmentDependencySummary {
  assignmentId: string;
  workEntryCount: number;
  overtimeRequestCount: number;
  payrollAllocationCount: number;
  snapshotReferenceCount: number;
  hasDownstreamUsage: boolean;
  canDelete: boolean;
}

export interface CompensationUsageInput {
  profile: WorkerCompensationProfile;
  payrollEntries?: readonly PayrollEntry[];
  payrollRuns?: readonly PayrollRun[];
  periods?: readonly PayrollPeriod[];
}

export interface ComponentUsageInput {
  component: RecurringPayrollComponent;
  payrollEntries?: readonly PayrollEntry[];
  payrollRuns?: readonly PayrollRun[];
  periods?: readonly PayrollPeriod[];
}

function numericCount(values: readonly unknown[] | undefined, predicate: (value: any) => boolean): number {
  return (values || []).reduce<number>((count, value) => count + (predicate(value) ? 1 : 0), 0);
}

function dateOnly(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value !== "string") return undefined;
  const candidate = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : undefined;
}

function overlapsDateRange(
  leftStart: string | undefined,
  leftEnd: string | undefined,
  rightStart: string | undefined,
  rightEnd: string | undefined,
): boolean {
  if (!leftStart || !rightStart) return false;
  return leftStart <= (rightEnd || "9999-12-31") && (leftEnd || "9999-12-31") >= rightStart;
}

function snapshotContains(snapshot: unknown, id: string): boolean {
  if (!id || !snapshot) return false;
  try {
    return JSON.stringify(snapshot).includes(id);
  } catch {
    return false;
  }
}

function finalizedRunIds(runs: readonly PayrollRun[] | undefined): Set<string> {
  return new Set((runs || []).filter((run) => ["APPROVED", "PAID", "VOID"].includes(run.status)).map((run) => run.id));
}

export function workerDependencySummary(workerId: string, data: WorkerLifecycleData): WorkerDependencySummary {
  const assignments = data.assignments || [];
  const attendanceRecords = data.attendanceRecords || [];
  const workEntries = data.workEntries || [];
  const leaveRequests = data.leaveRequests || [];
  const overtimeRequests = data.overtimeRequests || [];
  const payrollEntries = data.payrollEntries || [];
  const compensationProfiles = data.compensationProfiles || [];
  const recurringComponents = data.recurringComponents || [];
  const payrollImportWorkerIds = data.payrollImportWorkerIds || [];
  const departmentManagerWorkerIds = data.departmentManagerWorkerIds || [];
  const counts = {
    assignmentCount: numericCount(assignments, (item) => item.workerId === workerId),
    attendanceCount: numericCount(attendanceRecords, (item) => item.workerId === workerId),
    workEntryCount: numericCount(workEntries, (item) => item.workerId === workerId),
    leaveRequestCount: numericCount(leaveRequests, (item) => item.workerId === workerId),
    overtimeRequestCount: numericCount(overtimeRequests, (item) => item.workerId === workerId),
    payrollEntryCount: numericCount(payrollEntries, (item) => item.workerId === workerId),
    compensationProfileCount: numericCount(compensationProfiles, (item) => item.workerId === workerId),
    recurringComponentCount: numericCount(recurringComponents, (item) => item.workerId === workerId),
    payrollImportRowCount: payrollImportWorkerIds.filter((id) => id === workerId).length,
    departmentManagerCount: departmentManagerWorkerIds.filter((id) => id === workerId).length,
  };
  const hasOperationalHistory = Object.entries(counts)
    .filter(([key]) => key !== "payrollEntryCount" && key !== "compensationProfileCount" && key !== "recurringComponentCount" && key !== "payrollImportRowCount")
    .some(([, value]) => Number(value) > 0);
  const hasPayrollHistory = counts.payrollEntryCount > 0 || counts.payrollImportRowCount > 0;
  const canDelete = Object.values(counts).every((value) => Number(value) === 0);
  return {
    workerId,
    ...counts,
    hasOperationalHistory,
    hasPayrollHistory,
    canDelete,
    recommendedAction: canDelete ? "DELETE_UNUSED" : "OFFBOARD",
    ...(canDelete ? {} : { blockedReason: "This employee has historical workforce or payroll records and cannot be permanently deleted. Offboard the employee instead." }),
  };
}

export function workerLifecycleCopy(summary: Pick<WorkerDependencySummary, "canDelete">): string {
  return summary.canDelete
    ? "This employee has no workforce or payroll history and can be safely deleted."
    : "This employee has historical workforce or payroll records and cannot be permanently deleted. Offboard the employee instead.";
}

export function assignmentDependencySummary(
  assignment: ProjectWorkerAssignment,
  input: Pick<WorkerLifecycleData, "workEntries" | "overtimeRequests" | "payrollEntries" | "payrollRuns" | "periods"> & { allocations?: readonly { payrollEntryId: string; projectId: string }[] },
): AssignmentDependencySummary {
  const matchesRange = (date: string | undefined) => overlapsDateRange(assignment.startDate, assignment.endDate, dateOnly(date), dateOnly(date));
  const workEntryCount = numericCount(input.workEntries, (entry) => entry.workerId === assignment.workerId && entry.projectId === assignment.projectId && matchesRange(entry.workDate));
  const overtimeRequestCount = numericCount(input.overtimeRequests, (request) => request.workerId === assignment.workerId && request.projectId === assignment.projectId && matchesRange(request.overtimeDate));
  const allocations = input.allocations || [];
  const entryIds = new Set((input.payrollEntries || []).filter((entry) => entry.workerId === assignment.workerId).map((entry) => entry.id));
  const payrollAllocationCount = numericCount(allocations, (allocation) => entryIds.has(allocation.payrollEntryId) && allocation.projectId === assignment.projectId);
  const snapshotReferenceCount = numericCount(input.payrollEntries, (entry) => entry.workerId === assignment.workerId && snapshotContains(entry.calculationSnapshot, assignment.id));
  const hasDownstreamUsage = workEntryCount + overtimeRequestCount + payrollAllocationCount + snapshotReferenceCount > 0;
  return {
    assignmentId: assignment.id,
    workEntryCount,
    overtimeRequestCount,
    payrollAllocationCount,
    snapshotReferenceCount,
    hasDownstreamUsage,
    canDelete: !hasDownstreamUsage,
  };
}

export function isCompensationProfileConsumed(input: CompensationUsageInput): boolean {
  const profileId = input.profile.id;
  if (!profileId) return false;
  const finalized = finalizedRunIds(input.payrollRuns);
  const periodsById = new Map((input.periods || []).map((period) => [period.id, period]));
  return (input.payrollEntries || []).some((entry) => {
    if (entry.workerId !== input.profile.workerId) return false;
    if (snapshotContains(entry.calculationSnapshot, profileId)) return true;
    const run = (input.payrollRuns || []).find((candidate) => candidate.id === entry.payrollRunId);
    const period = run ? periodsById.get(run.periodId) : undefined;
    return Boolean(run && finalized.has(run.id) && overlapsDateRange(
      dateOnly(input.profile.effectiveFrom as unknown),
      dateOnly(input.profile.effectiveTo as unknown),
      period?.periodStart,
      period?.periodEnd,
    ));
  });
}

export function isRecurringComponentConsumed(input: ComponentUsageInput): boolean {
  const componentId = input.component.id;
  if (!componentId) return false;
  const finalized = finalizedRunIds(input.payrollRuns);
  const periodsById = new Map((input.periods || []).map((period) => [period.id, period]));
  return (input.payrollEntries || []).some((entry) => {
    if (entry.workerId !== input.component.workerId) return false;
    if (snapshotContains(entry.calculationSnapshot, componentId)) return true;
    const run = (input.payrollRuns || []).find((candidate) => candidate.id === entry.payrollRunId);
    const period = run ? periodsById.get(run.periodId) : undefined;
    return Boolean(run && finalized.has(run.id) && overlapsDateRange(
      dateOnly(input.component.effectiveFrom as unknown),
      dateOnly(input.component.effectiveTo as unknown),
      period?.periodStart,
      period?.periodEnd,
    ));
  });
}

export function workerForLifecycle(worker: Worker, action: "OFFBOARD" | "REACTIVATE", effectiveDate: string): Worker {
  if (action === "OFFBOARD") {
    return {
      ...worker,
      active: false,
      employmentStatus: "OFFBOARDED",
      endDate: worker.endDate || effectiveDate,
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    ...worker,
    active: true,
    employmentStatus: "ACTIVE",
    endDate: undefined,
    archivedAt: undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function assignmentForLifecycle(assignment: ProjectWorkerAssignment, effectiveDate: string): ProjectWorkerAssignment {
  return { ...assignment, active: false, endDate: assignment.endDate || effectiveDate };
}

export function profileForLifecycle(profile: WorkerCompensationProfile, effectiveDate: string): WorkerCompensationProfile {
  return { ...profile, active: false, effectiveTo: profile.effectiveTo || effectiveDate };
}

export function componentForLifecycle(component: RecurringPayrollComponent, effectiveDate: string): RecurringPayrollComponent {
  return { ...component, active: false, effectiveTo: component.effectiveTo || effectiveDate };
}
