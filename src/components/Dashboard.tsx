import React from "react";
import { AlertTriangle, CheckCircle2, Clock3, Files, Mail, WalletCards } from "lucide-react";
import { InvoiceData } from "../types";
import { formatMoney, totalsByCurrency } from "../utils/invoiceLogic";

interface DashboardProps {
  invoices: InvoiceData[];
  onOpenInvoice: (invoice: InvoiceData) => void;
  onNavigate: (tab: "extractor" | "inbox" | "invoices") => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ invoices, onOpenInvoice, onNavigate }) => {
  const needsReview = invoices.filter((i) => i.reviewStatus === "NEEDS_REVIEW");
  const verified = invoices.filter((i) => i.reviewStatus === "VERIFIED");
  const overdue = invoices.filter((i) => i.status === "OVERDUE");
  const totals = totalsByCurrency(invoices);
  const balances = totalsByCurrency(invoices, "balanceDue");
  const latest = [...invoices].sort((a, b) => +new Date(b.extractedAt) - +new Date(a.extractedAt)).slice(0, 6);

  return (
    <div className="space-y-6">
      <section className="bg-gradient-to-br from-slate-950 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl overflow-hidden relative">
        <div className="relative z-10 max-w-2xl">
          <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-indigo-200">Invoice operations workspace</span>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight mt-2">From documents and emails to review-ready invoice data.</h2>
          <p className="text-sm text-slate-300 mt-2 max-w-xl">Gemini 3.5 Flash-Lite extracts the document. Deterministic checks reconcile the numbers before you export them.</p>
          <div className="flex flex-wrap gap-2 mt-5">
            <button onClick={() => onNavigate("extractor")} className="px-4 py-2 rounded-xl bg-white text-slate-950 text-xs font-bold">Extract documents</button>
            <button onClick={() => onNavigate("inbox")} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-bold flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> Process an email</button>
          </div>
        </div>
        <div className="absolute -right-12 -bottom-20 w-64 h-64 rounded-full bg-indigo-500/20 blur-2xl" />
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total invoices", value: invoices.length, icon: Files, tone: "text-indigo-600 bg-indigo-50" },
          { label: "Needs review", value: needsReview.length, icon: AlertTriangle, tone: "text-amber-700 bg-amber-50" },
          { label: "Verified", value: verified.length, icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50" },
          { label: "Overdue", value: overdue.length, icon: Clock3, tone: "text-rose-700 bg-rose-50" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tone}`}><Icon className="w-4 h-4" /></div>
            <p className="text-2xl font-black text-slate-900 mt-4">{value}</p>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">{label}</p>
          </div>
        ))}
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4"><WalletCards className="w-4 h-4 text-indigo-600" /><h3 className="font-bold text-sm">Invoice totals by currency</h3></div>
          {Object.keys(totals).length ? (
            <div className="space-y-3">
              {Object.entries(totals).map(([currency, value]) => (
                <div key={currency} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div><p className="text-xs font-bold text-slate-800">{currency}</p><p className="text-[11px] text-slate-500">Outstanding {formatMoney(balances[currency] || 0, currency)}</p></div>
                  <p className="text-sm font-black font-mono">{formatMoney(value, currency)}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-slate-500">Extract an invoice to populate totals.</p>}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-sm">Recent activity</h3><button onClick={() => onNavigate("invoices")} className="text-xs font-bold text-indigo-600">View all</button></div>
          {latest.length ? <div className="space-y-2">{latest.map((invoice) => (
            <button key={invoice.id} onClick={() => onOpenInvoice(invoice)} className="w-full text-left flex items-center justify-between gap-3 rounded-xl p-3 hover:bg-slate-50 border border-transparent hover:border-slate-100 transition">
              <div className="min-w-0"><p className="text-xs font-bold text-slate-900 truncate">{invoice.invoiceNumber || invoice.fileName || "Unnumbered invoice"}</p><p className="text-[11px] text-slate-500 truncate">{invoice.vendor?.name || "Unknown vendor"} • {invoice.sourceType || "UPLOAD"}</p></div>
              <div className="text-right shrink-0"><p className="text-xs font-black font-mono">{formatMoney(invoice.grandTotal, invoice.currency)}</p><span className={`text-[9px] font-bold uppercase ${invoice.reviewStatus === "NEEDS_REVIEW" ? "text-amber-700" : "text-emerald-700"}`}>{invoice.reviewStatus === "NEEDS_REVIEW" ? "Review" : "Verified"}</span></div>
            </button>
          ))}</div> : <p className="text-xs text-slate-500">No invoice activity yet.</p>}
        </div>
      </section>
    </div>
  );
};
