import { score } from "@typesafe-ai/sdk";
import {
  invokeTypeSafe,
  type TypeSafeGateway,
} from "./client.ts";
import type {
  TypeSafeDiagnostic,
  TypeSafeFallbackReason,
} from "./contracts.ts";
import type { ImpactSelectionResult } from "../../test-impact.ts";

export interface TestTriageOptions {
  readonly task: string;
  readonly selection: ImpactSelectionResult;
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
  readonly fallback: boolean;
  readonly diagnostic: TypeSafeDiagnostic;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fallback(
  tests: readonly string[],
  diagnostic: TypeSafeDiagnostic & { readonly fallbackReason: TypeSafeFallbackReason },
): TestTriageResult {
  return {
    advisoryOnly: true,
    requiredTests: [...tests],
    recommendedTests: [...tests],
    groups: { highest: [], focused: [...tests], background: [] },
    fallback: true,
    diagnostic: { ...diagnostic, candidateCount: tests.length, selectedCount: tests.length },
  };
}

export async function triageAffectedTests(options: TestTriageOptions): Promise<TestTriageResult> {
  const requiredTests = [...options.selection.selectedTests];
  if (requiredTests.length === 0) {
    return {
      advisoryOnly: true,
      requiredTests: [],
      recommendedTests: [],
      groups: { highest: [], focused: [], background: [] },
      fallback: false,
      diagnostic: { durationMs: 0, candidateCount: 0, selectedCount: 0 },
    };
  }
  const questions: Record<string, unknown> = {};
  const stateTests = requiredTests.map((testPath, index) => {
    const questionId = `c${index}`;
    questions[questionId] = score(
      `For \`task\`, rate \`tests[${index}]\` as an early validation check.`,
      [
        "Background: affected but unlikely to diagnose the core task early.",
        "Focused: direct or adjacent validation.",
        "Highest: directly exercises changed behavior or a boundary.",
      ],
    );
    return { questionId, path: testPath, reasons: options.selection.testReasons[testPath] || [] };
  });
  const response = await invokeTypeSafe<{ readonly answers?: Record<string, unknown> }>(
    { state: { task: options.task, tests: stateTests }, questions },
    {
      gateway: options.gateway,
      env: options.env,
      live: options.live,
      timeoutMs: options.timeoutMs,
      candidateCount: requiredTests.length,
    },
  );
  if (response.ok === false) return fallback(requiredTests, response.diagnostic);
  const answers = response.value.answers;
  if (!isRecord(answers)) return fallback(requiredTests, { ...response.diagnostic, fallbackReason: "invalid-response" });
  const scored: Array<{ readonly path: string; readonly score: number; readonly index: number }> = [];
  for (const [index, path] of requiredTests.entries()) {
    const answer = answers[`c${index}`];
    const value = isRecord(answer) && typeof answer.score === "number" ? answer.score : Number.NaN;
    if (!Number.isFinite(value) || value < 0 || value > 2) return fallback(requiredTests, { ...response.diagnostic, fallbackReason: "invalid-response" });
    scored.push({ path, score: value, index });
  }
  const ordered = [...scored].sort((left, right) => right.score - left.score || left.index - right.index);
  const groups: TestTriageGroups = {
    highest: ordered.filter((entry) => entry.score >= 1.5).map((entry) => entry.path),
    focused: ordered.filter((entry) => entry.score >= 0.5 && entry.score < 1.5).map((entry) => entry.path),
    background: ordered.filter((entry) => entry.score < 0.5).map((entry) => entry.path),
  };
  return {
    advisoryOnly: true,
    requiredTests,
    recommendedTests: ordered.map((entry) => entry.path),
    groups,
    fallback: false,
    diagnostic: { ...response.diagnostic, candidateCount: requiredTests.length, selectedCount: requiredTests.length },
  };
}
