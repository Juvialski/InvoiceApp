import type {
  Expense,
  InvoiceData,
  InvoiceProjectAllocation,
  PayrollEntry,
  PayrollProjectAllocation,
  Project,
  ProjectCostSummary,
} from "../types.ts";
import {
  calculateProjectCost,
  invoiceAllocationTotal as costingInvoiceAllocationTotal,
  invoiceResidualAmount,
  invoiceUnpaidBalance,
  isConfirmedExpense,
  isConfirmedInvoice,
  MixedCurrencyError,
  normalizeCurrency,
  payrollRecordCostBreakdown,
  projectHealth,
  roundMoney,
  type AggregatedProjectCostSummary,
  type CostInvoice,
  type CostPayrollRecord,
  type ProjectCostInput,
  type ProjectCostSummaryWithCurrency,
} from "./projectCosting.ts";

export type CurrencyAmount = Record<string, number>;

export interface ActivityPeriod {
  from?: string;
  to?: string;
}

export type TrendGrain = "day" | "week" | "month";

export interface ActivityTrendOptions extends ActivityPeriod {
  currency?: string;
  grain?: TrendGrain;
  /** Alias accepted for callers that use the dashboard terminology. */
  granularity?: TrendGrain;
  includeUnallocated?: boolean;
}

export interface DashboardStatsInput {
  projects?: Project[];
  invoices?: CostInvoice[];
  expenses?: Expense[];
  payroll?: CostPayrollRecord[];
}

export interface IndexedAccountingData {
  projectsById: Map<string, Project>;
  invoicesById: Map<string, CostInvoice>;
  invoicesByProjectId: Map<string, CostInvoice[]>;
  invoiceAllocationsByProjectId: Map<string, InvoiceProjectAllocation[]>;
  unallocatedInvoices: CostInvoice[];
  expensesById: Map<string, Expense>;
  expensesByProjectId: Map<string, Expense[]>;
  unallocatedExpenses: Expense[];
  payrollById: Map<string, CostPayrollRecord>;
  payrollByProjectId: Map<string, CostPayrollRecord[]>;
  payrollAllocationsByProjectId: Map<string, PayrollProjectAllocation[]>;
}

export interface BudgetPosition {
  projectId: string;
  currency: string;
  budget: number;
  actual: number;
  committed: number;
  pending: number;
  remaining: number;
  usedPercent: number;
  health: ReturnType<typeof projectHealth>;
  summary?: ProjectCostSummaryWithCurrency;
}

export interface AccountingTrendPoint {
  period: string;
  actual: number;
  committed: number;
  pending: number;
  currency?: string;
  invoices?: number;
  labor?: number;
  expenses?: number;
  overhead?: number;
  unallocated?: number;
  pendingOverhead?: number;
  pendingUnallocated?: number;
  payable?: number;
}

export interface Composition {
  invoices: number;
  labor: number;
  expenses: number;
  overhead: number;
  unallocated: number;
  currency?: string;
  pending?: number;
  payable?: number;
}

export interface PayableAging {
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  over90: number;
  currency?: string;
}

export interface PayrollSeriesPoint {
  period: string;
  projectLabor: number;
  overhead: number;
  unallocated: number;
  pending: number;
  currency?: string;
  pendingOverhead?: number;
  pendingUnallocated?: number;
}

export interface CompanyReconciliation {
  currency: string;
  projectActual: number;
  projectPending: number;
  projectPayable: number;
  unallocatedInvoices: number;
  unallocatedInvoicePayable: number;
  unallocatedExpenses: number;
  unallocatedLabor: number;
  overhead: number;
  total: number;
  totalPayable: number;
  totalPending: number;
  pendingUnallocatedInvoices: number;
  pendingUnallocatedExpenses: number;
  pendingUnallocatedLabor: number;
  pendingOverhead: number;
  foreignCosts: CurrencyAmount;
}

export interface ProjectCurrencyAggregation {
  currency: string;
  projectIds: string[];
  projectCount: number;
  budget: number;
  actual: number;
  committed: number;
  pending: number;
  remaining: number;
  usedPercent: number;
}

