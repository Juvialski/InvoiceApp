import React, { useMemo, useState } from "react";
import { AlertTriangle, Archive, Ban, CheckCircle2, Download, Eye, Files, Plus } from "lucide-react";
import type { FinancialFxSnapshot, InvoiceData, InvoiceProjectAllocation, Project } from "../types";
import { supplierInvoicePaymentStateFor, type SupplierInvoiceSettlementProjection } from "../lib/supplierInvoiceSettlement.ts";
import { getInvoiceDisplay } from "../utils/invoiceDisplay";
import { ActionButton, CompactActionBar, EmptyState, PageActionBar, PageHeader, StatusBadge, type FilterChip, type StatusTone } from "./ui/OperationsUI";
import { useWorkspaceDataPending } from "../app/AppPermissionContext.tsx";

interface InvoiceDirectoryProps {
  invoices: InvoiceData[];
  onSelectInvoice: (invoice: InvoiceData) => void;
  onOpenCorrection?: (invoice: InvoiceData) => void;
  onAddNew: () => void;
  onExportInvoicesExcel?: () => void;
  projects?: Project[];
  projectAllocations?: InvoiceProjectAllocation[];
  financialFxSnapshots?: readonly FinancialFxSnapshot[];
  settlementProjections?: ReadonlyMap<string, SupplierInvoiceSettlementProjection>;
  today?: string;
}

function reviewTone(status: string): StatusTone { return status === "VERIFIED" ? "success" : "warning"; }
function paymentTone(status: string): StatusTone { return status === "PAID" ? "success" : status === "OVERDUE" ? "danger" : status === "PARTIALLY_PAID" ? "info" : "neutral"; }
function sourceTone(source: string): StatusTone { return source === "EMAIL" ? "info" : source === "SAMPLE" ? "warning" : "neutral"; }

