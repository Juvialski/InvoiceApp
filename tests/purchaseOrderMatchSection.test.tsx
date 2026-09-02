import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PurchaseOrderMatchSection } from "../src/components/invoices/PurchaseOrderMatchSection.tsx";
import { PurchaseOrderEditorModal } from "../src/components/procurement/PurchaseOrderEditorModal.tsx";
import type {
  InvoiceData,
  Project,
  PurchaseOrder,
  PurchaseOrderInvoiceMatch,
  PurchaseOrderReceipt,
  Vendor,
} from "../src/types.ts";

const mockVendor: Vendor = {
  id: "v-solar-01",
  companyId: "comp-1",
  name: "Prime Electrical Trading Inc",
  normalizedName: "prime electrical trading inc",
  taxId: "123-456-789-000",
  email: "sales@primeelectrical.ph",
  phone: "+63 2 8123 4567",
  address: "123 Industrial Ave, Pasig City",
  defaultCurrency: "PHP",
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

const mockProject: Project = {
  id: "proj-sol-01",
  projectCode: "SOL-2026-01",
  projectName: "Batangas Solar Farm Phase 2",
  status: "ACTIVE",
  contractValue: 50000000,
  projectBudget: 42000000,
  currency: "PHP",
  startDate: "2026-01-01",
  targetEndDate: "2026-12-31",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const mockPo: PurchaseOrder = {
  id: "po-101",
  companyId: "comp-1",
  poNumber: "PO-25-0012",
  vendorId: "v-solar-01",
  projectId: "proj-sol-01",
  status: "ISSUED",
  currency: "PHP",
  totalAmount: 520000,
  issueDate: "2026-08-15",
  description: "Solar PV Mounting Hardware",
  lines: [
    {
      id: "po-line-1",
      companyId: "comp-1",
      purchaseOrderId: "po-101",
      lineNumber: 1,
      description: "Galvanized Steel Rails 4.2m",
      quantity: 800,
      unit: "pcs",
      unitPrice: 650,
      amount: 520000,
      createdAt: "2026-08-15T00:00:00Z",
      updatedAt: "2026-08-15T00:00:00Z",
    },
  ],
  createdAt: "2026-08-15T00:00:00Z",
  updatedAt: "2026-08-15T00:00:00Z",
};

const mockReceipt: PurchaseOrderReceipt = {
  id: "rec-1",
  companyId: "comp-1",
  purchaseOrderId: "po-101",
  receiptNumber: "GR-2026-008",
  receiptDate: "2026-08-20",
  status: "RECEIVED",
  lines: [
    {
      id: "rec-line-1",
      companyId: "comp-1",
      purchaseOrderReceiptId: "rec-1",
      purchaseOrderLineId: "po-line-1",
      lineNumber: 1,
      receivedQuantity: 800,
      createdAt: "2026-08-20T00:00:00Z",
      updatedAt: "2026-08-20T00:00:00Z",
    },
  ],
  createdAt: "2026-08-20T00:00:00Z",
  updatedAt: "2026-08-20T00:00:00Z",
};

const mockInvoice: InvoiceData = {
  id: "inv-201",
  invoiceNumber: "INV-PET-9941",
  invoiceDate: "2026-08-25",
  purchaseOrderNumber: "PO-25-0012",
  currency: "PHP",
  subtotal: 520000,
  totalTax: 0,
  grandTotal: 520000,
  reviewStatus: "NEEDS_REVIEW",
  lifecycleStatus: "ACTIVE",
  extractedAt: "2026-08-25T08:00:00Z",
  modelUsed: "gemini-2.5-flash",
  vendor: {
    name: "Prime Electrical Trading Inc",
  },
  customer: {
    name: "Engoryx Client Corp",
  },
  items: [
    {
      id: "inv-line-1",
      itemNumber: 1,
      description: "Galvanized Steel Rails 4.2m",
      quantity: 800,
      unitPrice: 650,
      total: 520000,
    },
  ],
};

function confirmedMatch(): PurchaseOrderInvoiceMatch {
  return {
    id: "match-001",
    companyId: "comp-1",
    invoiceId: "inv-201",
    purchaseOrderId: "po-101",
    matchSource: "PO_NUMBER_EXACT",
    status: "CONFIRMED",
    confirmedByUserId: "user-1",
    confirmedAt: "2026-08-26T10:00:00Z",
    lines: [
      {
        id: "m-line-1",
        companyId: "comp-1",
        matchId: "match-001",
        invoiceLineId: "inv-line-1",
        purchaseOrderLineId: "po-line-1",
        lineNumber: 1,
        matchedQuantity: 800,
        matchedAmount: 520000,
      },
    ],
  };
}

test("PurchaseOrderMatchSection renders unmatched candidates with confidence and line association table", () => {
  const markup = renderToStaticMarkup(
    <PurchaseOrderMatchSection
      invoice={mockInvoice}
      purchaseOrders={[mockPo]}
      receipts={[mockReceipt]}
      vendors={[mockVendor]}
      projects={[mockProject]}
      matches={[]}
      canManage={true}
    />,
  );

  assert.match(markup, /PO-25-0012/);
  assert.match(markup, /System Verified/);
  assert.match(markup, /Match Candidates/);
  assert.match(markup, /HIGH/);
  assert.match(markup, /Prime Electrical Trading Inc/);
  assert.match(markup, /Configure Match: PO-25-0012/);
  assert.match(markup, /Line Item Associations/);
  assert.match(markup, /Galvanized Steel Rails 4.2m/);
  assert.match(markup, /Confirm Match/);
});

test("PurchaseOrderMatchSection renders confirmed match with goods receipt progress and line verification", () => {
  const markup = renderToStaticMarkup(
    <PurchaseOrderMatchSection
      invoice={mockInvoice}
      purchaseOrders={[mockPo]}
      receipts={[mockReceipt]}
      vendors={[mockVendor]}
      projects={[mockProject]}
      matches={[confirmedMatch()]}
      canManage={true}
      onUnmatch={async () => {}}
    />,
  );

  assert.match(markup, /MATCHED/);
  assert.match(markup, /Source: PO_NUMBER_EXACT/);
  assert.match(markup, /PO-25-0012/);
  assert.match(markup, /Goods Receipts Progress/);
  assert.match(markup, /Fully Delivered/);
  assert.match(markup, /100%/);
  assert.match(markup, /Ordered:.*800.*pcs/);
  assert.match(markup, /Matched Line Item Breakdown/);
  assert.match(markup, /PO Line #1/);
  assert.match(markup, /Valid/);
  assert.match(markup, /Unmatch/);
});

test("PurchaseOrderMatchSection does not aggregate unlike receipt units", () => {
  const mixedPo: PurchaseOrder = {
    ...mockPo,
    totalAmount: 530000,
    lines: [
      ...mockPo.lines,
      {
        id: "po-line-2",
        companyId: "comp-1",
        purchaseOrderId: "po-101",
        lineNumber: 2,
        description: "Installation supervision",
        quantity: 2,
        unit: "days",
        unitPrice: 5000,
        amount: 10000,
      },
    ],
  };
  const mixedReceipt: PurchaseOrderReceipt = {
    ...mockReceipt,
    lines: [
      ...mockReceipt.lines,
      {
        id: "rec-line-2",
        companyId: "comp-1",
        purchaseOrderReceiptId: "rec-1",
        purchaseOrderLineId: "po-line-2",
        lineNumber: 2,
        receivedQuantity: 1,
      },
    ],
  };

  const markup = renderToStaticMarkup(
    <PurchaseOrderMatchSection
      invoice={mockInvoice}
      purchaseOrders={[mixedPo]}
      receipts={[mixedReceipt]}
      vendors={[mockVendor]}
      projects={[mockProject]}
      matches={[confirmedMatch()]}
      canManage={true}
    />,
  );

  assert.match(markup, /Mixed units: aggregate quantities are not comparable/);
  assert.doesNotMatch(markup, /Ordered:.*0.*units/);
  assert.match(markup, /800 pcs/);
});

test("PurchaseOrderEditorModal renders linked supplier invoices section", () => {
  const markup = renderToStaticMarkup(
    <PurchaseOrderEditorModal
      open={true}
      purchaseOrder={mockPo}
      receipts={[mockReceipt]}
      projects={[mockProject]}
      vendors={[mockVendor]}
      costCodes={[]}
      matches={[confirmedMatch()]}
      invoices={[mockInvoice]}
      onSave={() => {}}
      onTransition={() => {}}
      onDelete={() => {}}
      onClose={() => {}}
    />,
  );

  assert.match(markup, /Supplier Invoices/);
  assert.match(markup, /1 linked/);
  assert.match(markup, /INV-PET-9941/);
  assert.match(markup, /Needs Review/);
  assert.match(markup, /Supplier Consistent/);
  assert.match(markup, /1 line matched/);
  assert.match(markup, /520,000/);
});