export interface IndexedCompanyProjectAggregation {
  projectPositions: BudgetPosition[];
  summariesByProjectId: Map<string, ProjectCostSummaryWithCurrency>;
  byCurrency: Record<string, ProjectCurrencyAggregation>;
}

export interface CompanyCurrencyStatistics extends ProjectCurrencyAggregation {
  reconciliation: CompanyReconciliation;
}

export interface CompanyAccountingStatistics {
  projectPositions: BudgetPosition[];
  summariesByProjectId: Map<string, ProjectCostSummaryWithCurrency>;
  byCurrency: Record<string, CompanyCurrencyStatistics>;
}

const dateOf = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 10) : "";
};

export interface AccountingDateRecord {
  invoiceDate?: string;
  expenseDate?: string;
  periodEnd?: string;
  payDate?: string;
  date?: string;
  createdAt?: string;
}

export function sourceDate(record?: AccountingDateRecord | Partial<InvoiceData>) {
  if (!record) return "";
  const dated = record as AccountingDateRecord & Partial<InvoiceData>;
  return dateOf(dated.invoiceDate) || dateOf(dated.expenseDate) || dateOf(dated.periodEnd) || dateOf(dated.payDate) || dateOf(dated.date) || dateOf(dated.createdAt);
}

export function inActivityPeriod(date: string, period?: ActivityPeriod) {
  if (!period?.from && !period?.to) return true;
  if (!date) return false;
  return (!period?.from || date >= dateOf(period.from)) && (!period?.to || date <= dateOf(period.to));
}

function addAmount(map: CurrencyAmount, code: string, amount: number) {
  const value = roundMoney(amount);
  if (!value) return;
  map[code] = roundMoney((map[code] || 0) + value);
}

export function invoiceAllocationTotal(invoice: Pick<CostInvoice, "grandTotal" | "allocations">) {
  return costingInvoiceAllocationTotal(invoice);
}

export function invoiceResidualByCurrency(invoices: CostInvoice[]): CurrencyAmount {
  return invoices.reduce<CurrencyAmount>((result, invoice) => {
    const residual = invoiceResidualAmount(invoice);
    if (residual) addAmount(result, normalizeCurrency(invoice.currency), residual);
    return result;
  }, {});
}

/** Invoice-level payable, kept separate from confirmed cost. */
export function unpaidBalance(invoice: Pick<CostInvoice, "grandTotal" | "amountPaid" | "status" | "balanceDue">) {
  return invoiceUnpaidBalance(invoice);
}

function addUnique<T extends { id: string }>(map: Map<string, T[]>, key: string, value: T) {
  const rows = map.get(key) || [];
  if (!rows.some((row) => row.id === value.id)) rows.push(value);
  map.set(key, rows);
}

function addAllocation<T>(map: Map<string, T[]>, key: string, value: T) {
  const rows = map.get(key) || [];
  rows.push(value);
  map.set(key, rows);
}

export function buildAccountingIndex(input: DashboardStatsInput): IndexedAccountingData {
  const invoices = input.invoices || [];
  const expenses = input.expenses || [];
  const payroll = input.payroll || [];
  const invoicesByProjectId = new Map<string, CostInvoice[]>();
  const invoiceAllocationsByProjectId = new Map<string, InvoiceProjectAllocation[]>();
  for (const invoice of invoices) {
    for (const allocation of invoice.allocations || []) {
      if (!allocation.projectId) continue;
      addUnique(invoicesByProjectId, allocation.projectId, invoice);
      addAllocation(invoiceAllocationsByProjectId, allocation.projectId, allocation);
    }
  }

  const expensesByProjectId = new Map<string, Expense[]>();
  const unallocatedExpenses = expenses.filter((expense) => !expense.projectId);
  for (const expense of expenses) {
    if (expense.projectId) addUnique(expensesByProjectId, expense.projectId, expense);
  }

  const payrollByProjectId = new Map<string, CostPayrollRecord[]>();
  const payrollAllocationsByProjectId = new Map<string, PayrollProjectAllocation[]>();
  for (const run of payroll) {
    for (const allocation of run.allocations || []) {
      if (!allocation.projectId) continue;
      addUnique(payrollByProjectId, allocation.projectId, run);
      addAllocation(payrollAllocationsByProjectId, allocation.projectId, allocation);
    }
  }

  return {
    projectsById: new Map((input.projects || []).map((project) => [project.id, project])),
    invoicesById: new Map(invoices.map((invoice) => [invoice.id, invoice])),
    invoicesByProjectId,
    invoiceAllocationsByProjectId,
    unallocatedInvoices: invoices.filter((invoice) => invoiceResidualAmount(invoice) > 0),
    expensesById: new Map(expenses.map((expense) => [expense.id, expense])),
    expensesByProjectId,
    unallocatedExpenses,
    payrollById: new Map(payroll.map((run) => [run.id, run])),
    payrollByProjectId,
    payrollAllocationsByProjectId,
  };
}

