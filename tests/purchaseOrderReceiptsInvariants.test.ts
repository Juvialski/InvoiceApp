import test from "node:test";
import assert from "node:assert/strict";
import type { Project, PurchaseOrder, PurchaseOrderReceipt } from "../src/types.ts";
import { recordPurchaseOrderReceipt, voidPurchaseOrderReceipt, writePurchaseOrderReceiptsToLocal } from "../src/lib/purchaseOrderReceipts.ts";
import { writePurchaseOrdersToLocal } from "../src/lib/purchaseOrders.ts";
import { calculateProjectCost } from "../src/utils/projectCosting.ts";
import { calculatePOReceiptProgress } from "../src/utils/purchaseOrderReceipts.ts";
import { clearCompanyContext, setActiveCompanyId } from "../src/lib/companyContext.ts";

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

test("purchaseOrderReceiptsInvariants: strictly enforces PO status must be ISSUED to record delivery receipts", async () => {
  clearCompanyContext();
  setActiveCompanyId("comp-1");
  const storage = createMockStorage();

  const poDraft: PurchaseOrder = {
    id: "po-draft",
    companyId: "comp-1",
    projectId: "proj-1",
    vendorId: "vend-1",
    poNumber: "PO-DRAFT",
    status: "DRAFT",
    currency: "PHP",
    totalAmount: 10000,
    lines: [
      {
        id: "line-d1",
        companyId: "comp-1",
        purchaseOrderId: "po-draft",
        lineNumber: 1,
        description: "Item 1",
        quantity: 10,
        unit: "pcs",
        unitPrice: 1000,
        amount: 10000,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      },
    ],
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
  };

  const poApproved: PurchaseOrder = {
    ...poDraft,
    id: "po-approved",
    poNumber: "PO-APP",
    status: "APPROVED",
    lines: [{ ...poDraft.lines![0], id: "line-app1", purchaseOrderId: "po-approved" }],
  };

  const poClosed: PurchaseOrder = {
    ...poDraft,
    id: "po-closed",
    poNumber: "PO-CLOSED",
    status: "CLOSED",
    lines: [{ ...poDraft.lines![0], id: "line-cl1", purchaseOrderId: "po-closed" }],
  };

  const poCancelled: PurchaseOrder = {
    ...poDraft,
    id: "po-canc",
    poNumber: "PO-CANC",
    status: "CANCELLED",
    lines: [{ ...poDraft.lines![0], id: "line-canc1", purchaseOrderId: "po-canc" }],
  };

  writePurchaseOrdersToLocal([poDraft, poApproved, poClosed, poCancelled], storage);
  writePurchaseOrderReceiptsToLocal([], storage);

  // Attempting to record against DRAFT should throw
  await assert.rejects(
    () =>
      recordPurchaseOrderReceipt(
        { purchaseOrderId: "po-draft", receiptNumber: "REC-1" },
        [{ purchaseOrderLineId: "line-d1", receivedQuantity: 5 }],
        storage,
      ),
    /ISSUED/,
  );

  // Attempting to record against APPROVED should throw
  await assert.rejects(
    () =>
      recordPurchaseOrderReceipt(
        { purchaseOrderId: "po-approved", receiptNumber: "REC-2" },
        [{ purchaseOrderLineId: "line-app1", receivedQuantity: 5 }],
        storage,
      ),
    /ISSUED/,
  );

  // Attempting to record against CLOSED should throw
  await assert.rejects(
    () =>
      recordPurchaseOrderReceipt(
        { purchaseOrderId: "po-closed", receiptNumber: "REC-3" },
        [{ purchaseOrderLineId: "line-cl1", receivedQuantity: 5 }],
        storage,
      ),
    /ISSUED/,
  );

  // Attempting to record against CANCELLED should throw
  await assert.rejects(
    () =>
      recordPurchaseOrderReceipt(
        { purchaseOrderId: "po-canc", receiptNumber: "REC-4" },
        [{ purchaseOrderLineId: "line-canc1", receivedQuantity: 5 }],
        storage,
      ),
    /ISSUED/,
  );
});

