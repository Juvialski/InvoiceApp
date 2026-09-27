import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  availableOperationsWorkbookSheets,
  canAccessOperationsWorkbook,
  canEditOperationsWorkbookField,
  canReadOperationsWorkbookSheet,
  findOperationsWorkbookSheet,
  OPERATIONS_WORKBOOK,
  OPERATIONS_WORKBOOK_ENABLED_ADAPTERS,
  OPERATIONS_WORKBOOK_SHEET_REGISTRY,
  operationsWorkbookColumns,
  operationsWorkbookContextKey,
  resolveOperationsWorkbookSheetSelection,
  type OperationsWorkbookSheetAdapter,
} from "../src/lib/operationsWorkbookModel.ts";
import { OperationsWorkbookRoute } from "../src/app/routes/OperationsWorkbookRoute.tsx";
import { PERMISSION_KEYS } from "../src/utils/accessControl.ts";
import type { Expense, Project, ProjectCostCode, PurchaseOrder, RFQ } from "../src/types.ts";
import type { ExpensesWorkbookRecords } from "../src/lib/expensesWorkbook.ts";

const project: Project = {
  id: "project-1",
  projectCode: "DEMO-01",
  projectName: "Synthetic Water Upgrade",
  clientName: "Synthetic Client",
  status: "ACTIVE",
  projectBudget: 1000,
  currency: "PHP",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};
