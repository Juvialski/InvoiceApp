import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Expense, InvoiceData, Project } from "../src/types.ts";
import { calculateProjectCost } from "../src/utils/projectCosting.ts";
import { classifySupplierDocuments } from "../src/utils/supplierExpenseWorkspace.ts";

const expensesPage = readFileSync(new URL("../src/components/expenses/ExpensesPage.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260906041647_r4_fx_tax_and_payroll_safety.sql", import.meta.url), "utf8");
const r3Migration = readFileSync(new URL("../supabase/migrations/20260906010750_hydroqualisense_r3_unified_financial_documents.sql", import.meta.url), "utf8");

function invoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    id: "invoice-r4",
    invoiceNumber: "R4-001",
    invoiceDate: "2026-09-06",
    currency: "PHP",
    vendor: { name: "Supplier" },
    customer: { name: "HydroQualiSense Solutions Corp." },
    items: [],
    subtotal: 100,
    totalTax: 0,
    grandTotal: 100,
    extractedAt: "2026-09-06T00:00:00.000Z",
    modelUsed: "test",
    reviewStatus: "NEEDS_REVIEW",
    lifecycleStatus: "ACTIVE",
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-r4",
    expenseDate: "2026-09-06",
    category: "Materials",
    description: "Supplier cost",
    amount: 100,
    currency: "PHP",
    status: "APPROVED",
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

test("Expenses workspace distinguishes needs-review, verified-ready, and linked supplier documents", () => {
  const rows = classifySupplierDocuments([
    invoice({ id: "needs-review", reviewStatus: "NEEDS_REVIEW" }),
    invoice({ id: "ready", reviewStatus: "VERIFIED" }),
    invoice({ id: "linked", reviewStatus: "VERIFIED" }),
  ], [expense({ id: "linked-expense", supplierInvoiceId: "linked" })]);
  assert.deepEqual(rows.map((row) => row.state), ["NEEDS_REVIEW", "READY_TO_LINK", "LINKED"]);
  assert.equal(rows[1]?.linkedExpense, undefined);
  assert.equal(rows[2]?.linkedExpense?.id, "linked-expense");
});

test("supplier invoice ownership transfer keeps project Actual Cost unchanged", () => {
  const project: Project = { id: "project-r4", projectCode: "R4", projectName: "Bridge", status: "ACTIVE", projectBudget: 1000, currency: "PHP", taxTreatment: "VAT", createdAt: "2026-09-06", updatedAt: "2026-09-06" };
  const source = invoice({ id: "source", reviewStatus: "VERIFIED" });
  const allocated = { ...source, allocations: [{ id: "allocation", invoiceId: source.id, projectId: project.id, allocationType: "AMOUNT" as const, allocationAmount: 100 }] };
  const before = calculateProjectCost(project, { invoices: [allocated], expenses: [] });
  const after = calculateProjectCost(project, { invoices: [allocated], expenses: [expense({ supplierInvoiceId: source.id, projectId: project.id, status: "DRAFT" })] });
  assert.equal(before.totalActualCost, 100);
  assert.equal(after.totalActualCost, 100);
  assert.equal(after.invoiceCost, 0);
  assert.equal(after.otherExpenseCost, 100);
  assert.equal(after.pendingExpenseCost, 0);
});

test("R4 bridge uses the existing guarded RPC and does not auto-post from page rendering", () => {
  assert.match(expensesPage, /onVerifySupplierInvoice/);
  assert.match(expensesPage, /Create linked Expense/);
  assert.match(expensesPage, /Verified · Expense link required/);
  assert.match(expensesPage, /Needs review/);
  assert.match(expensesPage, /onOpenSupplierInvoiceReview/);
  assert.match(r3Migration, /verify_supplier_invoice_and_create_expense/);
  assert.match(r3Migration, /expenses_company_supplier_invoice_unique/);
  assert.match(r3Migration, /for update/);
  assert.match(migration, /on conflict \(company_id, source_type, source_id\) do nothing/i);
});
