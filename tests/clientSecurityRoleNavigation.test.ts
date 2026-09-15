import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getNavigationModel } from "../src/navigation/navigationModel.ts";
import { canAccessAppTab, defaultAppTabForPermissions, PERMISSION_KEYS, type PermissionKey } from "../src/utils/accessControl.ts";

function moduleLabels(permissions: string[]) {
  return getNavigationModel({ permissions }).modules.map((module) => module.id);
}

const PAYROLL_PERMISSIONS: PermissionKey[] = [
  PERMISSION_KEYS.payrollRead,
  PERMISSION_KEYS.payrollWrite,
  PERMISSION_KEYS.payrollApprove,
  PERMISSION_KEYS.payrollSettings,
  PERMISSION_KEYS.payrollImport,
  PERMISSION_KEYS.workersRead,
  PERMISSION_KEYS.workersManage,
  PERMISSION_KEYS.workersCompensationRead,
  PERMISSION_KEYS.payrollAggregateRead,
  PERMISSION_KEYS.reportsPayrollRead,
  PERMISSION_KEYS.payrollProjectReferenceRead,
];

const FINANCE_PERMISSIONS: PermissionKey[] = [
  PERMISSION_KEYS.dashboardView,
  PERMISSION_KEYS.cashSummaryRead,
  PERMISSION_KEYS.cashTransactionsRead,
  PERMISSION_KEYS.cashAccountsManage,
  PERMISSION_KEYS.cashTransactionsManage,
  PERMISSION_KEYS.cashImport,
  PERMISSION_KEYS.cashReconcile,
  PERMISSION_KEYS.cashConnectionsManage,
  PERMISSION_KEYS.invoicesRead,
  PERMISSION_KEYS.invoicesWrite,
  PERMISSION_KEYS.invoicesVerify,
  PERMISSION_KEYS.invoicesExtract,
  PERMISSION_KEYS.gmailRead,
  PERMISSION_KEYS.documentSend,
  PERMISSION_KEYS.vendorsRead,
  PERMISSION_KEYS.vendorsManage,
  PERMISSION_KEYS.procurementRead,
  PERMISSION_KEYS.procurementWrite,
  PERMISSION_KEYS.procurementApprove,
  PERMISSION_KEYS.inventoryRead,
  PERMISSION_KEYS.inventoryManage,
  PERMISSION_KEYS.equipmentRead,
  PERMISSION_KEYS.projectsRead,
  PERMISSION_KEYS.projectsWrite,
  PERMISSION_KEYS.expensesRead,
  PERMISSION_KEYS.expensesWrite,
  PERMISSION_KEYS.payrollAggregateRead,
  PERMISSION_KEYS.reportsRead,
  PERMISSION_KEYS.engineeringDocumentsRead,
  PERMISSION_KEYS.engineeringDocumentsCreate,
  PERMISSION_KEYS.engineeringDocumentsUpdate,
  PERMISSION_KEYS.engineeringRfisRead,
  PERMISSION_KEYS.engineeringSubmittalsRead,
  PERMISSION_KEYS.engineeringSiteLogsRead,
];

const VIEWER_PERMISSIONS: PermissionKey[] = [
  PERMISSION_KEYS.dashboardView,
  PERMISSION_KEYS.projectsRead,
  PERMISSION_KEYS.invoicesRead,
  PERMISSION_KEYS.expensesRead,
  PERMISSION_KEYS.vendorsRead,
  PERMISSION_KEYS.payrollAggregateRead,
  PERMISSION_KEYS.reportsRead,
  PERMISSION_KEYS.procurementRead,
  PERMISSION_KEYS.inventoryRead,
  PERMISSION_KEYS.equipmentRead,
  PERMISSION_KEYS.engineeringDocumentsRead,
  PERMISSION_KEYS.engineeringRfisRead,
  PERMISSION_KEYS.engineeringSubmittalsRead,
  PERMISSION_KEYS.engineeringSiteLogsRead,
];

test("the final Payroll permission vocabulary includes a narrow project-reference capability", () => {
  assert.equal(PERMISSION_KEYS.payrollProjectReferenceRead, "payroll.projectreference.read");
});

test("Payroll permissions expose Payroll and its separate payroll Reports view", () => {
  assert.deepEqual(moduleLabels(PAYROLL_PERMISSIONS), ["payroll", "reports"]);
  assert.equal(defaultAppTabForPermissions(PAYROLL_PERMISSIONS), "payroll");
  assert.equal(canAccessAppTab("dashboard", PAYROLL_PERMISSIONS), false);
  assert.equal(canAccessAppTab("projects", PAYROLL_PERMISSIONS), false);
  assert.equal(canAccessAppTab("documents", PAYROLL_PERMISSIONS), false);
});

test("Finance exposes its granted finance and operational work without payroll detail or settings", () => {
  assert.deepEqual(moduleLabels(FINANCE_PERMISSIONS), [
    "dashboard",
    "cash",
    "email-sms",
    "documents",
    "projects",
    "procurement",
    "warehouse",
    "equipment",
    "invoices",
    "expenses",
    "reports",
  ]);
  assert.equal(canAccessAppTab("payroll", FINANCE_PERMISSIONS), false);
  assert.equal(canAccessAppTab("settings", FINANCE_PERMISSIONS), false);
  assert.equal(FINANCE_PERMISSIONS.includes(PERMISSION_KEYS.payrollRead), false);
  assert.equal(FINANCE_PERMISSIONS.includes(PERMISSION_KEYS.workersManage), false);
  assert.equal(FINANCE_PERMISSIONS.includes(PERMISSION_KEYS.companyManage), false);
});

test("Viewer exposes only the read-capable modules in its profile", () => {
  assert.deepEqual(moduleLabels(VIEWER_PERMISSIONS), [
    "dashboard",
    "documents",
    "projects",
    "procurement",
    "warehouse",
    "equipment",
    "invoices",
    "expenses",
    "reports",
  ]);
  assert.equal(canAccessAppTab("cash", VIEWER_PERMISSIONS), false);
  assert.equal(canAccessAppTab("inbox", VIEWER_PERMISSIONS), false);
  assert.equal(canAccessAppTab("payroll", VIEWER_PERMISSIONS), false);
  assert.equal(canAccessAppTab("settings", VIEWER_PERMISSIONS), false);
  assert.equal(VIEWER_PERMISSIONS.includes(PERMISSION_KEYS.projectsWrite), false);
  assert.equal(VIEWER_PERMISSIONS.includes(PERMISSION_KEYS.invoicesWrite), false);
  assert.equal(VIEWER_PERMISSIONS.includes(PERMISSION_KEYS.expensesWrite), false);
});

test("a restricted custom role follows selected permissions rather than a display name", () => {
  assert.deepEqual(moduleLabels([PERMISSION_KEYS.inventoryRead]), ["warehouse"]);
  assert.deepEqual(moduleLabels(["inventory.read"]), ["warehouse"]);
});

test("Company Admin retains the complete permitted workspace and Settings access", () => {
  const model = getNavigationModel({ permissions: ["*"] });
  assert.equal(model.modules.length, 12);
  assert.equal(model.settingsRoute?.id, "settings");
});

test("manual restricted URLs still pass through the permission guard", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /const routeDenied = Boolean/);
  assert.match(appSource, /!canAccessAppTab\(route\.tab, permissions\)/);
  assert.match(appSource, /if \(routeDenied\) return <AccessDenied/);
  assert.match(appSource, /defaultAppTabForPermissions\(permissions\)/);
  assert.doesNotMatch(appSource, /roleKey\s*={1,3}\s*["'`]PAYROLL["'`]/i);
});
