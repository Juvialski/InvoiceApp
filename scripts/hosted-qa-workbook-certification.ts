import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as nodeFs from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
// Playwright is installed by the explicit protected hosted-QA workflow only.
// @ts-ignore -- the QA-only dependency is available when this script executes.
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import * as XLSX from "xlsx";
import {
  assertHostedQaTarget,
  sanitizeHostedQaFailureCode,
  sanitizeHostedQaWorkbookAdvanceExpenseStep,
  hostedQaWorkbookRowSelector,
  hostedQaExpenseProposalSelector,
  waitForHostedQaHealth,
  waitForHostedQaRouteReadiness,
  type HostedQaWorkbookAdvanceExpenseStep,
} from "./qa/hostedQaContracts.ts";
import { repositoryMigrationLevel } from "../src/server/repositoryMigrationLevel.ts";
import { parseOperationsWorkbook } from "../src/lib/operationsWorkbook.ts";
import {
  COMBINED_OPERATIONS_WORKBOOK_SCHEMA,
} from "../src/lib/combinedOperationsWorkbook.ts";

// SheetJS ESM exposes path-based reads but requires Node's fs binding explicitly.
XLSX.set_fs(nodeFs);

const BASE_URL = (process.env.QA_E2E_BASE_URL || "https://hydroqualisense-qa.onrender.com").replace(/\/+$/, "");
const EXPECTED_DEPLOYMENT_ID = (process.env.QA_E2E_EXPECTED_DEPLOYMENT_ID || "qa-hydroqualisense").trim();
const EXPECTED_REPOSITORY_SHA = (process.env.QA_E2E_EXPECTED_REPOSITORY_SHA || "").trim().toLowerCase();
const EXPECTED_MIGRATION_LEVEL = (process.env.QA_E2E_EXPECTED_MIGRATION_LEVEL || repositoryMigrationLevel() || "").trim();
const SUPABASE_URL = (process.env.QA_E2E_SUPABASE_URL || "").trim();
const STORAGE_STATE_PATH = path.resolve(process.env.QA_E2E_STORAGE_STATE_PATH || ".qa-e2e/qa-storage-state.json");
const QA_PROJECT_REF = "vrpuznofrntyqsbugrib";
const OUTPUT_DIR = path.resolve("artifacts/hosted-qa/workbook-matrix");
const READY_TIMEOUT_MS = 30_000;

type WorkbookRow = unknown[];
type WorkbookValue = string | number | boolean | Date | null;

interface WorkbookEdit {
  sheetName: string;
  keyHeader: string;
  keyValue: string;
  fieldHeader: string;
  value: WorkbookValue;
}

interface WorkbookTable {
  sheet: XLSX.WorkSheet;
  headers: string[];
  rows: WorkbookRow[];
}

function workbookTable(workbook: XLSX.WorkBook, sheetName: string): WorkbookTable {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("WORKBOOK_SHEET_MISSING");
  const rows = XLSX.utils.sheet_to_json<WorkbookRow>(sheet, { header: 1, raw: true, defval: null });
  const headers = (rows[0] || []).map((value) => String(value ?? ""));
  return { sheet, headers, rows };
}

function columnIndex(headers: readonly string[], header: string) {
  const index = headers.indexOf(header);
  if (index < 0) throw new Error("WORKBOOK_HEADER_MISSING");
  return index;
}

function rowIndexByValue(table: WorkbookTable, keyHeader: string, keyValue: string) {
  const keyColumn = columnIndex(table.headers, keyHeader);
  const rowIndex = table.rows.findIndex((row, index) => index > 0 && String(row[keyColumn] ?? "") === keyValue);
  if (rowIndex < 1) throw new Error("WORKBOOK_FIXTURE_MISSING");
  return rowIndex;
}

function valueAt(table: WorkbookTable, rowIndex: number, header: string): WorkbookValue {
  return (table.rows[rowIndex]?.[columnIndex(table.headers, header)] ?? null) as WorkbookValue;
}

function setWorkbookCell(workbook: XLSX.WorkBook, edit: WorkbookEdit) {
  const table = workbookTable(workbook, edit.sheetName);
  const rowIndex = rowIndexByValue(table, edit.keyHeader, edit.keyValue);
  const column = columnIndex(table.headers, edit.fieldHeader);
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: column });
  const current = table.sheet[address] as XLSX.CellObject | undefined;
  if (current?.f || current?.F) throw new Error("WORKBOOK_TARGET_CELL_IS_FORMULA");
  table.sheet[address] = {
    ...(current || {}),
    t: typeof edit.value === "number" ? "n" : edit.value instanceof Date ? "d" : typeof edit.value === "boolean" ? "b" : "s",
    v: edit.value as XLSX.CellObject["v"],
  };
}

