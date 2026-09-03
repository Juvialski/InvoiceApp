import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ProcurementPage } from "../src/components/procurement/ProcurementPage.tsx";
import { RFQEditorModal } from "../src/components/procurement/RFQEditorModal.tsx";
import { SupplierQuotationModal } from "../src/components/procurement/SupplierQuotationModal.tsx";
import { RFQComparisonModal } from "../src/components/procurement/RFQComparisonModal.tsx";
import { createDemoRFQs, createDemoSupplierQuotations } from "../src/demo/data/procurement.ts";
import { createDemoWorkspace } from "../src/demo/data/createDemoWorkspace.ts";
import { defaultDemoAnchorDate } from "../src/demo/data/demoDates.ts";
import type { ProjectCostCode } from "../src/types.ts";

const anchorDate = defaultDemoAnchorDate();
const demoWorkspace = createDemoWorkspace(anchorDate);
const demoRfqs = demoWorkspace.rfqs || createDemoRFQs(anchorDate);
const demoQuotes = demoWorkspace.supplierQuotations || createDemoSupplierQuotations(anchorDate);
const mockProjects = demoWorkspace.projects;
const mockVendors = demoWorkspace.vendors || [];
const mockCostCodes: ProjectCostCode[] = [
  {
    id: "cc-mech-01",
    projectId: "demo-project-warehouse",
    code: "02-100",
    name: "Mechanical & Piping Works",
    approvedBudgetAmount: 8500000,
    status: "ACTIVE",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
];

test("Demo data generator produces realistic RFQs and competing quotations", () => {
  assert.ok(demoRfqs.length >= 2, "Expected at least 2 demo RFQs");
  const rfq1 = demoRfqs.find((r) => r.rfqNumber === "RFQ-25-0004");
  assert.ok(rfq1, "RFQ-25-0004 must be present");
  assert.equal(rfq1.lines.length, 3, "Expected 3 line items on RFQ-25-0004");
  assert.equal(rfq1.invitedVendorIds?.length, 3, "Expected 3 invited vendors");

  assert.ok(demoQuotes.length >= 3, "Expected at least 3 demo supplier quotations");
  const quotesForRfq1 = demoQuotes.filter((q) => q.rfqId === rfq1.id);
  assert.equal(quotesForRfq1.length, 3, "Expected 3 competing bids for RFQ-25-0004");

  const selectedQuote = quotesForRfq1.find((q) => q.status === "SELECTED");
  assert.ok(selectedQuote, "Expected 1 quote to have SELECTED status");
  assert.equal(rfq1.selectedQuotationId, selectedQuote.id, "RFQ selectedQuotationId must match the selected quote");

  // Verify partial quote exists (no-bid item)
  const partialQuote = quotesForRfq1.find((q) => q.lines.some((l) => l.isNoBid));
  assert.ok(partialQuote, "Expected at least one quote with a no-bid line item (Southline)");
});

test("createDemoWorkspace integrates rfqs and supplierQuotations cleanly", () => {
  const workspace = createDemoWorkspace(anchorDate);
  assert.ok(workspace.rfqs && workspace.rfqs.length > 0, "Demo workspace should contain RFQs");
  assert.ok(workspace.supplierQuotations && workspace.supplierQuotations.length > 0, "Demo workspace should contain quotations");
  assert.ok(workspace.purchaseOrders.some((po) => po.rfqId && po.supplierQuotationId), "Expected draft PO linked to RFQ & Quotation");
});

test("ProcurementPage renders sub-tabs for Purchase Orders and Requests for Quotation", () => {
  const markup = renderToStaticMarkup(
    <ProcurementPage
      purchaseOrders={[]}
      projects={mockProjects}
      vendors={mockVendors}
      costCodes={mockCostCodes}
      canRead={true}
      rfqs={demoRfqs}
      supplierQuotations={demoQuotes}
      onSavePO={async () => {}}
      onTransitionPO={async () => {}}
      onDeletePO={async () => {}}
    />
  );

  assert.match(markup, /Purchase Orders/);
  assert.match(markup, /Requests for Quotation \(RFQs\)/);
});

test("RFQEditorModal renders with accessible dialog attributes, line items table, and invited vendors", () => {
  const rfq = demoRfqs[0];
  const markup = renderToStaticMarkup(
    <RFQEditorModal
      open={true}
      rfq={rfq}
      projects={mockProjects}
      vendors={mockVendors}
      costCodes={mockCostCodes}
      onSave={async () => {}}
      onClose={() => {}}
    />
  );

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /Edit RFQ: RFQ-25-0004/);
  assert.match(markup, /Invited Vendors/);
  assert.match(markup, /Metrosteel Supply Corp\./);
  assert.match(markup, /Line Items/);
  assert.match(markup, /Seamless Carbon Steel Pipe/);
});

test("SupplierQuotationModal renders with vendor selection, terms, and auto-populated line items", () => {
  const rfq = demoRfqs[0];
  const quote = demoQuotes[0];
  const markup = renderToStaticMarkup(
    <SupplierQuotationModal
      open={true}
      rfq={rfq}
      quotation={quote}
      vendors={mockVendors}
      onSave={async () => {}}
      onClose={() => {}}
    />
  );

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /Edit Quotation:/);
  assert.match(markup, /Metrosteel Supply Corp\./);
  assert.match(markup, /QUO-MS-2025-088/);
  assert.match(markup, /Payment Terms/);
  assert.match(markup, /Quotation Line Items/);
});

test("RFQComparisonModal renders desktop side-by-side comparison table, Lowest Price badges, and Selection Audit banner", () => {
  const rfq = demoRfqs[0];
  const quotes = demoQuotes.filter((q) => q.rfqId === rfq.id);
  const markup = renderToStaticMarkup(
    <RFQComparisonModal
      open={true}
      rfq={rfq}
      quotations={quotes}
      vendors={mockVendors}
      onConvertToPO={async () => {}}
      onRevertSelection={async () => {}}
      onSelectQuotation={async () => {}}
      onClose={() => {}}
    />
  );

  assert.match(markup, /Quotation Comparison — RFQ-25-0004/);
  assert.match(markup, /Selected Supplier: Metrosteel Supply Corp\./);
  assert.match(markup, /QUO-MS-2025-088/);
  assert.match(markup, /Create Draft PO/);
  assert.match(markup, /Revert Selection/);
  assert.match(markup, /Lowest/);
  assert.match(markup, /Lowest Complete Bid/);
  assert.match(markup, /Risk &amp; Compliance Flags/);
  assert.match(markup, /No Bid/);
});
