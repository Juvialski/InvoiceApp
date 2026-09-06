import type { InventoryItem, InventoryMovement } from "../../lib/inventory.ts";
import { addDemoDays, demoTimestamp } from "./demoDates.ts";
import { DEMO_COMPANY_ID } from "../demoTypes.ts";
import { DEMO_MATERIAL_IDS } from "./materialsEquipment.ts";
import { DEMO_PROJECT_IDS } from "./projects.ts";
import { DEMO_INVENTORY_ITEM_IDS } from "./inventoryIds.ts";

export { DEMO_INVENTORY_ITEM_IDS } from "./inventoryIds.ts";

export function createDemoInventoryItems(anchorDate: string): InventoryItem[] {
  const createdAt = demoTimestamp(addDemoDays(anchorDate, -74), 8, 30);
  return [
    { id: DEMO_INVENTORY_ITEM_IDS.concrete, companyId: DEMO_COMPANY_ID, itemName: "Ready-mix concrete 28 MPa", itemCode: "INV-CON-028", category: "Concrete", stockUnit: "cu.m", status: "ACTIVE", createdAt, updatedAt: demoTimestamp(anchorDate, 9, 45) },
    { id: DEMO_INVENTORY_ITEM_IDS.aggregate, companyId: DEMO_COMPANY_ID, itemName: "Graded crushed aggregate base course", itemCode: "INV-AGG-201", category: "Drainage / earthworks", stockUnit: "cu.m", status: "ACTIVE", createdAt, updatedAt: demoTimestamp(anchorDate, 9, 46) },
    { id: DEMO_INVENTORY_ITEM_IDS.conduit, companyId: DEMO_COMPANY_ID, itemName: "110mm heavy-duty PVC conduit", itemCode: "INV-CON-110", category: "Electrical", stockUnit: "pcs", status: "ACTIVE", createdAt, updatedAt: demoTimestamp(anchorDate, 9, 47) },
    { id: DEMO_INVENTORY_ITEM_IDS.fasteners, companyId: DEMO_COMPANY_ID, itemName: "Temporary formwork fasteners", itemCode: "INV-FAST-001", category: "Temporary works", stockUnit: "boxes", status: "ACTIVE", createdAt, updatedAt: demoTimestamp(anchorDate, 9, 48) },
  ];
}

function movement(
  id: string,
  anchorDate: string,
  input: Omit<InventoryMovement, "id" | "companyId" | "createdAt" | "effectiveDate"> & { day: number; hour?: number },
): InventoryMovement {
  const createdAt = demoTimestamp(addDemoDays(anchorDate, input.day), input.hour || 9, 0);
  return { ...input, id, companyId: DEMO_COMPANY_ID, effectiveDate: createdAt.slice(0, 10), createdAt };
}

