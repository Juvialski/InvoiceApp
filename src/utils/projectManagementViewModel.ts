import type {
  Expense,
  Project,
  ProjectCostCode,
  ProjectCostSummary,
  ProjectStatus,
} from "../types.ts";
import {
  calculateProjectBudgetControl,
  normalizeCurrency,
  projectHealth,
  roundMoney,
  PROJECT_HEALTH_THRESHOLD_PERCENT,
  type CostInvoice,
  type CostPayrollRecord,
  type ProjectBudgetControlSummary,
  type ProjectCostInput,
} from "./projectCosting.ts";
import {
  buildProjectFinancialTruth,
  type ProjectFinancialTruth,
} from "./projectFinancialSummary.ts";
import type { ProjectLaborCostAggregate, ProjectLaborSource } from "./projectLaborCostAggregate.ts";

export type ProjectAttentionFlag =
  | "OVER_BUDGET"
  | "NEAR_BUDGET"
  | "UNCODED_COST"
  | "UNALLOCATED_BUDGET"
  | "FORECAST_OVER_BUDGET"
  | "FORECAST_NOT_SET"
  | "MIXED_CURRENCY"
  | "PARTIAL_DATA"
  | "INVOICES_AWAITING_REVIEW"
  | "PENDING_EXPOSURE";

export interface ProjectAttentionItem {
  id: string;
  flag: ProjectAttentionFlag;
  label: string;
  detail: string;
  tone: "danger" | "warning" | "info" | "neutral";
  tab?: "overview" | "budget" | "invoices" | "payroll" | "expenses" | "reports";
}

export type ProjectManagementHealth = "ON BUDGET" | "NEAR LIMIT" | "OVER BUDGET" | "NO BUDGET" | "PARTIAL";

export interface ProjectManagementView {
  project: Project;
  currency: string;
  financialTruth: ProjectFinancialTruth;
  health: ProjectManagementHealth;
  confirmedUtilization: number;
  commitmentUtilization: number;
  hasForeignAmounts: boolean;
  isPartial: boolean;

  // Key Financial Snapshot Amounts
  contractValue: number | null;
  approvedCostBudget: number;
  actualCost: number;
  pendingCostExposure: number;
  remainingBudget: number | null; // null if partial/mixed currency or unavailable
  variance: number | null; // budget - actual (null if partial/mixed currency)
  outstandingPayables: number;

  // Work Package / Budget Control Context
  allocatedCostCodeBudget: number;
  unallocatedBudget: number;
  codedActualCost: number | null; // null if authoritative P1B source inputs are unavailable
  uncodedActualCost: number | null; // null if authoritative P1B source inputs are unavailable
  costClassificationAvailable: boolean; // true only when authoritative transaction-level sources were evaluated
  activeCostCodesCount: number;
  forecastFinalCost: number | null; // null if incomplete/partial forecast
  forecastVariance: number | null; // null if incomplete/partial forecast
  hasExplicitForecast: boolean; // true ONLY when every active cost code has a numeric forecast

  // Explainable Attention Flags
  attentionFlags: ProjectAttentionItem[];

  // Underlying Budget Control Summary
  budgetControlSummary?: ProjectBudgetControlSummary;
  baseCostSummary: ProjectCostSummary;
}

export interface BuildProjectManagementViewOptions {
  costCodes?: readonly ProjectCostCode[];
  invoices?: CostInvoice[];
  expenses?: Expense[];
  payroll?: CostPayrollRecord[];
  projectLaborAggregates?: readonly ProjectLaborCostAggregate[];
  laborSource?: ProjectLaborSource;
  costInput?: ProjectCostInput;
  financialDataComplete?: boolean;
}

/**
 * Builds a unified ProjectManagementView for a single project.
 * Uses P1A buildProjectFinancialTruth and P1B calculateProjectBudgetControl
 * underneath, ensuring zero duplicated financial math.
 */
