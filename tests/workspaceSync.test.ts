import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import {
  WORKSPACE_REFRESH_GROUPS,
  WORKSPACE_REFRESH_TABLES,
  WORKSPACE_SYNCED_TABLES,
  type WorkspacePostgresChangeFilter,
  type WorkspacePostgresChangePayload,
  type WorkspaceRealtimeSubscribeStatus,
  type WorkspaceSyncChannel,
  type WorkspaceSyncEnvironment,
  type WorkspaceSyncTimers,
  createWorkspaceSyncController,
  createWorkspaceSyncFallback,
  createWorkspaceSyncScheduler,
  getWorkspaceUserId,
  mapChannelStatusToSyncStatus,
  refreshGroupsForTable,
  subscribeToWorkspaceChanges,
} from "../src/lib/workspaceSync.ts";

function createFakeTimers(): WorkspaceSyncTimers & { advance: (milliseconds: number) => Promise<void> } {
  let now = 0;
  let nextHandle = 0;
  const tasks = new Map<number, { dueAt: number; callback: () => void }>();
  return {
    now: () => now,
    setTimeout: (callback, delayMs) => {
      const handle = ++nextHandle;
      tasks.set(handle, { dueAt: now + delayMs, callback });
      return handle;
    },
    clearTimeout: (handle) => {
      tasks.delete(Number(handle));
    },
    advance: async (milliseconds) => {
      now += milliseconds;
      let next = [...tasks.entries()].sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
      while (next && next[1].dueAt <= now) {
        tasks.delete(next[0]);
        next[1].callback();
        await Promise.resolve();
        next = [...tasks.entries()].sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
      }
    },
  };
}

function createFakeChannel() {
  const registrations: Array<{
    filter: WorkspacePostgresChangeFilter;
    callback: (payload: WorkspacePostgresChangePayload) => void;
  }> = [];
  let statusCallback: ((status: WorkspaceRealtimeSubscribeStatus, error?: Error) => void) | undefined;
  let unsubscribeCount = 0;
  const channel = {
    registrations,
    get unsubscribeCount() { return unsubscribeCount; },
    on(type: "postgres_changes", filter: WorkspacePostgresChangeFilter, callback: (payload: WorkspacePostgresChangePayload) => void) {
      assert.equal(type, "postgres_changes");
      registrations.push({ filter, callback });
      return channel;
    },
    subscribe(callback?: (status: WorkspaceRealtimeSubscribeStatus, error?: Error) => void) {
      statusCallback = callback;
      return channel;
    },
    unsubscribe() {
      unsubscribeCount += 1;
      return Promise.resolve("ok");
    },
    emitStatus(status: WorkspaceRealtimeSubscribeStatus, error?: Error) {
      statusCallback?.(status, error);
    },
    emitTable(table: string, payload: WorkspacePostgresChangePayload = { table }) {
      for (const registration of registrations) {
        if (registration.filter.table === table) registration.callback(payload);
      }
    },
  } as WorkspaceSyncChannel & {
    registrations: typeof registrations;
    unsubscribeCount: number;
    emitStatus: (status: WorkspaceRealtimeSubscribeStatus, error?: Error) => void;
    emitTable: (table: string, payload?: WorkspacePostgresChangePayload) => void;
  };
  return channel;
}

function createFakeEnvironment() {
  let online = true;
  let visible = true;
  let focused = true;
  const handlers: Record<"focus" | "visibility" | "online", Array<() => void>> = {
    focus: [],
    visibility: [],
    online: [],
  };
  const environment: WorkspaceSyncEnvironment = {
    isOnline: () => online,
    isVisible: () => visible,
    isFocused: () => focused,
    onFocus: (listener) => { handlers.focus.push(listener); return () => { handlers.focus = handlers.focus.filter((item) => item !== listener); }; },
    onVisibilityChange: (listener) => { handlers.visibility.push(listener); return () => { handlers.visibility = handlers.visibility.filter((item) => item !== listener); }; },
    onOnline: (listener) => { handlers.online.push(listener); return () => { handlers.online = handlers.online.filter((item) => item !== listener); }; },
  };
  return {
    environment,
    handlers,
    setOnline(value: boolean) { online = value; },
    setVisible(value: boolean) { visible = value; },
    setFocused(value: boolean) { focused = value; },
  };
}

