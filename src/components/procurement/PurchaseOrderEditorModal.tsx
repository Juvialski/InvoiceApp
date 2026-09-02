import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle, FileText, Plus, Trash2, X, Send, Ban, CheckCheck } from "lucide-react";
import type { Project, ProjectCostCode, PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus, Vendor } from "../../types.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";
import { formatMoney } from "../../utils/invoiceLogic.ts";
import { isCommittedPurchaseOrder } from "../../utils/projectCosting.ts";

export interface PurchaseOrderEditorModalProps {
  open: boolean;
  purchaseOrder?: PurchaseOrder | null;
  projects: readonly Project[];
  vendors: readonly Vendor[];
  costCodes: readonly ProjectCostCode[];
  defaultProjectId?: string;
  canApprove?: boolean;
  canManage?: boolean;
  loading?: boolean;
  onSave: (
    po: Partial<PurchaseOrder> & { poNumber: string; vendorId: string; projectId: string },
    lines: Array<Partial<PurchaseOrderLine> & { description: string; quantity: number; unitPrice: number }>,
  ) => Promise<void> | void;
  onTransition: (poId: string, targetStatus: PurchaseOrderStatus, reason?: string) => Promise<void> | void;
  onDelete: (poId: string) => Promise<void> | void;
  onClose: () => void;
  onAddVendor?: (vendor: Partial<Vendor> & { name: string }) => Promise<Vendor>;
}

interface EditableLine {
  id?: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  projectCostCodeId: string;
}

function emptyLine(): EditableLine {
  return {
    description: "",
    quantity: "1",
    unit: "pcs",
    unitPrice: "0",
    projectCostCodeId: "",
  };
}

