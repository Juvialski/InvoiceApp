import * as XLSX from "xlsx";

export type PayrollWorkbookFormat = "xlsx" | "xls" | "csv" | "xlsm" | "unknown";
export type PayrollImportConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type PayrollCostContext = "PROJECT" | "ADMIN_OFFICE" | "GENERAL_OVERHEAD" | "UNALLOCATED_REVIEW";
export type PayrollCellValue = string | number | boolean | Date | null;

export type CanonicalPayrollField =
  | "employeeCode"
  | "employeeName"
  | "position"
  | "payType"
  | "dailyRate"
  | "hourlyRate"
  | "monthlyRate"
  | "daysWorked"
  | "regularHours"
  | "overtimeHours"
  | "overtimeRate"
  | "regularPayImported"
  | "overtimePayImported"
  | "grossPayImported"
  | "periodStart"
  | "periodEnd"
  | "payDate"
  | "projectCode"
  | "projectName"
  | "costContext";

export type PayrollMetadataField =
  | "title"
  | "projectCode"
  | "projectName"
  | "projectLocation"
  | "periodCovered"
  | "periodStart"
  | "periodEnd"
  | "payDate"
  | "projectInCharge"
  | "contactNumber";

export interface PayrollImportConfidence {
  level: PayrollImportConfidenceLevel;
  score: number;
  reasons: string[];
}

export interface PayrollColumnMapping {
  columnIndex: number;
  sourceHeader: string;
  normalizedHeader: string;
  field?: CanonicalPayrollField;
  confidence: PayrollImportConfidence;
  reason: string;
  sampleValues: PayrollCellValue[];
}

export interface PayrollImportMetadata {
  title?: string;
  projectCode?: string;
  projectName?: string;
  projectLocation?: string;
  periodCovered?: string;
  periodStart?: string;
  periodEnd?: string;
  payDate?: string;
  projectInCharge?: string;
  contactNumber?: string;
  detectedFields: PayrollMetadataField[];
  rawRows: PayrollCellValue[][];
}

export interface PayrollDetectedContext {
  type: PayrollCostContext;
  label?: string;
  confidence: PayrollImportConfidence;
  evidence: string[];
}

export interface PayrollReconciliationCheck {
  status: "PASS" | "WARNING" | "NOT_APPLICABLE";
  expected?: number;
  actual?: number;
  difference?: number;
  message: string;
}

export interface PayrollRowReconciliation {
  regularPay: PayrollReconciliationCheck;
  grossPay: PayrollReconciliationCheck;
}

export interface ParsedPayrollRow {
  sourceSheet: string;
  sourceRow: number;
  employeeCode?: string;
  employeeName?: string;
  position?: string;
  payType?: "MONTHLY" | "DAILY" | "HOURLY";
  dailyRate?: number;
  hourlyRate?: number;
  monthlyRate?: number;
  daysWorked?: number;
  regularHours?: number;
  overtimeHours?: number;
  overtimeRate?: number;
  regularPayImported?: number;
  overtimePayImported?: number;
  grossPayImported?: number;
  periodStart?: string;
  periodEnd?: string;
  payDate?: string;
  projectCode?: string;
  projectName?: string;
  costContext: PayrollCostContext;
  rawRow: PayrollCellValue[];
  warnings: string[];
  confidence: PayrollImportConfidence;
  reconciliation: PayrollRowReconciliation;
}

export interface PayrollDetectedTable {
  headerRow: number;
  dataStartRow: number;
  dataEndRow: number;
  headers: string[];
  mappings: PayrollColumnMapping[];
  confidence: PayrollImportConfidence;
}

export interface ParsedPayrollSheet {
  sourceSheet: string;
  sheetIndex: number;
  hidden: boolean;
  status: "DETECTED" | "BLANK" | "UNRECOGNIZED";
  rawRows: PayrollCellValue[][];
  metadata: PayrollImportMetadata;
  context: PayrollDetectedContext;
  table?: PayrollDetectedTable;
  rows: ParsedPayrollRow[];
  warnings: string[];
  confidence: PayrollImportConfidence;
  structureSignature?: string;
}

export interface ParsedPayrollWorkbook {
  fileName?: string;
  format: PayrollWorkbookFormat;
  sheetNames: string[];
  sheets: ParsedPayrollSheet[];
  warnings: string[];
  confidence: PayrollImportConfidence;
}

export interface PayrollParserLimits {
  maxFileBytes: number;
  maxWorksheets: number;
  maxRows: number;
  maxColumns: number;
  headerScanRows: number;
}

export interface ParsePayrollWorkbookOptions {
  fileName?: string;
  limits?: Partial<PayrollParserLimits>;
}

export class PayrollImportError extends Error {
  readonly code: "UNSUPPORTED_FORMAT" | "FILE_TOO_LARGE" | "TOO_MANY_SHEETS" | "SHEET_TOO_LARGE" | "MALFORMED_WORKBOOK";

