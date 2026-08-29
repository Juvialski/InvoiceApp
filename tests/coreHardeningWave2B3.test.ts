import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveInvoiceSettlementSummary,
  derivePayrollSettlementSummary,
  deriveExpenseSettlementSummary,
  defaultSettlementAllocation,
  type FinancialSettlementHistoryItem,
} from "../src/lib/financialSettlement.ts";
import {
  buildLocalInvoiceCorrectionPreview,
  buildLocalExpenseCorrectionPreview,
} from "../src/lib/financialLifecycle.ts";
import {
  reconciliationStatusForTransaction,
  type FinancialTransaction,
  type FinancialTransactionMatch,
} from "../src/lib/cashBanking.ts";
import { reduceDemoWorkspace, resetDemoWorkspace } from "../src/demo/demoState.ts";
import type { InvoiceData, Expense, PayrollRun, PayrollEntry } from "../src/types.ts";

test("Wave 2B3: deriveExpenseSettlementSummary correctly computes active paid vs reversed history", () => {
  const expense: Expense = {
    id: "exp-101",
    expenseDate: "2026-08-15",
    category: "Equipment Rental",
    description: "Excavator rental for Site Alpha",
    amount: 15000,
    currency: "PHP",
    status: "APPROVED",
    createdAt: "2026-08-15T08:00:00Z",
    updatedAt: "2026-08-15T08:00:00Z",
  };

  const history: FinancialSettlementHistoryItem[] = [
    {
      id: "match-1",
      transactionId: "tx-1",
      status: "CONFIRMED",
      amount: 10000,
      confirmedAt: "2026-08-16T10:00:00Z",
      accountName: "Operating BDO",
      maskedIdentifier: "••••1234",
      transactionDate: "2026-08-16",
    },
    {
      id: "match-2",
      transactionId: "tx-2",
      status: "REVERSED",
      amount: 5000,
      confirmedAt: "2026-08-15T12:00:00Z",
      reversedAt: "2026-08-16T09:00:00Z",
      reversalReason: "Incorrect debit transaction selected by reviewer",
      accountName: "Operating BDO",
      maskedIdentifier: "••••1234",
      transactionDate: "2026-08-15",
    },
  ];

  const summary = deriveExpenseSettlementSummary(expense, history);

  assert.equal(summary.settlementBasis, 15000);
  assert.equal(summary.reconciledCashPaid, 10000, "Reversed matches must not count towards reconciledCashPaid");
  assert.equal(summary.outstanding, 5000);
  assert.equal(summary.settlementState, "PARTIALLY_PAID");
  assert.equal(summary.history.length, 2, "Full history including REVERSED matches must be retained");

  const reversedItem = summary.history.find((item) => item.status === "REVERSED");
  assert.ok(reversedItem);
  assert.equal(reversedItem?.reversalReason, "Incorrect debit transaction selected by reviewer");
  assert.equal(reversedItem?.amount, 5000);
});

test("Wave 2B3: deriveInvoiceSettlementSummary preserves REVERSED records and restores outstanding balance", () => {
  const invoice: InvoiceData = {
    id: "inv-202",
    vendor: { name: "Steel Corp" },
    customer: { name: "Acme Builder" },
    invoiceNumber: "SC-9988",
    invoiceDate: "2026-08-10",
    grandTotal: 50000,
    subtotal: 50000,
    totalTax: 0,
    currency: "PHP",
    reviewStatus: "VERIFIED",
    extractedAt: "2026-08-10T00:00:00Z",
    modelUsed: "gemini-flash",
    items: [],
  };

  const history: FinancialSettlementHistoryItem[] = [
    {
      id: "match-inv-1",
      transactionId: "tx-bdo-1",
      status: "REVERSED",
      amount: 50000,
      confirmedAt: "2026-08-11T14:00:00Z",
      reversedAt: "2026-08-12T09:00:00Z",
      reversalReason: "Wrong vendor match",
      accountName: "Primary Checking",
      maskedIdentifier: "••••5555",
      transactionDate: "2026-08-11",
    },
  ];

  const summary = deriveInvoiceSettlementSummary(invoice, history);

  assert.equal(summary.settlementBasis, 50000);
  assert.equal(summary.reconciledCashPaid, 0, "No active confirmed payments remain");
  assert.equal(summary.outstanding, 50000, "Full outstanding balance restored after reversal");
  assert.equal(summary.settlementState, "UNPAID");
  assert.equal(summary.history.length, 1);
  assert.equal(summary.history[0].status, "REVERSED");
});

