import React, { useEffect, useId, useMemo, useState } from "react";
import { AlertCircle, CheckCircle, FileText, Trash2, X, Send, Ban, CheckCheck, Truck, PackageCheck, AlertTriangle, ExternalLink } from "lucide-react";
import type { InvoiceData, Project, ProjectCostCode, PurchaseOrder, PurchaseOrderInvoiceMatch, PurchaseOrderLine, PurchaseOrderReceipt, PurchaseOrderStatus, Vendor } from "../../types.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";
import { formatDate, formatMoney } from "../../utils/invoiceLogic.ts";
import { isCommittedPurchaseOrder } from "../../utils/projectCosting.ts";
import { calculatePOReceiptProgress, getReceiptsForPO, hasOutstandingReceiptQuantity } from "../../utils/purchaseOrderReceipts.ts";
import { RecordReceiptModal } from "./RecordReceiptModal.tsx";
import { WorksheetEditor, type WorksheetColumn } from "../ui/WorksheetEditor.tsx";

export interface PurchaseOrderEditorModalProps {
  open: boolean;
  purchaseOrder?: PurchaseOrder | null;
  receipts?: readonly PurchaseOrderReceipt[];
  projects: readonly Project[];
  vendors: readonly Vendor[];
  costCodes: readonly ProjectCostCode[];
  defaultProjectId?: string;
  initialReceiptId?: string;
  canApprove?: boolean;
  canManage?: boolean;
  loading?: boolean;
  matches?: readonly PurchaseOrderInvoiceMatch[];
  invoices?: readonly InvoiceData[];
  onSave: (
    po: Partial<PurchaseOrder> & { poNumber: string; vendorId: string; projectId: string },
    lines: Array<Partial<PurchaseOrderLine> & { description: string; quantity: number; unitPrice: number }>,
    expectedUpdatedAt?: string,
  ) => Promise<void> | void;
  onTransition: (poId: string, targetStatus: PurchaseOrderStatus, reason?: string) => Promise<void> | void;
  onDelete: (poId: string) => Promise<void> | void;
  onRecordReceipt?: (
    receipt: Partial<PurchaseOrderReceipt> & { purchaseOrderId: string; receiptNumber: string },
    lines: Array<{ purchaseOrderLineId: string; receivedQuantity: number; notes?: string }>,
  ) => Promise<PurchaseOrderReceipt | void> | PurchaseOrderReceipt | void;
  onVoidReceipt?: (receiptId: string, reason: string) => Promise<void> | void;
  onClose: () => void;
  onAddVendor?: (vendor: Partial<Vendor> & { name: string }) => Promise<Vendor>;
  onOpenInvoice?: (invoiceId: string) => void;
}

interface EditableLine {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  projectCostCodeId: string;
}

interface EditablePOHeader {
  id: string;
  poNumber: string;
  vendorId: string;
  projectId: string;
  issueDate: string;
  currency: string;
  description: string;
  notes: string;
  status: PurchaseOrderStatus;
  calculatedTotal: number;
}

let poLineSequence = 0;

function nextPOLineId() {
  poLineSequence += 1;
  return `draft-po-line-${Date.now()}-${poLineSequence}`;
}

export function persistedPurchaseOrderLineId(id: string): string | undefined {
  return id.startsWith("draft-po-line-") ? undefined : id;
}

