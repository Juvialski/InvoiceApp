import React from "react";
import { CheckCircle2, X } from "lucide-react";

export interface ProcurementDraftPOContinuationProps {
  poNumber: string;
  quotationNumber: string;
  onDismiss: () => void;
}

export function ProcurementDraftPOContinuation({ poNumber, quotationNumber, onDismiss }: ProcurementDraftPOContinuationProps) {
  return (
    <section role="status" data-testid="procurement-draft-po-continuation" className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <div>
          <p className="font-black">Draft Purchase Order {poNumber} created from {quotationNumber}.</p>
          <p className="mt-1 leading-5">The draft remains uncommitted. Review the draft in Purchase Orders, save any edits, then approve the persisted draft when authorized.</p>
        </div>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss draft purchase order continuation" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100">
        <X className="h-3.5 w-3.5" />
        Dismiss
      </button>
    </section>
  );
}
