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

test("calculateLineReceiptProgress: calculates 0% progress when no receipts exist", () => {
  const po = createMockPO();
  const line1 = po.lines![0];
  const prog = calculateLineReceiptProgress(line1, []);
  assert.equal(prog.orderedQuantity, 100);
  assert.equal(prog.receivedQuantity, 0);
  assert.equal(prog.remainingQuantity, 100);
  assert.equal(prog.progressPercent, 0);
  assert.equal(prog.isFullyReceived, false);
  assert.equal(prog.isPartiallyReceived, false);
});

test("calculateLineReceiptProgress: calculates partial progress accurately", () => {
  const po = createMockPO();
  const line1 = po.lines![0];
  const receipts: PurchaseOrderReceipt[] = [
    {
      id: "rec-1",
      purchaseOrderId: "po-101",
      receiptNumber: "REC-24-0001",
      receiptDate: "2026-03-05",
      status: "RECEIVED",
      createdAt: "2026-03-05T00:00:00Z",
      updatedAt: "2026-03-05T00:00:00Z",
      lines: [
        {
          id: "rl-1",
          purchaseOrderReceiptId: "rec-1",
          purchaseOrderLineId: "line-1",
          lineNumber: 1,
          receivedQuantity: 40,
          createdAt: "2026-03-05T00:00:00Z",
          updatedAt: "2026-03-05T00:00:00Z",
        },
      ],
    },
  ];

  const prog = calculateLineReceiptProgress(line1, receipts);
  assert.equal(prog.orderedQuantity, 100);
  assert.equal(prog.receivedQuantity, 40);
  assert.equal(prog.remainingQuantity, 60);
  assert.equal(prog.progressPercent, 40);
  assert.equal(prog.isFullyReceived, false);
  assert.equal(prog.isPartiallyReceived, true);
});

test("calculateLineReceiptProgress: calculates cumulative progress across multiple batches", () => {
  const po = createMockPO();
  const line1 = po.lines![0];
  const receipts: PurchaseOrderReceipt[] = [
    {
      id: "rec-1",
      purchaseOrderId: "po-101",
      receiptNumber: "REC-24-0001",
      receiptDate: "2026-03-05",
      status: "RECEIVED",
      createdAt: "2026-03-05T00:00:00Z",
      updatedAt: "2026-03-05T00:00:00Z",
      lines: [
        {
          id: "rl-1",
          purchaseOrderReceiptId: "rec-1",
          purchaseOrderLineId: "line-1",
          lineNumber: 1,
          receivedQuantity: 60,
          createdAt: "2026-03-05T00:00:00Z",
          updatedAt: "2026-03-05T00:00:00Z",
        },
      ],
    },
    {
      id: "rec-2",
      purchaseOrderId: "po-101",
      receiptNumber: "REC-24-0002",
      receiptDate: "2026-03-06",
      status: "RECEIVED",
      createdAt: "2026-03-06T00:00:00Z",
      updatedAt: "2026-03-06T00:00:00Z",
      lines: [
        {
          id: "rl-2",
          purchaseOrderReceiptId: "rec-2",
          purchaseOrderLineId: "line-1",
          lineNumber: 1,
          receivedQuantity: 40,
          createdAt: "2026-03-06T00:00:00Z",
          updatedAt: "2026-03-06T00:00:00Z",
        },
      ],
    },
  ];

  const prog = calculateLineReceiptProgress(line1, receipts);
  assert.equal(prog.orderedQuantity, 100);
  assert.equal(prog.receivedQuantity, 100);
  assert.equal(prog.remainingQuantity, 0);
  assert.equal(prog.progressPercent, 100);
  assert.equal(prog.isFullyReceived, true);
  assert.equal(prog.isPartiallyReceived, false);
});

