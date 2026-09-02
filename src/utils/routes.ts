export type AppTab =
  | "dashboard"
  | "cash"
  | "projects"
  | "procurement"
  | "extractor"
  | "inbox"
  | "review"
  | "invoices"
  | "payroll"
  | "expenses"
  | "vendors"
  | "reports"
  | "settings";

export type RouteId =
  | "dashboard"
  | "cash"
  | "projects"
  | "procurement"
  | "extract"
  | "invoices"
  | "payroll"
  | "expenses"
  | "vendors"
  | "reports"
  | "inbox"
  | "review"
  | "settings";

export type NavigationGroup = "primary" | "overflow";

export interface RouteDefinition {
  readonly id: RouteId;
  readonly path: string;
  readonly label: string;
  readonly appTab: AppTab;
  readonly navigationGroup: NavigationGroup;
  readonly aliases?: readonly string[];
}

/**
 * Canonical application routes. `appTab` deliberately keeps the current
 * tab-driven App contract separate from the URL vocabulary used by routing.
 */
export const ROUTE_DEFINITIONS = [
  { id: "dashboard", path: "/dashboard", label: "Dashboard", appTab: "dashboard", navigationGroup: "primary", aliases: ["/"] },
  { id: "cash", path: "/cash", label: "Cash & Banking", appTab: "cash", navigationGroup: "primary" },
  { id: "projects", path: "/projects", label: "Projects", appTab: "projects", navigationGroup: "overflow" },
  { id: "procurement", path: "/procurement", label: "Procurement", appTab: "procurement", navigationGroup: "overflow", aliases: ["/purchase-orders"] },
  { id: "extract", path: "/extract", label: "Extract", appTab: "extractor", navigationGroup: "primary", aliases: ["/extractor"] },
  { id: "invoices", path: "/invoices", label: "Invoices", appTab: "invoices", navigationGroup: "primary" },
  { id: "payroll", path: "/payroll", label: "Payroll", appTab: "payroll", navigationGroup: "overflow" },
  { id: "expenses", path: "/expenses", label: "Expenses", appTab: "expenses", navigationGroup: "overflow" },
  { id: "vendors", path: "/vendors", label: "Vendors", appTab: "vendors", navigationGroup: "overflow" },
  { id: "reports", path: "/reports", label: "Reports", appTab: "reports", navigationGroup: "overflow" },
  { id: "inbox", path: "/email-intake", label: "Email Intake", appTab: "inbox", navigationGroup: "primary", aliases: ["/inbox"] },
  { id: "review", path: "/review", label: "Review Queue", appTab: "review", navigationGroup: "primary" },
  { id: "settings", path: "/settings", label: "Settings", appTab: "settings", navigationGroup: "overflow" },
] as const satisfies readonly RouteDefinition[];

export const DEFAULT_ROUTE_ID: RouteId = "dashboard";
export const DEFAULT_ROUTE_PATH = "/dashboard";

export const PRIMARY_NAVIGATION_ROUTE_IDS = ["dashboard", "cash", "invoices", "inbox", "review", "extract"] as const satisfies readonly RouteId[];
export const OVERFLOW_NAVIGATION_ROUTE_IDS = ["projects", "payroll", "expenses", "vendors", "reports", "settings"] as const satisfies readonly RouteId[];

export interface RouteResolution {
  readonly route: RouteDefinition | undefined;
  readonly routeId: RouteId | null;
  readonly appTab: AppTab | null;
  readonly normalizedPath: string;
  readonly canonicalPath: string | null;
}

export interface ActiveRouteState extends RouteResolution {
  readonly isMoreActive: boolean;
  readonly activeOverflowRouteId: RouteId | null;
}

/** Normalize route input without depending on browser history or location state. */
export function normalizeRoutePath(input: string | null | undefined): string {
  let value = (input || "").trim();

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      // Treat malformed URL-like input as a path below.
    }
  }

  value = value.split(/[?#]/, 1)[0] || "/";
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(/\/+/g, "/");
  if (value.length > 1) value = value.replace(/\/+$/, "");
  return value || "/";
}

export function getRouteDefinition(routeId: RouteId | string): RouteDefinition | undefined {
  return ROUTE_DEFINITIONS.find((route) => route.id === routeId);
}

export function getRouteForAppTab(appTab: AppTab): RouteDefinition | undefined {
  return ROUTE_DEFINITIONS.find((route) => route.appTab === appTab);
}

function routeMatchesPath(route: RouteDefinition, normalizedPath: string) {
  const candidates = [route.path, ...(route.aliases || [])].map(normalizeRoutePath);
  return candidates.some((candidate) => candidate === "/"
    ? normalizedPath === "/"
    : normalizedPath === candidate || normalizedPath.startsWith(`${candidate}/`));
}

export function resolveRoute(pathname: string | null | undefined): RouteResolution {
  const normalizedPath = normalizeRoutePath(pathname);
  const route = ROUTE_DEFINITIONS.find((candidate) => routeMatchesPath(candidate, normalizedPath));
  return {
    route,
    routeId: route?.id || null,
    appTab: route?.appTab || null,
    normalizedPath,
    canonicalPath: route?.path || null,
  };
}

export function resolveActiveRoute(pathname: string | null | undefined): ActiveRouteState {
  return withMoreState(resolveRoute(pathname));
}

export function resolveActiveRouteForAppTab(appTab: AppTab): ActiveRouteState {
  const route = getRouteForAppTab(appTab);
  return withMoreState({
    route,
    routeId: route?.id || null,
    appTab: route?.appTab || null,
    normalizedPath: route?.path || DEFAULT_ROUTE_PATH,
    canonicalPath: route?.path || null,
  });
}

function withMoreState(resolution: RouteResolution): ActiveRouteState {
  const isMoreActive = resolution.route?.navigationGroup === "overflow";
  return {
    ...resolution,
    isMoreActive,
    activeOverflowRouteId: isMoreActive ? resolution.routeId : null,
  };
}

/** Return the canonical URL to use when the app is opened at its root. */
export function getRootRedirect(pathname: string | null | undefined): string | undefined {
  return normalizeRoutePath(pathname) === "/" ? DEFAULT_ROUTE_PATH : undefined;
}

export function getCanonicalRoutePath(pathname: string | null | undefined): string {
  const resolution = resolveRoute(pathname);
  return resolution.canonicalPath || resolution.normalizedPath;
}