async function rewriteWorkbook(inputPath: string, outputPath: string, edits: readonly WorkbookEdit[]) {
  const workbook = XLSX.readFile(inputPath, { cellDates: true, cellFormula: true, cellStyles: true, bookVBA: true });
  if (workbook.vbaraw || workbook.SheetNames.length !== 9 || !workbook.SheetNames.includes("_HydroQualiSense")) {
    throw new Error("WORKBOOK_CONTRACT_CHANGED");
  }
  for (const edit of edits) setWorkbookCell(workbook, edit);
  const bytes = new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true, cellStyles: true }));
  await writeFile(outputPath, bytes);
  const parsed = parseOperationsWorkbook(bytes, { schema: COMBINED_OPERATIONS_WORKBOOK_SCHEMA, fileName: path.basename(outputPath) });
  return { parsed, byteCount: bytes.byteLength, supplierPayablesIncluded: workbook.SheetNames.includes("Supplier Payables") };
}

async function ensureWorkbookTransferOpen(page: Page) {
  const disclosure = page.locator('[data-workbook-transfer-disclosure="true"]');
  await disclosure.waitFor({ state: "attached", timeout: READY_TIMEOUT_MS });
  const isOpen = await disclosure.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) {
    await disclosure.locator(":scope > summary").click({ timeout: READY_TIMEOUT_MS });
    await page.waitForFunction(
      () => document.querySelector<HTMLDetailsElement>('[data-workbook-transfer-disclosure="true"]')?.open === true,
      undefined,
      { timeout: READY_TIMEOUT_MS },
    );
  }
}

async function downloadWorkbook(page: Page, targetPath: string) {
  await ensureWorkbookTransferOpen(page);
  const downloadPromise = page.waitForEvent("download", { timeout: READY_TIMEOUT_MS });
  await page.getByRole("button", { name: "Download workbook", exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("WORKBOOK_DOWNLOAD_PATH_UNAVAILABLE");
  await writeFile(targetPath, await readFile(downloadPath));
  return targetPath;
}

async function uploadWorkbook(page: Page, filePath: string) {
  await ensureWorkbookTransferOpen(page);
  await page.getByLabel("Import combined Operations Workbook", { exact: true }).setInputFiles(filePath);
  await page.getByText("Workbook reviewed. Changes remain pending until you apply them within a domain.", { exact: true })
    .waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const review = page.locator('[aria-label^="Import review:"]').first();
  await review.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  return review;
}

async function updateLiveExpenseDescription(
  page: Page,
  expenseId: string,
  currentDescription: string,
  nextDescription: string,
  markStep: (step: HostedQaWorkbookAdvanceExpenseStep) => void,
) {
  markStep("select-expenses-sheet");
  await page.getByRole("tab", { name: "Expenses", exact: true }).click({ timeout: READY_TIMEOUT_MS });
  const grid = page.getByRole("grid", { name: "Expenses worksheet" });
  markStep("wait-expenses-grid");
  await grid.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  // The display text is replaced by the input when editing starts, so keep the row locator anchored to its stable key.
  const targetRow = grid.locator(hostedQaWorkbookRowSelector(expenseId));
  markStep("find-direct-expense-row");
  await targetRow.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  markStep("find-description-column");
  const headers = await grid.getByRole("columnheader").allTextContents();
  const descriptionColumnIndex = headers.findIndex((header) => header.trim() === "Description");
  if (descriptionColumnIndex < 0) throw new Error("EXPENSE_DESCRIPTION_COLUMN_NOT_FOUND");
  const descriptionCell = targetRow.getByRole("gridcell").nth(descriptionColumnIndex);
  markStep("verify-description-editable");
  if (await descriptionCell.getAttribute("data-worksheet-editable") !== "true") {
    throw new Error("DIRECT_EXPENSE_DESCRIPTION_NOT_EDITABLE");
  }
  markStep("open-description-editor");
  await descriptionCell.click({ timeout: READY_TIMEOUT_MS });
  const editor = targetRow.getByRole("textbox");
  markStep("wait-description-editor");
  await editor.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  markStep("fill-description");
  await editor.fill(nextDescription, { timeout: READY_TIMEOUT_MS });
  const saveButton = page.getByRole("button", { name: "Save changes", exact: true });
  markStep("verify-save-action");
  if (!await saveButton.isVisible()) throw new Error("EXPENSE_WORKSHEET_SAVE_UNAVAILABLE");
  markStep("save-expense");
  await saveButton.click({ timeout: READY_TIMEOUT_MS });
  markStep("wait-save-confirmation");
  await page.getByRole("status").filter({ hasText: "Expense changes saved." }).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  markStep("return-to-projects");
  await page.getByRole("tab", { name: "Projects", exact: true }).click({ timeout: READY_TIMEOUT_MS });
  markStep("wait-projects-grid");
  await page.getByRole("grid", { name: "Projects worksheet" }).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  markStep("return-to-expenses");
  await page.getByRole("tab", { name: "Expenses", exact: true }).click({ timeout: READY_TIMEOUT_MS });
  markStep("wait-updated-expense-row");
  await page.getByRole("grid", { name: "Expenses worksheet" }).getByRole("row").filter({ hasText: nextDescription })
    .waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
}

async function applyReviewedDomain(page: Page, domainId: string, label: string, requiredFragments: readonly string[]) {
  const domain = page.locator(`[data-combined-workbook-domain="${domainId}"]`);
  const proposals = domain.locator("[data-combined-workbook-proposal]");
  const matched: string[] = [];
  for (const proposal of await proposals.all()) {
    const text = await proposal.innerText();
    const fragments = requiredFragments.filter((fragment) => text.includes(fragment));
    const checkbox = proposal.locator('input[type="checkbox"]');
    const checked = await checkbox.isChecked();
    const enabled = await checkbox.isEnabled();
    if (fragments.length > 1) throw new Error("PROPOSAL_FIXTURE_AMBIGUOUS");
    if (fragments.length === 1) {
      if (!enabled) throw new Error("EXPECTED_PROPOSAL_NOT_APPLICABLE");
      if (!checked) await checkbox.check();
      matched.push(fragments[0]);
    } else if (checked) {
      if (!enabled) throw new Error("PROTECTED_PROPOSAL_SELECTED");
      await checkbox.uncheck();
    }
  }
  if (matched.length !== requiredFragments.length || requiredFragments.some((fragment) => !matched.includes(fragment))) {
    throw new Error("EXPECTED_PROPOSAL_NOT_SELECTED");
  }

  const apply = domain.getByRole("button", { name: `Apply selected ${label} changes`, exact: true });
  if (await apply.isEnabled()) throw new Error("APPLY_ENABLED_BEFORE_CONFIRMATION");
  await domain.getByRole("checkbox", { name: new RegExp(`I reviewed the selected ${label} proposals`) }).check();
  if (!(await apply.isEnabled())) throw new Error("APPLY_NOT_ENABLED_AFTER_CONFIRMATION");
  await apply.click();
  const notice = page.getByText(/^Applied \d+ reviewed change(?:s)? in /).last();
  const rejection = page.getByRole("alert").last();
  const outcome = await Promise.race([
    notice.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS }).then(() => "success" as const),
    rejection.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS }).then(() => "rejected" as const),
  ]);
  if (outcome === "rejected") throw new Error("WORKBOOK_DOMAIN_APPLY_REJECTED");
  const text = await notice.innerText();
  if (!text.includes(`in ${label}`)) throw new Error("APPLY_NOTICE_DOMAIN_MISMATCH");
  return { domainId, label, selectedProposals: matched.length, notice: text };
}

