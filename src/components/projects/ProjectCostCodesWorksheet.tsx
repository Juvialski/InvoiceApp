import React, { useEffect, useMemo, useRef, useState } from "react";
import { Archive, RefreshCw } from "lucide-react";
import type { Project, ProjectCostCode } from "../../types.ts";
import { validateProjectCostCodeInput } from "../../lib/projectCostCodes.ts";
import type { CostCodeFinancialSummary } from "../../utils/projectCosting.ts";
import {
  getWorksheetCellId,
  WorksheetEditor,
  type WorksheetCellIssueMap,
  type WorksheetColumn,
} from "../ui/WorksheetEditor.tsx";
import { StatusBadge, type StatusTone } from "../ui/OperationsUI.tsx";

export interface ProjectCostCodeWorksheetRow {
  id: string;
  updatedAt: string;
  projectId: string;
  code: string;
  name: string;
  description?: string;
  approvedBudgetAmount: number;
  forecastAmount?: number;
  status: ProjectCostCode["status"];
  costCodeId: string;
  currency: string;
  actualCost: number;
  committedCost: number | null;
  actualVariance: number;
  forecastVariance: number | null;
  budgetUsedPercent: number;
  foreignCosts: Record<string, number>;
  hasForeignAmounts: boolean;
  isNew?: boolean;
}

export interface ProjectCostCodeSaveInput {
  id?: string;
  updatedAt?: string;
  projectId: string;
  code: string;
  name: string;
  description?: string;
  approvedBudgetAmount: number;
  forecastAmount?: number;
  status: ProjectCostCode["status"];
}

export interface ProjectCostCodeSavePlanEntry {
  rowKey: string;
  input: ProjectCostCodeSaveInput;
}

export interface ProjectCostCodeSavePlan {
  valid: boolean;
  entries: readonly ProjectCostCodeSavePlanEntry[];
  issues: Readonly<Record<string, readonly string[]>>;
}

export function projectCostCodeWorksheetRow(
  costCode: ProjectCostCode,
  summary: CostCodeFinancialSummary,
): ProjectCostCodeWorksheetRow {
  return {
    id: costCode.id,
    updatedAt: costCode.updatedAt,
    projectId: costCode.projectId,
    code: costCode.code,
    name: costCode.name,
    description: costCode.description,
    approvedBudgetAmount: costCode.approvedBudgetAmount,
    forecastAmount: costCode.forecastAmount,
    status: costCode.status,
    costCodeId: summary.costCodeId,
    currency: summary.currency,
    actualCost: summary.actualCost,
    committedCost: summary.committedCost,
    actualVariance: summary.actualVariance,
    forecastVariance: summary.forecastVariance,
    budgetUsedPercent: summary.budgetUsedPercent,
    foreignCosts: summary.foreignCosts,
    hasForeignAmounts: summary.hasForeignAmounts,
  };
}

function asProjectCostCode(row: ProjectCostCodeWorksheetRow): ProjectCostCode {
  return {
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    name: row.name,
    description: row.description,
    status: row.status,
    approvedBudgetAmount: row.approvedBudgetAmount,
    forecastAmount: row.forecastAmount,
    createdAt: "",
    updatedAt: row.updatedAt,
  };
}

function saveInput(row: ProjectCostCodeWorksheetRow): ProjectCostCodeSaveInput {
  const forecastAmount = row.forecastAmount == null
    ? undefined
    : Math.max(0, Number(row.forecastAmount));
  return {
    ...(row.isNew ? {} : { id: row.id, updatedAt: row.updatedAt }),
    projectId: row.projectId,
    code: row.code.trim().toUpperCase(),
    name: row.name.trim(),
    description: row.description?.trim() || undefined,
    approvedBudgetAmount: Math.max(0, Number(row.approvedBudgetAmount) || 0),
    forecastAmount,
    status: row.status,
  };
}

