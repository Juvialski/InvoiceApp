import type {
  EmailClassification,
  EmailIntakeProfile,
  EmailIntakeProfileInput,
  EntityResolutionResult,
  Expense,
  GmailAttachmentSummary,
  GmailConnectionInfo,
  GmailImportedMessage,
  GmailMessageCandidate,
  GmailScanWindow,
} from "../types.ts";
import { companyApiRequest } from "./companyApi.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { clearGoogleProviderTokens, getGoogleProviderToken, supabase } from "./supabase.ts";
import {
  listEmailIntakeProfiles,
  markEmailClassification,
  saveGmailMessageSource,
  saveGmailSyncState,
} from "./persistence.ts";

export type EmailIntakeDestination = "INVOICE" | "BANK_STATEMENT" | "EXPENSE" | "UNSUPPORTED";

export type GmailConnectionStatus = "HEALTHY" | "RECONNECT_REQUIRED" | "NEVER_CONNECTED" | "UNCONFIGURED";

export const MAX_SENDER_CHUNK_SIZE = 8;
export const MAX_SCAN_RESULTS_PER_REQUEST = 30;
export const MAX_DISCOVERED_MESSAGES = 60;
export const MAX_AI_BATCH_SIZE = 8;

export const DISALLOWED_DOMAIN_RULES = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.com.ph",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "me.com",
  "msn.com",
  "com",
  "net",
  "org",
  "ph",
  "com.ph",
]);

export function normalizeEmail(email?: string | null): string {
  return String(email || "").trim().toLowerCase();
}

export function normalizeDomain(domain?: string | null): string {
  return String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^@+/, "")
    .replace(/^\*@?/, "")
    .replace(/^\.+/, "");
}

export function extractEmailDomain(email: string): string {
  const clean = normalizeEmail(email);
  const at = clean.lastIndexOf("@");
  return at >= 0 ? clean.slice(at + 1) : "";
}

export function isExtractableAttachment(mimeType: string, filename: string): boolean {
  const normalizedMime = String(mimeType || "").trim().toLowerCase();
  const normalizedFilename = String(filename || "").trim().toLowerCase();
  if (normalizedMime === "image/svg+xml" || normalizedFilename.endsWith(".svg")) {
    return false;
  }
  return (
    normalizedMime === "application/pdf" ||
    (normalizedMime.startsWith("image/") && !normalizedMime.includes("svg")) ||
    /\.(pdf|png|jpe?g|webp)$/i.test(normalizedFilename)
  );
}

export function parseSenderAddress(sender: string): { name: string; email: string; domain: string } {
  const trimmed = String(sender || "").trim();
  const angleMatch = trimmed.match(/^(?:"?([^"<@]+)"?\s*)?<([^>]+)>$/);
  if (angleMatch) {
    const name = (angleMatch[1] || "").trim();
    const email = normalizeEmail(angleMatch[2]);
    return { name, email, domain: extractEmailDomain(email) };
  }
  const emailMatch = trimmed.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    const email = normalizeEmail(emailMatch[1]);
    const name = trimmed.replace(emailMatch[1], "").replace(/[<>()"]/g, "").trim();
    return { name, email, domain: extractEmailDomain(email) };
  }
  return { name: trimmed, email: "", domain: "" };
}

export function validateEmailIntakeProfile(input: Partial<EmailIntakeProfileInput>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const name = String(input.name || "").trim();
  if (!name) errors.push("Profile name is required.");

  const email = input.senderEmail ? normalizeEmail(input.senderEmail) : "";
  const domain = input.senderDomain ? normalizeDomain(input.senderDomain) : "";

  if (!email && !domain) {
    errors.push("Either a specific sender email or a sender domain is required.");
  }

  if (email) {
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      errors.push("Sender email is not a valid email address.");
    }
  }

  if (domain) {
    if (domain === "*" || domain.startsWith("*.") || domain.includes("*") || domain.length < 3 || !domain.includes(".")) {
      errors.push("Sender domain cannot be a wildcard or malformed domain.");
    } else if (DISALLOWED_DOMAIN_RULES.has(domain)) {
      errors.push(`Domain '@${domain}' is a generic email provider. Use an exact sender email instead of a broad domain rule.`);
    }
  }

  const dest = input.suggestedDestination;
  if (!dest || !["INVOICE", "BANK_STATEMENT", "EXPENSE"].includes(dest)) {
    errors.push("Suggested destination must be INVOICE, BANK_STATEMENT, or EXPENSE.");
  }

  return { valid: errors.length === 0, errors };
}

export function isGmailAuthorizationError(message?: string | null) {
  const value = String(message || "").trim().toLowerCase();
  if (!value) return false;
  return /invalid_grant|re-?authentication|gmail authorization|authorization (?:is )?(?:missing|expired|revoked)|expired or was revoked|reconnect (?:gmail|google \+ gmail)/i.test(value);
}

export function resolveGmailConnectionStatus(
  connection: GmailConnectionInfo,
  activeAuthError?: string | null,
): GmailConnectionStatus {
  if (!connection.configured) return "UNCONFIGURED";
  if (!connection.signedIn) return "NEVER_CONNECTED";
  const hasAuthError = Boolean(connection.authError || isGmailAuthorizationError(activeAuthError));
  if (connection.hasGmailToken && !hasAuthError) return "HEALTHY";
  const hasPriorConnectionContext = Boolean(
    connection.email || connection.lastSyncedAt || connection.lastHistoryId || hasAuthError
  );
  if (hasPriorConnectionContext) return "RECONNECT_REQUIRED";
  return "NEVER_CONNECTED";
}

