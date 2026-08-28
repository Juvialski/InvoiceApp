import type { Expense, InvoiceData, InvoiceProjectAllocation, PayrollProjectAllocation, Project, ProjectCostSummary, PayrollEntry, PayrollPeriod, PayrollRun, Worker } from "../types.ts";
import { calculateProjectCost, normalizedInvoiceAllocationAmount } from "./projectCosting.ts";
import type { CostPayrollRecord } from "./projectCosting.ts";
import type { ProjectLaborCostAggregate, ProjectLaborSource } from "./projectLaborCostAggregate.ts";

export interface ProjectCostReportRow extends ProjectCostSummary { projectCode: string; projectName: string; currency: string; }

export interface ProjectCostReportOptions {
  projectLaborAggregates?: readonly ProjectLaborCostAggregate[];
  laborSource?: ProjectLaborSource;
}

export function buildProjectCostReport(
  projects: Project[],
  invoices: InvoiceData[],
  invoiceAllocations: InvoiceProjectAllocation[],
  payroll: CostPayrollRecord[],
  expenses: Expense[],
  options: ProjectCostReportOptions = {},
): ProjectCostReportRow[] {
  return projects.map((project) => ({
    projectCode: project.projectCode,
    projectName: project.projectName,
    currency: project.currency,
    ...calculateProjectCost(project, {
      invoices: invoices.map((invoice) => ({ ...invoice, allocations: invoiceAllocations.filter((allocation) => allocation.invoiceId === invoice.id) })),
      payroll,
      expenses,
      projectLaborAggregates: options.projectLaborAggregates,
      laborSource: options.laborSource,
    }),
  }));
}

export interface ProjectLaborAggregateReportRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  currency: string;
  confirmedLaborCost: number;
  pendingLaborCost: number;
  status: string;
}

export function buildProjectLaborAggregateReport(
  projects: Project[],
  aggregates: readonly ProjectLaborCostAggregate[],
): ProjectLaborAggregateReportRow[] {
  const aggregateByProjectId = new Map(aggregates.map((aggregate) => [aggregate.projectId, aggregate]));
  return projects.flatMap((project) => {
    const aggregate = aggregateByProjectId.get(project.id);
    if (!aggregate) return [];
    return [{
      projectId: project.id,
      projectCode: project.projectCode,
      projectName: project.projectName,
      currency: aggregate.currency,
      confirmedLaborCost: aggregate.confirmedLaborCost,
      pendingLaborCost: aggregate.pendingLaborCost,
      status: aggregate.status,
    }];
  });
}

export function buildProjectInvoiceReport(projects: Project[], invoices: InvoiceData[], allocations: InvoiceProjectAllocation[]) {
  return invoices.flatMap((invoice) => allocations.filter((allocation) => allocation.invoiceId === invoice.id).map((allocation) => {
    const project = projects.find((item) => item.id === allocation.projectId);
    return { project: project?.projectName || "Unknown project", projectCode: project?.projectCode || "", vendor: invoice.vendor?.name || invoice.vendor?.registeredName || "Unknown vendor", invoiceNumber: invoice.invoiceNumber || "", invoiceDate: invoice.invoiceDate || "", invoiceTotal: invoice.grandTotal, allocatedAmount: normalizedInvoiceAllocationAmount(invoice.grandTotal, allocation), currency: invoice.currency || "", paymentStatus: invoice.status || "UNPAID", reviewStatus: invoice.reviewStatus || "NEEDS_REVIEW" };
  }));
}

export function buildPayrollReport(projects: Project[], workers: Worker[], periods: PayrollPeriod[], runs: PayrollRun[], entries: PayrollEntry[], allocations: PayrollProjectAllocation[]) {
  const rows = allocations.map((allocation) => {
    const entry = entries.find((item) => item.id === allocation.payrollEntryId);
    const run = runs.find((item) => item.id === entry?.payrollRunId);
    const period = periods.find((item) => item.id === run?.periodId);
    const worker = workers.find((item) => item.id === entry?.workerId);
    const project = projects.find((item) => item.id === allocation.projectId);
    return { period: period ? `${period.periodStart} – ${period.periodEnd}` : "", worker: worker?.displayName || "", project: project?.projectName || "", projectCode: project?.projectCode || "", role: worker?.jobTitle || "", grossPay: entry?.grossPay || 0, allocatedLaborCost: allocation.allocationAmount, netPay: entry?.netPay || 0, status: run?.status || "DRAFT" };
  });

  const unallocatedRows = entries.flatMap((entry) => {
    const allocatedAmount = allocations
      .filter((allocation) => allocation.payrollEntryId === entry.id)
      .reduce((sum, allocation) => sum + (Number(allocation.allocationAmount) || 0), 0);
    const unallocatedAmount = Math.round(Math.max(0, (Number(entry.projectAllocatedCost) || 0) - allocatedAmount) * 100) / 100;
    if (unallocatedAmount <= 0) return [];
    const run = runs.find((item) => item.id === entry.payrollRunId);
    const period = periods.find((item) => item.id === run?.periodId);
    const worker = workers.find((item) => item.id === entry.workerId);
    return [{ period: period ? `${period.periodStart} – ${period.periodEnd}` : "", worker: worker?.displayName || "", project: "Unallocated labor", projectCode: "", role: worker?.jobTitle || "", grossPay: entry.grossPay || 0, allocatedLaborCost: unallocatedAmount, netPay: entry.netPay || 0, status: run?.status || "DRAFT" }];
  });

  return [...rows, ...unallocatedRows];
}

