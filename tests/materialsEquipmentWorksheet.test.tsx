import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { InventoryItem } from "../src/lib/inventory.ts";
import type { Project, ProjectEquipment, ProjectMaterial } from "../src/types.ts";
import {
  buildProjectEquipmentSavePlan,
  buildProjectMaterialSavePlan,
  projectEquipmentWorksheetRow,
  projectMaterialWorksheetRow,
  ProjectMaterialsEquipmentWorksheetModal,
  saveWorksheetRowsSequentially,
} from "../src/components/projects/ProjectMaterialsEquipmentWorksheet.tsx";

const project = { id: "project-1", currency: "PHP" } as Project;

const material: ProjectMaterial = {
  id: "material-1",
  projectId: project.id,
  materialName: "Ready-mix concrete",
  referenceCode: "MAT-001",
  category: "Concrete",
  unit: "cu.m",
  requiredQuantity: 100,
  inventoryItemId: "inventory-1",
  projectCostCodeId: "cost-code-1",
  purchaseOrderId: "po-1",
  purchaseOrderLineId: "po-line-1",
  status: "ACTIVE",
  notes: "Pour sequence A",
};

const equipment: ProjectEquipment = {
  id: "equipment-1",
  projectId: project.id,
  canonicalEquipmentId: "canonical-equipment-1",
  assetReference: "EQ-004",
  equipmentName: "CAT 320 Excavator",
  equipmentType: "Earthworks",
  equipmentSource: "OWNED",
  providerName: "HydroQualiSense",
  assignmentStart: "2026-09-20",
  assignmentEnd: "2026-09-30",
  status: "ACTIVE",
  notes: "North access road",
};

test("material worksheet save plans normalize only safe register metadata", () => {
  const row = projectMaterialWorksheetRow(material);
  const plan = buildProjectMaterialSavePlan([row], new Set([row.id]));

  assert.equal(plan.valid, true);
  assert.deepEqual(plan.entries[0]?.input, {
    id: "material-1",
    projectId: "project-1",
    inventoryItemId: "inventory-1",
    materialName: "Ready-mix concrete",
    referenceCode: "MAT-001",
    category: "Concrete",
    unit: "cu.m",
    requiredQuantity: 100,
    projectCostCodeId: "cost-code-1",
    purchaseOrderId: "po-1",
    purchaseOrderLineId: "po-line-1",
    status: "ACTIVE",
    notes: "Pour sequence A",
  });
  assert.equal("receivedQuantity" in (plan.entries[0]?.input || {}), false);
  assert.equal("onHandQuantity" in (plan.entries[0]?.input || {}), false);
});

test("material worksheet save plans reject incomplete or negative staged rows", () => {
  const row = projectMaterialWorksheetRow({
    ...material,
    id: "draft-material-1",
    materialName: "",
    unit: "",
    requiredQuantity: -1,
    purchaseOrderId: "po-1",
    purchaseOrderLineId: null,
    isNew: true,
  });
  const plan = buildProjectMaterialSavePlan([row], new Set([row.id]));

  assert.equal(plan.valid, false);
  assert.deepEqual(plan.issues[row.id], [
    { columnKey: "materialName", message: "Material name is required." },
    { columnKey: "unit", message: "Unit is required." },
    { columnKey: "requiredQuantity", message: "Required quantity must be zero or greater." },
    { columnKey: "purchaseOrderLineId", message: "Choose a purchase-order line or clear the purchase-order link." },
  ]);
});

test("material worksheet save plans reject a warehouse link whose stock unit differs", () => {
  const row = projectMaterialWorksheetRow({ ...material, id: "material-unit-mismatch" });
  const plan = buildProjectMaterialSavePlan([row], new Set([row.id]), [
    { id: "inventory-1", itemName: "Ready-mix concrete", stockUnit: "kg", status: "ACTIVE", createdAt: "", updatedAt: "" } satisfies InventoryItem,
  ]);

  assert.equal(plan.valid, false);
  assert.deepEqual(plan.issues[row.id], [
    { columnKey: "inventoryItemId", message: "Warehouse item unit kg must match material unit cu.m." },
  ]);
});

