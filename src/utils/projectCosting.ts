import type {
  Expense,
  ExpenseStatus,
  InvoiceData,
  InvoiceProjectAllocation,
  PayrollEntry,
  PayrollPeriodStatus,
  PayrollProjectAllocation,
  PayrollRunStatus,
  Project,
  ProjectCostSummary,
} from "../types.ts";
import type { ProjectLaborCostAggregate, ProjectLaborSource } from "./projectLaborCostAggregate.ts";

export interface CostInvoice extends Pick<InvoiceData, "id" | "grandTotal" | "currency" | "reviewStatus" | "status" | "amountPaid" | "lifecycleStatus" | "archivedAt"> {
  allocations?: InvoiceProjectAllocation[];
  invoiceDate?: string;
  dueDate?: string;
  balanceDue?: number;
}

export type CostPayrollEntry = Pick<PayrollEntry, "id" | "grossPay" | "costContext"> & Partial<Pick<PayrollEntry, "projectAllocatedCost">>;

export interface CostPayrollRecord {
  id: string;
  status: PayrollPeriodStatus | PayrollRunStatus | string;
  currency?: string;
  periodStart?: string;
  periodEnd?: string;
  payDate?: string;
  entries?: CostPayrollEntry[];
  allocations: PayrollProjectAllocation[];
}

export interface ProjectCostInput {
  invoices?: CostInvoice[];
  payroll?: CostPayrollRecord[];
  expenses?: Expense[];
  /** Safe project-level labor totals used when payroll detail is unavailable. */
  projectLaborAggregates?: readonly ProjectLaborCostAggregate[];
  /** Explicitly selects detail rows or the safe aggregate source. */
  laborSource?: ProjectLaborSource;
  /** Used for the company/unallocated bucket, where there is no project currency. */
  baseCurrency?: string;
}

export interface ProjectCostSummaryWithCurrency extends ProjectCostSummary {
  currency: string;
  /** Confirmed administrative/general-overhead payroll, kept outside project labor. */
  overheadCost: number;
  /** Unconfirmed administrative/general-overhead payroll. */
  pendingOverheadCost: number;
  /** Confirmed payable balance for allocated verified invoices. */
  payableCost: number;
  /** Confirmed payable balance for unallocated invoice residuals. */
  unallocatedInvoicePayable: number;
  /** Unverified invoice residuals remain unallocated, not project pending. */
  unallocatedPendingInvoiceCost: number;
  /** Draft/calculated payroll residuals remain unallocated, not confirmed labor. */
  unallocatedPendingPayrollCost: number;
  /** Draft expense amounts without a project remain unallocated and pending. */
  unallocatedPendingExpenseCost: number;
}

export interface PayrollProjectAmount {
  total: number;
  confirmed: number;
  pending: number;
}

export interface PayrollCostBreakdown {
  currency: string;
  projectAmountsById: Map<string, PayrollProjectAmount>;
  projectConfirmed: number;
  projectPending: number;
  overheadConfirmed: number;
  overheadPending: number;
  unallocatedConfirmed: number;
  unallocatedPending: number;
  foreignCosts: Record<string, number>;
}

export class MixedCurrencyError extends Error {
  constructor(message = "Accounting totals cannot combine different currencies.") {
    super(message);
    this.name = "MixedCurrencyError";
  }
}

export function roundMoney(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
}

function positiveMoney(value: unknown) {
  return roundMoney(Math.max(0, Number(value) || 0));
}

export function normalizeCurrency(value?: string) {
  return (value || "").trim().toUpperCase() || "UNKNOWN";
}

export function normalizedInvoiceAllocationAmount(
  invoiceTotal: number,
  allocation: Pick<InvoiceProjectAllocation, "allocationType" | "allocationAmount" | "allocationPercentage">,
) {
  const total = positiveMoney(invoiceTotal);
  if (allocation.allocationType === "PERCENTAGE") {
    return roundMoney(total * Math.max(0, Number.isFinite(Number(allocation.allocationPercentage)) ? Number(allocation.allocationPercentage) : 0) / 100);
  }
  return positiveMoney(allocation.allocationAmount);
}

export function invoiceAllocationAmountsByProject(invoice: Pick<CostInvoice, "grandTotal" | "allocations">) {
  const amounts = new Map<string, number>();
  for (const allocation of invoice.allocations || []) {
    if (!allocation.projectId) continue;
    const amount = normalizedInvoiceAllocationAmount(invoice.grandTotal, allocation);
    if (amount <= 0) continue;
    amounts.set(allocation.projectId, roundMoney((amounts.get(allocation.projectId) || 0) + amount));
  }
  return amounts;
}

