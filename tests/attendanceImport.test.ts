import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { commitAttendanceImportPreview, parseAttendanceWorkbook } from "../src/lib/attendanceImport.ts";
import type { AttendanceRecord } from "../src/types.ts";

const workers = [
  { id: "worker-1", employeeCode: "E-001", displayName: "Ana Santos", firstName: "Ana", lastName: "Santos" },
  { id: "worker-2", employeeCode: "E-002", displayName: "Ben Cruz", firstName: "Ben", lastName: "Cruz" },
];

function workbook(rows: unknown[][]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Attendance");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

test("attendance import matches exact employee code and commits only reviewed rows", () => {
  const preview = parseAttendanceWorkbook(workbook([
    ["Employee Code", "Date", "Status", "Time In", "Time Out", "Notes"],
    ["E-001", "2026-08-03", "Present", "08:00", "17:00", "Site briefing"],
  ]), { workers, periodStart: "2026-08-01", periodEnd: "2026-08-15", fileName: "attendance.xlsx" });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.counts.matched, 1);
  const records = commitAttendanceImportPreview(preview, { periodId: "period-1" });
  assert.equal(records.length, 1);
  assert.equal(records[0]?.workerId, "worker-1");
  assert.equal(records[0]?.recordStatus, "DRAFT");
  assert.equal(records[0]?.source, "IMPORT");
});

test("attendance import uses unique-name fallback and blocks ambiguous names", () => {
  const unique = parseAttendanceWorkbook(workbook([
    ["Employee Name", "Date", "Status"],
    ["Ben Cruz", "2026-08-03", "P"],
  ]), { workers, periodStart: "2026-08-01", periodEnd: "2026-08-15" });
  assert.equal(unique.rows[0]?.workerId, "worker-2");
  assert.equal(unique.canCommit, true);

  const ambiguous = parseAttendanceWorkbook(workbook([
    ["Employee Name", "Date", "Status"],
    ["Ana Santos", "2026-08-03", "P"],
  ]), { workers: [...workers, { ...workers[0], id: "worker-3" }], periodStart: "2026-08-01", periodEnd: "2026-08-15" });
  assert.equal(ambiguous.rows[0]?.matchStatus, "AMBIGUOUS");
  assert.equal(ambiguous.canCommit, false);
});

test("attendance import reports invalid dates, out-of-period rows, and duplicate daily records", () => {
  const existing: AttendanceRecord = {
    id: "attendance-1",
    workerId: "worker-1",
    attendanceDate: "2026-08-03",
    scheduledMinutes: 480,
    breakMinutes: 60,
    regularMinutes: 480,
    lateMinutes: 0,
    undertimeMinutes: 0,
    overtimeMinutes: 0,
    paidDayFraction: 1,
    attendanceStatus: "PRESENT",
    recordStatus: "CONFIRMED",
    source: "MANUAL",
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
  };
  const preview = parseAttendanceWorkbook(workbook([
    ["Employee Code", "Date", "Status"],
    ["E-001", "2026-08-03", "P"],
    ["E-002", "2026-08-31", "P"],
    ["E-001", "not-a-date", "P"],
  ]), { workers, periodStart: "2026-08-01", periodEnd: "2026-08-15", existingRecords: [existing] });
  assert.equal(preview.counts.duplicate, 1);
  assert.equal(preview.counts.outOfPeriod, 1);
  assert.equal(preview.counts.invalid, 1);
  assert.equal(preview.canCommit, false);
});