export function buildProjectCostCodeSavePlan(
  rows: readonly ProjectCostCodeWorksheetRow[],
  dirtyRowKeys: ReadonlySet<string>,
  existingCodes: readonly ProjectCostCode[],
  projectBudget: number,
): ProjectCostCodeSavePlan {
  const stagedRows = rows.filter((row) => dirtyRowKeys.has(row.id));
  const stagedById = new Map(stagedRows.filter((row) => !row.isNew).map((row) => [row.id, row]));
  const stagedCodes = existingCodes.map((code) => {
    const staged = stagedById.get(code.id);
    return staged ? asProjectCostCode(staged) : code;
  });
  stagedCodes.push(...stagedRows.filter((row) => row.isNew).map(asProjectCostCode));

  const entries: ProjectCostCodeSavePlanEntry[] = [];
  const issues: Record<string, readonly string[]> = {};
  for (const row of stagedRows) {
    const validation = validateProjectCostCodeInput(
      {
        id: row.id,
        projectId: row.projectId,
        code: row.code,
        name: row.name,
        approvedBudgetAmount: row.approvedBudgetAmount,
        forecastAmount: row.forecastAmount,
        status: row.status,
      },
      stagedCodes,
      projectBudget,
    );
    if (!validation.valid) {
      issues[row.id] = validation.issues;
      continue;
    }
    entries.push({ rowKey: row.id, input: saveInput(row) });
  }

  return { valid: Object.keys(issues).length === 0, entries, issues };
}

