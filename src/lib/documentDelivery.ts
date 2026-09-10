import { companyApiRequest } from "./companyApi.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import type { FinancialDocumentSnapshot } from "./documentGeneration.ts";

/**
 * Provider-neutral document delivery vocabulary. Gmail is the only configured
 * channel in this phase; future channels must use the same attempt/history
 * contract instead of creating a parallel document sender.
 */
export type DocumentDeliveryChannel = "GMAIL" | "SMS";
export type DocumentDeliveryStatus = "PENDING" | "SENT" | "FAILED" | "UNKNOWN";
export type DocumentDeliveryAttachmentSource =
  | "COMPANY_TEMPLATE_PDF"
  | "PROGRAMMATIC_PDF_FALLBACK"
  | "LEGACY_PDF";

export interface DocumentDeliveryHistoryEntry {
  readonly id: string;
  readonly channel: DocumentDeliveryChannel;
  readonly recipients: readonly string[];
  readonly cc: readonly string[];
  readonly subject: string;
  readonly sentAt: string;
  readonly senderLabel: string;
  readonly status: DocumentDeliveryStatus;
  readonly attachmentSource: DocumentDeliveryAttachmentSource;
  readonly attachmentName: string;
  readonly attachmentSha256?: string;
  readonly attachmentSize?: number;
  readonly templateVersion?: string;
  readonly safeMessage: string;
  readonly auditRecorded: boolean;
  readonly reconciliationRequired: boolean;
  readonly resendAllowed: boolean;
  readonly attemptCount: number;
}

export function documentDeliveryAttachmentLabel(source: DocumentDeliveryAttachmentSource): string {
  switch (source) {
    case "COMPANY_TEMPLATE_PDF": return "Company-template PDF";
    case "PROGRAMMATIC_PDF_FALLBACK": return "Programmatic PDF fallback";
    default: return "Legacy PDF";
  }
}

export function newDocumentDeliveryAttemptKey(): string {
  return globalThis.crypto?.randomUUID?.()
    || `document-send-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeHistoryArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20);
}

function safeHistoryEntry(value: unknown): DocumentDeliveryHistoryEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const status = String(row.status || "UNKNOWN").toUpperCase();
  if (!(status === "PENDING" || status === "SENT" || status === "FAILED" || status === "UNKNOWN")) return null;
  const source = String(row.attachmentSource || "LEGACY_PDF").toUpperCase();
  const attachmentSource: DocumentDeliveryAttachmentSource = source === "COMPANY_TEMPLATE_PDF"
    ? "COMPANY_TEMPLATE_PDF"
    : source === "PROGRAMMATIC_PDF_FALLBACK" ? "PROGRAMMATIC_PDF_FALLBACK" : "LEGACY_PDF";
  const attachmentSize = Number(row.attachmentSize);
  const attemptCount = Number(row.attemptCount);
  const reconciliationRequired = row.reconciliationRequired === true || status === "UNKNOWN" || status === "PENDING";
  return {
    id: String(row.id || ""),
    channel: "GMAIL",
    recipients: safeHistoryArray(row.recipients),
    cc: safeHistoryArray(row.cc),
    subject: String(row.subject || "").slice(0, 500),
    sentAt: String(row.sentAt || ""),
    senderLabel: String(row.senderLabel || "Company user").slice(0, 120),
    status: status as DocumentDeliveryStatus,
    attachmentSource,
    attachmentName: String(row.attachmentName || "issued-document.pdf").slice(0, 180),
    ...(typeof row.attachmentSha256 === "string" && /^[0-9a-f]{64}$/i.test(row.attachmentSha256) ? { attachmentSha256: row.attachmentSha256.toLowerCase() } : {}),
    ...(Number.isFinite(attachmentSize) && attachmentSize > 0 ? { attachmentSize } : {}),
    ...(typeof row.templateVersion === "string" && row.templateVersion.trim() ? { templateVersion: row.templateVersion.trim().slice(0, 200) } : {}),
    safeMessage: String(row.safeMessage || "Delivery history is available.").slice(0, 300),
    auditRecorded: row.auditRecorded === true,
    reconciliationRequired,
    resendAllowed: row.resendAllowed === true && !reconciliationRequired && (status === "SENT" || status === "FAILED"),
    attemptCount: Number.isFinite(attemptCount) && attemptCount > 0 ? Math.trunc(attemptCount) : 1,
  };
}

export async function loadDocumentDeliveryHistory(snapshot: Pick<FinancialDocumentSnapshot, "documentType" | "documentId">): Promise<readonly DocumentDeliveryHistoryEntry[]> {
  const documentId = String(snapshot.documentId || "").trim();
  if (!documentId) return [];
  const companyId = requireActiveCompanyId();
  const params = new URLSearchParams({
    documentType: snapshot.documentType,
    documentId,
  });
  const response = await companyApiRequest(`/api/document-delivery-history?${params.toString()}`, { companyId });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error || "Document delivery history could not be loaded safely.");
  const rows = Array.isArray(payload.data?.deliveries) ? payload.data.deliveries : [];
  return rows.map(safeHistoryEntry).filter((entry): entry is DocumentDeliveryHistoryEntry => Boolean(entry));
}
