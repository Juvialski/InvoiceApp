import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectLifecyclePreview, parseProjectLifecyclePreview } from "../src/lib/projects.ts";
import type { Project } from "../src/types.ts";
import { createDemoWorkspace } from "../src/demo/data/createDemoWorkspace.ts";
import { reduceDemoWorkspace } from "../src/demo/demoState.ts";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    projectCode: "ENG-001",
    projectName: "Unused project",
    status: "PLANNING",
    projectBudget: 0,
    currency: "PHP",
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
    ...overrides,
  };
}

test("unused project preview permits only the explicit unused delete path", () => {
  const preview = buildProjectLifecyclePreview(project());
  assert.equal(preview.canDelete, true);
  assert.equal(preview.recommendedAction, "DELETE_UNUSED");
  assert.equal(preview.totalDependencyCount, 0);
  assert.equal(preview.dependencies.projectAccountingEvents, 0);
});

test("any discovered project dependency switches the recommendation to archive", () => {
  const preview = buildProjectLifecyclePreview(project(), { expenses: 1, engineeringDocuments: 2 });
  assert.equal(preview.canDelete, false);
  assert.equal(preview.recommendedAction, "ARCHIVE");
  assert.equal(preview.totalDependencyCount, 3);
  assert.match(preview.blockedReason || "", /history.*cannot be permanently deleted/i);
});

test("archived projects can reactivate to a preserved non-terminal state", () => {
  const preview = buildProjectLifecyclePreview(project({ status: "ARCHIVED", archivedAt: "2026-08-29T01:00:00.000Z", archivedFromStatus: "ACTIVE" }), { expenses: 1 });
  assert.equal(preview.canDelete, false);
  assert.equal(preview.canReactivate, true);
  assert.equal(preview.recommendedAction, "REACTIVATE");
});

test("archived projects from terminal states are not offered reactivation", () => {
  const preview = buildProjectLifecyclePreview(project({ status: "ARCHIVED", archivedAt: "2026-08-29T01:00:00.000Z", archivedFromStatus: "COMPLETED" }));
  assert.equal(preview.canReactivate, false);
  assert.equal(preview.recommendedAction, "DELETE_UNUSED");
});

test("lifecycle response mapping keeps only bounded dependency counts", () => {
  const preview = parseProjectLifecyclePreview({
    projectId: "project-1",
    projectCode: "ENG-001",
    projectName: "Used project",
    status: "ACTIVE",
    canDelete: false,
    canReactivate: false,
    recommendedAction: "ARCHIVE",
    totalDependencyCount: 1,
    dependencies: { expenses: 1, employeeSalary: 999 },
  });
  assert.equal(preview.dependencies.expenses, 1);
  assert.equal(Object.hasOwn(preview.dependencies, "employeeSalary"), false);
});

test("demo project lifecycle archives and reactivates without removing linked history", () => {
  const state = createDemoWorkspace("2026-08-29");
  const project = state.projects[0];
  const linkedInvoiceCount = state.invoiceAllocations.filter((allocation) => allocation.projectId === project.id).length;
  const archived = reduceDemoWorkspace(state, { type: "PROJECT_LIFECYCLE", project, action: "ARCHIVE" });
  const archivedProject = archived.projects.find((candidate) => candidate.id === project.id);
  assert.equal(archivedProject?.status, "ARCHIVED");
  assert.equal(archivedProject?.archivedFromStatus, "ACTIVE");
  assert.equal(archived.invoiceAllocations.filter((allocation) => allocation.projectId === project.id).length, linkedInvoiceCount);
  const reactivated = reduceDemoWorkspace(archived, { type: "PROJECT_LIFECYCLE", project: archivedProject!, action: "REACTIVATE" });
  assert.equal(reactivated.projects.find((candidate) => candidate.id === project.id)?.status, "ACTIVE");
});
