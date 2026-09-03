import React, { useEffect, useMemo, useState } from "react";
import { Bot, FileStack, Presentation, RotateCcw, ShieldCheck } from "lucide-react";
import { AppShell } from "../app/AppShell.tsx";
import { AppRouter } from "../app/routes/AppRouter.tsx";
import { DEFAULT_REGIONAL_SETTINGS } from "../config/regional.ts";
import type { DashboardActivityPeriod } from "../components/engineering/EngineeringCostOperationsDashboard.tsx";
import type { AppTab } from "../utils/routes.ts";
import type { AppLocation, ProjectWorkspaceView } from "../utils/appRouting.ts";
import type { FinancialAccount, FinancialBalanceSnapshot, FinancialTransaction } from "../lib/cashBanking.ts";
import type { AttendanceRecord, Expense, InvoiceData, InvoiceProjectAllocation, LeaveRequest, OvertimeRequest, PayrollEntry, PayrollPeriod, PayrollRun, Project, ProjectWorkerAssignment, Subcontract, SubcontractLine, SubcontractStatus, WorkEntry, Worker } from "../types.ts";
import type { PayrollSchedule } from "../lib/payrollSchedule.ts";
import type { PayrollLifecycleRequest } from "../lib/payrollLifecycle.ts";
import { buildProjectLifecyclePreview, type ProjectLifecycleAction, type ProjectLifecyclePreview } from "../lib/projects.ts";
import { buildLocalExpenseCorrectionPreview, buildLocalInvoiceCorrectionPreview, type FinancialCorrectionAction, type FinancialCorrectionPreview, type FinancialCorrectionResult } from "../lib/financialLifecycle.ts";
import { applySubcontractTransition, buildLocalSubcontract } from "../lib/subcontracts.ts";
import { DemoAssistant } from "./DemoAssistant.tsx";
import { DemoEngineeringDocuments } from "./DemoEngineeringDocuments.tsx";
import { DemoTour } from "./DemoTour.tsx";
import { useDemoWorkspace } from "./DemoWorkspaceProvider.tsx";
import { buildDemoDashboard, buildDemoProjectDashboard, buildDemoProjectSummaries } from "./demoSelectors.ts";
import { DEMO_COMPANY_ID } from "./demoTypes.ts";
import { demoAssistantPath, demoDocumentsPath, demoPathForAppPath, demoPathForInvoice, demoPathForProject, demoPathForTab, type DemoLocation } from "./demoRouting.ts";
import { projectCostDataCompleteness } from "../utils/dataCompleteness.ts";
import { demoTimestamp } from "./data/demoDates.ts";

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

