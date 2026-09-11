import test from "node:test";
import assert from "node:assert/strict";
import type { InvoiceData, PurchaseOrder } from "../src/types.ts";
import { applyLocalChecks } from "../src/utils/invoiceLogic.ts";
import {
  explicitInvoiceTaxAmount,
  invoicePreTaxComparisonAmount,
  reconcileInvoiceMonetarySemantics,
} from "../src/utils/invoiceMonetarySemantics.ts";
import { buildLineItemComparisons, evaluatePurchaseOrderMatch, validateMatchLineAssociations } from "../src/utils/purchaseOrderMatching.ts";
import { getSupplierInvoiceExpenseReadiness } from "../src/utils/supplierExpenseWorkspace.ts";

function invoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    id: "monetary-invoice",
    documentType: "INVOICE",
    invoiceNumber: "MON-001",
    invoiceDate: "2026-09-11",
    currency: "PHP",
    vendor: { name: "Supplier", vendorId: "vendor-1" },
    customer: { name: "Unrelated source buyer" },
    items: [{ id: "line-1", description: "Materials", quantity: 1, unitPrice: 100, discount: 0, total: 100 }],
    subtotal: 100,
    totalDiscount: 0,
    totalTax: 0,
    shippingFee: 0,
    otherFees: 0,
    grandTotal: 100,
    amountPaid: 0,
    balanceDue: 100,
    category: "Materials",
    description: "Materials",
    extractedAt: "2026-09-11T00:00:00.000Z",
    modelUsed: "test",
    reviewStatus: "NEEDS_REVIEW",
    ...overrides,
  };
}

function issueIds(value: InvoiceData) {
  return (applyLocalChecks(value).validation?.issues || []).map((issue) => issue.id).sort();
}

test("VAT-exclusive single-line invoices add explicit tax once", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({ totalTax: 12, grandTotal: 112, balanceDue: 112 }));
  assert.equal(result.semantics.taxInclusion, "ADDED_TO_TOTAL");
  assert.equal(result.statuses.lineItems, "PASS");
  assert.equal(result.statuses.subtotal, "PASS");
  assert.equal(result.statuses.grandTotal, "PASS");
  assert.equal(result.issues.some((issue) => issue.severity === "warning"), false);
  const checked = applyLocalChecks(invoice({ totalTax: 12, grandTotal: 112, balanceDue: 112 }));
  assert.equal(checked.financialFieldStatus?.grandTotal, "KNOWN");
  assert.equal(checked.financialFieldStatus?.["items.0.total"], "KNOWN");
});

test("VAT-inclusive single-line invoices do not add VAT twice", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({
    items: [{ id: "line-1", description: "Materials", quantity: 1, unitPrice: 112, discount: 0, total: 112 }],
    subtotal: 112,
    totalTax: 12,
    grandTotal: 112,
    philippineTaxDetails: { vatInclusive: true, vatAmount: 12 },
  }));
  assert.equal(result.semantics.taxInclusion, "INCLUDED_IN_TOTAL");
  assert.equal(result.semantics.lineTotalBasis, "TAX_INCLUSIVE");
  assert.equal(result.statuses.subtotal, "PASS");
  assert.equal(result.statuses.grandTotal, "PASS");
  assert.equal(result.issues.some((issue) => issue.id === "subtotal-mismatch" || issue.id === "grand-total-mismatch"), false);
});

test("VAT-inclusive line totals reconcile with a separately disclosed pre-tax subtotal", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({
    items: [{ id: "line-1", description: "Materials", quantity: 1, unitPrice: 112, discount: 0, total: 112 }],
    subtotal: 100,
    totalTax: 12,
    grandTotal: 112,
    philippineTaxDetails: { vatInclusive: true, vatAmount: 12 },
  }));
  assert.equal(result.semantics.lineTotalBasis, "TAX_INCLUSIVE");
  assert.equal(result.semantics.subtotalBasis, "PRE_TAX");
  assert.equal(result.statuses.subtotal, "PASS");
  assert.equal(result.statuses.grandTotal, "PASS");
});

test("VAT-inclusive multi-line invoices reconcile without double-counting disclosed tax", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({
    items: [
      { id: "line-1", description: "Materials", quantity: 1, unitPrice: 112, discount: 0, total: 112 },
      { id: "line-2", description: "Delivery", quantity: 1, unitPrice: 56, discount: 0, total: 56 },
    ],
    subtotal: 150,
    totalTax: 18,
    grandTotal: 168,
    philippineTaxDetails: { vatInclusive: true, vatAmount: 18 },
  }));
  assert.equal(result.semantics.lineTotalBasis, "TAX_INCLUSIVE");
  assert.equal(result.semantics.subtotalBasis, "PRE_TAX");
  assert.equal(result.statuses.subtotal, "PASS");
  assert.equal(result.statuses.grandTotal, "PASS");
});

