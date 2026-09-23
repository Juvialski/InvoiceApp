import React, { useState } from "react";
import {
  Archive,
  Coins,
  ArrowUpRight,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import type { Project, ProjectStatus } from "../../types.ts";
import { projectTaxTreatmentLabel } from "../../utils/projectTaxTreatment.ts";
import { ActionButton, CompactActionBar, StatusBadge, type FilterChip, type StatusTone } from "../ui/OperationsUI.tsx";
import { OperationsGrid } from "../ui/OperationsGrid.tsx";
import { countActiveFilters } from "../ui/filterActionBarModel.ts";
import {
  topProjectAttentionSignal,
  type PortfolioManagementSummary,
  type PortfolioMetricAggregate,
  type ProjectAttentionCategory,
  type ProjectHealthFilter,
  type ProjectManagementHealth,
  type ProjectManagementView,
  type ProjectSortDirection,
  type ProjectSortField,
} from "../../utils/projectManagementViewModel.ts";
import type { ProjectFinancialMetric } from "../../utils/projectFinancialSummary.ts";


function money(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return `${currency} ${(Number(value) || 0).toFixed(2)}`;
  }
}

function projectMonogram(project: Project): string {
  const name = project.projectName?.trim();
  const initials = name?.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("");
  if (initials) return initials.toUpperCase();
  return project.projectCode?.trim().slice(0, 2).toUpperCase() || "P";
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

function attentionTone(tone: "danger" | "warning" | "info" | "neutral"): string {
  switch (tone) {
    case "danger":
      return "hqs-attention-danger";
    case "warning":
      return "hqs-attention-warning";
    case "info":
      return "hqs-attention-info";
    default:
      return "hqs-attention-neutral";
  }
}

function financialValue(metric: ProjectFinancialMetric, currency: string): string {
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
      {metric.status === "partial" && <span className="ml-1 text-[9px] font-bold hqs-warning-text">Partial</span>}
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
      <strong className="font-sans font-bold tabular-nums hqs-primary-text">{value}</strong>
      {statusLabel && <span className="mt-0.5 block text-[9px] font-bold hqs-warning-text">{statusLabel}</span>}
    </span>
  );
}

function portfolioMetricInline(metric: PortfolioMetricAggregate, currency: string): string {
  if (metric.status === "unavailable" || metric.amount === undefined) return "Unavailable";
  const value = money(metric.amount, currency);
  return metric.status === "partial"
    ? `${value} (Partial · ${metric.includedProjectCount} of ${metric.projectCount} included)`
    : value;
}

export interface ProjectPortfolioRegisterSectionProps {
  displayedViews: readonly ProjectManagementView[];
  portfolio: PortfolioManagementSummary;
  managerOptions: readonly string[];
  currencyOptions: readonly string[];
  projectStatuses: readonly ProjectStatus[];

  query: string;
  statusFilter: "ALL" | ProjectStatus;
  managerFilter: string;
  currencyFilter: string;
  healthFilter: ProjectHealthFilter;
  attentionCategoryFilter: "ALL" | ProjectAttentionCategory;
  sortField: ProjectSortField;
  sortDirection: ProjectSortDirection;

  canManage: boolean;
  isHydrating: boolean;
  projectResultLabel: string;
  hasProjectFilters: boolean;

  onQueryChange: (query: string) => void;
  onStatusChange: (status: "ALL" | ProjectStatus) => void;
  onManagerFilterChange: (manager: string) => void;
  onCurrencyFilterChange: (currency: string) => void;
  onHealthFilterChange: (health: ProjectHealthFilter) => void;
  onAttentionCategoryFilterChange: (category: "ALL" | ProjectAttentionCategory) => void;
  onSortFieldChange: (field: ProjectSortField) => void;
  onToggleSort: (field: ProjectSortField) => void;
  onClearFilters: () => void;
  onOpenProject: (project: Project) => void;
  onEditProject: (project: Project) => void;
  onOpenLifecycle: (project: Project) => void;
}

