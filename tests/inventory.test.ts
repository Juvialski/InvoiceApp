import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveInventoryBalances,
  deriveProjectInventoryUsage,
  inventoryMovementFromRow,
  recordInventoryMovementLocally,
  type InventoryItem,
  type InventoryMovement,
} from "../src/lib/inventory.ts";

const item: InventoryItem = {
  id: "item-1",
  companyId: "company-1",
  itemName: "Concrete",
  itemCode: "CON-001",
  category: "Concrete",
  stockUnit: "cu.m",
  status: "ACTIVE",
};

function movement(overrides: Partial<InventoryMovement> & Pick<InventoryMovement, "id" | "movementType" | "direction" | "quantity">): InventoryMovement {
  return {
    companyId: "company-1",
    inventoryItemId: item.id,
    stockUnitSnapshot: item.stockUnit,
    projectId: null,
    projectMaterialId: null,
    reason: "Test movement",
    reference: null,
    sourceType: "MANUAL",
    purchaseOrderReceiptId: null,
    purchaseOrderLineId: null,
    reversalOfMovementId: null,
    idempotencyKey: overrides.id,
    effectiveDate: "2026-09-06",
    createdAt: `2026-09-06T0${overrides.id.slice(-1)}:00:00.000Z`,
    ...overrides,
  };
}

test("inventory balances reconcile movement categories and compensating reversals", () => {
  const movements = [
    movement({ id: "m-1", movementType: "OPENING", direction: "IN", quantity: 100 }),
    movement({ id: "m-2", movementType: "RECEIPT", direction: "IN", quantity: 20 }),
    movement({ id: "m-3", movementType: "PROJECT_ISSUE", direction: "OUT", quantity: 60, projectId: "project-1" }),
    movement({ id: "m-4", movementType: "PROJECT_RETURN", direction: "IN", quantity: 10, projectId: "project-1" }),
    movement({ id: "m-5", movementType: "REVERSAL", direction: "OUT", quantity: 20, reversalOfMovementId: "m-2" }),
  ];
  const [balance] = deriveInventoryBalances([item], movements);
  assert.equal(balance?.onHandQuantity, 50);
  assert.equal(balance?.openingQuantity, 100);
  assert.equal(balance?.receivedQuantity, 0);
  assert.equal(balance?.issuedQuantity, 60);
  assert.equal(balance?.returnedQuantity, 10);
  assert.equal(balance?.movementCount, 5);
  assert.deepEqual(deriveProjectInventoryUsage("project-1", item.id, movements), {
    issuedQuantity: 60,
    returnedQuantity: 10,
    availableToReturn: 50,
    movementCount: 2,
  });
});

test("local movement application is fail-closed and idempotent", () => {
  const opening = movement({ id: "m-open", movementType: "OPENING", direction: "IN", quantity: 10 });
  const issue = recordInventoryMovementLocally({ movementType: "PROJECT_ISSUE", inventoryItemId: item.id, quantity: 7, projectId: "project-1", reason: "Issue to project", idempotencyKey: "issue-1" }, [item], [opening], { companyId: "company-1" });
  assert.equal(issue.direction, "OUT");
  assert.equal(recordInventoryMovementLocally({ movementType: "PROJECT_ISSUE", inventoryItemId: item.id, quantity: 7, projectId: "project-1", reason: "Retry issue", idempotencyKey: "issue-1" }, [item], [opening, issue], { companyId: "company-1" }), issue);
  assert.throws(() => recordInventoryMovementLocally({ movementType: "PROJECT_ISSUE", inventoryItemId: item.id, quantity: 4, projectId: "project-1", reason: "Over issue", idempotencyKey: "issue-2" }, [item], [opening, issue], { companyId: "company-1" }), /negative|Insufficient/i);
  assert.throws(() => recordInventoryMovementLocally({ movementType: "PROJECT_RETURN", inventoryItemId: item.id, quantity: 8, projectId: "project-1", reason: "Excess return", idempotencyKey: "return-1" }, [item], [opening, issue], { companyId: "company-1" }), /unreturned|exceeds/i);
});

test("movement row mapping preserves procurement void reconciliation state", () => {
  const parsed = inventoryMovementFromRow({
    id: "m-void",
    inventory_item_id: item.id,
    movement_type: "RECEIPT",
    direction: "IN",
    quantity: 4,
    stock_unit_snapshot: "cu.m",
    reason: "Receipt",
    source_type: "PURCHASE_ORDER_RECEIPT",
    purchase_order_receipt_id: "receipt-1",
    purchase_order_line_id: "line-1",
    source_purchase_order_receipt_status: "VOIDED",
    source_purchase_order_receipt_number: "REC-1",
    requires_reconciliation: true,
    idempotency_key: "receipt-1",
    effective_date: "2026-09-06",
  });
  assert.equal(parsed.requiresReconciliation, true);
  assert.equal(parsed.sourcePurchaseOrderReceiptStatus, "VOIDED");
  assert.equal(parsed.sourcePurchaseOrderReceiptNumber, "REC-1");
});
