import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Eye, Files, Filter, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import type { InvoiceData, InvoiceProjectAllocation, Project } from "../types";
import { getInvoiceDisplay } from "../utils/invoiceDisplay";
import { EmptyState, PageHeader, StatusBadge, type StatusTone } from "./ui/OperationsUI";

interface InvoiceDirectoryProps {
  invoices: InvoiceData[];
  onSelectInvoice: (invoice: InvoiceData) => void;
  onDeleteInvoice: (id: string) => void;
  onAddNew: () => void;
  projects?: Project[];
  projectAllocations?: InvoiceProjectAllocation[];
}

function reviewTone(status: string): StatusTone { return status === "VERIFIED" ? "success" : "warning"; }
function paymentTone(status: string): StatusTone { return status === "PAID" ? "success" : status === "OVERDUE" ? "danger" : status === "PARTIALLY_PAID" ? "info" : "neutral"; }
function sourceTone(source: string): StatusTone { return source === "EMAIL" ? "info" : source === "SAMPLE" ? "warning" : "neutral"; }

export const InvoiceDirectory: React.FC<InvoiceDirectoryProps> = ({ invoices, onSelectInvoice, onDeleteInvoice, onAddNew, projects = [], projectAllocations = [] }) => {
  const [query, setQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [taxFilter, setTaxFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [duplicateFilter, setDuplicateFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [projectFilter, setProjectFilter] = useState("ALL");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const currencies = useMemo(() => Array.from(new Set(invoices.map((invoice) => invoice.currency).filter(Boolean))).sort(), [invoices]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const allocationsByInvoice = useMemo(() => projectAllocations.reduce<Map<string, InvoiceProjectAllocation[]>>((map, allocation) => { map.set(allocation.invoiceId, [...(map.get(allocation.invoiceId) || []), allocation]); return map; }, new Map()), [projectAllocations]);
  const filtered = useMemo(() => invoices.filter((invoice) => {
    const q = query.trim().toLowerCase();
    const haystack = [
      invoice.invoiceNumber, invoice.vendor?.name, invoice.vendor?.registeredName, invoice.vendor?.tradeName, invoice.vendor?.taxId,
      invoice.customer?.name, invoice.customer?.registeredName, invoice.customer?.taxId, invoice.fileName, invoice.category,
      invoice.currency, invoice.purchaseOrderNumber, invoice.sourceMetadata?.sender, invoice.sourceMetadata?.subject, invoice.projectReference,
      ...(allocationsByInvoice.get(invoice.id) || []).flatMap((allocation) => { const project = projectById.get(allocation.projectId); return [project?.projectCode, project?.projectName]; }), invoice.grandTotal,
    ].join(" ").toLowerCase();
    const taxRegistration = invoice.vendor?.taxRegistration || invoice.philippineTaxDetails?.sellerRegistration || "UNKNOWN";
    const invoiceType = invoice.invoiceSubtype || invoice.documentType || "INVOICE";
    return (!q || haystack.includes(q))
      && (reviewFilter === "ALL" || invoice.reviewStatus === reviewFilter)
      && (paymentFilter === "ALL" || invoice.status === paymentFilter)
      && (currencyFilter === "ALL" || invoice.currency === currencyFilter)
      && (taxFilter === "ALL" || taxRegistration === taxFilter)
      && (typeFilter === "ALL" || invoiceType === typeFilter)
      && (sourceFilter === "ALL" || (invoice.sourceType || "UPLOAD") === sourceFilter)
      && (duplicateFilter === "ALL" || (duplicateFilter === "DUPLICATES" ? invoice.duplicateStatus === "POSSIBLE_DUPLICATE" : invoice.duplicateStatus !== "POSSIBLE_DUPLICATE"))
      && (projectFilter === "ALL" || (projectFilter === "UNALLOCATED" ? !(allocationsByInvoice.get(invoice.id) || []).length : (allocationsByInvoice.get(invoice.id) || []).some((allocation) => allocation.projectId === projectFilter)))
      && (!dateFrom || invoice.invoiceDate >= dateFrom)
      && (!dateTo || invoice.invoiceDate <= dateTo);
  }), [invoices, query, reviewFilter, paymentFilter, currencyFilter, taxFilter, typeFilter, sourceFilter, duplicateFilter, projectFilter, dateFrom, dateTo, allocationsByInvoice, projectById]);

  const counts = {
    all: invoices.length,
    review: invoices.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW").length,
    verified: invoices.filter((invoice) => invoice.reviewStatus === "VERIFIED").length,
    overdue: invoices.filter((invoice) => invoice.status === "OVERDUE").length,
  };
  const activeFilterCount = [query.trim(), reviewFilter !== "ALL", paymentFilter !== "ALL", currencyFilter !== "ALL", taxFilter !== "ALL", typeFilter !== "ALL", sourceFilter !== "ALL", duplicateFilter !== "ALL", projectFilter !== "ALL", dateFrom, dateTo].filter(Boolean).length;

  const resetFilters = () => {
    setQuery(""); setReviewFilter("ALL"); setPaymentFilter("ALL"); setCurrencyFilter("ALL"); setTaxFilter("ALL"); setTypeFilter("ALL"); setSourceFilter("ALL"); setDuplicateFilter("ALL"); setProjectFilter("ALL"); setDateFrom(""); setDateTo("");
  };

  return <div className="space-y-5">
    <PageHeader eyebrow="Supplier control" title="Invoices" description="Search, allocate, review, and manage supplier records without mixing currencies." actions={<button type="button" onClick={onAddNew} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"><Plus className="h-3.5 w-3.5" /> New extraction</button>} />

    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200" aria-label="Invoice summary filters">
      {[['ALL', `All ${counts.all}`], ['NEEDS_REVIEW', `Needs review ${counts.review}`], ['VERIFIED', `Verified ${counts.verified}`], ['OVERDUE', `Overdue ${counts.overdue}`]].map(([value, label]) => <button type="button" key={value} onClick={() => { if (value === "OVERDUE") { setPaymentFilter("OVERDUE"); setReviewFilter("ALL"); } else { setReviewFilter(value); setPaymentFilter("ALL"); } }} className={`border-b-2 px-3 py-2.5 text-xs font-bold transition ${((value === "OVERDUE" && paymentFilter === "OVERDUE") || (value !== "OVERDUE" && reviewFilter === value && paymentFilter === "ALL")) ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{label}</button>)}
    </div>

    <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Invoice filters">
      <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1.15fr)_minmax(0,1.85fr)] lg:items-start">
        <label className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"><Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" /><span className="sr-only">Search invoices</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoice, vendor, TIN, PO, amount…" className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" /></label>
        <div className="grid grid-cols-2 gap-2 2xl:grid-cols-4">
          <select aria-label="Review status" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)} className="field-input"><option value="ALL">All review states</option><option value="NEEDS_REVIEW">Needs review</option><option value="VERIFIED">Verified</option></select>
          <select aria-label="Payment status" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="field-input"><option value="ALL">All payment states</option><option value="UNPAID">Unpaid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="PAID">Paid</option><option value="OVERDUE">Overdue</option></select>
          <select aria-label="Project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className="field-input"><option value="ALL">All projects</option><option value="UNALLOCATED">Unallocated</option>{projects.filter((project) => project.status !== "ARCHIVED").map((project) => <option key={project.id} value={project.id}>{project.projectCode} — {project.projectName}</option>)}</select>
          <button type="button" onClick={() => setMoreFiltersOpen((open) => !open)} aria-expanded={moreFiltersOpen} className={`inline-flex min-h-[2.625rem] items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-bold ${moreFiltersOpen ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}><Filter className="h-3.5 w-3.5" /> More filters <ChevronDown className={`h-3.5 w-3.5 transition ${moreFiltersOpen ? "rotate-180" : ""}`} /></button>
        </div>
      </div>
      {moreFiltersOpen && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3 lg:grid-cols-5"><label className="space-y-1"><span className="field-label">Invoice date from</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Invoice date to</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Currency</span><select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)} className="field-input"><option value="ALL">All currencies</option>{currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label><label className="space-y-1"><span className="field-label">Tax registration</span><select value={taxFilter} onChange={(event) => setTaxFilter(event.target.value)} className="field-input"><option value="ALL">All tax states</option><option value="VAT">VAT</option><option value="NON_VAT">Non-VAT</option><option value="UNKNOWN">Unknown</option></select></label><label className="space-y-1"><span className="field-label">Document type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="field-input"><option value="ALL">All document types</option><option value="VAT_INVOICE">VAT invoice</option><option value="NON_VAT_INVOICE">Non-VAT invoice</option><option value="SERVICE_INVOICE">Service invoice</option><option value="SALES_INVOICE">Sales invoice</option><option value="RECEIPT">Receipt</option><option value="SUPPLEMENTARY_DOCUMENT">Supplementary</option></select></label><label className="space-y-1"><span className="field-label">Source</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="field-input"><option value="ALL">All sources</option><option value="EMAIL">Gmail</option><option value="UPLOAD">Upload</option><option value="PASTED_TEXT">Pasted text</option><option value="SAMPLE">Demo</option></select></label><label className="space-y-1"><span className="field-label">Duplicate state</span><select value={duplicateFilter} onChange={(event) => setDuplicateFilter(event.target.value)} className="field-input"><option value="ALL">All duplicate states</option><option value="DUPLICATES">Potential duplicates</option><option value="UNIQUE">Unique only</option></select></label></div>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><p className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500"><Files className="h-3.5 w-3.5" /> Showing <span className="text-slate-900">{filtered.length}</span> of {invoices.length}</p>{activeFilterCount > 0 && <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-700 hover:text-indigo-900"><RotateCcw className="h-3 w-3" /> Reset filters <span className="rounded-full bg-indigo-50 px-1.5 py-0.5">{activeFilterCount}</span></button>}</div>
    </section>

    {filtered.length ? <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Invoice directory table"><div className="ops-scrollbar overflow-auto"><table className="ops-table min-w-[1080px] w-full text-left text-xs"><thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Invoice / vendor</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Review</th><th className="px-4 py-3">Payment</th><th className="sticky right-0 bg-slate-50 px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((invoice) => {
      const display = getInvoiceDisplay(invoice);
      const assignedProjects = (allocationsByInvoice.get(invoice.id) || []).map((allocation) => projectById.get(allocation.projectId)).filter(Boolean) as Project[];
      const needsReview = invoice.reviewStatus === "NEEDS_REVIEW";
      const source = invoice.sourceType || "UPLOAD";
      return <tr key={invoice.id} className="group"><td className="max-w-[280px] px-4 py-3"><button type="button" onClick={() => onSelectInvoice(invoice)} className="block max-w-full text-left hover:text-indigo-700"><strong className="block truncate text-xs text-slate-900">{display.primaryLabel}</strong><span className="mt-0.5 block truncate text-[10px] text-slate-600">{display.invoiceLabel}</span><span className="mt-0.5 block truncate text-[9px] text-slate-400">TIN {invoice.vendor?.taxId || "not found"}</span></button>{invoice.duplicateStatus === "POSSIBLE_DUPLICATE" && <StatusBadge tone="danger" icon={AlertTriangle} className="mt-1">Potential duplicate</StatusBadge>}</td><td className="max-w-[210px] px-4 py-3">{assignedProjects.length ? <><strong className="block truncate text-[10px] text-indigo-700">{assignedProjects.map((project) => project.projectCode).join(", ")}</strong><span className="mt-0.5 block truncate text-[10px] text-slate-500">{assignedProjects.map((project) => project.projectName).join(", ")}</span></> : <><strong className="block text-[10px] text-amber-700">Unallocated</strong><span className="mt-0.5 block text-[10px] text-slate-400">Needs confirmation</span></>}</td><td className="px-4 py-3"><strong className="block whitespace-nowrap text-[10px] text-slate-700">{display.dateLabel}</strong><span className="mt-0.5 block truncate text-[9px] text-slate-400">{display.projectKnown ? (display.projectReference ? `Project: ${display.projectLabel}` : `PO: ${display.projectLabel}`) : display.documentLabel}</span></td><td className="px-4 py-3 text-right"><strong className="block whitespace-nowrap font-sans text-xs tabular-nums text-slate-900">{display.amountLabel}</strong>{display.amountLabel !== display.currencyLabel && <span className="mt-0.5 block text-[9px] font-bold uppercase text-slate-400">{display.currencyLabel}</span>}</td><td className="max-w-[180px] px-4 py-3"><StatusBadge tone={sourceTone(source)}>{display.sourceLabel}</StatusBadge><span className="mt-1 block truncate text-[9px] text-slate-500" title={display.sourceFileLabel}>{display.sourceFileLabel}</span><span className="mt-0.5 block truncate text-[9px] text-slate-400">{display.documentLabel}</span></td><td className="px-4 py-3"><StatusBadge tone={reviewTone(invoice.reviewStatus)} icon={needsReview ? AlertTriangle : CheckCircle2}>{needsReview ? "Needs review" : "Verified"}</StatusBadge></td><td className="px-4 py-3"><StatusBadge tone={paymentTone(invoice.status || "UNPAID")}>{(invoice.status || "UNPAID").replaceAll("_", " ")}</StatusBadge></td><td className="sticky right-0 bg-white px-4 py-3 text-right group-hover:bg-slate-50"><div className="flex justify-end gap-1"><button type="button" onClick={() => onSelectInvoice(invoice)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" title={needsReview ? "Open review" : "Open read-only"} aria-label={`${needsReview ? "Open review" : "Open read-only"}: ${display.primaryLabel}`}><Eye className="h-3.5 w-3.5" /></button><button type="button" onClick={() => onDeleteInvoice(invoice.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" title="Archive invoice" aria-label={`Archive ${display.primaryLabel}`}><Trash2 className="h-3.5 w-3.5" /></button></div></td></tr>;
    })}</tbody></table></div></section> : invoices.length === 0 ? <EmptyState icon={Files} title="No invoices yet" description="Upload an invoice or open Gmail Inbox to begin." action={<button type="button" onClick={onAddNew} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" /> Upload invoice</button>} /> : <EmptyState icon={Files} title="No matching invoices" description="Try changing the filters or extract another invoice." />}
  </div>;
};
