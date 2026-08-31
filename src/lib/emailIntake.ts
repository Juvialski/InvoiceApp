import type { EmailClassification, GmailAttachmentSummary, GmailImportedMessage, GmailMessageCandidate, GmailScanWindow } from "../types.ts";
import { companyApiRequest } from "./companyApi.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { clearGoogleProviderTokens, getGoogleProviderToken, supabase } from "./supabase.ts";
import { markEmailClassification, saveGmailMessageSource, saveGmailSyncState } from "./persistence.ts";

export type EmailIntakeDestination = "INVOICE" | "BANK_STATEMENT" | "UNSUPPORTED";

export interface EmailIntakeClassification extends EmailClassification {
  suggestedDestination: EmailIntakeDestination;
  statementAttachmentIds?: string[];
  accountHint?: string;
}

export interface EmailIntakeScanResult {
  messages: GmailMessageCandidate[];
  historyId?: string;
  emailAddress?: string;
  lastSyncedAt?: string;
}

export interface PendingEmailStatementReview {
  id: string;
  sourceDocumentId: string;
  emailMessageId: string;
  gmailMessageId: string;
  gmailAttachmentId?: string;
  fileName: string;
  mimeType: string;
  subject: string;
  sender: string;
  createdAt: string;
}

const PENDING_EMAIL_STATEMENT_KEY = "engoryx_pending_email_statement_review_v1";

function financeText(message: GmailMessageCandidate) {
  return `${message.sender}\n${message.subject}\n${message.snippet}\n${message.bodyText}`.toLowerCase();
}

function attachmentNameText(message: GmailMessageCandidate) {
  return message.attachments.map((attachment) => attachment.filename.toLowerCase()).join(" ");
}

export function isSupportedBankStatementAttachment(attachment: Pick<GmailAttachmentSummary, "filename" | "mimeType">) {
  const filename = String(attachment.filename || "").toLowerCase();
  const mimeType = String(attachment.mimeType || "").toLowerCase();
  return /\.(csv|xlsx|xls|xlsm)$/i.test(filename)
    || mimeType === "text/csv"
    || mimeType === "application/vnd.ms-excel"
    || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    || mimeType === "application/vnd.ms-excel.sheet.macroenabled.12";
}

function supportedStatementAttachmentIds(message: GmailMessageCandidate) {
  return message.attachments.filter(isSupportedBankStatementAttachment).map((attachment) => attachment.attachmentId);
}

/**
 * Deterministic first-pass classifier shared by initial scan and incremental
 * sync. It deliberately routes only statement formats already supported by
 * Cash & Banking; PDF statements remain unsupported until the parser supports
 * them in a later phase.
 */
