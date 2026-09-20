import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ProcurementPage } from "../src/components/procurement/ProcurementPage.tsx";
import { RFQEditorModal, persistedRFQLineId } from "../src/components/procurement/RFQEditorModal.tsx";
import { PurchaseOrderEditorModal, persistedPurchaseOrderLineId } from "../src/components/procurement/PurchaseOrderEditorModal.tsx";
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
  assert.match(markup, /Active Committed/);
  assert.match(markup, /All Delivery States/);
  assert.match(markup, /No purchase orders yet/);
});

test("Procurement registers use the shared OperationsGrid on desktop and retain responsive cards", () => {
  const purchaseOrderMarkup = renderToStaticMarkup(
    <ProcurementPage
      purchaseOrders={demoWorkspace.purchaseOrders}
      projects={mockProjects}
      vendors={mockVendors}
      costCodes={mockCostCodes}
      canRead={true}
      canManage={true}
      rfqs={demoRfqs}
      supplierQuotations={demoQuotes}
      onSavePO={async () => {}}
      onTransitionPO={async () => {}}
      onDeletePO={async () => {}}
    />,
  );
  assert.match(purchaseOrderMarkup, /aria-label="Purchase order register"/);
  assert.match(purchaseOrderMarkup, /aria-label="Purchase order register cards"/);

  const rfqMarkup = renderToStaticMarkup(
    <ProcurementPage
      purchaseOrders={demoWorkspace.purchaseOrders}
      projects={mockProjects}
      vendors={mockVendors}
      costCodes={mockCostCodes}
      initialTab="rfqs"
      canRead={true}
      canManage={true}
      rfqs={demoRfqs}
      supplierQuotations={demoQuotes}
      onSavePO={async () => {}}
      onTransitionPO={async () => {}}
      onDeletePO={async () => {}}
    />,
  );
  assert.match(rfqMarkup, /aria-label="RFQ register"/);
  assert.match(rfqMarkup, /aria-label="RFQ register cards"/);
});

