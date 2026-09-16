import { companyApiRequest } from "./companyApi.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import type { FinancialDocumentSnapshot } from "./documentGeneration.ts";
import type { DocumentDeliveryAttachmentSource } from "./documentDelivery.ts";

export interface EmailRecipient {
  readonly email: string;
  readonly name?: string;
}

export interface SendFinancialDocumentInput {
  readonly snapshot: FinancialDocumentSnapshot;
  readonly to: string;
  readonly cc?: string;
  readonly subject: string;
  readonly message: string;
  readonly attachmentName: string;
  readonly idempotencyKey?: string;
}

export interface SendEmailMessageInput {
  readonly snapshot?: FinancialDocumentSnapshot;
  readonly to: readonly (string | EmailRecipient)[];
  readonly cc?: readonly (string | EmailRecipient)[];
  readonly subject: string;
  readonly message: string;
  readonly attachmentName?: string;
  readonly idempotencyKey?: string;
}

export interface DocumentSendResult {
  readonly status: "ACCEPTED" | "SENT" | "DELIVERED" | "FAILED" | "UNKNOWN";
  readonly providerId?: "BREVO";
  readonly providerMessageId?: string;
  readonly providerStatus?: string;
  readonly idempotent?: boolean;
  readonly reconciliationRequired?: boolean;
  readonly attachmentSource?: DocumentDeliveryAttachmentSource;
  readonly attachmentSha256?: string;
  readonly attachmentName?: string;
  readonly templateVersion?: string;
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

function recipients(value: string): string[] {
  return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}

function normalizeRecipient(value: string | EmailRecipient): EmailRecipient {
  return typeof value === "string" ? { email: value } : value;
}

export async function sendEmailMessage(input: SendEmailMessageInput): Promise<DocumentSendResult> {
  let response: Response;
  try {
    response = await companyApiRequest("/api/messaging/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      companyId: requireActiveCompanyId(),
      body: JSON.stringify({
        documentType: input.snapshot?.documentType || "GENERAL_EMAIL",
        ...(input.snapshot?.documentId ? { documentId: input.snapshot.documentId } : {}),
        ...(input.snapshot?.snapshotId ? { snapshotId: input.snapshot.snapshotId } : {}),
        to: input.to.map(normalizeRecipient),
        cc: (input.cc || []).map(normalizeRecipient),
        subject: input.subject,
        message: input.message,
        ...(input.snapshot ? { attachmentName: input.attachmentName || "issued-document.pdf" } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        confirmed: true,
      }),
    });
  } catch {
    throw new DocumentSendError("Email acceptance could not be confirmed. Check Sent / Delivery History before retrying.", { code: "DOCUMENT_SEND_RECONCILE_REQUIRED", reconciliationRequired: true });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const responseCode = typeof payload.code === "string" ? payload.code : undefined;
    const reconciliationRequired = payload.data?.reconciliationRequired === true
      || responseCode === "DOCUMENT_SEND_RECONCILE_REQUIRED"
      || responseCode === "EMAIL_SEND_RECONCILE_REQUIRED"
      || (!responseCode && response.status >= 500)
      || (response.ok && payload.success !== true);
    const code = responseCode || (!reconciliationRequired ? "DOCUMENT_SEND_FAILED" : undefined);
    throw new DocumentSendError(payload.error || "The email could not be sent safely.", {
      code,
      status: response.status,
      reconciliationRequired,
    });
  }
  return payload.data as DocumentSendResult;
}

export async function sendFinancialDocumentByEmail(input: SendFinancialDocumentInput): Promise<DocumentSendResult> {
  return sendEmailMessage({
    snapshot: input.snapshot,
    to: recipients(input.to),
    cc: recipients(input.cc || ""),
    subject: input.subject,
    message: input.message,
    attachmentName: input.attachmentName,
    idempotencyKey: input.idempotencyKey,
  });
}