const costCode: ProjectCostCode = {
  id: "cost-code-1",
  companyId: "company-1",
  projectId: project.id,
  code: "01-GEN",
  name: "General works",
  description: "Mobilization",
  status: "ACTIVE",
  approvedBudgetAmount: 500,
  forecastAmount: 450,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const directExpense: Expense = {
  id: "expense-direct-1",
  projectId: project.id,
  projectCostCodeId: costCode.id,
  expenseDate: "2026-09-20",
  category: "Fuel",
  description: "Site fuel",
  payee: "Direct Supplier",
  amount: 100,
  currency: "PHP",
  paymentMethod: "Cash",
  status: "DRAFT",
  notes: "Original note",
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const linkedExpense: Expense = {
  ...directExpense,
  id: "expense-linked-1",
  description: "Supplier source expense",
  supplierInvoiceId: "invoice-secret-id",
  vendorId: "vendor-secret-id",
  purchaseOrderId: "po-secret-id",
};

function expenseRecords(expenses: readonly Expense[] = [directExpense, linkedExpense]): ExpensesWorkbookRecords {
  return {
    expenses,
    projects: [project],
    costCodes: [costCode],
    invoices: [],
    purchaseOrders: [],
    vendors: [],
    expectedCompanyId: "company-1",
  };
}

const projectSheet = findOperationsWorkbookSheet("projects")!;
const costCodeSheet = findOperationsWorkbookSheet("cost-codes")!;
const expenseSheet = findOperationsWorkbookSheet("expenses")!;
const rfqSheet = findOperationsWorkbookSheet("rfqs")!;
const purchaseOrderSheet = findOperationsWorkbookSheet("purchase-orders")!;
const payrollSheet = findOperationsWorkbookSheet("payroll")!;
const projectNameField = projectSheet.fields.find((field) => field.id === "projectName")!;

function adapterFor(
  sheet = projectSheet,
  overrides: Partial<OperationsWorkbookSheetAdapter<Project>> = {},
): OperationsWorkbookSheetAdapter<Project> {
  return {
    sheet,
    rows: [project],
    writeMode: "synthetic-demo",
    dataScope: "synthetic-demo",
    readValue: (row, fieldId) => fieldId === "projectName" ? row.projectName : fieldId === "status" ? row.status : undefined,
    applyDraftValue: (row, fieldId, value) => fieldId === "projectName" ? { ...row, projectName: String(value ?? "") } : row,
    canEditField: (field) => field.id === "projectName",
    onSave: () => undefined,
    ...overrides,
  };
}

test("Operations Workbook sheet order and metadata vocabulary are deterministic", () => {
  assert.equal(OPERATIONS_WORKBOOK.title, "Operations Workbook");
  assert.deepEqual(OPERATIONS_WORKBOOK.sheetIds, [
    "projects",
    "cost-codes",
    "supplier-invoices",
    "expenses",
    "rfqs",
    "purchase-orders",
    "materials",
    "equipment",
    "warehouse",
    "vendors",
    "payroll",
  ]);
  assert.deepEqual(OPERATIONS_WORKBOOK.sheetIds, OPERATIONS_WORKBOOK_SHEET_REGISTRY.map((sheet) => sheet.id));

  const fieldTypes = new Set(OPERATIONS_WORKBOOK_SHEET_REGISTRY.flatMap((sheet) => sheet.fields.map((field) => field.type)));
  assert.deepEqual([...fieldTypes].sort(), ["boolean", "currency", "date", "identifier", "number", "select", "text"]);
  const authorityKinds = new Set(OPERATIONS_WORKBOOK_SHEET_REGISTRY.flatMap((sheet) => sheet.fields.map((field) => field.authority)));
  assert.deepEqual([...authorityKinds].sort(), [
    "calculated",
    "conditionally-editable",
    "lifecycle-controlled",
    "ordinary-editable",
    "protected",
    "read-only",
    "source-evidence",
    "workflow-only",
  ]);
  assert.deepEqual(OPERATIONS_WORKBOOK_ENABLED_ADAPTERS, ["projects", "cost-codes", "expenses", "rfqs", "purchase-orders"]);
});

test("Payroll sheet metadata requires payroll detail read and never aggregate-report access", () => {
  assert.deepEqual(payrollSheet.authorization.readAnyOf, [PERMISSION_KEYS.payrollRead]);
  assert.equal(payrollSheet.authorityBoundary.includes("payroll.detail.read"), true);
  assert.equal((payrollSheet.authorization.readAnyOf as readonly string[]).includes(String(PERMISSION_KEYS.reportsPayrollRead)), false);
  assert.equal(Object.values(PERMISSION_KEYS).some((key) => key.startsWith("workbook.")), false);
});

test("available sheets are filtered by enabled adapter and the existing domain read permission", () => {
  assert.deepEqual(availableOperationsWorkbookSheets([PERMISSION_KEYS.projectsRead]).map((sheet) => sheet.id), ["projects", "cost-codes"]);
  assert.deepEqual(availableOperationsWorkbookSheets([PERMISSION_KEYS.expensesRead]).map((sheet) => sheet.id), ["expenses"]);
  assert.deepEqual(availableOperationsWorkbookSheets([PERMISSION_KEYS.procurementRead]).map((sheet) => sheet.id), ["rfqs", "purchase-orders"]);
  assert.deepEqual(availableOperationsWorkbookSheets([PERMISSION_KEYS.procurementApprove]), []);
  assert.deepEqual(availableOperationsWorkbookSheets([PERMISSION_KEYS.payrollRead]), []);
  assert.deepEqual(availableOperationsWorkbookSheets([PERMISSION_KEYS.projectsWrite]), []);
  assert.deepEqual(availableOperationsWorkbookSheets([PERMISSION_KEYS.procurementWrite]), []);
  assert.equal(canReadOperationsWorkbookSheet(projectSheet, [PERMISSION_KEYS.projectsRead]), true);
  assert.equal(canReadOperationsWorkbookSheet(projectSheet, [PERMISSION_KEYS.projectsWrite]), false);
  assert.equal(canReadOperationsWorkbookSheet(costCodeSheet, [PERMISSION_KEYS.projectsRead]), true);
  assert.equal(canReadOperationsWorkbookSheet(expenseSheet, [PERMISSION_KEYS.expensesRead]), true);
  assert.equal(canReadOperationsWorkbookSheet(expenseSheet, [PERMISSION_KEYS.expensesWrite]), false);
  assert.equal(canReadOperationsWorkbookSheet(rfqSheet, [PERMISSION_KEYS.procurementRead]), true);
  assert.equal(canReadOperationsWorkbookSheet(rfqSheet, [PERMISSION_KEYS.procurementWrite]), false);
  assert.equal(canReadOperationsWorkbookSheet(purchaseOrderSheet, [PERMISSION_KEYS.procurementApprove]), false);
  assert.equal(canAccessOperationsWorkbook([PERMISSION_KEYS.projectsWrite]), false);

  const payrollAdapterEnabled = { ...payrollSheet, readiness: "available" as const };
  const payrollOnly = availableOperationsWorkbookSheets([PERMISSION_KEYS.payrollRead], {
    registry: [projectSheet, payrollAdapterEnabled],
    enabledAdapters: ["projects", "payroll"],
  });
  assert.deepEqual(payrollOnly.map((sheet) => sheet.id), ["payroll"]);
});

test("Procurement workbook tabs require read permission and stay read-only without manage", () => {
  assert.equal(canAccessOperationsWorkbook([PERMISSION_KEYS.expensesRead]), true);
  assert.equal(canAccessOperationsWorkbook([PERMISSION_KEYS.expensesWrite]), false);
  assert.equal(canAccessOperationsWorkbook([PERMISSION_KEYS.procurementRead]), true);
  assert.equal(canAccessOperationsWorkbook([PERMISSION_KEYS.procurementWrite]), false);
  assert.equal(canAccessOperationsWorkbook([PERMISSION_KEYS.procurementApprove]), false);
  assert.equal(canAccessOperationsWorkbook([PERMISSION_KEYS.payrollRead]), false);
  assert.equal(canAccessOperationsWorkbook((function* () { yield PERMISSION_KEYS.expensesRead; })()), true);
  assert.deepEqual(availableOperationsWorkbookSheets([PERMISSION_KEYS.expensesRead]).map((sheet) => sheet.id), ["expenses"]);
  assert.deepEqual(availableOperationsWorkbookSheets((function* () { yield PERMISSION_KEYS.procurementRead; })()).map((sheet) => sheet.id), ["rfqs", "purchase-orders"]);

  const procurementOnlyHtml = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    permissions: [PERMISSION_KEYS.procurementRead],
    search: "",
    procurementRecords: {
      rfqs: [{ id: "read-rfq", companyId: "company-1", rfqNumber: "RFQ-READ-001", title: "Authorized RFQ", currency: "PHP", status: "DRAFT", lines: [], updatedAt: "2026-09-20T00:00:00.000Z" } satisfies RFQ],
      purchaseOrders: [{ id: "read-po", companyId: "company-1", poNumber: "PO-READ-001", vendorId: "vendor-1", projectId: project.id, currency: "PHP", status: "DRAFT", description: "Authorized Purchase Order", totalAmount: 100, lines: [], updatedAt: "2026-09-20T00:00:00.000Z" } satisfies PurchaseOrder],
      projects: [project],
      vendors: [],
      expectedCompanyId: "company-1",
    },
  }));
  assert.match(procurementOnlyHtml, /Download workbook/);
  assert.match(procurementOnlyHtml, /Import workbook/);
  assert.match(procurementOnlyHtml, /role="tablist"/);
  assert.match(procurementOnlyHtml, /data-workbook-sheet="rfqs"/);
  assert.match(procurementOnlyHtml, /RFQ-READ-001/);
  assert.match(procurementOnlyHtml, /Purchase orders/);
  assert.doesNotMatch(procurementOnlyHtml, /Save changes/);

  const poReadOnlyHtml = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    permissions: [PERMISSION_KEYS.procurementRead],
    search: "?sheet=purchase-orders",
    procurementRecords: {
      rfqs: [],
      purchaseOrders: [{ id: "read-po", companyId: "company-1", poNumber: "PO-READ-001", vendorId: "vendor-1", projectId: project.id, currency: "PHP", status: "DRAFT", description: "Authorized Purchase Order", totalAmount: 100, lines: [], updatedAt: "2026-09-20T00:00:00.000Z" } satisfies PurchaseOrder],
      projects: [project],
      vendors: [],
      expectedCompanyId: "company-1",
    },
  }));
  assert.match(poReadOnlyHtml, /data-workbook-sheet="purchase-orders"/);
  assert.match(poReadOnlyHtml, /PO-READ-001/);
  assert.doesNotMatch(poReadOnlyHtml, /Save changes/);

  const manageWithoutReadHtml = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    permissions: [PERMISSION_KEYS.procurementWrite],
    search: "?sheet=purchase-orders",
    procurementRecords: {
      rfqs: [{ id: "hidden-rfq", companyId: "company-1", rfqNumber: "RFQ-HIDDEN-001", title: "Hidden RFQ", currency: "PHP", status: "DRAFT" } satisfies RFQ],
      purchaseOrders: [{ id: "hidden-po", companyId: "company-1", poNumber: "PO-HIDDEN-001", vendorId: "hidden-vendor", projectId: "hidden-project", currency: "PHP", status: "DRAFT", description: "Hidden Purchase Order" } satisfies PurchaseOrder],
      projects: [],
      vendors: [],
      expectedCompanyId: "company-1",
    },
  }));
  assert.doesNotMatch(manageWithoutReadHtml, /RFQ-HIDDEN-001|PO-HIDDEN-001|Hidden RFQ|Hidden Purchase Order/);
  assert.doesNotMatch(manageWithoutReadHtml, /role="tablist"/);

  const approveWithoutReadHtml = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project], permissions: [PERMISSION_KEYS.procurementApprove], search: "?sheet=rfqs",
  }));
  assert.doesNotMatch(approveWithoutReadHtml, /role="tablist"|RFQs|Purchase Orders/);

  const hiddenProjectSheetHtml = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    costCodes: [costCode],
    permissions: [PERMISSION_KEYS.projectsWrite, PERMISSION_KEYS.expensesRead],
    search: "?sheet=cost-codes",
    expenseRecords: expenseRecords(),
  }));
  assert.match(hiddenProjectSheetHtml, /data-workbook-sheet="expenses"/);
  assert.doesNotMatch(hiddenProjectSheetHtml, /DEMO-01|01-GEN/);

  const unauthorizedProcurementDeepLink = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    permissions: [PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.procurementWrite],
    search: "?sheet=purchase-orders",
    expenseRecords: expenseRecords(),
    procurementRecords: {
      rfqs: [{ id: "hidden-rfq", companyId: "company-1", rfqNumber: "RFQ-HIDDEN-DEEP-LINK", title: "Hidden RFQ", currency: "PHP", status: "DRAFT" } satisfies RFQ],
      purchaseOrders: [{ id: "hidden-po", companyId: "company-1", poNumber: "PO-HIDDEN-DEEP-LINK", vendorId: "hidden-vendor", projectId: "hidden-project", currency: "PHP", status: "DRAFT", description: "Hidden Purchase Order" } satisfies PurchaseOrder],
      projects: [],
      vendors: [],
      expectedCompanyId: "company-1",
    },
  }));
  assert.match(unauthorizedProcurementDeepLink, /data-workbook-sheet="expenses"/);
  assert.doesNotMatch(unauthorizedProcurementDeepLink, /RFQ-HIDDEN-DEEP-LINK|PO-HIDDEN-DEEP-LINK|Hidden RFQ|Hidden Purchase Order/);
});

