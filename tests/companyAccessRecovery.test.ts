import test from "node:test";
import assert from "node:assert/strict";
import type { Session } from "@supabase/supabase-js";
import { loadCompanyAccess, type CompanyAccessSnapshot } from "../src/lib/companyAccess.ts";
import { isSessionAuthenticationFailure } from "../src/lib/authenticatedRequestRecovery.ts";
import {
  bindIdleSessionRecovery as bindIdleSessionRecoveryTest,
  recoverSessionBeforeAccessRefresh as recoverSessionBeforeAccessRefreshTest,
  refreshCompanyAccessState as runRefreshCompanyAccessState,
  type CompanyAccessRefreshState,
} from "../src/lib/companyAccessRecovery.ts";

function accessSnapshot(overrides: Partial<CompanyAccessSnapshot> = {}): CompanyAccessSnapshot {
  return {
    status: "ready",
    userId: "user-1",
    email: "user@example.com",
    isPlatformOwner: false,
    companies: [{ id: "company-1", name: "Example Co", status: "ACTIVE" }],
    memberships: [{ companyId: "company-1", userId: "user-1", roleKey: "admin", status: "ACTIVE", permissions: ["dashboard.read"] }],
    activeCompanyId: "company-1",
    permissions: ["dashboard.read"],
    ...overrides,
  };
}

function authSession(userId: string, accessToken = "fresh-token"): Session {
  return {
    access_token: accessToken,
    refresh_token: "rotated-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 2_000_000_000,
    user: {
      id: userId,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-09-23T00:00:00.000Z",
    },
  } as unknown as Session;
}

test("same-user ready access remains visible when deployment verification throws", async () => {
  const refreshCompanyAccessState = runRefreshCompanyAccessState;

  const readyAccess = accessSnapshot({
    memberships: [
      { companyId: "company-1", userId: "user-1", status: "ACTIVE", permissions: ["dashboard.read"] },
      { companyId: "company-1", userId: "user-1", status: "ACTIVE", permissions: ["dashboard.read"] },
    ],
  });
  const state = {
    access: readyAccess,
    isSwitching: false,
    isRefreshing: false,
    refreshError: null,
    sessionExpired: false,
  };
  const transitions: CompanyAccessRefreshState[] = [];
  let refreshCount = 0;

  const result = await refreshCompanyAccessState(state, {
    userId: "user-1",
    userEmail: "user@example.com",
    requestGeneration: 4,
    currentGeneration: () => 4,
    currentUserId: () => "user-1",
    knownDeploymentCompanyId: "company-1",
    loadAccess: async () => readyAccess,
    loadDeploymentCompanyId: async () => "company-1",
    refreshAccessToken: async () => { refreshCount += 1; return null; },
    getSession: async () => ({ session: null }),
  }, (nextState) => transitions.push(nextState));

  assert.equal(result?.outcome.kind, "transient-failure");
  assert.equal(result?.state.access, readyAccess);
  assert.equal(result?.state.isRefreshing, false);
  assert.equal(typeof result?.state.refreshError, "string");
  assert.equal(transitions[0]?.isRefreshing, true);
  assert.equal(refreshCount, 0);
});

test("a network error from Auth is preserved as transient instead of being mislabeled as token expiry", async () => {
  const networkError = new TypeError("Failed to fetch");
  const client = {
    auth: { getUser: async () => ({ data: { user: null }, error: networkError }) },
  };

  await assert.rejects(
    loadCompanyAccess(client as never),
    (error: unknown) => {
      assert.equal((error as Error).cause, networkError);
      assert.equal(isSessionAuthenticationFailure(error), false);
      return true;
    },
  );
});

test("a stale access token refreshes once, rechecks the same user, and reloads deployment access", async () => {
  const refreshCompanyAccessState = runRefreshCompanyAccessState;

  const readyAccess = accessSnapshot();
  const refreshedAccess = accessSnapshot({
    memberships: [{ companyId: "company-1", userId: "user-1", roleKey: "admin", status: "ACTIVE", permissions: ["dashboard.read", "projects.read"] }],
    permissions: ["dashboard.read", "projects.read"],
  });
  let accessLoads = 0;
  let tokenRefreshes = 0;
  let sessionReads = 0;
  const result = await refreshCompanyAccessState({
    access: readyAccess,
    isSwitching: false,
    isRefreshing: false,
    refreshError: null,
    sessionExpired: false,
  }, {
    userId: "user-1",
    requestGeneration: 7,
    currentGeneration: () => 7,
    currentUserId: () => "user-1",
    knownDeploymentCompanyId: "company-1",
    loadAccess: async () => {
      accessLoads += 1;
      if (accessLoads === 1) throw Object.assign(new Error("JWT expired"), { status: 401, code: "PGRST301" });
      return refreshedAccess;
    },
    loadDeploymentCompanyId: async () => "company-1",
    refreshAccessToken: async () => { tokenRefreshes += 1; return "fresh-token"; },
    getSession: async () => {
      sessionReads += 1;
      return { session: authSession("user-1") };
    },
  }, () => undefined);

  assert.equal(result?.outcome.kind, "resolved");
  assert.deepEqual(result?.state.access.permissions, ["dashboard.read", "projects.read"]);
  assert.equal(result?.outcome.refreshedSession?.user.id, "user-1");
  assert.equal(accessLoads, 2);
  assert.equal(tokenRefreshes, 1);
  assert.equal(sessionReads, 1);
});

