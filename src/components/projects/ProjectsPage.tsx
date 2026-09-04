import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowUpDown,
  BriefcaseBusiness,
  ChevronDown,
  Coins,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import type {
  Project,
  ProjectCostCode,
  ProjectCostSummary,
  ProjectStatus,
  PurchaseOrder,
  Subcontract,
  SubcontractProgressClaim,
  SubcontractVariation,
} from "../../types.ts";
import type { ClientBilling } from "../../lib/clientBilling.ts";
import type { ClientCollection } from "../../lib/clientCollections.ts";
import type { EngineeringCoordinationWorkspaceData } from "../../lib/engineeringCoordination.ts";
import type {
  ProjectLifecycleAction,
  ProjectLifecyclePreview,
} from "../../lib/projects.ts";
import { projectCostMissingSourceLabels } from "../../utils/dataCompleteness.ts";
import {
  useAppPermissions,
  useProjectCostCompleteness,
  useWorkspaceDataPending,
} from "../../app/AppPermissionContext.tsx";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { MetricCard, PageHeader, StatusBadge, type StatusTone } from "../ui/OperationsUI.tsx";
import { useDialogFocus } from "../ui/useDialogFocus.ts";
import {
  buildPortfolioManagementSummary,
  buildProjectManagementView,
  filterAndSortProjectViews,
  topProjectAttentionSignal,
  type ProjectAttentionCategory,
  type PortfolioMetricAggregate,
  type ProjectHealthFilter,
  type ProjectManagementHealth,
  type ProjectManagementView,
  type ProjectSortDirection,
  type ProjectSortField,
} from "../../utils/projectManagementViewModel.ts";
import type { ProjectFinancialMetric } from "../../utils/projectFinancialSummary.ts";

const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
  "ARCHIVED",
];

interface ProjectsPageProps {
  projects: Project[];
  summaries: Record<string, ProjectCostSummary>;
  clientBillings?: readonly ClientBilling[];
  clientCollections?: readonly ClientCollection[];
  clientFinancialDataLoading?: boolean;
  costCodes?: readonly ProjectCostCode[];
  purchaseOrders?: PurchaseOrder[];
  subcontracts?: Subcontract[];
  subcontractClaims?: SubcontractProgressClaim[];
  subcontractVariations?: SubcontractVariation[];
  engineeringCoordinationData?: EngineeringCoordinationWorkspaceData;
  attentionToday?: string;
  initialEditingProject?: Project | null;
  onOpenProject: (project: Project) => void;
  onSaveProject: (project: Project) => void;
  onPreviewProjectLifecycle: (project: Project) => Promise<ProjectLifecyclePreview>;
  onApplyProjectLifecycle: (
    project: Project,
    action: ProjectLifecycleAction,
    reason?: string,
  ) => Promise<void>;
}

