import type { FinancialAccount, FinancialBalanceSnapshot, FinancialTransaction } from "../lib/cashBanking.ts";
import type { PayrollSchedule } from "../lib/payrollSchedule.ts";
import type { EngineeringDailySiteLogsWorkspaceData } from "../lib/dailySiteLogs.ts";
import type { RecurringPayrollComponent, WorkerCompensationProfile } from "../lib/payrollAutomation.ts";
import type {
  AttendanceRecord,
  Expense,
  InvoiceData,
  InvoiceProjectAllocation,
  LeaveRequest,
  OvertimeRequest,
  PayrollEntry,
  PayrollPeriod,
  PayrollRun,
  Project,
  ProjectWorkerAssignment,
  Worker,
  WorkEntry,
} from "../types.ts";
import { createDemoWorkspace } from "./data/createDemoWorkspace.ts";
import { demoTimestamp } from "./data/demoDates.ts";
import { DEMO_COMPANY_ID, type DemoPreparedAssistantAction, type DemoWorkspaceData } from "./demoTypes.ts";
import { assignmentDependencySummary, assignmentForLifecycle, componentForLifecycle, isCompensationProfileConsumed, isRecurringComponentConsumed, profileForLifecycle, workerDependencySummary, workerForLifecycle, type PayrollLifecycleRequest } from "../lib/payrollLifecycle.ts";

export type DemoWorkspaceMutation =
  | { type: "SAVE_PROJECT"; value: Project }
  | { type: "ARCHIVE_PROJECT"; value: Project }
  | { type: "SAVE_INVOICE"; value: InvoiceData }
  | { type: "DELETE_INVOICE"; id: string }
  | { type: "SAVE_INVOICE_ALLOCATIONS"; invoiceId: string; value: InvoiceProjectAllocation[] }
  | { type: "SAVE_EXPENSE"; value: Expense }
  | { type: "ARCHIVE_EXPENSE"; value: Expense }
  | { type: "SAVE_WORKER"; value: Worker }
  | { type: "SAVE_ASSIGNMENT"; value: ProjectWorkerAssignment }
  | { type: "SAVE_COMPENSATION_PROFILE"; value: WorkerCompensationProfile }
  | { type: "SAVE_RECURRING_COMPONENT"; value: RecurringPayrollComponent }
  | { type: "PAYROLL_LIFECYCLE"; request: PayrollLifecycleRequest }
  | { type: "SAVE_PERIOD"; value: PayrollPeriod }
  | { type: "SAVE_SCHEDULE"; value: PayrollSchedule }
  | { type: "SAVE_WORK_ENTRY"; value: WorkEntry }
  | { type: "SAVE_ATTENDANCE"; value: AttendanceRecord }
  | { type: "SAVE_ATTENDANCE_BATCH"; value: AttendanceRecord[] }
  | { type: "SAVE_LEAVE"; value: LeaveRequest }
  | { type: "SAVE_OVERTIME"; value: OvertimeRequest }
  | { type: "SAVE_PAYROLL_ENTRY"; value: PayrollEntry }
  | { type: "UPDATE_PAYROLL_RUN"; value: PayrollRun }
  | { type: "SAVE_FINANCIAL_ACCOUNT"; value: FinancialAccount }
  | { type: "SAVE_FINANCIAL_SNAPSHOT"; value: FinancialBalanceSnapshot }
  | { type: "SAVE_FINANCIAL_TRANSACTION"; value: FinancialTransaction }
  | { type: "SAVE_DAILY_SITE_LOGS"; value: EngineeringDailySiteLogsWorkspaceData };

function upsert<T extends { id: string }>(items: readonly T[], value: T): T[] {
  const found = items.some((item) => item.id === value.id);
  return found ? items.map((item) => item.id === value.id ? value : item) : [value, ...items];
}

function upsertOptionalId<T extends { id?: string }>(items: readonly T[], value: T): T[] {
  if (!value.id) return [value, ...items];
  const found = items.some((item) => item.id === value.id);
  return found ? items.map((item) => item.id === value.id ? value : item) : [value, ...items];
}

