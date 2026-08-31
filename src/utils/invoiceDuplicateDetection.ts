import type { InvoiceData } from "../types.ts";

export interface InvoiceDuplicateMatchResult {
  isDuplicate: boolean;
  duplicateOf?: InvoiceData;
  reasons: string[];
}

export interface SourcePayloadCriteria {
  sourceSha256?: string;
  sourceDocumentId?: string;
  gmailMessageId?: string;
  gmailAttachmentId?: string;
  fileName?: string;
}

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Checks whether an incoming source attachment / payload has already been processed into an Invoice.
 * Designed to short-circuit before expensive Gemini extraction calls.
 */
export function findExistingInvoiceForSourcePayload(
  criteria: SourcePayloadCriteria,
  existingInvoices: InvoiceData[]
): { isDuplicate: boolean; existingInvoice?: InvoiceData; reasons: string[] } {
  const { sourceSha256, sourceDocumentId, gmailMessageId, gmailAttachmentId } = criteria;
  if (!sourceSha256 && !sourceDocumentId && (!gmailMessageId || !gmailAttachmentId)) {
    return { isDuplicate: false, reasons: [] };
  }

  for (const candidate of existingInvoices) {
    const reasons: string[] = [];
    const candidateSha = candidate.sourceSha256 || candidate.sourceMetadata?.sourceSha256;
    const candidateDocId = candidate.sourceDocumentId || candidate.sourceMetadata?.sourceDocumentId;
    const candidateMsgId = candidate.sourceMetadata?.gmailMessageId || candidate.sourceEmailId;
    const candidateAttId = candidate.sourceMetadata?.gmailAttachmentId;

    if (sourceSha256 && candidateSha && sourceSha256 === candidateSha) {
      if (gmailMessageId && candidateMsgId && gmailMessageId !== candidateMsgId) {
        reasons.push(`Forwarded copy of identical attachment already processed as Invoice ${candidate.invoiceNumber || candidate.id} (SHA-256 match).`);
      } else {
        reasons.push(`Identical source file already processed as Invoice ${candidate.invoiceNumber || candidate.id} (SHA-256 match).`);
      }
      return { isDuplicate: true, existingInvoice: candidate, reasons };
    }

    if (sourceDocumentId && candidateDocId && sourceDocumentId === candidateDocId) {
      reasons.push(`Source document ID matches existing Invoice ${candidate.invoiceNumber || candidate.id}.`);
      return { isDuplicate: true, existingInvoice: candidate, reasons };
    }

    if (gmailMessageId && gmailAttachmentId && candidateMsgId === gmailMessageId && candidateAttId === gmailAttachmentId) {
      reasons.push(`Gmail message and attachment ID match existing Invoice ${candidate.invoiceNumber || candidate.id}.`);
      return { isDuplicate: true, existingInvoice: candidate, reasons };
    }
  }

  return { isDuplicate: false, reasons: [] };
}

/**
 * Evaluates duplicate evidence between a candidate invoice and existing invoices,
 * returning structured reasons explaining the match.
 */
