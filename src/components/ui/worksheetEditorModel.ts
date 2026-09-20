import type { ReactNode } from "react";

export type WorksheetRow = { readonly [key: string]: unknown };

export type WorksheetCellKind = "text" | "number" | "currency" | "date" | "select";
export type WorksheetCellIssueSeverity = "warning" | "error";

export interface WorksheetCellIssue {
  severity: WorksheetCellIssueSeverity;
  message: string;
}

export interface WorksheetSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface WorksheetCellContext<T> {
  row: T;
  rowIndex: number;
  rowKey: string;
  column: WorksheetColumn<T>;
  columnIndex: number;
  source: "edit" | "paste";
}

export type WorksheetValidationResult =
  | void
  | string
  | WorksheetCellIssue
  | readonly (string | WorksheetCellIssue)[];

export type WorksheetParseResult =
  | { valid: true; value: unknown }
  | { valid: false; issue: WorksheetCellIssue };

export interface WorksheetColumn<T> {
  key: string;
  header: string;
  kind?: WorksheetCellKind;
  editable?: boolean | ((row: T, rowIndex: number) => boolean);
  protected?: boolean | ((row: T, rowIndex: number) => boolean);
  value?: (row: T) => unknown;
  setValue?: (row: T, value: unknown) => T;
  format?: (value: unknown, row: T) => string;
  parse?: (raw: string, context: WorksheetCellContext<T>) => unknown | WorksheetParseResult;
  validate?: (value: unknown, context: WorksheetCellContext<T>) => WorksheetValidationResult;
  options?: readonly WorksheetSelectOption[] | ((row: T, rowIndex: number) => readonly WorksheetSelectOption[]);
  placeholder?: string;
  currency?: string | ((row: T) => string);
  render?: (value: unknown, row: T, context: WorksheetCellContext<T>) => ReactNode;
  align?: "left" | "center" | "right";
  width?: string;
  minWidth?: string;
  frozen?: boolean;
}

export interface WorksheetCellPosition {
  row: number;
  column: number;
}

export type WorksheetNavigationKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Tab" | "Enter" | "Escape";

export interface WorksheetCellEditResult<T> {
  rows: readonly T[];
  changed: boolean;
  issue?: WorksheetCellIssue;
  warnings?: readonly WorksheetCellIssue[];
  rowKey?: string;
  columnKey?: string;
}

export type WorksheetPasteRejectionReason = "protected" | "not-editable" | "validation" | "out-of-bounds" | "unknown-column";

export interface WorksheetPasteRejection {
  row: number;
  column: number;
  reason: WorksheetPasteRejectionReason;
  message: string;
}

export interface WorksheetPasteChange {
  rowKey: string;
  columnKey: string;
  value: unknown;
}

export interface WorksheetPasteIssue extends WorksheetCellIssue {
  row: number;
  column: number;
}

export interface WorksheetPasteResult<T> {
  rows: readonly T[];
  changes: readonly WorksheetPasteChange[];
  rejected: readonly WorksheetPasteRejection[];
  issues: readonly WorksheetPasteIssue[];
}

export function getWorksheetCellId(rowKey: string, columnKey: string): string {
  return `${rowKey}:${columnKey}`;
}

export function getWorksheetColumnValue<T>(row: T, column: WorksheetColumn<T>): unknown {
  return column.value ? column.value(row) : (row as WorksheetRow)[column.key];
}

export function setWorksheetColumnValue<T>(row: T, column: WorksheetColumn<T>, value: unknown): T {
  if (column.setValue) return column.setValue(row, value);
  return { ...(row as WorksheetRow), [column.key]: value } as T;
}

export function isWorksheetColumnProtected<T>(column: WorksheetColumn<T>, row: T, rowIndex: number): boolean {
  return typeof column.protected === "function" ? column.protected(row, rowIndex) : Boolean(column.protected);
}

export function isWorksheetColumnEditable<T>(column: WorksheetColumn<T>, row: T, rowIndex: number): boolean {
  if (isWorksheetColumnProtected(column, row, rowIndex)) return false;
  return typeof column.editable === "function" ? column.editable(row, rowIndex) : column.editable !== false;
}

