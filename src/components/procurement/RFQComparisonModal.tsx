import React, { useId, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Award,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck,
  FileText,
  HelpCircle,
  Info,
  Layers,
  Plus,
  RotateCcw,
  ShoppingCart,
  Truck,
  Undo2,
  X,
} from "lucide-react";
import type { RFQ, RFQLine, SupplierQuotation, SupplierQuotationLine, Vendor } from "../../types.ts";
import { formatDate, formatMoney } from "../../utils/invoiceLogic.ts";
import {
  compareRFQQuotations,
  type RFQComparisonReport,
  type SupplierQuotationComparisonSummary,
} from "../../utils/rfqComparison.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";

export interface RFQComparisonModalProps {
  open: boolean;
  rfq: RFQ;
  quotations: SupplierQuotation[];
  vendors: readonly Vendor[];
  canManage?: boolean;
  onSelectQuotation?: (quotationId: string, reason: string) => Promise<void>;
  onRevertSelection?: (rfqId: string, reason: string) => Promise<void>;
  onConvertToPO?: (quotationId: string, poNumber: string, notes?: string) => Promise<void>;
  onAddQuote?: () => void;
  onEditQuote?: (quotation: SupplierQuotation) => void;
  onClose: () => void;
}

export const RFQComparisonModal: React.FC<RFQComparisonModalProps> = ({
  open,
  rfq,
  quotations,
  vendors,
  canManage = true,
  onSelectQuotation,
  onRevertSelection,
  onConvertToPO,
  onAddQuote,
  onEditQuote,
  onClose,
}) => {
  const titleId = useId();
  const dialogRef = useDialogFocus({ open, onClose });

  // Active view on mobile: selected quotation ID or "all"
  const [mobileActiveQuoteId, setMobileActiveQuoteId] = useState<string>("");

  // Sub-dialog states
  const [selectionTarget, setSelectionTarget] = useState<SupplierQuotation | null>(null);
  const [selectionReason, setSelectionReason] = useState("");
  const [acknowledgedWarnings, setAcknowledgedWarnings] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);

  const [showRevertPrompt, setShowRevertPrompt] = useState(false);
  const [revertReason, setRevertReason] = useState("");
  const [isReverting, setIsReverting] = useState(false);

  const [poTarget, setPoTarget] = useState<SupplierQuotation | null>(null);
  const [poNumber, setPoNumber] = useState("");
  const [poNotes, setPoNotes] = useState("");
  const [isConverting, setIsConverting] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);

  // Comparison report from domain utility
  const report: RFQComparisonReport = useMemo(() => {
    return compareRFQQuotations(rfq, quotations);
  }, [rfq, quotations]);

  const summaryByQuoteId = useMemo(() => {
    const map = new Map<string, SupplierQuotationComparisonSummary>();
    for (const s of report.quotationSummaries) {
      map.set(s.quotationId, s);
    }
    return map;
  }, [report.quotationSummaries]);

  // Find currently selected quotation
  const selectedQuote = useMemo(() => {
    return quotations.find(
      (q) => q.id === rfq.selectedQuotationId || q.status === "SELECTED",
    );
  }, [quotations, rfq.selectedQuotationId]);

  // Mobile active quote fallback
  const activeMobileQuote = useMemo(() => {
    if (mobileActiveQuoteId) {
      const found = quotations.find((q) => q.id === mobileActiveQuoteId);
      if (found) return found;
    }
    return quotations[0] || null;
  }, [quotations, mobileActiveQuoteId]);

  // Selection handler
  const handleOpenSelection = (quote: SupplierQuotation) => {
    setSelectionTarget(quote);
    const summary = summaryByQuoteId.get(quote.id);
    const warnings = summary?.deterministicExplanations || [];
    setAcknowledgedWarnings(warnings.length === 0);

    const isLowest = report.lowestTotalPriceQuotationId === quote.id;
    if (isLowest) {
      setSelectionReason("Lowest compliant bidder on total package with required delivery schedule.");
    } else {
      setSelectionReason("");
    }
    setErrorMessage(null);
  };

  const handleConfirmSelection = async () => {
    if (!selectionTarget || !onSelectQuotation) return;
    const cleanReason = selectionReason.trim();
    if (!cleanReason) {
      setErrorMessage("Please state the reason for selecting this supplier.");
      return;
    }

    const summary = summaryByQuoteId.get(selectionTarget.id);
    const warnings = summary?.deterministicExplanations || [];
    if (warnings.length > 0 && !acknowledgedWarnings) {
      setErrorMessage("Please acknowledge the commercial / technical warnings before proceeding.");
      return;
    }

    setIsSelecting(true);
    try {
      await onSelectQuotation(selectionTarget.id, cleanReason);
      setSelectionTarget(null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to select supplier quotation.");
    } finally {
      setIsSelecting(false);
    }
  };

  // Revert handler
  const handleConfirmRevert = async () => {
    if (!onRevertSelection) return;
    const cleanReason = revertReason.trim() || "Selection reverted by user for re-evaluation.";
    setIsReverting(true);
    try {
      await onRevertSelection(rfq.id, cleanReason);
      setShowRevertPrompt(false);
      setRevertReason("");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to revert quotation selection.");
    } finally {
      setIsReverting(false);
    }
  };

  // Convert to PO handler
  const handleOpenPOConversion = (quote: SupplierQuotation) => {
    setPoTarget(quote);
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setPoNumber(`PO-25-${randomSuffix}`);
    setPoNotes(`Generated from RFQ ${rfq.rfqNumber} / Quotation ${quote.quotationNumber}`);
    setErrorMessage(null);
  };

  const handleConfirmPOConversion = async () => {
    if (!poTarget || !onConvertToPO) return;
    const cleanPoNumber = poNumber.trim().toUpperCase();
    if (!cleanPoNumber) {
      setErrorMessage("Purchase Order Number is required.");
      return;
    }

    setIsConverting(true);
    try {
      await onConvertToPO(poTarget.id, cleanPoNumber, poNotes.trim() || undefined);
      setPoTarget(null);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to generate draft Purchase Order.");
    } finally {
      setIsConverting(false);
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
        className="relative flex flex-col w-full max-w-6xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id={titleId} className="text-base font-bold text-slate-900">
                  Quotation Comparison — {rfq.rfqNumber}
                </h2>
                <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                  {rfq.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate max-w-xl">
                {rfq.title} • Currency: <span className="font-semibold text-slate-700">{rfq.currency}</span> •{" "}
                {quotations.length} Quotation{quotations.length === 1 ? "" : "s"} Received
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManage && onAddQuote && (
              <button
                type="button"
                onClick={onAddQuote}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Quote
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close comparison dialog"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Global Error Notice */}
        {errorMessage && (
          <div className="mx-6 mt-4 flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* Selected Supplier Audit Banner */}
        {selectedQuote && (
          <div className="border-b border-emerald-200 bg-emerald-50/70 px-6 py-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Award className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2 font-bold text-emerald-950">
                    <span>Selected Supplier: {vendorMap.get(selectedQuote.vendorId)?.name || "Unknown"}</span>
                    <span className="rounded bg-emerald-200/80 px-1.5 py-0.5 font-mono text-[10px] text-emerald-900">
                      {selectedQuote.quotationNumber}
                    </span>
                    <span className="font-mono text-emerald-800">
                      ({formatMoney(selectedQuote.totalAmount, selectedQuote.currency)})
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-800 mt-0.5">
                    {selectedQuote.selectedAt && (
                      <span>Selected on {formatDate(selectedQuote.selectedAt, "short")} • </span>
                    )}
                    <span className="italic font-medium">
                      &quot;{selectedQuote.selectionReason || "Preferred quotation chosen"}&quot;
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                {canManage && onConvertToPO && (
                  <button
                    type="button"
                    onClick={() => handleOpenPOConversion(selectedQuote)}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Create Draft PO
                  </button>
                )}
                {canManage && onRevertSelection && (
                  <button
                    type="button"
                    onClick={() => setShowRevertPrompt(true)}
                    className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 transition"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Revert Selection
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal Body / Comparison Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {quotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
              <FileCheck className="h-12 w-12 text-slate-300 mb-3" />
              <h3 className="text-sm font-bold text-slate-700">No Supplier Quotations Received Yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Invite suppliers and record quotations to compare pricing, delivery lead times, and terms side-by-side.
              </p>
              {canManage && onAddQuote && (
                <button
                  type="button"
                  onClick={onAddQuote}
                  className="mt-4 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
                >
                  <Plus className="h-4 w-4" />
                  Record First Quotation
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile View / Screen Toggle */}
              <div className="lg:hidden mb-4">
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {quotations.map((q) => {
                    const vendor = vendorMap.get(q.vendorId);
                    const isSelected = q.id === rfq.selectedQuotationId || q.status === "SELECTED";
                    const isCurrent = activeMobileQuote?.id === q.id;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setMobileActiveQuoteId(q.id)}
                        className={`shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                          isCurrent
                            ? "border-indigo-600 bg-indigo-50 text-indigo-950 font-bold"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <div className="text-xs truncate max-w-[140px]">{vendor?.name || "Vendor"}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {formatMoney(q.totalAmount, q.currency)}
                        </div>
                        {isSelected && (
                          <span className="inline-block mt-1 rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
                            Selected
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Desktop Comparison Table */}
              <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full border-collapse text-left text-xs">
                  {/* Table Header: Vendors & Quotations */}
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="sticky left-0 z-20 w-80 bg-slate-50 p-4 border-r border-slate-200">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          RFQ Requirements ({rfq.lines?.length || 0} items)
                        </div>
                      </th>
                      {quotations.map((q) => {
                        const vendor = vendorMap.get(q.vendorId);
                        const isSelected = q.id === rfq.selectedQuotationId || q.status === "SELECTED";

                        return (
                          <th
                            key={q.id}
                            className={`min-w-[240px] p-4 border-r border-slate-200 last:border-r-0 align-top ${
                              isSelected ? "bg-emerald-50/50" : ""
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-slate-900 text-sm truncate max-w-[180px]">
                                  {vendor?.name || "Unknown Supplier"}
                                </span>
                                {isSelected && (
                                  <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                    <Check className="h-3 w-3" /> Selected
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-[11px] text-slate-500">
                                Ref: {q.quotationNumber}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Dated {formatDate(q.quotationDate, "short")}
                              </div>

                              {/* Action buttons in header */}
                              <div className="pt-2 flex items-center gap-2">
                                {isSelected ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenPOConversion(q)}
                                      className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 transition"
                                    >
                                      <ShoppingCart className="h-3 w-3" /> Draft PO
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setShowRevertPrompt(true)}
                                      className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 transition"
                                    >
                                      Revert
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenSelection(q)}
                                    className="w-full flex items-center justify-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-600 hover:text-white transition"
                                  >
                                    <Award className="h-3.5 w-3.5" /> Select Supplier
                                  </button>
                                )}
                                {onEditQuote && (
                                  <button
                                    type="button"
                                    onClick={() => onEditQuote(q)}
                                    title="Edit quotation"
                                    className="rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  {/* Line Items Rows */}
                  <tbody className="divide-y divide-slate-200">
                    {report.lineComparisons.map((lc, index) => {
                      const rl = lc.rfqLine;

                      return (
                        <tr key={rl.id} className="hover:bg-slate-50/40">
                          {/* RFQ Line requirement */}
                          <td className="sticky left-0 z-10 bg-white p-3.5 border-r border-slate-200 font-medium">
                            <div className="flex items-start gap-2">
                              <span className="font-mono text-[11px] font-bold text-slate-400 mt-0.5">
                                #{index + 1}
                              </span>
                              <div>
                                <div className="text-slate-900 font-semibold">{rl.description}</div>
                                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                  Req: <span className="font-bold text-slate-700">{rl.quantity}</span> {rl.unit}
                                </div>
                                {rl.notes && (
                                  <div className="text-[10px] text-slate-400 mt-0.5 italic">{rl.notes}</div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Each supplier's response for this line */}
                          {quotations.map((q) => {
                            const isSelected = q.id === rfq.selectedQuotationId || q.status === "SELECTED";
                            const qEntry = lc.quotes[q.id];

                            if (!qEntry || qEntry.isMissing) {
                              return (
                                <td
                                  key={q.id}
                                  className={`p-3.5 border-r border-slate-200 last:border-r-0 text-slate-400 italic ${
                                    isSelected ? "bg-emerald-50/20" : ""
                                  }`}
                                >
                                  Not quoted
                                </td>
                              );
                            }

                            if (qEntry.isNoBid) {
                              return (
                                <td
                                  key={q.id}
                                  className={`p-3.5 border-r border-slate-200 last:border-r-0 bg-amber-50/30 ${
                                    isSelected ? "bg-emerald-50/20" : ""
                                  }`}
                                >
                                  <div className="space-y-1">
                                    <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                      <Ban className="h-3 w-3" /> No Bid
                                    </span>
                                    {qEntry.line?.notes && (
                                      <div className="text-[10px] text-slate-500">{qEntry.line.notes}</div>
                                    )}
                                  </div>
                                </td>
                              );
                            }

                            return (
                              <td
                                key={q.id}
                                className={`p-3.5 border-r border-slate-200 last:border-r-0 ${
                                  isSelected ? "bg-emerald-50/30" : ""
                                }`}
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-mono font-bold text-slate-900 text-xs">
                                      {formatMoney(qEntry.quotedUnitPrice || 0, q.currency)}
                                      <span className="text-[10px] font-normal text-slate-400">
                                        {" "}
                                        / {qEntry.quotedUnit || rl.unit}
                                      </span>
                                    </span>
                                    {qEntry.isLowestPrice && (
                                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-800 uppercase tracking-tight">
                                        Lowest
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-[11px] text-slate-600 font-mono">
                                    Total:{" "}
                                    <span className="font-semibold">
                                      {formatMoney(qEntry.quotedAmount || 0, q.currency)}
                                    </span>
                                  </div>

                                  {qEntry.leadTimeDays != null && (
                                    <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                      <Clock className="h-3 w-3 text-slate-400" />
                                      {qEntry.leadTimeDays} days lead time
                                    </div>
                                  )}

                                  {qEntry.line?.notes && (
                                    <div className="text-[10px] text-slate-400 italic truncate max-w-[200px]">
                                      {qEntry.line.notes}
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Table Footer: Totals, Warnings & Commercial Terms */}
                  <tfoot>
                    {/* Total Quotation Amount */}
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                      <td className="sticky left-0 z-10 bg-slate-50 p-4 border-r border-slate-200 text-slate-800">
                        Total Quotation Amount
                      </td>
                      {quotations.map((q) => {
                        const isSelected = q.id === rfq.selectedQuotationId || q.status === "SELECTED";
                        const isLowest = report.lowestTotalPriceQuotationId === q.id;

                        return (
                          <td
                            key={q.id}
                            className={`p-4 border-r border-slate-200 last:border-r-0 ${
                              isSelected ? "bg-emerald-100/50" : ""
                            }`}
                          >
                            <div className="text-base font-black text-slate-900 font-mono">
                              {formatMoney(q.totalAmount, q.currency)}
                            </div>
                            {isLowest && (
                              <div className="mt-1">
                                <span className="rounded-md bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                                  ★ Lowest Complete Bid
                                </span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Overall Lead Time */}
                    <tr className="border-t border-slate-200 bg-white">
                      <td className="sticky left-0 z-10 bg-white p-3 border-r border-slate-200 font-semibold text-slate-700">
                        Lead Time
                      </td>
                      {quotations.map((q) => (
                        <td key={q.id} className="p-3 border-r border-slate-200 last:border-r-0 text-slate-800">
                          {q.leadTimeDays != null ? `${q.leadTimeDays} calendar days` : "—"}
                        </td>
                      ))}
                    </tr>

                    {/* Payment Terms */}
                    <tr className="border-t border-slate-200 bg-slate-50/50">
                      <td className="sticky left-0 z-10 bg-slate-50 p-3 border-r border-slate-200 font-semibold text-slate-700">
                        Payment Terms
                      </td>
                      {quotations.map((q) => (
                        <td key={q.id} className="p-3 border-r border-slate-200 last:border-r-0 text-slate-700">
                          {q.paymentTerms || "—"}
                        </td>
                      ))}
                    </tr>

                    {/* Delivery Terms */}
                    <tr className="border-t border-slate-200 bg-white">
                      <td className="sticky left-0 z-10 bg-white p-3 border-r border-slate-200 font-semibold text-slate-700">
                        Delivery Terms
                      </td>
                      {quotations.map((q) => (
                        <td key={q.id} className="p-3 border-r border-slate-200 last:border-r-0 text-slate-700">
                          {q.deliveryTerms || "—"}
                        </td>
                      ))}
                    </tr>

                    {/* Validity Status */}
                    <tr className="border-t border-slate-200 bg-slate-50/50">
                      <td className="sticky left-0 z-10 bg-slate-50 p-3 border-r border-slate-200 font-semibold text-slate-700">
                        Validity Date
                      </td>
                      {quotations.map((q) => (
                        <td key={q.id} className="p-3 border-r border-slate-200 last:border-r-0 text-slate-700">
                          {q.validUntil ? formatDate(q.validUntil, "short") : "—"}
                        </td>
                      ))}
                    </tr>

                    {/* Warnings & Risk Flags */}
                    <tr className="border-t border-slate-200 bg-white">
                      <td className="sticky left-0 z-10 bg-white p-3 border-r border-slate-200 font-semibold text-slate-700">
                        Risk & Compliance Flags
                      </td>
                      {quotations.map((q) => {
                        const summary = summaryByQuoteId.get(q.id);
                        const explanations = summary?.deterministicExplanations || [];
                        return (
                          <td key={q.id} className="p-3 border-r border-slate-200 last:border-r-0">
                            {explanations.length === 0 ? (
                              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Fully Compliant
                              </span>
                            ) : (
                              <div className="space-y-1">
                                {explanations.map((exp, i) => (
                                  <div
                                    key={i}
                                    className="flex items-start gap-1 rounded px-2 py-1 text-[10px] font-medium leading-tight bg-amber-50 text-amber-800 border border-amber-200"
                                  >
                                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-600" />
                                    <span>{exp}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile Single-Quote Card View */}
              {activeMobileQuote && (
                <div className="lg:hidden space-y-4">
                  {(() => {
                    const q = activeMobileQuote;
                    const vendor = vendorMap.get(q.vendorId);
                    const isSelected = q.id === rfq.selectedQuotationId || q.status === "SELECTED";
                    const isLowest = report.lowestTotalPriceQuotationId === q.id;
                    const summary = summaryByQuoteId.get(q.id);
                    const explanations = summary?.deterministicExplanations || [];

                    return (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                          <div>
                            <div className="text-sm font-bold text-slate-900">{vendor?.name}</div>
                            <div className="text-xs text-slate-500 font-mono">Ref: {q.quotationNumber}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-base font-black font-mono text-slate-900">
                              {formatMoney(q.totalAmount, q.currency)}
                            </div>
                            {isSelected && (
                              <span className="inline-block mt-0.5 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                Selected
                              </span>
                            )}
                            {isLowest && !isSelected && (
                              <span className="inline-block mt-0.5 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                Lowest Complete
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Commercial Terms Summary */}
                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl">
                          <div>
                            <span className="text-slate-400 text-[10px] block">Lead Time:</span>
                            <span className="font-semibold text-slate-800">{q.leadTimeDays || "—"} days</span>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[10px] block">Valid Until:</span>
                            <span className="font-semibold text-slate-800">{q.validUntil || "—"}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400 text-[10px] block">Payment Terms:</span>
                            <span className="font-semibold text-slate-800">{q.paymentTerms || "—"}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400 text-[10px] block">Delivery Terms:</span>
                            <span className="font-semibold text-slate-800">{q.deliveryTerms || "—"}</span>
                          </div>
                        </div>

                        {/* Warnings */}
                        {explanations.length > 0 && (
                          <div className="space-y-1">
                            {explanations.map((msg, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"
                              >
                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                                <span>{msg}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Line items list */}
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Quoted Items
                          </span>
                          {report.lineComparisons.map((lc, index) => {
                            const rl = lc.rfqLine;
                            const qEntry = lc.quotes[q.id];

                            return (
                              <div
                                key={rl.id}
                                className="flex items-center justify-between rounded-lg border border-slate-100 p-2 text-xs"
                              >
                                <div>
                                  <div className="font-semibold text-slate-800">
                                    #{index + 1} {rl.description}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    Req: {rl.quantity} {rl.unit}
                                  </div>
                                </div>
                                <div className="text-right">
                                  {qEntry?.isNoBid ? (
                                    <span className="font-bold text-amber-700">No Bid</span>
                                  ) : qEntry ? (
                                    <div>
                                      <div className="font-mono font-bold text-slate-900">
                                        {formatMoney(qEntry.quotedUnitPrice || 0, q.currency)}
                                      </div>
                                      {qEntry.isLowestPrice && (
                                        <span className="rounded bg-emerald-100 px-1 py-0.2 text-[9px] font-extrabold text-emerald-800">
                                          Lowest
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 italic">Not quoted</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Action buttons */}
                        <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                          {isSelected ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenPOConversion(q)}
                                className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white"
                              >
                                <ShoppingCart className="h-3.5 w-3.5" /> Create Draft PO
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowRevertPrompt(true)}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                              >
                                Revert
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenSelection(q)}
                              className="w-full flex items-center justify-center gap-1 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                            >
                              <Award className="h-4 w-4" /> Select as Preferred Supplier
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="text-xs text-slate-500">
            {quotations.length} supplier quotation{quotations.length === 1 ? "" : "s"} evaluated
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Close
          </button>
        </div>
      </div>

      {/* Sub-Dialog: Supplier Selection & Justification */}
      {selectionTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Select Preferred Supplier</h3>
                <p className="text-xs text-slate-500">
                  {vendorMap.get(selectionTarget.vendorId)?.name} • {selectionTarget.quotationNumber}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Quotation Total:</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatMoney(selectionTarget.totalAmount, selectionTarget.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Quoted Lead Time:</span>
                <span className="font-semibold text-slate-700">{selectionTarget.leadTimeDays || "—"} days</span>
              </div>
            </div>

            {/* Warnings list if any */}
            {(() => {
              const summary = summaryByQuoteId.get(selectionTarget.id);
              const explanations = summary?.deterministicExplanations || [];
              if (explanations.length === 0) return null;
              return (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
                  <div className="font-bold text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Commercial / Technical Warnings:
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                    {explanations.map((exp, i) => (
                      <li key={i}>{exp}</li>
                    ))}
                  </ul>

                  <label className="flex items-start gap-2 pt-2 border-t border-amber-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acknowledgedWarnings}
                      onChange={(e) => setAcknowledgedWarnings(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-amber-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-[11px] font-semibold text-amber-900">
                      I acknowledge these deviations and confirm selection rationale.
                    </span>
                  </label>
                </div>
              );
            })()}

            {/* Selection Reason */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Selection Reason / Justification <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={selectionReason}
                onChange={(e) => setSelectionReason(e.target.value)}
                placeholder="State why this supplier is preferred (e.g. lowest price, best delivery timeline, technical warranty compliance)..."
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectionTarget(null)}
                disabled={isSelecting}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSelection}
                disabled={isSelecting}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSelecting ? "Selecting..." : "Confirm Selection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Dialog: Revert Selection Prompt */}
      {showRevertPrompt && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Revert Supplier Selection</h3>
                <p className="text-xs text-slate-500">
                  Reset the preferred status and allow re-evaluating quotes.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Reversion
              </label>
              <textarea
                rows={2}
                value={revertReason}
                onChange={(e) => setRevertReason(e.target.value)}
                placeholder="e.g. Scope revision, vendor lead time change, re-negotiation..."
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowRevertPrompt(false)}
                disabled={isReverting}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRevert}
                disabled={isReverting}
                className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
              >
                {isReverting ? "Reverting..." : "Revert Selection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Dialog: Convert to Draft PO */}
      {poTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Generate Draft Purchase Order</h3>
                <p className="text-xs text-slate-500">
                  From {vendorMap.get(poTarget.vendorId)?.name} • Ref: {poTarget.quotationNumber}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 space-y-1">
              <div className="font-semibold flex items-center gap-1">
                <Info className="h-3.5 w-3.5 text-blue-600" />
                Pre-Commitment Boundary Notice:
              </div>
              <p className="text-[11px] text-blue-800">
                Generating a Purchase Order creates an uncommitted DRAFT order. Commercial obligations and
                Committed Cost are established only upon formal approval by authorized project leadership.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Purchase Order # <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value.toUpperCase())}
                placeholder="e.g. PO-25-0028"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Order Notes</label>
              <textarea
                rows={2}
                value={poNotes}
                onChange={(e) => setPoNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="font-mono font-bold text-slate-900 text-xs">
                Amount: {formatMoney(poTarget.totalAmount, poTarget.currency)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPoTarget(null)}
                  disabled={isConverting}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPOConversion}
                  disabled={isConverting}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isConverting ? "Generating..." : "Create Draft PO"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
