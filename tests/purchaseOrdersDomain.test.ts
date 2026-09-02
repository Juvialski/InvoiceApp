import test from "node:test";
import assert from "node:assert/strict";
import type { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus } from "../src/types.ts";
import { isCommittedPurchaseOrder, isVoidedPurchaseOrder, purchaseOrderTotal } from "../src/utils/projectCosting.ts";

function samplePO(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po-1",
    poNumber: "PO-2026-001",
    vendorId: "vendor-1",
    projectId: "proj-1",
    currency: "PHP",
    status: "DRAFT",
    totalAmount: 15000,
    lines: [
      {
        id: "line-1",
        purchaseOrderId: "po-1",
        lineNumber: 1,
        description: "Rebar 16mm",
        quantity: 100,
        unit: "pcs",
        unitPrice: 100,
        amount: 10000,
        projectCostCodeId: "cc-1",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "line-2",
        purchaseOrderId: "po-1",
        lineNumber: 2,
        description: "Portland Cement",
        quantity: 20,
        unit: "bags",
        unitPrice: 250,
        amount: 5000,
        projectCostCodeId: "cc-1",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("purchaseOrderTotal correctly calculates sum of line items", () => {
  const po = samplePO();
  assert.equal(purchaseOrderTotal(po), 15000);
});

test("purchaseOrderTotal falls back to totalAmount if no lines exist", () => {
  const po = samplePO({ lines: [], totalAmount: 25000 });
  assert.equal(purchaseOrderTotal(po), 25000);
});

test("isCommittedPurchaseOrder returns true ONLY for APPROVED and ISSUED statuses", () => {
  assert.equal(isCommittedPurchaseOrder(samplePO({ status: "DRAFT" })), false);
  assert.equal(isCommittedPurchaseOrder(samplePO({ status: "APPROVED" })), true);
  assert.equal(isCommittedPurchaseOrder(samplePO({ status: "ISSUED" })), true);
  assert.equal(isCommittedPurchaseOrder(samplePO({ status: "CLOSED" })), false);
  assert.equal(isCommittedPurchaseOrder(samplePO({ status: "CANCELLED" })), false);
});

test("isVoidedPurchaseOrder returns true for CANCELLED status", () => {
  assert.equal(isVoidedPurchaseOrder(samplePO({ status: "DRAFT" })), false);
  assert.equal(isVoidedPurchaseOrder(samplePO({ status: "APPROVED" })), false);
  assert.equal(isVoidedPurchaseOrder(samplePO({ status: "ISSUED" })), false);
  assert.equal(isVoidedPurchaseOrder(samplePO({ status: "CLOSED" })), false);
  assert.equal(isVoidedPurchaseOrder(samplePO({ status: "CANCELLED" })), true);
});
