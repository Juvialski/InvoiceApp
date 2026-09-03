import React, { lazy, Suspense } from "react";
import { financialTransactionIdFromSearch, type AppLocation } from "../../utils/appRouting";
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
  ProjectCostCode,
  ProjectCostSummary,
  ProjectWorkerAssignment,
  PurchaseOrder,
  PurchaseOrderInvoiceMatch,
  PurchaseOrderLine,
  PurchaseOrderReceipt,
  PurchaseOrderStatus,
  RFQ,
  RFQLine,
  RFQStatus,
  Subcontract,
  SubcontractLine,
  SubcontractStatus,
  SupplierQuotation,
  SupplierQuotationLine,
  Vendor,
  WorkEntry,
  Worker,
} from "../../types";
import type { ProjectDashboardViewData } from "../../utils/projectDashboardViewModel";
import type { ProjectLaborCostAggregate, ProjectLaborSource } from "../../utils/projectLaborCostAggregate.ts";
import type { WorkspaceTab } from "../../components/projects/ProjectWorkspace";
import type { ClientBilling, ClientBillingEvent, ClientBillingInput, ClientBillingLineInput, ClientBillingStatus } from "../../lib/clientBilling.ts";
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
import { appRouteTargetForLocation } from "../../utils/appRouteTarget.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";

import { RouteLoadingSkeleton } from "../../components/ui/RouteSkeleton.tsx";

const CashBankingRoute = lazy(() => import("./CashBankingRoute"));
const ProjectsRoute = lazy(() => import("./ProjectsRoute").then(({ ProjectsRoute }) => ({ default: ProjectsRoute })));
const ProcurementRoute = lazy(() => import("./ProcurementRoute"));
const InvoicesRoute = lazy(() => import("./InvoicesRoute"));
const PayrollRoute = lazy(() => import("./PayrollRoute"));
const ExpensesRoute = lazy(() => import("./ExpensesRoute"));
const ReportsRoute = lazy(() => import("./ReportsRoute"));
const SettingsRoute = lazy(() => import("./SettingsRoute"));

const lazyRouteFallback = <RouteLoadingSkeleton />;

function lazyRoute(element: React.ReactNode): React.JSX.Element {
  return <Suspense fallback={lazyRouteFallback}>{element}</Suspense>;
}

export interface AppRouterProps {
  // Navigation State
  route: AppLocation;
  activeTab: AppTab;
  workspaceRouteVisible?: boolean;
  onNavigatePath?: AppNavigate;

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
  clientBillings?: ClientBilling[];
  clientBillingEvents?: ClientBillingEvent[];
  clientBillingLoading?: boolean;
  onSaveClientBilling?: (input: ClientBillingInput, lines: readonly ClientBillingLineInput[]) => Promise<void> | void;
  onTransitionClientBilling?: (id: string, targetStatus: ClientBillingStatus, reason?: string) => Promise<void> | void;
  selectedProject?: Project | null;
  projectSummaries: Record<string, ProjectCostSummary>;
  projectDashboard?: ProjectDashboardViewData;
  costCodes?: readonly ProjectCostCode[];
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
  onSaveCostCode?: (costCode: {
    id?: string;
    projectId: string;
    code: string;
    name: string;
    description?: string;
    approvedBudgetAmount: number;
    forecastAmount?: number;
    status: ProjectCostCode["status"];
  }) => Promise<void> | void;
  onArchiveCostCode?: (costCodeId: string) => Promise<void> | void;
  onReactivateCostCode?: (costCodeId: string) => Promise<void> | void;
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
  canSettleCashTarget?: (targetType: FinancialReconciliationCandidate["targetType"]) => boolean;
  onSaveFinancialAccount?: (account: FinancialAccount) => Promise<FinancialAccount | void> | FinancialAccount | void;
  onDeactivateFinancialAccount?: (account: FinancialAccount, reason: string) => Promise<void> | void;
  onReactivateFinancialAccount?: (account: FinancialAccount, reason: string) => Promise<void> | void;
  onSaveFinancialSnapshot?: (snapshot: FinancialBalanceSnapshot) => Promise<void> | void;
  onSaveFinancialTransaction?: (transaction: FinancialTransaction) => Promise<void> | void;
  onCommitFinancialImport?: (preview: StatementPreview, account: FinancialAccount) => Promise<void> | void;
  onSaveFinancialMatch?: (match: FinancialTransactionMatch, transaction: FinancialTransaction) => Promise<void> | void;
  onSaveFinancialMatchBatch?: (matches: FinancialTransactionMatch[], transaction: FinancialTransaction) => Promise<void> | void;
  onReverseFinancialMatch?: (matchId: string, reason: string) => Promise<void> | void;
  canReverseFinancialMatch?: (match: FinancialTransactionMatch) => boolean;
  onCorrectFinancialTransaction?: (transaction: FinancialTransaction, input: { transactionDate: string; referenceNumber?: string; description: string; direction: FinancialTransaction["direction"]; amount: number }, reason: string) => Promise<void> | void;
  onReverseFinancialTransaction?: (transaction: FinancialTransaction, reason: string) => Promise<void> | void;
  onIgnoreFinancialTransaction?: (transaction: FinancialTransaction, reason: string) => Promise<void> | void;
  onRestoreFinancialTransactionToReview?: (transaction: FinancialTransaction, reason: string) => Promise<void> | void;
  onConfirmFinancialTransfer?: (left: FinancialTransaction, right: FinancialTransaction) => Promise<void> | void;
  onReverseFinancialTransfer?: (left: FinancialTransaction, right: FinancialTransaction, reason: string) => Promise<void> | void;
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
  canManagePayrollImports?: boolean;
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

