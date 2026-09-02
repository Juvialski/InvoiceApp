import test from "node:test";
import assert from "node:assert/strict";
import type { InvoiceData, PurchaseOrder, PurchaseOrderReceipt } from "../src/types.ts";
import {
  evaluatePurchaseOrderMatch,
  evaluatePurchaseOrderMatchCandidates,
  normalizePoNumber,
  validateMatchLineAssociations,
} from "../src/utils/purchaseOrderMatching.ts";

function createMockInvoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    id: "inv-101",
    invoiceNumber: "INV-2026-001",
    invoiceDate: "2026-03-01",
    currency: "PHP",
    grandTotal: 50000,
    subtotal: 50000,
    totalTax: 0,
    vendor: {
      name: "Acme Industrial Supplies Inc.",
    },
    customer: {
      name: "Engoryx Client Corp",
    },
    items: [
      {
        id: "inv-line-1",
        itemNumber: 1,
        description: "Standard Steel Rebar 12mm",
        quantity: 50,
        unitPrice: 1000,
        total: 50000,
      },
    ],
    extractedAt: "2026-03-01T10:00:00Z",
    modelUsed: "gemini-2.5-flash",
    ...overrides,
  };
}

function createMockPurchaseOrder(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  const poId = overrides.id || "po-501";
  return {
    id: poId,
    companyId: "comp-1",
    poNumber: "PO-2026-501",
    vendorId: "vend-1",
    projectId: "proj-1",
    currency: "PHP",
    status: "ISSUED",
    totalAmount: 50000,
    lines: [
      {
        id: "pol-1",
        purchaseOrderId: poId,
        lineNumber: 1,
        description: "Standard Steel Rebar 12mm",
        quantity: 50,
        unit: "pcs",
        unitPrice: 1000,
        amount: 50000,
        createdAt: "2026-02-15T08:00:00Z",
        updatedAt: "2026-02-15T08:00:00Z",
      },
    ],
    createdAt: "2026-02-15T08:00:00Z",
    updatedAt: "2026-02-15T08:00:00Z",
    ...overrides,
  };
}

test("purchaseOrderMatchingDomain: normalizePoNumber removes punctuation and whitespace, converting to uppercase", () => {
  assert.equal(normalizePoNumber(" PO-2026-001 "), "PO2026001");
  assert.equal(normalizePoNumber("po_#2026/abc"), "PO2026ABC");
  assert.equal(normalizePoNumber(null), "");
  assert.equal(normalizePoNumber(""), "");
});

test("purchaseOrderMatchingDomain: scoring exact PO number match awards +60 points", () => {
  const invoice = createMockInvoice({ purchaseOrderNumber: "PO-2026-501" });
  const po = createMockPurchaseOrder({ poNumber: "po 2026 501" });

  const result = evaluatePurchaseOrderMatch(invoice, po);
  assert.ok(result.score >= 60, `Score expected >= 60, got ${result.score}`);
  assert.ok(result.matchReasons.some((r) => r.includes("Exact purchase order number match")));
});

test("purchaseOrderMatchingDomain: scoring resolved vendor match awards +25 points and permits confirmation", () => {
  const invoice = createMockInvoice({
    purchaseOrderNumber: "PO-2026-501",
    ...({ vendorId: "vend-1" } as any),
  });
  const po = createMockPurchaseOrder({ vendorId: "vend-1" });

  const result = evaluatePurchaseOrderMatch(invoice, po);
  assert.equal(result.vendorMatch, "EXACT");
  assert.equal(result.isEligibleForConfirmation, true);
  assert.ok(result.matchReasons.some((r) => r.includes("Authoritative vendor match")));
});

test("purchaseOrderMatchingDomain: vendor mismatch blocks confirmation and adds warning", () => {
  const invoice = createMockInvoice({
    purchaseOrderNumber: "PO-2026-501",
    ...({ vendorId: "vend-wrong" } as any),
  });
  const po = createMockPurchaseOrder({ vendorId: "vend-1" });

  const result = evaluatePurchaseOrderMatch(invoice, po);
  assert.equal(result.vendorMatch, "MISMATCH");
  assert.equal(result.isEligibleForConfirmation, false);
  assert.match(result.ineligibilityReason || "", /Vendor mismatch/i);
  assert.ok(result.warnings.some((w) => w.includes("Vendor mismatch")));
});

test("purchaseOrderMatchingDomain: unresolved vendor with matching name awards +15 points but requires vendor resolution", () => {
  const invoice = createMockInvoice({
    purchaseOrderNumber: "PO-2026-501",
    vendor: { name: "Acme Industrial Supplies" },
  });
  const po = createMockPurchaseOrder({ vendorId: "vend-1" });
  const vendors = [{ id: "vend-1", name: "Acme Industrial Supplies Inc." }];

  const result = evaluatePurchaseOrderMatch(invoice, po, { vendors });
  assert.equal(result.vendorMatch, "NAME_ONLY");
  assert.equal(result.isEligibleForConfirmation, false);
  assert.match(result.ineligibilityReason || "", /vendor must be resolved/i);
  assert.ok(result.matchReasons.some((r) => r.includes("Vendor name matches")));
});

