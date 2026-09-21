import React, { useCallback, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Vendor } from "../types.ts";
import { normalizeBusinessName, normalizeTaxId } from "../lib/entityResolution.ts";
import type { VendorSaveInput } from "../lib/vendors.ts";
import {
  getWorksheetCellId,
  WorksheetEditor,
  type WorksheetCellIssueMap,
  type WorksheetColumn,
} from "./ui/WorksheetEditor.tsx";
import { useDialogFocus } from "./ui/useDialogFocus.ts";
import {
  newWorksheetDraftId,
  saveWorksheetRowsSequentially,
  useWorksheetDraftRows,
  type WorksheetDraftRow,
  type WorksheetPlanIssue,
} from "./ui/worksheetDraftState.ts";

export type VendorWorksheetRow = Vendor & WorksheetDraftRow;

export interface VendorWorksheetSavePlan {
  valid: boolean;
  entries: readonly { rowKey: string; input: VendorSaveInput }[];
  issues: Readonly<Record<string, readonly WorksheetPlanIssue[]>>;
}

const VENDOR_CURRENCIES = ["PHP", "USD", "EUR", "JPY", "SGD"] as const;

function normalizedText(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function normalizedEmail(value: unknown): string | undefined {
  return normalizedText(value)?.toLowerCase();
}

function normalizedCurrency(value: unknown): string | undefined {
  return normalizedText(value)?.toUpperCase();
}

function normalizedTaxKey(value: unknown): string | undefined {
  const raw = normalizedText(value);
  if (!raw) return undefined;
  return normalizeTaxId(raw)?.normalized || raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function newVendorWorksheetRow(): VendorWorksheetRow {
  return {
    id: newWorksheetDraftId("vendor"),
    name: "",
    normalizedName: "",
    email: null,
    phone: null,
    taxId: null,
    address: null,
    defaultCurrency: "PHP",
    defaultCategory: null,
    active: true,
    isNew: true,
  };
}

export function vendorWorksheetRow(vendor: Vendor, options: { isNew?: boolean } = {}): VendorWorksheetRow {
  return { ...vendor, isNew: options.isNew === true };
}

function duplicateIdentityIssue(row: VendorWorksheetRow, rows: readonly VendorWorksheetRow[]): WorksheetPlanIssue | undefined {
  const otherRows = rows.filter((candidate) => candidate.id !== row.id);
  const taxKey = normalizedTaxKey(row.taxId);
  if (taxKey) {
    const match = otherRows.find((candidate) => normalizedTaxKey(candidate.taxId) === taxKey);
    if (match) return { columnKey: "taxId", message: `Tax ID matches canonical Vendor “${match.name}”. Select that Vendor or reconcile the duplicate explicitly.` };
  }

  const nameKey = normalizeBusinessName(row.name);
  if (!taxKey && nameKey) {
    const match = otherRows.find((candidate) => normalizeBusinessName(candidate.name) === nameKey);
    if (match) return { columnKey: "name", message: `This name matches canonical Vendor “${match.name}”. Select that Vendor or reconcile the duplicate explicitly.` };
  }
  return undefined;
}

function saveInput(row: VendorWorksheetRow): VendorSaveInput {
  return {
    ...(row.isNew ? {} : { id: row.id }),
    name: row.name.trim(),
    email: normalizedEmail(row.email) || null,
    phone: normalizedText(row.phone) || null,
    ...(normalizedText(row.taxId) ? { taxId: normalizedText(row.taxId) } : {}),
    address: normalizedText(row.address) || null,
    ...(normalizedCurrency(row.defaultCurrency) ? { defaultCurrency: normalizedCurrency(row.defaultCurrency) } : {}),
    defaultCategory: normalizedText(row.defaultCategory) || null,
    ...(!row.isNew && row.updatedAt ? { expectedUpdatedAt: row.updatedAt } : {}),
  };
}

export function buildVendorSavePlan(
  rows: readonly VendorWorksheetRow[],
  dirtyRowKeys: ReadonlySet<string>,
): VendorWorksheetSavePlan {
  const entries: { rowKey: string; input: VendorSaveInput }[] = [];
  const issues: Record<string, WorksheetPlanIssue[]> = {};

  for (const row of rows.filter((candidate) => dirtyRowKeys.has(candidate.id))) {
    const rowIssues: WorksheetPlanIssue[] = [];
    if (!row.name.trim()) rowIssues.push({ columnKey: "name", message: "Vendor name is required." });
    const email = normalizedEmail(row.email);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) rowIssues.push({ columnKey: "email", message: "Enter a valid Vendor email or leave it blank." });
    const currency = normalizedCurrency(row.defaultCurrency);
    if (currency && !/^[A-Z]{3}$/.test(currency)) rowIssues.push({ columnKey: "defaultCurrency", message: "Default currency must be a three-letter ISO code." });
    const duplicate = duplicateIdentityIssue(row, rows);
    if (duplicate) rowIssues.push(duplicate);

    if (rowIssues.length) issues[row.id] = rowIssues;
    else entries.push({ rowKey: row.id, input: saveInput(row) });
  }

  return { valid: Object.keys(issues).length === 0, entries, issues };
}

function vendorWorksheetColumns(canManage: boolean): readonly WorksheetColumn<VendorWorksheetRow>[] {
  return [
    {
      key: "name",
      header: "Vendor / Company Name",
      minWidth: "19rem",
      frozen: true,
      editable: canManage,
      value: (row) => row.name,
      setValue: (row, value) => ({ ...row, name: String(value ?? "") }),
      validate: (value) => String(value ?? "").trim() ? undefined : "Vendor name is required.",
    },
    {
      key: "email",
      header: "Email",
      minWidth: "18rem",
      editable: canManage,
      value: (row) => row.email || "",
      setValue: (row, value) => ({ ...row, email: normalizedEmail(value) || null }),
      validate: (value) => {
        const email = normalizedEmail(value);
        return !email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? undefined : "Enter a valid Vendor email or leave it blank.";
      },
    },
    {
      key: "phone",
      header: "Phone",
      minWidth: "14rem",
      editable: canManage,
      value: (row) => row.phone || "",
      setValue: (row, value) => ({ ...row, phone: normalizedText(value) || null }),
    },
    {
      key: "taxId",
      header: "Tax / Business ID",
      minWidth: "15rem",
      editable: canManage,
      value: (row) => row.taxId || "",
      setValue: (row, value) => ({ ...row, taxId: normalizedText(value) || null }),
    },
    {
      key: "address",
      header: "Address",
      minWidth: "22rem",
      editable: canManage,
      value: (row) => row.address || "",
      setValue: (row, value) => ({ ...row, address: normalizedText(value) || null }),
    },
    {
      key: "defaultCurrency",
      header: "Default Currency",
      kind: "select",
      minWidth: "13rem",
      editable: canManage,
      options: (row) => [...new Set([...(row.defaultCurrency ? [row.defaultCurrency] : []), ...VENDOR_CURRENCIES])].map((value) => ({ value, label: value })),
      value: (row) => row.defaultCurrency || "",
      setValue: (row, value) => ({ ...row, defaultCurrency: normalizedCurrency(value) || null }),
    },
    {
      key: "defaultCategory",
      header: "Default Category",
      minWidth: "16rem",
      editable: canManage,
      value: (row) => row.defaultCategory || "",
      setValue: (row, value) => ({ ...row, defaultCategory: normalizedText(value) || null }),
    },
    {
      key: "active",
      header: "State",
      align: "center",
      minWidth: "11rem",
      protected: true,
      editable: false,
      value: (row) => row.active === false ? "INACTIVE" : "ACTIVE",
      render: (value) => String(value).replaceAll("_", " "),
    },
  ];
}

export interface VendorMasterWorksheetModalProps {
  vendors: readonly Vendor[];
  canManage: boolean;
  initialVendorId?: string;
  createNew?: boolean;
  onClose: () => void;
  onSave: (input: VendorSaveInput) => Promise<Vendor>;
}

function planIssuesToCellIssues(issues: Readonly<Record<string, readonly WorksheetPlanIssue[]>>): WorksheetCellIssueMap {
  const cellIssues: Record<string, { severity: "error"; message: string }> = {};
  for (const [rowKey, rowIssues] of Object.entries(issues)) {
    for (const issue of rowIssues) cellIssues[getWorksheetCellId(rowKey, issue.columnKey)] = { severity: "error", message: issue.message };
  }
  return cellIssues;
}

export function VendorMasterWorksheetModal({
  vendors,
  canManage,
  initialVendorId,
  createNew = false,
  onClose,
  onSave,
}: VendorMasterWorksheetModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus({ open: true, onClose, initialFocusRef: closeButtonRef });
  const sourceRows = useMemo(() => vendors.map((vendor) => vendorWorksheetRow(vendor)), [vendors]);
  const makeNewRow = useCallback(() => newVendorWorksheetRow(), []);
  const draft = useWorksheetDraftRows(sourceRows, makeNewRow, createNew);
  const columns = useMemo(() => vendorWorksheetColumns(canManage), [canManage]);
  const [cellIssues, setCellIssues] = useState<WorksheetCellIssueMap>({});
  const [conflicts, setConflicts] = useState<WorksheetCellIssueMap>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const initialRowIndex = Math.max(0, draft.draftRows.findIndex((row) => row.id === initialVendorId));
  const initialDraftRowIndex = draft.initialDraftRowId ? draft.draftRows.findIndex((row) => row.id === draft.initialDraftRowId) : -1;
  const initialEditorRow = createNew && initialDraftRowIndex >= 0 ? initialDraftRowIndex : initialRowIndex;
  const dirtyCells = useMemo(() => {
    const cells = new Set(draft.dirtyCellKeys);
    for (const row of draft.draftRows) {
      if (!row.isNew || !draft.dirtyRowKeys.has(row.id)) continue;
      for (const column of columns) cells.add(getWorksheetCellId(row.id, column.key));
    }
    return cells;
  }, [columns, draft.dirtyCellKeys, draft.dirtyRowKeys, draft.draftRows]);

  const handleSave = async (nextRows: readonly VendorWorksheetRow[]) => {
    draft.handleRowsChange(nextRows);
    setSaveError(null);
    setSaveMessage(null);
    setConflicts({});
    if (!draft.dirtyRowKeysRef.current.size) {
      setSaveMessage("No Vendor changes are staged.");
      return;
    }
    const plan = buildVendorSavePlan(nextRows, draft.dirtyRowKeysRef.current);
    if (!plan.valid) {
      setCellIssues(planIssuesToCellIssues(plan.issues));
      setSaveError("Fix the highlighted Vendor validation errors before saving.");
      return;
    }
    setCellIssues({});
    setIsSaving(true);
    try {
      const result = await saveWorksheetRowsSequentially(plan.entries, async (entry) => { await onSave(entry.input); });
      const failedRowKeys = new Set(result.failures.map((failure) => failure.rowKey));
      draft.clearDirty(failedRowKeys);
      setEditorRevision((value) => value + 1);
      if (result.failures.length) {
        const nextCellIssues: Record<string, { severity: "error"; message: string }> = {};
        const nextConflicts: Record<string, { severity: "warning"; message: string }> = {};
        for (const failure of result.failures) {
          const key = getWorksheetCellId(failure.rowKey, "name");
          if (/changed|stale|version|refresh/i.test(failure.message)) nextConflicts[key] = { severity: "warning", message: failure.message };
          else nextCellIssues[key] = { severity: "error", message: failure.message };
        }
        setCellIssues(nextCellIssues);
        setConflicts(nextConflicts);
        setSaveError(`${result.savedRowKeys.length} Vendor row${result.savedRowKeys.length === 1 ? "" : "s"} saved; ${result.failures.length} row${result.failures.length === 1 ? " remains" : "s remain"} staged because the save failed. ${result.failures[0]?.message || "Review the highlighted row."}`);
        return;
      }
      setSaveMessage(`Saved ${result.savedRowKeys.length} Vendor row${result.savedRowKeys.length === 1 ? "" : "s"}.`);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div ref={dialogRef} data-testid="vendor-master-worksheet" data-vendor-master-worksheet="true" className="fixed inset-0 z-[70] flex items-end justify-center overflow-hidden bg-slate-950/50 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="vendor-master-worksheet-title">
      <section data-working-canvas="true" className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[96vw] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:p-5">
          <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Vendor master</p><h2 id="vendor-master-worksheet-title" className="mt-1 text-lg font-black text-slate-950">Manage Vendors</h2><p className="mt-1 max-w-5xl text-xs leading-5 text-slate-500">Edit safe supplier metadata. Invoice evidence, procurement and Expense links, payables, and lifecycle actions remain authoritative outside this worksheet.</p></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} disabled={isSaving} className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" aria-label="Close Vendor master worksheet"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
          <section data-worksheet-responsive-surface="vendor-master" aria-label="Vendor master worksheet" className="space-y-3">
            {saveError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{saveError}</p>}
            {saveMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{saveMessage}</p>}
            <WorksheetEditor
              key={`${editorRevision}-${draft.initialDraftRowId || "source"}`}
              ariaLabel="Vendor master worksheet"
              rows={draft.draftRows}
              columns={columns}
              rowKey={(row) => row.id}
              onRowsChange={draft.handleRowsChange}
              onCellChange={({ row, column }) => {
                const cellKey = getWorksheetCellId(row.id, column.key);
                draft.markDirty(row.id, cellKey);
                setCellIssues((current) => {
                  if (!current[cellKey]) return current;
                  const next = { ...current };
                  delete next[cellKey];
                  return next;
                });
                setConflicts((current) => {
                  if (!current[cellKey]) return current;
                  const next = { ...current };
                  delete next[cellKey];
                  return next;
                });
              }}
              cellIssues={cellIssues}
              conflicts={conflicts}
              dirtyCells={dirtyCells}
              onAddRow={draft.addRow}
              canAddRow={canManage}
              onRemoveRow={draft.removeRow}
              canRemoveRow={(row) => canManage && Boolean(row.isNew)}
              hideUnavailableRemoveRowAction
              onSave={canManage ? handleSave : undefined}
              onCancel={onClose}
              saveLabel="Save Vendors"
              cancelLabel="Cancel"
              isSaving={isSaving}
              initialActiveCell={{ row: initialEditorRow, column: 0 }}
              initialEditingCell={initialDraftRowIndex >= 0 ? { row: initialDraftRowIndex, column: 0 } : undefined}
              emptyState="No canonical Vendors are registered. Add a row to stage a Vendor."
              density="compact"
            />
          </section>
        </div>
      </section>
    </div>
  );
}

export default VendorMasterWorksheetModal;
