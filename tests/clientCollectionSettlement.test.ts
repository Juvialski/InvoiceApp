import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { suggestFinancialMatches, type FinancialTransaction } from "../src/lib/cashBanking.ts";
import {
  assertSettlementInput,
  deriveClientCollectionSettlementSummary,
  eligibleSettlementCandidates,
  type FinancialSettlementHistoryItem,
} from "../src/lib/financialSettlement.ts";
import type { ClientCollection } from "../src/lib/clientCollections.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260904100000_client_collection_cash_settlement_linkage.sql", import.meta.url), "utf8");
const settlementPanel = readFileSync(new URL("../src/components/projects/ClientCollectionSettlementPanel.tsx", import.meta.url), "utf8");
const cashWorkspace = readFileSync(new URL("../src/components/CashSettlementAllocationWorkspace.tsx", import.meta.url), "utf8");

function collection(overrides: Partial<ClientCollection> = {}): ClientCollection {
  return {
    id: "collection-1",
    companyId: "company-1",
    projectId: "project-1",
    collectionNumber: "COL-001",
    collectionDate: "2026-09-04",
    currency: "PHP",
    status: "RECORDED",
    allocations: [{ id: "allocation-1", companyId: "company-1", collectionId: "collection-1", billingId: "billing-1", amount: 1000 }],
    createdAt: "2026-09-04T00:00:00Z",
    updatedAt: "2026-09-04T00:00:00Z",
    ...overrides,
  };
}

function transaction(overrides: Partial<FinancialTransaction> = {}): FinancialTransaction {
  return {
    id: "transaction-1",
    companyId: "company-1",
    accountId: "account-1",
    transactionDate: "2026-09-04",
    description: "Client receipt",
    direction: "CREDIT",
    amount: 1000,
    currency: "PHP",
    status: "POSTED",
    source: "CSV",
    sourceFingerprint: "transaction-1",
    reconciliationStatus: "UNMATCHED",
    createdAt: "2026-09-04T00:00:00Z",
    updatedAt: "2026-09-04T00:00:00Z",
    ...overrides,
  };
}

function history(id: string, status: FinancialSettlementHistoryItem["status"], amount: number): FinancialSettlementHistoryItem {
  return { id, transactionId: `transaction-${id}`, status, amount, currency: "PHP" };
}

test("client collection settlement summary uses allocation-derived amount and clear link states", () => {
  const recorded = collection({
    allocations: [
      { id: "a1", companyId: "company-1", collectionId: "collection-1", billingId: "billing-1", amount: 600 },
      { id: "a2", companyId: "company-1", collectionId: "collection-1", billingId: "billing-2", amount: 400 },
    ],
  });
  const partial = deriveClientCollectionSettlementSummary(recorded, [history("one", "CONFIRMED", 350), history("old", "REVERSED", 200)]);
  assert.equal(partial.settlementBasis, 1000);
  assert.equal(partial.collectionTotal, 1000);
  assert.equal(partial.linkedAmount, 350);
  assert.equal(partial.remainingUnlinkedAmount, 650);
  assert.equal(partial.linkState, "PARTIALLY_LINKED");
  assert.equal(partial.settlementState, "PARTIALLY_LINKED");
  assert.equal(partial.basisSource, "CLIENT_COLLECTION_ALLOCATIONS");

  const linked = deriveClientCollectionSettlementSummary(recorded, [history("one", "CONFIRMED", 600), history("two", "CONFIRMED", 400)]);
  assert.equal(linked.linkState, "LINKED");
  assert.equal(linked.remainingUnlinkedAmount, 0);

  const unlinked = deriveClientCollectionSettlementSummary(collection(), []);
  assert.equal(unlinked.linkState, "UNLINKED");
  assert.equal(unlinked.remainingUnlinkedAmount, 1000);
});

