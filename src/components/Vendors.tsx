import React, { useMemo, useState } from "react";
import { AlertTriangle, Building2, Search } from "lucide-react";
import type { InvoiceData, Vendor } from "../types";
import { formatDate, formatMoney } from "../utils/invoiceLogic";
import { EmptyState, PageHeader, StatusBadge } from "./ui/OperationsUI";

interface VendorsProps {
  invoices: InvoiceData[];
  vendors: Vendor[];
  canManage?: boolean;
  onDeactivateVendor?: (vendorId: string, reason: string) => Promise<void>;
  onReactivateVendor?: (vendorId: string) => Promise<void>;
}

interface VendorSummary {
  key: string;
  vendor: Vendor;
  count: number;
  currencies: Record<string, number>;
  unresolvedAmountCount: number;
  latest?: string;
  issues: number;
}

function invoiceVendorId(invoice: InvoiceData) {
  return invoice.vendor?.vendorId || invoice.entityResolution?.matchedEntityId || "";
}

export const Vendors: React.FC<VendorsProps> = ({ invoices, vendors: canonicalVendors, canManage = false, onDeactivateVendor, onReactivateVendor }) => {
  const [query, setQuery] = useState("");
  const vendors = useMemo<VendorSummary[]>(() => {
    const byId = new Map<string, VendorSummary>(
      canonicalVendors.map((vendor) => [
        vendor.id,
        {
          key: vendor.id,
          vendor,
          count: 0,
          currencies: {},
          unresolvedAmountCount: 0,
          latest: undefined,
          issues: 0,
        },
      ]),
    );

    for (const invoice of invoices) {
      const vendorId = invoiceVendorId(invoice);
      const summary = vendorId ? byId.get(vendorId) : undefined;
      if (!summary) continue;
      summary.count += 1;
      const amount = typeof invoice.grandTotal === "number" && Number.isFinite(invoice.grandTotal) ? invoice.grandTotal : undefined;
      const currency = String(invoice.currency || "").trim().toUpperCase();
      if (amount === undefined || !currency) summary.unresolvedAmountCount += 1;
      else summary.currencies[currency] = (summary.currencies[currency] || 0) + amount;
      if ((invoice.invoiceDate || "") > (summary.latest || "")) summary.latest = invoice.invoiceDate;
      summary.issues += invoice.validation?.issues?.length || 0;
      if (invoice.philippineInvoiceCompleteness?.status === "MISSING_INFORMATION") summary.issues += 1;
    }

    const lowered = query.trim().toLowerCase();
    return [...byId.values()]
      .filter(({ vendor }) => [
        vendor.name,
        vendor.taxId,
        vendor.email,
        vendor.phone,
        vendor.address,
        vendor.active === false ? "inactive archived deactivated" : "active",
      ].join(" ").toLowerCase().includes(lowered))
      .sort((left, right) => right.count - left.count || left.vendor.name.localeCompare(right.vendor.name));
  }, [canonicalVendors, invoices, query]);

  const unresolvedEvidenceCount = invoices.filter((invoice) => {
    const id = invoiceVendorId(invoice);
    return !id || !canonicalVendors.some((vendor) => vendor.id === id);
  }).length;

  return <div className="space-y-5">
    <PageHeader
      eyebrow="Canonical supplier master"
      title="Vendors"
      description="Company-scoped Vendor records are the identity consumed by RFQ, quotation, PO, Expense, and supplier-document workflows. Extracted supplier text remains evidence until resolved."
    />
    <label className="flex max-w-xl items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <Search aria-hidden="true" className="h-4 w-4 text-slate-400" />
      <span className="sr-only">Search vendors</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search canonical Vendor, TIN, contact, status…" className="w-full text-xs outline-none placeholder:text-slate-400" />
    </label>
    {unresolvedEvidenceCount > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900" role="status"><strong>{unresolvedEvidenceCount}</strong> supplier document{unresolvedEvidenceCount === 1 ? "" : "s"} still has unresolved supplier evidence. It is intentionally not shown as a canonical Vendor until a reviewer confirms the identity.</p>}
    {vendors.length ? <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Canonical Vendor directory table">
      <div className="ops-scrollbar overflow-auto">
        <table className="ops-table min-w-[980px] w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Contact / location</th><th className="px-4 py-3">State</th><th className="px-4 py-3 text-right">Linked invoices</th><th className="px-4 py-3">Currency totals</th><th className="px-4 py-3">Latest</th><th className="px-4 py-3">Review</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vendors.map((summary) => {
              const vendor = summary.vendor;
              return <tr key={summary.key}>
                <td className="max-w-[260px] px-4 py-3"><div className="flex items-start gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"><Building2 className="h-4 w-4" /></span><div className="min-w-0"><strong className="block break-words text-xs text-slate-900">{vendor.name}</strong><span className="mt-0.5 block truncate text-[10px] text-slate-500">TIN {vendor.taxId || "not recorded"}</span></div></div></td>
                <td className="max-w-[230px] px-4 py-3"><strong className="block truncate text-[10px] text-slate-700">{vendor.email || "No email recorded"}</strong><span className="mt-0.5 block break-words text-[10px] text-slate-500">{vendor.address || "Location not recorded"}</span></td>
                <td className="px-4 py-3"><div className="flex flex-wrap items-center gap-1.5">{vendor.active === false ? <StatusBadge tone="neutral">Inactive · history retained</StatusBadge> : <StatusBadge tone="success">Active</StatusBadge>}{canManage && vendor.active === false && onReactivateVendor && <button type="button" onClick={() => void onReactivateVendor(vendor.id).catch(() => undefined)} className="rounded-md border border-emerald-200 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50">Reactivate</button>}{canManage && vendor.active !== false && onDeactivateVendor && <button type="button" onClick={() => { const reason = typeof window !== "undefined" ? window.prompt("Reason for deactivating this Vendor:")?.trim() : ""; if (reason) void onDeactivateVendor(vendor.id, reason).catch(() => undefined); }} className="rounded-md border border-amber-200 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-50">Deactivate</button>}</div></td>
                <td className="px-4 py-3 text-right text-sm font-black tabular-nums">{summary.count}</td>
                <td className="max-w-[220px] px-4 py-3"><div className="space-y-1">{Object.entries(summary.currencies).length ? Object.entries(summary.currencies).map(([currency, total]) => <div key={currency} className="flex items-center justify-between gap-3 text-[10px]"><span className="font-bold text-slate-600">{currency}</span><span className="font-sans font-bold tabular-nums">{formatMoney(total, currency)}</span></div>) : <span className="text-[10px] text-slate-400">No complete linked totals</span>}{summary.unresolvedAmountCount > 0 && <span className="block text-[10px] text-amber-700">{summary.unresolvedAmountCount} unresolved amount/currency</span>}</div></td>
                <td className="px-4 py-3 text-[10px] font-semibold text-slate-600">{formatDate(summary.latest, "short")}</td>
                <td className="px-4 py-3">{summary.issues ? <StatusBadge tone="warning" icon={AlertTriangle}>{summary.issues} issue{summary.issues === 1 ? "" : "s"}</StatusBadge> : <StatusBadge tone="success">Clear</StatusBadge>}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section> : <EmptyState icon={Building2} title={canonicalVendors.length ? "No Vendors match this search" : "No canonical Vendors yet"} description={canonicalVendors.length ? "Try a different Vendor, TIN, contact, or state filter." : invoices.length ? "Supplier evidence exists, but no identity has been human-confirmed into the canonical Vendor master." : "Create a Vendor through an authorized procurement or supplier-review workflow."} />}
  </div>;
};
