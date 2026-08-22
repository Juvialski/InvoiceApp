import React, { useMemo, useState } from "react";
import { CheckCircle2, Eye, Search, Trash2, AlertTriangle, Files, Plus } from "lucide-react";
import { InvoiceData } from "../types";
import { formatMoney } from "../utils/invoiceLogic";

interface InvoiceDirectoryProps {
  invoices: InvoiceData[];
  onSelectInvoice: (invoice: InvoiceData) => void;
  onDeleteInvoice: (id: string) => void;
  onAddNew: () => void;
  onVerify: (invoice: InvoiceData) => void;
}

export const InvoiceDirectory: React.FC<InvoiceDirectoryProps> = ({ invoices, onSelectInvoice, onDeleteInvoice, onAddNew, onVerify }) => {
  const [query, setQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");

  const filtered = useMemo(() => invoices.filter((invoice) => {
    const q = query.toLowerCase();
    const haystack = [invoice.invoiceNumber, invoice.vendor?.name, invoice.customer?.name, invoice.fileName, invoice.category, invoice.currency].join(" ").toLowerCase();
    const matchesQuery = !q || haystack.includes(q);
    const matchesReview = reviewFilter === "ALL" || invoice.reviewStatus === reviewFilter;
    const matchesPayment = paymentFilter === "ALL" || invoice.status === paymentFilter;
    return matchesQuery && matchesReview && matchesPayment;
  }), [invoices, query, reviewFilter, paymentFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div><h2 className="text-xl font-black text-slate-900">Invoice directory</h2><p className="text-xs text-slate-500 mt-1">Search, review and organize extracted invoices.</p></div>
        <button onClick={onAddNew} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white"><Plus className="w-3.5 h-3.5" /> New extraction</button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex flex-col md:flex-row gap-2">
        <label className="flex items-center gap-2 flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"><Search className="w-4 h-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoice, vendor, customer, category..." className="w-full bg-transparent text-xs outline-none" /></label>
        <select value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"><option value="ALL">All review states</option><option value="NEEDS_REVIEW">Needs review</option><option value="VERIFIED">Verified</option></select>
        <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"><option value="ALL">All payment states</option><option value="UNPAID">Unpaid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="PAID">Paid</option><option value="OVERDUE">Overdue</option></select>
      </div>

      {filtered.length ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="p-3">Invoice</th><th className="p-3">Vendor / Customer</th><th className="p-3">Source</th><th className="p-3">Total</th><th className="p-3">Review</th><th className="p-3">Payment</th><th className="p-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{filtered.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50">
                  <td className="p-3"><button onClick={() => onSelectInvoice(invoice)} className="font-bold text-slate-900 hover:text-indigo-600 text-left">{invoice.invoiceNumber || "Unnumbered"}</button><p className="text-[10px] text-slate-500 mt-0.5">{invoice.invoiceDate || "No date"} • {invoice.documentType || "INVOICE"}</p>{invoice.duplicateStatus === "POSSIBLE_DUPLICATE" && <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold text-rose-700"><AlertTriangle className="w-3 h-3" /> possible duplicate</span>}</td>
                  <td className="p-3 max-w-[220px]"><p className="font-semibold truncate">{invoice.vendor?.name || "Unknown vendor"}</p><p className="text-[10px] text-slate-500 truncate">to {invoice.customer?.name || "Unknown customer"}</p></td>
                  <td className="p-3"><span className="px-2 py-1 rounded-lg bg-slate-100 text-[10px] font-bold">{invoice.sourceType || "UPLOAD"}</span>{invoice.sourceMetadata?.sender && <p className="text-[9px] text-slate-500 mt-1 max-w-[160px] truncate">{invoice.sourceMetadata.sender}</p>}</td>
                  <td className="p-3 font-mono font-black whitespace-nowrap">{formatMoney(invoice.grandTotal, invoice.currency)}</td>
                  <td className="p-3"><span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold ${invoice.reviewStatus === "NEEDS_REVIEW" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{invoice.reviewStatus === "NEEDS_REVIEW" ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}{invoice.reviewStatus === "NEEDS_REVIEW" ? "Review" : "Verified"}</span></td>
                  <td className="p-3"><span className="text-[9px] font-bold uppercase text-slate-700">{(invoice.status || "UNPAID").replaceAll("_", " ")}</span></td>
                  <td className="p-3"><div className="flex justify-end gap-1"><button onClick={() => onSelectInvoice(invoice)} className="p-2 rounded-lg bg-slate-100 hover:bg-indigo-50"><Eye className="w-3.5 h-3.5" /></button>{invoice.reviewStatus === "NEEDS_REVIEW" && <button onClick={() => onVerify(invoice)} className="p-2 rounded-lg bg-emerald-50 text-emerald-700" title="Mark verified"><CheckCircle2 className="w-3.5 h-3.5" /></button>}<button onClick={() => onDeleteInvoice(invoice.id)} className="p-2 rounded-lg bg-rose-50 text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center"><Files className="w-8 h-8 text-slate-300 mx-auto" /><p className="text-sm font-bold mt-3">No matching invoices</p><p className="text-xs text-slate-500 mt-1">Try changing the filters or extract another invoice.</p></div>
      )}
    </div>
  );
};
