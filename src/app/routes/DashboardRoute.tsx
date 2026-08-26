import React from "react";
import {
  EngineeringCostOperationsDashboard,
  type DashboardActivityPeriod,
  type DashboardViewData,
} from "../../components/engineering/EngineeringCostOperationsDashboard";
import type { InvoiceData, Project } from "../../types";
import type { AppTab } from "../../utils/routes";

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
  return (
    <div className="space-y-6">
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
