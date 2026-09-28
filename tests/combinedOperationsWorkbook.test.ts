import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import type { Expense, InvoiceData, Project, ProjectCostCode, PurchaseOrder, RFQ, Vendor } from "../src/types.ts";
import { DEFAULT_WORKBOOK_PARSER_LIMITS, WorkbookImportError, parseOperationsWorkbook } from "../src/lib/operationsWorkbook.ts";
import {
  COMBINED_OPERATIONS_WORKBOOK_SCHEMA,
  applyCombinedOperationsWorkbookDomain,
  buildCombinedOperationsWorkbookImportReview,
  exportCombinedOperationsWorkbook,
  refreshCombinedOperationsWorkbookDomainReview,
  retainApplicableCombinedOperationsWorkbookProposalIds,
  type CombinedOperationsWorkbookDomainReview,
  type CombinedOperationsWorkbookImportContext,
} from "../src/lib/combinedOperationsWorkbook.ts";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const COST_CODE_ID = "22222222-2222-4222-8222-222222222222";
const EXPENSE_ID = "33333333-3333-4333-8333-333333333333";
const INVOICE_ID = "44444444-4444-4444-8444-444444444444";
const VENDOR_ID = "55555555-5555-4555-8555-555555555555";
const DIRECT_EXPENSE_ID = "66666666-6666-4666-8666-666666666666";
const ALL_READ_PERMISSIONS = ["projects.read", "expenses.read", "invoices.read", "procurement.read"] as const;

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    projectCode: "PRJ-001",
    projectName: "Water Treatment Upgrade",
    description: "Civil and mechanical works",
    clientName: "Metro Water",
    status: "ACTIVE",
    startDate: "2026-01-10",
    targetEndDate: "2026-12-31",
    contractValue: 1500,
    projectBudget: 1000,
    currency: "PHP",
    taxTreatment: "VAT",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function costCode(overrides: Partial<ProjectCostCode> = {}): ProjectCostCode {
  return {
    id: COST_CODE_ID,
    projectId: PROJECT_ID,
    code: "CIVIL",
    name: "Civil Works",
    status: "ACTIVE",
    approvedBudgetAmount: 600,
    forecastAmount: 650,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function vendor(): Vendor {
  return { id: VENDOR_ID, companyId: COMPANY_ID, name: "Canonical Supplier", normalizedName: "canonical supplier", active: true };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: EXPENSE_ID,
    projectId: PROJECT_ID,
    projectCostCodeId: COST_CODE_ID,
    expenseDate: "2026-09-20",
    category: "Materials",
    description: "Site materials",
    payee: "Direct Supplier",
    amount: 1000,
    currency: "PHP",
    paymentMethod: "BANK",
    referenceNumber: "REF-001",
    status: "DRAFT",
    notes: "Original note",
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

function invoice(): InvoiceData {
  return {
    id: INVOICE_ID,
    linkedExpenseId: EXPENSE_ID,
    documentType: "INVOICE",
    reviewStatus: "VERIFIED",
    lifecycleStatus: "ACTIVE",
    invoiceNumber: "PRIVATE-SUPPLIER-INVOICE-9182",
    invoiceDate: "2026-09-18",
    dueDate: "2026-10-18",
    currency: "PHP",
    vendor: { name: "Canonical Supplier", vendorId: VENDOR_ID },
    items: [{ id: "invoice-line-1", description: "Pipe", quantity: 1, unitPrice: 2000, total: 2000 }],
    subtotal: 2000,
    totalTax: 0,
    grandTotal: 2000,
    amountPaid: 150,
    extractedAt: "2026-09-18T00:00:00.000Z",
    modelUsed: "test",
  };
}

function procurementRecords() {
  const currentProject = project();
  const currentVendor = vendor();
  const rfq: RFQ = {
    id: "rfq-1",
    companyId: COMPANY_ID,
    rfqNumber: "RFQ-001",
    title: "Pipe package",
    description: "Original description",
    projectId: PROJECT_ID,
    currency: "PHP",
    status: "DRAFT",
    dueDate: "2026-09-25",
    notes: "Original notes",
    lines: [{ id: "rfq-line-1", companyId: COMPANY_ID, rfqId: "rfq-1", lineNumber: 1, description: "Steel pipe", quantity: 10, unit: "pcs", requestedDeliveryDate: "2026-10-01", notes: null }],
    invitedVendorIds: [VENDOR_ID],
    updatedAt: "2026-09-19T00:00:00.000Z",
  };
  const purchaseOrder: PurchaseOrder = {
    id: "po-1",
    companyId: COMPANY_ID,
    poNumber: "PO-001",
    vendorId: VENDOR_ID,
    projectId: PROJECT_ID,
    currency: "PHP",
    status: "DRAFT",
    description: "Order description",
    notes: "Order notes",
    totalAmount: 2500,
    lines: [{ id: "po-line-1", companyId: COMPANY_ID, purchaseOrderId: "po-1", lineNumber: 1, description: "Steel pipe", quantity: 10, unit: "pcs", unitPrice: 250, amount: 2500 }],
    updatedAt: "2026-09-19T00:00:00.000Z",
  };
  return { rfqs: [rfq], purchaseOrders: [purchaseOrder], projects: [currentProject], vendors: [currentVendor] };
}

function context(overrides: Partial<CombinedOperationsWorkbookImportContext> = {}): CombinedOperationsWorkbookImportContext {
  const currentProject = project();
  const currentCostCode = costCode();
  const currentExpense = expense({ supplierInvoiceId: INVOICE_ID, vendorId: VENDOR_ID });
  const procurement = procurementRecords();
  return {
    permissions: ALL_READ_PERMISSIONS,
    allowApply: true,
    companyId: COMPANY_ID,
    projects: { projects: [currentProject], costCodes: [currentCostCode], expectedCompanyId: COMPANY_ID },
    expenses: {
      expenses: [currentExpense, expense({ id: DIRECT_EXPENSE_ID, description: "Unlinked direct Expense", supplierInvoiceId: undefined, vendorId: undefined })],
      projects: [currentProject],
      costCodes: [currentCostCode],
      invoices: [invoice()],
      purchaseOrders: procurement.purchaseOrders,
      vendors: procurement.vendors,
      expectedCompanyId: COMPANY_ID,
    },
    procurement: { ...procurement, expectedCompanyId: COMPANY_ID },
    ...overrides,
  };
}

function exportCombined(permissions: readonly string[] = ALL_READ_PERMISSIONS) {
  const currentProject = project();
  const currentCostCode = costCode();
  const linkedExpense = expense({ supplierInvoiceId: INVOICE_ID, vendorId: VENDOR_ID });
  const directExpense = expense({ id: DIRECT_EXPENSE_ID, description: "Unlinked direct Expense", supplierInvoiceId: undefined, vendorId: undefined });
  const procurement = procurementRecords();
  return exportCombinedOperationsWorkbook({
    permissions,
    companyId: COMPANY_ID,
    projects: { projects: [currentProject], costCodes: [currentCostCode] },
    expenses: {
      expenses: [linkedExpense, directExpense],
      projects: [currentProject],
      costCodes: [currentCostCode],
      invoices: [invoice()],
      purchaseOrders: procurement.purchaseOrders,
      vendors: procurement.vendors,
    },
    procurement,
  });
}

function editCell(bytes: Uint8Array, sheetName: string, header: string, value: unknown, rowIndex = 1) {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true, cellFormula: true, bookVBA: true });
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const headers = (rows[0] || []).map((item) => String(item));
  const column = headers.indexOf(header);
  assert.notEqual(column, -1, `${sheetName} must contain ${header}`);
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: column });
  sheet[address] = typeof value === "number" ? { t: "n", v: value } : { t: "s", v: String(value) };
  return new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }));
}