export function createDemoInventoryMovements(anchorDate: string): InventoryMovement[] {
  return [
    movement("demo-inventory-movement-concrete-opening", anchorDate, { day: -70, inventoryItemId: DEMO_INVENTORY_ITEM_IDS.concrete, movementType: "OPENING", direction: "IN", quantity: 60, stockUnitSnapshot: "cu.m", projectId: null, projectMaterialId: null, reason: "Opening physical count", reference: "COUNT-2026-07", sourceType: "MANUAL", purchaseOrderReceiptId: null, purchaseOrderLineId: null, reversalOfMovementId: null, idempotencyKey: "demo-inventory-concrete-opening", createdByUserId: "demo-user-warehouse" }),
    movement("demo-inventory-movement-concrete-receipt", anchorDate, { day: -60, inventoryItemId: DEMO_INVENTORY_ITEM_IDS.concrete, movementType: "RECEIPT", direction: "IN", quantity: 80, stockUnitSnapshot: "cu.m", projectId: null, projectMaterialId: null, reason: "Receive first concrete batch into warehouse custody", reference: "REC-24-0015", sourceType: "PURCHASE_ORDER_RECEIPT", purchaseOrderReceiptId: "demo-po-rec-wh-01", purchaseOrderLineId: "demo-po-line-wh-04", reversalOfMovementId: null, idempotencyKey: "demo-inventory-concrete-receipt-001", createdByUserId: "demo-user-warehouse" }),
    movement("demo-inventory-movement-concrete-issue", anchorDate, { day: -45, inventoryItemId: DEMO_INVENTORY_ITEM_IDS.concrete, movementType: "PROJECT_ISSUE", direction: "OUT", quantity: 50, stockUnitSnapshot: "cu.m", projectId: DEMO_PROJECT_IDS.warehouse, projectMaterialId: DEMO_MATERIAL_IDS.warehouseConcrete, reason: "Loading-bay slab pour issue", reference: "ISSUE-WH-014", sourceType: "MANUAL", purchaseOrderReceiptId: null, purchaseOrderLineId: null, reversalOfMovementId: null, idempotencyKey: "demo-inventory-concrete-issue-001", createdByUserId: "demo-user-warehouse" }),
    movement("demo-inventory-movement-concrete-return", anchorDate, { day: -42, inventoryItemId: DEMO_INVENTORY_ITEM_IDS.concrete, movementType: "PROJECT_RETURN", direction: "IN", quantity: 5, stockUnitSnapshot: "cu.m", projectId: DEMO_PROJECT_IDS.warehouse, projectMaterialId: DEMO_MATERIAL_IDS.warehouseConcrete, reason: "Unused concrete returned from pour package", reference: "RETURN-WH-003", sourceType: "MANUAL", purchaseOrderReceiptId: null, purchaseOrderLineId: null, reversalOfMovementId: null, idempotencyKey: "demo-inventory-concrete-return-001", createdByUserId: "demo-user-warehouse" }),
    movement("demo-inventory-movement-aggregate-opening", anchorDate, { day: -50, inventoryItemId: DEMO_INVENTORY_ITEM_IDS.aggregate, movementType: "OPENING", direction: "IN", quantity: 300, stockUnitSnapshot: "cu.m", projectId: null, projectMaterialId: null, reason: "Opening physical count", reference: "COUNT-2026-07", sourceType: "MANUAL", purchaseOrderReceiptId: null, purchaseOrderLineId: null, reversalOfMovementId: null, idempotencyKey: "demo-inventory-aggregate-opening", createdByUserId: "demo-user-warehouse" }),
    movement("demo-inventory-movement-aggregate-issue", anchorDate, { day: -18, inventoryItemId: DEMO_INVENTORY_ITEM_IDS.aggregate, movementType: "PROJECT_ISSUE", direction: "OUT", quantity: 120, stockUnitSnapshot: "cu.m", projectId: DEMO_PROJECT_IDS.drainage, projectMaterialId: DEMO_MATERIAL_IDS.drainageAggregate, reason: "Trench bedding and catch-basin issue", reference: "ISSUE-DR-021", sourceType: "MANUAL", purchaseOrderReceiptId: null, purchaseOrderLineId: null, reversalOfMovementId: null, idempotencyKey: "demo-inventory-aggregate-issue-001", createdByUserId: "demo-user-warehouse" }),
    movement("demo-inventory-movement-conduit-opening", anchorDate, { day: -25, inventoryItemId: DEMO_INVENTORY_ITEM_IDS.conduit, movementType: "OPENING", direction: "IN", quantity: 100, stockUnitSnapshot: "pcs", projectId: null, projectMaterialId: null, reason: "Opening physical count", reference: "COUNT-2026-08", sourceType: "MANUAL", purchaseOrderReceiptId: null, purchaseOrderLineId: null, reversalOfMovementId: null, idempotencyKey: "demo-inventory-conduit-opening", createdByUserId: "demo-user-warehouse" }),
    movement("demo-inventory-movement-conduit-receipt", anchorDate, { day: -15, inventoryItemId: DEMO_INVENTORY_ITEM_IDS.conduit, movementType: "RECEIPT", direction: "IN", quantity: 500, stockUnitSnapshot: "pcs", projectId: null, projectMaterialId: null, reason: "Receive first conduit batch into warehouse custody", reference: "REC-25-0003", sourceType: "PURCHASE_ORDER_RECEIPT", purchaseOrderReceiptId: "demo-po-rec-sol-01", purchaseOrderLineId: "demo-po-line-sol-01", reversalOfMovementId: null, idempotencyKey: "demo-inventory-conduit-receipt-001", createdByUserId: "demo-user-warehouse" }),
    movement("demo-inventory-movement-conduit-issue", anchorDate, { day: -7, inventoryItemId: DEMO_INVENTORY_ITEM_IDS.conduit, movementType: "PROJECT_ISSUE", direction: "OUT", quantity: 200, stockUnitSnapshot: "pcs", projectId: DEMO_PROJECT_IDS.solar, projectMaterialId: DEMO_MATERIAL_IDS.solarConduit, reason: "Initial solar conduit issue", reference: "ISSUE-SOL-007", sourceType: "MANUAL", purchaseOrderReceiptId: null, purchaseOrderLineId: null, reversalOfMovementId: null, idempotencyKey: "demo-inventory-conduit-issue-001", createdByUserId: "demo-user-warehouse" }),
    movement("demo-inventory-movement-fasteners-opening", anchorDate, { day: -12, inventoryItemId: DEMO_INVENTORY_ITEM_IDS.fasteners, movementType: "OPENING", direction: "IN", quantity: 24, stockUnitSnapshot: "boxes", projectId: null, projectMaterialId: null, reason: "Opening physical count", reference: "COUNT-2026-08", sourceType: "MANUAL", purchaseOrderReceiptId: null, purchaseOrderLineId: null, reversalOfMovementId: null, idempotencyKey: "demo-inventory-fasteners-opening", createdByUserId: "demo-user-warehouse" }),
  ];
}
