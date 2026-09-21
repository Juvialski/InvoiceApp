import { noul } from "@typesafe-ai/sdk";
import {
  invokeTypeSafe,
  type TypeSafeGateway,
} from "./client.ts";
import { markTypeSafeFallback } from "./diagnostics.ts";
import type { TypeSafeDiagnostic } from "./contracts.ts";

export const COMPLETION_EVIDENCE_CATEGORIES = [
  "implementation",
  "tests",
  "browser",
  "database",
  "documentation",
  "provider",
] as const;

export type CompletionEvidenceCategory = typeof COMPLETION_EVIDENCE_CATEGORIES[number];

export interface CompletionCheckInput {
  readonly taskScope: string;
  readonly changedFileCategories: readonly string[];
  readonly validation: Readonly<Record<string, string>>;
  readonly declaredEvidence: readonly string[];
  readonly expectedEvidence?: readonly CompletionEvidenceCategory[];
  readonly gateway?: TypeSafeGateway;
  readonly env?: NodeJS.ProcessEnv;
  readonly live?: boolean;
  readonly timeoutMs?: number;
}

export interface CompletionAdvisoryObservation {
  readonly category: CompletionEvidenceCategory;
  readonly present: boolean;
}

export interface CompletionCheckResult {
  readonly advisoryOnly: true;
  readonly expectedEvidence: readonly CompletionEvidenceCategory[];
  readonly presentEvidence: readonly CompletionEvidenceCategory[];
  readonly missingEvidence: readonly CompletionEvidenceCategory[];
  readonly unresolvedUncertainty: boolean;
  readonly advisoryObservations: readonly CompletionAdvisoryObservation[];
  readonly mergeDecision: "not-provided";
  readonly fallback: boolean;
  readonly diagnostic: TypeSafeDiagnostic;
}

function expectedForInput(input: CompletionCheckInput): CompletionEvidenceCategory[] {
  if (input.expectedEvidence?.length) return [...new Set(input.expectedEvidence)];
  const categories = input.changedFileCategories.map((value) => value.toLocaleLowerCase());
  const expected: CompletionEvidenceCategory[] = ["implementation", "tests"];
  if (categories.some((value) => value.includes("ui") || value.includes("browser"))) expected.push("browser");
  if (categories.some((value) => value.includes("database") || value.includes("migration") || value.includes("supabase"))) expected.push("database");
  if (categories.some((value) => value.includes("provider") || value.includes("external"))) expected.push("provider");
  if (categories.some((value) => value.includes("documentation") || value.includes("developer-tooling"))) expected.push("documentation");
  return expected;
}

function hasEvidence(input: CompletionCheckInput, category: CompletionEvidenceCategory): boolean {
  const values = new Set([...input.declaredEvidence, ...Object.keys(input.validation)].map((value) => value.toLocaleLowerCase()));
  const aliases: Record<CompletionEvidenceCategory, readonly string[]> = {
    implementation: ["implementation", "source", "developer-tooling"],
    tests: ["tests", "focused-tests", "affected-tests", "test:affected:agent"],
    browser: ["browser", "browser-qa", "demo-visual-qa"],
    database: ["database", "db", "supabase", "migration"],
    documentation: ["documentation", "docs"],
    provider: ["provider", "external", "provider-qa"],
  };
  return aliases[category].some((alias) => values.has(alias));
}

function deterministicResult(input: CompletionCheckInput, diagnostic: TypeSafeDiagnostic, fallback: boolean, observations: readonly CompletionAdvisoryObservation[] = []): CompletionCheckResult {
  const expectedEvidence = expectedForInput(input);
  const presentEvidence = expectedEvidence.filter((category) => hasEvidence(input, category));
  const missingEvidence = expectedEvidence.filter((category) => !presentEvidence.includes(category));
  const unresolvedUncertainty = missingEvidence.length > 0
    || Object.values(input.validation).some((value) => value.toLocaleLowerCase() !== "passed")
    || input.declaredEvidence.some((value) => value.toLocaleLowerCase().includes("uncertain"));
  return {
    advisoryOnly: true,
    expectedEvidence,
    presentEvidence,
    missingEvidence,
    unresolvedUncertainty,
    advisoryObservations: observations,
    mergeDecision: "not-provided",
    fallback,
    diagnostic: {
      ...diagnostic,
      checkpoint: diagnostic.checkpoint || "completion",
      itemKind: diagnostic.itemKind || "evidence",
      candidateCount: expectedEvidence.length,
      selectedCount: presentEvidence.length,
      outcome: diagnostic.outcome || (fallback ? "deterministic-fallback" : "success"),
      fallback,
      fallbackCategory: diagnostic.fallbackCategory || (fallback ? "provider" : "none"),
      sanitizerRejected: diagnostic.sanitizerRejected || false,
    },
  };
}

export async function checkCompletionEvidence(input: CompletionCheckInput): Promise<CompletionCheckResult> {
  const expectedEvidence = expectedForInput(input);
  if (expectedEvidence.length === 0) return deterministicResult(input, { durationMs: 0 }, false);
  const questions: Record<string, unknown> = {};
  for (const [index, category] of expectedEvidence.entries()) {
    questions[`c${index}`] = noul(`Is declared evidence sufficient for the ${category} category?`, { true: "The declared evidence is present.", false: "The declared evidence is missing or incomplete." });
  }
  const response = await invokeTypeSafe<{ readonly answers?: Record<string, unknown> }>(
    {
      state: {
        taskScope: input.taskScope,
        changedFileCategories: input.changedFileCategories,
        validation: input.validation,
        declaredEvidence: input.declaredEvidence,
        expectedEvidence,
      },
      questions,
    },
    { gateway: input.gateway, env: input.env, live: input.live, timeoutMs: input.timeoutMs, checkpoint: "completion", itemKind: "evidence", candidateCount: expectedEvidence.length, liveResultUsed: true },
  );
  if (!response.ok) return deterministicResult(input, response.diagnostic, true);
  const observations: CompletionAdvisoryObservation[] = [];
  for (const [index, category] of expectedEvidence.entries()) {
    const answer = response.value.answers?.[`c${index}`];
    if (typeof answer !== "object" || answer === null || Array.isArray(answer) || typeof (answer as { noul?: unknown }).noul !== "number") {
      return deterministicResult(input, markTypeSafeFallback(response.diagnostic, "invalid-response"), true);
    }
    const noulValue = (answer as { noul: number }).noul;
    if (!Number.isFinite(noulValue) || noulValue < 0 || noulValue > 1) {
      return deterministicResult(input, markTypeSafeFallback(response.diagnostic, "invalid-response"), true);
    }
    observations.push({ category, present: noulValue >= 0.5 });
  }
  return deterministicResult(input, response.diagnostic, false, observations);
}