function editCellByRecordId(bytes: Uint8Array, sheetName: string, header: string, recordId: string, value: unknown) {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true, cellFormula: true, bookVBA: true });
  const sheet = workbook.Sheets[sheetName];
  assert.ok(sheet, `${sheetName} sheet must exist`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const headers = (rows[0] || []).map((item) => String(item));
  const idColumn = headers.indexOf("__HQ Record ID");
  const column = headers.indexOf(header);
  assert.notEqual(idColumn, -1, `${sheetName} must contain synchronization identity`);
  assert.notEqual(column, -1, `${sheetName} must contain ${header}`);
  const rowIndex = rows.findIndex((row, index) => index > 0 && String(row[idColumn] || "") === recordId);
  assert.notEqual(rowIndex, -1, `${sheetName} must contain record ${recordId}`);
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: column });
  sheet[address] = typeof value === "number" ? { t: "n", v: value } : { t: "s", v: String(value) };
  const rewrittenBytes = new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }));
  const reopened = XLSX.read(rewrittenBytes, { type: "array", cellDates: true, cellFormula: true });
  assert.equal((reopened.Sheets[sheetName]![address] as { v?: unknown }).v, value);
  assert.equal((reopened.Sheets[sheetName]![address] as { f?: string }).f, undefined);
  return rewrittenBytes;
}

function rewrite(workbook: XLSX.WorkBook) {
  return new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true, bookVBA: true }));
}

function expectImportError(bytes: Uint8Array, code: WorkbookImportError["code"], contextOverride: Partial<CombinedOperationsWorkbookImportContext> = {}, fileName = "operations.xlsx") {
  assert.throws(
    () => buildCombinedOperationsWorkbookImportReview(bytes, context(contextOverride), { fileName }),
    (error: unknown) => error instanceof WorkbookImportError && error.code === code,
  );
}

test("combined export keeps a deterministic eight-sheet order and domain-namespaced synchronization metadata", () => {
  const first = exportCombined();
  const second = exportCombined();
  const workbook = XLSX.read(first.bytes, { type: "array", cellDates: true });
  assert.equal(first.fileName, "HydroQualiSense_Operations_Workbook.xlsx");
  assert.deepEqual(workbook.SheetNames, [
    "Projects", "Cost Codes", "Expenses", "Supplier Payables", "RFQs", "RFQ Lines", "Purchase Orders", "PO Lines", "_HydroQualiSense",
  ]);
  assert.deepEqual(XLSX.read(second.bytes, { type: "array" }).SheetNames, workbook.SheetNames);
  const combined = parseOperationsWorkbook(first.bytes, { schema: COMBINED_OPERATIONS_WORKBOOK_SCHEMA });
  assert.equal(combined.workbookKind, "HYDROQUALISENSE_COMBINED_OPERATIONS_WORKBOOK");
  assert.equal(combined.schemaVersion, 1);
  assert.equal(combined.metadata.contractId, "hydroqualisense.operations-workbook");
  assert.equal(combined.metadataRows.some((row) => row.entity === "wb2:projects:PROJECT" && row.recordId === PROJECT_ID && Boolean(row.fingerprint)), true);
  assert.equal(combined.metadataRows.some((row) => row.entity === "wb2:expenses:EXPENSE" && row.recordId === EXPENSE_ID), true);
  assert.equal(combined.metadataRows.some((row) => row.entity === "wb2:procurement:RFQ" && row.recordId === "rfq-1"), true);
  const metadataIndex = workbook.SheetNames.indexOf("_HydroQualiSense");
  assert.equal((workbook.Workbook?.Sheets?.[metadataIndex] as { Hidden?: number } | undefined)?.Hidden, 1);
});

test("combined export parses back through each existing domain review", () => {
  const artifact = exportCombined();
  const review = buildCombinedOperationsWorkbookImportReview(artifact.bytes, context(), { fileName: artifact.fileName });
  assert.deepEqual(review.domains.map((domain) => domain.id), ["projects", "expenses", "procurement"]);
  assert.ok(review.domains.every((domain) => domain.state === "READY"));
  assert.equal(review.domains.find((domain) => domain.id === "projects")?.proposals[0]?.status, "UNCHANGED");
  assert.equal(review.domains.find((domain) => domain.id === "expenses")?.proposals.some((proposal) => proposal.entity === "SUPPLIER_PAYABLE"), true);
  assert.equal(review.domains.find((domain) => domain.id === "procurement")?.proposals.every((proposal) => proposal.status === "UNCHANGED"), true);
});

