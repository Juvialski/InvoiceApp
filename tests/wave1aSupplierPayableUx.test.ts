import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDemoWorkspace } from "../src/demo/data/createDemoWorkspace.ts";
import { demoSettlementSummaryForTarget } from "../src/demo/data/settlements.ts";
import { isFinancialReconciliationCandidateLifecycleEligible } from "../src/lib/cashBanking.ts";
import { appPathForCashTarget, appPathForExpense, parseAppLocation } from "../src/utils/appRouting.ts";
import { displayFinancialAmountInPhp } from "../src/utils/financialCurrency.ts";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("Wave 1A demo keeps supplier invoice evidence linked to one authoritative Expense payable", () => {
  const workspace = createDemoWorkspace("2026-08-27");
  const invoice = workspace.invoices.find((item) => item.id === "demo-invoice-02");
  const expense = workspace.expenses.find((item) => item.id === "demo-expense-supplier-bm-02");
  assert.equal(invoice?.linkedExpenseId, expense?.id);
  assert.equal(expense?.supplierInvoiceId, invoice?.id);
  assert.equal(demoSettlementSummaryForTarget("EXPENSE", expense!.id, "2026-08-27")?.outstanding, 412_415.75);
  assert.equal(workspace.cash.matches.filter((match) => match.targetType === "INVOICE" && match.targetId === invoice?.id).length, 0);
  assert.equal(workspace.cash.matches.filter((match) => match.targetType === "EXPENSE" && match.targetId === expense?.id).length, 1);
});

test("Wave 1A routes carry exact Expense and Cash target identity", () => {
  assert.equal(appPathForExpense("expense-42"), "/expenses?expenseId=expense-42");
  assert.equal(parseAppLocation(appPathForExpense("expense-42")).kind, "expense");
  assert.equal(appPathForCashTarget("EXPENSE", "expense-42"), "/cash?fromTargetType=EXPENSE&fromTargetId=expense-42");
  assert.equal(isFinancialReconciliationCandidateLifecycleEligible({ targetType: "EXPENSE", lifecycleStatus: "APPROVED" }), true);
  assert.equal(isFinancialReconciliationCandidateLifecycleEligible({ targetType: "EXPENSE", lifecycleStatus: "DRAFT" }), false);
});

test("cash candidate builders preserve lifecycle context required by the shared settlement gate", () => {
  assert.equal(isFinancialReconciliationCandidateLifecycleEligible({ targetType: "PAYROLL", lifecycleStatus: "APPROVED" }), true);
  assert.equal(isFinancialReconciliationCandidateLifecycleEligible({ targetType: "PAYROLL", lifecycleStatus: "CALCULATED" }), false);
  const app = source("src/App.tsx");
  const demo = source("src/demo/DemoWorkspace.tsx");
  assert.match(app, /description: "Payroll payment", lifecycleStatus: run\.status/);
  assert.match(demo, /description: "Payroll payment", lifecycleStatus: run\.status/);
});

test("Wave 1A UI uses the existing settlement evidence and guarded Cash route", () => {
  const surface = source("src/components/SupplierInvoiceExpenseSurface.tsx");
  const card = source("src/components/FinancialSettlementCard.tsx");
  const expensePage = source("src/components/expenses/ExpensesPage.tsx");
  const cashWorkspace = source("src/components/CashSettlementAllocationWorkspace.tsx");
  const cashPage = source("src/components/CashBankingPage.tsx");
  assert.match(surface, /Open Expense/);
  assert.match(surface, /recordPaymentPath=\{appPathForCashTarget\("EXPENSE", linkedExpense\.id\)\}/);
  assert.match(card, /Record Payment/);
  assert.match(card, /isSettlementTargetLifecycleEligible/);
  assert.doesNotMatch(card, /Mark Paid/);
  assert.match(expensePage, /selectedExpenseId/);
  assert.match(expensePage, /data-testid="expense-detail-panel"/);
  assert.match(expensePage, /sm:grid-cols-2/);
  assert.match(cashWorkspace, /targetContext/);
  assert.match(cashWorkspace, /appPathForExpense/);
  assert.match(cashWorkspace, /Requested target/);
  assert.match(cashPage, /selectedTransactionId/);
  assert.match(cashPage, /cash-page-target-context/);
});

test("PHP display uses confirmed source FX and stays explicit when conversion evidence is absent", () => {
  const snapshot = {
    id: "fx-42", sourceType: "SUPPLIER_INVOICE" as const, sourceId: "invoice-42", sourceAmount: 10,
    sourceCurrency: "USD", baseCurrency: "PHP", rate: 56.25, rateDate: "2026-08-27", rateSource: "MANUAL" as const,
    confirmedAt: "2026-08-27T00:00:00Z", createdAt: "2026-08-27T00:00:00Z", baseAmount: 562.5,
  };
  assert.equal(displayFinancialAmountInPhp(10, "USD", "SUPPLIER_INVOICE", "invoice-42", [snapshot]).baseLabel, "₱562.50");
  assert.equal(displayFinancialAmountInPhp(10, "USD", "SUPPLIER_INVOICE", "invoice-other", [snapshot]).baseLabel, "PHP conversion required");
});
