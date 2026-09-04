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
  | "CONTROL_CAPACITY_EXCEEDED"
  | "UNCODED_COST"
  | "UNALLOCATED_BUDGET"
  | "FORECAST_OVER_BUDGET"
  | "FORECAST_NOT_SET"
  | "MIXED_CURRENCY"
  | "PARTIAL_DATA"
  | "INVOICES_AWAITING_REVIEW"
  | "PENDING_EXPOSURE"
  | "OUTSTANDING_RECEIVABLE"
  | "PROJECT_END_PASSED"
  | "SUBCONTRACT_CLAIM_AWAITING_APPROVAL"
  | "OVERDUE_RFI"
  | "OPEN_RFI"
  | "OVERDUE_SUBMITTAL"
  | "SUBMITTALS_AWAITING_REVIEW"
  | "UNRESOLVED_SAFETY_EVENT"
  | "UNRESOLVED_FIELD_ISSUE"
  | "EQUIPMENT_OUT_OF_SERVICE"
  | "MATERIAL_RECONCILIATION_GAP";

export type ProjectAttentionCategory =
  | "financial"
  | "commercial"
  | "schedule"
  | "procurement"
  | "engineering"
  | "data-quality"
  | "field-operations";

export type ProjectAttentionSeverity = "critical" | "warning" | "info";

export interface ProjectAttentionMetric {
  label: string;
  value: number | string;
  currency?: string;
  status?: ProjectFinancialMetricStatus;
}

export interface ProjectAttentionRfiRecord {
  id: string;
  projectId: string;
  rfiNumber: string;
  subject?: string;
  status: string;
  dueDate?: string | null;
}

export interface ProjectAttentionSubmittalRecord {
  id: string;
  projectId: string;
  submittalNumber: string;
  title?: string;
  status: string;
  dueReviewDate?: string | null;
}

export interface ProjectAttentionEngineeringInput {
  rfis?: readonly ProjectAttentionRfiRecord[];
  submittals?: readonly ProjectAttentionSubmittalRecord[];
}

export interface ProjectAttentionFieldSiteLogRecord {
  id: string;
  projectId: string;
  siteDate: string;
  status: string;
}

export interface ProjectAttentionFieldSafetyRecord {
  id: string;
  siteLogId: string;
  severity: string;
  isResolved: boolean;
  description: string;
}

export interface ProjectAttentionFieldIssueRecord {
  id: string;
  siteLogId: string;
  severity: string;
  status: string;
  description: string;
}

export interface ProjectAttentionFieldEquipmentRecord {
  id: string;
  projectId: string;
  equipmentName: string;
  status: string;
  updatedAt?: string;
}

export interface ProjectAttentionMaterialDiscrepancyRecord {
  id: string;
  materialName: string;
  observedQuantity: number;
  formalReceivedQuantity: number;
  unit: string;
  latestDate?: string;
}

export interface ProjectAttentionFieldOperationsInput {
  siteLogs?: readonly ProjectAttentionFieldSiteLogRecord[];
  safety?: readonly ProjectAttentionFieldSafetyRecord[];
  issues?: readonly ProjectAttentionFieldIssueRecord[];
  equipment?: readonly ProjectAttentionFieldEquipmentRecord[];
  materialDiscrepancies?: readonly ProjectAttentionMaterialDiscrepancyRecord[];
}

export interface ProjectAttentionSignal {
  id: string;
  projectId: string;
  flag: ProjectAttentionFlag;
  category: ProjectAttentionCategory;
  severity: ProjectAttentionSeverity;
  source: string;
  evidence: string;
  title: string;
  explanation: string;
  label: string;
  detail: string;
  tone: "danger" | "warning" | "info" | "neutral";
  metric?: ProjectAttentionMetric;
  date?: string;
  tab?: "overview" | "budget" | "billing" | "invoices" | "payroll" | "expenses" | "reports" | "procurement" | "documents" | "rfis" | "submittals" | "site-logs" | "materials-equipment";
}