function issueFromValue(value: string | WorksheetCellIssue, fallbackSeverity: WorksheetCellIssueSeverity = "error"): WorksheetCellIssue {
  return typeof value === "string" ? { severity: fallbackSeverity, message: value } : value;
}

function validationIssues(result: WorksheetValidationResult): WorksheetCellIssue[] {
  if (!result) return [];
  const values = Array.isArray(result) ? result : [result];
  return values.map((value) => issueFromValue(value));
}

function parseNumber(raw: string): WorksheetParseResult {
  if (!raw.trim()) return { valid: true, value: null };
  const value = Number(raw.replaceAll(",", "").trim());
  return Number.isFinite(value)
    ? { valid: true, value }
    : { valid: false, issue: { severity: "error", message: "Enter a valid number." } };
}

function parseDate(raw: string): WorksheetParseResult {
  const value = raw.trim();
  if (!value) return { valid: true, value: "" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { valid: false, issue: { severity: "error", message: "Enter a date in YYYY-MM-DD format." } };
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const validCalendarDate = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return !validCalendarDate
    ? { valid: false, issue: { severity: "error", message: "Enter a real calendar date." } }
    : { valid: true, value };
}

function parseSelect<T>(raw: string, column: WorksheetColumn<T>, row: T, rowIndex: number): WorksheetParseResult {
  const value = raw.trim();
  if (!value) return { valid: true, value: "" };
  const options = typeof column.options === "function" ? column.options(row, rowIndex) : column.options || [];
  const option = options.find((candidate) => candidate.value === value);
  return option && !option.disabled
    ? { valid: true, value: option.value }
    : { valid: false, issue: { severity: "error", message: `Choose a supported ${column.header.toLowerCase()} value.` } };
}

export function parseWorksheetCellValue<T>(raw: string, column: WorksheetColumn<T>, context: WorksheetCellContext<T>): WorksheetParseResult {
  if (column.parse) {
    const parsed = column.parse(raw, context);
    if (typeof parsed === "object" && parsed !== null && "valid" in parsed) return parsed as WorksheetParseResult;
    return { valid: true, value: parsed };
  }

  switch (column.kind || "text") {
    case "number":
    case "currency":
      return parseNumber(raw);
    case "date":
      return parseDate(raw);
    case "select":
      return parseSelect(raw, column, context.row, context.rowIndex);
    case "text":
    default:
      return { valid: true, value: raw };
  }
}

export function formatWorksheetInputValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export function applyWorksheetCellEdit<T>(
  rows: readonly T[],
  columns: readonly WorksheetColumn<T>[],
  rowKey: (row: T, rowIndex: number) => string,
  rowIndex: number,
  columnKey: string,
  rawValue: string,
  source: "edit" | "paste" = "edit",
): WorksheetCellEditResult<T> {
  const row = rows[rowIndex];
  const columnIndex = columns.findIndex((candidate) => candidate.key === columnKey);
  const column = columnIndex >= 0 ? columns[columnIndex] : undefined;
  if (!row || !column) {
    return {
      rows,
      changed: false,
      issue: { severity: "error", message: "The worksheet cell is no longer available." },
    };
  }

  const currentRowKey = rowKey(row, rowIndex);
  const context: WorksheetCellContext<T> = { row, rowIndex, rowKey: currentRowKey, column, columnIndex, source };
  if (isWorksheetColumnProtected(column, row, rowIndex)) {
    return { rows, changed: false, rowKey: currentRowKey, columnKey, issue: { severity: "warning", message: "This protected cell cannot be changed." } };
  }
  if (!isWorksheetColumnEditable(column, row, rowIndex)) {
    return { rows, changed: false, rowKey: currentRowKey, columnKey, issue: { severity: "warning", message: "This cell is read-only." } };
  }

  const parsed = parseWorksheetCellValue(rawValue, column, context);
  if (parsed.valid === false) return { rows, changed: false, rowKey: currentRowKey, columnKey, issue: parsed.issue };

  const issues = validationIssues(column.validate?.(parsed.value, context));
  const warnings = issues.filter((issue) => issue.severity === "warning");
  if (issues.some((issue) => issue.severity === "error")) {
    return { rows, changed: false, rowKey: currentRowKey, columnKey, issue: issues.find((issue) => issue.severity === "error"), warnings };
  }

  const currentValue = getWorksheetColumnValue(row, column);
  const nextRow = setWorksheetColumnValue(row, column, parsed.value);
  const changed = !Object.is(currentValue, getWorksheetColumnValue(nextRow, column));
  if (!changed) return { rows, changed: false, rowKey: currentRowKey, columnKey, warnings };

  const nextRows = rows.slice();
  nextRows[rowIndex] = nextRow;
  return { rows: nextRows, changed: true, rowKey: currentRowKey, columnKey, warnings };
}

export function parseWorksheetTsv(text: string): string[][] {
  const normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (!normalized) return [[]];
  const lines = normalized.split("\n");
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();
  return lines.map((line) => line.split("\t"));
}

export function applyWorksheetPaste<T>(
  rows: readonly T[],
  columns: readonly WorksheetColumn<T>[],
  rowKey: (row: T, rowIndex: number) => string,
  startRow: number,
  startColumn: number,
  text: string,
): WorksheetPasteResult<T> {
  const matrix = parseWorksheetTsv(text);
  let nextRows: readonly T[] = rows.slice();
  const changes: WorksheetPasteChange[] = [];
  const rejected: WorksheetPasteRejection[] = [];
  const issues: WorksheetPasteIssue[] = [];

  matrix.forEach((line, rowOffset) => {
    line.forEach((rawValue, columnOffset) => {
      const targetRow = startRow + rowOffset;
      const targetColumn = startColumn + columnOffset;
      const column = columns[targetColumn];
      const row = nextRows[targetRow];
      if (!row || !column) {
        rejected.push({ row: targetRow, column: targetColumn, reason: "out-of-bounds", message: "Paste stayed within the existing worksheet rows and columns." });
        return;
      }

      const result = applyWorksheetCellEdit(nextRows, columns, rowKey, targetRow, column.key, rawValue, "paste");
      if (result.warnings) {
        for (const issue of result.warnings) issues.push({ ...issue, row: targetRow, column: targetColumn });
      }
      if (result.changed) {
        nextRows = result.rows;
        changes.push({ rowKey: rowKey(row, targetRow), columnKey: column.key, value: getWorksheetColumnValue(nextRows[targetRow], column) });
        return;
      }

      if (result.issue) {
        const reason: WorksheetPasteRejectionReason = isWorksheetColumnProtected(column, row, targetRow)
          ? "protected"
          : isWorksheetColumnEditable(column, row, targetRow)
            ? result.issue.severity === "error" ? "validation" : "not-editable"
            : "not-editable";
        rejected.push({ row: targetRow, column: targetColumn, reason, message: result.issue.message });
        if (reason === "validation") issues.push({ ...result.issue, row: targetRow, column: targetColumn });
      }
    });
  });

  return { rows: nextRows, changes, rejected, issues };
}

export function copyWorksheetTsv(values: readonly (readonly unknown[])[]): string {
  return values
    .map((row) => row.map((value) => String(value ?? "").replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n");
}

export function getNextWorksheetCell(
  position: WorksheetCellPosition,
  key: WorksheetNavigationKey,
  rowCount: number,
  columnCount: number,
  shiftKey = false,
): WorksheetCellPosition | null {
  if (rowCount <= 0 || columnCount <= 0) return null;
  const row = Math.max(0, Math.min(rowCount - 1, position.row));
  const column = Math.max(0, Math.min(columnCount - 1, position.column));
  if (key === "Escape") return null;
  if (key === "ArrowUp") return { row: Math.max(0, row - 1), column };
  if (key === "ArrowDown") return { row: Math.min(rowCount - 1, row + 1), column };
  if (key === "ArrowLeft") return { row, column: Math.max(0, column - 1) };
  if (key === "ArrowRight") return { row, column: Math.min(columnCount - 1, column + 1) };
  if (key === "Enter") return { row: Math.max(0, Math.min(rowCount - 1, row + (shiftKey ? -1 : 1))), column };
  if (key === "Tab") {
    if (shiftKey) {
      if (column > 0) return { row, column: column - 1 };
      return { row: Math.max(0, row - 1), column: columnCount - 1 };
    }
    if (column < columnCount - 1) return { row, column: column + 1 };
    return { row: Math.min(rowCount - 1, row + 1), column: 0 };
  }
  return { row, column };
}
