import React, { useId, useState } from "react";
import { AlertCircle, FileText, Send, X } from "lucide-react";
import type { RFQ } from "../../types.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";

export interface RFQIssueConfirmationModalProps {
  isOpen: boolean;
  rfq: RFQ | null;
  onConfirm: (rfqId: string) => Promise<void> | void;
  onClose: () => void;
}

export function RFQIssueConfirmationModal({ isOpen, rfq, onConfirm, onClose }: RFQIssueConfirmationModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const dialogRef = useDialogFocus({
    open: isOpen && Boolean(rfq),
    onClose: () => {
      if (!isSubmitting) onClose();
    },
  });

  if (!isOpen || !rfq) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onConfirm(rfq.id);
      onClose();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Could not issue the RFQ. Review the request and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-sm font-bold text-slate-900">Issue Request for Quotation?</h2>
              <p className="mt-1 text-xs font-semibold text-slate-700">{rfq.rfqNumber} · {rfq.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close RFQ issue confirmation"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div id={descriptionId} className="mt-5 space-y-3 text-xs leading-5 text-slate-700">
          <p>Issue this RFQ after reviewing its lines, invited suppliers, and dates. The request will become available for supplier quotations.</p>
          <p className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 font-semibold text-indigo-950">Issuing does not select a supplier or create a Purchase Order. Supplier selection and draft PO creation remain separate review steps.</p>
        </div>

        {errorMessage && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <FileText className="h-3.5 w-3.5" />
            Back
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {isSubmitting ? "Issuing..." : "Confirm Issue"}
          </button>
        </div>
      </div>
    </div>
  );
}
