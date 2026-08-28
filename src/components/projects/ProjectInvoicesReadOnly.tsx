import React, { useMemo } from "react";
import { ExternalLink, FileText } from "lucide-react";
import type { InvoiceData, InvoiceProjectAllocation, Project } from "../../types.ts";
import { normalizedInvoiceAllocationAmount } from "../../utils/projectCosting.ts";

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value) || 0); }
  catch { return `${currency} ${(Number(value) || 0).toFixed(2)}`; }
}

function partyName(invoice: InvoiceData) {
  return invoice.vendor?.name || invoice.vendor?.registeredName || invoice.vendor?.companyName || invoice.customer?.name || "Unknown party";
}

export function ProjectInvoicesReadOnly({ project, invoices, allocations, onOpenInvoice }: { project: Project; invoices: InvoiceData[]; allocations: InvoiceProjectAllocation[]; onOpenInvoice: (invoice: InvoiceData) => void }) {
  const rows = useMemo(() => invoices.flatMap((invoice) => {
    const linked = allocations.filter((allocation) => allocation.invoiceId === invoice.id && allocation.projectId === project.id);
    if (!linked.length) return [];
    const amount = linked.reduce((sum, allocation) => sum + normalizedInvoiceAllocationAmount(invoice.grandTotal, allocation), 0);
    return [{ invoice, amount }];
  }), [allocations, invoices, project.id]);

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 p-5"><h3 className="text-sm font-black">Project invoices</h3><p className="mt-1 text-xs text-slate-500">Read-only project allocations. Your role can inspect invoice cost but cannot change project allocation records.</p></div>
    {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Vendor / invoice</th><th className="px-5 py-3">Date</th><th className="px-5 py-3 text-right">Project amount</th><th className="px-5 py-3">Review</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(({ invoice, amount }) => <tr key={invoice.id}><td className="px-5 py-3"><p className="font-bold">{partyName(invoice)}</p><p className="text-[10px] text-slate-500">{invoice.invoiceNumber || "No invoice number"}</p></td><td className="px-5 py-3 text-slate-600">{invoice.invoiceDate || "Not recorded"}</td><td className="px-5 py-3 text-right font-black tabular-nums">{money(amount, invoice.currency || project.currency)}</td><td className="px-5 py-3 text-[10px] font-bold">{invoice.reviewStatus === "VERIFIED" ? "Verified" : "Needs review"}</td><td className="px-5 py-3 text-right"><button type="button" onClick={() => onOpenInvoice(invoice)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" aria-label="Open invoice"><ExternalLink className="h-3.5 w-3.5" /></button></td></tr>)}</tbody></table></div> : <div className="p-10 text-center"><FileText className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No invoices assigned to this project.</p></div>}
  </section>;
}
