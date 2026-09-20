import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  applyWorksheetCellEdit,
  applyWorksheetPaste,
  copyWorksheetTsv,
  formatWorksheetInputValue,
  getNextWorksheetCell,
  getWorksheetCellId,
  getWorksheetColumnValue,
  isWorksheetColumnEditable,
  isWorksheetColumnProtected,
  type WorksheetCellContext,
  type WorksheetCellIssue,
  type WorksheetCellPosition,
  type WorksheetColumn,
  type WorksheetNavigationKey,
  type WorksheetPasteResult,
} from "./worksheetEditorModel.ts";
import { WorksheetTabs, type WorksheetTab, type WorksheetTabsProps } from "./WorksheetTabs.tsx";

export * from "./worksheetEditorModel.ts";
export { WorksheetTabs } from "./WorksheetTabs.tsx";
export type { WorksheetTab, WorksheetTabsProps } from "./WorksheetTabs.tsx";

export type WorksheetCellState = "clean" | "selected" | "editing" | "dirty" | "warning" | "error" | "protected" | "conflict";
export type WorksheetCellIssueMap = Readonly<Record<string, WorksheetCellIssue | string>>;
export type WorksheetCellStateMap = Readonly<Record<string, WorksheetCellState>>;
export type WorksheetCellKeyCollection = ReadonlySet<string> | readonly string[];

export interface WorksheetEditorProps<T> {
  ariaLabel: string;
  rows: readonly T[];
  columns: readonly WorksheetColumn<T>[];
  rowKey: (row: T, rowIndex: number) => string;
  onRowsChange?: (rows: readonly T[]) => void;
  onCellChange?: (change: { row: T; rowIndex: number; column: WorksheetColumn<T>; value: unknown; source: "edit" | "paste" }) => void;
  cellIssues?: WorksheetCellIssueMap;
  conflicts?: WorksheetCellIssueMap;
  cellStates?: WorksheetCellStateMap;
  dirtyCells?: WorksheetCellKeyCollection;
  onAddRow?: () => T | void;
  canAddRow?: boolean;
  onRemoveRow?: (row: T, rowIndex: number) => void;
  canRemoveRow?: boolean | ((row: T, rowIndex: number) => boolean);
  toolbar?: React.ReactNode;
  actions?: React.ReactNode;
  onSave?: (rows: readonly T[]) => void | Promise<void>;
  onApply?: (rows: readonly T[]) => void | Promise<void>;
  onCancel?: () => void;
  saveLabel?: string;
  applyLabel?: string;
  cancelLabel?: string;
  isSaving?: boolean;
  disabled?: boolean;
  initialActiveCell?: WorksheetCellPosition;
  initialEditingCell?: WorksheetCellPosition;
  emptyState?: React.ReactNode;
  className?: string;
  density?: "compact" | "comfortable";
}

function issueValue(value: WorksheetCellIssue | string | undefined, defaultSeverity: WorksheetCellIssue["severity"] = "warning"): WorksheetCellIssue | undefined {
  if (!value) return undefined;
  return typeof value === "string" ? { severity: defaultSeverity, message: value } : value;
}

function collectionHas(collection: WorksheetCellKeyCollection | undefined, key: string): boolean {
  if (!collection) return false;
  return "has" in collection ? collection.has(key) : collection.includes(key);
}

function clampPosition(position: WorksheetCellPosition | undefined, rowCount: number, columnCount: number): WorksheetCellPosition {
  return {
    row: Math.max(0, Math.min(Math.max(0, rowCount - 1), position?.row || 0)),
    column: Math.max(0, Math.min(Math.max(0, columnCount - 1), position?.column || 0)),
  };
}

function alignClass(align: WorksheetColumn<unknown>["align"]): string {
  return align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
}

function defaultDisplayValue<T>(value: unknown, row: T, rowIndex: number, column: WorksheetColumn<T>): string {
  if (value === null || value === undefined || value === "") return "";
  if (column.kind === "select") {
    const options = typeof column.options === "function" ? column.options(row, rowIndex) : column.options || [];
    return options.find((option) => option.value === String(value))?.label || String(value);
  }
  if (column.kind === "currency") {
    const currency = typeof column.currency === "function" ? column.currency(row) : column.currency;
    if (currency) {
      try {
        return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
      } catch {
        return `${currency} ${String(value)}`;
      }
    }
  }
  return String(value);
}

