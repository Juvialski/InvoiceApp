import test from "node:test";
import assert from "node:assert/strict";
import type { InvoiceData } from "../src/types.ts";
import { SAMPLE_INVOICES } from "../src/data/sampleInvoices.ts";
import { applyLocalChecks, formatMoney, validateInvoice } from "../src/utils/invoiceLogic.ts";

function invoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    id: "test-invoice",
    documentType: "INVOICE",
    invoiceNumber: "TEST-001",
    invoiceDate: "2026-08-23",
    currency: "PHP",
    vendor: { name: "Test Philippine Supplier", country: "Philippines", taxId: "000-111-222-000" },
    customer: { name: "Test Buyer", country: "Philippines" },
    items: [{ id: "item-1", description: "Test service", quantity: 1, unitPrice: 100000, total: 100000 }],
    subtotal: 100000,
    totalTax: 12000,
    grandTotal: 112000,
    amountPaid: 0,
    balanceDue: 112000,
    extractedAt: "2026-08-23T09:00:00+08:00",
    modelUsed: "test",
    ...overrides,
  };
}

test("PHP formatting defaults to en-PH currency display", () => {
  assert.equal(formatMoney(48500), "₱48,500.00");
});

test("foreign USD invoices remain USD", () => {
  assert.equal(formatMoney(1200, "USD"), "$1,200.00");
  const result = applyLocalChecks(invoice({ currency: "USD", vendor: { name: "Foreign Supplier", country: "United States" }, philippineTaxDetails: undefined, invoiceSubtype: undefined }));
  assert.equal(result.currency, "USD");
  assert.equal(result.validation?.philippineVat?.status, "NOT_APPLICABLE");
});

test("standard Philippine 12% VAT passes", () => {
  const result = applyLocalChecks(invoice({
    invoiceSubtype: "VAT_INVOICE",
    philippineTaxDetails: { invoiceKind: "VAT_INVOICE", sellerRegistration: "VAT", vatableSales: 100000, vatAmount: 12000, zeroRatedSales: 0, vatExemptSales: 0 },
  }));
  assert.equal(result.validation?.status, "PASS");
  assert.equal(result.validation?.philippineVat?.status, "PASS");
});

test("incorrect Philippine VAT is routed to review", () => {
  const result = applyLocalChecks(invoice({
    invoiceSubtype: "VAT_INVOICE",
    totalTax: 11500,
    grandTotal: 111500,
    balanceDue: 111500,
    philippineTaxDetails: { invoiceKind: "VAT_INVOICE", sellerRegistration: "VAT", vatableSales: 100000, vatAmount: 11500 },
  }));
  assert.equal(result.validation?.status, "REVIEW");
  assert.equal(result.validation?.philippineVat?.expectedVat, 12000);
  assert.equal(result.validation?.philippineVat?.difference, -500);
});

test("non-VAT, zero-rated, and VAT-exempt cases do not receive an automatic 12% charge", () => {
  const nonVat = applyLocalChecks(invoice({
    invoiceSubtype: "NON_VAT_INVOICE",
    totalTax: 0,
    subtotal: 18500,
    grandTotal: 18500,
    balanceDue: 18500,
    items: [{ id: "non-vat", description: "Repair", quantity: 1, unitPrice: 18500, taxTreatment: "NON_VAT", total: 18500 }],
    philippineTaxDetails: { invoiceKind: "NON_VAT_INVOICE", sellerRegistration: "NON_VAT", vatAmount: 0 },
  }));
  assert.equal(nonVat.validation?.status, "PASS");

  const zeroRated = applyLocalChecks(invoice({
    philippineTaxDetails: { invoiceKind: "VAT_INVOICE", sellerRegistration: "VAT", vatableSales: 0, vatAmount: 0, zeroRatedSales: 25000, vatExemptSales: 0 },
    items: [{ id: "zero", description: "Export service", quantity: 1, unitPrice: 25000, taxTreatment: "ZERO_RATED", total: 25000 }],
    subtotal: 25000,
    totalTax: 0,
    grandTotal: 25000,
    balanceDue: 25000,
  }));
  assert.equal(zeroRated.validation?.status, "PASS");
  assert.equal(zeroRated.validation?.philippineVat?.expectedVat, 0);

  const exempt = applyLocalChecks(invoice({
    philippineTaxDetails: { invoiceKind: "VAT_INVOICE", sellerRegistration: "VAT", vatableSales: 0, vatAmount: 0, zeroRatedSales: 0, vatExemptSales: 25000 },
    items: [{ id: "exempt", description: "Exempt training", quantity: 1, unitPrice: 25000, taxTreatment: "VAT_EXEMPT", total: 25000 }],
    subtotal: 25000,
    totalTax: 0,
    grandTotal: 25000,
    balanceDue: 25000,
  }));
  assert.equal(exempt.validation?.status, "PASS");
});

