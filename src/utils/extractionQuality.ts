import type { InvoiceData, LineItem } from "../types.ts";

const MONEY_TOLERANCE = 0.05;
const PH_VAT_RATE = 0.12;

export interface ExtractionAttemptSummary {
  attemptNumber: number;
  model: string;
  responseParsed: boolean;
  qualityScore?: number;
  completenessScore?: number;
  lineItemCount?: number;
  selected?: boolean;
  automatic?: boolean;
  reason?: string;
}

export interface ExtractionQuality {
  score: number;
  completeness: number;
  status: "GOOD" | "NEEDS_REVIEW";
  requiresRetry: boolean;
  reasons: string[];
  criticalMissing: string[];
  lineItemCount: number;
  populatedFieldCount: number;
  reconciliation: {
    lineItems: "PASS" | "REVIEW" | "NOT_APPLICABLE";
    subtotal: "PASS" | "REVIEW" | "NOT_APPLICABLE";
    grandTotal: "PASS" | "REVIEW" | "NOT_APPLICABLE";
    balance: "PASS" | "REVIEW" | "NOT_APPLICABLE";
    philippineVat: "PASS" | "REVIEW" | "NOT_APPLICABLE";
  };
  attemptCount?: number;
  fallbackUsed?: boolean;
  selectedAttempt?: number;
  attempts?: ExtractionAttemptSummary[];
}

