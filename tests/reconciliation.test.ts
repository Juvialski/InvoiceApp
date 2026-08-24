import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";
import type { Expense, InvoiceData, InvoiceProjectAllocation, PayrollEntry, PayrollProjectAllocation, PayrollPeriod, PayrollRun, Project } from "../src/types.ts";
import { exportEngineeringProjectWorkbookToExcel } from "../src/utils/excelExport.ts";
import { buildProjectCostReport } from "../src/utils/projectReports.ts";
import { buildProjectDashboardViewData } from "../src/utils/projectDashboardViewModel.ts";
import { calculateProjectCost, type CostPayrollRecord } from "../src/utils/projectCosting.ts";

const project = (id: string, currency = "PHP"): Project => ({ id, projectCode: id.toUpperCase(), projectName: `Project ${id}`, status: "ACTIVE", projectBudget: 5_000, currency, createdAt: "2026-01-01", updatedAt: "2026-01-01" });
const allocation = (id: string, invoiceId: string, projectId: string, amount: number): InvoiceProjectAllocation => ({ id, invoiceId, projectId, allocationType: "AMOUNT", allocationAmount: amount });
const invoice = (id: string, amount: number, status: InvoiceData["reviewStatus"], invoiceDate: string, invoiceAllocations: InvoiceProjectAllocation[], currency = "PHP"): InvoiceData => ({ id, invoiceNumber: id, invoiceDate, dueDate: invoiceDate, currency, status: "PARTIALLY_PAID", amountPaid: amount === 1_000 ? 600 : 0, vendor: { name: "Supplier" }, customer: { name: "Client" }, items: [], subtotal: 1_000, totalTax: 0, grandTotal: 1_000, reviewStatus: status, extractedAt: `${invoiceDate}T00:00:00.000Z`, modelUsed: "test", allocations: invoiceAllocations } as InvoiceData & { allocations: InvoiceProjectAllocation[] });
const expense = (id: string, projectId: string | undefined, amount: number, status: Expense["status"]): Expense => ({ id, projectId, expenseDate: "2026-08-10", category: "Fuel", description: "Site fuel", amount, currency: "PHP", status, createdAt: "2026-08-10", updatedAt: "2026-08-10" });
const period: PayrollPeriod = { id: "period", periodStart: "2026-08-01", periodEnd: "2026-08-15", status: "CALCULATED", createdAt: "2026-08-15", updatedAt: "2026-08-15" };
const run = (id: string, status: PayrollRun["status"]): PayrollRun => ({ id, periodId: period.id, status, createdAt: "2026-08-15" });
const entry = (id: string, runId: string, cost: number, context?: PayrollEntry["costContext"]): PayrollEntry => ({ id, payrollRunId: runId, workerId: "worker", basePay: cost, regularPay: cost, overtimePay: 0, allowances: 0, grossPay: cost, deductions: 0, netPay: cost, projectAllocatedCost: cost, costContext: context });
const payrollAllocation = (id: string, entryId: string, amount: number): PayrollProjectAllocation => ({ id, payrollEntryId: entryId, projectId: "project-a", allocationAmount: amount, source: "MANUAL" });

test("project dashboard, project report, company row, and Excel summary share confirmed totals", () => {
  const projects = [project("project-a"), project("project-b", "USD")];
  const invoiceRows = [invoice("invoice-a", 1_000, "VERIFIED", "2026-08-01", [allocation("ia", "invoice-a", "project-a", 700)]), invoice("invoice-pending", 0, "NEEDS_REVIEW", "2026-08-05", [allocation("ip", "invoice-pending", "project-a", 100)]), invoice("invoice-usd", 0, "VERIFIED", "2026-08-03", [allocation("iu", "invoice-usd", "project-b", 1_000)], "USD")];
  const approved = run("approved", "APPROVED");
  const draft = run("draft", "DRAFT");
  const overhead = run("overhead", "APPROVED");
  const entries = [entry("approved-entry", approved.id, 200), entry("draft-entry", draft.id, 50), entry("overhead-entry", overhead.id, 300, { type: "GENERAL_OVERHEAD", needsReview: false })];
  const payrollAllocations = [payrollAllocation("pa", "approved-entry", 200), payrollAllocation("pd", "draft-entry", 50)];
  const payroll: CostPayrollRecord[] = [approved, draft, overhead].map((runRow) => ({ ...runRow, periodEnd: period.periodEnd, entries: entries.filter((item) => item.payrollRunId === runRow.id), allocations: payrollAllocations.filter((item) => entries.find((entryRow) => entryRow.id === item.payrollEntryId)?.payrollRunId === runRow.id) }));
  const expenses = [expense("approved-expense", "project-a", 100, "APPROVED"), expense("draft-expense", "project-a", 50, "DRAFT"), expense("unallocated-expense", undefined, 25, "APPROVED")];
  const projectInput = { invoices: invoiceRows.map((item) => ({ ...item, allocations: (item as InvoiceData & { allocations?: InvoiceProjectAllocation[] }).allocations || [] })), expenses, payroll };
  const summary = calculateProjectCost(projects[0], projectInput);
  const dashboard = buildProjectDashboardViewData({ project: projects[0], invoices: projectInput.invoices, expenses, payroll, periods: [period], today: "2026-08-20" });
  const report = buildProjectCostReport(projects, invoiceRows, [...invoiceRows.flatMap((item) => (item as InvoiceData & { allocations?: InvoiceProjectAllocation[] }).allocations || [])], payroll, expenses).find((row) => row.projectId === "project-a");
  assert.equal(summary.totalActualCost, 1_000);
  assert.equal(dashboard.confirmed, summary.totalActualCost);
  assert.equal(report?.totalActualCost, summary.totalActualCost);
  assert.equal(summary.pendingInvoiceCost + summary.pendingPayrollCost + summary.pendingExpenseCost, 200);
  assert.equal(summary.unpaidInvoiceCost, 280);
  assert.equal(summary.unallocatedInvoiceCost, 0);

  const tempDirectory = mkdtempSync(join(tmpdir(), "invoiceapp-reconciliation-"));
  const workbookPath = join(tempDirectory, "engineering.xlsx");
  try {
    exportEngineeringProjectWorkbookToExcel({ projects, invoices: invoiceRows, invoiceAllocations: invoiceRows.flatMap((item) => (item as InvoiceData & { allocations?: InvoiceProjectAllocation[] }).allocations || []), expenses, workers: [], assignments: [], periods: [period], runs: [approved, draft, overhead], entries, payrollAllocations }, workbookPath);
    const workbook = XLSX.read(readFileSync(workbookPath));
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Project Cost Summary"]);
    const exported = rows.find((row) => row.projectId === "project-a");
    assert.equal(exported?.totalActualCost, summary.totalActualCost);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
