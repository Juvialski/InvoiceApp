import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2, FileSearch, ShieldCheck } from "lucide-react";
import { InvoiceData } from "../types";

interface ReviewQueueProps {
  invoices: InvoiceData[];
  onOpenInvoice: (invoice: InvoiceData) => void;
  onVerify: (invoice: InvoiceData) => void;
}

export const ReviewQueue: React.FC<ReviewQueueProps> = ({ invoices, onOpenInvoice, onVerify }) => {
  const queue = useMemo(() => invoices.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW"), [invoices]);

  if (!queue.length) {
    return <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm"><CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" /><h2 className="mt-3 text-lg font-black">Review queue is clear</h2><p className="text-xs text-slate-500 mt-1">New Gmail and uploaded invoices with uncertainty or validation issues will appear here.</p></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4"><div><h2 className="text-xl font-black">Human verification queue</h2><p className="text-xs text-slate-500 mt-1">Original documents stay immutable. Review the AI extraction, correct anything needed, then verify.</p></div><span className="text-xs font-black px-3 py-1.5 rounded-full bg-amber-100 text-amber-800">{queue.length} need review</span></div>
      <div className="grid gap-3">
        {queue.map((invoice) => {
          const issues = invoice.validation?.issues || [];
          const reason = invoice.duplicateStatus === "POSSIBLE_DUPLICATE" ? "Possible duplicate" : issues[0]?.message || (invoice.confidenceScore !== undefined && invoice.confidenceScore < 90 ? `AI confidence ${Math.round(invoice.confidenceScore)}%` : "Human verification required");
          return <div key={invoice.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0"><FileSearch className="w-5 h-5" /></div>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><h3 className="text-sm font-black font-mono">{invoice.invoiceNumber || invoice.fileName || "Unnumbered invoice"}</h3><span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{invoice.sourceType || "UPLOAD"}</span></div><p className="text-xs text-slate-600 mt-1 truncate">{invoice.vendor?.name || "Unknown vendor"} • {invoice.currency} {Number(invoice.grandTotal || 0).toLocaleString()}</p><div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-700 font-semibold"><AlertTriangle className="w-3.5 h-3.5" />{reason}{issues.length > 1 ? ` • ${issues.length} validation flags` : ""}</div></div>
            <div className="flex gap-2"><button onClick={() => onOpenInvoice(invoice)} className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold hover:bg-slate-50">Open & compare</button><button onClick={() => onVerify(invoice)} className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />Verify</button></div>
          </div>;
        })}
      </div>
    </div>
  );
};
