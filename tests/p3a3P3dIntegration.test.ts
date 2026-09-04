import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  Project,
  ProjectCostCode,
  ProjectCostSummary,
  SubcontractProgressClaim,
  SubcontractVariation,
} from "../src/types.ts";
import { createDemoWorkspace } from "../src/demo/data/createDemoWorkspace.ts";
import { buildDemoProjectSummaries } from "../src/demo/demoSelectors.ts";
import {
  buildProjectEngineeringCoordinationSummary,
} from "../src/utils/projectEngineeringCoordination.ts";
import {
  buildPortfolioManagementSummary,
  buildProjectEngineeringAttentionSignals,
  buildProjectManagementView,
  filterAndSortProjectViews,
  type ProjectAttentionSignal,
} from "../src/utils/projectManagementViewModel.ts";
import { calculateProjectCost } from "../src/utils/projectCosting.ts";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("../src/app/routes/AppRouter.tsx", import.meta.url), "utf8");
const projectsRouteSource = readFileSync(new URL("../src/app/routes/ProjectsRoute.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/components/projects/ProjectWorkspace.tsx", import.meta.url), "utf8");
const overviewSource = readFileSync(new URL("../src/components/projects/ProjectOverview.tsx", import.meta.url), "utf8");
const workspaceSyncSource = readFileSync(new URL("../src/lib/workspaceSync.ts", import.meta.url), "utf8");

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "p3a3-project",
    projectCode: "P3A3-001",
    projectName: "P3A-3 test project",
    status: "ACTIVE",
    projectBudget: 1_000,
    currency: "PHP",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

function summary(overrides: Partial<ProjectCostSummary> = {}): ProjectCostSummary {
  return {
    budget: 1_000,
    invoiceCost: 0,
    paidInvoiceCost: 0,
    unpaidInvoiceCost: 0,
    unallocatedPayrollCost: 0,
    pendingInvoiceCost: 0,
    payrollCost: 0,
    pendingPayrollCost: 0,
    otherExpenseCost: 0,
    pendingExpenseCost: 0,
    totalActualCost: 0,
    committedCost: 0,
    remainingBudget: 1_000,
    budgetUsedPercent: 0,
    foreignCosts: {},
    unallocatedInvoiceCost: 0,
    unallocatedExpenseCost: 0,
    ...overrides,
  };
}

function flags(view: ReturnType<typeof buildProjectManagementView>): Set<string> {
  return new Set(view.attentionFlags.map((signal) => signal.flag));
}

