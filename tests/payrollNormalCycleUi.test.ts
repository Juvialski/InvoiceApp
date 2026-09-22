import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const page = source("src/components/payroll/PayrollPageV2.tsx");
const run = source("src/components/payroll/PayrollRunView.tsx");
const periods = source("src/components/payroll/PayrollPeriods.tsx");
const app = source("src/App.tsx");
const route = source("src/app/routes/PayrollRoute.tsx");
const settlement = source("src/components/FinancialSettlementCard.tsx");

test("Payroll overview hands calculation to the Run review surface", () => {
  assert.doesNotMatch(page, /onClick=\{\(\) => selectedRun && onCalculateRun\?\.\(selectedRun\)\}/);
  assert.match(page, /Review payroll/);
  assert.match(page, /nextStep|What needs doing/);
});

test("Payroll calculation is awaited, retryable, and guarded against duplicate clicks", () => {
  assert.match(run, /onCalculateRun\?:[^\n]*Promise<PayrollRun/);
  assert.match(run, /calculatingRunId/);
  assert.match(run, /await onCalculateRun\(run\)/);
  assert.match(run, /Payroll calculation completed/);
  assert.match(run, /disabled=\{calculating/);
  const awaitIndex = run.indexOf("await onCalculateRun(run)");
  const successIndex = run.indexOf("Payroll calculation completed", awaitIndex);
  assert.ok(awaitIndex >= 0 && successIndex > awaitIndex, "calculation success copy must follow callback resolution");
});

test("Payroll approval is an explicit confirmation and remains async", () => {
  assert.match(run, /setApprovalOpen/);
  assert.match(run, /Review approval/);
  assert.match(run, /await onUpdateRun/);
  assert.match(run, /Payroll approved/);
  assert.match(run, /event\.key === "Escape"/);
  assert.match(run, /autoFocus/);
  assert.doesNotMatch(run, /onClick=\{\(\) => onUpdateRun\?\.\(\{ \.\.\.run, status: "APPROVED"/);
  assert.match(run, /record employee net-pay disbursement through Cash &amp; Banking|record payment through Cash &amp; Banking|Record payment in Cash &amp; Banking/);
});

test("Payroll approval surfaces stale calculated sources before confirmation", () => {
  assert.match(page, /validatePayrollRunSourceRevision/);
  assert.match(page, /Recalculate because sources changed/);
  assert.match(run, /recalculation required|Recalculation required/i);
});

test("Payroll period editing cannot finalize or void run history", () => {
  assert.match(periods, /getPayrollPeriodDisplayState/);
  assert.match(periods, /derived from the payroll run|run history/i);
  assert.doesNotMatch(periods, /<select value=\{editing\.status\}/);
  assert.doesNotMatch(periods, /\["DRAFT", "OPEN", "CALCULATED", "APPROVED", "PAID", "VOID"\]/);
});

test("App payroll mutations return authoritative results instead of fire-and-forget wrappers", () => {
  assert.match(app, /const handleCalculatePayrollRun = async \(run: PayrollRun\): Promise<PayrollRun>/);
  assert.match(app, /const handleUpdatePayrollRun = async \(run: PayrollRun\): Promise<PayrollRun>/);
  assert.match(app, /const handleSavePayrollPeriod = async \(period: PayrollPeriod\): Promise<PayrollPeriod>/);
  assert.match(app, /onCalculatePayrollRun=\{handleCalculatePayrollRun\}/);
  assert.match(app, /onUpdatePayrollRun=\{handleUpdatePayrollRun\}/);
  assert.doesNotMatch(app, /onCalculatePayrollRun=\{\(run\) => void handleCalculatePayrollRun\(run\)\}/);
});

test("Approved Payroll points to the existing Cash & Banking settlement authority", () => {
  assert.match(run, /appPathForCashTarget/);
  assert.match(run, /recordPaymentPath/);
  assert.match(settlement, /Expected employee net pay/);
  assert.match(route, /onNavigatePath=\{props\.onNavigatePath\}/);
  assert.doesNotMatch(run, /Mark paid manually/);
});
