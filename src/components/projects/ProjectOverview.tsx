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
  | "budget"
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

function fallbackDashboard(summary: CostSummaryView): ProjectDashboardViewData {
  const health = projectHealth(summary);
  return {
    budget: summary.budget,
    confirmed: summary.totalActualCost,
    pending: summary.pendingInvoiceCost + summary.pendingPayrollCost + summary.pendingExpenseCost,
    availableAfterCommitments:
      summary.budget - summary.totalActualCost - summary.pendingInvoiceCost - summary.pendingPayrollCost - summary.pendingExpenseCost,
    remaining: Math.max(0, summary.remainingBudget),
    excess: Math.max(0, -summary.remainingBudget),
    confirmedUtilization: summary.budgetUsedPercent,
    commitmentUtilization:
      summary.budget > 0
        ? ((summary.totalActualCost + summary.pendingInvoiceCost + summary.pendingPayrollCost + summary.pendingExpenseCost) /
            summary.budget) *
          100
        : 0,
    health,
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
}: {
  project: ProjectView;
  onBack?: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
  hideHeader: boolean;
  missingSources: readonly string[];
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
    </div>
  );
}

export const ProjectOverview: React.FC<ProjectOverviewProps> = ({
  project,
  summary,
  dashboard: suppliedDashboard,
  costCodes = [],
  onBack,
  onEdit,
  onArchive,
  onOpenTab,
  hideHeader = false,
}) => {
  // Unconditional React hooks (must all run before any early return)
  const permissions = useAppPermissions();
  const completeness = useProjectCostCompleteness();

  const managementView = useMemo(() => {
    return buildProjectManagementView(
      project as unknown as Project,
      summary,
      {
        costCodes,
        financialDataComplete: completeness.complete,
      },
    );
  }, [project, summary, costCodes, completeness.complete]);

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

  const attentionItems = managementView.attentionFlags;
  const compositionTotal =
    dashboard.composition.invoices + dashboard.composition.payroll + dashboard.composition.expenses;

  const budgetPositionData = [
    {
      label: project.projectCode,
      confirmed: managementView.actualCost,
      pending: managementView.pendingCostExposure,
      remaining: Math.max(0, managementView.remainingBudget || 0),
      excess: managementView.remainingBudget !== null && managementView.remainingBudget < 0 ? Math.abs(managementView.remainingBudget) : 0,
    },
  ];

  const composition = [
    { name: "Supplier invoices", value: dashboard.composition.invoices, color: "#4f46e5" },
    { name: "Project payroll", value: dashboard.composition.payroll, color: "#8b5cf6" },
    { name: "Direct expenses", value: dashboard.composition.expenses, color: "#f59e0b" },
  ].filter((item) => item.value > 0);

  // Permission- and deployment-gated shortcuts
  const canReadDocuments = hasPermission(permissions, PERMISSION_KEYS.engineeringDocumentsRead);
  const canReadRfis = hasPermission(permissions, PERMISSION_KEYS.engineeringRfisRead);
  const canReadSubmittals = hasPermission(permissions, PERMISSION_KEYS.engineeringSubmittalsRead);
  const canReadSiteLogs = hasPermission(permissions, PERMISSION_KEYS.engineeringSiteLogsRead);
  const canReadInvoices = hasPermission(permissions, PERMISSION_KEYS.invoicesRead);
  const canReadExpenses = hasPermission(permissions, PERMISSION_KEYS.expensesRead);
  const canReadPayroll = hasPermission(permissions, PERMISSION_KEYS.payrollRead);
  const canReadPeople = hasPermission(permissions, PERMISSION_KEYS.workersRead);
  const canReadReports = hasAnyPermission(permissions, [PERMISSION_KEYS.reportsRead, PERMISSION_KEYS.reportsPayrollRead]);

  const shortcuts: Array<{ tab: ProjectOverviewTab; label: string; icon: React.ElementType }> = [
    ...(isProjectWorkspaceTabDeploymentVisible("budget") ? [{ tab: "budget" as const, label: "Budget Control", icon: Calculator }] : []),
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
                  : `${percent(managementView.confirmedUtilization)} budget used · ${percent(managementView.commitmentUtilization)} with pending exposure`}
            </p>
          </div>
        </div>
      </section>

      {/* 3. Primary Management Financial Snapshot */}
      <section aria-labelledby="primary-financial-snapshot-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="primary-financial-snapshot-heading" className="text-sm font-black text-slate-950">
              Project Financial Snapshot
            </h3>
            <p className="text-[10px] text-slate-500">
              Authoritative financial positions derived from verified supplier invoices, approved payroll, and confirmed expenses.
            </p>
          </div>
          {hasForeignAmounts && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Mixed currencies present
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* 1. Contract Value */}
          <Card className="p-4 shadow-sm" elevation="low">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[10px] font-semibold">Contract Value</span>
              <Wallet className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            </div>
            <p className="mt-2 text-base font-black tabular-nums text-slate-950">
              {money(managementView.contractValue, managementView.currency)}
            </p>
            <p className="mt-1 text-[9px] text-slate-400">Awarded contract value</p>
          </Card>

          {/* 2. Approved Cost Budget */}
          <Card className="p-4 shadow-sm" elevation="low">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[10px] font-semibold">Approved Cost Budget</span>
              <Calculator className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            </div>
            <p className="mt-2 text-base font-black tabular-nums text-slate-950">
              {money(managementView.approvedCostBudget, managementView.currency)}
            </p>
            <p className="mt-1 text-[9px] text-slate-400">Planned cost ceiling</p>
          </Card>

          {/* 3. Actual Cost */}
          <Card className="p-4 shadow-sm" elevation="low">
            <div className="flex items-center justify-between text-indigo-700">
              <span className="text-[10px] font-bold">Actual Cost</span>
              <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <p className="mt-2 text-base font-black tabular-nums text-indigo-700">
              {money(managementView.actualCost, managementView.currency)}
            </p>
            <p className="mt-1 text-[9px] text-slate-500">
              {hasForeignAmounts
                ? "Authoritative base total"
                : managementView.isPartial
                  ? "Partial cost aggregate"
                  : `${percent(managementView.confirmedUtilization)} of budget`}
            </p>
          </Card>

          {/* 4. Committed Cost (P2A) */}
          <Card className="p-4 shadow-sm" elevation="low">
            <div className="flex items-center justify-between text-purple-700">
              <span className="text-[10px] font-bold">Committed Cost</span>
              <ShoppingCart className="h-3.5 w-3.5 text-purple-600" aria-hidden="true" />
            </div>
            <p className="mt-2 text-base font-black tabular-nums text-purple-800">
              {money(managementView.committedCost, managementView.currency)}
            </p>
            <p className="mt-1 text-[9px] text-slate-500">
              Active PO obligations (Approved / Issued)
            </p>
          </Card>

          {/* 5. Pending Cost Exposure */}
          <Card className="p-4 shadow-sm" elevation="low">
            <div className="flex items-center justify-between text-amber-700">
              <span className="text-[10px] font-bold">Pending Exposure</span>
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <p className="mt-2 text-base font-black tabular-nums text-amber-800">
              {money(managementView.pendingCostExposure, managementView.currency)}
            </p>
            <p className="mt-1 text-[9px] text-slate-500">Unconfirmed invoices & draft costs</p>
          </Card>

          {/* 6. Budget Remaining / Variance */}
          <Card className="p-4 shadow-sm col-span-2 sm:col-span-1" elevation="low">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[10px] font-semibold">Budget Remaining</span>
              <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            </div>
            <p
              className={`mt-2 text-base font-black tabular-nums ${
                managementView.remainingBudget !== null && managementView.remainingBudget < 0
                  ? "text-rose-700"
                  : "text-emerald-700"
              }`}
            >
              {managementView.isPartial ? "Partial" : money(managementView.remainingBudget, managementView.currency)}
            </p>
            <p className="mt-1 text-[9px] text-slate-400">
              {managementView.isPartial
                ? "Withheld due to foreign FX or incomplete sources"
                : managementView.remainingBudget !== null && managementView.remainingBudget < 0
                  ? "Exceeds approved budget"
                  : "Remaining cost headroom"}
            </p>
          </Card>
        </div>
      </section>

      {/* 4. Budget Control & Work Packages Section */}
      <Card className="p-4 shadow-sm sm:p-5" elevation="low">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <Calculator className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-950">Work Package Budget Control (P1B)</h3>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Work package cost codes, approved allocations, coded vs. uncoded actual costs, and forecast tracking.
              </p>
            </div>
          </div>
          {onOpenTab && (
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
              {managementView.costClassificationAvailable && managementView.codedActualCost !== null
                ? money(managementView.codedActualCost, managementView.currency)
                : "Unavailable in overview"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-500">Uncoded Actual Cost</p>
            <p className={`mt-1 text-sm font-black tabular-nums ${managementView.uncodedActualCost !== null && managementView.uncodedActualCost > 0 && managementView.activeCostCodesCount > 0 ? "text-amber-700" : "text-slate-900"}`}>
              {managementView.costClassificationAvailable && managementView.uncodedActualCost !== null
                ? money(managementView.uncodedActualCost, managementView.currency)
                : "Unavailable in overview"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-500">Forecast Final Cost</p>
            <p className={`mt-1 text-sm font-black tabular-nums ${managementView.forecastVariance !== null && managementView.forecastVariance < 0 ? "text-rose-700" : "text-slate-900"}`}>
              {managementView.hasExplicitForecast && managementView.forecastFinalCost !== null
                ? money(managementView.forecastFinalCost, managementView.currency)
                : managementView.activeCostCodesCount > 0
                  ? "Incomplete / Not set"
                  : "Not set"}
            </p>
          </div>
        </div>
      </Card>

      {/* 5. Commercial Controls Explanatory Notice (P2 Deferred) */}
      <Card className="border-dashed border-slate-200 bg-slate-50/70 p-4 shadow-none" elevation="low">
        <div className="flex items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <div className="min-w-0 text-xs">
            <h4 className="font-bold text-slate-800">Commercial Controls Deferred to P2</h4>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              <strong>Committed Cost</strong> (PO/Subcontract commitments), <strong>Client Progress Billing</strong>,{" "}
              <strong>Collections</strong>, and <strong>Outstanding Receivables</strong> remain intentionally unavailable
              until P2 Commercial Operations are implemented. Engoryx does not fabricate zero values for unbuilt modules.
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
              Actual cost, pending exposure, remaining base-currency budget, and over-budget excess reconcile to the project cost row.
            </p>
          </div>
          <BarChart3 className="h-4 w-4 text-indigo-500" aria-hidden="true" />
        </div>
        {hasForeignAmounts ? (
          <ChartEmpty message="Complete budget position withheld while unconverted foreign-currency costs are present." />
        ) : dashboard.budget <= 0 && dashboard.confirmed === 0 && dashboard.pending === 0 ? (
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
                <Bar dataKey="pending" stackId="position" fill="#f59e0b" name="Pending Exposure" />
                <Bar dataKey="remaining" stackId="position" fill="#cbd5e1" name="Remaining Budget" />
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
          {!compositionTotal ? (
            <ChartEmpty message="No actual project costs recorded yet." />
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
