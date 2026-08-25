import express, { type Request, type RequestHandler, type Response, type Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { compactAssistantContext } from "../../assistant/assistantContext.ts";
import type { AssistantApiResponse, AssistantAttachmentReference, AssistantContext, AssistantPreparedAction, AssistantRequest, AssistantResponse, AssistantSuccessResponse } from "../../assistant/assistantTypes.ts";
import { type AssistantModelClient, type AssistantModelRunner } from "./assistantModels.ts";
import { prepareAssistantAttachments } from "./assistantAttachments.ts";
import { buildAssistantSystemPrompt, buildAssistantUserPrompt } from "./assistantPrompt.ts";
import { AssistantBackendError, type AssistantActionEventRecord, type AssistantAuthContext, type AssistantToolContext, type ToolExecutionResult } from "./assistantBackendTypes.ts";
import { runAssistantLoop } from "./assistantLoop.ts";
import { executePreparedAction } from "./assistantToolExecutors.ts";
import { getAssistantToolDefinition } from "./toolRegistry.ts";
import { requireCompanyPermissions } from "./toolAuthorization.ts";
import { boundToolValue, toolOk } from "./toolResults.ts";
import { isUuid, requireUuid, validateAssistantMessage, validateToolArguments } from "./toolValidation.ts";
import { withCompanyAiRuntime } from "../ai/companyAiRuntime.ts";
import { CompanyAiError } from "../ai/companyAiTypes.ts";

const ACTION_TTL_MS = 10 * 60 * 1000;
const UUID_HEADER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function currencySymbolFor(currency: string) {
  return ({ PHP: "₱", USD: "$", EUR: "€", SGD: "S$", JPY: "¥", GBP: "£" } as Record<string, string>)[currency] || `${currency} `;
}

export interface AssistantHandlerOptions {
  now?: () => Date;
  createSupabaseClient?: (accessToken: string) => SupabaseClient;
  createModelClient?: (auth: AssistantAuthContext) => AssistantModelClient;
  createModelRunner?: (client: AssistantModelClient) => AssistantModelRunner;
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function bearerToken(req: Request) {
  const header = firstHeader(req.headers.authorization);
  const match = header.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new AssistantBackendError("UNAUTHENTICATED", "A valid InvoiceApp session is required.", 401);
  return match[1];
}

function serverSupabaseClient(accessToken: string) {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const publishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  if (!url || !publishableKey || /service[_-]?role|secret/i.test(publishableKey)) throw new AssistantBackendError("SERVER_AUTH_UNAVAILABLE", "Company authorization is not configured on the server.", 503);
  return createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } } });
}

export async function authenticateAssistantRequest(req: Request, options: AssistantHandlerOptions = {}): Promise<AssistantAuthContext> {
  const accessToken = bearerToken(req);
  const supabase = options.createSupabaseClient ? options.createSupabaseClient(accessToken) : serverSupabaseClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) throw new AssistantBackendError("UNAUTHENTICATED", "A valid InvoiceApp session is required.", 401);
  const companyId = firstHeader(req.headers["x-company-id"]).trim();
  if (!UUID_HEADER_PATTERN.test(companyId)) throw new AssistantBackendError("COMPANY_REQUIRED", "A valid company context is required.", 400);
  const [membership, platform] = await Promise.all([
    supabase.rpc("is_active_company_member", { p_company_id: companyId }),
    supabase.rpc("is_platform_admin"),
  ]);
  if (membership.error || platform.error) throw new AssistantBackendError("AUTHORIZATION_UNAVAILABLE", "Company authorization is temporarily unavailable.", 503);
  if (membership.data !== true && platform.data !== true) throw new AssistantBackendError("FORBIDDEN", "You do not have access to this company.", 403);
  return { accessToken, companyId, supabase, user: data.user };
}

function requestBody(req: Request) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) throw new AssistantBackendError("INVALID_REQUEST", "The assistant request must be a JSON object.", 400);
  return req.body as Record<string, unknown>;
}

