import type { InvoiceProjectAllocation, Project, ProjectStatus } from "../types.ts";
import {
  replaceInvoiceProjectAllocationsLocally,
  toInvoiceProjectAllocationPersistenceRows,
  validateInvoiceProjectAllocationSet,
} from "../utils/projectAllocations.ts";
import { supabase } from "./supabase.ts";
import { companyScopedRow, requireActiveCompanyId } from "./companyContext.ts";
import {
  PROJECT_LABOR_AGGREGATE_RPC,
  parseProjectLaborCostAggregates,
  type ProjectLaborCostAggregate,
} from "../utils/projectLaborCostAggregate.ts";

const PROJECTS_STORAGE_KEY = "engineering_projects";
const ALLOCATIONS_STORAGE_KEY = "engineering_invoice_project_allocations";
type Row = Record<string, unknown>;

export type ProjectLifecycleAction = "DELETE_UNUSED" | "ARCHIVE" | "REACTIVATE";
export type ProjectLifecycleDependencyKey =
  | "invoiceProjectAllocations"
  | "expenses"
  | "projectWorkerAssignments"
  | "workEntries"
  | "overtimeRequests"
  | "payrollProjectAllocations"
  | "payrollEntryProjectContexts"
  | "payrollImportRows"
  | "workerDefaultProjects"
  | "compensationProfileDefaultProjects"
  | "engineeringDocuments"
  | "engineeringRfis"
  | "engineeringSubmittals"
  | "engineeringDailySiteLogs"
  | "projectAccountingEvents"
  | "purchaseOrders";
export type ProjectLifecycleDependencyCounts = Partial<Record<ProjectLifecycleDependencyKey, number>>;

export interface ProjectLifecyclePreview {
  projectId: string;
  projectCode: string;
  projectName: string;
  status: ProjectStatus;
  archivedAt?: string;
  archivedFromStatus?: Project["archivedFromStatus"];
  canDelete: boolean;
  canReactivate: boolean;
  recommendedAction: ProjectLifecycleAction;
  blockedReason?: string;
  totalDependencyCount: number;
  dependencies: Record<ProjectLifecycleDependencyKey, number>;
  source: "database" | "local" | "demo";
}

export interface ProjectLifecycleResult {
  entityType: "PROJECT";
  entityId: string;
  action: ProjectLifecycleAction;
  deleted: boolean;
  preflight: ProjectLifecyclePreview;
  record?: Project;
}

const PROJECT_LIFECYCLE_DEPENDENCY_KEYS: readonly ProjectLifecycleDependencyKey[] = [
  "invoiceProjectAllocations",
  "expenses",
  "projectWorkerAssignments",
  "workEntries",
  "overtimeRequests",
  "payrollProjectAllocations",
  "payrollEntryProjectContexts",
  "payrollImportRows",
  "workerDefaultProjects",
  "compensationProfileDefaultProjects",
  "engineeringDocuments",
  "engineeringRfis",
  "engineeringSubmittals",
  "engineeringDailySiteLogs",
  "projectAccountingEvents",
  "purchaseOrders",
];

const REACTIVATABLE_PROJECT_STATUSES: readonly Exclude<ProjectStatus, "ARCHIVED" | "COMPLETED" | "CANCELLED">[] = ["PLANNING", "ACTIVE", "ON_HOLD"];

