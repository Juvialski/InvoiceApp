import React, { useEffect, useMemo, useRef, useState } from "react";
import { WorksheetEditor, getWorksheetCellId, type WorksheetColumn, type WorksheetCellIssueMap } from "../../components/ui/WorksheetEditor.tsx";
import { useDialogFocus } from "../../components/ui/useDialogFocus.ts";

export interface WorkbookStagedRow { id: string; isNew?: boolean }
export interface WorkbookRowIssue { rowId: string; field: string; message: string }

/** Successful rows leave the pending map immediately, even when a later row fails. */
export async function applyWorkbookRecordRows<T extends WorkbookStagedRow>(
  rows: readonly T[], save: (row: T) => Promise<unknown>,
  isCurrent: () => boolean, onSaved: (row: T) => void,
) {
  const failures: WorkbookRowIssue[] = [];
  let saved = 0;
  for (const row of rows) {
    if (!isCurrent()) break;
    try {
      await save(row);
      onSaved(row);
      saved += 1;
    } catch (error) {
      failures.push({ rowId: row.id, field: "", message: error instanceof Error ? error.message : "This row could not be saved." });
    }
  }
  return { saved, failures };
}

export function WorkbookRecordSheet<T extends WorkbookStagedRow>({
  label, sourceRows, columns, makeRow, validate, save, onDirtyChange, actions, disabled = false,
}: {
  label: string; sourceRows: readonly T[]; columns: readonly WorksheetColumn<T>[];
  makeRow?: () => T; validate: (rows: readonly T[], pending: readonly T[]) => readonly WorkbookRowIssue[];
  save?: (row: T, isCurrent: () => boolean) => Promise<unknown>; onDirtyChange: (dirty: boolean, busy?: boolean) => void;
  actions?: React.ReactNode; disabled?: boolean;
}) {
  const [pending, setPending] = useState<ReadonlyMap<string, T>>(new Map());
  const [query, setQuery] = useState("");
  const [issues, setIssues] = useState<WorksheetCellIssueMap>({});
  const [review, setReview] = useState<readonly T[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const alive = useRef(true);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onDirtyChange(pending.size > 0, saving); }, [pending, saving, onDirtyChange]);
  // Company/permission context changes remount this component in the parent.
  const rows = useMemo(() => {
    const ids = new Set(sourceRows.map((row) => row.id));
    return [...sourceRows.map((row) => pending.get(row.id) || row), ...[...pending.values()].filter((row) => !ids.has(row.id))];
  }, [sourceRows, pending]);
  const visibleRows = useMemo(() => rows.filter((row) => pending.has(row.id) || !query.trim()
    || columns.some((column) => String(column.value?.(row) ?? "").toLowerCase().includes(query.trim().toLowerCase()))), [rows, query, columns, pending]);
  const dirtyCells = useMemo(() => new Set([...pending.keys()].flatMap((id) => columns.map((column) => getWorksheetCellId(id, column.key)))), [pending, columns]);
  const closeReview = () => { if (!saving) setReview(null); };

  const requestSave = () => {
    const proposals = [...pending.values()];
    const errors = validate(rows, proposals);
    setIssues(Object.fromEntries(errors.map((issue) => [getWorksheetCellId(issue.rowId, issue.field || columns[0].key), issue.message])));
    if (errors.length) { setMessage("Fix the highlighted values before saving."); return; }
    if (!proposals.length) { setMessage("No changes to save."); return; }
    setReview(proposals);
  };
  const confirm = async () => {
    if (!review || !saveRef.current || saving || disabled) return;
    const errors = validate(rows, review);
    if (errors.length) { setReview(null); setMessage(errors[0].message); return; }
    setSaving(true);
    const result = await applyWorkbookRecordRows(review, (row) => {
      if (!saveRef.current) throw new Error("Your access changed. Reload before saving.");
      return saveRef.current(row, () => alive.current && Boolean(saveRef.current));
    }, () => alive.current && Boolean(saveRef.current), (row) => {
      if (!alive.current) return;
      setPending((current) => { const next = new Map(current); next.delete(row.id); return next; });
    });
    if (!alive.current) return;
    setIssues(Object.fromEntries(result.failures.map((issue) => [getWorksheetCellId(issue.rowId, columns[0].key), issue.message])));
    setMessage(result.failures.length
      ? `${result.saved} saved; ${result.failures.length} still unsaved. ${result.failures[0].message}`
      : `${result.saved} row${result.saved === 1 ? "" : "s"} saved.`);
    setReview(null);
    setSaving(false);
    setRevision((value) => value + 1);
  };
  return <div className="flex h-full min-h-0 min-w-0 flex-col" data-workbook-record-sheet={label}>
    <div className="hqs-border flex flex-wrap items-center gap-3 border-b px-3 py-2">
      <input type="search" aria-label={`Search ${label}`} value={query} disabled={pending.size > 0 || saving || disabled} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}…`} className="hqs-control hqs-primary-text min-h-10 w-full rounded-md border px-3 text-sm disabled:opacity-60 sm:w-64" />
      <span className="hqs-secondary-text text-sm">{disabled ? "Loading records…" : `${rows.length} records`}</span>
      {pending.size > 0 && <span role="status" className="hqs-warning-text text-sm font-semibold">{pending.size} unsaved row{pending.size === 1 ? "" : "s"}</span>}
      <div className="ml-auto flex flex-wrap gap-2">{actions}</div>
    </div>
    {message && <p role={Object.keys(issues).length ? "alert" : "status"} className="hqs-primary-text border-b px-3 py-2 text-sm">{message}</p>}
    <WorksheetEditor key={revision} ariaLabel={`${label} worksheet`} rows={disabled ? [] : visibleRows} columns={columns} rowKey={(row) => row.id}
      fillHeight showRowNumbers preserveEditingOnRowsChange mobileSummaryColumns={3} density="compact" className="min-h-0 flex-1" disabled={disabled} isSaving={saving}
      dirtyCells={dirtyCells} cellIssues={issues} actions={undefined}
      onCellChange={({ row }) => { setPending((current) => new Map(current).set(row.id, row)); setIssues({}); setMessage(""); }}
      onAddRow={makeRow ? () => { const row = makeRow(); setPending((current) => new Map(current).set(row.id, row)); setIssues({}); return row; } : undefined}
      onRemoveRow={makeRow ? (row) => setPending((current) => { const next = new Map(current); next.delete(row.id); return next; }) : undefined}
      canRemoveRow={(row) => Boolean(row.isNew)} hideUnavailableRemoveRowAction
      onSave={save ? requestSave : undefined} saveLabel="Save changes"
      onCancel={save ? () => { setPending(new Map()); setIssues({}); setMessage(""); setRevision((value) => value + 1); } : undefined}
      cancelLabel="Discard edits" emptyState={disabled ? "Loading worksheet records…" : `No ${label.toLowerCase()} found.`} />
    {review && <WorkbookChangeReview sourceRows={sourceRows} review={review} columns={columns} saving={saving} onClose={closeReview} onConfirm={() => void confirm()} />}
  </div>;
}

export function WorkbookChangeReview<T extends WorkbookStagedRow>({ sourceRows, review, columns, saving, onClose, onConfirm }: {
  sourceRows: readonly T[]; review: readonly T[]; columns: readonly WorksheetColumn<T>[];
  saving: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const dialog = useDialogFocus({ open: true, onClose: saving ? undefined : onClose });
  const display = (column: WorksheetColumn<T>, row: T): string => {
    const value = column.value?.(row);
    const options = (typeof column.options === "function" ? column.options(row, 0) : column.options) || [];
    return column.format?.(value, row) || options.find((option) => option.value === String(value))?.label || String(value ?? "—");
  };
  return <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="workbook-review-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
      <section className="hqs-surface-raised hqs-border flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-xl border p-5 shadow-xl">
        <h2 id="workbook-review-title" className="hqs-primary-text text-lg font-semibold">Review changes</h2>
        <p className="hqs-secondary-text mt-1 text-sm">{review.filter((row) => row.isNew).length} additions · {review.filter((row) => !row.isNew).length} updates</p>
        <div className="my-4 min-h-0 overflow-auto">{review.map((row) => {
          const original = sourceRows.find((candidate) => candidate.id === row.id);
          return <div key={row.id} className="hqs-border border-b py-3 text-sm"><strong className="hqs-primary-text">{row.isNew ? "New record" : "Update record"}</strong>
            {columns.filter((column) => column.setValue && (row.isNew || String(column.value?.(row)) !== String(original && column.value?.(original)))).map((column) => <p key={column.key} className="hqs-secondary-text break-words"><span className="font-medium">{column.header}: </span>{original && <>{display(column, original)} → </>}{display(column, row)}</p>)}
          </div>;
        })}</div>
        <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="hqs-control rounded-md border px-4 py-2 text-sm">Back to editing</button><button type="button" disabled={saving} onClick={onConfirm} className="hqs-focus-ring rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Confirm save"}</button></div>
      </section>
    </div>;
}
