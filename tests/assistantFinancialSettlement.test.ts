import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathForAssistantAction } from "../src/assistant/assistantNavigation.ts";
import { getAssistantToolDefinition, validateAssistantToolArguments } from "../src/server/assistant/toolRegistry.ts";

const TX = "11111111-1111-4111-8111-111111111111";
const INV = "22222222-2222-4222-8222-222222222222";
const PAY = "33333333-3333-4333-8333-333333333333";
const MATCH = "44444444-4444-4444-8444-444444444444";
const ACCOUNT = "55555555-5555-4555-8555-555555555555";

test("settlement mutations are PREPARE tools with explicit confirmation", () => {
  for (const name of [
    "prepare_supplier_invoice_payment",
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

test("supplier invoice payment options are a read tool and payment preparation binds idempotency ids", () => {
  const options = getAssistantToolDefinition("get_supplier_invoice_payment_options");
  assert.ok(options);
  assert.equal(options.riskTier, "READ");
  const first = validateAssistantToolArguments("prepare_supplier_invoice_payment", {
    invoiceId: INV,
    accountId: ACCOUNT,
    paymentMode: "PAID",
    paymentDate: "2026-09-10",
  });
  assert.match(String(first.transactionId), /^[0-9a-f-]{36}$/i);
  assert.match(String(first.matchId), /^[0-9a-f-]{36}$/i);
  const second = validateAssistantToolArguments("prepare_supplier_invoice_payment", first);
  assert.equal(second.transactionId, first.transactionId);
  assert.equal(second.matchId, first.matchId);
  assert.throws(() => validateAssistantToolArguments("prepare_supplier_invoice_payment", { invoiceId: INV, accountId: ACCOUNT, paymentMode: "PAID", paymentDate: "09/10/2026" }));
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
  assert.deepEqual(resolve({ allocations: [{ targetType: "INVOICE" }] }), ["cash.reconcile", "invoices.manage", "expenses.read"]);
  assert.deepEqual(resolve({ allocations: [{ targetType: "PAYROLL" }] }), ["cash.reconcile", "payroll.approve"]);
  assert.deepEqual(resolve({ allocations: [{ targetType: "INVOICE" }, { targetType: "PAYROLL" }] }), ["cash.reconcile", "invoices.manage", "expenses.read", "payroll.approve"]);
});

test("supplier payment preparation requires the same financial authorities as the manual flow", () => {
  const definition = getAssistantToolDefinition("prepare_supplier_invoice_payment");
  assert.ok(definition);
  assert.deepEqual(definition.permissions, ["invoices.read", "expenses.read", "expenses.manage", "cash.summary.read", "cash.transactions.manage", "cash.reconcile"]);
});

test("linked Expense authority inspection always requires expenses.read", () => {
  for (const name of ["get_invoice_settlement", "list_open_invoice_settlements", "prepare_match_transaction_to_invoice"]) {
    const definition = getAssistantToolDefinition(name);
    assert.ok(definition);
    assert.ok(Array.isArray(definition.permissions));
    assert.ok(definition.permissions.includes("expenses.read"), "linked Expense authority inspection must require expenses.read");
  }
  const split = getAssistantToolDefinition("prepare_split_transaction_allocation");
  assert.ok(split);
  assert.equal(typeof split.permissions, "function");
  const resolve = split.permissions as (args: Record<string, unknown>) => string[];
  assert.ok(resolve({ allocations: [{ targetType: "INVOICE" }] }).includes("expenses.read"));
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

test("Assistant supplier payment resolves linked Expense authority and never mutates invoice payment truth", () => {
  const moduleSource = readFileSync("src/server/assistant/financialSettlementAssistant.ts", "utf8");
  assert.match(moduleSource, /supplier_invoice_id/);
  assert.match(moduleSource, /p_target_type: "EXPENSE"/);
  assert.match(moduleSource, /create_financial_transaction/);
  assert.match(moduleSource, /DRAFT lifecycle remains unchanged/);
  assert.doesNotMatch(moduleSource, /approveLinkedExpenseForPayment/);
  assert.match(moduleSource, /SETTLEMENT_AUTHORITY_IS_EXPENSE/);
  assert.match(moduleSource, /reverse_financial_transaction/);
  assert.doesNotMatch(moduleSource, /invoices[\s\S]{0,120}\.update\(/i);
  assert.doesNotMatch(moduleSource, /payment_status\s*:/i);
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
