import type {
  Expense,
  Project,
  ProjectCostCode,
  ProjectCostSummary,
  ProjectStatus,
  PurchaseOrder,
  Subcontract,
  SubcontractProgressClaim,
  SubcontractVariation,
} from "../types.ts";
import {
  calculateProjectCost,
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
  type ProjectFinancialMetric,
  type ProjectFinancialMetricStatus,
} from "./projectFinancialSummary.ts";
import type { ProjectLaborCostAggregate, ProjectLaborSource } from "./projectLaborCostAggregate.ts";
import { calculateClientBillingSummary, type ClientBilling } from "../lib/clientBilling.ts";
import { calculateClientCollectionSummary, type ClientCollection } from "../lib/clientCollections.ts";

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
  tab?: "overview" | "budget" | "invoices" | "payroll" | "expenses" | "reports" | "procurement";
}

export interface ProjectCommitmentBreakdown {
  purchaseOrders: ProjectFinancialMetric;
  subcontracts: ProjectFinancialMetric;
  reconcilesToCommittedCost: boolean;
  reason?: string;
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
  committedCost: number;
  pendingCostExposure: number;
  remainingBudget: number | null; // null if partial/mixed currency or unavailable
  availableAfterCommitments: number | null; // null if partial/mixed currency or unavailable
  variance: number | null; // budget - actual (null if partial/mixed currency)
  outstandingPayables: number;

  // Work Package / Budget Control Context
  allocatedCostCodeBudget: number;
  unallocatedBudget: number;
  codedActualCost: number | null; // null if authoritative P1B source inputs are unavailable
  uncodedActualCost: number | null; // null if authoritative P1B source inputs are unavailable
  costClassificationAvailable: boolean; // true only when authoritative transaction-level sources were evaluated
  activeCostCodesCount: number;
  overBudgetCostCodeCount: number | null; // null when code-level actuals are unavailable or non-combinable
  actualCostCompositionReconciles: boolean;
  forecastFinalCost: number | null; // null if incomplete/partial forecast
  forecastVariance: number | null; // null if incomplete/partial forecast
  hasExplicitForecast: boolean; // true ONLY when every active cost code has a numeric forecast
  commitmentBreakdown: ProjectCommitmentBreakdown;

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
  purchaseOrders?: PurchaseOrder[];
  subcontracts?: Subcontract[];
  subcontractClaims?: SubcontractProgressClaim[];
  subcontractVariations?: SubcontractVariation[];
  projectLaborAggregates?: readonly ProjectLaborCostAggregate[];
  laborSource?: ProjectLaborSource;
  costInput?: ProjectCostInput;
  financialDataComplete?: boolean;
  clientBillings?: readonly ClientBilling[];
  clientCollections?: readonly ClientCollection[];
}

function unavailableMetric(reason: string): ProjectFinancialMetric {
  return { status: "unavailable", reason };
}

function commitmentMetric(
  amount: number,
  currency: string,
  foreignAmounts: Record<string, number>,
  sourceLabel: string,
): ProjectFinancialMetric {
  const hasForeignAmounts = Object.entries(foreignAmounts).some(([, value]) => roundMoney(value) !== 0);
  if (hasForeignAmounts) {
    return {
      status: "partial",
      amount: roundMoney(amount),
      currency,
      foreignAmounts,
      reason: `${sourceLabel} includes unconverted foreign-currency commitments; the ${currency} amount is only a partial base-currency view.`,
    };
  }
  return { status: "available", amount: roundMoney(amount), currency };
}

