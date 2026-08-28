import {
  canAccessAppTab,
  type PermissionKey,
} from "../utils/accessControl.ts";
import {
  getRouteDefinition,
  ROUTE_DEFINITIONS,
  type AppTab,
  type RouteDefinition,
  type RouteId,
} from "../utils/routes.ts";

export type PrimaryModuleId =
  | "dashboard"
  | "cash"
  | "invoices"
  | "projects"
  | "expenses"
  | "payroll"
  | "reports"
  | "engineering-documents";

export interface NavigationFilter {
  /** Omit for an unauthenticated/browser-only workspace with no filtering. */
  readonly permissions?: Iterable<PermissionKey> | null;
  /** The App-level permission-filtered route list remains authoritative when supplied. */
  readonly visibleRouteIds?: readonly RouteId[];
}

export interface NavigationRoute extends RouteDefinition {
  readonly label: string;
}

export interface NavigationModuleDefinition {
  readonly id: PrimaryModuleId;
  readonly label: string;
  readonly routeIds: readonly RouteId[];
  readonly defaultRouteId: RouteId;
}

export interface NavigationModule extends NavigationModuleDefinition {
  readonly routes: readonly NavigationRoute[];
  readonly defaultRoute: NavigationRoute | undefined;
}

export interface NavigationModel {
  readonly modules: readonly NavigationModule[];
  readonly settingsRoute: NavigationRoute | undefined;
}

const INVOICE_CONTEXTUAL_LABELS: Readonly<Partial<Record<RouteId, string>>> = Object.freeze({
  extract: "Upload",
  inbox: "Gmail",
  review: "Review Queue",
  invoices: "All Invoices",
  vendors: "Vendors",
});

/**
 * Primary modules are intentionally separate from the route vocabulary. This
 * keeps existing app tabs, route IDs, paths, and deep links stable while the
 * header presents a smaller information architecture.
 */
export const NAVIGATION_MODULES: readonly NavigationModuleDefinition[] = Object.freeze([
  { id: "dashboard", label: "Dashboard", routeIds: ["dashboard"], defaultRouteId: "dashboard" },
  { id: "cash", label: "Cash & Banking", routeIds: ["cash"], defaultRouteId: "cash" },
  { id: "invoices", label: "Invoices", routeIds: ["extract", "inbox", "review", "invoices", "vendors"], defaultRouteId: "invoices" },
  { id: "projects", label: "Projects", routeIds: ["projects"], defaultRouteId: "projects" },
  { id: "expenses", label: "Expenses", routeIds: ["expenses"], defaultRouteId: "expenses" },
  { id: "payroll", label: "Payroll", routeIds: ["payroll"], defaultRouteId: "payroll" },
  { id: "reports", label: "Reports", routeIds: ["reports"], defaultRouteId: "reports" },
]);

function contextualLabel(route: RouteDefinition) {
  return INVOICE_CONTEXTUAL_LABELS[route.id] || route.label;
}

function asNavigationRoute(route: RouteDefinition): NavigationRoute {
  return { ...route, label: contextualLabel(route) };
}

function routeIsVisible(route: RouteDefinition, filter: NavigationFilter = {}) {
  if (filter.visibleRouteIds && !filter.visibleRouteIds.includes(route.id)) return false;
  if (filter.permissions === undefined) return true;
  return canAccessAppTab(route.appTab, filter.permissions);
}

function routesForDefinition(definition: NavigationModuleDefinition, filter: NavigationFilter = {}) {
  return definition.routeIds
    .map((routeId) => getRouteDefinition(routeId))
    .filter((route): route is RouteDefinition => Boolean(route) && routeIsVisible(route, filter))
    .map(asNavigationRoute);
}

export function getNavigationModule(moduleId: PrimaryModuleId) {
  return NAVIGATION_MODULES.find((module) => module.id === moduleId);
}

export function getPrimaryModuleForRoute(routeId: RouteId | string | null | undefined) {
  return NAVIGATION_MODULES.find((module) => module.routeIds.includes(routeId as RouteId));
}

export function getPrimaryModuleForAppTab(appTab: AppTab | null | undefined) {
  const route = ROUTE_DEFINITIONS.find((candidate) => candidate.appTab === appTab);
  return getPrimaryModuleForRoute(route?.id);
}

/** Return the visible routes for one module, preserving its contextual order. */
export function getNavigationRoutes(moduleId: PrimaryModuleId, filter: NavigationFilter = {}) {
  const definition = getNavigationModule(moduleId);
  return definition ? routesForDefinition(definition, filter) : [];
}

/**
 * Select a module's preferred child after permission filtering. If its
 * configured default is unavailable, the first visible child is used.
 */
export function getDefaultChildRoute(moduleId: PrimaryModuleId, filter: NavigationFilter = {}) {
  const definition = getNavigationModule(moduleId);
  if (!definition) return undefined;
  const routes = routesForDefinition(definition, filter);
  return routes.find((route) => route.id === definition.defaultRouteId) || routes[0];
}

export function getDefaultChildAppTab(moduleId: PrimaryModuleId, filter: NavigationFilter = {}) {
  return getDefaultChildRoute(moduleId, filter)?.appTab;
}

export function getNavigationModel(filter: NavigationFilter = {}): NavigationModel {
  const modules = NAVIGATION_MODULES
    .map((definition): NavigationModule => {
      const routes = routesForDefinition(definition, filter);
      return {
        ...definition,
        routes,
        defaultRoute: routes.find((route) => route.id === definition.defaultRouteId) || routes[0],
      };
    })
    .filter((module) => module.routes.length > 0);

  const settings = getRouteDefinition("settings");
  return {
    modules,
    settingsRoute: settings && routeIsVisible(settings, filter) ? asNavigationRoute(settings) : undefined,
  };
}

export function getInvoiceContextualLabels() {
  return { ...INVOICE_CONTEXTUAL_LABELS };
}