export const InvoiceDirectory: React.FC<InvoiceDirectoryProps> = ({ invoices, onSelectInvoice, onOpenCorrection, onAddNew, onExportInvoicesExcel, projects = [], projectAllocations = [], financialFxSnapshots = [], settlementProjections, today }) => {
  const workspaceDataPending = useWorkspaceDataPending();
  const [query, setQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [taxFilter, setTaxFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [duplicateFilter, setDuplicateFilter] = useState("ALL");
  const [lifecycleFilter, setLifecycleFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [projectFilter, setProjectFilter] = useState("ALL");

  const currencies = useMemo(() => Array.from(new Set(invoices.map((invoice) => invoice.currency).filter(Boolean))).sort(), [invoices]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const allocationsByInvoice = useMemo(() => projectAllocations.reduce<Map<string, InvoiceProjectAllocation[]>>((map, allocation) => { map.set(allocation.invoiceId, [...(map.get(allocation.invoiceId) || []), allocation]); return map; }, new Map()), [projectAllocations]);
  const filtered = useMemo(() => invoices.filter((invoice) => {
    const q = query.trim().toLowerCase();
    const haystack = [
      invoice.invoiceNumber, invoice.vendor?.name, invoice.vendor?.registeredName, invoice.vendor?.tradeName, invoice.vendor?.taxId,
      invoice.fileName, invoice.category,
      invoice.currency, invoice.purchaseOrderNumber, invoice.sourceMetadata?.sender, invoice.sourceMetadata?.subject, invoice.projectReference,
      ...(allocationsByInvoice.get(invoice.id) || []).flatMap((allocation) => { const project = projectById.get(allocation.projectId); return [project?.projectCode, project?.projectName]; }), invoice.grandTotal,
    ].join(" ").toLowerCase();
    const taxRegistration = invoice.vendor?.taxRegistration || invoice.philippineTaxDetails?.sellerRegistration || "UNKNOWN";
    const invoiceType = invoice.invoiceSubtype || invoice.documentType || "INVOICE";
    const paymentState = supplierInvoicePaymentStateFor(invoice, settlementProjections?.get(invoice.id), today);
    return (!q || haystack.includes(q))
      && (reviewFilter === "ALL" || (reviewFilter === "NEEDS_REVIEW" ? invoice.reviewStatus === "NEEDS_REVIEW" && invoice.lifecycleStatus !== "VOID" && !invoice.archivedAt : invoice.reviewStatus === reviewFilter))
      && (paymentFilter === "ALL" || paymentState === paymentFilter)
      && (currencyFilter === "ALL" || invoice.currency === currencyFilter)
      && (taxFilter === "ALL" || taxRegistration === taxFilter)
      && (typeFilter === "ALL" || invoiceType === typeFilter)
      && (sourceFilter === "ALL" || (invoice.sourceType || "UPLOAD") === sourceFilter)
      && (duplicateFilter === "ALL" || (duplicateFilter === "DUPLICATES" ? invoice.duplicateStatus === "POSSIBLE_DUPLICATE" : invoice.duplicateStatus !== "POSSIBLE_DUPLICATE"))
      && (lifecycleFilter === "ALL" || (lifecycleFilter === "VOID" ? invoice.lifecycleStatus === "VOID" : lifecycleFilter === "ARCHIVED" ? Boolean(invoice.archivedAt) : invoice.lifecycleStatus !== "VOID" && !invoice.archivedAt))
      && (projectFilter === "ALL" || (projectFilter === "UNALLOCATED" ? !(allocationsByInvoice.get(invoice.id) || []).length : (allocationsByInvoice.get(invoice.id) || []).some((allocation) => allocation.projectId === projectFilter)))
      && (!dateFrom || invoice.invoiceDate >= dateFrom)
      && (!dateTo || invoice.invoiceDate <= dateTo);
  }), [invoices, query, reviewFilter, paymentFilter, currencyFilter, taxFilter, typeFilter, sourceFilter, duplicateFilter, lifecycleFilter, projectFilter, dateFrom, dateTo, allocationsByInvoice, projectById, settlementProjections, today]);

  const counts = {
    all: invoices.length,
    review: invoices.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW" && invoice.lifecycleStatus !== "VOID" && !invoice.archivedAt).length,
    verified: invoices.filter((invoice) => invoice.reviewStatus === "VERIFIED" && invoice.lifecycleStatus !== "VOID").length,
    overdue: invoices.filter((invoice) => supplierInvoicePaymentStateFor(invoice, settlementProjections?.get(invoice.id), today) === "OVERDUE" && invoice.lifecycleStatus !== "VOID").length,
  };
  const invoiceResultLabel = `${filtered.length} of ${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`;
  const activeFilterValues = [query.trim(), reviewFilter, paymentFilter, currencyFilter, taxFilter, typeFilter, sourceFilter, duplicateFilter, lifecycleFilter, projectFilter, dateFrom, dateTo];
  const activeFilters: FilterChip[] = [];
  const reviewLabels: Record<string, string> = { NEEDS_REVIEW: "Needs review", VERIFIED: "Verified" };
  const paymentLabels: Record<string, string> = { UNPAID: "Unpaid", PARTIALLY_PAID: "Partially paid", PAID: "Paid", OVERDUE: "Overdue" };
  if (query.trim()) activeFilters.push({ id: "query", label: `Search: ${query.trim()}`, onRemove: () => setQuery("") });
  if (reviewFilter !== "ALL") activeFilters.push({ id: "review", label: `Review: ${reviewLabels[reviewFilter] || reviewFilter}`, onRemove: () => setReviewFilter("ALL") });
  if (paymentFilter !== "ALL") activeFilters.push({ id: "payment", label: `Payment: ${paymentLabels[paymentFilter] || paymentFilter}`, onRemove: () => setPaymentFilter("ALL") });
  if (currencyFilter !== "ALL") activeFilters.push({ id: "currency", label: `Currency: ${currencyFilter}`, onRemove: () => setCurrencyFilter("ALL") });
  if (taxFilter !== "ALL") activeFilters.push({ id: "tax", label: `Tax: ${taxFilter.replaceAll("_", " ")}`, onRemove: () => setTaxFilter("ALL") });
  if (typeFilter !== "ALL") activeFilters.push({ id: "type", label: `Type: ${typeFilter.replaceAll("_", " ")}`, onRemove: () => setTypeFilter("ALL") });
  if (sourceFilter !== "ALL") activeFilters.push({ id: "source", label: `Source: ${sourceFilter.replaceAll("_", " ")}`, onRemove: () => setSourceFilter("ALL") });
  if (duplicateFilter !== "ALL") activeFilters.push({ id: "duplicate", label: `Duplicate: ${duplicateFilter.toLowerCase()}`, onRemove: () => setDuplicateFilter("ALL") });
  if (lifecycleFilter !== "ALL") activeFilters.push({ id: "lifecycle", label: `Lifecycle: ${lifecycleFilter.toLowerCase()}`, onRemove: () => setLifecycleFilter("ALL") });
  if (projectFilter !== "ALL") {
    const selectedProject = projects.find((project) => project.id === projectFilter);
    const label = projectFilter === "UNALLOCATED" ? "Unallocated" : selectedProject?.projectName || "Selected project";
    activeFilters.push({ id: "project", label: `Project: ${label}`, onRemove: () => setProjectFilter("ALL") });
  }
  if (dateFrom) activeFilters.push({ id: "date-from", label: `From: ${dateFrom}`, onRemove: () => setDateFrom("") });
  if (dateTo) activeFilters.push({ id: "date-to", label: `To: ${dateTo}`, onRemove: () => setDateTo("") });

  const resetFilters = () => {
    setQuery(""); setReviewFilter("ALL"); setPaymentFilter("ALL"); setCurrencyFilter("ALL"); setTaxFilter("ALL"); setTypeFilter("ALL"); setSourceFilter("ALL"); setDuplicateFilter("ALL"); setLifecycleFilter("ALL"); setProjectFilter("ALL"); setDateFrom(""); setDateTo("");
  };

  return <div className="space-y-5">
    <PageHeader eyebrow="Supplier evidence" title="Supplier source documents" description="Search and review supplier evidence; it does not create a second cost record." actions={<PageActionBar>{onExportInvoicesExcel && <ActionButton variant="secondary" icon={<Download aria-hidden="true" className="h-3.5 w-3.5" />} label="Export invoices to Excel" onClick={onExportInvoicesExcel} />}<ActionButton variant="primary" icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} label="Upload supplier invoice" onClick={onAddNew} /></PageActionBar>} />

    <CompactActionBar
      ariaLabel="Invoice search and filters"
      search={{ value: query, onChange: setQuery, placeholder: "Search invoice, vendor, TIN, PO, amount…", ariaLabel: "Search invoices" }}
      activeFilterValues={activeFilterValues}
      activeFilters={activeFilters}
      onClearAll={resetFilters}
      resultLabel={<span className="inline-flex flex-wrap items-center gap-x-1.5"><Files className="h-3.5 w-3.5" aria-hidden="true" />Showing <strong className="hqs-primary-text">{invoiceResultLabel}</strong><span aria-hidden="true">· {counts.review} need review · {counts.overdue} overdue</span><span className="sr-only">; {counts.review} need review; {counts.overdue} overdue</span></span>}
      advancedFilters={<>
        <label className="min-w-0 space-y-1"><span className="field-label">Review status</span><select aria-label="Review status" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)} className="field-input"><option value="ALL">All review states ({counts.all})</option><option value="NEEDS_REVIEW">Needs review ({counts.review})</option><option value="VERIFIED">Verified ({counts.verified})</option></select></label>
        <label className="min-w-0 space-y-1"><span className="field-label">Payment status</span><select aria-label="Payment status" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="field-input"><option value="ALL">All payment states</option><option value="UNPAID">Unpaid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="PAID">Paid</option><option value="OVERDUE">Overdue ({counts.overdue})</option></select></label>
        <label className="min-w-0 space-y-1"><span className="field-label">Project</span><select aria-label="Project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className="field-input"><option value="ALL">All projects</option><option value="UNALLOCATED">Unallocated</option>{projects.filter((project) => project.status !== "ARCHIVED").map((project) => <option key={project.id} value={project.id}>{project.projectCode} — {project.projectName}</option>)}</select></label>
        <label className="min-w-0 space-y-1"><span className="field-label">Invoice lifecycle</span><select aria-label="Invoice lifecycle" value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value)} className="field-input"><option value="ALL">All lifecycle states</option><option value="ACTIVE">Active visibility</option><option value="ARCHIVED">Archived visibility</option><option value="VOID">Voided</option></select></label>
        <label className="min-w-0 space-y-1"><span className="field-label">Invoice date from</span><input aria-label="Invoice date from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="field-input" /></label>
        <label className="min-w-0 space-y-1"><span className="field-label">Invoice date to</span><input aria-label="Invoice date to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="field-input" /></label>
        <label className="min-w-0 space-y-1"><span className="field-label">Currency</span><select aria-label="Currency" value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)} className="field-input"><option value="ALL">All currencies</option>{currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
        <label className="min-w-0 space-y-1"><span className="field-label">Tax registration</span><select aria-label="Tax registration" value={taxFilter} onChange={(event) => setTaxFilter(event.target.value)} className="field-input"><option value="ALL">All tax states</option><option value="VAT">VAT</option><option value="NON_VAT">Non-VAT</option><option value="UNKNOWN">Unknown</option></select></label>
        <label className="min-w-0 space-y-1"><span className="field-label">Document type</span><select aria-label="Document type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="field-input"><option value="ALL">All document types</option><option value="VAT_INVOICE">VAT invoice</option><option value="NON_VAT_INVOICE">Non-VAT invoice</option><option value="SERVICE_INVOICE">Service invoice</option><option value="SALES_INVOICE">Sales invoice</option><option value="RECEIPT">Receipt</option><option value="SUPPLEMENTARY_DOCUMENT">Supplementary</option></select></label>
        <label className="min-w-0 space-y-1"><span className="field-label">Source</span><select aria-label="Source" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="field-input"><option value="ALL">All sources</option><option value="EMAIL">Email (historical)</option><option value="UPLOAD">Upload</option><option value="PASTED_TEXT">Pasted text</option><option value="SAMPLE">Demo</option></select></label>
        <label className="min-w-0 space-y-1"><span className="field-label">Duplicate state</span><select aria-label="Duplicate state" value={duplicateFilter} onChange={(event) => setDuplicateFilter(event.target.value)} className="field-input"><option value="ALL">All duplicate states</option><option value="DUPLICATES">Potential duplicates</option><option value="UNIQUE">Unique only</option></select></label>
      </>}
    />
    {filtered.length ? <>
      <div data-invoice-mobile-register="true" aria-label="Invoice records" className="grid gap-2 md:grid-cols-2 xl:hidden">
        {filtered.map((invoice) => {
          const display = getInvoiceDisplay(invoice, { reportingCurrency: "PHP", financialFxSnapshots });
          const paymentState = supplierInvoicePaymentStateFor(invoice, settlementProjections?.get(invoice.id), today);
          const assignedProjects = (allocationsByInvoice.get(invoice.id) || []).map((allocation) => projectById.get(allocation.projectId)).filter(Boolean) as Project[];
          const source = invoice.sourceType || "UPLOAD";
          const voided = invoice.lifecycleStatus === "VOID";
          const needsReview = invoice.reviewStatus === "NEEDS_REVIEW" && !voided;
          return <article key={invoice.id} data-invoice-mobile-card="true" aria-label={`Invoice ${display.primaryLabel}`} className="hqs-surface-raised min-w-0 rounded-xl p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <strong className="hqs-primary-text block break-words text-sm font-black">{display.primaryLabel}</strong>
                <span className="hqs-secondary-text mt-0.5 block break-words text-xs">{display.invoiceLabel}</span>
                <span className="hqs-secondary-text mt-0.5 block break-words text-xs">TIN {invoice.vendor?.taxId || "not found"}</span>
              </div>
              <div className="shrink-0 text-right">
                <strong className="hqs-primary-text block whitespace-nowrap text-sm font-black tabular-nums">{display.amountLabel}</strong>
                <span className="hqs-secondary-text block text-xs">{display.currencyLabel}</span>
              </div>
            </div>
            <dl className="hqs-border mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-2 text-xs">
              <div className="min-w-0"><dt className="hqs-secondary-text font-semibold">Project</dt><dd className="hqs-primary-text mt-0.5 break-words">{assignedProjects.length ? assignedProjects.map((project) => `${project.projectCode} · ${project.projectName}`).join(", ") : "Unallocated · needs confirmation"}</dd></div>
              <div><dt className="hqs-secondary-text font-semibold">Date</dt><dd className="hqs-primary-text mt-0.5">{display.dateLabel}</dd></div>
              <div className="min-w-0"><dt className="hqs-secondary-text font-semibold">Source</dt><dd className="hqs-primary-text mt-0.5 break-words">{display.sourceLabel} · {display.sourceFileLabel}</dd></div>
              <div><dt className="hqs-secondary-text font-semibold">Document</dt><dd className="hqs-primary-text mt-0.5">{display.documentLabel}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {invoice.duplicateStatus === "POSSIBLE_DUPLICATE" && <StatusBadge tone="danger" icon={AlertTriangle}>Potential duplicate</StatusBadge>}
              {voided && <StatusBadge tone="danger" icon={Ban}>Voided</StatusBadge>}
              {invoice.archivedAt && <StatusBadge tone="neutral" icon={Archive}>Archived</StatusBadge>}
              <StatusBadge tone={sourceTone(source)}>{display.sourceLabel}</StatusBadge>
              <StatusBadge tone={voided ? "neutral" : reviewTone(invoice.reviewStatus)} icon={voided ? Ban : needsReview ? AlertTriangle : CheckCircle2}>{voided ? "Voided record" : needsReview ? "Needs review" : "Verified"}</StatusBadge>
              <StatusBadge tone={paymentTone(paymentState)}>{paymentState.replaceAll("_", " ")}</StatusBadge>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => onSelectInvoice(invoice)} className="hqs-control hqs-focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold" aria-label={`Open invoice: ${display.primaryLabel}`}><Eye aria-hidden="true" className="h-3.5 w-3.5" />Open</button>
              {onOpenCorrection && <button type="button" onClick={() => onOpenCorrection(invoice)} className="hqs-control hqs-focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold" aria-label={`Review correction options for ${display.primaryLabel}`}><Archive aria-hidden="true" className="h-3.5 w-3.5" />Review correction</button>}
            </div>
          </article>;
        })}
      </div>
      <section id="invoice-directory-results" data-invoice-directory-table="true" className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white xl:block" aria-label="Invoice directory table"><div className="ops-scrollbar overflow-auto"><table className="ops-table min-w-[980px] w-full text-left text-xs"><caption className="sr-only">Invoice directory results: {invoiceResultLabel}</caption><thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th scope="col" className="px-4 py-3">Invoice / vendor</th><th scope="col" className="px-4 py-3">Project</th><th scope="col" className="px-4 py-3">Date</th><th scope="col" className="px-4 py-3 text-right">Amount</th><th scope="col" className="px-4 py-3">Source</th><th scope="col" className="px-4 py-3">Review</th><th scope="col" className="px-4 py-3">Payment</th><th scope="col" className="sticky right-0 bg-slate-50 px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((invoice) => {
      const display = getInvoiceDisplay(invoice, { reportingCurrency: "PHP", financialFxSnapshots });
      const paymentState = supplierInvoicePaymentStateFor(invoice, settlementProjections?.get(invoice.id), today);
      const assignedProjects = (allocationsByInvoice.get(invoice.id) || []).map((allocation) => projectById.get(allocation.projectId)).filter(Boolean) as Project[];
      const source = invoice.sourceType || "UPLOAD";
      const voided = invoice.lifecycleStatus === "VOID";
      const needsReview = invoice.reviewStatus === "NEEDS_REVIEW" && !voided;
      return <tr key={invoice.id} className="group align-top transition hover:bg-slate-50"><td className="max-w-[280px] px-4 py-3"><button type="button" onClick={() => onSelectInvoice(invoice)} className="block max-w-full text-left hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"><strong className="block truncate text-xs text-slate-900">{display.primaryLabel}</strong><span className="mt-0.5 block truncate text-[10px] text-slate-600">{display.invoiceLabel}</span><span className="mt-0.5 block truncate text-[9px] text-slate-400">TIN {invoice.vendor?.taxId || "not found"}</span></button><div className="mt-1 flex flex-wrap gap-1">{invoice.duplicateStatus === "POSSIBLE_DUPLICATE" && <StatusBadge tone="danger" icon={AlertTriangle}>Potential duplicate</StatusBadge>}{voided && <StatusBadge tone="danger" icon={Ban}>Voided</StatusBadge>}{invoice.archivedAt && <StatusBadge tone="neutral" icon={Archive}>Archived</StatusBadge>}</div></td><td className="max-w-[210px] px-4 py-3">{assignedProjects.length ? <><strong className="block truncate text-[10px] text-indigo-700">{assignedProjects.map((project) => project.projectCode).join(", ")}</strong><span className="mt-0.5 block truncate text-[10px] text-slate-500">{assignedProjects.map((project) => project.projectName).join(", ")}</span></> : <><strong className="block text-[10px] text-amber-700">Unallocated</strong><span className="mt-0.5 block text-[10px] text-slate-400">Needs confirmation</span></>}</td><td className="px-4 py-3"><strong className="block whitespace-nowrap text-[10px] text-slate-700">{display.dateLabel}</strong><span className="mt-0.5 block truncate text-[9px] text-slate-400">{display.projectKnown ? (display.projectReference ? `Project: ${display.projectLabel}` : `PO: ${display.projectLabel}`) : display.documentLabel}</span></td><td className="px-4 py-3 text-right"><strong className="block whitespace-nowrap font-sans text-xs tabular-nums text-slate-900">{display.amountLabel}</strong>{display.amountLabel !== display.currencyLabel && <span className="mt-0.5 block text-[9px] font-bold uppercase text-slate-400">{display.currencyLabel}</span>}</td><td className="max-w-[180px] px-4 py-3"><StatusBadge tone={sourceTone(source)}>{display.sourceLabel}</StatusBadge><span className="mt-1 block truncate text-[9px] text-slate-500" title={display.sourceFileLabel}>{display.sourceFileLabel}</span><span className="mt-0.5 block truncate text-[9px] text-slate-400">{display.documentLabel}</span></td><td className="px-4 py-3"><StatusBadge tone={voided ? "neutral" : reviewTone(invoice.reviewStatus)} icon={voided ? Ban : needsReview ? AlertTriangle : CheckCircle2}>{voided ? "Voided record" : needsReview ? "Needs review" : "Verified"}</StatusBadge></td><td className="px-4 py-3"><StatusBadge tone={paymentTone(paymentState)}>{paymentState.replaceAll("_", " ")}</StatusBadge></td><td className="sticky right-0 bg-white px-4 py-3 text-right group-hover:bg-slate-50"><div className="flex justify-end gap-1"><button type="button" onClick={() => onSelectInvoice(invoice)} className="rounded-lg p-2 text-indigo-600 transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1" title={needsReview ? "Open review" : "Open read-only"} aria-label={`${needsReview ? "Open review" : "Open read-only"}: ${display.primaryLabel}`}><Eye className="h-3.5 w-3.5" /></button>{onOpenCorrection && <button type="button" onClick={() => onOpenCorrection(invoice)} className="rounded-lg p-2 text-slate-500 transition hover:bg-amber-50 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1" title="Review correction options" aria-label={`Review correction options for ${display.primaryLabel}`}><Archive className="h-3.5 w-3.5" /></button>}</div></td></tr>;
    })}</tbody></table></div></section>
    </> : invoices.length === 0 ? (workspaceDataPending ? <div id="invoice-directory-results" role="status" aria-live="polite" className="p-8 text-center text-xs font-semibold text-slate-500">Loading invoices…</div> : <div id="invoice-directory-results"><EmptyState icon={Files} title="No invoices yet" description="Upload an invoice to begin." action={<button type="button" onClick={onAddNew} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"><Plus className="h-3.5 w-3.5" /> Upload invoice</button>} /></div>) : <div id="invoice-directory-results"><EmptyState icon={Files} title="No matching invoices" description="Try changing the filters or extract another invoice." /></div>}
  </div>;
};
