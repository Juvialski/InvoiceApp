import type { ImpactSelectionResult } from "../../../test-impact.ts";
import type { ContextCandidate } from "../contextReranker.ts";

export interface SyntheticContextFixture {
  readonly task: string;
  readonly candidates: readonly ContextCandidate[];
  readonly expectedRelevantIds: readonly string[];
}

export interface CandidateRetentionMetrics {
  readonly baselineCount: number;
  readonly selectedCount: number;
  readonly relevantRetention: number;
  readonly mustKeepRetention: number;
  readonly reductionPercent: number;
}

function positiveCount(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
  return value;
}

export function buildSyntheticContextCandidates(input: {
  readonly count: number;
  readonly mustKeepCount: number;
  readonly relevantCount: number;
}): SyntheticContextFixture {
  const count = positiveCount(input.count, "count");
  const mustKeepCount = Math.min(count, positiveCount(input.mustKeepCount, "mustKeepCount"));
  const relevantCount = Math.min(count, positiveCount(input.relevantCount, "relevantCount"));
  const candidates: ContextCandidate[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = `src/v2a/fixture-${String(index + 1).padStart(3, "0")}.ts`;
    candidates.push({
      id,
      path: id,
      summary: `Synthetic developer-tooling candidate ${index + 1}.`,
      kind: "v2a-fixture",
      ...(index < mustKeepCount ? { mustKeep: true } : {}),
    });
  }
  return {
    task: "Synthetic Jev workflow-intelligence context selection",
    candidates,
    expectedRelevantIds: candidates.slice(0, relevantCount).map((candidate) => candidate.id),
  };
}

export function measureCandidateRetention(
  baseline: readonly ContextCandidate[],
  selected: readonly ContextCandidate[],
  expectedRelevantIds: readonly string[],
): CandidateRetentionMetrics {
  const selectedIds = new Set(selected.map((candidate) => candidate.id));
  const mustKeep = baseline.filter((candidate) => candidate.mustKeep);
  const relevantRetained = expectedRelevantIds.filter((id) => selectedIds.has(id)).length;
  const mustKeepRetained = mustKeep.filter((candidate) => selectedIds.has(candidate.id)).length;
  return {
    baselineCount: baseline.length,
    selectedCount: selected.length,
    relevantRetention: expectedRelevantIds.length > 0 ? relevantRetained / expectedRelevantIds.length : 1,
    mustKeepRetention: mustKeep.length > 0 ? mustKeepRetained / mustKeep.length : 1,
    reductionPercent: baseline.length > 0 ? ((baseline.length - selected.length) / baseline.length) * 100 : 0,
  };
}

export function buildSyntheticAffectedTestSelection(count: number, reasonLength = 8): ImpactSelectionResult {
  const testCount = positiveCount(count, "count");
  const safeReasonLength = positiveCount(reasonLength, "reasonLength");
  const selectedTests: string[] = [];
  const testReasons: Record<string, string[]> = {};
  for (let index = 0; index < testCount; index += 1) {
    const path = `tests/v2a-affected-${String(index + 1).padStart(3, "0")}.test.ts`;
    selectedTests.push(path);
    testReasons[path] = [`Synthetic affected-test reason ${"x".repeat(safeReasonLength)}`];
  }
  return {
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    changedFiles: ["scripts/developer-intelligence/typesafe/v2a/fixtures.ts"],
    selectedTests,
    testReasons,
    smokeTests: [],
    totalAvailableTests: testCount,
    isFallback: false,
    isDatabaseAffected: false,
  };
}