function scopeInput(input: DashboardStatsInput, period?: ActivityPeriod): DashboardStatsInput {
  if (!period?.from && !period?.to) return input;
  return {
    ...input,
    invoices: (input.invoices || []).filter((invoice) => inActivityPeriod(sourceDate(invoice), period)),
    expenses: (input.expenses || []).filter((expense) => inActivityPeriod(sourceDate(expense), period)),
    payroll: (input.payroll || []).filter((run) => inActivityPeriod(sourceDate(run), period)),
  };
}

export function projectBudgetPositions(projects: Project[], input: ProjectCostInput, period?: ActivityPeriod): BudgetPosition[] {
  const scoped: ProjectCostInput = period?.from || period?.to ? {
    ...input,
    invoices: (input.invoices || []).filter((invoice) => inActivityPeriod(sourceDate(invoice), period)),
    expenses: (input.expenses || []).filter((expense) => inActivityPeriod(sourceDate(expense), period)),
    payroll: (input.payroll || []).filter((run) => inActivityPeriod(sourceDate(run), period)),
  } : input;
  const index = buildAccountingIndex({ projects, invoices: scoped.invoices, expenses: scoped.expenses, payroll: scoped.payroll });
  return projects.map((project) => {
    const summary = calculateProjectCost(project, {
      invoices: index.invoicesByProjectId.get(project.id) || [],
      expenses: index.expensesByProjectId.get(project.id) || [],
      payroll: index.payrollByProjectId.get(project.id) || [],
    });
    return {
      projectId: project.id,
      currency: normalizeCurrency(project.currency),
      budget: summary.budget,
      actual: summary.totalActualCost,
      committed: roundMoney(summary.totalActualCost + summary.pendingInvoiceCost + summary.pendingPayrollCost + summary.pendingExpenseCost),
      pending: roundMoney(summary.pendingInvoiceCost + summary.pendingPayrollCost + summary.pendingExpenseCost),
      remaining: summary.remainingBudget,
      usedPercent: summary.budgetUsedPercent,
      health: projectHealth(summary),
      summary,
    };
  });
}

function aggregatePositionsByCurrency(positions: BudgetPosition[]) {
  const groups: Record<string, BudgetPosition[]> = {};
  for (const position of positions) (groups[position.currency] ||= []).push(position);
  return Object.fromEntries(Object.entries(groups).map(([code, rows]) => {
    const budget = roundMoney(rows.reduce((sum, row) => sum + row.budget, 0));
    const actual = roundMoney(rows.reduce((sum, row) => sum + row.actual, 0));
    const committed = roundMoney(rows.reduce((sum, row) => sum + row.committed, 0));
    const pending = roundMoney(rows.reduce((sum, row) => sum + row.pending, 0));
    return [code, {
      currency: code,
      projectIds: rows.map((row) => row.projectId),
      projectCount: rows.length,
      budget,
      actual,
      committed,
      pending,
      remaining: roundMoney(budget - actual),
      usedPercent: budget > 0 ? roundMoney(actual / budget * 100) : 0,
    } satisfies ProjectCurrencyAggregation];
  })) as Record<string, ProjectCurrencyAggregation>;
}

export function aggregateProjectAccounting(projects: Project[], input: ProjectCostInput, period?: ActivityPeriod): IndexedCompanyProjectAggregation {
  const projectPositions = projectBudgetPositions(projects, input, period);
  return {
    projectPositions,
    summariesByProjectId: new Map(projectPositions.flatMap((position) => position.summary ? [[position.projectId, position.summary] as const] : [])),
    byCurrency: aggregatePositionsByCurrency(projectPositions),
  };
}

