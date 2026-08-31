import test from "node:test";
import assert from "node:assert/strict";
import {
  extractAccountEvidenceFromStatement,
  normalizedAccountEvidence,
  resolveFinancialAccountCandidate,
  resolveBatchFinancialAccounts,
} from "../src/lib/entityResolution.ts";
import {
  buildStatementPreview,
  type FinancialAccount,
  type FinancialTransaction,
  type ParsedStatementDocument,
} from "../src/lib/cashBanking.ts";
import { parseStatementFile } from "../src/lib/cashBankingImport.ts";
import type {
  EmailIntakeProfile,
  EntityResolutionResult,
  FinancialAccountIdentityEvidence,
} from "../src/types.ts";
import type { PendingEmailStatementReview } from "../src/lib/emailIntake.ts";

const sampleAccounts: FinancialAccount[] = [
  {
    id: "acc-bdo-php-1",
    companyId: "company-main",
    accountType: "BANK",
    institutionCode: "BDO",
    institutionName: "BDO Unibank",
    displayName: "BDO PHP Operating Account",
    maskedIdentifier: "•••• 9012",
    currency: "PHP",
    openingBalance: 250000,
    openingBalanceDate: "2026-01-01",
    connectionType: "STATEMENT",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "acc-bdo-usd-1",
    companyId: "company-main",
    accountType: "BANK",
    institutionCode: "BDO",
    institutionName: "BDO Unibank",
    displayName: "BDO USD Account",
    maskedIdentifier: "•••• 1111",
    currency: "USD",
    openingBalance: 10000,
    openingBalanceDate: "2026-01-01",
    connectionType: "STATEMENT",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "acc-mbtc-php-1",
    companyId: "company-main",
    accountType: "BANK",
    institutionCode: "METROBANK",
    institutionName: "Metrobank",
    displayName: "Metrobank Payroll Account",
    maskedIdentifier: "•••• 5555",
    currency: "PHP",
    openingBalance: 100000,
    openingBalanceDate: "2026-01-01",
    connectionType: "STATEMENT",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

const sampleTransactions: FinancialTransaction[] = [
  {
    id: "tx-1",
    companyId: "company-main",
    accountId: "acc-bdo-php-1",
    transactionDate: "2026-01-10",
    description: "Existing Supplier Payment",
    amount: 15000,
    currency: "PHP",
    direction: "DEBIT",
    source: "CSV",
    status: "POSTED",
    sourceFingerprint: "fp-tx-1",
    reconciliationStatus: "UNMATCHED",
    createdAt: "2026-01-10T00:00:00Z",
    updatedAt: "2026-01-10T00:00:00Z",
  },
];

test("1. Parser-derived institution/suffix/currency reaches resolver accurately", () => {
  const csvContent = [
    "BDO Unibank - Account Statement",
    "Account Number: 0012-3456-9012",
    "Currency: PHP",
    "Account Name: Operating Main",
    "",
    "Date,Description,Withdrawal,Deposit,Balance",
    "2026-02-01,Opening Balance,,,250000.00",
    "2026-02-05,Client Payment,,50000.00,300000.00",
    "2026-02-10,Office Supplies,12000.00,,288000.00",
  ].join("\n");

  const parsed = parseStatementFile(csvContent, "BDO_Statement_Feb2026.csv");

  const evidence = extractAccountEvidenceFromStatement(
    parsed as any,
    { sender: "BDO Statements <statements@bdo.com.ph>", subject: "Your February 2026 BDO e-Statement" },
  );

  assert.equal(evidence.institutionName, "BDO Unibank");
  assert.equal(evidence.accountNumber, "0012-3456-9012");
  assert.equal(evidence.maskedIdentifier, "9012");
  assert.equal(evidence.currency, "PHP");
  assert.equal(evidence.displayName, "Operating Main");
  assert.equal(evidence.senderEmail, "statements@bdo.com.ph");

  const normalized = normalizedAccountEvidence(evidence);
  assert.equal(normalized.institution.code, "BDO");
  assert.equal(normalized.suffix, "9012");
  assert.equal(normalized.currency, "PHP");

  const resolution = resolveFinancialAccountCandidate(
    { candidateId: "cand-bdo-feb", evidence },
    sampleAccounts,
  );

  assert.equal(resolution.proposedAction, "LINK_EXISTING");
  assert.equal(resolution.matchedEntityId, "acc-bdo-php-1");
  assert.equal(resolution.matchedEntityName, "BDO PHP Operating Account");
  assert.ok(resolution.confidenceScore >= 95);
  assert.equal(resolution.conflicts.length, 0);
  assert.ok(resolution.matchReasons.some((r) => r.includes("BDO Unibank") && r.includes("9012")));
});

test("2. Missing currency in statement remains unknown/empty and does NOT default to PHP", () => {
  const csvWithoutCurrency = [
    "Metrobank - Transaction History",
    "Acct No: *******5555",
    "Account Title: Payroll Account",
    "",
    "Date,Reference,Description,Debit,Credit,Balance",
    "2026-03-01,REF-001,Monthly Payroll,50000.00,,50000.00",
  ].join("\n");

  const parsed = parseStatementFile(csvWithoutCurrency, "Metrobank_Export.csv");

  const evidence = extractAccountEvidenceFromStatement(
    parsed as any,
    { sender: "alerts@metrobank.com.ph", subject: "Metrobank Transaction History" },
  );

  assert.equal(evidence.institutionName, "Metrobank");
  assert.equal(evidence.maskedIdentifier, "5555");
  assert.equal(evidence.currency, undefined);

  const normalized = normalizedAccountEvidence(evidence);
  assert.equal(normalized.currency, "");

  const resolution = resolveFinancialAccountCandidate(
    { candidateId: "cand-mbtc-mar", evidence },
    sampleAccounts,
  );

  assert.equal(resolution.proposedAction, "LINK_EXISTING");
  assert.equal(resolution.matchedEntityId, "acc-mbtc-php-1");
  assert.equal(resolution.matchedEntityName, "Metrobank Payroll Account");
  assert.equal(resolution.conflicts.length, 0);
});

test("3. Saved profile + conflicting parsed statement suffix / institution -> produces NEEDS_REVIEW with explicit conflicts", () => {
  const profile: EmailIntakeProfile = {
    id: "prof-bdo-rule",
    companyId: "company-main",
    name: "BDO Primary USD Rule",
    enabled: true,
    senderEmail: "statements@bdo.com.ph",
    suggestedDestination: "BANK_STATEMENT",
    linkedFinancialAccountId: "acc-bdo-usd-1",
    createdAt: "2026-08-31T00:00:00Z",
    updatedAt: "2026-08-31T00:00:00Z",
  };

  const statementWithDifferentSuffix = parseStatementFile([
    "BDO Unibank Statement",
    "Account Number: *******9999",
    "Currency: USD",
    "Date,Description,Amount,Direction",
    "2026-04-01,Transfer,100.00,CREDIT",
  ].join("\n"), "bdo_usd_9999.csv");

  const evidenceA = extractAccountEvidenceFromStatement(
    statementWithDifferentSuffix as any,
    { sender: "statements@bdo.com.ph", subject: "BDO Statement" },
    profile,
  );

  const resolutionA = resolveFinancialAccountCandidate(
    { candidateId: "cand-conflict-suffix", evidence: evidenceA },
    sampleAccounts,
    [profile],
  );

  assert.equal(resolutionA.proposedAction, "NEEDS_REVIEW");
  assert.ok(resolutionA.conflicts.length > 0);
  assert.ok(resolutionA.conflicts.some((c) => c.field === "accountSuffix" && c.candidateValue === "9999" && c.existingValue === "1111"));
  assert.match(resolutionA.conflicts[0].reason, /Statement account suffix \(•••• 9999\) conflicts/);

  const statementWithDifferentInstitution = parseStatementFile([
    "Bank of the Philippine Islands",
    "Account Number: *******1111",
    "Currency: USD",
    "Date,Description,Amount,Direction",
    "2026-04-01,Transfer,100.00,CREDIT",
  ].join("\n"), "bpi_usd_1111.csv");

  const evidenceB = extractAccountEvidenceFromStatement(
    statementWithDifferentInstitution as any,
    { sender: "statements@bdo.com.ph", subject: "BPI Statement" },
    profile,
  );

  const resolutionB = resolveFinancialAccountCandidate(
    { candidateId: "cand-conflict-inst", evidence: evidenceB },
    sampleAccounts,
    [profile],
  );

  assert.equal(resolutionB.proposedAction, "NEEDS_REVIEW");
  assert.ok(resolutionB.conflicts.some((c) => c.field === "institution"));
  assert.match(resolutionB.conflicts[0].reason, /Statement institution .* conflicts/);

  const statementWithDifferentCurrency = parseStatementFile([
    "BDO Unibank Statement",
    "Account Number: *******1111",
    "Currency: PHP",
    "Date,Description,Amount,Direction",
    "2026-04-01,Transfer,100.00,CREDIT",
  ].join("\n"), "bdo_php_1111.csv");

  const evidenceC = extractAccountEvidenceFromStatement(
    statementWithDifferentCurrency as any,
    { sender: "statements@bdo.com.ph", subject: "BDO Statement" },
    profile,
  );

  const resolutionC = resolveFinancialAccountCandidate(
    { candidateId: "cand-conflict-curr", evidence: evidenceC },
    sampleAccounts,
    [profile],
  );

  assert.equal(resolutionC.proposedAction, "NEEDS_REVIEW");
  assert.ok(resolutionC.conflicts.some((c) => c.field === "currency" && c.candidateValue === "PHP" && c.existingValue === "USD"));
});

test("4. Same unseen parsed account across two statements -> groups into ONE proposed account group", () => {
  const stmtJan = parseStatementFile([
    "Security Bank Corporate Statement",
    "Account No: 0098-7654-4321",
    "Currency: PHP",
    "Date,Description,Debit,Credit,Balance",
    "2026-01-15,Initial Deposit,,500000.00,500000.00",
  ].join("\n"), "SecurityBank_Jan2026.csv");

  const stmtFeb = parseStatementFile([
    "Security Bank Corporate Statement",
    "Account No: 0098-7654-4321",
    "Currency: PHP",
    "Date,Description,Debit,Credit,Balance",
    "2026-02-15,Monthly Service Charge,500.00,,499500.00",
  ].join("\n"), "SecurityBank_Feb2026.csv");

  const evidenceJan = extractAccountEvidenceFromStatement(stmtJan as any, { sender: "ebanking@securitybank.com.ph" });
  const evidenceFeb = extractAccountEvidenceFromStatement(stmtFeb as any, { sender: "ebanking@securitybank.com.ph" });

  const candidates = [
    { candidateId: "stmt-secbank-jan", evidence: evidenceJan },
    { candidateId: "stmt-secbank-feb", evidence: evidenceFeb },
  ];

  const { resolutions, groups } = resolveBatchFinancialAccounts(candidates, sampleAccounts);

  assert.equal(Object.keys(groups).length, 1);
  const groupId = Object.keys(groups)[0];
  assert.equal(groups[groupId].length, 2);
  assert.ok(groups[groupId].includes("stmt-secbank-jan") && groups[groupId].includes("stmt-secbank-feb"));

  const resJan = resolutions["stmt-secbank-jan"];
  const resFeb = resolutions["stmt-secbank-feb"];

  assert.equal(resJan.proposedAction, "CREATE_NEW");
  assert.equal(resFeb.proposedAction, "CREATE_NEW");
  assert.equal(resJan.matchedEntityName, "Security Bank •••• 4321");
  assert.equal(resFeb.matchedEntityName, "Security Bank •••• 4321");

  assert.equal(resJan.batchGroupId, groupId);
  assert.equal(resFeb.batchGroupId, groupId);
  assert.equal(resFeb.isGroupPrimary, true);
  assert.equal(resJan.isGroupPrimary, false);
  assert.equal(resJan.groupMemberCount, 2);
  assert.equal(resFeb.groupMemberCount, 2);
  assert.ok(resJan.matchReasons.some((r) => r.includes("Grouped with 1 other statement(s)")));
  assert.ok(resFeb.matchReasons.some((r) => r.includes("Grouped with 1 other statement(s)")));
});

test("5. Stale staged account selection cannot override contradictory post-parse resolution", () => {
  const stagedReview: PendingEmailStatementReview = {
    id: "staged-review-1",
    sourceDocumentId: "doc-src-123",
    emailMessageId: "email-msg-456",
    gmailMessageId: "gmail-789",
    gmailAttachmentId: "att-001",
    fileName: "Bank_Statement_Jan.csv",
    mimeType: "text/csv",
    subject: "Monthly Statement",
    sender: "statements@bank.example",
    createdAt: new Date().toISOString(),
    confirmedAccountId: "acc-mbtc-php-1",
    matchedProfileId: "prof-optional",
    matchedProfileName: "Optional Profile",
  };

  const activeAccounts = sampleAccounts.filter((a) => a.active);
  const unseenEvidence: FinancialAccountIdentityEvidence = {
    institutionName: "Unknown Bank",
    maskedIdentifier: "9999",
  };

  const autoResolution: EntityResolutionResult = resolveFinancialAccountCandidate(
    { candidateId: stagedReview.id, evidence: unseenEvidence },
    sampleAccounts,
  );

  const stagedConfirmedAccountIsStillValid = Boolean(
    stagedReview.confirmedAccountId
    && autoResolution.proposedAction === "LINK_EXISTING"
    && autoResolution.conflicts.length === 0
    && autoResolution.matchedEntityId === stagedReview.confirmedAccountId
    && activeAccounts.some((a) => a.id === stagedReview.confirmedAccountId),
  );

  let effectiveSelectedAccountId = "";
  if (stagedConfirmedAccountIsStillValid) {
    effectiveSelectedAccountId = stagedReview.confirmedAccountId!;
  } else if (autoResolution.proposedAction === "LINK_EXISTING" && autoResolution.matchedEntityId) {
    effectiveSelectedAccountId = autoResolution.matchedEntityId;
  }

  assert.equal(autoResolution.proposedAction, "CREATE_NEW");
  assert.equal(stagedConfirmedAccountIsStillValid, false);
  assert.equal(effectiveSelectedAccountId, "");
});

test("6. Master-data mutation boundary: parsing, evidence extraction, resolution, and preview generation NEVER mutate accounts or transactions", () => {
  const originalAccounts = JSON.parse(JSON.stringify(sampleAccounts)) as FinancialAccount[];
  const originalTransactions = JSON.parse(JSON.stringify(sampleTransactions)) as FinancialTransaction[];

  const statementContent = [
    "Security Bank Corporate Statement",
    "Account No: 0098-7654-4321",
    "Currency: PHP",
    "Date,Description,Debit,Credit,Balance",
    "2026-01-15,Supplier Payment,10000.00,,490000.00",
    "2026-01-20,Customer Payment,,25000.00,515000.00",
  ].join("\n");

  const parsed = parseStatementFile(statementContent, "Statement_Jan2026.csv");

  const evidence = extractAccountEvidenceFromStatement(parsed as any, {
    sender: "ebanking@securitybank.com.ph",
    subject: "Corporate Statement",
  });

  const resolution = resolveFinancialAccountCandidate(
    { candidateId: "cand-boundary-test", evidence },
    sampleAccounts,
  );

  const batchRes = resolveBatchFinancialAccounts(
    [{ candidateId: "cand-boundary-test", evidence }],
    sampleAccounts,
  );

  const targetAccount = sampleAccounts[0];
  const preview = buildStatementPreview(
    parsed,
    parsed.structure.mapping,
    targetAccount.id,
    targetAccount.currency,
    sampleTransactions,
    [],
  );

  assert.equal(resolution.proposedAction, "CREATE_NEW");
  assert.equal(batchRes.resolutions["cand-boundary-test"].proposedAction, "CREATE_NEW");
  assert.equal(preview.transactionsToImport.length, 2);
  assert.equal(preview.canCommit, true);

  assert.equal(sampleAccounts.length, originalAccounts.length);
  assert.deepEqual(sampleAccounts, originalAccounts);

  assert.equal(sampleTransactions.length, originalTransactions.length);
  assert.deepEqual(sampleTransactions, originalTransactions);
});