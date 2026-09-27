import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import type { Expense, InvoiceData, Project, ProjectCostCode, PurchaseOrder, RFQ, Vendor } from "../src/types.ts";
import { WorkbookImportError, parseOperationsWorkbook } from "../src/lib/operationsWorkbook.ts";
import {
  COMBINED_OPERATIONS_WORKBOOK_SCHEMA,
  applyCombinedOperationsWorkbookDomain,
  buildCombinedOperationsWorkbookImportReview,
  exportCombinedOperationsWorkbook,
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
});
