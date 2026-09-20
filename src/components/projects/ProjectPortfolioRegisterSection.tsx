import React, { useState } from "react";
import {
  Archive,
  ArrowUpDown,
  ChevronDown,
  Coins,
  Pencil,
  RotateCcw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import type { Project, ProjectStatus } from "../../types.ts";
import { projectTaxTreatmentLabel } from "../../utils/projectTaxTreatment.ts";
import { StatusBadge, type StatusTone } from "../ui/OperationsUI.tsx";
import { OperationsGrid } from "../ui/OperationsGrid.tsx";
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
      return "bg-rose-50 text-rose-800 border-rose-200";
    case "warning":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "info":
      return "bg-indigo-50 text-indigo-800 border-indigo-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
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
  const hasAttention = view.attentionFlags.length > 0;

  return (
    <Card key={project.id} data-project-id={project.id} className="min-w-0 w-full overflow-hidden shadow-sm" elevation="low">
      <button
        type="button"
        onClick={() => onOpenProject(project)}
        aria-label={`Open project workspace for ${project.projectName || project.projectCode}`}
        className="group block w-full space-y-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-indigo-600">{project.projectCode}</span>
            <h3 className="mt-1 truncate text-lg font-black leading-tight text-slate-950 group-hover:text-indigo-700 sm:text-xl">{project.projectName || "Unnamed project"}</h3>
            <p className="mt-1 truncate text-[11px] text-slate-500">Client: {project.clientName || "No client set"}</p>
            <p className="truncate text-[11px] text-slate-500">Location: {project.location || project.siteAddress || "Not set"}</p>
          </div>
          <StatusBadge tone={statusTone(project.status)}>{project.status.replaceAll("_", " ")}</StatusBadge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
          <span><span className="font-semibold text-slate-600">Manager:</span> {project.projectManager || "Not assigned"}</span>
          <span className="font-black uppercase tracking-wide text-slate-700">{view.currency}</span>
          <StatusBadge tone={project.taxTreatment === "UNCLASSIFIED" || !project.taxTreatment ? "warning" : "info"}>{projectTaxTreatmentLabel(project.taxTreatment)}</StatusBadge>
        </div>

        {hasAttention && (
          <div className="flex flex-wrap gap-1.5" aria-label="Project attention indicators">
            {view.attentionFlags.slice(0, 2).map((item) => (
              <span key={item.id} className={`rounded border px-2 py-0.5 text-[9px] font-bold ${attentionTone(item.tone)}`}>
                {item.label}
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5 text-xs">
          <div><span className="text-[10px] text-slate-500">Contract Value</span><p className="font-bold tabular-nums text-slate-900"><FinancialValue metric={view.financialTruth.contractValue} currency={view.currency} /></p></div>
          <div><span className="text-[10px] text-slate-500">Approved Project Budget</span><p className="font-bold tabular-nums text-slate-900"><FinancialValue metric={view.financialTruth.approvedCostBudget} currency={view.currency} /></p></div>
          <div><span className="text-[10px] text-slate-500">Actual Cost</span><p className="font-bold tabular-nums text-indigo-700"><FinancialValue metric={view.financialTruth.actualCost} currency={view.currency} /></p></div>
          <div><span className="text-[10px] text-slate-500">Committed Cost</span><p className="font-bold tabular-nums text-slate-900"><FinancialValue metric={view.financialTruth.committedCost} currency={view.currency} /></p></div>
        </div>

        {view.activeCostCodesCount > 0 && (
          <div className="flex flex-wrap justify-between gap-1 px-1 text-[10px] text-slate-600">
            <span>{view.activeCostCodesCount} active work packages ({money(view.allocatedCostCodeBudget, view.currency)} allocated)</span>
            {view.costClassificationAvailable && view.uncodedActualCost !== null && view.uncodedActualCost > 0 && <span className="font-semibold text-amber-700">Uncoded: {money(view.uncodedActualCost, view.currency)}</span>}
          </div>
        )}
      </button>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3">
        {canManage && <Button variant="secondary" label="Edit project details" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEditProject(project)} />}
        {canManage && (
          <details className="relative ml-auto">
            <summary className="cursor-pointer list-none rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 [&::-webkit-details-marker]:hidden">More actions</summary>
            <div className="absolute right-0 z-20 mt-1 min-w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
              <button type="button" onClick={() => onOpenLifecycle(project)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                {project.status === "ARCHIVED" ? <RotateCcw className="h-3.5 w-3.5 text-emerald-600" /> : <Archive className="h-3.5 w-3.5 text-slate-500" />}
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
                  className="text-left hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                >
                  <span className="block text-[10px] font-black uppercase tracking-wide text-indigo-600">{project.projectCode}</span>
                  <strong className="mt-0.5 block text-xs font-bold text-slate-900">{project.projectName}</strong>
                  <span className="mt-0.5 block max-w-[22rem] truncate text-[10px] text-slate-500">
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
                      <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-black text-slate-700">
                        {view.attentionFlags.length} attention signal{view.attentionFlags.length === 1 ? "" : "s"}
                      </span>
                      {view.attentionFlags.slice(0, 2).map((item) => <span key={item.id} className={"rounded border px-1.5 py-0.5 text-[9px] font-bold " + attentionTone(item.tone)} title={item.detail}>{item.label}</span>)}
                      {view.attentionFlags.length > 2 && <span className="text-[9px] font-semibold text-slate-400">+{view.attentionFlags.length - 2} more</span>}
                    </div>
                  )}
                  {topAttention && <span className="block max-w-[18rem] truncate text-[9px] font-semibold text-slate-600" title={topAttention.explanation}>Top reason: {topAttention.title}</span>}
                  {view.isPartial && <span className="block text-[9px] font-bold text-amber-700">Partial project data</span>}
                </div>
              );
            },
          },
          { key: "currency", header: "Currency", sortValue: (view) => view.currency, protected: true, value: (view) => <span className="font-black uppercase tracking-wide">{view.currency}</span> },
          { key: "taxTreatment", header: "Tax treatment", protected: true, value: (view) => <StatusBadge tone={view.project.taxTreatment === "UNCLASSIFIED" || !view.project.taxTreatment ? "warning" : "info"}>{projectTaxTreatmentLabel(view.project.taxTreatment)}</StatusBadge> },
          { key: "contractValue", header: "Contract Value", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.contractValue.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums", value: (view) => <FinancialValue metric={view.financialTruth.contractValue} currency={view.currency} /> },
          { key: "projectBudget", header: "Budget", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.approvedCostBudget.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums", value: (view) => <FinancialValue metric={view.financialTruth.approvedCostBudget} currency={view.currency} /> },
          { key: "actualCost", header: "Actual", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.actualCost.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums text-indigo-700", value: (view) => <FinancialValue metric={view.financialTruth.actualCost} currency={view.currency} /> },
          { key: "committedCost", header: "Committed", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.committedCost.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums", value: (view) => <FinancialValue metric={view.financialTruth.committedCost} currency={view.currency} /> },
          { key: "billed", header: "Billed", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.billed.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums", value: (view) => <FinancialValue metric={view.financialTruth.billed} currency={view.currency} /> },
          { key: "collected", header: "Collected", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.collected.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums", value: (view) => <FinancialValue metric={view.financialTruth.collected} currency={view.currency} /> },
          { key: "outstandingReceivables", header: "Outstanding", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.outstandingReceivables.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums text-amber-800", value: (view) => <FinancialValue metric={view.financialTruth.outstandingReceivables} currency={view.currency} /> },
          { key: "remainingToBill", header: "Remaining to Bill", align: "right" as const, protected: true, sortValue: (view) => view.financialTruth.remainingToBill.amount ?? -Infinity, cellClassName: "font-sans font-bold tabular-nums text-emerald-700", value: (view) => <FinancialValue metric={view.financialTruth.remainingToBill} currency={view.currency} /> },
        ]}
        renderActions={(view) => {
          const project = view.project;
          return (
            <div className="flex justify-end gap-1">
              <button type="button" onClick={() => onOpenProject(project)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Open</button>
              {canManage && <button type="button" onClick={() => onEditProject(project)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit project" aria-label={"Edit project " + project.projectCode}><Pencil className="h-3.5 w-3.5" /></button>}
              {canManage && <button type="button" onClick={() => onOpenLifecycle(project)} className={"rounded-lg p-1.5 " + (project.status === "ARCHIVED" ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:bg-rose-50 hover:text-rose-700")} title={project.status === "ARCHIVED" ? "Reactivate project" : "Project lifecycle"} aria-label={(project.status === "ARCHIVED" ? "Reactivate " : "Project lifecycle for ") + project.projectCode}>{project.status === "ARCHIVED" ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}</button>}
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
  hasProjectFilters,
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

  return (
    <>
      {/* Top Portfolio Management Summary: one compact decision surface. */}
      <details aria-label="Portfolio Management Summary" className="group rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-slate-900 [&::-webkit-details-marker]:hidden">
          <span>Portfolio snapshot</span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Attention Signals: {portfolio.projectsNeedingAttentionCount}
          </span>
        </summary>
        <div className="space-y-3 border-t border-slate-100 p-3">
          <Card className="p-4 shadow-sm" elevation="low">
            <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-xs sm:grid-cols-4" aria-label="Project counts">
              <div><dt className="text-slate-500">Total projects</dt><dd className="mt-0.5 text-lg font-black tabular-nums text-slate-950">{isHydrating ? "…" : portfolio.totalProjects}</dd></div>
              <div><dt className="text-slate-500">Active</dt><dd className="mt-0.5 text-lg font-black tabular-nums text-emerald-700">{isHydrating ? "…" : portfolio.activeProjects}</dd></div>
              <div><dt className="text-slate-500">On hold</dt><dd className="mt-0.5 text-lg font-black tabular-nums text-amber-700">{isHydrating ? "…" : portfolio.onHoldProjects}</dd></div>
              <div><dt className="text-slate-500">Archived</dt><dd className="mt-0.5 text-lg font-black tabular-nums text-slate-700">{isHydrating ? "…" : portfolio.archivedProjects}</dd></div>
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-slate-100 pt-3 text-xs sm:grid-cols-4" aria-label="Project management attention counts">
              <div><dt className="text-slate-500">Needs attention</dt><dd className={`mt-0.5 text-lg font-black tabular-nums ${portfolio.projectsNeedingAttentionCount > 0 ? "text-amber-700" : "text-emerald-700"}`}>{isHydrating ? "…" : portfolio.projectsNeedingAttentionCount}</dd></div>
              <div><dt className="text-slate-500">Critical signals</dt><dd className={`mt-0.5 text-lg font-black tabular-nums ${portfolio.criticalAttentionCount > 0 ? "text-rose-700" : "text-slate-700"}`}>{isHydrating ? "…" : portfolio.criticalAttentionCount}</dd></div>
              <div><dt className="text-slate-500">Warning signals</dt><dd className={`mt-0.5 text-lg font-black tabular-nums ${portfolio.warningAttentionCount > 0 ? "text-amber-700" : "text-slate-700"}`}>{isHydrating ? "…" : portfolio.warningAttentionCount}</dd></div>
              <div><dt className="text-slate-500">Info signals</dt><dd className="mt-0.5 text-lg font-black tabular-nums text-indigo-700">{isHydrating ? "…" : portfolio.infoAttentionCount}</dd></div>
            </div>
          </Card>

          {/* Financial distinctions stay available by currency without dominating the register. */}
          {portfolio.currencies.length > 0 && (
            <details className="group rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Portfolio Financial Totals">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-black text-slate-800 [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-1.5"><Coins className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />Financial totals by currency</span>
                <span className="text-[10px] font-semibold text-slate-500 group-open:hidden">Show detail</span>
                <span className="hidden text-[10px] font-semibold text-slate-500 group-open:inline">Hide detail</span>
              </summary>
              <div className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-2 xl:grid-cols-3">
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
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <span className="text-xs font-black uppercase text-indigo-700">{currencyCode} Portfolio ({group.projectCount})</span>
                        {!group.isComplete && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">Partial / unavailable</span>}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        {metrics.map(([label, metric]) => <div key={label} className="flex min-w-0 flex-col"><span className="text-slate-500">{label}</span><PortfolioFinancialValue metric={metric} currency={currencyCode} /></div>)}
                      </div>
                      <div className="mt-3 border-t border-slate-100 pt-2 text-[9px] text-slate-500">Optional controls: pending {portfolioMetricInline(group.financialMetrics.pendingCostExposure, currencyCode)} · payables {portfolioMetricInline(group.financialMetrics.outstandingPayables, currencyCode)}</div>
                    </Card>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      </details>

      {/* Filter and Search Toolbar */}
      <Card className="p-4 shadow-sm space-y-3" elevation="low">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
          {/* Search Query */}
          <div className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search code, name, client, PM, location..."
              className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="Search projects"
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange("")}
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
              value={statusFilter}
              onChange={(e) => onStatusChange(e.target.value as "ALL" | ProjectStatus)}
              className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="Filter by project status"
            >
              <option value="ALL">All Statuses</option>
              {projectStatuses.map((st) => (
                <option key={st} value={st}>
                  {st.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>

          <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2 lg:col-span-2 xl:col-span-3">
            <summary className="cursor-pointer list-none text-xs font-bold text-slate-700 [&::-webkit-details-marker]:hidden">More filters <span className="ml-1 text-[10px] font-semibold text-slate-500">manager, currency, attention</span></summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {/* Project Manager Filter */}
              <div className="relative">
                <select
                  value={managerFilter}
                  onChange={(e) => onManagerFilterChange(e.target.value)}
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
                  onChange={(e) => onCurrencyFilterChange(e.target.value)}
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
                  onChange={(e) => onHealthFilterChange(e.target.value as ProjectHealthFilter)}
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
                  onChange={(e) => onAttentionCategoryFilterChange(e.target.value as "ALL" | ProjectAttentionCategory)}
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
            </div>
          </details>

          {/* Sort Selector */}
          <div className="flex gap-2 xl:col-span-2">
            <div className="relative flex-1">
              <select
                value={sortField}
                onChange={(e) => onSortFieldChange(e.target.value as ProjectSortField)}
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
              onClick={() => onToggleSort(sortField)}
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
              onClick={onClearFilters}
              className="text-indigo-600 hover:text-indigo-800 font-semibold"
            >
              Reset filters
            </button>
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black text-slate-900">Projects</p>
          <p className="text-[11px] text-slate-500">Open a project card for its workspace, or switch to a dense list for high-volume scanning.</p>
        </div>
        <div role="group" aria-label="Project portfolio view" className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button type="button" aria-pressed={viewMode === "cards"} onClick={() => setViewMode("cards")} className={`rounded-md px-3 py-1.5 text-xs font-black ${viewMode === "cards" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Cards</button>
          <button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")} className={`rounded-md px-3 py-1.5 text-xs font-black ${viewMode === "list" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Compact List</button>
        </div>
      </div>

      {/* Main Content Area: visual cards by default, compact register on request */}
      {displayedViews.length ? (
        <div id="projects-results" className="space-y-4">
          {viewMode === "list" ? (
            <ProjectPortfolioOperationsGrid displayedViews={displayedViews} canManage={canManage} onOpenProject={onOpenProject} onEditProject={onEditProject} onOpenLifecycle={onOpenLifecycle} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Projects list cards">
              {displayedViews.map((view) => <ProjectRegisterCard key={view.project.id} view={view} canManage={canManage} onOpenProject={onOpenProject} onEditProject={onEditProject} onOpenLifecycle={onOpenLifecycle} />)}
            </div>
          )}
        </div>
      ) : (
        <Card className="p-8 text-center text-xs text-slate-500" elevation="low">
          <p className="font-semibold text-slate-700">No projects match the current filters.</p>
          <p className="mt-1">Try adjusting your search query, status, or financial health filter.</p>
        </Card>
      )}
    </>
  );
}