test("export includes only currently readable domain records and records the data scopes", () => {
  const artifact = exportCombined(["projects.read"]);
  const parsed = parseOperationsWorkbook(artifact.bytes, { schema: COMBINED_OPERATIONS_WORKBOOK_SCHEMA });
  const manifest = JSON.parse(String(parsed.metadata.sourceManifest)) as Array<{ id: string; includedSheetNames: string[] }>;
  assert.deepEqual(manifest.map((entry) => [entry.id, entry.includedSheetNames]), [
    ["projects", ["Projects", "Cost Codes"]],
    ["expenses", []],
    ["procurement", []],
  ]);
  assert.equal(parsed.sheets.Projects.rows.length, 1);
  assert.equal(parsed.sheets["Cost Codes"].rows.length, 1);
  assert.equal(parsed.sheets.Expenses.rows.length, 0);
  assert.equal(parsed.sheets.RFQs.rows.length, 0);
  assert.equal(parsed.metadataRows.every((row) => String(row.entity).startsWith("wb2:projects:")), true);
});

test("expense write permission never substitutes for expense read permission", () => {
  const artifact = exportCombined(["expenses.manage"]);
  const parsed = parseOperationsWorkbook(artifact.bytes, { schema: COMBINED_OPERATIONS_WORKBOOK_SCHEMA });
  const manifest = JSON.parse(String(parsed.metadata.sourceManifest)) as Array<{ id: string; includedSheetNames: string[] }>;
  assert.deepEqual(manifest.find((entry) => entry.id === "expenses")?.includedSheetNames, []);
  assert.equal(parsed.sheets.Expenses.rows.length, 0);
  assert.equal(parsed.sheets["Supplier Payables"].rows.length, 0);
  assert.equal(parsed.metadataRows.length, 0);

  const review = buildCombinedOperationsWorkbookImportReview(
    exportCombined().bytes,
    context({ permissions: ["expenses.manage"] }),
    { fileName: "operations.xlsx" },
  );
  const expensesReview = review.domains.find((domain) => domain.id === "expenses");
  assert.equal(expensesReview?.state, "UNAUTHORIZED");
  assert.deepEqual(expensesReview?.proposals, []);
});

test("combined exports contain only independently read-authorized domains and supporting sheets", () => {
  const projectOnly = parseOperationsWorkbook(exportCombined(["projects.read"]).bytes, { schema: COMBINED_OPERATIONS_WORKBOOK_SCHEMA });
  assert.equal(projectOnly.sheets.Projects.rows.length, 1);
  assert.equal(projectOnly.sheets["Cost Codes"].rows.length, 1);
  assert.equal(projectOnly.sheets.Expenses.rows.length, 0);
  assert.equal(projectOnly.sheets.RFQs.rows.length, 0);

  const expensesOnly = parseOperationsWorkbook(exportCombined(["expenses.read"]).bytes, { schema: COMBINED_OPERATIONS_WORKBOOK_SCHEMA });
  const expensesManifest = JSON.parse(String(expensesOnly.metadata.sourceManifest)) as Array<{ id: string; includedSheetNames: string[] }>;
  assert.deepEqual(expensesManifest.find((entry) => entry.id === "expenses")?.includedSheetNames, ["Expenses"]);
  assert.equal(expensesOnly.sheets.Expenses.rows.length, 1, "invoice-linked Expense rows are withheld without invoice read authority");
  assert.equal(expensesOnly.sheets["Supplier Payables"].rows.length, 0);
  assert.equal(expensesOnly.sheets.Expenses.rows.every((row) => row["Supplier Invoice"] === ""), true);
  assert.equal(JSON.stringify(expensesOnly.metadataRows).includes(INVOICE_ID), false);

  const payableReadable = parseOperationsWorkbook(exportCombined(["expenses.read", "invoices.read"]).bytes, { schema: COMBINED_OPERATIONS_WORKBOOK_SCHEMA });
  const payableManifest = JSON.parse(String(payableReadable.metadata.sourceManifest)) as Array<{ id: string; includedSheetNames: string[] }>;
  assert.deepEqual(payableManifest.find((entry) => entry.id === "expenses")?.includedSheetNames, ["Expenses", "Supplier Payables"]);
  assert.equal(payableReadable.sheets["Supplier Payables"].rows.length, 1);

  const procurementOnly = parseOperationsWorkbook(exportCombined(["procurement.read"]).bytes, { schema: COMBINED_OPERATIONS_WORKBOOK_SCHEMA });
  assert.equal(procurementOnly.sheets.RFQs.rows.length, 1);
  assert.equal(procurementOnly.sheets["RFQ Lines"].rows.length, 1);
  assert.equal(procurementOnly.sheets["Purchase Orders"].rows.length, 1);
  assert.equal(procurementOnly.sheets.Projects.rows.length, 0);
  assert.doesNotMatch(JSON.stringify(procurementOnly), /Water Treatment Upgrade|PRIVATE-SUPPLIER-INVOICE-9182/);
});

test("write and approval permissions alone never export private domain rows", () => {
  for (const permissions of [["projects.manage"], ["expenses.manage"], ["procurement.manage"], ["procurement.approve"]] as const) {
    const artifact = exportCombined(permissions);
    const parsed = parseOperationsWorkbook(artifact.bytes, { schema: COMBINED_OPERATIONS_WORKBOOK_SCHEMA });
    assert.equal(Object.values(parsed.sheets).every((sheet) => sheet.rows.length === 0), true, permissions.join(","));
    assert.deepEqual(parsed.metadataRows, [], permissions.join(","));
    assert.doesNotMatch(JSON.stringify(parsed), /Water Treatment Upgrade|Site materials|Pipe package|PRIVATE-SUPPLIER-INVOICE-9182/);
  }
});

