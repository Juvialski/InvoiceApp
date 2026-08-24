import { GoogleGenAI, type GenerateContentConfig, type GenerateContentResponse, type GenerateContentParameters } from "@google/genai";
import { AssistantBackendError } from "./assistantBackendTypes.ts";

export const ASSISTANT_PRIMARY_MODEL = "gemini-3.5-flash-lite";
export const ASSISTANT_FALLBACK_MODEL = "gemini-3.7-flash";
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

export function createAssistantGeminiClient(apiKey = process.env.GEMINI_API_KEY): AssistantModelClient {
  if (!apiKey?.trim()) throw new AssistantBackendError("MODEL_UNAVAILABLE", "The assistant model is not configured.", 503);
  return new GoogleGenAI({ apiKey: apiKey.trim(), httpOptions: { headers: { "User-Agent": "invoiceapp-assistant" } } });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : "model request failed";
}

async function generateWithTimeout(client: AssistantModelClient, model: string, call: AssistantModelCall, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await client.models.generateContent({ model, contents: call.contents, config: { ...call.config, abortSignal: controller.signal } });
  } finally {
    clearTimeout(timer);
  }
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
        if (hasUsedFallback) throw new AssistantBackendError("MODEL_FAILED", `The assistant model failed: ${errorMessage(primaryError)}`, 503);
        hasUsedFallback = true;
        try {
          const response = await generateWithTimeout(client, ASSISTANT_FALLBACK_MODEL, call, timeoutMs);
          return { response, model: ASSISTANT_FALLBACK_MODEL, fallbackUsed: true };
        } catch (fallbackError) {
          throw new AssistantBackendError("MODEL_FAILED", `The assistant model failed: ${errorMessage(fallbackError)}`, 503);
        }
      }
    },
  };
}
