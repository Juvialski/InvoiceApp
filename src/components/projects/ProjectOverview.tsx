import React, { useMemo } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Calculator,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Compass,
  FileQuestion,
  FileText,
  HardHat,
  Lock,
  MapPin,
  Pencil,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import type { Project, ProjectCostCode, ProjectCostSummary } from "../../types.ts";
import { projectHealth } from "../../utils/projectCosting.ts";
import type { ProjectCostInput } from "../../utils/projectCosting.ts";
import type { ProjectDashboardViewData } from "../../utils/projectDashboardViewModel.ts";
import { projectCostMissingSourceLabels } from "../../utils/dataCompleteness.ts";
import { useAppPermissions, useProjectCostCompleteness } from "../../app/AppPermissionContext.tsx";
import { StatusBadge, type StatusTone } from "../ui/OperationsUI.tsx";
import { hasAnyPermission, hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { isProjectWorkspaceTabDeploymentVisible } from "./projectWorkspaceVisibility.ts";
import {
  buildProjectManagementView,
  type ProjectAttentionItem,
  type ProjectManagementHealth,
} from "../../utils/projectManagementViewModel.ts";
import type { ProjectFinancialMetric } from "../../utils/projectFinancialSummary.ts";
import { calculateClientBillingSummary, type ClientBilling, type ClientBillingSummary } from "../../lib/clientBilling.ts";
import { calculateClientCollectionSummary, type ClientCollection, type ClientCollectionSummary } from "../../lib/clientCollections.ts";

interface ProjectView {
  id: string;
  projectCode: string;
  projectName: string;
  clientName?: string;
  location?: string;
  siteAddress?: string;
  projectManager?: string;
  status: string;
  contractValue?: number;
  projectBudget: number;
  currency: string;
  description?: string;
  notes?: string;
  startDate?: string;
  endDate?: string;
}

interface CostSummaryView extends ProjectCostSummary {
  budget: number;
  invoiceCost: number;
  payrollCost: number;
  otherExpenseCost: number;
  totalActualCost: number;
  remainingBudget: number;
  budgetUsedPercent: number;
  pendingInvoiceCost: number;
  pendingPayrollCost: number;
  pendingExpenseCost: number;
  committedCost: number;
  foreignCosts: Record<string, number>;
}

export type ProjectOverviewTab =
  | "overview"
  | "billing"
  | "budget"
  | "procurement"
  | "documents"
  | "rfis"
  | "submittals"
  | "site-logs"
  | "invoices"
  | "payroll"
  | "expenses"
  | "people"
  | "reports";

interface ProjectOverviewProps {
  project: ProjectView;
  summary: CostSummaryView;
  dashboard?: ProjectDashboardViewData;
  costCodes?: readonly ProjectCostCode[];
  onBack?: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
  onOpenTab?: (tab: ProjectOverviewTab) => void;
  costInput?: ProjectCostInput;
  clientBillings?: readonly ClientBilling[];
  clientCollections?: readonly ClientCollection[];
  clientDataLoading?: boolean;
  hideHeader?: boolean;
}

function money(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return `${currency} ${(Number(value) || 0).toFixed(2)}`;
  }
}

function percent(value: number) {
  return `${(Number.isFinite(value) ? value : 0).toFixed(1)}%`;
}

function metricValue(metric: ProjectFinancialMetric, fallbackCurrency: string) {
  if (metric.status === "unavailable" || metric.amount === undefined) return "Unavailable";
  return money(metric.amount, metric.currency || fallbackCurrency);
}

function metricStatusLabel(metric: ProjectFinancialMetric) {
  return metric.status === "available" ? undefined : metric.status === "partial" ? "Partial" : "Unavailable";
}

function progressPercent(
  numerator: ProjectFinancialMetric,
  denominator: ProjectFinancialMetric,
  currency: string,
) {
  if (
    numerator.status !== "available" ||
    denominator.status !== "available" ||
    numerator.amount === undefined ||
    denominator.amount === undefined ||
    denominator.amount <= 0 ||
    (numerator.currency || currency) !== (denominator.currency || currency) ||
    (numerator.currency || currency) !== currency
  ) return null;
  return (numerator.amount / denominator.amount) * 100;
}