export function invoiceAllocationTotal(invoice: Pick<CostInvoice, "grandTotal" | "allocations">) {
  return roundMoney([...invoiceAllocationAmountsByProject(invoice).values()].reduce((sum, amount) => sum + amount, 0));
}

export function invoiceResidualAmount(invoice: Pick<CostInvoice, "grandTotal" | "allocations">) {
  return roundMoney(Math.max(0, positiveMoney(invoice.grandTotal) - invoiceAllocationTotal(invoice)));
}

export function validateInvoiceAllocations(
  invoiceTotal: number,
  allocations: Array<Pick<InvoiceProjectAllocation, "allocationType" | "allocationAmount" | "allocationPercentage">>,
) {
  const total = roundMoney(allocations.reduce((sum, allocation) => sum + normalizedInvoiceAllocationAmount(invoiceTotal, allocation), 0));
  const exceedsBy = roundMoney(Math.max(0, total - positiveMoney(invoiceTotal)));
  return {
    valid: exceedsBy <= 0.01,
    total,
    remaining: roundMoney(Math.max(0, positiveMoney(invoiceTotal) - total)),
    exceedsBy,
    message: exceedsBy > 0.01 ? `Allocation exceeds invoice total by ${exceedsBy.toFixed(2)}.` : undefined,
  };
}

/**
 * Returns the amount paid at invoice level. A PAID status is only a fallback
 * when the source does not provide either amountPaid or balanceDue.
 */
export function invoicePaidAmount(invoice: Pick<CostInvoice, "grandTotal" | "amountPaid" | "status" | "balanceDue">) {
  const total = positiveMoney(invoice.grandTotal);
  const reportedPaid = Number(invoice.amountPaid);
  if (Number.isFinite(reportedPaid)) return roundMoney(Math.min(total, Math.max(0, reportedPaid)));
  const reportedBalance = Number(invoice.balanceDue);
  if (Number.isFinite(reportedBalance)) return roundMoney(Math.max(0, total - Math.min(total, Math.max(0, reportedBalance))));
  if (invoice.status === "PAID") return total;
  return 0;
}

/** The invoice-level payable balance, intentionally separate from cost. */
export function invoiceUnpaidBalance(invoice: Pick<CostInvoice, "grandTotal" | "amountPaid" | "status" | "balanceDue">) {
  if ((invoice as CostInvoice).lifecycleStatus === "VOID") return 0;
  const total = positiveMoney(invoice.grandTotal);
  const reportedBalance = Number(invoice.balanceDue);
  if (Number.isFinite(reportedBalance)) return roundMoney(Math.min(total, Math.max(0, reportedBalance)));
  return roundMoney(Math.max(0, total - invoicePaidAmount(invoice)));
}

export const unpaidBalance = invoiceUnpaidBalance;

function invoicePaidAllocationAmounts(invoice: CostInvoice) {
  const projectAmounts = invoiceAllocationAmountsByProject(invoice);
  const allocationTotal = invoiceAllocationTotal(invoice);
  const invoiceTotal = positiveMoney(invoice.grandTotal);
  const paidTotal = invoicePaidAmount(invoice);
  const result = new Map<string, number>();
  if (allocationTotal <= 0 || invoiceTotal <= 0 || paidTotal <= 0) return result;

  // Payment follows the confirmed allocation shares. Any unallocated invoice
  // residual retains its own share of the invoice-level payment.
  const paidForAllocatedPool = Math.min(paidTotal, paidTotal * Math.min(invoiceTotal, allocationTotal) / invoiceTotal);
  const shares = [...projectAmounts.entries()].map(([projectId, amount], order) => {
    const rawCents = paidForAllocatedPool * amount / allocationTotal * 100;
    const cents = Math.floor(rawCents + 1e-8);
    return { projectId, order, cents, remainder: rawCents - cents };
  });
  let remainingCents = Math.max(0, Math.round(paidForAllocatedPool * 100) - shares.reduce((sum, share) => sum + share.cents, 0));
  shares.sort((left, right) => right.remainder - left.remainder || left.order - right.order);
  for (let index = 0; remainingCents > 0 && shares.length > 0; index += 1) {
    shares[index % shares.length].cents += 1;
    remainingCents -= 1;
  }
  for (const share of shares) result.set(share.projectId, roundMoney(share.cents / 100));
  return result;
}

