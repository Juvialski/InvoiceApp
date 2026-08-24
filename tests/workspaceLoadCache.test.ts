import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspaceLoadCache,
  createWorkspaceSyncInstrumentation,
  type WorkspaceSyncInstrumentationRecord,
} from "../src/lib/workspaceSync.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

const key = (companyId: string, group: "invoices" | "engineering" = "invoices") => ({
  userId: "user-1",
  companyId,
  group,
} as const);

test("deduplicates one exact user/company/group load and never crosses companies", async () => {
  const cache = createWorkspaceLoadCache<string>({ staleAfterMs: 1_000 });
  let calls = 0;
  const loader = async (requestedKey: { companyId: string | null }) => {
    calls += 1;
    return requestedKey.companyId || "no-company";
  };

  const first = cache.getOrLoad(key("company-a"), loader);
  const duplicate = cache.getOrLoad(key("company-a"), loader);
  const otherCompany = cache.getOrLoad(key("company-b"), loader);

  assert.equal(first.state, "loading");
  assert.equal(duplicate.state, "loading");
  assert.strictEqual(first.promise, duplicate.promise);
  assert.notStrictEqual(first.promise, otherCompany.promise);

  assert.deepEqual(await Promise.all([first.promise, otherCompany.promise]), ["company-a", "company-b"]);
  assert.equal(calls, 2, "same-scope loads share one in-flight promise");
  assert.equal(cache.get(key("company-a"))?.data, "company-a");
  assert.equal(cache.get(key("company-b"))?.data, "company-b");
  assert.equal(cache.get(key("company-a", "engineering")), undefined, "groups are also isolated");
});

test("serves stale data while one revalidation is in flight", async () => {
  let now = 0;
  const cache = createWorkspaceLoadCache<string>({ staleAfterMs: 10, now: () => now });
  let calls = 0;
  const initial = cache.getOrLoad(key("company-a"), () => {
    calls += 1;
    return "v1";
  });
  assert.equal(await initial.promise, "v1");

  now = 11;
  assert.equal(cache.get(key("company-a"))?.state, "stale");
  const refresh = deferred<string>();
  const staleRequest = cache.getOrLoad(key("company-a"), () => {
    calls += 1;
    return refresh.promise;
  });
  const duplicateRefresh = cache.getOrLoad(key("company-a"), () => {
    calls += 1;
    return "unexpected";
  });

  assert.equal(staleRequest.state, "stale");
  assert.equal(staleRequest.data, "v1");
  assert.equal(staleRequest.fromCache, true);
  assert.equal(staleRequest.revalidating, true);
  assert.strictEqual(staleRequest.promise, duplicateRefresh.promise);
  assert.equal(calls, 1, "revalidation loader starts on the microtask boundary");

  refresh.resolve("v2");
  assert.equal(await staleRequest.promise, "v2");
  assert.equal(calls, 2);
  assert.equal(cache.get(key("company-a"))?.state, "loaded");
  assert.equal(cache.get(key("company-a"))?.data, "v2");
});

test("invalidations isolate generations and preserve only the requested group", async () => {
  const cache = createWorkspaceLoadCache<string>({ staleAfterMs: 1_000 });
  await cache.load(key("company-a", "engineering"), () => "engineering-a");
  await cache.load(key("company-a", "invoices"), () => "invoice-a");
  await cache.load(key("company-b", "invoices"), () => "invoice-b");

  assert.equal(cache.invalidateGroup("invoices", { userId: "user-1", companyId: "company-a" }), 1);
  assert.equal(cache.get(key("company-a"))?.state, "stale");
  assert.equal(cache.get(key("company-a"))?.data, "invoice-a");
  assert.equal(cache.get(key("company-a", "engineering"))?.state, "loaded");
  assert.equal(cache.get(key("company-b"))?.state, "loaded");

  const oldValue = deferred<string>();
  const oldRequest = cache.getOrLoad(key("company-a"), () => oldValue.promise);
  assert.equal(cache.invalidateCompany({ userId: "user-1", companyId: "company-a" }), 2, "company invalidation discards every group in that exact scope");
  const newValue = deferred<string>();
  const newRequest = cache.getOrLoad(key("company-a"), () => newValue.promise);

  oldValue.resolve("old-generation");
  assert.equal(await oldRequest.promise, "old-generation");
  assert.equal(cache.get(key("company-a"))?.state, "loading", "late invalidated data cannot overwrite a new generation");

  newValue.resolve("new-generation");
  assert.equal(await newRequest.promise, "new-generation");
  assert.equal(cache.get(key("company-a"))?.data, "new-generation");
  assert.equal(cache.get(key("company-b"))?.data, "invoice-b");
});

