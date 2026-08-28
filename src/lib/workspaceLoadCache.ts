import type { WorkspaceRefreshGroup } from "./workspaceSync.ts";

/** The default number of user/company/group entries retained in memory. */
export const DEFAULT_WORKSPACE_LOAD_CACHE_MAX_ENTRIES = 32;

/** A loaded value becomes eligible for stale-while-revalidate after this delay. */
export const DEFAULT_WORKSPACE_LOAD_CACHE_STALE_AFTER_MS = 30_000;

export type WorkspaceLoadState = "loading" | "loaded" | "stale";

/**
 * The only addressable cache key. `companyId: null` is deliberately distinct
 * from every concrete company and is never used as a wildcard.
 */
export interface WorkspaceLoadCacheKey<Group extends string = WorkspaceRefreshGroup> {
  readonly userId: string;
  readonly companyId: string | null;
  readonly group: Group;
}

export interface WorkspaceLoadCacheKeyInput<Group extends string = WorkspaceRefreshGroup> {
  userId: string;
  companyId?: string | null;
  group: Group;
}

/** Optional filters used by group invalidation. Omitted fields are wildcards. */
export interface WorkspaceLoadCacheScope {
  userId?: string;
  companyId?: string | null;
}

export interface WorkspaceLoadCompanyScope {
  userId: string;
  companyId: string | null;
}

export interface WorkspaceLoadCacheSnapshot<T, Group extends string = WorkspaceRefreshGroup> {
  readonly key: WorkspaceLoadCacheKey<Group>;
  readonly state: WorkspaceLoadState;
  readonly hasData: boolean;
  readonly data?: T;
  readonly promise?: Promise<T>;
  /** Changes whenever this key is loaded or invalidated. */
  readonly generation: number;
  readonly loadedAt?: number;
  readonly staleAt?: number;
  readonly lastAccessedAt: number;
  readonly error?: unknown;
}

export interface WorkspaceLoadRequest<T, Group extends string = WorkspaceRefreshGroup>
  extends WorkspaceLoadCacheSnapshot<T, Group> {
  readonly promise: Promise<T>;
  /** True when the request has usable cached data, including stale data. */
  readonly fromCache: boolean;
  /** True when stale cached data is being refreshed in the background. */
  readonly revalidating: boolean;
}

export type WorkspaceLoadLoader<T, Group extends string = WorkspaceRefreshGroup> = (
  key: Readonly<WorkspaceLoadCacheKey<Group>>,
) => PromiseLike<T> | T;

export interface WorkspaceLoadRequestOptions {
  /** Start a new load even when a fresh value is already cached. */
  force?: boolean;
}

export interface WorkspaceLoadCacheInvalidationOptions {
  /** Drop data instead of retaining it as stale for a later SWR load. */
  discard?: boolean;
}

export interface WorkspaceLoadCacheOptions {
  /** Maximum number of exact user/company/group entries retained in memory. */
  maxEntries?: number;
  /** Age after which a loaded value is reported as stale. */
  staleAfterMs?: number;
  now?: () => number;
}

export interface WorkspaceLoadCache<T, Group extends string = WorkspaceRefreshGroup> {
  /** Read a point-in-time snapshot without invoking a loader. */
  get: (key: WorkspaceLoadCacheKeyInput<Group>) => WorkspaceLoadCacheSnapshot<T, Group> | undefined;
  /** Return a deduplicated request and expose stale data while it revalidates. */
  getOrLoad: (
    key: WorkspaceLoadCacheKeyInput<Group>,
    loader: WorkspaceLoadLoader<T, Group>,
    options?: WorkspaceLoadRequestOptions,
  ) => WorkspaceLoadRequest<T, Group>;
  /** Promise-oriented form of getOrLoad for callers that only need the value. */
  load: (
    key: WorkspaceLoadCacheKeyInput<Group>,
    loader: WorkspaceLoadLoader<T, Group>,
    options?: WorkspaceLoadRequestOptions,
  ) => Promise<T>;
  /** Mark matching group entries stale, or discard them when requested. */
  invalidateGroup: (
    group: Group,
    scope?: WorkspaceLoadCacheScope,
    options?: WorkspaceLoadCacheInvalidationOptions,
  ) => number;
  /** Discard every group entry for one exact user/company scope. */
  invalidateCompany: (scope: WorkspaceLoadCompanyScope) => number;
  /** Discard all entries. */
  clear: () => void;
  /** Number of entries currently retained. */
  size: () => number;
  /** Configured entry bound, useful for diagnostics and tests. */
  maxEntries: () => number;
}

interface WorkspaceLoadCacheEntry<T, Group extends string> {
  readonly id: string;
  readonly key: WorkspaceLoadCacheKey<Group>;
  state: WorkspaceLoadState;
  hasData: boolean;
  data?: T;
  promise?: Promise<T>;
  generation: number;
  loadedAt?: number;
  staleAt?: number;
  lastAccessedAt: number;
  accessSequence: number;
  error?: unknown;
}

function normalizeUserId(value: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("Workspace load cache keys require a non-empty userId.");
  }
  return value.trim();
}

