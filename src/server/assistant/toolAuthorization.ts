import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantContext } from "../../assistant/assistantTypes.ts";
import { PERMISSION_KEYS, permissionOptionsForAppTab } from "../../utils/accessControl.ts";
import { getRouteDefinition } from "../../utils/routes.ts";
import { AssistantBackendError } from "./assistantBackendTypes.ts";

export interface ToolAuthorizationContext {
  supabase: SupabaseClient;
  companyId: string;
  userId: string;
  context: AssistantContext;
}

const PROJECT_COST_ASSISTANT_BASE_REQUIREMENTS = Object.freeze([
  PERMISSION_KEYS.projectsRead,
  PERMISSION_KEYS.reportsRead,
] as const);

/**
 * `get_project_cost_summary` currently reads invoice, expense, and payroll
 * allocation tables directly. Until a cost-only labor aggregate RPC exists,
 * fail closed unless the caller can read every contributing source domain.
 * This prevents RLS-filtered empty arrays from being reported as real zeroes
 * without granting Finance/Viewer individual payroll-detail access.
 */
function integrityRequirements(permissions: readonly string[]): string[] {
  const unique = [...new Set(permissions.filter(Boolean))];
  const isProjectCostSummary = unique.length === PROJECT_COST_ASSISTANT_BASE_REQUIREMENTS.length
    && PROJECT_COST_ASSISTANT_BASE_REQUIREMENTS.every((permission) => unique.includes(permission));
  if (!isProjectCostSummary) return unique;
  return [...new Set([
    ...unique,
    PERMISSION_KEYS.invoicesRead,
    PERMISSION_KEYS.expensesRead,
    PERMISSION_KEYS.payrollSensitiveRead,
  ])];
}

export async function hasCompanyPermission(supabase: SupabaseClient, companyId: string, permission: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_company_permission", {
    p_company_id: companyId,
    p_permission_key: permission,
  });
  if (error) throw new AssistantBackendError("AUTHORIZATION_UNAVAILABLE", "Company authorization is temporarily unavailable.", 503);
  return data === true;
}

async function hasPermissionRequirement(context: ToolAuthorizationContext, requirement: string): Promise<boolean> {
  const options = [...new Set(requirement.split("|").map((value) => value.trim()).filter(Boolean))];
  if (!options.length) return false;
  for (const permission of options) {
    if (await hasCompanyPermission(context.supabase, context.companyId, permission)) return true;
  }
  return false;
}

/**
 * Each array item is an all-of requirement. Within one item, `a|b` means any
 * one of the listed permissions may authorize that requirement. This keeps
 * route alternatives aligned without weakening multi-permission tool checks.
 */
export async function requireCompanyPermissions(context: ToolAuthorizationContext, permissions: readonly string[]) {
  const unique = integrityRequirements(permissions);
  for (const requirement of unique) {
    if (!(await hasPermissionRequirement(context, requirement))) {
      throw new AssistantBackendError("FORBIDDEN", "You do not have permission for that workspace operation.", 403, { permission: requirement });
    }
  }
}

export function routePermission(routeId: unknown): string {
  if (typeof routeId !== "string" || !routeId.trim()) {
    throw new AssistantBackendError("FORBIDDEN", "That app destination is not authorized.", 403);
  }
  const route = getRouteDefinition(routeId);
  if (!route) {
    throw new AssistantBackendError("FORBIDDEN", "That app destination is not authorized.", 403, { routeId });
  }
  const options = permissionOptionsForAppTab(route.appTab);
  if (!options.length) {
    throw new AssistantBackendError("FORBIDDEN", "That app destination has no authorization contract.", 403, { routeId });
  }
  return options.join("|");
}