test("permission changes hide unauthorized rows and do not return their values in import review", () => {
  const artifact = exportCombined();
  const edited = editCell(artifact.bytes, "Expenses", "Description", "PRIVATE-UNAUTHORIZED-EXPENSE");
  const review = buildCombinedOperationsWorkbookImportReview(edited, context({ permissions: ["projects.read"] }), { fileName: artifact.fileName });
  assert.equal(review.domains.find((domain) => domain.id === "expenses")?.state, "UNAUTHORIZED");
  assert.equal(review.domains.find((domain) => domain.id === "expenses")?.proposals.length, 0);
  assert.equal(review.domains.find((domain) => domain.id === "procurement")?.state, "UNAUTHORIZED");
  assert.doesNotMatch(JSON.stringify(review), /PRIVATE-UNAUTHORIZED-EXPENSE|PRIVATE-SUPPLIER-INVOICE-9182|Order description/);
});

test("Supplier Payables and linked invoice values are withheld when invoice read permission is absent", () => {
  const artifact = exportCombined();
  const review = buildCombinedOperationsWorkbookImportReview(artifact.bytes, context({
    permissions: ["expenses.read"],
    projects: { projects: [], costCodes: [], expectedCompanyId: COMPANY_ID },
    procurement: { ...procurementRecords(), expectedCompanyId: COMPANY_ID },
  }), { fileName: artifact.fileName });
  const expensesReview = review.domains.find((domain) => domain.id === "expenses");
  assert.equal(expensesReview?.state, "UNAUTHORIZED");
  assert.deepEqual(expensesReview?.proposals, []);
  assert.doesNotMatch(JSON.stringify(review), /PRIVATE-SUPPLIER-INVOICE-9182|Canonical Supplier/);
});

test("Expenses-only export omits invoice references from Expense rows when invoices are not readable", () => {
  const artifact = exportCombined(["expenses.read"]);
  const parsed = parseOperationsWorkbook(artifact.bytes, { schema: COMBINED_OPERATIONS_WORKBOOK_SCHEMA });
  const row = parsed.sheets.Expenses.rows[0];
  assert.equal(parsed.sheets.Expenses.rows.length, 1);
  assert.equal(row["Supplier Invoice"], "");
  assert.equal(parsed.sheets["Supplier Payables"].rows.length, 0);
  assert.equal(JSON.stringify(parsed.metadataRows).includes(INVOICE_ID), false);
});

test("workbook-only project edits are separated from application changes and protected lifecycle edits", () => {
  const artifact = exportCombined();
  const workbookEdit = editCell(artifact.bytes, "Projects", "Project Name", "Workbook-only project name");
  const currentContext = context({
    projects: {
      projects: [project({ projectName: "Changed in HydroQualiSense", updatedAt: "2026-02-01T00:00:00.000Z" })],
      costCodes: [costCode()],
      expectedCompanyId: COMPANY_ID,
    },
  });
  const review = buildCombinedOperationsWorkbookImportReview(workbookEdit, currentContext, { fileName: artifact.fileName });
  assert.equal(review.domains.find((domain) => domain.id === "projects")?.proposals[0]?.status, "STALE_CONFLICT");

  const protectedEdit = editCell(artifact.bytes, "Projects", "Status", "ARCHIVED");
  const protectedReview = buildCombinedOperationsWorkbookImportReview(protectedEdit, context(), { fileName: artifact.fileName });
  const projectProposal = protectedReview.domains.find((domain) => domain.id === "projects")?.proposals[0];
  assert.equal(projectProposal?.status, "UNSUPPORTED_PROTECTED_FIELD");
  assert.equal(projectProposal?.canApply, false);
});

test("combined review offers one domain-scoped Apply path and revalidates with current Projects state", async () => {
  const artifact = exportCombined();
  const edited = editCell(artifact.bytes, "Projects", "Project Name", "Workbook project edit");
  const writableContext = context({ permissions: [...ALL_READ_PERMISSIONS, "projects.manage", "expenses.manage", "procurement.manage"] });
  const review = buildCombinedOperationsWorkbookImportReview(edited, writableContext, { fileName: artifact.fileName });
  const projectReview = review.domains.find((domain) => domain.id === "projects");
  assert.ok(projectReview && projectReview.id === "projects");
  let projectApplyCount = 0;
  let expenseApplyCount = 0;
  let procurementApplyCount = 0;
  const callbacks = {
    projects: { applyGroup: async () => { projectApplyCount += 1; } },
    expenses: { saveExpense: async () => { expenseApplyCount += 1; } },
    procurement: {
      saveRFQ: async () => { procurementApplyCount += 1; },
      savePurchaseOrder: async () => { procurementApplyCount += 1; },
    },
  };
  const applied = await applyCombinedOperationsWorkbookDomain(projectReview, writableContext, callbacks, [projectReview.proposals[0]!.id]);
  assert.equal(applied.appliedProposalIds.length, 1);
  assert.equal(projectApplyCount, 1);
  assert.equal(expenseApplyCount, 0);
  assert.equal(procurementApplyCount, 0);

  let staleApplyCount = 0;
  const staleContext = context({
    permissions: [...ALL_READ_PERMISSIONS, "projects.manage"],
    projects: {
      projects: [project({ projectName: "Newer app value", updatedAt: "2026-03-01T00:00:00.000Z" })],
      costCodes: [costCode()],
      expectedCompanyId: COMPANY_ID,
    },
  });
  await assert.rejects(
    () => applyCombinedOperationsWorkbookDomain(projectReview, staleContext, {
      projects: { applyGroup: async () => { staleApplyCount += 1; } },
    }, [projectReview.proposals[0]!.id]),
    /stale or no longer safe to apply|changed and is no longer safe to apply/i,
  );
  assert.equal(staleApplyCount, 0);
});

