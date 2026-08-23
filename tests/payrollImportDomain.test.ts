import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parsePayrollWorkbook } from "../src/lib/payrollImport.ts";
import { buildDraftPayrollFromImport, matchPayrollImportRows, stageParsedPayrollWorkbook, validatePayrollImportCommit } from "../src/lib/payrollImportWorkflow.ts";
import { findDuplicatePayrollImportBatches, readPayrollImportWorkspaceFromLocal, writePayrollImportWorkspaceToLocal, type PayrollImportWorkspaceData } from "../src/lib/payrollImportPersistence.ts";
import { adminOfficeTemplateRows, projectSiteTemplateRows } from "./fixtures/payrollWorkbookFixtures.ts";
import type { Project, Worker } from "../src/types.ts";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function workbookBytes(rows: typeof projectSiteTemplateRows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
}

const project: Project = { id: "project-1", projectCode: "NRPS", projectName: "North River Pump Station", status: "ACTIVE", projectBudget: 1_000_000, currency: "PHP", createdAt: "2026-08-01", updatedAt: "2026-08-01" };
const siteWorker: Worker = { id: "worker-site", employeeCode: "SITE-1", firstName: "Mara", lastName: "Santos", displayName: "Mara Santos", employmentType: "PROJECT_BASED", defaultPayType: "DAILY", defaultRate: 750, active: true, createdAt: "2026-08-01", updatedAt: "2026-08-01" };
const officeWorker: Worker = { id: "worker-office", employeeCode: "OFFICE-1", firstName: "Noel", lastName: "Cruz", displayName: "Noel Cruz", employmentType: "REGULAR", defaultPayType: "DAILY", defaultRate: 800, active: true, createdAt: "2026-08-01", updatedAt: "2026-08-01" };

test("project import stages, matches, and creates project allocation in a DRAFT run", () => {
  const parsed = parsePayrollWorkbook(workbookBytes(projectSiteTemplateRows), { fileName: "renamed-site.xlsx" });
  const staged = stageParsedPayrollWorkbook(parsed, { fileName: "renamed-site.xlsx", fileSha256: "a".repeat(64), fileSize: 123 });
  const matched = matchPayrollImportRows(staged.rows, [siteWorker], [project]);
  assert.equal(matched.rows[0].workerMatchStatus, "MATCHED");
  assert.equal(matched.rows[0].projectMatchStatus, "MATCHED");
  assert.equal(matched.rows[0].laborContext.projectId, project.id);
  const draft = buildDraftPayrollFromImport({ batch: staged.batch, rows: matched.rows, periodStart: "2026-08-18", periodEnd: "2026-08-23" });
  assert.equal(draft.run.status, "DRAFT");
  assert.equal(draft.entries[0].costContext?.type, "PROJECT");
  assert.equal(draft.entries[0].grossPay, 4_250);
  assert.deepEqual(draft.allocations.map((allocation) => [allocation.projectId, allocation.allocationAmount, allocation.source]), [[project.id, 4_250, "IMPORT"]]);
});

test("admin office import remains non-project labor and creates no fake allocation", () => {
  const parsed = parsePayrollWorkbook(workbookBytes(adminOfficeTemplateRows), { fileName: "office-weekly.xlsx" });
  const staged = stageParsedPayrollWorkbook(parsed, { fileName: "office-weekly.xlsx", fileSha256: "b".repeat(64) });
  const matched = matchPayrollImportRows(staged.rows, [officeWorker], [project]);
  assert.equal(matched.rows[0].laborContext.type, "ADMIN_OFFICE");
  assert.equal(matched.rows[0].projectMatchStatus, "NOT_APPLICABLE");
  const draft = buildDraftPayrollFromImport({ batch: staged.batch, rows: matched.rows, periodStart: "2026-08-18", periodEnd: "2026-08-23" });
  assert.equal(draft.entries[0].costContext?.type, "ADMIN_OFFICE");
  assert.equal(draft.entries[0].projectAllocatedCost, 0);
  assert.equal(draft.allocations.length, 0);
});

test("ambiguous worker matches cannot be committed silently", () => {
  const parsed = parsePayrollWorkbook(workbookBytes(projectSiteTemplateRows), { fileName: "site.xlsx" });
  const staged = stageParsedPayrollWorkbook(parsed, { fileName: "site.xlsx", fileSha256: "c".repeat(64) });
  const duplicateWorkers = [siteWorker, { ...siteWorker, id: "worker-site-2" }];
  const matched = matchPayrollImportRows(staged.rows, duplicateWorkers, [project]);
  assert.equal(matched.rows[0].workerMatchStatus, "AMBIGUOUS");
  const validation = validatePayrollImportCommit({ batch: staged.batch, rows: matched.rows, periodStart: "2026-08-18", periodEnd: "2026-08-23" });
  assert.equal(validation.valid, false);
  assert.match(validation.issues.join(" "), /confirmed worker match/);
});

test("local staging survives reload and duplicate SHA-256 files are discoverable", () => {
  const storage = new MemoryStorage();
  const data: PayrollImportWorkspaceData = { costCenters: [], batches: [{ id: "batch-1", originalFileName: "office.xlsx", fileSha256: "d".repeat(64), storagePath: "local/office.xlsx", sheetNames: ["Sheet1"], status: "UPLOADED", mappingSnapshot: {}, rawMetadata: {}, warnings: [], errors: [], createdAt: "2026-08-01", updatedAt: "2026-08-01" }], rows: [], templates: [] };
  writePayrollImportWorkspaceToLocal(data, storage);
  const loaded = readPayrollImportWorkspaceFromLocal(storage);
  assert.equal(loaded.batches[0].fileSha256, "d".repeat(64));
  assert.equal(findDuplicatePayrollImportBatches(loaded.batches, "d".repeat(64)).length, 1);
});
