import React from "react";
import { AlertTriangle, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { InvoiceData } from "../types";

interface ReviewPanelProps { invoice: InvoiceData; onVerify: () => void; }

export const ReviewPanel: React.FC<ReviewPanelProps> = ({ invoice, onVerify }) => {
  const issues = invoice.validation?.issues || [];
  return <div className={`rounded-2xl border p-4 shadow-sm ${invoice.reviewStatus === "NEEDS_REVIEW" ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex gap-3"><div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${invoice.reviewStatus === "NEEDS_REVIEW" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{invoice.reviewStatus === "NEEDS_REVIEW" ? <AlertTriangle className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}</div><div><h3 className="text-sm font-bold">{invoice.reviewStatus === "NEEDS_REVIEW" ? "This invoice needs review" : "Validation checks passed"}</h3><p className="text-[10px] text-slate-600 mt-0.5">{issues.length ? `${issues.length} validation flag${issues.length === 1 ? "" : "s"} found.` : "Line totals and financial summary reconcile with the extracted data."}{invoice.confidenceScore !== undefined ? ` • AI confidence ${Math.round(invoice.confidenceScore)}%` : ""}</p>{invoice.sourceType === "EMAIL" && <p className="text-[10px] text-indigo-700 mt-1 flex items-center gap-1"><Mail className="w-3 h-3" />{invoice.sourceMetadata?.subject || "Extracted from email"}{invoice.sourceMetadata?.sender ? ` • ${invoice.sourceMetadata.sender}` : ""}</p>}</div></div>
      {invoice.reviewStatus === "NEEDS_REVIEW" && <button onClick={onVerify} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold"><CheckCircle2 className="w-3.5 h-3.5" /> Mark verified</button>}
    </div>
    {issues.length > 0 && <div className="grid md:grid-cols-2 gap-2 mt-4">{issues.slice(0,6).map((issue) => <div key={issue.id} className="bg-white/70 rounded-xl p-3 border border-amber-100"><p className="text-[10px] font-bold text-slate-800">{issue.field}</p><p className="text-[10px] text-slate-600 mt-0.5">{issue.message}</p>{issue.expected !== undefined && <p className="text-[9px] text-slate-500 mt-1 font-mono">Expected {String(issue.expected)} • extracted {String(issue.actual)}</p>}</div>)}</div>}
  </div>;
};