export const aggregateIndexedAccounting = aggregateProjectAccounting;
export const aggregateIndexedProjectAccounting = aggregateProjectAccounting;

function summaryCurrency(summary: ProjectCostSummary) {
  return "currency" in summary ? normalizeCurrency((summary as ProjectCostSummaryWithCurrency).currency) : "UNKNOWN";
}

export function aggregateComposition(
  summaries: ProjectCostSummary[],
  overhead: number | CurrencyAmount = 0,
  targetCurrency?: string,
): Composition {
  const currencies = [...new Set(summaries.map(summaryCurrency))];
  const target = targetCurrency ? normalizeCurrency(targetCurrency) : undefined;
  if (!target && currencies.length > 1) {
    throw new MixedCurrencyError(`Cannot compose ${currencies.join(", ")} into one currency.`);
  }
  const selected = target ? summaries.filter((summary) => summaryCurrency(summary) === target || summaryCurrency(summary) === "UNKNOWN") : summaries;
  const code = target || currencies[0];
  const overheadAmount = typeof overhead === "number" ? overhead : (code ? overhead[code] || 0 : 0);
  return {
    invoices: roundMoney(selected.reduce((sum, summary) => sum + summary.invoiceCost, 0)),
    labor: roundMoney(selected.reduce((sum, summary) => sum + summary.payrollCost, 0)),
    expenses: roundMoney(selected.reduce((sum, summary) => sum + summary.otherExpenseCost, 0)),
    overhead: roundMoney(overheadAmount),
    unallocated: roundMoney(selected.reduce((sum, summary) => sum + summary.unallocatedInvoiceCost + summary.unallocatedExpenseCost + summary.unallocatedPayrollCost, 0)),
    ...(code ? { currency: code } : {}),
  };
}

export function aggregateCompositionByCurrency(
  summaries: ProjectCostSummary[],
  overhead: number | CurrencyAmount = 0,
): Record<string, Composition> {
  const groups: Record<string, ProjectCostSummary[]> = {};
  for (const summary of summaries) (groups[summaryCurrency(summary)] ||= []).push(summary);
  return Object.fromEntries(Object.entries(groups).map(([code, rows]) => [code, aggregateComposition(rows, overhead, code)]));
}

export function companyComposition(input: DashboardStatsInput, baseCurrency = "PHP") {
  const code = normalizeCurrency(baseCurrency);
  const projectSummaries = (input.projects || []).map((project) => calculateProjectCost(project, input));
  const unallocated = calculateProjectCost(undefined, { ...input, baseCurrency: code });
  return aggregateComposition([...projectSummaries, unallocated], unallocated.overheadCost, code);
}

function utcDate(date: string) {
  const parts = date.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return Number.NaN;
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function normalizedAsOf(value: string | Date) {
  return dateOf(value) || new Date().toISOString().slice(0, 10);
}

function roundedAging(result: PayableAging) {
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, typeof value === "number" ? roundMoney(value) : value])) as PayableAging;
}

export function agingPayables(
  invoices: CostInvoice[],
  asOf: string | Date = new Date().toISOString().slice(0, 10),
  targetCurrency?: string,
): PayableAging {
  const currencies = [...new Set(invoices.filter(isConfirmedInvoice).map((invoice) => normalizeCurrency(invoice.currency)))];
  const target = targetCurrency ? normalizeCurrency(targetCurrency) : undefined;
  if (!target && currencies.length > 1) throw new MixedCurrencyError(`Cannot age payables in mixed currencies: ${currencies.join(", ")}.`);
  const result: PayableAging = { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, over90: 0, ...(target || currencies[0] ? { currency: target || currencies[0] } : {}) };
  const asOfDate = normalizedAsOf(asOf);
  const asOfTime = utcDate(asOfDate);
  for (const invoice of invoices) {
    if (!isConfirmedInvoice(invoice)) continue;
    if (target && normalizeCurrency(invoice.currency) !== target) continue;
    const amount = unpaidBalance(invoice);
    const dueDate = dateOf(invoice.dueDate) || sourceDate(invoice);
    const dueTime = utcDate(dueDate);
    if (!amount || !dueDate || Number.isNaN(asOfTime) || Number.isNaN(dueTime)) continue;
    const age = Math.max(0, Math.floor((asOfTime - dueTime) / 86400000));
    if (age === 0) result.current += amount;
    else if (age <= 30) result.days1To30 += amount;
    else if (age <= 60) result.days31To60 += amount;
    else if (age <= 90) result.days61To90 += amount;
    else result.over90 += amount;
  }
  return roundedAging(result);
}

