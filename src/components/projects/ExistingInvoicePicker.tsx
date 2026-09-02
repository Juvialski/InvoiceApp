import React, { useMemo, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Loader2, Search, X } from "lucide-react";
import type { InvoiceData, InvoiceProjectAllocation, Project, ProjectCostCode } from "../../types.ts";
import { normalizeProjectText } from "../../utils/projectMatching.ts";
import { normalizedInvoiceAllocationAmount } from "../../utils/projectCosting.ts";
import { deterministicLocalInvoiceAllocationId, remainingInvoiceAllocatableAmount } from "../../utils/projectAllocations.ts";
import { formatCostCodeOptionLabel, getSelectableCostCodes } from "../../lib/projectCostCodes.ts";

interface ExistingInvoicePickerProps {
  project: Project;
  invoices: InvoiceData[];
  allocations: InvoiceProjectAllocation[];
  costCodes?: ProjectCostCode[];
  onAssign: (invoice: InvoiceData, allocations: InvoiceProjectAllocation[]) => Promise<void>;
  onClose: () => void;
}

type AllocationFilter = "AVAILABLE" | "ALL";
type ReviewFilter = "ALL" | "VERIFIED" | "NEEDS_REVIEW";

interface PickerRow {
  invoice: InvoiceData;
  allocations: InvoiceProjectAllocation[];
  currentProjectAllocations: InvoiceProjectAllocation[];
  allocatedAmount: number;
  currentProjectAmount: number;
  remainingAmount: number;
}

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value) || 0); }
  catch { return `${currency} ${(Number(value) || 0).toFixed(2)}`; }
}

function roundMoney(value: number) { return Math.round((Number(value) || 0) * 100) / 100; }

function vendorName(invoice: InvoiceData) {
  return invoice.vendor?.name || invoice.vendor?.registeredName || invoice.vendor?.companyName || invoice.customer?.name || "Unknown party";
}

function buildAssignment(
  invoice: InvoiceData,
  project: Project,
  allAllocations: InvoiceProjectAllocation[],
  amount: number,
  costCodeId?: string,
) {
  const current = allAllocations.filter((allocation) => allocation.projectId === project.id);
  const other = allAllocations.filter((allocation) => allocation.projectId !== project.id);
  const currentAmount = current.reduce((sum, allocation) => sum + normalizedInvoiceAllocationAmount(invoice.grandTotal, allocation), 0);
  const nextCurrent: InvoiceProjectAllocation = {
    ...(current[0] || {}),
    id: current[0]?.id || deterministicLocalInvoiceAllocationId(invoice.id, project.id),
    invoiceId: invoice.id,
    projectId: project.id,
    projectCostCodeId: costCodeId !== undefined ? (costCodeId || undefined) : current[0]?.projectCostCodeId,
    allocationType: "AMOUNT",
    allocationAmount: roundMoney(currentAmount + amount),
    allocationPercentage: undefined,
  };
  return [...other, nextCurrent];
}