test("a temporary refresh failure retains ready access and does not mark the session expired", async () => {
  const refreshCompanyAccessState = runRefreshCompanyAccessState;
  const readyAccess = accessSnapshot();
  let accessLoads = 0;
  let tokenRefreshes = 0;
  const result = await refreshCompanyAccessState({
    access: readyAccess,
    isSwitching: false,
    isRefreshing: false,
    refreshError: null,
    sessionExpired: false,
  }, {
    userId: "user-1",
    requestGeneration: 10,
    currentGeneration: () => 10,
    currentUserId: () => "user-1",
    knownDeploymentCompanyId: "company-1",
    loadAccess: async () => { accessLoads += 1; throw Object.assign(new Error("JWT expired"), { status: 401, code: "PGRST301" }); },
    loadDeploymentCompanyId: async () => "company-1",
    refreshAccessToken: async () => { tokenRefreshes += 1; throw new TypeError("Failed to fetch"); },
    getSession: async () => ({ session: null }),
  }, () => undefined);

  assert.equal(result.outcome.kind, "transient-failure");
  assert.equal(result.state.access, readyAccess);
  assert.equal(typeof result.state.refreshError, "string");
  assert.equal(result.state.sessionExpired, false);
  assert.equal(accessLoads, 1);
  assert.equal(tokenRefreshes, 1);
});

test("an invalid refresh token clears access and produces the terminal session-expired state", async () => {
  const refreshCompanyAccessState = runRefreshCompanyAccessState;
  const readyAccess = accessSnapshot();
  const result = await refreshCompanyAccessState({
    access: readyAccess,
    isSwitching: false,
    isRefreshing: false,
    refreshError: null,
    sessionExpired: false,
  }, {
    userId: "user-1",
    requestGeneration: 11,
    currentGeneration: () => 11,
    currentUserId: () => "user-1",
    loadAccess: async () => { throw Object.assign(new Error("JWT expired"), { status: 401, code: "PGRST301" }); },
    loadDeploymentCompanyId: async () => "company-1",
    refreshAccessToken: async () => { throw Object.assign(new Error("refresh token not found"), { status: 400, code: "refresh_token_not_found" }); },
    getSession: async () => ({ session: null }),
  }, () => undefined);

  assert.equal(result.outcome.kind, "session-expired");
  assert.equal(result.state.access.status, "signed-out");
  assert.deepEqual(result.state.access.permissions, []);
  assert.equal(result.state.sessionExpired, true);
});

test("access retry happens once and a second authentication failure expires the session", async () => {
  const refreshCompanyAccessState = runRefreshCompanyAccessState;
  let accessLoads = 0;
  let tokenRefreshes = 0;
  const result = await refreshCompanyAccessState({
    access: accessSnapshot(),
    isSwitching: false,
    isRefreshing: false,
    refreshError: null,
    sessionExpired: false,
  }, {
    userId: "user-1",
    requestGeneration: 12,
    currentGeneration: () => 12,
    currentUserId: () => "user-1",
    loadAccess: async () => { accessLoads += 1; throw Object.assign(new Error("JWT expired"), { status: 401, code: "PGRST301" }); },
    loadDeploymentCompanyId: async () => "company-1",
    refreshAccessToken: async () => { tokenRefreshes += 1; return "fresh-token"; },
    getSession: async () => ({ session: authSession("user-1") }),
  }, () => undefined);

  assert.equal(result.outcome.kind, "session-expired");
  assert.equal(accessLoads, 2);
  assert.equal(tokenRefreshes, 1);
});