  constructor(code: "UNSUPPORTED_FORMAT" | "FILE_TOO_LARGE" | "TOO_MANY_SHEETS" | "SHEET_TOO_LARGE" | "MALFORMED_WORKBOOK", message: string) {
    super(message);
    this.name = "PayrollImportError";
    this.code = code;
  }
}

export const DEFAULT_PAYROLL_PARSER_LIMITS: Readonly<PayrollParserLimits> = {
  maxFileBytes: 15 * 1024 * 1024,
  maxWorksheets: 32,
  maxRows: 10_000,
  maxColumns: 256,
  headerScanRows: 80,
};

const SYNONYMS: Readonly<Partial<Record<CanonicalPayrollField, readonly string[]>>> = {
  employeeCode: ["EMPLOYEE CODE", "EMP CODE", "EMPLOYEE ID", "WORKER ID", "STAFF ID", "ID NUMBER", "ID NO"],
  employeeName: ["NAME", "EMPLOYEE", "EMPLOYEE NAME", "WORKER", "WORKER NAME", "STAFF", "STAFF NAME"],
  position: ["POSITION", "JOB TITLE", "ROLE", "DESIGNATION"],
  payType: ["PAY TYPE", "PAY BASIS", "RATE TYPE"],
  dailyRate: ["DAILY SALARY", "DAILY RATE", "DAY RATE", "RATE DAY", "RATE PER DAY"],
  hourlyRate: ["HOURLY RATE", "HOUR RATE", "RATE HOUR", "RATE PER HOUR"],
  monthlyRate: ["MONTHLY SALARY", "MONTHLY RATE", "MONTH RATE", "BASE MONTHLY SALARY"],
  daysWorked: ["WORK DAYS", "WORKDAYS", "DAYS WORKED", "NUMBER OF WORK DAYS", "NO OF WORK DAYS", "NO OF DAYS"],
  regularHours: ["REGULAR HOURS", "WORK HOURS", "HOURS WORKED", "NUMBER OF HOURS", "NO OF HOURS"],
  overtimeHours: ["OVERTIME HOURS", "OT HOURS", "NUMBER OF HOURS OVERTIME", "NO OF HOURS OVERTIME", "HOURS OVERTIME"],
  overtimeRate: ["OVERTIME RATE", "OT RATE", "RATE OVERTIME"],
  regularPayImported: ["REGULAR PAY", "REGULAR AMOUNT", "BASIC PAY", "BASIC AMOUNT", "BASE PAY"],
  overtimePayImported: ["OVERTIME PAY", "OVERTIME AMOUNT", "OT PAY", "OT AMOUNT"],
  grossPayImported: ["TOTAL", "TOTAL AMOUNT", "GROSS", "GROSS PAY", "GROSS AMOUNT"],
  periodStart: ["PERIOD START", "START DATE", "PAYROLL START"],
  periodEnd: ["PERIOD END", "END DATE", "PAYROLL END"],
  payDate: ["PAY DATE", "PAYMENT DATE"],
  projectCode: ["PROJECT CODE", "JOB CODE"],
  projectName: ["PROJECT", "PROJECT NAME", "JOB", "JOB NAME"],
  costContext: ["COST CONTEXT", "COST CENTER", "LABOR CONTEXT", "DEPARTMENT"],
};

const FIELD_BY_HEADER = new Map<string, CanonicalPayrollField>();
for (const [field, values] of Object.entries(SYNONYMS) as [CanonicalPayrollField, readonly string[]][]) {
  for (const value of values) FIELD_BY_HEADER.set(value, field);
}

const NUMERIC_FIELDS = new Set<CanonicalPayrollField>([
  "dailyRate", "hourlyRate", "monthlyRate", "daysWorked", "regularHours", "overtimeHours", "overtimeRate",
  "regularPayImported", "overtimePayImported", "grossPayImported",
]);
const DATE_FIELDS = new Set<CanonicalPayrollField>(["periodStart", "periodEnd", "payDate"]);
const FOOTER_PATTERN = /^(GRAND TOTAL|SUB ?TOTAL|TOTALS?|SUMMARY|PAYROLL TOTAL)$/;

function clampScore(score: number) {
  return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
}

function confidence(score: number, reasons: string[] = []): PayrollImportConfidence {
  const bounded = clampScore(score);
  return { level: bounded >= 0.82 ? "HIGH" : bounded >= 0.58 ? "MEDIUM" : "LOW", score: bounded, reasons };
}

export function normalizePayrollHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‐‑‒–—―-]/g, " ")
    .replace(/&/g, " AND ")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function cellText(value: unknown) {
  if (value instanceof Date) return formatDate(value);
  return String(value ?? "").trim();
}

function cleanMetadataValue(value: string | undefined) {
  const cleaned = String(value ?? "").replace(/[_═—–-]{2,}/g, " ").replace(/^\s*:\s*/, "").trim();
  return cleaned || undefined;
}

