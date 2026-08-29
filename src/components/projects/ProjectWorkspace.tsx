import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, ClipboardCheck, ClipboardList, Compass, FileQuestion, FileText, HardHat, Receipt, Users } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import type {
  Expense,
  InvoiceData,
  InvoiceProjectAllocation,
  PayrollPeriod,
  PayrollProjectAllocation,
  Project,
  ProjectCostSummary,
  ProjectWorkerAssignment,
  Worker,
} from "../../types";
import { ProjectExpenses } from "../expenses/ProjectExpenses";
import { ProjectInvoices } from "./ProjectInvoices";
import { ProjectInvoicesReadOnly } from "./ProjectInvoicesReadOnly.tsx";
import { ProjectOverview } from "./ProjectOverview";
import { ProjectDocuments } from "../engineering/ProjectDocuments";
import { ProjectRfis } from "../engineering/ProjectRfis";
import { ProjectSubmittals } from "../engineering/ProjectSubmittals";
import { ProjectSiteLogs } from "../engineering/ProjectSiteLogs";
import { useEngineeringCoordinationAccess } from "../../features/engineering/useEngineeringCoordinationAccess";
import type { EngineeringDailySiteLogsWorkspaceData } from "../../lib/dailySiteLogs.ts";
import type { ProjectDashboardViewData } from "../../utils/projectDashboardViewModel";
import { hasAnyPermission, hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { useAppPermissions, useProjectCostCompleteness } from "../../app/AppPermissionContext.tsx";
import { projectCostMissingSourceLabels } from "../../utils/dataCompleteness.ts";
import { PageHeader, StatusBadge, type StatusTone } from "../ui/OperationsUI";

export type WorkspaceTab = "overview" | "documents" | "rfis" | "submittals" | "site-logs" | "invoices" | "payroll" | "expenses" | "people" | "reports";

interface ProjectWorkspaceProps {
  project: Project;
  summary: ProjectCostSummary;
  dashboard?: ProjectDashboardViewData;
  invoices: InvoiceData[];
  invoiceAllocations: InvoiceProjectAllocation[];
  expenses: Expense[];
  workers?: Worker[];
  assignments?: ProjectWorkerAssignment[];
  payrollAllocations?: PayrollProjectAllocation[];
  payrollPeriods?: PayrollPeriod[];
  initialTab?: WorkspaceTab;
  initialDocumentId?: string;
  initialRevisionId?: string;
  initialRfiId?: string;
  initialSubmittalId?: string;
  initialSubmittalRoundId?: string;
  initialSiteLogId?: string;
  pathForSiteLog?: (siteLogId?: string) => string;
  companyId?: string;
  engineeringDocumentsCanRead?: boolean;
  engineeringDocumentsCanCreate?: boolean;
  engineeringDocumentsCanAnnotate?: boolean;
  engineeringDocumentsCanManage?: boolean;
  engineeringRfisCanRead?: boolean;
  engineeringRfisCanCreate?: boolean;
  engineeringRfisCanRespond?: boolean;
  engineeringRfisCanManage?: boolean;
  engineeringSubmittalsCanRead?: boolean;
  engineeringSubmittalsCanCreate?: boolean;
  engineeringSubmittalsCanReview?: boolean;
  engineeringSubmittalsCanManage?: boolean;
  engineeringDocumentsGuestMode?: boolean;
  projectDocumentsContent?: React.ReactNode;
  dailySiteLogsData?: EngineeringDailySiteLogsWorkspaceData;
  onDailySiteLogsDataChange?: (data: EngineeringDailySiteLogsWorkspaceData) => void;
  onTabChange?: (tab: WorkspaceTab) => void;
  onBack: () => void;
  onOpenInvoice: (invoice: InvoiceData) => void;
  onUploadInvoice: () => void;
  onEditProject: () => void;
  onArchiveProject: () => void;
  onReactivateProject?: () => void;
  onAddExpense?: () => void;
  onOpenExpenseCorrection?: (expense: Expense) => void;
  onOpenPayroll?: () => void;
  onSaveInvoiceAllocations: (invoice: InvoiceData, allocations: InvoiceProjectAllocation[]) => Promise<void>;
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${currency} ${(value || 0).toFixed(2)}`;
  }
}

function projectStatusTone(status: string): StatusTone {
  return status === "ACTIVE" || status === "IN_PROGRESS"
    ? "success"
    : status === "ARCHIVED" || status === "CANCELLED"
      ? "neutral"
      : status === "ON_HOLD"
        ? "warning"
        : "info";
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  project,
  summary,
  dashboard,
  invoices,
  invoiceAllocations,
  expenses,
  workers = [],
  assignments = [],
  payrollAllocations = [],
  payrollPeriods = [],
  initialTab = "overview",
  initialDocumentId,
  initialRevisionId,
  initialRfiId,
  initialSubmittalId,
  initialSubmittalRoundId,
  initialSiteLogId,
  pathForSiteLog,
  companyId,
  engineeringDocumentsCanRead = true,
  engineeringDocumentsCanCreate = true,
  engineeringDocumentsCanAnnotate = true,
  engineeringDocumentsCanManage = true,
  engineeringRfisCanRead,
  engineeringRfisCanCreate,
  engineeringRfisCanRespond,
  engineeringRfisCanManage,
  engineeringSubmittalsCanRead,
  engineeringSubmittalsCanCreate,
  engineeringSubmittalsCanReview,
  engineeringSubmittalsCanManage,
  engineeringDocumentsGuestMode = false,
  projectDocumentsContent,
  dailySiteLogsData,
  onDailySiteLogsDataChange,
  onTabChange,
  onBack,
  onOpenInvoice,
  onUploadInvoice,
  onEditProject,
  onArchiveProject,
  onReactivateProject,
  onAddExpense,
  onOpenPayroll,
  onOpenExpenseCorrection,
  onSaveInvoiceAllocations,
}) => {
  const permissions = useAppPermissions();
  const canManageProject = hasPermission(permissions, PERMISSION_KEYS.projectsWrite);
  const canReadInvoices = hasPermission(permissions, PERMISSION_KEYS.invoicesRead);
  const canExtractInvoices = hasPermission(permissions, PERMISSION_KEYS.invoicesExtract);
  const canReadPayroll = hasPermission(permissions, PERMISSION_KEYS.payrollRead);
  const canReadExpenses = hasPermission(permissions, PERMISSION_KEYS.expensesRead);
  const canManageExpenses = hasPermission(permissions, PERMISSION_KEYS.expensesWrite);
  const canReadWorkers = hasPermission(permissions, PERMISSION_KEYS.workersRead);
  const canReadReports = hasAnyPermission(permissions, [PERMISSION_KEYS.reportsRead, PERMISSION_KEYS.reportsPayrollRead]);
  const completeness = useProjectCostCompleteness();
  const costDataComplete = completeness.complete;
  const hiddenCostSources = projectCostMissingSourceLabels(completeness);

  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const coordinationAccess = useEngineeringCoordinationAccess(companyId, engineeringDocumentsGuestMode);
  const phase1bAccess = {
    rfisRead: engineeringRfisCanRead ?? coordinationAccess.rfisRead,
    rfisCreate: engineeringRfisCanCreate ?? coordinationAccess.rfisCreate,
    rfisRespond: engineeringRfisCanRespond ?? coordinationAccess.rfisRespond,
    rfisManage: engineeringRfisCanManage ?? coordinationAccess.rfisManage,
    submittalsRead: engineeringSubmittalsCanRead ?? coordinationAccess.submittalsRead,
    submittalsCreate: engineeringSubmittalsCanCreate ?? coordinationAccess.submittalsCreate,
    submittalsReview: engineeringSubmittalsCanReview ?? coordinationAccess.submittalsReview,
    submittalsManage: engineeringSubmittalsCanManage ?? coordinationAccess.submittalsManage,
  };

  const tabs: Array<[WorkspaceTab, string, React.ElementType]> = [
    ["overview", "Overview", BarChart3],
    ["documents", "Documents", Compass],
    ["rfis", "RFIs", FileQuestion],
    ["submittals", "Submittals", ClipboardCheck],
    ["site-logs", "Site Logs", ClipboardList],
    ...(canReadInvoices ? [["invoices", "Invoices", FileText] as [WorkspaceTab, string, React.ElementType]] : []),
    ...(canReadPayroll ? [["payroll", "Payroll", HardHat] as [WorkspaceTab, string, React.ElementType]] : []),
    ...(canReadExpenses ? [["expenses", "Expenses", Receipt] as [WorkspaceTab, string, React.ElementType]] : []),
    ...(canReadWorkers ? [["people", "People", Users] as [WorkspaceTab, string, React.ElementType]] : []),
    ...(canReadReports ? [["reports", "Reports", BarChart3] as [WorkspaceTab, string, React.ElementType]] : []),
  ];
  const visibleTabIds = useMemo(() => new Set(tabs.map(([id]) => id)), [canReadExpenses, canReadInvoices, canReadPayroll, canReadReports, canReadWorkers]);

  useEffect(() => {
    if (visibleTabIds.has(initialTab)) setTab(initialTab);
    else {
      setTab("overview");
      onTabChange?.("overview");
    }
  }, [initialTab, onTabChange, project.id, visibleTabIds]);

  const selectTab = (next: WorkspaceTab) => {
    if (!visibleTabIds.has(next)) return;
    setTab(next);
    onTabChange?.(next);
  };

  const projectExpenses = useMemo(() => expenses.filter((expense) => expense.projectId === project.id), [expenses, project.id]);
  const projectAssignments = assignments.filter((assignment) => assignment.projectId === project.id && assignment.active);
  const projectPayroll = payrollAllocations.filter((allocation) => allocation.projectId === project.id);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={project.projectCode || "Project reference missing"}
        title={project.projectName || "Unnamed project"}
        description="Project workspace sections keep engineering drawings, RFIs, technical submittals, daily field records, supplier, labor, and expense records in one operational context."
        actions={(
          <>
            <Button variant="secondary" label="← Projects" onClick={onBack} />
            <StatusBadge tone={projectStatusTone(project.status)}>{project.status.replaceAll("_", " ")}</StatusBadge>
            {canManageProject && <Button variant="secondary" label="Edit" onClick={onEditProject} />}
            {canManageProject && project.status !== "ARCHIVED" && <Button variant="destructive" label="Archive" onClick={onArchiveProject} />}
            {canManageProject && project.status === "ARCHIVED" && onReactivateProject && <Button variant="secondary" label="Reactivate" onClick={onReactivateProject} />}
          </>
        )}
      />

      {!costDataComplete && (
        <div role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div><strong>Partial cost visibility.</strong> Financial totals on this project are based only on available authoritative sources and exclude {hiddenCostSources.join(", ")}. They must not be treated as the complete company cost position.</div>
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1" aria-label="Project workspace sections">
        {tabs.map(([id, tabLabel, Icon]) => (
          <button key={id} type="button" onClick={() => selectTab(id)} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${tab === id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
            <Icon className="h-3.5 w-3.5" />{tabLabel}
          </button>
        ))}
      </nav>

      {tab === "overview" && <ProjectOverview project={project} summary={summary} dashboard={dashboard} hideHeader onOpenTab={(next) => selectTab(next as WorkspaceTab)} />}

      {tab === "documents" && (projectDocumentsContent ?? <ProjectDocuments project={project} companyId={companyId} initialDocumentId={initialDocumentId} initialRevisionId={initialRevisionId} canRead={engineeringDocumentsCanRead} canCreate={engineeringDocumentsCanCreate} canAnnotate={engineeringDocumentsCanAnnotate} canManage={engineeringDocumentsCanManage} guestMode={engineeringDocumentsGuestMode} />)}

      {tab === "rfis" && (coordinationAccess.loading && engineeringRfisCanRead === undefined ? <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">Checking RFI access…</div> : <ProjectRfis project={project} companyId={companyId} initialRfiId={initialRfiId} canRead={phase1bAccess.rfisRead} canCreate={phase1bAccess.rfisCreate} canRespond={phase1bAccess.rfisRespond} canManage={phase1bAccess.rfisManage} canReadDocuments={engineeringDocumentsCanRead} guestMode={engineeringDocumentsGuestMode} />)}

      {tab === "submittals" && (coordinationAccess.loading && engineeringSubmittalsCanRead === undefined ? <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">Checking submittal access…</div> : <ProjectSubmittals project={project} companyId={companyId} initialSubmittalId={initialSubmittalId} initialRoundId={initialSubmittalRoundId} canRead={phase1bAccess.submittalsRead} canCreate={phase1bAccess.submittalsCreate} canReview={phase1bAccess.submittalsReview} canManage={phase1bAccess.submittalsManage} canReadDocuments={engineeringDocumentsCanRead} guestMode={engineeringDocumentsGuestMode} />)}

      {tab === "site-logs" && (coordinationAccess.loading && !engineeringDocumentsGuestMode && dailySiteLogsData === undefined ? <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">Checking Site Log access…</div> : <ProjectSiteLogs project={project} companyId={companyId} initialSiteLogId={initialSiteLogId} pathForSiteLog={pathForSiteLog} canRead={engineeringDocumentsGuestMode || coordinationAccess.siteLogsRead} canCreate={engineeringDocumentsGuestMode || coordinationAccess.siteLogsCreate} canUpdate={engineeringDocumentsGuestMode || coordinationAccess.siteLogsUpdate} canSubmit={engineeringDocumentsGuestMode || coordinationAccess.siteLogsSubmit} canManage={engineeringDocumentsGuestMode || coordinationAccess.siteLogsManage} guestMode={engineeringDocumentsGuestMode} controlledData={dailySiteLogsData} onControlledDataChange={onDailySiteLogsDataChange} />)}

      {tab === "invoices" && canReadInvoices && (canManageProject
        ? <ProjectInvoices project={project} invoices={invoices} allocations={invoiceAllocations} onOpenInvoice={onOpenInvoice} onUploadInvoice={canExtractInvoices ? onUploadInvoice : undefined} onSaveAllocations={onSaveInvoiceAllocations} />
        : <ProjectInvoicesReadOnly project={project} invoices={invoices} allocations={invoiceAllocations} onOpenInvoice={onOpenInvoice} />)}

      {tab === "expenses" && canReadExpenses && <ProjectExpenses projectId={project.id} currency={project.currency} expenses={projectExpenses} onAdd={canManageExpenses ? onAddExpense : undefined} onOpenCorrection={canManageExpenses ? onOpenExpenseCorrection : undefined} />}

      {tab === "payroll" && canReadPayroll && <Card className="overflow-hidden p-0 shadow-sm" elevation="low"><div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h3 className="text-sm font-black">Project payroll</h3><p className="mt-1 text-xs text-slate-500">Approved and paid payroll allocations feed labor cost.</p></div>{onOpenPayroll && <Button variant="primary" label="Open payroll" onClick={onOpenPayroll} />}</div>{projectPayroll.length ? <div className="divide-y divide-slate-100">{projectPayroll.map((allocation) => <div key={allocation.id} className="flex items-center justify-between gap-3 px-5 py-4"><div><p className="text-xs font-bold">Payroll allocation</p><p className="mt-1 text-[10px] text-slate-500">{payrollPeriods[0] ? `${payrollPeriods[0].periodStart} – ${payrollPeriods[0].periodEnd}` : "Current period"} • {allocation.source.replaceAll("_", " ")}</p></div><p className="text-xs font-black tabular-nums">{money(allocation.allocationAmount, project.currency)}</p></div>)}</div> : <div className="p-10 text-center"><HardHat className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No payroll recorded for this project.</p><p className="mt-1 text-xs text-slate-500">Approve a payroll run with a project allocation to populate this view.</p></div>}</Card>}

      {tab === "people" && canReadWorkers && <Card className="overflow-hidden p-0 shadow-sm" elevation="low"><div className="border-b border-slate-100 p-5"><h3 className="text-sm font-black">Project people</h3><p className="mt-1 text-xs text-slate-500">Workers can move between projects over time.</p></div>{projectAssignments.length ? <div className="divide-y divide-slate-100">{projectAssignments.map((assignment) => { const worker = workers.find((item) => item.id === assignment.workerId); return <div key={assignment.id} className="flex items-center justify-between gap-3 px-5 py-4"><div><p className="text-xs font-black">{worker?.displayName || "Worker"}</p><p className="mt-1 text-[10px] text-slate-500">{assignment.roleOnProject || worker?.jobTitle || "Role not set"} • since {assignment.startDate}</p></div><span className="text-[10px] font-bold text-emerald-700">{assignment.active ? "Active" : "Inactive"}</span></div>; })}</div> : <div className="p-10 text-center"><Users className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No workers assigned to this project.</p><p className="mt-1 text-xs text-slate-500">Use Payroll to add a project assignment.</p></div>}</Card>}

      {tab === "reports" && canReadReports && <section className="grid gap-4 md:grid-cols-2"><Card className="p-5 shadow-sm" elevation="low"><h3 className="text-sm font-black">{costDataComplete ? "Project cost summary" : "Visible project cost summary"}</h3>{!costDataComplete && <p className="mt-1 text-[10px] leading-4 text-amber-700">This report excludes unavailable, incomplete, or non-combinable cost sources.</p>}<div className="mt-4 space-y-3">{[["Invoice cost", summary.invoiceCost], ["Payroll cost", summary.payrollCost], ["Other expenses", summary.otherExpenseCost], [costDataComplete ? "Actual cost" : "Visible actual cost", summary.totalActualCost], [costDataComplete ? "Remaining budget" : "Visible-data budget balance", summary.remainingBudget]].map(([itemLabel, value]) => <div key={String(itemLabel)} className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-slate-600">{itemLabel}</span><span className="font-black tabular-nums">{money(Number(value), project.currency)}</span></div>)}</div></Card><Card className="p-5 shadow-sm" elevation="low"><h3 className="text-sm font-black">Operational notes</h3><p className="mt-4 whitespace-pre-wrap text-xs text-slate-600">{project.notes || project.description || "No project notes yet."}</p></Card></section>}
    </div>
  );
};