function invoiceAllocationPayableAmount(invoice: CostInvoice, allocatedAmount: number, paidAmount: number) {
  const total = positiveMoney(invoice.grandTotal);
  if (allocatedAmount <= 0 || total <= 0) return 0;
  const proportionalPayable = allocatedAmount * invoiceUnpaidBalance(invoice) / total;
  return roundMoney(Math.min(Math.max(0, allocatedAmount - paidAmount), Math.max(0, proportionalPayable)));
}

export function isConfirmedInvoice(invoice: Pick<CostInvoice, "reviewStatus" | "lifecycleStatus">) {
  return invoice.reviewStatus === "VERIFIED" && invoice.lifecycleStatus !== "VOID";
}

export function isVoidedInvoice(invoice: Pick<CostInvoice, "lifecycleStatus">) {
  return invoice.lifecycleStatus === "VOID";
}

export function isConfirmedPayroll(status: string) {
  const normalized = status.toUpperCase();
  return normalized === "APPROVED" || normalized === "PAID";
}

export function isVoidedPayroll(status: string) {
  return status.toUpperCase() === "VOID";
}

export function isConfirmedExpense(status: ExpenseStatus) {
  return status === "APPROVED" || status === "PAID";
}

function payrollEntryBasis(entry: CostPayrollEntry) {
  const projectAllocatedCost = Number(entry.projectAllocatedCost);
  return positiveMoney(Number.isFinite(projectAllocatedCost) ? projectAllocatedCost : entry.grossPay);
}

function payrollAllocationTotalForEntry(allocations: PayrollProjectAllocation[], entryId: string) {
  return roundMoney(allocations
    .filter((allocation) => allocation.payrollEntryId === entryId)
    .reduce((sum, allocation) => sum + positiveMoney(allocation.allocationAmount), 0));
}

/**
 * Classifies payroll once for all consumers. Project allocations are separate
 * from administrative/general overhead, and the entry residual is unallocated.
 */
export function payrollRecordCostBreakdown(record: CostPayrollRecord, baseCurrency = "PHP"): PayrollCostBreakdown {
  const recordCurrency = normalizeCurrency(record.currency || baseCurrency);
  const targetCurrency = normalizeCurrency(baseCurrency);
  const confirmed = isConfirmedPayroll(record.status);
  const voided = isVoidedPayroll(record.status);
  const result: PayrollCostBreakdown = {
    currency: recordCurrency,
    projectAmountsById: new Map(),
    projectConfirmed: 0,
    projectPending: 0,
    overheadConfirmed: 0,
    overheadPending: 0,
    unallocatedConfirmed: 0,
    unallocatedPending: 0,
    foreignCosts: {},
  };
  if (voided) return result;

  const addForeign = (amount: number) => {
    if (recordCurrency === targetCurrency || amount <= 0) return;
    result.foreignCosts[recordCurrency] = roundMoney((result.foreignCosts[recordCurrency] || 0) + amount);
  };
  const addStatusAmount = (kind: "project" | "overhead" | "unallocated", amount: number) => {
    const value = positiveMoney(amount);
    if (!value) return;
    if (recordCurrency !== targetCurrency) {
      addForeign(value);
      return;
    }
    if (kind === "project") {
      if (confirmed) result.projectConfirmed = roundMoney(result.projectConfirmed + value);
      else result.projectPending = roundMoney(result.projectPending + value);
    } else if (kind === "overhead") {
      if (confirmed) result.overheadConfirmed = roundMoney(result.overheadConfirmed + value);
      else result.overheadPending = roundMoney(result.overheadPending + value);
    } else if (confirmed) result.unallocatedConfirmed = roundMoney(result.unallocatedConfirmed + value);
    else result.unallocatedPending = roundMoney(result.unallocatedPending + value);
  };

  const entries = record.entries || [];
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  for (const allocation of record.allocations || []) {
    const amount = positiveMoney(allocation.allocationAmount);
    if (!amount || !allocation.projectId) continue;
    const entry = entriesById.get(allocation.payrollEntryId);
    if (entry?.costContext?.type === "ADMIN_OFFICE" || entry?.costContext?.type === "GENERAL_OVERHEAD") continue;
    const current = result.projectAmountsById.get(allocation.projectId) || { total: 0, confirmed: 0, pending: 0 };
    current.total = roundMoney(current.total + amount);
    if (confirmed) current.confirmed = roundMoney(current.confirmed + amount);
    else current.pending = roundMoney(current.pending + amount);
    result.projectAmountsById.set(allocation.projectId, current);
    addStatusAmount("project", amount);
  }

  for (const entry of entries) {
    const basis = payrollEntryBasis(entry);
    if (!basis) continue;
    const context = entry.costContext?.type;
    if (context === "ADMIN_OFFICE" || context === "GENERAL_OVERHEAD") {
      addStatusAmount("overhead", basis);
      continue;
    }
    const allocatedAmount = payrollAllocationTotalForEntry(record.allocations || [], entry.id);
    const residual = roundMoney(Math.max(0, basis - allocatedAmount));
    addStatusAmount("unallocated", residual);
  }

  return result;
}