export const PurchaseOrderEditorModal: React.FC<PurchaseOrderEditorModalProps> = ({
  open,
  purchaseOrder,
  projects,
  vendors,
  costCodes,
  defaultProjectId,
  canApprove = true,
  canManage = true,
  loading = false,
  onSave,
  onTransition,
  onDelete,
  onClose,
  onAddVendor,
}) => {
  const isEditing = Boolean(purchaseOrder?.id);
  const status: PurchaseOrderStatus = purchaseOrder?.status || "DRAFT";
  const isDraft = status === "DRAFT";
  const isApproved = status === "APPROVED";
  const isIssued = status === "ISSUED";
  const isClosed = status === "CLOSED";
  const isCancelled = status === "CANCELLED";

  const isReadOnly = !isDraft || !canManage;

  const [poNumber, setPoNumber] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [currency, setCurrency] = useState("PHP");
  const [issueDate, setIssueDate] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditableLine[]>([emptyLine()]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [showAddVendor, setShowAddVendor] = useState(false);

  const poNumberInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus({
    open,
    onClose: () => {
      if (!isSubmitting && !loading) onClose();
    },
    initialFocusRef: poNumberInputRef,
  });

  useEffect(() => {
    if (open) {
      if (purchaseOrder) {
        setPoNumber(purchaseOrder.poNumber || "");
        setVendorId(purchaseOrder.vendorId || "");
        setProjectId(purchaseOrder.projectId || defaultProjectId || "");
        setCurrency(purchaseOrder.currency || "PHP");
        setIssueDate(purchaseOrder.issueDate || "");
        setDescription(purchaseOrder.description || "");
        setNotes(purchaseOrder.notes || "");
        setLines(
          purchaseOrder.lines && purchaseOrder.lines.length > 0
            ? purchaseOrder.lines.map((l) => ({
                id: l.id,
                description: l.description,
                quantity: String(l.quantity),
                unit: l.unit || "pcs",
                unitPrice: String(l.unitPrice),
                projectCostCodeId: l.projectCostCodeId || "",
              }))
            : [emptyLine()],
        );
      } else {
        const year = new Date().getFullYear().toString().slice(-2);
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        setPoNumber(`PO-${year}-${randomNum}`);
        setVendorId(vendors[0]?.id || "");
        setProjectId(defaultProjectId || projects[0]?.id || "");
        setCurrency("PHP");
        setIssueDate(new Date().toISOString().split("T")[0]);
        setDescription("");
        setNotes("");
        setLines([emptyLine()]);
      }
      setErrorMessage(null);
      setShowCancelPrompt(false);
      setShowDeleteConfirm(false);
      setShowAddVendor(false);
    }
  }, [open, purchaseOrder, defaultProjectId, projects, vendors]);

  const availableCostCodes = useMemo(() => {
    return costCodes.filter((cc) => cc.projectId === projectId && cc.status === "ACTIVE");
  }, [costCodes, projectId]);

  const calculatedTotal = useMemo(() => {
    return lines.reduce((sum, line) => {
      const q = Math.max(0, Number(line.quantity) || 0);
      const p = Math.max(0, Number(line.unitPrice) || 0);
      return sum + Math.round(q * p * 100) / 100;
    }, 0);
  }, [lines]);

  if (!open) return null;

  const handleLineChange = (index: number, field: keyof EditableLine, value: string) => {
    if (isReadOnly) return;
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddLine = () => {
    if (isReadOnly) return;
    setLines((prev) => [...prev, emptyLine()]);
  };

  const handleRemoveLine = (index: number) => {
    if (isReadOnly) return;
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateVendor = async () => {
    if (!newVendorName.trim() || !onAddVendor) return;
    try {
      const saved = await onAddVendor({ name: newVendorName.trim(), defaultCurrency: currency });
      setVendorId(saved.id);
      setNewVendorName("");
      setShowAddVendor(false);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to create vendor");
    }
  };

  const handleSaveDraft = async () => {
    if (!poNumber.trim()) {
      setErrorMessage("Purchase Order Number is required.");
      return;
    }
    if (!vendorId) {
      setErrorMessage("Please select a vendor / supplier.");
      return;
    }
    if (!projectId) {
      setErrorMessage("Please select an associated project.");
      return;
    }

    const invalidLine = lines.find((l) => !l.description.trim() || Number(l.quantity) <= 0 || Number(l.unitPrice) < 0);
    if (invalidLine) {
      setErrorMessage("Each line item must have a description, positive quantity, and valid unit price.");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await onSave(
        {
          ...(purchaseOrder?.id ? { id: purchaseOrder.id } : {}),
          poNumber: poNumber.trim().toUpperCase(),
          vendorId,
          projectId,
          currency: currency.trim().toUpperCase(),
          issueDate: issueDate || null,
          description: description.trim() || null,
          notes: notes.trim() || null,
        },
        lines.map((l) => ({
          ...(l.id ? { id: l.id } : {}),
          description: l.description.trim(),
          quantity: Math.max(0.0001, Number(l.quantity) || 1),
          unit: l.unit.trim() || "pcs",
          unitPrice: Math.max(0, Number(l.unitPrice) || 0),
          projectCostCodeId: l.projectCostCodeId || null,
        })),
      );
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save purchase order");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!purchaseOrder?.id) {
      // If new, save first then approve
      await handleSaveDraft();
      return;
    }
    try {
      setIsSubmitting(true);
      await onTransition(purchaseOrder.id, "APPROVED");
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to approve purchase order");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIssue = async () => {
    if (!purchaseOrder?.id) return;
    try {
      setIsSubmitting(true);
      await onTransition(purchaseOrder.id, "ISSUED");
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to issue purchase order");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClosePO = async () => {
    if (!purchaseOrder?.id) return;
    try {
      setIsSubmitting(true);
      await onTransition(purchaseOrder.id, "CLOSED");
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to close purchase order");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelPO = async () => {
    if (!purchaseOrder?.id) return;
    if (!cancelReason.trim()) {
      setErrorMessage("Cancellation reason is required to cancel an active purchase order.");
      return;
    }
    try {
      setIsSubmitting(true);
      await onTransition(purchaseOrder.id, "CANCELLED", cancelReason.trim());
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to cancel purchase order");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!purchaseOrder?.id) return;
    try {
      setIsSubmitting(true);
      await onDelete(purchaseOrder.id);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to delete draft purchase order");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="po-modal-title"
    >
      <div
        ref={dialogRef as unknown as React.RefCallback<HTMLDivElement>}
        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="po-modal-title" className="text-base font-bold text-slate-900">
                  {isEditing ? `Purchase Order ${poNumber}` : "New Purchase Order"}
                </h2>
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                    status === "APPROVED"
                      ? "bg-blue-100 text-blue-800"
                      : status === "ISSUED"
                      ? "bg-purple-100 text-purple-800"
                      : status === "CLOSED"
                      ? "bg-emerald-100 text-emerald-800"
                      : status === "CANCELLED"
                      ? "bg-rose-100 text-rose-800"
                      : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {status}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {isCommittedPurchaseOrder(status)
                  ? "Active procurement commitment contributing to project controls."
                  : status === "DRAFT"
                  ? "Draft obligation — not yet committed to project cost tracking."
                  : "Historical record."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || loading}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Cancellation Reason Alert if Cancelled */}
          {status === "CANCELLED" && purchaseOrder?.cancellationReason && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-900">
              <div className="font-semibold text-rose-800 mb-1">Cancellation Reason:</div>
              <div>{purchaseOrder.cancellationReason}</div>
            </div>
          )}

          {/* Form Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                PO Number <span className="text-rose-500">*</span>
              </label>
              <input
                ref={poNumberInputRef}
                type="text"
                disabled={isReadOnly}
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value.toUpperCase())}
                placeholder="e.g. PO-26-0001"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono text-slate-900 uppercase focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Supplier / Vendor <span className="text-rose-500">*</span>
                </label>
                {!isReadOnly && onAddVendor && !showAddVendor && (
                  <button
                    type="button"
                    onClick={() => setShowAddVendor(true)}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    + New
                  </button>
                )}
              </div>
              {showAddVendor ? (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newVendorName}
                    onChange={(e) => setNewVendorName(e.target.value)}
                    placeholder="Vendor Name"
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  />
                  <button type="button" onClick={handleCreateVendor} disabled={!newVendorName.trim()} className="px-3 py-1 text-xs font-semibold rounded bg-indigo-600 text-white hover:bg-indigo-700">Add</button>
                  <button type="button" onClick={() => setShowAddVendor(false)} className="px-3 py-1 text-xs font-semibold rounded text-slate-600 border border-slate-200 hover:bg-slate-50">Cancel</button>
                </div>
              ) : (
                <select
                  disabled={isReadOnly}
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="">Select a vendor...</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} {v.taxId ? `(TIN: ${v.taxId})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Associated Project <span className="text-rose-500">*</span>
              </label>
              <select
                disabled={isReadOnly}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="">Select a project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode} — {p.projectName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Issue Date</label>
              <input
                type="date"
                disabled={isReadOnly}
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Currency</label>
              <select
                disabled={isReadOnly}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="PHP">PHP — Philippine Peso</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="JPY">JPY — Japanese Yen</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Title</label>
              <input
                type="text"
                disabled={isReadOnly}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Steel beams for Phase 2"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>
          </div>

          {/* Line Items Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Line Items ({lines.length})
              </h3>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Line Item
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 w-8">#</th>
                    <th className="px-3 py-2.5 min-w-[200px]">Description</th>
                    <th className="px-3 py-2.5 w-24">Qty</th>
                    <th className="px-3 py-2.5 w-20">Unit</th>
                    <th className="px-3 py-2.5 w-32">Unit Price</th>
                    <th className="px-3 py-2.5 min-w-[180px]">Cost Code</th>
                    <th className="px-3 py-2.5 w-32 text-right">Amount</th>
                    {!isReadOnly && <th className="px-3 py-2.5 w-10 text-center"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, idx) => {
                    const lineAmount = Math.max(0, (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0));
                    return (
                      <tr key={line.id || idx} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={line.description}
                            onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                            placeholder="Item description"
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs disabled:bg-transparent disabled:border-transparent"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            disabled={isReadOnly}
                            value={line.quantity}
                            onChange={(e) => handleLineChange(idx, "quantity", e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono text-right disabled:bg-transparent disabled:border-transparent"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={line.unit}
                            onChange={(e) => handleLineChange(idx, "unit", e.target.value)}
                            placeholder="pcs"
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs disabled:bg-transparent disabled:border-transparent"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={isReadOnly}
                            value={line.unitPrice}
                            onChange={(e) => handleLineChange(idx, "unitPrice", e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono text-right disabled:bg-transparent disabled:border-transparent"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            disabled={isReadOnly}
                            value={line.projectCostCodeId}
                            onChange={(e) => handleLineChange(idx, "projectCostCodeId", e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] disabled:bg-transparent disabled:border-transparent"
                          >
                            <option value="">Uncoded / None</option>
                            {availableCostCodes.map((cc) => (
                              <option key={cc.id} value={cc.id}>
                                {cc.code} — {cc.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">
                          {formatMoney(lineAmount, currency)}
                        </td>
                        {!isReadOnly && (
                          <td className="px-3 py-2 text-center">
                            {lines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(idx)}
                                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-right text-xs">
                      Total PO Amount:
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-sm font-bold text-indigo-700">
                      {formatMoney(calculatedTotal, currency)}
                    </td>
                    {!isReadOnly && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes & Commercial Terms */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Notes & Commercial Terms
            </label>
            <textarea
              rows={3}
              disabled={isReadOnly}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery terms, warranty requirements, milestone payment schedules..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          {/* Cancel Reason Modal Area */}
          {showCancelPrompt && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-3">
              <div className="text-xs font-bold text-rose-900">Cancel Purchase Order</div>
              <p className="text-xs text-rose-700">
                Cancelling this purchase order will release its commitment from project controls. Please state the reason for audit compliance.
              </p>
              <textarea
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation (e.g., superseding PO issued, supplier default, scope removed)"
                className="w-full rounded-lg border border-rose-300 bg-white p-2.5 text-xs text-slate-900"
              />
              <div className="flex gap-2">
                <button type="button" onClick={handleCancelPO} disabled={!cancelReason.trim() || isSubmitting} className="px-3 py-1.5 text-xs font-semibold rounded bg-rose-600 text-white hover:bg-rose-700">Confirm Cancellation</button>
                <button type="button" onClick={() => setShowCancelPrompt(false)} className="px-3 py-1.5 text-xs font-semibold rounded text-slate-600 border border-slate-200 hover:bg-rose-50">Dismiss</button>
              </div>
            </div>
          )}

          {/* Delete Confirm Area */}
          {showDeleteConfirm && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-2">
              <div className="text-xs font-bold text-rose-900">Delete Draft Purchase Order?</div>
              <p className="text-xs text-rose-700">
                This draft purchase order has never been approved or committed. Deleting it is permanent.
              </p>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={handleDeleteDraft} disabled={isSubmitting} className="px-3 py-1.5 text-xs font-semibold rounded bg-rose-600 text-white hover:bg-rose-700">Confirm Delete</button>
                <button type="button" onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-xs font-semibold rounded text-slate-600 border border-slate-200 hover:bg-slate-50">Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-2">
            {isDraft && isEditing && canManage && !showDeleteConfirm && (
              <button type="button" onClick={() => setShowDeleteConfirm(true)} disabled={isSubmitting || loading} className="flex items-center px-3 py-1.5 text-xs font-semibold rounded text-rose-700 border border-rose-200 hover:bg-rose-50">
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete Draft
              </button>
            )}

            {(isApproved || isIssued) && canManage && !showCancelPrompt && (
              <button type="button" onClick={() => setShowCancelPrompt(true)} disabled={isSubmitting || loading} className="flex items-center px-3 py-1.5 text-xs font-semibold rounded text-rose-700 border border-rose-200 hover:bg-rose-50">
                <Ban className="h-3.5 w-3.5 mr-1" />
                Cancel PO
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={isSubmitting || loading} className="px-3 py-1.5 text-xs font-semibold rounded border border-slate-300 text-slate-700 hover:bg-slate-100">
              Close
            </button>

            {isDraft && canManage && (
              <button type="button" onClick={handleSaveDraft} disabled={isSubmitting || loading} className="px-3 py-1.5 text-xs font-semibold rounded border border-slate-300 text-slate-700 hover:bg-slate-100">
                Save Draft
              </button>
            )}

            {isDraft && canApprove && (
              <button type="button" onClick={handleApprove} disabled={isSubmitting || loading} className="flex items-center px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-700 text-white">
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                Approve PO
              </button>
            )}

            {isApproved && canApprove && (
              <button type="button" onClick={handleIssue} disabled={isSubmitting || loading} className="flex items-center px-3 py-1.5 text-xs font-semibold rounded bg-purple-600 hover:bg-purple-700 text-white">
                <Send className="h-3.5 w-3.5 mr-1" />
                Issue to Supplier
              </button>
            )}

            {isIssued && canManage && (
              <button type="button" onClick={handleClosePO} disabled={isSubmitting || loading} className="flex items-center px-3 py-1.5 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white">
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Mark Complete / Close
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
