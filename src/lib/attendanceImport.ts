import * as XLSX from "xlsx";
import type { AttendanceRecord, AttendanceStatus, Worker } from "../types.ts";
import { applyAttendanceBatch, type AttendanceRecordInput } from "./payrollWorkforce.ts";

export type AttendanceImportMatchStatus = "MATCHED" | "AMBIGUOUS" | "UNMATCHED" | "INVALID" | "DUPLICATE" | "OUT_OF_PERIOD";
export type AttendanceImportIssueCode = "MISSING_WORKER" | "AMBIGUOUS_WORKER" | "INVALID_DATE" | "INVALID_TIME" | "INVALID_STATUS" | "INVALID_NUMBER" | "OUT_OF_PERIOD" | "DUPLICATE_DAILY_ATTENDANCE";

export interface AttendanceImportRow {
  rowNumber: number;
  workerId?: string;
  employeeCode?: string;
  employeeName?: string;
  attendanceDate?: string;
  status?: AttendanceStatus;
  timeIn?: string;
  timeOut?: string;
  regularHours?: number;
  overtimeHours?: number;
  notes?: string;
  matchStatus: AttendanceImportMatchStatus;
  issueCodes: AttendanceImportIssueCode[];
  issues: string[];
}

export interface AttendanceImportPreview {
  fileName?: string;
  sheetName: string;
  headerRowNumber: number;
  headers: string[];
  rows: AttendanceImportRow[];
  counts: {
    matched: number;
    ambiguous: number;
    unmatched: number;
    invalid: number;
    duplicate: number;
    outOfPeriod: number;
  };
  canCommit: boolean;
}

export interface AttendanceImportOptions {
  workers: readonly Pick<Worker, "id" | "employeeCode" | "displayName" | "firstName" | "lastName">[];
  periodStart?: string;
  periodEnd?: string;
  existingRecords?: readonly AttendanceRecord[];
  fileName?: string;
  maxRows?: number;
}

type AttendanceImportField = keyof Pick<AttendanceImportRow, "employeeCode" | "employeeName" | "attendanceDate" | "status" | "timeIn" | "timeOut" | "regularHours" | "overtimeHours" | "notes">;
const HEADER_ALIASES: Record<string, AttendanceImportField[]> = {
  employeecode: ["employeeCode"], employeeno: ["employeeCode"], staffcode: ["employeeCode"], code: ["employeeCode"],
  employeename: ["employeeName"], name: ["employeeName"], worker: ["employeeName"], workername: ["employeeName"],
  date: ["attendanceDate"], attendancedate: ["attendanceDate"], workdate: ["attendanceDate"],
  status: ["status"], attendancestatus: ["status"], attendance: ["status"],
  timein: ["timeIn"], clockin: ["timeIn"], intime: ["timeIn"],
  timeout: ["timeOut"], clockout: ["timeOut"], outtime: ["timeOut"],
  regularhours: ["regularHours"], regularh: ["regularHours"], hours: ["regularHours"],
  overtimehours: ["overtimeHours"], overtimeh: ["overtimeHours"], othours: ["overtimeHours"],
  notes: ["notes"], remarks: ["notes"], comment: ["notes"],
};

function normalized(value: unknown) { return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function displayNormalized(value: unknown) { return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function numberValue(value: unknown) { const parsed = Number(String(value ?? "").replace(/,/g, "")); return Number.isFinite(parsed) ? parsed : undefined; }
function timeValue(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  return match ? String(Number(match[1])).padStart(2, "0") + ":" + match[2] : undefined;
}
function dateValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return String(parsed.y).padStart(4, "0") + "-" + String(parsed.m).padStart(2, "0") + "-" + String(parsed.d).padStart(2, "0");
  }
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(raw + "T00:00:00.000Z");
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === raw ? raw : undefined;
  }
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return undefined;
  const candidate = match[3] + "-" + String(Number(match[1])).padStart(2, "0") + "-" + String(Number(match[2])).padStart(2, "0");
  return dateValue(candidate);
}
function statusValue(value: unknown): AttendanceStatus | undefined {
  const key = normalized(value);
  const statuses: Record<string, AttendanceStatus> = {
    present: "PRESENT", p: "PRESENT", absent: "ABSENT", a: "ABSENT", partial: "PARTIAL", halfday: "PARTIAL",
    onleave: "ON_LEAVE", leave: "ON_LEAVE", restday: "REST_DAY", rest: "REST_DAY", holiday: "HOLIDAY", officialbusiness: "OFFICIAL_BUSINESS", ob: "OFFICIAL_BUSINESS",
  };
  return statuses[key];
}

