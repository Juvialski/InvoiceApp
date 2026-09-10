import React from "react";
import { ArrowRight, CircleAlert, LockKeyhole } from "lucide-react";
import type { Expense, FinancialFxSnapshot, InvoiceData } from "../types.ts";
import { deriveExpenseSettlementSummary } from "../lib/financialSettlement.ts";
import { appPathForCashTarget, appPathForExpense, appPathForInvoice } from "../utils/appRouting.ts";
import type { AppNavigate } from "../utils/clientNavigation.ts";
import { FinancialSettlementCard } from "./FinancialSettlementCard.tsx";

export interface SupplierInvoiceExpenseSurfaceProps {
  invoice: Pick<InvoiceData, "id" | "invoiceNumber">;
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
  if (!linkedExpenseId) return null;

  const expensePath = appPathForExpense(linkedExpenseId, appPathForInvoice(invoice.id));
  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (!onNavigatePath) return;
    event.preventDefault();
    onNavigatePath(path);
  };

  if (loading) {
    return <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4" aria-label="Authoritative Expense" data-testid="supplier-invoice-expense-bridge">
      <p className="flex items-center gap-2 text-xs font-black text-indigo-950"><LockKeyhole className="h-4 w-4" />Resolving the authoritative Expense…</p>
      <p className="mt-1 text-[10px] leading-4 text-indigo-900">The invoice remains preserved source evidence while its linked payable record is loaded.</p>
    </section>;
  }

  if (!linkedExpense) {
    return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4" aria-label="Authoritative Expense recovery" data-testid="supplier-invoice-expense-bridge" role="alert">
      <p className="flex items-center gap-2 text-xs font-black text-amber-950"><CircleAlert className="h-4 w-4" />Linked Expense unavailable</p>
      <p className="mt-1 break-words text-[10px] leading-4 text-amber-900">This invoice points to Expense {linkedExpenseId}, but that Expense is not available in the current workspace. The invoice remains evidence-only; no invoice-owned payment action is offered.</p>
    </section>;
  }

  return <section className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4" aria-label="Authoritative Expense" data-testid="supplier-invoice-expense-bridge">
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-700">Authoritative Expense</p>
        <h3 className="mt-1 break-words text-sm font-black text-slate-950">{linkedExpense.category} · {linkedExpense.description}</h3>
        <p className="mt-1 break-words text-[10px] leading-4 text-indigo-950">Supplier invoice {invoice.invoiceNumber || invoice.id} remains preserved evidence. This Expense owns the payable, cost, and settlement target.</p>
      </div>
      <a
        href={demoHref(expensePath, linkedExpense.id)}
        onClick={(event) => navigate(event, expensePath)}
        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[10px] font-black text-indigo-800 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
      >
        Open Expense <ArrowRight className="h-3.5 w-3.5" />
      </a>
    </div>
    <FinancialSettlementCard
      targetType="EXPENSE"
      targetId={linkedExpense.id}
      title="Supplier payment"
      targetLabel={`${linkedExpense.category} · ${linkedExpense.description}`}
      lifecycleStatus={linkedExpense.status}
      fallbackSummary={deriveExpenseSettlementSummary(linkedExpense, [])}
      recordPaymentPath={appPathForCashTarget("EXPENSE", linkedExpense.id, appPathForExpense(linkedExpense.id, appPathForInvoice(invoice.id)))}
      canRecordPayment={canRecordPayment}
      canReverse={canReversePayment}
      financialFxSnapshots={financialFxSnapshots}
      fxSourceType="SUPPLIER_INVOICE"
      fxSourceId={invoice.id}
      onNavigatePath={onNavigatePath}
    />
  </section>;
};

export default SupplierInvoiceExpenseSurface;
