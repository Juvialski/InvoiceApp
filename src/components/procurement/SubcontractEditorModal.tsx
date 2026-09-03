import React, { useEffect, useId, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileCheck,
  FileText,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type { Project, ProjectCostCode, Subcontract, SubcontractLine, SubcontractStatus, Vendor } from "../../types.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";
import { formatDate, formatMoney } from "../../utils/invoiceLogic.ts";

export interface SubcontractEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  subcontract?: Subcontract | null; // null = new draft
  projects: Project[];
  vendors: Vendor[];
  costCodes: ProjectCostCode[];
  selectedProjectId?: string;
  canManage?: boolean;
  onSave: (
    sc: Partial<Subcontract> & { subcontractNumber: string; vendorId: string; projectId: string; title: string },
    lines: Array<Partial<SubcontractLine> & { description: string; amount: number }>,
  ) => Promise<void>;
}

interface EditableSubcontractLine {
  id?: string;
  description: string;
  amount: string;
  quantity: string;
  unit: string;
  unitRate: string;
  projectCostCodeId: string;
  notes: string;
}

function createEmptyLine(): EditableSubcontractLine {
  return {
    description: "",
    amount: "0",
    quantity: "",
    unit: "",
    unitRate: "",
    projectCostCodeId: "",
    notes: "",
  };
}

function editableLinesFromSubcontract(subcontract?: Subcontract | null): EditableSubcontractLine[] {
  if (!subcontract?.lines || subcontract.lines.length === 0) return [createEmptyLine()];
  return subcontract.lines.map((line) => ({
    id: line.id,
    description: line.description,
    amount: String(line.amount ?? 0),
    quantity: line.quantity != null ? String(line.quantity) : "",
    unit: line.unit || "",
    unitRate: line.unitRate != null ? String(line.unitRate) : "",
    projectCostCodeId: line.projectCostCodeId || "",
    notes: line.notes || "",
  }));
}

