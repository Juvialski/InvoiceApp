import React, { useId, useState } from "react";
import { AlertTriangle, Ban, X } from "lucide-react";
import type { Subcontract } from "../../types.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";

export interface SubcontractCancellationModalProps {
  isOpen: boolean;
  onClose: () => void;
  subcontract: Subcontract | null;
  onConfirm: (subcontractId: string, reason: string) => Promise<void>;
}

export const SubcontractCancellationModal: React.FC<SubcontractCancellationModalProps> = ({
  isOpen,
  onClose,
  subcontract,
  onConfirm,
}) => {
  const titleId = useId();
  const dialogRef = useDialogFocus({ open: isOpen, onClose });
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !subcontract) return null;

  const handleConfirm = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Please provide a cancellation reason before proceeding.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm(subcontract.id, trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel subcontract");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        ref={dialogRef as unknown as React.RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-rose-100 overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 shadow-sm">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 id={titleId} className="text-base font-bold text-slate-900">
                Cancel Subcontract
              </h3>
              <p className="text-xs text-rose-600 font-medium">
                {subcontract.subcontractNumber} — {subcontract.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600 transition disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl border border-rose-200/80 bg-rose-50/50 p-4 text-xs text-rose-800 leading-relaxed">
            <p className="font-semibold text-rose-900 mb-1">Warning: Consequential Action</p>
            Cancelling this subcontract will immediately terminate its operational commitment.
            Cancelled subcontracts cannot be re-activated or transitioned again. All related committed costs will be voided in project costing.
          </div>

          {error && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-medium text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="cancellation-reason" className="block text-xs font-bold text-slate-700 mb-1.5">
              Cancellation Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="cancellation-reason"
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="State the commercial or operational reason for cancelling this subcontract (required)..."
              disabled={isSubmitting}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 disabled:bg-slate-50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200/80 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || !reason.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Ban className="h-4 w-4" />
            {isSubmitting ? "Cancelling..." : "Confirm Cancellation"}
          </button>
        </div>
      </div>
    </div>
  );
};
