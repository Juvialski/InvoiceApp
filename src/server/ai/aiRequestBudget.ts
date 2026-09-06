import type { SupabaseClient } from "@supabase/supabase-js";

export type AiRequestOperation =
  | "INVOICE_EXTRACTION"
  | "EXPENSE_EXTRACTION"
  | "EMAIL_CLASSIFICATION"
  | "EMAIL_BATCH_CLASSIFICATION"
  | "ASSISTANT";

export class AiRequestBudgetError extends Error {
  readonly status: number;
  readonly code: "AI_BUDGET_UNAVAILABLE" | "AI_RATE_LIMITED" | "AI_CONCURRENCY_LIMITED";

  constructor(status: number, code: AiRequestBudgetError["code"], message: string) {
    super(message);
    this.name = "AiRequestBudgetError";
    this.status = status;
    this.code = code;
  }
}

export async function claimAiRequest(
  client: SupabaseClient,
  companyId: string,
  operation: AiRequestOperation,
  limits: { maxRequests?: number; maxConcurrency?: number; windowSeconds?: number } = {},
) {
  const { data, error } = await client.rpc("claim_company_ai_request", {
    p_company_id: companyId,
    p_operation: operation,
    p_window_seconds: limits.windowSeconds ?? 60,
    p_max_requests: limits.maxRequests ?? 30,
    p_max_concurrency: limits.maxConcurrency ?? 2,
  });
  if (error) throw new AiRequestBudgetError(503, "AI_BUDGET_UNAVAILABLE", "AI request protection is temporarily unavailable. Try again shortly.");
  if (data === true) return { allowed: true, compatibility: true };
  const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
  if (result.allowed === true) return result;
  const reason = String(result.reason || "RATE_LIMITED");
  if (reason === "CONCURRENCY_LIMITED") {
    throw new AiRequestBudgetError(429, "AI_CONCURRENCY_LIMITED", "This company already has the maximum number of AI requests in progress. Try again shortly.");
  }
  throw new AiRequestBudgetError(429, "AI_RATE_LIMITED", "This AI operation is temporarily rate limited. Try again shortly.");
}

export async function releaseAiRequest(client: SupabaseClient, companyId: string, operation: AiRequestOperation) {
  const { error } = await client.rpc("release_company_ai_request", {
    p_company_id: companyId,
    p_operation: operation,
  });
  if (error) console.warn("ai-request-budget-release-failed", { operation });
}
