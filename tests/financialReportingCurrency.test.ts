import assert from "node:assert/strict";
import test from "node:test";
import { createLocalFinancialFxSnapshot } from "../src/lib/financialFx.ts";
import { unallocatedCostByCurrency } from "../src/utils/projectCosting.ts";
import { buildDashboardViewData } from "../src/utils/dashboardViewModel.ts";
import { displayFinancialAmountInPhp } from "../src/utils/financialCurrency.ts";
import type { Expense, InvoiceData } from "../src/types.ts";

const sourceInvoice = {
  id: "production-source-invoice-usd-1172",
  invoiceNumber: "USD-1172",
  invoiceDate: "2026-09-01",
  currency: "USD",
  vendor: { name: "International Document Services" },
  customer: { name: "HydroQualiSense" },
  items: [],
  subtotal: 11.72,
  totalTax: 0,
  grandTotal: 11.72,
  amountPaid: 0,
  balanceDue: 11.72,
  status: "UNPAID",
  reviewStatus: "VERIFIED",
  lifecycleStatus: "ACTIVE",
  extractedAt: "2026-09-01T00:00:00.000Z",
  modelUsed: "production-like-fixture",
  allocations: [],
} as unknown as InvoiceData;

const convertedExpense: Expense = {
  id: "production-expense-usd-1172",
  supplierInvoiceId: sourceInvoice.id,
  expenseDate: "2026-09-01",
  category: "Document services",
  description: "Converted source-document expense",
  payee: "International Document Services",
  amount: 11.72,
  currency: "USD",
  status: "APPROVED",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const unconvertedExpense: Expense = {
  id: "unconverted-expense-usd-100",
  expenseDate: "2026-09-02",
  category: "Foreign review",
  description: "Unconverted USD fixture",
  amount: 100,
  currency: "USD",
  status: "APPROVED",
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
};

const convertedSnapshot = createLocalFinancialFxSnapshot({
  sourceType: "EXPENSE",
  sourceId: convertedExpense.id,
  sourceAmount: convertedExpense.amount,
  sourceCurrency: "USD",
  baseCurrency: "PHP",
  rate: 760.16 / 11.72,
  rateDate: "2026-09-01",
}, "2026-09-03T00:00:00.000Z");

const dashboardInput = {
  projects: [],
  invoices: [sourceInvoice],
  expenses: [convertedExpense, unconvertedExpense],
  payroll: [],
  periods: [],
  workers: [],
  payrollEntries: [],
  payrollAllocations: [],
  payrollRuns: [],
  activityPeriod: "YEAR" as const,
  selectedCurrency: "PHP",
  baseCurrency: "PHP",
  today: "2026-09-10",
  fxSnapshots: [convertedSnapshot],
};

test("production-like converted USD source reports in PHP without deleting source evidence or double counting", () => {
  const rows = unallocatedCostByCurrency({ invoices: dashboardInput.invoices as any, expenses: dashboardInput.expenses, payroll: [], fxSnapshots: dashboardInput.fxSnapshots }, "PHP");
  const php = rows.find((row) => row.currency === "PHP");
  const usd = rows.find((row) => row.currency === "USD");

  assert.equal(sourceInvoice.currency, "USD");
  assert.equal(sourceInvoice.grandTotal, 11.72);
  assert.equal(convertedExpense.amount, 11.72);
  assert.equal(displayFinancialAmountInPhp(convertedExpense.amount, convertedExpense.currency, "EXPENSE", convertedExpense.id, [convertedSnapshot]).baseLabel, "₱760.16");
  assert.equal(displayFinancialAmountInPhp(convertedExpense.amount, convertedExpense.currency, "EXPENSE", convertedExpense.id, [convertedSnapshot]).sourceLabel, "Source $11.72");
  assert.deepEqual(php, { currency: "PHP", invoices: 0, payroll: 0, expenses: 760.16, total: 760.16 });
  assert.deepEqual(usd, { currency: "USD", invoices: 0, payroll: 0, expenses: 100, total: 100 });
  assert.equal(rows.reduce((sum, row) => sum + row.total, 0), 860.16);
  assert.equal(usd?.total === 11.72, false);
});

test("dashboard unallocated reporting uses the same base-first currency rule", () => {
  const dashboard = buildDashboardViewData(dashboardInput);
  const php = dashboard.unallocatedByCurrency.find((row) => row.currency === "PHP");
  const usd = dashboard.unallocatedByCurrency.find((row) => row.currency === "USD");
  assert.deepEqual(php, { currency: "PHP", invoices: 0, payroll: 0, expenses: 760.16, total: 760.16 });
  assert.deepEqual(usd, { currency: "USD", invoices: 0, payroll: 0, expenses: 100, total: 100 });
  assert.equal(dashboard.unallocatedByCurrency.some((row) => row.currency === "USD" && row.total === 11.72), false);
});

test("unconverted foreign source stays foreign and requires explicit FX evidence", () => {
  const display = displayFinancialAmountInPhp(100, "USD", "EXPENSE", unconvertedExpense.id, [convertedSnapshot]);
  assert.equal(display.requiresFx, true);
  assert.equal(display.baseLabel, "PHP conversion required");
  const rows = unallocatedCostByCurrency({ expenses: [unconvertedExpense], invoices: [], payroll: [], fxSnapshots: [convertedSnapshot] }, "PHP");
  assert.deepEqual(rows, [{ currency: "USD", invoices: 0, payroll: 0, expenses: 100, total: 100 }]);
});
