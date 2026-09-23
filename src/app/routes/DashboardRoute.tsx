import React from "react";
import { AlertTriangle, ArrowLeft, BarChart3 } from "lucide-react";
import {
  EngineeringCostOperationsDashboard,
  type DashboardActivityPeriod,
  type DashboardViewData,
} from "../../components/engineering/EngineeringCostOperationsDashboard.tsx";
import { HomeDashboard } from "../../components/dashboard/HomeDashboard.tsx";
import type { InvoiceData, Project } from "../../types.ts";
import { useAppPermissions, useProjectCostCompleteness, useWorkspaceDataPending } from "../AppPermissionContext.tsx";
import { ActionButton, PageHeader } from "../../components/ui/OperationsUI.tsx";
import { projectCostMissingSourceLabels, type ProjectCostSource } from "../../utils/dataCompleteness.ts";
import { appPathForOperationsInsights, appPathForTab, type DashboardWorkspaceView } from "../../utils/appRouting.ts";
import type { AppTab } from "../../utils/routes.ts";
import type { PermissionKey } from "../../utils/accessControl.ts";
import { dashboardLaunchItemsForPermissions } from "../../utils/dashboardHomeModel.ts";

export interface DashboardRouteProps {
  data: DashboardViewData;
  projects: Project[];
  selectedProjectId?: string;
  onProjectChange?: (projectId?: string) => void;
  onActivityPeriodChange: (period: DashboardActivityPeriod) => void;
  onCustomRangeChange?: (start: string, end: string) => void;
  onCurrencyChange: (currency: string) => void;
  onNavigate: (tab: AppTab) => void;
  onNavigatePath?: (path: string, replace?: boolean) => void;
  onOpenProject: (projectId: string) => void;
  onOpenInvoice: (invoice: InvoiceData) => void;
  view?: DashboardWorkspaceView;
}

function findPermittedMissingSource(
  missingSources: readonly ProjectCostSource[],
  permissions: readonly PermissionKey[],
): { tab: AppTab; label: string } | undefined {
  const visibleTabs = new Set(dashboardLaunchItemsForPermissions(permissions).map((item) => item.tab));
  const sources: Readonly<Record<string, { tab: AppTab; label: string }>> = {
    supplierInvoices: { tab: "invoices", label: "Supplier Invoices" },
    payrollLabor: { tab: "payroll", label: "Payroll" },
    directExpenses: { tab: "expenses", label: "Expenses" },
  };
  return missingSources
    .map((source) => sources[source])
    .find((source) => source && visibleTabs.has(source.tab));
}

function OperationsInsightsUnavailable({
  loading,
  permissions,
  onNavigate,
  onBackHome,
}: {
  loading: boolean;
  permissions: readonly PermissionKey[];
  onNavigate: (tab: AppTab) => void;
  onBackHome: () => void;
}) {
  const completeness = useProjectCostCompleteness();
  const missingSources = projectCostMissingSourceLabels(completeness);
  const source = findPermittedMissingSource(completeness.missingSources, permissions);

  return (
    <div className="space-y-4" data-dashboard-view="insights" data-dashboard-insights={loading ? "loading" : "incomplete"} aria-busy={loading}>
      <PageHeader
        eyebrow="Operations overview"
        title="Operations Insights"
        description="Detailed analysis for project cost, supplier obligations, and operational activity."
        actions={<ActionButton variant="ghost" label="Back to Home" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBackHome} />}
      />
      {loading ? (
        <div className="hqs-surface-raised flex min-h-32 items-center gap-3 rounded-xl p-5" role="status" aria-label="Loading Operations Insights">
          <span className="hqs-attention-info flex h-9 w-9 items-center justify-center rounded-lg" aria-hidden="true"><BarChart3 className="h-4 w-4" /></span>
          <div>
            <p className="hqs-primary-text text-sm font-semibold">Loading available analysis</p>
            <p className="hqs-secondary-text mt-1 text-xs">Home and its permitted workflows remain available.</p>
          </div>
        </div>
      ) : (
        <section className="hqs-exception-warning flex flex-wrap items-center justify-between gap-3 rounded-xl p-4" role="status" aria-label="Operations Insights are incomplete">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="hqs-warning-text mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="hqs-primary-text text-sm font-semibold">Combined project-cost analysis is withheld.</p>
              <p className="hqs-secondary-text mt-1 text-xs leading-5">
                Required source data is unavailable or incomplete{missingSources.length ? ` · ${missingSources.slice(0, 3).join(", ")}` : ""}. No missing values are treated as zero.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {source && <ActionButton variant="secondary" size="sm" label={`Open ${source.label}`} onClick={() => onNavigate(source.tab)} />}
            <ActionButton variant="ghost" size="sm" label="Back to Home" onClick={onBackHome} />
          </div>
        </section>
      )}
    </div>
  );
}

export const DashboardRoute: React.FC<DashboardRouteProps> = ({
  data,
  projects,
  selectedProjectId,
  onProjectChange,
  onActivityPeriodChange,
  onCustomRangeChange,
  onCurrencyChange,
  onNavigate,
  onNavigatePath,
  onOpenProject,
  onOpenInvoice,
  view = "home",
}) => {
  const permissions = useAppPermissions();
  const completeness = useProjectCostCompleteness();
  const workspaceDataPending = useWorkspaceDataPending();
  const openInsights = () => {
    if (onNavigatePath) onNavigatePath(appPathForOperationsInsights());
    else onNavigate("dashboard");
  };
  const backHome = () => {
    if (onNavigatePath) onNavigatePath(appPathForTab("dashboard"));
    else onNavigate("dashboard");
  };

  if (view === "home") {
    return (
      <HomeDashboard
        data={data}
        projects={projects}
        permissions={permissions}
        completeness={completeness}
        workspaceDataPending={workspaceDataPending}
        onNavigate={onNavigate}
        onOpenProject={onOpenProject}
        onOpenOperationsInsights={openInsights}
      />
    );
  }

  if (workspaceDataPending || !completeness.complete) {
    return <OperationsInsightsUnavailable loading={workspaceDataPending} permissions={permissions} onNavigate={onNavigate} onBackHome={backHome} />;
  }

  return (
    <div data-dashboard-view="insights">
      <EngineeringCostOperationsDashboard
        data={data}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onProjectChange={onProjectChange}
        onActivityPeriodChange={onActivityPeriodChange}
        onCustomRangeChange={onCustomRangeChange}
        onCurrencyChange={onCurrencyChange}
        onNavigate={onNavigate}
        onOpenProject={onOpenProject}
        onOpenInvoice={onOpenInvoice}
        onBackHome={backHome}
      />
    </div>
  );
};

export default DashboardRoute;
