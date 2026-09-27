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
import type { Project, ProjectCostCode } from "../src/types.ts";

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

const projectSheet = findOperationsWorkbookSheet("projects")!;
const costCodeSheet = findOperationsWorkbookSheet("cost-codes")!;
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
  assert.deepEqual(OPERATIONS_WORKBOOK_ENABLED_ADAPTERS, ["projects", "cost-codes"]);
});

test("Payroll sheet metadata requires payroll detail read and never aggregate-report access", () => {
  assert.deepEqual(payrollSheet.authorization.readAnyOf, [PERMISSION_KEYS.payrollRead]);
  assert.equal(payrollSheet.authorityBoundary.includes("payroll.detail.read"), true);
  assert.equal((payrollSheet.authorization.readAnyOf as readonly string[]).includes(String(PERMISSION_KEYS.reportsPayrollRead)), false);
  assert.equal(Object.values(PERMISSION_KEYS).some((key) => key.startsWith("workbook.")), false);
});

test("available sheets are filtered by enabled adapter and the existing domain read permission", () => {
  assert.deepEqual(availableOperationsWorkbookSheets([PERMISSION_KEYS.projectsRead]).map((sheet) => sheet.id), ["projects", "cost-codes"]);
  assert.deepEqual(availableOperationsWorkbookSheets([PERMISSION_KEYS.payrollRead]), []);
  assert.deepEqual(availableOperationsWorkbookSheets([PERMISSION_KEYS.projectsWrite]), []);
  assert.equal(canReadOperationsWorkbookSheet(projectSheet, [PERMISSION_KEYS.projectsRead]), true);
  assert.equal(canReadOperationsWorkbookSheet(projectSheet, [PERMISSION_KEYS.projectsWrite]), false);
  assert.equal(canReadOperationsWorkbookSheet(costCodeSheet, [PERMISSION_KEYS.projectsRead]), true);
  assert.equal(canAccessOperationsWorkbook([PERMISSION_KEYS.projectsWrite]), false);

  const payrollAdapterEnabled = { ...payrollSheet, readiness: "available" as const };
  const payrollOnly = availableOperationsWorkbookSheets([PERMISSION_KEYS.payrollRead], {
    registry: [projectSheet, payrollAdapterEnabled],
    enabledAdapters: ["projects", "payroll"],
  });
  assert.deepEqual(payrollOnly.map((sheet) => sheet.id), ["payroll"]);
});

test("combined workbook access follows existing domain reads without enabling more production tabs", () => {
  assert.equal(canAccessOperationsWorkbook([PERMISSION_KEYS.expensesRead]), true);
  assert.equal(canAccessOperationsWorkbook([PERMISSION_KEYS.expensesWrite]), false);
  assert.equal(canAccessOperationsWorkbook([PERMISSION_KEYS.procurementRead]), true);
  assert.equal(canAccessOperationsWorkbook([PERMISSION_KEYS.payrollRead]), false);
  assert.equal(canAccessOperationsWorkbook((function* () { yield PERMISSION_KEYS.expensesRead; })()), true);
  assert.deepEqual(availableOperationsWorkbookSheets([PERMISSION_KEYS.expensesRead]), []);
  assert.deepEqual(availableOperationsWorkbookSheets([PERMISSION_KEYS.procurementRead]), []);
  assert.deepEqual(availableOperationsWorkbookSheets((function* () { yield PERMISSION_KEYS.procurementRead; })()), []);

  const procurementOnlyHtml = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    permissions: [PERMISSION_KEYS.procurementRead],
    search: "",
  }));
  assert.match(procurementOnlyHtml, /Download workbook/);
  assert.match(procurementOnlyHtml, /Import workbook/);
  assert.doesNotMatch(procurementOnlyHtml, /role="tablist"/);
  assert.doesNotMatch(procurementOnlyHtml, /data-workbook-sheet=/);

  const hiddenProjectSheetHtml = renderToStaticMarkup(React.createElement(OperationsWorkbookRoute, {
    projects: [project],
    costCodes: [costCode],
    permissions: [PERMISSION_KEYS.projectsWrite, PERMISSION_KEYS.expensesRead],
    search: "?sheet=cost-codes",
  }));
  assert.doesNotMatch(hiddenProjectSheetHtml, /data-workbook-sheet|DEMO-01|01-GEN|Cost codes/);
});

test("combined workbook review state is cleared when company or permission context changes", () => {
  const transferSource = readFileSync(new URL("../src/app/routes/OperationsWorkbookTransfer.tsx", import.meta.url), "utf8");
  assert.match(
    transferSource,
    /useEffect\(\(\) => \{[\s\S]*?setReview\(null\);[\s\S]*?setSelectedByDomain\(EMPTY_SELECTION\);[\s\S]*?setConfirmedByDomain\(EMPTY_CONFIRMATION\);[\s\S]*?\}, \[companyId, demoMode, permissionSnapshotKey\]\);/,
  );
  const routeSource = readFileSync(new URL("../src/app/routes/OperationsWorkbookRoute.tsx", import.meta.url), "utf8");
  assert.match(routeSource, /key=\{`\$\{currentContextKey\}:\$\{selectedSheet\.id\}:\$\{editorRevision\}`\}/);
  assert.match(routeSource, /previousContextKeyRef\.current === currentContextKey[\s\S]*?stagedEditsRef\.current = false;[\s\S]*?setCellIssues\(\{\}\);[\s\S]*?setFeedback\(null\)/);
  assert.match(routeSource, /stagedEditsRef\.current[\s\S]*?Save or discard your worksheet edits before switching sheets/);
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