const stateClasses: Record<WorksheetCellState, string> = {
  clean: "bg-white",
  selected: "bg-indigo-50/70 ring-1 ring-inset ring-indigo-300",
  editing: "bg-indigo-50 ring-2 ring-inset ring-indigo-500",
  dirty: "bg-amber-50",
  warning: "bg-amber-50 ring-1 ring-inset ring-amber-400",
  error: "bg-rose-50 ring-1 ring-inset ring-rose-500",
  protected: "bg-slate-50 text-slate-600",
  conflict: "bg-orange-50 ring-2 ring-inset ring-orange-500",
};

function renderIssue(issue: WorksheetCellIssue | undefined, id: string) {
  if (!issue) return null;
  return <span id={id} role={issue.severity === "error" ? "alert" : "status"} className={`mt-1 block text-[10px] font-bold leading-4 ${issue.severity === "error" ? "text-rose-700" : "text-amber-800"}`}>{issue.message}</span>;
}

export function WorksheetEditor<T>({
  ariaLabel,
  rows,
  columns,
  rowKey,
  onRowsChange,
  onCellChange,
  cellIssues,
  conflicts,
  cellStates,
  dirtyCells,
  onAddRow,
  canAddRow = Boolean(onAddRow),
  onRemoveRow,
  canRemoveRow = Boolean(onRemoveRow),
  toolbar,
  actions,
  onSave,
  onApply,
  onCancel,
  saveLabel = "Save",
  applyLabel = "Apply",
  cancelLabel = "Cancel",
  isSaving = false,
  disabled = false,
  initialActiveCell,
  initialEditingCell,
  emptyState = "No worksheet rows yet.",
  className = "",
  density = "compact",
}: WorksheetEditorProps<T>) {
  const initialEditingPosition = initialEditingCell && rows[initialEditingCell.row] && columns[initialEditingCell.column] && isWorksheetColumnEditable(columns[initialEditingCell.column], rows[initialEditingCell.row], initialEditingCell.row)
    ? initialEditingCell
    : null;
  const [draftRows, setDraftRows] = useState<readonly T[]>(() => rows.slice());
  const [activeCell, setActiveCell] = useState<WorksheetCellPosition>(() => clampPosition(initialActiveCell, rows.length, columns.length));
  const [editingCell, setEditingCell] = useState<WorksheetCellPosition | null>(initialEditingPosition);
  const [editorValue, setEditorValue] = useState(() => {
    const position = initialEditingPosition;
    const row = position ? rows[position.row] : undefined;
    const column = position ? columns[position.column] : undefined;
    return row && column ? formatWorksheetInputValue(getWorksheetColumnValue(row, column)) : "";
  });
  const [localIssues, setLocalIssues] = useState<Record<string, WorksheetCellIssue>>({});
  const [localDirtyCells, setLocalDirtyCells] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const sourceRowsRef = useRef(rows);
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>());
  const pendingActionRef = useRef<"save" | "apply" | null>(null);

  useEffect(() => {
    if (sourceRowsRef.current === rows) return;
    sourceRowsRef.current = rows;
    setDraftRows(rows.slice());
    setActiveCell((position) => clampPosition(position, rows.length, columns.length));
    setEditingCell(null);
    setEditorValue("");
    setLocalIssues({});
    setLocalDirtyCells(new Set());
  }, [columns.length, rows]);

  useEffect(() => {
    setActiveCell((position) => clampPosition(position, draftRows.length, columns.length));
  }, [columns.length, draftRows.length]);

  useEffect(() => {
    const row = draftRows[activeCell.row];
    const column = columns[activeCell.column];
    if (!row || !column) return;
    const key = getWorksheetCellId(rowKey(row, activeCell.row), column.key);
    const cell = cellRefs.current.get(key);
    if (!cell) return;
    const input = editingCell?.row === activeCell.row && editingCell.column === activeCell.column
      ? cell.querySelector<HTMLInputElement | HTMLSelectElement>("input, select")
      : null;
    if (input) {
      input.focus();
    } else {
      cell.focus();
    }
  }, [activeCell, columns.length, draftRows.length, editingCell]);

  const hasLocalDirty = localDirtyCells.size > 0;
  const hasExternalDirty = Boolean(dirtyCells && ("size" in dirtyCells ? dirtyCells.size : dirtyCells.length));
  const isDirty = hasLocalDirty || hasExternalDirty;
  const actionDisabled = disabled || isSaving;

  useEffect(() => {
    if (editingCell || !pendingActionRef.current) return;
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action === "save") void onSave?.(draftRows);
    if (action === "apply") void onApply?.(draftRows);
  }, [draftRows, editingCell, onApply, onSave]);

  const updateRows = (nextRows: readonly T[]) => {
    sourceRowsRef.current = nextRows;
    setDraftRows(nextRows);
    onRowsChange?.(nextRows);
  };

  const positionForCell = (rowIndex: number, columnIndex: number): WorksheetCellPosition => ({ row: rowIndex, column: columnIndex });

  const beginEditing = (position: WorksheetCellPosition) => {
    const row = draftRows[position.row];
    const column = columns[position.column];
    if (!row || !column || actionDisabled || !isWorksheetColumnEditable(column, row, position.row)) return;
    const key = getWorksheetCellId(rowKey(row, position.row), column.key);
    setActiveCell(position);
    setEditingCell(position);
    setEditorValue(formatWorksheetInputValue(getWorksheetColumnValue(row, column)));
    setLocalIssues((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setNotice(null);
  };

  const clearLocalIssue = (key: string) => {
    setLocalIssues((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const commitEditing = (navigationKey?: WorksheetNavigationKey, shiftKey = false): boolean => {
    if (!editingCell) return true;
    const row = draftRows[editingCell.row];
    const column = columns[editingCell.column];
    if (!row || !column) return false;
    const key = getWorksheetCellId(rowKey(row, editingCell.row), column.key);
    const result = applyWorksheetCellEdit(draftRows, columns, rowKey, editingCell.row, column.key, editorValue);
    if (result.issue) {
      setLocalIssues((current) => ({ ...current, [key]: result.issue as WorksheetCellIssue }));
      return false;
    }
    if (result.changed) {
      updateRows(result.rows);
      setLocalDirtyCells((current) => new Set(current).add(key));
      onCellChange?.({ row: result.rows[editingCell.row], rowIndex: editingCell.row, column, value: getWorksheetColumnValue(result.rows[editingCell.row], column), source: "edit" });
    }
    clearLocalIssue(key);
    if (result.warnings?.length) setLocalIssues((current) => ({ ...current, [key]: result.warnings![0] }));
    setEditingCell(null);
    setEditorValue("");
    if (navigationKey) {
      const next = getNextWorksheetCell(editingCell, navigationKey, draftRows.length, columns.length, shiftKey);
      if (next) setActiveCell(next);
    }
    return true;
  };

  const requestAction = (action: "save" | "apply", callback: ((rows: readonly T[]) => void | Promise<void>) | undefined) => {
    if (actionDisabled || !callback) return;
    if (editingCell) {
      pendingActionRef.current = action;
      if (!commitEditing()) pendingActionRef.current = null;
      return;
    }
    void callback(draftRows);
  };

  const cancelEditing = () => {
    if (!editingCell) return;
    const row = draftRows[editingCell.row];
    const column = columns[editingCell.column];
    if (row && column) clearLocalIssue(getWorksheetCellId(rowKey(row, editingCell.row), column.key));
    setEditingCell(null);
    setEditorValue("");
    setNotice(null);
  };

  const copyCell = (position: WorksheetCellPosition, clipboard?: DataTransfer) => {
    const row = draftRows[position.row];
    const column = columns[position.column];
    if (!row || !column) return;
    const value = getWorksheetColumnValue(row, column);
    const text = copyWorksheetTsv([[value]]);
    if (clipboard) {
      clipboard.setData("text/plain", text);
    } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => setNotice("Clipboard access was unavailable."));
    }
    setNotice("Copied cell value.");
  };

  const handlePasteResult = (result: WorksheetPasteResult<T>, start: WorksheetCellPosition) => {
    if (result.changes.length > 0) {
      updateRows(result.rows);
      setLocalDirtyCells((current) => {
        const next = new Set(current);
        for (const change of result.changes) next.add(getWorksheetCellId(change.rowKey, change.columnKey));
        return next;
      });
      for (const change of result.changes) clearLocalIssue(getWorksheetCellId(change.rowKey, change.columnKey));
      for (const change of result.changes) {
        const rowIndex = result.rows.findIndex((row, index) => rowKey(row, index) === change.rowKey);
        const columnIndex = columns.findIndex((column) => column.key === change.columnKey);
        const row = rowIndex >= 0 ? result.rows[rowIndex] : undefined;
        const column = columnIndex >= 0 ? columns[columnIndex] : undefined;
        if (row && column) onCellChange?.({ row, rowIndex, column, value: change.value, source: "paste" });
      }
    }
    for (const issue of result.issues) {
      const row = result.rows[issue.row];
      const column = columns[issue.column];
      if (!row || !column) continue;
      setLocalIssues((current) => ({
        ...current,
        [getWorksheetCellId(rowKey(row, issue.row), column.key)]: { severity: issue.severity, message: issue.message },
      }));
    }
    for (const rejection of result.rejected) {
      if (rejection.reason !== "validation") continue;
      const row = result.rows[rejection.row];
      const column = columns[rejection.column];
      if (!row || !column) continue;
      setLocalIssues((current) => ({
        ...current,
        [getWorksheetCellId(rowKey(row, rejection.row), column.key)]: { severity: "error", message: rejection.message },
      }));
    }
    if (result.rejected.length > 0) {
      setNotice(`${result.rejected.length} pasted value${result.rejected.length === 1 ? " was" : "s were"} rejected or skipped.`);
    } else if (result.changes.length > 0) {
      setNotice(`${result.changes.length} pasted value${result.changes.length === 1 ? " was" : "s were"} staged.`);
    }
    setEditingCell(null);
    setEditorValue("");
    setActiveCell(start);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTableCellElement>, position: WorksheetCellPosition) => {
    if (actionDisabled) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const result = applyWorksheetPaste(draftRows, columns, rowKey, position.row, position.column, text);
    handlePasteResult(result, position);
  };

  const handleCellKeyDown = (event: React.KeyboardEvent<HTMLTableCellElement>, position: WorksheetCellPosition) => {
    const row = draftRows[position.row];
    const column = columns[position.column];
    const isEditingActive = Boolean(row && column && editingCell?.row === position.row && editingCell.column === position.column && isWorksheetColumnEditable(column, row, position.row));
    if (isEditingActive) return;
    setActiveCell(position);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      copyCell(position);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      beginEditing(position);
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(event.key)) {
      const next = getNextWorksheetCell(position, event.key as WorksheetNavigationKey, draftRows.length, columns.length, event.shiftKey);
      if (!next && event.key === "Tab") return;
      event.preventDefault();
      if (next) setActiveCell(next);
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>, position: WorksheetCellPosition) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      if (event.key === "Tab") {
        const next = getNextWorksheetCell(position, "Tab", draftRows.length, columns.length, event.shiftKey);
        if (!next) {
          commitEditing();
          return;
        }
      }
      event.preventDefault();
      commitEditing(event.key as WorksheetNavigationKey, event.shiftKey);
    }
  };

  const handleAddRow = () => {
    if (actionDisabled || !canAddRow || !onAddRow) return;
    const newRowValue = onAddRow();
    if (newRowValue === undefined) return;
    const newRow = newRowValue as T;
    const nextRows = [...draftRows, newRow];
    updateRows(nextRows);
    setActiveCell({ row: nextRows.length - 1, column: 0 });
    setNotice("New row staged for editing.");
  };

  const handleRemoveRow = (row: T, rowIndex: number) => {
    const allowed = typeof canRemoveRow === "function" ? canRemoveRow(row, rowIndex) : canRemoveRow;
    if (actionDisabled || !onRemoveRow || !allowed) return;
    onRemoveRow(row, rowIndex);
    const nextRows = draftRows.filter((_, index) => index !== rowIndex);
    updateRows(nextRows);
    setActiveCell(clampPosition({ row: rowIndex, column: activeCell.column }, nextRows.length, columns.length));
    setNotice("Row removal staged for review.");
  };

  const rootDirty = isDirty ? "true" : "false";
  const frozenColumnIndex = useMemo(() => columns.findIndex((column) => column.frozen), [columns]);

  return (
    <section data-worksheet-editor="true" data-worksheet-dirty={rootDirty} className={`min-w-0 rounded-xl border border-slate-200 bg-white ${className}`} aria-label={ariaLabel}>
      <div className="flex min-w-0 flex-col gap-3 border-b border-slate-200 bg-slate-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-600">Worksheet</span>
          {isDirty && <span data-worksheet-unsaved="true" className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-900">Unsaved changes</span>}
          {notice && <span role="status" className="text-[11px] font-semibold text-slate-600">{notice}</span>}
          {toolbar}
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {actions}
          {onCancel && <button type="button" onClick={() => { pendingActionRef.current = null; updateRows(rows.slice()); setLocalDirtyCells(new Set()); setLocalIssues({}); setEditingCell(null); setEditorValue(""); onCancel(); }} disabled={actionDisabled} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">{cancelLabel}</button>}
          {onSave && <button type="button" onClick={() => requestAction("save", onSave)} disabled={actionDisabled} className="inline-flex min-h-9 items-center rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-black text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50">{saveLabel}</button>}
          {onApply && <button type="button" onClick={() => requestAction("apply", onApply)} disabled={actionDisabled} className="inline-flex min-h-9 items-center rounded-lg bg-indigo-700 px-2.5 py-1.5 text-xs font-black text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50">{applyLabel}</button>}
          {onAddRow && <button type="button" data-worksheet-add-row="true" onClick={handleAddRow} disabled={actionDisabled || !canAddRow} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Add row</button>}
        </div>
      </div>
      <div data-worksheet-scroll-container="true" className="min-w-0 max-h-[min(70vh,52rem)] overflow-x-auto overflow-y-auto">
        <table role="grid" aria-label={ariaLabel} aria-rowcount={draftRows.length + 1} className="min-w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr role="row">
              {columns.map((column, columnIndex) => (
                <th
                  key={column.key}
                  role="columnheader"
                  scope="col"
                  aria-colindex={columnIndex + 1}
                  className={`whitespace-nowrap px-3 ${density === "compact" ? "py-2" : "py-3"} ${alignClass(column.align)} ${columnIndex === frozenColumnIndex ? "sticky left-0 z-30 bg-slate-50" : ""}`}
                  style={{ width: column.width, minWidth: column.minWidth }}
                >
                  {column.header}
                </th>
              ))}
              {onRemoveRow && <th role="columnheader" scope="col" className="whitespace-nowrap px-3 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {draftRows.length === 0 && <tr role="row"><td role="gridcell" colSpan={columns.length + (onRemoveRow ? 1 : 0)} className="p-6 text-center text-xs text-slate-500">{emptyState}</td></tr>}
            {draftRows.map((row, rowIndex) => {
              const currentRowKey = rowKey(row, rowIndex);
              return (
                <tr key={currentRowKey} role="row" aria-rowindex={rowIndex + 2} data-worksheet-row-key={currentRowKey} className="border-b border-slate-100">
                  {columns.map((column, columnIndex) => {
                    const position = positionForCell(rowIndex, columnIndex);
                    const key = getWorksheetCellId(currentRowKey, column.key);
                    const protectedCell = isWorksheetColumnProtected(column, row, rowIndex);
                    const editableCell = isWorksheetColumnEditable(column, row, rowIndex);
                    const readOnlyCell = !editableCell;
                    const isEditing = editingCell?.row === rowIndex && editingCell.column === columnIndex && editableCell;
                    const externalIssue = issueValue(cellIssues?.[key], "error");
                    const conflict = issueValue(conflicts?.[key], "warning");
                    const issue = localIssues[key] || externalIssue;
                    const suppliedState = cellStates?.[key];
                    const state: WorksheetCellState = conflict ? "conflict" : issue?.severity === "error" ? "error" : issue?.severity === "warning" ? "warning" : readOnlyCell ? "protected" : isEditing ? "editing" : suppliedState || (collectionHas(dirtyCells, key) || localDirtyCells.has(key) ? "dirty" : activeCell.row === rowIndex && activeCell.column === columnIndex ? "selected" : "clean");
                    const describedBy = issue || conflict ? `${key.replace(/[^a-zA-Z0-9_-]/g, "-")}-message` : undefined;
                    const context: WorksheetCellContext<T> = { row, rowIndex, rowKey: currentRowKey, column, columnIndex, source: "edit" };
                    const displayValue = getWorksheetColumnValue(row, column);
                    const options = typeof column.options === "function" ? column.options(row, rowIndex) : column.options || [];
                    return (
                      <td
                        key={column.key}
                        ref={(node) => { if (node) cellRefs.current.set(key, node); else cellRefs.current.delete(key); }}
                        role="gridcell"
                        aria-colindex={columnIndex + 1}
                        aria-readonly={!editableCell || undefined}
                        aria-selected={activeCell.row === rowIndex && activeCell.column === columnIndex}
                        aria-describedby={describedBy}
                        tabIndex={activeCell.row === rowIndex && activeCell.column === columnIndex && !isEditing ? 0 : -1}
                        data-worksheet-cell={key}
                        data-worksheet-editable={editableCell ? "true" : "false"}
                        data-worksheet-protected={protectedCell ? "true" : "false"}
                        data-worksheet-readonly={readOnlyCell ? "true" : "false"}
                        data-worksheet-state={state}
                        title={readOnlyCell ? protectedCell ? "Protected field: cannot be edited" : "Read-only field: cannot be edited" : undefined}
                        onFocus={() => setActiveCell(position)}
                        onClick={() => setActiveCell(position)}
                        onDoubleClick={() => beginEditing(position)}
                        onCopy={(event) => { if (event.target !== event.currentTarget) return; event.preventDefault(); copyCell(position, event.clipboardData); }}
                        onPaste={(event) => handlePaste(event, position)}
                        onKeyDown={(event) => handleCellKeyDown(event, position)}
                        className={`relative whitespace-nowrap px-3 align-top ${density === "compact" ? "py-2" : "py-3"} ${alignClass(column.align)} ${stateClasses[state]} ${columnIndex === frozenColumnIndex ? "sticky left-0 z-10" : ""}`}
                        style={{ width: column.width, minWidth: column.minWidth }}
                      >
                        {isEditing ? (
                          column.kind === "select" ? (
                            <select autoFocus value={editorValue} onChange={(event) => setEditorValue(event.currentTarget.value)} onBlur={() => commitEditing()} onKeyDown={(event) => handleInputKeyDown(event, position)} aria-label={`${column.header}, row ${rowIndex + 1}`} aria-invalid={issue?.severity === "error" || undefined} aria-describedby={describedBy} disabled={actionDisabled} className="w-full min-w-[8rem] rounded-md border border-indigo-400 bg-white px-2 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-200"><option value="">Select…</option>{options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select>
                          ) : (
                            <input autoFocus type={column.kind === "number" || column.kind === "currency" ? "text" : column.kind === "date" ? "date" : "text"} value={editorValue} onChange={(event) => setEditorValue(event.currentTarget.value)} onBlur={() => commitEditing()} onKeyDown={(event) => handleInputKeyDown(event, position)} aria-label={`${column.header}, row ${rowIndex + 1}`} aria-invalid={issue?.severity === "error" || undefined} aria-describedby={describedBy} placeholder={column.placeholder} disabled={actionDisabled} className="w-full min-w-[8rem] rounded-md border border-indigo-400 bg-white px-2 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-200" />
                          )
                        ) : (
                          <span className="block min-h-5">
                            {column.render ? column.render(displayValue, row, context) : column.format ? column.format(displayValue, row) : defaultDisplayValue(displayValue, row, rowIndex, column)}
                            {readOnlyCell && <span className="ml-2 inline-flex rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-600">{protectedCell ? "Protected" : "Read-only"}</span>}
                          </span>
                        )}
                        {conflict && renderIssue(conflict, describedBy || `${key}-conflict-message`)}
                        {!conflict && renderIssue(issue, describedBy || `${key}-message`)}
                      </td>
                    );
                  })}
                  {onRemoveRow && <td role="gridcell" className="whitespace-nowrap px-3 py-2 text-right"><button type="button" data-worksheet-remove-row={currentRowKey} onClick={() => handleRemoveRow(row, rowIndex)} disabled={actionDisabled || !(typeof canRemoveRow === "function" ? canRemoveRow(row, rowIndex) : canRemoveRow)} className="inline-flex min-h-8 items-center rounded-md border border-rose-200 bg-white px-2 py-1 text-[10px] font-black text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">Remove row {rowIndex + 1}</button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
