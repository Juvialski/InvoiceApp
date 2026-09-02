import test from "node:test";
import assert from "node:assert/strict";
import type { Project } from "../src/types.ts";
import { buildProjectLifecyclePreview, parseProjectLifecyclePreview } from "../src/lib/projects.ts";

const sampleProject: Project = {
  id: "proj-101",
  projectName: "Solar Plant Alpha",
  projectCode: "SOL-01",
  projectBudget: 0,
  currency: "PHP",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

test("projectLifecycleProcurementSafety: allows deleting an unused project when zero dependencies exist including purchase orders", () => {
  const preview = buildProjectLifecyclePreview(sampleProject, {
    purchaseOrders: 0,
    invoiceProjectAllocations: 0,
    expenses: 0,
  });

  assert.equal(preview.canDelete, true);
  assert.equal(preview.totalDependencyCount, 0);
  assert.equal(preview.dependencies.purchaseOrders, 0);
  assert.equal(preview.recommendedAction, "DELETE_UNUSED");
  assert.equal(preview.blockedReason, undefined);
});

test("projectLifecycleProcurementSafety: strictly blocks deletion and recommends ARCHIVE when project has purchase orders", () => {
  const preview = buildProjectLifecyclePreview(sampleProject, {
    purchaseOrders: 3,
    invoiceProjectAllocations: 0,
    expenses: 0,
  });

  assert.equal(preview.canDelete, false);
  assert.equal(preview.totalDependencyCount, 3);
  assert.equal(preview.dependencies.purchaseOrders, 3);
  assert.equal(preview.recommendedAction, "ARCHIVE");
  assert.match(preview.blockedReason || "", /operational or financial history and cannot be permanently deleted/);
});

test("projectLifecycleProcurementSafety: parses database preflight payload containing purchaseOrders count", () => {
  const dbPayload = {
    projectId: "proj-101",
    projectCode: "SOL-01",
    projectName: "Solar Plant Alpha",
    status: "ACTIVE",
    canDelete: false,
    canReactivate: false,
    recommendedAction: "ARCHIVE",
    blockedReason: "This project has operational or financial history and cannot be permanently deleted. Archive it instead.",
    totalDependencyCount: 2,
    dependencies: {
      invoiceProjectAllocations: 0,
      expenses: 0,
      projectWorkerAssignments: 0,
      workEntries: 0,
      overtimeRequests: 0,
      payrollProjectAllocations: 0,
      payrollEntryProjectContexts: 0,
      payrollImportRows: 0,
      workerDefaultProjects: 0,
      compensationProfileDefaultProjects: 0,
      engineeringDocuments: 0,
      engineeringRfis: 0,
      engineeringSubmittals: 0,
      engineeringDailySiteLogs: 0,
      projectAccountingEvents: 0,
      purchaseOrders: 2,
    },
    source: "database",
  };

  const parsed = parseProjectLifecyclePreview(dbPayload);
  assert.equal(parsed.dependencies.purchaseOrders, 2);
  assert.equal(parsed.canDelete, false);
  assert.equal(parsed.recommendedAction, "ARCHIVE");
});