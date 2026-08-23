import type {
  InvoiceData,
  PhilippineInvoiceCompleteness,
  PhilippineInvoiceCompletenessItem,
  ValidationIssue,
  ValidationSummary,
} from "../types.ts";
import { DEFAULT_CURRENCY, currencySymbolFor, formatDate, formatDateTime, formatMoney, getRegionalSettings } from "../config/regional.ts";
import { normalizeCurrency } from "./extractionQuality.ts";

const PH_VAT_RATE = 0.12;
const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const nearlyEqual = (a: number, b: number, tolerance = 0.05) => Math.abs(roundMoney(a) - roundMoney(b)) <= tolerance;
const presentNumber = (value: unknown) => value !== undefined && value !== null && Number.isFinite(Number(value));
const numberOrZero = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

function hasPhilippineContext(invoice: InvoiceData) {
  const country = [invoice.vendor?.country, invoice.customer?.country].filter(Boolean).join(" ").toLowerCase();
  return Boolean(
    invoice.currency?.toUpperCase() === "PHP" ||
    invoice.philippineTaxDetails ||
    invoice.invoiceSubtype === "VAT_INVOICE" ||
    invoice.invoiceSubtype === "NON_VAT_INVOICE" ||
    country.includes("philippines") ||
    country === "ph"
  );
}

function isPhilippineVatInvoice(invoice: InvoiceData) {
  const details = invoice.philippineTaxDetails;
  return hasPhilippineContext(invoice) && (
    invoice.invoiceSubtype === "VAT_INVOICE" ||
    details?.invoiceKind === "VAT_INVOICE" ||
    details?.sellerRegistration === "VAT" ||
    invoice.vendor?.taxRegistration === "VAT"
  );
}

function isPhilippineNonVatInvoice(invoice: InvoiceData) {
  const details = invoice.philippineTaxDetails;
  return hasPhilippineContext(invoice) && (
    invoice.invoiceSubtype === "NON_VAT_INVOICE" ||
    details?.invoiceKind === "NON_VAT_INVOICE" ||
    details?.sellerRegistration === "NON_VAT" ||
    invoice.vendor?.taxRegistration === "NON_VAT"
  );
}

export function validatePhilippineVat(invoice: InvoiceData): {
  issues: ValidationIssue[];
  result: NonNullable<ValidationSummary["philippineVat"]>;
} {
  if (!isPhilippineVatInvoice(invoice)) {
    return { issues: [], result: { applicable: false, status: "NOT_APPLICABLE" } };
  }

  const details = invoice.philippineTaxDetails || {};
  const issues: ValidationIssue[] = [];
  const hasVatableSales = presentNumber(details.vatableSales);
  const vatableSales = numberOrZero(details.vatableSales);
  const documentVat = presentNumber(details.vatAmount) ? numberOrZero(details.vatAmount) : numberOrZero(invoice.totalTax);
  let expectedVat: number | undefined;

  if (hasVatableSales && presentNumber(details.vatAmount)) {
    expectedVat = roundMoney(vatableSales * PH_VAT_RATE);
    const difference = roundMoney(documentVat - expectedVat);
    if (!nearlyEqual(expectedVat, documentVat)) {
      issues.push({
        id: "ph-vat-rate-mismatch",
        severity: "warning",
        field: "philippineTaxDetails.vatAmount",
        message: "Philippine VAT does not reconcile to 12% of VATable Sales.",
        expected: expectedVat,
        actual: documentVat,
      });
      return {
        issues,
        result: { applicable: true, status: "REVIEW", expectedVat, documentVat, difference },
      };
    }
  }

  const hasTaxBases = hasVatableSales || presentNumber(details.zeroRatedSales) || presentNumber(details.vatExemptSales);
  if (hasTaxBases && Number(invoice.grandTotal) > 0) {
    const zeroRated = numberOrZero(details.zeroRatedSales);
    const vatExempt = numberOrZero(details.vatExemptSales);
    const discount = numberOrZero(invoice.totalDiscount);
    const otherCharges = numberOrZero(invoice.shippingFee) + numberOrZero(invoice.otherFees);
    const expectedTotal = details.vatInclusive
      ? roundMoney(numberOrZero(invoice.subtotal) - discount + otherCharges)
      : roundMoney(vatableSales + documentVat + zeroRated + vatExempt - discount + otherCharges);
    if (!nearlyEqual(expectedTotal, numberOrZero(invoice.grandTotal))) {
      issues.push({
        id: "ph-tax-reconciliation-mismatch",
        severity: "warning",
        field: "grandTotal",
        message: details.vatInclusive
          ? "VAT-inclusive Philippine invoice total does not reconcile to the displayed subtotal and charges."
          : "Philippine VATable, zero-rated and VAT-exempt amounts do not reconcile to the invoice total.",
        expected: expectedTotal,
        actual: numberOrZero(invoice.grandTotal),
      });
    }
  }

  const difference = expectedVat === undefined ? undefined : roundMoney(documentVat - expectedVat);
  return {
    issues,
    result: {
      applicable: true,
      status: issues.length ? "REVIEW" : "PASS",
      expectedVat,
      documentVat: presentNumber(details.vatAmount) ? documentVat : undefined,
      difference,
    },
  };
}

