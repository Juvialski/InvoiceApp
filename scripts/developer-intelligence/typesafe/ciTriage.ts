import { choice } from "@typesafe-ai/sdk";
import { extractFailureContext } from "../../ci-failure-context.ts";
import {
  invokeTypeSafe,
  type TypeSafeGateway,
} from "./client.ts";
import { markTypeSafeFallback } from "./diagnostics.ts";
import type { TypeSafeDiagnostic } from "./contracts.ts";
import { sanitizeTypeSafePayload } from "./sanitize.ts";

export const CI_FAILURE_CATEGORIES = [
  "lint",
  "typecheck",
  "unit-test",
  "browser",
  "build",
  "migration/database",
  "workflow-map",
  "provider/external",
  "infrastructure/flaky",
  "unknown",
] as const;

export type CiFailureCategory = typeof CI_FAILURE_CATEGORIES[number];

export interface CiFailureTriageOptions {
  readonly excerpt: string;
  readonly command?: string;
  readonly task?: string;
  readonly gateway?: TypeSafeGateway;
  readonly env?: NodeJS.ProcessEnv;
  readonly live?: boolean;
  readonly timeoutMs?: number;
}

export interface CiFailureTriageResult {
  readonly advisoryOnly: true;
  readonly category: CiFailureCategory;
  readonly confidence?: number;
  readonly fallback: boolean;
  readonly diagnostic: TypeSafeDiagnostic;
}

function includesAny(value: string, markers: readonly string[]): boolean {
  return markers.some((marker) => value.includes(marker));
}

export function deterministicCiFailureCategory(excerpt: string, command = ""): CiFailureCategory {
  const value = `${command}\n${excerpt}`.toLocaleLowerCase();
  if (includesAny(value, ["playwright", "chromium", "browser", "locator", "page.goto", "visual qa"])) return "browser";
  if (includesAny(value, ["migration", "supabase", "postgres", "postgresql", "rls", "rpc", "database", "sqlstate"])) return "migration/database";
  if (includesAny(value, ["workflow-map", "agent:context", "graph and source contract", "source contract consistency"])) return "workflow-map";
  if (includesAny(value, ["eslint", "lint", "no-unused-vars"])) return "lint";
  if (includesAny(value, ["tsc", "typecheck", "type error", "ts####"])) return "typecheck";
  if (includesAny(value, ["vite build", "esbuild", "build failed", "production build"])) return "build";
  if (includesAny(value, ["brevo", "sms", "provider", "external api", "typesafe api"])) return "provider/external";
  if (includesAny(value, ["timeout", "timed out", "econnreset", "network", "runner", "flaky", "out of memory"])) return "infrastructure/flaky";
  if (includesAny(value, ["node --test", "not ok", "assertionerror", "unit test", "# fail"])) return "unit-test";
  return "unknown";
}

function fallbackResult(category: CiFailureCategory, diagnostic: TypeSafeDiagnostic): CiFailureTriageResult {
  return { advisoryOnly: true, category, fallback: true, diagnostic };
}

export async function classifyCiFailure(options: CiFailureTriageOptions): Promise<CiFailureTriageResult> {
  const initialSafe = sanitizeTypeSafePayload({ excerpt: options.excerpt, command: options.command || "" });
  if (!initialSafe.ok) return fallbackResult("unknown", { durationMs: 0, fallbackReason: "sanitizer-rejected" });
  const boundedExcerpt = extractFailureContext(options.excerpt, { maxLines: 40, maxChars: 4_000, contextLines: 4 });
  const safe = sanitizeTypeSafePayload({ excerpt: boundedExcerpt, command: options.command || "" });
  if (!safe.ok) return fallbackResult("unknown", { durationMs: 0, fallbackReason: "sanitizer-rejected" });
  const category = deterministicCiFailureCategory(boundedExcerpt, options.command);
  const questions = {
    category: choice("Which closed category best explains this sanitized CI failure excerpt?", Object.fromEntries(CI_FAILURE_CATEGORIES.map((item) => [item, null]))),
  };
  const response = await invokeTypeSafe<{ readonly answers?: { readonly category?: { readonly choice?: unknown; readonly confidence?: unknown } } }>(
    { state: { task: options.task || "Classify a CI failure", command: options.command || "", excerpt: boundedExcerpt }, questions },
    { gateway: options.gateway, env: options.env, live: options.live, timeoutMs: options.timeoutMs, checkpoint: "ci-triage", itemKind: "evidence", candidateCount: 1, liveResultUsed: true },
  );
  if (!response.ok) return fallbackResult(category, response.diagnostic);
  const answer = response.value.answers?.category;
  const selected = answer?.choice;
  if (typeof selected !== "string" || !(CI_FAILURE_CATEGORIES as readonly string[]).includes(selected)) {
    return fallbackResult(category, markTypeSafeFallback(response.diagnostic, "invalid-response"));
  }
  return {
    advisoryOnly: true,
    category: selected as CiFailureCategory,
    ...(typeof answer.confidence === "number" && Number.isFinite(answer.confidence) ? { confidence: answer.confidence } : {}),
    fallback: false,
    diagnostic: { ...response.diagnostic, candidateCount: 1, selectedCount: 1 },
  };
}