export function classifyEmailIntakeCandidate(message: GmailMessageCandidate): EmailIntakeClassification {
  const text = financeText(message);
  const names = attachmentNameText(message);
  const statementIds = supportedStatementAttachmentIds(message);
  const hasSupportedStatement = statementIds.length > 0;
  const strongBankStatementSignal = /\b(bank statement|transaction statement|e[- ]?statement|monthly statement)\b/i.test(text)
    || /\b(statement|transactions?|account)\b/i.test(text) && /\b(bank|checking|savings|deposit|ledger|balance)\b/i.test(text);
  const spreadsheetStatementName = /\b(statement|transactions?|account|ledger)\b/i.test(names);
  const invoiceSignal = /\b(invoice|sales invoice|service invoice|vat invoice|tax invoice|billing|bill\s*(?:no|number|#)|amount due|credit note)\b/i.test(text)
    || /\binvoice\b/i.test(names);

  if (hasSupportedStatement && (strongBankStatementSignal || spreadsheetStatementName)) {
    return {
      isInvoiceLike: false,
      documentType: "STATEMENT",
      confidence: strongBankStatementSignal ? 94 : 84,
      reason: strongBankStatementSignal
        ? "Mailbox text identifies a bank/transaction statement and a supported CSV/XLSX attachment is available."
        : "A supported spreadsheet attachment is named like an account or transaction statement.",
      suggestedDestination: "BANK_STATEMENT",
      statementAttachmentIds: statementIds,
    };
  }

  if (invoiceSignal) {
    return {
      isInvoiceLike: true,
      documentType: "INVOICE",
      confidence: /\b(invoice|tax invoice|vat invoice|sales invoice|service invoice)\b/i.test(text) ? 92 : 78,
      reason: "Invoice or billing language was found. Keep the existing invoice extraction and human verification workflow.",
      suggestedDestination: "INVOICE",
    };
  }

  return {
    isInvoiceLike: false,
    documentType: /\b(statement|soa|statement of account)\b/i.test(text) ? "STATEMENT" : "OTHER",
    confidence: 68,
    reason: hasSupportedStatement
      ? "A spreadsheet attachment is present, but the email does not provide enough bank-statement evidence for automatic routing."
      : "No supported invoice or bank-statement routing signal was found.",
    suggestedDestination: "UNSUPPORTED",
    statementAttachmentIds: statementIds,
  };
}

function gmailRangeQuery(window: GmailScanWindow) {
  if (window.after && window.before) {
    const after = window.after.replaceAll("-", "/");
    const beforeDate = new Date(`${window.before}T00:00:00Z`);
    if (!Number.isNaN(beforeDate.getTime())) beforeDate.setUTCDate(beforeDate.getUTCDate() + 1);
    const before = Number.isNaN(beforeDate.getTime()) ? window.before.replaceAll("-", "/") : beforeDate.toISOString().slice(0, 10).replaceAll("-", "/");
    return `after:${after} before:${before}`;
  }
  const days = Math.max(1, Math.min(365, Number(window.days || 30)));
  return `newer_than:${days}d`;
}

export function connectedMailboxFinanceQuery(window: GmailScanWindow) {
  const range = gmailRangeQuery(window);
  return `${range} {subject:invoice subject:"sales invoice" subject:"service invoice" subject:"VAT invoice" subject:billing subject:SOA "statement of account" "credit note" "tax invoice" BIR VAT TIN "amount due" "bank statement" "account statement" "transaction statement" "e-statement" "monthly statement" filename:pdf filename:png filename:jpg filename:jpeg filename:csv filename:xlsx filename:xls filename:xlsm}`;
}

async function gmailApiRequest(path: string, body: Record<string, unknown>) {
  const googleAccessToken = getGoogleProviderToken();
  if (!googleAccessToken) throw new Error("Gmail authorization is missing or expired. Reconnect Google + Gmail; your Engoryx session remains active.");
  const response = await companyApiRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    companyId: requireActiveCompanyId(),
    googleAccessToken,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    if (response.status === 401 || response.status === 403) {
      clearGoogleProviderTokens();
      throw new Error("Gmail authorization expired or was revoked. Reconnect Gmail; your Engoryx session is still active.");
    }
    const error = new Error(result.error || "Connected mailbox request failed.");
    (error as Error & { code?: string }).code = result.code;
    throw error;
  }
  return result.data;
}

async function persistSyncState(historyId?: string, emailAddress?: string) {
  if (!historyId) return undefined;
  try {
    const state = await saveGmailSyncState(historyId, emailAddress);
    return state.lastSyncedAt;
  } catch {
    // gmail.read permits scanning. Persisting mailbox sync metadata may be
    // unavailable to a read-only access profile, and must not block the scan.
    return undefined;
  }
}

export async function scanConnectedMailbox(window: GmailScanWindow): Promise<EmailIntakeScanResult> {
  const data = await gmailApiRequest("/api/gmail/scan", { query: connectedMailboxFinanceQuery(window), maxResults: 30 });
  const messages = (data.messages || []).map((message: GmailMessageCandidate) => ({
    ...message,
    classification: classifyEmailIntakeCandidate(message),
    importStatus: "READY" as const,
  }));
  return { messages, historyId: data.historyId, emailAddress: data.emailAddress, lastSyncedAt: await persistSyncState(data.historyId, data.emailAddress) };
}

export async function syncConnectedMailbox(startHistoryId: string): Promise<EmailIntakeScanResult> {
  try {
    const data = await gmailApiRequest("/api/gmail/history", { startHistoryId });
    const messages = (data.messages || []).map((message: GmailMessageCandidate) => ({
      ...message,
      classification: classifyEmailIntakeCandidate(message),
      importStatus: "READY" as const,
    }));
    return { messages, historyId: data.historyId, emailAddress: data.emailAddress, lastSyncedAt: await persistSyncState(data.historyId, data.emailAddress) };
  } catch (error) {
    if ((error as Error & { code?: string })?.code === "HISTORY_EXPIRED") return scanConnectedMailbox({ days: 30 });
    throw error;
  }
}

function sessionStorageSafe() {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage; } catch { return null; }
}

