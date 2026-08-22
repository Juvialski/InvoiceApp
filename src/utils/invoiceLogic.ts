import { InvoiceData, ValidationIssue, ValidationSummary } from "../types";

const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const nearlyEqual = (a: number, b: number, tolerance = 0.05) => Math.abs(roundMoney(a) - roundMoney(b)) <= tolerance;

export function validateInvoice(invoice: InvoiceData): ValidationSummary {
  const issues: ValidationIssue[] = [];
  const items = invoice.items || [];

  if (!invoice.invoiceNumber || invoice.invoiceNumber === "INV-UNKNOWN") {
    issues.push({ id: "missing-invoice-number", severity: "warning", field: "invoiceNumber", message: "Invoice number was not confidently found." });
  }
  if (!invoice.invoiceDate) {
    issues.push({ id: "missing-invoice-date", severity: "warning", field: "invoiceDate", message: "Invoice date is missing." });
  }
  if (!invoice.vendor?.name || invoice.vendor.name === "Vendor Unknown") {
    issues.push({ id: "missing-vendor", severity: "warning", field: "vendor.name", message: "Vendor name needs review." });
  }
  if (items.length === 0) {
    issues.push({ id: "no-line-items", severity: "warning", field: "items", message: "No line items were extracted." });
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
  };
}

export function derivePaymentStatus(invoice: Pick<InvoiceData, "grandTotal" | "amountPaid" | "balanceDue" | "dueDate">): string {
  const total = Number(invoice.grandTotal) || 0;
  const paid = Number(invoice.amountPaid) || 0;
  const balance = invoice.balanceDue === undefined ? Math.max(0, total - paid) : Number(invoice.balanceDue) || 0;
  if (total > 0 && balance <= 0.01) return "PAID";
  if (paid > 0 && balance > 0.01) return "PARTIALLY_PAID";
  if (invoice.dueDate) {
    const due = new Date(`${invoice.dueDate}T23:59:59`);
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now() && balance > 0.01) return "OVERDUE";
  }
  return "UNPAID";
}

export function findPossibleDuplicate(invoice: InvoiceData, existing: InvoiceData[]): InvoiceData | undefined {
  const number = (invoice.invoiceNumber || "").trim().toLowerCase();
  const vendor = (invoice.vendor?.name || invoice.vendor?.companyName || "").trim().toLowerCase();
  return existing.find((candidate) => {
    if (candidate.id === invoice.id) return false;
    const sameNumber = number && (candidate.invoiceNumber || "").trim().toLowerCase() === number;
    const sameVendor = vendor && (candidate.vendor?.name || candidate.vendor?.companyName || "").trim().toLowerCase() === vendor;
    const sameCurrency = (candidate.currency || "").toUpperCase() === (invoice.currency || "").toUpperCase();
    const sameTotal = Math.abs((Number(candidate.grandTotal) || 0) - (Number(invoice.grandTotal) || 0)) <= 0.05;
    return sameNumber && sameVendor && sameCurrency && sameTotal;
  });
}

export function applyLocalChecks(invoice: InvoiceData): InvoiceData {
  const validation = validateInvoice(invoice);
  const lowConfidence = invoice.confidenceScore !== undefined && invoice.confidenceScore < 90;
  return {
    ...invoice,
    status: derivePaymentStatus(invoice),
    validation,
    reviewStatus: validation.status === "PASS" && !lowConfidence ? invoice.reviewStatus || "VERIFIED" : "NEEDS_REVIEW",
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

export function formatMoney(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount || 0);
  } catch {
    return `${currency} ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
