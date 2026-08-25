import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2, FileSearch } from "lucide-react";
import type { InvoiceData } from "../types";
import { getInvoiceDisplay } from "../utils/invoiceDisplay";
import { EmptyState, PageHeader, StatusBadge } from "./ui/OperationsUI";

interface ReviewQueueProps {
  invoices: InvoiceData[];
  onOpenInvoice: (invoice: InvoiceData) => void;
  onStartReview?: (queue: InvoiceData[]) => void;
}

function reasonBadges(invoice: InvoiceData) {
  const issues = invoice.validation?.issues || [];
  const criticalMissing = invoice.extractionQuality?.criticalMissing || [];
  const display = getInvoiceDisplay(invoice);
  const badges: string[] = [];
  const add = (label: string) => { if (label && !badges.includes(label)) badges.push(label); };
  if (invoice.duplicateStatus === "POSSIBLE_DUPLICATE") add("Potential duplicate");
  if (!display.vendorKnown) add("Missing vendor");
  if (!display.currencyKnown) add("Missing currency");
  if (!display.amountKnown) add("Missing amount");
  const criticalLabels: Record<string, string> = { "missing-document-type": "Missing document type", "missing-invoice-number": "Missing invoice number", "missing-invoice-date": "Missing invoice date", "missing-vendor": "Missing vendor", "missing-customer": "Missing customer", "missing-currency": "Missing currency", "missing-line-items": "Missing line items", "missing-grand-total": "Missing amount", "missing-vat-amount": "Missing VAT amount" };
  criticalMissing.forEach((reason) => add(criticalLabels[reason] || "Extraction needs review"));
  for (const issue of issues) {
    const message = `${issue.id} ${issue.field} ${issue.message}`.toLowerCase();
    if (message.includes("currency")) add("Missing currency");
    else if (message.includes("tin") || message.includes("taxid")) add("Missing TIN");
    else if (message.includes("invoice number")) add("Missing invoice number");
    else if (message.includes("invoice date")) add("Missing invoice date");
    else if (message.includes("vat")) add("VAT mismatch");
    else if (message.includes("line") || message.includes("subtotal") || message.includes("grand total") || message.includes("balance") || message.includes("reconcil")) add("Math mismatch");
    else { const fieldLabel = issue.field.split(".").pop()?.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2"); add(fieldLabel ? `${fieldLabel.charAt(0).toUpperCase()}${fieldLabel.slice(1)} check` : "Validation review"); }
  }
  if (invoice.confidenceScore !== undefined && invoice.confidenceScore < 90) add("Low confidence");
  if (!badges.length) add("Extraction needs review");
  return badges.slice(0, 3);
}

export const ReviewQueue: React.FC<ReviewQueueProps> = ({ invoices, onOpenInvoice, onStartReview }) => {
  const queue = useMemo(() => invoices.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW"), [invoices]);
  if (!queue.length) return <div className="space-y-5"><PageHeader eyebrow="Human verification" title="Review queue" description="Review the original source alongside the extraction, correct anything needed, then verify the record." /><EmptyState icon={CheckCircle2} title="Review queue is clear" description="New Gmail and uploaded invoices with uncertainty or validation issues will appear here." /></div>;

  return <div className="space-y-5">
    <PageHeader eyebrow="Human verification" title="Review queue" description="Review the original source alongside the extraction, correct anything needed, then verify the record." actions={<><span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900"><AlertTriangle className="h-3.5 w-3.5" /> {queue.length} awaiting action</span>{onStartReview && <button type="button" onClick={() => onStartReview(queue)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"><FileSearch className="h-3.5 w-3.5" /> Start review</button>}</>} />
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Invoices awaiting review">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Next records to verify</p></div>
      <div className="divide-y divide-slate-100">{queue.map((invoice) => {
        const display = getInvoiceDisplay(invoice);
        const reasons = reasonBadges(invoice);
        return <article key={invoice.id} className="flex flex-col gap-4 px-4 py-4 transition hover:bg-slate-50 lg:flex-row lg:items-center lg:px-5"><div className="flex min-w-0 flex-1 items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><FileSearch className="h-4 w-4" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-black text-slate-900">{display.primaryLabel}</h2><StatusBadge tone="warning" icon={AlertTriangle}>Needs review</StatusBadge></div><p className="mt-1 truncate text-[10px] text-slate-600">{display.invoiceLabel} · {display.dateLabel}</p><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600"><span className="font-sans font-bold tabular-nums">{display.amountLabel}</span>{display.projectKnown && <span className="truncate">{display.projectReference ? `Project: ${display.projectLabel}` : `PO: ${display.projectLabel}`}</span>}<span className="truncate text-slate-400">{display.sourceLabel} · {display.sourceFileLabel}</span></div><div className="mt-2 flex flex-wrap gap-1.5">{reasons.map((reason) => <span key={reason}><StatusBadge tone={reason === "Potential duplicate" ? "danger" : "warning"}>{reason}</StatusBadge></span>)}</div></div></div><button type="button" onClick={() => onOpenInvoice(invoice)} className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 lg:self-center"><FileSearch className="h-3.5 w-3.5" /> Open &amp; review</button></article>;
      })}</div>
    </section>
  </div>;
};
