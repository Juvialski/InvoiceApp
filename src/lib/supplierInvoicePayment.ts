import type { InvoiceData } from "../types.ts";
import { financialId, stableFinancialFingerprint, type FinancialTransaction } from "./cashBanking.ts";
export { deriveSupplierInvoicePaymentState, type SupplierInvoicePaymentDisplayState } from "./supplierInvoiceSettlement.ts";

export type SupplierInvoicePaymentMode = "PAID" | "PARTIALLY_PAID";

function money(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round((numeric + Number.EPSILON) * 100) / 100 : 0;
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
