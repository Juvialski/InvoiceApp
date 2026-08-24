/**
 * Bounded, loader-agnostic synchronization primitives for the authenticated
 * InvoiceApp workspace.
 *
 * This module deliberately does not import any domain loader. The application
 * owns the loader functions and can attach them to the refresh callback exposed
 * by the scheduler/controller below.
 */

export const WORKSPACE_REFRESH_GROUPS = [
  "invoices",
  "engineering",
  "payroll",
  "payroll-imports",
  "gmail",
] as const;

export type WorkspaceRefreshGroup = (typeof WORKSPACE_REFRESH_GROUPS)[number];

export const WORKSPACE_SYNC_CHANNEL_PREFIX = "invoice-workspace-sync";
export const DEFAULT_WORKSPACE_SYNC_DEBOUNCE_MS = 250;
export const DEFAULT_WORKSPACE_SYNC_FALLBACK_COOLDOWN_MS = 5_000;

/**
 * The persisted tables currently read by the workspace loaders. `profiles` is
 * intentionally excluded: it belongs to session/bootstrap bookkeeping rather
 * than a refreshable domain group.
 */
export const WORKSPACE_REFRESH_TABLES: Readonly<Record<WorkspaceRefreshGroup, readonly string[]>> = Object.freeze({
  invoices: Object.freeze([
    "invoices",
    "invoice_extractions",
  ]),
  engineering: Object.freeze([
    "projects",
    "invoice_project_allocations",
    "expenses",
  ]),
  payroll: Object.freeze([
    "departments",
    "workers",
    "project_worker_assignments",
    "payroll_schedules",
    "payroll_schedule_versions",
    "worker_compensation_profiles",
    "recurring_payroll_components",
    "payroll_periods",
    "work_entries",
    "attendance_records",
    "leave_requests",
    "overtime_requests",
    "payroll_holidays",
    "payroll_runs",
    "payroll_entries",
    "payroll_project_allocations",
    "payroll_adjustments",
  ]),
  "payroll-imports": Object.freeze([
    "labor_cost_centers",
    "payroll_import_batches",
    "payroll_import_rows",
    "payroll_import_templates",
  ]),
  gmail: Object.freeze([
    "gmail_connections",
    "gmail_sync_state",
  ]),
});

/**
 * A table may affect more than one loader. For example, invoice allocations
 * feed both invoice detail and engineering project-cost summaries.
 */
export const WORKSPACE_TABLE_REFRESH_GROUPS: Readonly<Record<string, readonly WorkspaceRefreshGroup[]>> = Object.freeze({
  invoices: ["invoices"],
  invoice_extractions: ["invoices"],
  invoice_project_allocations: ["invoices", "engineering"],
  projects: ["engineering"],
  expenses: ["engineering"],
  departments: ["payroll"],
  workers: ["payroll"],
  project_worker_assignments: ["payroll"],
  payroll_schedules: ["payroll"],
  payroll_schedule_versions: ["payroll"],
  worker_compensation_profiles: ["payroll"],
  recurring_payroll_components: ["payroll"],
  payroll_periods: ["payroll"],
  work_entries: ["payroll"],
  attendance_records: ["payroll"],
  leave_requests: ["payroll"],
  overtime_requests: ["payroll"],
  payroll_holidays: ["payroll"],
  payroll_runs: ["payroll"],
  payroll_entries: ["payroll"],
  payroll_project_allocations: ["payroll"],
  payroll_adjustments: ["payroll"],
  labor_cost_centers: ["payroll-imports"],
  payroll_import_batches: ["payroll-imports"],
  payroll_import_rows: ["payroll-imports"],
  payroll_import_templates: ["payroll-imports"],
  gmail_connections: ["gmail"],
  gmail_sync_state: ["gmail"],
});

const EMPTY_GROUPS: readonly WorkspaceRefreshGroup[] = Object.freeze([]);

export const WORKSPACE_SYNCED_TABLES: readonly string[] = Object.freeze(
  Object.keys(WORKSPACE_TABLE_REFRESH_GROUPS),
);

export function refreshGroupsForTable(table: string | null | undefined): readonly WorkspaceRefreshGroup[] {
  if (!table) return EMPTY_GROUPS;
  return WORKSPACE_TABLE_REFRESH_GROUPS[table] || EMPTY_GROUPS;
}

