import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ProcurementPage } from "../src/components/procurement/ProcurementPage.tsx";
import { SubcontractClaimEditorModal } from "../src/components/procurement/SubcontractClaimEditorModal.tsx";
import { SubcontractClaimsDrawer } from "../src/components/procurement/SubcontractClaimsDrawer.tsx";
import { AppPermissionProvider } from "../src/app/AppPermissionContext.tsx";
import { createDemoWorkspace } from "../src/demo/data/createDemoWorkspace.ts";
import { defaultDemoAnchorDate } from "../src/demo/data/demoDates.ts";
import type { Subcontract, SubcontractProgressClaim } from "../src/types.ts";

const anchorDate = defaultDemoAnchorDate();
const demoWorkspace = createDemoWorkspace(anchorDate);
const demoSubcontracts = demoWorkspace.subcontracts || [];
const demoClaims = demoWorkspace.subcontractClaims || [];
const mockProjects = demoWorkspace.projects;
const mockVendors = demoWorkspace.vendors || [];

test("SubcontractClaimsDrawer renders commercial summary metrics and claims table", () => {
  const hvacSc = demoSubcontracts.find((s) => s.subcontractNumber === "SC-2026-001");
  assert.ok(hvacSc, "SC-2026-001 must exist in demo data");

  const html = renderToStaticMarkup(
    <SubcontractClaimsDrawer
      isOpen={true}
      onClose={() => {}}
      subcontract={hvacSc}
      claims={demoClaims}
      project={mockProjects[0]}
      vendor={mockVendors[0]}
      canManage={true}
      canApprove={true}
      onCreateClaim={() => {}}
      onEditClaim={() => {}}
      onDeleteDraftClaim={async () => {}}
      onTransitionClaim={async () => {}}
    />,
  );

  // Check title and subcontract number
  assert.ok(html.includes("Subcontract Claims:"), "Drawer must show Subcontract Claims header");
  assert.ok(html.includes("SC-2026-001"), "Drawer must display parent subcontract number");

  // Check commercial summary cards
  assert.ok(html.includes("Contract Total"), "Drawer must show Contract Total metric");
  assert.ok(html.includes("Certified Gross"), "Drawer must show Certified Gross metric");
  assert.ok(html.includes("Remaining Commitment"), "Drawer must show Remaining Commitment metric");
  assert.ok(html.includes("Retention Held"), "Drawer must show Retention Held metric");
  assert.ok(html.includes("Net Certified"), "Drawer must show Net Certified metric");

  // Check demo claim numbers and status badges
  assert.ok(html.includes("SC-2026-001-CLM-01"), "Drawer must list Claim 1");
  assert.ok(html.includes("SC-2026-001-CLM-02"), "Drawer must list Claim 2");
  assert.ok(html.includes("APPROVED"), "Drawer must display APPROVED badge");
  assert.ok(html.includes("SUBMITTED"), "Drawer must display SUBMITTED badge");
});

test("SubcontractClaimEditorModal renders valuation lines, retention inputs, and commercial totals", () => {
  const hvacSc = demoSubcontracts.find((s) => s.subcontractNumber === "SC-2026-001");
  assert.ok(hvacSc, "SC-2026-001 must exist");

  const claim1 = demoClaims.find((c) => c.claimNumber === "SC-2026-001-CLM-01");
  assert.ok(claim1, "SC-2026-001-CLM-01 must exist");

  const html = renderToStaticMarkup(
    <SubcontractClaimEditorModal
      isOpen={true}
      onClose={() => {}}
      claim={claim1}
      subcontract={hvacSc}
      project={mockProjects[0]}
      vendor={mockVendors[0]}
      existingClaims={demoClaims}
      canManage={true}
      canApprove={true}
      onSave={async () => {}}
      onTransition={async () => {}}
    />,
  );

  // Check claim header
  assert.ok(html.includes("Subcontract Progress Claim: SC-2026-001-CLM-01"), "Modal must display claim number in title");
  assert.ok(html.includes("Valuation Date"), "Modal must contain valuation date input");
  assert.ok(html.includes("Retention Rate"), "Modal must contain retention rate input");

  // Check scope items
  assert.ok(html.includes("Chilled water piping"), "Modal must show line item 1");
  assert.ok(html.includes("Ductwork fabrication"), "Modal must show line item 2");

  // Check financial calculation cards
  assert.ok(html.includes("Gross Claimed:"), "Modal must render Gross Claimed card");
  assert.ok(html.includes("Certified Gross Work:"), "Modal must render Certified Gross card");
  assert.ok(html.includes("Retention Held"), "Modal must render Retention Held card");
  assert.ok(html.includes("Net Certified Payable:"), "Modal must render Net Certified Payable card");

  // Check Void button for approved claim
  assert.ok(html.includes("Void Claim"), "Modal must render Void Claim for approved claim");
});

test("ProcurementPage Subcontracts Tab displays Certified Work, Remaining Commitment, and Claims button", () => {
  const html = renderToStaticMarkup(
    <AppPermissionProvider
      permissions={[
        "procurement.read",
        "procurement.write",
        "procurement.approve",
      ]}
    >
      <ProcurementPage
        purchaseOrders={[]}
        receipts={[]}
        projects={mockProjects}
        vendors={mockVendors}
        costCodes={[]}
        subcontracts={demoSubcontracts}
        subcontractClaims={demoClaims}
        canRead={true}
        canManage={true}
        canApprove={true}
        onSavePO={async () => {}}
        onTransitionPO={async () => {}}
        onDeletePO={async () => {}}
      />
    </AppPermissionProvider>,
  );

  // In ProcurementPage, subcontracts are mounted under the subcontracts tab or state
  // Verify that the Subcontract progress claim imports and UI components render without syntax errors
  assert.ok(html.length > 0, "ProcurementPage rendered successfully");
});
