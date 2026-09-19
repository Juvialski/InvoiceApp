import * as XLSX from "xlsx";

export type WorkbookCellValue = string | number | boolean | Date | null | undefined;

export interface WorkbookSheetSchema {
  name: string;
  headers: readonly string[];
  hiddenHeaders?: readonly string[];
  hidden?: boolean;
}

export interface WorkbookSchema {
  schemaVersion: number;
  domain: string;
  workbookKind: string;
  metadataSheetName?: string;
  sheets: readonly WorkbookSheetSchema[];
}

export interface WorkbookExportSheet {
  name: string;
  rows: readonly Readonly<Record<string, WorkbookCellValue>>[];
  hiddenHeaders?: readonly string[];
  hidden?: boolean;
}

export interface WorkbookExportInput {
  schema: WorkbookSchema;
  metadata: Readonly<Record<string, WorkbookCellValue>>;
  metadataRows?: readonly Readonly<Record<string, WorkbookCellValue>>[];
  sheets: readonly WorkbookExportSheet[];
  fileName?: string;
}

export interface WorkbookExportArtifact {
  bytes: Uint8Array;
  fileName?: string;
}

export interface WorkbookParserLimits {
  maxFileBytes: number;
  maxSheets: number;
  maxRowsPerSheet: number;
  maxColumnsPerSheet: number;
  maxCellTextLength: number;
}

export interface ParsedWorkbookSheet {
  name: string;
  hidden: boolean;
  headers: string[];
  rows: Array<Record<string, unknown>>;
}

export interface ParsedOperationsWorkbook {
  schemaVersion: number;
  domain: string;
  workbookKind: string;
  metadata: Record<string, unknown>;
  metadataRows: Array<Record<string, unknown>>;
  sheets: Record<string, ParsedWorkbookSheet>;
}

export type WorkbookImportErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_SHEETS"
  | "SHEET_TOO_LARGE"
  | "MALFORMED_WORKBOOK"
  | "SCHEMA_MISMATCH"
  | "UNSAFE_CONTENT"
  | "EXTERNAL_LINK"
  | "DUPLICATE_ID";

export class WorkbookImportError extends Error {
  readonly code: WorkbookImportErrorCode;

  constructor(code: WorkbookImportErrorCode, message: string) {
    super(message);
    this.name = "WorkbookImportError";
    this.code = code;
  }
}

export const DEFAULT_WORKBOOK_PARSER_LIMITS: Readonly<WorkbookParserLimits> = {
  maxFileBytes: 15 * 1024 * 1024,
  maxSheets: 16,
  maxRowsPerSheet: 10_000,
  maxColumnsPerSheet: 256,
  maxCellTextLength: 10_000,
};

const DEFAULT_METADATA_SHEET = "_HydroQualiSense";
const METADATA_ROW_TYPE = "__metadataRowType";

function inputByteLength(input: ArrayBuffer | Uint8Array) {
  return input instanceof ArrayBuffer ? input.byteLength : input.byteLength;
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, normalizeValue((value as Record<string, unknown>)[key])]));
  }
  return value === undefined ? null : value;
}

/** Deterministic comparison token only; it is not an authorization credential. */
export function fingerprintValue(value: unknown) {
  const serialized = JSON.stringify(normalizeValue(value));
  let first = 0x811c9dc5;
  let second = 0x9e3779b1;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function safeExportValue(value: WorkbookCellValue): WorkbookCellValue {
  if (typeof value === "string" && /^[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

function sheetHeaders(sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
  return Array.isArray(rows[0]) ? rows[0].map((value) => String(value ?? "")) : [];
}

function sheetVisibility(workbook: XLSX.WorkBook, sheetIndex: number) {
  const entry = (workbook as XLSX.WorkBook & { Workbook?: { Sheets?: Array<{ Hidden?: number }> } }).Workbook?.Sheets?.[sheetIndex];
  return entry?.Hidden === 1 || entry?.Hidden === 2;
}

function assertNoUnsafeCells(workbook: XLSX.WorkBook, maxCellTextLength: number) {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.["!ref"]) continue;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: column });
        const cell = sheet[address] as (XLSX.CellObject & { l?: { Target?: string }; f?: string }) | undefined;
        if (!cell) continue;
        if (cell.f) throw new WorkbookImportError("UNSAFE_CONTENT", `Formula cells are not supported (${sheetName}!${address}).`);
        if (cell.l?.Target) throw new WorkbookImportError("EXTERNAL_LINK", `External links are not supported (${sheetName}!${address}).`);
        if (typeof cell.v === "string" && /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(cell.v)) throw new WorkbookImportError("MALFORMED_WORKBOOK", `Cell ${sheetName}!${address} contains invalid control characters.`);
        if (typeof cell.v === "string" && cell.v.length > maxCellTextLength) {
          throw new WorkbookImportError("SHEET_TOO_LARGE", `Cell ${sheetName}!${address} exceeds the text limit.`);
        }
      }
    }
  }
}

