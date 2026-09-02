import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowDownUp,
  ArrowUpRight,
  BriefcaseBusiness,
  Calculator,
  ChevronRight,
  Coins,
  DollarSign,
  Filter,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import type { Project, ProjectCostCode, ProjectCostSummary, ProjectStatus } from "../../types.ts";
import { createLocalProject, type ProjectLifecycleAction, type ProjectLifecyclePreview } from "../../lib/projects.ts";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { useAppPermissions, useProjectCostCompleteness, useWorkspaceDataPending } from "../../app/AppPermissionContext.tsx";
import { projectCostMissingSourceLabels } from "../../utils/dataCompleteness.ts";
import { EmptyState, MetricCard, PageHeader, SectionHeader, StatusBadge, type StatusTone } from "../ui/OperationsUI.tsx";
import { useDialogFocus } from "../ui/useDialogFocus.ts";
import {
  buildPortfolioManagementSummary,
  buildProjectManagementView,
  filterAndSortProjectViews,
  type ProjectAttentionItem,
  type ProjectHealthFilter,
  type ProjectManagementHealth,
  type ProjectManagementView,
  type ProjectSortDirection,
  type ProjectSortField,
} from "../../utils/projectManagementViewModel.ts";

interface ProjectsPageProps {
  projects: Project[];
  summaries: Record<string, ProjectCostSummary>;
  costCodes?: readonly ProjectCostCode[];
  onOpenProject: (project: Project) => void;
  onSaveProject: (project: Project) => void;
  onPreviewProjectLifecycle: (project: Project) => Promise<ProjectLifecyclePreview>;
  onApplyProjectLifecycle: (project: Project, action: ProjectLifecycleAction, reason?: string) => Promise<void>;
  initialEditingProject?: Project | null;
}

const blankProject = (): Project =>
  createLocalProject({
    projectCode: "",
    projectName: "",
    description: "",
    clientName: "",
    clientReference: "",
    location: "",
    siteAddress: "",
    projectManager: "",
    status: "PLANNING",
    contractValue: 0,
    projectBudget: 0,
    currency: "PHP",
    notes: "",
  });

