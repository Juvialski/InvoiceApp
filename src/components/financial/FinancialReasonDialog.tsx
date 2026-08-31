import React, { useRef } from "react";
import { ShieldAlert, X } from "lucide-react";
import { useDialogFocus } from "../ui/useDialogFocus.ts";

export interface FinancialReasonDialogProps {
  title: string;
  description: string;
  warning: string;
  targetLabel: string;
  confirmLabel: string;
  reason: string;
  loading: boolean;
  error?: string;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const FinancialReasonDialog: React.FC<FinancialReasonDialogProps> = ({
  title,
  description,
  warning,
  targetLabel,
  confirmLabel,
  reason,
  loading,
  error,
  onReasonChange,
  onConfirm,
  onClose,
}) => {
  const valid = reason.trim().length >= 3;
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useDialogFocus({ open: true, onClose: () => { if (!loading) onClose(); }, initialFocusRef: reasonRef });

  return (
    <div ref={dialogRef} className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="financial-reason-dialog-title" aria-busy={loading}>
      <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-600">Cash &amp; Banking · Financial correction</p>
            <h2 id="financial-reason-dialog-title" className="mt-1 text-lg font-black text-slate-950">{title}</h2>
            <p className="mt-1 text-xs text-slate-500">{description}</p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Close correction dialog">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">{error}</div>}

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Record</p>
            <p className="mt-1 break-words font-bold text-slate-900">{targetLabel}</p>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-4 text-amber-950">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p>{warning}</p>
          </div>
          <div>
            <label htmlFor="financial-reason-dialog-reason" className="block text-xs font-bold text-slate-800">Reason <span className="text-rose-600">*</span></label>
            <p className="mt-0.5 text-[10px] text-slate-500">A clear reason is required for the append-only financial audit trail.</p>
            <textarea
              ref={reasonRef}
              id="financial-reason-dialog-reason"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              maxLength={500}
              rows={3}
              autoFocus
              className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              placeholder="Describe what was wrong and why this correction is appropriate."
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-400">
              <span>{valid ? "Reason provided" : "Minimum 3 characters required"}</span>
              <span>{reason.length}/500</span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={loading} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={loading || !valid} className="min-h-10 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white shadow hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40">{loading ? "Saving correction…" : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
};

export default FinancialReasonDialog;