export interface EmailIntakeClassification extends EmailClassification {
  suggestedDestination: EmailIntakeDestination;
  statementAttachmentIds?: string[];
  expenseAttachmentIds?: string[];
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
  confirmedAccountId?: string;
  preliminaryResolution?: EntityResolutionResult;
  matchedProfileId?: string;
  matchedProfileName?: string;
  linkedProfileAccountId?: string;
}

export interface SuggestedExpenseFields {
  expenseDate: string;
  category: string;
  description: string;
  payee?: string;
  amount: number;
  currency: string;
  paymentMethod?: string;
  referenceNumber?: string;
  projectId?: string;
  receiptSourceDocumentId?: string;
  notes?: string;
}

export interface PendingEmailExpenseReview {
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
  suggestedExpense: SuggestedExpenseFields;
  confirmedVendorId?: string;
  preliminaryResolution?: EntityResolutionResult;
  matchedProfileId?: string;
  matchedProfileName?: string;
  linkedProfileVendorId?: string;
}

export interface ExpenseDuplicateCandidate {
  expense: Expense;
  reason: string;
  matchType: "SOURCE_DOCUMENT" | "EXACT_PAYEE_AMOUNT_DATE" | "REFERENCE_NUMBER";
}

const PENDING_EMAIL_STATEMENT_KEY = "engoryx_pending_email_statement_review_v1";
const PENDING_EMAIL_EXPENSE_KEY = "engoryx_pending_email_expense_review_v1";

function financeText(message: GmailMessageCandidate | GmailImportedMessage) {
  return `${message.sender || ""}\n${message.subject || ""}\n${("snippet" in message ? message.snippet : "") || ""}\n${message.bodyText || ""}`.toLowerCase();
}

function attachmentNameText(message: GmailMessageCandidate | GmailImportedMessage) {
  return (message.attachments || []).map((attachment) => (attachment.filename || "").toLowerCase()).join(" ");
}

export function isSupportedBankStatementAttachment(attachment: Pick<GmailAttachmentSummary, "filename" | "mimeType">) {
  const filename = String(attachment.filename || "").toLowerCase();
  const mimeType = String(attachment.mimeType || "").toLowerCase();
  return /\.(csv|xlsx|xls|xlsm|pdf)$/i.test(filename)
    || mimeType === "application/pdf"
    || mimeType === "text/csv"
    || mimeType === "application/vnd.ms-excel"
    || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    || mimeType === "application/vnd.ms-excel.sheet.macroenabled.12";
}

export function isSupportedExpenseAttachment(attachment: Pick<GmailAttachmentSummary, "filename" | "mimeType">) {
  const filename = String(attachment.filename || "").toLowerCase();
  const mimeType = String(attachment.mimeType || "").toLowerCase();
  return /\.(pdf|png|jpg|jpeg|webp)$/i.test(filename)
    || mimeType === "application/pdf"
    || mimeType.startsWith("image/");
}

function supportedStatementAttachmentIds(message: GmailMessageCandidate) {
  return (message.attachments || []).filter(isSupportedBankStatementAttachment).map((attachment) => attachment.attachmentId);
}

function supportedExpenseAttachmentIds(message: GmailMessageCandidate) {
  return (message.attachments || []).filter(isSupportedExpenseAttachment).map((attachment) => attachment.attachmentId);
}

export function matchEmailIntakeProfiles(
  message: GmailMessageCandidate | GmailImportedMessage,
  profiles?: EmailIntakeProfile[]
): EmailIntakeProfile[] {
  const enabledProfiles = (profiles || []).filter((p) => p.enabled !== false);
  if (!enabledProfiles.length) return [];

  const parsed = parseSenderAddress(message.sender || "");
  const subjectLower = (message.subject || "").toLowerCase();
  const statementIds = supportedStatementAttachmentIds(message as GmailMessageCandidate);
  const expenseIds = supportedExpenseAttachmentIds(message as GmailMessageCandidate);

  const exactMatches: EmailIntakeProfile[] = [];
  const domainMatches: EmailIntakeProfile[] = [];

  for (const profile of enabledProfiles) {
    const normEmail = profile.senderEmail ? normalizeEmail(profile.senderEmail) : "";
    const normDomain = profile.senderDomain ? normalizeDomain(profile.senderDomain) : "";

    let matchStrength: "EXACT" | "DOMAIN" | null = null;
    if (normEmail) {
      if (parsed.email && normEmail === parsed.email) matchStrength = "EXACT";
    } else if (normDomain && parsed.domain && (parsed.domain === normDomain || parsed.domain.endsWith(`.${normDomain}`))) {
      matchStrength = "DOMAIN";
    }

    if (!matchStrength) continue;

    if (profile.subjectContains && profile.subjectContains.trim()) {
      const needle = profile.subjectContains.trim().toLowerCase();
      if (!subjectLower.includes(needle)) continue;
    }

    if (profile.attachmentCondition && profile.attachmentCondition.trim()) {
      const cond = profile.attachmentCondition.trim().toUpperCase();
      if (cond === "SPREADSHEET" || cond === "CSV_OR_XLSX") {
        const hasSpreadsheet = (message.attachments || []).some((a) => {
          const fn = (a.filename || "").toLowerCase();
          const mt = (a.mimeType || "").toLowerCase();
          return /\.(csv|xlsx|xls|xlsm)$/i.test(fn)
            || mt === "text/csv"
            || mt === "application/vnd.ms-excel"
            || mt === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            || mt === "application/vnd.ms-excel.sheet.macroenabled.12";
        });
        if (!hasSpreadsheet) continue;
      } else if (cond === "STATEMENT") {
        if (statementIds.length === 0) continue;
      } else if (cond === "CSV") {
        const hasCsv = (message.attachments || []).some((a) => (a.filename || "").toLowerCase().endsWith(".csv") || a.mimeType === "text/csv");
        if (!hasCsv) continue;
      } else if (cond === "XLSX" || cond === "XLS") {
        const hasXlsx = (message.attachments || []).some((a) => /\.(xlsx|xls|xlsm)$/i.test(a.filename || ""));
        if (!hasXlsx) continue;
      } else if (cond === "PDF") {
        const hasPdf = (message.attachments || []).some((a) => (a.filename || "").toLowerCase().endsWith(".pdf") || a.mimeType === "application/pdf");
        if (!hasPdf) continue;
      } else if (cond === "IMAGE" || cond === "RECEIPT") {
        if (expenseIds.length === 0) continue;
      } else {
        const patternLower = profile.attachmentCondition.trim().toLowerCase();
        const match = (message.attachments || []).some((a) => (a.filename || "").toLowerCase().includes(patternLower));
        if (!match) continue;
      }
    }

    if (matchStrength === "EXACT") exactMatches.push(profile);
    else domainMatches.push(profile);
  }

  return exactMatches.length > 0 ? exactMatches : domainMatches;
}