function asString(value: PayrollCellValue | undefined) {
  const text = cellText(value);
  return text || undefined;
}

export function parsePayrollNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  let text = value.trim();
  if (!text || /^[-–—]+$/.test(text)) return undefined;
  const negative = /^\(.*\)$/.test(text);
  text = text.replace(/^\((.*)\)$/, "$1").replace(/[^0-9.+-]/g, "");
  if (!text || !/^[-+]?\d*\.?\d+$/.test(text)) return undefined;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return undefined;
  return negative ? -Math.abs(parsed) : parsed;
}

function formatDate(date: Date) {
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizePayrollDate(value: unknown): string | undefined {
  if (value instanceof Date) return formatDate(value) || undefined;
  if (typeof value === "number" && value > 0 && value < 100_000) {
    const wholeDays = Math.floor(value);
    const parsed = new Date(Date.UTC(1899, 11, 30) + wholeDays * 86_400_000);
    return formatDate(parsed) || undefined;
  }
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (match) return validDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(text);
  if (match) return validDateParts(Number(match[3]), Number(match[1]), Number(match[2]));
  match = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(text);
  if (match) {
    const months: Record<string, number> = {
      JAN: 1, JANUARY: 1, FEB: 2, FEBRUARY: 2, MAR: 3, MARCH: 3, APR: 4, APRIL: 4,
      MAY: 5, JUN: 6, JUNE: 6, JUL: 7, JULY: 7, AUG: 8, AUGUST: 8,
      SEP: 9, SEPT: 9, SEPTEMBER: 9, OCT: 10, OCTOBER: 10,
      NOV: 11, NOVEMBER: 11, DEC: 12, DECEMBER: 12,
    };
    const month = months[match[1].toUpperCase()];
    if (month) return validDateParts(Number(match[3]), month, Number(match[2]));
  }
  if (!/[A-Za-z]/.test(text)) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : formatDate(parsed);
}

function validDateParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return formatDate(date);
}

function normalizedField(header: unknown) {
  return FIELD_BY_HEADER.get(normalizePayrollHeader(header));
}

function contextualAmountField(index: number, headers: readonly PayrollCellValue[], fields: readonly (CanonicalPayrollField | undefined)[]) {
  for (let offset = 1; offset <= 3; offset += 1) {
    const leftField = fields[index - offset];
    const leftHeader = normalizePayrollHeader(headers[index - offset]);
    if (leftField === "overtimeHours" || leftField === "overtimeRate" || /\b(OT|OVERTIME)\b/.test(leftHeader)) return "overtimePayImported" as const;
    if (["daysWorked", "dailyRate", "regularHours", "hourlyRate", "monthlyRate"].includes(String(leftField))) return "regularPayImported" as const;
  }
  const rightFields = fields.slice(index + 1, index + 4);
  if (rightFields.includes("overtimeHours")) return "regularPayImported" as const;
  if (fields.slice(0, index).includes("overtimeHours")) return "overtimePayImported" as const;
  return undefined;
}

export function mapPayrollColumns(headers: readonly PayrollCellValue[], sampleRows: readonly PayrollCellValue[][] = []): PayrollColumnMapping[] {
  const directFields = headers.map(normalizedField);
  return headers.map((header, columnIndex) => {
    const sourceHeader = cellText(header);
    const normalizedHeader = normalizePayrollHeader(header);
    let field = directFields[columnIndex];
    let reason = field ? "Matched a normalized payroll heading synonym." : "No canonical field matched this heading.";
    let score = field ? 0.98 : 0.2;
    if (!field && normalizedHeader === "AMOUNT") {
      field = contextualAmountField(columnIndex, headers, directFields);
      if (field) {
        reason = field === "regularPayImported"
          ? "Mapped AMOUNT to regular pay from the neighboring regular work/rate column."
          : "Mapped AMOUNT to overtime pay from the neighboring overtime column.";
        score = 0.9;
      } else {
        reason = "AMOUNT is ambiguous without neighboring rate, work-day, or overtime context.";
        score = 0.35;
      }
    }
    const sampleValues = sampleRows.map((row) => row[columnIndex] ?? null).filter((value) => value !== null && value !== "").slice(0, 3);
    return { columnIndex, sourceHeader, normalizedHeader, field, confidence: confidence(score, [reason]), reason, sampleValues };
  });
}