export interface ProjectRegisterCardProps {
  view: ProjectManagementView;
  canManage: boolean;
  onOpenProject: (project: Project) => void;
  onEditProject: (project: Project) => void;
  onOpenLifecycle: (project: Project) => void;
}

export function ProjectRegisterCard({
  view,
  canManage,
  onOpenProject,
  onEditProject,
  onOpenLifecycle,
}: ProjectRegisterCardProps) {
  const project = view.project;
  const projectSubline = [project.clientName, project.location || project.siteAddress].filter(Boolean).join(" · ") || "Client and location not set";

  return (
    <Card key={project.id} data-project-id={project.id} className="hqs-surface-raised min-w-0 w-full overflow-hidden" elevation="low">
      <button
        type="button"
        onClick={() => onOpenProject(project)}
        aria-label={`Open project workspace for ${project.projectName || project.projectCode}`}
        className="hqs-focus-ring group block w-full space-y-3 p-4 text-left"
      >
        <div className="hqs-surface-muted flex min-w-0 items-start gap-3 rounded-xl p-3">
          <span data-project-identity-mark="true" className="hqs-attention-info flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-black tracking-wide">
            {projectMonogram(project)}
          </span>
          <div className="min-w-0 flex-1">
            <span className="hqs-secondary-text text-[11px] font-bold uppercase tracking-wide">{project.projectCode || "Project code not set"}</span>
            <h3 className="hqs-primary-text mt-0.5 line-clamp-2 text-lg font-black leading-tight group-hover:underline">{project.projectName || "Unnamed project"}</h3>
            <p className="hqs-secondary-text mt-1 truncate text-xs">{projectSubline}</p>
          </div>
          <ArrowUpRight className="hqs-secondary-text mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Project status and attention">
          <StatusBadge tone={statusTone(project.status)}>{project.status.replaceAll("_", " ")}</StatusBadge>
          {view.attentionFlags.slice(0, 2).map((item) => (
            <span key={item.id} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${attentionTone(item.tone)}`} title={item.detail}>{item.label}</span>
          ))}
          {view.attentionFlags.length > 2 && <span className="hqs-secondary-text text-xs font-semibold">+{view.attentionFlags.length - 2} more</span>}
        </div>

        <div className="hqs-surface-muted grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 rounded-xl p-3">
          <div className="min-w-0"><span className="hqs-secondary-text block text-[11px]">Contract Value</span><p className="hqs-primary-text mt-1 break-words text-sm font-bold tabular-nums"><FinancialValue metric={view.financialTruth.contractValue} currency={view.currency} /></p></div>
          <div className="min-w-0"><span className="hqs-secondary-text block text-[11px]">Approved Project Budget</span><p className="hqs-primary-text mt-1 break-words text-sm font-bold tabular-nums"><FinancialValue metric={view.financialTruth.approvedCostBudget} currency={view.currency} /></p></div>
          <div className="col-span-2 min-w-0">
            <span className="hqs-secondary-text block text-[11px]">Project Cost</span>
            <div className="mt-1 grid grid-cols-2 gap-3">
              <div className="min-w-0"><span className="hqs-secondary-text block text-[11px]">Actual Cost</span><p className="hqs-accent-text break-words text-sm font-bold tabular-nums"><FinancialValue metric={view.financialTruth.actualCost} currency={view.currency} /></p></div>
              <div className="min-w-0"><span className="hqs-secondary-text block text-[11px]">Committed Cost</span><p className="hqs-primary-text break-words text-sm font-bold tabular-nums"><FinancialValue metric={view.financialTruth.committedCost} currency={view.currency} /></p></div>
            </div>
          </div>
        </div>

        {view.activeCostCodesCount > 0 && (
          <div className="flex flex-wrap justify-between gap-1 px-1 text-[10px] hqs-secondary-text">
            <span>{view.activeCostCodesCount} active work packages ({money(view.allocatedCostCodeBudget, view.currency)} allocated)</span>
            {view.costClassificationAvailable && view.uncodedActualCost !== null && view.uncodedActualCost > 0 && <span className="font-semibold hqs-warning-text">Uncoded: {money(view.uncodedActualCost, view.currency)}</span>}
          </div>
        )}
      </button>

      <div className="hqs-border flex min-w-0 flex-wrap items-center justify-between gap-2 border-t p-3">
        {canManage && <ActionButton variant="secondary" size="sm" label="Edit project details" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEditProject(project)} />}
        {canManage && (
          <details className="relative ml-auto">
            <summary aria-label={`More actions for ${project.projectName || project.projectCode}`} className="hqs-control hqs-focus-ring inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold [&::-webkit-details-marker]:hidden"><MoreHorizontal className="h-4 w-4" aria-hidden="true" />More</summary>
            <div className="hqs-popover absolute right-0 z-20 mt-1 min-w-44 rounded-xl p-1.5">
              <button type="button" onClick={() => onOpenLifecycle(project)} className="hqs-control hqs-focus-ring flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-xs font-bold">
                {project.status === "ARCHIVED" ? <RotateCcw className="h-3.5 w-3.5 hqs-success-text" /> : <Archive className="h-3.5 w-3.5 hqs-secondary-text" />}
                {project.status === "ARCHIVED" ? "Reactivate project" : "Project lifecycle"}
              </button>
            </div>
          </details>
        )}
      </div>
    </Card>
  );
}

function ProjectPortfolioOperationsGrid({
  displayedViews,
  canManage,
  onOpenProject,
  onEditProject,
  onOpenLifecycle,
}: Pick<ProjectPortfolioRegisterSectionProps, "displayedViews" | "canManage" | "onOpenProject" | "onEditProject" | "onOpenLifecycle">) {
  return (
    <div className="min-w-0" aria-label="Projects table">
      <OperationsGrid
        ariaLabel="Projects table"
        rows={displayedViews}
        rowKey={(view) => view.project.id}
        onRowActivate={(view) => onOpenProject(view.project)}
        columns={[
          {
            key: "project",
            header: "Project Code / Name",
            sortValue: (view) => view.project.projectCode,
            protected: true,
            cellClassName: "min-w-[18rem]",
            value: (view) => {
              const project = view.project;
              return (
                <button
                  type="button"
                  onClick={() => onOpenProject(project)}
                  className="hqs-focus-ring hqs-accent-text rounded-sm text-left hover:underline"
                >
                  <span className="block text-[10px] font-black uppercase tracking-wide hqs-accent-text">{project.projectCode}</span>
                    <strong className="hqs-primary-text mt-0.5 block text-xs font-bold">{project.projectName}</strong>
                    <span className="hqs-secondary-text mt-0.5 block max-w-[22rem] truncate text-[10px]">
                    {project.clientName || "No client set"} {project.location ? "· " + project.location : ""}
                  </span>
                </button>
              );
            },
          },
          { key: "manager", header: "Project Manager", sortValue: (view) => view.project.projectManager || "", value: (view) => view.project.projectManager || "Not assigned" },
          {
            key: "status",
            header: "Status & Data Quality",
            sortValue: (view) => view.project.status,
            protected: true,
            cellClassName: "min-w-[13rem]",
            value: (view) => {
              const topAttention = topProjectAttentionSignal(view);
              return (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <StatusBadge tone={statusTone(view.project.status)}>{view.project.status.replaceAll("_", " ")}</StatusBadge>
                    {view.health !== "ON BUDGET" && <StatusBadge tone={healthBadgeTone(view.health)}>{view.health}</StatusBadge>}
                  </div>
                  {view.attentionFlags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      <span className="hqs-attention-neutral rounded px-1.5 py-0.5 text-[9px] font-black">
                        {view.attentionFlags.length} attention signal{view.attentionFlags.length === 1 ? "" : "s"}
                      </span>
                      {view.attentionFlags.slice(0, 2).map((item) => <span key={item.id} className={"rounded border px-1.5 py-0.5 text-[9px] font-bold " + attentionTone(item.tone)} title={item.detail}>{item.label}</span>)}
                      {view.attentionFlags.length > 2 && <span className="text-[9px] font-semibold hqs-secondary-text">+{view.attentionFlags.length - 2} more</span>}
                    </div>
                  )}
                  {topAttention && <span className="block max-w-[18rem] truncate text-[9px] font-semibold hqs-secondary-text" title={topAttention.explanation}>Top reason: {topAttention.title}</span>}
                  {view.isPartial && <span className="block text-[9px] font-bold hqs-warning-text">Partial project data</span>}
                </div>
              );
            },
          },
          { key: "currency", header: "Currency", sortValue: (view) => view.currency, protected: true, value: (view) => <span className="font-black uppercase tracking-wide">{view.currency}</span> },
          { key: "taxTreatment", header: "Tax treatment", protected: true, value: (view) => <StatusBadge tone={view.project.taxTreatment === "UNCLASSIFIED" || !view.project.taxTreatment ? "warning" : "info"}>{projectTaxTreatmentLabel(view.project.taxTreatment)}</StatusBadge> },
          { key: "contractValue", header: "Contract Value", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.contractValue.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums", value: (view) => <FinancialValue metric={view.financialTruth.contractValue} currency={view.currency} /> },
          { key: "projectBudget", header: "Budget", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.approvedCostBudget.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums", value: (view) => <FinancialValue metric={view.financialTruth.approvedCostBudget} currency={view.currency} /> },
          { key: "actualCost", header: "Actual", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.actualCost.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums hqs-accent-text", value: (view) => <FinancialValue metric={view.financialTruth.actualCost} currency={view.currency} /> },
          { key: "committedCost", header: "Committed", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.committedCost.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums", value: (view) => <FinancialValue metric={view.financialTruth.committedCost} currency={view.currency} /> },
          { key: "billed", header: "Billed", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.billed.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums", value: (view) => <FinancialValue metric={view.financialTruth.billed} currency={view.currency} /> },
          { key: "collected", header: "Collected", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.collected.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums", value: (view) => <FinancialValue metric={view.financialTruth.collected} currency={view.currency} /> },
          { key: "outstandingReceivables", header: "Outstanding", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.outstandingReceivables.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums hqs-warning-text", value: (view) => <FinancialValue metric={view.financialTruth.outstandingReceivables} currency={view.currency} /> },
          { key: "remainingToBill", header: "Remaining to Bill", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.remainingToBill.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums hqs-success-text", value: (view) => <FinancialValue metric={view.financialTruth.remainingToBill} currency={view.currency} /> },
        ]}
        renderActions={(view) => {
          const project = view.project;
          return (
            <div className="flex justify-end gap-1">
              <ActionButton variant="secondary" size="sm" label="Open" onClick={() => onOpenProject(project)} />
              {canManage && <ActionButton variant="ghost" size="sm" isIconOnly label={"Edit project " + project.projectCode} icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEditProject(project)} />}
              {canManage && <ActionButton variant={project.status === "ARCHIVED" ? "secondary" : "destructive"} size="sm" isIconOnly label={(project.status === "ARCHIVED" ? "Reactivate " : "Project lifecycle for ") + project.projectCode} icon={project.status === "ARCHIVED" ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />} onClick={() => onOpenLifecycle(project)} />}
            </div>
          );
        }}
        density="compact"
        className="rounded-none border-0"
      />
    </div>
  );
}

export function ProjectPortfolioRegisterSection({
  displayedViews,
  portfolio,
  managerOptions,
  currencyOptions,
  projectStatuses,
  query,
  statusFilter,
  managerFilter,
  currencyFilter,
  healthFilter,
  attentionCategoryFilter,
  sortField,
  sortDirection,
  canManage,
  isHydrating,
  projectResultLabel,
  onQueryChange,
  onStatusChange,
  onManagerFilterChange,
  onCurrencyFilterChange,
  onHealthFilterChange,
  onAttentionCategoryFilterChange,
  onSortFieldChange,
  onToggleSort,
  onClearFilters,
  onOpenProject,
  onEditProject,
  onOpenLifecycle,
}: ProjectPortfolioRegisterSectionProps) {
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const activeFilterValues = [statusFilter, managerFilter, currencyFilter, healthFilter, attentionCategoryFilter];
  const activeFilterCount = countActiveFilters(activeFilterValues);
  const activeFilters: FilterChip[] = [];
  if (statusFilter !== "ALL") activeFilters.push({ id: "status", label: `Status: ${statusFilter.replaceAll("_", " ")}`, onRemove: () => onStatusChange("ALL") });
  if (managerFilter !== "ALL") activeFilters.push({ id: "manager", label: `Manager: ${managerFilter}`, onRemove: () => onManagerFilterChange("ALL") });
  if (currencyFilter !== "ALL") activeFilters.push({ id: "currency", label: `Currency: ${currencyFilter}`, onRemove: () => onCurrencyFilterChange("ALL") });
  if (healthFilter !== "ALL") activeFilters.push({ id: "health", label: `Health: ${healthFilter.replaceAll("_", " ")}`, onRemove: () => onHealthFilterChange("ALL") });
  if (attentionCategoryFilter !== "ALL") activeFilters.push({ id: "attention", label: `Attention: ${attentionCategoryFilter.replaceAll("-", " ")}`, onRemove: () => onAttentionCategoryFilterChange("ALL") });

  return (
    <>
      {/* Filter and Search Toolbar */}
      <div data-ux45c="projects-primary-toolbar">
        <CompactActionBar
          ariaLabel="Project filters and actions"
          search={{ value: query, onChange: onQueryChange, placeholder: "Search code, name, client, PM, location...", ariaLabel: "Search projects" }}
          quickFilters={(
            <select value={statusFilter} onChange={(event) => onStatusChange(event.target.value as "ALL" | ProjectStatus)} className="hqs-input hqs-focus-ring min-h-10 max-w-[12rem] rounded-lg px-3 py-2 text-xs font-semibold" aria-label="Filter by project status">
              <option value="ALL">All Statuses</option>
              {projectStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
            </select>
          )}
          activeFilterValues={activeFilterValues}
          activeFilters={activeFilters}
          onClearAll={activeFilterCount > 0 ? onClearFilters : undefined}
          advancedFilters={(
            <>
              <select value={managerFilter} onChange={(event) => onManagerFilterChange(event.target.value)} className="hqs-input hqs-focus-ring min-h-10 rounded-lg px-3 py-2 text-xs font-semibold" aria-label="Filter by project manager">
                <option value="ALL">All Project Managers</option>
                {managerOptions.map((manager) => <option key={manager} value={manager}>{manager}</option>)}
              </select>
              <select value={currencyFilter} onChange={(event) => onCurrencyFilterChange(event.target.value)} className="hqs-input hqs-focus-ring min-h-10 rounded-lg px-3 py-2 text-xs font-semibold" aria-label="Filter by project currency">
                <option value="ALL">All Currencies</option>
                {currencyOptions.map((currencyCode) => <option key={currencyCode} value={currencyCode}>{currencyCode}</option>)}
              </select>
              <select value={healthFilter} onChange={(event) => onHealthFilterChange(event.target.value as ProjectHealthFilter)} className="hqs-input hqs-focus-ring min-h-10 rounded-lg px-3 py-2 text-xs font-semibold" aria-label="Filter by financial health and attention signals">
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
              <select value={attentionCategoryFilter} onChange={(event) => onAttentionCategoryFilterChange(event.target.value as "ALL" | ProjectAttentionCategory)} className="hqs-input hqs-focus-ring min-h-10 rounded-lg px-3 py-2 text-xs font-semibold" aria-label="Filter by attention category">
                <option value="ALL">All Attention Categories</option>
                <option value="financial">Financial</option>
                <option value="commercial">Commercial</option>
                <option value="procurement">Procurement</option>
                <option value="engineering">Engineering</option>
                <option value="schedule">Schedule</option>
                <option value="data-quality">Data quality</option>
              </select>
            </>
          )}
          sort={(
            <div className="flex items-center gap-1.5">
              <select value={sortField} onChange={(event) => onSortFieldChange(event.target.value as ProjectSortField)} className="hqs-input hqs-focus-ring min-h-10 max-w-[12rem] rounded-lg px-3 py-2 text-xs font-semibold" aria-label="Sort projects by field">
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
              <button type="button" onClick={() => onToggleSort(sortField)} className="hqs-control hqs-focus-ring inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold" title={`Sort direction: ${sortDirection.toUpperCase()}`} aria-label={`Toggle sort direction, currently ${sortDirection}`}>
                {sortDirection === "asc" ? "↑" : "↓"}
              </button>
            </div>
          )}
          view={(
            <div role="group" aria-label="Project portfolio view" className="hqs-surface-muted inline-flex shrink-0 gap-1 rounded-lg p-1">
              <button type="button" aria-pressed={viewMode === "cards"} onClick={() => setViewMode("cards")} className={`hqs-focus-ring rounded-md px-3 py-1.5 text-xs font-black ${viewMode === "cards" ? "hqs-surface-raised hqs-accent-text" : "hqs-secondary-text"}`}>Cards</button>
              <button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")} className={`hqs-focus-ring rounded-md px-3 py-1.5 text-xs font-black ${viewMode === "list" ? "hqs-surface-raised hqs-accent-text" : "hqs-secondary-text"}`}>Compact List</button>
            </div>
          )}
          resultLabel={`Showing ${projectResultLabel}`}
        />
      </div>

      {/* Main Content Area: visual cards by default, compact register on request */}
      <div id="projects-results" data-ux45c="projects-primary-work" className="space-y-4">
      {displayedViews.length ? (
        viewMode === "list" ? (
          <ProjectPortfolioOperationsGrid displayedViews={displayedViews} canManage={canManage} onOpenProject={onOpenProject} onEditProject={onEditProject} onOpenLifecycle={onOpenLifecycle} />
        ) : (
          <div className="grid min-w-0 gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))" }} aria-label="Projects list cards">
            {displayedViews.map((view) => <ProjectRegisterCard key={view.project.id} view={view} canManage={canManage} onOpenProject={onOpenProject} onEditProject={onEditProject} onOpenLifecycle={onOpenLifecycle} />)}
          </div>
        )
      ) : (
        <Card className="p-8 text-center text-xs hqs-secondary-text" elevation="low">
          <p className="font-semibold hqs-secondary-text">No projects match the current filters.</p>
          <p className="mt-1">Try adjusting your search query, status, or financial health filter.</p>
        </Card>
      )}
      </div>

      {/* Secondary portfolio analysis stays available after the primary project work. */}
      <details aria-label="Portfolio Management Summary" data-ux45c="projects-secondary-analysis" className="group hqs-surface-raised rounded-xl shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black hqs-primary-text [&::-webkit-details-marker]:hidden">
          <span>Portfolio snapshot</span>
          <span className="hqs-warning-text inline-flex items-center gap-1.5 text-xs font-bold">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Attention Signals: {portfolio.projectsNeedingAttentionCount}
          </span>
        </summary>
        <div className="space-y-3 border-t hqs-border p-3">
          <Card className="p-4 shadow-sm" elevation="low">
            <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-xs sm:grid-cols-4" aria-label="Project counts">
              <div><dt className="hqs-secondary-text">Total projects</dt><dd className="mt-0.5 text-lg font-black tabular-nums hqs-primary-text">{isHydrating ? "…" : portfolio.totalProjects}</dd></div>
              <div><dt className="hqs-secondary-text">Active</dt><dd className="mt-0.5 text-lg font-black tabular-nums hqs-success-text">{isHydrating ? "…" : portfolio.activeProjects}</dd></div>
              <div><dt className="hqs-secondary-text">On hold</dt><dd className="mt-0.5 text-lg font-black tabular-nums hqs-warning-text">{isHydrating ? "…" : portfolio.onHoldProjects}</dd></div>
              <div><dt className="hqs-secondary-text">Archived</dt><dd className="mt-0.5 text-lg font-black tabular-nums hqs-secondary-text">{isHydrating ? "…" : portfolio.archivedProjects}</dd></div>
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t hqs-border pt-3 text-xs" aria-label="Project management attention counts">
              <div><dt className="hqs-secondary-text">Needs attention</dt><dd className={`mt-0.5 text-lg font-black tabular-nums ${portfolio.projectsNeedingAttentionCount > 0 ? "hqs-warning-text" : "hqs-success-text"}`}>{isHydrating ? "…" : portfolio.projectsNeedingAttentionCount}</dd></div>
              <div><dt className="hqs-secondary-text">Critical signals</dt><dd className={`mt-0.5 text-lg font-black tabular-nums ${portfolio.criticalAttentionCount > 0 ? "hqs-danger-text" : "hqs-secondary-text"}`}>{isHydrating ? "…" : portfolio.criticalAttentionCount}</dd></div>
              <div><dt className="hqs-secondary-text">Warning signals</dt><dd className={`mt-0.5 text-lg font-black tabular-nums ${portfolio.warningAttentionCount > 0 ? "hqs-warning-text" : "hqs-secondary-text"}`}>{isHydrating ? "…" : portfolio.warningAttentionCount}</dd></div>
              <div><dt className="hqs-secondary-text">Info signals</dt><dd className="mt-0.5 text-lg font-black tabular-nums hqs-accent-text">{isHydrating ? "…" : portfolio.infoAttentionCount}</dd></div>
            </div>
          </Card>
          {portfolio.currencies.length > 0 && (
            <details className="group hqs-surface-raised rounded-xl shadow-sm" aria-label="Portfolio Financial Totals">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-black hqs-primary-text [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-1.5"><Coins className="h-3.5 w-3.5 hqs-accent-text" aria-hidden="true" />Financial totals by currency</span>
                <span className="text-[10px] font-semibold hqs-secondary-text group-open:hidden">Show detail</span>
                <span className="hidden text-[10px] font-semibold hqs-secondary-text group-open:inline">Hide detail</span>
              </summary>
              <div className="grid gap-3 border-t hqs-border p-3 sm:grid-cols-2 xl:grid-cols-3">
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
                    <Card key={currencyCode} className="p-4 shadow-none" elevation="low" data-portfolio-currency={currencyCode}>
                      <div className="flex items-center justify-between gap-2 border-b hqs-border pb-2.5">
                        <span className="text-xs font-black uppercase hqs-accent-text">{currencyCode} Portfolio ({group.projectCount})</span>
                        {!group.isComplete && <span className="hqs-attention-warning rounded px-1.5 py-0.5 text-[10px] font-bold">Partial / unavailable</span>}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        {metrics.map(([label, metric]) => <div key={label} className="flex min-w-0 flex-col"><span className="hqs-secondary-text">{label}</span><PortfolioFinancialValue metric={metric} currency={currencyCode} /></div>)}
                      </div>
                      <div className="mt-3 border-t hqs-border pt-2 text-[9px] hqs-secondary-text">Optional controls: pending {portfolioMetricInline(group.financialMetrics.pendingCostExposure, currencyCode)} · payables {portfolioMetricInline(group.financialMetrics.outstandingPayables, currencyCode)}</div>
                    </Card>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      </details>
    </>
  );
}
