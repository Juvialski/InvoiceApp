import test from "node:test";
import assert from "node:assert/strict";
import type {
  Project,
  ProjectCostCode,
  Subcontract,
  SubcontractProgressClaim,
} from "../src/types.ts";
import {
  roundMoney,
  calculateRetention,
  normalizeClaimStatus,
  computeSubcontractClaimMetrics,
  applySubcontractClaimTransition,
} from "../src/lib/subcontractClaims.ts";
import {
  calculateProjectCost,
  calculateProjectBudgetControl,
} from "../src/utils/projectCosting.ts";

function createMockSubcontract(overrides: Partial<Subcontract> = {}): Subcontract {
  return {
    id: "sc-hvac-1",
    subcontractNumber: "SC-2026-001",
    vendorId: "vendor-trade-1",
    projectId: "proj-1",
    title: "HVAC & Mechanical Works",
    currency: "PHP",
    status: "ACTIVE",
    originalAmount: 1_850_000,
    lines: [
      {
        id: "scl-1",
        subcontractId: "sc-hvac-1",
        lineNumber: 1,
        description: "Chiller units and primary pipework",
        amount: 1_200_000,
        quantity: 1,
        unit: "lot",
        unitRate: 1_200_000,
        projectCostCodeId: "cc-hvac",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "scl-2",
        subcontractId: "sc-hvac-1",
        lineNumber: 2,
        description: "Ductwork distribution and diffusers",
        amount: 650_000,
        quantity: 1,
        unit: "lot",
        unitRate: 650_000,
        projectCostCodeId: "cc-hvac",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createMockClaim(overrides: Partial<SubcontractProgressClaim> = {}): SubcontractProgressClaim {
  return {
    id: "claim-1",
    claimNumber: "PC-001",
    subcontractId: "sc-hvac-1",
    projectId: "proj-1",
    valuationDate: "2026-02-15",
    periodStart: "2026-02-01",
    periodEnd: "2026-02-15",
    status: "APPROVED",
    retentionRate: 0.1,
    claimedGrossAmount: 700_000,
    approvedGrossAmount: 700_000,
    retentionAmount: 70_000,
    netCertifiedAmount: 630_000,
    currency: "PHP",
    lines: [
      {
        id: "pcl-1",
        claimId: "claim-1",
        subcontractLineId: "scl-1",
        lineNumber: 1,
        claimedAmount: 500_000,
        approvedAmount: 500_000,
        notes: "Chiller placement complete",
        createdAt: "2026-02-15T00:00:00Z",
        updatedAt: "2026-02-15T00:00:00Z",
      },
      {
        id: "pcl-2",
        claimId: "claim-1",
        subcontractLineId: "scl-2",
        lineNumber: 2,
        claimedAmount: 200_000,
        approvedAmount: 200_000,
        notes: "First floor trunking",
        createdAt: "2026-02-15T00:00:00Z",
        updatedAt: "2026-02-15T00:00:00Z",
      },
    ],
    createdAt: "2026-02-15T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
    ...overrides,
  };
}

const mockProject: Project = {
  id: "proj-1",
  projectCode: "PRJ-2026-01",
  projectName: "Warehouse Logistics Hub",
  projectBudget: 5_000_000,
  currency: "PHP",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const mockCostCode: ProjectCostCode = {
  id: "cc-hvac",
  projectId: "proj-1",
  code: "04-100",
  name: "Mechanical & HVAC",
  approvedBudgetAmount: 2_500_000,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

test("roundMoney and calculateRetention compute precise commercial amounts", () => {
  assert.equal(roundMoney(100.004), 100);
  assert.equal(roundMoney(100.005), 100.01);
  assert.equal(roundMoney(700000), 700000);

  // 10% retention on 700,000
  const ret10 = calculateRetention(700_000, 0.1);
  assert.equal(ret10.retentionAmount, 70_000);
  assert.equal(ret10.netCertifiedAmount, 630_000);

  // 5% retention on 123,456.78
  const ret5 = calculateRetention(123_456.78, 0.05);
  assert.equal(ret5.retentionAmount, 6_172.84);
  assert.equal(ret5.netCertifiedAmount, 117_283.94);

  // 0% retention
  const ret0 = calculateRetention(500_000, 0);
  assert.equal(ret0.retentionAmount, 0);
  assert.equal(ret0.netCertifiedAmount, 500_000);

  // Clamped retention rates
  const retNegative = calculateRetention(100, -0.05);
  assert.equal(retNegative.retentionAmount, 0);
  assert.equal(retNegative.netCertifiedAmount, 100);

  const retExceed = calculateRetention(100, 1.5);
  assert.equal(retExceed.retentionAmount, 100);
  assert.equal(retExceed.netCertifiedAmount, 0);
});

test("normalizeClaimStatus safely validates supported statuses", () => {
  assert.equal(normalizeClaimStatus("draft"), "DRAFT");
  assert.equal(normalizeClaimStatus("SUBMITTED"), "SUBMITTED");
  assert.equal(normalizeClaimStatus("approved"), "APPROVED");
  assert.equal(normalizeClaimStatus("rejected"), "REJECTED");
  assert.equal(normalizeClaimStatus("cancelled"), "CANCELLED");
  assert.equal(normalizeClaimStatus("voided"), "VOIDED");
  assert.throws(() => normalizeClaimStatus("UNKNOWN"), /Invalid subcontract progress claim status/);
});

test("computeSubcontractClaimMetrics computes cumulative approved claims, retention held, and remaining commitment", () => {
  const sc = createMockSubcontract();
  const claim1 = createMockClaim({ id: "c1", status: "APPROVED", approvedGrossAmount: 700_000, retentionAmount: 70_000 });
  const claim2 = createMockClaim({ id: "c2", status: "SUBMITTED", claimedGrossAmount: 450_000, approvedGrossAmount: 0, retentionAmount: 0 });
  const claim3 = createMockClaim({ id: "c3", status: "REJECTED", claimedGrossAmount: 200_000, approvedGrossAmount: 0, retentionAmount: 0 });
  const claim4 = createMockClaim({ id: "c4", status: "VOIDED", claimedGrossAmount: 100_000, approvedGrossAmount: 0, retentionAmount: 0 });

  const metrics = computeSubcontractClaimMetrics(sc, [claim1, claim2, claim3, claim4]);
  assert.equal(metrics.claimsCount, 4);
  assert.equal(metrics.approvedClaimsCount, 1);
  assert.equal(metrics.cumulativeApprovedGross, 700_000);
  assert.equal(metrics.cumulativeRetentionHeld, 70_000);
  assert.equal(metrics.cumulativeNetCertified, 630_000);
  // Remaining commitment = 1,850,000 - 700,000 = 1,150,000
  assert.equal(metrics.remainingCommitment, 1_150_000);

  // Line-level breakdown
  assert.equal(metrics.lines.get("scl-1")?.cumulativeApproved, 500_000);
  assert.equal(metrics.lines.get("scl-1")?.remainingClaimable, 700_000); // 1,200,000 - 500,000
  assert.equal(metrics.lines.get("scl-2")?.cumulativeApproved, 200_000);
  assert.equal(metrics.lines.get("scl-2")?.remainingClaimable, 450_000); // 650,000 - 200,000
});

test("calculateProjectCost deducts cumulative approved progress claims from committed subcontract cost", () => {
  const sc = createMockSubcontract();
  const claim1 = createMockClaim({ id: "c1", status: "APPROVED", approvedGrossAmount: 700_000, retentionAmount: 70_000 });

  // Without claims: subcontract originalAmount is 1,850,000 committed
  const costWithoutClaims = calculateProjectCost(mockProject, {
    invoices: [],
    expenses: [],
    payroll: [],
    subcontracts: [sc],
  });
  assert.equal(costWithoutClaims.committedCost, 1_850_000);
  assert.equal(costWithoutClaims.certifiedSubcontractCost, 0);
  assert.equal(costWithoutClaims.retentionHeldCost, 0);
  assert.equal(costWithoutClaims.totalActualCost, 0);

  // With approved claim: remaining commitment = 1,850,000 - 700,000 = 1,150,000
  const costWithClaims = calculateProjectCost(mockProject, {
    invoices: [],
    expenses: [],
    payroll: [],
    subcontracts: [sc],
    subcontractClaims: [claim1],
  });
  assert.equal(costWithClaims.committedCost, 1_150_000);
  assert.equal(costWithClaims.certifiedSubcontractCost, 700_000);
  assert.equal(costWithClaims.retentionHeldCost, 70_000);

  // CRITICAL FINANCIAL TRUTH: progress claims DO NOT alter totalActualCost!
  assert.equal(costWithClaims.totalActualCost, 0, "Progress claims must never be added to Actual Cost");
});

test("calculateProjectBudgetControl reflects reduced commitment and tracks certified progress per cost code", () => {
  const sc = createMockSubcontract();
  const claim1 = createMockClaim({ id: "c1", status: "APPROVED", approvedGrossAmount: 700_000, retentionAmount: 70_000 });

  const budgetControl = calculateProjectBudgetControl(mockProject, [mockCostCode], {
    invoices: [],
    expenses: [],
    payroll: [],
    subcontracts: [sc],
    subcontractClaims: [claim1],
    baseCurrency: "PHP",
  });

  const codeSummary = budgetControl.costCodes[0];
  assert.ok(codeSummary);
  assert.equal(codeSummary.committedCost, 1_150_000, "Committed cost on cost code must reflect uncertified remainder");
  assert.equal(codeSummary.certifiedSubcontractCost, 700_000);
  assert.equal(codeSummary.retentionHeldCost, 70_000);
  assert.equal(codeSummary.actualCost, 0, "Actual cost on cost code must not include progress claims");

  assert.equal(budgetControl.totalCommittedCost, 1_150_000);
  assert.equal(budgetControl.totalCertifiedSubcontractCost, 700_000);
  assert.equal(budgetControl.totalRetentionHeldCost, 70_000);
});

test("applySubcontractClaimTransition enforces strict lifecycle state transitions and reasons", () => {
  const sc = createMockSubcontract();
  const draft = createMockClaim({ status: "DRAFT", approvedGrossAmount: 0, retentionAmount: 0 });

  // DRAFT -> SUBMITTED
  const submitted = applySubcontractClaimTransition(draft, "SUBMITTED", undefined, undefined, sc);
  assert.equal(submitted.status, "SUBMITTED");

  // DRAFT -> CANCELLED requires reason
  assert.throws(() => applySubcontractClaimTransition(draft, "CANCELLED", undefined, undefined, sc), /Cancellation reason is required/);
  const cancelled = applySubcontractClaimTransition(draft, "CANCELLED", "Subcontract scope revised", undefined, sc);
  assert.equal(cancelled.status, "CANCELLED");

  // SUBMITTED -> APPROVED with line approvals
  const approved = applySubcontractClaimTransition(
    submitted,
    "APPROVED",
    undefined,
    [
      { claimLineId: "pcl-1", approvedAmount: 500_000 },
      { claimLineId: "pcl-2", approvedAmount: 200_000 },
    ],
    sc,
  );
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.approvedGrossAmount, 700_000);
  assert.equal(approved.retentionAmount, 70_000);
  assert.equal(approved.netCertifiedAmount, 630_000);

  // SUBMITTED -> REJECTED requires reason
  assert.throws(() => applySubcontractClaimTransition(submitted, "REJECTED", "", undefined, sc), /Rejection reason is required/);
  const rejected = applySubcontractClaimTransition(submitted, "REJECTED", "Defective installation", undefined, sc);
  assert.equal(rejected.status, "REJECTED");

  // APPROVED -> VOIDED requires reason
  assert.throws(() => applySubcontractClaimTransition(approved, "VOIDED", undefined, undefined, sc), /Void reason is required/);
  const voided = applySubcontractClaimTransition(approved, "VOIDED", "Commercial error in valuation", undefined, sc);
  assert.equal(voided.status, "VOIDED");

  // Terminal states cannot transition
  assert.throws(() => applySubcontractClaimTransition(rejected, "SUBMITTED", undefined, undefined, sc), /Terminal claims cannot/);
  assert.throws(() => applySubcontractClaimTransition(cancelled, "DRAFT", undefined, undefined, sc), /Terminal claims cannot/);
  assert.throws(() => applySubcontractClaimTransition(voided, "APPROVED", undefined, undefined, sc), /Terminal claims cannot/);
});

test("applySubcontractClaimTransition rejects line-level and contract-level cumulative over-claims", () => {
  const sc = createMockSubcontract();
  // Existing approved claim of 700k (500k on scl-1, 200k on scl-2)
  const existingApproved = createMockClaim({
    id: "c1",
    status: "APPROVED",
    approvedGrossAmount: 700_000,
    lines: [
      { id: "pcl-1", claimId: "c1", subcontractLineId: "scl-1", lineNumber: 1, claimedAmount: 500_000, approvedAmount: 500_000, createdAt: "", updatedAt: "" },
      { id: "pcl-2", claimId: "c1", subcontractLineId: "scl-2", lineNumber: 2, claimedAmount: 200_000, approvedAmount: 200_000, createdAt: "", updatedAt: "" },
    ],
  });

  // Second claim attempting to approve 800k on scl-1 (subcontract line is only 1,200,000; 500k + 800k = 1.3M > 1.2M)
  const claim2 = createMockClaim({
    id: "c2",
    claimNumber: "PC-002",
    status: "SUBMITTED",
    claimedGrossAmount: 800_000,
    lines: [
      { id: "pcl-2-1", claimId: "c2", subcontractLineId: "scl-1", lineNumber: 1, claimedAmount: 800_000, approvedAmount: 800_000, createdAt: "", updatedAt: "" },
    ],
  });

  assert.throws(
    () => applySubcontractClaimTransition(
      claim2,
      "APPROVED",
      undefined,
      [{ claimLineId: "pcl-2-1", approvedAmount: 800_000 }],
      sc,
      [existingApproved],
    ),
    /Cumulative approved amount .* exceeds subcontract line .* amount/,
  );

  // Line approved amount exceeding claimed amount
  assert.throws(
    () => applySubcontractClaimTransition(
      claim2,
      "APPROVED",
      undefined,
      [{ claimLineId: "pcl-2-1", approvedAmount: 850_000 }], // claimed is 800k
      sc,
      [existingApproved],
    ),
    /exceeds claimed amount/,
  );
});

test("multi-currency isolation keeps PHP progress claims separate from foreign commitments", () => {
  const phpSc: Subcontract = {
    id: "sc-php",
    subcontractNumber: "SC-PHP-01",
    vendorId: "vendor-1",
    projectId: "proj-1",
    title: "Masonry Works",
    currency: "PHP",
    status: "ACTIVE",
    originalAmount: 1_000_000,
    lines: [
      {
        id: "scl-php-1",
        subcontractId: "sc-php",
        lineNumber: 1,
        description: "Brick laying",
        amount: 1_000_000,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  const usdSc: Subcontract = {
    id: "sc-usd",
    subcontractNumber: "SC-USD-01",
    vendorId: "vendor-2",
    projectId: "proj-1",
    title: "Specialist Equipment Import",
    currency: "USD",
    status: "ACTIVE",
    originalAmount: 20_000,
    lines: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  const phpClaim = createMockClaim({
    subcontractId: "sc-php",
    currency: "PHP",
    status: "APPROVED",
    approvedGrossAmount: 600_000,
    retentionAmount: 60_000,
  });

  const summary = calculateProjectCost(mockProject, {
    invoices: [],
    expenses: [],
    payroll: [],
    subcontracts: [phpSc, usdSc],
    subcontractClaims: [phpClaim],
  });

  // PHP committed cost = 1,000,000 - 600,000 = 400,000
  assert.equal(summary.committedCost, 400_000);
  assert.equal(summary.certifiedSubcontractCost, 600_000);
  assert.equal(summary.retentionHeldCost, 60_000);

  // Foreign currency stays isolated as dedicated commitment
  assert.equal(summary.foreignCosts?.USD, 20_000);
});