function headerCandidate(row: PayrollCellValue[], rowIndex: number, sampleRows: PayrollCellValue[][]) {
  const mappings = mapPayrollColumns(row, sampleRows);
  const fields = mappings.flatMap((mapping) => mapping.field ? [mapping.field] : []);
  const recognized = fields.length;
  const hasEmployee = fields.includes("employeeName") || fields.includes("employeeCode");
  const hasWork = fields.some((field) => ["daysWorked", "regularHours", "overtimeHours"].includes(field));
  const hasRate = fields.some((field) => ["dailyRate", "hourlyRate", "monthlyRate", "overtimeRate"].includes(field));
  const hasPay = fields.some((field) => ["regularPayImported", "overtimePayImported", "grossPayImported"].includes(field));
  const duplicateCanonicalFields = fields.length - new Set(fields).size;
  const score = recognized + (hasEmployee ? 4 : 0) + (hasWork ? 1.5 : 0) + (hasRate ? 1.5 : 0) + (hasPay ? 1.5 : 0) - duplicateCanonicalFields * 0.5;
  return { rowIndex, mappings, fields, recognized, hasEmployee, hasWork, hasRate, hasPay, score };
}

export function detectPayrollTable(rawRows: PayrollCellValue[][], headerScanRows = DEFAULT_PAYROLL_PARSER_LIMITS.headerScanRows): PayrollDetectedTable | undefined {
  const candidates = rawRows.slice(0, headerScanRows).map((row, rowIndex) => headerCandidate(row, rowIndex, rawRows.slice(rowIndex + 1, rowIndex + 5)));
  const valid = candidates.filter((candidate) => candidate.hasEmployee && candidate.recognized >= 3 && (candidate.hasRate || candidate.hasWork || candidate.hasPay));
  valid.sort((left, right) => right.score - left.score || left.rowIndex - right.rowIndex);
  const selected = valid[0];
  if (!selected) return undefined;
  const mapped = selected.mappings.filter((mapping) => mapping.field);
  const mappingScore = mapped.length ? mapped.reduce((sum, mapping) => sum + mapping.confidence.score, 0) / mapped.length : 0;
  const semanticGroups = [selected.hasEmployee, selected.hasRate, selected.hasWork, selected.hasPay].filter(Boolean).length;
  const score = Math.min(0.99, mappingScore * 0.7 + semanticGroups / 4 * 0.3);
  let dataEndIndex = rawRows.length - 1;
  for (let index = selected.rowIndex + 1; index < rawRows.length; index += 1) {
    if (isFooterRow(rawRows[index], selected.mappings)) {
      dataEndIndex = index - 1;
      break;
    }
  }
  return {
    headerRow: selected.rowIndex + 1,
    dataStartRow: selected.rowIndex + 2,
    dataEndRow: Math.max(selected.rowIndex + 1, dataEndIndex + 1),
    headers: rawRows[selected.rowIndex].map(cellText),
    mappings: selected.mappings,
    confidence: confidence(score, [`Detected ${mapped.length} canonical columns across ${semanticGroups} payroll semantic groups.`]),
  };
}

function isBlankRow(row: readonly PayrollCellValue[]) {
  return row.every((cell) => cell === null || cell === undefined || cellText(cell) === "");
}

function isRowNumberOnly(row: readonly PayrollCellValue[]) {
  const populated = row.filter((cell) => cell !== null && cell !== undefined && cellText(cell) !== "");
  return populated.length === 1 && parsePayrollNumber(populated[0]) !== undefined;
}

function isFooterRow(row: readonly PayrollCellValue[], mappings: readonly PayrollColumnMapping[]) {
  const employeeColumn = mappings.find((mapping) => mapping.field === "employeeName")?.columnIndex;
  const employeeLabel = employeeColumn === undefined ? "" : normalizePayrollHeader(row[employeeColumn]);
  if (FOOTER_PATTERN.test(employeeLabel)) return true;
  return row.some((cell, index) => {
    if (typeof cell !== "string" || !FOOTER_PATTERN.test(normalizePayrollHeader(cell))) return false;
    const before = row.slice(0, index).every((value) => value === null || cellText(value) === "" || parsePayrollNumber(value) !== undefined);
    return index <= 1 && before;
  });
}

function metadataValueAfterLabel(row: readonly PayrollCellValue[], cellIndex: number, labelPattern: RegExp) {
  const current = cellText(row[cellIndex]);
  const inline = current.replace(labelPattern, "");
  const cleanedInline = cleanMetadataValue(inline);
  if (cleanedInline) return cleanedInline;
  for (let index = cellIndex + 1; index < row.length; index += 1) {
    const adjacent = cleanMetadataValue(cellText(row[index]));
    if (adjacent) return adjacent;
  }
  return undefined;
}

function addDetectedField(metadata: PayrollImportMetadata, field: PayrollMetadataField) {
  if (!metadata.detectedFields.includes(field)) metadata.detectedFields.push(field);
}

function parsePeriodRange(value: string | undefined) {
  if (!value) return {};
  const fullDatePattern = /(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}|(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s+\d{1,2},?\s+\d{4})/gi;
  const tokens = value.match(fullDatePattern) ?? [];
  if (tokens.length >= 2) return { periodStart: normalizePayrollDate(tokens[0]), periodEnd: normalizePayrollDate(tokens[1]) };
  const shared = /^\s*([A-Za-z]+)\s+(\d{1,2})\s*[-–—]\s*(\d{1,2}),?\s+(\d{4})\s*$/.exec(value);
  if (shared) {
    return {
      periodStart: normalizePayrollDate(`${shared[1]} ${shared[2]}, ${shared[4]}`),
      periodEnd: normalizePayrollDate(`${shared[1]} ${shared[3]}, ${shared[4]}`),
    };
  }
  return {};
}

