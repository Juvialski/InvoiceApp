import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSupplierInvoicePaymentTransaction, deriveSupplierInvoicePaymentState, supplierInvoicePaymentAmount } from "../src/lib/supplierInvoicePayment.ts";
import type { FinancialSettlementSummary } from "../src/lib/financialSettlement.ts";

function settlement(overrides: Partial<FinancialSettlementSummary> = {}): FinancialSettlementSummary {
  return {
    targetType: "EXPENSE",
    targetId: "expense-1",
    currency: "USD",
    lifecycleStatus: "APPROVED",
    settlementBasis: 11.72,
    basisSource: "EXPENSE_AMOUNT",
    reconciledCashPaid: 0,
    documentReportedPaid: 0,
    effectiveSettled: 0,
    outstanding: 11.72,
    settlementState: "UNPAID",
    history: [],
    ...overrides,
  };
}

const invoice = { reviewStatus: "VERIFIED" as const, lifecycleStatus: "ACTIVE" as const, dueDate: "2026-09-01" };
const expense = { status: "APPROVED" as const, amount: 11.72 };

test("linked Expense settlement is the supplier invoice display truth", () => {
  assert.equal(deriveSupplierInvoicePaymentState(invoice, expense, settlement(), "2026-09-10"), "OVERDUE");
  assert.equal(deriveSupplierInvoicePaymentState(invoice, expense, settlement({ reconciledCashPaid: 5, effectiveSettled: 5, outstanding: 6.72, settlementState: "PARTIALLY_PAID" }), "2026-09-10"), "OVERDUE");
  assert.equal(deriveSupplierInvoicePaymentState(invoice, expense, settlement({ reconciledCashPaid: 11.72, effectiveSettled: 11.72, outstanding: 0, settlementState: "PAID" }), "2026-09-10"), "PAID");
});

test("settlement reversal restores the derived outstanding state", () => {
  const paid = settlement({ reconciledCashPaid: 11.72, effectiveSettled: 11.72, outstanding: 0, settlementState: "PAID" });
  const reversed = settlement({ reconciledCashPaid: 0, effectiveSettled: 0, outstanding: 11.72, settlementState: "UNPAID" });
  assert.equal(deriveSupplierInvoicePaymentState(invoice, expense, paid, "2026-09-10"), "PAID");
  assert.equal(deriveSupplierInvoicePaymentState(invoice, expense, reversed, "2026-09-10"), "OVERDUE");
});

test("Paid consumes the full remaining balance while Partially Paid requires a smaller positive amount", () => {
  assert.equal(supplierInvoicePaymentAmount("PAID", 11.72), 11.72);
  assert.equal(supplierInvoicePaymentAmount("PARTIALLY_PAID", 11.72, 5), 5);
  assert.throws(() => supplierInvoicePaymentAmount("PARTIALLY_PAID", 11.72, 11.72), /Choose Paid/);
  assert.throws(() => supplierInvoicePaymentAmount("PARTIALLY_PAID", 11.72, 0), /greater than zero/);
});

test("supplier payment transaction is canonical debit evidence, not an invoice paid flag", () => {
  const transaction = buildSupplierInvoicePaymentTransaction({
    invoiceId: "invoice-1",
    invoiceNumber: "IN-77947404",
    expenseId: "expense-1",
    accountId: "account-1",
    paymentDate: "2026-09-10",
    amount: 11.72,
    currency: "USD",
    referenceNumber: "CF-PAID",
    now: "2026-09-10T02:00:00.000Z",
  });
  assert.equal(transaction.direction, "DEBIT");
  assert.equal(transaction.status, "POSTED");
  assert.equal(transaction.source, "MANUAL");
  assert.equal(transaction.amount, 11.72);
  assert.equal(transaction.currency, "USD");
  assert.equal(transaction.accountId, "account-1");
  assert.match(transaction.sourceFingerprint, /^cash-/);
});