export function buildProjectManagementView(
  project: Project,
  summary: ProjectCostSummary,
  options?: BuildProjectManagementViewOptions,
): ProjectManagementView {
  const currency = normalizeCurrency(project.currency || "PHP");
  const budget = roundMoney(project.projectBudget || 0);
  const contractValue = Number.isFinite(Number(project.contractValue))
    ? roundMoney(Number(project.contractValue))
    : null;

  const financialDataComplete = options?.financialDataComplete !== false;
  const financialTruth = buildProjectFinancialTruth(project, summary);
  const foreignCosts = summary.foreignCosts || {};
  const hasForeignAmounts = Object.entries(foreignCosts).some(([, val]) => roundMoney(val) !== 0);
  const isPartial = !financialDataComplete || financialTruth.actualCost.status === "partial" || hasForeignAmounts;

  const actualCost = roundMoney(summary.totalActualCost || 0);
  const pendingCostExposure = roundMoney(
    (summary.pendingInvoiceCost || 0) +
    (summary.pendingPayrollCost || 0) +
    (summary.pendingExpenseCost || 0),
  );
  const outstandingPayables = roundMoney(summary.unpaidInvoiceCost || 0);

  const remainingBudget = isPartial ? null : roundMoney(budget - actualCost);
  const variance = isPartial ? null : roundMoney(budget - actualCost);

  const confirmedUtilization = budget > 0 ? roundMoney((actualCost / budget) * 100) : 0;
  const commitmentUtilization = budget > 0 ? roundMoney(((actualCost + pendingCostExposure) / budget) * 100) : 0;

  // Health: If partial, cost health is PARTIAL. Otherwise use standard projectHealth.
  const rawHealth = projectHealth(summary);
  const health: ProjectManagementHealth = isPartial
    ? "PARTIAL"
    : budget <= 0
      ? "NO BUDGET"
      : rawHealth;

  // Work Package / Cost Codes computation
  const projectCostCodes = (options?.costCodes || []).filter((cc) => cc.projectId === project.id);
  const activeCodes = projectCostCodes.filter((cc) => cc.status === "ACTIVE");
  const activeCostCodesCount = activeCodes.length;

  let budgetControlSummary: ProjectBudgetControlSummary | undefined;
  let allocatedCostCodeBudget = 0;
  let unallocatedBudget = budget;
  let codedActualCost: number | null = null;
  let uncodedActualCost: number | null = null;
  let costClassificationAvailable = false;
  let forecastFinalCost: number | null = null;
  let forecastVariance: number | null = null;
  let hasExplicitForecast = false;

  // 1. Budget structure derived safely from cost codes alone
  if (activeCodes.length > 0) {
    allocatedCostCodeBudget = roundMoney(
      activeCodes.reduce((sum, c) => sum + (Number(c.approvedBudgetAmount) || 0), 0),
    );
    unallocatedBudget = roundMoney(budget - allocatedCostCodeBudget);

    // Forecast: Authoritative ONLY when EVERY active cost code has an explicit numeric forecast
    const allActiveForecasted = activeCodes.every(
      (c) => c.forecastAmount !== null && c.forecastAmount !== undefined && Number.isFinite(Number(c.forecastAmount)),
    );

    if (allActiveForecasted) {
      hasExplicitForecast = true;
      forecastFinalCost = roundMoney(
        activeCodes.reduce((sum, c) => sum + Number(c.forecastAmount), 0),
      );
      forecastVariance = roundMoney(budget - forecastFinalCost);
    } else {
      hasExplicitForecast = false;
      forecastFinalCost = null;
      forecastVariance = null;
    }
  } else {
    allocatedCostCodeBudget = 0;
    unallocatedBudget = budget;
    hasExplicitForecast = false;
    forecastFinalCost = null;
    forecastVariance = null;
  }

  // 2. Cost-classification (coded vs uncoded actuals) requiring authoritative transaction-level source inputs
  const hasAuthoritativeSourceInputs = Boolean(
    options?.costInput ||
    options?.invoices !== undefined ||
    options?.expenses !== undefined ||
    options?.payroll !== undefined ||
    options?.projectLaborAggregates !== undefined,
  );

  if (hasAuthoritativeSourceInputs && options?.costCodes && options.costCodes.length > 0) {
    const input: ProjectCostInput = options.costInput || {
      invoices: options.invoices,
      expenses: options.expenses,
      payroll: options.payroll,
      projectLaborAggregates: options.projectLaborAggregates,
      laborSource: options.laborSource,
      baseCurrency: currency,
    };
    budgetControlSummary = calculateProjectBudgetControl(project, options.costCodes, input);
    allocatedCostCodeBudget = budgetControlSummary.allocatedCostCodeBudget;
    unallocatedBudget = budgetControlSummary.unallocatedBudget;
    codedActualCost = budgetControlSummary.codedActualCost;
    uncodedActualCost = budgetControlSummary.uncodedActualCost;
    costClassificationAvailable = true;
  } else if (options?.costCodes !== undefined && options.costCodes.length === 0) {
    // Zero cost codes explicitly defined: trivially, coded is 0 and uncoded is total actual
    codedActualCost = 0;
    uncodedActualCost = actualCost;
    costClassificationAvailable = true;
  } else {
    // Cost codes exist or are unprovided, but authoritative transaction-level inputs were not provided
    codedActualCost = null;
    uncodedActualCost = null;
    costClassificationAvailable = false;
  }

  // Attention Flags
  const attentionFlags: ProjectAttentionItem[] = [];

  if (!financialDataComplete) {
    attentionFlags.push({
      id: "partial-data",
      flag: "PARTIAL_DATA",
      label: "Financial data incomplete",
      detail: "One or more project cost sources are withheld or inaccessible for this role.",
      tone: "warning",
      tab: "overview",
    });
  }

  if (hasForeignAmounts) {
    attentionFlags.push({
      id: "mixed-currency",
      flag: "MIXED_CURRENCY",
      label: "Mixed currencies",
      detail: `Unconverted foreign-currency sources are present: ${Object.entries(foreignCosts).map(([c, v]) => `${c} ${Number(v).toFixed(2)}`).join(", ")}.`,
      tone: "warning",
      tab: "overview",
    });
  }

  // OVER_BUDGET and NEAR_BUDGET must only fire on complete, authoritative cost data
  if (!isPartial && budget > 0) {
    if (actualCost > budget) {
      attentionFlags.push({
        id: "over-budget",
        flag: "OVER_BUDGET",
        label: "Over budget",
        detail: `Actual cost exceeds approved cost budget by ${roundMoney(actualCost - budget).toFixed(2)} ${currency}.`,
        tone: "danger",
        tab: "budget",
      });
    } else if (confirmedUtilization >= PROJECT_HEALTH_THRESHOLD_PERCENT && actualCost <= budget) {
      attentionFlags.push({
        id: "near-budget",
        flag: "NEAR_BUDGET",
        label: "Near budget limit",
        detail: `Actual cost has reached ${confirmedUtilization.toFixed(1)}% of approved budget.`,
        tone: "warning",
        tab: "budget",
      });
    }
  }

  if (pendingCostExposure > 0) {
    attentionFlags.push({
      id: "pending-exposure",
      flag: "PENDING_EXPOSURE",
      label: "Pending cost exposure",
      detail: `Unconfirmed exposure of ${pendingCostExposure.toFixed(2)} ${currency} is awaiting review or approval.`,
      tone: "info",
      tab: "overview",
    });
  }

  if (costClassificationAvailable && activeCostCodesCount > 0 && uncodedActualCost !== null && uncodedActualCost > 0) {
    attentionFlags.push({
      id: "uncoded-cost",
      flag: "UNCODED_COST",
      label: "Uncoded actual cost",
      detail: `${uncodedActualCost.toFixed(2)} ${currency} of actual cost is not assigned to any work package cost code.`,
      tone: "warning",
      tab: "budget",
    });
  }

  if (activeCostCodesCount > 0 && unallocatedBudget > 0) {
    attentionFlags.push({
      id: "unallocated-budget",
      flag: "UNALLOCATED_BUDGET",
      label: "Unallocated budget",
      detail: `${unallocatedBudget.toFixed(2)} ${currency} of approved budget has not been allocated to work packages.`,
      tone: "info",
      tab: "budget",
    });
  }

  if (activeCostCodesCount > 0 && !hasExplicitForecast) {
    attentionFlags.push({
      id: "forecast-not-set",
      flag: "FORECAST_NOT_SET",
      label: "Forecast not set",
      detail: "One or more active work package cost codes lack an explicit forecast amount.",
      tone: "info",
      tab: "budget",
    });
  }

  if (hasExplicitForecast && forecastVariance !== null && forecastVariance < 0) {
    attentionFlags.push({
      id: "forecast-over-budget",
      flag: "FORECAST_OVER_BUDGET",
      label: "Forecast over budget",
      detail: `Forecast cost (${(forecastFinalCost || 0).toFixed(2)} ${currency}) exceeds approved budget by ${Math.abs(forecastVariance).toFixed(2)} ${currency}.`,
      tone: "danger",
      tab: "budget",
    });
  }

  if (summary.pendingInvoiceCost > 0) {
    attentionFlags.push({
      id: "invoices-awaiting-review",
      flag: "INVOICES_AWAITING_REVIEW",
      label: "Invoices awaiting review",
      detail: `Unverified supplier invoice cost allocated to this project: ${summary.pendingInvoiceCost.toFixed(2)} ${currency}.`,
      tone: "info",
      tab: "invoices",
    });
  }

  return {
    project,
    currency,
    financialTruth,
    health,
    confirmedUtilization,
    commitmentUtilization,
    hasForeignAmounts,
    isPartial,
    contractValue,
    approvedCostBudget: budget,
    actualCost,
    pendingCostExposure,
    remainingBudget,
    variance,
    outstandingPayables,
    allocatedCostCodeBudget,
    unallocatedBudget,
    codedActualCost,
    uncodedActualCost,
    costClassificationAvailable,
    activeCostCodesCount,
    forecastFinalCost,
    forecastVariance,
    hasExplicitForecast,
    attentionFlags,
    budgetControlSummary,
    baseCostSummary: summary,
  };
}

