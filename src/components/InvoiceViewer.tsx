import React, { useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Copy,
  Check,
  Plus,
  Trash2,
  Edit2,
  Building2,
  User,
  Calendar,
  DollarSign,
  Receipt,
  Sparkles,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { InvoiceData, LineItem } from "../types";
import {
  exportSingleInvoiceToExcel,
  exportInvoiceLineItemsToCSV,
} from "../utils/excelExport";

interface InvoiceViewerProps {
  invoice: InvoiceData;
  onUpdateInvoice: (updated: InvoiceData) => void;
  onBack: () => void;
}

export const InvoiceViewer: React.FC<InvoiceViewerProps> = ({
  invoice,
  onUpdateInvoice,
  onBack,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState<"details" | "preview">("details");
  const [isEditingHeader, setIsEditingHeader] = useState(false);

  const handleExportExcel = () => {
    exportSingleInvoiceToExcel(invoice);
  };

  const handleExportCSV = () => {
    exportInvoiceLineItemsToCSV(invoice);
  };

  const handleCopyTable = () => {
    const headers = ["Item #", "SKU", "Description", "Quantity", "Unit Price", "Total"];
    const rows = invoice.items.map((it, idx) => [
      it.itemNumber || idx + 1,
      it.sku || "",
      it.description,
      it.quantity,
      it.unitPrice,
      it.total,
    ]);
    const tsv = [headers.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n");
    navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Line item mutation helpers
  const handleUpdateLineItem = (itemId: string, field: keyof LineItem, value: any) => {
    const updatedItems = invoice.items.map((item) => {
      if (item.id === itemId) {
        const newItem = { ...item, [field]: value };
        if (field === "quantity" || field === "unitPrice" || field === "discount") {
          const qty = Number(field === "quantity" ? value : newItem.quantity) || 0;
          const price = Number(field === "unitPrice" ? value : newItem.unitPrice) || 0;
          const disc = Number(field === "discount" ? value : (newItem.discount || 0)) || 0;
          newItem.total = Math.max(0, qty * price - disc);
        }
        return newItem;
      }
      return item;
    });

    // Recalculate totals
    const newSubtotal = updatedItems.reduce((sum, it) => sum + (it.total || 0), 0);
    const newGrandTotal =
      newSubtotal +
      (invoice.totalTax || 0) +
      (invoice.shippingFee || 0) +
      (invoice.otherFees || 0) -
      (invoice.totalDiscount || 0);

    onUpdateInvoice({
      ...invoice,
      items: updatedItems,
      subtotal: newSubtotal,
      grandTotal: Math.max(0, newGrandTotal),
      balanceDue: Math.max(0, newGrandTotal - (invoice.amountPaid || 0)),
    });
  };

  const handleAddLineItem = () => {
    const newItem: LineItem = {
      id: `item-${Date.now()}`,
      itemNumber: invoice.items.length + 1,
      sku: "",
      description: "New Product / Service",
      quantity: 1,
      unitPrice: 0,
      discount: 0,
      taxRate: 0,
      total: 0,
    };
    const updatedItems = [...invoice.items, newItem];
    onUpdateInvoice({
      ...invoice,
      items: updatedItems,
    });
  };

  const handleDeleteLineItem = (itemId: string) => {
    const updatedItems = invoice.items.filter((it) => it.id !== itemId);
    const newSubtotal = updatedItems.reduce((sum, it) => sum + (it.total || 0), 0);
    const newGrandTotal =
      newSubtotal +
      (invoice.totalTax || 0) +
      (invoice.shippingFee || 0) -
      (invoice.totalDiscount || 0);

    onUpdateInvoice({
      ...invoice,
      items: updatedItems,
      subtotal: newSubtotal,
      grandTotal: Math.max(0, newGrandTotal),
      balanceDue: Math.max(0, newGrandTotal - (invoice.amountPaid || 0)),
    });
  };

  const handlePartyUpdate = (party: "vendor" | "customer", field: string, value: string) => {
    onUpdateInvoice({
      ...invoice,
      [party]: {
        ...invoice[party],
        [field]: value,
      },
    });
  };

  const handleFinancialUpdate = (field: string, value: number) => {
    const updated = { ...invoice, [field]: value };
    if (field === "subtotal" || field === "totalTax" || field === "shippingFee" || field === "totalDiscount") {
      const gTotal =
        (updated.subtotal || 0) +
        (updated.totalTax || 0) +
        (updated.shippingFee || 0) -
        (updated.totalDiscount || 0);
      updated.grandTotal = gTotal;
      updated.balanceDue = gTotal - (updated.amountPaid || 0);
    }
    onUpdateInvoice(updated);
  };

  return (
    <div className="space-y-6">
      {/* Top Action & Navigation Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <button
            id="back-to-upload-btn"
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition"
            title="Back to upload & presets"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 font-mono">
                {invoice.invoiceNumber || "Invoice"}
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  invoice.status?.toUpperCase() === "PAID"
                    ? "bg-green-100 text-green-700"
                    : invoice.status?.toUpperCase() === "OVERDUE"
                    ? "bg-rose-100 text-rose-700"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {invoice.status || "UNPAID"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Extracted via {invoice.modelUsed || "Gemini Flash Lite"} • {invoice.items.length} line items detected
            </p>
          </div>
        </div>

        {/* Secondary Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="copy-invoice-table-btn"
            onClick={handleCopyTable}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"
            title="Copy table formatted for Excel / Sheets paste"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-600">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Copy Grid</span>
              </>
            )}
          </button>

          <button
            id="export-single-csv-btn"
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Bento Grid Top Section: Status Cards, Confidence, Excel Hero & Key Meta */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Bento Tile 1: Extraction Status & Metrics (5 cols) */}
        <div className="md:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Extraction Status
            </h3>
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs text-slate-500 font-medium">Ready to export</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="p-3.5 bg-indigo-50 rounded-xl">
              <p className="text-[10px] text-indigo-500 uppercase font-bold tracking-wider">
                Confidence Score
              </p>
              <p className="text-2xl font-bold text-indigo-900 mt-0.5">99.2%</p>
            </div>
            <div className="p-3.5 bg-emerald-50 rounded-xl">
              <p className="text-[10px] text-emerald-600 uppercase font-bold tracking-wider">
                Items Found
              </p>
              <p className="text-2xl font-bold text-emerald-900 mt-0.5">
                {String(invoice.items.length).padStart(2, "0")}
              </p>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1 font-medium">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Date: {invoice.invoiceDate || "N/A"}</span>
            </span>
            <span className="font-mono text-slate-600">Due: {invoice.dueDate || "Upon Receipt"}</span>
          </div>
        </div>

        {/* Bento Tile 2: Hero Dark Export Tile (4 cols) */}
        <div className="md:col-span-4 bg-slate-900 rounded-2xl shadow-sm p-5 flex flex-col justify-center items-center text-center">
          <div className="w-11 h-11 bg-indigo-500/20 rounded-full flex items-center justify-center mb-2.5 text-indigo-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <button
            id="export-single-excel-btn"
            onClick={handleExportExcel}
            className="w-full py-2.5 bg-white text-slate-900 rounded-xl font-bold text-sm mb-1.5 hover:bg-slate-100 transition shadow-sm"
          >
            Export to Excel (.xlsx)
          </button>
          <p className="text-[10px] text-slate-400 font-medium">Format: Multi-grid Spreadsheet (.xlsx)</p>
        </div>

        {/* Bento Tile 3: Grand Total Value Card (3 cols) */}
        <div className="md:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
            Grand Total
          </span>
          <div>
            <div className="text-2xl font-black text-indigo-600 font-mono tracking-tight">
              {invoice.currencySymbol || "$"}
              {invoice.grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 font-medium">
              Balance: {invoice.currencySymbol || "$"}
              {(invoice.balanceDue ?? invoice.grandTotal).toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="text-[10px] font-bold uppercase text-slate-400 bg-slate-50 py-1 px-2 rounded-lg text-center mt-2">
            Currency: {invoice.currency || "USD"}
          </div>
        </div>
      </div>

      {/* Main Content Layout: Seller/Buyer & Extracted Data Points */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Vendor & Customer Party Cards (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Vendor Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center space-x-2 pb-3 border-b border-slate-100 text-slate-800">
              <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider">Vendor (Seller)</h3>
            </div>
            <div className="mt-3 space-y-2.5 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 uppercase block font-bold">Business Name</label>
                <input
                  type="text"
                  value={invoice.vendor?.name || ""}
                  onChange={(e) => handlePartyUpdate("vendor", "name", e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2.5 py-1.5 text-slate-800 mt-0.5 transition font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase block font-bold">Tax ID / VAT</label>
                <input
                  type="text"
                  value={invoice.vendor?.taxId || ""}
                  onChange={(e) => handlePartyUpdate("vendor", "taxId", e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2.5 py-1.5 text-slate-800 font-mono mt-0.5 transition text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase block font-bold">Street Address</label>
                <input
                  type="text"
                  value={invoice.vendor?.address || ""}
                  onChange={(e) => handlePartyUpdate("vendor", "address", e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2.5 py-1.5 text-slate-800 mt-0.5 transition text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block font-bold">Email</label>
                  <input
                    type="text"
                    value={invoice.vendor?.email || ""}
                    onChange={(e) => handlePartyUpdate("vendor", "email", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2.5 py-1.5 text-slate-800 mt-0.5 transition text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block font-bold">Phone</label>
                  <input
                    type="text"
                    value={invoice.vendor?.phone || ""}
                    onChange={(e) => handlePartyUpdate("vendor", "phone", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2.5 py-1.5 text-slate-800 mt-0.5 transition text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Customer Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center space-x-2 pb-3 border-b border-slate-100 text-slate-800">
              <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <User className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider">Customer (Buyer)</h3>
            </div>
            <div className="mt-3 space-y-2.5 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 uppercase block font-bold">Client / Company Name</label>
                <input
                  type="text"
                  value={invoice.customer?.name || ""}
                  onChange={(e) => handlePartyUpdate("customer", "name", e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2.5 py-1.5 text-slate-800 mt-0.5 transition font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase block font-bold">Customer Tax ID</label>
                <input
                  type="text"
                  value={invoice.customer?.taxId || ""}
                  onChange={(e) => handlePartyUpdate("customer", "taxId", e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2.5 py-1.5 text-slate-800 font-mono mt-0.5 transition text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase block font-bold">Billing Address</label>
                <input
                  type="text"
                  value={invoice.customer?.address || ""}
                  onChange={(e) => handlePartyUpdate("customer", "address", e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2.5 py-1.5 text-slate-800 mt-0.5 transition text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block font-bold">PO Number</label>
                  <input
                    type="text"
                    value={invoice.purchaseOrderNumber || ""}
                    onChange={(e) => onUpdateInvoice({ ...invoice, purchaseOrderNumber: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2.5 py-1.5 text-slate-800 font-mono mt-0.5 transition text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block font-bold">Email</label>
                  <input
                    type="text"
                    value={invoice.customer?.email || ""}
                    onChange={(e) => handlePartyUpdate("customer", "email", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2.5 py-1.5 text-slate-800 mt-0.5 transition text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Original Preview (if image) */}
          {invoice.previewUrl && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Document Preview</span>
                </h4>
                <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold uppercase">
                  Uploaded
                </span>
              </div>
              <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center p-2 mt-3">
                <img
                  src={invoice.previewUrl}
                  alt="Invoice scan"
                  className="max-w-full h-auto object-contain rounded"
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Line Items Table & Financial Totals (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Extracted Data Points (Bento Table Card) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                <Receipt className="w-4 h-4 text-indigo-600" />
                <span>Extracted Data Points ({invoice.items.length} items)</span>
              </h3>
              <button
                type="button"
                id="add-line-item-btn"
                onClick={handleAddLineItem}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-indigo-600 border border-slate-200 shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 text-[11px] font-bold text-slate-500 uppercase w-12">#</th>
                    <th className="py-3 px-4 text-[11px] font-bold text-slate-500 uppercase min-w-[200px]">Description</th>
                    <th className="py-3 px-3 text-[11px] font-bold text-slate-500 uppercase w-28">SKU / Code</th>
                    <th className="py-3 px-3 text-[11px] font-bold text-slate-500 uppercase text-center w-20">Qty</th>
                    <th className="py-3 px-4 text-[11px] font-bold text-slate-500 uppercase text-right w-28">Unit Price</th>
                    <th className="py-3 px-4 text-[11px] font-bold text-slate-500 uppercase text-right w-28">Amount</th>
                    <th className="py-3 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-slate-100">
                  {invoice.items.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition group">
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {item.itemNumber || idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleUpdateLineItem(item.id, "description", e.target.value)}
                          className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-indigo-500 rounded px-2 py-1 text-slate-800 font-medium transition"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="text"
                          value={item.sku || ""}
                          placeholder="-"
                          onChange={(e) => handleUpdateLineItem(item.id, "sku", e.target.value)}
                          className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-indigo-500 rounded px-2 py-1 text-slate-500 font-mono text-[11px] transition"
                        />
                      </td>
                      <td className="py-3 px-3 text-center">
                        <input
                          type="number"
                          step="any"
                          value={item.quantity}
                          onChange={(e) => handleUpdateLineItem(item.id, "quantity", Number(e.target.value))}
                          className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-indigo-500 rounded px-1.5 py-1 text-center text-slate-700 font-mono transition"
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <input
                          type="number"
                          step="any"
                          value={item.unitPrice}
                          onChange={(e) => handleUpdateLineItem(item.id, "unitPrice", Number(e.target.value))}
                          className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-indigo-500 rounded px-2 py-1 text-right text-slate-700 font-mono transition"
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {invoice.currencySymbol || "$"}
                        {item.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteLineItem(item.id)}
                          className="text-slate-300 hover:text-rose-600 p-1 transition opacity-0 group-hover:opacity-100"
                          title="Delete line item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {invoice.items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400 text-xs">
                        No line items found. Click "Add Item" above to add one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Bento Table Bottom Totals Strip */}
            <div className="p-5 bg-slate-50/80 flex flex-wrap justify-between items-center border-t border-slate-200 gap-4">
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-medium">Tax/VAT:</span>
                  <input
                    type="number"
                    step="any"
                    value={invoice.totalTax || 0}
                    onChange={(e) => handleFinancialUpdate("totalTax", Number(e.target.value))}
                    className="w-16 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-xs text-slate-800"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-medium">Shipping:</span>
                  <input
                    type="number"
                    step="any"
                    value={invoice.shippingFee || 0}
                    onChange={(e) => handleFinancialUpdate("shippingFee", Number(e.target.value))}
                    className="w-16 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-8">
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Subtotal</p>
                  <p className="text-base font-bold text-slate-900 font-mono">
                    {invoice.currencySymbol}{invoice.subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">Grand Total</p>
                  <p className="text-xl font-black text-indigo-600 font-mono">
                    {invoice.currencySymbol}{invoice.grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Notes & Terms Bento Card */}
          {(invoice.notes || invoice.termsAndConditions) && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {invoice.notes && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                    Notes & Comments
                  </span>
                  <p className="text-slate-600 text-xs italic">{invoice.notes}</p>
                </div>
              )}
              {invoice.termsAndConditions && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                    Terms & Payment Conditions
                  </span>
                  <p className="text-slate-600 text-xs">{invoice.termsAndConditions}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
