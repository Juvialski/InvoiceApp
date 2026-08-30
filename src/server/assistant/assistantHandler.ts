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
import { executePreparedEngineeringCoordinationAction, isEngineeringCoordinationTool } from "./engineeringCoordinationAssistant.ts";
import { executePreparedDailySiteLogsAction, isDailySiteLogsTool } from "./dailySiteLogsAssistant.ts";
import { executePreparedFinancialSettlementAction, isFinancialSettlementTool } from "./financialSettlementAssistant.ts";
import { executePreparedCoreHardeningAction, isCoreHardeningTool } from "./coreHardeningAssistant.ts";
import { executePreparedAssistantOperation, isAssistantOperationTool } from "./assistantOperations.ts";
import { getAssistantToolDefinition, validateAssistantToolArguments } from "./toolRegistry.ts";
import { requireCompanyPermissions } from "./toolAuthorization.ts";
import { boundToolValue, toolOk } from "./toolResults.ts";
import { isUuid, requireUuid, validateAssistantMessage } from "./toolValidation.ts";
import { withCompanyAiRuntime } from "../ai/companyAiRuntime.ts";
import { CompanyAiError } from "../ai/companyAiTypes.ts";

const ACTION_TTL_MS = 10 * 60 * 1000;
const UUID_HEADER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_TEXT_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

function currencySymbolFor(currency: string) {
  return ({ PHP: "₱", USD: "$", EUR: "€", SGD: "S$", JPY: "¥", GBP: "£" } as Record<string, string>)[currency] || `${currency} `;
}

export function scrubAssistantMessage(value: string) {
  return String(value || "").replace(UUID_TEXT_PATTERN, "the referenced record");
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
  if (!match) throw new AssistantBackendError("UNAUTHENTICATED", "A valid Engoryx session is required.", 401);
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
  if (error || !data.user) throw new AssistantBackendError("UNAUTHENTICATED", "A valid Engoryx session is required.", 401);
  const companyId = firstHeader(req.headers["x-company-id"]).trim();
  if (!UUID_HEADER_PATTERN.test(companyId)) throw new AssistantBackendError("COMPANY_REQUIRED", "A valid company context is required.", 400);
  const deployment = await supabase.rpc("get_deployment_company_id");
  if (deployment.error || typeof deployment.data !== "string" || !UUID_HEADER_PATTERN.test(deployment.data)) {
    throw new AssistantBackendError("AUTHORIZATION_UNAVAILABLE", "Deployment company authorization is temporarily unavailable.", 503);
  }
  if (deployment.data !== companyId) throw new AssistantBackendError("FORBIDDEN", "The Assistant cannot target another Engoryx deployment company.", 403);
  const membership = await supabase.rpc("is_active_company_member", { p_company_id: companyId });
  if (membership.error) throw new AssistantBackendError("AUTHORIZATION_UNAVAILABLE", "Company authorization is temporarily unavailable.", 503);
  if (membership.data !== true) throw new AssistantBackendError("FORBIDDEN", "You do not have active access to this Engoryx deployment company.", 403);
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
    selectedSiteLogId: typeof raw.selectedSiteLogId === "string" && isUuid(raw.selectedSiteLogId) ? raw.selectedSiteLogId : undefined,
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
  const requestId = body.requestId === undefined ? undefined : typeof body.requestId === "string" && REQUEST_ID_PATTERN.test(body.requestId) ? body.requestId : undefined;
  if (body.requestId !== undefined && !requestId) throw new AssistantBackendError("INVALID_REQUEST_ID", "The assistant request identifier is invalid.", 400);
  return { threadId: typeof body.threadId === "string" ? requireUuid(body.threadId, "threadId") : undefined, requestId, message, context, attachments };
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
  const created = await client.from("assistant_threads").insert({ company_id: auth.companyId, user_id: auth.user.id, title: "Engoryx Assistant", context }).select("id").single();
  if (created.error || !created.data?.id) throw new AssistantBackendError("THREAD_UNAVAILABLE", "The assistant thread could not be created.", 503);
  return created.data as { id: string };
}

