import React, { lazy, Suspense } from "react";
import type { AppLocation } from "../../utils/appRouting";
import type { AppTab } from "../../utils/routes";
import { DashboardRoute } from "./DashboardRoute";
import type {
  DashboardActivityPeriod,
  DashboardViewData,
} from "../../components/engineering/EngineeringCostOperationsDashboard";
import type {
  AttendanceRecord,
  EmailClassification,
  Expense,
  GmailConnectionInfo,
  GmailMessageCandidate,
  GmailScanWindow,
  InvoiceData,
  InvoiceProjectAllocation,
  LeaveRequest,
  OvertimeRequest,
  PayrollEntry,
  PayrollHoliday,
  PayrollPeriod,
  PayrollProjectAllocation,
  PayrollRun,
  Project,
  ProjectCostSummary,
  ProjectWorkerAssignment,
  WorkEntry,
  Worker,
} from "../../types";
import type { ProjectDashboardViewData } from "../../utils/projectDashboardViewModel";
import type { ProjectLaborCostAggregate, ProjectLaborSource } from "../../utils/projectLaborCostAggregate.ts";
import type { WorkspaceTab } from "../../components/projects/ProjectWorkspace";
import type { EngineeringDailySiteLogsWorkspaceData } from "../../lib/dailySiteLogs.ts";
import type { ProjectLifecycleAction, ProjectLifecyclePreview } from "../../lib/projects.ts";
import type { SaveState } from "../../components/VerificationWorkspace";
import type { ExtractPayload } from "../../components/UploadZone";
import type {
  CashBankingWorkspaceData,
  FinancialAccount,
  FinancialBalanceSnapshot,
  FinancialReconciliationCandidate,
  FinancialTransaction,
  FinancialTransactionMatch,
  StatementPreview,
} from "../../lib/cashBanking";
import type { PayrollWorkspaceData } from "../../lib/payroll";
import type {
  PayrollImportBatch,
  PayrollImportRow,
  PayrollImportTemplate,
  PayrollImportWorkspaceData,
} from "../../lib/payrollImportPersistence";
import type { StagedPayrollImport } from "../../lib/payrollImportWorkflow";
import type { PayrollSchedule } from "../../lib/payrollSchedule";
import type {
  RecurringPayrollComponent,
  WorkerCompensationProfile,
} from "../../lib/payrollAutomation";
import type {
  PayrollMaintenanceAction,
  PayrollMaintenancePreview,
  PayrollWorkspaceResetPreview,
} from "../../lib/payrollMaintenance";
import type { RegionalSettings } from "../../config/regional";
import type { PayrollLifecycleRequest } from "../../lib/payrollLifecycle";
import type { FinancialCorrectionAction, FinancialCorrectionPreview, FinancialCorrectionResult } from "../../lib/financialLifecycle.ts";

const CashBankingRoute = lazy(() => import("./CashBankingRoute"));
const ProjectsRoute = lazy(() => import("./ProjectsRoute").then(({ ProjectsRoute }) => ({ default: ProjectsRoute })));
const InvoicesRoute = lazy(() => import("./InvoicesRoute"));
const PayrollRoute = lazy(() => import("./PayrollRoute"));
const ExpensesRoute = lazy(() => import("./ExpensesRoute"));
const ReportsRoute = lazy(() => import("./ReportsRoute"));
const SettingsRoute = lazy(() => import("./SettingsRoute"));

const lazyRouteFallback = (
  <div role="status" className="flex min-h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600">
    Loading workspace page…
  </div>
);

function lazyRoute(element: React.ReactNode): React.JSX.Element {
  return <Suspense fallback={lazyRouteFallback}>{element}</Suspense>;
}

export interface AppRouterProps {
  // Navigation State
  route: AppLocation;
  activeTab: AppTab;
  workspaceRouteVisible?: boolean;

  // Dashboard Data & Handlers
  dashboardData: DashboardViewData;
  dashboardProjectId?: string;
  onDashboardProjectChange?: (projectId?: string) => void;
  onDashboardActivityPeriodChange?: (period: DashboardActivityPeriod) => void;
  onDashboardCustomRangeChange?: (start: string, end: string) => void;
  onDashboardCurrencyChange?: (currency: string) => void;
  onNavigateTab?: (tab: AppTab) => void;

