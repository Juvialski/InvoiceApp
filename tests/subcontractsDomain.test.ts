import test from "node:test";
import assert from "node:assert/strict";
import type {
  Project,
  ProjectCostCode,
  PurchaseOrder,
  Subcontract,
  SubcontractLine,
  SubcontractStatus,
  InvoiceData,
  InvoiceProjectAllocation,
  Expense,
} from "../src/types.ts";
import {
  isCommittedSubcontract,
  isVoidedSubcontract,
  subcontractTotal,
  calculateProjectCost,
  calculateProjectBudgetControl,
} from "../src/utils/projectCosting.ts";
import { buildProjectDashboardViewData } from "../src/utils/projectDashboardViewModel.ts";
import { buildDashboardViewData } from "../src/utils/dashboardViewModel.ts";

function sampleSubcontract(overrides: Partial<Subcontract> = {}): Subcontract {
  return {
    id: "sc-1",
    subcontractNumber: "SC-2026-001",
    vendorId: "vendor-trade-1",
    projectId: "proj-1",
    title: "Structural Steel Framing",
    currency: "PHP",
    status: "DRAFT",
    originalAmount: 500_000,
    lines: [
      {
        id: "scl-1",
        subcontractId: "sc-1",
        lineNumber: 1,
        description: "Supply and fabrication of steel columns",
        amount: 300_000,
        quantity: 30,
        unit: "tons",
        unitRate: 10_000,
        projectCostCodeId: "cc-structural",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "scl-2",
        subcontractId: "sc-1",
        lineNumber: 2,
        description: "Erection and bolting on site",
        amount: 200_000,
        quantity: 1,
        unit: "lot",
        unitRate: 200_000,
        projectCostCodeId: "cc-structural",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const mockProject: Project = {
  id: "proj-1",
  projectCode: "BLD-001",
  projectName: "Commercial Tower",
  clientName: "Summit Holdings",
  status: "ACTIVE",
  contractValue: 10_000_000,
  projectBudget: 7_500_000,
  currency: "PHP",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

const mockCostCodes: ProjectCostCode[] = [
  {
    id: "cc-structural",
    projectId: "proj-1",
    code: "05-STEEL",
    name: "Structural Steel",
    approvedBudgetAmount: 2_000_000,
    status: "ACTIVE",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  {
    id: "cc-mechanical",
    projectId: "proj-1",
    code: "23-HVAC",
    name: "HVAC & Mechanical",
    approvedBudgetAmount: 1_500_000,
    status: "ACTIVE",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

test("subcontractTotal correctly calculates sum of lines", () => {
  const sc = sampleSubcontract();
  assert.equal(subcontractTotal(sc), 500_000);
});

test("subcontractTotal falls back to quantity * unitRate if amount is null or missing", () => {
  const sc = sampleSubcontract({
    lines: [
      {
        id: "scl-3",
        subcontractId: "sc-1",
        lineNumber: 1,
        description: "Scaffolding rental",
        amount: null as any,
        quantity: 10,
        unit: "months",
        unitRate: 15_000,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
  });
  assert.equal(subcontractTotal(sc), 150_000);
});

test("subcontractTotal falls back to originalAmount if lines array is empty", () => {
  const sc = sampleSubcontract({ lines: [], originalAmount: 750_000 });
  assert.equal(subcontractTotal(sc), 750_000);
});

test("subcontractTotal never turns malformed negative line data into negative commitment", () => {
  const sc = sampleSubcontract({
    lines: [{
      id: "scl-negative",
      subcontractId: "sc-1",
      lineNumber: 1,
      description: "Malformed imported line",
      amount: -50,
    }],
  });
  assert.equal(subcontractTotal(sc), 0);
});

test("isCommittedSubcontract returns true ONLY for APPROVED and ACTIVE statuses", () => {
  assert.equal(isCommittedSubcontract(sampleSubcontract({ status: "DRAFT" })), false);
  assert.equal(isCommittedSubcontract(sampleSubcontract({ status: "APPROVED" })), true);
  assert.equal(isCommittedSubcontract(sampleSubcontract({ status: "ACTIVE" })), true);
  assert.equal(isCommittedSubcontract(sampleSubcontract({ status: "CLOSED" })), false);
  assert.equal(isCommittedSubcontract(sampleSubcontract({ status: "CANCELLED" })), false);

  // String input
  assert.equal(isCommittedSubcontract("DRAFT"), false);
  assert.equal(isCommittedSubcontract("APPROVED"), true);
  assert.equal(isCommittedSubcontract("ACTIVE"), true);
  assert.equal(isCommittedSubcontract("CLOSED"), false);
  assert.equal(isCommittedSubcontract("CANCELLED"), false);

  // Null / undefined handling
  assert.equal(isCommittedSubcontract(null), false);
  assert.equal(isCommittedSubcontract(undefined), false);
});

test("isVoidedSubcontract returns true ONLY for CANCELLED status", () => {
  assert.equal(isVoidedSubcontract(sampleSubcontract({ status: "DRAFT" })), false);
  assert.equal(isVoidedSubcontract(sampleSubcontract({ status: "APPROVED" })), false);
  assert.equal(isVoidedSubcontract(sampleSubcontract({ status: "ACTIVE" })), false);
  assert.equal(isVoidedSubcontract(sampleSubcontract({ status: "CLOSED" })), false);
  assert.equal(isVoidedSubcontract(sampleSubcontract({ status: "CANCELLED" })), true);

  assert.equal(isVoidedSubcontract("CANCELLED"), true);
  assert.equal(isVoidedSubcontract("ACTIVE"), false);
  assert.equal(isVoidedSubcontract(null), false);
});

test("calculateProjectCost combines PO and Subcontract commitments additively into committedCost", () => {
  const purchaseOrders: PurchaseOrder[] = [
    {
      id: "po-1",
      poNumber: "PO-2026-001",
      vendorId: "vendor-po-1",
      projectId: "proj-1",
      currency: "PHP",
      status: "APPROVED",
      totalAmount: 150_000,
      lines: [],
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "po-2",
      poNumber: "PO-2026-002",
      vendorId: "vendor-po-2",
      projectId: "proj-1",
      currency: "PHP",
      status: "ISSUED",
      totalAmount: 100_000,
      lines: [],
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ];

  const subcontracts: Subcontract[] = [
    sampleSubcontract({
      id: "sc-app",
      subcontractNumber: "SC-APP",
      status: "APPROVED",
      originalAmount: 300_000,
      lines: [],
    }),
    sampleSubcontract({
      id: "sc-act",
      subcontractNumber: "SC-ACT",
      status: "ACTIVE",
      originalAmount: 450_000,
      lines: [],
    }),
    sampleSubcontract({
      id: "sc-draft",
      subcontractNumber: "SC-DFT",
      status: "DRAFT",
      originalAmount: 90_000,
      lines: [],
    }),
    sampleSubcontract({
      id: "sc-can",
      subcontractNumber: "SC-CAN",
      status: "CANCELLED",
      originalAmount: 180_000,
      lines: [],
    }),
    sampleSubcontract({
      id: "sc-closed",
      subcontractNumber: "SC-CLS",
      status: "CLOSED",
      originalAmount: 200_000,
      lines: [],
    }),
  ];

  const summary = calculateProjectCost(mockProject, {
    invoices: [],
    payroll: [],
    expenses: [],
    purchaseOrders,
    subcontracts,
  });

  // PO committed: 150k + 100k = 250k
  // SC committed: 300k (APPROVED) + 450k (ACTIVE) = 750k
  // Total committed: 250k + 750k = 1,000,000
  assert.equal(summary.committedCost, 1_000_000);
  assert.equal(summary.totalActualCost, 0);
  assert.equal(summary.remainingBudget, 7_500_000);
});

test("totalActualCost is strictly unaffected by subcontract commitments", () => {
  const allocation: InvoiceProjectAllocation = {
    id: "alloc-1",
    invoiceId: "inv-1",
    projectId: "proj-1",
    allocationType: "AMOUNT",
    allocationAmount: 120_000,
    allocationPercentage: null,
  };

  const verifiedInvoice = {
    id: "inv-1",
    invoiceNumber: "INV-1001",
    vendor: { name: "Steel Contractor Co" },
    reviewStatus: "VERIFIED" as const,
    lifecycleStatus: "ACTIVE" as const,
    status: "PAID" as const,
    currency: "PHP",
    grandTotal: 120_000,
    allocations: [allocation],
  } as any as InvoiceData;

  const expense: Expense = {
    id: "exp-1",
    projectId: "proj-1",
    amount: 30_000,
    currency: "PHP",
    status: "APPROVED",
    expenseDate: "2026-01-01",
    category: "Site Services",
    description: "Generator rental",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };

  const withoutSubcontracts = calculateProjectCost(mockProject, {
    invoices: [verifiedInvoice],
    expenses: [expense],
    payroll: [],
    subcontracts: [],
  });

  const withSubcontracts = calculateProjectCost(mockProject, {
    invoices: [verifiedInvoice],
    expenses: [expense],
    payroll: [],
    subcontracts: [
      sampleSubcontract({
        id: "sc-huge",
        status: "ACTIVE",
        originalAmount: 5_000_000,
        lines: [],
      }),
    ],
  });

  assert.equal(withoutSubcontracts.totalActualCost, 150_000);
  assert.equal(withSubcontracts.totalActualCost, 150_000);
  assert.equal(withSubcontracts.committedCost, 5_000_000);
  assert.equal(withSubcontracts.remainingBudget, 7_500_000 - 150_000);
});

test("mixed currencies remain truthful and route foreign currency subcontracts to foreignCosts", () => {
  const usdSubcontract = sampleSubcontract({
    id: "sc-usd",
    subcontractNumber: "SC-USD-001",
    currency: "USD",
    status: "ACTIVE",
    originalAmount: 50_000,
    lines: [],
  });

  const summary = calculateProjectCost(mockProject, {
    invoices: [],
    payroll: [],
    expenses: [],
    subcontracts: [usdSubcontract],
  });

  assert.equal(summary.committedCost, 0, "Base PHP committedCost must not add USD amounts directly");
  assert.equal(summary.foreignCosts?.["USD"], 50_000, "USD commitment must be tracked in foreignCosts");
});

test("calculateProjectBudgetControl classifies subcontract lines to matched project cost codes or uncoded", () => {
  const subcontracts: Subcontract[] = [
    {
      id: "sc-ctrl-1",
      subcontractNumber: "SC-CTRL-1",
      vendorId: "vendor-trade-1",
      projectId: "proj-1",
      currency: "PHP",
      title: "Core Package",
      status: "ACTIVE",
      originalAmount: 700_000,
      lines: [
        {
          id: "line-steel",
          subcontractId: "sc-ctrl-1",
          lineNumber: 1,
          description: "Steel framing trusses",
          amount: 400_000,
          projectCostCodeId: "cc-structural",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
        {
          id: "line-hvac",
          subcontractId: "sc-ctrl-1",
          lineNumber: 2,
          description: "Chiller unit install",
          amount: 200_000,
          projectCostCodeId: "cc-mechanical",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
        {
          id: "line-uncoded",
          subcontractId: "sc-ctrl-1",
          lineNumber: 3,
          description: "General scaffolding & staging",
          amount: 100_000,
          projectCostCodeId: null,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
      ],
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ];

  const budgetControl = calculateProjectBudgetControl(
    mockProject,
    mockCostCodes,
    {
      subcontracts,
      invoices: [],
      expenses: [],
      payroll: [],
    },
  );

  const structural = budgetControl.costCodes.find((cc) => cc.costCodeId === "cc-structural");
  const mechanical = budgetControl.costCodes.find((cc) => cc.costCodeId === "cc-mechanical");

  assert.ok(structural, "Structural cost code summary must exist");
  assert.equal(structural.committedCost, 400_000);

  assert.ok(mechanical, "Mechanical cost code summary must exist");
  assert.equal(mechanical.committedCost, 200_000);

  assert.equal(budgetControl.codedCommittedCost, 600_000);
  assert.equal(budgetControl.uncodedCommittedCost, 100_000);
  assert.equal(budgetControl.totalCommittedCost, 700_000);
});

test("project dashboard uses the same PO plus subcontract commitment predicate", () => {
  const dashboard = buildProjectDashboardViewData({
    project: mockProject,
    invoices: [],
    expenses: [],
    payroll: [],
    purchaseOrders: [{
      id: "po-dashboard",
      poNumber: "PO-DASHBOARD",
      vendorId: "vendor-po",
      projectId: mockProject.id,
      currency: "PHP",
      status: "APPROVED",
      totalAmount: 100_000,
      lines: [],
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    }],
    subcontracts: [sampleSubcontract({ status: "ACTIVE", originalAmount: 250_000, lines: [] })],
  });

  assert.equal(dashboard.committed, 350_000);
  assert.equal(dashboard.availableAfterCommitments, 7_150_000);
  assert.equal(dashboard.excess, 0);
});

test("executive dashboard keeps committed cost separate from pending exposure", () => {
  const purchaseOrder: PurchaseOrder = {
    id: "po-executive-dashboard",
    poNumber: "PO-EXECUTIVE",
    vendorId: "vendor-po",
    projectId: mockProject.id,
    currency: "PHP",
    status: "ISSUED",
    totalAmount: 125_000,
    lines: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
  const dashboard = buildDashboardViewData({
    projects: [mockProject],
    invoices: [],
    expenses: [],
    payroll: [],
    periods: [],
    workers: [],
    payrollEntries: [],
    payrollAllocations: [],
    payrollRuns: [],
    purchaseOrders: [purchaseOrder],
    subcontracts: [sampleSubcontract({ status: "APPROVED", originalAmount: 75_000, lines: [] })],
    activityPeriod: "YEAR",
    selectedCurrency: "PHP",
  });

  assert.equal(dashboard.committedProjectCost, 200_000);
  assert.equal(dashboard.pendingProjectCost, 0);
  assert.equal(dashboard.projectRows[0]?.committed, 200_000);
  assert.equal(dashboard.availableAfterCommitments, 7_300_000);
});