test("Wave 2B3: derivePayrollSettlementSummary handles multiple partial settlements with reversals", () => {
  const run: PayrollRun = {
    id: "run-303",
    periodId: "period-1",
    status: "APPROVED",
    createdAt: "2026-08-01T00:00:00Z",
  };

  const entries: PayrollEntry[] = [
    {
      id: "entry-1",
      payrollRunId: "run-303",
      workerId: "w-1",
      basePay: 20000,
      regularPay: 20000,
      overtimePay: 0,
      allowances: 0,
      projectAllocatedCost: 20000,
      grossPay: 20000,
      netPay: 18000,
      deductions: 2000,
      createdAt: "2026-08-01T00:00:00Z",
    },
    {
      id: "entry-2",
      payrollRunId: "run-303",
      workerId: "w-2",
      basePay: 30000,
      regularPay: 30000,
      overtimePay: 0,
      allowances: 0,
      projectAllocatedCost: 30000,
      grossPay: 30000,
      netPay: 27000,
      deductions: 3000,
      createdAt: "2026-08-01T00:00:00Z",
    },
  ];

  const history: FinancialSettlementHistoryItem[] = [
    {
      id: "match-p1",
      transactionId: "tx-p1",
      status: "CONFIRMED",
      amount: 25000,
      confirmedAt: "2026-08-05T10:00:00Z",
      transactionDate: "2026-08-05",
    },
    {
      id: "match-p2",
      transactionId: "tx-p2",
      status: "REVERSED",
      amount: 20000,
      confirmedAt: "2026-08-05T11:00:00Z",
      reversedAt: "2026-08-06T08:00:00Z",
      reversalReason: "Disbursement batch failed at bank partner",
      transactionDate: "2026-08-05",
    },
  ];

  const summary = derivePayrollSettlementSummary(run, entries, history);

  assert.equal(summary.settlementBasis, 45000);
  assert.equal(summary.reconciledCashPaid, 25000);
  assert.equal(summary.outstanding, 20000);
  assert.equal(summary.settlementState, "PARTIALLY_DISBURSED");
  assert.equal(summary.history.length, 2);
});

test("Wave 2B3: defaultSettlementAllocation handles remaining caps and outstanding caps", () => {
  assert.equal(defaultSettlementAllocation(3000, 10000), 3000);
  assert.equal(defaultSettlementAllocation(15000, 10000), 10000);
  assert.equal(defaultSettlementAllocation(5000, 5000), 5000);
  assert.equal(defaultSettlementAllocation(0, 5000), 0);
  assert.equal(defaultSettlementAllocation(-100, 5000), 0);
});

test("Wave 2B3: reconciliationStatusForTransaction recomputes correctly on settlement reversal", () => {
  const transaction: FinancialTransaction = {
    id: "tx-700",
    companyId: "company-1",
    accountId: "acc-1",
    transactionDate: "2026-08-20",
    description: "Supplier Payment Wire",
    amount: 100000,
    currency: "PHP",
    direction: "DEBIT",
    status: "POSTED",
    source: "MANUAL",
    sourceFingerprint: "tx-700",
    reconciliationStatus: "MATCHED",
    createdAt: "2026-08-20T00:00:00Z",
    updatedAt: "2026-08-20T00:00:00Z",
  };

  const matchesBefore: FinancialTransactionMatch[] = [
    {
      id: "match-a",
      companyId: "company-1",
      transactionId: "tx-700",
      targetType: "INVOICE",
      targetId: "inv-1",
      matchedAmount: 60000,
      status: "CONFIRMED",
      createdAt: "2026-08-20T00:00:00Z",
      updatedAt: "2026-08-20T00:00:00Z",
    },
    {
      id: "match-b",
      companyId: "company-1",
      transactionId: "tx-700",
      targetType: "INVOICE",
      targetId: "inv-2",
      matchedAmount: 40000,
      status: "CONFIRMED",
      createdAt: "2026-08-20T00:00:00Z",
      updatedAt: "2026-08-20T00:00:00Z",
    },
  ];

  assert.equal(reconciliationStatusForTransaction(transaction, matchesBefore), "MATCHED");

  const matchesPartial: FinancialTransactionMatch[] = [
    matchesBefore[0],
    {
      ...matchesBefore[1],
      status: "REVERSED",
      reversedAt: "2026-08-21T00:00:00Z",
      reversalReason: "Correction requested",
    },
  ];

  assert.equal(reconciliationStatusForTransaction(transaction, matchesPartial), "PARTIAL");

  const matchesAllReversed: FinancialTransactionMatch[] = [
    {
      ...matchesBefore[0],
      status: "REVERSED",
      reversedAt: "2026-08-21T00:00:00Z",
      reversalReason: "Correction requested",
    },
    matchesPartial[1],
  ];

  assert.equal(reconciliationStatusForTransaction(transaction, matchesAllReversed), "UNMATCHED");
});

