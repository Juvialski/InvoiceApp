import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fs from "node:fs";
import * as XLSX from "xlsx";

XLSX.set_fs(fs);
import { exportEngineeringProjectWorkbookToExcel } from "../src/utils/excelExport.ts";
import { buildPayrollReport, buildProjectCostReport, buildProjectInvoiceReport } from "../src/utils/projectReports.ts";
import type {
  Expense,
  InvoiceData,
  InvoiceProjectAllocation,
  PayrollEntry,
  PayrollPeriod,
  PayrollProjectAllocation,
  PayrollRun,
  Project,
  ProjectWorkerAssignment,
  Worker,
} from "../src/types.ts";

const project = (id: string, currency = "PHP"): Project => ({
  id,
  projectCode: id.toUpperCase(),
  projectName: `Project ${id.toUpperCase()}`,
  clientName: "Engineering Client",
  status: "ACTIVE",
  projectBudget: 100_000,
  currency,
  createdAt: "2026-08-01",
  updatedAt: "2026-08-01",
});

const worker: Worker = {
  id: "worker-1",
  employeeCode: "EMP-001",
  firstName: "Ana",
  lastName: "Santos",
  displayName: "Ana Santos",
  employmentType: "REGULAR",
  jobTitle: "Project Engineer",
  defaultPayType: "MONTHLY",
  defaultRate: 40_000,
  active: true,
  createdAt: "2026-08-01",
  updatedAt: "2026-08-01",
};

const period: PayrollPeriod = {
  id: "period-1",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-15",
  status: "CALCULATED",
  createdAt: "2026-08-01",
  updatedAt: "2026-08-01",
};

const run = (id: string, status: PayrollRun["status"]): PayrollRun => ({
  id,
  periodId: period.id,
  status,
  createdAt: "2026-08-16",
});

const entry = (id: string, payrollRunId: string, projectAllocatedCost: number): PayrollEntry => ({
  id,
  payrollRunId,
  workerId: worker.id,
  basePay: projectAllocatedCost,
  regularPay: projectAllocatedCost,
  overtimePay: 0,
  allowances: 0,
  grossPay: projectAllocatedCost,
  deductions: 0,
  netPay: projectAllocatedCost,
  projectAllocatedCost,
});

const payrollAllocation = (id: string, payrollEntryId: string, projectId: string, allocationAmount: number): PayrollProjectAllocation => ({
  id,
  payrollEntryId,
  projectId,
  allocationAmount,
  source: "MANUAL",
});

const invoice = (overrides: Partial<InvoiceData> = {}): InvoiceData => ({
  id: "invoice-1",
  invoiceNumber: "INV-001",
  invoiceDate: "2026-08-01",
  currency: "PHP",
  status: "PARTIALLY_PAID",
  vendor: { name: "Materials Supplier" },
  customer: { name: "Engineering Client" },
  items: [],
  subtotal: 100_000,
  totalTax: 0,
  grandTotal: 100_000,
  amountPaid: 50_000,
  reviewStatus: "VERIFIED",
  extractedAt: "2026-08-01T00:00:00.000Z",
  modelUsed: "test",
  ...overrides,
});

const invoiceAllocation = (id: string, invoiceId: string, projectId: string, amount: number): InvoiceProjectAllocation => ({
  id,
  invoiceId,
  projectId,
  allocationType: "AMOUNT",
  allocationAmount: amount,
});

const expense = (id: string, projectId: string, amount: number, currency = "PHP"): Expense => ({
  id,
  projectId,
  expenseDate: "2026-08-10",
  category: "Fuel",
  description: "Site fuel",
  amount,
  currency,
  status: "APPROVED",
  createdAt: "2026-08-10",
  updatedAt: "2026-08-10",
});

test("project cost reports confirm only approved/paid labor and keep draft/calculated labor pending", () => {
  const projects = [project("project-a")];
  const runs = [run("run-draft", "DRAFT"), run("run-calculated", "CALCULATED"), run("run-approved", "APPROVED"), run("run-paid", "PAID")];
  const entries = runs.map((item, index) => entry(`entry-${index}`, item.id, 100 + index * 100));
  const allocations = entries.map((item) => payrollAllocation(`allocation-${item.id}`, item.id, "project-a", item.projectAllocatedCost));
  const payroll = runs.map((item) => ({
    id: item.id,
    status: item.status,
    allocations: allocations.filter((allocation) => entries.find((candidate) => candidate.id === allocation.payrollEntryId)?.payrollRunId === item.id),
  }));

  const [summary] = buildProjectCostReport(projects, [], [], payroll, []);

  assert.equal(summary.payrollCost, 700);
  assert.equal(summary.pendingPayrollCost, 300);
  assert.equal(summary.totalActualCost, 700);
});

