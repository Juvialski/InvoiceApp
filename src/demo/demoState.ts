import type { FinancialAccount, FinancialBalanceSnapshot, FinancialTransaction } from "../lib/cashBanking.ts";
import type { PayrollSchedule } from "../lib/payrollSchedule.ts";
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
  | { type: "SAVE_FINANCIAL_TRANSACTION"; value: FinancialTransaction };

function upsert<T extends { id: string }>(items: readonly T[], value: T): T[] {
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
    && Boolean(candidate.payroll && candidate.cash && candidate.engineering);
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