function detectMetadata(rows: PayrollCellValue[][]): PayrollImportMetadata {
  const metadata: PayrollImportMetadata = { detectedFields: [], rawRows: rows.map((row) => [...row]) };
  for (const row of rows) {
    for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
      const text = cellText(row[cellIndex]);
      const normalized = normalizePayrollHeader(text);
      if (!text) continue;
      if (/\bADMIN(?:ISTRATIVE)?\b.*\bOFFICE\b/.test(normalized)) {
        metadata.title = text;
        addDetectedField(metadata, "title");
      } else if (!metadata.title && /\b(PAYROLL|WEEKLY SALARY|GENERAL OPERATIONS|OVERHEAD)\b/.test(normalized)) {
        metadata.title = text;
        addDetectedField(metadata, "title");
      }
      if (/\bPROJECT NAME\b/.test(normalized)) {
        metadata.projectName = metadataValueAfterLabel(row, cellIndex, /^.*?PROJECT\s+NAME\s*:?/i);
        addDetectedField(metadata, "projectName");
      }
      if (/\bPROJECT CODE\b/.test(normalized)) {
        metadata.projectCode = metadataValueAfterLabel(row, cellIndex, /^.*?PROJECT\s+CODE\s*:?/i);
        addDetectedField(metadata, "projectCode");
      }
      if (/\bPROJECT LOCATION\b/.test(normalized)) {
        metadata.projectLocation = metadataValueAfterLabel(row, cellIndex, /^.*?PROJECT\s+LOCATION\s*:?/i);
        addDetectedField(metadata, "projectLocation");
      }
      if (/\bPERIOD COVERED\b/.test(normalized)) {
        metadata.periodCovered = metadataValueAfterLabel(row, cellIndex, /^.*?PERIOD\s+COVERED\s*:?/i);
        const range = parsePeriodRange(metadata.periodCovered);
        metadata.periodStart = range.periodStart;
        metadata.periodEnd = range.periodEnd;
        addDetectedField(metadata, "periodCovered");
        if (metadata.periodStart) addDetectedField(metadata, "periodStart");
        if (metadata.periodEnd) addDetectedField(metadata, "periodEnd");
      }
      if (/\b(PROJECT IN CHARGE|FOREMAN)\b/.test(normalized)) {
        const beforeContact = text.split(/CONTACT\s+NUMBER\s*:?/i)[0];
        metadata.projectInCharge = cleanMetadataValue(beforeContact.replace(/^.*?(?:PROJECT\s*[- ]?IN\s*[- ]?CHARGE|FOREMAN)\s*\/?\s*(?:FOREMAN)?\s*:?/i, ""));
        addDetectedField(metadata, "projectInCharge");
      }
      if (/\bCONTACT NUMBER\b/.test(normalized)) {
        const contactSection = text.split(/CONTACT\s+NUMBER\s*:?/i)[1];
        metadata.contactNumber = cleanMetadataValue(contactSection) ?? metadataValueAfterLabel(row, cellIndex, /^.*?CONTACT\s+NUMBER\s*:?/i);
        addDetectedField(metadata, "contactNumber");
      }
      if (/\bPAY DATE\b/.test(normalized)) {
        metadata.payDate = normalizePayrollDate(metadataValueAfterLabel(row, cellIndex, /^.*?PAY\s+DATE\s*:?/i));
        addDetectedField(metadata, "payDate");
      }
    }
  }
  return metadata;
}

function detectContext(metadata: PayrollImportMetadata, rawRows: PayrollCellValue[][]): PayrollDetectedContext {
  const searchable = [metadata.title, ...rawRows.slice(0, 12).flat().map(cellText)].filter(Boolean).join(" ");
  const normalized = normalizePayrollHeader(searchable);
  if (/\bADMIN(?:ISTRATIVE)?\b.*\bOFFICE\b/.test(normalized) || /\bOFFICE PAYROLL\b/.test(normalized)) {
    const evidence = [metadata.title || "Administrative/Office label"];
    return { type: "ADMIN_OFFICE", label: metadata.title, evidence, confidence: confidence(0.99, ["Administrative/Office title detected."]) };
  }
  if (metadata.detectedFields.some((field) => ["projectName", "projectCode", "projectLocation", "projectInCharge"].includes(field))) {
    const evidence = metadata.detectedFields.filter((field) => field.startsWith("project"));
    return { type: "PROJECT", label: metadata.projectName, evidence, confidence: confidence(0.96, ["Project metadata labels detected above the payroll table."]) };
  }
  if (/\b(GENERAL OVERHEAD|GENERAL OPERATIONS|WAREHOUSE|WORKSHOP|EQUIPMENT)\b/.test(normalized)) {
    return { type: "GENERAL_OVERHEAD", label: metadata.title, evidence: [metadata.title || "Overhead label"], confidence: confidence(0.9, ["A recognized non-project operating context was detected."]) };
  }
  return { type: "UNALLOCATED_REVIEW", label: metadata.title, evidence: [], confidence: confidence(0.3, ["No reliable project or non-project cost context was detected."]) };
}

