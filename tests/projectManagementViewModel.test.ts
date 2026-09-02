import test from "node:test";
import assert from "node:assert/strict";
import type { Project, ProjectCostCode, ProjectCostSummary } from "../src/types.ts";
import {
  buildPortfolioManagementSummary,
  buildProjectManagementView,
  filterAndSortProjectViews,
  type ProjectManagementView,
} from "../src/utils/projectManagementViewModel.ts";
import { calculateProjectCost } from "../src/utils/projectCosting.ts";

function createMockProject(overrides?: Partial<Project>): Project {
  return {
    id: "proj-1",
    projectCode: "PRJ-001",
    projectName: "Water Treatment Facility",
    clientName: "Metro Water Works",
    location: "Quezon City",
    projectManager: "Engr. Santos",
    status: "ACTIVE",
    contractValue: 5000000,
    projectBudget: 4000000,
    currency: "PHP",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createMockSummary(overrides?: Partial<ProjectCostSummary>): ProjectCostSummary {
  const invoiceCost = overrides?.invoiceCost ?? 1500000;
  const payrollCost = overrides?.payrollCost ?? 800000;
  const otherExpenseCost = overrides?.otherExpenseCost ?? 200000;
  const totalActualCost = overrides?.totalActualCost ?? (invoiceCost + payrollCost + otherExpenseCost);
  const budget = overrides?.budget ?? 4000000;
  const remainingBudget = overrides?.remainingBudget ?? (budget - totalActualCost);
  const budgetUsedPercent = overrides?.budgetUsedPercent ?? (budget > 0 ? (totalActualCost / budget) * 100 : 0);

  return {
    budget,
    invoiceCost,
    paidInvoiceCost: 1000000,
    unpaidInvoiceCost: 500000,
    unallocatedPayrollCost: 0,
    pendingInvoiceCost: overrides?.pendingInvoiceCost ?? 200000,
    payrollCost,
    pendingPayrollCost: overrides?.pendingPayrollCost ?? 100000,
    otherExpenseCost,
    pendingExpenseCost: overrides?.pendingExpenseCost ?? 50000,
    totalActualCost,
    committedCost: 0,
    remainingBudget,
    budgetUsedPercent,
    foreignCosts: overrides?.foreignCosts ?? {},
    unallocatedInvoiceCost: 0,
    unallocatedExpenseCost: 0,
    ...overrides,
  };
}

test("1. normal complete PHP project view builds correctly", () => {
  const project = createMockProject();
  const summary = createMockSummary();
  const view = buildProjectManagementView(project, summary);

  assert.equal(view.currency, "PHP");
  assert.equal(view.contractValue, 5000000);
  assert.equal(view.approvedCostBudget, 4000000);
  assert.equal(view.actualCost, 2500000);
  assert.equal(view.pendingCostExposure, 350000); // 200k + 100k + 50k
  assert.equal(view.remainingBudget, 1500000);
  assert.equal(view.variance, 1500000);
  assert.equal(view.outstandingPayables, 500000);
  assert.equal(view.health, "ON BUDGET");
  assert.equal(view.confirmedUtilization, 62.5);
  assert.equal(view.hasForeignAmounts, false);
  assert.equal(view.isPartial, false);
  assert.equal(view.financialTruth.contractValue.status, "available");
  assert.equal(view.financialTruth.actualCost.status, "available");
});

test("2. missing contract value handled properly", () => {
  const project = createMockProject({ contractValue: undefined });
  const summary = createMockSummary();
  const view = buildProjectManagementView(project, summary);

  assert.equal(view.contractValue, null);
  assert.equal(view.financialTruth.contractValue.status, "unavailable");
});

test("3. no project budget handled properly", () => {
  const project = createMockProject({ projectBudget: 0 });
  const summary = createMockSummary({ budget: 0, remainingBudget: -2500000, budgetUsedPercent: 0 });
  const view = buildProjectManagementView(project, summary);

  assert.equal(view.approvedCostBudget, 0);
  assert.equal(view.health, "NO BUDGET");
  assert.equal(view.confirmedUtilization, 0);
});

test("4. no cost activity handled properly", () => {
  const project = createMockProject();
  const summary = createMockSummary({
    invoiceCost: 0,
    paidInvoiceCost: 0,
    unpaidInvoiceCost: 0,
    pendingInvoiceCost: 0,
    payrollCost: 0,
    pendingPayrollCost: 0,
    otherExpenseCost: 0,
    pendingExpenseCost: 0,
    totalActualCost: 0,
    remainingBudget: 4000000,
    budgetUsedPercent: 0,
  });
  const view = buildProjectManagementView(project, summary);

  assert.equal(view.actualCost, 0);
  assert.equal(view.pendingCostExposure, 0);
  assert.equal(view.remainingBudget, 4000000);
  assert.equal(view.confirmedUtilization, 0);
  assert.equal(view.health, "ON BUDGET");
});

test("5. foreign-currency costs result in partial financial state and separate foreign amounts", () => {
  const project = createMockProject({ currency: "PHP" });
  const summary = createMockSummary({
    foreignCosts: { USD: 5000 },
  });
  const view = buildProjectManagementView(project, summary);

  assert.equal(view.hasForeignAmounts, true);
  assert.equal(view.isPartial, true);
  assert.equal(view.health, "PARTIAL");
  assert.equal(view.remainingBudget, null);
  assert.equal(view.variance, null);
  assert.equal(view.financialTruth.actualCost.status, "partial");
  assert.equal(view.financialTruth.remainingBudget.status, "unavailable");
  assert.ok(view.attentionFlags.some((f) => f.flag === "MIXED_CURRENCY"));
});

test("6. actual over approved budget flags OVER_BUDGET", () => {
  const project = createMockProject({ projectBudget: 2000000 });
  const summary = createMockSummary({
    budget: 2000000,
    totalActualCost: 2500000,
    remainingBudget: -500000,
    budgetUsedPercent: 125,
  });
  const view = buildProjectManagementView(project, summary);

  assert.equal(view.health, "OVER BUDGET");
  assert.equal(view.remainingBudget, -500000);
  assert.ok(view.attentionFlags.some((f) => f.flag === "OVER_BUDGET"));
});

test("7. near-budget indicator triggers at >= 90% utilization", () => {
  const project = createMockProject({ projectBudget: 1000000 });
  const summary = createMockSummary({
    budget: 1000000,
    totalActualCost: 920000,
    remainingBudget: 80000,
    budgetUsedPercent: 92,
  });
  const view = buildProjectManagementView(project, summary);

  assert.equal(view.health, "NEAR LIMIT");
  assert.ok(view.attentionFlags.some((f) => f.flag === "NEAR_BUDGET"));
});

test("8. cost codes integration: budget allocation, coded/uncoded actuals, and forecast", () => {
  const project = createMockProject({ id: "proj-10", projectBudget: 1000000, currency: "PHP" });
  const costCodes: ProjectCostCode[] = [
    {
      id: "cc-1",
      projectId: "proj-10",
      code: "CIV-01",
      name: "Civil Works",
      approvedBudgetAmount: 600000,
      forecastAmount: 580000,
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "cc-2",
      projectId: "proj-10",
      code: "ELE-01",
      name: "Electrical Works",
      approvedBudgetAmount: 300000,
      forecastAmount: 350000,
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ];

  const invoices = [
    {
      id: "inv-1",
      grandTotal: 400000,
      currency: "PHP",
      reviewStatus: "VERIFIED" as const,
      allocations: [
        {
          id: "alloc-1",
          invoiceId: "inv-1",
          projectId: "proj-10",
          projectCostCodeId: "cc-1",
          allocationType: "AMOUNT" as const,
          allocationAmount: 400000,
        },
      ],
    },
    {
      id: "inv-2",
      grandTotal: 100000,
      currency: "PHP",
      reviewStatus: "VERIFIED" as const,
      allocations: [
        {
          id: "alloc-2",
          invoiceId: "inv-2",
          projectId: "proj-10",
          allocationType: "AMOUNT" as const,
          allocationAmount: 100000, // Uncoded!
        },
      ],
    },
  ];

  const summary = createMockSummary({
    budget: 1000000,
    invoiceCost: 500000,
    payrollCost: 0,
    otherExpenseCost: 0,
    totalActualCost: 500000,
    remainingBudget: 500000,
  });

  const view = buildProjectManagementView(project, summary, {
    costCodes,
    invoices,
  });

  assert.equal(view.allocatedCostCodeBudget, 900000); // 600k + 300k
  assert.equal(view.unallocatedBudget, 100000); // 1M - 900k
  assert.equal(view.codedActualCost, 400000);
  assert.equal(view.uncodedActualCost, 100000);
  assert.equal(view.activeCostCodesCount, 2);
  assert.equal(view.hasExplicitForecast, true);
  assert.equal(view.forecastFinalCost, 930000); // 580k + 350k
  assert.equal(view.forecastVariance, 70000); // 1M - 930k

  assert.ok(view.attentionFlags.some((f) => f.flag === "UNCODED_COST"));
  assert.ok(view.attentionFlags.some((f) => f.flag === "UNALLOCATED_BUDGET"));
});

test("9. forecast over budget flag triggers when forecastFinalCost > budget", () => {
  const project = createMockProject({ id: "proj-11", projectBudget: 500000, currency: "PHP" });
  const costCodes: ProjectCostCode[] = [
    {
      id: "cc-1",
      projectId: "proj-11",
      code: "CIV-01",
      name: "Civil Works",
      approvedBudgetAmount: 500000,
      forecastAmount: 600000,
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ];

  const summary = createMockSummary({ budget: 500000, totalActualCost: 300000 });
  const view = buildProjectManagementView(project, summary, { costCodes, invoices: [] });

  assert.equal(view.forecastFinalCost, 600000);
  assert.equal(view.forecastVariance, -100000);
  assert.ok(view.attentionFlags.some((f) => f.flag === "FORECAST_OVER_BUDGET"));
});

test("10. missing forecast flag triggers when active codes lack forecast", () => {
  const project = createMockProject({ id: "proj-12", projectBudget: 500000, currency: "PHP" });
  const costCodes: ProjectCostCode[] = [
    {
      id: "cc-1",
      projectId: "proj-12",
      code: "CIV-01",
      name: "Civil Works",
      approvedBudgetAmount: 500000,
      forecastAmount: undefined,
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ];

  const summary = createMockSummary({ budget: 500000, totalActualCost: 100000 });
  const view = buildProjectManagementView(project, summary, { costCodes, invoices: [] });

  assert.equal(view.hasExplicitForecast, false);
  assert.ok(view.attentionFlags.some((f) => f.flag === "FORECAST_NOT_SET"));
});

test("11. unavailable commercial metrics stay unavailable (committed, billed, collected, AR)", () => {
  const project = createMockProject();
  const summary = createMockSummary();
  const view = buildProjectManagementView(project, summary);

  assert.equal(view.financialTruth.committedCost.status, "unavailable");
  assert.equal(view.financialTruth.billed.status, "unavailable");
  assert.equal(view.financialTruth.collected.status, "unavailable");
  assert.equal(view.financialTruth.outstandingReceivables.status, "unavailable");
  assert.equal(view.financialTruth.committedCost.amount, undefined);
  assert.equal(view.financialTruth.billed.amount, undefined);
  assert.equal(view.financialTruth.collected.amount, undefined);
  assert.equal(view.financialTruth.outstandingReceivables.amount, undefined);
});

test("12. multi-currency portfolio summary groups totals and never sums mixed currencies", () => {
  const p1 = createMockProject({ id: "p1", currency: "PHP", contractValue: 1000000, projectBudget: 800000 });
  const s1 = createMockSummary({
    budget: 800000,
    totalActualCost: 500000,
    pendingInvoiceCost: 50000,
    pendingPayrollCost: 0,
    pendingExpenseCost: 0,
  });

  const p2 = createMockProject({ id: "p2", currency: "USD", contractValue: 50000, projectBudget: 40000 });
  const s2 = createMockSummary({
    budget: 40000,
    totalActualCost: 25000,
    pendingInvoiceCost: 2000,
    pendingPayrollCost: 0,
    pendingExpenseCost: 0,
  });

  const v1 = buildProjectManagementView(p1, s1);
  const v2 = buildProjectManagementView(p2, s2);

  const portfolio = buildPortfolioManagementSummary([v1, v2]);

  assert.equal(portfolio.totalProjects, 2);
  assert.equal(portfolio.isMultiCurrency, true);
  assert.deepEqual(portfolio.currencies.sort(), ["PHP", "USD"]);

  assert.equal(portfolio.currencyGroups.PHP?.totalContractValue, 1000000);
  assert.equal(portfolio.currencyGroups.PHP?.totalApprovedBudget, 800000);
  assert.equal(portfolio.currencyGroups.PHP?.totalActualCost, 500000);
  assert.equal(portfolio.currencyGroups.PHP?.totalPendingExposure, 50000);

  assert.equal(portfolio.currencyGroups.USD?.totalContractValue, 50000);
  assert.equal(portfolio.currencyGroups.USD?.totalApprovedBudget, 40000);
  assert.equal(portfolio.currencyGroups.USD?.totalActualCost, 25000);
  assert.equal(portfolio.currencyGroups.USD?.totalPendingExposure, 2000);
});

test("13. filter and sort project views works accurately", () => {
  const p1 = createMockProject({ id: "p1", projectCode: "PRJ-AAA", projectName: "Alpha", status: "ACTIVE", projectBudget: 1000000 });
  const s1 = createMockSummary({ budget: 1000000, totalActualCost: 950000 }); // 95% -> Near limit

  const p2 = createMockProject({ id: "p2", projectCode: "PRJ-BBB", projectName: "Beta", status: "ARCHIVED", projectBudget: 2000000 });
  const s2 = createMockSummary({ budget: 2000000, totalActualCost: 2500000 }); // 125% -> Over budget

  const p3 = createMockProject({ id: "p3", projectCode: "PRJ-CCC", projectName: "Gamma", status: "ACTIVE", projectBudget: 500000 });
  const s3 = createMockSummary({ budget: 500000, totalActualCost: 100000 }); // 20% -> On budget

  const v1 = buildProjectManagementView(p1, s1);
  const v2 = buildProjectManagementView(p2, s2);
  const v3 = buildProjectManagementView(p3, s3);
  const views = [v1, v2, v3];

  // Search filter
  const searchResults = filterAndSortProjectViews(views, { searchQuery: "alpha" });
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].project.projectCode, "PRJ-AAA");

  // Status filter
  const activeResults = filterAndSortProjectViews(views, { statusFilter: "ACTIVE" });
  assert.equal(activeResults.length, 2);

  // Health filter
  const nearBudgetResults = filterAndSortProjectViews(views, { healthFilter: "NEAR_BUDGET" });
  assert.equal(nearBudgetResults.length, 1);
  assert.equal(nearBudgetResults[0].project.projectCode, "PRJ-AAA");

  const overBudgetResults = filterAndSortProjectViews(views, { healthFilter: "OVER_BUDGET" });
  assert.equal(overBudgetResults.length, 1);
  assert.equal(overBudgetResults[0].project.projectCode, "PRJ-BBB");

  // Sort by actualCost descending
  const sortedByCostDesc = filterAndSortProjectViews(views, { sortField: "actualCost", sortDirection: "desc" });
  assert.equal(sortedByCostDesc[0].project.projectCode, "PRJ-BBB"); // 2.5M
  assert.equal(sortedByCostDesc[1].project.projectCode, "PRJ-AAA"); // 950k
  assert.equal(sortedByCostDesc[2].project.projectCode, "PRJ-CCC"); // 100k
});

test("14. archived project view preserves historical figures without looking active", () => {
  const project = createMockProject({
    status: "ARCHIVED",
    archivedAt: "2026-02-01T00:00:00Z",
    archivedFromStatus: "ACTIVE",
  });
  const summary = createMockSummary({ totalActualCost: 1200000 });
  const view = buildProjectManagementView(project, summary);

  assert.equal(view.project.status, "ARCHIVED");
  assert.equal(view.actualCost, 1200000);
});

test("15. aggregate payroll contributes to actual cost without leaking details or cost-code assignments", () => {
  const project = createMockProject({ id: "proj-p", currency: "PHP", projectBudget: 500000 });
  const costCodes: ProjectCostCode[] = [
    {
      id: "cc-1",
      projectId: "proj-p",
      code: "CIV-01",
      name: "Civil Works",
      approvedBudgetAmount: 300000,
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ];

  const summary = calculateProjectCost(project, {
    projectLaborAggregates: [
      {
        projectId: "proj-p",
        currency: "PHP",
        confirmedLaborCost: 150000,
        pendingLaborCost: 25000,
        status: "AVAILABLE",
      },
    ],
    laborSource: "aggregate",
  });

  const view = buildProjectManagementView(project, summary, {
    costCodes,
    projectLaborAggregates: [
      {
        projectId: "proj-p",
        currency: "PHP",
        confirmedLaborCost: 150000,
        pendingLaborCost: 25000,
        status: "AVAILABLE",
      },
    ],
    laborSource: "aggregate",
  });

  // Confirmed labor is included in totalActualCost
  assert.equal(view.actualCost, 150000);
  assert.equal(view.pendingCostExposure, 25000);
  // Aggregate labor has no cost-code provenance -> remains in uncodedActualCost
  assert.equal(view.codedActualCost, 0);
  assert.equal(view.uncodedActualCost, 150000);
});

test("16. project management view reconciles with P1A and P1B", () => {
  const project = createMockProject({ id: "proj-r", projectBudget: 2000000, currency: "PHP" });
  const costCodes: ProjectCostCode[] = [
    {
      id: "cc-1",
      projectId: "proj-r",
      code: "MEC-01",
      name: "Mechanical",
      approvedBudgetAmount: 1200000,
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ];

  const invoices = [
    {
      id: "inv-r1",
      grandTotal: 500000,
      currency: "PHP",
      reviewStatus: "VERIFIED" as const,
      allocations: [
        {
          id: "alloc-r1",
          invoiceId: "inv-r1",
          projectId: "proj-r",
          projectCostCodeId: "cc-1",
          allocationType: "AMOUNT" as const,
          allocationAmount: 500000,
        },
      ],
    },
  ];

  const summary = calculateProjectCost(project, { invoices });
  const view = buildProjectManagementView(project, summary, { costCodes, invoices });

  // P1A reconciliation
  assert.equal(view.actualCost, summary.totalActualCost);
  assert.equal(view.remainingBudget, summary.remainingBudget);

  // P1B reconciliation: coded + uncoded === totalActualCost
  assert.equal(view.codedActualCost + view.uncodedActualCost, view.actualCost);
  assert.equal(view.allocatedCostCodeBudget + view.unallocatedBudget, view.approvedCostBudget);
});
