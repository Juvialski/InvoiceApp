import type {
  DocumentDeliveryAttachmentSource,
  DocumentDeliveryHistoryEntry,
  DocumentDeliveryStatus,
} from "../../lib/documentDelivery.ts";

export interface DocumentDeliveryIntentRow {
  readonly id?: unknown;
  readonly sender_user_id?: unknown;
  readonly recipients?: unknown;
  readonly cc?: unknown;
  readonly subject?: unknown;
  readonly attachment_name?: unknown;
  readonly trusted_sha256?: unknown;
  readonly status?: unknown;
  readonly attempt_count?: unknown;
  readonly created_at?: unknown;
  readonly updated_at?: unknown;
  readonly attachment_source?: unknown;
  readonly attachment_size?: unknown;
  readonly template_version?: unknown;
}

export interface DocumentDeliveryAuditRow {
  readonly id?: unknown;
  readonly send_intent_id?: unknown;
  readonly sender_user_id?: unknown;
  readonly recipients?: unknown;
  readonly cc?: unknown;
  readonly subject?: unknown;
  readonly attachment_name?: unknown;
  readonly status?: unknown;
  readonly created_at?: unknown;
  readonly attachment_source?: unknown;
  readonly attachment_size?: unknown;
  readonly template_version?: unknown;
  readonly attachment_sha256?: unknown;
}

function boundedString(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => boundedString(item, 320)).filter(Boolean).slice(0, 20);
}

function source(value: unknown): DocumentDeliveryAttachmentSource {
  const normalized = boundedString(value, 40).toUpperCase();
  if (normalized === "COMPANY_TEMPLATE_PDF") return "COMPANY_TEMPLATE_PDF";
  if (normalized === "PROGRAMMATIC_PDF_FALLBACK") return "PROGRAMMATIC_PDF_FALLBACK";
  return "LEGACY_PDF";
}

function status(value: unknown): DocumentDeliveryStatus {
  const normalized = boundedString(value, 20).toUpperCase();
  if (normalized === "PENDING" || normalized === "SENT" || normalized === "FAILED") return normalized;
  return "UNKNOWN";
}

function hash(value: unknown): string | undefined {
  const normalized = boundedString(value, 64).toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : undefined;
}

function timestamp(...values: unknown[]): string {
  return values.map((value) => boundedString(value, 80)).find(Boolean) || "";
}

function safeMessage(currentStatus: DocumentDeliveryStatus, auditRecorded: boolean, reconciliationRequired: boolean): string {
  if (reconciliationRequired) return "Delivery could not be confirmed safely. Reconciliation is required before another send.";
  if (currentStatus === "PENDING") return "This delivery is still in progress. Check history again before retrying.";
  if (currentStatus === "SENT") return auditRecorded ? "Sent through Gmail." : "Gmail accepted this delivery, but its history needs reconciliation before another send.";
  if (currentStatus === "FAILED") return auditRecorded ? "Gmail rejected this delivery. A new send attempt may be started." : "The failed delivery history needs reconciliation before another send.";
  return "Gmail delivery could not be confirmed. Reconciliation is required before another send.";
}

export function mapDocumentDeliveryHistory(
  intents: readonly DocumentDeliveryIntentRow[],
  audits: readonly DocumentDeliveryAuditRow[],
  currentUserId: string,
): readonly DocumentDeliveryHistoryEntry[] {
  const auditsByIntent = new Map<string, DocumentDeliveryAuditRow>();
  for (const audit of audits) {
    const id = boundedString(audit.send_intent_id, 80);
    if (id && !auditsByIntent.has(id)) auditsByIntent.set(id, audit);
  }
  const entries: DocumentDeliveryHistoryEntry[] = intents.map((intent) => {
    const id = boundedString(intent.id, 80);
    const audit = auditsByIntent.get(id);
    const currentStatus = status(intent.status);
    const auditRecorded = Boolean(audit);
    const auditStatus = audit ? status(audit.status) : currentStatus;
    const reconciliationRequired = currentStatus === "UNKNOWN"
      || currentStatus === "PENDING"
      || !auditRecorded
      || auditStatus !== currentStatus;
    const attachmentSource = source(intent.attachment_source || audit?.attachment_source);
    const attachmentSha256 = hash(intent.trusted_sha256 || audit?.attachment_sha256);
    const attachmentSize = Number(intent.attachment_size);
    const attemptCount = Number(intent.attempt_count);
    return {
      id,
      channel: "GMAIL" as const,
      recipients: safeArray(intent.recipients),
      cc: safeArray(intent.cc),
      subject: boundedString(intent.subject, 500),
      sentAt: timestamp(audit?.created_at, intent.updated_at, intent.created_at),
      senderLabel: boundedString(intent.sender_user_id, 80) === currentUserId ? "You" : "Company user",
      status: currentStatus,
      attachmentSource,
      attachmentName: boundedString(intent.attachment_name, 180) || "issued-document.pdf",
      ...(attachmentSha256 ? { attachmentSha256 } : {}),
      ...(Number.isFinite(attachmentSize) && attachmentSize > 0 ? { attachmentSize } : {}),
      ...(boundedString(intent.template_version, 200) ? { templateVersion: boundedString(intent.template_version, 200) } : {}),
      safeMessage: safeMessage(currentStatus, auditRecorded, reconciliationRequired),
      auditRecorded,
      reconciliationRequired,
      resendAllowed: !reconciliationRequired && (currentStatus === "SENT" || currentStatus === "FAILED"),
      attemptCount: Number.isFinite(attemptCount) && attemptCount > 0 ? Math.trunc(attemptCount) : 1,
    };
  }).filter((entry) => Boolean(entry.id));

  // R3 allowed a small set of historical audit rows before R5 linked them to
  // durable intents. Preserve those immutable records in the same history
  // surface, but label their attachment provenance as legacy when it was not
  // recorded by the trusted intent contract.
  const intentIds = new Set(intents.map((intent) => boundedString(intent.id, 80)).filter(Boolean));
  for (const audit of audits) {
    const auditId = boundedString(audit.id, 80);
    const intentId = boundedString(audit.send_intent_id, 80);
    if (!auditId || (intentId && intentIds.has(intentId))) continue;
    const auditStatus = status(audit.status);
    if (auditStatus !== "SENT" && auditStatus !== "FAILED") continue;
    const attachmentSize = Number(audit.attachment_size);
    entries.push({
      id: `legacy-${auditId}`,
      channel: "GMAIL",
      recipients: safeArray(audit.recipients),
      cc: safeArray(audit.cc),
      subject: boundedString(audit.subject, 500),
      sentAt: timestamp(audit.created_at),
      senderLabel: boundedString(audit.sender_user_id, 80) === currentUserId ? "You" : "Company user",
      status: auditStatus,
      attachmentSource: source(audit.attachment_source),
      attachmentName: boundedString(audit.attachment_name, 180) || "issued-document.pdf",
      ...(hash(audit.attachment_sha256) ? { attachmentSha256: hash(audit.attachment_sha256) } : {}),
      ...(Number.isFinite(attachmentSize) && attachmentSize > 0 ? { attachmentSize } : {}),
      ...(boundedString(audit.template_version, 200) ? { templateVersion: boundedString(audit.template_version, 200) } : {}),
      safeMessage: safeMessage(auditStatus, true, false),
      auditRecorded: true,
      reconciliationRequired: false,
      resendAllowed: true,
      attemptCount: 1,
    });
  }
  return entries.sort((left, right) => right.sentAt.localeCompare(left.sentAt));
}