/**
 * Central project-cost semantics. Verified invoice allocations are confirmed
 * regardless of payment status; payment only affects the separate paid and
 * payable fields. All numeric totals are kept in the requested currency.
 */
export function calculateProjectCost(
  project: Pick<Project, "id" | "projectBudget" | "currency"> | undefined,
  input: ProjectCostInput,
): ProjectCostSummaryWithCurrency {
  const projectId = project?.id;
  const baseCurrency = normalizeCurrency(project?.currency || input.baseCurrency || "PHP");
  const laborSource = input.laborSource || (input.projectLaborAggregates ? "aggregate" : "detail");
  const summary: ProjectCostSummaryWithCurrency = {
    projectId,
    currency: baseCurrency,
    budget: positiveMoney(project?.projectBudget),
    invoiceCost: 0,
    paidInvoiceCost: 0,
    unpaidInvoiceCost: 0,
    unallocatedPayrollCost: 0,
    pendingInvoiceCost: 0,
    payrollCost: 0,
    pendingPayrollCost: 0,
    otherExpenseCost: 0,
    pendingExpenseCost: 0,
    totalActualCost: 0,
    committedCost: 0,
    remainingBudget: positiveMoney(project?.projectBudget),
    budgetUsedPercent: 0,
    foreignCosts: {},
    unallocatedInvoiceCost: 0,
    unallocatedExpenseCost: 0,
    overheadCost: 0,
    pendingOverheadCost: 0,
    payableCost: 0,
    unallocatedInvoicePayable: 0,
    unallocatedPendingInvoiceCost: 0,
    unallocatedPendingPayrollCost: 0,
    unallocatedPendingExpenseCost: 0,
  };

  const addForeign = (code: string, amount: number) => {
    const value = positiveMoney(amount);
    if (!value) return;
    summary.foreignCosts[code] = roundMoney((summary.foreignCosts[code] || 0) + value);
  };

  for (const invoice of input.invoices || []) {
    if (isVoidedInvoice(invoice)) continue;
    const invoiceCurrency = normalizeCurrency(invoice.currency);
    const byProject = invoiceAllocationAmountsByProject(invoice);
    const allocationTotal = invoiceAllocationTotal(invoice);
    const allocationAmount = projectId ? byProject.get(projectId) || 0 : 0;
    const residual = roundMoney(Math.max(0, positiveMoney(invoice.grandTotal) - allocationTotal));

    if (projectId) {
      if (!allocationAmount) continue;
      if (invoiceCurrency !== baseCurrency) {
        addForeign(invoiceCurrency, allocationAmount);
        continue;
      }
      if (!isConfirmedInvoice(invoice)) {
        summary.pendingInvoiceCost = roundMoney(summary.pendingInvoiceCost + allocationAmount);
        continue;
      }
      const paidAmount = invoicePaidAllocationAmounts(invoice).get(projectId) || 0;
      const payableAmount = invoiceAllocationPayableAmount(invoice, allocationAmount, paidAmount);
      summary.invoiceCost = roundMoney(summary.invoiceCost + allocationAmount);
      summary.paidInvoiceCost = roundMoney(summary.paidInvoiceCost + paidAmount);
      summary.unpaidInvoiceCost = roundMoney(summary.unpaidInvoiceCost + payableAmount);
      summary.payableCost = roundMoney(summary.payableCost + payableAmount);
      summary.committedCost = roundMoney(summary.committedCost + payableAmount);
      continue;
    }

    // The no-project summary is the company unallocated bucket. Only the
    // positive residual is unallocated; allocated project amounts are not.
    if (!residual) continue;
    if (invoiceCurrency !== baseCurrency) {
      addForeign(invoiceCurrency, residual);
      continue;
    }
    if (isConfirmedInvoice(invoice)) {
      summary.unallocatedInvoiceCost = roundMoney(summary.unallocatedInvoiceCost + residual);
      const invoiceTotal = positiveMoney(invoice.grandTotal);
      const payable = invoiceTotal ? roundMoney(residual * invoiceUnpaidBalance(invoice) / invoiceTotal) : 0;
      summary.unallocatedInvoicePayable = roundMoney(summary.unallocatedInvoicePayable + payable);
    } else {
      summary.unallocatedPendingInvoiceCost = roundMoney(summary.unallocatedPendingInvoiceCost + residual);
    }
  }

  if (laborSource === "detail") {
    for (const payroll of input.payroll || []) {
      const breakdown = payrollRecordCostBreakdown(payroll, baseCurrency);
      if (projectId) {
        const projectAmount = breakdown.projectAmountsById.get(projectId);
        if (projectAmount) {
          if (breakdown.currency === baseCurrency) {
            summary.payrollCost = roundMoney(summary.payrollCost + projectAmount.confirmed);
            summary.pendingPayrollCost = roundMoney(summary.pendingPayrollCost + projectAmount.pending);
          } else {
            addForeign(breakdown.currency, projectAmount.total);
          }
        }
        continue;
      }
      summary.unallocatedPayrollCost = roundMoney(summary.unallocatedPayrollCost + breakdown.unallocatedConfirmed);
      summary.unallocatedPendingPayrollCost = roundMoney(summary.unallocatedPendingPayrollCost + breakdown.unallocatedPending);
      summary.overheadCost = roundMoney(summary.overheadCost + breakdown.overheadConfirmed);
      summary.pendingOverheadCost = roundMoney(summary.pendingOverheadCost + breakdown.overheadPending);
      for (const [code, amount] of Object.entries(breakdown.foreignCosts)) addForeign(code, amount);
    }
  }

  if (projectId && laborSource === "aggregate") {
    for (const aggregate of input.projectLaborAggregates || []) {
      if (aggregate.projectId !== projectId) continue;
      const confirmed = positiveMoney(aggregate.confirmedLaborCost);
      const pending = positiveMoney(aggregate.pendingLaborCost);
      if (normalizeCurrency(aggregate.currency) !== baseCurrency) {
        addForeign(aggregate.currency, confirmed + pending);
        continue;
      }
      summary.payrollCost = roundMoney(summary.payrollCost + confirmed);
      summary.pendingPayrollCost = roundMoney(summary.pendingPayrollCost + pending);
    }
  }

  for (const expense of input.expenses || []) {
    const amount = positiveMoney(expense.amount);
    if (!amount || expense.status === "VOID") continue;
    const expenseCurrency = normalizeCurrency(expense.currency);
    if (projectId) {
      if (expense.projectId !== projectId) continue;
      if (expenseCurrency !== baseCurrency) {
        addForeign(expenseCurrency, amount);
      } else if (isConfirmedExpense(expense.status)) {
        summary.otherExpenseCost = roundMoney(summary.otherExpenseCost + amount);
      } else {
        summary.pendingExpenseCost = roundMoney(summary.pendingExpenseCost + amount);
      }
      continue;
    }
    if (expense.projectId) continue;
    if (expenseCurrency !== baseCurrency) {
      addForeign(expenseCurrency, amount);
    } else if (isConfirmedExpense(expense.status)) {
      summary.unallocatedExpenseCost = roundMoney(summary.unallocatedExpenseCost + amount);
    } else {
      summary.unallocatedPendingExpenseCost = roundMoney(summary.unallocatedPendingExpenseCost + amount);
    }
  }

  summary.totalActualCost = roundMoney(summary.invoiceCost + summary.payrollCost + summary.otherExpenseCost);
  summary.remainingBudget = roundMoney(summary.budget - summary.totalActualCost);
  summary.budgetUsedPercent = summary.budget > 0 ? roundMoney(summary.totalActualCost / summary.budget * 100) : 0;
  return summary;
}

