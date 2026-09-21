import { TypeSafeClient, VERSION } from "@typesafe-ai/sdk";
import {
  hasTypeSafeApiKey,
  sanitizeTypeSafePayload,
} from "./sanitize.ts";
import type {
  TypeSafeCallResult,
  TypeSafeDiagnostic,
  TypeSafeFallbackReason,
  TypeSafeGateway,
  TypeSafeGatewayRequestOptions,
  TypeSafeInvokeOptions,
  TypeSafeSystemOneRequest,
} from "./contracts.ts";
import {
  prepareTypeSafeRequest,
  remapTypeSafeAnswers,
} from "./requestPrimitives.ts";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;

function boundedTimeout(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.floor(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validSystemOneResponse(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.answers)) return false;
  return Object.keys(value.answers).length > 0;
}

function diagnosticOutcome(fallbackReason: TypeSafeFallbackReason | undefined): TypeSafeDiagnostic["outcome"] {
  if (!fallbackReason) return "success";
  if (fallbackReason === "sanitizer-rejected") return "sanitizer-rejected";
  if (["live-disabled", "missing-api-key", "preflight-rejected", "no-candidates"].includes(fallbackReason)) return "preflight-rejected";
  return "provider-failure";
}

function diagnosticCategory(fallbackReason: TypeSafeFallbackReason | undefined): TypeSafeDiagnostic["fallbackCategory"] {
  if (!fallbackReason) return "none";
  if (fallbackReason === "sanitizer-rejected") return "sanitizer";
  if (["live-disabled", "missing-api-key", "preflight-rejected", "no-candidates"].includes(fallbackReason)) return "preflight";
  return "provider";
}

function buildDiagnostic(
  startedAt: number,
  options: TypeSafeInvokeOptions,
  fallbackReason?: TypeSafeFallbackReason,
  response?: Record<string, unknown>,
  overrides: Partial<TypeSafeDiagnostic> = {},
): TypeSafeDiagnostic {
  const usage = isRecord(response?.usage) ? response.usage : undefined;
  const dispatched = overrides.requestCount ?? (response ? 1 : 0);
  return {
    durationMs: Date.now() - startedAt,
    ...(options.checkpoint ? { checkpoint: options.checkpoint } : {}),
    ...(options.itemKind ? { itemKind: options.itemKind } : {}),
    requestCount: dispatched,
    ...(options.candidateCount === undefined ? {} : { candidateCount: options.candidateCount }),
    ...(options.testCount === undefined ? {} : { testCount: options.testCount }),
    ...(options.chunkIndex === undefined ? {} : { chunkIndex: options.chunkIndex }),
    ...(options.chunkCount === undefined ? {} : { chunkCount: options.chunkCount }),
    ...(options.deterministicProtectedUnionCount === undefined ? {} : { deterministicProtectedUnionCount: options.deterministicProtectedUnionCount }),
    ...(!fallbackReason && options.liveResultUsed !== undefined ? { liveResultUsed: options.liveResultUsed } : {}),
    ...(options.selectedCount === undefined ? {} : { selectedCount: options.selectedCount }),
    ...(options.recommendedCount === undefined ? {} : { recommendedCount: options.recommendedCount }),
    outcome: diagnosticOutcome(fallbackReason),
    fallback: Boolean(fallbackReason),
    fallbackCategory: diagnosticCategory(fallbackReason),
    sanitizerRejected: fallbackReason === "sanitizer-rejected",
    ...(fallbackReason ? { fallbackReason } : {}),
    ...(typeof response?.model === "string" ? { model: response.model } : {}),
    ...(typeof usage?.input_tokens === "number" ? { inputTokens: usage.input_tokens } : {}),
    ...(typeof usage?.output_tokens === "number" ? { outputTokens: usage.output_tokens } : {}),
    ...overrides,
  };
}

function buildFailureDiagnostic(
  startedAt: number,
  options: TypeSafeInvokeOptions,
  reason: TypeSafeFallbackReason,
  response?: Record<string, unknown>,
  overrides: Partial<TypeSafeDiagnostic> = {},
): TypeSafeDiagnostic & { readonly fallbackReason: TypeSafeFallbackReason } {
  return { ...buildDiagnostic(startedAt, options, reason, response, overrides), fallbackReason: reason };
}

