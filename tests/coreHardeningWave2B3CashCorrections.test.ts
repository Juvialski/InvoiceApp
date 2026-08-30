import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  financialAccountHasHistory,
  hasFinancialTransactionHistory,
  isManualTransactionCorrectionEligible,
  type CashBankingWorkspaceData,
  type FinancialAccount,
  type FinancialTransaction,
  type FinancialTransactionMatch,
} from "../src/lib/cashBanking.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260829234056_core_hardening_wave2b3_cash_corrections.sql", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../src/lib/cashBankingPersistence.ts", import.meta.url), "utf8");
const cashPage = readFileSync(new URL("../src/components/CashBankingPage.tsx", import.meta.url), "utf8");
const settlementWorkspace = readFileSync(new URL("../src/components/CashSettlementAllocationWorkspace.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const assistant = readFileSync(new URL("../src/server/assistant/financialSettlementAssistant.ts", import.meta.url), "utf8");

test("Wave 2B3 Cash migration exposes additive, authenticated lifecycle RPCs", () => {
  assert.doesNotMatch(migration, /drop table|drop schema|drop migration/i);
  for (const column of ["transfer_group_id", "reversed_by_user_id", "reversed_at", "reversal_reason"]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`));
  }
  for (const functionName of [
    "save_financial_account",
    "deactivate_financial_account",
    "reactivate_financial_account",
    "create_financial_transaction",
    "correct_financial_transaction",
    "reverse_financial_transaction",
    "ignore_financial_transaction",
    "restore_financial_transaction_to_review",
    "reverse_financial_transfer",
  ]) {
    const block = migration.match(new RegExp(`create or replace function public\\.${functionName}[\\s\\S]*?\\$\\$;`))?.[0] || "";
    assert.match(block, /security definer/);
    assert.match(block, /set search_path = ''/);
    assert.match(migration, new RegExp(`revoke all on function public\\.${functionName}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}[\\s\\S]*to authenticated`));
  }
  assert.match(migration, /private\.deployment_company_id\(\)/);
  assert.match(migration, /private\.has_company_permission/);
  assert.match(migration, /for update/);
  assert.match(migration, /private\.write_company_audit/);
  assert.match(migration, /CASH_TRANSACTION_CORRECTED/);
  assert.match(migration, /CASH_TRANSACTION_REVERSED/);
  assert.match(migration, /CASH_TRANSACTION_IGNORED/);
  assert.match(migration, /CASH_TRANSACTION_REVIEW_RESTORED/);
  assert.match(migration, /CASH_ACCOUNT_REACTIVATED/);
  assert.match(migration, /CASH_TRANSFER_REVERSED/);
});

test("Wave 2B3 closes direct mutation and committed import provenance bypasses", () => {
  assert.match(migration, /revoke insert, update, delete on table public\.financial_accounts, public\.financial_transactions, public\.financial_import_batches, public\.financial_transaction_matches from public, anon, authenticated/);
  assert.match(migration, /revoke update, delete on table public\.financial_balance_snapshots from public, anon, authenticated/);
  assert.match(migration, /grant select, insert on table public\.financial_balance_snapshots to authenticated/);
  assert.match(migration, /prevent_financial_import_batch_mutation/);
  assert.match(migration, /Committed statement provenance is append-only/);
  assert.match(migration, /financial_transaction_matches_transfer_group_idx/);
  assert.match(migration, /financial_transactions_reversal_metadata_check/);
});

test("Wave 2B3 database guards cover safe manual correction, ignore, transfer, and account history", () => {
  assert.match(migration, /Only an uncommitted, unreconciled MANUAL transaction without financial history may be edited/);
  assert.match(migration, /Reverse confirmed settlement or transfer evidence before reversing this transaction/);
  assert.match(migration, /Confirmed settlement or transfer evidence cannot be hidden by Ignore/);
  assert.match(migration, /The exact transfer pair and group are required/);
  assert.match(migration, /The transfer pair is no longer the exact confirmed relationship being reversed/);
  assert.match(migration, /financial identity and opening-balance fields cannot change after account history exists/i);
  assert.match(migration, /Inactive financial accounts must be reactivated before new activity is recorded/);
  assert.match(migration, /Financial import provenance must belong to the same company and account/);
  assert.match(migration, /transfer_group_id = null/);
  assert.match(migration, /v_left\.id, v_right\.id/);
});

test("Cash persistence adapters use authoritative RPCs and append-only snapshot inserts", () => {
  for (const rpc of [
    "save_financial_account",
    "deactivate_financial_account",
    "reactivate_financial_account",
    "create_financial_transaction",
    "correct_financial_transaction",
    "reverse_financial_transaction",
    "ignore_financial_transaction",
    "restore_financial_transaction_to_review",
    "reverse_financial_transfer",
    "confirm_financial_settlement_batch",
  ]) assert.match(persistence, new RegExp(`rpc\\(\"${rpc}\"`));
  assert.match(persistence, /financial_balance_snapshots"\)\.insert/);
  assert.doesNotMatch(persistence, /financial_accounts"\)\.upsert/);
  assert.doesNotMatch(persistence, /financial_transactions"\)\.upsert/);
  assert.doesNotMatch(persistence, /financial_accounts"\)\.update/);
  assert.doesNotMatch(persistence, /financial_transactions"\)\.update/);
});

test("Cash correction UI exposes permission-gated edit, reversal, review, transfer, and account lifecycles", () => {
  for (const label of ["Edit account", "Correct manual transaction", "Reverse transaction", "Mark ignored", "Return to review", "Reverse transfer", "Reactivate"]) assert.match(cashPage, new RegExp(label));
  assert.match(cashPage, /FinancialReasonDialog/);
  assert.match(cashPage, /Correction actions/);
  assert.doesNotMatch(cashPage, /window\.confirm/);
  assert.match(settlementWorkspace, /Reverse settlement/);
  assert.match(settlementWorkspace, /onReverseMatch/);
  assert.match(settlementWorkspace, /canReverseMatch/);
  assert.match(settlementWorkspace, /onSaveMatchBatch/);
  assert.match(app, /reverseFinancialTransferInSupabase/);
  assert.match(app, /confirmFinancialSettlementBatchToSupabase/);
});

test("Existing Assistant settlement confirmation and reversal remain on guarded RPC paths", () => {
  assert.match(assistant, /prepare_reverse_financial_settlement/);
  assert.match(assistant, /reverse_financial_settlement/);
  assert.match(assistant, /confirm_financial_settlement_batch/);
  assert.match(assistant, /Atomic database batch/);
  assert.match(assistant, /Return the ignored transaction to review/);
  assert.doesNotMatch(assistant, /from\("financial_transaction_matches"\)[\s\S]*\.insert/);
});

function transaction(overrides: Partial<FinancialTransaction> = {}): FinancialTransaction {
  return {
    id: "tx-manual",
    companyId: "company-a",
    accountId: "account-a",
    transactionDate: "2026-08-30",
    description: "Manual cash entry",
    direction: "DEBIT",
    amount: 100,
    currency: "PHP",
    status: "POSTED",
    source: "MANUAL",
    sourceFingerprint: "manual-fingerprint",
    reconciliationStatus: "UNMATCHED",
    createdAt: "2026-08-30T00:00:00Z",
    updatedAt: "2026-08-30T00:00:00Z",
    ...overrides,
  };
}

function match(overrides: Partial<FinancialTransactionMatch> = {}): FinancialTransactionMatch {
  return {
    id: "match-1",
    companyId: "company-a",
    transactionId: "tx-manual",
    targetType: "INVOICE",
    targetId: "invoice-a",
    matchedAmount: 100,
    status: "CONFIRMED",
    createdAt: "2026-08-30T00:00:00Z",
    updatedAt: "2026-08-30T00:00:00Z",
    ...overrides,
  };
}

test("Pure cash lifecycle contracts fail closed for used, imported, transfer, and ignored rows", () => {
  const manual = transaction();
  assert.equal(isManualTransactionCorrectionEligible(manual, []), true);
  assert.equal(isManualTransactionCorrectionEligible(transaction({ source: "CSV", importBatchId: "batch-1" }), []), false);
  assert.equal(isManualTransactionCorrectionEligible(transaction({ reconciliationStatus: "IGNORED" }), []), false);
  assert.equal(isManualTransactionCorrectionEligible(transaction({ transferGroupId: "transfer-1" }), []), false);
  assert.equal(isManualTransactionCorrectionEligible(manual, [match()]), false);
  assert.equal(hasFinancialTransactionHistory(manual.id, [match({ status: "REVERSED" })]), true);
  assert.equal(hasFinancialTransactionHistory(manual.id, [match({ status: "REJECTED" })]), false);

  const account: FinancialAccount = {
    id: "account-a",
    companyId: "company-a",
    accountType: "BANK",
    institutionName: "Fixture Bank",
    displayName: "Operating",
    currency: "PHP",
    openingBalance: 0,
    openingBalanceDate: "2026-01-01",
    connectionType: "MANUAL",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  const empty: CashBankingWorkspaceData = { accounts: [account], snapshots: [], transactions: [], importBatches: [], matches: [] };
  assert.equal(financialAccountHasHistory(account.id, empty), false);
  assert.equal(financialAccountHasHistory(account.id, { ...empty, transactions: [manual] }), true);
  assert.equal(financialAccountHasHistory(account.id, { ...empty, matches: [match()] }), false, "match history without its transaction is not treated as account history");
});
