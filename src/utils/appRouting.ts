import type { AppTab } from "./routes.ts";
import { getRouteForAppTab, normalizeRoutePath, resolveRoute, type RouteId } from "./routes.ts";
import { companyManagementTabFromQuery, type CompanyManagementTab } from "./companyManagement.ts";

export type ProjectWorkspaceView = "overview" | "documents" | "rfis" | "submittals" | "daily-logs" | "invoices" | "payroll" | "expenses" | "people" | "reports";

export const PLATFORM_COMPANIES_PATH = "/platform/companies" as const;

export type AppLocation =
  | { kind: "platform-companies"; pathname: string; search: string; managementCompanyId?: string; managementTab?: CompanyManagementTab }
  | { kind: "tab"; tab: AppTab; routeId: RouteId; pathname: string; search: string }
  | {
      kind: "project"; tab: "projects"; routeId: "projects"; projectId: string; view: ProjectWorkspaceView; pathname: string; search: string;
      documentId?: string; revisionId?: string; rfiId?: string; submittalId?: string; roundId?: string; dailyLogId?: string;
    }
  | { kind: "invoice"; tab: "invoices"; routeId: "invoices"; invoiceId: string; returnTo?: string; pathname: string; search: string }
  | { kind: "review-invoice"; tab: "review"; routeId: "review"; invoiceId: string; returnTo?: string; pathname: string; search: string }
  | { kind: "unknown"; tab: AppTab; routeId: null; pathname: string; search: string };

const PROJECT_VIEWS = new Set<ProjectWorkspaceView>(["overview", "documents", "rfis", "submittals", "daily-logs", "invoices", "payroll", "expenses", "people", "reports"]);

function safeDecode(value: string) { try { return decodeURIComponent(value); } catch { return value; } }
function encodeSegment(value: string) { return encodeURIComponent(value); }
function locationParts(pathname: string, search = "") {
  const normalizedPath = normalizeRoutePath(pathname);
  const normalizedSearch = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  return { normalizedPath, normalizedSearch };
}

export function parseAppLocation(pathname: string, search = ""): AppLocation {
  const [pathnameWithoutQuery, inlineQuery = ""] = pathname.split("?", 2);
  const { normalizedPath, normalizedSearch } = locationParts(pathnameWithoutQuery, search || inlineQuery);
  const resolution = resolveRoute(normalizedPath);
  const query = new URLSearchParams(normalizedSearch);
  const segments = normalizedPath.split("/").filter(Boolean).map(safeDecode);
  const from = query.get("from") || undefined;

  if (normalizedPath === PLATFORM_COMPANIES_PATH) {
    const managementCompanyId = query.get("companyId")?.trim() || undefined;
    const managementTab = companyManagementTabFromQuery(query.get("tab"));
    return { kind: "platform-companies", pathname: normalizedPath, search: normalizedSearch, ...(managementCompanyId ? { managementCompanyId } : {}), ...(managementTab !== "general" ? { managementTab } : {}) };
  }
  if (segments[0] === "projects" && segments[1]) {
    const requestedView = segments[2] || query.get("view") || "overview";
    const view = PROJECT_VIEWS.has(requestedView as ProjectWorkspaceView) ? requestedView as ProjectWorkspaceView : "overview";
    const documentId = query.get("docId")?.trim() || undefined;
    const revisionId = query.get("revId")?.trim() || undefined;
    const rfiId = query.get("rfiId")?.trim() || undefined;
    const submittalId = query.get("submittalId")?.trim() || undefined;
    const roundId = query.get("roundId")?.trim() || undefined;
    const dailyLogId = query.get("logId")?.trim() || undefined;
    return {
      kind: "project", tab: "projects", routeId: "projects", projectId: segments[1], view, pathname: normalizedPath, search: normalizedSearch,
      ...(documentId ? { documentId } : {}), ...(revisionId ? { revisionId } : {}), ...(rfiId ? { rfiId } : {}), ...(submittalId ? { submittalId } : {}), ...(roundId ? { roundId } : {}), ...(dailyLogId ? { dailyLogId } : {}),
    };
  }
  if (segments[0] === "invoices" && segments[1]) return { kind: "invoice", tab: "invoices", routeId: "invoices", invoiceId: segments[1], returnTo: from, pathname: normalizedPath, search: normalizedSearch };
  if (segments[0] === "review" && query.get("invoiceId")) return { kind: "review-invoice", tab: "review", routeId: "review", invoiceId: query.get("invoiceId") || "", returnTo: from, pathname: normalizedPath, search: normalizedSearch };
  if (resolution.appTab && resolution.routeId) return { kind: "tab", tab: resolution.appTab, routeId: resolution.routeId, pathname: normalizedPath, search: normalizedSearch };
  return { kind: "unknown", tab: "dashboard", routeId: null, pathname: normalizedPath, search: normalizedSearch };
}

export function appTabForLocation(location: AppLocation): AppTab { return location.kind === "platform-companies" ? "dashboard" : location.tab; }
export function isKnownWorkspaceLocation(location: AppLocation): location is Exclude<AppLocation, { kind: "platform-companies" | "unknown" }> { return location.kind !== "platform-companies" && location.kind !== "unknown"; }
export function appPathForTab(tab: AppTab) { return getRouteForAppTab(tab)?.path || "/dashboard"; }

export function appPathForPlatformCompanies(companyId?: string | null, tab?: CompanyManagementTab) {
  const query = new URLSearchParams();
  if (companyId?.trim()) query.set("companyId", companyId.trim());
  if (tab && tab !== "general") query.set("tab", tab);
  const suffix = query.toString();
  return `${PLATFORM_COMPANIES_PATH}${suffix ? `?${suffix}` : ""}`;
}

export function appPathForProject(
  projectId: string,
  view: ProjectWorkspaceView = "overview",
  options?: { docId?: string; revId?: string; rfiId?: string; submittalId?: string; roundId?: string; logId?: string }
) {
  const suffix = view === "overview" ? "" : `/${view}`;
  const query = new URLSearchParams();
  if (options?.docId?.trim()) query.set("docId", options.docId.trim());
  if (options?.revId?.trim()) query.set("revId", options.revId.trim());
  if (options?.rfiId?.trim()) query.set("rfiId", options.rfiId.trim());
  if (options?.submittalId?.trim()) query.set("submittalId", options.submittalId.trim());
  if (options?.roundId?.trim()) query.set("roundId", options.roundId.trim());
  if (options?.logId?.trim()) query.set("logId", options.logId.trim());
  const queryString = query.toString();
  return `/projects/${encodeSegment(projectId)}${suffix}${queryString ? `?${queryString}` : ""}`;
}

export function appPathForInvoice(invoiceId: string, returnTo?: string) {
  const path = `/invoices/${encodeSegment(invoiceId)}`;
  return returnTo ? `${path}?from=${encodeURIComponent(returnTo)}` : path;
}
export function appPathForReviewInvoice(invoiceId: string, returnTo?: string) {
  const query = new URLSearchParams({ invoiceId });
  if (returnTo) query.set("from", returnTo);
  return `/review?${query.toString()}`;
}
export function appPathFromLocation(location: Pick<Location, "pathname" | "search">) { return `${normalizeRoutePath(location.pathname)}${location.search || ""}`; }
