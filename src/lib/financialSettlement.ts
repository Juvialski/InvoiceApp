import type { InvoiceData, PayrollEntry, PayrollRun } from "../types.ts";
import type { FinancialAccount, FinancialTransaction } from "./cashBanking.ts";
import { derivePaymentStatus } from "../utils/invoiceLogic.ts";

export type SettlementTargetType = "INVOICE" | "PAYROLL" | "EXPENSE";
export type SettlementRecordStatus = "CONFIRMED" | "REVERSED";
export type InvoiceSettlementState = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";
export type PayrollSettlementState = "UNSETTLED" | "PARTIALLY_DISBURSED" | "SETTLED";

export interface FinancialSettlementHistoryItem {
  id: string;
  transactionId: string;
  status: SettlementRecordStatus;
  amount: number;
  confirmedAt?: string;
  confirmedByUserId?: string;
  reversedAt?: string;
  reversedByUserId?: string;
  reversalReason?: string;
  confirmationSource?: string;
  accountId?: string;
  accountName?: string;
  accountType?: FinancialAccount["accountType"];
  maskedIdentifier?: string;
  transactionDate?: string;
  referenceNumber?: string;
  description?: string;
  currency?: string;
}

export interface FinancialSettlementSummary {
  targetType: SettlementTargetType;
  targetId: string;
  currency: string;
  lifecycleStatus?: string;
  settlementBasis: number;
  basisSource: "EXPLICIT_NET_PAYABLE" | "GROSS_DOCUMENT_AMOUNT" | "EMPLOYEE_NET_PAY" | "EXPENSE_AMOUNT";
  reconciledCashPaid: number;
  documentReportedPaid: number;
  effectiveSettled: number;
  outstanding: number;
  settlementState: InvoiceSettlementState | PayrollSettlementState;
  legacyPaidWithoutBankLink?: boolean;
  historyRedacted?: boolean;
  history: FinancialSettlementHistoryItem[];
}

export interface SettlementCandidate {
  targetType: "INVOICE" | "PAYROLL";
  targetId: string;
  label: string;
  currency: string;
  settlementBasis: number;
  settledAmount: number;
  outstandingAmount: number;
  date?: string;
  dueDate?: string;
  referenceNumber?: string;
  counterparty?: string;
  lifecycleStatus?: string;
  projectLabel?: string;
}

function money(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round((numeric + Number.EPSILON) * 100) / 100 : 0;
}

function positive(value: unknown): number | undefined {
  const numeric = money(value);
  return numeric > 0 ? numeric : undefined;
}

/**
 * Cash payable basis is independent of project cost. An explicitly supplied
 * top-level netAmountPayable is trusted. Nested PH net payable is trusted only
 * with an explicit withholding amount so an extracted remaining-balance field
 * is not accidentally treated as the original obligation.
 */
export function invoiceCashPayableBasis(invoice: Pick<InvoiceData, "grandTotal" | "netAmountPayable" | "withholdingTaxAmount" | "philippineTaxDetails">) {
  const explicitTopLevel = positive(invoice.netAmountPayable);
  if (explicitTopLevel !== undefined) return { amount: explicitTopLevel, source: "EXPLICIT_NET_PAYABLE" as const };
  const nestedWithholding = positive(invoice.philippineTaxDetails?.withholdingTaxAmount ?? invoice.withholdingTaxAmount);
  const nestedNet = positive(invoice.philippineTaxDetails?.netAmountPayable);
  if (nestedWithholding !== undefined && nestedNet !== undefined) return { amount: nestedNet, source: "EXPLICIT_NET_PAYABLE" as const };
  return { amount: Math.max(0, money(invoice.grandTotal)), source: "GROSS_DOCUMENT_AMOUNT" as const };
}

export function payrollNetPayBasis(entries: readonly Pick<PayrollEntry, "netPay">[]) {
  return money(entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.netPay) || 0), 0));
}

export function confirmedSettlementTotal(history: readonly Pick<FinancialSettlementHistoryItem, "status" | "amount">[]) {
  return money(history.filter((item) => item.status === "CONFIRMED").reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0));
}

export function remainingTransactionAmount(transaction: Pick<FinancialTransaction, "amount" | "id">, history: readonly Pick<FinancialSettlementHistoryItem, "transactionId" | "status" | "amount">[]) {
  const allocated = history
    .filter((item) => item.transactionId === transaction.id && item.status === "CONFIRMED")
    .reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
  return money(Math.max(0, Number(transaction.amount) - allocated));
}