test("confirmed membership revocation clears permissions from the retained snapshot", async () => {
  const refreshCompanyAccessState = runRefreshCompanyAccessState;
  const result = await refreshCompanyAccessState({
    access: accessSnapshot(),
    isSwitching: false,
    isRefreshing: false,
    refreshError: null,
    sessionExpired: false,
  }, {
    userId: "user-1",
    requestGeneration: 13,
    currentGeneration: () => 13,
    currentUserId: () => "user-1",
    knownDeploymentCompanyId: "company-1",
    loadAccess: async () => accessSnapshot({
      memberships: [{ companyId: "company-1", userId: "user-1", status: "REVOKED", permissions: ["dashboard.read"] }],
      permissions: ["dashboard.read"],
    }),
    loadDeploymentCompanyId: async () => "company-1",
    refreshAccessToken: async () => null,
    getSession: async () => ({ session: null }),
  }, () => undefined);

  assert.equal(result.outcome.kind, "resolved");
  assert.equal(result.state.access.status, "no-company");
  assert.equal(result.state.access.activeCompanyId, null);
  assert.deepEqual(result.state.access.permissions, []);
});

test("confirmed inactive deployment company clears permissions", async () => {
  const refreshCompanyAccessState = runRefreshCompanyAccessState;
  const result = await refreshCompanyAccessState({
    access: accessSnapshot(),
    isSwitching: false,
    isRefreshing: false,
    refreshError: null,
    sessionExpired: false,
  }, {
    userId: "user-1",
    requestGeneration: 14,
    currentGeneration: () => 14,
    currentUserId: () => "user-1",
    knownDeploymentCompanyId: "company-1",
    loadAccess: async () => accessSnapshot({ companies: [{ id: "company-1", name: "Example Co", status: "SUSPENDED" }] }),
    loadDeploymentCompanyId: async () => "company-1",
    refreshAccessToken: async () => null,
    getSession: async () => ({ session: null }),
  }, () => undefined);

  assert.equal(result.outcome.kind, "resolved");
  assert.equal(result.state.access.status, "company-suspended");
  assert.deepEqual(result.state.access.permissions, []);
});

test("a confirmed permission removal replaces the old permission set", async () => {
  const refreshCompanyAccessState = runRefreshCompanyAccessState;
  const result = await refreshCompanyAccessState({
    access: accessSnapshot(),
    isSwitching: false,
    isRefreshing: false,
    refreshError: null,
    sessionExpired: false,
  }, {
    userId: "user-1",
    requestGeneration: 15,
    currentGeneration: () => 15,
    currentUserId: () => "user-1",
    knownDeploymentCompanyId: "company-1",
    loadAccess: async () => accessSnapshot({
      memberships: [{ companyId: "company-1", userId: "user-1", roleKey: "admin", status: "ACTIVE", permissions: [] }],
      permissions: [],
    }),
    loadDeploymentCompanyId: async () => "company-1",
    refreshAccessToken: async () => null,
    getSession: async () => ({ session: null }),
  }, () => undefined);

  assert.equal(result.state.access.status, "ready");
  assert.deepEqual(result.state.access.permissions, []);
});

test("a deployment-company mismatch clears the retained company snapshot", async () => {
  const refreshCompanyAccessState = runRefreshCompanyAccessState;
  const result = await refreshCompanyAccessState({
    access: accessSnapshot(),
    isSwitching: false,
    isRefreshing: false,
    refreshError: null,
    sessionExpired: false,
  }, {
    userId: "user-1",
    requestGeneration: 16,
    currentGeneration: () => 16,
    currentUserId: () => "user-1",
    knownDeploymentCompanyId: "company-1",
    loadAccess: async () => accessSnapshot(),
    loadDeploymentCompanyId: async () => "company-2",
    refreshAccessToken: async () => null,
    getSession: async () => ({ session: null }),
  }, () => undefined);

  assert.equal(result.outcome.kind, "deployment-mismatch");
  assert.equal(result.state.access.status, "no-company");
  assert.deepEqual(result.state.access.permissions, []);
});

test("a refreshed session for a different user cannot inherit the retained access", async () => {
  const refreshCompanyAccessState = runRefreshCompanyAccessState;
  const result = await refreshCompanyAccessState({
    access: accessSnapshot(),
    isSwitching: false,
    isRefreshing: false,
    refreshError: null,
    sessionExpired: false,
  }, {
    userId: "user-1",
    requestGeneration: 17,
    currentGeneration: () => 17,
    currentUserId: () => "user-1",
    loadAccess: async () => { throw Object.assign(new Error("JWT expired"), { status: 401, code: "PGRST301" }); },
    loadDeploymentCompanyId: async () => "company-1",
    refreshAccessToken: async () => "fresh-token",
    getSession: async () => ({ session: authSession("user-2") }),
  }, () => undefined);

  assert.equal(result.outcome.kind, "identity-changed");
  assert.equal(result.state.access.status, "signed-out");
  assert.deepEqual(result.state.access.permissions, []);
  assert.equal(result.state.sessionExpired, false);
});

