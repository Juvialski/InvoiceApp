import React, { useEffect, useId, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileCheck,
  FileText,
  Percent,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
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
import { calculateRetention, computeSubcontractClaimMetrics, roundMoney } from "../../lib/subcontractClaims.ts";

export interface SubcontractClaimEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  claim?: SubcontractProgressClaim | null; // null = new draft
  subcontract: Subcontract;
  project?: Project | null;
  vendor?: Vendor | null;
  existingClaims?: SubcontractProgressClaim[];
  canManage?: boolean;
  canApprove?: boolean;
  onSave: (
    claim: Partial<SubcontractProgressClaim> & {
      subcontractId: string;
      projectId: string;
      claimNumber: string;
      valuationDate: string;
    },
    lines: Array<{ subcontractLineId: string; claimedAmount: number; notes?: string }>,
  ) => Promise<void>;
  onTransition?: (
    id: string,
    targetStatus: SubcontractProgressClaimStatus,
    reason?: string,
    lineApprovals?: Array<{ claimLineId: string; approvedAmount: number }>,
  ) => Promise<void>;
}

interface EditableClaimLine {
  id?: string;
  subcontractLineId: string;
  lineNumber: number;
  description: string;
  subcontractAmount: number;
  previouslyApproved: number;
  remainingClaimable: number;
  claimedAmount: string;
  approvedAmount: string;
  notes: string;
}

function getInitialClaimLines(
  claim: SubcontractProgressClaim | null,
  subcontract: Subcontract,
  metrics: ReturnType<typeof computeSubcontractClaimMetrics>,
): EditableClaimLine[] {
  if (claim) {
    const claimLinesMap = new Map((claim.lines || []).map((l) => [l.subcontractLineId, l]));
    return (subcontract.lines || []).map((scLine) => {
      const cl = claimLinesMap.get(scLine.id);
      const lineMetric = metrics.lines.get(scLine.id);
      const prevApprovedExcludingThis = roundMoney(
        (lineMetric?.cumulativeApproved || 0) -
          (claim.status === "APPROVED" ? roundMoney(Number(cl?.approvedAmount || 0)) : 0),
      );
      const remainingClaimable = roundMoney(Math.max(0, Number(scLine.amount || 0) - prevApprovedExcludingThis));

      return {
        id: cl?.id,
        subcontractLineId: scLine.id,
        lineNumber: scLine.lineNumber,
        description: scLine.description,
        subcontractAmount: Number(scLine.amount || 0),
        previouslyApproved: prevApprovedExcludingThis,
        remainingClaimable,
        claimedAmount: cl ? String(cl.claimedAmount) : "0",
        approvedAmount: cl ? String(cl.approvedAmount) : "0",
        notes: cl?.notes || "",
      };
    });
  }

  return (subcontract.lines || []).map((scLine) => {
    const lineMetric = metrics.lines.get(scLine.id);
    const previouslyApproved = lineMetric?.cumulativeApproved || 0;
    const remainingClaimable = lineMetric?.remainingClaimable ?? Number(scLine.amount || 0);

    return {
      subcontractLineId: scLine.id,
      lineNumber: scLine.lineNumber,
      description: scLine.description,
      subcontractAmount: Number(scLine.amount || 0),
      previouslyApproved,
      remainingClaimable,
      claimedAmount: "0",
      approvedAmount: "0",
      notes: "",
    };
  });
}

