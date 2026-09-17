import express from "express";
import { createHash } from "node:crypto";
import {
  checkBrevoEmailProvider,
  createBrevoEmailProvider,
} from "./brevoEmailProvider.ts";
import {
  checkSmsProviderOverview,
  getSmsProviderStatus,
  resolveSmsProvider,
} from "./smsProvider.ts";
import { normalizePhilippineMobileNumber, SMS_MAX_MESSAGE_LENGTH } from "../../lib/smsNumber.ts";
import {
  ApiAuthorizationError,
  authorizeCompanyRequest,
  firstHeaderValue,
  UUID_PATTERN,
  type CompanyRequestAuthorization,
} from "../auth/serverAuthorization.ts";
import { finalizeIssuedDocumentTemplatePdfForDelivery } from "../documentTemplates/documentTemplateRouter.ts";
import {
  assertIssuedDocumentDeliveryLifecycle,
  documentSendResponseData,
  documentReadPermission,
  issuedDocumentType,
  renderTrustedIssuedPdf,
  type DocumentAttachmentSource,
} from "../documentDelivery/documentDeliveryHttp.ts";

const smsSendRateLimit = new Map<string, { windowStartedAt: number; count: number }>();
const SMS_RATE_WINDOW_MS = 60_000;
const SMS_RATE_LIMIT = 10;
function smsSendRateLimitMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.method !== "POST") return next();
  const now = Date.now();
  if (smsSendRateLimit.size > 10_000) {
    for (const [key, value] of smsSendRateLimit) if (now - value.windowStartedAt >= SMS_RATE_WINDOW_MS) smsSendRateLimit.delete(key);
  }
  const company = firstHeaderValue(req.headers["x-company-id"]).trim();
  const key = `${String(req.ip || req.socket.remoteAddress || "unknown")}:${company}`;
  const current = smsSendRateLimit.get(key);
  const windowStartedAt = current && now - current.windowStartedAt < SMS_RATE_WINDOW_MS ? current.windowStartedAt : now;
  const count = current && windowStartedAt === current.windowStartedAt ? current.count + 1 : 1;
  smsSendRateLimit.set(key, { windowStartedAt, count });
  if (count > SMS_RATE_LIMIT) return res.status(429).json({ success: false, code: "SMS_RATE_LIMITED", error: "SMS sending is temporarily rate limited. Try again later." });
  return next();
}

function rpcRow(value: unknown) {
  if (Array.isArray(value)) return value.find((item): item is Record<string, any> => Boolean(item && typeof item === "object")) || null;
  return value && typeof value === "object" ? value as Record<string, any> : null;
}

function smsIntentResponse(intent: Record<string, any>, result: { providerId?: string; providerMessageId?: string; providerStatus?: string; status?: string; reconciliationRequired?: boolean }, extras: Record<string, unknown> = {}) {
  return {
    intentId: String(intent.id || ""),
    status: String(result.status || intent.status || "UNKNOWN").toUpperCase(),
    ...(String(result.providerId || intent.provider_id || "") ? { providerId: String(result.providerId || intent.provider_id) } : {}),
    ...(String(result.providerMessageId || intent.provider_message_id || "") ? { providerMessageId: String(result.providerMessageId || intent.provider_message_id) } : {}),
    ...(String(result.providerStatus || intent.provider_status || "") ? { providerStatus: String(result.providerStatus || intent.provider_status) } : {}),
    reconciliationRequired: result.reconciliationRequired === true || intent.reconciliation_required === true || String(result.status || intent.status || "").toUpperCase() === "UNKNOWN",
    ...extras,
  };
}

function smsRouteError(error: unknown, fallback: string) {
  if (error instanceof ApiAuthorizationError) return { status: error.status, code: error.code, message: error.message };
  const providerCode = error && typeof error === "object" && "code" in error ? String((error as Record<string, unknown>).code || "") : "";
  if (providerCode === "23514" || providerCode === "22023" || providerCode === "22P02") return { status: 400, code: "SMS_REQUEST_INVALID", message: "The SMS request is invalid." };
  if (providerCode === "42501") return { status: 403, code: "FORBIDDEN", message: "You do not have permission for this company messaging operation." };
  return { status: 503, code: "SMS_SEND_RECONCILE_REQUIRED", message: fallback };
}