export function evaluateInvoiceDuplicateEvidence(
  invoice: Partial<InvoiceData>,
  existingInvoices: InvoiceData[]
): InvoiceDuplicateMatchResult {
  const number = (invoice.invoiceNumber || "").trim().toLowerCase();
  const vendor = normalize(invoice.vendor?.registeredName || invoice.vendor?.companyName || invoice.vendor?.name || "");
  const taxId = normalize(invoice.vendor?.taxId || "");
  const sourceEmail = invoice.sourceMetadata?.gmailMessageId || invoice.sourceEmailId || "";
  const sourceAttachment = invoice.sourceMetadata?.gmailAttachmentId || "";
  const sourceSha = invoice.sourceSha256 || invoice.sourceMetadata?.sourceSha256;
  const sourceDocId = invoice.sourceDocumentId || invoice.sourceMetadata?.sourceDocumentId;
  const hasFinancialFingerprint = Boolean(vendor && invoice.invoiceDate && invoice.currency && Number(invoice.grandTotal) > 0);

  for (const candidate of existingInvoices) {
    if (invoice.id && candidate.id === invoice.id) continue;
    const reasons: string[] = [];

    const candidateVendor = normalize(candidate.vendor?.registeredName || candidate.vendor?.companyName || candidate.vendor?.name || "");
    const candidateTaxId = normalize(candidate.vendor?.taxId || "");
    const candidateSha = candidate.sourceSha256 || candidate.sourceMetadata?.sourceSha256;
    const candidateDocId = candidate.sourceDocumentId || candidate.sourceMetadata?.sourceDocumentId;
    const candidateMsgId = candidate.sourceMetadata?.gmailMessageId || candidate.sourceEmailId;
    const candidateAttId = candidate.sourceMetadata?.gmailAttachmentId;
    const candidateNumber = (candidate.invoiceNumber || "").trim().toLowerCase();

    const sameSha = Boolean(sourceSha && candidateSha && sourceSha === candidateSha);
    const sameSourceDoc = Boolean(sourceDocId && candidateDocId && sourceDocId === candidateDocId);
    const sameGmailAtt = Boolean(sourceEmail && sourceAttachment && candidateMsgId === sourceEmail && candidateAttId === sourceAttachment);

    if (sameSha) {
      if (sourceEmail && candidateMsgId && sourceEmail !== candidateMsgId) {
        reasons.push(`Forwarded copy of identical attachment already processed as Invoice ${candidate.invoiceNumber || candidate.id} (SHA-256 match).`);
      } else {
        reasons.push(`Identical file hash (SHA-256 match) with Invoice ${candidate.invoiceNumber || candidate.id}.`);
      }
    }
    if (sameSourceDoc) {
      reasons.push(`Same source document record as Invoice ${candidate.invoiceNumber || candidate.id}.`);
    }
    if (sameGmailAtt) {
      reasons.push(`Same Gmail message and attachment ID as Invoice ${candidate.invoiceNumber || candidate.id}.`);
    }

    const sameVendor = Boolean(vendor && candidateVendor === vendor && (!taxId || !candidateTaxId || candidateTaxId === taxId));
    const sameNumber = Boolean(number && candidateNumber && candidateNumber === number);
    const sameCurrency = Boolean(invoice.currency && candidate.currency && (candidate.currency || "").toUpperCase() === (invoice.currency || "").toUpperCase());
    const sameTotal = Math.abs((Number(candidate.grandTotal) || 0) - (Number(invoice.grandTotal) || 0)) <= 0.05;
    const sameDate = Boolean(invoice.invoiceDate && candidate.invoiceDate && candidate.invoiceDate === invoice.invoiceDate);

    if (sameNumber && sameVendor && sameCurrency && sameTotal) {
      reasons.push(`Same vendor (${invoice.vendor?.name || vendor}) and invoice number (${invoice.invoiceNumber}) with matching total.`);
    } else if (sameNumber && sameVendor) {
      reasons.push(`Same vendor (${invoice.vendor?.name || vendor}) and invoice number (${invoice.invoiceNumber}).`);
    }

    if (hasFinancialFingerprint && sameVendor && sameDate && sameCurrency && sameTotal) {
      reasons.push(`Matching financial fingerprint: vendor (${invoice.vendor?.name || vendor}), date (${invoice.invoiceDate}), and amount (${invoice.currency} ${invoice.grandTotal}).`);
    }

    if (reasons.length > 0) {
      return {
        isDuplicate: true,
        duplicateOf: candidate,
        reasons,
      };
    }
  }

  return {
    isDuplicate: false,
    reasons: [],
  };
}

export function findPossibleDuplicate(
  invoice: Partial<InvoiceData>,
  existingInvoices: InvoiceData[]
): { id: string; invoiceNumber?: string; reasons: string[] } | null {
  const result = evaluateInvoiceDuplicateEvidence(invoice, existingInvoices);
  if (result.isDuplicate && result.duplicateOf) {
    return {
      id: result.duplicateOf.id,
      invoiceNumber: result.duplicateOf.invoiceNumber,
      reasons: result.reasons,
    };
  }
  return null;
}