test("purchaseOrderMatchingDomain: currency mismatch strictly blocks confirmation", () => {
  const invoice = createMockInvoice({
    currency: "USD",
    ...({ vendorId: "vend-1" } as any),
  });
  const po = createMockPurchaseOrder({ currency: "PHP", vendorId: "vend-1" });

  const result = evaluatePurchaseOrderMatch(invoice, po);
  assert.equal(result.currencyMatch, false);
  assert.equal(result.isEligibleForConfirmation, false);
  assert.match(result.ineligibilityReason || "", /Currency mismatch/i);
  assert.ok(result.warnings.includes("Currency mismatch"));
});

test("purchaseOrderMatchingDomain: lifecycle filtering rejects DRAFT, APPROVED, CANCELLED POs and VOID invoices", () => {
  const invoice = createMockInvoice({ ...({ vendorId: "vend-1" } as any) });

  const poDraft = createMockPurchaseOrder({ status: "DRAFT" });
  const poApproved = createMockPurchaseOrder({ status: "APPROVED" });
  const poCancelled = createMockPurchaseOrder({ status: "CANCELLED" });
  const poIssued = createMockPurchaseOrder({ status: "ISSUED" });
  const poClosed = createMockPurchaseOrder({ status: "CLOSED" });

  assert.equal(evaluatePurchaseOrderMatch(invoice, poDraft).isEligibleForConfirmation, false);
  assert.equal(evaluatePurchaseOrderMatch(invoice, poApproved).isEligibleForConfirmation, false);
  assert.equal(evaluatePurchaseOrderMatch(invoice, poCancelled).isEligibleForConfirmation, false);
  assert.equal(evaluatePurchaseOrderMatch(invoice, poIssued).isEligibleForConfirmation, true);
  assert.equal(evaluatePurchaseOrderMatch(invoice, poClosed).isEligibleForConfirmation, true);

  const voidInvoice = createMockInvoice({
    lifecycleStatus: "VOID" as any,
    ...({ vendorId: "vend-1" } as any),
  });
  assert.equal(evaluatePurchaseOrderMatch(voidInvoice, poIssued).isEligibleForConfirmation, false);
  assert.match(evaluatePurchaseOrderMatch(voidInvoice, poIssued).ineligibilityReason || "", /void/i);
});

test("purchaseOrderMatchingDomain: line item comparisons integrate receipts and surface warnings", () => {
  const invoice = createMockInvoice({
    ...({ vendorId: "vend-1" } as any),
    items: [
      {
        id: "inv-item-1",
        itemNumber: 1,
        description: "Standard Steel Rebar 12mm",
        quantity: 60, // exceeds PO quantity (50) and received qty (30)
        unitPrice: 1100, // exceeds PO unit price (1000)
        total: 66000, // exceeds PO line amount (50000)
      },
    ],
  });

  const po = createMockPurchaseOrder({
    id: "po-1",
    lines: [
      {
        id: "pol-1",
        purchaseOrderId: "po-1",
        lineNumber: 1,
        description: "Standard Steel Rebar 12mm",
        quantity: 50,
        unit: "pcs",
        unitPrice: 1000,
        amount: 50000,
      },
    ],
  });

  const receipts: PurchaseOrderReceipt[] = [
    {
      id: "rec-1",
      purchaseOrderId: "po-1",
      receiptNumber: "REC-001",
      receiptDate: "2026-02-20",
      status: "RECEIVED",
      lines: [
        {
          id: "rec-l-1",
          purchaseOrderReceiptId: "rec-1",
          purchaseOrderLineId: "pol-1",
          lineNumber: 1,
          receivedQuantity: 30,
        },
      ],
      createdAt: "2026-02-20T00:00:00Z",
      updatedAt: "2026-02-20T00:00:00Z",
    },
  ];

  const result = evaluatePurchaseOrderMatch(invoice, po, { receipts });
  const comp = result.lineComparisons[0];

  assert.ok(comp, "Line comparison must exist");
  assert.equal(comp.receivedQuantity, 30);
  assert.equal(comp.remainingReceiptQuantity, 20);
  assert.equal(comp.isPartiallyReceived, true);
  assert.equal(comp.isFullyReceived, false);

  assert.ok(comp.warnings.includes("Invoice quantity exceeds recorded receipts"));
  assert.ok(comp.warnings.includes("Invoice quantity exceeds PO ordered quantity"));
  assert.ok(comp.warnings.includes("Invoice line amount exceeds PO line amount"));
  assert.ok(comp.warnings.includes("Partially received"));

  // Verify candidate warnings contain these signals
  assert.ok(result.warnings.includes("Invoice quantity exceeds recorded receipts"));
});