test("maps persisted schema tables to bounded refresh groups", () => {
  assert.deepEqual(refreshGroupsForTable("invoice_project_allocations"), ["invoices", "engineering"]);
  assert.deepEqual(refreshGroupsForTable("invoice_extractions"), ["invoices"]);
  assert.deepEqual(refreshGroupsForTable("unknown_table"), []);
  assert.equal(new Set(WORKSPACE_SYNCED_TABLES).size, WORKSPACE_SYNCED_TABLES.length);
  for (const table of WORKSPACE_SYNCED_TABLES) assert.ok(refreshGroupsForTable(table).length > 0, table);
  for (const group of WORKSPACE_REFRESH_GROUPS) assert.ok(WORKSPACE_REFRESH_TABLES[group].length > 0, group);
  assert.equal(getWorkspaceUserId({ user: { id: " user-1 " } }), "user-1");
  assert.equal(getWorkspaceUserId(null), null);
  assert.equal(mapChannelStatusToSyncStatus(undefined), "guest");
  assert.equal(mapChannelStatusToSyncStatus("SUBSCRIBED", { authenticated: true }), "synced");
  assert.equal(mapChannelStatusToSyncStatus("CHANNEL_ERROR", { authenticated: true }), "degraded");
  assert.equal(mapChannelStatusToSyncStatus("SUBSCRIBED", { authenticated: true, online: false }), "offline");
});

test("subscribes every mapped table on one authenticated channel and cleans up late events", async () => {
  const channel = createFakeChannel();
  const channelNames: string[] = [];
  const removed: WorkspaceSyncChannel[] = [];
  const changes: Array<{ table: string; groups: readonly string[] }> = [];
  const subscription = subscribeToWorkspaceChanges({
    session: { user: { id: "user-1" } },
    client: {
      channel(name) {
        channelNames.push(name);
        return channel;
      },
      removeChannel(value) {
        removed.push(value);
        return Promise.resolve("ok");
      },
    },
    onTableChange: (change) => changes.push({ table: change.table, groups: change.groups }),
  });

  assert.equal(channelNames.length, 1);
  assert.equal(channel.registrations.length, WORKSPACE_SYNCED_TABLES.length);
  assert.ok(channel.registrations.every((registration) => registration.filter.filter === "user_id=eq.user-1"));
  assert.equal(new Set(channel.registrations.map((registration) => registration.filter.table)).size, WORKSPACE_SYNCED_TABLES.length);
  channel.emitStatus("SUBSCRIBED");
  channel.emitTable("invoice_extractions");
  assert.deepEqual(changes, [{ table: "invoice_extractions", groups: ["invoices"] }]);

  await subscription.stop();
  await subscription.stop();
  assert.equal(removed.length, 1);
  assert.equal(channel.unsubscribeCount, 0, "client.removeChannel owns channel cleanup when provided");
  channel.emitTable("source_documents");
  assert.equal(changes.length, 1, "late events after cleanup are ignored");
});

test("coalesces bursts and emits exactly one follow-up after an active refresh", async () => {
  const timers = createFakeTimers();
  const calls: Array<{ groups: readonly string[]; reason: string }> = [];
  let active = 0;
  let maxActive = 0;
  let releaseFirst!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    const originalResolve = resolve;
    releaseFirst = originalResolve as unknown as () => void;
  });
  let first = true;
  const scheduler = createWorkspaceSyncScheduler({
    debounceMs: 50,
    timers,
    refresh: async (groups, context) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      calls.push({ groups, reason: context.reason });
      if (first) {
        first = false;
        releaseFirst();
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      active -= 1;
    },
  });

  scheduler.request("invoices", "realtime");
  scheduler.request(["engineering", "invoices"], "manual");
  assert.equal(calls.length, 0, "debounce holds the burst");

  const firstFlush = scheduler.flush();
  await firstStarted;
  scheduler.request(["payroll", "gmail"], "realtime");
  scheduler.request("payroll-imports", "realtime");
  releaseFirst();
  await firstFlush;

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].groups, ["invoices", "engineering"]);
  assert.equal(calls[0].reason, "coalesced");
  assert.deepEqual(calls[1].groups, ["payroll", "gmail", "payroll-imports"]);
  assert.equal(maxActive, 1, "refreshes never overlap");
});

