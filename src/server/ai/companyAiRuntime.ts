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

export function classifyCompanyAiProviderError(error: unknown): CompanyAiTestStatus {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  const status = Number((error as any)?.status || (error as any)?.statusCode || 0);
  if (isCompanyAiAuthenticationError(error)) return "INVALID_CREDENTIAL";
  if (status === 403 || /permission denied|access denied|not authorized|api(?: is)? not enabled|organization policy|model access/.test(message)) return "PROVIDER_ACCESS_DENIED";
  if (status === 429 || /quota|rate limit|resource exhausted/.test(message)) return "QUOTA_LIMITED";
  if (/model.*(not found|unavailable)|not found.*model|unsupported model/.test(message)) return "MODEL_UNAVAILABLE";
  return "PROVIDER_UNAVAILABLE";
}

function likelyCompanyAiProviderError(error: unknown) {
  if (!error || error instanceof CompanyAiError) return false;
  const name = String((error as any)?.name || "");
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  if (/api(?:authorization|backend)|assistantbackend|assistanttool/.test(name.toLowerCase())) return false;
  const status = Number((error as any)?.status || (error as any)?.statusCode || 0);
  return /apierror|google|gemini|generative|fetcherror|aborterror/.test(name.toLowerCase())
    || isCompanyAiAuthenticationError(error)
    || status === 429
    || /api key|gemini|google|generative|quota|rate limit|resource exhausted|model (?:not found|unavailable)|provider|fetch failed|network|timed out|timeout|aborted|permission denied|access denied/.test(message);
}

export function companyAiProviderError(error: unknown): CompanyAiError | null {
  if (!likelyCompanyAiProviderError(error)) return null;
  const providerStatus = classifyCompanyAiProviderError(error);
  if (providerStatus === "INVALID_CREDENTIAL") return new CompanyAiError("AI_CREDENTIAL_INVALID", "The configured Gemini API key is invalid.", 503);
  if (providerStatus === "QUOTA_LIMITED") return new CompanyAiError("AI_QUOTA_LIMITED", "Gemini quota or rate limit reached.", 429);
  if (providerStatus === "MODEL_UNAVAILABLE") return new CompanyAiError("AI_MODEL_UNAVAILABLE", "The configured Gemini model is unavailable.", 503);
  if (providerStatus === "PROVIDER_ACCESS_DENIED") return new CompanyAiError("AI_PROVIDER_ACCESS_DENIED", "Gemini access is denied for the configured provider project.", 503);
  return new CompanyAiError("AI_PROVIDER_UNAVAILABLE", "Gemini is temporarily unavailable.", 503);
}

export function isCompanyAiAuthenticationError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  const status = Number((error as any)?.status || (error as any)?.statusCode || 0);
  const cause = (error as any)?.cause;
  if (status === 401 || /invalid api key|api key (?:is )?(?:not valid|invalid)|api key authentication failed|credential authentication failed|authentication failed for (?:the )?(?:gemini )?api key/.test(message)) return true;
  if (cause && cause !== error) return isCompanyAiAuthenticationError(cause);
  return false;
}

/** Resolve once for an AI operation, then re-resolve at most once after an
 * upstream authentication failure. The retry uses the same company scope and
 * never falls through to another company's or a global production key. */
export async function withCompanyAiRuntime<T>(
  options: { supabase: SupabaseClient; credentialSupabase?: SupabaseClient; companyId: string; environment?: NodeJS.ProcessEnv },
  operation: (runtime: CompanyAiRuntime) => Promise<T>,
): Promise<T> {
  let runtime = await resolveCompanyAiRuntime(options);
  try {
    return await operation(runtime);
  } catch (error) {
    if (!isCompanyAiAuthenticationError(error)) throw companyAiProviderError(error) || error;
    invalidateCompanyAiRuntime(options.companyId);
    runtime = await resolveCompanyAiRuntime({ ...options, forceRefresh: true });
    try {
      return await operation(runtime);
    } catch (retryError) {
      if (isCompanyAiAuthenticationError(retryError)) {
        try { await markCompanyAiCredentialInvalid({ supabase: options.credentialSupabase, companyId: options.companyId }); } catch { /* preserve the provider failure without leaking details */ }
        invalidateCompanyAiRuntime(options.companyId);
        throw new CompanyAiError("AI_CREDENTIAL_INVALID", "The configured Gemini API key is invalid.", 503);
      }
      throw companyAiProviderError(retryError) || retryError;
    }
  }
}

export async function testCompanyAiRuntime(runtime: CompanyAiRuntime, options: { timeoutMs?: number } = {}): Promise<CompanyAiTestStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    await runtime.geminiClient.models.generateContent({
      model: runtime.primaryModel,
      contents: [{ parts: [{ text: "Reply with the single word OK." }] }],
      config: { responseMimeType: "text/plain", maxOutputTokens: 8, abortSignal: controller.signal },
    });
    return "SUCCESS";
  } catch (error) {
    return classifyCompanyAiProviderError(error);
  } finally {
    clearTimeout(timer);
  }
}

export async function testCompanyAiConnection(options: { supabase: SupabaseClient; companyId: string; environment?: NodeJS.ProcessEnv }) {
  const runtime = await resolveCompanyAiRuntime({ ...options, forceRefresh: true });
  const result = await testCompanyAiRuntime(runtime);
  const metadata: CompanyAiConfigMetadata = await recordCompanyAiTest(options.supabase, options.companyId, result);
  if (result === "INVALID_CREDENTIAL") invalidateCompanyAiRuntime(options.companyId);
  return { status: result, metadata };
}

export async function readCompanyAiMetadata(supabase: SupabaseClient, companyId: string) {
  return loadCompanyAiConfig(supabase, companyId);
}