test("calculateLineReceiptProgress: ignores VOIDED receipts in calculation", () => {
  const po = createMockPO();
  const line1 = po.lines![0];
  const receipts: PurchaseOrderReceipt[] = [
    {
      id: "rec-1",
      purchaseOrderId: "po-101",
      receiptNumber: "REC-24-0001",
      receiptDate: "2026-03-05",
      status: "VOIDED",
      voidReason: "Recorded against wrong PO",
      createdAt: "2026-03-05T00:00:00Z",
      updatedAt: "2026-03-05T00:00:00Z",
      lines: [
        {
          id: "rl-1",
          purchaseOrderReceiptId: "rec-1",
          purchaseOrderLineId: "line-1",
          lineNumber: 1,
          receivedQuantity: 100,
          createdAt: "2026-03-05T00:00:00Z",
          updatedAt: "2026-03-05T00:00:00Z",
        },
      ],
    },
  ];

  const prog = calculateLineReceiptProgress(line1, receipts);
  assert.equal(prog.receivedQuantity, 0);
  assert.equal(prog.remainingQuantity, 100);
  assert.equal(prog.progressPercent, 0);
  assert.equal(prog.isFullyReceived, false);
});

test("calculatePOReceiptProgress: derives NOT_RECEIVED when no receipts exist", () => {
  const po = createMockPO();
  const prog = calculatePOReceiptProgress(po, []);
  assert.equal(prog.totalOrderedQuantity, 105);
  assert.equal(prog.totalReceivedQuantity, 0);
  assert.equal(prog.totalRemainingQuantity, 105);
  assert.equal(prog.overallProgressPercent, 0);
  assert.equal(prog.deliveryStatus, "NOT_RECEIVED");
});

test("calculatePOReceiptProgress: derives PARTIALLY_RECEIVED when some lines/quantities are delivered", () => {
  const po = createMockPO();
  const receipts: PurchaseOrderReceipt[] = [
    {
      id: "rec-1",
      purchaseOrderId: "po-101",
      receiptNumber: "REC-24-0001",
      receiptDate: "2026-03-05",
      status: "RECEIVED",
      createdAt: "2026-03-05T00:00:00Z",
      updatedAt: "2026-03-05T00:00:00Z",
      lines: [
        {
          id: "rl-1",
          purchaseOrderReceiptId: "rec-1",
          purchaseOrderLineId: "line-1",
          lineNumber: 1,
          receivedQuantity: 80,
          createdAt: "2026-03-05T00:00:00Z",
          updatedAt: "2026-03-05T00:00:00Z",
        },
        {
          id: "rl-2",
          purchaseOrderReceiptId: "rec-1",
          purchaseOrderLineId: "line-2",
          lineNumber: 2,
          receivedQuantity: 2,
          createdAt: "2026-03-05T00:00:00Z",
          updatedAt: "2026-03-05T00:00:00Z",
        },
      ],
    },
  ];

  const prog = calculatePOReceiptProgress(po, receipts);
  assert.equal(prog.totalOrderedQuantity, 105);
  assert.equal(prog.totalReceivedQuantity, 82);
  assert.equal(prog.totalRemainingQuantity, 23);
  assert.equal(prog.overallProgressPercent, 78);
  assert.equal(prog.deliveryStatus, "PARTIALLY_RECEIVED");
});

test("calculatePOReceiptProgress: derives FULLY_RECEIVED when all lines are 100% delivered", () => {
  const po = createMockPO();
  const receipts: PurchaseOrderReceipt[] = [
    {
      id: "rec-1",
      purchaseOrderId: "po-101",
      receiptNumber: "REC-24-0001",
      receiptDate: "2026-03-05",
      status: "RECEIVED",
      createdAt: "2026-03-05T00:00:00Z",
      updatedAt: "2026-03-05T00:00:00Z",
      lines: [
        {
          id: "rl-1",
          purchaseOrderReceiptId: "rec-1",
          purchaseOrderLineId: "line-1",
          lineNumber: 1,
          receivedQuantity: 100,
          createdAt: "2026-03-05T00:00:00Z",
          updatedAt: "2026-03-05T00:00:00Z",
        },
        {
          id: "rl-2",
          purchaseOrderReceiptId: "rec-1",
          purchaseOrderLineId: "line-2",
          lineNumber: 2,
          receivedQuantity: 5,
          createdAt: "2026-03-05T00:00:00Z",
          updatedAt: "2026-03-05T00:00:00Z",
        },
      ],
    },
  ];

  const prog = calculatePOReceiptProgress(po, receipts);
  assert.equal(prog.totalOrderedQuantity, 105);
  assert.equal(prog.totalReceivedQuantity, 105);
  assert.equal(prog.totalRemainingQuantity, 0);
  assert.equal(prog.overallProgressPercent, 100);
  assert.equal(prog.deliveryStatus, "FULLY_RECEIVED");
});

