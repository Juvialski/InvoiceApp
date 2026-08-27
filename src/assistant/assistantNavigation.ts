import { appPathForInvoice, appPathForProject, appPathForReviewInvoice, appPathForTab } from "../utils/appRouting.ts";
import { getRouteDefinition, type RouteId } from "../utils/routes.ts";
import type { AssistantClientAction } from "./assistantTypes.ts";

export const ASSISTANT_NAVIGATION_ROUTE_IDS = [
  "dashboard",
  "cash",
  "projects",
  "extract",
  "invoices",
  "payroll",
  "expenses",
  "vendors",
  "reports",
  "inbox",
  "review",
  "settings",
] as const satisfies readonly RouteId[];

export function isAssistantRouteId(value: unknown): value is RouteId {
  return typeof value === "string" && (ASSISTANT_NAVIGATION_ROUTE_IDS as readonly RouteId[]).includes(value as RouteId) && Boolean(getRouteDefinition(value));
}

export function pathForAssistantAction(action: AssistantClientAction): string | null {
  if (action.type === "OPEN_INVOICE" && action.entityId) return appPathForInvoice(action.entityId);
  if (action.type === "OPEN_REVIEW_INVOICE" && action.entityId) return appPathForReviewInvoice(action.entityId);
  if (action.type === "OPEN_PROJECT_DOCUMENTS" && action.entityId) return appPathForProject(action.entityId, "documents");
  if (action.type === "OPEN_RFI" && action.entityId && action.projectId) return appPathForProject(action.projectId, "rfis", { rfiId: action.entityId });
  if (action.type === "OPEN_SUBMITTAL" && action.entityId && action.projectId) return appPathForProject(action.projectId, "submittals", { submittalId: action.entityId, roundId: action.roundId });
  if (action.type === "OPEN_SITE_LOG" && action.entityId && action.projectId) return appPathForProject(action.projectId, "site-logs", { siteLogId: action.entityId });
  if (action.type === "OPEN_PROJECT" && action.entityId) {
    if (action.view === "documents") return appPathForProject(action.entityId, "documents");
    if (action.view === "rfis") return appPathForProject(action.entityId, "rfis");
    if (action.view === "submittals") return appPathForProject(action.entityId, "submittals");
    if (action.view === "site-logs") return appPathForProject(action.entityId, "site-logs");
    return appPathForProject(action.entityId);
  }
  if (action.type === "OPEN_PAYROLL_PERIOD") return appPathForTab("payroll");
  if (action.type === "OPEN_ATTENDANCE_DATE") return appPathForTab("payroll");
  if (action.type === "NAVIGATE" && action.routeId && isAssistantRouteId(action.routeId)) {
    const route = getRouteDefinition(action.routeId);
    return route ? route.path : null;
  }
  return null;
}
