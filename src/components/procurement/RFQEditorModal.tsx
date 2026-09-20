import React, { useEffect, useId, useMemo, useState } from "react";
import { AlertCircle, FileText, X, Users, CheckSquare, Square } from "lucide-react";
import type { Project, ProjectCostCode, RFQ, RFQLine, Vendor } from "../../types.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";
import { WorksheetEditor, type WorksheetColumn } from "../ui/WorksheetEditor.tsx";

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
    expectedUpdatedAt?: string,
  ) => Promise<void> | void;
  onClose: () => void;
}

interface EditableRFQLine {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  projectCostCodeId: string;
  requestedDeliveryDate: string;
  notes: string;
}

interface EditableRFQHeader {
  id: string;
  rfqNumber: string;
  title: string;
  description: string;
  projectId: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  notes: string;
  status: RFQ["status"];
}

let rfqLineSequence = 0;

function nextRFQLineId() {
  rfqLineSequence += 1;
  return `draft-rfq-line-${Date.now()}-${rfqLineSequence}`;
}

export function persistedRFQLineId(id: string): string | undefined {
  return id.startsWith("draft-rfq-line-") ? undefined : id;
}

function createEmptyLine(): EditableRFQLine {
  return {
    id: nextRFQLineId(),
    description: "",
    quantity: "1",
    unit: "pcs",
    projectCostCodeId: "",
    requestedDeliveryDate: "",
    notes: "",
  };
}

function headerFromRFQ(rfq: RFQ | null | undefined, defaultProjectId: string | undefined, projects: readonly Project[]): EditableRFQHeader {
  return {
    id: rfq?.id || "new-rfq",
    rfqNumber: rfq?.rfqNumber || `RFQ-25-${Math.floor(1000 + Math.random() * 9000)}`,
    title: rfq?.title || "",
    description: rfq?.description || "",
    projectId: rfq?.projectId || defaultProjectId || projects[0]?.id || "",
    currency: rfq?.currency || "PHP",
    issueDate: rfq?.issueDate || new Date().toISOString().split("T")[0],
    dueDate: rfq?.dueDate || "",
    notes: rfq?.notes || "",
    status: rfq?.status || "DRAFT",
  };
}

function linesFromRFQ(rfq: RFQ | null | undefined): EditableRFQLine[] {
  if (!rfq?.lines?.length) return [createEmptyLine()];
  return rfq.lines.map((line) => ({
    id: line.id,
    description: line.description,
    quantity: String(line.quantity),
    unit: line.unit || "pcs",
    projectCostCodeId: line.projectCostCodeId || "",
    requestedDeliveryDate: line.requestedDeliveryDate || "",
    notes: line.notes || "",
  }));
}

