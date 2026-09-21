import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateTypeSafePayload,
  prepareTypeSafeRequest,
} from "../scripts/developer-intelligence/typesafe/requestPrimitives.ts";
import {
  chunkBySerializedBudget,
} from "../scripts/developer-intelligence/typesafe/chunking.ts";
import {
  rerankContextCandidates,
  type ContextCandidate,
} from "../scripts/developer-intelligence/typesafe/contextReranker.ts";
import {
  seedTypesafeContextCandidates,
} from "../scripts/developer-intelligence/typesafe/taskSeeding.ts";
import {
  triageAffectedTests,
} from "../scripts/developer-intelligence/typesafe/testTriage.ts";
import {
  invokeTypeSafe,
  type TypeSafeGateway,
} from "../scripts/developer-intelligence/typesafe/client.ts";
import type { ImpactSelectionResult } from "../scripts/test-impact.ts";

function mockGateway(
  response: unknown | ((request: unknown, callIndex: number) => unknown),
  onRequest?: (request: unknown, callIndex: number) => void,
): TypeSafeGateway {
  let callIndex = 0;
  return {
    systemOne: async (request) => {
      const currentIndex = callIndex;
      callIndex += 1;
      onRequest?.(request, currentIndex);
      if (typeof response === "function") return response(request, currentIndex);
      return response;
    },
  };
}

function contextCandidates(count: number, mustKeepCount = 0): ContextCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `src/v2b/candidate-${String(index + 1).padStart(3, "0")}.ts`,
    path: `src/v2b/candidate-${String(index + 1).padStart(3, "0")}.ts`,
    summary: `Synthetic context candidate ${index + 1}.`,
    kind: "v2b-fixture",
    ...(index < mustKeepCount ? { mustKeep: true } : {}),
  }));
}

function affectedSelection(count: number): ImpactSelectionResult {
  const selectedTests = Array.from({ length: count }, (_, index) => `tests/v2b-affected-${String(index + 1).padStart(3, "0")}.test.ts`);
  return {
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    changedFiles: ["scripts/developer-intelligence/typesafe/testTriage.ts"],
    selectedTests,
    testReasons: Object.fromEntries(selectedTests.map((testPath) => [testPath, ["synthetic affected test"]])),
    smokeTests: [],
    totalAvailableTests: count,
    isFallback: false,
    isDatabaseAffected: false,
  };
}

test("request preflight estimates the exact serialized envelope and aliases semantic false-positive keys", () => {
  const prepared = prepareTypeSafeRequest({
    state: { task: "synthetic authority review" },
    questions: {
      c0_authority: {
        type: "noul",
        instructions: "Does this candidate contain an authority boundary?",
      },
    },
  });

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.aliases.c0_authority, "c0_boundary");
  assert.equal(Object.hasOwn(prepared.request.questions, "c0_authority"), false);
  assert.equal(Object.hasOwn(prepared.request.questions, "c0_boundary"), true);
  assert.match(JSON.stringify(prepared.request.questions), /authority boundary/);
  const estimate = estimateTypeSafePayload(prepared.request);
  assert.equal(estimate.ok, true);
  if (estimate.ok) assert.equal(prepared.serializedChars, estimate.serializedChars);
});

test("request preflight preserves both questions when an authority alias collides with a safe key", () => {
  const prepared = prepareTypeSafeRequest({
    state: { task: "synthetic authority and boundary review" },
    questions: {
      c0_authority: { type: "noul", instructions: "Review authority semantics." },
      c0_boundary: { type: "noul", instructions: "Review boundary semantics." },
    },
  });

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(Object.keys(prepared.request.questions).length, 2);
  assert.equal(prepared.aliases.c0_authority, "c0_boundary");
  assert.equal(prepared.aliases.c0_boundary, "c0_boundary_1");
  assert.equal(Object.hasOwn(prepared.request.questions, "c0_boundary"), true);
  assert.equal(Object.hasOwn(prepared.request.questions, "c0_boundary_1"), true);
});