export function agingPayablesByCurrency(invoices: CostInvoice[], asOf: string | Date = new Date().toISOString().slice(0, 10)) {
  const groups: Record<string, CostInvoice[]> = {};
  for (const invoice of invoices) if (isConfirmedInvoice(invoice)) (groups[normalizeCurrency(invoice.currency)] ||= []).push(invoice);
  return Object.fromEntries(Object.entries(groups).map(([code, rows]) => [code, agingPayables(rows, asOf, code)])) as Record<string, PayableAging>;
}

export function payrollLaborVsOverhead(
  payroll: CostPayrollRecord[],
  period?: ActivityPeriod,
  targetCurrency = "PHP",
): PayrollSeriesPoint[] {
  const code = normalizeCurrency(targetCurrency);
  const byPeriod = new Map<string, PayrollSeriesPoint>();
  for (const run of payroll) {
    const key = sourceDate(run) || "undated";
    if (period && !inActivityPeriod(key === "undated" ? "" : key, period)) continue;
    const breakdown = payrollRecordCostBreakdown(run, code);
    if (breakdown.currency !== code) continue;
    const point = byPeriod.get(key) || {
      period: key,
      projectLabor: 0,
      overhead: 0,
      unallocated: 0,
      pending: 0,
      currency: code,
      pendingOverhead: 0,
      pendingUnallocated: 0,
    };
    point.projectLabor = roundMoney(point.projectLabor + breakdown.projectConfirmed);
    point.overhead = roundMoney(point.overhead + breakdown.overheadConfirmed);
    point.unallocated = roundMoney(point.unallocated + breakdown.unallocatedConfirmed);
    point.pending = roundMoney(point.pending + breakdown.projectPending);
    point.pendingOverhead = roundMoney((point.pendingOverhead || 0) + breakdown.overheadPending);
    point.pendingUnallocated = roundMoney((point.pendingUnallocated || 0) + breakdown.unallocatedPending);
    byPeriod.set(key, point);
  }
  return [...byPeriod.values()].sort((left, right) => left.period.localeCompare(right.period));
}

function periodKey(date: string, grain: TrendGrain) {
  if (!date) return "undated";
  if (grain === "day") return date;
  if (grain === "month") return date.slice(0, 7);
  const time = utcDate(date);
  if (Number.isNaN(time)) return "undated";
  const day = new Date(time).getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return new Date(time + mondayOffset * 86400000).toISOString().slice(0, 10);
}

function addTrendValue(point: AccountingTrendPoint, key: keyof AccountingTrendPoint, value: number) {
  point[key] = roundMoney(Number(point[key] || 0) + value) as never;
}

