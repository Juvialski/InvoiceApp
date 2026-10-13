import React from "react";
import { ArrowRight, BarChart3, ClipboardList, PackageCheck, Receipt, WalletCards, type LucideIcon } from "lucide-react";
import type { Project } from "../../types.ts";
import type { DashboardViewData } from "../engineering/EngineeringCostOperationsDashboard.tsx";
import { ActionButton, PageHeader, StatusBadge } from "../ui/OperationsUI.tsx";
import type { PermissionKey } from "../../utils/accessControl.ts";
import type { DataCompleteness, ProjectCostSource } from "../../utils/dataCompleteness.ts";
import type { AppTab } from "../../utils/routes.ts";
import { activateDashboardAttention, dashboardAttentionForHome, dashboardLaunchItemsForPermissions, dashboardQuickTasksForPermissions, dashboardSnapshotForHome } from "../../utils/dashboardHomeModel.ts";

export interface HomeDashboardProps {
  data: DashboardViewData;
  projects: readonly Project[];
  permissions: readonly PermissionKey[];
  completeness: DataCompleteness<ProjectCostSource>;
  workspaceDataPending: boolean;
  onNavigate: (tab: AppTab) => void;
  onOpenProject: (projectId: string) => void;
  onOpenOperationsInsights: () => void;
}

const TASK_ICONS: Record<string, LucideIcon> = {
  "add-bill": Receipt, "record-payment": WalletCards, "open-workbook": ClipboardList, "assign-stock": PackageCheck,
};

export const HomeDashboard: React.FC<HomeDashboardProps> = ({ data, projects, permissions, completeness, workspaceDataPending, onNavigate, onOpenProject, onOpenOperationsInsights }) => {
  const tasks = dashboardQuickTasksForPermissions(permissions);
  const destinations = dashboardLaunchItemsForPermissions(permissions);
  const visibleAttention = dashboardAttentionForHome({ items: data.attention, permissions, completeness, workspaceDataPending });
  const snapshot = dashboardSnapshotForHome({ projects, data, permissions, completeness, workspaceDataPending });
  const canReadProjects = destinations.some((item) => item.tab === "projects");
  const activeProjects = canReadProjects ? projects.filter((project) => project.status === "ACTIVE" || (project.status as string) === "IN_PROGRESS").slice(0, 3) : [];

  return <div className="space-y-5" data-dashboard-view="home" aria-busy={workspaceDataPending}>
    <PageHeader title="Home" description="What do you want to do today?" />
    <section aria-label="Choose a task" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tasks.map((task) => {
        const Icon = TASK_ICONS[task.id];
        return <button key={task.id} type="button" data-home-task={task.id} onClick={() => onNavigate(task.tab)} className="hqs-surface hqs-row-hover hqs-focus-ring group flex min-h-24 min-w-0 items-start gap-3 rounded-lg p-4 text-left">
          <span className="hqs-accent-text flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-muted)]"><Icon aria-hidden="true" className="h-5 w-5" /></span>
          <span className="min-w-0"><strong className="hqs-primary-text block text-base font-semibold">{task.label}</strong><span className="hqs-secondary-text mt-1 block text-sm leading-5">{task.description}</span></span>
        </button>;
      })}
      {!tasks.length && <p className="hqs-secondary-text text-sm sm:col-span-2">Use the navigation to open the work areas available to your role.</p>}
    </section>

    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="hqs-surface min-w-0 rounded-xl p-4 sm:p-5" aria-label="Needs your attention">
        <h2 className="hqs-primary-text text-base font-bold">Needs your attention</h2>
        <div className="mt-2 divide-y hqs-border">
          {workspaceDataPending ? <p className="hqs-secondary-text py-3 text-sm" role="status">Checking your work…</p> : visibleAttention.length ? visibleAttention.map((item) => <button key={item.id} type="button" onClick={() => activateDashboardAttention(item, onNavigate, onOpenProject)} className="hqs-row-hover hqs-focus-ring flex min-h-14 w-full min-w-0 items-center gap-3 py-3 text-left">
            <span className="min-w-0 flex-1"><strong className="hqs-primary-text block text-sm font-semibold">{item.id === "invoice-review" ? "Bills needing review" : item.id === "invoice-overdue" ? "Overdue bills" : item.id === "unallocated-cost" ? "Costs missing a project" : item.label}{item.count !== undefined ? ` · ${item.count}` : ""}</strong><span className="hqs-secondary-text mt-1 block text-xs leading-5">{item.id === "invoice-review" ? "Check the details, resolve issues, then confirm the bill." : item.id === "invoice-overdue" ? "Open a bill to check its due date and record a payment." : item.projectId ? "Open the project to review its budget and planned purchases." : item.id === "unallocated-cost" ? "Review which project these costs belong to." : item.detail}</span></span><ArrowRight aria-hidden="true" className="hqs-secondary-text h-4 w-4 shrink-0" />
          </button>) : <p className="hqs-secondary-text py-3 text-sm">{completeness.complete ? "Nothing needs your attention right now." : "No attention items can be shown from the available data."}</p>}
        </div>
      </section>

      <aside className="min-w-0 space-y-5">
        {snapshot.length > 0 && <section aria-label="Workspace snapshot" className="hqs-surface rounded-xl p-4 sm:p-5">
          <h2 className="hqs-primary-text text-base font-bold">At a glance</h2>
          <div className="mt-2 divide-y hqs-border">{snapshot.map((item) => <button key={item.id} type="button" onClick={() => onNavigate(item.tab)} className="hqs-row-hover hqs-focus-ring flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left"><span className="hqs-secondary-text text-sm">{item.id === "invoice-review" ? "Bills needing review" : item.label}</span><strong className="hqs-primary-text text-lg tabular-nums">{item.value}</strong></button>)}</div>
        </section>}
        {canReadProjects && <section aria-label="Active projects" className="hqs-surface rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2"><h2 className="hqs-primary-text text-base font-bold">Active projects</h2><ActionButton variant="ghost" size="sm" label="All projects" onClick={() => onNavigate("projects")} /></div>
          <div className="mt-1 divide-y hqs-border">{workspaceDataPending ? <p className="hqs-secondary-text py-3 text-sm" role="status">Loading projects…</p> : activeProjects.length ? activeProjects.map((project) => <button key={project.id} type="button" onClick={() => onOpenProject(project.id)} className="hqs-row-hover hqs-focus-ring flex min-h-14 w-full min-w-0 items-center gap-3 py-3 text-left"><span className="min-w-0 flex-1"><strong className="hqs-primary-text block break-words text-sm font-bold">{project.projectName || "Unnamed project"}</strong><span className="hqs-secondary-text text-xs">{project.projectCode}</span></span><StatusBadge tone="success">Active</StatusBadge></button>) : <p className="hqs-secondary-text py-3 text-sm">No active projects yet.</p>}</div>
        </section>}
      </aside>
    </div>

    <details className="border-t hqs-border pt-3">
      <summary className="hqs-focus-ring hqs-secondary-text min-h-11 cursor-pointer py-2 text-sm font-semibold">Business insights</summary>
      {!completeness.complete && <p role="status" className="hqs-warning-text mb-2 text-sm">Some project cost insights are unavailable. Required source data is incomplete; affected totals remain hidden.</p>}
      <ActionButton variant="ghost" size="sm" label="Open Operations Insights" icon={<BarChart3 aria-hidden="true" className="h-4 w-4" />} onClick={onOpenOperationsInsights} />
    </details>
  </div>;
};
