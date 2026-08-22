import React, { useMemo } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Mail, Tag } from "lucide-react";
import { InvoiceData } from "../types";
import { formatMoney } from "../utils/invoiceLogic";

interface ReportsProps { invoices: InvoiceData[]; }

export const Reports: React.FC<ReportsProps> = ({ invoices }) => {
  const categories = useMemo(() => {
    const map: Record<string, number> = {};
    invoices.forEach((i) => { const c = i.category || "Uncategorized"; map[c] = (map[c] || 0) + 1; });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  }, [invoices]);
  const currencyTotals = useMemo(() => {
    const map: Record<string, number> = {};
    invoices.forEach((i) => { map[i.currency || "UNK"] = (map[i.currency || "UNK"] || 0) + (Number(i.grandTotal) || 0); });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  }, [invoices]);
  const emailCount = invoices.filter(i=>i.sourceType === "EMAIL").length;
  const reviewed = invoices.filter(i=>i.reviewStatus === "VERIFIED").length;
  const review = invoices.filter(i=>i.reviewStatus === "NEEDS_REVIEW").length;
  const validationIssues = invoices.reduce((n,i)=>n+(i.validation?.issues?.length || 0),0);

  return <div className="space-y-5"><div><h2 className="text-xl font-black">Reports & data quality</h2><p className="text-xs text-slate-500 mt-1">Operational summaries without mixing different currencies into one fake total.</p></div><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[
    ["Verified", reviewed, CheckCircle2, "text-emerald-700 bg-emerald-50"],
    ["Needs review", review, AlertTriangle, "text-amber-700 bg-amber-50"],
    ["Email sourced", emailCount, Mail, "text-indigo-700 bg-indigo-50"],
    ["Validation flags", validationIssues, BarChart3, "text-rose-700 bg-rose-50"],
  ].map(([label,value,Icon,tone]: any)=><div key={label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"><div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tone}`}><Icon className="w-4 h-4" /></div><p className="text-2xl font-black mt-3">{value}</p><p className="text-xs text-slate-500 font-semibold">{label}</p></div>)}</div><div className="grid lg:grid-cols-2 gap-4"><div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><h3 className="text-sm font-bold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-indigo-600" />Totals by currency</h3><div className="mt-4 space-y-3">{currencyTotals.length ? currencyTotals.map(([currency,total])=><div key={currency} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0"><span className="text-xs font-bold">{currency}</span><span className="font-mono font-black text-sm">{formatMoney(total,currency)}</span></div>) : <p className="text-xs text-slate-500">No data yet.</p>}</div></div><div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><h3 className="text-sm font-bold flex items-center gap-2"><Tag className="w-4 h-4 text-indigo-600" />AI-suggested categories</h3><div className="mt-4 space-y-3">{categories.length ? categories.map(([category,count])=><div key={category} className="flex items-center gap-3"><div className="flex-1"><div className="flex justify-between text-xs"><span className="font-semibold">{category}</span><span className="font-bold">{count}</span></div><div className="h-1.5 rounded-full bg-slate-100 mt-1.5 overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{width:`${Math.max(8,(count/invoices.length)*100)}%`}} /></div></div></div>) : <p className="text-xs text-slate-500">No category data yet.</p>}</div></div></div></div>;
};
