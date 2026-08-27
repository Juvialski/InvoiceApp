import { appPathForInvoice, appPathForProject, appPathForReviewInvoice, appPathForTab, parseAppLocation, type AppLocation, type ProjectWorkspaceView } from "../utils/appRouting.ts";
import type { AppTab } from "../utils/routes.ts";

export type DemoLocation =
  | { kind: "landing" }
  | { kind: "assistant" }
  | { kind: "documents" }
  | { kind: "app"; appLocation: AppLocation };

export const DEMO_ROOT_PATH = "/demo" as const;
export const DEMO_APP_ROOT_PATH = "/demo/app" as const;

export function parseDemoLocation(pathname: string, search = ""): DemoLocation {
  const clean = (pathname || DEMO_ROOT_PATH).split("?", 1)[0].replace(/\/+$/, "") || "/";
  if (clean === DEMO_ROOT_PATH) return { kind: "landing" };
  if (!clean.startsWith(`${DEMO_APP_ROOT_PATH}/`) && clean !== DEMO_APP_ROOT_PATH) return { kind: "landing" };

  const suffix = clean.slice(DEMO_APP_ROOT_PATH.length) || "/dashboard";
  if (suffix === "/assistant") return { kind: "assistant" };
  if (suffix === "/documents") return { kind: "documents" };

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
  return `${DEMO_APP_ROOT_PATH}/assistant`;
}

export function demoDocumentsPath(projectId?: string): string {
  return projectId ? demoPathForProject(projectId, "documents") : `${DEMO_APP_ROOT_PATH}/documents`;
}
