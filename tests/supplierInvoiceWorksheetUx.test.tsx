import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { InvoiceData } from "../src/types.ts";
import { SupplierInvoiceWorksheet, supplierInvoiceLineSourceIndex } from "../src/components/invoices/SupplierInvoiceWorksheet.tsx";
import { SupplierInvoiceReview } from "../src/components/SupplierInvoiceReview.tsx";
import { createDemoInvoices } from "../src/demo/data/invoices.ts";

const workspaceSource = readFileSync(new URL("../src/components/VerificationWorkspace.tsx", import.meta.url), "utf8");
const reviewSource = readFileSync(new URL("../src/components/SupplierInvoiceReview.tsx", import.meta.url), "utf8");
const demoScenarioSource = readFileSync(new URL("../scripts/qa/demoScenarios.ts", import.meta.url), "utf8");

function invoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    id: "worksheet-invoice",
    invoiceNumber: "SI-001",
    invoiceDate: "2026-09-20",
    dueDate: "2026-10-20",
    purchaseOrderNumber: "PO-001",
    projectReference: "PRJ-001",
    currency: "PHP",
    vendor: {
      name: "Extracted Supplier",
      registeredName: "Extracted Supplier Inc.",
      tradeName: "Supplier House",
      taxId: "123-456-789",
      address: "1 Source Street",
      email: "ap@supplier.test",
      phone: "+63 900 000 0000",
    },
    items: [{
      id: "line-1",
      itemNumber: 1,
      sku: "SKU-1",
      description: "Concrete",
      quantity: 2,
      unitOfMeasure: "bag",
      unitPrice: 100,
      discount: 5,
      taxRate: 12,
      taxAmount: 22.8,
      total: 217.8,
    }],
    subtotal: 200,
    totalDiscount: 5,
    totalTax: 22.8,
    shippingFee: 10,
    otherFees: 0,
    grandTotal: 227.8,
    amountPaid: 0,
    amountDue: 227.8,
    balanceDue: 227.8,
    withholdingTaxAmount: null,
    netAmountPayable: null,
    description: "Concrete",
    category: "Materials",
    notes: "Source note",
    extractedAt: "2026-09-20T00:00:00.000Z",
    modelUsed: "test",
    reviewStatus: "NEEDS_REVIEW",
    lifecycleStatus: "ACTIVE",
    financialSemantics: {
      lineTotalBasis: "TAX_INCLUSIVE",
      unitPriceBasis: "PRE_TAX",
      subtotalBasis: "PRE_TAX",
      taxInclusion: "ADDED_TO_TOTAL",
      discountIncludedInSubtotal: false,
      payableBasis: "GROSS_INVOICE",
      determination: "EXPLICIT",
    },
    ...overrides,
  };
}

test("supplier invoice review exposes paired source and extracted panes without mobile toggles", () => {
  assert.match(workspaceSource, /data-testid="supplier-invoice-side-by-side-review"/);
  assert.match(workspaceSource, /data-testid="supplier-invoice-source-pane"/);
  assert.match(workspaceSource, /data-testid="supplier-invoice-extracted-pane"/);
  assert.doesNotMatch(workspaceSource, /mobilePane|Details\/Source/);
});

test("supplier invoice worksheet exposes header, vendor evidence, line items, and totals", () => {
  const html = renderToStaticMarkup(
    <SupplierInvoiceWorksheet invoice={invoice()} onUpdateInvoice={() => undefined} />,
  );

  for (const label of [
    "Invoice Header",
    "Invoice Number",
    "Invoice Date",
    "Due Date",
    "Currency",
    "Purchase Order Number",
    "Project / Reference",
    "Vendor Evidence",
    "Supplier Name",
    "Registered Name",
    "Trade Name",
    "TIN",
    "Address",
    "Email",
    "Phone",
    "Line Items",
    "SKU",
    "Description",
    "Quantity",
    "Unit",
    "Unit Price",
    "Discount",
    "Tax Rate",
    "Tax Amount",
    "Line Amount",
    "Totals / Monetary Facts",
    "Subtotal",
    "Gross Total",
    "Monetary Facts",
  ]) {
    assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), label);
  }

  assert.match(html, /data-worksheet-editor="true"/g);
  assert.equal((html.match(/data-worksheet-editor="true"/g) || []).length, 4);
  assert.match(html, /data-worksheet-add-row="true"/);
  assert.match(html, /data-worksheet-remove-row="line-1"/);
});

