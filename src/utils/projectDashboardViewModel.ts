import type { Expense, InvoiceProjectAllocation, PayrollPeriod, Project } from "../types.ts";
import type { CostInvoice, CostPayrollRecord } from "./projectCosting.ts";
import { calculateProjectCost, isVoidedInvoice, normalizedInvoiceAllocationAmount, projectHealth } from "./projectCosting.ts";
import { unpaidBalance } from "./dashboardStats.ts";
import type { ProjectLaborCostAggregate, ProjectLaborSource } from "./projectLaborCostAggregate.ts";

export interface ProjectDashboardTrendPoint {
  label: string;
  period: string;
  invoices: number;
  payroll: number;
  expenses: number;
  total: number;
  cumulative: number;
  cumulativeCommitted: number;
}

export interface ProjectDashboardAttention {
  id: string;
  label: string;
  detail: string;
  tab: "overview" | "invoices" | "payroll" | "expenses" | "reports";
}

export interface ProjectDashboardViewData {
  budget: number;
  confirmed: number;
  pending: number;
  availableAfterCommitments: number;
  remaining: number;
  excess: number;
  confirmedUtilization: number;
  commitmentUtilization: number;
  health: ReturnType<typeof projectHealth>;
  outstandingPayables: number;
  composition: { invoices: number; payroll: number; expenses: number };
  trend: ProjectDashboardTrendPoint[];
  attention: ProjectDashboardAttention[];
}

interface ProjectDashboardInput {
  project: Project;
  invoices: CostInvoice[];
  expenses: Expense[];
  payroll: Array<CostPayrollRecord & { periodEnd?: string }>;
  projectLaborAggregates?: readonly ProjectLaborCostAggregate[];
  laborSource?: ProjectLaborSource;
  periods?: PayrollPeriod[];
  today?: string;
}