test("combined workbook review state is cleared when company or permission context changes", () => {
  const transferSource = readFileSync(new URL("../src/app/routes/OperationsWorkbookTransfer.tsx", import.meta.url), "utf8");
  assert.match(transferSource, /const currentContextKey = operationsWorkbookContextKey\(companyId, permissions, demoMode\);/);
  assert.match(transferSource, /contextSnapshotRef\.current\.contextKey !== currentContextKey[\s\S]*?generation: contextSnapshotRef\.current\.generation \+ 1/);
  assert.match(transferSource, /combinedWorkbookReviewForContext\(reviewSnapshot, currentContextKey, currentContextGeneration\)/);
  assert.match(
    transferSource,
    /useEffect\(\(\) => \{[\s\S]*?setReviewSnapshot\(null\);[\s\S]*?setSelectedByDomain\(EMPTY_SELECTION\);[\s\S]*?setConfirmedByDomain\(EMPTY_CONFIRMATION\);[\s\S]*?\}, \[currentContextKey\]\);/,
  );
  const routeSource = readFileSync(new URL("../src/app/routes/OperationsWorkbookRoute.tsx", import.meta.url), "utf8");
  assert.match(routeSource, /key=\{`\$\{currentContextKey\}:\$\{selectedSheet\.id\}:\$\{editorRevision\}`\}/);
  assert.match(routeSource, /previousContextKeyRef\.current === currentContextKey[\s\S]*?stagedEditsRef\.current = false;[\s\S]*?setCellIssues\(\{\}\);[\s\S]*?setFeedback\(null\)/);
  assert.match(routeSource, /stagedEditsRef\.current[\s\S]*?Save or discard your worksheet edits before switching sheets/);
  assert.match(routeSource, /disabled=\{workspaceLoading \|\| isSaving \|\| hasStagedEdits\}/);
  assert.match(transferSource, /disabled=\{busy \|\| disabled\}[^>]*>[\s\S]*?Download workbook/);
  assert.match(transferSource, /disabled=\{busy \|\| disabled\}[^>]*>[\s\S]*?Import workbook/);
});

