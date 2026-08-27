import { compactAssistantContext } from "./assistantContext.ts";
import {
  ASSISTANT_MAX_ATTACHMENT_BYTES,
  ASSISTANT_MAX_TOTAL_ATTACHMENT_BYTES,
  type AssistantApiResponse,
  type AssistantAttachmentInput,
  type AssistantAttachmentReference,
  type AssistantConfirmRequest,
  type AssistantPreparedAction,
  type AssistantReference,
  type AssistantRequest,
  type AssistantResponse,
  type AssistantRiskTier,
} from "./assistantTypes.ts";
import { sanitizeAssistantClientAction, isAllowlistedAssistantAction } from "./assistantActionPolicy.ts";
import { isAssistantAttachmentKind, safeAttachmentFileName, validateAssistantAttachment } from "./attachmentRouter.ts";
import { BRAND } from "../config/brand.ts";

export { isAllowlistedAssistantAction, sanitizeAssistantClientAction } from "./assistantActionPolicy.ts";

const MAX_MESSAGE_LENGTH = 8000;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SAFE_RISK_TIERS = new Set<AssistantRiskTier>(["READ", "NAVIGATION", "PREPARE", "NORMAL_MUTATION", "BULK_MUTATION", "FINANCIAL_FINALIZATION"]);
const SAFE_ACTION_STATUSES = new Set<AssistantPreparedAction["status"]>(["PREPARED", "CONFIRMED", "EXECUTED", "FAILED", "CANCELLED", "EXPIRED"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedString(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function safeToken(value: unknown) {
  const token = boundedString(value, 200);
  return token && SAFE_TOKEN.test(token) ? token : null;
}

function safePreview(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 500);
  if (depth >= 2) return "…";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safePreview(item, depth + 1));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [key.slice(0, 80), safePreview(item, depth + 1)]));
  }
  return null;
}

function sanitizeReference(value: unknown): AssistantReference | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  const allowed = ["invoice", "project", "worker", "payroll_period", "payroll_run", "attendance", "report", "help"] as const;
  if (!allowed.includes(type as (typeof allowed)[number])) return null;
  const label = boundedString(value.label, 160);
  if (!label) return null;
  const id = value.id === undefined ? undefined : safeToken(value.id) || undefined;
  return { type: type as AssistantReference["type"], ...(id ? { id } : {}), label };
}

function sanitizeAttachmentReference(value: unknown): AssistantAttachmentReference | null {
  if (!isRecord(value)) return null;
  const id = safeToken(value.id);
  const fileName = safeAttachmentFileName(boundedString(value.fileName, 180) || "");
  const mimeType = boundedString(value.mimeType, 120)?.toLowerCase();
  const size = Number(value.size);
  const kind = value.kind;
  if (!id || !fileName || !mimeType || !Number.isSafeInteger(size) || size < 0 || !isAssistantAttachmentKind(kind)) return null;
  const rowCount = value.rowCount === undefined ? undefined : Number(value.rowCount);
  return {
    id,
    fileName,
    mimeType,
    size,
    kind,
    ...(Number.isSafeInteger(rowCount) && rowCount >= 0 ? { rowCount } : {}),
    ...(boundedString(value.warning, 300) ? { warning: boundedString(value.warning, 300)! } : {}),
  };
}

function sanitizePreparedAction(value: unknown): AssistantPreparedAction | null {
  if (!isRecord(value)) return null;
  const id = safeToken(value.id);
  const toolName = boundedString(value.toolName, 120);
  const riskTier = value.riskTier;
  const status = value.status;
  const expiresAt = boundedString(value.expiresAt, 80);
  if (!id || !toolName || !SAFE_TOKEN.test(toolName) || !SAFE_RISK_TIERS.has(riskTier as AssistantRiskTier) || !SAFE_ACTION_STATUSES.has(status as AssistantPreparedAction["status"]) || !expiresAt) return null;
  const preview = safePreview(value.preview);
  return {
    id,
    toolName,
    riskTier: riskTier as AssistantRiskTier,
    status: status as AssistantPreparedAction["status"],
    preview: isRecord(preview) ? preview : {},
    expiresAt,
  };
}

