import { TypeSafeClient, VERSION } from "@typesafe-ai/sdk";
import {
  hasTypeSafeApiKey,
  sanitizeTypeSafePayload,
} from "./sanitize.ts";
import type {
  TypeSafeCallResult,
  TypeSafeGateway,
  TypeSafeGatewayRequestOptions,
  TypeSafeInvokeOptions,
  TypeSafeSystemOneRequest,
} from "./contracts.ts";

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

function buildDiagnostic(
  startedAt: number,
  options: TypeSafeInvokeOptions,
  fallbackReason?: import("./contracts.ts").TypeSafeFallbackReason,
  response?: Record<string, unknown>,
) {
  const usage = isRecord(response?.usage) ? response.usage : undefined;
  return {
    durationMs: Date.now() - startedAt,
    ...(options.candidateCount === undefined ? {} : { candidateCount: options.candidateCount }),
    ...(options.selectedCount === undefined ? {} : { selectedCount: options.selectedCount }),
    ...(fallbackReason ? { fallbackReason } : {}),
    ...(typeof response?.model === "string" ? { model: response.model } : {}),
    ...(typeof usage?.input_tokens === "number" ? { inputTokens: usage.input_tokens } : {}),
    ...(typeof usage?.output_tokens === "number" ? { outputTokens: usage.output_tokens } : {}),
  };
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
  if (options.live === false) {
    return { ok: false, diagnostic: buildDiagnostic(startedAt, options, "live-disabled") };
  }
  const sanitized = sanitizeTypeSafePayload(request);
  if (!sanitized.ok) {
    return { ok: false, diagnostic: buildDiagnostic(startedAt, options, "sanitizer-rejected") };
  }
  const gateway = options.gateway || createTypeSafeGateway({ env: options.env });
  if (!gateway) {
    return { ok: false, diagnostic: buildDiagnostic(startedAt, options, "missing-api-key") };
  }

  const timeoutMs = boundedTimeout(options.timeoutMs);
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error("typesafe-timeout"));
      }, timeoutMs);
    });
    const value = await Promise.race([
      gateway.systemOne(request, { signal: controller.signal, timeout: timeoutMs, retry: { maxRetries: 0 } }),
      timeout,
    ]);
    if (!validSystemOneResponse(value)) {
      return { ok: false, diagnostic: buildDiagnostic(startedAt, options, "invalid-response") };
    }
    return { ok: true, value: value as T, diagnostic: buildDiagnostic(startedAt, options, undefined, value) };
  } catch {
    return {
      ok: false,
      diagnostic: buildDiagnostic(startedAt, options, timedOut ? "timeout" : "api-error"),
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    controller.abort();
  }
}

export { VERSION as TYPESAFE_SDK_VERSION };
export type { TypeSafeGateway } from "./contracts.ts";