  // Projects Data & Handlers
  projects: Project[];
  selectedProject?: Project | null;
  projectSummaries: Record<string, ProjectCostSummary>;
  projectDashboard?: ProjectDashboardViewData;
  projectLaborAggregates?: readonly ProjectLaborCostAggregate[];
  laborSource?: ProjectLaborSource;
  projectFormSeed?: Project | null;
  companyId?: string;
  engineeringDocumentsCanRead?: boolean;
  engineeringDocumentsCanCreate?: boolean;
  engineeringDocumentsCanAnnotate?: boolean;
  engineeringDocumentsCanManage?: boolean;
  engineeringDocumentsGuestMode?: boolean;
  projectDocumentsContent?: React.ReactNode;
  dailySiteLogsData?: EngineeringDailySiteLogsWorkspaceData;
  onDailySiteLogsDataChange?: (data: EngineeringDailySiteLogsWorkspaceData) => void;
  pathForSiteLog?: (siteLogId?: string) => string;
  onOpenProject: (project: Project) => void;
  onSaveProject: (project: Project) => Promise<void> | void;
  onPreviewProjectLifecycle: (project: Project) => Promise<ProjectLifecyclePreview>;
  onApplyProjectLifecycle: (project: Project, action: ProjectLifecycleAction, reason?: string) => Promise<void>;
  onArchiveProject: (project: Project) => Promise<void> | void;
  onReactivateProject: (project: Project) => Promise<void> | void;
  onEditProject?: () => void;
  onProjectTabChange?: (tab: WorkspaceTab) => void;
  onProjectBack?: () => void;
  onProjectUploadInvoice?: () => void;
  onProjectAddExpense?: () => void;
  onProjectOpenExpenseCorrection?: (expense: Expense) => void;
  onProjectOpenPayroll?: () => void;

  // Invoices Data & Handlers
  invoices: InvoiceData[];
  selectedInvoice?: InvoiceData | null;
  invoiceProjectAllocations: InvoiceProjectAllocation[];
  onSaveInvoiceProjectAllocations: (
    invoice: InvoiceData,
    allocations: InvoiceProjectAllocation[],
  ) => Promise<void>;
  reviewQueue?: InvoiceData[];
  reviewIndex?: number;
  saveState?: SaveState;
  reviewCompletion?: { verifiedCount: number; totalCount: number; newItems: number } | null;
  retryingInvoiceId?: string | null;
  workspaceOriginLabel?: string;
  uploadProjectContextId?: string | null;
  processingCount?: number;
  gmailConnection?: GmailConnectionInfo;
  onRetryExtraction?: (invoice: InvoiceData) => Promise<InvoiceData | null>;
  onUpdateInvoice?: (invoice: InvoiceData) => void;
  onInvoiceBack?: () => void | Promise<void>;
  onReviewPrevious?: () => Promise<boolean>;
  onReviewNext?: () => Promise<boolean>;
  onReviewSave?: () => Promise<boolean>;
  onVerifyAndNext?: () => Promise<boolean>;
  onReopenInvoice?: (invoice: InvoiceData) => Promise<void>;
  onContinueWithNewItems?: () => void;
  onReturnToDashboard?: () => void;
  onViewVerified?: () => void;
  onRevertToAI?: (invoice: InvoiceData) => void;
  onRevertField?: (invoice: InvoiceData, path: string) => void;
  onSelectInvoice?: (invoice: InvoiceData) => void;
  onOpenInvoiceForReview?: (invoice: InvoiceData) => void;
  onStartReview?: (queue?: InvoiceData[]) => void;
  onPreviewInvoiceCorrection?: (invoice: InvoiceData) => Promise<FinancialCorrectionPreview>;
  onApplyInvoiceCorrection?: (invoice: InvoiceData, action: FinancialCorrectionAction, reason?: string) => Promise<FinancialCorrectionResult>;
  onAddNewInvoice?: () => void;
  onExtractInvoice?: (payload: ExtractPayload) => Promise<InvoiceData>;
  onLoadInvoicePreset?: (invoice: InvoiceData) => void;
  onBatchExtractComplete?: (
    successful: InvoiceData[],
    failed: Array<{ name: string; error: string }>,
  ) => void;
  onConnectGmail?: () => Promise<void> | void;
  onSignOut?: () => Promise<void> | void;
  onScanGmail?: (window: GmailScanWindow) => Promise<GmailMessageCandidate[]>;
  onSyncGmail?: () => Promise<GmailMessageCandidate[]>;
  onImportGmailMessage?: (message: GmailMessageCandidate) => Promise<number>;
  onProcessEmail?: (input: { sender: string; subject: string; receivedAt: string; body: string; attachments: File[] }) => Promise<EmailClassification | null>;

