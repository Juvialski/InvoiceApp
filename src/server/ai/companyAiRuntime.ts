import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCompanyGeminiCredential, readAiCredentialsMasterKey } from "./companyAiEncryption.ts";
import { loadCompanyAiConfig, recordCompanyAiTest, resolveCompanyAiCredential } from "./companyAiCredentials.ts";
import {
  COMPANY_AI_FALLBACK_MODEL,
  COMPANY_AI_PRIMARY_MODEL,
  COMPANY_AI_PROVIDER,
  CompanyAiError,
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
  if (!apiKey) throw new CompanyAiError("AI_NOT_CONFIGURED_FOR_COMPANY", "AI services have not been configured for this company.", 503);
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

export async function resolveCompanyAiRuntime(options: { supabase: SupabaseClient; companyId: string; now?: number; forceRefresh?: boolean; environment?: NodeJS.ProcessEnv }): Promise<CompanyAiRuntime> {
  const companyId = typeof options.companyId === "string" ? options.companyId.trim() : "";
  if (!companyId) throw new CompanyAiError("AI_CONFIG_UNAVAILABLE", "Company AI configuration is temporarily unavailable.", 503);
  const now = options.now ?? Date.now();
  pruneRuntimeCache(now);
  const cachedEntry = [...runtimeCache.entries()].find(([, entry]) => entry.runtime.companyId === companyId && entry.expiresAt > now);
  if (!options.forceRefresh && cachedEntry) {
    cachedEntry[1].lastAccessedAt = now;
    return cachedEntry[1].runtime;
  }

  const resolution = await resolveCompanyAiCredential({ supabase: options.supabase, companyId });
  if (!resolution) {
    const fallback = globalFallbackRuntime(companyId, options.environment);
    if (fallback) return fallback;
    throw new CompanyAiError("AI_NOT_CONFIGURED_FOR_COMPANY", "AI services have not been configured for this company. Ask the platform administrator to add a Gemini API key.", 503);
  }
  if (resolution.status === "INVALID") throw new CompanyAiError("AI_CREDENTIAL_INVALID", "The Gemini credential configured for this company is invalid. Ask the platform administrator to replace it.", 503);
  if (resolution.status === "DISABLED") throw new CompanyAiError("AI_DISABLED_FOR_COMPANY", "AI services are disabled for this company.", 503);
  if (!resolution.credential) throw new CompanyAiError("AI_NOT_CONFIGURED_FOR_COMPANY", "AI services have not been configured for this company. Ask the platform administrator to add a Gemini API key.", 503);
  if (!resolution.enabled) throw new CompanyAiError("AI_DISABLED_FOR_COMPANY", "AI services are disabled for this company.", 503);

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
  if (status === 401 || status === 403 || /invalid api key|api key not valid|authentication|unauthenticated|permission denied/.test(message)) return "INVALID_CREDENTIAL";
  if (status === 429 || /quota|rate limit|resource exhausted/.test(message)) return "QUOTA_LIMITED";
  if (/model.*(not found|unavailable)|not found.*model|unsupported model/.test(message)) return "MODEL_UNAVAILABLE";
  return "PROVIDER_UNAVAILABLE";
}

export function isCompanyAiAuthenticationError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  const status = Number((error as any)?.status || (error as any)?.statusCode || 0);
  const cause = (error as any)?.cause;
  if (status === 401 || status === 403 || /invalid api key|api key not valid|authentication|unauthenticated|permission denied/.test(message)) return true;
  if (cause && cause !== error) return isCompanyAiAuthenticationError(cause);
  return false;
}

/** Resolve once for an AI operation, then re-resolve at most once after an
 * upstream authentication failure. The retry uses the same company scope and
 * never falls through to another company's or a global production key. */
export async function withCompanyAiRuntime<T>(
  options: { supabase: SupabaseClient; companyId: string; environment?: NodeJS.ProcessEnv },
  operation: (runtime: CompanyAiRuntime) => Promise<T>,
): Promise<T> {
  let runtime = await resolveCompanyAiRuntime(options);
  try {
    return await operation(runtime);
  } catch (error) {
    if (!isCompanyAiAuthenticationError(error)) throw error;
    invalidateCompanyAiRuntime(options.companyId);
    runtime = await resolveCompanyAiRuntime({ ...options, forceRefresh: true });
    try {
      return await operation(runtime);
    } catch (retryError) {
      if (isCompanyAiAuthenticationError(retryError)) {
        try { await recordCompanyAiTest(options.supabase, options.companyId, "INVALID_CREDENTIAL"); } catch { /* preserve the provider failure without leaking details */ }
        invalidateCompanyAiRuntime(options.companyId);
      }
      throw retryError;
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
  await recordCompanyAiTest(options.supabase, options.companyId, result);
  if (result === "INVALID_CREDENTIAL") invalidateCompanyAiRuntime(options.companyId);
  return result;
}

export async function readCompanyAiMetadata(supabase: SupabaseClient, companyId: string) {
  return loadCompanyAiConfig(supabase, companyId);
}