function completenessItem(
  id: string,
  label: string,
  value: unknown,
  field: string,
  required = true,
  note?: string,
): PhilippineInvoiceCompletenessItem {
  const complete = Array.isArray(value)
    ? value.length > 0
    : typeof value === "boolean"
      ? value
      : Boolean(String(value ?? "").trim());
  return {
    id,
    label,
    field,
    status: complete ? "COMPLETE" : required ? "MISSING_INFORMATION" : "NOT_APPLICABLE",
    ...(note ? { note } : {}),
  };
}

export function checkPhilippineInvoiceCompleteness(invoice: InvoiceData): PhilippineInvoiceCompleteness {
  if (!hasPhilippineContext(invoice)) {
    return { status: "NOT_APPLICABLE", items: [], disclaimer: "This is a review aid, not a legal certification of BIR compliance." };
  }

  const vatInvoice = isPhilippineVatInvoice(invoice);
  const items: PhilippineInvoiceCompletenessItem[] = [
    completenessItem("invoice-label", "Invoice label detected", invoice.documentType === "INVOICE" || (invoice.invoiceSubtype && invoice.invoiceSubtype !== "UNKNOWN"), "documentType"),
    completenessItem("seller-registered-name", "Seller registered name", invoice.vendor?.registeredName || invoice.vendor?.companyName || invoice.vendor?.name, "vendor.registeredName"),
    completenessItem("seller-tin", "Seller TIN", invoice.vendor?.taxId, "vendor.taxId"),
    completenessItem("seller-address", "Seller business address", invoice.vendor?.address || invoice.vendor?.cityMunicipality || invoice.vendor?.city, "vendor.address"),
    completenessItem("invoice-serial", "Invoice serial number", invoice.invoiceNumber, "invoiceNumber"),
    completenessItem("transaction-date", "Transaction date", invoice.invoiceDate, "invoiceDate"),
    completenessItem("description", "Description / nature of service", invoice.items, "items"),
    completenessItem("quantity", "Quantity where applicable", invoice.items.some((item) => presentNumber(item.quantity)), "items.quantity", true),
    completenessItem("unit-price", "Unit price / cost", invoice.items.some((item) => presentNumber(item.unitPrice)), "items.unitPrice", true),
    completenessItem("amount", "Amount", invoice.items.some((item) => presentNumber(item.total)), "items.total", true),
    ...(vatInvoice ? [
      completenessItem("vatable-sales", "VATable Sales", invoice.philippineTaxDetails?.vatableSales, "philippineTaxDetails.vatableSales"),
      completenessItem("vat-amount", "VAT Amount", invoice.philippineTaxDetails?.vatAmount, "philippineTaxDetails.vatAmount"),
      completenessItem("zero-rated-sales", "Zero-Rated Sales", invoice.philippineTaxDetails?.zeroRatedSales, "philippineTaxDetails.zeroRatedSales", false),
      completenessItem("vat-exempt-sales", "VAT-Exempt Sales", invoice.philippineTaxDetails?.vatExemptSales, "philippineTaxDetails.vatExemptSales", false),
    ] : []),
    completenessItem("buyer-tin", "Buyer TIN", invoice.customer?.taxId, "customer.taxId", false),
    completenessItem("atp-ocn", "ATP / OCN", invoice.philippineTaxDetails?.authorityToPrintNumber || invoice.philippineTaxDetails?.outboundCorrespondenceNumber, "philippineTaxDetails.authorityToPrintNumber", false),
    completenessItem("permit", "Permit details", invoice.philippineTaxDetails?.permitToUseNumber || invoice.philippineTaxDetails?.birPermitDetailsRaw, "philippineTaxDetails.permitToUseNumber", false),
  ];

  const missing = items.some((item) => item.status === "MISSING_INFORMATION");
  return {
    status: missing ? "MISSING_INFORMATION" : "COMPLETE",
    items,
    disclaimer: "Completeness checks are a review aid, not a legal certification of BIR compliance.",
  };
}