test("mixed PH tax treatment reconciles", () => {
  const result = applyLocalChecks(invoice({
    philippineTaxDetails: { invoiceKind: "VAT_INVOICE", sellerRegistration: "VAT", vatableSales: 50000, vatAmount: 6000, zeroRatedSales: 25000, vatExemptSales: 25000 },
    items: [
      { id: "mixed-1", description: "VATable", quantity: 1, unitPrice: 50000, taxTreatment: "VATABLE", total: 50000 },
      { id: "mixed-2", description: "Zero-rated", quantity: 1, unitPrice: 25000, taxTreatment: "ZERO_RATED", total: 25000 },
      { id: "mixed-3", description: "Exempt", quantity: 1, unitPrice: 25000, taxTreatment: "VAT_EXEMPT", total: 25000 },
    ],
    totalTax: 6000,
    grandTotal: 106000,
    balanceDue: 106000,
  }));
  assert.equal(result.validation?.status, "PASS");
  assert.equal(result.validation?.philippineVat?.status, "PASS");
});

test("withholding remains separate from invoice total", () => {
  const result = applyLocalChecks(invoice({ withholdingTaxAmount: 2000, netAmountPayable: 110000 }));
  assert.equal(result.grandTotal, 112000);
  assert.equal(result.netAmountPayable, 110000);
  assert.equal(result.validation?.status, "PASS");
});

test("missing currency is reviewed instead of inferred from a Philippine address", () => {
  const result = applyLocalChecks(invoice({ currency: "", currencySymbol: undefined }));
  assert.equal(result.currency, "");
  assert.equal(result.validation?.issues.some((issue) => issue.id === "missing-currency"), true);
});

test("pre-Philippine stored invoice shape remains readable", () => {
  const legacy = invoice({
    currency: "USD",
    vendor: { name: "Legacy Vendor", address: "Old address", city: "New York", state: "NY", country: "United States" },
    customer: { name: "Legacy Customer" },
    philippineTaxDetails: undefined,
    philippineInvoiceCompleteness: undefined,
  });
  assert.doesNotThrow(() => applyLocalChecks(legacy));
  assert.equal(applyLocalChecks(legacy).philippineInvoiceCompleteness?.status, "NOT_APPLICABLE");
});

test("PH completeness is a review aid and flags missing required fields", () => {
  const complete = applyLocalChecks(SAMPLE_INVOICES[0].previewData);
  assert.equal(complete.philippineInvoiceCompleteness?.status, "COMPLETE");
  assert.match(complete.philippineInvoiceCompleteness?.disclaimer || "", /not a legal certification/i);

  const missingTin = applyLocalChecks(invoice({ vendor: { name: "Supplier", country: "Philippines" }, philippineTaxDetails: { invoiceKind: "VAT_INVOICE", sellerRegistration: "VAT", vatableSales: 100000, vatAmount: 12000 } }));
  assert.equal(missingTin.philippineInvoiceCompleteness?.status, "MISSING_INFORMATION");
  assert.equal(missingTin.philippineInvoiceCompleteness?.items.some((item) => item.id === "seller-tin" && item.status === "MISSING_INFORMATION"), true);
});

test("all demo presets except the intentional validation fixture pass arithmetic checks", () => {
  const results = SAMPLE_INVOICES.map((preset) => applyLocalChecks(preset.previewData));
  assert.deepEqual(results.slice(0, 4).map((result) => result.validation?.status), ["PASS", "PASS", "PASS", "PASS"]);
  assert.equal(results[4].validation?.status, "REVIEW");
  assert.equal(results[4].validation?.issues.some((issue) => issue.id === "grand-total-mismatch"), true);
});
