import test from "node:test";
import assert from "node:assert/strict";
import type { Project, ProjectCostCode, ProjectCostSummary } from "../src/types.ts";
import type { ClientBilling } from "../src/lib/clientBilling.ts";
import type { ClientCollection } from "../src/lib/clientCollections.ts";
import {
  buildPortfolioManagementSummary,
  buildProjectManagementView,
  filterAndSortProjectViews,
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

function createBilling(projectId: string, id: string, amount: number, status: ClientBilling["status"] = "ISSUED", currency = "PHP"): ClientBilling {
  return {
    id,
    projectId,
    billingNumber: id,
    billingDate: "2026-09-01",
    currency,
    status,
    lines: [{ id: `${id}-line`, billingId: id, lineNumber: 1, description: "Progress", amount }],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };
}

function createCollection(projectId: string, id: string, billingId: string, amount: number, status: ClientCollection["status"] = "RECORDED", currency = "PHP"): ClientCollection {
  return {
    id,
    projectId,
    collectionNumber: id,
    collectionDate: "2026-09-02",
    currency,
    status,
    allocations: [{ id: `${id}-allocation`, collectionId: id, billingId, amount }],
    createdAt: "2026-09-02T00:00:00Z",
    updatedAt: "2026-09-02T00:00:00Z",
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
  assert.equal(view.pendingCostExposure, 350000);
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

test("4. foreign currency costs mark project management view as partial", () => {
  const project = createMockProject({ currency: "PHP", projectBudget: 1000000 });
  const summary = createMockSummary({
    budget: 1000000,
    totalActualCost: 500000,
    foreignCosts: { USD: 1000 },
  });
  const view = buildProjectManagementView(project, summary);

  assert.equal(view.hasForeignAmounts, true);
  assert.equal(view.isPartial, true);
  assert.equal(view.health, "PARTIAL");
  assert.equal(view.remainingBudget, null);
  assert.equal(view.variance, null);
  assert.ok(view.attentionFlags.some((f) => f.flag === "MIXED_CURRENCY"));
});

test("5. financial source completeness false propagates to partial state and suppresses false health claims", () => {
  const project = createMockProject({ currency: "PHP", projectBudget: 1000000 });
  const summary = createMockSummary({
    budget: 1000000,
    totalActualCost: 1200000, // Even if known costs > budget, source data is incomplete
  });
  const view = buildProjectManagementView(project, summary, { financialDataComplete: false });

  assert.equal(view.isPartial, true);
  assert.equal(view.health, "PARTIAL");
  assert.equal(view.remainingBudget, null);
  assert.equal(view.variance, null);
  assert.ok(view.attentionFlags.some((f) => f.flag === "PARTIAL_DATA"));
  // OVER_BUDGET / NEAR_BUDGET must not fire when source completeness is false
  assert.equal(view.attentionFlags.some((f) => f.flag === "OVER_BUDGET"), false);
  assert.equal(view.attentionFlags.some((f) => f.flag === "NEAR_BUDGET"), false);
});

test("6. over budget health and attention flag trigger on complete authoritative data", () => {
  const project = createMockProject({ projectBudget: 2000000 });
  const summary = createMockSummary({ budget: 2000000, totalActualCost: 2500000 });
  const view = buildProjectManagementView(project, summary);

  assert.equal(view.health, "OVER BUDGET");
  assert.equal(view.remainingBudget, -500000);
  assert.ok(view.attentionFlags.some((f) => f.flag === "OVER_BUDGET"));
});

test("7. near budget limit (>=90%) health and attention flag trigger correctly", () => {
  const project = createMockProject({ projectBudget: 1000000 });
  const summary = createMockSummary({ budget: 1000000, totalActualCost: 920000 });
  const view = buildProjectManagementView(project, summary);

  assert.equal(view.health, "NEAR LIMIT");
  assert.equal(view.confirmedUtilization, 92);
  assert.ok(view.attentionFlags.some((f) => f.flag === "NEAR_BUDGET"));
});

test("8. cost codes without authoritative source inputs do NOT produce fake zero coded/uncoded actuals", () => {
  const project = createMockProject({ id: "proj-10", projectBudget: 1000000, currency: "PHP" });
  const costCodes: ProjectCostCode[] = [
    {
      id: "cc-1",
      projectId: "proj-10",
      code: "CIV-01",
      name: "Civil Works",
      approvedBudgetAmount: 600000,
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ];
  const summary = createMockSummary({ budget: 1000000, totalActualCost: 500000 });

  // Called without source transaction arrays (invoices, payroll, expenses)
  const view = buildProjectManagementView(project, summary, { costCodes });

  assert.equal(view.activeCostCodesCount, 1);
  assert.equal(view.allocatedCostCodeBudget, 600000);
  assert.equal(view.unallocatedBudget, 400000);
  assert.equal(view.costClassificationAvailable, false);
  assert.equal(view.codedActualCost, null);
  assert.equal(view.uncodedActualCost, null);
  // UNCODED_COST flag must NOT fire when cost classification is unavailable
  assert.equal(view.attentionFlags.some((f) => f.flag === "UNCODED_COST"), false);
});

test("9. cost codes with authoritative source inputs correctly evaluate coded and uncoded actuals", () => {
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
          allocationAmount: 100000,
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

  assert.equal(view.allocatedCostCodeBudget, 900000);
  assert.equal(view.unallocatedBudget, 100000);
  assert.equal(view.costClassificationAvailable, true);
  assert.equal(view.codedActualCost, 400000);
  assert.equal(view.uncodedActualCost, 100000);
  assert.equal(view.hasExplicitForecast, true);
  assert.equal(view.forecastFinalCost, 930000);
  assert.equal(view.forecastVariance, 70000);
  assert.ok(view.attentionFlags.some((f) => f.flag === "UNCODED_COST"));
});

test("10. partial forecast returns null forecastFinalCost, null variance, and does NOT trigger forecast over-budget", () => {
  const project = createMockProject({ id: "proj-11", projectBudget: 500000, currency: "PHP" });
  const costCodes: ProjectCostCode[] = [
    {
      id: "cc-1",
      projectId: "proj-11",
      code: "CIV-01",
      name: "Civil Works",
      approvedBudgetAmount: 250000,
      forecastAmount: 300000, // Set
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "cc-2",
      projectId: "proj-11",
      code: "ELE-01",
      name: "Electrical Works",
      approvedBudgetAmount: 250000,
      forecastAmount: undefined, // Missing!
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ];

  const summary = createMockSummary({ budget: 500000, totalActualCost: 100000 });
  const view = buildProjectManagementView(project, summary, { costCodes });

  assert.equal(view.hasExplicitForecast, false);
  assert.equal(view.forecastFinalCost, null);
  assert.equal(view.forecastVariance, null);
  assert.ok(view.attentionFlags.some((f) => f.flag === "FORECAST_NOT_SET"));
  assert.equal(view.attentionFlags.some((f) => f.flag === "FORECAST_OVER_BUDGET"), false);
});

test("11. archived cost codes do not block forecast completeness if all active codes are forecasted", () => {
  const project = createMockProject({ id: "proj-12", projectBudget: 600000, currency: "PHP" });
  const costCodes: ProjectCostCode[] = [
    {
      id: "cc-1",
      projectId: "proj-12",
      code: "CIV-01",
      name: "Civil Works",
      approvedBudgetAmount: 500000,
      forecastAmount: 550000,
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "cc-archived",
      projectId: "proj-12",
      code: "OLD-01",
      name: "Old Works",
      approvedBudgetAmount: 100000,
      forecastAmount: undefined, // Missing, but archived!
      status: "ARCHIVED",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ];

  const summary = createMockSummary({ budget: 600000, totalActualCost: 100000 });
  const view = buildProjectManagementView(project, summary, { costCodes });

  assert.equal(view.activeCostCodesCount, 1);
  assert.equal(view.hasExplicitForecast, true);
  assert.equal(view.forecastFinalCost, 550000);
  assert.equal(view.forecastVariance, 50000);
});

test("12. cross-currency financial sort does not directly rank different currencies against each other", () => {
  // PHP project: 1,000,000 PHP
  const pPhp = createMockProject({ id: "p-php", projectCode: "PRJ-PHP", currency: "PHP", contractValue: 1000000, projectBudget: 800000 });
  const sPhp = createMockSummary({ budget: 800000, totalActualCost: 500000 });

  // USD project: 50,000 USD
  const pUsd = createMockProject({ id: "p-usd", projectCode: "PRJ-USD", currency: "USD", contractValue: 50000, projectBudget: 40000 });
  const sUsd = createMockSummary({ budget: 40000, totalActualCost: 25000 });

  const vPhp = buildProjectManagementView(pPhp, sPhp);
  const vUsd = buildProjectManagementView(pUsd, sUsd);

  // Sorting by contractValue ascending
  const sortedAsc = filterAndSortProjectViews([vUsd, vPhp], { sortField: "contractValue", sortDirection: "asc" });
  assert.equal(sortedAsc[0].currency, "PHP");
  assert.equal(sortedAsc[1].currency, "USD");

  // Sorting by contractValue descending
  const sortedDesc = filterAndSortProjectViews([vUsd, vPhp], { sortField: "contractValue", sortDirection: "desc" });
  assert.equal(sortedDesc[0].currency, "PHP");
  assert.equal(sortedDesc[1].currency, "USD");
});

test("13. same-currency financial sort works accurately and handles nulls", () => {
  const p1 = createMockProject({ id: "p1", projectCode: "PRJ-1", currency: "PHP", contractValue: 2000000, projectBudget: 1500000 });
  const s1 = createMockSummary({ budget: 1500000, totalActualCost: 1000000 });

  const p2 = createMockProject({ id: "p2", projectCode: "PRJ-2", currency: "PHP", contractValue: undefined, projectBudget: 800000 });
  const s2 = createMockSummary({ budget: 800000, totalActualCost: 500000 });

  const p3 = createMockProject({ id: "p3", projectCode: "PRJ-3", currency: "PHP", contractValue: 5000000, projectBudget: 4000000 });
  const s3 = createMockSummary({ budget: 4000000, totalActualCost: 2000000 });

  const v1 = buildProjectManagementView(p1, s1);
  const v2 = buildProjectManagementView(p2, s2);
  const v3 = buildProjectManagementView(p3, s3);

  // Sort desc: p3 (5M), p1 (2M), p2 (undefined at end)
  const sortedDesc = filterAndSortProjectViews([v1, v2, v3], { sortField: "contractValue", sortDirection: "desc" });
  assert.equal(sortedDesc[0].project.projectCode, "PRJ-3");
  assert.equal(sortedDesc[1].project.projectCode, "PRJ-1");
  assert.equal(sortedDesc[2].project.projectCode, "PRJ-2");
});

test("14. utilization sorting handles partial/unavailable states safely", () => {
  const p1 = createMockProject({ id: "p1", projectCode: "PRJ-1", projectBudget: 1000000 });
  const s1 = createMockSummary({ budget: 1000000, totalActualCost: 900000 }); // 90%

  const p2 = createMockProject({ id: "p2", projectCode: "PRJ-2", projectBudget: 1000000 });
  const s2 = createMockSummary({ budget: 1000000, totalActualCost: 500000, foreignCosts: { USD: 100 } }); // Partial

  const p3 = createMockProject({ id: "p3", projectCode: "PRJ-3", projectBudget: 1000000 });
  const s3 = createMockSummary({ budget: 1000000, totalActualCost: 200000 }); // 20%

  const v1 = buildProjectManagementView(p1, s1);
  const v2 = buildProjectManagementView(p2, s2);
  const v3 = buildProjectManagementView(p3, s3);

  const sortedDesc = filterAndSortProjectViews([v1, v2, v3], { sortField: "utilization", sortDirection: "desc" });
  assert.equal(sortedDesc[0].project.projectCode, "PRJ-1"); // 90%
  assert.equal(sortedDesc[1].project.projectCode, "PRJ-3"); // 20%
  assert.equal(sortedDesc[2].project.projectCode, "PRJ-2"); // Partial (at end)
});

test("15. portfolio currency group marks partial projects and missing contract values incomplete", () => {
  const p1 = createMockProject({ id: "p1", currency: "PHP", contractValue: 1000000, projectBudget: 800000 });
  const s1 = createMockSummary({ budget: 800000, totalActualCost: 500000, foreignCosts: { USD: 50 } }); // Partial

  const p2 = createMockProject({ id: "p2", currency: "PHP", contractValue: undefined, projectBudget: 500000 });
  const s2 = createMockSummary({ budget: 500000, totalActualCost: 200000 }); // Missing contract value

  const v1 = buildProjectManagementView(p1, s1);
  const v2 = buildProjectManagementView(p2, s2);

  const portfolio = buildPortfolioManagementSummary([v1, v2]);

  assert.equal(portfolio.currencyGroups.PHP?.isComplete, false);
  assert.equal(portfolio.currencyGroups.PHP?.contractValueComplete, false);
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
  assert.equal(view.costClassificationAvailable, true);
  assert.equal(view.codedActualCost! + view.uncodedActualCost!, view.actualCost);
  assert.equal(view.allocatedCostCodeBudget + view.unallocatedBudget, view.approvedCostBudget);
});

test("17. portfolio view composes issued billing and recorded collections without settlement linkage", () => {
  const project = createMockProject({ id: "commercial-project", contractValue: 5000, projectBudget: 4000 });
  const summary = createMockSummary({ budget: 4000, totalActualCost: 1000 });
  const billings = [
    createBilling(project.id, "issued", 600),
    createBilling(project.id, "draft", 900, "DRAFT"),
  ];
  const collections = [
    createCollection(project.id, "recorded", "issued", 250),
    createCollection(project.id, "draft-collection", "issued", 300, "DRAFT"),
  ];

  const view = buildProjectManagementView(project, summary, { clientBillings: billings, clientCollections: collections });

  assert.deepEqual(view.financialTruth.billed.amount, 600);
  assert.deepEqual(view.financialTruth.remainingToBill.amount, 4400);
  assert.deepEqual(view.financialTruth.collected.amount, 250);
  assert.deepEqual(view.financialTruth.outstandingReceivables.amount, 350);
  assert.equal(view.financialTruth.collected.status, "available");
});

test("18. incomplete cost source marks portfolio cost metrics unavailable instead of fabricating zero", () => {
  const project = createMockProject({ id: "incomplete-project" });
  const view = buildProjectManagementView(project, createMockSummary(), {
    financialDataComplete: false,
    clientBillings: [],
    clientCollections: [],
  });
  const portfolio = buildPortfolioManagementSummary([view]);

  assert.equal(view.financialTruth.actualCost.status, "unavailable");
  assert.equal(view.financialTruth.committedCost.status, "unavailable");
  assert.equal(portfolio.currencyGroups.PHP?.financialMetrics.actualCost.status, "unavailable");
  assert.equal(portfolio.currencyGroups.PHP?.financialMetrics.actualCost.amount, undefined);
});

test("19. portfolio financial sorting and manager/currency filters use authoritative metric states", () => {
  const php = createMockProject({ id: "p-filter-php", projectCode: "PHP-1", projectManager: "Manager A", currency: "PHP" });
  const usd = createMockProject({ id: "p-filter-usd", projectCode: "USD-1", projectManager: "Manager B", currency: "USD" });
  const phpView = buildProjectManagementView(php, createMockSummary(), {
    clientBillings: [createBilling(php.id, "php-billing", 900)],
    clientCollections: [],
  });
  const usdView = buildProjectManagementView(usd, createMockSummary(), {
    clientBillings: [createBilling(usd.id, "usd-billing", 100, "ISSUED", "USD")],
    clientCollections: [],
  });

  assert.deepEqual(
    filterAndSortProjectViews([phpView, usdView], { managerFilter: "Manager A", currencyFilter: "PHP" }).map((view) => view.project.id),
    [php.id],
  );
  assert.deepEqual(
    filterAndSortProjectViews([phpView, usdView], { sortField: "billed", sortDirection: "desc" }).map((view) => view.project.id),
    [php.id, usd.id],
  );
});
