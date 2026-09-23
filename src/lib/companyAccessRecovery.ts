import type { Session } from "@supabase/supabase-js";
import type { CompanyAccessSnapshot } from "./companyAccess.ts";
import {
  isSessionAuthenticationFailure,
  isTerminalSessionRefreshFailure,
} from "./authenticatedRequestRecovery.ts";
import { isCurrentCompanyAccessRequest, shouldPreserveCompanyAccessDuringRefresh } from "./companyAccessRefresh.ts";
import { resolveDeploymentCompanyAccess } from "./deploymentCompany.ts";
import { safeErrorMessage } from "../utils/errorNormalization.ts";

export interface CompanyAccessRefreshState {
  access: CompanyAccessSnapshot;
  isSwitching: boolean;
  isRefreshing: boolean;
  refreshError: string | null;
  sessionExpired: boolean;
}

export type DeploymentAccessRevalidationResult =
  | { kind: "resolved"; access: CompanyAccessSnapshot; deploymentCompanyId: string; refreshedSession?: Session }
  | { kind: "transient-failure"; error: unknown }
  | { kind: "session-expired"; error?: unknown }
  | { kind: "identity-changed"; userId: string }
  | { kind: "deployment-mismatch"; deploymentCompanyId: string };

export interface DeploymentAccessRevalidationOptions {
  userId: string;
  knownDeploymentCompanyId?: string | null;
  loadAccess: () => Promise<CompanyAccessSnapshot>;
  loadDeploymentCompanyId: () => Promise<string>;
  refreshAccessToken: () => Promise<string | null>;
  getSession: () => Promise<{ session: Session | null; error?: unknown }>;
  resolveAccess?: (snapshot: CompanyAccessSnapshot, deploymentCompanyId: string) => CompanyAccessSnapshot;
}

export interface CompanyAccessRefreshOptions extends DeploymentAccessRevalidationOptions {
  userEmail?: string;
  requestGeneration: number;
  currentGeneration: () => number;
  currentUserId: () => string | null | undefined;
}

export interface IdleSessionRecoveryOptions {
  documentTarget: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
  windowTarget?: Pick<Window, "addEventListener" | "removeEventListener">;
  recover: () => void | Promise<void>;
  now?: () => number;
  minimumHiddenMs?: number;
  throttleMs?: number;
}

export type IdleSessionRecoveryResult =
  | { kind: "recovered"; session: Session }
  | { kind: "transient-failure"; error: unknown }
  | { kind: "session-expired"; error?: unknown }
  | { kind: "identity-changed"; userId: string; session?: Session }
  | { kind: "signed-out" };

export async function recoverSessionBeforeAccessRefresh(options: {
  userId: string;
  currentUserId: () => string | null | undefined;
  getSession: () => Promise<{ session: Session | null; error?: unknown }>;
  onSameUserSession: (session: Session) => void;
  refreshAccess: () => Promise<void>;
}): Promise<IdleSessionRecoveryResult> {
  let result: { session: Session | null; error?: unknown };
  try {
    result = await options.getSession();
  } catch (error) {
    const currentUserId = options.currentUserId();
    if (currentUserId && currentUserId !== options.userId) return { kind: "identity-changed", userId: currentUserId };
    if (!currentUserId) return isTerminalSessionRefreshFailure(error) ? { kind: "session-expired", error } : { kind: "signed-out" };
    return isTerminalSessionRefreshFailure(error)
      ? { kind: "session-expired", error }
      : { kind: "transient-failure", error };
  }

  const currentUserId = options.currentUserId();
  if (currentUserId && currentUserId !== options.userId) return { kind: "identity-changed", userId: currentUserId };
  if (result.error) {
    if (!currentUserId) return isTerminalSessionRefreshFailure(result.error) ? { kind: "session-expired", error: result.error } : { kind: "signed-out" };
    return isTerminalSessionRefreshFailure(result.error)
      ? { kind: "session-expired", error: result.error }
      : { kind: "transient-failure", error: result.error };
  }
  if (!result.session) return { kind: "signed-out" };
  if (sessionIdentity(result.session) !== options.userId) {
    return { kind: "identity-changed", userId: sessionIdentity(result.session) || "", session: result.session };
  }
  if (currentUserId !== options.userId) return { kind: "signed-out" };

  options.onSameUserSession(result.session);
  try {
    await options.refreshAccess();
    return { kind: "recovered", session: result.session };
  } catch (error) {
    return { kind: "transient-failure", error };
  }
}

