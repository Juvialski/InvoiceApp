import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathForAssistantAction } from "../src/assistant/assistantNavigation.ts";
import { getAssistantToolDefinition, validateAssistantToolArguments } from "../src/server/assistant/toolRegistry.ts";

const TX = "11111111-1111-4111-8111-111111111111";
const INV = "22222222-2222-4222-8222-222222222222";
const PAY = "33333333-3333-4333-8333-333333333333";
const MATCH = "44444444-4444-4444-8444-444444444444";

test("settlement mutations are PREPARE tools with explicit confirmation", () => {
  for (const name of [
    "prepare_match_transaction_to_invoice",
    "prepare_match_transaction_to_payroll",
    "prepare_split_transaction_allocation",
    "prepare_reverse_financial_settlement",
  ]) {
    const definition = getAssistantToolDefinition(name);
    assert.ok(definition, `${name} should be registered`);
    assert.equal(definition.riskTier, "PREPARE");
    assert.equal(definition.requiresConfirmation, true);
  }
});

test("single settlement validation preserves prepared match id during confirmation revalidation", () => {
  const first = validateAssistantToolArguments("prepare_match_transaction_to_invoice", {
    transactionId: TX,
    invoiceId: INV,
    amount: 12500.25,
  });
  assert.match(String(first.matchId), /^[0-9a-f-]{36}$/i);
  const second = validateAssistantToolArguments("prepare_match_transaction_to_invoice", first);
  assert.equal(second.matchId, first.matchId);
});

test("split settlement validation preserves every prepared idempotency id", () => {
  const first = validateAssistantToolArguments("prepare_split_transaction_allocation", {
    transactionId: TX,
    allocations: [
      { targetType: "INVOICE", targetId: INV, amount: 60000 },
      { targetType: "PAYROLL", targetId: PAY, amount: 40000 },
    ],
  });
  const rows = first.allocations as Array<Record<string, unknown>>;
  assert.equal(rows.length, 2);
  const ids = rows.map((row) => row.matchId);
  const second = validateAssistantToolArguments("prepare_split_transaction_allocation", first);
  assert.deepEqual((second.allocations as Array<Record<string, unknown>>).map((row) => row.matchId), ids);
});

test("split settlement permissions only require the target domains actually present", () => {
  const definition = getAssistantToolDefinition("prepare_split_transaction_allocation");
  assert.ok(definition);
  assert.equal(typeof definition.permissions, "function");
  const resolve = definition.permissions as (args: Record<string, unknown>) => string[];
  assert.deepEqual(resolve({ allocations: [{ targetType: "INVOICE" }] }), ["cash.reconcile", "invoices.manage"]);
  assert.deepEqual(resolve({ allocations: [{ targetType: "PAYROLL" }] }), ["cash.reconcile", "payroll.approve"]);
  assert.deepEqual(resolve({ allocations: [{ targetType: "INVOICE" }, { targetType: "PAYROLL" }] }), ["cash.reconcile", "invoices.manage", "payroll.approve"]);
});

test("settlement Assistant navigation uses exact canonical deep links", () => {
  assert.equal(pathForAssistantAction({ type: "OPEN_FINANCIAL_TRANSACTION", entityId: TX }), `/cash?transactionId=${encodeURIComponent(TX)}`);
  assert.equal(pathForAssistantAction({ type: "OPEN_PAYROLL_RUN", entityId: PAY }), `/payroll?runId=${encodeURIComponent(PAY)}`);
});

test("reversal validation requires an auditable reason and preserves match id", () => {
  const args = validateAssistantToolArguments("prepare_reverse_financial_settlement", { matchId: MATCH, reason: "Matched to the wrong supplier invoice" });
  assert.equal(args.matchId, MATCH);
  assert.equal(args.reason, "Matched to the wrong supplier invoice");
  assert.throws(() => validateAssistantToolArguments("prepare_reverse_financial_settlement", { matchId: MATCH, reason: "" }));
});

test("Assistant settlement execution is routed through guarded RPCs and atomic batch", () => {
  const moduleSource = readFileSync("src/server/assistant/financialSettlementAssistant.ts", "utf8");
  const handlerSource = readFileSync("src/server/assistant/assistantHandler.ts", "utf8");
  const batchMigration = readFileSync("supabase/migrations/20260827213000_financial_settlement_batch_rpc.sql", "utf8");
  assert.match(moduleSource, /confirm_financial_settlement/);
  assert.match(moduleSource, /confirm_financial_settlement_batch/);
  assert.match(moduleSource, /reverse_financial_settlement/);
  assert.match(moduleSource, /projectCostImpact:\s*0/);
  assert.match(handlerSource, /executePreparedFinancialSettlementAction/);
  assert.match(handlerSource, /status:\s*"EXECUTED"/);
  assert.match(batchMigration, /public\.confirm_financial_settlement\(/);
  assert.match(batchMigration, /for update/i);
  assert.doesNotMatch(moduleSource, /attendance_records.*(?:insert|update|delete)|overtime_requests.*(?:insert|update|delete)/i);
  assert.doesNotMatch(moduleSource, /project_cost|invoice_project_allocations.*(?:insert|update|delete)|payroll_project_allocations.*(?:insert|update|delete)/i);
});
