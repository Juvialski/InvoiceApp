import type {
  Expense,
  ExpenseStatus,
  InvoiceData,
  InvoiceProjectAllocation,
  PayrollProjectAllocation,
  Project,
  ProjectCostSummary,
  PayrollPeriodStatus,
  PayrollRunStatus,
} from "../types.ts";

export interface CostInvoice extends Pick<InvoiceData, "id" | "grandTotal" | "currency" | "reviewStatus" | "status" | "amountPaid"> {
  allocations?: InvoiceProjectAllocation[];
}

export interface CostPayrollRecord {
  id: string;
  status: PayrollPeriodStatus | PayrollRunStatus | string;
  currency?: string;
  allocations: PayrollProjectAllocation[];
}

export interface ProjectCostInput {
  invoices?: CostInvoice[];
  payroll?: CostPayrollRecord[];
  expenses?: Expense[];
}

function money(value: number | undefined | null) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function currencyOf(value?: string) {
  return (value || "").trim().toUpperCase();
}

export function normalizedInvoiceAllocationAmount(invoiceTotal: number, allocation: Pick<InvoiceProjectAllocation, "allocationType" | "allocationAmount" | "allocationPercentage">) {
  if (allocation.allocationType === "PERCENTAGE") return money(invoiceTotal * (Number(allocation.allocationPercentage) || 0) / 100);
  return money(allocation.allocationAmount);
}

export function validateInvoiceAllocations(invoiceTotal: number, allocations: Array<Pick<InvoiceProjectAllocation, "allocationType" | "allocationAmount" | "allocationPercentage">>) {
  const total = money(allocations.reduce((sum, allocation) => sum + normalizedInvoiceAllocationAmount(invoiceTotal, allocation), 0));
  const exceedsBy = money(Math.max(0, total - money(invoiceTotal)));
  return {
    valid: exceedsBy <= 0.01,
    total,
    remaining: money(Math.max(0, money(invoiceTotal) - total)),
    exceedsBy,
    message: exceedsBy > 0.01 ? `Allocation exceeds invoice total by ${exceedsBy.toFixed(2)}.` : undefined,
  };
}

function invoiceAllocationAmount(invoice: CostInvoice, projectId?: string) {
  return (invoice.allocations || [])
    .filter((allocation) => !projectId || allocation.projectId === projectId)
    .reduce((sum, allocation) => sum + normalizedInvoiceAllocationAmount(invoice.grandTotal, allocation), 0);
}

function isConfirmedInvoice(invoice: CostInvoice) {
  return invoice.reviewStatus === "VERIFIED";
}

function isConfirmedPayroll(status: string) {
  return status === "APPROVED" || status === "PAID";
}

function isConfirmedExpense(status: ExpenseStatus) {
  return status === "APPROVED" || status === "PAID";
}

/**
 * Central project-cost semantics used by project pages, dashboard summaries,
 * reports, and exports. Only the project's currency is added to numeric PHP
 * (or other base-currency) totals; foreign currencies are returned separately.
 */
