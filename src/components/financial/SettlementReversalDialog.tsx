import React from "react";
import { Landmark, RotateCcw, ShieldAlert, X } from "lucide-react";
import type { FinancialSettlementHistoryItem, SettlementTargetType } from "../../lib/financialSettlement.ts";

export interface SettlementReversalTargetContext {
  targetType: SettlementTargetType;
  targetId: string;
  targetLabel?: string;
  currency: string;
  settlementBasis?: number;
  currentReconciledPaid?: number;
  currentOutstanding?: number;
}

export interface SettlementReversalDialogProps {
  item: FinancialSettlementHistoryItem;
  targetContext: SettlementReversalTargetContext;
  loading: boolean;
  error?: string;
  reason: string;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

function money(value: number | undefined, currency: string) {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: currency || "PHP",
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch {
    return `${currency || "PHP"} ${(value || 0).toFixed(2)}`;
  }
}

function dateLabel(value?: string) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export const SettlementReversalDialog: React.FC<SettlementReversalDialogProps> = ({
  item,
  targetContext,
  loading,
  error,
  reason,
  onReasonChange,
  onConfirm,
  onClose,
}) => {
  const targetLabel = targetContext.targetLabel || `${targetContext.targetType} ${targetContext.targetId}`;
  const isReasonValid = reason.trim().length >= 3;
  const currency = item.currency || targetContext.currency || "PHP";

  const targetTypeName =
    targetContext.targetType === "INVOICE"
      ? "Supplier Invoice"
      : targetContext.targetType === "PAYROLL"
        ? "Payroll Run"
        : "Expense";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settlement-reversal-title"
    >
      <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-600">
              Cash & Banking · Financial Correction
            </p>
            <h2 id="settlement-reversal-title" className="mt-1 text-lg font-black text-slate-950">
              Reverse payment settlement
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Explicitly disconnect this cash transaction from the {targetTypeName.toLowerCase()}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
            aria-label="Close reversal dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800"
          >
            {error}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {/* Target & Transaction Details Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-700">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Settlement record details
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <span className="text-[10px] text-slate-500">Target obligation:</span>
                <p className="font-bold text-slate-900 truncate">{targetLabel}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-500">Settled amount:</span>
                <p className="font-black text-rose-700 tabular-nums">
                  {money(item.amount, currency)}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-500">Account:</span>
                <p className="font-semibold text-slate-800 flex items-center gap-1">
                  <Landmark className="h-3 w-3 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {item.accountName || "Bank account"}
                    {item.maskedIdentifier ? ` (${item.maskedIdentifier})` : ""}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-500">Transaction date & ref:</span>
                <p className="font-semibold text-slate-800 truncate">
                  {dateLabel(item.transactionDate || item.confirmedAt)}
                  {item.referenceNumber ? ` · ${item.referenceNumber}` : ""}
                </p>
              </div>
            </div>
            {item.description && (
              <p className="mt-2 rounded bg-white/80 px-2 py-1 text-[11px] text-slate-600 border border-slate-100 break-words">
                {item.description}
              </p>
            )}
          </div>

          {/* Critical Cash-Evidence Warning Alert */}
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-4 text-amber-950">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="font-bold text-amber-900">
                Corrects cash & bank reconciliation evidence only
              </p>
              <p className="mt-0.5 text-[10px] text-amber-800">
                Reversing this settlement returns the matched transaction to unmatched/partial status and
                restores the {targetTypeName.toLowerCase()}'s outstanding balance. It{" "}
                <strong>does NOT erase</strong> the original confirmation from history, nor does it alter invoice
                cost, project cost, or payroll calculations.
              </p>
            </div>
          </div>

          {/* Reason Input */}
          <div>
            <label htmlFor="settlement-reversal-reason" className="block text-xs font-bold text-slate-800">
              Reversal reason <span className="text-rose-600">*</span>
            </label>
            <p className="mt-0.5 text-[10px] text-slate-500">
              A clear reason is required for auditable financial correction history.
            </p>
            <textarea
              id="settlement-reversal-reason"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="e.g., Matched to wrong supplier invoice, incorrect partial split allocation, duplicate payment entry..."
              maxLength={500}
              rows={3}
              className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-400">
              <span>{reason.trim().length < 3 ? "Minimum 3 characters required" : "Reason provided"}</span>
              <span>{reason.length}/500</span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || !isReasonValid}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white shadow hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {loading ? "Reversing settlement…" : "Confirm settlement reversal"}
          </button>
        </div>
      </section>
    </div>
  );
};

export default SettlementReversalDialog;