export function validateInvoice(invoice: InvoiceData): ValidationSummary {
  const issues: ValidationIssue[] = [];
  const items = invoice.items || [];

  if (!invoice.invoiceNumber || invoice.invoiceNumber === "INV-UNKNOWN") {
    issues.push({ id: "missing-invoice-number", severity: "warning", field: "invoiceNumber", message: "Invoice number was not confidently found." });
  }
  if (!invoice.invoiceDate) {
    issues.push({ id: "missing-invoice-date", severity: "warning", field: "invoiceDate", message: "Invoice date is missing." });
  }
  if (!invoice.vendor?.name && !invoice.vendor?.companyName && !invoice.vendor?.registeredName) {
    issues.push({ id: "missing-vendor", severity: "warning", field: "vendor.name", message: "Vendor name needs review." });
  }
  if (!invoice.currency) {
    issues.push({ id: "missing-currency", severity: "warning", field: "currency", message: "Currency is missing; it was not inferred from location." });
  }
  const documentType = String(invoice.documentType || "").toUpperCase();
  const subtype = String(invoice.invoiceSubtype || "").toUpperCase();
  const canBeNonItemized = ["RECEIPT", "STATEMENT", "SUPPLEMENTARY_DOCUMENT"].includes(documentType);
  const invoiceLike = !canBeNonItemized && (documentType.includes("INVOICE") || subtype.includes("INVOICE") || Number(invoice.subtotal) > 0 || Number(invoice.grandTotal) > 0);
  if (items.length === 0 && invoiceLike && (Number(invoice.subtotal) > 0 || Number(invoice.grandTotal) > 0)) {
    issues.push({ id: "missing-line-items", severity: "warning", field: "items", message: "Invoice totals are present but no line items were extracted." });
  } else if (items.length === 0 && invoiceLike) {
    issues.push({ id: "no-line-items", severity: "warning", field: "items", message: "No line items were extracted." });
  }
  if (items.length > 0 && Number(invoice.grandTotal) > 0 && items.every((item) => Number(item.quantity) === 0 && Number(item.unitPrice) === 0 && Number(item.total) === 0)) {
    issues.push({ id: "zero-value-line-items", severity: "warning", field: "items", message: "Extracted line items contain no usable quantities, prices, or amounts." });
  }

  items.forEach((item, index) => {
    const expected = roundMoney((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) - (Number(item.discount) || 0));
    if (!nearlyEqual(expected, Number(item.total) || 0)) {
      issues.push({
        id: `item-total-${index}`,
        severity: "warning",
        field: `items.${index}.total`,
        message: `Line ${index + 1} total does not match quantity × unit price − discount.`,
        expected,
        actual: Number(item.total) || 0,
      });
    }
  });

  const calculatedSubtotal = roundMoney(items.reduce((sum, item) => sum + (Number(item.total) || 0), 0));
  if (items.length > 0 && !nearlyEqual(calculatedSubtotal, Number(invoice.subtotal) || 0)) {
    issues.push({
      id: "subtotal-mismatch",
      severity: "warning",
      field: "subtotal",
      message: "Extracted subtotal does not match the sum of line items.",
      expected: calculatedSubtotal,
      actual: Number(invoice.subtotal) || 0,
    });
  }

  const baseSubtotal = Number(invoice.subtotal) || calculatedSubtotal;
  const calculatedGrandTotal = roundMoney(
    baseSubtotal -
      (Number(invoice.totalDiscount) || 0) +
      (Number(invoice.totalTax) || 0) +
      (Number(invoice.shippingFee) || 0) +
      (Number(invoice.otherFees) || 0)
  );

  if (Number(invoice.grandTotal) > 0 && !nearlyEqual(calculatedGrandTotal, Number(invoice.grandTotal))) {
    issues.push({
      id: "grand-total-mismatch",
      severity: "warning",
      field: "grandTotal",
      message: "Grand total does not reconcile with subtotal, discount, tax, shipping and fees.",
      expected: calculatedGrandTotal,
      actual: Number(invoice.grandTotal),
    });
  }

  const philippineVat = validatePhilippineVat(invoice);
  issues.push(...philippineVat.issues);

  if (isPhilippineNonVatInvoice(invoice) && Number(invoice.totalTax) > 0.05) {
    issues.push({ id: "ph-non-vat-tax-present", severity: "warning", field: "totalTax", message: "Non-VAT invoice shows a tax amount; confirm the source and classification." });
  }

  const calculatedBalanceDue = roundMoney(Math.max(0, (Number(invoice.grandTotal) || calculatedGrandTotal) - (Number(invoice.amountPaid) || 0)));
  if (invoice.balanceDue !== undefined && !nearlyEqual(calculatedBalanceDue, Number(invoice.balanceDue))) {
    issues.push({
      id: "balance-mismatch",
      severity: "warning",
      field: "balanceDue",
      message: "Balance due does not reconcile with grand total minus amount paid.",
      expected: calculatedBalanceDue,
      actual: Number(invoice.balanceDue),
    });
  }

  return {
    status: issues.some((issue) => issue.severity === "warning" || issue.severity === "error") ? "REVIEW" : "PASS",
    issues,
    calculatedSubtotal,
    calculatedGrandTotal,
    calculatedBalanceDue,
    philippineVat: philippineVat.result,
  };
}

