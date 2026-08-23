import React, { useMemo, useState } from "react";
import { AlertTriangle, Building2, Search } from "lucide-react";
import { InvoiceData } from "../types";
import { formatDate, formatMoney } from "../utils/invoiceLogic";

interface VendorsProps { invoices: InvoiceData[]; }

interface VendorSummary {
  key: string;
  name: string;
  email?: string;
  taxId?: string;
  registration?: string;
  location?: string;
  count: number;
  currencies: Record<string, number>;
  latest?: string;
  issues: number;
}

export const Vendors: React.FC<VendorsProps> = ({ invoices }) => {
  const [query, setQuery] = useState("");

  const vendors = useMemo<VendorSummary[]>(() => {
    const map = new Map<string, VendorSummary>();
    invoices.forEach((invoice) => {
      const name = invoice.vendor?.registeredName || invoice.vendor?.companyName || invoice.vendor?.name || "Unknown vendor";
      const taxId = invoice.vendor?.taxId?.trim();
      // TIN is the strongest normalization signal. Same names with different TINs remain separate cards.
      const key = taxId ? `tin:${taxId.toLowerCase()}` : `name:${name.trim().toLowerCase()}`;
      const existing = map.get(key);
      const entry: VendorSummary = existing || {
        key,
        name,
        email: invoice.vendor?.email,
        taxId,
        registration: invoice.vendor?.taxRegistration || invoice.philippineTaxDetails?.sellerRegistration,
        location: [invoice.vendor?.cityMunicipality || invoice.vendor?.city, invoice.vendor?.province || invoice.vendor?.state, invoice.vendor?.country].filter(Boolean).join(", "),
        count: 0,
        currencies: {},
        latest: invoice.invoiceDate,
        issues: 0,
      };
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

  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-black">Vendor directory</h2><p className="text-xs text-slate-500 mt-1">TIN-aware supplier summaries. Similar names are not merged when their TINs differ.</p></div>
      <label className="max-w-lg flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm"><Search className="w-4 h-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendor, TIN, location, VAT status..." className="w-full text-xs outline-none" /></label>

      {vendors.length ? <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {vendors.map((vendor) => {
          const phpSpend = vendor.currencies.PHP || 0;
          const currencyEntries = Object.entries(vendor.currencies) as Array<[string, number]>;
          return <div key={vendor.key} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm min-w-0">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Building2 className="w-5 h-5" /></div>
              <div className="min-w-0"><h3 className="text-sm font-bold break-words">{vendor.name}</h3><p className="text-[10px] text-slate-500 mt-1 break-words">TIN: {vendor.taxId || "Not found"}</p><span className="inline-flex mt-1 px-2 py-0.5 rounded-full bg-slate-100 text-[9px] font-bold uppercase">{vendor.registration || "UNKNOWN"}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="bg-slate-50 rounded-xl p-3"><p className="text-[9px] uppercase font-bold text-slate-500">Invoices</p><p className="text-lg font-black">{vendor.count}</p></div>
              <div className="bg-slate-50 rounded-xl p-3"><p className="text-[9px] uppercase font-bold text-slate-500">PHP spend</p><p className="text-sm font-black mt-1 break-words">{phpSpend ? formatMoney(phpSpend, "PHP") : "—"}</p></div>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3 space-y-1">
              <div className="flex justify-between gap-2 text-[10px]"><span className="text-slate-500">Location</span><span className="font-semibold text-right break-words">{vendor.location || "—"}</span></div>
              {currencyEntries.filter(([currency]) => currency !== "PHP").map(([currency, total]) => <div key={currency} className="flex justify-between text-[10px]"><span className="text-slate-500">{currency} total</span><span className="font-bold font-mono">{currency === "UNK" ? "Currency unclear" : formatMoney(total, currency)}</span></div>)}
              <div className="flex justify-between gap-2 text-[10px]"><span className="text-slate-500">Latest invoice</span><span className="font-semibold">{formatDate(vendor.latest, "short")}</span></div>
              <div className="flex justify-between gap-2 text-[10px]"><span className="text-slate-500">Review issues</span><span className={`font-bold inline-flex items-center gap-1 ${vendor.issues ? "text-amber-700" : "text-emerald-700"}`}>{vendor.issues ? <AlertTriangle className="w-3 h-3" /> : null}{vendor.issues}</span></div>
            </div>
          </div>;
        })}
      </div> : <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-xs text-slate-500">No vendors yet.</div>}
    </div>
  );
};