test("VAT-inclusive lines reconcile with a discounted pre-tax subtotal", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({
    items: [{ id: "line-1", description: "Materials", quantity: 1, unitPrice: 112, discount: 0, total: 112 }],
    subtotal: 90,
    totalDiscount: 10,
    totalTax: 12,
    grandTotal: 102,
    philippineTaxDetails: { vatInclusive: true, vatAmount: 12 },
  }));
  assert.equal(result.semantics.subtotalBasis, "PRE_TAX");
  assert.equal(result.semantics.discountIncludedInSubtotal, true);
  assert.equal(result.statuses.subtotal, "PASS");
  assert.equal(result.statuses.grandTotal, "PASS");
});

test("VAT-exclusive multi-line totals use the sum of source line amounts", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({
    items: [
      { id: "line-1", description: "A", quantity: 2, unitPrice: 25, discount: 0, total: 50 },
      { id: "line-2", description: "B", quantity: 1, unitPrice: 50, discount: 0, total: 50 },
    ],
    subtotal: 100,
    totalTax: 12,
    grandTotal: 112,
  }));
  assert.equal(result.lineTotalSum, 100);
  assert.equal(result.statuses.subtotal, "PASS");
  assert.equal(result.statuses.grandTotal, "PASS");
});

test("zero-tax invoices remain pre-tax and receive no automatic tax charge", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({
    invoiceSubtype: "NON_VAT_INVOICE",
    totalTax: 0,
    grandTotal: 100,
    philippineTaxDetails: { invoiceKind: "NON_VAT_INVOICE", sellerRegistration: "NON_VAT", vatAmount: 0 },
  }));
  assert.equal(result.semantics.taxInclusion, "NOT_APPLICABLE");
  assert.equal(result.statuses.grandTotal, "PASS");
});

test("an explicit zero tax breakdown is treated as non-chargeable tax evidence", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({
    totalTax: null,
    taxBreakdown: [{ name: "VAT", amount: 0 }],
    grandTotal: 100,
  }));
  assert.equal(result.semantics.taxInclusion, "NOT_APPLICABLE");
  assert.equal(result.semantics.lineTotalBasis, "PRE_TAX");
  assert.equal(result.statuses.grandTotal, "PASS");
});

test("invoice-level discounts are subtracted once from a pre-tax subtotal", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({ totalDiscount: 10, totalTax: 12, grandTotal: 102 }));
  assert.equal(result.statuses.grandTotal, "PASS");
  assert.equal(result.issues.some((issue) => issue.id === "grand-total-mismatch"), false);
});

test("a subtotal that already includes the invoice discount is not discounted twice", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({ subtotal: 90, totalDiscount: 10, totalTax: 12, grandTotal: 102 }));
  assert.equal(result.semantics.discountIncludedInSubtotal, true);
  assert.equal(result.statuses.subtotal, "PASS");
  assert.equal(result.statuses.grandTotal, "PASS");
});

test("line-level discounts are reconciled against the source line total", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({
    items: [{ id: "line-1", description: "Discounted", quantity: 2, unitPrice: 60, discount: 20, total: 100 }],
  }));
  assert.equal(result.statuses.lineItems, "PASS");
  assert.equal(result.issues.some((issue) => issue.id === "item-total-0"), false);
});

test("a pre-tax unit price and a tax-inclusive source line amount are not falsely compared", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({
    items: [{ id: "line-1", description: "Mixed basis", quantity: 1, unitPrice: 100, discount: 0, total: 112 }],
    totalTax: 12,
    grandTotal: 112,
    financialSemantics: {
      unitPriceBasis: "PRE_TAX",
      lineTotalBasis: "TAX_INCLUSIVE",
      subtotalBasis: "PRE_TAX",
      taxInclusion: "INCLUDED_IN_TOTAL",
      discountIncludedInSubtotal: false,
      payableBasis: "GROSS_INVOICE",
      determination: "EXPLICIT",
    },
  }));
  assert.equal(result.statuses.lineItems, "PASS");
  assert.equal(result.issues.some((issue) => issue.id === "item-total-0"), false);
});

test("centavo-level subtotal rounding is accepted", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({
    items: [
      { id: "line-1", description: "A", quantity: 1, unitPrice: 33.33, discount: 0, total: 33.33 },
      { id: "line-2", description: "B", quantity: 1, unitPrice: 66.68, discount: 0, total: 66.68 },
    ],
    subtotal: 100,
    grandTotal: 100,
  }));
  assert.equal(result.statuses.subtotal, "PASS");
  assert.equal(result.issues.some((issue) => issue.id === "subtotal-mismatch"), false);
});

