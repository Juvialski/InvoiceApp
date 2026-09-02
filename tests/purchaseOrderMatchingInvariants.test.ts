import test from "node:test";
import assert from "node:assert/strict";
import type { InvoiceData, Project, PurchaseOrder, PurchaseOrderReceipt } from "../src/types.ts";
import {
  confirmPurchaseOrderMatch,
  fetchPurchaseOrderMatches,
  readPurchaseOrderMatchesFromLocal,
  unmatchPurchaseOrderMatch,
  writePurchaseOrderMatchesToLocal,
} from "../src/lib/purchaseOrderMatches.ts";
import { writePurchaseOrdersToLocal } from "../src/lib/purchaseOrders.ts";
import { writePurchaseOrderReceiptsToLocal } from "../src/lib/purchaseOrderReceipts.ts";
import { clearCompanyContext, setActiveCompanyId } from "../src/lib/companyContext.ts";
import { calculateProjectCost } from "../src/utils/projectCosting.ts";
import { calculateLineReceiptProgress } from "../src/utils/purchaseOrderReceipts.ts";

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

function createBaseInvoice(): InvoiceData {
  return {
    id: "inv-fin-1",
    invoiceNumber: "INV-2026-999",
    invoiceDate: "2026-03-01",
    currency: "PHP",
    grandTotal: 100000,
    subtotal: 100000,
    totalTax: 0,
    status: "UNPAID",
    vendor: { name: "Steel & Heavy Industries" },
    customer: { name: "Apex Builders" },
    items: [
      {
        id: "inv-line-1",
        itemNumber: 1,
        description: "Grade 60 Structural Steel Beams",
        quantity: 100,
        unitPrice: 1000,
        total: 100000,
      },
    ],
    extractedAt: "2026-03-01T10:00:00Z",
    modelUsed: "gemini-2.5-flash",
  };
}

function createBasePO(): PurchaseOrder {
  return {
    id: "po-fin-1",
    companyId: "comp-1",
    poNumber: "PO-2026-999",
    vendorId: "vend-1",
    projectId: "proj-1",
    currency: "PHP",
    status: "ISSUED",
    totalAmount: 100000,
    lines: [
      {
        id: "pol-fin-1",
        purchaseOrderId: "po-fin-1",
        lineNumber: 1,
        description: "Grade 60 Structural Steel Beams",
        quantity: 100,
        unit: "pcs",
        unitPrice: 1000,
        amount: 100000,
        createdAt: "2026-02-15T08:00:00Z",
        updatedAt: "2026-02-15T08:00:00Z",
      },
    ],
    createdAt: "2026-02-15T08:00:00Z",
    updatedAt: "2026-02-15T08:00:00Z",
  };
}

