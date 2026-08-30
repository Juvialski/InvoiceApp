import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { invoiceCashPayableBasis, deriveInvoiceSettlementSummary, deriveExpenseSettlementSummary } from "../src/lib/financialSettlement.ts";
import { validatePayrollRunApproval } from "../src/lib/payroll.ts";
import { buildProjectDashboardViewData } from "../src/utils/projectDashboardViewModel.ts";
import { buildPayrollReport, buildPayrollReportWithContext } from "../src/utils/projectReports.ts";
import type { Expense, InvoiceData, PayrollEntry, PayrollPeriod, PayrollProjectAllocation, PayrollRun, Project } from "../src/types.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260830111312_wave5_financial_integrity.sql", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../src/lib/persistence.ts", import.meta.url), "utf8");
const projects = readFileSync(new URL("../src/lib/projects.ts", import.meta.url), "utf8");
const expenses = readFileSync(new URL("../src/lib/expenses.ts", import.meta.url), "utf8");
const assistant = readFileSync(new URL("../src/server/assistant/assistantToolExecutors.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/utils/projectDashboardViewModel.ts", import.meta.url), "utf8");
const reports = readFileSync(new URL("../src/utils/projectReports.ts", import.meta.url), "utf8");

const project: Project = { id: "project-a", projectCode: "A", projectName: "Project A", status: "ACTIVE", projectBudget: 10_000, currency: "PHP", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
const period: PayrollPeriod = { id: "period-a", periodStart: "2026-08-01", periodEnd: "2026-08-15", status: "OPEN", createdAt: "2026-08-01", updatedAt: "2026-08-01" };
const run = (status: PayrollRun["status"]): PayrollRun => ({ id: `run-${status}`, periodId: period.id, status, createdAt: "2026-08-15" });
const entry = (runId: string, patch: Partial<PayrollEntry> = {}): PayrollEntry => ({ id: `entry-${runId}`, payrollRunId: runId, workerId: "worker-a", basePay: 100, regularPay: 100, overtimePay: 0, allowances: 0, grossPay: 100, deductions: 0, netPay: 100, projectAllocatedCost: 100, calculationSnapshot: { source: "test" }, ...patch });
const allocation = (entryId: string, amount: number): PayrollProjectAllocation => ({ id: `allocation-${entryId}`, payrollEntryId: entryId, projectId: project.id, allocationAmount: amount, source: "MANUAL" });

test("malformed invoice net-payable evidence cannot enlarge the cash obligation", () => {
  assert.deepEqual(invoiceCashPayableBasis({ grandTotal: 100, netAmountPayable: 120, withholdingTaxAmount: 0, philippineTaxDetails: undefined }), { amount: 100, source: "GROSS_DOCUMENT_AMOUNT" });
  assert.deepEqual(invoiceCashPayableBasis({ grandTotal: 100, netAmountPayable: undefined, withholdingTaxAmount: 10, philippineTaxDetails: { netAmountPayable: 120, withholdingTaxAmount: 10 } }), { amount: 100, source: "GROSS_DOCUMENT_AMOUNT" });
  assert.deepEqual(invoiceCashPayableBasis({ grandTotal: 100, netAmountPayable: 90, withholdingTaxAmount: 10, philippineTaxDetails: undefined }), { amount: 90, source: "EXPLICIT_NET_PAYABLE" });
});

test("void settlement targets retain history but expose a non-active settlement state", () => {
  const invoice = { id: "invoice-void", currency: "PHP", grandTotal: 100, netAmountPayable: undefined, withholdingTaxAmount: undefined, philippineTaxDetails: undefined, amountPaid: 100, dueDate: "2026-08-01", reviewStatus: "VERIFIED", lifecycleStatus: "VOID" } as InvoiceData;
  const expense: Expense = { id: "expense-void", expenseDate: "2026-08-01", category: "Fuel", description: "Fuel", amount: 100, currency: "PHP", status: "VOID", createdAt: "2026-08-01", updatedAt: "2026-08-01" };
  assert.equal(deriveInvoiceSettlementSummary(invoice, []).settlementState, "VOID");
  assert.equal(deriveExpenseSettlementSummary(expense, []).settlementState, "VOID");
});

test("approval validation rejects project labor or net pay above gross pay", () => {
  const invalid = validatePayrollRunApproval({ id: "run", status: "CALCULATED" }, [
    entry("run", { projectAllocatedCost: 101 }),
    entry("run-2", { id: "entry-run-2", payrollRunId: "run", netPay: 101 }),
  ]);
  assert.equal(invalid.valid, false);
  assert.match(invalid.issues.join(" "), /project labor.*gross pay/i);
  assert.match(invalid.issues.join(" "), /net pay.*gross pay/i);
});

test("void payroll runs cannot become pending project cost in the project workspace", () => {
  const voidRun = run("VOID");
  const voidEntry = entry(voidRun.id);
  const data = buildProjectDashboardViewData({
    project,
    invoices: [],
    expenses: [],
    payroll: [{ ...voidRun, periodEnd: period.periodEnd, entries: [voidEntry], allocations: [allocation(voidEntry.id, 100)] }],
    periods: [period],
    today: "2026-08-20",
  });
  assert.equal(data.confirmed, 0);
  assert.equal(data.pending, 0);
  assert.equal(data.trend.every((point) => point.payroll === 0), true);
});

test("payroll reports omit void-run allocations while preserving the run-level history contract", () => {
  const voidRun = run("VOID");
  const voidEntry = entry(voidRun.id);
  assert.deepEqual(buildPayrollReport([project], [], [period], [voidRun], [voidEntry], [allocation(voidEntry.id, 100)]), []);
  assert.deepEqual(buildPayrollReportWithContext([project], [], [period], [voidRun], [voidEntry], [allocation(voidEntry.id, 100)]), []);
});

test("Wave 5 migration closes finalization, stale-replacement, currency, and period-status bypasses", () => {
  assert.match(migration, /private\.has_company_permission\(v_company_id, 'payroll\.approve'\)/);
  assert.match(migration, /payroll_runs_company_update[\s\S]*payroll\.approve/);
  assert.match(migration, /Payroll period APPROVED\/PAID is supporting metadata only/);
  assert.match(migration, /payroll_entries_financial_integrity/);
  assert.match(migration, /project_allocated_cost > pe\.gross_pay \+ 0\.01/);
  assert.match(migration, /p_expected_source_revision/);
  assert.match(migration, /v_current_revision <> p_expected_source_revision/);
  assert.match(migration, /app\.payroll_source_revision_internal/);
  assert.match(migration, /create or replace function private\.guard_company_payroll_currency_change\(\)[\s\S]*security definer/);
  assert.match(migration, /companies_payroll_currency_guard/);
  assert.match(migration, /Invoice freshness is required for allocation replacement/);
  assert.match(migration, /revoke all on function public\.replace_payroll_run_entries\(uuid, jsonb, jsonb\) from public, anon, authenticated/);
});

test("application persistence uses database freshness tokens for invoice, allocation, and expense writes", () => {
  assert.match(persistence, /eq\("updated_at", expectedUpdatedAt\)/);
  assert.match(persistence, /This invoice changed in another session/);
  assert.match(projects, /p_expected_updated_at: expectedInvoiceUpdatedAt/);
  assert.match(projects, /Invoice freshness is unavailable/);
  assert.match(expenses, /eq\("updated_at", expense\.updatedAt\)/);
  assert.match(expenses, /This expense changed in another session/);
});

test("Assistant and reporting surfaces use canonical allocation and lifecycle semantics", () => {
  assert.match(assistant, /normalizedInvoiceAllocationAmount/);
  assert.match(assistant, /allocation_type,allocation_percentage,allocation_amount/);
  assert.match(assistant, /p_expected_updated_at: expectedUpdatedAt/);
  assert.match(assistant, /eq\("updated_at", String\(invoice\.updated_at/);
  assert.match(dashboard, /if \(run\.status === "VOID"\) continue/);
  assert.match(reports, /run\.status === "VOID"\) return \[\]/);
});
