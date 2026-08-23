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

function invoicePaidAmount(invoice: CostInvoice) {
  const total = money(invoice.grandTotal);
  const reported = Number(invoice.amountPaid);
  if (invoice.status === "PAID" && !Number.isFinite(reported)) return total;
  return money(Math.min(total, Math.max(0, Number.isFinite(reported) ? reported : 0)));
}

/**
 * Allocates an invoice-level payment across the invoice's project allocations.
 * Shares use a stable largest-remainder cent allocation so their rounded sum
 * cannot exceed the invoice-level payment.
 */
function invoicePaidAllocationAmounts(invoice: CostInvoice) {
  const allocations = invoice.allocations || [];
  const projectAmounts = new Map<string, { amount: number; order: number }>();
  allocations.forEach((allocation, order) => {
    const amount = Math.max(0, normalizedInvoiceAllocationAmount(invoice.grandTotal, allocation));
    const current = projectAmounts.get(allocation.projectId);
    projectAmounts.set(allocation.projectId, { amount: (current?.amount || 0) + amount, order: current?.order ?? order });
  });
  const allocationTotal = money([...projectAmounts.values()].reduce((sum, allocation) => sum + allocation.amount, 0));
  const denominator = Math.max(money(invoice.grandTotal), allocationTotal);
  const result = new Map<string, number>();
  if (denominator <= 0) return result;

  const paidCents = Math.max(0, Math.round(invoicePaidAmount(invoice) * 100));
  const targetCents = Math.min(paidCents, Math.floor(invoicePaidAmount(invoice) * allocationTotal / denominator * 100 + 1e-8));
  const shares = [...projectAmounts.entries()].map(([projectId, details]) => {
    const rawCents = invoicePaidAmount(invoice) * details.amount / denominator * 100;
    const cents = Math.floor(rawCents + 1e-8);
    return { projectId, order: details.order, cents, remainder: rawCents - cents };
  });
  let remainingCents = targetCents - shares.reduce((sum, share) => sum + share.cents, 0);
  shares.sort((left, right) => right.remainder - left.remainder || left.order - right.order);
  for (let index = 0; remainingCents > 0 && shares.length > 0; index += 1) {
    shares[index % shares.length].cents += 1;
    remainingCents -= 1;
  }
  for (const share of shares) result.set(share.projectId, money(share.cents / 100));
  return result;
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
    const paidAmount = invoicePaidAllocationAmounts(invoice).get(projectId) || 0;
    const unpaidAmount = money(Math.max(0, amount - paidAmount));
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
