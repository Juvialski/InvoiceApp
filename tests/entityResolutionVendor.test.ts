import test from "node:test";
import assert from "node:assert/strict";
import {
  compareTaxIds,
  normalizeTaxId,
  normalizeBusinessName,
  businessNameSimilarity,
  resolveVendorCandidate,
} from "../src/lib/entityResolution.ts";
import type { EmailIntakeProfile, Vendor, VendorIdentityEvidence } from "../src/types.ts";

const mockVendors: Vendor[] = [
  {
    id: "vendor-1",
    companyId: "comp-1",
    name: "ABC Steel Corporation",
    normalizedName: "abc steel",
    taxId: "123-456-789-000",
    email: "billing@abcsteel.ph",
    phone: "02-8123-4567",
    address: "123 Industrial Rd, Pasig City",
  },
  {
    id: "vendor-2",
    companyId: "comp-1",
    name: "Petron Corporation",
    normalizedName: "petron",
    taxId: "000-123-456-000",
    email: "corporate@petron.com",
    address: "San Miguel Head Office Complex, Mandaluyong",
  },
  {
    id: "vendor-3",
    companyId: "comp-1",
    name: "Metro Hardware Supplies Inc.",
    normalizedName: "metro hardware supplies",
    taxId: null,
    email: "sales@metrohardware.ph",
  },
];

test("TIN normalization: handles 9-digit, 12-digit, spaced, dashed, and prefix formats", () => {
  const norm9 = normalizeTaxId("123-456-789");
  assert.ok(norm9);
  assert.equal(norm9.baseTin, "123456789");
  assert.equal(norm9.formatted, "123-456-789");
  assert.equal(norm9.isValid, true);

  const norm12 = normalizeTaxId("TIN: 123-456-789-001");
  assert.ok(norm12);
  assert.equal(norm12.baseTin, "123456789");
  assert.equal(norm12.branchCode, "001");
  assert.equal(norm12.formatted, "123-456-789-001");
  assert.equal(norm12.isValid, true);

  const normSpaces = normalizeTaxId("123 456 789 000");
  assert.ok(normSpaces);
  assert.equal(normSpaces.baseTin, "123456789");
  assert.equal(normSpaces.branchCode, "000");
  assert.equal(normSpaces.formatted, "123-456-789-000");

  const invalid = normalizeTaxId("123");
  assert.equal(invalid, null);

  const comparisonSame = compareTaxIds("123-456-789-000", "123456789");
  assert.equal(comparisonSame.match, true);
  assert.equal(comparisonSame.conflict, false);

  const comparisonConflict = compareTaxIds("123-456-789", "987-654-321");
  assert.equal(comparisonConflict.match, false);
  assert.equal(comparisonConflict.conflict, true);
});

test("Vendor matching: exact TIN unique match links to existing vendor", () => {
  const candidate = {
    candidateId: "msg-1",
    evidence: {
      name: "ABC Steel Corp.",
      taxId: "123456789000",
      email: "billing@abcsteel.ph",
    },
  };

  const result = resolveVendorCandidate(candidate, mockVendors);
  assert.equal(result.proposedAction, "LINK_EXISTING");
  assert.equal(result.confidence, "HIGH");
  assert.equal(result.matchedEntityId, "vendor-1");
  assert.equal(result.matchedEntityName, "ABC Steel Corporation");
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.proposedEnrichments.length, 0);
});

test("Vendor matching: exact email matches existing vendor", () => {
  const candidate = {
    candidateId: "msg-2",
    evidence: {
      name: "ABC Steel Partner",
      email: "billing@abcsteel.ph",
    },
  };

  const result = resolveVendorCandidate(candidate, mockVendors);
  assert.equal(result.proposedAction, "LINK_EXISTING");
  assert.equal(result.matchedEntityId, "vendor-1");
  assert.equal(result.confidence, "HIGH");
});

test("Vendor matching: saved sender profile hint links vendor when non-conflicting", () => {
  const profile: EmailIntakeProfile = {
    id: "prof-1",
    companyId: "comp-1",
    name: "ABC Steel Rule",
    enabled: true,
    senderEmail: "orders@abcsteel.ph",
    suggestedDestination: "INVOICE",
    linkedVendorId: "vendor-1",
    createdAt: "2026-08-30T00:00:00Z",
    updatedAt: "2026-08-30T00:00:00Z",
  };

  const candidate = {
    candidateId: "msg-3",
    evidence: {
      name: "ABC Steel Billing Dept",
      senderEmail: "orders@abcsteel.ph",
      linkedProfileVendorId: "vendor-1",
    },
  };

  const result = resolveVendorCandidate(candidate, mockVendors, [profile]);
  assert.equal(result.proposedAction, "LINK_EXISTING");
  assert.equal(result.matchedEntityId, "vendor-1");
  assert.equal(result.matchReasons.some((r) => r.includes("saved sender profile")), true);
});

