import React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Reports } from "../../components/Reports";
import { PayrollOperatingCosts } from "../../components/engineering/PayrollOperatingCosts";
import { ProjectReports } from "../../components/engineering/ProjectReports";
import type {
  Expense,
  InvoiceData,
  InvoiceProjectAllocation,
  PayrollEntry,
  PayrollPeriod,
  PayrollProjectAllocation,
  PayrollRun,
  Project,
  ProjectWorkerAssignment,
  Worker,
} from "../../types";
import { exportEngineeringProjectWorkbookToExcel } from "../../utils/excelExport";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { projectCostMissingSourceLabels } from "../../utils/dataCompleteness.ts";
import { useAppPermissions, useProjectCostCompleteness, useWorkspaceDataPending } from "../AppPermissionContext.tsx";
import type { ProjectLaborCostAggregate, ProjectLaborSource } from "../../utils/projectLaborCostAggregate.ts";

export interface ReportsRouteProps {
  projects: Project[];
  invoices: InvoiceData[];
  invoiceAllocations: InvoiceProjectAllocation[];
  expenses: Expense[];
  workers: Worker[];
  assignments: ProjectWorkerAssignment[];
  periods: PayrollPeriod[];
  runs: PayrollRun[];
  entries: PayrollEntry[];
  payrollAllocations: PayrollProjectAllocation[];
  projectLaborAggregates?: readonly ProjectLaborCostAggregate[];
  laborSource?: ProjectLaborSource;
  onExport?: () => void;
}

export const ReportsRoute: React.FC<ReportsRouteProps> = ({
  projects,
  invoices,
  invoiceAllocations,
  expenses,
  workers,
  assignments,
  periods,
  runs,
  entries,
  payrollAllocations,
  projectLaborAggregates = [],
  laborSource,
  onExport,
}) => {
  const permissions = useAppPermissions();
  const canReadFinancialReports = hasPermission(permissions, PERMISSION_KEYS.reportsRead);
  const canReadPayrollReports = hasPermission(permissions, PERMISSION_KEYS.reportsPayrollRead);
  const canReadInvoices = hasPermission(permissions, PERMISSION_KEYS.invoicesRead);
  const canReadPayrollDetail = hasPermission(permissions, PERMISSION_KEYS.payrollRead);
  const canReadWorkers = hasPermission(permissions, PERMISSION_KEYS.workersRead);
  const projectCostCompleteness = useProjectCostCompleteness();
  const workspaceDataPending = useWorkspaceDataPending();
  const missingProjectCostSources = projectCostMissingSourceLabels(projectCostCompleteness);

  const handleExport =
    onExport ||
    (() =>
      exportEngineeringProjectWorkbookToExcel({
        projects,
        invoices,
        invoiceAllocations,
        expenses,
        workers,
        assignments,
        periods,
        runs,
        entries,
        payrollAllocations,
        projectLaborAggregates,
        laborSource,
        payrollDetailVisible: canReadPayrollDetail,
      }));

  return (
    <div className="space-y-6" data-project-cost-completeness={projectCostCompleteness.status}>
      {canReadFinancialReports && canReadInvoices && <Reports invoices={invoices} />}

      {canReadPayrollReports && canReadPayrollDetail && (
        <PayrollOperatingCosts runs={runs} entries={entries} allocations={payrollAllocations} />
      )}

      {canReadFinancialReports && projectCostCompleteness.complete ? (
        <ProjectReports
          projects={projects}
          invoices={invoices}
          invoiceAllocations={invoiceAllocations}
          expenses={expenses}
          workers={canReadWorkers ? workers : []}
          assignments={canReadWorkers ? assignments : []}
          periods={periods}
          runs={runs}
          entries={entries}
          payrollAllocations={payrollAllocations}
          projectLaborAggregates={projectLaborAggregates}
          laborSource={laborSource}
          payrollDetailVisible={canReadPayrollDetail}
          onExport={handleExport}
        />
      ) : canReadFinancialReports && workspaceDataPending ? (
        <section role="status" aria-live="polite" className="flex min-h-24 items-center justify-center rounded-xl border border-slate-200 bg-white p-4 text-xs font-semibold text-slate-600">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
          Refreshing project-cost report data…
        </section>
      ) : canReadFinancialReports ? (
        <section role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div><strong>Combined project-cost report and export unavailable for this role.</strong> Producing them would omit {missingProjectCostSources.join(", ")}. Source-specific report sections above remain available only when your role has the corresponding source access.</div>
        </section>
      ) : null}

      {!canReadFinancialReports && canReadPayrollReports && !canReadPayrollDetail && !workspaceDataPending && (
        <section role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div><strong>Payroll report detail is restricted.</strong> Your route permission allows payroll reporting, but this screen requires payroll-detail source access to produce employee and allocation figures safely.</div>
        </section>
      )}
    </div>
  );
};

export default ReportsRoute;
