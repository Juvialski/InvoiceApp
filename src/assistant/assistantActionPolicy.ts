import { canAccessAppTab, hasPermission, PERMISSION_KEYS } from "../utils/accessControl.ts";
import { getRouteDefinition, type RouteId } from "../utils/routes.ts";
import { pathForAssistantAction, isAssistantRouteId } from "./assistantNavigation.ts";
import type { AssistantClientAction } from "./assistantTypes.ts";
import type { PermissionKey } from "../utils/accessControl.ts";
import { isRegisteredTourId } from "./tourRegistry.ts";

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function safeToken(value: unknown) {
  return typeof value === "string" && SAFE_TOKEN.test(value.trim()) ? value.trim() : null;
}

function safeLabel(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : undefined;
}

/** Normalize server-provided actions into the small client action vocabulary. */
export function sanitizeAssistantClientAction(value: unknown): AssistantClientAction | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const label = safeLabel(candidate.label);
  const type = candidate.type;

  if (type === "NAVIGATE") {
    return isAssistantRouteId(candidate.routeId) ? { type, routeId: candidate.routeId, ...(label ? { label } : {}) } : null;
  }
  if (type === "OPEN_INVOICE" || type === "OPEN_PROJECT" || type === "OPEN_REVIEW_INVOICE") {
    const entityId = safeToken(candidate.entityId);
    const view = type === "OPEN_PROJECT" && typeof candidate.view === "string" && ["overview", "documents", "rfis", "submittals", "site-logs"].includes(candidate.view) ? candidate.view : undefined;
    return entityId ? { type, entityId, ...(view ? { view } : {}), ...(label ? { label } : {}) } : null;
  }
  if (type === "OPEN_RFI" || type === "OPEN_SUBMITTAL" || type === "OPEN_SITE_LOG") {
    const entityId = safeToken(candidate.entityId);
    const projectId = safeToken(candidate.projectId);
    const roundId = candidate.roundId === undefined ? undefined : safeToken(candidate.roundId);
    if (!entityId || !projectId || (type !== "OPEN_SITE_LOG" && candidate.roundId !== undefined && !roundId)) return null;
    return { type, entityId, projectId, ...(roundId && type !== "OPEN_SITE_LOG" ? { roundId } : {}), ...(label ? { label } : {}) };
  }
  if (type === "OPEN_PAYROLL_PERIOD") {
    const entityId = candidate.entityId === undefined ? undefined : safeToken(candidate.entityId);
    return candidate.entityId !== undefined && !entityId ? null : { type, ...(entityId ? { entityId } : {}), ...(label ? { label } : {}) };
  }
  if (type === "OPEN_ATTENDANCE_DATE") {
    const entityId = candidate.entityId === undefined ? undefined : safeToken(candidate.entityId);
    const date = candidate.date === undefined ? undefined : typeof candidate.date === "string" && SAFE_DATE.test(candidate.date) ? candidate.date : null;
    return (candidate.entityId !== undefined && !entityId) || (candidate.date !== undefined && !date)
      ? null
      : { type, ...(entityId ? { entityId } : {}), ...(date ? { date } : {}), ...(label ? { label } : {}) };
  }
  if (type === "START_TOUR") {
    return isRegisteredTourId(candidate.tourId) ? { type, tourId: candidate.tourId, ...(label ? { label } : {}) } : null;
  }
  return null;
}

export function isAllowlistedAssistantAction(value: unknown): value is AssistantClientAction {
  return Boolean(sanitizeAssistantClientAction(value));
}

export function assistantRouteIdForAction(action: AssistantClientAction): RouteId | null {
  if (action.type === "NAVIGATE") return isAssistantRouteId(action.routeId) ? action.routeId : null;
  if (action.type === "OPEN_INVOICE") return "invoices";
  if (action.type === "OPEN_REVIEW_INVOICE") return "review";
  if (action.type === "OPEN_PROJECT" || action.type === "OPEN_RFI" || action.type === "OPEN_SUBMITTAL" || action.type === "OPEN_SITE_LOG") return "projects";
  if (action.type === "OPEN_PAYROLL_PERIOD" || action.type === "OPEN_ATTENDANCE_DATE") return "payroll";
  return null;
}

/**
 * Navigation is checked against the existing route table and optional
 * permissions. No server-provided URL is ever accepted here.
 */
export function isAssistantActionAllowed(action: unknown, permissions?: Iterable<PermissionKey> | null) {
  const safeAction = sanitizeAssistantClientAction(action);
  if (!safeAction) return false;
  if (safeAction.type === "START_TOUR") return true;
  if (!pathForAssistantAction(safeAction)) return false;
  if (permissions === undefined || permissions === null) return true;
  if (safeAction.type === "OPEN_RFI" && !hasPermission(permissions, PERMISSION_KEYS.engineeringRfisRead)) return false;
  if (safeAction.type === "OPEN_SUBMITTAL" && !hasPermission(permissions, PERMISSION_KEYS.engineeringSubmittalsRead)) return false;
  if (safeAction.type === "OPEN_SITE_LOG" && !hasPermission(permissions, PERMISSION_KEYS.engineeringSiteLogsRead)) return false;
  const routeId = assistantRouteIdForAction(safeAction);
  const route = routeId ? getRouteDefinition(routeId) : undefined;
  return Boolean(route && canAccessAppTab(route.appTab, permissions));
}

export interface AssistantCompanyIdentity {
  companyId: string | null | undefined;
  generation: number;
}

export function isAssistantCompanyIdentityCurrent(started: AssistantCompanyIdentity, current: AssistantCompanyIdentity) {
  const startedCompany = (started.companyId || "").trim();
  const currentCompany = (current.companyId || "").trim();
  return Boolean(startedCompany && currentCompany && startedCompany === currentCompany && started.generation === current.generation);
}

export const isAssistantResultCurrent = isAssistantCompanyIdentityCurrent;
