import test from "node:test";
import assert from "node:assert/strict";
import type { FinancialFxSnapshot, InvoiceData } from "../src/types.ts";
import { getInvoiceDisplayIdentity } from "../src/utils/invoiceDisplay.ts";
import { getInvoiceWorkspaceMode } from "../src/utils/invoiceWorkspace.ts";

function invoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    id: "display-test",
    invoiceNumber: "TEST-001",
    invoiceDate: "2026-08-23",
    currency: "PHP",
    vendor: { name: "Test Supplier" },
    customer: { name: "Test Buyer" },
    items: [],
    subtotal: 0,
    totalTax: 0,
    grandTotal: 0,
    extractedAt: "2026-08-23T09:00:00+08:00",
    modelUsed: "test",
    ...overrides,
  };
}

test("display identity prioritizes vendor, invoice number, and readable date", () => {
  const display = getInvoiceDisplayIdentity(invoice({
    invoiceNumber: "CGM-2026-0087",
    invoiceDate: "2026-08-19",
    vendor: { registeredName: "ConcreteGrid Materials Trading", name: "Short name" },
  }));

  assert.equal(display.primaryLabel, "ConcreteGrid Materials Trading");
  assert.equal(display.invoiceLabel, "Invoice # CGM-2026-0087");
  assert.equal(display.dateLabel, "Aug 19, 2026");
});

test("missing invoice number never promotes the source filename", () => {
  const display = getInvoiceDisplayIdentity(invoice({
    invoiceNumber: "",
    fileName: "8f50c2c7-0680-4488-b6cf-634f01a5fb78.png",
    vendor: { name: "PrimeSpan Structural Supply Inc." },
  }));

  assert.equal(display.primaryLabel, "PrimeSpan Structural Supply Inc.");
  assert.equal(display.invoiceLabel, "Invoice number missing");
  assert.equal(display.sourceFileLabel, "8f50c2c7-0680-4488-b6cf-634f01a5fb78.png");
});

test("invoice number is useful identity when vendor is unavailable", () => {
  assert.equal(getInvoiceDisplayIdentity(invoice({ vendor: { name: "" }, invoiceNumber: "INV-42" })).primaryLabel, "INV-42");
  assert.equal(getInvoiceDisplayIdentity(invoice({ vendor: { name: "" }, invoiceNumber: "", fileName: "uuid.png" })).primaryLabel, "Unknown vendor");
});

test("amount display distinguishes missing totals, genuine zero, and missing currency", () => {
  assert.equal(getInvoiceDisplayIdentity(invoice({ grandTotal: 0, extractionQuality: { criticalMissing: ["missing-grand-total"] } as InvoiceData["extractionQuality"] })).amountLabel, "Amount unclear");
  assert.equal(getInvoiceDisplayIdentity(invoice({ grandTotal: 0, extractionQuality: { score: 95, completeness: 100, status: "GOOD", requiresRetry: false, reasons: [], criticalMissing: [], lineItemCount: 0, populatedFieldCount: 0, reconciliation: { lineItems: "NOT_APPLICABLE", subtotal: "NOT_APPLICABLE", grandTotal: "NOT_APPLICABLE", balance: "NOT_APPLICABLE", philippineVat: "NOT_APPLICABLE" } } })).amountLabel, "₱0.00");
  assert.equal(getInvoiceDisplayIdentity(invoice({ grandTotal: 158592 })).amountLabel, "₱158,592.00");
  assert.equal(getInvoiceDisplayIdentity(invoice({ grandTotal: 1000, currency: "USD" })).amountLabel, "$1,000.00");
  assert.equal(getInvoiceDisplayIdentity(invoice({ grandTotal: 1000, currency: "" })).amountLabel, "Currency unclear");
});

test("PHP reporting display uses the exact confirmed invoice FX snapshot and fails closed when absent", () => {
  const sourceInvoice = invoice({ id: "usd-invoice", grandTotal: 1000, currency: "USD" });
  const snapshot: FinancialFxSnapshot = {
    id: "fx-1", sourceType: "SUPPLIER_INVOICE", sourceId: sourceInvoice.id, sourceAmount: 1000,
    sourceCurrency: "USD", baseCurrency: "PHP", rate: 56.25, rateDate: "2026-08-23", rateSource: "MANUAL",
    confirmedAt: "2026-08-23T09:00:00+08:00", createdAt: "2026-08-23T09:00:00+08:00", baseAmount: 56_250,
  };
  const converted = getInvoiceDisplayIdentity(sourceInvoice, { reportingCurrency: "PHP", financialFxSnapshots: [snapshot] });
  assert.equal(converted.amountLabel, "₱56,250.00");
  assert.equal(converted.currencyLabel, "Source $1,000.00");
  const blocked = getInvoiceDisplayIdentity(sourceInvoice, { reportingCurrency: "PHP" });
  assert.equal(blocked.amountLabel, "PHP conversion required");
  assert.equal(blocked.currencyLabel, "Source $1,000.00");
});

test("workspace mode follows invoice review status", () => {
  assert.equal(getInvoiceWorkspaceMode({ reviewStatus: "NEEDS_REVIEW" }), "review");
  assert.equal(getInvoiceWorkspaceMode({ reviewStatus: "VERIFIED" }), "verified");
});