test("validateReceiptLineInput: validates correct positive quantity within remaining", () => {
  const po = createMockPO();
  const line1 = po.lines![0];
  const res = validateReceiptLineInput(line1, 50, []);
  assert.equal(res.valid, true);
  assert.equal(res.message, undefined);
});

test("validateReceiptLineInput: rejects non-positive quantity", () => {
  const po = createMockPO();
  const line1 = po.lines![0];
  const resZero = validateReceiptLineInput(line1, 0, []);
  assert.equal(resZero.valid, false);
  assert.match(resZero.message || "", /greater than zero/);

  const resNeg = validateReceiptLineInput(line1, -5, []);
  assert.equal(resNeg.valid, false);
  assert.match(resNeg.message || "", /greater than zero/);
});

test("validateReceiptLineInput: rejects quantity exceeding remaining (over-receipt guard)", () => {
  const po = createMockPO();
  const line1 = po.lines![0];
  const res = validateReceiptLineInput(line1, 101, []);
  assert.equal(res.valid, false);
  assert.match(res.message || "", /Over-receipt rejected/);
});

test("validateReceiptLineInput: considers existing receipts when checking over-receipt", () => {
  const po = createMockPO();
  const line1 = po.lines![0];
  const existing: PurchaseOrderReceipt[] = [
    {
      id: "r-1",
      purchaseOrderId: "po-101",
      receiptNumber: "REC-1",
      receiptDate: "2026-03-01",
      status: "RECEIVED",
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-01T00:00:00Z",
      lines: [
        {
          id: "rl-1",
          purchaseOrderReceiptId: "r-1",
          purchaseOrderLineId: "line-1",
          lineNumber: 1,
          receivedQuantity: 80,
          createdAt: "2026-03-01T00:00:00Z",
          updatedAt: "2026-03-01T00:00:00Z",
        },
      ],
    },
  ];

  assert.equal(validateReceiptLineInput(line1, 20, existing).valid, true);
  assert.equal(validateReceiptLineInput(line1, 21, existing).valid, false);
});

test("getReceiptsForPO: filters receipts matching PO id and sorts latest first", () => {
  const receipts: PurchaseOrderReceipt[] = [
    {
      id: "r-1",
      purchaseOrderId: "po-101",
      receiptNumber: "REC-1",
      receiptDate: "2026-03-01",
      status: "RECEIVED",
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-01T00:00:00Z",
    },
    {
      id: "r-2",
      purchaseOrderId: "po-999",
      receiptNumber: "REC-2",
      receiptDate: "2026-03-02",
      status: "RECEIVED",
      createdAt: "2026-03-02T00:00:00Z",
      updatedAt: "2026-03-02T00:00:00Z",
    },
    {
      id: "r-3",
      purchaseOrderId: "po-101",
      receiptNumber: "REC-3",
      receiptDate: "2026-03-05",
      status: "RECEIVED",
      createdAt: "2026-03-05T00:00:00Z",
      updatedAt: "2026-03-05T00:00:00Z",
    },
  ];

  const poReceipts = getReceiptsForPO("po-101", receipts);
  assert.equal(poReceipts.length, 2);
  assert.equal(poReceipts[0].receiptNumber, "REC-3");
  assert.equal(poReceipts[1].receiptNumber, "REC-1");
});