test("write access is separate from read access and workbook metadata cannot enable production writes", () => {
  const projectRow = { ...project };
  const demoAdapter = adapterFor();
  assert.equal(canEditOperationsWorkbookField(projectSheet, projectNameField, demoAdapter, projectRow, 0, [PERMISSION_KEYS.projectsRead]), false);
  assert.equal(canEditOperationsWorkbookField(projectSheet, projectNameField, demoAdapter, projectRow, 0, [PERMISSION_KEYS.projectsWrite]), false);

  const productionAdapter = adapterFor(projectSheet, { writeMode: "existing-domain", dataScope: undefined });
  assert.equal(canEditOperationsWorkbookField(projectSheet, projectNameField, productionAdapter, projectRow, 0, [PERMISSION_KEYS.projectsRead, PERMISSION_KEYS.projectsWrite]), true);

  const readOnlyAdapter = adapterFor(projectSheet, {
    writeMode: "none",
    dataScope: undefined,
    applyDraftValue: undefined,
    onSave: undefined,
  });
  const productionNameColumn = operationsWorkbookColumns(readOnlyAdapter, [PERMISSION_KEYS.projectsRead, PERMISSION_KEYS.projectsWrite])
    .find((column) => column.key === "projectName")!;
  assert.equal(productionNameColumn.setValue?.(projectRow, "Should stay unchanged").projectName, projectRow.projectName);

  const incompleteAdapter = adapterFor(projectSheet, { onSave: undefined });
  assert.equal(canEditOperationsWorkbookField(projectSheet, projectNameField, incompleteAdapter, projectRow, 0, [PERMISSION_KEYS.projectsRead, PERMISSION_KEYS.projectsWrite]), false);
});