function textValue(value: unknown) {
  return String(value ?? "");
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
  const isDraft = !rfq?.id || rfq.status === "DRAFT";

  const [header, setHeader] = useState<EditableRFQHeader>(() => headerFromRFQ(rfq, defaultProjectId, projects));
  const [invitedVendorIds, setInvitedVendorIds] = useState<string[]>(
    () => rfq?.invitedVendorIds || rfq?.invitedVendors?.map((v) => v.vendorId) || [],
  );
  const [lines, setLines] = useState<EditableRFQLine[]>(() => linesFromRFQ(rfq));
  const [vendorSearch, setVendorSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setHeader(headerFromRFQ(rfq, defaultProjectId, projects));
    setInvitedVendorIds(rfq?.invitedVendorIds || rfq?.invitedVendors?.map((v) => v.vendorId) || []);
    setLines(linesFromRFQ(rfq));
    setErrorMessage(null);
  }, [rfq, defaultProjectId, projects, open]);

  // Filter cost codes by selected project
  const availableCostCodes = useMemo(() => {
    if (!header.projectId) return [];
    return costCodes.filter((cc) => cc.projectId === header.projectId && cc.status === "ACTIVE");
  }, [costCodes, header.projectId]);

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

  const handleSaveDraft = async (nextHeader = header, nextLines = lines) => {
    setErrorMessage(null);

    if (!isDraft) return;

    const cleanNumber = nextHeader.rfqNumber.trim().toUpperCase();
    if (!cleanNumber) {
      setErrorMessage("RFQ Number is required.");
      return;
    }

    const cleanTitle = nextHeader.title.trim();
    if (!cleanTitle) {
      setErrorMessage("RFQ Title is required.");
      return;
    }

    if (nextHeader.projectId && !projects.some((project) => project.id === nextHeader.projectId)) {
      setErrorMessage("Choose a project that belongs to the current company workspace.");
      return;
    }

    if (nextLines.length === 0) {
      setErrorMessage("At least one line item is required.");
      return;
    }

    const preparedLines: Array<Partial<RFQLine> & { description: string; quantity: number }> = [];
    const validCostCodeIds = new Set(costCodes.filter((costCode) => costCode.projectId === nextHeader.projectId && costCode.status === "ACTIVE").map((costCode) => costCode.id));
    for (let i = 0; i < nextLines.length; i++) {
      const line = nextLines[i];
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
      if (line.projectCostCodeId && !validCostCodeIds.has(line.projectCostCodeId)) {
        setErrorMessage(`Line ${i + 1}: Cost code must belong to the selected project and remain active.`);
        return;
      }

      const persistedId = persistedRFQLineId(line.id);
      preparedLines.push({
        ...(persistedId ? { id: persistedId } : {}),
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
          description: nextHeader.description.trim() || null,
          projectId: nextHeader.projectId || null,
          currency: nextHeader.currency.trim().toUpperCase() || "PHP",
          issueDate: nextHeader.issueDate || null,
          dueDate: nextHeader.dueDate || null,
          notes: nextHeader.notes.trim() || null,
        },
        preparedLines,
        invitedVendorIds,
        rfq?.updatedAt,
      );
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save RFQ. Please try again.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerColumns = useMemo<readonly WorksheetColumn<EditableRFQHeader>[]>(() => [
    {
      key: "rfqNumber",
      header: "RFQ Number",
      frozen: true,
      minWidth: "12rem",
      value: (row) => row.rfqNumber,
      setValue: (row, value) => ({ ...row, rfqNumber: textValue(value).toUpperCase() }),
      editable: isDraft,
      protected: !isDraft,
      validate: (value) => textValue(value).trim() ? undefined : "RFQ Number is required.",
    },
    {
      key: "title",
      header: "RFQ Title / Package",
      minWidth: "20rem",
      value: (row) => row.title,
      setValue: (row, value) => ({ ...row, title: textValue(value) }),
      editable: isDraft,
      protected: !isDraft,
      validate: (value) => textValue(value).trim() ? undefined : "RFQ Title is required.",
    },
    {
      key: "projectId",
      header: "Project",
      kind: "select",
      minWidth: "18rem",
      options: [{ value: "", label: "General / no project" }, ...projects.map((project) => ({ value: project.id, label: `${project.projectCode} — ${project.projectName}` }))],
      value: (row) => row.projectId,
      setValue: (row, value) => ({ ...row, projectId: textValue(value) }),
      editable: isDraft,
      protected: !isDraft,
    },
    {
      key: "currency",
      header: "Currency",
      kind: "select",
      minWidth: "9rem",
      options: ["PHP", "USD", "EUR", "JPY", "SGD"].map((value) => ({ value, label: value })),
      value: (row) => row.currency,
      setValue: (row, value) => ({ ...row, currency: textValue(value).toUpperCase() }),
      editable: isDraft,
      protected: !isDraft,
    },
    {
      key: "issueDate",
      header: "Issue Date",
      kind: "date",
      minWidth: "11rem",
      value: (row) => row.issueDate,
      setValue: (row, value) => ({ ...row, issueDate: textValue(value) }),
      editable: isDraft,
      protected: !isDraft,
    },
    {
      key: "dueDate",
      header: "Due Date",
      kind: "date",
      minWidth: "11rem",
      value: (row) => row.dueDate,
      setValue: (row, value) => ({ ...row, dueDate: textValue(value) }),
      editable: isDraft,
      protected: !isDraft,
    },
    {
      key: "description",
      header: "Scope / Description",
      minWidth: "24rem",
      value: (row) => row.description,
      setValue: (row, value) => ({ ...row, description: textValue(value) }),
      editable: isDraft,
      protected: !isDraft,
    },
    {
      key: "notes",
      header: "Commercial Notes",
      minWidth: "22rem",
      value: (row) => row.notes,
      setValue: (row, value) => ({ ...row, notes: textValue(value) }),
      editable: isDraft,
      protected: !isDraft,
    },
    {
      key: "status",
      header: "Status",
      minWidth: "9rem",
      value: (row) => row.status,
      protected: true,
      editable: false,
    },
  ], [isDraft, projects]);

  const lineColumns = useMemo<readonly WorksheetColumn<EditableRFQLine>[]>(() => [
    {
      key: "description",
      header: "Item / Description",
      frozen: true,
      minWidth: "22rem",
      value: (row) => row.description,
      setValue: (row, value) => ({ ...row, description: textValue(value) }),
      editable: isDraft,
      protected: !isDraft,
      validate: (value) => textValue(value).trim() ? undefined : "Description is required.",
    },
    {
      key: "quantity",
      header: "Quantity",
      kind: "number",
      minWidth: "9rem",
      align: "right",
      value: (row) => row.quantity,
      setValue: (row, value) => ({ ...row, quantity: value === null ? "" : textValue(value) }),
      editable: isDraft,
      protected: !isDraft,
      validate: (value) => Number(value) > 0 ? undefined : "Quantity must be a positive number.",
    },
    {
      key: "unit",
      header: "Unit",
      minWidth: "8rem",
      value: (row) => row.unit,
      setValue: (row, value) => ({ ...row, unit: textValue(value) }),
      editable: isDraft,
      protected: !isDraft,
    },
    {
      key: "projectCostCodeId",
      header: "Cost Code",
      kind: "select",
      minWidth: "18rem",
      options: () => availableCostCodes.map((costCode) => ({ value: costCode.id, label: `${costCode.code} — ${costCode.name}` })),
      value: (row) => row.projectCostCodeId,
      setValue: (row, value) => ({ ...row, projectCostCodeId: textValue(value) }),
      editable: isDraft,
      protected: !isDraft,
      validate: (value) => !value || availableCostCodes.some((costCode) => costCode.id === value) ? undefined : "Choose an active cost code from the selected project.",
    },
    {
      key: "requestedDeliveryDate",
      header: "Requested Delivery Date",
      kind: "date",
      minWidth: "13rem",
      value: (row) => row.requestedDeliveryDate,
      setValue: (row, value) => ({ ...row, requestedDeliveryDate: textValue(value) }),
      editable: isDraft,
      protected: !isDraft,
    },
    {
      key: "notes",
      header: "Notes / Specification",
      minWidth: "18rem",
      value: (row) => row.notes,
      setValue: (row, value) => ({ ...row, notes: textValue(value) }),
      editable: isDraft,
      protected: !isDraft,
    },
  ], [availableCostCodes, isDraft]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await handleSaveDraft();
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

            <section data-testid="rfq-draft-worksheet" aria-label="RFQ draft worksheet" className="min-w-0 space-y-4">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5 text-[10px] leading-4 text-indigo-950">
                <p className="font-black uppercase tracking-[0.12em]">RFQ draft worksheet</p>
                <p className="mt-1">Edit safe RFQ header values and repeated line fields here. Comparison, quotation selection, issue, cancellation, and other lifecycle actions remain outside this worksheet.</p>
              </div>

              <WorksheetEditor
                ariaLabel="RFQ draft header worksheet"
                rows={[header]}
                columns={headerColumns}
                rowKey={(row) => row.id}
                onRowsChange={(rows) => { if (rows[0]) setHeader(rows[0]); }}
                onSave={isDraft ? (rows) => handleSaveDraft(rows[0] || header, lines) : undefined}
                onCancel={onClose}
                disabled={!isDraft || isSubmitting}
                isSaving={isSubmitting}
                saveLabel="Save RFQ draft"
                cancelLabel="Close editor"
                density="comfortable"
              />

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Invited Vendors</span>
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700">{invitedVendorIds.length} selected</span>
                  </div>
                  <input type="text" value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} placeholder="Search vendors..." className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none" />
                </div>
                <div className="mt-3 grid max-h-44 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredVendors.map((vendor) => {
                    const isChecked = invitedVendorIds.includes(vendor.id);
                    return <button key={vendor.id} type="button" onClick={() => toggleVendor(vendor.id)} disabled={!isDraft} className={`flex items-start gap-2.5 rounded-lg border p-2 text-left transition ${isChecked ? "border-indigo-500 bg-indigo-50/70 text-indigo-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}>
                      <div className="mt-0.5 shrink-0 text-indigo-600">{isChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-slate-400" />}</div>
                      <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{vendor.name}</div><div className="truncate text-[10px] text-slate-500">{vendor.defaultCategory || "General Supplier"}{vendor.taxId ? ` • TIN: ${vendor.taxId}` : ""}</div></div>
                    </button>;
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">RFQ Line Items</span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-extrabold text-slate-700">{lines.length}</span>
              </div>
              <WorksheetEditor
                ariaLabel="RFQ draft lines worksheet"
                rows={lines}
                columns={lineColumns}
                rowKey={(row) => row.id}
                onRowsChange={(rows) => setLines([...rows])}
                onAddRow={isDraft ? () => createEmptyLine() : undefined}
                canAddRow={isDraft}
                onRemoveRow={isDraft ? () => undefined : undefined}
                canRemoveRow={isDraft ? (_row, index) => lines.length > 1 && index >= 0 : false}
                onSave={isDraft ? (rows) => handleSaveDraft(header, [...rows]) : undefined}
                onCancel={onClose}
                disabled={!isDraft || isSubmitting}
                isSaving={isSubmitting}
                saveLabel="Save RFQ draft"
                cancelLabel="Close editor"
                emptyState="No RFQ lines yet. Add a row for each requested item."
                density="compact"
              />
            </section>
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
              {isDraft && (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {isSubmitting ? "Saving..." : isEditing ? "Update RFQ" : "Create RFQ"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