function workbookByteArray(value: unknown) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value as ArrayLike<number>);
}

function metadataRowsFromSheet(sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: null, blankrows: false });
  const workbookRow = rows.find((row) => row[METADATA_ROW_TYPE] === "WORKBOOK") || {};
  const metadata = Object.fromEntries(Object.entries(workbookRow).filter(([key, value]) => key !== METADATA_ROW_TYPE && value !== null && value !== undefined));
  const metadataRows = rows
    .filter((row) => row[METADATA_ROW_TYPE] === "SYNC")
    .map((row) => Object.fromEntries(Object.entries(row).filter(([key, value]) => key !== METADATA_ROW_TYPE && value !== null && value !== undefined)));
  const identities = new Set<string>();
  for (const row of metadataRows) {
    const entity = String(row.entity || "");
    const recordId = String(row.recordId || "");
    const lineId = String(row.lineId || "");
    const identity = `${entity}:${recordId}:${lineId}`;
    if (entity && recordId && identities.has(identity)) throw new WorkbookImportError("DUPLICATE_ID", `Duplicate synchronization identity ${identity}.`);
    if (entity && recordId) identities.add(identity);
  }
  return { metadata, metadataRows };
}

function validateHeaders(schema: WorkbookSheetSchema, headers: readonly string[]) {
  if (headers.length !== schema.headers.length || headers.some((header, index) => header !== schema.headers[index])) {
    throw new WorkbookImportError("SCHEMA_MISMATCH", `Sheet "${schema.name}" does not match the supported column schema.`);
  }
}

export function exportOperationsWorkbook(input: WorkbookExportInput): WorkbookExportArtifact {
  const metadataSheetName = input.schema.metadataSheetName || DEFAULT_METADATA_SHEET;
  const workbook = XLSX.utils.book_new();
  const suppliedSheets = new Map(input.sheets.map((sheet) => [sheet.name, sheet]));
  for (const definition of input.schema.sheets) {
    const supplied = suppliedSheets.get(definition.name);
    if (!supplied) throw new Error(`Missing workbook sheet ${definition.name}.`);
    const hiddenHeaders = new Set(supplied.hiddenHeaders || definition.hiddenHeaders || []);
    const rows: WorkbookCellValue[][] = [[...definition.headers], ...supplied.rows.map((row) => definition.headers.map((header) => safeExportValue(row[header])))];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = definition.headers.map((header) => ({ hidden: hiddenHeaders.has(header), wch: Math.min(42, Math.max(12, header.length + 3)) }));
    XLSX.utils.book_append_sheet(workbook, sheet, definition.name);
  }

  const workbookMetadata = {
    schemaVersion: input.schema.schemaVersion,
    domain: input.schema.domain,
    workbookKind: input.schema.workbookKind,
    ...input.metadata,
  };
  const metadataKeys = new Set<string>(Object.keys(workbookMetadata));
  for (const row of input.metadataRows || []) for (const key of Object.keys(row)) metadataKeys.add(key);
  const metadataHeaders = [METADATA_ROW_TYPE, ...metadataKeys];
  const metadataRows = [
    { [METADATA_ROW_TYPE]: "WORKBOOK", ...workbookMetadata },
    ...(input.metadataRows || []).map((row) => ({ [METADATA_ROW_TYPE]: "SYNC", ...row })),
  ];
  const metadataSheet = XLSX.utils.aoa_to_sheet([
    metadataHeaders,
    ...metadataRows.map((row) => metadataHeaders.map((header) => safeExportValue(row[header]))),
  ]);
  metadataSheet["!cols"] = metadataHeaders.map((header) => ({ hidden: header !== METADATA_ROW_TYPE, wch: Math.min(64, Math.max(16, header.length + 3)) }));
  XLSX.utils.book_append_sheet(workbook, metadataSheet, metadataSheetName);
  (workbook as XLSX.WorkBook & { Workbook?: { Sheets: Array<{ name: string; Hidden: number }> } }).Workbook = {
    Sheets: workbook.SheetNames.map((name) => ({ name, Hidden: (name === metadataSheetName ? 1 : 0) as 0 | 1 })),
  };
  return {
    bytes: workbookByteArray(XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true })),
    fileName: input.fileName,
  };
}

