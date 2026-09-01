import test from "node:test";
import assert from "node:assert/strict";
import { calculateProjectCost } from "../src/utils/projectCosting.ts";
import type { Expense, InvoiceProjectAllocation, Project } from "../src/types.ts";

const project = (id: string, currency = "PHP"): Project => ({ id, projectCode: id, projectName: id, clientName: "Client", status: "ACTIVE", projectBudget: 1_000_000, currency, createdAt: "2026-01-01", updatedAt: "2026-01-01" });
const allocation = (id: string, projectId: string, amount: number): InvoiceProjectAllocation => ({ id, invoiceId: "invoice-1", projectId, allocationType: "AMOUNT", allocationAmount: amount });
const expense = (overrides: Partial<Expense> = {}): Expense => ({ id: "expense-1", projectId: "project-a", expenseDate: "2026-01-02", category: "OTHER", description: "Direct project cost", amount: 100_000, currency: "PHP", status: "APPROVED", createdAt: "2026-01-02", updatedAt: "2026-01-02", ...overrides });

test("partial invoice payment is split proportionally and never overstated per project", () => {
  const allocations = [allocation("a", "project-a", 60_000), allocation("b", "project-b", 40_000)];
  const input = { invoices: [{ id: "invoice-1", grandTotal: 100_000, amountPaid: 50_000, currency: "PHP", reviewStatus: "VERIFIED" as const, status: "PARTIALLY_PAID", allocations }] };
  const a = calculateProjectCost(project("project-a"), input);
  const b = calculateProjectCost(project("project-b"), input);
  assert.equal(a.paidInvoiceCost, 30_000);
  assert.equal(b.paidInvoiceCost, 20_000);
  assert.equal(a.paidInvoiceCost + b.paidInvoiceCost, 50_000);
  assert.equal(a.unpaidInvoiceCost + b.unpaidInvoiceCost, 50_000);
});

test("partial payment cent rounding is deterministic and stays within invoice payment", () => {
  const allocations = [allocation("a", "project-a", 33.33), allocation("b", "project-b", 33.33), allocation("c", "project-c", 33.34)];
  const input = { invoices: [{ id: "invoice-1", grandTotal: 100, amountPaid: 0.02, currency: "PHP", reviewStatus: "VERIFIED" as const, status: "PARTIALLY_PAID", allocations }] };
  const paid = ["project-a", "project-b", "project-c"].map((id) => calculateProjectCost(project(id), input).paidInvoiceCost);
  assert.deepEqual(paid, [0.01, 0, 0.01]);
  assert.ok(paid.reduce((sum, amount) => sum + amount, 0) <= 0.02);
});

test("foreign currency remains excluded from base-currency invoice totals", () => {
  const summary = calculateProjectCost(project("project-a"), {
    invoices: [{ id: "invoice-1", grandTotal: 100_000, amountPaid: 50_000, currency: "USD", reviewStatus: "VERIFIED", status: "PARTIALLY_PAID", allocations: [allocation("a", "project-a", 100_000)] }],
  });
  assert.equal(summary.totalActualCost, 0);
  assert.equal(summary.paidInvoiceCost, 0);
  assert.equal(summary.foreignCosts.USD, 100_000);
});

test("verified supplier invoice payable is actual cost but not committed cost", () => {
  const summary = calculateProjectCost(project("project-a"), {
    invoices: [{ id: "invoice-1", grandTotal: 100_000, amountPaid: 25_000, currency: "PHP", reviewStatus: "VERIFIED", status: "PARTIALLY_PAID", allocations: [allocation("a", "project-a", 100_000)] }],
  });
  assert.equal(summary.invoiceCost, 100_000);
  assert.equal(summary.unpaidInvoiceCost, 75_000);
  assert.equal(summary.committedCost, 0);
});

test("exact invoice and expense source provenance is counted once", () => {
  const summary = calculateProjectCost(project("project-a"), {
    invoices: [{ id: "invoice-1", sourceDocumentId: "source-1", grandTotal: 100_000, amountPaid: 0, currency: "PHP", reviewStatus: "VERIFIED", status: "UNPAID", allocations: [allocation("a", "project-a", 100_000)] }],
    expenses: [expense({ receiptSourceDocumentId: "source-1" })],
  });
  assert.equal(summary.invoiceCost, 100_000);
  assert.equal(summary.otherExpenseCost, 0);
  assert.equal(summary.totalActualCost, 100_000);
});

test("confirmed linked expense wins over an unverified invoice from the same source", () => {
  const summary = calculateProjectCost(project("project-a"), {
    invoices: [{ id: "invoice-1", sourceDocumentId: "source-1", grandTotal: 100_000, amountPaid: 0, currency: "PHP", reviewStatus: "NEEDS_REVIEW", status: "UNPAID", allocations: [allocation("a", "project-a", 100_000)] }],
    expenses: [expense({ receiptSourceDocumentId: "source-1" })],
  });
  assert.equal(summary.pendingInvoiceCost, 0);
  assert.equal(summary.otherExpenseCost, 100_000);
  assert.equal(summary.totalActualCost, 100_000);
});

test("similar costs without exact provenance remain separate records", () => {
  const summary = calculateProjectCost(project("project-a"), {
    invoices: [{ id: "invoice-1", sourceDocumentId: "source-1", grandTotal: 100_000, amountPaid: 0, currency: "PHP", reviewStatus: "VERIFIED", status: "UNPAID", allocations: [allocation("a", "project-a", 100_000)] }],
    expenses: [expense({ receiptSourceDocumentId: "source-2" })],
  });
  assert.equal(summary.invoiceCost, 100_000);
  assert.equal(summary.otherExpenseCost, 100_000);
  assert.equal(summary.totalActualCost, 200_000);
});
