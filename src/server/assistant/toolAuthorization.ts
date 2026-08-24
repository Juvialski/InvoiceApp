import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantContext } from "../../assistant/assistantTypes.ts";
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

export async function requireCompanyPermissions(context: ToolAuthorizationContext, permissions: readonly string[]) {
  const unique = [...new Set(permissions.filter(Boolean))];
  for (const permission of unique) {
    if (!(await hasCompanyPermission(context.supabase, context.companyId, permission))) {
      throw new AssistantBackendError("FORBIDDEN", "You do not have permission for that workspace operation.", 403, { permission });
    }
  }
}

const ROUTE_PERMISSIONS: Record<string, string> = {
  dashboard: "dashboard.read",
  projects: "projects.read",
  extract: "invoices.read",
  invoices: "invoices.read",
  payroll: "payroll.summary.read",
  expenses: "expenses.read",
  vendors: "vendors.read",
  reports: "reports.financial.read",
  inbox: "gmail.read",
  review: "invoices.read",
  settings: "company.settings.read",
};

export function routePermission(routeId: unknown) {
  return typeof routeId === "string" ? ROUTE_PERMISSIONS[routeId] || "dashboard.read" : "dashboard.read";
}