export function createTypeSafeGateway(options: { readonly env?: NodeJS.ProcessEnv; readonly client?: TypeSafeClient } = {}): TypeSafeGateway | undefined {
  const env = options.env || process.env;
  if (!hasTypeSafeApiKey(env)) return undefined;
  if (options.client) {
    return {
      systemOne: (request, requestOptions) => options.client!.systemOne(request as Parameters<TypeSafeClient["systemOne"]>[0], requestOptions),
    };
  }
  if (env !== process.env) return undefined;
  const client = new TypeSafeClient({ logLevel: "off", timeout: DEFAULT_TIMEOUT_MS, retry: { maxRetries: 0 } });
  return {
    systemOne: (request, requestOptions: TypeSafeGatewayRequestOptions = {}) => client.systemOne(
      request as Parameters<TypeSafeClient["systemOne"]>[0],
      requestOptions,
    ),
  };
}

export async function invokeTypeSafe<T>(
  request: TypeSafeSystemOneRequest,
  options: TypeSafeInvokeOptions = {},
): Promise<TypeSafeCallResult<T>> {
  const startedAt = Date.now();
  if (options.live !== true) {
    return { ok: false, diagnostic: buildFailureDiagnostic(startedAt, options, "live-disabled") };
  }
  const prepared = prepareTypeSafeRequest(request, { maxChars: options.payloadBudgetChars });
  if (prepared.ok === false) {
    return {
      ok: false,
      diagnostic: buildFailureDiagnostic(startedAt, options, "preflight-rejected", undefined, {
        preflightReason: prepared.reason,
        ...(prepared.serializedChars === undefined ? {} : { serializedChars: prepared.serializedChars }),
        transportAliasCount: Object.keys(prepared.aliases).length,
      }),
    };
  }
  const sanitized = sanitizeTypeSafePayload(prepared.request);
  if (!sanitized.ok) {
    return {
      ok: false,
      diagnostic: buildFailureDiagnostic(startedAt, options, "sanitizer-rejected", undefined, {
        serializedChars: prepared.serializedChars,
        transportAliasCount: Object.keys(prepared.aliases).length,
      }),
    };
  }
  const gateway = options.gateway || createTypeSafeGateway({ env: options.env });
  if (!gateway) {
    return { ok: false, diagnostic: buildFailureDiagnostic(startedAt, options, "missing-api-key") };
  }

  const timeoutMs = boundedTimeout(options.timeoutMs);
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let dispatched = false;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error("typesafe-timeout"));
      }, timeoutMs);
    });
    const value = await Promise.race([
      (async () => {
        dispatched = true;
        return gateway.systemOne(prepared.request, { signal: controller.signal, timeout: timeoutMs, retry: { maxRetries: 0 } });
      })(),
      timeout,
    ]);
    if (!validSystemOneResponse(value)) {
      return { ok: false, diagnostic: buildFailureDiagnostic(startedAt, options, "invalid-response", undefined, { requestCount: dispatched ? 1 : 0, serializedChars: prepared.serializedChars, transportAliasCount: Object.keys(prepared.aliases).length }) };
    }
    const normalizedValue = remapTypeSafeAnswers(value, prepared.aliases);
    return { ok: true, value: normalizedValue as T, diagnostic: buildDiagnostic(startedAt, options, undefined, value, { requestCount: dispatched ? 1 : 0, serializedChars: prepared.serializedChars, transportAliasCount: Object.keys(prepared.aliases).length, liveResultUsed: options.liveResultUsed ?? false }) };
  } catch {
    return {
      ok: false,
      diagnostic: buildFailureDiagnostic(startedAt, options, timedOut ? "timeout" : "api-error", undefined, { requestCount: dispatched ? 1 : 0, serializedChars: prepared.serializedChars, transportAliasCount: Object.keys(prepared.aliases).length }),
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    controller.abort();
  }
}

export { VERSION as TYPESAFE_SDK_VERSION };
export type { TypeSafeGateway } from "./contracts.ts";
