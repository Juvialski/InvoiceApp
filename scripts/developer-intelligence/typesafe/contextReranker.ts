import { noul } from "@typesafe-ai/sdk";
import {
  invokeTypeSafe,
  type TypeSafeGateway,
} from "./client.ts";
import type {
  TypeSafeDiagnostic,
  TypeSafeFallbackReason,
} from "./contracts.ts";
import { sanitizeTypeSafePayload } from "./sanitize.ts";

const MAX_CONTEXT_CANDIDATES = 64;
const DEFAULT_MAX_SELECTED = 8;

export interface ContextCandidate {
  readonly id: string;
  readonly path: string;
  readonly summary?: string;
  readonly kind?: string;
  readonly mustKeep?: boolean;
}

export interface ContextRerankOptions {
  readonly task: string;
  readonly candidates: readonly ContextCandidate[];
  readonly maxSelected?: number;
  readonly gateway?: TypeSafeGateway;
  readonly env?: NodeJS.ProcessEnv;
  readonly live?: boolean;
  readonly timeoutMs?: number;
}

export interface ContextRerankResult {
  readonly baselineCandidates: readonly ContextCandidate[];
  readonly selectedCandidates: readonly ContextCandidate[];
  readonly fallback: boolean;
  readonly diagnostic: TypeSafeDiagnostic;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fallbackResult(
  candidates: readonly ContextCandidate[],
  diagnostic: TypeSafeDiagnostic & { readonly fallbackReason: TypeSafeFallbackReason },
): ContextRerankResult {
  return {
    baselineCandidates: [...candidates],
    selectedCandidates: [...candidates],
    fallback: true,
    diagnostic: { ...diagnostic, candidateCount: candidates.length, selectedCount: candidates.length },
  };
}

export async function rerankContextCandidates(options: ContextRerankOptions): Promise<ContextRerankResult> {
  const candidates = [...options.candidates];
  if (candidates.length === 0) {
    return {
      baselineCandidates: [],
      selectedCandidates: [],
      fallback: false,
      diagnostic: { durationMs: 0, candidateCount: 0, selectedCount: 0 },
    };
  }
  if (candidates.length > MAX_CONTEXT_CANDIDATES) {
    return fallbackResult(candidates, { durationMs: 0, fallbackReason: "sanitizer-rejected" });
  }
  const questions: Record<string, unknown> = {};
  const stateCandidates = candidates.map((candidate, index) => {
    const questionId = `c${index}`;
    questions[questionId] = noul(
      `For \`task\`, retain \`candidates[${index}]\` if needed for implementation, validation, a contract, a dependency, or safe review.`,
      {
        true: "Task-critical; retain.",
        false: "Not task-critical; omit.",
      },
    );
    return {
      questionId,
      id: candidate.id,
      path: candidate.path,
      ...(candidate.summary ? { summary: candidate.summary } : {}),
      ...(candidate.kind ? { kind: candidate.kind } : {}),
      ...(candidate.mustKeep ? { mustKeep: true } : {}),
    };
  });
  const payloadCheck = sanitizeTypeSafePayload({ task: options.task, candidates: stateCandidates, questions });
  if (!payloadCheck.ok) {
    return fallbackResult(candidates, { durationMs: 0, fallbackReason: "sanitizer-rejected" });
  }
  const response = await invokeTypeSafe<{ readonly answers?: Record<string, unknown> }>(
    { state: { task: options.task, candidates: stateCandidates }, questions },
    {
      gateway: options.gateway,
      env: options.env,
      live: options.live,
      timeoutMs: options.timeoutMs,
      candidateCount: candidates.length,
    },
  );
  if (response.ok === false) return fallbackResult(candidates, response.diagnostic);
  const answers = response.value.answers;
  if (!isRecord(answers)) return fallbackResult(candidates, { ...response.diagnostic, fallbackReason: "invalid-response" });

  const scored: Array<{ readonly candidate: ContextCandidate; readonly score: number; readonly index: number }> = [];
  for (const [index, candidate] of candidates.entries()) {
    const answer = answers[`c${index}`];
    const score = isRecord(answer) && typeof answer.noul === "number" ? answer.noul : Number.NaN;
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      return fallbackResult(candidates, { ...response.diagnostic, fallbackReason: "invalid-response" });
    }
    scored.push({ candidate, score, index });
  }

  const mustKeep = scored.filter((entry) => entry.candidate.mustKeep);
  const maxSelected = Math.max(mustKeep.length, Math.min(candidates.length, Math.max(1, options.maxSelected || DEFAULT_MAX_SELECTED)));
  const optional = scored
    .filter((entry) => !entry.candidate.mustKeep && entry.score >= 0.5)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(0, maxSelected - mustKeep.length));
  const selectedIndexes = new Set([...mustKeep, ...optional].map((entry) => entry.index));
  const selectedCandidates = scored.filter((entry) => selectedIndexes.has(entry.index)).map((entry) => entry.candidate);
  return {
    baselineCandidates: candidates,
    selectedCandidates,
    fallback: false,
    diagnostic: { ...response.diagnostic, candidateCount: candidates.length, selectedCount: selectedCandidates.length },
  };
}
