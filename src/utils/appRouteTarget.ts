import type { AppLocation } from "./appRouting.ts";
import type { AppTab } from "./routes.ts";

/**
 * The route is the canonical navigation state. A separate active-tab state can
 * lag one render behind a history update and briefly dispatch the previous
 * page (or no page) while the content area catches up.
 */
export type AppRouteTarget = "invoice-workspace" | "unknown" | AppTab;

export function appRouteTargetForLocation(location: AppLocation): AppRouteTarget {
  if (location.kind === "invoice" || location.kind === "review-invoice") return "invoice-workspace";
  if (location.kind === "project") return "projects";
  if (location.kind === "tab") return location.tab;
  return "unknown";
}
