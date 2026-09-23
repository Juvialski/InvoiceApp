import React, { useMemo, useState } from "react";
import { Archive, Ban, Download, Eye, Files, Plus, Search } from "lucide-react";
import type { FinancialFxSnapshot, InvoiceData } from "../types.ts";
import { supplierInvoicePaymentStateFor, type SupplierInvoiceSettlementProjection } from "../lib/supplierInvoiceSettlement.ts";
import { getInvoiceDisplay } from "../utils/invoiceDisplay.ts";
import { ActionButton, EmptyState, PageActionBar, PageHeader, StatusBadge } from "./ui/OperationsUI.tsx";

export function InvoiceDirectoryReadOnly({ invoices, onSelectInvoice, onAddNew, onExportInvoicesExcel, financialFxSnapshots = [], settlementProjections, today }: { invoices: InvoiceData[]; onSelectInvoice: (invoice: InvoiceData) => void; onAddNew?: () => void; onExportInvoicesExcel?: () => void; financialFxSnapshots?: readonly FinancialFxSnapshot[]; settlementProjections?: ReadonlyMap<string, SupplierInvoiceSettlementProjection>; today?: string }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((invoice) => [invoice.invoiceNumber, invoice.vendor?.name, invoice.vendor?.registeredName, invoice.vendor?.taxId, invoice.projectReference, invoice.currency, invoice.grandTotal].join(" ").toLowerCase().includes(q));
  }, [invoices, query]);

  return <div className="space-y-5">
    <PageHeader eyebrow="Supplier control" title="Invoices" description="Read invoice records and verification status. Destructive and editing actions are hidden when your role does not permit them." actions={(onAddNew || onExportInvoicesExcel) ? <PageActionBar>{onExportInvoicesExcel && <ActionButton variant="secondary" icon={<Download aria-hidden="true" className="h-3.5 w-3.5" />} label="Export invoices to Excel" onClick={onExportInvoicesExcel} />}{onAddNew && <ActionButton variant="primary" icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} label="New extraction" onClick={onAddNew} />}</PageActionBar> : undefined} />
    <label className="flex max-w-2xl items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><Search className="h-4 w-4 text-slate-400" /><span className="sr-only">Search invoices</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoice, vendor, TIN, project…" className="w-full text-xs outline-none" /></label>
    {filtered.length ? <>
      <div data-invoice-mobile-register="true" aria-label="Read-only invoice records" className="grid gap-2 md:grid-cols-2 xl:hidden">
        {filtered.map((invoice) => {
          const display = getInvoiceDisplay(invoice, { reportingCurrency: "PHP", financialFxSnapshots });
          const paymentState = supplierInvoicePaymentStateFor(invoice, settlementProjections?.get(invoice.id), today);
          const lifecycle = invoice.lifecycleStatus === "VOID" ? "Voided" : invoice.archivedAt ? "Archived" : "Active";
          const lifecycleTone = lifecycle === "Voided" ? "danger" : lifecycle === "Active" ? "success" : "neutral";
          const reviewLabel = invoice.reviewStatus === "VERIFIED" ? "Verified" : "Needs review";
          const reviewTone = invoice.reviewStatus === "VERIFIED" ? "success" : "warning";
          const paymentTone = paymentState === "PAID" ? "success" : paymentState === "OVERDUE" ? "danger" : paymentState === "PARTIALLY_PAID" ? "info" : "neutral";
          return <article key={invoice.id} data-invoice-mobile-card="true" aria-label={`Invoice ${display.primaryLabel}`} className="hqs-surface-raised min-w-0 rounded-xl p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0"><strong className="hqs-primary-text block break-words text-sm font-black">{display.primaryLabel}</strong><span className="hqs-secondary-text mt-0.5 block break-words text-xs">{display.invoiceLabel}</span></div>
              <strong className="hqs-primary-text shrink-0 text-right text-sm font-black tabular-nums">{display.amountLabel}</strong>
            </div>
            <dl className="hqs-border mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-2 text-xs">
              <div><dt className="hqs-secondary-text font-semibold">Date</dt><dd className="hqs-primary-text mt-0.5">{display.dateLabel}</dd></div>
              <div><dt className="hqs-secondary-text font-semibold">Currency</dt><dd className="hqs-primary-text mt-0.5">{display.currencyLabel}</dd></div>
              <div className="col-span-2"><dt className="hqs-secondary-text font-semibold">Source</dt><dd className="hqs-primary-text mt-0.5 break-words">{display.sourceFileLabel || display.documentLabel}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <StatusBadge tone={reviewTone}>{reviewLabel}</StatusBadge>
              <StatusBadge tone={lifecycleTone} icon={lifecycle === "Voided" ? Ban : undefined}>{lifecycle}</StatusBadge>
              <StatusBadge tone={paymentTone}>{paymentState.replaceAll("_", " ")}</StatusBadge>
            </div>
            <div className="mt-3 flex justify-end">
              <ActionButton variant="secondary" size="sm" icon={<Eye aria-hidden="true" className="h-3.5 w-3.5" />} label="Open invoice" aria-label={`Open invoice: ${display.primaryLabel}`} onClick={() => onSelectInvoice(invoice)} />
            </div>
          </article>;
        })}
      </div>
      <section data-invoice-directory-table="true" className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white xl:block" aria-label="Read-only invoice directory"><div className="ops-scrollbar overflow-auto"><table className="ops-table min-w-[820px] w-full text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Invoice / vendor</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Review</th><th className="px-4 py-3">Lifecycle</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3 text-right">Open</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((invoice) => { const display = getInvoiceDisplay(invoice, { reportingCurrency: "PHP", financialFxSnapshots }); const paymentState = supplierInvoicePaymentStateFor(invoice, settlementProjections?.get(invoice.id), today); return <tr key={invoice.id}><td className="max-w-[280px] px-4 py-3"><strong className="block truncate text-xs text-slate-900">{display.primaryLabel}</strong><span className="mt-0.5 block truncate text-[10px] text-slate-500">{display.invoiceLabel}</span></td><td className="px-4 py-3 text-[10px] text-slate-600">{display.dateLabel}</td><td className="px-4 py-3 text-right font-bold tabular-nums">{display.amountLabel}{display.amountLabel !== display.currencyLabel && <span className="mt-0.5 block text-[9px] font-semibold text-slate-400">{display.currencyLabel}</span>}</td><td className="px-4 py-3"><StatusBadge tone={invoice.reviewStatus === "VERIFIED" ? "success" : "warning"}>{invoice.reviewStatus === "VERIFIED" ? "Verified" : "Needs review"}</StatusBadge></td><td className="px-4 py-3"><div className="flex flex-wrap gap-1">{invoice.lifecycleStatus === "VOID" && <StatusBadge tone="danger" icon={Ban}>Voided</StatusBadge>}{invoice.archivedAt && <StatusBadge tone="neutral" icon={Archive}>Archived</StatusBadge>}{invoice.lifecycleStatus !== "VOID" && !invoice.archivedAt && <StatusBadge tone="success">Active</StatusBadge>}</div></td><td className="px-4 py-3"><StatusBadge tone={paymentState === "PAID" ? "success" : paymentState === "OVERDUE" ? "danger" : paymentState === "PARTIALLY_PAID" ? "info" : "neutral"}>{paymentState.replaceAll("_", " ")}</StatusBadge></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => onSelectInvoice(invoice)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50"><Eye className="h-3.5 w-3.5" /> Open</button></td></tr>; })}</tbody></table></div></section>
    </> : <EmptyState icon={Files} title={invoices.length ? "No invoices match this search" : "No invoices yet"} description="No invoice records are available for the current view." />}
  </div>;
}
