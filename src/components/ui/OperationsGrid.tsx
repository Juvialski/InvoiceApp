import React, { useMemo, useRef, useState } from "react";

export type OperationsGridAlign = "left" | "center" | "right";
export type OperationsGridSortDirection = "asc" | "desc";

export interface OperationsGridColumn<T> {
  key: string;
  header: string;
  value: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | Date | null | undefined;
  align?: OperationsGridAlign;
  editable?: boolean | ((row: T) => boolean);
  protected?: boolean | ((row: T) => boolean);
  headerClassName?: string;
  cellClassName?: string;
}

export interface OperationsGridProps<T> {
  ariaLabel: string;
  rows: readonly T[];
  columns: readonly OperationsGridColumn<T>[];
  rowKey: (row: T) => string;
  selectedRowId?: string;
  onRowSelect?: (row: T) => void;
  onRowActivate?: (row: T) => void;
  renderActions?: (row: T) => React.ReactNode;
  emptyState?: React.ReactNode;
  className?: string;
  density?: "compact" | "comfortable";
}

function sortableValue(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return String(value ?? "").toLocaleLowerCase();
}

function compareValues(left: unknown, right: unknown) {
  const a = sortableValue(left);
  const b = sortableValue(right);
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function sortOperationsGridRows<T>(rows: readonly T[], column: OperationsGridColumn<T>, direction: OperationsGridSortDirection) {
  return [...rows].sort((left, right) => {
    const comparison = compareValues(column.sortValue ? column.sortValue(left) : column.value(left), column.sortValue ? column.sortValue(right) : column.value(right));
    return direction === "asc" ? comparison : -comparison;
  });
}

function alignClass(align: OperationsGridAlign | undefined) {
  return align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
}

function resolveFlag<T>(value: boolean | ((row: T) => boolean) | undefined, row: T) {
  return typeof value === "function" ? value(row) : Boolean(value);
}

export function OperationsGrid<T>({
  ariaLabel,
  rows,
  columns,
  rowKey,
  selectedRowId,
  onRowSelect,
  onRowActivate,
  renderActions,
  emptyState = "No records match the current filters.",
  className = "",
  density = "compact",
}: OperationsGridProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<OperationsGridSortDirection>("asc");
  const [activeCell, setActiveCell] = useState({ row: 0, column: 0 });
  const [internalSelectedRowId, setInternalSelectedRowId] = useState<string | undefined>(undefined);
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>());
  const effectiveSelectedRowId = selectedRowId ?? internalSelectedRowId;
  const sortedRows = useMemo(() => {
    if (!sortKey) return [...rows];
    const column = columns.find((candidate) => candidate.key === sortKey);
    return column ? sortOperationsGridRows(rows, column, sortDirection) : [...rows];
  }, [columns, rows, sortDirection, sortKey]);

  const toggleSort = (column: OperationsGridColumn<T>) => {
    if (sortKey === column.key) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(column.key);
      setSortDirection("asc");
    }
  };

  const moveActiveCell = (rowIndex: number, columnIndex: number) => {
    const nextRow = Math.max(0, Math.min(sortedRows.length - 1, rowIndex));
    const nextColumn = Math.max(0, Math.min(columns.length - 1, columnIndex));
    setActiveCell({ row: nextRow, column: nextColumn });
    cellRefs.current.get(`${nextRow}:${nextColumn}`)?.focus();
  };

  const selectRow = (row: T) => {
    const id = rowKey(row);
    if (selectedRowId === undefined) setInternalSelectedRowId(id);
    onRowSelect?.(row);
  };

  if (!sortedRows.length) {
    return <div data-operations-grid="true" className={`overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}><div className="p-6 text-center text-xs text-slate-500">{emptyState}</div></div>;
  }

  return (
    <div data-operations-grid="true" className={`overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}>
      <div className="max-h-[min(65vh,48rem)] overflow-auto">
        <table
          role="grid"
          aria-label={ariaLabel}
          aria-rowcount={sortedRows.length + 1}
          className="w-full border-collapse text-left text-xs"
        >
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr role="row">
              {columns.map((column) => {
                const sorted = sortKey === column.key;
                return (
                  <th
                    key={column.key}
                    role="columnheader"
                    aria-sort={sorted ? sortDirection === "asc" ? "ascending" : "descending" : "none"}
                    className={`whitespace-nowrap px-3 ${density === "compact" ? "py-2" : "py-3"} ${alignClass(column.align)} ${column.headerClassName || ""}`}
                  >
                    <button type="button" onClick={() => toggleSort(column)} className="inline-flex items-center gap-1 font-black hover:text-slate-900">
                      {column.header}
                      {sorted && <span aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                    </button>
                  </th>
                );
              })}
              {renderActions && <th role="columnheader" className="whitespace-nowrap px-3 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIndex) => {
              const key = rowKey(row);
              const selected = effectiveSelectedRowId === key;
              return (
                <tr
                  key={key}
                  role="row"
                  aria-rowindex={rowIndex + 2}
                  aria-selected={selected}
                  onClick={() => selectRow(row)}
                  onDoubleClick={() => onRowActivate?.(row)}
                  className={`border-b border-slate-100 transition-colors ${selected ? "bg-indigo-50/70" : "hover:bg-slate-50/80"}`}
                >
                  {columns.map((column, columnIndex) => {
                    const editable = resolveFlag(column.editable, row);
                    const protectedField = resolveFlag(column.protected, row);
                    const active = activeCell.row === rowIndex && activeCell.column === columnIndex;
                    return (
                      <td
                        key={column.key}
                        ref={(node) => {
                          const refKey = `${rowIndex}:${columnIndex}`;
                          if (node) cellRefs.current.set(refKey, node);
                          else cellRefs.current.delete(refKey);
                        }}
                        role="gridcell"
                        tabIndex={active ? 0 : -1}
                        aria-colindex={columnIndex + 1}
                        data-field-editable={editable ? "true" : "false"}
                        data-field-protected={protectedField ? "true" : "false"}
                        onFocus={() => setActiveCell({ row: rowIndex, column: columnIndex })}
                        onClick={(event) => { event.stopPropagation(); selectRow(row); setActiveCell({ row: rowIndex, column: columnIndex }); }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") { event.preventDefault(); onRowActivate?.(row); return; }
                          if (event.key === "ArrowDown") { event.preventDefault(); moveActiveCell(rowIndex + 1, columnIndex); return; }
                          if (event.key === "ArrowUp") { event.preventDefault(); moveActiveCell(rowIndex - 1, columnIndex); return; }
                          if (event.key === "ArrowRight") { event.preventDefault(); moveActiveCell(rowIndex, columnIndex + 1); return; }
                          if (event.key === "ArrowLeft") { event.preventDefault(); moveActiveCell(rowIndex, columnIndex - 1); return; }
                          if (event.key === "Home") { event.preventDefault(); moveActiveCell(rowIndex, 0); return; }
                          if (event.key === "End") { event.preventDefault(); moveActiveCell(rowIndex, columns.length - 1); }
                        }}
                        className={`whitespace-nowrap px-3 ${density === "compact" ? "py-2" : "py-3"} ${alignClass(column.align)} ${column.cellClassName || ""}`}
                      >
                        {column.value(row)}
                      </td>
                    );
                  })}
                  {renderActions && <td role="gridcell" className="whitespace-nowrap px-3 py-2 text-right" onClick={(event) => event.stopPropagation()}>{renderActions(row)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