test("a delayed access response cannot overwrite a newer confirmed denial", async () => {
  const refreshCompanyAccessState = runRefreshCompanyAccessState;
  const oldAccess = accessSnapshot({ permissions: ["dashboard.read"] });
  let generation = 20;
  let currentState: CompanyAccessRefreshState = {
    access: oldAccess,
    isSwitching: false,
    isRefreshing: false,
    refreshError: null,
    sessionExpired: false,
  };
  let releaseOldLoad: ((snapshot: CompanyAccessSnapshot) => void) | undefined;
  const oldLoad = new Promise<CompanyAccessSnapshot>((resolve) => { releaseOldLoad = resolve; });
  const oldRequest = refreshCompanyAccessState(currentState, {
    userId: "user-1",
    requestGeneration: 20,
    currentGeneration: () => generation,
    currentUserId: () => "user-1",
    knownDeploymentCompanyId: "company-1",
    loadAccess: async () => oldLoad,
    loadDeploymentCompanyId: async () => "company-1",
    refreshAccessToken: async () => null,
    getSession: async () => ({ session: null }),
  }, (next) => { currentState = next; });

  await Promise.resolve();
  generation = 21;
  const newRequest = await refreshCompanyAccessState(currentState, {
    userId: "user-1",
    requestGeneration: 21,
    currentGeneration: () => generation,
    currentUserId: () => "user-1",
    knownDeploymentCompanyId: "company-1",
    loadAccess: async () => accessSnapshot({ memberships: [], permissions: [] }),
    loadDeploymentCompanyId: async () => "company-1",
    refreshAccessToken: async () => null,
    getSession: async () => ({ session: null }),
  }, (next) => { currentState = next; });
  releaseOldLoad?.(accessSnapshot());
  const staleResult = await oldRequest;

  assert.equal(newRequest?.state.access.status, "no-company");
  assert.equal(staleResult, null);
  assert.equal(currentState.access.status, "no-company");
  assert.deepEqual(currentState.access.permissions, []);
});

test("a transient verification failure can recover on a later bounded revalidation", async () => {
  const refreshCompanyAccessState = runRefreshCompanyAccessState;
  const readyAccess = accessSnapshot();
  const initialState = {
    access: readyAccess,
    isSwitching: false,
    isRefreshing: false,
    refreshError: null,
    sessionExpired: false,
  };
  const failed = await refreshCompanyAccessState(initialState, {
    userId: "user-1",
    requestGeneration: 30,
    currentGeneration: () => 30,
    currentUserId: () => "user-1",
    knownDeploymentCompanyId: "company-1",
    loadAccess: async () => readyAccess,
    loadDeploymentCompanyId: async () => "company-1",
    resolveAccess: () => { throw new TypeError("Temporary deployment verification failure"); },
    refreshAccessToken: async () => null,
    getSession: async () => ({ session: null }),
  }, () => undefined);

  const recoveredAccess = accessSnapshot({
    memberships: [{ companyId: "company-1", userId: "user-1", roleKey: "admin", status: "ACTIVE", permissions: ["dashboard.read", "projects.read"] }],
    permissions: ["dashboard.read", "projects.read"],
  });
  const recovered = await refreshCompanyAccessState(failed.state, {
    userId: "user-1",
    requestGeneration: 31,
    currentGeneration: () => 31,
    currentUserId: () => "user-1",
    knownDeploymentCompanyId: "company-1",
    loadAccess: async () => recoveredAccess,
    loadDeploymentCompanyId: async () => "company-1",
    refreshAccessToken: async () => null,
    getSession: async () => ({ session: null }),
  }, () => undefined);

  assert.equal(failed.state.access, readyAccess);
  assert.equal(typeof failed.state.refreshError, "string");
  assert.equal(recovered.outcome.kind, "resolved");
  assert.deepEqual(recovered.state.access.permissions, ["dashboard.read", "projects.read"]);
  assert.equal(recovered.state.refreshError, null);
});