test("focus, visibility, and online fallbacks respect cooldown and coalesce", async () => {
  const timers = createFakeTimers();
  const fake = createFakeEnvironment();
  const requests: Array<{ groups: readonly string[]; reason: string }> = [];
  const fallback = createWorkspaceSyncFallback({
    environment: fake.environment,
    timers,
    cooldownMs: 100,
    requestRefresh: (groups, reason) => requests.push({ groups, reason }),
  });
  fallback.start();

  for (const handler of fake.handlers.focus) handler();
  for (const handler of fake.handlers.visibility) handler();
  for (const handler of fake.handlers.online) handler();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].reason, "focus");

  await timers.advance(100);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].reason, "coalesced");
  assert.deepEqual(requests[1].groups, [...WORKSPACE_REFRESH_GROUPS]);

  fake.setOnline(false);
  for (const handler of fake.handlers.focus) handler();
  assert.equal(requests.length, 2, "offline focus does not refresh");
  fake.setOnline(true);
  for (const handler of fake.handlers.online) handler();
  await timers.advance(100);
  assert.equal(requests.length, 3);

  fallback.stop();
  for (const handler of fake.handlers.focus) handler();
  assert.equal(requests.length, 3, "stopped fallback removes listeners");
});

test("controller maps session/channel lifecycle and ignores events after sign-out", async () => {
  const timers = createFakeTimers();
  const fake = createFakeEnvironment();
  const channel = createFakeChannel();
  const refreshed: string[][] = [];
  const controller = createWorkspaceSyncController({
    client: { channel: () => channel, removeChannel: () => Promise.resolve("ok") },
    environment: fake.environment,
    timers,
    debounceMs: 25,
    refresh: async (groups) => { refreshed.push([...groups]); },
  });

  await controller.setSession({ user: { id: "user-1" } });
  assert.equal(controller.getState().status, "connecting");
  channel.emitStatus("SUBSCRIBED");
  assert.equal(controller.getState().status, "synced");
  channel.emitTable("invoice_project_allocations");
  await controller.flush();
  assert.deepEqual(refreshed, [["invoices", "engineering"]]);

  await controller.setSession(null);
  assert.equal(controller.getState().status, "guest");
  channel.emitStatus("CHANNEL_ERROR", new Error("late"));
  channel.emitTable("projects");
  await controller.flush();
  assert.deepEqual(refreshed, [["invoices", "engineering"]]);
  await controller.dispose();
});

test("realtime migration is additive, ordered, and covers only mapped persisted tables", () => {
  const realtimeUrls = [
    new URL("../supabase/migrations/20260823180000_workspace_sync_realtime.sql", import.meta.url),
    new URL("../supabase/migrations/20260823192000_payroll_automation_realtime.sql", import.meta.url),
    new URL("../supabase/migrations/20260826122000_cash_banking_realtime.sql", import.meta.url),
    new URL("../supabase/migrations/20260903232024_client_billing_realtime.sql", import.meta.url),
    new URL("../supabase/migrations/20260904120000_p2_p3_integration_realtime_parity.sql", import.meta.url),
  ];
  const scheduleUrl = new URL("../supabase/migrations/20260823190000_payroll_schedule_domain.sql", import.meta.url);
  const realtimeSql = realtimeUrls.map((migrationUrl) => readFileSync(migrationUrl, "utf8")).join("\n");
  const sql = `${realtimeSql}\n${readFileSync(scheduleUrl, "utf8")}`;
  for (const table of WORKSPACE_SYNCED_TABLES) assert.match(sql, new RegExp(`'${table}'`));
  assert.match(realtimeSql, /alter publication supabase_realtime add table/);
  assert.doesNotMatch(realtimeSql, /create publication\s+supabase_realtime/i);
  assert.doesNotMatch(realtimeSql, /alter table\s+/i);
  assert.doesNotMatch(realtimeSql, /create policy\s+/i);
});