export function bindIdleSessionRecovery(options: IdleSessionRecoveryOptions): () => void {
  const now = options.now || Date.now;
  const minimumHiddenMs = options.minimumHiddenMs ?? 60_000;
  const throttleMs = options.throttleMs ?? 30_000;
  let hiddenAt = options.documentTarget.visibilityState === "hidden" ? now() : null;
  let lastAttemptAt = Number.NEGATIVE_INFINITY;
  let inFlight = false;

  const maybeRecover = () => {
    if (options.documentTarget.visibilityState === "hidden" || hiddenAt === null) return;
    const visibleAt = now();
    const hiddenFor = visibleAt - hiddenAt;
    hiddenAt = null;
    if (hiddenFor < minimumHiddenMs || visibleAt - lastAttemptAt < throttleMs || inFlight) return;

    lastAttemptAt = visibleAt;
    inFlight = true;
    let request: Promise<void>;
    try {
      request = Promise.resolve(options.recover()).then(() => undefined, () => undefined);
    } catch {
      inFlight = false;
      return;
    }
    void request.finally(() => { inFlight = false; });
  };

  const onVisibilityChange = () => {
    if (options.documentTarget.visibilityState === "hidden") {
      if (hiddenAt === null) hiddenAt = now();
      return;
    }
    maybeRecover();
  };
  const onBlur = () => {
    if (hiddenAt === null) hiddenAt = now();
  };
  const onFocus = () => maybeRecover();

  options.documentTarget.addEventListener("visibilitychange", onVisibilityChange);
  options.windowTarget?.addEventListener("blur", onBlur);
  options.windowTarget?.addEventListener("focus", onFocus);
  return () => {
    options.documentTarget.removeEventListener("visibilitychange", onVisibilityChange);
    options.windowTarget?.removeEventListener("blur", onBlur);
    options.windowTarget?.removeEventListener("focus", onFocus);
  };
}

function sessionIdentity(session: Session | null) {
  return session?.user?.id || null;
}

export async function revalidateDeploymentCompanyAccess(
  options: DeploymentAccessRevalidationOptions,
): Promise<DeploymentAccessRevalidationResult> {
  let refreshedSession: Session | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let revalidationData: [CompanyAccessSnapshot, string];
    try {
      revalidationData = await Promise.all([
        options.loadAccess(),
        options.loadDeploymentCompanyId(),
      ]);
    } catch (error) {
      if (!isSessionAuthenticationFailure(error)) {
        return { kind: "transient-failure", error };
      }
      if (attempt > 0) return { kind: "session-expired", error };

      let accessToken: string | null;
      try {
        accessToken = await options.refreshAccessToken();
      } catch (refreshError) {
        return isTerminalSessionRefreshFailure(refreshError)
          ? { kind: "session-expired", error: refreshError }
          : { kind: "transient-failure", error: refreshError };
      }
      if (!accessToken) return { kind: "session-expired", error };

      let refreshed: { session: Session | null; error?: unknown };
      try {
        refreshed = await options.getSession();
      } catch (sessionError) {
        return isTerminalSessionRefreshFailure(sessionError)
          ? { kind: "session-expired", error: sessionError }
          : { kind: "transient-failure", error: sessionError };
      }
      if (refreshed.error) {
        return isTerminalSessionRefreshFailure(refreshed.error)
          ? { kind: "session-expired", error: refreshed.error }
          : { kind: "transient-failure", error: refreshed.error };
      }
      if (!refreshed.session) return { kind: "session-expired", error };
      const refreshedUserId = sessionIdentity(refreshed.session);
      if (refreshedUserId !== options.userId) {
        return { kind: "identity-changed", userId: refreshedUserId || "" };
      }
      refreshedSession = refreshed.session;
      continue;
    }

    const [loaded, deploymentCompanyId] = revalidationData;

    if (loaded.userId !== options.userId) {
      return { kind: "identity-changed", userId: loaded.userId || "" };
    }
    if (options.knownDeploymentCompanyId && deploymentCompanyId !== options.knownDeploymentCompanyId) {
      return { kind: "deployment-mismatch", deploymentCompanyId };
    }

    try {
      const access = (options.resolveAccess || resolveDeploymentCompanyAccess)(loaded, deploymentCompanyId);
      return {
        kind: "resolved",
        access,
        deploymentCompanyId,
        ...(refreshedSession ? { refreshedSession } : {}),
      };
    } catch (error) {
      return { kind: "transient-failure", error };
    }
  }

  return { kind: "transient-failure", error: new Error("Company access could not be verified.") };
}