function findHeaderRow(rows: unknown[][]) {
  for (let index = 0; index < Math.min(rows.length, 25); index += 1) {
    const keys = new Set((rows[index] || []).map(normalized));
    if ([...keys].some((key) => HEADER_ALIASES[key]?.includes("attendanceDate")) && [...keys].some((key) => HEADER_ALIASES[key]?.includes("employeeCode") || HEADER_ALIASES[key]?.includes("employeeName"))) return index;
  }
  return -1;
}

function headerMap(headers: unknown[]) {
  const map = new Map<string, keyof AttendanceImportRow>();
  headers.forEach((header, index) => {
    const field = HEADER_ALIASES[normalized(header)]?.[0];
    if (field && !map.has(field)) map.set(String(index), field);
  });
  return map;
}

function rowValue(values: unknown[], map: Map<string, keyof AttendanceImportRow>, field: keyof AttendanceImportRow) {
  for (const [index, mapped] of map) if (mapped === field) return values[Number(index)];
  return undefined;
}

function matchWorker(options: AttendanceImportOptions, code: string, name: string) {
  const exactCode = code ? options.workers.filter((worker) => normalized(worker.employeeCode) === normalized(code)) : [];
  if (exactCode.length === 1) return { workerId: exactCode[0]!.id, status: "MATCHED" as const };
  if (exactCode.length > 1) return { status: "AMBIGUOUS" as const };
  const nameKey = displayNormalized(name);
  const byName = nameKey ? options.workers.filter((worker) => displayNormalized(worker.displayName || (worker.firstName + " " + worker.lastName)) === nameKey) : [];
  if (byName.length === 1) return { workerId: byName[0]!.id, status: "MATCHED" as const };
  if (byName.length > 1) return { status: "AMBIGUOUS" as const };
  return { status: "UNMATCHED" as const };
}