export function activityTrends(input: DashboardStatsInput, options: ActivityTrendOptions = {}): AccountingTrendPoint[] {
  const code = normalizeCurrency(options.currency || "PHP");
  const grain = options.grain || options.granularity || "month";
  const includeUnallocated = options.includeUnallocated !== false;
  const points = new Map<string, AccountingTrendPoint>();
  const getPoint = (date: string) => {
    const key = periodKey(date, grain);
    const point = points.get(key) || { period: key, actual: 0, committed: 0, pending: 0, currency: code, invoices: 0, labor: 0, expenses: 0, overhead: 0, unallocated: 0, pendingOverhead: 0, pendingUnallocated: 0, payable: 0 };
    points.set(key, point);
    return point;
  };

  for (const invoice of input.invoices || []) {
    if (normalizeCurrency(invoice.currency) !== code) continue;
    const date = sourceDate(invoice);
    if (!inActivityPeriod(date, options)) continue;
    const point = getPoint(date);
    const allocated = invoiceAllocationTotal(invoice);
    const residual = invoiceResidualAmount(invoice);
    if (isConfirmedInvoice(invoice)) {
      addTrendValue(point, "actual", allocated);
      addTrendValue(point, "invoices", allocated);
      addTrendValue(point, "payable", unpaidBalance(invoice));
      if (includeUnallocated) addTrendValue(point, "unallocated", residual);
    } else {
      addTrendValue(point, "pending", allocated);
      if (includeUnallocated) addTrendValue(point, "pendingUnallocated", residual);
    }
  }

  for (const expense of input.expenses || []) {
    if (normalizeCurrency(expense.currency) !== code || expense.status === "VOID" || expense.archivedAt) continue;
    const date = sourceDate(expense);
    if (!inActivityPeriod(date, options)) continue;
    const point = getPoint(date);
    const amount = roundMoney(expense.amount);
    if (isConfirmedExpense(expense.status)) {
      if (expense.projectId) {
        addTrendValue(point, "actual", amount);
        addTrendValue(point, "expenses", amount);
      } else if (includeUnallocated) addTrendValue(point, "unallocated", amount);
    } else if (expense.projectId) {
      addTrendValue(point, "pending", amount);
    } else if (includeUnallocated) addTrendValue(point, "pendingUnallocated", amount);
  }

  for (const run of input.payroll || []) {
    const date = sourceDate(run);
    if (!inActivityPeriod(date, options)) continue;
    const breakdown = payrollRecordCostBreakdown(run, code);
    if (breakdown.currency !== code) continue;
    const point = getPoint(date);
    const confirmedUnallocated = includeUnallocated ? breakdown.unallocatedConfirmed : 0;
    const pendingUnallocated = includeUnallocated ? breakdown.unallocatedPending : 0;
    addTrendValue(point, "actual", breakdown.projectConfirmed);
    addTrendValue(point, "labor", breakdown.projectConfirmed);
    addTrendValue(point, "overhead", breakdown.overheadConfirmed);
    addTrendValue(point, "unallocated", confirmedUnallocated);
    addTrendValue(point, "pending", breakdown.projectPending + breakdown.overheadPending + pendingUnallocated);
    addTrendValue(point, "pendingOverhead", breakdown.overheadPending);
    addTrendValue(point, "pendingUnallocated", pendingUnallocated);
  }

  return [...points.values()].sort((left, right) => left.period.localeCompare(right.period));
}

export const accountingActivityTrends = activityTrends;

function accountingCurrencies(input: DashboardStatsInput, fallback = "PHP") {
  const currencies = new Set<string>([normalizeCurrency(fallback)]);
  for (const project of input.projects || []) currencies.add(normalizeCurrency(project.currency));
  for (const invoice of input.invoices || []) currencies.add(normalizeCurrency(invoice.currency));
  for (const expense of input.expenses || []) currencies.add(normalizeCurrency(expense.currency));
  for (const run of input.payroll || []) currencies.add(normalizeCurrency(run.currency || fallback));
  return [...currencies];
}

export function activityTrendsByCurrency(input: DashboardStatsInput, options: Omit<ActivityTrendOptions, "currency"> = {}) {
  return Object.fromEntries(accountingCurrencies(input).map((code) => [code, activityTrends(input, { ...options, currency: code })])) as Record<string, AccountingTrendPoint[]>;
}

