import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildClientInvoiceDocumentSnapshot, buildPurchaseOrderDocumentSnapshot, buildPurchaseOrderPdf, amountInWords } from "../src/lib/documentGeneration.ts";
import { supplierExpenseAmountForProject, supplierExpenseCostOwnership } from "../src/utils/supplierInvoiceCostOwnership.ts";
import { calculateProjectCost } from "../src/utils/projectCosting.ts";
import type { ClientBilling, Expense, InvoiceData, Project, PurchaseOrder, Vendor } from "../src/types.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260906010750_hydroqualisense_r3_unified_financial_documents.sql", import.meta.url), "utf8");
const defaultProfile = {
  legalName: "HydroQualiSense Solutions Corp.",
  address: "01 Pasong Tulo, Santa Rita Bata, San Miguel, Bulacan",
  contactNumber: "09760721144",
  email: "hydroqualisensesolutions@gmail.com",
  vatTin: "777-823-517-000",
  logoPath: "/brand/hydroqualisense-po-logo.png",
};

function invoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    id: "invoice-1",
    invoiceNumber: "INV-001",
    invoiceDate: "2026-09-01",
    currency: "PHP",
    vendor: { name: "Supplier" },
    customer: { name: "HydroQualiSense Solutions Corp." },
    items: [{ id: "line-1", description: "Pipe", quantity: 2, unitPrice: 50, total: 100 }],
    subtotal: 100,
    totalTax: 0,
    grandTotal: 100,
    extractedAt: "2026-09-01T00:00:00.000Z",
    modelUsed: "test",
    reviewStatus: "VERIFIED",
    lifecycleStatus: "ACTIVE",
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    expenseDate: "2026-09-01",
    category: "Materials",
    description: "Pipe",
    amount: 100,
    currency: "PHP",
    status: "DRAFT",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

test("R3 source ownership: linked supplier Expense replaces invoice cost without double posting", () => {
  const project: Project = { id: "project-1", projectCode: "P-1", projectName: "Water works", status: "ACTIVE", projectBudget: 1000, currency: "PHP", createdAt: "2026-09-01", updatedAt: "2026-09-01" };
  const sourceInvoice = invoice();
  const costInvoice: any = { ...sourceInvoice, allocations: [{ id: "alloc-1", invoiceId: sourceInvoice.id, projectId: project.id, allocationType: "AMOUNT", allocationAmount: 100 }] };
  const linked = expense({ supplierInvoiceId: sourceInvoice.id, projectId: project.id, status: "APPROVED" });
  const summary = calculateProjectCost(project, { invoices: [costInvoice], expenses: [linked] });
  assert.equal(summary.invoiceCost, 0);
  assert.equal(summary.otherExpenseCost, 100);
  assert.equal(summary.totalActualCost, 100);
  assert.equal(supplierExpenseCostOwnership([costInvoice], [linked]).byInvoiceId.get(sourceInvoice.id)?.id, linked.id);
});

test("R3 source ownership allocates a linked Expense across preserved invoice project allocations", () => {
  const sourceInvoice: any = invoice({ grandTotal: 300 });
  sourceInvoice.allocations = [
    { id: "a", invoiceId: sourceInvoice.id, projectId: "project-a", allocationType: "AMOUNT", allocationAmount: 200 },
    { id: "b", invoiceId: sourceInvoice.id, projectId: "project-b", allocationType: "AMOUNT", allocationAmount: 100 },
  ];
  const linked = expense({ amount: 300, supplierInvoiceId: sourceInvoice.id });
  assert.equal(supplierExpenseAmountForProject(linked, sourceInvoice, "project-a"), 200);
  assert.equal(supplierExpenseAmountForProject(linked, sourceInvoice, "project-b"), 100);
  assert.equal(supplierExpenseAmountForProject(linked, sourceInvoice), 0);
});