/** Backwards-compatible name used by existing Project Overview consumers. */
export type ProjectAttentionItem = ProjectAttentionSignal;

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
  /** Canonical P3A-3 name; attentionFlags remains a compatibility alias. */
  attentionSignals: ProjectAttentionSignal[];

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
  /** Explicit date boundary for deterministic demo and browser evidence. */
  today?: string;
  /** Selected-project engineering records already authorized by the caller. */
  engineering?: ProjectAttentionEngineeringInput;
  /** Selected-project field records already authorized by the caller. */
  fieldOperations?: ProjectAttentionFieldOperationsInput;
}

function makeAttentionSignal(input: Omit<ProjectAttentionSignal, "title" | "explanation" | "evidence"> & { evidence?: string; title?: string; explanation?: string }): ProjectAttentionSignal {
  return {
    ...input,
    title: input.title || input.label,
    explanation: input.explanation || input.detail,
    evidence: input.evidence || input.detail,
  };
}

function attentionSeverityRank(signal: ProjectAttentionSignal | undefined): number {
  if (!signal) return 0;
  return signal.severity === "critical" ? 3 : signal.severity === "warning" ? 2 : 1;
}

export function projectAttentionSeverityRank(signal: ProjectAttentionSignal | undefined): number {
  return attentionSeverityRank(signal);
}

export function topProjectAttentionSignal(view: Pick<ProjectManagementView, "attentionFlags">): ProjectAttentionSignal | undefined {
  return [...view.attentionFlags].sort((left, right) => {
    const severity = attentionSeverityRank(right) - attentionSeverityRank(left);
    if (severity !== 0) return severity;
    return left.id.localeCompare(right.id);
  })[0];
}

function canSurfaceCurrentAttention(project: Pick<Project, "status">): boolean {
  return !["COMPLETED", "CANCELLED", "ARCHIVED"].includes(project.status);
}

export function buildProjectEngineeringAttentionSignals(
  project: Pick<Project, "id">,
  engineering: ProjectAttentionEngineeringInput | undefined,
  today = new Date().toISOString().slice(0, 10),
): ProjectAttentionSignal[] {
  if (!engineering) return [];
  const signals: ProjectAttentionSignal[] = [];
  const projectRfis = (engineering.rfis || []).filter((rfi) => rfi.projectId === project.id && rfi.status !== "VOID");
  const openRfis = projectRfis.filter((rfi) => rfi.status === "OPEN");
  const overdueRfis = openRfis.filter((rfi) => Boolean(rfi.dueDate && rfi.dueDate < today));
  for (const rfi of overdueRfis) {
    const dueDate = rfi.dueDate || "unknown date";
    const detail = `${rfi.rfiNumber} required response on ${dueDate} and remains OPEN.`;
    signals.push(makeAttentionSignal({
      id: `overdue-rfi:${rfi.id}`,
      projectId: project.id,
      flag: "OVERDUE_RFI",
      category: "engineering",
      severity: "critical",
      source: "Engineering RFI register",
      label: "RFI response overdue",
      detail,
      evidence: detail,
      date: dueDate,
      tab: "rfis",
      tone: "danger",
    }));
  }
  if (openRfis.length > 0) {
    const detail = `${openRfis.length} open RFI${openRfis.length === 1 ? "" : "s"} require coordination; open status alone is not treated as overdue.`;
    signals.push(makeAttentionSignal({
      id: "open-rfis",
      projectId: project.id,
      flag: "OPEN_RFI",
      category: "engineering",
      severity: "info",
      source: "Engineering RFI register",
      label: "Open engineering RFIs",
      detail,
      evidence: detail,
      metric: { label: "Open RFIs", value: openRfis.length },
      tab: "rfis",
      tone: "info",
    }));
  }

  const projectSubmittals = (engineering.submittals || []).filter((submittal) => submittal.projectId === project.id && submittal.status !== "VOID");
  const awaitingReview = projectSubmittals.filter((submittal) => submittal.status === "SUBMITTED" || submittal.status === "UNDER_REVIEW");
  const overdueSubmittals = awaitingReview.filter((submittal) => Boolean(submittal.dueReviewDate && submittal.dueReviewDate < today));
  for (const submittal of overdueSubmittals) {
    const dueDate = submittal.dueReviewDate || "unknown date";
    const detail = `${submittal.submittalNumber} required review on ${dueDate} and remains ${submittal.status}.`;
    signals.push(makeAttentionSignal({
      id: `overdue-submittal:${submittal.id}`,
      projectId: project.id,
      flag: "OVERDUE_SUBMITTAL",
      category: "engineering",
      severity: "critical",
      source: "Engineering Submittal register",
      label: "Submittal response overdue",
      detail,
      evidence: detail,
      date: dueDate,
      tab: "submittals",
      tone: "danger",
    }));
  }
  if (awaitingReview.length > 0) {
    const detail = `${awaitingReview.length} submittal${awaitingReview.length === 1 ? "" : "s"} await formal review; an open review state is not treated as overdue without an explicit due date.`;
    signals.push(makeAttentionSignal({
      id: "submittals-awaiting-review",
      projectId: project.id,
      flag: "SUBMITTALS_AWAITING_REVIEW",
      category: "engineering",
      severity: "warning",
      source: "Engineering Submittal register",
      label: "Submittals awaiting review",
      detail,
      evidence: detail,
      metric: { label: "Awaiting review", value: awaitingReview.length },
      tab: "submittals",
      tone: "warning",
    }));
  }
  return signals;
}