  // Procurement Data & Handlers
  purchaseOrders?: PurchaseOrder[];
  subcontracts?: Subcontract[];
  receipts?: PurchaseOrderReceipt[];
  vendors?: Vendor[];
  onSavePO?: (
    po: Partial<PurchaseOrder> & { poNumber: string; vendorId: string; projectId: string },
    lines: Array<Partial<PurchaseOrderLine> & { description: string; quantity: number; unitPrice: number }>,
  ) => Promise<void>;
  onTransitionPO?: (id: string, targetStatus: PurchaseOrderStatus, reason?: string) => Promise<void>;
  onDeletePO?: (id: string) => Promise<void>;
  onSaveSubcontract?: (
    subcontract: Partial<Subcontract> & { subcontractNumber: string; vendorId: string; projectId: string; title: string },
    lines: Array<Partial<SubcontractLine> & { description: string; amount: number }>,
  ) => Promise<void>;
  onTransitionSubcontract?: (id: string, targetStatus: SubcontractStatus, reason?: string) => Promise<void>;
  onDeleteSubcontract?: (id: string) => Promise<void>;
  onRecordReceipt?: (
    receipt: Partial<PurchaseOrderReceipt> & { purchaseOrderId: string; receiptNumber: string },
    lines: Array<{ purchaseOrderLineId: string; receivedQuantity: number; notes?: string }>,
  ) => Promise<void>;
  onVoidReceipt?: (receiptId: string, reason: string) => Promise<void>;
  onAddVendor?: (vendor: Partial<Vendor> & { name: string }) => Promise<Vendor>;
  purchaseOrderMatches?: PurchaseOrderInvoiceMatch[];
  onConfirmPurchaseOrderMatch?: (
    poId: string,
    lines: Array<{
      invoiceLineId: string;
      purchaseOrderLineId: string;
      matchedQuantity?: number;
      matchedAmount?: number;
    }>,
    notes?: string,
  ) => Promise<void>;
  onUnmatchPurchaseOrderMatch?: (matchId: string, reason: string) => Promise<void>;
  onOpenPurchaseOrder?: (purchaseOrderId: string) => void;
  rfqs?: RFQ[];
  supplierQuotations?: SupplierQuotation[];
  onSaveRFQ?: (
    rfq: Partial<RFQ> & { rfqNumber: string; title: string },
    lines: Array<Partial<RFQLine> & { description: string; quantity: number }>,
    invitedVendorIds?: string[],
  ) => Promise<void>;
  onTransitionRFQ?: (id: string, targetStatus: RFQStatus, reason?: string) => Promise<void>;
  onDeleteRFQ?: (id: string) => Promise<void>;
  onSaveSupplierQuotation?: (
    quotation: Partial<SupplierQuotation> & { rfqId: string; vendorId: string; quotationNumber: string },
    lines: Array<Partial<SupplierQuotationLine> & { description: string; quantity: number; unitPrice: number }>,
  ) => Promise<void>;
  onSelectSupplierQuotation?: (quotationId: string, reason: string) => Promise<void>;
  onRevertSupplierQuotationSelection?: (rfqId: string, reason: string) => Promise<void>;
  onConvertQuotationToPO?: (quotationId: string, poNumber: string, notes?: string) => Promise<void>;

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
  onNavigatePath,
  dashboardData,
  dashboardProjectId,
  onDashboardProjectChange,
  onDashboardActivityPeriodChange = () => {},
  onDashboardCustomRangeChange,
  onDashboardCurrencyChange = () => {},
  onNavigateTab = (_tab: AppTab) => {},
  projects,
  clientBillings = [],
  clientBillingEvents = [],
  clientBillingLoading = false,
  onSaveClientBilling = async () => {},
  onTransitionClientBilling = async () => {},
  selectedProject,
  projectSummaries,
  projectDashboard,
  costCodes = [],
  purchaseOrders = [],
  subcontracts = [],
  receipts = [],
  vendors = [],
  onSavePO,
  onTransitionPO,
  onDeletePO,
  onSaveSubcontract,
  onTransitionSubcontract,
  onDeleteSubcontract,
  onRecordReceipt,
  onVoidReceipt,
  onAddVendor,
  purchaseOrderMatches = [],
  onConfirmPurchaseOrderMatch,
  onUnmatchPurchaseOrderMatch,
  onOpenPurchaseOrder,
  rfqs = [],
  supplierQuotations = [],
  onSaveRFQ,
  onTransitionRFQ,
  onDeleteRFQ,
  onSaveSupplierQuotation,
  onSelectSupplierQuotation,
  onRevertSupplierQuotationSelection,
  onConvertQuotationToPO,
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
  onSaveCostCode,
  onArchiveCostCode,
  onReactivateCostCode,
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
  canSettleCashTarget,
  onSaveFinancialAccount = () => {},
  onDeactivateFinancialAccount,
  onReactivateFinancialAccount,
  onSaveFinancialSnapshot,
  onSaveFinancialTransaction = () => {},
  onCommitFinancialImport,
  onSaveFinancialMatch,
  onSaveFinancialMatchBatch,
  onReverseFinancialMatch,
  canReverseFinancialMatch,
  onCorrectFinancialTransaction,
  onReverseFinancialTransaction,
  onIgnoreFinancialTransaction,
  onRestoreFinancialTransactionToReview,
  onConfirmFinancialTransfer,
  onReverseFinancialTransfer,
  onOpenCashDashboard,
  payrollData,
  payrollImportData = { costCenters: [], batches: [], rows: [], templates: [] },
  payrollPeriodPreparationState,
  onRetryPayrollPeriodPreparation,
  canManagePayrollSettings = true,
  canManagePayrollMaintenance = true,
  canManageWorkforce = true,
  canManagePayrollSources = true,
  canManagePayrollImports = true,
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

