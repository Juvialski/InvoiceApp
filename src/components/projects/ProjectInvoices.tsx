import React, { useMemo, useState } from "react";
import { AlertCircle, Edit3, ExternalLink, FileText, Filter, Plus, Search, Trash2, X } from "lucide-react";
import type { InvoiceData, InvoiceProjectAllocation, Project } from "../../types.ts";
import { normalizedInvoiceAllocationAmount } from "../../utils/projectCosting.ts";
import { validateInvoiceProjectAllocationSet } from "../../utils/projectAllocations.ts";
import { normalizeProjectText } from "../../utils/projectMatching.ts";
import { ExistingInvoicePicker } from "./ExistingInvoicePicker.tsx";

interface ProjectInvoicesProps {
  project: Project;
  invoices: InvoiceData[];
  allocations: InvoiceProjectAllocation[];
  onOpenInvoice: (invoice: InvoiceData) => void;
  onUploadInvoice?: () => void;
  onSaveAllocations: (invoice: InvoiceData, allocations: InvoiceProjectAllocation[]) => Promise<void>;
}

type AllocationState = "FULLY_ALLOCATED" | "PARTIALLY_ALLOCATED" | "UNALLOCATED";

interface InvoiceRow {
  invoice: InvoiceData;
  linked: InvoiceProjectAllocation[];
  currentAmount: number;
  allocatedAmount: number;
  remainingAmount: number;
  state: AllocationState;
}

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value) || 0); }
  catch { return `${currency} ${(Number(value) || 0).toFixed(2)}`; }
}

function roundMoney(value: number) { return Math.round((Number(value) || 0) * 100) / 100; }

function partyName(invoice: InvoiceData) { return invoice.vendor?.name || invoice.vendor?.registeredName || invoice.vendor?.companyName || invoice.customer?.name || "Unknown party"; }

function allocationAmount(invoice: InvoiceData, allocation: InvoiceProjectAllocation) { return normalizedInvoiceAllocationAmount(invoice.grandTotal, allocation); }