test("Wave 2B3 & Wave 2B2 Integration: Reversing settlement unblocks invoice correction preview", () => {
  const invoice: InvoiceData = {
    id: "inv-303",
    vendor: { name: "Heavy Machinery Co" },
    customer: { name: "Acme Builder" },
    invoiceNumber: "HMC-1234",
    invoiceDate: "2026-08-10",
    grandTotal: 75000,
    subtotal: 75000,
    totalTax: 0,
    currency: "PHP",
    reviewStatus: "VERIFIED",
    extractedAt: "2026-08-10T00:00:00Z",
    modelUsed: "gemini-flash",
    items: [],
  };

  const previewBlocked = buildLocalInvoiceCorrectionPreview({
    invoice,
    allocationCount: 1,
    settlementMatchCount: 1,
    confirmedSettlementCount: 1,
    historyCount: 1,
  });

  assert.equal(previewBlocked.canVoid, false);
  assert.equal(previewBlocked.confirmedSettlementCount, 1);
  assert.match(previewBlocked.blockedReason || "", /settlement/i);

  const previewUnblocked = buildLocalInvoiceCorrectionPreview({
    invoice,
    allocationCount: 1,
    settlementMatchCount: 1,
    confirmedSettlementCount: 0,
    historyCount: 2,
  });

  assert.equal(previewUnblocked.canVoid, true);
  assert.equal(previewUnblocked.confirmedSettlementCount, 0);
  assert.equal(previewUnblocked.recommendedAction, "VOID");
});

test("Wave 2B3 & Wave 2B2 Integration: Reversing settlement unblocks expense correction preview", () => {
  const expense: Expense = {
    id: "exp-404",
    expenseDate: "2026-08-12",
    category: "Materials",
    description: "Cement bags",
    amount: 12000,
    currency: "PHP",
    status: "APPROVED",
    createdAt: "2026-08-12T00:00:00Z",
    updatedAt: "2026-08-12T00:00:00Z",
  };

  const previewBlocked = buildLocalExpenseCorrectionPreview({
    expense,
    settlementMatchCount: 1,
    confirmedSettlementCount: 1,
  });
  assert.equal(previewBlocked.canVoid, false);
  assert.match(previewBlocked.blockedReason || "", /settlement/i);

  const previewUnblocked = buildLocalExpenseCorrectionPreview({
    expense,
    settlementMatchCount: 1,
    confirmedSettlementCount: 0,
  });
  assert.equal(previewUnblocked.canVoid, true);
});

test("Wave 2B3: demoState reducer handles SAVE_FINANCIAL_MATCH and REVERSE_FINANCIAL_SETTLEMENT truthfully", () => {
  const initial = resetDemoWorkspace("2026-08-25");

  const newMatch: FinancialTransactionMatch = {
    id: "demo-match-test-1",
    companyId: "demo-company",
    transactionId: "tx-demo-1",
    targetType: "INVOICE",
    targetId: "inv-demo-1",
    matchedAmount: 25000,
    status: "CONFIRMED",
    createdAt: "2026-08-25T10:00:00+08:00",
    updatedAt: "2026-08-25T10:00:00+08:00",
  };

  const updatedTx: FinancialTransaction = {
    ...initial.cash.transactions[0],
    id: "tx-demo-1",
    amount: 25000,
    reconciliationStatus: "MATCHED",
  };

  const stateWithMatch = reduceDemoWorkspace(initial, {
    type: "SAVE_FINANCIAL_MATCH",
    match: newMatch,
    transaction: updatedTx,
  });

  const savedMatch = stateWithMatch.cash.matches.find((m) => m.id === "demo-match-test-1");
  assert.ok(savedMatch);
  assert.equal(savedMatch?.status, "CONFIRMED");

  const stateAfterReversal = reduceDemoWorkspace(stateWithMatch, {
    type: "REVERSE_FINANCIAL_SETTLEMENT",
    matchId: "demo-match-test-1",
    reason: "Disbursed to incorrect supplier bank account; funds recalled.",
  });

  const reversedMatch = stateAfterReversal.cash.matches.find((m) => m.id === "demo-match-test-1");
  assert.ok(reversedMatch);
  assert.equal(reversedMatch?.status, "REVERSED");
  assert.equal(reversedMatch?.reversalReason, "Disbursed to incorrect supplier bank account; funds recalled.");
  assert.ok(reversedMatch?.reversedAt);

  const affectedTransaction = stateAfterReversal.cash.transactions.find((t) => t.id === "tx-demo-1");
  assert.ok(affectedTransaction);
  assert.equal(affectedTransaction?.reconciliationStatus, "UNMATCHED");
});
