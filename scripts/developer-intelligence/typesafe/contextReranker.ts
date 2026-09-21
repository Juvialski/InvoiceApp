import { noul, score, type Questions } from "@typesafe-ai/sdk";
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

const DEFAULT_MAX_SELECTED = 8;

export interface ContextCandidate {
  readonly id: string;
  readonly path: string;
  readonly summary?: string;
  readonly kind?: string;
  readonly mustKeep?: boolean;
}

export interface ContextAxisJudgment {
  readonly candidateId: string;
  readonly relevance: number;
  readonly boundary: number;
  readonly validation: number;
  readonly reviewRisk: number;
  readonly chunkIndex: number;
}

export interface ContextRerankOptions {
  readonly task: string;
  readonly candidates: readonly ContextCandidate[];
  readonly maxSelected?: number;
  readonly payloadBudgetChars?: number;
  readonly gateway?: TypeSafeGateway;
  readonly env?: NodeJS.ProcessEnv;
  readonly live?: boolean;
  readonly timeoutMs?: number;
}

export interface ContextRerankResult {
  readonly baselineCandidates: readonly ContextCandidate[];
  readonly selectedCandidates: readonly ContextCandidate[];
  readonly judgments?: readonly ContextAxisJudgment[];
  readonly chunkDiagnostics: readonly TypeSafeDiagnostic[];
  readonly effectivenessRecords: readonly TypeSafeEffectivenessRecord[];
  readonly fallback: boolean;
  readonly diagnostic: TypeSafeDiagnostic;
}

