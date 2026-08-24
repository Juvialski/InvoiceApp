import type { PrimaryModuleId } from "./navigationModel.ts";
import type { RouteId } from "../utils/routes.ts";

export function navigationRouteTourTarget(routeId: RouteId) {
  return `route:${routeId}`;
}

export function navigationModuleTourTarget(moduleId: PrimaryModuleId) {
  return moduleId === "invoices" ? "module:invoices" : undefined;
}