test("protected, calculated, source-evidence, lifecycle, and workflow fields stay non-editable", () => {
  const adapter = adapterFor();
  const protectedFields = OPERATIONS_WORKBOOK_SHEET_REGISTRY.flatMap((sheet) => sheet.fields
    .filter((field) => ["protected", "calculated", "source-evidence", "lifecycle-controlled", "workflow-only", "read-only"].includes(field.authority))
    .map((field) => ({ sheet, field })));

  assert.ok(protectedFields.length > 0);
  for (const { sheet, field } of protectedFields) {
    assert.equal(canEditOperationsWorkbookField(
      sheet,
      field,
      adapterFor(sheet, { sheet, writeMode: "existing-domain" }),
      project,
      0,
      ["*"],
    ), false, `${sheet.id}.${field.id}`);
  }
});

test("valid selection is retained and unknown or unauthorized selections recover without exposing metadata", () => {
  const visible = availableOperationsWorkbookSheets([PERMISSION_KEYS.projectsRead]);
  assert.equal(resolveOperationsWorkbookSheetSelection("projects", visible)?.id, "projects");
  assert.equal(resolveOperationsWorkbookSheetSelection("cost-codes", visible)?.id, "cost-codes");
  assert.equal(resolveOperationsWorkbookSheetSelection("payroll", visible)?.id, "projects");
  assert.equal(resolveOperationsWorkbookSheetSelection("missing-sheet", visible)?.id, "projects");
  assert.equal(resolveOperationsWorkbookSheetSelection("payroll", []) , undefined);
});

test("workbook edit state is scoped to active company, effective permissions, and synthetic data mode", () => {
  const original = operationsWorkbookContextKey("company-a", [PERMISSION_KEYS.projectsRead], false);
  assert.notEqual(original, operationsWorkbookContextKey("company-b", [PERMISSION_KEYS.projectsRead], false));
  assert.notEqual(original, operationsWorkbookContextKey("company-a", [PERMISSION_KEYS.projectsRead, PERMISSION_KEYS.projectsWrite], false));
  assert.notEqual(original, operationsWorkbookContextKey("company-a", [PERMISSION_KEYS.projectsRead], true));
  assert.notEqual(original, operationsWorkbookContextKey("company-a", [PERMISSION_KEYS.expensesRead], false));
  assert.notEqual(original, operationsWorkbookContextKey("company-a", [PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.expensesWrite], false));
  assert.equal(original, operationsWorkbookContextKey("company-a", [PERMISSION_KEYS.projectsRead], false));
});