test("supplier invoice worksheet preserves row identity and protects calculated monetary facts", () => {
  const source = invoice({
    financialFieldStatus: {
      subtotal: "CALCULATED",
      grandTotal: "KNOWN",
      "items.0.total": "CALCULATED",
    },
  });
  const html = renderToStaticMarkup(<SupplierInvoiceWorksheet invoice={source} />);

  assert.match(html, /data-worksheet-row-key="line-1"/);
  assert.match(html, /data-worksheet-cell="line-1:total"[^>]*data-worksheet-protected="true"/);
  assert.match(html, /data-worksheet-cell="worksheet-invoice:subtotal"[^>]*data-worksheet-protected="true"/);
  assert.match(html, /data-worksheet-cell="worksheet-invoice:grandTotal"[^>]*data-worksheet-editable="true"/);
  assert.match(reviewSource, /SupplierInvoiceWorksheet/);
  assert.match(reviewSource, /Canonical Vendor/);
  assert.match(reviewSource, /SupplierInvoiceExpenseSurface/);
});

test("supplier invoice worksheet makes the shared-draft save and discard scope explicit", () => {
  const html = renderToStaticMarkup(
    <SupplierInvoiceWorksheet invoice={invoice()} onUpdateInvoice={() => undefined} />,
  );

  assert.match(html, /One draft spans all sections/);
  assert.equal((html.match(/Save worksheet edits/g) || []).length, 1);
  assert.equal((html.match(/Discard all worksheet edits/g) || []).length, 1);
  assert.equal((html.match(/data-testid="supplier-invoice-worksheet-action-bar"/g) || []).length, 1);
  assert.equal((html.match(/data-testid="supplier-invoice-worksheet-help"/g) || []).length, 1);
  assert.ok(
    html.indexOf('data-testid="supplier-invoice-worksheet-help"') > html.indexOf('data-testid="supplier-invoice-header-worksheet"'),
    "secondary worksheet help should follow the primary editable fields",
  );
});

