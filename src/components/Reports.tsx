import React, { useMemo } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, FileWarning, Mail, Receipt, Tag, WalletCards } from "lucide-react";
import type { FinancialFxSnapshot, InvoiceData } from "../types";
import { formatMoney, totalsByCurrency } from "../utils/invoiceLogic";
import { convertFinancialAmount, normalizeFinancialCurrency } from "../utils/financialCurrency.ts";
import { isVoidedInvoice } from "../utils/projectCosting.ts";
import { EmptyState, MetricCard, Notice, PageHeader, SectionHeader, StatusBadge, type StatusTone } from "./ui/OperationsUI";

interface ReportsProps {
  invoices: InvoiceData[];
  fxSnapshots?: readonly FinancialFxSnapshot[];
  baseCurrency?: string;
}

const monthLabel = (date: string) => date ? new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(`${date}T12:00:00+08:00`)) : "Undated";
function paymentTone(status: string): StatusTone { return status === "PAID" ? "success" : status === "OVERDUE" ? "danger" : status === "PARTIALLY_PAID" ? "info" : "neutral"; }

export const Reports: React.FC<ReportsProps> = ({ invoices, fxSnapshots = [], baseCurrency = "PHP" }) => {
  const reportingCurrency = normalizeFinancialCurrency(baseCurrency);
  const activeInvoices = useMemo(() => invoices.filter((invoice) => !isVoidedInvoice(invoice)), [invoices]);
  const currencyTotals = totalsByCurrency(activeInvoices);
  const monthly = useMemo(() => { const map = new Map<string, { date: string; total: number; currency: string }>(); activeInvoices.forEach((invoice) => { const currency = invoice.currency || "UNK"; const key = `${currency}:${(invoice.invoiceDate || "undated").slice(0, 7)}`; const existing = map.get(key) || { date: invoice.invoiceDate || "", total: 0, currency }; existing.total += Number(invoice.grandTotal) || 0; map.set(key, existing); }); return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date)); }, [activeInvoices]);
  const vendors = useMemo(() => { const map = new Map<string, { name: string; total: number; currency: string; count: number }>(); activeInvoices.forEach((invoice) => { const currency = invoice.currency || "UNK"; const name = invoice.vendor?.registeredName || invoice.vendor?.name || "Unknown vendor"; const key = `${name.toLowerCase()}::${invoice.vendor?.taxId || ""}`; const entry = map.get(key) || { name, total: 0, currency, count: 0 }; if (entry.currency === currency) entry.total += Number(invoice.grandTotal) || 0; entry.count += 1; map.set(key, entry); }); return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 8); }, [activeInvoices]);
  const phInvoices = activeInvoices.filter((invoice) => invoice.currency === reportingCurrency || invoice.philippineTaxDetails || invoice.vendor?.country?.toLowerCase().includes("philippines"));
  const vatInvoices = phInvoices.filter((invoice) => invoice.invoiceSubtype === "VAT_INVOICE" || invoice.philippineTaxDetails?.sellerRegistration === "VAT");
  const toReporting = (invoice: InvoiceData, amount: unknown) => convertFinancialAmount(amount, invoice.currency, reportingCurrency, "SUPPLIER_INVOICE", invoice.id, fxSnapshots);
  const phpReport = useMemo(() => {
    const confirmed = activeInvoices.filter((invoice) => invoice.reviewStatus === "VERIFIED");
    let confirmedTotal = 0;
    let unresolved = 0;
    for (const invoice of confirmed) {
      const converted = toReporting(invoice, invoice.grandTotal);
      if (converted === undefined) unresolved += 1;
      else confirmedTotal += converted;
    }
    return { confirmedTotal, unresolved };
  }, [activeInvoices, fxSnapshots, reportingCurrency]);
  const vatSummary = useMemo(() => {
    const sum = (selector: (invoice: InvoiceData) => unknown) => vatInvoices.reduce((total, invoice) => total + (toReporting(invoice, selector(invoice)) || 0), 0);
    const unresolved = vatInvoices.filter((invoice) => {
      const amount = selectorTaxAmount(invoice);
      return normalizeFinancialCurrency(invoice.currency) !== reportingCurrency && toReporting(invoice, amount) === undefined;
    }).length;
    return { vatable: sum((invoice) => invoice.philippineTaxDetails?.vatableSales), vat: sum((invoice) => invoice.philippineTaxDetails?.vatAmount ?? invoice.totalTax), zero: sum((invoice) => invoice.philippineTaxDetails?.zeroRatedSales), exempt: sum((invoice) => invoice.philippineTaxDetails?.vatExemptSales), unresolved };
  }, [fxSnapshots, phInvoices, reportingCurrency, vatInvoices]);
  const reviewQuality = { verified: activeInvoices.filter((invoice) => invoice.reviewStatus === "VERIFIED").length, needsReview: activeInvoices.filter((invoice) => !invoice.archivedAt && invoice.reviewStatus === "NEEDS_REVIEW").length, missingTin: activeInvoices.filter((invoice) => !invoice.vendor?.taxId).length, mathMismatch: activeInvoices.filter((invoice) => invoice.validation?.issues.some((issue) => issue.id.includes("mismatch"))).length, potentialDuplicate: activeInvoices.filter((invoice) => invoice.duplicateStatus === "POSSIBLE_DUPLICATE").length };
  const payment = ["PAID", "PARTIALLY_PAID", "UNPAID", "OVERDUE"].map((status) => [status, activeInvoices.filter((invoice) => invoice.status === status).length] as const);

  return <div className="space-y-5">
    <PageHeader eyebrow="Operational reporting" title="Reports" description="Review supplier source activity, PHP reporting readiness, payment status, and Philippine tax signals. Voided invoices are excluded from active totals; currencies remain separate; original currencies remain visible." />
    <Notice tone="info"><strong>Derived view.</strong> These summaries reflect records available to your workspace. PHP totals include only authoritative records with a matching immutable FX snapshot; this screen does not replace an official tax return.</Notice>

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Report summary">
      <MetricCard label="Verified" value={reviewQuality.verified} detail="Active supplier documents" icon={CheckCircle2} tone="success" />
      <MetricCard label="Needs review" value={reviewQuality.needsReview} detail="Human action" icon={AlertTriangle} tone="warning" />
      <MetricCard label="Gmail sourced" value={invoices.filter((invoice) => invoice.sourceType === "EMAIL").length} detail="All retained records" icon={Mail} tone="info" />
      <MetricCard label="Potential duplicates" value={reviewQuality.potentialDuplicate} detail="Review signal" icon={FileWarning} tone="danger" />
    </section>

    {(activeInvoices.length > 0 || phpReport.unresolved > 0) && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="PHP reporting basis"><div className="flex flex-wrap items-start justify-between gap-3"><SectionHeader title={`${reportingCurrency} reporting basis`} description="Confirmed supplier-document amounts use the original amount plus an explicit conversion snapshot." icon={WalletCards} /><StatusBadge tone={phpReport.unresolved ? "warning" : "success"}>{phpReport.unresolved ? `${phpReport.unresolved} FX required` : "Complete"}</StatusBadge></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-emerald-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-emerald-800">Confirmed {reportingCurrency}</p><p className="mt-1 font-sans text-lg font-black tabular-nums text-emerald-950">{formatMoney(phpReport.confirmedTotal, reportingCurrency)}</p></div><div className={`rounded-lg p-3 ${phpReport.unresolved ? "bg-amber-50" : "bg-slate-50"}`}><p className="text-[10px] font-black uppercase tracking-wide text-slate-600">Excluded from {reportingCurrency}</p><p className="mt-1 text-lg font-black tabular-nums text-slate-900">{phpReport.unresolved}</p><p className="mt-1 text-[10px] leading-4 text-slate-600">Foreign verified records without an authoritative FX snapshot.</p></div></div></section>}

    <section className="grid gap-4 xl:grid-cols-2" aria-label="Invoice activity reports">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Monthly invoice spend"><SectionHeader title="Monthly supplier-document activity" description="Grouped by original source currency and invoice month; no mixed-currency total is shown." icon={BarChart3} />{monthly.length ? <div className="mt-4 space-y-1" role="list" aria-label="Monthly invoice spend rows">{monthly.map((row) => <div key={`${row.currency}-${row.date}`} className="flex items-center justify-between gap-3 rounded-lg border-b border-slate-100 px-2 py-2.5 last:border-0" role="listitem"><span className="min-w-0 text-xs font-semibold text-slate-700">{row.date ? monthLabel(row.date) : "Undated"} <small className="ml-1 text-slate-400">{row.currency}</small></span><span className="shrink-0 font-sans text-sm font-black tabular-nums">{row.currency === "UNK" ? "Currency unclear" : formatMoney(row.total, row.currency)}</span></div>)}</div> : <EmptyState className="mt-4" icon={BarChart3} title="No supplier-document activity yet" description="Monthly source-currency totals will appear after records are available." />}</section>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Vendor spend"><SectionHeader title="Vendor spend" description="Top supplier totals from available invoice records, kept in each source currency." icon={Tag} />{vendors.length ? <div className="mt-4 space-y-1" role="list" aria-label="Vendor spend rows">{vendors.map((vendor) => <div key={`${vendor.name}-${vendor.currency}`} className="flex items-center justify-between gap-3 rounded-lg border-b border-slate-100 px-2 py-2.5 last:border-0" role="listitem"><span className="min-w-0 truncate text-xs font-semibold text-slate-700">{vendor.name} <small className="text-slate-400">({vendor.count})</small></span><span className="shrink-0 font-sans text-sm font-black tabular-nums">{vendor.currency === "UNK" ? "—" : formatMoney(vendor.total, vendor.currency)}</span></div>)}</div> : <EmptyState className="mt-4" icon={Tag} title="No vendor activity yet" description="Supplier totals will appear after invoice records are available." />}</section>
    </section>

    <section className="grid gap-4 xl:grid-cols-2" aria-label="Tax and review reports">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Philippine VAT summary"><SectionHeader title="Philippine VAT summary" description={`Reconciliation aid in ${reportingCurrency}; source tax remains in the source currency until the same FX snapshot is confirmed.`} icon={Receipt} /><div className="mt-4 grid grid-cols-2 gap-2">{[["VATable sales / purchases", vatSummary.vatable], ["VAT amount", vatSummary.vat], ["Zero-rated", vatSummary.zero], ["VAT-exempt", vatSummary.exempt]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words font-sans text-sm font-black tabular-nums text-slate-900">{formatMoney(Number(value), reportingCurrency)}</p></div>)}</div>{vatSummary.unresolved > 0 && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-900">{vatSummary.unresolved} foreign tax record{vatSummary.unresolved === 1 ? "" : "s"} excluded from the {reportingCurrency} tax summary because FX is required. No source tax was relabelled.</p>}{!phInvoices.length && <p className="mt-3 text-xs text-slate-500">No Philippine invoice records are available for this view.</p>}</section>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Review quality"><SectionHeader title="Review quality" description="Completeness and extraction signals that may need human action." icon={AlertTriangle} /><div className="mt-4 grid grid-cols-2 gap-2">{[["Verified", reviewQuality.verified, "success"], ["Needs review", reviewQuality.needsReview, "warning"], ["Missing TIN", reviewQuality.missingTin, "warning"], ["Math mismatch", reviewQuality.mathMismatch, "danger"], ["Potential duplicate", reviewQuality.potentialDuplicate, "danger"]].map(([label, value, tone]) => <div key={String(label)} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold text-slate-700">{label}</p><StatusBadge tone={tone as StatusTone}>{value}</StatusBadge></div>)}</div></section>
    </section>

    <section className="grid gap-4 xl:grid-cols-2" aria-label="Payment and currency reports"><section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Payment status"><SectionHeader title="Payment status" description="Invoice count by current payment state." icon={Clock3} /><div className="mt-4 space-y-1" role="list" aria-label="Payment status rows">{payment.map(([status, count]) => <div key={status} className="flex items-center justify-between rounded-lg border-b border-slate-100 px-2 py-2.5 last:border-0" role="listitem"><StatusBadge tone={paymentTone(status)}>{status.replaceAll("_", " ")}</StatusBadge><span className="text-xs font-black tabular-nums text-slate-900">{count}</span></div>)}</div></section><section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Currency totals"><SectionHeader title="Currency totals" description="Original source amounts remain grouped; No automatic conversion is applied." icon={WalletCards} />{Object.entries(currencyTotals).length ? <div className="mt-4 space-y-1" role="list" aria-label="Currency total rows">{Object.entries(currencyTotals).map(([currency, total]) => <div key={currency} className="flex items-center justify-between rounded-lg border-b border-slate-100 px-2 py-2.5 last:border-0" role="listitem"><span className="text-xs font-semibold text-slate-700">{currency}</span><span className="shrink-0 font-sans text-sm font-black tabular-nums text-slate-900">{currency === "UNK" ? "Currency unclear" : formatMoney(total, currency)}</span></div>)}</div> : <EmptyState className="mt-4" icon={WalletCards} title="No currency totals yet" description="Invoice records will be grouped here without conversion." />}</section></section>
  </div>;
};

function selectorTaxAmount(invoice: InvoiceData) {
  return invoice.philippineTaxDetails?.vatAmount ?? invoice.totalTax;
}
