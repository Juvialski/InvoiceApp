import type { Expense, FinancialFxSnapshot, InvoiceData } from "../types.ts";
import { hasFinancialFxSnapshot, normalizeFinancialCurrency } from "./financialCurrency.ts";

export type SupplierDocumentState = "NEEDS_REVIEW" | "READY_TO_LINK" | "LINKED";

export interface SupplierDocumentWorkspaceRow {
  invoice: InvoiceData;
  state: SupplierDocumentState;
  linkedExpense?: Expense;
}

/**
 * Classifies preserved supplier documents without creating or inferring any
 * financial rows. A non-void Expense relationship is the authoritative link.
 */
export function classifySupplierDocuments(
  invoices: readonly InvoiceData[],
  expenses: readonly Expense[],
): SupplierDocumentWorkspaceRow[] {
  const linkedByInvoice = new Map<string, Expense>();
  for (const expense of expenses) {
    if (!expense.supplierInvoiceId || expense.status === "VOID") continue;
    if (!linkedByInvoice.has(expense.supplierInvoiceId)) linkedByInvoice.set(expense.supplierInvoiceId, expense);
  }

  return invoices
    .filter((invoice) => invoice.lifecycleStatus !== "VOID" && !invoice.archivedAt)
    .map((invoice) => {
      const linkedExpense = linkedByInvoice.get(invoice.id);
      return {
        invoice,
        linkedExpense,
        state: linkedExpense ? "LINKED" : invoice.reviewStatus === "VERIFIED" ? "READY_TO_LINK" : "NEEDS_REVIEW",
      };
    });
}

export function unresolvedForeignExpenseIds(
  expenses: readonly Expense[],
  snapshots: readonly FinancialFxSnapshot[] | undefined,
  baseCurrency: string,
) {
  const base = normalizeFinancialCurrency(baseCurrency);
  return expenses
    .filter((expense) => expense.status !== "VOID" && normalizeFinancialCurrency(expense.currency) !== base)
    .filter((expense) => !hasFinancialFxSnapshot(expense.amount, expense.currency, base, "EXPENSE", expense.id, snapshots))
    .map((expense) => expense.id);
}