function ControlMetricCard({
  label,
  metric,
  currency,
  detail,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  metric: ProjectFinancialMetric;
  currency: string;
  detail: string;
  icon: React.ElementType;
  tone?: "slate" | "indigo" | "purple" | "amber" | "emerald";
}) {
  const toneClasses = {
    slate: "text-slate-600",
    indigo: "text-indigo-700",
    purple: "text-purple-700",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
  } as const;
  const status = metricStatusLabel(metric);
  return (
    <Card className="min-w-0 p-4 shadow-sm" elevation="low" data-financial-metric-status={metric.status}>
      <div className={`flex items-center justify-between ${toneClasses[tone]}`}>
        <span className="text-[10px] font-semibold">{label}</span>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </div>
      <p className={`mt-2 break-words text-base font-black tabular-nums ${toneClasses[tone]}`}>
        {metricValue(metric, currency)}
      </p>
      <p className="mt-1 text-[9px] text-slate-500">{detail}</p>
      {status && <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-amber-700">{status}</p>}
      {metric.reason && <p className="mt-2 text-[9px] leading-4 text-slate-500">{metric.reason}</p>}
    </Card>
  );
}

function ProgressMeter({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | null;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3" data-progress-status={value === null ? "unavailable" : "available"}>
      <div className="flex items-center justify-between gap-3 text-[10px] font-semibold text-slate-600">
        <span>{label}</span>
        <span className="font-black tabular-nums text-slate-900">{value === null ? "Unavailable" : percent(value)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${value === null ? 0 : Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <p className="mt-2 text-[9px] leading-4 text-slate-500">{detail}</p>
    </div>
  );
}

function fallbackDashboard(summary: CostSummaryView): ProjectDashboardViewData {
  const budget = Number(summary.budget) || 0;
  const confirmed = Number(summary.totalActualCost) || 0;
  const committed = Number(summary.committedCost) || 0;
  const pending = (Number(summary.pendingInvoiceCost) || 0) +
    (Number(summary.pendingPayrollCost) || 0) +
    (Number(summary.pendingExpenseCost) || 0);
  const availableAfterCommitments = budget - confirmed - committed - pending;
  return {
    budget,
    confirmed,
    committed,
    pending,
    availableAfterCommitments,
    remaining: Math.max(0, availableAfterCommitments),
    excess: Math.max(0, -availableAfterCommitments),
    confirmedUtilization: budget > 0 ? (confirmed / budget) * 100 : 0,
    commitmentUtilization:
      budget > 0
        ? ((confirmed + committed + pending) / budget) *
          100
        : 0,
    health: projectHealth({
      budget,
      remainingBudget: budget - confirmed,
      budgetUsedPercent: budget > 0 ? (confirmed / budget) * 100 : 0,
    }),
    outstandingPayables: summary.unpaidInvoiceCost,
    composition: { invoices: summary.invoiceCost, payroll: summary.payrollCost, expenses: summary.otherExpenseCost },
    trend: [],
    attention: [],
  };
}

function healthTone(health: ProjectManagementHealth): string {
  return health === "OVER BUDGET"
    ? "text-rose-300"
    : health === "NEAR LIMIT"
      ? "text-amber-300"
      : health === "PARTIAL"
        ? "text-amber-300"
        : health === "NO BUDGET"
          ? "text-slate-300"
          : "text-emerald-300";
}

function statusTone(status: string): StatusTone {
  return status === "ACTIVE" || status === "IN_PROGRESS"
    ? "success"
    : status === "ARCHIVED" || status === "CANCELLED"
      ? "neutral"
      : status === "ON_HOLD"
        ? "warning"
        : "info";
}

function attentionItemTone(tone: ProjectAttentionItem["tone"]): string {
  switch (tone) {
    case "danger":
      return "border-rose-200 bg-rose-50/70 text-rose-900";
    case "warning":
      return "border-amber-200 bg-amber-50/70 text-amber-900";
    case "info":
      return "border-indigo-200 bg-indigo-50/70 text-indigo-900";
    default:
      return "border-slate-200 bg-slate-50 text-slate-800";
  }
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center text-xs text-slate-500">
      {message}
    </div>
  );
}

function RestrictedProjectOverview({
  project,
  onBack,
  onEdit,
  onArchive,
  hideHeader,
  missingSources,
  clientBillingSummary,
  clientCollectionSummary,
}: {
  project: ProjectView;
  onBack?: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
  hideHeader: boolean;
  missingSources: readonly string[];
  clientBillingSummary: ClientBillingSummary;
  clientCollectionSummary?: ClientCollectionSummary;
}) {
  return (
    <div className="space-y-5" data-project-cost-completeness="incomplete">
      {!hideHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="rounded-lg border border-slate-200 bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
                aria-label="Back to projects"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">
                {project.projectCode || "Project reference missing"}
              </p>
              <h2 className="truncate text-xl font-black text-slate-950 sm:text-2xl">
                {project.projectName || "Unnamed project"}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge tone={statusTone(project.status)}>{project.status.replaceAll("_", " ")}</StatusBadge>
            {onEdit && <Button variant="secondary" label="Edit" icon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit} />}
            {onArchive && project.status !== "ARCHIVED" && <Button variant="destructive" label="Archive" onClick={onArchive} />}
          </div>
        </div>
      )}

      <Card className="p-5 shadow-sm" elevation="low">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-950">Combined project financial position withheld</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">Required project-cost sources are unavailable or incomplete: {missingSources.join(", ")}. Actual cost, pending exposure, budget balance, utilization, health, composition, cost trend, and cumulative burn are not shown because they would be incomplete.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-[10px] font-semibold text-slate-500">Approved Cost Budget</p>
            <p className="mt-1 text-sm font-black tabular-nums text-slate-900">{money(project.projectBudget, project.currency)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-[10px] font-semibold text-slate-500">Client</p>
            <p className="mt-1 text-sm font-black text-slate-900">{project.clientName || "Not set"}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-[10px] font-semibold text-slate-500">Location</p>
            <p className="mt-1 text-sm font-black text-slate-900">{project.location || project.siteAddress || "Not set"}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-[10px] font-semibold text-slate-500">Project Manager</p>
            <p className="mt-1 text-sm font-black text-slate-900">{project.projectManager || "Not set"}</p>
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          {project.description || project.notes || "No project description or notes have been recorded."}
        </p>
      </Card>
      <Card className="p-5 shadow-sm" elevation="low">
        <div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Wallet className="h-4 w-4" aria-hidden="true" /></div><div><h3 className="text-sm font-black text-slate-950">Client billing position</h3><p className="mt-1 text-[10px] leading-4 text-slate-500">Revenue-side billing is independent from the withheld project-cost analytics.</p></div></div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-500">Contract Value</p>
            <p className="mt-1 text-sm font-black tabular-nums text-slate-900">{clientBillingSummary.contractValue === undefined ? "Unavailable" : money(clientBillingSummary.contractValue, project.currency)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-500">Billed to Date</p>
            <p className="mt-1 text-sm font-black tabular-nums text-slate-900">{clientBillingSummary.billedToDate === undefined ? "Unavailable" : money(clientBillingSummary.billedToDate, project.currency)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-500">Collected to Date</p>
            <p className="mt-1 text-sm font-black tabular-nums text-slate-900">{clientCollectionSummary?.collectedToDate === undefined ? "Unavailable" : money(clientCollectionSummary.collectedToDate, project.currency)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-500">Outstanding Billed Amount</p>
            <p className="mt-1 text-sm font-black tabular-nums text-slate-900">{clientCollectionSummary?.outstandingBilledAmount === undefined ? "Unavailable" : money(clientCollectionSummary.outstandingBilledAmount, project.currency)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-500">Remaining to Bill</p>
            <p className="mt-1 text-sm font-black tabular-nums text-slate-900">{clientBillingSummary.remainingToBill === undefined ? "Unavailable" : money(clientBillingSummary.remainingToBill, project.currency)}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export const ProjectOverview: React.FC<ProjectOverviewProps> = ({
  project,
  summary,
  dashboard: suppliedDashboard,
  costCodes = [],
  costInput,
  onBack,
  onEdit,
  onArchive,
  onOpenTab,
  clientBillings = [],
  clientCollections = [],
  clientDataLoading = false,
  hideHeader = false,
}) => {
  // Unconditional React hooks (must all run before any early return)
  const permissions = useAppPermissions();
  const completeness = useProjectCostCompleteness();
  const clientBillingSummary = useMemo(() => clientDataLoading
    ? {
        currency: String(project.currency || "").trim().toUpperCase() || "UNKNOWN",
        contractValue: Number.isFinite(Number(project.contractValue)) ? Number(project.contractValue) : undefined,
        issuedBillingCount: 0,
        totalBillingCount: 0,
        hasCurrencyMismatch: false,
        reason: "Client billing data is still loading; billed-to-date and remaining-to-bill are unavailable.",
      }
    : calculateClientBillingSummary(project as Project, clientBillings), [clientBillings, clientDataLoading, project]);
  const clientCollectionSummary = useMemo(() => clientDataLoading
    ? undefined
    : calculateClientCollectionSummary(project as Project, clientBillings, clientCollections), [clientBillings, clientCollections, clientDataLoading, project]);

  const managementView = useMemo(() => {
    return buildProjectManagementView(
      project as unknown as Project,
      summary,
      {
        costCodes,
        costInput,
        financialDataComplete: completeness.complete,
        clientBillings: clientDataLoading ? undefined : clientBillings,
        clientCollections: clientDataLoading ? undefined : clientCollections,
      },
    );
  }, [clientBillings, clientCollections, clientDataLoading, completeness.complete, costCodes, costInput, project, summary]);

  const dashboard = suppliedDashboard || fallbackDashboard(summary);
  const pendingBase = managementView.pendingCostExposure;
  const foreignEntries = Object.entries(summary.foreignCosts || {}).filter(
    ([, value]) => Math.abs(Number(value) || 0) > 0.004,
  );
  const hasForeignAmounts = foreignEntries.length > 0;

  // Trend Reconciliation verification
  const finalTrendPoint = dashboard.trend.at(-1);
  const trendReconciles = finalTrendPoint
    ? Math.abs(finalTrendPoint.cumulative - summary.totalActualCost) <= 0.01 &&
      Math.abs(finalTrendPoint.cumulativeCommitted - (summary.totalActualCost + pendingBase)) <= 0.01
    : summary.totalActualCost === 0 && pendingBase === 0;
  const showTrendAnalytics = !hasForeignAmounts && trendReconciles;
  const combinedCostAnalyticsAvailable = !managementView.isPartial && managementView.availableAfterCommitments !== null;

  const attentionItems = managementView.attentionFlags.filter(
    (item) => item.flag !== "FORECAST_NOT_SET" && item.flag !== "FORECAST_OVER_BUDGET",
  );
  const authoritativeComposition = {
    invoices: managementView.baseCostSummary.invoiceCost,
    payroll: managementView.baseCostSummary.payrollCost,
    expenses: managementView.baseCostSummary.otherExpenseCost,
  };
  const compositionTotal = authoritativeComposition.invoices + authoritativeComposition.payroll + authoritativeComposition.expenses;
  const compositionReconciles = managementView.actualCostCompositionReconciles;
  const compositionChartAvailable = compositionReconciles && compositionTotal > 0;
  const financialTruth = managementView.financialTruth;
  const availableAfterCommitmentsMetric: ProjectFinancialMetric = managementView.availableAfterCommitments === null
    ? {
        status: "unavailable",
        reason: hasForeignAmounts
          ? "Available after commitments / exposure is withheld while foreign-currency cost sources remain unconverted."
          : "Available after commitments / exposure is unavailable until the project-cost sources are complete.",
      }
    : { status: "available", amount: managementView.availableAfterCommitments, currency: managementView.currency };
  const billingProgress = progressPercent(financialTruth.billed, financialTruth.contractValue, managementView.currency);
  const collectionProgress = progressPercent(financialTruth.collected, financialTruth.billed, managementView.currency);

  const budgetPositionData = [
    {
      label: project.projectCode,
      confirmed: managementView.actualCost,
      committed: managementView.committedCost,
      pending: managementView.pendingCostExposure,
      available: Math.max(0, managementView.availableAfterCommitments || 0),
      excess: Math.max(0, -(managementView.availableAfterCommitments || 0)),
    },
  ];

  const composition = [
    { name: "Supplier invoices", value: authoritativeComposition.invoices, color: "#4f46e5" },
    { name: "Project payroll", value: authoritativeComposition.payroll, color: "#8b5cf6" },
    { name: "Direct expenses", value: authoritativeComposition.expenses, color: "#f59e0b" },
  ].filter((item) => item.value > 0);

  // Permission- and deployment-gated shortcuts
  const canReadDocuments = hasPermission(permissions, PERMISSION_KEYS.engineeringDocumentsRead);
  const canReadRfis = hasPermission(permissions, PERMISSION_KEYS.engineeringRfisRead);
  const canReadSubmittals = hasPermission(permissions, PERMISSION_KEYS.engineeringSubmittalsRead);
  const canReadSiteLogs = hasPermission(permissions, PERMISSION_KEYS.engineeringSiteLogsRead);
  const canReadInvoices = hasPermission(permissions, PERMISSION_KEYS.invoicesRead);
  const canReadClientBilling = hasPermission(permissions, PERMISSION_KEYS.projectsRead);
  const canReadProcurement = hasPermission(permissions, PERMISSION_KEYS.procurementRead);
  const canReadExpenses = hasPermission(permissions, PERMISSION_KEYS.expensesRead);
  const canReadPayroll = hasPermission(permissions, PERMISSION_KEYS.payrollRead);
  const canReadPeople = hasPermission(permissions, PERMISSION_KEYS.workersRead);
  const canReadReports = hasAnyPermission(permissions, [PERMISSION_KEYS.reportsRead, PERMISSION_KEYS.reportsPayrollRead]);

  const shortcuts: Array<{ tab: ProjectOverviewTab; label: string; icon: React.ElementType }> = [
    ...(canReadClientBilling ? [{ tab: "billing" as const, label: "Client Billing", icon: Wallet }] : []),
    ...(isProjectWorkspaceTabDeploymentVisible("budget") ? [{ tab: "budget" as const, label: "Budget Control", icon: Calculator }] : []),
    ...(canReadProcurement && isProjectWorkspaceTabDeploymentVisible("procurement") ? [{ tab: "procurement" as const, label: "Procurement", icon: ShoppingCart }] : []),
    ...(canReadDocuments && isProjectWorkspaceTabDeploymentVisible("documents") ? [{ tab: "documents" as const, label: "Engineering Docs", icon: Compass }] : []),
    ...(canReadRfis && isProjectWorkspaceTabDeploymentVisible("rfis") ? [{ tab: "rfis" as const, label: "RFIs", icon: FileQuestion }] : []),
    ...(canReadSubmittals && isProjectWorkspaceTabDeploymentVisible("submittals") ? [{ tab: "submittals" as const, label: "Submittals", icon: ClipboardCheck }] : []),
    ...(canReadSiteLogs ? [{ tab: "site-logs" as const, label: "Daily Site Logs", icon: ClipboardList }] : []),
    ...(canReadInvoices && isProjectWorkspaceTabDeploymentVisible("invoices") ? [{ tab: "invoices" as const, label: "Invoices", icon: FileText }] : []),
    ...(canReadExpenses && isProjectWorkspaceTabDeploymentVisible("expenses") ? [{ tab: "expenses" as const, label: "Expenses", icon: Receipt }] : []),
    ...(canReadPayroll && isProjectWorkspaceTabDeploymentVisible("payroll") ? [{ tab: "payroll" as const, label: "Payroll", icon: HardHat }] : []),
    ...(canReadPeople ? [{ tab: "people" as const, label: "People", icon: Users }] : []),
    ...(canReadReports && isProjectWorkspaceTabDeploymentVisible("reports") ? [{ tab: "reports" as const, label: "Reports", icon: BarChart3 }] : []),
  ];

  // If financial data completeness is incomplete, fail closed to restricted view after hooks have executed
  if (!completeness.complete) {
    return (
      <RestrictedProjectOverview
        project={project}
        onBack={onBack}
        onEdit={onEdit}
        onArchive={onArchive}
        hideHeader={hideHeader}
        missingSources={projectCostMissingSourceLabels(completeness)}
        clientBillingSummary={clientBillingSummary}
        clientCollectionSummary={clientCollectionSummary}
      />
    );
  }

  return (
    <div className="space-y-5" data-project-cost-completeness="complete">
      {/* 1. Header (when not inside workspace tabs) */}
      {!hideHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="rounded-lg border border-slate-200 bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
                aria-label="Back to projects"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">
                {project.projectCode || "Project reference missing"}
              </p>
              <h2 className="truncate text-xl font-black text-slate-950 sm:text-2xl">
                {project.projectName || "Unnamed project"}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge tone={statusTone(project.status)}>{project.status.replaceAll("_", " ")}</StatusBadge>
            {onEdit && (
              <Button
                variant="secondary"
                label="Edit"
                icon={<Pencil className="h-3.5 w-3.5" />}
                onClick={onEdit}
              />
            )}
            {onArchive && project.status !== "ARCHIVED" && (
              <Button
                variant="destructive"
                label="Archive"
                onClick={onArchive}
              />
            )}
          </div>
        </div>
      )}

      {/* 2. Top Identity & Operational Context Banner */}
      <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-lg" aria-label="Project Identity and Health">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200">Project Operations Hub</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <BriefcaseBusiness className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
                {project.clientName || "Client not set"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
                {project.location || project.siteAddress || "Location not set"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
                PM: {project.projectManager || "Not set"}
              </span>
            </div>
            <p className="max-w-2xl text-xs leading-5 text-slate-400">
              {project.description || project.notes || "No project description or notes have been recorded."}
            </p>
          </div>

          <div className="lg:max-w-xs lg:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Cost Control Health</p>
            <p className={`text-xl font-black ${healthTone(managementView.health)}`}>
              {managementView.health}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {hasForeignAmounts
                ? "Complete cost health is withheld while unconverted foreign-currency costs are present."
                  : managementView.isPartial
                    ? "Partial aggregate due to withheld or incomplete cost sources."
                  : `${percent(managementView.confirmedUtilization)} budget used · ${percent(managementView.commitmentUtilization)} including approved commitments and pending exposure`}
            </p>
          </div>
        </div>
      </section>

      {/* 3. Financial control scorecard */}
      <section aria-labelledby="project-financial-control-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="project-financial-control-heading" className="text-sm font-black text-slate-950">
              Project Financial Control Dashboard
            </h3>
            <p className="text-[10px] text-slate-500">
              Project Financial Snapshot for management control; cost control and commercial progress remain separate.
            </p>
          </div>
          {hasForeignAmounts && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Mixed currencies present
            </span>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4 shadow-sm sm:p-5" elevation="low">
            <div className="flex items-start gap-2.5 border-b border-slate-100 pb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                <Calculator className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-950">Cost Control</h4>
                <p className="mt-0.5 text-[10px] leading-4 text-slate-500">Approved cost ceiling against authoritative actual, commitments, and pending exposure.</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <ControlMetricCard label="Approved Cost Budget" metric={financialTruth.approvedCostBudget} currency={managementView.currency} detail="Internal approved cost ceiling" icon={Calculator} />
              <ControlMetricCard label="Actual Cost" metric={financialTruth.actualCost} currency={managementView.currency} detail="Verified/approved cost sources" icon={BarChart3} tone="indigo" />
              <ControlMetricCard label="Committed Cost" metric={financialTruth.committedCost} currency={managementView.currency} detail="Approved/issued POs and approved/active subcontracts" icon={ShoppingCart} tone="purple" />
              <ControlMetricCard label="Pending Exposure" metric={financialTruth.pendingCostExposure} currency={managementView.currency} detail="Pending or unconfirmed cost sources" icon={AlertTriangle} tone="amber" />
              <ControlMetricCard label="Remaining Budget" metric={financialTruth.remainingBudget} currency={managementView.currency} detail="Budget Remaining = approved budget − actual cost" icon={Building2} tone="emerald" />
              <ControlMetricCard label="Available after Commitments / Exposure" metric={availableAfterCommitmentsMetric} currency={managementView.currency} detail="Budget − actual − committed − pending" icon={ShieldCheck} />
            </div>
            {hasForeignAmounts && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-900">Base-currency cost amounts remain visible only as partial source values. Remaining Budget and the commitment-adjusted balance are not stated as complete totals until foreign amounts have an explicit conversion contract.</p>}
          </Card>

          <Card className="p-4 shadow-sm sm:p-5" elevation="low">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-start gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Wallet className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-950">Commercial Control</h4>
                  <p className="mt-0.5 text-[10px] leading-4 text-slate-500">Client billing and collection stages; these do not redefine project cost.</p>
                </div>
              </div>
              {onOpenTab && canReadClientBilling && isProjectWorkspaceTabDeploymentVisible("billing") && <Button variant="secondary" label="Open Billing & Collections →" onClick={() => onOpenTab("billing")} />}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <ControlMetricCard label="Contract Value" metric={financialTruth.contractValue} currency={managementView.currency} detail="Client-facing contract value" icon={Wallet} tone="emerald" />
              <ControlMetricCard label="Billed to Date" metric={financialTruth.billed} currency={managementView.currency} detail="ISSUED client billings only" icon={FileText} tone="emerald" />
              <ControlMetricCard label="Remaining to Bill" metric={financialTruth.remainingToBill} currency={managementView.currency} detail="Contract value − issued billings" icon={ArrowUpRight} tone="emerald" />
              <ControlMetricCard label="Collected to Date" metric={financialTruth.collected} currency={managementView.currency} detail="RECORDED client collections only" icon={CheckCircle2} tone="emerald" />
              <ControlMetricCard label="Outstanding Billed Amount" metric={financialTruth.outstandingReceivables} currency={managementView.currency} detail="Billed − recorded collections" icon={Receipt} tone="amber" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Commercial progress">
              <ProgressMeter label="Billing progress" value={billingProgress} detail="Billed to Date / Contract Value; only shown when both authoritative values share the project currency." />
              <ProgressMeter label="Collection progress" value={collectionProgress} detail="Collected to Date / Billed to Date; settlement linkage remains separate cash evidence." />
            </div>
          </Card>
        </div>
      </section>

      {/* 4. Commitment visibility */}
      <Card className="p-4 shadow-sm sm:p-5" elevation="low">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-700"><ShoppingCart className="h-4 w-4" aria-hidden="true" /></div>
            <div><h3 className="text-sm font-black text-slate-950">Commitment Visibility</h3><p className="mt-0.5 text-[10px] leading-4 text-slate-500">Authoritative approved-obligation view; commitments are not Actual Cost and do not include draft sourcing records.</p></div>
          </div>
          {onOpenTab && canReadProcurement && isProjectWorkspaceTabDeploymentVisible("procurement") && <Button variant="secondary" label="Open Procurement →" onClick={() => onOpenTab("procurement")} />}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <ControlMetricCard label="Committed Cost" metric={financialTruth.committedCost} currency={managementView.currency} detail="Canonical project-cost aggregate" icon={ShoppingCart} tone="purple" />
          {managementView.commitmentBreakdown.reconcilesToCommittedCost && managementView.commitmentBreakdown.purchaseOrders.status !== "unavailable" && managementView.commitmentBreakdown.subcontracts.status !== "unavailable" ? (
            <>
              <ControlMetricCard label="Purchase Order Commitments" metric={managementView.commitmentBreakdown.purchaseOrders} currency={managementView.currency} detail="APPROVED / ISSUED POs" icon={ShoppingCart} tone="purple" />
              <ControlMetricCard label="Subcontract Commitments" metric={managementView.commitmentBreakdown.subcontracts} currency={managementView.currency} detail="APPROVED / ACTIVE subcontracts after certified progress" icon={BriefcaseBusiness} tone="purple" />
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-[10px] leading-4 text-slate-500 sm:col-span-2">Source-level PO and subcontract categories are unavailable here because the supplied sources do not reconcile independently to the authoritative Committed Cost aggregate.</div>
          )}
        </div>
        {managementView.commitmentBreakdown.purchaseOrders.reason && managementView.commitmentBreakdown.purchaseOrders.status !== "available" && <p className="mt-3 text-[10px] leading-4 text-amber-700">{managementView.commitmentBreakdown.purchaseOrders.reason}</p>}
      </Card>

      {/* 5. Budget Control & Work Packages Section */}
      <Card className="p-4 shadow-sm sm:p-5" elevation="low">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <Calculator className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-950">Work Package Budget Control (P1B)</h3>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Management summary from the detailed work-package and cost-code control model.
              </p>
            </div>
          </div>
          {onOpenTab && isProjectWorkspaceTabDeploymentVisible("budget") && (
            <Button
              variant="secondary"
              label="Open Budget Control Tab →"
              onClick={() => onOpenTab("budget")}
            />
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-500">Active Work Packages</p>
            <p className="mt-1 text-sm font-black tabular-nums text-slate-900">
              {managementView.activeCostCodesCount} codes
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-500">Allocated Code Budget</p>
            <p className="mt-1 text-sm font-black tabular-nums text-slate-900">
              {money(managementView.allocatedCostCodeBudget, managementView.currency)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-500">Unallocated Budget</p>
            <p className="mt-1 text-sm font-black tabular-nums text-slate-900">
              {money(managementView.unallocatedBudget, managementView.currency)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-500">Coded Actual Cost</p>
            <p className="mt-1 text-sm font-black tabular-nums text-slate-900">
              {hasForeignAmounts
                ? "Partial"
                : managementView.costClassificationAvailable && managementView.codedActualCost !== null
                ? money(managementView.codedActualCost, managementView.currency)
                : "Unavailable in overview"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-500">Uncoded Actual Cost</p>
            <p className={`mt-1 text-sm font-black tabular-nums ${managementView.uncodedActualCost !== null && managementView.uncodedActualCost > 0 && managementView.activeCostCodesCount > 0 ? "text-amber-700" : "text-slate-900"}`}>
              {hasForeignAmounts
                ? "Partial"
                : managementView.costClassificationAvailable && managementView.uncodedActualCost !== null
                ? money(managementView.uncodedActualCost, managementView.currency)
                : "Unavailable in overview"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-500">Work Packages Over Budget</p>
            <p className={`mt-1 text-sm font-black tabular-nums ${managementView.overBudgetCostCodeCount !== null && managementView.overBudgetCostCodeCount > 0 ? "text-rose-700" : "text-slate-900"}`}>
              {managementView.overBudgetCostCodeCount === null ? "Unavailable" : managementView.overBudgetCostCodeCount}
            </p>
            <p className="mt-1 text-[9px] text-slate-500">Actual cost above approved code budget</p>
          </div>
        </div>
        {hasForeignAmounts && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-900">Code-level actuals are partial while foreign-currency cost sources remain unconverted; no complete work-package conclusion is shown.</p>}
      </Card>

      {/* 6. Commercial Controls Explanatory Notice */}
      <Card className="border-dashed border-slate-200 bg-slate-50/70 p-4 shadow-none" elevation="low">
        <div className="flex items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <div className="min-w-0 text-xs">
            <h4 className="font-bold text-slate-800">Commercial Controls</h4>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              <strong>Committed Cost</strong> (approved PO and subcontract commitments) is included above. <strong>Client Progress Billing</strong> and <strong>recorded client collections</strong> are revenue-side commercial history and do not change project cost. <strong>Outstanding Receivables</strong> remains allocation-derived; bank settlement linkage is separate cash evidence and does not redefine collected truth.
            </p>
          </div>
        </div>
      </Card>

      {/* 6. Operational Section Shortcuts */}
      {onOpenTab && shortcuts.length > 0 && (
        <Card className="p-4 shadow-sm" elevation="low">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
            Project Operations Navigation
          </h4>
          <div className="mt-3 flex flex-wrap gap-2">
            {shortcuts.map(({ tab, label, icon: Icon }) => (
              <button
                key={tab}
                type="button"
                onClick={() => onOpenTab(tab)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <Icon className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
                <span>{label}</span>
                <ArrowUpRight className="h-3 w-3 text-slate-400" aria-hidden="true" />
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* 7. Analytics: Budget Position Visual Bar Chart */}
      <Card className="p-4 shadow-sm sm:p-5" elevation="low">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-black">Project Budget Position</h3>
            <p className="mt-1 text-[10px] text-slate-500">
              Approved cost budget is shown as Actual Cost + Committed Cost + Pending Exposure + Available after commitments / exposure. Over-budget excess is separate.
            </p>
          </div>
          <BarChart3 className="h-4 w-4 text-indigo-500" aria-hidden="true" />
        </div>
        {!combinedCostAnalyticsAvailable ? (
          <ChartEmpty message={hasForeignAmounts ? "Complete budget position withheld while unconverted foreign-currency costs are present." : "Complete budget position withheld until authoritative cost sources reconcile."} />
        ) : dashboard.budget <= 0 && dashboard.confirmed === 0 && dashboard.committed === 0 && dashboard.pending === 0 ? (
          <ChartEmpty message="No project budget or cost activity yet." />
        ) : (
          <div className="mt-4 h-[140px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={budgetPositionData} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(val) => money(Number(val), project.currency)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis type="category" dataKey="label" hide />
                <Tooltip formatter={(val: number | string) => money(Number(val), project.currency)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="confirmed" stackId="position" fill="#4f46e5" name="Actual Cost" />
                <Bar dataKey="committed" stackId="position" fill="#7c3aed" name="Committed Cost" />
                <Bar dataKey="pending" stackId="position" fill="#f59e0b" name="Pending Exposure" />
                <Bar dataKey="available" stackId="position" fill="#cbd5e1" name="Available after commitments / exposure" />
                <Bar dataKey="excess" stackId="position" fill="#e11d48" name="Over Budget" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* 8. Actual Cost Composition + Project Attention Grid */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Actual Cost Composition */}
        <Card className="p-4 shadow-sm sm:p-5" elevation="low">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black">
                {hasForeignAmounts ? "Base-Currency Actual Cost Composition" : "Actual Cost Composition"}
              </h3>
              <p className="mt-1 text-[10px] text-slate-500">
                Verified supplier invoices, approved/finalized project payroll, and approved direct expenses only.
                {hasForeignAmounts ? ` Unconverted foreign amounts are excluded from this ${project.currency} composition.` : ""}
              </p>
            </div>
            <Receipt className="h-4 w-4 text-violet-500" aria-hidden="true" />
          </div>
          {!compositionChartAvailable ? (
            <ChartEmpty message={!compositionReconciles ? "Actual cost composition withheld because source categories do not reconcile to the authoritative Actual Cost." : "No actual project costs recorded yet."} />
          ) : (
            <>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={composition} dataKey="value" nameKey="name" innerRadius={50} outerRadius={70} paddingAngle={2}>
                      {composition.map((item) => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: number | string) => money(Number(val), project.currency)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {composition.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.name}
                    </span>
                    <strong className="tabular-nums">
                      {money(item.value, project.currency)}{" "}
                      <span className="font-semibold text-slate-400">{percent((item.value / compositionTotal) * 100)}</span>
                    </strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Project Attention Items */}
        <Card className="p-4 shadow-sm sm:p-5" elevation="low">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black">Project Attention Items</h3>
              <p className="mt-1 text-[10px] text-slate-500">
                Operational and financial signals requiring review or action.
              </p>
            </div>
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
          </div>

          {attentionItems.length ? (
            <div className="mt-4 space-y-2">
              {attentionItems.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => item.tab && onOpenTab?.(item.tab as ProjectOverviewTab)}
                  className={`flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left transition ${attentionItemTone(
                    item.tone,
                  )}`}
                >
                  <div>
                    <strong className="block text-xs font-bold">{item.label}</strong>
                    <span className="mt-0.5 block text-[10px] opacity-90">{item.detail}</span>
                  </div>
                  {item.tab && onOpenTab && (
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-4 flex items-center gap-1.5 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {hasForeignAmounts
                ? "No additional operational exceptions need attention; mixed-currency financial analytics remain partial."
                : "No project exceptions need attention. Everything is on track."}
            </p>
          )}
        </Card>
      </section>

      {/* 9. Historical Analytics: Cost Trend & Cumulative Burn */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 shadow-sm sm:p-5" elevation="low">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black">Monthly Project Cost Trend</h3>
              <p className="mt-1 text-[10px] text-slate-500">
                Source dates: invoice date, payroll period end, and expense date.
              </p>
            </div>
            <BarChart3 className="h-4 w-4 text-indigo-500" aria-hidden="true" />
          </div>
          {!showTrendAnalytics ? (
            <ChartEmpty
              message={
                hasForeignAmounts
                  ? "Cost trend withheld while unconverted foreign-currency costs are present."
                  : "Cost trend withheld because source-dated analytics do not reconcile to the authoritative project cost summary."
              }
            />
          ) : !dashboard.trend.some((point) => point.total > 0) ? (
            <ChartEmpty message="No actual project costs recorded yet." />
          ) : (
            <div className="mt-4 h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dashboard.trend} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(val) => money(Number(val), project.currency)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip formatter={(val: number | string) => money(Number(val), project.currency)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="invoices" stackId="cost" fill="#4f46e5" name="Supplier invoices" />
                  <Bar dataKey="payroll" stackId="cost" fill="#8b5cf6" name="Project payroll" />
                  <Bar dataKey="expenses" stackId="cost" fill="#f59e0b" name="Direct expenses" />
                  <Line type="monotone" dataKey="total" stroke="#0f172a" strokeWidth={2} dot={false} name="Total" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-4 shadow-sm sm:p-5" elevation="low">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black">Cumulative Budget Burn</h3>
              <p className="mt-1 text-[10px] text-slate-500">
                Historical cumulative actual project cost vs. approved cost budget ceiling.
              </p>
            </div>
            <BarChart3 className="h-4 w-4 text-violet-500" aria-hidden="true" />
          </div>
          {!showTrendAnalytics ? (
            <ChartEmpty
              message={
                hasForeignAmounts
                  ? "Cumulative budget burn withheld while unconverted foreign-currency costs are present."
                  : "Cumulative budget burn withheld because source-dated analytics do not reconcile to the authoritative project cost summary."
              }
            />
          ) : !dashboard.trend.some((point) => point.cumulative > 0) ? (
            <ChartEmpty message="No cumulative project cost recorded yet." />
          ) : (
            <div className="mt-4 h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dashboard.trend} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(val) => money(Number(val), project.currency)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip formatter={(val: number | string) => money(Number(val), project.currency)} />
                  <ReferenceLine
                    y={dashboard.budget}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{ value: "Budget", position: "top", fontSize: 9 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#4f46e5"
                    strokeWidth={2.5}
                    dot={false}
                    name="Cumulative actual cost"
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativeCommitted"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    dot={false}
                    name="Cumulative actual + pending"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </section>

      {/* 10. Foreign Currency Explanatory Footer */}
      {foreignEntries.length > 0 && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-600">
          Foreign costs remain separate from {project.currency}:{" "}
          {foreignEntries.map(([curr, val]) => `${curr} ${Number(val).toFixed(2)}`).join(" • ")}.
        </p>
      )}
    </div>
  );
};
