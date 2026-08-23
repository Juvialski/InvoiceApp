import React, { useMemo, useState } from "react";
import { CheckCircle2, Eye, Search, Trash2, AlertTriangle, Files, Plus, Filter } from "lucide-react";
import { InvoiceData, InvoiceProjectAllocation, Project } from "../types";
import { getInvoiceDisplay } from "../utils/invoiceDisplay";

interface InvoiceDirectoryProps {
  invoices: InvoiceData[];
  onSelectInvoice: (invoice: InvoiceData) => void;
  onDeleteInvoice: (id: string) => void;
  onAddNew: () => void;
  projects?: Project[];
  projectAllocations?: InvoiceProjectAllocation[];
}

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

  const currencies = useMemo(() => Array.from(new Set(invoices.map((invoice) => invoice.currency).filter(Boolean))).sort(), [invoices]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const allocationsByInvoice = useMemo(() => projectAllocations.reduce<Map<string, InvoiceProjectAllocation[]>>((map, allocation) => { map.set(allocation.invoiceId, [...(map.get(allocation.invoiceId) || []), allocation]); return map; }, new Map()), [projectAllocations]);
  const filtered = useMemo(() => invoices.filter((invoice) => {
    const q = query.trim().toLowerCase();
    const haystack = [
      invoice.invoiceNumber,
      invoice.vendor?.name,
      invoice.vendor?.registeredName,
      invoice.vendor?.tradeName,
      invoice.vendor?.taxId,
      invoice.customer?.name,
      invoice.customer?.registeredName,
      invoice.customer?.taxId,
      invoice.fileName,
      invoice.category,
      invoice.currency,
      invoice.purchaseOrderNumber,
      invoice.sourceMetadata?.sender,
      invoice.sourceMetadata?.subject,
      invoice.projectReference,
      ...(allocationsByInvoice.get(invoice.id) || []).flatMap((allocation) => { const project = projectById.get(allocation.projectId); return [project?.projectCode, project?.projectName]; }),
      invoice.grandTotal,
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div><h2 className="text-xl font-black text-slate-900">Invoice directory</h2><p className="text-xs text-slate-500 mt-1">Search and review Philippine and international invoices without mixing currencies.</p></div>
        <button onClick={onAddNew} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white"><Plus className="w-3.5 h-3.5" /> New extraction</button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm space-y-2">
        <div className="flex flex-col md:flex-row gap-2">
          <label className="flex items-center gap-2 flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"><Search className="w-4 h-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoice, vendor, TIN, email, PO, amount..." className="w-full bg-transparent text-xs outline-none" /></label>
          <select value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"><option value="ALL">All review states</option><option value="NEEDS_REVIEW">Needs review</option><option value="VERIFIED">Verified</option></select>
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"><option value="ALL">All payment states</option><option value="UNPAID">Unpaid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="PAID">Paid</option><option value="OVERDUE">Overdue</option></select>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400"><Filter className="w-3.5 h-3.5" /> Filters</div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Date from" className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Date to" className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs" />
          <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs"><option value="ALL">All currencies</option>{currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select>
          <select value={taxFilter} onChange={(e) => setTaxFilter(e.target.value)} className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs"><option value="ALL">VAT / Non-VAT</option><option value="VAT">VAT</option><option value="NON_VAT">Non-VAT</option><option value="UNKNOWN">Unknown</option></select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs"><option value="ALL">All invoice types</option><option value="VAT_INVOICE">VAT invoice</option><option value="NON_VAT_INVOICE">Non-VAT invoice</option><option value="SERVICE_INVOICE">Service invoice</option><option value="SALES_INVOICE">Sales invoice</option><option value="RECEIPT">Receipt</option><option value="SUPPLEMENTARY_DOCUMENT">Supplementary</option></select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs"><option value="ALL">All sources</option><option value="EMAIL">Gmail</option><option value="UPLOAD">Upload</option><option value="PASTED_TEXT">Pasted text</option><option value="SAMPLE">Demo</option></select>
          <select value={duplicateFilter} onChange={(e) => setDuplicateFilter(e.target.value)} className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs"><option value="ALL">Duplicates: all</option><option value="DUPLICATES">Potential duplicates</option><option value="UNIQUE">Unique only</option></select>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs"><option value="ALL">All projects</option><option value="UNALLOCATED">Unallocated</option>{projects.filter((project) => project.status !== "ARCHIVED").map((project) => <option key={project.id} value={project.id}>{project.projectCode} — {project.projectName}</option>)}</select>
          <p className="rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-2 text-xs font-bold text-slate-600 self-stretch flex items-center">{filtered.length} shown</p>
        </div>
      </div>

      {filtered.length ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="p-3">Vendor / invoice</th><th className="p-3">Date / project</th><th className="p-3">Assigned project</th><th className="p-3">Amount</th><th className="p-3">Source</th><th className="p-3">Review</th><th className="p-3">Payment</th><th className="p-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{filtered.map((invoice) => {
                const display = getInvoiceDisplay(invoice);
                const needsReview = invoice.reviewStatus === "NEEDS_REVIEW";
                const openLabel = needsReview ? "Open review" : "Open read-only";
                const assignedProjects = (allocationsByInvoice.get(invoice.id) || []).map((allocation) => projectById.get(allocation.projectId)).filter(Boolean) as Project[];
                return <tr key={invoice.id} className="hover:bg-slate-50">
                  <td className="p-3 max-w-[250px]"><button onClick={() => onSelectInvoice(invoice)} className="font-black text-slate-900 hover:text-indigo-600 text-left truncate max-w-full block">{display.primaryLabel}</button><p className="text-[10px] text-slate-600 mt-0.5 truncate">{display.invoiceLabel}</p><p className="text-[10px] text-slate-500 truncate">TIN: {invoice.vendor?.taxId || "Not found"}</p>{invoice.duplicateStatus === "POSSIBLE_DUPLICATE" && <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold text-rose-700"><AlertTriangle className="w-3 h-3" /> potential duplicate</span>}</td>
                  <td className="p-3 min-w-[150px]"><p className="font-semibold text-slate-800">{display.dateLabel}</p><p className="text-[10px] text-slate-500 mt-1 truncate">{display.projectKnown ? (display.projectReference ? `Project: ${display.projectLabel}` : `PO: ${display.projectLabel}`) : display.documentLabel}</p></td>
                  <td className="p-3 min-w-[150px]"><p className="text-[10px] font-bold text-indigo-700 truncate">{assignedProjects.length ? assignedProjects.map((project) => project.projectCode).join(", ") : "Unallocated"}</p><p className="text-[10px] text-slate-500 truncate">{assignedProjects.length ? assignedProjects.map((project) => project.projectName).join(", ") : "Needs confirmation"}</p></td>
                  <td className="p-3 font-sans tabular-nums font-black whitespace-nowrap"><p>{display.amountLabel}</p>{display.amountLabel !== display.currencyLabel && <p className="text-[9px] uppercase font-bold text-slate-400 mt-0.5">{display.currencyLabel}</p>}</td>
                  <td className="p-3 max-w-[180px]"><span className="px-2 py-1 rounded-lg bg-slate-100 text-[10px] font-bold">{display.sourceLabel}</span><p className="text-[9px] text-slate-500 mt-1 truncate" title={display.sourceFileLabel}>{display.sourceFileLabel}</p><p className="text-[9px] text-slate-400 mt-0.5 truncate">{display.documentLabel}</p></td>
                  <td className="p-3"><span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold ${needsReview ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{needsReview ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}{needsReview ? "Review" : "Verified"}</span></td>
                  <td className="p-3"><span className="text-[9px] font-bold uppercase text-slate-700">{(invoice.status || "UNPAID").replaceAll("_", " ")}</span></td>
                  <td className="p-3"><div className="flex justify-end gap-1"><button onClick={() => onSelectInvoice(invoice)} className="p-2 rounded-lg bg-slate-100 hover:bg-indigo-50" title={openLabel} aria-label={`${openLabel}: ${display.primaryLabel}`}><Eye className="w-3.5 h-3.5" /></button><button onClick={() => onDeleteInvoice(invoice.id)} className="p-2 rounded-lg bg-rose-50 text-rose-600" title="Archive invoice" aria-label={`Archive ${display.primaryLabel}`}><Trash2 className="w-3.5 h-3.5" /></button></div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </div>
      ) : invoices.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center"><Files className="w-8 h-8 text-slate-300 mx-auto" /><p className="text-sm font-bold mt-3">No invoices yet.</p><p className="text-xs text-slate-500 mt-1">Upload an invoice or open Gmail Inbox to begin.</p><button onClick={onAddNew} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"><Plus className="w-3.5 h-3.5" />Upload invoice</button></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center"><Files className="w-8 h-8 text-slate-300 mx-auto" /><p className="text-sm font-bold mt-3">No matching invoices</p><p className="text-xs text-slate-500 mt-1">Try changing the filters or extract another invoice.</p></div>
      )}
    </div>
  );
};
