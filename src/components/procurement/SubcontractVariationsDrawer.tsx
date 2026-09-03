import React, { useId, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit2,
  Eye,
  FileCheck,
  FileEdit,
  FileText,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
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

export interface SubcontractVariationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  subcontract: Subcontract;
  variations: SubcontractVariation[];
  claims?: SubcontractProgressClaim[];
  project?: Project | null;
  vendor?: Vendor | null;
  projectCostCodes?: ProjectCostCode[];
  canManage?: boolean;
  canApprove?: boolean;
  onCreateVariation: () => void;
  onViewVariation: (variation: SubcontractVariation) => void;
  onEditVariation: (variation: SubcontractVariation) => void;
  onDeleteDraftVariation: (variationId: string) => Promise<void>;
  onTransitionVariation?: (
    id: string,
    targetStatus: SubcontractVariationStatus,
    reason?: string,
  ) => Promise<void>;
}

export const SubcontractVariationsDrawer: React.FC<SubcontractVariationsDrawerProps> = ({
  isOpen,
  onClose,
  subcontract,
  variations = [],
  claims = [],
  project,
  vendor,
  canManage = false,
  canApprove = false,
  onCreateVariation,
  onViewVariation,
  onEditVariation,
  onDeleteDraftVariation,
}) => {
  const titleId = useId();
  const dialogRef = useDialogFocus({ open: isOpen, onClose });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const scVariations = useMemo(
    () => variations.filter((v) => v.subcontractId === subcontract.id),
    [variations, subcontract.id],
  );

  const approvedVariations = useMemo(
    () => scVariations.filter((v) => v.status === "APPROVED"),
    [scVariations],
  );

  const pendingVariations = useMemo(
    () => scVariations.filter((v) => v.status === "SUBMITTED"),
    [scVariations],
  );

  const originalAmount = roundMoney(Number(subcontract.originalAmount || 0));
  const netApprovedVariations = useMemo(
    () => calculateNetApprovedVariations(approvedVariations),
    [approvedVariations],
  );
  const revisedSubcontractValue = roundMoney(originalAmount + netApprovedVariations);

  const cumulativeApprovedClaimsGross = useMemo(() => {
    return roundMoney(
      claims
        .filter((c) => c.subcontractId === subcontract.id && c.status === "APPROVED")
        .reduce((sum, c) => sum + roundMoney(Number(c.approvedGrossAmount || 0)), 0),
    );
  }, [claims, subcontract.id]);

  const remainingCommitment = roundMoney(
    Math.max(0, revisedSubcontractValue - cumulativeApprovedClaimsGross),
  );

  const pendingExposure = useMemo(() => {
    return roundMoney(
      pendingVariations.reduce((sum, v) => sum + roundMoney(Number(v.netAmount || 0)), 0),
    );
  }, [pendingVariations]);

  const filteredVariations = useMemo(() => {
    if (statusFilter === "ALL") return scVariations;
    return scVariations.filter((v) => v.status === statusFilter);
  }, [scVariations, statusFilter]);

  const isEligibleForVariations =
    subcontract.status === "APPROVED" || subcontract.status === "ACTIVE";

  if (!isOpen) return null;

  const handleDeleteDraft = async (id: string) => {
    if (!confirm("Are you sure you want to delete this draft variation?")) return;
    try {
      setDeletingId(id);
      setError(null);
      await onDeleteDraftVariation(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete draft variation.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl border-l border-slate-200 overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-600/10 p-2.5 text-indigo-600">
              <FileEdit className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id={titleId} className="text-base font-bold text-slate-900">
                  Subcontract Variations: {subcontract.subcontractNumber}
                </h2>
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                    subcontract.status === "ACTIVE"
                      ? "bg-emerald-100 text-emerald-800"
                      : subcontract.status === "APPROVED"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {subcontract.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                <span className="font-semibold text-slate-700">{vendor?.name || subcontract.vendorId}</span>
                <span>•</span>
                <span>{project?.projectCode || "Project"}</span>
                <span>•</span>
                <span className="truncate max-w-md">{subcontract.title}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            aria-label="Close variations register"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Commercial Control Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-100/70 p-4 border-b border-slate-200 text-xs">
          <div className="rounded-lg bg-white p-3 border border-slate-200 shadow-sm">
            <span className="text-slate-500 block font-medium">Original Contract</span>
            <span className="text-sm font-bold text-slate-900">
              {formatMoney(originalAmount, subcontract.currency)}
            </span>
          </div>

          <div className="rounded-lg bg-white p-3 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 block font-medium">Approved Variations</span>
              <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                {approvedVariations.length}
              </span>
            </div>
            <span
              className={`text-sm font-bold ${
                netApprovedVariations > 0
                  ? "text-emerald-700"
                  : netApprovedVariations < 0
                  ? "text-amber-700"
                  : "text-slate-900"
              }`}
            >
              {netApprovedVariations > 0 ? "+" : ""}
              {formatMoney(netApprovedVariations, subcontract.currency)}
            </span>
          </div>

          <div className="rounded-lg bg-indigo-50/70 p-3 border border-indigo-200 text-indigo-950 shadow-sm">
            <span className="text-[11px] opacity-80 block font-medium">Revised Subcontract Value</span>
            <span className="text-sm font-bold">
              {formatMoney(revisedSubcontractValue, subcontract.currency)}
            </span>
          </div>

          <div className="rounded-lg bg-white p-3 border border-slate-200 shadow-sm">
            <span className="text-slate-500 block font-medium">Remaining Commitment</span>
            <span className="text-sm font-bold text-slate-900">
              {formatMoney(remainingCommitment, subcontract.currency)}
            </span>
          </div>
        </div>

        {/* Pending variations notice if any */}
        {pendingVariations.length > 0 && (
          <div className="mx-6 mt-4 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-xs text-blue-900">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600 flex-shrink-0" />
              <span>
                <strong className="font-semibold">{pendingVariations.length} pending variation(s)</strong> awaiting
                review / approval.
              </span>
            </div>
            <span className="font-bold text-blue-950">
              Exposure: {pendingExposure > 0 ? "+" : ""}
              {formatMoney(pendingExposure, subcontract.currency)}
            </span>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-1">
            {["ALL", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  statusFilter === st
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {st === "ALL" ? "All Variations" : st}
              </button>
            ))}
          </div>

          {canManage && isEligibleForVariations && (
            <button
              type="button"
              onClick={onCreateVariation}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              New Variation
            </button>
          )}
        </div>

        {/* Register Table */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredVariations.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-16 text-center text-slate-500">
              <FileEdit className="h-10 w-10 text-slate-300 mb-2" />
              <p className="font-semibold text-sm text-slate-700">No subcontract variations found</p>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Subcontract variations document approved additions, omissions, or scope adjustments with deterministic
                commercial traceability.
              </p>
              {canManage && isEligibleForVariations && (
                <button
                  type="button"
                  onClick={onCreateVariation}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create First Variation
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-semibold">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Variation #
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Title & Scope
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Date
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Net Amount ({subcontract.currency})
                    </th>
                    <th scope="col" className="px-4 py-3 text-center">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredVariations.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3 font-bold text-slate-900">
                        <button
                          type="button"
                          onClick={() => onViewVariation(v)}
                          className="hover:text-indigo-600 hover:underline text-left font-mono"
                        >
                          {v.variationNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{v.title}</div>
                        {v.description && (
                          <div className="text-[11px] text-slate-500 truncate max-w-xs">{v.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(v.variationDate)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                            v.status === "APPROVED"
                              ? "bg-emerald-100 text-emerald-800"
                              : v.status === "SUBMITTED"
                              ? "bg-blue-100 text-blue-800"
                              : v.status === "REJECTED"
                              ? "bg-rose-100 text-rose-800"
                              : v.status === "CANCELLED"
                              ? "bg-slate-200 text-slate-700"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {v.status}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-bold ${
                          v.netAmount > 0
                            ? "text-emerald-700"
                            : v.netAmount < 0
                            ? "text-amber-700"
                            : "text-slate-900"
                        }`}
                      >
                        {v.netAmount > 0 ? "+" : ""}
                        {formatMoney(v.netAmount, v.currency)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewVariation(v)}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition"
                            title="View Variation Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {v.status === "DRAFT" && canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => onEditVariation(v)}
                                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition"
                                title="Edit Draft"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteDraft(v.id)}
                                disabled={deletingId === v.id}
                                className="rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition disabled:opacity-40"
                                title="Delete Draft"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
