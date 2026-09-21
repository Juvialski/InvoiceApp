import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type {
  Project,
  ProjectCostCode,
  ProjectEquipment,
  ProjectEquipmentSource,
  ProjectEquipmentStatus,
  ProjectMaterial,
  ProjectMaterialStatus,
  PurchaseOrder,
} from "../../types.ts";
import type { InventoryItem } from "../../lib/inventory.ts";
import {
  getWorksheetCellId,
  WorksheetEditor,
  type WorksheetCellIssueMap,
  type WorksheetColumn,
  type WorksheetSelectOption,
} from "../ui/WorksheetEditor.tsx";
import { useDialogFocus } from "../ui/useDialogFocus.ts";
import {
  formatCostCodeOptionLabel,
  getSelectableCostCodes,
} from "../../lib/projectCostCodes.ts";
import type {
  ProjectEquipmentSaveInput,
  ProjectMaterialSaveInput,
} from "../../lib/materialsEquipment.ts";
import {
  newWorksheetDraftId,
  saveWorksheetRowsSequentially,
  type WorksheetPlanIssue,
} from "../ui/worksheetDraftState.ts";

export type { WorksheetPlanIssue } from "../ui/worksheetDraftState.ts";
export { saveWorksheetRowsSequentially } from "../ui/worksheetDraftState.ts";

export type ProjectMaterialWorksheetRow = ProjectMaterial & { isNew?: boolean };
export type ProjectEquipmentWorksheetRow = ProjectEquipment & { isNew?: boolean };

export interface WorksheetSavePlan<TInput> {
  valid: boolean;
  entries: readonly { rowKey: string; input: TInput }[];
  issues: Readonly<Record<string, readonly WorksheetPlanIssue[]>>;
}

export function projectMaterialWorksheetRow(row: ProjectMaterialWorksheetRow): ProjectMaterialWorksheetRow {
  return { ...row };
}

export function projectEquipmentWorksheetRow(row: ProjectEquipmentWorksheetRow): ProjectEquipmentWorksheetRow {
  return { ...row };
}

const MATERIAL_STATUSES: readonly ProjectMaterialStatus[] = ["PLANNED", "ACTIVE", "ON_HOLD", "CLOSED", "CANCELLED"];
const EQUIPMENT_SOURCES: readonly ProjectEquipmentSource[] = ["OWNED", "RENTED", "SUBCONTRACTOR", "OTHER"];
const EQUIPMENT_STATUSES: readonly ProjectEquipmentStatus[] = ["ACTIVE", "INACTIVE", "OUT_OF_SERVICE", "RETURNED"];

