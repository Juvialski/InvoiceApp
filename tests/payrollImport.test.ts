import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import {
  PayrollImportError,
  applyPayrollColumnMappings,
  createPayrollStructureSignature,
  mapPayrollColumns,
  normalizePayrollDate,
  parsePayrollNumber,
  parsePayrollWorkbook,
  reconcileParsedPayrollRow,
  type PayrollCellValue,
} from "../src/lib/payrollImport.ts";
import { adminOfficeTemplateRows, projectSiteTemplateRows, reorderedCsv } from "./fixtures/payrollWorkbookFixtures.ts";

const realProjectPath = "C:\\Users\\Al\\Downloads\\WEEKLY SALARY PROJECT SITE_ff2e8c3d-a516-4b77-be2b-a8eab3e7ab4e.xlsx";
const realAdminPath = "C:\\Users\\Al\\Downloads\\WEEKLY SALARY ADMIN OFFICE_d6a386e8-e75b-4ed9-985a-338bcb6bbf47.xlsx";

function workbookBytes(sheets: { name: string; rows: PayrollCellValue[][] }[], bookType: "xlsx" | "xls" = "xlsx") {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  return XLSX.write(workbook, { type: "buffer", bookType }) as Uint8Array;
}

function detectedSheet(parsed: ReturnType<typeof parsePayrollWorkbook>, name: string) {
  const sheet = parsed.sheets.find((candidate) => candidate.sourceSheet === name);
  assert.ok(sheet, `Expected sheet ${name}`);
  assert.equal(sheet.status, "DETECTED");
  assert.ok(sheet.table);
  return sheet;
}

test("portable Project Site fixture detects row 5, metadata, duplicate AMOUNT meaning, footer, and project context", () => {
  const parsed = parsePayrollWorkbook(workbookBytes([{ name: "Weekly Site", rows: projectSiteTemplateRows }]), { fileName: "renamed-project-payroll.xlsx" });
  const sheet = detectedSheet(parsed, "Weekly Site");

  assert.equal(sheet.table.headerRow, 5);
  assert.equal(sheet.metadata.projectName, "North River Pump Station");
  assert.equal(sheet.metadata.projectLocation, "San Pedro, Laguna");
  assert.equal(sheet.metadata.periodStart, "2026-08-18");
  assert.equal(sheet.metadata.periodEnd, "2026-08-23");
  assert.equal(sheet.metadata.projectInCharge, "Alex Rivera");
  assert.equal(sheet.metadata.contactNumber, "0917 555 0101");
  assert.equal(sheet.context.type, "PROJECT");
  assert.equal(sheet.table.mappings[5].field, "regularPayImported");
  assert.equal(sheet.table.mappings[7].field, "overtimePayImported");
  assert.equal(sheet.table.mappings[8].field, "grossPayImported");
  assert.equal(sheet.rows.length, 1);
  assert.equal(sheet.rows[0].sourceRow, 6);
  assert.equal(sheet.rows[0].costContext, "PROJECT");
  assert.equal(sheet.rows[0].reconciliation.regularPay.status, "PASS");
  assert.equal(sheet.rows[0].reconciliation.grossPay.status, "PASS");
  assert.equal(sheet.rows.some((row) => /TOTAL/.test(row.employeeName ?? "")), false);
});

test("portable Admin Office fixture maps synonyms and remains non-project overhead", () => {
  const parsed = parsePayrollWorkbook(workbookBytes([{ name: "Office", rows: adminOfficeTemplateRows }]), { fileName: "office-weekly.xlsx" });
  const sheet = detectedSheet(parsed, "Office");

  assert.equal(sheet.table.headerRow, 3);
  assert.equal(sheet.context.type, "ADMIN_OFFICE");
  assert.equal(sheet.metadata.projectName, undefined);
  assert.equal(sheet.table.mappings[3].field, "dailyRate");
  assert.equal(sheet.table.mappings[5].field, "regularPayImported");
  assert.equal(sheet.table.mappings[7].field, "overtimePayImported");
  assert.equal(sheet.rows.length, 1);
  assert.equal(sheet.rows[0].employeeName, "Noel Cruz");
  assert.equal(sheet.rows[0].projectName, undefined);
  assert.equal(sheet.rows[0].costContext, "ADMIN_OFFICE");
});

