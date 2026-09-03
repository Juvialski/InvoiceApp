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

test("project-level and cost-code-level commitments strictly reconcile with zero double-counting across linked and standalone variations and claims", () => {
  // Setup:
  // Subcontract: 4,000,000 on cc-hvac
  // Linked positive variation: +500,000 on cc-hvac (revised sc line = 4,500,000)
  // Linked negative variation: -200,000 on cc-hvac (revised sc line = 4,300,000)
  // Standalone variation: +300,000 on cc-elec
  // Total revised subcontract commitment = 4,300,000 + 300,000 = 4,600,000
  //
  // Claim 1:
  // Claims 1,000,000 on original line (revised scope) -> approved 1,000,000
  // Claims 100,000 on standalone variation line -> approved 100,000
  // Remaining sc line commitment = 4,300,000 - 1,000,000 = 3,300,000 (on cc-hvac)
  // Remaining standalone var commitment = 300,000 - 100,000 = 200,000 (on cc-elec)
  // Total remaining project commitment = 3,300,000 + 200,000 = 3,500,000

  const variations: SubcontractVariation[] = [
    {
      id: "var-pos-1",
      companyId: "company-1",
      subcontractId: "sc-hvac-1",
      projectId: "proj-skyline",
      variationNumber: "VO-POS-01",
      title: "Add extra ductwork",
      status: "APPROVED",
      netAmount: 500000,
      lines: [
        {
          id: "vl-pos-1",
          companyId: "company-1",
          subcontractVariationId: "var-pos-1",
          subcontractLineId: "scl-1",
          projectCostCodeId: "cc-hvac",
          lineNumber: 1,
          description: "Extra ductwork",
          amount: 500000,
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        },
      ],
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    },
    {
      id: "var-neg-1",
      companyId: "company-1",
      subcontractId: "sc-hvac-1",
      projectId: "proj-skyline",
      variationNumber: "VO-NEG-01",
      title: "Scope reduction",
      status: "APPROVED",
      netAmount: -200000,
      lines: [
        {
          id: "vl-neg-1",
          companyId: "company-1",
          subcontractVariationId: "var-neg-1",
          subcontractLineId: "scl-1",
          projectCostCodeId: "cc-hvac",
          lineNumber: 1,
          description: "Omitted diffusers",
          amount: -200000,
          createdAt: "2026-02-05T00:00:00Z",
          updatedAt: "2026-02-05T00:00:00Z",
        },
      ],
      createdAt: "2026-02-05T00:00:00Z",
      updatedAt: "2026-02-05T00:00:00Z",
    },
    {
      id: "var-standalone-1",
      companyId: "company-1",
      subcontractId: "sc-hvac-1",
      projectId: "proj-skyline",
      variationNumber: "VO-STANDALONE-01",
      title: "BMS Integration Panel",
      status: "APPROVED",
      netAmount: 300000,
      lines: [
        {
          id: "vl-standalone-1",
          companyId: "company-1",
          subcontractVariationId: "var-standalone-1",
          projectCostCodeId: "cc-elec",
          lineNumber: 1,
          description: "BMS Panel & Cabling",
          amount: 300000,
          createdAt: "2026-02-10T00:00:00Z",
          updatedAt: "2026-02-10T00:00:00Z",
        },
      ],
      createdAt: "2026-02-10T00:00:00Z",
      updatedAt: "2026-02-10T00:00:00Z",
    },
  ];

  const claims: SubcontractProgressClaim[] = [
    {
      id: "claim-1",
      companyId: "company-1",
      subcontractId: "sc-hvac-1",
      projectId: "proj-skyline",
      claimNumber: "SC-HVAC-01-CLM-01",
      valuationDate: "2026-02-28",
      claimedGrossAmount: 1100000,
      approvedGrossAmount: 1100000,
      retentionRate: 0.1, // 10%
      retentionAmount: 110000,
      netCertifiedAmount: 990000,
      status: "APPROVED",
      lines: [
        {
          id: "cl-1",
          companyId: "company-1",
          claimId: "claim-1",
          lineNumber: 1,
          subcontractLineId: "scl-1",
          claimedAmount: 1000000,
          approvedAmount: 1000000,
          createdAt: "2026-02-28T00:00:00Z",
          updatedAt: "2026-02-28T00:00:00Z",
        },
        {
          id: "cl-2",
          companyId: "company-1",
          claimId: "claim-1",
          lineNumber: 2,
          subcontractVariationLineId: "vl-standalone-1",
          claimedAmount: 100000,
          approvedAmount: 100000,
          createdAt: "2026-02-28T00:00:00Z",
          updatedAt: "2026-02-28T00:00:00Z",
        },
      ],
      createdAt: "2026-02-28T00:00:00Z",
      updatedAt: "2026-02-28T00:00:00Z",
    },
  ];

  // 1. Calculate project cost summary
  const projectSummary = calculateProjectCost(project, {
    invoices: [],
    expenses: [],
    payroll: [],
    purchaseOrders: [],
    subcontracts: [subcontract],
    subcontractClaims: claims,
    subcontractVariations: variations,
  });

  // Project committed cost must be exactly remaining commitment: 4.6M revised - 1.1M approved claims = 3.5M
  assert.equal(projectSummary.committedCost, 3500000);

  // 2. Calculate budget control breakdown per cost code
  const budgetControl = calculateProjectBudgetControl(project, costCodes, {
    invoices: [],
    expenses: [],
    payroll: [],
    purchaseOrders: [],
    subcontracts: [subcontract],
    subcontractClaims: claims,
    subcontractVariations: variations,
  });

  const hvacCode = budgetControl.costCodes.find((c) => c.costCodeId === "cc-hvac")!;
  const elecCode = budgetControl.costCodes.find((c) => c.costCodeId === "cc-elec")!;

  assert.ok(hvacCode, "cc-hvac must exist in summary");
  assert.ok(elecCode, "cc-elec must exist in summary");

  // HVAC: Revised 4.3M - 1.0M approved = 3.3M remaining commitment
  assert.equal(hvacCode.committedCost, 3300000);
  assert.equal(hvacCode.certifiedSubcontractCost, 1000000);
  assert.equal(hvacCode.retentionHeldCost, 100000);

  // Electrical: Revised 300k - 100k approved = 200k remaining commitment
  assert.equal(elecCode.committedCost, 200000);
  assert.equal(elecCode.certifiedSubcontractCost, 100000);
  assert.equal(elecCode.retentionHeldCost, 10000);

  // 3. Strict reconciliation: sum of cost-code committed costs matches project committed cost
  const totalCostCodeCommitted = budgetControl.costCodes.reduce((s, c) => s + c.committedCost, 0);
  assert.equal(
    totalCostCodeCommitted,
    projectSummary.committedCost,
    "Cost-code committed costs must strictly reconcile with project committed cost",
  );

  // Total certified work matches approved claims gross
  const totalCostCodeCertified = budgetControl.costCodes.reduce((s, c) => s + (c.certifiedSubcontractCost || 0), 0);
  assert.equal(totalCostCodeCertified, 1100000);
});

