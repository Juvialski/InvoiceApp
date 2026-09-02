import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, FileText, Plus, Trash2, X, Users, Calendar, CheckSquare, Square } from "lucide-react";
import type { Project, ProjectCostCode, RFQ, RFQLine, Vendor } from "../../types.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";

export interface RFQEditorModalProps {
  open: boolean;
  rfq?: RFQ | null;
  projects: readonly Project[];
  vendors: readonly Vendor[];
  costCodes: readonly ProjectCostCode[];
  defaultProjectId?: string;
  onSave: (
    rfq: Partial<RFQ> & { rfqNumber: string; title: string },
    lines: Array<Partial<RFQLine> & { description: string; quantity: number }>,
    invitedVendorIds?: string[],
  ) => Promise<void> | void;
  onClose: () => void;
}

interface EditableRFQLine {
  id?: string;
  description: string;
  quantity: string;
  unit: string;
  projectCostCodeId: string;
  requestedDeliveryDate: string;
  notes: string;
}

function createEmptyLine(): EditableRFQLine {
  return {
    description: "",
    quantity: "1",
    unit: "pcs",
    projectCostCodeId: "",
    requestedDeliveryDate: "",
    notes: "",
  };
}

export const RFQEditorModal: React.FC<RFQEditorModalProps> = ({
  open,
  rfq,
  projects,
  vendors,
  costCodes,
  defaultProjectId,
  onSave,
  onClose,
}) => {
  const titleId = useId();
  const dialogRef = useDialogFocus({ open, onClose });

  const isEditing = Boolean(rfq?.id);

  const [rfqNumber, setRfqNumber] = useState(() => rfq?.rfqNumber || `RFQ-25-${Math.floor(1000 + Math.random() * 9000)}`);
  const [title, setTitle] = useState(() => rfq?.title || "");
  const [description, setDescription] = useState(() => rfq?.description || "");
  const [projectId, setProjectId] = useState(() => rfq?.projectId || defaultProjectId || "");
  const [currency, setCurrency] = useState(() => rfq?.currency || "PHP");
  const [issueDate, setIssueDate] = useState(() => rfq?.issueDate || "");
  const [dueDate, setDueDate] = useState(() => rfq?.dueDate || "");
  const [notes, setNotes] = useState(() => rfq?.notes || "");
  const [invitedVendorIds, setInvitedVendorIds] = useState<string[]>(
    () => rfq?.invitedVendorIds || rfq?.invitedVendors?.map((v) => v.vendorId) || [],
  );
  const [lines, setLines] = useState<EditableRFQLine[]>(() => {
    if (rfq?.lines && rfq.lines.length > 0) {
      return rfq.lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: String(l.quantity),
        unit: l.unit || "pcs",
        projectCostCodeId: l.projectCostCodeId || "",
        requestedDeliveryDate: l.requestedDeliveryDate || "",
        notes: l.notes || "",
      }));
    }
    return [createEmptyLine()];
  });
  const [vendorSearch, setVendorSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize or reset fields
  useEffect(() => {
    if (rfq) {
      setRfqNumber(rfq.rfqNumber || "");
      setTitle(rfq.title || "");
      setDescription(rfq.description || "");
      setProjectId(rfq.projectId || defaultProjectId || "");
      setCurrency(rfq.currency || "PHP");
      setIssueDate(rfq.issueDate || "");
      setDueDate(rfq.dueDate || "");
      setNotes(rfq.notes || "");
      setInvitedVendorIds(rfq.invitedVendorIds || rfq.invitedVendors?.map((v) => v.vendorId) || []);

      if (rfq.lines && rfq.lines.length > 0) {
        setLines(
          rfq.lines.map((l) => ({
            id: l.id,
            description: l.description,
            quantity: String(l.quantity),
            unit: l.unit || "pcs",
            projectCostCodeId: l.projectCostCodeId || "",
            requestedDeliveryDate: l.requestedDeliveryDate || "",
            notes: l.notes || "",
          })),
        );
      } else {
        setLines([createEmptyLine()]);
      }
    } else {
      // Auto-generate tentative draft RFQ number
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      setRfqNumber(`RFQ-25-${randomSuffix}`);
      setTitle("");
      setDescription("");
      setProjectId(defaultProjectId || (projects[0]?.id ?? ""));
      setCurrency("PHP");
      setIssueDate(new Date().toISOString().split("T")[0]);
      setDueDate("");
      setNotes("");
      setInvitedVendorIds([]);
      setLines([createEmptyLine()]);
    }
    setErrorMessage(null);
  }, [rfq, defaultProjectId, projects, open]);

  // Filter cost codes by selected project
  const availableCostCodes = useMemo(() => {
    if (!projectId) return [];
    return costCodes.filter((cc) => cc.projectId === projectId && cc.status === "ACTIVE");
  }, [costCodes, projectId]);

  // Filter vendors by search
  const filteredVendors = useMemo(() => {
    if (!vendorSearch.trim()) return vendors;
    const q = vendorSearch.trim().toLowerCase();
    return vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.defaultCategory && v.defaultCategory.toLowerCase().includes(q)) ||
        (v.taxId && v.taxId.toLowerCase().includes(q)),
    );
  }, [vendors, vendorSearch]);

  const toggleVendor = (vendorId: string) => {
    setInvitedVendorIds((prev) =>
      prev.includes(vendorId) ? prev.filter((id) => id !== vendorId) : [...prev, vendorId],
    );
  };

  const handleLineChange = (index: number, field: keyof EditableRFQLine, value: string) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddLine = () => {
    setLines((prev) => [...prev, createEmptyLine()]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) {
      setLines([createEmptyLine()]);
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanNumber = rfqNumber.trim().toUpperCase();
    if (!cleanNumber) {
      setErrorMessage("RFQ Number is required.");
      return;
    }

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setErrorMessage("RFQ Title is required.");
      return;
    }

    if (lines.length === 0) {
      setErrorMessage("At least one line item is required.");
      return;
    }

    const preparedLines: Array<Partial<RFQLine> & { description: string; quantity: number }> = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const desc = line.description.trim();
      if (!desc) {
        setErrorMessage(`Line ${i + 1}: Description is required.`);
        return;
      }
      const qty = parseFloat(line.quantity);
      if (isNaN(qty) || qty <= 0) {
        setErrorMessage(`Line ${i + 1}: Quantity must be a positive number.`);
        return;
      }

      preparedLines.push({
        id: line.id,
        lineNumber: i + 1,
        description: desc,
        quantity: qty,
        unit: line.unit.trim() || "pcs",
        projectCostCodeId: line.projectCostCodeId || null,
        requestedDeliveryDate: line.requestedDeliveryDate || null,
        notes: line.notes.trim() || null,
      });
    }

    setIsSubmitting(true);
    try {
      await onSave(
        {
          id: rfq?.id,
          rfqNumber: cleanNumber,
          title: cleanTitle,
          description: description.trim() || null,
          projectId: projectId || null,
          currency: currency.trim().toUpperCase() || "PHP",
          issueDate: issueDate || null,
          dueDate: dueDate || null,
          notes: notes.trim() || null,
        },
        preparedLines,
        invitedVendorIds,
      );
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save RFQ. Please try again.";
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-bold text-slate-900">
                {isEditing ? `Edit RFQ: ${rfq?.rfqNumber}` : "New Request for Quotation (RFQ)"}
              </h2>
              <p className="text-xs text-slate-500">
                Solicit competitive bids from vendors before committing commercial obligations.
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
            {/* Error Message */}
            {errorMessage && (
              <div
                role="alert"
                className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs text-rose-800"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span className="font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Top Metadata Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  RFQ Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={rfqNumber}
                  onChange={(e) => setRfqNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. RFQ-25-0004"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-semibold uppercase text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  RFQ Title / Package Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Chilled Water Piping & Valves Package"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Project</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">No Project Scoped (General)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectCode} — {p.projectName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="PHP">PHP (Philippine Peso)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="JPY">JPY (Japanese Yen)</option>
                  <option value="SGD">SGD (Singapore Dollar)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:col-span-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Issue Date</label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Scope of Work</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Scope details, technical standards, delivery terms, and submission requirements..."
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Invited Vendors Multi-Select */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Invited Vendors</span>
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700">
                    {invitedVendorIds.length} selected
                  </span>
                </div>
                <input
                  type="text"
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  placeholder="Search vendors..."
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-44 overflow-y-auto pr-1">
                {filteredVendors.map((vendor) => {
                  const isChecked = invitedVendorIds.includes(vendor.id);
                  return (
                    <button
                      key={vendor.id}
                      type="button"
                      onClick={() => toggleVendor(vendor.id)}
                      className={`flex items-start gap-2.5 rounded-lg border p-2 text-left transition ${
                        isChecked
                          ? "border-indigo-500 bg-indigo-50/70 text-indigo-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <div className="mt-0.5 shrink-0 text-indigo-600">
                        {isChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-slate-400" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate">{vendor.name}</div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {vendor.defaultCategory || "General Supplier"}
                          {vendor.taxId ? ` • TIN: ${vendor.taxId}` : ""}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Line Items</span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-extrabold text-slate-700">
                    {lines.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Line Item
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">#</th>
                      <th className="px-3 py-2 min-w-[220px]">
                        Description <span className="text-rose-500">*</span>
                      </th>
                      <th className="px-3 py-2 w-24">
                        Quantity <span className="text-rose-500">*</span>
                      </th>
                      <th className="px-3 py-2 w-20">Unit</th>
                      <th className="px-3 py-2 w-44">Cost Code</th>
                      <th className="px-3 py-2 w-32">Req. Delivery</th>
                      <th className="px-3 py-2 min-w-[140px]">Notes</th>
                      <th className="px-3 py-2 text-center w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((line, idx) => (
                      <tr key={line.id || idx} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            required
                            value={line.description}
                            onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                            placeholder="e.g. 150mm Carbon Steel Pipe"
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            required
                            value={line.quantity}
                            onChange={(e) => handleLineChange(idx, "quantity", e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono text-slate-900 focus:border-indigo-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={line.unit}
                            onChange={(e) => handleLineChange(idx, "unit", e.target.value)}
                            placeholder="pcs"
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={line.projectCostCodeId}
                            onChange={(e) => handleLineChange(idx, "projectCostCodeId", e.target.value)}
                            className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="">(None)</option>
                            {availableCostCodes.map((cc) => (
                              <option key={cc.id} value={cc.id}>
                                {cc.code} — {cc.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={line.requestedDeliveryDate}
                            onChange={(e) => handleLineChange(idx, "requestedDeliveryDate", e.target.value)}
                            className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={line.notes}
                            onChange={(e) => handleLineChange(idx, "notes", e.target.value)}
                            placeholder="Specification details..."
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            title="Remove line item"
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Commercial Notes & Terms</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment terms requirements, warranties, inspection requirements, and delivery guidelines..."
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-6 py-4">
            <div className="text-xs text-slate-500">
              {lines.length} line item{lines.length === 1 ? "" : "s"} • {invitedVendorIds.length} vendor{invitedVendorIds.length === 1 ? "" : "s"} invited
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
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {isSubmitting ? "Saving..." : isEditing ? "Update RFQ" : "Create RFQ"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
