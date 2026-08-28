import React, { useEffect, useMemo, useState } from "react";
import { Bot, FileStack, Presentation, RotateCcw, ShieldCheck } from "lucide-react";
import { AppShell } from "../app/AppShell.tsx";
import { AppRouter } from "../app/routes/AppRouter.tsx";
import { DEFAULT_REGIONAL_SETTINGS } from "../config/regional.ts";
import type { DashboardActivityPeriod } from "../components/engineering/EngineeringCostOperationsDashboard.tsx";
import type { AppTab } from "../utils/routes.ts";
import type { AppLocation, ProjectWorkspaceView } from "../utils/appRouting.ts";
import type { FinancialAccount, FinancialBalanceSnapshot, FinancialTransaction } from "../lib/cashBanking.ts";
import type { AttendanceRecord, Expense, InvoiceData, InvoiceProjectAllocation, LeaveRequest, OvertimeRequest, PayrollEntry, PayrollPeriod, PayrollRun, Project, ProjectWorkerAssignment, WorkEntry, Worker } from "../types.ts";
import type { PayrollSchedule } from "../lib/payrollSchedule.ts";
import { DemoAssistant } from "./DemoAssistant.tsx";
import { DemoEngineeringDocuments } from "./DemoEngineeringDocuments.tsx";
import { DemoTour } from "./DemoTour.tsx";
import { useDemoWorkspace } from "./DemoWorkspaceProvider.tsx";
import { buildDemoDashboard, buildDemoProjectDashboard, buildDemoProjectSummaries } from "./demoSelectors.ts";
import { DEMO_COMPANY_ID } from "./demoTypes.ts";
import { demoAssistantPath, demoDocumentsPath, demoPathForInvoice, demoPathForProject, demoPathForTab, type DemoLocation } from "./demoRouting.ts";

const VISIBLE_ROUTES = ["dashboard", "cash", "projects", "extract", "invoices", "review", "payroll", "expenses", "vendors", "reports", "inbox", "settings"] as const;

function activeTabFor(location: DemoLocation): AppTab {
  if (location.kind === "documents") return "projects";
  if (location.kind === "assistant" || location.kind === "landing") return "dashboard";
  return location.appLocation.tab;
}

function safeAppLocation(location: DemoLocation): AppLocation | null {
  if (location.kind !== "app") return null;
  const allowed = new Set<AppTab>(["dashboard", "cash", "projects", "extractor", "inbox", "review", "invoices", "payroll", "expenses", "vendors", "reports", "settings"]);
  return allowed.has(location.appLocation.tab) ? location.appLocation : null;
}

