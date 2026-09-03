import React, { useEffect, useId, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  DollarSign,
  FileCheck,
  FileEdit,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type {
  Project,
  ProjectCostCode,
  Subcontract,
  SubcontractProgressClaim,
  SubcontractVariation,
  SubcontractVariationLine,
  SubcontractVariationStatus,
  Vendor,
} from "../../types.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";
import { formatDate, formatMoney } from "../../utils/invoiceLogic.ts";
import {
  calculateNetApprovedVariations,
  calculateRemainingSubcontractCommitment,
  calculateRevisedSubcontractValue,
  normalizeVariationDraftInput,
  roundMoney,
} from "../../lib/subcontractVariations.ts";

export interface SubcontractVariationModalProps {
  isOpen: boolean;
  onClose: () => void;
  variation?: SubcontractVariation | null; // null = new draft
  subcontract: Subcontract;
  project?: Project | null;
  vendor?: Vendor | null;
  existingVariations?: SubcontractVariation[];
  existingClaims?: SubcontractProgressClaim[];
  projectCostCodes?: ProjectCostCode[];
  canManage?: boolean;
  canApprove?: boolean;
  onSave: (
    variation: Partial<SubcontractVariation> & {
      subcontractId: string;
      projectId: string;
      variationNumber: string;
      title: string;
      currency?: string;
    },
    lines: Array<Partial<SubcontractVariationLine> & { description: string; amount: number }>,
  ) => Promise<void>;
  onTransition?: (
    id: string,
    targetStatus: SubcontractVariationStatus,
    reason?: string,
  ) => Promise<void>;
}

interface EditableVariationLine {
  id?: string;
  subcontractLineId: string; // "" if standalone
  projectCostCodeId: string;
  description: string;
  quantity: string;
  unit: string;
  unitRate: string;
  amount: string;
  notes: string;
}

export const SubcontractVariationModal: React.FC<SubcontractVariationModalProps> = ({
  isOpen,
  onClose,
  variation,
  subcontract,
  project,
  vendor,
  existingVariations = [],
  existingClaims = [],
  projectCostCodes = [],
  canManage = true,
  onSave,
  onTransition,
}) => {
  const titleId = useId();
  const dialogRef = useDialogFocus({ open: isOpen, onClose });

  const [variationNumber, setVariationNumber] = useState("");
  const [title, setTitle] = useState("");
  const [variationDate, setVariationDate] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditableVariationLine[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form state when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    if (variation) {
      setVariationNumber(variation.variationNumber || "");
      setTitle(variation.title || "");
      setVariationDate(variation.variationDate || new Date().toISOString().split("T")[0]);
      setDescription(variation.description || "");
      setReason(variation.reason || "");
      setNotes(variation.notes || "");
      setLines(
        (variation.lines || []).map((l) => ({
          id: l.id,
          subcontractLineId: l.subcontractLineId || "",
          projectCostCodeId: l.projectCostCodeId || "",
          description: l.description || "",
          quantity: l.quantity != null ? String(l.quantity) : "",
          unit: l.unit || "",
          unitRate: l.unitRate != null ? String(l.unitRate) : "",
          amount: String(l.amount || 0),
          notes: l.notes || "",
        })),
      );
    } else {
      // Auto-suggest next variation number: VAR-001, VAR-002, etc.
      const scVariations = existingVariations.filter((v) => v.subcontractId === subcontract.id);
      const nextNum = scVariations.length + 1;
      const suggestedNumber = `VAR-${String(nextNum).padStart(3, "0")}`;

      setVariationNumber(suggestedNumber);
      setTitle("");
      setVariationDate(new Date().toISOString().split("T")[0]);
      setDescription("");
      setReason("");
      setNotes("");
      setLines([
        {
          id: undefined,
          subcontractLineId: "",
          projectCostCodeId: "",
          description: "",
          quantity: "",
          unit: "",
          unitRate: "",
          amount: "0",
          notes: "",
        },
      ]);
    }
  }, [isOpen, variation, subcontract.id, existingVariations]);

  // Commercial Metrics
  const originalAmount = roundMoney(Number(subcontract.originalAmount || 0));
  const otherApprovedVariations = useMemo(
    () =>
      existingVariations.filter(
        (v) => v.subcontractId === subcontract.id && v.status === "APPROVED" && v.id !== variation?.id,
      ),
    [existingVariations, subcontract.id, variation?.id],
  );
  const netOtherApprovedVariations = useMemo(
    () => calculateNetApprovedVariations(otherApprovedVariations),
    [otherApprovedVariations],
  );
  const currentSubcontractValue = roundMoney(originalAmount + netOtherApprovedVariations);

  const thisVariationNetAmount = useMemo(() => {
    return roundMoney(
      lines.reduce((sum, l) => {
        const val = Number(l.amount);
        return sum + (Number.isFinite(val) ? val : 0);
      }, 0),
    );
  }, [lines]);

  const projectedRevisedValue = roundMoney(currentSubcontractValue + thisVariationNetAmount);

  const cumulativeApprovedClaimsGross = useMemo(() => {
    return roundMoney(
      existingClaims
        .filter((c) => c.subcontractId === subcontract.id && c.status === "APPROVED")
        .reduce((sum, c) => sum + roundMoney(Number(c.approvedGrossAmount || 0)), 0),
    );
  }, [existingClaims, subcontract.id]);

  const projectedRemainingCommitment = roundMoney(
    Math.max(0, projectedRevisedValue - cumulativeApprovedClaimsGross),
  );

  const wouldViolateCertifiedScope = projectedRevisedValue < cumulativeApprovedClaimsGross;

  if (!isOpen) return null;

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: undefined,
        subcontractLineId: "",
        projectCostCodeId: "",
        description: "",
        quantity: "",
        unit: "",
        unitRate: "",
        amount: "0",
        notes: "",
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) {
      setError("A variation must have at least one line item.");
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof EditableVariationLine, value: string) => {
    setLines((prev) => {
      const copy = [...prev];
      const line = { ...copy[index], [field]: value };

      // Auto-compute amount if quantity and unitRate are provided and amount wasn't explicitly manually changed
      if (field === "quantity" || field === "unitRate") {
        const q = Number(field === "quantity" ? value : line.quantity);
        const r = Number(field === "unitRate" ? value : line.unitRate);
        if (Number.isFinite(q) && q > 0 && Number.isFinite(r) && r >= 0) {
          line.amount = String(roundMoney(q * r));
        }
      }

      // If linking to a subcontract line, auto-inherit description if empty
      if (field === "subcontractLineId" && value) {
        const matchedScLine = (subcontract.lines || []).find((l) => l.id === value);
        if (matchedScLine && !line.description) {
          line.description = `Adjustment to: ${matchedScLine.description}`;
        }
        if (matchedScLine?.projectCostCodeId && !line.projectCostCodeId) {
          line.projectCostCodeId = matchedScLine.projectCostCodeId;
        }
      }

      copy[index] = line;
      return copy;
    });
  };

  const handleSaveInternal = async (andSubmit = false): Promise<void> => {
    try {
      setIsSubmitting(true);
      setError(null);

      if (wouldViolateCertifiedScope) {
        throw new Error(
          `Projected revised subcontract value (${formatMoney(projectedRevisedValue, subcontract.currency)}) cannot be less than cumulative certified claims (${formatMoney(cumulativeApprovedClaimsGross, subcontract.currency)}).`,
        );
      }

      const rawLines = lines.map((l) => ({
        id: l.id,
        subcontractLineId: l.subcontractLineId || null,
        projectCostCodeId: l.projectCostCodeId || null,
        description: l.description,
        amount: Number(l.amount),
        quantity: l.quantity.trim() ? Number(l.quantity) : null,
        unit: l.unit.trim() || null,
        unitRate: l.unitRate.trim() ? Number(l.unitRate) : null,
        notes: l.notes.trim() || null,
      }));

      const payload = {
        id: variation?.id,
        subcontractId: subcontract.id,
        projectId: subcontract.projectId,
        variationNumber: variationNumber.trim().toUpperCase(),
        title: title.trim(),
        description: description.trim() || null,
        reason: reason.trim() || null,
        variationDate,
        currency: subcontract.currency,
        notes: notes.trim() || null,
      };

      // Validate upfront
      normalizeVariationDraftInput(payload, rawLines);

      await onSave(payload, rawLines);

      if (andSubmit && onTransition && variation?.id) {
        await onTransition(variation.id, "SUBMITTED");
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save variation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDraft = !variation || variation.status === "DRAFT";

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
            <div className="rounded-lg bg-indigo-600/10 p-2 text-indigo-600">
              <FileEdit className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id={titleId} className="text-lg font-bold text-slate-900">
                  {variation ? `Edit Variation: ${variation.variationNumber}` : "New Subcontract Variation"}
                </h2>
                <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                  {subcontract.subcontractNumber}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {vendor?.name || subcontract.vendorId} • {project?.projectName || project?.projectCode || "Project"} •{" "}
                {subcontract.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            aria-label="Close variation modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Commercial Impact Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-100/70 p-4 border-b border-slate-200 text-xs">
          <div className="rounded-lg bg-white p-3 border border-slate-200 shadow-sm">
            <span className="text-slate-500 block font-medium">Original Contract</span>
            <span className="text-sm font-bold text-slate-900">
              {formatMoney(originalAmount, subcontract.currency)}
            </span>
          </div>

          <div className="rounded-lg bg-white p-3 border border-slate-200 shadow-sm">
            <span className="text-slate-500 block font-medium">Current Approved Value</span>
            <span className="text-sm font-bold text-slate-900">
              {formatMoney(currentSubcontractValue, subcontract.currency)}
            </span>
          </div>

          <div className="rounded-lg bg-white p-3 border border-slate-200 shadow-sm">
            <span className="text-slate-500 block font-medium">Variation Net Impact</span>
            <span
              className={`text-sm font-bold ${
                thisVariationNetAmount > 0
                  ? "text-emerald-700"
                  : thisVariationNetAmount < 0
                  ? "text-amber-700"
                  : "text-slate-900"
              }`}
            >
              {thisVariationNetAmount > 0 ? "+" : ""}
              {formatMoney(thisVariationNetAmount, subcontract.currency)}
            </span>
          </div>

          <div
            className={`rounded-lg p-3 border shadow-sm ${
              wouldViolateCertifiedScope
                ? "bg-rose-50 border-rose-300 text-rose-900"
                : "bg-indigo-50/70 border-indigo-200 text-indigo-950"
            }`}
          >
            <span className="block font-medium text-[11px] opacity-80">Projected Revised Value</span>
            <span className="text-sm font-bold">{formatMoney(projectedRevisedValue, subcontract.currency)}</span>
          </div>
        </div>

        {/* Over-claim scope warning alert */}
        {wouldViolateCertifiedScope && (
          <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-900">
            <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Cannot Reduce Subcontract Below Certified Scope</p>
              <p className="mt-0.5 leading-relaxed">
                The projected revised subcontract value (
                <span className="font-semibold">{formatMoney(projectedRevisedValue, subcontract.currency)}</span>
                ) is lower than cumulative certified progress claims (
                <span className="font-semibold">{formatMoney(cumulativeApprovedClaimsGross, subcontract.currency)}</span>
                ). Negative variations cannot omit already certified work.
              </p>
            </div>
          </div>
        )}

        {/* Form Error */}
        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[60vh]">
          {/* Header Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Variation Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={variationNumber}
                onChange={(e) => setVariationNumber(e.target.value.toUpperCase())}
                placeholder="e.g. VAR-001"
                disabled={!isDraft || isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Variation Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={variationDate}
                onChange={(e) => setVariationDate(e.target.value)}
                disabled={!isDraft || isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Currency</label>
              <input
                type="text"
                value={subcontract.currency}
                disabled
                className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Variation Title / Headline <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Additional conduit and distribution board changes"
              disabled={!isDraft || isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Scope Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detailed commercial scope or engineering reason for change..."
                disabled={!isDraft || isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason / Justification</label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Client instruction, site condition, architect revision reference..."
                disabled={!isDraft || isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 resize-none"
              />
            </div>
          </div>

          {/* Line Items Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Variation Scope Items ({lines.length})
              </h3>
              {isDraft && (
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Line Item
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-semibold">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 w-12 text-center">
                      #
                    </th>
                    <th scope="col" className="px-3 py-2.5 min-w-[200px]">
                      Description
                    </th>
                    <th scope="col" className="px-3 py-2.5 w-48">
                      Scope / Allocation
                    </th>
                    <th scope="col" className="px-3 py-2.5 w-24">
                      Qty
                    </th>
                    <th scope="col" className="px-3 py-2.5 w-20">
                      Unit
                    </th>
                    <th scope="col" className="px-3 py-2.5 w-28">
                      Unit Rate
                    </th>
                    <th scope="col" className="px-3 py-2.5 w-32 text-right">
                      Amount ({subcontract.currency})
                    </th>
                    {isDraft && (
                      <th scope="col" className="px-2 py-2.5 w-10 text-center">
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lines.map((line, idx) => (
                    <tr key={line.id || `line-${idx}`} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={line.description}
                          onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                          placeholder="Line item description"
                          disabled={!isDraft || isSubmitting}
                          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="space-y-1">
                          <select
                            value={line.subcontractLineId}
                            onChange={(e) => handleLineChange(idx, "subcontractLineId", e.target.value)}
                            disabled={!isDraft || isSubmitting}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-800 focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="">Standalone Scope (New)</option>
                            {(subcontract.lines || []).map((scLine) => (
                              <option key={scLine.id} value={scLine.id}>
                                Adjust: Line {scLine.lineNumber} - {scLine.description.slice(0, 24)}...
                              </option>
                            ))}
                          </select>

                          <select
                            value={line.projectCostCodeId}
                            onChange={(e) => handleLineChange(idx, "projectCostCodeId", e.target.value)}
                            disabled={!isDraft || isSubmitting}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-800 focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="">Inherit / Uncoded</option>
                            {projectCostCodes.map((cc) => (
                              <option key={cc.id} value={cc.id}>
                                Cost Code: {cc.code} ({cc.name.slice(0, 16)})
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="any"
                          value={line.quantity}
                          onChange={(e) => handleLineChange(idx, "quantity", e.target.value)}
                          placeholder="Qty"
                          disabled={!isDraft || isSubmitting}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none text-right disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={line.unit}
                          onChange={(e) => handleLineChange(idx, "unit", e.target.value)}
                          placeholder="Unit"
                          disabled={!isDraft || isSubmitting}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={line.unitRate}
                          onChange={(e) => handleLineChange(idx, "unitRate", e.target.value)}
                          placeholder="Rate"
                          disabled={!isDraft || isSubmitting}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none text-right disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={line.amount}
                          onChange={(e) => handleLineChange(idx, "amount", e.target.value)}
                          placeholder="0.00"
                          disabled={!isDraft || isSubmitting}
                          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none text-right disabled:bg-slate-100"
                        />
                      </td>
                      {isDraft && (
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={lines.length <= 1 || isSubmitting}
                            className="rounded p-1 text-slate-400 hover:text-rose-600 disabled:opacity-40"
                            aria-label={`Remove line ${idx + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold text-slate-900 border-t border-slate-200">
                  <tr>
                    <td colSpan={6} className="px-3 py-2.5 text-right text-xs">
                      Net Variation Amount:
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right text-sm font-bold ${
                        thisVariationNetAmount > 0
                          ? "text-emerald-700"
                          : thisVariationNetAmount < 0
                          ? "text-amber-700"
                          : "text-slate-900"
                      }`}
                    >
                      {thisVariationNetAmount > 0 ? "+" : ""}
                      {formatMoney(thisVariationNetAmount, subcontract.currency)}
                    </td>
                    {isDraft && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            Cancel
          </button>

          {isDraft && canManage && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSaveInternal(false)}
                disabled={isSubmitting || wouldViolateCertifiedScope}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
              >
                Save as Draft
              </button>

              <button
                type="button"
                onClick={() => handleSaveInternal(true)}
                disabled={isSubmitting || wouldViolateCertifiedScope}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {isSubmitting ? "Saving..." : "Save & Submit for Review"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
