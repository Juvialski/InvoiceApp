import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Expenses route and AppRouter expose the workbook refresh and Apply boundaries", () => {
  assert.match(read("src/app/routes/ExpensesRoute.tsx"), /onRefreshExpenses/);
  assert.match(read("src/app/routes/ExpensesRoute.tsx"), /onApplyExpenseWorkbook/);
  assert.match(read("src/app/routes/AppRouter.tsx"), /settlementProjections/);
  assert.match(read("src/app/routes/AppRouter.tsx"), /onRefreshExpenses/);
  assert.match(read("src/app/routes/AppRouter.tsx"), /onApplyExpenseWorkbook/);
});

test("App owns Expense workbook permissions, refresh, and authoritative persistence", () => {
  const app = read("src/App.tsx");
  assert.match(app, /loadExpensesFromSupabase/);
  assert.match(app, /saveExpenseToSupabase/);
  assert.match(app, /onApplyExpenseWorkbook/);
  assert.match(app, /PERMISSION_KEYS\.expensesWrite/);
  assert.match(app, /persistExpense/);
  assert.match(app, /updatedAt/);
  const applyStart = app.indexOf("const handleApplyExpenseWorkbook");
  const refreshStart = app.indexOf("const handleRefreshExpensesWorkbook", applyStart);
  assert.ok(applyStart >= 0 && refreshStart > applyStart);
  const applyBody = app.slice(applyStart, refreshStart);
  assert.doesNotMatch(applyBody, /applyExpenseCorrection|verifySupplierInvoiceAndCreateExpense/);
});
