import { ROUTE_DEFINITIONS, type RouteId } from "./routes.ts";

export type AppRouteScope = "production" | "demo" | "production-and-demo";

export interface AppRouteContract {
  readonly id: string;
  readonly routeId?: RouteId;
  readonly canonicalPath: string;
  readonly pathPattern: string;
  readonly queryKeys?: readonly string[];
  readonly scope?: AppRouteScope;
}

const BASE_ROUTE_QUERY_KEYS: Partial<Record<RouteId, readonly string[]>> = {
  cash: ["transactionId", "fromTargetType", "fromTargetId"],
  payroll: ["runId", "periodId", "attendanceDate", "from"],
};

const BASE_ROUTE_CONTRACTS: readonly AppRouteContract[] = ROUTE_DEFINITIONS.map((route) => ({
  id: route.id,
  routeId: route.id,
  canonicalPath: route.path,
  pathPattern: route.path,
  queryKeys: BASE_ROUTE_QUERY_KEYS[route.id],
}));

/**
 * Pure route/deep-link metadata shared by application routing and WM-3.
 * Route definitions remain the source for base paths; these entries describe
 * the selected project/entity query contracts that the parser and builders
 * intentionally support.
 */
export const APP_ROUTE_CONTRACTS: readonly AppRouteContract[] = Object.freeze([
  ...BASE_ROUTE_CONTRACTS,
  {
    id: "project-workspace",
    routeId: "projects",
    canonicalPath: "/projects/:projectId",
    pathPattern: "/projects/:projectId",
    queryKeys: ["view"],
    scope: "production-and-demo",
  },
  {
    id: "project-documents",
    routeId: "projects",
    canonicalPath: "/projects/:projectId/documents",
    pathPattern: "/projects/:projectId/documents",
    queryKeys: ["docId", "revId"],
    scope: "production-and-demo",
  },
  {
    id: "project-rfis",
    routeId: "projects",
    canonicalPath: "/projects/:projectId/rfis",
    pathPattern: "/projects/:projectId/rfis",
    queryKeys: ["rfiId"],
    scope: "production-and-demo",
  },
  {
    id: "rfi-detail",
    routeId: "projects",
    canonicalPath: "/projects/:projectId/rfis?rfiId=:rfiId",
    pathPattern: "/projects/:projectId/rfis",
    queryKeys: ["rfiId"],
    scope: "production-and-demo",
  },
  {
    id: "project-submittals",
    routeId: "projects",
    canonicalPath: "/projects/:projectId/submittals",
    pathPattern: "/projects/:projectId/submittals",
    queryKeys: ["submittalId", "roundId"],
    scope: "production-and-demo",
  },
  {
    id: "submittal-detail",
    routeId: "projects",
    canonicalPath: "/projects/:projectId/submittals?submittalId=:submittalId&roundId=:roundId",
    pathPattern: "/projects/:projectId/submittals",
    queryKeys: ["submittalId", "roundId"],
    scope: "production-and-demo",
  },
  {
    id: "project-site-logs",
    routeId: "projects",
    canonicalPath: "/projects/:projectId/site-logs",
    pathPattern: "/projects/:projectId/site-logs",
    queryKeys: ["siteLogId"],
    scope: "production-and-demo",
  },
  {
    id: "site-log-detail",
    routeId: "projects",
    canonicalPath: "/projects/:projectId/site-logs?siteLogId=:siteLogId",
    pathPattern: "/projects/:projectId/site-logs",
    queryKeys: ["siteLogId"],
    scope: "production-and-demo",
  },
  {
    id: "invoice-detail",
    routeId: "invoices",
    canonicalPath: "/invoices/:invoiceId",
    pathPattern: "/invoices/:invoiceId",
    queryKeys: ["from"],
    scope: "production-and-demo",
  },
  {
    id: "review-invoice",
    routeId: "review",
    canonicalPath: "/review?invoiceId=:invoiceId",
    pathPattern: "/review",
    queryKeys: ["invoiceId", "from"],
    scope: "production-and-demo",
  },
  {
    id: "payroll-run",
    routeId: "payroll",
    canonicalPath: "/payroll?runId=:runId",
    pathPattern: "/payroll",
    queryKeys: ["runId", "periodId", "attendanceDate", "from"],
    scope: "production-and-demo",
  },
]);

export function getAppRouteContract(id: string): AppRouteContract | undefined {
  return APP_ROUTE_CONTRACTS.find((contract) => contract.id === id);
}