  // Cash & Banking Data & Handlers
  cashData: CashBankingWorkspaceData;
  cashReconciliationCandidates?: readonly FinancialReconciliationCandidate[];
  canManageCashAccounts?: boolean;
  canManageCashTransactions?: boolean;
  canCashImport?: boolean;
  canCashReconcile?: boolean;
  onSaveFinancialAccount?: (account: FinancialAccount) => Promise<FinancialAccount | void> | FinancialAccount | void;
  onDeactivateFinancialAccount?: (account: FinancialAccount) => Promise<void> | void;
  onSaveFinancialSnapshot?: (snapshot: FinancialBalanceSnapshot) => Promise<void> | void;
  onSaveFinancialTransaction?: (transaction: FinancialTransaction) => Promise<void> | void;
  onCommitFinancialImport?: (preview: StatementPreview, account: FinancialAccount) => Promise<void> | void;
  onSaveFinancialMatch?: (match: FinancialTransactionMatch, transaction: FinancialTransaction) => Promise<void> | void;
  onIgnoreFinancialTransaction?: (transaction: FinancialTransaction) => Promise<void> | void;
  onConfirmFinancialTransfer?: (left: FinancialTransaction, right: FinancialTransaction) => Promise<void> | void;
  onOpenCashDashboard?: () => void;

  // Payroll Data & Handlers
  payrollData: PayrollWorkspaceData;
  payrollImportData?: PayrollImportWorkspaceData;
  payrollPeriodPreparationState?:
    | "NO_SCHEDULE"
    | "PREPARING"
    | "SYNCING"
    | "READY"
    | "FAILED"
    | "WAITING_FOR_BOUNDARY";
  onRetryPayrollPeriodPreparation?: () => void;
  canManagePayrollSettings?: boolean;
  canManagePayrollMaintenance?: boolean;
  canManageWorkforce?: boolean;
  canManagePayrollSources?: boolean;
  onPayrollLifecycle?: (request: PayrollLifecycleRequest) => Promise<void> | void;
  onSavePayrollWorker?: (worker: Worker) => void;
  onSavePayrollAssignment?: (assignment: ProjectWorkerAssignment) => void;
  onSavePayrollPeriod?: (period: PayrollPeriod) => void;
  onSavePayrollSchedule?: (schedule: PayrollSchedule) => void | Promise<PayrollSchedule | void>;
  onSaveWorkerCompensationProfile?: (profile: WorkerCompensationProfile) => void;
  onSaveRecurringPayrollComponent?: (component: RecurringPayrollComponent) => void;
  onSavePayrollWorkEntry?: (entry: WorkEntry) => void;
  onSavePayrollAttendance?: (record: AttendanceRecord) => void;
  onSavePayrollAttendanceBatch?: (records: AttendanceRecord[]) => void;
  onSavePayrollLeave?: (request: LeaveRequest) => void;
  onSavePayrollOvertime?: (request: OvertimeRequest) => void;
  onSavePayrollHoliday?: (holiday: PayrollHoliday) => void;
  onSavePayrollEntry?: (entry: PayrollEntry, allocations: PayrollProjectAllocation[]) => void;
  onUpdatePayrollRun?: (run: PayrollRun) => void;
  onCreatePayrollRun?: (periodId: string) => void;
  onCalculatePayrollRun?: (run: PayrollRun) => void;
  onStagePayrollImport?: (batch: PayrollImportBatch, rows: PayrollImportRow[], bytes: Uint8Array) => void;
  onSavePayrollImportTemplate?: (template: PayrollImportTemplate) => void;
  onCommitPayrollImport?: (
    staged: StagedPayrollImport,
    periodStart: string,
    periodEnd: string,
    payDate?: string,
  ) => void;
  onPreviewPayrollMaintenance?: (action: PayrollMaintenanceAction) => Promise<PayrollMaintenancePreview>;
  onApplyPayrollMaintenance?: (
    action: PayrollMaintenanceAction,
    confirmation?: string,
  ) => Promise<unknown>;
  onPreviewFactoryReset?: () => Promise<PayrollWorkspaceResetPreview>;
  onApplyFactoryReset?: (confirmation: string) => Promise<unknown>;

