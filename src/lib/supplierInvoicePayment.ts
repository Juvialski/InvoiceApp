import type { Expense, InvoiceData } from "../types.ts";
import { financialId, stableFinancialFingerprint, type FinancialTransaction } from "./cashBanking.ts";
import type { FinancialSettlementSummary } from "./financialSettlement.ts";

export type SupplierInvoicePaymentDisplayState = "PAID" | "PARTIALLY_PAID" | "OVERDUE" | "UNPAID" | "VOID";
export type SupplierInvoicePaymentMode = "PAID" | "PARTIALLY_PAID";

function money(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round((numeric + Number.EPSILON) * 100) / 100 : 0;
}

export function deriveSupplierInvoicePaymentState(
  invoice: Pick<InvoiceData, "reviewStatus" | "lifecycleStatus" | "dueDate">,
  expense: Pick<Expense, "status" | "amount">,
  settlement: Pick<FinancialSettlementSummary, "settlementBasis" | "reconciledCashPaid" | "outstanding"> | null | undefined,
  today = new Date().toISOString().slice(0, 10),
): SupplierInvoicePaymentDisplayState {
  if (invoice.lifecycleStatus === "VOID" || expense.status === "VOID") return "VOID";

  const basis = Math.max(0, money(settlement?.settlementBasis ?? expense.amount));
  const paid = Math.max(0, money(settlement?.reconciledCashPaid));
  const outstanding = Math.max(0, money(settlement?.outstanding ?? basis - paid));

  if (basis > 0.005 && outstanding <= 0.005) return "PAID";
  if (paid > 0.005) return "PARTIALLY_PAID";

  const overdue = Boolean(
    invoice.reviewStatus === "VERIFIED"
      && invoice.dueDate
      && /^\d{4}-\d{2}-\d{2}$/.test(invoice.dueDate)
      && invoice.dueDate < today,
  );
  return overdue ? "OVERDUE" : "UNPAID";
}

export function supplierInvoicePaymentAmount(
  mode: SupplierInvoicePaymentMode,
  outstanding: number,
  requestedAmount?: number,
) {
  const remaining = Math.max(0, money(outstanding));
  if (remaining <= 0.005) throw new Error("This supplier invoice has no remaining balance to pay.");
  if (mode === "PAID") return remaining;

  const amount = money(requestedAmount);
  if (amount <= 0) throw new Error("Enter a payment amount greater than zero.");
  if (amount >= remaining - 0.005) throw new Error("Choose Paid when paying the full remaining balance.");
  return amount;
}

export function buildSupplierInvoicePaymentTransaction(input: {
  invoiceId: string;
  invoiceNumber?: string;
  expenseId: string;
  accountId: string;
  paymentDate: string;
  amount: number;
  currency: string;
  referenceNumber?: string;
  now?: string;
}): FinancialTransaction {
  const now = input.now || new Date().toISOString();
  const amount = money(input.amount);
  return {
    id: financialId("supplier-payment"),
    accountId: input.accountId,
    transactionDate: input.paymentDate,
    postedAt: now,
    referenceNumber: input.referenceNumber?.trim() || undefined,
    description: `Supplier invoice ${input.invoiceNumber || input.invoiceId} payment`,
    direction: "DEBIT",
    amount,
    currency: input.currency.toUpperCase(),
    status: "POSTED",
    source: "MANUAL",
    sourceFingerprint: stableFinancialFingerprint([
      "supplier-invoice-payment",
      input.invoiceId,
      input.expenseId,
      input.accountId,
      input.paymentDate,
      amount,
      input.referenceNumber || "",
    ]),
    reconciliationStatus: "UNMATCHED",
    createdAt: now,
    updatedAt: now,
  };
}
