import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectFinancialTruth } from "../src/utils/projectFinancialSummary.ts";
import type { Project, ProjectCostSummary } from "../src/types.ts";

const project: Project = {
  id: "project-a",
  projectCode: "P-A",
  projectName: "Project A",
  status: "ACTIVE",
  contractValue: 1_500_000,
  projectBudget: 1_000_000,
  currency: "PHP",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

const summary: ProjectCostSummary = {
  budget: 1_000_000,
  invoiceCost: 300_000,
  paidInvoiceCost: 100_000,
  unpaidInvoiceCost: 200_000,
  unallocatedPayrollCost: 0,
  pendingInvoiceCost: 25_000,
  payrollCost: 150_000,
  pendingPayrollCost: 10_000,
  otherExpenseCost: 50_000,
  pendingExpenseCost: 5_000,
  totalActualCost: 500_000,
  committedCost: 0,
  remainingBudget: 500_000,
  budgetUsedPercent: 50,
  foreignCosts: {},
  unallocatedInvoiceCost: 0,
  unallocatedExpenseCost: 0,
};

test("financial truth keeps revenue, budget, actual, payable, and pending concepts distinct", () => {
  const truth = buildProjectFinancialTruth(project, summary);
  assert.deepEqual(truth.contractValue, { status: "available", amount: 1_500_000, currency: "PHP" });
  assert.deepEqual(truth.approvedCostBudget, { status: "available", amount: 1_000_000, currency: "PHP" });
  assert.deepEqual(truth.actualCost, { status: "available", amount: 500_000, currency: "PHP" });
  assert.deepEqual(truth.remainingBudget, { status: "available", amount: 500_000, currency: "PHP" });
  assert.deepEqual(truth.pendingCostExposure, { status: "available", amount: 40_000, currency: "PHP" });
  assert.deepEqual(truth.outstandingPayables, { status: "available", amount: 200_000, currency: "PHP" });
  assert.deepEqual(truth.committedCost, { status: "available", amount: 0, currency: "PHP" });
  assert.equal(truth.billed.status, "unavailable");
  assert.equal(truth.collected.status, "unavailable");
  assert.equal(truth.outstandingReceivables.status, "unavailable");
});

test("mixed-currency costs never fabricate confirmed, pending, or payable classification", () => {
  const truth = buildProjectFinancialTruth(project, { ...summary, foreignCosts: { USD: 1_000 } });

  assert.equal(truth.actualCost.status, "partial");
  assert.equal(truth.actualCost.amount, 500_000);
  assert.equal(truth.actualCost.currency, "PHP");
  assert.equal(truth.actualCost.foreignAmounts, undefined);
  assert.match(truth.actualCost.reason || "", /does not preserve whether they are confirmed or pending/);

  assert.equal(truth.pendingCostExposure.status, "partial");
  assert.equal(truth.pendingCostExposure.amount, 40_000);
  assert.equal(truth.pendingCostExposure.currency, "PHP");
  assert.equal(truth.pendingCostExposure.foreignAmounts, undefined);
  assert.match(truth.pendingCostExposure.reason || "", /does not preserve whether they are confirmed or pending/);

  assert.equal(truth.outstandingPayables.status, "partial");
  assert.equal(truth.outstandingPayables.amount, 200_000);
  assert.equal(truth.outstandingPayables.currency, "PHP");
  assert.equal(truth.outstandingPayables.foreignAmounts, undefined);
  assert.match(truth.outstandingPayables.reason || "", /does not preserve which foreign amounts are supplier invoice payables/);

  assert.equal(truth.committedCost.status, "partial");
  assert.equal(truth.remainingBudget.status, "unavailable");
});

test("zero-valued foreign buckets do not degrade otherwise complete metrics", () => {
  const truth = buildProjectFinancialTruth(project, { ...summary, foreignCosts: { USD: 0 } });
  assert.deepEqual(truth.actualCost, { status: "available", amount: 500_000, currency: "PHP" });
  assert.deepEqual(truth.committedCost, { status: "available", amount: 0, currency: "PHP" });
  assert.deepEqual(truth.pendingCostExposure, { status: "available", amount: 40_000, currency: "PHP" });
  assert.deepEqual(truth.outstandingPayables, { status: "available", amount: 200_000, currency: "PHP" });
  assert.deepEqual(truth.remainingBudget, { status: "available", amount: 500_000, currency: "PHP" });
});

test("missing contract value remains explicitly unavailable instead of becoming zero", () => {
  const truth = buildProjectFinancialTruth({ ...project, contractValue: undefined }, summary);
  assert.equal(truth.contractValue.status, "unavailable");
  assert.equal(truth.contractValue.amount, undefined);
});
