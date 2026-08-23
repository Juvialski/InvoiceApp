import test from "node:test";
import assert from "node:assert/strict";
import { calculateMonthlyProjectAllocations } from "../src/lib/payroll.ts";
import { calculateProjectCost, validateInvoiceAllocations } from "../src/utils/projectCosting.ts";
import { suggestProjectMatches } from "../src/utils/projectMatching.ts";
import type { Expense, InvoiceProjectAllocation, Project } from "../src/types.ts";

const project: Project = { id: "a", projectCode: "PRJ-A", projectName: "Sta. Rosa Flood Control", clientName: "City Engineering Office", location: "Sta. Rosa", status: "ACTIVE", projectBudget: 5_000_000, currency: "PHP", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
const allocation = (id: string, projectId: string, amount: number): InvoiceProjectAllocation => ({ id, invoiceId: "invoice-1", projectId, allocationType: "AMOUNT", allocationAmount: amount });

test("split invoice allocation is counted once across projects and rejects over-allocation", () => {
  assert.deepEqual(validateInvoiceAllocations(100_000, [allocation("1", "a", 60_000), allocation("2", "b", 40_000)]), { valid: true, total: 100_000, remaining: 0, exceedsBy: 0, message: undefined });
  const invalid = validateInvoiceAllocations(100_000, [allocation("1", "a", 70_000), allocation("2", "b", 50_000)]);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.exceedsBy, 20_000);
});

test("confirmed, pending, direct expense, and payroll costs use the defined semantics", () => {
  const expenses: Expense[] = [{ id: "fuel", projectId: "a", expenseDate: "2026-08-01", category: "Fuel", description: "Fuel", amount: 10_000, currency: "PHP", status: "APPROVED", createdAt: "2026-08-01", updatedAt: "2026-08-01" }];
  const summary = calculateProjectCost(project, {
    invoices: [
      { id: "invoice-1", grandTotal: 100_000, currency: "PHP", reviewStatus: "VERIFIED", status: "UNPAID", allocations: [allocation("1", "a", 60_000)] },
      { id: "invoice-2", grandTotal: 30_000, currency: "PHP", reviewStatus: "NEEDS_REVIEW", status: "UNPAID", allocations: [allocation("3", "a", 30_000)] },
    ],
    payroll: [{ id: "run-draft", status: "DRAFT", allocations: [{ id: "pa-draft", payrollEntryId: "e1", projectId: "a", allocationAmount: 30_000, source: "MANUAL" }] }, { id: "run-approved", status: "APPROVED", allocations: [{ id: "pa-approved", payrollEntryId: "e2", projectId: "a", allocationAmount: 24_000, source: "MANUAL" }] }],
    expenses,
  });
  assert.equal(summary.invoiceCost, 60_000);
  assert.equal(summary.pendingInvoiceCost, 30_000);
  assert.equal(summary.payrollCost, 24_000);
  assert.equal(summary.pendingPayrollCost, 30_000);
  assert.equal(summary.otherExpenseCost, 10_000);
  assert.equal(summary.totalActualCost, 94_000);
});

test("void expenses and foreign currencies do not inflate the PHP actual cost", () => {
  const summary = calculateProjectCost(project, {
    invoices: [{ id: "usd", grandTotal: 1_000, currency: "USD", reviewStatus: "VERIFIED", status: "PAID", allocations: [allocation("usd-a", "a", 1_000)] }],
    expenses: [{ id: "void", projectId: "a", expenseDate: "2026-08-01", category: "Fuel", description: "Void", amount: 20_000, currency: "PHP", status: "VOID", createdAt: "2026-08-01", updatedAt: "2026-08-01" }],
  });
  assert.equal(summary.totalActualCost, 0);
  assert.equal(summary.foreignCosts.USD, 1_000);
});

test("monthly payroll split preserves the full salary and project matching stays human-confirmed", () => {
  assert.deepEqual(calculateMonthlyProjectAllocations(40_000, [{ projectId: "a", percentage: 60 }, { projectId: "b", percentage: 40 }]), [{ projectId: "a", allocationAmount: 24_000, allocationPercentage: 60 }, { projectId: "b", allocationAmount: 16_000, allocationPercentage: 40 }]);
  const matches = suggestProjectMatches({ projectReference: "PRJ-A Sta. Rosa Flood Control", purchaseOrderNumber: "", vendor: { name: "Materials Supplier" }, customer: { name: "City Engineering Office" }, notes: "" }, [project]);
  assert.equal(matches[0]?.project.id, "a");
  assert.ok(matches[0]?.reasons.includes("project reference"));
});
