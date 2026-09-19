import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Expense } from "../src/types.ts";
import { ExpensesWorkbookPanel } from "../src/components/expenses/ExpensesWorkbookPanel.tsx";

const expense: Expense = {
  id: "expense-1",
  expenseDate: "2026-09-20",
  category: "Fuel",
  description: "Site fuel",
  amount: 100,
  currency: "PHP",
  status: "DRAFT",
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const records = {
  expectedCompanyId: "company-1",
  expenses: [expense],
  projects: [],
  costCodes: [],
  invoices: [],
  purchaseOrders: [],
  vendors: [],
  settlementMatches: [],
};

test("Expenses workbook panel exposes export/import review and truthful read-only messaging", () => {
  const html = renderToStaticMarkup(
    <ExpensesWorkbookPanel
      {...records}
      canManage={false}
      onApplyExpenseWorkbook={async () => undefined}
    />,
  );
  assert.match(html, /Excel-native Expenses workbook/);
  assert.match(html, /Export editable workbook/);
  assert.match(html, /Import workbook/);
  assert.match(html, /Upload is available for review only/);
  const panelSource = readFileSync(new URL("../src/components/expenses/ExpensesWorkbookPanel.tsx", import.meta.url), "utf8");
  assert.match(panelSource, /buildExpensesImportReview/);
  assert.match(panelSource, /applyExpensesImport/);
  assert.match(panelSource, /onRefreshExpenses/);
  assert.match(panelSource, /onApplyExpenseWorkbook/);
  assert.doesNotMatch(panelSource, /from ["']\.\.\/\.\.\/lib\/supabase/);
  assert.doesNotMatch(panelSource, /\.from\(["']expenses["']\)/);
});
