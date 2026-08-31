import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveBatchVendors,
  resolveBatchFinancialAccounts,
  resolveVendorCandidate,
  resolveFinancialAccountCandidate,
  normalizeTaxId,
  compareTaxIds,
  normalizeBusinessName,
} from "../src/lib/entityResolution.ts";
import type {
  EmailIntakeProfile,
  Vendor,
  VendorIdentityEvidence,
  FinancialAccountIdentityEvidence,
} from "../src/types.ts";
import type { FinancialAccount } from "../src/lib/cashBanking.ts";

const sampleVendors: Vendor[] = [
  {
    id: "v-100",
    companyId: "company-main",
    name: "Pacific Heavy Industries Inc.",
    normalizedName: "pacific heavy industries",
    taxId: "222-333-444-000",
    email: "accounting@pacificheavy.ph",
    phone: "02-8888-0000",
    address: "BGC Taguig City",
  },
  {
    id: "v-200",
    companyId: "company-main",
    name: "Meralco (Manila Electric Company)",
    normalizedName: "manila electric company",
    taxId: "000-101-202-000",
    email: "ebill@meralco.com.ph",
  },
];

const sampleAccounts: FinancialAccount[] = [
  {
    id: "acc-mbtc-1",
    companyId: "company-main",
    accountType: "BANK",
    institutionCode: "METROBANK",
    institutionName: "Metrobank",
    displayName: "Metrobank Main Operating",
    maskedIdentifier: "•••• 6543",
    currency: "PHP",
    openingBalance: 500000,
    openingBalanceDate: "2026-01-01",
    connectionType: "STATEMENT",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

test("Phase 4B Integration: Full Vendor Resolution Pipeline with Profile Link and Enrichment", () => {
  const profile: EmailIntakeProfile = {
    id: "prof-meralco",
    companyId: "company-main",
    name: "Meralco Monthly Utility Rule",
    enabled: true,
    senderEmail: "ebill@meralco.com.ph",
    suggestedDestination: "INVOICE",
    linkedVendorId: "v-200",
    createdAt: "2026-08-31T00:00:00Z",
    updatedAt: "2026-08-31T00:00:00Z",
  };

  const incomingInvoiceCandidate = {
    candidateId: "cand-meralco-aug",
    evidence: {
      name: "Manila Electric Co.",
      senderEmail: "ebill@meralco.com.ph",
      matchedProfileId: "prof-meralco",
      linkedProfileVendorId: "v-200",
      taxId: "000-101-202-000",
      phone: "16211", // New phone to propose enriching
      address: "Ortigas Avenue, Pasig City", // New address to propose enriching
    },
  };

  const result = resolveVendorCandidate(incomingInvoiceCandidate, sampleVendors, [profile]);

  assert.equal(result.proposedAction, "ENRICH_EXISTING");
  assert.equal(result.matchedEntityId, "v-200");
  assert.equal(result.matchedEntityName, "Meralco (Manila Electric Company)");
  assert.equal(result.conflicts.length, 0);

  // Proposes enriching phone and address because existing v-200 has none
  assert.ok(result.proposedEnrichments.some((e) => e.field === "phone" && e.proposedValue === "16211"));
  assert.ok(result.proposedEnrichments.some((e) => e.field === "address" && e.proposedValue.includes("Ortigas")));

  // Non-mutation invariant: database mock was NOT altered
  assert.equal(sampleVendors[1].phone, undefined);
});

test("Phase 4B Integration: Batch Statement Resolution Collapses Unseen Bank Statements into 1 Group", () => {
  const statements = [
    {
      candidateId: "stmt-bdo-jan",
      evidence: {
        institutionName: "Banco De Oro Unibank Inc",
        maskedIdentifier: "9876",
        currency: "PHP",
      },
    },
    {
      candidateId: "stmt-bdo-feb",
      evidence: {
        institutionName: "BDO",
        maskedIdentifier: "9876",
        currency: "PHP",
      },
    },
  ];

  const { resolutions, groups } = resolveBatchFinancialAccounts(statements, sampleAccounts);

  assert.equal(Object.keys(groups).length, 1);
  const grpKey = Object.keys(groups)[0];
  assert.equal(groups[grpKey].length, 2);

  assert.equal(resolutions["stmt-bdo-jan"].proposedAction, "CREATE_NEW");
  assert.equal(resolutions["stmt-bdo-feb"].proposedAction, "CREATE_NEW");
  assert.equal(resolutions["stmt-bdo-jan"].matchedEntityName, "BDO Unibank •••• 9876");
});

test("Phase 4B Integration: Hard conflict (conflicting TIN) prevents silent linking and surfaces explicit review alert", () => {
  const incomingInvoiceCandidate = {
    candidateId: "cand-spoofed",
    evidence: {
      name: "Pacific Heavy Industries",
      taxId: "999-999-999-000", // Conflicting TIN! Real is 222-333-444-000
      senderEmail: "fake@pacificheavy-impostor.ph",
    },
  };

  const result = resolveVendorCandidate(incomingInvoiceCandidate, sampleVendors);

  assert.equal(result.proposedAction, "NEEDS_REVIEW");
  assert.ok(result.conflicts.length > 0);
  assert.equal(result.conflicts[0].field, "taxId");
  assert.notEqual(result.proposedAction, "LINK_EXISTING");
  assert.notEqual(result.proposedAction, "ENRICH_EXISTING");
});