test("purchaseOrderMatchingDomain: line item comparison surfaces missing receipts and fully received states", () => {
  const invoice = createMockInvoice({
    ...({ vendorId: "vend-1" } as any),
    items: [
      {
        id: "inv-item-1",
        description: "Standard Steel Rebar 12mm",
        quantity: 50,
        unitPrice: 1000,
        total: 50000,
      },
    ],
  });

  const po = createMockPurchaseOrder({ id: "po-1" });

  // No receipts
  const noReceiptResult = evaluatePurchaseOrderMatch(invoice, po, { receipts: [] });
  assert.ok(noReceiptResult.lineComparisons[0].warnings.includes("Missing receipts (no goods received yet)"));

  // Full receipts
  const fullReceipts: PurchaseOrderReceipt[] = [
    {
      id: "rec-1",
      purchaseOrderId: "po-1",
      receiptNumber: "REC-001",
      receiptDate: "2026-02-20",
      status: "RECEIVED",
      lines: [
        {
          id: "rec-l-1",
          purchaseOrderReceiptId: "rec-1",
          purchaseOrderLineId: "pol-1",
          lineNumber: 1,
          receivedQuantity: 50,
        },
      ],
      createdAt: "2026-02-20T00:00:00Z",
      updatedAt: "2026-02-20T00:00:00Z",
    },
  ];

  const fullReceiptResult = evaluatePurchaseOrderMatch(invoice, po, { receipts: fullReceipts });
  assert.equal(fullReceiptResult.lineComparisons[0].isFullyReceived, true);
  assert.ok(fullReceiptResult.lineComparisons[0].warnings.includes("Fully received"));
});

test("purchaseOrderMatchingDomain: evaluatePurchaseOrderMatchCandidates sorts by eligibility and score", () => {
  const invoice = createMockInvoice({
    purchaseOrderNumber: "PO-MATCHED",
    ...({ vendorId: "vend-1" } as any),
  });

  const poIneligible = createMockPurchaseOrder({
    id: "po-inel",
    poNumber: "PO-MATCHED",
    status: "DRAFT", // Ineligible
    vendorId: "vend-1",
  });

  const poLowerScore = createMockPurchaseOrder({
    id: "po-low",
    poNumber: "PO-OTHER",
    status: "ISSUED",
    vendorId: "vend-1",
  });

  const poHighScore = createMockPurchaseOrder({
    id: "po-high",
    poNumber: "PO-MATCHED",
    status: "ISSUED",
    vendorId: "vend-1",
  });

  const sorted = evaluatePurchaseOrderMatchCandidates(invoice, [poIneligible, poLowerScore, poHighScore]);

  assert.equal(sorted[0].purchaseOrder.id, "po-high");
  assert.equal(sorted[0].isEligibleForConfirmation, true);
  assert.equal(sorted[1].purchaseOrder.id, "po-low");
  assert.equal(sorted[1].isEligibleForConfirmation, true);
  assert.equal(sorted[2].purchaseOrder.id, "po-inel");
  assert.equal(sorted[2].isEligibleForConfirmation, false);
});

test("purchaseOrderMatchingDomain: validateMatchLineAssociations validates items, duplicate lines, and totals", () => {
  const invoice = createMockInvoice({ grandTotal: 50000 });
  const po = createMockPurchaseOrder();

  // Valid lines
  const valid = validateMatchLineAssociations(invoice, po, [
    {
      invoiceLineId: "inv-line-1",
      purchaseOrderLineId: "pol-1",
      matchedQuantity: 50,
      matchedAmount: 50000,
    },
  ]);
  assert.equal(valid.isValid, true);
  assert.equal(valid.errors.length, 0);

  // Duplicate invoice lines
  const dup = validateMatchLineAssociations(invoice, po, [
    { invoiceLineId: "inv-line-1", purchaseOrderLineId: "pol-1" },
    { invoiceLineId: "inv-line-1", purchaseOrderLineId: "pol-1" },
  ]);
  assert.equal(dup.isValid, false);
  assert.ok(dup.errors.some((e) => e.includes("Duplicate invoice line ID")));

  // Nonexistent invoice line
  const badInv = validateMatchLineAssociations(invoice, po, [
    { invoiceLineId: "nonexistent-inv-line", purchaseOrderLineId: "pol-1" },
  ]);
  assert.equal(badInv.isValid, false);
  assert.ok(badInv.errors.some((e) => e.includes("not found in invoice items")));

  // Nonexistent PO line
  const badPo = validateMatchLineAssociations(invoice, po, [
    { invoiceLineId: "inv-line-1", purchaseOrderLineId: "nonexistent-po-line" },
  ]);
  assert.equal(badPo.isValid, false);
  assert.ok(badPo.errors.some((e) => e.includes("not found on purchase order")));

  // Negative quantity or amount
  const neg = validateMatchLineAssociations(invoice, po, [
    { invoiceLineId: "inv-line-1", purchaseOrderLineId: "pol-1", matchedAmount: -500 },
  ]);
  assert.equal(neg.isValid, false);
  assert.ok(neg.errors.some((e) => e.includes("cannot be negative")));

  // Matched amount exceeding invoice grand total
  const exceed = validateMatchLineAssociations(invoice, po, [
    { invoiceLineId: "inv-line-1", purchaseOrderLineId: "pol-1", matchedAmount: 60000 },
  ]);
  assert.equal(exceed.isValid, false);
  assert.ok(exceed.errors.some((e) => e.includes("exceeds invoice grand total")));
});
