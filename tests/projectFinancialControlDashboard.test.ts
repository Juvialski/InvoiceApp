import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ClientBilling } from "../src/lib/clientBilling.ts";
import type { ClientCollection } from "../src/lib/clientCollections.ts";
import type { Project, ProjectCostSummary, PurchaseOrder, Subcontract } from "../src/types.ts";
import { calculateProjectCost } from "../src/utils/projectCosting.ts";
import { buildProjectManagementView } from "../src/utils/projectManagementViewModel.ts";

const projectOverview = readFileSync(
  new URL("../src/components/projects/ProjectOverview.tsx", import.meta.url),
  "utf8",
);
const projectWorkspace = readFileSync(
  new URL("../src/components/projects/ProjectWorkspace.tsx", import.meta.url),
  "utf8",
);

const project: Project = {
  id: "project-control",
  projectCode: "CTRL-001",
  projectName: "Project Control Test",
  status: "ACTIVE",
  contractValue: 2_000,
  projectBudget: 1_000,
  currency: "PHP",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

function summary(overrides: Partial<ProjectCostSummary> = {}): ProjectCostSummary {
  return {
    budget: 1_000,
    invoiceCost: 100,
    paidInvoiceCost: 100,
    unpaidInvoiceCost: 0,
    unallocatedPayrollCost: 0,
    pendingInvoiceCost: 50,
    payrollCost: 100,
    pendingPayrollCost: 25,
    otherExpenseCost: 100,
    pendingExpenseCost: 25,
    totalActualCost: 300,
    committedCost: 0,
    remainingBudget: 700,
    budgetUsedPercent: 30,
    foreignCosts: {},
    unallocatedInvoiceCost: 0,
    unallocatedExpenseCost: 0,
    ...overrides,
  };
}

function purchaseOrder(totalAmount: number, currency = "PHP"): PurchaseOrder {
  return {
    id: "po-control",
    poNumber: "PO-CTRL-001",
    vendorId: "vendor-control",
    projectId: project.id,
    currency,
    status: "APPROVED",
    totalAmount,
  };
}

function subcontract(originalAmount: number, currency = "PHP"): Subcontract {
  return {
    id: "sc-control",
    subcontractNumber: "SC-CTRL-001",
    vendorId: "vendor-control",
    projectId: project.id,
    title: "Control subcontract",
    currency,
    status: "ACTIVE",
    originalAmount,
  };
}

function billing(id: string, status: ClientBilling["status"], amount: number): ClientBilling {
  return {
    id,
    projectId: project.id,
    billingNumber: id,
    billingDate: "2026-09-01",
    currency: "PHP",
    status,
    lines: [{ id: `${id}-line`, billingId: id, lineNumber: 1, description: "Progress", amount }],
    createdAt: "2026-09-01",
    updatedAt: "2026-09-01",
  };
}

function collection(id: string, status: ClientCollection["status"], billingId: string, amount: number): ClientCollection {
  return {
    id,
    projectId: project.id,
    collectionNumber: id,
    collectionDate: "2026-09-02",
    currency: "PHP",
    status,
    allocations: [{ id: `${id}-allocation`, collectionId: id, billingId, amount }],
    createdAt: "2026-09-02",
    updatedAt: "2026-09-02",
  };
}

test("P3A-2 cost control preserves Remaining Budget and derives commitment-adjusted availability", () => {
  const view = buildProjectManagementView(
    project,
    summary({ committedCost: 600 }),
    { purchaseOrders: [purchaseOrder(250)], subcontracts: [subcontract(350)] },
  );

  assert.equal(view.remainingBudget, 700, "Remaining Budget is approved budget minus Actual Cost");
  assert.equal(view.availableAfterCommitments, 0, "availability subtracts actual, committed, and pending exposure");
  assert.equal(view.commitmentUtilization, 100, "commitment utilization includes pending exposure");
  assert.equal(view.commitmentBreakdown.reconcilesToCommittedCost, true);
  assert.equal(view.commitmentBreakdown.purchaseOrders.amount, 250);
  assert.equal(view.commitmentBreakdown.subcontracts.amount, 350);
});

test("P3A-2 does not expose an unverified commitment breakdown", () => {
  const view = buildProjectManagementView(project, summary({ committedCost: 600 }));

  assert.equal(view.commitmentBreakdown.reconcilesToCommittedCost, false);
  assert.equal(view.commitmentBreakdown.purchaseOrders.status, "unavailable");
  assert.equal(view.commitmentBreakdown.subcontracts.status, "unavailable");
  assert.equal(view.committedCost, 600, "the authoritative aggregate remains available");
});

test("P3A-2 withholds unsafe combined cost position for mixed currencies", () => {
  const view = buildProjectManagementView(
    project,
    summary({ foreignCosts: { USD: 100 }, committedCost: 100 }),
    { purchaseOrders: [purchaseOrder(100)], subcontracts: [] },
  );

  assert.equal(view.isPartial, true);
  assert.equal(view.remainingBudget, null);
  assert.equal(view.availableAfterCommitments, null);
  assert.equal(view.health, "PARTIAL");
});

test("P3A-2 keeps unavailable cost data unavailable", () => {
  const view = buildProjectManagementView(project, summary(), { financialDataComplete: false });

  assert.equal(view.financialTruth.actualCost.status, "unavailable");
  assert.equal(view.financialTruth.committedCost.status, "unavailable");
  assert.equal(view.financialTruth.pendingCostExposure.status, "unavailable");
  assert.equal(view.availableAfterCommitments, null);
});

test("P3A-2 actual-cost composition must reconcile to the authoritative Actual Cost", () => {
  assert.equal(buildProjectManagementView(project, summary()).actualCostCompositionReconciles, true);
  assert.equal(
    buildProjectManagementView(project, summary({ totalActualCost: 350 })).actualCostCompositionReconciles,
    false,
  );
});

test("P3A-2 commercial control uses issued billing and recorded collection stages", () => {
  const issued = billing("issued", "ISSUED", 600);
  const view = buildProjectManagementView(project, summary(), {
    clientBillings: [issued, billing("draft", "DRAFT", 900)],
    clientCollections: [collection("recorded", "RECORDED", issued.id, 250), collection("draft-collection", "DRAFT", issued.id, 300)],
  });

  assert.equal(view.financialTruth.billed.amount, 600);
  assert.equal(view.financialTruth.remainingToBill.amount, 1_400);
  assert.equal(view.financialTruth.collected.amount, 250);
  assert.equal(view.financialTruth.outstandingReceivables.amount, 350);
});

test("P3A-2 Overview keeps the management boundary explicit", () => {
  for (const label of [
    "Project Financial Control Dashboard",
    "Cost Control",
    "Commercial Control",
    "Approved Cost Budget",
    "Actual Cost",
    "Committed Cost",
    "Pending Exposure",
    "Remaining Budget",
    "Available after Commitments / Exposure",
    "Billing progress",
    "Collection progress",
    "Work Packages Over Budget",
    "Open Budget Control Tab →",
    "Open Procurement →",
  ]) assert.match(projectOverview, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), label);
  assert.match(projectOverview, /actualCostCompositionReconciles/);
  assert.match(projectOverview, /data-financial-metric-status/);
  assert.match(projectOverview, /canReadClientBilling && isProjectWorkspaceTabDeploymentVisible\("billing"\)/);
  assert.match(projectOverview, /!combinedCostAnalyticsAvailable/);
  assert.match(projectOverview, /compositionReconciles/);
  assert.doesNotMatch(projectOverview, /Forecast Final Cost/);
  assert.doesNotMatch(projectOverview, /dataKey="remaining"/);
  assert.match(projectWorkspace, /projectLaborAggregates: budgetControlLaborAggregate/);
  assert.doesNotMatch(projectOverview, /payrollAllocations|payrollRuns|payroll entries/);
});

test("P3A-2 source formulas remain derived from the canonical project cost calculator", () => {
  const calculated = calculateProjectCost(project, {
    purchaseOrders: [purchaseOrder(250)],
    subcontracts: [subcontract(350)],
  });
  assert.equal(calculated.committedCost, 600);
  assert.match(projectOverview, /buildProjectManagementView/);
});
