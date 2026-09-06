import assert from "node:assert/strict";
import test from "node:test";
import { buildWarehouseReceiptPresentationSources } from "../src/lib/inventoryReceiptPresentation.ts";
import type { PurchaseOrder, PurchaseOrderReceipt } from "../src/types.ts";

const purchaseOrder = {
  id: "po-1",
  poNumber: "PO-001",
  lines: [
    { id: "po-line-1", lineNumber: 1, description: "Cement", quantity: 100, unit: "bags" },
  ],
} as unknown as PurchaseOrder;

function receipt(id: string, receivedQuantity: number): PurchaseOrderReceipt {
  return {
    id,
    purchaseOrderId: purchaseOrder.id,
    receiptNumber: `REC-${id}`,
    receiptDate: "2026-09-06",
    status: "RECEIVED",
    lines: [{
      id: `${id}-line`,
      purchaseOrderReceiptId: id,
      purchaseOrderLineId: "po-line-1",
      lineNumber: 1,
      receivedQuantity,
    }],
  } as PurchaseOrderReceipt;
}

test("warehouse receipt presentation uses actual received quantity instead of PO ordered quantity", () => {
  const sources = buildWarehouseReceiptPresentationSources([purchaseOrder], [receipt("r1", 40)]);
  assert.equal(sources.purchaseOrders.length, 1);
  assert.equal(sources.receipts.length, 1);
  assert.equal(sources.purchaseOrders[0]?.lines?.[0]?.quantity, 40);
  assert.notEqual(sources.receipts[0]?.purchaseOrderId, purchaseOrder.id, "presentation PO identity is receipt scoped");
  assert.equal(sources.receipts[0]?.purchaseOrderId, sources.purchaseOrders[0]?.id);
});

test("multiple partial receipts of the same PO line remain distinct", () => {
  const sources = buildWarehouseReceiptPresentationSources([purchaseOrder], [receipt("r1", 40), receipt("r2", 60)]);
  assert.deepEqual(sources.purchaseOrders.map((po) => po.lines?.[0]?.quantity), [40, 60]);
  assert.equal(new Set(sources.purchaseOrders.map((po) => po.id)).size, 2);
  assert.deepEqual(sources.receipts.map((row) => row.purchaseOrderId), sources.purchaseOrders.map((po) => po.id));
});