test("generic WorksheetEditor adaptation preserves editable, protected, boolean, and validation state", () => {
  const editableAdapter = adapterFor(projectSheet, { writeMode: "synthetic-demo" });
  const columns = operationsWorkbookColumns(editableAdapter, [PERMISSION_KEYS.projectsRead, PERMISSION_KEYS.projectsWrite]);
  const projectName = columns.find((column) => column.key === "projectName")!;
  const status = columns.find((column) => column.key === "status")!;

  assert.equal(projectName.editable instanceof Function && projectName.editable(project, 0), true);
  assert.equal(projectName.setValue?.(project, "Renamed demo project").projectName, "Renamed demo project");
  assert.equal(status.editable instanceof Function && status.editable(project, 0), false);
  assert.equal(status.protected, true);

  const warehouse = findOperationsWorkbookSheet("warehouse")!;
  const activeField = warehouse.fields.find((field) => field.id === "active")!;
  const booleanAdapter = adapterFor(warehouse, { readValue: () => false });
  const booleanColumn = operationsWorkbookColumns(booleanAdapter, ["*"]).find((column) => column.key === activeField.id)!;
  assert.equal(booleanColumn.kind, "select");
  assert.equal(booleanColumn.format?.(false, project), "No");
  assert.deepEqual(booleanColumn.parse?.("yes", {
    row: project,
    rowIndex: 0,
    rowKey: project.id,
    column: booleanColumn,
    columnIndex: 0,
    source: "edit",
  }), { valid: true, value: true });
});

test("Operations Workbook shell exposes both read-authorized sheets without mutation controls for read-only roles", () => {
  const html = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    costCodes: [costCode],
    permissions: [PERMISSION_KEYS.projectsRead],
    search: "?sheet=payroll",
    onNavigatePath: () => undefined,
  }));
  assert.match(html, /data-workbook-sheet="projects"/);
  assert.match(html, /Operations Workbook sheets/);
  assert.match(html, /role="tablist" aria-label="Operations Workbook sheets" aria-orientation="horizontal"/);
  assert.match(html, /role="tab" aria-selected="true"/);
  assert.match(html, /Cost codes/);
  assert.match(html, /data-worksheet-desktop-grid/);
  assert.match(html, /data-worksheet-mobile-fallback/);
  assert.match(html, /data-worksheet-editable="false"/);
  assert.match(html, /read only/);
  assert.match(html, /data-worksheet-protected="true"/);
  assert.doesNotMatch(html, /data-worksheet-action-bar/);
  assert.doesNotMatch(html, /Save changes/);
  assert.match(html, /Download workbook/);
  assert.match(html, /Import workbook/);
  assert.doesNotMatch(html, /Payroll/);

  const manageWithoutReadHtml = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    costCodes: [costCode],
    permissions: [PERMISSION_KEYS.projectsWrite],
    search: "?sheet=projects",
  }));
  assert.match(manageWithoutReadHtml, /not available for the current access profile/);
  assert.doesNotMatch(manageWithoutReadHtml, /DEMO-01|01-GEN|Cost Codes/);

  const configuredEditorHtml = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    costCodes: [costCode],
    permissions: [PERMISSION_KEYS.projectsRead, PERMISSION_KEYS.projectsWrite],
    search: "?sheet=cost-codes",
    onRefreshProjects: async () => ({ projects: [project], costCodes: [costCode] }),
    onApplyProjectWorkbookGroup: async () => undefined,
  }));
  assert.match(configuredEditorHtml, /data-workbook-sheet="cost-codes"/);
  assert.match(configuredEditorHtml, /data-worksheet-editable="true"/);
  assert.match(configuredEditorHtml, /Save changes/);
  assert.doesNotMatch(configuredEditorHtml, /:projectId|companyId|updatedAt/);

  const demoHtml = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    costCodes: [costCode],
    permissions: ["*"],
    search: "?sheet=projects",
    demoMode: true,
    onNavigatePath: () => undefined,
  }));
  assert.match(demoHtml, /data-worksheet-editable="true"/);
  assert.match(demoHtml, /Save demo edits/);
  assert.match(demoHtml, /Apply is disabled/);

  const payrollOnlyHtml = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    permissions: [PERMISSION_KEYS.payrollRead],
    search: "?sheet=payroll",
    onNavigatePath: () => undefined,
  }));
  assert.match(payrollOnlyHtml, /not available for the current access profile/);
  assert.doesNotMatch(payrollOnlyHtml, /Payroll/);
});

