import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const attendance = readFileSync(new URL("../src/components/payroll/AttendanceWorkspace.tsx", import.meta.url), "utf8");
const advancedPayroll = readFileSync(new URL("../src/components/payroll/PayrollAdvancedTools.tsx", import.meta.url), "utf8");
const expenseForm = readFileSync(new URL("../src/components/expenses/ExpenseForm.tsx", import.meta.url), "utf8");
const expensesPage = readFileSync(new URL("../src/components/expenses/ExpensesPage.tsx", import.meta.url), "utf8");
const accessManagement = readFileSync(new URL("../src/components/access/DeploymentAccessManagement.tsx", import.meta.url), "utf8");

test("attendance controls expose names and stay read-only for locked payroll periods", () => {
  assert.match(attendance, /function dateInPeriod\(date: string, period\?: PayrollPeriod\)/);
  assert.match(attendance, /if \(!canManagePayrollSources \|\| selectedPeriodLocked\)/);
  assert.match(attendance, /disabled=\{!periodDatesValid \|\| selectedPeriodLocked \|\| !workers\.length \|\| !canManagePayrollSources\}/);
  assert.match(attendance, /aria-label=\{`\$\{workerLabel\} attendance status`\}/);
  assert.match(attendance, /role=\{message\.tone === "error" \? "alert" : "status"\}/);
});

test("payroll maintenance keeps factory reset independent from unrelated apply handlers and reports busy state", () => {
  assert.match(advancedPayroll, /if \(busy \|\| !toolMode\) return;/);
  assert.match(advancedPayroll, /if \(!onApply\) return;/);
  assert.match(advancedPayroll, /disabled=\{busy \|\| previewLoading\}/);
  assert.match(advancedPayroll, /aria-busy=\{previewLoading \|\| busy\}/);
  assert.match(advancedPayroll, /max-h-\[calc\(100vh-2rem\)\].*overflow-y-auto/);
});

test("expense form gives invalid values visible feedback and accessible field state", () => {
  assert.match(expenseForm, /noValidate onSubmit=\{submit\}/);
  assert.match(expenseForm, /id="expense-form-error" role="alert"/);
  assert.match(expenseForm, /aria-invalid=\{validationError\?\.includes\("amount"\) \|\| undefined\}/);
  assert.match(expenseForm, /Enter a three-letter currency code such as PHP\./);
  assert.match(expenseForm, /aria-label="Expense currency code"/);
});

test("expense correction actions remain identifiable and mobile-sized", () => {
  assert.match(expensesPage, /aria-label=\{`Review correction options for \$\{expense\.description\}`\}/);
  assert.match(expensesPage, /max-h-\[calc\(100vh-2rem\)\].*overflow-y-auto/);
});

test("company access destructive actions confirm and expose busy/access relationships", () => {
  assert.match(accessManagement, /window\.confirm\(`\$\{action\} \$\{member\.displayName/);
  assert.match(accessManagement, /window\.confirm\(`Revoke pending access authorization for \$\{invitation\.email\}/);
  assert.ok(accessManagement.includes("aria-label={`Role for ${member.displayName || member.email || \"member\"}`}"));
  assert.ok(accessManagement.includes("aria-controls={editorOpen ? `permission-editor-${member.id}` : undefined}"));
  assert.ok(accessManagement.includes("id={`permission-editor-${member.id}`}"));
  assert.match(accessManagement, /aria-busy=\{loading \|\| Boolean\(busy\)\}/);
});