interface NormalizedEmailRecipient {
  email: string;
  name?: string;
}

function normalizedEmailList(value: unknown, label: string): NormalizedEmailRecipient[] {
  const raw: unknown[] = Array.isArray(value) ? value : value === undefined || value === null ? [] : String(value).split(",");
  const present = raw.filter((item) => {
    const row = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : { email: item };
    return String(row.email || "").trim().length > 0;
  });
  const values = present.map((item) => {
    const row = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : { email: item };
    const email = String(row.email || "").trim().toLowerCase();
    const name = String(row.name || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
    if (!/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(email) || email.length > 320) {
      throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", `${label} contains an invalid email address.`);
    }
    return { email, ...(name ? { name } : {}) };
  }).filter((item) => item.email);
  if (values.length > 20) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", `${label} has too many recipients.`);
  return values;
}

function safeMailHeader(value: unknown, fallback: string) {
  const normalized = String(value || fallback).replace(/[\r\n]+/g, " ").trim();
  return normalized.slice(0, 500) || fallback;
}



function emailRouteError(error: unknown, fallback: string) {
  if (error instanceof ApiAuthorizationError) return { status: error.status, code: error.code, message: error.message };
  const providerCode = error && typeof error === "object" && "code" in error ? String((error as Record<string, unknown>).code || "") : "";
  if (providerCode === "23514" || providerCode === "22023" || providerCode === "22P02") return { status: 400, code: "EMAIL_REQUEST_INVALID", message: "The email request is invalid." };
  if (providerCode === "42501") return { status: 403, code: "FORBIDDEN", message: "You do not have permission for this company email operation." };
  return { status: 503, code: "EMAIL_SEND_RECONCILE_REQUIRED", message: fallback };
}

export function createMessagingRouter() {
  const router = express.Router();
  router.use("/messaging/sms/send", smsSendRateLimitMiddleware);
  router.get("/messaging/status", async (req, res) => {
    try {
      const auth = await authorizeCompanyRequest(req, "documents.send");
      let email;
      try { email = await checkBrevoEmailProvider(process.env); }
      catch { email = { status: "CONNECTION_PROBLEM", message: "Email provider status could not be checked safely." } as const; }
      let sms;
      try { sms = await checkSmsProviderOverview(process.env); }
      catch { sms = getSmsProviderStatus(process.env); }
      return res.json({ success: true, data: { companyId: auth.companyId, email, sms } });
    } catch (error) {
      const status = error instanceof ApiAuthorizationError ? error.status : 503;
      return res.status(status).json({ success: false, error: error instanceof Error ? error.message : "Messaging provider status is unavailable." });
    }
  });


  router.post("/messaging/sms/send", async (req, res) => {
    let auth: CompanyRequestAuthorization | null = null;
    let sendIntentId = "";
    try {
      auth = await authorizeCompanyRequest(req, "documents.send");
      const contentLength = Number(req.headers["content-length"] || 0);
      if (Number.isFinite(contentLength) && contentLength > 32 * 1024) return res.status(413).json({ success: false, code: "SMS_REQUEST_TOO_LARGE", error: "The SMS request is too large." });
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return res.status(400).json({ success: false, code: "SMS_REQUEST_INVALID", error: "The SMS request payload is invalid." });
      if (JSON.stringify(req.body).length > 32 * 1024) return res.status(413).json({ success: false, code: "SMS_REQUEST_TOO_LARGE", error: "The SMS request is too large." });
      if (req.body?.confirmed !== true) return res.status(400).json({ success: false, code: "SMS_HUMAN_CONFIRMATION_REQUIRED", error: "Review the SMS and confirm it before sending." });
      let destination: string;
      try { destination = normalizePhilippineMobileNumber(req.body?.destination); }
      catch (error) { return res.status(400).json({ success: false, code: "SMS_DESTINATION_INVALID", error: error instanceof Error ? error.message : "A valid Philippine mobile recipient is required." }); }
      const message = typeof req.body?.message === "string" ? req.body.message.replace(/[\u0000]/g, "").trim() : "";
      if (!message) return res.status(400).json({ success: false, code: "SMS_MESSAGE_REQUIRED", error: "A non-empty SMS message is required." });
      if (message.length > SMS_MAX_MESSAGE_LENGTH) return res.status(413).json({ success: false, code: "SMS_MESSAGE_TOO_LONG", error: `SMS messages are limited to ${SMS_MAX_MESSAGE_LENGTH} characters.` });
      const idempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : "";
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(idempotencyKey)) return res.status(400).json({ success: false, code: "SMS_IDEMPOTENCY_REQUIRED", error: "A valid SMS send identity is required." });
      const provider = resolveSmsProvider(process.env);
      if (!provider) return res.status(503).json({ success: false, code: "SMS_NOT_CONFIGURED", error: "No complete SMS provider configuration is available on this deployment." });
      const messageBodySha256 = createHash("sha256").update(message, "utf8").digest("hex");
      const claimResult = await auth.supabase.rpc("claim_sms_send_intent", {
        p_provider_id: provider.id,
        p_destination: destination,
        p_idempotency_key: idempotencyKey,
        p_message_body_sha256: messageBodySha256,
      });
      if (claimResult.error) throw claimResult.error;
      const claim = rpcRow(claimResult.data);
      const intent = claim?.intent && typeof claim.intent === "object" ? claim.intent as Record<string, any> : null;
      if (!intent?.id) throw new Error("The SMS delivery intent was not returned.");
      sendIntentId = String(intent.id);
      if (claim?.idempotent === true) return res.json({ success: true, data: smsIntentResponse(intent, { status: intent.status }, { idempotent: true }) });
      if (claim?.claimed !== true) return res.status(409).json({ success: false, code: "SMS_SEND_RECONCILE_REQUIRED", error: "This SMS send is already in progress or requires reconciliation. Check Sent / Delivery History before retrying." });

      const providerResult = await provider.send({ destination, message, idempotencyKey });
      const completion = await auth.supabase.rpc("complete_sms_delivery_intent", {
        p_intent_id: sendIntentId,
        p_status: providerResult.status,
        p_provider_message_id: providerResult.providerMessageId || null,
        p_provider_status: providerResult.providerStatus || null,
        p_error_message: providerResult.status === "FAILED" ? providerResult.safeMessage : null,
        p_reconciliation_required: providerResult.reconciliationRequired,
      });
      if (completion.error) return res.status(503).json({ success: false, code: "SMS_SEND_RECONCILE_REQUIRED", error: "The provider response was received, but durable SMS history could not be completed. Do not resend until history is reconciled." });
      const completionRow = rpcRow(completion.data);
      const completedIntent = completionRow?.intent && typeof completionRow.intent === "object" ? completionRow.intent as Record<string, any> : intent;
      const data = smsIntentResponse(completedIntent, providerResult);
      if (providerResult.reconciliationRequired || providerResult.status === "UNKNOWN") return res.status(503).json({ success: false, code: "SMS_SEND_RECONCILE_REQUIRED", error: providerResult.safeMessage, data });
      if (providerResult.status === "FAILED") return res.status(502).json({ success: false, code: "SMS_SEND_FAILED", error: providerResult.safeMessage, data });
      return res.status(providerResult.status === "ACCEPTED" || providerResult.status === "PENDING" ? 202 : 200).json({ success: true, data });
    } catch (error) {
      const mapped = smsRouteError(error, sendIntentId ? "The SMS send could not be completed safely. Check Sent / Delivery History before retrying." : "The SMS could not be sent safely.");
      return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
    }
  });

  router.post("/messaging/sms/reconcile", async (req, res) => {
    try {
      const auth = await authorizeCompanyRequest(req, "documents.send");
      const intentId = String(req.body?.intentId || "").trim();
      if (!UUID_PATTERN.test(intentId)) return res.status(400).json({ success: false, code: "SMS_INTENT_INVALID", error: "A valid SMS delivery intent is required." });
      const { data: intent, error: intentError } = await auth.supabase
        .from("document_send_intents")
        .select("id,delivery_channel,delivery_kind,provider_id,provider_message_id,status")
        .eq("company_id", auth.companyId)
        .eq("id", intentId)
        .maybeSingle();
      if (intentError) throw intentError;
      if (!intent || intent.delivery_channel !== "SMS" || intent.delivery_kind !== "GENERAL_SMS") return res.status(404).json({ success: false, code: "SMS_INTENT_NOT_FOUND", error: "The SMS delivery history entry was not found." });
      const provider = resolveSmsProvider(process.env);
      if (!provider || String(intent.provider_id || "") !== provider.id) return res.status(503).json({ success: false, code: "SMS_SEND_RECONCILE_REQUIRED", error: "The original SMS provider configuration is not available for reconciliation." });
      const providerMessageId = String(intent.provider_message_id || "").trim();
      if (!providerMessageId) return res.status(409).json({ success: false, code: "SMS_SEND_RECONCILE_REQUIRED", error: "This SMS has no provider reference to reconcile safely." });
      const providerResult = await provider.lookupStatus(providerMessageId);
      const completion = await auth.supabase.rpc("complete_sms_delivery_intent", {
        p_intent_id: intentId,
        p_status: providerResult.status,
        p_provider_message_id: providerResult.providerMessageId || providerMessageId,
        p_provider_status: providerResult.providerStatus || null,
        p_error_message: providerResult.status === "FAILED" ? providerResult.safeMessage : null,
        p_reconciliation_required: providerResult.reconciliationRequired,
      });
      if (completion.error) return res.status(503).json({ success: false, code: "SMS_SEND_RECONCILE_REQUIRED", error: "The provider status was received, but durable SMS history could not be updated safely." });
      const completionRow = rpcRow(completion.data);
      const updatedIntent = completionRow?.intent && typeof completionRow.intent === "object" ? completionRow.intent as Record<string, any> : intent as Record<string, any>;
      const data = smsIntentResponse(updatedIntent, providerResult);
      if (providerResult.reconciliationRequired || providerResult.status === "UNKNOWN") return res.status(503).json({ success: false, code: "SMS_SEND_RECONCILE_REQUIRED", error: providerResult.safeMessage, data });
      return res.json({ success: true, data });
    } catch (error) {
      const mapped = smsRouteError(error, "SMS status could not be reconciled safely.");
      return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
    }
  });

  router.post("/messaging/email/send", async (req, res) => {
    let auth: CompanyRequestAuthorization | null = null;
    let sendIntentId = "";
    let intentStateCompleted = false;
    try {
      auth = await authorizeCompanyRequest(req, "documents.send");
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return res.status(400).json({ success: false, code: "EMAIL_REQUEST_INVALID", error: "The email request payload is invalid." });
      if (req.body.confirmed !== true) return res.status(400).json({ success: false, code: "EMAIL_HUMAN_CONFIRMATION_REQUIRED", error: "Review the email and confirm it before sending." });
      const requestedType = String(req.body.documentType || "").trim().toUpperCase();
      const documentType = issuedDocumentType(requestedType);
      const generalEmail = requestedType === "GENERAL_EMAIL";
      if (!documentType && !generalEmail) return res.status(400).json({ success: false, code: "EMAIL_REQUEST_INVALID", error: "A supported email or issued document type is required." });
      const documentId = String(req.body.documentId || "").trim();
      const snapshotId = String(req.body.snapshotId || "").trim();
      let snapshot: { id: string; document_type: string; document_id: string; document_number: string; template_version: string; template_version_id?: string | null; template_sha256?: string | null; snapshot: unknown } | null = null;
      if (documentType) {
        if (!UUID_PATTERN.test(documentId) || !UUID_PATTERN.test(snapshotId)) return res.status(400).json({ success: false, code: "EMAIL_REQUEST_INVALID", error: "An issued document snapshot is required before sending." });
        const { data: allowed, error: permissionError } = await auth.supabase.rpc("has_company_permission", { p_company_id: auth.companyId, p_permission_key: documentReadPermission(documentType) });
        if (permissionError || allowed !== true) throw new ApiAuthorizationError(403, "FORBIDDEN", "You do not have permission to send this document type.");
        await assertIssuedDocumentDeliveryLifecycle(auth, documentType, documentId);
        const { data: loadedSnapshot, error: snapshotError } = await auth.supabase
          .from("issued_document_snapshots")
          .select("id,document_type,document_id,document_number,template_version,template_version_id,template_sha256,snapshot")
          .eq("company_id", auth.companyId)
          .eq("id", snapshotId)
          .eq("document_type", documentType)
          .eq("document_id", documentId)
          .maybeSingle();
        if (snapshotError) throw snapshotError;
        if (!loadedSnapshot) throw new ApiAuthorizationError(409, "COMPANY_REQUIRED", "The issued document snapshot is unavailable. Generate the document again before sending.");
        snapshot = loadedSnapshot as typeof snapshot;
      } else if (documentId || snapshotId) {
        throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "An ordinary email cannot include issued-document identifiers.");
      }

      const recipients = normalizedEmailList(req.body.to, "To");
      const cc = normalizedEmailList(req.body.cc, "CC");
      if (!recipients.length) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "At least one To recipient is required.");
      const subject = safeMailHeader(req.body.subject, documentType && snapshot ? (documentType === "PURCHASE_ORDER" ? "Purchase Order " : "Client Invoice ") + snapshot.document_number : "New message");
      const message = typeof req.body.message === "string" ? req.body.message.replace(/[\u0000]/g, "").trim().slice(0, 20_000) : "";
      if (!message) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "A message body is required.");
      const attachmentName = documentType && snapshot
        ? safeMailHeader(req.body.attachmentName, String(snapshot.document_number) + ".pdf").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 180) || String(snapshot.document_number) + ".pdf"
        : undefined;
      let attachmentSource: DocumentAttachmentSource | "NONE" = "NONE";
      let pdfBytes: Buffer | undefined;
      if (documentType && snapshot) {
        const templatePdf = await finalizeIssuedDocumentTemplatePdfForDelivery(
          { accessToken: auth.accessToken, companyId: auth.companyId, supabase: auth.supabase, user: auth.user },
          {},
          { snapshotId, documentType, documentId },
        );
        attachmentSource = templatePdf ? "COMPANY_TEMPLATE_PDF" : "PROGRAMMATIC_PDF_FALLBACK";
        pdfBytes = templatePdf ? Buffer.from(templatePdf.bytes) : await renderTrustedIssuedPdf(snapshot, documentType);
      }

      const provider = createBrevoEmailProvider(process.env);
      if (!provider) return res.status(503).json({ success: false, code: "EMAIL_NOT_CONFIGURED", error: "Brevo email is not configured on this deployment." });
      const providerStatus = await provider.checkStatus();
      if (providerStatus.status !== "READY") {
        const code = providerStatus.status === "SENDER_SETUP_REQUIRED" ? "EMAIL_SENDER_SETUP_REQUIRED" : providerStatus.status === "NOT_CONFIGURED" ? "EMAIL_NOT_CONFIGURED" : "EMAIL_PROVIDER_UNAVAILABLE";
        return res.status(503).json({ success: false, code, error: providerStatus.message });
      }

      const trustedSha256 = pdfBytes ? createHash("sha256").update(pdfBytes).digest("hex") : null;
      const messageBodySha256 = createHash("sha256").update(message, "utf8").digest("hex");
      const requestedKey = String(req.body.idempotencyKey || "").trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(requestedKey)) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "A valid email send identity is required.");
      const claimResult = await auth.supabase.rpc("claim_document_send_intent", {
        p_snapshot_id: snapshotId || null,
        p_document_type: documentType || "GENERAL_EMAIL",
        p_document_id: documentId || null,
        p_idempotency_key: requestedKey,
        p_trusted_sha256: trustedSha256,
        p_recipients: recipients.map((item) => item.email),
        p_cc: cc.map((item) => item.email),
        p_subject: subject,
        p_attachment_name: attachmentName || null,
        p_message_body_sha256: messageBodySha256,
      });
      if (claimResult.error) throw claimResult.error;
      const claim = rpcRow(claimResult.data);
      const intent = claim?.intent && typeof claim.intent === "object" ? claim.intent as Record<string, any> : null;
      if (!intent?.id) throw new Error("The email delivery intent was not returned.");
      if (String(intent.attachment_source || "").toUpperCase() !== attachmentSource) throw new ApiAuthorizationError(409, "COMPANY_REQUIRED", "The issued PDF provenance changed while preparing this send. Check delivery history before retrying.");
      if (claim?.idempotent === true) return res.json({ success: true, data: documentSendResponseData(intent, { status: intent.status, idempotent: true }) });
      if (claim?.claimed !== true) return res.status(409).json({ success: false, code: "EMAIL_SEND_RECONCILE_REQUIRED", error: "This email send is already in progress or requires reconciliation. Check Sent / Delivery History before retrying." });
      sendIntentId = String(intent.id);

      const providerResult = await provider.send({
        to: recipients,
        cc,
        subject,
        textContent: message,
        ...(pdfBytes && attachmentName ? { attachment: { name: attachmentName, contentBase64: pdfBytes.toString("base64") } } : {}),
        idempotencyKey: requestedKey,
      });
      const completion = await auth.supabase.rpc("complete_email_delivery_intent", {
        p_intent_id: sendIntentId,
        p_status: providerResult.status,
        p_provider_message_id: providerResult.providerMessageId || null,
        p_provider_status: providerResult.providerStatus || null,
        p_error_message: providerResult.status === "FAILED" ? providerResult.safeMessage : null,
        p_reconciliation_required: providerResult.reconciliationRequired,
      });
      if (completion.error) return res.status(503).json({ success: false, code: "EMAIL_SEND_RECONCILE_REQUIRED", error: "The provider response was received, but durable email history could not be completed. Do not resend until history is reconciled." });
      intentStateCompleted = true;
      const completedRow = rpcRow(completion.data);
      const completedIntent = completedRow?.intent && typeof completedRow.intent === "object" ? completedRow.intent as Record<string, any> : intent;
      const data = documentSendResponseData(completedIntent, {
        status: providerResult.status,
        providerId: providerResult.providerId,
        providerMessageId: providerResult.providerMessageId,
        providerStatus: providerResult.providerStatus,
        reconciliationRequired: providerResult.reconciliationRequired,
        idempotent: false,
      });
      if (providerResult.status === "UNKNOWN" || providerResult.reconciliationRequired) return res.status(503).json({ success: false, code: "EMAIL_SEND_RECONCILE_REQUIRED", error: providerResult.safeMessage, data });
      if (providerResult.status === "FAILED") return res.status(502).json({ success: false, code: "EMAIL_SEND_FAILED", error: providerResult.safeMessage, data });
      return res.status(202).json({ success: true, data });
    } catch (error) {
      if (sendIntentId && auth && !intentStateCompleted) {
        const completion = await auth.supabase.rpc("complete_email_delivery_intent", {
          p_intent_id: sendIntentId,
          p_status: "UNKNOWN",
          p_provider_status: "unhandled-error",
          p_error_message: "Email delivery could not be confirmed.",
          p_reconciliation_required: true,
        });
        if (completion.error) return res.status(503).json({ success: false, code: "EMAIL_SEND_RECONCILE_REQUIRED", error: "The email send could not be reconciled safely. Check Sent / Delivery History before retrying." });
      }
      const mapped = emailRouteError(error, sendIntentId ? "The email send could not be completed safely. Check Sent / Delivery History before retrying." : "The email could not be sent safely.");
      return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
    }
  });
  return router;
}