test("Expenses sheet separates read and manage access and keeps ineligible or cross-domain state protected", () => {
  const rows: Expense[] = [
    directExpense,
    linkedExpense,
    { ...directExpense, id: "expense-archived-1", description: "Archived direct Expense", archivedAt: "2026-09-21T00:00:00.000Z" },
    { ...directExpense, id: "expense-approved-1", description: "Approved direct Expense", status: "APPROVED" },
    { ...directExpense, id: "expense-void-1", description: "Void direct Expense", status: "VOID", voidedAt: "2026-09-21T00:00:00.000Z" },
  ];
  const records = expenseRecords(rows);
  const readOnlyHtml = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    costCodes: [costCode],
    expenseRecords: records,
    companyId: "company-1",
    permissions: [PERMISSION_KEYS.expensesRead],
    search: "?sheet=expenses",
  }));
  assert.match(readOnlyHtml, /data-workbook-sheet="expenses"/);
  assert.match(readOnlyHtml, /Site fuel/);
  assert.match(readOnlyHtml, /read only/);
  assert.doesNotMatch(readOnlyHtml, /Save changes/);
  assert.doesNotMatch(readOnlyHtml, /invoice-secret-id|vendor-secret-id|po-secret-id/);

  const editableHtml = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    costCodes: [costCode],
    expenseRecords: records,
    companyId: "company-1",
    permissions: [PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.expensesWrite, PERMISSION_KEYS.projectsRead],
    search: "?sheet=expenses",
    onRefreshExpenses: async () => records,
    onSaveExpenseDraft: async () => undefined,
  }));
  assert.match(editableHtml, /data-worksheet-cell="expense-direct-1:description"[^>]*data-worksheet-editable="true"/);
  assert.match(editableHtml, /data-worksheet-cell="expense-direct-1:amount"[^>]*data-worksheet-editable="true"/);
  assert.match(editableHtml, /Save changes/);
  assert.match(editableHtml, /Linked source · protected/);
  assert.match(editableHtml, /data-worksheet-cell="expense-linked-1:description"[^>]*data-worksheet-editable="false"/);
  for (const id of ["expense-archived-1", "expense-approved-1", "expense-void-1"]) {
    assert.match(editableHtml, new RegExp(`data-worksheet-cell="${id}:description"[^>]*data-worksheet-editable="false"`));
  }
  for (const field of ["expenseId", "status", "sourceLinkage", "vendorLinkage", "purchaseOrderLinkage", "settlementState", "baseCurrencyValue", "fxProvenance", "archiveState", "voidCorrectionState", "createdAt", "updatedAt"]) {
    assert.match(editableHtml, new RegExp(`data-worksheet-cell="expense-direct-1:${field}"[^>]*data-worksheet-editable="false"`), field);
  }

  const manageWithoutReadHtml = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    costCodes: [costCode],
    expenseRecords: expenseRecords([{ ...directExpense, description: "Expense permission leak sentinel" }]),
    permissions: [PERMISSION_KEYS.projectsRead, PERMISSION_KEYS.expensesWrite],
    search: "?sheet=expenses",
  }));
  assert.match(manageWithoutReadHtml, /data-workbook-sheet="projects"/);
  assert.doesNotMatch(manageWithoutReadHtml, /Expense permission leak sentinel|role="tab"[^>]*>Expenses/);

  const withoutProjectRead = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    costCodes: [costCode],
    expenseRecords: records,
    permissions: [PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.expensesWrite],
    search: "?sheet=expenses",
    onRefreshExpenses: async () => records,
    onSaveExpenseDraft: async () => undefined,
  }));
  assert.match(withoutProjectRead, /Assigned project/);
  assert.match(withoutProjectRead, /Assigned cost code/);
  assert.doesNotMatch(withoutProjectRead, /data-worksheet-cell="expense-direct-1:projectId"[^>]*data-worksheet-editable="true"/);
  assert.doesNotMatch(withoutProjectRead, /project-1|cost-code-1/);
});
