import type {
  PayrollAdjustment,
  PayrollEntry,
  PayrollPeriod,
  PayrollProjectAllocation,
  PayrollRun,
  ProjectWorkerAssignment,
  Worker,
  WorkEntry,
} from "../types.ts";
import { supabase } from "./supabase.ts";

const WORKERS_STORAGE_KEY = "engineering_workers";
const ASSIGNMENTS_STORAGE_KEY = "engineering_project_worker_assignments";
const PERIODS_STORAGE_KEY = "engineering_payroll_periods";
const RUNS_STORAGE_KEY = "engineering_payroll_runs";
const ALLOCATIONS_STORAGE_KEY = "engineering_payroll_allocations";
const WORK_ENTRIES_STORAGE_KEY = "engineering_work_entries";

function id(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `local-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function persistedId(value: string | undefined, prefix: string) { return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : id(prefix); }

function text(value: unknown) { return value === null || value === undefined ? undefined : String(value); }
function numberValue(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function bool(value: unknown, fallback = true) { return value === null || value === undefined ? fallback : Boolean(value); }
function round(value: number) { return Math.round((Number(value) || 0) * 100) / 100; }

function workerFromRow(row: Record<string, unknown>): Worker {
  return {
    id: String(row.id), userId: text(row.user_id), employeeCode: String(row.employee_code || ""),
    firstName: String(row.first_name || ""), middleName: text(row.middle_name), lastName: String(row.last_name || ""),
    displayName: String(row.display_name || [row.first_name, row.last_name].filter(Boolean).join(" ")),
    employmentType: String(row.employment_type || "OTHER") as Worker["employmentType"], jobTitle: text(row.job_title), department: text(row.department),
    defaultPayType: String(row.default_pay_type || "MONTHLY") as Worker["defaultPayType"], defaultRate: numberValue(row.default_rate),
    active: bool(row.active), hireDate: text(row.hire_date), endDate: text(row.end_date), notes: text(row.notes),
    createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()), archivedAt: text(row.archived_at),
  };
}

function assignmentFromRow(row: Record<string, unknown>): ProjectWorkerAssignment {
  return {
    id: String(row.id), workerId: String(row.worker_id), projectId: String(row.project_id), startDate: String(row.start_date || ""), endDate: text(row.end_date),
    payType: text(row.pay_type) as ProjectWorkerAssignment["payType"], rate: row.rate === null ? undefined : numberValue(row.rate), roleOnProject: text(row.role_on_project), active: bool(row.active), notes: text(row.notes),
  };
}

function periodFromRow(row: Record<string, unknown>): PayrollPeriod {
  return {
    id: String(row.id), userId: text(row.user_id), periodStart: String(row.period_start || ""), periodEnd: String(row.period_end || ""), payDate: text(row.pay_date),
    status: String(row.status || "DRAFT") as PayrollPeriod["status"], notes: text(row.notes), createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function runFromRow(row: Record<string, unknown>): PayrollRun {
  return {
    id: String(row.id), userId: text(row.user_id), periodId: String(row.period_id), status: String(row.status || "DRAFT") as PayrollRun["status"],
    createdAt: String(row.created_at || new Date().toISOString()), approvedAt: text(row.approved_at), paidAt: text(row.paid_at), notes: text(row.notes),
  };
}

function entryFromRow(row: Record<string, unknown>): PayrollEntry {
  return {
    id: String(row.id), payrollRunId: String(row.payroll_run_id), workerId: String(row.worker_id), basePay: numberValue(row.base_pay), regularPay: numberValue(row.regular_pay),
    overtimePay: numberValue(row.overtime_pay), allowances: numberValue(row.allowances), grossPay: numberValue(row.gross_pay), deductions: numberValue(row.deductions), netPay: numberValue(row.net_pay),
    projectAllocatedCost: numberValue(row.project_allocated_cost), calculationSnapshot: (row.calculation_snapshot || {}) as Record<string, unknown>, createdAt: text(row.created_at),
  };
}

function allocationFromRow(row: Record<string, unknown>): PayrollProjectAllocation {
  return { id: String(row.id), payrollEntryId: String(row.payroll_entry_id), projectId: String(row.project_id), allocationAmount: numberValue(row.allocation_amount), allocationPercentage: row.allocation_percentage === null ? undefined : numberValue(row.allocation_percentage), source: String(row.source || "MANUAL") as PayrollProjectAllocation["source"] };
}

function workEntryFromRow(row: Record<string, unknown>): WorkEntry {
  return { id: String(row.id), workerId: String(row.worker_id), projectId: String(row.project_id), workDate: String(row.work_date || ""), regularHours: numberValue(row.regular_hours), overtimeHours: numberValue(row.overtime_hours), daysWorked: numberValue(row.days_worked), rate: numberValue(row.rate), overtimeRate: row.overtime_rate === null ? undefined : numberValue(row.overtime_rate), description: text(row.description), notes: text(row.notes), status: String(row.status || "DRAFT") as WorkEntry["status"] };
}

export interface PayrollWorkspaceData {
  workers: Worker[];
  assignments: ProjectWorkerAssignment[];
  periods: PayrollPeriod[];
  runs: PayrollRun[];
  entries: PayrollEntry[];
  allocations: PayrollProjectAllocation[];
  workEntries: WorkEntry[];
  adjustments: PayrollAdjustment[];
}

async function currentUserId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

function localJson<T>(key: string, storage: Storage | undefined): T[] {
  if (!storage) return [];
  try { return JSON.parse(storage.getItem(key) || "[]") as T[]; } catch { return []; }
}

function writeJson<T>(key: string, value: T[], storage: Storage | undefined) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* local demo storage can be full */ }
}

export function readPayrollWorkspaceFromLocal(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): PayrollWorkspaceData {
  return {
    workers: localJson<Worker>(WORKERS_STORAGE_KEY, storage), assignments: localJson<ProjectWorkerAssignment>(ASSIGNMENTS_STORAGE_KEY, storage), periods: localJson<PayrollPeriod>(PERIODS_STORAGE_KEY, storage),
    runs: localJson<PayrollRun>(RUNS_STORAGE_KEY, storage), entries: [], allocations: localJson<PayrollProjectAllocation>(ALLOCATIONS_STORAGE_KEY, storage), workEntries: localJson<WorkEntry>(WORK_ENTRIES_STORAGE_KEY, storage), adjustments: [],
  };
}

export function writePayrollWorkspaceToLocal(data: PayrollWorkspaceData, storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  writeJson(WORKERS_STORAGE_KEY, data.workers, storage); writeJson(ASSIGNMENTS_STORAGE_KEY, data.assignments, storage); writeJson(PERIODS_STORAGE_KEY, data.periods, storage); writeJson(RUNS_STORAGE_KEY, data.runs, storage); writeJson(ALLOCATIONS_STORAGE_KEY, data.allocations, storage); writeJson(WORK_ENTRIES_STORAGE_KEY, data.workEntries, storage);
}

export function createLocalWorker(input: Omit<Worker, "id" | "createdAt" | "updatedAt">): Worker { const now = new Date().toISOString(); return { ...input, id: id("worker"), createdAt: now, updatedAt: now }; }
export function createLocalPeriod(input: Omit<PayrollPeriod, "id" | "createdAt" | "updatedAt">): PayrollPeriod { const now = new Date().toISOString(); return { ...input, id: id("period"), createdAt: now, updatedAt: now }; }
export function createLocalWorkEntry(input: Omit<WorkEntry, "id">): WorkEntry { return { ...input, id: id("work") }; }
export function createLocalAssignment(input: Omit<ProjectWorkerAssignment, "id">): ProjectWorkerAssignment { return { ...input, id: id("assignment") }; }

export function calculateMonthlyProjectAllocations(totalPay: number, allocations: Array<{ projectId: string; percentage: number }>): Array<{ projectId: string; allocationAmount: number; allocationPercentage: number }> {
  const valid = allocations.filter((item) => item.projectId && item.percentage > 0);
  const totalPercentage = valid.reduce((sum, item) => sum + item.percentage, 0);
  if (totalPercentage > 100.01) throw new Error("Payroll project allocation exceeds 100%.");
  let assigned = 0;
  return valid.map((item, index) => {
    const amount = Math.abs(totalPercentage - 100) <= 0.01 && index === valid.length - 1 ? round(totalPay - assigned) : round(totalPay * item.percentage / 100);
    assigned += amount;
    return { projectId: item.projectId, allocationAmount: amount, allocationPercentage: item.percentage };
  });
}

export function calculateWorkEntryCost(entry: Pick<WorkEntry, "regularHours" | "overtimeHours" | "daysWorked" | "rate" | "overtimeRate">, payType: Worker["defaultPayType"]) {
  const regular = payType === "HOURLY" ? (Number(entry.regularHours) || 0) * (Number(entry.rate) || 0) : payType === "DAILY" ? (Number(entry.daysWorked) || 0) * (Number(entry.rate) || 0) : 0;
  const overtime = (Number(entry.overtimeHours) || 0) * (Number(entry.overtimeRate ?? entry.rate) || 0);
  return round(regular + overtime);
}

export function payrollStatusIsConfirmed(status: string) { return status === "APPROVED" || status === "PAID"; }

export async function loadPayrollWorkspaceFromSupabase(): Promise<PayrollWorkspaceData> {
  const userId = await currentUserId();
  if (!supabase || !userId) return { workers: [], assignments: [], periods: [], runs: [], entries: [], allocations: [], workEntries: [], adjustments: [] };
  const [workers, assignments, periods, runs, entries, allocations, workEntries, adjustments] = await Promise.all([
    supabase.from("workers").select("*").is("archived_at", null).order("last_name"),
    supabase.from("project_worker_assignments").select("*").order("start_date", { ascending: false }),
    supabase.from("payroll_periods").select("*").order("period_end", { ascending: false }),
    supabase.from("payroll_runs").select("*").order("created_at", { ascending: false }),
    supabase.from("payroll_entries").select("*"),
    supabase.from("payroll_project_allocations").select("*"),
    supabase.from("work_entries").select("*").order("work_date", { ascending: false }),
    supabase.from("payroll_adjustments").select("*"),
  ]);
  for (const result of [workers, assignments, periods, runs, entries, allocations, workEntries, adjustments]) if (result.error) throw result.error;
  return {
    workers: (workers.data || []).map((row) => workerFromRow(row as Record<string, unknown>)),
    assignments: (assignments.data || []).map((row) => assignmentFromRow(row as Record<string, unknown>)),
    periods: (periods.data || []).map((row) => periodFromRow(row as Record<string, unknown>)),
    runs: (runs.data || []).map((row) => runFromRow(row as Record<string, unknown>)),
    entries: (entries.data || []).map((row) => entryFromRow(row as Record<string, unknown>)),
    allocations: (allocations.data || []).map((row) => allocationFromRow(row as Record<string, unknown>)),
    workEntries: (workEntries.data || []).map((row) => workEntryFromRow(row as Record<string, unknown>)),
    adjustments: (adjustments.data || []).map((row) => ({ id: String(row.id), payrollEntryId: String(row.payroll_entry_id), type: String(row.type) as PayrollAdjustment["type"], code: text(row.code), description: text(row.description), amount: numberValue(row.amount) })),
  };
}

export async function saveWorkerToSupabase(worker: Worker) {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before saving workers.");
  const { data, error } = await supabase.from("workers").upsert({ id: persistedId(worker.id, "worker"), user_id: userId, employee_code: worker.employeeCode, first_name: worker.firstName, middle_name: worker.middleName || null, last_name: worker.lastName, display_name: worker.displayName, employment_type: worker.employmentType, job_title: worker.jobTitle || null, department: worker.department || null, default_pay_type: worker.defaultPayType, default_rate: worker.defaultRate, active: worker.active, hire_date: worker.hireDate || null, end_date: worker.endDate || null, notes: worker.notes || null, archived_at: worker.archivedAt || null, updated_at: new Date().toISOString() }).select("*").single();
  if (error) throw error;
  return workerFromRow(data as Record<string, unknown>);
}

export async function saveAssignmentToSupabase(assignment: ProjectWorkerAssignment) {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before assigning workers.");
  const { data, error } = await supabase.from("project_worker_assignments").upsert({ id: persistedId(assignment.id, "assignment"), user_id: userId, worker_id: assignment.workerId, project_id: assignment.projectId, start_date: assignment.startDate, end_date: assignment.endDate || null, pay_type: assignment.payType || null, rate: assignment.rate ?? null, role_on_project: assignment.roleOnProject || null, active: assignment.active, notes: assignment.notes || null, updated_at: new Date().toISOString() }).select("*").single();
  if (error) throw error;
  return assignmentFromRow(data as Record<string, unknown>);
}

export async function savePayrollPeriodToSupabase(period: PayrollPeriod) {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before saving payroll periods.");
  const { data, error } = await supabase.from("payroll_periods").upsert({ id: persistedId(period.id, "period"), user_id: userId, period_start: period.periodStart, period_end: period.periodEnd, pay_date: period.payDate || null, status: period.status, notes: period.notes || null, updated_at: new Date().toISOString() }).select("*").single();
  if (error) throw error;
  return periodFromRow(data as Record<string, unknown>);
}

export async function saveWorkEntryToSupabase(entry: WorkEntry) {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before saving time entries.");
  const { data, error } = await supabase.from("work_entries").upsert({ id: persistedId(entry.id, "work"), user_id: userId, worker_id: entry.workerId, project_id: entry.projectId, work_date: entry.workDate, regular_hours: entry.regularHours ?? null, overtime_hours: entry.overtimeHours ?? null, days_worked: entry.daysWorked ?? null, rate: entry.rate, overtime_rate: entry.overtimeRate ?? null, description: entry.description || null, notes: entry.notes || null, status: entry.status, updated_at: new Date().toISOString() }).select("*").single();
  if (error) throw error;
  return { ...entry, id: String(data.id), status: String(data.status || entry.status) as WorkEntry["status"] };
}

export async function savePayrollRunToSupabase(run: PayrollRun) {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before creating payroll runs.");
  const { data, error } = await supabase.from("payroll_runs").upsert({ id: persistedId(run.id, "run"), user_id: userId, period_id: run.periodId, status: run.status, approved_at: run.approvedAt || null, paid_at: run.paidAt || null, notes: run.notes || null }).select("*").single();
  if (error) throw error;
  return runFromRow(data as Record<string, unknown>);
}

export async function savePayrollEntryToSupabase(entry: PayrollEntry, allocations: PayrollProjectAllocation[]) {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before saving payroll entries.");
  const entryId = persistedId(entry.id, "entry");
  const { data: entryRow, error: entryError } = await supabase.from("payroll_entries").upsert({ id: entryId, user_id: userId, payroll_run_id: entry.payrollRunId, worker_id: entry.workerId, base_pay: entry.basePay, regular_pay: entry.regularPay, overtime_pay: entry.overtimePay, allowances: entry.allowances, gross_pay: entry.grossPay, deductions: entry.deductions, net_pay: entry.netPay, project_allocated_cost: entry.projectAllocatedCost, calculation_snapshot: entry.calculationSnapshot || {} }).select("*").single();
  if (entryError) throw entryError;
  const { error: deleteError } = await supabase.from("payroll_project_allocations").delete().eq("payroll_entry_id", entryId).eq("user_id", userId);
  if (deleteError) throw deleteError;
  const rows = allocations.map((allocation) => ({ id: allocation.id && !allocation.id.startsWith("local-") ? allocation.id : undefined, user_id: userId, payroll_entry_id: entryId, project_id: allocation.projectId, allocation_amount: allocation.allocationAmount, allocation_percentage: allocation.allocationPercentage ?? null, source: allocation.source }));
  const { data: allocationRows, error: allocationError } = rows.length ? await supabase.from("payroll_project_allocations").insert(rows).select("*") : { data: [], error: null };
  if (allocationError) throw allocationError;
  return { entry: entryFromRow(entryRow as Record<string, unknown>), allocations: (allocationRows || []).map((row) => allocationFromRow(row as Record<string, unknown>)) };
}