test("settlement direction is target-specific and payable-side DEBIT behavior remains intact", () => {
  assert.doesNotThrow(() => assertSettlementInput(transaction(), "PHP", 100, "CLIENT_COLLECTION"));
  assert.throws(() => assertSettlementInput(transaction({ direction: "DEBIT" }), "PHP", 100, "CLIENT_COLLECTION"), /CREDIT/);
  assert.doesNotThrow(() => assertSettlementInput(transaction({ direction: "DEBIT" }), "PHP", 100, "INVOICE"));
  assert.throws(() => assertSettlementInput(transaction({ direction: "CREDIT" }), "PHP", 100, "INVOICE"), /DEBIT/);
  assert.throws(() => assertSettlementInput(transaction({ status: "PENDING" }), "PHP", 100, "CLIENT_COLLECTION"), /POSTED/);
  assert.throws(() => assertSettlementInput(transaction(), "USD", 100, "CLIENT_COLLECTION"), /currency/i);
});

test("eligible settlement candidates separate incoming collections from outgoing obligations", () => {
  const candidates = [
    { targetType: "CLIENT_COLLECTION" as const, targetId: "recorded", label: "Recorded collection", currency: "PHP", amount: 1000, settlementBasis: 1000, settledAmount: 0, outstandingAmount: 1000, lifecycleStatus: "RECORDED" },
    { targetType: "CLIENT_COLLECTION" as const, targetId: "draft", label: "Draft collection", currency: "PHP", amount: 1000, settlementBasis: 1000, settledAmount: 0, outstandingAmount: 1000, lifecycleStatus: "DRAFT" },
    { targetType: "INVOICE" as const, targetId: "invoice", label: "Invoice", currency: "PHP", amount: 1000, settlementBasis: 1000, settledAmount: 0, outstandingAmount: 1000, lifecycleStatus: "VERIFIED" },
    { targetType: "EXPENSE" as const, targetId: "expense", label: "Expense", currency: "PHP", amount: 1000, settlementBasis: 1000, settledAmount: 0, outstandingAmount: 1000, lifecycleStatus: "APPROVED" },
  ];
  assert.deepEqual(eligibleSettlementCandidates(transaction(), candidates).map((candidate) => candidate.targetId), ["recorded"]);
  assert.deepEqual(eligibleSettlementCandidates(transaction({ direction: "DEBIT" }), candidates).map((candidate) => candidate.targetId), ["invoice", "expense"]);
  assert.deepEqual(suggestFinancialMatches(transaction({ description: "Recorded collection" }), candidates).map((suggestion) => suggestion.candidate.targetId), ["recorded"]);
  assert.deepEqual(suggestFinancialMatches(transaction({ direction: "DEBIT", description: "Invoice payment" }), candidates).map((suggestion) => suggestion.candidate.targetId), ["invoice", "expense"]);
});

test("P2B-6 migration extends the existing guarded settlement model without a duplicate source", () => {
  assert.match(migration, /drop constraint if exists financial_transaction_matches_target_type_check/);
  assert.match(migration, /CLIENT_COLLECTION/);
  assert.match(migration, /v_transaction\.direction <> 'CREDIT'/);
  assert.match(migration, /v_transaction\.direction <> 'DEBIT'/);
  assert.match(migration, /v_collection\.status <> 'RECORDED'/);
  assert.match(migration, /client_collection_allocations/);
  assert.match(migration, /financial_transaction_matches/);
  assert.match(migration, /projects\.manage/);
  assert.match(migration, /cash\.reconcile/);
  assert.match(migration, /for update/gi);
  assert.match(migration, /CASH_SETTLEMENT_CONFIRMED/);
  assert.match(migration, /CASH_SETTLEMENT_REVERSED/);
  assert.match(migration, /Reverse active cash settlement links before reversing/);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.confirm_financial_settlement/);
  assert.doesNotMatch(migration, /client_collection_settlements/i);
  assert.doesNotMatch(migration, /Collected to Date|collected_to_date|actual cost|actual_cost/i);
});

test("P2B-6 UI keeps incoming linkage explicit and exposes the guarded history workflow", () => {
  for (const text of ["Collection amount", "Bank-linked amount", "Remaining unlinked", "Eligible CREDIT transactions", "Confirm link", "Open in Cash &amp; Banking", "Reverse link"]) {
    assert.match(settlementPanel, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(settlementPanel, /window\.confirm/);
  assert.match(settlementPanel, /CLIENT_COLLECTION/);
  assert.match(cashWorkspace, /direction === "CREDIT"/);
  assert.match(cashWorkspace, /allowedTypes/);
  assert.match(cashWorkspace, /CLIENT_COLLECTION/);
  assert.doesNotMatch(settlementPanel, /client_collection_settlements/i);
});
