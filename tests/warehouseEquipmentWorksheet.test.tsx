import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  InventoryBalance,
  InventoryItem,
  InventoryMovement,
} from "../src/lib/inventory.ts";
import type { Equipment } from "../src/types.ts";
import {
  buildWarehouseItemSavePlan,
  warehouseItemWorksheetRow,
  WarehouseItemWorksheetModal,
} from "../src/components/inventory/WarehouseItemWorksheet.tsx";
import {
  buildCanonicalEquipmentSavePlan,
  canonicalEquipmentWorksheetRow,
  CanonicalEquipmentWorksheetModal,
} from "../src/components/equipment/CanonicalEquipmentWorksheet.tsx";
import { saveWorksheetRowsSequentially } from "../src/components/ui/worksheetDraftState.ts";

const inventoryItem: InventoryItem = {
  id: "item-1",
  companyId: "company-1",
  itemName: "Ready-mix concrete",
  itemCode: "INV-001",
  category: "Concrete",
  stockUnit: "cu.m",
  status: "INACTIVE",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const inventoryBalance: InventoryBalance = {
  inventoryItemId: inventoryItem.id,
  itemName: inventoryItem.itemName,
  itemCode: inventoryItem.itemCode,
  category: inventoryItem.category,
  stockUnit: inventoryItem.stockUnit,
  status: inventoryItem.status,
  onHandQuantity: 12,
  openingQuantity: 10,
  receivedQuantity: 4,
  issuedQuantity: 3,
  returnedQuantity: 1,
  movementCount: 2,
  latestEffectiveDate: "2026-09-20",
};

const inventoryMovement: InventoryMovement = {
  id: "movement-1",
  companyId: "company-1",
  inventoryItemId: inventoryItem.id,
  movementType: "OPENING",
  direction: "IN",
  quantity: 10,
  stockUnitSnapshot: "cu.m",
  reason: "Opening count",
  sourceType: "MANUAL",
  idempotencyKey: "opening-1",
  effectiveDate: "2026-09-20",
};

const equipment: Equipment = {
  id: "equipment-1",
  companyId: "company-1",
  assetReference: "EX-004",
  equipmentName: "CAT 320 Excavator",
  equipmentType: "Earthworks",
  equipmentSource: "OWNED",
  providerName: "HydroQualiSense",
  lifecycleStatus: "MAINTENANCE",
  currentState: "ASSIGNED",
  currentAssignmentId: "assignment-1",
  currentProjectId: "project-1",
  currentAssignmentStart: "2026-09-20",
  notes: "North access road",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

test("Warehouse item save plans normalize safe fields and preserve existing status", () => {
  const row = warehouseItemWorksheetRow(inventoryItem, { balance: { ...inventoryBalance, movementCount: 0 } });
  row.itemName = "  Ready-mix concrete  ";
  row.itemCode = " inv-002 ";
  row.category = "  Concrete  ";
  row.stockUnit = "  KG ";

  const plan = buildWarehouseItemSavePlan([row], new Set([row.id]));

  assert.equal(plan.valid, true);
  assert.deepEqual(plan.entries[0]?.input, {
    id: inventoryItem.id,
    itemName: "Ready-mix concrete",
    itemCode: "INV-002",
    category: "Concrete",
    stockUnit: "kg",
    status: "INACTIVE",
  });
  assert.equal("onHandQuantity" in (plan.entries[0]?.input || {}), false);
  assert.equal("movementType" in (plan.entries[0]?.input || {}), false);
});

test("Warehouse item save plans require a name and canonical stock unit", () => {
  const row = warehouseItemWorksheetRow({
    ...inventoryItem,
    id: "draft-item-1",
    itemName: "",
    stockUnit: "",
  }, { isNew: true });

  const plan = buildWarehouseItemSavePlan([row], new Set([row.id]));

  assert.equal(plan.valid, false);
  assert.deepEqual(plan.issues[row.id], [
    { columnKey: "itemName", message: "Item name is required." },
    { columnKey: "stockUnit", message: "A canonical stock unit is required." },
  ]);
});

test("Warehouse item save plans reject stock-unit changes after movement or project usage history", () => {
  const row = warehouseItemWorksheetRow(inventoryItem, { balance: inventoryBalance, hasProjectRequirement: true });
  row.stockUnit = "kg";

  const plan = buildWarehouseItemSavePlan([row], new Set([row.id]));

  assert.equal(plan.valid, false);
  assert.deepEqual(plan.issues[row.id], [
    { columnKey: "stockUnit", message: "Stock unit is protected after movement history or project usage links exist." },
  ]);
});

test("Warehouse item worksheet protects status, derived balances, and movement context", () => {
  const html = renderToStaticMarkup(
    <WarehouseItemWorksheetModal
      items={[inventoryItem]}
      balances={[inventoryBalance]}
      movements={[inventoryMovement]}
      projectMaterials={[]}
      canManage
      initialItemId={inventoryItem.id}
      onClose={() => undefined}
      onSave={async () => inventoryItem}
    />,
  );

  assert.match(html, /data-worksheet-responsive-surface="warehouse-item-master"/);
  assert.match(html, /data-worksheet-cell="item-1:itemName"[^>]*data-worksheet-editable="true"/);
  assert.match(html, /data-worksheet-cell="item-1:stockUnit"[^>]*data-worksheet-protected="true"/);
  assert.match(html, /data-worksheet-cell="item-1:status"[^>]*data-worksheet-protected="true"/);
  assert.match(html, /data-worksheet-cell="item-1:onHandQuantity"[^>]*data-worksheet-protected="true"/);
  assert.match(html, /data-worksheet-cell="item-1:movementCount"[^>]*data-worksheet-protected="true"/);
  assert.doesNotMatch(html, /Record movement|Receive stock|Issue to project|Return from project/);
});

test("canonical Equipment save plans normalize safe metadata, preserve identity and lifecycle, and exclude assignment state", () => {
  const row = canonicalEquipmentWorksheetRow(equipment);
  row.assetReference = " ex-009 ";
  row.equipmentName = "  CAT 320 Excavator  ";
  row.equipmentType = "  Earthworks  ";
  row.providerName = "  Provider A  ";
  row.notes = "  Serviced  ";

  const plan = buildCanonicalEquipmentSavePlan([row], new Set([row.id]));

  assert.equal(plan.valid, true);
  assert.deepEqual(plan.entries[0]?.input, {
    id: equipment.id,
    assetReference: "EX-009",
    equipmentName: "CAT 320 Excavator",
    equipmentType: "Earthworks",
    equipmentSource: "OWNED",
    providerName: "Provider A",
    lifecycleStatus: "MAINTENANCE",
    notes: "Serviced",
  });
  assert.equal("currentState" in (plan.entries[0]?.input || {}), false);
  assert.equal("currentProjectId" in (plan.entries[0]?.input || {}), false);
  assert.equal("currentAssignmentId" in (plan.entries[0]?.input || {}), false);
});

test("canonical Equipment worksheet protects lifecycle and assignment state while allowing metadata edits", () => {
  const html = renderToStaticMarkup(
    <CanonicalEquipmentWorksheetModal
      equipment={[equipment]}
      projects={[{ id: "project-1", projectCode: "P-001", projectName: "Warehouse Expansion" } as never]}
      canManage
      initialEquipmentId={equipment.id}
      onClose={() => undefined}
      onSave={async () => equipment}
    />,
  );

  assert.match(html, /data-worksheet-responsive-surface="canonical-equipment-master"/);
  assert.match(html, /data-worksheet-cell="equipment-1:equipmentName"[^>]*data-worksheet-editable="true"/);
  assert.match(html, /data-worksheet-cell="equipment-1:lifecycleStatus"[^>]*data-worksheet-protected="true"/);
  assert.match(html, /data-worksheet-cell="equipment-1:currentState"[^>]*data-worksheet-protected="true"/);
  assert.match(html, /data-worksheet-cell="equipment-1:currentProjectId"[^>]*data-worksheet-protected="true"/);
  assert.match(html, /data-worksheet-cell="equipment-1:currentAssignmentId"[^>]*data-worksheet-protected="true"/);
  assert.doesNotMatch(html, /data-worksheet-cell="equipment-1:(assign|transfer|return)/i);
});

test("master-data worksheet sequential saves retain failed rows and continue later rows", async () => {
  const calls: string[] = [];
  const result = await saveWorksheetRowsSequentially(
    [
      { rowKey: "item-1", input: "first" },
      { rowKey: "equipment-1", input: "second" },
      { rowKey: "item-2", input: "third" },
    ],
    async ({ rowKey, input }) => {
      calls.push(`${rowKey}:${input}`);
      if (rowKey === "equipment-1") throw new Error("equipment failed");
    },
  );

  assert.deepEqual(calls, ["item-1:first", "equipment-1:second", "item-2:third"]);
  assert.deepEqual(result.savedRowKeys, ["item-1", "item-2"]);
  assert.deepEqual(result.failures, [{ rowKey: "equipment-1", message: "equipment failed" }]);
});