test("combined export-edit-review-Apply-refresh round trip preserves values and delegates each domain separately", async () => {
  const writePermissions = [...ALL_READ_PERMISSIONS, "projects.manage", "expenses.manage", "procurement.manage"] as const;
  const original = exportCombined(writePermissions);
  const longFormulaLikeText = `=SUM(1,1) O'Connell ${"reviewed source text ".repeat(40).trimEnd()}`;
  let edited = editCellByRecordId(original.bytes, "Projects", "Project Name", PROJECT_ID, "O'Connell Water Upgrade");
  edited = editCellByRecordId(edited, "Expenses", "Description", DIRECT_EXPENSE_ID, longFormulaLikeText);
  edited = editCellByRecordId(edited, "Expenses", "Amount", DIRECT_EXPENSE_ID, 1234.56);
  edited = editCellByRecordId(edited, "Expenses", "Currency", DIRECT_EXPENSE_ID, "USD");
  edited = editCellByRecordId(edited, "Expenses", "Reference", DIRECT_EXPENSE_ID, "");
  edited = editCellByRecordId(edited, "RFQs", "Title", "rfq-1", "Revised pipe package");
  edited = editCellByRecordId(edited, "Purchase Orders", "Description", "po-1", "O'Connell supply order");

  const reopened = XLSX.read(edited, { type: "array", cellDates: true, cellFormula: true });
  const expensesSheet = reopened.Sheets.Expenses!;
  const expenseMatrix = XLSX.utils.sheet_to_json<unknown[]>(expensesSheet, { header: 1, raw: true, defval: null });
  const expenseHeaders = (expenseMatrix[0] || []).map((item) => String(item));
  const directRowIndex = expenseMatrix.findIndex((row, index) => index > 0 && String(row[expenseHeaders.indexOf("__HQ Record ID")] || "") === DIRECT_EXPENSE_ID);
  const descriptionCell = expensesSheet[XLSX.utils.encode_cell({ r: directRowIndex, c: expenseHeaders.indexOf("Description") })] as { v?: unknown; f?: string } | undefined;
  assert.equal(descriptionCell?.v, longFormulaLikeText);
  assert.equal(descriptionCell?.f, undefined, "formula-like text stays a literal string");
  const roundTrippedBytes = new Uint8Array(XLSX.write(reopened, { bookType: "xlsx", type: "array", compression: true }));
  const parsed = parseOperationsWorkbook(roundTrippedBytes, { schema: COMBINED_OPERATIONS_WORKBOOK_SCHEMA });
  const originalParsed = parseOperationsWorkbook(original.bytes, { schema: COMBINED_OPERATIONS_WORKBOOK_SCHEMA });
  const cellDate = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "");
  const parsedExpense = parsed.sheets.Expenses.rows.find((row) => row["__HQ Record ID"] === DIRECT_EXPENSE_ID);
  assert.equal(parsedExpense?.Description, longFormulaLikeText);
  assert.equal(parsedExpense?.Amount, 1234.56);
  assert.equal(parsedExpense?.Currency, "USD");
  assert.equal(parsedExpense?.Reference, "");
  assert.equal(cellDate(parsed.sheets.Projects.rows.find((row) => row["__HQ Record ID"] === PROJECT_ID)?.["Start Date"]), cellDate(originalParsed.sheets.Projects.rows.find((row) => row["__HQ Record ID"] === PROJECT_ID)?.["Start Date"]));
  assert.equal(cellDate(parsedExpense?.Date), cellDate(originalParsed.sheets.Expenses.rows.find((row) => row["__HQ Record ID"] === DIRECT_EXPENSE_ID)?.Date));
  assert.equal(cellDate(parsed.sheets.RFQs.rows[0]?.["Due Date"]), cellDate(originalParsed.sheets.RFQs.rows[0]?.["Due Date"]));
  const metadataSheetIndex = reopened.SheetNames.indexOf("_HydroQualiSense");
  assert.equal((reopened.Workbook?.Sheets?.[metadataSheetIndex] as { Hidden?: number } | undefined)?.Hidden, 1);

  const current = context({ permissions: writePermissions });
  const review = buildCombinedOperationsWorkbookImportReview(roundTrippedBytes, current, { fileName: original.fileName });
  const projectReview = review.domains.find((domain) => domain.id === "projects")!;
  const expenseReview = review.domains.find((domain) => domain.id === "expenses")!;
  const procurementReview = review.domains.find((domain) => domain.id === "procurement")!;
  const projectProposal = projectReview.proposals.find((proposal) => proposal.canApply)!;
  const expenseProposal = expenseReview.proposals.find((proposal) => proposal.entity === "EXPENSE" && proposal.canApply)!;
  const procurementProposals = procurementReview.proposals.filter((proposal) => proposal.canApply);
  assert.equal(projectProposal.changes.find((change) => change.field === "projectName")?.workbookValue, "O'Connell Water Upgrade");
  assert.equal(expenseProposal.changes.find((change) => change.field === "description")?.workbookValue, longFormulaLikeText);
  assert.equal(expenseProposal.changes.find((change) => change.field === "amount")?.workbookValue, 1234.56);
  assert.equal(expenseProposal.changes.find((change) => change.field === "currency")?.workbookValue, "USD");
  assert.equal(procurementProposals.length, 2);
  assert.equal(procurementProposals.some((proposal) => proposal.changes.some((change) => change.field === "title" && change.workbookValue === "Revised pipe package")), true);
  assert.equal(procurementProposals.some((proposal) => proposal.changes.some((change) => change.field === "description" && change.workbookValue === "O'Connell supply order")), true);

  const callbacksInvoked: string[] = [];
  let savedProjectName = "";
  let savedExpense: Expense | undefined;
  let savedRFQ: RFQ | undefined;
  let savedPO: PurchaseOrder | undefined;
  const appliedProjects = await applyCombinedOperationsWorkbookDomain(projectReview, current, {
    projects: { applyGroup: async (group) => { callbacksInvoked.push("projects"); savedProjectName = group.project.projectName; } },
  }, [projectProposal.id]);
  assert.deepEqual(appliedProjects.appliedProposalIds, [projectProposal.id]);
  assert.equal(savedProjectName, "O'Connell Water Upgrade");
  assert.deepEqual(callbacksInvoked, ["projects"]);

  const appliedExpenses = await applyCombinedOperationsWorkbookDomain(expenseReview, current, {
    expenses: { saveExpense: async (next) => { callbacksInvoked.push("expenses"); savedExpense = next; } },
  }, [expenseProposal.id]);
  assert.deepEqual(appliedExpenses.appliedProposalIds, [expenseProposal.id]);
  assert.equal(savedExpense?.amount, 1234.56);
  assert.equal(savedExpense?.currency, "USD");
  assert.equal(savedExpense?.expenseDate, "2026-09-20");
  assert.equal(savedExpense?.referenceNumber, undefined);
  assert.deepEqual(callbacksInvoked, ["projects", "expenses"]);

  const procurementApplied = await applyCombinedOperationsWorkbookDomain(procurementReview, current, {
    procurement: {
      saveRFQ: async (rfq, lines, invitedVendorIds, expectedUpdatedAt, preserveCurrentLines) => {
        callbacksInvoked.push("rfq");
        savedRFQ = rfq as RFQ;
        assert.equal(expectedUpdatedAt, procurementRecords().rfqs[0]!.updatedAt);
        assert.equal(preserveCurrentLines, true, "header-only RFQ changes preserve current line identities");
        assert.equal(lines[0]?.id, "rfq-line-1");
        assert.equal(lines[0]?.description, "Steel pipe");
        assert.equal(lines[0]?.quantity, 10);
        assert.equal(lines[0]?.projectCostCodeId, null);
        assert.deepEqual(invitedVendorIds, procurementRecords().rfqs[0]!.invitedVendorIds);
      },
      savePurchaseOrder: async (po, lines, expectedUpdatedAt, preserveCurrentLines) => {
        callbacksInvoked.push("po");
        savedPO = po as PurchaseOrder;
        assert.equal(expectedUpdatedAt, procurementRecords().purchaseOrders[0]!.updatedAt);
        assert.equal(preserveCurrentLines, true, "header-only PO changes preserve current line identities");
        assert.equal(lines[0]?.id, "po-line-1");
        assert.equal(lines[0]?.description, "Steel pipe");
        assert.equal(lines[0]?.quantity, 10);
        assert.equal(lines[0]?.unitPrice, 250);
        assert.equal(lines[0]?.amount, 2500);
        assert.equal(lines[0]?.projectCostCodeId, null);
      },
    },
  }, procurementProposals.map((proposal) => proposal.id));
  assert.deepEqual(procurementApplied.appliedProposalIds, procurementProposals.map((proposal) => proposal.id));
  assert.equal(savedRFQ?.title, "Revised pipe package");
  assert.equal(savedRFQ?.dueDate, "2026-09-25");
  assert.equal(savedPO?.description, "O'Connell supply order");
  assert.deepEqual(callbacksInvoked, ["projects", "expenses", "rfq", "po"]);

  const nextUpdatedAt = "2026-09-22T00:00:00.000Z";
  const refreshed = context({
    permissions: writePermissions,
    projects: {
      projects: [project({ projectName: savedProjectName, updatedAt: nextUpdatedAt })],
      costCodes: [costCode()],
      expectedCompanyId: COMPANY_ID,
    },
    expenses: {
      ...context().expenses,
      expenses: [
        expense({ supplierInvoiceId: INVOICE_ID, vendorId: VENDOR_ID }),
        expense({ id: DIRECT_EXPENSE_ID, description: longFormulaLikeText, amount: 1234.56, currency: "USD", referenceNumber: undefined, updatedAt: nextUpdatedAt }),
      ],
      expectedCompanyId: COMPANY_ID,
    },
    procurement: {
      ...procurementRecords(),
      rfqs: [{ ...procurementRecords().rfqs[0]!, title: "Revised pipe package", updatedAt: nextUpdatedAt }],
      purchaseOrders: [{ ...procurementRecords().purchaseOrders[0]!, description: "O'Connell supply order", updatedAt: nextUpdatedAt }],
      expectedCompanyId: COMPANY_ID,
    },
  });
  for (const domainReview of [projectReview, expenseReview, procurementReview]) {
    const latestReview = refreshCombinedOperationsWorkbookDomainReview(domainReview, refreshed);
    const appliedProposals = latestReview.proposals.filter((proposal) => proposal.status === "APP_ONLY_CHANGE");
    assert.ok(appliedProposals.length > 0, `expected refreshed ${domainReview.id} proposal to reflect authoritative post-Apply state; received ${JSON.stringify(latestReview.proposals.map((proposal) => ({ id: proposal.id, entity: proposal.entity, status: proposal.status, changes: proposal.changes })))}`);
    assert.equal(appliedProposals.every((proposal) => proposal.changes.length === 0), true);
    assert.equal(latestReview.proposals.some((proposal) => proposal.canApply), false);
    if (domainReview.id === "procurement") assert.equal(appliedProposals.length, 2);
    for (const appliedProposal of appliedProposals) {
    assert.equal(appliedProposal.canApply, false);
    assert.equal(appliedProposal.status, "APP_ONLY_CHANGE");
    }
  }
});

