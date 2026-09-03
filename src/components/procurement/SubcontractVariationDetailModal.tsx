import React, { useId, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit2,
  FileCheck,
  FileText,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import type {
  Project,
  ProjectCostCode,
  Subcontract,
  SubcontractProgressClaim,
  SubcontractVariation,
  SubcontractVariationStatus,
  Vendor,
} from "../../types.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";
import { formatDate, formatMoney } from "../../utils/invoiceLogic.ts";
import {
  calculateNetApprovedVariations,
  calculateRemainingSubcontractCommitment,
  calculateRevisedSubcontractValue,
  roundMoney,
} from "../../lib/subcontractVariations.ts";

export interface SubcontractVariationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  variation: SubcontractVariation;
  subcontract: Subcontract;
  project?: Project | null;
  vendor?: Vendor | null;
  projectCostCodes?: ProjectCostCode[];
  existingVariations?: SubcontractVariation[];
  existingClaims?: SubcontractProgressClaim[];
  canManage?: boolean;
  canApprove?: boolean;
  onEdit?: (variation: SubcontractVariation) => void;
  onTransition: (
    id: string,
    targetStatus: SubcontractVariationStatus,
    reason?: string,
  ) => Promise<void>;
  onDeleteDraft?: (id: string) => Promise<void>;
}

