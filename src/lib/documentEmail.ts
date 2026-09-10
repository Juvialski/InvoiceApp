import { companyApiRequest } from "./companyApi.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { getGoogleProviderToken } from "./supabase.ts";
import type { FinancialDocumentSnapshot } from "./documentGeneration.ts";
import type { DocumentDeliveryAttachmentSource } from "./documentDelivery.ts";

export interface SendFinancialDocumentInput {
  snapshot: FinancialDocumentSnapshot;
  to: string;
  cc?: string;
  subject: string;
  message: string;
  attachmentName: string;
  idempotencyKey?: string;
}

export interface SendEmailMessageInput {
  readonly snapshot?: FinancialDocumentSnapshot;
  readonly to: readonly string[];
  readonly cc?: readonly string[];
  readonly subject: string;
  readonly message: string;
  readonly attachmentName?: string;
  readonly idempotencyKey?: string;
}

export interface DocumentSendResult {
  status: "SENT";
  gmailMessageId?: string;
  auditId?: string;
  idempotent?: boolean;
  attachmentSource?: DocumentDeliveryAttachmentSource;
  attachmentSha256?: string;
  attachmentName?: string;
  templateVersion?: string;
}

export class DocumentSendError extends Error {
  readonly code?: string;
  readonly status: number;
  readonly reconciliationRequired: boolean;

  constructor(message: string, options: { code?: string; status?: number; reconciliationRequired?: boolean } = {}) {
    super(message);
    this.name = "DocumentSendError";
    this.code = options.code;
    this.status = options.status || 503;
    this.reconciliationRequired = options.reconciliationRequired === true;
  }
}

function recipients(value: string) {
  return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}

export async function sendEmailMessageByGmail(input: SendEmailMessageInput): Promise<DocumentSendResult> {
  const token = getGoogleProviderToken();
  if (!token) throw new DocumentSendError("Google + Gmail sending is not connected. Reconnect Gmail and grant send permission before sending.", { code: "GMAIL_NOT_CONNECTED", status: 401 });
  let response: Response;
  try {
    response = await companyApiRequest("/api/gmail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      companyId: requireActiveCompanyId(),
      googleAccessToken: token,
      body: JSON.stringify({
        documentType: input.snapshot?.documentType || "GENERAL_EMAIL",
        ...(input.snapshot?.documentId ? { documentId: input.snapshot.documentId } : {}),
        ...(input.snapshot?.snapshotId ? { snapshotId: input.snapshot.snapshotId } : {}),
        to: input.to,
        cc: input.cc || [],
        subject: input.subject,
        message: input.message,
        ...(input.snapshot ? { attachmentName: input.attachmentName || "issued-document.pdf" } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      }),
    });
  } catch {
    throw new DocumentSendError("The Gmail message could not be confirmed. Check delivery history before retrying.", { code: "DOCUMENT_SEND_RECONCILE_REQUIRED", reconciliationRequired: true });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    const responseCode = typeof payload.code === "string" ? payload.code : undefined;
    const reconciliationRequired = responseCode === "DOCUMENT_SEND_RECONCILE_REQUIRED"
      || response.status >= 500
      || (response.ok && payload.success !== true);
    const code = responseCode || (!reconciliationRequired ? "DOCUMENT_SEND_FAILED" : undefined);
    throw new DocumentSendError(payload.error || "Gmail could not send the message.", {
      code,
      status: response.status,
      reconciliationRequired,
    });
  }
  return payload.data as DocumentSendResult;
}

export async function sendFinancialDocumentByGmail(input: SendFinancialDocumentInput): Promise<DocumentSendResult> {
  return sendEmailMessageByGmail({
    snapshot: input.snapshot,
    to: recipients(input.to),
    cc: recipients(input.cc || ""),
    subject: input.subject,
    message: input.message,
    attachmentName: input.attachmentName,
    idempotencyKey: input.idempotencyKey,
  });
}