test("the supplied blank Project Site workbook is detected without treating numbered placeholders as employees", { skip: !existsSync(realProjectPath) }, () => {
  const parsed = parsePayrollWorkbook(readFileSync(realProjectPath), { fileName: realProjectPath });
  const sheet = detectedSheet(parsed, "Sheet1");
  assert.equal(sheet.table.headerRow, 5);
  assert.equal(sheet.context.type, "PROJECT");
  assert.deepEqual(sheet.metadata.detectedFields.filter((field) => field.startsWith("project")), ["projectName", "projectLocation", "projectInCharge"]);
  assert.equal(sheet.table.mappings[5].field, "regularPayImported");
  assert.equal(sheet.table.mappings[7].field, "overtimePayImported");
  assert.equal(sheet.rows.length, 0);
  assert.match(sheet.warnings.join(" "), /no employee data rows/i);
});

test("the supplied blank Admin Office workbook is detected as overhead with no fake project", { skip: !existsSync(realAdminPath) }, () => {
  const parsed = parsePayrollWorkbook(readFileSync(realAdminPath), { fileName: realAdminPath });
  const sheet = detectedSheet(parsed, "Sheet1");
  assert.equal(sheet.table.headerRow, 3);
  assert.equal(sheet.context.type, "ADMIN_OFFICE");
  assert.equal(sheet.metadata.projectName, undefined);
  assert.equal(sheet.table.mappings[3].field, "dailyRate");
  assert.equal(sheet.table.mappings[5].field, "regularPayImported");
  assert.equal(sheet.table.mappings[7].field, "overtimePayImported");
  assert.equal(sheet.rows.length, 0);
});

test("CSV parser handles reordered columns, currency text, unknown columns, and duplicate headings", () => {
  const parsed = parsePayrollWorkbook(reorderedCsv, { fileName: "weekly.csv" });
  const sheet = detectedSheet(parsed, "Sheet1");
  assert.equal(sheet.table.headerRow, 1);
  assert.equal(sheet.table.mappings[1].field, undefined);
  assert.equal(sheet.table.mappings[3].field, "overtimePayImported");
  assert.equal(sheet.table.mappings[6].field, "regularPayImported");
  assert.equal(sheet.rows.length, 1);
  assert.equal(sheet.rows[0].employeeName, "Dela Cruz, Ana");
  assert.equal(sheet.rows[0].dailyRate, 1_000);
  assert.equal(sheet.rows[0].grossPayImported, 5_300);
  assert.equal(sheet.rows[0].rawRow[8], "retain raw");
});

test("multiple-sheet workbook ignores a blank first sheet and parses monthly, hourly, date, and cached formula values", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), "Instructions");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Employee Code", "Employee Name", "Monthly Salary", "Period Start", "Period End", "Gross Pay"],
    ["E-100", "Lea Flores", 40_000, new Date("2026-08-01T00:00:00.000Z"), "08/31/2026", 40_000],
  ]), "Monthly");
  const hourly = XLSX.utils.aoa_to_sheet([
    ["Name", "Hourly Rate", "Regular Hours", "Regular Pay", "OT Hours", "OT Amount", "Total"],
    ["Sam Lim", 250, 8, null, 2, 750, null],
  ]);
  hourly.D2 = { t: "n", f: "B2*C2", v: 2_000 };
  hourly.G2 = { t: "n", f: "D2+F2", v: 2_750 };
  XLSX.utils.book_append_sheet(workbook, hourly, "Hourly");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Uint8Array;

  const parsed = parsePayrollWorkbook(bytes, { fileName: "mixed-payroll.xlsx" });
  assert.equal(parsed.sheets[0].status, "BLANK");
  const monthly = detectedSheet(parsed, "Monthly").rows[0];
  assert.equal(monthly.employeeCode, "E-100");
  assert.equal(monthly.payType, "MONTHLY");
  assert.equal(monthly.periodStart, "2026-08-01");
  assert.equal(monthly.periodEnd, "2026-08-31");
  const hourlyRow = detectedSheet(parsed, "Hourly").rows[0];
  assert.equal(hourlyRow.payType, "HOURLY");
  assert.equal(hourlyRow.regularPayImported, 2_000);
  assert.equal(hourlyRow.grossPayImported, 2_750);
  assert.equal(hourlyRow.reconciliation.grossPay.status, "PASS");
});

