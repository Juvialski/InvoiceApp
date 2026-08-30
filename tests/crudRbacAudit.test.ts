import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ASSISTANT_OPERATION_TOOL_DEFINITIONS } from "../src/server/assistant/assistantOperations.ts";
import { ASSISTANT_TOOL_DEFINITIONS } from "../src/server/assistant/toolRegistry.ts";
import { hasAllPermissions, PERMISSION_KEYS } from "../src/utils/accessControl.ts";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const appShell = readFileSync(new URL("../src/app/AppShell.tsx", import.meta.url), "utf8");
const invoicesRoute = readFileSync(new URL("../src/app/routes/InvoicesRoute.tsx", import.meta.url), "utf8");
const emailInbox = readFileSync(new URL("../src/components/EmailInbox.tsx", import.meta.url), "utf8");
const cashRoute = readFileSync(new URL("../src/app/routes/CashBankingRoute.tsx", import.meta.url), "utf8");
const cashPage = readFileSync(new URL("../src/components/CashBankingPage.tsx", import.meta.url), "utf8");
const settlementWorkspace = readFileSync(new URL("../src/components/CashSettlementAllocationWorkspace.tsx", import.meta.url), "utf8");
const workersTable = readFileSync(new URL("../src/components/payroll/WorkersTable.tsx", import.meta.url), "utf8");
const payrollPeriods = readFileSync(new URL("../src/components/payroll/PayrollPeriods.tsx", import.meta.url), "utf8");
const payrollRun = readFileSync(new URL("../src/components/payroll/PayrollRunView.tsx", import.meta.url), "utf8");
const attendance = readFileSync(new URL("../src/components/payroll/AttendanceWorkspace.tsx", import.meta.url), "utf8");
const projectWorkspace = readFileSync(new URL("../src/components/projects/ProjectWorkspace.tsx", import.meta.url), "utf8");

test("composite UI permissions require every authority in the mutation bundle", () => {
  assert.equal(hasAllPermissions([PERMISSION_KEYS.invoicesWrite, PERMISSION_KEYS.invoicesVerify], [PERMISSION_KEYS.invoicesWrite, PERMISSION_KEYS.invoicesVerify]), true);
  assert.equal(hasAllPermissions([PERMISSION_KEYS.invoicesWrite], [PERMISSION_KEYS.invoicesWrite, PERMISSION_KEYS.invoicesVerify]), false);
  assert.equal(hasAllPermissions(["*"], [PERMISSION_KEYS.invoicesWrite, PERMISSION_KEYS.invoicesVerify]), true);
  assert.equal(hasAllPermissions(undefined, [PERMISSION_KEYS.invoicesWrite]), false);
});

test("workspace refresh preserves cached presentation state during background work", () => {
  assert.match(appShell, /workspacePresentationState/);
  assert.match(appShell, /const workspaceDataPending = workspacePresentation\.blocking/);
  assert.doesNotMatch(appShell, /workspaceSyncStatus\s*===\s*"(?:connecting|syncing)"/);
  assert.match(app, /const hasUsableCachedData = workspaceLoadCacheRef\.current\.get\(cacheKey\)\?\.hasData === true/);
  assert.match(app, /preserveExisting: hasUsableCachedData/);
  assert.match(app, /if \(canApplyWorkspaceResult\(token\) && !hasUsableCachedData\)/);
});

test("cross-domain UI actions are gated by their complete effective permission contract", () => {
  assert.match(invoicesRoute, /const canVerifyInvoices = hasAllPermissions\(permissions, \[PERMISSION_KEYS\.invoicesWrite, PERMISSION_KEYS\.invoicesVerify\]\)/);
  assert.match(invoicesRoute, /const canExtractInvoices = hasAllPermissions\(permissions, \[PERMISSION_KEYS\.invoicesWrite, PERMISSION_KEYS\.invoicesExtract, PERMISSION_KEYS\.invoicesVerify\]\)/);
  assert.match(invoicesRoute, /canProcessInvoices=\{canExtractInvoices\}/);
  assert.match(emailInbox, /if \(!canProcessInvoices\)/);
  assert.match(emailInbox, /Requires invoice permission/);
  assert.match(invoicesRoute, /const canManageProjectAllocations = hasAllPermissions\(permissions, \[PERMISSION_KEYS\.invoicesWrite, PERMISSION_KEYS\.projectsWrite\]\)/);
  assert.match(projectWorkspace, /const canManageInvoiceAllocations = canManageProject && hasPermission\(permissions, PERMISSION_KEYS\.invoicesWrite\)/);
  assert.match(projectWorkspace, /const canExtractInvoices = hasAllPermissions\(permissions, \[PERMISSION_KEYS\.invoicesWrite, PERMISSION_KEYS\.invoicesExtract, PERMISSION_KEYS\.invoicesVerify\]\)/);
  assert.match(cashRoute, /canSettleTarget=\{props\.canSettleTarget\}/);
  assert.match(cashPage, /!canReconcile \|\| !canSettleTarget\(suggestion\.candidate\.targetType\)/);
  assert.match(settlementWorkspace, /selectedDrafts\.some\(\(row\) => !canSettle\(row\.candidate\.targetType\)\)/);
  assert.match(workersTable, /canManageWorkforce && <button type="button" onClick=\{\(\) => setEditing\(worker\)\}/);
  assert.match(payrollPeriods, /canManage\?: boolean/);
  assert.match(payrollPeriods, /canManage && <button onClick=\{\(\) => setEditing\(createLocalPeriod/);
  assert.match(payrollRun, /const canApprovePayroll = hasPermission\(permissions, PERMISSION_KEYS\.payrollApprove\)/);
  assert.match(payrollRun, /canApprovePayroll &&/);
  assert.match(attendance, /const onSaveLeave = canManagePayrollSources \? suppliedOnSaveLeave : undefined/);
});

test("Assistant mutation definitions match the same source-domain authority bundles", () => {
  const attachedInvoice = ASSISTANT_TOOL_DEFINITIONS.find((definition) => definition.name === "prepare_process_attached_invoice");
  assert.deepEqual(attachedInvoice?.permissions, ["invoices.extract", "invoices.read", "invoices.manage", "invoices.verify"]);

  const reopenInvoice = ASSISTANT_OPERATION_TOOL_DEFINITIONS.find((definition) => definition.name === "prepare_reopen_invoice_review");
  assert.deepEqual(reopenInvoice?.permissions, ["invoices.read", "invoices.manage", "invoices.verify"]);
});
