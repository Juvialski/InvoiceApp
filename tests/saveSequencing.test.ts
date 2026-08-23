import test from "node:test";
import assert from "node:assert/strict";
import { enqueueSerializedSave } from "../src/utils/saveSequencing.ts";

test("queued saves compare against the latest successful persisted state", async () => {
  const queues = new Map<string, Promise<unknown>>();
  const persisted = new Map<string, string>([["invoice-1", "A"]]);
  const previousValues: Array<string | undefined> = [];
  let releaseB!: () => void;
  const bStarted = new Promise<void>((resolve) => { releaseB = resolve; });

  const saveB = enqueueSerializedSave(queues, persisted, "invoice-1", async (previous) => {
    previousValues.push(previous);
    await bStarted;
    return "B";
  });
  const saveC = enqueueSerializedSave(queues, persisted, "invoice-1", async (previous) => {
    previousValues.push(previous);
    return "C";
  });

  await Promise.resolve();
  releaseB();
  await Promise.all([saveB, saveC]);
  assert.deepEqual(previousValues, ["A", "B"]);
  assert.equal(persisted.get("invoice-1"), "C");
});

test("failed saves do not advance persisted state and later saves can retry", async () => {
  const queues = new Map<string, Promise<unknown>>();
  const persisted = new Map<string, string>([["invoice-1", "A"]]);
  await assert.rejects(() => enqueueSerializedSave(queues, persisted, "invoice-1", async () => { throw new Error("offline"); }));
  assert.equal(persisted.get("invoice-1"), "A");
  const retry = await enqueueSerializedSave(queues, persisted, "invoice-1", async (previous) => `${previous}-retry`);
  assert.equal(retry, "A-retry");
  assert.equal(persisted.get("invoice-1"), "A-retry");
});