export function buildExpenseReport(projects: Project[], expenses: Expense[]) { return expenses.map((expense) => ({ date: expense.expenseDate, project: projects.find((project) => project.id === expense.projectId)?.projectName || "Unallocated", category: expense.category, description: expense.description, payee: expense.payee || "", amount: expense.amount, currency: expense.currency, status: expense.status, reference: expense.referenceNumber || "" })); }

export function groupCostByCategory(expenses: Expense[]) { return expenses.reduce<Record<string, number>>((result, expense) => { if (expense.status === "VOID") return result; result[expense.category] = (result[expense.category] || 0) + expense.amount; return result; }, {}); }


export function buildPayrollReportWithContext(projects: Project[], workers: Worker[], periods: PayrollPeriod[], runs: PayrollRun[], entries: PayrollEntry[], allocations: PayrollProjectAllocation[]) {
  const periodLabel = (entry: PayrollEntry) => {
    const run = runs.find((item) => item.id === entry.payrollRunId);
    const period = periods.find((item) => item.id === run?.periodId);
    return { run, period: period ? period.periodStart + " – " + period.periodEnd : "" };
  };
  const workerLabel = (entry: PayrollEntry) => workers.find((item) => item.id === entry.workerId);
  const contextLabel = (entry: PayrollEntry) => entry.costContext?.type === "ADMIN_OFFICE" ? "Administrative / Office" : entry.costContext?.type === "GENERAL_OVERHEAD" ? entry.costContext.label || "General overhead" : "Unallocated labor";
  const rows = allocations.flatMap((allocation) => {
    const entry = entries.find((item) => item.id === allocation.payrollEntryId);
    if (!entry) return [];
    const { run, period } = periodLabel(entry);
    const worker = workerLabel(entry);
    const project = projects.find((item) => item.id === allocation.projectId);
    return [{ period, worker: worker?.displayName || "", project: project?.projectName || "", projectCode: project?.projectCode || "", role: worker?.jobTitle || "", grossPay: entry.grossPay || 0, allocatedLaborCost: allocation.allocationAmount, netPay: entry.netPay || 0, status: run?.status || "DRAFT", contextKind: entry.costContext?.type || "PROJECT" }];
  });
  const nonProjectRows = entries.flatMap((entry) => {
    const context = entry.costContext?.type;
    if (!context || context === "PROJECT") return [];
    const { run, period } = periodLabel(entry);
    const worker = workerLabel(entry);
    return [{ period, worker: worker?.displayName || "", project: contextLabel(entry), projectCode: "", role: worker?.jobTitle || "", grossPay: entry.grossPay || 0, allocatedLaborCost: entry.grossPay || 0, netPay: entry.netPay || 0, status: run?.status || "DRAFT", contextKind: context }];
  });
  const unallocatedRows = entries.flatMap((entry) => {
    if (entry.costContext?.type === "ADMIN_OFFICE" || entry.costContext?.type === "GENERAL_OVERHEAD" || entry.costContext?.type === "UNALLOCATED_REVIEW") return [];
    const allocatedAmount = allocations.filter((allocation) => allocation.payrollEntryId === entry.id).reduce((sum, allocation) => sum + (Number(allocation.allocationAmount) || 0), 0);
    const unallocatedAmount = Math.round(Math.max(0, (Number(entry.projectAllocatedCost) || 0) - allocatedAmount) * 100) / 100;
    if (unallocatedAmount <= 0) return [];
    const { run, period } = periodLabel(entry);
    const worker = workerLabel(entry);
    return [{ period, worker: worker?.displayName || "", project: "Unallocated labor", projectCode: "", role: worker?.jobTitle || "", grossPay: entry.grossPay || 0, allocatedLaborCost: unallocatedAmount, netPay: entry.netPay || 0, status: run?.status || "DRAFT", contextKind: "UNALLOCATED_REVIEW" }];
  });
  return [...rows, ...nonProjectRows, ...unallocatedRows];
}

export interface PayrollOperatingCostSummary {
  totalGross: number;
  confirmedGross: number;
  pendingGross: number;
  projectLabor: number;
  overheadLabor: number;
  unallocatedLabor: number;
}

export function buildPayrollOperatingCostSummary(runs: PayrollRun[], entries: PayrollEntry[], allocations: PayrollProjectAllocation[]): PayrollOperatingCostSummary {
  const summary: PayrollOperatingCostSummary = { totalGross: 0, confirmedGross: 0, pendingGross: 0, projectLabor: 0, overheadLabor: 0, unallocatedLabor: 0 };
  for (const entry of entries) {
    const run = runs.find((item) => item.id === entry.payrollRunId);
    if (!run || run.status === "VOID") continue;
    const gross = Math.max(0, Number(entry.grossPay) || 0);
    const allocated = allocations.filter((allocation) => allocation.payrollEntryId === entry.id).reduce((sum, allocation) => sum + Math.max(0, Number(allocation.allocationAmount) || 0), 0);
    if (run.status === "APPROVED" || run.status === "PAID") summary.confirmedGross += gross; else summary.pendingGross += gross;
    summary.totalGross += gross;
    if (entry.costContext?.type === "ADMIN_OFFICE" || entry.costContext?.type === "GENERAL_OVERHEAD") summary.overheadLabor += gross;
    else {
      summary.projectLabor += allocated;
      summary.unallocatedLabor += entry.costContext?.type === "UNALLOCATED_REVIEW" ? gross : Math.max(0, (Number(entry.projectAllocatedCost) || 0) - allocated);
    }
  }
  return Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, Math.round(value * 100) / 100])) as unknown as PayrollOperatingCostSummary;
}
