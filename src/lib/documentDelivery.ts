import { companyApiRequest } from "./companyApi.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import type { FinancialDocumentSnapshot } from "./documentGeneration.ts";

/**
 * Provider-neutral delivery vocabulary. Gmail and the approved SMS paths use
 * the same attempt/history contract instead of creating parallel senders.
 */
export type DocumentDeliveryChannel = "GMAIL" | "SMS";
export type DocumentDeliveryStatus = "PENDING" | "ACCEPTED" | "SENT" | "DELIVERED" | "FAILED" | "CANCELLED" | "UNKNOWN";
export type DocumentDeliveryAttachmentSource =
  | "COMPANY_TEMPLATE_PDF"
  | "PROGRAMMATIC_PDF_FALLBACK"
  | "LEGACY_PDF"
  | "NONE";

export type DocumentDeliveryKind = "ISSUED_DOCUMENT" | "GENERAL_EMAIL" | "GENERAL_SMS";

export interface DocumentDeliveryHistoryEntry {
  readonly id: string;
  readonly channel: DocumentDeliveryChannel;
  readonly recipients: readonly string[];
  readonly cc: readonly string[];
  readonly subject: string;
  readonly sentAt: string;
  readonly senderLabel: string;
  readonly status: DocumentDeliveryStatus;
  readonly deliveryKind: DocumentDeliveryKind;
  readonly documentType?: "PURCHASE_ORDER" | "CLIENT_INVOICE";
  readonly documentId?: string;
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
  readonly providerId?: string;
  readonly providerMessageId?: string;
  readonly providerStatus?: string;
}

export function documentDeliveryAttachmentLabel(source: DocumentDeliveryAttachmentSource): string {
  switch (source) {
    case "COMPANY_TEMPLATE_PDF": return "Company-template PDF";
    case "PROGRAMMATIC_PDF_FALLBACK": return "Programmatic PDF fallback";
    case "NONE": return "No attachment";
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
  if (!(status === "PENDING" || status === "ACCEPTED" || status === "SENT" || status === "DELIVERED" || status === "FAILED" || status === "CANCELLED" || status === "UNKNOWN")) return null;
  const source = String(row.attachmentSource || "LEGACY_PDF").toUpperCase();
  const attachmentSource: DocumentDeliveryAttachmentSource = source === "COMPANY_TEMPLATE_PDF"
    ? "COMPANY_TEMPLATE_PDF"
    : source === "PROGRAMMATIC_PDF_FALLBACK" ? "PROGRAMMATIC_PDF_FALLBACK" : source === "NONE" ? "NONE" : "LEGACY_PDF";
  const deliveryKindValue = String(row.deliveryKind || "ISSUED_DOCUMENT").toUpperCase();
  const deliveryKind: DocumentDeliveryKind = deliveryKindValue === "GENERAL_EMAIL" ? "GENERAL_EMAIL" : deliveryKindValue === "GENERAL_SMS" ? "GENERAL_SMS" : "ISSUED_DOCUMENT";
  const channel = deliveryKind === "GENERAL_SMS" || String(row.channel || "").toUpperCase() === "SMS" ? "SMS" : "GMAIL";
  const documentType = String(row.documentType || "").toUpperCase();
  const documentId = String(row.documentId || "").trim();
  const attachmentSize = Number(row.attachmentSize);
  const attemptCount = Number(row.attemptCount);
  const providerMessageId = typeof row.providerMessageId === "string" ? row.providerMessageId.trim().slice(0, 200) : "";
  const reconciliationRequired = row.reconciliationRequired === true || status === "UNKNOWN" || status === "PENDING" || (deliveryKind === "GENERAL_SMS" && status === "ACCEPTED" && !providerMessageId);
  return {
    id: String(row.id || ""),
    channel,
    recipients: safeHistoryArray(row.recipients),
    cc: safeHistoryArray(row.cc),
    subject: String(row.subject || "").slice(0, 500),
    sentAt: String(row.sentAt || ""),
    senderLabel: String(row.senderLabel || "Company user").slice(0, 120),
    status: status as DocumentDeliveryStatus,
    deliveryKind,
    ...(documentType === "PURCHASE_ORDER" || documentType === "CLIENT_INVOICE" ? { documentType } : {}),
    ...(documentId ? { documentId } : {}),
    attachmentSource,
    attachmentName: String(row.attachmentName || (attachmentSource === "NONE" ? "No attachment" : "issued-document.pdf")).slice(0, 180),
    ...(typeof row.attachmentSha256 === "string" && /^[0-9a-f]{64}$/i.test(row.attachmentSha256) ? { attachmentSha256: row.attachmentSha256.toLowerCase() } : {}),
    ...(Number.isFinite(attachmentSize) && attachmentSize > 0 ? { attachmentSize } : {}),
    ...(typeof row.templateVersion === "string" && row.templateVersion.trim() ? { templateVersion: row.templateVersion.trim().slice(0, 200) } : {}),
    safeMessage: String(row.safeMessage || "Delivery history is available.").slice(0, 300),
    auditRecorded: row.auditRecorded === true,
    reconciliationRequired,
    resendAllowed: row.resendAllowed === true && !reconciliationRequired && (status === "SENT" || status === "FAILED"),
    attemptCount: Number.isFinite(attemptCount) && attemptCount > 0 ? Math.trunc(attemptCount) : 1,
    ...(typeof row.providerId === "string" && row.providerId.trim() ? { providerId: row.providerId.trim().slice(0, 80) } : {}),
    ...(providerMessageId ? { providerMessageId } : {}),
    ...(typeof row.providerStatus === "string" && row.providerStatus.trim() ? { providerStatus: row.providerStatus.trim().slice(0, 80) } : {}),
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

export async function loadCommunicationsDeliveryHistory(filter: { documentType?: "PURCHASE_ORDER" | "CLIENT_INVOICE"; documentId?: string } = {}): Promise<readonly DocumentDeliveryHistoryEntry[]> {
  const companyId = requireActiveCompanyId();
  const params = new URLSearchParams();
  if (filter.documentType && filter.documentId) {
    params.set("documentType", filter.documentType);
    params.set("documentId", filter.documentId);
  }
  const response = await companyApiRequest(`/api/document-delivery-history${params.toString() ? `?${params.toString()}` : ""}`, { companyId });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error || "Communication delivery history could not be loaded safely.");
  const rows = Array.isArray(payload.data?.deliveries) ? payload.data.deliveries : [];
  return rows.map(safeHistoryEntry).filter((entry): entry is DocumentDeliveryHistoryEntry => Boolean(entry));
}
