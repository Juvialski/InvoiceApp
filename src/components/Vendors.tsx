import React, { useMemo, useState } from "react";
import { AlertTriangle, Building2, Search } from "lucide-react";
import type { InvoiceData } from "../types";
import { formatDate, formatMoney } from "../utils/invoiceLogic";
import { EmptyState, PageHeader, StatusBadge } from "./ui/OperationsUI";

interface VendorsProps { invoices: InvoiceData[]; }
interface VendorSummary { key: string; name: string; email?: string; taxId?: string; registration?: string; location?: string; count: number; currencies: Record<string, number>; latest?: string; issues: number; }

export const Vendors: React.FC<VendorsProps> = ({ invoices }) => {
  const [query, setQuery] = useState("");
  const vendors = useMemo<VendorSummary[]>(() => {
    const map = new Map<string, VendorSummary>();
    invoices.forEach((invoice) => {
      const name = invoice.vendor?.registeredName || invoice.vendor?.companyName || invoice.vendor?.name || "Unknown vendor";
      const taxId = invoice.vendor?.taxId?.trim();
      const key = taxId ? `tin:${taxId.toLowerCase()}` : `name:${name.trim().toLowerCase()}`;
      const existing = map.get(key);
      const entry: VendorSummary = existing || { key, name, email: invoice.vendor?.email, taxId, registration: invoice.vendor?.taxRegistration || invoice.philippineTaxDetails?.sellerRegistration, location: [invoice.vendor?.cityMunicipality || invoice.vendor?.city, invoice.vendor?.province || invoice.vendor?.state, invoice.vendor?.country].filter(Boolean).join(", "), count: 0, currencies: {}, latest: invoice.invoiceDate, issues: 0 };
      entry.count += 1;
      const currency = invoice.currency || "UNK";
      entry.currencies[currency] = (entry.currencies[currency] || 0) + (Number(invoice.grandTotal) || 0);
      entry.issues += invoice.validation?.issues?.length || 0;
      if (invoice.philippineInvoiceCompleteness?.status === "MISSING_INFORMATION") entry.issues += 1;
      if ((invoice.invoiceDate || "") > (entry.latest || "")) entry.latest = invoice.invoiceDate;
      map.set(key, entry);
    });
    const lowered = query.trim().toLowerCase();
    return Array.from(map.values()).filter((vendor) => [vendor.name, vendor.taxId, vendor.location, vendor.registration].join(" ").toLowerCase().includes(lowered)).sort((a, b) => b.count - a.count);
  }, [invoices, query]);

  return <div className="space-y-5">
    <PageHeader eyebrow="Supplier directory" title="Vendors" description="TIN-aware supplier summaries. Similar names are not merged when their TINs differ." />
    <label className="flex max-w-xl items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"><Search aria-hidden="true" className="h-4 w-4 text-slate-400" /><span className="sr-only">Search vendors</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vendor, TIN, location, VAT status…" className="w-full text-xs outline-none placeholder:text-slate-400" /></label>
    {vendors.length ? <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Vendor directory table"><div className="ops-scrollbar overflow-auto"><table className="ops-table min-w-[880px] w-full text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Contact / location</th><th className="px-4 py-3 text-right">Invoices</th><th className="px-4 py-3">Currency totals</th><th className="px-4 py-3">Latest</th><th className="px-4 py-3">Review</th></tr></thead><tbody className="divide-y divide-slate-100">{vendors.map((vendor) => <tr key={vendor.key}><td className="max-w-[260px] px-4 py-3"><div className="flex items-start gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"><Building2 className="h-4 w-4" /></span><div className="min-w-0"><strong className="block break-words text-xs text-slate-900">{vendor.name}</strong><span className="mt-0.5 block truncate text-[10px] text-slate-500">TIN {vendor.taxId || "not found"}</span><StatusBadge className="mt-1" tone="neutral">{vendor.registration || "UNKNOWN"}</StatusBadge></div></div></td><td className="max-w-[230px] px-4 py-3"><strong className="block truncate text-[10px] text-slate-700">{vendor.email || "No email recorded"}</strong><span className="mt-0.5 block break-words text-[10px] text-slate-500">{vendor.location || "Location not recorded"}</span></td><td className="px-4 py-3 text-right text-sm font-black tabular-nums">{vendor.count}</td><td className="max-w-[220px] px-4 py-3"><div className="space-y-1">{(Object.entries(vendor.currencies) as Array<[string, number]>).map(([currency, total]) => <div key={currency} className="flex items-center justify-between gap-3 text-[10px]"><span className="font-bold text-slate-600">{currency}</span><span className="font-sans font-bold tabular-nums">{currency === "UNK" ? "Currency unclear" : formatMoney(total, currency)}</span></div>)}</div></td><td className="px-4 py-3 text-[10px] font-semibold text-slate-600">{formatDate(vendor.latest, "short")}</td><td className="px-4 py-3">{vendor.issues ? <StatusBadge tone="warning" icon={AlertTriangle}>{vendor.issues} issue{vendor.issues === 1 ? "" : "s"}</StatusBadge> : <StatusBadge tone="success">Clear</StatusBadge>}</td></tr>)}</tbody></table></div></section> : <EmptyState icon={Building2} title={invoices.length ? "No vendors match this search" : "No vendors yet"} description="Vendors appear here as invoice records are imported and reviewed." />}
  </div>;
};