function emptyLine(): EditableLine {
  return {
    id: nextPOLineId(),
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
  initialReceiptId,
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

  useEffect(() => {
    if (!open || !initialReceiptId) return;
    const target = [...document.querySelectorAll<HTMLElement>("[data-receipt-id]")]
      .find((element) => element.dataset.receiptId === initialReceiptId);
    target?.scrollIntoView({ block: "center" });
  }, [initialReceiptId, open, poReceipts.length]);

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

  const dialogRef = useDialogFocus({
    open,
    onClose: () => {
      if (!isSubmitting && !loading && !showRecordReceiptModal) onClose();
    },
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
                id: l.id || nextPOLineId(),
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

  const handleSaveDraft = async (
    nextHeader: EditablePOHeader = {
      id: purchaseOrder?.id || "new-purchase-order",
      poNumber,
      vendorId,
      projectId,
      issueDate,
      currency,
      description,
      notes,
      status,
      calculatedTotal,
    },
    nextLines: readonly EditableLine[] = lines,
  ) => {
    if (!nextHeader.poNumber.trim()) {
      setErrorMessage("Purchase Order Number is required.");
      return;
    }
    if (!nextHeader.vendorId) {
      setErrorMessage("Please select a vendor / supplier.");
      return;
    }
    if (!nextHeader.projectId || !projects.some((project) => project.id === nextHeader.projectId)) {
      setErrorMessage("Please select an associated project.");
      return;
    }

    const validCostCodeIds = new Set(costCodes.filter((costCode) => costCode.projectId === nextHeader.projectId && costCode.status === "ACTIVE").map((costCode) => costCode.id));
    const invalidLine = nextLines.find((l) => !l.description.trim() || Number(l.quantity) <= 0 || Number(l.unitPrice) < 0 || Boolean(l.projectCostCodeId && !validCostCodeIds.has(l.projectCostCodeId)));
    if (invalidLine) {
      setErrorMessage("Each line item must have a description, positive quantity, valid unit price, and a cost code from the selected project.");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await onSave(
        {
          ...(purchaseOrder?.id ? { id: purchaseOrder.id } : {}),
          poNumber: nextHeader.poNumber.trim().toUpperCase(),
          vendorId: nextHeader.vendorId,
          projectId: nextHeader.projectId,
          currency: nextHeader.currency.trim().toUpperCase(),
          issueDate: nextHeader.issueDate || null,
          description: nextHeader.description.trim() || null,
          notes: nextHeader.notes.trim() || null,
        },
        nextLines.map((l) => {
          const persistedId = persistedPurchaseOrderLineId(l.id);
          return {
          ...(persistedId ? { id: persistedId } : {}),
          description: l.description.trim(),
          quantity: Math.max(0.0001, Number(l.quantity) || 1),
          unit: l.unit.trim() || "pcs",
          unitPrice: Math.max(0, Number(l.unitPrice) || 0),
          projectCostCodeId: l.projectCostCodeId || null,
          };
        }),
        purchaseOrder?.updatedAt,
      );
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save purchase order");
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerRows = useMemo<readonly EditablePOHeader[]>(() => [{
    id: purchaseOrder?.id || "new-purchase-order",
    poNumber,
    vendorId,
    projectId,
    issueDate,
    currency,
    description,
    notes,
    status,
    calculatedTotal,
  }], [calculatedTotal, currency, description, issueDate, notes, poNumber, projectId, purchaseOrder?.id, status, vendorId]);

  const headerColumns = useMemo<readonly WorksheetColumn<EditablePOHeader>[]>(() => [
    {
      key: "poNumber",
      header: "PO Number",
      frozen: true,
      minWidth: "12rem",
      value: (row) => row.poNumber,
      setValue: (row, value) => ({ ...row, poNumber: String(value ?? "").toUpperCase() }),
      editable: !isReadOnly,
      protected: isReadOnly,
      validate: (value) => String(value ?? "").trim() ? undefined : "Purchase Order Number is required.",
    },
    {
      key: "vendorId",
      header: "Supplier / Vendor",
      kind: "select",
      minWidth: "18rem",
      options: vendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
      value: (row) => row.vendorId,
      setValue: (row, value) => ({ ...row, vendorId: String(value ?? "") }),
      editable: !isReadOnly,
      protected: isReadOnly,
      validate: (value) => String(value ?? "").trim() ? undefined : "Choose a supplier before saving.",
    },
    {
      key: "projectId",
      header: "Associated Project",
      kind: "select",
      minWidth: "19rem",
      options: projects.map((project) => ({ value: project.id, label: `${project.projectCode} — ${project.projectName}` })),
      value: (row) => row.projectId,
      setValue: (row, value) => ({ ...row, projectId: String(value ?? "") }),
      editable: !isReadOnly,
      protected: isReadOnly,
      validate: (value) => projects.some((project) => project.id === value) ? undefined : "Choose a project before saving.",
    },
    {
      key: "issueDate",
      header: "Issue Date",
      kind: "date",
      minWidth: "11rem",
      value: (row) => row.issueDate,
      setValue: (row, value) => ({ ...row, issueDate: String(value ?? "") }),
      editable: !isReadOnly,
      protected: isReadOnly,
    },
    {
      key: "currency",
      header: "Currency",
      kind: "select",
      minWidth: "9rem",
      options: ["PHP", "USD", "EUR", "JPY"].map((value) => ({ value, label: value })),
      value: (row) => row.currency,
      setValue: (row, value) => ({ ...row, currency: String(value ?? "").toUpperCase() }),
      editable: !isReadOnly,
      protected: isReadOnly,
    },
    {
      key: "description",
      header: "Description / Title",
      minWidth: "22rem",
      value: (row) => row.description,
      setValue: (row, value) => ({ ...row, description: String(value ?? "") }),
      editable: !isReadOnly,
      protected: isReadOnly,
    },
    {
      key: "notes",
      header: "Notes / Commercial Terms",
      minWidth: "24rem",
      value: (row) => row.notes,
      setValue: (row, value) => ({ ...row, notes: String(value ?? "") }),
      editable: !isReadOnly,
      protected: isReadOnly,
    },
    {
      key: "calculatedTotal",
      header: "Calculated Total",
      kind: "currency",
      align: "right",
      minWidth: "14rem",
      currency: (row) => row.currency,
      value: (row) => row.calculatedTotal,
      protected: true,
      editable: false,
    },
    {
      key: "status",
      header: "Lifecycle Status",
      minWidth: "11rem",
      value: (row) => row.status,
      protected: true,
      editable: false,
    },
  ], [isReadOnly, projects, vendors]);

  const lineColumns = useMemo<readonly WorksheetColumn<EditableLine>[]>(() => [
    {
      key: "description",
      header: "Item / Description",
      frozen: true,
      minWidth: "22rem",
      value: (row) => row.description,
      setValue: (row, value) => ({ ...row, description: String(value ?? "") }),
      editable: !isReadOnly,
      protected: isReadOnly,
      validate: (value) => String(value ?? "").trim() ? undefined : "Description is required.",
    },
    {
      key: "quantity",
      header: "Quantity",
      kind: "number",
      align: "right",
      minWidth: "9rem",
      value: (row) => row.quantity,
      setValue: (row, value) => ({ ...row, quantity: value === null ? "" : String(value) }),
      editable: !isReadOnly,
      protected: isReadOnly,
      validate: (value) => Number(value) > 0 ? undefined : "Quantity must be positive.",
    },
    {
      key: "unit",
      header: "Unit",
      minWidth: "8rem",
      value: (row) => row.unit,
      setValue: (row, value) => ({ ...row, unit: String(value ?? "") }),
      editable: !isReadOnly,
      protected: isReadOnly,
    },
    {
      key: "unitPrice",
      header: "Unit Price",
      kind: "currency",
      align: "right",
      minWidth: "12rem",
      currency: () => currency,
      value: (row) => row.unitPrice,
      setValue: (row, value) => ({ ...row, unitPrice: value === null ? "" : String(value) }),
      editable: !isReadOnly,
      protected: isReadOnly,
      validate: (value) => Number(value) >= 0 ? undefined : "Unit price cannot be negative.",
    },
    {
      key: "projectCostCodeId",
      header: "Cost Code",
      kind: "select",
      minWidth: "18rem",
      options: () => availableCostCodes.map((costCode) => ({ value: costCode.id, label: `${costCode.code} — ${costCode.name}` })),
      value: (row) => row.projectCostCodeId,
      setValue: (row, value) => ({ ...row, projectCostCodeId: String(value ?? "") }),
      editable: !isReadOnly,
      protected: isReadOnly,
      validate: (value) => !value || availableCostCodes.some((costCode) => costCode.id === value) ? undefined : "Choose an active cost code from the selected project.",
    },
    {
      key: "amount",
      header: "Amount",
      kind: "currency",
      align: "right",
      minWidth: "13rem",
      currency: () => currency,
      value: (row) => Math.round(Math.max(0, Number(row.quantity) || 0) * Math.max(0, Number(row.unitPrice) || 0) * 100) / 100,
      protected: true,
      editable: false,
    },
    {
      key: "receivedQuantity",
      header: "Received",
      kind: "number",
      align: "right",
      minWidth: "10rem",
      value: (row) => poReceiptProgress?.lines[row.id]?.receivedQuantity ?? 0,
      format: (value, row) => `${String(value ?? 0)} ${row.unit}`,
      protected: true,
      editable: false,
    },
  ], [availableCostCodes, currency, isReadOnly, poReceiptProgress]);

  const handleHeaderRowsChange = (rows: readonly EditablePOHeader[]) => {
    const row = rows[0];
    if (!row) return;
    setPoNumber(row.poNumber);
    setVendorId(row.vendorId);
    setProjectId(row.projectId);
    setIssueDate(row.issueDate);
    setCurrency(row.currency);
    setDescription(row.description);
    setNotes(row.notes);
  };

  const handleLinesChange = (nextLines: readonly EditableLine[]) => setLines([...nextLines]);

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
    const saved = await onRecordReceipt(receiptInput, lineInputs);
    setShowRecordReceiptModal(false);
    return saved;
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-900/60 p-2 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="po-modal-title"
    >
      <div
        ref={dialogRef as unknown as React.RefCallback<HTMLDivElement>}
        className="relative flex min-h-0 max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
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
        <div data-dialog-scroll-container="purchase-order-editor" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 space-y-6">
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

          <section data-testid="purchase-order-draft-worksheet" aria-label="Purchase order draft worksheet" className="min-w-0 space-y-4">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5 text-[10px] leading-4 text-indigo-950">
              <p className="font-black uppercase tracking-[0.12em]">Purchase Order draft worksheet</p>
              <p className="mt-1">Edit safe draft header and line fields here. Calculated amounts, received quantities, approval, issue, receiving, close, cancellation, matching, and settlement remain protected or purpose-built workflows.</p>
            </div>

            <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
              <span className="font-semibold text-slate-700">Supplier selection is a controlled reference; adding a vendor remains a separate master-data action.</span>
              {!isReadOnly && onAddVendor && !showAddVendor && <button type="button" onClick={() => setShowAddVendor(true)} className="shrink-0 text-[11px] font-black text-indigo-700 hover:text-indigo-900">+ New vendor</button>}
            </div>

            {showAddVendor && (
              <div className="flex flex-wrap gap-1.5 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                <input type="text" value={newVendorName} onChange={(event) => setNewVendorName(event.target.value)} placeholder="Vendor Name" className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs" />
                <button type="button" onClick={handleCreateVendor} disabled={!newVendorName.trim()} className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">Add</button>
                <button type="button" onClick={() => setShowAddVendor(false)} className="rounded border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-white">Cancel</button>
              </div>
            )}

            <WorksheetEditor
              ariaLabel="Purchase order header worksheet"
              rows={headerRows}
              columns={headerColumns}
              rowKey={(row) => row.id}
              onRowsChange={handleHeaderRowsChange}
              onSave={!isReadOnly ? (rows) => handleSaveDraft(rows[0] || headerRows[0]) : undefined}
              onCancel={onClose}
              disabled={isReadOnly || isSubmitting}
              isSaving={isSubmitting}
              saveLabel="Save PO draft"
              cancelLabel="Close editor"
              density="comfortable"
            />

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">PO Line Items</span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-extrabold text-slate-700">{lines.length}</span>
            </div>

            <WorksheetEditor
              ariaLabel="Purchase order draft lines worksheet"
              rows={lines}
              columns={lineColumns}
              rowKey={(row) => row.id}
              onRowsChange={handleLinesChange}
              onAddRow={isReadOnly ? undefined : () => emptyLine()}
              canAddRow={!isReadOnly}
              onRemoveRow={isReadOnly ? undefined : () => undefined}
              canRemoveRow={isReadOnly ? false : (_row, index) => lines.length > 1 && index >= 0}
              onSave={!isReadOnly ? (rows) => handleSaveDraft(headerRows[0], rows) : undefined}
              onCancel={onClose}
              disabled={isReadOnly || isSubmitting}
              isSaving={isSubmitting}
              saveLabel="Save PO draft"
              cancelLabel="Close editor"
              emptyState="No purchase-order lines yet. Add a row for each ordered item."
              density="compact"
            />

            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold leading-4 text-amber-900">Amount and Received columns are calculated/protected. Editing this worksheet never approves, issues, receives, closes, cancels, matches, or settles a purchase order.</p>
          </section>

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
                  {isIssued && canManage && hasOutstandingReceiptQuantity(poReceiptProgress) && (
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
                          data-receipt-id={receipt.id}
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
              <button type="button" onClick={() => void handleSaveDraft()} disabled={isSubmitting || loading} className="px-3 py-1.5 text-xs font-semibold rounded border border-slate-300 text-slate-700 hover:bg-slate-100">
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

