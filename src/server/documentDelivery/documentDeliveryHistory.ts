import type {
  DocumentDeliveryAttachmentSource,
  DocumentDeliveryKind,
  DocumentDeliveryHistoryEntry,
  DocumentDeliveryStatus,
} from "../../lib/documentDelivery.ts";

export interface DocumentDeliveryIntentRow {
  readonly id?: unknown;
  readonly delivery_channel?: unknown;
  readonly delivery_kind?: unknown;
  readonly document_type?: unknown;
  readonly document_id?: unknown;
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
  readonly message_body_sha256?: unknown;
  readonly destination?: unknown;
  readonly provider_id?: unknown;
  readonly provider_message_id?: unknown;
  readonly provider_status?: unknown;
  readonly reconciliation_required?: unknown;
}

export interface DocumentDeliveryAuditRow {
  readonly id?: unknown;
  readonly send_intent_id?: unknown;
  readonly delivery_channel?: unknown;
  readonly delivery_kind?: unknown;
  readonly document_type?: unknown;
  readonly document_id?: unknown;
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
  readonly message_body_sha256?: unknown;
  readonly destination?: unknown;
  readonly provider_id?: unknown;
  readonly provider_message_id?: unknown;
  readonly provider_status?: unknown;
  readonly reconciliation_required?: unknown;
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
  if (normalized === "NONE") return "NONE";
  return "LEGACY_PDF";
}

function deliveryKind(value: unknown): DocumentDeliveryKind {
  const normalized = boundedString(value, 40).toUpperCase();
  if (normalized === "GENERAL_EMAIL") return "GENERAL_EMAIL";
  if (normalized === "GENERAL_SMS") return "GENERAL_SMS";
  return "ISSUED_DOCUMENT";
}

function status(value: unknown): DocumentDeliveryStatus {
  const normalized = boundedString(value, 20).toUpperCase();
  if (normalized === "PENDING" || normalized === "ACCEPTED" || normalized === "SENT" || normalized === "DELIVERED" || normalized === "FAILED" || normalized === "CANCELLED") return normalized;
  return "UNKNOWN";
}

function hash(value: unknown): string | undefined {
  const normalized = boundedString(value, 64).toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : undefined;
}

function timestamp(...values: unknown[]): string {
  return values.map((value) => boundedString(value, 80)).find(Boolean) || "";
}

function safeMessage(currentStatus: DocumentDeliveryStatus, channel: "GMAIL" | "SMS", auditRecorded: boolean, reconciliationRequired: boolean): string {
  if (reconciliationRequired) return "Delivery could not be confirmed safely. Reconciliation is required before another send.";
  if (currentStatus === "PENDING") return channel === "SMS" ? "This SMS is prepared and awaiting provider acceptance." : "This delivery is still in progress. Check history again before retrying.";
  if (currentStatus === "ACCEPTED") return channel === "SMS" ? "The SMS provider accepted this message for delivery. Check status for a later delivery report." : "The delivery provider accepted this message.";
  if (currentStatus === "SENT") return auditRecorded ? (channel === "SMS" ? "The SMS provider reports that this message was sent." : "Sent through Gmail.") : `${channel === "SMS" ? "The SMS provider" : "Gmail"} accepted this delivery, but its history needs reconciliation before another send.`;
  if (currentStatus === "DELIVERED") return channel === "SMS" ? "The SMS provider confirmed delivery to the recipient device or network." : "Gmail recorded this delivery attempt.";
  if (currentStatus === "FAILED") return auditRecorded ? `${channel === "SMS" ? "The SMS provider" : "Gmail"} rejected or failed this delivery. A new send attempt may be started.` : "The failed delivery history needs reconciliation before another send.";
  if (currentStatus === "CANCELLED") return `${channel === "SMS" ? "The SMS provider" : "The delivery provider"} cancelled this delivery. A new send attempt may be started.`;
  return `${channel === "SMS" ? "SMS provider" : "Gmail"} delivery could not be confirmed. Reconciliation is required before another send.`;
}