export function parseOperationsWorkbook(
  input: ArrayBuffer | Uint8Array,
  options: { schema: WorkbookSchema; fileName?: string; limits?: Partial<WorkbookParserLimits> },
): ParsedOperationsWorkbook {
  const limits = { ...DEFAULT_WORKBOOK_PARSER_LIMITS, ...options.limits };
  if (options.fileName && /\.(xlsm|xls)$/i.test(options.fileName)) throw new WorkbookImportError("UNSUPPORTED_FORMAT", "Only non-macro .xlsx workbooks are supported.");
  if (inputByteLength(input) > limits.maxFileBytes) throw new WorkbookImportError("FILE_TOO_LARGE", "Workbook exceeds the supported upload size.");

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(input, { type: "array", cellDates: true, cellFormula: true, cellText: true, bookVBA: true });
  } catch {
    throw new WorkbookImportError("MALFORMED_WORKBOOK", "The workbook could not be read. Confirm that it is a valid, non-encrypted .xlsx file.");
  }
  if (workbook.vbaraw) throw new WorkbookImportError("UNSAFE_CONTENT", "Macro-enabled workbook content is not supported.");
  if (!workbook.SheetNames.length) throw new WorkbookImportError("MALFORMED_WORKBOOK", "The workbook contains no readable sheets.");
  if (workbook.SheetNames.length === 1 && !workbook.Sheets[workbook.SheetNames[0]]?.["!ref"]) throw new WorkbookImportError("MALFORMED_WORKBOOK", "The workbook contains no readable cells.");
  if (workbook.SheetNames.length > limits.maxSheets) throw new WorkbookImportError("TOO_MANY_SHEETS", "Workbook contains too many sheets.");
  const definedNames = (workbook as XLSX.WorkBook & { Workbook?: { Names?: Array<{ Ref?: string }> } }).Workbook?.Names || [];
  if (definedNames.some((name) => /\[[^\]]+\]/.test(String(name.Ref || "")))) throw new WorkbookImportError("EXTERNAL_LINK", "External workbook links are not supported.");
  assertNoUnsafeCells(workbook, limits.maxCellTextLength);

  const metadataSheetName = options.schema.metadataSheetName || DEFAULT_METADATA_SHEET;
  const expectedNames = [...options.schema.sheets.map((sheet) => sheet.name), metadataSheetName];
  if (workbook.SheetNames.length !== expectedNames.length || expectedNames.some((name) => !workbook.SheetNames.includes(name))) {
    throw new WorkbookImportError("SCHEMA_MISMATCH", "Workbook does not contain exactly the supported sheets.");
  }

  const parsedSheets: Record<string, ParsedWorkbookSheet> = {};
  for (const definition of options.schema.sheets) {
    const sheetIndex = workbook.SheetNames.indexOf(definition.name);
    const sheet = workbook.Sheets[definition.name];
    const headers = sheetHeaders(sheet);
    validateHeaders(definition, headers);
    const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : { s: { r: 0, c: 0 }, e: { r: 0, c: definition.headers.length - 1 } };
    const rowCount = Math.max(0, range.e.r - range.s.r);
    const columnCount = Math.max(0, range.e.c - range.s.c + 1);
    if (rowCount > limits.maxRowsPerSheet || columnCount > limits.maxColumnsPerSheet) throw new WorkbookImportError("SHEET_TOO_LARGE", `Sheet "${definition.name}" exceeds the supported dimensions.`);
    parsedSheets[definition.name] = {
      name: definition.name,
      hidden: sheetVisibility(workbook, sheetIndex),
      headers,
      rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: [...definition.headers], range: 1, raw: true, defval: null, blankrows: false }),
    };
  }

  const metadataSheet = workbook.Sheets[metadataSheetName];
  if (!metadataSheet) throw new WorkbookImportError("SCHEMA_MISMATCH", `Missing metadata sheet ${metadataSheetName}.`);
  const { metadata: rawMetadata, metadataRows } = metadataRowsFromSheet(metadataSheet);
  const { schemaVersion: metadataSchemaVersion, domain: metadataDomain, workbookKind: metadataWorkbookKind, ...metadata } = rawMetadata;
  if (Number(metadataSchemaVersion) !== options.schema.schemaVersion || String(metadataDomain || "") !== options.schema.domain || String(metadataWorkbookKind || "") !== options.schema.workbookKind) {
    throw new WorkbookImportError("SCHEMA_MISMATCH", "Workbook metadata does not match the supported schema version and domain.");
  }
  return {
    schemaVersion: options.schema.schemaVersion,
    domain: options.schema.domain,
    workbookKind: options.schema.workbookKind,
    metadata,
    metadataRows,
    sheets: parsedSheets,
  };
}

export function downloadWorkbookArtifact(artifact: WorkbookExportArtifact, fallbackFileName = "HydroQualiSense.xlsx") {
  if (typeof document === "undefined") throw new Error("Workbook downloads are only available in a browser.");
  const blob = new Blob([artifact.bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = artifact.fileName || fallbackFileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