function buildProjectCommitmentBreakdown(
  project: Project,
  committedCost: number,
  currency: string,
  options?: BuildProjectManagementViewOptions,
): ProjectCommitmentBreakdown {
  const costInput = options?.costInput;
  const purchaseOrders = options?.purchaseOrders ?? costInput?.purchaseOrders;
  const subcontracts = options?.subcontracts ?? costInput?.subcontracts;
  const subcontractClaims = options?.subcontractClaims ?? costInput?.subcontractClaims;
  const subcontractVariations = options?.subcontractVariations ?? costInput?.subcontractVariations;

  if (purchaseOrders === undefined || subcontracts === undefined) {
    const reason = "Purchase order and subcontract source data was not supplied to this view; only the authoritative Committed Cost aggregate is shown.";
    return {
      purchaseOrders: unavailableMetric(reason),
      subcontracts: unavailableMetric(reason),
      reconcilesToCommittedCost: false,
      reason,
    };
  }

  // Reuse the canonical project-cost calculator over disjoint source sets.
  // This keeps PO and subcontract categories aligned with the aggregate's
  // lifecycle, claim, variation, and currency semantics without rebuilding
  // commitment math in the dashboard layer.
  const purchaseOrderSummary = calculateProjectCost(project, {
    purchaseOrders,
    baseCurrency: currency,
  });
  const subcontractSummary = calculateProjectCost(project, {
    subcontracts,
    subcontractClaims,
    subcontractVariations,
    baseCurrency: currency,
  });
  const purchaseOrderAmount = roundMoney(purchaseOrderSummary.committedCost);
  const subcontractAmount = roundMoney(subcontractSummary.committedCost);
  const reconcilesToCommittedCost = Math.abs(roundMoney(purchaseOrderAmount + subcontractAmount) - roundMoney(committedCost)) <= 0.01;

  if (!reconcilesToCommittedCost) {
    const reason = "Source-level commitment categories do not reconcile to the authoritative Committed Cost aggregate; category detail is withheld.";
    return {
      purchaseOrders: unavailableMetric(reason),
      subcontracts: unavailableMetric(reason),
      reconcilesToCommittedCost: false,
      reason,
    };
  }

  return {
    purchaseOrders: commitmentMetric(purchaseOrderAmount, currency, purchaseOrderSummary.foreignCosts || {}, "Purchase order commitments"),
    subcontracts: commitmentMetric(subcontractAmount, currency, subcontractSummary.foreignCosts || {}, "Subcontract commitments"),
    reconcilesToCommittedCost: true,
  };
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
  const billingSummary = options?.clientBillings === undefined
    ? undefined
    : calculateClientBillingSummary(project, options.clientBillings);
  const collectionSummary = options?.clientBillings === undefined || options?.clientCollections === undefined
    ? undefined
    : calculateClientCollectionSummary(project, options.clientBillings, options.clientCollections);
  const financialTruth = buildProjectFinancialTruth(project, summary, billingSummary, collectionSummary, {
    costDataComplete: financialDataComplete,
  });
  const foreignCosts = summary.foreignCosts || {};
  const hasForeignAmounts = Object.entries(foreignCosts).some(([, val]) => roundMoney(val) !== 0);
  const isPartial = !financialDataComplete || financialTruth.actualCost.status === "partial" || hasForeignAmounts;

  const actualCost = roundMoney(summary.totalActualCost || 0);
  const committedCost = roundMoney(summary.committedCost || 0);
  const pendingCostExposure = roundMoney(
    (summary.pendingInvoiceCost || 0) +
    (summary.pendingPayrollCost || 0) +
    (summary.pendingExpenseCost || 0),
  );
  const outstandingPayables = roundMoney(summary.unpaidInvoiceCost || 0);
  const actualCostCompositionReconciles = Math.abs(roundMoney(
    (summary.invoiceCost || 0) + (summary.payrollCost || 0) + (summary.otherExpenseCost || 0),
  ) - actualCost) <= 0.01;

  const remainingBudget = isPartial ? null : roundMoney(budget - actualCost);
  const availableAfterCommitments = isPartial
    ? null
    : roundMoney(budget - actualCost - committedCost - pendingCostExposure);
  const variance = isPartial ? null : roundMoney(budget - actualCost);

  const confirmedUtilization = budget > 0 ? roundMoney((actualCost / budget) * 100) : 0;
  const commitmentUtilization = budget > 0
    ? roundMoney(((actualCost + committedCost + pendingCostExposure) / budget) * 100)
    : 0;

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
  let overBudgetCostCodeCount: number | null = null;
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
    options?.purchaseOrders !== undefined ||
    options?.subcontracts !== undefined ||
    options?.projectLaborAggregates !== undefined,
  );

  if (hasAuthoritativeSourceInputs && options?.costCodes && options.costCodes.length > 0) {
    const input: ProjectCostInput = options.costInput || {
      invoices: options.invoices,
      expenses: options.expenses,
      payroll: options.payroll,
      purchaseOrders: options.purchaseOrders,
      subcontracts: options.subcontracts,
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

  if (costClassificationAvailable && !hasForeignAmounts) {
    overBudgetCostCodeCount = budgetControlSummary
      ? budgetControlSummary.costCodes.filter((code) => code.status === "ACTIVE" && code.actualCost > code.budgetAmount).length
      : 0;
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

  if (costClassificationAvailable && !hasForeignAmounts && activeCostCodesCount > 0 && uncodedActualCost !== null && uncodedActualCost > 0) {
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

  const commitmentBreakdown = buildProjectCommitmentBreakdown(project, committedCost, currency, options);

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
    committedCost,
    pendingCostExposure,
    remainingBudget,
    availableAfterCommitments,
    variance,
    outstandingPayables,
    allocatedCostCodeBudget,
    unallocatedBudget,
    codedActualCost,
    uncodedActualCost,
    costClassificationAvailable,
    activeCostCodesCount,
    overBudgetCostCodeCount,
    actualCostCompositionReconciles,
    forecastFinalCost,
    forecastVariance,
    hasExplicitForecast,
    commitmentBreakdown,
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
  totalCommittedCost: number;
  totalBilled: number;
  totalCollected: number;
  totalOutstandingReceivables: number;
  totalRemainingToBill: number;
  totalRemainingBudget: number;
  totalPendingExposure: number;
  totalOutstandingPayables: number;
  isComplete: boolean;
  contractValueComplete: boolean;
  financialMetrics: PortfolioFinancialMetrics;
}

export interface PortfolioMetricAggregate {
  status: ProjectFinancialMetricStatus;
  amount?: number;
  projectCount: number;
  includedProjectCount: number;
  availableProjectCount: number;
  partialProjectCount: number;
  unavailableProjectCount: number;
}

export interface PortfolioFinancialMetrics {
  contractValue: PortfolioMetricAggregate;
  approvedCostBudget: PortfolioMetricAggregate;
  actualCost: PortfolioMetricAggregate;
  committedCost: PortfolioMetricAggregate;
  billed: PortfolioMetricAggregate;
  collected: PortfolioMetricAggregate;
  outstandingReceivables: PortfolioMetricAggregate;
  remainingToBill: PortfolioMetricAggregate;
  remainingBudget: PortfolioMetricAggregate;
  pendingCostExposure: PortfolioMetricAggregate;
  outstandingPayables: PortfolioMetricAggregate;
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

function aggregatePortfolioMetric(
  views: readonly ProjectManagementView[],
  select: (truth: ProjectFinancialTruth) => ProjectFinancialMetric,
): PortfolioMetricAggregate {
  let amount = 0;
  let includedProjectCount = 0;
  let availableProjectCount = 0;
  let partialProjectCount = 0;
  let unavailableProjectCount = 0;

  for (const view of views) {
    const metric = select(view.financialTruth);
    if (metric.status === "available") {
      if (metric.amount === undefined || !Number.isFinite(Number(metric.amount))) {
        unavailableProjectCount += 1;
        continue;
      }
      amount = roundMoney(amount + Number(metric.amount));
      includedProjectCount += 1;
      availableProjectCount += 1;
      continue;
    }

    if (metric.status === "partial") {
      partialProjectCount += 1;
      if (metric.amount !== undefined && Number.isFinite(Number(metric.amount))) {
        amount = roundMoney(amount + Number(metric.amount));
        includedProjectCount += 1;
      }
      continue;
    }

    unavailableProjectCount += 1;
  }

  const status: ProjectFinancialMetricStatus = includedProjectCount === 0
    ? "unavailable"
    : partialProjectCount > 0 || unavailableProjectCount > 0
      ? "partial"
      : "available";

  return {
    status,
    ...(includedProjectCount > 0 ? { amount } : {}),
    projectCount: views.length,
    includedProjectCount,
    availableProjectCount,
    partialProjectCount,
    unavailableProjectCount,
  };
}

function buildPortfolioFinancialMetrics(views: readonly ProjectManagementView[]): PortfolioFinancialMetrics {
  return {
    contractValue: aggregatePortfolioMetric(views, (truth) => truth.contractValue),
    approvedCostBudget: aggregatePortfolioMetric(views, (truth) => truth.approvedCostBudget),
    actualCost: aggregatePortfolioMetric(views, (truth) => truth.actualCost),
    committedCost: aggregatePortfolioMetric(views, (truth) => truth.committedCost),
    billed: aggregatePortfolioMetric(views, (truth) => truth.billed),
    collected: aggregatePortfolioMetric(views, (truth) => truth.collected),
    outstandingReceivables: aggregatePortfolioMetric(views, (truth) => truth.outstandingReceivables),
    remainingToBill: aggregatePortfolioMetric(views, (truth) => truth.remainingToBill),
    remainingBudget: aggregatePortfolioMetric(views, (truth) => truth.remainingBudget),
    pendingCostExposure: aggregatePortfolioMetric(views, (truth) => truth.pendingCostExposure),
    outstandingPayables: aggregatePortfolioMetric(views, (truth) => truth.outstandingPayables),
  };
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

  const viewsByCurrency: Record<string, ProjectManagementView[]> = {};

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
    if ((metricAmount(view.financialTruth.pendingCostExposure) || 0) > 0) projectsWithPendingExposureCount += 1;
    if (view.hasForeignAmounts) projectsWithMixedCurrencyCount += 1;
    if (view.attentionFlags.some((f) => f.flag === "INVOICES_AWAITING_REVIEW")) {
      projectsWithInvoicesAwaitingReviewCount += 1;
    }

    const curr = view.currency;
    viewsByCurrency[curr] = [...(viewsByCurrency[curr] || []), view];
  }

  const currencyGroups: Record<string, PortfolioCurrencyGroup> = Object.fromEntries(
    Object.entries(viewsByCurrency).map(([currency, currencyViews]) => {
      const financialMetrics = buildPortfolioFinancialMetrics(currencyViews);
      return [currency, {
        currency,
        projectCount: currencyViews.length,
        totalContractValue: financialMetrics.contractValue.amount || 0,
        totalApprovedBudget: financialMetrics.approvedCostBudget.amount || 0,
        totalActualCost: financialMetrics.actualCost.amount || 0,
        totalCommittedCost: financialMetrics.committedCost.amount || 0,
        totalBilled: financialMetrics.billed.amount || 0,
        totalCollected: financialMetrics.collected.amount || 0,
        totalOutstandingReceivables: financialMetrics.outstandingReceivables.amount || 0,
        totalRemainingToBill: financialMetrics.remainingToBill.amount || 0,
        totalRemainingBudget: financialMetrics.remainingBudget.amount || 0,
        totalPendingExposure: financialMetrics.pendingCostExposure.amount || 0,
        totalOutstandingPayables: financialMetrics.outstandingPayables.amount || 0,
        isComplete: Object.values(financialMetrics).every((metric) => metric.status === "available"),
        contractValueComplete: financialMetrics.contractValue.status === "available",
        financialMetrics,
      } satisfies PortfolioCurrencyGroup];
    }),
  );

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
  | "committedCost"
  | "billed"
  | "collected"
  | "outstandingReceivables"
  | "remainingToBill"
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
  managerFilter?: string;
  currencyFilter?: string;
  healthFilter?: ProjectHealthFilter;
  sortField?: ProjectSortField;
  sortDirection?: ProjectSortDirection;
}

function metricAmount(metric: ProjectFinancialMetric): number | null {
  return metric.status === "unavailable" || metric.amount === undefined || !Number.isFinite(Number(metric.amount))
    ? null
    : Number(metric.amount);
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
  const managerFilter = (options.managerFilter || "ALL").trim().toLowerCase();
  const currencyFilter = (options.currencyFilter || "ALL").trim().toUpperCase();
  const healthFilter = options.healthFilter || "ALL";
  const sortField = options.sortField || "code";
  const sortDirection = options.sortDirection || "asc";

  // 1. Filter
  const filtered = views.filter((view) => {
    // Status filter
    if (statusFilter !== "ALL" && view.project.status !== statusFilter) {
      return false;
    }

    if (managerFilter !== "all" && (view.project.projectManager || "").trim().toLowerCase() !== managerFilter) {
      return false;
    }

    if (currencyFilter !== "ALL" && view.currency !== currencyFilter) {
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
      if (healthFilter === "PENDING_EXPOSURE" && (metricAmount(view.financialTruth.pendingCostExposure) || 0) <= 0) return false;
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

    // Financial fields are grouped by currency before numeric comparison.
    // 1. Group by currency first to avoid cross-currency numerical comparison
    const currCmp = a.currency.localeCompare(b.currency);
    if (currCmp !== 0) {
      return currCmp;
    }

    // 2. Inside same currency group, compare numeric values
    let valA: number | null | undefined;
    let valB: number | null | undefined;

    if (sortField === "contractValue") {
      valA = metricAmount(a.financialTruth.contractValue);
      valB = metricAmount(b.financialTruth.contractValue);
    } else if (sortField === "projectBudget") {
      valA = metricAmount(a.financialTruth.approvedCostBudget);
      valB = metricAmount(b.financialTruth.approvedCostBudget);
    } else if (sortField === "actualCost") {
      valA = metricAmount(a.financialTruth.actualCost);
      valB = metricAmount(b.financialTruth.actualCost);
    } else if (sortField === "committedCost") {
      valA = metricAmount(a.financialTruth.committedCost);
      valB = metricAmount(b.financialTruth.committedCost);
    } else if (sortField === "billed") {
      valA = metricAmount(a.financialTruth.billed);
      valB = metricAmount(b.financialTruth.billed);
    } else if (sortField === "collected") {
      valA = metricAmount(a.financialTruth.collected);
      valB = metricAmount(b.financialTruth.collected);
    } else if (sortField === "outstandingReceivables") {
      valA = metricAmount(a.financialTruth.outstandingReceivables);
      valB = metricAmount(b.financialTruth.outstandingReceivables);
    } else if (sortField === "remainingToBill") {
      valA = metricAmount(a.financialTruth.remainingToBill);
      valB = metricAmount(b.financialTruth.remainingToBill);
    } else if (sortField === "remainingBudget") {
      valA = metricAmount(a.financialTruth.remainingBudget);
      valB = metricAmount(b.financialTruth.remainingBudget);
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
