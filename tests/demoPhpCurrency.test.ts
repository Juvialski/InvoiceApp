import assert from "node:assert/strict";
import test from "node:test";
import { createDemoWorkspace } from "../src/demo/data/createDemoWorkspace.ts";

const workspace = createDemoWorkspace("2026-09-09");

test("public demo monetary source data is PHP-only", () => {
  assert.ok(workspace.invoices.length > 0);
  assert.ok(workspace.expenses.length > 0);
  assert.ok(workspace.invoices.every((invoice) => invoice.currency === "PHP"));
  assert.ok(workspace.invoices.every((invoice) => invoice.currencySymbol !== "$"));
  assert.ok(workspace.expenses.every((expense) => expense.currency === "PHP"));
  assert.ok(workspace.cash.accounts.every((account) => account.currency === "PHP"));
  assert.ok(workspace.cash.transactions.every((transaction) => transaction.currency === "PHP"));
  assert.deepEqual(workspace.financialFxSnapshots, []);
});

test("former USD demo samples retain their explicit converted PHP values", () => {
  const invoice17 = workspace.invoices.find((invoice) => invoice.id === "demo-invoice-17");
  assert.ok(invoice17);
  assert.equal(invoice17.currency, "PHP");
  assert.equal(invoice17.currencySymbol, "₱");
  assert.equal(invoice17.grandTotal, 47_430_859.50);

  const expense19 = workspace.expenses.find((expense) => expense.id === "demo-expense-19");
  assert.ok(expense19);
  assert.equal(expense19.currency, "PHP");
  assert.equal(expense19.amount, 659.25);

  const expense20 = workspace.expenses.find((expense) => expense.id === "demo-expense-20");
  assert.ok(expense20);
  assert.equal(expense20.currency, "PHP");
  assert.equal(expense20.amount, 137_812.50);
});
