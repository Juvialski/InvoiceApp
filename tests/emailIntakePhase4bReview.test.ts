import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeBusinessName,
  normalizeTaxId,
  resolveFinancialAccountCandidate,
  resolveVendorCandidate,
} from "../src/lib/entityResolution.ts";
import type { EmailIntakeProfile, Vendor } from "../src/types.ts";
import type { FinancialAccount } from "../src/lib/cashBanking.ts";

const vendorA: Vendor = {
  id: "vendor-a",
  companyId: "company-1",
  name: "ABC Trading Corporation",
  normalizedName: "abc trading",
  taxId: "123-456-789-000",
  email: "billing@abctrading.example",
};

const vendorB: Vendor = {
  id: "vendor-b",
  companyId: "company-1",
  name: "ABC Services Corporation",
  normalizedName: "abc services",
  taxId: "987-654-321-000",
  email: "billing@abcservices.example",
};

const account: FinancialAccount = {
  id: "account-bpi",
  companyId: "company-1",
  accountType: "BANK",
  institutionCode: "BPI",
  institutionName: "Bank of the Philippine Islands",
  displayName: "BPI Operating",
  maskedIdentifier: "•••• 1234",
  currency: "PHP",
  openingBalance: 0,
  openingBalanceDate: "2026-01-01",
  connectionType: "STATEMENT",
  active: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

test("Phase 4B review: descriptive business words remain part of normalized identity", () => {
  assert.equal(normalizeBusinessName("ABC Trading Corporation"), "abc trading");
  assert.equal(normalizeBusinessName("ABC Services Corporation"), "abc services");
  assert.notEqual(normalizeBusinessName("ABC Trading Corporation"), normalizeBusinessName("ABC Services Corporation"));
});

test("Phase 4B review: malformed long TINs are not truncated into authoritative matches", () => {
  assert.equal(normalizeTaxId("123-456-789-0009"), null);
  assert.equal(normalizeTaxId("12345678901"), null);
});

test("Phase 4B review: an unrelated linked sender profile cannot hijack a candidate", () => {
  const unrelatedProfile: EmailIntakeProfile = {
    id: "unrelated-profile",
    companyId: "company-1",
    name: "Unrelated sender",
    enabled: true,
    senderEmail: "other@unrelated.example",
    suggestedDestination: "INVOICE",
    linkedVendorId: "vendor-a",
    createdAt: "2026-08-31T00:00:00Z",
    updatedAt: "2026-08-31T00:00:00Z",
  };

  const result = resolveVendorCandidate({
    candidateId: "candidate-b",
    evidence: {
      name: "ABC Services Corporation",
      senderEmail: "billing@abcservices.example",
    },
  }, [vendorA, vendorB], [unrelatedProfile]);

  assert.equal(result.matchedEntityId, "vendor-b");
  assert.notEqual(result.matchedEntityId, "vendor-a");
});

test("Phase 4B review: only the candidate's matched profile can supply a vendor link", () => {
  const linkedProfile: EmailIntakeProfile = {
    id: "matched-profile",
    companyId: "company-1",
    name: "Matched sender",
    enabled: true,
    senderEmail: "billing@abctrading.example",
    suggestedDestination: "INVOICE",
    linkedVendorId: "vendor-a",
    createdAt: "2026-08-31T00:00:00Z",
    updatedAt: "2026-08-31T00:00:00Z",
  };

  const result = resolveVendorCandidate({
    candidateId: "candidate-a",
    evidence: {
      name: "ABC Trading Billing",
      senderEmail: "billing@abctrading.example",
      matchedProfileId: "matched-profile",
    },
  }, [vendorA, vendorB], [linkedProfile]);

  assert.equal(result.matchedEntityId, "vendor-a");
});

test("Phase 4B review: linked account profile cannot override conflicting institution or suffix", () => {
  const profile: EmailIntakeProfile = {
    id: "bpi-profile",
    companyId: "company-1",
    name: "BPI statement",
    enabled: true,
    senderEmail: "statements@bpi.example",
    suggestedDestination: "BANK_STATEMENT",
    linkedFinancialAccountId: "account-bpi",
    createdAt: "2026-08-31T00:00:00Z",
    updatedAt: "2026-08-31T00:00:00Z",
  };

  const institutionConflict = resolveFinancialAccountCandidate({
    candidateId: "statement-bdo",
    evidence: {
      institutionName: "BDO",
      maskedIdentifier: "1234",
      currency: "PHP",
      matchedProfileId: "bpi-profile",
    },
  }, [account], [profile]);
  assert.equal(institutionConflict.proposedAction, "NEEDS_REVIEW");
  assert.ok(institutionConflict.conflicts.some((item) => item.field === "institution"));

  const suffixConflict = resolveFinancialAccountCandidate({
    candidateId: "statement-bpi-other",
    evidence: {
      institutionName: "BPI",
      maskedIdentifier: "9999",
      currency: "PHP",
      matchedProfileId: "bpi-profile",
    },
  }, [account], [profile]);
  assert.equal(suffixConflict.proposedAction, "NEEDS_REVIEW");
  assert.ok(suffixConflict.conflicts.some((item) => item.field === "accountSuffix"));
});

test("Gmail reconnect review: provider-token invalidation is wired back into React session state", () => {
  const supabaseSource = readFileSync("src/lib/supabase.ts", "utf8");
  const accessSource = readFileSync("src/context/CompanyAccessContext.tsx", "utf8");

  assert.match(supabaseSource, /GOOGLE_PROVIDER_TOKEN_CLEARED_EVENT/);
  assert.match(supabaseSource, /dispatchEvent\(new Event\(GOOGLE_PROVIDER_TOKEN_CLEARED_EVENT\)\)/);
  assert.match(accessSource, /addEventListener\(GOOGLE_PROVIDER_TOKEN_CLEARED_EVENT/);
  assert.match(accessSource, /provider_token:\s*undefined/);
  assert.match(accessSource, /setSession\(nextSession\)/);
});
