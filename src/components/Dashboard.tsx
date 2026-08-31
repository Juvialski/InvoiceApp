import React from "react";
import { AlertTriangle, CheckCircle2, Clock3, Mail, Receipt, WalletCards } from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import type { InvoiceData } from "../types";
import { getInvoiceDisplay } from "../utils/invoiceDisplay";
import { formatMoney, totalVatByCurrency, totalsByCurrency } from "../utils/invoiceLogic";
import { isVoidedInvoice } from "../utils/projectCosting.ts";
import { EmptyState, MetricCard, PageHeader, SectionHeader, StatusBadge } from "./ui/OperationsUI";

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
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations overview"
        title="Invoice operations"
        description="Keep intake moving, resolve review work, and monitor invoice totals without combining source currencies."
        actions={(
          <>
            <button type="button" onClick={() => onNavigate("extractor")} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
              Upload invoice
            </button>
            <button type="button" onClick={() => onNavigate("review")} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-black text-amber-900 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2" aria-label={needsReview.length ? `Open review queue with ${needsReview.length} invoices awaiting action` : "Open the empty review queue"}>
              <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
              {needsReview.length ? `Review ${needsReview.length}` : "Review queue"}
            </button>
            <button type="button" onClick={() => onNavigate("inbox")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
              <Mail aria-hidden="true" className="h-3.5 w-3.5" /> Process email
            </button>
          </>
        )}
      />

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-white shadow-sm sm:p-5" aria-label="Invoice intake focus">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300">Next best action</p>
            <h2 className="mt-1 text-base font-black sm:text-lg">{needsReview.length ? `${needsReview.length} invoice${needsReview.length === 1 ? "" : "s"} need human review` : "Review queue is clear"}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">{needsReview.length ? "Open the queue to compare source documents, resolve extraction flags, and verify the next record." : "New uncertain or incomplete extractions will appear here when they need an explicit human decision."}</p>
          </div>
          <button type="button" onClick={() => onNavigate(needsReview.length ? "review" : "invoices")} className="inline-flex shrink-0 items-center justify-center rounded-lg bg-white px-3.5 py-2.5 text-xs font-black text-slate-950 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">
            {needsReview.length ? "Open review queue" : "View invoice register"}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Invoice summary">
        <MetricCard label="Total invoice value" value={formatMoney(phpTotal, "PHP")} icon={WalletCards} tone="info" emphasis />
        <MetricCard label="Outstanding" value={formatMoney(phpOutstanding, "PHP")} detail="PHP only" icon={Receipt} tone="warning" />
        <MetricCard label="Overdue" value={overdue.length} detail="Active invoices" icon={Clock3} tone="danger" />
        <MetricCard label="VAT amount" value={formatMoney(phpVat, "PHP")} detail="PHP only" icon={Receipt} tone="info" />
        <MetricCard label="Needs review" value={needsReview.length} detail="Human action" icon={AlertTriangle} tone="warning" />
        <MetricCard label="Verified" value={verified.length} detail="Active invoices" icon={CheckCircle2} tone="success" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 shadow-sm sm:p-5" elevation="low">
          <SectionHeader title="Currency breakdown" description="Invoice value and outstanding balance stay separated by source currency." icon={WalletCards} />
          {Object.keys(totals).length ? <div className="mt-4 space-y-3" role="list" aria-label="Invoice totals by currency">
            {Object.entries(totals).map(([currency, value]) => (
              <div key={currency} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0" role="listitem">
                <div className="min-w-0"><p className="text-xs font-bold text-slate-800">{currency === "UNK" ? "Currency unclear" : currency}</p><p className="mt-0.5 text-[11px] text-slate-500">Outstanding {currency === "UNK" ? "—" : formatMoney(balances[currency] || 0, currency)}</p></div>
                <p className="shrink-0 text-right font-sans text-sm font-black tabular-nums break-words">{currency === "UNK" ? "Needs review" : formatMoney(value, currency)}</p>
              </div>
            ))}
          </div> : <EmptyState className="mt-4" icon={WalletCards} title="No invoice totals yet" description="Extracted invoice records will appear here by source currency." />}
          {foreignEntries.length > 0 && <p className="mt-4 border-t border-slate-100 pt-3 text-[10px] leading-4 text-slate-500">Foreign currencies are shown separately and are not converted or summed into PHP.</p>}
        </Card>

        <Card className="p-4 shadow-sm sm:p-5" elevation="low">
          <SectionHeader title="Philippine VAT summary" description="Review aid only; this does not produce an official BIR tax return." icon={Receipt} />
          <div className="mt-4 grid grid-cols-2 gap-2" aria-label="Philippine VAT summary values">
            {[
              ["VATable purchases", formatMoney(phVatable, "PHP")],
              ["VAT amount", formatMoney(phpVat, "PHP")],
              ["Zero-rated", formatMoney(phZeroRated, "PHP")],
              ["VAT-exempt", formatMoney(phExempt, "PHP")],
              ["Missing VAT details", missingVatDetails.length],
              ["Invoices needing review", needsReview.filter(isPhilippine).length],
            ].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-slate-50 p-3"><p className="text-[9px] font-bold uppercase text-slate-500">{label}</p><p className="mt-1 break-words font-sans text-sm font-black tabular-nums">{value}</p></div>)}
          </div>
          <p className="mt-4 text-[10px] leading-4 text-slate-500">Tax signals remain separate from project cost and should be reviewed with the source invoice.</p>
        </Card>
      </section>

      <Card className="p-4 shadow-sm sm:p-5" elevation="low">
        <SectionHeader
          title="Recent activity"
          description="Latest active invoice records by extraction time."
          action={<button type="button" onClick={() => onNavigate("invoices")} className="rounded-lg px-2 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">View register</button>}
        />
        {latest.length ? <div className="mt-4 space-y-2" role="list" aria-label="Recent invoice activity">
          {latest.map((invoice) => {
            const display = getInvoiceDisplay(invoice);
            const needsInvoiceReview = invoice.reviewStatus === "NEEDS_REVIEW";
            return <div key={invoice.id} role="listitem"><button type="button" onClick={() => onOpenInvoice(invoice)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent p-3 text-left transition hover:border-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2" aria-label={`${needsInvoiceReview ? "Review" : "Open"} ${display.primaryLabel}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="truncate text-xs font-bold text-slate-900">{display.primaryLabel}</p><StatusBadge tone={needsInvoiceReview ? "warning" : "success"}>{needsInvoiceReview ? "Review" : "Verified"}</StatusBadge></div>
                <p className="mt-1 truncate text-[11px] text-slate-600">{display.invoiceLabel} · {display.dateLabel}</p>
                <p className="mt-0.5 truncate text-[10px] text-slate-400">{display.sourceLabel}{display.projectKnown ? ` · ${display.projectLabel}` : ""} · {display.sourceFileLabel}</p>
              </div>
              <div className="shrink-0 text-right"><p className="font-sans text-xs font-black tabular-nums">{display.amountLabel}</p>{display.amountLabel !== display.currencyLabel && <p className="text-[9px] font-semibold uppercase text-slate-400">{display.currencyLabel}</p>}</div>
            </button></div>;
          })}
        </div> : <EmptyState className="mt-4" icon={Receipt} title="No recent invoice activity" description="Upload or import an invoice to start the operational register." />}
      </Card>
    </div>
  );
};