export function derivePaymentStatus(invoice: Pick<InvoiceData, "grandTotal" | "amountPaid" | "balanceDue" | "dueDate">): string {
  const total = Number(invoice.grandTotal) || 0;
  const paid = Number(invoice.amountPaid) || 0;
  const balance = invoice.balanceDue === undefined ? Math.max(0, total - paid) : Number(invoice.balanceDue) || 0;
  if (total > 0 && balance <= 0.01) return "PAID";
  if (paid > 0 && balance > 0.01) return "PARTIALLY_PAID";
  if (invoice.dueDate) {
    const due = new Date(`${invoice.dueDate}T23:59:59+08:00`);
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now() && balance > 0.01) return "OVERDUE";
  }
  return "UNPAID";
}

export function findPossibleDuplicate(invoice: InvoiceData, existing: InvoiceData[]): InvoiceData | undefined {
  const number = (invoice.invoiceNumber || "").trim().toLowerCase();
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const vendor = normalize(invoice.vendor?.registeredName || invoice.vendor?.companyName || invoice.vendor?.name || "");
  const taxId = normalize(invoice.vendor?.taxId || "");
  const sourceEmail = invoice.sourceMetadata?.gmailMessageId || invoice.sourceEmailId || "";
  const sourceAttachment = invoice.sourceMetadata?.gmailAttachmentId || "";
  const hasFinancialFingerprint = Boolean(vendor && invoice.invoiceDate && invoice.currency && Number(invoice.grandTotal) > 0);
  return existing.find((candidate) => {
    if (candidate.id === invoice.id) return false;
    const candidateVendor = normalize(candidate.vendor?.registeredName || candidate.vendor?.companyName || candidate.vendor?.name || "");
    const candidateTaxId = normalize(candidate.vendor?.taxId || "");
    const sameSourceDocument = Boolean(invoice.sourceDocumentId && candidate.sourceDocumentId && invoice.sourceDocumentId === candidate.sourceDocumentId);
    const sameSourceEmail = Boolean(sourceEmail && (candidate.sourceMetadata?.gmailMessageId || candidate.sourceEmailId) === sourceEmail && sourceAttachment && candidate.sourceMetadata?.gmailAttachmentId === sourceAttachment);
    const sameFile = Boolean(invoice.sourceSha256 && candidate.sourceSha256 && invoice.sourceSha256 === candidate.sourceSha256);
    const sameNumber = Boolean(number && (candidate.invoiceNumber || "").trim().toLowerCase() === number);
    const sameVendor = Boolean(vendor && candidateVendor === vendor && (!taxId || !candidateTaxId || candidateTaxId === taxId));
    const sameCurrency = (candidate.currency || "").toUpperCase() === (invoice.currency || "").toUpperCase();
    const sameTotal = Math.abs((Number(candidate.grandTotal) || 0) - (Number(invoice.grandTotal) || 0)) <= 0.05;
    const sameDate = Boolean(invoice.invoiceDate && candidate.invoiceDate && candidate.invoiceDate === invoice.invoiceDate);
    return sameSourceDocument || sameSourceEmail || sameFile || (hasFinancialFingerprint && sameVendor && sameDate && sameCurrency && sameTotal) || (sameNumber && sameVendor && sameCurrency && sameTotal);
  });
}

