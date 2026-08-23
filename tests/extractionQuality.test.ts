import test from "node:test";
import assert from "node:assert/strict";
import type { InvoiceData } from "../src/types.ts";
import { chooseBestExtractionCandidate, evaluateExtractionQuality, normalizeCurrency, shouldRunAutomaticRetry } from "../src/utils/extractionQuality.ts";

function candidate(overrides: Partial<InvoiceData> = {}): Partial<InvoiceData> {
  return {
    documentType: "INVOICE",
    invoiceSubtype: "VAT_INVOICE",
    invoiceNumber: "CGM-2026-0087",
    invoiceDate: "2026-08-19",
    currency: "PHP",
    currencySymbol: "₱",
    vendor: { name: "ConcreteGrid Materials Trading", taxRegistration: "VAT" },
    customer: { name: "SouthBridge Engineering and Construction" },
    items: [
      { id: "1", sku: "CEM-40", description: "Portland Cement 40kg", quantity: 300, unitOfMeasure: "bags", unitPrice: 275, total: 82500 },
      { id: "2", sku: "SAND-W", description: "Washed Sand", quantity: 18, unitOfMeasure: "cu.m.", unitPrice: 1450, total: 26100 },
      { id: "3", sku: "GRV-34", description: "3/4 Gravel", quantity: 20, unitOfMeasure: "cu.m.", unitPrice: 1650, total: 33000 },
    ],
    subtotal: 141600,
    totalDiscount: 0,
    totalTax: 16992,
    grandTotal: 158592,
    amountPaid: 0,
    balanceDue: 158592,
    philippineTaxDetails: { invoiceKind: "VAT_INVOICE", sellerRegistration: "VAT", vatableSales: 141600, vatAmount: 16992, zeroRatedSales: 0, vatExemptSales: 0 },
    projectReference: "Sta. Rosa Flood Control Package B",
    ...overrides,
  };
}

test("ConcreteGrid bad candidate is not accepted as a successful extraction", () => {
  const bad = evaluateExtractionQuality({ documentType: "INVOICE", currency: "", items: [], subtotal: 0, totalTax: 0, grandTotal: 0, vendor: { name: "" } }, "VATable Sales ₱141,600 VAT Amount ₱16,992 Total Amount Due ₱158,592");
  assert.equal(bad.requiresRetry, true);
  assert.equal(bad.status, "NEEDS_REVIEW");
  assert.equal(bad.criticalMissing.includes("missing-line-items"), true);
  assert.equal(bad.criticalMissing.includes("missing-currency"), true);
});

test("ConcreteGrid complete candidate is strong and reconciled", () => {
  const good = evaluateExtractionQuality(candidate(), "Item SKU Description Qty Unit Unit Price Amount VATable Sales VAT Amount Total Amount Due");
  assert.equal(good.requiresRetry, false);
  assert.equal(good.status, "GOOD");
  assert.ok(good.score >= 80);
  assert.equal(good.reconciliation.lineItems, "PASS");
  assert.equal(good.reconciliation.subtotal, "PASS");
  assert.equal(good.reconciliation.grandTotal, "PASS");
  assert.equal(good.reconciliation.philippineVat, "PASS");
});

test("candidate selection prefers the better deterministic result", () => {
  const poor = candidate({ items: [], currency: "", subtotal: 0, totalTax: 0, grandTotal: 0, balanceDue: 0 });
  const worse = { documentType: "INVOICE", items: [], vendor: { name: "" }, currency: "", grandTotal: 0 } satisfies Partial<InvoiceData>;
  const selected = chooseBestExtractionCandidate([
    { candidate: poor, quality: evaluateExtractionQuality(poor) },
    { candidate: worse, quality: evaluateExtractionQuality(worse) },
  ]);
  assert.equal(selected?.candidate, poor);
  assert.equal(selected?.quality.requiresRetry, true);
});

test("a good first attempt needs no automatic second attempt", () => {
  const quality = evaluateExtractionQuality(candidate());
  assert.equal(quality.requiresRetry, false);
  assert.equal(shouldRunAutomaticRetry("gemini-3.5-flash-lite", quality), false);
  assert.equal(shouldRunAutomaticRetry("gemini-3.7-flash", quality), false);
  assert.equal(shouldRunAutomaticRetry("gemini-3.5-flash-lite", evaluateExtractionQuality({ documentType: "INVOICE", items: [], currency: "", grandTotal: 0 })), true);
  assert.equal(shouldRunAutomaticRetry("gemini-3.5-flash-lite"), true);
});

test("currency normalization preserves explicit foreign currency and symbols", () => {
  assert.equal(normalizeCurrency("Php"), "PHP");
  assert.equal(normalizeCurrency(undefined, "₱"), "PHP");
  assert.equal(normalizeCurrency("US$"), "USD");
  assert.equal(normalizeCurrency("USD"), "USD");
  assert.equal(normalizeCurrency("Mexican Peso"), "");
  assert.equal(normalizeCurrency(""), "");
});

test("UOM remains separate from quantity", () => {
  const good = candidate();
  assert.equal(good.items?.[0].quantity, 300);
  assert.equal(good.items?.[0].unitOfMeasure, "bags");
  assert.equal(good.items?.[1].quantity, 18);
  assert.equal(good.items?.[1].unitOfMeasure, "cu.m.");
});
