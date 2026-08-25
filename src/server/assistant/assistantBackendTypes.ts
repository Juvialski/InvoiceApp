import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AssistantClientAction, AssistantContext, AssistantPreparedAction, AssistantReference, AssistantRiskTier } from "../../assistant/assistantTypes.ts";

export type AssistantRow = Record<string, unknown>;

export interface AssistantAuthContext {
  accessToken: string;
  companyId: string;
  supabase: SupabaseClient;
  user: User;
}

export interface AssistantActionEventRecord {
  id: string;
  company_id: string;
  user_id: string;
  thread_id: string | null;
  tool_name: string;
  risk_tier: AssistantRiskTier;
  normalized_args: Record<string, unknown>;
  args_hash: string;
  preview: Record<string, unknown>;
  status: AssistantPreparedAction["status"];
  expires_at: string;
  confirmed_at?: string | null;
  executed_at?: string | null;
  result_summary?: Record<string, unknown> | null;
  error_summary?: Record<string, unknown> | null;
  idempotency_key: string;
  created_at?: string;
  updated_at?: string;
}

export interface PreparedActionRequest {
  toolName: string;
  riskTier: AssistantRiskTier;
  normalizedArgs: Record<string, unknown>;
  preview: Record<string, unknown>;
  contextGeneration: number;
}

export interface AssistantToolContext {
  auth: AssistantAuthContext;
  context: AssistantContext;
  now: Date;
  prepareAction: (request: PreparedActionRequest) => Promise<ToolExecutionResult>;
}

export interface ToolExecutionResult {
  output: Record<string, unknown>;
  references?: AssistantReference[];
  clientActions?: AssistantClientAction[];
  preparedAction?: AssistantPreparedAction;
  normalizedArgs?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
}

export class AssistantBackendError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly correlationRef?: string;

  constructor(code: string, message: string, status = 400, details?: Record<string, unknown>, correlationRef?: string) {
    super(message);
    this.name = "AssistantBackendError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.correlationRef = correlationRef;
  }
}

export class AssistantToolError extends AssistantBackendError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 400, details);
    this.name = "AssistantToolError";
  }
}
