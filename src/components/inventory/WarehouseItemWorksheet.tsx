import React, { useCallback, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ProjectMaterial } from "../../types.ts";
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
import type {
  InventoryBalance,
  InventoryItem,
  InventoryItemSaveInput,
  InventoryItemStatus,
  InventoryMovement,
} from "../../lib/inventory.ts";
import { EntityMediaControl } from "../ui/EntityMedia.tsx";

export type WarehouseItemWorksheetRow = InventoryItem & {
  isNew?: boolean;
  onHandQuantity: number;
  openingQuantity: number;
  receivedQuantity: number;
  issuedQuantity: number;
  returnedQuantity: number;
  movementCount: number;
  hasMovementHistory: boolean;
  hasProjectRequirement: boolean;
  stockUnitLocked: boolean;
  originalStockUnit: string;
  originalStatus: InventoryItemStatus;
};

export interface WarehouseItemWorksheetSavePlan {
  valid: boolean;
  entries: readonly { rowKey: string; input: InventoryItemSaveInput }[];
  issues: Readonly<Record<string, readonly WorksheetPlanIssue[]>>;
}

const ITEM_STATUSES: readonly InventoryItemStatus[] = ["ACTIVE", "INACTIVE"];

function normalizedText(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function normalizedUnit(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function balanceValue(balance: InventoryBalance | undefined, key: keyof Pick<InventoryBalance, "onHandQuantity" | "openingQuantity" | "receivedQuantity" | "issuedQuantity" | "returnedQuantity" | "movementCount">): number {
  const value = balance?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function warehouseItemWorksheetRow(
  item: InventoryItem,
  options: { balance?: InventoryBalance; hasMovementHistory?: boolean; hasProjectRequirement?: boolean; isNew?: boolean } = {},
): WarehouseItemWorksheetRow {
  const isNew = options.isNew === true;
  const movementCount = balanceValue(options.balance, "movementCount");
  const hasMovementHistory = options.hasMovementHistory === true || movementCount > 0;
  const hasProjectRequirement = options.hasProjectRequirement === true;
  return {
    ...item,
    isNew,
    onHandQuantity: balanceValue(options.balance, "onHandQuantity"),
    openingQuantity: balanceValue(options.balance, "openingQuantity"),
    receivedQuantity: balanceValue(options.balance, "receivedQuantity"),
    issuedQuantity: balanceValue(options.balance, "issuedQuantity"),
    returnedQuantity: balanceValue(options.balance, "returnedQuantity"),
    movementCount,
    hasMovementHistory,
    hasProjectRequirement,
    stockUnitLocked: !isNew && (hasMovementHistory || hasProjectRequirement),
    originalStockUnit: normalizedUnit(item.stockUnit),
    originalStatus: item.status,
  };
}

function newWarehouseItemWorksheetRow(): WarehouseItemWorksheetRow {
  return warehouseItemWorksheetRow({
    id: newWorksheetDraftId("inventory-item"),
    itemName: "",
    itemCode: null,
    category: null,
    stockUnit: "pcs",
    status: "ACTIVE",
  }, { isNew: true });
}

function saveInput(row: WarehouseItemWorksheetRow): InventoryItemSaveInput {
  return {
    ...(row.isNew ? {} : { id: row.id }),
    itemName: row.itemName.trim(),
    itemCode: normalizedText(row.itemCode)?.toUpperCase() || null,
    category: normalizedText(row.category) || null,
    stockUnit: normalizedUnit(row.stockUnit),
    status: row.isNew ? row.status : row.originalStatus,
  };
}

export function buildWarehouseItemSavePlan(
  rows: readonly WarehouseItemWorksheetRow[],
  dirtyRowKeys: ReadonlySet<string>,
): WarehouseItemWorksheetSavePlan {
  const entries: { rowKey: string; input: InventoryItemSaveInput }[] = [];
  const issues: Record<string, WorksheetPlanIssue[]> = {};

  for (const row of rows.filter((candidate) => dirtyRowKeys.has(candidate.id))) {
    const rowIssues: WorksheetPlanIssue[] = [];
    if (!row.itemName.trim()) rowIssues.push({ columnKey: "itemName", message: "Item name is required." });
    if (!normalizedUnit(row.stockUnit)) rowIssues.push({ columnKey: "stockUnit", message: "A canonical stock unit is required." });
    if (row.stockUnitLocked && normalizedUnit(row.stockUnit) !== row.originalStockUnit) {
      rowIssues.push({ columnKey: "stockUnit", message: "Stock unit is protected after movement history or project usage links exist." });
    }
    const status = row.isNew ? row.status : row.originalStatus;
    if (!ITEM_STATUSES.includes(status)) rowIssues.push({ columnKey: "status", message: "Choose a supported inventory item status." });

    if (rowIssues.length) issues[row.id] = rowIssues;
    else entries.push({ rowKey: row.id, input: saveInput(row) });
  }

  return { valid: Object.keys(issues).length === 0, entries, issues };
}

function movementTotals(row: WarehouseItemWorksheetRow): string {
  return `Opening ${row.openingQuantity} · received ${row.receivedQuantity} · issued ${row.issuedQuantity} · returned ${row.returnedQuantity}`;
}

function warehouseItemColumns(canManage: boolean): readonly WorksheetColumn<WarehouseItemWorksheetRow>[] {
  return [
    {
      key: "itemName",
      header: "Item / Description",
      minWidth: "18rem",
      frozen: true,
      editable: canManage,
      value: (row) => row.itemName,
      setValue: (row, value) => ({ ...row, itemName: String(value ?? "") }),
      validate: (value) => String(value ?? "").trim() ? undefined : "Item name is required.",
    },
    {
      key: "itemCode",
      header: "Item / Reference Code",
      minWidth: "13rem",
      editable: canManage,
      value: (row) => row.itemCode || "",
      setValue: (row, value) => ({ ...row, itemCode: normalizedText(value)?.toUpperCase() || null }),
    },
    {
      key: "category",
      header: "Category",
      minWidth: "12rem",
      editable: canManage,
      value: (row) => row.category || "",
      setValue: (row, value) => ({ ...row, category: normalizedText(value) || null }),
    },
    {
      key: "stockUnit",
      header: "Stock Unit",
      minWidth: "10rem",
      editable: (row) => canManage && !row.stockUnitLocked,
      protected: (row) => row.stockUnitLocked,
      value: (row) => row.stockUnit,
      setValue: (row, value) => ({ ...row, stockUnit: normalizedUnit(value) }),
      validate: (value) => normalizedUnit(value) ? undefined : "A canonical stock unit is required.",
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      minWidth: "10rem",
      protected: true,
      editable: false,
      value: (row) => row.status,
      render: (value) => String(value).replaceAll("_", " "),
    },
    {
      key: "onHandQuantity",
      header: "On-hand",
      kind: "number",
      align: "right",
      minWidth: "10rem",
      protected: true,
      editable: false,
      value: (row) => row.onHandQuantity,
    },
    {
      key: "movementCount",
      header: "Movement Events",
      kind: "number",
      align: "right",
      minWidth: "12rem",
      protected: true,
      editable: false,
      value: (row) => row.movementCount,
    },
    {
      key: "movementTotals",
      header: "Movement Totals",
      minWidth: "28rem",
      protected: true,
      editable: false,
      value: movementTotals,
      render: (_value, row) => movementTotals(row),
    },
  ];
}

export interface WarehouseItemWorksheetModalProps {
  items: readonly InventoryItem[];
  balances: readonly InventoryBalance[];
  movements: readonly InventoryMovement[];
  projectMaterials: readonly ProjectMaterial[];
  canManage: boolean;
  initialItemId?: string;
  createNew?: boolean;
  onClose: () => void;
  onSave: (input: InventoryItemSaveInput) => Promise<InventoryItem>;
}

export function WarehouseItemWorksheetModal({
  items,
  balances,
  movements,
  projectMaterials,
  canManage,
  initialItemId,
  createNew = false,
  onClose,
  onSave,
}: WarehouseItemWorksheetModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus({ open: true, onClose, initialFocusRef: closeButtonRef });
  const balanceById = useMemo(() => new Map(balances.map((balance) => [balance.inventoryItemId, balance])), [balances]);
  const movementIds = useMemo(() => new Set(movements.map((movement) => movement.inventoryItemId)), [movements]);
  const projectItemIds = useMemo(() => new Set(projectMaterials.map((material) => material.inventoryItemId).filter((id): id is string => Boolean(id))), [projectMaterials]);
  const sourceRows = useMemo(() => items.map((item) => warehouseItemWorksheetRow(item, {
    balance: balanceById.get(item.id),
    hasMovementHistory: movementIds.has(item.id),
    hasProjectRequirement: projectItemIds.has(item.id),
  })), [balanceById, items, movementIds, projectItemIds]);
  const makeNewRow = useCallback(() => newWarehouseItemWorksheetRow(), []);
  const draft = useWorksheetDraftRows(sourceRows, makeNewRow, createNew);
  const columns = useMemo(() => warehouseItemColumns(canManage), [canManage]);
  const [cellIssues, setCellIssues] = useState<WorksheetCellIssueMap>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const initialRowIndex = Math.max(0, draft.draftRows.findIndex((row) => row.id === initialItemId));
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

  const handleSave = async (nextRows: readonly WarehouseItemWorksheetRow[]) => {
    draft.handleRowsChange(nextRows);
    setSaveError(null);
    setSaveMessage(null);
    if (!draft.dirtyRowKeysRef.current.size) {
      setSaveMessage("No Warehouse item changes are staged.");
      return;
    }
    const plan = buildWarehouseItemSavePlan(nextRows, draft.dirtyRowKeysRef.current);
    if (!plan.valid) {
      setCellIssues(worksheetPlanIssuesToCellIssues(plan.issues));
      setSaveError("Fix the highlighted Warehouse item validation errors before saving.");
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
        setSaveError(`${result.savedRowKeys.length} item row${result.savedRowKeys.length === 1 ? "" : "s"} saved; ${result.failures.length} row${result.failures.length === 1 ? " remains" : "s remain"} staged because the save failed. ${result.failures[0].message}`);
        return;
      }
      setSaveMessage(`Saved ${result.savedRowKeys.length} Warehouse item row${result.savedRowKeys.length === 1 ? "" : "s"}.`);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div ref={dialogRef} data-warehouse-item-worksheet="true" className="fixed inset-0 z-[70] flex items-end justify-center overflow-hidden bg-slate-950/50 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="warehouse-item-worksheet-title">
      <section data-working-canvas="true" className="hqs-surface-raised hqs-border flex max-h-[calc(100dvh-1rem)] w-full max-w-[96vw] min-w-0 flex-col overflow-hidden rounded-2xl border shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="hqs-border flex items-start justify-between gap-3 border-b p-4 sm:p-5">
          <div className="min-w-0"><p className="hqs-accent-text text-[10px] font-black uppercase tracking-[0.16em]">Warehouse item master</p><h2 id="warehouse-item-worksheet-title" className="hqs-primary-text mt-1 text-lg font-black">{createNew ? "Add" : "Edit"} canonical items</h2><p className="hqs-secondary-text mt-1 max-w-5xl text-xs leading-5">Edit safe item identity and classification. Stock units tied to movement or project usage history stay protected; status, balances, and movement history remain authoritative outside this worksheet.</p></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} disabled={isSaving} className="hqs-control hqs-focus-ring shrink-0 rounded-lg p-2 disabled:opacity-50" aria-label="Close Warehouse item worksheet"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
          <section data-worksheet-responsive-surface="warehouse-item-master" aria-label="Warehouse item master worksheet" className="space-y-3">
            {!createNew && initialItemId && <EntityMediaControl entityType="MATERIAL" entityId={initialItemId} label="Material" canManage={canManage} />}
            {saveError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{saveError}</p>}
            {saveMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{saveMessage}</p>}
            <WorksheetEditor
              key={`${editorRevision}-${draft.initialDraftRowId || "source"}`}
              ariaLabel="Warehouse item master worksheet"
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
              saveLabel="Save items"
              cancelLabel="Cancel"
              isSaving={isSaving}
              initialActiveCell={{ row: initialEditorRow, column: 0 }}
              initialEditingCell={initialDraftRowIndex >= 0 ? { row: initialDraftRowIndex, column: 0 } : undefined}
              emptyState="No canonical Warehouse items are registered. Add a row to stage an item."
              density="compact"
            />
          </section>
        </div>
      </section>
    </div>
  );
}

export default WarehouseItemWorksheetModal;
