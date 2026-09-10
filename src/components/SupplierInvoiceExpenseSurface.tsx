import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, CircleAlert, LockKeyhole, RotateCcw, WalletCards } from "lucide-react";
import type { Expense, FinancialFxSnapshot, InvoiceData } from "../types.ts";
import { deriveExpenseSettlementSummary, type FinancialSettlementHistoryItem, type FinancialSettlementSummary } from "../lib/financialSettlement.ts";
import { loadFinancialSettlementSummary } from "../lib/financialSettlementPersistence.ts";
import { deriveSupplierInvoicePaymentState } from "../lib/supplierInvoicePayment.ts";
import { demoSettlementSummaryForTarget } from "../demo/data/settlements.ts";
import { appPathForExpense, appPathForInvoice } from "../utils/appRouting.ts";
import type { AppNavigate } from "../utils/clientNavigation.ts";
import { FinancialSettlementCard } from "./FinancialSettlementCard.tsx";
import { SupplierInvoicePaymentDialog } from "./SupplierInvoicePaymentDialog.tsx";

export interface SupplierInvoiceExpenseSurfaceProps {
  invoice: Pick<InvoiceData, "id" | "invoiceNumber" | "reviewStatus" | "lifecycleStatus" | "dueDate" | "currency" | "status">;
  linkedExpenseId?: string;
  linkedExpense?: Expense;
  loading?: boolean;
  canRecordPayment?: boolean;
  canReversePayment?: boolean;
  financialFxSnapshots?: readonly FinancialFxSnapshot[];
  onNavigatePath?: AppNavigate;
}

function demoHref(path: string, id: string) {
  return id.startsWith("demo-") ? `/demo/app${path}` : path;
}