function normalizeCompanyId(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new TypeError("Workspace load cache companyId must be a string or null.");
  }
  const normalized = value.trim();
  return normalized || null;
}

function normalizeGroup<Group extends string>(value: Group): Group {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("Workspace load cache keys require a non-empty group.");
  }
  return value.trim() as Group;
}

function normalizeKey<Group extends string>(input: WorkspaceLoadCacheKeyInput<Group>): WorkspaceLoadCacheKey<Group> {
  if (!input || typeof input !== "object") {
    throw new TypeError("Workspace load cache keys are required.");
  }
  return Object.freeze({
    userId: normalizeUserId(input.userId),
    companyId: normalizeCompanyId(input.companyId),
    group: normalizeGroup(input.group),
  });
}

function keyId<Group extends string>(key: WorkspaceLoadCacheKey<Group>): string {
  // JSON encoding avoids delimiter collisions in user, company, or group IDs.
  return JSON.stringify([key.userId, key.companyId, key.group]);
}

function normalizeScope(scope: WorkspaceLoadCacheScope | undefined): WorkspaceLoadCacheScope {
  if (!scope) return {};
  return {
    ...(scope.userId === undefined ? {} : { userId: normalizeUserId(scope.userId) }),
    ...(scope.companyId === undefined ? {} : { companyId: normalizeCompanyId(scope.companyId) }),
  };
}

function matchesScope<Group extends string>(
  key: WorkspaceLoadCacheKey<Group>,
  scope: WorkspaceLoadCacheScope,
): boolean {
  if (scope.userId !== undefined && key.userId !== scope.userId) return false;
  if (scope.companyId !== undefined && key.companyId !== scope.companyId) return false;
  return true;
}

function normalizedStaleAfterMs(value: number | undefined): number {
  if (value === Number.POSITIVE_INFINITY) return value;
  if (value === undefined || Number.isNaN(value)) return DEFAULT_WORKSPACE_LOAD_CACHE_STALE_AFTER_MS;
  return Math.max(0, value);
}

function normalizedMaxEntries(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_WORKSPACE_LOAD_CACHE_MAX_ENTRIES;
  return Math.max(1, Math.floor(value));
}

/**
 * Create a bounded, exact-scope in-memory loader cache.
 *
 * The cache never searches by group alone: every read and load is addressed by
 * normalized user ID, company ID (including null), and group. This makes a
 * deployment identity transition a different key even when an older request is still pending.
 * Generation and entry-identity checks also prevent late completions from an
 * invalidated or evicted request from repopulating the cache.
 */
