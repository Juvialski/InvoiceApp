import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Info,
  Layers,
  Lock,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  Truck,
  X,
} from "lucide-react";
import type {
  InvoiceData,
  LineItem,
  Project,
  PurchaseOrder,
  PurchaseOrderInvoiceMatch,
  PurchaseOrderLine,
  PurchaseOrderReceipt,
  Vendor,
} from "../../types.ts";
import { formatDate, formatMoney } from "../../utils/invoiceLogic.ts";
import {
  findPurchaseOrderMatchCandidates,
  normalizePoNumber,
  validateMatchLineAssociations,
} from "../../utils/purchaseOrderMatching.ts";
import { calculatePOReceiptProgress } from "../../utils/purchaseOrderReceipts.ts";

export interface PurchaseOrderMatchSectionProps {
  invoice: InvoiceData;
  purchaseOrders: readonly PurchaseOrder[];
  receipts?: readonly PurchaseOrderReceipt[];
  vendors: readonly Vendor[];
  projects: readonly Project[];
  matches: readonly PurchaseOrderInvoiceMatch[];
  readOnly?: boolean;
  canManage?: boolean; // Requires both invoices.manage and procurement.manage
  onConfirmMatch?: (
    poId: string,
    lines: Array<{
      invoiceLineId: string;
      purchaseOrderLineId: string;
      matchedQuantity?: number;
      matchedAmount?: number;
    }>,
    notes?: string,
  ) => Promise<void>;
  onUnmatch?: (matchId: string, reason: string) => Promise<void>;
  onOpenPurchaseOrder?: (purchaseOrderId: string) => void;
}

interface LineDraftState {
  purchaseOrderLineId: string;
  matchedQuantity: number;
  matchedAmount: number;
}