export const getRefreshGroupsForTable = refreshGroupsForTable;

export function workspaceSyncChannelName(userId: string, companyId?: string | null): string {
  const companySuffix = companyId ? `:${encodeURIComponent(companyId)}` : "";
  return `${WORKSPACE_SYNC_CHANNEL_PREFIX}:${encodeURIComponent(userId)}${companySuffix}`;
}

export interface WorkspaceSessionLike {
  user?: {
    id?: string | null;
  } | null;
}

export function getWorkspaceUserId(session: WorkspaceSessionLike | null | undefined): string | null {
  const id = session?.user?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export const getAuthenticatedWorkspaceUserId = getWorkspaceUserId;

export function hasAuthenticatedWorkspaceSession(session: WorkspaceSessionLike | null | undefined): boolean {
  return Boolean(getWorkspaceUserId(session));
}

export function workspaceSessionUserChanged(
  previous: WorkspaceSessionLike | null | undefined,
  next: WorkspaceSessionLike | null | undefined,
): boolean {
  return getWorkspaceUserId(previous) !== getWorkspaceUserId(next);
}

export type WorkspaceRealtimeSubscribeStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CHANNEL_ERROR"
  | "CLOSED"
  | "JOINING"
  | "LEAVING"
  | (string & {});

export type WorkspaceSyncStatus =
  | "guest"
  | "connecting"
  | "synced"
  | "syncing"
  | "offline"
  | "degraded"
  | "error";

export function mapChannelStatusToSyncStatus(
  channelStatus: WorkspaceRealtimeSubscribeStatus | null | undefined,
  options: { authenticated?: boolean; online?: boolean } = {},
): WorkspaceSyncStatus {
  if (!options.authenticated) return "guest";
  if (options.online === false) return "offline";
  switch (channelStatus) {
    case "SUBSCRIBED":
      return "synced";
    case "TIMED_OUT":
    case "CHANNEL_ERROR":
    case "CLOSED":
      return "degraded";
    default:
      return "connecting";
  }
}

export const mapRealtimeChannelStatus = mapChannelStatusToSyncStatus;

export interface WorkspaceSyncTimers {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export const defaultWorkspaceSyncTimers: WorkspaceSyncTimers = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function resolveTimers(timers?: Partial<WorkspaceSyncTimers>): WorkspaceSyncTimers {
  return {
    now: timers?.now || defaultWorkspaceSyncTimers.now,
    setTimeout: timers?.setTimeout || defaultWorkspaceSyncTimers.setTimeout,
    clearTimeout: timers?.clearTimeout || defaultWorkspaceSyncTimers.clearTimeout,
  };
}

export type WorkspaceSyncReason =
  | "realtime"
  | "focus"
  | "visibility"
  | "online"
  | "manual"
  | "session"
  | "retry"
  | "coalesced";

export type WorkspaceRefreshGroupsInput = WorkspaceRefreshGroup | readonly WorkspaceRefreshGroup[];

function normalizeRefreshGroups(groups: WorkspaceRefreshGroupsInput): WorkspaceRefreshGroup[] {
  const values = Array.isArray(groups) ? groups : [groups];
  return [...new Set(values)].filter((group): group is WorkspaceRefreshGroup =>
    (WORKSPACE_REFRESH_GROUPS as readonly string[]).includes(group),
  );
}

function reasonForReasons(reasons: readonly WorkspaceSyncReason[]): WorkspaceSyncReason {
  if (!reasons.length) return "manual";
  return reasons.length === 1 ? reasons[0] : "coalesced";
}

export interface WorkspaceRefreshContext {
  reason: WorkspaceSyncReason;
  reasons: readonly WorkspaceSyncReason[];
  requestedAt: number;
}

export interface WorkspaceSyncSchedulerState {
  refreshing: boolean;
  scheduled: boolean;
  pendingGroups: readonly WorkspaceRefreshGroup[];
  lastRefreshStartedAt?: number;
  lastRefreshCompletedAt?: number;
  lastError?: string;
}

export interface WorkspaceSyncSchedulerOptions {
  refresh: (
    groups: readonly WorkspaceRefreshGroup[],
    context: WorkspaceRefreshContext,
  ) => Promise<void> | void;
  debounceMs?: number;
  timers?: Partial<WorkspaceSyncTimers>;
  onRefreshStart?: (
    groups: readonly WorkspaceRefreshGroup[],
    context: WorkspaceRefreshContext,
  ) => void;
  onRefreshSuccess?: (
    groups: readonly WorkspaceRefreshGroup[],
    context: WorkspaceRefreshContext,
  ) => void;
  onRefreshError?: (
    error: unknown,
    groups: readonly WorkspaceRefreshGroup[],
    context: WorkspaceRefreshContext,
  ) => void;
  onStateChange?: (state: WorkspaceSyncSchedulerState) => void;
}

export interface WorkspaceSyncScheduler {
  request: (groups: WorkspaceRefreshGroupsInput, reason?: WorkspaceSyncReason) => void;
  requestRefresh: (groups: WorkspaceRefreshGroupsInput, reason?: WorkspaceSyncReason) => void;
  flush: () => Promise<void>;
  whenIdle: () => Promise<void>;
  cancel: () => void;
  dispose: () => void;
  getState: () => WorkspaceSyncSchedulerState;
}

export function createWorkspaceSyncScheduler(options: WorkspaceSyncSchedulerOptions): WorkspaceSyncScheduler {
  const timers = resolveTimers(options.timers);
  const debounceMs = Math.max(0, options.debounceMs ?? DEFAULT_WORKSPACE_SYNC_DEBOUNCE_MS);
  const pendingGroups = new Set<WorkspaceRefreshGroup>();
  const pendingReasons = new Set<WorkspaceSyncReason>();
  const idleWaiters: Array<() => void> = [];
  let timer: unknown;
  let activePromise: Promise<void> | null = null;
  let refreshing = false;
  let disposed = false;
  let lastRefreshStartedAt: number | undefined;
  let lastRefreshCompletedAt: number | undefined;
  let lastError: string | undefined;

  function getState(): WorkspaceSyncSchedulerState {
    return {
      refreshing,
      scheduled: timer !== undefined,
      pendingGroups: [...pendingGroups],
      ...(lastRefreshStartedAt === undefined ? {} : { lastRefreshStartedAt }),
      ...(lastRefreshCompletedAt === undefined ? {} : { lastRefreshCompletedAt }),
      ...(lastError ? { lastError } : {}),
    };
  }

  function emitState() {
    options.onStateChange?.(getState());
    if (!refreshing && timer === undefined && pendingGroups.size === 0) {
      while (idleWaiters.length) idleWaiters.shift()?.();
    }
  }

  function clearScheduledTimer() {
    if (timer === undefined) return;
    timers.clearTimeout(timer);
    timer = undefined;
  }

  function schedule(delayMs = debounceMs) {
    if (disposed || refreshing || pendingGroups.size === 0) return;
    clearScheduledTimer();
    timer = timers.setTimeout(() => {
      timer = undefined;
      void runPending();
    }, Math.max(0, delayMs));
    emitState();
  }

  async function runPending(): Promise<void> {
    if (disposed || refreshing || pendingGroups.size === 0) return;

    const groups = [...pendingGroups];
    const reasons = [...pendingReasons];
    pendingGroups.clear();
    pendingReasons.clear();
    const context: WorkspaceRefreshContext = {
      reason: reasonForReasons(reasons),
      reasons,
      requestedAt: timers.now(),
    };
    refreshing = true;
    lastRefreshStartedAt = timers.now();
    lastError = undefined;
    emitState();
    options.onRefreshStart?.(groups, context);

    const current = (async () => {
      try {
        await options.refresh(groups, context);
        lastRefreshCompletedAt = timers.now();
        options.onRefreshSuccess?.(groups, context);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        options.onRefreshError?.(error, groups, context);
      } finally {
        refreshing = false;
        activePromise = null;
        if (!disposed && pendingGroups.size > 0) schedule();
        emitState();
      }
    })();
    activePromise = current;
    await current;
  }

  async function flush(): Promise<void> {
    if (disposed) return;
    clearScheduledTimer();
    if (activePromise) {
      await activePromise;
      if (!disposed && pendingGroups.size > 0) return flush();
      return;
    }
    if (pendingGroups.size === 0) {
      emitState();
      return;
    }
    await runPending();
    if (!disposed && pendingGroups.size > 0) return flush();
  }

  function whenIdle(): Promise<void> {
    if (disposed || (!refreshing && timer === undefined && pendingGroups.size === 0)) return Promise.resolve();
    return new Promise<void>((resolve) => idleWaiters.push(resolve));
  }

  function request(groups: WorkspaceRefreshGroupsInput, reason: WorkspaceSyncReason = "manual") {
    if (disposed) return;
    for (const group of normalizeRefreshGroups(groups)) pendingGroups.add(group);
    if (!pendingGroups.size) return;
    pendingReasons.add(reason);
    if (!refreshing) schedule();
    emitState();
  }

  function cancel() {
    clearScheduledTimer();
    pendingGroups.clear();
    pendingReasons.clear();
    emitState();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearScheduledTimer();
    pendingGroups.clear();
    pendingReasons.clear();
    emitState();
  }

  const scheduler: WorkspaceSyncScheduler = {
    request,
    requestRefresh: request,
    flush,
    whenIdle,
    cancel,
    dispose,
    getState,
  };
  emitState();
  return scheduler;
}

export interface WorkspacePostgresChangeFilter {
  event: "*";
  schema: "public";
  table: string;
  filter?: string;
}

export interface WorkspacePostgresChangePayload {
  schema?: string;
  table?: string;
  eventType?: string;
  new?: unknown;
  old?: unknown;
  [key: string]: unknown;
}

export interface WorkspaceSyncChannel {
  on: (
    type: "postgres_changes",
    filter: WorkspacePostgresChangeFilter,
    callback: (payload: WorkspacePostgresChangePayload) => void,
  ) => WorkspaceSyncChannel;
  subscribe: (
    callback?: (status: WorkspaceRealtimeSubscribeStatus, error?: Error) => void,
  ) => WorkspaceSyncChannel | void;
  unsubscribe?: () => Promise<unknown> | unknown;
}

export interface WorkspaceSyncClient {
  channel: (name: string) => WorkspaceSyncChannel;
  removeChannel?: (channel: WorkspaceSyncChannel) => Promise<unknown> | unknown;
}

export interface WorkspaceTableChange {
  table: string;
  groups: readonly WorkspaceRefreshGroup[];
  payload: WorkspacePostgresChangePayload;
}

export interface WorkspaceSyncSubscriptionOptions {
  session?: WorkspaceSessionLike | null;
  userId?: string | null;
  companyId?: string | null;
  client?: WorkspaceSyncClient | null;
  /** A direct channel seam is useful for tests and custom client adapters. */
  channel?: WorkspaceSyncChannel | null;
  channelName?: string | ((userId: string, companyId: string | null) => string);
  tables?: readonly string[];
  onTableChange?: (change: WorkspaceTableChange) => void;
  onStatus?: (status: WorkspaceRealtimeSubscribeStatus, error?: Error) => void;
  onError?: (error: unknown) => void;
}

export interface WorkspaceSyncSubscription {
  userId: string | null;
  companyId: string | null;
  channelName?: string;
  channel?: WorkspaceSyncChannel;
  isActive: () => boolean;
  stop: () => Promise<void>;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * Register every mapped table on one channel for one authenticated user.
 * Callers own the domain refresh callback; this handle only translates table
 * events into groups and makes channel cleanup idempotent.
 */
export function subscribeToWorkspaceChanges(options: WorkspaceSyncSubscriptionOptions): WorkspaceSyncSubscription {
  const userId = options.userId || getWorkspaceUserId(options.session);
  const companyId = options.companyId?.trim() || null;
  if (!userId) {
    return {
      userId: null,
      companyId: null,
      isActive: () => false,
      stop: async () => undefined,
    };
  }

  const channelName = typeof options.channelName === "function"
    ? options.channelName(userId, companyId)
    : options.channelName || workspaceSyncChannelName(userId, companyId);
  let channel = options.channel || options.client?.channel(channelName);
  let active = Boolean(channel);
  let stopped: Promise<void> | null = null;
  const tables = [...new Set(options.tables || WORKSPACE_SYNCED_TABLES)].filter((table) => refreshGroupsForTable(table).length > 0);

  if (!channel) {
    const error = new Error("A Supabase client or realtime channel is required for an authenticated workspace sync subscription.");
    options.onStatus?.("CHANNEL_ERROR", error);
    options.onError?.(error);
    return {
      userId,
      companyId,
      channelName,
      isActive: () => false,
      stop: async () => undefined,
    };
  }

  const handleStatus = (status: WorkspaceRealtimeSubscribeStatus, error?: Error) => {
    if (!active) return;
    options.onStatus?.(status, error);
  };

  try {
    for (const table of tables) {
      const filter: WorkspacePostgresChangeFilter = { event: "*", schema: "public", table, filter: companyId ? `company_id=eq.${companyId}` : `user_id=eq.${userId}` };
      channel.on("postgres_changes", filter, (payload) => {
        if (!active) return;
        try {
          options.onTableChange?.({ table, groups: refreshGroupsForTable(table), payload });
        } catch (error) {
          options.onError?.(error);
        }
      });
    }
    channel.subscribe(handleStatus);
  } catch (error) {
    active = false;
    const normalized = asError(error);
    options.onStatus?.("CHANNEL_ERROR", normalized);
    options.onError?.(normalized);
  }

  const stop = async () => {
    if (stopped) return stopped;
    active = false;
    stopped = (async () => {
      try {
        if (options.client?.removeChannel) {
          await options.client.removeChannel(channel);
        } else {
          await channel?.unsubscribe?.();
        }
      } catch (error) {
        options.onError?.(error);
      }
    })();
    return stopped;
  };

  return {
    userId,
    companyId,
    channelName,
    channel,
    isActive: () => active,
    stop,
  };
}

export interface WorkspaceSyncEnvironment {
  isOnline: () => boolean;
  isVisible: () => boolean;
  isFocused: () => boolean;
  onFocus: (listener: () => void) => void | (() => void);
  onVisibilityChange: (listener: () => void) => void | (() => void);
  onOnline: (listener: () => void) => void | (() => void);
}

export interface BrowserWorkspaceSyncSources {
  window?: {
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
    navigator?: { onLine?: boolean };
  };
  document?: {
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
    visibilityState?: string;
    hasFocus?: () => boolean;
  };
}

/** Build the injectable environment adapter used by the browser fallback. */
export function createBrowserWorkspaceSyncEnvironment(
  sources: BrowserWorkspaceSyncSources = {},
): WorkspaceSyncEnvironment | null {
  const browserWindow = sources.window || (typeof window !== "undefined" ? window : undefined);
  const browserDocument = sources.document || (typeof document !== "undefined" ? document : undefined);
  if (!browserWindow && !browserDocument) return null;

  const eventBinding = (
    target: BrowserWorkspaceSyncSources["window"] | BrowserWorkspaceSyncSources["document"] | undefined,
    event: string,
  ) => (listener: () => void) => {
    if (!target) return undefined;
    target.addEventListener(event, listener);
    return () => target.removeEventListener(event, listener);
  };

  return {
    isOnline: () => browserWindow?.navigator?.onLine !== false,
    isVisible: () => browserDocument?.visibilityState !== "hidden",
    isFocused: () => browserDocument?.hasFocus ? browserDocument.hasFocus() : true,
    onFocus: eventBinding(browserWindow, "focus"),
    onVisibilityChange: eventBinding(browserDocument, "visibilitychange"),
    onOnline: eventBinding(browserWindow, "online"),
  };
}

export interface WorkspaceSyncFallbackState {
  started: boolean;
  pendingReasons: readonly WorkspaceSyncReason[];
  lastTriggeredAt?: number;
  scheduled: boolean;
}

export interface WorkspaceSyncFallbackOptions {
  environment: WorkspaceSyncEnvironment;
  requestRefresh: (groups: readonly WorkspaceRefreshGroup[], reason: WorkspaceSyncReason) => void;
  groups?: readonly WorkspaceRefreshGroup[];
  cooldownMs?: number;
  timers?: Partial<WorkspaceSyncTimers>;
  onSignal?: (reason: Exclude<WorkspaceSyncReason, "realtime" | "manual" | "session" | "retry" | "coalesced">) => void;
  onError?: (error: unknown) => void;
}

export interface WorkspaceSyncFallback {
  start: () => void;
  stop: () => void;
  trigger: (reason: Exclude<WorkspaceSyncReason, "realtime" | "manual" | "session" | "retry" | "coalesced">) => boolean;
  getState: () => WorkspaceSyncFallbackState;
  dispose: () => void;
}

type FallbackReason = Exclude<WorkspaceSyncReason, "realtime" | "manual" | "session" | "retry" | "coalesced">;

export function createWorkspaceSyncFallback(options: WorkspaceSyncFallbackOptions): WorkspaceSyncFallback {
  const timers = resolveTimers(options.timers);
  const cooldownMs = Math.max(0, options.cooldownMs ?? DEFAULT_WORKSPACE_SYNC_FALLBACK_COOLDOWN_MS);
  const groups = normalizeRefreshGroups(options.groups?.length ? options.groups : WORKSPACE_REFRESH_GROUPS);
  const pendingReasons = new Set<FallbackReason>();
  const cleanupFns: Array<() => void> = [];
  let started = false;
  let disposed = false;
  let timer: unknown;
  let lastTriggeredAt: number | undefined;

  function getState(): WorkspaceSyncFallbackState {
    return {
      started,
      pendingReasons: [...pendingReasons],
      ...(lastTriggeredAt === undefined ? {} : { lastTriggeredAt }),
      scheduled: timer !== undefined,
    };
  }

  function clearTimer() {
    if (timer === undefined) return;
    timers.clearTimeout(timer);
    timer = undefined;
  }

  function dispatch() {
    if (!pendingReasons.size || disposed) return;
    if (!options.environment.isOnline()) return;
    const reasons = [...pendingReasons];
    pendingReasons.clear();
    lastTriggeredAt = timers.now();
    try {
      options.requestRefresh(groups, reasonForReasons(reasons));
    } catch (error) {
      options.onError?.(error);
    }
  }

  function scheduleDispatch(delayMs: number) {
    if (timer !== undefined || disposed) return;
    timer = timers.setTimeout(() => {
      timer = undefined;
      dispatch();
    }, Math.max(0, delayMs));
  }

  function trigger(reason: FallbackReason): boolean {
    if (disposed || !started) return false;
    options.onSignal?.(reason);
    if (!options.environment.isOnline()) return false;
    if (reason === "visibility" && !options.environment.isVisible()) return false;
    if (reason === "focus" && !options.environment.isFocused()) return false;

    pendingReasons.add(reason);
    const elapsed = lastTriggeredAt === undefined ? Number.POSITIVE_INFINITY : timers.now() - lastTriggeredAt;
    if (elapsed >= cooldownMs) {
      clearTimer();
      dispatch();
    } else {
      scheduleDispatch(cooldownMs - Math.max(0, elapsed));
    }
    return true;
  }

  function bind(register: (listener: () => void) => void | (() => void), reason: FallbackReason) {
    try {
      const cleanup = register(() => { trigger(reason); });
      if (typeof cleanup === "function") cleanupFns.push(cleanup);
    } catch (error) {
      options.onError?.(error);
    }
  }

  function start() {
    if (started || disposed) return;
    started = true;
    bind(options.environment.onFocus, "focus");
    bind(options.environment.onVisibilityChange, "visibility");
    bind(options.environment.onOnline, "online");
  }

  function stop() {
    if (!started) return;
    started = false;
    clearTimer();
    pendingReasons.clear();
    while (cleanupFns.length) {
      try {
        cleanupFns.pop()?.();
      } catch (error) {
        options.onError?.(error);
      }
    }
  }

  function dispose() {
    if (disposed) return;
    stop();
    disposed = true;
  }

  return { start, stop, trigger, getState, dispose };
}

export interface WorkspaceSyncState {
  status: WorkspaceSyncStatus;
  userId: string | null;
  companyId: string | null;
  channelStatus?: WorkspaceRealtimeSubscribeStatus;
  pendingGroups: readonly WorkspaceRefreshGroup[];
  refreshing: boolean;
  lastSyncedAt?: string;
  error?: string;
}

export interface WorkspaceSyncControllerOptions {
  client?: WorkspaceSyncClient | null;
  environment?: WorkspaceSyncEnvironment | null;
  refresh: (
    groups: readonly WorkspaceRefreshGroup[],
    context: WorkspaceRefreshContext,
  ) => Promise<void> | void;
  debounceMs?: number;
  fallbackCooldownMs?: number;
  timers?: Partial<WorkspaceSyncTimers>;
  tables?: readonly string[];
  refreshOnSessionStart?: boolean;
  onStateChange?: (state: WorkspaceSyncState) => void;
  onError?: (error: unknown) => void;
}

export interface WorkspaceSyncController {
  setSession: (session: WorkspaceSessionLike | null | undefined, companyId?: string | null) => Promise<void>;
  handleSession: (session: WorkspaceSessionLike | null | undefined) => Promise<void>;
  requestRefresh: (groups: WorkspaceRefreshGroupsInput, reason?: WorkspaceSyncReason) => boolean;
  refreshAll: (reason?: WorkspaceSyncReason) => boolean;
  flush: () => Promise<void>;
  whenIdle: () => Promise<void>;
  getState: () => WorkspaceSyncState;
  subscribe: (listener: (state: WorkspaceSyncState) => void) => () => void;
  dispose: () => Promise<void>;
}

/**
 * Combine one authenticated-session channel, the bounded scheduler, and the
 * browser fallback. The caller still supplies all actual domain loaders.
 */
export function createWorkspaceSyncController(options: WorkspaceSyncControllerOptions): WorkspaceSyncController {
  const timers = resolveTimers(options.timers);
  const listeners = new Set<(state: WorkspaceSyncState) => void>();
  const environment = options.environment || null;
  const tables = options.tables || WORKSPACE_SYNCED_TABLES;
  let disposed = false;
  let sessionGeneration = 0;
  let currentSession: WorkspaceSessionLike | null = null;
  let subscription: WorkspaceSyncSubscription | null = null;
  let scheduler: WorkspaceSyncScheduler;
  let fallback: WorkspaceSyncFallback | null = null;
  let state: WorkspaceSyncState = {
    status: "guest",
    userId: null,
    companyId: null,
    pendingGroups: [],
    refreshing: false,
  };

  function isOnline() {
    return environment ? environment.isOnline() : true;
  }

  function emitState() {
    const snapshot = getState();
    options.onStateChange?.(snapshot);
    for (const listener of listeners) listener(snapshot);
  }

  function getState(): WorkspaceSyncState {
    return {
      ...state,
      pendingGroups: [...state.pendingGroups],
    };
  }

  function setState(patch: Partial<WorkspaceSyncState>) {
    state = { ...state, ...patch };
    emitState();
  }

  function connectedStatus(channelStatus = state.channelStatus): WorkspaceSyncStatus {
    return mapChannelStatusToSyncStatus(channelStatus, {
      authenticated: Boolean(state.userId),
      online: isOnline(),
    });
  }

  function createScheduler(generation: number) {
    return createWorkspaceSyncScheduler({
      refresh: async (groups, context) => {
        if (disposed || generation !== sessionGeneration || !state.userId) return;
        if (!isOnline()) {
          setState({ status: "offline" });
          return;
        }
        await options.refresh(groups, context);
      },
      debounceMs: options.debounceMs,
      timers,
      onRefreshStart: (groups) => {
        if (generation !== sessionGeneration || !state.userId) return;
        setState({ status: "syncing", refreshing: true, pendingGroups: groups });
      },
      onRefreshSuccess: () => {
        if (generation !== sessionGeneration || !state.userId) return;
        setState({ status: connectedStatus(), refreshing: false, lastSyncedAt: new Date(timers.now()).toISOString(), error: undefined });
      },
      onRefreshError: (error) => {
        if (generation !== sessionGeneration || !state.userId) return;
        const message = error instanceof Error ? error.message : String(error);
        options.onError?.(error);
        setState({ status: "error", refreshing: false, error: message });
      },
      onStateChange: (schedulerState) => {
        if (generation !== sessionGeneration || !state.userId) return;
        setState({
          pendingGroups: schedulerState.pendingGroups,
          refreshing: schedulerState.refreshing,
          ...(schedulerState.lastError ? { error: schedulerState.lastError } : {}),
        });
      },
    });
  }

  function createFallback() {
    if (!environment) return null;
    return createWorkspaceSyncFallback({
      environment,
      groups: WORKSPACE_REFRESH_GROUPS,
      cooldownMs: options.fallbackCooldownMs,
      timers,
      requestRefresh: (groups, reason) => {
        requestRefresh(groups, reason);
      },
      onSignal: (reason) => {
        if (!state.userId) return;
        if (!isOnline()) {
          setState({ status: "offline" });
        } else if (reason === "online" && !state.refreshing) {
          setState({ status: connectedStatus() });
        }
      },
      onError: options.onError,
    });
  }

  function requestRefresh(groups: WorkspaceRefreshGroupsInput, reason: WorkspaceSyncReason = "manual"): boolean {
    if (disposed || !state.userId) return false;
    if (!isOnline()) {
      setState({ status: "offline" });
      return false;
    }
    scheduler.request(groups, reason);
    return true;
  }

  scheduler = createScheduler(0);
  fallback = createFallback();

  async function setSession(nextSession: WorkspaceSessionLike | null | undefined, nextCompanyId?: string | null): Promise<void> {
    if (disposed) return;
    const nextUserId = getWorkspaceUserId(nextSession);
    const normalizedCompanyId = nextCompanyId?.trim() || null;
    if (nextUserId && nextUserId === state.userId && normalizedCompanyId === state.companyId && subscription?.isActive()) {
      currentSession = nextSession || null;
      return;
    }

    const generation = ++sessionGeneration;
    const previousSubscription = subscription;
    subscription = null;
    fallback?.stop();
    scheduler.dispose();
    if (previousSubscription) await previousSubscription.stop();
    if (disposed || generation !== sessionGeneration) return;

    scheduler = createScheduler(generation);
    currentSession = nextSession || null;
    if (!nextUserId) {
      currentSession = null;
      setState({ status: "guest", userId: null, companyId: null, channelStatus: undefined, pendingGroups: [], refreshing: false, error: undefined });
      return;
    }

    setState({ status: isOnline() ? "connecting" : "offline", userId: nextUserId, companyId: normalizedCompanyId, channelStatus: undefined, pendingGroups: [], refreshing: false, error: undefined });
    subscription = subscribeToWorkspaceChanges({
      session: nextSession,
      userId: nextUserId,
      companyId: normalizedCompanyId,
      client: options.client,
      tables,
      onTableChange: (change) => {
        if (generation !== sessionGeneration) return;
        requestRefresh(change.groups, "realtime");
      },
      onStatus: (channelStatus, error) => {
        if (generation !== sessionGeneration) return;
        const nextState: Partial<WorkspaceSyncState> = {
          channelStatus,
          status: state.refreshing ? "syncing" : mapChannelStatusToSyncStatus(channelStatus, { authenticated: true, online: isOnline() }),
        };
        if (error) nextState.error = error.message;
        setState(nextState);
      },
      onError: (error) => {
        if (generation !== sessionGeneration) return;
        options.onError?.(error);
      },
    });
    fallback?.start();
    if (options.refreshOnSessionStart) requestRefresh(WORKSPACE_REFRESH_GROUPS, "session");
  }

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    sessionGeneration += 1;
    fallback?.dispose();
    fallback = null;
    scheduler.dispose();
    const currentSubscription = subscription;
    subscription = null;
    if (currentSubscription) await currentSubscription.stop();
    currentSession = null;
    listeners.clear();
  }

  return {
    setSession,
    handleSession: setSession,
    requestRefresh,
    refreshAll: (reason = "manual") => requestRefresh(WORKSPACE_REFRESH_GROUPS, reason),
    flush: () => scheduler.flush(),
    whenIdle: () => scheduler.whenIdle(),
    getState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose,
  };
}

// Keep the cache and instrumentation seams discoverable from the existing
// workspace sync entry point while leaving the scheduler/controller behavior
// above unchanged.
export * from "./workspaceLoadCache.ts";
export * from "./workspaceSyncInstrumentation.ts";
