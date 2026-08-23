import React, { useMemo, useState } from "react";
import { AlertCircle, ExternalLink, FileText, Filter, Plus, Search } from "lucide-react";
import { normalizeProjectText } from "../../utils/projectMatching.ts";

interface ProjectView { id: string; projectCode: string; projectName: string; currency: string; }
interface InvoiceView {
  id: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  projectReference?: string;
  currency?: string;
  grandTotal: number;
  status?: string;
  reviewStatus?: string;
  vendor?: { name?: string; registeredName?: string; companyName?: string };
  customer?: { name?: string; companyName?: string };
}
interface AllocationView { id: string; invoiceId: string; projectId: string; allocationType?: "AMOUNT" | "PERCENTAGE" | string; allocationPercentage?: number; allocationAmount: number; }

interface ProjectInvoicesProps {
  project: ProjectView;
  invoices: InvoiceView[];
  allocations: AllocationView[];
  onOpenInvoice: (invoice: InvoiceView) => void;
  onUploadInvoice?: () => void;
}

function money(value: number, currency: string): string {
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value) || 0); }
  catch { return `${currency} ${(Number(value) || 0).toFixed(2)}`; }
}

function allocationAmount(invoice: InvoiceView, allocation: AllocationView): number {
  return String(allocation.allocationType || "AMOUNT").toUpperCase() === "PERCENTAGE"
    ? (Number(invoice.grandTotal) || 0) * (Number(allocation.allocationPercentage) || 0) / 100
    : Number(allocation.allocationAmount) || 0;
}

