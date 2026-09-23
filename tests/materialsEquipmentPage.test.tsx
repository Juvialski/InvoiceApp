import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectMaterialsEquipment } from "../src/components/projects/ProjectMaterialsEquipment.tsx";
import type { Project, ProjectMaterial } from "../src/types.ts";
import type { InventoryItem } from "../src/lib/inventory.ts";

const project = { id: "demo-project-solar", projectCode: "SOL-01", projectName: "Solar Retrofit" } as Project;
const material: ProjectMaterial = {
  id: "demo-material-conduit",
  projectId: project.id,
  inventoryItemId: "demo-inventory-conduit",
  materialName: "110mm heavy-duty PVC conduit",
  referenceCode: "MAT-SOL-CON-110",
  category: "Electrical",
  unit: "pcs",
  requiredQuantity: 800,
  status: "ACTIVE",
};
const inventoryItem: InventoryItem = {
  id: "demo-inventory-conduit",
  itemName: "PVC Conduit 110mm",
  itemCode: "MAT-CON-110",
  category: "Conduit",
  stockUnit: "pcs",
  status: "ACTIVE",
};

test("project material browse keeps requirements and linked Warehouse identity beside the canonical media slot", () => {
  const html = renderToStaticMarkup(
    <ProjectMaterialsEquipment
      project={project}
      materials={[material]}
      inventoryItems={[inventoryItem]}
      inventoryMovements={[]}
      inventoryBalances={[]}
      canReadInventory
      canReadEquipment={false}
      canReadSiteLogs={false}
      canReadProcurement={false}
      guestMode
    />,
  );

  assert.match(html, /110mm heavy-duty PVC conduit/);
  assert.match(html, /MAT-SOL-CON-110/);
  assert.match(html, /Planned requirement/);
  assert.match(html, /PVC Conduit 110mm/);
  assert.match(html, /Current warehouse on-hand/);
  assert.match(html, /data-entity-media-thumbnail="true"/);
  assert.match(html, /data-entity-media-fallback="true"/);
});

test("project material browse hides linked item media when Warehouse read permission is absent", () => {
  const html = renderToStaticMarkup(
    <ProjectMaterialsEquipment
      project={project}
      materials={[material]}
      inventoryItems={[inventoryItem]}
      inventoryMovements={[]}
      inventoryBalances={[]}
      canReadInventory={false}
      canReadEquipment={false}
      canReadSiteLogs={false}
      canReadProcurement={false}
      guestMode
    />,
  );

  assert.match(html, /Restricted/);
  assert.doesNotMatch(html, /data-entity-media-thumbnail/);
  assert.doesNotMatch(html, /PVC Conduit 110mm/);
});