export function reconcileCompany(input: DashboardStatsInput, baseCurrency = "PHP"): CompanyReconciliation {
  const code = normalizeCurrency(baseCurrency);
  const projects = (input.projects || []).filter((project) => normalizeCurrency(project.currency) === code);
  const projectSummaries = projects.map((project) => calculateProjectCost(project, input));
  const unallocated = calculateProjectCost(undefined, { ...input, baseCurrency: code });
  const projectActual = roundMoney(projectSummaries.reduce((sum, summary) => sum + summary.totalActualCost, 0));
  const projectPending = roundMoney(projectSummaries.reduce((sum, summary) => sum + summary.pendingInvoiceCost + summary.pendingPayrollCost + summary.pendingExpenseCost, 0));
  const projectPayable = roundMoney(projectSummaries.reduce((sum, summary) => sum + summary.payableCost, 0));
  const unallocatedInvoices = unallocated.unallocatedInvoiceCost;
  const unallocatedInvoicePayable = unallocated.unallocatedInvoicePayable;
  const unallocatedExpenses = unallocated.unallocatedExpenseCost;
  const unallocatedLabor = unallocated.unallocatedPayrollCost;
  const overhead = unallocated.overheadCost;
  const total = roundMoney(projectActual + unallocatedInvoices + unallocatedExpenses + unallocatedLabor + overhead);
  const totalPayable = roundMoney(projectPayable + unallocatedInvoicePayable);
  const totalPending = roundMoney(
    projectPending
    + unallocated.unallocatedPendingInvoiceCost
    + unallocated.unallocatedPendingExpenseCost
    + unallocated.unallocatedPendingPayrollCost
    + unallocated.pendingOverheadCost,
  );
  const foreignCosts: CurrencyAmount = {};
  for (const summary of [...projectSummaries, unallocated]) {
    for (const [foreign, amount] of Object.entries(summary.foreignCosts)) addAmount(foreignCosts, foreign, amount);
  }
  return {
    currency: code,
    projectActual,
    projectPending,
    projectPayable,
    unallocatedInvoices,
    unallocatedInvoicePayable,
    unallocatedExpenses,
    unallocatedLabor,
    overhead,
    total,
    totalPayable,
    totalPending,
    pendingUnallocatedInvoices: unallocated.unallocatedPendingInvoiceCost,
    pendingUnallocatedExpenses: unallocated.unallocatedPendingExpenseCost,
    pendingUnallocatedLabor: unallocated.unallocatedPendingPayrollCost,
    pendingOverhead: unallocated.pendingOverheadCost,
    foreignCosts,
  };
}

export function reconcileCompanyByCurrency(input: DashboardStatsInput, fallbackCurrency = "PHP") {
  return Object.fromEntries(accountingCurrencies(input, fallbackCurrency).map((code) => [code, reconcileCompany(input, code)])) as Record<string, CompanyReconciliation>;
}

export function aggregateCompanyStatistics(input: DashboardStatsInput, _period?: ActivityPeriod): CompanyAccountingStatistics {
  const projectAggregation = aggregateProjectAccounting(input.projects || [], input);

  const reconciliations = reconcileCompanyByCurrency(input);
  const currencies = new Set([...Object.keys(projectAggregation.byCurrency), ...Object.keys(reconciliations)]);
  const byCurrency: Record<string, CompanyCurrencyStatistics> = {};
  for (const code of currencies) {
    const projectTotals = projectAggregation.byCurrency[code] || {
      currency: code,
      projectIds: [],
      projectCount: 0,
      budget: 0,
      actual: 0,
      committed: 0,
      pending: 0,
      remaining: 0,
      usedPercent: 0,
    };
    const reconciliation = reconciliations[code] || reconcileCompany(input, code);
    byCurrency[code] = {
      ...projectTotals,
      actual: reconciliation.total,
      committed: reconciliation.totalPayable,
      pending: reconciliation.totalPending,
      remaining: roundMoney(projectTotals.budget - reconciliation.total),
      usedPercent: projectTotals.budget > 0 ? roundMoney(reconciliation.total / projectTotals.budget * 100) : 0,
      reconciliation,
    };
  }
  return {
    projectPositions: projectAggregation.projectPositions,
    summariesByProjectId: projectAggregation.summariesByProjectId,
    byCurrency,
  };
}

export const indexedCompanyProjectAggregation = aggregateCompanyStatistics;

export { MixedCurrencyError };
export type {
  AggregatedProjectCostSummary,
  CostInvoice,
  CostPayrollRecord,
  ProjectCostInput,
  ProjectCostSummaryWithCurrency,
} from "./projectCosting.ts";
export type {
  ExpenseStatus,
  InvoiceProjectAllocation,
  PayrollEntry,
  PayrollProjectAllocation,
  PayrollRunStatus,
} from "../types.ts";
