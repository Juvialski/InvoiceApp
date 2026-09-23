import React from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  FileCheck2,
  FileText,
  HardHat,
  Mail,
  PackageCheck,
  Receipt,
  TriangleAlert,
  WalletCards,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Project, ProjectStatus } from "../../types.ts";
import type { DashboardViewData } from "../engineering/EngineeringCostOperationsDashboard.tsx";
import { ActionButton, PageHeader, StatusBadge } from "../ui/OperationsUI.tsx";
import type { PermissionKey } from "../../utils/accessControl.ts";
import { projectCostMissingSourceLabels, type DataCompleteness, type ProjectCostSource } from "../../utils/dataCompleteness.ts";
import type { AppTab } from "../../utils/routes.ts";
import {
  dashboardAttentionForHome,
  dashboardLaunchItemsForPermissions,
  dashboardSnapshotForHome,
  type DashboardLaunchItem,
} from "../../utils/dashboardHomeModel.ts";

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

const DESTINATION_ICONS: Readonly<Record<AppTab, LucideIcon>> = {
  dashboard: BarChart3,
  projects: BriefcaseBusiness,
  invoices: FileCheck2,
  review: FileCheck2,
  procurement: ClipboardList,
  expenses: Receipt,
  payroll: HardHat,
  cash: WalletCards,
  warehouse: PackageCheck,
  equipment: Wrench,
  documents: FileText,
  inbox: Mail,
  extractor: Receipt,
  vendors: BriefcaseBusiness,
  reports: BarChart3,
  settings: Wrench,
};

const MISSING_SOURCE_ROUTES: Readonly<Record<ProjectCostSource, { tab: AppTab; label: string }>> = {
  supplierInvoices: { tab: "invoices", label: "Supplier Invoices" },
  payrollLabor: { tab: "payroll", label: "Payroll" },
  directExpenses: { tab: "expenses", label: "Expenses" },
};

function projectStatusTone(status: ProjectStatus): "success" | "warning" | "neutral" | "info" {
  if (status === "ACTIVE" || (status as string) === "IN_PROGRESS") return "success";
  if (status === "ON_HOLD") return "warning";
  if (status === "COMPLETED" || status === "ARCHIVED" || status === "CANCELLED") return "neutral";
  return "info";
}

function projectMonogram(project: Project): string {
  const initials = project.projectName?.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("");
  return initials?.toUpperCase() || project.projectCode?.trim().slice(0, 2).toUpperCase() || "P";
}

function LaunchRow({ item, onNavigate }: { item: DashboardLaunchItem; onNavigate: (tab: AppTab) => void }) {
  const Icon = DESTINATION_ICONS[item.tab];
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.tab)}
      className="hqs-row-hover hqs-focus-ring flex w-full min-w-0 items-center gap-3 border-b hqs-border py-3 text-left last:border-b-0"
    >
      <span className="hqs-attention-neutral flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="hqs-primary-text block text-sm font-bold">{item.label}</strong>
        <span className="hqs-secondary-text mt-0.5 block text-xs leading-5">{item.description}</span>
      </span>
      <ArrowRight className="hqs-secondary-text h-4 w-4 shrink-0" aria-hidden="true" />
    </button>
  );
}

function ProjectRow({ project, onOpenProject }: { project: Project; onOpenProject: (projectId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpenProject(project.id)}
      className="hqs-row-hover hqs-focus-ring flex w-full min-w-0 items-center gap-3 border-b hqs-border py-3 text-left last:border-b-0"
    >
      <span className="hqs-attention-info flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-black uppercase" aria-hidden="true">
        {projectMonogram(project)}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="hqs-primary-text block truncate text-sm font-bold">{project.projectName || "Unnamed project"}</strong>
        <span className="hqs-secondary-text mt-0.5 block truncate text-xs">{project.projectCode} {project.clientName ? `· ${project.clientName}` : ""}</span>
      </span>
      <StatusBadge tone={projectStatusTone(project.status)}>{project.status.replaceAll("_", " ")}</StatusBadge>
    </button>
  );
}