function requestContext(body: Record<string, unknown>, companyId: string): AssistantContext {
  const raw = body.context && typeof body.context === "object" && !Array.isArray(body.context) ? body.context as Record<string, unknown> : {};
  const generationValue = raw.generation;
  const generation = typeof generationValue === "number" && Number.isInteger(generationValue) && generationValue >= 0 && generationValue <= 2_000_000_000 ? generationValue : 0;
  return compactAssistantContext({
    route: typeof raw.route === "string" ? raw.route : undefined,
    companyId,
    companyName: typeof raw.companyName === "string" ? raw.companyName : undefined,
    companyTimezone: typeof raw.companyTimezone === "string" ? raw.companyTimezone : undefined,
    selectedInvoiceId: typeof raw.selectedInvoiceId === "string" && isUuid(raw.selectedInvoiceId) ? raw.selectedInvoiceId : undefined,
    selectedProjectId: typeof raw.selectedProjectId === "string" && isUuid(raw.selectedProjectId) ? raw.selectedProjectId : undefined,
    selectedPayrollPeriodId: typeof raw.selectedPayrollPeriodId === "string" && isUuid(raw.selectedPayrollPeriodId) ? raw.selectedPayrollPeriodId : undefined,
    selectedPayrollRunId: typeof raw.selectedPayrollRunId === "string" && isUuid(raw.selectedPayrollRunId) ? raw.selectedPayrollRunId : undefined,
    attendanceDate: typeof raw.attendanceDate === "string" ? raw.attendanceDate : undefined,
    activeFilters: raw.activeFilters && typeof raw.activeFilters === "object" && !Array.isArray(raw.activeFilters) ? raw.activeFilters as Record<string, string | number | boolean | null> : undefined,
    currency: typeof raw.currency === "string" ? raw.currency : undefined,
    locale: typeof raw.locale === "string" ? raw.locale : undefined,
    generation,
  });
}

function parseAssistantRequest(body: Record<string, unknown>, companyId: string): AssistantRequest {
  const message = validateAssistantMessage(body.message);
  const context = requestContext(body, companyId);
  const attachments = body.attachments === undefined ? undefined : body.attachments as AssistantRequest["attachments"];
  if (attachments && !Array.isArray(attachments)) throw new AssistantBackendError("INVALID_ATTACHMENTS", "Attachments must be an array.", 400);
  return { threadId: typeof body.threadId === "string" ? requireUuid(body.threadId, "threadId") : undefined, message, context, attachments };
}