test("normal supplier payment stays inside Change Status and uses canonical Expense settlement persistence", () => {
  const surface = readFileSync("src/components/SupplierInvoiceExpenseSurface.tsx", "utf8");
  const dialog = readFileSync("src/components/SupplierInvoicePaymentDialog.tsx", "utf8");
  assert.match(surface, /Change Status/);
  assert.match(surface, /deriveSupplierInvoicePaymentState/);
  assert.match(surface, /Open\/Correct linked Expense/);
  assert.doesNotMatch(surface, /recordPaymentPath=/);
  assert.match(dialog, />Paid</);
  assert.match(dialog, />Partially Paid</);
  assert.match(dialog, /Confirm Payment/);
  assert.match(dialog, /supplier-derived DRAFT Expense remains a DRAFT cost record/);
  assert.doesNotMatch(dialog, /saveExpenseToSupabase/);
  assert.match(dialog, /listFinancialAccounts/);
  assert.match(dialog, /saveFinancialAccountToSupabase/);
  assert.match(dialog, /saveFinancialTransactionToSupabase/);
  assert.match(dialog, /confirmFinancialSettlement/);
  assert.match(dialog, /targetType: "EXPENSE"/);
  assert.match(dialog, /reverseFinancialTransactionInSupabase/);
  assert.doesNotMatch(dialog, /invoice\.(?:status|paymentStatus)\s*=/);
});

test("live supplier payment state fails closed until authoritative settlement evidence is available", () => {
  const surface = readFileSync("src/components/SupplierInvoiceExpenseSurface.tsx", "utf8");
  assert.match(surface, /setSummary\(currentExpense\.id\.startsWith\("demo-"\) \? demoSummary : null\)/);
  assert.match(surface, /Loading authoritative payment status/);
  assert.match(surface, /No payment status change is offered until the authoritative Expense settlement can be read\./);
  assert.doesNotMatch(surface, /setSummary\(fallbackSummary\)/);
});

test("supplier-derived DRAFT survives payment failure and successful settlement is never undone by refresh failure", () => {
  const dialog = readFileSync("src/components/SupplierInvoicePaymentDialog.tsx", "utf8");
  assert.doesNotMatch(dialog, /paymentExpense = await saveExpenseToSupabase/);
  assert.doesNotMatch(dialog, /status: "APPROVED"/);
  assert.match(dialog, /let settlementConfirmed = false/);
  assert.match(dialog, /settlementConfirmed = true/);
  assert.match(dialog, /if \(transactionId && !settlementConfirmed\)/);
  assert.match(dialog, /Keep the confirmed local projection/);
});

test("Assistant compensation stops once supplier settlement confirmation is authoritative", () => {
  const assistant = readFileSync("src/server/assistant/financialSettlementAssistant.ts", "utf8");
  assert.match(assistant, /const paymentExpense = resolved\.expense/);
  assert.doesNotMatch(assistant, /approveLinkedExpenseForPayment/);
  assert.match(assistant, /let settlementConfirmed = false/);
  assert.match(assistant, /settlementConfirmed = true/);
  assert.match(assistant, /if \(transactionCreated && !settlementConfirmed\)/);
  assert.match(assistant, /settlementRefreshRequired/);
  assert.match(assistant, /paymentAuthority: \{ targetType: "EXPENSE"/);
});

test("zero-account and mobile payment flow remain inline and bounded", () => {
  const dialog = readFileSync("src/components/SupplierInvoicePaymentDialog.tsx", "utf8");
  assert.match(dialog, /Add Cash\/Bank Account/);
  assert.match(dialog, /inline-financial-account-form/);
  assert.match(dialog, /setAccountId\(created\.id\)/);
  assert.match(dialog, /max-w-lg/);
  assert.match(dialog, /max-h-\[90vh\]/);
  assert.match(dialog, /overflow-y-auto/);
  assert.match(dialog, /grid-cols-1/);
  assert.match(dialog, /sm:grid-cols-2/);
});

test("payment permissions fail closed across transaction creation, settlement, and account creation", () => {
  const dialog = readFileSync("src/components/SupplierInvoicePaymentDialog.tsx", "utf8");
  assert.doesNotMatch(dialog, /PERMISSION_KEYS\.expensesWrite/);
  assert.match(dialog, /PERMISSION_KEYS\.cashTransactionsManage/);
  assert.match(dialog, /PERMISSION_KEYS\.cashReconcile/);
  assert.match(dialog, /PERMISSION_KEYS\.cashAccountsManage/);
  assert.match(dialog, /canRecordPayment/);
  assert.doesNotMatch(dialog, /permission to approve the linked Expense/);
});
