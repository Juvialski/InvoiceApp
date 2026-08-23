import { Expense, InvoiceData, InvoiceProjectAllocation, PayrollProjectAllocation, Project, ProjectCostSummary, PayrollEntry, PayrollPeriod, PayrollRun, Worker } from "../types";
import { calculateProjectCost, CostPayrollRecord, normalizedInvoiceAllocationAmount } from "./projectCosting";

export interface ProjectCostReportRow extends ProjectCostSummary { projectCode: string; projectName: string; currency: string; }

export function buildProjectCostReport(projects: Project[], invoices: InvoiceData[], invoiceAllocations: InvoiceProjectAllocation[], payroll: CostPayrollRecord[], expenses: Expense[]): ProjectCostReportRow[] {
  return projects.map((project) => ({ projectCode: project.projectCode, projectName: project.projectName, currency: project.currency, ...calculateProjectCost(project, { invoices: invoices.map((invoice) => ({ ...invoice, allocations: invoiceAllocations.filter((allocation) => allocation.invoiceId === invoice.id) })), payroll, expenses }) }));
}

export function buildProjectInvoiceReport(projects: Project[], invoices: InvoiceData[], allocations: InvoiceProjectAllocation[]) {
  return invoices.flatMap((invoice) => allocations.filter((allocation) => allocation.invoiceId === invoice.id).map((allocation) => {
    const project = projects.find((item) => item.id === allocation.projectId);
    return { project: project?.projectName || "Unknown project", projectCode: project?.projectCode || "", vendor: invoice.vendor?.name || invoice.vendor?.registeredName || "Unknown vendor", invoiceNumber: invoice.invoiceNumber || "", invoiceDate: invoice.invoiceDate || "", invoiceTotal: invoice.grandTotal, allocatedAmount: normalizedInvoiceAllocationAmount(invoice.grandTotal, allocation), currency: invoice.currency || "", paymentStatus: invoice.status || "UNPAID", reviewStatus: invoice.reviewStatus || "NEEDS_REVIEW" };
  }));
}

export function buildPayrollReport(projects: Project[], workers: Worker[], periods: PayrollPeriod[], runs: PayrollRun[], entries: PayrollEntry[], allocations: PayrollProjectAllocation[]) {
  return allocations.map((allocation) => { const entry = entries.find((item) => item.id === allocation.payrollEntryId); const run = runs.find((item) => item.id === entry?.payrollRunId); const period = periods.find((item) => item.id === run?.periodId); const worker = workers.find((item) => item.id === entry?.workerId); const project = projects.find((item) => item.id === allocation.projectId); return { period: period ? `${period.periodStart} – ${period.periodEnd}` : "", worker: worker?.displayName || "", project: project?.projectName || "", projectCode: project?.projectCode || "", role: worker?.jobTitle || "", grossPay: entry?.grossPay || 0, allocatedLaborCost: allocation.allocationAmount, netPay: entry?.netPay || 0, status: run?.status || "DRAFT" }; });
}

export function buildExpenseReport(projects: Project[], expenses: Expense[]) { return expenses.map((expense) => ({ date: expense.expenseDate, project: projects.find((project) => project.id === expense.projectId)?.projectName || "Unallocated", category: expense.category, description: expense.description, payee: expense.payee || "", amount: expense.amount, currency: expense.currency, status: expense.status, reference: expense.referenceNumber || "" })); }

export function groupCostByCategory(expenses: Expense[]) { return expenses.reduce<Record<string, number>>((result, expense) => { if (expense.status === "VOID") return result; result[expense.category] = (result[expense.category] || 0) + expense.amount; return result; }, {}); }

