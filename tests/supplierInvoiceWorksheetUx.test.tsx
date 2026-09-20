import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { InvoiceData } from "../src/types.ts";
import { SupplierInvoiceWorksheet, supplierInvoiceLineSourceIndex } from "../src/components/invoices/SupplierInvoiceWorksheet.tsx";

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

test("supplier invoice review is source-first and removes the old split-pane toggle", () => {
  const sourceIndex = workspaceSource.indexOf("<SourceComparison");
  const reviewIndex = workspaceSource.indexOf("<SupplierInvoiceReview");

  assert.ok(sourceIndex >= 0, "VerificationWorkspace should render the preserved source");
  assert.ok(reviewIndex > sourceIndex, "the source should appear before extracted review content");
  assert.match(workspaceSource, /data-testid="supplier-invoice-source-first"/);
  assert.doesNotMatch(workspaceSource, /mobilePane|Details\/Source/);
  assert.doesNotMatch(workspaceSource, /lg:grid-cols-\[minmax\(0,1\.05fr\)_minmax\(420px,0\.95fr\)\]/);
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

  assert.match(html, /All sections share one review draft/);
  assert.equal((html.match(/Save worksheet edits/g) || []).length, 4);
  assert.equal((html.match(/Discard all worksheet edits/g) || []).length, 4);
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

test("demo visual QA pins the source-first worksheet review instead of the old split pane", () => {
  assert.match(demoScenarioSource, /const verifySupplierInvoiceReview/);
  assert.match(demoScenarioSource, /data-testid="supplier-invoice-source-first"/);
  assert.match(demoScenarioSource, /supplier-invoice-old-mobile-pane-removed/);
  assert.match(demoScenarioSource, /source-first supplier invoice worksheet review opened/);
});
