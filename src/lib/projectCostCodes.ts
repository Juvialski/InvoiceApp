import type { ProjectCostCode, ProjectCostCodeStatus } from "../types.ts";
import { supabase } from "./supabase.ts";
import { companyScopedRow, requireActiveCompanyId } from "./companyContext.ts";

const COST_CODES_STORAGE_KEY = "engineering_project_cost_codes";
type Row = Record<string, unknown>;

function localId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `local-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function currentUserId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

export function costCodeFromRow(row: Row): ProjectCostCode {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    projectId: String(row.project_id),
    code: String(row.code || "").toUpperCase(),
    name: String(row.name || ""),
    description: text(row.description),
    status: (String(row.status || "ACTIVE").toUpperCase() as ProjectCostCodeStatus) || "ACTIVE",
    approvedBudgetAmount: numberValue(row.approved_budget_amount, 0),
    forecastAmount: row.forecast_amount === null || row.forecast_amount === undefined ? undefined : numberValue(row.forecast_amount),
    createdByUserId: text(row.created_by_user_id),
    updatedByUserId: text(row.updated_by_user_id),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    archivedAt: text(row.archived_at),
  };
}

export function costCodeToRow(
  costCode: Partial<ProjectCostCode> & {
    projectId: string;
    code: string;
    name: string;
    approvedBudgetAmount: number;
    status?: ProjectCostCodeStatus;
  },
  userId?: string,
  companyId?: string,
) {
  return companyScopedRow({
    ...(costCode.id ? { id: costCode.id } : {}),
    ...(userId ? { created_by_user_id: costCode.createdByUserId || userId, updated_by_user_id: userId } : {}),
    ...(companyId ? { company_id: companyId } : {}),
    project_id: costCode.projectId,
    code: costCode.code.trim().toUpperCase(),
    name: costCode.name.trim(),
    description: costCode.description || null,
    status: costCode.status || "ACTIVE",
    approved_budget_amount: Math.max(0, Number(costCode.approvedBudgetAmount) || 0),
    forecast_amount: costCode.forecastAmount != null && Number.isFinite(Number(costCode.forecastAmount))
      ? Math.max(0, Number(costCode.forecastAmount))
      : null,
    archived_at: costCode.archivedAt || null,
    updated_at: new Date().toISOString(),
  });
}

function readJson<T>(key: string, storage?: Storage): T[] {
  const target = storage || (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return [];
  try {
    const value = JSON.parse(target.getItem(key) || "[]");
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, data: T[], storage?: Storage) {
  const target = storage || (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return;
  try {
    target.setItem(key, JSON.stringify(data));
  } catch {
    /* Guest storage is best effort. */
  }
}

export function readProjectCostCodesFromLocal(storage?: Storage): ProjectCostCode[] {
  return readJson<ProjectCostCode>(COST_CODES_STORAGE_KEY, storage);
}

export function writeProjectCostCodesToLocal(costCodes: ProjectCostCode[], storage?: Storage) {
  writeJson(COST_CODES_STORAGE_KEY, costCodes, storage);
}

export function createLocalProjectCostCode(
  input: Omit<ProjectCostCode, "id" | "createdAt" | "updatedAt" | "status"> & {
    status?: ProjectCostCodeStatus;
  },
): ProjectCostCode {
  const now = new Date().toISOString();
  return {
    ...input,
    id: localId("cost-code"),
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    approvedBudgetAmount: Math.max(0, Number(input.approvedBudgetAmount) || 0),
    forecastAmount: input.forecastAmount != null && Number.isFinite(Number(input.forecastAmount))
      ? Math.max(0, Number(input.forecastAmount))
      : undefined,
    status: input.status || "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
}

export async function loadProjectCostCodesFromSupabase(projectId?: string): Promise<ProjectCostCode[]> {
  const userId = await currentUserId();
  if (!supabase || !userId) return [];
  const companyId = requireActiveCompanyId();
  let query = supabase.from("project_cost_codes").select("*").eq("company_id", companyId);
  if (projectId) {
    query = query.eq("project_id", projectId);
  }
  const { data, error } = await query.order("code", { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => costCodeFromRow(row as Row));
}

export async function saveProjectCostCodeToSupabase(
  costCode: {
    id?: string;
    projectId: string;
    code: string;
    name: string;
    description?: string;
    approvedBudgetAmount: number;
    forecastAmount?: number;
    status: ProjectCostCodeStatus;
    createdByUserId?: string;
    updatedByUserId?: string;
    createdAt?: string;
    updatedAt?: string;
    archivedAt?: string;
    companyId?: string;
  },
): Promise<ProjectCostCode> {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before saving cost codes.");
  const companyId = requireActiveCompanyId();
  const fullCostCode: ProjectCostCode = {
    ...costCode,
    id: costCode.id || localId("cost-code"),
    status: costCode.status || "ACTIVE",
    createdAt: costCode.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const row = costCodeToRow(fullCostCode, userId, companyId);
  const { data, error } = await supabase.from("project_cost_codes").upsert(row).select("*").single();
  if (error) throw error;
  return costCodeFromRow(data as Row);
}

export async function archiveProjectCostCodeInSupabase(costCodeId: string): Promise<ProjectCostCode> {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before archiving cost codes.");
  const companyId = requireActiveCompanyId();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("project_cost_codes")
    .update({ status: "ARCHIVED", archived_at: now, updated_at: now, updated_by_user_id: userId })
    .eq("id", costCodeId)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw error;
  return costCodeFromRow(data as Row);
}

export async function reactivateProjectCostCodeInSupabase(costCodeId: string): Promise<ProjectCostCode> {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before reactivating cost codes.");
  const companyId = requireActiveCompanyId();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("project_cost_codes")
    .update({ status: "ACTIVE", archived_at: null, updated_at: now, updated_by_user_id: userId })
    .eq("id", costCodeId)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw error;
  return costCodeFromRow(data as Row);
}

export interface CostCodeValidationResult {
  valid: boolean;
  issues: string[];
  message?: string;
}

export function validateProjectCostCodeInput(
  input: {
    id?: string;
    projectId: string;
    code: string;
    name: string;
    approvedBudgetAmount?: number;
    forecastAmount?: number;
    status?: ProjectCostCodeStatus;
  },
  existingCodes: readonly ProjectCostCode[],
  projectBudget: number,
): CostCodeValidationResult {
  const issues: string[] = [];
  const normalizedCode = (input.code || "").trim().toUpperCase();
  const normalizedName = (input.name || "").trim();

  if (!normalizedCode) {
    issues.push("Cost code is required.");
  } else if (normalizedCode.length > 50) {
    issues.push("Cost code must be 50 characters or less.");
  }

  if (!normalizedName) {
    issues.push("Cost code name / work package is required.");
  } else if (normalizedName.length > 200) {
    issues.push("Cost code name must be 200 characters or less.");
  }

  // Uniqueness within project
  const duplicate = existingCodes.find(
    (c) => c.projectId === input.projectId && c.id !== input.id && c.code.toUpperCase() === normalizedCode,
  );
  if (duplicate) {
    issues.push(`Cost code "${normalizedCode}" already exists for this project.`);
  }

  const budget = Number(input.approvedBudgetAmount ?? 0);
  if (!Number.isFinite(budget) || budget < 0) {
    issues.push("Approved budget must be a non-negative number.");
  }

  if (input.forecastAmount != null && input.forecastAmount !== undefined) {
    const forecast = Number(input.forecastAmount);
    if (!Number.isFinite(forecast) || forecast < 0) {
      issues.push("Forecast amount must be a non-negative number when set.");
    }
  }

  // Active budget limit check
  const status = input.status || "ACTIVE";
  if (status === "ACTIVE") {
    const otherActiveBudget = existingCodes
      .filter((c) => c.projectId === input.projectId && c.id !== input.id && c.status === "ACTIVE")
      .reduce((sum, c) => sum + (Number(c.approvedBudgetAmount) || 0), 0);
    const totalActive = otherActiveBudget + (Number.isFinite(budget) && budget > 0 ? budget : 0);
    if (projectBudget > 0 && totalActive > projectBudget + 0.01) {
      issues.push(
        `Total allocated active cost code budgets (${totalActive.toFixed(2)}) would exceed the project approved budget (${projectBudget.toFixed(2)}) by ${(totalActive - projectBudget).toFixed(2)}.`,
      );
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    message: issues[0],
  };
}

/**
 * Returns active cost codes for a specific project, plus any cost code currently
 * assigned to the existing record (even if archived) for historical display.
 * Never returns cost codes belonging to other projects.
 */
export function getSelectableCostCodes(
  costCodes: readonly ProjectCostCode[] | undefined,
  projectId: string | undefined | null,
  currentCostCodeId?: string | null,
): ProjectCostCode[] {
  if (!projectId || !costCodes?.length) return [];
  return costCodes.filter(
    (cc) => cc.projectId === projectId && (cc.status === "ACTIVE" || (currentCostCodeId != null && currentCostCodeId !== "" && cc.id === currentCostCodeId)),
  );
}

export function formatCostCodeOptionLabel(costCode: ProjectCostCode): string {
  return `${costCode.code} — ${costCode.name}${costCode.status === "ARCHIVED" ? " (Archived)" : ""}`;
}

