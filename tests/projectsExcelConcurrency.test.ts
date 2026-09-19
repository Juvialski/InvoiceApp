import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("RFQ and purchase-order save clients pass expected updated_at tokens", () => {
  const rfqs = source("src/lib/rfqs.ts");
  const purchaseOrders = source("src/lib/purchaseOrders.ts");
  assert.match(rfqs, /expectedUpdatedAt\??: string/);
  assert.match(rfqs, /p_expected_updated_at\s*:\s*expectedUpdatedAt/);
  assert.match(purchaseOrders, /expectedUpdatedAt\??: string/);
  assert.match(purchaseOrders, /p_expected_updated_at\s*:\s*expectedUpdatedAt/);
});

test("project save uses the guarded RPC instead of an unconditional upsert", () => {
  const projects = source("src/lib/projects.ts");
  assert.match(projects, /supabase\.rpc\("save_project"/);
  assert.match(projects, /p_expected_updated_at\s*:\s*expectedUpdatedAt/);
  assert.doesNotMatch(projects, /supabase\.from\("projects"\)\.upsert/);
});

test("cost-control Apply has one grouped RPC boundary and rejects parent redirection client-side", () => {
  const costCodes = source("src/lib/projectCostCodes.ts");
  assert.match(costCodes, /applyProjectCostControlGroupToSupabase/);
  assert.match(costCodes, /apply_project_cost_control_group/);
  assert.match(costCodes, /expectedProjectUpdatedAt/);
  assert.match(costCodes, /projectId.*projectId|projectId.*same project/s);
  assert.doesNotMatch(costCodes, /saveProjectCostCodeToSupabase[\s\S]*for \(.*costCode/);
});

test("controller and page callback shapes preserve explicit expected versions", () => {
  const procurementController = source("src/features/procurement/useProcurementController.ts");
  const projectsController = source("src/features/projects/useProjectController.ts");
  const procurementPage = source("src/components/procurement/ProcurementPage.tsx");
  const projectsPage = source("src/components/projects/ProjectsPage.tsx");
  assert.match(procurementController, /expectedUpdatedAt\??: string/);
  assert.match(procurementController, /savePurchaseOrder\(po, lines, expectedUpdatedAt \|\| po\.updatedAt\)/);
  assert.match(procurementController, /saveRFQ\(rfq, lines, invitedVendorIds, expectedUpdatedAt \|\| rfq\.updatedAt\)/);
  assert.match(projectsController, /saveProjectToSupabase\(project, previous\?\.updatedAt\)/);
  assert.match(procurementPage, /expectedUpdatedAt\??: string/);
  assert.match(projectsPage, /onSaveProject: \(project: Project\) => Promise<void> \| void/);
});
