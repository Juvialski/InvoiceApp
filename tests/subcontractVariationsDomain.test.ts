import test from "node:test";
import assert from "node:assert/strict";
import type { Subcontract, SubcontractProgressClaim, SubcontractVariation, SubcontractVariationLine } from "../src/types.ts";
import {
  calculateNetApprovedVariations,
  calculateRevisedSubcontractValue,
  calculateRemainingSubcontractCommitment,
  normalizeVariationDraftInput,
  buildLocalSubcontractVariation,
  applySubcontractVariationTransition,
  roundMoney,
  readSubcontractVariationsFromLocal,
  writeSubcontractVariationsToLocal,
  saveSubcontractVariation,
  transitionSubcontractVariation,
  deleteDraftSubcontractVariation,
} from "../src/lib/subcontractVariations.ts";

const mockSubcontract: Subcontract = {
  id: "sc-001",
  companyId: "company-1",
  subcontractNumber: "SC-2026-001",
  vendorId: "vendor-1",
  projectId: "proj-1",
  title: "HVAC Installation Subcontract",
  status: "APPROVED",
  currency: "PHP",
  originalAmount: 1000000,
  lines: [
    {
      id: "scl-001",
      companyId: "company-1",
      subcontractId: "sc-001",
      lineNumber: 1,
      description: "Chiller Unit Installation",
      amount: 600000,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "scl-002",
      companyId: "company-1",
      subcontractId: "sc-001",
      lineNumber: 2,
      description: "Ductwork & Diffusers",
      amount: 400000,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

test("calculateNetApprovedVariations correctly sums only APPROVED variations", () => {
  const variations: SubcontractVariation[] = [
    {
      id: "var-1",
      companyId: "company-1",
      subcontractId: "sc-001",
      projectId: "proj-1",
      variationNumber: "VO-001",
      title: "Additional VAV Boxes",
      status: "APPROVED",
      netAmount: 150000,
      lines: [],
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    },
    {
      id: "var-2",
      companyId: "company-1",
      subcontractId: "sc-001",
      projectId: "proj-1",
      variationNumber: "VO-002",
      title: "Scope Omission - Reduced Chiller Size",
      status: "APPROVED",
      netAmount: -50000,
      lines: [],
      createdAt: "2026-02-05T00:00:00Z",
      updatedAt: "2026-02-05T00:00:00Z",
    },
    {
      id: "var-3",
      companyId: "company-1",
      subcontractId: "sc-001",
      projectId: "proj-1",
      variationNumber: "VO-003",
      title: "Pending Variation",
      status: "SUBMITTED",
      netAmount: 80000,
      lines: [],
      createdAt: "2026-02-10T00:00:00Z",
      updatedAt: "2026-02-10T00:00:00Z",
    },
    {
      id: "var-4",
      companyId: "company-1",
      subcontractId: "sc-001",
      projectId: "proj-1",
      variationNumber: "VO-004",
      title: "Rejected Variation",
      status: "REJECTED",
      netAmount: 120000,
      lines: [],
      createdAt: "2026-02-12T00:00:00Z",
      updatedAt: "2026-02-12T00:00:00Z",
    },
  ];

  const netApproved = calculateNetApprovedVariations(variations);
  assert.equal(netApproved, 100000); // 150000 + (-50000) = 100000

  const revisedSubcontractValue = calculateRevisedSubcontractValue(mockSubcontract.originalAmount, variations);
  assert.equal(revisedSubcontractValue, 1100000); // 1000000 + 100000 = 1100000
});

test("calculateRemainingSubcontractCommitment deducts certified gross work from revised value", () => {
  const revisedValue = 1100000;
  const certifiedGross = 450000;
  const remaining = calculateRemainingSubcontractCommitment(revisedValue, certifiedGross);
  assert.equal(remaining, 650000);

  // Over-certified or equal bounds to zero
  assert.equal(calculateRemainingSubcontractCommitment(100000, 150000), 0);
});

test("normalizeVariationDraftInput validates variation and line requirements", () => {
  // Valid draft
  const valid = normalizeVariationDraftInput(
    {
      subcontractId: "sc-001",
      projectId: "proj-1",
      variationNumber: "VO-001",
      title: "Add fresh air dampers",
    },
    [
      {
        description: "Fresh air motorized dampers",
        amount: 35000,
      },
    ],
  );
  assert.equal(valid.variationNumber, "VO-001");
  assert.equal(valid.lines[0]?.amount, 35000);
  assert.equal(valid.lines.length, 1);

  // Missing variation number throws
  assert.throws(() => {
    normalizeVariationDraftInput(
      {
        subcontractId: "sc-001",
        projectId: "proj-1",
        variationNumber: "",
        title: "Test",
      },
      [{ description: "test", amount: 100 }],
    );
  }, /Variation number is required/);

  // Missing lines throws
  assert.throws(() => {
    normalizeVariationDraftInput(
      {
        subcontractId: "sc-001",
        projectId: "proj-1",
        variationNumber: "VO-001",
        title: "Test",
      },
      [],
    );
  }, /At least one variation line item is required/i);

  // Zero amount line throws
  assert.throws(() => {
    normalizeVariationDraftInput(
      {
        subcontractId: "sc-001",
        projectId: "proj-1",
        variationNumber: "VO-001",
        title: "Test",
      },
      [{ description: "zero line", amount: 0 }],
    );
  }, /cannot be zero/);
});

test("applySubcontractVariationTransition enforces valid lifecycle progression", () => {
  const draftVariation: SubcontractVariation = {
    id: "var-100",
    companyId: "company-1",
    subcontractId: "sc-001",
    projectId: "proj-1",
    variationNumber: "VO-100",
    title: "Relocate condenser units",
    status: "DRAFT",
    netAmount: 45000,
    lines: [
      {
        id: "varl-100",
        companyId: "company-1",
        subcontractVariationId: "var-100",
        lineNumber: 1,
        description: "Relocate condenser units",
        amount: 45000,
        createdAt: "2026-02-01T00:00:00Z",
        updatedAt: "2026-02-01T00:00:00Z",
      },
    ],
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
  };

  // DRAFT -> SUBMITTED
  const submitted = applySubcontractVariationTransition(
    draftVariation,
    "SUBMITTED",
    undefined,
    mockSubcontract,
    [],
    [],
  );
  assert.equal(submitted.status, "SUBMITTED");
  assert.ok(submitted.submittedAt);

  // SUBMITTED -> APPROVED
  const approved = applySubcontractVariationTransition(
    submitted,
    "APPROVED",
    undefined,
    mockSubcontract,
    [],
    [],
  );
  assert.equal(approved.status, "APPROVED");
  assert.ok(approved.approvedAt);

  // Cannot approve directly from DRAFT without submission
  assert.throws(() => {
    applySubcontractVariationTransition(
      draftVariation,
      "APPROVED",
      undefined,
      mockSubcontract,
      [],
      [],
    );
  }, /Draft variations can only be submitted or cancelled/);

  // Rejecting requires reason
  assert.throws(() => {
    applySubcontractVariationTransition(
      submitted,
      "REJECTED",
      "   ",
      mockSubcontract,
      [],
      [],
    );
  }, /rejection reason is required/i);

  const rejected = applySubcontractVariationTransition(
    submitted,
    "REJECTED",
    "Scope covered in primary contract",
    mockSubcontract,
    [],
    [],
  );
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.rejectionReason, "Scope covered in primary contract");
});

test("applySubcontractVariationTransition prevents negative variations from reducing value below certified claims", () => {
  const approvedClaims: SubcontractProgressClaim[] = [
    {
      id: "claim-1",
      companyId: "company-1",
      subcontractId: "sc-001",
      projectId: "proj-1",
      claimNumber: "SC-CLM-01",
      status: "APPROVED",
      valuationDate: "2026-02-01",
      claimedGrossAmount: 850000,
      approvedGrossAmount: 850000,
      grossAmount: 850000,
      retentionRate: 0.1,
      retentionAmount: 85000,
      netCertifiedAmount: 765000,
      netAmount: 765000,
      lines: [
        {
          id: "cl-1",
          companyId: "company-1",
          subcontractClaimId: "claim-1",
          subcontractLineId: "scl-001",
          lineNumber: 1,
          claimedAmount: 550000,
          approvedAmount: 550000,
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        },
        {
          id: "cl-2",
          companyId: "company-1",
          subcontractClaimId: "claim-1",
          subcontractLineId: "scl-002",
          lineNumber: 2,
          claimedAmount: 300000,
          approvedAmount: 300000,
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        },
      ],
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    },
  ];

  // Primary contract = 1,000,000. Certified gross = 850,000.
  // Variation is negative -200,000 -> projected revised value = 800,000 (< 850,000 certified!)
  const excessiveNegativeVariation: SubcontractVariation = {
    id: "var-neg-1",
    companyId: "company-1",
    subcontractId: "sc-001",
    projectId: "proj-1",
    variationNumber: "VO-NEG-1",
    title: "Excessive Scope Reduction",
    status: "SUBMITTED",
    netAmount: -200000,
    lines: [
      {
        id: "varl-neg-1",
        companyId: "company-1",
        subcontractVariationId: "var-neg-1",
        lineNumber: 1,
        description: "Cancel chiller scope",
        amount: -200000,
        createdAt: "2026-02-15T00:00:00Z",
        updatedAt: "2026-02-15T00:00:00Z",
      },
    ],
    createdAt: "2026-02-15T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
  };

  assert.throws(() => {
    applySubcontractVariationTransition(
      excessiveNegativeVariation,
      "APPROVED",
      undefined,
      mockSubcontract,
      [],
      approvedClaims,
    );
  }, /Cannot approve negative variation: revised subcontract value .* would be less than certified claims gross/);
});

test("applySubcontractVariationTransition prevents linked negative line from reducing scope below line certified amount", () => {
  // Line 1 is 600,000. Certified on Line 1 is 550,000.
  // Variation reduces Line 1 by -100,000 -> revised Line 1 would be 500,000 (< 550,000!)
  const approvedClaims: SubcontractProgressClaim[] = [
    {
      id: "claim-1",
      companyId: "company-1",
      subcontractId: "sc-001",
      projectId: "proj-1",
      claimNumber: "SC-CLM-01",
      status: "APPROVED",
      valuationDate: "2026-02-01",
      claimedGrossAmount: 550000,
      approvedGrossAmount: 550000,
      grossAmount: 550000,
      retentionRate: 0.1,
      retentionAmount: 55000,
      netCertifiedAmount: 495000,
      netAmount: 495000,
      lines: [
        {
          id: "cl-1",
          companyId: "company-1",
          subcontractClaimId: "claim-1",
          subcontractLineId: "scl-001",
          lineNumber: 1,
          claimedAmount: 550000,
          approvedAmount: 550000,
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        },
      ],
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    },
  ];

  const excessiveLineReduction: SubcontractVariation = {
    id: "var-neg-line",
    companyId: "company-1",
    subcontractId: "sc-001",
    projectId: "proj-1",
    variationNumber: "VO-NEG-LINE",
    title: "Chiller Scope Omission",
    status: "SUBMITTED",
    netAmount: -100000,
    lines: [
      {
        id: "varl-neg-1",
        companyId: "company-1",
        subcontractVariationId: "var-neg-line",
        subcontractLineId: "scl-001", // linked to Line 1
        lineNumber: 1,
        description: "Deduct chiller accessories",
        amount: -100000,
        createdAt: "2026-02-15T00:00:00Z",
        updatedAt: "2026-02-15T00:00:00Z",
      },
    ],
    createdAt: "2026-02-15T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
  };

  assert.throws(() => {
    applySubcontractVariationTransition(
      excessiveLineReduction,
      "APPROVED",
      undefined,
      mockSubcontract,
      [],
      approvedClaims,
    );
  }, /Cannot approve negative variation: revised scope for subcontract line .* would be less than certified amount/);
});

test("local storage and client persistence API operate correctly for variations", async () => {
  // Clear any pre-existing local variations
  writeSubcontractVariationsToLocal([]);

  // Save new draft variation
  const saved = await saveSubcontractVariation(
    {
      subcontractId: "sc-001",
      projectId: "proj-1",
      variationNumber: "VO-TEST-01",
      title: "Add sound attenuators",
      currency: "PHP",
    },
    [
      {
        description: "Sound attenuators 500mm",
        amount: 75000,
      },
    ],
  );

  assert.equal(saved.variationNumber, "VO-TEST-01");
  assert.equal(saved.status, "DRAFT");
  assert.equal(saved.netAmount, 75000);

  const list = readSubcontractVariationsFromLocal();
  assert.equal(list.length, 1);
  assert.equal(list[0]?.id, saved.id);

  // Transition draft -> submitted
  const submitted = await transitionSubcontractVariation(
    saved.id,
    "SUBMITTED",
    undefined,
    mockSubcontract,
    [],
    [],
  );
  assert.equal(submitted.status, "SUBMITTED");

  // Cannot delete submitted variation
  await assert.rejects(async () => {
    await deleteDraftSubcontractVariation(saved.id);
  }, /Only draft variations may be deleted/);

  // Transition submitted -> rejected
  const rejected = await transitionSubcontractVariation(
    saved.id,
    "REJECTED",
    "Not accepted by client",
    mockSubcontract,
    [],
    [],
  );
  assert.equal(rejected.status, "REJECTED");
});
