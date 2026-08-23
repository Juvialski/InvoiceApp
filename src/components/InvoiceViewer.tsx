import React, { useEffect, useMemo, useState } from "react";
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
  ArrowLeft,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { InvoiceData, LineItem } from "../types";
import {
  exportSingleInvoiceToExcel,
  exportInvoiceLineItemsToCSV,
} from "../utils/excelExport";
import { formatDate, formatMoney } from "../config/regional";

function valueAtPath(value: any, path: string) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

interface InvoiceViewerProps {
  invoice: InvoiceData;
  onUpdateInvoice: (updated: InvoiceData) => void;
  onBack: () => void;
  compact?: boolean;
  focusFieldPath?: string;
  focusFieldToken?: number;
}

export const InvoiceViewer: React.FC<InvoiceViewerProps> = ({
  invoice,
  onUpdateInvoice,
  onBack,
  compact = false,
  focusFieldPath,
  focusFieldToken,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState<"details" | "preview">("details");
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const changedPaths = useMemo(() => {
    if (!invoice.aiSnapshot) return new Set<string>();
    const paths = [
      "invoiceNumber", "invoiceDate", "dueDate", "vendor.name", "vendor.taxId", "customer.name", "customer.taxId",
      "subtotal", "totalTax", "grandTotal", "balanceDue", "philippineTaxDetails.vatableSales", "philippineTaxDetails.vatAmount",
      "philippineTaxDetails.zeroRatedSales", "philippineTaxDetails.vatExemptSales", "withholdingTaxAmount", "items",
    ];
    return new Set(paths.filter((path) => JSON.stringify(valueAtPath(invoice.aiSnapshot, path) ?? null) !== JSON.stringify(valueAtPath(invoice, path) ?? null)));
  }, [invoice]);

  useEffect(() => {
    if (!focusFieldPath) return;
    const timer = window.setTimeout(() => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-field-path]"));
      const target = nodes.find((node) => node.dataset.fieldPath === focusFieldPath)
        || nodes.find((node) => focusFieldPath.startsWith("items.") && node.dataset.fieldPath === focusFieldPath.split(".").slice(0, 2).join("."))
        || nodes.find((node) => focusFieldPath.startsWith("items.") && node.dataset.fieldPath === "items");
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("verification-field-highlight");
      const input = target.matches("input,select,textarea,button") ? target : target.querySelector<HTMLElement>("input,select,textarea,button");
      input?.focus({ preventScroll: true });
      window.setTimeout(() => target.classList.remove("verification-field-highlight"), 1800);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusFieldPath, focusFieldToken]);

  const edited = (path: string) => changedPaths.has(path);

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
    if (field === "subtotal" || field === "totalTax" || field === "shippingFee" || field === "otherFees" || field === "totalDiscount" || field === "amountPaid") {
      const gTotal =
        (updated.subtotal || 0) +
        (updated.totalTax || 0) +
        (updated.shippingFee || 0) +
        (updated.otherFees || 0) -
        (updated.totalDiscount || 0);
      updated.grandTotal = Math.max(0, gTotal);
      updated.balanceDue = Math.max(0, gTotal - (updated.amountPaid || 0));
    }
    onUpdateInvoice(updated);
  };

  const handlePhilippineTaxUpdate = (field: string, value: string | number | boolean | undefined) => {
    const details = { ...(invoice.philippineTaxDetails || {}), [field]: value };
    const updated: InvoiceData = { ...invoice, philippineTaxDetails: details };
    if (field === "invoiceKind") updated.invoiceSubtype = value === "NON_VAT_INVOICE" ? "NON_VAT_INVOICE" : value === "VAT_INVOICE" ? "VAT_INVOICE" : invoice.invoiceSubtype;
    if (field === "withholdingTaxAmount") {
      updated.withholdingTaxAmount = value === undefined ? undefined : Number(value);
      updated.netAmountPayable = value === undefined ? undefined : Math.round((Number(invoice.grandTotal || 0) - Number(value || 0)) * 100) / 100;
    }
    onUpdateInvoice(updated);
  };

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {/* Top Action & Navigation Header */}
      <div className={`${compact ? "hidden" : ""} bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4`}>
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
              Extraction record • {invoice.items.length} line items detected
            </p>
            {isEditingHeader && <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
              <input value={invoice.invoiceNumber || ""} onChange={(e) => onUpdateInvoice({ ...invoice, invoiceNumber: e.target.value })} placeholder="Invoice number" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
              <input type="date" value={invoice.invoiceDate || ""} onChange={(e) => onUpdateInvoice({ ...invoice, invoiceDate: e.target.value })} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
              <input type="date" value={invoice.dueDate || ""} onChange={(e) => onUpdateInvoice({ ...invoice, dueDate: e.target.value })} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
            </div>}
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
          <button onClick={() => setIsEditingHeader((value) => !value)} className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"><Edit2 className="w-3.5 h-3.5" /><span>{isEditingHeader ? "Done" : "Edit header"}</span></button>
        </div>
      </div>

      {compact && <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm"><div className="flex items-center justify-between gap-2"><div><p className="text-[9px] uppercase tracking-wide font-black text-indigo-600">Invoice details</p><p className="text-[10px] text-slate-500 mt-0.5">Edit the extracted header before checking the totals.</p></div>{edited("invoiceNumber") && <span className="inline-flex items-center gap-1 text-[9px] font-black text-sky-700"><span className="w-1.5 h-1.5 rounded-full bg-sky-500" />Edited</span>}</div><div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3"><label className="text-[9px] uppercase font-black text-slate-400">Invoice number<input data-field-path="invoiceNumber" value={invoice.invoiceNumber || ""} onChange={(e) => onUpdateInvoice({ ...invoice, invoiceNumber: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-mono text-slate-800" /></label><label className="text-[9px] uppercase font-black text-slate-400">Invoice date<input data-field-path="invoiceDate" type="date" value={invoice.invoiceDate || ""} onChange={(e) => onUpdateInvoice({ ...invoice, invoiceDate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-800" /></label><label className="text-[9px] uppercase font-black text-slate-400">Due date<input data-field-path="dueDate" type="date" value={invoice.dueDate || ""} onChange={(e) => onUpdateInvoice({ ...invoice, dueDate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-800" /></label></div></div>}

      {/* Bento Grid Top Section: Status Cards, Confidence, Excel Hero & Key Meta */}
      <div className={`${compact ? "hidden" : ""} grid grid-cols-1 md:grid-cols-12 gap-4`}>
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
              <p className="text-2xl font-bold text-indigo-900 mt-0.5">{invoice.confidenceScore === undefined ? "—" : `${Math.round(invoice.confidenceScore)}%`}</p>
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
              <span>Date: {formatDate(invoice.invoiceDate, "medium")}</span>
            </span>
            <span className="font-mono text-slate-600">Due: {invoice.dueDate ? formatDate(invoice.dueDate, "medium") : "Upon Receipt"}</span>
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
              {invoice.currency ? formatMoney(invoice.grandTotal, invoice.currency) : "Currency unclear"}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 font-medium">
              Balance: {invoice.currency ? formatMoney(invoice.balanceDue ?? invoice.grandTotal, invoice.currency) : "Currency unclear"}
            </p>
          </div>
          <div className="text-[10px] font-bold uppercase text-slate-400 bg-slate-50 py-1 px-2 rounded-lg text-center mt-2">
            Currency: {invoice.currency || "Currency unclear"}
          </div>
        </div>
      </div>

      {/* Main Content Layout: Seller/Buyer & Extracted Data Points */}
      <div className={compact ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 lg:grid-cols-12 gap-6"}>
        {/* Left Column: Vendor & Customer Party Cards (4 cols) */}
        <div className={compact ? "space-y-4" : "lg:col-span-4 space-y-4"}>
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
                  data-field-path="vendor.name"
                  value={invoice.vendor?.name || ""}
                  onChange={(e) => handlePartyUpdate("vendor", "name", e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2.5 py-1.5 text-slate-800 mt-0.5 transition font-medium"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] text-slate-400 uppercase block font-bold">Registered Name</label><input value={invoice.vendor?.registeredName || ""} onChange={(e) => handlePartyUpdate("vendor", "registeredName", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-0.5 text-xs" /></div>
                <div><label className="text-[10px] text-slate-400 uppercase block font-bold">Trade Name</label><input value={invoice.vendor?.tradeName || ""} onChange={(e) => handlePartyUpdate("vendor", "tradeName", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-0.5 text-xs" /></div>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase block font-bold">TIN / VAT Registration {edited("vendor.taxId") && <span className="text-sky-700 normal-case">• Edited</span>}</label>
                <input
                  type="text"
                  data-field-path="vendor.taxId"
                  value={invoice.vendor?.taxId || ""}
                  onChange={(e) => handlePartyUpdate("vendor", "taxId", e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2.5 py-1.5 text-slate-800 font-mono mt-0.5 transition text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] text-slate-400 uppercase block font-bold">Branch Code</label><input value={invoice.vendor?.branchCode || ""} onChange={(e) => handlePartyUpdate("vendor", "branchCode", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-0.5 text-xs font-mono" /></div>
                <div><label className="text-[10px] text-slate-400 uppercase block font-bold">Tax Registration</label><select value={invoice.vendor?.taxRegistration || "UNKNOWN"} onChange={(e) => handlePartyUpdate("vendor", "taxRegistration", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-0.5 text-xs"><option value="VAT">VAT</option><option value="NON_VAT">Non-VAT</option><option value="UNKNOWN">Unknown</option></select></div>
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
              <div className="grid grid-cols-2 gap-2"><div><label className="text-[10px] text-slate-400 uppercase block font-bold">Barangay</label><input value={invoice.vendor?.barangay || ""} onChange={(e) => handlePartyUpdate("vendor", "barangay", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-0.5 text-xs" /></div><div><label className="text-[10px] text-slate-400 uppercase block font-bold">City / Municipality</label><input value={invoice.vendor?.cityMunicipality || invoice.vendor?.city || ""} onChange={(e) => handlePartyUpdate("vendor", "cityMunicipality", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-0.5 text-xs" /></div></div>
              <div className="grid grid-cols-2 gap-2"><div><label className="text-[10px] text-slate-400 uppercase block font-bold">Province</label><input value={invoice.vendor?.province || invoice.vendor?.state || ""} onChange={(e) => handlePartyUpdate("vendor", "province", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-0.5 text-xs" /></div><div><label className="text-[10px] text-slate-400 uppercase block font-bold">Region</label><input value={invoice.vendor?.region || ""} onChange={(e) => handlePartyUpdate("vendor", "region", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-0.5 text-xs" /></div></div>
              <div><label className="text-[10px] text-slate-400 uppercase block font-bold">Postal Code</label><input value={invoice.vendor?.postalCode || ""} onChange={(e) => handlePartyUpdate("vendor", "postalCode", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-0.5 text-xs font-mono" /></div>
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
                  data-field-path="customer.name"
                  value={invoice.customer?.name || ""}
                  onChange={(e) => handlePartyUpdate("customer", "name", e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2.5 py-1.5 text-slate-800 mt-0.5 transition font-medium"
                />
              </div>
              <div><label className="text-[10px] text-slate-400 uppercase block font-bold">Buyer Registered Name</label><input value={invoice.customer?.registeredName || ""} onChange={(e) => handlePartyUpdate("customer", "registeredName", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-0.5 text-xs" /></div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase block font-bold">Buyer TIN {edited("customer.taxId") && <span className="text-sky-700 normal-case">• Edited</span>}</label>
                <input
                  type="text"
                  data-field-path="customer.taxId"
                  value={invoice.customer?.taxId || ""}
                  onChange={(e) => handlePartyUpdate("customer", "taxId", e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2.5 py-1.5 text-slate-800 font-mono mt-0.5 transition text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2"><div><label className="text-[10px] text-slate-400 uppercase block font-bold">Barangay</label><input value={invoice.customer?.barangay || ""} onChange={(e) => handlePartyUpdate("customer", "barangay", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-0.5 text-xs" /></div><div><label className="text-[10px] text-slate-400 uppercase block font-bold">City / Municipality</label><input value={invoice.customer?.cityMunicipality || invoice.customer?.city || ""} onChange={(e) => handlePartyUpdate("customer", "cityMunicipality", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-0.5 text-xs" /></div></div>
              <div className="grid grid-cols-2 gap-2"><div><label className="text-[10px] text-slate-400 uppercase block font-bold">Province</label><input value={invoice.customer?.province || invoice.customer?.state || ""} onChange={(e) => handlePartyUpdate("customer", "province", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-0.5 text-xs" /></div><div><label className="text-[10px] text-slate-400 uppercase block font-bold">Country</label><input value={invoice.customer?.country || ""} onChange={(e) => handlePartyUpdate("customer", "country", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-0.5 text-xs" /></div></div>
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

          {(invoice.currency === "PHP" || invoice.philippineTaxDetails || invoice.vendor?.country?.toLowerCase().includes("philippines")) && <div className="bg-white border border-violet-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-violet-100"><div><h3 className="text-xs font-bold uppercase tracking-wider text-violet-900">Philippine Tax Details</h3><p className="text-[10px] text-violet-700 mt-1">Review aid only — not a legal certification.</p></div><select data-field-path="philippineTaxDetails.invoiceKind" value={invoice.philippineTaxDetails?.invoiceKind || "UNKNOWN"} onChange={(e) => handlePhilippineTaxUpdate("invoiceKind", e.target.value)} className="rounded-lg border border-violet-200 px-2 py-1 text-[10px] font-bold bg-white"><option value="VAT_INVOICE">VAT Invoice</option><option value="NON_VAT_INVOICE">Non-VAT Invoice</option><option value="UNKNOWN">Unknown</option></select></div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              {[["VATable Sales", "vatableSales"], ["VAT Amount", "vatAmount"], ["Zero-Rated", "zeroRatedSales"], ["VAT-Exempt", "vatExemptSales"], ["Withholding Tax", "withholdingTaxAmount"]].map(([label, field]) => <label key={field} className="text-[10px] text-slate-500 font-bold">{label} {edited(`philippineTaxDetails.${field}`) && <span className="text-sky-700 normal-case">• Edited</span>}<input data-field-path={`philippineTaxDetails.${field}`} type="number" step="0.01" value={(invoice.philippineTaxDetails as any)?.[field] ?? ""} onChange={(e) => handlePhilippineTaxUpdate(field, e.target.value === "" ? undefined : Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-800" /></label>)}
              <label className="text-[10px] text-slate-500 font-bold">Withholding Rate %<input type="number" step="0.01" value={invoice.philippineTaxDetails?.withholdingTaxRate ?? invoice.withholdingTaxRate ?? ""} onChange={(e) => handlePhilippineTaxUpdate("withholdingTaxRate", e.target.value === "" ? undefined : Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-800" /></label>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]"><label className="text-slate-500 font-bold">ATP / OCN<input value={invoice.philippineTaxDetails?.authorityToPrintNumber || invoice.philippineTaxDetails?.outboundCorrespondenceNumber || ""} onChange={(e) => handlePhilippineTaxUpdate("authorityToPrintNumber", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs" /></label><label className="text-slate-500 font-bold">Permit / BIR details<input value={invoice.philippineTaxDetails?.permitToUseNumber || invoice.philippineTaxDetails?.birPermitDetailsRaw || ""} onChange={(e) => handlePhilippineTaxUpdate("birPermitDetailsRaw", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs" /></label></div>
            {invoice.validation?.philippineVat?.applicable && <div className={`mt-3 rounded-xl p-3 text-[10px] ${invoice.validation.philippineVat.status === "PASS" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}><p className="font-black uppercase">12% VAT validation: {invoice.validation.philippineVat.status === "PASS" ? "PASS" : "NEEDS REVIEW"}</p>{invoice.validation.philippineVat.expectedVat !== undefined && <p className="mt-1">Expected: {formatMoney(invoice.validation.philippineVat.expectedVat, invoice.currency || "PHP")} • Document: {formatMoney(invoice.validation.philippineVat.documentVat || 0, invoice.currency || "PHP")} • Difference: {formatMoney(invoice.validation.philippineVat.difference || 0, invoice.currency || "PHP")}</p>}</div>}
            {invoice.philippineInvoiceCompleteness && invoice.philippineInvoiceCompleteness.status !== "NOT_APPLICABLE" && <div className="mt-3"><div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase text-slate-500">PH Invoice Completeness</p><span className={`text-[9px] font-bold ${invoice.philippineInvoiceCompleteness.status === "COMPLETE" ? "text-emerald-700" : "text-amber-700"}`}>{invoice.philippineInvoiceCompleteness.status.replaceAll("_", " ")}</span></div><div className="mt-2 grid grid-cols-1 gap-1 max-h-36 overflow-auto">{invoice.philippineInvoiceCompleteness.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 text-[10px]"><span className="truncate">{item.label}</span><span className={item.status === "COMPLETE" ? "text-emerald-700" : item.status === "NOT_APPLICABLE" ? "text-slate-400" : "text-amber-700"}>{item.status === "COMPLETE" ? "✓" : item.status === "NOT_APPLICABLE" ? "○" : "Review"}</span></div>)}</div></div>}
          </div>}

          {/* Original Preview (if image) */}
          {invoice.previewUrl && (
            <div className={`${compact ? "hidden" : ""} bg-white border border-slate-200 rounded-2xl p-4 shadow-sm`}>
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
        <div className={compact ? "space-y-4" : "lg:col-span-8 space-y-4"}>
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
                    <tr key={item.id} data-field-path={`items.${idx}.total`} className="hover:bg-slate-50/70 transition group">
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {item.itemNumber || idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          data-field-path={`items.${idx}.description`}
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
                          data-field-path={`items.${idx}.quantity`}
                          value={item.quantity}
                          onChange={(e) => handleUpdateLineItem(item.id, "quantity", Number(e.target.value))}
                          className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-indigo-500 rounded px-1.5 py-1 text-center text-slate-700 font-mono transition"
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <input
                          type="number"
                          step="any"
                          data-field-path={`items.${idx}.unitPrice`}
                          value={item.unitPrice}
                          onChange={(e) => handleUpdateLineItem(item.id, "unitPrice", Number(e.target.value))}
                          className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-indigo-500 rounded px-2 py-1 text-right text-slate-700 font-mono transition"
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {invoice.currency ? formatMoney(item.total, invoice.currency) : "—"}
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
                  <span className="text-slate-400 font-medium">Discount:</span>
                  <input type="number" step="any" value={invoice.totalDiscount || 0} onChange={(e) => handleFinancialUpdate("totalDiscount", Number(e.target.value))} className="w-16 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-xs text-slate-800" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-medium">Tax/VAT:</span>
                  <input
                    type="number"
                    step="any"
                    data-field-path="totalTax"
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
                      data-field-path="shippingFee"
                      value={invoice.shippingFee || 0}
                    onChange={(e) => handleFinancialUpdate("shippingFee", Number(e.target.value))}
                    className="w-16 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-xs text-slate-800"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-medium">Other fees:</span>
                  <input data-field-path="otherFees" type="number" step="any" value={invoice.otherFees || 0} onChange={(e) => handleFinancialUpdate("otherFees", Number(e.target.value))} className="w-16 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-xs text-slate-800" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-medium">Paid:</span>
                  <input data-field-path="amountPaid" type="number" step="any" value={invoice.amountPaid || 0} onChange={(e) => handleFinancialUpdate("amountPaid", Number(e.target.value))} className="w-16 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono text-xs text-slate-800" />
                </div>
              </div>

              <div className="flex items-center space-x-8">
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Subtotal</p>
                  <p data-field-path="subtotal" className="text-base font-bold text-slate-900 font-mono">
                    {invoice.currency ? formatMoney(invoice.subtotal, invoice.currency) : "Currency unclear"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">Grand Total</p>
                  <p data-field-path="grandTotal" className="text-xl font-black text-indigo-600 font-mono">
                    {invoice.currency ? formatMoney(invoice.grandTotal, invoice.currency) : "Currency unclear"}
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
