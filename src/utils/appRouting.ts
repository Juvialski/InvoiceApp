import type { AppTab } from "./routes.ts";
import { getRouteForAppTab, normalizeRoutePath, resolveRoute, type RouteId } from "./routes.ts";
import { getAppRouteContract } from "./appRouteContracts.ts";

export type CashSettlementTargetType = "INVOICE" | "PAYROLL" | "EXPENSE" | "CLIENT_COLLECTION";

export interface CashSettlementTargetContext {
  requested: boolean;
  invalid: boolean;
  targetType?: CashSettlementTargetType;
  targetId?: string;
}

export type ProjectWorkspaceView = "overview" | "billing" | "budget" | "procurement" | "documents" | "rfis" | "submittals" | "site-logs" | "materials-equipment" | "invoices" | "payroll" | "expenses" | "people" | "reports";

export type AppLocation =
  | { kind: "tab"; tab: AppTab; routeId: RouteId; pathname: string; search: string }
  | {
      kind: "project"; tab: "projects"; routeId: "projects"; projectId: string; view: ProjectWorkspaceView; pathname: string; search: string;
      documentId?: string; revisionId?: string; rfiId?: string; submittalId?: string; roundId?: string; siteLogId?: string;
    }
  | { kind: "invoice"; tab: "invoices"; routeId: "invoices"; invoiceId: string; returnTo?: string; pathname: string; search: string }
  | { kind: "review-invoice"; tab: "review"; routeId: "review"; invoiceId: string; returnTo?: string; pathname: string; search: string }
  | { kind: "expense"; tab: "expenses"; routeId: "expenses"; expenseId: string; returnTo?: string; pathname: string; search: string }
  | { kind: "unknown"; tab: AppTab; routeId: null; pathname: string; search: string };

const PROJECT_VIEWS = new Set<ProjectWorkspaceView>(["overview", "billing", "budget", "procurement", "documents", "rfis", "submittals", "site-logs", "materials-equipment", "invoices", "payroll", "expenses", "people", "reports"]);

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

function routeContractPath(contractId: string): string {
  const contract = getAppRouteContract(contractId);
  if (!contract) throw new Error(`Unknown application route contract: ${contractId}`);
  return contract.pathPattern;
}

function routeQueryValue(query: URLSearchParams, contractId: string, key: string): string | null {
  const contract = getAppRouteContract(contractId);
  return contract?.queryKeys?.includes(key) ? query.get(key) : null;
}

function setRouteQueryValue(query: URLSearchParams, contractId: string, key: string, value: string | undefined, required = false) {
  const contract = getAppRouteContract(contractId);
  if (!contract?.queryKeys?.includes(key) || value === undefined || (!required && !value.trim())) return;
  query.set(key, required ? value : value.trim());
}

function replacePathParameter(pathPattern: string, key: string, value: string): string {
  return pathPattern.replace(`:${key}`, encodeSegment(value));
}

const PROJECT_VIEW_CONTRACT_IDS: Partial<Record<ProjectWorkspaceView, string>> = Object.freeze({
  billing: "project-billing",
  budget: "project-budget",
  documents: "project-documents",
  rfis: "project-rfis",
  submittals: "project-submittals",
  "site-logs": "project-site-logs",
  "materials-equipment": "project-materials-equipment",
});

