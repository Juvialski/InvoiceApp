import React, { useCallback, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type {
  Equipment,
  EquipmentLifecycleStatus,
  EquipmentSource,
  Project,
} from "../../types.ts";
import type { EquipmentSaveInput } from "../../lib/equipment.ts";
import {
  getWorksheetCellId,
  WorksheetEditor,
  type WorksheetCellIssueMap,
  type WorksheetColumn,
} from "../ui/WorksheetEditor.tsx";
import { useDialogFocus } from "../ui/useDialogFocus.ts";
import {
  newWorksheetDraftId,
  saveWorksheetRowsSequentially,
  useWorksheetDraftRows,
  worksheetPlanIssuesToCellIssues,
  type WorksheetPlanIssue,
} from "../ui/worksheetDraftState.ts";

export type CanonicalEquipmentWorksheetRow = Equipment & {
  isNew?: boolean;
  initialLifecycleStatus: EquipmentLifecycleStatus;
};

export interface CanonicalEquipmentWorksheetSavePlan {
  valid: boolean;
  entries: readonly { rowKey: string; input: EquipmentSaveInput }[];
  issues: Readonly<Record<string, readonly WorksheetPlanIssue[]>>;
}

const EQUIPMENT_SOURCES: readonly EquipmentSource[] = ["OWNED", "RENTED", "SUBCONTRACTOR", "OTHER"];
const EQUIPMENT_LIFECYCLE_STATUSES: readonly EquipmentLifecycleStatus[] = ["AVAILABLE", "MAINTENANCE", "OUT_OF_SERVICE", "RETIRED"];

function normalizedText(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

export function canonicalEquipmentWorksheetRow(item: Equipment, options: { isNew?: boolean } = {}): CanonicalEquipmentWorksheetRow {
  return {
    ...item,
    isNew: options.isNew === true,
    initialLifecycleStatus: item.lifecycleStatus,
  };
}

function newCanonicalEquipmentWorksheetRow(): CanonicalEquipmentWorksheetRow {
  return canonicalEquipmentWorksheetRow({
    id: newWorksheetDraftId("equipment"),
    assetReference: null,
    equipmentName: "",
    equipmentType: null,
    equipmentSource: "OTHER",
    providerName: null,
    lifecycleStatus: "AVAILABLE",
    currentState: "AVAILABLE",
    currentAssignmentId: null,
    currentProjectId: null,
    currentAssignmentStart: null,
    notes: null,
  }, { isNew: true });
}

function saveInput(row: CanonicalEquipmentWorksheetRow): EquipmentSaveInput {
  return {
    ...(row.isNew ? {} : { id: row.id }),
    assetReference: normalizedText(row.assetReference)?.toUpperCase() || null,
    equipmentName: row.equipmentName.trim(),
    equipmentType: normalizedText(row.equipmentType) || null,
    equipmentSource: row.equipmentSource,
    providerName: normalizedText(row.providerName) || null,
    lifecycleStatus: row.isNew ? row.lifecycleStatus : row.initialLifecycleStatus,
    notes: normalizedText(row.notes) || null,
  };
}

export function buildCanonicalEquipmentSavePlan(
  rows: readonly CanonicalEquipmentWorksheetRow[],
  dirtyRowKeys: ReadonlySet<string>,
): CanonicalEquipmentWorksheetSavePlan {
  const entries: { rowKey: string; input: EquipmentSaveInput }[] = [];
  const issues: Record<string, WorksheetPlanIssue[]> = {};

  for (const row of rows.filter((candidate) => dirtyRowKeys.has(candidate.id))) {
    const rowIssues: WorksheetPlanIssue[] = [];
    if (!row.equipmentName.trim()) rowIssues.push({ columnKey: "equipmentName", message: "Equipment name is required." });
    if (!EQUIPMENT_SOURCES.includes(row.equipmentSource)) rowIssues.push({ columnKey: "equipmentSource", message: "Choose a supported equipment source." });
    const lifecycleStatus = row.isNew ? row.lifecycleStatus : row.initialLifecycleStatus;
    if (!EQUIPMENT_LIFECYCLE_STATUSES.includes(lifecycleStatus)) rowIssues.push({ columnKey: "lifecycleStatus", message: "Choose a supported Equipment lifecycle state." });

    if (rowIssues.length) issues[row.id] = rowIssues;
    else entries.push({ rowKey: row.id, input: saveInput(row) });
  }

  return { valid: Object.keys(issues).length === 0, entries, issues };
}

function canonicalEquipmentColumns(projects: readonly Project[], canManage: boolean): readonly WorksheetColumn<CanonicalEquipmentWorksheetRow>[] {
  const sourceOptions = EQUIPMENT_SOURCES.map((source) => ({ value: source, label: source.replaceAll("_", " ") }));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  return [
    {
      key: "assetReference",
      header: "Asset / Reference",
      minWidth: "14rem",
      frozen: true,
      editable: canManage,
      value: (row) => row.assetReference || "",
      setValue: (row, value) => ({ ...row, assetReference: normalizedText(value)?.toUpperCase() || null }),
    },
    {
      key: "equipmentName",
      header: "Equipment Name",
      minWidth: "18rem",
      editable: canManage,
      value: (row) => row.equipmentName,
      setValue: (row, value) => ({ ...row, equipmentName: String(value ?? "") }),
      validate: (value) => String(value ?? "").trim() ? undefined : "Equipment name is required.",
    },
    {
      key: "equipmentType",
      header: "Type / Category",
      minWidth: "14rem",
      editable: canManage,
      value: (row) => row.equipmentType || "",
      setValue: (row, value) => ({ ...row, equipmentType: normalizedText(value) || null }),
    },
    {
      key: "equipmentSource",
      header: "Ownership / Source",
      kind: "select",
      minWidth: "14rem",
      editable: canManage,
      options: sourceOptions,
      value: (row) => row.equipmentSource,
      setValue: (row, value) => ({ ...row, equipmentSource: value as EquipmentSource }),
    },
    {
      key: "providerName",
      header: "Provider / Vendor",
      minWidth: "16rem",
      editable: canManage,
      value: (row) => row.providerName || "",
      setValue: (row, value) => ({ ...row, providerName: normalizedText(value) || null }),
    },
    {
      key: "notes",
      header: "Notes",
      minWidth: "20rem",
      editable: canManage,
      value: (row) => row.notes || "",
      setValue: (row, value) => ({ ...row, notes: normalizedText(value) || null }),
    },
    {
      key: "lifecycleStatus",
      header: "Lifecycle",
      minWidth: "13rem",
      protected: true,
      editable: false,
      value: (row) => row.lifecycleStatus,
      render: (value) => String(value).replaceAll("_", " "),
    },
    {
      key: "currentState",
      header: "Current State",
      minWidth: "13rem",
      protected: true,
      editable: false,
      value: (row) => row.currentState || row.lifecycleStatus,
      render: (value) => String(value).replaceAll("_", " "),
    },
    {
      key: "currentProjectId",
      header: "Current Project",
      minWidth: "17rem",
      protected: true,
      editable: false,
      value: (row) => row.currentProjectId || "",
      render: (_value, row) => row.currentProjectId ? projectById.get(row.currentProjectId)?.projectName || "Current project unavailable" : "Company equipment pool",
    },
    {
      key: "currentAssignmentId",
      header: "Active Assignment",
      minWidth: "15rem",
      protected: true,
      editable: false,
      value: (row) => row.currentAssignmentId || "",
      render: (_value, row) => row.currentAssignmentId ? "Assignment history recorded" : "No active assignment",
    },
    {
      key: "currentAssignmentStart",
      header: "Assignment Start",
      kind: "date",
      minWidth: "13rem",
      protected: true,
      editable: false,
      value: (row) => row.currentAssignmentStart || "",
    },
  ];
}

export interface CanonicalEquipmentWorksheetModalProps {
  equipment: readonly Equipment[];
  projects: readonly Project[];
  canManage: boolean;
  initialEquipmentId?: string;
  createNew?: boolean;
  onClose: () => void;
  onSave: (input: EquipmentSaveInput) => Promise<Equipment>;
}

export function CanonicalEquipmentWorksheetModal({
  equipment,
  projects,
  canManage,
  initialEquipmentId,
  createNew = false,
  onClose,
  onSave,
}: CanonicalEquipmentWorksheetModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus({ open: true, onClose, initialFocusRef: closeButtonRef });
  const sourceRows = useMemo(() => equipment.map((item) => canonicalEquipmentWorksheetRow(item)), [equipment]);
  const makeNewRow = useCallback(() => newCanonicalEquipmentWorksheetRow(), []);
  const draft = useWorksheetDraftRows(sourceRows, makeNewRow, createNew);
  const columns = useMemo(() => canonicalEquipmentColumns(projects, canManage), [canManage, projects]);
  const [cellIssues, setCellIssues] = useState<WorksheetCellIssueMap>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const initialRowIndex = Math.max(0, draft.draftRows.findIndex((row) => row.id === initialEquipmentId));
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

  const handleSave = async (nextRows: readonly CanonicalEquipmentWorksheetRow[]) => {
    draft.handleRowsChange(nextRows);
    setSaveError(null);
    setSaveMessage(null);
    if (!draft.dirtyRowKeysRef.current.size) {
      setSaveMessage("No Equipment changes are staged.");
      return;
    }
    const plan = buildCanonicalEquipmentSavePlan(nextRows, draft.dirtyRowKeysRef.current);
    if (!plan.valid) {
      setCellIssues(worksheetPlanIssuesToCellIssues(plan.issues));
      setSaveError("Fix the highlighted Equipment validation errors before saving.");
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
        setSaveError(`${result.savedRowKeys.length} Equipment row${result.savedRowKeys.length === 1 ? "" : "s"} saved; ${result.failures.length} row${result.failures.length === 1 ? " remains" : "s remain"} staged because the save failed. ${result.failures[0].message}`);
        return;
      }
      setSaveMessage(`Saved ${result.savedRowKeys.length} Equipment row${result.savedRowKeys.length === 1 ? "" : "s"}.`);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div ref={dialogRef} data-canonical-equipment-worksheet="true" className="fixed inset-0 z-[70] flex items-end justify-center overflow-hidden bg-slate-950/50 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="canonical-equipment-worksheet-title">
      <section data-working-canvas="true" className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[96vw] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:p-5">
          <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-600">Canonical Equipment master</p><h2 id="canonical-equipment-worksheet-title" className="mt-1 text-lg font-black text-slate-950">{createNew ? "Add" : "Edit"} canonical Equipment</h2><p className="mt-1 max-w-5xl text-xs leading-5 text-slate-500">Edit safe asset identity and descriptive metadata. Lifecycle, current state, Project assignment, transfer, return, and history remain protected and deliberate workflows.</p></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} disabled={isSaving} className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" aria-label="Close canonical Equipment worksheet"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
          <section data-worksheet-responsive-surface="canonical-equipment-master" aria-label="Canonical Equipment master worksheet" className="space-y-3">
            {saveError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{saveError}</p>}
            {saveMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{saveMessage}</p>}
            <WorksheetEditor
              key={`${editorRevision}-${draft.initialDraftRowId || "source"}`}
              ariaLabel="Canonical Equipment master worksheet"
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
              }}
              cellIssues={cellIssues}
              dirtyCells={dirtyCells}
              onAddRow={draft.addRow}
              canAddRow={canManage}
              onRemoveRow={draft.removeRow}
              canRemoveRow={(row) => canManage && Boolean(row.isNew)}
              hideUnavailableRemoveRowAction
              onSave={canManage ? handleSave : undefined}
              onCancel={onClose}
              saveLabel="Save Equipment"
              cancelLabel="Cancel"
              isSaving={isSaving}
              initialActiveCell={{ row: initialEditorRow, column: 0 }}
              initialEditingCell={initialDraftRowIndex >= 0 ? { row: initialDraftRowIndex, column: 0 } : undefined}
              emptyState="No canonical Equipment is registered. Add a row to stage an asset."
              density="compact"
            />
          </section>
        </div>
      </section>
    </div>
  );
}

export default CanonicalEquipmentWorksheetModal;
