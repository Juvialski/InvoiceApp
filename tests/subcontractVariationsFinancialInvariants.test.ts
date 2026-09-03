import test from "node:test";
import assert from "node:assert/strict";
import type { Project, ProjectCostCode, Subcontract, SubcontractProgressClaim, SubcontractVariation } from "../src/types.ts";
import { calculateProjectBudgetControl, calculateProjectCost } from "../src/utils/projectCosting.ts";
import { calculateNetApprovedVariations, calculateRevisedSubcontractValue, calculateRemainingSubcontractCommitment } from "../src/lib/subcontractVariations.ts";

const project: Project = {
  id: "proj-skyline",
  projectCode: "PRJ-SKY",
  projectName: "Skyline Commercial Center",
  status: "ACTIVE",
  currency: "PHP",
  contractValue: 50000000, // 50M client-facing contract value
  projectBudget: 40000000,  // 40M internal approved cost budget
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const costCodes: ProjectCostCode[] = [
  {
    id: "cc-hvac",
    companyId: "company-1",
    projectId: "proj-skyline",
    code: "04-100",
    name: "HVAC Works",
    approvedBudgetAmount: 5000000,
    forecastAmount: 5000000,
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "cc-elec",
    companyId: "company-1",
    projectId: "proj-skyline",
    code: "04-200",
    name: "Electrical Controls",
    approvedBudgetAmount: 3000000,
    forecastAmount: 3000000,
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

const subcontract: Subcontract = {
  id: "sc-hvac-1",
  companyId: "company-1",
  subcontractNumber: "SC-HVAC-01",
  vendorId: "vendor-climatech",
  projectId: "proj-skyline",
  title: "HVAC Primary Contract",
  status: "APPROVED",
  currency: "PHP",
  originalAmount: 4000000,
  lines: [
    {
      id: "scl-1",
      companyId: "company-1",
      subcontractId: "sc-hvac-1",
      projectCostCodeId: "cc-hvac",
      lineNumber: 1,
      description: "Air Handling Units & Chillers",
      amount: 4000000,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

test("contract_value and project_budget remain strictly immutable when subcontract variations occur", () => {
  const variations: SubcontractVariation[] = [
    {
      id: "var-1",
      companyId: "company-1",
      subcontractId: "sc-hvac-1",
      projectId: "proj-skyline",
      variationNumber: "VO-01",
      title: "Add VAV Boxes",
      status: "APPROVED",
      netAmount: 500000,
      lines: [
        {
          id: "vl-1",
          companyId: "company-1",
          subcontractVariationId: "var-1",
          subcontractLineId: "scl-1",
          projectCostCodeId: "cc-hvac",
          lineNumber: 1,
          description: "VAV boxes",
          amount: 500000,
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        },
      ],
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    },
  ];

  const summary = calculateProjectCost(project, {
    invoices: [],
    expenses: [],
    payroll: [],
    purchaseOrders: [],
    subcontracts: [subcontract],
    subcontractClaims: [],
    subcontractVariations: variations,
  });

  // Client contract value must remain exactly 50M on the Project entity
  assert.equal(project.contractValue, 50000000);
  // Internal budget must remain exactly 40M on Project and summary
  assert.equal(project.projectBudget, 40000000);
  assert.equal(summary.budget, 40000000);
  // Total actual cost must remain 0
  assert.equal(summary.totalActualCost, 0);
  // Committed cost reflects subcontract (4M) + approved variation (500k) = 4.5M
  assert.equal(summary.committedCost, 4500000);
});

test("variations adjust subcontract commitments only and do not create actual costs or expenses", () => {
  const approvedVariation: SubcontractVariation = {
    id: "var-approved",
    companyId: "company-1",
    subcontractId: "sc-hvac-1",
    projectId: "proj-skyline",
    variationNumber: "VO-02",
    title: "Additional ductwork insulation",
    status: "APPROVED",
    netAmount: 250000,
    lines: [
      {
        id: "vl-2",
        companyId: "company-1",
        subcontractVariationId: "var-approved",
        projectCostCodeId: "cc-hvac",
        lineNumber: 1,
        description: "Ductwork acoustic insulation",
        amount: 250000,
        createdAt: "2026-02-05T00:00:00Z",
        updatedAt: "2026-02-05T00:00:00Z",
      },
    ],
    createdAt: "2026-02-05T00:00:00Z",
    updatedAt: "2026-02-05T00:00:00Z",
  };

  const draftVariation: SubcontractVariation = {
    id: "var-draft",
    companyId: "company-1",
    subcontractId: "sc-hvac-1",
    projectId: "proj-skyline",
    variationNumber: "VO-DRAFT",
    title: "Unapproved proposal",
    status: "DRAFT",
    netAmount: 800000,
    lines: [],
    createdAt: "2026-02-06T00:00:00Z",
    updatedAt: "2026-02-06T00:00:00Z",
  };

  const submittedVariation: SubcontractVariation = {
    id: "var-submitted",
    companyId: "company-1",
    subcontractId: "sc-hvac-1",
    projectId: "proj-skyline",
    variationNumber: "VO-SUBMITTED",
    title: "Pending engineering review",
    status: "SUBMITTED",
    netAmount: 600000,
    lines: [],
    createdAt: "2026-02-07T00:00:00Z",
    updatedAt: "2026-02-07T00:00:00Z",
  };

  const summary = calculateProjectCost(project, {
    invoices: [],
    expenses: [],
    payroll: [],
    purchaseOrders: [],
    subcontracts: [subcontract],
    subcontractClaims: [],
    subcontractVariations: [approvedVariation, draftVariation, submittedVariation],
  });

  // Only approved variation (250k) is incorporated into commitment
  // Subcontract (4M) + 250k = 4,250,000
  assert.equal(summary.committedCost, 4250000);
  assert.equal(summary.totalActualCost, 0);
  assert.equal(summary.invoiceCost, 0);
  assert.equal(summary.otherExpenseCost, 0);
  assert.equal(summary.payrollCost, 0);
});

test("negative variation accurately reduces committed cost but cannot create negative commitments", () => {
  const omissionVariation: SubcontractVariation = {
    id: "var-omission",
    companyId: "company-1",
    subcontractId: "sc-hvac-1",
    projectId: "proj-skyline",
    variationNumber: "VO-OMIT-1",
    title: "Omit 2 AHUs from scope",
    status: "APPROVED",
    netAmount: -600000,
    lines: [
      {
        id: "vl-omit",
        companyId: "company-1",
        subcontractVariationId: "var-omission",
        subcontractLineId: "scl-1",
        projectCostCodeId: "cc-hvac",
        lineNumber: 1,
        description: "Deduction for omitted AHUs",
        amount: -600000,
        createdAt: "2026-02-10T00:00:00Z",
        updatedAt: "2026-02-10T00:00:00Z",
      },
    ],
    createdAt: "2026-02-10T00:00:00Z",
    updatedAt: "2026-02-10T00:00:00Z",
  };

  const summary = calculateProjectCost(project, {
    invoices: [],
    expenses: [],
    payroll: [],
    purchaseOrders: [],
    subcontracts: [subcontract],
    subcontractClaims: [],
    subcontractVariations: [omissionVariation],
  });

  // 4,000,000 - 600,000 = 3,400,000
  assert.equal(summary.committedCost, 3400000);
});

test("calculateProjectBudgetControl tracks revised cost code commitments with approved variations", () => {
  const variations: SubcontractVariation[] = [
    // Variation 1 adjusts cc-hvac by +300,000
    {
      id: "var-hvac-add",
      companyId: "company-1",
      subcontractId: "sc-hvac-1",
      projectId: "proj-skyline",
      variationNumber: "VO-03",
      title: "Add extra ductwork",
      status: "APPROVED",
      netAmount: 300000,
      lines: [
        {
          id: "vl-3",
          companyId: "company-1",
          subcontractVariationId: "var-hvac-add",
          subcontractLineId: "scl-1",
          projectCostCodeId: "cc-hvac",
          lineNumber: 1,
          description: "Extra ductwork",
          amount: 300000,
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        },
      ],
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    },
    // Variation 2 introduces standalone scope on cc-elec for +200,000
    {
      id: "var-elec-add",
      companyId: "company-1",
      subcontractId: "sc-hvac-1",
      projectId: "proj-skyline",
      variationNumber: "VO-04",
      title: "Add BAS integration controllers",
      status: "APPROVED",
      netAmount: 200000,
      lines: [
        {
          id: "vl-4",
          companyId: "company-1",
          subcontractVariationId: "var-elec-add",
          projectCostCodeId: "cc-elec", // Standalone new cost code on this subcontract
          lineNumber: 1,
          description: "BMS controllers and wiring",
          amount: 200000,
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        },
      ],
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    },
  ];

  const budgetControl = calculateProjectBudgetControl(project, costCodes, {
    invoices: [],
    expenses: [],
    payroll: [],
    purchaseOrders: [],
    subcontracts: [subcontract],
    subcontractClaims: [],
    subcontractVariations: variations,
  });

  const hvacRow = budgetControl.costCodes.find((c) => c.costCodeId === "cc-hvac");
  const elecRow = budgetControl.costCodes.find((c) => c.costCodeId === "cc-elec");

  assert.ok(hvacRow);
  assert.ok(elecRow);

  // HVAC cost code: Original 4M + 300k variation = 4.3M committed
  assert.equal(hvacRow.committedCost, 4300000);
  assert.equal(hvacRow.budgetAmount, 5000000);

  // Electrical cost code: Original 0 + 200k variation = 200k committed
  assert.equal(elecRow.committedCost, 200000);
  assert.equal(elecRow.budgetAmount, 3000000);
});

test("foreign currency subcontract variations remain truthful and isolated from base currency", () => {
  const usdSubcontract: Subcontract = {
    id: "sc-usd-1",
    companyId: "company-1",
    subcontractNumber: "SC-SPECIALIST-USD",
    vendorId: "vendor-overseas",
    projectId: "proj-skyline",
    title: "Specialist Glazing Import & Installation",
    status: "APPROVED",
    currency: "USD",
    originalAmount: 100000,
    lines: [
      {
        id: "scl-usd-1",
        companyId: "company-1",
        subcontractId: "sc-usd-1",
        lineNumber: 1,
        description: "Curtain wall structural calculations & panels",
        amount: 100000,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  const usdVariation: SubcontractVariation = {
    id: "var-usd-1",
    companyId: "company-1",
    subcontractId: "sc-usd-1",
    projectId: "proj-skyline",
    variationNumber: "VO-USD-01",
    title: "Solar shading louvers",
    status: "APPROVED",
    currency: "USD",
    netAmount: 25000,
    lines: [
      {
        id: "vl-usd-1",
        companyId: "company-1",
        subcontractVariationId: "var-usd-1",
        lineNumber: 1,
        description: "Motorized solar louvers",
        amount: 25000,
        createdAt: "2026-02-01T00:00:00Z",
        updatedAt: "2026-02-01T00:00:00Z",
      },
    ],
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
  };

  const summary = calculateProjectCost(project, {
    invoices: [],
    expenses: [],
    payroll: [],
    purchaseOrders: [],
    subcontracts: [usdSubcontract],
    subcontractClaims: [],
    subcontractVariations: [usdVariation],
  });

  // Base PHP committed cost must NOT silently add USD
  assert.equal(summary.committedCost, 0);

  // Foreign costs must report USD 125,000 (100k + 25k)
  assert.ok(summary.foreignCosts);
  assert.equal(summary.foreignCosts["USD"], 125000);
});
