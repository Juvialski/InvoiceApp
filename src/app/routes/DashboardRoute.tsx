import React from "react";
import { AlertTriangle } from "lucide-react";
import {
  EngineeringCostOperationsDashboard,
  type DashboardActivityPeriod,
  type DashboardViewData,
} from "../../components/engineering/EngineeringCostOperationsDashboard";
import type { InvoiceData, Project } from "../../types";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import type { AppTab } from "../../utils/routes";
import { useAppPermissions } from "../AppPermissionContext.tsx";

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
  const hiddenSources = [
    !hasPermission(permissions, PERMISSION_KEYS.invoicesRead) ? "supplier invoices" : null,
    !hasPermission(permissions, PERMISSION_KEYS.payrollRead) ? "payroll detail" : null,
    !hasPermission(permissions, PERMISSION_KEYS.expensesRead) ? "direct expenses" : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="space-y-6">
      {hiddenSources.length > 0 && (
        <div role="status" aria-label="Partial dashboard cost visibility" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div><strong>Partial cost visibility.</strong> Project cost, utilization, trend, and available-budget figures below are based only on sources your role can read and exclude {hiddenSources.join(", ")}. Do not treat those figures as the complete company cost position.</div>
        </div>
      )}
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
    </div>
  );
};

export default DashboardRoute;