export function parseAppLocation(pathname: string, search = ""): AppLocation {
  const [pathnameWithoutQuery, inlineQuery = ""] = pathname.split("?", 2);
  const { normalizedPath, normalizedSearch } = locationParts(pathnameWithoutQuery, search || inlineQuery);
  const resolution = resolveRoute(normalizedPath);
  const query = new URLSearchParams(normalizedSearch);
  const segments = normalizedPath.split("/").filter(Boolean).map(safeDecode);

  if (segments[0] === "projects" && segments[1]) {
    const requestedView = segments[2] || routeQueryValue(query, "project-workspace", "view") || "overview";
    const view = PROJECT_VIEWS.has(requestedView as ProjectWorkspaceView)
      ? requestedView as ProjectWorkspaceView
      : "overview";
    const documentId = routeQueryValue(query, "project-documents", "docId")?.trim() || undefined;
    const revisionId = routeQueryValue(query, "project-documents", "revId")?.trim() || undefined;
    const rfiId = routeQueryValue(query, "rfi-detail", "rfiId")?.trim() || undefined;
    const submittalId = routeQueryValue(query, "submittal-detail", "submittalId")?.trim() || undefined;
    const roundId = routeQueryValue(query, "submittal-detail", "roundId")?.trim() || undefined;
    const siteLogId = routeQueryValue(query, "site-log-detail", "siteLogId")?.trim() || undefined;
    return {
      kind: "project",
      tab: "projects",
      routeId: "projects",
      projectId: segments[1],
      view,
      pathname: normalizedPath,
      search: normalizedSearch,
      ...(documentId ? { documentId } : {}),
      ...(revisionId ? { revisionId } : {}),
      ...(rfiId ? { rfiId } : {}),
      ...(submittalId ? { submittalId } : {}),
      ...(roundId ? { roundId } : {}),
      ...(siteLogId ? { siteLogId } : {}),
    };
  }

  if (segments[0] === "invoices" && segments[1]) {
    return { kind: "invoice", tab: "invoices", routeId: "invoices", invoiceId: segments[1], returnTo: routeQueryValue(query, "invoice-detail", "from") || undefined, pathname: normalizedPath, search: normalizedSearch };
  }

  const expenseId = routeQueryValue(query, "expense-detail", "expenseId")?.trim();
  if (segments[0] === "expenses" && expenseId) {
    return { kind: "expense", tab: "expenses", routeId: "expenses", expenseId, returnTo: routeQueryValue(query, "expense-detail", "from") || undefined, pathname: normalizedPath, search: normalizedSearch };
  }

  const reviewInvoiceId = routeQueryValue(query, "review-invoice", "invoiceId");
  if (segments[0] === "review" && reviewInvoiceId) {
    return { kind: "review-invoice", tab: "review", routeId: "review", invoiceId: reviewInvoiceId, returnTo: routeQueryValue(query, "review-invoice", "from") || undefined, pathname: normalizedPath, search: normalizedSearch };
  }

  if (resolution.appTab && resolution.routeId) {
    return { kind: "tab", tab: resolution.appTab, routeId: resolution.routeId, pathname: normalizedPath, search: normalizedSearch };
  }

  return { kind: "unknown", tab: "dashboard", routeId: null, pathname: normalizedPath, search: normalizedSearch };
}

export function appTabForLocation(location: AppLocation): AppTab {
  return location.tab;
}

export function isKnownWorkspaceLocation(location: AppLocation): location is Exclude<AppLocation, { kind: "unknown" }> {
  return location.kind !== "unknown";
}

export function appPathForTab(tab: AppTab) {
  return getRouteForAppTab(tab)?.path || "/dashboard";
}

export function appPathForProject(
  projectId: string,
  view: ProjectWorkspaceView = "overview",
  options?: { docId?: string; revId?: string; rfiId?: string; submittalId?: string; roundId?: string; siteLogId?: string }
) {
  const suffix = view === "overview" ? "" : `/${view}`;
  const query = new URLSearchParams();
  setRouteQueryValue(query, "project-documents", "docId", options?.docId);
  setRouteQueryValue(query, "project-documents", "revId", options?.revId);
  setRouteQueryValue(query, "rfi-detail", "rfiId", options?.rfiId);
  setRouteQueryValue(query, "submittal-detail", "submittalId", options?.submittalId);
  setRouteQueryValue(query, "submittal-detail", "roundId", options?.roundId);
  setRouteQueryValue(query, "site-log-detail", "siteLogId", options?.siteLogId);
  const queryString = query.toString();
  const projectContractId = view === "overview" ? "project-workspace" : PROJECT_VIEW_CONTRACT_IDS[view];
  const projectPath = projectContractId
    ? replacePathParameter(routeContractPath(projectContractId), "projectId", projectId)
    : replacePathParameter(`/projects/:projectId${suffix}`, "projectId", projectId);
  return `${projectPath}${queryString ? `?${queryString}` : ""}`;
}

