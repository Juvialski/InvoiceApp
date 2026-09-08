import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Expense, InvoiceData } from "../src/types.ts";
import { classifySupplierDocuments, getSupplierInvoiceExpenseReadiness } from "../src/utils/supplierExpenseWorkspace.ts";

const expensesPage = readFileSync(new URL("../src/components/expenses/ExpensesPage.tsx", import.meta.url), "utf8");
const reviewSource = readFileSync(new URL("../src/components/SupplierInvoiceReview.tsx", import.meta.url), "utf8");
const readinessSource = readFileSync(new URL("../src/utils/supplierExpenseWorkspace.ts", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/components/VerificationWorkspace.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const persistenceSource = readFileSync(new URL("../src/lib/persistence.ts", import.meta.url), "utf8");
const r3Migration = readFileSync(new URL("../supabase/migrations/20260906010750_hydroqualisense_r3_unified_financial_documents.sql", import.meta.url), "utf8");
const repairGuardMigration = readFileSync(new URL("../supabase/migrations/20260908024017_supplier_invoice_repair_guards.sql", import.meta.url), "utf8");

function invoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    id: "readiness-invoice",
    invoiceNumber: "READY-001",
    invoiceDate: "2026-09-08",
    currency: "PHP",
    vendor: { name: "Canonical Supplier", vendorId: "vendor-1" },
    customer: { name: "HydroQualiSense Solutions Corp." },
    items: [{ id: "line-1", description: "Confirmed materials", quantity: 1, unitPrice: 100, total: 100 }],
    subtotal: 100,
    totalTax: 0,
    grandTotal: 100,
    description: "Confirmed materials",
    category: "Materials",
    extractedAt: "2026-09-08T00:00:00.000Z",
    modelUsed: "test",
    reviewStatus: "VERIFIED",
    lifecycleStatus: "ACTIVE",
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "readiness-expense",
    expenseDate: "2026-09-08",
    category: "Materials",
    description: "Confirmed materials",
    amount: 100,
    currency: "PHP",
    status: "DRAFT",
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

test("VERIFIED with no canonical Vendor is not READY_TO_LINK", () => {
  const row = classifySupplierDocuments([invoice({ vendor: { name: "Extracted Supplier" } })], [], [], [])[0]!;
  assert.equal(row.state, "NEEDS_REVIEW");
  assert.equal(row.readiness.readyToLink, false);
  assert.match(row.readiness.blockingReasons.join(" "), /canonical Vendor/i);
});

test("VERIFIED with a missing Expense description is not READY_TO_LINK", () => {
  const row = classifySupplierDocuments([invoice({ description: "   " })], [], [], [])[0]!;
  assert.equal(row.state, "NEEDS_REVIEW");
  assert.equal(row.readiness.readyToLink, false);
  assert.match(row.readiness.blockingReasons.join(" "), /Expense description/i);
});

test("a complete VERIFIED invoice with no Expense is READY_TO_LINK", () => {
  const row = classifySupplierDocuments([invoice()], [], [], [])[0]!;
  assert.equal(row.state, "READY_TO_LINK");
  assert.equal(row.readiness.complete, true);
  assert.equal(row.readiness.readyToLink, true);
  assert.deepEqual(row.readiness.blockingReasons, []);
});

test("a linked invoice remains LINKED even when its source facts need no new posting", () => {
  const row = classifySupplierDocuments([invoice()], [expense({ supplierInvoiceId: "readiness-invoice" })], [], [])[0]!;
  assert.equal(row.state, "LINKED");
  assert.equal(row.linkedExpense?.id, "readiness-expense");
});

test("fixing required facts changes readiness without changing the historical review status", () => {
  const incomplete = invoice({ vendor: { name: "Extracted Supplier" }, description: "" });
  const before = getSupplierInvoiceExpenseReadiness(incomplete);
  const fixed = { ...incomplete, vendor: { ...incomplete.vendor, vendorId: "vendor-1" }, description: "Confirmed materials" };
  const after = getSupplierInvoiceExpenseReadiness(fixed);
  assert.equal(before.readyToLink, false);
  assert.equal(after.readyToLink, true);
  assert.equal(fixed.reviewStatus, "VERIFIED");
});

test("extracted vendor evidence is not automatically promoted to a canonical Vendor", () => {
  const readiness = getSupplierInvoiceExpenseReadiness(invoice({
    vendor: { name: "Extracted Supplier" },
    entityResolution: { proposedAction: "CREATE_NEW", entityType: "VENDOR", candidateId: "readiness-invoice", confidence: "HIGH", confidenceScore: 99, matchReasons: [], conflicts: [], proposedEnrichments: [], extractedEvidence: { name: "Extracted Supplier" }, normalizedEvidence: { name: "extracted supplier" } },
  }));
  assert.equal(readiness.readyToLink, false);
  assert.ok(readiness.issues.some((issue) => issue.code === "CANONICAL_VENDOR"));
});

test("the posting boundary remains the guarded idempotent RPC and the linked Expense remains one authoritative row", () => {
  assert.match(persistenceSource, /verify_supplier_invoice_and_create_expense/);
  assert.match(r3Migration, /expenses_company_supplier_invoice_unique/);
  assert.match(r3Migration, /for update/);
  assert.match(repairGuardMigration, /active linked Expense cannot be reopened/i);
});

test("the UI presents readiness reasons, exposes Expense posting facts, and routes legacy repairs into review", () => {
  assert.match(expensesPage, /Needs completion/);
  assert.match(expensesPage, /Supplier documents requiring review or completion/);
  assert.match(reviewSource, /Expense description/);
  assert.match(readinessSource, /Select or create a canonical Vendor/);
  assert.match(workspaceSource, /supplierReadiness\.complete/);
  assert.match(appSource, /active authoritative Expense/);
});