export const ExistingInvoicePicker: React.FC<ExistingInvoicePickerProps> = ({ project, invoices, allocations, costCodes = [], onAssign, onClose }) => {
  const [query, setQuery] = useState("");
  const [allocationFilter, setAllocationFilter] = useState<AllocationFilter>("AVAILABLE");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [selectedCostCodes, setSelectedCostCodes] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ succeeded: number; failed: Array<{ invoice: InvoiceData; message: string }> } | null>(null);

  const rows = useMemo<PickerRow[]>(() => invoices.map((invoice) => {
    const invoiceAllocations = allocations.filter((allocation) => allocation.invoiceId === invoice.id);
    const currentProjectAllocations = invoiceAllocations.filter((allocation) => allocation.projectId === project.id);
    const allocatedAmount = roundMoney(invoiceAllocations.reduce((sum, allocation) => sum + normalizedInvoiceAllocationAmount(invoice.grandTotal, allocation), 0));
    const currentProjectAmount = roundMoney(currentProjectAllocations.reduce((sum, allocation) => sum + normalizedInvoiceAllocationAmount(invoice.grandTotal, allocation), 0));
    return { invoice, allocations: invoiceAllocations, currentProjectAllocations, allocatedAmount, currentProjectAmount, remainingAmount: remainingInvoiceAllocatableAmount(invoice.grandTotal, invoiceAllocations) };
  }), [invoices, allocations, project.id]);

  const currencies = useMemo(() => Array.from(new Set(rows.map((row) => String(row.invoice.currency || project.currency).toUpperCase()))).sort(), [rows, project.currency]);
  const filteredRows = useMemo(() => rows.filter((row) => {
    const invoice = row.invoice;
    const q = normalizeProjectText(query);
    const haystack = normalizeProjectText([
      invoice.invoiceNumber,
      invoice.invoiceDate,
      invoice.projectReference,
      vendorName(invoice),
      invoice.currency,
      invoice.status,
      invoice.reviewStatus,
      row.allocatedAmount,
      row.remainingAmount,
    ].filter(Boolean).join(" "));
    return (!q || q.split(" ").every((token) => haystack.includes(token)))
      && (allocationFilter === "ALL" || row.remainingAmount > 0.009)
      && (reviewFilter === "ALL" || invoice.reviewStatus === reviewFilter)
      && (currencyFilter === "ALL" || String(invoice.currency || project.currency).toUpperCase() === currencyFilter);
  }), [rows, query, allocationFilter, reviewFilter, currencyFilter, project.currency]);

  const selectedRows = filteredRows.filter((row) => selectedIds.has(row.invoice.id));
  const selectedCount = selectedRows.length;

  const toggleSelected = (row: PickerRow) => {
    if (row.remainingAmount <= 0.009) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(row.invoice.id)) next.delete(row.invoice.id);
      else {
        next.add(row.invoice.id);
        setAmounts((values) => ({ ...values, [row.invoice.id]: values[row.invoice.id] ?? row.remainingAmount }));
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    const selectable = filteredRows.filter((row) => row.remainingAmount > 0.009);
    setSelectedIds(new Set(selectable.map((row) => row.invoice.id)));
    setAmounts((current) => Object.fromEntries(selectable.map((row) => [row.invoice.id, current[row.invoice.id] ?? row.remainingAmount])));
  };

  const assignSelected = async () => {
    if (!selectedRows.length) return;
    setSaving(true);
    setError(null);
    setResult(null);
    const failed: Array<{ invoice: InvoiceData; message: string }> = [];
    let succeeded = 0;
    for (const row of selectedRows) {
      const amount = roundMoney(amounts[row.invoice.id] ?? row.remainingAmount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > row.remainingAmount + 0.009) {
        failed.push({ invoice: row.invoice, message: `Enter an amount between 0 and ${money(row.remainingAmount, row.invoice.currency || project.currency)}.` });
        continue;
      }
      try {
        await onAssign(row.invoice, buildAssignment(row.invoice, project, row.allocations, amount, selectedCostCodes[row.invoice.id]));
        succeeded += 1;
      } catch (assignmentError) {
        failed.push({ invoice: row.invoice, message: assignmentError instanceof Error ? assignmentError.message : "Could not assign this invoice." });
      }
    }
    setSaving(false);
    setResult({ succeeded, failed });
    if (!failed.length) {
      setSelectedIds(new Set());
      setAmounts({});
      setSelectedCostCodes({});
    } else if (!succeeded) {
      setError("No invoices were assigned. Existing allocations were left unchanged.");
    }
  };

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="existing-invoices-title">
    <section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Project allocation</p><h2 id="existing-invoices-title" className="mt-1 text-lg font-black text-slate-950">Add existing invoices to {project.projectCode}</h2><p className="mt-1 text-xs text-slate-500">Each selected invoice defaults to its remaining allocatable amount. Other project allocations stay unchanged.</p></div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close invoice picker"><X className="h-5 w-5" /></button>
      </header>
      <div className="grid gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:px-6">
        <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoice, vendor, reference, amount..." className="w-full bg-transparent text-xs outline-none" aria-label="Search existing invoices" /></label>
        <select value={allocationFilter} onChange={(event) => setAllocationFilter(event.target.value as AllocationFilter)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"><option value="AVAILABLE">Available amount</option><option value="ALL">All invoices</option></select>
        <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as ReviewFilter)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"><option value="ALL">All review states</option><option value="VERIFIED">Verified</option><option value="NEEDS_REVIEW">Needs review</option></select>
        <select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"><option value="ALL">All currencies</option>{currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-[10px] sm:px-6"><div className="flex items-center gap-3"><button type="button" onClick={selectAllVisible} className="font-black text-indigo-700 hover:text-indigo-900">Select all visible</button><span className="font-semibold text-slate-500">{filteredRows.length} invoice{filteredRows.length === 1 ? "" : "s"} shown</span></div><span className="font-black text-slate-700">{selectedCount} selected</span></div>
      <div className="min-h-0 flex-1 overflow-auto">
        {filteredRows.length ? <table className="w-full min-w-[950px] text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="w-10 px-4 py-3 sm:px-6"><span className="sr-only">Select</span></th><th className="px-3 py-3">Invoice / vendor</th><th className="px-3 py-3">Date / reference</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Invoice total</th><th className="px-3 py-3 text-right">Allocated</th><th className="px-3 py-3 text-right">Remaining</th><th className="px-3 py-3">Cost code</th><th className="px-3 py-3 text-right">Assign</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredRows.map((row) => { const selected = selectedIds.has(row.invoice.id); const disabled = row.remainingAmount <= 0.009; const currentCodeId = selectedCostCodes[row.invoice.id] ?? row.currentProjectAllocations[0]?.projectCostCodeId; const selectableCodes = getSelectableCostCodes(costCodes, project.id, currentCodeId); return <tr key={row.invoice.id} className={`${disabled ? "bg-slate-50 text-slate-400" : selected ? "bg-indigo-50/60" : "hover:bg-slate-50"}`}><td className="px-4 py-3 sm:px-6"><button type="button" onClick={() => toggleSelected(row)} disabled={disabled} className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-transparent"} disabled:cursor-not-allowed disabled:opacity-50`} aria-label={selected ? `Deselect ${row.invoice.invoiceNumber || "invoice"}` : `Select ${row.invoice.invoiceNumber || "invoice"}`}><Check className="h-3.5 w-3.5" /></button></td><td className="px-3 py-3"><p className="font-black text-slate-800">{row.invoice.invoiceNumber || "No invoice number"}</p><p className="mt-0.5 max-w-[230px] truncate text-[10px] text-slate-500">{vendorName(row.invoice)}</p>{row.currentProjectAmount > 0 && <p className="mt-0.5 text-[10px] font-bold text-indigo-600">Already on this project: {money(row.currentProjectAmount, row.invoice.currency || project.currency)}</p>}</td><td className="px-3 py-3 text-slate-600"><p>{row.invoice.invoiceDate || "Date not recorded"}</p><p className="max-w-[180px] truncate text-[10px] text-slate-400">{row.invoice.projectReference || "No project reference"}</p></td><td className="px-3 py-3"><p className={row.invoice.reviewStatus === "VERIFIED" ? "font-bold text-emerald-700" : "font-bold text-amber-700"}>{row.invoice.reviewStatus === "VERIFIED" ? "Verified" : "Needs review"}</p><p className="text-[10px] text-slate-500">{(row.invoice.status || "UNPAID").replaceAll("_", " ")}{disabled ? " · Fully allocated" : ""}</p></td><td className="px-3 py-3 text-right tabular-nums">{money(row.invoice.grandTotal, row.invoice.currency || project.currency)}</td><td className="px-3 py-3 text-right tabular-nums text-slate-600">{money(row.allocatedAmount, row.invoice.currency || project.currency)}</td><td className={`px-3 py-3 text-right font-black tabular-nums ${disabled ? "text-slate-400" : "text-emerald-700"}`}>{money(row.remainingAmount, row.invoice.currency || project.currency)}</td><td className="px-3 py-3">{selected ? <select aria-label={`Cost code for ${row.invoice.invoiceNumber || "invoice"}`} value={selectedCostCodes[row.invoice.id] || ""} onChange={(event) => setSelectedCostCodes((current) => ({ ...current, [row.invoice.id]: event.target.value || undefined }))} className="w-full min-w-[120px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px]"><option value="">Uncoded</option>{selectableCodes.map((cc) => <option key={cc.id} value={cc.id}>{formatCostCodeOptionLabel(cc)}</option>)}</select> : <span className="text-[10px] text-slate-400">{row.currentProjectAllocations[0]?.projectCostCodeId ? costCodes?.find((cc) => cc.id === row.currentProjectAllocations[0]?.projectCostCodeId)?.code || "Assigned" : "—"}</span>}</td><td className="px-3 py-3 text-right">{selected ? <input type="number" min="0" max={row.remainingAmount} step="0.01" value={amounts[row.invoice.id] ?? row.remainingAmount} onChange={(event) => setAmounts((current) => ({ ...current, [row.invoice.id]: Number(event.target.value) }))} className="w-28 rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-right text-xs tabular-nums outline-none focus:border-indigo-500" aria-label={`Amount to assign for ${row.invoice.invoiceNumber || "invoice"}`} /> : <span className="text-[10px] text-slate-400">Select to assign</span>}</td></tr>; })}</tbody></table> : <div className="flex min-h-48 items-center justify-center px-6 py-12 text-center"><div><AlertCircle className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No invoices match these filters.</p><p className="mt-1 text-xs text-slate-500">Fully allocated invoices are disabled. Clear the filters or adjust another project allocation first.</p></div></div>}
      </div>
      {result && <div className={`border-t px-4 py-3 text-xs sm:px-6 ${result.failed.length ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}><div className="flex items-start gap-2">{result.failed.length ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />}<div><p className="font-black">Assigned {result.succeeded} invoice{result.succeeded === 1 ? "" : "s"}.</p>{result.failed.length > 0 && <ul className="mt-1 list-disc pl-4 text-[10px]">{result.failed.map(({ invoice, message }) => <li key={invoice.id}>{invoice.invoiceNumber || invoice.id}: {message}</li>)}</ul>}</div></div></div>}
      {error && <p className="border-t border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800 sm:px-6">{error}</p>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6"><p className="text-[10px] text-slate-500">Assignments are saved per invoice. A failed invoice keeps its previous allocation state.</p><div className="flex items-center gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Close</button><button type="button" onClick={() => void assignSelected()} disabled={!selectedCount || saving} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} {saving ? "Assigning…" : `Assign ${selectedCount || "selected"} invoice${selectedCount === 1 ? "" : "s"}`}</button></div></footer>
    </section>
  </div>;
};
