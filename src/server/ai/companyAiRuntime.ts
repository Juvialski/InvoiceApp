import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCompanyGeminiCredential, readAiCredentialsMasterKey } from "./companyAiEncryption.ts";
import { loadCompanyAiConfig, markCompanyAiCredentialInvalid, recordCompanyAiTest, resolveCompanyAiCredential } from "./companyAiCredentials.ts";
import {
  COMPANY_AI_FALLBACK_MODEL,
  COMPANY_AI_PRIMARY_MODEL,
  COMPANY_AI_PROVIDER,
  CompanyAiError,
  type CompanyAiConfigMetadata,
  type CompanyAiErrorCode,
  type CompanyAiRuntime,
  type CompanyAiTestStatus,
} from "./companyAiTypes.ts";

const RUNTIME_TTL_MS = 45_000;
const MAX_RUNTIME_CACHE_ENTRIES = 128;
const runtimeCache = new Map<string, { expiresAt: number; credentialVersion: number; lastAccessedAt: number; runtime: CompanyAiRuntime }>();

function globalFallbackEnabled(environment: NodeJS.ProcessEnv = process.env) {
  return environment.ALLOW_GLOBAL_GEMINI_FALLBACK?.trim().toLowerCase() === "true";
}

function createClient(apiKey: string) {
  return new GoogleGenAI({ apiKey, httpOptions: { headers: { "User-Agent": "invoiceapp-company-ai" } } });
}

function globalRuntime(companyId: string, environment: NodeJS.ProcessEnv = process.env): CompanyAiRuntime {
  const apiKey = environment.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new CompanyAiError("AI_CREDENTIALS_SERVER_MISCONFIGURED", "AI backend configuration is incomplete.", 503);
  return {
    companyId,
    provider: COMPANY_AI_PROVIDER,
    primaryModel: COMPANY_AI_PRIMARY_MODEL,
    fallbackModel: COMPANY_AI_FALLBACK_MODEL,
    credentialVersion: 0,
    geminiClient: createClient(apiKey),
  };
}

function runtimeCacheKey(companyId: string, credentialVersion: number) {
  return JSON.stringify([companyId, COMPANY_AI_PROVIDER, credentialVersion]);
}

