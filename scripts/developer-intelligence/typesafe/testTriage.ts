import { score, type Questions } from "@typesafe-ai/sdk";
import {
  invokeTypeSafe,
  type TypeSafeGateway,
} from "./client.ts";
import {
  createTypeSafeEffectivenessRecord,
  mergeTypeSafeDiagnostics,
} from "./diagnostics.ts";
import {
  chunkBySerializedBudget,
  type TypeSafeBudgetChunk,
} from "./chunking.ts";
import type {
  TypeSafeDiagnostic,
  TypeSafeEffectivenessRecord,
  TypeSafeFallbackReason,
} from "./contracts.ts";
import type { ImpactSelectionResult } from "../../test-impact.ts";

export interface TestTriageOptions {
  readonly task: string;
  readonly selection: ImpactSelectionResult;
  readonly payloadBudgetChars?: number;
  readonly gateway?: TypeSafeGateway;
  readonly env?: NodeJS.ProcessEnv;
  readonly live?: boolean;
  readonly timeoutMs?: number;
}

export interface TestTriageGroups {
  readonly highest: readonly string[];
  readonly focused: readonly string[];
  readonly background: readonly string[];
}

export interface TestTriageResult {
  readonly advisoryOnly: true;
  readonly requiredTests: readonly string[];
  readonly recommendedTests: readonly string[];
  readonly groups: TestTriageGroups;
  readonly chunkDiagnostics: readonly TypeSafeDiagnostic[];
  readonly effectivenessRecords: readonly TypeSafeEffectivenessRecord[];
  readonly fallback: boolean;
  readonly diagnostic: TypeSafeDiagnostic;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniquePreservingOrder(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function requestFor(task: string, selection: ImpactSelectionResult, tests: readonly string[]): { readonly state: { readonly task: string; readonly tests: readonly { readonly path: string; readonly reasons: readonly string[] }[] }; readonly questions: Questions } {
  const questions: Questions = {};
  const stateTests = tests.map((testPath, index) => {
    questions[`c${index}`] = score(
      `For the shared task, rate tests[${index}] as an early validation check.`,
      [
        "Background: affected but unlikely to diagnose the core task early.",
        "Focused: direct or adjacent validation.",
        "Highest: directly exercises changed behavior or a boundary.",
      ],
    );
    return { path: testPath, reasons: selection.testReasons[testPath] || [] };
  });
  return { state: { task, tests: stateTests }, questions };
}

function chunkFallbackDiagnostic(
  chunk: TypeSafeBudgetChunk<string>,
  chunkCount: number,
): TypeSafeDiagnostic & { readonly fallbackReason: TypeSafeFallbackReason } {
  return {
    durationMs: 0,
    checkpoint: "test-triage",
    itemKind: "test",
    candidateCount: chunk.items.length,
    testCount: chunk.items.length,
    chunkIndex: chunk.index + 1,
    chunkCount,
    serializedChars: chunk.serializedChars,
    requestCount: 0,
    outcome: "preflight-rejected",
    fallback: true,
    fallbackReason: "preflight-rejected",
    fallbackCategory: "preflight",
    sanitizerRejected: false,
    preflightReason: chunk.preflightReason,
    liveResultUsed: false,
  };
}

function fallbackResult(requiredTests: readonly string[], diagnostic: TypeSafeDiagnostic, chunkDiagnostics: readonly TypeSafeDiagnostic[] = []): TestTriageResult {
  return {
    advisoryOnly: true,
    requiredTests: [...requiredTests],
    recommendedTests: [...requiredTests],
    groups: { highest: [], focused: [...requiredTests], background: [] },
    chunkDiagnostics,
    effectivenessRecords: chunkDiagnostics.map((entry) => createTypeSafeEffectivenessRecord(entry, { checkpoint: "test-triage", deterministicProtectedUnionCount: requiredTests.length })),
    fallback: true,
    diagnostic: {
      ...diagnostic,
      checkpoint: diagnostic.checkpoint || "test-triage",
      itemKind: diagnostic.itemKind || "test",
      candidateCount: requiredTests.length,
      testCount: requiredTests.length,
      selectedCount: requiredTests.length,
      recommendedCount: requiredTests.length,
      deterministicProtectedUnionCount: requiredTests.length,
      fallback: true,
      outcome: diagnostic.outcome || "deterministic-fallback",
    },
  };
}

export async function triageAffectedTests(options: TestTriageOptions): Promise<TestTriageResult> {
  const requiredTests = uniquePreservingOrder(options.selection.selectedTests);
  if (requiredTests.length === 0) {
    return {
      advisoryOnly: true,
      requiredTests: [],
      recommendedTests: [],
      groups: { highest: [], focused: [], background: [] },
      chunkDiagnostics: [],
      effectivenessRecords: [],
      fallback: false,
      diagnostic: {
        durationMs: 0,
        checkpoint: "test-triage",
        itemKind: "test",
        candidateCount: 0,
        testCount: 0,
        selectedCount: 0,
        recommendedCount: 0,
        deterministicProtectedUnionCount: 0,
        requestCount: 0,
        outcome: "success",
        fallback: false,
        fallbackCategory: "none",
        sanitizerRejected: false,
        liveResultUsed: false,
      },
    };
  }

  const chunks = chunkBySerializedBudget(requiredTests, {
    maxChars: options.payloadBudgetChars,
    buildPayload: (items) => requestFor(options.task, options.selection, items),
  });
  const chunkDiagnostics: TypeSafeDiagnostic[] = [];
  const scoresByTest = new Map<string, { readonly score: number; readonly order: number }>();
  const failedTests = new Set<string>();
  let order = 0;

  for (const chunk of chunks) {
    const chunkTests = [...chunk.items];
    if (chunk.preflightRejected) {
      chunkDiagnostics.push(chunkFallbackDiagnostic(chunk, chunks.length));
      for (const testPath of chunkTests) failedTests.add(testPath);
      continue;
    }
    const response = await invokeTypeSafe<{ readonly answers?: Record<string, unknown> }>(requestFor(options.task, options.selection, chunkTests), {
      gateway: options.gateway,
      env: options.env,
      live: options.live,
      timeoutMs: options.timeoutMs,
      payloadBudgetChars: options.payloadBudgetChars,
      checkpoint: "test-triage",
      itemKind: "test",
      chunkIndex: chunk.index + 1,
      chunkCount: chunks.length,
      testCount: chunkTests.length,
      candidateCount: chunkTests.length,
      deterministicProtectedUnionCount: requiredTests.length,
      liveResultUsed: true,
    });
    if (!response.ok) {
      chunkDiagnostics.push(response.diagnostic);
      for (const testPath of chunkTests) failedTests.add(testPath);
      continue;
    }
    const answers = response.value.answers;
    if (!isRecord(answers)) {
      const diagnostic: TypeSafeDiagnostic = {
        ...response.diagnostic,
        outcome: "provider-failure",
        fallback: true,
        fallbackReason: "invalid-response",
        fallbackCategory: "provider",
      };
      chunkDiagnostics.push(diagnostic);
      for (const testPath of chunkTests) failedTests.add(testPath);
      continue;
    }
    let valid = true;
    const chunkScores: Array<{ readonly path: string; readonly score: number; readonly order: number }> = [];
    for (const [index, testPath] of chunkTests.entries()) {
      const answer = answers[`c${index}`];
      const value = isRecord(answer) && typeof answer.score === "number" ? answer.score : Number.NaN;
      if (!Number.isFinite(value) || value < 0 || value > 2) {
        valid = false;
        break;
      }
      chunkScores.push({ path: testPath, score: value, order });
      order += 1;
    }
    if (!valid) {
      const diagnostic: TypeSafeDiagnostic = {
        ...response.diagnostic,
        outcome: "provider-failure",
        fallback: true,
        fallbackReason: "invalid-response",
        fallbackCategory: "provider",
      };
      chunkDiagnostics.push(diagnostic);
      for (const testPath of chunkTests) failedTests.add(testPath);
      continue;
    }
    chunkDiagnostics.push(response.diagnostic);
    for (const entry of chunkScores) scoresByTest.set(entry.path, { score: entry.score, order: entry.order });
  }

  const scoredTests = requiredTests
    .filter((testPath) => scoresByTest.has(testPath))
    .sort((left, right) => {
      const leftScore = scoresByTest.get(left)!;
      const rightScore = scoresByTest.get(right)!;
      return rightScore.score - leftScore.score || leftScore.order - rightScore.order;
    });
  const recommendedTests = uniquePreservingOrder([...scoredTests, ...requiredTests.filter((testPath) => failedTests.has(testPath))]);
  const groups: TestTriageGroups = {
    highest: recommendedTests.filter((testPath) => !failedTests.has(testPath) && (scoresByTest.get(testPath)?.score ?? 0) >= 1.5),
    focused: recommendedTests.filter((testPath) => {
      const value = scoresByTest.get(testPath)?.score;
      return failedTests.has(testPath) || (value !== undefined && value >= 0.5 && value < 1.5);
    }),
    background: recommendedTests.filter((testPath) => {
      const value = scoresByTest.get(testPath)?.score;
      return value !== undefined && value < 0.5 && !failedTests.has(testPath);
    }),
  };
  const fallback = failedTests.size > 0;
  const aggregate = mergeTypeSafeDiagnostics(chunkDiagnostics, {
    checkpoint: "test-triage",
    itemKind: "test",
    itemCount: requiredTests.length,
    selectedCount: requiredTests.length,
    recommendedCount: recommendedTests.length,
    deterministicProtectedUnionCount: requiredTests.length,
    liveResultUsed: !fallback && chunkDiagnostics.length > 0,
  });
  return {
    advisoryOnly: true,
    requiredTests,
    recommendedTests,
    groups,
    chunkDiagnostics,
    effectivenessRecords: chunkDiagnostics.map((entry) => createTypeSafeEffectivenessRecord(entry, { checkpoint: "test-triage", deterministicProtectedUnionCount: requiredTests.length })),
    fallback,
    diagnostic: {
      ...aggregate,
      chunkCount: chunks.length,
      testCount: requiredTests.length,
      candidateCount: requiredTests.length,
      selectedCount: requiredTests.length,
      recommendedCount: recommendedTests.length,
      deterministicProtectedUnionCount: requiredTests.length,
      fallback,
      outcome: fallback ? "deterministic-fallback" : "success",
      liveResultUsed: !fallback && chunkDiagnostics.length > 0,
    },
  };
}