export function DemoWorkspace({ location, onNavigate }: { location: DemoLocation; onNavigate: (path: string, replace?: boolean) => void }) {
  const { data, dispatch, reset, tourOpen, setTourOpen } = useDemoWorkspace();
  const [activityPeriod, setActivityPeriod] = useState<DashboardActivityPeriod>("QUARTER");
  const [dashboardProjectId, setDashboardProjectId] = useState<string | undefined>();
  const [dashboardCurrency, setDashboardCurrency] = useState("PHP");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [expenseCorrectionContext, setExpenseCorrectionContext] = useState<string | null>(null);
  const appLocation = safeAppLocation(location);
  const activeTab = activeTabFor(location);
  const selectedProject = appLocation?.kind === "project" ? data.projects.find((project) => project.id === appLocation.projectId) || null : null;
  const selectedInvoice = appLocation && (appLocation.kind === "invoice" || appLocation.kind === "review-invoice") ? data.invoices.find((invoice) => invoice.id === appLocation.invoiceId) || null : null;
  const routeNotFound = Boolean(appLocation && ((appLocation.kind === "project" && !selectedProject) || ((appLocation.kind === "invoice" || appLocation.kind === "review-invoice") && !selectedInvoice)));
  const summaries = useMemo(() => buildDemoProjectSummaries(data), [data]);
  const dashboardData = useMemo(() => buildDemoDashboard(data, { activityPeriod, selectedProjectId: dashboardProjectId, selectedCurrency: dashboardCurrency, customStart, customEnd }), [activityPeriod, customEnd, customStart, dashboardCurrency, dashboardProjectId, data]);
  const projectDashboard = useMemo(() => selectedProject ? buildDemoProjectDashboard(data, selectedProject.id) : undefined, [data, selectedProject]);
  const reviewQueue = useMemo(() => data.invoices.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW" && !invoice.archivedAt && invoice.lifecycleStatus !== "VOID"), [data.invoices]);
  const demoProjectCostCompleteness = useMemo(() => projectCostDataCompleteness(["*"]), []);

  const projectLifecyclePreview = async (project: Project): Promise<ProjectLifecyclePreview> => buildProjectLifecyclePreview(project, {
    invoiceProjectAllocations: data.invoiceAllocations.filter((allocation) => allocation.projectId === project.id).length,
    expenses: data.expenses.filter((expense) => expense.projectId === project.id).length,
    projectWorkerAssignments: data.payroll.assignments.filter((assignment) => assignment.projectId === project.id).length,
    workEntries: data.payroll.workEntries.filter((entry) => entry.projectId === project.id).length,
    overtimeRequests: (data.payroll.overtimeRequests || []).filter((request) => request.projectId === project.id).length,
    payrollProjectAllocations: data.payroll.allocations.filter((allocation) => allocation.projectId === project.id).length,
    payrollEntryProjectContexts: data.payroll.entries.filter((entry) => entry.costContext?.projectId === project.id).length,
    workerDefaultProjects: data.payroll.workers.filter((worker) => worker.defaultProjectId === project.id).length,
    compensationProfileDefaultProjects: data.payroll.compensationProfiles.filter((profile) => profile.defaultProjectId === project.id).length,
    engineeringDocuments: data.engineering.documents.filter((document) => document.projectId === project.id).length,
    engineeringRfis: data.coordination.rfis.filter((rfi) => rfi.projectId === project.id).length,
    engineeringSubmittals: data.coordination.submittals.filter((submittal) => submittal.projectId === project.id).length,
    engineeringDailySiteLogs: data.siteLogs.logs.filter((log) => log.projectId === project.id).length,
    purchaseOrders: (data.purchaseOrders || []).filter((purchaseOrder) => purchaseOrder.projectId === project.id).length,
    subcontracts: (data.subcontracts || []).filter((subcontract) => subcontract.projectId === project.id).length,
  }, { source: "demo" });

  const applyProjectLifecycle = async (project: Project, action: ProjectLifecycleAction, _reason?: string) => {
    const current = data.projects.find((candidate) => candidate.id === project.id) || project;
    const preview = await projectLifecyclePreview(current);
    if (action === "DELETE_UNUSED" && !preview.canDelete) throw new Error("This demo project has linked history and cannot be permanently deleted.");
    dispatch({ type: "PROJECT_LIFECYCLE", project: current, action });
  };

  const archiveProject = async (project: Project) => {
    if (!window.confirm("This keeps the project and its historical records but removes it from active workflows. Continue?")) return;
    await applyProjectLifecycle(project, "ARCHIVE", "Confirmed project archive");
  };

  const reactivateProject = async (project: Project) => {
    if (!window.confirm("Reactivate this project? It will return to active workflows, and historical records will remain unchanged.")) return;
    await applyProjectLifecycle(project, "REACTIVATE", "Confirmed project reactivation");
  };

  const saveSubcontract = async (
    subcontract: Partial<Subcontract> & { subcontractNumber: string; vendorId: string; projectId: string; title: string },
    lines: Array<Partial<SubcontractLine> & { description: string; amount: number }>,
  ) => {
    const existing = subcontract.id ? (data.subcontracts || []).find((item) => item.id === subcontract.id) : undefined;
    const normalizedNumber = subcontract.subcontractNumber.trim().toUpperCase();
    if ((data.subcontracts || []).some((item) => item.id !== subcontract.id && item.subcontractNumber.trim().toUpperCase() === normalizedNumber)) {
      throw new Error("Subcontract number already exists in the demo workspace.");
    }
    const value = buildLocalSubcontract(
      { ...subcontract, status: existing?.status || "DRAFT" },
      lines,
      existing,
      DEMO_COMPANY_ID,
      demoTimestamp(data.anchorDate, 16, 30),
    );
    dispatch({ type: "SAVE_SUBCONTRACT", value });
  };

  const transitionSubcontract = async (id: string, targetStatus: SubcontractStatus, reason?: string) => {
    const current = (data.subcontracts || []).find((item) => item.id === id);
    if (!current) throw new Error("Subcontract not found in the demo workspace.");
    applySubcontractTransition(current, targetStatus, reason, demoTimestamp(data.anchorDate, 16, 30));
    dispatch({ type: "TRANSITION_SUBCONTRACT", id, targetStatus, reason });
  };

  const deleteSubcontract = async (id: string) => {
    const current = (data.subcontracts || []).find((item) => item.id === id);
    if (current && current.status !== "DRAFT") throw new Error("Only draft subcontracts may be deleted.");
    dispatch({ type: "DELETE_SUBCONTRACT", id });
  };

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

  const previewInvoiceCorrection = async (invoice: InvoiceData): Promise<FinancialCorrectionPreview> => {
    const matches = data.cash.matches.filter((match) => match.targetType === "INVOICE" && match.targetId === invoice.id);
    return buildLocalInvoiceCorrectionPreview({ invoice, allocationCount: data.invoiceAllocations.filter((allocation) => allocation.invoiceId === invoice.id).length, settlementMatchCount: matches.length, confirmedSettlementCount: matches.filter((match) => match.status === "CONFIRMED").length, historyCount: (invoice.extractionId ? 1 : 0) + (invoice.reviewStatus === "VERIFIED" ? 1 : 0) });
  };

  const applyInvoiceCorrection = async (invoice: InvoiceData, action: FinancialCorrectionAction, reason?: string): Promise<FinancialCorrectionResult> => {
    const preview = await previewInvoiceCorrection(invoice);
    if (action === "DELETE_UNUSED") throw new Error("Permanent deletion is unavailable in the demo workspace.");
    if (action === "VOID" && !preview.canVoid) throw new Error(preview.blockedReason || "This invoice cannot be voided.");
    const updatedAt = `${data.anchorDate}T14:30:00+08:00`;
    const record = action === "VOID" ? { ...invoice, lifecycleStatus: "VOID" as const, voidedAt: updatedAt, voidReason: reason?.trim() || "Confirmed invoice void", updatedAt } : action === "ARCHIVE" ? { ...invoice, archivedAt: invoice.archivedAt || updatedAt, updatedAt } : { ...invoice, archivedAt: undefined, updatedAt };
    dispatch({ type: "FINANCIAL_CORRECTION", entity: "INVOICE", id: invoice.id, action, reason });
    return { entityType: "INVOICE", entityId: invoice.id, action, deleted: false, changed: true, preflight: preview, record };
  };

  const previewExpenseCorrection = async (expense: Expense): Promise<FinancialCorrectionPreview> => {
    const matches = data.cash.matches.filter((match) => match.targetType === "EXPENSE" && match.targetId === expense.id);
    return buildLocalExpenseCorrectionPreview({ expense, settlementMatchCount: matches.length, confirmedSettlementCount: matches.filter((match) => match.status === "CONFIRMED").length, historyCount: expense.createdAt ? 1 : 0 });
  };

  const applyExpenseCorrection = async (expense: Expense, action: FinancialCorrectionAction, reason?: string): Promise<FinancialCorrectionResult> => {
    const preview = await previewExpenseCorrection(expense);
    if (action === "DELETE_UNUSED") throw new Error("Permanent deletion is unavailable in the demo workspace.");
    if (action === "VOID" && !preview.canVoid) throw new Error(preview.blockedReason || "This expense cannot be voided.");
    const updatedAt = `${data.anchorDate}T14:30:00+08:00`;
    const record = action === "VOID" ? { ...expense, status: "VOID" as const, voidedAt: updatedAt, voidReason: reason?.trim() || "Confirmed expense void", updatedAt } : action === "ARCHIVE" ? { ...expense, archivedAt: expense.archivedAt || updatedAt, updatedAt } : { ...expense, archivedAt: undefined, updatedAt };
    dispatch({ type: "FINANCIAL_CORRECTION", entity: "EXPENSE", id: expense.id, action, reason });
    return { entityType: "EXPENSE", entityId: expense.id, action, deleted: false, changed: true, preflight: preview, record };
  };

  const applyPayrollLifecycle = (request: PayrollLifecycleRequest) => {
    dispatch({ type: "PAYROLL_LIFECYCLE", request });
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
      : appLocation && !routeNotFound
        ? (
          <AppRouter
            route={appLocation}
            activeTab={activeTab}
            onNavigatePath={(path, replace = false) => onNavigate(path.startsWith("/demo/") ? path : demoPathForAppPath(path), replace)}
            dashboardData={dashboardData}
            dashboardProjectId={dashboardProjectId}
            onDashboardProjectChange={setDashboardProjectId}
            onDashboardActivityPeriodChange={setActivityPeriod}
            onDashboardCustomRangeChange={(start, end) => { setCustomStart(start); setCustomEnd(end); }}
            onDashboardCurrencyChange={setDashboardCurrency}
            onNavigateTab={navigateTab}
            projects={data.projects}
            costCodes={data.costCodes || []}
            purchaseOrders={data.purchaseOrders || []}
            subcontracts={data.subcontracts || []}
            vendors={data.vendors || []}
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
            onPreviewProjectLifecycle={projectLifecyclePreview}
            onApplyProjectLifecycle={applyProjectLifecycle}
            onArchiveProject={archiveProject}
            onReactivateProject={reactivateProject}
            onProjectTabChange={openProjectView}
            onProjectBack={() => onNavigate(demoPathForTab("projects"))}
            onProjectUploadInvoice={() => onNavigate(demoPathForTab("invoices"))}
            onProjectAddExpense={() => onNavigate(demoPathForTab("expenses"))}
            onProjectOpenExpenseCorrection={(expense) => { setExpenseCorrectionContext(expense.id); onNavigate(demoPathForTab("expenses")); }}
            onProjectOpenPayroll={() => onNavigate(demoPathForTab("payroll"))}
            onSaveSubcontract={saveSubcontract}
            onTransitionSubcontract={transitionSubcontract}
            onDeleteSubcontract={deleteSubcontract}
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
            onPreviewInvoiceCorrection={previewInvoiceCorrection}
            onApplyInvoiceCorrection={applyInvoiceCorrection}
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
            onReactivateFinancialAccount={(account) => dispatch({ type: "SAVE_FINANCIAL_ACCOUNT", value: { ...account, active: true, updatedAt: `${data.anchorDate}T14:05:00+08:00` } })}
            onSaveFinancialSnapshot={(snapshot: FinancialBalanceSnapshot) => dispatch({ type: "SAVE_FINANCIAL_SNAPSHOT", value: snapshot })}
            onSaveFinancialTransaction={(transaction: FinancialTransaction) => dispatch({ type: "SAVE_FINANCIAL_TRANSACTION", value: transaction })}
            onSaveFinancialMatch={(match, transaction) => dispatch({ type: "SAVE_FINANCIAL_MATCH", match, transaction })}
            onSaveFinancialMatchBatch={(matches, transaction) => { for (const match of matches) dispatch({ type: "SAVE_FINANCIAL_MATCH", match, transaction }); }}
            onReverseFinancialMatch={(matchId, reason) => dispatch({ type: "REVERSE_FINANCIAL_SETTLEMENT", matchId, reason })}
            onCorrectFinancialTransaction={(transaction, input) => dispatch({ type: "SAVE_FINANCIAL_TRANSACTION", value: { ...transaction, ...input, postedAt: transaction.postedAt ? `${input.transactionDate}T00:00:00.000Z` : undefined, updatedAt: `${data.anchorDate}T14:10:00+08:00` } })}
            onReverseFinancialTransaction={(transaction, _reason) => dispatch({ type: "SAVE_FINANCIAL_TRANSACTION", value: { ...transaction, status: "REVERSED", reconciliationStatus: "UNMATCHED", updatedAt: `${data.anchorDate}T14:10:00+08:00` } })}
            onIgnoreFinancialTransaction={(transaction, _reason) => dispatch({ type: "SAVE_FINANCIAL_TRANSACTION", value: { ...transaction, reconciliationStatus: "IGNORED", updatedAt: `${data.anchorDate}T14:10:00+08:00` } })}
            onRestoreFinancialTransactionToReview={(transaction, _reason) => dispatch({ type: "SAVE_FINANCIAL_TRANSACTION", value: { ...transaction, reconciliationStatus: "UNMATCHED", updatedAt: `${data.anchorDate}T14:10:00+08:00` } })}
            onReverseFinancialTransfer={(left, right, reason) => {
              const updatedAt = `${data.anchorDate}T14:15:00+08:00`;
              for (const transaction of [left, right]) {
                const partnerId = transaction.id === left.id ? right.id : left.id;
                const match = data.cash.matches.find((item) => item.status === "CONFIRMED" && item.targetType === "TRANSFER" && item.transactionId === transaction.id && item.targetId === partnerId);
                if (match) dispatch({ type: "SAVE_FINANCIAL_MATCH", match: { ...match, status: "REVERSED", reversedAt: updatedAt, reversalReason: reason, updatedAt }, transaction: { ...transaction, transferGroupId: undefined, reconciliationStatus: "UNMATCHED", updatedAt } });
              }
            }}
            onOpenCashDashboard={() => onNavigate(demoPathForTab("dashboard"))}
            payrollData={data.payroll}
            payrollPeriodPreparationState="READY"
            canManagePayrollSettings={true}
            canManagePayrollMaintenance={false}
            canManageWorkforce={true}
            canManagePayrollSources={true}
            onPayrollLifecycle={applyPayrollLifecycle}
            onSavePayrollWorker={(worker: Worker) => dispatch({ type: "SAVE_WORKER", value: worker })}
            onSavePayrollAssignment={(assignment: ProjectWorkerAssignment) => dispatch({ type: "SAVE_ASSIGNMENT", value: assignment })}
            onSavePayrollPeriod={(period: PayrollPeriod) => dispatch({ type: "SAVE_PERIOD", value: period })}
            onSavePayrollSchedule={(schedule: PayrollSchedule) => dispatch({ type: "SAVE_SCHEDULE", value: schedule })}
            onSavePayrollWorkEntry={(entry: WorkEntry) => dispatch({ type: "SAVE_WORK_ENTRY", value: entry })}
            onSavePayrollAttendance={(record: AttendanceRecord) => dispatch({ type: "SAVE_ATTENDANCE", value: record })}
            onSavePayrollAttendanceBatch={(records: AttendanceRecord[]) => dispatch({ type: "SAVE_ATTENDANCE_BATCH", value: records })}
            onSavePayrollLeave={(request: LeaveRequest) => dispatch({ type: "SAVE_LEAVE", value: request })}
            onSavePayrollOvertime={(request: OvertimeRequest) => dispatch({ type: "SAVE_OVERTIME", value: request })}
            onSaveWorkerCompensationProfile={(profile) => dispatch({ type: "SAVE_COMPENSATION_PROFILE", value: profile })}
            onSaveRecurringPayrollComponent={(component) => dispatch({ type: "SAVE_RECURRING_COMPONENT", value: component })}
            onSavePayrollEntry={(entry: PayrollEntry) => dispatch({ type: "SAVE_PAYROLL_ENTRY", value: entry })}
            onUpdatePayrollRun={(run: PayrollRun) => dispatch({ type: "UPDATE_PAYROLL_RUN", value: run })}
            expenses={data.expenses}
            onSaveExpense={(expense: Expense) => dispatch({ type: "SAVE_EXPENSE", value: expense })}
            expenseCorrectionContext={expenseCorrectionContext}
            onPreviewExpenseCorrection={previewExpenseCorrection}
            onApplyExpenseCorrection={applyExpenseCorrection}
            onExpenseCorrectionContextConsumed={() => setExpenseCorrectionContext(null)}
            regionalSettings={DEFAULT_REGIONAL_SETTINGS}
            showDeploymentAccessManagement={false}
          />
        )
        : routeNotFound
          ? null
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
      projectCostCompleteness={demoProjectCostCompleteness}
      isSupabaseConfigured={true}
      routeNotFound={routeNotFound}
      onReturnToDashboard={() => onNavigate(demoPathForTab("dashboard"))}
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