test("company and permission changes invalidate an open review and prevent cross-company Apply", async () => {
  const writePermissions = [...ALL_READ_PERMISSIONS, "projects.manage", "expenses.manage", "procurement.manage"] as const;
  const projectEdited = editCellByRecordId(exportCombined(writePermissions).bytes, "Projects", "Project Name", PROJECT_ID, "Company A proposal");
  const expenseEdited = editCellByRecordId(exportCombined(writePermissions).bytes, "Expenses", "Description", DIRECT_EXPENSE_ID, "Company A Expense proposal");
  const procurementEdited = editCellByRecordId(exportCombined(writePermissions).bytes, "RFQs", "Title", "rfq-1", "Company A RFQ proposal");
  const cases: Array<{
    bytes: Uint8Array;
    id: "projects" | "expenses" | "procurement";
    findProposal: (domain: CombinedOperationsWorkbookDomainReview) => { id: string; canApply: boolean } | undefined;
  }> = [
    { bytes: projectEdited, id: "projects", findProposal: (domain) => domain.proposals.find((item) => item.canApply) },
    { bytes: expenseEdited, id: "expenses", findProposal: (domain) => domain.proposals.find((item) => item.entity === "EXPENSE" && item.canApply) },
    { bytes: procurementEdited, id: "procurement", findProposal: (domain) => domain.proposals.find((item) => item.canApply) },
  ];
  const companyB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const otherCompany: CombinedOperationsWorkbookImportContext = {
    permissions: writePermissions,
    allowApply: true,
    companyId: companyB,
    projects: { projects: [], costCodes: [], expectedCompanyId: companyB },
    expenses: { expenses: [], projects: [], costCodes: [], invoices: [], purchaseOrders: [], vendors: [], expectedCompanyId: companyB },
    procurement: { rfqs: [], purchaseOrders: [], projects: [], vendors: [], expectedCompanyId: companyB },
  };

  for (const candidate of cases) {
    const sourceReview = buildCombinedOperationsWorkbookImportReview(candidate.bytes, context({ permissions: writePermissions }));
    const sourceDomain = sourceReview.domains.find((domain) => domain.id === candidate.id)!;
    const selected = candidate.findProposal(sourceDomain);
    assert.ok(selected, `${candidate.id} source review has an editable proposal`);
    let calls = 0;
    const callbacks = candidate.id === "projects"
      ? { projects: { applyGroup: async () => { calls += 1; } } }
      : candidate.id === "expenses"
        ? { expenses: { saveExpense: async () => { calls += 1; } } }
        : { procurement: { saveRFQ: async () => { calls += 1; }, savePurchaseOrder: async () => { calls += 1; } } };
    await assert.rejects(
      () => applyCombinedOperationsWorkbookDomain(sourceDomain, otherCompany, callbacks, [selected.id]),
      /stale|changed|no longer safe|company|outside/i,
    );
    assert.equal(calls, 0, `${candidate.id} proposal from company A never reaches company B callbacks`);

    const readRevoked = { ...otherCompany, companyId: COMPANY_ID, projects: { projects: [project()], costCodes: [costCode()], expectedCompanyId: COMPANY_ID }, expenses: context().expenses, procurement: { ...procurementRecords(), expectedCompanyId: COMPANY_ID }, permissions: candidate.id === "projects" ? ["projects.manage"] : candidate.id === "expenses" ? ["expenses.manage"] : ["procurement.manage"] } as CombinedOperationsWorkbookImportContext;
    await assert.rejects(
      () => applyCombinedOperationsWorkbookDomain(sourceDomain, readRevoked, callbacks, [selected.id]),
      /Access changed|permission/i,
    );
    const hidden = refreshCombinedOperationsWorkbookDomainReview(sourceDomain, readRevoked);
    assert.equal(hidden.state, "UNAUTHORIZED");
    assert.deepEqual(hidden.proposals, []);
    assert.equal(calls, 0, `${candidate.id} permission removal after review prevents Apply`);
  }

  const supplierReview = buildCombinedOperationsWorkbookImportReview(exportCombined(writePermissions).bytes, context({ permissions: writePermissions }));
  const expenses = supplierReview.domains.find((domain) => domain.id === "expenses")!;
  const invoiceReadRevoked = { ...context({ permissions: writePermissions }), permissions: writePermissions.filter((permission) => permission !== "invoices.read") };
  const hiddenPayables = refreshCombinedOperationsWorkbookDomainReview(expenses, invoiceReadRevoked);
  assert.equal(hiddenPayables.state, "UNAUTHORIZED");
  assert.deepEqual(hiddenPayables.proposals, []);
  assert.doesNotMatch(JSON.stringify(hiddenPayables), /PRIVATE-SUPPLIER-INVOICE-9182|Canonical Supplier/);
});

