import { useCallback, useEffect, useRef, useState } from "react";
import type { WorksheetCellIssueMap } from "./WorksheetEditor.tsx";
import { getWorksheetCellId } from "./WorksheetEditor.tsx";

export interface WorksheetDraftRow {
  id: string;
  isNew?: boolean;
}

export interface WorksheetSaveFailure {
  rowKey: string;
  message: string;
}

export interface WorksheetPlanIssue {
  columnKey: string;
  message: string;
}

let draftRowSequence = 0;

export function newWorksheetDraftId(kind: string): string {
  draftRowSequence += 1;
  return `draft-${kind}-${Date.now()}-${draftRowSequence}`;
}

export function worksheetPlanIssuesToCellIssues(
  issues: Readonly<Record<string, readonly WorksheetPlanIssue[]>>,
): WorksheetCellIssueMap {
  const cellIssues: Record<string, { severity: "error"; message: string }> = {};
  for (const [rowKey, rowIssues] of Object.entries(issues)) {
    for (const issue of rowIssues) cellIssues[getWorksheetCellId(rowKey, issue.columnKey)] = { severity: "error", message: issue.message };
  }
  return cellIssues;
}

export function retainWorksheetDraftRowsAfterSave<T extends WorksheetDraftRow>(
  rows: readonly T[],
  remainingDirtyRowKeys: ReadonlySet<string>,
): readonly T[] {
  return rows.filter((row) => !row.isNew || remainingDirtyRowKeys.has(row.id));
}

export async function saveWorksheetRowsSequentially<TInput>(
  entries: readonly { rowKey: string; input: TInput }[],
  save: (entry: { rowKey: string; input: TInput }) => Promise<void>,
): Promise<{ savedRowKeys: readonly string[]; failures: readonly WorksheetSaveFailure[] }> {
  const savedRowKeys: string[] = [];
  const failures: WorksheetSaveFailure[] = [];
  for (const entry of entries) {
    try {
      await save(entry);
      savedRowKeys.push(entry.rowKey);
    } catch (error) {
      failures.push({
        rowKey: entry.rowKey,
        message: error instanceof Error ? error.message : "The row could not be saved.",
      });
    }
  }
  return { savedRowKeys, failures };
}

export function useWorksheetDraftRows<T extends WorksheetDraftRow>(
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
    const nextDraftRows = retainWorksheetDraftRowsAfterSave(draftRowsRef.current, nextRowKeys);
    if (nextDraftRows.length !== draftRowsRef.current.length) {
      draftRowsRef.current = nextDraftRows;
      setDraftRows(nextDraftRows);
    }
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