const mockProject: Project = {
  id: "proj-1",
  projectCode: "PRJ-999",
  projectName: "Commercial Tower",
  clientName: "Apex Builders",
  status: "ACTIVE",
  contractValue: 1_000_000,
  projectBudget: 500_000,
  currency: "PHP",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

test("purchaseOrderMatchingInvariants: matching does NOT verify invoice, change payment status, create Expense, or alter allocations", async () => {
  clearCompanyContext();
  setActiveCompanyId("comp-1");
  const storage = createMockStorage();

  const invoice = {
    ...createBaseInvoice(),
    companyId: "comp-1",
    vendorId: "vend-1",
  } as InvoiceData;
  const po = createBasePO();

  writePurchaseOrdersToLocal([po], storage);
  writePurchaseOrderMatchesToLocal([], storage);

  // Initial checks
  assert.equal(invoice.verifiedAt, undefined);
  assert.equal(invoice.status, "UNPAID");

  // Confirm match
  const match = await confirmPurchaseOrderMatch({
    invoiceId: invoice.id,
    purchaseOrderId: po.id,
    matchSource: "MANUAL",
    invoice,
    purchaseOrder: po,
    lines: [
      {
        invoiceLineId: "inv-line-1",
        purchaseOrderLineId: "pol-fin-1",
        matchedQuantity: 100,
        matchedAmount: 100000,
      },
    ],
    storage,
  });

  assert.ok(match.id, "Match was created");
  assert.equal(match.status, "CONFIRMED");

  // 1. Invoice remains unverified
  assert.equal(invoice.verifiedAt, undefined, "Matching must not verify invoice");

  // 2. Invoice payment status remains UNPAID
  assert.equal(invoice.status, "UNPAID", "Matching must not alter invoice payment status");

  // 3. No Expenses were created in storage
  assert.equal(storage.getItem("expenses"), null, "Matching must not create Expense records");
  assert.equal(storage.getItem("project_expenses"), null, "Matching must not create project expenses");

  // 4. Project allocations remain unchanged
  assert.equal(storage.getItem("invoice_project_allocations"), null, "Matching must not alter project allocations");
});

test("purchaseOrderMatchingInvariants: matching and unmatching do NOT alter Actual Cost or Committed Cost", async () => {
  clearCompanyContext();
  setActiveCompanyId("comp-1");
  const storage = createMockStorage();

  const po = createBasePO();
  const invoice = {
    ...createBaseInvoice(),
    companyId: "comp-1",
    vendorId: "vend-1",
  } as InvoiceData;

  writePurchaseOrdersToLocal([po], storage);

  // Cost calculation BEFORE match
  const costBefore = calculateProjectCost(mockProject, {
    invoices: [invoice as any],
    expenses: [],
    payroll: [],
    purchaseOrders: [po],
  });

  assert.equal(costBefore.totalActualCost, 0, "Unverified unallocated invoice gives 0 actual cost");
  assert.equal(costBefore.committedCost, 100000, "ISSUED PO gives 100,000 committed cost");

  // Confirm match
  const match = await confirmPurchaseOrderMatch({
    invoiceId: invoice.id,
    purchaseOrderId: po.id,
    invoice,
    purchaseOrder: po,
    storage,
  });

  // Cost calculation AFTER match confirmation
  const costAfterConfirm = calculateProjectCost(mockProject, {
    invoices: [invoice as any],
    expenses: [],
    payroll: [],
    purchaseOrders: [po],
  });

  assert.equal(
    costAfterConfirm.totalActualCost,
    costBefore.totalActualCost,
    "Match confirmation must NOT change Actual Cost",
  );
  assert.equal(
    costAfterConfirm.committedCost,
    costBefore.committedCost,
    "Match confirmation must NOT change Committed Cost",
  );

  // Unmatch
  await unmatchPurchaseOrderMatch(match.id, "Incorrect order matched during intake", storage);

  // Cost calculation AFTER unmatching
  const costAfterUnmatch = calculateProjectCost(mockProject, {
    invoices: [invoice as any],
    expenses: [],
    payroll: [],
    purchaseOrders: [po],
  });

  assert.equal(
    costAfterUnmatch.totalActualCost,
    costBefore.totalActualCost,
    "Unmatching must NOT change Actual Cost",
  );
  assert.equal(
    costAfterUnmatch.committedCost,
    costBefore.committedCost,
    "Unmatching must NOT change Committed Cost",
  );
});

test("purchaseOrderMatchingInvariants: matching does NOT consume receipts or modify receipt progress", async () => {
  clearCompanyContext();
  setActiveCompanyId("comp-1");
  const storage = createMockStorage();

  const po = createBasePO();
  const receipts: PurchaseOrderReceipt[] = [
    {
      id: "rec-fin-1",
      companyId: "comp-1",
      purchaseOrderId: po.id,
      receiptNumber: "REC-2026-001",
      receiptDate: "2026-02-25",
      status: "RECEIVED",
      lines: [
        {
          id: "rec-l-1",
          purchaseOrderReceiptId: "rec-fin-1",
          purchaseOrderLineId: "pol-fin-1",
          lineNumber: 1,
          receivedQuantity: 60,
        },
      ],
      createdAt: "2026-02-25T00:00:00Z",
      updatedAt: "2026-02-25T00:00:00Z",
    },
  ];

  writePurchaseOrdersToLocal([po], storage);
  writePurchaseOrderReceiptsToLocal(receipts, storage);

  // Progress before match
  const progressBefore = calculateLineReceiptProgress(po.lines![0], receipts);
  assert.equal(progressBefore.receivedQuantity, 60);
  assert.equal(progressBefore.remainingQuantity, 40);

  // Confirm match
  const invoice = {
    ...createBaseInvoice(),
    companyId: "comp-1",
    vendorId: "vend-1",
  } as InvoiceData;

  await confirmPurchaseOrderMatch({
    invoiceId: invoice.id,
    purchaseOrderId: po.id,
    invoice,
    purchaseOrder: po,
    lines: [
      {
        invoiceLineId: "inv-line-1",
        purchaseOrderLineId: "pol-fin-1",
        matchedQuantity: 60,
        matchedAmount: 60000,
      },
    ],
    storage,
  });

  // Progress after match
  const progressAfter = calculateLineReceiptProgress(po.lines![0], receipts);
  assert.equal(progressAfter.receivedQuantity, 60, "Receipt quantity must remain exactly 60");
  assert.equal(progressAfter.remainingQuantity, 40, "Remaining receipt quantity must remain exactly 40");
});

test("purchaseOrderMatchingInvariants: unmatching strictly enforces mandatory reason >= 3 chars", async () => {
  clearCompanyContext();
  setActiveCompanyId("comp-1");
  const storage = createMockStorage();

  const po = createBasePO();
  const invoice = { ...createBaseInvoice(), companyId: "comp-1", vendorId: "vend-1" } as InvoiceData;

  writePurchaseOrdersToLocal([po], storage);

  const match = await confirmPurchaseOrderMatch({
    invoiceId: invoice.id,
    purchaseOrderId: po.id,
    invoice,
    purchaseOrder: po,
    storage,
  });

  // Empty string
  await assert.rejects(
    () => unmatchPurchaseOrderMatch(match.id, "", storage),
    /Unmatch reason must contain at least 3 characters/,
  );

  // Whitespace only
  await assert.rejects(
    () => unmatchPurchaseOrderMatch(match.id, "   ", storage),
    /Unmatch reason must contain at least 3 characters/,
  );

  // 2 characters
  await assert.rejects(
    () => unmatchPurchaseOrderMatch(match.id, "no", storage),
    /Unmatch reason must contain at least 3 characters/,
  );

  // Valid 3 characters
  const unmatched = await unmatchPurchaseOrderMatch(match.id, "rev", storage);
  assert.equal(unmatched.status, "UNMATCHED");
  assert.equal(unmatched.unmatchReason, "rev");
});

test("purchaseOrderMatchingInvariants: historical preservation retains match record and lines on unmatch", async () => {
  clearCompanyContext();
  setActiveCompanyId("comp-1");
  const storage = createMockStorage();

  const po = createBasePO();
  const invoice = { ...createBaseInvoice(), companyId: "comp-1", vendorId: "vend-1" } as InvoiceData;

  writePurchaseOrdersToLocal([po], storage);

  const match = await confirmPurchaseOrderMatch({
    invoiceId: invoice.id,
    purchaseOrderId: po.id,
    invoice,
    purchaseOrder: po,
    lines: [
      {
        invoiceLineId: "inv-line-1",
        purchaseOrderLineId: "pol-fin-1",
        matchedQuantity: 50,
        matchedAmount: 50000,
      },
    ],
    storage,
  });

  await unmatchPurchaseOrderMatch(match.id, "Vendor disputed line quantities", storage);

  const allMatches = readPurchaseOrderMatchesFromLocal(storage);
  assert.equal(allMatches.length, 1, "Match record must NOT be deleted");

  const preserved = allMatches[0];
  assert.equal(preserved.id, match.id);
  assert.equal(preserved.status, "UNMATCHED");
  assert.equal(preserved.unmatchReason, "Vendor disputed line quantities");
  assert.ok(preserved.unmatchedAt, "Unmatched timestamp must be present");
  assert.equal(preserved.lines?.length, 1, "Match lines must be preserved for historical audit");
  assert.equal(preserved.lines![0].matchedQuantity, 50);
});

test("purchaseOrderMatchingInvariants: cross-company matching is strictly rejected", async () => {
  clearCompanyContext();
  setActiveCompanyId("comp-1");
  const storage = createMockStorage();

  const poComp2: PurchaseOrder = {
    ...createBasePO(),
    id: "po-comp-2",
    companyId: "comp-2", // Different company
  };

  const invoiceComp1 = {
    ...createBaseInvoice(),
    companyId: "comp-1",
    vendorId: "vend-1",
  } as InvoiceData;

  writePurchaseOrdersToLocal([poComp2], storage);

  await assert.rejects(
    () =>
      confirmPurchaseOrderMatch({
        invoiceId: invoiceComp1.id,
        purchaseOrderId: poComp2.id,
        invoice: invoiceComp1,
        purchaseOrder: poComp2,
        storage,
      }),
    /Cross-company purchase order match is not permitted/,
  );
});

test("purchaseOrderMatchingInvariants: only one active CONFIRMED match can exist per invoice", async () => {
  clearCompanyContext();
  setActiveCompanyId("comp-1");
  const storage = createMockStorage();

  const po1 = createBasePO();
  const po2: PurchaseOrder = {
    ...createBasePO(),
    id: "po-fin-2",
    poNumber: "PO-2026-998",
  };

  const invoice = {
    ...createBaseInvoice(),
    companyId: "comp-1",
    vendorId: "vend-1",
  } as InvoiceData;

  writePurchaseOrdersToLocal([po1, po2], storage);

  // First match succeeds
  const match1 = await confirmPurchaseOrderMatch({
    invoiceId: invoice.id,
    purchaseOrderId: po1.id,
    invoice,
    purchaseOrder: po1,
    storage,
  });
  assert.equal(match1.status, "CONFIRMED");

  // Second match on same invoice without unmatching fails
  await assert.rejects(
    () =>
      confirmPurchaseOrderMatch({
        invoiceId: invoice.id,
        purchaseOrderId: po2.id,
        invoice,
        purchaseOrder: po2,
        storage,
      }),
    /An active confirmed match already exists for this invoice/,
  );

  // Once unconfirmed, new match can be confirmed
  await unmatchPurchaseOrderMatch(match1.id, "Reassigning to correct purchase order", storage);

  const match2 = await confirmPurchaseOrderMatch({
    invoiceId: invoice.id,
    purchaseOrderId: po2.id,
    invoice,
    purchaseOrder: po2,
    storage,
  });
  assert.equal(match2.status, "CONFIRMED");
});