async function exportRows(page: Page, tempDirectory: string) {
  const tempPath = path.join(tempDirectory, `after-${Date.now()}.xlsx`);
  await downloadWorkbook(page, tempPath);
  const workbook = XLSX.readFile(tempPath, { cellDates: true, cellFormula: true, cellStyles: true });
  return {
    workbook,
    projectTable: workbookTable(workbook, "Projects"),
    codeTable: workbookTable(workbook, "Cost Codes"),
    expenseTable: workbookTable(workbook, "Expenses"),
    rfqTable: workbookTable(workbook, "RFQs"),
    poTable: workbookTable(workbook, "Purchase Orders"),
    rfqLinesTable: workbookTable(workbook, "RFQ Lines"),
    poLinesTable: workbookTable(workbook, "PO Lines"),
  };
}

async function screenshotVisibleReview(page: Page, review: Locator, name: string) {
  const box = await review.boundingBox();
  if (!box) throw new Error("REVIEW_SCREENSHOT_TARGET_MISSING");
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const width = Math.min(viewport.width, box.x + box.width) - x;
  const height = Math.min(viewport.height, box.y + box.height) - y;
  if (width <= 0 || height <= 0) throw new Error("REVIEW_SCREENSHOT_OUTSIDE_VIEWPORT");
  const screenshotPath = path.join(OUTPUT_DIR, "screenshots", name);
  await page.screenshot({ path: screenshotPath, animations: "disabled", fullPage: false, clip: { x, y, width, height }, timeout: READY_TIMEOUT_MS });
  return `screenshots/${path.basename(screenshotPath)}`;
}

function lineIdsForParent(table: WorkbookTable, parentHeader: string, parentId: string) {
  const parentIndex = columnIndex(table.headers, parentHeader);
  const lineIdIndex = columnIndex(table.headers, "__HQ Line ID");
  return table.rows.slice(1)
    .filter((row) => String(row[parentIndex] ?? "") === parentId)
    .map((row) => String(row[lineIdIndex] ?? ""))
    .filter(Boolean)
    .sort();
}

