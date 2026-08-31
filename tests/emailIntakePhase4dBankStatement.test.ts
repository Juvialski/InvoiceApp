import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  parseStatementRows,
  buildStatementPreview,
} from "../src/lib/cashBanking.ts";
import { parseStatementFile } from "../src/lib/cashBankingImport.ts";
import {
  getBuiltInStatementParserProfiles,
  getStatementParserProfile,
  validateParserProfileAgainstSheet,
  matchStatementParserProfile,
} from "../src/lib/statementParserProfiles.ts";
import {
  extractAccountEvidenceFromStatement,
  resolveFinancialAccountCandidate,
} from "../src/lib/entityResolution.ts";
import type { FinancialAccount, FinancialImportBatch } from "../src/lib/cashBanking.ts";
import type { EmailIntakeProfile } from "../src/types.ts";

function createMockWorkbookBuffer(
  rows: (string | number | Date | null | undefined)[][],
  bookType: "xlsx" | "xlsm" | "xls" | "csv" = "xlsx",
  sheetName = "Sheet1",
): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, {
    type: "array",
    bookType: bookType === "xls" ? "biff8" : (bookType as XLSX.BookType),
  });
  return new Uint8Array(out);
}

const mockAccounts: FinancialAccount[] = [
  {
    id: "acc-bdo-4821",
    companyId: "comp-1",
    accountType: "BANK",
    displayName: "BDO Operating Account",
    institutionName: "BDO Unibank",
    institutionCode: "BDO",
    maskedIdentifier: "•••• 4821",
    currency: "PHP",
    active: true,
    openingBalance: 100000,
    openingBalanceDate: "2026-01-01",
    connectionType: "STATEMENT",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "acc-bdo-7314",
    companyId: "comp-1",
    accountType: "BANK",
    displayName: "BDO Payroll Account",
    institutionName: "BDO Unibank",
    institutionCode: "BDO",
    maskedIdentifier: "•••• 7314",
    currency: "PHP",
    active: true,
    openingBalance: 50000,
    openingBalanceDate: "2026-01-01",
    connectionType: "STATEMENT",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "acc-bpi-1234",
    companyId: "comp-1",
    accountType: "BANK",
    displayName: "BPI Corporate Account",
    institutionName: "Bank of the Philippine Islands",
    institutionCode: "BPI",
    maskedIdentifier: "•••• 1234",
    currency: "USD",
    active: true,
    openingBalance: 10000,
    openingBalanceDate: "2026-01-01",
    connectionType: "STATEMENT",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "acc-gcash-9999-a",
    companyId: "comp-1",
    accountType: "EWALLET",
    displayName: "GCash Operations 1",
    institutionName: "GCash",
    institutionCode: "GCASH",
    maskedIdentifier: "•••• 9999",
    currency: "PHP",
    active: true,
    openingBalance: 5000,
    openingBalanceDate: "2026-01-01",
    connectionType: "STATEMENT",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "acc-gcash-9999-b",
    companyId: "comp-1",
    accountType: "EWALLET",
    displayName: "GCash Operations 2",
    institutionName: "GCash",
    institutionCode: "GCASH",
    maskedIdentifier: "•••• 9999",
    currency: "PHP",
    active: true,
    openingBalance: 3000,
    openingBalanceDate: "2026-01-01",
    connectionType: "STATEMENT",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

describe("Email Intake Phase 4D — Bank Statement Hardening", () => {
  // Scenario 1: Valid CSV bank statement imports through deterministic parser without AI calls
  it("Scenario 1: parses valid CSV bank statement deterministically", () => {
    const csvContent = "Date,Description,Reference,Debit,Credit,Balance\n2026-08-01,Client Payment,REF001,,50000,150000\n2026-08-02,Office Rent,REF002,25000,,125000\n";
    const buffer = new TextEncoder().encode(csvContent);
    const result = parseStatementFile(buffer, "august_statement.csv");
    const { transactions } = parseStatementRows(result);

    assert.equal(result.fileName, "august_statement.csv");
    assert.equal(transactions.length, 2);
    assert.equal(result.structure.confidence, "HIGH");
    assert.equal(transactions[0].direction, "CREDIT");
    assert.equal(transactions[0].amount, 50000);
    assert.equal(transactions[1].direction, "DEBIT");
    assert.equal(transactions[1].amount, 25000);
  });

  // Scenario 2: Valid XLS bank statement imports through deterministic parser
  it("Scenario 2: parses valid XLS bank statement deterministically", () => {
    const rows = [
      ["Date", "Description", "Debit", "Credit", "Balance"],
      ["2026-08-05", "Equipment Purchase", 12000, null, 88000],
      ["2026-08-06", "Consulting Fee", null, 40000, 128000],
    ];
    const buffer = createMockWorkbookBuffer(rows, "xls");
    const result = parseStatementFile(buffer, "legacy_statement.xls");
    const { transactions } = parseStatementRows(result);

    assert.equal(result.fileName, "legacy_statement.xls");
    assert.equal(transactions.length, 2);
    assert.equal(transactions[0].direction, "DEBIT");
    assert.equal(transactions[0].amount, 12000);
    assert.equal(transactions[1].direction, "CREDIT");
    assert.equal(transactions[1].amount, 40000);
  });

  // Scenario 3: Valid XLSX bank statement imports through deterministic parser
  it("Scenario 3: parses valid XLSX bank statement deterministically", () => {
    const rows = [
      ["Date", "Description", "Credit", "Debit", "Balance"],
      ["2026-08-10", "Deposit from Client", 30000, null, 158000],
      ["2026-08-11", "Utility Bill", null, 5000, 153000],
    ];
    const buffer = createMockWorkbookBuffer(rows, "xlsx");
    const result = parseStatementFile(buffer, "bank_statement_aug2026.xlsx");
    const { transactions } = parseStatementRows(result);

    assert.equal(result.fileName, "bank_statement_aug2026.xlsx");
    assert.equal(transactions.length, 2);
    assert.equal(transactions[0].direction, "CREDIT");
    assert.equal(transactions[0].amount, 30000);
    assert.equal(transactions[1].direction, "DEBIT");
    assert.equal(transactions[1].amount, 5000);
  });

  // Scenario 4: Valid XLSM bank statement imports through deterministic parser
  it("Scenario 4: parses valid XLSM bank statement deterministically", () => {
    const rows = [
      ["Date", "Description", "Credit", "Debit", "Balance"],
      ["2026-08-12", "Macro Generated Export", 75000, null, 228000],
    ];
    const buffer = createMockWorkbookBuffer(rows, "xlsm");
    const result = parseStatementFile(buffer, "bank_export_macro.xlsm");
    const { transactions } = parseStatementRows(result);

    assert.equal(result.fileName, "bank_export_macro.xlsm");
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].direction, "CREDIT");
    assert.equal(transactions[0].amount, 75000);
  });

  // Scenario 5: PDF bank statement throws explicit unsupported error and does NOT call AI
  it("Scenario 5: throws explicit unsupported error for PDF statements", () => {
    const dummyPdfBuffer = Buffer.from("%PDF-1.4 dummy content", "utf-8").buffer;
    assert.throws(
      () => parseStatementFile(dummyPdfBuffer, "statement.pdf"),
      /PDF statement import is not enabled until a reliable institution-specific extractor is available/i,
    );
  });

  // Scenario 6: Deterministic parser profile matches and applies BDO CSV profile
  it("Scenario 6: parser profile matches and applies BDO CSV profile", () => {
    const bdoProfile = getStatementParserProfile("bdo-standard-csv");
    assert.ok(bdoProfile);

    const sheetRows = [
      ["BDO Unibank Statement of Account"],
      ["Account Number: •••• 4821"],
      ["Posting Date", "Transaction Details", "Debit", "Credit", "Running Balance"],
      ["2026-08-15", "Payroll Transfer", null, 100000, 250000],
    ];

    const validation = validateParserProfileAgainstSheet(bdoProfile, sheetRows);
    assert.equal(validation.valid, true);

    const buffer = createMockWorkbookBuffer(sheetRows, "csv");
    const parsed = parseStatementFile(buffer, "bdo_export.csv", "bdo-standard-csv");
    const { transactions } = parseStatementRows(parsed);

    assert.equal(parsed.structure.appliedProfileId, "bdo-standard-csv");
    assert.equal(parsed.structure.isProfileFallback, false);
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].direction, "CREDIT");
    assert.equal(transactions[0].amount, 100000);
  });

  // Scenario 7: Statement profile with mismatched headers falls back to heuristic detection with warning
  it("Scenario 7: profile with mismatched headers falls back to heuristics with warning", () => {
    const sheetRows = [
      ["Custom Header 1", "Custom Header 2"],
      ["Txn Date", "Particulars", "Outflow", "Inflow", "Net Balance"],
      ["2026-08-16", "Supplier Payment", 15000, null, 235000],
    ];

    const bdoProfile = getStatementParserProfile("bdo-standard-csv")!;
    assert.ok(bdoProfile);
    const validation = validateParserProfileAgainstSheet(bdoProfile, sheetRows);
    assert.equal(validation.valid, false);

    const buffer = createMockWorkbookBuffer(sheetRows, "xlsx");
    const parsed = parseStatementFile(buffer, "custom_sheet.xlsx", "bdo-standard-csv");
    const { transactions } = parseStatementRows(parsed);

    assert.equal(parsed.structure.isProfileFallback, true);
    assert.ok(parsed.structure.profileValidationWarning);
    assert.ok(parsed.structure.profileValidationWarning.includes("incompatible"));
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].direction, "DEBIT");
    assert.equal(transactions[0].amount, 15000);
  });

  // Scenario 8: Parsed statement account evidence (Institution + Suffix + matching currency) uniquely matches -> LINK_EXISTING
  it("Scenario 8: unique institution, suffix, and currency evidence links existing account", () => {
    const sheetRows = [
      ["BDO Unibank Statement"],
      ["Account No: 1234-5678-4821"],
      ["Currency: PHP"],
      ["Posting Date", "Transaction Details", "Debit", "Credit", "Running Balance"],
      ["2026-08-17", "Deposit", null, 20000, 255000],
    ];

    const evidence = extractAccountEvidenceFromStatement({
      fileName: "bdo_statement.csv",
      rawRows: sheetRows,
    });

    assert.equal(evidence.institutionName, "BDO Unibank");
    assert.equal(evidence.accountNumber, "1234-5678-4821");
    assert.equal(evidence.maskedIdentifier, "4821");
    assert.equal(evidence.currency, "PHP");

    const resolution = resolveFinancialAccountCandidate(
      { candidateId: "cand-1", evidence },
      mockAccounts,
    );

    assert.equal(resolution.proposedAction, "LINK_EXISTING");
    assert.equal(resolution.matchedEntityId, "acc-bdo-4821");
    assert.equal(resolution.conflicts.length, 0);
  });

  // Scenario 9: Parsed statement account evidence matches institution but NO suffix -> NEEDS_REVIEW
  it("Scenario 9: institution match without suffix requires review", () => {
    const evidence = {
      institutionName: "Bank of the Philippine Islands",
      institutionCode: "BPI",
      currency: "USD",
    };

    const resolution = resolveFinancialAccountCandidate(
      { candidateId: "cand-2", evidence },
      mockAccounts,
    );

    assert.equal(resolution.proposedAction, "NEEDS_REVIEW");
    assert.equal(resolution.matchedEntityId, "acc-bpi-1234");
    assert.ok(resolution.matchReasons[0].includes("no account suffix was extracted"));
  });

  // Scenario 10: Parsed statement account evidence matches multiple accounts -> NEEDS_REVIEW
  it("Scenario 10: multiple accounts matching institution and suffix requires explicit review", () => {
    const evidence = {
      institutionName: "GCash",
      institutionCode: "GCASH",
      accountNumber: "•••• 9999",
      maskedIdentifier: "9999",
      currency: "PHP",
    };

    const resolution = resolveFinancialAccountCandidate(
      { candidateId: "cand-3", evidence },
      mockAccounts,
    );

    assert.equal(resolution.proposedAction, "NEEDS_REVIEW");
    assert.equal(resolution.matchedEntityId, undefined);
    assert.ok(resolution.matchReasons[0].includes("Multiple GCash accounts end in 9999"));
  });

  // Scenario 11: Parsed statement account evidence matches no account -> CREATE_NEW proposal (advisory only)
  it("Scenario 11: unknown institution / suffix produces advisory CREATE_NEW proposal", () => {
    const evidence = {
      institutionName: "Security Bank",
      institutionCode: "SECURITY_BANK",
      accountNumber: "•••• 8888",
      maskedIdentifier: "8888",
      currency: "PHP",
    };

    const resolution = resolveFinancialAccountCandidate(
      { candidateId: "cand-4", evidence },
      mockAccounts,
    );

    assert.equal(resolution.proposedAction, "CREATE_NEW");
    assert.equal(resolution.matchedEntityId, undefined);
    assert.ok(resolution.matchReasons[0].includes("Creation remains a proposal until review"));
  });

  // Scenario 12: Profile points to Account A (•••• 7314) but statement belongs to Account B (•••• 4821) -> NEEDS_REVIEW with conflict
  it("Scenario 12: contradictory statement evidence flags hard conflict against profile-linked account", () => {
    const profile: EmailIntakeProfile = {
      id: "prof-1",
      companyId: "comp-1",
      name: "BDO Payroll Rule",
      enabled: true,
      suggestedDestination: "BANK_STATEMENT",
      linkedFinancialAccountId: "acc-bdo-7314", // Points to 7314
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    const evidence = {
      institutionName: "BDO Unibank",
      institutionCode: "BDO",
      accountNumber: "•••• 4821", // Statement is 4821
      maskedIdentifier: "4821",
      currency: "PHP",
      matchedProfileId: profile.id,
      linkedProfileAccountId: profile.linkedFinancialAccountId,
    };

    const resolution = resolveFinancialAccountCandidate(
      { candidateId: "cand-5", evidence },
      mockAccounts,
      [profile],
    );

    assert.equal(resolution.proposedAction, "NEEDS_REVIEW");
    assert.equal(resolution.conflicts.length, 1);
    assert.equal(resolution.conflicts[0].field, "accountSuffix");
    assert.equal(resolution.conflicts[0].existingValue, "7314");
    assert.equal(resolution.conflicts[0].candidateValue, "4821");
  });

  // Scenario 13: Statement missing currency leaves currency undefined (never defaults to PHP)
  it("Scenario 13: missing statement currency remains undefined", () => {
    const sheetRows = [
      ["Date", "Description", "Credit", "Debit", "Balance"],
      ["2026-08-20", "Unknown Currency Txn", 1000, null, 5000],
    ];

    const evidence = extractAccountEvidenceFromStatement({
      fileName: "statement_no_currency.csv",
      rawRows: sheetRows,
    });

    assert.equal(evidence.currency, undefined);
  });

  // Scenario 14: Previous import history assists resolution confidence without overriding contradictory evidence
  it("Scenario 14: import history supports match without overriding contradictions", () => {
    const importBatches: FinancialImportBatch[] = [
      {
        id: "batch-1",
        companyId: "comp-1",
        accountId: "acc-bdo-4821",
        fileFingerprint: "fingerprint-bdo-4821-july",
        fileName: "bdo_july.csv",
        sourceType: "CSV",
        status: "IMPORTED",
        rowCount: 10,
        importedCount: 10,
        duplicateCount: 0,
        rejectedCount: 0,
        createdAt: "2026-07-31T00:00:00Z",
      },
    ];

    const evidence = {
      institutionName: "BDO Unibank",
      institutionCode: "BDO",
      accountNumber: "•••• 4821",
      maskedIdentifier: "4821",
      currency: "PHP",
    };

    const resolution = resolveFinancialAccountCandidate(
      { candidateId: "cand-6", evidence },
      mockAccounts,
      [],
      importBatches,
    );

    assert.equal(resolution.proposedAction, "LINK_EXISTING");
    assert.equal(resolution.confidenceScore, 98);
    assert.ok(resolution.matchReasons.some((r) => r.includes("Import history supports match")));
  });

  // Scenario 15: Exact duplicate statement file detected, breakdown exposed, and commit blocked
  it("Scenario 15: exact duplicate statement is detected and blocks commit", () => {
    const sheetRows = [
      ["Date", "Description", "Debit", "Credit", "Balance"],
      ["2026-08-01", "Payment 1", null, 10000, 110000],
      ["2026-08-02", "Payment 2", null, 20000, 130000],
    ];
    const buffer = createMockWorkbookBuffer(sheetRows, "csv");
    const parsed = parseStatementFile(buffer, "exact_duplicate.csv");

    const existingBatches: FinancialImportBatch[] = [
      {
        id: "batch-existing-1",
        companyId: "comp-1",
        accountId: "acc-bdo-4821",
        fileFingerprint: parsed.fileFingerprint,
        fileName: "exact_duplicate.csv",
        sourceType: "CSV",
        status: "IMPORTED",
        rowCount: 2,
        importedCount: 2,
        duplicateCount: 0,
        rejectedCount: 0,
        createdAt: "2026-08-10T00:00:00Z",
      },
    ];

    const preview = buildStatementPreview(
      parsed,
      parsed.structure.mapping,
      "acc-bdo-4821",
      "PHP",
      [],
      [parsed.fileFingerprint],
      existingBatches,
    );

    assert.equal(preview.isExactDuplicate, true);
    assert.equal(preview.canCommit, false);
    assert.equal(preview.duplicateBreakdown?.exactFileDuplicate, true);
    assert.equal(preview.duplicateBreakdown?.existingBatchId, "batch-existing-1");
  });

  // Scenario 16: Overlapping statement correctly identifies new vs duplicate transactions
  it("Scenario 16: overlapping statement separates new vs duplicate transactions", () => {
    const sheetRows = [
      ["Date", "Description", "Debit", "Credit", "Balance"],
      ["2026-08-01", "Existing Txn 1", null, 5000, 105000], // duplicate
      ["2026-08-02", "Net New Txn 2", null, 15000, 120000], // new
    ];
    const buffer = createMockWorkbookBuffer(sheetRows, "csv");
    const parsed = parseStatementFile(buffer, "overlapping.csv");
    const { transactions: parsedTransactions } = parseStatementRows(parsed, parsed.structure.mapping, "acc-bdo-4821", "PHP");

    const existingTransactions = [
      {
        id: "tx-1",
        companyId: "comp-1",
        accountId: "acc-bdo-4821",
        transactionDate: "2026-08-01",
        description: "Existing Txn 1",
        amount: 5000,
        currency: "PHP",
        direction: "CREDIT" as const,
        source: "CSV" as const,
        status: "POSTED" as const,
        reconciliationStatus: "UNMATCHED" as const,
        sourceFingerprint: parsedTransactions[0].sourceFingerprint,
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
      },
    ];

    const preview = buildStatementPreview(
      parsed,
      parsed.structure.mapping,
      "acc-bdo-4821",
      "PHP",
      existingTransactions,
      [],
      [],
    );

    assert.equal(preview.isExactDuplicate, false);
    assert.equal(preview.rowsFound, 2);
    assert.equal(preview.duplicateCount, 1);
    assert.equal(preview.transactionsToImport.length, 1);
    assert.equal(preview.transactionsToImport[0].description, "Net New Txn 2");
    assert.equal(preview.duplicateBreakdown?.totalRows, 2);
    assert.equal(preview.duplicateBreakdown?.newTransactions, 1);
    assert.equal(preview.duplicateBreakdown?.duplicateTransactions, 1);
    assert.equal(preview.canCommit, true);
  });

  // Scenario 17: New statement with zero duplicates proceeds cleanly
  it("Scenario 17: net new statement proceeds cleanly with canCommit true", () => {
    const sheetRows = [
      ["Date", "Description", "Debit", "Credit", "Balance"],
      ["2026-08-25", "Fresh Txn 1", null, 25000, 175000],
      ["2026-08-26", "Fresh Txn 2", 5000, null, 170000],
    ];
    const buffer = createMockWorkbookBuffer(sheetRows, "csv");
    const parsed = parseStatementFile(buffer, "fresh_statement.csv");

    const preview = buildStatementPreview(
      parsed,
      parsed.structure.mapping,
      "acc-bdo-4821",
      "PHP",
      [],
      [],
      [],
    );

    assert.equal(preview.isExactDuplicate, false);
    assert.equal(preview.duplicateCount, 0);
    assert.equal(preview.transactionsToImport.length, 2);
    assert.equal(preview.canCommit, true);
  });

  // Scenario 18: Source provenance linking structure is valid
  it("Scenario 18: source provenance linking structure retains all audit refs", () => {
    const sourceRef = {
      messageId: "gmail-msg-12345",
      subject: "BDO July 2026 Statement",
      sender: "statements@bdo.com.ph",
      fileName: "statement.csv",
      attachmentId: "doc-att-789",
    };

    const evidence = {
      institutionName: "BDO Unibank",
      accountNumber: "•••• 4821",
    };

    const resolution = resolveFinancialAccountCandidate(
      { candidateId: "cand-7", evidence, sourceRef },
      mockAccounts,
    );

    assert.deepEqual(resolution.sourceReference, sourceRef);
  });

  // Scenario 19: Built-in parser profile catalog is populated and valid
  it("Scenario 19: built-in parser profile catalog includes all standard institutions", () => {
    const profiles = getBuiltInStatementParserProfiles();
    assert.ok(profiles.length >= 8);

    const profileIds = profiles.map((p) => p.id);
    assert.ok(profileIds.includes("bdo-standard-csv"));
    assert.ok(profileIds.includes("bpi-statement-csv"));
    assert.ok(profileIds.includes("metrobank-statement-csv"));
    assert.ok(profileIds.includes("unionbank-statement-csv"));
    assert.ok(profileIds.includes("securitybank-statement-csv"));
    assert.ok(profileIds.includes("gcash-statement-csv"));
    assert.ok(profileIds.includes("maya-statement-csv"));
    assert.ok(profileIds.includes("generic-debit-credit"));
  });

  // Scenario 20: Parser profile match finds best profile or falls back
  it("Scenario 20: matchStatementParserProfile accurately identifies format or falls back safely", () => {
    const gcashRows = [
      ["GCash Transaction History"],
      ["Date", "Details", "Ref No.", "Amount", "Balance"],
      ["2026-08-28", "Express Send to 09171234567", "REF987", -500, 4500],
    ];

    const match = matchStatementParserProfile(gcashRows, undefined, "GCash");
    assert.ok(match);
    assert.equal(match?.profile?.id, "gcash-statement-csv");
    assert.equal(match?.validation?.valid, true);

    const unknownRows = [
      ["Foo", "Bar", "Baz"],
      ["1", "2", "3"],
    ];
    const matchUnknown = matchStatementParserProfile(unknownRows);
    assert.equal(matchUnknown.profile, undefined);
    assert.equal(matchUnknown.isFallback, true);
  });
});