function formatMoney(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${(value || 0).toFixed(2)}`; }
}

function statusTone(status: ReturnType<typeof deriveSupplierInvoicePaymentState>) {
  if (status === "PAID") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "PARTIALLY_PAID") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "OVERDUE") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export const SupplierInvoiceExpenseSurface: React.FC<SupplierInvoiceExpenseSurfaceProps> = ({
  invoice,
  linkedExpenseId,
  linkedExpense,
  loading = false,
  canRecordPayment = false,
  canReversePayment = false,
  financialFxSnapshots = [],
  onNavigatePath,
}) => {
  const [currentExpense, setCurrentExpense] = useState<Expense | undefined>(linkedExpense);
  const [summary, setSummary] = useState<FinancialSettlementSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);

  useEffect(() => { setCurrentExpense(linkedExpense); }, [linkedExpense?.id, linkedExpense?.updatedAt]);

  const demoSummary = useMemo(() => {
    if (!currentExpense?.id.startsWith("demo-")) return null;
    return demoSettlementSummaryForTarget("EXPENSE", currentExpense.id) || deriveExpenseSettlementSummary(currentExpense, []);
  }, [currentExpense?.id]);

  const refreshSummary = async () => {
    if (!currentExpense) return;
    if (currentExpense.id.startsWith("demo-")) {
      setSummary(demoSummary);
      setSummaryError("");
      setSummaryLoading(false);
      return;
    }
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const loaded = await loadFinancialSettlementSummary("EXPENSE", currentExpense.id);
      if (!loaded) throw new Error("Payment status is unavailable for the linked Expense.");
      setSummary(loaded);
    } catch (cause) {
      setSummaryError(cause instanceof Error ? cause.message : "Payment status could not be loaded.");
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (!currentExpense) return;
    setSummary(currentExpense.id.startsWith("demo-") ? demoSummary : null);
    setSummaryError("");
    void refreshSummary();
  }, [currentExpense?.id]);

  if (!linkedExpenseId) return null;

  const expensePath = appPathForExpense(linkedExpenseId, appPathForInvoice(invoice.id));
  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (!onNavigatePath) return;
    event.preventDefault();
    onNavigatePath(path);
  };
  const secondaryExpenseLink = currentExpense ? <a
    href={demoHref(expensePath, currentExpense.id)}
    onClick={(event) => navigate(event, expensePath)}
    aria-label="Open/Correct linked Expense"
    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
  >
    Open/Correct linked Expense <ArrowRight className="h-3.5 w-3.5" />
  </a> : null;

  if (loading) {
    return <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4" aria-label="Supplier payment" data-testid="supplier-invoice-expense-bridge">
      <p className="flex items-center gap-2 text-xs font-black text-indigo-950"><LockKeyhole className="h-4 w-4" />Loading payment status…</p>
    </section>;
  }

  if (!currentExpense) {
    return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4" aria-label="Supplier payment recovery" data-testid="supplier-invoice-expense-bridge" role="alert">
      <p className="flex items-center gap-2 text-xs font-black text-amber-950"><CircleAlert className="h-4 w-4" />Linked Expense unavailable</p>
      <p className="mt-1 break-words text-[10px] leading-4 text-amber-900">Payment cannot be changed until the invoice's linked Expense is available. No invoice payment field will be changed directly.</p>
    </section>;
  }

  if (!summary && !demoSummary) {
    return <section className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4" aria-label="Supplier payment" data-testid="supplier-invoice-expense-bridge">
      {summaryError ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="flex items-center gap-2 text-xs font-black text-amber-950"><CircleAlert className="h-4 w-4" />Payment status unavailable</p>
        <p className="mt-1 text-[10px] leading-4 text-amber-900">{summaryError} No payment status change is offered until the authoritative Expense settlement can be read.</p>
        <button type="button" onClick={() => void refreshSummary()} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-[10px] font-black text-amber-900"><RotateCcw className="h-3.5 w-3.5" />Retry</button>
      </div> : <p className="flex items-center gap-2 text-xs font-black text-indigo-950"><LockKeyhole className="h-4 w-4" />Loading authoritative payment status…</p>}
      <div className="flex justify-end border-t border-indigo-100 pt-2">{secondaryExpenseLink}</div>
    </section>;
  }

  const visibleSummary = summary || demoSummary!;
  const paymentStatus = deriveSupplierInvoicePaymentState(invoice, currentExpense, visibleSummary);
  const hasOutstanding = visibleSummary.outstanding > 0.005;
  const canChangeStatus = invoice.reviewStatus === "VERIFIED" && invoice.lifecycleStatus !== "VOID" && currentExpense.status !== "VOID" && hasOutstanding;

  const handleReversed = (item: FinancialSettlementHistoryItem) => {
    if (currentExpense.id.startsWith("demo-")) {
      setSummary((current) => {
        const source = current || visibleSummary;
        const history = source.history.map((entry) => entry.id === item.id ? { ...entry, status: "REVERSED" as const } : entry);
        return deriveExpenseSettlementSummary(currentExpense, history);
      });
      return;
    }
    void refreshSummary();
  };

  return <section className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4" aria-label="Supplier payment" data-testid="supplier-invoice-expense-bridge">
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-700">Payment status</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusTone(paymentStatus)}`}>{paymentStatus.replaceAll("_", " ")}</span>
          {hasOutstanding && <span className="text-xs font-bold text-slate-700">{formatMoney(visibleSummary.outstanding, visibleSummary.currency)} remaining</span>}
        </div>
        {summaryLoading && <p className="mt-1 text-[10px] text-slate-500">Refreshing payment evidence…</p>}
        {summaryError && <p className="mt-1 text-[10px] text-amber-800">{summaryError}</p>}
      </div>
      {canChangeStatus && <button type="button" onClick={() => setPaymentOpen(true)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2" data-testid="change-supplier-payment-status">
        <WalletCards className="h-4 w-4" />Change Status
      </button>}
    </div>

    <FinancialSettlementCard
      targetType="EXPENSE"
      targetId={currentExpense.id}
      title="Payment history"
      targetLabel={`${currentExpense.category} · ${currentExpense.description}`}
      lifecycleStatus={currentExpense.status}
      fallbackSummary={visibleSummary}
      canRecordPayment={false}
      canReverse={canReversePayment}
      financialFxSnapshots={financialFxSnapshots}
      fxSourceType="SUPPLIER_INVOICE"
      fxSourceId={invoice.id}
      onReversed={handleReversed}
      onNavigatePath={onNavigatePath}
    />

    <div className="flex justify-end border-t border-indigo-100 pt-2">{secondaryExpenseLink}</div>

    <SupplierInvoicePaymentDialog
      open={paymentOpen}
      invoice={invoice}
      expense={currentExpense}
      settlement={visibleSummary}
      canRecordPayment={canRecordPayment}
      onClose={() => setPaymentOpen(false)}
      onExpenseUpdated={(updatedExpense) => setCurrentExpense(updatedExpense)}
      onRecorded={(updatedExpense, updatedSummary) => {
        setCurrentExpense(updatedExpense);
        setSummary(updatedSummary);
      }}
    />
  </section>;
};

export default SupplierInvoiceExpenseSurface;