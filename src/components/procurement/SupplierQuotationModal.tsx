import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Ban, CheckCircle2, DollarSign, FileCheck, Info, X } from "lucide-react";
import type { RFQ, RFQLine, SupplierQuotation, SupplierQuotationLine, Vendor } from "../../types.ts";
import { formatMoney } from "../../utils/invoiceLogic.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";

export interface SupplierQuotationModalProps {
  open: boolean;
  rfq: RFQ;
  quotation?: SupplierQuotation | null;
  vendors: readonly Vendor[];
  onSave: (
    quotation: Partial<SupplierQuotation> & { rfqId: string; vendorId: string; quotationNumber: string },
    lines: Array<Partial<SupplierQuotationLine> & { description: string; quantity: number; unitPrice: number }>,
  ) => Promise<void> | void;
  onClose: () => void;
}

interface EditableQuoteLine {
  id?: string;
  rfqLineId?: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  amount: number;
  leadTimeDays: string;
  isNoBid: boolean;
  notes: string;
}

export const SupplierQuotationModal: React.FC<SupplierQuotationModalProps> = ({
  open,
  rfq,
  quotation,
  vendors,
  onSave,
  onClose,
}) => {
  const titleId = useId();
  const dialogRef = useDialogFocus({ open, onClose });

  const isEditing = Boolean(quotation?.id);

  const [vendorId, setVendorId] = useState(() => quotation?.vendorId || "");
  const [quotationNumber, setQuotationNumber] = useState(() => quotation?.quotationNumber || "");
  const [quotationDate, setQuotationDate] = useState(
    () => quotation?.quotationDate || new Date().toISOString().split("T")[0],
  );
  const [validUntil, setValidUntil] = useState(() => quotation?.validUntil || "");
  const [currency, setCurrency] = useState(() => quotation?.currency || rfq.currency || "PHP");
  const [paymentTerms, setPaymentTerms] = useState(() => quotation?.paymentTerms || "");
  const [deliveryTerms, setDeliveryTerms] = useState(() => quotation?.deliveryTerms || "");
  const [leadTimeDays, setLeadTimeDays] = useState(
    () => (quotation?.leadTimeDays != null ? String(quotation.leadTimeDays) : ""),
  );
  const [notes, setNotes] = useState(() => quotation?.notes || "");
  const [lines, setLines] = useState<EditableQuoteLine[]>(() => {
    if (quotation) {
      const quoteLineMap = new Map<string, SupplierQuotationLine>();
      for (const ql of quotation.lines || []) {
        if (ql.rfqLineId) quoteLineMap.set(ql.rfqLineId, ql);
      }
      if (rfq.lines && rfq.lines.length > 0) {
        return rfq.lines.map((rl, idx) => {
          const ql = quoteLineMap.get(rl.id);
          const qty = ql ? ql.quantity : rl.quantity;
          const price = ql ? ql.unitPrice : 0;
          const isNoBid = ql ? Boolean(ql.isNoBid) : false;
          const amt = isNoBid ? 0 : Math.round(qty * price * 100) / 100;
          return {
            id: ql?.id,
            rfqLineId: rl.id,
            lineNumber: idx + 1,
            description: ql?.description || rl.description,
            quantity: String(qty),
            unit: ql?.unit || rl.unit || "pcs",
            unitPrice: String(price),
            amount: amt,
            leadTimeDays: ql?.leadTimeDays != null ? String(ql.leadTimeDays) : "",
            isNoBid,
            notes: ql?.notes || "",
          };
        });
      } else if (quotation.lines && quotation.lines.length > 0) {
        return quotation.lines.map((ql, idx) => ({
          id: ql.id,
          rfqLineId: ql.rfqLineId || undefined,
          lineNumber: idx + 1,
          description: ql.description,
          quantity: String(ql.quantity),
          unit: ql.unit || "pcs",
          unitPrice: String(ql.unitPrice),
          amount: ql.amount,
          leadTimeDays: ql.leadTimeDays != null ? String(ql.leadTimeDays) : "",
          isNoBid: Boolean(ql.isNoBid),
          notes: ql.notes || "",
        }));
      }
    } else if (rfq.lines && rfq.lines.length > 0) {
      return rfq.lines.map((rl, idx) => ({
        rfqLineId: rl.id,
        lineNumber: idx + 1,
        description: rl.description,
        quantity: String(rl.quantity),
        unit: rl.unit || "pcs",
        unitPrice: "",
        amount: 0,
        leadTimeDays: "",
        isNoBid: false,
        notes: "",
      }));
    }
    return [];
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Invited vendor IDs from RFQ
  const invitedVendorIds = useMemo(() => {
    return new Set(rfq.invitedVendorIds || rfq.invitedVendors?.map((iv) => iv.vendorId) || []);
  }, [rfq]);

  // Initial load
  useEffect(() => {
    if (quotation) {
      setVendorId(quotation.vendorId || "");
      setQuotationNumber(quotation.quotationNumber || "");
      setQuotationDate(quotation.quotationDate || new Date().toISOString().split("T")[0]);
      setValidUntil(quotation.validUntil || "");
      setCurrency(quotation.currency || rfq.currency || "PHP");
      setPaymentTerms(quotation.paymentTerms || "");
      setDeliveryTerms(quotation.deliveryTerms || "");
      setLeadTimeDays(quotation.leadTimeDays != null ? String(quotation.leadTimeDays) : "");
      setNotes(quotation.notes || "");

      // Map lines from existing quotation or fallback to RFQ lines
      const quoteLineMap = new Map<string, SupplierQuotationLine>();
      for (const ql of quotation.lines || []) {
        if (ql.rfqLineId) quoteLineMap.set(ql.rfqLineId, ql);
      }

      if (rfq.lines && rfq.lines.length > 0) {
        const mapped = rfq.lines.map((rl, idx) => {
          const ql = quoteLineMap.get(rl.id);
          const qty = ql ? ql.quantity : rl.quantity;
          const price = ql ? ql.unitPrice : 0;
          const isNoBid = ql ? Boolean(ql.isNoBid) : false;
          const amt = isNoBid ? 0 : Math.round(qty * price * 100) / 100;
          return {
            id: ql?.id,
            rfqLineId: rl.id,
            lineNumber: idx + 1,
            description: ql?.description || rl.description,
            quantity: String(qty),
            unit: ql?.unit || rl.unit || "pcs",
            unitPrice: String(price),
            amount: amt,
            leadTimeDays: ql?.leadTimeDays != null ? String(ql.leadTimeDays) : "",
            isNoBid,
            notes: ql?.notes || "",
          };
        });
        setLines(mapped);
      } else if (quotation.lines && quotation.lines.length > 0) {
        setLines(
          quotation.lines.map((ql, idx) => ({
            id: ql.id,
            rfqLineId: ql.rfqLineId || undefined,
            lineNumber: idx + 1,
            description: ql.description,
            quantity: String(ql.quantity),
            unit: ql.unit || "pcs",
            unitPrice: String(ql.unitPrice),
            amount: ql.amount,
            leadTimeDays: ql.leadTimeDays != null ? String(ql.leadTimeDays) : "",
            isNoBid: Boolean(ql.isNoBid),
            notes: ql.notes || "",
          })),
        );
      } else {
        setLines([]);
      }
    } else {
      // New quotation form
      const firstInvited = Array.from(invitedVendorIds)[0];
      setVendorId(firstInvited || (vendors[0]?.id ?? ""));
      setQuotationNumber("");
      setQuotationDate(new Date().toISOString().split("T")[0]);
      setValidUntil("");
      setCurrency(rfq.currency || "PHP");
      setPaymentTerms("30 days net upon delivery");
      setDeliveryTerms("DDP Jobsite");
      setLeadTimeDays("14");
      setNotes("");

      // Pre-populate lines from RFQ lines
      if (rfq.lines && rfq.lines.length > 0) {
        setLines(
          rfq.lines.map((rl, idx) => ({
            rfqLineId: rl.id,
            lineNumber: idx + 1,
            description: rl.description,
            quantity: String(rl.quantity),
            unit: rl.unit || "pcs",
            unitPrice: "0",
            amount: 0,
            leadTimeDays: "",
            isNoBid: false,
            notes: "",
          })),
        );
      } else {
        setLines([]);
      }
    }
    setErrorMessage(null);
  }, [quotation, rfq, vendors, invitedVendorIds, open]);

  const handleLineChange = (index: number, field: keyof EditableQuoteLine, value: string | boolean) => {
    setLines((prev) => {
      const next = [...prev];
      const current = { ...next[index], [field]: value };

      // Recalculate amount if quantity or unitPrice or isNoBid changed
      if (current.isNoBid) {
        current.amount = 0;
      } else {
        const qty = parseFloat(current.quantity) || 0;
        const price = parseFloat(current.unitPrice) || 0;
        current.amount = Math.round(qty * price * 100) / 100;
      }

      next[index] = current;
      return next;
    });
  };

  // Running total calculation
  const totalAmount = useMemo(() => {
    return lines.reduce((sum, line) => sum + (line.isNoBid ? 0 : line.amount), 0);
  }, [lines]);

  const noBidCount = useMemo(() => {
    return lines.filter((l) => l.isNoBid).length;
  }, [lines]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!vendorId) {
      setErrorMessage("Please select a vendor.");
      return;
    }

    const cleanQuoteNumber = quotationNumber.trim();
    if (!cleanQuoteNumber) {
      setErrorMessage("Quotation reference number is required.");
      return;
    }

    const preparedLines: Array<Partial<SupplierQuotationLine> & { description: string; quantity: number; unitPrice: number }> = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const qty = parseFloat(line.quantity) || 0;
      const unitPrice = parseFloat(line.unitPrice) || 0;
      const leadTime = line.leadTimeDays ? parseInt(line.leadTimeDays, 10) : null;

      if (!line.isNoBid && qty <= 0) {
        setErrorMessage(`Line ${i + 1}: Quoted quantity must be greater than 0.`);
        return;
      }

      if (!line.isNoBid && unitPrice < 0) {
        setErrorMessage(`Line ${i + 1}: Unit price cannot be negative.`);
        return;
      }

      preparedLines.push({
        id: line.id,
        rfqLineId: line.rfqLineId || null,
        lineNumber: i + 1,
        description: line.description.trim() || `Item ${i + 1}`,
        quantity: line.isNoBid ? 0 : qty,
        unit: line.unit.trim() || "pcs",
        unitPrice: line.isNoBid ? 0 : unitPrice,
        amount: line.isNoBid ? 0 : Math.round(qty * unitPrice * 100) / 100,
        leadTimeDays: leadTime,
        isNoBid: line.isNoBid,
        notes: line.notes.trim() || null,
      });
    }

    const parsedLeadTime = leadTimeDays ? parseInt(leadTimeDays, 10) : null;

    setIsSubmitting(true);
    try {
      await onSave(
        {
          id: quotation?.id,
          rfqId: rfq.id,
          vendorId,
          quotationNumber: cleanQuoteNumber,
          quotationDate: quotationDate || new Date().toISOString().split("T")[0],
          validUntil: validUntil || null,
          currency: currency.trim().toUpperCase() || "PHP",
          paymentTerms: paymentTerms.trim() || null,
          deliveryTerms: deliveryTerms.trim() || null,
          leadTimeDays: parsedLeadTime,
          notes: notes.trim() || null,
          totalAmount,
        },
        preparedLines,
      );
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save quotation. Please try again.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-bold text-slate-900">
                {isEditing ? `Edit Quotation: ${quotation?.quotationNumber}` : "Record Supplier Quotation"}
              </h2>
              <p className="text-xs text-slate-500">
                For RFQ <span className="font-semibold text-slate-700">{rfq.rfqNumber}</span> — {rfq.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto">
          <div className="space-y-6 p-6">
            {/* Error Banner */}
            {errorMessage && (
              <div
                role="alert"
                className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs text-rose-800"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span className="font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Vendor & Quotation Details Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Supplier / Vendor <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">Select Vendor</option>
                  <optgroup label="Invited Vendors">
                    {vendors
                      .filter((v) => invitedVendorIds.has(v.id))
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          ★ {v.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Other Vendors">
                    {vendors
                      .filter((v) => !invitedVendorIds.has(v.id))
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quotation Ref # <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={quotationNumber}
                  onChange={(e) => setQuotationNumber(e.target.value)}
                  placeholder="e.g. QUO-MS-2025-088"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="PHP">PHP (Philippine Peso)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="JPY">JPY (Japanese Yen)</option>
                  <option value="SGD">SGD (Singapore Dollar)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Quotation Date</label>
                  <input
                    type="date"
                    required
                    value={quotationDate}
                    onChange={(e) => setQuotationDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Valid Until</label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Overall Lead Time (Days)</label>
                <input
                  type="number"
                  min="0"
                  value={leadTimeDays}
                  onChange={(e) => setLeadTimeDays(e.target.value)}
                  placeholder="e.g. 14"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Terms</label>
                <input
                  type="text"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder="e.g. 30 days net upon delivery"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Delivery Terms / Incoterms</label>
                <input
                  type="text"
                  value={deliveryTerms}
                  onChange={(e) => setDeliveryTerms(e.target.value)}
                  placeholder="e.g. DDP Jobsite Novaliches / Ex-Works Muntinlupa"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Quotation Line Items</span>
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-extrabold text-purple-700">
                    {lines.length} items
                  </span>
                  {noBidCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      {noBidCount} No-Bid
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  Total Quote: <span className="font-mono font-bold text-slate-900">{formatMoney(totalAmount, currency)}</span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">#</th>
                      <th className="px-3 py-2 min-w-[200px]">Description</th>
                      <th className="px-3 py-2 w-20">Qty</th>
                      <th className="px-3 py-2 w-16">Unit</th>
                      <th className="px-3 py-2 w-28">Unit Price ({currency})</th>
                      <th className="px-3 py-2 w-28 text-right">Amount</th>
                      <th className="px-3 py-2 w-20">Lead Time</th>
                      <th className="px-3 py-2 text-center w-16">No Bid</th>
                      <th className="px-3 py-2 min-w-[140px]">Supplier Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((line, idx) => (
                      <tr
                        key={line.id || idx}
                        className={line.isNoBid ? "bg-amber-50/40 opacity-70" : "hover:bg-slate-50/50"}
                      >
                        <td className="px-3 py-2 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:border-purple-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={line.isNoBid}
                            value={line.quantity}
                            onChange={(e) => handleLineChange(idx, "quantity", e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono text-slate-900 disabled:bg-slate-100 focus:border-purple-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            disabled={line.isNoBid}
                            value={line.unit}
                            onChange={(e) => handleLineChange(idx, "unit", e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 disabled:bg-slate-100 focus:border-purple-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={line.isNoBid}
                            value={line.unitPrice}
                            onChange={(e) => handleLineChange(idx, "unitPrice", e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono text-slate-900 disabled:bg-slate-100 focus:border-purple-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                          {line.isNoBid ? (
                            <span className="text-amber-700 font-sans text-[11px] font-semibold">No Bid</span>
                          ) : (
                            formatMoney(line.amount, currency)
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            placeholder="days"
                            disabled={line.isNoBid}
                            value={line.leadTimeDays}
                            onChange={(e) => handleLineChange(idx, "leadTimeDays", e.target.value)}
                            className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs font-mono text-slate-900 disabled:bg-slate-100 focus:border-purple-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={line.isNoBid}
                            onChange={(e) => handleLineChange(idx, "isNoBid", e.target.checked)}
                            title="Mark line as No Bid"
                            className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={line.notes}
                            onChange={(e) => handleLineChange(idx, "notes", e.target.value)}
                            placeholder="Brand, deviations, comments..."
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:border-purple-500 focus:outline-none"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Additional Quotation Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Discounts offered, tax treatment inclusions, technical compliance remarks..."
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-500">
                Total Quotation:{" "}
                <span className="text-sm font-black text-slate-900 font-mono">
                  {formatMoney(totalAmount, currency)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50 transition"
              >
                {isSubmitting ? "Saving..." : isEditing ? "Update Quotation" : "Record Quotation"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
