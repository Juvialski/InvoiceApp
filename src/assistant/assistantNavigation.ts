import { appPathForAttendanceDate, appPathForCashTransaction, appPathForInvoice, appPathForPayrollPeriod, appPathForPayrollRun, appPathForProject, appPathForReviewInvoice, appPathForTab } from "../utils/appRouting.ts";
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

const PROJECT_WORKSPACE_VIEWS = new Set(["overview", "documents", "rfis", "submittals", "site-logs", "invoices", "payroll", "expenses", "people", "reports"]);

export function isAssistantRouteId(value: unknown): value is RouteId {
  return typeof value === "string" && (ASSISTANT_NAVIGATION_ROUTE_IDS as readonly RouteId[]).includes(value as RouteId) && Boolean(getRouteDefinition(value));
}

export function pathForAssistantAction(action: AssistantClientAction): string | null {
  if (action.type === "OPEN_INVOICE" && action.entityId) return appPathForInvoice(action.entityId);
  if (action.type === "OPEN_REVIEW_INVOICE" && action.entityId) return appPathForReviewInvoice(action.entityId);
  if (action.type === "OPEN_FINANCIAL_TRANSACTION" && action.entityId) return appPathForCashTransaction(action.entityId);
  if (action.type === "OPEN_PAYROLL_RUN" && action.entityId) return appPathForPayrollRun(action.entityId);
  if (action.type === "OPEN_PROJECT_DOCUMENTS" && action.entityId) return appPathForProject(action.entityId, "documents");
  if (action.type === "OPEN_ENGINEERING_DOCUMENT" && action.entityId && action.projectId) return appPathForProject(action.projectId, "documents", { docId: action.entityId, revId: action.revisionId });
  if (action.type === "OPEN_RFI" && action.entityId && action.projectId) return appPathForProject(action.projectId, "rfis", { rfiId: action.entityId });
  if (action.type === "OPEN_SUBMITTAL" && action.entityId && action.projectId) return appPathForProject(action.projectId, "submittals", { submittalId: action.entityId, roundId: action.roundId });
  if (action.type === "OPEN_SITE_LOG" && action.entityId && action.projectId) return appPathForProject(action.projectId, "site-logs", { siteLogId: action.entityId });
  if (action.type === "OPEN_PROJECT" && action.entityId) {
    if (typeof action.view === "string" && PROJECT_WORKSPACE_VIEWS.has(action.view)) return appPathForProject(action.entityId, action.view as Parameters<typeof appPathForProject>[1]);
    return appPathForProject(action.entityId);
  }
  if (action.type === "OPEN_PAYROLL_PERIOD") return action.entityId ? appPathForPayrollPeriod(action.entityId) : appPathForTab("payroll");
  if (action.type === "OPEN_ATTENDANCE_DATE") return action.date ? appPathForAttendanceDate(action.date) : appPathForTab("payroll");
  if (action.type === "NAVIGATE" && action.routeId && isAssistantRouteId(action.routeId)) {
    const route = getRouteDefinition(action.routeId);
    return route ? route.path : null;
  }
  return null;
}