test("legacy .xls data uses the same deterministic parser", () => {
  const bytes = workbookBytes([{ name: "Office", rows: adminOfficeTemplateRows }], "xls");
  const parsed = parsePayrollWorkbook(bytes, { fileName: "legacy-office.xls" });
  assert.equal(parsed.format, "xls");
  assert.equal(detectedSheet(parsed, "Office").rows[0].costContext, "ADMIN_OFFICE");
});

test("normalization, manual mapping application, and reconciliation helpers remain independently usable", () => {
  assert.equal(parsePayrollNumber("(₱1,250.50)"), -1_250.5);
  assert.equal(normalizePayrollDate(46_235), "2026-08-01");
  const mappings = mapPayrollColumns(["Worker", "Rate/Day", "No. of Days", "Amount", "OT Hours", "Amount", "Gross"]);
  const mapped = applyPayrollColumnMappings(["Jo Yu", "1,000", 5, 5_000, 1, 250, 5_100], mappings, { costContext: "UNALLOCATED_REVIEW" });
  assert.equal(mapped.dailyRate, 1_000);
  assert.equal(mapped.regularPayImported, 5_000);
  assert.equal(mapped.overtimePayImported, 250);
  const reconciliation = reconcileParsedPayrollRow(mapped);
  assert.equal(reconciliation.regularPay.status, "PASS");
  assert.equal(reconciliation.grossPay.status, "WARNING");
  assert.equal(reconciliation.grossPay.difference, -150);
});

test("structural signatures survive safe filename changes for saved-template matching", () => {
  const bytes = workbookBytes([{ name: "Office", rows: adminOfficeTemplateRows }]);
  const first = detectedSheet(parsePayrollWorkbook(bytes, { fileName: "client-original.xlsx" }), "Office");
  const renamed = detectedSheet(parsePayrollWorkbook(bytes, { fileName: "2026-08-payroll-renamed.xlsx" }), "Office");
  assert.equal(first.structureSignature, renamed.structureSignature);
  assert.equal(first.structureSignature, createPayrollStructureSignature(first.table, "ADMIN_OFFICE"));
});

test("bounded parser rejects unsupported, oversized, over-sheeted, and over-row workbooks clearly", () => {
  const bytes = workbookBytes([{ name: "Office", rows: adminOfficeTemplateRows }]);
  assert.throws(() => parsePayrollWorkbook(bytes, { fileName: "payroll.pdf" }), (error: unknown) => error instanceof PayrollImportError && error.code === "UNSUPPORTED_FORMAT");
  assert.throws(() => parsePayrollWorkbook(bytes, { fileName: "payroll.xlsx", limits: { maxFileBytes: 1 } }), (error: unknown) => error instanceof PayrollImportError && error.code === "FILE_TOO_LARGE");
  assert.throws(() => parsePayrollWorkbook(bytes, { fileName: "payroll.xlsx", limits: { maxWorksheets: 0 } }), (error: unknown) => error instanceof PayrollImportError && error.code === "TOO_MANY_SHEETS");
  assert.throws(() => parsePayrollWorkbook(bytes, { fileName: "payroll.xlsx", limits: { maxRows: 2 } }), (error: unknown) => error instanceof PayrollImportError && error.code === "SHEET_TOO_LARGE");
});