function IncompleteProjectCostNotice({
  completeness,
  permissions,
  onNavigate,
}: Pick<HomeDashboardProps, "completeness" | "permissions" | "onNavigate">) {
  const sourceLabels = projectCostMissingSourceLabels(completeness);
  const visibleTabs = new Set(dashboardLaunchItemsForPermissions(permissions).map((item) => item.tab));
  const sourceLink = completeness.missingSources
    .map((source) => MISSING_SOURCE_ROUTES[source])
    .find((source) => visibleTabs.has(source.tab));

  return (
    <section className="hqs-exception-warning flex flex-wrap items-center justify-between gap-3 rounded-xl p-3.5" role="status" aria-label="Some project cost insights are unavailable">
      <div className="flex min-w-0 items-start gap-2.5">
        <TriangleAlert className="hqs-warning-text mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="hqs-primary-text text-sm font-semibold">Some project cost insights are withheld.</p>
          <p className="hqs-secondary-text mt-0.5 text-xs leading-5">
            Required source data is unavailable or incomplete. Affected totals remain hidden{sourceLabels.length ? ` · ${sourceLabels.slice(0, 3).join(", ")}` : ""}.
          </p>
        </div>
      </div>
      {sourceLink && <ActionButton variant="ghost" size="sm" label={`Open ${sourceLink.label}`} onClick={() => onNavigate(sourceLink.tab)} />}
    </section>
  );
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  data,
  projects,
  permissions,
  completeness,
  workspaceDataPending,
  onNavigate,
  onOpenProject,
  onOpenOperationsInsights,
}) => {
  const launchItems = dashboardLaunchItemsForPermissions(permissions);
  const featuredItem = launchItems.find((item) => item.emphasis === "primary") || launchItems[0];
  const remainingLaunchItems = featuredItem ? launchItems.filter((item) => item.id !== featuredItem.id) : [];
  const visibleAttention = dashboardAttentionForHome({
    items: data.attention,
    permissions,
    completeness,
    workspaceDataPending,
  });
  const snapshot = dashboardSnapshotForHome({
    projects,
    data,
    permissions,
    completeness,
    workspaceDataPending,
  });
  const canReadProjects = launchItems.some((item) => item.tab === "projects");
  const activeProjects = canReadProjects
    ? projects.filter((project) => project.status === "ACTIVE" || (project.status as string) === "IN_PROGRESS").slice(0, 3)
    : [];

  return (
    <div className="space-y-4" data-dashboard-view="home" aria-busy={workspaceDataPending}>
      <PageHeader
        eyebrow="Operations overview"
        title="Home"
        description="Your company workspace at a glance."
      />

      {!completeness.complete && <IncompleteProjectCostNotice completeness={completeness} permissions={permissions} onNavigate={onNavigate} />}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.75fr)]">
        <div className="min-w-0 space-y-4">
          <section className="hqs-surface rounded-xl p-4 sm:p-5" aria-label="Needs your attention">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="hqs-primary-text text-base font-bold">Needs your attention</h2>
                <p className="hqs-secondary-text mt-1 text-xs leading-5">Open an existing workflow to review the current state.</p>
              </div>
              {visibleAttention.length > 0 && <StatusBadge tone="warning" icon={TriangleAlert}>{visibleAttention.length} item{visibleAttention.length === 1 ? "" : "s"}</StatusBadge>}
            </div>
            <div className="mt-2 divide-y hqs-border">
              {workspaceDataPending ? (
                <p className="hqs-secondary-text py-3 text-sm" role="status">Checking available workflow state…</p>
              ) : visibleAttention.length ? visibleAttention.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.action)}
                  className="hqs-row-hover hqs-focus-ring flex w-full min-w-0 items-start gap-3 py-3 text-left"
                >
                  <span className="hqs-attention-warning mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" aria-hidden="true">
                    <TriangleAlert className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="hqs-primary-text block text-sm font-semibold">{item.label}{item.count !== undefined ? ` · ${item.count}` : ""}</strong>
                    <span className="hqs-secondary-text mt-0.5 block text-xs leading-5">{item.detail}</span>
                  </span>
                  <ArrowUpRight className="hqs-secondary-text mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
              )) : (
                <p className="hqs-secondary-text py-3 text-sm">
                  {completeness.complete ? "No open attention items are available for this workspace." : "No attention items can be shown from the available source data."}
                </p>
              )}
            </div>
          </section>

          <section className="hqs-surface rounded-xl p-4 sm:p-5" aria-label="Choose a task">
            <div>
              <h2 className="hqs-primary-text text-base font-bold">What do you want to do today?</h2>
              <p className="hqs-secondary-text mt-1 text-xs leading-5">Open the work area your role can access.</p>
            </div>
            {featuredItem ? (
              <div className="mt-4 grid min-w-0 gap-x-5 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <button
                  type="button"
                  onClick={() => onNavigate(featuredItem.tab)}
                  className="hqs-surface-muted hqs-focus-ring group flex min-h-36 min-w-0 items-center gap-4 rounded-xl p-4 text-left"
                >
                  {(() => {
                    const Icon = DESTINATION_ICONS[featuredItem.tab];
                    return <span className="hqs-attention-info flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"><Icon className="h-5 w-5" aria-hidden="true" /></span>;
                  })()}
                  <span className="min-w-0 flex-1">
                    <strong className="hqs-primary-text block text-lg font-bold group-hover:hqs-accent-text">{featuredItem.label}</strong>
                    <span className="hqs-secondary-text mt-1 block text-sm leading-5">{featuredItem.description}</span>
                  </span>
                  <ArrowRight className="hqs-accent-text h-5 w-5 shrink-0" aria-hidden="true" />
                </button>

                <div className="min-w-0 divide-y hqs-border">
                  {remainingLaunchItems.slice(0, 4).map((item) => <LaunchRow key={item.id} item={item} onNavigate={onNavigate} />)}
                  {remainingLaunchItems.length === 0 && <p className="hqs-secondary-text py-3 text-sm">No other workflow destinations are available for your role.</p>}
                </div>
              </div>
            ) : (
              <p className="hqs-secondary-text mt-4 text-sm">No workflow destinations are available for your role.</p>
            )}

            {remainingLaunchItems.length > 4 && (
              <details className="mt-3 border-t hqs-border pt-3">
                <summary className="hqs-focus-ring hqs-control inline-flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold [&::-webkit-details-marker]:hidden">
                  More workflows <span className="hqs-secondary-text">{remainingLaunchItems.length - 4}</span>
                </summary>
                <div className="mt-2 divide-y hqs-border">
                  {remainingLaunchItems.slice(4).map((item) => <LaunchRow key={item.id} item={item} onNavigate={onNavigate} />)}
                </div>
              </details>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="hqs-surface rounded-xl p-4 sm:p-5" aria-label="Workspace snapshot">
            <h2 className="hqs-primary-text text-base font-bold">Workspace snapshot</h2>
            {workspaceDataPending ? (
              <p className="hqs-secondary-text mt-3 text-sm" role="status">Updating available counts…</p>
            ) : snapshot.length ? (
              <div className="mt-2 divide-y hqs-border">
                {snapshot.map((item) => (
                  <button key={item.id} type="button" onClick={() => onNavigate(item.tab)} className="hqs-row-hover hqs-focus-ring flex w-full items-center justify-between gap-3 py-3 text-left">
                    <span className="hqs-secondary-text text-sm">{item.label}</span>
                    <span className="hqs-primary-text text-lg font-bold tabular-nums">{item.value}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="hqs-secondary-text mt-3 text-sm">No summary indicators are available for this role.</p>
            )}
          </section>

          {canReadProjects && (
            <section className="hqs-surface rounded-xl p-4 sm:p-5" aria-label="Active projects">
              <div className="flex items-center justify-between gap-3">
                <h2 className="hqs-primary-text text-base font-bold">Active projects</h2>
                <ActionButton variant="ghost" size="sm" label="All projects" onClick={() => onNavigate("projects")} />
              </div>
              <div className="mt-1 divide-y hqs-border">
                {workspaceDataPending ? <p className="hqs-secondary-text py-3 text-sm" role="status">Loading projects…</p> : activeProjects.length ? (
                  activeProjects.map((project) => <ProjectRow key={project.id} project={project} onOpenProject={onOpenProject} />)
                ) : (
                  <p className="hqs-secondary-text py-3 text-sm">No active projects are available.</p>
                )}
              </div>
            </section>
          )}

          <section className="hqs-surface-raised flex items-start gap-3 rounded-xl p-4 sm:p-5" aria-label="Operations Insights">
            <span className="hqs-attention-info flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" aria-hidden="true"><BarChart3 className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="hqs-primary-text text-base font-bold">Operations Insights</h2>
              <p className="hqs-secondary-text mt-1 text-xs leading-5">Explore detailed project cost, payables, and activity analysis.</p>
              <ActionButton variant="ghost" size="sm" label="Open insights" icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={onOpenOperationsInsights} className="mt-2" />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};