test("explicit logout invalidates an unresolved old-user access response", async () => {
  const refreshCompanyAccessState = runRefreshCompanyAccessState;
  const oldAccess = accessSnapshot();
  let generation = 32;
  let currentState: CompanyAccessRefreshState = {
    access: oldAccess,
    isSwitching: false,
    isRefreshing: false,
    refreshError: null,
    sessionExpired: false,
  };
  let releaseLoad: ((snapshot: CompanyAccessSnapshot) => void) | undefined;
  const pendingLoad = new Promise<CompanyAccessSnapshot>((resolve) => { releaseLoad = resolve; });
  const request = refreshCompanyAccessState(currentState, {
    userId: "user-1",
    requestGeneration: 32,
    currentGeneration: () => generation,
    currentUserId: () => "user-1",
    knownDeploymentCompanyId: "company-1",
    loadAccess: async () => pendingLoad,
    loadDeploymentCompanyId: async () => "company-1",
    refreshAccessToken: async () => null,
    getSession: async () => ({ session: null }),
  }, (next) => { currentState = next; });

  generation = 33;
  currentState = {
    access: { ...oldAccess, status: "signed-out", companies: [], memberships: [], activeCompanyId: null, permissions: [] },
    isSwitching: false,
    isRefreshing: false,
    refreshError: null,
    sessionExpired: false,
  };
  releaseLoad?.(accessSnapshot({ permissions: ["dashboard.read"] }));
  assert.equal(await request, null);
  assert.equal(currentState.access.status, "signed-out");
  assert.deepEqual(currentState.access.permissions, []);
});

test("visibility and focus recovery is bounded by idle duration, in-flight dedupe, and cooldown", async () => {
  const bindIdleSessionRecovery = bindIdleSessionRecoveryTest;

  class FakeLifecycleTarget {
    visibilityState: DocumentVisibilityState = "visible";
    private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const listeners = this.listeners.get(type) || new Set<EventListenerOrEventListenerObject>();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      this.listeners.get(type)?.delete(listener);
    }
    dispatch(type: string) {
      const event = new Event(type);
      for (const listener of this.listeners.get(type) || []) {
        if (typeof listener === "function") listener(event);
        else listener.handleEvent(event);
      }
    }
  }

  const documentTarget = new FakeLifecycleTarget();
  const windowTarget = new FakeLifecycleTarget();
  let now = 0;
  let recoveries = 0;
  let releaseRecovery: (() => void) | undefined;
  const recoveryGate = new Promise<void>((resolve) => { releaseRecovery = resolve; });
  const detach = bindIdleSessionRecovery({
    documentTarget,
    windowTarget,
    now: () => now,
    minimumHiddenMs: 60_000,
    throttleMs: 30_000,
    recover: () => { recoveries += 1; return recoveryGate; },
  });

  documentTarget.visibilityState = "hidden";
  documentTarget.dispatch("visibilitychange");
  now = 59_999;
  documentTarget.visibilityState = "visible";
  documentTarget.dispatch("visibilitychange");
  windowTarget.dispatch("focus");
  assert.equal(recoveries, 0);

  documentTarget.visibilityState = "hidden";
  documentTarget.dispatch("visibilitychange");
  now = 120_000;
  documentTarget.visibilityState = "visible";
  documentTarget.dispatch("visibilitychange");
  windowTarget.dispatch("focus");
  assert.equal(recoveries, 1);

  documentTarget.visibilityState = "hidden";
  documentTarget.dispatch("visibilitychange");
  now = 180_001;
  documentTarget.visibilityState = "visible";
  documentTarget.dispatch("visibilitychange");
  assert.equal(recoveries, 1);

  releaseRecovery?.();
  await Promise.resolve();
  await Promise.resolve();
  now = 190_000;
  windowTarget.dispatch("blur");
  now = 250_000;
  windowTarget.dispatch("focus");
  assert.equal(recoveries, 2);

  detach();
  documentTarget.visibilityState = "hidden";
  documentTarget.dispatch("visibilitychange");
  now = 250_000;
  documentTarget.visibilityState = "visible";
  documentTarget.dispatch("visibilitychange");
  assert.equal(recoveries, 2);
});

test("idle resume resolves the same-user session before revalidating access", async () => {
  const recoverSessionBeforeAccessRefresh = recoverSessionBeforeAccessRefreshTest;

  const order: string[] = [];
  const session = authSession("user-1");
  const result = await recoverSessionBeforeAccessRefresh({
    userId: "user-1",
    currentUserId: () => "user-1",
    getSession: async () => { order.push("session"); return { session }; },
    onSameUserSession: () => { order.push("apply-session"); },
    refreshAccess: async () => { order.push("access"); },
  });

  assert.equal(result.kind, "recovered");
  assert.deepEqual(order, ["session", "apply-session", "access"]);
});