export function deriveInvoiceSettlementSummary(
  invoice: Pick<InvoiceData, "id" | "currency" | "grandTotal" | "netAmountPayable" | "withholdingTaxAmount" | "philippineTaxDetails" | "amountPaid" | "dueDate" | "reviewStatus">,
  history: readonly FinancialSettlementHistoryItem[],
): FinancialSettlementSummary {
  const basis = invoiceCashPayableBasis(invoice);
  const bankPaid = Math.min(basis.amount, confirmedSettlementTotal(history));
  const documentPaid = Math.min(basis.amount, Math.max(0, money(invoice.amountPaid)));
  // Extracted/manual payment evidence may describe the same cash payment later
  // linked from the bank. Never add the two blindly; the greater evidenced
  // amount is a conservative operational total that cannot decrease when a
  // first reconciliation is linked.
  const effective = Math.max(bankPaid, documentPaid);
  const outstanding = money(Math.max(0, basis.amount - effective));
  const rawStatus = derivePaymentStatus({ grandTotal: basis.amount, amountPaid: effective, balanceDue: outstanding, dueDate: invoice.dueDate });
  const status: InvoiceSettlementState = rawStatus === "PAID" || rawStatus === "PARTIALLY_PAID" || rawStatus === "OVERDUE" ? rawStatus : "UNPAID";
  return {
    targetType: "INVOICE",
    targetId: invoice.id,
    currency: invoice.currency || "PHP",
    lifecycleStatus: invoice.reviewStatus,
    settlementBasis: basis.amount,
    basisSource: basis.source,
    reconciledCashPaid: bankPaid,
    documentReportedPaid: documentPaid,
    effectiveSettled: effective,
    outstanding,
    settlementState: status,
    history: [...history],
  };
}

export function derivePayrollSettlementSummary(
  run: Pick<PayrollRun, "id" | "status">,
  entries: readonly Pick<PayrollEntry, "netPay">[],
  history: readonly FinancialSettlementHistoryItem[],
  currency = "PHP",
): FinancialSettlementSummary {
  const basis = payrollNetPayBasis(entries);
  const bankPaid = Math.min(basis, confirmedSettlementTotal(history));
  const outstanding = money(Math.max(0, basis - bankPaid));
  const state: PayrollSettlementState = bankPaid <= 0.005 ? "UNSETTLED" : outstanding <= 0.005 ? "SETTLED" : "PARTIALLY_DISBURSED";
  return {
    targetType: "PAYROLL",
    targetId: run.id,
    currency,
    lifecycleStatus: run.status,
    settlementBasis: basis,
    basisSource: "EMPLOYEE_NET_PAY",
    reconciledCashPaid: bankPaid,
    documentReportedPaid: 0,
    effectiveSettled: bankPaid,
    outstanding,
    settlementState: state,
    legacyPaidWithoutBankLink: run.status === "PAID" && bankPaid <= 0.005,
    history: [...history],
  };
}

export function assertSettlementInput(transaction: Pick<FinancialTransaction, "status" | "direction" | "currency">, targetCurrency: string, amount: number) {
  if (transaction.status !== "POSTED") throw new Error("Only POSTED transactions can be used for settlement.");
  if (transaction.direction !== "DEBIT") throw new Error("Supplier invoice and payroll settlements require a DEBIT transaction.");
  if (transaction.currency.toUpperCase() !== targetCurrency.toUpperCase()) throw new Error("Transaction and target currency must match; FX settlement is not supported.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Settlement amount must be positive.");
}

export function defaultSettlementAllocation(transactionRemaining: number, targetRemaining: number) {
  return money(Math.max(0, Math.min(transactionRemaining, targetRemaining)));
}

export function eligibleSettlementCandidates(transaction: FinancialTransaction, candidates: readonly SettlementCandidate[]) {
  if (transaction.status !== "POSTED" || transaction.direction !== "DEBIT") return [];
  return candidates.filter((candidate) =>
    candidate.outstandingAmount > 0.005 &&
    candidate.currency.toUpperCase() === transaction.currency.toUpperCase() &&
    (candidate.targetType === "INVOICE" ? candidate.lifecycleStatus === "VERIFIED" : ["APPROVED", "PAID"].includes(candidate.lifecycleStatus || ""))
  );
}
