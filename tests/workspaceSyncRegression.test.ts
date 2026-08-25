import test from "node:test";
import assert from "node:assert/strict";
import {
  WORKSPACE_REFRESH_GROUPS,
  type WorkspacePostgresChangeFilter,
  type WorkspacePostgresChangePayload,
  type WorkspaceRealtimeSubscribeStatus,
  type WorkspaceSyncChannel,
  type WorkspaceSyncClient,
  type WorkspaceSyncEnvironment,
  type WorkspaceSyncTimers,
  createWorkspaceSyncController,
  createWorkspaceSyncFallback,
  subscribeToWorkspaceChanges,
} from "../src/lib/workspaceSync.ts";

import { resolveEntityById as resolveEntityByIdFromConflict } from "../src/utils/remoteConflict.ts";

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
      const target = now + milliseconds;
      let next = [...tasks.entries()].sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
      while (next && next[1].dueAt <= target) {
        now = next[1].dueAt;
        tasks.delete(next[0]);
        next[1].callback();
        await Promise.resolve();
        next = [...tasks.entries()].sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
      }
      now = target;
      await Promise.resolve();
    },
  };
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

type FakeChannel = WorkspaceSyncChannel & {
  id: string;
  registrations: Array<{
    filter: WorkspacePostgresChangeFilter;
    callback: (payload: WorkspacePostgresChangePayload) => void;
  }>;
  subscribeCount: number;
  unsubscribeCount: number;
  emitTable: (table: string, payload?: WorkspacePostgresChangePayload) => void;
};

function createFakeChannel(id: string): FakeChannel {
  const registrations: FakeChannel["registrations"] = [];
  let statusCallback: ((status: WorkspaceRealtimeSubscribeStatus, error?: Error) => void) | undefined;
  let subscribeCount = 0;
  let unsubscribeCount = 0;

  const channel = {
    id,
    registrations,
    get subscribeCount() { return subscribeCount; },
    get unsubscribeCount() { return unsubscribeCount; },
    on(type: "postgres_changes", filter: WorkspacePostgresChangeFilter, callback: (payload: WorkspacePostgresChangePayload) => void) {
      assert.equal(type, "postgres_changes");
      registrations.push({ filter, callback });
      return channel;
    },
    subscribe(callback?: (status: WorkspaceRealtimeSubscribeStatus, error?: Error) => void) {
      subscribeCount += 1;
      statusCallback = callback;
      return channel;
    },
    unsubscribe() {
      unsubscribeCount += 1;
      return Promise.resolve();
    },
    emitTable(table: string, payload: WorkspacePostgresChangePayload = { table }) {
      for (const registration of registrations) {
        if (registration.filter.table === table) registration.callback(payload);
      }
    },
  } as FakeChannel;

  // Keep the callback seam exercised by the channel shape without exposing it
  // as part of the production API used by these tests.
  void statusCallback;
  return channel;
}

function createFakeEnvironment() {
  type Signal = "focus" | "visibility" | "online";
  let online = true;
  let visible = true;
  let focused = true;
  const handlers: Record<Signal, Set<() => void>> = {
    focus: new Set(),
    visibility: new Set(),
    online: new Set(),
  };

  const environment: WorkspaceSyncEnvironment = {
    isOnline: () => online,
    isVisible: () => visible,
    isFocused: () => focused,
    onFocus: (listener) => {
      handlers.focus.add(listener);
      return () => handlers.focus.delete(listener);
    },
    onVisibilityChange: (listener) => {
      handlers.visibility.add(listener);
      return () => handlers.visibility.delete(listener);
    },
    onOnline: (listener) => {
      handlers.online.add(listener);
      return () => handlers.online.delete(listener);
    },
  };

  return {
    environment,
    setOnline(value: boolean) { online = value; },
    setVisible(value: boolean) { visible = value; },
    setFocused(value: boolean) { focused = value; },
    emit(signal: Signal) {
      for (const handler of [...handlers[signal]]) handler();
    },
    listenerCount(signal: Signal) {
      return handlers[signal].size;
    },
  };
}

function createUserChannelClient(channels: Map<string, FakeChannel>): WorkspaceSyncClient {
  return {
    channel(name) {
      const userId = decodeURIComponent(name.slice(name.lastIndexOf(":") + 1));
      const channel = createFakeChannel(userId);
      channels.set(userId, channel);
      return channel;
    },
    removeChannel(channel) {
      return channel.unsubscribe?.();
    },
  };
}

