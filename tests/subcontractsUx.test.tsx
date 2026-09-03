import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ProcurementPage } from "../src/components/procurement/ProcurementPage.tsx";
import { SubcontractEditorModal } from "../src/components/procurement/SubcontractEditorModal.tsx";
import { SubcontractCancellationModal } from "../src/components/procurement/SubcontractCancellationModal.tsx";
import { ProjectWorkspace } from "../src/components/projects/ProjectWorkspace.tsx";
import { AppPermissionProvider } from "../src/app/AppPermissionContext.tsx";
import { createDemoSubcontracts } from "../src/demo/data/procurement.ts";
import { createDemoWorkspace } from "../src/demo/data/createDemoWorkspace.ts";
import { defaultDemoAnchorDate } from "../src/demo/data/demoDates.ts";
import type { ProjectCostCode, Subcontract } from "../src/types.ts";

const anchorDate = defaultDemoAnchorDate();
const demoWorkspace = createDemoWorkspace(anchorDate);
const demoSubcontracts = demoWorkspace.subcontracts || createDemoSubcontracts(anchorDate);
const mockProjects = demoWorkspace.projects;
const mockVendors = demoWorkspace.vendors || [];
const mockCostCodes: ProjectCostCode[] = [
  {
    id: "demo-cc-wh-04",
    projectId: "demo-project-warehouse",
    code: "04-100",
    name: "Mechanical & HVAC Systems",
    approvedBudgetAmount: 2500000,
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "demo-cc-wh-02",
    projectId: "demo-project-warehouse",
    code: "02-100",
    name: "Structural Steel Works",
    approvedBudgetAmount: 3000000,
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

test("createDemoSubcontracts creates realistic engineering packages", () => {
  assert.ok(demoSubcontracts.length >= 2, "Expected at least 2 demo subcontracts");

  const hvac = demoSubcontracts.find((s) => s.subcontractNumber === "SC-2026-001");
  assert.ok(hvac, "SC-2026-001 must be present");
  assert.equal(hvac.status, "ACTIVE");
  assert.equal(hvac.originalAmount, 1_850_000);
  assert.equal(hvac.lines?.length, 2);
  assert.ok(hvac.lines?.every((l) => l.projectCostCodeId === "demo-cc-wh-04"));

  const steel = demoSubcontracts.find((s) => s.subcontractNumber === "SC-2026-002");
  assert.ok(steel, "SC-2026-002 must be present");
  assert.equal(steel.status, "DRAFT");
  assert.equal(steel.originalAmount, 950_000);
});

test("createDemoWorkspace integrates subcontracts cleanly", () => {
  const ws = createDemoWorkspace(anchorDate);
  assert.ok(ws.subcontracts, "Workspace should have subcontracts");
  assert.ok(ws.subcontracts.length >= 2, "Workspace should contain demo subcontracts");
});

test("ProcurementPage renders navigation sub-tabs including Subcontracts with badge", () => {
  const markup = renderToStaticMarkup(
    <ProcurementPage
      purchaseOrders={[]}
      projects={mockProjects}
      vendors={mockVendors}
      costCodes={mockCostCodes}
      canRead={true}
      subcontracts={demoSubcontracts}
      onSavePO={async () => {}}
      onTransitionPO={async () => {}}
      onDeletePO={async () => {}}
    />,
  );

  assert.match(markup, /Purchase Orders/);
  assert.match(markup, /Requests for Quotation \(RFQs\)/);
  assert.match(markup, /Subcontracts/);
});

test("SubcontractEditorModal renders form in draft edit mode with dynamic lines table", () => {
  const draftSc = demoSubcontracts.find((s) => s.status === "DRAFT") || demoSubcontracts[1];
  const markup = renderToStaticMarkup(
    <SubcontractEditorModal
      isOpen={true}
      onClose={() => {}}
      subcontract={draftSc}
      projects={mockProjects}
      vendors={mockVendors}
      costCodes={mockCostCodes}
      canManage={true}
      onSave={async () => {}}
    />,
  );

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /SC-2026-002/);
  assert.match(markup, /Structural Steel Erection Subcontract/);
  assert.match(markup, /Scope of Work &amp; Cost Breakdown/);
  assert.match(markup, /Save Changes/);
});

test("SubcontractEditorModal renders in read-only mode for approved/active subcontract with audit trail", () => {
  const activeSc = demoSubcontracts.find((s) => s.status === "ACTIVE") || demoSubcontracts[0];
  const markup = renderToStaticMarkup(
    <SubcontractEditorModal
      isOpen={true}
      onClose={() => {}}
      subcontract={activeSc}
      projects={mockProjects}
      vendors={mockVendors}
      costCodes={mockCostCodes}
      canManage={true}
      onSave={async () => {}}
    />,
  );

  assert.match(markup, /Lifecycle &amp; Authorization Audit Trail/);
  assert.match(markup, /SC-2026-001/);
  assert.match(markup, /Read-only mode/);
  assert.match(markup, /Close/);
  // Should not have the submit save button
  assert.doesNotMatch(markup, /Save Changes/);
});

test("SubcontractCancellationModal renders danger confirmation with reason requirement", () => {
  const sc = demoSubcontracts[0];
  const markup = renderToStaticMarkup(
    <SubcontractCancellationModal
      isOpen={true}
      onClose={() => {}}
      subcontract={sc}
      onConfirm={async () => {}}
    />,
  );

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /Cancel Subcontract/);
  assert.match(markup, /SC-2026-001/);
  assert.match(markup, /Warning: Consequential Action/);
  assert.match(markup, /Cancellation Reason/);
  assert.match(markup, /Confirm Cancellation/);
});

test("ProjectWorkspace passes down subcontracts prop to ProcurementPage", () => {
  const project = mockProjects[0];
  const markup = renderToStaticMarkup(
    <AppPermissionProvider permissions={["*"]}>
      <ProjectWorkspace
        project={project}
        summary={{
          actualCost: 100000,
          committedCost: 500000,
          contractValue: 18437650,
          projectBudget: 15320000,
        } as any}
        invoices={[]}
        invoiceAllocations={[]}
        expenses={[]}
        subcontracts={demoSubcontracts}
        initialTab="procurement"
        costCodes={mockCostCodes}
        onBack={() => {}}
        onOpenInvoice={() => {}}
        onUploadInvoice={() => {}}
        onEditProject={() => {}}
        onArchiveProject={() => {}}
        onSaveInvoiceAllocations={async () => {}}
      />
    </AppPermissionProvider>,
  );

  assert.match(markup, /Subcontracts/);
});
