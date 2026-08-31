import test from "node:test";
import assert from "node:assert/strict";
import {
  extractAccountSuffix,
  normalizeInstitution,
  resolveFinancialAccountCandidate,
} from "../src/lib/entityResolution.ts";
import type { FinancialAccount } from "../src/lib/cashBanking.ts";
import type { EmailIntakeProfile } from "../src/types.ts";

const mockAccounts: FinancialAccount[] = [
  {
    id: "acc-bdo-php-1",
    companyId: "comp-1",
    accountType: "BANK",
    institutionCode: "BDO",
    institutionName: "BDO Unibank",
    displayName: "BDO Operating Account",
    maskedIdentifier: "•••• 4821",
    currency: "PHP",
    openingBalance: 100000,
    openingBalanceDate: "2026-01-01",
    connectionType: "STATEMENT",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "acc-bdo-usd-1",
    companyId: "comp-1",
    accountType: "BANK",
    institutionCode: "BDO",
    institutionName: "BDO Unibank",
    displayName: "BDO USD Reserve",
    maskedIdentifier: "•••• 4821",
    currency: "USD",
    openingBalance: 50000,
    openingBalanceDate: "2026-01-01",
    connectionType: "STATEMENT",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "acc-bpi-php-1",
    companyId: "comp-1",
    accountType: "BANK",
    institutionCode: "BPI",
    institutionName: "Bank of the Philippine Islands",
    displayName: "BPI Payroll Account",
    maskedIdentifier: "•••• 9988",
    currency: "PHP",
    openingBalance: 200000,
    openingBalanceDate: "2026-01-01",
    connectionType: "STATEMENT",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "acc-bpi-php-2",
    companyId: "comp-1",
    accountType: "BANK",
    institutionCode: "BPI",
    institutionName: "Bank of the Philippine Islands",
    displayName: "BPI Disbursements Account",
    maskedIdentifier: "•••• 7766",
    currency: "PHP",
    openingBalance: 150000,
    openingBalanceDate: "2026-01-01",
    connectionType: "STATEMENT",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

test("FinancialAccount helpers: normalize institution and suffix accurately", () => {
  assert.equal(normalizeInstitution("BDO").code, "BDO");
  assert.equal(normalizeInstitution("Banco De Oro Unibank").code, "BDO");
  assert.equal(normalizeInstitution("Bank of the Philippine Islands").code, "BPI");
  assert.equal(normalizeInstitution("GCash").code, "GCASH");
  assert.equal(normalizeInstitution("Maya").code, "MAYA");

  assert.equal(extractAccountSuffix("•••• 4821"), "4821");
  assert.equal(extractAccountSuffix("1234-5678-4821"), "4821");
  assert.equal(extractAccountSuffix("4821"), "4821");
});

test("FinancialAccount matching: unique bank + masked suffix + currency match links to existing account", () => {
  const candidate = {
    candidateId: "stmt-1",
    evidence: {
      institutionName: "BDO",
      maskedIdentifier: "4821",
      currency: "PHP",
    },
  };

  const result = resolveFinancialAccountCandidate(candidate, mockAccounts);
  assert.equal(result.proposedAction, "LINK_EXISTING");
  assert.equal(result.confidence, "HIGH");
  assert.equal(result.matchedEntityId, "acc-bdo-php-1");
  assert.equal(result.matchedEntityName, "BDO Operating Account");
});

test("FinancialAccount matching: currency mismatch prevents incorrect match", () => {
  const candidate = {
    candidateId: "stmt-2",
    evidence: {
      institutionName: "BDO",
      maskedIdentifier: "4821",
      currency: "USD",
    },
  };

  const result = resolveFinancialAccountCandidate(candidate, mockAccounts);
  assert.equal(result.proposedAction, "LINK_EXISTING");
  assert.equal(result.matchedEntityId, "acc-bdo-usd-1"); // Matches USD account, not PHP account!
  assert.equal(result.matchedEntityName, "BDO USD Reserve");
});

test("FinancialAccount matching: institution mismatch does not match unrelated bank", () => {
  const candidate = {
    candidateId: "stmt-3",
    evidence: {
      institutionName: "Metrobank",
      maskedIdentifier: "4821",
      currency: "PHP",
    },
  };

  const result = resolveFinancialAccountCandidate(candidate, mockAccounts);
  assert.equal(result.proposedAction, "CREATE_NEW");
  assert.equal(result.matchedEntityId, undefined);
});

test("FinancialAccount matching: multiple plausible accounts without suffix yields NEEDS_REVIEW", () => {
  const candidate = {
    candidateId: "stmt-4",
    evidence: {
      institutionName: "BPI",
      currency: "PHP",
      // No suffix provided in statement
    },
  };

  const result = resolveFinancialAccountCandidate(candidate, mockAccounts);
  assert.equal(result.proposedAction, "NEEDS_REVIEW");
  assert.equal(result.matchedEntityId, undefined);
  assert.equal(result.matchReasons.some((r) => r.includes("Multiple")), true);
});

test("FinancialAccount matching: saved-profile hint links account when non-conflicting", () => {
  const profile: EmailIntakeProfile = {
    id: "prof-bpi",
    companyId: "comp-1",
    name: "BPI Payroll Statement Rule",
    enabled: true,
    senderEmail: "estatements@bpi.com.ph",
    suggestedDestination: "BANK_STATEMENT",
    linkedFinancialAccountId: "acc-bpi-php-1",
    createdAt: "2026-08-30T00:00:00Z",
    updatedAt: "2026-08-30T00:00:00Z",
  };

  const candidate = {
    candidateId: "stmt-5",
    evidence: {
      senderEmail: "estatements@bpi.com.ph",
      currency: "PHP",
      linkedProfileAccountId: "acc-bpi-php-1",
    },
  };

  const result = resolveFinancialAccountCandidate(candidate, mockAccounts, [profile]);
  assert.equal(result.proposedAction, "LINK_EXISTING");
  assert.equal(result.matchedEntityId, "acc-bpi-php-1");
  assert.equal(result.confidence, "HIGH");
});

test("FinancialAccount matching: saved-profile hint does NOT override conflicting currency", () => {
  const profile: EmailIntakeProfile = {
    id: "prof-bpi",
    companyId: "comp-1",
    name: "BPI Payroll Statement Rule",
    enabled: true,
    senderEmail: "estatements@bpi.com.ph",
    suggestedDestination: "BANK_STATEMENT",
    linkedFinancialAccountId: "acc-bpi-php-1", // PHP account
    createdAt: "2026-08-30T00:00:00Z",
    updatedAt: "2026-08-30T00:00:00Z",
  };

  const candidate = {
    candidateId: "stmt-6",
    evidence: {
      senderEmail: "estatements@bpi.com.ph",
      currency: "JPY", // Conflicting currency!
      linkedProfileAccountId: "acc-bpi-php-1",
    },
  };

  const result = resolveFinancialAccountCandidate(candidate, mockAccounts, [profile]);
  assert.equal(result.proposedAction, "NEEDS_REVIEW");
  assert.equal(result.conflicts.length > 0, true);
  assert.equal(result.conflicts[0].field, "currency");
});

test("FinancialAccount matching: unseen account proposes CREATE_NEW without silently mutating database", () => {
  const candidate = {
    candidateId: "stmt-7",
    evidence: {
      institutionName: "UnionBank",
      maskedIdentifier: "1122",
      currency: "PHP",
    },
  };

  const result = resolveFinancialAccountCandidate(candidate, mockAccounts);
  assert.equal(result.proposedAction, "CREATE_NEW");
  assert.equal(result.matchedEntityId, undefined);
  assert.equal(result.matchedEntityName, "UnionBank of the Philippines •••• 1122");
});

test("FinancialAccount matching: company isolation ensures other company accounts are not matched", () => {
  const otherCompanyAccounts: FinancialAccount[] = [
    {
      id: "acc-other-comp",
      companyId: "comp-OTHER",
      accountType: "BANK",
      institutionName: "UnionBank",
      displayName: "Other Company UB Account",
      maskedIdentifier: "•••• 1122",
      currency: "PHP",
      openingBalance: 0,
      openingBalanceDate: "2026-01-01",
      connectionType: "MANUAL",
      active: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ];

  const candidate = {
    candidateId: "stmt-8",
    evidence: {
      institutionName: "UnionBank",
      maskedIdentifier: "1122",
      currency: "PHP",
    },
  };

  // In company-1 context (mockAccounts):
  const result = resolveFinancialAccountCandidate(candidate, mockAccounts);
  assert.equal(result.proposedAction, "CREATE_NEW");
  assert.equal(result.matchedEntityId, undefined);
});
