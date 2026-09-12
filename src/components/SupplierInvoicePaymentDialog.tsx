import React, { useEffect, useMemo, useState } from "react";
import { CircleAlert, Landmark, Plus, WalletCards, X } from "lucide-react";
import { useAppPermissions } from "../app/AppPermissionContext.tsx";
import { financialId, type FinancialAccount } from "../lib/cashBanking.ts";
import {
  listFinancialAccounts,
  reverseFinancialTransactionInSupabase,
  saveFinancialAccountToSupabase,
  saveFinancialTransactionToSupabase,
} from "../lib/cashBankingPersistence.ts";
import type { FinancialSettlementHistoryItem, FinancialSettlementSummary } from "../lib/financialSettlement.ts";
import { confirmFinancialSettlement, loadFinancialSettlementSummary } from "../lib/financialSettlementPersistence.ts";
import {
  buildSupplierInvoicePaymentTransaction,
  supplierInvoicePaymentAmount,
  type SupplierInvoicePaymentMode,
} from "../lib/supplierInvoicePayment.ts";
import type { Expense, InvoiceData } from "../types.ts";
import { hasPermission, PERMISSION_KEYS } from "../utils/accessControl.ts";

interface SupplierInvoicePaymentDialogProps {
  open: boolean;
  invoice: Pick<InvoiceData, "id" | "invoiceNumber" | "reviewStatus">;
  expense: Expense;
  settlement: FinancialSettlementSummary;
  canRecordPayment?: boolean;
  onClose: () => void;
  onRecorded: (expense: Expense, settlement: FinancialSettlementSummary) => void;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatMoney(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function settlementAfterConfirmation(
  current: FinancialSettlementSummary,
  expense: Expense,
  amount: number,
  confirmed: FinancialSettlementHistoryItem,
): FinancialSettlementSummary {
  const reconciledCashPaid = Math.min(current.settlementBasis, roundMoney(current.reconciledCashPaid + amount));
  const outstanding = Math.max(0, roundMoney(current.settlementBasis - reconciledCashPaid));
  const settlementState = expense.status === "VOID"
    ? "VOID"
    : outstanding <= 0.005
      ? "PAID"
      : reconciledCashPaid > 0.005
        ? "PARTIALLY_PAID"
        : "UNPAID";
  return {
    ...current,
    lifecycleStatus: expense.status,
    reconciledCashPaid,
    effectiveSettled: reconciledCashPaid,
    outstanding,
    settlementState,
    history: [...current.history.filter((item) => item.id !== confirmed.id), confirmed],
  };
}

export const SupplierInvoicePaymentDialog: React.FC<SupplierInvoicePaymentDialogProps> = ({
  open,
  invoice,
  expense,
  settlement,
  canRecordPayment = false,
  onClose,
  onRecorded,
}) => {
  const permissions = useAppPermissions();
  const canManageTransactions = hasPermission(permissions, PERMISSION_KEYS.cashTransactionsManage);
  const canReconcile = hasPermission(permissions, PERMISSION_KEYS.cashReconcile);
  const canManageAccounts = hasPermission(permissions, PERMISSION_KEYS.cashAccountsManage);
  const canPay = canRecordPayment && canManageTransactions && canReconcile;

  const [mode, setMode] = useState<SupplierInvoicePaymentMode>("PAID");
  const [amount, setAmount] = useState(String(settlement.outstanding || ""));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [referenceNumber, setReferenceNumber] = useState("");
  const [note, setNote] = useState("");
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);
  const [accountType, setAccountType] = useState<"CASH" | "BANK">("CASH");
  const [accountName, setAccountName] = useState("Cash");
  const [institutionName, setInstitutionName] = useState("");
  const [maskedIdentifier, setMaskedIdentifier] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);

  const currency = String(expense.currency || settlement.currency || "PHP").toUpperCase();
  const matchingAccounts = useMemo(
    () => accounts.filter((account) => account.active && (account.accountType === "CASH" || account.accountType === "BANK") && account.currency.toUpperCase() === currency),
    [accounts, currency],
  );

  useEffect(() => {
    if (!open) return;
    setMode("PAID");
    setAmount(String(settlement.outstanding || ""));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setReferenceNumber("");
    setNote("");
    setError("");
    setAddingAccount(false);
    setAccountType("CASH");
    setAccountName("Cash");
    setInstitutionName("");
    setMaskedIdentifier("");
    setLoadingAccounts(true);
    void listFinancialAccounts()
      .then((loaded) => {
        const eligible = loaded.filter((account) => account.active && (account.accountType === "CASH" || account.accountType === "BANK") && account.currency.toUpperCase() === currency);
        setAccounts(loaded);
        setAccountId((current) => eligible.some((account) => account.id === current) ? current : eligible[0]?.id || "");
      })
      .catch((cause) => setError(errorMessage(cause, "Payment accounts could not be loaded.")))
      .finally(() => setLoadingAccounts(false));
  }, [open, expense.id, settlement.outstanding, currency]);