test("request preflight rejects non-aliasable sensitive transport keys before dispatch", async () => {
  let calls = 0;
  const result = await invokeTypeSafe(
    {
      state: { task: "synthetic" },
      questions: { c0_password: { type: "noul", instructions: "Synthetic" } },
    },
    {
      live: true,
      env: { TYPESAFE_API_KEY: "synthetic-test-key" },
      gateway: mockGateway({}, () => { calls += 1; }),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.outcome, "preflight-rejected");
  assert.equal(result.diagnostic.fallbackReason, "preflight-rejected");
  assert.equal(result.diagnostic.requestCount, 0);
  assert.equal(calls, 0);
});

test("aliased transport answers are remapped without changing semantic instructions", async () => {
  let captured: unknown;
  const result = await invokeTypeSafe<{ readonly answers: Record<string, unknown> }>(
    {
      state: { task: "synthetic authority review" },
      questions: { c0_authority: { type: "noul", instructions: "Review the authority boundary." } },
    },
    {
      live: true,
      env: { TYPESAFE_API_KEY: "synthetic-test-key" },
      gateway: mockGateway({ answers: { c0_boundary: { noul: 0.8 } } }, (request) => { captured = request; }),
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal((result.value.answers.c0_authority as { noul: number }).noul, 0.8);
  assert.equal(JSON.stringify(captured).includes("c0_authority"), false);
  assert.match(JSON.stringify(captured), /authority boundary/);
});

test("the existing sanitizer boundary remains 20,000 characters", () => {
  const under = estimateTypeSafePayload({ text: "x".repeat(19_990) });
  const over = estimateTypeSafePayload({ text: "x".repeat(20_001) });
  assert.equal(under.ok, true);
  assert.equal(over.ok, true);
  if (over.ok) assert.equal(over.serializedChars > 20_000, true);
});

test("budget chunking is ordered, deterministic, complete, and duplicate-free", () => {
  const values = Array.from({ length: 75 }, (_, index) => ({ id: index + 1, text: `item-${index + 1}` }));
  const buildPayload = (items: readonly { id: number; text: string }[]) => ({ task: "synthetic", items });
  const first = chunkBySerializedBudget(values, { maxChars: 500, buildPayload });
  const second = chunkBySerializedBudget(values, { maxChars: 500, buildPayload });

  assert.deepEqual(first.map((chunk) => chunk.items.map((item) => item.id)), second.map((chunk) => chunk.items.map((item) => item.id)));
  const flattened = first.flatMap((chunk) => chunk.items.map((item) => item.id));
  assert.deepEqual(flattened, values.map((item) => item.id));
  assert.equal(new Set(flattened).size, values.length);
  assert.ok(first.every((chunk) => chunk.serializedChars <= 500 || chunk.preflightRejected));
});

test("clean-baseline developer-tooling tasks receive deterministic seeded candidates", () => {
  const result = seedTypesafeContextCandidates({
    task: "Jev Workflow Intelligence v2B payload-safe workflow integration",
    availablePaths: [
      "scripts/developer-intelligence/typesafe/client.ts",
      "scripts/developer-intelligence/typesafe/contextReranker.ts",
      "scripts/test-impact.ts",
      "tests/typesafeDeveloperIntelligence.test.ts",
      "src/unrelated.ts",
    ],
  });

  assert.equal(result.noCandidates, false);
  assert.ok(result.matchedScopes.includes("typesafe-workflow-intelligence"));
  assert.deepEqual(result.candidates.map((candidate) => candidate.path), [
    "scripts/developer-intelligence/typesafe/client.ts",
    "scripts/developer-intelligence/typesafe/contextReranker.ts",
    "scripts/test-impact.ts",
    "tests/typesafeDeveloperIntelligence.test.ts",
  ]);
});

test("explicit file selectors seed a candidate even when task keywords do not match a known scope", () => {
  const result = seedTypesafeContextCandidates({
    task: "unrelated bespoke maintenance",
    explicitFilePaths: ["src/explicit.ts"],
    availablePaths: ["src/explicit.ts"],
  });

  assert.equal(result.noCandidates, false);
  assert.equal(result.candidates[0]?.path, "src/explicit.ts");
  assert.equal(result.candidates[0]?.mustKeep, true);
});

test("truly unseedable tasks report no candidates instead of a successful empty Jev judgment", () => {
  const result = seedTypesafeContextCandidates({ task: "unrelated bespoke maintenance", availablePaths: ["src/other.ts"] });
  assert.equal(result.noCandidates, true);
  assert.deepEqual(result.candidates, []);
});

test("changed and existing must-keep paths survive deterministic seeding", () => {
  const result = seedTypesafeContextCandidates({
    task: "Jev Workflow Intelligence v2B",
    changedFilePaths: ["scripts/developer-intelligence/typesafe/new.ts"],
    existingCandidates: [{ id: "src/must-keep.ts", path: "src/must-keep.ts", mustKeep: true }],
    availablePaths: ["scripts/developer-intelligence/typesafe/new.ts"],
  });

  assert.equal(result.candidates.find((candidate) => candidate.path === "scripts/developer-intelligence/typesafe/new.ts")?.mustKeep, true);
  assert.equal(result.candidates.find((candidate) => candidate.path === "src/must-keep.ts")?.mustKeep, true);
});

test("context reranking chunks more than 64 candidates and keeps the deterministic universe", async () => {
  const candidates = contextCandidates(75, 3);
  const requests: unknown[] = [];
  const result = await rerankContextCandidates({
    task: "synthetic broad context reranking",
    candidates,
    maxSelected: 8,
    live: true,
    env: { TYPESAFE_API_KEY: "synthetic-test-key" },
    gateway: mockGateway((request) => {
      const state = request as { state: { candidates: readonly { id: string }[] } };
      const answers: Record<string, unknown> = {};
      state.state.candidates.forEach((candidate, index) => {
        answers[`c${index}_relevance`] = { noul: candidate.id.endsWith("001.ts") ? 0.95 : 0.1 };
        answers[`c${index}_boundary`] = { noul: 0.05 };
        answers[`c${index}_validation`] = { score: candidate.id.endsWith("001.ts") ? 2 : 0 };
        answers[`c${index}_reviewRisk`] = { score: 0 };
      });
      return { answers };
    }, (request) => { requests.push(request); }),
  });

  assert.ok(requests.length > 1);
  assert.equal(result.fallback, false);
  assert.equal(result.diagnostic.outcome, "success");
  assert.equal(result.diagnostic.candidateCount, 75);
  assert.equal(result.diagnostic.requestCount, requests.length);
  assert.equal(result.diagnostic.chunkCount, requests.length);
  assert.deepEqual(result.baselineCandidates.map((candidate) => candidate.id), candidates.map((candidate) => candidate.id));
  assert.deepEqual(result.selectedCandidates.slice(0, 4).map((candidate) => candidate.id), [
    candidates[0]!.id,
    candidates[1]!.id,
    candidates[2]!.id,
    candidates[3]!.id,
  ]);
  assert.equal(result.judgments?.length, 75);
  assert.equal(result.effectivenessRecords.length, result.chunkDiagnostics.length);
  assert.equal(result.effectivenessRecords.every((record) => record.candidateCount === undefined || record.candidateCount > 0), true);
});

test("a rejected context chunk retains every candidate from that chunk", async () => {
  const candidates = contextCandidates(12, 1);
  const result = await rerankContextCandidates({
    task: "synthetic rejected context chunk",
    candidates,
    maxSelected: 2,
    payloadBudgetChars: 1_300,
    live: true,
    env: { TYPESAFE_API_KEY: "synthetic-test-key" },
    gateway: {
      systemOne: async (_request) => { throw new Error("synthetic provider failure"); },
    },
  });

  assert.equal(result.fallback, true);
  assert.ok((result.chunkDiagnostics || []).some((diagnostic) => diagnostic.fallback));
  assert.deepEqual(result.selectedCandidates.map((candidate) => candidate.id), candidates.map((candidate) => candidate.id));
});

test("must-keep context paths survive all Jev outcomes", async () => {
  const candidates = contextCandidates(4, 2);
  const result = await rerankContextCandidates({
    task: "synthetic provider outage",
    candidates,
    maxSelected: 1,
    live: true,
    env: { TYPESAFE_API_KEY: "synthetic-test-key" },
    gateway: { systemOne: async () => { throw new Error("synthetic provider failure"); } },
  });

  assert.equal(result.fallback, true);
  assert.deepEqual(result.selectedCandidates, candidates);
  assert.equal(result.diagnostic.deterministicProtectedUnionCount, 2);
});

test("75 deterministic required tests are chunked and every test remains required", async () => {
  const selection = affectedSelection(75);
  const requests: unknown[] = [];
  const result = await triageAffectedTests({
    task: "synthetic broad affected test triage",
    selection,
    live: true,
    env: { TYPESAFE_API_KEY: "synthetic-test-key" },
    gateway: mockGateway((request) => {
      const state = request as { state: { tests: readonly { path: string }[] } };
      return {
        answers: Object.fromEntries(state.state.tests.map((testCase, index) => [`c${index}`, { score: index === 0 ? 2 : 0 }])),
      };
    }, (request) => { requests.push(request); }),
  });

  assert.ok(requests.length > 1);
  assert.equal(result.fallback, false);
  assert.equal(result.requiredTests.length, 75);
  assert.deepEqual(new Set(result.requiredTests), new Set(selection.selectedTests));
  assert.deepEqual(new Set(result.recommendedTests), new Set(selection.selectedTests));
  assert.equal(result.diagnostic.testCount, 75);
  assert.equal(result.diagnostic.recommendedCount, 75);
  assert.equal(result.diagnostic.deterministicProtectedUnionCount, 75);
  assert.equal(result.effectivenessRecords.length, result.chunkDiagnostics.length);
  assert.equal(result.effectivenessRecords.every((record) => record.testCount !== undefined), true);
});

test("a rejected test chunk falls back locally without removing its required tests", async () => {
  const selection = affectedSelection(12);
  let calls = 0;
  const result = await triageAffectedTests({
    task: "synthetic rejected test chunk",
    selection,
    payloadBudgetChars: 1_000,
    live: true,
    env: { TYPESAFE_API_KEY: "synthetic-test-key" },
    gateway: {
      systemOne: async () => {
        calls += 1;
        if (calls === 2) throw new Error("synthetic provider failure");
        return { answers: { c0: { score: 2 } } };
      },
    },
  });

  assert.equal(result.fallback, true);
  assert.deepEqual(result.requiredTests, selection.selectedTests);
  assert.deepEqual(new Set(result.recommendedTests), new Set(selection.selectedTests));
  assert.ok(result.chunkDiagnostics.some((diagnostic) => diagnostic.fallback));
});

test("diagnostics distinguish preflight, sanitizer, provider, and success without persisting secrets", async () => {
  const preflight = await invokeTypeSafe(
    { state: { task: "synthetic" }, questions: { c0_password: { type: "noul", instructions: "Synthetic" } } },
    { live: true, env: { TYPESAFE_API_KEY: "synthetic-key" }, gateway: mockGateway({ answers: { c0_password: { noul: 1 } } }) },
  );
  const sanitizer = await invokeTypeSafe(
    { state: { value: "DATABASE_URL=postgres://synthetic" }, questions: { c0: { type: "noul", instructions: "Synthetic" } } },
    { live: true, env: { TYPESAFE_API_KEY: "synthetic-key" }, gateway: mockGateway({ answers: { c0: { noul: 1 } } }) },
  );
  const provider = await invokeTypeSafe(
    { state: { task: "synthetic" }, questions: { c0: { type: "noul", instructions: "Synthetic" } } },
    { live: true, env: { TYPESAFE_API_KEY: "synthetic-key" }, gateway: { systemOne: async () => { throw new Error("secret-bearing provider error"); } } },
  );
  const success = await invokeTypeSafe(
    { state: { task: "synthetic" }, questions: { c0: { type: "noul", instructions: "Synthetic" } } },
    { live: true, env: { TYPESAFE_API_KEY: "synthetic-key" }, gateway: mockGateway({ answers: { c0: { noul: 1 } }, model: "jev-test", usage: { input_tokens: 4, output_tokens: 2 } }) },
  );

  assert.equal(preflight.diagnostic.outcome, "preflight-rejected");
  assert.equal(sanitizer.diagnostic.outcome, "sanitizer-rejected");
  assert.equal(sanitizer.diagnostic.sanitizerRejected, true);
  assert.equal(provider.diagnostic.outcome, "provider-failure");
  assert.equal(success.ok, true);
  assert.equal(success.diagnostic.outcome, "success");
  assert.equal(success.diagnostic.model, "jev-test");
  assert.doesNotMatch(JSON.stringify({ preflight, sanitizer, provider, success }), /secret-bearing|DATABASE_URL|synthetic-key/);
});
