import type { Expense, InvoiceData } from "../types.ts";
import {
  confirmedSettlementTotal,
  deriveExpenseSettlementSummary,
  deriveInvoiceSettlementSummary,
  type FinancialSettlementHistoryItem,
  type FinancialSettlementSummary,
  type InvoiceSettlementState,
  type SettlementTargetType,
} from "./financialSettlement.ts";
import { businessDateForTimeZone, isPastDueDate } from "../utils/businessDate.ts";

export type SupplierInvoicePaymentDisplayState = Exclude<InvoiceSettlementState, "TRANSFERRED_TO_EXPENSE">;
export type SupplierInvoiceSettlementInvoice = Pick<InvoiceData, "id" | "linkedExpenseId" | "reviewStatus" | "lifecycleStatus" | "dueDate" | "amountPaid" | "grandTotal" | "currency" | "netAmountPayable" | "withholdingTaxAmount" | "philippineTaxDetails">;
export interface SupplierInvoiceSettlementMatch {
  id?: string;
  transactionId?: string;
  targetType: string;
  targetId?: string | null;
  matchedAmount: number;
  status: string;
  confirmedAt?: string;
  confirmedByUserId?: string;
  reversedAt?: string;
  reversedByUserId?: string;
  reversalReason?: string;
  confirmationSource?: string;
}

const MONEY_TOLERANCE = 0.005;

function money(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round((numeric + Number.EPSILON) * 100) / 100 : 0;
}

function positiveMoney(value: unknown) {
  return Math.max(0, money(value));
}

function historyForMatch(match: SupplierInvoiceSettlementMatch, index: number): FinancialSettlementHistoryItem | null {
  if (!match.targetId || !["CONFIRMED", "REVERSED"].includes(match.status)) return null;
  return {
    id: match.id || `supplier-settlement-${index}`,
    transactionId: match.transactionId || `supplier-transaction-${index}`,
    status: match.status === "REVERSED" ? "REVERSED" : "CONFIRMED",
    amount: positiveMoney(match.matchedAmount),
    confirmedAt: match.confirmedAt,
    confirmedByUserId: match.confirmedByUserId,
    reversedAt: match.reversedAt,
    reversedByUserId: match.reversedByUserId,
    reversalReason: match.reversalReason,
    confirmationSource: match.confirmationSource,
    targetType: match.targetType as SettlementTargetType,
    targetId: match.targetId,
  };
}

function linkedExpenseForInvoice(invoice: Pick<InvoiceData, "id" | "linkedExpenseId">, expenses: readonly Expense[]) {
  const bySource = expenses.filter((expense) => expense.supplierInvoiceId === invoice.id);
  const byPointer = invoice.linkedExpenseId ? expenses.find((expense) => expense.id === invoice.linkedExpenseId) : undefined;
  const activeCandidates = [...bySource.filter((expense) => expense.status !== "VOID"), ...(byPointer && byPointer.status !== "VOID" ? [byPointer] : [])]
    .filter((expense, index, rows) => rows.findIndex((candidate) => candidate.id === expense.id) === index);
  const linked = activeCandidates[0] || bySource[0] || byPointer;
  return { linked, conflict: activeCandidates.length > 1, missing: Boolean(invoice.linkedExpenseId && !linked) };
}

function historyForSupplierInvoice(invoiceId: string, expense: Expense | undefined, matches: readonly SupplierInvoiceSettlementMatch[]) {
  const histories = matches
    .filter((match) => (match.targetType === "INVOICE" && String(match.targetId || "") === invoiceId)
      || (match.targetType === "EXPENSE" && Boolean(expense) && String(match.targetId || "") === expense?.id))
    .map((match, index) => historyForMatch(match, index))
    .filter((item): item is FinancialSettlementHistoryItem => Boolean(item));
  return histories;
}

function documentReportedPaid(invoice: Pick<InvoiceData, "amountPaid">, basis: number) {
  return Math.min(basis, positiveMoney(invoice.amountPaid));
}

/**
 * One supplier-facing payment predicate. The supplier invoice due date is
 * date-only business data; only confirmed settlement evidence reduces the
 * remaining payable. The linked Expense lifecycle is deliberately not used
 * as a generic Expense lifecycle override.
 */
export function deriveSupplierInvoicePaymentState(
  invoice: Pick<InvoiceData, "reviewStatus" | "lifecycleStatus" | "dueDate">,
  expense: Pick<Expense, "status" | "amount"> | null | undefined,
  settlement: Pick<FinancialSettlementSummary, "settlementBasis" | "reconciledCashPaid" | "outstanding"> | null | undefined,
  today = businessDateForTimeZone(),
): SupplierInvoicePaymentDisplayState {
  if (invoice.lifecycleStatus === "VOID" || expense?.status === "VOID") return "VOID";
  if (invoice.reviewStatus !== "VERIFIED") return "UNPAID";

  const basis = positiveMoney(settlement?.settlementBasis ?? expense?.amount);
  const paid = Math.min(basis, positiveMoney(settlement?.reconciledCashPaid));
  const outstanding = Math.max(0, money(settlement?.outstanding ?? basis - paid));
  if (basis > MONEY_TOLERANCE && outstanding <= MONEY_TOLERANCE) return "PAID";
  if (isPastDueDate(outstanding, invoice.dueDate, today)) return "OVERDUE";
  if (paid > MONEY_TOLERANCE && outstanding > MONEY_TOLERANCE) return "PARTIALLY_PAID";
  return "UNPAID";
}

