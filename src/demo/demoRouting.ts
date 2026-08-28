import { appPathForInvoice, appPathForProject, appPathForReviewInvoice, appPathForTab, parseAppLocation, type AppLocation, type ProjectWorkspaceView } from "../utils/appRouting.ts";
import type { AppTab } from "../utils/routes.ts";

export type DemoLocation =
  | { kind: "landing" }
  | { kind: "assistant" }
  | { kind: "documents" }
  | { kind: "app"; appLocation: AppLocation };

export const DEMO_ROOT_PATH = "/demo" as const;
export const DEMO_APP_ROOT_PATH = "/demo/app" as const;

export interface DemoRouteContract {
  readonly id: string;
  readonly canonicalPath: string;
  readonly pathPattern: string;
  readonly scope: "demo";
}

export const DEMO_ROUTE_CONTRACTS: readonly DemoRouteContract[] = Object.freeze([
  { id: "demo-landing", canonicalPath: DEMO_ROOT_PATH, pathPattern: DEMO_ROOT_PATH, scope: "demo" },
  { id: "demo-assistant", canonicalPath: `${DEMO_APP_ROOT_PATH}/assistant`, pathPattern: `${DEMO_APP_ROOT_PATH}/assistant`, scope: "demo" },
  { id: "demo-documents", canonicalPath: `${DEMO_APP_ROOT_PATH}/documents`, pathPattern: `${DEMO_APP_ROOT_PATH}/documents`, scope: "demo" },
]);

function demoRoutePath(id: string): string {
  const contract = DEMO_ROUTE_CONTRACTS.find((candidate) => candidate.id === id);
  if (!contract) throw new Error(`Unknown demo route contract: ${id}`);
  return contract.pathPattern;
}

export function parseDemoLocation(pathname: string, search = ""): DemoLocation {
  const clean = (pathname || DEMO_ROOT_PATH).split("?", 1)[0].replace(/\/+$/, "") || "/";
  if (clean === demoRoutePath("demo-landing")) return { kind: "landing" };
  if (!clean.startsWith(`${DEMO_APP_ROOT_PATH}/`) && clean !== DEMO_APP_ROOT_PATH) return { kind: "landing" };

  const suffix = clean.slice(DEMO_APP_ROOT_PATH.length) || "/dashboard";
  if (clean === demoRoutePath("demo-assistant")) return { kind: "assistant" };
  if (clean === demoRoutePath("demo-documents")) return { kind: "documents" };

  return { kind: "app", appLocation: parseAppLocation(suffix, search) };
}

export function demoPathForAppPath(appPath: string): string {
  const [pathname, query = ""] = appPath.split("?", 2);
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${DEMO_APP_ROOT_PATH}${normalized}${query ? `?${query}` : ""}`;
}

export function demoPathForTab(tab: AppTab): string {
  return demoPathForAppPath(appPathForTab(tab));
}

export function demoPathForProject(projectId: string, view: ProjectWorkspaceView = "overview", options?: Parameters<typeof appPathForProject>[2]): string {
  return demoPathForAppPath(appPathForProject(projectId, view, options));
}

export function demoPathForInvoice(invoiceId: string, returnTo?: string): string {
  return demoPathForAppPath(appPathForInvoice(invoiceId, returnTo));
}

export function demoPathForReviewInvoice(invoiceId: string, returnTo?: string): string {
  return demoPathForAppPath(appPathForReviewInvoice(invoiceId, returnTo));
}

export function demoAssistantPath(): string {
  return demoRoutePath("demo-assistant");
}

export function demoDocumentsPath(projectId?: string): string {
  return projectId ? demoPathForProject(projectId, "documents") : demoRoutePath("demo-documents");
}
