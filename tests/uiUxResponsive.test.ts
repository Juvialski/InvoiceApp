import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("narrow operational registers use progressive disclosure instead of forced tables", () => {
  const expenses = source("src/components/expenses/ExpensesPage.tsx");
  const procurement = source("src/components/procurement/ProcurementPage.tsx");
  const receipts = source("src/components/procurement/RecordReceiptModal.tsx");

  assert.match(expenses, /aria-label="Expense register cards"/);
  assert.match(expenses, /className="hidden lg:block ops-scrollbar overflow-auto"/);
  assert.match(procurement, /aria-label="Purchase order register cards"/);
  assert.match(procurement, /aria-label="RFQ register cards"/);
  assert.match(receipts, /aria-label="Receipt line cards"/);
  assert.match(receipts, /Leave lines that were not delivered blank or enter 0/);
});
