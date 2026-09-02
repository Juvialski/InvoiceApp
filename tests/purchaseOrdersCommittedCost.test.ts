import test from "node:test";
import assert from "node:assert/strict";
import type { Project, ProjectCostCode, PurchaseOrder, Expense, InvoiceData, InvoiceProjectAllocation } from "../src/types.ts";
import { calculateProjectCost, calculateProjectBudgetControl } from "../src/utils/projectCosting.ts";

const mockProject: Project = {
  id: "proj-1",
  projectCode: "WH-001",
  projectName: "Warehouse Facility",
  clientName: "Apex Logistics",
  status: "ACTIVE",
  contractValue: 5_000_000,
  projectBudget: 3_500_000,
  currency: "PHP",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

const mockCostCodes: ProjectCostCode[] = [
  {
    id: "cc-structural",
    projectId: "proj-1",
    code: "03-CONC",
    name: "Concrete & Rebar",
    approvedBudgetAmount: 1_000_000,
    status: "ACTIVE",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  {
    id: "cc-electrical",
    projectId: "proj-1",
    code: "26-ELEC",
    name: "Electrical Systems",
    approvedBudgetAmount: 800_000,
    status: "ACTIVE",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

const mockPOs: PurchaseOrder[] = [
  {
    id: "po-approved",
    poNumber: "PO-2026-001",
    vendorId: "vendor-steel",
    projectId: "proj-1",
    currency: "PHP",
    status: "APPROVED",
    totalAmount: 200_000,
    lines: [
      {
        id: "pol-1",
        purchaseOrderId: "po-approved",
        lineNumber: 1,
        description: "Deformed Bars Grade 60",
        quantity: 200,
        unit: "pcs",
        unitPrice: 1000,
        amount: 200_000,
        projectCostCodeId: "cc-structural",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  {
    id: "po-issued",
    poNumber: "PO-2026-002",
    vendorId: "vendor-elec",
    projectId: "proj-1",
    currency: "PHP",
    status: "ISSUED",
    totalAmount: 150_000,
    lines: [
      {
        id: "pol-2",
        purchaseOrderId: "po-issued",
        lineNumber: 1,
        description: "Transformers & Panelboards",
        quantity: 1,
        unit: "lot",
        unitPrice: 150_000,
        amount: 150_000,
        projectCostCodeId: "cc-electrical",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  {
    id: "po-draft",
    poNumber: "PO-2026-DRAFT",
    vendorId: "vendor-misc",
    projectId: "proj-1",
    currency: "PHP",
    status: "DRAFT",
    totalAmount: 50_000,
    lines: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  {
    id: "po-cancelled",
    poNumber: "PO-2026-CAN",
    vendorId: "vendor-misc",
    projectId: "proj-1",
    currency: "PHP",
    status: "CANCELLED",
    totalAmount: 80_000,
    lines: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

test("calculateProjectCost computes committedCost from APPROVED and ISSUED purchase orders only", () => {
  const summary = calculateProjectCost(mockProject, {
    invoices: [],
    payroll: [],
    expenses: [],
    purchaseOrders: mockPOs,
  });

  // Approved (200k) + Issued (150k) = 350k. Draft (50k) & Cancelled (80k) are excluded.
  assert.equal(summary.committedCost, 350_000);
  // Actual cost MUST remain strictly 0
  assert.equal(summary.totalActualCost, 0);
  assert.equal(summary.remainingBudget, 3_500_000);
});

test("purchase orders NEVER inflate totalActualCost", () => {
  const verifiedInvoice = {
    id: "inv-1",
    invoiceNumber: "INV-1001",
    vendor: { name: "Supplier Steel" },
    reviewStatus: "VERIFIED" as const,
    lifecycleStatus: "ACTIVE" as const,
    status: "PAID" as const,
    currency: "PHP",
    grandTotal: 100_000,
  } as any as InvoiceData;
  const allocation: InvoiceProjectAllocation = {
    id: "alloc-1",
    invoiceId: "inv-1",
    projectId: "proj-1",
    allocationType: "AMOUNT",
    allocationAmount: 100_000,
  };

  const summary = calculateProjectCost(mockProject, {
    invoices: [{ ...verifiedInvoice, allocations: [allocation] }],
    payroll: [],
    expenses: [],
    purchaseOrders: mockPOs,
  });

  // Actual cost = 100k from invoice only.
  assert.equal(summary.totalActualCost, 100_000);
  assert.equal(summary.invoiceCost, 100_000);
  // Committed cost = 350k from approved/issued POs.
  assert.equal(summary.committedCost, 350_000);
  // Remaining budget = 3.5M - 100k actual = 3.4M
  assert.equal(summary.remainingBudget, 3_400_000);
});

test("calculateProjectBudgetControl allocates committed cost to respective cost codes", () => {
  const budgetControl = calculateProjectBudgetControl(mockProject, mockCostCodes, {
    invoices: [],
    payroll: [],
    expenses: [],
    purchaseOrders: mockPOs,
    baseCurrency: "PHP",
  });

  assert.equal(budgetControl.totalCommittedCost, 350_000);
  assert.equal(budgetControl.codedCommittedCost, 350_000);
  assert.equal(budgetControl.uncodedCommittedCost, 0);

  const concCode = budgetControl.costCodes.find((c) => c.code === "03-CONC");
  assert.ok(concCode);
  assert.equal(concCode.committedCost, 200_000);
  assert.equal(concCode.actualCost, 0);

  const elecCode = budgetControl.costCodes.find((c) => c.code === "26-ELEC");
  assert.ok(elecCode);
  assert.equal(elecCode.committedCost, 150_000);
  assert.equal(elecCode.actualCost, 0);
});

test("foreign currency purchase orders are segregated into foreignCosts without silent sum", () => {
  const foreignPO: PurchaseOrder = {
    id: "po-usd",
    poNumber: "PO-USD-001",
    vendorId: "vendor-us",
    projectId: "proj-1",
    currency: "USD",
    status: "APPROVED",
    totalAmount: 5_000,
    lines: [
      {
        id: "pol-usd-1",
        purchaseOrderId: "po-usd",
        lineNumber: 1,
        description: "Specialized Sensors",
        quantity: 1,
        unit: "lot",
        unitPrice: 5_000,
        amount: 5_000,
        projectCostCodeId: "cc-electrical",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };

  const summary = calculateProjectCost(mockProject, {
    invoices: [],
    payroll: [],
    expenses: [],
    purchaseOrders: [...mockPOs, foreignPO],
  });

  // Base currency committed cost remains 350k PHP
  assert.equal(summary.committedCost, 350_000);
  // Foreign costs tracks USD 5000
  assert.equal(summary.foreignCosts.USD, 5_000);
});