  // `route` is canonical. Do not dispatch from the legacy activeTab prop,
  // which may still describe the previous location for one render after a
  // history transition.
  const routeTarget = appRouteTargetForLocation(route);

  // 1. Single Invoice Verification / Review Workspace Mode
  if (routeTarget === "invoice-workspace" && selectedInvoice) {
    return lazyRoute(
      <InvoicesRoute
        selectedInvoice={selectedInvoice}
        onNavigatePath={onNavigatePath}
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
        purchaseOrders={purchaseOrders}
        purchaseOrderReceipts={receipts}
        purchaseOrderMatches={purchaseOrderMatches}
        onConfirmPurchaseOrderMatch={onConfirmPurchaseOrderMatch}
        onUnmatchPurchaseOrderMatch={onUnmatchPurchaseOrderMatch}
        onOpenPurchaseOrder={onOpenPurchaseOrder}
      />
    );
  }

  // 2. Projects Route (Tab or Project Workspace)
  if (routeTarget === "projects") {
    return lazyRoute(
      <ProjectsRoute
        projects={projects}
        clientBillings={clientBillings}
        clientBillingEvents={clientBillingEvents}
        clientBillingLoading={clientBillingLoading}
        onSaveClientBilling={onSaveClientBilling}
        onTransitionClientBilling={onTransitionClientBilling}
        selectedProject={selectedProject}
        summaries={projectSummaries}
        projectDashboard={projectDashboard}
        costCodes={costCodes}
        invoices={invoices}
        invoiceAllocations={invoiceProjectAllocations}
        expenses={expenses}
        purchaseOrders={purchaseOrders}
        subcontracts={subcontracts}
        receipts={receipts}
        vendors={vendors}
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
        onNavigatePath={onNavigatePath}
        onTabChange={onProjectTabChange}
        onOpenProject={onOpenProject}
        onSaveProject={onSaveProject}
        onPreviewProjectLifecycle={onPreviewProjectLifecycle}
        onApplyProjectLifecycle={onApplyProjectLifecycle}
        onArchiveProject={onArchiveProject}
        onReactivateProject={onReactivateProject}
        onEditProject={onEditProject}
        onSaveCostCode={onSaveCostCode}
        onArchiveCostCode={onArchiveCostCode}
        onReactivateCostCode={onReactivateCostCode}
        onSaveInvoiceAllocations={onSaveInvoiceProjectAllocations}
        onSavePO={onSavePO}
        onTransitionPO={onTransitionPO}
        onDeletePO={onDeletePO}
        onSaveSubcontract={onSaveSubcontract}
        onTransitionSubcontract={onTransitionSubcontract}
        onDeleteSubcontract={onDeleteSubcontract}
        onRecordReceipt={onRecordReceipt}
        onVoidReceipt={onVoidReceipt}
        onAddVendor={onAddVendor}
        rfqs={rfqs}
        supplierQuotations={supplierQuotations}
        onSaveRFQ={onSaveRFQ}
        onTransitionRFQ={onTransitionRFQ}
        onDeleteRFQ={onDeleteRFQ}
        onSaveSupplierQuotation={onSaveSupplierQuotation}
        onSelectSupplierQuotation={onSelectSupplierQuotation}
        onRevertSupplierQuotationSelection={onRevertSupplierQuotationSelection}
        onConvertQuotationToPO={onConvertQuotationToPO}
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
  if (routeTarget === "dashboard") {
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
  if (routeTarget === "cash") {
    return lazyRoute(
      <CashBankingRoute
        data={cashData}
        selectedTransactionId={financialTransactionIdFromSearch(route.search)}
        onNavigatePath={onNavigatePath}
        onSaveAccount={onSaveFinancialAccount}
        onDeactivateAccount={onDeactivateFinancialAccount}
        onSaveSnapshot={onSaveFinancialSnapshot}
        onSaveTransaction={onSaveFinancialTransaction}
        onCommitImport={onCommitFinancialImport}
        onSaveMatch={onSaveFinancialMatch}
        onSaveMatchBatch={onSaveFinancialMatchBatch}
        onReverseMatch={onReverseFinancialMatch}
        canReverseMatch={canReverseFinancialMatch}
        onCorrectTransaction={onCorrectFinancialTransaction}
        onReverseTransaction={onReverseFinancialTransaction}
        onRestoreTransactionToReview={onRestoreFinancialTransactionToReview}
        onIgnoreTransaction={onIgnoreFinancialTransaction}
        onConfirmTransfer={onConfirmFinancialTransfer}
        onReverseTransfer={onReverseFinancialTransfer}
        onReactivateAccount={onReactivateFinancialAccount}
        reconciliationCandidates={cashReconciliationCandidates}
        canManageAccounts={canManageCashAccounts}
        canManageTransactions={canManageCashTransactions}
        canImport={canCashImport}
        canReconcile={canCashReconcile}
        canSettleTarget={canSettleCashTarget}
        onOpenDashboard={onOpenCashDashboard || (onNavigateTab ? () => onNavigateTab("dashboard") : undefined)}
      />
    );
  }

  // 5. Invoices and Related Tabs
  if (
    ["extractor", "inbox", "review", "invoices", "vendors"].includes(routeTarget)
  ) {
    return lazyRoute(
      <InvoicesRoute
        activeSubTab={["extractor", "inbox", "review", "invoices", "vendors"].includes(routeTarget) ? (routeTarget as any) : activeTab}
        onNavigatePath={onNavigatePath}
        invoices={invoices}
        projects={projects}
        costCodes={costCodes as ProjectCostCode[]}
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
        purchaseOrders={purchaseOrders}
        purchaseOrderReceipts={receipts}
        purchaseOrderMatches={purchaseOrderMatches}
        onConfirmPurchaseOrderMatch={onConfirmPurchaseOrderMatch}
        onUnmatchPurchaseOrderMatch={onUnmatchPurchaseOrderMatch}
        onOpenPurchaseOrder={onOpenPurchaseOrder}
      />
    );
  }

  // 6. Payroll Route
  if (routeTarget === "payroll") {
    return lazyRoute(
      <PayrollRoute
        onNavigatePath={onNavigatePath}
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
        costCodes={costCodes as ProjectCostCode[]}
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
        canManagePayrollImports={canManagePayrollImports}
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
  if (routeTarget === "expenses") {
    return lazyRoute(
      <ExpensesRoute
        expenses={expenses}
        projects={projects}
        costCodes={costCodes as ProjectCostCode[]}
        initialProjectId={expenseFormContext || undefined}
        initialExpenseId={expenseCorrectionContext}
        onSave={onSaveExpense}
        onPreviewCorrection={onPreviewExpenseCorrection || (async () => { throw new Error("Expense correction is not available in this workspace."); })}
        onApplyCorrection={onApplyExpenseCorrection || (async () => { throw new Error("Expense correction is not available in this workspace."); })}
        onInitialCorrectionConsumed={onExpenseCorrectionContextConsumed}
      />
    );
  }

  // 8. Procurement Route (P2A)
  if (routeTarget === "procurement") {
    return lazyRoute(
      <ProcurementRoute
        purchaseOrders={purchaseOrders}
        subcontracts={subcontracts}
        receipts={receipts}
        projects={projects}
        vendors={vendors}
        costCodes={costCodes as ProjectCostCode[]}
        onSavePO={onSavePO || (async () => {})}
        onTransitionPO={onTransitionPO || (async () => {})}
        onDeletePO={onDeletePO || (async () => {})}
        onSaveSubcontract={onSaveSubcontract}
        onTransitionSubcontract={onTransitionSubcontract}
        onDeleteSubcontract={onDeleteSubcontract}
        onRecordReceipt={onRecordReceipt}
        onVoidReceipt={onVoidReceipt}
        onAddVendor={onAddVendor}
        matches={purchaseOrderMatches}
        invoices={invoices}
        rfqs={rfqs}
        supplierQuotations={supplierQuotations}
        onSaveRFQ={onSaveRFQ}
        onTransitionRFQ={onTransitionRFQ}
        onDeleteRFQ={onDeleteRFQ}
        onSaveSupplierQuotation={onSaveSupplierQuotation}
        onSelectSupplierQuotation={onSelectSupplierQuotation}
        onRevertSupplierQuotationSelection={onRevertSupplierQuotationSelection}
        onConvertQuotationToPO={onConvertQuotationToPO}
        onOpenInvoice={(id) => onNavigatePath?.(`/invoices/${id}`)}
      />
    );
  }

  // 9. Reports Route
  if (routeTarget === "reports") {
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
  if (routeTarget === "settings") {
    return lazyRoute(<SettingsRoute settings={regionalSettings} onChange={onRegionalSettingsChange} showDeploymentAccessManagement={showDeploymentAccessManagement} />);
  }

  return null;
};

export default AppRouter;
