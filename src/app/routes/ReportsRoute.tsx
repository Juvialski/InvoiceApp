import React from "react";
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
  onExport,
}) => {
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
      }));

  return (
    <div className="space-y-6">
      <Reports invoices={invoices} />
      <PayrollOperatingCosts runs={runs} entries={entries} allocations={payrollAllocations} />
      <ProjectReports
        projects={projects}
        invoices={invoices}
        invoiceAllocations={invoiceAllocations}
        expenses={expenses}
        workers={workers}
        assignments={assignments}
        periods={periods}
        runs={runs}
        entries={entries}
        payrollAllocations={payrollAllocations}
        onExport={handleExport}
      />
    </div>
  );
};

export default ReportsRoute;
