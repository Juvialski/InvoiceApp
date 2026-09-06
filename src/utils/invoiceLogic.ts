import type {
  InvoiceData,
  PhilippineInvoiceCompleteness,
  PhilippineInvoiceCompletenessItem,
  ValidationIssue,
  ValidationSummary,
} from "../types.ts";
import { DEFAULT_CURRENCY, currencySymbolFor, formatDate, formatDateTime, formatMoney, getRegionalSettings } from "../config/regional.ts";
import { normalizeCurrency } from "./extractionQuality.ts";
import {
  evaluateInvoiceDuplicateEvidence,
  findExistingInvoiceForSourcePayload,
} from "./invoiceDuplicateDetection.ts";

export { evaluateInvoiceDuplicateEvidence, findExistingInvoiceForSourcePayload };

const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const nearlyEqual = (a: number, b: number, tolerance = 0.05) => Math.abs(roundMoney(a) - roundMoney(b)) <= tolerance;
const presentNumber = (value: unknown) => value !== undefined && value !== null && !(typeof value === "string" && !value.trim()) && Number.isFinite(Number(value));
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
  const documentVat = presentNumber(details.vatAmount)
    ? numberOrZero(details.vatAmount)
    : presentNumber(invoice.totalTax)
      ? numberOrZero(invoice.totalTax)
      : undefined;
  // The VAT rate is intentionally not a product setting yet. Preserve the
  // source VAT amount and continue only with arithmetic checks that do not
  // require a legal/tax-rate assumption.
  const hasVatAmount = presentNumber(details.vatAmount) || presentNumber(invoice.totalTax);
  if (hasVatAmount) {
    issues.push({
      id: "ph-vat-rate-not-evaluated",
      severity: "warning",
      field: "philippineTaxDetails.vatAmount",
      message: "VAT rate consistency was not evaluated because no authoritative VAT rate is configured.",
    });
  }

  const hasZeroRatedSales = presentNumber(details.zeroRatedSales);
  const hasVatExemptSales = presentNumber(details.vatExemptSales);
  const hasKnownCharges = presentNumber(invoice.totalDiscount) && presentNumber(invoice.shippingFee) && presentNumber(invoice.otherFees);
  const canReconcileTaxBases = presentNumber(invoice.grandTotal) && Number(invoice.grandTotal) > 0 && documentVat !== undefined
    && hasZeroRatedSales && hasVatExemptSales && hasKnownCharges
    && (details.vatInclusive ? presentNumber(invoice.subtotal) : hasVatableSales);
  if (canReconcileTaxBases) {
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

  return {
    issues,
    result: {
      applicable: true,
      status: issues.length ? "REVIEW" : "PASS",
      documentVat: hasVatAmount ? documentVat : undefined,
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
  const hasSubtotal = presentNumber(invoice.subtotal);
  const hasGrandTotal = presentNumber(invoice.grandTotal);
  const invoiceLike = !canBeNonItemized && (documentType.includes("INVOICE") || subtype.includes("INVOICE") || hasSubtotal || hasGrandTotal);
  if (items.length === 0 && invoiceLike && (hasSubtotal || hasGrandTotal)) {
    issues.push({ id: "missing-line-items", severity: "warning", field: "items", message: "Invoice totals are present but no line items were extracted." });
  } else if (items.length === 0 && invoiceLike) {
    issues.push({ id: "no-line-items", severity: "warning", field: "items", message: "No line items were extracted." });
  }
  if (invoiceLike && !hasGrandTotal) {
    issues.push({ id: "missing-grand-total", severity: "warning", field: "grandTotal", message: "Grand total is unresolved; it must be confirmed before authoritative verification." });
  }
  if (items.length > 0 && hasGrandTotal && Number(invoice.grandTotal) > 0 && items.every((item) => presentNumber(item.quantity) && presentNumber(item.unitPrice) && presentNumber(item.total) && item.quantity === 0 && item.unitPrice === 0 && item.total === 0)) {
    issues.push({ id: "zero-value-line-items", severity: "warning", field: "items", message: "Extracted line items contain no usable quantities, prices, or amounts." });
  }

  items.forEach((item, index) => {
    const quantity = presentNumber(item.quantity) ? Number(item.quantity) : undefined;
    const unitPrice = presentNumber(item.unitPrice) ? Number(item.unitPrice) : undefined;
    const discount = presentNumber(item.discount) ? Number(item.discount) : undefined;
    const total = presentNumber(item.total) ? Number(item.total) : undefined;
    if (quantity === undefined) issues.push({ id: "missing-item-quantity-" + index, severity: "warning", field: "items." + index + ".quantity", message: "Line " + (index + 1) + " quantity is unresolved." });
    if (unitPrice === undefined) issues.push({ id: "missing-item-unit-price-" + index, severity: "warning", field: "items." + index + ".unitPrice", message: "Line " + (index + 1) + " unit price is unresolved." });
    if (total === undefined) issues.push({ id: "missing-item-total-" + index, severity: "warning", field: "items." + index + ".total", message: "Line " + (index + 1) + " amount is unresolved." });
    const expected = quantity !== undefined && unitPrice !== undefined && discount !== undefined
      ? roundMoney(quantity * unitPrice - discount)
      : undefined;
    if (expected !== undefined && total !== undefined && !nearlyEqual(expected, total)) {
      issues.push({
        id: "item-total-" + index,
        severity: "warning",
        field: "items." + index + ".total",
        message: "Line " + (index + 1) + " total does not match quantity × unit price − discount.",
        expected,
        actual: total,
      });
    }
  });

  const knownLineTotals = items.map((item) => presentNumber(item.total) ? Number(item.total) : undefined);
  const calculatedSubtotal = items.length > 0 && knownLineTotals.every((value) => value !== undefined)
    ? roundMoney(knownLineTotals.reduce((sum, value) => sum + (value || 0), 0))
    : undefined;
  if (items.length > 0 && calculatedSubtotal !== undefined && hasSubtotal && !nearlyEqual(calculatedSubtotal, Number(invoice.subtotal))) {
    issues.push({
      id: "subtotal-mismatch",
      severity: "warning",
      field: "subtotal",
      message: "Extracted subtotal does not match the sum of line items.",
      expected: calculatedSubtotal,
      actual: Number(invoice.subtotal),
    });
  }

  const totalDiscount = presentNumber(invoice.totalDiscount) ? Number(invoice.totalDiscount) : undefined;
  const totalTax = presentNumber(invoice.totalTax) ? Number(invoice.totalTax) : undefined;
  const shippingFee = presentNumber(invoice.shippingFee) ? Number(invoice.shippingFee) : undefined;
  const otherFees = presentNumber(invoice.otherFees) ? Number(invoice.otherFees) : undefined;
  const baseSubtotal = hasSubtotal ? Number(invoice.subtotal) : calculatedSubtotal;
  const calculatedGrandTotal = baseSubtotal !== undefined && totalDiscount !== undefined && totalTax !== undefined && shippingFee !== undefined && otherFees !== undefined
    ? roundMoney(baseSubtotal - totalDiscount + totalTax + shippingFee + otherFees)
    : undefined;

  if (calculatedGrandTotal !== undefined && hasGrandTotal && !nearlyEqual(calculatedGrandTotal, Number(invoice.grandTotal))) {
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

  const amountPaid = presentNumber(invoice.amountPaid) ? Number(invoice.amountPaid) : undefined;
  const calculatedBalanceDue = hasGrandTotal && amountPaid !== undefined ? roundMoney(Math.max(0, Number(invoice.grandTotal) - amountPaid)) : undefined;
  if (calculatedBalanceDue !== undefined && presentNumber(invoice.balanceDue) && !nearlyEqual(calculatedBalanceDue, Number(invoice.balanceDue))) {
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
  const result = evaluateInvoiceDuplicateEvidence(invoice, existing);
  if (result.isDuplicate && result.duplicateOf) {
    if (result.reasons.length && (!invoice.duplicateReasons || !invoice.duplicateReasons.length)) {
      invoice.duplicateReasons = result.reasons;
    }
    return result.duplicateOf;
  }
  return undefined;
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
    withholdingTaxAmount !== undefined && Number.isFinite(Number(withholdingTaxAmount)) && presentNumber(normalizedInvoice.grandTotal)
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
    const rawValue = field === "balanceDue" ? invoice.balanceDue ?? invoice.grandTotal : invoice.grandTotal;
    if (!currency || currency === "UNK" || !presentNumber(rawValue)) return acc;
    const value = Number(rawValue);
    acc[currency] = roundMoney((acc[currency] || 0) + value);
    return acc;
  }, {});
}

export function totalVatByCurrency(invoices: InvoiceData[]) {
  return invoices.reduce<Record<string, number>>((acc, invoice) => {
    const currency = (invoice.currency || "UNK").toUpperCase();
    const value = invoice.philippineTaxDetails?.vatAmount ?? invoice.totalTax;
    if (!currency || currency === "UNK" || !presentNumber(value)) return acc;
    acc[currency] = roundMoney((acc[currency] || 0) + Number(value));
    return acc;
  }, {});
}

export { DEFAULT_CURRENCY, formatDate, formatDateTime, formatMoney, getRegionalSettings };