function parsePayType(value: PayrollCellValue | undefined) {
  const normalized = normalizePayrollHeader(value);
  if (/MONTH/.test(normalized)) return "MONTHLY" as const;
  if (/DAY|DAILY/.test(normalized)) return "DAILY" as const;
  if (/HOUR/.test(normalized)) return "HOURLY" as const;
  return undefined;
}

function parseCostContext(value: PayrollCellValue | undefined): PayrollCostContext | undefined {
  const normalized = normalizePayrollHeader(value);
  if (/PROJECT|SITE|JOB/.test(normalized)) return "PROJECT";
  if (/ADMIN|OFFICE/.test(normalized)) return "ADMIN_OFFICE";
  if (/OVERHEAD|GENERAL|WAREHOUSE|WORKSHOP|EQUIPMENT/.test(normalized)) return "GENERAL_OVERHEAD";
  if (normalized) return "UNALLOCATED_REVIEW";
  return undefined;
}

export function applyPayrollColumnMappings(
  rawRow: PayrollCellValue[],
  mappings: readonly PayrollColumnMapping[],
  defaults: Partial<Pick<ParsedPayrollRow, "periodStart" | "periodEnd" | "payDate" | "projectCode" | "projectName" | "costContext">> = {},
) {
  const values: Partial<ParsedPayrollRow> = { ...defaults };
  for (const mapping of mappings) {
    if (!mapping.field) continue;
    const rawValue = rawRow[mapping.columnIndex];
    if (NUMERIC_FIELDS.has(mapping.field)) {
      const parsed = parsePayrollNumber(rawValue);
      if (parsed !== undefined) (values as Record<string, unknown>)[mapping.field] = parsed;
    } else if (DATE_FIELDS.has(mapping.field)) {
      const parsed = normalizePayrollDate(rawValue);
      if (parsed) (values as Record<string, unknown>)[mapping.field] = parsed;
    } else if (mapping.field === "payType") {
      values.payType = parsePayType(rawValue);
    } else if (mapping.field === "costContext") {
      values.costContext = parseCostContext(rawValue) ?? values.costContext;
    } else {
      const parsed = asString(rawValue);
      if (parsed) (values as Record<string, unknown>)[mapping.field] = parsed;
    }
  }
  if (!values.payType) {
    if (values.monthlyRate !== undefined) values.payType = "MONTHLY";
    else if (values.dailyRate !== undefined) values.payType = "DAILY";
    else if (values.hourlyRate !== undefined) values.payType = "HOURLY";
  }
  return values;
}

function reconciliationCheck(expected: number | undefined, actual: number | undefined, label: string, tolerance: number): PayrollReconciliationCheck {
  if (expected === undefined || actual === undefined) return { status: "NOT_APPLICABLE", message: `${label} could not be checked because one or more inputs are absent.` };
  const difference = Math.round((actual - expected) * 100) / 100;
  const allowed = Math.max(tolerance, Math.abs(expected) * 0.0001);
  return Math.abs(difference) <= allowed
    ? { status: "PASS", expected, actual, difference, message: `${label} reconciles.` }
    : { status: "WARNING", expected, actual, difference, message: `${label} differs from the imported supporting amounts.` };
}

export function reconcileParsedPayrollRow(row: Partial<ParsedPayrollRow>, tolerance = 0.01): PayrollRowReconciliation {
  const expectedRegular = row.dailyRate !== undefined && row.daysWorked !== undefined ? row.dailyRate * row.daysWorked : undefined;
  const expectedGross = row.regularPayImported !== undefined && row.overtimePayImported !== undefined
    ? row.regularPayImported + row.overtimePayImported
    : undefined;
  return {
    regularPay: reconciliationCheck(expectedRegular, row.regularPayImported, "Daily rate × days worked", tolerance),
    grossPay: reconciliationCheck(expectedGross, row.grossPayImported, "Regular pay + overtime pay", tolerance),
  };
}

