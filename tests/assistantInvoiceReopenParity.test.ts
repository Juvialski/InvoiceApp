import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assistantOperations = readFileSync(new URL("../src/server/assistant/assistantOperations.ts", import.meta.url), "utf8");
const assistantPayrollExecutors = readFileSync(new URL("../src/server/assistant/assistantToolExecutors.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const supplierInvoiceExpenseSurface = readFileSync(new URL("../src/components/SupplierInvoiceExpenseSurface.tsx", import.meta.url), "utf8");

test("Assistant and manual invoice review paths agree on linked Expense ownership", () => {
  assert.match(assistantOperations, /supplier_invoice_id/);
  assert.match(assistantOperations, /INVOICE_LINKED_EXPENSE/);
  assert.match(assistantOperations, /Open\/Correct linked Expense/);
  assert.match(assistantOperations, /authoritative linked Expense/);
  assert.match(app, /activeLinkedExpense/);
  assert.match(app, /Use the Expense correction workflow/);
  assert.match(supplierInvoiceExpenseSurface, /Open\/Correct linked Expense/);
  assert.match(supplierInvoiceExpenseSurface, /appPathForExpense/);
  assert.match(supplierInvoiceExpenseSurface, /onNavigatePath/);
});

test("Assistant reopen execution does not weaken the database-owned linked Expense boundary", () => {
  assert.match(assistantOperations, /const linkedExpense = await db\(context\)\.from\("expenses"\)/);
  assert.match(assistantOperations, /cannot be reopened for review/);
  assert.match(assistantOperations, /authoritative linked Expense now owns its payable and cost truth/);
});

test("Assistant payroll paid-status compatibility path redirects to settlement evidence", () => {
  assert.match(assistantPayrollExecutors, /mark_payroll_paid/);
  assert.match(assistantPayrollExecutors, /PAYROLL_SETTLEMENT_REQUIRED/);
  assert.match(assistantPayrollExecutors, /Cash & Banking/);
  assert.match(assistantPayrollExecutors, /no payroll paid-status action/);
});