function round(value: number) { return Math.round((Number(value) || 0) * 100) / 100; }
function dateOnly(value?: string) { return typeof value === "string" ? value.slice(0, 10) : ""; }
function monthKey(value: string) { return dateOnly(value).slice(0, 7); }
function monthLabel(key: string) { const [year, month] = key.split("-").map(Number); return Number.isFinite(year) && Number.isFinite(month) ? new Intl.DateTimeFormat("en-PH", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1))) : key; }
function addMonth(key: string) { const [year, month] = key.split("-").map(Number); return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`; }
function monthsBetween(keys: string[]) { const valid = keys.filter((key) => /^\d{4}-\d{2}$/.test(key)).sort(); if (!valid.length) return []; const result: string[] = []; for (let key = valid[0]!; key <= valid.at(-1)!; key = addMonth(key)) result.push(key); return result; }

function projectInvoiceAmount(invoice: CostInvoice, projectId: string) { return isVoidedInvoice(invoice) ? 0 : round((invoice.allocations || []).filter((allocation) => allocation.projectId === projectId).reduce((sum, allocation) => sum + normalizedInvoiceAllocationAmount(invoice.grandTotal, allocation), 0)); }

export function buildProjectDashboardViewData(input: ProjectDashboardInput): ProjectDashboardViewData {
  const summary = calculateProjectCost(input.project, {
    invoices: input.invoices,
    expenses: input.expenses,
    payroll: input.payroll,
    projectLaborAggregates: input.projectLaborAggregates,
    laborSource: input.laborSource,
  });
  const pending = round(summary.pendingInvoiceCost + summary.pendingPayrollCost + summary.pendingExpenseCost);
  const confirmed = round(summary.totalActualCost);
  const availableAfterCommitments = round(summary.budget - confirmed - pending);
  const invoiceDates = input.invoices.filter((invoice) => projectInvoiceAmount(invoice, input.project.id) > 0).map((invoice) => dateOnly((invoice as CostInvoice & { invoiceDate?: string }).invoiceDate));
  const payrollDates = input.payroll.filter((run) => (run.allocations || []).some((allocation) => allocation.projectId === input.project.id)).map((run) => dateOnly(run.periodEnd));
  const expenseDates = input.expenses.filter((expense) => expense.projectId === input.project.id).map((expense) => dateOnly(expense.expenseDate));
  const keys = monthsBetween([...invoiceDates, ...payrollDates, ...expenseDates, dateOnly(input.project.startDate), dateOnly(input.today || new Date().toISOString())].map(monthKey));
  const points = new Map(keys.map((period) => [period, { label: monthLabel(period), period, invoices: 0, payroll: 0, expenses: 0, total: 0, pending: 0, cumulative: 0, cumulativeCommitted: 0 }]));
  for (const invoice of input.invoices) {
    if (isVoidedInvoice(invoice)) continue;
    const amount = projectInvoiceAmount(invoice, input.project.id); const date = dateOnly((invoice as CostInvoice & { invoiceDate?: string }).invoiceDate); const point = points.get(monthKey(date));
    if (point && invoice.reviewStatus === "VERIFIED") point.invoices = round(point.invoices + amount);
    else if (point) point.pending = round(point.pending + amount);
  }
  for (const run of input.payroll) {
    if (run.status === "VOID") continue;
    if (run.status !== "APPROVED" && run.status !== "PAID") {
      const point = points.get(monthKey(dateOnly(run.periodEnd)));
      if (point) point.pending = round(point.pending + (run.allocations || []).filter((allocation) => allocation.projectId === input.project.id).reduce((sum, allocation) => sum + allocation.allocationAmount, 0));
      continue;
    }
    const point = points.get(monthKey(dateOnly(run.periodEnd))); if (!point) continue;
    point.payroll = round(point.payroll + (run.allocations || []).filter((allocation) => allocation.projectId === input.project.id).reduce((sum, allocation) => sum + allocation.allocationAmount, 0));
  }
  for (const expense of input.expenses) {
    if (expense.projectId !== input.project.id) continue;
    if (expense.status === "VOID") continue;
    if (expense.status === "DRAFT") { const point = points.get(monthKey(expense.expenseDate)); if (point) point.pending = round(point.pending + expense.amount); continue; }
    if (expense.status !== "APPROVED" && expense.status !== "PAID") continue;
    const point = points.get(monthKey(expense.expenseDate)); if (point) point.expenses = round(point.expenses + expense.amount);
  }
  let cumulative = 0;
  let cumulativePending = 0;
  const trend = [...points.values()].map((point) => {
    point.total = round(point.invoices + point.payroll + point.expenses);
    cumulative = round(cumulative + point.total);
    cumulativePending = round(cumulativePending + point.pending);
    return { ...point, cumulative, cumulativeCommitted: round(cumulative + cumulativePending) };
  });
  const attention: ProjectDashboardAttention[] = [];
  const projectInvoices = input.invoices.filter((invoice) => projectInvoiceAmount(invoice, input.project.id) > 0);
  const review = projectInvoices.filter((invoice) => invoice.reviewStatus !== "VERIFIED").length;
  const overdue = projectInvoices.filter((invoice) => { const dueDate = (invoice as CostInvoice & { dueDate?: string }).dueDate; return Boolean(dueDate && dueDate < (input.today || new Date().toISOString().slice(0, 10)) && unpaidBalance(invoice) > 0); }).length;
  const pendingPayroll = input.payroll.filter((run) => run.status === "DRAFT" || run.status === "CALCULATED").some((run) => (run.allocations || []).some((allocation) => allocation.projectId === input.project.id));
  const pendingExpenses = input.expenses.some((expense) => expense.projectId === input.project.id && expense.status === "DRAFT");
  if (review) attention.push({ id: "project-invoice-review", label: "Invoices awaiting review", detail: `${review} allocated supplier invoice${review === 1 ? "" : "s"} is not verified.`, tab: "invoices" });
  if (overdue) attention.push({ id: "project-overdue", label: "Overdue supplier invoices", detail: `${overdue} allocated supplier invoice${overdue === 1 ? "" : "s"} has an unpaid balance.`, tab: "invoices" });
  if (pendingPayroll) attention.push({ id: "project-pending-payroll", label: "Pending project payroll", detail: "Draft or calculated project labor is not yet confirmed.", tab: "payroll" });
  if (pendingExpenses) attention.push({ id: "project-pending-expenses", label: "Pending project expenses", detail: "Draft direct expenses remain pending exposure until approved or paid.", tab: "expenses" });
  if (availableAfterCommitments < 0) attention.push({ id: "project-budget-pressure", label: "Actual plus pending exposure exceeds budget", detail: "Actual cost plus pending exposure is above the project budget.", tab: "overview" });
  return { budget: summary.budget, confirmed, pending, availableAfterCommitments, remaining: Math.max(0, round(summary.budget - confirmed)), excess: Math.max(0, round(confirmed + pending - summary.budget)), confirmedUtilization: summary.budget > 0 ? round(confirmed / summary.budget * 100) : 0, commitmentUtilization: summary.budget > 0 ? round((confirmed + pending) / summary.budget * 100) : 0, health: projectHealth(summary), outstandingPayables: summary.unpaidInvoiceCost, composition: { invoices: summary.invoiceCost, payroll: summary.payrollCost, expenses: summary.otherExpenseCost }, trend, attention };
}