/**
 * Deterministic first-pass classifier shared by initial scan and incremental
 * sync. Integrates saved sender profiles and routes supported bank statements,
 * invoices, and expense receipts/bills to their review workflows while
 * preserving advisory non-mutating status.
 */
export function classifyEmailIntakeCandidate(
  message: GmailMessageCandidate,
  profiles?: EmailIntakeProfile[]
): EmailIntakeClassification {
  const text = financeText(message);
  const names = attachmentNameText(message);
  const statementIds = supportedStatementAttachmentIds(message);
  const expenseIds = supportedExpenseAttachmentIds(message);
  const hasSupportedStatement = statementIds.length > 0;
  const hasSupportedExpenseAttachment = expenseIds.length > 0;

  const strongBankStatementSignal = /\b(bank statement|transaction statement|e[- ]?statement|monthly statement)\b/i.test(text)
    || (/\b(statement|transactions?|account)\b/i.test(text) && /\b(bank|checking|savings|deposit|ledger|balance)\b/i.test(text));
  const spreadsheetStatementName = /\b(statement|transactions?|account|ledger)\b/i.test(names);
  const detectedBankStatement = hasSupportedStatement && (strongBankStatementSignal || spreadsheetStatementName);

  const strongReceiptSignal = /\b(official receipt|payment receipt|purchase receipt|reimbursement receipt|sales receipt|cash receipt|acknowledgement receipt|acknowledgment receipt|e[- ]?receipt|order receipt|charge slip|petty cash|expense report|expense claim)\b/i.test(text)
    || /\b(official[-_ ]?receipt|payment[-_ ]?receipt|purchase[-_ ]?receipt|e[-_ ]?receipt|receipt[-_ ]?[0-9]|or[-_ ]?[0-9])\b/i.test(names);

  const generalReceiptSignal = (/\b(receipt|resibo|ticket|fare|petron|shell|caltex|seaoil|grab|uber|taxi|restaurant|jollibee|mcdonalds|hardware)\b/i.test(text)
    || /\breceipt\b/i.test(names)) && !/\b(sales invoice|service invoice|vat invoice|tax invoice)\b/i.test(text);

  const invoiceSignal = /\b(invoice|sales invoice|service invoice|vat invoice|tax invoice|billing|bill\s*(?:no|number|#)|amount due|credit note)\b/i.test(text)
    || /\binvoice\b/i.test(names);

  const detectedExpense = (strongReceiptSignal || generalReceiptSignal) && hasSupportedExpenseAttachment && !invoiceSignal;
  const detectedInvoice = Boolean(invoiceSignal);

  // Evaluate matching profiles
  const matchingProfiles = matchEmailIntakeProfiles(message, profiles);

  if (matchingProfiles.length > 0) {
    const distinctDestinations = Array.from(new Set(matchingProfiles.map((p) => p.suggestedDestination)));

    if (distinctDestinations.length > 1) {
      return {
        isInvoiceLike: false,
        documentType: "OTHER",
        confidence: 65,
        reason: `Multiple matching sender rules conflict on suggested destinations (${distinctDestinations.join(", ")}). Review required.`,
        conflictReason: `Multiple matching sender rules conflict on suggested destinations (${distinctDestinations.join(", ")}).`,
        suggestedDestination: "UNSUPPORTED",
        statementAttachmentIds: statementIds,
        expenseAttachmentIds: expenseIds,
      };
    }

    const ruleDest = distinctDestinations[0];
    const primaryRule = matchingProfiles[0];

    // Check for conflict with strong document evidence
    if (ruleDest !== "INVOICE" && detectedInvoice && /\b(sales invoice|service invoice|vat invoice|tax invoice)\b/i.test(text)) {
      return {
        isInvoiceLike: true,
        documentType: "INVOICE",
        confidence: 70,
        reason: `Saved sender rule (${ruleDest}) conflicts with invoice language found in document. Review required.`,
        conflictReason: `Saved sender rule (${ruleDest}) conflicts with explicit invoice document signals.`,
        suggestedDestination: "UNSUPPORTED",
        matchedProfileId: primaryRule.id,
        matchedProfileName: primaryRule.name,
        statementAttachmentIds: statementIds,
        expenseAttachmentIds: expenseIds,
      };
    }

    if (ruleDest !== "BANK_STATEMENT" && detectedBankStatement && strongBankStatementSignal) {
      return {
        isInvoiceLike: false,
        documentType: "STATEMENT",
        confidence: 70,
        reason: `Saved sender rule (${ruleDest}) conflicts with bank statement document signals. Review required.`,
        conflictReason: `Saved sender rule (${ruleDest}) conflicts with bank statement document signals.`,
        suggestedDestination: "UNSUPPORTED",
        matchedProfileId: primaryRule.id,
        matchedProfileName: primaryRule.name,
        statementAttachmentIds: statementIds,
        expenseAttachmentIds: expenseIds,
      };
    }

    if (ruleDest !== "EXPENSE" && detectedExpense && strongReceiptSignal) {
      return {
        isInvoiceLike: false,
        documentType: "RECEIPT",
        confidence: 70,
        reason: `Saved sender rule (${ruleDest}) conflicts with receipt document signals. Review required.`,
        conflictReason: `Saved sender rule (${ruleDest}) conflicts with explicit receipt document signals.`,
        suggestedDestination: "UNSUPPORTED",
        matchedProfileId: primaryRule.id,
        matchedProfileName: primaryRule.name,
        statementAttachmentIds: statementIds,
        expenseAttachmentIds: expenseIds,
      };
    }

    // Agreement between rule and document signals
    if (
      (ruleDest === "INVOICE" && detectedInvoice) ||
      (ruleDest === "BANK_STATEMENT" && detectedBankStatement) ||
      (ruleDest === "EXPENSE" && detectedExpense)
    ) {
      return {
        isInvoiceLike: ruleDest === "INVOICE",
        documentType: ruleDest === "BANK_STATEMENT" ? "STATEMENT" : ruleDest === "EXPENSE" ? "RECEIPT" : "INVOICE",
        confidence: 96,
        reason: `Saved sender rule (${primaryRule.name}) and ${ruleDest.toLowerCase()} signals agree.`,
        suggestedDestination: ruleDest,
        matchedProfileId: primaryRule.id,
        matchedProfileName: primaryRule.name,
        statementAttachmentIds: statementIds,
        expenseAttachmentIds: expenseIds,
      };
    }

    // Rule matches, generic document was ambiguous/unsupported
    return {
      isInvoiceLike: ruleDest === "INVOICE",
      documentType: ruleDest === "BANK_STATEMENT" ? "STATEMENT" : ruleDest === "EXPENSE" ? "RECEIPT" : "INVOICE",
      confidence: 86,
      reason: `Matched saved sender rule: ${primaryRule.name}.`,
      suggestedDestination: ruleDest,
      matchedProfileId: primaryRule.id,
      matchedProfileName: primaryRule.name,
      statementAttachmentIds: statementIds,
      expenseAttachmentIds: expenseIds,
    };
  }

  // Generic deterministic classification when no profile matches
  if (detectedBankStatement) {
    return {
      isInvoiceLike: false,
      documentType: "STATEMENT",
      confidence: strongBankStatementSignal ? 94 : 84,
      reason: strongBankStatementSignal
        ? "Mailbox text identifies a bank/transaction statement and a supported PDF/CSV/XLSX attachment is available."
        : "A supported attachment is named like an account or transaction statement.",
      suggestedDestination: "BANK_STATEMENT",
      statementAttachmentIds: statementIds,
    };
  }

  if (detectedExpense) {
    return {
      isInvoiceLike: false,
      documentType: "RECEIPT",
      confidence: strongReceiptSignal ? 93 : 82,
      reason: strongReceiptSignal
        ? "Receipt or proof of payment was identified. Keep the reviewable expense draft workflow."
        : "Expense or receipt signals were found. Human review is required before creating an expense draft.",
      suggestedDestination: "EXPENSE",
      expenseAttachmentIds: expenseIds,
    };
  }

  if (detectedInvoice) {
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
      : "No supported invoice, bank-statement, or expense receipt routing signal was found.",
    suggestedDestination: "UNSUPPORTED",
    statementAttachmentIds: statementIds,
    expenseAttachmentIds: expenseIds,
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
  return `${range} {subject:invoice subject:"sales invoice" subject:"service invoice" subject:"VAT invoice" subject:billing subject:SOA "statement of account" "credit note" "tax invoice" BIR VAT TIN "amount due" "bank statement" "account statement" "transaction statement" "e-statement" "monthly statement" subject:receipt subject:"official receipt" subject:"payment receipt" subject:expense subject:bill subject:"purchase receipt" subject:"e-receipt" "official receipt" "sales receipt" "payment receipt" "acknowledgement receipt" "charge slip" filename:pdf filename:png filename:jpg filename:jpeg filename:webp filename:csv filename:xlsx filename:xls filename:xlsm}`;
}

export function buildSenderProfileQueries(profiles: EmailIntakeProfile[], window: GmailScanWindow): string[] {
  const enabled = (profiles || []).filter((p) => p.enabled !== false);
  const terms: string[] = [];

  for (const profile of enabled) {
    if (profile.senderEmail && profile.senderEmail.trim()) {
      terms.push(`from:${normalizeEmail(profile.senderEmail)}`);
    } else if (profile.senderDomain && profile.senderDomain.trim()) {
      terms.push(`from:${normalizeDomain(profile.senderDomain)}`);
    }
  }

  const uniqueTerms = Array.from(new Set(terms));
  if (!uniqueTerms.length) return [];

  const range = gmailRangeQuery(window);
  const queries: string[] = [];

  for (let i = 0; i < uniqueTerms.length; i += MAX_SENDER_CHUNK_SIZE) {
    const chunk = uniqueTerms.slice(i, i + MAX_SENDER_CHUNK_SIZE);
    const senderClause = chunk.length === 1 ? chunk[0] : `(${chunk.join(" OR ")})`;
    queries.push(`${range} ${senderClause} {filename:pdf filename:png filename:jpg filename:jpeg filename:webp filename:csv filename:xlsx filename:xls filename:xlsm}`);
  }

  return queries;
}

export async function classifyAmbiguousCandidatesWithAi(
  candidates: GmailMessageCandidate[]
): Promise<Map<string, EmailIntakeClassification>> {
  const results = new Map<string, EmailIntakeClassification>();
  if (!candidates.length) return results;

  for (let i = 0; i < candidates.length; i += MAX_AI_BATCH_SIZE) {
    const batch = candidates.slice(i, i + MAX_AI_BATCH_SIZE);
    const items = batch.map((msg) => ({
      messageId: msg.id,
      sender: msg.sender,
      subject: msg.subject,
      snippet: msg.snippet || (msg.bodyText ? msg.bodyText.slice(0, 300) : ""),
      attachmentNames: (msg.attachments || []).map((a) => a.filename),
    }));

    try {
      const data = await companyApiRequest("/api/classify-email-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, model: "gemini-3.5-flash-lite" }),
        companyId: requireActiveCompanyId(),
      });
      const res = await data.json().catch(() => ({}));
      if (data.ok && res.success && Array.isArray(res.data?.classifications)) {
        for (const item of res.data.classifications) {
          const msgId = String(item.messageId || "").trim();
          const targetCandidate = batch.find((c) => c.id === msgId);
          if (!targetCandidate) continue;

          const dest = (item.suggestedDestination || "UNSUPPORTED") as EmailIntakeDestination;
          const conf = Math.max(0, Math.min(100, Number(item.confidence) || 60));
          const reasonText = item.reason || (dest === "UNSUPPORTED" ? "Ambiguous email metadata classified by AI." : `Classified as ${dest} by AI.`);

          results.set(msgId, {
            isInvoiceLike: dest === "INVOICE",
            documentType: dest === "BANK_STATEMENT" ? "STATEMENT" : dest === "EXPENSE" ? "RECEIPT" : dest === "INVOICE" ? "INVOICE" : "OTHER",
            confidence: conf,
            reason: `Ambiguous metadata classified by AI (${reasonText})`,
            suggestedDestination: conf >= 65 ? dest : "UNSUPPORTED",
            statementAttachmentIds: supportedStatementAttachmentIds(targetCandidate),
            expenseAttachmentIds: supportedExpenseAttachmentIds(targetCandidate),
          });
        }
      }
    } catch {
      // Safe error recovery: unclassified candidates remain unsupported
    }
  }

  return results;
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
    return undefined;
  }
}

export async function scanConnectedMailbox(
  window: GmailScanWindow,
  preloadedProfiles?: EmailIntakeProfile[]
): Promise<EmailIntakeScanResult> {
  let profiles = preloadedProfiles;
  if (!profiles) {
    try {
      profiles = await listEmailIntakeProfiles();
    } catch {
      profiles = [];
    }
  }

  const queries = [
    connectedMailboxFinanceQuery(window),
    ...buildSenderProfileQueries(profiles, window),
  ];

  const candidateMap = new Map<string, GmailMessageCandidate>();
  let lastHistoryId: string | undefined;
  let emailAddress: string | undefined;

  for (const query of queries) {
    try {
      const data = await gmailApiRequest("/api/gmail/scan", { query, maxResults: MAX_SCAN_RESULTS_PER_REQUEST });
      if (data.historyId) lastHistoryId = data.historyId;
      if (data.emailAddress) emailAddress = data.emailAddress;
      for (const msg of data.messages || []) {
        if (!candidateMap.has(msg.id)) {
          candidateMap.set(msg.id, msg);
        }
      }
      if (candidateMap.size >= MAX_DISCOVERED_MESSAGES) break;
    } catch (error) {
      if (queries.indexOf(query) === 0) throw error;
    }
  }

  const rawMessages = Array.from(candidateMap.values()).slice(0, MAX_DISCOVERED_MESSAGES);

  // Deterministic-first classification pass
  const classifiedMessages: GmailMessageCandidate[] = rawMessages.map((msg) => ({
    ...msg,
    classification: classifyEmailIntakeCandidate(msg, profiles),
    importStatus: "READY" as const,
  }));

  // Identify ambiguous candidates that need AI classification
  const ambiguous = classifiedMessages.filter((msg) => {
    const cls = msg.classification as EmailIntakeClassification;
    return cls.suggestedDestination === "UNSUPPORTED" && cls.confidence <= 70 && !cls.conflictReason;
  });

  if (ambiguous.length > 0) {
    const aiResults = await classifyAmbiguousCandidatesWithAi(ambiguous);
    for (const msg of classifiedMessages) {
      if (aiResults.has(msg.id)) {
        msg.classification = aiResults.get(msg.id);
      }
    }
  }

  return {
    messages: classifiedMessages,
    historyId: lastHistoryId,
    emailAddress,
    lastSyncedAt: await persistSyncState(lastHistoryId, emailAddress),
  };
}

export async function syncConnectedMailbox(
  startHistoryId: string,
  preloadedProfiles?: EmailIntakeProfile[]
): Promise<EmailIntakeScanResult> {
  let profiles = preloadedProfiles;
  if (!profiles) {
    try {
      profiles = await listEmailIntakeProfiles();
    } catch {
      profiles = [];
    }
  }

  try {
    const data = await gmailApiRequest("/api/gmail/history", { startHistoryId });
    const rawMessages: GmailMessageCandidate[] = data.messages || [];

    const classifiedMessages: GmailMessageCandidate[] = rawMessages.map((msg) => ({
      ...msg,
      classification: classifyEmailIntakeCandidate(msg, profiles),
      importStatus: "READY" as const,
    }));

    const ambiguous = classifiedMessages.filter((msg) => {
      const cls = msg.classification as EmailIntakeClassification;
      return cls.suggestedDestination === "UNSUPPORTED" && cls.confidence <= 70 && !cls.conflictReason;
    });

    if (ambiguous.length > 0) {
      const aiResults = await classifyAmbiguousCandidatesWithAi(ambiguous);
      for (const msg of classifiedMessages) {
        if (aiResults.has(msg.id)) {
          msg.classification = aiResults.get(msg.id);
        }
      }
    }

    return {
      messages: classifiedMessages,
      historyId: data.historyId,
      emailAddress: data.emailAddress,
      lastSyncedAt: await persistSyncState(data.historyId, data.emailAddress),
    };
  } catch (error) {
    if ((error as Error & { code?: string })?.code === "HISTORY_EXPIRED") {
      return scanConnectedMailbox({ days: 30 }, profiles);
    }
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

export interface PrepareStatementReviewOptions {
  confirmedAccountId?: string;
  preliminaryResolution?: EntityResolutionResult;
  profile?: EmailIntakeProfile;
}

export async function prepareGmailStatementReview(
  message: GmailMessageCandidate,
  requestedAttachmentId?: string,
  options?: PrepareStatementReviewOptions,
): Promise<PendingEmailStatementReview> {
  const classification = (message.classification || classifyEmailIntakeCandidate(message)) as EmailIntakeClassification;
  const imported = await gmailApiRequest("/api/gmail/import", { messageId: message.id }) as GmailImportedMessage;
  const supported = imported.attachments.filter(isSupportedBankStatementAttachment);
  const attachment = requestedAttachmentId
    ? supported.find((item) => item.attachmentId === requestedAttachmentId)
    : supported[0];
  if (!attachment) {
    if (!imported.attachments || imported.attachments.length === 0) {
      throw new Error("This email appears to be a statement notification, but no statement file is attached.");
    }
    throw new Error("No supported bank statement attachment (PDF, CSV, XLS, XLSX, XLSM) was found in this email.");
  }

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
    confirmedAccountId: options?.confirmedAccountId,
    preliminaryResolution: options?.preliminaryResolution,
    matchedProfileId: options?.profile?.id || classification.matchedProfileId,
    matchedProfileName: options?.profile?.name || classification.matchedProfileName,
    linkedProfileAccountId: options?.profile?.linkedFinancialAccountId,
  };
  savePendingEmailStatementReview(pending);
  return pending;
}

export function readPendingEmailExpenseReview(): PendingEmailExpenseReview | null {
  const storage = sessionStorageSafe();
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(PENDING_EMAIL_EXPENSE_KEY) || "null");
    if (!parsed?.id || !parsed?.sourceDocumentId || !parsed?.suggestedExpense) return null;
    return parsed as PendingEmailExpenseReview;
  } catch { return null; }
}