function money(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

function statusTone(status: string): StatusTone {
  return status === "ACTIVE" ? "success" : "neutral";
}

let draftRowSequence = 0;

function newWorksheetRow(project: Project): ProjectCostCodeWorksheetRow {
  draftRowSequence += 1;
  const id = `draft-cost-code-${Date.now()}-${draftRowSequence}`;
  return {
    id,
    updatedAt: "",
    projectId: project.id,
    code: "",
    name: "",
    description: "",
    approvedBudgetAmount: 0,
    forecastAmount: undefined,
    status: "ACTIVE",
    costCodeId: id,
    currency: project.currency,
    actualCost: 0,
    committedCost: null,
    actualVariance: 0,
    forecastVariance: null,
    budgetUsedPercent: 0,
    foreignCosts: {},
    hasForeignAmounts: false,
    isNew: true,
  };
}

export interface ProjectCostCodesWorksheetProps {
  project: Project;
  rows: readonly ProjectCostCodeWorksheetRow[];
  existingCodes: readonly ProjectCostCode[];
  canManageProject: boolean;
  onSaveCostCode: (costCode: ProjectCostCodeSaveInput) => Promise<void> | void;
  onArchiveCostCode: (costCodeId: string) => Promise<void> | void;
  onReactivateCostCode: (costCodeId: string) => Promise<void> | void;
}

export function ProjectCostCodesWorksheet({
  project,
  rows,
  existingCodes,
  canManageProject,
  onSaveCostCode,
  onArchiveCostCode,
  onReactivateCostCode,
}: ProjectCostCodesWorksheetProps) {
  const sourceRows = useMemo(() => rows.slice(), [rows]);
  const [draftRows, setDraftRows] = useState<readonly ProjectCostCodeWorksheetRow[]>(sourceRows);
  const draftRowsRef = useRef<readonly ProjectCostCodeWorksheetRow[]>(sourceRows);
  const dirtyRowKeysRef = useRef(new Set<string>());
  const [dirtyRowKeys, setDirtyRowKeys] = useState<ReadonlySet<string>>(new Set());
  const [dirtyCellKeys, setDirtyCellKeys] = useState<ReadonlySet<string>>(new Set());
  const [cellIssues, setCellIssues] = useState<WorksheetCellIssueMap>({});
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);

  useEffect(() => {
    const currentById = new Map(draftRowsRef.current.map((row) => [row.id, row]));
    const sourceIds = new Set(sourceRows.map((row) => row.id));
    const merged = sourceRows.map((row) => dirtyRowKeysRef.current.has(row.id) ? currentById.get(row.id) || row : row);
    const stagedExtras = draftRowsRef.current.filter((row) => dirtyRowKeysRef.current.has(row.id) && !sourceIds.has(row.id));
    const nextRows = [...merged, ...stagedExtras];
    draftRowsRef.current = nextRows;
    setDraftRows(nextRows);
  }, [sourceRows]);

  const markDirty = (rowKey: string, cellKey?: string) => {
    const nextRows = new Set(dirtyRowKeysRef.current).add(rowKey);
    dirtyRowKeysRef.current = nextRows;
    setDirtyRowKeys(nextRows);
    if (cellKey) setDirtyCellKeys((current) => new Set(current).add(cellKey));
  };

  const handleRowsChange = (nextRows: readonly ProjectCostCodeWorksheetRow[]) => {
    draftRowsRef.current = nextRows;
    setDraftRows(nextRows);
  };

  const handleArchive = async (costCodeId: string) => {
    if (typeof window !== "undefined" && !window.confirm("Archive this cost code? Historical actual costs will be preserved.")) return;
    setActionLoadingId(costCodeId);
    try {
      await onArchiveCostCode(costCodeId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReactivate = async (costCodeId: string) => {
    setActionLoadingId(costCodeId);
    try {
      await onReactivateCostCode(costCodeId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const columns = useMemo<readonly WorksheetColumn<ProjectCostCodeWorksheetRow>[]>(() => [
    {
      key: "code",
      header: "Code",
      minWidth: "10rem",
      frozen: true,
      editable: canManageProject,
      value: (row) => row.code,
      parse: (raw) => raw.trim().toUpperCase(),
      setValue: (row, value) => ({ ...row, code: String(value ?? "").toUpperCase() }),
      validate: (value) => String(value ?? "").trim() ? undefined : "Cost code is required.",
    },
    {
      key: "name",
      header: "Work Package",
      minWidth: "16rem",
      editable: canManageProject,
      value: (row) => row.name,
      setValue: (row, value) => ({ ...row, name: String(value ?? "") }),
      validate: (value) => String(value ?? "").trim() ? undefined : "Cost code name / work package is required.",
    },
    {
      key: "description",
      header: "Description",
      minWidth: "20rem",
      editable: canManageProject,
      value: (row) => row.description || "",
      setValue: (row, value) => ({ ...row, description: String(value ?? "") }),
    },
    {
      key: "approvedBudgetAmount",
      header: "Approved Budget",
      kind: "currency",
      align: "right",
      minWidth: "13rem",
      editable: canManageProject,
      currency: () => project.currency,
      value: (row) => row.approvedBudgetAmount,
      setValue: (row, value) => ({ ...row, approvedBudgetAmount: Number(value ?? 0) }),
      validate: (value) => Number.isFinite(Number(value ?? 0)) && Number(value ?? 0) >= 0 ? undefined : "Approved budget must be a non-negative number.",
    },
    {
      key: "forecastAmount",
      header: "Forecast Amount",
      kind: "currency",
      align: "right",
      minWidth: "13rem",
      editable: canManageProject,
      currency: () => project.currency,
      value: (row) => row.forecastAmount ?? "",
      setValue: (row, value) => ({ ...row, forecastAmount: value == null || value === "" ? undefined : Number(value) }),
      validate: (value) => value == null || value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0) ? undefined : "Forecast amount must be non-negative when set.",
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      protected: true,
      editable: false,
      value: (row) => row.status,
      render: (value, row) => row.isNew ? <span className="italic text-slate-400">Pending save</span> : <StatusBadge tone={statusTone(String(value))}>{String(value)}</StatusBadge>,
    },
    {
      key: "actualCost",
      header: "Actual Cost",
      protected: true,
      editable: false,
      align: "right",
      minWidth: "12rem",
      value: (row) => row.actualCost,
      render: (value, row) => row.isNew ? <span className="italic text-slate-400">Pending save</span> : money(Number(value), project.currency),
    },
    {
      key: "committedCost",
      header: "Committed Cost",
      protected: true,
      editable: false,
      align: "right",
      minWidth: "13rem",
      value: (row) => row.committedCost,
      render: (value, row) => row.isNew ? <span className="italic text-slate-400">Pending save</span> : value == null ? "—" : money(Number(value), project.currency),
    },
    {
      key: "actualVariance",
      header: "Actual Variance",
      protected: true,
      editable: false,
      align: "right",
      minWidth: "13rem",
      value: (row) => row.actualVariance,
      render: (value, row) => row.isNew || row.hasForeignAmounts ? <span className="italic text-slate-400">{row.isNew ? "Pending save" : "Unavailable"}</span> : <span className={Number(value) >= 0 ? "text-emerald-700" : "text-rose-600"}>{Number(value) >= 0 ? "+" : ""}{money(Number(value), project.currency)}</span>,
    },
    {
      key: "forecastVariance",
      header: "Forecast Variance",
      protected: true,
      editable: false,
      align: "right",
      minWidth: "14rem",
      value: (row) => row.forecastVariance,
      render: (value, row) => row.isNew ? <span className="italic text-slate-400">Pending save</span> : value == null ? <span className="italic text-slate-400">Not set</span> : <span className={Number(value) >= 0 ? "text-emerald-700" : "text-rose-600"}>{Number(value) >= 0 ? "+" : ""}{money(Number(value), project.currency)}</span>,
    },
    {
      key: "lifecycle",
      header: "Lifecycle",
      protected: true,
      editable: false,
      minWidth: "13rem",
      value: () => "",
      render: (_value, row) => {
        if (!canManageProject || row.isNew) return <span className="text-[10px] italic text-slate-400">Available after save</span>;
        const loading = actionLoadingId === row.id;
        return (
          <div className="flex items-center gap-1">
            {row.status === "ARCHIVED" ? (
              <button type="button" onClick={() => void handleReactivate(row.id)} disabled={loading} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-[10px] font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-50" aria-label={`Reactivate cost code ${row.code}`}><RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />Reactivate</button>
            ) : (
              <button type="button" onClick={() => void handleArchive(row.id)} disabled={loading} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-[10px] font-black text-rose-700 hover:bg-rose-50 disabled:opacity-50" aria-label={`Archive cost code ${row.code}`}><Archive className="h-3 w-3" />Archive</button>
            )}
          </div>
        );
      },
    },
  ], [actionLoadingId, canManageProject, handleArchive, handleReactivate, project.currency, project.id]);

  const handleAddRow = () => {
    const row = newWorksheetRow(project);
    markDirty(row.id);
    return row;
  };

  const handleSave = async (nextRows: readonly ProjectCostCodeWorksheetRow[]) => {
    draftRowsRef.current = nextRows;
    setDraftRows(nextRows);
    setSaveError(null);
    setSaveMessage(null);
    if (!dirtyRowKeysRef.current.size) {
      setSaveMessage("No cost-code changes are staged.");
      return;
    }

    const plan = buildProjectCostCodeSavePlan(nextRows, dirtyRowKeysRef.current, existingCodes, project.projectBudget);
    if (!plan.valid) {
      const issues: Record<string, { severity: "error"; message: string }> = {};
      for (const [rowKey, messages] of Object.entries(plan.issues)) {
        issues[getWorksheetCellId(rowKey, "code")] = { severity: "error", message: messages.join(" ") };
      }
      setCellIssues(issues);
      setSaveError("Fix the highlighted cost-code validation errors before saving.");
      return;
    }

    setCellIssues({});
    setIsSaving(true);
    const failedRowKeys = new Set(dirtyRowKeysRef.current);
    const failures: string[] = [];
    let savedCount = 0;
    try {
      for (const entry of plan.entries) {
        try {
          await onSaveCostCode(entry.input);
          failedRowKeys.delete(entry.rowKey);
          savedCount += 1;
        } catch (error) {
          failures.push(error instanceof Error ? error.message : `Could not save ${entry.input.code || entry.rowKey}.`);
        }
      }
    } finally {
      dirtyRowKeysRef.current = failedRowKeys;
      setDirtyRowKeys(new Set(failedRowKeys));
      setDirtyCellKeys((current) => new Set([...current].filter((key) => failedRowKeys.has(key.split(":")[0]))));
      setEditorRevision((value) => value + 1);
      setIsSaving(false);
    }

    if (failures.length > 0) {
      setSaveError(`${savedCount} cost-code row${savedCount === 1 ? "" : "s"} saved; ${failures.length} row${failures.length === 1 ? " remains" : "s remain"} staged because the save failed. ${failures[0]}`);
      return;
    }
    setSaveMessage(`Saved ${savedCount} cost-code row${savedCount === 1 ? "" : "s"}.`);
  };

  return (
    <section data-cost-code-save-plan="true" data-worksheet-responsive-surface="cost-codes" aria-label="Project cost code worksheet" className="space-y-3">
      {(saveError || saveMessage) && <p role={saveError ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${saveError ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{saveError || saveMessage}</p>}
      <WorksheetEditor
        key={editorRevision}
        ariaLabel="Project cost codes worksheet"
        rows={draftRows}
        columns={columns}
        rowKey={(row) => row.id}
        onRowsChange={handleRowsChange}
        onCellChange={({ row, column }) => {
          const cellKey = getWorksheetCellId(row.id, column.key);
          markDirty(row.id, cellKey);
          setCellIssues((current) => {
            if (!current[cellKey]) return current;
            const next = { ...current };
            delete next[cellKey];
            return next;
          });
        }}
        cellIssues={cellIssues}
        dirtyCells={dirtyCellKeys}
        onAddRow={handleAddRow}
        canAddRow={canManageProject}
        onSave={canManageProject ? handleSave : undefined}
        saveLabel="Save cost codes"
        isSaving={isSaving}
        emptyState="No cost codes match the current filter. Add a row to stage a new work package."
        density="compact"
      />
    </section>
  );
}

export default ProjectCostCodesWorksheet;