export const SubcontractVariationDetailModal: React.FC<SubcontractVariationDetailModalProps> = ({
  isOpen,
  onClose,
  variation,
  subcontract,
  project,
  vendor,
  projectCostCodes = [],
  existingVariations = [],
  existingClaims = [],
  canManage = false,
  canApprove = false,
  onEdit,
  onTransition,
  onDeleteDraft,
}) => {
  const titleId = useId();
  const dialogRef = useDialogFocus({ open: isOpen, onClose });

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [showReasonInputFor, setShowReasonInputFor] = useState<"REJECT" | "CANCEL" | null>(null);

  // Commercial context
  const originalAmount = roundMoney(Number(subcontract.originalAmount || 0));
  const otherApprovedVariations = useMemo(
    () =>
      existingVariations.filter(
        (v) => v.subcontractId === subcontract.id && v.status === "APPROVED" && v.id !== variation.id,
      ),
    [existingVariations, subcontract.id, variation.id],
  );
  const netOtherApprovedVariations = useMemo(
    () => calculateNetApprovedVariations(otherApprovedVariations),
    [otherApprovedVariations],
  );
  const currentSubcontractValue = roundMoney(originalAmount + netOtherApprovedVariations);

  const cumulativeApprovedClaimsGross = useMemo(() => {
    return roundMoney(
      existingClaims
        .filter((c) => c.subcontractId === subcontract.id && c.status === "APPROVED")
        .reduce((sum, c) => sum + roundMoney(Number(c.approvedGrossAmount || 0)), 0),
    );
  }, [existingClaims, subcontract.id]);

  const projectedRevisedValue = roundMoney(currentSubcontractValue + Number(variation.netAmount || 0));
  const wouldViolateCertifiedScope =
    variation.status !== "APPROVED" && projectedRevisedValue < cumulativeApprovedClaimsGross;

  if (!isOpen) return null;

  const costCodesById = new Map(projectCostCodes.map((cc) => [cc.id, cc]));
  const scLinesById = new Map((subcontract.lines || []).map((l) => [l.id, l]));

  const handleAction = async (targetStatus: SubcontractVariationStatus, reason?: string) => {
    try {
      setIsProcessing(true);
      setError(null);
      await onTransition(variation.id, targetStatus, reason);
      setShowReasonInputFor(null);
      setActionReason("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to transition variation to ${targetStatus}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!onDeleteDraft) return;
    if (!confirm("Are you sure you want to delete this draft variation?")) return;
    try {
      setIsProcessing(true);
      setError(null);
      await onDeleteDraft(variation.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete variation");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-4xl flex-col bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-600/10 p-2.5 text-indigo-600">
              <FileCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id={titleId} className="text-base font-bold text-slate-900">
                  Variation: {variation.variationNumber}
                </h2>
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
                    variation.status === "APPROVED"
                      ? "bg-emerald-100 text-emerald-800"
                      : variation.status === "SUBMITTED"
                      ? "bg-blue-100 text-blue-800"
                      : variation.status === "REJECTED"
                      ? "bg-rose-100 text-rose-800"
                      : variation.status === "CANCELLED"
                      ? "bg-slate-200 text-slate-700"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {variation.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Subcontract: <span className="font-semibold text-slate-700">{subcontract.subcontractNumber}</span> •{" "}
                {vendor?.name || subcontract.vendorId} • {project?.projectName || project?.projectCode || "Project"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            aria-label="Close variation details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Commercial Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-100/70 p-4 border-b border-slate-200 text-xs">
          <div className="rounded-lg bg-white p-3 border border-slate-200 shadow-sm">
            <span className="text-slate-500 block font-medium">Original Contract</span>
            <span className="text-sm font-bold text-slate-900">
              {formatMoney(originalAmount, variation.currency)}
            </span>
          </div>

          <div className="rounded-lg bg-white p-3 border border-slate-200 shadow-sm">
            <span className="text-slate-500 block font-medium">Net Variation Impact</span>
            <span
              className={`text-sm font-bold ${
                variation.netAmount > 0
                  ? "text-emerald-700"
                  : variation.netAmount < 0
                  ? "text-amber-700"
                  : "text-slate-900"
              }`}
            >
              {variation.netAmount > 0 ? "+" : ""}
              {formatMoney(variation.netAmount, variation.currency)}
            </span>
          </div>

          <div className="rounded-lg bg-white p-3 border border-slate-200 shadow-sm">
            <span className="text-slate-500 block font-medium">Certified Progress Gross</span>
            <span className="text-sm font-bold text-slate-900">
              {formatMoney(cumulativeApprovedClaimsGross, variation.currency)}
            </span>
          </div>

          <div className="rounded-lg bg-indigo-50/70 p-3 border border-indigo-200 text-indigo-950 shadow-sm">
            <span className="text-[11px] opacity-80 block font-medium">
              {variation.status === "APPROVED" ? "Revised Contract Value" : "Projected Revised Value"}
            </span>
            <span className="text-sm font-bold">
              {formatMoney(
                variation.status === "APPROVED"
                  ? currentSubcontractValue + Number(variation.netAmount || 0)
                  : projectedRevisedValue,
                variation.currency,
              )}
            </span>
          </div>
        </div>

        {/* Scope violation alert */}
        {wouldViolateCertifiedScope && (
          <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-900">
            <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Cannot Approve Negative Variation Below Certified Amount</p>
              <p className="mt-0.5 leading-relaxed">
                Approving this variation would reduce the total authorized subcontract value below the amount of
                progress already certified ({formatMoney(cumulativeApprovedClaimsGross, variation.currency)}).
              </p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[60vh]">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{variation.title}</h3>
            {variation.description && (
              <p className="mt-1 text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                {variation.description}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block">Variation Date</span>
              <span className="font-semibold text-slate-800">{formatDate(variation.variationDate)}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Created At</span>
              <span className="font-semibold text-slate-800">{formatDate(variation.createdAt)}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Approved At</span>
              <span className="font-semibold text-slate-800">
                {variation.approvedAt ? formatDate(variation.approvedAt) : "—"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Currency</span>
              <span className="font-semibold text-slate-800">{variation.currency}</span>
            </div>
          </div>

          {/* Reason / Justification */}
          {variation.reason && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <span className="font-semibold text-slate-700 block mb-0.5">Commercial Justification / Origin:</span>
              <span className="text-slate-600">{variation.reason}</span>
            </div>
          )}

          {/* Rejection / Cancellation Notes */}
          {variation.rejectionReason && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              <span className="font-bold block mb-0.5">Rejection Reason:</span>
              <span>{variation.rejectionReason}</span>
            </div>
          )}

          {variation.cancellationReason && (
            <div className="rounded-lg border border-slate-300 bg-slate-100 p-3 text-xs text-slate-800">
              <span className="font-bold block mb-0.5">Cancellation Reason:</span>
              <span>{variation.cancellationReason}</span>
            </div>
          )}

          {/* Lines Table */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Variation Line Items ({variation.lines?.length || 0})
            </h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-semibold">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 w-12 text-center">
                      #
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Description
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Scope / Cost Code
                    </th>
                    <th scope="col" className="px-3 py-2.5 w-20 text-right">
                      Qty
                    </th>
                    <th scope="col" className="px-3 py-2.5 w-20">
                      Unit
                    </th>
                    <th scope="col" className="px-3 py-2.5 w-24 text-right">
                      Unit Rate
                    </th>
                    <th scope="col" className="px-3 py-2.5 w-32 text-right">
                      Amount ({variation.currency})
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(variation.lines || []).map((line) => {
                    const scLine = line.subcontractLineId ? scLinesById.get(line.subcontractLineId) : null;
                    const costCode = line.projectCostCodeId ? costCodesById.get(line.projectCostCodeId) : null;

                    return (
                      <tr key={line.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 text-center font-semibold text-slate-500">{line.lineNumber}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {line.description}
                          {line.notes && <p className="text-[11px] text-slate-500 mt-0.5">{line.notes}</p>}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-slate-600">
                          {scLine ? (
                            <span className="block text-indigo-700 font-medium">
                              Scope Adj: Line {scLine.lineNumber} ({scLine.description.slice(0, 18)}...)
                            </span>
                          ) : (
                            <span className="block text-slate-500 italic">Standalone Scope</span>
                          )}
                          {costCode && (
                            <span className="block text-slate-500">
                              Cost Code: {costCode.code} - {costCode.name.slice(0, 16)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {line.quantity != null ? line.quantity : "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{line.unit || "—"}</td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {line.unitRate != null ? formatMoney(line.unitRate, variation.currency) : "—"}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-bold ${
                            line.amount > 0
                              ? "text-emerald-700"
                              : line.amount < 0
                              ? "text-amber-700"
                              : "text-slate-900"
                          }`}
                        >
                          {line.amount > 0 ? "+" : ""}
                          {formatMoney(line.amount, variation.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold text-slate-900 border-t border-slate-200">
                  <tr>
                    <td colSpan={6} className="px-3 py-2.5 text-right text-xs">
                      Net Total:
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right text-sm font-bold ${
                        variation.netAmount > 0
                          ? "text-emerald-700"
                          : variation.netAmount < 0
                          ? "text-amber-700"
                          : "text-slate-900"
                      }`}
                    >
                      {variation.netAmount > 0 ? "+" : ""}
                      {formatMoney(variation.netAmount, variation.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Prompt dialog for Reason input (Rejection / Cancellation) */}
          {showReasonInputFor && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
              <span className="font-bold text-xs text-amber-950 block">
                {showReasonInputFor === "REJECT" ? "Enter Rejection Reason" : "Enter Cancellation Reason"}
              </span>
              <textarea
                rows={2}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Required explanation for the audit trail..."
                className="w-full rounded border border-amber-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowReasonInputFor(null);
                    setActionReason("");
                  }}
                  className="rounded px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-amber-100"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleAction(showReasonInputFor === "REJECT" ? "REJECTED" : "CANCELLED", actionReason)
                  }
                  disabled={!actionReason.trim() || isProcessing}
                  className={`rounded px-3 py-1 text-xs font-semibold text-white transition disabled:opacity-50 ${
                    showReasonInputFor === "REJECT"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-slate-700 hover:bg-slate-800"
                  }`}
                >
                  Confirm {showReasonInputFor === "REJECT" ? "Rejection" : "Cancellation"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Close
            </button>

            {variation.status === "DRAFT" && canManage && onDeleteDraft && (
              <button
                type="button"
                onClick={handleDeleteDraft}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Draft
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {variation.status === "DRAFT" && canManage && (
              <>
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEdit(variation);
                    }}
                    disabled={isProcessing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit Draft
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowReasonInputFor("CANCEL")}
                  disabled={isProcessing}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => handleAction("SUBMITTED")}
                  disabled={isProcessing || wouldViolateCertifiedScope}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  Submit for Review
                </button>
              </>
            )}

            {variation.status === "SUBMITTED" && (
              <>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setShowReasonInputFor("CANCEL")}
                    disabled={isProcessing}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                  >
                    Cancel
                  </button>
                )}

                {canApprove && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowReasonInputFor("REJECT")}
                      disabled={isProcessing}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAction("APPROVED")}
                      disabled={isProcessing || wouldViolateCertifiedScope}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve Variation
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
