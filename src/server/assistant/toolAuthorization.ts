import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantContext } from "../../assistant/assistantTypes.ts";
import { permissionOptionsForAppTab } from "../../utils/accessControl.ts";
import { getRouteDefinition } from "../../utils/routes.ts";
import { AssistantBackendError } from "./assistantBackendTypes.ts";

export interface ToolAuthorizationContext {
  supabase: SupabaseClient;
  companyId: string;
  userId: string;
  context: AssistantContext;
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
  const unique = [...new Set(permissions.filter(Boolean))];
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