export function parseAssistantResponse(value: unknown, fallbackContextGeneration = 0): AssistantResponse {
  const envelope = isRecord(value) && value.success === true && isRecord(value.data) ? value.data : value;
  if (!isRecord(envelope)) throw new Error(`${BRAND.assistantName} returned an invalid response.`);
  const threadId = safeToken(envelope.threadId);
  const message = boundedString(envelope.message, MAX_MESSAGE_LENGTH);
  if (!threadId || !message) throw new Error(`${BRAND.assistantName} returned an incomplete response.`);
  const contextGeneration = Number(envelope.contextGeneration);
  const references = Array.isArray(envelope.references) ? envelope.references.map(sanitizeReference).filter((item): item is AssistantReference => Boolean(item)) : [];
  const clientActions = Array.isArray(envelope.clientActions) ? envelope.clientActions.map(sanitizeAssistantClientAction).filter((item): item is NonNullable<ReturnType<typeof sanitizeAssistantClientAction>> => Boolean(item)) : [];
  const preparedActions = Array.isArray(envelope.preparedActions) ? envelope.preparedActions.map(sanitizePreparedAction).filter((item): item is AssistantPreparedAction => Boolean(item)) : [];
  const attachments = Array.isArray(envelope.attachments) ? envelope.attachments.map(sanitizeAttachmentReference).filter((item): item is AssistantAttachmentReference => Boolean(item)) : [];
  const usage = isRecord(envelope.usage)
    ? {
        ...(boundedString(envelope.usage.model, 120) ? { model: boundedString(envelope.usage.model, 120)! } : {}),
        ...(typeof envelope.usage.fallbackUsed === "boolean" ? { fallbackUsed: envelope.usage.fallbackUsed } : {}),
        ...(Number.isSafeInteger(envelope.usage.iterations) ? { iterations: Number(envelope.usage.iterations) } : {}),
        ...(Number.isSafeInteger(envelope.usage.functionCalls) ? { functionCalls: Number(envelope.usage.functionCalls) } : {}),
      }
    : undefined;
  return {
    threadId,
    message,
    references,
    clientActions,
    preparedActions,
    attachments,
    ...(usage && Object.keys(usage).length ? { usage } : {}),
    contextGeneration: Number.isSafeInteger(contextGeneration) ? contextGeneration : fallbackContextGeneration,
  };
}

export class AssistantClientError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly reference?: string;
  readonly threadId?: string;
  readonly contextGeneration?: number;

  constructor(message: string, details: { status?: number; code?: string; reference?: string; threadId?: string; contextGeneration?: number } = {}) {
    super(message);
    this.name = "AssistantClientError";
    this.status = details.status;
    this.code = details.code;
    this.reference = details.reference;
    this.threadId = details.threadId;
    this.contextGeneration = details.contextGeneration;
  }
}

async function responsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorFromPayload(payload: unknown, status?: number) {
  if (isRecord(payload) && payload.success === false) {
    const message = boundedString(payload.error, 500) || `${BRAND.assistantName} could not complete that request.`;
    return new AssistantClientError(message, {
      status,
      code: boundedString(payload.code, 80) || undefined,
      reference: safeToken(payload.reference) || undefined,
      threadId: safeToken(payload.threadId) || undefined,
      contextGeneration: Number.isSafeInteger(payload.contextGeneration) ? Number(payload.contextGeneration) : undefined,
    });
  }
  return new AssistantClientError(status ? `${BRAND.assistantName} request failed (${status}).` : `${BRAND.assistantName} request failed.`, { status });
}

async function postAssistant(path: string, companyId: string, body: AssistantRequest | AssistantConfirmRequest, signal?: AbortSignal) {
  const { companyApiRequest } = await import("../lib/companyApi.ts");
  const response = await companyApiRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
    companyId,
  });
  const payload = await responsePayload(response);
  if (!response.ok) throw errorFromPayload(payload, response.status);
  if (isRecord(payload) && payload.success === false) throw errorFromPayload(payload, response.status);
  return payload;
}

function compactAttachmentInputs(attachments: readonly AssistantAttachmentInput[] | undefined) {
  if (!attachments?.length) return undefined;
  if (attachments.length > 10) throw new AssistantClientError("You can attach up to 10 files at a time.");
  let totalBytes = 0;
  return attachments.map((attachment) => {
    const validation = validateAssistantAttachment({ name: attachment.fileName, type: attachment.mimeType, size: attachment.size }, { existingTotalBytes: totalBytes });
    if (validation.ok === false) throw new AssistantClientError(validation.message, { code: validation.code });
    totalBytes += validation.metadata.size;
    const dataBase64 = attachment.dataBase64?.trim();
    if (dataBase64 && dataBase64.length > Math.ceil(validation.metadata.size * 4 / 3) + 4096) {
      throw new AssistantClientError(`The encoded attachment “${validation.metadata.fileName}” is larger than its declared size.`);
    }
    return {
      ...(attachment.id && SAFE_TOKEN.test(attachment.id) ? { id: attachment.id } : {}),
      fileName: validation.metadata.fileName,
      mimeType: validation.metadata.mimeType,
      size: validation.metadata.size,
      ...(dataBase64 ? { dataBase64 } : {}),
      ...(attachment.sha256 && SAFE_TOKEN.test(attachment.sha256) ? { sha256: attachment.sha256 } : {}),
    } satisfies AssistantAttachmentInput;
  });
}