test("keeps the cache bounded with LRU eviction and ignores an evicted completion", async () => {
  const cache = createWorkspaceLoadCache<string>({ maxEntries: 2, staleAfterMs: 1_000 });
  await cache.load(key("company-a"), () => "a");
  await cache.load(key("company-b"), () => "b");
  assert.equal(cache.maxEntries(), 2);

  // Make company A the most recently used entry so company B is evicted.
  assert.equal(cache.get(key("company-a"))?.data, "a");
  await cache.load(key("company-c"), () => "c");
  assert.equal(cache.size(), 2);
  assert.equal(cache.get(key("company-b")), undefined);
  assert.equal(cache.get(key("company-a"))?.data, "a");
  assert.equal(cache.get(key("company-c"))?.data, "c");

  const bounded = createWorkspaceLoadCache<string>({ maxEntries: 1, staleAfterMs: 1_000 });
  const pending = deferred<string>();
  const evicted = bounded.getOrLoad(key("company-a"), () => pending.promise);
  await bounded.load(key("company-b"), () => "b");
  assert.equal(bounded.size(), 1);
  pending.resolve("late-a");
  await evicted.promise;
  assert.equal(bounded.get(key("company-a")), undefined, "evicted promise completion cannot repopulate the cache");
  assert.equal(bounded.get(key("company-b"))?.data, "b");
});

test("emits the six named instrumentation events only when enabled", () => {
  const records: WorkspaceSyncInstrumentationRecord[] = [];
  const instrumentation = createWorkspaceSyncInstrumentation({
    enabled: true,
    now: () => 123,
    onEvent: (record) => records.push(record),
  });

  instrumentation.fullLoad({ userId: "user-1", companyId: "company-a" });
  instrumentation.groupRefresh({ group: "invoices", reason: "realtime" });
  instrumentation.accessRefresh({ userId: "user-1" });
  instrumentation.syncRecreation({ generation: 2 });
  instrumentation.companyChange({ previousCompanyId: "company-a", companyId: "company-b" });
  instrumentation.authSession({ reason: "SIGNED_IN" });

  assert.deepEqual(records.map((record) => record.event), [
    "FULL_LOAD",
    "GROUP_REFRESH",
    "ACCESS_REFRESH",
    "SYNC_RECREATION",
    "COMPANY_CHANGE",
    "AUTH_SESSION",
  ]);
  assert.equal(records[0].at, 123);
  assert.equal(records[1].details.group, "invoices");
  assert.ok(Object.isFrozen(records[1].details));

  const disabledRecords: WorkspaceSyncInstrumentationRecord[] = [];
  const disabled = createWorkspaceSyncInstrumentation({ enabled: false, onEvent: (record) => disabledRecords.push(record) });
  disabled.emit("FULL_LOAD");
  disabled.companyChange({ companyId: "company-b" });
  assert.equal(disabled.enabled, false);
  assert.deepEqual(disabledRecords, [], "disabled instrumentation is silent");
});

test("defaults to silent instrumentation in a production Node environment", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const records: WorkspaceSyncInstrumentationRecord[] = [];
    const instrumentation = createWorkspaceSyncInstrumentation({ onEvent: (record) => records.push(record) });
    instrumentation.fullLoad();
    assert.equal(instrumentation.enabled, false);
    assert.deepEqual(records, []);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});