async function hydrateWorkspaceContext(auth: AssistantAuthContext, context: AssistantContext): Promise<AssistantContext> {
  const result = await (auth.supabase as any).from("companies").select("name,timezone,default_currency").eq("id", auth.companyId).maybeSingle();
  if (result.error || !result.data) return context;
  return compactAssistantContext({
    ...context,
    companyName: typeof result.data.name === "string" ? result.data.name : context.companyName,
    companyTimezone: typeof result.data.timezone === "string" ? result.data.timezone : context.companyTimezone,
    currency: typeof result.data.default_currency === "string" ? result.data.default_currency : context.currency,
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) || "null";
}

function actionHash(auth: AssistantAuthContext, toolName: string, args: Record<string, unknown>, generation: number) {
  return createHash("sha256").update(stableJson({ companyId: auth.companyId, userId: auth.user.id, toolName, args, generation })).digest("hex");
}

function preparedActionFromEvent(event: AssistantActionEventRecord): AssistantPreparedAction {
  return { id: event.id, toolName: event.tool_name, riskTier: event.risk_tier, status: event.status, preview: event.preview, expiresAt: event.expires_at };
}

function preparedResult(event: AssistantActionEventRecord): ToolExecutionResult {
  const preparedAction = preparedActionFromEvent(event);
  return toolOk({ prepared: true, confirmationRequired: true, preview: event.preview, action: preparedAction }, { preparedAction });
}

async function loadThread(auth: AssistantAuthContext, threadId: string | undefined, context: AssistantContext) {
  const client = auth.supabase as any;
  if (threadId) {
    const thread = await client.from("assistant_threads").select("id,company_id,user_id,title,context,created_at,updated_at").eq("id", threadId).eq("company_id", auth.companyId).eq("user_id", auth.user.id).maybeSingle();
    if (thread.error) throw new AssistantBackendError("THREAD_UNAVAILABLE", "The assistant thread is temporarily unavailable.", 503);
    if (!thread.data) throw new AssistantBackendError("THREAD_NOT_FOUND", "That assistant thread is not available.", 404);
    await client.from("assistant_threads").update({ context, updated_at: new Date().toISOString() }).eq("id", threadId).eq("company_id", auth.companyId).eq("user_id", auth.user.id);
    return thread.data as { id: string };
  }
  const created = await client.from("assistant_threads").insert({ company_id: auth.companyId, user_id: auth.user.id, title: "Invoice Operations AI", context }).select("id").single();
  if (created.error || !created.data?.id) throw new AssistantBackendError("THREAD_UNAVAILABLE", "The assistant thread could not be created.", 503);
  return created.data as { id: string };
}

async function loadHistory(auth: AssistantAuthContext, threadId: string) {
  const result = await (auth.supabase as any).from("assistant_messages").select("role,content,created_at").eq("thread_id", threadId).eq("company_id", auth.companyId).eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(12);
  if (result.error) return [] as unknown[];
  const rows = Array.isArray(result.data) ? [...result.data].reverse() : [];
  return rows.map((row: Record<string, unknown>) => {
    const content = row.content && typeof row.content === "object" && !Array.isArray(row.content) ? row.content as Record<string, unknown> : {};
    const text = typeof content.text === "string" ? content.text.slice(0, 2_000) : "";
    if (!text) return null;
    return { role: row.role === "assistant" ? "model" : "user", parts: [{ text: `Previous ${row.role === "assistant" ? "assistant" : "user"} message (untrusted conversation context):\n${text}` }] };
  }).filter(Boolean) as unknown[];
}

async function persistMessage(auth: AssistantAuthContext, threadId: string, role: "user" | "assistant", content: Record<string, unknown>) {
  const result = await (auth.supabase as any).from("assistant_messages").insert({ company_id: auth.companyId, user_id: auth.user.id, thread_id: threadId, role, content }).select("id").single();
  if (result.error) throw new AssistantBackendError("ASSISTANT_PERSISTENCE_UNAVAILABLE", "The assistant conversation could not be saved.", 503);
}

async function persistAttachmentRefs(auth: AssistantAuthContext, threadId: string, attachments: ReturnType<typeof prepareAssistantAttachments>) {
  if (!attachments.length) return [] as AssistantAttachmentReference[];
  const rows = attachments.map((attachment) => ({ company_id: auth.companyId, user_id: auth.user.id, thread_id: threadId, file_name: attachment.reference.fileName, mime_type: attachment.reference.mimeType, byte_size: attachment.bytes, sha256: attachment.sha256, kind: attachment.reference.kind }));
  const result = await (auth.supabase as any).from("assistant_attachment_refs").upsert(rows, { onConflict: "company_id,user_id,sha256" }).select("id,file_name,mime_type,byte_size,kind");
  if (result.error) throw new AssistantBackendError("ATTACHMENT_PERSISTENCE_UNAVAILABLE", "Attachment metadata could not be saved.", 503);
  const persisted = Array.isArray(result.data) ? result.data as Record<string, unknown>[] : [];
  return attachments.map((attachment, index) => {
    const row = persisted.find((candidate) => String(candidate.file_name) === attachment.reference.fileName && String(candidate.mime_type).toLowerCase() === attachment.reference.mimeType) || persisted[index];
    return { ...attachment.reference, id: row?.id ? String(row.id) : "", size: attachment.bytes };
  });
}

function createPrepareAction(auth: AssistantAuthContext, threadId: string, context: AssistantContext, now: Date) {
  return async (request: Parameters<AssistantToolContext["prepareAction"]>[0]): Promise<ToolExecutionResult> => {
    const client = auth.supabase as any;
    const argsHash = actionHash(auth, request.toolName, request.normalizedArgs, request.contextGeneration);
    let idempotencyKey = `assistant:${argsHash}`;
    const existingResult = await client.from("assistant_action_events").select("*").eq("company_id", auth.companyId).eq("user_id", auth.user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existingResult.error) throw new AssistantBackendError("ASSISTANT_PERSISTENCE_UNAVAILABLE", "Prepared actions are temporarily unavailable.", 503);
    if (existingResult.data && ["PREPARED", "CONFIRMED", "EXECUTED"].includes(String(existingResult.data.status))) return preparedResult(existingResult.data as AssistantActionEventRecord);
    if (existingResult.data && String(existingResult.data.status) === "PREPARED" && new Date(String(existingResult.data.expires_at)).getTime() <= now.getTime()) {
      await client.from("assistant_action_events").update({ status: "EXPIRED", updated_at: now.toISOString() }).eq("id", String(existingResult.data.id)).eq("status", "PREPARED");
    }
    if (existingResult.data && ["EXPIRED", "FAILED", "CANCELLED"].includes(String(existingResult.data.status))) idempotencyKey = `${idempotencyKey}:retry:${now.getTime()}`;
    const expiresAt = new Date(now.getTime() + ACTION_TTL_MS).toISOString();
    const preview = { ...request.preview, contextGeneration: request.contextGeneration, expiresAt };
    const inserted = await client.from("assistant_action_events").insert({ company_id: auth.companyId, user_id: auth.user.id, thread_id: threadId, tool_name: request.toolName, risk_tier: request.riskTier, normalized_args: request.normalizedArgs, args_hash: argsHash, preview, status: "PREPARED", expires_at: expiresAt, idempotency_key: idempotencyKey }).select("*").single();
    if (inserted.error) {
      const raced = await client.from("assistant_action_events").select("*").eq("company_id", auth.companyId).eq("user_id", auth.user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
      if (raced.data) return preparedResult(raced.data as AssistantActionEventRecord);
      throw new AssistantBackendError("ASSISTANT_PERSISTENCE_UNAVAILABLE", "The prepared action could not be saved.", 503);
    }
    return preparedResult(inserted.data as AssistantActionEventRecord);
  };
}

function contextForConfirmation(auth: AssistantAuthContext, generation: number): AssistantContext {
  return compactAssistantContext({ companyId: auth.companyId, generation });
}

function safeError(error: unknown) {
  if (error instanceof AssistantBackendError) return error;
  if (error instanceof CompanyAiError) return new AssistantBackendError(error.code, error.message, error.status, undefined, error.correlationRef);
  return new AssistantBackendError("ASSISTANT_FAILED", "The assistant request failed safely.", 500);
}

function sendError(res: Response, error: unknown, fallback = "The assistant request failed.") {
  const normalized = safeError(error);
  const body: AssistantApiResponse & { reference?: string } = { success: false, error: normalized.message || fallback, code: normalized.code, ...(normalized.correlationRef ? { reference: normalized.correlationRef } : {}) };
  return res.status(normalized.status).json(body);
}

async function handleAssistantRequest(req: Request, res: Response, options: AssistantHandlerOptions) {
  try {
    const auth = await authenticateAssistantRequest(req, options);
    const body = requestBody(req);
    const parsedRequest = parseAssistantRequest(body, auth.companyId);
    const request = { ...parsedRequest, context: await hydrateWorkspaceContext(auth, parsedRequest.context) };
    const now = options.now ? options.now() : new Date();
    const thread = await loadThread(auth, request.threadId, request.context);
    const attachments = prepareAssistantAttachments(request.attachments);
    const attachmentReferences = await persistAttachmentRefs(auth, thread.id, attachments);
    const history = await loadHistory(auth, thread.id);
    await persistMessage(auth, thread.id, "user", { text: request.message, attachments: attachmentReferences });
    const modelParts = [{ text: buildAssistantUserPrompt(request.message, request.context) }, ...attachments.flatMap((attachment) => attachment.modelParts)];
    const toolContext: AssistantToolContext = { auth, context: request.context, now, prepareAction: createPrepareAction(auth, thread.id, request.context, now) };
    const runWithClient = (modelClient: AssistantModelClient) => runAssistantLoop({ modelClient, modelRunner: options.createModelRunner ? options.createModelRunner(modelClient) : undefined, systemInstruction: buildAssistantSystemPrompt(request.context), contents: [...history, { role: "user", parts: modelParts }], toolContext });
    const result = options.createModelClient
      ? await runWithClient(options.createModelClient(auth))
      : await withCompanyAiRuntime({ supabase: auth.supabase, companyId: auth.companyId }, (runtime) => runWithClient(runtime.geminiClient));
    await persistMessage(auth, thread.id, "assistant", { text: result.message, references: result.references, clientActions: result.clientActions, preparedActions: result.preparedActions });
    const data: AssistantResponse = { threadId: thread.id, message: result.message, references: result.references, clientActions: result.clientActions, preparedActions: result.preparedActions, attachments: attachmentReferences, usage: result.usage, contextGeneration: request.context.generation };
    const response: AssistantSuccessResponse = { success: true, data };
    return res.json(response);
  } catch (error) {
    return sendError(res, error, "The assistant request failed.");
  }
}

async function loadActionEvent(auth: AssistantAuthContext, actionId: string) {
  const result = await (auth.supabase as any).from("assistant_action_events").select("*").eq("id", actionId).eq("company_id", auth.companyId).eq("user_id", auth.user.id).maybeSingle();
  if (result.error) throw new AssistantBackendError("ASSISTANT_PERSISTENCE_UNAVAILABLE", "Prepared actions are temporarily unavailable.", 503);
  if (!result.data) throw new AssistantBackendError("ACTION_NOT_FOUND", "That prepared action is not available.", 404);
  return result.data as AssistantActionEventRecord;
}

async function claimAction(auth: AssistantAuthContext, action: AssistantActionEventRecord, now: Date) {
  const result = await (auth.supabase as any).from("assistant_action_events").update({ status: "CONFIRMED", confirmed_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", action.id).eq("company_id", auth.companyId).eq("user_id", auth.user.id).eq("status", "PREPARED").select("*").maybeSingle();
  if (result.error) throw new AssistantBackendError("ASSISTANCE_CONFIRMATION_UNAVAILABLE", "The prepared action could not be claimed.", 503);
  return result.data as AssistantActionEventRecord | null;
}

function confirmationResponse(auth: AssistantAuthContext, action: AssistantActionEventRecord, result: Record<string, unknown>, generation: number): AssistantResponse {
  const prepared: AssistantPreparedAction = { ...preparedActionFromEvent(action), status: "EXECUTED", preview: action.preview };
  const references: AssistantResponse["references"] = [];
  const requestResult = result.request && typeof result.request === "object" && !Array.isArray(result.request) ? result.request as Record<string, unknown> : undefined;
  const workerResult = result.worker && typeof result.worker === "object" && !Array.isArray(result.worker) ? result.worker as Record<string, unknown> : undefined;
  const compensation = result.compensation && typeof result.compensation === "object" && !Array.isArray(result.compensation) ? result.compensation as Record<string, unknown> : undefined;
  let message = "The confirmed action completed.";
  if (action.tool_name === "prepare_create_worker" && workerResult) {
    const name = typeof workerResult.displayName === "string" && workerResult.displayName.trim() ? workerResult.displayName.trim() : "The employee";
    const payType = typeof compensation?.payType === "string" ? compensation.payType : "MONTHLY";
    const rate = Number(compensation?.rate);
    const basis = payType === "DAILY" ? "daily-paid" : payType === "HOURLY" ? "hourly-paid" : "monthly-paid";
    const currency = typeof compensation?.currency === "string" ? compensation.currency.toUpperCase() : "PHP";
    const rateText = Number.isFinite(rate) ? ` at ${currencySymbolFor(currency)}${rate.toFixed(2)}/${payType === "DAILY" ? "day" : payType === "HOURLY" ? "hour" : "month"}` : "";
    message = `${name} was added as an ${workerResult.active === true ? "active" : "inactive"} ${basis} employee${rateText}.`;
  }
  if (typeof workerResult?.id === "string") references.push({ type: "worker", id: String(workerResult.id), label: "View employee" });
  else if (typeof requestResult?.id === "string") references.push({ type: "worker", id: String(requestResult.id), label: "Updated workforce request" });
  const clientActions: AssistantResponse["clientActions"] = action.tool_name === "prepare_create_worker" ? [{ type: "NAVIGATE", routeId: "payroll", label: "Open Payroll" }] : [];
  return { threadId: action.thread_id || "", message, references, clientActions, preparedActions: [prepared], attachments: [], usage: { functionCalls: 0, iterations: 0, fallbackUsed: false }, contextGeneration: generation };
}

async function handleAssistantConfirm(req: Request, res: Response, options: AssistantHandlerOptions) {
  try {
    const auth = await authenticateAssistantRequest(req, options);
    const body = requestBody(req);
    const actionId = requireUuid(body.actionId, "actionId");
    const contextGeneration = body.contextGeneration;
    if (typeof contextGeneration !== "number" || !Number.isInteger(contextGeneration) || contextGeneration < 0) throw new AssistantBackendError("CONTEXT_CONFLICT", "The assistant context is stale; prepare the action again.", 409);
    const action = await loadActionEvent(auth, actionId);
    const definition = getAssistantToolDefinition(action.tool_name);
    if (!definition) throw new AssistantBackendError("UNKNOWN_TOOL", "That prepared operation is no longer available.", 409);
    const args = validateToolArguments(action.tool_name, action.normalized_args);
    const permissions = typeof definition.permissions === "function" ? definition.permissions(args) : definition.permissions;
    await requireCompanyPermissions({ supabase: auth.supabase, companyId: auth.companyId, userId: auth.user.id, context: contextForConfirmation(auth, contextGeneration) }, permissions);
    if (Number(action.preview.contextGeneration) !== contextGeneration) throw new AssistantBackendError("CONTEXT_CONFLICT", "The assistant context changed. Prepare the action again.", 409);
    if (action.status === "EXECUTED") {
      const responseData = confirmationResponse(auth, action, action.result_summary || {}, contextGeneration);
      return res.json({ success: true, data: responseData } satisfies AssistantSuccessResponse);
    }
    if (action.status === "CONFIRMED") throw new AssistantBackendError("ACTION_IN_PROGRESS", "That action is already being processed. Check the workspace before retrying.", 409);
    if (action.status !== "PREPARED") throw new AssistantBackendError("ACTION_NOT_CONFIRMABLE", "That prepared action is no longer confirmable.", 409);
    const now = options.now ? options.now() : new Date();
    if (new Date(action.expires_at).getTime() <= now.getTime()) {
      await (auth.supabase as any).from("assistant_action_events").update({ status: "EXPIRED", updated_at: now.toISOString() }).eq("id", action.id).eq("status", "PREPARED");
      throw new AssistantBackendError("ACTION_EXPIRED", "That prepared action expired. Prepare it again.", 409);
    }
    const claimed = await claimAction(auth, action, now);
    if (!claimed) {
      const latest = await loadActionEvent(auth, action.id);
      if (latest.status === "EXECUTED") return res.json({ success: true, data: confirmationResponse(auth, latest, latest.result_summary || {}, contextGeneration) } satisfies AssistantSuccessResponse);
      throw new AssistantBackendError("ACTION_IN_PROGRESS", "That action is already being processed. Check the workspace before retrying.", 409);
    }
    const toolContext: AssistantToolContext = { auth, context: contextForConfirmation(auth, contextGeneration), now, prepareAction: async () => { throw new AssistantBackendError("NESTED_PREPARE", "Nested preparation is not allowed during confirmation.", 409); } };
    let result: Record<string, unknown>;
    try {
      result = await executePreparedAction(toolContext, action.tool_name, args, action.id, action.preview);
    } catch (error) {
      const normalized = safeError(error);
      await (auth.supabase as any).from("assistant_action_events").update({ status: "FAILED", error_summary: { code: normalized.code, message: normalized.message }, updated_at: now.toISOString() }).eq("id", action.id).eq("status", "CONFIRMED");
      throw normalized;
    }
    const resultSummary = boundToolValue(result) as Record<string, unknown>;
    const executed = { ...claimed, status: "EXECUTED" as const, executed_at: now.toISOString(), result_summary: resultSummary };
    const persisted = await (auth.supabase as any).from("assistant_action_events").update({ status: "EXECUTED", executed_at: now.toISOString(), result_summary: resultSummary, updated_at: now.toISOString() }).eq("id", action.id).eq("status", "CONFIRMED").select("*").maybeSingle();
    if (persisted.error || !persisted.data) throw new AssistantBackendError("ASSISTANT_PERSISTENCE_UNAVAILABLE", "The action completed but its result could not be recorded. Check the workspace before retrying.", 503);
    if (action.thread_id) {
      try { await persistMessage(auth, action.thread_id, "assistant", { type: "confirmation", actionId: action.id, status: "EXECUTED", result: resultSummary }); } catch { /* the action event remains the audit record */ }
    }
    return res.json({ success: true, data: confirmationResponse(auth, persisted.data as AssistantActionEventRecord || executed, resultSummary, contextGeneration) } satisfies AssistantSuccessResponse);
  } catch (error) {
    return sendError(res, error, "The assistant confirmation failed.");
  }
}

async function handleAssistantCancel(req: Request, res: Response, options: AssistantHandlerOptions) {
  try {
    const auth = await authenticateAssistantRequest(req, options);
    const body = requestBody(req);
    const actionId = requireUuid(body.actionId, "actionId");
    const contextGeneration = body.contextGeneration;
    if (typeof contextGeneration !== "number" || !Number.isInteger(contextGeneration) || contextGeneration < 0) throw new AssistantBackendError("CONTEXT_CONFLICT", "The assistant context is stale; prepare the action again.", 409);
    const action = await loadActionEvent(auth, actionId);
    if (Number(action.preview.contextGeneration) !== contextGeneration) throw new AssistantBackendError("CONTEXT_CONFLICT", "The assistant context changed. Prepare the action again.", 409);
    if (action.status === "EXECUTED") throw new AssistantBackendError("ACTION_ALREADY_EXECUTED", "That action already completed and cannot be cancelled.", 409);
    if (action.status === "PREPARED") {
      const updated = await (auth.supabase as any).from("assistant_action_events").update({ status: "CANCELLED", updated_at: new Date().toISOString() }).eq("id", action.id).eq("company_id", auth.companyId).eq("user_id", auth.user.id).eq("status", "PREPARED").select("*").maybeSingle();
      if (updated.error) throw new AssistantBackendError("ASSISTANT_PERSISTENCE_UNAVAILABLE", "The action could not be cancelled.", 503);
      if (updated.data) Object.assign(action, updated.data);
    }
    const data: AssistantResponse = { threadId: action.thread_id || "", message: "The prepared action was cancelled.", references: [], clientActions: [], preparedActions: [preparedActionFromEvent(action)], attachments: [], usage: { functionCalls: 0, iterations: 0, fallbackUsed: false }, contextGeneration };
    return res.json({ success: true, data } satisfies AssistantSuccessResponse);
  } catch (error) {
    return sendError(res, error, "The assistant cancellation failed.");
  }
}

export function createAssistantHandlers(options: AssistantHandlerOptions = {}) {
  return { assistant: ((req, res) => handleAssistantRequest(req, res, options)) as RequestHandler, confirm: ((req, res) => handleAssistantConfirm(req, res, options)) as RequestHandler, cancel: ((req, res) => handleAssistantCancel(req, res, options)) as RequestHandler };
}

export function createAssistantHandler(options: AssistantHandlerOptions = {}): RequestHandler {
  return createAssistantHandlers(options).assistant;
}

export function createAssistantConfirmHandler(options: AssistantHandlerOptions = {}): RequestHandler {
  return createAssistantHandlers(options).confirm;
}

export function createAssistantRouter(options: AssistantHandlerOptions = {}): Router {
  const router = express.Router();
  const handlers = createAssistantHandlers(options);
  router.post("/", handlers.assistant);
  router.post("/confirm", handlers.confirm);
  router.post("/cancel", handlers.cancel);
  return router;
}

export const assistantHandler = createAssistantHandlers().assistant;
export const assistantConfirmHandler = createAssistantHandlers().confirm;
export const assistantRouter = createAssistantRouter;
