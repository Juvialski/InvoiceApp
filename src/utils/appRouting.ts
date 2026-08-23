import type { AppTab } from "./routes.ts";
import { getRouteForAppTab, normalizeRoutePath, resolveRoute, type RouteId } from "./routes.ts";

export type ProjectWorkspaceView = "overview" | "invoices" | "payroll" | "expenses" | "people" | "reports";

export type AppLocation =
  | { kind: "tab"; tab: AppTab; routeId: RouteId; pathname: string; search: string }
  | { kind: "project"; tab: "projects"; routeId: "projects"; projectId: string; view: ProjectWorkspaceView; pathname: string; search: string }
  | { kind: "invoice"; tab: "invoices"; routeId: "invoices"; invoiceId: string; returnTo?: string; pathname: string; search: string }
  | { kind: "review-invoice"; tab: "review"; routeId: "review"; invoiceId: string; returnTo?: string; pathname: string; search: string }
  | { kind: "unknown"; tab: AppTab; routeId: null; pathname: string; search: string };

const PROJECT_VIEWS = new Set<ProjectWorkspaceView>(["overview", "invoices", "payroll", "expenses", "people", "reports"]);

function safeDecode(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function encodeSegment(value: string) {
  return encodeURIComponent(value);
}

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

  if (segments[0] === "projects" && segments[1]) {
    const requestedView = segments[2] || query.get("view") || "overview";
    const view = PROJECT_VIEWS.has(requestedView as ProjectWorkspaceView)
      ? requestedView as ProjectWorkspaceView
      : "overview";
    return { kind: "project", tab: "projects", routeId: "projects", projectId: segments[1], view, pathname: normalizedPath, search: normalizedSearch };
  }

  if (segments[0] === "invoices" && segments[1]) {
    return { kind: "invoice", tab: "invoices", routeId: "invoices", invoiceId: segments[1], returnTo: from, pathname: normalizedPath, search: normalizedSearch };
  }

  if (segments[0] === "review" && query.get("invoiceId")) {
    return { kind: "review-invoice", tab: "review", routeId: "review", invoiceId: query.get("invoiceId") || "", returnTo: from, pathname: normalizedPath, search: normalizedSearch };
  }

  if (resolution.appTab && resolution.routeId) {
    return { kind: "tab", tab: resolution.appTab, routeId: resolution.routeId, pathname: normalizedPath, search: normalizedSearch };
  }

  return { kind: "unknown", tab: "dashboard", routeId: null, pathname: normalizedPath, search: normalizedSearch };
}

export function appPathForTab(tab: AppTab) {
  return getRouteForAppTab(tab)?.path || "/dashboard";
}

export function appPathForProject(projectId: string, view: ProjectWorkspaceView = "overview") {
  const suffix = view === "overview" ? "" : `/${view}`;
  return `/projects/${encodeSegment(projectId)}${suffix}`;
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

export function appPathFromLocation(location: Pick<Location, "pathname" | "search">) {
  return `${normalizeRoutePath(location.pathname)}${location.search || ""}`;
}
