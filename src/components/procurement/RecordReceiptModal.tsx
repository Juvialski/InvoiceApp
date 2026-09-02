import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle, PackageCheck, Truck, X } from "lucide-react";
import type { PurchaseOrder, PurchaseOrderReceipt } from "../../types.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";
import { calculateLineReceiptProgress, calculatePOReceiptProgress, roundQuantity } from "../../utils/purchaseOrderReceipts.ts";

export interface RecordReceiptModalProps {
  open: boolean;
  purchaseOrder: PurchaseOrder;
  existingReceipts?: readonly PurchaseOrderReceipt[];
  onRecordReceipt: (
    receipt: Partial<PurchaseOrderReceipt> & { purchaseOrderId: string; receiptNumber: string },
    lines: Array<{ purchaseOrderLineId: string; receivedQuantity: number; notes?: string }>,
  ) => Promise<void> | void;
  onClose: () => void;
}

export const RecordReceiptModal: React.FC<RecordReceiptModalProps> = ({
  open,
  purchaseOrder,
  existingReceipts = [],
  onRecordReceipt,
  onClose,
}) => {
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [supplierDeliveryReference, setSupplierDeliveryReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lineQuantities, setLineQuantities] = useState<Record<string, string>>({});
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const receiptNumberInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus({
    open,
    onClose: () => {
      if (!isSubmitting) onClose();
    },
    initialFocusRef: receiptNumberInputRef,
  });

  const poProgress = useMemo(() => {
    return calculatePOReceiptProgress(purchaseOrder, existingReceipts);
  }, [purchaseOrder, existingReceipts]);

  const poLines = purchaseOrder.lines || [];

  useEffect(() => {
    if (open) {
      const year = new Date().getFullYear().toString().slice(-2);
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      setReceiptNumber(`REC-${year}-${randomNum}`);
      setReceiptDate(new Date().toISOString().split("T")[0]);
      setSupplierDeliveryReference("");
      setNotes("");
      setErrorMessage(null);

      // Initialize empty line quantities
      const initialQty: Record<string, string> = {};
      const initialNotes: Record<string, string> = {};
      for (const line of poLines) {
        initialQty[line.id] = "";
        initialNotes[line.id] = "";
      }
      setLineQuantities(initialQty);
      setLineNotes(initialNotes);
    }
  }, [open, purchaseOrder, poLines]);

  if (!open) return null;

  const handleFillAllRemaining = () => {
    const updated: Record<string, string> = {};
    for (const line of poLines) {
      const remaining = poProgress.lines[line.id]?.remainingQuantity ?? line.quantity;
      updated[line.id] = remaining > 0 ? String(remaining) : "";
    }
    setLineQuantities(updated);
  };

  const handleFillLineRemaining = (lineId: string) => {
    const remaining = poProgress.lines[lineId]?.remainingQuantity ?? 0;
    if (remaining > 0) {
      setLineQuantities((prev) => ({
        ...prev,
        [lineId]: String(remaining),
      }));
    }
  };

  const totalReceivingCount = poLines.reduce((count, line) => {
    const val = Number(lineQuantities[line.id]);
    return val > 0 ? count + 1 : count;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptNumber.trim()) {
      setErrorMessage("Delivery / Receipt Number is required.");
      return;
    }
    if (!receiptDate) {
      setErrorMessage("Receipt date is required.");
      return;
    }

    const linesToSubmit: Array<{ purchaseOrderLineId: string; receivedQuantity: number; notes?: string }> = [];

    for (const line of poLines) {
      const rawQty = lineQuantities[line.id]?.trim();
      if (!rawQty) continue;

      const qty = Number(rawQty);
      if (isNaN(qty) || qty <= 0) {
        setErrorMessage(`Invalid quantity for line "${line.description}". Must be a positive number.`);
        return;
      }

      const remaining = poProgress.lines[line.id]?.remainingQuantity ?? line.quantity;
      if (roundQuantity(qty) > roundQuantity(remaining)) {
        setErrorMessage(
          `Over-receipt rejected: Attempting to receive ${qty} ${line.unit}, but only ${remaining} ${line.unit} remain outstanding for line "${line.description}".`,
        );
        return;
      }

      linesToSubmit.push({
        purchaseOrderLineId: line.id,
        receivedQuantity: qty,
        notes: lineNotes[line.id]?.trim() || undefined,
      });
    }

    if (linesToSubmit.length === 0) {
      setErrorMessage("Please enter a positive received quantity for at least one line item.");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await onRecordReceipt(
        {
          purchaseOrderId: purchaseOrder.id,
          receiptNumber: receiptNumber.trim().toUpperCase(),
          receiptDate,
          supplierDeliveryReference: supplierDeliveryReference.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        linesToSubmit,
      );
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to record purchase order receipt");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-receipt-title"
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h2 id="record-receipt-title" className="text-base font-bold text-slate-900">
                Record Delivery / Goods Receipt
              </h2>
              <p className="text-xs text-slate-500">
                Purchase Order <span className="font-mono font-semibold text-slate-800">{purchaseOrder.poNumber}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <div className="flex-1 font-medium">{errorMessage}</div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto px-6 py-4 space-y-5">
          {/* Header Metadata */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Receipt / GRN # <span className="text-rose-500">*</span>
              </label>
              <input
                ref={receiptNumberInputRef}
                type="text"
                required
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value.toUpperCase())}
                placeholder="REC-24-0001"
                className="w-full font-mono rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Receipt Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="w-full font-mono rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Supplier DR / Reference
              </label>
              <input
                type="text"
                value={supplierDeliveryReference}
                onChange={(e) => setSupplierDeliveryReference(e.target.value)}
                placeholder="e.g. DR-89412"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
              Delivery Notes / Inspection Remarks
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Verified by Site Engineer Carlo Mendoza; delivered in good order and condition."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Line Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                PO Line Deliveries
              </span>
              <button
                type="button"
                onClick={handleFillAllRemaining}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                Receive All Remaining Items
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3.5 py-2.5">Line # & Description</th>
                      <th className="px-3 py-2.5 text-right">Ordered</th>
                      <th className="px-3 py-2.5 text-right">Prev. Received</th>
                      <th className="px-3 py-2.5 text-right font-bold text-indigo-900">Remaining</th>
                      <th className="px-3.5 py-2.5 text-right w-36">Qty Receiving</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {poLines.map((line, idx) => {
                      const lineProg = poProgress.lines[line.id] || calculateLineReceiptProgress(line, existingReceipts);
                      const isLineComplete = lineProg.remainingQuantity === 0;
                      return (
                        <tr
                          key={line.id}
                          className={isLineComplete ? "bg-slate-50/50 text-slate-400" : "hover:bg-slate-50/80"}
                        >
                          <td className="px-3.5 py-3">
                            <div className="font-semibold text-slate-800">
                              <span className="text-slate-400 mr-1.5 font-mono">{idx + 1}.</span>
                              {line.description}
                            </div>
                            <div className="text-[10px] text-slate-400">Unit: {line.unit}</div>
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-600">
                            {lineProg.orderedQuantity} {line.unit}
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-600">
                            {lineProg.receivedQuantity} {line.unit}
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-indigo-700">
                            {lineProg.remainingQuantity} {line.unit}
                          </td>
                          <td className="px-3.5 py-3 text-right">
                            {isLineComplete ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                                <CheckCircle className="h-3.5 w-3.5" /> Fully Received
                              </span>
                            ) : (
                              <div className="flex items-center justify-end gap-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  max={lineProg.remainingQuantity}
                                  step="any"
                                  value={lineQuantities[line.id] || ""}
                                  onChange={(e) =>
                                    setLineQuantities((prev) => ({
                                      ...prev,
                                      [line.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="0"
                                  className="w-24 font-mono font-bold text-right rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleFillLineRemaining(line.id)}
                                  title="Receive full remaining quantity"
                                  className="px-1.5 py-1 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 rounded border border-indigo-200"
                                >
                                  Max
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between border-t border-slate-200 pt-4 mt-6">
            <div className="text-xs text-slate-500">
              {totalReceivingCount > 0 ? (
                <span className="font-semibold text-slate-800">
                  Receiving items on {totalReceivingCount} line{totalReceivingCount > 1 ? "s" : ""}
                </span>
              ) : (
                <span>Enter received quantities above</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || totalReceivingCount === 0}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <PackageCheck className="h-4 w-4" />
                {isSubmitting ? "Recording..." : "Record Goods Receipt"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
