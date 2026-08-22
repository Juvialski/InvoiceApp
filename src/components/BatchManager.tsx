import React from "react";
import {
  FileSpreadsheet,
  Download,
  Trash2,
  Eye,
  Plus,
  Receipt,
  Building,
  Layers,
  ArrowRight,
  TrendingUp,
  FileCheck,
} from "lucide-react";
import { InvoiceData } from "../types";
import { exportBatchInvoicesToExcel } from "../utils/excelExport";

interface BatchManagerProps {
  invoices: InvoiceData[];
  onSelectInvoice: (invoice: InvoiceData) => void;
  onDeleteInvoice: (id: string) => void;
  onClearAll: () => void;
  onAddNew: () => void;
}

export const BatchManager: React.FC<BatchManagerProps> = ({
  invoices,
  onSelectInvoice,
  onDeleteInvoice,
  onClearAll,
  onAddNew,
}) => {
  const totalAmount = invoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
  const totalTax = invoices.reduce((sum, inv) => sum + (inv.totalTax || 0), 0);
  const totalLineItems = invoices.reduce((sum, inv) => sum + (inv.items?.length || 0), 0);

  const handleExportAllExcel = () => {
    exportBatchInvoicesToExcel(invoices);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Bento Container with Aggregated Metrics */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Extracted Invoices Directory
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                  {invoices.length} Invoices
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Batch consolidate, audit, and export all extracted records to a unified Excel workbook
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              id="batch-view-add-new-btn"
              onClick={onAddNew}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"
            >
              <Plus className="w-3.5 h-3.5 text-slate-500" />
              <span>Extract New Invoice</span>
            </button>

            {invoices.length > 0 && (
              <>
                <button
                  id="batch-view-export-excel-btn"
                  onClick={handleExportAllExcel}
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-md shadow-indigo-200"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Export All to Excel (.xlsx)</span>
                </button>

                <button
                  id="batch-view-clear-all-btn"
                  onClick={onClearAll}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 transition"
                  title="Clear all extracted invoices"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Bento Aggregated Metrics Grid */}
        {invoices.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-5 pt-5 border-t border-slate-100">
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4">
              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block">
                Total Extracted Value
              </span>
              <div className="text-xl sm:text-2xl font-black text-indigo-900 font-mono mt-0.5">
                ${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
                Aggregated Tax / VAT
              </span>
              <div className="text-xl sm:text-2xl font-black text-emerald-900 font-mono mt-0.5">
                ${totalTax.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Items Extracted
              </span>
              <div className="text-xl sm:text-2xl font-bold text-slate-800 font-mono mt-0.5">
                {totalLineItems} <span className="text-xs text-slate-500 font-sans font-normal">items across {invoices.length} invoices</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Invoices Bento Table */}
      {invoices.length > 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Vendor / Seller</th>
                  <th className="py-3 px-4">Customer / Buyer</th>
                  <th className="py-3 px-4 text-center">Items</th>
                  <th className="py-3 px-4 text-right">Grand Total</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-slate-50/70 transition cursor-pointer group"
                    onClick={() => onSelectInvoice(inv)}
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 group-hover:text-indigo-600 transition">
                      {inv.invoiceNumber || "N/A"}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {inv.invoiceDate || "N/A"}
                    </td>
                    <td className="py-3.5 px-4 max-w-[180px] truncate text-slate-800 font-medium" title={inv.vendor?.name}>
                      {inv.vendor?.companyName || inv.vendor?.name || "N/A"}
                    </td>
                    <td className="py-3.5 px-4 max-w-[180px] truncate text-slate-600" title={inv.customer?.name}>
                      {inv.customer?.companyName || inv.customer?.name || "N/A"}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
                        {inv.items?.length || 0}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-black text-slate-900">
                      {inv.currencySymbol || "$"}
                      {inv.grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          inv.status?.toUpperCase() === "PAID"
                            ? "bg-green-100 text-green-700"
                            : inv.status?.toUpperCase() === "OVERDUE"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {inv.status || "UNPAID"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onSelectInvoice(inv)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 transition"
                          title="View and edit invoice details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteInvoice(inv.id)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                          title="Remove invoice"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto mb-4">
            <FileCheck className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No Invoices Extracted Yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            Upload an invoice document, receipt image, or try one of the sample presets to extract structured data and export to Excel.
          </p>
          <button
            type="button"
            onClick={onAddNew}
            className="mt-5 inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-md shadow-indigo-200"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Extract First Invoice</span>
          </button>
        </div>
      )}
    </div>
  );
};