export const PROJECT_HEALTH_THRESHOLD_PERCENT = 90;

export function projectHealth(summary: Pick<ProjectCostSummary, "budget" | "budgetUsedPercent" | "remainingBudget">) {
  if (summary.budget <= 0) return "NO BUDGET" as const;
  if (summary.remainingBudget < 0) return "OVER BUDGET" as const;
  if (summary.budgetUsedPercent >= PROJECT_HEALTH_THRESHOLD_PERCENT) return "NEAR LIMIT" as const;
  return "ON BUDGET" as const;
}

export interface AggregatedProjectCostSummary extends Omit<ProjectCostSummaryWithCurrency, "projectId" | "currency"> {
  projectId?: undefined;
  currency?: string;
}

function emptyAggregate(currency?: string): AggregatedProjectCostSummary {
  return {
    ...(currency ? { currency } : {}),
    budget: 0,
    invoiceCost: 0,
    paidInvoiceCost: 0,
    unpaidInvoiceCost: 0,
    unallocatedPayrollCost: 0,
    pendingInvoiceCost: 0,
    payrollCost: 0,
    pendingPayrollCost: 0,
    otherExpenseCost: 0,
    pendingExpenseCost: 0,
    totalActualCost: 0,
    committedCost: 0,
    remainingBudget: 0,
    budgetUsedPercent: 0,
    foreignCosts: {},
    unallocatedInvoiceCost: 0,
    unallocatedExpenseCost: 0,
    overheadCost: 0,
    pendingOverheadCost: 0,
    payableCost: 0,
    unallocatedInvoicePayable: 0,
    unallocatedPendingInvoiceCost: 0,
    unallocatedPendingPayrollCost: 0,
    unallocatedPendingExpenseCost: 0,
  };
}

