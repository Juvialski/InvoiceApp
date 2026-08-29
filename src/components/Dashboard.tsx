import React from "react";
import { AlertTriangle, CheckCircle2, Clock3, Mail, Receipt, WalletCards } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { InvoiceData } from "../types";
import { getInvoiceDisplay } from "../utils/invoiceDisplay";
import { formatMoney, totalVatByCurrency, totalsByCurrency } from "../utils/invoiceLogic";
import { isVoidedInvoice } from "../utils/projectCosting.ts";

interface DashboardProps {
  invoices: InvoiceData[];
  onOpenInvoice: (invoice: InvoiceData) => void;
  onNavigate: (tab: "extractor" | "inbox" | "invoices" | "review" | "projects" | "payroll" | "expenses" | "reports") => void;
}

const isPhilippine = (invoice: InvoiceData) => invoice.currency?.toUpperCase() === "PHP" || invoice.vendor?.country?.toLowerCase().includes("philippines") || Boolean(invoice.philippineTaxDetails);

export const Dashboard: React.FC<DashboardProps> = ({ invoices, onOpenInvoice, onNavigate }) => {
  const activeInvoices = invoices.filter((invoice) => !isVoidedInvoice(invoice));
  const needsReview = activeInvoices.filter((i) => i.reviewStatus === "NEEDS_REVIEW" && !i.archivedAt);
  const verified = activeInvoices.filter((i) => i.reviewStatus === "VERIFIED");
  const overdue = activeInvoices.filter((i) => i.status === "OVERDUE");
  const totals = totalsByCurrency(activeInvoices);
  const balances = totalsByCurrency(activeInvoices, "balanceDue");
  const vatTotals = totalVatByCurrency(activeInvoices);
  const phpTotal = totals.PHP || 0;
  const phpOutstanding = balances.PHP || 0;
  const phpVat = vatTotals.PHP || 0;
  const phInvoices = activeInvoices.filter(isPhilippine);
  const phVatInvoices = phInvoices.filter((invoice) => invoice.invoiceSubtype === "VAT_INVOICE" || invoice.philippineTaxDetails?.sellerRegistration === "VAT");
  const missingVatDetails = phVatInvoices.filter((invoice) => invoice.philippineInvoiceCompleteness?.status === "MISSING_INFORMATION" || !invoice.philippineTaxDetails?.vatAmount);
  const phVatable = phVatInvoices.reduce((sum, invoice) => sum + (Number(invoice.philippineTaxDetails?.vatableSales) || 0), 0);
  const phZeroRated = phInvoices.reduce((sum, invoice) => sum + (Number(invoice.philippineTaxDetails?.zeroRatedSales) || 0), 0);
  const phExempt = phInvoices.reduce((sum, invoice) => sum + (Number(invoice.philippineTaxDetails?.vatExemptSales) || 0), 0);
  const latest = [...activeInvoices].sort((a, b) => +new Date(b.extractedAt) - +new Date(a.extractedAt)).slice(0, 6);
  const foreignEntries = Object.entries(totals).filter(([currency]) => currency !== "PHP" && currency !== "UNK");

  return (
    <div className="space-y-6">
      <section className="bg-gradient-to-r from-slate-950 to-indigo-950 text-white rounded-2xl px-4 py-4 sm:px-5 shadow-lg overflow-hidden relative">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-indigo-200">Invoice Overview</p>
            <p className="text-xs text-slate-300 mt-1">Keep intake moving and resolve the next review item.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0 items-center">
            <button
              type="button"
              onClick={() => onNavigate("extractor")}
              className="px-3.5 py-2 rounded-xl bg-white text-slate-950 text-xs font-bold shadow-sm hover:bg-slate-100 transition"
            >
              Upload invoice
            </button>
            <button
              type="button"
              onClick={() => onNavigate("review")}
              className="px-3.5 py-2 rounded-xl bg-amber-400 text-amber-950 text-xs font-black shadow-sm hover:bg-amber-300 transition"
            >
              Review {needsReview.length}
            </button>
            <button
              type="button"
              onClick={() => onNavigate("inbox")}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-bold flex items-center gap-2 transition"
            >
              <Mail className="w-3.5 h-3.5" /> Process email
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: "Total Invoice Value", value: formatMoney(phpTotal, "PHP"), icon: WalletCards, tone: "text-indigo-600 bg-indigo-50" },
          { label: "Outstanding", value: phpOutstanding ? formatMoney(phpOutstanding, "PHP") : "₱0.00", icon: Receipt, tone: "text-amber-700 bg-amber-50" },
          { label: "Overdue", value: overdue.length, icon: Clock3, tone: "text-rose-700 bg-rose-50" },
          { label: "VAT Amount", value: phpVat ? formatMoney(phpVat, "PHP") : "₱0.00", icon: Receipt, tone: "text-violet-700 bg-violet-50" },
          { label: "Needs Review", value: needsReview.length, icon: AlertTriangle, tone: "text-orange-700 bg-orange-50" },
          { label: "Verified", value: verified.length, icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="p-4 shadow-sm min-w-0" elevation="low">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tone}`}><Icon className="w-4 h-4" /></div>
            <p className="text-lg sm:text-xl font-black font-sans tabular-nums text-slate-900 mt-4 break-words">{value}</p>
            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">{label}</p>
          </Card>
        ))}
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5 shadow-sm" elevation="low">
          <div className="flex items-center gap-2 mb-4"><WalletCards className="w-4 h-4 text-indigo-600" /><h3 className="font-bold text-sm">Currency breakdown</h3></div>
          {Object.keys(totals).length ? <div className="space-y-3">
            {Object.entries(totals).map(([currency, value]) => (
              <div key={currency} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <div><p className="text-xs font-bold text-slate-800">{currency === "UNK" ? "Currency unclear" : currency}</p><p className="text-[11px] text-slate-500 font-sans tabular-nums">Outstanding {currency === "UNK" ? "—" : formatMoney(balances[currency] || 0, currency)}</p></div>
                <p className="text-sm font-black font-sans tabular-nums text-right break-words">{currency === "UNK" ? "Needs review" : formatMoney(value, currency)}</p>
              </div>
            ))}
          </div> : <p className="text-xs text-slate-500">Extract an invoice to populate totals.</p>}
          {foreignEntries.length > 0 && <p className="text-[10px] text-slate-400 mt-4">Foreign currencies are shown separately and are not converted or summed into PHP.</p>}
        </Card>

        <Card className="p-5 shadow-sm" elevation="low">
          <div className="flex items-center gap-2 mb-4"><Receipt className="w-4 h-4 text-violet-600" /><h3 className="font-bold text-sm">Philippine VAT Summary</h3></div>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["VATable Purchases", formatMoney(phVatable, "PHP")],
              ["VAT Amount", formatMoney(phpVat, "PHP")],
              ["Zero-Rated", formatMoney(phZeroRated, "PHP")],
              ["VAT-Exempt", formatMoney(phExempt, "PHP")],
              ["Missing VAT Details", missingVatDetails.length],
              ["Invoices Needing Review", needsReview.filter(isPhilippine).length],
            ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] uppercase font-bold text-slate-500">{label}</p><p className="text-sm font-black font-sans tabular-nums mt-1 break-words">{value}</p></div>)}
          </div>
          <p className="text-[10px] text-slate-400 mt-4">Review summary only — this does not produce an official BIR tax return.</p>
        </Card>
      </section>

      <Card className="p-5 shadow-sm" elevation="low">
        <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-sm">Recent activity</h3><button onClick={() => onNavigate("invoices")} className="text-xs font-bold text-indigo-600">View all</button></div>
        {latest.length ? <div className="space-y-2">{latest.map((invoice) => {
          const display = getInvoiceDisplay(invoice);
          return <button key={invoice.id} onClick={() => onOpenInvoice(invoice)} className="w-full text-left flex items-center justify-between gap-3 rounded-xl p-3 hover:bg-slate-50 border border-transparent hover:border-slate-100 transition">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-bold text-slate-900 truncate">{display.primaryLabel}</p>
                <Badge
                  variant={invoice.reviewStatus === "NEEDS_REVIEW" ? "warning" : "success"}
                  label={invoice.reviewStatus === "NEEDS_REVIEW" ? "Review" : "Verified"}
                />
              </div>
              <p className="text-[11px] text-slate-600 truncate">{display.invoiceLabel} • {display.dateLabel}</p>
              <p className="text-[10px] text-slate-400 truncate">{display.sourceLabel}{display.projectKnown ? ` • ${display.projectLabel}` : ""} • {display.sourceFileLabel}</p>
            </div>
            <div className="text-right shrink-0"><p className="text-xs font-black font-sans tabular-nums">{display.amountLabel}</p>{display.amountLabel !== display.currencyLabel && <p className="text-[9px] font-semibold text-slate-400 uppercase">{display.currencyLabel}</p>}</div>
          </button>;
        })}</div> : <p className="text-xs text-slate-500">No invoice activity yet.</p>}
      </Card>
    </div>
  );
};

