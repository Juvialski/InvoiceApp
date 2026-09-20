import { choice } from "@typesafe-ai/sdk";
import {
  createTypeSafeGateway,
  invokeTypeSafe,
  TYPESAFE_SDK_VERSION,
} from "./client.ts";
import { hasTypeSafeApiKey } from "./sanitize.ts";
import type {
  TypeSafeDoctorResult,
  TypeSafeGateway,
} from "./contracts.ts";

const CATEGORIES = ["ui", "database", "security", "documentation", "unknown"] as const;

export async function runTypeSafeDoctor(options: {
  readonly env?: NodeJS.ProcessEnv;
  readonly gateway?: TypeSafeGateway;
  readonly live?: boolean;
} = {}): Promise<TypeSafeDoctorResult> {
  const env = options.env || process.env;
  const keyPresent = hasTypeSafeApiKey(env);
  const liveRequested = options.live === true;
  const base = {
    keyPresent,
    sdkVersion: TYPESAFE_SDK_VERSION,
    nodeVersion: process.version,
    liveRequested,
  } as const;
  if (!liveRequested) return { ...base, live: "not-requested" };
  if (!keyPresent) return { ...base, live: "unavailable", fallbackReason: "missing-api-key" };

  const result = await invokeTypeSafe<{ readonly answers?: { readonly category?: { readonly choice?: unknown } }; readonly model?: unknown }>(
    {
      state: { task: "Synthetic connectivity check", repositoryData: "none" },
      questions: {
        category: choice("Choose the category for this synthetic developer-tooling check.", {
          ui: null,
          database: null,
          security: null,
          documentation: null,
          unknown: null,
        }),
      },
    },
    { env, gateway: options.gateway, live: true },
  );
  if (!result.ok) return { ...base, live: "failed", fallbackReason: result.diagnostic.fallbackReason };
  const category = result.value.answers?.category?.choice;
  if (typeof category !== "string" || !CATEGORIES.includes(category as typeof CATEGORIES[number])) {
    return { ...base, live: "failed", fallbackReason: "invalid-response" };
  }
  return {
    ...base,
    live: "succeeded",
    category,
    ...(result.diagnostic.model ? { model: result.diagnostic.model } : {}),
    latencyMs: result.diagnostic.durationMs,
  };
}