function normalizedText(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function isCalendarDate(value: string | null | undefined): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function materialSaveInput(row: ProjectMaterialWorksheetRow): ProjectMaterialSaveInput {
  return {
    ...(row.isNew ? {} : { id: row.id }),
    projectId: row.projectId,
    inventoryItemId: row.inventoryItemId || null,
    materialName: row.materialName.trim(),
    referenceCode: normalizedText(row.referenceCode) || null,
    category: normalizedText(row.category) || null,
    unit: row.unit.trim(),
    requiredQuantity: Number(row.requiredQuantity),
    projectCostCodeId: row.projectCostCodeId || null,
    purchaseOrderId: row.purchaseOrderId || null,
    purchaseOrderLineId: row.purchaseOrderLineId || null,
    status: row.status,
    notes: normalizedText(row.notes) || null,
  };
}

function equipmentSaveInput(row: ProjectEquipmentWorksheetRow): ProjectEquipmentSaveInput {
  return {
    ...(row.isNew ? {} : { id: row.id }),
    projectId: row.projectId,
    assetReference: normalizedText(row.assetReference) || null,
    equipmentName: row.equipmentName.trim(),
    equipmentType: normalizedText(row.equipmentType) || null,
    equipmentSource: row.equipmentSource,
    providerName: normalizedText(row.providerName) || null,
    assignmentStart: row.assignmentStart || null,
    assignmentEnd: row.assignmentEnd || null,
    status: row.status,
    notes: normalizedText(row.notes) || null,
  };
}

export function buildProjectMaterialSavePlan(
  rows: readonly ProjectMaterialWorksheetRow[],
  dirtyRowKeys: ReadonlySet<string>,
  inventoryItems: readonly InventoryItem[] = [],
): WorksheetSavePlan<ProjectMaterialSaveInput> {
  const entries: { rowKey: string; input: ProjectMaterialSaveInput }[] = [];
  const issues: Record<string, WorksheetPlanIssue[]> = {};

  for (const row of rows.filter((candidate) => dirtyRowKeys.has(candidate.id))) {
    const rowIssues: WorksheetPlanIssue[] = [];
    if (!row.materialName.trim()) rowIssues.push({ columnKey: "materialName", message: "Material name is required." });
    if (!row.unit.trim()) rowIssues.push({ columnKey: "unit", message: "Unit is required." });
    if (!Number.isFinite(Number(row.requiredQuantity)) || Number(row.requiredQuantity) < 0) {
      rowIssues.push({ columnKey: "requiredQuantity", message: "Required quantity must be zero or greater." });
    }
    const linkedInventoryItem = row.inventoryItemId ? inventoryItems.find((item) => item.id === row.inventoryItemId) : undefined;
    if (linkedInventoryItem && linkedInventoryItem.stockUnit.trim().toLowerCase() !== row.unit.trim().toLowerCase()) {
      rowIssues.push({ columnKey: "inventoryItemId", message: `Warehouse item unit ${linkedInventoryItem.stockUnit} must match material unit ${row.unit}.` });
    }
    if (Boolean(row.purchaseOrderId) !== Boolean(row.purchaseOrderLineId)) {
      rowIssues.push({ columnKey: "purchaseOrderLineId", message: "Choose a purchase-order line or clear the purchase-order link." });
    }
    if (!MATERIAL_STATUSES.includes(row.status)) rowIssues.push({ columnKey: "status", message: "Choose a supported material status." });

    if (rowIssues.length) issues[row.id] = rowIssues;
    else entries.push({ rowKey: row.id, input: materialSaveInput(row) });
  }

  return { valid: Object.keys(issues).length === 0, entries, issues };
}

export function buildProjectEquipmentSavePlan(
  rows: readonly ProjectEquipmentWorksheetRow[],
  dirtyRowKeys: ReadonlySet<string>,
): WorksheetSavePlan<ProjectEquipmentSaveInput> {
  const entries: { rowKey: string; input: ProjectEquipmentSaveInput }[] = [];
  const issues: Record<string, WorksheetPlanIssue[]> = {};

  for (const row of rows.filter((candidate) => dirtyRowKeys.has(candidate.id))) {
    const rowIssues: WorksheetPlanIssue[] = [];
    if (!row.equipmentName.trim()) rowIssues.push({ columnKey: "equipmentName", message: "Equipment name is required." });
    if (!isCalendarDate(row.assignmentStart)) rowIssues.push({ columnKey: "assignmentStart", message: "Enter a real calendar date." });
    if (!isCalendarDate(row.assignmentEnd)) rowIssues.push({ columnKey: "assignmentEnd", message: "Enter a real calendar date." });
    if (row.assignmentStart && row.assignmentEnd && row.assignmentEnd < row.assignmentStart) {
      rowIssues.push({ columnKey: "assignmentEnd", message: "Assignment end cannot be before assignment start." });
    }
    if (!EQUIPMENT_SOURCES.includes(row.equipmentSource)) rowIssues.push({ columnKey: "equipmentSource", message: "Choose a supported equipment source." });
    if (!EQUIPMENT_STATUSES.includes(row.status)) rowIssues.push({ columnKey: "status", message: "Choose a supported equipment status." });

    if (rowIssues.length) issues[row.id] = rowIssues;
    else entries.push({ rowKey: row.id, input: equipmentSaveInput(row) });
  }

  return { valid: Object.keys(issues).length === 0, entries, issues };
}

function newMaterialWorksheetRow(projectId: string): ProjectMaterialWorksheetRow {
  return {
    id: newWorksheetDraftId("material"),
    projectId,
    inventoryItemId: null,
    materialName: "",
    referenceCode: null,
    category: null,
    unit: "",
    requiredQuantity: 0,
    projectCostCodeId: null,
    purchaseOrderId: null,
    purchaseOrderLineId: null,
    status: "PLANNED",
    notes: null,
    isNew: true,
  };
}

function newEquipmentWorksheetRow(projectId: string): ProjectEquipmentWorksheetRow {
  return {
    id: newWorksheetDraftId("equipment"),
    projectId,
    canonicalEquipmentId: null,
    assetReference: null,
    equipmentName: "",
    equipmentType: null,
    equipmentSource: "OTHER",
    providerName: null,
    assignmentStart: null,
    assignmentEnd: null,
    status: "ACTIVE",
    notes: null,
    isNew: true,
  };
}

interface DraftWorksheetRow {
  id: string;
  isNew?: boolean;
}

function useDraftWorksheetRows<T extends DraftWorksheetRow>(
  sourceRows: readonly T[],
  makeNewRow: () => T,
  createNew: boolean,
) {
  const dirtyRowKeysRef = useRef(new Set<string>());
  const draftRowsRef = useRef<readonly T[]>(sourceRows.slice());
  const sourceInitializedRef = useRef(false);
  const initialDraftRowIdRef = useRef<string | null>(null);
  const [initialDraftRowId, setInitialDraftRowId] = useState<string | null>(null);
  const [draftRows, setDraftRows] = useState<readonly T[]>(() => sourceRows.slice());
  const [dirtyRowKeys, setDirtyRowKeys] = useState<ReadonlySet<string>>(new Set());
  const [dirtyCellKeys, setDirtyCellKeys] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!createNew || initialDraftRowIdRef.current) return;
    const newRow = makeNewRow();
    initialDraftRowIdRef.current = newRow.id;
    const nextRows = [...draftRowsRef.current, newRow];
    const nextDirtyRows = new Set([newRow.id]);
    draftRowsRef.current = nextRows;
    dirtyRowKeysRef.current = nextDirtyRows;
    setDraftRows(nextRows);
    setDirtyRowKeys(nextDirtyRows);
    setInitialDraftRowId(newRow.id);
  }, [createNew, makeNewRow]);

  useEffect(() => {
    if (!sourceInitializedRef.current) {
      sourceInitializedRef.current = true;
      return;
    }
    const currentById = new Map(draftRowsRef.current.map((row) => [row.id, row]));
    const sourceIds = new Set(sourceRows.map((row) => row.id));
    const merged = sourceRows.map((row) => dirtyRowKeysRef.current.has(row.id) ? currentById.get(row.id) || row : row);
    const stagedExtras = draftRowsRef.current.filter((row) => dirtyRowKeysRef.current.has(row.id) && !sourceIds.has(row.id));
    const nextRows = [...merged, ...stagedExtras];
    draftRowsRef.current = nextRows;
    setDraftRows(nextRows);
  }, [sourceRows]);

  const handleRowsChange = useCallback((nextRows: readonly T[]) => {
    draftRowsRef.current = nextRows;
    setDraftRows(nextRows);
  }, []);

  const markDirty = useCallback((rowKey: string, cellKey?: string) => {
    const nextRows = new Set(dirtyRowKeysRef.current).add(rowKey);
    dirtyRowKeysRef.current = nextRows;
    setDirtyRowKeys(nextRows);
    if (cellKey) setDirtyCellKeys((current) => new Set(current).add(cellKey));
  }, []);

  const clearDirty = useCallback((rowKeys: ReadonlySet<string>) => {
    const nextRowKeys = new Set(rowKeys);
    dirtyRowKeysRef.current = nextRowKeys;
    setDirtyRowKeys(nextRowKeys);
    setDirtyCellKeys((current) => new Set([...current].filter((key) => [...rowKeys].some((rowKey) => key.startsWith(`${rowKey}:`)))));
  }, []);

  const addRow = useCallback(() => {
    const row = makeNewRow();
    markDirty(row.id);
    return row;
  }, [makeNewRow, markDirty]);

  const removeRow = useCallback((row: T) => {
    if (!row.isNew) return;
    const nextRows = new Set(dirtyRowKeysRef.current);
    nextRows.delete(row.id);
    clearDirty(nextRows);
    setDirtyCellKeys((current) => new Set([...current].filter((key) => !key.startsWith(`${row.id}:`))));
  }, [clearDirty]);

  return {
    draftRows,
    draftRowsRef,
    dirtyRowKeys,
    dirtyRowKeysRef,
    dirtyCellKeys,
    initialDraftRowId,
    handleRowsChange,
    markDirty,
    clearDirty,
    addRow,
    removeRow,
  };
}