interface ContextRequestCandidate {
  readonly questionIds: {
    readonly relevance: string;
    readonly boundary: string;
    readonly validation: string;
    readonly reviewRisk: string;
  };
  readonly id: string;
  readonly path: string;
  readonly summary?: string;
  readonly kind?: string;
  readonly mustKeep?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fallbackDiagnostic(
  candidates: readonly ContextCandidate[],
  diagnostic: TypeSafeDiagnostic & { readonly fallbackReason: TypeSafeFallbackReason },
): TypeSafeDiagnostic {
  return {
    ...diagnostic,
    checkpoint: diagnostic.checkpoint || "context",
    itemKind: diagnostic.itemKind || "candidate",
    candidateCount: candidates.length,
    selectedCount: candidates.length,
    fallback: true,
    outcome: diagnostic.outcome || "deterministic-fallback",
    fallbackCategory: diagnostic.fallbackCategory || "provider",
    deterministicProtectedUnionCount: candidates.filter((candidate) => candidate.mustKeep).length,
  };
}

function fallbackResult(
  candidates: readonly ContextCandidate[],
  diagnostic: TypeSafeDiagnostic & { readonly fallbackReason: TypeSafeFallbackReason },
  chunkDiagnostics: readonly TypeSafeDiagnostic[] = [],
): ContextRerankResult {
  const normalized = fallbackDiagnostic(candidates, diagnostic);
  return {
    baselineCandidates: [...candidates],
    selectedCandidates: [...candidates],
    chunkDiagnostics,
    effectivenessRecords: chunkDiagnostics.map((entry) => createTypeSafeEffectivenessRecord(entry, { checkpoint: "context", deterministicProtectedUnionCount: candidates.filter((candidate) => candidate.mustKeep).length })),
    fallback: true,
    diagnostic: normalized,
  };
}

function contextQuestions(candidates: readonly ContextCandidate[]): Questions {
  const questions: Questions = {};
  for (const [index] of candidates.entries()) {
    questions[`c${index}_relevance`] = noul(
      `For the shared task, is candidates[${index}] relevant to implementation or validation?`,
      {
        true: "Task-critical; retain. The candidate is needed for the task, a direct dependency, a contract, or required validation.",
        false: "The candidate is only adjacent or shares vocabulary without a concrete task relationship.",
      },
    );
    questions[`c${index}_boundary`] = noul(
      `Does candidates[${index}] contain an authority, permission, lifecycle, financial, history, or security boundary that should be reviewed?`,
      {
        true: "The candidate can constrain safe implementation or review and should not be omitted casually.",
        false: "The candidate has no identified consequential authority boundary for this task.",
      },
    );
    questions[`c${index}_validation`] = score(
      `Rate the diagnostic value of validating candidates[${index}] early for the shared task.`,
      [
        "Background: affected but unlikely to diagnose the task early.",
        "Focused: adjacent or useful validation.",
        "Highest: directly exercises changed behavior or a safety boundary.",
      ],
    );
    questions[`c${index}_reviewRisk`] = score(
      `Rate the review risk if candidates[${index}] is misunderstood or omitted.`,
      [
        "Low: omission is unlikely to change behavior or safety.",
        "Material: omission could hide a contract or regression.",
        "High: omission could weaken authority, security, financial truth, or required evidence.",
      ],
    );
  }
  return questions;
}

function requestFor(task: string, candidates: readonly ContextCandidate[]): { readonly state: { readonly task: string; readonly candidates: readonly ContextRequestCandidate[] }; readonly questions: Questions } {
  const questions = contextQuestions(candidates);
  const stateCandidates = candidates.map((candidate, index) => ({
    questionIds: {
      relevance: `c${index}_relevance`,
      boundary: `c${index}_boundary`,
      validation: `c${index}_validation`,
      reviewRisk: `c${index}_reviewRisk`,
    },
    id: candidate.id,
    path: candidate.path,
    ...(candidate.summary ? { summary: candidate.summary } : {}),
    ...(candidate.kind ? { kind: candidate.kind } : {}),
    ...(candidate.mustKeep ? { mustKeep: true } : {}),
  }));
  return { state: { task, candidates: stateCandidates }, questions };
}

function numberAt(answer: unknown, key: "noul" | "score"): number | undefined {
  return isRecord(answer) && typeof answer[key] === "number" && Number.isFinite(answer[key]) ? answer[key] : undefined;
}

function readAxis(
  answers: Record<string, unknown>,
  index: number,
  axis: "relevance" | "boundary" | "validation" | "reviewRisk",
  legacy: Record<string, unknown> | undefined,
): number | undefined {
  const modern = numberAt(answers[`c${index}_${axis}`], axis === "relevance" || axis === "boundary" ? "noul" : "score");
  if (modern !== undefined) return modern;
  if (!legacy) return undefined;
  if (axis === "relevance") return numberAt(legacy, "noul");
  return 0;
}

function validAxisValues(values: { readonly relevance: number; readonly boundary: number; readonly validation: number; readonly reviewRisk: number }): boolean {
  return values.relevance >= 0 && values.relevance <= 1
    && values.boundary >= 0 && values.boundary <= 1
    && values.validation >= 0 && values.validation <= 2
    && values.reviewRisk >= 0 && values.reviewRisk <= 2;
}

function chunkFallbackDiagnostic(
  chunk: TypeSafeBudgetChunk<ContextCandidate>,
  chunkCount: number,
): TypeSafeDiagnostic & { readonly fallbackReason: TypeSafeFallbackReason } {
  return {
    durationMs: 0,
    checkpoint: "context",
    itemKind: "candidate",
    candidateCount: chunk.items.length,
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

function rankJudgments(
  entries: readonly { readonly judgment: ContextAxisJudgment; readonly candidateIndex: number }[],
): Array<{ readonly judgment: ContextAxisJudgment; readonly candidateIndex: number }> {
  return [...entries].sort((left, right) => {
    // Safety axes are lexicographically non-compensating: relevance cannot
    // cancel a stronger boundary/review-risk signal.
    return right.judgment.boundary - left.judgment.boundary
      || right.judgment.reviewRisk - left.judgment.reviewRisk
      || right.judgment.relevance - left.judgment.relevance
      || right.judgment.validation - left.judgment.validation
      || left.candidateIndex - right.candidateIndex;
  });
}

export async function rerankContextCandidates(options: ContextRerankOptions): Promise<ContextRerankResult> {
  const candidates = [...options.candidates];
  const protectedCount = candidates.filter((candidate) => candidate.mustKeep).length;
  if (candidates.length === 0) {
    return fallbackResult(candidates, {
      durationMs: 0,
      checkpoint: "context",
      itemKind: "candidate",
      requestCount: 0,
      outcome: "preflight-rejected",
      fallback: true,
      fallbackReason: "no-candidates",
      fallbackCategory: "preflight",
      sanitizerRejected: false,
      deterministicProtectedUnionCount: protectedCount,
      liveResultUsed: false,
    });
  }

  const chunks = chunkBySerializedBudget(candidates, {
    maxChars: options.payloadBudgetChars,
    buildPayload: (items) => requestFor(options.task, items),
  });
  const chunkDiagnostics: TypeSafeDiagnostic[] = [];
  const judgments: Array<{ readonly judgment: ContextAxisJudgment; readonly candidateIndex: number }> = [];
  const failedCandidateIds = new Set<string>();

  for (const chunk of chunks) {
    const chunkItems = [...chunk.items];
    if (chunk.preflightRejected) {
      const diagnostic = chunkFallbackDiagnostic(chunk, chunks.length);
      chunkDiagnostics.push(diagnostic);
      for (const candidate of chunkItems) failedCandidateIds.add(candidate.id);
      continue;
    }
    const request = requestFor(options.task, chunkItems);
    const response = await invokeTypeSafe<{ readonly answers?: Record<string, unknown> }>(request, {
      gateway: options.gateway,
      env: options.env,
      live: options.live,
      timeoutMs: options.timeoutMs,
      payloadBudgetChars: options.payloadBudgetChars,
      checkpoint: "context",
      itemKind: "candidate",
      chunkIndex: chunk.index + 1,
      chunkCount: chunks.length,
      candidateCount: chunkItems.length,
      deterministicProtectedUnionCount: protectedCount,
      liveResultUsed: true,
    });
    if (!response.ok) {
      chunkDiagnostics.push(response.diagnostic);
      for (const candidate of chunkItems) failedCandidateIds.add(candidate.id);
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
      for (const candidate of chunkItems) failedCandidateIds.add(candidate.id);
      continue;
    }
    let chunkValid = true;
    const chunkJudgments: Array<{ readonly judgment: ContextAxisJudgment; readonly candidateIndex: number }> = [];
    for (const [localIndex, candidate] of chunkItems.entries()) {
      const legacyAnswer = isRecord(answers[`c${localIndex}`]) ? answers[`c${localIndex}`] as Record<string, unknown> : undefined;
      const values = {
        relevance: readAxis(answers, localIndex, "relevance", legacyAnswer),
        boundary: readAxis(answers, localIndex, "boundary", legacyAnswer),
        validation: readAxis(answers, localIndex, "validation", legacyAnswer),
        reviewRisk: readAxis(answers, localIndex, "reviewRisk", legacyAnswer),
      };
      if (Object.values(values).some((value) => value === undefined)) {
        chunkValid = false;
        break;
      }
      const normalized = values as { relevance: number; boundary: number; validation: number; reviewRisk: number };
      if (!validAxisValues(normalized)) {
        chunkValid = false;
        break;
      }
      const judgment: ContextAxisJudgment = {
        candidateId: candidate.id,
        ...normalized,
        chunkIndex: chunk.index + 1,
      };
      chunkJudgments.push({ judgment, candidateIndex: candidates.findIndex((item) => item.id === candidate.id) });
    }
    if (!chunkValid) {
      const diagnostic: TypeSafeDiagnostic = {
        ...response.diagnostic,
        outcome: "provider-failure",
        fallback: true,
        fallbackReason: "invalid-response",
        fallbackCategory: "provider",
      };
      chunkDiagnostics.push(diagnostic);
      for (const candidate of chunkItems) failedCandidateIds.add(candidate.id);
      continue;
    }
    chunkDiagnostics.push(response.diagnostic);
    judgments.push(...chunkJudgments);
  }

  const failed = failedCandidateIds.size > 0;
  const protectedIds = new Set(candidates.filter((candidate) => candidate.mustKeep).map((candidate) => candidate.id));
  const selectedIds = new Set<string>([...protectedIds, ...failedCandidateIds]);
  const maxSelected = Math.max(protectedIds.size, Math.min(candidates.length, Math.max(1, options.maxSelected || DEFAULT_MAX_SELECTED)));
  const successfulOptional = rankJudgments(judgments.filter((entry) => !protectedIds.has(entry.judgment.candidateId) && !failedCandidateIds.has(entry.judgment.candidateId)));
  const availableSlots = Math.max(0, maxSelected - selectedIds.size);
  for (const entry of successfulOptional.slice(0, availableSlots)) selectedIds.add(entry.judgment.candidateId);
  const selectedCandidates = candidates.filter((candidate) => selectedIds.has(candidate.id));
  const aggregate = mergeTypeSafeDiagnostics(chunkDiagnostics, {
    checkpoint: "context",
    itemKind: "candidate",
    itemCount: candidates.length,
    selectedCount: selectedCandidates.length,
    deterministicProtectedUnionCount: protectedCount,
    liveResultUsed: !failed && chunkDiagnostics.length > 0,
  });
  const diagnostic: TypeSafeDiagnostic = {
    ...aggregate,
    chunkCount: chunks.length,
    candidateCount: candidates.length,
    selectedCount: selectedCandidates.length,
    fallback: failed,
    outcome: failed ? "deterministic-fallback" : "success",
    liveResultUsed: !failed && chunkDiagnostics.length > 0,
  };
  return {
    baselineCandidates: candidates,
    selectedCandidates,
    judgments: judgments.map((entry) => entry.judgment),
    chunkDiagnostics,
    effectivenessRecords: chunkDiagnostics.map((entry) => createTypeSafeEffectivenessRecord(entry, { checkpoint: "context", deterministicProtectedUnionCount: protectedCount })),
    fallback: failed,
    diagnostic,
  };
}