function money(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(0)}`;
  }
}

function percent(value: number) {
  return `${(Number.isFinite(value) ? value : 0).toFixed(1)}%`;
}

function statusTone(status: ProjectStatus): StatusTone {
  return status === "ACTIVE" || (status as string) === "IN_PROGRESS"
    ? "success"
    : status === "ARCHIVED" || status === "CANCELLED"
      ? "neutral"
      : status === "ON_HOLD"
        ? "warning"
        : "info";
}

function healthBadgeTone(health: ProjectManagementHealth): StatusTone {
  return health === "OVER BUDGET"
    ? "danger"
    : health === "NEAR LIMIT"
      ? "warning"
      : health === "PARTIAL"
        ? "warning"
        : health === "NO BUDGET"
          ? "neutral"
          : "success";
}

function attentionTone(tone: ProjectAttentionItem["tone"]): string {
  switch (tone) {
    case "danger":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "warning":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "info":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  projects,
  summaries,
  costCodes = [],
  onOpenProject,
  onSaveProject,
  onPreviewProjectLifecycle,
  onApplyProjectLifecycle,
  initialEditingProject,
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
  const [healthFilter, setHealthFilter] = useState<ProjectHealthFilter>("ALL");
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

      return buildProjectManagementView(p, summary, { costCodes });
    });
  }, [projects, summaries, costCodes]);

  // 2. Portfolio Management Summary (Multi-currency safe)
  const portfolio = useMemo(() => {
    return buildPortfolioManagementSummary(projectViews);
  }, [projectViews]);

  // 3. Filtered and Sorted Views
  const displayedViews = useMemo(() => {
    return filterAndSortProjectViews(projectViews, {
      searchQuery: query,
      statusFilter: status,
      healthFilter,
      sortField,
      sortDirection,
    });
  }, [projectViews, query, status, healthFilter, sortField, sortDirection]);

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
  const hasProjectFilters = Boolean(query.trim()) || status !== "ALL" || healthFilter !== "ALL";
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
        title="Projects"
        description="Projects are the operational and cost control hub connecting contract commitments, approved budgets, work packages, supplier invoices, labor, and direct expenses."
        actions={canManage ? <Button variant="primary" label="New project" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing(blankProject())} /> : undefined}
      />

      {!costDataComplete && !workspaceDataPending && (
        <div role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <strong>Partial cost visibility.</strong> Financial figures below exclude {hiddenCostSources.join(", ")} because those sources are unavailable or incomplete.
          </div>
        </div>
      )}

      {/* Top Portfolio Management Summary */}
      <section aria-label="Portfolio Management Summary" className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Project counts">
          <MetricCard label="All projects" value={portfolio.totalProjects} loading={isHydrating} icon={BriefcaseBusiness} tone="info" />
          <MetricCard label="Active" value={portfolio.activeProjects} loading={isHydrating} tone="success" />
          <MetricCard label="On hold" value={portfolio.onHoldProjects} loading={isHydrating} tone="warning" />
          <MetricCard label="Archived" value={portfolio.archivedProjects} loading={isHydrating} tone="neutral" />
        </div>

        {/* Currency Grouped Totals */}
        {portfolio.currencies.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Portfolio Financial Totals">
            {portfolio.currencies.map((currencyCode) => {
              const group = portfolio.currencyGroups[currencyCode];
              if (!group) return null;
              return (
                <Card key={currencyCode} className="p-4 shadow-sm" elevation="low">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-indigo-700">
                      <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                      {currencyCode} Portfolio ({group.projectCount})
                    </span>
                    {!group.isComplete && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                        Partial FX
                      </span>
                    )}
                  </div>
                  <div className="mt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Contract Value:</span>
                      <strong className="font-sans font-bold tabular-nums text-slate-900">{money(group.totalContractValue, currencyCode)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Approved Budget:</span>
                      <strong className="font-sans font-bold tabular-nums text-slate-900">{money(group.totalApprovedBudget, currencyCode)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Actual Cost:</span>
                      <strong className="font-sans font-bold tabular-nums text-indigo-700">{money(group.totalActualCost, currencyCode)}</strong>
                    </div>
                    {group.totalPendingExposure > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Pending Exposure:</span>
                        <span className="font-sans font-semibold tabular-nums text-amber-700">{money(group.totalPendingExposure, currencyCode)}</span>
                      </div>
                    )}
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
                <div className="flex justify-between">
                  <span className="text-slate-500">Over Budget:</span>
                  <strong className={`tabular-nums ${portfolio.projectsOverBudgetCount > 0 ? "text-rose-700 font-bold" : "text-slate-700"}`}>
                    {portfolio.projectsOverBudgetCount}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Near Limit (≥90%):</span>
                  <strong className={`tabular-nums ${portfolio.projectsNearBudgetCount > 0 ? "text-amber-700 font-bold" : "text-slate-700"}`}>
                    {portfolio.projectsNearBudgetCount}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Uncoded Cost:</span>
                  <strong className={`tabular-nums ${portfolio.projectsWithUncodedCostCount > 0 ? "text-amber-700 font-bold" : "text-slate-700"}`}>
                    {portfolio.projectsWithUncodedCostCount}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Missing Forecast:</span>
                  <strong className={`tabular-nums ${portfolio.projectsMissingForecastCount > 0 ? "text-indigo-700 font-bold" : "text-slate-700"}`}>
                    {portfolio.projectsMissingForecastCount}
                  </strong>
                </div>
              </div>
            </Card>
          </div>
        )}
      </section>

      {/* Filter and Sort Toolbar */}
      <Card className="p-3 sm:p-4" elevation="low" aria-label="Project filters and sorting">
        <SectionHeader
          title="Project Register"
          description="Search, filter, and inspect projects by financial position, work package status, and operational health."
          icon={BriefcaseBusiness}
          action={<span className="text-xs font-semibold text-slate-500" role="status" aria-live="polite">{projectResultLabel}</span>}
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="sr-only">Search projects</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code, name, client, location, manager…"
              className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400 focus-visible:outline-none"
            />
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <Filter aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="sr-only">Project status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "ALL" | ProjectStatus)}
              className="w-full bg-transparent text-xs font-semibold outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              {["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "ARCHIVED"].map((val) => (
                <option key={val} value={val}>{val.replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="sr-only">Financial health filter</span>
            <select
              value={healthFilter}
              onChange={(event) => setHealthFilter(event.target.value as ProjectHealthFilter)}
              className="w-full bg-transparent text-xs font-semibold outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <option value="ALL">All Financial States</option>
              <option value="ON_BUDGET">On Budget</option>
              <option value="NEAR_BUDGET">Near Budget Limit (≥90%)</option>
              <option value="OVER_BUDGET">Over Budget</option>
              <option value="UNCODED_COST">Has Uncoded Cost</option>
              <option value="MISSING_FORECAST">Missing Work-Package Forecast</option>
              <option value="PENDING_EXPOSURE">Has Pending Exposure</option>
              <option value="MIXED_CURRENCY">Mixed FX / Partial</option>
            </select>
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <ArrowDownUp aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="sr-only">Sort by</span>
            <select
              value={`${sortField}-${sortDirection}`}
              onChange={(event) => {
                const [f, d] = event.target.value.split("-") as [ProjectSortField, ProjectSortDirection];
                setSortField(f);
                setSortDirection(d);
              }}
              className="w-full bg-transparent text-xs font-semibold outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <option value="code-asc">Code (A → Z)</option>
              <option value="code-desc">Code (Z → A)</option>
              <option value="name-asc">Name (A → Z)</option>
              <option value="contractValue-desc">Contract Value (Highest)</option>
              <option value="projectBudget-desc">Approved Budget (Highest)</option>
              <option value="actualCost-desc">Actual Cost (Highest)</option>
              <option value="remainingBudget-asc">Remaining Budget (Lowest)</option>
              <option value="utilization-desc">Budget Utilization (Highest)</option>
              <option value="status-asc">Status</option>
            </select>
          </label>
        </div>

        {hasProjectFilters && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[10px] font-semibold text-slate-500">
            <span>Filtered results active. Clear filters to see full portfolio.</span>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("ALL");
                setHealthFilter("ALL");
              }}
              className="font-bold text-indigo-600 hover:text-indigo-800"
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
              <table className="ops-table min-w-[1100px] w-full text-left text-xs">
                <caption className="sr-only">Project register results: {projectResultLabel}</caption>
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("code")}>
                      Project / Client
                    </th>
                    <th scope="col" className="px-3 py-3 cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("status")}>
                      Status & Health
                    </th>
                    <th scope="col" className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("contractValue")}>
                      Contract Value
                    </th>
                    <th scope="col" className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("projectBudget")}>
                      Cost Budget
                    </th>
                    <th scope="col" className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("actualCost")}>
                      Actual Cost
                    </th>
                    <th scope="col" className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort("remainingBudget")}>
                      Remaining / Variance
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Work Packages / Forecast
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

                    return (
                      <tr key={project.id} className="align-top transition hover:bg-slate-50/80">
                        {/* 1. Project & Client */}
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

                        {/* 2. Status & Health */}
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
                        </td>

                        {/* 3. Contract Value */}
                        <td className="px-3 py-3 text-right font-sans font-bold tabular-nums text-slate-800">
                          {money(view.contractValue, view.currency)}
                        </td>

                        {/* 4. Cost Budget */}
                        <td className="px-3 py-3 text-right font-sans font-bold tabular-nums text-slate-900">
                          {money(view.approvedCostBudget, view.currency)}
                        </td>

                        {/* 5. Actual Cost */}
                        <td className="px-3 py-3 text-right font-sans font-bold tabular-nums text-indigo-700">
                          <div>{money(view.actualCost, view.currency)}</div>
                          {view.hasForeignAmounts && (
                            <span className="text-[9px] font-bold text-amber-700">Partial FX</span>
                          )}
                          {view.pendingCostExposure > 0 && (
                            <div className="text-[9px] font-normal text-slate-500">
                              +{money(view.pendingCostExposure, view.currency)} pending
                            </div>
                          )}
                        </td>

                        {/* 6. Remaining / Variance */}
                        <td className="px-3 py-3 text-right font-sans font-bold tabular-nums">
                          {view.isPartial ? (
                            <span className="text-[10px] font-semibold text-amber-700">Partial aggregate</span>
                          ) : (
                            <span className={view.remainingBudget !== null && view.remainingBudget < 0 ? "text-rose-700" : "text-emerald-700"}>
                              {money(view.remainingBudget, view.currency)}
                            </span>
                          )}
                          {view.approvedCostBudget > 0 && !view.isPartial && (
                            <div className="text-[9px] font-semibold text-slate-400">
                              {percent(view.confirmedUtilization)} used
                            </div>
                          )}
                        </td>

                        {/* 7. Work Packages / Forecast */}
                        <td className="px-3 py-3 text-[10px] space-y-0.5 text-slate-600">
                          {view.activeCostCodesCount > 0 ? (
                            <>
                              <div>
                                <span className="font-semibold">{view.activeCostCodesCount} codes:</span>{" "}
                                {money(view.allocatedCostCodeBudget, view.currency)} alloc
                              </div>
                              {view.uncodedActualCost > 0 && (
                                <div className="text-amber-700 font-medium">
                                  Uncoded: {money(view.uncodedActualCost, view.currency)}
                                </div>
                              )}
                              {view.forecastFinalCost != null ? (
                                <div className={view.forecastVariance !== null && view.forecastVariance < 0 ? "text-rose-700 font-bold" : "text-slate-500"}>
                                  Fcst: {money(view.forecastFinalCost, view.currency)}
                                </div>
                              ) : (
                                <div className="text-slate-400">Fcst: Not set</div>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-400 italic">No work packages</span>
                          )}
                        </td>

                        {/* 8. Actions */}
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => onOpenProject(project)}
                              className="rounded-lg p-2 text-indigo-600 transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                              aria-label={`Open ${project.projectName}`}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => setEditing(project)}
                                className="rounded-lg p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                                aria-label={`Edit ${project.projectName}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canManage && project.status !== "ARCHIVED" && (
                              <button
                                type="button"
                                onClick={() => void openLifecycle(project)}
                                className="rounded-lg p-2 text-slate-400 transition hover:bg-amber-50 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
                                title="Review archive or delete-unused options"
                                aria-label={`Review lifecycle for ${project.projectName}`}
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canManage && project.status === "ARCHIVED" && (
                              <button
                                type="button"
                                onClick={() => void openLifecycle(project)}
                                className="rounded-lg p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                                title="Review archived project options"
                                aria-label={`Review archived project options for ${project.projectName}`}
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

                  {/* 2-Column Metric Grid */}
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500">Contract Value</span>
                      <p className="font-bold tabular-nums text-slate-900">{money(view.contractValue, view.currency)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Cost Budget</span>
                      <p className="font-bold tabular-nums text-slate-900">{money(view.approvedCostBudget, view.currency)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Actual Cost</span>
                      <p className="font-bold tabular-nums text-indigo-700">
                        {money(view.actualCost, view.currency)}
                        {view.hasForeignAmounts && <span className="ml-1 text-[9px] text-amber-700 font-bold">(Partial)</span>}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Remaining</span>
                      <p className={`font-bold tabular-nums ${view.remainingBudget !== null && view.remainingBudget < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                        {view.isPartial ? "Partial" : money(view.remainingBudget, view.currency)}
                      </p>
                    </div>
                  </div>

                  {/* Work Package Summary Line */}
                  {view.activeCostCodesCount > 0 && (
                    <div className="flex flex-wrap justify-between gap-1 text-[10px] text-slate-600 px-1">
                      <span>{view.activeCostCodesCount} active work packages ({money(view.allocatedCostCodeBudget, view.currency)} allocated)</span>
                      {view.uncodedActualCost > 0 && (
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
                          icon={<Pencil className="h-3 w-3" />}
                          onClick={() => setEditing(project)}
                        />
                      )}
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => void openLifecycle(project)}
                          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                          title="Review lifecycle options"
                        >
                          {project.status === "ARCHIVED" ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                        </button>
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
      ) : workspaceDataPending ? (
        <div id="projects-results" role="status" aria-live="polite" className="p-8 text-center text-xs font-semibold text-slate-500">
          Loading projects…
        </div>
      ) : (
        <div id="projects-results">
          <EmptyState
            icon={BriefcaseBusiness}
            title={projects.length ? "No projects match this filter" : "No projects yet"}
            description={
              canManage
                ? "Create a project to connect supplier invoices, payroll, and direct costs."
                : "No projects are available for the current filter."
            }
            action={
              canManage ? (
                <Button
                  variant="primary"
                  label="Create project"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => setEditing(blankProject())}
                />
              ) : undefined
            }
          />
        </div>
      )}

      {/* Edit / New Project Modal */}
      {canManage && editing && (
        <div
          ref={editingDialogRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-form-title"
        >
          <form
            onSubmit={save}
            className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Project Register</p>
                <h2 id="project-form-title" className="mt-1 text-lg font-black text-slate-950">
                  {projects.some((p) => p.id === editing.id) ? "Edit Project" : "New Project"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">Project code and identity are unique within the workspace.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close project form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="field-label">Project Code</span>
                <input
                  ref={projectCodeInputRef}
                  required
                  value={editing.projectCode}
                  onChange={(e) => setEditing({ ...editing, projectCode: e.target.value })}
                  className="field-input"
                />
              </label>

              <label className="space-y-1">
                <span className="field-label">Project Name</span>
                <input
                  required
                  value={editing.projectName}
                  onChange={(e) => setEditing({ ...editing, projectName: e.target.value })}
                  className="field-input"
                />
              </label>

              <label className="space-y-1">
                <span className="field-label">Client Name</span>
                <input
                  value={editing.clientName || ""}
                  onChange={(e) => setEditing({ ...editing, clientName: e.target.value })}
                  className="field-input"
                />
              </label>

              <label className="space-y-1">
                <span className="field-label">Location / Site Address</span>
                <input
                  value={editing.location || editing.siteAddress || ""}
                  onChange={(e) => setEditing({ ...editing, location: e.target.value, siteAddress: e.target.value })}
                  className="field-input"
                />
              </label>

              <label className="space-y-1">
                <span className="field-label">Project Manager</span>
                <input
                  value={editing.projectManager || ""}
                  onChange={(e) => setEditing({ ...editing, projectManager: e.target.value })}
                  className="field-input"
                />
              </label>

              <label className="space-y-1">
                <span className="field-label">Currency</span>
                <input
                  value={editing.currency || "PHP"}
                  onChange={(e) => setEditing({ ...editing, currency: e.target.value })}
                  className="field-input uppercase"
                />
              </label>

              <label className="space-y-1">
                <span className="field-label">Contract Value (Client-Facing)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editing.contractValue || ""}
                  onChange={(e) => setEditing({ ...editing, contractValue: Number(e.target.value) })}
                  className="field-input"
                />
              </label>

              <label className="space-y-1">
                <span className="field-label">Approved Cost Budget (Internal Ceiling)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editing.projectBudget || ""}
                  onChange={(e) => setEditing({ ...editing, projectBudget: Number(e.target.value) })}
                  className="field-input"
                />
              </label>

              {editing.status === "ARCHIVED" ? (
                <div className="space-y-1 sm:col-span-2">
                  <span className="field-label">Status</span>
                  <div className="field-input flex items-center bg-slate-50 font-bold text-slate-600">ARCHIVED</div>
                  <p className="text-[10px] text-slate-500">Use the lifecycle action to reactivate this project.</p>
                </div>
              ) : (
                <label className="space-y-1 sm:col-span-2">
                  <span className="field-label">Status</span>
                  <select
                    value={editing.status}
                    onChange={(e) => setEditing({ ...editing, status: e.target.value as ProjectStatus })}
                    className="field-input"
                  >
                    {["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"].map((val) => (
                      <option key={val} value={val}>{val.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                </label>
              )}

              <label className="space-y-1 sm:col-span-2">
                <span className="field-label">Description / Notes</span>
                <textarea
                  value={editing.description || editing.notes || ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value, notes: e.target.value })}
                  rows={3}
                  className="field-input resize-y"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button variant="secondary" label="Cancel" onClick={() => setEditing(null)} />
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
                        .filter(([, count]) => count > 0)
                        .map(([k, count]) => (
                          <li key={k} className="flex justify-between gap-2">
                            <span>{k.replaceAll(/([a-z])([A-Z])/g, "$1 $2")}</span>
                            <strong>{count}</strong>
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