export function createWorkspaceLoadCache<T, Group extends string = WorkspaceRefreshGroup>(
  options: WorkspaceLoadCacheOptions = {},
): WorkspaceLoadCache<T, Group> {
  const entries = new Map<string, WorkspaceLoadCacheEntry<T, Group>>();
  const now = options.now || (() => Date.now());
  const maxEntries = normalizedMaxEntries(options.maxEntries);
  const staleAfterMs = normalizedStaleAfterMs(options.staleAfterMs);
  let accessSequence = 0;
  let generationSequence = 0;

  function nextGeneration(): number {
    generationSequence += 1;
    return generationSequence;
  }

  function touch(entry: WorkspaceLoadCacheEntry<T, Group>) {
    entry.accessSequence = ++accessSequence;
    entry.lastAccessedAt = now();
  }

  function markExpired(entry: WorkspaceLoadCacheEntry<T, Group>, timestamp = now()) {
    if (entry.state === "loaded" && entry.staleAt !== undefined && timestamp >= entry.staleAt) {
      entry.state = "stale";
    }
  }

  function snapshot(entry: WorkspaceLoadCacheEntry<T, Group>): WorkspaceLoadCacheSnapshot<T, Group> {
    return Object.freeze({
      key: entry.key,
      state: entry.state,
      hasData: entry.hasData,
      ...(entry.hasData ? { data: entry.data } : {}),
      ...(entry.promise ? { promise: entry.promise } : {}),
      generation: entry.generation,
      ...(entry.loadedAt === undefined ? {} : { loadedAt: entry.loadedAt }),
      ...(entry.staleAt === undefined ? {} : { staleAt: entry.staleAt }),
      lastAccessedAt: entry.lastAccessedAt,
      ...(entry.error === undefined ? {} : { error: entry.error }),
    });
  }

  function trim() {
    while (entries.size > maxEntries) {
      let oldest: WorkspaceLoadCacheEntry<T, Group> | undefined;
      for (const entry of entries.values()) {
        if (!oldest || entry.accessSequence < oldest.accessSequence) oldest = entry;
      }
      if (!oldest) return;
      // Pending entries may be evicted to preserve the hard memory bound. The
      // identity check in the completion path makes their late result harmless.
      entries.delete(oldest.id);
    }
  }

  function createEntry(key: WorkspaceLoadCacheKey<Group>): WorkspaceLoadCacheEntry<T, Group> {
    const entry: WorkspaceLoadCacheEntry<T, Group> = {
      id: keyId(key),
      key,
      state: "loading",
      hasData: false,
      generation: nextGeneration(),
      lastAccessedAt: now(),
      accessSequence: ++accessSequence,
    };
    entries.set(entry.id, entry);
    trim();
    return entry;
  }

  function startLoad(
    entry: WorkspaceLoadCacheEntry<T, Group>,
    loader: WorkspaceLoadLoader<T, Group>,
  ): Promise<T> {
    const generation = nextGeneration();
    entry.generation = generation;
    entry.state = entry.hasData ? "stale" : "loading";
    entry.error = undefined;
    touch(entry);

    const promise = Promise.resolve()
      .then(() => loader(entry.key))
      .then(
        (data) => {
          if (entries.get(entry.id) === entry && entry.generation === generation) {
            const completedAt = now();
            entry.data = data;
            entry.hasData = true;
            entry.state = "loaded";
            entry.loadedAt = completedAt;
            entry.staleAt = staleAfterMs === Number.POSITIVE_INFINITY
              ? Number.POSITIVE_INFINITY
              : completedAt + staleAfterMs;
            entry.promise = undefined;
            entry.error = undefined;
            touch(entry);
            trim();
          }
          return data;
        },
        (error: unknown) => {
          if (entries.get(entry.id) === entry && entry.generation === generation) {
            entry.promise = undefined;
            entry.error = error;
            if (entry.hasData) {
              entry.state = "stale";
              entry.staleAt = now();
              touch(entry);
            } else {
              entries.delete(entry.id);
            }
          }
          throw error;
        },
      );
    entry.promise = promise;
    trim();
    return promise;
  }

  function get(keyInput: WorkspaceLoadCacheKeyInput<Group>): WorkspaceLoadCacheSnapshot<T, Group> | undefined {
    const id = keyId(normalizeKey(keyInput));
    const entry = entries.get(id);
    if (!entry) return undefined;
    markExpired(entry);
    touch(entry);
    return snapshot(entry);
  }

  function getOrLoad(
    keyInput: WorkspaceLoadCacheKeyInput<Group>,
    loader: WorkspaceLoadLoader<T, Group>,
    requestOptions: WorkspaceLoadRequestOptions = {},
  ): WorkspaceLoadRequest<T, Group> {
    if (typeof loader !== "function") throw new TypeError("A workspace load cache loader is required.");
    const key = normalizeKey(keyInput);
    const id = keyId(key);
    let entry = entries.get(id);
    if (entry) {
      markExpired(entry);
      touch(entry);
    } else {
      entry = createEntry(key);
    }

    const hadCachedData = entry.hasData;
    if (entry.promise) {
      const current = snapshot(entry);
      return Object.freeze({
        ...current,
        promise: entry.promise,
        fromCache: hadCachedData,
        revalidating: hadCachedData && entry.state === "stale",
      });
    }

    const isFresh = entry.state === "loaded" && entry.hasData;
    if (isFresh && !requestOptions.force) {
      const resolved = Promise.resolve(entry.data as T);
      const current = snapshot(entry);
      return Object.freeze({
        ...current,
        promise: resolved,
        fromCache: true,
        revalidating: false,
      });
    }

    const promise = startLoad(entry, loader);
    const current = snapshot(entry);
    return Object.freeze({
      ...current,
      promise,
      fromCache: hadCachedData,
      revalidating: hadCachedData,
    });
  }

  function invalidateGroup(
    group: Group,
    scopeInput: WorkspaceLoadCacheScope = {},
    invalidationOptions: WorkspaceLoadCacheInvalidationOptions = {},
  ): number {
    const normalizedGroup = normalizeGroup(group);
    const normalizedScope = normalizeScope(scopeInput);
    let invalidated = 0;
    for (const entry of [...entries.values()]) {
      if (entry.key.group !== normalizedGroup || !matchesScope(entry.key, normalizedScope)) continue;
      invalidated += 1;
      entry.generation = nextGeneration();
      entry.promise = undefined;
      entry.error = undefined;
      if (invalidationOptions.discard || !entry.hasData) {
        entries.delete(entry.id);
      } else {
        entry.state = "stale";
        entry.staleAt = now();
        touch(entry);
      }
    }
    return invalidated;
  }

  function invalidateCompany(scope: WorkspaceLoadCompanyScope): number {
    const normalizedScope = normalizeScope(scope);
    if (normalizedScope.userId === undefined || normalizedScope.companyId === undefined) {
      throw new TypeError("invalidateCompany requires an exact userId and companyId scope.");
    }
    let invalidated = 0;
    for (const entry of [...entries.values()]) {
      if (!matchesScope(entry.key, normalizedScope)) continue;
      invalidated += 1;
      entry.generation = nextGeneration();
      entries.delete(entry.id);
    }
    return invalidated;
  }

  function clear() {
    if (!entries.size) return;
    generationSequence += entries.size;
    entries.clear();
  }

  return {
    get,
    getOrLoad,
    load: (key, loader, requestOptions) => getOrLoad(key, loader, requestOptions).promise,
    invalidateGroup,
    invalidateCompany,
    clear,
    size: () => entries.size,
    maxEntries: () => maxEntries,
  };
}
