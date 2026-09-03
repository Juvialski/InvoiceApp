import type { DashboardActivityPeriod, DashboardViewData } from "../components/engineering/EngineeringCostOperationsDashboard.tsx";
import type { ProjectCostSummary } from "../types.ts";
import { buildDashboardViewData } from "../utils/dashboardViewModel.ts";
import { buildProjectDashboardViewData, type ProjectDashboardViewData } from "../utils/projectDashboardViewModel.ts";
import { calculateProjectCost, type CostInvoice, type CostPayrollRecord } from "../utils/projectCosting.ts";
import type { DemoWorkspaceData } from "./demoTypes.ts";

export function demoCostInvoices(data: DemoWorkspaceData): CostInvoice[] {
  return data.invoices.map((invoice) => ({
    ...invoice,
    allocations: data.invoiceAllocations.filter((allocation) => allocation.invoiceId === invoice.id),
  }));
}

export function demoCostPayroll(data: DemoWorkspaceData): CostPayrollRecord[] {
  return data.payroll.runs.map((run) => {
    const period = data.payroll.periods.find((item) => item.id === run.periodId);
    const entries = data.payroll.entries.filter((entry) => entry.payrollRunId === run.id);
    const entryIds = new Set(entries.map((entry) => entry.id));
    return {
      ...run,
      currency: "PHP",
      periodStart: period?.periodStart,
      periodEnd: period?.periodEnd,
      payDate: period?.payDate,
      entries,
      allocations: data.payroll.allocations.filter((allocation) => entryIds.has(allocation.payrollEntryId)),
    };
  });
}

function demoDashboardPayroll(data: DemoWorkspaceData) {
  return data.payroll.runs.map((run) => {
    const period = data.payroll.periods.find((item) => item.id === run.periodId);
    const entries = data.payroll.entries.filter((entry) => entry.payrollRunId === run.id);
    const entryIds = new Set(entries.map((entry) => entry.id));
    return {
      ...run,
      currency: "PHP",
      periodId: run.periodId,
      periodStart: period?.periodStart,
      periodEnd: period?.periodEnd,
      payDate: period?.payDate,
      entries,
      allocations: data.payroll.allocations.filter((allocation) => entryIds.has(allocation.payrollEntryId)),
    };
  });
}

export function buildDemoProjectSummaries(data: DemoWorkspaceData): Record<string, ProjectCostSummary> {
  const invoices = demoCostInvoices(data);
  const payroll = demoCostPayroll(data);
  return Object.fromEntries(data.projects.map((project) => [project.id, calculateProjectCost(project, {
    invoices,
    expenses: data.expenses,
    payroll,
    purchaseOrders: data.purchaseOrders,
    subcontracts: data.subcontracts,
    subcontractClaims: data.subcontractClaims,
  })]));
}

export function buildDemoDashboard(data: DemoWorkspaceData, options?: { activityPeriod?: DashboardActivityPeriod; selectedProjectId?: string; selectedCurrency?: string; customStart?: string; customEnd?: string }): DashboardViewData {
  return buildDashboardViewData({
    projects: data.projects,
    invoices: data.invoices.map((invoice) => ({ ...invoice, allocations: data.invoiceAllocations.filter((allocation) => allocation.invoiceId === invoice.id) })),
    expenses: data.expenses,
    payroll: demoDashboardPayroll(data),
    purchaseOrders: data.purchaseOrders,
    subcontracts: data.subcontracts,
    subcontractClaims: data.subcontractClaims,
    periods: data.payroll.periods,
    workers: data.payroll.workers,
    payrollEntries: data.payroll.entries,
    payrollAllocations: data.payroll.allocations,
    payrollRuns: data.payroll.runs,
    cash: data.cash,
    activityPeriod: options?.activityPeriod || "QUARTER",
    customStart: options?.customStart,
    customEnd: options?.customEnd,
    selectedCurrency: options?.selectedCurrency || "PHP",
    projectId: options?.selectedProjectId,
    today: data.anchorDate,
  });
}

export function buildDemoProjectDashboard(data: DemoWorkspaceData, projectId: string): ProjectDashboardViewData | undefined {
  const project = data.projects.find((item) => item.id === projectId);
  if (!project) return undefined;
  return buildProjectDashboardViewData({
    project,
    invoices: demoCostInvoices(data),
    expenses: data.expenses,
    payroll: demoCostPayroll(data),
    purchaseOrders: data.purchaseOrders,
    subcontracts: data.subcontracts,
    subcontractClaims: data.subcontractClaims,
    periods: data.payroll.periods,
    today: data.anchorDate,
  });
}
