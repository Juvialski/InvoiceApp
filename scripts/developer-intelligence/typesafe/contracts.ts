import type { EntryType, Questions } from "@typesafe-ai/sdk";

export type TypeSafeJsonValue = string | number | boolean | null | TypeSafeJsonValue[] | { [key: string]: TypeSafeJsonValue };

export interface TypeSafeSystemOneRequest {
  readonly state: EntryType | TypeSafeJsonValue;
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
  | "sanitizer-rejected"
  | "timeout"
  | "api-error"
  | "invalid-response";

export interface TypeSafeDiagnostic {
  readonly durationMs: number;
  readonly candidateCount?: number;
  readonly selectedCount?: number;
  readonly fallbackReason?: TypeSafeFallbackReason;
  readonly model?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
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
  readonly candidateCount?: number;
  readonly selectedCount?: number;
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