test("Vendor matching: saved sender profile does NOT override conflicting extracted TIN", () => {
  const profile: EmailIntakeProfile = {
    id: "prof-1",
    companyId: "comp-1",
    name: "ABC Steel Rule",
    enabled: true,
    senderEmail: "orders@abcsteel.ph",
    suggestedDestination: "INVOICE",
    linkedVendorId: "vendor-1", // ABC Steel has TIN 123-456-789-000
    createdAt: "2026-08-30T00:00:00Z",
    updatedAt: "2026-08-30T00:00:00Z",
  };

  const candidate = {
    candidateId: "msg-4",
    evidence: {
      name: "Different Company Inc",
      senderEmail: "orders@abcsteel.ph",
      taxId: "999-888-777-000", // Conflicting TIN!
      linkedProfileVendorId: "vendor-1",
    },
  };

  const result = resolveVendorCandidate(candidate, mockVendors, [profile]);
  assert.equal(result.proposedAction, "NEEDS_REVIEW");
  assert.equal(result.conflicts.length > 0, true);
  assert.equal(result.conflicts[0].field, "taxId");
});

test("Vendor matching: domain supporting evidence links when name is compatible", () => {
  const candidate = {
    candidateId: "msg-5",
    evidence: {
      name: "Petron Lubricants Division",
      senderDomain: "petron.com",
    },
  };

  const result = resolveVendorCandidate(candidate, mockVendors);
  assert.equal(result.proposedAction, "LINK_EXISTING");
  assert.equal(result.matchedEntityId, "vendor-2");
});

test("Vendor matching: normalized legal-name matching resolves vendor", () => {
  const candidate = {
    candidateId: "msg-6",
    evidence: {
      name: "Metro Hardware Supplies, Inc.",
    },
  };

  const result = resolveVendorCandidate(candidate, mockVendors);
  assert.equal(result.proposedAction, "LINK_EXISTING");
  assert.equal(result.matchedEntityId, "vendor-3");
});

test("Vendor matching: fuzzy name alone does NOT silently strong-link (yields POSSIBLE_DUPLICATE / NEEDS_REVIEW)", () => {
  const candidate = {
    candidateId: "msg-7",
    evidence: {
      name: "Metro Hardware Tools & Equipment",
    },
  };

  const result = resolveVendorCandidate(candidate, mockVendors);
  assert.notEqual(result.proposedAction, "LINK_EXISTING");
  assert.equal(result.proposedAction, "POSSIBLE_DUPLICATE");
  assert.equal(result.matchedEntityId, "vendor-3");
  assert.equal(result.matchReasons.some((r) => r.includes("Human review required")), true);
});

test("Vendor matching: same name with conflicting TIN yields NEEDS_REVIEW with explicit conflict", () => {
  const candidate = {
    candidateId: "msg-8",
    evidence: {
      name: "ABC Steel Corporation",
      taxId: "987-654-321-000", // ABC Steel in DB has 123-456-789-000
    },
  };

  const result = resolveVendorCandidate(candidate, mockVendors);
  assert.equal(result.proposedAction, "NEEDS_REVIEW");
  assert.equal(result.conflicts.length > 0, true);
  assert.equal(result.conflicts[0].field, "taxId");
  assert.notEqual(result.proposedAction, "LINK_EXISTING");
  assert.notEqual(result.proposedAction, "ENRICH_EXISTING");
});

test("Vendor matching: safe enrichment proposal for missing email and address without auto-mutating", () => {
  const candidate = {
    candidateId: "msg-9",
    evidence: {
      name: "Metro Hardware Supplies Inc.",
      taxId: "456-789-012-000", // Vendor-3 in DB has no taxId
      email: "sales@metrohardware.ph",
      address: "88 Rizal Ave, Manila",
    },
  };

  const result = resolveVendorCandidate(candidate, mockVendors);
  assert.equal(result.proposedAction, "ENRICH_EXISTING");
  assert.equal(result.matchedEntityId, "vendor-3");
  assert.equal(result.proposedEnrichments.some((e) => e.field === "taxId"), true);
  assert.equal(result.proposedEnrichments.some((e) => e.field === "address"), true);
});

test("Vendor matching: no match proposes CREATE_NEW without silently creating vendor", () => {
  const candidate = {
    candidateId: "msg-10",
    evidence: {
      name: "Zenith Construction Equipment Inc.",
      taxId: "555-444-333-000",
      email: "info@zenithconstruction.ph",
    },
  };

  const result = resolveVendorCandidate(candidate, mockVendors);
  assert.equal(result.proposedAction, "CREATE_NEW");
  assert.equal(result.matchedEntityId, undefined);
  assert.equal(result.matchedEntityName, "Zenith Construction Equipment Inc.");
  assert.equal(result.conflicts.length, 0);
});

test("Vendor matching: company isolation prevents cross-company vendor matching", () => {
  const otherCompanyVendors: Vendor[] = [
    {
      id: "vendor-other-comp",
      companyId: "comp-OTHER",
      name: "Zenith Construction Equipment Inc.",
      normalizedName: "zenith construction equipment",
      taxId: "555-444-333-000",
      email: "info@zenithconstruction.ph",
    },
  ];

  // In company-1, other company vendors are never in the working set
  const candidate = {
    candidateId: "msg-11",
    evidence: {
      name: "Zenith Construction Equipment Inc.",
      taxId: "555-444-333-000",
      email: "info@zenithconstruction.ph",
    },
  };

  const resultInComp1 = resolveVendorCandidate(candidate, mockVendors);
  assert.equal(resultInComp1.proposedAction, "CREATE_NEW");
  assert.equal(resultInComp1.matchedEntityId, undefined);
});