export function DemoWorkspace({ location, onNavigate }: { location: DemoLocation; onNavigate: (path: string) => void }) {
  const { data, dispatch, reset, tourOpen, setTourOpen } = useDemoWorkspace();
  const [activityPeriod, setActivityPeriod] = useState<DashboardActivityPeriod>("QUARTER");
  const [dashboardProjectId, setDashboardProjectId] = useState<string | undefined>();
  const [dashboardCurrency, setDashboardCurrency] = useState("PHP");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const appLocation = safeAppLocation(location);
  const activeTab = activeTabFor(location);
  const selectedProject = appLocation?.kind === "project" ? data.projects.find((project) => project.id === appLocation.projectId) || null : null;
  const selectedInvoice = appLocation && (appLocation.kind === "invoice" || appLocation.kind === "review-invoice") ? data.invoices.find((invoice) => invoice.id === appLocation.invoiceId) || null : null;
  const summaries = useMemo(() => buildDemoProjectSummaries(data), [data]);
  const dashboardData = useMemo(() => buildDemoDashboard(data, { activityPeriod, selectedProjectId: dashboardProjectId, selectedCurrency: dashboardCurrency, customStart, customEnd }), [activityPeriod, customEnd, customStart, dashboardCurrency, dashboardProjectId, data]);
  const projectDashboard = useMemo(() => selectedProject ? buildDemoProjectDashboard(data, selectedProject.id) : undefined, [data, selectedProject]);
  const reviewQueue = useMemo(() => data.invoices.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW"), [data.invoices]);

  useEffect(() => {
    document.title = location.kind === "assistant" ? "AI Assistant | Engoryx Demo" : location.kind === "documents" ? "Engineering Documents | Engoryx Demo" : "Client Demo | Engoryx";
  }, [location.kind]);

  const navigateTab = (tab: AppTab) => onNavigate(demoPathForTab(tab));
  const openProject = (project: Project) => onNavigate(demoPathForProject(project.id));
  const openProjectView = (view: ProjectWorkspaceView) => selectedProject && onNavigate(demoPathForProject(selectedProject.id, view));
  const openInvoice = (invoice: InvoiceData) => onNavigate(demoPathForInvoice(invoice.id, demoPathForTab(activeTab)));

  const saveInvoiceAllocations = async (invoice: InvoiceData, allocations: InvoiceProjectAllocation[]) => {
    dispatch({ type: "SAVE_INVOICE_ALLOCATIONS", invoiceId: invoice.id, value: allocations });
  };

  const verifySelected = async () => {
    if (!selectedInvoice) return false;
    dispatch({ type: "SAVE_INVOICE", value: { ...selectedInvoice, reviewStatus: "VERIFIED", status: selectedInvoice.status === "PENDING" || selectedInvoice.status === "DRAFT" ? "APPROVED" : selectedInvoice.status, verifiedAt: `${data.anchorDate}T13:30:00+08:00` } });
    return true;
  };

  const extractDemoInvoice = async () => {
    const sample = data.invoices.find((invoice) => invoice.reviewStatus === "NEEDS_REVIEW") || data.invoices[0];
    if (!sample) throw new Error("No demo invoice fixture is available.");
    return sample;
  };

  const resetDemo = () => {
    if (!window.confirm("Reset the Demo Workspace to Meridian's original sample data? This affects demo state only.")) return;
    reset();
    onNavigate(demoPathForTab("dashboard"));
  };

  const content = location.kind === "assistant"
    ? <DemoAssistant onNavigate={onNavigate} />
    : location.kind === "documents"
      ? <DemoEngineeringDocuments />
      : appLocation
        ? (
          <AppRouter
            route={appLocation}
            activeTab={activeTab}
            dashboardData={dashboardData}
            dashboardProjectId={dashboardProjectId}
            onDashboardProjectChange={setDashboardProjectId}
            onDashboardActivityPeriodChange={setActivityPeriod}
            onDashboardCustomRangeChange={(start, end) => { setCustomStart(start); setCustomEnd(end); }}
            onDashboardCurrencyChange={setDashboardCurrency}
            onNavigateTab={navigateTab}
            projects={data.projects}
            selectedProject={selectedProject}
            projectSummaries={summaries}
            projectDashboard={projectDashboard}
            companyId={DEMO_COMPANY_ID}
            engineeringDocumentsCanRead={true}
            engineeringDocumentsCanCreate={false}
            engineeringDocumentsCanAnnotate={false}
            engineeringDocumentsCanManage={false}
            engineeringDocumentsGuestMode={true}
            projectDocumentsContent={selectedProject ? <DemoEngineeringDocuments projectId={selectedProject.id} /> : undefined}
            dailySiteLogsData={data.siteLogs}
            onDailySiteLogsDataChange={(value) => dispatch({ type: "SAVE_DAILY_SITE_LOGS", value })}
            pathForSiteLog={(siteLogId) => selectedProject ? demoPathForProject(selectedProject.id, "site-logs", siteLogId ? { siteLogId } : undefined) : demoPathForTab("projects")}
            onOpenProject={openProject}
            onSaveProject={(project) => dispatch({ type: "SAVE_PROJECT", value: project })}
            onArchiveProject={(project) => dispatch({ type: "ARCHIVE_PROJECT", value: project })}
            onProjectTabChange={openProjectView}
            onProjectBack={() => onNavigate(demoPathForTab("projects"))}
            onProjectUploadInvoice={() => onNavigate(demoPathForTab("invoices"))}
            onProjectAddExpense={() => onNavigate(demoPathForTab("expenses"))}
            onProjectOpenPayroll={() => onNavigate(demoPathForTab("payroll"))}
            invoices={data.invoices}
            selectedInvoice={selectedInvoice}
            invoiceProjectAllocations={data.invoiceAllocations}
            onSaveInvoiceProjectAllocations={saveInvoiceAllocations}
            reviewQueue={reviewQueue}
            reviewIndex={selectedInvoice ? reviewQueue.findIndex((invoice) => invoice.id === selectedInvoice.id) : -1}
            saveState="saved"
            workspaceOriginLabel="Demo Workspace"
            onUpdateInvoice={(invoice) => dispatch({ type: "SAVE_INVOICE", value: invoice })}
            onInvoiceBack={() => onNavigate(demoPathForTab("invoices"))}
            onReviewSave={async () => true}
            onVerifyAndNext={verifySelected}
            onReopenInvoice={async (invoice) => dispatch({ type: "SAVE_INVOICE", value: { ...invoice, reviewStatus: "NEEDS_REVIEW", verifiedAt: undefined } })}
            onReturnToDashboard={() => onNavigate(demoPathForTab("dashboard"))}
            onViewVerified={() => onNavigate(demoPathForTab("invoices"))}
            onSelectInvoice={openInvoice}
            onOpenInvoiceForReview={openInvoice}
            onStartReview={(queue) => { const first = queue?.[0] || reviewQueue[0]; if (first) openInvoice(first); }}
            onDeleteInvoice={(id) => dispatch({ type: "DELETE_INVOICE", id })}
            onAddNewInvoice={() => onNavigate(demoPathForTab("extractor"))}
            onExtractInvoice={extractDemoInvoice}
            onLoadInvoicePreset={(invoice) => { dispatch({ type: "SAVE_INVOICE", value: invoice }); openInvoice(invoice); }}
            onBatchExtractComplete={(successful) => { const first = successful[0]; if (first) openInvoice(first); }}
            cashData={data.cash}
            canManageCashAccounts={true}
            canManageCashTransactions={true}
            canCashImport={false}
            canCashReconcile={true}
            onSaveFinancialAccount={(account: FinancialAccount) => dispatch({ type: "SAVE_FINANCIAL_ACCOUNT", value: account })}
            onDeactivateFinancialAccount={(account) => dispatch({ type: "SAVE_FINANCIAL_ACCOUNT", value: { ...account, active: false, updatedAt: `${data.anchorDate}T14:00:00+08:00` } })}
            onSaveFinancialSnapshot={(snapshot: FinancialBalanceSnapshot) => dispatch({ type: "SAVE_FINANCIAL_SNAPSHOT", value: snapshot })}
            onSaveFinancialTransaction={(transaction: FinancialTransaction) => dispatch({ type: "SAVE_FINANCIAL_TRANSACTION", value: transaction })}
            onIgnoreFinancialTransaction={(transaction) => dispatch({ type: "SAVE_FINANCIAL_TRANSACTION", value: { ...transaction, reconciliationStatus: "IGNORED" } })}
            onOpenCashDashboard={() => onNavigate(demoPathForTab("dashboard"))}
            payrollData={data.payroll}
            payrollPeriodPreparationState="READY"
            canManagePayrollSettings={true}
            canManagePayrollMaintenance={false}
            onSavePayrollWorker={(worker: Worker) => dispatch({ type: "SAVE_WORKER", value: worker })}
            onSavePayrollAssignment={(assignment: ProjectWorkerAssignment) => dispatch({ type: "SAVE_ASSIGNMENT", value: assignment })}
            onSavePayrollPeriod={(period: PayrollPeriod) => dispatch({ type: "SAVE_PERIOD", value: period })}
            onSavePayrollSchedule={(schedule: PayrollSchedule) => dispatch({ type: "SAVE_SCHEDULE", value: schedule })}
            onSavePayrollWorkEntry={(entry: WorkEntry) => dispatch({ type: "SAVE_WORK_ENTRY", value: entry })}
            onSavePayrollAttendance={(record: AttendanceRecord) => dispatch({ type: "SAVE_ATTENDANCE", value: record })}
            onSavePayrollAttendanceBatch={(records: AttendanceRecord[]) => dispatch({ type: "SAVE_ATTENDANCE_BATCH", value: records })}
            onSavePayrollLeave={(request: LeaveRequest) => dispatch({ type: "SAVE_LEAVE", value: request })}
            onSavePayrollOvertime={(request: OvertimeRequest) => dispatch({ type: "SAVE_OVERTIME", value: request })}
            onSavePayrollEntry={(entry: PayrollEntry) => dispatch({ type: "SAVE_PAYROLL_ENTRY", value: entry })}
            onUpdatePayrollRun={(run: PayrollRun) => dispatch({ type: "UPDATE_PAYROLL_RUN", value: run })}
            expenses={data.expenses}
            onSaveExpense={(expense: Expense) => dispatch({ type: "SAVE_EXPENSE", value: expense })}
            onArchiveExpense={(expense: Expense) => dispatch({ type: "ARCHIVE_EXPENSE", value: expense })}
            regionalSettings={DEFAULT_REGIONAL_SETTINGS}
            showDeploymentAccessManagement={false}
          />
        )
        : <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">This route is not part of the public demo. <button type="button" className="ml-1 font-black text-indigo-600" onClick={() => onNavigate(demoPathForTab("dashboard"))}>Return to Dashboard</button></div>;

  return (
    <AppShell
      activeTab={activeTab}
      setActiveTab={navigateTab}
      invoicesCount={data.invoices.length}
      reviewCount={reviewQueue.length}
      onBatchExportExcel={() => {}}
      workspaceSyncStatus="guest"
      accountEmail="client.demo@engoryx.local"
      visibleRouteIds={VISIBLE_ROUTES}
      permissions={["*"]}
      isSupabaseConfigured={true}
      footerText="Engoryx Demo Workspace • Meridian Engineering & Construction Corp. • Sample data only"
    >
      <div className="sticky top-2 z-40 mb-5 flex flex-col gap-3 rounded-lg border border-indigo-200 bg-white/95 px-3.5 py-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-indigo-600 px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white">Demo Workspace</span><span className="truncate text-xs font-black text-slate-900">{data.company.name}</span></div>
          <p className="mt-1 text-[10px] font-semibold text-slate-500">Sample data - no real records • PHP • Asia/Manila</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setTourOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-black text-slate-700 hover:bg-slate-50"><Presentation className="h-3.5 w-3.5" /> Tour</button>
          <button type="button" onClick={() => onNavigate(demoDocumentsPath())} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-black text-slate-700 hover:bg-slate-50"><FileStack className="h-3.5 w-3.5" /> Documents</button>
          <button type="button" onClick={() => onNavigate(demoAssistantPath())} className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-[10px] font-black text-indigo-700 hover:bg-indigo-100"><Bot className="h-3.5 w-3.5" /> AI Assistant</button>
          <button type="button" onClick={resetDemo} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-black text-slate-700 hover:bg-slate-50"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
        </div>
      </div>
      <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Isolated demo data source - production authentication, company queries, Storage, AI extraction, Gmail authorization, and writes are not mounted on this route.</div>
      {content}
      <DemoTour open={tourOpen} onOpenChange={setTourOpen} currentPath={window.location.pathname} onNavigate={onNavigate} />
    </AppShell>
  );
}