export function clearPendingEmailExpenseReview() {
  sessionStorageSafe()?.removeItem(PENDING_EMAIL_EXPENSE_KEY);
}

export function savePendingEmailExpenseReview(value: PendingEmailExpenseReview) {
  const storage = sessionStorageSafe();
  if (!storage) throw new Error("This browser cannot stage the expense review safely.");
  storage.setItem(PENDING_EMAIL_EXPENSE_KEY, JSON.stringify(value));
}

function cleanPayeeName(sender: string, subject: string, bodyText: string): string {
  const match = sender.match(/^"?([^"<@]+)"?\s*<[^>]+>$/);
  if (match && match[1]?.trim()) {
    const name = match[1].trim();
    if (!/@/.test(name) && name.length > 1) return name;
  }
  const fromSubject = subject.match(/(?:from|at|by)\s+([A-Z0-9][A-Za-z0-9\s&.,'-]+?)(?:\s*(?:#|via|\bon\b|-|$))/i);
  if (fromSubject && fromSubject[1]?.trim()) {
    return fromSubject[1].trim();
  }
  const emailMatch = sender.match(/<?([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/);
  if (emailMatch && emailMatch[2]) {
    const domain = emailMatch[2].replace(/\.(com|ph|com\.ph|org|net|io)$/i, "");
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }
  return sender.trim() || "";
}

function extractDate(text: string, fallbackDate: string): string {
  const isoMatch = text.match(/\b(20\d{2}[-/](?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01]))\b/);
  if (isoMatch && isoMatch[1]) return isoMatch[1].replaceAll("/", "-");

  const slashMatch = text.match(/\b([0-3]?\d)\/([0-1]?\d)\/(20\d{2})\b/);
  if (slashMatch && slashMatch[1] && slashMatch[2] && slashMatch[3]) {
    const month = slashMatch[1].padStart(2, "0");
    const day = slashMatch[2].padStart(2, "0");
    return `${slashMatch[3]}-${month}-${day}`;
  }

  const namedMatch = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+([0-3]?\d),?\s+(20\d{2})\b/i);
  if (namedMatch && namedMatch[1] && namedMatch[2] && namedMatch[3]) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthIndex = months.findIndex((m) => namedMatch[1]!.toLowerCase().startsWith(m));
    if (monthIndex >= 0) {
      const monthStr = String(monthIndex + 1).padStart(2, "0");
      const dayStr = namedMatch[2].padStart(2, "0");
      return `${namedMatch[3]}-${monthStr}-${dayStr}`;
    }
  }

  return fallbackDate.slice(0, 10) || new Date().toISOString().slice(0, 10);
}

function extractAmountAndCurrency(text: string): { amount: number; currency: string } {
  let currency = "PHP";
  if (/\bUSD\b|\$/i.test(text) && !/PHP|₱/i.test(text)) currency = "USD";
  else if (/\bEUR\b|€/i.test(text)) currency = "EUR";
  else if (/\bSGD\b/i.test(text)) currency = "SGD";
  else if (/\bJPY\b|¥/i.test(text)) currency = "JPY";

  const patterns = [
    /(?:total\s+amount|grand\s+total|amount\s+paid|total\s+paid|total\s+due|net\s+amount|amount)\s*[:=]?\s*(?:PHP|₱|USD|\$|EUR|€|SGD)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2}))/i,
    /(?:PHP|₱|USD|\$|EUR|€|SGD)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2}))/i,
    /(?:paid|charge|amount)\s*[:=]?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2}))/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const raw = match[1].replaceAll(",", "");
      const val = parseFloat(raw);
      if (Number.isFinite(val) && val > 0) return { amount: val, currency };
    }
  }

  return { amount: 0, currency };
}

function extractCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(fuel|gasoline|diesel|petrol|shell|petron|caltex|seaoil|phoenix|unioil|gas station)\b/i.test(lower)) return "Fuel";
  if (/\b(grab|uber|taxi|fare|transport|toll|easytrip|autosweep|flight|cebu pacific|airasia|ticket|parking)\b/i.test(lower)) return "Transportation";
  if (/\b(jollibee|mcdonalds|starbucks|restaurant|food|lunch|dinner|breakfast|cafe|catering|meals)\b/i.test(lower)) return "Meals";
  if (/\b(cement|sand|gravel|lumber|steel|rebar|pipes|hardware|wilcon|ace hardware|citi hardware|paint|plywood|materials)\b/i.test(lower)) return "Materials";
  if (/\b(generator|backhoe|crane|rental|equipment rental|heavy equipment)\b/i.test(lower)) return "Equipment Rental";
  if (/\b(tools|machinery|equipment)\b/i.test(lower)) return "Equipment";
  if (/\b(meralco|electricity|electric|water|maynilad|manila water|utility|power)\b/i.test(lower)) return "Utilities";
  if (/\b(pldt|globe|smart|dito|converge|telecom|internet|mobile|broadband|communication)\b/i.test(lower)) return "Communication";
  if (/\b(office supplies|site supplies|stationery|paper|ink|printing|supplies)\b/i.test(lower)) return "Office / Site Supplies";
  if (/\b(bir|lgu|permit|barangay clearance|mayor's permit|licenses)\b/i.test(lower)) return "Permits";
  if (/\b(legal|notary|professional fee|consulting|audit|architectural)\b/i.test(lower)) return "Professional Fees";
  if (/\b(subcontractor|sub-con|installation service|labor contract)\b/i.test(lower)) return "Subcontractor";
  return "Miscellaneous";
}

function extractPaymentMethod(text: string): string | undefined {
  if (/\bgcash\b/i.test(text)) return "GCash";
  if (/\b(?:maya|paymaya)\b/i.test(text)) return "Maya";
  if (/\bcredit\s*card\b/i.test(text)) return "Credit Card";
  if (/\bdebit\s*card\b/i.test(text)) return "Debit Card";
  if (/\bcash\b/i.test(text)) return "Cash";
  if (/\bbank\s*transfer\b/i.test(text)) return "Bank Transfer";
  if (/\b(?:cheque|check)\b/i.test(text)) return "Check";
  return undefined;
}

function extractReferenceNumber(text: string): string | undefined {
  const patterns = [
    /\b(?:official\s*receipt|OR)\s*(?:#|no|number)?\s*[:#=]\s*([A-Za-z0-9-]+)\b/i,
    /\b(?:official\s*receipt|OR)\s*#\s*([A-Za-z0-9-]+)\b/i,
    /\breceipt\s*(?:#|no|number)\s*[:#=]?\s*([A-Za-z0-9-]+)\b/i,
    /\bref(?:erence)?\s*(?:#|no|number)?\s*[:#=]\s*([A-Za-z0-9-]+)\b/i,
    /\bref(?:erence)?\s*#\s*([A-Za-z0-9-]+)\b/i,
    /\btrans(?:action)?\s*(?:id|#|no|number)\s*[:#=]?\s*([A-Za-z0-9-]+)\b/i,
    /\border\s*(?:id|#|no|number)\s*[:#=]?\s*([A-Za-z0-9-]+)\b/i,
    /\b(?:OR|Ref|Txn|Receipt)-[0-9A-Za-z-]+\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = match ? (match[1] || match[0]) : undefined;
    if (candidate && candidate.length >= 3 && !candidate.includes("@")) {
      return candidate.trim();
    }
  }
  return undefined;
}

export function extractSuggestedExpense(
  message: GmailMessageCandidate | GmailImportedMessage,
  attachment?: Pick<GmailAttachmentSummary, "filename">
): SuggestedExpenseFields {
  const fullText = `${message.subject || ""}\n${message.sender || ""}\n${("snippet" in message ? message.snippet : "") || ""}\n${message.bodyText || ""}\n${attachment?.filename || ""}`;
  const payee = cleanPayeeName(message.sender || "", message.subject || "", message.bodyText || "");
  const expenseDate = extractDate(fullText, message.receivedAt || new Date().toISOString());
  const { amount, currency } = extractAmountAndCurrency(fullText);
  const category = extractCategory(fullText);
  const paymentMethod = extractPaymentMethod(fullText);
  const referenceNumber = extractReferenceNumber(fullText);
  const subjectClean = (message.subject || "").trim();
  const description = subjectClean || (payee ? `${category} expense - ${payee}` : `${category} expense`);

  const projectCodeMatch = fullText.match(/\b(PRJ-[A-Za-z0-9-]+)\b/i);
  const projectId = projectCodeMatch ? projectCodeMatch[1] : undefined;

  return {
    expenseDate,
    category,
    description,
    payee: payee || undefined,
    amount,
    currency,
    paymentMethod,
    referenceNumber,
    projectId,
    notes: `Staged from Email Intake: ${message.subject || "Email Receipt"}${message.sender ? ` from ${message.sender}` : ""}`,
  };
}

export function findPossibleExpenseDuplicates(
  candidate: { payee?: string; amount?: number; currency?: string; expenseDate?: string; referenceNumber?: string; sourceDocumentId?: string },
  existingExpenses: Expense[]
): ExpenseDuplicateCandidate[] {
  const matches: ExpenseDuplicateCandidate[] = [];
  const candidateDate = candidate.expenseDate?.slice(0, 10);
  const candidateRef = candidate.referenceNumber?.trim().toLowerCase();
  const candidatePayee = candidate.payee?.trim().toLowerCase();
  const candidateAmount = candidate.amount ? Number(candidate.amount) : 0;

  for (const exp of existingExpenses) {
    if (exp.status === "VOID") continue;

    if (candidate.sourceDocumentId && exp.receiptSourceDocumentId === candidate.sourceDocumentId) {
      matches.push({
        expense: exp,
        matchType: "SOURCE_DOCUMENT",
        reason: `Expense #${exp.id.slice(0, 8)} is already linked to this preserved email receipt source.`,
      });
      continue;
    }

    if (candidateRef && exp.referenceNumber && exp.referenceNumber.trim().toLowerCase() === candidateRef) {
      matches.push({
        expense: exp,
        matchType: "REFERENCE_NUMBER",
        reason: `Expense #${exp.id.slice(0, 8)} has the same reference/receipt number (${exp.referenceNumber}).`,
      });
      continue;
    }

    if (
      candidatePayee &&
      exp.payee &&
      exp.payee.trim().toLowerCase() === candidatePayee &&
      candidateAmount > 0 &&
      Math.abs(exp.amount - candidateAmount) < 0.001 &&
      candidateDate &&
      exp.expenseDate.slice(0, 10) === candidateDate
    ) {
      matches.push({
        expense: exp,
        matchType: "EXACT_PAYEE_AMOUNT_DATE",
        reason: `Expense #${exp.id.slice(0, 8)} has matching payee (${exp.payee}), amount (${exp.amount}), and date (${exp.expenseDate}).`,
      });
    }
  }

  return matches;
}

export interface PrepareExpenseReviewOptions {
  confirmedVendorId?: string;
  preliminaryResolution?: EntityResolutionResult;
  profile?: EmailIntakeProfile;
}

export async function prepareGmailExpenseReview(
  message: GmailMessageCandidate,
  requestedAttachmentId?: string,
  options?: PrepareExpenseReviewOptions,
): Promise<PendingEmailExpenseReview> {
  const classification = (message.classification || classifyEmailIntakeCandidate(message)) as EmailIntakeClassification;
  const imported = await gmailApiRequest("/api/gmail/import", { messageId: message.id }) as GmailImportedMessage;
  const supported = imported.attachments.filter(isSupportedExpenseAttachment);
  const attachment = requestedAttachmentId
    ? supported.find((item) => item.attachmentId === requestedAttachmentId)
    : supported[0];
  if (!attachment) throw new Error("No supported PDF/image expense receipt attachment was found in this email.");

  const stored = await saveGmailMessageSource(imported);
  await markEmailClassification(stored.email.id, classification);

  const sourceDocument = stored.documents.find((document) => document.gmailAttachmentId === attachment.attachmentId)
    || stored.documents.find((document) => document.gmailPartId && document.gmailPartId === attachment.partId)
    || stored.documents.find((document) => document.attachmentIndex === attachment.attachmentIndex);

  if (!sourceDocument) throw new Error("The selected expense attachment could not be linked to its preserved source document.");

  const suggested = extractSuggestedExpense(imported, attachment);
  suggested.receiptSourceDocumentId = sourceDocument.id;

  const pending: PendingEmailExpenseReview = {
    id: crypto.randomUUID(),
    sourceDocumentId: sourceDocument.id,
    emailMessageId: stored.email.id,
    gmailMessageId: imported.id,
    gmailAttachmentId: attachment.attachmentId,
    fileName: attachment.filename,
    mimeType: attachment.mimeType,
    subject: imported.subject || message.subject || "Receipt / Expense",
    sender: imported.sender || message.sender || "",
    createdAt: new Date().toISOString(),
    suggestedExpense: suggested,
    confirmedVendorId: options?.confirmedVendorId,
    preliminaryResolution: options?.preliminaryResolution,
    matchedProfileId: options?.profile?.id || classification.matchedProfileId,
    matchedProfileName: options?.profile?.name || classification.matchedProfileName,
    linkedProfileVendorId: options?.profile?.linkedVendorId,
  };
  savePendingEmailExpenseReview(pending);
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

export async function loadPendingEmailExpenseFile(pending: PendingEmailExpenseReview): Promise<File> {
  if (!supabase) throw new Error("Sign in before reviewing a preserved email expense receipt.");
  const companyId = requireActiveCompanyId();
  const { data: row, error } = await supabase.from("source_documents")
    .select("id,filename,mime_type,storage_path,sha256")
    .eq("company_id", companyId)
    .eq("id", pending.sourceDocumentId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("The preserved expense receipt source is no longer available to this company.");
  const { data: blob, error: downloadError } = await supabase.storage.from("invoice-originals").download(row.storage_path);
  if (downloadError || !blob) throw downloadError || new Error("The preserved receipt file could not be downloaded.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const actualHash = await sha256(bytes);
  if (row.sha256 && actualHash !== row.sha256) throw new Error("The preserved receipt failed its source-integrity check.");
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