export function applyLocalChecks(invoice: InvoiceData): InvoiceData {
  const currency = normalizeCurrency(invoice.currency, invoice.currencySymbol);
  const normalizedInvoice = {
    ...invoice,
    currency,
    currencySymbol: currency ? currencySymbolFor(currency) : invoice.currencySymbol,
  };
  const validation = validateInvoice(normalizedInvoice);
  const completeness = checkPhilippineInvoiceCompleteness(normalizedInvoice);
  const humanVerified = normalizedInvoice.reviewStatus === "VERIFIED" && Boolean(normalizedInvoice.verifiedAt);
  const taxDetails = normalizedInvoice.philippineTaxDetails;
  const withholdingTaxAmount = normalizedInvoice.withholdingTaxAmount ?? taxDetails?.withholdingTaxAmount;
  const netAmountPayable = normalizedInvoice.netAmountPayable ?? taxDetails?.netAmountPayable ?? (
    withholdingTaxAmount !== undefined && Number.isFinite(Number(withholdingTaxAmount))
      ? roundMoney(numberOrZero(normalizedInvoice.grandTotal) - numberOrZero(withholdingTaxAmount))
      : undefined
  );
  return {
    ...normalizedInvoice,
    status: derivePaymentStatus(normalizedInvoice),
    validation,
    philippineInvoiceCompleteness: completeness,
    ...(withholdingTaxAmount !== undefined ? { withholdingTaxAmount } : {}),
    ...(netAmountPayable !== undefined ? { netAmountPayable } : {}),
    reviewStatus: humanVerified ? "VERIFIED" : "NEEDS_REVIEW",
  };
}

export function totalsByCurrency(invoices: InvoiceData[], field: "grandTotal" | "balanceDue" = "grandTotal") {
  return invoices.reduce<Record<string, number>>((acc, invoice) => {
    const currency = (invoice.currency || "UNK").toUpperCase();
    const value = field === "balanceDue" ? Number(invoice.balanceDue ?? invoice.grandTotal) || 0 : Number(invoice.grandTotal) || 0;
    acc[currency] = roundMoney((acc[currency] || 0) + value);
    return acc;
  }, {});
}

export function totalVatByCurrency(invoices: InvoiceData[]) {
  return invoices.reduce<Record<string, number>>((acc, invoice) => {
    const currency = (invoice.currency || "UNK").toUpperCase();
    const value = invoice.philippineTaxDetails?.vatAmount ?? invoice.totalTax ?? 0;
    acc[currency] = roundMoney((acc[currency] || 0) + (Number(value) || 0));
    return acc;
  }, {});
}

export { DEFAULT_CURRENCY, formatDate, formatDateTime, formatMoney, getRegionalSettings };
