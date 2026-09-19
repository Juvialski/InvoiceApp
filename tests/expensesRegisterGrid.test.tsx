import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("../src/components/expenses/ExpensesPage.tsx", import.meta.url), "utf8");

test("Expenses page uses the shared desktop grid and keeps the mobile/detail authorities", () => {
  assert.match(pageSource, /OperationsGrid/);
  assert.match(pageSource, /ExpensesWorkbookPanel/);
  assert.match(pageSource, /ExpenseRegisterCard/);
  assert.match(pageSource, /FinancialSettlementCard/);
  assert.match(pageSource, /settlementForExpenseWorkbook/);
  assert.match(pageSource, /onRefreshExpenses/);
  assert.match(pageSource, /onApplyExpenseWorkbook/);
});

test("Expense grid marks direct draft edits as editable and linked settlement/source values as protected", () => {
  assert.match(pageSource, /editable:\s*\(expense\).*status === ["']DRAFT["']/s);
  assert.match(pageSource, /protected:\s*\(expense\).*supplierInvoiceId/s);
  assert.match(pageSource, /protected:\s*\(expense\).*settlement/s);
});

test("Expense workbook integration preserves the existing route and financial action callbacks", () => {
  assert.match(pageSource, /onReviewCorrection/);
  assert.match(pageSource, /onConfirmFx/);
  assert.match(pageSource, /onNavigatePath/);
  assert.match(pageSource, /appPathForCashTarget/);
  assert.match(pageSource, /appPathForInvoice/);
  assert.match(pageSource, /appPathForPurchaseOrder/);
  assert.match(pageSource, /key: ["']source["'][\s\S]{0,1400}invoicePath \? <a/);
});