export const ProjectInvoices: React.FC<ProjectInvoicesProps> = ({ project, invoices, allocations, onOpenInvoice, onUploadInvoice }) => {
  const [query, setQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [allocationFilter, setAllocationFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const linkedRows = useMemo(() => invoices.map((invoice) => {
    const linked = allocations.filter((allocation) => allocation.invoiceId === invoice.id && allocation.projectId === project.id);
    if (!linked.length) return null;
    const amount = linked.length ? linked.reduce((sum, allocation) => sum + allocationAmount(invoice, allocation), 0) : null;
    const allocationState = amount === null ? "UNALLOCATED" : amount + 0.005 >= invoice.grandTotal ? "ALLOCATED" : "PARTIAL";
    return { invoice, linked, amount, allocationState };
  }).filter((row): row is { invoice: InvoiceView; linked: AllocationView[]; amount: number | null; allocationState: "ALLOCATED" | "PARTIAL" | "UNALLOCATED" } => Boolean(row)), [invoices, allocations, project]);
  const currencies = useMemo(() => Array.from(new Set(linkedRows.map((row) => String(row.invoice.currency || project.currency).toUpperCase()))).sort(), [linkedRows, project.currency]);
  const filteredRows = useMemo(() => linkedRows.filter(({ invoice, allocationState }) => {
    const q = normalizeProjectText(query);
    const haystack = normalizeProjectText([invoice.invoiceNumber, invoice.projectReference, invoice.vendor?.name, invoice.vendor?.registeredName, invoice.vendor?.companyName, invoice.customer?.name, invoice.customer?.companyName, invoice.status, invoice.reviewStatus].filter(Boolean).join(" "));
    return (!q || q.split(" ").every((token) => haystack.includes(token)))
      && (paymentFilter === "ALL" || String(invoice.status || "UNPAID").toUpperCase() === paymentFilter)
      && (allocationFilter === "ALL" || allocationState === allocationFilter)
      && (currencyFilter === "ALL" || String(invoice.currency || project.currency).toUpperCase() === currencyFilter);
  }), [linkedRows, query, paymentFilter, allocationFilter, currencyFilter, project.currency]);
  const totalsByCurrency = filteredRows.reduce<Record<string, number>>((result, row) => {
    const code = String(row.invoice.currency || project.currency).toUpperCase();
    result[code] = (result[code] || 0) + (row.amount ?? 0);
    return result;
  }, {});
  const totalLabel = (Object.entries(totalsByCurrency) as Array<[string, number]>).map(([currency, amount]) => money(Number(amount), currency)).join(" • ") || money(0, project.currency);

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-black">Project invoices</h3><p className="mt-1 text-xs text-slate-500">Allocated portions contribute to project cost; reference-only matches stay visible for review.</p></div>{onUploadInvoice && <button type="button" onClick={onUploadInvoice} className="inline-flex items-center gap-1.5 self-start rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" /> Upload invoice</button>}</div><div className="mt-4 flex flex-col gap-2 lg:flex-row"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoice, vendor, project reference..." className="w-full bg-transparent text-xs outline-none" /></label><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><Filter className="h-3.5 w-3.5 text-slate-400" /><select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="bg-transparent text-xs font-semibold outline-none"><option value="ALL">All payment states</option><option value="PAID">Paid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="UNPAID">Unpaid</option><option value="OVERDUE">Overdue</option></select></label><select value={allocationFilter} onChange={(event) => setAllocationFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"><option value="ALL">All allocation states</option><option value="ALLOCATED">Fully allocated</option><option value="PARTIAL">Partially allocated</option><option value="UNALLOCATED">Needs allocation</option></select><select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"><option value="ALL">All currencies</option>{currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></div></div>{filteredRows.length > 0 && <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-[10px] font-semibold text-slate-500"><span>{filteredRows.length} invoice{filteredRows.length === 1 ? "" : "s"} shown</span><span className="font-black tabular-nums text-slate-700">Allocated total {totalLabel}</span></div>}{linkedRows.length > 0 && filteredRows.length === 0 && <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-800"><AlertCircle className="h-3.5 w-3.5" /> No project invoices match these filters.</div>}{filteredRows.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Vendor / invoice</th><th className="px-5 py-3">Reference / date</th><th className="px-5 py-3">Allocation</th><th className="px-5 py-3">Invoice total</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3">Review</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{filteredRows.map(({ invoice, linked, amount, allocationState }) => <tr key={invoice.id} className="hover:bg-slate-50"><td className="px-5 py-3"><p className="font-bold">{invoice.vendor?.name || invoice.vendor?.registeredName || invoice.vendor?.companyName || invoice.customer?.name || "Unknown party"}</p><p className="text-[10px] text-slate-500">{invoice.invoiceNumber || "No invoice number"}</p></td><td className="px-5 py-3 text-slate-600"><p>{invoice.projectReference || "No project reference"}</p><p className="text-[10px] text-slate-400">{invoice.invoiceDate || "Date not recorded"}</p></td><td className="px-5 py-3 font-black tabular-nums"><span className={allocationState === "ALLOCATED" ? "text-emerald-700" : allocationState === "PARTIAL" ? "text-amber-700" : "text-slate-600"}>{allocationState === "ALLOCATED" ? "Fully allocated" : allocationState === "PARTIAL" ? `${money(amount || 0, invoice.currency || project.currency)} allocated` : "Unallocated reference match"}</span><p className="text-[10px] font-normal text-slate-400">{linked.length ? `${linked.length} allocation record${linked.length === 1 ? "" : "s"}` : "Review before posting cost"}</p></td><td className="px-5 py-3 text-slate-600 tabular-nums">{money(invoice.grandTotal, invoice.currency || project.currency)}</td><td className="px-5 py-3 text-[10px] font-bold text-slate-600">{(invoice.status || "UNPAID").replaceAll("_", " ")}</td><td className="px-5 py-3"><span className={`text-[10px] font-bold ${invoice.reviewStatus === "VERIFIED" ? "text-emerald-700" : "text-amber-700"}`}>{invoice.reviewStatus === "VERIFIED" ? "Verified" : "Needs review"}</span></td><td className="px-5 py-3 text-right"><button type="button" onClick={() => onOpenInvoice(invoice)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" aria-label="Open invoice"><ExternalLink className="h-3.5 w-3.5" /></button></td></tr>)}</tbody></table></div> : <div className="p-10 text-center"><FileText className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">{linkedRows.length ? "No invoices match these filters." : "No invoices assigned to this project."}</p><p className="mt-1 text-xs text-slate-500">{linkedRows.length ? "Try a broader invoice, payment, currency, or allocation filter." : "Assign an existing invoice or upload one from this workspace. Reference-only matches are shown once a project reference is present."}</p></div>}</section>;
};
