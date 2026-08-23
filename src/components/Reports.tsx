import React, { useMemo } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, FileWarning, Mail, Receipt, Tag } from "lucide-react";
import { InvoiceData } from "../types";
import { formatMoney, totalsByCurrency } from "../utils/invoiceLogic";

interface ReportsProps { invoices: InvoiceData[]; }

const monthLabel = (date: string) => date ? new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(`${date}T12:00:00+08:00`)) : "Undated";

export const Reports: React.FC<ReportsProps> = ({ invoices }) => {
  const currencyTotals = totalsByCurrency(invoices);
  const monthly = useMemo(() => {
    const map = new Map<string, { date: string; total: number; currency: string }>();
    invoices.forEach((invoice) => {
      const currency = invoice.currency || "UNK";
      const key = `${currency}:${(invoice.invoiceDate || "undated").slice(0, 7)}`;
      const existing = map.get(key) || { date: invoice.invoiceDate || "", total: 0, currency };
      existing.total += Number(invoice.grandTotal) || 0;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [invoices]);
  const vendors = useMemo(() => {
    const map = new Map<string, { name: string; total: number; currency: string; count: number }>();
    invoices.forEach((invoice) => {
      const currency = invoice.currency || "UNK";
      const name = invoice.vendor?.registeredName || invoice.vendor?.name || "Unknown vendor";
      const key = `${name.toLowerCase()}::${invoice.vendor?.taxId || ""}`;
      const entry = map.get(key) || { name, total: 0, currency, count: 0 };
      if (entry.currency === currency) entry.total += Number(invoice.grandTotal) || 0;
      entry.count += 1;
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [invoices]);
  const phInvoices = invoices.filter((invoice) => invoice.currency === "PHP" || invoice.philippineTaxDetails || invoice.vendor?.country?.toLowerCase().includes("philippines"));
  const vatInvoices = phInvoices.filter((invoice) => invoice.invoiceSubtype === "VAT_INVOICE" || invoice.philippineTaxDetails?.sellerRegistration === "VAT");
  const vatSummary = {
    vatable: vatInvoices.reduce((sum, invoice) => sum + (Number(invoice.philippineTaxDetails?.vatableSales) || 0), 0),
    vat: vatInvoices.reduce((sum, invoice) => sum + (Number(invoice.philippineTaxDetails?.vatAmount ?? invoice.totalTax) || 0), 0),
    zero: phInvoices.reduce((sum, invoice) => sum + (Number(invoice.philippineTaxDetails?.zeroRatedSales) || 0), 0),
    exempt: phInvoices.reduce((sum, invoice) => sum + (Number(invoice.philippineTaxDetails?.vatExemptSales) || 0), 0),
  };
  const reviewQuality = {
    verified: invoices.filter((invoice) => invoice.reviewStatus === "VERIFIED").length,
    needsReview: invoices.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW").length,
    missingTin: invoices.filter((invoice) => !invoice.vendor?.taxId).length,
    mathMismatch: invoices.filter((invoice) => invoice.validation?.issues.some((issue) => issue.id.includes("mismatch"))).length,
    potentialDuplicate: invoices.filter((invoice) => invoice.duplicateStatus === "POSSIBLE_DUPLICATE").length,
  };
  const payment = ["PAID", "PARTIALLY_PAID", "UNPAID", "OVERDUE"].map((status) => [status, invoices.filter((invoice) => invoice.status === status).length] as const);

  return <div className="space-y-5">
    <div><h2 className="text-xl font-black">Reports & review quality</h2><p className="text-xs text-slate-500 mt-1">Operational summaries keep currencies separate and treat PH tax checks as reconciliation aids.</p></div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[
      ["Verified", reviewQuality.verified, CheckCircle2, "text-emerald-700 bg-emerald-50"],
      ["Needs review", reviewQuality.needsReview, AlertTriangle, "text-amber-700 bg-amber-50"],
      ["Gmail sourced", invoices.filter((i) => i.sourceType === "EMAIL").length, Mail, "text-indigo-700 bg-indigo-50"],
      ["Potential duplicates", reviewQuality.potentialDuplicate, FileWarning, "text-rose-700 bg-rose-50"],
    ].map(([label, value, Icon, tone]: any) => <div key={label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"><div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tone}`}><Icon className="w-4 h-4" /></div><p className="text-2xl font-black mt-3">{value}</p><p className="text-xs text-slate-500 font-semibold">{label}</p></div>)}</div>

    <div className="grid lg:grid-cols-2 gap-4">
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><h3 className="text-sm font-bold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-indigo-600" />Monthly invoice spend</h3><div className="mt-4 space-y-3">{monthly.length ? monthly.map((row) => <div key={`${row.currency}-${row.date}`} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0"><span className="text-xs font-semibold">{row.date ? monthLabel(row.date) : "Undated"} <small className="text-slate-400">{row.currency}</small></span><span className="font-mono font-black text-sm">{row.currency === "UNK" ? "Currency unclear" : formatMoney(row.total, row.currency)}</span></div>) : <p className="text-xs text-slate-500">No invoice data yet.</p>}</div></section>
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><h3 className="text-sm font-bold flex items-center gap-2"><Tag className="w-4 h-4 text-indigo-600" />Vendor spend</h3><div className="mt-4 space-y-3">{vendors.length ? vendors.map((vendor) => <div key={`${vendor.name}-${vendor.currency}`} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0"><span className="text-xs font-semibold min-w-0 truncate">{vendor.name} <small className="text-slate-400">({vendor.count})</small></span><span className="font-mono font-black text-sm shrink-0">{vendor.currency === "UNK" ? "—" : formatMoney(vendor.total, vendor.currency)}</span></div>) : <p className="text-xs text-slate-500">No vendor data yet.</p>}</div></section>
    </div>

    <div className="grid lg:grid-cols-2 gap-4">
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><h3 className="text-sm font-bold flex items-center gap-2"><Receipt className="w-4 h-4 text-violet-600" />Philippine VAT Summary</h3><div className="grid grid-cols-2 gap-2 mt-4">{[["VATable Sales/Purchases", vatSummary.vatable], ["VAT Amount", vatSummary.vat], ["Zero-Rated", vatSummary.zero], ["VAT-Exempt", vatSummary.exempt]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] uppercase font-bold text-slate-500">{label}</p><p className="text-sm font-black mt-1">{formatMoney(Number(value), "PHP")}</p></div>)}</div><p className="text-[10px] text-slate-400 mt-4">For reconciliation/review; not an official BIR return.</p></section>
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><h3 className="text-sm font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600" />Review quality</h3><div className="grid grid-cols-2 gap-2 mt-4">{[["Verified", reviewQuality.verified], ["Needs Review", reviewQuality.needsReview], ["Missing TIN", reviewQuality.missingTin], ["Math Mismatch", reviewQuality.mathMismatch], ["Potential Duplicate", reviewQuality.potentialDuplicate]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] uppercase font-bold text-slate-500">{label}</p><p className="text-sm font-black mt-1">{value}</p></div>)}</div></section>
    </div>

    <div className="grid lg:grid-cols-2 gap-4">
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><h3 className="text-sm font-bold flex items-center gap-2"><Clock3 className="w-4 h-4 text-indigo-600" />Payment status</h3><div className="mt-4 space-y-3">{payment.map(([status, count]) => <div key={status} className="flex items-center justify-between text-xs"><span className="font-semibold">{status.replaceAll("_", " ")}</span><span className="font-black">{count}</span></div>)}</div></section>
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><h3 className="text-sm font-bold flex items-center gap-2"><WalletIcon />Currency totals</h3><div className="mt-4 space-y-3">{Object.entries(currencyTotals).map(([currency, total]) => <div key={currency} className="flex items-center justify-between text-xs"><span className="font-semibold">{currency}</span><span className="font-mono font-black">{currency === "UNK" ? "Currency unclear" : formatMoney(total, currency)}</span></div>)}</div></section>
    </div>
  </div>;
};

function WalletIcon() {
  return <BarChart3 className="w-4 h-4 text-indigo-600" />;
}
