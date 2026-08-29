import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260829060220_core_hardening_wave2b2_invoice_expense_corrections.sql", import.meta.url),
  "utf8",
);
const lifecycle = readFileSync(new URL("../src/lib/financialLifecycle.ts", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../src/lib/persistence.ts", import.meta.url), "utf8");
const expenses = readFileSync(new URL("../src/lib/expenses.ts", import.meta.url), "utf8");
const assistantExecutors = readFileSync(new URL("../src/server/assistant/assistantToolExecutors.ts", import.meta.url), "utf8");
const invoiceDirectory = readFileSync(new URL("../src/components/InvoiceDirectory.tsx", import.meta.url), "utf8");
const expensesPage = readFileSync(new URL("../src/components/expenses/ExpensesPage.tsx", import.meta.url), "utf8");

test("Wave 2B2 migration is additive and exposes guarded invoice/expense correction RPCs", () => {
  assert.doesNotMatch(migration, /drop table|drop schema|drop migration/i);
  for (const entity of ["invoices", "expenses"]) {
    assert.match(migration, new RegExp(`alter table public\\.${entity}[\\s\\S]*add column if not exists`));
  }
  for (const functionName of ["preview_invoice_correction", "apply_invoice_correction", "preview_expense_correction", "apply_expense_correction"]) {
    const block = migration.match(new RegExp(`create or replace function public\\.${functionName}[\\s\\S]*?\\$\\$;`))?.[0] || "";
    assert.match(block, /security definer/);
    assert.match(block, /set search_path = ''/);
    assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}`));
    assert.match(migration, new RegExp(`revoke all on function public\\.${functionName}`));
  }
  assert.match(migration, /private\.deployment_company_id\(\)/);
  assert.match(migration, /private\.has_company_permission/);
  assert.match(migration, /for update/);
  assert.match(migration, /private\.invoice_correction_preflight/);
  assert.match(migration, /private\.expense_correction_preflight/);
  assert.match(migration, /private\.write_company_audit/);
  assert.match(migration, /revoke delete on table public\.invoices, public\.expenses from anon, authenticated/);
});

test("Wave 2B2 preflight covers dependent history and confirmed settlement blockers", () => {
  for (const dependency of [
    "lineItems", "extractions", "reviewEvents", "projectAllocations", "settlementMatches",
    "confirmedSettlementMatches", "projectAccountingEvents", "sourceDocument", "sourceEmail",
    "duplicateReferences", "companyAuditEvents", "projectReference", "receiptSource",
  ]) assert.match(migration, new RegExp(`'${dependency}'`));
  assert.match(migration, /confirmed settlement record/);
  assert.match(migration, /Wave 2B3/);
  assert.match(migration, /recordBeforeVoid/);
  assert.match(migration, /originalValues/);
  assert.match(migration, /invoice_project_allocations_lifecycle_guard/);
  assert.match(migration, /financial_transaction_matches_void_target_guard/);
  assert.match(migration, /project_accounting_events_financial_history_guard/);
});

test("Wave 2B2 closes direct lifecycle bypasses and keeps archive separate from void", () => {
  assert.match(migration, /guard_invoice_correction_edit/);
  assert.match(migration, /guard_expense_correction_edit/);
  assert.match(migration, /Use the invoice correction workflow for delete, void, archive, or restore actions/);
  assert.match(migration, /Use the expense correction workflow for void, archive, or restore actions/);
  assert.match(migration, /Voided invoices are immutable/);
  assert.match(migration, /Voided expenses are immutable/);
  assert.match(migration, /Paid expenses are immutable/);
  assert.match(migration, /Approved expenses must use the expense correction workflow/);
  for (const event of [
    "INVOICE_DELETED_UNUSED", "INVOICE_VOIDED", "INVOICE_ARCHIVED", "INVOICE_RESTORED",
    "EXPENSE_DELETED_UNUSED", "EXPENSE_VOIDED", "EXPENSE_ARCHIVED", "EXPENSE_RESTORED",
  ]) assert.match(migration, new RegExp(`'${event}'`));
});

test("application correction contracts use the authoritative RPCs and truthful actions", () => {
  for (const action of ["DELETE_UNUSED", "VOID", "ARCHIVE", "RESTORE"]) assert.match(lifecycle, new RegExp(`"${action}"`));
  assert.match(persistence, /previewInvoiceCorrectionInSupabase/);
  assert.match(persistence, /applyInvoiceCorrectionInSupabase/);
  assert.match(persistence, /preview_invoice_correction/);
  assert.match(persistence, /apply_invoice_correction/);
  assert.match(expenses, /previewExpenseCorrectionInSupabase/);
  assert.match(expenses, /applyExpenseCorrectionInSupabase/);
  assert.match(expenses, /preview_expense_correction/);
  assert.match(expenses, /apply_expense_correction/);
  assert.match(invoiceDirectory, /Review correction options/);
  assert.match(expensesPage, /Review correction/);
  assert.match(expensesPage, /Archive changes visibility; void changes active financial cost/);
  assert.doesNotMatch(expensesPage, /onArchive/);
  assert.match(assistantExecutors, /lifecycle_status/);
  assert.match(assistantExecutors, /INVOICE_VOID/);
  assert.match(assistantExecutors, /financial totals exclude VOID rows/);
});