function optionsForCurrentValue(options: readonly WorksheetSelectOption[], currentValue: string | null | undefined, unavailableLabel: string): readonly WorksheetSelectOption[] {
  if (!currentValue || options.some((option) => option.value === currentValue)) return options;
  return [{ value: currentValue, label: unavailableLabel, disabled: true }, ...options];
}

function planIssuesToCellIssues(issues: Readonly<Record<string, readonly WorksheetPlanIssue[]>>): WorksheetCellIssueMap {
  const cellIssues: Record<string, { severity: "error"; message: string }> = {};
  for (const [rowKey, rowIssues] of Object.entries(issues)) {
    for (const issue of rowIssues) cellIssues[getWorksheetCellId(rowKey, issue.columnKey)] = { severity: "error", message: issue.message };
  }
  return cellIssues;
}

interface BaseWorksheetProps {
  project: Project;
  costCodes: readonly ProjectCostCode[];
  purchaseOrders: readonly PurchaseOrder[];
  inventoryItems: readonly InventoryItem[];
  canReadProcurement: boolean;
  canReadInventory: boolean;
  canManage: boolean;
  onClose: () => void;
  createNew: boolean;
  initialRowId?: string;
}

interface MaterialsWorksheetProps extends BaseWorksheetProps {
  materials: readonly ProjectMaterial[];
  onSave: (input: ProjectMaterialSaveInput) => Promise<void>;
}