test("partial project Apply refreshes from current state and removes completed proposals from retry selection", async () => {
  const writePermissions = [...ALL_READ_PERMISSIONS, "projects.manage"] as const;
  const projectTwo = project({ id: "77777777-7777-4777-8777-777777777777", projectCode: "PRJ-002", projectName: "Second project" });
  const projectThree = project({ id: "88888888-8888-4888-8888-888888888888", projectCode: "PRJ-003", projectName: "Third project" });
  const records = [project(), projectTwo, projectThree];
  const artifact = exportCombinedOperationsWorkbook({
    permissions: writePermissions,
    companyId: COMPANY_ID,
    projects: { projects: records, costCodes: [costCode()] },
    expenses: {
      expenses: [], projects: records, costCodes: [costCode()], invoices: [], purchaseOrders: [], vendors: [],
    },
    procurement: { ...procurementRecords(), rfqs: [], purchaseOrders: [] },
  });
  let edited = artifact.bytes;
  for (const record of records) edited = editCellByRecordId(edited, "Projects", "Project Name", record.id, `${record.projectName} edited`);
  const initialContext = context({
    permissions: writePermissions,
    projects: { projects: records, costCodes: [costCode()], expectedCompanyId: COMPANY_ID },
  });
  const review = buildCombinedOperationsWorkbookImportReview(edited, initialContext, { fileName: artifact.fileName });
  const projectReview = review.domains.find((domain) => domain.id === "projects")!;
  const selectedIds = projectReview.proposals.filter((proposal) => proposal.canApply).map((proposal) => proposal.id);
  assert.equal(selectedIds.length, 3);
  const appliedNames: string[] = [];
  let groups = 0;
  await assert.rejects(() => applyCombinedOperationsWorkbookDomain(projectReview, initialContext, {
    projects: { applyGroup: async (group) => {
      groups += 1;
      if (groups === 2) throw new Error("simulated later project group failure");
      appliedNames.push(group.project.projectName);
    } },
  }, selectedIds), /simulated later project group failure/);
  assert.equal(groups, 2);
  assert.deepEqual(appliedNames, [`${records[0]!.projectName} edited`]);

  const afterPartialApply = context({
    permissions: writePermissions,
    projects: {
      projects: [
        project({ projectName: `${records[0]!.projectName} edited`, updatedAt: "2026-09-22T00:00:00.000Z" }),
        projectTwo,
        projectThree,
      ],
      costCodes: [costCode()],
      expectedCompanyId: COMPANY_ID,
    },
  });
  const refreshed = refreshCombinedOperationsWorkbookDomainReview(projectReview, afterPartialApply);
  const appliedProposal = refreshed.proposals.find((proposal) => proposal.status === "APP_ONLY_CHANGE");
  assert.ok(appliedProposal);
  assert.equal(appliedProposal.canApply, false);
  const retrySelection = retainApplicableCombinedOperationsWorkbookProposalIds(refreshed, selectedIds);
  assert.deepEqual(retrySelection, selectedIds.filter((id) => id !== appliedProposal.id));
  assert.equal(retrySelection.length, 2);
});

