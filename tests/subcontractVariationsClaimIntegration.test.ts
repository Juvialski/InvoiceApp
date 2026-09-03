import test from "node:test";
import assert from "node:assert/strict";
import type { Subcontract, SubcontractProgressClaim, SubcontractVariation } from "../src/types.ts";
import {
  applySubcontractClaimTransition,
  computeSubcontractClaimMetrics,
  normalizeClaimDraftInput,
} from "../src/lib/subcontractClaims.ts";

const mockSubcontract: Subcontract = {
  id: "sc-main",
  companyId: "company-1",
  subcontractNumber: "SC-MAIN-001",
  vendorId: "vendor-1",
  projectId: "proj-1",
  title: "Main Mechanical Subcontract",
  status: "APPROVED",
  currency: "PHP",
  originalAmount: 1000000,
  lines: [
    {
      id: "scl-1",
      companyId: "company-1",
      subcontractId: "sc-main",
      lineNumber: 1,
      description: "Chillers & Piping",
      amount: 700000,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "scl-2",
      companyId: "company-1",
      subcontractId: "sc-main",
      lineNumber: 2,
      description: "Air Distribution",
      amount: 300000,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const approvedVariation: SubcontractVariation = {
  id: "var-approved-1",
  companyId: "company-1",
  subcontractId: "sc-main",
  projectId: "proj-1",
  variationNumber: "VO-01",
  title: "Additional VAV Units",
  status: "APPROVED",
  currency: "PHP",
  netAmount: 200000,
  lines: [
    {
      id: "vl-vav",
      companyId: "company-1",
      subcontractVariationId: "var-approved-1",
      lineNumber: 1,
      description: "Supply and install 10 VAV terminal units",
      amount: 200000,
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    },
  ],
  createdAt: "2026-02-01T00:00:00Z",
  updatedAt: "2026-02-01T00:00:00Z",
};

const pendingVariation: SubcontractVariation = {
  id: "var-pending",
  companyId: "company-1",
  subcontractId: "sc-main",
  projectId: "proj-1",
  variationNumber: "VO-PENDING",
  title: "Pending Variation",
  status: "SUBMITTED",
  currency: "PHP",
  netAmount: 100000,
  lines: [
    {
      id: "vl-pending",
      companyId: "company-1",
      subcontractVariationId: "var-pending",
      lineNumber: 1,
      description: "Unapproved scope addition",
      amount: 100000,
      createdAt: "2026-02-05T00:00:00Z",
      updatedAt: "2026-02-05T00:00:00Z",
    },
  ],
  createdAt: "2026-02-05T00:00:00Z",
  updatedAt: "2026-02-05T00:00:00Z",
};

test("computeSubcontractClaimMetrics incorporates approved variations into revisedSubcontractValue and remainingCommitment", () => {
  const metricsBefore = computeSubcontractClaimMetrics(mockSubcontract, [], []);
  assert.equal(metricsBefore.originalAmount, 1000000);
  assert.equal(metricsBefore.netApprovedVariations, 0);
  assert.equal(metricsBefore.revisedSubcontractValue, 1000000);
  assert.equal(metricsBefore.remainingCommitment, 1000000);

  // When approved variation (200k) and pending variation (100k) exist:
  const metricsWithVariations = computeSubcontractClaimMetrics(
    mockSubcontract,
    [],
    [approvedVariation, pendingVariation],
  );

  // Only approved variation counts
  assert.equal(metricsWithVariations.originalAmount, 1000000);
  assert.equal(metricsWithVariations.netApprovedVariations, 200000);
  assert.equal(metricsWithVariations.revisedSubcontractValue, 1200000);
  assert.equal(metricsWithVariations.remainingCommitment, 1200000);

  // Standalone approved variation line metric is tracked
  const varLineMetric = metricsWithVariations.variationLines.get("vl-vav");
  assert.ok(varLineMetric);
  assert.equal(varLineMetric.lineAmount, 200000);
  assert.equal(varLineMetric.cumulativeApproved, 0);
  assert.equal(varLineMetric.remainingClaimable, 200000);
});

test("claims draft normalization allows claiming against approved variation lines", () => {
  const normalized = normalizeClaimDraftInput(
    {
      subcontractId: "sc-main",
      projectId: "proj-1",
      claimNumber: "CLM-VAR-01",
      valuationDate: "2026-02-15",
    },
    [
      {
        subcontractVariationLineId: "vl-vav",
        claimedAmount: 150000,
        notes: "75% completed VAV units",
      },
    ],
  );

  assert.equal(normalized.claimNumber, "CLM-VAR-01");
  assert.equal(normalized.lines.length, 1);
  assert.equal(normalized.lines[0]?.claimedAmount, 150000);
  assert.equal(normalized.lines[0]?.subcontractVariationLineId, "vl-vav");
  assert.equal(normalized.lines[0]?.subcontractLineId, null);
});

test("applySubcontractClaimTransition allows claims against approved variation lines up to authorized amount", () => {
  const claim: SubcontractProgressClaim = {
    id: "claim-var-1",
    companyId: "company-1",
    subcontractId: "sc-main",
    projectId: "proj-1",
    claimNumber: "SC-CLM-01",
    status: "SUBMITTED",
    valuationDate: "2026-02-15",
    claimedGrossAmount: 180000,
    approvedGrossAmount: 0,
    retentionRate: 0.1,
    retentionAmount: 0,
    netCertifiedAmount: 0,
    lines: [
      {
        id: "cl-vav-1",
        companyId: "company-1",
        claimId: "claim-var-1",
        subcontractVariationLineId: "vl-vav",
        lineNumber: 1,
        claimedAmount: 180000,
        approvedAmount: 0,
        createdAt: "2026-02-15T00:00:00Z",
        updatedAt: "2026-02-15T00:00:00Z",
      },
    ],
    createdAt: "2026-02-15T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
  };

  const approvedClaim = applySubcontractClaimTransition(
    claim,
    "APPROVED",
    undefined,
    [{ claimLineId: "cl-vav-1", approvedAmount: 180000 }],
    mockSubcontract,
    [],
    [approvedVariation],
  );

  assert.equal(approvedClaim.status, "APPROVED");
  assert.equal(approvedClaim.approvedGrossAmount, 180000);
  assert.equal(approvedClaim.retentionAmount, 18000);
  assert.equal(approvedClaim.netCertifiedAmount, 162000);
  assert.equal(approvedClaim.lines?.[0]?.approvedAmount, 180000);
});

test("applySubcontractClaimTransition rejects claims that exceed variation line amount", () => {
  const claim: SubcontractProgressClaim = {
    id: "claim-var-excess",
    companyId: "company-1",
    subcontractId: "sc-main",
    projectId: "proj-1",
    claimNumber: "SC-CLM-EXCESS",
    status: "SUBMITTED",
    valuationDate: "2026-02-15",
    claimedGrossAmount: 250000,
    approvedGrossAmount: 0,
    retentionRate: 0.1,
    retentionAmount: 0,
    netCertifiedAmount: 0,
    lines: [
      {
        id: "cl-vav-excess",
        companyId: "company-1",
        claimId: "claim-var-excess",
        subcontractVariationLineId: "vl-vav", // authorized amount is only 200,000!
        lineNumber: 1,
        claimedAmount: 250000,
        approvedAmount: 0,
        createdAt: "2026-02-15T00:00:00Z",
        updatedAt: "2026-02-15T00:00:00Z",
      },
    ],
    createdAt: "2026-02-15T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
  };

  assert.throws(() => {
    applySubcontractClaimTransition(
      claim,
      "APPROVED",
      undefined,
      [{ claimLineId: "cl-vav-excess", approvedAmount: 250000 }],
      mockSubcontract,
      [],
      [approvedVariation],
    );
  }, /exceeds variation line amount/);
});

test("applySubcontractClaimTransition rejects claims against non-approved variations", () => {
  const claimAgainstPending: SubcontractProgressClaim = {
    id: "claim-pending-var",
    companyId: "company-1",
    subcontractId: "sc-main",
    projectId: "proj-1",
    claimNumber: "SC-CLM-PENDING",
    status: "SUBMITTED",
    valuationDate: "2026-02-15",
    claimedGrossAmount: 50000,
    approvedGrossAmount: 0,
    retentionRate: 0.1,
    retentionAmount: 0,
    netCertifiedAmount: 0,
    lines: [
      {
        id: "cl-pending",
        companyId: "company-1",
        claimId: "claim-pending-var",
        subcontractVariationLineId: "vl-pending", // belongs to SUBMITTED variation
        lineNumber: 1,
        claimedAmount: 50000,
        approvedAmount: 0,
        createdAt: "2026-02-15T00:00:00Z",
        updatedAt: "2026-02-15T00:00:00Z",
      },
    ],
    createdAt: "2026-02-15T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
  };

  assert.throws(() => {
    applySubcontractClaimTransition(
      claimAgainstPending,
      "APPROVED",
      undefined,
      [{ claimLineId: "cl-pending", approvedAmount: 50000 }],
      mockSubcontract,
      [],
      [approvedVariation, pendingVariation],
    );
  }, /Cannot claim unapproved variation scope/);
});

test("applySubcontractClaimTransition rejects cumulative claims that exceed Revised Subcontract Value", () => {
  // Base 1,000,000 + Variation 200,000 = Revised Value 1,200,000.
  // Prior approved claim = 1,150,000 (700k on scl-1, 300k on scl-2, 150k on vl-vav).
  const priorApprovedClaim: SubcontractProgressClaim = {
    id: "claim-prior",
    companyId: "company-1",
    subcontractId: "sc-main",
    projectId: "proj-1",
    claimNumber: "SC-CLM-01",
    status: "APPROVED",
    valuationDate: "2026-02-01",
    claimedGrossAmount: 1150000,
    approvedGrossAmount: 1150000,
    retentionRate: 0.1,
    retentionAmount: 115000,
    netCertifiedAmount: 1035000,
    lines: [
      {
        id: "cl-p1",
        companyId: "company-1",
        claimId: "claim-prior",
        subcontractLineId: "scl-1",
        lineNumber: 1,
        claimedAmount: 700000,
        approvedAmount: 700000,
        createdAt: "2026-02-01T00:00:00Z",
        updatedAt: "2026-02-01T00:00:00Z",
      },
      {
        id: "cl-p2",
        companyId: "company-1",
        claimId: "claim-prior",
        subcontractLineId: "scl-2",
        lineNumber: 2,
        claimedAmount: 300000,
        approvedAmount: 300000,
        createdAt: "2026-02-01T00:00:00Z",
        updatedAt: "2026-02-01T00:00:00Z",
      },
      {
        id: "cl-p3",
        companyId: "company-1",
        claimId: "claim-prior",
        subcontractVariationLineId: "vl-vav",
        lineNumber: 3,
        claimedAmount: 150000,
        approvedAmount: 150000,
        createdAt: "2026-02-01T00:00:00Z",
        updatedAt: "2026-02-01T00:00:00Z",
      },
    ],
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
  };

  // Now attempting to claim remaining 50,000 on vl-vav + another line that would push total over 1,200,000
  // Line vl-vav has 50k remaining (200k - 150k). If we approve 50k on vl-vav, cumulative is 1,200,000.
  // If we try to approve 51k, it fails line check. But if we try to approve when prior claims already totaled 1.2M, contract-level triggers!
  // Let's create another variation so line has room, but contract limit is breached:
  const largeLineVariation: SubcontractVariation = {
    ...approvedVariation,
    lines: [
      {
        id: "vl-vav",
        companyId: "company-1",
        subcontractVariationId: "var-approved-1",
        lineNumber: 1,
        description: "Supply and install 10 VAV terminal units",
        amount: 250000, // Line has 250k room
        createdAt: "2026-02-01T00:00:00Z",
        updatedAt: "2026-02-01T00:00:00Z",
      },
    ],
    netAmount: 200000, // Header revised value is only 1,200,000
  };

  const newClaim: SubcontractProgressClaim = {
    id: "claim-over-contract",
    companyId: "company-1",
    subcontractId: "sc-main",
    projectId: "proj-1",
    claimNumber: "SC-CLM-02",
    status: "SUBMITTED",
    valuationDate: "2026-02-15",
    claimedGrossAmount: 80000,
    approvedGrossAmount: 0,
    retentionRate: 0.1,
    retentionAmount: 0,
    netCertifiedAmount: 0,
    lines: [
      {
        id: "cl-new",
        companyId: "company-1",
        claimId: "claim-over-contract",
        subcontractVariationLineId: "vl-vav",
        lineNumber: 1,
        claimedAmount: 80000, // 150k prior + 80k = 230k (< 250k line amount, but 1150k + 80k = 1230k > 1200k contract!)
        approvedAmount: 0,
        createdAt: "2026-02-15T00:00:00Z",
        updatedAt: "2026-02-15T00:00:00Z",
      },
    ],
    createdAt: "2026-02-15T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
  };

  assert.throws(() => {
    applySubcontractClaimTransition(
      newClaim,
      "APPROVED",
      undefined,
      [{ claimLineId: "cl-new", approvedAmount: 80000 }],
      mockSubcontract,
      [priorApprovedClaim],
      [largeLineVariation],
    );
  }, /Cumulative approved claims .* exceeds revised subcontract value/);
});