export function reduceDemoWorkspace(state: DemoWorkspaceData, mutation: DemoWorkspaceMutation): DemoWorkspaceData {
  switch (mutation.type) {
    case "SAVE_PROJECT":
      return { ...state, projects: upsert(state.projects, { ...mutation.value, updatedAt: demoTimestamp(state.anchorDate, 16, 0) }) };
    case "ARCHIVE_PROJECT":
      return { ...state, projects: state.projects.map((project) => project.id === mutation.value.id ? { ...project, status: "ARCHIVED", archivedAt: demoTimestamp(state.anchorDate, 16, 5), updatedAt: demoTimestamp(state.anchorDate, 16, 5) } : project) };
    case "SAVE_INVOICE":
      return { ...state, invoices: upsert(state.invoices, mutation.value) };
    case "DELETE_INVOICE":
      return { ...state, invoices: state.invoices.filter((invoice) => invoice.id !== mutation.id), invoiceAllocations: state.invoiceAllocations.filter((allocation) => allocation.invoiceId !== mutation.id) };
    case "SAVE_INVOICE_ALLOCATIONS":
      return { ...state, invoiceAllocations: [...state.invoiceAllocations.filter((allocation) => allocation.invoiceId !== mutation.invoiceId), ...mutation.value] };
    case "SAVE_EXPENSE":
      return { ...state, expenses: upsert(state.expenses, mutation.value) };
    case "ARCHIVE_EXPENSE":
      return { ...state, expenses: state.expenses.map((expense) => expense.id === mutation.value.id ? { ...expense, archivedAt: demoTimestamp(state.anchorDate, 16, 10), updatedAt: demoTimestamp(state.anchorDate, 16, 10) } : expense) };
    case "SAVE_WORKER":
      return { ...state, payroll: { ...state.payroll, workers: upsert(state.payroll.workers, mutation.value) } };
    case "SAVE_ASSIGNMENT":
      return { ...state, payroll: { ...state.payroll, assignments: upsert(state.payroll.assignments, mutation.value) } };
    case "SAVE_COMPENSATION_PROFILE":
      return { ...state, payroll: { ...state.payroll, compensationProfiles: upsertOptionalId(state.payroll.compensationProfiles, mutation.value) } };
    case "SAVE_RECURRING_COMPONENT":
      return { ...state, payroll: { ...state.payroll, recurringComponents: upsert(state.payroll.recurringComponents, mutation.value) } };
    case "PAYROLL_LIFECYCLE": {
      const request = mutation.request;
      const payroll = state.payroll;
      const effectiveDate = request.effectiveDate || state.anchorDate;
      if (request.entity === "WORKER") {
        const worker = payroll.workers.find((item) => item.id === request.id);
        if (!worker) return state;
        const summary = workerDependencySummary(request.id, {
          workers: payroll.workers,
          assignments: payroll.assignments,
          attendanceRecords: payroll.attendanceRecords,
          leaveRequests: payroll.leaveRequests,
          overtimeRequests: payroll.overtimeRequests,
          workEntries: payroll.workEntries,
          payrollEntries: payroll.entries,
          payrollRuns: payroll.runs,
          periods: payroll.periods,
          compensationProfiles: payroll.compensationProfiles,
          recurringComponents: payroll.recurringComponents,
          departmentManagerWorkerIds: payroll.departments.map((department) => department.managerWorkerId).filter((id): id is string => Boolean(id)),
        });
        if (request.action === "DELETE_UNUSED" && !summary.canDelete) return state;
        return { ...state, payroll: { ...payroll, workers: request.action === "DELETE_UNUSED" ? payroll.workers.filter((item) => item.id !== request.id) : payroll.workers.map((item) => item.id === request.id ? workerForLifecycle(item, request.action as "OFFBOARD" | "REACTIVATE", effectiveDate) : item) } };
      }
      if (request.entity === "PROJECT_ASSIGNMENT") {
        const assignment = payroll.assignments.find((item) => item.id === request.id);
        if (!assignment) return state;
        const dependency = assignmentDependencySummary(assignment, { workEntries: payroll.workEntries, overtimeRequests: payroll.overtimeRequests, payrollEntries: payroll.entries, allocations: payroll.allocations });
        if (request.action === "DELETE_UNUSED") return dependency.canDelete ? { ...state, payroll: { ...payroll, assignments: payroll.assignments.filter((item) => item.id !== request.id) } } : state;
        return { ...state, payroll: { ...payroll, assignments: payroll.assignments.map((item) => item.id === request.id ? assignmentForLifecycle(item, effectiveDate) : item) } };
      }
      if (request.entity === "COMPENSATION_PROFILE") {
        const profile = payroll.compensationProfiles.find((item) => item.id === request.id);
        if (!profile) return state;
        if (request.action === "DELETE_UNUSED") return isCompensationProfileConsumed({ profile, payrollEntries: payroll.entries, payrollRuns: payroll.runs, periods: payroll.periods }) ? state : { ...state, payroll: { ...payroll, compensationProfiles: payroll.compensationProfiles.filter((item) => item.id !== request.id) } };
        return { ...state, payroll: { ...payroll, compensationProfiles: payroll.compensationProfiles.map((item) => item.id === request.id ? profileForLifecycle(item, effectiveDate) : item) } };
      }
      if (request.entity === "RECURRING_COMPONENT") {
        const component = payroll.recurringComponents.find((item) => item.id === request.id);
        if (!component) return state;
        if (request.action === "DELETE_UNUSED") return isRecurringComponentConsumed({ component, payrollEntries: payroll.entries, payrollRuns: payroll.runs, periods: payroll.periods }) ? state : { ...state, payroll: { ...payroll, recurringComponents: payroll.recurringComponents.filter((item) => item.id !== request.id) } };
        return { ...state, payroll: { ...payroll, recurringComponents: payroll.recurringComponents.map((item) => item.id === request.id ? componentForLifecycle(item, effectiveDate) : item) } };
      }
      if (request.entity === "WORK_ENTRY") {
        const entry = payroll.workEntries.find((item) => item.id === request.id);
        if (!entry) return state;
        if (request.action === "DELETE_DRAFT") return entry.status === "DRAFT" ? { ...state, payroll: { ...payroll, workEntries: payroll.workEntries.filter((item) => item.id !== request.id) } } : state;
        return { ...state, payroll: { ...payroll, workEntries: payroll.workEntries.map((item) => item.id === request.id ? { ...item, status: "VOID", voidedAt: demoTimestamp(state.anchorDate, 16, 20), voidReason: request.reason } : item) } };
      }
      if (request.entity === "ATTENDANCE") {
        const record = (payroll.attendanceRecords || []).find((item) => item.id === request.id);
        if (!record) return state;
        if (request.action === "DELETE_DRAFT") return record.recordStatus === "DRAFT" ? { ...state, payroll: { ...payroll, attendanceRecords: (payroll.attendanceRecords || []).filter((item) => item.id !== request.id) } } : state;
        return { ...state, payroll: { ...payroll, attendanceRecords: (payroll.attendanceRecords || []).map((item) => item.id === request.id ? { ...item, recordStatus: "VOID", voidedAt: demoTimestamp(state.anchorDate, 16, 20), voidReason: request.reason } : item) } };
      }
      if (request.entity === "LEAVE") {
        const leave = (payroll.leaveRequests || []).find((item) => item.id === request.id);
        if (!leave) return state;
        if (request.action === "DELETE_DRAFT") return leave.status === "DRAFT" ? { ...state, payroll: { ...payroll, leaveRequests: (payroll.leaveRequests || []).filter((item) => item.id !== request.id) } } : state;
        return { ...state, payroll: { ...payroll, leaveRequests: (payroll.leaveRequests || []).map((item) => item.id === request.id ? { ...item, status: "CANCELLED", cancelledAt: demoTimestamp(state.anchorDate, 16, 20), cancellationReason: request.reason } : item) } };
      }
      if (request.entity === "OVERTIME") {
        const overtime = (payroll.overtimeRequests || []).find((item) => item.id === request.id);
        if (!overtime) return state;
        if (request.action === "DELETE_DRAFT") return overtime.status === "DRAFT" ? { ...state, payroll: { ...payroll, overtimeRequests: (payroll.overtimeRequests || []).filter((item) => item.id !== request.id) } } : state;
        return { ...state, payroll: { ...payroll, overtimeRequests: (payroll.overtimeRequests || []).map((item) => item.id === request.id ? { ...item, status: "CANCELLED", cancelledAt: demoTimestamp(state.anchorDate, 16, 20), cancellationReason: request.reason } : item) } };
      }
      return state;
    }
    case "SAVE_PERIOD":
      return { ...state, payroll: { ...state.payroll, periods: upsert(state.payroll.periods, mutation.value) } };
    case "SAVE_SCHEDULE":
      return { ...state, payroll: { ...state.payroll, schedules: upsert(state.payroll.schedules, mutation.value) } };
    case "SAVE_WORK_ENTRY":
      return { ...state, payroll: { ...state.payroll, workEntries: upsert(state.payroll.workEntries, mutation.value) } };
    case "SAVE_ATTENDANCE":
      return { ...state, payroll: { ...state.payroll, attendanceRecords: upsert(state.payroll.attendanceRecords || [], mutation.value) } };
    case "SAVE_ATTENDANCE_BATCH": {
      let next = [...(state.payroll.attendanceRecords || [])];
      for (const record of mutation.value) next = upsert(next, record);
      return { ...state, payroll: { ...state.payroll, attendanceRecords: next } };
    }
    case "SAVE_LEAVE":
      return { ...state, payroll: { ...state.payroll, leaveRequests: upsert(state.payroll.leaveRequests || [], mutation.value) } };
    case "SAVE_OVERTIME":
      return { ...state, payroll: { ...state.payroll, overtimeRequests: upsert(state.payroll.overtimeRequests || [], mutation.value) } };
    case "SAVE_PAYROLL_ENTRY":
      return { ...state, payroll: { ...state.payroll, entries: upsert(state.payroll.entries, mutation.value) } };
    case "UPDATE_PAYROLL_RUN":
      return { ...state, payroll: { ...state.payroll, runs: upsert(state.payroll.runs, mutation.value) } };
    case "SAVE_FINANCIAL_ACCOUNT":
      return { ...state, cash: { ...state.cash, accounts: upsert(state.cash.accounts, mutation.value) } };
    case "SAVE_FINANCIAL_SNAPSHOT":
      return { ...state, cash: { ...state.cash, snapshots: upsert(state.cash.snapshots, mutation.value) } };
    case "SAVE_FINANCIAL_TRANSACTION":
      return { ...state, cash: { ...state.cash, transactions: upsert(state.cash.transactions, mutation.value) } };
    case "SAVE_DAILY_SITE_LOGS":
      return { ...state, siteLogs: mutation.value };
    default:
      return state;
  }
}