export const PurchaseOrderMatchSection: React.FC<PurchaseOrderMatchSectionProps> = ({
  invoice,
  purchaseOrders,
  receipts = [],
  vendors,
  projects,
  matches,
  readOnly = false,
  canManage = false,
  onConfirmMatch,
  onUnmatch,
  onOpenPurchaseOrder,
}) => {
  // 1. Check for an active confirmed match
  const confirmedMatch = useMemo(() => {
    return matches.find((m) => m.invoiceId === invoice.id && m.status === "CONFIRMED");
  }, [matches, invoice.id]);

  const matchedPo = useMemo(() => {
    if (!confirmedMatch) return undefined;
    return purchaseOrders.find((p) => p.id === confirmedMatch.purchaseOrderId);
  }, [confirmedMatch, purchaseOrders]);

  const matchedVendor = useMemo(() => {
    if (!matchedPo) return undefined;
    return vendors.find((v) => v.id === matchedPo.vendorId);
  }, [matchedPo, vendors]);

  const matchedProject = useMemo(() => {
    if (!matchedPo) return undefined;
    return projects.find((p) => p.id === matchedPo.projectId);
  }, [matchedPo, projects]);

  const poReceiptProgress = useMemo(() => {
    if (!matchedPo) return null;
    return calculatePOReceiptProgress(matchedPo, receipts);
  }, [matchedPo, receipts]);

  // 2. Extracted PO number analysis
  const normalizedExtractedPo = useMemo(() => {
    return normalizePoNumber(invoice.purchaseOrderNumber);
  }, [invoice.purchaseOrderNumber]);

  const authoritativePoByExtracted = useMemo(() => {
    if (!normalizedExtractedPo) return undefined;
    return purchaseOrders.find((p) => normalizePoNumber(p.poNumber) === normalizedExtractedPo);
  }, [normalizedExtractedPo, purchaseOrders]);

  // 3. Unmatch State & Dialog
  const [showUnmatchModal, setShowUnmatchModal] = useState(false);
  const [unmatchReason, setUnmatchReason] = useState("");
  const [unmatchError, setUnmatchError] = useState<string | null>(null);
  const [isUnmatching, setIsUnmatching] = useState(false);

  // 4. Candidate Matching State (when NOT matched)
  const candidates = useMemo(() => {
    if (confirmedMatch) return [];
    return findPurchaseOrderMatchCandidates(
      invoice,
      purchaseOrders as PurchaseOrder[],
      {
        vendors: vendors.map((v) => ({ id: v.id, name: v.name, taxId: v.taxId })),
        receipts,
      },
    );
  }, [confirmedMatch, invoice, purchaseOrders, vendors, receipts]);

  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  const activeCandidate = useMemo(() => {
    if (candidates.length === 0) return null;
    if (selectedCandidateId) {
      const found = candidates.find((c) => c.purchaseOrder.id === selectedCandidateId);
      if (found) return found;
    }
    return candidates[0];
  }, [candidates, selectedCandidateId]);

  // Line item association state for the active candidate
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraftState>>({});
  const [matchNotes, setMatchNotes] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Synchronize lineDrafts when active candidate changes
  React.useEffect(() => {
    if (!activeCandidate) {
      setLineDrafts({});
      return;
    }
    const initialDrafts: Record<string, LineDraftState> = {};
    const invoiceItems = invoice.items || [];

    for (let idx = 0; idx < invoiceItems.length; idx++) {
      const item = invoiceItems[idx];
      const invLineId = item.id || `inv-line-${idx + 1}`;
      const comparison = activeCandidate.lineComparisons.find((c) => c.invoiceLineId === invLineId);

      const preselectedPoLineId = comparison?.purchaseOrderLineId || "";
      const itemQty = Math.max(0, Number(item.quantity) || 0);
      const itemAmt = Math.max(0, Number(item.total) || itemQty * (Number(item.unitPrice) || 0));

      initialDrafts[invLineId] = {
        purchaseOrderLineId: preselectedPoLineId,
        matchedQuantity: itemQty,
        matchedAmount: itemAmt,
      };
    }
    setLineDrafts(initialDrafts);
    setConfirmError(null);
  }, [activeCandidate?.purchaseOrder.id, invoice.items]);

  // Handle Unmatch confirmation
  const handleConfirmUnmatch = async () => {
    if (!confirmedMatch || !onUnmatch) return;
    const trimmed = unmatchReason.trim();
    if (trimmed.length < 3) {
      setUnmatchError("Unmatch reason must contain at least 3 characters.");
      return;
    }
    setIsUnmatching(true);
    setUnmatchError(null);
    try {
      await onUnmatch(confirmedMatch.id, trimmed);
      setShowUnmatchModal(false);
      setUnmatchReason("");
    } catch (err) {
      setUnmatchError(err instanceof Error ? err.message : "Failed to unmatch purchase order.");
    } finally {
      setIsUnmatching(false);
    }
  };

  // Handle Match confirmation
  const handleConfirmMatch = async () => {
    if (!activeCandidate || !onConfirmMatch) return;
    if (!activeCandidate.isEligibleForConfirmation) {
      setConfirmError(activeCandidate.ineligibilityReason || "Selected purchase order is not eligible for confirmation.");
      return;
    }

    const linesToMatch: Array<{
      invoiceLineId: string;
      purchaseOrderLineId: string;
      matchedQuantity?: number;
      matchedAmount?: number;
    }> = [];

    const invoiceItems = invoice.items || [];
    for (let idx = 0; idx < invoiceItems.length; idx++) {
      const item = invoiceItems[idx];
      const invLineId = item.id || `inv-line-${idx + 1}`;
      const draft = lineDrafts[invLineId];
      if (draft && draft.purchaseOrderLineId) {
        linesToMatch.push({
          invoiceLineId: invLineId,
          purchaseOrderLineId: draft.purchaseOrderLineId,
          matchedQuantity: draft.matchedQuantity,
          matchedAmount: draft.matchedAmount,
        });
      }
    }

    const validation = validateMatchLineAssociations(
      invoice,
      activeCandidate.purchaseOrder,
      linesToMatch,
    );

    if (!validation.isValid) {
      setConfirmError(validation.errors.join("; "));
      return;
    }

    setIsSubmitting(true);
    setConfirmError(null);
    try {
      await onConfirmMatch(
        activeCandidate.purchaseOrder.id,
        linesToMatch,
        matchNotes.trim() || undefined,
      );
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Failed to confirm match.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      {/* Header & Extracted PO status */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Purchase Order Matching
              </h3>
              {confirmedMatch && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                  <Check className="h-3 w-3" /> MATCHED
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Verify line items and quantities against commercial commitments and delivery receipts
            </p>
          </div>
        </div>

        {/* Extracted PO Number Badge */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          {invoice.purchaseOrderNumber ? (
            authoritativePoByExtracted ? (
              <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                <span>Extracted: <strong className="font-mono">{invoice.purchaseOrderNumber}</strong></span>
                <span className="text-[10px] text-emerald-600 font-normal">(System Verified)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                <span>Extracted: <strong className="font-mono">{invoice.purchaseOrderNumber}</strong></span>
                <span className="text-[10px] text-amber-600 font-normal">(Unrecognized PO)</span>
              </span>
            )
          ) : (
            <span className="text-xs text-slate-400 italic">No PO reference on invoice</span>
          )}
        </div>
      </div>

      {/* Permission / Read-only Notice if user cannot manage */}
      {!canManage && !readOnly && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
          <Lock className="h-4 w-4 shrink-0 text-slate-400" />
          <span>
            Confirmation and unmatching require both <strong className="font-semibold text-slate-700">invoices.manage</strong> and <strong className="font-semibold text-slate-700">procurement.manage</strong> permissions.
          </span>
        </div>
      )}

      {/* CASE A: CONFIRMED ACTIVE MATCH */}
      {confirmedMatch && matchedPo && (
        <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/20 p-4">
          {/* Confirmed PO Overview Header */}
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-black text-slate-900">
                  {matchedPo.poNumber}
                </span>
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-800 border border-slate-200">
                  {matchedPo.status}
                </span>
                <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                  Source: {confirmedMatch.matchSource}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600 pt-1">
                <div>
                  Vendor: <strong className="text-slate-800">{matchedVendor?.name || "Unknown"}</strong>
                </div>
                <div>
                  Project:{" "}
                  <strong className="text-slate-800">
                    {matchedProject?.projectCode || matchedPo.projectId || "Unassigned"}
                  </strong>
                </div>
                <div>
                  PO Total:{" "}
                  <strong className="font-mono text-slate-900">
                    {formatMoney(matchedPo.totalAmount, matchedPo.currency)}
                  </strong>
                </div>
                <div>
                  Confirmed:{" "}
                  <strong className="text-slate-800">
                    {formatDate(confirmedMatch.confirmedAt, "short")}
                  </strong>
                </div>
              </div>
            </div>

            {/* Actions for Matched PO */}
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              {onOpenPurchaseOrder && (
                <button
                  type="button"
                  onClick={() => onOpenPurchaseOrder(matchedPo.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
                >
                  <span>Open PO</span>
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                </button>
              )}

              {!readOnly && canManage && onUnmatch && (
                <button
                  type="button"
                  onClick={() => {
                    setShowUnmatchModal(true);
                    setUnmatchReason("");
                    setUnmatchError(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  Unmatch
                </button>
              )}
            </div>
          </div>

          {/* Delivery & Goods Receipt Progress Context */}
          {poReceiptProgress && (
            <div className="space-y-2 rounded-xl border border-indigo-100 bg-white p-3.5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-800">
                  <Truck className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Goods Receipts Progress</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      poReceiptProgress.deliveryStatus === "FULLY_RECEIVED"
                        ? "bg-emerald-100 text-emerald-800"
                        : poReceiptProgress.deliveryStatus === "PARTIALLY_RECEIVED"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {poReceiptProgress.deliveryStatus === "FULLY_RECEIVED"
                      ? "Fully Delivered"
                      : poReceiptProgress.deliveryStatus === "PARTIALLY_RECEIVED"
                      ? "Partially Delivered"
                      : "No Receipts Yet"}
                  </span>
                  <span className="font-mono text-slate-500 font-semibold text-[11px]">
                    {poReceiptProgress.overallProgressPercent}%
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    poReceiptProgress.overallProgressPercent === 100
                      ? "bg-emerald-500"
                      : "bg-indigo-600"
                  }`}
                  style={{ width: `${poReceiptProgress.overallProgressPercent}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 pt-0.5">
                {poReceiptProgress.quantitiesComparable ? (
                  <>
                    <div>Ordered: <strong className="text-slate-700">{poReceiptProgress.totalOrderedQuantity}</strong> {poReceiptProgress.aggregateUnit || "units"}</div>
                    <div>Received: <strong className="text-emerald-700">{poReceiptProgress.totalReceivedQuantity}</strong> {poReceiptProgress.aggregateUnit || "units"}</div>
                    <div>Remaining: <strong className="text-amber-700">{poReceiptProgress.totalRemainingQuantity}</strong> {poReceiptProgress.aggregateUnit || "units"}</div>
                  </>
                ) : (
                  <div className="text-slate-600">
                    Mixed units: aggregate quantities are not comparable. See the line breakdown for exact ordered and received quantities.
                  </div>
                )}
                <div>Active Receipts: <strong className="text-slate-700">{poReceiptProgress.activeReceiptsCount}</strong></div>
              </div>
            </div>
          )}

          {/* Line Comparison Table */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Matched Line Item Breakdown
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Invoice Line Item</th>
                    <th className="px-3 py-2.5 text-right">Invoiced Qty</th>
                    <th className="px-3 py-2.5 text-right">Invoiced Total</th>
                    <th className="px-3 py-2.5">Matched Purchase Order Line</th>
                    <th className="px-3 py-2.5 text-right">PO Ordered</th>
                    <th className="px-3 py-2.5 text-right">Goods Received</th>
                    <th className="px-3 py-2.5">Verification Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(confirmedMatch.lines && confirmedMatch.lines.length > 0
                    ? confirmedMatch.lines
                    : (invoice.items || []).map((_, i) => ({
                        id: `auto-${i}`,
                        matchId: confirmedMatch.id,
                        invoiceLineId: invoice.items[i]?.id || `inv-line-${i + 1}`,
                        purchaseOrderLineId: matchedPo.lines?.[i]?.id || "",
                        lineNumber: i + 1,
                      }))
                  ).map((mLine, idx) => {
                    const invItem = (invoice.items || []).find((i) => i.id === mLine.invoiceLineId) || invoice.items?.[idx];
                    const poLine = (matchedPo.lines || []).find((l) => l.id === mLine.purchaseOrderLineId);
                    const lineProg = poLine && poReceiptProgress?.lines[poLine.id];

                    const invQty = Number(invItem?.quantity) || 0;
                    const invAmt = Number(invItem?.total) || invQty * (Number(invItem?.unitPrice) || 0);
                    const poQty = Number(poLine?.quantity) || 0;
                    const recQty = lineProg?.receivedQuantity ?? 0;

                    const lineWarnings: string[] = [];
                    if (recQty > 0 && invQty > recQty) {
                      lineWarnings.push("Invoice quantity exceeds recorded receipts");
                    }
                    if (poQty > 0 && invQty > poQty) {
                      lineWarnings.push("Invoice quantity exceeds PO ordered quantity");
                    }
                    if (poLine && invAmt > (Number(poLine.amount) || 0)) {
                      lineWarnings.push("Invoice line amount exceeds PO line amount");
                    }

                    return (
                      <tr key={mLine.id || idx} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2.5 max-w-[200px]">
                          <div className="font-semibold text-slate-900 truncate" title={invItem?.description}>
                            {invItem?.description || "Invoice Line Item"}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400">
                            ID: {mLine.invoiceLineId}
                          </div>
                        </td>

                        <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-700">
                          {invQty} {invItem?.unitOfMeasure || ""}
                        </td>

                        <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-slate-900">
                          {formatMoney(invAmt, invoice.currency)}
                        </td>

                        <td className="px-3 py-2.5 max-w-[200px]">
                          {poLine ? (
                            <div>
                              <div className="font-semibold text-slate-800 truncate" title={poLine.description}>
                                {poLine.description}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                PO Line #{poLine.lineNumber || idx + 1}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Unlinked PO line</span>
                          )}
                        </td>

                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600">
                          {poLine ? `${poQty} ${poLine.unit}` : "-"}
                        </td>

                        <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          {poLine ? `${recQty} ${poLine.unit}` : "-"}
                        </td>

                        <td className="px-3 py-2.5">
                          {lineWarnings.length > 0 ? (
                            <div className="space-y-1">
                              {lineWarnings.map((w, wIdx) => (
                                <div
                                  key={wIdx}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200"
                                >
                                  <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
                                  <span>{w}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <Check className="h-3 w-3" /> Valid
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Unmatch Reason Modal */}
          {showUnmatchModal && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-3 mt-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                  <span>Unmatch Purchase Order {matchedPo.poNumber}?</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUnmatchModal(false)}
                  className="rounded p-1 text-rose-400 hover:bg-rose-100 hover:text-rose-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-rose-700">
                Unmatching removes the association between this invoice and the purchase order.
                A mandatory audit reason is required for compliance (minimum 3 characters).
              </p>

              <textarea
                rows={2}
                value={unmatchReason}
                onChange={(e) => setUnmatchReason(e.target.value)}
                placeholder="State the reason for unmatching (e.g. matched to wrong PO revision, invoice voided by supplier, re-issuing PO)"
                className="w-full rounded-lg border border-rose-300 bg-white p-2.5 text-xs text-slate-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />

              {unmatchError && (
                <p className="text-xs font-semibold text-rose-700">{unmatchError}</p>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmUnmatch}
                  disabled={unmatchReason.trim().length < 3 || isUnmatching}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50 transition"
                >
                  {isUnmatching ? "Unmatching..." : "Confirm Unmatch"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowUnmatchModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CASE B: NOT MATCHED - SHOW CANDIDATES & MATCH SELECTOR */}
      {!confirmedMatch && (
        <div className="space-y-4">
          {candidates.length > 0 ? (
            <div className="space-y-4">
              {/* Candidate Selector List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-700">
                  <span>Match Candidates ({candidates.length} potential orders)</span>
                  <span className="text-[10px] font-normal text-slate-500 lowercase">
                    ranked by number, vendor, currency, and line similarity
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {candidates.map((cand) => {
                    const isSelected = activeCandidate?.purchaseOrder.id === cand.purchaseOrder.id;
                    const poVendor = vendors.find((v) => v.id === cand.purchaseOrder.vendorId);
                    const poProj = projects.find((p) => p.id === cand.purchaseOrder.projectId);

                    return (
                      <button
                        key={cand.purchaseOrder.id}
                        type="button"
                        onClick={() => {
                          setSelectedCandidateId(cand.purchaseOrder.id);
                          setConfirmError(null);
                        }}
                        className={`text-left rounded-xl border p-3 transition flex flex-col justify-between ${
                          isSelected
                            ? "border-indigo-600 bg-indigo-50/40 shadow-sm ring-1 ring-indigo-600"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                        }`}
                      >
                        <div className="space-y-1 w-full">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-xs font-bold text-slate-900">
                              {cand.purchaseOrder.poNumber}
                            </span>
                            <div className="flex items-center gap-1">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  cand.confidence === "HIGH"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : cand.confidence === "MEDIUM"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {cand.confidence} ({cand.score}pts)
                              </span>
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-600 truncate" title={poVendor?.name}>
                            Vendor: <strong className="text-slate-800">{poVendor?.name || "Unknown"}</strong>
                          </div>

                          <div className="text-[11px] text-slate-500 truncate">
                            Project: {poProj?.projectCode || cand.purchaseOrder.projectId || "General"}
                          </div>

                          <div className="text-[11px] font-mono font-semibold text-slate-800">
                            {formatMoney(cand.purchaseOrder.totalAmount, cand.purchaseOrder.currency)}
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t border-slate-100 w-full flex items-center justify-between text-[10px]">
                          {cand.isEligibleForConfirmation ? (
                            <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-700">
                              <CheckCircle className="h-3 w-3" /> Eligible
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 font-semibold text-amber-700 truncate max-w-[180px]" title={cand.ineligibilityReason}>
                              <AlertTriangle className="h-3 w-3 shrink-0" /> {cand.ineligibilityReason || "Ineligible"}
                            </span>
                          )}

                          <span className="text-slate-400">
                            {cand.purchaseOrder.status}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Candidate Review & Line Mapping */}
              {activeCandidate && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/20 p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-indigo-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-slate-900">
                          Configure Match: {activeCandidate.purchaseOrder.poNumber}
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          {activeCandidate.purchaseOrder.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Associate invoice lines with purchase order lines before confirming
                      </div>
                    </div>

                    {/* Match Reasons Badges */}
                    <div className="flex flex-wrap items-center gap-1">
                      {activeCandidate.matchReasons.map((r, rIdx) => (
                        <span
                          key={rIdx}
                          className="inline-flex items-center rounded-md bg-white border border-indigo-200 px-2 py-0.5 text-[10px] font-medium text-indigo-800 shadow-2xs"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Ineligibility Warning Banner */}
                  {!activeCandidate.isEligibleForConfirmation && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-start gap-2.5 text-xs text-rose-800">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                      <div>
                        <div className="font-bold">Match Confirmation Blocked</div>
                        <div>{activeCandidate.ineligibilityReason || "This purchase order does not satisfy database confirmation invariants."}</div>
                      </div>
                    </div>
                  )}

                  {/* Candidate Warnings */}
                  {activeCandidate.warnings.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 space-y-1">
                      <div className="text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        <span>Potential Discrepancies Detected</span>
                      </div>
                      <ul className="list-disc list-inside text-xs text-amber-800 space-y-0.5 pl-1">
                        {activeCandidate.warnings.map((w, wIdx) => (
                          <li key={wIdx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Line Item Association Editor */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Line Item Associations
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Invoice Line</th>
                            <th className="px-3 py-2 text-right">Invoiced Total</th>
                            <th className="px-3 py-2">Target PO Line</th>
                            <th className="px-3 py-2 text-right">Matched Qty</th>
                            <th className="px-3 py-2 text-right">Matched Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(invoice.items || []).map((item, idx) => {
                            const invLineId = item.id || `inv-line-${idx + 1}`;
                            const draft = lineDrafts[invLineId] || {
                              purchaseOrderLineId: "",
                              matchedQuantity: Number(item.quantity) || 0,
                              matchedAmount: Number(item.total) || 0,
                            };

                            const selectedPoLine = (activeCandidate.purchaseOrder.lines || []).find(
                              (l) => l.id === draft.purchaseOrderLineId,
                            );

                            return (
                              <tr key={invLineId} className="hover:bg-slate-50/60">
                                <td className="px-3 py-2.5 max-w-[200px]">
                                  <div className="font-semibold text-slate-900 truncate" title={item.description}>
                                    {item.description || `Line #${idx + 1}`}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    Qty: {item.quantity} {item.unitOfMeasure || ""} • Unit: {formatMoney(item.unitPrice, invoice.currency)}
                                  </div>
                                </td>

                                <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-slate-800">
                                  {formatMoney(item.total, invoice.currency)}
                                </td>

                                <td className="px-3 py-2.5 min-w-[220px]">
                                  <select
                                    aria-label={`Match PO line for invoice line ${idx + 1}`}
                                    value={draft.purchaseOrderLineId}
                                    onChange={(e) => {
                                      const nextPoLineId = e.target.value;
                                      const targetPoLine = (activeCandidate.purchaseOrder.lines || []).find((l) => l.id === nextPoLineId);
                                      setLineDrafts((current) => ({
                                        ...current,
                                        [invLineId]: {
                                          ...draft,
                                          purchaseOrderLineId: nextPoLineId,
                                          matchedQuantity: targetPoLine ? Number(item.quantity) || 0 : 0,
                                          matchedAmount: targetPoLine ? Number(item.total) || 0 : 0,
                                        },
                                      }));
                                    }}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                  >
                                    <option value="">-- Do not match this line --</option>
                                    {(activeCandidate.purchaseOrder.lines || []).map((pol) => (
                                      <option key={pol.id} value={pol.id}>
                                        #{pol.lineNumber}: {pol.description} ({pol.quantity} {pol.unit} • {formatMoney(pol.amount, activeCandidate.purchaseOrder.currency)})
                                      </option>
                                    ))}
                                  </select>
                                </td>

                                <td className="px-3 py-2.5 text-right min-w-[100px]">
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    disabled={!draft.purchaseOrderLineId}
                                    value={draft.matchedQuantity}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      setLineDrafts((current) => ({
                                        ...current,
                                        [invLineId]: {
                                          ...draft,
                                          matchedQuantity: val,
                                        },
                                      }));
                                    }}
                                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-right text-xs font-mono tabular-nums disabled:bg-slate-100 disabled:text-slate-400"
                                  />
                                </td>

                                <td className="px-3 py-2.5 text-right min-w-[120px]">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    disabled={!draft.purchaseOrderLineId}
                                    value={draft.matchedAmount}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      setLineDrafts((current) => ({
                                        ...current,
                                        [invLineId]: {
                                          ...draft,
                                          matchedAmount: val,
                                        },
                                      }));
                                    }}
                                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-right text-xs font-mono tabular-nums font-bold disabled:bg-slate-100 disabled:text-slate-400"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Optional Notes */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Match Confirmation Notes (Optional)
                    </label>
                    <input
                      type="text"
                      value={matchNotes}
                      onChange={(e) => setMatchNotes(e.target.value)}
                      placeholder="Add reviewer notes regarding this match or variations"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  {confirmError && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-700">
                      {confirmError}
                    </div>
                  )}

                  {/* Confirmation Action Button */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="text-xs text-slate-500">
                      Human confirmation required. Matching does not create duplicate Actual Cost or modify commitments.
                    </div>

                    <button
                      type="button"
                      onClick={handleConfirmMatch}
                      disabled={
                        readOnly ||
                        !canManage ||
                        !activeCandidate.isEligibleForConfirmation ||
                        isSubmitting
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <Check className="h-4 w-4" />
                      {isSubmitting ? "Confirming..." : "Confirm Match"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 space-y-1">
              <PackageCheck className="h-6 w-6 text-slate-400 mx-auto" />
              <div className="font-semibold text-slate-700">No purchase orders available for matching</div>
              <p>Create and issue purchase orders in Procurement to enable commercial matching.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};