export function readPendingEmailStatementReview(): PendingEmailStatementReview | null {
  const storage = sessionStorageSafe();
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(PENDING_EMAIL_STATEMENT_KEY) || "null");
    if (!parsed?.id || !parsed?.sourceDocumentId || !parsed?.fileName) return null;
    return parsed as PendingEmailStatementReview;
  } catch { return null; }
}

export function clearPendingEmailStatementReview() {
  sessionStorageSafe()?.removeItem(PENDING_EMAIL_STATEMENT_KEY);
}

function savePendingEmailStatementReview(value: PendingEmailStatementReview) {
  const storage = sessionStorageSafe();
  if (!storage) throw new Error("This browser cannot stage the statement review safely.");
  storage.setItem(PENDING_EMAIL_STATEMENT_KEY, JSON.stringify(value));
}

export async function prepareGmailStatementReview(message: GmailMessageCandidate, requestedAttachmentId?: string): Promise<PendingEmailStatementReview> {
  const classification = (message.classification || classifyEmailIntakeCandidate(message)) as EmailIntakeClassification;
  const imported = await gmailApiRequest("/api/gmail/import", { messageId: message.id }) as GmailImportedMessage;
  const supported = imported.attachments.filter(isSupportedBankStatementAttachment);
  const attachment = requestedAttachmentId
    ? supported.find((item) => item.attachmentId === requestedAttachmentId)
    : supported[0];
  if (!attachment) throw new Error("No supported CSV/XLSX bank statement attachment was found in this email.");

  const stored = await saveGmailMessageSource(imported);
  await markEmailClassification(stored.email.id, classification);
  const sourceDocument = stored.documents.find((document) => document.gmailAttachmentId === attachment.attachmentId)
    || stored.documents.find((document) => document.gmailPartId && document.gmailPartId === attachment.partId)
    || stored.documents.find((document) => document.attachmentIndex === attachment.attachmentIndex);
  if (!sourceDocument) throw new Error("The selected statement attachment could not be linked to its preserved source document.");

  const pending: PendingEmailStatementReview = {
    id: crypto.randomUUID(),
    sourceDocumentId: sourceDocument.id,
    emailMessageId: stored.email.id,
    gmailMessageId: imported.id,
    gmailAttachmentId: attachment.attachmentId,
    fileName: attachment.filename,
    mimeType: attachment.mimeType,
    subject: imported.subject || message.subject || "Bank statement",
    sender: imported.sender || message.sender || "",
    createdAt: new Date().toISOString(),
  };
  savePendingEmailStatementReview(pending);
  return pending;
}

async function sha256(bytes: Uint8Array) {
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function loadPendingEmailStatementFile(pending: PendingEmailStatementReview): Promise<File> {
  if (!supabase) throw new Error("Sign in before reviewing a preserved email statement.");
  const companyId = requireActiveCompanyId();
  const { data: row, error } = await supabase.from("source_documents")
    .select("id,filename,mime_type,storage_path,sha256")
    .eq("company_id", companyId)
    .eq("id", pending.sourceDocumentId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("The preserved statement source is no longer available to this company.");
  const { data: blob, error: downloadError } = await supabase.storage.from("invoice-originals").download(row.storage_path);
  if (downloadError || !blob) throw downloadError || new Error("The preserved statement file could not be downloaded.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const actualHash = await sha256(bytes);
  if (row.sha256 && actualHash !== row.sha256) throw new Error("The preserved statement failed its source-integrity check.");
  return new File([bytes], row.filename || pending.fileName, { type: row.mime_type || pending.mimeType || "application/octet-stream" });
}

export async function linkFinancialImportSource(input: { accountId: string; fileFingerprint: string; sourceDocumentId: string }) {
  if (!supabase) throw new Error("Sign in before linking statement provenance.");
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase.rpc("link_financial_import_source", {
    p_company_id: companyId,
    p_account_id: input.accountId,
    p_file_fingerprint: input.fileFingerprint,
    p_source_document_id: input.sourceDocumentId,
  });
  if (error) throw error;
  return data;
}
