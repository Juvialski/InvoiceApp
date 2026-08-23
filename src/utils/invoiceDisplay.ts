import type { InvoiceData, LineItem, PartyDetails } from "../types.ts";
import { formatDate, formatMoney } from "../config/regional.ts";
import { normalizeCurrency } from "./extractionQuality.ts";

export const UNKNOWN_VENDOR_LABEL = "Unknown vendor";
export const AMOUNT_UNCLEAR_LABEL = "Amount unclear";
export const CURRENCY_UNCLEAR_LABEL = "Currency unclear";
export const DATE_UNCLEAR_LABEL = "Date unclear";
export const PROJECT_UNCLEAR_LABEL = "No project reference";

/**
 * Display helpers accept partial extraction-shaped records as well as the
 * persisted InvoiceData shape. They never mutate the invoice or infer a
 * currency from a party's country.
 */
export type InvoiceDisplayInput = Omit<
  Partial<InvoiceData>,
  "vendor" | "customer" | "shippingAddress" | "items"
> & {
  vendor?: Partial<PartyDetails>;
  customer?: Partial<PartyDetails>;
  shippingAddress?: Partial<PartyDetails>;
  items?: Array<Partial<LineItem>>;
};

export interface InvoiceDisplay {
  primaryLabel: string;
  vendorLabel: string;
  vendorKnown: boolean;
  invoiceNumber: string;
  invoiceLabel: string;
  date: string;
  dateLabel: string;
  dateKnown: boolean;
  projectReference: string;
  purchaseOrderNumber: string;
  projectLabel: string;
  projectKnown: boolean;
  documentLabel: string;
  sourceType: string;
  sourceLabel: string;
  sourceFileLabel: string;
  fileName: string;
  currency: string;
  currencyLabel: string;
  currencyKnown: boolean;
  amount: number | null;
  amountValue: number | null;
  amountLabel: string;
  amountKnown: boolean;
  amountHasQualityGap: boolean;
  statusLabel: string;
  lineItemLabel: string;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function finiteNumber(value: unknown) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return undefined;
  const parsed = typeof value === "number" ? value : Number(text(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasDate(value: unknown) {
  const valueText = text(value);
  if (!valueText) return false;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(valueText)
    ? new Date(`${valueText}T12:00:00+08:00`)
    : new Date(valueText);
  return !Number.isNaN(parsed.getTime());
}

function firstText(...values: unknown[]) {
  return values.map(text).find(Boolean) || "";
}

function meaningfulInvoiceNumber(value: unknown) {
  const valueText = text(value);
  return valueText && !["INV-UNKNOWN", "UNKNOWN", "N/A", "NA", "-"].includes(valueText.toUpperCase())
    ? valueText
    : "";
}

function prettifyType(value: unknown, fallback: string) {
  const valueText = text(value);
  if (!valueText) return fallback;
  return valueText
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceTypeLabel(sourceType: unknown) {
  switch (text(sourceType).toUpperCase()) {
    case "EMAIL": return "Gmail";
    case "PASTED_TEXT": return "Pasted text";
    case "SAMPLE": return "Demo";
    case "UPLOAD":
    case "": return "Upload";
    default: return prettifyType(sourceType, "Upload");
  }
}

function hasMeaningfulZeroLineItem(item: Partial<LineItem>) {
  const description = text(item.description);
  const quantity = finiteNumber(item.quantity);
  const unitPrice = finiteNumber(item.unitPrice);
  const total = finiteNumber(item.total);
  return Boolean(
    description
    && total === 0
    && ((quantity !== undefined && quantity > 0) || (unitPrice !== undefined && unitPrice > 0)),
  );
}

function hasZeroTotalEvidence(invoice: InvoiceDisplayInput, qualityCritical: string[]) {
  if (qualityCritical.includes("missing-grand-total")) return false;

  const quality = invoice.extractionQuality;
  if (quality?.status === "GOOD" || quality?.reconciliation?.grandTotal === "PASS") return true;

  const validation = invoice.validation;
  const hasGrandTotalIssue = validation?.issues?.some((issue) =>
    issue.field.toLowerCase().includes("grandtotal")
    || issue.id.toLowerCase().includes("grand-total"),
  );
  if (validation?.status === "PASS" && validation.calculatedGrandTotal === 0 && !hasGrandTotalIssue) return true;

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  if (items.some(hasMeaningfulZeroLineItem)) return true;

  // Explicit zero tax bases are useful evidence for a genuine zero-value
  // Philippine document, while the default empty extraction object is not.
  const taxDetails = invoice.philippineTaxDetails;
  const explicitTaxBases = [
    taxDetails?.vatableSales,
    taxDetails?.vatAmount,
    taxDetails?.zeroRatedSales,
    taxDetails?.vatExemptSales,
    taxDetails?.salesSubjectToPercentageTax,
  ].filter((value) => finiteNumber(value) !== undefined);
  if (taxDetails && explicitTaxBases.length >= 2 && (text(invoice.invoiceSubtype) || text(invoice.documentType))) return true;

  return false;
}

/**
 * Build a consistent, business-first identity for invoice cards and tables.
 * In particular, a filename is source context only and is never a vendor
 * fallback.
 */
export function getInvoiceDisplay(invoice: InvoiceDisplayInput): InvoiceDisplay {
  const vendorLabel = firstText(
    invoice.vendor?.registeredName,
    invoice.vendor?.companyName,
    invoice.vendor?.name,
    invoice.vendor?.tradeName,
  );
  const invoiceNumber = meaningfulInvoiceNumber(invoice.invoiceNumber);
  const primaryLabel = vendorLabel || invoiceNumber || UNKNOWN_VENDOR_LABEL;
  const date = text(invoice.invoiceDate);
  const dateKnown = hasDate(date);
  const projectReference = text(invoice.projectReference);
  const purchaseOrderNumber = text(invoice.purchaseOrderNumber);
  const projectKnown = Boolean(projectReference || purchaseOrderNumber);
  const projectLabel = projectReference || purchaseOrderNumber || PROJECT_UNCLEAR_LABEL;
  const sourceType = text(invoice.sourceType).toUpperCase() || "UPLOAD";
  const sourceLabel = sourceTypeLabel(sourceType);
  const fileName = text(invoice.fileName);
  const attachmentName = text(invoice.sourceMetadata?.attachmentName);
  const sourceFileLabel = firstText(fileName, attachmentName, invoice.sourceMetadata?.subject) || "Source file unavailable";
  const currency = normalizeCurrency(invoice.currency, invoice.currencySymbol);
  const currencyKnown = Boolean(currency);
  const currencyLabel = currency || CURRENCY_UNCLEAR_LABEL;
  const grandTotal = finiteNumber(invoice.grandTotal);
  const qualityCritical = Array.isArray(invoice.extractionQuality?.criticalMissing)
    ? invoice.extractionQuality.criticalMissing.map(text)
    : [];
  const amountHasQualityGap = qualityCritical.includes("missing-grand-total")
    || grandTotal === undefined;
  const amountKnown = grandTotal !== undefined
    && !amountHasQualityGap
    && (grandTotal !== 0 || hasZeroTotalEvidence(invoice, qualityCritical));
  const amountLabel = !amountKnown
    ? AMOUNT_UNCLEAR_LABEL
    : !currencyKnown
      ? CURRENCY_UNCLEAR_LABEL
      : formatMoney(grandTotal, currency);
  const lineItemCount = Array.isArray(invoice.items) ? invoice.items.length : 0;

  return {
    primaryLabel,
    vendorLabel,
    vendorKnown: Boolean(vendorLabel),
    invoiceNumber,
    invoiceLabel: invoiceNumber ? `Invoice # ${invoiceNumber}` : "Invoice number missing",
    date,
    dateLabel: dateKnown ? formatDate(date, "medium") : DATE_UNCLEAR_LABEL,
    dateKnown,
    projectReference,
    purchaseOrderNumber,
    projectLabel,
    projectKnown,
    documentLabel: prettifyType(invoice.invoiceSubtype || invoice.documentType, "Invoice"),
    sourceType,
    sourceLabel,
    sourceFileLabel,
    fileName,
    currency,
    currencyLabel,
    currencyKnown,
    amount: grandTotal ?? null,
    amountValue: grandTotal ?? null,
    amountLabel,
    amountKnown,
    amountHasQualityGap,
    statusLabel: invoice.reviewStatus === "NEEDS_REVIEW" ? "Needs review" : "Verified",
    lineItemLabel: `${lineItemCount} line item${lineItemCount === 1 ? "" : "s"}`,
  };
}

export const getInvoiceDisplayIdentity = getInvoiceDisplay;

// Short alias for call sites that read more naturally as a display projection.
export const invoiceDisplay = getInvoiceDisplay;
