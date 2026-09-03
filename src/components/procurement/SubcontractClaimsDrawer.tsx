import React, { useId, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileCheck,
  FileText,
  Percent,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type {
  Project,
  Subcontract,
  SubcontractProgressClaim,
  SubcontractProgressClaimStatus,
  Vendor,
} from "../../types.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";
import { formatDate, formatMoney } from "../../utils/invoiceLogic.ts";
import { computeSubcontractClaimMetrics, roundMoney } from "../../lib/subcontractClaims.ts";

export interface SubcontractClaimsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  subcontract: Subcontract;
  claims: SubcontractProgressClaim[];
  project?: Project | null;
  vendor?: Vendor | null;
  canManage?: boolean;
  canApprove?: boolean;
  onCreateClaim: () => void;
  onEditClaim: (claim: SubcontractProgressClaim) => void;
  onDeleteDraftClaim: (claimId: string) => Promise<void>;
  onTransitionClaim?: (
    id: string,
    targetStatus: SubcontractProgressClaimStatus,
    reason?: string,
    lineApprovals?: Array<{ claimLineId: string; approvedAmount: number }>,
  ) => Promise<void>;
}

export const SubcontractClaimsDrawer: React.FC<SubcontractClaimsDrawerProps> = ({
  isOpen,
  onClose,
  subcontract,
  claims = [],
  project,
  vendor,
  canManage = false,
  canApprove = false,
  onCreateClaim,
  onEditClaim,
  onDeleteDraftClaim,
}) => {
  const titleId = useId();
  const dialogRef = useDialogFocus({ open: isOpen, onClose });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredClaims = useMemo(
    () => claims.filter((c) => c.subcontractId === subcontract.id),
    [claims, subcontract.id],
  );

  const metrics = useMemo(
    () => computeSubcontractClaimMetrics(subcontract, filteredClaims),
    [subcontract, filteredClaims],
  );

  const isEligibleForClaims = subcontract.status === "APPROVED" || subcontract.status === "ACTIVE";

  if (!isOpen) return null;

  const handleDeleteDraft = async (claimId: string) => {
    if (!confirm("Are you sure you want to delete this draft progress claim?")) return;
    try {
      setDeletingId(claimId);
      setError(null);
      await onDeleteDraftClaim(claimId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete draft claim.");
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
              <FileCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id={titleId} className="text-base font-bold text-slate-900">
                  Subcontract Claims: {subcontract.subcontractNumber}
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
            aria-label="Close claims register"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Commercial Summary Banner */}
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-indigo-50/30 to-slate-50 px-6 py-3.5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Contract Total</div>
              <div className="text-sm font-black text-slate-900 font-mono">
                {formatMoney(metrics.originalAmount, subcontract.currency)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Certified Gross Work</div>
              <div className="text-sm font-black text-emerald-700 font-mono">
                {formatMoney(metrics.cumulativeApprovedGross, subcontract.currency)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Remaining Commitment</div>
              <div className="text-sm font-black text-blue-700 font-mono">
                {formatMoney(metrics.remainingCommitment, subcontract.currency)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Retention Held</div>
              <div className="text-sm font-black text-amber-700 font-mono">
                {formatMoney(metrics.cumulativeRetentionHeld, subcontract.currency)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Net Certified</div>
              <div className="text-sm font-black text-indigo-700 font-mono">
                {formatMoney(metrics.cumulativeNetCertified, subcontract.currency)}
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Toolbar & Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-600">
              Showing <strong>{filteredClaims.length}</strong> progress claim{filteredClaims.length === 1 ? "" : "s"}
              {metrics.pendingClaimsCount > 0 && (
                <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                  {metrics.pendingClaimsCount} Pending Approval
                </span>
              )}
            </div>

            {canManage && (
              <button
                type="button"
                onClick={onCreateClaim}
                disabled={!isEligibleForClaims}
                title={
                  !isEligibleForClaims
                    ? "Claims can only be filed against Approved or Active subcontracts."
                    : undefined
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                <span>New Progress Claim</span>
              </button>
            )}
          </div>

          {!isEligibleForClaims && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                This subcontract is currently in <strong>{subcontract.status}</strong> status. Progress claims can only be entered once the subcontract commitment is Approved or Active.
              </span>
            </div>
          )}

          {/* Claims Register Table */}
          {filteredClaims.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
              <FileText className="h-10 w-10 text-slate-300 mb-2" />
              <div className="text-sm font-bold text-slate-700">No progress claims submitted yet</div>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Subcontract progress claims document periodic contractor valuation, certification of completed work, and retention deduction.
              </p>
              {canManage && isEligibleForClaims && (
                <button
                  type="button"
                  onClick={onCreateClaim}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-sm"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create First Progress Claim</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 font-bold">
                  <tr>
                    <th scope="col" className="px-3 py-2.5">Claim #</th>
                    <th scope="col" className="px-3 py-2.5">Valuation Date</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Gross Claimed</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Certified Gross</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Retention</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Net Certified</th>
                    <th scope="col" className="px-3 py-2.5 text-center">Status</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {filteredClaims.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-3 py-3 font-mono font-bold text-slate-900">
                        {c.claimNumber}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <div>{formatDate(c.valuationDate)}</div>
                        {c.periodStart && c.periodEnd && (
                          <div className="text-[10px] text-slate-400">
                            {formatDate(c.periodStart)} – {formatDate(c.periodEnd)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-700">
                        {formatMoney(c.claimedGrossAmount, subcontract.currency)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-emerald-700">
                        {formatMoney(c.approvedGrossAmount, subcontract.currency)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-amber-700">
                        <div>{formatMoney(c.retentionAmount, subcontract.currency)}</div>
                        <div className="text-[10px] text-slate-400">({roundMoney((c.retentionRate ?? 0.1) * 100)}%)</div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-indigo-700">
                        {formatMoney(c.netCertifiedAmount, subcontract.currency)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            c.status === "APPROVED"
                              ? "bg-emerald-100 text-emerald-800"
                              : c.status === "SUBMITTED"
                              ? "bg-blue-100 text-blue-800"
                              : c.status === "REJECTED" || c.status === "CANCELLED" || c.status === "VOIDED"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onEditClaim(c)}
                            className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition shadow-xs"
                          >
                            {c.status === "DRAFT" && canManage ? "Edit" : "View"}
                          </button>

                          {c.status === "DRAFT" && canManage && (
                            <button
                              type="button"
                              onClick={() => handleDeleteDraft(c.id)}
                              disabled={deletingId === c.id}
                              className="rounded border border-rose-200 bg-rose-50 p-1 text-rose-600 hover:bg-rose-100 transition"
                              aria-label={`Delete draft claim ${c.claimNumber}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
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

        {/* Drawer Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 flex justify-between items-center text-xs text-slate-500">
          <div>Subcontract commercial valuation register & progress certification</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 transition shadow-sm"
          >
            Close Register
          </button>
        </div>
      </div>
    </div>
  );
};
