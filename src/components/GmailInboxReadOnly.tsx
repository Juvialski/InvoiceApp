import React, { useMemo } from "react";
import { FileText, Mail, ShieldCheck } from "lucide-react";
import type { GmailConnectionInfo, InvoiceData } from "../types.ts";
import { getInvoiceDisplay } from "../utils/invoiceDisplay.ts";
import { PageHeader, StatusBadge } from "./ui/OperationsUI.tsx";

export function GmailInboxReadOnly({ invoices, connection, onOpenInvoice }: { invoices: InvoiceData[]; connection: GmailConnectionInfo; onOpenInvoice: (invoice: InvoiceData) => void }) {
  const emailInvoices = useMemo(() => invoices.filter((invoice) => invoice.sourceType === "EMAIL").slice(0, 20), [invoices]);
  return <div className="space-y-5">
    <PageHeader eyebrow="Operational intake" title="Gmail inbox" description="Read-only mailbox intake view. Connection, sync, import, and classification controls require Gmail management permission." />
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Mail className="h-5 w-5" /></div><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-black">{connection.hasGmailToken ? "Gmail connected" : "Gmail connection"}</h3><StatusBadge tone={connection.hasGmailToken ? "success" : "neutral"}>{connection.hasGmailToken ? "Read only" : "Not connected"}</StatusBadge></div><p className="mt-1 text-xs text-slate-500">{connection.email || "No connected mailbox is visible for this company."}</p></div></div><div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />Your role can inspect imported Gmail invoice records but cannot change mailbox authorization or sync state.</div></section>
    {emailInvoices.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-black">Recently imported from email</h3><div className="mt-3 grid gap-2 md:grid-cols-2">{emailInvoices.map((invoice) => { const display = getInvoiceDisplay(invoice); return <button key={invoice.id} type="button" onClick={() => onOpenInvoice(invoice)} className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /><span className="min-w-0"><strong className="block truncate text-xs">{display.primaryLabel}</strong><span className="mt-0.5 block truncate text-[10px] text-slate-500">{display.invoiceLabel} · {display.totalLabel}</span></span></button>; })}</div></section>}
  </div>;
}