function blankProject(): Project {
  return {
    id: "",
    projectCode: "",
    projectName: "",
    clientName: "",
    location: "",
    siteAddress: "",
    projectManager: "",
    status: "ACTIVE",
    contractValue: 0,
    projectBudget: 0,
    currency: "PHP",
    description: "",
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function money(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return `${currency} ${(Number(value) || 0).toFixed(2)}`;
  }
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

function healthBadgeTone(health: ProjectManagementHealth): StatusTone {
  switch (health) {
    case "OVER BUDGET":
      return "danger";
    case "NEAR LIMIT":
      return "warning";
    case "PARTIAL":
      return "warning";
    case "NO BUDGET":
      return "neutral";
    default:
      return "success";
  }
}

function attentionTone(tone: "danger" | "warning" | "info" | "neutral") {
  switch (tone) {
    case "danger":
      return "bg-rose-50 text-rose-800 border-rose-200";
    case "warning":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "info":
      return "bg-indigo-50 text-indigo-800 border-indigo-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function financialValue(metric: ProjectFinancialMetric, currency: string) {
  if (metric.status === "unavailable" || metric.amount === undefined) return "Unavailable";
  return money(metric.amount, metric.currency || currency);
}

function FinancialValue({
  metric,
  currency,
  className = "",
}: {
  metric: ProjectFinancialMetric;
  currency: string;
  className?: string;
}) {
  return (
    <span
      className={className}
      title={metric.reason}
      data-financial-status={metric.status}
    >
      {financialValue(metric, currency)}
      {metric.status === "partial" && <span className="ml-1 text-[9px] font-bold text-amber-700">Partial</span>}
    </span>
  );
}

function PortfolioFinancialValue({
  metric,
  currency,
}: {
  metric: PortfolioMetricAggregate;
  currency: string;
}) {
  const value = metric.status === "unavailable" || metric.amount === undefined
    ? "Unavailable"
    : money(metric.amount, currency);
  const statusLabel = metric.status === "partial"
    ? `Partial · ${metric.includedProjectCount} of ${metric.projectCount} included`
    : metric.status === "unavailable"
      ? `Unavailable · 0 of ${metric.projectCount} included`
      : undefined;

  return (
    <span data-financial-status={metric.status}>
      <strong className="font-sans font-bold tabular-nums text-slate-900">{value}</strong>
      {statusLabel && <span className="mt-0.5 block text-[9px] font-bold text-amber-700">{statusLabel}</span>}
    </span>
  );
}

function portfolioMetricInline(metric: PortfolioMetricAggregate, currency: string) {
  if (metric.status === "unavailable" || metric.amount === undefined) return "Unavailable";
  const value = money(metric.amount, currency);
  return metric.status === "partial"
    ? `${value} (Partial · ${metric.includedProjectCount} of ${metric.projectCount} included)`
    : value;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  projects,
  summaries,
  clientBillings,
  clientCollections,
  clientFinancialDataLoading = false,
  costCodes = [],
  purchaseOrders = [],
  subcontracts = [],
  subcontractClaims = [],
  subcontractVariations = [],
  engineeringCoordinationData,
  attentionToday,
  initialEditingProject,
  onOpenProject,
  onSaveProject,
  onPreviewProjectLifecycle,
  onApplyProjectLifecycle,
}) => {
  const permissions = useAppPermissions();
  const canManage = hasPermission(permissions, PERMISSION_KEYS.projectsWrite);
  const completeness = useProjectCostCompleteness();
  const workspaceDataPending = useWorkspaceDataPending();
  const hiddenCostSources = projectCostMissingSourceLabels(completeness);
  const costDataComplete = completeness.complete;

  // Search, Filters & Sorting
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | ProjectStatus>("ALL");
  const [managerFilter, setManagerFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [healthFilter, setHealthFilter] = useState<ProjectHealthFilter>("ALL");
  const [attentionCategoryFilter, setAttentionCategoryFilter] = useState<"ALL" | ProjectAttentionCategory>("ALL");
  const [sortField, setSortField] = useState<ProjectSortField>("code");
  const [sortDirection, setSortDirection] = useState<ProjectSortDirection>("asc");

  // Lifecycle & Editing state
  const [editing, setEditing] = useState<Project | null>(null);
  const [lifecycleProject, setLifecycleProject] = useState<Project | null>(null);
  const [lifecyclePreview, setLifecyclePreview] = useState<ProjectLifecyclePreview | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [lifecycleReason, setLifecycleReason] = useState("");

  useEffect(() => {
    if (canManage && initialEditingProject) setEditing(initialEditingProject);
  }, [canManage, initialEditingProject]);

  // 1. Build Single Source-of-Truth Project Management Views
  const projectViews = useMemo<ProjectManagementView[]>(() => {
    return projects.map((p) => {
      const summary = summaries[p.id] || ({
        budget: p.projectBudget,
        invoiceCost: 0,
        paidInvoiceCost: 0,
        unpaidInvoiceCost: 0,
        unallocatedPayrollCost: 0,
        pendingInvoiceCost: 0,
        payrollCost: 0,
        pendingPayrollCost: 0,
        otherExpenseCost: 0,
        pendingExpenseCost: 0,
        totalActualCost: 0,
        committedCost: 0,
        remainingBudget: p.projectBudget,
        budgetUsedPercent: 0,
        foreignCosts: {},
        unallocatedInvoiceCost: 0,
        unallocatedExpenseCost: 0,
      } as ProjectCostSummary);

      return buildProjectManagementView(p, summary, {
        costCodes,
        // Portfolio rows have aggregate actual-cost truth, not invoice/expense/payroll transaction detail.
        // Keep procurement-only detail out of cost-code actual classification so it remains fail-closed.
        subcontractClaims,
        financialDataComplete: costDataComplete,
        clientBillings: clientFinancialDataLoading ? undefined : clientBillings,
        clientCollections: clientFinancialDataLoading ? undefined : clientCollections,
        today: attentionToday,
        engineering: engineeringCoordinationData
          ? { rfis: engineeringCoordinationData.rfis, submittals: engineeringCoordinationData.submittals }
          : undefined,
      });
    });
  }, [attentionToday, clientBillings, clientCollections, clientFinancialDataLoading, costDataComplete, costCodes, engineeringCoordinationData, purchaseOrders, subcontractClaims, subcontractVariations, subcontracts, projects, summaries]);

  // 2. Portfolio Management Summary (Multi-currency safe)
  const portfolio = useMemo(() => {
    return buildPortfolioManagementSummary(projectViews);
  }, [projectViews]);

  // 3. Filtered and Sorted Views
  const displayedViews = useMemo(() => {
    return filterAndSortProjectViews(projectViews, {
      searchQuery: query,
      statusFilter: status,
      managerFilter,
      currencyFilter,
      healthFilter,
      attentionCategoryFilter,
      sortField,
      sortDirection,
    });
  }, [projectViews, query, status, managerFilter, currencyFilter, healthFilter, attentionCategoryFilter, sortField, sortDirection]);

  const managerOptions = useMemo(
    () => [...new Set(projectViews.map((view) => view.project.projectManager?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)),
    [projectViews],
  );
  const currencyOptions = useMemo(
    () => [...new Set(projectViews.map((view) => view.currency))].sort((a, b) => a.localeCompare(b)),
    [projectViews],
  );

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || !editing?.projectCode.trim() || !editing.projectName.trim()) return;
    onSaveProject({
      ...editing,
      projectCode: editing.projectCode.trim(),
      projectName: editing.projectName.trim(),
      currency: (editing.currency || "PHP").toUpperCase(),
      contractValue: Math.max(0, Number(editing.contractValue) || 0),
      projectBudget: Math.max(0, Number(editing.projectBudget) || 0),
    });
    setEditing(null);
  };

  const openLifecycle = async (project: Project) => {
    setLifecycleProject(project);
    setLifecyclePreview(null);
    setLifecycleError("");
    setLifecycleReason("");
    setLifecycleLoading(true);
    try {
      setLifecyclePreview(await onPreviewProjectLifecycle(project));
    } catch {
      setLifecycleError("Could not load the project lifecycle preview. No lifecycle action was taken.");
    } finally {
      setLifecycleLoading(false);
    }
  };

  const closeLifecycle = () => {
    setLifecycleProject(null);
    setLifecyclePreview(null);
    setLifecycleError("");
    setLifecycleReason("");
  };

  const projectCodeInputRef = useRef<HTMLInputElement>(null);
  const lifecycleCloseButtonRef = useRef<HTMLButtonElement>(null);
  const editingDialogRef = useDialogFocus({ open: Boolean(editing), onClose: () => setEditing(null), initialFocusRef: projectCodeInputRef });
  const lifecycleDialogRef = useDialogFocus({ open: Boolean(lifecycleProject), onClose: () => { if (!lifecycleLoading) closeLifecycle(); }, initialFocusRef: lifecycleCloseButtonRef });

  useEffect(() => {
    if (!lifecycleProject || lifecycleLoading) return;
    lifecycleCloseButtonRef.current?.focus({ preventScroll: true });
  }, [lifecycleProject, lifecycleLoading]);

  const applyLifecycle = async (action: ProjectLifecycleAction) => {
    if (!lifecycleProject || !lifecyclePreview) return;
    if (action === "DELETE_UNUSED" && !lifecyclePreview.canDelete) return;
    if ((action === "ARCHIVE" || action === "REACTIVATE") && lifecycleReason.trim().length < 3) return;
    setLifecycleLoading(true);
    setLifecycleError("");
    try {
      await onApplyProjectLifecycle(lifecycleProject, action, lifecycleReason.trim() || undefined);
      closeLifecycle();
    } catch {
      setLifecycleError("Could not complete the project lifecycle action. Nothing was changed.");
    } finally {
      setLifecycleLoading(false);
    }
  };

  const isHydrating = workspaceDataPending && projects.length === 0;
  const hasProjectFilters = Boolean(query.trim()) || status !== "ALL" || managerFilter !== "ALL" || currencyFilter !== "ALL" || healthFilter !== "ALL" || attentionCategoryFilter !== "ALL";
  const projectResultLabel = `${displayedViews.length} of ${projects.length} project${projects.length === 1 ? "" : "s"}`;

  const toggleSort = (field: ProjectSortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Engineering operations"
        title="Portfolio Management"
        description="Compare project ownership, lifecycle status, contract value, approved cost budget, cost position, and client commercial position from the existing project records."
        actions={canManage ? <Button variant="primary" label="New project" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing(blankProject())} /> : undefined}
      />

      {isHydrating && (
        <div role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-600">
          Loading projects…
        </div>
      )}

      {!costDataComplete && !workspaceDataPending && (
        <Card className="border-dashed border-amber-200 bg-amber-50/70 p-4" elevation="low">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0 text-xs">
              <strong className="block font-bold text-amber-950">Some project cost metrics are unavailable</strong>
              <p className="mt-0.5 text-amber-900">
                Required cost sources are unavailable for this role: {hiddenCostSources.join(", ")}. Cost values are marked
                unavailable in the portfolio rather than shown as zero; contract and commercial source records remain separate.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Top Portfolio Management Summary */}
      <section aria-label="Portfolio Management Summary" className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Project counts">
          <MetricCard label="Total projects" value={portfolio.totalProjects} loading={isHydrating} icon={BriefcaseBusiness} tone="info" />
          <MetricCard label="Active" value={portfolio.activeProjects} loading={isHydrating} tone="success" />
          <MetricCard label="On hold" value={portfolio.onHoldProjects} loading={isHydrating} tone="warning" />
          <MetricCard label="Archived" value={portfolio.archivedProjects} loading={isHydrating} tone="neutral" />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Project management attention counts">
          <MetricCard label="Needs attention" value={portfolio.projectsNeedingAttentionCount} loading={isHydrating} icon={ShieldAlert} tone={portfolio.projectsNeedingAttentionCount > 0 ? "warning" : "success"} />
          <MetricCard label="Critical signals" value={portfolio.criticalAttentionCount} loading={isHydrating} tone={portfolio.criticalAttentionCount > 0 ? "danger" : "neutral"} />
          <MetricCard label="Warning signals" value={portfolio.warningAttentionCount} loading={isHydrating} tone={portfolio.warningAttentionCount > 0 ? "warning" : "neutral"} />
          <MetricCard label="Info signals" value={portfolio.infoAttentionCount} loading={isHydrating} tone="info" />
        </div>

        {/* Currency Grouped Totals */}
        {portfolio.currencies.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Portfolio Financial Totals">
            {portfolio.currencies.map((currencyCode) => {
              const group = portfolio.currencyGroups[currencyCode];
              if (!group) return null;
              const metrics: Array<[string, PortfolioMetricAggregate]> = [
                ["Contract Value", group.financialMetrics.contractValue],
                ["Approved Budget", group.financialMetrics.approvedCostBudget],
                ["Actual Cost", group.financialMetrics.actualCost],
                ["Committed Cost", group.financialMetrics.committedCost],
                ["Billed", group.financialMetrics.billed],
                ["Collected", group.financialMetrics.collected],
                ["Outstanding", group.financialMetrics.outstandingReceivables],
                ["Remaining to Bill", group.financialMetrics.remainingToBill],
              ];
              return (
                <Card key={currencyCode} className="p-4 shadow-sm" elevation="low" data-portfolio-currency={currencyCode}>
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-indigo-700">
                      <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                      {currencyCode} Portfolio ({group.projectCount})
                    </span>
                    {!group.isComplete && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                        Partial / unavailable
                      </span>
                    )}
                  </div>
                  <div className="mt-3 space-y-1.5 text-xs">
                    {metrics.map(([label, metric]) => (
                      <div key={label} className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">{label}</span>
                        <PortfolioFinancialValue metric={metric} currency={currencyCode} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-slate-100 pt-2 text-[9px] text-slate-500">
                    <span>Optional cost controls: </span>
                    {`pending ${portfolioMetricInline(group.financialMetrics.pendingCostExposure, currencyCode)}`}
                    {` · payables ${portfolioMetricInline(group.financialMetrics.outstandingPayables, currencyCode)}`}
                  </div>
                </Card>
              );
            })}

            {/* Operational Management Signals Card */}
            <Card className="p-4 shadow-sm" elevation="low">
              <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2.5 text-xs font-black uppercase text-slate-700">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                Attention Signals
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Critical:</span><strong className={`tabular-nums ${portfolio.criticalAttentionCount > 0 ? "font-bold text-rose-700" : "text-slate-700"}`}>{portfolio.criticalAttentionCount}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500">Warning:</span><strong className={`tabular-nums ${portfolio.warningAttentionCount > 0 ? "font-bold text-amber-700" : "text-slate-700"}`}>{portfolio.warningAttentionCount}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500">Informational:</span><strong className="tabular-nums text-slate-700">{portfolio.infoAttentionCount}</strong></div>
                <p className="border-t border-slate-100 pt-2 text-[9px] leading-4 text-slate-500">Counts are project/signal counts only; financial amounts remain grouped by currency below.</p>
              </div>
            </Card>
          </div>
        )}
      </section>

      {/* Filter and Search Toolbar */}
      <Card className="p-4 shadow-sm space-y-3" elevation="low">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
          {/* Search Query */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search code, name, client, PM, location..."
              className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="Search projects"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "ALL" | ProjectStatus)}
              className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="Filter by project status"
            >
              <option value="ALL">All Statuses</option>
              {PROJECT_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>

          {/* Project Manager Filter */}
          <div className="relative">
            <select
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
              className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="Filter by project manager"
            >
              <option value="ALL">All Project Managers</option>
              {managerOptions.map((manager) => <option key={manager} value={manager}>{manager}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>

          {/* Currency Filter */}
          <div className="relative">
            <select
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
              className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="Filter by project currency"
            >
              <option value="ALL">All Currencies</option>
              {currencyOptions.map((currencyCode) => <option key={currencyCode} value={currencyCode}>{currencyCode}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>

          {/* Health & Attention Filter */}
          <div className="relative">
            <select
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value as ProjectHealthFilter)}
              className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="Filter by financial health and attention signals"
            >
              <option value="ALL">All Financial / Attention States</option>
              <option value="NEEDS_ATTENTION">Needs Attention</option>
              <option value="CRITICAL">Critical</option>
              <option value="WARNING">Warning</option>
              <option value="INFO">Informational</option>
              <option value="ON_BUDGET">On Budget</option>
              <option value="NEAR_BUDGET">Near Limit (≥90%)</option>
              <option value="OVER_BUDGET">Over Budget</option>
              <option value="NO_BUDGET">No Budget Set</option>
              <option value="UNCODED_COST">Has Uncoded Cost</option>
              <option value="MISSING_FORECAST">Missing Forecast</option>
              <option value="PENDING_EXPOSURE">Has Pending Exposure</option>
              <option value="MIXED_CURRENCY">Mixed Currency</option>
              <option value="PARTIAL_DATA">Partial Data</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>

          {/* Attention Category Filter */}
          <div className="relative">
            <select
              value={attentionCategoryFilter}
              onChange={(e) => setAttentionCategoryFilter(e.target.value as "ALL" | ProjectAttentionCategory)}
              className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="Filter by attention category"
            >
              <option value="ALL">All Attention Categories</option>
              <option value="financial">Financial</option>
              <option value="commercial">Commercial</option>
              <option value="procurement">Procurement</option>
              <option value="engineering">Engineering</option>
              <option value="schedule">Schedule</option>
              <option value="data-quality">Data quality</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>

          {/* Sort Selector */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as ProjectSortField)}
                className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                aria-label="Sort projects by field"
              >
                <option value="attention">Attention Severity</option>
                <option value="code">Sort by Code</option>
                <option value="name">Sort by Name</option>
                <option value="client">Sort by Client</option>
                <option value="status">Sort by Status</option>
                <option value="contractValue">Sort by Contract Value</option>
                <option value="projectBudget">Sort by Cost Budget</option>
                <option value="actualCost">Sort by Actual Cost</option>
                <option value="committedCost">Sort by Committed Cost</option>
                <option value="billed">Sort by Billed</option>
                <option value="collected">Sort by Collected</option>
                <option value="outstandingReceivables">Sort by Outstanding</option>
                <option value="remainingToBill">Sort by Remaining to Bill</option>
                <option value="remainingBudget">Sort by Remaining Budget</option>
                <option value="utilization">Sort by Utilization %</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            </div>
            <button
              type="button"
              onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              title={`Sort direction: ${sortDirection.toUpperCase()}`}
              aria-label={`Toggle sort direction, currently ${sortDirection}`}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Filter Summary & Reset Bar */}
        {hasProjectFilters && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
            <span>
              Showing {projectResultLabel}
            </span>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("ALL");
                setManagerFilter("ALL");
                setCurrencyFilter("ALL");
                setHealthFilter("ALL");
                setAttentionCategoryFilter("ALL");
              }}
              className="text-indigo-600 hover:text-indigo-800 font-semibold"
            >
              Reset filters
            </button>
          </div>
        )}
      </Card>

      {/* Main Content Area: Responsive Hybrid (Desktop Table + Mobile Cards) */}
      {displayedViews.length ? (
        <div id="projects-results" className="space-y-4">
          {/* Desktop Table View */}
          <Card className="hidden overflow-hidden p-0 lg:block" elevation="low" aria-label="Projects table">
            <div className="ops-scrollbar overflow-auto">
              <table className="ops-table min-w-[1600px] w-full text-left text-xs">
                <caption className="sr-only">Project register results: {projectResultLabel}</caption>
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("code")}>
                      Project Code / Name
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Project Manager
                    </th>
                    <th scope="col" className="px-3 py-3 cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("status")}>
                      Status & Data Quality
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Currency
                    </th>
                    <th scope="col" className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("contractValue")}>
                      Contract Value
                    </th>
                    <th scope="col" className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("projectBudget")}>
                      Budget
                    </th>
                    <th scope="col" className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("actualCost")}>
                      Actual
                    </th>
                    <th scope="col" className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("committedCost")}>
                      Committed
                    </th>
                    <th scope="col" className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("billed")}>
                      Billed
                    </th>
                    <th scope="col" className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("collected")}>
                      Collected
                    </th>
                    <th scope="col" className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("outstandingReceivables")}>
                      Outstanding
                    </th>
                    <th scope="col" className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("remainingToBill")}>
                      Remaining to Bill
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedViews.map((view) => {
                    const project = view.project;
                    const hasAttention = view.attentionFlags.length > 0;
                    const topAttention = topProjectAttentionSignal(view);

                    return (
                      <tr key={project.id} data-project-id={project.id} className="align-top transition hover:bg-slate-50/80">
                        {/* 1. Project */}
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => onOpenProject(project)}
                            className="text-left hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                          >
                            <span className="block text-[10px] font-black uppercase tracking-wide text-indigo-600">
                              {project.projectCode}
                            </span>
                            <strong className="mt-0.5 block text-xs font-bold text-slate-900">
                              {project.projectName}
                            </strong>
                          </button>
                          <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                            {project.clientName || "No client set"} {project.location ? `· ${project.location}` : ""}
                          </span>
                        </td>

                        {/* 2. Project Manager */}
                        <td className="px-3 py-3 text-xs font-semibold text-slate-700">
                          {project.projectManager || "Not assigned"}
                        </td>

                        {/* 3. Status & Data Quality */}
                        <td className="px-3 py-3 space-y-1">
                          <div className="flex flex-wrap items-center gap-1">
                            <StatusBadge tone={statusTone(project.status)}>
                              {project.status.replaceAll("_", " ")}
                            </StatusBadge>
                            {view.health !== "ON BUDGET" && (
                              <StatusBadge tone={healthBadgeTone(view.health)}>
                                {view.health}
                              </StatusBadge>
                            )}
                          </div>
                          {hasAttention && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-black text-slate-700" aria-label={`${view.attentionFlags.length} management attention signal${view.attentionFlags.length === 1 ? "" : "s"}`}>
                                {view.attentionFlags.length} attention signal{view.attentionFlags.length === 1 ? "" : "s"}
                              </span>
                              {view.attentionFlags.slice(0, 2).map((item) => (
                                <span
                                  key={item.id}
                                  className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${attentionTone(item.tone)}`}
                                  title={item.detail}
                                >
                                  {item.label}
                                </span>
                              ))}
                              {view.attentionFlags.length > 2 && (
                                <span className="text-[9px] font-semibold text-slate-400">
                                  +{view.attentionFlags.length - 2} more
                                </span>
                              )}
                            </div>
                          )}
                          {topAttention && <span className="block max-w-[18rem] truncate text-[9px] font-semibold text-slate-600" title={topAttention.explanation}>Top reason: {topAttention.title}</span>}
                          {view.isPartial && <span className="block text-[9px] font-bold text-amber-700">Partial project data</span>}
                        </td>

                        {/* 4. Currency */}
                        <td className="px-3 py-3 text-xs font-black uppercase tracking-wide text-slate-700">
                          {view.currency}
                        </td>

                        {/* 5. Contract Value */}
                        <td className="px-3 py-3 text-right font-sans font-bold tabular-nums text-slate-800">
                          <FinancialValue metric={view.financialTruth.contractValue} currency={view.currency} />
                        </td>

                        {/* 6. Approved Cost Budget */}
                        <td className="px-3 py-3 text-right font-sans font-bold tabular-nums text-slate-900">
                          <FinancialValue metric={view.financialTruth.approvedCostBudget} currency={view.currency} />
                        </td>

                        {/* 7. Actual Cost */}
                        <td className="px-3 py-3 text-right font-sans font-bold tabular-nums text-indigo-700">
                          <FinancialValue metric={view.financialTruth.actualCost} currency={view.currency} />
                        </td>

                        {/* 8. Committed Cost */}
                        <td className="px-3 py-3 text-right font-sans font-bold tabular-nums text-slate-800">
                          <FinancialValue metric={view.financialTruth.committedCost} currency={view.currency} />
                        </td>

                        {/* 9. Billed */}
                        <td className="px-3 py-3 text-right font-sans font-bold tabular-nums text-slate-800">
                          <FinancialValue metric={view.financialTruth.billed} currency={view.currency} />
                        </td>

                        {/* 10. Collected */}
                        <td className="px-3 py-3 text-right font-sans font-bold tabular-nums text-slate-800">
                          <FinancialValue metric={view.financialTruth.collected} currency={view.currency} />
                        </td>

                        {/* 11. Outstanding */}
                        <td className="px-3 py-3 text-right font-sans font-bold tabular-nums text-amber-800">
                          <FinancialValue metric={view.financialTruth.outstandingReceivables} currency={view.currency} />
                        </td>

                        {/* 12. Remaining to Bill */}
                        <td className="px-3 py-3 text-right font-sans font-bold tabular-nums text-emerald-700">
                          <FinancialValue metric={view.financialTruth.remainingToBill} currency={view.currency} />
                        </td>

                        {/* 13. Actions */}
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => onOpenProject(project)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            >
                              Open
                            </button>
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => setEditing(project)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="Edit project"
                                aria-label={`Edit project ${project.projectCode}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canManage && project.status !== "ARCHIVED" && (
                              <button
                                type="button"
                                onClick={() => openLifecycle(project)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                                title="Project lifecycle"
                                aria-label={`Project lifecycle for ${project.projectCode}`}
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canManage && project.status === "ARCHIVED" && (
                              <button
                                type="button"
                                onClick={() => openLifecycle(project)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"
                                title="Reactivate project"
                                aria-label={`Reactivate project ${project.projectCode}`}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile / Tablet Responsive Cards View */}
          <div className="grid gap-3.5 lg:hidden" aria-label="Projects list cards">
            {displayedViews.map((view) => {
              const project = view.project;
              const hasAttention = view.attentionFlags.length > 0;
              const topAttention = topProjectAttentionSignal(view);

              return (
                <Card key={project.id} className="p-4 shadow-sm space-y-3" elevation="low">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-black uppercase tracking-wide text-indigo-600">
                        {project.projectCode}
                      </span>
                      <h3 className="truncate text-sm font-black text-slate-950">
                        {project.projectName}
                      </h3>
                      <p className="truncate text-[10px] text-slate-500">
                        {project.clientName || "No client set"} {project.location ? `· ${project.location}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge tone={statusTone(project.status)}>
                        {project.status.replaceAll("_", " ")}
                      </StatusBadge>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                    <span><span className="font-semibold text-slate-600">Manager:</span> {project.projectManager || "Not assigned"}</span>
                    <span className="font-black uppercase tracking-wide text-slate-700">{view.currency}</span>
                  </div>

                  {/* Attention Badges */}
                  {hasAttention && (
                    <div className="flex flex-wrap gap-1.5">
                      {view.attentionFlags.map((item) => (
                        <span
                          key={item.id}
                          className={`rounded border px-2 py-0.5 text-[9px] font-bold ${attentionTone(item.tone)}`}
                        >
                          {item.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {topAttention && <p className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[10px] leading-4 text-slate-600"><span className="font-black text-slate-700">Top reason:</span> {topAttention.title}</p>}

                  {/* 2-Column Metric Grid */}
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500">Contract Value</span>
                      <p className="font-bold tabular-nums text-slate-900"><FinancialValue metric={view.financialTruth.contractValue} currency={view.currency} /></p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Budget</span>
                      <p className="font-bold tabular-nums text-slate-900"><FinancialValue metric={view.financialTruth.approvedCostBudget} currency={view.currency} /></p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Actual</span>
                      <p className="font-bold tabular-nums text-indigo-700"><FinancialValue metric={view.financialTruth.actualCost} currency={view.currency} /></p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Committed</span>
                      <p className="font-bold tabular-nums text-slate-900"><FinancialValue metric={view.financialTruth.committedCost} currency={view.currency} /></p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Billed</span>
                      <p className="font-bold tabular-nums text-slate-900"><FinancialValue metric={view.financialTruth.billed} currency={view.currency} /></p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Collected</span>
                      <p className="font-bold tabular-nums text-slate-900"><FinancialValue metric={view.financialTruth.collected} currency={view.currency} /></p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Outstanding</span>
                      <p className="font-bold tabular-nums text-amber-800"><FinancialValue metric={view.financialTruth.outstandingReceivables} currency={view.currency} /></p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Remaining to Bill</span>
                      <p className="font-bold tabular-nums text-emerald-700"><FinancialValue metric={view.financialTruth.remainingToBill} currency={view.currency} /></p>
                    </div>
                  </div>

                  {/* Work Package Summary Line */}
                  {view.activeCostCodesCount > 0 && (
                    <div className="flex flex-wrap justify-between gap-1 text-[10px] text-slate-600 px-1">
                      <span>{view.activeCostCodesCount} active work packages ({money(view.allocatedCostCodeBudget, view.currency)} allocated)</span>
                      {view.costClassificationAvailable && view.uncodedActualCost !== null && view.uncodedActualCost > 0 && (
                        <span className="font-semibold text-amber-700">Uncoded: {money(view.uncodedActualCost, view.currency)}</span>
                      )}
                    </div>
                  )}

                  {/* Action Bar */}
                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                    <div className="flex gap-1">
                      {canManage && (
                        <Button
                          variant="secondary"
                          label="Edit"
                          icon={<Pencil className="h-3.5 w-3.5" />}
                          onClick={() => setEditing(project)}
                        />
                      )}
                      {canManage && (
                        <Button
                          variant="secondary"
                          label={project.status === "ARCHIVED" ? "Reactivate" : "Lifecycle"}
                          icon={project.status === "ARCHIVED" ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                          onClick={() => openLifecycle(project)}
                        />
                      )}
                    </div>
                    <Button
                      variant="primary"
                      label="Open Project →"
                      onClick={() => onOpenProject(project)}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <Card className="p-8 text-center text-xs text-slate-500" elevation="low">
          <p className="font-semibold text-slate-700">No projects match the current filters.</p>
          <p className="mt-1">Try adjusting your search query, status, or financial health filter.</p>
        </Card>
      )}

      {/* Editing Dialog Modal */}
      {canManage && editing && (
        <div
          ref={editingDialogRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-dialog-title"
        >
          <form
            onSubmit={save}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Project Register</p>
                <h2 id="project-dialog-title" className="text-lg font-black text-slate-950">
                  {editing.id ? `Edit ${editing.projectCode}` : "Create New Project"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close project modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Project Code *</label>
                <input
                  ref={projectCodeInputRef}
                  required
                  value={editing.projectCode}
                  onChange={(e) => setEditing({ ...editing, projectCode: e.target.value })}
                  placeholder="e.g. PRJ-2026-001"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Currency *</label>
                <input
                  required
                  value={editing.currency}
                  onChange={(e) => setEditing({ ...editing, currency: e.target.value.toUpperCase() })}
                  placeholder="PHP"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700">Project Name *</label>
              <input
                required
                value={editing.projectName}
                onChange={(e) => setEditing({ ...editing, projectName: e.target.value })}
                placeholder="e.g. Water Treatment Plant Upgrade"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Contract Value (Awarded)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editing.contractValue ?? ""}
                  onChange={(e) => setEditing({ ...editing, contractValue: Number(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Approved Cost Budget</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editing.projectBudget ?? ""}
                  onChange={(e) => setEditing({ ...editing, projectBudget: Number(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Client Name</label>
                <input
                  value={editing.clientName || ""}
                  onChange={(e) => setEditing({ ...editing, clientName: e.target.value })}
                  placeholder="e.g. Metro Water District"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Project Manager</label>
                <input
                  value={editing.projectManager || ""}
                  onChange={(e) => setEditing({ ...editing, projectManager: e.target.value })}
                  placeholder="e.g. Engr. Santos"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Location / City</label>
                <input
                  value={editing.location || ""}
                  onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                  placeholder="e.g. Quezon City"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Status</label>
                <select
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value as ProjectStatus })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                >
                  {PROJECT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700">Operational Notes / Scope</label>
              <textarea
                value={editing.description || editing.notes || ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value, notes: e.target.value })}
                rows={2}
                placeholder="Scope description or operational context..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button variant="secondary" type="button" label="Cancel" onClick={() => setEditing(null)} />
              <Button variant="primary" type="submit" label="Save project" />
            </div>
          </form>
        </div>
      )}

      {/* Lifecycle Action Modal */}
      {canManage && lifecycleProject && (
        <div
          ref={lifecycleDialogRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-lifecycle-title"
          aria-busy={lifecycleLoading}
        >
          <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Project Correction</p>
                <h2 id="project-lifecycle-title" className="mt-1 text-lg font-black text-slate-950">
                  {lifecycleProject.projectCode} · Lifecycle Options
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {lifecycleProject.projectName} · current state: {lifecycleProject.status.replaceAll("_", " ")}
                </p>
              </div>
              <button
                ref={lifecycleCloseButtonRef}
                type="button"
                onClick={closeLifecycle}
                disabled={lifecycleLoading}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Close project lifecycle dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {lifecycleLoading && !lifecyclePreview && (
              <p role="status" className="mt-5 rounded-xl bg-slate-50 p-4 text-xs font-semibold text-slate-600">
                Checking project dependencies…
              </p>
            )}

            {lifecycleError && (
              <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
                {lifecycleError}
              </p>
            )}

            {lifecyclePreview && (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-950">
                  <p className="font-black">
                    {lifecyclePreview.source === "database"
                      ? "Database-checked dependency summary"
                      : lifecyclePreview.source === "demo"
                        ? "Demo dependency summary"
                        : "Local dependency summary"}
                  </p>
                  <p className="mt-1">
                    {lifecyclePreview.totalDependencyCount
                      ? `${lifecyclePreview.totalDependencyCount} linked record${lifecyclePreview.totalDependencyCount === 1 ? "" : "s"} preserve this project identity.`
                      : "No linked operational or financial history was found."}
                  </p>
                  {lifecyclePreview.totalDependencyCount > 0 && (
                    <ul className="mt-2 grid gap-1 text-[10px] sm:grid-cols-2">
                      {Object.entries(lifecyclePreview.dependencies)
                        .filter(([, count]) => Number(count) > 0)
                        .map(([k, count]) => (
                          <li key={k} className="flex justify-between gap-2">
                            <span>{k.replaceAll(/([a-z])([A-Z])/g, "$1 $2")}</span>
                            <strong>{Number(count)}</strong>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>

                {lifecyclePreview.canDelete && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <p className="text-xs font-black text-rose-950">Delete Unused Project</p>
                    <p className="mt-1 text-[10px] leading-4 text-rose-900">
                      This permanently deletes the project because no operational or financial history exists.
                    </p>
                    <button
                      type="button"
                      disabled={lifecycleLoading}
                      onClick={() => void applyLifecycle("DELETE_UNUSED")}
                      className="mt-3 rounded-lg bg-rose-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40"
                    >
                      {lifecycleLoading ? "Deleting…" : "Delete unused project"}
                    </button>
                  </div>
                )}

                {lifecyclePreview.status !== "ARCHIVED" && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-black text-amber-950">Archive Project</p>
                    <p className="mt-1 text-[10px] leading-4 text-amber-900">
                      This keeps the project and its historical records but removes it from active workflows.
                    </p>
                    <input
                      value={lifecycleReason}
                      onChange={(e) => setLifecycleReason(e.target.value)}
                      placeholder="Reason for archive"
                      className="mt-3 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs"
                    />
                    <button
                      type="button"
                      disabled={lifecycleLoading || lifecycleReason.trim().length < 3}
                      onClick={() => void applyLifecycle("ARCHIVE")}
                      className="mt-3 rounded-lg bg-amber-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40"
                    >
                      {lifecycleLoading ? "Archiving…" : "Archive project"}
                    </button>
                  </div>
                )}

                {lifecyclePreview.status === "ARCHIVED" && lifecyclePreview.canReactivate && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-black text-emerald-950">Reactivate Project</p>
                    <p className="mt-1 text-[10px] leading-4 text-emerald-900">
                      This returns the project to its prior non-terminal workflow state. Historical records remain unchanged.
                    </p>
                    <input
                      value={lifecycleReason}
                      onChange={(e) => setLifecycleReason(e.target.value)}
                      placeholder="Reason for reactivation"
                      className="mt-3 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs"
                    />
                    <button
                      type="button"
                      disabled={lifecycleLoading || lifecycleReason.trim().length < 3}
                      onClick={() => void applyLifecycle("REACTIVATE")}
                      className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40"
                    >
                      {lifecycleLoading ? "Reactivating…" : "Reactivate project"}
                    </button>
                  </div>
                )}

                {lifecyclePreview.status === "ARCHIVED" && !lifecyclePreview.canReactivate && (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] leading-4 text-slate-600">
                    {lifecyclePreview.blockedReason || "This archived project cannot be reactivated because its prior state is unavailable or terminal."}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