export interface PortfolioCurrencyGroup {
  currency: string;
  projectCount: number;
  totalContractValue: number;
  totalApprovedBudget: number;
  totalActualCost: number;
  totalPendingExposure: number;
  isComplete: boolean;
  contractValueComplete: boolean;
}

export interface PortfolioManagementSummary {
  totalProjects: number;
  activeProjects: number;
  onHoldProjects: number;
  archivedProjects: number;
  planningProjects: number;
  completedProjects: number;
  cancelledProjects: number;

  isMultiCurrency: boolean;
  currencies: string[];
  currencyGroups: Record<string, PortfolioCurrencyGroup>;

  projectsNearBudgetCount: number;
  projectsOverBudgetCount: number;
  projectsWithUncodedCostCount: number;
  projectsMissingForecastCount: number;
  projectsWithPendingExposureCount: number;
  projectsWithMixedCurrencyCount: number;
  projectsWithInvoicesAwaitingReviewCount: number;
}

/**
 * Builds a multi-currency-safe portfolio summary across project management views.
 * Never sums across mixed currencies.
 */
export function buildPortfolioManagementSummary(
  views: readonly ProjectManagementView[],
): PortfolioManagementSummary {
  let activeProjects = 0;
  let onHoldProjects = 0;
  let archivedProjects = 0;
  let planningProjects = 0;
  let completedProjects = 0;
  let cancelledProjects = 0;

  let projectsNearBudgetCount = 0;
  let projectsOverBudgetCount = 0;
  let projectsWithUncodedCostCount = 0;
  let projectsMissingForecastCount = 0;
  let projectsWithPendingExposureCount = 0;
  let projectsWithMixedCurrencyCount = 0;
  let projectsWithInvoicesAwaitingReviewCount = 0;

  const currencyGroups: Record<string, PortfolioCurrencyGroup> = {};

  for (const view of views) {
    const status = view.project.status;
    if (status === "ACTIVE" || (status as string) === "IN_PROGRESS") activeProjects += 1;
    else if (status === "ON_HOLD") onHoldProjects += 1;
    else if (status === "ARCHIVED") archivedProjects += 1;
    else if (status === "PLANNING") planningProjects += 1;
    else if (status === "COMPLETED") completedProjects += 1;
    else if (status === "CANCELLED") cancelledProjects += 1;

    // Attention counts
    if (view.health === "NEAR LIMIT") projectsNearBudgetCount += 1;
    if (view.health === "OVER BUDGET") projectsOverBudgetCount += 1;
    if (view.costClassificationAvailable && view.uncodedActualCost !== null && view.uncodedActualCost > 0 && view.activeCostCodesCount > 0) {
      projectsWithUncodedCostCount += 1;
    }
    if (view.activeCostCodesCount > 0 && !view.hasExplicitForecast) projectsMissingForecastCount += 1;
    if (view.pendingCostExposure > 0) projectsWithPendingExposureCount += 1;
    if (view.hasForeignAmounts) projectsWithMixedCurrencyCount += 1;
    if (view.attentionFlags.some((f) => f.flag === "INVOICES_AWAITING_REVIEW")) {
      projectsWithInvoicesAwaitingReviewCount += 1;
    }

    // Currency grouping
    const curr = view.currency;
    if (!currencyGroups[curr]) {
      currencyGroups[curr] = {
        currency: curr,
        projectCount: 0,
        totalContractValue: 0,
        totalApprovedBudget: 0,
        totalActualCost: 0,
        totalPendingExposure: 0,
        isComplete: true,
        contractValueComplete: true,
      };
    }
    const group = currencyGroups[curr]!;
    group.projectCount += 1;

    if (view.contractValue !== null && view.contractValue !== undefined) {
      group.totalContractValue = roundMoney(group.totalContractValue + view.contractValue);
    } else {
      group.contractValueComplete = false;
    }

    group.totalApprovedBudget = roundMoney(group.totalApprovedBudget + view.approvedCostBudget);
    group.totalActualCost = roundMoney(group.totalActualCost + view.actualCost);
    group.totalPendingExposure = roundMoney(group.totalPendingExposure + view.pendingCostExposure);

    if (view.isPartial || view.hasForeignAmounts) {
      group.isComplete = false;
    }
  }

  const currencies = Object.keys(currencyGroups);
  const isMultiCurrency = currencies.length > 1;

  return {
    totalProjects: views.length,
    activeProjects,
    onHoldProjects,
    archivedProjects,
    planningProjects,
    completedProjects,
    cancelledProjects,
    isMultiCurrency,
    currencies,
    currencyGroups,
    projectsNearBudgetCount,
    projectsOverBudgetCount,
    projectsWithUncodedCostCount,
    projectsMissingForecastCount,
    projectsWithPendingExposureCount,
    projectsWithMixedCurrencyCount,
    projectsWithInvoicesAwaitingReviewCount,
  };
}

