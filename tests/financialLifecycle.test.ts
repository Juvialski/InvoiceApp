import assert from "node:assert/strict";
import test from "node:test";
import type { Expense, InvoiceData, InvoiceProjectAllocation, Project } from "../src/types.ts";
import { buildLocalExpenseCorrectionPreview, buildLocalInvoiceCorrectionPreview, parseFinancialCorrectionPreview } from "../src/lib/financialLifecycle.ts";
import { activityTrends } from "../src/utils/dashboardStats.ts";
import { calculateProjectCost } from "../src/utils/projectCosting.ts";

const project: Project = { id: "project-a", projectCode: "A", projectName: "Project A", status: "ACTIVE", projectBudget: 1_000, currency: "PHP", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
const allocation: InvoiceProjectAllocation = { id: "allocation-a", invoiceId: "invoice-a", projectId: project.id, allocationType: "AMOUNT", allocationAmount: 600 };
const invoice = (overrides: Partial<InvoiceData> = {}) => ({
  id: "invoice-a", invoiceNumber: "INV-A", invoiceDate: "2026-08-01", currency: "PHP", grandTotal: 600, vendor: { name: "Vendor" }, customer: { name: "Customer" }, items: [], subtotal: 600, totalTax: 0, extractedAt: "2026-08-01T00:00:00Z", modelUsed: "fixture", reviewStatus: "VERIFIED" as const, lifecycleStatus: "ACTIVE" as const, ...overrides,
} as InvoiceData);

test("voided invoices are excluded from project cost while archived invoices remain financial records", () => {
  const active = calculateProjectCost(project, { invoices: [{ ...invoice(), allocations: [allocation] }] });
  const archived = calculateProjectCost(project, { invoices: [{ ...invoice({ archivedAt: "2026-08-02T00:00:00Z" }), allocations: [allocation] }] });
  const voided = calculateProjectCost(project, { invoices: [{ ...invoice({ lifecycleStatus: "VOID", voidedAt: "2026-08-02T00:00:00Z", voidReason: "Duplicate" }), allocations: [allocation] }] });
  assert.equal(active.invoiceCost, 600);
  assert.equal(archived.invoiceCost, 600);
  assert.equal(voided.invoiceCost, 0);
});

test("archived approved expenses remain in project cost, while void expenses do not", () => {
  const base: Expense = { id: "expense-a", projectId: project.id, expenseDate: "2026-08-01", category: "Fuel", description: "Fuel", amount: 100, currency: "PHP", status: "APPROVED", createdAt: "2026-08-01", updatedAt: "2026-08-01" };
  const archived = calculateProjectCost(project, { expenses: [{ ...base, archivedAt: "2026-08-02" }] });
  const voided = calculateProjectCost(project, { expenses: [{ ...base, status: "VOID", voidedAt: "2026-08-02", voidReason: "Duplicate" }] });
  assert.equal(archived.otherExpenseCost, 100);
  assert.equal(voided.otherExpenseCost, 0);
});

test("archive remains in financial activity trends while void is excluded", () => {
  const base: Expense = { id: "expense-a", projectId: project.id, expenseDate: "2026-08-01", category: "Fuel", description: "Fuel", amount: 100, currency: "PHP", status: "APPROVED", createdAt: "2026-08-01", updatedAt: "2026-08-01" };
  const trend = activityTrends({ projects: [project], expenses: [{ ...base, archivedAt: "2026-08-02" }, { ...base, id: "expense-void", status: "VOID" }], invoices: [], payroll: [] }, { currency: "PHP", grain: "month" });
  assert.equal(trend.find((point) => point.period === "2026-08")?.expenses, 100);
});

test("local correction previews keep permanent deletion unavailable and explain confirmed settlement blockers", () => {
  const invoicePreview = buildLocalInvoiceCorrectionPreview({ invoice: invoice(), allocationCount: 1, settlementMatchCount: 1, confirmedSettlementCount: 1, historyCount: 2 });
  assert.equal(invoicePreview.canDelete, false);
  assert.equal(invoicePreview.canVoid, false);
  assert.match(invoicePreview.blockedReason || "", /Wave 2B3/);
  const expense = { id: "expense-a", expenseDate: "2026-08-01", category: "Fuel", description: "Fuel", amount: 100, currency: "PHP", status: "APPROVED" as const, createdAt: "2026-08-01", updatedAt: "2026-08-01" };
  const expensePreview = buildLocalExpenseCorrectionPreview({ expense, confirmedSettlementCount: 0 });
  assert.equal(expensePreview.canDelete, false);
  assert.equal(expensePreview.canVoid, true);
  const settledExpensePreview = buildLocalExpenseCorrectionPreview({ expense, confirmedSettlementCount: 1 });
  assert.equal(settledExpensePreview.canVoid, false);
  assert.match(settledExpensePreview.blockedReason || "", /Wave 2B3/);
});

test("correction response parsing accepts the bounded database contract", () => {
  const parsed = parseFinancialCorrectionPreview({ entityId: "invoice-a", status: "UNPAID", reviewStatus: "VERIFIED", lifecycleStatus: "ACTIVE", canDelete: false, canVoid: true, canArchive: true, canRestore: false, recommendedAction: "VOID", totalDependencyCount: 2, confirmedSettlementCount: 0, dependencies: { projectAllocations: 2 } }, "INVOICE");
  assert.equal(parsed.recommendedAction, "VOID");
  assert.equal(parsed.dependencies.projectAllocations, 2);
});
