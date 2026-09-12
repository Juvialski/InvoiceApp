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
import {
  explicitInvoiceTaxAmount,
  nearlyEqualInvoiceMoney,
  reconcileInvoiceMonetarySemantics,
  roundInvoiceMoney,
} from "./invoiceMonetarySemantics.ts";
import { businessDateForTimeZone } from "./businessDate.ts";

export { evaluateInvoiceDuplicateEvidence, findExistingInvoiceForSourcePayload };

const roundMoney = (value: number) => roundInvoiceMoney(value);
const nearlyEqual = (a: number, b: number, tolerance = 0.02) => nearlyEqualInvoiceMoney(a, b, tolerance);
const presentNumber = (value: unknown) => value !== undefined && value !== null && !(typeof value === "string" && !value.trim()) && Number.isFinite(Number(value));
const numberOrZero = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

function hasPhilippineContext(invoice: InvoiceData) {
  const country = String(invoice.vendor?.country || "").toLowerCase();
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
  const documentVat = explicitInvoiceTaxAmount(invoice);
  // The VAT rate is intentionally not a product setting yet. Preserve the
  // source VAT amount and continue only with arithmetic checks that do not
  // require a legal/tax-rate assumption.
  if (documentVat !== undefined) {
    issues.push({
      id: "ph-vat-rate-not-evaluated",
      severity: "info",
      field: "philippineTaxDetails.vatAmount",
      message: "VAT rate consistency was not evaluated because no authoritative VAT rate is configured.",
    });
  }

  const vatableSales = presentNumber(details.vatableSales) ? numberOrZero(details.vatableSales) : undefined;
  const zeroRatedSales = presentNumber(details.zeroRatedSales) ? numberOrZero(details.zeroRatedSales) : undefined;
  const vatExemptSales = presentNumber(details.vatExemptSales) ? numberOrZero(details.vatExemptSales) : undefined;
  const hasKnownCharges = presentNumber(invoice.totalDiscount) && presentNumber(invoice.shippingFee) && presentNumber(invoice.otherFees);
  if (presentNumber(invoice.grandTotal) && Number(invoice.grandTotal) > 0 && documentVat !== undefined
    && vatableSales !== undefined && zeroRatedSales !== undefined && vatExemptSales !== undefined && hasKnownCharges) {
    const zeroRated = numberOrZero(details.zeroRatedSales);
    const vatExempt = numberOrZero(details.vatExemptSales);
    const discount = numberOrZero(invoice.totalDiscount);
    const otherCharges = numberOrZero(invoice.shippingFee) + numberOrZero(invoice.otherFees);
    const expectedTotal = roundMoney(vatableSales + documentVat + zeroRated + vatExempt - discount + otherCharges);
    if (!nearlyEqual(expectedTotal, numberOrZero(invoice.grandTotal))) {
      issues.push({
        id: "ph-tax-reconciliation-mismatch",
        severity: "warning",
        field: "grandTotal",
        message: "Philippine VATable, zero-rated and VAT-exempt amounts do not reconcile to the gross invoice total.",
        expected: expectedTotal,
        actual: numberOrZero(invoice.grandTotal),
      });
    }
  }

  return {
    issues,
    result: {
      applicable: true,
      status: issues.some((issue) => issue.severity === "warning" || issue.severity === "error") ? "REVIEW" : "PASS",
      documentVat: documentVat,
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

  // Persisted extraction JSON can predate the line-item field or omit it on a
  // partial result. Treat that as an unresolved empty collection so loading
  // remains safe and the completeness result still asks for review.
  const lineItems = Array.isArray(invoice.items) ? invoice.items : [];
  const vatInvoice = isPhilippineVatInvoice(invoice);
  const items: PhilippineInvoiceCompletenessItem[] = [
    completenessItem("invoice-label", "Invoice label detected", invoice.documentType === "INVOICE" || (invoice.invoiceSubtype && invoice.invoiceSubtype !== "UNKNOWN"), "documentType"),
    completenessItem("seller-registered-name", "Seller registered name", invoice.vendor?.registeredName || invoice.vendor?.companyName || invoice.vendor?.name, "vendor.registeredName"),
    completenessItem("seller-tin", "Seller TIN", invoice.vendor?.taxId, "vendor.taxId"),
    completenessItem("seller-address", "Seller business address", invoice.vendor?.address || invoice.vendor?.cityMunicipality || invoice.vendor?.city, "vendor.address"),
    completenessItem("invoice-serial", "Invoice serial number", invoice.invoiceNumber, "invoiceNumber"),
    completenessItem("transaction-date", "Transaction date", invoice.invoiceDate, "invoiceDate"),
    completenessItem("description", "Description / nature of service", lineItems, "items"),
    completenessItem("quantity", "Quantity where applicable", lineItems.some((item) => presentNumber(item.quantity)), "items.quantity", true),
    completenessItem("unit-price", "Unit price / cost", lineItems.some((item) => presentNumber(item.unitPrice)), "items.unitPrice", true),
    completenessItem("amount", "Amount", lineItems.some((item) => presentNumber(item.total)), "items.total", true),
    ...(vatInvoice ? [
      completenessItem("vatable-sales", "VATable Sales", invoice.philippineTaxDetails?.vatableSales ?? (invoice.financialSemantics?.subtotalBasis === "PRE_TAX" ? invoice.subtotal : undefined), "philippineTaxDetails.vatableSales"),
      completenessItem("vat-amount", "VAT Amount", invoice.philippineTaxDetails?.vatAmount ?? invoice.totalTax, "philippineTaxDetails.vatAmount"),
      completenessItem("zero-rated-sales", "Zero-Rated Sales", invoice.philippineTaxDetails?.zeroRatedSales, "philippineTaxDetails.zeroRatedSales", false),
      completenessItem("vat-exempt-sales", "VAT-Exempt Sales", invoice.philippineTaxDetails?.vatExemptSales, "philippineTaxDetails.vatExemptSales", false),
    ] : []),
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
    const total = presentNumber(item.total) ? Number(item.total) : undefined;
    if (quantity === undefined) issues.push({ id: "missing-item-quantity-" + index, severity: "warning", field: "items." + index + ".quantity", message: "Line " + (index + 1) + " quantity is unresolved." });
    if (unitPrice === undefined) issues.push({ id: "missing-item-unit-price-" + index, severity: "warning", field: "items." + index + ".unitPrice", message: "Line " + (index + 1) + " unit price is unresolved." });
    if (total === undefined) issues.push({ id: "missing-item-total-" + index, severity: "warning", field: "items." + index + ".total", message: "Line " + (index + 1) + " amount is unresolved." });
  });

  const monetary = reconcileInvoiceMonetarySemantics(invoice);
  issues.push(...monetary.issues);

  const philippineVat = validatePhilippineVat(invoice);
  issues.push(...philippineVat.issues);

  const explicitTax = explicitInvoiceTaxAmount(invoice);
  if (isPhilippineNonVatInvoice(invoice) && explicitTax !== undefined && explicitTax > 0.05) {
    issues.push({ id: "ph-non-vat-tax-present", severity: "warning", field: "totalTax", message: "Non-VAT invoice shows a tax amount; confirm the source and classification." });
  }

  return {
    status: issues.some((issue) => issue.severity === "warning" || issue.severity === "error") ? "REVIEW" : "PASS",
    issues,
    calculatedSubtotal: monetary.calculatedSubtotal,
    calculatedTax: monetary.calculatedTax,
    calculatedGrandTotal: monetary.calculatedGrandTotal,
    calculatedBalanceDue: monetary.calculatedBalanceDue,
    philippineVat: philippineVat.result,
    monetarySemantics: monetary.semantics,
  };
}

export function derivePaymentStatus(invoice: Pick<InvoiceData, "grandTotal" | "amountPaid" | "balanceDue" | "dueDate">): string {
  const totalValue = Number(invoice.grandTotal);
  const paidValue = Number(invoice.amountPaid);
  const total = Number.isFinite(totalValue) ? totalValue : 0;
  const paid = Number.isFinite(paidValue) ? paidValue : 0;
  const balanceValue = Number(invoice.balanceDue);
  const balance = invoice.balanceDue === undefined || invoice.balanceDue === null
    ? Number.isFinite(totalValue) && Number.isFinite(paidValue) ? Math.max(0, total - paid) : undefined
    : Number.isFinite(balanceValue) ? balanceValue : undefined;
  if (balance === undefined) return paid > 0 ? "PARTIALLY_PAID" : "UNPAID";
  if (total > 0 && balance <= 0.01) return "PAID";
  if (paid > 0 && balance > 0.01) return "PARTIALLY_PAID";
  if (invoice.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(invoice.dueDate) && invoice.dueDate < businessDateForTimeZone() && balance > 0.01) return "OVERDUE";
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
    // Keep the persisted invoice contract total: missing line-item JSON is an
    // unresolved empty collection, never a reason to crash a loaded workspace.
    items: Array.isArray(invoice.items) ? invoice.items : [],
    currency,
    currencySymbol: currency ? currencySymbolFor(currency) : invoice.currencySymbol,
  };
  const validation = validateInvoice(normalizedInvoice);
  const completeness = checkPhilippineInvoiceCompleteness(normalizedInvoice);
  const humanVerified = normalizedInvoice.reviewStatus === "VERIFIED" && Boolean(normalizedInvoice.verifiedAt);
  const taxDetails = normalizedInvoice.philippineTaxDetails;
  const withholdingTaxAmount = presentNumber(normalizedInvoice.withholdingTaxAmount)
    ? Number(normalizedInvoice.withholdingTaxAmount)
    : presentNumber(taxDetails?.withholdingTaxAmount)
      ? Number(taxDetails?.withholdingTaxAmount)
      : undefined;
  const explicitNetAmountPayable = presentNumber(normalizedInvoice.netAmountPayable)
    ? Number(normalizedInvoice.netAmountPayable)
    : presentNumber(taxDetails?.netAmountPayable)
      ? Number(taxDetails?.netAmountPayable)
      : undefined;
  const netAmountPayable = explicitNetAmountPayable ?? (
    withholdingTaxAmount !== undefined && presentNumber(normalizedInvoice.grandTotal)
      ? roundMoney(numberOrZero(normalizedInvoice.grandTotal) - withholdingTaxAmount)
      : undefined
  );
  const persistedBalanceDue = normalizedInvoice.balanceDue === undefined || normalizedInvoice.balanceDue === null
    || normalizedInvoice.financialFieldStatus?.balanceDue === "CALCULATED"
    ? validation.calculatedBalanceDue ?? normalizedInvoice.balanceDue
    : normalizedInvoice.balanceDue;
  const paymentBalance = persistedBalanceDue ?? validation.calculatedBalanceDue;
  const financialFieldStatus = { ...(normalizedInvoice.financialFieldStatus || {}) };
  for (const field of ["subtotal", "totalDiscount", "totalTax", "shippingFee", "otherFees", "grandTotal", "amountPaid", "amountDue", "balanceDue"]) {
    if (financialFieldStatus[field] === undefined && presentNumber((normalizedInvoice as any)[field])) financialFieldStatus[field] = "KNOWN";
  }
  for (const [index, item] of normalizedInvoice.items.entries()) {
    for (const field of ["quantity", "unitPrice", "discount", "total"]) {
      const key = `items.${index}.${field}`;
      if (financialFieldStatus[key] === undefined && presentNumber((item as any)[field])) financialFieldStatus[key] = "KNOWN";
    }
  }
  if ((normalizedInvoice.balanceDue === undefined || normalizedInvoice.balanceDue === null) && persistedBalanceDue !== undefined && persistedBalanceDue !== null) financialFieldStatus.balanceDue = "CALCULATED";
  const sourceWithholding = withholdingTaxAmount;
  if (sourceWithholding !== undefined && financialFieldStatus.withholdingTaxAmount === undefined) financialFieldStatus.withholdingTaxAmount = "KNOWN";
  if (netAmountPayable !== undefined && financialFieldStatus.netAmountPayable === undefined) financialFieldStatus.netAmountPayable = explicitNetAmountPayable !== undefined ? "KNOWN" : "CALCULATED";
  if (normalizedInvoice.aiSnapshot) {
    const calculatedValues: Record<string, number | undefined> = {
      subtotal: validation.calculatedSubtotal,
      totalTax: validation.calculatedTax,
      grandTotal: validation.calculatedGrandTotal,
      balanceDue: validation.calculatedBalanceDue,
      netAmountPayable,
    };
    const trackedFields = [
      "subtotal", "totalDiscount", "totalTax", "shippingFee", "otherFees", "grandTotal",
      "amountPaid", "amountDue", "balanceDue", "withholdingTaxAmount", "netAmountPayable",
      "items", "financialSemantics",
    ];
    for (const field of trackedFields) {
      const sourceValue = (normalizedInvoice.aiSnapshot as any)[field];
      const currentValue = (normalizedInvoice as any)[field];
      const isSourceOmittedCalculatedValue = (sourceValue === undefined || sourceValue === null)
        && financialFieldStatus[field] === "CALCULATED"
        && calculatedValues[field] !== undefined
        && presentNumber(currentValue)
        && nearlyEqualInvoiceMoney(Number(currentValue), calculatedValues[field]!);
      if (!isSourceOmittedCalculatedValue && JSON.stringify(sourceValue ?? null) !== JSON.stringify(currentValue ?? null)) financialFieldStatus[field] = "MANUAL";
    }
    const sourceItems = Array.isArray((normalizedInvoice.aiSnapshot as any).items) ? (normalizedInvoice.aiSnapshot as any).items : [];
    const currentItems = Array.isArray(normalizedInvoice.items) ? normalizedInvoice.items : [];
    for (const [index, item] of currentItems.entries()) {
      const sourceItem = sourceItems[index] || {};
      for (const field of ["quantity", "unitPrice", "discount", "total"]) {
        const fieldKey = `items.${index}.${field}`;
        const sourceOmittedCalculatedTotal = field === "total"
          && (sourceItem[field] === undefined || sourceItem[field] === null)
          && financialFieldStatus[fieldKey] === "CALCULATED"
          && presentNumber((item as any)[field])
          && !validation.issues.some((issue) => issue.id === `item-total-${index}` && (issue.severity === "warning" || issue.severity === "error"));
        if (!sourceOmittedCalculatedTotal && JSON.stringify(sourceItem[field] ?? null) !== JSON.stringify((item as any)[field] ?? null)) financialFieldStatus[fieldKey] = "MANUAL";
      }
    }
  }
  return {
    ...normalizedInvoice,
    balanceDue: persistedBalanceDue ?? normalizedInvoice.balanceDue,
    status: derivePaymentStatus({ ...normalizedInvoice, balanceDue: paymentBalance }),
    validation,
    philippineInvoiceCompleteness: completeness,
    financialSemantics: validation.monetarySemantics,
    financialFieldStatus,
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