test("payroll reports expose employee, payroll-period/run status, and project labels", () => {
  const projects = [project("project-a")];
  const approvedRun = run("run-approved", "APPROVED");
  const approvedEntry = entry("entry-approved", approvedRun.id, 1_000);
  const allocation = payrollAllocation("allocation-approved", approvedEntry.id, "project-a", 1_000);

  const [row] = buildPayrollReport(projects, [worker], [period], [approvedRun], [approvedEntry], [allocation]);

  assert.equal(row.worker, "Ana Santos");
  assert.equal(row.period, "2026-08-01 – 2026-08-15");
  assert.equal(row.status, "APPROVED");
  assert.equal(row.project, "Project PROJECT-A");
  assert.equal(row.projectCode, "PROJECT-A");
  assert.equal(row.role, "Project Engineer");
});

test("payroll reports keep unallocated labor visible when allocations do not consume the entry cost", () => {
  const approvedRun = run("run-approved", "APPROVED");
  const payrollEntry = entry("entry-approved", approvedRun.id, 1_000);
  const allocation = payrollAllocation("allocation-approved", payrollEntry.id, "project-a", 600);

  const rows = buildPayrollReport([project("project-a")], [worker], [period], [approvedRun], [payrollEntry], [allocation]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => [row.project, row.allocatedLaborCost]), [["Project PROJECT-A", 600], ["Unallocated labor", 400]]);
  assert.equal(rows[1].status, "APPROVED");
});

test("project invoice reports and cost summaries preserve partial-payment semantics", () => {
  const projects = [project("project-a"), project("project-b")];
  const allocations = [invoiceAllocation("allocation-a", "invoice-1", "project-a", 60_000), invoiceAllocation("allocation-b", "invoice-1", "project-b", 40_000)];
  const rows = buildProjectInvoiceReport(projects, [invoice()], allocations);
  const summaries = buildProjectCostReport(projects, [invoice()], allocations, [], []);

  assert.deepEqual(rows.map((row) => row.allocatedAmount), [60_000, 40_000]);
  assert.equal(summaries[0].paidInvoiceCost, 30_000);
  assert.equal(summaries[0].unpaidInvoiceCost, 30_000);
  assert.equal(summaries[1].paidInvoiceCost, 20_000);
  assert.equal(summaries[1].unpaidInvoiceCost, 20_000);
  assert.equal(summaries[0].paidInvoiceCost + summaries[1].paidInvoiceCost, 50_000);
});

test("project report totals separate foreign invoice, payroll, and expense currencies", () => {
  const [summary] = buildProjectCostReport(
    [project("project-a")],
    [invoice({ currency: "USD", grandTotal: 1_000, amountPaid: 1_000 })],
    [invoiceAllocation("allocation-usd", "invoice-1", "project-a", 1_000)],
    [{ id: "run-paid", status: "PAID", currency: "EUR", allocations: [payrollAllocation("allocation-eur", "entry-paid", "project-a", 2_000)] }],
    [expense("expense-jpy", "project-a", 3_000, "JPY")],
  );

  assert.equal(summary.totalActualCost, 0);
  assert.deepEqual(summary.foreignCosts, { USD: 1_000, EUR: 2_000, JPY: 3_000 });
});

test("engineering workbook construction keeps labeled payroll rows and project totals", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "invoiceapp-engineering-export-"));
  const workbookPath = join(tempDirectory, "engineering.xlsx");
  const approvedRun = run("run-approved", "APPROVED");
  const payrollEntry = entry("entry-approved", approvedRun.id, 1_000);
  const payrollAllocationRow = payrollAllocation("allocation-approved", payrollEntry.id, "project-a", 600);
  const projectWorkerAssignment: ProjectWorkerAssignment = {
    id: "assignment-1",
    workerId: worker.id,
    projectId: "project-a",
    startDate: "2026-08-01",
    active: true,
  };

  try {
    exportEngineeringProjectWorkbookToExcel({
      projects: [project("project-a")],
      invoices: [invoice({ amountPaid: 100_000, status: "PAID" })],
      invoiceAllocations: [invoiceAllocation("invoice-allocation-a", "invoice-1", "project-a", 10_000)],
      expenses: [expense("expense-a", "project-a", 500)],
      workers: [worker],
      assignments: [projectWorkerAssignment],
      periods: [period],
      runs: [approvedRun],
      entries: [payrollEntry],
      payrollAllocations: [payrollAllocationRow],
    }, workbookPath);

    const workbook = XLSX.read(readFileSync(workbookPath));
    assert.deepEqual(workbook.SheetNames, ["Projects", "Invoice Allocations", "Payroll Allocations", "Expenses", "Project Cost Summary", "Workers"]);
    const payrollRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Payroll Allocations"]);
    assert.equal(payrollRows[0].worker, "Ana Santos");
    assert.equal(payrollRows[0].project, "Project PROJECT-A");
    assert.equal(payrollRows[1].project, "Unallocated labor");
    assert.equal(payrollRows[1].allocatedLaborCost, 400);
    const costRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Project Cost Summary"]);
    assert.equal(costRows[0].totalActualCost, 11_100);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