test("does not start an authenticated subscription when the user is missing", async () => {
  const channelNames: string[] = [];
  const statuses: string[] = [];
  const subscription = subscribeToWorkspaceChanges({
    session: { user: null },
    client: {
      channel(name) {
        channelNames.push(name);
        return createFakeChannel(name);
      },
    },
    onStatus: (status) => statuses.push(status),
  });

  assert.equal(subscription.userId, null);
  assert.equal(subscription.channel, undefined);
  assert.equal(subscription.isActive(), false);
  assert.deepEqual(channelNames, []);
  assert.deepEqual(statuses, []);
  await subscription.stop();
});

test("stops the old user channel before creating the new user channel", async () => {
  const events: string[] = [];
  const channels = new Map<string, FakeChannel>();
  const removeStarted = createDeferred();
  const releaseRemove = createDeferred();
  const client: WorkspaceSyncClient = {
    channel(name) {
      const userId = decodeURIComponent(name.slice(name.lastIndexOf(":") + 1));
      events.push(`create:${userId}`);
      const channel = createFakeChannel(userId);
      channels.set(userId, channel);
      return channel;
    },
    removeChannel(channel) {
      const userId = (channel as FakeChannel).id;
      events.push(`remove:${userId}`);
      removeStarted.resolve();
      return releaseRemove.promise;
    },
  };
  const controller = createWorkspaceSyncController({
    client,
    refresh: () => undefined,
  });

  await controller.setSession({ user: { id: "user-a" } });
  const switchPromise = controller.setSession({ user: { id: "user-b" } });
  await removeStarted.promise;

  assert.deepEqual(events, ["create:user-a", "remove:user-a"]);

  releaseRemove.resolve();
  await switchPromise;
  assert.deepEqual(events, ["create:user-a", "remove:user-a", "create:user-b"]);
  await controller.dispose();
});

test("does not recreate a realtime channel for an ordinary same-scope session update", async () => {
  let created = 0;
  let removed = 0;
  const channel = createFakeChannel("same-scope");
  const controller = createWorkspaceSyncController({
    client: {
      channel() {
        created += 1;
        return channel;
      },
      removeChannel() {
        removed += 1;
        return Promise.resolve();
      },
    },
    refresh: () => undefined,
  });

  await controller.setSession({ user: { id: "user-a" } }, "company-a");
  await controller.setSession({ user: { id: "user-a" } }, "company-a");
  assert.equal(created, 1);
  assert.equal(removed, 0);

  await controller.setSession({ user: { id: "user-a" } }, "company-b");
  assert.equal(created, 2);
  assert.equal(removed, 1);
  await controller.dispose();
  assert.equal(removed, 2);
});

test("StrictMode-like fallback setup and cleanup leaves one active listener", () => {
  const timers = createFakeTimers();
  const fake = createFakeEnvironment();
  const requests: string[] = [];
  const fallback = createWorkspaceSyncFallback({
    environment: fake.environment,
    timers,
    cooldownMs: 0,
    requestRefresh: (_groups, reason) => requests.push(reason),
  });

  fallback.start();
  fallback.start();
  assert.equal(fake.listenerCount("focus"), 1);
  assert.equal(fake.listenerCount("visibility"), 1);
  assert.equal(fake.listenerCount("online"), 1);

  fake.emit("focus");
  assert.deepEqual(requests, ["focus"]);

  fallback.stop();
  assert.equal(fake.listenerCount("focus"), 0);
  assert.equal(fake.listenerCount("visibility"), 0);
  assert.equal(fake.listenerCount("online"), 0);

  fallback.start();
  fallback.start();
  assert.equal(fake.listenerCount("focus"), 1);
  fake.emit("focus");
  assert.deepEqual(requests, ["focus", "focus"]);

  fallback.dispose();
  assert.equal(fake.listenerCount("focus"), 0);
  assert.equal(fake.listenerCount("visibility"), 0);
  assert.equal(fake.listenerCount("online"), 0);
});

test("controller coalesces events received during refresh into one follow-up", async () => {
  const channel = createFakeChannel("user-1");
  const timers = createFakeTimers();
  const firstStarted = createDeferred();
  const releaseFirst = createDeferred();
  const calls: Array<{ groups: readonly string[]; reason: string; reasons: readonly string[] }> = [];
  let refreshCount = 0;
  const controller = createWorkspaceSyncController({
    client: { channel: () => channel },
    timers,
    debounceMs: 25,
    refresh: async (groups, context) => {
      refreshCount += 1;
      calls.push({ groups, reason: context.reason, reasons: context.reasons });
      if (refreshCount === 1) {
        firstStarted.resolve();
        await releaseFirst.promise;
      }
    },
  });

  await controller.setSession({ user: { id: "user-1" } });
  channel.emitTable("projects");
  const firstFlush = controller.flush();
  await firstStarted.promise;

  channel.emitTable("projects");
  channel.emitTable("invoices");
  channel.emitTable("projects");
  releaseFirst.resolve();
  await firstFlush;

  assert.equal(refreshCount, 2);
  assert.deepEqual(calls[0].groups, ["engineering"]);
  assert.deepEqual(calls[1].groups, ["engineering", "invoices"]);
  assert.equal(calls[1].reason, "realtime");
  assert.deepEqual(calls[1].reasons, ["realtime"]);
  await controller.dispose();
});