export interface SupplierInvoiceSettlementProjection {
  invoiceId: string;
  targetType: "INVOICE" | "EXPENSE";
  targetId: string;
  linkedExpense?: Expense;
  /** False when the invoice is unverified, void, or its authority is missing/conflicted. */
  payable: boolean;
  authorityConflict?: boolean;
  paymentState: SupplierInvoicePaymentDisplayState;
  settlement: FinancialSettlementSummary;
}

function finalizeProjection(
  invoice: SupplierInvoiceSettlementInvoice,
  expense: Expense | undefined,
  base: FinancialSettlementSummary,
  today: string,
  options: { conflict?: boolean; missing?: boolean } = {},
): SupplierInvoiceSettlementProjection {
  const state = deriveSupplierInvoicePaymentState(invoice, expense, base, today);
  const authorityConflict = Boolean(options.conflict || base.authorityConflict);
  const expenseAuthority = Boolean(expense || invoice.linkedExpenseId || base.targetType === "EXPENSE");
  const targetType = expenseAuthority ? "EXPENSE" as const : "INVOICE" as const;
  const targetId = expense?.id || invoice.linkedExpenseId || (expenseAuthority ? base.targetId : invoice.id);
  const payable = !authorityConflict
    && !options.missing
    && invoice.reviewStatus === "VERIFIED"
    && invoice.lifecycleStatus !== "VOID"
    && expense?.status !== "VOID"
    && base.settlementBasis > MONEY_TOLERANCE;
  return {
    invoiceId: invoice.id,
    targetType,
    targetId,
    linkedExpense: expense,
    payable,
    authorityConflict,
    paymentState: payable || state === "VOID" ? state : "UNPAID",
    settlement: {
      ...base,
      targetType,
      targetId,
      documentReportedPaid: documentReportedPaid(invoice, base.settlementBasis),
      effectiveSettled: base.reconciledCashPaid,
      outstanding: options.missing ? 0 : money(Math.max(0, base.settlementBasis - base.reconciledCashPaid)),
      settlementState: payable || state === "VOID" ? state : "UNPAID",
      authorityConflict,
    },
  };
}

export function deriveSupplierInvoiceSettlementProjection(
  invoice: SupplierInvoiceSettlementInvoice,
  expense: Expense | undefined,
  matches: readonly SupplierInvoiceSettlementMatch[] = [],
  today = businessDateForTimeZone(),
  options: { conflict?: boolean; missing?: boolean } = {},
) {
  const history = historyForSupplierInvoice(invoice.id, expense, matches);
  const base = expense
    ? deriveExpenseSettlementSummary(expense, history)
    : deriveInvoiceSettlementSummary(invoice, history, today);
  return finalizeProjection(invoice, expense, options.missing ? { ...base, settlementBasis: 0, reconciledCashPaid: 0, effectiveSettled: 0, outstanding: 0 } : base, today, options);
}

export function buildSupplierInvoiceSettlementProjections(
  invoices: readonly SupplierInvoiceSettlementInvoice[],
  expenses: readonly Expense[] = [],
  matches: readonly SupplierInvoiceSettlementMatch[] = [],
  today = businessDateForTimeZone(),
) {
  const result = new Map<string, SupplierInvoiceSettlementProjection>();
  for (const invoice of invoices) {
    const linked = linkedExpenseForInvoice(invoice, expenses);
    result.set(invoice.id, deriveSupplierInvoiceSettlementProjection(invoice, linked.linked, matches, today, { conflict: linked.conflict, missing: linked.missing }));
  }
  return result;
}

/** Rebind a server summary to supplier due-date and linked-Expense semantics. */
export function supplierInvoiceProjectionFromSummary(
  invoice: SupplierInvoiceSettlementInvoice,
  expense: Expense | undefined,
  summary: FinancialSettlementSummary,
  today = businessDateForTimeZone(),
  options: { conflict?: boolean; missing?: boolean } = {},
) {
  return finalizeProjection(invoice, expense, summary, today, options);
}

export function supplierInvoicePaymentStateFor(
  invoice: SupplierInvoiceSettlementInvoice,
  projection?: SupplierInvoiceSettlementProjection,
  today = businessDateForTimeZone(),
) {
  if (projection) return projection.paymentState;
  const fallbackBasis = positiveMoney(invoice.grandTotal);
  return deriveSupplierInvoicePaymentState(invoice, undefined, {
    settlementBasis: fallbackBasis,
    reconciledCashPaid: 0,
    outstanding: fallbackBasis,
  }, today);
}

export function confirmedSupplierInvoiceSettlementAmount(
  invoiceId: string,
  expenseId: string | undefined,
  matches: readonly Pick<SupplierInvoiceSettlementMatch, "targetType" | "targetId" | "matchedAmount" | "status">[],
) {
  return money(confirmedSettlementTotal(matches
    .filter((match) => (match.targetType === "INVOICE" && String(match.targetId || "") === invoiceId)
      || (match.targetType === "EXPENSE" && Boolean(expenseId) && String(match.targetId || "") === expenseId))
    .map((match) => ({ status: match.status === "CONFIRMED" ? "CONFIRMED" as const : "REVERSED" as const, amount: match.matchedAmount }))));
}