  // Expenses Data & Handlers
  expenses: Expense[];
  expenseFormContext?: string | null;
  expenseCorrectionContext?: string | null;
  onSaveExpense?: (expense: Expense) => void;
  onPreviewExpenseCorrection?: (expense: Expense) => Promise<FinancialCorrectionPreview>;
  onApplyExpenseCorrection?: (expense: Expense, action: FinancialCorrectionAction, reason?: string) => Promise<FinancialCorrectionResult>;
  onExpenseCorrectionContextConsumed?: () => void;

  // Reports
  onExportReportsWorkbook?: () => void;

  // Settings
  regionalSettings: RegionalSettings;
  onRegionalSettingsChange?: (settings: RegionalSettings) => void;
  showDeploymentAccessManagement?: boolean;
}

export const AppRouter: React.FC<AppRouterProps> = ({
  route,
  activeTab,
  workspaceRouteVisible = true,
  dashboardData,
  dashboardProjectId,
  onDashboardProjectChange,
  onDashboardActivityPeriodChange = () => {},
  onDashboardCustomRangeChange,
  onDashboardCurrencyChange = () => {},
  onNavigateTab = (_tab: AppTab) => {},
  projects,
  selectedProject,
  projectSummaries,
  projectDashboard,
  projectLaborAggregates = [],
  laborSource,
  projectFormSeed,
  companyId,
  engineeringDocumentsCanRead = true,
  engineeringDocumentsCanCreate = true,
  engineeringDocumentsCanAnnotate = true,
  engineeringDocumentsCanManage = true,
  engineeringDocumentsGuestMode = false,
  projectDocumentsContent,
  dailySiteLogsData,
  onDailySiteLogsDataChange,
  pathForSiteLog,
  onOpenProject,
  onSaveProject,
  onPreviewProjectLifecycle,
  onApplyProjectLifecycle,
  onArchiveProject,
  onReactivateProject,
  onEditProject,
  onProjectTabChange,
  onProjectBack = () => {},
  onProjectUploadInvoice = () => {},
  onProjectAddExpense,
  onProjectOpenExpenseCorrection,
  onProjectOpenPayroll,
  invoices,
  selectedInvoice,
  invoiceProjectAllocations,
  onSaveInvoiceProjectAllocations,
  reviewQueue = [],
  reviewIndex = -1,
  saveState = "saved",
  reviewCompletion = null,
  retryingInvoiceId = null,
  workspaceOriginLabel,
  uploadProjectContextId,
  processingCount = 0,
  gmailConnection,
  onRetryExtraction,
  onUpdateInvoice,
  onInvoiceBack,
  onReviewPrevious,
  onReviewNext,
  onReviewSave,
  onVerifyAndNext,
  onReopenInvoice,
  onContinueWithNewItems,
  onReturnToDashboard,
  onViewVerified,
  onRevertToAI,
  onRevertField,
  onSelectInvoice,
  onOpenInvoiceForReview,
  onStartReview,
  onPreviewInvoiceCorrection,
  onApplyInvoiceCorrection,
  onAddNewInvoice,
  onExtractInvoice,
  onLoadInvoicePreset,
  onBatchExtractComplete,
  onConnectGmail,
  onSignOut,
  onScanGmail,
  onSyncGmail,
  onImportGmailMessage,
  onProcessEmail,
  cashData,
  cashReconciliationCandidates = [],
  canManageCashAccounts = true,
  canManageCashTransactions = true,
  canCashImport = true,
  canCashReconcile = true,
  onSaveFinancialAccount = () => {},
  onDeactivateFinancialAccount,
  onSaveFinancialSnapshot,
  onSaveFinancialTransaction = () => {},
  onCommitFinancialImport,
  onSaveFinancialMatch,
  onIgnoreFinancialTransaction,
  onConfirmFinancialTransfer,
  onOpenCashDashboard,
  payrollData,
  payrollImportData = { costCenters: [], batches: [], rows: [], templates: [] },
  payrollPeriodPreparationState,
  onRetryPayrollPeriodPreparation,
  canManagePayrollSettings = true,
  canManagePayrollMaintenance = true,
  canManageWorkforce = true,
  canManagePayrollSources = true,
  onPayrollLifecycle,
  onSavePayrollWorker = () => {},
  onSavePayrollAssignment = () => {},
  onSavePayrollPeriod = () => {},
  onSavePayrollSchedule,
  onSaveWorkerCompensationProfile,
  onSaveRecurringPayrollComponent,
  onSavePayrollWorkEntry = () => {},
  onSavePayrollAttendance,
  onSavePayrollAttendanceBatch,
  onSavePayrollLeave,
  onSavePayrollOvertime,
  onSavePayrollHoliday,
  onSavePayrollEntry = () => {},
  onUpdatePayrollRun,
  onCreatePayrollRun,
  onCalculatePayrollRun,
  onStagePayrollImport,
  onSavePayrollImportTemplate,
  onCommitPayrollImport,
  onPreviewPayrollMaintenance,
  onApplyPayrollMaintenance,
  onPreviewFactoryReset,
  onApplyFactoryReset,
  expenses,
  expenseFormContext,
  expenseCorrectionContext,
  onSaveExpense = () => {},
  onPreviewExpenseCorrection,
  onApplyExpenseCorrection,
  onExpenseCorrectionContextConsumed,
  onExportReportsWorkbook,
  regionalSettings,
  onRegionalSettingsChange = () => {},
  showDeploymentAccessManagement = true,
}) => {
  if (!workspaceRouteVisible) {
    return null;
  }

  // 1. Single Invoice Verification / Review Workspace Mode
  if ((route.kind === "invoice" || route.kind === "review-invoice") && selectedInvoice) {
    return lazyRoute(
      <InvoicesRoute
        selectedInvoice={selectedInvoice}
        invoices={invoices}
        projects={projects}
        invoiceProjectAllocations={invoiceProjectAllocations}
        preferredProjectId={uploadProjectContextId || undefined}
        reviewQueue={reviewQueue}
        reviewIndex={reviewIndex}
        saveState={saveState}
        reviewCompletion={reviewCompletion}
        retryingInvoiceId={retryingInvoiceId}
        workspaceOriginLabel={workspaceOriginLabel}
        onRetryExtraction={onRetryExtraction}
        onUpdateInvoice={onUpdateInvoice}
        onBack={onInvoiceBack}
        onPrevious={onReviewPrevious}
        onNext={onReviewNext}
        onSave={onReviewSave}
        onVerifyAndNext={onVerifyAndNext}
        onReopen={onReopenInvoice}
        onContinueWithNewItems={onContinueWithNewItems}
        onReturnToDashboard={onReturnToDashboard}
        onViewVerified={onViewVerified}
        onRevertToAI={onRevertToAI}
        onRevertField={onRevertField}
        onSaveProjectAllocations={onSaveInvoiceProjectAllocations}
        onPreviewCorrection={onPreviewInvoiceCorrection}
        onApplyCorrection={onApplyInvoiceCorrection}
      />
    );
  }

  // 2. Projects Route (Tab or Project Workspace)
  if (route.kind === "project" || activeTab === "projects") {
    return lazyRoute(
      <ProjectsRoute
        projects={projects}
        selectedProject={selectedProject}
        summaries={projectSummaries}
        projectDashboard={projectDashboard}
        invoices={invoices}
        invoiceAllocations={invoiceProjectAllocations}
        expenses={expenses}
        workers={payrollData.workers}
        assignments={payrollData.assignments}
        payrollAllocations={payrollData.allocations}
        payrollPeriods={payrollData.periods}
        projectFormSeed={projectFormSeed}
        initialTab={route.kind === "project" ? route.view : "overview"}
        initialDocumentId={route.kind === "project" ? route.documentId : undefined}
        initialRevisionId={route.kind === "project" ? route.revisionId : undefined}
        initialSiteLogId={route.kind === "project" ? route.siteLogId : undefined}
        companyId={companyId}
        engineeringDocumentsCanRead={engineeringDocumentsCanRead}
        engineeringDocumentsCanCreate={engineeringDocumentsCanCreate}
        engineeringDocumentsCanAnnotate={engineeringDocumentsCanAnnotate}
        engineeringDocumentsCanManage={engineeringDocumentsCanManage}
        engineeringDocumentsGuestMode={engineeringDocumentsGuestMode}
        projectDocumentsContent={projectDocumentsContent}
        dailySiteLogsData={dailySiteLogsData}
        onDailySiteLogsDataChange={onDailySiteLogsDataChange}
        pathForSiteLog={pathForSiteLog}
        onTabChange={onProjectTabChange}
        onOpenProject={onOpenProject}
        onSaveProject={onSaveProject}
        onPreviewProjectLifecycle={onPreviewProjectLifecycle}
        onApplyProjectLifecycle={onApplyProjectLifecycle}
        onArchiveProject={onArchiveProject}
        onReactivateProject={onReactivateProject}
        onEditProject={onEditProject}
        onSaveInvoiceAllocations={onSaveInvoiceProjectAllocations}
        onBack={onProjectBack}
        onOpenInvoice={(invoice) => onSelectInvoice?.(invoice)}
        onUploadInvoice={onProjectUploadInvoice}
        onAddExpense={onProjectAddExpense}
        onOpenExpenseCorrection={onProjectOpenExpenseCorrection}
        onOpenPayroll={onProjectOpenPayroll}
      />
    );
  }

  // 3. Dashboard Route
  if (route.kind === "tab" && activeTab === "dashboard") {
    return (
      <DashboardRoute
        data={dashboardData}
        projects={projects}
        selectedProjectId={dashboardProjectId}
        onProjectChange={onDashboardProjectChange}
        onActivityPeriodChange={onDashboardActivityPeriodChange}
        onCustomRangeChange={onDashboardCustomRangeChange}
        onCurrencyChange={onDashboardCurrencyChange}
        onNavigate={onNavigateTab}
        onOpenProject={(projectId) => {
          const project = projects.find((p) => p.id === projectId);
          if (project) onOpenProject(project);
        }}
        onOpenInvoice={(invoice) => onSelectInvoice?.(invoice)}
      />
    );
  }

  // 4. Cash & Banking Route
  if (route.kind === "tab" && activeTab === "cash") {
    return lazyRoute(
      <CashBankingRoute
        data={cashData}
        onSaveAccount={onSaveFinancialAccount}
        onDeactivateAccount={onDeactivateFinancialAccount}
        onSaveSnapshot={onSaveFinancialSnapshot}
        onSaveTransaction={onSaveFinancialTransaction}
        onCommitImport={onCommitFinancialImport}
        onSaveMatch={onSaveFinancialMatch}
        onIgnoreTransaction={onIgnoreFinancialTransaction}
        onConfirmTransfer={onConfirmFinancialTransfer}
        reconciliationCandidates={cashReconciliationCandidates}
        canManageAccounts={canManageCashAccounts}
        canManageTransactions={canManageCashTransactions}
        canImport={canCashImport}
        canReconcile={canCashReconcile}
        onOpenDashboard={onOpenCashDashboard || (onNavigateTab ? () => onNavigateTab("dashboard") : undefined)}
      />
    );
  }

  // 5. Invoices and Related Tabs
  if (
    route.kind === "tab" &&
    ["extractor", "inbox", "review", "invoices", "vendors"].includes(activeTab)
  ) {
    return lazyRoute(
      <InvoicesRoute
        activeSubTab={activeTab}
        invoices={invoices}
        projects={projects}
        invoiceProjectAllocations={invoiceProjectAllocations}
        preferredProjectId={uploadProjectContextId || undefined}
        reviewQueue={reviewQueue}
        processingCount={processingCount}
        gmailConnection={gmailConnection}
        onSelectInvoice={onSelectInvoice}
        onOpenInvoiceForReview={onOpenInvoiceForReview}
        onStartReview={onStartReview}
        onPreviewCorrection={onPreviewInvoiceCorrection}
        onApplyCorrection={onApplyInvoiceCorrection}
        onAddNew={onAddNewInvoice}
        onExtract={onExtractInvoice}
        onLoadPreset={onLoadInvoicePreset}
        onBatchComplete={onBatchExtractComplete}
        onConnectGmail={onConnectGmail}
        onSignOut={onSignOut}
        onScanGmail={onScanGmail}
        onSyncGmail={onSyncGmail}
        onImportGmailMessage={onImportGmailMessage}
        onProcessEmail={onProcessEmail}
      />
    );
  }

  // 6. Payroll Route
  if (route.kind === "tab" && activeTab === "payroll") {
    return lazyRoute(
      <PayrollRoute
        workers={payrollData.workers}
        assignments={payrollData.assignments}
        periods={payrollData.periods}
        runs={payrollData.runs}
        entries={payrollData.entries}
        allocations={payrollData.allocations}
        adjustments={payrollData.adjustments}
        workEntries={payrollData.workEntries}
        attendanceRecords={payrollData.attendanceRecords || []}
        leaveRequests={payrollData.leaveRequests || []}
        overtimeRequests={payrollData.overtimeRequests || []}
        holidays={payrollData.holidays || []}
        projects={projects}
        schedules={payrollData.schedules || []}
        compensationProfiles={payrollData.compensationProfiles || []}
        recurringComponents={payrollData.recurringComponents || []}
        payrollImportWorkerIds={payrollImportData.rows.map((row) => row.workerId).filter((id): id is string => Boolean(id))}
        departmentManagerWorkerIds={payrollData.departments.map((department) => department.managerWorkerId).filter((id): id is string => Boolean(id))}
        importBatches={payrollImportData.batches}
        importTemplates={payrollImportData.templates}
        periodPreparationState={payrollPeriodPreparationState}
        onRetryPeriodPreparation={onRetryPayrollPeriodPreparation}
        onSaveWorker={onSavePayrollWorker}
        onSaveAssignment={onSavePayrollAssignment}
        onSavePeriod={onSavePayrollPeriod}
        onSaveSchedule={onSavePayrollSchedule}
        canManagePayrollSettings={canManagePayrollSettings}
        canManagePayrollMaintenance={canManagePayrollMaintenance}
        canManageWorkforce={canManageWorkforce}
        canManagePayrollSources={canManagePayrollSources}
        onPayrollLifecycle={onPayrollLifecycle}
        onSaveCompensationProfile={onSaveWorkerCompensationProfile}
        onSaveRecurringComponent={onSaveRecurringPayrollComponent}
        onSaveWorkEntry={onSavePayrollWorkEntry}
        onSaveAttendance={onSavePayrollAttendance}
        onSaveAttendanceBatch={onSavePayrollAttendanceBatch}
        onSaveLeave={onSavePayrollLeave}
        onSaveOvertime={onSavePayrollOvertime}
        onSaveHoliday={onSavePayrollHoliday}
        onSavePayrollEntry={onSavePayrollEntry}
        onUpdateRun={onUpdatePayrollRun}
        onCreateRun={onCreatePayrollRun}
        onCalculateRun={onCalculatePayrollRun}
        onStagePayrollImport={onStagePayrollImport}
        onSavePayrollImportTemplate={onSavePayrollImportTemplate}
        onCommitPayrollImport={onCommitPayrollImport}
        onPreviewPayrollMaintenance={onPreviewPayrollMaintenance}
        onApplyPayrollMaintenance={onApplyPayrollMaintenance}
        onPreviewFactoryReset={onPreviewFactoryReset}
        onApplyFactoryReset={onApplyFactoryReset}
      />
    );
  }

  // 7. Expenses Route
  if (route.kind === "tab" && activeTab === "expenses") {
    return lazyRoute(
      <ExpensesRoute
        expenses={expenses}
        projects={projects}
        initialProjectId={expenseFormContext || undefined}
        initialExpenseId={expenseCorrectionContext}
        onSave={onSaveExpense}
        onPreviewCorrection={onPreviewExpenseCorrection || (async () => { throw new Error("Expense correction is not available in this workspace."); })}
        onApplyCorrection={onApplyExpenseCorrection || (async () => { throw new Error("Expense correction is not available in this workspace."); })}
        onInitialCorrectionConsumed={onExpenseCorrectionContextConsumed}
      />
    );
  }

  // 8. Reports Route
  if (route.kind === "tab" && activeTab === "reports") {
    return lazyRoute(
      <ReportsRoute
        projects={projects}
        invoices={invoices}
        invoiceAllocations={invoiceProjectAllocations}
        expenses={expenses}
        workers={payrollData.workers}
        assignments={payrollData.assignments}
        periods={payrollData.periods}
        runs={payrollData.runs}
        entries={payrollData.entries}
        payrollAllocations={payrollData.allocations}
        projectLaborAggregates={projectLaborAggregates}
        laborSource={laborSource}
        onExport={onExportReportsWorkbook}
      />
    );
  }

  // 9. Settings Route
  if (route.kind === "tab" && activeTab === "settings") {
    return lazyRoute(<SettingsRoute settings={regionalSettings} onChange={onRegionalSettingsChange} showDeploymentAccessManagement={showDeploymentAccessManagement} />);
  }

  return null;
};

export default AppRouter;
