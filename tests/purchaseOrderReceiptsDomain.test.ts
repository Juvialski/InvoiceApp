import test from "node:test";
import assert from "node:assert/strict";
import type { PurchaseOrder, PurchaseOrderReceipt } from "../src/types.ts";
import {
  calculateLineReceiptProgress,
  calculatePOReceiptProgress,
  getReceiptsForPO,
  validateReceiptLineInput,
} from "../src/utils/purchaseOrderReceipts.ts";

function createMockPO(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po-101",
    companyId: "comp-1",
    projectId: "proj-1",
    vendorId: "vend-1",
    poNumber: "PO-24-0001",
    status: "ISSUED",
    currency: "PHP",
    totalAmount: 150000,
    issueDate: "2026-03-01",
    lines: [
      {
        id: "line-1",
        companyId: "comp-1",
        purchaseOrderId: "po-101",
        lineNumber: 1,
        description: "Ready-mix concrete 3000 PSI",
        quantity: 100,
        unit: "cu.m",
        unitPrice: 1200,
        amount: 120000,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      },
      {
        id: "line-2",
        companyId: "comp-1",
        purchaseOrderId: "po-101",
        lineNumber: 2,
        description: "Concrete boom pump rental",
        quantity: 5,
        unit: "days",
        unitPrice: 6000,
        amount: 30000,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      },
    ],
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

function receipt(
  id: string,
  lines: Array<{ purchaseOrderLineId: string; receivedQuantity: number }>,
  status: PurchaseOrderReceipt["status"] = "RECEIVED",
  purchaseOrderId = "po-101",
): PurchaseOrderReceipt {
  return {
    id,
    purchaseOrderId,
    receiptNumber: id.toUpperCase(),
    receiptDate: "2026-03-05",
    status,
    createdAt: "2026-03-05T00:00:00Z",
    updatedAt: "2026-03-05T00:00:00Z",
    lines: lines.map((line, index) => ({
      id: `${id}-line-${index + 1}`,
      purchaseOrderReceiptId: id,
      purchaseOrderLineId: line.purchaseOrderLineId,
      lineNumber: index + 1,
      receivedQuantity: line.receivedQuantity,
      createdAt: "2026-03-05T00:00:00Z",
      updatedAt: "2026-03-05T00:00:00Z",
    })),
  };
}

test("calculateLineReceiptProgress: calculates zero, partial, cumulative, and void-safe progress", () => {
  const line = createMockPO().lines![0];

  const zero = calculateLineReceiptProgress(line, []);
  assert.equal(zero.orderedQuantity, 100);
  assert.equal(zero.receivedQuantity, 0);
  assert.equal(zero.remainingQuantity, 100);
  assert.equal(zero.progressPercent, 0);
  assert.equal(zero.isFullyReceived, false);
  assert.equal(zero.isPartiallyReceived, false);

  const partial = calculateLineReceiptProgress(line, [receipt("rec-1", [
    { purchaseOrderLineId: "line-1", receivedQuantity: 40 },
  ])]);
  assert.equal(partial.receivedQuantity, 40);
  assert.equal(partial.remainingQuantity, 60);
  assert.equal(partial.progressPercent, 40);
  assert.equal(partial.isPartiallyReceived, true);

  const complete = calculateLineReceiptProgress(line, [
    receipt("rec-1", [{ purchaseOrderLineId: "line-1", receivedQuantity: 60 }]),
    receipt("rec-2", [{ purchaseOrderLineId: "line-1", receivedQuantity: 40 }]),
  ]);
  assert.equal(complete.receivedQuantity, 100);
  assert.equal(complete.remainingQuantity, 0);
  assert.equal(complete.progressPercent, 100);
  assert.equal(complete.isFullyReceived, true);

  const voided = calculateLineReceiptProgress(line, [
    receipt("rec-void", [{ purchaseOrderLineId: "line-1", receivedQuantity: 100 }], "VOIDED"),
  ]);
  assert.equal(voided.receivedQuantity, 0);
  assert.equal(voided.remainingQuantity, 100);
});

test("calculatePOReceiptProgress: never adds unlike units and uses average line completion for mixed-unit POs", () => {
  const po = createMockPO();

  const empty = calculatePOReceiptProgress(po, []);
  assert.equal(empty.quantitiesComparable, false);
  assert.equal(empty.aggregateUnit, null);
  assert.equal(empty.totalOrderedQuantity, 0);
  assert.equal(empty.totalReceivedQuantity, 0);
  assert.equal(empty.totalRemainingQuantity, 0);
  assert.equal(empty.overallProgressPercent, 0);
  assert.equal(empty.deliveryStatus, "NOT_RECEIVED");

  // 80/100 cu.m = 80% and 2/5 days = 40%; the truthful cross-line signal is
  // their dimensionless average (60%), never the invalid 82/105 quantity sum.
  const partial = calculatePOReceiptProgress(po, [receipt("rec-1", [
    { purchaseOrderLineId: "line-1", receivedQuantity: 80 },
    { purchaseOrderLineId: "line-2", receivedQuantity: 2 },
  ])]);
  assert.equal(partial.quantitiesComparable, false);
  assert.equal(partial.totalOrderedQuantity, 0);
  assert.equal(partial.totalReceivedQuantity, 0);
  assert.equal(partial.totalRemainingQuantity, 0);
  assert.equal(partial.overallProgressPercent, 60);
  assert.equal(partial.deliveryStatus, "PARTIALLY_RECEIVED");

  const complete = calculatePOReceiptProgress(po, [receipt("rec-full", [
    { purchaseOrderLineId: "line-1", receivedQuantity: 100 },
    { purchaseOrderLineId: "line-2", receivedQuantity: 5 },
  ])]);
  assert.equal(complete.quantitiesComparable, false);
  assert.equal(complete.overallProgressPercent, 100);
  assert.equal(complete.deliveryStatus, "FULLY_RECEIVED");
});

test("calculatePOReceiptProgress: preserves quantity aggregation when every line uses the same unit", () => {
  const mixed = createMockPO();
  const po = createMockPO({
    lines: [
      mixed.lines![0],
      {
        ...mixed.lines![1],
        unit: "cu.m",
        quantity: 20,
        description: "Additional concrete pour",
      },
    ],
  });

  const progress = calculatePOReceiptProgress(po, [receipt("rec-same-unit", [
    { purchaseOrderLineId: "line-1", receivedQuantity: 50 },
    { purchaseOrderLineId: "line-2", receivedQuantity: 10 },
  ])]);

  assert.equal(progress.quantitiesComparable, true);
  assert.equal(progress.aggregateUnit, "cu.m");
  assert.equal(progress.totalOrderedQuantity, 120);
  assert.equal(progress.totalReceivedQuantity, 60);
  assert.equal(progress.totalRemainingQuantity, 60);
  assert.equal(progress.overallProgressPercent, 50);
  assert.equal(progress.deliveryStatus, "PARTIALLY_RECEIVED");
});

test("validateReceiptLineInput: accepts valid remaining quantity and rejects invalid or excessive quantities", () => {
  const line = createMockPO().lines![0];

  assert.equal(validateReceiptLineInput(line, 50, []).valid, true);
  assert.equal(validateReceiptLineInput(line, 0, []).valid, false);
  assert.equal(validateReceiptLineInput(line, -5, []).valid, false);
  assert.match(validateReceiptLineInput(line, 101, []).message || "", /Over-receipt rejected/);

  const existing = [receipt("rec-existing", [
    { purchaseOrderLineId: "line-1", receivedQuantity: 80 },
  ])];
  assert.equal(validateReceiptLineInput(line, 20, existing).valid, true);
  assert.equal(validateReceiptLineInput(line, 21, existing).valid, false);
});

test("getReceiptsForPO: filters by PO and sorts latest receipt first", () => {
  const receipts: PurchaseOrderReceipt[] = [
    { ...receipt("r-1", []), receiptDate: "2026-03-01" },
    { ...receipt("r-2", [], "RECEIVED", "po-999"), receiptDate: "2026-03-02" },
    { ...receipt("r-3", []), receiptDate: "2026-03-05" },
  ];

  const poReceipts = getReceiptsForPO("po-101", receipts);
  assert.deepEqual(poReceipts.map((item) => item.id), ["r-3", "r-1"]);
});