function code(code: string, amount = 600): ProjectCostCode {
  return {
    id: `cc-${code}`,
    projectId: "p3a3-project",
    code,
    name: code,
    approvedBudgetAmount: amount,
    status: "ACTIVE",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

test("P3A-3 financial signals are deterministic, structured, and explainable", () => {
  const overBudget = buildProjectManagementView(project(), summary({ totalActualCost: 1_200, invoiceCost: 1_200, remainingBudget: -200 }));
  const overBudgetSignal = overBudget.attentionFlags.find((signal) => signal.flag === "OVER_BUDGET")!;
  assert.equal(overBudgetSignal.severity, "critical");
  assert.equal(overBudgetSignal.category, "financial");
  assert.equal(overBudgetSignal.projectId, "p3a3-project");
  assert.equal(overBudget.attentionSignals, overBudget.attentionFlags);
  assert.match(overBudgetSignal.evidence, /Actual Cost/);
  assert.equal(typeof overBudgetSignal.source, "string");
  assert.equal(typeof overBudgetSignal.title, "string");

  const near = buildProjectManagementView(project(), summary({ totalActualCost: 900, invoiceCost: 900, remainingBudget: 100 }));
  assert.equal(flags(near).has("NEAR_BUDGET"), true);

  const capacity = buildProjectManagementView(project(), summary({ totalActualCost: 300, invoiceCost: 300, pendingInvoiceCost: 300, committedCost: 500, remainingBudget: 700 }));
  const capacitySignal = capacity.attentionFlags.find((signal) => signal.flag === "CONTROL_CAPACITY_EXCEEDED")!;
  assert.equal(capacity.availableAfterCommitments, -100);
  assert.equal(capacitySignal.severity, "critical");
  assert.match(capacitySignal.evidence, /300\.00 actual \+ 500\.00 committed \+ 300\.00 pending/);

  const uncoded = buildProjectManagementView(project(), summary({ totalActualCost: 500, invoiceCost: 500, remainingBudget: 500 }), {
    costCodes: [code("CIV-01")],
    invoices: [{ id: "invoice-uncoded", grandTotal: 500, currency: "PHP", reviewStatus: "VERIFIED", allocations: [{ id: "uncoded-allocation", invoiceId: "invoice-uncoded", projectId: "p3a3-project", allocationType: "AMOUNT", allocationAmount: 500 }] }],
  });
  assert.equal(flags(uncoded).has("UNCODED_COST"), true);

  const pending = buildProjectManagementView(project(), summary({ pendingInvoiceCost: 75 }));
  assert.equal(flags(pending).has("PENDING_EXPOSURE"), true);

  const mixed = buildProjectManagementView(project(), summary({ foreignCosts: { USD: 50 } }));
  assert.equal(flags(mixed).has("MIXED_CURRENCY"), true);
  assert.equal(mixed.availableAfterCommitments, null);

  const incomplete = buildProjectManagementView(project(), summary({ totalActualCost: 1_200, pendingInvoiceCost: 75 }), { financialDataComplete: false });
  assert.equal(flags(incomplete).has("PARTIAL_DATA"), true);
  assert.equal(flags(incomplete).has("OVER_BUDGET"), false);
  assert.equal(flags(incomplete).has("CONTROL_CAPACITY_EXCEEDED"), false);
  assert.equal(flags(incomplete).has("PENDING_EXPOSURE"), false);
  assert.doesNotMatch(JSON.stringify(incomplete.attentionFlags), /AI-generated risk|riskScore|weightedRisk|risk\s+score/i);
});

test("P3A-3 commercial and lifecycle signals preserve truthful boundaries", () => {
  const billed = {
    id: "billing-1",
    projectId: "p3a3-project",
    billingNumber: "BILL-1",
    billingDate: "2026-08-01",
    currency: "PHP",
    status: "ISSUED" as const,
    lines: [{ id: "billing-line-1", billingId: "billing-1", lineNumber: 1, description: "Progress", amount: 800 }],
    createdAt: "2026-08-01",
    updatedAt: "2026-08-01",
  };
  const collection = {
    id: "collection-1",
    projectId: "p3a3-project",
    collectionNumber: "COL-1",
    collectionDate: "2026-08-15",
    currency: "PHP",
    status: "RECORDED" as const,
    allocations: [{ id: "allocation-1", collectionId: "collection-1", billingId: "billing-1", amount: 300 }],
    createdAt: "2026-08-15",
    updatedAt: "2026-08-15",
  };
  const receivable = buildProjectManagementView(project({ contractValue: 2_000 }), summary(), {
    clientBillings: [billed],
    clientCollections: [collection],
  });
  const receivableSignal = receivable.attentionFlags.find((signal) => signal.flag === "OUTSTANDING_RECEIVABLE")!;
  assert.equal(receivableSignal.category, "commercial");
  assert.match(receivableSignal.detail, /not an overdue or bad-debt conclusion/);
  assert.equal(receivableSignal.tab, "billing");

  const late = buildProjectManagementView(project({ targetEndDate: "2026-08-30" }), summary(), { today: "2026-09-04" });
  assert.equal(flags(late).has("PROJECT_END_PASSED"), true);

  const completed = buildProjectManagementView(project({ status: "COMPLETED", targetEndDate: "2026-08-30" }), summary({ totalActualCost: 1_200, invoiceCost: 1_200 }), { today: "2026-09-04" });
  assert.equal(completed.attentionFlags.length, 0);
  const archived = buildProjectManagementView(project({ status: "ARCHIVED", targetEndDate: "2026-08-30" }), summary(), { today: "2026-09-04" });
  assert.equal(archived.attentionFlags.length, 0);
});

test("engineering signals require explicit status and due-date evidence", () => {
  const signals = buildProjectEngineeringAttentionSignals(
    { id: "p3a3-project" },
    {
      rfis: [
        { id: "rfi-overdue", projectId: "p3a3-project", rfiNumber: "RFI-017", status: "OPEN", dueDate: "2026-08-30" },
        { id: "rfi-future", projectId: "p3a3-project", rfiNumber: "RFI-018", status: "OPEN", dueDate: "2026-09-10" },
        { id: "rfi-closed", projectId: "p3a3-project", rfiNumber: "RFI-019", status: "CLOSED", dueDate: "2026-08-01" },
      ],
      submittals: [
        { id: "submittal-overdue", projectId: "p3a3-project", submittalNumber: "SUB-017", status: "UNDER_REVIEW", dueReviewDate: "2026-08-30" },
        { id: "submittal-open", projectId: "p3a3-project", submittalNumber: "SUB-018", status: "SUBMITTED" },
      ],
    },
    "2026-09-04",
  );
  assert.equal(signals.some((signal) => signal.flag === "OVERDUE_RFI" && signal.detail.includes("RFI-017")), true);
  assert.equal(signals.some((signal) => signal.detail.includes("RFI-018") && signal.flag === "OVERDUE_RFI"), false);
  assert.equal(signals.some((signal) => signal.detail.includes("RFI-019")), false);
  assert.equal(signals.some((signal) => signal.flag === "OVERDUE_SUBMITTAL"), true);
  assert.equal(signals.some((signal) => signal.flag === "SUBMITTALS_AWAITING_REVIEW"), true);
  assert.ok(signals.every((signal) => signal.source && signal.evidence && signal.category === "engineering"));
});

test("portfolio attention filtering and sorting are severity-first and currency-safe", () => {
  const critical = buildProjectManagementView(project({ id: "critical", projectCode: "P-CRITICAL" }), summary({ totalActualCost: 1_200, invoiceCost: 1_200 }));
  const warning = buildProjectManagementView(project({ id: "warning", projectCode: "P-WARNING", projectBudget: 1_000 }), summary({ totalActualCost: 900, invoiceCost: 900, budget: 1_000, remainingBudget: 100 }));
  const normal = buildProjectManagementView(project({ id: "normal", projectCode: "P-NORMAL" }), summary({ totalActualCost: 100, invoiceCost: 100, remainingBudget: 900 }));
  const portfolio = buildPortfolioManagementSummary([critical, warning, normal]);
  assert.equal(portfolio.projectsNeedingAttentionCount, 2);
  assert.equal(portfolio.criticalAttentionCount, 2);
  assert.equal(portfolio.warningAttentionCount, 1);
  assert.equal(portfolio.infoAttentionCount, 0);
  assert.deepEqual(filterAndSortProjectViews([warning, normal, critical], { healthFilter: "NEEDS_ATTENTION" }).map((view) => view.project.id), ["critical", "warning"]);
  assert.deepEqual(filterAndSortProjectViews([normal, warning, critical], { healthFilter: "CRITICAL" }).map((view) => view.project.id), ["critical"]);
});

test("engineering coordination summary preserves source states and does not fabricate restricted counts", () => {
  const available = buildProjectEngineeringCoordinationSummary({
    projectId: "p3a3-project",
    today: "2026-09-04",
    documents: { state: "available", documents: [{ id: "doc-1", projectId: "p3a3-project" } as never], revisions: [{ id: "rev-1", documentId: "doc-1", createdAt: "2026-09-03" } as never] },
    rfis: { state: "available", records: [{ id: "rfi-1", projectId: "p3a3-project", rfiNumber: "RFI-1", status: "OPEN", dueDate: "2026-09-10" } as never] },
    submittals: { state: "available", records: [] },
    siteLogs: { state: "available", records: [{ id: "log-1", projectId: "p3a3-project", siteDate: "2026-09-04", status: "FINALIZED" } as never] },
  });
  assert.equal(available.documents.count, 1);
  assert.equal(available.documents.latestActivityDate, "2026-09-03");
  assert.equal(available.rfis.count, 1);
  assert.equal(available.rfis.openCount, 1);
  assert.equal(available.siteLogs.latestSiteDate, "2026-09-04");

  const restricted = buildProjectEngineeringCoordinationSummary({
    projectId: "p3a3-project",
    today: "2026-09-04",
    documents: { state: "not-permitted" },
    rfis: { state: "not-permitted" },
    submittals: { state: "loading" },
    siteLogs: { state: "unavailable", reason: "Site Log request failed" },
  });
  assert.equal(restricted.documents.count, undefined);
  assert.equal(restricted.rfis.count, undefined);
  assert.equal(restricted.submittals.count, undefined);
  assert.deepEqual(restricted.attentionSignals, []);
});

test("P2 claim and variation records remain in the authoritative commitment path", () => {
  const claim: SubcontractProgressClaim = {
    id: "claim-1",
    subcontractId: "subcontract-1",
    projectId: "p3a3-project",
    claimNumber: "CLM-1",
    valuationDate: "2026-09-01",
    status: "APPROVED",
    retentionRate: 0.1,
    claimedGrossAmount: 200,
    approvedGrossAmount: 200,
    retentionAmount: 20,
    netCertifiedAmount: 180,
    currency: "PHP",
    lines: [],
  };
  const variation: SubcontractVariation = {
    id: "variation-1",
    subcontractId: "subcontract-1",
    projectId: "p3a3-project",
    variationNumber: "VAR-1",
    title: "Approved addition",
    status: "APPROVED",
    netAmount: 100,
    currency: "PHP",
    lines: [],
  };
  const subcontract = {
    id: "subcontract-1",
    subcontractNumber: "SC-1",
    vendorId: "vendor-1",
    projectId: "p3a3-project",
    title: "Scope",
    currency: "PHP",
    status: "ACTIVE" as const,
    originalAmount: 1_000,
    lines: [],
  };
  const calculated = calculateProjectCost(project(), { subcontracts: [subcontract], subcontractClaims: [claim], subcontractVariations: [variation] });
  assert.equal(calculated.committedCost, 900);
  assert.equal(calculated.totalActualCost, 0);
  assert.equal(JSON.stringify(variation).includes("contractValue"), false);
});

test("P2 production changes refresh the existing workspace synchronization group", () => {
  for (const table of [
    "vendors",
    "purchase_orders",
    "purchase_order_lines",
    "purchase_order_receipts",
    "purchase_order_receipt_lines",
    "rfqs",
    "rfq_lines",
    "supplier_quotations",
    "supplier_quotation_lines",
    "subcontracts",
    "subcontract_lines",
    "subcontract_progress_claims",
    "subcontract_progress_claim_lines",
    "subcontract_variations",
    "subcontract_variation_lines",
    "client_collections",
    "client_collection_allocations",
    "client_collection_events",
  ]) {
    assert.equal(workspaceSyncSource.includes(`"${table}"`), true);
    assert.equal(workspaceSyncSource.includes(`${table}: ["engineering"]`), true);
  }
});

test("demo fixtures cover deterministic attention examples and preserve production composition parity", () => {
  const data = createDemoWorkspace("2026-09-04");
  const summaries = buildDemoProjectSummaries(data);
  const views = data.projects.map((item) => buildProjectManagementView(item, summaries[item.id]!, {
    costCodes: data.costCodes,
    purchaseOrders: data.purchaseOrders,
    subcontracts: data.subcontracts,
    subcontractClaims: data.subcontractClaims,
    subcontractVariations: data.subcontractVariations,
    clientBillings: data.clientBillings,
    clientCollections: data.clientCollections,
    engineering: { rfis: data.coordination.rfis, submittals: data.coordination.submittals },
    today: data.anchorDate,
  }));
  const drainage = views.find((view) => view.project.id === "demo-project-drainage")!;
  const solar = views.find((view) => view.project.id === "demo-project-solar")!;
  const warehouse = views.find((view) => view.project.id === "demo-project-warehouse")!;
  const completed = views.find((view) => view.project.id === "demo-project-cebu")!;
  const planning = views.find((view) => view.project.id === "demo-project-international")!;
  assert.equal(flags(drainage).has("OVER_BUDGET"), true);
  assert.equal(flags(drainage).has("CONTROL_CAPACITY_EXCEEDED"), true);
  assert.equal(flags(solar).has("MIXED_CURRENCY"), true);
  assert.equal(flags(warehouse).has("OUTSTANDING_RECEIVABLE"), true);
  assert.equal(flags(warehouse).has("OVERDUE_RFI"), true);
  assert.equal(completed.attentionFlags.length, 0);
  assert.equal(planning.attentionFlags.length, 0);
  assert.ok(views.some((view) => view.attentionFlags.length === 0));

  assert.match(appSource, /subcontractClaims=\{subcontractClaims\}/);
  assert.match(appSource, /subcontractVariations=\{subcontractVariations\}/);
  assert.match(appSource, /onSaveSubcontractClaim=\{handleSaveSubcontractClaim\}/);
  assert.match(appSource, /onSaveSubcontractVariation=\{handleSaveSubcontractVariation\}/);
  assert.match(routerSource, /subcontractClaims=\{subcontractClaims\}/);
  assert.match(routerSource, /onSaveSubcontractClaim=\{onSaveSubcontractClaim\}/);
  assert.match(routerSource, /subcontractVariations=\{subcontractVariations\}/);
  assert.match(projectsRouteSource, /onSaveSubcontractClaim/);
  assert.match(workspaceSource, /subcontractClaims=\{subcontractClaims\s*\?/);
  assert.match(workspaceSource, /onSaveSubcontractVariation/);
  assert.match(overviewSource, /Management Attention/);
  assert.match(overviewSource, /Engineering Coordination/);
  assert.doesNotMatch(overviewSource, /riskScore|weightedRisk|AI-generated risk/i);
});

test("signal severity type remains bounded to deterministic levels", () => {
  const signal: ProjectAttentionSignal = buildProjectEngineeringAttentionSignals(
    { id: "p3a3-project" },
    { rfis: [{ id: "rfi", projectId: "p3a3-project", rfiNumber: "RFI-1", status: "OPEN", dueDate: "2026-08-01" }] },
    "2026-09-04",
  )[0]!;
  assert.ok(["critical", "warning", "info"].includes(signal.severity));
  assert.equal(signal.tab, "rfis");
});
