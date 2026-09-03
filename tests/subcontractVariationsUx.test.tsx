import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SubcontractVariationsDrawer } from "../src/components/procurement/SubcontractVariationsDrawer.tsx";
import { SubcontractVariationModal } from "../src/components/procurement/SubcontractVariationModal.tsx";
import { SubcontractVariationDetailModal } from "../src/components/procurement/SubcontractVariationDetailModal.tsx";
import { ProcurementPage } from "../src/components/procurement/ProcurementPage.tsx";
import { AppPermissionProvider } from "../src/app/AppPermissionContext.tsx";
import { createDemoWorkspace } from "../src/demo/data/createDemoWorkspace.ts";
import { defaultDemoAnchorDate } from "../src/demo/data/demoDates.ts";
import type { Subcontract, SubcontractVariation } from "../src/types.ts";

const anchorDate = defaultDemoAnchorDate();
const demoWorkspace = createDemoWorkspace(anchorDate);
const demoSubcontracts = demoWorkspace.subcontracts || [];
const demoVariations = demoWorkspace.subcontractVariations || [];
const demoClaims = demoWorkspace.subcontractClaims || [];
const mockProjects = demoWorkspace.projects;
const mockVendors = demoWorkspace.vendors || [];

test("SubcontractVariationsDrawer renders commercial summary metrics and variation cards", () => {
  const hvacSc = demoSubcontracts.find((s) => s.subcontractNumber === "SC-2026-001");
  assert.ok(hvacSc, "SC-2026-001 must exist in demo data");

  const html = renderToStaticMarkup(
    <SubcontractVariationsDrawer
      isOpen={true}
      onClose={() => {}}
      subcontract={hvacSc}
      variations={demoVariations}
      claims={demoClaims}
      project={mockProjects[0]}
      vendor={mockVendors[0]}
      canManage={true}
      canApprove={true}
      onCreateVariation={() => {}}
      onViewVariation={() => {}}
      onEditVariation={() => {}}
      onDeleteDraftVariation={async () => {}}
      onTransitionVariation={async () => {}}
    />,
  );

  // Check title and subcontract number
  assert.ok(html.includes("Subcontract Variations:"), "Drawer must show Subcontract Variations header");
  assert.ok(html.includes("SC-2026-001"), "Drawer must display parent subcontract number");

  // Check commercial summary cards
  assert.ok(html.includes("Original Contract"), "Drawer must show Original Contract metric");
  assert.ok(html.includes("Approved Variations"), "Drawer must show Approved Variations metric");
  assert.ok(html.includes("Revised Subcontract Value"), "Drawer must show Revised Subcontract Value metric");
  assert.ok(html.includes("Remaining Commitment"), "Drawer must show Remaining Commitment metric");

  // Check demo variations rendered
  assert.ok(html.includes("SC-2026-001-VAR-01"), "Drawer must list Variation 1");
  assert.ok(html.includes("SC-2026-001-VAR-02"), "Drawer must list Variation 2");
  assert.ok(html.includes("APPROVED"), "Drawer must display APPROVED badge");
  assert.ok(html.includes("SUBMITTED"), "Drawer must display SUBMITTED badge");
});

test("SubcontractVariationModal renders drafting inputs and real-time commercial impact preview", () => {
  const hvacSc = demoSubcontracts.find((s) => s.subcontractNumber === "SC-2026-001");
  assert.ok(hvacSc);

  const html = renderToStaticMarkup(
    <SubcontractVariationModal
      isOpen={true}
      onClose={() => {}}
      subcontract={hvacSc}
      existingVariations={demoVariations}
      existingClaims={demoClaims}
      projectCostCodes={[]}
      onSave={async () => {}}
    />,
  );

  // Modal header
  assert.ok(html.includes("New Subcontract Variation"), "Modal must show New Subcontract Variation title");
  assert.ok(html.includes("Original Contract"), "Modal must show Original Contract in preview");
  assert.ok(html.includes("Current Approved Value"), "Modal must show Current Approved Value in preview");
  assert.ok(html.includes("Variation Net Impact"), "Modal must show Variation Net Impact in preview");

  // Input sections
  assert.ok(html.includes("Variation Number"), "Modal must have Variation Number input");
  assert.ok(html.includes("Variation Title / Headline"), "Modal must have Title input");
  assert.ok(html.includes("Variation Scope Items"), "Modal must have Variation Scope Items table");
  assert.ok(html.includes("Add Line Item"), "Modal must have Add Line Item button");
});

test("SubcontractVariationDetailModal renders audit details and lifecycle transition actions", () => {
  const hvacSc = demoSubcontracts.find((s) => s.subcontractNumber === "SC-2026-001");
  assert.ok(hvacSc);
  const submittedVar = demoVariations.find((v) => v.status === "SUBMITTED");
  assert.ok(submittedVar);

  const html = renderToStaticMarkup(
    <SubcontractVariationDetailModal
      isOpen={true}
      onClose={() => {}}
      variation={submittedVar}
      subcontract={hvacSc}
      existingVariations={demoVariations}
      existingClaims={demoClaims}
      canManage={true}
      canApprove={true}
      onTransition={async () => {}}
      onDeleteDraft={async () => {}}
      onEdit={() => {}}
    />,
  );

  // Header & audit
  assert.ok(html.includes(`Variation: ${submittedVar.variationNumber}`), "Modal must show variation number in title");
  assert.ok(html.includes("Variation Line Items"), "Modal must show Variation Line Items section");

  // Lifecycle action buttons for SUBMITTED variation with canApprove=true
  assert.ok(html.includes("Approve Variation"), "Modal must provide Approve Variation action for approver");
  assert.ok(html.includes("Reject"), "Modal must provide Reject action");
  assert.ok(html.includes("Cancel"), "Modal must provide Cancel action");
});

test("ProcurementPage renders Revised Value and Variations button in Subcontracts tab", () => {
  const html = renderToStaticMarkup(
    <AppPermissionProvider permissions={["procurement.read", "procurement.manage", "procurement.approve"]}>
      <ProcurementPage
        initialTab="subcontracts"
        canRead={true}
        canManage={true}
        canApprove={true}
        projects={mockProjects}
        vendors={mockVendors}
        costCodes={[]}
        purchaseOrders={[]}
        subcontracts={demoSubcontracts}
        subcontractClaims={demoClaims}
        subcontractVariations={demoVariations}
        onSavePO={async () => {}}
        onTransitionPO={async () => {}}
        onDeletePO={async () => {}}
      />
    </AppPermissionProvider>,
  );

  // Table headers and columns
  assert.ok(html.includes("Contract Value"), "Subcontracts table must show Contract Value column header");
  assert.ok(html.includes("Remaining Commitment"), "Subcontracts table must show Remaining Commitment column header");

  // Variations action button
  assert.ok(html.includes("Variations ("), "Subcontracts table row must have Variations button with count");
  assert.ok(html.includes("Claims ("), "Subcontracts table row must have Claims button with count");
});
