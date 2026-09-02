import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle, FileText, Plus, Trash2, X, Send, Ban, CheckCheck, Truck, PackageCheck, AlertTriangle, ExternalLink } from "lucide-react";
import type { InvoiceData, Project, ProjectCostCode, PurchaseOrder, PurchaseOrderInvoiceMatch, PurchaseOrderLine, PurchaseOrderReceipt, PurchaseOrderStatus, Vendor } from "../../types.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";
import { formatDate, formatMoney } from "../../utils/invoiceLogic.ts";
import { isCommittedPurchaseOrder } from "../../utils/projectCosting.ts";
import { calculatePOReceiptProgress, getReceiptsForPO } from "../../utils/purchaseOrderReceipts.ts";
import { RecordReceiptModal } from "./RecordReceiptModal.tsx";

export interface PurchaseOrderEditorModalProps {
  open: boolean;
  purchaseOrder?: PurchaseOrder | null;
  receipts?: readonly PurchaseOrderReceipt[];
  projects: readonly Project[];
  vendors: readonly Vendor[];
  costCodes: readonly ProjectCostCode[];
  defaultProjectId?: string;
  canApprove?: boolean;
  canManage?: boolean;
  loading?: boolean;
  matches?: readonly PurchaseOrderInvoiceMatch[];
  invoices?: readonly InvoiceData[];
  onSave: (
    po: Partial<PurchaseOrder> & { poNumber: string; vendorId: string; projectId: string },
    lines: Array<Partial<PurchaseOrderLine> & { description: string; quantity: number; unitPrice: number }>,
  ) => Promise<void> | void;
  onTransition: (poId: string, targetStatus: PurchaseOrderStatus, reason?: string) => Promise<void> | void;
  onDelete: (poId: string) => Promise<void> | void;
  onRecordReceipt?: (
    receipt: Partial<PurchaseOrderReceipt> & { purchaseOrderId: string; receiptNumber: string },
    lines: Array<{ purchaseOrderLineId: string; receivedQuantity: number; notes?: string }>,
  ) => Promise<void> | void;
  onVoidReceipt?: (receiptId: string, reason: string) => Promise<void> | void;
  onClose: () => void;
  onAddVendor?: (vendor: Partial<Vendor> & { name: string }) => Promise<Vendor>;
  onOpenInvoice?: (invoiceId: string) => void;
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
  receipts = [],
  projects,
  vendors,
  costCodes,
  defaultProjectId,
  canApprove = true,
  canManage = true,
  loading = false,
  matches = [],
  invoices = [],
  onSave,
  onTransition,
  onDelete,
  onRecordReceipt,
  onVoidReceipt,
  onClose,
  onAddVendor,
  onOpenInvoice,
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

  // Delivery & Receipt state
  const [showRecordReceiptModal, setShowRecordReceiptModal] = useState(false);
  const [voidReceiptTarget, setVoidReceiptTarget] = useState<PurchaseOrderReceipt | null>(null);
  const [voidReasonText, setVoidReasonText] = useState("");

  const poReceipts = useMemo(() => {
    return purchaseOrder?.id ? getReceiptsForPO(purchaseOrder.id, receipts) : [];
  }, [purchaseOrder?.id, receipts]);

  const poReceiptProgress = useMemo(() => {
    return purchaseOrder ? calculatePOReceiptProgress(purchaseOrder, receipts) : null;
  }, [purchaseOrder, receipts]);

  const linkedMatches = useMemo(() => {
    if (!purchaseOrder?.id || !matches) return [];
    return matches.filter(
      (m) => m.purchaseOrderId === purchaseOrder.id && m.status === "CONFIRMED",
    );
  }, [purchaseOrder?.id, matches]);

