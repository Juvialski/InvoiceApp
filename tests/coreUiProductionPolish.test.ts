import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const dashboard = source("src/components/Dashboard.tsx");
const reports = source("src/components/Reports.tsx");
const projects = source("src/components/projects/ProjectsPage.tsx");
const projectRegister = source("src/components/projects/ProjectPortfolioRegisterSection.tsx");
const invoices = source("src/components/InvoiceDirectory.tsx");
const reviewQueue = source("src/components/ReviewQueue.tsx");
const expenses = source("src/components/expenses/ExpensesPage.tsx");
const expenseForm = source("src/components/expenses/ExpenseForm.tsx");
const cash = source("src/components/CashBankingPage.tsx");

test("core operations pages expose intentional hierarchy and empty/loading states", () => {
  assert.match(dashboard, /PageHeader/);
  assert.match(dashboard, /SectionHeader/);
  assert.match(dashboard, /EmptyState/);
  assert.match(reports, /<Notice tone="info">/);
  assert.match(reports, /EmptyState/);
  assert.match(projects, /role="status" aria-live="polite"/);
  assert.match(projects, /Loading projects…/);
  assert.match(invoices, /role="status" aria-live="polite"/);
  assert.match(expenses, /role="status" aria-live="polite"/);
});

test("core operations result surfaces remain keyboard- and screen-reader-scannable", () => {
  assert.match(projectRegister, /aria-label="Projects list cards"/);
  assert.match(projectRegister, /aria-label="Projects table"/);
  assert.match(projectRegister, /Open project workspace for/);
  assert.match(projectRegister, /focus-visible:ring-2/);

  assert.match(invoices, /<caption className="sr-only">/);
  assert.match(invoices, /scope="col"/);
  assert.match(invoices, /focus-visible:ring-2/);
  assert.match(invoices, /aria-pressed={selected}/);

  assert.match(expenses, /aria-label="Expense register"/);
  assert.match(expenses, /aria-label="Expense register cards"/);
  assert.match(expenses, /focus-visible:ring-2/);

  assert.match(cash, /aria-pressed={selectedAccount\?\.id === summary\.account\.id}/);
});

test("invoice review and expense entry make the next action explicit", () => {
  assert.match(reviewQueue, /role="status" aria-live="polite"/);
  assert.match(reviewQueue, /aria-label=\{`\$\{readOnly \? "Inspect" : "Open and review"\}/);
  assert.match(expenseForm, /<fieldset className="space-y-3 rounded-xl border/);
  assert.match(expenseForm, /aria-live="assertive"/);
  assert.match(expenses, /Showing <span className="text-slate-900">\{expenseResultLabel\}/);
});

test("reports and dashboard keep source-currency boundaries visible", () => {
  assert.match(dashboard, /not converted or summed into PHP/);
  assert.match(reports, /Voided invoices are excluded from active totals; currencies remain separate/);
  assert.match(reports, /No automatic conversion is applied/);
  assert.match(cash, /no implicit FX conversion is applied/i);
});
