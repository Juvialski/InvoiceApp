import React, { useMemo, useState } from "react";
import { Building2, Search } from "lucide-react";
import { InvoiceData } from "../types";
import { formatMoney } from "../utils/invoiceLogic";

interface VendorsProps {
  invoices: InvoiceData[];
}

interface VendorSummary {
  name: string;
  email?: string;
  taxId?: string;
  count: number;
  currencies: Record<string, number>;
  latest?: string;
  categoryCounts: Record<string, number>;
}

export const Vendors: React.FC<VendorsProps> = ({ invoices }) => {
  const [query, setQuery] = useState("");

  const vendors = useMemo<VendorSummary[]>(() => {
    const map = new Map<string, VendorSummary>();

    invoices.forEach((invoice) => {
      const name = invoice.vendor?.companyName || invoice.vendor?.name || "Unknown vendor";
      const key = name.trim().toLowerCase();
      const existing = map.get(key);
      const entry: VendorSummary = existing || {
        name,
        email: invoice.vendor?.email,
        taxId: invoice.vendor?.taxId,
        count: 0,
        currencies: {},
        latest: invoice.invoiceDate,
        categoryCounts: {},
      };

      entry.count += 1;
      const currency = invoice.currency || "UNK";
      entry.currencies[currency] = (entry.currencies[currency] || 0) + (Number(invoice.grandTotal) || 0);
      if ((invoice.invoiceDate || "") > (entry.latest || "")) entry.latest = invoice.invoiceDate;
      const category = invoice.category || "Uncategorized";
      entry.categoryCounts[category] = (entry.categoryCounts[category] || 0) + 1;
      map.set(key, entry);
    });

    return Array.from(map.values())
      .filter((vendor) => vendor.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.count - a.count);
  }, [invoices, query]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black">Vendor directory</h2>
        <p className="text-xs text-slate-500 mt-1">Automatically grouped from extracted invoices.</p>
      </div>

      <label className="max-w-md flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vendors..."
          className="w-full text-xs outline-none"
        />
      </label>

      {vendors.length ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {vendors.map((vendor) => {
            const categoryEntries = Object.entries(vendor.categoryCounts) as Array<[string, number]>;
            const category = categoryEntries.sort((a, b) => b[1] - a[1])[0]?.[0] || "Uncategorized";
            const currencyEntries = Object.entries(vendor.currencies) as Array<[string, number]>;

            return (
              <div key={vendor.name} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold truncate">{vendor.name}</h3>
                    <p className="text-[10px] text-slate-500 truncate">{vendor.email || vendor.taxId || "No contact metadata"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[9px] uppercase font-bold text-slate-500">Invoices</p>
                    <p className="text-lg font-black">{vendor.count}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[9px] uppercase font-bold text-slate-500">Top category</p>
                    <p className="text-xs font-bold mt-1 truncate">{category}</p>
                  </div>
                </div>

                <div className="mt-3 border-t border-slate-100 pt-3 space-y-1">
                  {currencyEntries.map(([currency, total]) => (
                    <div key={currency} className="flex justify-between text-[10px]">
                      <span className="text-slate-500">{currency} total</span>
                      <span className="font-bold font-mono">{formatMoney(total, currency)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Latest invoice</span>
                    <span className="font-semibold">{vendor.latest || "—"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-xs text-slate-500">No vendors yet.</div>
      )}
    </div>
  );
};