test("R3 document models follow the supplied HSC PO identity and use dynamic processor data", () => {
  const vendor: Vendor = { id: "vendor-1", name: "Acme Supply", normalizedName: "acme supply", address: "Manila", taxId: "123" };
  const project: Project = { id: "project-1", projectCode: "P-1", projectName: "Water works", siteAddress: "Bulacan", status: "ACTIVE", projectBudget: 1000, currency: "PHP", createdAt: "2026-09-01", updatedAt: "2026-09-01" };
  const po: PurchaseOrder = { id: "po-1", poNumber: "2026-0001", vendorId: vendor.id, projectId: project.id, currency: "PHP", status: "ISSUED", issueDate: "2026-09-01", lines: [{ id: "pol-1", purchaseOrderId: "po-1", lineNumber: 1, description: "Pipe", quantity: 2, unit: "pcs", unitPrice: 50, amount: 100 }], totalAmount: 100 };
  const model = buildPurchaseOrderDocumentSnapshot(po, vendor, project, defaultProfile, { name: "Maria Santos", title: "Purchasing Manager" });
  assert.equal(model.documentType, "PURCHASE_ORDER");
  assert.equal(model.company.legalName, defaultProfile.legalName);
  assert.equal(model.company.vatTin, defaultProfile.vatTin);
  assert.equal(model.processor.name, "Maria Santos");
  assert.equal(model.processor.title, "Purchasing Manager");
  assert.equal(buildPurchaseOrderDocumentSnapshot({ ...po, status: "APPROVED" }, vendor, project, defaultProfile).status, "DRAFT");
  assert.equal(buildPurchaseOrderDocumentSnapshot({ ...po, status: "CLOSED" }, vendor, project, defaultProfile).status, "ISSUED");
  assert.match(model.amountInWords || "", /one hundred PHP only/i);
  assert.match(new TextDecoder().decode(buildPurchaseOrderPdf(model)), /%PDF-1\.4/);
  assert.match(amountInWords(101.25, "PHP"), /one hundred one PHP and twenty-five centavos only/i);
});

test("R3 client invoice model snapshots project-level billing contact defaults", () => {
  const project: Project = { id: "project-1", projectCode: "P-1", projectName: "Water works", clientName: "Client Co", billingContactName: "Ana Client", billingEmail: "billing@client.example", billingAddress: "Client address", status: "ACTIVE", projectBudget: 1000, currency: "PHP", createdAt: "2026-09-01", updatedAt: "2026-09-01" };
  const billing: ClientBilling = { id: "billing-1", projectId: project.id, billingNumber: "PB-P-1-001", billingDate: "2026-09-01", currency: "PHP", status: "ISSUED", lines: [{ id: "line-1", billingId: "billing-1", lineNumber: 1, description: "Progress work", amount: 500 }], createdAt: "2026-09-01", updatedAt: "2026-09-01" };
  const model = buildClientInvoiceDocumentSnapshot(billing, project, defaultProfile, { name: "Project Controller" });
  assert.equal(model.documentType, "CLIENT_INVOICE");
  assert.equal(model.billTo.contactName, "Ana Client");
  assert.equal(model.billTo.email, "billing@client.example");
  assert.equal(model.totalAmount, 500);
  assert.equal(model.taxAmount, undefined);
  assert.equal(buildClientInvoiceDocumentSnapshot({ ...billing, status: "SUBMITTED" }, project, defaultProfile).status, "DRAFT");
  assert.equal(buildClientInvoiceDocumentSnapshot({ ...billing, status: "VOIDED" }, project, defaultProfile).status, "VOIDED");
});

test("R3 migration protects one-to-one provenance, immutable snapshots, buyer profile, and send audit", () => {
  assert.match(migration, /supplier_invoice_id uuid/i);
  assert.match(migration, /expenses_company_supplier_invoice_unique/i);
  assert.match(migration, /verify_supplier_invoice_and_create_expense/i);
  assert.match(migration, /Issued document snapshots are immutable/i);
  assert.match(migration, /company_document_profiles/i);
  assert.match(migration, /'HydroQualiSense Solutions Corp.'/i);
  assert.match(migration, /document_send_audits/i);
  assert.match(migration, /gmail\.manage/i);
  assert.match(migration, /purchase_orders_issued_document_snapshot/i);
  assert.match(migration, /client_billings_issued_document_snapshot/i);
});

test("R3 UI keeps buyer data available only in the collapsed details path", () => {
  const review = readFileSync(new URL("../src/components/SupplierInvoiceReview.tsx", import.meta.url), "utf8");
  assert.match(review, /More extracted details/);
  assert.match(review, /Edit details/);
  assert.match(review, /supplier-invoice-edit-buyer/);
  assert.match(review, /Buyer fields/);
  assert.doesNotMatch(review, /Customer \/ Buyer/);
});

test("R3 primary navigation contains Expenses but no standalone invoice module", () => {
  const nav = readFileSync(new URL("../src/navigation/navigationModel.ts", import.meta.url), "utf8");
  assert.match(nav, /id: "expenses"/);
  assert.doesNotMatch(nav, /id: "invoices", label: "Invoices"/);
});

test("R3 Gmail sending requires explicit send endpoint, snapshot identity, and audited status", () => {
  const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(server, /app\.post\("\/api\/gmail\/send"/);
  assert.match(server, /authorizeCompanyRequest\(req, "gmail\.manage"\)/);
  assert.match(server, /issued_document_snapshots/);
  assert.match(server, /document_send_audits/);
  assert.match(server, /status: "FAILED"/);
});