function addSummary(target: AggregatedProjectCostSummary, source: ProjectCostSummary) {
  const numericKeys: Array<keyof Omit<ProjectCostSummaryWithCurrency, "projectId" | "currency" | "foreignCosts">> = [
    "budget", "invoiceCost", "paidInvoiceCost", "unpaidInvoiceCost", "unallocatedPayrollCost", "pendingInvoiceCost",
    "payrollCost", "pendingPayrollCost", "otherExpenseCost", "pendingExpenseCost", "totalActualCost", "committedCost",
    "remainingBudget", "overheadCost", "pendingOverheadCost", "payableCost", "unallocatedInvoicePayable",
    "unallocatedPendingInvoiceCost", "unallocatedPendingPayrollCost", "unallocatedPendingExpenseCost",
  ];
  for (const key of numericKeys) target[key] = roundMoney(Number(target[key] || 0) + Number((source as Partial<ProjectCostSummaryWithCurrency>)[key] || 0));
  target.budgetUsedPercent = target.budget > 0 ? roundMoney(target.totalActualCost / target.budget * 100) : 0;
  target.unallocatedInvoiceCost = roundMoney(target.unallocatedInvoiceCost + source.unallocatedInvoiceCost);
  target.unallocatedExpenseCost = roundMoney(target.unallocatedExpenseCost + source.unallocatedExpenseCost);
  for (const [code, amount] of Object.entries(source.foreignCosts || {})) target.foreignCosts[code] = roundMoney((target.foreignCosts[code] || 0) + amount);
}

function summaryCurrency(summary: ProjectCostSummary) {
  return "currency" in summary ? normalizeCurrency((summary as ProjectCostSummaryWithCurrency).currency) : undefined;
}

export function aggregateProjectCosts(summaries: ProjectCostSummary[], targetCurrency?: string): AggregatedProjectCostSummary {
  const currencies = [...new Set(summaries.map(summaryCurrency).filter((code): code is string => Boolean(code)))];
  const target = targetCurrency ? normalizeCurrency(targetCurrency) : undefined;
  if (!target && currencies.length > 1) throw new MixedCurrencyError(`Cannot aggregate ${currencies.join(", ")} into one project-cost total.`);
  const selected = target ? summaries.filter((summary) => !summaryCurrency(summary) || summaryCurrency(summary) === target) : summaries;
  const aggregate = emptyAggregate(target || currencies[0]);
  for (const summary of selected) addSummary(aggregate, summary);
  return aggregate;
}

export function aggregateProjectCostsByCurrency(summaries: ProjectCostSummary[]) {
  const groups: Record<string, ProjectCostSummary[]> = {};
  for (const summary of summaries) {
    const code = summaryCurrency(summary) || "UNKNOWN";
    (groups[code] ||= []).push(summary);
  }
  return Object.fromEntries(Object.entries(groups).map(([code, items]) => [code, aggregateProjectCosts(items, code)])) as Record<string, AggregatedProjectCostSummary>;
}
