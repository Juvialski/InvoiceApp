import { companyApiRequest } from "./companyApi.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { getGoogleProviderToken } from "./supabase.ts";
import type { FinancialDocumentSnapshot } from "./documentGeneration.ts";

export interface SendFinancialDocumentInput {
  snapshot: FinancialDocumentSnapshot;
  to: string;
  cc?: string;
  subject: string;
  message: string;
  attachmentName: string;
  idempotencyKey?: string;
}

export async function sendFinancialDocumentByGmail(input: SendFinancialDocumentInput) {
  const token = getGoogleProviderToken();
  if (!token) throw new Error("Google + Gmail sending is not connected. Reconnect Gmail and grant send permission before sending.");
  const response = await companyApiRequest("/api/gmail/send", {
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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || "Gmail could not send the document.");
  return payload.data as { gmailMessageId?: string; auditId?: string; status: "SENT" };
}