test("a hidden visibility event does not refresh until visibility returns", () => {
  const timers = createFakeTimers();
  const fake = createFakeEnvironment();
  const requests: string[] = [];
  const fallback = createWorkspaceSyncFallback({
    environment: fake.environment,
    timers,
    cooldownMs: 0,
    requestRefresh: (_groups, reason) => requests.push(reason),
  });
  fallback.start();

  fake.setVisible(false);
  fake.emit("visibility");
  assert.deepEqual(requests, []);
  assert.deepEqual(fallback.getState().pendingReasons, []);
  assert.equal(fallback.getState().scheduled, false);

  fake.setVisible(true);
  fake.emit("visibility");
  assert.deepEqual(requests, ["visibility"]);
  fallback.dispose();
});

test("going from offline to online eventually refreshes the authenticated controller", async () => {
  const timers = createFakeTimers();
  const fake = createFakeEnvironment();
  const channel = createFakeChannel("user-1");
  const calls: string[][] = [];
  const controller = createWorkspaceSyncController({
    client: { channel: () => channel },
    environment: fake.environment,
    timers,
    debounceMs: 10,
    fallbackCooldownMs: 0,
    refresh: (groups) => { calls.push([...groups]); },
  });

  fake.setOnline(false);
  await controller.setSession({ user: { id: "user-1" } });
  assert.equal(controller.getState().status, "offline");

  fake.emit("focus");
  assert.deepEqual(calls, []);
  fake.setOnline(true);
  fake.emit("online");
  assert.deepEqual(calls, []);

  await timers.advance(9);
  assert.deepEqual(calls, []);
  await timers.advance(1);
  await controller.whenIdle();
  assert.deepEqual(calls, [[...WORKSPACE_REFRESH_GROUPS]]);
  await controller.dispose();
});

test("a previous session generation cannot apply its late refresh completion", async () => {
  const timers = createFakeTimers();
  const channels = new Map<string, FakeChannel>();
  const firstStarted = createDeferred();
  const releaseFirst = createDeferred();
  let refreshCount = 0;
  const controller = createWorkspaceSyncController({
    client: createUserChannelClient(channels),
    timers,
    refresh: async () => {
      refreshCount += 1;
      if (refreshCount === 1) {
        firstStarted.resolve();
        await releaseFirst.promise;
      }
    },
  });

  await controller.setSession({ user: { id: "user-a" } });
  channels.get("user-a")?.emitTable("projects");
  const oldFlush = controller.flush();
  await firstStarted.promise;

  await controller.setSession({ user: { id: "user-b" } });
  assert.equal(controller.getState().userId, "user-b");
  assert.equal(controller.getState().lastSyncedAt, undefined);

  channels.get("user-a")?.emitTable("invoices");
  releaseFirst.resolve();
  await oldFlush;

  assert.equal(refreshCount, 1);
  assert.equal(controller.getState().userId, "user-b");
  assert.equal(controller.getState().lastSyncedAt, undefined);
  await controller.dispose();
});

test("selected route identity survives reordered refreshes by stable ID", () => {
  const routeId = "project-2";
  const snapshots = [
    [
      { id: "project-1", name: "One" },
      { id: routeId, name: "Original" },
    ],
    [
      { id: "project-99", name: "Inserted" },
      { id: routeId, name: "Updated" },
      { id: "project-1", name: "One" },
    ],
    [
      { id: "project-1", name: "One" },
      { id: "project-3", name: "Three" },
      { id: routeId, name: "Updated again" },
    ],
  ];

  const selectedRecords = snapshots.map((records) => resolveEntityByIdFromConflict(records, routeId));
  assert.deepEqual(selectedRecords.map((record) => record?.id), [routeId, routeId, routeId]);
  assert.deepEqual(selectedRecords.map((record) => record?.name), ["Original", "Updated", "Updated again"]);
  assert.notEqual(selectedRecords[0], selectedRecords[1]);
  assert.notEqual(selectedRecords[1], selectedRecords[2]);

  // Keep the conflict helper's stable-ID contract covered at the same route boundary.
  assert.equal(resolveEntityByIdFromConflict(snapshots[2], routeId)?.name, "Updated again");
});