  if (!open) return null;

  const chooseMode = (nextMode: SupplierInvoicePaymentMode) => {
    setMode(nextMode);
    setError("");
    if (nextMode === "PAID") setAmount(String(settlement.outstanding));
    else if (Number(amount) >= settlement.outstanding - 0.005) setAmount("");
  };

  const createAccount = async () => {
    if (!canManageAccounts) {
      setError("You do not have permission to add a Cash/Bank account.");
      return;
    }
    const displayName = accountName.trim();
    const institution = accountType === "CASH" ? "Cash" : institutionName.trim();
    if (!displayName || !institution) {
      setError(accountType === "BANK" ? "Enter the account name and bank name." : "Enter a name for the cash account.");
      return;
    }
    setSavingAccount(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const created = await saveFinancialAccountToSupabase({
        id: financialId("account"),
        accountType,
        institutionName: institution,
        displayName,
        maskedIdentifier: maskedIdentifier.trim() || undefined,
        currency,
        openingBalance: 0,
        openingBalanceDate: paymentDate || now.slice(0, 10),
        connectionType: "MANUAL",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      setAccounts((current) => [...current.filter((account) => account.id !== created.id), created]);
      setAccountId(created.id);
      setAddingAccount(false);
    } catch (cause) {
      setError(errorMessage(cause, "The Cash/Bank account could not be created."));
    } finally {
      setSavingAccount(false);
    }
  };

  const confirmPayment = async () => {
    if (invoice.reviewStatus !== "VERIFIED") {
      setError("Only a verified supplier invoice can record a payment.");
      return;
    }
    if (!canPay) {
      setError("You do not have permission to record this supplier payment.");
      return;
    }
    const selectedAccount = matchingAccounts.find((account) => account.id === accountId);
    if (!selectedAccount) {
      setError("Select a Cash/Bank payment account before confirming the payment.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      setError("Enter a valid payment date.");
      return;
    }

    let resolvedAmount = 0;
    try {
      resolvedAmount = supplierInvoicePaymentAmount(mode, settlement.outstanding, Number(amount));
    } catch (cause) {
      setError(errorMessage(cause, "Enter a valid payment amount."));
      return;
    }

    setSubmitting(true);
    setError("");
    const paymentExpense = expense;
    let transactionId = "";
    let settlementConfirmed = false;
    try {
      const transaction = await saveFinancialTransactionToSupabase(buildSupplierInvoicePaymentTransaction({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        expenseId: paymentExpense.id,
        accountId: selectedAccount.id,
        paymentDate,
        amount: resolvedAmount,
        currency,
        referenceNumber,
      }));
      transactionId = transaction.id;

      const confirmed = await confirmFinancialSettlement({
        transactionId: transaction.id,
        targetType: "EXPENSE",
        targetId: paymentExpense.id,
        amount: resolvedAmount,
        matchId: financialId("match"),
        notes: note.trim() || undefined,
        confirmationSource: "INVOICE_STATUS_UI",
      });
      settlementConfirmed = true;

      let updatedSummary = settlementAfterConfirmation(settlement, paymentExpense, resolvedAmount, confirmed);
      try {
        updatedSummary = await loadFinancialSettlementSummary("EXPENSE", paymentExpense.id) || updatedSummary;
      } catch {
        // The settlement is already authoritative. Keep the confirmed local projection
        // instead of undoing a legitimate payment because a follow-up read failed.
      }
      onRecorded(paymentExpense, updatedSummary);
      onClose();
    } catch (cause) {
      let message = errorMessage(cause, "The supplier payment could not be recorded.");
      if (transactionId && !settlementConfirmed) {
        try {
          await reverseFinancialTransactionInSupabase(transactionId, "Supplier invoice payment flow did not complete.");
        } catch (rollbackCause) {
          message = `${message} The created transaction also could not be reversed automatically; open Cash & Banking to review it before retrying.`;
          console.error("Supplier payment transaction rollback failed", rollbackCause);
        }
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-4 py-6" role="presentation">
    <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Change supplier invoice status" data-testid="supplier-payment-dialog">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Change Status</p>
          <h2 className="text-lg font-black text-slate-950">Record supplier payment</h2>
        </div>
        <button type="button" onClick={onClose} disabled={submitting || savingAccount} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close payment dialog"><X className="h-5 w-5" /></button>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-bold text-slate-600">Remaining balance</p>
          <p className="mt-1 text-xl font-black text-slate-950">{formatMoney(settlement.outstanding, currency)}</p>
        </div>

        <fieldset>
          <legend className="mb-2 text-xs font-black text-slate-700">New status</legend>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => chooseMode("PAID")} className={`min-h-11 rounded-xl border px-3 text-sm font-black ${mode === "PAID" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700"}`}>Paid</button>
            <button type="button" onClick={() => chooseMode("PARTIALLY_PAID")} className={`min-h-11 rounded-xl border px-3 text-sm font-black ${mode === "PARTIALLY_PAID" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700"}`}>Partially Paid</button>
          </div>
        </fieldset>

        {expense.status === "DRAFT" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3" data-testid="supplier-payment-draft-approval-notice">
          <p className="flex gap-2 text-xs font-black text-amber-950"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />This supplier-derived DRAFT Expense remains a DRAFT cost record; confirmed cash settlement will be recorded against it.</p>
        </div>}

        <div>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label htmlFor="supplier-payment-account" className="text-xs font-black text-slate-700">Payment account</label>
            <button type="button" onClick={() => { setAddingAccount(true); setError(""); }} disabled={!canManageAccounts || submitting} className="inline-flex min-h-9 w-full items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-black text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"><Plus className="h-3.5 w-3.5" /> Add Cash/Bank Account</button>
          </div>
          {loadingAccounts ? <p className="text-xs text-slate-500">Loading payment accounts…</p> : matchingAccounts.length ? <select id="supplier-payment-account" value={accountId} onChange={(event) => setAccountId(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900">
            <option value="">Select Cash/Bank</option>
            {matchingAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountType === "CASH" ? "Cash" : "Bank"} · {account.displayName}</option>)}
          </select> : <div className="rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-600">No {currency} Cash/Bank account is configured. {canManageAccounts ? "Add one here without leaving this payment." : "Ask an administrator to add one before recording payment."}</div>}
        </div>

        {addingAccount && <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3" data-testid="inline-financial-account-form">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-950"><Landmark className="h-4 w-4" />Add Cash/Bank Account</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">Type<select value={accountType} onChange={(event) => { const type = event.target.value as "CASH" | "BANK"; setAccountType(type); if (type === "CASH" && !accountName.trim()) setAccountName("Cash"); }} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal"><option value="CASH">Cash</option><option value="BANK">Bank Account</option></select></label>
            <label className="text-xs font-bold text-slate-700">Account name<input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder={accountType === "CASH" ? "Cash" : "Operating account"} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal" /></label>
          </div>
          {accountType === "BANK" && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">Bank name<input value={institutionName} onChange={(event) => setInstitutionName(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal" /></label>
            <label className="text-xs font-bold text-slate-700">Last digits (optional)<input value={maskedIdentifier} onChange={(event) => setMaskedIdentifier(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal" /></label>
          </div>}
          <p className="text-[11px] text-indigo-900">The new account will use {currency} and a zero opening balance. You can manage full account details later.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setAddingAccount(false)} disabled={savingAccount} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-700">Cancel</button>
            <button type="button" onClick={() => void createAccount()} disabled={savingAccount} className="min-h-10 rounded-lg bg-indigo-700 px-3 text-xs font-black text-white disabled:opacity-50">{savingAccount ? "Adding…" : "Add and select account"}</button>
          </div>
        </div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-black text-slate-700">Amount<input type="number" min="0.01" step="0.01" value={mode === "PAID" ? settlement.outstanding : amount} onChange={(event) => setAmount(event.target.value)} disabled={mode === "PAID"} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal disabled:bg-slate-100" /></label>
          <label className="text-xs font-black text-slate-700">Payment date<input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal" /></label>
        </div>
        <label className="block text-xs font-black text-slate-700">Reference (optional)<input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal" /></label>
        <label className="block text-xs font-black text-slate-700">Note (optional)<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal" /></label>

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800" role="alert">{error}</p>}

        <button type="button" onClick={() => void confirmPayment()} disabled={submitting || savingAccount || loadingAccounts || !canPay} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"><WalletCards className="h-4 w-4" />{submitting ? "Recording payment…" : "Confirm Payment"}</button>
      </div>
    </section>
  </div>;
};

export default SupplierInvoicePaymentDialog;