export interface SendAssistantMessageOptions {
  companyId: string | null | undefined;
  threadId?: string | null;
  requestId?: string;
  message: string;
  context: Parameters<typeof compactAssistantContext>[0];
  attachments?: readonly AssistantAttachmentInput[];
  signal?: AbortSignal;
}

export async function sendAssistantMessage(options: SendAssistantMessageOptions): Promise<AssistantResponse> {
  const companyId = (options.companyId || "").trim();
  if (!companyId) throw new AssistantClientError(`Sign in and select a company before using ${BRAND.assistantName}.`, { code: "COMPANY_REQUIRED" });
  const message = options.message.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!message) throw new AssistantClientError("Ask a question or attach a file before sending.", { code: "MESSAGE_REQUIRED" });
  const context = compactAssistantContext({ ...options.context, companyId });
  const compactAttachments = compactAttachmentInputs(options.attachments);
  const body: AssistantRequest = {
    ...(options.threadId && SAFE_TOKEN.test(options.threadId) ? { threadId: options.threadId } : {}),
    ...(options.requestId && SAFE_TOKEN.test(options.requestId) ? { requestId: options.requestId } : {}),
    message,
    context,
    ...(compactAttachments ? { attachments: compactAttachments } : {}),
  };
  const payload = await postAssistant("/api/assistant", companyId, body, options.signal);
  return parseAssistantResponse(payload, context.generation);
}

export interface ConfirmAssistantActionOptions {
  companyId: string | null | undefined;
  actionId: string;
  contextGeneration: number;
  signal?: AbortSignal;
}

export async function confirmAssistantAction(options: ConfirmAssistantActionOptions): Promise<AssistantResponse> {
  const companyId = (options.companyId || "").trim();
  if (!companyId) throw new AssistantClientError("Sign in and select a company before confirming an action.", { code: "COMPANY_REQUIRED" });
  if (!SAFE_TOKEN.test(options.actionId)) throw new AssistantClientError("That assistant action is not valid.", { code: "ACTION_INVALID" });
  const contextGeneration = Number(options.contextGeneration);
  if (!Number.isSafeInteger(contextGeneration) || contextGeneration < 0) throw new AssistantClientError("That assistant context is no longer valid.", { code: "CONTEXT_INVALID" });
  const body: AssistantConfirmRequest = { actionId: options.actionId, contextGeneration };
  const payload = await postAssistant("/api/assistant/confirm", companyId, body, options.signal);
  return parseAssistantResponse(payload, contextGeneration);
}

export async function cancelAssistantAction(options: ConfirmAssistantActionOptions): Promise<AssistantResponse> {
  const companyId = (options.companyId || "").trim();
  if (!companyId) throw new AssistantClientError("Sign in and select a company before cancelling an assistant action.", { code: "COMPANY_REQUIRED" });
  if (!SAFE_TOKEN.test(options.actionId)) throw new AssistantClientError("That assistant action is not valid.", { code: "ACTION_INVALID" });
  const contextGeneration = Number(options.contextGeneration);
  if (!Number.isSafeInteger(contextGeneration) || contextGeneration < 0) throw new AssistantClientError("That assistant context is no longer valid.", { code: "CONTEXT_INVALID" });
  const body: AssistantConfirmRequest = { actionId: options.actionId, contextGeneration };
  const payload = await postAssistant("/api/assistant/cancel", companyId, body, options.signal);
  return parseAssistantResponse(payload, contextGeneration);
}

export const assistantClientLimits = Object.freeze({
  maxMessageLength: MAX_MESSAGE_LENGTH,
  maxAttachmentBytes: ASSISTANT_MAX_ATTACHMENT_BYTES,
  maxTotalAttachmentBytes: ASSISTANT_MAX_TOTAL_ATTACHMENT_BYTES,
});

export type AssistantApiPayload = AssistantApiResponse;