export const SubcontractClaimEditorModal: React.FC<SubcontractClaimEditorModalProps> = ({
  isOpen,
  onClose,
  claim,
  subcontract,
  project,
  vendor,
  existingClaims = [],
  canManage = false,
  canApprove = false,
  onSave,
  onTransition,
}) => {
  const titleId = useId();
  const isExisting = Boolean(claim?.id);
  const isDraft = !claim || claim.status === "DRAFT";
  const isSubmitted = claim?.status === "SUBMITTED";
  const isApproved = claim?.status === "APPROVED";
  const isTerminal = claim?.status === "REJECTED" || claim?.status === "CANCELLED" || claim?.status === "VOIDED";

  const metrics = useMemo(
    () => computeSubcontractClaimMetrics(subcontract, existingClaims),
    [subcontract, existingClaims],
  );

  const [claimNumber, setClaimNumber] = useState(
    () => claim?.claimNumber || `${subcontract.subcontractNumber}-CLM-${String(existingClaims.length + 1).padStart(2, "0")}`,
  );
  const [valuationDate, setValuationDate] = useState(
    () => (claim?.valuationDate ? claim.valuationDate.slice(0, 10) : new Date().toISOString().slice(0, 10)),
  );
  const [periodStart, setPeriodStart] = useState(() => (claim?.periodStart ? claim.periodStart.slice(0, 10) : ""));
  const [periodEnd, setPeriodEnd] = useState(() => (claim?.periodEnd ? claim.periodEnd.slice(0, 10) : ""));
  const [retentionPercent, setRetentionPercent] = useState(
    () => (claim ? String(roundMoney((claim.retentionRate ?? 0.1) * 100)) : "10"),
  );
  const [notes, setNotes] = useState(() => claim?.notes || "");
  const [lines, setLines] = useState<EditableClaimLine[]>(() => getInitialClaimLines(claim, subcontract, metrics));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Modal dialog for mandatory reason (reject, cancel, void)
  const [reasonAction, setReasonAction] = useState<"REJECT" | "CANCEL" | "VOID" | null>(null);
  const [reasonText, setReasonText] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setReasonAction(null);
    setReasonText("");

    if (claim) {
      setClaimNumber(claim.claimNumber);
      setValuationDate(claim.valuationDate ? claim.valuationDate.slice(0, 10) : "");
      setPeriodStart(claim.periodStart ? claim.periodStart.slice(0, 10) : "");
      setPeriodEnd(claim.periodEnd ? claim.periodEnd.slice(0, 10) : "");
      setRetentionPercent(String(roundMoney((claim.retentionRate ?? 0.1) * 100)));
      setNotes(claim.notes || "");

      const claimLinesMap = new Map((claim.lines || []).map((l) => [l.subcontractLineId, l]));

      const mappedLines: EditableClaimLine[] = (subcontract.lines || []).map((scLine) => {
        const cl = claimLinesMap.get(scLine.id);
        const lineMetric = metrics.lines.get(scLine.id);
        const prevApprovedExcludingThis = roundMoney(
          (lineMetric?.cumulativeApproved || 0) - (claim.status === "APPROVED" ? roundMoney(Number(cl?.approvedAmount || 0)) : 0),
        );
        const remainingClaimable = roundMoney(Math.max(0, Number(scLine.amount || 0) - prevApprovedExcludingThis));

        return {
          id: cl?.id,
          subcontractLineId: scLine.id,
          lineNumber: scLine.lineNumber,
          description: scLine.description,
          subcontractAmount: Number(scLine.amount || 0),
          previouslyApproved: prevApprovedExcludingThis,
          remainingClaimable,
          claimedAmount: cl ? String(cl.claimedAmount) : "0",
          approvedAmount: cl ? String(cl.approvedAmount) : "0",
          notes: cl?.notes || "",
        };
      });
      setLines(mappedLines);
    } else {
      // New claim draft
      const nextNum = `${subcontract.subcontractNumber}-CLM-${String(existingClaims.length + 1).padStart(2, "0")}`;
      setClaimNumber(nextNum);
      const today = new Date().toISOString().slice(0, 10);
      setValuationDate(today);
      setPeriodStart("");
      setPeriodEnd("");
      setRetentionPercent("10");
      setNotes("");

      const initialLines: EditableClaimLine[] = (subcontract.lines || []).map((scLine) => {
        const lineMetric = metrics.lines.get(scLine.id);
        const previouslyApproved = lineMetric?.cumulativeApproved || 0;
        const remainingClaimable = lineMetric?.remainingClaimable ?? Number(scLine.amount || 0);

        return {
          subcontractLineId: scLine.id,
          lineNumber: scLine.lineNumber,
          description: scLine.description,
          subcontractAmount: Number(scLine.amount || 0),
          previouslyApproved,
          remainingClaimable,
          claimedAmount: "0",
          approvedAmount: "0",
          notes: "",
        };
      });
      setLines(initialLines);
    }
  }, [isOpen, claim, subcontract, metrics, existingClaims.length]);

  const retentionRate = useMemo(() => {
    const parsed = parseFloat(retentionPercent);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed / 100)) : 0;
  }, [retentionPercent]);

  const totals = useMemo(() => {
    const grossClaimed = roundMoney(
      lines.reduce((sum, l) => {
        const num = parseFloat(l.claimedAmount);
        return sum + (Number.isFinite(num) ? Math.max(0, num) : 0);
      }, 0),
    );
    const grossApproved = isSubmitted
      ? roundMoney(
          lines.reduce((sum, l) => {
            const num = parseFloat(l.approvedAmount);
            return sum + (Number.isFinite(num) ? Math.max(0, num) : 0);
          }, 0),
        )
      : isApproved
      ? roundMoney(Number(claim?.approvedGrossAmount || 0))
      : grossClaimed;

    const { retentionAmount, netCertifiedAmount } = calculateRetention(grossApproved, retentionRate);
    return { grossClaimed, grossApproved, retentionAmount, netCertifiedAmount };
  }, [lines, retentionRate, isSubmitted, isApproved, claim]);

  const dialogRef = useDialogFocus({ open: isOpen, onClose });

  if (!isOpen) return null;

  const handleLineChange = (index: number, field: "claimedAmount" | "approvedAmount" | "notes", value: string) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSaveDraft = async () => {
    setError(null);
    if (!claimNumber.trim()) {
      setError("Claim number is required.");
      return;
    }
    if (!valuationDate) {
      setError("Valuation date is required.");
      return;
    }
    if (periodStart && periodEnd && periodEnd < periodStart) {
      setError("Period end date cannot be before period start date.");
      return;
    }
    if (totals.grossClaimed <= 0) {
      setError("At least one scope line item must have a positive claimed amount.");
      return;
    }

    // Check line claimed amounts against remaining claimable
    for (const l of lines) {
      const claimedNum = parseFloat(l.claimedAmount);
      if (Number.isFinite(claimedNum) && roundMoney(claimedNum) > roundMoney(l.remainingClaimable)) {
        setError(
          `Line ${l.lineNumber} claimed amount (${formatMoney(claimedNum, subcontract.currency)}) exceeds remaining claimable amount (${formatMoney(l.remainingClaimable, subcontract.currency)}).`,
        );
        return;
      }
    }

    try {
      setIsSaving(true);
      await onSave(
        {
          id: claim?.id,
          subcontractId: subcontract.id,
          projectId: subcontract.projectId,
          claimNumber: claimNumber.trim().toUpperCase(),
          valuationDate,
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
          retentionRate,
          notes: notes.trim() || null,
        },
        lines.map((l) => ({
          subcontractLineId: l.subcontractLineId,
          claimedAmount: roundMoney(parseFloat(l.claimedAmount) || 0),
          notes: l.notes.trim() || undefined,
        })),
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save progress claim.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!claim?.id) {
      setError("Please save the draft claim before submitting.");
      return;
    }
    if (!onTransition) return;
    try {
      setIsSaving(true);
      await onTransition(claim.id, "SUBMITTED");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit progress claim.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!claim?.id || !onTransition) return;
    // Check line approved amounts
    for (const l of lines) {
      const appNum = parseFloat(l.approvedAmount);
      const clNum = parseFloat(l.claimedAmount);
      if (!Number.isFinite(appNum) || appNum < 0) {
        setError(`Line ${l.lineNumber} approved amount must be non-negative.`);
        return;
      }
      if (roundMoney(appNum) > roundMoney(clNum)) {
        setError(`Line ${l.lineNumber} approved amount cannot exceed claimed amount.`);
        return;
      }
      if (roundMoney(appNum) > roundMoney(l.remainingClaimable)) {
        setError(`Line ${l.lineNumber} approved amount exceeds remaining claimable amount.`);
        return;
      }
    }

    try {
      setIsSaving(true);
      const lineApprovals = lines.map((l) => ({
        claimLineId: l.id || "",
        approvedAmount: roundMoney(parseFloat(l.approvedAmount) || 0),
      }));
      await onTransition(claim.id, "APPROVED", undefined, lineApprovals);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve progress claim.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReasonSubmit = async () => {
    if (!claim?.id || !onTransition || !reasonAction) return;
    const trimmed = reasonText.trim();
    if (!trimmed) {
      setError("A reason is mandatory for this action.");
      return;
    }

    try {
      setIsSaving(true);
      if (reasonAction === "REJECT") {
        await onTransition(claim.id, "REJECTED", trimmed);
      } else if (reasonAction === "CANCEL") {
        await onTransition(claim.id, "CANCELLED", trimmed);
      } else if (reasonAction === "VOID") {
        await onTransition(claim.id, "VOIDED", trimmed);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-600">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-bold text-slate-900">
                {isExisting
                  ? `Subcontract Progress Claim: ${claim?.claimNumber}`
                  : `New Progress Claim — ${subcontract.subcontractNumber}`}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                <span className="font-semibold text-slate-700">{vendor?.name || subcontract.vendorId}</span>
                <span>•</span>
                <span>{project?.projectCode || "Project"}</span>
                <span>•</span>
                <span className="truncate max-w-xs">{subcontract.title}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {claim?.status && (
              <span
                className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                  claim.status === "APPROVED"
                    ? "bg-emerald-100 text-emerald-800"
                    : claim.status === "SUBMITTED"
                    ? "bg-blue-100 text-blue-800"
                    : claim.status === "REJECTED" || claim.status === "CANCELLED" || claim.status === "VOIDED"
                    ? "bg-rose-100 text-rose-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {claim.status}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Subcontract Provenance & Cumulative Metrics Banner */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/40 to-slate-50/40 p-3.5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Contract Total</div>
              <div className="text-sm font-black text-slate-900 font-mono">
                {formatMoney(metrics.originalAmount, subcontract.currency)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Previously Certified</div>
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
          </div>

          {/* Claim Parameters Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="claimNumber" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Claim Number <span className="text-rose-500">*</span>
              </label>
              <input
                id="claimNumber"
                type="text"
                value={claimNumber}
                onChange={(e) => setClaimNumber(e.target.value.toUpperCase())}
                disabled={!isDraft || !canManage}
                placeholder="e.g. SC-01-CLM-01"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            <div>
              <label htmlFor="valuationDate" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Valuation Date <span className="text-rose-500">*</span>
              </label>
              <input
                id="valuationDate"
                type="date"
                value={valuationDate}
                onChange={(e) => setValuationDate(e.target.value)}
                disabled={!isDraft || !canManage}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            <div>
              <label htmlFor="periodDates" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Period (Start — End)
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  disabled={!isDraft || !canManage}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
                <span className="text-slate-400">–</span>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  disabled={!isDraft || !canManage}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label htmlFor="retentionPercent" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Retention Rate (%)
              </label>
              <div className="relative">
                <input
                  id="retentionPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={retentionPercent}
                  onChange={(e) => setRetentionPercent(e.target.value)}
                  disabled={!isDraft || !canManage}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <Percent className="h-3.5 w-3.5 text-slate-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Scope Lines Valuation Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Scope Items Claim Breakdown
              </h3>
              <span className="text-[11px] text-slate-500">
                Currency: <strong className="font-mono text-slate-800">{subcontract.currency}</strong>
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 font-bold">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 w-12 text-center">#</th>
                    <th scope="col" className="px-3 py-2.5">Scope Description</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Scope Total</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Prev. Certified</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Remaining</th>
                    <th scope="col" className="px-3 py-2.5 text-right w-36">Claimed Amount</th>
                    {(isSubmitted || isApproved) && (
                      <th scope="col" className="px-3 py-2.5 text-right w-36">Certified Amount</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {lines.map((line, idx) => {
                    const claimedNum = parseFloat(line.claimedAmount) || 0;
                    const isExceeded = roundMoney(claimedNum) > roundMoney(line.remainingClaimable);

                    return (
                      <tr key={line.subcontractLineId} className={isExceeded ? "bg-rose-50/50" : undefined}>
                        <td className="px-3 py-2 text-center font-mono text-slate-500">{line.lineNumber}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{line.description}</div>
                          {isDraft && canManage && (
                            <input
                              type="text"
                              value={line.notes}
                              onChange={(e) => handleLineChange(idx, "notes", e.target.value)}
                              placeholder="Line notes or valuation remarks..."
                              className="mt-1 w-full bg-transparent text-[11px] text-slate-500 placeholder:text-slate-300 focus:outline-none"
                            />
                          )}
                          {line.notes && (!isDraft || !canManage) && (
                            <div className="text-[10px] text-slate-400 mt-0.5 italic">{line.notes}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">
                          {formatMoney(line.subcontractAmount, subcontract.currency)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-500">
                          {formatMoney(line.previouslyApproved, subcontract.currency)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-blue-700">
                          {formatMoney(line.remainingClaimable, subcontract.currency)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isDraft && canManage ? (
                            <input
                              type="number"
                              min="0"
                              max={line.remainingClaimable}
                              step="0.01"
                              value={line.claimedAmount}
                              onChange={(e) => handleLineChange(idx, "claimedAmount", e.target.value)}
                              className={`w-full rounded border px-2 py-1 text-right font-mono text-xs focus:outline-none ${
                                isExceeded
                                  ? "border-rose-400 bg-rose-50 text-rose-800 focus:ring-1 focus:ring-rose-500"
                                  : "border-slate-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                              }`}
                            />
                          ) : (
                            <span className="font-mono font-bold text-slate-900">
                              {formatMoney(Number(line.claimedAmount || 0), subcontract.currency)}
                            </span>
                          )}
                        </td>

                        {(isSubmitted || isApproved) && (
                          <td className="px-3 py-2 text-right">
                            {isSubmitted && canApprove ? (
                              <input
                                type="number"
                                min="0"
                                max={line.claimedAmount}
                                step="0.01"
                                value={line.approvedAmount}
                                onChange={(e) => handleLineChange(idx, "approvedAmount", e.target.value)}
                                className="w-full rounded border border-emerald-300 bg-emerald-50/40 px-2 py-1 text-right font-mono text-xs text-emerald-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            ) : (
                              <span className="font-mono font-bold text-emerald-700">
                                {formatMoney(Number(line.approvedAmount || 0), subcontract.currency)}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes & Calculations Summary Card */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="claimNotes" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Claim Remarks / Submission Notes
              </label>
              <textarea
                id="claimNotes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!isDraft || !canManage}
                placeholder="Progress certification remarks, milestones covered, or inspector reference..."
                className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">Gross Claimed:</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatMoney(totals.grossClaimed, subcontract.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-700 font-medium">Certified Gross Work:</span>
                <span className="font-mono font-bold text-emerald-700">
                  {formatMoney(totals.grossApproved, subcontract.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs border-t border-slate-200 pt-2">
                <span className="text-amber-700 font-medium">
                  Retention Held ({retentionPercent}%):
                </span>
                <span className="font-mono font-bold text-amber-700">
                  {formatMoney(totals.retentionAmount, subcontract.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold border-t border-slate-200 pt-2">
                <span className="text-slate-900">Net Certified Payable:</span>
                <span className="font-mono text-sm text-indigo-700">
                  {formatMoney(totals.netCertifiedAmount, subcontract.currency)}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1 italic">
                * Approved claims certify completed subcontract progress and reduce remaining commitment without inflating Actual Cost.
              </div>
            </div>
          </div>

          {/* Prompt Dialog for Rejection / Cancellation / Void Reason */}
          {reasonAction && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-4 space-y-3">
              <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                <ShieldAlert className="h-4 w-4" />
                <span>
                  {reasonAction === "REJECT" && "Reject Progress Claim — Mandatory Reason"}
                  {reasonAction === "CANCEL" && "Cancel Progress Claim — Mandatory Reason"}
                  {reasonAction === "VOID" && "Void Approved Claim — Mandatory Reason"}
                </span>
              </div>
              <p className="text-xs text-rose-700">
                This action is audited and cannot be undone. Please state the justification:
              </p>
              <textarea
                rows={2}
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Provide clear commercial/technical rationale..."
                className="w-full rounded-lg border border-rose-300 bg-white p-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReasonAction(null);
                    setReasonText("");
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReasonSubmit}
                  disabled={!reasonText.trim() || isSaving}
                  className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  Confirm {reasonAction}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-wrap items-center justify-between border-t border-slate-200 bg-slate-50/80 px-6 py-3.5 gap-2">
          <div className="flex items-center gap-2">
            {isDraft && canManage && (
              <button
                type="button"
                onClick={() => setReasonAction("CANCEL")}
                disabled={isSaving}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-sm"
              >
                Cancel Draft
              </button>
            )}

            {isSubmitted && canApprove && (
              <>
                <button
                  type="button"
                  onClick={() => setReasonAction("REJECT")}
                  disabled={isSaving}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-sm"
                >
                  Reject Claim
                </button>
                <button
                  type="button"
                  onClick={() => setReasonAction("CANCEL")}
                  disabled={isSaving}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-sm"
                >
                  Cancel Claim
                </button>
              </>
            )}

            {isApproved && canApprove && (
              <button
                type="button"
                onClick={() => setReasonAction("VOID")}
                disabled={isSaving}
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-sm"
              >
                Void Claim
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-sm"
            >
              {isTerminal ? "Close" : "Dismiss"}
            </button>

            {isDraft && canManage && (
              <>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-sm disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : "Save Draft"}
                </button>

                {isExisting && (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSaving || totals.grossClaimed <= 0}
                    className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-sm disabled:opacity-50"
                  >
                    Submit Claim
                  </button>
                )}
              </>
            )}

            {isSubmitted && canApprove && (
              <button
                type="button"
                onClick={handleApprove}
                disabled={isSaving || totals.grossApproved <= 0}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-sm disabled:opacity-50"
              >
                Approve & Certify Progress
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
