import type {
  TypeSafeDiagnostic,
  TypeSafeEffectivenessRecord,
  TypeSafeFallbackCategory,
  TypeSafeFallbackReason,
} from "./contracts.ts";

function fallbackCategoryFor(diagnostic: TypeSafeDiagnostic): TypeSafeFallbackCategory {
  return diagnostic.fallbackCategory || (diagnostic.fallback ? "provider" : "none");
}

export function markTypeSafeFallback(
  diagnostic: TypeSafeDiagnostic,
  reason: TypeSafeFallbackReason,
): TypeSafeDiagnostic {
  const sanitizer = reason === "sanitizer-rejected";
  const preflight = reason === "preflight-rejected" || reason === "live-disabled" || reason === "missing-api-key" || reason === "no-candidates";
  return {
    ...diagnostic,
    fallback: true,
    fallbackReason: reason,
    outcome: sanitizer ? "sanitizer-rejected" : preflight ? "preflight-rejected" : "provider-failure",
    fallbackCategory: sanitizer ? "sanitizer" : preflight ? "preflight" : "provider",
    sanitizerRejected: sanitizer,
  };
}

/** Converts a request diagnostic into a sanitized historical-ledger record. */
export function createTypeSafeEffectivenessRecord(
  diagnostic: TypeSafeDiagnostic,
  defaults: { readonly checkpoint: string; readonly deterministicProtectedUnionCount?: number; readonly liveResultUsed?: boolean },
): TypeSafeEffectivenessRecord {
  return {
    checkpoint: diagnostic.checkpoint || defaults.checkpoint,
    requestCount: diagnostic.requestCount || 0,
    ...(diagnostic.candidateCount === undefined ? {} : { candidateCount: diagnostic.candidateCount }),
    ...(diagnostic.testCount === undefined ? {} : { testCount: diagnostic.testCount }),
    ...(diagnostic.chunkIndex === undefined ? {} : { chunkIndex: diagnostic.chunkIndex }),
    ...(diagnostic.chunkCount === undefined ? {} : { chunkCount: diagnostic.chunkCount }),
    ...(diagnostic.serializedChars === undefined ? {} : { serializedChars: diagnostic.serializedChars }),
    ...(diagnostic.model ? { model: diagnostic.model } : {}),
    ...(diagnostic.inputTokens === undefined ? {} : { inputTokens: diagnostic.inputTokens }),
    ...(diagnostic.outputTokens === undefined ? {} : { outputTokens: diagnostic.outputTokens }),
    latencyMs: diagnostic.durationMs,
    fallback: diagnostic.fallback ?? Boolean(diagnostic.fallbackReason),
    fallbackCategory: fallbackCategoryFor(diagnostic),
    sanitizerRejected: diagnostic.sanitizerRejected ?? diagnostic.fallbackReason === "sanitizer-rejected",
    ...(diagnostic.selectedCount === undefined ? {} : { selectedCount: diagnostic.selectedCount }),
    ...(diagnostic.recommendedCount === undefined ? {} : { recommendedCount: diagnostic.recommendedCount }),
    deterministicProtectedUnionCount: diagnostic.deterministicProtectedUnionCount ?? defaults.deterministicProtectedUnionCount ?? 0,
    liveResultUsed: diagnostic.liveResultUsed ?? defaults.liveResultUsed ?? false,
  };
}

export function mergeTypeSafeDiagnostics(
  diagnostics: readonly TypeSafeDiagnostic[],
  patch: {
    readonly checkpoint: string;
    readonly itemKind: TypeSafeDiagnostic["itemKind"];
    readonly itemCount: number;
    readonly selectedCount?: number;
    readonly recommendedCount?: number;
    readonly deterministicProtectedUnionCount?: number;
    readonly liveResultUsed?: boolean;
  },
): TypeSafeDiagnostic {
  const failures = diagnostics.filter((diagnostic) => diagnostic.fallback || diagnostic.fallbackReason);
  const categories = [...new Set(failures.map(fallbackCategoryFor))];
  const firstFailure = failures[0];
  const model = diagnostics.map((diagnostic) => diagnostic.model).find((value): value is string => Boolean(value));
  const inputTokens = diagnostics.reduce((total, diagnostic) => total + (diagnostic.inputTokens || 0), 0);
  const outputTokens = diagnostics.reduce((total, diagnostic) => total + (diagnostic.outputTokens || 0), 0);
  const requestCount = diagnostics.reduce((total, diagnostic) => total + (diagnostic.requestCount || 0), 0);
  const sanitizerRejected = diagnostics.some((diagnostic) => diagnostic.sanitizerRejected || diagnostic.fallbackReason === "sanitizer-rejected");
  const fallback = failures.length > 0;
  return {
    durationMs: diagnostics.reduce((total, diagnostic) => total + diagnostic.durationMs, 0),
    checkpoint: patch.checkpoint,
    ...(patch.itemKind ? { itemKind: patch.itemKind } : {}),
    requestCount,
    ...(patch.itemKind === "candidate" ? { candidateCount: patch.itemCount } : {}),
    ...(patch.itemKind === "test" ? { testCount: patch.itemCount } : {}),
    ...(diagnostics.length > 1 ? { chunkCount: diagnostics.length } : {}),
    ...(model ? { model } : {}),
    ...(inputTokens > 0 ? { inputTokens } : {}),
    ...(outputTokens > 0 ? { outputTokens } : {}),
    outcome: fallback ? "deterministic-fallback" : "success",
    fallback,
    ...(firstFailure?.fallbackReason ? { fallbackReason: firstFailure.fallbackReason } : {}),
    fallbackCategory: categories.length > 1 ? "mixed" : (categories[0] || "none"),
    sanitizerRejected,
    ...(patch.selectedCount === undefined ? {} : { selectedCount: patch.selectedCount }),
    ...(patch.recommendedCount === undefined ? {} : { recommendedCount: patch.recommendedCount }),
    deterministicProtectedUnionCount: patch.deterministicProtectedUnionCount || 0,
    liveResultUsed: patch.liveResultUsed ?? diagnostics.some((diagnostic) => diagnostic.liveResultUsed),
  };
}