function buildRowConfidence(row: Partial<ParsedPayrollRow>, reconciliation: PayrollRowReconciliation) {
  let score = 0.15;
  const reasons: string[] = [];
  if (row.employeeName) { score += 0.3; reasons.push("Employee name identified."); }
  else if (row.employeeCode) { score += 0.18; reasons.push("Employee code identified but employee name is missing."); }
  if (row.dailyRate !== undefined || row.hourlyRate !== undefined || row.monthlyRate !== undefined) score += 0.14;
  if (row.daysWorked !== undefined || row.regularHours !== undefined || row.overtimeHours !== undefined) score += 0.14;
  if (row.regularPayImported !== undefined || row.overtimePayImported !== undefined || row.grossPayImported !== undefined) score += 0.14;
  if (row.costContext && row.costContext !== "UNALLOCATED_REVIEW") score += 0.08;
  const applicable = Object.values(reconciliation).filter((check) => check.status !== "NOT_APPLICABLE");
  if (applicable.length && applicable.every((check) => check.status === "PASS")) { score += 0.05; reasons.push("Applicable imported amounts reconcile."); }
  if (applicable.some((check) => check.status === "WARNING")) score -= 0.12;
  return confidence(score, reasons);
}

function hasMeaningfulMappedData(values: Partial<ParsedPayrollRow>) {
  if (values.employeeName || values.employeeCode) return true;
  const numericCount = [...NUMERIC_FIELDS].filter((field) => (values as Record<string, unknown>)[field] !== undefined).length;
  return Boolean(values.position) && numericCount >= 2;
}

function parseDataRow(sourceSheet: string, sourceRow: number, rawRow: PayrollCellValue[], table: PayrollDetectedTable, metadata: PayrollImportMetadata, context: PayrollDetectedContext) {
  if (isBlankRow(rawRow) || isRowNumberOnly(rawRow) || isFooterRow(rawRow, table.mappings)) return undefined;
  const mapped = applyPayrollColumnMappings(rawRow, table.mappings, {
    periodStart: metadata.periodStart,
    periodEnd: metadata.periodEnd,
    payDate: metadata.payDate,
    projectCode: metadata.projectCode,
    projectName: metadata.projectName,
    costContext: context.type,
  });
  if (!hasMeaningfulMappedData(mapped)) return undefined;
  const warnings: string[] = [];
  if (!mapped.employeeName) warnings.push("Employee name is missing; this row requires review before matching or import.");
  if (mapped.costContext === "UNALLOCATED_REVIEW") warnings.push("Labor cost context is uncertain and must remain unallocated until reviewed.");
  const reconciliation = reconcileParsedPayrollRow(mapped);
  if (reconciliation.regularPay.status === "WARNING") warnings.push(reconciliation.regularPay.message);
  if (reconciliation.grossPay.status === "WARNING") warnings.push(reconciliation.grossPay.message);
  return {
    ...mapped,
    sourceSheet,
    sourceRow,
    costContext: mapped.costContext ?? "UNALLOCATED_REVIEW",
    rawRow: [...rawRow],
    warnings,
    confidence: buildRowConfidence(mapped, reconciliation),
    reconciliation,
  } as ParsedPayrollRow;
}