/**
 * Builds attention only from explicit field-operation facts. Missing site-log
 * data produces no signal; it is never interpreted as a missed report.
 */
export function buildProjectFieldOperationsAttentionSignals(
  project: Pick<Project, "id">,
  fieldOperations: ProjectAttentionFieldOperationsInput | undefined,
): ProjectAttentionSignal[] {
  if (!fieldOperations) return [];
  const validLogDates = new Map(
    (fieldOperations.siteLogs || [])
      .filter((log) => log.projectId === project.id && ["SUBMITTED", "FINALIZED"].includes(log.status))
      .map((log) => [log.id, log.siteDate]),
  );
  const signals: ProjectAttentionSignal[] = [];
  const severityFor = (value: string): ProjectAttentionSeverity => value === "CRITICAL" ? "critical" : "warning";

  for (const safety of (fieldOperations.safety || []).filter((row) => !row.isResolved && ["HIGH", "CRITICAL"].includes(row.severity) && validLogDates.has(row.siteLogId))) {
    const date = validLogDates.get(safety.siteLogId);
    const detail = `${safety.severity} safety observation remains unresolved: ${safety.description}`;
    signals.push(makeAttentionSignal({
      id: `field-safety:${safety.id}`,
      projectId: project.id,
      flag: "UNRESOLVED_SAFETY_EVENT",
      category: "field-operations",
      severity: severityFor(safety.severity),
      source: "Daily Site Log safety observations",
      label: "Unresolved serious safety observation",
      detail,
      evidence: detail,
      date,
      tone: "danger",
      tab: "site-logs",
    }));
  }

  for (const issue of (fieldOperations.issues || []).filter((row) => row.status !== "RESOLVED" && ["HIGH", "CRITICAL"].includes(row.severity) && validLogDates.has(row.siteLogId))) {
    const date = validLogDates.get(issue.siteLogId);
    const detail = `${issue.severity} ${issue.status.toLowerCase().replaceAll("_", " ")} field issue remains open: ${issue.description}`;
    signals.push(makeAttentionSignal({
      id: `field-issue:${issue.id}`,
      projectId: project.id,
      flag: "UNRESOLVED_FIELD_ISSUE",
      category: "field-operations",
      severity: severityFor(issue.severity),
      source: "Daily Site Log operational issues",
      label: "Unresolved serious field issue",
      detail,
      evidence: detail,
      date,
      tone: "danger",
      tab: "site-logs",
    }));
  }

  for (const equipment of (fieldOperations.equipment || []).filter((item) => item.projectId === project.id && item.status === "OUT_OF_SERVICE")) {
    const detail = `${equipment.equipmentName} is explicitly marked OUT OF SERVICE in the project Equipment Register.`;
    signals.push(makeAttentionSignal({
      id: `equipment-out-of-service:${equipment.id}`,
      projectId: project.id,
      flag: "EQUIPMENT_OUT_OF_SERVICE",
      category: "field-operations",
      severity: "warning",
      source: "Project Equipment Register",
      label: "Equipment out of service",
      detail,
      evidence: detail,
      date: equipment.updatedAt?.slice(0, 10),
      tone: "warning",
      tab: "materials-equipment",
    }));
  }

  for (const discrepancy of fieldOperations.materialDiscrepancies || []) {
    const detail = `${discrepancy.materialName}: ${discrepancy.observedQuantity} ${discrepancy.unit} observed in valid Site Logs versus ${discrepancy.formalReceivedQuantity} ${discrepancy.unit} formally received.`;
    signals.push(makeAttentionSignal({
      id: discrepancy.id,
      projectId: project.id,
      flag: "MATERIAL_RECONCILIATION_GAP",
      category: "field-operations",
      severity: "warning",
      source: "Materials Register, PO receipts, and Daily Site Logs",
      label: "Material evidence needs reconciliation",
      detail,
      evidence: detail,
      date: discrepancy.latestDate,
      tone: "warning",
      tab: "materials-equipment",
    }));
  }
  return signals;
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

  // Attention Signals
  const attentionFlags: ProjectAttentionItem[] = [];
  const canSurfaceAttention = canSurfaceCurrentAttention(project);
  const today = options?.today?.slice(0, 10) || new Date().toISOString().slice(0, 10);

  const addSignal = (input: Omit<ProjectAttentionSignal, "projectId" | "title" | "explanation" | "evidence"> & { evidence?: string; title?: string; explanation?: string }) => {
    if (canSurfaceAttention) attentionFlags.push(makeAttentionSignal({ ...input, projectId: project.id }));
  };

  if (!financialDataComplete) {
    addSignal({
      id: "partial-data",
      flag: "PARTIAL_DATA",
      category: "data-quality",
      severity: "warning",
      source: "Project cost completeness",
      label: "Financial data incomplete",
      detail: "One or more project cost sources are withheld or inaccessible for this role.",
      evidence: "One or more project cost sources are withheld or inaccessible for this role.",
      tone: "warning",
      tab: "overview",
    });
  }

  if (hasForeignAmounts) {
    addSignal({
      id: "mixed-currency",
      flag: "MIXED_CURRENCY",
      category: "data-quality",
      severity: "warning",
      source: "Project cost currency classification",
      label: "Mixed currencies",
      detail: `Unconverted foreign-currency sources are present: ${Object.entries(foreignCosts).map(([c, v]) => `${c} ${Number(v).toFixed(2)}`).join(", ")}.`,
      evidence: `Unconverted foreign-currency sources are present: ${Object.entries(foreignCosts).map(([c, v]) => `${c} ${Number(v).toFixed(2)}`).join(", ")}.`,
      tone: "warning",
      tab: "overview",
    });
  }

  // OVER_BUDGET and NEAR_BUDGET must only fire on complete, authoritative cost data
  if (!isPartial && budget > 0) {
    if (actualCost > budget) {
      addSignal({
        id: "over-budget",
        flag: "OVER_BUDGET",
        category: "financial",
        severity: "critical",
        source: "Project Financial Control",
        label: "Over budget",
        detail: `Actual Cost is ${actualCost.toFixed(2)} ${currency} against an Approved Cost Budget of ${budget.toFixed(2)} ${currency}.`,
        evidence: `Actual Cost is ${actualCost.toFixed(2)} ${currency} against an Approved Cost Budget of ${budget.toFixed(2)} ${currency}.`,
        metric: { label: "Actual Cost", value: actualCost, currency, status: financialTruth.actualCost.status },
        tone: "danger",
        tab: "budget",
      });
    } else if (confirmedUtilization >= PROJECT_HEALTH_THRESHOLD_PERCENT && actualCost <= budget) {
      addSignal({
        id: "near-budget",
        flag: "NEAR_BUDGET",
        category: "financial",
        severity: "warning",
        source: "Project Financial Control",
        label: "Near budget limit",
        detail: `Actual cost has reached ${confirmedUtilization.toFixed(1)}% of approved budget.`,
        evidence: `Actual Cost is ${actualCost.toFixed(2)} ${currency} against an Approved Cost Budget of ${budget.toFixed(2)} ${currency}.`,
        metric: { label: "Budget utilization", value: `${confirmedUtilization.toFixed(1)}%` },
        tone: "warning",
        tab: "budget",
      });
    }
  }

  if (availableAfterCommitments !== null && availableAfterCommitments < 0) {
    addSignal({
      id: "control-capacity-exceeded",
      flag: "CONTROL_CAPACITY_EXCEEDED",
      category: "financial",
      severity: "critical",
      source: "Project Financial Control",
      label: "Control capacity exceeded",
      detail: `Actual Cost, Committed Cost, and Pending Exposure exceed the Approved Cost Budget by ${Math.abs(availableAfterCommitments).toFixed(2)} ${currency}.`,
      evidence: `${actualCost.toFixed(2)} actual + ${committedCost.toFixed(2)} committed + ${pendingCostExposure.toFixed(2)} pending > ${budget.toFixed(2)} approved budget.`,
      metric: { label: "Available after commitments / exposure", value: availableAfterCommitments, currency, status: "available" },
      tone: "danger",
      tab: "budget",
    });
  }

  if (financialTruth.pendingCostExposure.status !== "unavailable" && pendingCostExposure > 0) {
    addSignal({
      id: "pending-exposure",
      flag: "PENDING_EXPOSURE",
      category: "financial",
      severity: "info",
      source: "Project cost summary",
      label: "Pending cost exposure",
      detail: `Unconfirmed exposure of ${pendingCostExposure.toFixed(2)} ${currency} is awaiting review or approval.`,
      evidence: `Pending invoice, payroll, or expense sources total ${pendingCostExposure.toFixed(2)} ${currency}.`,
      metric: { label: "Pending exposure", value: pendingCostExposure, currency, status: financialTruth.pendingCostExposure.status },
      tone: "info",
      tab: "overview",
    });
  }

  if (costClassificationAvailable && !hasForeignAmounts && activeCostCodesCount > 0 && uncodedActualCost !== null && uncodedActualCost > 0) {
    addSignal({
      id: "uncoded-cost",
      flag: "UNCODED_COST",
      category: "financial",
      severity: "warning",
      source: "Work package budget control",
      label: "Uncoded actual cost",
      detail: `${uncodedActualCost.toFixed(2)} ${currency} of actual cost is not assigned to any work package cost code.`,
      evidence: `${uncodedActualCost.toFixed(2)} ${currency} of actual cost is not assigned to any work package cost code.`,
      metric: { label: "Uncoded actual cost", value: uncodedActualCost, currency, status: "available" },
      tone: "warning",
      tab: "budget",
    });
  }

  if (activeCostCodesCount > 0 && unallocatedBudget > 0) {
    addSignal({
      id: "unallocated-budget",
      flag: "UNALLOCATED_BUDGET",
      category: "financial",
      severity: "info",
      source: "Work package budget control",
      label: "Unallocated budget",
      detail: `${unallocatedBudget.toFixed(2)} ${currency} of approved budget has not been allocated to work packages.`,
      evidence: `${unallocatedBudget.toFixed(2)} ${currency} of approved budget has not been allocated to work packages.`,
      metric: { label: "Unallocated budget", value: unallocatedBudget, currency, status: "available" },
      tone: "info",
      tab: "budget",
    });
  }

  if (activeCostCodesCount > 0 && !hasExplicitForecast) {
    addSignal({
      id: "forecast-not-set",
      flag: "FORECAST_NOT_SET",
      category: "financial",
      severity: "info",
      source: "Work package budget control",
      label: "Forecast not set",
      detail: "One or more active work package cost codes lack an explicit forecast amount.",
      evidence: "One or more active work package cost codes lack an explicit forecast amount.",
      tone: "info",
      tab: "budget",
    });
  }

  if (hasExplicitForecast && forecastVariance !== null && forecastVariance < 0) {
    addSignal({
      id: "forecast-over-budget",
      flag: "FORECAST_OVER_BUDGET",
      category: "financial",
      severity: "critical",
      source: "Work package budget control",
      label: "Forecast over budget",
      detail: `Forecast cost (${(forecastFinalCost || 0).toFixed(2)} ${currency}) exceeds approved budget by ${Math.abs(forecastVariance).toFixed(2)} ${currency}.`,
      evidence: `Explicit work package forecasts total ${(forecastFinalCost || 0).toFixed(2)} ${currency} against an approved budget of ${budget.toFixed(2)} ${currency}.`,
      tone: "danger",
      tab: "budget",
    });
  }

  if (financialTruth.pendingCostExposure.status !== "unavailable" && summary.pendingInvoiceCost > 0) {
    addSignal({
      id: "invoices-awaiting-review",
      flag: "INVOICES_AWAITING_REVIEW",
      category: "financial",
      severity: "info",
      source: "Supplier invoice review queue",
      label: "Invoices awaiting review",
      detail: `Unverified supplier invoice cost allocated to this project: ${summary.pendingInvoiceCost.toFixed(2)} ${currency}.`,
      evidence: `Unverified supplier invoice cost allocated to this project: ${summary.pendingInvoiceCost.toFixed(2)} ${currency}.`,
      metric: { label: "Invoice review exposure", value: summary.pendingInvoiceCost, currency, status: financialTruth.pendingCostExposure.status },
      tone: "info",
      tab: "invoices",
    });
  }

  if (financialTruth.outstandingReceivables.status !== "unavailable" && (financialTruth.outstandingReceivables.amount || 0) > 0) {
    const outstanding = financialTruth.outstandingReceivables.amount || 0;
    addSignal({
      id: "outstanding-receivable",
      flag: "OUTSTANDING_RECEIVABLE",
      category: "commercial",
      severity: "info",
      source: "Client Billing and Collections",
      label: "Outstanding billed amount",
      detail: `${outstanding.toFixed(2)} ${currency} of issued client billing remains uncollected. This is a receivable position, not an overdue or bad-debt conclusion.`,
      evidence: `${outstanding.toFixed(2)} ${currency} = issued billed amount less RECORDED client collections.`,
      metric: { label: "Outstanding billed amount", value: outstanding, currency, status: financialTruth.outstandingReceivables.status },
      tone: "info",
      tab: "billing",
    });
  }

  if (project.targetEndDate && ["ACTIVE", "ON_HOLD", "IN_PROGRESS"].includes(project.status as string) && project.targetEndDate < today) {
    const detail = `Target end date ${project.targetEndDate} has passed while the project remains ${project.status}.`;
    addSignal({
      id: "project-end-passed",
      flag: "PROJECT_END_PASSED",
      category: "schedule",
      severity: "critical",
      source: "Project lifecycle dates",
      label: "Target end date passed",
      detail,
      evidence: detail,
      date: project.targetEndDate,
      tone: "danger",
      tab: "overview",
    });
  }

  for (const signal of buildProjectEngineeringAttentionSignals(project, options?.engineering, today)) {
    if (canSurfaceAttention) attentionFlags.push(signal);
  }

  for (const signal of buildProjectFieldOperationsAttentionSignals(project, options?.fieldOperations)) {
    if (canSurfaceAttention) attentionFlags.push(signal);
  }

  const submittedClaims = (options?.subcontractClaims ?? options?.costInput?.subcontractClaims ?? []).filter((claim) => claim.projectId === project.id && claim.status === "SUBMITTED");
  for (const claim of submittedClaims) {
    const detail = `${claim.claimNumber} is SUBMITTED and awaiting approval; no due-date conclusion is implied.`;
    addSignal({
      id: `subcontract-claim-awaiting-approval:${claim.id}`,
      flag: "SUBCONTRACT_CLAIM_AWAITING_APPROVAL",
      category: "procurement",
      severity: "warning",
      source: "Subcontract progress claims",
      label: "Subcontract claim awaiting approval",
      detail,
      evidence: detail,
      date: claim.valuationDate,
      tone: "warning",
      tab: "procurement",
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
    attentionSignals: attentionFlags,
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
  projectsNeedingAttentionCount: number;
  /** Signal counts; projectsNeedingAttentionCount remains a project count. */
  criticalAttentionCount: number;
  warningAttentionCount: number;
  infoAttentionCount: number;
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
  let projectsNeedingAttentionCount = 0;
  let criticalAttentionCount = 0;
  let warningAttentionCount = 0;
  let infoAttentionCount = 0;

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
    if (view.attentionFlags.length > 0) projectsNeedingAttentionCount += 1;
    for (const signal of view.attentionFlags) {
      if (signal.severity === "critical") criticalAttentionCount += 1;
      else if (signal.severity === "warning") warningAttentionCount += 1;
      else if (signal.severity === "info") infoAttentionCount += 1;
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
    projectsNeedingAttentionCount,
    criticalAttentionCount,
    warningAttentionCount,
    infoAttentionCount,
  };
}

export type ProjectSortField =
  | "code"
  | "attention"
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
  | "NEEDS_ATTENTION"
  | "CRITICAL"
  | "WARNING"
  | "INFO"
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
  attentionCategoryFilter?: "ALL" | ProjectAttentionCategory;
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
  const attentionCategoryFilter = options.attentionCategoryFilter || "ALL";
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
      if (healthFilter === "NEEDS_ATTENTION" && view.attentionFlags.length === 0) return false;
      if (healthFilter === "CRITICAL" && !view.attentionFlags.some((signal) => signal.severity === "critical")) return false;
      if (healthFilter === "WARNING" && !view.attentionFlags.some((signal) => signal.severity === "warning")) return false;
      if (healthFilter === "INFO" && !view.attentionFlags.some((signal) => signal.severity === "info")) return false;
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
    if (attentionCategoryFilter !== "ALL" && !view.attentionFlags.some((signal) => signal.category === attentionCategoryFilter)) return false;

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
    const attentionFilter = ["NEEDS_ATTENTION", "CRITICAL", "WARNING", "INFO"].includes(healthFilter);
    if (sortField === "attention" || attentionFilter) {
      const severity = attentionSeverityRank(topProjectAttentionSignal(b)) - attentionSeverityRank(topProjectAttentionSignal(a));
      if (severity !== 0) return sortField === "attention" && sortDirection === "asc" ? -severity : severity;
      const count = b.attentionFlags.length - a.attentionFlags.length;
      if (count !== 0) return sortField === "attention" && sortDirection === "asc" ? -count : count;
      const code = (a.project.projectCode || "").localeCompare(b.project.projectCode || "");
      return sortDirection === "desc" && sortField === "attention" ? -code : code;
    }

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
