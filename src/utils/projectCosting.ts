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
  ProjectCostCode,
  ProjectCostCodeStatus,
  ProjectCostSummary,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  Subcontract,
  SubcontractLine,
  SubcontractProgressClaim,
  SubcontractProgressClaimLine,
  SubcontractProgressClaimStatus,
  SubcontractStatus,
  SubcontractVariation,
  SubcontractVariationLine,
  SubcontractVariationStatus,
} from "../types.ts";
import type { ProjectLaborCostAggregate, ProjectLaborSource } from "./projectLaborCostAggregate.ts";

export interface CostInvoice extends Pick<InvoiceData, "id" | "grandTotal" | "currency" | "reviewStatus" | "status" | "amountPaid" | "lifecycleStatus" | "archivedAt" | "sourceDocumentId"> {
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
  purchaseOrders?: PurchaseOrder[];
  subcontracts?: Subcontract[];
  subcontractClaims?: SubcontractProgressClaim[];
  subcontractVariations?: SubcontractVariation[];
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

export function isCommittedPurchaseOrder(statusOrPO?: PurchaseOrderStatus | string | { status?: PurchaseOrderStatus | string | null } | null): boolean {
  if (!statusOrPO) return false;
  const raw = typeof statusOrPO === "object" && "status" in statusOrPO ? statusOrPO.status : statusOrPO;
  const normalized = String(raw || "").trim().toUpperCase();
  return normalized === "APPROVED" || normalized === "ISSUED";
}

export function isVoidedPurchaseOrder(statusOrPO?: PurchaseOrderStatus | string | { status?: PurchaseOrderStatus | string | null } | null): boolean {
  if (!statusOrPO) return false;
  const raw = typeof statusOrPO === "object" && "status" in statusOrPO ? statusOrPO.status : statusOrPO;
  const normalized = String(raw || "").trim().toUpperCase();
  return normalized === "CANCELLED";
}

export function purchaseOrderTotal(po: Pick<PurchaseOrder, "totalAmount" | "lines">): number {
  if (po.lines && po.lines.length > 0) {
    return roundMoney(
      po.lines.reduce(
        (sum, line) => sum + positiveMoney(line.amount != null && Number.isFinite(Number(line.amount)) ? Number(line.amount) : (Number(line.quantity || 0) * Number(line.unitPrice || 0))),
        0,
      ),
    );
  }
  return positiveMoney(po.totalAmount);
}

export function isCommittedSubcontract(statusOrSC?: SubcontractStatus | string | { status?: SubcontractStatus | string | null } | null): boolean {
  if (!statusOrSC) return false;
  const raw = typeof statusOrSC === "object" && "status" in statusOrSC ? statusOrSC.status : statusOrSC;
  const normalized = String(raw || "").trim().toUpperCase();
  return normalized === "APPROVED" || normalized === "ACTIVE";
}

export function isVoidedSubcontract(statusOrSC?: SubcontractStatus | string | { status?: SubcontractStatus | string | null } | null): boolean {
  if (!statusOrSC) return false;
  const raw = typeof statusOrSC === "object" && "status" in statusOrSC ? statusOrSC.status : statusOrSC;
  const normalized = String(raw || "").trim().toUpperCase();
  return normalized === "CANCELLED";
}

export function isApprovedSubcontractClaim(statusOrClaim?: SubcontractProgressClaimStatus | string | { status?: SubcontractProgressClaimStatus | string | null } | null): boolean {
  if (!statusOrClaim) return false;
  const raw = typeof statusOrClaim === "object" && "status" in statusOrClaim ? statusOrClaim.status : statusOrClaim;
  const normalized = String(raw || "").trim().toUpperCase();
  return normalized === "APPROVED";
}

export function isVoidedSubcontractClaim(statusOrClaim?: SubcontractProgressClaimStatus | string | { status?: SubcontractProgressClaimStatus | string | null } | null): boolean {
  if (!statusOrClaim) return false;
  const raw = typeof statusOrClaim === "object" && "status" in statusOrClaim ? statusOrClaim.status : statusOrClaim;
  const normalized = String(raw || "").trim().toUpperCase();
  return normalized === "VOIDED" || normalized === "CANCELLED" || normalized === "REJECTED";
}

export function isApprovedSubcontractVariation(statusOrVar?: SubcontractVariationStatus | string | { status?: SubcontractVariationStatus | string | null } | null): boolean {
  if (!statusOrVar) return false;
  const raw = typeof statusOrVar === "object" && "status" in statusOrVar ? statusOrVar.status : statusOrVar;
  const normalized = String(raw || "").trim().toUpperCase();
  return normalized === "APPROVED";
}

export function isVoidedSubcontractVariation(statusOrVar?: SubcontractVariationStatus | string | { status?: SubcontractVariationStatus | string | null } | null): boolean {
  if (!statusOrVar) return false;
  const raw = typeof statusOrVar === "object" && "status" in statusOrVar ? statusOrVar.status : statusOrVar;
  const normalized = String(raw || "").trim().toUpperCase();
  return normalized === "CANCELLED" || normalized === "REJECTED";
}

export function subcontractTotal(sc: Pick<Subcontract, "originalAmount" | "lines">): number {
  if (sc.lines && sc.lines.length > 0) {
    return roundMoney(
      sc.lines.reduce(
        (sum, line) =>
          sum +
          positiveMoney(
            line.amount != null && Number.isFinite(Number(line.amount))
              ? Number(line.amount)
              : (Number(line.quantity || 0) * Number(line.unitRate || 0)),
          ),
        0,
      ),
    );
  }
  return positiveMoney(sc.originalAmount);
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

type LinkedSourceOwner = "invoice" | "expense";

function normalizedSourceDocumentId(value?: string | null) {
  return String(value || "").trim();
}

function invoiceAmountForBucket(invoice: CostInvoice, projectId?: string) {
  if (projectId) return invoiceAllocationAmountsByProject(invoice).get(projectId) || 0;
  return invoiceResidualAmount(invoice);
}

function expenseBelongsToBucket(expense: Expense, projectId?: string) {
  return projectId ? expense.projectId === projectId : !expense.projectId;
}

/**
 * Exact source-document provenance is the only automatic invoice/expense
 * deduplication rule. When both records represent the same captured source,
 * prefer a verified invoice; otherwise prefer a confirmed expense over an
 * unverified invoice. No vendor/date/amount heuristic is used.
 */
function linkedSourceOwners(projectId: string | undefined, input: ProjectCostInput) {
  const invoiceStates = new Map<string, boolean>();
  const expenseStates = new Map<string, boolean>();

  for (const invoice of input.invoices || []) {
    if (isVoidedInvoice(invoice) || invoiceAmountForBucket(invoice, projectId) <= 0) continue;
    const sourceId = normalizedSourceDocumentId(invoice.sourceDocumentId);
    if (!sourceId) continue;
    invoiceStates.set(sourceId, Boolean(invoiceStates.get(sourceId)) || isConfirmedInvoice(invoice));
  }

  for (const expense of input.expenses || []) {
    if (expense.status === "VOID" || positiveMoney(expense.amount) <= 0 || !expenseBelongsToBucket(expense, projectId)) continue;
    const sourceId = normalizedSourceDocumentId(expense.receiptSourceDocumentId);
    if (!sourceId) continue;
    expenseStates.set(sourceId, Boolean(expenseStates.get(sourceId)) || isConfirmedExpense(expense.status));
  }

  const owners = new Map<string, LinkedSourceOwner>();
  for (const [sourceId, invoiceConfirmed] of invoiceStates) {
    if (!expenseStates.has(sourceId)) continue;
    const expenseConfirmed = expenseStates.get(sourceId) || false;
    owners.set(sourceId, invoiceConfirmed || !expenseConfirmed ? "invoice" : "expense");
  }
  return owners;
}

/**
 * Central project-cost semantics. Verified invoice allocations are confirmed
 * regardless of payment status; payment only affects the separate paid and
 * payable fields. Approved PO and subcontract obligations are committed cost,
 * never actual cost. All numeric totals are kept in the requested currency.
 */
export function calculateProjectCost(
  project: Pick<Project, "id" | "projectBudget" | "currency"> | undefined,
  input: ProjectCostInput,
): ProjectCostSummaryWithCurrency {
  const projectId = project?.id;
  const baseCurrency = normalizeCurrency(project?.currency || input.baseCurrency || "PHP");
  const laborSource = input.laborSource || (input.projectLaborAggregates ? "aggregate" : "detail");
  const sourceOwners = linkedSourceOwners(projectId, input);
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
    certifiedSubcontractCost: 0,
    retentionHeldCost: 0,
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
    const sourceId = normalizedSourceDocumentId(invoice.sourceDocumentId);
    if (sourceId && sourceOwners.get(sourceId) === "expense") continue;
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
    const sourceId = normalizedSourceDocumentId(expense.receiptSourceDocumentId);
    if (sourceId && sourceOwners.get(sourceId) === "invoice") continue;
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

  for (const po of input.purchaseOrders || []) {
    if (!isCommittedPurchaseOrder(po.status)) continue;
    const poAmount = purchaseOrderTotal(po);
    if (!poAmount) continue;
    const poCurrency = normalizeCurrency(po.currency);

    if (projectId) {
      if (po.projectId !== projectId) continue;
      if (poCurrency !== baseCurrency) {
        addForeign(poCurrency, poAmount);
      } else {
        summary.committedCost = roundMoney(summary.committedCost + poAmount);
      }
      continue;
    }
  }

  // 5. Subcontract Progress Claims (Certified Work & Retention)
  const subcontractsById = new Map((input.subcontracts || []).map((sc) => [sc.id, sc]));
  const approvedClaimsBySubcontract = new Map<string, number>();

  for (const claim of input.subcontractClaims || []) {
    if (!isApprovedSubcontractClaim(claim.status)) continue;
    const parentSc = subcontractsById.get(claim.subcontractId);
    const claimCurrency = normalizeCurrency(parentSc?.currency || baseCurrency);
    const grossApproved = positiveMoney(claim.approvedGrossAmount);
    const retention = positiveMoney(claim.retentionAmount);

    if (projectId) {
      if (claim.projectId !== projectId) continue;
      if (claimCurrency !== baseCurrency) {
        addForeign(claimCurrency, grossApproved);
      } else {
        summary.certifiedSubcontractCost = roundMoney((summary.certifiedSubcontractCost || 0) + grossApproved);
        summary.retentionHeldCost = roundMoney((summary.retentionHeldCost || 0) + retention);
      }
    } else {
      if (claimCurrency !== baseCurrency) {
        addForeign(claimCurrency, grossApproved);
      } else {
        summary.certifiedSubcontractCost = roundMoney((summary.certifiedSubcontractCost || 0) + grossApproved);
        summary.retentionHeldCost = roundMoney((summary.retentionHeldCost || 0) + retention);
      }
    }

    approvedClaimsBySubcontract.set(
      claim.subcontractId,
      roundMoney((approvedClaimsBySubcontract.get(claim.subcontractId) || 0) + grossApproved),
    );
  }

  // Map approved variations by subcontract
  const approvedVariationsBySubcontract = new Map<string, number>();
  for (const v of input.subcontractVariations || []) {
    if (isApprovedSubcontractVariation(v.status)) {
      approvedVariationsBySubcontract.set(
        v.subcontractId,
        roundMoney((approvedVariationsBySubcontract.get(v.subcontractId) || 0) + Number(v.netAmount || 0)),
      );
    }
  }

  // 6. Subcontracts (Remaining Commitment)
  for (const sc of input.subcontracts || []) {
    if (!isCommittedSubcontract(sc.status)) continue;
    const netVariations = approvedVariationsBySubcontract.get(sc.id) || 0;
    const revisedScAmount = roundMoney(subcontractTotal(sc) + netVariations);
    if (revisedScAmount <= 0) continue;
    const scCurrency = normalizeCurrency(sc.currency);

    const approvedGrossForSc = approvedClaimsBySubcontract.get(sc.id) || 0;
    const remainingCommitment = roundMoney(Math.max(0, revisedScAmount - approvedGrossForSc));

    if (projectId) {
      if (sc.projectId !== projectId) continue;
      if (scCurrency !== baseCurrency) {
        addForeign(scCurrency, remainingCommitment);
      } else {
        summary.committedCost = roundMoney(summary.committedCost + remainingCommitment);
      }
      continue;
    } else {
      if (scCurrency !== baseCurrency) {
        addForeign(scCurrency, remainingCommitment);
      } else {
        summary.committedCost = roundMoney(summary.committedCost + remainingCommitment);
      }
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
    certifiedSubcontractCost: 0,
    retentionHeldCost: 0,
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
    "certifiedSubcontractCost", "retentionHeldCost",
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

export interface CostCodeFinancialSummary {
  costCodeId: string;
  code: string;
  name: string;
  description?: string;
  status: ProjectCostCodeStatus;
  currency: string;
  budgetAmount: number;
  actualCost: number;
  pendingCost: number;
  committedCost: number | null;
  certifiedSubcontractCost?: number;
  retentionHeldCost?: number;
  forecastAmount: number | null;
  actualVariance: number;
  forecastVariance: number | null;
  budgetUsedPercent: number;
  invoiceCost: number;
  payrollCost: number;
  otherExpenseCost: number;
  foreignCosts: Record<string, number>;
  hasForeignAmounts: boolean;
}

export interface ProjectBudgetControlSummary {
  projectId: string;
  currency: string;
  projectBudget: number;
  allocatedCostCodeBudget: number;
  unallocatedBudget: number;
  totalActualCost: number;
  codedActualCost: number;
  uncodedActualCost: number;
  totalPendingCost: number;
  codedPendingCost: number;
  uncodedPendingCost: number;
  totalCommittedCost: number;
  codedCommittedCost: number;
  uncodedCommittedCost: number;
  totalCertifiedSubcontractCost?: number;
  totalRetentionHeldCost?: number;
  costCodes: CostCodeFinancialSummary[];
  uncodedSummary: {
    actualCost: number;
    pendingCost: number;
    committedCost: number;
    certifiedSubcontractCost?: number;
    retentionHeldCost?: number;
    invoiceCost: number;
    payrollCost: number;
    otherExpenseCost: number;
    foreignCosts: Record<string, number>;
  };
  foreignCosts: Record<string, number>;
  hasForeignAmounts: boolean;
  baseCostSummary: ProjectCostSummaryWithCurrency;
}

/**
 * P1B Budget Control Aggregation & P2A/P2B Procurement Commitment Integration.
 * Classifies authoritative actual costs, pending exposure, and purchase order commitments into project cost codes.
 *
 * Guarantees:
 * - Reconciles exactly to P1A calculateProjectCost:
 *   codedActualCost + uncodedActualCost === totalActualCost
 * - Deduplication via linkedSourceOwners applies first before classification.
 * - Non-confirmed invoices, unapproved payroll, and voided expenses are excluded from actual cost.
 * - Committed cost is derived only from APPROVED/ISSUED purchase orders plus APPROVED/ACTIVE subcontracts;
 *   DRAFT, CLOSED, and CANCELLED commitment records contribute zero.
 * - Explicit forecast variance = budgetAmount - forecastAmount. If forecast is null -> "Not set".
 * - Unconverted foreign currency costs are kept in foreignCosts without implicit FX conversion.
 */
export function calculateProjectBudgetControl(
  project: Pick<Project, "id" | "projectBudget" | "currency">,
  costCodes: readonly ProjectCostCode[],
  input: ProjectCostInput,
): ProjectBudgetControlSummary {
  const projectId = project.id;
  const baseCurrency = normalizeCurrency(project.currency || input.baseCurrency || "PHP");
  const baseSummary = calculateProjectCost(project, input);
  const sourceOwners = linkedSourceOwners(projectId, input);
  const laborSource = input.laborSource || (input.projectLaborAggregates ? "aggregate" : "detail");

  const validCostCodes = costCodes.filter((cc) => cc.projectId === projectId);
  const validCostCodeIds = new Set(validCostCodes.map((cc) => cc.id));

  interface CodeAccumulator {
    invoiceCost: number;
    payrollCost: number;
    otherExpenseCost: number;
    actualCost: number;
    pendingCost: number;
    committedCost: number;
    certifiedSubcontractCost: number;
    retentionHeldCost: number;
    foreignCosts: Record<string, number>;
  }

  const codeAccumulators = new Map<string, CodeAccumulator>();
  for (const cc of validCostCodes) {
    codeAccumulators.set(cc.id, {
      invoiceCost: 0,
      payrollCost: 0,
      otherExpenseCost: 0,
      actualCost: 0,
      pendingCost: 0,
      committedCost: 0,
      certifiedSubcontractCost: 0,
      retentionHeldCost: 0,
      foreignCosts: {},
    });
  }

  const uncodedAccumulator: CodeAccumulator = {
    invoiceCost: 0,
    payrollCost: 0,
    otherExpenseCost: 0,
    actualCost: 0,
    pendingCost: 0,
    committedCost: 0,
    certifiedSubcontractCost: 0,
    retentionHeldCost: 0,
    foreignCosts: {},
  };

  const addAmount = (
    costCodeId: string | undefined | null,
    kind: "invoice" | "payroll" | "expense",
    amount: number,
    currency: string,
    isConfirmed: boolean,
  ) => {
    const value = positiveMoney(amount);
    if (!value) return;
    const target = (costCodeId && validCostCodeIds.has(costCodeId))
      ? codeAccumulators.get(costCodeId)!
      : uncodedAccumulator;

    const normalizedCodeCurrency = normalizeCurrency(currency);
    if (normalizedCodeCurrency !== baseCurrency) {
      target.foreignCosts[normalizedCodeCurrency] = roundMoney((target.foreignCosts[normalizedCodeCurrency] || 0) + value);
      return;
    }

    if (isConfirmed) {
      target.actualCost = roundMoney(target.actualCost + value);
      if (kind === "invoice") target.invoiceCost = roundMoney(target.invoiceCost + value);
      else if (kind === "payroll") target.payrollCost = roundMoney(target.payrollCost + value);
      else if (kind === "expense") target.otherExpenseCost = roundMoney(target.otherExpenseCost + value);
    } else {
      target.pendingCost = roundMoney(target.pendingCost + value);
    }
  };

  // 1. Invoices
  for (const invoice of input.invoices || []) {
    if (isVoidedInvoice(invoice)) continue;
    const sourceId = normalizedSourceDocumentId(invoice.sourceDocumentId);
    if (sourceId && sourceOwners.get(sourceId) === "expense") continue;
    const invoiceCurrency = normalizeCurrency(invoice.currency);
    const confirmed = isConfirmedInvoice(invoice);

    for (const allocation of invoice.allocations || []) {
      if (allocation.projectId !== projectId) continue;
      const allocAmount = normalizedInvoiceAllocationAmount(invoice.grandTotal, allocation);
      if (allocAmount <= 0) continue;
      const targetCodeId = allocation.projectCostCodeId || (allocation as { costCodeId?: string }).costCodeId;
      addAmount(targetCodeId, "invoice", allocAmount, invoiceCurrency, confirmed);
    }
  }

  // 2. Payroll
  if (laborSource === "detail") {
    for (const payroll of input.payroll || []) {
      if (isVoidedPayroll(payroll.status)) continue;
      const recordCurrency = normalizeCurrency(payroll.currency || baseCurrency);
      const confirmed = isConfirmedPayroll(payroll.status);
      const entries = payroll.entries || [];
      const entriesById = new Map(entries.map((entry) => [entry.id, entry]));

      for (const allocation of payroll.allocations || []) {
        if (allocation.projectId !== projectId) continue;
        const entry = entriesById.get(allocation.payrollEntryId);
        if (entry?.costContext?.type === "ADMIN_OFFICE" || entry?.costContext?.type === "GENERAL_OVERHEAD") continue;
        const allocAmount = positiveMoney(allocation.allocationAmount);
        if (!allocAmount) continue;
        const targetCodeId = allocation.projectCostCodeId || (allocation as { costCodeId?: string }).costCodeId;
        addAmount(targetCodeId, "payroll", allocAmount, recordCurrency, confirmed);
      }
    }
  } else if (laborSource === "aggregate") {
    for (const aggregate of input.projectLaborAggregates || []) {
      if (aggregate.projectId !== projectId) continue;
      const confirmed = positiveMoney(aggregate.confirmedLaborCost);
      const pending = positiveMoney(aggregate.pendingLaborCost);
      const aggCurrency = normalizeCurrency(aggregate.currency);
      if (confirmed > 0) addAmount(undefined, "payroll", confirmed, aggCurrency, true);
      if (pending > 0) addAmount(undefined, "payroll", pending, aggCurrency, false);
    }
  }

  // 3. Expenses
  for (const expense of input.expenses || []) {
    if (expense.projectId !== projectId || expense.status === "VOID") continue;
    const amount = positiveMoney(expense.amount);
    if (!amount) continue;
    const sourceId = normalizedSourceDocumentId(expense.receiptSourceDocumentId);
    if (sourceId && sourceOwners.get(sourceId) === "invoice") continue;
    const expenseCurrency = normalizeCurrency(expense.currency);
    const confirmed = isConfirmedExpense(expense.status);
    const targetCodeId = expense.projectCostCodeId || (expense as { costCodeId?: string }).costCodeId;
    addAmount(targetCodeId, "expense", amount, expenseCurrency, confirmed);
  }

  // 4. Purchase Orders (Commitments)
  for (const po of input.purchaseOrders || []) {
    if (po.projectId !== projectId || !isCommittedPurchaseOrder(po.status)) continue;
    const poCurrency = normalizeCurrency(po.currency);
    const isBaseCurrency = poCurrency === baseCurrency;

    if (po.lines && po.lines.length > 0) {
      for (const line of po.lines) {
        const lineAmount = roundMoney(line.amount != null && Number.isFinite(Number(line.amount)) ? Number(line.amount) : (Number(line.quantity || 0) * Number(line.unitPrice || 0)));
        if (lineAmount <= 0) continue;
        const targetCodeId = line.projectCostCodeId || (line as { costCodeId?: string }).costCodeId;
        const target = (targetCodeId && validCostCodeIds.has(targetCodeId))
          ? codeAccumulators.get(targetCodeId)!
          : uncodedAccumulator;

        if (!isBaseCurrency) {
          target.foreignCosts[poCurrency] = roundMoney((target.foreignCosts[poCurrency] || 0) + lineAmount);
        } else {
          target.committedCost = roundMoney(target.committedCost + lineAmount);
        }
      }
    } else {
      const poAmount = purchaseOrderTotal(po);
      if (poAmount > 0) {
        if (!isBaseCurrency) {
          uncodedAccumulator.foreignCosts[poCurrency] = roundMoney((uncodedAccumulator.foreignCosts[poCurrency] || 0) + poAmount);
        } else {
          uncodedAccumulator.committedCost = roundMoney(uncodedAccumulator.committedCost + poAmount);
        }
      }
    }
  }

  // 5. Subcontracts & Progress Claims
  const approvedClaimsBySubcontract = new Map<string, SubcontractProgressClaim[]>();
  for (const claim of input.subcontractClaims || []) {
    if (claim.projectId === projectId && isApprovedSubcontractClaim(claim.status)) {
      const list = approvedClaimsBySubcontract.get(claim.subcontractId) || [];
      list.push(claim);
      approvedClaimsBySubcontract.set(claim.subcontractId, list);
    }
  }

  // Map approved variations by subcontract line and standalone variation lines
  const approvedVarLinesByScLine = new Map<string, number>();
  const approvedStandaloneVarLines: Array<{ vl: SubcontractVariationLine; currency: string }> = [];
  const varLinesById = new Map<string, SubcontractVariationLine>();

  for (const v of input.subcontractVariations || []) {
    if (v.projectId === projectId && isApprovedSubcontractVariation(v.status)) {
      for (const vl of v.lines || []) {
        varLinesById.set(vl.id, vl);
        const vlAmount = roundMoney(Number(vl.amount || 0));
        if (vl.subcontractLineId) {
          approvedVarLinesByScLine.set(
            vl.subcontractLineId,
            roundMoney((approvedVarLinesByScLine.get(vl.subcontractLineId) || 0) + vlAmount),
          );
        } else {
          const parentSc = (input.subcontracts || []).find((s) => s.id === v.subcontractId);
          approvedStandaloneVarLines.push({ vl, currency: v.currency || parentSc?.currency || baseCurrency });
        }
      }
    }
  }

  for (const sc of input.subcontracts || []) {
    if (sc.projectId !== projectId || !isCommittedSubcontract(sc.status)) continue;
    const scCurrency = normalizeCurrency(sc.currency);
    const isBaseCurrency = scCurrency === baseCurrency;
    const approvedClaims = approvedClaimsBySubcontract.get(sc.id) || [];

    // Map cumulative approved amount per subcontract line and variation line
    const approvedByLineId = new Map<string, number>();
    const approvedByVarLineId = new Map<string, number>();
    for (const claim of approvedClaims) {
      for (const cl of claim.lines || []) {
        if (cl.subcontractLineId) {
          approvedByLineId.set(
            cl.subcontractLineId,
            roundMoney((approvedByLineId.get(cl.subcontractLineId) || 0) + positiveMoney(cl.approvedAmount)),
          );
        }
        if (cl.subcontractVariationLineId) {
          approvedByVarLineId.set(
            cl.subcontractVariationLineId,
            roundMoney((approvedByVarLineId.get(cl.subcontractVariationLineId) || 0) + positiveMoney(cl.approvedAmount)),
          );
        }
      }
    }

    if (sc.lines && sc.lines.length > 0) {
      for (const line of sc.lines) {
        const lineAmount = roundMoney(
          line.amount != null && Number.isFinite(Number(line.amount))
            ? Number(line.amount)
            : (Number(line.quantity || 0) * Number(line.unitRate || 0)),
        );
        const varAdj = approvedVarLinesByScLine.get(line.id) || 0;
        const revisedLineAmount = roundMoney(Math.max(0, lineAmount + varAdj));
        if (revisedLineAmount <= 0) continue;
        const lineApproved = approvedByLineId.get(line.id) || 0;
        const lineRemainingCommitment = roundMoney(Math.max(0, revisedLineAmount - lineApproved));

        const targetCodeId = line.projectCostCodeId || (line as { costCodeId?: string }).costCodeId;
        const target = (targetCodeId && validCostCodeIds.has(targetCodeId))
          ? codeAccumulators.get(targetCodeId)!
          : uncodedAccumulator;

        if (!isBaseCurrency) {
          target.foreignCosts[scCurrency] = roundMoney((target.foreignCosts[scCurrency] || 0) + lineRemainingCommitment);
        } else {
          target.committedCost = roundMoney(target.committedCost + lineRemainingCommitment);
        }
      }
    } else {
      const scAmount = subcontractTotal(sc);
      if (scAmount > 0) {
        const totalApproved = roundMoney(approvedClaims.reduce((s, c) => s + positiveMoney(c.approvedGrossAmount), 0));
        const scRemaining = roundMoney(Math.max(0, scAmount - totalApproved));
        if (!isBaseCurrency) {
          uncodedAccumulator.foreignCosts[scCurrency] = roundMoney((uncodedAccumulator.foreignCosts[scCurrency] || 0) + scRemaining);
        } else {
          uncodedAccumulator.committedCost = roundMoney(uncodedAccumulator.committedCost + scRemaining);
        }
      }
    }

    // Accumulate certified subcontract work and retention on cost codes
    for (const claim of approvedClaims) {
      const rate = Number(claim.retentionRate || 0);
      for (const cl of claim.lines || []) {
        const approvedAmt = positiveMoney(cl.approvedAmount);
        if (approvedAmt <= 0) continue;
        const lineRetention = roundMoney(approvedAmt * rate);

        let targetCodeId: string | undefined;
        if (cl.subcontractLineId) {
          const scLine = (sc.lines || []).find((l) => l.id === cl.subcontractLineId);
          targetCodeId = scLine?.projectCostCodeId || (scLine as { costCodeId?: string })?.costCodeId;
        } else if (cl.subcontractVariationLineId) {
          const varLine = varLinesById.get(cl.subcontractVariationLineId);
          targetCodeId = varLine?.projectCostCodeId || (varLine as { costCodeId?: string })?.costCodeId;
        }

        const target = (targetCodeId && validCostCodeIds.has(targetCodeId))
          ? codeAccumulators.get(targetCodeId)!
          : uncodedAccumulator;

        if (isBaseCurrency) {
          target.certifiedSubcontractCost = roundMoney(target.certifiedSubcontractCost + approvedAmt);
          target.retentionHeldCost = roundMoney(target.retentionHeldCost + lineRetention);
        }
      }
    }
  }

  // Standalone variation lines remaining commitments
  for (const item of approvedStandaloneVarLines) {
    const varLine = item.vl;
    const varCurrency = normalizeCurrency(item.currency);
    const isBase = varCurrency === baseCurrency;
    const varLineAmount = roundMoney(Number(varLine.amount || 0));
    if (varLineAmount <= 0) continue;

    // Approved claims on this standalone line across claims on this project
    let approvedOnVl = 0;
    for (const claimsList of approvedClaimsBySubcontract.values()) {
      for (const c of claimsList) {
        for (const cl of c.lines || []) {
          if (cl.subcontractVariationLineId === varLine.id) {
            approvedOnVl = roundMoney(approvedOnVl + positiveMoney(cl.approvedAmount));
          }
        }
      }
    }

    const remainingVarCommitment = roundMoney(Math.max(0, varLineAmount - approvedOnVl));
    if (remainingVarCommitment <= 0) continue;

    const targetCodeId = varLine.projectCostCodeId || (varLine as { costCodeId?: string }).costCodeId;
    const target = (targetCodeId && validCostCodeIds.has(targetCodeId))
      ? codeAccumulators.get(targetCodeId)!
      : uncodedAccumulator;

    if (!isBase) {
      target.foreignCosts[varCurrency] = roundMoney((target.foreignCosts[varCurrency] || 0) + remainingVarCommitment);
    } else {
      target.committedCost = roundMoney(target.committedCost + remainingVarCommitment);
    }
  }

  const costCodeSummaries: CostCodeFinancialSummary[] = validCostCodes.map((cc) => {
    const acc = codeAccumulators.get(cc.id)!;
    const budgetAmount = roundMoney(cc.approvedBudgetAmount || 0);
    const actualCost = roundMoney(acc.actualCost);
    const pendingCost = roundMoney(acc.pendingCost);
    const committedCost = roundMoney(acc.committedCost);
    const certifiedSubcontractCost = roundMoney(acc.certifiedSubcontractCost);
    const retentionHeldCost = roundMoney(acc.retentionHeldCost);
    const forecastAmount = cc.forecastAmount != null && Number.isFinite(Number(cc.forecastAmount))
      ? roundMoney(cc.forecastAmount)
      : null;
    const actualVariance = roundMoney(budgetAmount - actualCost);
    const forecastVariance = forecastAmount != null ? roundMoney(budgetAmount - forecastAmount) : null;
    const budgetUsedPercent = budgetAmount > 0 ? roundMoney((actualCost / budgetAmount) * 100) : 0;
    const hasForeign = Object.entries(acc.foreignCosts).some(([, val]) => roundMoney(val) > 0);

    return {
      costCodeId: cc.id,
      code: cc.code,
      name: cc.name,
      description: cc.description,
      status: cc.status,
      currency: baseCurrency,
      budgetAmount,
      actualCost,
      pendingCost,
      committedCost,
      certifiedSubcontractCost,
      retentionHeldCost,
      forecastAmount,
      actualVariance,
      forecastVariance,
      budgetUsedPercent,
      invoiceCost: roundMoney(acc.invoiceCost),
      payrollCost: roundMoney(acc.payrollCost),
      otherExpenseCost: roundMoney(acc.otherExpenseCost),
      foreignCosts: acc.foreignCosts,
      hasForeignAmounts: hasForeign,
    };
  });

  const projectBudget = roundMoney(project.projectBudget || 0);
  const allocatedCostCodeBudget = roundMoney(
    validCostCodes
      .filter((cc) => cc.status === "ACTIVE")
      .reduce((sum, cc) => sum + roundMoney(cc.approvedBudgetAmount || 0), 0),
  );
  const unallocatedBudget = roundMoney(projectBudget - allocatedCostCodeBudget);

  const codedActualCost = roundMoney(costCodeSummaries.reduce((sum, s) => sum + s.actualCost, 0));
  const uncodedActualCost = roundMoney(baseSummary.totalActualCost - codedActualCost);

  const totalPendingCost = roundMoney(
    baseSummary.pendingInvoiceCost + baseSummary.pendingPayrollCost + baseSummary.pendingExpenseCost,
  );
  const codedPendingCost = roundMoney(costCodeSummaries.reduce((sum, s) => sum + s.pendingCost, 0));
  const uncodedPendingCost = roundMoney(totalPendingCost - codedPendingCost);

  const totalCommittedCost = roundMoney(baseSummary.committedCost);
  const codedCommittedCost = roundMoney(costCodeSummaries.reduce((sum, s) => sum + (s.committedCost || 0), 0));
  const uncodedCommittedCost = roundMoney(totalCommittedCost - codedCommittedCost);

  const totalCertifiedSubcontractCost = roundMoney(baseSummary.certifiedSubcontractCost || 0);
  const totalRetentionHeldCost = roundMoney(baseSummary.retentionHeldCost || 0);

  const uncodedForeignCosts = uncodedAccumulator.foreignCosts;
  const hasForeignAmounts = Object.entries(baseSummary.foreignCosts || {}).some(
    ([, val]) => roundMoney(val) > 0,
  );

  return {
    projectId,
    currency: baseCurrency,
    projectBudget,
    allocatedCostCodeBudget,
    unallocatedBudget,
    totalActualCost: baseSummary.totalActualCost,
    codedActualCost,
    uncodedActualCost,
    totalPendingCost,
    codedPendingCost,
    uncodedPendingCost,
    totalCommittedCost,
    codedCommittedCost,
    uncodedCommittedCost,
    totalCertifiedSubcontractCost,
    totalRetentionHeldCost,
    costCodes: costCodeSummaries,
    uncodedSummary: {
      actualCost: uncodedActualCost,
      pendingCost: uncodedPendingCost,
      committedCost: uncodedCommittedCost,
      certifiedSubcontractCost: roundMoney(uncodedAccumulator.certifiedSubcontractCost),
      retentionHeldCost: roundMoney(uncodedAccumulator.retentionHeldCost),
      invoiceCost: roundMoney(uncodedAccumulator.invoiceCost),
      payrollCost: roundMoney(uncodedAccumulator.payrollCost),
      otherExpenseCost: roundMoney(uncodedAccumulator.otherExpenseCost),
      foreignCosts: uncodedForeignCosts,
    },
    foreignCosts: baseSummary.foreignCosts,
    hasForeignAmounts,
    baseCostSummary: baseSummary,
  };
}

