import type { Expense, FinancialFxSnapshot, InvoiceData, InvoiceProjectAllocation, Project } from "../types.ts";
import { hasFinancialFxSnapshot, normalizeFinancialCurrency } from "./financialCurrency.ts";
import { supplierInvoiceAllocationSummaries } from "./supplierInvoiceCostOwnership.ts";

export type SupplierDocumentState = "NEEDS_REVIEW" | "READY_TO_LINK" | "LINKED";

export interface SupplierDocumentWorkspaceRow {
  invoice: InvoiceData;
  state: SupplierDocumentState;
  linkedExpense?: Expense;
  allocationSummaries: ReturnType<typeof supplierInvoiceAllocationSummaries>;
  allocationLabel: string;
}

/**
 * Classifies preserved supplier documents without creating or inferring any
 * financial rows. A non-void Expense relationship is the authoritative link.
 */
export function classifySupplierDocuments(
  invoices: readonly InvoiceData[],
  expenses: readonly Expense[],
  projectAllocations?: readonly InvoiceProjectAllocation[],
  projects: readonly Project[] = [],
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
      const allocationSummaries = supplierInvoiceAllocationSummaries(
        invoice,
        projectAllocations !== undefined ? projectAllocations : (invoice as InvoiceData & { allocations?: InvoiceProjectAllocation[] }).allocations || [],
        projects,
      );
      const allocationLabel = allocationSummaries.length === 0
        ? "Project not allocated"
        : allocationSummaries.length === 1
          ? allocationSummaries[0]?.projectCode && allocationSummaries[0]?.projectName
            ? `${allocationSummaries[0].projectCode} · ${allocationSummaries[0].projectName}`
            : "Allocated to 1 project"
          : `Allocated across ${allocationSummaries.length} projects`;
      return {
        invoice,
        linkedExpense,
        allocationSummaries,
        allocationLabel,
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
