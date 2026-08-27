import { type GenerateContentConfig, type GenerateContentResponse, type GenerateContentParameters } from "@google/genai";
import { companyAiProviderError, isCompanyAiFallbackEligible } from "../ai/companyAiRuntime.ts";
import { COMPANY_AI_FALLBACK_MODEL, COMPANY_AI_PRIMARY_MODEL } from "../ai/companyAiTypes.ts";
import { AssistantBackendError } from "./assistantBackendTypes.ts";

export const ASSISTANT_PRIMARY_MODEL = COMPANY_AI_PRIMARY_MODEL;
export const ASSISTANT_FALLBACK_MODEL = COMPANY_AI_FALLBACK_MODEL;
export const ASSISTANT_MODEL_TIMEOUT_MS = 30_000;

export interface AssistantModelClient {
  models: {
    generateContent: (parameters: GenerateContentParameters) => Promise<GenerateContentResponse>;
  };
}

export interface AssistantModelCall {
  contents: GenerateContentParameters["contents"];
  config: GenerateContentConfig;
}

export interface AssistantModelResult {
  response: GenerateContentResponse;
  model: string;
  fallbackUsed: boolean;
}

export interface AssistantModelRunner {
  generate(call: AssistantModelCall): Promise<AssistantModelResult>;
  readonly fallbackUsed: boolean;
}

async function generateWithTimeout(client: AssistantModelClient, model: string, call: AssistantModelCall, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await client.models.generateContent({ model, contents: call.contents, config: { ...call.config, abortSignal: controller.signal } });
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

function toolDeclarationCount(call: AssistantModelCall) {
  const tools = call.config.tools;
  if (!Array.isArray(tools)) return 0;
  return tools.reduce((count, tool) => {
    const declarations = tool && typeof tool === "object" ? (tool as { functionDeclarations?: unknown }).functionDeclarations : undefined;
    return count + (Array.isArray(declarations) ? declarations.length : 0);
  }, 0);
}

function normalizeModelError(error: unknown, model: string, stage: string, call: AssistantModelCall) {
  const declarations = toolDeclarationCount(call);
  return companyAiProviderError(error, {
    assumeProviderError: true,
    model,
    stage,
    diagnostics: { requestKind: "assistant", toolDeclarationCount: declarations },
  })
    || new AssistantBackendError("MODEL_FAILED", "The assistant model failed safely.", 503);
}

export function createAssistantModelRunner(client: AssistantModelClient, options: { timeoutMs?: number } = {}): AssistantModelRunner {
  const timeoutMs = Math.max(1_000, Math.min(options.timeoutMs ?? ASSISTANT_MODEL_TIMEOUT_MS, ASSISTANT_MODEL_TIMEOUT_MS));
  let hasUsedFallback = false;
  return {
    get fallbackUsed() {
      return hasUsedFallback;
    },
    async generate(call) {
      const model = hasUsedFallback ? ASSISTANT_FALLBACK_MODEL : ASSISTANT_PRIMARY_MODEL;
      try {
        const response = await generateWithTimeout(client, model, call, timeoutMs);
        return { response, model, fallbackUsed: hasUsedFallback };
      } catch (primaryError) {
        const normalizedPrimary = normalizeModelError(primaryError, model, hasUsedFallback ? "assistant-fallback" : "assistant-primary", call);
        if (hasUsedFallback || !isCompanyAiFallbackEligible(normalizedPrimary)) throw normalizedPrimary;
        hasUsedFallback = true;
        try {
          const response = await generateWithTimeout(client, ASSISTANT_FALLBACK_MODEL, call, timeoutMs);
          return { response, model: ASSISTANT_FALLBACK_MODEL, fallbackUsed: true };
        } catch (fallbackError) {
          throw normalizeModelError(fallbackError, ASSISTANT_FALLBACK_MODEL, "assistant-fallback", call);
        }
      }
    },
  };
}
