import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDemoWorkspace } from "../src/demo/data/createDemoWorkspace.ts";
import { demoSettlementSummaryForTarget } from "../src/demo/data/settlements.ts";
import { resetDemoWorkspace } from "../src/demo/demoState.ts";

const ANCHOR = "2026-08-27";

test("demo settlement fixtures include full, partial, split and payroll examples", () => {
  const workspace = createDemoWorkspace(ANCHOR);
  const fullInvoice = demoSettlementSummaryForTarget("INVOICE", "demo-invoice-01", ANCHOR);
  const partialInvoice = demoSettlementSummaryForTarget("INVOICE", "demo-invoice-02", ANCHOR);
  const fullPayroll = demoSettlementSummaryForTarget("PAYROLL", "demo-payroll-run-8", ANCHOR);
  const partialPayroll = demoSettlementSummaryForTarget("PAYROLL", "demo-payroll-run-9", ANCHOR);
  assert.equal(fullInvoice?.settlementState, "PAID");
  assert.equal(partialInvoice?.settlementState, "PARTIALLY_PAID");
  assert.equal(fullPayroll?.settlementState, "SETTLED");
  assert.equal(partialPayroll?.settlementState, "PARTIALLY_DISBURSED");
  assert.ok((partialPayroll?.history.length || 0) >= 2);

  const splitMatches = workspace.cash.matches.filter((match) => match.transactionId === "demo-transaction-split-01" && match.status === "CONFIRMED");
  assert.equal(splitMatches.length, 2);
  assert.deepEqual(splitMatches.map((match) => match.matchedAmount).sort((a, b) => a - b), [120000, 180000]);
  assert.equal(splitMatches.reduce((sum, match) => sum + match.matchedAmount, 0), 300000);
});

test("demo includes unmatched debit, confirmed transfer and reversed history evidence", () => {
  const workspace = createDemoWorkspace(ANCHOR);
  assert.ok(workspace.cash.transactions.some((transaction) => transaction.direction === "DEBIT" && transaction.reconciliationStatus === "UNMATCHED"));
  const transferOut = workspace.cash.transactions.find((transaction) => transaction.id === "demo-transaction-transfer-out-01");
  const transferIn = workspace.cash.transactions.find((transaction) => transaction.id === "demo-transaction-11");
  assert.ok(transferOut?.transferGroupId);
  assert.equal(transferIn?.transferGroupId, transferOut?.transferGroupId);
  assert.equal(workspace.cash.matches.filter((match) => match.targetType === "TRANSFER" && match.status === "CONFIRMED").length, 2);

  const reversed = demoSettlementSummaryForTarget("INVOICE", "demo-invoice-06", ANCHOR)?.history.find((item) => item.status === "REVERSED");
  assert.ok(reversed);
  assert.ok(reversed?.reversalReason?.includes("Incorrect supplier"));
});

test("Reset Demo restores the deterministic financial settlement graph", () => {
  const first = createDemoWorkspace(ANCHOR);
  const reset = resetDemoWorkspace(ANCHOR);
  assert.deepEqual(reset.cash.transactions, first.cash.transactions);
  assert.deepEqual(reset.cash.matches, first.cash.matches);
  assert.deepEqual(reset.invoices, first.invoices);
  assert.deepEqual(reset.payroll.runs, first.payroll.runs);
});

test("demo settlement construction does not mount production Supabase persistence", () => {
  const createSource = readFileSync("src/demo/data/createDemoWorkspace.ts", "utf8");
  const settlementSource = readFileSync("src/demo/data/settlements.ts", "utf8");
  assert.doesNotMatch(createSource, /from\(["']financial_|\.rpc\(|supabase/i);
  assert.doesNotMatch(settlementSource, /from\(["']financial_|\.rpc\(|supabase/i);
});