function formatStatusTone(status: SubcontractStatus): { bg: string; text: string; border: string } {
  switch (status) {
    case "DRAFT":
      return { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" };
    case "APPROVED":
      return { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" };
    case "ACTIVE":
      return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
    case "CLOSED":
      return { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-300" };
    case "CANCELLED":
      return { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" };
    default:
      return { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" };
  }
}

export const SubcontractEditorModal: React.FC<SubcontractEditorModalProps> = ({
  isOpen,
  onClose,
  subcontract,
  projects,
  vendors,
  costCodes,
  selectedProjectId,
  canManage = false,
  onSave,
}) => {
  const titleId = useId();

  const isEditing = Boolean(subcontract?.id);
  const status: SubcontractStatus = subcontract?.status || "DRAFT";
  const isDraft = status === "DRAFT";
  const isReadOnly = !isDraft || !canManage;

  const [subcontractNumber, setSubcontractNumber] = useState(subcontract?.subcontractNumber || "");
  const [vendorId, setVendorId] = useState(subcontract?.vendorId || "");
  const [projectId, setProjectId] = useState(subcontract?.projectId || selectedProjectId || "");
  const [title, setTitle] = useState(subcontract?.title || "");
  const [currency, setCurrency] = useState(subcontract?.currency || "PHP");
  const [startDate, setStartDate] = useState(subcontract?.startDate || "");
  const [targetCompletionDate, setTargetCompletionDate] = useState(subcontract?.targetCompletionDate || "");
  const [notes, setNotes] = useState(subcontract?.notes || "");
  const [lines, setLines] = useState<EditableSubcontractLine[]>(() => editableLinesFromSubcontract(subcontract));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const descriptionId = useId();
  const handleClose = () => {
    if (!isSubmitting) onClose();
  };
  const dialogRef = useDialogFocus({
    open: isOpen,
    onClose: handleClose,
  });

  // Initialize or reset form state on open / subcontract change
  useEffect(() => {
    if (subcontract) {
      setSubcontractNumber(subcontract.subcontractNumber || "");
      setVendorId(subcontract.vendorId || "");
      setProjectId(subcontract.projectId || selectedProjectId || (projects[0]?.id ?? ""));
      setTitle(subcontract.title || "");
      setCurrency(subcontract.currency || "PHP");
      setStartDate(subcontract.startDate || "");
      setTargetCompletionDate(subcontract.targetCompletionDate || "");
      setNotes(subcontract.notes || "");

      if (subcontract.lines && subcontract.lines.length > 0) {
        setLines(editableLinesFromSubcontract(subcontract));
      } else {
        setLines([createEmptyLine()]);
      }
    } else {
      const year = new Date().getFullYear();
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      setSubcontractNumber(`SC-${year}-${randomSuffix}`);
      setVendorId(vendors[0]?.id || "");
      setProjectId(selectedProjectId || (projects[0]?.id ?? ""));
      setTitle("");
      setCurrency("PHP");
      setStartDate(new Date().toISOString().split("T")[0]);
      setTargetCompletionDate("");
      setNotes("");
      setLines([createEmptyLine()]);
    }
    setErrorMessage(null);
  }, [subcontract, selectedProjectId, projects, vendors, isOpen]);

  // Filter cost codes for the selected project
  const availableCostCodes = useMemo(() => {
    if (!projectId) return [];
    const selectedHistoricalIds = new Set(lines.map((line) => line.projectCostCodeId).filter(Boolean));
    return costCodes.filter((cc) => cc.projectId === projectId && (cc.status === "ACTIVE" || selectedHistoricalIds.has(cc.id)));
  }, [costCodes, lines, projectId]);

  const availableProjects = useMemo(
    () => projects.filter((candidate) => candidate.status !== "ARCHIVED" || (isEditing && candidate.id === projectId)),
    [isEditing, projectId, projects],
  );

  const missingHistoricalCostCodeIds = useMemo(() => {
    const knownIds = new Set(availableCostCodes.map((costCode) => costCode.id));
    return [...new Set(lines.map((line) => line.projectCostCodeId).filter((id): id is string => Boolean(id && !knownIds.has(id))))];
  }, [availableCostCodes, lines]);

  // Calculated total amount across all lines
  const totalAmount = useMemo(() => {
    return lines.reduce((sum, line) => {
      const val = parseFloat(line.amount);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [lines]);

  const handleLineChange = (index: number, field: keyof EditableSubcontractLine, value: string) => {
    if (isReadOnly) return;
    setLines((prev) => {
      const updated = [...prev];
      const current = { ...updated[index], [field]: value };

      // If user edits quantity or unitRate, auto-calculate amount if both are valid numbers
      if (field === "quantity" || field === "unitRate") {
        const qty = parseFloat(field === "quantity" ? value : current.quantity);
        const rate = parseFloat(field === "unitRate" ? value : current.unitRate);
        if (!isNaN(qty) && !isNaN(rate) && qty > 0 && rate >= 0) {
          current.amount = (Math.round(qty * rate * 100) / 100).toFixed(2);
        }
      }

      updated[index] = current;
      return updated;
    });
  };

  const handleAddLine = () => {
    if (isReadOnly) return;
    setLines((prev) => [...prev, createEmptyLine()]);
  };

  const handleRemoveLine = (index: number) => {
    if (isReadOnly) return;
    if (lines.length <= 1) {
      setLines([createEmptyLine()]);
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;

    const trimmedNumber = subcontractNumber.trim().toUpperCase();
    if (!trimmedNumber) {
      setErrorMessage("Subcontract number is required");
      return;
    }
    if (trimmedNumber.length > 60) {
      setErrorMessage("Subcontract number must be 60 characters or fewer");
      return;
    }

    if (!vendorId) {
      setErrorMessage("Please select a vendor");
      return;
    }

    if (!projectId) {
      setErrorMessage("Please select a project");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage("Scope title is required");
      return;
    }
    if (trimmedTitle.length > 255) {
      setErrorMessage("Scope title must be 255 characters or fewer");
      return;
    }

    const normalizedCurrency = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      setErrorMessage("Currency must be a 3-letter ISO code");
      return;
    }
    if (startDate && targetCompletionDate && targetCompletionDate < startDate) {
      setErrorMessage("Target completion date cannot be before the start date");
      return;
    }

    if (lines.length === 0) {
      setErrorMessage("At least one scope line item is required");
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const description = line.description.trim();
      if (!description) {
        setErrorMessage(`Line ${i + 1}: Description is required`);
        return;
      }
      if (description.length > 500) {
        setErrorMessage(`Line ${i + 1}: Description must be 500 characters or fewer`);
        return;
      }
      const amountVal = Number(line.amount);
      if (!line.amount.trim() || !Number.isFinite(amountVal) || amountVal < 0) {
        setErrorMessage(`Line ${i + 1}: Amount must be a valid non-negative number`);
        return;
      }
      if (line.quantity.trim()) {
        const quantity = Number(line.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          setErrorMessage(`Line ${i + 1}: Quantity must be positive when provided`);
          return;
        }
      }
      if (line.unitRate.trim()) {
        const unitRate = Number(line.unitRate);
        if (!Number.isFinite(unitRate) || unitRate < 0) {
          setErrorMessage(`Line ${i + 1}: Unit rate must be non-negative when provided`);
          return;
        }
      }
      if (line.unit.trim().length > 50) {
        setErrorMessage(`Line ${i + 1}: Unit must be 50 characters or fewer`);
        return;
      }
      if (line.projectCostCodeId) {
        const costCode = costCodes.find((candidate) => candidate.id === line.projectCostCodeId && candidate.projectId === projectId);
        if (!costCode || costCode.status !== "ACTIVE") {
          setErrorMessage(`Line ${i + 1}: Select an active project cost code before saving`);
          return;
        }
      }
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const payloadLines: Array<Partial<SubcontractLine> & { description: string; amount: number }> = lines.map(
        (l) => {
          const qty = l.quantity.trim() ? Number(l.quantity) : null;
          const rate = l.unitRate.trim() ? Number(l.unitRate) : null;
          return {
            id: l.id,
            description: l.description.trim(),
            amount: Math.round(Number(l.amount) * 100) / 100,
            quantity: qty != null && Number.isFinite(qty) ? qty : null,
            unit: l.unit.trim() || null,
            unitRate: rate != null && Number.isFinite(rate) ? rate : null,
            projectCostCodeId: l.projectCostCodeId || null,
            notes: l.notes.trim() || null,
          };
        },
      );

      await onSave(
        {
          id: subcontract?.id,
          subcontractNumber: trimmedNumber,
          vendorId,
          projectId,
          title: trimmedTitle,
          currency: normalizedCurrency,
          startDate: startDate || null,
          targetCompletionDate: targetCompletionDate || null,
          notes: notes.trim() || null,
          status: subcontract?.status || "DRAFT",
        },
        payloadLines,
      );

      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save subcontract");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const tone = formatStatusTone(status);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={dialogRef as unknown as React.RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 my-8 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 shadow-sm">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 id={titleId} className="text-base font-bold text-slate-900">
                  {isEditing ? `Subcontract ${subcontract?.subcontractNumber}` : "New Subcontract Draft"}
                </h3>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${tone.bg} ${tone.text} ${tone.border}`}
                >
                  {status}
                </span>
              </div>
              <p id={descriptionId} className="text-xs text-slate-500 font-medium">
                {isReadOnly
                  ? !isDraft
                    ? "Read-only mode. Approved, active, closed, and cancelled commitments cannot be edited directly."
                    : "Read-only mode. Procurement management permission is required to edit this draft."
                  : "Draft trade subcontract commitment linked to project controls."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {errorMessage && (
            <div id={`${descriptionId}-error`} role="alert" aria-live="assertive" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Audit / Lifecycle Banner (when not draft) */}
          {!isDraft && subcontract && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <ShieldCheck className="h-4 w-4 text-indigo-600" />
                <span>Lifecycle & Authorization Audit Trail</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-slate-600 pt-1">
                {subcontract.approvedAt && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Approved</span>
                    <span>{formatDate(subcontract.approvedAt)}</span>
                  </div>
                )}
                {subcontract.activatedAt && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Activated</span>
                    <span>{formatDate(subcontract.activatedAt)}</span>
                  </div>
                )}
                {subcontract.closedAt && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Closed</span>
                    <span>{formatDate(subcontract.closedAt)}</span>
                  </div>
                )}
                {subcontract.cancelledAt && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-rose-500 block">Cancelled</span>
                    <span className="text-rose-700 font-medium">{formatDate(subcontract.cancelledAt)}</span>
                  </div>
                )}
              </div>
              {subcontract.cancellationReason && (
                <div className="mt-2 rounded-lg bg-rose-50/60 border border-rose-100 p-2.5 text-xs text-rose-800">
                  <span className="font-bold">Cancellation Reason:</span> {subcontract.cancellationReason}
                </div>
              )}
            </div>
          )}

          {/* Primary Metadata Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="sc-number" className="block text-xs font-bold text-slate-700 mb-1">
                Subcontract Number <span className="text-rose-500">*</span>
              </label>
              <input
                id="sc-number"
                type="text"
                value={subcontractNumber}
                onChange={(e) => setSubcontractNumber(e.target.value.toUpperCase())}
                disabled={isReadOnly || isSubmitting}
                maxLength={60}
                placeholder="SC-2026-001"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label htmlFor="sc-vendor" className="block text-xs font-bold text-slate-700 mb-1">
                Subcontractor / Vendor <span className="text-rose-500">*</span>
              </label>
              <select
                id="sc-vendor"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                disabled={isReadOnly || isSubmitting}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50"
                >
                  <option value="">Select Subcontractor...</option>
                  {vendorId && !vendors.some((vendor) => vendor.id === vendorId) && (
                    <option value={vendorId}>{vendorId} (current vendor unavailable)</option>
                  )}
                  {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sc-project" className="block text-xs font-bold text-slate-700 mb-1">
                Project <span className="text-rose-500">*</span>
              </label>
              <select
                id="sc-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={isReadOnly || isSubmitting || Boolean(selectedProjectId)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50"
                >
                  <option value="">Select Project...</option>
                  {availableProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode ? `[${p.projectCode}] ` : ""}
                    {p.projectName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Scope Title & Currency */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-3">
              <label htmlFor="sc-title" className="block text-xs font-bold text-slate-700 mb-1">
                Scope Title <span className="text-rose-500">*</span>
              </label>
              <input
                id="sc-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isReadOnly || isSubmitting}
                maxLength={255}
                placeholder="e.g. HVAC & Mechanical Piping Installation Package"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label htmlFor="sc-currency" className="block text-xs font-bold text-slate-700 mb-1">
                Currency
              </label>
              <input
                id="sc-currency"
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                disabled={isReadOnly || isSubmitting}
                maxLength={3}
                placeholder="PHP"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 uppercase focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50"
              />
            </div>
          </div>

          {/* Schedule: Start & Target Completion Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sc-start-date" className="block text-xs font-bold text-slate-700 mb-1">
                Start Date
              </label>
              <div className="relative">
                <input
                  id="sc-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isReadOnly || isSubmitting}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label htmlFor="sc-target-date" className="block text-xs font-bold text-slate-700 mb-1">
                Target Completion Date
              </label>
              <div className="relative">
                <input
                  id="sc-target-date"
                  type="date"
                  value={targetCompletionDate}
                  onChange={(e) => setTargetCompletionDate(e.target.value)}
                  disabled={isReadOnly || isSubmitting}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50"
                />
              </div>
            </div>
          </div>

          {/* Dynamic Scope Lines Table */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  Scope of Work & Cost Breakdown
                </h4>
                <p className="text-[11px] text-slate-500">
                  Itemized trade line items allocated to project cost codes.
                </p>
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={handleAddLine}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/80 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Line
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 font-bold text-slate-600 text-[11px] uppercase tracking-wider">
                    <th scope="col" className="py-2.5 px-3 w-10 text-center">#</th>
                    <th scope="col" className="py-2.5 px-3 min-w-[200px]">Scope / Description *</th>
                    <th scope="col" className="py-2.5 px-3 min-w-[160px]">Cost Code</th>
                    <th scope="col" className="py-2.5 px-3 w-24">Qty</th>
                    <th scope="col" className="py-2.5 px-3 w-20">Unit</th>
                    <th scope="col" className="py-2.5 px-3 w-28">Unit Rate</th>
                    <th scope="col" className="py-2.5 px-3 w-32 text-right">Amount ({currency}) *</th>
                    {!isReadOnly && <th scope="col" className="py-2.5 px-3 w-10 text-center"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, idx) => (
                    <tr key={line.id || idx} className="hover:bg-slate-50/50 transition">
                      <td className="py-2.5 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={line.description}
                          onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                          disabled={isReadOnly || isSubmitting}
                          maxLength={500}
                          placeholder="Trade deliverable or scope item..."
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-transparent disabled:border-transparent"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={line.projectCostCodeId}
                          onChange={(e) => handleLineChange(idx, "projectCostCodeId", e.target.value)}
                          disabled={isReadOnly || isSubmitting}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-transparent disabled:border-transparent"
                        >
                          <option value="">(No Cost Code)</option>
                          {availableCostCodes.map((cc) => (
                            <option key={cc.id} value={cc.id} disabled={isDraft && cc.status !== "ACTIVE"}>
                              {cc.code} - {cc.name}{cc.status !== "ACTIVE" ? " (Archived — historical)" : ""}
                            </option>
                          ))}
                          {missingHistoricalCostCodeIds.map((id) => (
                            <option key={id} value={id} disabled={isDraft}>
                              {id} (historical code unavailable)
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3">
                          <input
                            type="number"
                            step="any"
                            min="0.0001"
                            value={line.quantity}
                          onChange={(e) => handleLineChange(idx, "quantity", e.target.value)}
                          disabled={isReadOnly || isSubmitting}
                          placeholder="1"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-transparent disabled:border-transparent"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={line.unit}
                          onChange={(e) => handleLineChange(idx, "unit", e.target.value)}
                          disabled={isReadOnly || isSubmitting}
                          maxLength={50}
                          placeholder="lot"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-transparent disabled:border-transparent"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={line.unitRate}
                          onChange={(e) => handleLineChange(idx, "unitRate", e.target.value)}
                          disabled={isReadOnly || isSubmitting}
                          placeholder="0.00"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-transparent disabled:border-transparent"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={line.amount}
                          onChange={(e) => handleLineChange(idx, "amount", e.target.value)}
                          disabled={isReadOnly || isSubmitting}
                          placeholder="0.00"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-right font-bold text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-transparent disabled:border-transparent"
                        />
                      </td>
                      {!isReadOnly && (
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={isSubmitting}
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                            title="Remove line"
                            aria-label={`Remove line ${idx + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50/90 font-extrabold text-xs text-slate-900">
                    <td colSpan={isReadOnly ? 6 : 6} className="py-3 px-4 text-right">
                      Total Subcontract Value:
                    </td>
                    <td className="py-3 px-3 text-right font-black text-indigo-700 text-sm">
                      {formatMoney(totalAmount, currency)}
                    </td>
                    {!isReadOnly && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="sc-notes" className="block text-xs font-bold text-slate-700 mb-1">
              General Notes & Terms
            </label>
            <textarea
              id="sc-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isReadOnly || isSubmitting}
              placeholder="Commercial terms, retention, warranty clauses, or scope boundaries..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="text-xs text-slate-500 font-medium">
            Lines: <span className="font-bold text-slate-700">{lines.length}</span> | Total:{" "}
            <span className="font-bold text-indigo-700">{formatMoney(totalAmount, currency)}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
            >
              {isReadOnly ? "Close" : "Cancel"}
            </button>
            {!isReadOnly && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isSubmitting ? "Saving..." : isEditing ? "Save Changes" : "Save Subcontract Draft"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