export function calculateProjectCost(project: Pick<Project, "id" | "projectBudget" | "currency"> | undefined, input: ProjectCostInput): ProjectCostSummary {
  const projectId = project?.id;
  const baseCurrency = currencyOf(project?.currency || "PHP") || "PHP";
  const summary: ProjectCostSummary = {
    projectId,
    budget: money(project?.projectBudget),
    invoiceCost: 0,
    paidInvoiceCost: 0,
    unpaidInvoiceCost: 0,
    pendingInvoiceCost: 0,
    payrollCost: 0,
    pendingPayrollCost: 0,
    otherExpenseCost: 0,
    pendingExpenseCost: 0,
    totalActualCost: 0,
    committedCost: 0,
    remainingBudget: money(project?.projectBudget),
    budgetUsedPercent: 0,
    foreignCosts: {},
    unallocatedInvoiceCost: 0,
    unallocatedExpenseCost: 0,
  };

  for (const invoice of input.invoices || []) {
    const amount = money(invoiceAllocationAmount(invoice, projectId));
    const hasAllocation = Boolean(invoice.allocations?.length);
    if (!projectId && !hasAllocation) {
      if (currencyOf(invoice.currency) === baseCurrency) summary.unallocatedInvoiceCost += money(invoice.grandTotal);
      else if (invoice.currency) summary.foreignCosts[currencyOf(invoice.currency)] = money((summary.foreignCosts[currencyOf(invoice.currency)] || 0) + money(invoice.grandTotal));
      continue;
    }
    if (!projectId || amount <= 0) continue;
    const invoiceCurrency = currencyOf(invoice.currency);
    if (invoiceCurrency !== baseCurrency) {
      summary.foreignCosts[invoiceCurrency || "UNKNOWN"] = money((summary.foreignCosts[invoiceCurrency || "UNKNOWN"] || 0) + amount);
      continue;
    }
    if (!isConfirmedInvoice(invoice)) {
      summary.pendingInvoiceCost += amount;
      continue;
    }
    summary.invoiceCost += amount;
    const paidAmount = invoice.status === "PAID" ? amount : Math.min(amount, Math.max(0, Number(invoice.amountPaid) || 0));
    const unpaidAmount = money(amount - paidAmount);
    summary.paidInvoiceCost += paidAmount;
    summary.unpaidInvoiceCost += unpaidAmount;
    if (unpaidAmount > 0) summary.committedCost += unpaidAmount;
  }

  for (const payroll of input.payroll || []) {
    if (!projectId) continue;
    for (const allocation of payroll.allocations || []) {
      if (allocation.projectId !== projectId) continue;
      const amount = money(allocation.allocationAmount);
      if (currencyOf(payroll.currency || baseCurrency) !== baseCurrency) {
        const key = currencyOf(payroll.currency) || "UNKNOWN";
        summary.foreignCosts[key] = money((summary.foreignCosts[key] || 0) + amount);
      } else if (isConfirmedPayroll(payroll.status)) summary.payrollCost += amount;
      else if (payroll.status !== "VOID") summary.pendingPayrollCost += amount;
    }
  }

  for (const expense of input.expenses || []) {
    if (!projectId && !expense.projectId) {
      if (currencyOf(expense.currency) === baseCurrency) summary.unallocatedExpenseCost += money(expense.amount);
      else if (expense.currency) summary.foreignCosts[currencyOf(expense.currency)] = money((summary.foreignCosts[currencyOf(expense.currency)] || 0) + money(expense.amount));
      continue;
    }
    if (!projectId || expense.projectId !== projectId || expense.status === "VOID" || expense.archivedAt) continue;
    if (currencyOf(expense.currency) !== baseCurrency) {
      const key = currencyOf(expense.currency) || "UNKNOWN";
      summary.foreignCosts[key] = money((summary.foreignCosts[key] || 0) + money(expense.amount));
    } else if (isConfirmedExpense(expense.status)) summary.otherExpenseCost += money(expense.amount);
    else summary.pendingExpenseCost += money(expense.amount);
  }

  summary.totalActualCost = money(summary.invoiceCost + summary.payrollCost + summary.otherExpenseCost);
  summary.remainingBudget = money(summary.budget - summary.totalActualCost);
  summary.budgetUsedPercent = summary.budget > 0 ? money(summary.totalActualCost / summary.budget * 100) : 0;
  return summary;
}

export function projectHealth(summary: Pick<ProjectCostSummary, "budget" | "budgetUsedPercent" | "remainingBudget">) {
  if (summary.budget <= 0) return "NO BUDGET" as const;
  if (summary.remainingBudget < 0) return "OVER BUDGET" as const;
  if (summary.budgetUsedPercent >= 90) return "NEAR LIMIT" as const;
  return "ON BUDGET" as const;
}

export function aggregateProjectCosts(summaries: ProjectCostSummary[]) {
  return summaries.reduce((total, summary) => ({
    ...total,
    budget: money(total.budget + summary.budget),
    invoiceCost: money(total.invoiceCost + summary.invoiceCost),
    payrollCost: money(total.payrollCost + summary.payrollCost),
    otherExpenseCost: money(total.otherExpenseCost + summary.otherExpenseCost),
    totalActualCost: money(total.totalActualCost + summary.totalActualCost),
    pendingInvoiceCost: money(total.pendingInvoiceCost + summary.pendingInvoiceCost),
    pendingPayrollCost: money(total.pendingPayrollCost + summary.pendingPayrollCost),
    pendingExpenseCost: money(total.pendingExpenseCost + summary.pendingExpenseCost),
    unallocatedInvoiceCost: money(total.unallocatedInvoiceCost + summary.unallocatedInvoiceCost),
    unallocatedExpenseCost: money(total.unallocatedExpenseCost + summary.unallocatedExpenseCost),
  }), {
    budget: 0, invoiceCost: 0, payrollCost: 0, otherExpenseCost: 0, totalActualCost: 0,
    pendingInvoiceCost: 0, pendingPayrollCost: 0, pendingExpenseCost: 0,
    unallocatedInvoiceCost: 0, unallocatedExpenseCost: 0,
  });
}