const AllocationEditor: React.FC<{
  project: Project;
  invoice: InvoiceData;
  allocations: InvoiceProjectAllocation[];
  onSave: (allocations: InvoiceProjectAllocation[]) => Promise<void>;
  onClose: () => void;
}> = ({ project, invoice, allocations, onSave, onClose }) => {
  const [draft, setDraft] = useState(allocations);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = draft.filter((allocation) => allocation.projectId === project.id);
  const currentAmount = roundMoney(current.reduce((sum, allocation) => sum + allocationAmount(invoice, allocation), 0));
  const update = (id: string, patch: Partial<InvoiceProjectAllocation>) => setDraft((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const save = async () => {
    const validation = validateInvoiceProjectAllocationSet(invoice.grandTotal, draft);
    if (!validation.valid) { setError(validation.message || "Allocation is invalid."); return; }
    setSaving(true);
    setError(null);
    try { await onSave(draft); onClose(); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Could not save allocation."); }
    finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-[55] flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="edit-project-allocation-title">
    <section className="w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-wide text-indigo-600">Accounting classification</p><h2 id="edit-project-allocation-title" className="mt-1 text-base font-black">Edit allocation for {invoice.invoiceNumber || "invoice"}</h2><p className="mt-1 text-[10px] text-slate-500">Invoice details and verification status are unchanged.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close allocation editor"><X className="h-4 w-4" /></button></header>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5"><div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[10px] text-indigo-900"><span className="font-black">{project.projectCode}</span> · Current project amount {money(currentAmount, invoice.currency || project.currency)}</div>{draft.map((allocation) => { const isCurrent = allocation.projectId === project.id; const amount = allocation.allocationType === "PERCENTAGE" ? allocation.allocationPercentage || 0 : allocation.allocationAmount; const label = isCurrent ? `${project.projectCode} — ${project.projectName}` : `Other project · ${allocation.projectId}`; return <div key={allocation.id} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_150px_32px]"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{label}</p><p className="mt-0.5 text-[10px] text-slate-500">{isCurrent ? "Editable for this project" : "Preserved from another project"}</p></div><div className="flex items-center gap-1"><input disabled={!isCurrent || saving} type="number" min="0" step="0.01" value={amount} onChange={(event) => update(allocation.id, allocation.allocationType === "PERCENTAGE" ? { allocationPercentage: Number(event.target.value), allocationAmount: roundMoney(invoice.grandTotal * Number(event.target.value) / 100) } : { allocationAmount: Number(event.target.value) })} className="min-w-0 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-right text-xs tabular-nums disabled:bg-slate-50" /><select disabled={!isCurrent || saving} value={allocation.allocationType} onChange={(event) => update(allocation.id, { allocationType: event.target.value as InvoiceProjectAllocation["allocationType"], allocationPercentage: event.target.value === "PERCENTAGE" ? Math.round((allocationAmount(invoice, allocation) / Math.max(invoice.grandTotal, 1)) * 10000) / 100 : undefined, allocationAmount: event.target.value === "PERCENTAGE" ? allocationAmount(invoice, allocation) : allocation.allocationAmount })} className="w-16 rounded-lg border border-slate-200 px-1 py-1.5 text-[10px] disabled:bg-slate-50"><option value="AMOUNT">Amount</option><option value="PERCENTAGE">%</option></select></div><button type="button" disabled={!isCurrent || saving} onClick={() => { if (window.confirm("Remove this allocation from the project? Other project allocations will be preserved.")) setDraft((items) => items.filter((item) => item.id !== allocation.id)); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30" aria-label={`Remove allocation for ${label}`}><Trash2 className="h-3.5 w-3.5" /></button></div>; })}{!draft.length && <p className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-500">This invoice is unallocated.</p>}{error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">{error}</p>}</div>
      <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3"><p className="text-[10px] text-slate-500">Changes are audited as project allocation events.</p><div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Cancel</button><button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-black text-white disabled:opacity-50">{saving ? "Saving…" : "Save allocation"}</button></div></footer>
    </section>
  </div>;
};

export const ProjectInvoices: React.FC<ProjectInvoicesProps> = ({ project, invoices, allocations, onOpenInvoice, onUploadInvoice, onSaveAllocations }) => {
  const [query, setQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [allocationFilter, setAllocationFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceData | null>(null);

  const linkedRows = useMemo<InvoiceRow[]>(() => invoices.map((invoice) => {
    const linked = allocations.filter((allocation) => allocation.invoiceId === invoice.id && allocation.projectId === project.id);
    if (!linked.length) return null;
    const all = allocations.filter((allocation) => allocation.invoiceId === invoice.id);
    const currentAmount = roundMoney(linked.reduce((sum, allocation) => sum + allocationAmount(invoice, allocation), 0));
    const allocatedAmount = roundMoney(all.reduce((sum, allocation) => sum + allocationAmount(invoice, allocation), 0));
    const remainingAmount = roundMoney(Math.max(0, (Number(invoice.grandTotal) || 0) - allocatedAmount));
    const state: AllocationState = remainingAmount <= 0.009 ? "FULLY_ALLOCATED" : allocatedAmount <= 0.009 ? "UNALLOCATED" : "PARTIALLY_ALLOCATED";
    return { invoice, linked, currentAmount, allocatedAmount, remainingAmount, state };
  }).filter((row): row is InvoiceRow => Boolean(row)), [invoices, allocations, project.id]);
  const currencies = useMemo(() => Array.from(new Set(linkedRows.map((row) => String(row.invoice.currency || project.currency).toUpperCase()))).sort(), [linkedRows, project.currency]);
  const filteredRows = useMemo(() => linkedRows.filter(({ invoice, state }) => {
    const q = normalizeProjectText(query);
    const haystack = normalizeProjectText([invoice.invoiceNumber, invoice.projectReference, invoice.invoiceDate, partyName(invoice), invoice.status, invoice.reviewStatus].filter(Boolean).join(" "));
    return (!q || q.split(" ").every((token) => haystack.includes(token)))
      && (paymentFilter === "ALL" || String(invoice.status || "UNPAID").toUpperCase() === paymentFilter)
      && (allocationFilter === "ALL" || state === allocationFilter)
      && (currencyFilter === "ALL" || String(invoice.currency || project.currency).toUpperCase() === currencyFilter);
  }), [linkedRows, query, paymentFilter, allocationFilter, currencyFilter, project.currency]);
  const totalsByCurrency = filteredRows.reduce<Record<string, number>>((result, row) => { const currency = String(row.invoice.currency || project.currency).toUpperCase(); result[currency] = (result[currency] || 0) + row.currentAmount; return result; }, {});
  const totalLabel = Object.entries(totalsByCurrency).map(([currency, amount]) => money(Number(amount), currency)).join(" · ") || money(0, project.currency);

  return <>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-black">Project invoices</h3><p className="mt-1 text-xs text-slate-500">Current project amount and remaining invoice capacity stay visible for historical cost review.</p></div><div className="flex flex-wrap gap-2">{onUploadInvoice && <button type="button" onClick={onUploadInvoice} className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700"><Plus className="h-3.5 w-3.5" /> Upload new invoice</button>}<button type="button" onClick={() => setPickerOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white"><Plus className="h-3.5 w-3.5" /> Add existing invoices</button></div></div><div className="mt-4 flex flex-col gap-2 lg:flex-row"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoice, vendor, project reference..." className="w-full bg-transparent text-xs outline-none" /></label><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><Filter className="h-3.5 w-3.5 text-slate-400" /><select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="bg-transparent text-xs font-semibold outline-none"><option value="ALL">All payment states</option><option value="PAID">Paid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="UNPAID">Unpaid</option><option value="OVERDUE">Overdue</option></select></label><select value={allocationFilter} onChange={(event) => setAllocationFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"><option value="ALL">All allocation states</option><option value="FULLY_ALLOCATED">Fully allocated</option><option value="PARTIALLY_ALLOCATED">Partially allocated</option></select><select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"><option value="ALL">All currencies</option>{currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></div></div>{filteredRows.length > 0 && <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-[10px] font-semibold text-slate-500"><span>{filteredRows.length} invoice{filteredRows.length === 1 ? "" : "s"} shown</span><span className="font-black tabular-nums text-slate-700">Current project total {totalLabel}</span></div>}{linkedRows.length > 0 && filteredRows.length === 0 && <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-800"><AlertCircle className="h-3.5 w-3.5" /> No project invoices match these filters.</div>}{filteredRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Vendor / invoice</th><th className="px-5 py-3">Reference / date</th><th className="px-5 py-3">Allocation state</th><th className="px-5 py-3 text-right">Current project amount</th><th className="px-5 py-3 text-right">Remaining invoice amount</th><th className="px-5 py-3">Payment / review</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{filteredRows.map((row) => <tr key={row.invoice.id} className="hover:bg-slate-50"><td className="px-5 py-3"><p className="font-bold">{partyName(row.invoice)}</p><p className="text-[10px] text-slate-500">{row.invoice.invoiceNumber || "No invoice number"}</p></td><td className="px-5 py-3 text-slate-600"><p>{row.invoice.projectReference || "No project reference"}</p><p className="text-[10px] text-slate-400">{row.invoice.invoiceDate || "Date not recorded"}</p></td><td className="px-5 py-3"><span className={`font-black ${row.state === "FULLY_ALLOCATED" ? "text-emerald-700" : "text-amber-700"}`}>{row.state === "FULLY_ALLOCATED" ? "Fully allocated" : "Partially allocated"}</span><p className="text-[10px] text-slate-400">{money(row.allocatedAmount, row.invoice.currency || project.currency)} of {money(row.invoice.grandTotal, row.invoice.currency || project.currency)} across projects</p></td><td className="px-5 py-3 text-right font-black tabular-nums">{money(row.currentAmount, row.invoice.currency || project.currency)}</td><td className="px-5 py-3 text-right font-black tabular-nums text-slate-600">{money(row.remainingAmount, row.invoice.currency || project.currency)}</td><td className="px-5 py-3 text-[10px] font-bold text-slate-600">{(row.invoice.status || "UNPAID").replaceAll("_", " ")} · <span className={row.invoice.reviewStatus === "VERIFIED" ? "text-emerald-700" : "text-amber-700"}>{row.invoice.reviewStatus === "VERIFIED" ? "Verified" : "Needs review"}</span></td><td className="px-5 py-3"><div className="flex items-center justify-end gap-1"><button type="button" onClick={() => onOpenInvoice(row.invoice)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" aria-label="Open invoice"><ExternalLink className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setEditingInvoice(row.invoice)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Edit allocation"><Edit3 className="h-3.5 w-3.5" /></button><button type="button" onClick={() => { if (window.confirm("Remove this invoice from the project? Allocations to other projects will be preserved.")) void onSaveAllocations(row.invoice, allocations.filter((allocation) => allocation.invoiceId !== row.invoice.id || allocation.projectId !== project.id)).catch(() => undefined); }} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label="Remove invoice from this project"><Trash2 className="h-3.5 w-3.5" /></button></div></td></tr>)}</tbody></table></div> : <div className="p-10 text-center"><FileText className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">{linkedRows.length ? "No invoices match these filters." : "No invoices assigned to this project."}</p><p className="mt-1 text-xs text-slate-500">Add existing invoices using their remaining capacity, or upload a new project-context invoice.</p></div>}</section>
    {pickerOpen && <ExistingInvoicePicker project={project} invoices={invoices} allocations={allocations} onAssign={onSaveAllocations} onClose={() => setPickerOpen(false)} />}
    {editingInvoice && <AllocationEditor project={project} invoice={editingInvoice} allocations={allocations.filter((allocation) => allocation.invoiceId === editingInvoice.id)} onSave={onSaveAllocations} onClose={() => setEditingInvoice(null)} />}
  </>;
};