export type ProjectSortField =
  | "code"
  | "name"
  | "client"
  | "status"
  | "contractValue"
  | "projectBudget"
  | "actualCost"
  | "remainingBudget"
  | "utilization";

export type ProjectSortDirection = "asc" | "desc";

export type ProjectHealthFilter =
  | "ALL"
  | "ON_BUDGET"
  | "NEAR_BUDGET"
  | "OVER_BUDGET"
  | "NO_BUDGET"
  | "UNCODED_COST"
  | "MISSING_FORECAST"
  | "PENDING_EXPOSURE"
  | "MIXED_CURRENCY"
  | "PARTIAL_DATA";

export interface FilterAndSortOptions {
  searchQuery?: string;
  statusFilter?: "ALL" | ProjectStatus;
  healthFilter?: ProjectHealthFilter;
  sortField?: ProjectSortField;
  sortDirection?: ProjectSortDirection;
}

/**
 * Filters and sorts ProjectManagementViews safely according to search query,
 * status filter, health filter, and multi-field sorting.
 *
 * For financial numeric fields (contractValue, projectBudget, actualCost, remainingBudget):
 * Sorts by currency first, then numeric value within currency, preventing misleading cross-currency comparison.
 */
export function filterAndSortProjectViews(
  views: readonly ProjectManagementView[],
  options: FilterAndSortOptions,
): ProjectManagementView[] {
  const query = (options.searchQuery || "").trim().toLowerCase();
  const statusFilter = options.statusFilter || "ALL";
  const healthFilter = options.healthFilter || "ALL";
  const sortField = options.sortField || "code";
  const sortDirection = options.sortDirection || "asc";

  // 1. Filter
  const filtered = views.filter((view) => {
    // Status filter
    if (statusFilter !== "ALL" && view.project.status !== statusFilter) {
      return false;
    }

    // Health / Attention filter
    if (healthFilter !== "ALL") {
      if (healthFilter === "ON_BUDGET" && view.health !== "ON BUDGET") return false;
      if (healthFilter === "NEAR_BUDGET" && view.health !== "NEAR LIMIT") return false;
      if (healthFilter === "OVER_BUDGET" && view.health !== "OVER BUDGET") return false;
      if (healthFilter === "NO_BUDGET" && view.health !== "NO BUDGET") return false;
      if (healthFilter === "UNCODED_COST" && !(view.costClassificationAvailable && view.uncodedActualCost !== null && view.uncodedActualCost > 0 && view.activeCostCodesCount > 0)) {
        return false;
      }
      if (healthFilter === "MISSING_FORECAST" && !(view.activeCostCodesCount > 0 && !view.hasExplicitForecast)) {
        return false;
      }
      if (healthFilter === "PENDING_EXPOSURE" && view.pendingCostExposure <= 0) return false;
      if (healthFilter === "MIXED_CURRENCY" && !view.hasForeignAmounts) return false;
      if (healthFilter === "PARTIAL_DATA" && !view.isPartial) return false;
    }

    // Search query
    if (query) {
      const code = (view.project.projectCode || "").toLowerCase();
      const name = (view.project.projectName || "").toLowerCase();
      const client = (view.project.clientName || "").toLowerCase();
      const loc = (view.project.location || view.project.siteAddress || "").toLowerCase();
      const pm = (view.project.projectManager || "").toLowerCase();
      const desc = (view.project.description || view.project.notes || "").toLowerCase();

      const matches =
        code.includes(query) ||
        name.includes(query) ||
        client.includes(query) ||
        loc.includes(query) ||
        pm.includes(query) ||
        desc.includes(query);

      if (!matches) return false;
    }

    return true;
  });

  // 2. Sort
  return [...filtered].sort((a, b) => {
    // Non-financial fields
    if (sortField === "code") {
      const cmp = (a.project.projectCode || "").localeCompare(b.project.projectCode || "");
      if (cmp !== 0) return sortDirection === "desc" ? -cmp : cmp;
      return a.project.id.localeCompare(b.project.id);
    }
    if (sortField === "name") {
      const cmp = (a.project.projectName || "").localeCompare(b.project.projectName || "");
      if (cmp !== 0) return sortDirection === "desc" ? -cmp : cmp;
      return (a.project.projectCode || "").localeCompare(b.project.projectCode || "");
    }
    if (sortField === "client") {
      const cmp = (a.project.clientName || "").localeCompare(b.project.clientName || "");
      if (cmp !== 0) return sortDirection === "desc" ? -cmp : cmp;
      return (a.project.projectCode || "").localeCompare(b.project.projectCode || "");
    }
    if (sortField === "status") {
      const cmp = (a.project.status || "").localeCompare(b.project.status || "");
      if (cmp !== 0) return sortDirection === "desc" ? -cmp : cmp;
      return (a.project.projectCode || "").localeCompare(b.project.projectCode || "");
    }

    // Utilization: dimensionless percentage
    if (sortField === "utilization") {
      const aValid = !a.isPartial && a.approvedCostBudget > 0;
      const bValid = !b.isPartial && b.approvedCostBudget > 0;

      if (!aValid && !bValid) {
        return (a.project.projectCode || "").localeCompare(b.project.projectCode || "");
      }
      if (!aValid) return 1; // invalid/partial goes to the end
      if (!bValid) return -1; // invalid/partial goes to the end

      const cmp = a.confirmedUtilization - b.confirmedUtilization;
      if (cmp !== 0) return sortDirection === "desc" ? -cmp : cmp;
      return (a.project.projectCode || "").localeCompare(b.project.projectCode || "");
    }

    // Financial fields (contractValue, projectBudget, actualCost, remainingBudget)
    // 1. Group by currency first to avoid cross-currency numerical comparison
    const currCmp = a.currency.localeCompare(b.currency);
    if (currCmp !== 0) {
      return currCmp;
    }

    // 2. Inside same currency group, compare numeric values
    let valA: number | null | undefined;
    let valB: number | null | undefined;

    if (sortField === "contractValue") {
      valA = a.contractValue;
      valB = b.contractValue;
    } else if (sortField === "projectBudget") {
      valA = a.approvedCostBudget;
      valB = b.approvedCostBudget;
    } else if (sortField === "actualCost") {
      valA = a.actualCost;
      valB = b.actualCost;
    } else if (sortField === "remainingBudget") {
      valA = a.remainingBudget;
      valB = b.remainingBudget;
    }

    const aValid = valA !== null && valA !== undefined && Number.isFinite(Number(valA));
    const bValid = valB !== null && valB !== undefined && Number.isFinite(Number(valB));

    if (!aValid && !bValid) {
      return (a.project.projectCode || "").localeCompare(b.project.projectCode || "");
    }
    if (!aValid) return 1; // unavailable goes to end
    if (!bValid) return -1; // unavailable goes to end

    const diff = Number(valA) - Number(valB);
    if (diff !== 0) {
      return sortDirection === "desc" ? -diff : diff;
    }

    return (a.project.projectCode || "").localeCompare(b.project.projectCode || "");
  });
}
