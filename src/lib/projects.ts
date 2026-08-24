import type { InvoiceProjectAllocation, Project, ProjectStatus } from "../types.ts";
import {
  replaceInvoiceProjectAllocationsLocally,
  toInvoiceProjectAllocationPersistenceRows,
  validateInvoiceProjectAllocationSet,
} from "../utils/projectAllocations.ts";
import { supabase } from "./supabase.ts";
import { companyScopedRow, requireActiveCompanyId } from "./companyContext.ts";

const PROJECTS_STORAGE_KEY = "engineering_projects";
const ALLOCATIONS_STORAGE_KEY = "engineering_invoice_project_allocations";
type Row = Record<string, unknown>;
function localId(prefix: string) { return globalThis.crypto?.randomUUID?.() || `local-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function text(value: unknown) { return value === null || value === undefined || value === "" ? undefined : String(value); }
function numberValue(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
async function currentUserId() { if (!supabase) return null; const { data } = await supabase.auth.getUser(); return data.user?.id || null; }

function projectFromRow(row: Row): Project { return { id: String(row.id), userId: text(row.user_id), projectCode: String(row.project_code || ""), projectName: String(row.project_name || ""), description: text(row.description), clientName: text(row.client_name), clientReference: text(row.client_reference), location: text(row.location), siteAddress: text(row.site_address), projectManager: text(row.project_manager), status: String(row.status || "PLANNING") as ProjectStatus, startDate: text(row.start_date), targetEndDate: text(row.target_end_date), actualEndDate: text(row.actual_end_date), contractValue: row.contract_value === null ? undefined : numberValue(row.contract_value), projectBudget: numberValue(row.project_budget), currency: String(row.currency || "PHP").toUpperCase(), notes: text(row.notes), createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()), archivedAt: text(row.archived_at) }; }
function allocationFromRow(row: Row): InvoiceProjectAllocation { return { id: String(row.id), invoiceId: String(row.invoice_id), projectId: String(row.project_id), allocationType: String(row.allocation_type || "AMOUNT") as InvoiceProjectAllocation["allocationType"], allocationPercentage: row.allocation_percentage === null ? undefined : numberValue(row.allocation_percentage), allocationAmount: numberValue(row.allocation_amount), notes: text(row.notes), createdAt: text(row.created_at), updatedAt: text(row.updated_at) }; }
function projectRow(project: Project, userId: string, companyId: string) { return companyScopedRow({ id: project.id, user_id: userId, company_id: companyId, project_code: project.projectCode.trim(), project_name: project.projectName.trim(), description: project.description || null, client_name: project.clientName || null, client_reference: project.clientReference || null, location: project.location || null, site_address: project.siteAddress || null, project_manager: project.projectManager || null, status: project.status, start_date: project.startDate || null, target_end_date: project.targetEndDate || null, actual_end_date: project.actualEndDate || null, contract_value: project.contractValue ?? null, project_budget: project.projectBudget || 0, currency: (project.currency || "PHP").toUpperCase(), notes: project.notes || null, archived_at: project.archivedAt || null, updated_at: new Date().toISOString() }); }

function readJson<T>(key: string, storage?: Storage): T[] { const target = storage || (typeof localStorage === "undefined" ? undefined : localStorage); if (!target) return []; try { const value = JSON.parse(target.getItem(key) || "[]"); return Array.isArray(value) ? value as T[] : []; } catch { return []; } }
function writeJson<T>(key: string, value: T[], storage?: Storage) { try { (storage || (typeof localStorage === "undefined" ? undefined : localStorage))?.setItem(key, JSON.stringify(value)); } catch { /* Guest storage is best effort. */ } }
export function readProjectsFromLocal(storage?: Storage): Project[] { return readJson<Project>(PROJECTS_STORAGE_KEY, storage); }
export function writeProjectsToLocal(projects: Project[], storage?: Storage) { writeJson(PROJECTS_STORAGE_KEY, projects, storage); }
export function readInvoiceProjectAllocationsFromLocal(storage?: Storage): InvoiceProjectAllocation[] { return readJson<InvoiceProjectAllocation>(ALLOCATIONS_STORAGE_KEY, storage); }
export function writeInvoiceProjectAllocationsToLocal(allocations: InvoiceProjectAllocation[], storage?: Storage) { writeJson(ALLOCATIONS_STORAGE_KEY, allocations, storage); }
export function createLocalProject(input: Omit<Project, "id" | "createdAt" | "updatedAt">): Project { const now = new Date().toISOString(); return { ...input, id: localId("project"), createdAt: now, updatedAt: now }; }
export function createLocalAllocation(input: Omit<InvoiceProjectAllocation, "id">): InvoiceProjectAllocation { return { ...input, id: localId("allocation") }; }

export async function loadProjectsFromSupabase(): Promise<Project[]> { const userId = await currentUserId(); if (!supabase || !userId) return []; const companyId = requireActiveCompanyId(); const { data, error } = await supabase.from("projects").select("*").eq("company_id", companyId).order("updated_at", { ascending: false }); if (error) throw error; return (data || []).map((row) => projectFromRow(row as Row)); }
export async function saveProjectToSupabase(project: Project): Promise<Project> { const userId = await currentUserId(); if (!supabase || !userId) throw new Error("Sign in before saving projects."); const companyId = requireActiveCompanyId(); const { data, error } = await supabase.from("projects").upsert(projectRow(project, userId, companyId)).select("*").single(); if (error) throw error; return projectFromRow(data as Row); }
export async function archiveProjectInSupabase(projectId: string): Promise<Project> { const userId = await currentUserId(); if (!supabase || !userId) throw new Error("Sign in before archiving projects."); const companyId = requireActiveCompanyId(); const archivedAt = new Date().toISOString(); const { data, error } = await supabase.from("projects").update({ status: "ARCHIVED", archived_at: archivedAt, updated_at: archivedAt }).eq("id", projectId).eq("company_id", companyId).select("*").single(); if (error) throw error; return projectFromRow(data as Row); }
export async function loadInvoiceProjectAllocationsFromSupabase(): Promise<InvoiceProjectAllocation[]> { const userId = await currentUserId(); if (!supabase || !userId) return []; const companyId = requireActiveCompanyId(); const { data, error } = await supabase.from("invoice_project_allocations").select("*").eq("company_id", companyId).order("created_at", { ascending: true }); if (error) throw error; return (data || []).map((row) => allocationFromRow(row as Row)); }
export async function replaceInvoiceProjectAllocationsOnSupabase(invoiceId: string, invoiceTotal: number, allocations: InvoiceProjectAllocation[]): Promise<InvoiceProjectAllocation[]> {
  const validation = validateInvoiceProjectAllocationSet(invoiceTotal, allocations);
  if (!validation.valid) throw new Error(validation.message || "Invoice project allocations are invalid.");

  const userId = await currentUserId();
  if (!supabase) {
    const replaced = replaceInvoiceProjectAllocationsLocally(invoiceId, invoiceTotal, readInvoiceProjectAllocationsFromLocal(), allocations);
    writeInvoiceProjectAllocationsToLocal(replaced);
    return replaced.filter((allocation) => allocation.invoiceId === invoiceId);
  }
  if (!userId) throw new Error("Sign in before assigning invoice projects."); requireActiveCompanyId();

  const { data, error } = await supabase.rpc("replace_invoice_project_allocations", {
    p_invoice_id: invoiceId,
    p_allocations: toInvoiceProjectAllocationPersistenceRows(invoiceId, invoiceTotal, allocations),
  });
  if (error) throw error;
  return (data || []).map((row) => allocationFromRow(row as Row));
}
