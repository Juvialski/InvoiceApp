import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2, FileSearch } from "lucide-react";
import { InvoiceData } from "../types";
import { getInvoiceDisplay } from "../utils/invoiceDisplay";

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
  const add = (label: string) => {
    if (label && !badges.includes(label)) badges.push(label);
  };

  if (invoice.duplicateStatus === "POSSIBLE_DUPLICATE") add("Potential duplicate");
  if (!display.vendorKnown) add("Missing vendor");
  if (!display.currencyKnown) add("Missing currency");
  if (!display.amountKnown) add("Missing amount");

  const criticalLabels: Record<string, string> = {
    "missing-document-type": "Missing document type",
    "missing-invoice-number": "Missing invoice number",
    "missing-invoice-date": "Missing invoice date",
    "missing-vendor": "Missing vendor",
    "missing-customer": "Missing customer",
    "missing-currency": "Missing currency",
    "missing-line-items": "Missing line items",
    "missing-grand-total": "Missing amount",
    "missing-vat-amount": "Missing VAT amount",
  };
  criticalMissing.forEach((reason) => add(criticalLabels[reason] || "Extraction needs review"));

  for (const issue of issues) {
    const message = `${issue.id} ${issue.field} ${issue.message}`.toLowerCase();
    if (message.includes("currency")) add("Missing currency");
    else if (message.includes("tin") || message.includes("taxid")) add("Missing TIN");
    else if (message.includes("invoice number")) add("Missing invoice number");
    else if (message.includes("invoice date")) add("Missing invoice date");
    else if (message.includes("vat")) add("VAT mismatch");
    else if (message.includes("line") || message.includes("subtotal") || message.includes("grand total") || message.includes("balance") || message.includes("reconcil")) add("Math mismatch");
    else {
      const fieldLabel = issue.field.split(".").pop()?.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
      add(fieldLabel ? `${fieldLabel.charAt(0).toUpperCase()}${fieldLabel.slice(1)} check` : "Validation review");
    }
  }
  if (invoice.confidenceScore !== undefined && invoice.confidenceScore < 90) add("Low confidence");
  if (!badges.length) add("Extraction needs review");
  return badges.slice(0, 3);
}

export const ReviewQueue: React.FC<ReviewQueueProps> = ({ invoices, onOpenInvoice, onStartReview }) => {
  const queue = useMemo(() => invoices.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW"), [invoices]);

  if (!queue.length) {
    return <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm"><CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" /><h2 className="mt-3 text-lg font-black">No invoices need review.</h2><p className="text-xs text-slate-500 mt-1">New Gmail and uploaded invoices with uncertainty or validation issues will appear here.</p></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"><div><h2 className="text-xl font-black">Human verification queue</h2><p className="text-xs text-slate-500 mt-1">Original documents stay immutable. Review the AI extraction, correct anything needed, then verify.</p></div><div className="flex items-center gap-2"><span className="text-xs font-black px-3 py-1.5 rounded-full bg-amber-100 text-amber-800">{queue.length} need review</span>{onStartReview && <button onClick={() => onStartReview(queue)} className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700">Start Review</button>}</div></div>
      <div className="grid gap-3">
        {queue.map((invoice) => {
          const display = getInvoiceDisplay(invoice);
          const reasons = reasonBadges(invoice);
          return <div key={invoice.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0"><FileSearch className="w-5 h-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap"><h3 className="text-sm font-black text-slate-900 truncate">{display.primaryLabel}</h3><span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Needs review</span></div>
              <p className="text-xs text-slate-600 font-sans tabular-nums mt-1 truncate">{display.invoiceLabel} • {display.dateLabel}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-600">
                <span className="font-sans tabular-nums font-semibold">{display.amountLabel}</span>
                {display.projectKnown && <span className="truncate">{display.projectReference ? `Project: ${display.projectLabel}` : `PO: ${display.projectLabel}`}</span>}
              </div>
              <p className="text-[10px] text-slate-400 mt-1 truncate">Source: {display.sourceLabel} • {display.sourceFileLabel}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-amber-700" />{reasons.map((reason) => <span key={reason} className="text-[9px] font-black px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-100">{reason}</span>)}</div>
            </div>
            <div className="flex gap-2"><button onClick={() => onOpenInvoice(invoice)} className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-indigo-700"><FileSearch className="w-3.5 h-3.5" />Open &amp; Review</button></div>
          </div>;
        })}
      </div>
    </div>
  );
};