export function resetDemoWorkspace(anchorDate: string): DemoWorkspaceData {
  return createDemoWorkspace(anchorDate);
}

export function isSafeStoredDemoWorkspace(value: unknown, expectedAnchorDate: string): value is DemoWorkspaceData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DemoWorkspaceData>;
  return candidate.version === 1
    && candidate.anchorDate === expectedAnchorDate
    && candidate.company?.id === DEMO_COMPANY_ID
    && Array.isArray(candidate.projects)
    && Array.isArray(candidate.invoices)
    && Boolean(candidate.payroll && candidate.cash && candidate.engineering && candidate.siteLogs);
}

export function prepareAddWorkerAction(
  state: DemoWorkspaceData,
  input: { firstName: string; lastName: string; rate: number; jobTitle?: string },
): DemoPreparedAssistantAction {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const rate = Number(input.rate);
  if (!firstName || !lastName || !Number.isFinite(rate) || rate <= 0) throw new Error("A worker name and positive hourly rate are required.");
  const normalizedName = `${firstName} ${lastName}`;
  const duplicate = state.payroll.workers.find((worker) => worker.displayName.toLowerCase() === normalizedName.toLowerCase());
  if (duplicate) throw new Error(`${normalizedName} already exists in Demo Workforce.`);
  const sequence = state.payroll.workers.length + 1;
  return {
    id: `demo-prepared-worker-${String(sequence).padStart(3, "0")}`,
    status: "PREPARED",
    kind: "ADD_WORKER",
    summary: `Add ${normalizedName} as an hourly ${input.jobTitle || "Field Worker"} at ₱${rate.toLocaleString("en-PH")}/hour.`,
    createdAt: demoTimestamp(state.anchorDate, 13, 0),
    payload: {
      firstName,
      lastName,
      displayName: normalizedName,
      employeeCode: `MEC-D${String(sequence).padStart(3, "0")}`,
      jobTitle: input.jobTitle || "Field Worker",
      payType: "HOURLY",
      rate,
    },
  };
}