export interface ScoredExtractionCandidate<T> {
  candidate: T;
  quality: ExtractionQuality;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function numeric(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function presentNumber(value: unknown) {
  return value !== undefined && value !== null && Number.isFinite(Number(value));
}

function nearlyEqual(left: number, right: number) {
  return Math.abs(roundMoney(left) - roundMoney(right)) <= MONEY_TOLERANCE;
}

function hasText(value: unknown) {
  return Boolean(String(value ?? "").trim());
}

function normalizedText(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

/** Normalize only explicit currency values/symbols; never use party location. */
export function normalizeCurrency(rawCurrency?: unknown, rawSymbol?: unknown) {
  const values = [rawCurrency, rawSymbol]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  for (const raw of values) {
    const value = normalizedText(raw).replace(/\s+/g, " ");
    if (/₱|\bPHP\b|PHILIPPINE PESO|PHILIPPINE PESOS/.test(value)) return "PHP";
    if (/^US?\$?$/.test(value) || value === "USD" || /US DOLLAR|US DOLLARS|UNITED STATES DOLLAR/.test(value)) return "USD";
    if (value === "$" || value === "US$") return "USD";
    if (value === "€" || value === "EUR" || /EURO/.test(value)) return "EUR";
    if (value === "S$" || value === "SGD" || /SINGAPORE DOLLAR/.test(value)) return "SGD";
    if (value === "¥" || value === "JPY" || /JAPANESE YEN/.test(value)) return "JPY";
    if (value === "£" || value === "GBP" || /POUND STERLING|BRITISH POUND/.test(value)) return "GBP";
    if (/^[A-Z]{3}$/.test(value)) return value;
  }
  return "";
}

function sourceHas(sourceText: string | undefined, pattern: RegExp) {
  return Boolean(sourceText && pattern.test(sourceText));
}

function invoiceLooksLikeItemizedDocument(invoice: Partial<InvoiceData>, sourceText?: string) {
  const documentType = normalizedText(invoice.documentType);
  const subtype = normalizedText(invoice.invoiceSubtype);
  const sourceShowsInvoice = sourceHas(sourceText, /\b(?:TAX\s+)?INVOICE\b|SALES\s+INVOICE|SERVICE\s+INVOICE/i);
  const invoiceLike = documentType.includes("INVOICE") || subtype.includes("INVOICE") || documentType === "TAX INVOICE" || sourceShowsInvoice;
  const tableHeaderCount = [
    /\b(?:ITEM|SKU|CODE|DESCRIPTION)\b/i,
    /\b(?:QTY|QUANTITY)\b/i,
    /\b(?:UNIT|UOM)\b/i,
    /\b(?:UNIT PRICE|PRICE)\b/i,
    /\b(?:AMOUNT|LINE TOTAL|TOTAL)\b/i,
  ].filter((pattern) => sourceHas(sourceText, pattern)).length;
  return { invoiceLike, tableEvidence: tableHeaderCount >= 2, sourceShowsInvoice };
}

function itemIsMeaningful(item: LineItem) {
  return hasText(item.description) && (numeric(item.quantity) > 0 || numeric(item.unitPrice) > 0 || numeric(item.total) > 0);
}

function lineItemReconciles(item: LineItem) {
  const expected = roundMoney(numeric(item.quantity) * numeric(item.unitPrice) - numeric(item.discount));
  return nearlyEqual(expected, numeric(item.total));
}

function sourceHasVatSummary(sourceText?: string) {
  return sourceHas(sourceText, /VAT(?:ABLE)?\s+SALES|VAT\s+AMOUNT|ZERO[- ]?RATED|VAT[- ]?EXEMPT|12\s*%/i);
}

function addReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

export function evaluateExtractionQuality(invoice: Partial<InvoiceData>, sourceText?: string): ExtractionQuality {
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const { invoiceLike, tableEvidence, sourceShowsInvoice } = invoiceLooksLikeItemizedDocument(invoice, sourceText);
  const sourceShowsCustomer = sourceHas(sourceText, /\b(?:BILL\s*TO|SOLD\s*TO|BUYER|CUSTOMER|CLIENT)\b/i);
  const sourceShowsCurrency = sourceHas(sourceText, /₱|\bPHP\b|PHILIPPINE\s+PESO|\bUSD\b|US\$|\bEUR\b|\bSGD\b|\bJPY\b|\bGBP\b|\$/i);
  const sourceShowsMoney = sourceHas(sourceText, /₱|\b(?:PHP|USD|EUR|SGD|JPY|GBP)\b|\d[\d,]*\.\d{2}/i);
  const phTax = invoice.philippineTaxDetails || {};
  const phVat = normalizedText(invoice.invoiceSubtype) === "VAT_INVOICE"
    || normalizedText(phTax.invoiceKind) === "VAT_INVOICE"
    || normalizedText(phTax.sellerRegistration) === "VAT"
    || normalizedText(invoice.vendor?.taxRegistration) === "VAT";
  const vatEvidence = phVat || sourceHasVatSummary(sourceText) || presentNumber(phTax.vatableSales) || presentNumber(phTax.vatAmount);

  const reasons: string[] = [];
  const criticalMissing: string[] = [];
  let score = 0;
  let expectedFields = 0;
  let populatedFields = 0;
  const reconciliation: ExtractionQuality["reconciliation"] = {
    lineItems: items.length ? "PASS" : "NOT_APPLICABLE",
    subtotal: "NOT_APPLICABLE",
    grandTotal: "NOT_APPLICABLE",
    balance: "NOT_APPLICABLE",
    philippineVat: "NOT_APPLICABLE",
  };

  const field = (value: unknown, weight: number, label: string, criticalId?: string) => {
    expectedFields += 1;
    if (hasText(value) || (typeof value === "number" && Number.isFinite(value) && value > 0)) {
      populatedFields += 1;
      score += weight;
      return true;
    }
    if (criticalId) {
      criticalMissing.push(criticalId);
      addReason(reasons, `${label} is missing.`);
    }
    return false;
  };

  if (invoiceLike) score += 5;
  if (!hasText(invoice.documentType) && sourceShowsInvoice) {
    criticalMissing.push("missing-document-type");
    score -= 6;
    addReason(reasons, "The source appears to be an invoice but the document type is missing.");
  }
  field(invoice.invoiceNumber, 12, "Invoice number", "missing-invoice-number");
  field(invoice.invoiceDate, 8, "Invoice date", "missing-invoice-date");
  field(invoice.vendor?.name || invoice.vendor?.registeredName || invoice.vendor?.companyName, 14, "Vendor identity", "missing-vendor");
  if (sourceShowsCustomer) field(invoice.customer?.name || invoice.customer?.registeredName || invoice.customer?.companyName, 8, "Customer identity", "missing-customer");
  field(normalizeCurrency(invoice.currency, invoice.currencySymbol), 10, "Currency", "missing-currency");
  if (!normalizeCurrency(invoice.currency, invoice.currencySymbol) && sourceShowsCurrency) {
    addReason(reasons, "The source contains an explicit currency marker but the extraction did not preserve it.");
  }

  expectedFields += 1;
  if (items.length) {
    const meaningful = items.filter(itemIsMeaningful).length;
    const rowCompleteness = items.length ? meaningful / items.length : 0;
    populatedFields += meaningful > 0 ? 1 : 0;
    score += Math.round(18 * rowCompleteness);
    if (meaningful === items.length) addReason(reasons, `${items.length} line item${items.length === 1 ? "" : "s"} contain usable description and amounts.`);
    else addReason(reasons, "Some extracted line items are missing usable quantities, prices, or amounts.");
    const mismatches = items.filter((item) => !lineItemReconciles(item)).length;
    if (mismatches) {
      reconciliation.lineItems = "REVIEW";
      score -= Math.min(12, mismatches * 5);
      addReason(reasons, `${mismatches} line item${mismatches === 1 ? "" : "s"} do not reconcile quantity × unit price − discount to amount.`);
    }
  } else if (invoiceLike && (numeric(invoice.subtotal) > 0 || numeric(invoice.grandTotal) > 0 || tableEvidence || sourceShowsMoney)) {
    criticalMissing.push("missing-line-items");
    reconciliation.lineItems = "REVIEW";
    score -= 20;
    addReason(reasons, "The invoice has financial evidence but no extracted line items.");
  } else {
    addReason(reasons, "No itemized rows were found; confirm that the document is not itemized.");
  }

  const calculatedSubtotal = roundMoney(items.reduce((sum, item) => sum + numeric(item.total), 0));
  expectedFields += 1;
  if (numeric(invoice.subtotal) > 0) {
    populatedFields += 1;
    score += 8;
    if (items.length) {
      reconciliation.subtotal = nearlyEqual(calculatedSubtotal, numeric(invoice.subtotal)) ? "PASS" : "REVIEW";
      if (reconciliation.subtotal === "REVIEW") {
        score -= 8;
        addReason(reasons, "Subtotal does not reconcile with the extracted line-item amounts.");
      }
    }
  } else if (items.length && calculatedSubtotal > 0) {
    addReason(reasons, "Subtotal is missing even though line items contain amounts.");
  } else if (sourceShowsMoney || invoiceLike) {
    addReason(reasons, "Subtotal is missing or zero.");
  }

  expectedFields += 1;
  if (numeric(invoice.grandTotal) > 0) {
    populatedFields += 1;
    score += 14;
    const baseSubtotal = numeric(invoice.subtotal) || calculatedSubtotal;
    const calculatedGrandTotal = roundMoney(baseSubtotal - numeric(invoice.totalDiscount) + numeric(invoice.totalTax) + numeric(invoice.shippingFee) + numeric(invoice.otherFees));
    reconciliation.grandTotal = nearlyEqual(calculatedGrandTotal, numeric(invoice.grandTotal)) ? "PASS" : "REVIEW";
    if (reconciliation.grandTotal === "REVIEW") {
      score -= 8;
      addReason(reasons, "Grand total does not reconcile with subtotal, tax, discount, and charges.");
    }
  } else if (sourceShowsMoney || invoiceLike) {
    criticalMissing.push("missing-grand-total");
    score -= 10;
    addReason(reasons, "Grand total is missing or zero despite invoice evidence.");
  }

  expectedFields += 1;
  if (presentNumber(invoice.amountPaid) || presentNumber(invoice.balanceDue)) {
    populatedFields += 1;
    score += 3;
    if (presentNumber(invoice.balanceDue) && numeric(invoice.grandTotal) > 0) {
      const expectedBalance = roundMoney(Math.max(0, numeric(invoice.grandTotal) - numeric(invoice.amountPaid)));
      reconciliation.balance = nearlyEqual(expectedBalance, numeric(invoice.balanceDue)) ? "PASS" : "REVIEW";
      if (reconciliation.balance === "REVIEW") {
        score -= 3;
        addReason(reasons, "Balance does not reconcile with grand total minus amount paid.");
      }
    }
  }

  if (vatEvidence) {
    expectedFields += 1;
    const hasVatAmount = presentNumber(phTax.vatAmount) || numeric(invoice.totalTax) > 0;
    if (hasVatAmount) {
      populatedFields += 1;
      score += 6;
    } else {
      criticalMissing.push("missing-vat-amount");
      score -= 8;
      addReason(reasons, "VAT evidence is present but no useful VAT amount was extracted.");
    }
    if (presentNumber(phTax.vatableSales) && hasVatAmount) {
      const expectedVat = roundMoney(numeric(phTax.vatableSales) * PH_VAT_RATE);
      const documentVat = presentNumber(phTax.vatAmount) ? numeric(phTax.vatAmount) : numeric(invoice.totalTax);
      reconciliation.philippineVat = nearlyEqual(expectedVat, documentVat) ? "PASS" : "REVIEW";
      if (reconciliation.philippineVat === "REVIEW") {
        score -= 8;
        addReason(reasons, "VAT amount does not reconcile to 12% of VATable Sales.");
      }
    } else {
      reconciliation.philippineVat = "REVIEW";
      addReason(reasons, "VATable Sales and VAT Amount were not both extracted for review.");
    }
  }

  if (hasText(invoice.projectReference)) score += 2;
  if (invoice.confidenceScore !== undefined && Number.isFinite(Number(invoice.confidenceScore))) score += Math.min(3, Math.max(0, numeric(invoice.confidenceScore) / 100 * 3));
  const fieldConfidenceValues = Object.values(invoice.fieldConfidence || {}).filter((value) => Number.isFinite(Number(value)));
  if (fieldConfidenceValues.length) score += Math.min(2, Math.max(0, fieldConfidenceValues.reduce((sum, value) => sum + numeric(value), 0) / fieldConfidenceValues.length / 100 * 2));

  const completeness = expectedFields ? Math.round((populatedFields / expectedFields) * 100) : 0;
  const qualityScore = Math.max(0, Math.min(100, Math.round(score)));
  const dedupedCriticalMissing = Array.from(new Set(criticalMissing));
  const requiresRetry = dedupedCriticalMissing.length > 0 || qualityScore < 70 || completeness < 60 || Object.values(reconciliation).filter((value) => value === "REVIEW").length >= 2;
  if (!reasons.length) addReason(reasons, "Core invoice fields and arithmetic are internally consistent.");

  return {
    score: qualityScore,
    completeness,
    status: requiresRetry ? "NEEDS_REVIEW" : "GOOD",
    requiresRetry,
    reasons,
    criticalMissing: dedupedCriticalMissing,
    lineItemCount: items.length,
    populatedFieldCount: populatedFields,
    reconciliation,
  };
}

export function chooseBestExtractionCandidate<T>(candidates: ScoredExtractionCandidate<T>[]) {
  if (!candidates.length) return undefined;
  return [...candidates].sort((left, right) => {
    const qualityDifference = right.quality.score - left.quality.score;
    if (qualityDifference) return qualityDifference;
    const completenessDifference = right.quality.completeness - left.quality.completeness;
    if (completenessDifference) return completenessDifference;
    const populatedDifference = right.quality.populatedFieldCount - left.quality.populatedFieldCount;
    if (populatedDifference) return populatedDifference;
    const leftReconciled = Object.values(left.quality.reconciliation).filter((value) => value === "PASS").length;
    const rightReconciled = Object.values(right.quality.reconciliation).filter((value) => value === "PASS").length;
    if (rightReconciled !== leftReconciled) return rightReconciled - leftReconciled;
    return right.quality.lineItemCount - left.quality.lineItemCount;
  })[0];
}

export function shouldRunAutomaticRetry(requestedModel: string, quality?: ExtractionQuality) {
  return requestedModel !== "gemini-3.7-flash" && (!quality || quality.requiresRetry);
}

export function retryFocusForQuality(quality: ExtractionQuality) {
  const focus: string[] = [];
  if (quality.criticalMissing.includes("missing-line-items")) focus.push("line-items");
  if (quality.criticalMissing.includes("missing-currency")) focus.push("currency");
  if (quality.criticalMissing.includes("missing-vendor") || quality.criticalMissing.includes("missing-customer")) focus.push("parties");
  if (quality.criticalMissing.includes("missing-grand-total") || quality.criticalMissing.includes("missing-vat-amount")) focus.push("totals");
  return focus.length ? focus : ["full"];
}