test("a missing subtotal remains unresolved while valid lines and gross total reconcile", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({
    subtotal: null,
    totalTax: 12,
    grandTotal: 112,
    philippineTaxDetails: { vatInclusive: false, vatAmount: 12 },
  }));
  assert.equal(result.calculatedSubtotal, 100);
  assert.equal(result.statuses.subtotal, "PASS");
  assert.equal(result.statuses.grandTotal, "PASS");
  assert.equal(result.issues.some((issue) => issue.id === "subtotal-mismatch"), false);
  assert.ok(result.issues.some((issue) => issue.id === "subtotal-source-omitted" && issue.severity === "info"));
});

test("an explicit tax amount is usable without inventing a tax rate", () => {
  const source = invoice({ invoiceSubtype: "VAT_INVOICE", totalTax: 12, grandTotal: 112, balanceDue: 112, philippineTaxDetails: { vatAmount: 12 } });
  assert.equal(explicitInvoiceTaxAmount(source), 12);
  const checked = applyLocalChecks(source);
  assert.ok(checked.validation?.issues.some((issue) => issue.id === "ph-vat-rate-not-evaluated" && issue.severity === "info"));
  assert.equal(checked.validation?.status, "PASS");
});

test("an explicit gross total with ambiguous tax classification gets an advisory, not a false mismatch", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({ totalTax: null, grandTotal: 100, financialSemantics: undefined }));
  assert.equal(result.issues.some((issue) => issue.id === "grand-total-mismatch"), false);
  assert.ok(result.issues.some((issue) => issue.id === "grand-total-arithmetic-unresolved" && issue.severity === "info"));
});

test("a direct subtotal difference with unknown tax bases remains an advisory", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({ subtotal: 90, totalTax: null, grandTotal: 100, financialSemantics: undefined }));
  assert.equal(result.issues.some((issue) => issue.id === "subtotal-mismatch" && issue.severity === "warning"), false);
  assert.ok(result.issues.some((issue) => issue.id === "subtotal-basis-unresolved" && issue.severity === "info"));
});

test("multi-line mixed rounding stays within the aggregate currency tolerance", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({
    items: [
      { id: "line-1", description: "A", quantity: 3, unitPrice: 33.333, discount: 0, total: 100 },
      { id: "line-2", description: "B", quantity: 2, unitPrice: 10.005, discount: 0, total: 20.01 },
    ],
    subtotal: 120.01,
    grandTotal: 120.01,
  }));
  assert.equal(result.statuses.subtotal, "PASS");
  assert.equal(result.statuses.lineItems, "PASS");
});

test("withholding remains separate from gross invoice and Expense basis", () => {
  const source = invoice({ totalTax: 12, grandTotal: 112, withholdingTaxAmount: 2, netAmountPayable: 110 });
  const result = reconcileInvoiceMonetarySemantics(source);
  assert.equal(result.statuses.withholding, "PASS");
  assert.equal(source.grandTotal, 112);
  assert.deepEqual(invoicePreTaxComparisonAmount(source), { amount: 100, basis: "PRE_TAX" });
});

test("null withholding evidence stays unresolved instead of creating a gross net payable", () => {
  const checked = applyLocalChecks(invoice({
    withholdingTaxAmount: null,
    netAmountPayable: null,
    philippineTaxDetails: { withholdingTaxAmount: null, netAmountPayable: null },
  }));
  assert.equal(checked.withholdingTaxAmount, null);
  assert.equal(checked.netAmountPayable, null);
  assert.equal(checked.financialFieldStatus?.withholdingTaxAmount, undefined);
  assert.equal(checked.financialFieldStatus?.netAmountPayable, undefined);
});

test("manual correction of a source line amount surfaces a genuine mismatch", () => {
  const corrected = applyLocalChecks(invoice({
    items: [{ id: "line-1", description: "Materials", quantity: 1, unitPrice: 100, discount: 0, total: 101 }],
  }));
  assert.ok(corrected.validation?.issues.some((issue) => issue.id === "item-total-0" && issue.severity === "warning"));
});

test("upload and email intake use identical monetary reconciliation semantics", () => {
  const uploaded = applyLocalChecks(invoice({ sourceType: "UPLOAD" }));
  const emailed = applyLocalChecks(invoice({ sourceType: "EMAIL", sourceMetadata: { sender: "ap@supplier.test" } }));
  assert.deepEqual(issueIds(uploaded), issueIds(emailed));
  assert.deepEqual(uploaded.financialSemantics, emailed.financialSemantics);
});

test("PO matching compares an explicitly taxed invoice on a pre-tax basis", () => {
  const po: PurchaseOrder = {
    id: "po-1",
    poNumber: "PO-1",
    vendorId: "vendor-1",
    projectId: "project-1",
    currency: "PHP",
    status: "ISSUED",
    totalAmount: 100,
    lines: [{ id: "po-line-1", purchaseOrderId: "po-1", lineNumber: 1, description: "Materials", quantity: 1, unit: "pcs", unitPrice: 100, amount: 100 }],
  };
  const result = evaluatePurchaseOrderMatch(invoice({ totalTax: 12, grandTotal: 112 }), po);
  assert.ok(result.matchReasons.some((reason) => /pre-tax/i.test(reason)));
  assert.equal(result.warnings.some((warning) => /exceeds purchase order total/i.test(warning)), false);
});