function pruneRuntimeCache(now: number) {
  for (const [key, entry] of runtimeCache) if (entry.expiresAt <= now) runtimeCache.delete(key);
  while (runtimeCache.size > MAX_RUNTIME_CACHE_ENTRIES) {
    const oldest = [...runtimeCache.entries()].sort((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt)[0];
    if (!oldest) break;
    runtimeCache.delete(oldest[0]);
  }
}

function globalFallbackRuntime(companyId: string, environment?: NodeJS.ProcessEnv): CompanyAiRuntime | null {
  const source = environment || process.env;
  if (!globalFallbackEnabled(source) || !source.GEMINI_API_KEY?.trim()) return null;
  return globalRuntime(companyId, source);
}

export async function resolveCompanyAiRuntime(options: { supabase: SupabaseClient; credentialSupabase?: SupabaseClient; companyId: string; now?: number; forceRefresh?: boolean; environment?: NodeJS.ProcessEnv }): Promise<CompanyAiRuntime> {
  const companyId = typeof options.companyId === "string" ? options.companyId.trim() : "";
  if (!companyId) throw new CompanyAiError("AI_CONFIG_UNAVAILABLE", "Company AI configuration is temporarily unavailable.", 503);
  const now = options.now ?? Date.now();
  pruneRuntimeCache(now);
  const cachedEntry = [...runtimeCache.entries()].find(([, entry]) => entry.runtime.companyId === companyId && entry.expiresAt > now);
  if (!options.forceRefresh && cachedEntry) {
    cachedEntry[1].lastAccessedAt = now;
    return cachedEntry[1].runtime;
  }

  const resolution = await resolveCompanyAiCredential({ supabase: options.credentialSupabase, companyId });
  if (!resolution) {
    const fallback = globalFallbackRuntime(companyId, options.environment);
    if (fallback) return fallback;
    throw new CompanyAiError("AI_NOT_CONFIGURED_FOR_COMPANY", "AI is not configured for this company. Contact the platform administrator.", 503);
  }
  if (resolution.status === "INVALID") throw new CompanyAiError("AI_CREDENTIAL_INVALID", "The configured Gemini API key is invalid.", 503);
  if (resolution.status === "DISABLED") throw new CompanyAiError("AI_DISABLED_FOR_COMPANY", "AI is disabled for this company.", 503);
  if (!resolution.credential) throw new CompanyAiError("AI_NOT_CONFIGURED_FOR_COMPANY", "AI is not configured for this company. Contact the platform administrator.", 503);
  if (!resolution.enabled) throw new CompanyAiError("AI_DISABLED_FOR_COMPANY", "AI is disabled for this company.", 503);

  const envelope = resolution.credential;
  const key = runtimeCacheKey(companyId, resolution.credentialVersion);
  const versioned = runtimeCache.get(key);
  if (!options.forceRefresh && versioned && versioned.expiresAt > now) {
    versioned.lastAccessedAt = now;
    return versioned.runtime;
  }
  const apiKey = decryptCompanyGeminiCredential(envelope, companyId, readAiCredentialsMasterKey(options.environment || process.env));
  const runtime: CompanyAiRuntime = {
    companyId,
    provider: COMPANY_AI_PROVIDER,
    primaryModel: COMPANY_AI_PRIMARY_MODEL,
    fallbackModel: COMPANY_AI_FALLBACK_MODEL,
    credentialVersion: envelope.credentialVersion,
    geminiClient: createClient(apiKey),
  };
  runtimeCache.set(key, { expiresAt: now + RUNTIME_TTL_MS, credentialVersion: envelope.credentialVersion, lastAccessedAt: now, runtime });
  for (const [cacheKey, entry] of runtimeCache) {
    if (entry.runtime.companyId === companyId && cacheKey !== key) runtimeCache.delete(cacheKey);
  }
  pruneRuntimeCache(now);
  return runtime;
}

export function invalidateCompanyAiRuntime(companyId: string) {
  const scope = companyId.trim();
  for (const [key, entry] of runtimeCache) if (entry.runtime.companyId === scope) runtimeCache.delete(key);
}

export function clearCompanyAiRuntimeCache() {
  runtimeCache.clear();
}

function providerMessage(error: unknown): string {
  const source = error && typeof error === "object" ? error as Record<string, any> : {};
  const pieces = [
    error instanceof Error ? error.message : undefined,
    source.name,
    typeof source.error === "string" ? source.error : source.error?.message,
    typeof source.body === "string" ? source.body : undefined,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  return pieces.join(" ").toLowerCase();
}

function providerHttpStatus(error: unknown): number {
  const source = error && typeof error === "object" ? error as Record<string, any> : {};
  const candidates = [source.status, source.statusCode, source.response?.status, source.cause?.status, source.cause?.statusCode];
  for (const candidate of candidates) {
    const status = Number(candidate);
    if (Number.isInteger(status) && status > 0) return status;
  }
  return 0;
}

function isMarkedTimeout(error: unknown) {
  const source = error && typeof error === "object" ? error as Record<string, any> : {};
  return source.companyAiTimeout === true || String(source.name || "").toLowerCase() === "companyaitimeouterror";
}

function likelyCompanyAiProviderError(error: unknown) {
  if (!error || error instanceof CompanyAiError) return false;
  const name = String((error as any)?.name || "").toLowerCase();
  const message = providerMessage(error);
  const status = providerHttpStatus(error);
  if (/api(?:authorization|backend)|assistantbackend|assistanttool/.test(name)) return false;
  return /api.*error|google|gemini|generative|fetcherror|aborterror|typeerror/.test(name)
    || isCompanyAiAuthenticationError(error)
    || status > 0
    || /api key|gemini|google|generative|quota|rate limit|resource exhausted|model (?:not found|unavailable)|provider|fetch failed|network|timed out|timeout|aborted|permission denied|access denied|invalid request|bad request/.test(message);
}

/**
 * Convert a provider/transport failure into a stable internal classification.
 * This function intentionally never returns provider text; callers may log
 * only the resulting code/status/model diagnostics.
 */
export function classifyCompanyAiProviderFailure(error: unknown): CompanyAiErrorCode {
  const message = providerMessage(error);
  const name = String((error as any)?.name || "").toLowerCase();
  const status = providerHttpStatus(error);
  if (isCompanyAiAuthenticationError(error)) return "AI_CREDENTIAL_INVALID";
  if (status === 429 || /quota|rate limit|resource exhausted|too many requests/.test(message)) return "AI_QUOTA_LIMITED";
  if (status === 403 || /permission denied|access denied|not authorized|api(?: is)? not enabled|organization policy|model access/.test(message)) return "AI_PROVIDER_ACCESS_DENIED";
  if (status === 404 || /model.*(?:not found|unavailable|does not exist)|(?:not found|unsupported|unavailable).*model|unknown model/.test(message)) return "AI_MODEL_UNAVAILABLE";
  if (isMarkedTimeout(error) || status === 408 || status === 504 || /timeout|timed out|deadline exceeded|request aborted|aborted|aborterror/.test(`${name} ${message}`)) return "AI_TIMEOUT";
  if (/fetch failed|network|econnreset|econnrefused|enotfound|etimedout|socket|dns|connection (?:error|reset|refused|closed)|unable to connect/.test(`${name} ${message}`)) return "AI_NETWORK_ERROR";
  if (status === 400 || status === 422 || /bad request|invalid request|invalid argument|malformed|schema|function declaration|response configuration|unsupported .*config|tool configuration|safety settings|contents.*invalid/.test(message)) return "AI_REQUEST_REJECTED";
  return "AI_PROVIDER_UNAVAILABLE";
}

function testStatusForErrorCode(code: CompanyAiErrorCode | string): CompanyAiTestStatus {
  if (code === "AI_CREDENTIAL_INVALID") return "INVALID_CREDENTIAL";
  if (code === "AI_QUOTA_LIMITED") return "QUOTA_LIMITED";
  if (code === "AI_PROVIDER_ACCESS_DENIED") return "PROVIDER_ACCESS_DENIED";
  if (code === "AI_MODEL_UNAVAILABLE") return "MODEL_UNAVAILABLE";
  return "PROVIDER_UNAVAILABLE";
}

export function classifyCompanyAiProviderError(error: unknown): CompanyAiTestStatus {
  if (error instanceof CompanyAiError) return testStatusForErrorCode(error.code);
  return testStatusForErrorCode(classifyCompanyAiProviderFailure(error));
}

const COMPANY_AI_MESSAGES: Record<string, string> = {
  AI_CREDENTIAL_INVALID: "The configured Gemini API key is invalid.",
  AI_QUOTA_LIMITED: "Gemini quota or rate limit reached.",
  AI_PROVIDER_ACCESS_DENIED: "The configured Gemini project does not have access to the requested model or API.",
  AI_MODEL_UNAVAILABLE: "The requested Gemini model is currently unavailable.",
  AI_PROVIDER_UNAVAILABLE: "Gemini is temporarily unavailable.",
  AI_REQUEST_REJECTED: "Gemini rejected the assistant request configuration.",
  AI_TIMEOUT: "The AI request timed out.",
  AI_NETWORK_ERROR: "The server could not reach Gemini.",
};

function statusForErrorCode(code: CompanyAiErrorCode | string) {
  if (code === "AI_QUOTA_LIMITED") return 429;
  if (code === "AI_REQUEST_REJECTED") return 400;
  if (code === "AI_TIMEOUT") return 504;
  return 503;
}

export function isCompanyAiFallbackEligible(error: unknown) {
  const code = error instanceof CompanyAiError ? error.code : classifyCompanyAiProviderFailure(error);
  return code === "AI_MODEL_UNAVAILABLE" || code === "AI_PROVIDER_UNAVAILABLE" || code === "AI_TIMEOUT" || code === "AI_NETWORK_ERROR";
}

export function isCompanyAiCredentialFailure(error: unknown) {
  return error instanceof CompanyAiError
    ? error.code === "AI_CREDENTIAL_INVALID"
    : isCompanyAiAuthenticationError(error);
}

export function companyAiProviderError(error: unknown, options: { assumeProviderError?: boolean; model?: string; stage?: string } = {}): CompanyAiError | null {
  if (!options.assumeProviderError && !likelyCompanyAiProviderError(error)) return null;
  if (error instanceof CompanyAiError) return error;
  const code = classifyCompanyAiProviderFailure(error);
  const diagnostics: Record<string, string | number> = { classification: code };
  const status = providerHttpStatus(error);
  if (status) diagnostics.httpStatus = status;
  if (options.model) diagnostics.model = options.model;
  if (options.stage) diagnostics.stage = options.stage;
  return new CompanyAiError(code, COMPANY_AI_MESSAGES[code] || "Gemini is temporarily unavailable.", statusForErrorCode(code), { diagnostics });
}

export function logCompanyAiFailure(error: unknown, context: { companyId?: string; model?: string; stage?: string } = {}) {
  const normalized = error instanceof CompanyAiError ? error : companyAiProviderError(error, { assumeProviderError: true, model: context.model, stage: context.stage });
  if (!normalized) return null;
  const diagnostics = normalized.diagnostics || {};
  console.warn("company-ai-failure", {
    correlationRef: normalized.correlationRef,
    companyId: context.companyId || "unknown",
    code: normalized.code,
    status: normalized.status,
    providerStatus: diagnostics.httpStatus || null,
    classification: diagnostics.classification || normalized.code,
    model: context.model || diagnostics.model || null,
    stage: context.stage || diagnostics.stage || null,
    timestamp: new Date().toISOString(),
  });
  return normalized;
}

export function isCompanyAiAuthenticationError(error: unknown) {
  const message = providerMessage(error);
  const status = providerHttpStatus(error);
  const cause = (error as any)?.cause;
  if (status === 401 || /invalid api key|api key (?:is )?(?:not valid|invalid)|api key authentication failed|credential authentication failed|authentication failed for (?:the )?(?:gemini )?api key|unauthorized.*api key/.test(message)) return true;
  if (cause && cause !== error) return isCompanyAiAuthenticationError(cause);
  return false;
}

/** Resolve once for an AI operation, then re-resolve at most once after an
 * upstream authentication failure. The retry uses the same company scope and
 * never falls through to another company's or a global production key. */
export async function withCompanyAiRuntime<T>(
  options: { supabase: SupabaseClient; credentialSupabase?: SupabaseClient; companyId: string; environment?: NodeJS.ProcessEnv; forceRefresh?: boolean },
  operation: (runtime: CompanyAiRuntime) => Promise<T>,
): Promise<T> {
  let runtime = await resolveCompanyAiRuntime(options);
  try {
    return await operation(runtime);
  } catch (error) {
    if (!isCompanyAiCredentialFailure(error)) {
      const normalized = companyAiProviderError(error, { assumeProviderError: true, stage: "primary" });
      if (normalized) {
        logCompanyAiFailure(normalized, { companyId: options.companyId, stage: "primary" });
        throw normalized;
      }
      throw error;
    }
    logCompanyAiFailure(error, { companyId: options.companyId, stage: "credential-refresh" });
    invalidateCompanyAiRuntime(options.companyId);
    runtime = await resolveCompanyAiRuntime({ ...options, forceRefresh: true });
    try {
      return await operation(runtime);
    } catch (retryError) {
      if (isCompanyAiCredentialFailure(retryError)) {
        try { await markCompanyAiCredentialInvalid({ supabase: options.credentialSupabase, companyId: options.companyId }); } catch { /* preserve the provider failure without leaking details */ }
        invalidateCompanyAiRuntime(options.companyId);
        const normalized = new CompanyAiError("AI_CREDENTIAL_INVALID", COMPANY_AI_MESSAGES.AI_CREDENTIAL_INVALID, 503, { diagnostics: { stage: "credential-refresh-retry", classification: "AI_CREDENTIAL_INVALID" } });
        logCompanyAiFailure(normalized, { companyId: options.companyId, stage: "credential-refresh-retry" });
        throw normalized;
      }
      const normalized = companyAiProviderError(retryError, { assumeProviderError: true, stage: "retry" });
      if (normalized) {
        logCompanyAiFailure(normalized, { companyId: options.companyId, stage: "retry" });
        throw normalized;
      }
      throw retryError;
    }
  }
}

async function testCompanyAiRuntimeRequest(runtime: CompanyAiRuntime, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await runtime.geminiClient.models.generateContent({
      model: runtime.primaryModel,
      contents: [{ parts: [{ text: "Reply with the single word OK." }] }],
      config: { responseMimeType: "text/plain", maxOutputTokens: 8, abortSignal: controller.signal },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error("AI request timed out.");
      Object.assign(timeoutError, { name: "CompanyAiTimeoutError", companyAiTimeout: true });
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function testCompanyAiRuntime(runtime: CompanyAiRuntime, options: { timeoutMs?: number } = {}): Promise<CompanyAiTestStatus> {
  try {
    await testCompanyAiRuntimeRequest(runtime, options.timeoutMs ?? 15_000);
    return "SUCCESS";
  } catch (error) {
    return classifyCompanyAiProviderError(error);
  }
}

export async function testCompanyAiConnection(options: { supabase: SupabaseClient; companyId: string; environment?: NodeJS.ProcessEnv }) {
  let result: CompanyAiTestStatus;
  let failureCode: CompanyAiErrorCode | string | undefined;
  let failureReference: string | undefined;
  try {
    await withCompanyAiRuntime({ ...options, forceRefresh: true }, (runtime) => testCompanyAiRuntimeRequest(runtime, 15_000));
    result = "SUCCESS";
  } catch (error) {
    const normalized = error instanceof CompanyAiError ? error : companyAiProviderError(error, { assumeProviderError: true, stage: "test-connection" });
    if (!normalized) throw error;
    if (["AI_NOT_CONFIGURED_FOR_COMPANY", "AI_DISABLED_FOR_COMPANY", "AI_CONFIG_UNAVAILABLE", "AI_CREDENTIALS_SERVER_MISCONFIGURED", "AI_CREDENTIAL_UNAVAILABLE"].includes(normalized.code)) throw normalized;
    logCompanyAiFailure(normalized, { companyId: options.companyId, model: COMPANY_AI_PRIMARY_MODEL, stage: "test-connection" });
    result = testStatusForErrorCode(normalized.code);
    failureCode = normalized.code;
    failureReference = normalized.correlationRef;
  }
  const metadata: CompanyAiConfigMetadata = await recordCompanyAiTest(options.supabase, options.companyId, result);
  if (result === "INVALID_CREDENTIAL") invalidateCompanyAiRuntime(options.companyId);
  return { status: result, metadata, ...(failureCode ? { errorCode: failureCode } : {}), ...(failureReference ? { reference: failureReference } : {}) };
}

export async function readCompanyAiMetadata(supabase: SupabaseClient, companyId: string) {
  return loadCompanyAiConfig(supabase, companyId);
}
