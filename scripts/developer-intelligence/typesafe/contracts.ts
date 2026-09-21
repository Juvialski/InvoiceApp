import type { Questions } from "@typesafe-ai/sdk";

export type TypeSafeJsonValue = string | number | boolean | null | TypeSafeJsonValue[] | { [key: string]: TypeSafeJsonValue };

export interface TypeSafeSystemOneRequest {
  readonly state: unknown;
  readonly questions: Questions | Record<string, unknown>;
}

export interface TypeSafeGatewayRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeout?: number;
  readonly retry?: { readonly maxRetries?: number };
}

export interface TypeSafeGateway {
  systemOne(request: TypeSafeSystemOneRequest, options?: TypeSafeGatewayRequestOptions): Promise<unknown>;
}

export type TypeSafeFallbackReason =
  | "live-disabled"
  | "missing-api-key"
  | "preflight-rejected"
  | "sanitizer-rejected"
  | "timeout"
  | "api-error"
  | "invalid-response"
  | "no-candidates";

export type TypeSafeDiagnosticOutcome =
  | "preflight-rejected"
  | "sanitizer-rejected"
  | "provider-failure"
  | "success"
  | "deterministic-fallback";

export type TypeSafeFallbackCategory = "preflight" | "sanitizer" | "provider" | "mixed" | "none";

export type TypeSafeItemKind = "candidate" | "test" | "evidence" | "request";

export interface TypeSafeDiagnostic {
  readonly durationMs: number;
  readonly checkpoint?: string;
  readonly itemKind?: TypeSafeItemKind;
  readonly requestCount?: number;
  readonly candidateCount?: number;
  readonly testCount?: number;
  readonly chunkIndex?: number;
  readonly chunkCount?: number;
  readonly serializedChars?: number;
  readonly outcome?: TypeSafeDiagnosticOutcome;
  readonly fallback?: boolean;
  readonly selectedCount?: number;
  readonly recommendedCount?: number;
  readonly deterministicProtectedUnionCount?: number;
  readonly liveResultUsed?: boolean;
  readonly fallbackCategory?: TypeSafeFallbackCategory;
  readonly sanitizerRejected?: boolean;
  readonly preflightReason?: string;
  readonly transportAliasCount?: number;
  readonly fallbackReason?: TypeSafeFallbackReason;
  readonly model?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

/**
 * A sanitized, durable-shaped record for later Jev effectiveness analysis.
 * It intentionally contains only counts, statuses, model/usage metadata, and
 * timing; request state and provider error text never belong here.
 */
export interface TypeSafeEffectivenessRecord {
  readonly checkpoint: string;
  readonly requestCount: number;
  readonly candidateCount?: number;
  readonly testCount?: number;
  readonly chunkIndex?: number;
  readonly chunkCount?: number;
  readonly serializedChars?: number;
  readonly model?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly latencyMs: number;
  readonly fallback: boolean;
  readonly fallbackCategory: TypeSafeFallbackCategory;
  readonly sanitizerRejected: boolean;
  readonly selectedCount?: number;
  readonly recommendedCount?: number;
  readonly deterministicProtectedUnionCount: number;
  readonly liveResultUsed: boolean;
}

export interface TypeSafeCallSuccess<T> {
  readonly ok: true;
  readonly value: T;
  readonly diagnostic: TypeSafeDiagnostic;
}

export interface TypeSafeCallFailure {
  readonly ok: false;
  readonly diagnostic: TypeSafeDiagnostic & { readonly fallbackReason: TypeSafeFallbackReason };
}

export type TypeSafeCallResult<T> = TypeSafeCallSuccess<T> | TypeSafeCallFailure;

export interface TypeSafeInvokeOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly gateway?: TypeSafeGateway;
  readonly timeoutMs?: number;
  readonly live?: boolean;
  readonly payloadBudgetChars?: number;
  readonly checkpoint?: string;
  readonly itemKind?: TypeSafeItemKind;
  readonly chunkIndex?: number;
  readonly chunkCount?: number;
  readonly deterministicProtectedUnionCount?: number;
  readonly liveResultUsed?: boolean;
  readonly candidateCount?: number;
  readonly testCount?: number;
  readonly selectedCount?: number;
  readonly recommendedCount?: number;
}

export type TypeSafeDoctorLiveStatus = "not-requested" | "succeeded" | "unavailable" | "failed";

export interface TypeSafeDoctorResult {
  readonly keyPresent: boolean;
  readonly sdkVersion: string;
  readonly nodeVersion: string;
  readonly liveRequested: boolean;
  readonly live: TypeSafeDoctorLiveStatus;
  readonly category?: string;
  readonly model?: string;
  readonly latencyMs?: number;
  readonly fallbackReason?: TypeSafeFallbackReason;
}