test("Procurement exposes an explicit workbook review/apply surface and truthful read-only state", () => {
  const markup = renderToStaticMarkup(
    <ProcurementPage
      purchaseOrders={demoWorkspace.purchaseOrders}
      projects={mockProjects}
      vendors={mockVendors}
      costCodes={mockCostCodes}
      canRead={true}
      canManage={true}
      rfqs={demoRfqs}
      supplierQuotations={demoQuotes}
      onSavePO={async () => {}}
      onTransitionPO={async () => {}}
      onDeletePO={async () => {}}
    />,
  );
  assert.match(markup, /Export editable workbook/);
  assert.match(markup, /Import workbook/);
  assert.match(markup, /Upload creates a review proposal/);
  assert.match(markup, /Apply selected changes/);

  const readOnlyMarkup = renderToStaticMarkup(
    <ProcurementPage
      purchaseOrders={[]}
      projects={mockProjects}
      vendors={mockVendors}
      costCodes={mockCostCodes}
      canRead={true}
      canManage={false}
      rfqs={[]}
      supplierQuotations={[]}
      onSavePO={async () => {}}
      onTransitionPO={async () => {}}
      onDeletePO={async () => {}}
    />,
  );
  assert.match(readOnlyMarkup, /Upload is available for review only/);
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

test("worksheet-only procurement row ids never leak into authoritative save identities", () => {
  assert.equal(persistedRFQLineId("draft-rfq-line-123-1"), undefined);
  assert.equal(persistedRFQLineId("0f23ccaf-bf5e-4e72-9a8d-b23a97b55eb5"), "0f23ccaf-bf5e-4e72-9a8d-b23a97b55eb5");
  assert.equal(persistedPurchaseOrderLineId("draft-po-line-123-1"), undefined);
  assert.equal(persistedPurchaseOrderLineId("a91d3f47-17cb-4db6-a2a7-d95be2b670d0"), "a91d3f47-17cb-4db6-a2a7-d95be2b670d0");
});

test("RFQ draft editing uses shared worksheets for safe header and line fields", () => {
  const rfq = demoRfqs.find((candidate) => candidate.status === "DRAFT") || demoRfqs[0];
  const markup = renderToStaticMarkup(
    <RFQEditorModal
      open={true}
      rfq={rfq}
      projects={mockProjects}
      vendors={mockVendors}
      costCodes={mockCostCodes}
      onSave={async () => {}}
      onClose={() => {}}
    />,
  );

  assert.match(markup, /data-testid="rfq-draft-worksheet"/);
  assert.equal((markup.match(/data-worksheet-editor="true"/g) || []).length, 2);
  assert.match(markup, /aria-label="RFQ draft header worksheet"/);
  assert.match(markup, /aria-label="RFQ draft lines worksheet"/);
  assert.match(markup, /Requested Delivery/);
  assert.match(markup, /data-worksheet-add-row="true"/);
  assert.match(markup, /Save RFQ draft/);
});

test("RFQ non-draft worksheet is protected and does not offer a misleading update submit action", () => {
  const rfq = demoRfqs.find((candidate) => candidate.status !== "DRAFT");
  assert.ok(rfq, "Expected a non-draft RFQ in demo data");
  const markup = renderToStaticMarkup(
    <RFQEditorModal
      open={true}
      rfq={rfq}
      projects={mockProjects}
      vendors={mockVendors}
      costCodes={mockCostCodes}
      onSave={async () => {}}
      onClose={() => {}}
    />,
  );

  assert.match(markup, /data-worksheet-protected="true"/);
  assert.doesNotMatch(markup, /Update RFQ/);
  assert.doesNotMatch(markup, /data-worksheet-add-row="true"/);
});

test("Purchase Order draft editing uses shared worksheets and protects calculated amounts", () => {
  const purchaseOrder = demoWorkspace.purchaseOrders.find((candidate) => candidate.status === "DRAFT");
  assert.ok(purchaseOrder, "Expected a draft purchase order in demo data");
  const markup = renderToStaticMarkup(
    <PurchaseOrderEditorModal
      open={true}
      purchaseOrder={purchaseOrder}
      receipts={demoWorkspace.purchaseOrderReceipts}
      projects={mockProjects}
      vendors={mockVendors}
      costCodes={mockCostCodes}
      canManage={true}
      canApprove={true}
      matches={demoWorkspace.purchaseOrderMatches}
      invoices={demoWorkspace.invoices}
      onSave={async () => {}}
      onTransition={async () => {}}
      onDelete={async () => {}}
      onClose={() => {}}
    />,
  );

  assert.match(markup, /data-testid="purchase-order-draft-worksheet"/);
  assert.equal((markup.match(/data-worksheet-editor="true"/g) || []).length, 2);
  assert.match(markup, /aria-label="Purchase order header worksheet"/);
  assert.match(markup, /aria-label="Purchase order draft lines worksheet"/);
  assert.match(markup, /Unit Price/);
  assert.match(markup, /Amount/);
  assert.match(markup, /data-worksheet-protected="true"/);
  assert.match(markup, /data-worksheet-add-row="true"/);
  assert.match(markup, /Approve PO/);
  assert.doesNotMatch(markup, /Record Delivery \/ Receipt/);
});

test("Purchase Order non-draft worksheet keeps editing protected while workflows stay outside the grid", () => {
  const purchaseOrder = demoWorkspace.purchaseOrders.find((candidate) => candidate.status === "ISSUED");
  assert.ok(purchaseOrder, "Expected an issued purchase order in demo data");
  const markup = renderToStaticMarkup(
    <PurchaseOrderEditorModal
      open={true}
      purchaseOrder={purchaseOrder}
      receipts={demoWorkspace.purchaseOrderReceipts}
      projects={mockProjects}
      vendors={mockVendors}
      costCodes={mockCostCodes}
      canManage={true}
      canApprove={true}
      matches={demoWorkspace.purchaseOrderMatches}
      invoices={demoWorkspace.invoices}
      onSave={async () => {}}
      onTransition={async () => {}}
      onDelete={async () => {}}
      onClose={() => {}}
    />,
  );

  assert.match(markup, /data-testid="purchase-order-draft-worksheet"/);
  assert.match(markup, /data-worksheet-protected="true"/);
  assert.doesNotMatch(markup, /data-worksheet-add-row="true"/);
  assert.match(markup, /Delivery &amp; Goods Receipts Tracking/);
  assert.match(markup, /Record Delivery \/ Receipt/);
  assert.doesNotMatch(markup, /Approve PO/);
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