test("purchaseOrderReceiptsInvariants: strictly rejects over-receipt attempts beyond remaining ordered quantity", async () => {
  clearCompanyContext();
  setActiveCompanyId("comp-1");
  const storage = createMockStorage();

  const poIssued: PurchaseOrder = {
    id: "po-iss-1",
    companyId: "comp-1",
    projectId: "proj-1",
    vendorId: "vend-1",
    poNumber: "PO-24-0010",
    status: "ISSUED",
    currency: "PHP",
    totalAmount: 50000,
    lines: [
      {
        id: "line-10",
        companyId: "comp-1",
        purchaseOrderId: "po-iss-1",
        lineNumber: 1,
        description: "Steel rebar 16mm",
        quantity: 50,
        unit: "pcs",
        unitPrice: 1000,
        amount: 50000,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      },
    ],
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
  };

  writePurchaseOrdersToLocal([poIssued], storage);
  writePurchaseOrderReceiptsToLocal([], storage);

  // Attempting to receive 60 when 50 was ordered should reject
  await assert.rejects(
    () =>
      recordPurchaseOrderReceipt(
        { purchaseOrderId: "po-iss-1", receiptNumber: "REC-1" },
        [{ purchaseOrderLineId: "line-10", receivedQuantity: 60 }],
        storage,
      ),
    /Over-receipt is not permitted/,
  );

  // Record valid partial delivery of 30
  const rec1 = await recordPurchaseOrderReceipt(
    { purchaseOrderId: "po-iss-1", receiptNumber: "REC-1" },
    [{ purchaseOrderLineId: "line-10", receivedQuantity: 30 }],
    storage,
  );
  assert.equal(rec1.status, "RECEIVED");

  // Attempting to receive another 30 when only 20 remains should reject
  await assert.rejects(
    () =>
      recordPurchaseOrderReceipt(
        { purchaseOrderId: "po-iss-1", receiptNumber: "REC-2" },
        [{ purchaseOrderLineId: "line-10", receivedQuantity: 30 }],
        storage,
      ),
    /Over-receipt is not permitted/,
  );

  // Receiving exactly remaining 20 should succeed
  const rec2 = await recordPurchaseOrderReceipt(
    { purchaseOrderId: "po-iss-1", receiptNumber: "REC-2" },
    [{ purchaseOrderLineId: "line-10", receivedQuantity: 20 }],
    storage,
  );
  assert.equal(rec2.status, "RECEIVED");
});