export function mapDocumentDeliveryHistory(
  intents: readonly DocumentDeliveryIntentRow[],
  audits: readonly DocumentDeliveryAuditRow[],
  currentUserId: string,
): readonly DocumentDeliveryHistoryEntry[] {
  const auditsByIntent = new Map<string, DocumentDeliveryAuditRow>();
  for (const audit of audits) {
    const id = boundedString(audit.send_intent_id, 80);
    if (!id) continue;
    const previous = auditsByIntent.get(id);
    if (!previous || timestamp(audit.created_at) > timestamp(previous.created_at)) auditsByIntent.set(id, audit);
  }
  const entries: DocumentDeliveryHistoryEntry[] = intents.map((intent) => {
    const id = boundedString(intent.id, 80);
    const audit = auditsByIntent.get(id);
    const currentStatus = status(intent.status);
    const auditRecorded = Boolean(audit);
    const auditStatus = audit ? status(audit.status) : currentStatus;
    const currentKind = deliveryKind(intent.delivery_kind || audit?.delivery_kind);
    const currentChannel = boundedString(intent.delivery_channel || audit?.delivery_channel, 20).toUpperCase() === "SMS" || currentKind === "GENERAL_SMS" ? "SMS" as const : "GMAIL" as const;
    const documentTypeValue = boundedString(intent.document_type || audit?.document_type, 40).toUpperCase();
    const documentType = documentTypeValue === "PURCHASE_ORDER" || documentTypeValue === "CLIENT_INVOICE"
      ? documentTypeValue as "PURCHASE_ORDER" | "CLIENT_INVOICE"
      : undefined;
    const documentId = boundedString(intent.document_id || audit?.document_id, 80);
    const providerMessageId = boundedString(intent.provider_message_id || audit?.provider_message_id, 200);
    const reconciliationRequired = currentStatus === "UNKNOWN"
      || currentStatus === "PENDING"
      || intent.reconciliation_required === true
      || audit?.reconciliation_required === true
      || (currentChannel === "SMS" ? currentStatus === "ACCEPTED" && !providerMessageId : !auditRecorded)
      || (auditRecorded && auditStatus !== currentStatus && !(currentChannel === "SMS" && currentStatus === "DELIVERED" && auditStatus === "SENT"));
    const attachmentSource = source(intent.attachment_source || audit?.attachment_source);
    const attachmentSha256 = hash(intent.trusted_sha256 || audit?.attachment_sha256);
    const attachmentSize = Number(intent.attachment_size);
    const attemptCount = Number(intent.attempt_count);
    return {
      id,
      channel: currentChannel,
      recipients: safeArray(intent.recipients),
      cc: safeArray(intent.cc),
      subject: boundedString(intent.subject, 500),
      sentAt: timestamp(audit?.created_at, intent.updated_at, intent.created_at),
      senderLabel: boundedString(intent.sender_user_id, 80) === currentUserId ? "You" : "Company user",
      status: currentStatus,
      deliveryKind: currentKind,
      ...(documentType ? { documentType } : {}),
      ...(documentId ? { documentId } : {}),
      attachmentSource,
      attachmentName: boundedString(intent.attachment_name, 180) || (attachmentSource === "NONE" ? "No attachment" : "issued-document.pdf"),
      ...(attachmentSha256 ? { attachmentSha256 } : {}),
      ...(Number.isFinite(attachmentSize) && attachmentSize > 0 ? { attachmentSize } : {}),
      ...(boundedString(intent.template_version, 200) ? { templateVersion: boundedString(intent.template_version, 200) } : {}),
      safeMessage: safeMessage(currentStatus, currentChannel, auditRecorded, reconciliationRequired),
      auditRecorded,
      reconciliationRequired,
      resendAllowed: !reconciliationRequired && (currentStatus === "SENT" || currentStatus === "FAILED"),
      attemptCount: Number.isFinite(attemptCount) && attemptCount > 0 ? Math.trunc(attemptCount) : 1,
      ...(boundedString(intent.provider_id || audit?.provider_id, 80) ? { providerId: boundedString(intent.provider_id || audit?.provider_id, 80) } : {}),
      ...(providerMessageId ? { providerMessageId } : {}),
      ...(boundedString(intent.provider_status || audit?.provider_status, 80) ? { providerStatus: boundedString(intent.provider_status || audit?.provider_status, 80) } : {}),
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
      deliveryKind: "ISSUED_DOCUMENT",
      ...(boundedString(audit.document_type, 40).toUpperCase() === "PURCHASE_ORDER" || boundedString(audit.document_type, 40).toUpperCase() === "CLIENT_INVOICE" ? { documentType: boundedString(audit.document_type, 40).toUpperCase() as "PURCHASE_ORDER" | "CLIENT_INVOICE" } : {}),
      ...(boundedString(audit.document_id, 80) ? { documentId: boundedString(audit.document_id, 80) } : {}),
      attachmentSource: source(audit.attachment_source),
      attachmentName: boundedString(audit.attachment_name, 180) || "issued-document.pdf",
      ...(hash(audit.attachment_sha256) ? { attachmentSha256: hash(audit.attachment_sha256) } : {}),
      ...(Number.isFinite(attachmentSize) && attachmentSize > 0 ? { attachmentSize } : {}),
      ...(boundedString(audit.template_version, 200) ? { templateVersion: boundedString(audit.template_version, 200) } : {}),
      safeMessage: safeMessage(auditStatus, "GMAIL", true, false),
      auditRecorded: true,
      reconciliationRequired: false,
      resendAllowed: true,
      attemptCount: 1,
    });
  }
  return entries.sort((left, right) => right.sentAt.localeCompare(left.sentAt));
}
