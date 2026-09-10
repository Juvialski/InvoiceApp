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

export async function sendFinancialDocumentByGmail(input: SendFinancialDocumentInput): Promise<DocumentSendResult> {
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
        documentType: input.snapshot.documentType,
        documentId: input.snapshot.documentId,
        snapshotId: input.snapshot.snapshotId,
        to: input.to,
        cc: input.cc || "",
        subject: input.subject,
        message: input.message,
        attachmentName: input.attachmentName,
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      }),
    });
  } catch {
    throw new DocumentSendError("The document send could not be confirmed. Check delivery history before retrying.", { code: "DOCUMENT_SEND_RECONCILE_REQUIRED", reconciliationRequired: true });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    const responseCode = typeof payload.code === "string" ? payload.code : undefined;
    const reconciliationRequired = responseCode === "DOCUMENT_SEND_RECONCILE_REQUIRED"
      || response.status >= 500
      || (response.ok && payload.success !== true);
    const code = responseCode || (!reconciliationRequired ? "DOCUMENT_SEND_FAILED" : undefined);
    throw new DocumentSendError(payload.error || "Gmail could not send the document.", {
      code,
      status: response.status,
      reconciliationRequired,
    });
  }
  return payload.data as DocumentSendResult;
}
