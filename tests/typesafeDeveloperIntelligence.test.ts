import assert from "node:assert/strict";
import test from "node:test";
import {
  hasTypeSafeApiKey,
  sanitizeTypeSafePayload,
} from "../scripts/developer-intelligence/typesafe/sanitize.ts";
import {
  invokeTypeSafe,
  type TypeSafeGateway,
} from "../scripts/developer-intelligence/typesafe/client.ts";
import { runTypeSafeDoctor } from "../scripts/developer-intelligence/typesafe/doctor.ts";

function mockGateway(response: unknown, onRequest?: (request: unknown) => void): TypeSafeGateway {
  return {
    systemOne: async (request) => {
      onRequest?.(request);
      return response;
    },
  };
}

test("TypeSafe key presence is boolean-only and ignores blank values", () => {
  assert.equal(hasTypeSafeApiKey({ TYPESAFE_API_KEY: "ts-test-only" }), true);
  assert.equal(hasTypeSafeApiKey({ TYPESAFE_API_KEY: "   " }), false);
  assert.equal(hasTypeSafeApiKey({}), false);
});

test("sanitizer rejects secret-like paths and credential patterns", () => {
  assert.equal(sanitizeTypeSafePayload({ path: ".env", value: "synthetic" }).ok, false);
  assert.equal(sanitizeTypeSafePayload({ path: "src/safe.ts", value: "DATABASE_URL=postgres://user:secret@host/db" }).ok, false);
  assert.equal(sanitizeTypeSafePayload({ path: "src/safe.ts", value: "Authorization: Bearer synthetic-token" }).ok, false);
});

test("sanitizer accepts bounded synthetic metadata and rejects oversized payloads", () => {
  const safe = sanitizeTypeSafePayload({ task: "synthetic", candidates: [{ id: "a", path: "src/a.ts" }] });
  assert.equal(safe.ok, true);
  assert.equal(sanitizeTypeSafePayload({ text: "x".repeat(20_001) }).ok, false);
});

test("adapter parses a typed response without forwarding environment values", async () => {
  let captured: unknown;
  const result = await invokeTypeSafe<{ answers: { category: { choice: string } } }>(
    {
      state: { task: "synthetic connectivity check" },
      questions: { category: { type: "choice", criteria: { ui: null, unknown: null } } },
    },
    {
      env: { TYPESAFE_API_KEY: "ts-test-only" },
      gateway: mockGateway({ answers: { category: { choice: "unknown" } } }, (request) => { captured = request; }),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.answers.category.choice, "unknown");
  assert.equal(JSON.stringify(captured).includes("ts-test-only"), false);
  assert.equal(result.diagnostic.fallbackReason, undefined);
});

test("adapter falls back without a key or gateway", async () => {
  const result = await invokeTypeSafe({ state: { task: "synthetic" }, questions: { category: { type: "choice", criteria: { unknown: null } } } }, { env: {} });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.fallbackReason, "missing-api-key");
});

test("adapter falls back on sanitizer rejection before calling the gateway", async () => {
  let calls = 0;
  const result = await invokeTypeSafe(
    { state: { text: "DATABASE_URL=postgres://synthetic" }, questions: { category: { type: "choice", criteria: { unknown: null } } } },
    { env: { TYPESAFE_API_KEY: "ts-test-only" }, gateway: mockGateway({}, () => { calls += 1; }) },
  );
  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.fallbackReason, "sanitizer-rejected");
  assert.equal(calls, 0);
});

test("adapter falls back on API failure and invalid response without raw error text", async () => {
  const failed = await invokeTypeSafe(
    { state: { task: "synthetic" }, questions: { category: { type: "choice", criteria: { unknown: null } } } },
    {
      env: { TYPESAFE_API_KEY: "ts-test-only" },
      gateway: { systemOne: async () => { throw new Error("secret-bearing simulated failure"); } },
    },
  );
  assert.equal(failed.ok, false);
  assert.equal(failed.diagnostic.fallbackReason, "api-error");
  assert.doesNotMatch(JSON.stringify(failed), /secret-bearing/);

  const invalid = await invokeTypeSafe(
    { state: { task: "synthetic" }, questions: { category: { type: "choice", criteria: { unknown: null } } } },
    { env: { TYPESAFE_API_KEY: "ts-test-only" }, gateway: mockGateway({ answers: {} }) },
  );
  assert.equal(invalid.ok, false);
  assert.equal(invalid.diagnostic.fallbackReason, "invalid-response");
});

test("adapter falls back on a bounded timeout", async () => {
  const result = await invokeTypeSafe(
    { state: { task: "synthetic" }, questions: { category: { type: "choice", criteria: { unknown: null } } } },
    {
      env: { TYPESAFE_API_KEY: "ts-test-only" },
      timeoutMs: 5,
      gateway: { systemOne: async () => new Promise(() => {}) },
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.fallbackReason, "timeout");
});

test("doctor reports configuration without making a request when live mode is disabled", async () => {
  let calls = 0;
  const result = await runTypeSafeDoctor({
    env: {},
    live: false,
    gateway: mockGateway({}, () => { calls += 1; }),
  });
  assert.equal(result.keyPresent, false);
  assert.equal(result.liveRequested, false);
  assert.equal(result.live, "not-requested");
  assert.equal(calls, 0);
});
