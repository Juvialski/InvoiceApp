import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  buildCashDashboardPosition,
  buildClientTemplatePreview,
  buildStatementPreview,
  calculateCashFlow,
  calculateLedgerBalance,
  clientTemplateStatementDocument,
  createFinancialAccount,
  createFinancialMatch,
  createFinancialTransaction,
  findInternalTransferSuggestions,
  parseStatementFile,
  reconciliationStatusForTransaction,
  resolveFinancialBalance,
  suggestFinancialMatches,
  normalizeMaskedFinancialIdentifier,
  type CashBankingWorkspaceData,
  type FinancialTransaction,
} from "../src/lib/cashBanking.ts";

const now = "2026-08-26T00:00:00.000Z";

function account(id: string, type: "BANK" | "EWALLET" = "BANK", currency = "PHP") {
  return createFinancialAccount({
    companyId: "company-a",
    accountType: type,
    institutionCode: type === "EWALLET" ? "GCASH" : "BDO",
    institutionName: type === "EWALLET" ? "GCash" : "BDO",
    displayName: id,
    maskedIdentifier: "•••• 7281",
    currency,
    openingBalance: 0,
    openingBalanceDate: "2026-01-01",
    connectionType: "MANUAL",
    active: true,
  }, now);
}

function transaction(input: Partial<FinancialTransaction> & Pick<FinancialTransaction, "id" | "accountId" | "transactionDate" | "direction" | "amount" | "description" | "currency">): FinancialTransaction {
  return {
    status: "POSTED",
    source: "MANUAL",
    sourceFingerprint: `fingerprint-${input.id}`,
    reconciliationStatus: "UNMATCHED",
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

test("client bank-ledger template parses and reconciles exactly", () => {
  const preview = buildClientTemplatePreview();
  assert.equal(preview.openingBalance, 2540);
  assert.equal(preview.credits, 4750);
  assert.equal(preview.debits, 605);
  assert.equal(preview.calculatedEndingBalance, 6685);
  assert.equal(preview.statementEndingBalance, 6685);
  assert.equal(preview.difference, 0);
  assert.equal(preview.invalidRows.length, 0);
  assert.equal(preview.balanceIssues.length, 0);
  assert.equal(preview.transactionsToImport.length, 6);
  assert.deepEqual(preview.transactions[0], {
    sourceRow: 3,
    transactionDate: "2024-11-05",
    referenceNumber: "R543-10002545",
    description: "Check (#1000545)",
    direction: "CREDIT",
    amount: 600,
    runningBalance: 3140,
    sourceFingerprint: preview.transactions[0]!.sourceFingerprint,
    rawRow: ["11/05/2024", "R543-10002545", "Check (#1000545)", 600, null, 3140],
  });
});

test("CSV and XLSX parsing detect reordered columns and preserve formula values as data", () => {
  const csv = [
    "Balance,Description,Date,Reference,Expense,Income",
    "3140.00,Check,11/05/2024,R-1,,600",
  ].join("\n");
  const csvPreview = buildStatementPreview(parseStatementFile(csv, "statement.csv"), undefined, "acct", "PHP");
  assert.equal(csvPreview.credits, 600);
  assert.equal(csvPreview.debits, 0);
  assert.equal(csvPreview.transactions[0]?.referenceNumber, "R-1");

  const sheet = XLSX.utils.aoa_to_sheet([
    ["Date", "Description", "Direction", "Amount", "Balance"],
    ["2026-08-01", "Formula value", "CREDIT", 1250, 1250],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Statement");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const xlsxPreview = buildStatementPreview(parseStatementFile(bytes, "statement.xlsx"), undefined, "acct", "PHP");
  assert.equal(xlsxPreview.credits, 1250);
  assert.equal(xlsxPreview.transactions[0]?.description, "Formula value");
});

test("statement parser handles commas, negative values, blank rows, repeated headers, and invalid dates", () => {
  const csv = [
    "STARTING BALANCE,\"2,540.00\"",
    "Date,Reference,Description,Income,Expense,Balance",
    "2026-08-01,R-1,Negative correction,-100,,2440",
    "2026-08-02,R-2,Comma expense,,\"$(1,205.50)\",1234.50",
    "Date,Reference,Description,Income,Expense,Balance",
    ",,,,,",
    "2026-02-30,R-3,Invalid date,100,,1334.50",
    "2026-08-03,R-4,Both sides,100,20,1314.50",
  ].join("\n");
  const preview = buildStatementPreview(parseStatementFile(csv, "edge.csv"), undefined, "acct", "PHP");
  assert.equal(preview.transactions.length, 2);
  assert.equal(preview.transactions[0]?.direction, "DEBIT");
  assert.equal(preview.transactions[0]?.amount, 100);
  assert.equal(preview.transactions[1]?.amount, 1205.5);
  assert.ok(preview.invalidRows.some((issue) => /valid transaction date/i.test(issue.message)));
  assert.ok(preview.invalidRows.some((issue) => /both populated/i.test(issue.message)));
});

test("inconsistent running balances are visible and block a reconciled import", () => {
  const rows = clientTemplateStatementDocument().rawRows.map((row) => [...row]);
  rows[2]![5] = 3139;
  const document = { ...clientTemplateStatementDocument(), rawRows: rows };
  const preview = buildStatementPreview(document, undefined, "acct", "PHP");
  assert.equal(preview.balanceIssues.length, 1);
  assert.match(preview.balanceIssues[0]!.message, /Row 3 expected balance 3140\.00/);
  assert.equal(preview.canCommit, false);
});

test("duplicate imports are idempotent while identical-looking rows keep occurrence identity", () => {
  const first = buildClientTemplatePreview("acct");
  const existing = first.transactions.map((item, index) => transaction({
    id: `existing-${index}`,
    accountId: "acct",
    transactionDate: item.transactionDate,
    referenceNumber: item.referenceNumber,
    description: item.description,
    direction: item.direction,
    amount: item.amount,
    runningBalance: item.runningBalance,
    currency: "PHP",
    sourceFingerprint: item.sourceFingerprint,
  }));
  const second = buildStatementPreview(clientTemplateStatementDocument("acct"), undefined, "acct", "PHP", existing);
  assert.equal(second.duplicateCount, 6);
  assert.equal(second.transactionsToImport.length, 0);

  const rows = [
    ["Date", "Reference", "Description", "Income", "Expense", "Balance"],
    ["2026-08-01", "SAME", "Same-day payment", 100, null, 100],
    ["2026-08-01", "SAME", "Same-day payment", 100, null, 200],
  ];
  const doc = parseStatementFile(rows.map((row) => row.join(",")).join("\n"), "same.csv");
  assert.notEqual(doc.rawRows[1] && doc.rawRows[2], undefined);
  assert.notEqual(buildStatementPreview(doc, undefined, "acct", "PHP").transactions[0]?.sourceFingerprint, buildStatementPreview(doc, undefined, "acct", "PHP").transactions[1]?.sourceFingerprint);
});

test("cash flow excludes confirmed transfer principal and separates pending/reversed activity", () => {
  const bdo = account("BDO");
  const gcash = account("GCash", "EWALLET");
  const incoming = transaction({ id: "income", accountId: bdo.id, transactionDate: "2026-08-05", direction: "CREDIT", amount: 1000, description: "Customer payment", currency: "PHP", reconciliationStatus: "MATCHED" });
  const outgoing = transaction({ id: "expense", accountId: bdo.id, transactionDate: "2026-08-06", direction: "DEBIT", amount: 250, description: "Fuel", currency: "PHP", reconciliationStatus: "MATCHED" });
  const pending = transaction({ id: "pending", accountId: bdo.id, transactionDate: "2026-08-07", direction: "DEBIT", amount: 50, description: "Pending", currency: "PHP", status: "PENDING" });
  const reversed = transaction({ id: "reversed", accountId: bdo.id, transactionDate: "2026-08-08", direction: "CREDIT", amount: 900, description: "Reversed", currency: "PHP", status: "REVERSED" });
  const transferOut = transaction({ id: "transfer-out", accountId: bdo.id, transactionDate: "2026-08-09", direction: "DEBIT", amount: 200, description: "To GCash", currency: "PHP", reconciliationStatus: "MATCHED", transferGroupId: "group-1" });
  const transferIn = transaction({ id: "transfer-in", accountId: gcash.id, transactionDate: "2026-08-09", direction: "CREDIT", amount: 200, description: "From BDO", currency: "PHP", reconciliationStatus: "MATCHED", transferGroupId: "group-1" });
  const rows = [incoming, outgoing, pending, reversed, transferOut, transferIn];
  const flow = calculateCashFlow(rows, { from: "2026-08-01", to: "2026-08-31", currency: "PHP", matches: [] });
  assert.equal(flow.moneyIn, 1000);
  assert.equal(flow.moneyOut, 250);
  assert.equal(flow.netCashFlow, 750);
  assert.equal(flow.pendingOut, 50);
  assert.equal(flow.transactionCount, 5);
  assert.equal(calculateLedgerBalance({ id: bdo.id, currency: "PHP", openingBalance: 1000 }, rows), 1550);
});

test("balance source precedence keeps statement/provider freshness explicit", () => {
  const bdo = account("BDO");
  const rows = [transaction({ id: "t", accountId: bdo.id, transactionDate: "2026-08-01", direction: "CREDIT", amount: 100, description: "Deposit", currency: "PHP" })];
  const manual = { id: "manual", accountId: bdo.id, capturedAt: "2026-08-25T00:00:00.000Z", ledgerBalance: 1100, availableBalance: 1100, source: "MANUAL" as const, createdAt: now };
  const statement = { ...manual, id: "statement", capturedAt: "2026-08-20T00:00:00.000Z", ledgerBalance: 1090, source: "STATEMENT" as const };
  const balance = resolveFinancialBalance({ ...bdo, openingBalance: 1000 }, [manual, statement], rows);
  assert.equal(balance.source, "STATEMENT");
  assert.match(balance.freshnessLabel, /Statement imported/);
  assert.equal(balance.ledgerBalance, 1090);
  assert.equal(balance.calculatedLedgerBalance, 1100);
  assert.equal(balance.balanceDifference, 10);
  const provider = { ...manual, id: "provider", capturedAt: "2026-08-01T00:00:00.000Z", ledgerBalance: 1085, availableBalance: 1080, source: "PROVIDER" as const };
  assert.equal(resolveFinancialBalance({ ...bdo, openingBalance: 1000 }, [manual, statement, provider], rows).source, "PROVIDER");
});

test("account identifiers are masked and inactive accounts stay out of active totals", () => {
  assert.equal(normalizeMaskedFinancialIdentifier("0917 123 3482"), "•••• 3482");
  assert.equal(normalizeMaskedFinancialIdentifier("•••• 7281"), "•••• 7281");
  assert.equal(normalizeMaskedFinancialIdentifier(""), undefined);
  const active = account("active");
  const inactive = { ...account("inactive"), active: false, openingBalance: 5000 };
  const position = buildCashDashboardPosition({ accounts: [active, inactive], snapshots: [], transactions: [], importBatches: [], matches: [] }, "PHP");
  assert.equal(position.totalAvailableCash, 0);
  assert.equal(position.accounts.length, 1);
});

test("dashboard cash position keeps bank, GCash, currencies, and reconciliation distinct", () => {
  const bdo = account("BDO");
  const gcash = account("GCash", "EWALLET");
  const usd = account("USD account", "BANK", "USD");
  const workspace: CashBankingWorkspaceData = {
    accounts: [{ ...bdo, openingBalance: 500 }, { ...gcash, openingBalance: 100 }, { ...usd, openingBalance: 900 }],
    snapshots: [],
    transactions: [transaction({ id: "unmatched", accountId: bdo.id, transactionDate: "2026-08-05", direction: "CREDIT", amount: 50, description: "Incoming", currency: "PHP" })],
    importBatches: [],
    matches: [],
  };
  const position = buildCashDashboardPosition(workspace, "PHP", { from: "2026-08-01", to: "2026-08-31" });
  assert.equal(position.hasAccounts, true);
  assert.equal(position.totalAvailableCash, 650);
  assert.equal(position.bankAccounts, 550);
  assert.equal(position.ewallets, 100);
  assert.equal(position.moneyIn, 50);
  assert.equal(position.needsReconciliation, 1);
  assert.deepEqual(position.currencies, ["PHP", "USD"]);
  assert.equal(buildCashDashboardPosition(workspace, "USD").totalAvailableCash, 900);
});

test("reconciliation suggestions remain non-mutating and confirmed matches cannot overmatch", () => {
  const row = transaction({ id: "tx", accountId: "acct", transactionDate: "2026-08-10", direction: "DEBIT", amount: 6250, description: "Shell Station", currency: "PHP" });
  const suggestions = suggestFinancialMatches(row, [{ targetType: "EXPENSE", targetId: "expense-1", label: "Fuel", amount: 6250, date: "2026-08-10", description: "Shell Station" }]);
  assert.ok((suggestions[0]?.score || 0) >= 80);
  assert.deepEqual(row.reconciliationStatus, "UNMATCHED");
  const match = createFinancialMatch({ transactionId: row.id, targetType: "EXPENSE", targetId: "expense-1", matchedAmount: 6250, status: "CONFIRMED" }, now);
  assert.equal(reconciliationStatusForTransaction(row, [match]), "MATCHED");
  assert.equal(reconciliationStatusForTransaction(row, [{ ...match, id: "second", matchedAmount: 1 }]), "PARTIAL");
});

test("internal transfer suggestions require opposite movement across same-company accounts", () => {
  const left = transaction({ id: "left", accountId: "a", transactionDate: "2026-08-10", direction: "DEBIT", amount: 10000, description: "Transfer to GCash", currency: "PHP" });
  const right = transaction({ id: "right", accountId: "b", transactionDate: "2026-08-11", direction: "CREDIT", amount: 10000, description: "Transfer from BDO", currency: "PHP" });
  const suggestion = findInternalTransferSuggestions([left, right])[0];
  assert.equal(suggestion?.left.id, "left");
  assert.equal(suggestion?.right.id, "right");
  assert.equal(findInternalTransferSuggestions([left, { ...right, currency: "USD" }]).length, 0);
});