test("purchaseOrderReceiptsInvariants: requires mandatory void reason (min 3 chars) and restores remaining capacity upon voiding", async () => {
  clearCompanyContext();
  setActiveCompanyId("comp-1");
  const storage = createMockStorage();

  const poIssued: PurchaseOrder = {
    id: "po-iss-2",
    companyId: "comp-1",
    projectId: "proj-1",
    vendorId: "vend-1",
    poNumber: "PO-24-0020",
    status: "ISSUED",
    currency: "PHP",
    totalAmount: 100000,
    lines: [
      {
        id: "line-20",
        companyId: "comp-1",
        purchaseOrderId: "po-iss-2",
        lineNumber: 1,
        description: "Generator set rental",
        quantity: 10,
        unit: "days",
        unitPrice: 10000,
        amount: 100000,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      },
    ],
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
  };

  writePurchaseOrdersToLocal([poIssued], storage);
  writePurchaseOrderReceiptsToLocal([], storage);

  // Record receipt of 10 days
  const rec = await recordPurchaseOrderReceipt(
    { purchaseOrderId: "po-iss-2", receiptNumber: "REC-10" },
    [{ purchaseOrderLineId: "line-20", receivedQuantity: 10 }],
    storage,
  );

  // Now remaining is 0; receiving another 5 is rejected
  await assert.rejects(
    () =>
      recordPurchaseOrderReceipt(
        { purchaseOrderId: "po-iss-2", receiptNumber: "REC-11" },
        [{ purchaseOrderLineId: "line-20", receivedQuantity: 5 }],
        storage,
      ),
    /Over-receipt is not permitted/,
  );

  // Voiding without reason or with < 3 chars fails
  await assert.rejects(() => voidPurchaseOrderReceipt(rec.id, "", storage), /at least 3 characters/);
  await assert.rejects(() => voidPurchaseOrderReceipt(rec.id, "no", storage), /at least 3 characters/);

  // Voiding with valid reason succeeds
  const voided = await voidPurchaseOrderReceipt(rec.id, "Delivery returned due to equipment defect", storage);
  assert.equal(voided.status, "VOIDED");
  assert.equal(voided.voidReason, "Delivery returned due to equipment defect");
  assert.ok(voided.voidedAt);

  // Now remaining capacity is restored to 10; receiving 10 succeeds again
  const recNew = await recordPurchaseOrderReceipt(
    { purchaseOrderId: "po-iss-2", receiptNumber: "REC-12" },
    [{ purchaseOrderLineId: "line-20", receivedQuantity: 10 }],
    storage,
  );
  assert.equal(recNew.status, "RECEIVED");
});

test("purchaseOrderReceiptsInvariants: strictly guarantees receipts do NOT mutate Committed Cost or generate Actual Cost", () => {
  const mockProject: Project = {
    id: "proj-pc-1",
    projectName: "Project Controls Warehouse",
    projectCode: "PCW-01",
    contractValue: 5000000,
    projectBudget: 4000000,
    currency: "PHP",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  const po: PurchaseOrder = {
    id: "po-pc-1",
    companyId: "comp-1",
    projectId: "proj-pc-1",
    vendorId: "vend-1",
    poNumber: "PO-PC-01",
    status: "ISSUED",
    currency: "PHP",
    totalAmount: 250000,
    lines: [
      {
        id: "line-pc-1",
        companyId: "comp-1",
        purchaseOrderId: "po-pc-1",
        lineNumber: 1,
        description: "Structural I-Beams",
        quantity: 20,
        unit: "pcs",
        unitPrice: 12500,
        amount: 250000,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  // Baseline project costing before any receipts
  const costBefore = calculateProjectCost(mockProject, {
    invoices: [],
    payroll: [],
    expenses: [],
    purchaseOrders: [po],
  });

  assert.equal(costBefore.committedCost, 250000);
  assert.equal(costBefore.totalActualCost, 0);

  // Create receipt for 100% of the line
  const receipt: PurchaseOrderReceipt = {
    id: "rec-pc-1",
    companyId: "comp-1",
    purchaseOrderId: "po-pc-1",
    receiptNumber: "REC-PC-01",
    receiptDate: "2026-03-01",
    status: "RECEIVED",
    lines: [
      {
        id: "rline-pc-1",
        purchaseOrderReceiptId: "rec-pc-1",
        purchaseOrderLineId: "line-pc-1",
        lineNumber: 1,
        receivedQuantity: 20,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      },
    ],
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
  };

  // Verify delivery progress reflects 100%
  const progress = calculatePOReceiptProgress(po, [receipt]);
  assert.equal(progress.deliveryStatus, "FULLY_RECEIVED");
  assert.equal(progress.overallProgressPercent, 100);

  // Project costing after receipt recording
  // Invariants: Committed Cost is STILL 250,000, Actual Cost is STILL 0.
  const costAfter = calculateProjectCost(mockProject, {
    invoices: [],
    payroll: [],
    expenses: [],
    purchaseOrders: [po],
  });

  assert.equal(costAfter.committedCost, 250000);
  assert.equal(costAfter.totalActualCost, 0);
});