interface EquipmentWorksheetProps extends Omit<BaseWorksheetProps, "costCodes" | "purchaseOrders" | "inventoryItems" | "canReadProcurement" | "canReadInventory"> {
  equipment: readonly ProjectEquipment[];
  onSave: (input: ProjectEquipmentSaveInput) => Promise<void>;
}

function worksheetLineOptions(purchaseOrders: readonly PurchaseOrder[]) {
  return purchaseOrders.flatMap((purchaseOrder) => (purchaseOrder.lines || []).map((line) => ({ purchaseOrder, line })));
}

function materialColumns({
  project,
  canManage,
  canReadProcurement,
  canReadInventory,
  costCodes,
  inventoryItems,
  purchaseOrders,
}: Pick<MaterialsWorksheetProps, "project" | "canManage" | "canReadProcurement" | "canReadInventory" | "costCodes" | "inventoryItems" | "purchaseOrders">): readonly WorksheetColumn<ProjectMaterialWorksheetRow>[] {
  const selectableCostCodes = getSelectableCostCodes(costCodes, project.id);
  const lineOptions = worksheetLineOptions(purchaseOrders);
  const costCodeOptions = selectableCostCodes.map((costCode) => ({ value: costCode.id, label: formatCostCodeOptionLabel(costCode) }));
  const procurementOptions = lineOptions.map(({ purchaseOrder, line }) => ({ value: line.id, label: `${purchaseOrder.poNumber} · line ${line.lineNumber} · ${line.description}` }));
  const statusOptions = MATERIAL_STATUSES.map((status) => ({ value: status, label: status.replaceAll("_", " ") }));

  return [
    {
      key: "materialName",
      header: "Material / Description",
      minWidth: "17rem",
      frozen: true,
      editable: canManage,
      value: (row) => row.materialName,
      setValue: (row, value) => ({ ...row, materialName: String(value ?? "") }),
      validate: (value) => String(value ?? "").trim() ? undefined : "Material name is required.",
    },
    {
      key: "referenceCode",
      header: "Reference / Code",
      minWidth: "11rem",
      editable: canManage,
      value: (row) => row.referenceCode || "",
      setValue: (row, value) => ({ ...row, referenceCode: normalizedText(value) || null }),
    },
    {
      key: "category",
      header: "Category",
      minWidth: "11rem",
      editable: canManage,
      value: (row) => row.category || "",
      setValue: (row, value) => ({ ...row, category: normalizedText(value) || null }),
    },
    {
      key: "requiredQuantity",
      header: "Planned Qty",
      kind: "number",
      align: "right",
      minWidth: "10rem",
      editable: canManage,
      value: (row) => row.requiredQuantity,
      setValue: (row, value) => ({ ...row, requiredQuantity: Number(value ?? 0) }),
      validate: (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? undefined : "Required quantity must be zero or greater.",
    },
    {
      key: "unit",
      header: "Unit",
      minWidth: "8rem",
      editable: canManage,
      value: (row) => row.unit,
      setValue: (row, value) => ({ ...row, unit: String(value ?? "") }),
      validate: (value) => String(value ?? "").trim() ? undefined : "Unit is required.",
    },
    {
      key: "inventoryItemId",
      header: "Warehouse Item",
      kind: "select",
      minWidth: "15rem",
      editable: canManage && canReadInventory,
      protected: !canReadInventory,
      options: (row) => optionsForCurrentValue([
        { value: "", label: "No warehouse link" },
        ...inventoryItems
          .filter((item) => item.status === "ACTIVE" && item.stockUnit.trim().toLowerCase() === row.unit.trim().toLowerCase())
          .map((item) => ({ value: item.id, label: `${item.itemName} · ${item.stockUnit}${item.itemCode ? ` · ${item.itemCode}` : ""}` })),
      ], row.inventoryItemId, "Current warehouse link unavailable"),
      value: (row) => row.inventoryItemId || "",
      setValue: (row, value) => ({ ...row, inventoryItemId: String(value || "") || null }),
      validate: (value, context) => {
        const linkedInventoryItem = inventoryItems.find((item) => item.id === value);
        return !linkedInventoryItem || linkedInventoryItem.stockUnit.trim().toLowerCase() === context.row.unit.trim().toLowerCase()
          ? undefined
          : `Warehouse item unit ${linkedInventoryItem.stockUnit} must match material unit ${context.row.unit}.`;
      },
      render: (_value, row) => !canReadInventory
        ? row.inventoryItemId ? "Warehouse link (restricted)" : "No warehouse link"
        : inventoryItems.find((item) => item.id === row.inventoryItemId)?.itemName || (row.inventoryItemId ? "Current warehouse link unavailable" : "No warehouse link"),
    },
    {
      key: "projectCostCodeId",
      header: "Project Cost Code",
      kind: "select",
      minWidth: "15rem",
      editable: canManage,
      options: (row) => optionsForCurrentValue([{ value: "", label: "No cost code" }, ...costCodeOptions], row.projectCostCodeId, "Current cost code unavailable"),
      value: (row) => row.projectCostCodeId || "",
      setValue: (row, value) => ({ ...row, projectCostCodeId: String(value || "") || null }),
      render: (_value, row) => costCodes.find((costCode) => costCode.id === row.projectCostCodeId) ? formatCostCodeOptionLabel(costCodes.find((costCode) => costCode.id === row.projectCostCodeId)!) : row.projectCostCodeId ? "Current cost code unavailable" : "No cost code",
    },
    {
      key: "purchaseOrderLineId",
      header: "PO Line",
      kind: "select",
      minWidth: "19rem",
      editable: canManage && canReadProcurement,
      protected: !canReadProcurement,
      options: (row) => optionsForCurrentValue([{ value: "", label: "No formal PO link" }, ...procurementOptions], row.purchaseOrderLineId, "Current PO line unavailable"),
      value: (row) => row.purchaseOrderLineId || "",
      setValue: (row, value) => {
        const line = lineOptions.find((candidate) => candidate.line.id === value);
        return { ...row, purchaseOrderId: line?.purchaseOrder.id || null, purchaseOrderLineId: line?.line.id || null };
      },
      render: (_value, row) => !canReadProcurement
        ? row.purchaseOrderLineId ? "Procurement link (restricted)" : "No formal PO link"
        : procurementOptions.find((option) => option.value === row.purchaseOrderLineId)?.label || (row.purchaseOrderLineId ? "Current PO line unavailable" : "No formal PO link"),
    },
    {
      key: "status",
      header: "Status",
      kind: "select",
      align: "center",
      minWidth: "10rem",
      editable: canManage,
      options: statusOptions,
      value: (row) => row.status,
      setValue: (row, value) => ({ ...row, status: value as ProjectMaterialStatus }),
    },
    {
      key: "notes",
      header: "Notes",
      minWidth: "20rem",
      editable: canManage,
      value: (row) => row.notes || "",
      setValue: (row, value) => ({ ...row, notes: normalizedText(value) || null }),
    },
  ];
}

function equipmentColumns({ canManage }: Pick<EquipmentWorksheetProps, "canManage">): readonly WorksheetColumn<ProjectEquipmentWorksheetRow>[] {
  const sourceOptions = EQUIPMENT_SOURCES.map((source) => ({ value: source, label: source.replaceAll("_", " ") }));
  const statusOptions = EQUIPMENT_STATUSES.map((status) => ({ value: status, label: status.replaceAll("_", " ") }));
  return [
    {
      key: "assetReference",
      header: "Asset / Reference",
      minWidth: "13rem",
      frozen: true,
      editable: canManage,
      value: (row) => row.assetReference || "",
      setValue: (row, value) => ({ ...row, assetReference: normalizedText(value) || null }),
    },
    {
      key: "equipmentName",
      header: "Equipment Name",
      minWidth: "17rem",
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
      header: "Source",
      kind: "select",
      minWidth: "12rem",
      editable: canManage,
      options: sourceOptions,
      value: (row) => row.equipmentSource,
      setValue: (row, value) => ({ ...row, equipmentSource: value as ProjectEquipmentSource }),
    },
    {
      key: "providerName",
      header: "Provider / Vendor",
      minWidth: "15rem",
      editable: canManage,
      value: (row) => row.providerName || "",
      setValue: (row, value) => ({ ...row, providerName: normalizedText(value) || null }),
    },
    {
      key: "assignmentStart",
      header: "Project Start",
      kind: "date",
      minWidth: "12rem",
      editable: canManage,
      value: (row) => row.assignmentStart || "",
      setValue: (row, value) => ({ ...row, assignmentStart: String(value || "") || null }),
    },
    {
      key: "assignmentEnd",
      header: "Project End",
      kind: "date",
      minWidth: "12rem",
      editable: canManage,
      value: (row) => row.assignmentEnd || "",
      setValue: (row, value) => ({ ...row, assignmentEnd: String(value || "") || null }),
    },
    {
      key: "status",
      header: "Register Status",
      kind: "select",
      align: "center",
      minWidth: "13rem",
      editable: canManage,
      options: statusOptions,
      value: (row) => row.status,
      setValue: (row, value) => ({ ...row, status: value as ProjectEquipmentStatus }),
    },
    {
      key: "canonicalEquipmentId",
      header: "Canonical Identity",
      minWidth: "16rem",
      protected: true,
      editable: false,
      value: (row) => row.canonicalEquipmentId || "",
      render: (_value, row) => row.canonicalEquipmentId ? "Linked to Equipment Registry" : "Project register row",
    },
    {
      key: "notes",
      header: "Notes",
      minWidth: "20rem",
      editable: canManage,
      value: (row) => row.notes || "",
      setValue: (row, value) => ({ ...row, notes: normalizedText(value) || null }),
    },
  ];
}

function MaterialWorksheet({
  project,
  materials,
  costCodes,
  purchaseOrders,
  inventoryItems,
  canReadProcurement,
  canReadInventory,
  canManage,
  onClose,
  onSave,
  createNew,
  initialRowId,
}: MaterialsWorksheetProps) {
  const sourceRows = useMemo(() => materials.filter((row) => row.projectId === project.id).map(projectMaterialWorksheetRow), [materials, project.id]);
  const makeNewRow = useCallback(() => newMaterialWorksheetRow(project.id), [project.id]);
  const draft = useDraftWorksheetRows(sourceRows, makeNewRow, createNew);
  const columns = useMemo(() => materialColumns({ project, canManage, canReadProcurement, canReadInventory, costCodes, inventoryItems, purchaseOrders }), [canManage, canReadInventory, canReadProcurement, costCodes, inventoryItems, project, purchaseOrders]);
  const [cellIssues, setCellIssues] = useState<WorksheetCellIssueMap>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const initialRowIndex = Math.max(0, draft.draftRows.findIndex((row) => row.id === initialRowId));
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

  const handleSave = async (nextRows: readonly ProjectMaterialWorksheetRow[]) => {
    draft.handleRowsChange(nextRows);
    setSaveError(null);
    setSaveMessage(null);
    if (!draft.dirtyRowKeysRef.current.size) {
      setSaveMessage("No material changes are staged.");
      return;
    }
    const plan = buildProjectMaterialSavePlan(nextRows, draft.dirtyRowKeysRef.current, inventoryItems);
    if (!plan.valid) {
      setCellIssues(planIssuesToCellIssues(plan.issues));
      setSaveError("Fix the highlighted material validation errors before saving.");
      return;
    }
    setCellIssues({});
    setIsSaving(true);
    try {
      const result = await saveWorksheetRowsSequentially(plan.entries, async (entry) => onSave(entry.input));
      const failedRowKeys = new Set(result.failures.map((failure) => failure.rowKey));
      draft.clearDirty(failedRowKeys);
      setEditorRevision((value) => value + 1);
      if (result.failures.length) {
        setSaveError(`${result.savedRowKeys.length} material row${result.savedRowKeys.length === 1 ? "" : "s"} saved; ${result.failures.length} row${result.failures.length === 1 ? " remains" : "s remain"} staged because the save failed. ${result.failures[0].message}`);
        return;
      }
      setSaveMessage(`Saved ${result.savedRowKeys.length} material row${result.savedRowKeys.length === 1 ? "" : "s"}.`);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section data-worksheet-responsive-surface="project-materials" aria-label="Project materials worksheet" className="space-y-3">
      {saveError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{saveError}</p>}
      {saveMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{saveMessage}</p>}
      <WorksheetEditor
        key={`${editorRevision}-${draft.initialDraftRowId || "source"}`}
        ariaLabel="Project materials worksheet"
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
        saveLabel="Save materials"
        cancelLabel="Cancel"
        isSaving={isSaving}
        initialActiveCell={{ row: initialEditorRow, column: 0 }}
        initialEditingCell={initialDraftRowIndex >= 0 ? { row: initialDraftRowIndex, column: 0 } : undefined}
        emptyState="No project materials are registered. Add a row to stage a requirement."
        density="compact"
      />
    </section>
  );
}

function EquipmentWorksheet({
  project,
  equipment,
  canManage,
  onClose,
  onSave,
  createNew,
  initialRowId,
}: EquipmentWorksheetProps) {
  const sourceRows = useMemo(() => equipment.filter((row) => row.projectId === project.id).map(projectEquipmentWorksheetRow), [equipment, project.id]);
  const makeNewRow = useCallback(() => newEquipmentWorksheetRow(project.id), [project.id]);
  const draft = useDraftWorksheetRows(sourceRows, makeNewRow, createNew);
  const columns = useMemo(() => equipmentColumns({ canManage }), [canManage]);
  const [cellIssues, setCellIssues] = useState<WorksheetCellIssueMap>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const initialRowIndex = Math.max(0, draft.draftRows.findIndex((row) => row.id === initialRowId));
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

  const handleSave = async (nextRows: readonly ProjectEquipmentWorksheetRow[]) => {
    draft.handleRowsChange(nextRows);
    setSaveError(null);
    setSaveMessage(null);
    if (!draft.dirtyRowKeysRef.current.size) {
      setSaveMessage("No equipment changes are staged.");
      return;
    }
    const plan = buildProjectEquipmentSavePlan(nextRows, draft.dirtyRowKeysRef.current);
    if (!plan.valid) {
      setCellIssues(planIssuesToCellIssues(plan.issues));
      setSaveError("Fix the highlighted equipment validation errors before saving.");
      return;
    }
    setCellIssues({});
    setIsSaving(true);
    try {
      const result = await saveWorksheetRowsSequentially(plan.entries, async (entry) => onSave(entry.input));
      const failedRowKeys = new Set(result.failures.map((failure) => failure.rowKey));
      draft.clearDirty(failedRowKeys);
      setEditorRevision((value) => value + 1);
      if (result.failures.length) {
        setSaveError(`${result.savedRowKeys.length} equipment row${result.savedRowKeys.length === 1 ? "" : "s"} saved; ${result.failures.length} row${result.failures.length === 1 ? " remains" : "s remain"} staged because the save failed. ${result.failures[0].message}`);
        return;
      }
      setSaveMessage(`Saved ${result.savedRowKeys.length} equipment row${result.savedRowKeys.length === 1 ? "" : "s"}.`);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section data-worksheet-responsive-surface="project-equipment" aria-label="Project equipment worksheet" className="space-y-3">
      {saveError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{saveError}</p>}
      {saveMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{saveMessage}</p>}
      <WorksheetEditor
        key={`${editorRevision}-${draft.initialDraftRowId || "source"}`}
        ariaLabel="Project equipment worksheet"
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
        saveLabel="Save equipment"
        cancelLabel="Cancel"
        isSaving={isSaving}
        initialActiveCell={{ row: initialEditorRow, column: 0 }}
        initialEditingCell={initialDraftRowIndex >= 0 ? { row: initialDraftRowIndex, column: 0 } : undefined}
        emptyState="No project equipment is registered. Add a row to stage project metadata."
        density="compact"
      />
    </section>
  );
}

export interface ProjectMaterialsEquipmentWorksheetModalProps {
  kind: "material" | "equipment";
  project: Project;
  materials: readonly ProjectMaterial[];
  equipment: readonly ProjectEquipment[];
  costCodes: readonly ProjectCostCode[];
  purchaseOrders: readonly PurchaseOrder[];
  inventoryItems: readonly InventoryItem[];
  canReadProcurement: boolean;
  canReadInventory: boolean;
  canManage: boolean;
  initialRowId?: string;
  createNew?: boolean;
  onClose: () => void;
  onSaveMaterial: (input: ProjectMaterialSaveInput) => Promise<void>;
  onSaveEquipment: (input: ProjectEquipmentSaveInput) => Promise<void>;
}

export function ProjectMaterialsEquipmentWorksheetModal({
  kind,
  project,
  materials,
  equipment,
  costCodes,
  purchaseOrders,
  inventoryItems,
  canReadProcurement,
  canReadInventory,
  canManage,
  initialRowId,
  createNew = false,
  onClose,
  onSaveMaterial,
  onSaveEquipment,
}: ProjectMaterialsEquipmentWorksheetModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus({ open: true, onClose, initialFocusRef: closeButtonRef });
  const isMaterial = kind === "material";
  return (
    <div ref={dialogRef} data-project-materials-equipment-worksheet="true" className="fixed inset-0 z-[70] flex items-end justify-center overflow-hidden bg-slate-950/50 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="project-materials-equipment-worksheet-title">
      <section data-working-canvas="true" className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[96vw] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Project register metadata</p>
            <h2 id="project-materials-equipment-worksheet-title" className="mt-1 text-lg font-black text-slate-950">{createNew ? "Add" : "Edit"} project {isMaterial ? "materials" : "equipment"}</h2>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">Edit safe structured register fields in a worksheet. {isMaterial ? "PO receiving and warehouse on-hand remain protected; procurement/site evidence is derived outside this editor." : "Canonical Equipment Registry identity and assignment/transfer/return remain purpose-built; these dates are project-register metadata only."}</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label="Close project register worksheet"><X className="h-4 w-4" /></button>
        </div>
        <div data-dialog-scroll-container="project-materials-equipment" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
          {isMaterial ? (
            <MaterialWorksheet
              project={project}
              materials={materials}
              costCodes={costCodes}
              purchaseOrders={purchaseOrders}
              inventoryItems={inventoryItems}
              canReadProcurement={canReadProcurement}
              canReadInventory={canReadInventory}
              canManage={canManage}
              onClose={onClose}
              onSave={onSaveMaterial}
              createNew={createNew}
              initialRowId={initialRowId}
            />
          ) : (
            <EquipmentWorksheet
              project={project}
              equipment={equipment}
              canManage={canManage}
              onClose={onClose}
              onSave={onSaveEquipment}
              createNew={createNew}
              initialRowId={initialRowId}
            />
          )}
        </div>
      </section>
    </div>
  );
}

export default ProjectMaterialsEquipmentWorksheetModal;
