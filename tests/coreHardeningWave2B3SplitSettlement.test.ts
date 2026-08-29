import test from "node:test";
import assert from "node:assert/strict";
import {
  reconciliationStatusForTransaction,
  type FinancialTransaction,
  type FinancialTransactionMatch,
} from "../src/lib/cashBanking.ts";

test("Wave 2B3: cumulative split allocations reach MATCHED on the final allocation", () => {
  const transaction: FinancialTransaction = {
    id: "tx-split-1",
    companyId: "company-1",
    accountId: "account-1",
    transactionDate: "2026-08-29",
    description: "Split settlement",
    direction: "DEBIT",
    amount: 300,
    currency: "PHP",
    status: "POSTED",
    source: "MANUAL",
    sourceFingerprint: "split-settlement-1",
    reconciliationStatus: "UNMATCHED",
    createdAt: "2026-08-29T00:00:00Z",
    updatedAt: "2026-08-29T00:00:00Z",
  };

  const first: FinancialTransactionMatch = {
    id: "match-split-1",
    companyId: "company-1",
    transactionId: transaction.id,
    targetType: "INVOICE",
    targetId: "invoice-1",
    matchedAmount: 180,
    status: "CONFIRMED",
    createdAt: "2026-08-29T00:00:00Z",
    updatedAt: "2026-08-29T00:00:00Z",
  };
  const second: FinancialTransactionMatch = {
    ...first,
    id: "match-split-2",
    targetId: "invoice-2",
    matchedAmount: 120,
  };

  assert.equal(reconciliationStatusForTransaction(transaction, [first]), "PARTIAL");
  assert.equal(reconciliationStatusForTransaction(transaction, [first, second]), "MATCHED");
});
