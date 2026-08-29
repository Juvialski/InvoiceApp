import React from "react";
import { AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import {
  EngineeringCostOperationsDashboard,
  type DashboardActivityPeriod,
  type DashboardViewData,
} from "../../components/engineering/EngineeringCostOperationsDashboard";
import type { InvoiceData, Project } from "../../types";
import { canAccessAppTab } from "../../utils/accessControl.ts";
import { projectCostMissingSourceLabels } from "../../utils/dataCompleteness.ts";
import type { AppTab } from "../../utils/routes";
import { useAppPermissions, useProjectCostCompleteness, useWorkspaceDataPending } from "../AppPermissionContext.tsx";

export interface DashboardRouteProps {
  data: DashboardViewData;
  projects: Project[];
  selectedProjectId?: string;
  onProjectChange?: (projectId?: string) => void;
  onActivityPeriodChange: (period: DashboardActivityPeriod) => void;
  onCustomRangeChange?: (start: string, end: string) => void;
  onCurrencyChange: (currency: string) => void;
  onNavigate: (tab: AppTab) => void;
  onOpenProject: (projectId: string) => void;
  onOpenInvoice: (invoice: InvoiceData) => void;
}

const RESTRICTED_DASHBOARD_SHORTCUTS: ReadonlyArray<{ tab: AppTab; label: string; description: string }> = [
  { tab: "projects", label: "Projects", description: "Open the project register and the project data your role can read." },
  { tab: "invoices", label: "Invoices", description: "Inspect supplier invoices when invoice read access is available." },
  { tab: "review", label: "Review queue", description: "Inspect invoices awaiting verification; mutation controls remain permission-gated." },
  { tab: "expenses", label: "Expenses", description: "Open direct expense records available to your role." },
  { tab: "payroll", label: "Payroll", description: "Open detailed payroll only when payroll-detail access is granted." },
  { tab: "cash", label: "Cash & Banking", description: "Open permitted cash and reconciliation information." },
  { tab: "inbox", label: "Gmail", description: "Open imported Gmail records with management controls hidden when unavailable." },
  { tab: "reports", label: "Reports", description: "Open only reports supported by your current source permissions." },
];

export const DashboardRoute: React.FC<DashboardRouteProps> = ({
  data,
  projects,
  selectedProjectId,
  onProjectChange,
  onActivityPeriodChange,
  onCustomRangeChange,
  onCurrencyChange,
  onNavigate,
  onOpenProject,
  onOpenInvoice,
}) => {
  const permissions = useAppPermissions();
  const completeness = useProjectCostCompleteness();
  const workspaceDataPending = useWorkspaceDataPending();
  const hiddenSources = projectCostMissingSourceLabels(completeness);
  const transientRefreshGap = !completeness.complete
    && workspaceDataPending
    && completeness.reason === "load-error";

  if (!completeness.complete && !transientRefreshGap) {
    const shortcuts = RESTRICTED_DASHBOARD_SHORTCUTS.filter(({ tab }) => canAccessAppTab(tab, permissions));
    return (
      <div className="space-y-5" data-dashboard-completeness="incomplete">
        <div role="status" aria-label="Partial dashboard cost visibility" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <strong>Combined company cost position withheld.</strong> Required project-cost sources are unavailable or incomplete: {hiddenSources.join(", ")}. Engoryx will not present project cost, utilization, trend, remaining-budget, or company-cost totals as complete until those sources are available.
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-4 w-4" /></div>
            <div>
              <h2 className="text-sm font-black text-slate-950">Permission-scoped workspace</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Use the destinations below for source records your role is allowed to inspect. Cross-domain totals return only when all required cost sources are available.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shortcuts.map(({ tab, label, description }) => (
              <button key={tab} type="button" onClick={() => onNavigate(tab)} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40">
                <span><strong className="block text-xs text-slate-900">{label}</strong><span className="mt-1 block text-[10px] leading-4 text-slate-500">{description}</span></span>
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
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
    />
  );
};

export default DashboardRoute;
