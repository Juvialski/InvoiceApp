import type { Expense, InvoiceData, InvoiceProjectAllocation, Project } from "../types.ts";

function money(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(Math.max(0, numeric) * 100) / 100 : 0;
}

function allocationAmount(invoice: Pick<InvoiceData, "grandTotal">, allocation: Pick<InvoiceProjectAllocation, "allocationType" | "allocationAmount" | "allocationPercentage">) {
  const total = money(invoice.grandTotal);
  if (allocation.allocationType === "PERCENTAGE") {
    return Math.round(total * Math.max(0, Number(allocation.allocationPercentage) || 0) / 100 * 100) / 100;
  }
  return money(allocation.allocationAmount);
}

function positiveAllocations(
  invoice: Pick<InvoiceData, "grandTotal">,
  allocations: readonly InvoiceProjectAllocation[] | undefined,
) {
  return (allocations || []).filter((allocation) => allocationAmount(invoice, allocation) > 0);
}

export interface SupplierExpenseProjectProjection {
  projectId?: string;
  projectCostCodeId?: string;
  positiveAllocationCount: number;
}

/** Mirrors the database convenience projection for local/demo workspaces. */
export function supplierExpenseProjectProjection(
  invoice: Pick<InvoiceData, "grandTotal"> & { allocations?: readonly InvoiceProjectAllocation[] },
): SupplierExpenseProjectProjection {
  const allocations = positiveAllocations(invoice, invoice.allocations);
  if (allocations.length !== 1) return { positiveAllocationCount: allocations.length };
  return {
    projectId: allocations[0]?.projectId,
    ...(allocations[0]?.projectCostCodeId ? { projectCostCodeId: allocations[0].projectCostCodeId } : {}),
    positiveAllocationCount: 1,
  };
}

export interface SupplierInvoiceAllocationSummary {
  projectId: string;
  projectCode?: string;
  projectName?: string;
  amount: number;
  currency: string;
}

export function supplierInvoiceAllocationSummaries(
  invoice: Pick<InvoiceData, "id" | "grandTotal" | "currency">,
  allocations: readonly InvoiceProjectAllocation[],
  projects: readonly Project[] = [],
): SupplierInvoiceAllocationSummary[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  return allocations
    .filter((allocation) => allocation.invoiceId === invoice.id && allocationAmount(invoice, allocation) > 0)
    .map((allocation) => {
      const project = projectById.get(allocation.projectId);
      return {
        projectId: allocation.projectId,
        projectCode: project?.projectCode,
        projectName: project?.projectName,
        amount: allocationAmount(invoice, allocation),
        currency: invoice.currency,
      };
    });
}

/** Return the non-void Expense that owns each linked supplier invoice. */
export function supplierExpenseByInvoiceId(expenses: readonly Expense[]) {
  const result = new Map<string, Expense>();
  for (const expense of expenses) {
    const invoiceId = String(expense.supplierInvoiceId || "").trim();
    if (!invoiceId || expense.status === "VOID" || money(expense.amount) <= 0) continue;
    if (!result.has(invoiceId)) result.set(invoiceId, expense);
  }
  return result;
}

/**
 * Allocate the authoritative Expense amount using the existing invoice
 * project allocation only when the Expense itself has no single project.
 * This preserves multi-project allocation history without creating duplicate
 * Expense rows or silently converting currencies.
 */
export function supplierExpenseAmountForProject(
  expense: Pick<Expense, "amount" | "projectId">,
  invoice: Pick<InvoiceData, "grandTotal"> & { allocations?: readonly InvoiceProjectAllocation[] },
  projectId?: string,
) {
  const amount = money(expense.amount);
  const hasCanonicalAllocationSet = Array.isArray(invoice.allocations);
  const allocations = positiveAllocations(invoice, invoice.allocations);
  if (hasCanonicalAllocationSet && allocations.length > 0) {
    const invoiceTotal = money(invoice.grandTotal);
    if (invoiceTotal <= 0) return 0;
    const allocatedTotal = allocations.reduce((sum, allocation) => sum + allocationAmount(invoice, allocation), 0);
    if (!projectId) {
      return Math.round(Math.max(0, amount * Math.max(0, invoiceTotal - allocatedTotal) / invoiceTotal) * 100) / 100;
    }
    const projectAllocated = allocations
      .filter((allocation) => allocation.projectId === projectId)
      .reduce((sum, allocation) => sum + allocationAmount(invoice, allocation), 0);
    return Math.round(Math.max(0, amount * projectAllocated / invoiceTotal) * 100) / 100;
  }
  if (hasCanonicalAllocationSet && !projectId) return amount;
  if (hasCanonicalAllocationSet && projectId) return 0;
  if (!projectId) {
    if (expense.projectId) return 0;
    const invoiceTotal = money(invoice.grandTotal);
    const allocated = (invoice.allocations || []).reduce((sum, allocation) => sum + allocationAmount(invoice, allocation), 0);
    return invoiceTotal > 0 ? Math.round(Math.max(0, amount * Math.max(0, invoiceTotal - allocated) / invoiceTotal) * 100) / 100 : amount;
  }
  if (expense.projectId === projectId) return amount;
  if (expense.projectId) return 0;
  const invoiceTotal = money(invoice.grandTotal);
  if (invoiceTotal <= 0) return 0;
  const projectAllocated = (invoice.allocations || [])
    .filter((allocation) => allocation.projectId === projectId)
    .reduce((sum, allocation) => sum + allocationAmount(invoice, allocation), 0);
  return Math.round(Math.max(0, amount * projectAllocated / invoiceTotal) * 100) / 100;
}

export type SupplierInvoiceCostSource = Pick<InvoiceData, "id" | "grandTotal"> & {
  allocations?: readonly InvoiceProjectAllocation[];
};

export function supplierExpenseCostOwnership<T extends SupplierInvoiceCostSource>(
  invoices: readonly T[],
  expenses: readonly Expense[],
) {
  const invoiceById = new Map<string, T>(invoices.map((invoice): [string, T] => [invoice.id, invoice]));
  const byInvoiceId = supplierExpenseByInvoiceId(expenses);
  const linked = new Map<string, { invoice: T; expense: Expense }>();
  for (const [invoiceId, expense] of byInvoiceId) {
    const invoice = invoiceById.get(invoiceId);
    if (invoice) linked.set(invoiceId, { invoice, expense });
  }
  return { invoiceById, byInvoiceId, linked };
}