async function main() {
  const runId = `wb-${Date.now()}`;
  const runPrefix = `REL-QA-WB-1 ${runId}`;
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "hqs-hosted-workbook-"));
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, "screenshots"), { recursive: true });
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    status: "IN_PROGRESS",
    runId,
    target: { environment: "qa", deploymentId: EXPECTED_DEPLOYMENT_ID, applicationSha: EXPECTED_REPOSITORY_SHA, migrationLevel: EXPECTED_MIGRATION_LEVEL, supabaseProjectRef: QA_PROJECT_REF },
    identity: { authenticatedSessionRestored: false, identityDetailsStored: false, alternatePermissionProfileTested: false },
    export: { sheets: [], supplierPayablesIncludedForInvoiceRead: false },
    staleVersion: { status: "NOT_RUN", applyEnabled: null },
    review: { domains: [], protectedFields: 0, unchangedRowsCollapsed: false },
    apply: { domains: [], authoritativeRefresh: false },
    linePreservation: { rfqLineIdsUnchanged: false, purchaseOrderLineIdsUnchanged: false },
    responsive: [],
    runtime: { consoleErrorCount: 0, pageErrorCount: 0, failedRequestCount: 0 },
    limitations: [
      "Alternate read-only and manage-only QA profiles were not available in this run.",
      "Company-context changes were not exercised in the single-company QA deployment.",
      "No artificial partial-Apply failure was induced because no safe deterministic trigger was available.",
      "The intermittent REL-AUTH-1 verification trigger was not reproduced.",
    ],
  };

  let stage = "setup";
  let matrixFailureStep: HostedQaWorkbookAdvanceExpenseStep | undefined;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: number[] = [];

  try {
    stage = "target-identity";
    assertHostedQaTarget(BASE_URL);
    if (!EXPECTED_REPOSITORY_SHA || !/^[0-9a-f]{40}$/.test(EXPECTED_REPOSITORY_SHA)) throw new Error("EXPECTED_APP_SHA_REQUIRED");
    if (!/^\d{14}$/.test(EXPECTED_MIGRATION_LEVEL)) throw new Error("EXPECTED_MIGRATION_LEVEL_REQUIRED");
    const supabaseHost = new URL(SUPABASE_URL).hostname;
    if (supabaseHost !== `${QA_PROJECT_REF}.supabase.co`) throw new Error("QA_SUPABASE_PROJECT_MISMATCH");
    if (!existsSync(STORAGE_STATE_PATH)) throw new Error("AUTHENTICATED_QA_STORAGE_STATE_MISSING");
    const expected = { environment: "qa" as const, deploymentId: EXPECTED_DEPLOYMENT_ID, repositorySha: EXPECTED_REPOSITORY_SHA, migrationLevel: EXPECTED_MIGRATION_LEVEL };
    const readiness = await waitForHostedQaHealth(async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/health`, { headers: { Accept: "application/json" } });
        const body = await response.json().catch(() => ({}));
        return { httpStatus: response.status, release: body?.release && typeof body.release === "object" ? body.release : null };
      } catch {
        return { httpStatus: null, release: null };
      }
    }, expected, { timeoutMs: 30_000, pollMs: 3_000 });
    assert.deepEqual(readiness.failureReasons, []);

    stage = "open-authenticated-workbook";
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ storageState: STORAGE_STATE_PATH, viewport: { width: 1280, height: 800 } });
    page = await context.newPage();
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push("console-error"); });
    page.on("pageerror", () => pageErrors.push("pageerror"));
    page.on("response", (response) => { if (response.status() >= 400) failedRequests.push(response.status()); });
    await page.goto(`${BASE_URL}/workbook?sheet=projects`, { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS });
    await waitForHostedQaRouteReadiness(page, READY_TIMEOUT_MS);
    await page.getByRole("heading", { name: "Operations Workbook", exact: true }).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
    await page.getByText("QA ENVIRONMENT · SYNTHETIC DATA ONLY", { exact: true }).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
    manifest.identity = { authenticatedSessionRestored: true, identityDetailsStored: false, alternatePermissionProfileTested: false };

    stage = "inspect-fixtures";
    const initialPath = path.join(tmpDir, "initial.xlsx");
    await downloadWorkbook(page, initialPath);
    const initialBytes = new Uint8Array(await readFile(initialPath));
    const initialParsed = parseOperationsWorkbook(initialBytes, { schema: COMBINED_OPERATIONS_WORKBOOK_SCHEMA, fileName: path.basename(initialPath) });
    const initialWorkbook = XLSX.read(initialBytes, { type: "array", cellDates: true, cellFormula: true, cellStyles: true });
    const requiredSheets = ["Projects", "Cost Codes", "Expenses", "Supplier Payables", "RFQs", "RFQ Lines", "Purchase Orders", "PO Lines", "_HydroQualiSense"];
    if (requiredSheets.some((sheet) => !initialWorkbook.SheetNames.includes(sheet))) throw new Error("SUPPORTED_WORKBOOK_SHEET_SET_MISMATCH");
    const expenseTable = workbookTable(initialWorkbook, "Expenses");
    const descIndex = columnIndex(expenseTable.headers, "Description");
    const statusIndex = columnIndex(expenseTable.headers, "Status");
    const invoiceIndex = columnIndex(expenseTable.headers, "Supplier Invoice");
    const expenseIdIndex = columnIndex(expenseTable.headers, "__HQ Record ID");
    const draftMatches = expenseTable.rows.slice(1).filter((row) => String(row[descIndex] ?? "").startsWith("REL-QA-WB-1")
      && String(row[statusIndex] ?? "") === "DRAFT" && !String(row[invoiceIndex] ?? ""));
    if (draftMatches.length !== 1) throw new Error("DIRECT_DRAFT_EXPENSE_FIXTURE_AMBIGUOUS_OR_MISSING");
    const draftExpenseId = String(draftMatches[0][expenseIdIndex] ?? "");
    const startingExpenseDescription = String(draftMatches[0][descIndex] ?? "");
    if (!draftExpenseId) throw new Error("DIRECT_DRAFT_EXPENSE_ID_MISSING");
    const poTable = workbookTable(initialWorkbook, "Purchase Orders");
    const poRow = poTable.rows[rowIndexByValue(poTable, "PO Number", "PO-26-6630")];
    if (String(poRow[columnIndex(poTable.headers, "Status")] ?? "") !== "DRAFT") throw new Error("DRAFT_PO_FIXTURE_NOT_DRAFT");
    const rfqLineIdsBefore = lineIdsForParent(workbookTable(initialWorkbook, "RFQ Lines"), "RFQ Number", "RFQ-P3-LOCAL-SWEEP");
    const poLineIdsBefore = lineIdsForParent(workbookTable(initialWorkbook, "PO Lines"), "PO Number", "PO-26-6630");
    if (!rfqLineIdsBefore.length || !poLineIdsBefore.length) throw new Error("PROCUREMENT_CHILD_LINE_FIXTURE_MISSING");
    manifest.export = { sheets: initialWorkbook.SheetNames, supplierPayablesIncludedForInvoiceRead: initialWorkbook.SheetNames.includes("Supplier Payables"), workbookKind: initialParsed.workbookKind, rfqLineCount: rfqLineIdsBefore.length, purchaseOrderLineCount: poLineIdsBefore.length };
    if (!initialWorkbook.SheetNames.includes("Supplier Payables")) throw new Error("SUPPLIER_PAYABLES_READ_SCOPE_NOT_PRESENT");

    stage = "prepare-stale-workbook";
    const staleDescription = `${runPrefix} stale workbook proposal`;
    const directVersion = `${runPrefix} direct version`;
    const linkedDraftExpenseId = String(valueAt(expenseTable, rowIndexByValue(expenseTable, "Description", "Synthetic pump calibration service"), "__HQ Record ID") ?? "");
    const protectedDirectExpenseId = String(valueAt(expenseTable, rowIndexByValue(expenseTable, "Description", "Synthetic field testing expense for QA-E2E-7F4K"), "__HQ Record ID") ?? "");
    if (!linkedDraftExpenseId || !protectedDirectExpenseId) throw new Error("PROTECTED_EXPENSE_FIXTURE_MISSING");
    const linkedExpenseRowIndex = rowIndexByValue(expenseTable, "__HQ Record ID", linkedDraftExpenseId);
    const linkedSupplierInvoice = String(valueAt(expenseTable, linkedExpenseRowIndex, "Supplier Invoice") ?? "");
    const linkedConfirmedPaid = valueAt(expenseTable, linkedExpenseRowIndex, "Confirmed Paid");
    const linkedSettlementState = String(valueAt(expenseTable, linkedExpenseRowIndex, "Settlement State") ?? "");
    if (!linkedSupplierInvoice.trim() || typeof linkedConfirmedPaid !== "number" || !linkedSettlementState.trim()) {
      throw new Error("SUPPLIER_LINKED_SETTLEMENT_FIXTURE_MISSING");
    }
    const stalePath = path.join(tmpDir, "stale-proposal.xlsx");
    await rewriteWorkbook(initialPath, stalePath, [{ sheetName: "Expenses", keyHeader: "__HQ Record ID", keyValue: draftExpenseId, fieldHeader: "Description", value: staleDescription }]);

    stage = "advance-expense-version";
    matrixFailureStep = undefined;
    await updateLiveExpenseDescription(page, draftExpenseId, startingExpenseDescription, directVersion, (step) => { matrixFailureStep = step; });
    matrixFailureStep = undefined;
    stage = "review-stale-workbook";
    const staleReview = await uploadWorkbook(page, stalePath);
    const staleProposal = staleReview.locator('[data-combined-workbook-domain="expenses"] [data-combined-workbook-proposal]')
      .filter({ hasText: staleDescription });
    await staleProposal.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
    const staleText = await staleProposal.innerText();
    const staleApplyEnabled = await staleReview.locator('[data-combined-workbook-domain="expenses"]')
      .getByRole("button", { name: "Apply selected Expenses / Supplier Payables changes", exact: true }).isEnabled();
    if (!staleText.includes("STALE_CONFLICT") || staleApplyEnabled) throw new Error("STALE_EXPENSE_VERSION_GUARD_FAILED");
    manifest.staleVersion = { status: "STALE_CONFLICT", applyEnabled: false, conflictWasNotApplied: true };
    await staleReview.getByRole("button", { name: "Cancel review", exact: true }).click();
    await page.getByText("Review closed.", { exact: true }).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });

    stage = "prepare-roundtrip-workbook";
    const roundtripSourcePath = path.join(tmpDir, "roundtrip-source.xlsx");
    await downloadWorkbook(page, roundtripSourcePath);
    const sourceWorkbook = XLSX.readFile(roundtripSourcePath, { cellDates: true, cellFormula: true, cellStyles: true });
    const projectTable = workbookTable(sourceWorkbook, "Projects");
    const protectedProjectStatus = String(valueAt(projectTable, rowIndexByValue(projectTable, "Project Code", "QA-UX-20260911"), "Status") ?? "");
    if (!protectedProjectStatus) throw new Error("PROTECTED_PROJECT_STATUS_FIXTURE_MISSING");
    const edits: WorkbookEdit[] = [
      // Exercise one atomic Project + Cost Code group. Project Budget is an editable
      // commercial workbook field by contract, so use lifecycle Status as the
      // genuinely protected Project field.
      { sheetName: "Projects", keyHeader: "Project Code", keyValue: "QA-E2E-7F4K-NTU", fieldHeader: "Description", value: `${runPrefix} project description` },
      { sheetName: "Projects", keyHeader: "Project Code", keyValue: "QA-UX-20260911", fieldHeader: "Status", value: "ARCHIVED" },
      { sheetName: "Cost Codes", keyHeader: "Code", keyValue: "CIVIL-7F4K", fieldHeader: "Description", value: `${runPrefix} cost code description` },
      { sheetName: "Expenses", keyHeader: "__HQ Record ID", keyValue: draftExpenseId, fieldHeader: "Description", value: `${runPrefix} authoritative round-trip Expense` },
      { sheetName: "Expenses", keyHeader: "__HQ Record ID", keyValue: protectedDirectExpenseId, fieldHeader: "Status", value: "PAID" },
      { sheetName: "Expenses", keyHeader: "__HQ Record ID", keyValue: linkedDraftExpenseId, fieldHeader: "Description", value: `${runPrefix} linked source must remain protected` },
      { sheetName: "Expenses", keyHeader: "__HQ Record ID", keyValue: linkedDraftExpenseId, fieldHeader: "Supplier Invoice", value: `${runPrefix} source link must remain protected` },
      { sheetName: "Expenses", keyHeader: "__HQ Record ID", keyValue: linkedDraftExpenseId, fieldHeader: "Confirmed Paid", value: linkedConfirmedPaid + 1 },
      { sheetName: "Expenses", keyHeader: "__HQ Record ID", keyValue: linkedDraftExpenseId, fieldHeader: "Settlement State", value: `${runPrefix} settlement must remain protected` },
      { sheetName: "RFQs", keyHeader: "RFQ Number", keyValue: "RFQ-P3-LOCAL-SWEEP", fieldHeader: "Title", value: `${runPrefix} RFQ title` },
      { sheetName: "RFQs", keyHeader: "RFQ Number", keyValue: "RFQ-P3-864432", fieldHeader: "Status", value: "ISSUED" },
      { sheetName: "Purchase Orders", keyHeader: "PO Number", keyValue: "PO-26-6630", fieldHeader: "Description", value: `${runPrefix} PO description` },
      { sheetName: "Purchase Orders", keyHeader: "PO Number", keyValue: "PO-QA-E2E-7F4K-001", fieldHeader: "Status", value: "DRAFT" },
    ];
    const roundtripPath = path.join(tmpDir, "roundtrip-proposal.xlsx");
    const rewritten = await rewriteWorkbook(roundtripSourcePath, roundtripPath, edits);
    if (!rewritten.supplierPayablesIncluded) throw new Error("SUPPLIER_PAYABLES_SCOPE_CHANGED");

    stage = "review-roundtrip-workbook";
    const review = await uploadWorkbook(page, roundtripPath);
    for (const id of ["projects", "expenses", "procurement"]) {
      await review.locator(`[data-combined-workbook-domain="${id}"]`).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
    }
    // One proposal can contain several protected changes, so certify the field-level
    // review result instead of assuming one protected status badge per edited field.
    const protectedFieldCount = await review.getByText("Protected", { exact: true }).count();
    if (protectedFieldCount < 5) throw new Error("PROTECTED_FIELDS_NOT_CLASSIFIED");
    const linkedExpenseProposal = review.locator(hostedQaExpenseProposalSelector(linkedDraftExpenseId));
    const linkedExpenseProposalText = await linkedExpenseProposal.innerText();
    if (["supplierInvoice", "confirmedPaid", "settlementState"].some((field) => !linkedExpenseProposalText.includes(field))) {
      throw new Error("SUPPLIER_LINKED_SOURCE_OR_SETTLEMENT_NOT_CLASSIFIED");
    }
    const unchangedGroups = review.locator("details[data-combined-workbook-unchanged-count]");
    const unchangedStates = await unchangedGroups.evaluateAll((elements) => elements.map((element) => (element as HTMLDetailsElement).open));
    if (!unchangedStates.length || unchangedStates.some(Boolean)) throw new Error("UNCHANGED_PROPOSALS_NOT_COLLAPSED");
    const domainLabels = ["Projects / Cost Codes", "Expenses / Supplier Payables", "Procurement"];
    const applyDisabledBeforeConfirmation = await Promise.all(domainLabels.map(async (label) => {
      return !(await review.getByRole("button", { name: `Apply selected ${label} changes`, exact: true }).isEnabled());
    }));
    if (applyDisabledBeforeConfirmation.some((disabled) => !disabled)) throw new Error("APPLY_ENABLED_BEFORE_CONFIRMATION");

    const responsive: Array<Record<string, unknown>> = [];
    stage = "capture-responsive-review";
    for (const viewport of [{ width: 1280, height: 800, name: "laptop-1280x800" }, { width: 390, height: 844, name: "phone-390x844" }]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const projectApply = review.locator('[data-combined-workbook-domain="projects"]')
        .getByRole("button", { name: "Apply selected Projects / Cost Codes changes", exact: true });
      await review.scrollIntoViewIfNeeded();
      const reviewScreenshot = await screenshotVisibleReview(page, review, `workbook-review-${viewport.name}.png`);
      await projectApply.scrollIntoViewIfNeeded();
      const box = await projectApply.boundingBox();
      const dimensions = await page.evaluate(() => ({ viewportWidth: innerWidth, viewportHeight: innerHeight, documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
      const applyScreenshot = await screenshotVisibleReview(page, review, `workbook-apply-${viewport.name}.png`);
      const noOverflow = dimensions.documentWidth <= dimensions.viewportWidth + 2;
      const applyReachable = Boolean(box && box.y >= 0 && box.y + box.height <= dimensions.viewportHeight);
      responsive.push({ viewport: viewport.name, documentWidth: dimensions.documentWidth, viewportWidth: dimensions.viewportWidth, noPageOverflow: noOverflow, projectApplyReachable: applyReachable, reviewScreenshot, applyScreenshot });
      if (!noOverflow || !applyReachable) throw new Error("RESPONSIVE_REVIEW_ACTION_NOT_REACHABLE");
    }
    manifest.responsive = responsive;
    manifest.review = { domains: ["projects", "expenses", "procurement"], protectedFields: protectedFieldCount, unchangedRowsCollapsed: true, applyDisabledUntilConfirmed: true, supplierPayablesIncludedForInvoiceRead: true };

    // Responsive certification ends on the phone viewport. Return to the primary
    // desktop operating surface before executing mutations so Apply does not depend
    // on mobile scroll/layout state.
    await page.setViewportSize({ width: 1280, height: 800 });
    await review.scrollIntoViewIfNeeded();

    stage = "apply-projects-domain";
    const appliedProjects = await applyReviewedDomain(page, "projects", "Projects / Cost Codes", ["QA-E2E-7F4K-NTU"]);
    stage = "apply-expenses-domain";
    const appliedExpenses = await applyReviewedDomain(page, "expenses", "Expenses / Supplier Payables", [`${runPrefix} authoritative round-trip Expense`]);
    stage = "apply-procurement-domain";
    const appliedProcurement = await applyReviewedDomain(page, "procurement", "Procurement", ["RFQ-P3-LOCAL-SWEEP", "PO-26-6630"]);
    manifest.apply = { domains: [appliedProjects, appliedExpenses, appliedProcurement], authoritativeRefresh: true };

    stage = "verify-authoritative-refresh";
    const final = await exportRows(page, tmpDir);
    const finalProjectTable = final.projectTable;
    const finalProjectStatus = String(valueAt(finalProjectTable, rowIndexByValue(finalProjectTable, "Project Code", "QA-UX-20260911"), "Status") ?? "");
    const directRow = final.expenseTable.rows.find((row, index) => index > 0 && String(row[columnIndex(final.expenseTable.headers, "__HQ Record ID")] ?? "") === draftExpenseId);
    const linkedDraftRowIndex = rowIndexByValue(final.expenseTable, "__HQ Record ID", linkedDraftExpenseId);
    const protectedExpenseRowIndex = rowIndexByValue(final.expenseTable, "__HQ Record ID", protectedDirectExpenseId);
    const linkedExpenseRow = final.expenseTable.rows[linkedDraftRowIndex];
    const protectedExpenseRow = final.expenseTable.rows[protectedExpenseRowIndex];
    const linkedDescription = String(linkedExpenseRow[columnIndex(final.expenseTable.headers, "Description")] ?? "");
    const linkedInvoice = String(linkedExpenseRow[columnIndex(final.expenseTable.headers, "Supplier Invoice")] ?? "");
    const linkedPaid = linkedExpenseRow[columnIndex(final.expenseTable.headers, "Confirmed Paid")];
    const linkedSettlement = String(linkedExpenseRow[columnIndex(final.expenseTable.headers, "Settlement State")] ?? "");
    const protectedExpenseStatus = String(protectedExpenseRow[columnIndex(final.expenseTable.headers, "Status")] ?? "");
    const rfqTitle = valueAt(final.rfqTable, rowIndexByValue(final.rfqTable, "RFQ Number", "RFQ-P3-LOCAL-SWEEP"), "Title");
    const protectedRfqStatus = valueAt(final.rfqTable, rowIndexByValue(final.rfqTable, "RFQ Number", "RFQ-P3-864432"), "Status");
    const poDescription = valueAt(final.poTable, rowIndexByValue(final.poTable, "PO Number", "PO-26-6630"), "Description");
    const protectedPoStatus = valueAt(final.poTable, rowIndexByValue(final.poTable, "PO Number", "PO-QA-E2E-7F4K-001"), "Status");
    const rfqLineIdsAfter = lineIdsForParent(final.rfqLinesTable, "RFQ Number", "RFQ-P3-LOCAL-SWEEP");
    const poLineIdsAfter = lineIdsForParent(final.poLinesTable, "PO Number", "PO-26-6630");
    const directDescription = String(directRow?.[columnIndex(final.expenseTable.headers, "Description")] ?? "");
    const directStatus = String(directRow?.[columnIndex(final.expenseTable.headers, "Status")] ?? "");
    if (valueAt(finalProjectTable, rowIndexByValue(finalProjectTable, "Project Code", "QA-E2E-7F4K-NTU"), "Description") !== `${runPrefix} project description`
      || valueAt(final.codeTable, rowIndexByValue(final.codeTable, "Code", "CIVIL-7F4K"), "Description") !== `${runPrefix} cost code description`
      || directDescription !== `${runPrefix} authoritative round-trip Expense` || directStatus !== "DRAFT"
      || rfqTitle !== `${runPrefix} RFQ title` || protectedRfqStatus !== "DRAFT"
      || poDescription !== `${runPrefix} PO description` || protectedPoStatus !== "ISSUED"
      || finalProjectStatus !== protectedProjectStatus || protectedExpenseStatus !== "APPROVED"
      || linkedDescription !== "Synthetic pump calibration service"
      || linkedInvoice !== linkedSupplierInvoice || linkedPaid !== linkedConfirmedPaid || linkedSettlement !== linkedSettlementState
      || JSON.stringify(rfqLineIdsAfter) !== JSON.stringify(rfqLineIdsBefore)
      || JSON.stringify(poLineIdsAfter) !== JSON.stringify(poLineIdsBefore)) {
      throw new Error("AUTHORITATIVE_REFRESH_OR_PROTECTED_VALUE_CHECK_FAILED");
    }
    manifest.linePreservation = { rfqLineIdsUnchanged: true, purchaseOrderLineIdsUnchanged: true, rfqLineCount: rfqLineIdsAfter.length, purchaseOrderLineCount: poLineIdsAfter.length };
    manifest.authority = { projectDescriptionUpdated: true, costCodeDescriptionUpdated: true, directExpenseDescriptionUpdated: true, rfqTitleUpdated: true, purchaseOrderDescriptionUpdated: true, projectLifecycleProtected: true, lifecycleStatusesProtected: true, supplierLinkedExpenseProtected: true };
    stage = "runtime-health";
    if (consoleErrors.length || pageErrors.length || failedRequests.length) throw new Error("RUNTIME_ERROR_CHECK_FAILED");
    manifest.status = "PASS";
  } catch (error) {
    manifest.status = "FAIL";
    manifest.failureStage = stage;
    manifest.failureCategory = error instanceof Error ? error.name : "Error";
    manifest.failureCode = sanitizeHostedQaFailureCode(error);
    const failureStep = sanitizeHostedQaWorkbookAdvanceExpenseStep(matrixFailureStep);
    if (failureStep) manifest.failureStep = failureStep;
    process.exitCode = 1;
    console.error(`Hosted workbook QA status=FAIL stage=${stage}${failureStep ? ` step=${failureStep}` : ""} category=${String(manifest.failureCategory)} code=${String(manifest.failureCode)}`);
  } finally {
    manifest.runtime = { consoleErrorCount: consoleErrors.length, pageErrorCount: pageErrors.length, failedRequestCount: failedRequests.length };
    await writeFile(path.join(OUTPUT_DIR, "workbook-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    if (context) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
  if (manifest.status === "PASS") console.log("Hosted workbook QA status=PASS domains=3 sheets=5 stale=PASS protected=PASS lines=PASS responsive=PASS");
}

void main().catch(() => {
  console.error("Hosted workbook QA status=FAIL stage=setup category=Error");
  process.exitCode = 1;
});
