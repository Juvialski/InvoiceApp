import assert from "node:assert/strict";
import test from "node:test";
import type { Project } from "../src/types.ts";
import { calculateProjectCost } from "../src/utils/projectCosting.ts";
import { buildDashboardViewData } from "../src/utils/dashboardViewModel.ts";
import { buildProjectDashboardViewData } from "../src/utils/projectDashboardViewModel.ts";
import {
  parseProjectLaborCostAggregates,
  projectLaborAggregateCurrencyConflicts,
  type ProjectLaborCostAggregate,
} from "../src/utils/projectLaborCostAggregate.ts";

const project = (id: string, currency = "PHP"): Project => ({
  id,
  projectCode: id,
  projectName: id,
  status: "ACTIVE",
  projectBudget: 10_000,
  currency,
  createdAt: "2026-08-01",
  updatedAt: "2026-08-01",
});

const aggregate = (overrides: Partial<ProjectLaborCostAggregate> = {}): ProjectLaborCostAggregate => ({
  projectId: "project-a",
  currency: "PHP",
  confirmedLaborCost: 150,
  pendingLaborCost: 35,
  status: "AVAILABLE",
  ...overrides,
});

test("aggregate parser distinguishes an authoritative zero from an incomplete response", () => {
  const zero = parseProjectLaborCostAggregates([{
    project_id: "project-zero",
    currency: "php",
    confirmed_labor_cost: "0",
    pending_labor_cost: "0",
    aggregate_status: "ZERO",
  }], ["project-zero"]);
  assert.deepEqual(zero[0], {
    projectId: "project-zero",
    currency: "PHP",
    confirmedLaborCost: 0,
    pendingLaborCost: 0,
    status: "ZERO",
  });
  assert.throws(() => parseProjectLaborCostAggregates([], ["project-zero"]), /did not cover every requested project/i);
  assert.throws(() => parseProjectLaborCostAggregates([{
    project_id: "project-zero",
    currency: "PHP",
    confirmed_labor_cost: 1,
    pending_labor_cost: 0,
    aggregate_status: "ZERO",
  }], ["project-zero"]), /invalid row/i);
});

test("safe aggregate composes canonical allocation totals without gross or net pay", () => {
  const summary = calculateProjectCost(project("project-a"), {
    laborSource: "aggregate",
    projectLaborAggregates: [aggregate()],
  });
  assert.equal(summary.payrollCost, 150);
  assert.equal(summary.pendingPayrollCost, 35);
  assert.equal(summary.totalActualCost, 150);
  assert.equal(summary.unpaidInvoiceCost, 0);
});

test("project cost composition can combine invoice, expense, and safe labor sources in one currency", () => {
  const summary = calculateProjectCost(project("project-a"), {
    laborSource: "aggregate",
    projectLaborAggregates: [aggregate({ confirmedLaborCost: 150, pendingLaborCost: 35 })],
    invoices: [{
      id: "invoice-a",
      grandTotal: 500,
      currency: "PHP",
      reviewStatus: "VERIFIED",
      status: "UNPAID",
      amountPaid: 0,
      allocations: [{ id: "invoice-allocation-a", invoiceId: "invoice-a", projectId: "project-a", allocationType: "AMOUNT", allocationAmount: 400 }],
    }],
    expenses: [{
      id: "expense-a",
      projectId: "project-a",
      expenseDate: "2026-08-01",
      category: "Fuel",
      description: "Site fuel",
      amount: 100,
      currency: "PHP",
      status: "APPROVED",
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
    }],
  });
  assert.equal(summary.invoiceCost, 400);
  assert.equal(summary.payrollCost, 150);
  assert.equal(summary.otherExpenseCost, 100);
  assert.equal(summary.totalActualCost, 650);
  assert.equal(summary.pendingPayrollCost, 35);
});

test("aggregate currency mismatches stay foreign and never enter the project total", () => {
  const usdAggregate = aggregate({ currency: "USD", confirmedLaborCost: 200, pendingLaborCost: 25 });
  const summary = calculateProjectCost(project("project-a", "PHP"), {
    laborSource: "aggregate",
    projectLaborAggregates: [usdAggregate],
  });
  assert.equal(summary.payrollCost, 0);
  assert.equal(summary.pendingPayrollCost, 0);
  assert.equal(summary.totalActualCost, 0);
  assert.deepEqual(summary.foreignCosts, { USD: 225 });
  assert.deepEqual(projectLaborAggregateCurrencyConflicts([project("project-a")], [usdAggregate]), ["project-a"]);
});

test("aggregate status remains safe when there are pending rows but no confirmed labor", () => {
  const pending = aggregate({ confirmedLaborCost: 0, pendingLaborCost: 80 });
  const summary = calculateProjectCost(project("project-a"), {
    laborSource: "aggregate",
    projectLaborAggregates: [pending],
  });
  assert.equal(summary.payrollCost, 0);
  assert.equal(summary.pendingPayrollCost, 80);
  assert.equal(summary.totalActualCost, 0);
});

test("Dashboard and Project Overview view models consume aggregate labor without payroll detail", () => {
  const input = {
    projects: [project("project-a")],
    invoices: [],
    expenses: [],
    payroll: [],
    periods: [],
    workers: [],
    payrollEntries: [],
    payrollAllocations: [],
    payrollRuns: [],
    projectLaborAggregates: [aggregate()],
    laborSource: "aggregate" as const,
    activityPeriod: "YEAR" as const,
    selectedCurrency: "PHP",
    today: "2026-08-28",
  };
  const dashboard = buildDashboardViewData(input);
  assert.equal(dashboard.projectRows[0]?.payrollCost, 150);
  assert.equal(dashboard.projectRows[0]?.pending, 35);
  assert.equal(dashboard.payrollDetailAvailable, false);
  const projectDashboard = buildProjectDashboardViewData({
    project: project("project-a"),
    invoices: [],
    expenses: [],
    payroll: [],
    projectLaborAggregates: [aggregate()],
    laborSource: "aggregate",
    today: "2026-08-28",
  });
  assert.equal(projectDashboard.composition.payroll, 150);
  assert.equal(projectDashboard.pending, 35);
});