export function parseAttendanceWorkbook(bytes: Uint8Array | ArrayBuffer, options: AttendanceImportOptions): AttendanceImportPreview {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: false, raw: true });
  const sheetName = workbook.SheetNames.find((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name]!, { header: 1, raw: true, defval: "" });
    return findHeaderRow(rows) >= 0;
  }) || workbook.SheetNames[0] || "Attendance";
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, { header: 1, raw: true, defval: "" });
  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex < 0) return { fileName: options.fileName, sheetName, headerRowNumber: 0, headers: [], rows: [], counts: { matched: 0, ambiguous: 0, unmatched: 0, invalid: 0, duplicate: 0, outOfPeriod: 0 }, canCommit: false };
  const headers = (rows[headerRowIndex] || []).map((value) => String(value ?? ""));
  const map = headerMap(headers);
  const output: AttendanceImportRow[] = [];
  const seen = new Set<string>();
  for (const [offset, values] of rows.slice(headerRowIndex + 1).entries()) {
    if (options.maxRows !== undefined && output.length >= options.maxRows) break;
    if (!values.some((value) => String(value ?? "").trim())) continue;
    const rowNumber = headerRowIndex + offset + 2;
    const employeeCode = String(rowValue(values, map, "employeeCode") ?? "").trim() || undefined;
    const employeeName = String(rowValue(values, map, "employeeName") ?? "").trim() || undefined;
    const attendanceDate = dateValue(rowValue(values, map, "attendanceDate"));
    const timeInRaw = rowValue(values, map, "timeIn");
    const timeOutRaw = rowValue(values, map, "timeOut");
    const timeIn = timeInRaw === undefined || String(timeInRaw).trim() === "" ? undefined : timeValue(timeInRaw);
    const timeOut = timeOutRaw === undefined || String(timeOutRaw).trim() === "" ? undefined : timeValue(timeOutRaw);
    const status = statusValue(rowValue(values, map, "status")) || (timeIn && timeOut ? "PRESENT" : undefined);
    const regularRaw = rowValue(values, map, "regularHours");
    const overtimeRaw = rowValue(values, map, "overtimeHours");
    const regularHours = regularRaw === undefined || String(regularRaw).trim() === "" ? undefined : numberValue(regularRaw);
    const overtimeHours = overtimeRaw === undefined || String(overtimeRaw).trim() === "" ? undefined : numberValue(overtimeRaw);
    const issues: string[] = [];
    const issueCodes: AttendanceImportIssueCode[] = [];
    const match = matchWorker(options, employeeCode || "", employeeName || "");
    if (match.status === "UNMATCHED") { issueCodes.push("MISSING_WORKER"); issues.push("Worker code/name did not match a worker."); }
    if (match.status === "AMBIGUOUS") { issueCodes.push("AMBIGUOUS_WORKER"); issues.push("Worker name/code matched multiple workers."); }
    if (!attendanceDate) { issueCodes.push("INVALID_DATE"); issues.push("Date is missing or invalid."); }
    if ((timeInRaw !== undefined && String(timeInRaw).trim() && !timeIn) || (timeOutRaw !== undefined && String(timeOutRaw).trim() && !timeOut)) { issueCodes.push("INVALID_TIME"); issues.push("Time in/out must use HH:MM."); }
    if (!status) { issueCodes.push("INVALID_STATUS"); issues.push("Status is missing or invalid."); }
    if ((regularRaw !== undefined && String(regularRaw).trim() && regularHours === undefined) || (overtimeRaw !== undefined && String(overtimeRaw).trim() && overtimeHours === undefined)) { issueCodes.push("INVALID_NUMBER"); issues.push("Hours must be non-negative numbers."); }
    if ((regularHours !== undefined && regularHours < 0) || (overtimeHours !== undefined && overtimeHours < 0)) { issueCodes.push("INVALID_NUMBER"); issues.push("Hours cannot be negative."); }
    if (attendanceDate && options.periodStart && options.periodEnd && (attendanceDate < options.periodStart || attendanceDate > options.periodEnd)) { issueCodes.push("OUT_OF_PERIOD"); issues.push("Date is outside the selected payroll period."); }
    const key = match.workerId && attendanceDate ? String(match.workerId) + ":" + attendanceDate : undefined;
    if (key && (seen.has(key) || options.existingRecords?.some((record) => record.recordStatus !== "VOID" && record.workerId === match.workerId && record.attendanceDate === attendanceDate))) { issueCodes.push("DUPLICATE_DAILY_ATTENDANCE"); issues.push("A daily attendance record already exists for this worker/date."); }
    if (key) seen.add(key);
    const matchStatus: AttendanceImportMatchStatus = issueCodes.includes("AMBIGUOUS_WORKER") ? "AMBIGUOUS" : issueCodes.includes("MISSING_WORKER") ? "UNMATCHED" : issueCodes.includes("OUT_OF_PERIOD") ? "OUT_OF_PERIOD" : issueCodes.includes("DUPLICATE_DAILY_ATTENDANCE") ? "DUPLICATE" : issueCodes.length ? "INVALID" : "MATCHED";
    output.push({ rowNumber, workerId: match.workerId, employeeCode, employeeName, attendanceDate, status, timeIn, timeOut, regularHours, overtimeHours, notes: String(rowValue(values, map, "notes") ?? "").trim() || undefined, matchStatus, issueCodes, issues });
  }
  const counts = {
    matched: output.filter((row) => row.matchStatus === "MATCHED").length,
    ambiguous: output.filter((row) => row.matchStatus === "AMBIGUOUS").length,
    unmatched: output.filter((row) => row.matchStatus === "UNMATCHED").length,
    invalid: output.filter((row) => row.matchStatus === "INVALID").length,
    duplicate: output.filter((row) => row.matchStatus === "DUPLICATE").length,
    outOfPeriod: output.filter((row) => row.matchStatus === "OUT_OF_PERIOD").length,
  };
  return { fileName: options.fileName, sheetName, headerRowNumber: headerRowIndex + 1, headers, rows: output, counts, canCommit: output.length > 0 && output.every((row) => row.matchStatus === "MATCHED") };
}

export function commitAttendanceImportPreview(preview: AttendanceImportPreview, options: { periodId?: string; existingRecords?: readonly AttendanceRecord[] } = {}) {
  if (!preview.canCommit) throw new Error("Resolve unmatched, ambiguous, invalid, duplicate, and out-of-period rows before committing attendance.");
  const records: AttendanceRecordInput[] = preview.rows.map((row) => ({
    workerId: row.workerId!,
    periodId: options.periodId,
    attendanceDate: row.attendanceDate!,
    attendanceStatus: row.status,
    actualTimeIn: row.timeIn,
    actualTimeOut: row.timeOut,
    regularMinutes: row.regularHours === undefined ? undefined : Math.round(row.regularHours * 60),
    overtimeMinutes: row.overtimeHours === undefined ? undefined : Math.round(row.overtimeHours * 60),
    notes: row.notes,
    source: "IMPORT",
    recordStatus: "DRAFT",
  }));
  const batch = applyAttendanceBatch({ records, existingRecords: options.existingRecords || [], defaultSource: "IMPORT", defaultRecordStatus: "DRAFT" });
  if (!batch.valid) throw new Error(batch.errors.map((issue) => issue.message).join(" "));
  return batch.created.map((record) => ({ ...record, id: record.id || "local-attendance-" + Date.now() + "-" + Math.random().toString(36).slice(2), periodId: record.periodId || options.periodId, createdAt: record.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() })) as AttendanceRecord[];
}