test("PO line matching does not invent an amount when the source line total is missing", () => {
  const po: PurchaseOrder = {
    id: "po-1",
    poNumber: "PO-1",
    vendorId: "vendor-1",
    projectId: "project-1",
    currency: "PHP",
    status: "ISSUED",
    totalAmount: 100,
    lines: [{ id: "po-line-1", purchaseOrderId: "po-1", lineNumber: 1, description: "Materials", quantity: 1, unit: "pcs", unitPrice: 100, amount: 100 }],
  };
  const result = evaluatePurchaseOrderMatch(invoice({ items: [{ id: "line-1", description: "Materials", quantity: 1, unitPrice: 100, total: null }] }), po);
  assert.equal(result.lineComparisons[0]?.invoiceAmount, null);
  assert.equal(result.lineComparisons[0]?.warnings.includes("Invoice line amount exceeds PO line amount"), false);
});

test("PO matching leaves unknown quantity, amount, and grand total unresolved", () => {
  const po: PurchaseOrder = {
    id: "po-1",
    poNumber: "PO-1",
    vendorId: "vendor-1",
    projectId: "project-1",
    currency: "PHP",
    status: "ISSUED",
    totalAmount: 100,
    lines: [{ id: "po-line-1", purchaseOrderId: "po-1", lineNumber: 1, description: "Materials", quantity: 1, unit: "pcs", unitPrice: 100, amount: 100 }],
  };
  const source = invoice({ grandTotal: null, items: [{ id: "line-1", description: "Materials", quantity: null, unitPrice: null, total: null }] });
  const comparison = buildLineItemComparisons(source, po)[0]!;
  assert.equal(comparison.invoiceQuantity, null);
  assert.equal(comparison.invoiceUnitPrice, null);
  assert.equal(comparison.invoiceAmount, null);
  const association = validateMatchLineAssociations(source, po, [{ invoiceLineId: "line-1", purchaseOrderLineId: "po-line-1", matchedAmount: 100 }]);
  assert.equal(association.isValid, true);
});

test("missing/partial legacy monetary fields remain readable without becoming zero evidence", () => {
  const legacy = invoice({ items: undefined as unknown as InvoiceData["items"], subtotal: null, totalTax: null, grandTotal: null, amountDue: 0 });
  const checked = applyLocalChecks(legacy);
  assert.deepEqual(checked.items, []);
  assert.equal(checked.grandTotal, null);
  assert.equal(checked.financialFieldStatus?.grandTotal, undefined);
  assert.equal(checked.validation?.issues.some((issue) => issue.id === "grand-total-mismatch"), false);
});

test("calculated source omissions stay calculated until a human changes the value", () => {
  const sourceOmitted = invoice({
    subtotal: null,
    totalTax: 12,
    grandTotal: 112,
    balanceDue: null,
    financialFieldStatus: { subtotal: "CALCULATED" },
    aiSnapshot: { ...invoice({ subtotal: null }), subtotal: null },
  });
  const calculated = applyLocalChecks(sourceOmitted);
  assert.equal(calculated.financialFieldStatus?.subtotal, "CALCULATED");
  const corrected = applyLocalChecks({ ...calculated, subtotal: 101 });
  assert.equal(corrected.financialFieldStatus?.subtotal, "MANUAL");
});

test("buyer/customer evidence is optional and never blocks supplier readiness", () => {
  const readiness = getSupplierInvoiceExpenseReadiness(invoice({ customer: undefined }));
  assert.equal(readiness.complete, true);
  assert.equal(readiness.readyToLink, false, "the fixture is still unverified, not buyer-blocked");
  assert.equal(readiness.issues.some((issue) => issue.field === "customer"), false);
});

test("a meaningful known subtotal mismatch remains a warning", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({ subtotal: 150, grandTotal: 150 }));
  assert.ok(result.issues.some((issue) => issue.id === "subtotal-mismatch" && issue.severity === "warning"));
});

test("explicit amount due is preserved separately from calculated gross balance", () => {
  const result = reconcileInvoiceMonetarySemantics(invoice({ grandTotal: 112, totalTax: 12, amountDue: 110, balanceDue: null, amountPaid: null, withholdingTaxAmount: 2 }));
  assert.ok(result.issues.some((issue) => issue.id === "amount-due-source-preserved" && issue.severity === "info"));
  assert.equal(result.issues.some((issue) => issue.id === "balance-mismatch"), false);
});