export function executePreparedAssistantAction(state: DemoWorkspaceData, action: DemoPreparedAssistantAction): DemoWorkspaceData {
  if (action.status !== "PREPARED") throw new Error("Demo Assistant actions must be PREPARED before execution.");
  if (action.kind !== "ADD_WORKER") throw new Error("Unsupported Demo Assistant action.");
  const worker: Worker = {
    id: `demo-worker-added-${action.payload.employeeCode.toLowerCase()}`,
    employeeCode: action.payload.employeeCode,
    firstName: action.payload.firstName,
    lastName: action.payload.lastName,
    displayName: action.payload.displayName,
    employmentType: "HOURLY",
    employmentStatus: "ACTIVE",
    jobTitle: action.payload.jobTitle,
    department: "Field Operations",
    defaultPayType: action.payload.payType,
    defaultRate: action.payload.rate,
    active: true,
    hireDate: state.anchorDate,
    workingDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
    workingHoursStart: "07:00",
    workingHoursEnd: "16:00",
    notes: "Added through the sandboxed Demo Assistant after explicit confirmation.",
    createdAt: demoTimestamp(state.anchorDate, 13, 5),
    updatedAt: demoTimestamp(state.anchorDate, 13, 5),
  };
  return reduceDemoWorkspace(state, { type: "SAVE_WORKER", value: worker });
}