test("supplier invoice keeps ordinary source provenance quiet while preserving exceptional markers", () => {
  const html = renderToStaticMarkup(
    <SupplierInvoiceWorksheet
      invoice={invoice({
        financialFieldStatus: { grandTotal: "MANUAL", subtotal: "CALCULATED" },
        aiSnapshot: { invoiceNumber: "SI-001", grandTotal: 227.8 },
      })}
    />,
  );

  assert.match(html, /data-provenance="Source evidence" class="sr-only"/);
  assert.doesNotMatch(html, /data-provenance="Source evidence" class="ml-2/);
  assert.match(html, /data-provenance="Manually corrected" class="ml-2/);
  assert.doesNotMatch(html, /data-provenance="Calculated" class="ml-2/);
  assert.match(html, /data-worksheet-protected="true"/);
  assert.match(html, /data-worksheet-readonly="true"/);
});

test("supplier invoice review keeps compact status and unresolved actions before the worksheet", () => {
  const actionBarIndex = reviewSource.indexOf('data-testid="supplier-invoice-review-bar"');
  const unresolvedIssuesIndex = reviewSource.indexOf('data-testid="supplier-invoice-unresolved-issues"');
  const worksheetIndex = reviewSource.indexOf("<SupplierInvoiceWorksheet");

  assert.ok(actionBarIndex >= 0, "Supplier Invoice review should expose a compact status bar");
  assert.ok(unresolvedIssuesIndex > actionBarIndex, "compact unresolved actions should follow the status");
  assert.ok(worksheetIndex > unresolvedIssuesIndex, "the extracted worksheet should follow the unresolved actions");
  assert.doesNotMatch(reviewSource, /supplier-invoice-blocking-review/);
});

test("unresolved supplier blockers use short actions and keep resolvers closed until requested", () => {
  const source = invoice({
    vendor: { name: "Extracted Supplier" },
    description: "",
  });
  const html = renderToStaticMarkup(<SupplierInvoiceReview invoice={source} />);

  assert.match(html, /data-testid="supplier-invoice-unresolved-issues"/);
  assert.match(html, /2 issues need attention/);
  assert.match(html, />Resolve vendor</);
  assert.match(html, />Confirm description</);
  assert.doesNotMatch(html, /Blocking review items/);
  assert.match(html, /id="supplier-invoice-issue-vendor"[^>]*aria-expanded="false"/);
  assert.match(html, /id="supplier-invoice-issue-description"[^>]*aria-expanded="false"/);
  assert.doesNotMatch(html, /data-testid="supplier-(?:vendor|description)-resolution-panel"/);
});

test("supplier invoice source evidence precedes extraction status in the review workspace", () => {
  const sourceIndex = workspaceSource.indexOf('data-testid="supplier-invoice-source-surface"');
  const extractionIndex = workspaceSource.indexOf('data-testid="supplier-invoice-extraction-status"');

  assert.ok(sourceIndex >= 0, "the preserved source surface should remain in the review workspace");
  assert.ok(extractionIndex > sourceIndex, "extraction status should follow the source evidence");
});

test("safe demo Supplier Invoice review includes a deterministic sanitized source image", () => {
  const { invoices } = createDemoInvoices("2026-09-20");
  const reviewInvoice = invoices.find((candidate) => candidate.id === "demo-invoice-07");

  assert.equal(reviewInvoice?.fileType, "image/svg+xml");
  assert.equal(reviewInvoice?.previewUrl, "/demo/supplier-invoice-review.svg");
});

test("known financial evidence becomes visibly manual when it differs from the immutable AI snapshot", () => {
  const source = invoice({
    grandTotal: 250,
    financialFieldStatus: { grandTotal: "KNOWN" },
    aiSnapshot: { grandTotal: 227.8 },
  });
  const html = renderToStaticMarkup(<SupplierInvoiceWorksheet invoice={source} />);
  const cellStart = html.indexOf('data-worksheet-cell="worksheet-invoice:grandTotal"');
  const cellEnd = html.indexOf("</td>", cellStart);
  assert.ok(cellStart >= 0 && cellEnd > cellStart);
  const grandTotalCell = html.slice(cellStart, cellEnd);
  assert.match(grandTotalCell, /data-provenance="Manually corrected"/);
});

test("new line rows never inherit calculated protection from a different original line", () => {
  const source = invoice({
    items: [
      { id: "line-1", description: "Original A", quantity: 1, unitPrice: 10, total: 10 },
      { id: "line-2", description: "Original B", quantity: 1, unitPrice: 20, total: 20 },
    ],
    financialFieldStatus: { "items.1.total": "CALCULATED" },
  });

  assert.equal(supplierInvoiceLineSourceIndex(source, source.items[1]!), 1);
  assert.equal(
    supplierInvoiceLineSourceIndex(source, { ...source.items[1]!, id: "line-new" }),
    undefined,
  );
});

test("read-only supplier invoice worksheets expose protected cells while controlled workflows remain separate", () => {
  const html = renderToStaticMarkup(<SupplierInvoiceWorksheet invoice={invoice()} readOnly />);

  assert.match(html, /data-worksheet-cell="worksheet-invoice:invoiceNumber"[^>]*data-worksheet-editable="false"/);
  assert.match(html, /Protected/);
  assert.match(reviewSource, /Verify & Create Expense/);
  assert.match(reviewSource, /data-testid="supplier-vendor-resolution"/);
  assert.match(workspaceSource, /PurchaseOrderMatchSection/);
  assert.match(workspaceSource, /PurchasedMaterialIntakePanel/);
  assert.match(workspaceSource, /onSaveProjectAllocations/);
});

test("demo visual QA checks paired review panes and direct worksheet editing", () => {
  assert.match(demoScenarioSource, /const verifySupplierInvoiceReview/);
  assert.match(demoScenarioSource, /supplier-invoice-wide-panels-visible/);
  assert.match(demoScenarioSource, /data-testid="supplier-invoice-source-document"/);
  assert.match(demoScenarioSource, /data-testid="supplier-invoice-worksheet-action-bar"/);
  assert.match(demoScenarioSource, /supplier-invoice-editable-cell-one-click/);
  assert.match(demoScenarioSource, /supplier-invoice-protected-cell-read-only/);
  assert.match(demoScenarioSource, /Supplier Invoice source and extracted worksheet review/);
});
