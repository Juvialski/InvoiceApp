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
import {
  rerankContextCandidates,
  type ContextCandidate,
} from "../scripts/developer-intelligence/typesafe/contextReranker.ts";
import { triageAffectedTests } from "../scripts/developer-intelligence/typesafe/testTriage.ts";
import type { ImpactSelectionResult } from "../scripts/test-impact.ts";
import {
  classifyCiFailure,
  deterministicCiFailureCategory,
} from "../scripts/developer-intelligence/typesafe/ciTriage.ts";
import { checkCompletionEvidence } from "../scripts/developer-intelligence/typesafe/completionCheck.ts";

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

test("context reranking preserves must-keep candidates and batches bounded judgments", async () => {
  const candidates: ContextCandidate[] = [
    { id: "keep", path: "src/keep.ts", summary: "authoritative boundary", mustKeep: true },
    { id: "relevant", path: "src/relevant.ts", summary: "task-specific implementation" },
    { id: "irrelevant", path: "src/irrelevant.ts", summary: "unrelated surface" },
  ];
  let calls = 0;
  const result = await rerankContextCandidates({
    task: "update task-specific implementation",
    candidates,
    maxSelected: 2,
    env: { TYPESAFE_API_KEY: "ts-test-only" },
    gateway: mockGateway({ answers: { c0: { noul: 0.01 }, c1: { noul: 0.95 }, c2: { noul: 0.05 } } }, () => { calls += 1; }),
  });

  assert.equal(calls, 1);
  assert.equal(result.fallback, false);
  assert.deepEqual(result.selectedCandidates.map((candidate) => candidate.id), ["keep", "relevant"]);
  assert.equal(result.diagnostic.candidateCount, 3);
  assert.equal(result.diagnostic.selectedCount, 2);
});

test("context reranking returns the deterministic candidate set on TypeSafe failure", async () => {
  const candidates: ContextCandidate[] = [
    { id: "a", path: "src/a.ts" },
    { id: "b", path: "src/b.ts" },
  ];
  const result = await rerankContextCandidates({
    task: "synthetic",
    candidates,
    maxSelected: 1,
    env: { TYPESAFE_API_KEY: "ts-test-only" },
    gateway: { systemOne: async () => { throw new Error("simulated"); } },
  });
  assert.equal(result.fallback, true);
  assert.deepEqual(result.selectedCandidates, candidates);
  assert.equal(result.diagnostic.fallbackReason, "api-error");
});

test("test triage never suppresses deterministic affected tests", async () => {
  const selection: ImpactSelectionResult = {
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    changedFiles: ["src/example.ts"],
    selectedTests: ["tests/high.test.ts", "tests/low.test.ts"],
    testReasons: {
      "tests/high.test.ts": ["direct dependency"],
      "tests/low.test.ts": ["permanent smoke suite"],
    },
    smokeTests: ["tests/low.test.ts"],
    totalAvailableTests: 2,
    isFallback: false,
    isDatabaseAffected: false,
  };
  const result = await triageAffectedTests({
    task: "synthetic test triage",
    selection,
    env: { TYPESAFE_API_KEY: "ts-test-only" },
    gateway: { systemOne: async () => ({ answers: { c0: { score: 2 }, c1: { score: 0 } } }) },
  });
  assert.equal(result.advisoryOnly, true);
  assert.deepEqual(result.requiredTests, selection.selectedTests);
  assert.deepEqual(result.recommendedTests, ["tests/high.test.ts", "tests/low.test.ts"]);
  assert.deepEqual(result.groups.background, ["tests/low.test.ts"]);
});

test("CI triage uses a closed deterministic category set when live judgment is unavailable", async () => {
  assert.equal(deterministicCiFailureCategory("eslint reported no-unused-vars"), "lint");
  assert.equal(deterministicCiFailureCategory("Playwright locator timed out"), "browser");
  assert.equal(deterministicCiFailureCategory("supabase migration failed with RLS error"), "migration/database");
  const result = await classifyCiFailure({ excerpt: "eslint reported no-unused-vars", env: {} });
  assert.equal(result.category, "lint");
  assert.equal(result.fallback, true);
  assert.equal(result.advisoryOnly, true);
});

test("CI triage rejects secret-bearing excerpts before any live call", async () => {
  let calls = 0;
  const result = await classifyCiFailure({
    excerpt: "DATABASE_URL=postgres://user:secret@host/db",
    env: { TYPESAFE_API_KEY: "ts-test-only" },
    gateway: mockGateway({}, () => { calls += 1; }),
  });
  assert.equal(result.category, "unknown");
  assert.equal(result.diagnostic.fallbackReason, "sanitizer-rejected");
  assert.equal(calls, 0);
});

test("CI triage accepts a validated live category without exposing raw response data", async () => {
  const result = await classifyCiFailure({
    excerpt: "Synthetic browser failure",
    env: { TYPESAFE_API_KEY: "ts-test-only" },
    gateway: mockGateway({ answers: { category: { choice: "browser", confidence: 0.9 } } }),
  });
  assert.equal(result.category, "browser");
  assert.equal(result.fallback, false);
});

test("completion evidence check remains advisory and reports missing documentation", async () => {
  const result = await checkCompletionEvidence({
    taskScope: "TypeSafe developer tooling",
    changedFileCategories: ["developer-tooling"],
    validation: { tests: "passed", lint: "passed" },
    declaredEvidence: ["implementation", "tests"],
    expectedEvidence: ["implementation", "tests", "documentation"],
    env: { TYPESAFE_API_KEY: "ts-test-only" },
    gateway: mockGateway({ answers: { c0: { noul: 1 }, c1: { noul: 1 }, c2: { noul: 0 } } }),
  });
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.mergeDecision, "not-provided");
  assert.deepEqual(result.missingEvidence, ["documentation"]);
  assert.equal(result.fallback, false);
});