async function loadHistory(auth: AssistantAuthContext, threadId: string, excludedRequestId?: string) {
  const result = await (auth.supabase as any).from("assistant_messages").select("role,content,created_at").eq("thread_id", threadId).eq("company_id", auth.companyId).eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(12);
  if (result.error) return { messages: [] as unknown[], skippedRequestId: false };
  const rows = Array.isArray(result.data) ? [...result.data].reverse() : [];
  let skippedRequestId = false;
  const messages = rows.map((row: Record<string, unknown>) => {
    const content = row.content && typeof row.content === "object" && !Array.isArray(row.content) ? row.content as Record<string, unknown> : {};
    if (excludedRequestId && row.role === "user" && content.requestId === excludedRequestId) {
      skippedRequestId = true;
      return null;
    }
    const text = typeof content.text === "string" ? content.text.slice(0, 2_000) : "";
    if (!text) return null;
    return { role: row.role === "assistant" ? "model" : "user", parts: [{ text: `Previous ${row.role === "assistant" ? "assistant" : "user"} message (untrusted conversation context):\n${text}` }] };
  }).filter(Boolean) as unknown[];
  return { messages, skippedRequestId };
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

export function createPrepareAction(auth: AssistantAuthContext, threadId: string, context: AssistantContext, now: Date) {
  return async (request: Parameters<AssistantToolContext["prepareAction"]>[0]): Promise<ToolExecutionResult> => {
    const client = auth.supabase as any;
    const argsHash = actionHash(auth, request.toolName, request.normalizedArgs, request.contextGeneration);
    let idempotencyKey = `assistant:${argsHash}`;
    const existingResult = await client.from("assistant_action_events").select("*").eq("company_id", auth.companyId).eq("user_id", auth.user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existingResult.error) throw new AssistantBackendError("ASSISTANT_PERSISTENCE_UNAVAILABLE", "Prepared actions are temporarily unavailable.", 503);
    if (existingResult.data && String(existingResult.data.status) === "PREPARED" && new Date(String(existingResult.data.expires_at)).getTime() <= now.getTime()) {
      const expired = await client.from("assistant_action_events").update({ status: "EXPIRED", updated_at: now.toISOString() }).eq("id", String(existingResult.data.id)).eq("status", "PREPARED");
      if (expired.error) throw new AssistantBackendError("ASSISTANT_PERSISTENCE_UNAVAILABLE", "Prepared actions are temporarily unavailable.", 503);
      existingResult.data.status = "EXPIRED";
    }
    if (existingResult.data && ["PREPARED", "CONFIRMED", "EXECUTED"].includes(String(existingResult.data.status))) return preparedResult(existingResult.data as AssistantActionEventRecord);
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

function sendError(res: Response, error: unknown, fallback = "The assistant request failed.", threadId?: string) {
  const normalized = safeError(error);
  const body: AssistantApiResponse & { reference?: string; threadId?: string } = { success: false, error: normalized.message || fallback, code: normalized.code, ...(normalized.correlationRef ? { reference: normalized.correlationRef } : {}), ...(threadId && isUuid(threadId) ? { threadId } : {}) };
  return res.status(normalized.status).json(body);
}

async function handleAssistantRequest(req: Request, res: Response, options: AssistantHandlerOptions) {
  let threadId: string | undefined;
  try {
    const auth = await authenticateAssistantRequest(req, options);
    const body = requestBody(req);
    const parsedRequest = parseAssistantRequest(body, auth.companyId);
    const request = { ...parsedRequest, context: await hydrateWorkspaceContext(auth, parsedRequest.context) };
    const now = options.now ? options.now() : new Date();
    const thread = await loadThread(auth, request.threadId, request.context);
    threadId = thread.id;
    const attachments = prepareAssistantAttachments(request.attachments);
    const attachmentReferences = await persistAttachmentRefs(auth, thread.id, attachments);
    const historyResult = await loadHistory(auth, thread.id, request.requestId);
    const history = historyResult.messages;
    if (!historyResult.skippedRequestId) await persistMessage(auth, thread.id, "user", { text: request.message, attachments: attachmentReferences, ...(request.requestId ? { requestId: request.requestId } : {}) });
    const modelParts = [{ text: buildAssistantUserPrompt(request.message, request.context) }, ...attachments.flatMap((attachment) => attachment.modelParts)];
    const toolContext: AssistantToolContext = { auth, context: request.context, now, prepareAction: createPrepareAction(auth, thread.id, request.context, now) };
    const runWithClient = (modelClient: AssistantModelClient) => runAssistantLoop({ modelClient, modelRunner: options.createModelRunner ? options.createModelRunner(modelClient) : undefined, systemInstruction: buildAssistantSystemPrompt(request.context), contents: [...history, { role: "user", parts: modelParts }], toolContext });
    const result = options.createModelClient
      ? await runWithClient(options.createModelClient(auth))
      : await withCompanyAiRuntime({ supabase: auth.supabase, companyId: auth.companyId }, (runtime) => runWithClient(runtime.geminiClient));
    const safeMessage = scrubAssistantMessage(result.message);
    await persistMessage(auth, thread.id, "assistant", { text: safeMessage, references: result.references, clientActions: result.clientActions, preparedActions: result.preparedActions });
    const data: AssistantResponse = { threadId: thread.id, message: safeMessage, references: result.references, clientActions: result.clientActions, preparedActions: result.preparedActions, attachments: attachmentReferences, usage: result.usage, contextGeneration: request.context.generation };
    const response: AssistantSuccessResponse = { success: true, data };
    return res.json(response);
  } catch (error) {
    return sendError(res, error, "The assistant request failed.", threadId);
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
  const clientActions: AssistantResponse["clientActions"] = [];
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
    clientActions.push({ type: "NAVIGATE", routeId: "payroll", label: "Open Payroll" });
  }
  if (action.tool_name === "prepare_process_attached_invoice") {
    const invoiceId = typeof result.invoiceId === "string" ? result.invoiceId : undefined;
    message = invoiceId ? "The attached invoice was already processed and is ready in the review queue." : result.clientExecutionRequired === true ? "The attachment handoff was confirmed. Engoryx will process the invoice through the review queue now." : "The attached invoice was sent to the review queue.";
    if (invoiceId) {
      references.push({ type: "invoice", id: invoiceId, label: "Review invoice" });
      clientActions.push({ type: "OPEN_REVIEW_INVOICE", entityId: invoiceId, label: "Open in Review Queue" });
    }
  }
  if (action.tool_name === "create_payroll_run" && result.run && typeof result.run === "object" && !Array.isArray(result.run)) {
    const run = result.run as Record<string, unknown>;
    const runId = typeof run.id === "string" ? run.id : undefined;
    message = "A draft payroll run was created for the selected period.";
    if (runId) {
      references.push({ type: "payroll_run", id: runId, label: "Draft payroll run" });
      clientActions.push({ type: "OPEN_PAYROLL_RUN", entityId: runId, label: "Open payroll run" });
    }
  }
  if (action.tool_name === "create_project_draft" && result.project && typeof result.project === "object" && !Array.isArray(result.project)) {
    const project = result.project as Record<string, unknown>;
    const projectId = typeof project.id === "string" ? project.id : undefined;
    message = "The planning project draft was created.";
    if (projectId) {
      references.push({ type: "project", id: projectId, label: "Planning project" });
      clientActions.push({ type: "OPEN_PROJECT", entityId: projectId, label: "Open project" });
    }
  }
  if (action.tool_name === "create_expense_draft") {
    message = "The draft expense was created and is ready in Expenses.";
    clientActions.push({ type: "NAVIGATE", routeId: "expenses", label: "Open Expenses" });
  }
  if (isDailySiteLogsTool(action.tool_name)) {
    const logResult = result.log && typeof result.log === "object" && !Array.isArray(result.log) ? result.log as Record<string, unknown> : undefined;
    const siteLogId = typeof logResult?.id === "string" ? logResult.id : typeof action.normalized_args.siteLogId === "string" ? action.normalized_args.siteLogId : typeof action.normalized_args.dailySiteLogId === "string" ? action.normalized_args.dailySiteLogId : undefined;
    const projectId = typeof logResult?.project_id === "string" ? logResult.project_id : typeof action.normalized_args.projectId === "string" ? action.normalized_args.projectId : undefined;
    const reportNumber = typeof logResult?.report_number === "string" ? logResult.report_number : typeof action.preview.reportNumber === "string" ? action.preview.reportNumber : "Daily Site Log";
    const siteDate = typeof logResult?.site_date === "string" ? logResult.site_date : typeof action.preview.siteDate === "string" ? action.preview.siteDate : "";
    const operation = action.tool_name.includes("finalize") ? "finalized" : action.tool_name.includes("submit") ? "submitted" : action.tool_name.includes("void") ? "voided" : action.tool_name.includes("update") ? "updated" : "draft saved";
    message = `${reportNumber}${siteDate ? ` for ${siteDate}` : ""} was ${operation}.`;
    if (siteLogId && projectId) {
      references.push({ type: "report", id: siteLogId, label: `${reportNumber} · ${siteDate || "Site Log"}` });
      clientActions.push({ type: "OPEN_SITE_LOG", entityId: siteLogId, projectId, label: "Open Site Log" });
    }
  }
  if (isFinancialSettlementTool(action.tool_name)) {
    const matchResult = result.match && typeof result.match === "object" && !Array.isArray(result.match) ? result.match as Record<string, unknown> : undefined;
    const transactionId = typeof result.transactionId === "string" ? result.transactionId : typeof matchResult?.transaction_id === "string" ? matchResult.transaction_id : typeof action.normalized_args.transactionId === "string" ? action.normalized_args.transactionId : undefined;
    const targetType = typeof result.targetType === "string" ? result.targetType : typeof matchResult?.target_type === "string" ? matchResult.target_type : typeof action.normalized_args.targetType === "string" ? action.normalized_args.targetType : undefined;
    const targetId = typeof result.targetId === "string" ? result.targetId : typeof matchResult?.target_id === "string" ? matchResult.target_id : typeof action.normalized_args.targetId === "string" ? action.normalized_args.targetId : undefined;
    if (action.tool_name === "prepare_reverse_financial_settlement") message = "The financial settlement link was reversed. The original confirmation remains in audit history, and project cost was not changed.";
    else if (action.tool_name === "prepare_split_transaction_allocation") message = "The reviewed split settlement was confirmed atomically. Cash evidence was linked without creating additional project cost.";
    else message = "The reviewed financial settlement was confirmed. Cash evidence was linked without changing invoice or payroll project cost.";
    if (transactionId) {
      references.push({ type: "report", id: transactionId, label: "Cash transaction" });
      clientActions.push({ type: "OPEN_FINANCIAL_TRANSACTION", entityId: transactionId, label: "Open transaction" });
    }
    if (targetType === "INVOICE" && targetId) {
      references.push({ type: "invoice", id: targetId, label: "Supplier invoice" });
      clientActions.push({ type: "OPEN_INVOICE", entityId: targetId, label: "Open invoice" });
    } else if (targetType === "PAYROLL" && targetId) {
      references.push({ type: "payroll_run", id: targetId, label: "Payroll run" });
      clientActions.push({ type: "OPEN_PAYROLL_RUN", entityId: targetId, label: "Open payroll run" });
    }
  }
  if (isCoreHardeningTool(action.tool_name) || isAssistantOperationTool(action.tool_name) || isEngineeringCoordinationTool(action.tool_name)) {
    const coordinationRecord = [result.rfi, result.submittal, result.response, result.review].find((value) => value && typeof value === "object" && !Array.isArray(value)) as Record<string, unknown> | undefined;
    const inferredEntityType = isEngineeringCoordinationTool(action.tool_name) ? action.tool_name.includes("rfi") ? "RFI" : "SUBMITTAL" : "RECORD";
    const entityType = typeof result.entityType === "string" ? result.entityType : typeof action.preview.entityType === "string" ? action.preview.entityType : inferredEntityType;
    const resultEntityId = typeof result.entityId === "string" ? result.entityId : typeof coordinationRecord?.id === "string" ? coordinationRecord.id : typeof coordinationRecord?.rfi_id === "string" ? coordinationRecord.rfi_id : typeof coordinationRecord?.submittal_id === "string" ? coordinationRecord.submittal_id : undefined;
    const entityId = resultEntityId || (typeof action.normalized_args.projectId === "string" ? action.normalized_args.projectId : typeof action.normalized_args.entityId === "string" ? action.normalized_args.entityId : typeof action.normalized_args.workerId === "string" ? action.normalized_args.workerId : typeof action.normalized_args.transactionId === "string" ? action.normalized_args.transactionId : typeof action.normalized_args.accountId === "string" ? action.normalized_args.accountId : undefined);
    const displayCandidate = typeof result.displayLabel === "string" ? result.displayLabel.trim() : coordinationRecord ? String(coordinationRecord.document_number || coordinationRecord.rfi_number || coordinationRecord.submittal_number || coordinationRecord.report_number || coordinationRecord.title || coordinationRecord.subject || "").trim() : "";
    const displayLabel = displayCandidate && !isUuid(displayCandidate)
      ? displayCandidate
      : typeof action.preview.target === "string" && action.preview.target.trim()
        ? action.preview.target.trim()
        : entityType.replaceAll("_", " ");
    const requestedAction = typeof action.normalized_args.action === "string" ? action.normalized_args.action : action.tool_name === "prepare_site_log_addendum" ? "ADDENDUM" : action.tool_name.includes("reopen") ? "REOPEN" : action.tool_name.includes("authorize") ? "AUTHORIZE" : action.tool_name.includes("revoke") ? "REVOKE" : action.tool_name.includes("snapshot") ? "RECORD_MANUAL_BALANCE" : action.tool_name.includes("import") ? "IMPORT" : action.tool_name.includes("save") ? "SAVE" : action.tool_name.includes("create") ? "CREATE" : action.tool_name.includes("open") ? "OPEN" : action.tool_name.includes("respond") ? "RESPONSE" : action.tool_name.includes("submit") ? "SUBMIT" : action.tool_name.includes("start") ? "START_REVIEW" : action.tool_name.includes("review") ? "REVIEW" : action.tool_name.includes("resubmit") ? "RESUBMIT" : action.tool_name.includes("close") ? "CLOSE" : "UPDATE";
    const outcome: Record<string, string> = {
      DELETE_UNUSED: "was permanently deleted because it was unused",
      ARCHIVE: "was archived and its history was retained",
      RESTORE: "was restored to the visible directory",
      REACTIVATE: "was reactivated",
      OFFBOARD: "was offboarded and its history was retained",
      END: "was ended and its history was retained",
      SUPERSEDE: "was superseded and its lineage was retained",
      DEACTIVATE: "was deactivated and its history was retained",
      VOID: "was voided and its history was retained",
      CANCEL: "was cancelled and its history was retained",
      DELETE_DRAFT: "was deleted as an unused draft",
      ADDENDUM: "received an append-only correction",
      UPDATE: "was updated",
      CONFIRM: "was confirmed",
      REVERSE: "was reversed while its history was retained",
      REOPEN: "was reopened for human review",
      SAVE: "was saved",
      RECORD_MANUAL_BALANCE: "received a dated manual balance snapshot",
      AUTHORIZE: "was authorized for signup",
      ROLE_UPDATED: "had its role updated",
      OVERRIDES_UPDATED: "had its explicit permissions updated",
      REVOKE: "was revoked",
      IMPORT: "was imported into the reviewable ledger",
      CREATE: "was created",
      OPEN: "was opened",
      RESPONSE: "received a response",
      SUBMIT: "was submitted",
      START_REVIEW: "entered review",
      REVIEW: "received a review decision",
      RESUBMIT: "received a new submission round",
      CLOSE: "was closed",
    };
    message = `${displayLabel} ${outcome[requestedAction] || "was updated safely"}.`;
    if (entityId) {
      const referenceType: AssistantResponse["references"][number]["type"] = entityType === "PROJECT" ? "project" : entityType === "INVOICE" ? "invoice" : entityType === "WORKER" ? "worker" : entityType === "DOCUMENT" ? "document" : entityType === "RFI" ? "rfi" : entityType === "SUBMITTAL" ? "submittal" : entityType === "SITE_LOG" ? "report" : entityType === "COMPENSATION_PROFILE" || entityType === "RECURRING_COMPONENT" ? "worker" : "report";
      references.push({ type: referenceType, id: entityId, label: displayLabel });
    }
    const record = result.record && typeof result.record === "object" && !Array.isArray(result.record) ? result.record as Record<string, unknown> : coordinationRecord || {};
    const projectId = typeof result.projectId === "string" ? result.projectId : typeof record.project_id === "string" ? record.project_id : typeof action.preview.projectId === "string" ? action.preview.projectId : undefined;
    if (entityType === "PROJECT" && entityId) clientActions.push({ type: "OPEN_PROJECT", entityId, label: "Open project" });
    else if (entityType === "INVOICE" && entityId) clientActions.push({ type: "OPEN_INVOICE", entityId, label: "Open invoice" });
    else if (entityType === "DOCUMENT" && entityId && projectId) {
      const revisionId = typeof record.current_revision_id === "string" ? record.current_revision_id : undefined;
      clientActions.push({ type: "OPEN_ENGINEERING_DOCUMENT", entityId, projectId, ...(revisionId ? { revisionId } : {}), label: "Open engineering document" });
    }
    else if (entityType === "RFI" && entityId && projectId) clientActions.push({ type: "OPEN_RFI", entityId, projectId, label: "Open RFI" });
    else if (entityType === "SUBMITTAL" && entityId && projectId) clientActions.push({ type: "OPEN_SUBMITTAL", entityId, projectId, label: "Open submittal" });
    else if (entityType === "SITE_LOG" && entityId && projectId) clientActions.push({ type: "OPEN_SITE_LOG", entityId, projectId, label: "Open Site Log" });
    else if (entityType === "FINANCIAL_TRANSACTION" && entityId) clientActions.push({ type: "OPEN_FINANCIAL_TRANSACTION", entityId, label: "Open transaction" });
    else if (entityType === "FINANCIAL_TRANSFER" && typeof action.normalized_args.leftTransactionId === "string") clientActions.push({ type: "OPEN_FINANCIAL_TRANSACTION", entityId: action.normalized_args.leftTransactionId, label: "Open transaction" });
    else if (entityType === "FINANCIAL_IMPORT" || entityType === "FINANCIAL_SNAPSHOT") clientActions.push({ type: "NAVIGATE", routeId: "cash", label: "Open Cash & Banking" });
    else if (entityType === "COMPANY" || entityType === "INVITATION" || entityType === "MEMBERSHIP") clientActions.push({ type: "NAVIGATE", routeId: "settings", label: "Open Settings" });
    else if (["WORKER", "PROJECT_ASSIGNMENT", "COMPENSATION_PROFILE", "RECURRING_COMPONENT", "WORK_ENTRY", "ATTENDANCE", "LEAVE", "OVERTIME"].includes(entityType)) clientActions.push({ type: "NAVIGATE", routeId: "payroll", label: "Open Payroll" });
  }
  if (typeof workerResult?.id === "string") references.push({ type: "worker", id: String(workerResult.id), label: "View employee" });
  else if (typeof requestResult?.id === "string") references.push({ type: "worker", id: String(requestResult.id), label: "Updated workforce request" });
  return { threadId: action.thread_id || "", message: scrubAssistantMessage(message), references, clientActions, preparedActions: [prepared], attachments: [], usage: { functionCalls: 0, iterations: 0, fallbackUsed: false }, contextGeneration: generation };
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
    const args = validateAssistantToolArguments(action.tool_name, action.normalized_args);
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
      result = isEngineeringCoordinationTool(action.tool_name)
        ? await executePreparedEngineeringCoordinationAction(toolContext, action.tool_name, args)
        : isDailySiteLogsTool(action.tool_name)
          ? await executePreparedDailySiteLogsAction(toolContext, action.tool_name, args)
          : isFinancialSettlementTool(action.tool_name)
            ? await executePreparedFinancialSettlementAction(toolContext, action.tool_name, args)
            : isCoreHardeningTool(action.tool_name)
              ? await executePreparedCoreHardeningAction(toolContext, action.tool_name, args)
              : isAssistantOperationTool(action.tool_name)
                ? await executePreparedAssistantOperation(toolContext, action.tool_name, args)
            : await executePreparedAction(toolContext, action.tool_name, args, action.id, action.preview);
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