  const matchedInvoicesData = useMemo(() => {
    return linkedMatches.map((m) => {
      const inv = invoices.find((i) => i.id === m.invoiceId);
      const poVendor = vendors.find((v) => v.id === purchaseOrder?.vendorId);
      const invVendorId = (inv as any)?.vendorId || (inv as any)?.vendor_id;
      const invVendorName = inv?.vendor?.name || inv?.vendor?.companyName;
      const vendorConsistent = Boolean(
        inv && (
          (invVendorId && invVendorId === purchaseOrder?.vendorId) ||
          (invVendorName && poVendor?.name && invVendorName.trim().toLowerCase() === poVendor.name.trim().toLowerCase())
        ),
      );
      return {
        match: m,
        invoice: inv,
        vendorConsistent,
      };
    });
  }, [linkedMatches, invoices, vendors, purchaseOrder?.vendorId]);

  const poNumberInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus({
    open,
    onClose: () => {
      if (!isSubmitting && !loading && !showRecordReceiptModal) onClose();
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

  const handleRecordReceipt = async (
    receiptInput: Partial<PurchaseOrderReceipt> & { purchaseOrderId: string; receiptNumber: string },
    lineInputs: Array<{ purchaseOrderLineId: string; receivedQuantity: number; notes?: string }>,
  ) => {
    if (!onRecordReceipt) return;
    await onRecordReceipt(receiptInput, lineInputs);
    setShowRecordReceiptModal(false);
  };

  const handleConfirmVoidReceipt = async () => {
    if (!voidReceiptTarget || !onVoidReceipt) return;
    if (!voidReasonText.trim() || voidReasonText.trim().length < 3) {
      setErrorMessage("Void reason must contain at least 3 characters.");
      return;
    }
    try {
      setIsSubmitting(true);
      await onVoidReceipt(voidReceiptTarget.id, voidReasonText.trim());
      setVoidReceiptTarget(null);
      setVoidReasonText("");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to void receipt");
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

          {/* Delivery & Goods Receipts Section for Non-Draft POs */}
          {isEditing && !isDraft && (
            <div className="space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/20 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-indigo-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Delivery & Goods Receipts Tracking
                    </h3>
                    <div className="text-[11px] text-slate-500">
                      Track physical items received against this purchase order
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isIssued && canManage && (poReceiptProgress?.totalRemainingQuantity || 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowRecordReceiptModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
                    >
                      <PackageCheck className="h-4 w-4" />
                      Record Delivery / Receipt
                    </button>
                  )}
                  {poReceiptProgress?.deliveryStatus === "FULLY_RECEIVED" && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                      <CheckCircle className="h-3.5 w-3.5" /> Fully Received
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Summary Cards */}
              {poReceiptProgress && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Ordered</div>
                    <div className="text-base font-black text-slate-900 tabular-nums">
                      {poReceiptProgress.totalOrderedQuantity}
                    </div>
                    <div className="text-[10px] text-slate-400">Total item units</div>
                  </div>

                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Total Received</div>
                    <div className="text-base font-black text-emerald-900 tabular-nums">
                      {poReceiptProgress.totalReceivedQuantity}
                    </div>
                    <div className="text-[10px] text-emerald-600">Across valid receipts</div>
                  </div>

                  <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Remaining Outstanding</div>
                    <div className="text-base font-black text-amber-900 tabular-nums">
                      {poReceiptProgress.totalRemainingQuantity}
                    </div>
                    <div className="text-[10px] text-amber-600">To be delivered</div>
                  </div>

                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Receipt Progress</div>
                    <div className="text-base font-black text-indigo-900 tabular-nums">
                      {poReceiptProgress.overallProgressPercent}%
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-indigo-200/60">
                      <div
                        className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                        style={{ width: `${poReceiptProgress.overallProgressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Line Items Delivery Breakdown */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Line Items Delivery Breakdown
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2"># Description</th>
                        <th className="px-3 py-2 text-right">Ordered</th>
                        <th className="px-3 py-2 text-right">Received</th>
                        <th className="px-3 py-2 text-right">Remaining</th>
                        <th className="px-3 py-2 min-w-[120px]">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(purchaseOrder?.lines || []).map((line, idx) => {
                        const lineProg = poReceiptProgress?.lines[line.id];
                        const ord = lineProg?.orderedQuantity ?? line.quantity;
                        const rec = lineProg?.receivedQuantity ?? 0;
                        const rem = lineProg?.remainingQuantity ?? line.quantity;
                        const pct = lineProg?.progressPercent ?? 0;
                        return (
                          <tr key={line.id} className="hover:bg-slate-50/60">
                            <td className="px-3 py-2">
                              <span className="font-mono text-slate-400 mr-1">{idx + 1}.</span>
                              <span className="font-semibold text-slate-800">{line.description}</span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-600">
                              {ord} {line.unit}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                              {rec} {line.unit}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-amber-700 font-semibold">
                              {rem} {line.unit}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      rem === 0 ? "bg-emerald-500" : "bg-indigo-600"
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="font-mono text-[10px] text-slate-500 w-8 text-right">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Delivery History */}
              <div className="space-y-2 pt-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Delivery History ({poReceipts.length} record{poReceipts.length === 1 ? "" : "s"})
                </div>

                {poReceipts.length > 0 ? (
                  <div className="space-y-2">
                    {poReceipts.map((receipt) => {
                      const isVoided = receipt.status === "VOIDED";
                      return (
                        <div
                          key={receipt.id}
                          className={`rounded-xl border p-3.5 text-xs transition ${
                            isVoided
                              ? "border-slate-200 bg-slate-50/80 opacity-75"
                              : "border-slate-200 bg-white shadow-sm"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`font-mono font-bold ${isVoided ? "line-through text-slate-500" : "text-slate-900"}`}>
                                {receipt.receiptNumber}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                  isVoided
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {receipt.status}
                              </span>
                              <span className="text-slate-500 text-[11px]">
                                Date: <strong className="text-slate-700">{formatDate(receipt.receiptDate, "short")}</strong>
                              </span>
                              {receipt.supplierDeliveryReference && (
                                <span className="text-slate-500 text-[11px]">
                                  DR Ref: <strong className="text-slate-700 font-mono">{receipt.supplierDeliveryReference}</strong>
                                </span>
                              )}
                            </div>

                            {!isVoided && canManage && onVoidReceipt && (
                              <button
                                type="button"
                                onClick={() => {
                                  setVoidReceiptTarget(receipt);
                                  setVoidReasonText("");
                                }}
                                className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline"
                              >
                                Void Receipt
                              </button>
                            )}
                          </div>

                          {/* Line items in receipt */}
                          <div className="space-y-1">
                            {(receipt.lines || []).map((rLine) => {
                              const matchingPoLine = (purchaseOrder?.lines || []).find(
                                (l) => l.id === rLine.purchaseOrderLineId,
                              );
                              return (
                                <div key={rLine.id} className="flex items-center justify-between text-slate-700">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400">•</span>
                                    <span>{matchingPoLine?.description || "PO Line Item"}</span>
                                    {rLine.notes && (
                                      <span className="text-[10px] text-slate-400">({rLine.notes})</span>
                                    )}
                                  </div>
                                  <div className="font-mono font-semibold text-slate-900 tabular-nums">
                                    +{rLine.receivedQuantity} {matchingPoLine?.unit || "units"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {receipt.notes && (
                            <div className="mt-2 text-[11px] text-slate-500 italic">
                              "{receipt.notes}"
                            </div>
                          )}

                          {isVoided && receipt.voidReason && (
                            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-100">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span>Voided: {receipt.voidReason}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                    No delivery receipts recorded yet against this purchase order.
                  </div>
                )}
              </div>

              {/* Void Prompt Dialog */}
              {voidReceiptTarget && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-3 mt-3">
                  <div className="text-xs font-bold text-rose-900">
                    Void Goods Receipt {voidReceiptTarget.receiptNumber}?
                  </div>
                  <p className="text-xs text-rose-700">
                    Voiding this receipt will deduct its received quantities from the PO delivery progress and restore remaining balance. Please provide an auditable reason.
                  </p>
                  <textarea
                    rows={2}
                    value={voidReasonText}
                    onChange={(e) => setVoidReasonText(e.target.value)}
                    placeholder="Reason for voiding (e.g. entered wrong delivery note, rejected delivery on inspection)"
                    className="w-full rounded-lg border border-rose-300 bg-white p-2.5 text-xs text-slate-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmVoidReceipt}
                      disabled={!voidReasonText.trim() || isSubmitting}
                      className="px-3 py-1.5 text-xs font-semibold rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {isSubmitting ? "Voiding..." : "Confirm Void"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoidReceiptTarget(null)}
                      className="px-3 py-1.5 text-xs font-semibold rounded text-slate-600 border border-slate-200 hover:bg-rose-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Supplier Invoices Section */}
          {isEditing && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                        Supplier Invoices
                      </h3>
                      {linkedMatches.length > 0 && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                          {linkedMatches.length} linked
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Authoritative incoming vendor invoices matched to this purchase order
                    </div>
                  </div>
                </div>
              </div>

              {matchedInvoicesData.length > 0 ? (
                <div className="space-y-2">
                  {matchedInvoicesData.map(({ match, invoice, vendorConsistent }) => (
                    <div
                      key={match.id}
                      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between transition hover:border-slate-300"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-slate-900">
                            {invoice?.invoiceNumber || `Invoice ID: ${match.invoiceId.slice(0, 8)}...`}
                          </span>

                          {invoice?.reviewStatus && (
                            <span
                              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                invoice.reviewStatus === "VERIFIED"
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  : "bg-amber-100 text-amber-800 border border-amber-200"
                              }`}
                            >
                              {invoice.reviewStatus === "VERIFIED" ? "Verified" : "Needs Review"}
                            </span>
                          )}

                          <span
                            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                              invoice?.lifecycleStatus === "VOID" || invoice?.status === "VOID"
                                ? "bg-rose-100 text-rose-800 border border-rose-200"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {invoice?.lifecycleStatus || invoice?.status || "ACTIVE"}
                          </span>

                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                              vendorConsistent
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {vendorConsistent ? (
                              <>
                                <CheckCircle className="h-3 w-3" /> Supplier Consistent
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="h-3 w-3" /> Supplier Mismatch
                              </>
                            )}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                          {invoice?.invoiceDate && (
                            <div>
                              Date: <strong className="font-medium text-slate-700">{formatDate(invoice.invoiceDate, "short")}</strong>
                            </div>
                          )}
                          <div>
                            Matched: <strong className="font-medium text-slate-700">{formatDate(match.confirmedAt, "short")}</strong>
                          </div>
                          <div>
                            Lines:{" "}
                            <span className="font-medium text-slate-700">
                              {(match.lines || []).length} line{(match.lines || []).length === 1 ? "" : "s"} matched
                            </span>
                          </div>
                          {invoice && (
                            <div>
                              Total:{" "}
                              <span className="font-mono font-bold text-slate-900">
                                {formatMoney(invoice.grandTotal, invoice.currency || purchaseOrder?.currency || "PHP")}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {onOpenInvoice && invoice?.id && (
                        <div className="flex shrink-0 items-center">
                          <button
                            type="button"
                            onClick={() => onOpenInvoice(invoice.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
                          >
                            <span>View Invoice</span>
                            <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                  No supplier invoices linked to this purchase order yet.
                </div>
              )}
            </div>
          )}

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

      {/* Record Receipt Modal Sub-dialog */}
      {showRecordReceiptModal && purchaseOrder && (
        <RecordReceiptModal
          open={showRecordReceiptModal}
          purchaseOrder={purchaseOrder}
          existingReceipts={poReceipts}
          onRecordReceipt={handleRecordReceipt}
          onClose={() => setShowRecordReceiptModal(false)}
        />
      )}
    </div>
  );
};