test("equipment worksheet save plans exclude canonical Equipment Registry authority", () => {
  const row = projectEquipmentWorksheetRow(equipment);
  const plan = buildProjectEquipmentSavePlan([row], new Set([row.id]));

  assert.equal(plan.valid, true);
  assert.deepEqual(plan.entries[0]?.input, {
    id: "equipment-1",
    projectId: "project-1",
    assetReference: "EQ-004",
    equipmentName: "CAT 320 Excavator",
    equipmentType: "Earthworks",
    equipmentSource: "OWNED",
    providerName: "HydroQualiSense",
    assignmentStart: "2026-09-20",
    assignmentEnd: "2026-09-30",
    status: "ACTIVE",
    notes: "North access road",
  });
  assert.equal("canonicalEquipmentId" in (plan.entries[0]?.input || {}), false);
});

test("equipment worksheet save plans reject an end date before its project-register start date", () => {
  const row = projectEquipmentWorksheetRow({ ...equipment, assignmentEnd: "2026-09-19" });
  const plan = buildProjectEquipmentSavePlan([row], new Set([row.id]));

  assert.equal(plan.valid, false);
  assert.deepEqual(plan.issues[row.id], [
    { columnKey: "assignmentEnd", message: "Assignment end cannot be before assignment start." },
  ]);
});

test("sequential worksheet saves retain failed rows without hiding later failures", async () => {
  const calls: string[] = [];
  const result = await saveWorksheetRowsSequentially(
    [
      { rowKey: "row-1", input: "first" },
      { rowKey: "row-2", input: "second" },
      { rowKey: "row-3", input: "third" },
    ],
    async ({ rowKey, input }) => {
      calls.push(`${rowKey}:${input}`);
      if (rowKey !== "row-1") throw new Error(`${rowKey} failed`);
    },
  );

  assert.deepEqual(calls, ["row-1:first", "row-2:second", "row-3:third"]);
  assert.deepEqual(result.savedRowKeys, ["row-1"]);
  assert.deepEqual(result.failures, [
    { rowKey: "row-2", message: "row-2 failed" },
    { rowKey: "row-3", message: "row-3 failed" },
  ]);
});

test("material worksheet marks restricted procurement and inventory links protected", () => {
  const html = renderToStaticMarkup(
    <ProjectMaterialsEquipmentWorksheetModal
      kind="material"
      project={project}
      materials={[material]}
      equipment={[]}
      costCodes={[]}
      purchaseOrders={[]}
      inventoryItems={[]}
      canReadProcurement={false}
      canReadInventory={false}
      canManage
      onClose={() => undefined}
      onSaveMaterial={async () => undefined}
      onSaveEquipment={async () => undefined}
    />,
  );

  assert.match(html, /data-worksheet-responsive-surface="project-materials"/);
  assert.match(html, /data-worksheet-cell="material-1:materialName"[^>]*data-worksheet-editable="true"/);
  assert.match(html, /data-worksheet-cell="material-1:purchaseOrderLineId"[^>]*data-worksheet-protected="true"/);
  assert.match(html, /data-worksheet-cell="material-1:inventoryItemId"[^>]*data-worksheet-protected="true"/);
  assert.match(html, /PO receiving and warehouse on-hand remain protected/);
});

test("equipment worksheet keeps canonical identity protected while project metadata stays editable", () => {
  const html = renderToStaticMarkup(
    <ProjectMaterialsEquipmentWorksheetModal
      kind="equipment"
      project={project}
      materials={[]}
      equipment={[equipment]}
      costCodes={[]}
      purchaseOrders={[]}
      inventoryItems={[]}
      canReadProcurement={false}
      canReadInventory={false}
      canManage
      onClose={() => undefined}
      onSaveMaterial={async () => undefined}
      onSaveEquipment={async () => undefined}
    />,
  );

  assert.match(html, /data-worksheet-responsive-surface="project-equipment"/);
  assert.match(html, /data-worksheet-cell="equipment-1:canonicalEquipmentId"[^>]*data-worksheet-protected="true"/);
  assert.match(html, /data-worksheet-cell="equipment-1:assignmentStart"[^>]*data-worksheet-editable="true"/);
  assert.match(html, /Canonical Equipment Registry identity and assignment\/transfer\/return remain purpose-built/);
});