test("combined workbook kind, version, synchronization identity, and compatibility are validated", () => {
  const artifact = exportCombined();
  expectImportError(editCell(artifact.bytes, "_HydroQualiSense", "contractVersion", 99), "SCHEMA_MISMATCH");
  expectImportError(editCell(artifact.bytes, "_HydroQualiSense", "workbookKind", "OTHER"), "SCHEMA_MISMATCH");

  const duplicate = XLSX.read(artifact.bytes, { type: "array", cellDates: true });
  const metadata = duplicate.Sheets._HydroQualiSense!;
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(metadata, { header: 1, raw: true, defval: null });
  const headers = (matrix[0] || []).map((value) => String(value));
  const sync = XLSX.utils.sheet_to_json<Record<string, unknown>>(metadata, { raw: true, defval: null }).find((row) => row.__wb2MetadataRowKind === "SYNC")!;
  const duplicateRow = headers.map((header) => sync[header] ?? null);
  XLSX.utils.sheet_add_aoa(metadata, [duplicateRow], { origin: -1 });
  expectImportError(rewrite(duplicate), "DUPLICATE_ID");

  const renamed = XLSX.read(artifact.bytes, { type: "array" });
  const expenseSheet = renamed.Sheets.Expenses!;
  delete renamed.Sheets.Expenses;
  renamed.Sheets["Expense Renamed"] = expenseSheet;
  renamed.SheetNames[renamed.SheetNames.indexOf("Expenses")] = "Expense Renamed";
  expectImportError(rewrite(renamed), "SCHEMA_MISMATCH");

  const extra = XLSX.read(artifact.bytes, { type: "array" });
  XLSX.utils.book_append_sheet(extra, XLSX.utils.aoa_to_sheet([["Unexpected"]]), "Unexpected");
  expectImportError(rewrite(extra), "SCHEMA_MISMATCH");

  const missing = XLSX.read(artifact.bytes, { type: "array" });
  delete missing.Sheets["RFQ Lines"];
  missing.SheetNames = missing.SheetNames.filter((name) => name !== "RFQ Lines");
  expectImportError(rewrite(missing), "SCHEMA_MISMATCH");
});

test("combined parsing retains formula, macro, external-link, and file-size protections", () => {
  const artifact = exportCombined();
  const formula = XLSX.read(artifact.bytes, { type: "array", cellFormula: true });
  formula.Sheets.Projects!.B2 = { t: "n", f: "1+1", v: 2 };
  expectImportError(rewrite(formula), "UNSAFE_CONTENT");

  const macro = XLSX.read(artifact.bytes, { type: "array" }) as XLSX.WorkBook & { vbaraw?: Uint8Array };
  macro.vbaraw = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  const macroBytes = XLSX.write(macro, { bookType: "xlsm", type: "array", bookVBA: true }) as Uint8Array;
  expectImportError(macroBytes, "UNSAFE_CONTENT");

  const external = XLSX.read(artifact.bytes, { type: "array" });
  external.Sheets.Projects!.B2 = { t: "s", v: "linked", l: { Target: "https://example.test" } };
  expectImportError(rewrite(external), "EXTERNAL_LINK");

  expectImportError(artifact.bytes, "UNSUPPORTED_FORMAT", {}, "operations.xlsm");
  expectImportError(new Uint8Array([1, 2, 3]), "MALFORMED_WORKBOOK");
  expectImportError(new Uint8Array(15 * 1024 * 1024 + 1), "FILE_TOO_LARGE", {}, "operations.xlsx");

  const tooManyRows = XLSX.read(artifact.bytes, { type: "array" });
  const projectsSheet = tooManyRows.Sheets.Projects!;
  const headers = XLSX.utils.sheet_to_json<unknown[]>(projectsSheet, { header: 1, raw: true, defval: null })[0]!.map(String);
  const row = new Array(headers.length).fill(null) as unknown[];
  row[headers.indexOf("__HQ Record ID")] = "over-limit-row";
  XLSX.utils.sheet_add_aoa(projectsSheet, [row], { origin: { r: DEFAULT_WORKBOOK_PARSER_LIMITS.maxRowsPerSheet + 1, c: 0 } });
  expectImportError(rewrite(tooManyRows), "SHEET_TOO_LARGE");

  const longText = "x".repeat(DEFAULT_WORKBOOK_PARSER_LIMITS.maxCellTextLength + 1);
  expectImportError(editCell(artifact.bytes, "Projects", "Description", longText), "SHEET_TOO_LARGE");
});