function emptyAccess(status: CompanyAccessSnapshot["status"], userId?: string, email?: string, error?: string): CompanyAccessSnapshot {
  return {
    status,
    isPlatformOwner: false,
    companies: [],
    memberships: [],
    activeCompanyId: null,
    permissions: [],
    ...(userId ? { userId } : {}),
    ...(email ? { email } : {}),
    ...(error ? { error } : {}),
  };
}

export async function refreshCompanyAccessState(
  state: CompanyAccessRefreshState,
  options: CompanyAccessRefreshOptions,
  onState: (next: CompanyAccessRefreshState) => void,
): Promise<{ state: CompanyAccessRefreshState; outcome: DeploymentAccessRevalidationResult } | null> {
  const isCurrent = () => isCurrentCompanyAccessRequest(
    options.currentGeneration(),
    options.requestGeneration,
    options.currentUserId(),
    options.userId,
  );
  if (!isCurrent()) return null;

  const preserveAccess = shouldPreserveCompanyAccessDuringRefresh(state.access, options.userId);
  const startingState: CompanyAccessRefreshState = {
    ...state,
    access: preserveAccess ? state.access : emptyAccess("loading", options.userId, options.userEmail),
    isSwitching: !preserveAccess,
    isRefreshing: preserveAccess,
    refreshError: null,
    sessionExpired: false,
  };
  onState(startingState);

  const outcome = await revalidateDeploymentCompanyAccess(options);
  if (!isCurrent()) return null;

  let next: CompanyAccessRefreshState;
  if (outcome.kind === "resolved") {
    next = {
      access: outcome.access,
      isSwitching: false,
      isRefreshing: false,
      refreshError: null,
      sessionExpired: false,
    };
  } else if (outcome.kind === "transient-failure") {
    const message = safeErrorMessage(outcome.error, "Deployment company access could not be verified.");
    next = {
      access: preserveAccess ? state.access : emptyAccess("error", options.userId, options.userEmail, message),
      isSwitching: false,
      isRefreshing: false,
      refreshError: preserveAccess ? message : null,
      sessionExpired: false,
    };
  } else if (outcome.kind === "session-expired") {
    next = {
      access: emptyAccess("signed-out"),
      isSwitching: false,
      isRefreshing: false,
      refreshError: null,
      sessionExpired: true,
    };
  } else if (outcome.kind === "deployment-mismatch") {
    next = {
      access: emptyAccess("no-company"),
      isSwitching: false,
      isRefreshing: false,
      refreshError: null,
      sessionExpired: false,
    };
  } else {
    next = {
      access: emptyAccess("signed-out"),
      isSwitching: false,
      isRefreshing: false,
      refreshError: null,
      sessionExpired: false,
    };
  }

  onState(next);
  return { state: next, outcome };
}