export function appPathForInvoice(invoiceId: string, returnTo?: string) {
  const path = replacePathParameter(routeContractPath("invoice-detail"), "invoiceId", invoiceId);
  const query = new URLSearchParams();
  setRouteQueryValue(query, "invoice-detail", "from", returnTo);
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

/** Stable Expense detail deep link. This is intentionally separate from the legacy correction context. */
export function appPathForExpense(expenseId: string, returnTo?: string) {
  const path = routeContractPath("expense-detail");
  const query = new URLSearchParams();
  setRouteQueryValue(query, "expense-detail", "expenseId", expenseId, true);
  setRouteQueryValue(query, "expense-detail", "from", returnTo);
  return `${path}?${query.toString()}`;
}

export function appPathForReviewInvoice(invoiceId: string, returnTo?: string) {
  const query = new URLSearchParams();
  setRouteQueryValue(query, "review-invoice", "invoiceId", invoiceId, true);
  setRouteQueryValue(query, "review-invoice", "from", returnTo);
  return `${routeContractPath("review-invoice")}?${query.toString()}`;
}

/** Stable financial deep link. Cash remains one canonical route; transactionId selects context. */
export function appPathForCashTransaction(transactionId: string, fromTargetType?: string, fromTargetId?: string) {
  const query = new URLSearchParams();
  setRouteQueryValue(query, "cash", "transactionId", transactionId, true);
  setRouteQueryValue(query, "cash", "fromTargetType", fromTargetType);
  setRouteQueryValue(query, "cash", "fromTargetId", fromTargetId);
  return `${routeContractPath("cash")}?${query.toString()}`;
}

/** Cash route entry point for an object-first payment workflow before a transaction is selected. */
export function appPathForCashTarget(targetType: CashSettlementTargetType, targetId: string) {
  const query = new URLSearchParams();
  setRouteQueryValue(query, "cash", "fromTargetType", targetType, true);
  setRouteQueryValue(query, "cash", "fromTargetId", targetId, true);
  return `${routeContractPath("cash")}?${query.toString()}`;
}

/** Stable payroll deep link without inventing a second payroll routing system. */
export function appPathForPayrollRun(payrollRunId: string, returnTo?: string) {
  const query = new URLSearchParams();
  setRouteQueryValue(query, "payroll", "runId", payrollRunId, true);
  setRouteQueryValue(query, "payroll", "from", returnTo);
  return `${routeContractPath("payroll")}?${query.toString()}`;
}

/** Stable payroll deep link that selects the exact period in the existing payroll workspace. */
export function appPathForPayrollPeriod(payrollPeriodId: string, returnTo?: string) {
  const query = new URLSearchParams();
  setRouteQueryValue(query, "payroll", "periodId", payrollPeriodId, true);
  setRouteQueryValue(query, "payroll", "from", returnTo);
  return `${routeContractPath("payroll")}?${query.toString()}`;
}

/** Stable payroll deep link that opens the attendance workspace on one exact date. */
export function appPathForAttendanceDate(attendanceDate: string, returnTo?: string) {
  const query = new URLSearchParams();
  setRouteQueryValue(query, "payroll", "attendanceDate", attendanceDate, true);
  setRouteQueryValue(query, "payroll", "from", returnTo);
  return `${routeContractPath("payroll")}?${query.toString()}`;
}

export function financialTransactionIdFromSearch(search: string) {
  const query = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  return routeQueryValue(query, "cash", "transactionId")?.trim() || undefined;
}

export function cashSettlementTargetContextFromSearch(search: string): CashSettlementTargetContext {
  const query = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const rawType = routeQueryValue(query, "cash", "fromTargetType")?.trim().toUpperCase();
  const targetId = routeQueryValue(query, "cash", "fromTargetId")?.trim() || undefined;
  const requested = Boolean(rawType || targetId);
  const targetType = ["INVOICE", "PAYROLL", "EXPENSE", "CLIENT_COLLECTION"].includes(rawType || "")
    ? rawType as CashSettlementTargetType
    : undefined;
  return { requested, invalid: requested && (!targetType || !targetId), ...(targetType ? { targetType } : {}), ...(targetId ? { targetId } : {}) };
}

export function expenseIdFromSearch(search: string) {
  const query = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  return routeQueryValue(query, "expense-detail", "expenseId")?.trim() || undefined;
}

export function payrollRunIdFromSearch(search: string) {
  const query = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  return routeQueryValue(query, "payroll", "runId")?.trim() || undefined;
}

export function payrollPeriodIdFromSearch(search: string) {
  const query = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  return routeQueryValue(query, "payroll", "periodId")?.trim() || undefined;
}

export function attendanceDateFromSearch(search: string) {
  const query = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const value = routeQueryValue(query, "payroll", "attendanceDate")?.trim();
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export function appPathFromLocation(location: Pick<Location, "pathname" | "search">) {
  return `${normalizeRoutePath(location.pathname)}${location.search || ""}`;
}