function localId(prefix: string) { return globalThis.crypto?.randomUUID?.() || `local-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function text(value: unknown) { return value === null || value === undefined || value === "" ? undefined : String(value); }
function numberValue(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
async function currentUserId() { if (!supabase) return null; const { data } = await supabase.auth.getUser(); return data.user?.id || null; }

function projectFromRow(row: Row): Project { return { id: String(row.id), userId: text(row.user_id), projectCode: String(row.project_code || ""), projectName: String(row.project_name || ""), description: text(row.description), clientName: text(row.client_name), clientReference: text(row.client_reference), location: text(row.location), siteAddress: text(row.site_address), projectManager: text(row.project_manager), status: String(row.status || "PLANNING") as ProjectStatus, startDate: text(row.start_date), targetEndDate: text(row.target_end_date), actualEndDate: text(row.actual_end_date), contractValue: row.contract_value === null ? undefined : numberValue(row.contract_value), projectBudget: numberValue(row.project_budget), currency: String(row.currency || "PHP").toUpperCase(), notes: text(row.notes), createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()), archivedAt: text(row.archived_at), archivedFromStatus: text(row.archived_from_status) as Project["archivedFromStatus"] }; }
function allocationFromRow(row: Row): InvoiceProjectAllocation { return { id: String(row.id), invoiceId: String(row.invoice_id), projectId: String(row.project_id), projectCostCodeId: text(row.project_cost_code_id || row.cost_code_id), allocationType: String(row.allocation_type || "AMOUNT") as InvoiceProjectAllocation["allocationType"], allocationPercentage: row.allocation_percentage === null ? undefined : numberValue(row.allocation_percentage), allocationAmount: numberValue(row.allocation_amount), notes: text(row.notes), createdAt: text(row.created_at), updatedAt: text(row.updated_at) }; }
function projectRow(project: Project, userId: string, companyId: string) { return companyScopedRow({ id: project.id, user_id: userId, company_id: companyId, project_code: project.projectCode.trim(), project_name: project.projectName.trim(), description: project.description || null, client_name: project.clientName || null, client_reference: project.clientReference || null, location: project.location || null, site_address: project.siteAddress || null, project_manager: project.projectManager || null, status: project.status, start_date: project.startDate || null, target_end_date: project.targetEndDate || null, actual_end_date: project.actualEndDate || null, contract_value: project.contractValue ?? null, project_budget: project.projectBudget || 0, currency: (project.currency || "PHP").toUpperCase(), notes: project.notes || null, archived_at: project.archivedAt || null, archived_from_status: project.archivedFromStatus || null, updated_at: new Date().toISOString() }); }

function lifecycleDependencyCounts(input: ProjectLifecycleDependencyCounts): Record<ProjectLifecycleDependencyKey, number> {
  return Object.fromEntries(PROJECT_LIFECYCLE_DEPENDENCY_KEYS.map((key) => [key, Math.max(0, Number(input[key]) || 0)])) as Record<ProjectLifecycleDependencyKey, number>;
}

export function buildProjectLifecyclePreview(
  project: Project,
  input: ProjectLifecycleDependencyCounts = {},
  options: { allowDelete?: boolean; allowLegacyReactivation?: boolean; source?: "database" | "local" | "demo" } = {},
): ProjectLifecyclePreview {
  const dependencies = lifecycleDependencyCounts(input);
  const totalDependencyCount = Object.values(dependencies).reduce((total, count) => total + count, 0);
  const canDelete = options.allowDelete !== false && totalDependencyCount === 0;
  const canReactivate = project.status === "ARCHIVED"
    && Boolean(project.archivedAt)
    && (project.archivedFromStatus
      ? REACTIVATABLE_PROJECT_STATUSES.includes(project.archivedFromStatus as typeof REACTIVATABLE_PROJECT_STATUSES[number])
      : options.allowLegacyReactivation !== false);
  const recommendedAction: ProjectLifecycleAction = canDelete
    ? "DELETE_UNUSED"
    : canReactivate
      ? "REACTIVATE"
      : "ARCHIVE";
  return {
    projectId: project.id,
    projectCode: project.projectCode,
    projectName: project.projectName,
    status: project.status,
    archivedAt: project.archivedAt,
    archivedFromStatus: project.archivedFromStatus,
    canDelete,
    canReactivate,
    recommendedAction,
    blockedReason: canDelete
      ? undefined
      : project.status === "ARCHIVED" && !canReactivate
        ? "This project is archived and its prior state is unavailable or terminal; keep it archived."
        : "This project has operational or financial history and cannot be permanently deleted. Archive it instead.",
    totalDependencyCount,
    dependencies,
    source: options.source || "local",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }

export function parseProjectLifecyclePreview(value: unknown): ProjectLifecyclePreview {
  if (!isRecord(value)) throw new Error("Project lifecycle preflight returned an invalid response.");
  const dependencies = lifecycleDependencyCounts(isRecord(value.dependencies) ? Object.fromEntries(Object.entries(value.dependencies).map(([key, count]) => [key, numberValue(count)])) as ProjectLifecycleDependencyCounts : {});
  const status = String(value.status || "PLANNING") as ProjectStatus;
  const archivedFromStatus = text(value.archivedFromStatus) as Project["archivedFromStatus"];
  return {
    projectId: String(value.projectId || ""),
    projectCode: String(value.projectCode || ""),
    projectName: String(value.projectName || ""),
    status,
    archivedAt: text(value.archivedAt),
    archivedFromStatus,
    canDelete: value.canDelete === true,
    canReactivate: value.canReactivate === true,
    recommendedAction: String(value.recommendedAction || "ARCHIVE") as ProjectLifecycleAction,
    blockedReason: text(value.blockedReason),
    totalDependencyCount: numberValue(value.totalDependencyCount, Object.values(dependencies).reduce((total, count) => total + count, 0)),
    dependencies,
    source: "database",
  };
}

function parseProjectLifecycleResult(value: unknown): ProjectLifecycleResult {
  if (!isRecord(value)) throw new Error("Project lifecycle operation returned an invalid response.");
  return {
    entityType: "PROJECT",
    entityId: String(value.entityId || ""),
    action: String(value.action || "ARCHIVE") as ProjectLifecycleAction,
    deleted: value.deleted === true,
    preflight: parseProjectLifecyclePreview(value.preflight),
    record: isRecord(value.record) ? projectFromRow(value.record) : undefined,
  };
}

function readJson<T>(key: string, storage?: Storage): T[] { const target = storage || (typeof localStorage === "undefined" ? undefined : localStorage); if (!target) return []; try { const value = JSON.parse(target.getItem(key) || "[]"); return Array.isArray(value) ? value as T[] : []; } catch { return []; } }
function writeJson<T>(key: string, value: T[], storage?: Storage) { try { (storage || (typeof localStorage === "undefined" ? undefined : localStorage))?.setItem(key, JSON.stringify(value)); } catch { /* Guest storage is best effort. */ } }
export function readProjectsFromLocal(storage?: Storage): Project[] { return readJson<Project>(PROJECTS_STORAGE_KEY, storage); }
export function writeProjectsToLocal(projects: Project[], storage?: Storage) { writeJson(PROJECTS_STORAGE_KEY, projects, storage); }
export function readInvoiceProjectAllocationsFromLocal(storage?: Storage): InvoiceProjectAllocation[] { return readJson<InvoiceProjectAllocation>(ALLOCATIONS_STORAGE_KEY, storage); }
export function writeInvoiceProjectAllocationsToLocal(allocations: InvoiceProjectAllocation[], storage?: Storage) { writeJson(ALLOCATIONS_STORAGE_KEY, allocations, storage); }
export function createLocalProject(input: Omit<Project, "id" | "createdAt" | "updatedAt">): Project { const now = new Date().toISOString(); return { ...input, id: localId("project"), createdAt: now, updatedAt: now }; }
export function createLocalAllocation(input: Omit<InvoiceProjectAllocation, "id">): InvoiceProjectAllocation { return { ...input, id: localId("allocation") }; }

export async function loadProjectsFromSupabase(): Promise<Project[]> { const userId = await currentUserId(); if (!supabase || !userId) return []; const companyId = requireActiveCompanyId(); const { data, error } = await supabase.from("projects").select("*").eq("company_id", companyId).order("updated_at", { ascending: false }); if (error) throw error; return (data || []).map((row) => projectFromRow(row as Row)); }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Loads project-level labor only; payroll detail is never selected here. */
export async function loadProjectLaborCostAggregatesFromSupabase(projectIds: readonly string[]): Promise<ProjectLaborCostAggregate[]> {
  const requestedProjectIds = [...new Set(projectIds.map((projectId) => String(projectId || "").trim()).filter(Boolean))];
  if (!requestedProjectIds.length) return [];
  if (requestedProjectIds.some((projectId) => !UUID_PATTERN.test(projectId))) throw new Error("Project labor aggregation requires valid project identifiers.");
  const userId = await currentUserId();
  if (!supabase || !userId) return [];
  requireActiveCompanyId();
  const { data, error } = await supabase.rpc(PROJECT_LABOR_AGGREGATE_RPC, { p_project_ids: requestedProjectIds });
  if (error) throw error;
  return parseProjectLaborCostAggregates(Array.isArray(data) ? data : [], requestedProjectIds);
}

export async function saveProjectToSupabase(project: Project): Promise<Project> { const userId = await currentUserId(); if (!supabase || !userId) throw new Error("Sign in before saving projects."); const companyId = requireActiveCompanyId(); const { data, error } = await supabase.from("projects").upsert(projectRow(project, userId, companyId)).select("*").single(); if (error) throw error; return projectFromRow(data as Row); }
export async function previewProjectLifecycleInSupabase(projectId: string): Promise<ProjectLifecyclePreview> {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before previewing project lifecycle actions.");
  requireActiveCompanyId();
  const { data, error } = await supabase.rpc("preview_project_lifecycle", { p_project_id: projectId });
  if (error) throw error;
  return parseProjectLifecyclePreview(data);
}

export async function applyProjectLifecycleInSupabase(
  projectId: string,
  action: ProjectLifecycleAction,
  reason?: string,
): Promise<ProjectLifecycleResult> {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before changing project lifecycle state.");
  requireActiveCompanyId();
  const { data, error } = await supabase.rpc("apply_project_lifecycle", {
    p_project_id: projectId,
    p_action: action,
    p_reason: reason || null,
  });
  if (error) throw error;
  return parseProjectLifecycleResult(data);
}

export async function archiveProjectInSupabase(projectId: string, reason = "Confirmed project archive"): Promise<Project> {
  const result = await applyProjectLifecycleInSupabase(projectId, "ARCHIVE", reason);
  if (!result.record) throw new Error("Project archive did not return the preserved project record.");
  return result.record;
}

export async function reactivateProjectInSupabase(projectId: string, reason = "Confirmed project reactivation"): Promise<Project> {
  const result = await applyProjectLifecycleInSupabase(projectId, "REACTIVATE", reason);
  if (!result.record) throw new Error("Project reactivation did not return the project record.");
  return result.record;
}
export async function loadInvoiceProjectAllocationsFromSupabase(): Promise<InvoiceProjectAllocation[]> { const userId = await currentUserId(); if (!supabase || !userId) return []; const companyId = requireActiveCompanyId(); const { data, error } = await supabase.from("invoice_project_allocations").select("*").eq("company_id", companyId).order("created_at", { ascending: true }); if (error) throw error; return (data || []).map((row) => allocationFromRow(row as Row)); }
export interface InvoiceProjectAllocationReplacementResult {
  allocations: InvoiceProjectAllocation[];
  invoiceUpdatedAt?: string;
}

export async function replaceInvoiceProjectAllocationsOnSupabase(
  invoiceId: string,
  invoiceTotal: number,
  allocations: InvoiceProjectAllocation[],
  expectedInvoiceUpdatedAt?: string,
): Promise<InvoiceProjectAllocationReplacementResult> {
  const validation = validateInvoiceProjectAllocationSet(invoiceTotal, allocations);
  if (!validation.valid) throw new Error(validation.message || "Invoice project allocations are invalid.");

  const userId = await currentUserId();
  if (!supabase) {
    const replaced = replaceInvoiceProjectAllocationsLocally(invoiceId, invoiceTotal, readInvoiceProjectAllocationsFromLocal(), allocations);
    writeInvoiceProjectAllocationsToLocal(replaced);
    return { allocations: replaced.filter((allocation) => allocation.invoiceId === invoiceId) };
  }
  if (!userId) throw new Error("Sign in before assigning invoice projects."); requireActiveCompanyId();
  if (!expectedInvoiceUpdatedAt) throw new Error("Invoice freshness is unavailable; refresh before assigning invoice projects.");

  const { data, error } = await supabase.rpc("replace_invoice_project_allocations", {
    p_invoice_id: invoiceId,
    p_allocations: toInvoiceProjectAllocationPersistenceRows(invoiceId, invoiceTotal, allocations),
    p_expected_updated_at: expectedInvoiceUpdatedAt,
  });
  if (error) throw error;
  const { data: invoice, error: invoiceError } = await supabase.from("invoices").select("updated_at").eq("id", invoiceId).eq("company_id", requireActiveCompanyId()).single();
  if (invoiceError) throw invoiceError;
  return { allocations: (data || []).map((row) => allocationFromRow(row as Row)), invoiceUpdatedAt: String(invoice.updated_at || "") || undefined };
}