function hashSignature(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createPayrollStructureSignature(table: PayrollDetectedTable, context: PayrollCostContext) {
  const columns = table.mappings.map((mapping) => `${mapping.normalizedHeader}:${mapping.field ?? "IGNORE"}`).join("|");
  return `payroll-v1-${hashSignature(`${context}|${columns}`)}`;
}

function formatFromFileName(fileName?: string): PayrollWorkbookFormat {
  const match = /\.([^.]+)$/.exec(fileName ?? "");
  const extension = match?.[1].toLowerCase();
  if (extension === "xlsx" || extension === "xls" || extension === "csv" || extension === "xlsm") return extension;
  return "unknown";
}

function inputByteLength(input: ArrayBuffer | Uint8Array | string) {
  if (typeof input === "string") return new TextEncoder().encode(input).byteLength;
  return input instanceof ArrayBuffer ? input.byteLength : input.byteLength;
}

function readWorkbook(input: ArrayBuffer | Uint8Array | string, format: PayrollWorkbookFormat) {
  try {
    if (typeof input === "string") {
      if (format !== "csv" && format !== "unknown") throw new PayrollImportError("UNSUPPORTED_FORMAT", "String input is supported only for CSV payroll files.");
      return XLSX.read(input, { type: "string", cellDates: true, cellFormula: false, cellText: true });
    }
    return XLSX.read(input, { type: "array", cellDates: true, cellFormula: false, cellText: true });
  } catch (error) {
    if (error instanceof PayrollImportError) throw error;
    throw new PayrollImportError("MALFORMED_WORKBOOK", "The payroll workbook could not be read. Confirm that it is a valid, non-encrypted spreadsheet.");
  }
}

function parseSheet(workbook: XLSX.WorkBook, sourceSheet: string, sheetIndex: number, limits: PayrollParserLimits): ParsedPayrollSheet {
  const worksheet = workbook.Sheets[sourceSheet];
  const hidden = Boolean(workbook.Workbook?.Sheets?.[sheetIndex]?.Hidden);
  if (!worksheet?.["!ref"]) {
    const metadata = detectMetadata([]);
    const context = detectContext(metadata, []);
    return { sourceSheet, sheetIndex, hidden, status: "BLANK", rawRows: [], metadata, context, rows: [], warnings: ["Sheet is blank."], confidence: confidence(0, ["No populated cells were found."]) };
  }
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  const rowCount = range.e.r - range.s.r + 1;
  const columnCount = range.e.c - range.s.c + 1;
  if (rowCount > limits.maxRows || columnCount > limits.maxColumns) {
    throw new PayrollImportError("SHEET_TOO_LARGE", `Sheet "${sourceSheet}" exceeds the payroll import limit of ${limits.maxRows} rows and ${limits.maxColumns} columns.`);
  }
  const rawRows = XLSX.utils.sheet_to_json<PayrollCellValue[]>(worksheet, { header: 1, raw: true, defval: null, blankrows: true });
  if (!rawRows.length || rawRows.every(isBlankRow)) {
    const metadata = detectMetadata(rawRows);
    const context = detectContext(metadata, rawRows);
    return { sourceSheet, sheetIndex, hidden, status: "BLANK", rawRows, metadata, context, rows: [], warnings: ["Sheet is blank."], confidence: confidence(0, ["No populated cells were found."]) };
  }
  const table = detectPayrollTable(rawRows, limits.headerScanRows);
  const metadataRows = table ? rawRows.slice(0, table.headerRow - 1) : rawRows.slice(0, limits.headerScanRows);
  const metadata = detectMetadata(metadataRows);
  const context = detectContext(metadata, rawRows);
  const warnings: string[] = [];
  if (hidden) warnings.push("Sheet is hidden in the source workbook.");
  if (!table) {
    warnings.push("No sufficiently reliable payroll table header was detected.");
    return { sourceSheet, sheetIndex, hidden, status: "UNRECOGNIZED", rawRows, metadata, context, rows: [], warnings, confidence: confidence(0.25, ["Payroll table header was not detected."]) };
  }
  const dataStartIndex = table.dataStartRow - 1;
  const dataEndIndex = table.dataEndRow - 1;
  const rows = rawRows.slice(dataStartIndex, dataEndIndex + 1).flatMap((rawRow, offset) => {
    const parsed = parseDataRow(sourceSheet, dataStartIndex + offset + 1, rawRow, table, metadata, context);
    return parsed ? [parsed] : [];
  });
  if (!rows.length) warnings.push("Payroll headers were detected, but no employee data rows were found.");
  const contextWeight = context.type === "UNALLOCATED_REVIEW" ? 0.15 : 0.3;
  const rowScore = rows.length ? rows.reduce((sum, row) => sum + row.confidence.score, 0) / rows.length : table.confidence.score;
  const sheetScore = table.confidence.score * 0.55 + rowScore * 0.3 + context.confidence.score * contextWeight;
  return {
    sourceSheet,
    sheetIndex,
    hidden,
    status: "DETECTED",
    rawRows,
    metadata,
    context,
    table,
    rows,
    warnings,
    confidence: confidence(sheetScore, ["Combined header, mapping, row, and labor-context confidence."]),
    structureSignature: createPayrollStructureSignature(table, context.type),
  };
}

export function parsePayrollWorkbook(input: ArrayBuffer | Uint8Array | string, options: ParsePayrollWorkbookOptions = {}): ParsedPayrollWorkbook {
  const limits = { ...DEFAULT_PAYROLL_PARSER_LIMITS, ...options.limits };
  const format = formatFromFileName(options.fileName);
  if (format === "unknown" && options.fileName) throw new PayrollImportError("UNSUPPORTED_FORMAT", "Payroll imports support .xlsx, .xls, .xlsm data, and .csv files.");
  if (inputByteLength(input) > limits.maxFileBytes) throw new PayrollImportError("FILE_TOO_LARGE", `Payroll file exceeds the ${limits.maxFileBytes}-byte import limit.`);
  const workbook = readWorkbook(input, format);
  if (workbook.SheetNames.length > limits.maxWorksheets) throw new PayrollImportError("TOO_MANY_SHEETS", `Payroll workbook exceeds the ${limits.maxWorksheets}-sheet import limit.`);
  const sheets = workbook.SheetNames.map((sourceSheet, sheetIndex) => parseSheet(workbook, sourceSheet, sheetIndex, limits));
  const detectedSheets = sheets.filter((sheet) => sheet.status === "DETECTED");
  const warnings: string[] = [];
  if (!detectedSheets.length) warnings.push("No payroll tables were detected in the workbook.");
  const workbookScore = detectedSheets.length ? detectedSheets.reduce((sum, sheet) => sum + sheet.confidence.score, 0) / detectedSheets.length : 0.1;
  return {
    fileName: options.fileName,
    format,
    sheetNames: [...workbook.SheetNames],
    sheets,
    warnings,
    confidence: confidence(workbookScore, [`Detected ${detectedSheets.length} payroll sheet${detectedSheets.length === 1 ? "" : "s"}.`]),
  };
}
