import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { Header, AppTab } from "./components/Header";
import { AccessDenied, NoCompanyAccess } from "./components/access/AccessStates.tsx";
import { AuthScreen } from "./components/auth";
import { BRAND, formatPageTitle } from "./config/brand";
import type { ExtractPayload } from "./components/UploadZone";
import type { SaveState } from "./components/VerificationWorkspace";
import { AppShell } from "./app/AppShell";
import { AppRouter } from "./app/routes/AppRouter";
import { appPathForAttendanceDate, appPathForInvoice, appPathForPayrollPeriod, appPathForProject, appPathForReviewInvoice, appPathForTab, appPathFromLocation, appTabForLocation, attendanceDateFromSearch, parseAppLocation, payrollPeriodIdFromSearch, payrollRunIdFromSearch, type AppLocation, type ProjectWorkspaceView } from "./utils/appRouting";
import { DEFAULT_ROUTE_PATH, ROUTE_DEFINITIONS, type RouteId } from "./utils/routes";
import { canAccessAppTab, defaultAppTabForPermissions, hasAllPermissions, hasAnyPermission, hasPermission, PERMISSION_KEYS, permittedAppTabs, requiredPermissionForAppTab } from "./utils/accessControl";
import { Department, EmailClassification, Expense, GmailConnectionInfo, GmailImportedMessage, GmailMessageCandidate, GmailScanWindow, InvoiceData, InvoiceProjectAllocation, PayrollEntry, PayrollPeriod, PayrollProjectAllocation, PayrollRun, Project, ProjectCostCode, ProjectCostSummary, ProjectWorkerAssignment, PurchaseOrder, PurchaseOrderInvoiceMatch, PurchaseOrderLine, PurchaseOrderReceipt, PurchaseOrderStatus, RFQ, RFQLine, RFQStatus, Subcontract, SubcontractLine, SubcontractStatus, SupplierQuotation, SupplierQuotationLine, Vendor, Worker, WorkEntry } from "./types";
import type { AttendanceRecord, EntityResolutionResult, LeaveRequest, OvertimeRequest, PayrollHoliday, SourceType } from "./types";
import { applyLocalChecks, findExistingInvoiceForSourcePayload, findPossibleDuplicate } from "./utils/invoiceLogic";
import { nextPendingReviewInvoiceId, nextReviewInvoiceId, orderedReviewQueue } from "./utils/reviewQueue";
import { readAndCleanLocalInvoices } from "./utils/demoCleanup";
import { enqueueSerializedSave } from "./utils/saveSequencing";
import { currencySymbolFor, DEFAULT_CURRENCY, loadRegionalSettings, RegionalSettings, setRegionalSettings as setActiveRegionalSettings } from "./config/regional";
import { calculateProjectCost } from "./utils/projectCosting";
import { projectCostDataCompleteness, type DataSourceState } from "./utils/dataCompleteness.ts";
import { ProjectLaborAggregateDataError, projectLaborAggregateCurrencyConflicts, type ProjectLaborCostAggregate, type ProjectLaborSource } from "./utils/projectLaborCostAggregate.ts";
import type { DashboardActivityPeriod } from "./components/engineering/EngineeringCostOperationsDashboard";
import { buildDashboardViewData } from "./utils/dashboardViewModel";
import { buildProjectDashboardViewData } from "./utils/projectDashboardViewModel";
import { calculatePayrollRunFromWorkEntries } from "./lib/payrollCalculation";
import { transitionLeaveRequest } from "./lib/payrollWorkforce";
import { buildAutomaticPayrollDraft, createDefaultPayrollSchedule, dateOnly, ensurePayrollPeriodsAndRuns, payrollDraftToRecords, analyzePayrollScheduleBootstrapCompatibility } from "./lib/payrollWorkflow";
import { useCompanyAccess } from "./context/CompanyAccessContext.tsx";
import { companyApiRequest } from "./lib/companyApi.ts";
import type { PayrollSchedule } from "./lib/payrollSchedule";
import type { RecurringPayrollComponent, WorkerCompensationProfile } from "./lib/payrollAutomation";
import { captureGoogleProviderTokens, connectGoogleAndGmail, getGoogleProviderToken, isSupabaseConfigured, supabase } from "./lib/supabase";
import { classifyEmailIntakeCandidate, scanConnectedMailbox, syncConnectedMailbox } from "./lib/emailIntake";
import {
  applyInvoiceCorrectionInSupabase,
  confirmPurchaseOrderMatch,
  convertQuotationToDraftPO,
  deleteDraftPurchaseOrder,
  deleteDraftRFQ,
  deleteDraftSubcontract,
  ensureWorkspaceProfile,
  fetchPurchaseOrderMatches,
  fetchPurchaseOrderReceipts,
  fetchPurchaseOrders,
  fetchRFQs,
  fetchSubcontracts,
  fetchSupplierQuotations,
  fetchVendors,
  findExistingInvoiceBySource,
  loadGmailSyncState,
  loadInvoicesFromSupabase,
  listCompanyVendors,
  listEmailIntakeProfiles,
  loadSourcePayloadForRetry,
  markEmailClassification,
  markSourceDocumentStatus,
  persistNewInvoice,
  persistExtractionAttempt,
  previewInvoiceCorrectionInSupabase,
  readPurchaseOrderMatchesFromLocal,
  readPurchaseOrderReceiptsFromLocal,
  readPurchaseOrdersFromLocal,
  readRFQsFromLocal,
  readSubcontractsFromLocal,
  readSupplierQuotationsFromLocal,
  readVendorsFromLocal,
  recordPurchaseOrderReceipt,
  revertSupplierQuotationSelection,
  saveGmailMessageSource,
  saveGmailSyncState,
  saveManualEmailRecord,
  saveManualSourceDocument,
  savePurchaseOrder,
  saveRFQ,
  saveSubcontract,
  saveSupplierQuotation,
  saveVendor,
  selectSupplierQuotation,
  transitionPurchaseOrderStatus,
  transitionRFQStatus,
  transitionSubcontract,
  unmatchPurchaseOrderMatch,
  updateInvoiceInSupabase,
  voidPurchaseOrderReceipt,
  writePurchaseOrderMatchesToLocal,
  writePurchaseOrderReceiptsToLocal,
  writePurchaseOrdersToLocal,
  writeRFQsToLocal,
  writeSubcontractsToLocal,
  writeSupplierQuotationsToLocal,
  writeVendorsToLocal,
} from "./lib/persistence";
import {
  loadInvoiceProjectAllocationsFromSupabase,
  loadProjectsFromSupabase,
  loadProjectLaborCostAggregatesFromSupabase,
  readInvoiceProjectAllocationsFromLocal,
  replaceInvoiceProjectAllocationsOnSupabase,
  writeInvoiceProjectAllocationsToLocal,
} from "./lib/projects";
import {
  appendClientBillingEvent,
  applyLocalClientBillingTransition,
  buildLocalClientBilling,
  loadClientBillingWorkspaceFromSupabase,
  readClientBillingsFromLocal,
  readClientBillingEventsFromLocal,
  saveClientBillingToSupabase,
  transitionClientBillingToSupabase,
  type ClientBilling,
  type ClientBillingEvent,
  type ClientBillingInput,
  type ClientBillingLineInput,
  type ClientBillingStatus,
  type ClientBillingWorkspaceData,
  upsertClientBilling,
  writeClientBillingWorkspaceToLocal,
} from "./lib/clientBilling.ts";
import {
  appendClientCollectionEvent,
  applyLocalClientCollectionRecord,
  applyLocalClientCollectionReversal,
  buildLocalClientCollection,
  loadClientCollectionWorkspaceFromSupabase,
  readClientCollectionEventsFromLocal,
  readClientCollectionsFromLocal,
  recordClientCollectionToSupabase,
  reverseClientCollectionToSupabase,
  saveClientCollectionToSupabase,
  type ClientCollectionAllocationInput,
  type ClientCollectionInput,
  type ClientCollectionWorkspaceData,
  upsertClientCollection,
  writeClientCollectionWorkspaceToLocal,
} from "./lib/clientCollections.ts";
import {
  archiveProjectCostCodeInSupabase,
  loadProjectCostCodesFromSupabase,
  reactivateProjectCostCodeInSupabase,
  readProjectCostCodesFromLocal,
  saveProjectCostCodeToSupabase,
  writeProjectCostCodesToLocal,
} from "./lib/projectCostCodes";
import { applyExpenseCorrectionInSupabase, createLocalExpense, loadExpensesFromSupabase, previewExpenseCorrectionInSupabase, readExpensesFromLocal, saveExpenseToSupabase, writeExpensesToLocal } from "./lib/expenses";
import { buildLocalExpenseCorrectionPreview, buildLocalInvoiceCorrectionPreview, type FinancialCorrectionAction, type FinancialCorrectionPreview, type FinancialCorrectionResult } from "./lib/financialLifecycle.ts";
import { applyPayrollLifecycleToSupabase, canTransitionPayrollRun, deletePayrollPeriodToSupabase, deletePayrollRunToSupabase, emptyPayrollWorkspaceData, loadPayrollWorkspaceFromSupabase, PayrollWorkspaceData, previewWorkerLifecycleToSupabase, readPayrollWorkspaceFromLocal, replacePayrollRunEntriesToSupabase, saveAssignmentToSupabase, saveAttendanceRecordToSupabase, saveAttendanceRecordsToSupabase, saveDepartmentToSupabase, saveLeaveRequestToSupabase, saveOvertimeRequestToSupabase, savePayrollEntryToSupabase, savePayrollHolidayToSupabase, savePayrollPeriodToSupabase, savePayrollRunToSupabase, savePayrollScheduleToSupabase, saveRecurringPayrollComponentToSupabase, saveWorkerCompensationProfileToSupabase, saveWorkEntryToSupabase, saveWorkerToSupabase, validatePayrollAllocations, validatePayrollRunApproval, writePayrollWorkspaceToLocal } from "./lib/payroll";
import { assignmentForLifecycle, componentForLifecycle, profileForLifecycle, type PayrollLifecycleRequest, workerForLifecycle, workerDependencySummary } from "./lib/payrollLifecycle";
import { isSafeToDeletePayrollPeriod, isSafeToDeletePayrollRun, selectPrimaryPayrollSchedule } from "./lib/payrollIntegrity";
  import { applyPayrollMaintenance as applyPayrollMaintenanceRpc, applyPayrollWorkspaceReset as applyPayrollWorkspaceResetRpc, localMaintenanceResult, planLocalPayrollMaintenance, previewPayrollMaintenance as previewPayrollMaintenanceRpc, previewPayrollWorkspaceReset as previewPayrollWorkspaceResetRpc, assertPayrollWorkspaceResetConfirmation, type PayrollMaintenanceAction, type PayrollMaintenancePreview, type PayrollWorkspaceResetPreview } from "./lib/payrollMaintenance";
import { commitPayrollImportToSupabase, findDuplicatePayrollImportBatches, loadPayrollImportWorkspaceFromSupabase, readPayrollImportWorkspaceFromLocal, savePayrollImportBatchToSupabase, savePayrollImportRowsToSupabase, savePayrollImportTemplateToSupabase, uploadPayrollImportSourceToSupabase, writePayrollImportWorkspaceToLocal, type PayrollImportBatch, type PayrollImportRow, type PayrollImportTemplate, type PayrollImportWorkspaceData } from "./lib/payrollImportPersistence";
import { fingerprintPayrollSources, validatePayrollRunSourceRevision } from "./lib/payrollSourceRevision";
import type { StagedPayrollImport } from "./lib/payrollImportWorkflow";
import { canApplyWorkspaceLoad, decideRemoteInvoiceRefresh, resolveEntityById, shouldPersistGuestWorkspace } from "./utils/remoteConflict";
import { createBrowserWorkspaceSyncEnvironment, createWorkspaceLoadCache, createWorkspaceSyncController, createWorkspaceSyncInstrumentation, type WorkspaceRefreshGroup, type WorkspaceSyncController, type WorkspaceSyncStatus } from "./lib/workspaceSync";
import { replaceInvoiceProjectAllocationsLocally } from "./utils/projectAllocations";
import { AssistantProvider } from "./assistant/AssistantProvider";
import { safeErrorMessage } from "./utils/errorNormalization.ts";
import {
  commitStatementPreviewToWorkspace,
  createFinancialMatch,
  financialId,
  isManualTransactionCorrectionEligible,
  reconciliationStatusForTransaction,
  type CashBankingWorkspaceData,
  type FinancialAccount,
  type FinancialBalanceSnapshot,
  type FinancialReconciliationCandidate,
  type FinancialTransaction,
  type FinancialTransactionMatch,
  type StatementPreview,
} from "./lib/cashBanking.ts";
import {
  confirmFinancialTransferToSupabase,
  confirmFinancialSettlementBatchToSupabase,
  commitFinancialImportToSupabase,
  correctFinancialTransactionInSupabase,
  deactivateFinancialAccountInSupabase,
  emptyCashBankingWorkspaceData,
  loadCashBankingWorkspaceFromSupabase,
  readCashBankingWorkspaceFromLocal,
  saveFinancialAccountToSupabase,
  saveFinancialBalanceSnapshotToSupabase,
  saveFinancialTransactionMatchToSupabase,
  saveFinancialTransactionToSupabase,
  ignoreFinancialTransactionInSupabase,
  reactivateFinancialAccountInSupabase,
  restoreFinancialTransactionToReviewInSupabase,
  reverseFinancialTransactionInSupabase,
  reverseFinancialTransferInSupabase,
  writeCashBankingWorkspaceToLocal,
} from "./lib/cashBankingPersistence.ts";
import { reverseFinancialSettlement } from "./lib/financialSettlementPersistence.ts";
import {
  extractVendorEvidenceFromInvoice,
  resolveBatchVendors,
  resolveVendorCandidate,
} from "./lib/entityResolution.ts";
import { useProjectController } from "./features/projects/useProjectController.ts";

function revisePayrollSourcePeriods(
  periods: PayrollPeriod[],
  options: { periodIds?: ReadonlySet<string>; startDate?: string; endDate?: string; allOpen?: boolean },
) {
  const startDate = options.startDate || options.endDate;
  const endDate = options.endDate || options.startDate;
  const changedAt = new Date().toISOString();
  return periods.map((period) => {
    const overlaps = Boolean(startDate && endDate && period.periodStart <= endDate! && period.periodEnd >= startDate!);
    const affected = options.allOpen || Boolean(options.periodIds?.has(period.id)) || overlaps;
    if (!affected || ["APPROVED", "PAID", "VOID"].includes(period.status)) return period;
    return {
      ...period,
      sourceRevision: (period.sourceRevision || 0) + 1,
      sourceRevisionUpdatedAt: changedAt,
      updatedAt: changedAt,
    };
  });
}

function sourceInputForPayroll(
  period: PayrollPeriod,
  data: PayrollWorkspaceData,
  projects?: Project[],
) {
  return {
    period,
    workers: data.workers,
    attendanceRecords: data.attendanceRecords || [],
    leaveRequests: data.leaveRequests || [],
    overtimeRequests: data.overtimeRequests || [],
    holidays: data.holidays || [],
    workEntries: data.workEntries,
    compensationProfiles: data.compensationProfiles || [],
    assignments: data.assignments,
    recurringComponents: data.recurringComponents || [],
    projects: projects || [],
  };
}

function prepareStoredInvoice(invoice: InvoiceData): InvoiceData {
  const sourceType = invoice.sourceType || (invoice.id?.startsWith("sample") ? "SAMPLE" : "UPLOAD");
  const currency = invoice.currency || (sourceType === "SAMPLE" ? DEFAULT_CURRENCY : "");
  return applyLocalChecks({
    ...invoice,
    sourceType,
    currency,
    currencySymbol: invoice.currencySymbol || (currency ? currencySymbolFor(currency) : undefined),
    processingStatus: invoice.processingStatus || "EXTRACTED",
    duplicateStatus: invoice.duplicateStatus || "UNIQUE",
  });
}

function localFallbackInvoices() {
  const saved = readAndCleanLocalInvoices(typeof localStorage === "undefined" ? undefined : localStorage);
  return saved.map(prepareStoredInvoice);
}

function fileToBase64(file: File): Promise<{ fileData: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ fileData: result.split(",")[1], mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png") });
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function isExtractableAttachment(mimeType: string, filename: string) {
  const normalizedMime = String(mimeType || "").trim().toLowerCase();
  const normalizedFilename = String(filename || "").trim().toLowerCase();
  if (normalizedMime === "image/svg+xml" || normalizedFilename.endsWith(".svg")) {
    return false;
  }
  return (
    normalizedMime === "application/pdf" ||
    (normalizedMime.startsWith("image/") && !normalizedMime.includes("svg")) ||
    /\.(pdf|png|jpe?g|webp)$/i.test(normalizedFilename)
  );
}

function gmailQueryDate(value: string, exclusive = false) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value.replaceAll("-", "/");
  if (exclusive) parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10).replaceAll("-", "/");
}

function valueAtPath(value: any, path: string) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function withPathValue<T extends Record<string, any>>(source: T, path: string, value: unknown): T {
  const next: any = { ...source };
  const parts = path.split(".");
  let cursor = next;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    cursor[key] = { ...(cursor[key] || {}) };
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
  return next;
}

function textToBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  return btoa(binary);
}

function userFacingError(error: unknown, fallback: string) {
  const message = safeErrorMessage(error, fallback);
  if (import.meta.env.DEV && message) console.error(`[${BRAND.productName}]`, error);
  if (/AI backend configuration is incomplete|AI is not configured for this company|AI is disabled for this company|configured Gemini API key is invalid|Gemini quota or rate limit reached|Gemini is temporarily unavailable|configured Gemini model is unavailable|Gemini access is denied|configured Gemini project does not have access|The server could not reach Gemini|Gemini rejected the assistant request configuration|The AI request timed out/i.test(message)) return message;
  if (/record\s+["']?new["']?\s+has no field|project_id|default_project_id|row-level security|foreign key/i.test(message)) return fallback;
  return /gemini|supabase|storage|api[_ -]?key|provider|model/i.test(message) ? fallback : (message || fallback);
}

type PayrollWorkspaceLoadState = "idle" | "loading" | "loaded" | "failed";
type PayrollPeriodPreparationState = "NO_SCHEDULE" | "PREPARING" | "SYNCING" | "READY" | "WAITING_FOR_BOUNDARY" | "FAILED";
type ProjectCostDomainLoadState = "not-loaded" | "loading" | "loaded" | "failed";
type ProjectLaborAggregateLoadState = "not-loaded" | "loading" | "available" | "incomplete" | "currency-conflict" | "unavailable";

function initialAppLocation(): AppLocation {
  if (typeof window === "undefined") return parseAppLocation(DEFAULT_ROUTE_PATH);
  return parseAppLocation(window.location.pathname, window.location.search);
}

function extractionSourceType(value: SourceType | undefined): ExtractPayload["sourceType"] {
  return value === "UPLOAD" || value === "PASTED_TEXT" || value === "EMAIL" ? value : undefined;
}

function InvoiceWorkspace() {
  const companyAccess = useCompanyAccess();
  const [invoices, setInvoices] = useState<InvoiceData[]>(() => isSupabaseConfigured ? [] : localFallbackInvoices());
  const invoicesRef = useRef(invoices);
  const selectedInvoiceRef = useRef<InvoiceData | null>(null);
  const lastPersistedRef = useRef(new Map<string, InvoiceData>());
  const updateTimersRef = useRef(new Map<string, number>());
  const editRevisionRef = useRef(new Map<string, number>());
  const sourcePayloadsRef = useRef(new Map<string, ExtractPayload>());
  const retryingInvoiceRef = useRef<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [reviewSessionIds, setReviewSessionIds] = useState<string[]>([]);
  const [reviewCompletion, setReviewCompletion] = useState<{ verifiedCount: number; totalCount: number; newItems: number } | null>(null);
  const [workspaceOrigin, setWorkspaceOrigin] = useState<AppTab>("dashboard");
  const [route, setRoute] = useState<AppLocation>(initialAppLocation);
  // Route is the single source of truth. Deriving the tab during render keeps
  // the content dispatcher in sync with history without a blank/old-page
  // intermediate render while an effect catches up.
  const activeTab = appTabForLocation(route);
  const [dashboardActivityPeriod, setDashboardActivityPeriod] = useState<DashboardActivityPeriod>("MONTH");
  const [dashboardCustomStart, setDashboardCustomStart] = useState("");
  const [dashboardCustomEnd, setDashboardCustomEnd] = useState("");
  const [dashboardCurrency, setDashboardCurrency] = useState("");
  const [dashboardProjectId, setDashboardProjectId] = useState("");
  const [workspaceReturnPath, setWorkspaceReturnPath] = useState<string>(appPathForTab(appTabForLocation(initialAppLocation())));
  const routeSignatureRef = useRef("");
  const [processingCount, setProcessingCount] = useState(0);
  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const {
    session,
    authResolved,
    guestMode: guestModeState,
    access,
    activeCompany,
    activeCompanyId,
    permissions,
    can,
    refreshAccess,
    enterGuestMode,
    signOut: signOutFromAccess,
  } = companyAccess;
  const sessionRef = useRef<Session | null>(session);
  sessionRef.current = session;
  const assistantIdentityRef = useRef(`${activeCompanyId || ""}:${session?.user?.id || ""}`);
  const [assistantCompanyGeneration, setAssistantCompanyGeneration] = useState(0);
  useEffect(() => {
    const identity = `${activeCompanyId || ""}:${session?.user?.id || ""}`;
    if (assistantIdentityRef.current === identity) return;
    assistantIdentityRef.current = identity;
    setAssistantCompanyGeneration((generation) => generation + 1);
  }, [activeCompanyId, session?.user?.id]);
  const workspaceGenerationRef = useRef(0);
  const [workspaceLoading, setWorkspaceLoading] = useState(isSupabaseConfigured);
  const guestModeRef = useRef(guestModeState);
  guestModeRef.current = guestModeState;
  const [syncState, setSyncState] = useState<{ lastHistoryId?: string; lastSyncedAt?: string }>({});
  const [regionalSettings, setRegionalSettingsState] = useState<RegionalSettings>(loadRegionalSettings);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const saveStateRef = useRef<SaveState>("saved");
  const [remoteInvoiceUpdate, setRemoteInvoiceUpdate] = useState<{ invoiceId: string; invoice: InvoiceData } | null>(null);
  const remoteInvoiceRemovedRef = useRef(new Set<string>());
  const remoteInvoiceUpdatesRef = useRef(new Map<string, InvoiceData>());
  const [retryingInvoiceId, setRetryingInvoiceId] = useState<string | null>(null);
  const savePromisesRef = useRef(new Map<string, Promise<unknown>>());
  const [payrollImportData, setPayrollImportData] = useState<PayrollImportWorkspaceData>(() => isSupabaseConfigured ? { costCenters: [], batches: [], rows: [], templates: [] } : readPayrollImportWorkspaceFromLocal());
  const [invoiceProjectAllocations, setInvoiceProjectAllocations] = useState<InvoiceProjectAllocation[]>(() => isSupabaseConfigured ? [] : readInvoiceProjectAllocationsFromLocal());
  const [clientBillingData, setClientBillingData] = useState<ClientBillingWorkspaceData>(() => isSupabaseConfigured ? { billings: [], events: [] } : { billings: readClientBillingsFromLocal(), events: readClientBillingEventsFromLocal() });
  const [clientCollectionData, setClientCollectionData] = useState<ClientCollectionWorkspaceData>(() => isSupabaseConfigured ? { collections: [], events: [] } : { collections: readClientCollectionsFromLocal(), events: readClientCollectionEventsFromLocal() });
  const [expenses, setExpenses] = useState<Expense[]>(() => isSupabaseConfigured ? [] : readExpensesFromLocal());
  const [costCodes, setCostCodes] = useState<ProjectCostCode[]>(() => isSupabaseConfigured ? [] : readProjectCostCodesFromLocal());
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => isSupabaseConfigured ? [] : readPurchaseOrdersFromLocal());
  const [subcontracts, setSubcontracts] = useState<Subcontract[]>(() => isSupabaseConfigured ? [] : readSubcontractsFromLocal());
  const [purchaseOrderReceipts, setPurchaseOrderReceipts] = useState<PurchaseOrderReceipt[]>(() => isSupabaseConfigured ? [] : readPurchaseOrderReceiptsFromLocal());
  const [purchaseOrderMatches, setPurchaseOrderMatches] = useState<PurchaseOrderInvoiceMatch[]>(() => isSupabaseConfigured ? [] : readPurchaseOrderMatchesFromLocal());
  const [rfqs, setRfqs] = useState<RFQ[]>(() => isSupabaseConfigured ? [] : readRFQsFromLocal());
  const [supplierQuotations, setSupplierQuotations] = useState<SupplierQuotation[]>(() => isSupabaseConfigured ? [] : readSupplierQuotationsFromLocal());
  const [vendors, setVendors] = useState<Vendor[]>(() => isSupabaseConfigured ? [] : readVendorsFromLocal());
  const [projectLaborAggregates, setProjectLaborAggregates] = useState<ProjectLaborCostAggregate[]>([]);
  const [projectCostDomainLoadState, setProjectCostDomainLoadState] = useState<ProjectCostDomainLoadState>(isSupabaseConfigured ? "not-loaded" : "loaded");
  const [projectLaborAggregateLoadState, setProjectLaborAggregateLoadState] = useState<ProjectLaborAggregateLoadState>(isSupabaseConfigured ? "not-loaded" : "unavailable");
  const [payrollData, setPayrollData] = useState<PayrollWorkspaceData>(() => isSupabaseConfigured ? emptyPayrollWorkspaceData() : readPayrollWorkspaceFromLocal());
  const payrollDataRef = useRef<PayrollWorkspaceData>(payrollData);
  const [cashData, setCashData] = useState<CashBankingWorkspaceData>(() => isSupabaseConfigured ? emptyCashBankingWorkspaceData() : readCashBankingWorkspaceFromLocal());
  const cashDataRef = useRef<CashBankingWorkspaceData>(cashData);
  const payrollAutomationKeyRef = useRef("");
  const payrollScheduleSignature = payrollData.schedules.map((schedule) => `${schedule.id}:${schedule.frequency}:${schedule.updatedAt || ""}`).join("|");
  const [payrollWorkspaceLoadState, setPayrollWorkspaceLoadState] = useState<PayrollWorkspaceLoadState>(isSupabaseConfigured ? "loading" : "loaded");
  const [payrollRefreshing, setPayrollRefreshing] = useState(false);
  const [payrollPeriodPreparationState, setPayrollPeriodPreparationState] = useState<PayrollPeriodPreparationState>(isSupabaseConfigured ? "PREPARING" : "READY");
  const [payrollGenerationRetry, setPayrollGenerationRetry] = useState(0);
  const payrollBootstrapInFlightRef = useRef<Promise<void> | null>(null);
  const payrollBootstrapPersistedUsersRef = useRef(new Set<string>());
  const payrollRepairInFlightRef = useRef<Promise<void> | null>(null);
  const payrollCalendarPersistInFlightRef = useRef<Promise<void> | null>(null);
  const [workspaceSyncStatus, setWorkspaceSyncStatus] = useState<WorkspaceSyncStatus>(isSupabaseConfigured ? "connecting" : "guest");
  const workspaceSyncControllerRef = useRef<WorkspaceSyncController | null>(null);
  const initialWorkspaceLoadRef = useRef<Promise<void> | null>(null);
  const workspaceRefreshFailureRef = useRef<string | null>(null);
  const workspaceLoadCacheRef = useRef(createWorkspaceLoadCache<unknown>({ maxEntries: 32, staleAfterMs: 30_000 }));
  const workspaceInstrumentationRef = useRef(createWorkspaceSyncInstrumentation());
  const workspaceIdentityRef = useRef<{ userId: string | null; companyId: string | null }>({ userId: null, companyId: null });
  const updateSaveState = (nextState: SaveState) => {
    saveStateRef.current = nextState;
    setSaveState(nextState);
  };
  const navigateToPath = (path: string, replace = false) => {
    const nextPath = path.startsWith("/") ? path : `/${path}`;
    const [pathname, query = ""] = nextPath.split("?", 2);
    const nextSearch = query ? `?${query}` : "";
    const currentPath = typeof window === "undefined" ? "" : appPathFromLocation(window.location);
    if (typeof window !== "undefined" && currentPath !== `${pathname}${nextSearch}`) {
      const method = replace ? "replaceState" : "pushState";
      window.history[method]({}, "", `${pathname}${nextSearch}`);
    }
    setRoute(parseAppLocation(pathname, nextSearch));
  };

  const setActiveTab = (tab: AppTab) => navigateToPath(appPathForTab(tab));

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onPopState = () => setRoute(parseAppLocation(window.location.pathname, window.location.search));
    window.addEventListener("popstate", onPopState);
    if (window.location.pathname === "/") {
      window.history.replaceState({}, "", DEFAULT_ROUTE_PATH);
      setRoute(parseAppLocation(DEFAULT_ROUTE_PATH));
    }
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      const tabLabel = route.kind === "tab" ? ROUTE_DEFINITIONS.find((candidate) => candidate.appTab === route.tab)?.label : undefined;
      document.title = formatPageTitle(tabLabel);
    }
    const signature = `${route.kind}:${route.pathname}${route.search}`;
    if (routeSignatureRef.current === signature) return;
    routeSignatureRef.current = signature;
    if (route.kind === "invoice" || route.kind === "review-invoice") {
      const fallback = route.kind === "review-invoice" ? appPathForTab("review") : appPathForTab("invoices");
      const returnPath = route.returnTo || fallback;
      setWorkspaceReturnPath(returnPath);
      setWorkspaceOrigin(appTabForLocation(parseAppLocation(returnPath)));
      setReviewCompletion(null);
      if (route.kind === "invoice") setReviewSessionIds([]);
    } else if (route.kind !== "unknown") {
      setWorkspaceReturnPath(appPathForTab(route.tab));
      setWorkspaceOrigin(route.tab);
    }
  }, [route]);

  useEffect(() => {
    if (!isSupabaseConfigured || !session || access.status !== "ready" || !activeCompanyId) return;
    if (canAccessAppTab(route.tab, permissions)) return;
    const fallback = appPathForTab(defaultAppTabForPermissions(permissions));
    if (`${route.pathname}${route.search}` !== fallback) navigateToPath(fallback, true);
  }, [access.status, activeCompanyId, permissions, route, session]);

  useEffect(() => {
    const invoiceRoute = route.kind === "invoice" || route.kind === "review-invoice" ? route : null;
    if (invoiceRoute) {
      const resolved = resolveEntityById(invoices, invoiceRoute.invoiceId);
      setSelectedInvoice(resolved);
      if (invoiceRoute.kind === "review-invoice" && !reviewSessionIds.length && !workspaceLoading) {
        const ids = invoices.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW" && !invoice.archivedAt && invoice.lifecycleStatus !== "VOID").map((invoice) => invoice.id);
        setReviewSessionIds(ids.includes(invoiceRoute.invoiceId) ? ids : [invoiceRoute.invoiceId, ...ids]);
      }
      return;
    }
    setSelectedInvoice(null);
    setReviewSessionIds([]);
  }, [route, invoices, reviewSessionIds.length, workspaceLoading]);

  const [expenseFormContext, setExpenseFormContext] = useState<string | null>(null);
  const [expenseCorrectionContext, setExpenseCorrectionContext] = useState<string | null>(null);
  const [uploadProjectContextId, setUploadProjectContextId] = useState<string | null>(null);
  const setGuestMode = (enabled: boolean) => {
    guestModeRef.current = enabled;
    if (enabled) enterGuestMode();
  };

  const showNotification = (type: "success" | "error" | "info", message: string) => {
    setNotification({ type, message });
    const duration = type === "success" ? 3500 : type === "info" ? 9000 : 0;
    if (duration > 0) window.setTimeout(() => setNotification((current) => current?.message === message ? null : current), duration);
  };

  const handleBatchExportExcel = async () => {
    try {
      const { exportBatchInvoicesToExcel } = await import("./utils/excelExport.ts");
      exportBatchInvoicesToExcel(invoicesRef.current);
    } catch (error: unknown) {
      showNotification("error", userFacingError(error, "Could not export invoices to Excel."));
    }
  };

  const projectController = useProjectController({
    authenticated: Boolean(session && supabase && !guestModeState),
    persistGuestWorkspace: shouldPersistGuestWorkspace(authResolved, session?.user?.id) && guestModeState,
    routeProjectId: route.kind === "project" ? route.projectId : undefined,
    navigateToPath,
    projectPath: (projectId) => appPathForProject(projectId),
    projectsPath: () => appPathForTab("projects"),
    onPayrollRelevantChange: () => {
      setPayrollData((current) => {
        const next = { ...current, periods: revisePayrollSourcePeriods(current.periods, { allOpen: true }) };
        payrollDataRef.current = next;
        return next;
      });
    },
    onSuccess: (message) => showNotification("success", message),
    onError: (error, fallback) => showNotification("error", userFacingError(error, fallback)),
    remoteWorkspaceConfigured: isSupabaseConfigured,
  });
  const {
    projects,
    selectedProject,
    projectFormSeed,
  } = projectController;

  const clearWorkspaceState = () => {
    invoicesRef.current = [];
    setInvoices([]);
    setSelectedInvoice(null);
    setReviewSessionIds([]);
    setReviewCompletion(null);
    lastPersistedRef.current.clear();
    remoteInvoiceRemovedRef.current.clear();
    remoteInvoiceUpdatesRef.current.clear();
    setRemoteInvoiceUpdate(null);
    projectController.reset();
    setInvoiceProjectAllocations([]);
    setClientBillingData({ billings: [], events: [] });
    setExpenses([]);
    setCostCodes([]);
    setExpenseCorrectionContext(null);
    setProjectLaborAggregates([]);
    setProjectCostDomainLoadState(isSupabaseConfigured ? "not-loaded" : "loaded");
    setProjectLaborAggregateLoadState(isSupabaseConfigured ? "not-loaded" : "unavailable");
    const emptyCashData = emptyCashBankingWorkspaceData();
    setCashData(emptyCashData);
    cashDataRef.current = emptyCashData;
    setPayrollImportData({ costCenters: [], batches: [], rows: [], templates: [] });
    const emptyPayrollData = emptyPayrollWorkspaceData();
    setPayrollData(emptyPayrollData);
    payrollDataRef.current = emptyPayrollData;
    payrollAutomationKeyRef.current = "";
    payrollBootstrapInFlightRef.current = null;
    payrollRepairInFlightRef.current = null;
    payrollCalendarPersistInFlightRef.current = null;
    setPayrollWorkspaceLoadState(isSupabaseConfigured ? "loading" : "idle");
    setPayrollPeriodPreparationState(isSupabaseConfigured ? "PREPARING" : "READY");
    setPayrollRefreshing(false);
    setSyncState({});
  };

  const retryPayrollPeriodPreparation = () => {
    payrollAutomationKeyRef.current = "";
    payrollCalendarPersistInFlightRef.current = null;
    setPayrollPeriodPreparationState("PREPARING");
    setPayrollWorkspaceLoadState((state) => state === "failed" ? "loaded" : state);
    setPayrollGenerationRetry((value) => value + 1);
  };

  const allWorkspaceRefreshGroups: readonly WorkspaceRefreshGroup[] = ["invoices", "cash", "engineering", "payroll", "payroll-imports", "gmail"];

  const currentWorkspaceLoadToken = () => {
    const userId = sessionRef.current?.user?.id;
    return userId && activeCompanyId ? { generation: workspaceGenerationRef.current, userId, companyId: activeCompanyId } : null;
  };

  const canApplyWorkspaceResult = (token: { generation: number; userId: string; companyId: string }) =>
    canApplyWorkspaceLoad(token, currentWorkspaceLoadToken());

  const workspaceGroupsAllowedForPermissions = (groups: readonly WorkspaceRefreshGroup[]) => groups.filter((group) => group === "invoices"
    ? can(PERMISSION_KEYS.invoicesRead)
    : group === "cash"
      ? hasAnyPermission(permissions, [PERMISSION_KEYS.cashSummaryRead, PERMISSION_KEYS.cashTransactionsRead, PERMISSION_KEYS.cashImport, PERMISSION_KEYS.cashReconcile])
    : group === "engineering"
      ? hasAnyPermission(permissions, [PERMISSION_KEYS.projectsRead, PERMISSION_KEYS.invoicesRead, PERMISSION_KEYS.expensesRead])
      : group === "payroll"
        ? can(PERMISSION_KEYS.payrollRead)
        : group === "payroll-imports"
          ? hasAnyPermission(permissions, [PERMISSION_KEYS.payrollImport, PERMISSION_KEYS.payrollWrite])
          : group === "gmail"
            ? can(PERMISSION_KEYS.gmailRead)
            : false);

  type EngineeringWorkspaceGroup = {
    projects: Project[];
    allocations: InvoiceProjectAllocation[];
    clientBillingData: ClientBillingWorkspaceData;
    clientCollectionData: ClientCollectionWorkspaceData;
    expenses: Expense[];
    costCodes: ProjectCostCode[];
    purchaseOrders: PurchaseOrder[];
    subcontracts: Subcontract[];
    receipts: PurchaseOrderReceipt[];
    purchaseOrderMatches: PurchaseOrderInvoiceMatch[];
    rfqs: RFQ[];
    supplierQuotations: SupplierQuotation[];
    vendors: Vendor[];
    laborAggregates: ProjectLaborCostAggregate[];
    laborAggregateLoadState: ProjectLaborAggregateLoadState;
  };
  type WorkspaceGroupData = InvoiceData[] | EngineeringWorkspaceGroup | PayrollWorkspaceData | PayrollImportWorkspaceData | CashBankingWorkspaceData | { lastHistoryId?: string; lastSyncedAt?: string };

  const applyInvoicesForWorkspace = (prepared: InvoiceData[], token: { generation: number; userId: string; companyId: string }) => {
    if (!canApplyWorkspaceResult(token)) return;
    const selected = selectedInvoiceRef.current;
    const selectedId = selected?.id || null;
    const localById = new Map<string, InvoiceData>(invoicesRef.current.map((invoice): [string, InvoiceData] => [invoice.id, invoice]));
    const next: InvoiceData[] = prepared.map((remoteInvoice) => {
      const decision = decideRemoteInvoiceRefresh({
        invoiceId: remoteInvoice.id,
        selectedInvoiceId: selectedId,
        saveState: saveStateRef.current,
        remoteExists: true,
      });
      if (decision.action === "defer") {
        remoteInvoiceUpdatesRef.current.set(remoteInvoice.id, remoteInvoice);
        remoteInvoiceRemovedRef.current.delete(remoteInvoice.id);
        setRemoteInvoiceUpdate({ invoiceId: remoteInvoice.id, invoice: remoteInvoice });
        return localById.get(remoteInvoice.id) || remoteInvoice;
      }
      remoteInvoiceUpdatesRef.current.delete(remoteInvoice.id);
      remoteInvoiceRemovedRef.current.delete(remoteInvoice.id);
      setRemoteInvoiceUpdate((current) => current?.invoiceId === remoteInvoice.id ? null : current);
      return remoteInvoice;
    });
    if (selected && !prepared.some((invoice) => invoice.id === selected.id)) {
      const decision = decideRemoteInvoiceRefresh({
        invoiceId: selected.id,
        selectedInvoiceId: selected.id,
        saveState: saveStateRef.current,
        remoteExists: false,
      });
      if (decision.action === "defer") {
        remoteInvoiceUpdatesRef.current.set(selected.id, selected);
        remoteInvoiceRemovedRef.current.add(selected.id);
        setRemoteInvoiceUpdate({ invoiceId: selected.id, invoice: selected });
        if (!next.some((invoice) => invoice.id === selected.id)) next.push(selected);
      }
    }
    invoicesRef.current = next;
    setInvoices(next);
    lastPersistedRef.current = new Map(prepared.map((invoice) => [invoice.id, invoice]));
  };

  const loadInvoicesGroup = async () => {
    const storedInvoices = await loadInvoicesFromSupabase();
    return (storedInvoices as InvoiceData[]).map(prepareStoredInvoice);
  };

  const applyEngineeringForWorkspace = (data: EngineeringWorkspaceGroup, token: { generation: number; userId: string; companyId: string }) => {
    if (!canApplyWorkspaceResult(token)) return;
    projectController.applyProjects(data.projects);
    setInvoiceProjectAllocations(data.allocations);
    setClientBillingData(data.clientBillingData);
    setClientCollectionData(data.clientCollectionData);
    setExpenses(data.expenses);
    setCostCodes(data.costCodes);
    setPurchaseOrders(data.purchaseOrders);
    setSubcontracts(data.subcontracts);
    setPurchaseOrderReceipts(data.receipts);
    setPurchaseOrderMatches(data.purchaseOrderMatches);
    setRfqs(data.rfqs || []);
    setSupplierQuotations(data.supplierQuotations || []);
    setVendors(data.vendors);
    setProjectLaborAggregates(data.laborAggregates);
    setProjectLaborAggregateLoadState(data.laborAggregateLoadState);
    setProjectCostDomainLoadState("loaded");
  };

  const loadEngineeringGroup = async (preserveExisting = false): Promise<EngineeringWorkspaceGroup> => {
    const results = await Promise.allSettled([
      can(PERMISSION_KEYS.projectsRead) ? loadProjectsFromSupabase() : Promise.resolve([]),
      can(PERMISSION_KEYS.projectsRead) || can(PERMISSION_KEYS.invoicesRead) ? loadInvoiceProjectAllocationsFromSupabase() : Promise.resolve([]),
      can(PERMISSION_KEYS.projectsRead) ? loadClientBillingWorkspaceFromSupabase() : Promise.resolve({ billings: [], events: [] } as ClientBillingWorkspaceData),
      can(PERMISSION_KEYS.expensesRead) ? loadExpensesFromSupabase() : Promise.resolve([]),
      can(PERMISSION_KEYS.projectsRead) ? loadProjectCostCodesFromSupabase() : Promise.resolve([]),
      can(PERMISSION_KEYS.procurementRead) ? fetchPurchaseOrders() : Promise.resolve([]),
      can(PERMISSION_KEYS.procurementRead) || can(PERMISSION_KEYS.invoicesRead) ? fetchVendors() : Promise.resolve([]),
      can(PERMISSION_KEYS.procurementRead) ? fetchPurchaseOrderReceipts() : Promise.resolve([]),
      can(PERMISSION_KEYS.procurementRead) && can(PERMISSION_KEYS.invoicesRead) ? fetchPurchaseOrderMatches() : Promise.resolve([]),
      can(PERMISSION_KEYS.procurementRead) ? fetchRFQs() : Promise.resolve([]),
      can(PERMISSION_KEYS.procurementRead) ? fetchSupplierQuotations() : Promise.resolve([]),
      can(PERMISSION_KEYS.procurementRead) ? fetchSubcontracts() : Promise.resolve([]),
      can(PERMISSION_KEYS.projectsRead) ? loadClientCollectionWorkspaceFromSupabase() : Promise.resolve({ collections: [], events: [] } as ClientCollectionWorkspaceData),
    ]);
    const failures: string[] = [];
    const projects = results[0].status === "fulfilled" ? results[0].value : [];
    const allocations = results[1].status === "fulfilled" ? results[1].value : [];
    const clientBillingData = results[2].status === "fulfilled" ? results[2].value : { billings: [], events: [] };
    const expenses = results[3].status === "fulfilled" ? results[3].value : [];
    const costCodes = results[4].status === "fulfilled" ? results[4].value : [];
    const purchaseOrders = results[5].status === "fulfilled" ? results[5].value : [];
    const vendors = results[6].status === "fulfilled" ? results[6].value : [];
    const receipts = results[7].status === "fulfilled" ? results[7].value : [];
    const purchaseOrderMatches = results[8].status === "fulfilled" ? results[8].value : [];
    const rfqs = results[9].status === "fulfilled" ? results[9].value : [];
    const supplierQuotations = results[10].status === "fulfilled" ? results[10].value : [];
    const subcontracts = results[11].status === "fulfilled" ? results[11].value : [];
    const clientCollectionData = results[12].status === "fulfilled" ? results[12].value : { collections: [], events: [] };
    if (results[0].status !== "fulfilled") failures.push("projects");
    if (results[1].status !== "fulfilled") failures.push("invoice allocations");
    if (results[2].status !== "fulfilled") failures.push("client billings");
    if (results[3].status !== "fulfilled") failures.push("expenses");
    if (results[4].status !== "fulfilled") failures.push("cost codes");
    if (results[5].status !== "fulfilled") failures.push("purchase orders");
    if (results[6].status !== "fulfilled") failures.push("vendors");
    if (results[7].status !== "fulfilled") failures.push("purchase order receipts");
    if (results[8].status !== "fulfilled") failures.push("purchase order matches");
    if (results[9].status !== "fulfilled") failures.push("rfqs");
    if (results[10].status !== "fulfilled") failures.push("supplier quotations");
    if (results[11].status !== "fulfilled") failures.push("subcontracts");
    if (results[12].status !== "fulfilled") failures.push("client collections");
    if (failures.length) throw new Error(`Engineering refresh failed for: ${failures.join(", ")}.`);

    let laborAggregates: ProjectLaborCostAggregate[] = [];
    let laborAggregateLoadState: ProjectLaborAggregateLoadState = "not-loaded";
    const shouldLoadLaborAggregate = can(PERMISSION_KEYS.projectsRead)
      && can(PERMISSION_KEYS.payrollAggregateRead)
      && !can(PERMISSION_KEYS.payrollSensitiveRead);
    if (shouldLoadLaborAggregate) {
      if (!projects.length) {
        laborAggregateLoadState = "available";
      } else {
        // A cached aggregate remains the rendered source while its refresh is
        // pending. If that refresh fails, reject the group as a whole so the
        // previous projects, expenses, and aggregate stay an atomic snapshot.
        if (!preserveExisting) setProjectLaborAggregateLoadState("loading");
        try {
          laborAggregates = await loadProjectLaborCostAggregatesFromSupabase(projects.map((project) => project.id));
          laborAggregateLoadState = "available";
        } catch (error) {
          if (preserveExisting || !(error instanceof ProjectLaborAggregateDataError)) throw error;
          laborAggregateLoadState = error.kind;
        }
      }
    }
    return { projects, allocations, clientBillingData, clientCollectionData, expenses, costCodes, purchaseOrders, subcontracts, receipts, purchaseOrderMatches, rfqs, supplierQuotations, vendors, laborAggregates, laborAggregateLoadState };
  };

  const loadPayrollGroup = async () => loadPayrollWorkspaceFromSupabase();

  const applyPayrollForWorkspace = (data: PayrollWorkspaceData, token: { generation: number; userId: string; companyId: string }) => {
    if (!canApplyWorkspaceResult(token)) return;
    payrollDataRef.current = data;
    setPayrollData(data);
    setPayrollWorkspaceLoadState("loaded");
    setPayrollPeriodPreparationState(data.periods.length ? "READY" : data.schedules.length ? "PREPARING" : "NO_SCHEDULE");
  };

  const loadPayrollImportsGroup = async () => loadPayrollImportWorkspaceFromSupabase();
  const applyPayrollImportsForWorkspace = (data: PayrollImportWorkspaceData, token: { generation: number; userId: string; companyId: string }) => {
    if (!canApplyWorkspaceResult(token)) return;
    setPayrollImportData(data);
  };

  const loadCashGroup = async () => loadCashBankingWorkspaceFromSupabase();
  const applyCashForWorkspace = (data: CashBankingWorkspaceData, token: { generation: number; userId: string; companyId: string }) => {
    if (!canApplyWorkspaceResult(token)) return;
    cashDataRef.current = data;
    setCashData(data);
  };

  const loadGmailGroup = async () => loadGmailSyncState();
  const applyGmailForWorkspace = (data: { lastHistoryId?: string; lastSyncedAt?: string }, token: { generation: number; userId: string; companyId: string }) => {
    if (!canApplyWorkspaceResult(token)) return;
    setSyncState(data);
  };

  const loadWorkspaceGroup = async (group: WorkspaceRefreshGroup, options: { preserveExisting?: boolean } = {}): Promise<WorkspaceGroupData> => {
    if (group === "invoices") return loadInvoicesGroup();
    if (group === "engineering") return loadEngineeringGroup(options.preserveExisting === true);
    if (group === "cash") return loadCashGroup();
    if (group === "payroll") return loadPayrollGroup();
    if (group === "payroll-imports") return loadPayrollImportsGroup();
    return loadGmailGroup();
  };

  const applyWorkspaceGroup = (group: WorkspaceRefreshGroup, data: WorkspaceGroupData, token: { generation: number; userId: string; companyId: string }) => {
    if (group === "invoices") applyInvoicesForWorkspace(data as InvoiceData[], token);
    else if (group === "engineering") applyEngineeringForWorkspace(data as EngineeringWorkspaceGroup, token);
    else if (group === "cash") applyCashForWorkspace(data as CashBankingWorkspaceData, token);
    else if (group === "payroll") applyPayrollForWorkspace(data as PayrollWorkspaceData, token);
    else if (group === "payroll-imports") applyPayrollImportsForWorkspace(data as PayrollImportWorkspaceData, token);
    else applyGmailForWorkspace(data as { lastHistoryId?: string; lastSyncedAt?: string }, token);
  };

  const refreshWorkspaceGroup = async (group: WorkspaceRefreshGroup, token: { generation: number; userId: string; companyId: string }, options: { force?: boolean; reason?: string } = {}) => {
    const cacheKey = { userId: token.userId, companyId: token.companyId, group };
    const hasUsableCachedData = workspaceLoadCacheRef.current.get(cacheKey)?.hasData === true;
    if (group === "engineering" && !hasUsableCachedData) setProjectCostDomainLoadState("loading");
    if (group === "payroll") {
      setPayrollRefreshing(true);
      if (!hasUsableCachedData) setPayrollWorkspaceLoadState("loading");
    }
    const request = workspaceLoadCacheRef.current.getOrLoad(
      cacheKey,
      () => loadWorkspaceGroup(group, { preserveExisting: hasUsableCachedData }),
      { force: options.force },
    );
    workspaceInstrumentationRef.current.groupRefresh({
      userId: token.userId,
      companyId: token.companyId,
      group,
      reason: options.reason || "manual",
      fromCache: request.fromCache,
      revalidating: request.revalidating,
    });
    try {
      const data = await request.promise;
      if (canApplyWorkspaceResult(token)) applyWorkspaceGroup(group, data, token);
    } catch (error) {
      if (canApplyWorkspaceResult(token) && !hasUsableCachedData) {
        if (group === "engineering") setProjectCostDomainLoadState("failed");
        if (group === "payroll") setPayrollWorkspaceLoadState("failed");
      }
      throw error;
    } finally {
      if (group === "payroll" && canApplyWorkspaceResult(token)) setPayrollRefreshing(false);
    }
  };

  const refreshWorkspaceGroups = async (groups: readonly WorkspaceRefreshGroup[], token = currentWorkspaceLoadToken(), options: { force?: boolean; reason?: string } = {}) => {
    if (!token) return;
    const allowedGroups = workspaceGroupsAllowedForPermissions(groups);
    const results = await Promise.allSettled(allowedGroups.map((group) => refreshWorkspaceGroup(group, token, options)));
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
    workspaceRefreshFailureRef.current = failures.length ? failures.join(" ") : null;
    if (failures.length) throw new Error(failures.join(" "));
  };

  const loadWorkspaceGuarded = async (nextSession: Session, generation: number) => {
    const userId = nextSession.user.id;
    const companyId = activeCompanyId;
    const token = companyId ? { generation, userId, companyId } : null;
    if (!isSupabaseConfigured || !token || !canApplyWorkspaceResult(token)) {
      if (canApplyWorkspaceResult(token)) setWorkspaceLoading(false);
      return;
    }
    const allowedGroups = workspaceGroupsAllowedForPermissions(allWorkspaceRefreshGroups);
    const hasUsableCachedWorkspace = allowedGroups.some((group) => workspaceLoadCacheRef.current.get({ userId, companyId, group })?.hasData);
    setWorkspaceLoading(!hasUsableCachedWorkspace);
    workspaceInstrumentationRef.current.fullLoad({ userId, companyId, generation, reason: hasUsableCachedWorkspace ? "COMPANY_CACHE" : "INITIAL_SESSION" });
    workspaceRefreshFailureRef.current = null;
    try {
      await ensureWorkspaceProfile();
      if (!canApplyWorkspaceResult(token)) return;
      await refreshWorkspaceGroups(allWorkspaceRefreshGroups, token, { reason: hasUsableCachedWorkspace ? "cache-revalidate" : "initial" });
    } catch (error: any) {
      if (!canApplyWorkspaceResult(token)) return;
      setWorkspaceSyncStatus("degraded");
      const message = error instanceof Error ? error.message : String(error);
      if (/Engineering refresh failed|payroll import/i.test(message)) {
        showNotification("info", "Some connected workspace data is unavailable until its Supabase migration is applied.");
      } else {
        showNotification("error", userFacingError(error, "Could not load the workspace. Check your connection or contact your administrator."));
      }
    } finally {
      if (canApplyWorkspaceResult(token)) setWorkspaceLoading(false);
    }
  };

  const [googleProviderToken, setGoogleProviderToken] = useState(() => getGoogleProviderToken());

  useEffect(() => {
    const token = captureGoogleProviderTokens(session);
    setGoogleProviderToken(token || getGoogleProviderToken());
  }, [session]);
  useEffect(() => {
    if (!authResolved) return undefined;
    const activeSession = session;
    const userId = activeSession?.user?.id || null;
    const previousIdentity = workspaceIdentityRef.current;
    if (previousIdentity.userId !== userId || previousIdentity.companyId !== companyAccess.activeCompanyId) {
      workspaceInstrumentationRef.current.authSession({ userId, companyId: companyAccess.activeCompanyId, previousCompanyId: previousIdentity.companyId, reason: "session-effect" });
      if (previousIdentity.companyId !== companyAccess.activeCompanyId) workspaceInstrumentationRef.current.companyChange({ userId, companyId: companyAccess.activeCompanyId, previousCompanyId: previousIdentity.companyId, reason: "active-company" });
      workspaceIdentityRef.current = { userId, companyId: companyAccess.activeCompanyId };
    }
    if (!supabase || !activeSession || !userId) {
      workspaceSyncControllerRef.current = null;
      setWorkspaceSyncStatus("guest");
      setWorkspaceLoading(false);
      workspaceLoadCacheRef.current.clear();
      if (!guestModeRef.current) { clearWorkspaceState(); return undefined; }
      const local = localFallbackInvoices();
      invoicesRef.current = local;
      setInvoices(local);
      setPayrollImportData(readPayrollImportWorkspaceFromLocal());
      setSyncState({});
      setInvoiceProjectAllocations(readInvoiceProjectAllocationsFromLocal());
      setExpenses(readExpensesFromLocal());
      setCostCodes(readProjectCostCodesFromLocal());
      const localCash = readCashBankingWorkspaceFromLocal();
      cashDataRef.current = localCash;
      setCashData(localCash);
      const localPayroll = readPayrollWorkspaceFromLocal();
      payrollDataRef.current = localPayroll;
      setPayrollData(localPayroll);
      setPayrollWorkspaceLoadState("loaded");
      setPayrollRefreshing(false);
      return undefined;
    }

    if (supabase && activeSession && userId && !companyAccess.activeCompanyId) {
      workspaceSyncControllerRef.current = null;
      setWorkspaceSyncStatus("connecting");
      clearWorkspaceState();
      setWorkspaceLoading(companyAccess.access.status === "loading");
      return undefined;
    }
    const generation = workspaceGenerationRef.current;
    workspaceInstrumentationRef.current.syncRecreation({ userId, companyId: activeCompanyId, generation, reason: "session-or-company" });
    const controller = createWorkspaceSyncController({
      client: supabase,
      environment: createBrowserWorkspaceSyncEnvironment(),
      refresh: async (groups, context) => {
        const initialLoad = initialWorkspaceLoadRef.current;
        if (initialLoad) await initialLoad;
        const token = activeCompanyId ? { generation, userId, companyId: activeCompanyId } : null;
        if (token && canApplyWorkspaceResult(token)) await refreshWorkspaceGroups(groups, token, { force: true, reason: context.reason });
      },
      onStateChange: (nextState) => {
        if (nextState.userId !== sessionRef.current?.user?.id) return;
        setWorkspaceSyncStatus(nextState.status);
      },
      onError: () => {
        if (sessionRef.current?.user?.id === userId) setWorkspaceSyncStatus("degraded");
      },
    });
    workspaceSyncControllerRef.current = controller;
    const initialLoad = loadWorkspaceGuarded(activeSession, generation);
    initialWorkspaceLoadRef.current = initialLoad;
    void initialLoad.then(
      () => { if (initialWorkspaceLoadRef.current === initialLoad) initialWorkspaceLoadRef.current = null; },
      () => { if (initialWorkspaceLoadRef.current === initialLoad) initialWorkspaceLoadRef.current = null; },
    );
    void controller.setSession(activeSession, activeCompanyId);

    return () => {
      if (workspaceSyncControllerRef.current === controller) workspaceSyncControllerRef.current = null;
      if (initialWorkspaceLoadRef.current === initialLoad) initialWorkspaceLoadRef.current = null;
      void controller.dispose();
    };
  }, [authResolved, session?.user?.id, guestModeState, companyAccess.activeCompanyId]);

  useEffect(() => {
    invoicesRef.current = invoices;
    if (shouldPersistGuestWorkspace(authResolved, session?.user?.id) && guestModeState) {
      try { localStorage.setItem("extracted_invoices", JSON.stringify(invoices)); } catch { /* preview URLs may fill local storage */ }
    }
  }, [invoices, session, authResolved, guestModeState]);

  useEffect(() => {
    if (shouldPersistGuestWorkspace(authResolved, session?.user?.id) && guestModeState) {
      writeInvoiceProjectAllocationsToLocal(invoiceProjectAllocations);
      writeClientBillingWorkspaceToLocal(clientBillingData);
      writeClientCollectionWorkspaceToLocal(clientCollectionData);
      writePayrollImportWorkspaceToLocal(payrollImportData);
      writeExpensesToLocal(expenses);
      writePayrollWorkspaceToLocal(payrollData);
      writeCashBankingWorkspaceToLocal(cashData);
    }
  }, [invoiceProjectAllocations, clientBillingData, clientCollectionData, expenses, payrollData, payrollImportData, cashData, session, authResolved, guestModeState]);

  useEffect(() => {
    payrollDataRef.current = payrollData;
  }, [payrollData]);

  useEffect(() => {
    cashDataRef.current = cashData;
  }, [cashData]);

  const applyCashWorkspace = (next: CashBankingWorkspaceData) => {
    cashDataRef.current = next;
    setCashData(next);
  };

  const handleSaveFinancialAccount = async (account: FinancialAccount) => {
    if (session && supabase) {
      const saved = await saveFinancialAccountToSupabase(account);
      applyCashWorkspace({ ...cashDataRef.current, accounts: [...cashDataRef.current.accounts.filter((item) => item.id !== account.id && item.id !== saved.id), saved] });
      return saved;
    }
    applyCashWorkspace({ ...cashDataRef.current, accounts: [...cashDataRef.current.accounts.filter((item) => item.id !== account.id), account] });
    return account;
  };

  const handleDeactivateFinancialAccount = async (account: FinancialAccount, reason: string) => {
    if (session && supabase) {
      const saved = await deactivateFinancialAccountInSupabase(account.id, reason);
      applyCashWorkspace({ ...cashDataRef.current, accounts: cashDataRef.current.accounts.map((item) => item.id === saved.id ? saved : item) });
      return;
    }
    applyCashWorkspace({ ...cashDataRef.current, accounts: cashDataRef.current.accounts.map((item) => item.id === account.id ? { ...item, active: false, updatedAt: new Date().toISOString() } : item) });
  };

  const handleReactivateFinancialAccount = async (account: FinancialAccount, reason: string) => {
    if (session && supabase) {
      const saved = await reactivateFinancialAccountInSupabase(account.id, reason);
      applyCashWorkspace({ ...cashDataRef.current, accounts: cashDataRef.current.accounts.map((item) => item.id === saved.id ? saved : item) });
      return;
    }
    applyCashWorkspace({ ...cashDataRef.current, accounts: cashDataRef.current.accounts.map((item) => item.id === account.id ? { ...item, active: true, updatedAt: new Date().toISOString() } : item) });
  };

  const handleSaveFinancialSnapshot = async (snapshot: FinancialBalanceSnapshot) => {
    if (session && supabase) {
      const saved = await saveFinancialBalanceSnapshotToSupabase(snapshot);
      applyCashWorkspace({ ...cashDataRef.current, snapshots: [saved, ...cashDataRef.current.snapshots.filter((item) => item.id !== saved.id)] });
      return;
    }
    applyCashWorkspace({ ...cashDataRef.current, snapshots: [snapshot, ...cashDataRef.current.snapshots.filter((item) => item.id !== snapshot.id)] });
  };

  const handleSaveFinancialTransaction = async (transaction: FinancialTransaction) => {
    if (session && supabase) {
      const saved = await saveFinancialTransactionToSupabase(transaction);
      applyCashWorkspace({ ...cashDataRef.current, transactions: [saved, ...cashDataRef.current.transactions.filter((item) => item.id !== transaction.id && item.id !== saved.id)] });
      return;
    }
    applyCashWorkspace({ ...cashDataRef.current, transactions: [transaction, ...cashDataRef.current.transactions.filter((item) => item.id !== transaction.id)] });
  };

  const handleCommitFinancialImport = async (preview: StatementPreview, account: FinancialAccount) => {
    if (session && supabase) {
      await commitFinancialImportToSupabase(preview, account);
      const token = currentWorkspaceLoadToken();
      if (token) await refreshWorkspaceGroup("cash", token, { force: true, reason: "cash-import" });
      return;
    }
    applyCashWorkspace(commitStatementPreviewToWorkspace(cashDataRef.current, preview, account));
  };

  const handleSaveFinancialMatch = async (match: FinancialTransactionMatch, transaction: FinancialTransaction) => {
    if (session && supabase) {
      await saveFinancialTransactionMatchToSupabase(match);
      const token = currentWorkspaceLoadToken();
      if (token) await refreshWorkspaceGroup("cash", token, { force: true, reason: "cash-settlement-confirmed" });
      return;
    }
    const nextMatches = [...cashDataRef.current.matches.filter((item) => item.id !== match.id), match];
    applyCashWorkspace({ ...cashDataRef.current, matches: nextMatches, transactions: cashDataRef.current.transactions.map((item) => item.id === transaction.id ? transaction : item) });
  };

  const handleSaveFinancialMatchBatch = async (matches: FinancialTransactionMatch[], transaction: FinancialTransaction) => {
    if (session && supabase) {
      await confirmFinancialSettlementBatchToSupabase(transaction.id, matches.map((match) => ({
        targetType: match.targetType,
        targetId: match.targetId || "",
        amount: match.matchedAmount,
        matchId: match.id,
        confidence: match.confidence,
        notes: match.notes,
      })));
      const token = currentWorkspaceLoadToken();
      if (token) await refreshWorkspaceGroup("cash", token, { force: true, reason: "cash-settlement-batch-confirmed" });
      return;
    }
    const nextMatches = [...cashDataRef.current.matches.filter((item) => !matches.some((match) => match.id === item.id)), ...matches];
    applyCashWorkspace({
      ...cashDataRef.current,
      matches: nextMatches,
      transactions: cashDataRef.current.transactions.map((item) => item.id === transaction.id ? transaction : item),
    });
  };

  const handleReverseFinancialMatch = async (matchId: string, reason: string) => {
    if (session && supabase) {
      await reverseFinancialSettlement(matchId, reason);
      const token = currentWorkspaceLoadToken();
      if (token) await refreshWorkspaceGroup("cash", token, { force: true, reason: "cash-match-reversed" });
      return;
    }
    const targetMatch = cashDataRef.current.matches.find((m) => m.id === matchId);
    if (!targetMatch) return;
    const updatedAt = new Date().toISOString();
    const updatedMatch: FinancialTransactionMatch = {
      ...targetMatch,
      status: "REVERSED",
      reversedAt: updatedAt,
      reversalReason: reason,
      updatedAt,
    };
    const nextMatches = cashDataRef.current.matches.map((m) => m.id === matchId ? updatedMatch : m);
    const affectedTx = cashDataRef.current.transactions.find((t) => t.id === targetMatch.transactionId);
    const nextTransactions = affectedTx
      ? cashDataRef.current.transactions.map((t) => t.id === affectedTx.id ? { ...t, reconciliationStatus: reconciliationStatusForTransaction(t, nextMatches), updatedAt } : t)
      : cashDataRef.current.transactions;
    applyCashWorkspace({ ...cashDataRef.current, matches: nextMatches, transactions: nextTransactions });
  };

  const handleCorrectFinancialTransaction = async (
    transaction: FinancialTransaction,
    input: { transactionDate: string; referenceNumber?: string; description: string; direction: FinancialTransaction["direction"]; amount: number },
    reason: string,
  ) => {
    if (!isManualTransactionCorrectionEligible(transaction, cashDataRef.current.matches)) throw new Error("Only an unreconciled manual transaction without financial history can be edited.");
    if (session && supabase) {
      const saved = await correctFinancialTransactionInSupabase(transaction.id, input, reason);
      applyCashWorkspace({ ...cashDataRef.current, transactions: cashDataRef.current.transactions.map((item) => item.id === saved.id ? saved : item) });
      return;
    }
    const updatedAt = new Date().toISOString();
    applyCashWorkspace({
      ...cashDataRef.current,
      transactions: cashDataRef.current.transactions.map((item) => item.id === transaction.id ? {
        ...item,
        ...input,
        referenceNumber: input.referenceNumber || undefined,
        postedAt: item.postedAt ? `${input.transactionDate}T00:00:00.000Z` : undefined,
        updatedAt,
      } : item),
    });
  };

  const handleReverseFinancialTransaction = async (transaction: FinancialTransaction, reason: string) => {
    if (session && supabase) {
      const saved = await reverseFinancialTransactionInSupabase(transaction.id, reason);
      applyCashWorkspace({ ...cashDataRef.current, transactions: cashDataRef.current.transactions.map((item) => item.id === saved.id ? saved : item) });
      return;
    }
    const updatedAt = new Date().toISOString();
    applyCashWorkspace({
      ...cashDataRef.current,
      transactions: cashDataRef.current.transactions.map((item) => item.id === transaction.id ? { ...item, status: "REVERSED", reconciliationStatus: "UNMATCHED", reversedAt: updatedAt, reversalReason: reason, updatedAt } : item),
    });
  };

  const handleIgnoreFinancialTransaction = async (transaction: FinancialTransaction, reason: string) => {
    if (session && supabase) {
      const saved = await ignoreFinancialTransactionInSupabase(transaction.id, reason);
      applyCashWorkspace({ ...cashDataRef.current, transactions: cashDataRef.current.transactions.map((item) => item.id === saved.id ? saved : item) });
      return;
    }
    applyCashWorkspace({ ...cashDataRef.current, transactions: cashDataRef.current.transactions.map((item) => item.id === transaction.id ? { ...item, reconciliationStatus: "IGNORED", updatedAt: new Date().toISOString() } : item) });
  };

  const handleRestoreFinancialTransactionToReview = async (transaction: FinancialTransaction, reason: string) => {
    if (session && supabase) {
      const saved = await restoreFinancialTransactionToReviewInSupabase(transaction.id, reason);
      applyCashWorkspace({ ...cashDataRef.current, transactions: cashDataRef.current.transactions.map((item) => item.id === saved.id ? saved : item) });
      return;
    }
    applyCashWorkspace({ ...cashDataRef.current, transactions: cashDataRef.current.transactions.map((item) => item.id === transaction.id ? { ...item, reconciliationStatus: "UNMATCHED", updatedAt: new Date().toISOString() } : item) });
  };

  const handleConfirmFinancialTransfer = async (left: FinancialTransaction, right: FinancialTransaction) => {
    if (session && supabase) {
      await confirmFinancialTransferToSupabase(left.id, right.id, Math.min(left.amount, right.amount));
      const token = currentWorkspaceLoadToken();
      if (token) await refreshWorkspaceGroup("cash", token, { force: true, reason: "cash-transfer-confirmed" });
      return;
    }
    const transferGroupId = financialId("transfer");
    const leftNext = { ...left, transferGroupId, reconciliationStatus: "MATCHED" as const, updatedAt: new Date().toISOString() };
    const rightNext = { ...right, transferGroupId, reconciliationStatus: "MATCHED" as const, updatedAt: new Date().toISOString() };
    const amount = Math.min(left.amount, right.amount);
    const leftMatch = createFinancialMatch({ companyId: left.companyId, transactionId: left.id, targetType: "TRANSFER", targetId: right.id, matchedAmount: amount, status: "CONFIRMED", confirmedAt: new Date().toISOString(), notes: "Confirmed internal transfer", transferGroupId });
    const rightMatch = createFinancialMatch({ companyId: right.companyId, transactionId: right.id, targetType: "TRANSFER", targetId: left.id, matchedAmount: amount, status: "CONFIRMED", confirmedAt: new Date().toISOString(), notes: "Confirmed internal transfer", transferGroupId });
    applyCashWorkspace({ ...cashDataRef.current, transactions: cashDataRef.current.transactions.map((item) => item.id === left.id ? leftNext : item.id === right.id ? rightNext : item), matches: [...cashDataRef.current.matches, leftMatch, rightMatch] });
  };

  const handleReverseFinancialTransfer = async (left: FinancialTransaction, right: FinancialTransaction, reason: string) => {
    if (!left.transferGroupId || left.transferGroupId !== right.transferGroupId) throw new Error("The exact confirmed transfer pair is no longer available.");
    if (session && supabase) {
      await reverseFinancialTransferInSupabase(left.id, right.id, left.transferGroupId, reason);
      const token = currentWorkspaceLoadToken();
      if (token) await refreshWorkspaceGroup("cash", token, { force: true, reason: "cash-transfer-reversed" });
      return;
    }
    const updatedAt = new Date().toISOString();
    const nextMatches = cashDataRef.current.matches.map((match) => match.status === "CONFIRMED"
      && match.targetType === "TRANSFER"
      && ((match.transactionId === left.id && match.targetId === right.id) || (match.transactionId === right.id && match.targetId === left.id))
      ? { ...match, status: "REVERSED" as const, reversedAt: updatedAt, reversalReason: reason, updatedAt }
      : match);
    const nextTransactions = cashDataRef.current.transactions.map((transaction) => {
      if (transaction.id !== left.id && transaction.id !== right.id) return transaction;
      return { ...transaction, transferGroupId: undefined, reconciliationStatus: reconciliationStatusForTransaction({ ...transaction, transferGroupId: undefined, reconciliationStatus: "UNMATCHED" }, nextMatches), updatedAt };
    });
    applyCashWorkspace({ ...cashDataRef.current, matches: nextMatches, transactions: nextTransactions });
  };

  useEffect(() => {
    if (!authResolved || activeTab !== "payroll" || workspaceLoading || payrollRefreshing) return;
    const snapshot = payrollDataRef.current;
    const userId = session?.user?.id;
    if (userId && supabase) {
      if (payrollWorkspaceLoadState !== "loaded") {
        setPayrollPeriodPreparationState("PREPARING");
        return;
      }
      if (snapshot.schedules.length > 0) {
        // A loaded schedule is the input to period generation, not a reason
        // to stop the orchestration effect. The previous early return here
        // left authenticated companies with a schedule but no calendar.
        // When the schedule was just bootstrapped, wait for its persistence
        // before writing periods that reference its schedule version.
        if (payrollBootstrapInFlightRef.current) return;
      } else {
        setPayrollPeriodPreparationState("PREPARING");
        if (payrollBootstrapInFlightRef.current || payrollBootstrapPersistedUsersRef.current.has(userId)) return;
        const token = currentWorkspaceLoadToken();
        if (!token || token.generation !== workspaceGenerationRef.current || token.userId !== userId) return;
        const seeded = { ...createDefaultPayrollSchedule(dateOnly()), autoCalculate: false, autoCreateRuns: true, autoSelectCurrentPeriod: true } as unknown as PayrollSchedule;
        const localSnapshot = { ...snapshot, schedules: [seeded] };
        payrollDataRef.current = localSnapshot;
        setPayrollData(localSnapshot);
        payrollAutomationKeyRef.current = `seed:${seeded.id}`;
        const bootstrap = (async () => {
          try {
            const saved = await savePayrollScheduleToSupabase(seeded);
            if (!canApplyWorkspaceResult(token)) return;
            payrollBootstrapPersistedUsersRef.current.add(userId);
            const next = { ...payrollDataRef.current, schedules: [saved] };
            payrollDataRef.current = next;
            setPayrollData(next);
            setPayrollWorkspaceLoadState("loaded");
            payrollAutomationKeyRef.current = "";
            setPayrollGenerationRetry((value) => value + 1);
          } catch (error) {
            if (canApplyWorkspaceResult(token)) {
              if (snapshot.schedules.length === 0 && payrollDataRef.current.schedules.some((schedule) => schedule.id === seeded.id)) {
                const rolledBack = { ...payrollDataRef.current, schedules: payrollDataRef.current.schedules.filter((schedule) => schedule.id !== seeded.id) };
                payrollDataRef.current = rolledBack;
                setPayrollData(rolledBack);
              }
              payrollAutomationKeyRef.current = "";
              setPayrollPeriodPreparationState("FAILED");
              setPayrollWorkspaceLoadState("failed");
              showNotification("error", userFacingError(error, "Could not create the payroll schedule."));
            }
          } finally {
            if (payrollBootstrapInFlightRef.current === bootstrap) payrollBootstrapInFlightRef.current = null;
          }
        })();
        payrollBootstrapInFlightRef.current = bootstrap;
        return;
      }
    }
    if (!snapshot.schedules.length) {
      setPayrollPeriodPreparationState("PREPARING");
      const schedules = [{ ...createDefaultPayrollSchedule(dateOnly()), autoCalculate: false, autoCreateRuns: true, autoSelectCurrentPeriod: true }] as unknown as PayrollSchedule[];
      const next = { ...snapshot, schedules };
      payrollDataRef.current = next;
      setPayrollData(next);
      payrollAutomationKeyRef.current = `seed:${schedules[0]!.id}`;
      return;
    }
    const activeSchedule = selectPrimaryPayrollSchedule(snapshot.schedules);
    if (!activeSchedule) {
      setPayrollPeriodPreparationState("NO_SCHEDULE");
      return;
    }

    // Legacy default schedules seeded by older releases can carry a
    // mid-period effectiveFrom, which blocks all period generation. Analyze
    // and self-heal BEFORE generating so persisted periods reference a
    // schedule/version whose effectiveFrom is the canonical boundary.
    const today = dateOnly();
    const compatibility = analyzePayrollScheduleBootstrapCompatibility(activeSchedule, today, {
      periods: snapshot.periods,
      runs: snapshot.runs,
      entries: snapshot.entries,
      workEntries: snapshot.workEntries,
      importBatches: payrollImportData.batches,
      adjustments: snapshot.adjustments,
      attendanceRecords: snapshot.attendanceRecords,
      leaveRequests: snapshot.leaveRequests,
      overtimeRequests: snapshot.overtimeRequests,
    });
    let base = snapshot;
    if (compatibility.repaired) {
      if (userId && supabase) {
        // The corrected schedule must be persisted before periods are
        // generated; generating first would race this write and could
        // clobber or duplicate the freshly created calendar rows.
        if (payrollRepairInFlightRef.current) return;
        const token = currentWorkspaceLoadToken();
        if (!token || token.generation !== workspaceGenerationRef.current || token.userId !== userId) return;
        setPayrollPeriodPreparationState("PREPARING");
        const repair = (async () => {
          try {
            const saved = await savePayrollScheduleToSupabase(compatibility.schedule);
            if (!canApplyWorkspaceResult(token)) return;
            const fresh = payrollDataRef.current;
            const next = { ...fresh, schedules: fresh.schedules.map((schedule) => (schedule.id === saved.id ? saved : schedule)) };
            payrollDataRef.current = next;
            setPayrollData(next);
            payrollAutomationKeyRef.current = "";
            setPayrollGenerationRetry((value) => value + 1);
          } catch (error) {
            if (canApplyWorkspaceResult(token)) {
              setPayrollPeriodPreparationState("FAILED");
              showNotification("error", userFacingError(error, "Could not apply the payroll schedule compatibility repair."));
            }
          } finally {
            if (payrollRepairInFlightRef.current === repair) payrollRepairInFlightRef.current = null;
          }
        })();
        payrollRepairInFlightRef.current = repair;
        return;
      }
      // Guest/local workspace: apply the correction synchronously (the guest
      // storage effect persists it) and continue generating below.
      base = { ...snapshot, schedules: snapshot.schedules.map((schedule) => (schedule.id === compatibility.schedule.id ? compatibility.schedule : schedule)) };
      payrollDataRef.current = base;
      setPayrollData(base);
    }
    const key = `${session?.user?.id || "guest"}:${today}:${activeSchedule.id}:${base.periods.length}:${base.runs.length}`;
    if (payrollCalendarPersistInFlightRef.current || payrollAutomationKeyRef.current === key) return;
    payrollAutomationKeyRef.current = key;
    setPayrollPeriodPreparationState("PREPARING");
    let ensured: ReturnType<typeof ensurePayrollPeriodsAndRuns>;
    try {
      ensured = ensurePayrollPeriodsAndRuns({
        schedules: [compatibility.repaired ? compatibility.schedule : activeSchedule],
        periods: base.periods,
        runs: base.runs,
        entries: base.entries,
        workEntries: base.workEntries,
        importBatches: payrollImportData.batches,
        referenceDate: today,
        previous: 2,
        next: 2,
      });
    } catch (error) {
      setPayrollPeriodPreparationState("FAILED");
      showNotification("error", userFacingError(error, "Payroll periods could not be prepared."));
      return;
    }
    const periodChanged = ensured.periods.length !== base.periods.length || ensured.periods.some((period) => {
      const previous = base.periods.find((item) => item.id === period.id);
      return !previous || previous.status !== period.status || previous.payDate !== period.payDate || previous.scheduleId !== period.scheduleId || previous.scheduleVersionId !== period.scheduleVersionId || previous.lockedAt !== period.lockedAt || previous.notes !== period.notes;
    });
    const runChanged = ensured.runs.length !== base.runs.length || ensured.runs.some((run) => {
      const previous = base.runs.find((item) => item.id === run.id);
      return !previous || previous.status !== run.status || previous.notes !== run.notes;
    });
    // An automatic schedule that generated zero usable periods must never be
    // reported as READY: the calendar would stay silently empty ("No period
    // yet") while the page claims preparation succeeded.
    if (!ensured.periods.length && base.periods.length === 0 && activeSchedule.autoGeneratePeriods) {
      setPayrollPeriodPreparationState("WAITING_FOR_BOUNDARY");
      return;
    }
    if (!periodChanged && !runChanged) {
      setPayrollPeriodPreparationState("READY");
      return;
    }
    // Guest/local workspaces persist through the local storage effect, so the
    // generated rows are already durable once state is applied. Authenticated
    // workspaces must not report READY before Supabase holds the calendar.
    if (!(session && supabase)) {
      const next = { ...base, schedules: ensured.schedules || base.schedules, periods: ensured.periods, runs: ensured.runs };
      payrollDataRef.current = next;
      setPayrollData(next);
      setPayrollPeriodPreparationState("READY");
      return;
    }
    const token = currentWorkspaceLoadToken();
    if (!token || token.generation !== workspaceGenerationRef.current || token.userId !== userId) return;
    setPayrollPeriodPreparationState("SYNCING");
    // Persist BEFORE applying locally: a failed write leaves the snapshot
    // untouched so Retry recomputes exactly the same missing rows instead of
    // mistaking optimistic in-memory periods for durable accounting data.
    const persistCalendar = (async () => {
      try {
        // Safe continuity repairs update schedule metadata before any period
        // rows reference the repaired version range. The workflow only emits
        // this collection when it actually changed a schedule.
        for (const schedule of ensured.schedules || []) {
          const old = base.schedules.find((candidate) => candidate.id === schedule.id);
          const changed = !old
            || old.effectiveFrom !== schedule.effectiveFrom
            || old.frequency !== schedule.frequency
            || old.weekEndDay !== schedule.weekEndDay
            || old.anchorPeriodEnd !== schedule.anchorPeriodEnd
            || JSON.stringify(old.versions || []) !== JSON.stringify(schedule.versions || []);
          if (changed) await savePayrollScheduleToSupabase(schedule);
        }
        const lifecycleContext = {
          runs: base.runs,
          entries: base.entries,
          workEntries: base.workEntries,
          importBatches: payrollImportData.batches,
          adjustments: base.adjustments,
          attendanceRecords: base.attendanceRecords,
          leaveRequests: base.leaveRequests,
          overtimeRequests: base.overtimeRequests,
        };
        const retiredPeriodIds = new Set(ensured.retiredPeriodIds);
        const retiredRunIds = new Set(ensured.retiredRunIds);
        const retainedPeriodIds = new Set(ensured.periods.map((period) => period.id));
        const retainedRunIds = new Set(ensured.runs.map((run) => run.id));
        // Reconciliation is deliberately conservative, but its result must
        // also be durable. Delete only rows the pure planner marked retired
        // and re-check the disposable predicates against the original
        // snapshot before making a remote mutation. Runs are deleted first so
        // the period foreign key cannot leave half of a cleanup behind.
        for (const run of base.runs.filter((item) => (retiredRunIds.has(item.id) || retiredPeriodIds.has(item.periodId)) && !retainedRunIds.has(item.id) && isSafeToDeletePayrollRun(item, lifecycleContext))) await deletePayrollRunToSupabase(run.id);
        for (const period of base.periods.filter((item) => retiredPeriodIds.has(item.id) && !retainedPeriodIds.has(item.id) && isSafeToDeletePayrollPeriod(item, lifecycleContext))) await deletePayrollPeriodToSupabase(period.id);

        // A newly generated period may receive a locally generated ID. Keep a
        // period-ID map so an auto-created run always references the ID that
        // was actually written to Supabase.
        const periodIdMap = new Map<string, string>();
        for (const period of ensured.periods.filter((item) => item.autoGenerated)) {
          const old = base.periods.find((candidate) => candidate.id === period.id);
          const changed = !old
            || old.periodStart !== period.periodStart
            || old.periodEnd !== period.periodEnd
            || old.payDate !== period.payDate
            || old.scheduleId !== period.scheduleId
            || old.scheduleVersionId !== period.scheduleVersionId
            || old.autoGenerated !== period.autoGenerated
            || old.lockedAt !== period.lockedAt
            || old.status !== period.status
            || old.notes !== period.notes;
          if (!changed) {
            periodIdMap.set(period.id, period.id);
            continue;
          }
          const saved = await savePayrollPeriodToSupabase(period);
          periodIdMap.set(period.id, saved.id);
        }
        for (const run of ensured.runs) {
          const periodId = periodIdMap.get(run.periodId) || run.periodId;
          const persistedRun = periodId === run.periodId ? run : { ...run, periodId };
          const old = base.runs.find((candidate) => candidate.id === run.id);
          const changed = !old
            || old.periodId !== persistedRun.periodId
            || old.status !== persistedRun.status
            || old.notes !== persistedRun.notes;
          if (changed) await savePayrollRunToSupabase(persistedRun);
        }
        if (!canApplyWorkspaceResult(token)) return;
        // READY means reloaded from Supabase, never merely generated in memory.
        await refreshWorkspaceGroups(["payroll"], token, { force: true, reason: "payroll-calendar-persisted" });
        if (canApplyWorkspaceResult(token)) setPayrollPeriodPreparationState("READY");
      } catch (error) {
        payrollAutomationKeyRef.current = "";
        if (canApplyWorkspaceResult(token)) {
          setPayrollPeriodPreparationState("FAILED");
          setPayrollWorkspaceLoadState("failed");
          showNotification("error", userFacingError(error, "Generated payroll periods could not be persisted to Supabase."));
        }
      } finally {
        if (payrollCalendarPersistInFlightRef.current === persistCalendar) payrollCalendarPersistInFlightRef.current = null;
      }
    })();
    payrollCalendarPersistInFlightRef.current = persistCalendar;
  }, [activeTab, authResolved, workspaceLoading, payrollRefreshing, payrollWorkspaceLoadState, payrollGenerationRetry, session?.user?.id, payrollData.periods.length, payrollData.runs.length, payrollScheduleSignature, payrollImportData.batches.length]);
  useEffect(() => {
    if (activeTab !== "extractor") setUploadProjectContextId(null);
  }, [activeTab]);

  useEffect(() => () => {
    updateTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const saveExtracted = async (raw: InvoiceData, previewUrl?: string) => {
    let prepared = prepareStoredInvoice({ ...raw, previewUrl: previewUrl || raw.previewUrl });
    prepared = { ...prepared, reviewStatus: prepared.reviewStatus || "NEEDS_REVIEW" };
    const duplicate = findPossibleDuplicate(prepared, invoicesRef.current);
    if (duplicate) prepared = { ...prepared, duplicateStatus: "POSSIBLE_DUPLICATE", duplicateOfId: duplicate.id, reviewStatus: "NEEDS_REVIEW" };

    if (session && supabase) {
      prepared = await persistNewInvoice(prepared);
      lastPersistedRef.current.set(prepared.id, prepared);
    }

    const next = [prepared, ...invoicesRef.current.filter((item) => item.id !== prepared.id)];
    invoicesRef.current = next;
    setInvoices(next);
    setReviewCompletion(null);
    updateSaveState("saved");
    return prepared;
  };

  const extractPayload = async (payload: any) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 95_000);
    try {
      const response = await companyApiRequest("/api/extract-invoice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal, companyId: companyAccess.activeCompanyId || "" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "Invoice extraction failed. Please retry the document.");
      return result.data as InvoiceData;
    } catch (error: any) {
      if (error?.name === "AbortError") throw new Error("Invoice extraction timed out. Please retry the document.");
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const handleExtract = async (payload: ExtractPayload): Promise<InvoiceData> => {
    if (isSupabaseConfigured && !hasAllPermissions(permissions, [PERMISSION_KEYS.invoicesWrite, PERMISSION_KEYS.invoicesExtract, PERMISSION_KEYS.invoicesVerify])) {
      throw new Error("Invoice extraction requires invoice management, extraction, and verification permissions in this company.");
    }
    setProcessingCount((n) => n + 1);
    try {
      let storedSource: Awaited<ReturnType<typeof saveManualSourceDocument>> | undefined;
      if (session && payload.fileName && ((payload.fileData && payload.mimeType) || payload.textData)) {
        storedSource = await saveManualSourceDocument({
          fileData: payload.fileData || textToBase64(payload.textData || ""),
          mimeType: payload.mimeType || "text/plain",
          fileName: payload.fileName,
          emailMessageId: payload.emailContext?.emailRecordId,
          sourceType: payload.sourceType === "EMAIL" ? "EMAIL" : "UPLOAD",
        });
      }

      if (storedSource) {
        const sourceCriteria = {
          sourceSha256: storedSource.sha256,
          sourceDocumentId: storedSource.id,
          fileName: payload.fileName,
        };
        const existingMatch = findExistingInvoiceForSourcePayload(sourceCriteria, invoicesRef.current);
        let existingInvoice = existingMatch.existingInvoice;
        if (!existingInvoice && session && supabase) {
          existingInvoice = (await findExistingInvoiceBySource(sourceCriteria).catch(() => null)) || undefined;
        }
        if (existingInvoice) {
          showNotification(
            "info",
            `This document appears to have already been processed as Invoice ${existingInvoice.invoiceNumber || existingInvoice.id}. Loaded existing record.`
          );
          const matchedCandidate: InvoiceData = {
            ...existingInvoice,
            duplicateStatus: "POSSIBLE_DUPLICATE",
            duplicateOfId: existingInvoice.id,
            duplicateReasons: existingMatch.reasons.length
              ? existingMatch.reasons
              : [`Identical source file already processed as Invoice ${existingInvoice.invoiceNumber || existingInvoice.id}.`],
            reviewStatus: existingInvoice.reviewStatus || "NEEDS_REVIEW",
          };
          sourcePayloadsRef.current.set(matchedCandidate.id, payload);
          return matchedCandidate;
        }
      }

      let extracted = await extractPayload(payload);
      if (storedSource) {
        extracted = {
          ...extracted,
          fileSize: storedSource.size,
          fileType: storedSource.mimeType,
          previewUrl: storedSource.previewUrl,
          sourceDocumentId: storedSource.id,
          sourceStoragePath: storedSource.storagePath,
          sourceSha256: storedSource.sha256,
          sourceEmailId: storedSource.emailMessageId || extracted.sourceEmailId,
          sourceMetadata: { ...(extracted.sourceMetadata || {}), sourceDocumentId: storedSource.id, sourceStoragePath: storedSource.storagePath, sourceSha256: storedSource.sha256 },
        };
      }
      const prepared = await saveExtracted(extracted, storedSource?.previewUrl || payload.previewUrl);
      sourcePayloadsRef.current.set(prepared.id, payload);
      if (storedSource) await markSourceDocumentStatus(storedSource.id, "EXTRACTED", prepared.documentType);
      try {
        const [existingVendors, existingProfiles] = await Promise.all([
          listCompanyVendors().catch(() => []),
          listEmailIntakeProfiles().catch(() => []),
        ]);
        const evidence = extractVendorEvidenceFromInvoice(prepared, prepared.sourceMetadata);
        const resolution = resolveVendorCandidate(
          {
            candidateId: prepared.id,
            evidence,
            sourceRef: {
              fileName: prepared.fileName,
              messageId: prepared.sourceMetadata?.gmailMessageId,
              subject: prepared.sourceMetadata?.subject,
              sender: prepared.sourceMetadata?.sender,
              attachmentId: prepared.sourceMetadata?.gmailAttachmentId,
            },
          },
          existingVendors,
          existingProfiles,
        );
        prepared.entityResolution = resolution;
      } catch {
        // Safe fallback
      }
      return prepared;
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Invoice extraction failed. Check the document and try again."));
      throw error;
    } finally {
      setProcessingCount((n) => Math.max(0, n - 1));
    }
  };

  const handleProcessEmail = async ({ sender, subject, receivedAt, body, attachments }: { sender: string; subject: string; receivedAt: string; body: string; attachments: File[] }): Promise<EmailClassification | null> => {
    if (isSupabaseConfigured && !hasAllPermissions(permissions, [PERMISSION_KEYS.invoicesWrite, PERMISSION_KEYS.invoicesExtract, PERMISSION_KEYS.invoicesVerify])) {
      throw new Error("Invoice extraction requires invoice management, extraction, and verification permissions in this company.");
    }
    setProcessingCount((n) => n + 1);
    try {
      let classification: EmailClassification = classifyEmailIntakeCandidate({
        id: "manual",
        threadId: "manual",
        sender,
        to: [],
        cc: [],
        subject,
        receivedAt,
        snippet: body.slice(0, 200),
        bodyText: body,
        labels: [],
        attachments: attachments.map((file, i) => ({ attachmentId: String(i), filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size })),
      });
      if (!classification.isInvoiceLike && (classification as any).suggestedDestination === "UNSUPPORTED") {
        try {
          const classifyResponse = await companyApiRequest("/api/classify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sender, subject, body, attachmentNames: attachments.map((file) => file.name), model: "gemini-3.5-flash-lite" }), companyId: companyAccess.activeCompanyId || "" });
          const classifyResult = await classifyResponse.json();
          if (classifyResponse.ok && classifyResult.success) {
            classification = classifyResult.data;
          }
        } catch {
          // fallback to deterministic result
        }
      }
      const manualEmail = session ? await saveManualEmailRecord({ sender, subject, receivedAt, body }) : undefined;
      const extractedInvoices: InvoiceData[] = [];
      let failureCount = 0;

      if (attachments.length > 0) {
        for (const attachment of attachments) {
          if (!isExtractableAttachment(attachment.type || "application/octet-stream", attachment.name)) {
            continue;
          }
          try {
            const encoded = await fileToBase64(attachment);
            const storedSource = session ? await saveManualSourceDocument({ ...encoded, fileName: attachment.name, emailMessageId: manualEmail?.id, sourceType: "EMAIL" }) : undefined;
            const sourceCriteria = {
              sourceSha256: storedSource?.sha256,
              sourceDocumentId: storedSource?.id,
              fileName: attachment.name,
            };
            const existingMatch = findExistingInvoiceForSourcePayload(sourceCriteria, invoicesRef.current);
            let existingInvoice = existingMatch.existingInvoice;
            if (!existingInvoice && session && supabase && storedSource) {
              existingInvoice = (await findExistingInvoiceBySource(sourceCriteria).catch(() => null)) || undefined;
            }

            if (existingInvoice) {
              const matchedCandidate: InvoiceData = {
                ...existingInvoice,
                duplicateStatus: "POSSIBLE_DUPLICATE",
                duplicateOfId: existingInvoice.id,
                duplicateReasons: existingMatch.reasons.length
                  ? existingMatch.reasons
                  : [`Identical source attachment already processed as Invoice ${existingInvoice.invoiceNumber || existingInvoice.id}.`],
                reviewStatus: existingInvoice.reviewStatus || "NEEDS_REVIEW",
              };
              sourcePayloadsRef.current.set(matchedCandidate.id, { ...encoded, fileName: attachment.name, model: "gemini-3.5-flash-lite", sourceType: "EMAIL", emailContext: { sender, subject, receivedAt, body, attachmentName: attachment.name, emailRecordId: manualEmail?.id, sourceDocumentId: storedSource?.id, sourceStoragePath: storedSource?.storagePath } });
              extractedInvoices.push(matchedCandidate);
              if (storedSource) await markSourceDocumentStatus(storedSource.id, "EXTRACTED", matchedCandidate.documentType);
            } else {
              let extracted = await extractPayload({
                ...encoded,
                fileName: attachment.name,
                model: "gemini-3.5-flash-lite",
                sourceType: "EMAIL",
                emailContext: { sender, subject, receivedAt, body, attachmentName: attachment.name, emailRecordId: manualEmail?.id, sourceDocumentId: storedSource?.id, sourceStoragePath: storedSource?.storagePath },
              });
              extracted = { ...extracted, fileSize: attachment.size, fileType: encoded.mimeType, sourceEmailId: manualEmail?.id, sourceDocumentId: storedSource?.id, sourceStoragePath: storedSource?.storagePath, sourceSha256: storedSource?.sha256, previewUrl: storedSource?.previewUrl || extracted.previewUrl };
              const saved = await saveExtracted(extracted, storedSource?.previewUrl);
              sourcePayloadsRef.current.set(saved.id, { ...encoded, fileName: attachment.name, model: "gemini-3.5-flash-lite", sourceType: "EMAIL", emailContext: { sender, subject, receivedAt, body, attachmentName: attachment.name, emailRecordId: manualEmail?.id, sourceDocumentId: storedSource?.id, sourceStoragePath: storedSource?.storagePath } });
              extractedInvoices.push(saved);
              if (storedSource) await markSourceDocumentStatus(storedSource.id, "EXTRACTED", saved.documentType);
            }
          } catch (attError) {
            failureCount += 1;
            console.warn(`Extraction failed for attachment ${attachment.name}:`, attError);
          }
        }
      } else {
        let extracted = await extractPayload({ textData: body || subject, fileName: subject || "Email invoice", model: "gemini-3.5-flash-lite", sourceType: "EMAIL", emailContext: { sender, subject, receivedAt, body, emailRecordId: manualEmail?.id } });
        extracted = { ...extracted, sourceEmailId: manualEmail?.id };
        const saved = await saveExtracted(extracted);
        sourcePayloadsRef.current.set(saved.id, { textData: body || subject, fileName: subject || "Email invoice", model: "gemini-3.5-flash-lite", sourceType: "EMAIL", emailContext: { sender, subject, receivedAt, body, emailRecordId: manualEmail?.id } });
        extractedInvoices.push(saved);
      }
      if (extractedInvoices.length) {
        try {
          const [existingVendors, existingProfiles] = await Promise.all([
            listCompanyVendors().catch(() => []),
            listEmailIntakeProfiles().catch(() => []),
          ]);
          const candidateItems = extractedInvoices.map((inv) => ({
            candidateId: inv.id,
            evidence: extractVendorEvidenceFromInvoice(inv, inv.sourceMetadata),
            sourceRef: {
              fileName: inv.fileName,
              sender,
              subject,
            },
          }));
          const { resolutions } = resolveBatchVendors(candidateItems, existingVendors, existingProfiles);
          for (const inv of extractedInvoices) {
            if (resolutions[inv.id]) {
              inv.entityResolution = resolutions[inv.id];
            }
          }
        } catch {
          // Safe fallback
        }
        startReview(extractedInvoices, undefined, "inbox");
      }
      if (extractedInvoices.length > 0) {
        const msg = failureCount > 0
          ? `Processed ${extractedInvoices.length} invoice${extractedInvoices.length === 1 ? "" : "s"} (${failureCount} attachment${failureCount === 1 ? "" : "s"} skipped or failed).`
          : `Email processed: ${classification.documentType || "financial document"} detected and saved for review.`;
        showNotification(failureCount > 0 ? "info" : "success", msg);
      } else if (failureCount > 0) {
        showNotification("error", `Could not extract invoices from ${failureCount} attachment${failureCount === 1 ? "" : "s"}.`);
      }
      return classification;
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Email processing failed. Check the message and try again."));
      return null;
    } finally {
      setProcessingCount((n) => Math.max(0, n - 1));
    }
  };

  const gmailRequest = async (path: string, body?: any) => {
    const token = getGoogleProviderToken();
    if (!token) throw new Error("Gmail authorization is missing or expired. Reconnect Google + Gmail.");
    const response = await companyApiRequest(path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, companyId: companyAccess.activeCompanyId || "", googleAccessToken: token });
    const result = await response.json();
    if (!response.ok || !result.success) {
      const error: any = new Error(result.error || "Gmail request failed.");
      error.code = result.code;
      throw error;
    }
    return result.data;
  };

  const handleScanGmail = async (window: GmailScanWindow | number): Promise<GmailMessageCandidate[]> => {
    if (!session) throw new Error("Connect Google + Gmail first.");
    setProcessingCount((n) => n + 1);
    try {
      const selectedWindow = typeof window === "number" ? { days: window } : window;
      const result = await scanConnectedMailbox(selectedWindow);
      if (result.historyId) {
        setSyncState((curr) => ({ ...curr, lastHistoryId: result.historyId, lastSyncedAt: result.lastSyncedAt }));
      }
      showNotification("success", `Scanned Gmail and discovered ${result.messages.length} likely finance email${result.messages.length === 1 ? "" : "s"}.`);
      return result.messages;
    } finally {
      setProcessingCount((n) => Math.max(0, n - 1));
    }
  };

  const handleSyncGmail = async (): Promise<GmailMessageCandidate[]> => {
    if (!session) throw new Error("Connect Google + Gmail first.");
    if (!syncState.lastHistoryId) return handleScanGmail({ days: 30 });
    setProcessingCount((n) => n + 1);
    try {
      const result = await syncConnectedMailbox(syncState.lastHistoryId);
      if (result.historyId) {
        setSyncState((curr) => ({ ...curr, lastHistoryId: result.historyId, lastSyncedAt: result.lastSyncedAt }));
      }
      showNotification("success", result.messages.length ? `Found ${result.messages.length} new/changed Gmail message${result.messages.length === 1 ? "" : "s"}.` : "Gmail is up to date.");
      return result.messages;
    } catch (error: any) {
      if (error?.code === "HISTORY_EXPIRED") {
        showNotification("info", "Gmail's incremental cursor expired. Rebuilding it with a fresh 30-day scan.");
        return handleScanGmail({ days: 30 });
      }
      throw error;
    } finally {
      setProcessingCount((n) => Math.max(0, n - 1));
    }
  };

  const handleImportGmailMessage = async (candidate: GmailMessageCandidate) => {
    if (!session) throw new Error("Connect Google + Gmail first.");
    if (isSupabaseConfigured && !hasAllPermissions(permissions, [PERMISSION_KEYS.invoicesWrite, PERMISSION_KEYS.invoicesExtract, PERMISSION_KEYS.invoicesVerify])) {
      throw new Error("Invoice extraction requires invoice management, extraction, and verification permissions in this company.");
    }
    setProcessingCount((n) => n + 1);
    try {
      const imported = await gmailRequest("/api/gmail/import", { messageId: candidate.id }) as GmailImportedMessage;
      const stored = await saveGmailMessageSource(imported);
      if (candidate.classification) await markEmailClassification(stored.email.id, candidate.classification);
      let extractedCount = 0;
      let failureCount = 0;
      const extractedInvoices: InvoiceData[] = [];

      for (let index = 0; index < imported.attachments.length; index += 1) {
        const attachment = imported.attachments[index];
        if (!attachment.dataBase64 || !isExtractableAttachment(attachment.mimeType, attachment.filename)) continue;
        const source = stored.documents.find((d) => (attachment.attachmentId && d.gmailAttachmentId === attachment.attachmentId) || d.filename === attachment.filename) || stored.documents[index];
        try {
          const sourceCriteria = {
            sourceSha256: source?.sha256,
            sourceDocumentId: source?.id,
            gmailMessageId: imported.id,
            gmailAttachmentId: attachment.attachmentId,
            fileName: attachment.filename,
          };
          const existingMatch = findExistingInvoiceForSourcePayload(sourceCriteria, invoicesRef.current);
          let existingInvoice = existingMatch.existingInvoice;
          if (!existingInvoice && session && supabase && source) {
            existingInvoice = (await findExistingInvoiceBySource(sourceCriteria).catch(() => null)) || undefined;
          }

          if (existingInvoice) {
            const matchedCandidate: InvoiceData = {
              ...existingInvoice,
              duplicateStatus: "POSSIBLE_DUPLICATE",
              duplicateOfId: existingInvoice.id,
              duplicateReasons: existingMatch.reasons.length
                ? existingMatch.reasons
                : [`Identical source attachment already processed as Invoice ${existingInvoice.invoiceNumber || existingInvoice.id}.`],
              reviewStatus: existingInvoice.reviewStatus || "NEEDS_REVIEW",
            };
            sourcePayloadsRef.current.set(matchedCandidate.id, {
              fileData: attachment.dataBase64,
              mimeType: attachment.mimeType,
              fileName: attachment.filename,
              model: "gemini-3.5-flash-lite",
              sourceType: "EMAIL",
              emailContext: {
                sender: imported.sender,
                subject: imported.subject,
                receivedAt: imported.receivedAt,
                body: imported.bodyText,
                attachmentName: attachment.filename,
                gmailAttachmentId: attachment.attachmentId,
                emailReference: imported.id,
                gmailMessageId: imported.id,
                gmailThreadId: imported.threadId,
                emailRecordId: stored.email.id,
                sourceDocumentId: source?.id,
                sourceStoragePath: source?.storagePath,
                rawEmailStoragePath: stored.email.rawStoragePath,
              },
            });
            extractedInvoices.push(matchedCandidate);
            if (source?.id) await markSourceDocumentStatus(source.id, "EXTRACTED", matchedCandidate.documentType);
            extractedCount += 1;
          } else {
            let extracted = await extractPayload({
              fileData: attachment.dataBase64,
              mimeType: attachment.mimeType,
              fileName: attachment.filename,
              model: "gemini-3.5-flash-lite",
              sourceType: "EMAIL",
              emailContext: {
                sender: imported.sender,
                subject: imported.subject,
                receivedAt: imported.receivedAt,
                body: imported.bodyText,
                attachmentName: attachment.filename,
                gmailAttachmentId: attachment.attachmentId,
                emailReference: imported.id,
                gmailMessageId: imported.id,
                gmailThreadId: imported.threadId,
                emailRecordId: stored.email.id,
                sourceDocumentId: source?.id,
                sourceStoragePath: source?.storagePath,
                rawEmailStoragePath: stored.email.rawStoragePath,
              },
            });
            extracted = {
              ...extracted,
              fileName: attachment.filename,
              fileSize: attachment.size,
              fileType: attachment.mimeType,
              sourceEmailId: stored.email.id,
              sourceDocumentId: source?.id,
              sourceStoragePath: source?.storagePath,
              sourceSha256: source?.sha256,
              previewUrl: source?.previewUrl,
            };
            const saved = await saveExtracted(extracted, source?.previewUrl);
            sourcePayloadsRef.current.set(saved.id, {
              fileData: attachment.dataBase64,
              mimeType: attachment.mimeType,
              fileName: attachment.filename,
              model: "gemini-3.5-flash-lite",
              sourceType: "EMAIL",
              emailContext: {
                sender: imported.sender,
                subject: imported.subject,
                receivedAt: imported.receivedAt,
                body: imported.bodyText,
                attachmentName: attachment.filename,
                gmailAttachmentId: attachment.attachmentId,
                emailReference: imported.id,
                gmailMessageId: imported.id,
                gmailThreadId: imported.threadId,
                emailRecordId: stored.email.id,
                sourceDocumentId: source?.id,
                sourceStoragePath: source?.storagePath,
                rawEmailStoragePath: stored.email.rawStoragePath,
              },
            });
            extractedInvoices.push(saved);
            if (source?.id) await markSourceDocumentStatus(source.id, "EXTRACTED", extracted.documentType);
            extractedCount += 1;
          }
        } catch (attError) {
          failureCount += 1;
          console.warn(`Extraction failed for Gmail attachment ${attachment.filename}:`, attError);
        }
      }

      if (extractedCount === 0 && candidate.classification?.isInvoiceLike && imported.bodyText) {
        let extracted = await extractPayload({
          textData: imported.bodyText,
          fileName: imported.subject || "Gmail invoice",
          model: "gemini-3.5-flash-lite",
          sourceType: "EMAIL",
          emailContext: { sender: imported.sender, subject: imported.subject, receivedAt: imported.receivedAt, body: imported.bodyText, emailReference: imported.id, gmailMessageId: imported.id, gmailThreadId: imported.threadId, emailRecordId: stored.email.id, rawEmailStoragePath: stored.email.rawStoragePath },
        });
        extracted = { ...extracted, sourceEmailId: stored.email.id };
        const saved = await saveExtracted(extracted);
        sourcePayloadsRef.current.set(saved.id, { textData: imported.bodyText, fileName: imported.subject || "Gmail invoice", model: "gemini-3.5-flash-lite", sourceType: "EMAIL", emailContext: { sender: imported.sender, subject: imported.subject, receivedAt: imported.receivedAt, body: imported.bodyText, emailReference: imported.id, gmailMessageId: imported.id, gmailThreadId: imported.threadId, emailRecordId: stored.email.id, rawEmailStoragePath: stored.email.rawStoragePath } });
        extractedInvoices.push(saved);
        extractedCount = 1;
      }
      if (extractedInvoices.length) {
        try {
          const [existingVendors, existingProfiles] = await Promise.all([
            listCompanyVendors().catch(() => []),
            listEmailIntakeProfiles().catch(() => []),
          ]);
          const matchingProfile = existingProfiles.find((p) => p.id === candidate.classification?.matchedProfileId);
          const candidateItems = extractedInvoices.map((inv) => ({
            candidateId: inv.id,
            evidence: extractVendorEvidenceFromInvoice(inv, inv.sourceMetadata, matchingProfile),
            sourceRef: {
              messageId: candidate.id,
              subject: candidate.subject,
              sender: candidate.sender,
              fileName: inv.fileName,
              attachmentId: inv.sourceMetadata?.gmailAttachmentId,
            },
          }));
          const { resolutions } = resolveBatchVendors(candidateItems, existingVendors, existingProfiles);
          for (const inv of extractedInvoices) {
            if (resolutions[inv.id]) {
              const res = resolutions[inv.id];
              const preliminaryOverride = (candidate as any).preliminaryResolution as EntityResolutionResult | undefined;
              // Authoritative extracted evidence wins. Only adopt preliminary override if there are no contradictory conflicts
              if (
                preliminaryOverride &&
                preliminaryOverride.proposedAction === "LINK_EXISTING" &&
                preliminaryOverride.matchedEntityId &&
                (!res.conflicts || res.conflicts.length === 0) &&
                (!res.matchedEntityId || res.matchedEntityId === preliminaryOverride.matchedEntityId)
              ) {
                const chosenVendor = existingVendors.find((v) => v.id === preliminaryOverride.matchedEntityId);
                inv.entityResolution = {
                  ...res,
                  proposedAction: "LINK_EXISTING",
                  matchedEntityId: preliminaryOverride.matchedEntityId,
                  matchedEntityName: chosenVendor?.name || preliminaryOverride.matchedEntityName,
                  matchReasons: [`User confirmed vendor in Email Intake: ${chosenVendor?.name || preliminaryOverride.matchedEntityId}.`, ...res.matchReasons],
                };
              } else {
                inv.entityResolution = res;
              }
            }
          }
        } catch {
          // Safe fallback
        }
        startReview(extractedInvoices, undefined, "inbox");
      }
      if (extractedInvoices.length > 0) {
        const msg = failureCount > 0
          ? `Saved original Gmail message; extracted ${extractedCount} invoice${extractedCount === 1 ? "" : "s"} (${failureCount} attachment${failureCount === 1 ? "" : "s"} failed).`
          : `Saved original Gmail message and ${stored.documents.length} attachment${stored.documents.length === 1 ? "" : "s"}; created ${extractedCount} invoice extraction${extractedCount === 1 ? "" : "s"}.`;
        showNotification(failureCount > 0 ? "info" : "success", msg);
      } else if (failureCount > 0) {
        showNotification("error", `Could not extract invoices from ${failureCount} attachment${failureCount === 1 ? "" : "s"}.`);
      }
      return extractedCount;
    } finally {
      setProcessingCount((n) => Math.max(0, n - 1));
    }
  };

  const handleLoadPreset = (preset: InvoiceData) => {
    // Presets are QA-only. Never send them through saveExtracted, which is the
    // same persistence path used by uploads and email-derived invoices.
    showNotification("info", `${preset.invoiceNumber || "Sample preset"} is available for QA only and was not added to invoice records.`);
  };

  const handleSaveInvoiceProjectAllocations = async (invoice: InvoiceData, allocations: InvoiceProjectAllocation[]) => {
    try {
      if (isSupabaseConfigured && !hasAllPermissions(permissions, [PERMISSION_KEYS.invoicesWrite, PERMISSION_KEYS.projectsWrite])) throw new Error("You do not have permission to manage invoice project allocations in this company.");
      const saved = session && supabase
        ? await replaceInvoiceProjectAllocationsOnSupabase(invoice.id, invoice.grandTotal, allocations, invoice.updatedAt)
        : { allocations: replaceInvoiceProjectAllocationsLocally(invoice.id, invoice.grandTotal, invoiceProjectAllocations, allocations).filter((allocation) => allocation.invoiceId === invoice.id), invoiceUpdatedAt: undefined };
      if (saved.invoiceUpdatedAt) {
        const withFreshToken = { ...invoice, updatedAt: saved.invoiceUpdatedAt };
        invoicesRef.current = invoicesRef.current.map((item) => item.id === invoice.id ? withFreshToken : item);
        setInvoices(invoicesRef.current);
        setSelectedInvoice((current) => current?.id === invoice.id ? withFreshToken : current);
        lastPersistedRef.current.set(invoice.id, withFreshToken);
      }
      setInvoiceProjectAllocations((current) => [...current.filter((allocation) => allocation.invoiceId !== invoice.id), ...saved.allocations]);
      showNotification("success", allocations.length ? "Invoice project allocation saved." : "Invoice is now unallocated.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save invoice project allocation."));
      throw error;
    }
  };

  const handleSaveExpense = async (expense: Expense) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.expensesWrite)) throw new Error("You do not have permission to manage expenses in this company.");
      const saved = session && supabase ? await saveExpenseToSupabase(expense) : { ...expense, updatedAt: new Date().toISOString() };
      setExpenses((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setExpenseFormContext(null);
      showNotification("success", "Expense saved.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save expense."));
    }
  };

  const handleSaveClientBilling = async (input: ClientBillingInput, lines: readonly ClientBillingLineInput[]) => {
    try {
      if (isSupabaseConfigured && !guestModeState && !can(PERMISSION_KEYS.projectsWrite)) throw new Error("You do not have permission to manage client billings in this company.");
      const project = projects.find((candidate) => candidate.id === input.projectId);
      if (!project) throw new Error("The selected project is not available in this workspace.");
      const existing = input.id ? clientBillingData.billings.find((billing) => billing.id === input.id) : undefined;
      const normalizedNumber = input.billingNumber.trim().toUpperCase();
      if (!normalizedNumber) throw new Error("Billing number is required.");
      if (clientBillingData.billings.some((billing) => billing.id !== input.id && billing.billingNumber.trim().toUpperCase() === normalizedNumber)) {
        throw new Error("Billing number already exists in this deployment company.");
      }

      if (session && supabase && !guestModeState) {
        const saved = await saveClientBillingToSupabase({ ...input, currency: project.currency }, lines, existing);
        setClientBillingData((current) => ({ ...current, billings: upsertClientBilling(current.billings, saved) }));
        try { await refreshWorkspaceGroups(["engineering"], currentWorkspaceLoadToken(), { force: true, reason: "client-billing-save" }); } catch { /* The saved RPC result remains visible; realtime/load can reconcile later. */ }
      } else {
        const saved = buildLocalClientBilling({ ...input, currency: project.currency, clientNameSnapshot: input.clientNameSnapshot || project.clientName }, lines, existing, "guest-company");
        const event = appendClientBillingEvent(clientBillingData.events, saved, existing ? "UPDATED" : "CREATED", existing?.status);
        setClientBillingData({ billings: upsertClientBilling(clientBillingData.billings, saved), events: event });
      }
      showNotification("success", "Client billing draft saved.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save client billing."));
      throw error;
    }
  };

  const handleTransitionClientBilling = async (id: string, targetStatus: ClientBillingStatus, reason?: string) => {
    try {
      if (isSupabaseConfigured && !guestModeState && !can(PERMISSION_KEYS.projectsWrite)) throw new Error("You do not have permission to change client billing lifecycle state.");
      const current = clientBillingData.billings.find((billing) => billing.id === id);
      const project = current ? projects.find((candidate) => candidate.id === current.projectId) : undefined;
      if (!current || !project) throw new Error("Client billing or its project is not available in this workspace.");
      if (session && supabase && !guestModeState) {
        const saved = await transitionClientBillingToSupabase(id, targetStatus, reason);
        setClientBillingData((value) => ({ ...value, billings: upsertClientBilling(value.billings, saved) }));
        try { await refreshWorkspaceGroups(["engineering"], currentWorkspaceLoadToken(), { force: true, reason: "client-billing-transition" }); } catch { /* Keep the authoritative RPC result visible until the next refresh. */ }
      } else {
        const result = applyLocalClientBillingTransition(current, targetStatus, project, clientBillingData.billings, reason);
        setClientBillingData((value) => ({ billings: value.billings.map((billing) => billing.id === id ? result.billing : billing), events: [result.event, ...value.events] }));
      }
      showNotification("success", targetStatus === "ISSUED" ? "Client billing issued." : `Client billing marked ${targetStatus.toLowerCase().replaceAll("_", " ")}.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not change client billing lifecycle state."));
      throw error;
    }
  };

  const handleSaveClientCollection = async (input: ClientCollectionInput, allocations: readonly ClientCollectionAllocationInput[]) => {
    try {
      if (isSupabaseConfigured && !guestModeState && !can(PERMISSION_KEYS.projectsWrite)) throw new Error("You do not have permission to manage client collections in this company.");
      const project = projects.find((candidate) => candidate.id === input.projectId);
      if (!project) throw new Error("The selected project is not available in this workspace.");
      const existing = input.id ? clientCollectionData.collections.find((c) => c.id === input.id) : undefined;
      const normalizedNumber = input.collectionNumber.trim().toUpperCase();
      if (!normalizedNumber) throw new Error("Collection number is required.");
      if (clientCollectionData.collections.some((c) => c.id !== input.id && c.collectionNumber.trim().toUpperCase() === normalizedNumber)) {
        throw new Error("Collection number already exists in this deployment company.");
      }

      if (session && supabase && !guestModeState) {
        const saved = await saveClientCollectionToSupabase({ ...input, currency: project.currency }, allocations, existing);
        setClientCollectionData((current) => ({ ...current, collections: upsertClientCollection(current.collections, saved) }));
        try { await refreshWorkspaceGroups(["engineering"], currentWorkspaceLoadToken(), { force: true, reason: "client-collection-save" }); } catch { /* The saved RPC result remains visible. */ }
      } else {
        const saved = buildLocalClientCollection({ ...input, currency: project.currency, payerSnapshot: input.payerSnapshot || project.clientName }, allocations, existing, "guest-company");
        const event = appendClientCollectionEvent(clientCollectionData.events, saved, existing ? "UPDATED" : "CREATED", existing?.status);
        setClientCollectionData({ collections: upsertClientCollection(clientCollectionData.collections, saved), events: event });
      }
      showNotification("success", "Client collection draft saved.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save client collection."));
      throw error;
    }
  };

  const handleRecordClientCollection = async (id: string) => {
    try {
      if (isSupabaseConfigured && !guestModeState && !can(PERMISSION_KEYS.projectsWrite)) throw new Error("You do not have permission to record client collections.");
      const current = clientCollectionData.collections.find((c) => c.id === id);
      const project = current ? projects.find((candidate) => candidate.id === current.projectId) : undefined;
      if (!current || !project) throw new Error("Client collection or its project is not available in this workspace.");
      if (session && supabase && !guestModeState) {
        const saved = await recordClientCollectionToSupabase(id);
        setClientCollectionData((value) => ({ ...value, collections: upsertClientCollection(value.collections, saved) }));
        try { await refreshWorkspaceGroups(["engineering"], currentWorkspaceLoadToken(), { force: true, reason: "client-collection-record" }); } catch { /* The saved RPC result remains visible. */ }
      } else {
        const result = applyLocalClientCollectionRecord(current, project, clientBillingData.billings, clientCollectionData.collections);
        setClientCollectionData((value) => ({ collections: value.collections.map((c) => c.id === id ? result.collection : c), events: [result.event, ...value.events] }));
      }
      showNotification("success", "Client collection recorded.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not record client collection."));
      throw error;
    }
  };

  const handleReverseClientCollection = async (id: string, reason: string) => {
    try {
      if (isSupabaseConfigured && !guestModeState && !can(PERMISSION_KEYS.projectsWrite)) throw new Error("You do not have permission to reverse client collections.");
      const current = clientCollectionData.collections.find((c) => c.id === id);
      const project = current ? projects.find((candidate) => candidate.id === current.projectId) : undefined;
      if (!current || !project) throw new Error("Client collection or its project is not available in this workspace.");
      if (session && supabase && !guestModeState) {
        const saved = await reverseClientCollectionToSupabase(id, reason);
        setClientCollectionData((value) => ({ ...value, collections: upsertClientCollection(value.collections, saved) }));
        try { await refreshWorkspaceGroups(["engineering"], currentWorkspaceLoadToken(), { force: true, reason: "client-collection-reverse" }); } catch { /* The saved RPC result remains visible. */ }
      } else {
        const result = applyLocalClientCollectionReversal(current, reason);
        setClientCollectionData((value) => ({ collections: value.collections.map((c) => c.id === id ? result.collection : c), events: [result.event, ...value.events] }));
      }
      showNotification("success", "Client collection reversed.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not reverse client collection."));
      throw error;
    }
  };

  const handleSaveCostCode = async (costCode: {
    id?: string;
    projectId: string;
    code: string;
    name: string;
    description?: string;
    approvedBudgetAmount: number;
    forecastAmount?: number;
    status: ProjectCostCode["status"];
  }) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.projectsWrite)) {
        throw new Error("You do not have permission to manage project cost codes.");
      }
      if (session && supabase) {
        const saved = await saveProjectCostCodeToSupabase(costCode);
        setCostCodes((prev) => {
          const index = prev.findIndex((c) => c.id === saved.id);
          return index >= 0 ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev];
        });
        showNotification("success", `Cost code ${saved.code} saved.`);
      } else {
        const now = new Date().toISOString();
        const id = costCode.id || `costcode-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const localRecord: ProjectCostCode = {
          id,
          companyId: "guest-company",
          projectId: costCode.projectId,
          code: costCode.code.trim().toUpperCase(),
          name: costCode.name.trim(),
          description: costCode.description?.trim() || undefined,
          approvedBudgetAmount: Number(costCode.approvedBudgetAmount) || 0,
          forecastAmount: costCode.forecastAmount !== undefined && costCode.forecastAmount !== null ? Number(costCode.forecastAmount) : undefined,
          status: costCode.status || "ACTIVE",
          createdAt: now,
          updatedAt: now,
        };
        setCostCodes((prev) => {
          const index = prev.findIndex((c) => c.id === id);
          const next = index >= 0 ? prev.map((c) => (c.id === id ? localRecord : c)) : [localRecord, ...prev];
          writeProjectCostCodesToLocal(next);
          return next;
        });
        showNotification("success", `Cost code ${localRecord.code} saved.`);
      }
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save cost code."));
      throw error;
    }
  };

  const handleArchiveCostCode = async (costCodeId: string) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.projectsWrite)) {
        throw new Error("You do not have permission to manage project cost codes.");
      }
      if (session && supabase) {
        const archived = await archiveProjectCostCodeInSupabase(costCodeId);
        setCostCodes((prev) => prev.map((c) => (c.id === archived.id ? archived : c)));
        showNotification("success", `Cost code ${archived.code} archived.`);
      } else {
        setCostCodes((prev) => {
          const next = prev.map((c) => (c.id === costCodeId ? { ...c, status: "ARCHIVED" as const, updatedAt: new Date().toISOString() } : c));
          writeProjectCostCodesToLocal(next);
          return next;
        });
        showNotification("success", "Cost code archived.");
      }
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not archive cost code."));
      throw error;
    }
  };

  const handleReactivateCostCode = async (costCodeId: string) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.projectsWrite)) {
        throw new Error("You do not have permission to manage project cost codes.");
      }
      if (session && supabase) {
        const reactivated = await reactivateProjectCostCodeInSupabase(costCodeId);
        setCostCodes((prev) => prev.map((c) => (c.id === reactivated.id ? reactivated : c)));
        showNotification("success", `Cost code ${reactivated.code} reactivated.`);
      } else {
        setCostCodes((prev) => {
          const next = prev.map((c) => (c.id === costCodeId ? { ...c, status: "ACTIVE" as const, updatedAt: new Date().toISOString() } : c));
          writeProjectCostCodesToLocal(next);
          return next;
        });
        showNotification("success", "Cost code reactivated.");
      }
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not reactivate cost code."));
      throw error;
    }
  };

  const handleSavePO = useCallback(async (
    po: Partial<PurchaseOrder> & { poNumber: string; vendorId: string; projectId: string },
    lines: Array<Partial<PurchaseOrderLine> & { description: string; quantity: number; unitPrice: number }>,
  ) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to create or edit purchase orders.");
      }
      const saved = await savePurchaseOrder(po, lines);
      setPurchaseOrders((prev) => {
        const index = prev.findIndex((p) => p.id === saved.id);
        const next = index >= 0 ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev];
        if (!isSupabaseConfigured) writePurchaseOrdersToLocal(next);
        return next;
      });
      showNotification("success", `Purchase order ${saved.poNumber} saved.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save purchase order."));
      throw error;
    }
  }, [permissions, session]);

  const handleTransitionPO = useCallback(async (id: string, targetStatus: PurchaseOrderStatus, reason?: string) => {
    try {
      if (isSupabaseConfigured) {
        if (targetStatus === "APPROVED" && !can(PERMISSION_KEYS.procurementApprove)) {
          throw new Error("You do not have permission to approve purchase orders.");
        }
        if (targetStatus !== "APPROVED" && !can(PERMISSION_KEYS.procurementWrite)) {
          throw new Error("You do not have permission to manage purchase orders.");
        }
      }
      const updated = await transitionPurchaseOrderStatus(id, targetStatus, reason);
      setPurchaseOrders((prev) => {
        const next = prev.map((p) => (p.id === updated.id ? updated : p));
        if (!isSupabaseConfigured) writePurchaseOrdersToLocal(next);
        return next;
      });
      showNotification("success", `Purchase order ${updated.poNumber} transitioned to ${targetStatus}.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not transition purchase order."));
      throw error;
    }
  }, [permissions, session]);

  const handleDeletePO = useCallback(async (id: string) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to delete draft purchase orders.");
      }
      await deleteDraftPurchaseOrder(id);
      setPurchaseOrders((prev) => {
        const next = prev.filter((p) => p.id !== id);
        if (!isSupabaseConfigured) writePurchaseOrdersToLocal(next);
        return next;
      });
      showNotification("success", "Draft purchase order deleted.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not delete draft purchase order."));
      throw error;
    }
  }, [permissions, session]);

  const handleSaveSubcontract = useCallback(async (
    subcontract: Partial<Subcontract> & { subcontractNumber: string; vendorId: string; projectId: string; title: string },
    lines: Array<Partial<SubcontractLine> & { description: string; amount: number }>,
  ) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to create or edit subcontracts.");
      }
      const saved = await saveSubcontract(subcontract, lines);
      setSubcontracts((prev) => {
        const index = prev.findIndex((item) => item.id === saved.id);
        const next = index >= 0 ? prev.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...prev];
        if (!isSupabaseConfigured) writeSubcontractsToLocal(next);
        return next;
      });
      showNotification("success", `Subcontract ${saved.subcontractNumber} saved.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save subcontract."));
      throw error;
    }
  }, [permissions, session]);

  const handleTransitionSubcontract = useCallback(async (id: string, targetStatus: SubcontractStatus, reason?: string) => {
    try {
      // The database lifecycle RPC intentionally treats every transition as a
      // consequential approval boundary, including activation, close, and
      // cancellation. Keep the client gate identical to that authority.
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.procurementApprove)) {
        throw new Error("You do not have permission to transition subcontract lifecycle status.");
      }
      const updated = await transitionSubcontract(id, targetStatus, reason);
      setSubcontracts((prev) => {
        const next = prev.map((item) => (item.id === updated.id ? updated : item));
        if (!isSupabaseConfigured) writeSubcontractsToLocal(next);
        return next;
      });
      showNotification("success", `Subcontract ${updated.subcontractNumber} transitioned to ${targetStatus}.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not transition subcontract."));
      throw error;
    }
  }, [permissions, session]);

  const handleDeleteSubcontract = useCallback(async (id: string) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to delete draft subcontracts.");
      }
      await deleteDraftSubcontract(id);
      setSubcontracts((prev) => {
        const next = prev.filter((item) => item.id !== id);
        if (!isSupabaseConfigured) writeSubcontractsToLocal(next);
        return next;
      });
      showNotification("success", "Draft subcontract deleted.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not delete draft subcontract."));
      throw error;
    }
  }, [permissions, session]);

  const handleAddVendor = useCallback(async (vendor: Partial<Vendor> & { name: string }) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.procurementWrite) && !can(PERMISSION_KEYS.invoicesWrite)) {
        throw new Error("You do not have permission to add vendors.");
      }
      const saved = await saveVendor(vendor);
      setVendors((prev) => {
        const index = prev.findIndex((v) => v.id === saved.id);
        const next = index >= 0 ? prev.map((v) => (v.id === saved.id ? saved : v)) : [...prev, saved];
        if (!isSupabaseConfigured) writeVendorsToLocal(next);
        return next;
      });
      showNotification("success", `Vendor "${saved.name}" created.`);
      return saved;
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not create vendor."));
      throw error;
    }
  }, [permissions, session]);

  const handleRecordReceipt = useCallback(async (
    receipt: Partial<PurchaseOrderReceipt> & { purchaseOrderId: string; receiptNumber: string },
    lines: Array<{ purchaseOrderLineId: string; receivedQuantity: number; notes?: string }>,
  ) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to record purchase order delivery receipts.");
      }
      const saved = await recordPurchaseOrderReceipt(receipt, lines);
      setPurchaseOrderReceipts((prev) => {
        const next = [saved, ...prev.filter((r) => r.id !== saved.id)];
        if (!isSupabaseConfigured) writePurchaseOrderReceiptsToLocal(next);
        return next;
      });
      showNotification("success", `Goods receipt ${saved.receiptNumber} recorded successfully.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not record delivery receipt."));
      throw error;
    }
  }, [permissions, session]);

  const handleVoidReceipt = useCallback(async (receiptId: string, reason: string) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to void purchase order receipts.");
      }
      const voided = await voidPurchaseOrderReceipt(receiptId, reason);
      setPurchaseOrderReceipts((prev) => {
        const next = prev.map((r) => (r.id === voided.id ? voided : r));
        if (!isSupabaseConfigured) writePurchaseOrderReceiptsToLocal(next);
        return next;
      });
      showNotification("success", `Goods receipt ${voided.receiptNumber} has been voided.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not void delivery receipt."));
      throw error;
    }
  }, [permissions, session]);

  const handleConfirmPurchaseOrderMatch = useCallback(async (
    poId: string,
    lines: Array<{
      invoiceLineId: string;
      purchaseOrderLineId: string;
      matchedQuantity?: number;
      matchedAmount?: number;
    }>,
    notes?: string,
  ) => {
    try {
      if (isSupabaseConfigured && (!can(PERMISSION_KEYS.procurementWrite) || !can(PERMISSION_KEYS.invoicesWrite))) {
        throw new Error("You do not have permission to match supplier invoices to purchase orders.");
      }
      if (!selectedInvoice) {
        throw new Error("No invoice selected to match.");
      }
      const match = await confirmPurchaseOrderMatch({
        invoiceId: selectedInvoice.id,
        purchaseOrderId: poId,
        matchSource: "MANUAL",
        notes,
        lines,
      });
      setPurchaseOrderMatches((prev) => {
        const next = [match, ...prev.filter((m) => m.id !== match.id && !(m.invoiceId === selectedInvoice.id && m.status === "CONFIRMED"))];
        if (!isSupabaseConfigured) writePurchaseOrderMatchesToLocal(next);
        return next;
      });
      showNotification("success", "Supplier invoice matched to purchase order.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not match purchase order."));
      throw error;
    }
  }, [permissions, session, selectedInvoice]);

  const handleUnmatchPurchaseOrderMatch = useCallback(async (matchId: string, reason: string) => {
    try {
      if (isSupabaseConfigured && (!can(PERMISSION_KEYS.procurementWrite) || !can(PERMISSION_KEYS.invoicesWrite))) {
        throw new Error("You do not have permission to unmatch supplier invoices.");
      }
      const unmatchResult = await unmatchPurchaseOrderMatch(matchId, reason);
      setPurchaseOrderMatches((prev) => {
        const next = prev.map((m) => (m.id === matchId ? unmatchResult : m));
        if (!isSupabaseConfigured) writePurchaseOrderMatchesToLocal(next);
        return next;
      });
      showNotification("success", "Purchase order match removed.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not unmatch purchase order."));
      throw error;
    }
  }, [permissions, session]);

  const handleSaveRFQ = useCallback(async (
    rfq: Partial<RFQ> & { rfqNumber: string; title: string },
    lines: Array<Partial<RFQLine> & { description: string; quantity: number }>,
    invitedVendorIds?: string[],
  ) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to create or edit RFQs.");
      }
      const saved = await saveRFQ(rfq, lines, invitedVendorIds);
      setRfqs((prev) => {
        const index = prev.findIndex((r) => r.id === saved.id);
        const next = index >= 0 ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev];
        if (!isSupabaseConfigured) writeRFQsToLocal(next);
        return next;
      });
      showNotification("success", `RFQ ${saved.rfqNumber} saved.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save RFQ."));
      throw error;
    }
  }, [permissions, session]);

  const handleTransitionRFQ = useCallback(async (id: string, targetStatus: RFQStatus, reason?: string) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to transition RFQ status.");
      }
      const updated = await transitionRFQStatus(id, targetStatus, reason);
      setRfqs((prev) => {
        const next = prev.map((r) => (r.id === updated.id ? updated : r));
        if (!isSupabaseConfigured) writeRFQsToLocal(next);
        return next;
      });
      showNotification("success", `RFQ ${updated.rfqNumber} transitioned to ${targetStatus}.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not transition RFQ."));
      throw error;
    }
  }, [permissions, session]);

  const handleDeleteRFQ = useCallback(async (id: string) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to delete draft RFQs.");
      }
      await deleteDraftRFQ(id);
      setRfqs((prev) => {
        const next = prev.filter((r) => r.id !== id);
        if (!isSupabaseConfigured) writeRFQsToLocal(next);
        return next;
      });
      showNotification("success", "Draft RFQ deleted.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not delete draft RFQ."));
      throw error;
    }
  }, [permissions, session]);

  const handleSaveSupplierQuotation = useCallback(async (
    quotation: Partial<SupplierQuotation> & { rfqId: string; vendorId: string; quotationNumber: string },
    lines: Array<Partial<SupplierQuotationLine> & { description: string; quantity: number; unitPrice: number }>,
  ) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to record supplier quotations.");
      }
      const saved = await saveSupplierQuotation(quotation, lines);
      setSupplierQuotations((prev) => {
        const index = prev.findIndex((q) => q.id === saved.id);
        const next = index >= 0 ? prev.map((q) => (q.id === saved.id ? saved : q)) : [saved, ...prev];
        if (!isSupabaseConfigured) writeSupplierQuotationsToLocal(next);
        return next;
      });
      showNotification("success", `Supplier quotation ${saved.quotationNumber} saved.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save supplier quotation."));
      throw error;
    }
  }, [permissions, session]);

  const handleSelectSupplierQuotation = useCallback(async (quotationId: string, reason: string) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to select preferred suppliers.");
      }
      const selected = await selectSupplierQuotation(quotationId, reason);
      setSupplierQuotations((prev) => {
        const next = prev.map((q) => {
          if (q.id === quotationId) return selected;
          if (q.rfqId === selected.rfqId && q.status === "SELECTED") return { ...q, status: "SUBMITTED" as const };
          return q;
        });
        if (!isSupabaseConfigured) writeSupplierQuotationsToLocal(next);
        return next;
      });
      setRfqs((prev) => {
        const next = prev.map((r) => (r.id === selected.rfqId ? { ...r, selectedQuotationId: selected.id } : r));
        if (!isSupabaseConfigured) writeRFQsToLocal(next);
        return next;
      });
      showNotification("success", `Supplier quotation ${selected.quotationNumber} selected.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not select supplier quotation."));
      throw error;
    }
  }, [permissions, session]);

  const handleRevertSupplierQuotationSelection = useCallback(async (rfqId: string, reason: string) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to revert supplier selections.");
      }
      const updatedRfq = await revertSupplierQuotationSelection(rfqId, reason);
      setSupplierQuotations((prev) => {
        const next = prev.map((q) => (q.rfqId === rfqId && q.status === "SELECTED" ? { ...q, status: "SUBMITTED" as const } : q));
        if (!isSupabaseConfigured) writeSupplierQuotationsToLocal(next);
        return next;
      });
      setRfqs((prev) => {
        const next = prev.map((r) => (r.id === rfqId ? updatedRfq : r));
        if (!isSupabaseConfigured) writeRFQsToLocal(next);
        return next;
      });
      showNotification("success", "Supplier selection reverted.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not revert supplier selection."));
      throw error;
    }
  }, [permissions, session]);

  const handleConvertQuotationToPO = useCallback(async (quotationId: string, poNumber: string, notes?: string) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to convert quotations to purchase orders.");
      }
      const draftPo = await convertQuotationToDraftPO(quotationId, poNumber, notes);
      setPurchaseOrders((prev) => {
        const next = [draftPo, ...prev.filter((p) => p.id !== draftPo.id)];
        if (!isSupabaseConfigured) writePurchaseOrdersToLocal(next);
        return next;
      });
      showNotification("success", `Draft purchase order ${draftPo.poNumber} created from quotation.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not convert quotation to purchase order."));
      throw error;
    }
  }, [permissions, session]);

  const previewInvoiceCorrection = async (invoice: InvoiceData): Promise<FinancialCorrectionPreview> => {
    if (session && supabase) return previewInvoiceCorrectionInSupabase(invoice.id);
    const matches = cashData.matches.filter((match) => match.targetType === "INVOICE" && match.targetId === invoice.id);
    return buildLocalInvoiceCorrectionPreview({
      invoice,
      allocationCount: invoiceProjectAllocations.filter((allocation) => allocation.invoiceId === invoice.id).length,
      settlementMatchCount: matches.length,
      confirmedSettlementCount: matches.filter((match) => match.status === "CONFIRMED").length,
      historyCount: (invoice.extractionId ? 1 : 0) + (invoice.reviewStatus === "VERIFIED" ? 1 : 0),
    });
  };

  const applyInvoiceCorrection = async (invoice: InvoiceData, action: FinancialCorrectionAction, reason?: string): Promise<FinancialCorrectionResult> => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.invoicesWrite)) throw new Error("You do not have permission to correct invoices in this company.");
      if (isSupabaseConfigured && action === "VOID" && invoice.reviewStatus === "VERIFIED" && !can(PERMISSION_KEYS.invoicesVerify)) throw new Error("Voiding a verified invoice requires invoices.verify.");
      let result: FinancialCorrectionResult;
      if (session && supabase) {
        result = await applyInvoiceCorrectionInSupabase(invoice.id, action, reason);
      } else {
        const preview = await previewInvoiceCorrection(invoice);
        if (action === "DELETE_UNUSED") throw new Error("Permanent invoice deletion requires an authoritative database preflight.");
        if (action === "VOID" && !preview.canVoid) throw new Error(preview.blockedReason || "This invoice cannot be voided.");
        const updatedAt = new Date().toISOString();
        const record = action === "VOID"
          ? { ...invoice, lifecycleStatus: "VOID" as const, voidedAt: updatedAt, voidReason: reason?.trim() || "Confirmed invoice void", updatedAt }
          : action === "ARCHIVE"
            ? { ...invoice, archivedAt: invoice.archivedAt || updatedAt, updatedAt }
            : { ...invoice, archivedAt: undefined, updatedAt };
        result = { entityType: "INVOICE", entityId: invoice.id, action, deleted: false, changed: true, preflight: preview, record };
      }
      if (result.deleted) {
        const next = invoicesRef.current.filter((item) => item.id !== result.entityId);
        invoicesRef.current = next;
        setInvoices(next);
        lastPersistedRef.current.delete(result.entityId);
        if (selectedInvoice?.id === result.entityId) setSelectedInvoice(null);
      } else if (result.record) {
        const next = invoicesRef.current.map((item) => item.id === result.entityId ? result.record as InvoiceData : item);
        invoicesRef.current = next;
        setInvoices(next);
        setSelectedInvoice((current) => current?.id === result.entityId ? result.record as InvoiceData : current);
        lastPersistedRef.current.set(result.entityId, result.record as InvoiceData);
      }
      showNotification("success", action === "VOID" ? "Invoice voided. Original values, extraction snapshots, allocations, and review history remain preserved." : action === "ARCHIVE" ? "Invoice archived for visibility only. Its financial status and history remain unchanged." : "Invoice restored to the visible directory.");
      return result;
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not complete invoice correction."));
      throw error;
    }
  };

  const previewExpenseCorrection = async (expense: Expense): Promise<FinancialCorrectionPreview> => {
    if (session && supabase) return previewExpenseCorrectionInSupabase(expense.id);
    const matches = cashData.matches.filter((match) => match.targetType === "EXPENSE" && match.targetId === expense.id);
    return buildLocalExpenseCorrectionPreview({
      expense,
      settlementMatchCount: matches.length,
      confirmedSettlementCount: matches.filter((match) => match.status === "CONFIRMED").length,
      historyCount: expense.createdAt ? 1 : 0,
    });
  };

  const applyExpenseCorrection = async (expense: Expense, action: FinancialCorrectionAction, reason?: string): Promise<FinancialCorrectionResult> => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.expensesWrite)) throw new Error("You do not have permission to correct expenses in this company.");
      let result: FinancialCorrectionResult;
      if (session && supabase) {
        result = await applyExpenseCorrectionInSupabase(expense.id, action, reason);
      } else {
        const preview = await previewExpenseCorrection(expense);
        if (action === "DELETE_UNUSED") throw new Error("Permanent expense deletion requires an authoritative database preflight.");
        if (action === "VOID" && !preview.canVoid) throw new Error(preview.blockedReason || "This expense cannot be voided.");
        const updatedAt = new Date().toISOString();
        const record = action === "VOID"
          ? { ...expense, status: "VOID" as const, voidedAt: updatedAt, voidReason: reason?.trim() || "Confirmed expense void", updatedAt }
          : action === "ARCHIVE"
            ? { ...expense, archivedAt: expense.archivedAt || updatedAt, updatedAt }
            : { ...expense, archivedAt: undefined, updatedAt };
        result = { entityType: "EXPENSE", entityId: expense.id, action, deleted: false, changed: true, preflight: preview, record };
      }
      if (result.deleted) setExpenses((current) => current.filter((item) => item.id !== result.entityId));
      else if (result.record && "expenseDate" in result.record) setExpenses((current) => current.map((item) => item.id === result.entityId ? result.record as Expense : item));
      showNotification("success", action === "VOID" ? "Expense voided and excluded from active project cost. Its history remains preserved." : action === "ARCHIVE" ? "Expense archived for visibility only. Its financial status and cost contribution remain unchanged." : "Expense restored to the visible directory.");
      return result;
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not complete expense correction."));
      throw error;
    }
  };

  const handleSaveWorker = async (worker: Worker) => {
    try {
    if (isSupabaseConfigured && !can(PERMISSION_KEYS.workersManage)) throw new Error("You do not have permission to manage workers in this company.");
      const saved = session && supabase ? await saveWorkerToSupabase(worker) : { ...worker, updatedAt: new Date().toISOString() };
      setPayrollData((current) => { const next = { ...current, workers: current.workers.some((item) => item.id === saved.id) ? current.workers.map((item) => item.id === saved.id ? saved : item) : [saved, ...current.workers], periods: revisePayrollSourcePeriods(current.periods, { allOpen: true }) }; payrollDataRef.current = next; return next; });
      showNotification("success", `${saved.displayName} saved.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save worker."));
    }
  };

  const handlePayrollLifecycle = async (request: PayrollLifecycleRequest) => {
    try {
      const requiresWorkforcePermission = ["WORKER", "PROJECT_ASSIGNMENT", "COMPENSATION_PROFILE", "RECURRING_COMPONENT"].includes(request.entity);
      if (isSupabaseConfigured && (requiresWorkforcePermission ? !can(PERMISSION_KEYS.workersManage) : !can(PERMISSION_KEYS.payrollWrite))) {
        throw new Error(requiresWorkforcePermission ? "You do not have permission to manage workforce lifecycle records in this company." : "You do not have permission to manage payroll source lifecycle records in this company.");
      }
      const current = payrollDataRef.current;
      if (request.entity === "WORKER" && request.action === "DELETE_UNUSED") {
        const summary = workerDependencySummary(request.id, {
          workers: current.workers,
          assignments: current.assignments,
          attendanceRecords: current.attendanceRecords,
          leaveRequests: current.leaveRequests,
          overtimeRequests: current.overtimeRequests,
          workEntries: current.workEntries,
          payrollEntries: current.entries,
          payrollRuns: current.runs,
          periods: current.periods,
          compensationProfiles: current.compensationProfiles,
          recurringComponents: current.recurringComponents,
          departmentManagerWorkerIds: current.departments.map((department) => department.managerWorkerId).filter((id): id is string => Boolean(id)),
          payrollImportWorkerIds: payrollImportData.rows.map((row) => row.workerId).filter((id): id is string => Boolean(id)),
        });
        if (!summary.canDelete) throw new Error(summary.blockedReason || "This employee cannot be permanently deleted. Offboard the employee instead.");
      }

      if (session && supabase) {
        if (request.entity === "WORKER" && request.action === "DELETE_UNUSED") {
          const preflight = await previewWorkerLifecycleToSupabase(request.id);
          if (preflight.canDelete !== true) throw new Error("This employee has historical workforce or payroll records and cannot be permanently deleted. Offboard the employee instead.");
        }
        const token = currentWorkspaceLoadToken();
        if (!token) throw new Error("Resolve deployment access before changing payroll lifecycle records.");
        const result = await applyPayrollLifecycleToSupabase(request);
        setPayrollData((snapshot) => {
          const next = { ...snapshot };
          if (request.entity === "WORKER") next.workers = result.deleted ? snapshot.workers.filter((item) => item.id !== request.id) : result.worker ? snapshot.workers.map((item) => item.id === result.worker!.id ? result.worker! : item) : snapshot.workers;
          if (request.entity === "PROJECT_ASSIGNMENT") next.assignments = result.deleted ? snapshot.assignments.filter((item) => item.id !== request.id) : result.assignment ? snapshot.assignments.map((item) => item.id === result.assignment!.id ? result.assignment! : item) : snapshot.assignments;
          if (request.entity === "COMPENSATION_PROFILE") next.compensationProfiles = result.deleted ? snapshot.compensationProfiles.filter((item) => item.id !== request.id) : result.profile ? [result.profile, ...snapshot.compensationProfiles.filter((item) => item.id !== result.profile!.id)] : snapshot.compensationProfiles;
          if (request.entity === "RECURRING_COMPONENT") next.recurringComponents = result.deleted ? snapshot.recurringComponents.filter((item) => item.id !== request.id) : result.component ? [result.component, ...snapshot.recurringComponents.filter((item) => item.id !== result.component!.id)] : snapshot.recurringComponents;
          if (request.entity === "WORK_ENTRY") next.workEntries = result.deleted ? snapshot.workEntries.filter((item) => item.id !== request.id) : result.workEntry ? snapshot.workEntries.map((item) => item.id === result.workEntry!.id ? result.workEntry! : item) : snapshot.workEntries;
          if (request.entity === "ATTENDANCE") next.attendanceRecords = result.deleted ? (snapshot.attendanceRecords || []).filter((item) => item.id !== request.id) : result.attendance ? [result.attendance, ...(snapshot.attendanceRecords || []).filter((item) => item.id !== result.attendance!.id)] : snapshot.attendanceRecords;
          if (request.entity === "LEAVE") next.leaveRequests = result.deleted ? (snapshot.leaveRequests || []).filter((item) => item.id !== request.id) : result.leave ? [result.leave, ...(snapshot.leaveRequests || []).filter((item) => item.id !== result.leave!.id)] : snapshot.leaveRequests;
          if (request.entity === "OVERTIME") next.overtimeRequests = result.deleted ? (snapshot.overtimeRequests || []).filter((item) => item.id !== request.id) : result.overtime ? [result.overtime, ...(snapshot.overtimeRequests || []).filter((item) => item.id !== result.overtime!.id)] : snapshot.overtimeRequests;
          next.periods = revisePayrollSourcePeriods(next.periods, { allOpen: true });
          payrollDataRef.current = next;
          return next;
        });
        if (!canApplyWorkspaceResult(token)) throw new Error("Deployment access changed while the lifecycle action was running.");
        await refreshWorkspaceGroups(["payroll", "payroll-imports"], token, { force: true, reason: "payroll-lifecycle" });
        if (!canApplyWorkspaceResult(token)) throw new Error("Deployment access changed while payroll lifecycle data was refreshing.");
      } else {
        const effectiveDate = request.effectiveDate || dateOnly();
        const next = { ...current };
        if (request.entity === "WORKER") {
          const worker = current.workers.find((item) => item.id === request.id);
          if (!worker) throw new Error("Worker does not exist in this workspace.");
          next.workers = request.action === "DELETE_UNUSED" ? current.workers.filter((item) => item.id !== request.id) : current.workers.map((item) => item.id === request.id ? workerForLifecycle(item, request.action as "OFFBOARD" | "REACTIVATE", effectiveDate) : item);
        } else if (request.entity === "PROJECT_ASSIGNMENT") {
          const assignment = current.assignments.find((item) => item.id === request.id);
          if (!assignment) throw new Error("Project assignment does not exist in this workspace.");
          next.assignments = request.action === "DELETE_UNUSED" ? current.assignments.filter((item) => item.id !== request.id) : current.assignments.map((item) => item.id === request.id ? assignmentForLifecycle(item, effectiveDate) : item);
        } else if (request.entity === "COMPENSATION_PROFILE") {
          const profile = current.compensationProfiles.find((item) => item.id === request.id);
          if (!profile) throw new Error("Compensation profile does not exist in this workspace.");
          next.compensationProfiles = request.action === "DELETE_UNUSED" ? current.compensationProfiles.filter((item) => item.id !== request.id) : current.compensationProfiles.map((item) => item.id === request.id ? profileForLifecycle(item, effectiveDate) : item);
        } else if (request.entity === "RECURRING_COMPONENT") {
          const component = current.recurringComponents.find((item) => item.id === request.id);
          if (!component) throw new Error("Recurring payroll component does not exist in this workspace.");
          next.recurringComponents = request.action === "DELETE_UNUSED" ? current.recurringComponents.filter((item) => item.id !== request.id) : current.recurringComponents.map((item) => item.id === request.id ? componentForLifecycle(item, effectiveDate) : item);
        } else if (request.entity === "WORK_ENTRY") {
          const entry = current.workEntries.find((item) => item.id === request.id);
          if (!entry) throw new Error("Work entry does not exist in this workspace.");
          if (request.action === "DELETE_DRAFT") { if (entry.status !== "DRAFT") throw new Error("Only an unused draft work entry may be deleted."); next.workEntries = current.workEntries.filter((item) => item.id !== request.id); } else next.workEntries = current.workEntries.map((item) => item.id === request.id ? { ...item, status: "VOID", voidedAt: new Date().toISOString(), voidReason: request.reason } : item);
        } else if (request.entity === "ATTENDANCE") {
          const record = (current.attendanceRecords || []).find((item) => item.id === request.id);
          if (!record) throw new Error("Attendance record does not exist in this workspace.");
          next.attendanceRecords = request.action === "DELETE_DRAFT" ? (record.recordStatus === "DRAFT" ? (current.attendanceRecords || []).filter((item) => item.id !== request.id) : (() => { throw new Error("Only draft attendance may be deleted."); })()) : (current.attendanceRecords || []).map((item) => item.id === request.id ? { ...item, recordStatus: "VOID", voidedAt: new Date().toISOString(), voidReason: request.reason } : item);
        } else if (request.entity === "LEAVE") {
          const requestRow = (current.leaveRequests || []).find((item) => item.id === request.id);
          if (!requestRow) throw new Error("Leave request does not exist in this workspace.");
          next.leaveRequests = request.action === "DELETE_DRAFT" ? (requestRow.status === "DRAFT" ? (current.leaveRequests || []).filter((item) => item.id !== request.id) : (() => { throw new Error("Only draft leave requests may be deleted."); })()) : (current.leaveRequests || []).map((item) => item.id === request.id ? { ...item, status: "CANCELLED", cancelledAt: new Date().toISOString(), cancellationReason: request.reason } : item);
        } else if (request.entity === "OVERTIME") {
          const requestRow = (current.overtimeRequests || []).find((item) => item.id === request.id);
          if (!requestRow) throw new Error("Overtime request does not exist in this workspace.");
          next.overtimeRequests = request.action === "DELETE_DRAFT" ? (requestRow.status === "DRAFT" ? (current.overtimeRequests || []).filter((item) => item.id !== request.id) : (() => { throw new Error("Only draft overtime requests may be deleted."); })()) : (current.overtimeRequests || []).map((item) => item.id === request.id ? { ...item, status: "CANCELLED", cancelledAt: new Date().toISOString(), cancellationReason: request.reason } : item);
        }
        next.periods = revisePayrollSourcePeriods(next.periods, { allOpen: true });
        payrollDataRef.current = next;
        setPayrollData(next);
      }
      const actionLabels: Record<string, string> = { OFFBOARD: "Worker offboarded. Historical payroll remains preserved.", REACTIVATE: "Worker reactivated.", END: "Lifecycle record ended. Historical records remain preserved.", DEACTIVATE: "Payroll component deactivated. Historical payroll remains preserved.", DELETE_UNUSED: "Unused record deleted after the authoritative safety check.", DELETE_DRAFT: "Unused draft source deleted.", VOID: "Source voided and retained in history.", CANCEL: "Request cancelled and retained in history." };
      showNotification("success", actionLabels[request.action] || "Lifecycle action completed.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not complete the payroll lifecycle action."));
      throw error;
    }
  };

  const handleSaveDepartment = async (department: Department) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.workersManage)) throw new Error("You do not have permission to manage workforce departments in this company.");
      const saved = session && supabase ? await saveDepartmentToSupabase(department) : { ...department, updatedAt: new Date().toISOString() };
      setPayrollData((current) => ({ ...current, departments: current.departments.some((item) => item.id === saved.id) ? current.departments.map((item) => item.id === saved.id ? saved : item) : [saved, ...current.departments] }));
      showNotification("success", `${saved.name} department saved.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save department."));
    }
  };

  const handleSavePayrollPeriod = async (period: PayrollPeriod) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.payrollWrite)) throw new Error("You do not have permission to manage payroll periods in this company.");
      const saved = session && supabase ? await savePayrollPeriodToSupabase(period) : { ...period, updatedAt: new Date().toISOString() };
      setPayrollData((current) => ({ ...current, periods: current.periods.some((item) => item.id === saved.id) ? current.periods.map((item) => item.id === saved.id ? saved : item) : [saved, ...current.periods] }));
      showNotification("success", "Payroll period saved.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save payroll period."));
    }
  };

  const handleSaveAttendance = async (record: AttendanceRecord) => {
    if (isSupabaseConfigured && !can(PERMISSION_KEYS.payrollWrite)) throw new Error("You do not have permission to manage attendance in this company.");
    try {
      const period = record.periodId ? payrollDataRef.current.periods.find((item) => item.id === record.periodId) : undefined;
      if (period && payrollDataRef.current.runs.some((run) => run.periodId === period.id && ["APPROVED", "PAID", "VOID"].includes(run.status))) throw new Error("Attendance sources for a finalized payroll period are locked.");
      const saved = session && supabase ? await saveAttendanceRecordToSupabase(record) : record;
      setPayrollData((current) => {
        const next = {
          ...current,
          attendanceRecords: [saved, ...(current.attendanceRecords || []).filter((item) => item.id !== saved.id && !(item.workerId === saved.workerId && item.attendanceDate === saved.attendanceDate))],
          periods: revisePayrollSourcePeriods(current.periods, { periodIds: saved.periodId ? new Set([saved.periodId]) : undefined, startDate: saved.attendanceDate, endDate: saved.attendanceDate }),
        };
        payrollDataRef.current = next;
        return next;
      });
      showNotification("success", "Attendance saved.");
    } catch (error: unknown) {
      showNotification("error", userFacingError(error, "Could not save attendance."));
    }
  };

  const handleSaveAttendanceBatch = async (records: AttendanceRecord[]) => {
    if (!records.length) return;
    if (isSupabaseConfigured && !can(PERMISSION_KEYS.payrollWrite)) throw new Error("You do not have permission to manage attendance in this company.");
    try {
      const lockedPeriodIds = new Set(payrollDataRef.current.runs.filter((run) => ["APPROVED", "PAID", "VOID"].includes(run.status)).map((run) => run.periodId));
      if (records.some((record) => record.periodId && lockedPeriodIds.has(record.periodId))) throw new Error("Attendance sources for a finalized payroll period are locked.");
      const saved = session && supabase ? await saveAttendanceRecordsToSupabase(records) : records;
      setPayrollData((current) => {
        const savedKeys = new Set(saved.map((record) => String(record.workerId) + ":" + record.attendanceDate));
        const next = {
          ...current,
          attendanceRecords: [...saved, ...(current.attendanceRecords || []).filter((record) => !savedKeys.has(String(record.workerId) + ":" + record.attendanceDate))],
          periods: saved.reduce((periods, record) => revisePayrollSourcePeriods(periods, { periodIds: record.periodId ? new Set([record.periodId]) : undefined, startDate: record.attendanceDate, endDate: record.attendanceDate }), current.periods),
        };
        payrollDataRef.current = next;
        return next;
      });
      showNotification("success", String(saved.length) + " attendance record" + (saved.length === 1 ? "" : "s") + " saved.");
    } catch (error: unknown) {
      showNotification("error", userFacingError(error, "Could not save the attendance batch."));
    }
  };

  const handleSaveLeave = async (request: LeaveRequest) => {
    if (isSupabaseConfigured && !can(PERMISSION_KEYS.payrollWrite)) throw new Error("You do not have permission to manage leave in this company.");
    try {
      const currentRequests = payrollDataRef.current.leaveRequests || [];
      const previous = currentRequests.find((item) => item.id === request.id);
      const finalizedRanges = payrollDataRef.current.periods
        .filter((period) => payrollDataRef.current.runs.some((run) => run.periodId === period.id && ["APPROVED", "PAID", "VOID"].includes(run.status)))
        .map((period) => ({ startDate: period.periodStart, endDate: period.periodEnd }));
      const validation = previous
        ? transitionLeaveRequest(request, request.status, { existing: previous, requests: currentRequests, finalizedRanges })
        : transitionLeaveRequest(request, request.status, { requests: currentRequests, finalizedRanges });
      if (!validation.valid) throw new Error(validation.errors.map((issue) => issue.message).join(" ") || "Leave request is invalid.");
      const locked = finalizedRanges.some((range) => range.startDate <= request.endDate && range.endDate >= request.startDate);
      if (locked) throw new Error("Leave sources overlapping a finalized payroll period are locked.");
      const normalized = validation.leave || request;
      const saved = session && supabase ? await saveLeaveRequestToSupabase(normalized) : normalized;
      setPayrollData((current) => {
        const next = {
          ...current,
          leaveRequests: [saved, ...(current.leaveRequests || []).filter((item) => item.id !== saved.id)],
          periods: revisePayrollSourcePeriods(current.periods, { startDate: saved.startDate, endDate: saved.endDate }),
        };
        payrollDataRef.current = next;
        return next;
      });
      showNotification("success", saved.status === "APPROVED" ? "Leave approved." : saved.status === "REJECTED" ? "Leave rejected." : saved.status === "CANCELLED" ? "Leave cancelled." : "Leave request saved.");
    } catch (error: unknown) {
      showNotification("error", userFacingError(error, "Could not save leave request."));
    }
  };

  const handleSaveOvertime = async (request: OvertimeRequest) => {
    if (isSupabaseConfigured && !can(PERMISSION_KEYS.payrollWrite)) throw new Error("You do not have permission to manage overtime in this company.");
    try {
      const period = request.periodId ? payrollDataRef.current.periods.find((item) => item.id === request.periodId) : undefined;
      if (period && payrollDataRef.current.runs.some((run) => run.periodId === period.id && ["APPROVED", "PAID", "VOID"].includes(run.status))) throw new Error("Overtime sources for a finalized payroll period are locked.");
      const saved = session && supabase ? await saveOvertimeRequestToSupabase(request) : request;
      setPayrollData((current) => {
        const next = {
          ...current,
          overtimeRequests: [saved, ...(current.overtimeRequests || []).filter((item) => item.id !== saved.id)],
          periods: revisePayrollSourcePeriods(current.periods, { periodIds: saved.periodId ? new Set([saved.periodId]) : undefined, startDate: saved.overtimeDate, endDate: saved.overtimeDate }),
        };
        payrollDataRef.current = next;
        return next;
      });
      showNotification("success", saved.status === "APPROVED" ? "Overtime approved." : "Overtime request saved.");
    } catch (error: unknown) {
      showNotification("error", userFacingError(error, "Could not save overtime request."));
    }
  };

  const handleSaveHoliday = async (holiday: PayrollHoliday) => {
    if (isSupabaseConfigured && !can(PERMISSION_KEYS.payrollWrite)) throw new Error("You do not have permission to manage holiday context in this company.");
    try {
      const saved = session && supabase ? await savePayrollHolidayToSupabase(holiday) : holiday;
      setPayrollData((current) => {
        const next = { ...current, holidays: [saved, ...(current.holidays || []).filter((item) => item.id !== saved.id && item.holidayDate !== saved.holidayDate)], periods: revisePayrollSourcePeriods(current.periods, { startDate: saved.holidayDate, endDate: saved.holidayDate }) };
        payrollDataRef.current = next;
        return next;
      });
      showNotification("success", "Holiday context saved.");
    } catch (error: unknown) {
      showNotification("error", userFacingError(error, "Could not save holiday context."));
    }
  };

  const handleSavePayrollSchedule = async (schedule: PayrollSchedule): Promise<PayrollSchedule> => {
    if (isSupabaseConfigured && !can(PERMISSION_KEYS.payrollSettings)) throw new Error("You do not have permission to manage payroll settings in this company.");
    try {
      const saved = session && supabase ? await savePayrollScheduleToSupabase(schedule) : { ...schedule, updatedAt: new Date().toISOString() };
      setPayrollData((current) => {
        const schedules = [saved, ...current.schedules.filter((item) => item.id !== saved.id).map((item) => saved.active ? { ...item, active: false } : item)];
        const next = { ...current, schedules };
        payrollDataRef.current = next;
        return next;
      });
      payrollAutomationKeyRef.current = "";
      setPayrollWorkspaceLoadState("loaded");
      // Deterministically restart calendar preparation after a schedule save
      // instead of relying on incidental state changes such as updatedAt.
      setPayrollGenerationRetry((value) => value + 1);
      showNotification("success", "Payroll schedule saved. Future periods will use the saved version; locked history remains unchanged.");
      return saved;
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save payroll schedule."));
      throw error;
    }
  };

  const payrollMaintenanceAllowed = !isSupabaseConfigured || (can(PERMISSION_KEYS.payrollSettings) && can(PERMISSION_KEYS.payrollWrite));
  const assertPayrollMaintenancePermission = () => {
    if (!payrollMaintenanceAllowed) throw new Error("You do not have permission to manage payroll maintenance in this company.");
  };
  const localMaintenanceInput = (referenceDate: string) => ({
    schedules: payrollDataRef.current.schedules,
    periods: payrollDataRef.current.periods,
    runs: payrollDataRef.current.runs,
    entries: payrollDataRef.current.entries,
    allocations: payrollDataRef.current.allocations,
    adjustments: payrollDataRef.current.adjustments,
    workEntries: payrollDataRef.current.workEntries,
    attendanceRecords: payrollDataRef.current.attendanceRecords || [],
    leaveRequests: payrollDataRef.current.leaveRequests || [],
    overtimeRequests: payrollDataRef.current.overtimeRequests || [],
    importData: payrollImportData,
    referenceDate,
  });
  const maintenanceSuccessMessage = (action: PayrollMaintenanceAction) => action === "REPAIR"
    ? "Payroll data repair completed and the current company workspace was reloaded."
    : action === "REBUILD_CALENDAR"
      ? "Payroll calendar rebuilt from the active schedule and the current company workspace was reloaded."
      : "Unapproved payroll was reset, affected imports were reopened, and the current company workspace was reloaded.";

  const handlePreviewPayrollMaintenance = async (action: PayrollMaintenanceAction): Promise<PayrollMaintenancePreview> => {
    assertPayrollMaintenancePermission();
    const referenceDate = dateOnly();
    if (session && supabase) {
      const token = currentWorkspaceLoadToken();
      if (!token) throw new Error("Resolve deployment access before previewing payroll maintenance.");
      const result = await previewPayrollMaintenanceRpc(action, referenceDate, token.companyId);
      if (!canApplyWorkspaceResult(token)) throw new Error("Deployment access changed while the payroll preview was loading.");
      return result;
    }
    return planLocalPayrollMaintenance(localMaintenanceInput(referenceDate), action).preview;
  };

  const handleApplyPayrollMaintenance = async (action: PayrollMaintenanceAction, confirmation?: string) => {
    assertPayrollMaintenancePermission();
    if (action === "RESET_UNAPPROVED" && confirmation !== "RESET UNAPPROVED PAYROLL") throw new Error("Type RESET UNAPPROVED PAYROLL to confirm this action.");
    const referenceDate = dateOnly();
    if (session && supabase) {
      const token = currentWorkspaceLoadToken();
      if (!token) throw new Error("Resolve deployment access before applying payroll maintenance.");
      const result = await applyPayrollMaintenanceRpc(action, referenceDate, confirmation, token.companyId);
      if (!canApplyWorkspaceResult(token)) throw new Error("Deployment access changed while payroll maintenance was running.");
      payrollAutomationKeyRef.current = "";
      await refreshWorkspaceGroups(["payroll", "payroll-imports"], token, { force: true, reason: "payroll-maintenance" });
      if (!canApplyWorkspaceResult(token)) throw new Error("Deployment access changed while payroll maintenance was refreshing.");
      showNotification("success", maintenanceSuccessMessage(action));
      return result;
    }
    const plan = planLocalPayrollMaintenance(localMaintenanceInput(referenceDate), action);
    const next = { ...payrollDataRef.current, periods: plan.periods, runs: plan.runs, entries: plan.entries, allocations: plan.allocations, adjustments: plan.adjustments, workEntries: plan.workEntries, attendanceRecords: plan.attendanceRecords || payrollDataRef.current.attendanceRecords || [], leaveRequests: plan.leaveRequests || payrollDataRef.current.leaveRequests || [], overtimeRequests: plan.overtimeRequests || payrollDataRef.current.overtimeRequests || [] };
    payrollDataRef.current = next;
    setPayrollData(next);
    setPayrollImportData(plan.importData);
    payrollAutomationKeyRef.current = "";
    if (!plan.preview.noChanges) showNotification("success", maintenanceSuccessMessage(action));
    return localMaintenanceResult(plan);
  };

  const handlePreviewPayrollWorkspaceReset = async (): Promise<PayrollWorkspaceResetPreview> => {
    assertPayrollMaintenancePermission();
    if (!(session && supabase)) throw new Error("The payroll factory reset requires a connected company workspace.");
    const token = currentWorkspaceLoadToken();
    if (!token) throw new Error("Resolve deployment access before previewing the payroll factory reset.");
    const result = await previewPayrollWorkspaceResetRpc(dateOnly(), token.companyId);
    if (!canApplyWorkspaceResult(token)) throw new Error("Deployment access changed while the reset preview was loading.");
    return result;
  };

  const handleApplyPayrollWorkspaceReset = async (confirmation?: string): Promise<PayrollWorkspaceResetPreview & { applied: boolean }> => {
    assertPayrollMaintenancePermission();
    assertPayrollWorkspaceResetConfirmation(confirmation);
    if (!(session && supabase)) throw new Error("The payroll factory reset requires a connected company workspace.");
    const token = currentWorkspaceLoadToken();
    if (!token) throw new Error("Resolve deployment access before applying the payroll factory reset.");
    // Once the server confirms the reset, failure messages must never claim
    // that "nothing was changed": only the post-reset reload may still fail.
    let appliedOnServer = false;
    try {
      const result = await applyPayrollWorkspaceResetRpc(confirmation, dateOnly(), token.companyId);
      if (!canApplyWorkspaceResult(token)) throw new Error("Deployment access changed while the payroll factory reset was running.");
      appliedOnServer = true;
      // The workspace is intentionally empty here. Clear every bootstrap
      // marker so the canonical default schedule is recreated from scratch,
      // then reload from Supabase before declaring success.
      payrollAutomationKeyRef.current = "";
      payrollBootstrapPersistedUsersRef.current.delete(token.userId);
      payrollBootstrapInFlightRef.current = null;
      payrollRepairInFlightRef.current = null;
      setPayrollPeriodPreparationState("PREPARING");
      await refreshWorkspaceGroups(["payroll", "payroll-imports"], token, { force: true, reason: "payroll-workspace-reset" });
      if (!canApplyWorkspaceResult(token)) throw new Error("Deployment access changed while the payroll factory reset was refreshing.");
      showNotification("success", "Payroll workspace was reset for this company. A clean standard schedule is being prepared.");
      return result;
    } catch (error: unknown) {
      if (error instanceof Error && /changed while/.test(error.message)) throw error;
      showNotification("error", appliedOnServer
        ? userFacingError(error, "The payroll workspace was reset on the server, but reloading the clean workspace failed. Retry preparing the payroll calendar to continue.")
        : userFacingError(error, "The payroll factory reset failed and nothing was changed."));
      throw error;
    }
  };
  const handleSaveCompensationProfile = async (profile: WorkerCompensationProfile) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.workersManage)) throw new Error("You do not have permission to manage compensation profiles in this company.");
      const saved = session && supabase ? await saveWorkerCompensationProfileToSupabase(profile) : profile;
      setPayrollData((current) => { const next = { ...current, compensationProfiles: [saved, ...(current.compensationProfiles || []).filter((item) => item.id !== saved.id)], periods: revisePayrollSourcePeriods(current.periods, { allOpen: true }) }; payrollDataRef.current = next; return next; });
      if (session && supabase) {
        const token = currentWorkspaceLoadToken();
        if (token) await refreshWorkspaceGroups(["payroll"], token, { force: true, reason: "compensation-profile-saved" });
      }
      showNotification("success", "Effective compensation profile saved.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save compensation profile."));
    }
  };

  const handleSaveRecurringComponent = async (component: RecurringPayrollComponent) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.workersManage)) throw new Error("You do not have permission to manage recurring payroll components in this company.");
      const saved = session && supabase ? await saveRecurringPayrollComponentToSupabase(component) : component;
      setPayrollData((current) => { const next = { ...current, recurringComponents: [saved, ...(current.recurringComponents || []).filter((item) => item.id !== saved.id)], periods: revisePayrollSourcePeriods(current.periods, { allOpen: true }) }; payrollDataRef.current = next; return next; });
      showNotification("success", "Recurring payroll component saved.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save recurring payroll component."));
    }
  };
  const handleStagePayrollImport = async (batch: PayrollImportBatch, rows: PayrollImportRow[], bytes: Uint8Array) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.payrollImport)) throw new Error("You do not have permission to import payroll data in this company.");
      const duplicates = findDuplicatePayrollImportBatches(payrollImportData.batches, batch.fileSha256);
      let savedBatch = duplicates[0] ? { ...batch, duplicateOfBatchId: duplicates[0].id, warnings: [...batch.warnings, "A payroll file with this SHA-256 hash already exists in this workspace."] } : batch;
      let savedRows = rows;
      if (session && supabase) {
        const storagePath = await uploadPayrollImportSourceToSupabase({ batchId: batch.id, fileName: batch.originalFileName, mimeType: batch.mimeType, bytes });
        savedBatch = await savePayrollImportBatchToSupabase({ ...savedBatch, storagePath });
        savedRows = await savePayrollImportRowsToSupabase(rows);
      }
      setPayrollImportData((current) => ({
        ...current,
        batches: [savedBatch, ...current.batches.filter((item) => item.id !== savedBatch.id)],
        rows: [...savedRows, ...current.rows.filter((item) => item.batchId !== savedBatch.id)],
      }));
      showNotification("success", duplicates.length ? "Payroll workbook staged with a duplicate warning. Review the earlier batch before committing." : "Payroll workbook staged for review.");
    } catch (error: unknown) {
      showNotification("error", userFacingError(error, "Could not stage the payroll workbook."));
    }
  };

  const handleSavePayrollImportTemplate = async (template: PayrollImportTemplate) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.payrollImport)) throw new Error("You do not have permission to manage payroll import templates in this company.");
      const saved = session && supabase ? await savePayrollImportTemplateToSupabase(template) : { ...template, updatedAt: new Date().toISOString() };
      setPayrollImportData((current) => ({ ...current, templates: [saved, ...current.templates.filter((item) => item.id !== saved.id)] }));
      showNotification("success", "Payroll mapping template saved.");
    } catch (error: unknown) {
      showNotification("error", userFacingError(error, "Could not save the payroll mapping template."));
    }
  };

  const handleCommitPayrollImport = async (staged: StagedPayrollImport, periodStart: string, periodEnd: string, payDate?: string) => {
    try {
      if (isSupabaseConfigured && !hasAllPermissions(permissions, [PERMISSION_KEYS.payrollImport, PERMISSION_KEYS.payrollWrite])) throw new Error("Committing a payroll import requires payroll import and payroll management permissions in this company.");
      const sourceBatch = payrollImportData.batches.find((item) => item.id === staged.batch.id) || staged.batch;
      const { buildDraftPayrollFromImport } = await import("./lib/payrollImportWorkflow.ts");
      const draft = buildDraftPayrollFromImport({ batch: sourceBatch, rows: staged.rows, periodStart, periodEnd, payDate });
      let savedPeriod = draft.period;
      let savedRun = draft.run;
      let persisted = { entries: draft.entries, allocations: draft.allocations };
      const committedEntryByRow = new Map(draft.entries.flatMap((entry) => entry.importRowId ? [[entry.importRowId, entry.id] as const] : []));
      const committedRows = staged.rows.map((row) => row.status === "SKIPPED" ? row : { ...row, status: "COMMITTED" as const, committedPayrollEntryId: committedEntryByRow.get(row.id), updatedAt: new Date().toISOString() });
      if (session && supabase) {
        const committed = await commitPayrollImportToSupabase({ batchId: sourceBatch.id, period: draft.period, run: draft.run, entries: draft.entries, allocations: draft.allocations, rows: committedRows });
        savedPeriod = committed.period;
        savedRun = committed.run;
        persisted = { entries: committed.entries, allocations: committed.allocations };
      }
      const committedBatch: PayrollImportBatch = { ...sourceBatch, status: "COMMITTED", committedPayrollPeriodId: savedPeriod.id, committedPayrollRunId: savedRun.id, committedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      setPayrollData((current) => ({
        ...current,
        periods: [savedPeriod, ...current.periods.filter((item) => item.id !== savedPeriod.id)],
        runs: [savedRun, ...current.runs.filter((item) => item.id !== savedRun.id)],
        entries: [...persisted.entries, ...current.entries.filter((item) => item.payrollRunId !== savedRun.id)],
        allocations: [...persisted.allocations, ...current.allocations.filter((item) => !persisted.entries.some((entry) => entry.id === item.payrollEntryId))],
      }));
      setPayrollImportData((current) => ({
        ...current,
        batches: [committedBatch, ...current.batches.filter((item) => item.id !== committedBatch.id)],
        rows: [...committedRows, ...current.rows.filter((item) => item.batchId !== committedBatch.id)],
      }));
      showNotification("success", "Imported " + persisted.entries.length + " payroll entr" + (persisted.entries.length === 1 ? "y" : "ies") + " into a DRAFT payroll run. Review before approval.");
    } catch (error: unknown) {
      showNotification("error", userFacingError(error, "Could not commit the payroll import."));
    }
  };

  const handleSaveWorkEntry = async (entry: WorkEntry) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.payrollWrite)) throw new Error("You do not have permission to manage work entries in this company.");
      const period = payrollData.periods.find((item) => item.id === entry.periodId);
      if (!entry.periodId || !period || period.status === "VOID" || entry.workDate < period.periodStart || entry.workDate > period.periodEnd) {
        showNotification("error", "Work entry must link to a valid payroll period and fall within its date range.");
        return;
      }
      const locked = payrollData.runs.some((run) => run.periodId === period.id && (run.status === "APPROVED" || run.status === "PAID" || run.status === "VOID"));
      if (locked) {
        showNotification("error", "Work entries cannot be changed after the period is locked.");
        return;
      }
      const saved = session && supabase ? await saveWorkEntryToSupabase(entry) : entry;
      setPayrollData((current) => { const next = { ...current, workEntries: current.workEntries.some((item) => item.id === saved.id) ? current.workEntries.map((item) => item.id === saved.id ? saved : item) : [saved, ...current.workEntries], periods: revisePayrollSourcePeriods(current.periods, { periodIds: saved.periodId ? new Set([saved.periodId]) : undefined, startDate: saved.workDate, endDate: saved.workDate }) }; payrollDataRef.current = next; return next; });
      showNotification("success", "Work entry saved. Calculate a payroll run to post labor allocation.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save work entry."));
    }
  };

  const handleSaveAssignment = async (assignment: ProjectWorkerAssignment) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.workersManage)) throw new Error("You do not have permission to manage worker assignments in this company.");
      const saved = session && supabase ? await saveAssignmentToSupabase(assignment) : assignment;
      setPayrollData((current) => { const next = { ...current, assignments: current.assignments.some((item) => item.id === saved.id) ? current.assignments.map((item) => item.id === saved.id ? saved : item) : [saved, ...current.assignments], periods: revisePayrollSourcePeriods(current.periods, { allOpen: true }) }; payrollDataRef.current = next; return next; });
      showNotification("success", "Worker assignment saved.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save worker assignment."));
    }
  };

  const handleSavePayrollEntry = async (entry: PayrollEntry, allocations: PayrollProjectAllocation[]) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.payrollWrite)) throw new Error("You do not have permission to manage payroll entries in this company.");
      const run = payrollData.runs.find((item) => item.id === entry.payrollRunId);
      if (!run || (run.status !== "DRAFT" && run.status !== "CALCULATED")) {
        showNotification("error", "Only draft or calculated payroll runs can be edited.");
        return;
      }
      if (payrollData.entries.some((item) => item.workerId === entry.workerId && item.payrollRunId === entry.payrollRunId && item.id !== entry.id)) {
        showNotification("error", "This worker already has a payroll entry in the selected run.");
        return;
      }
      const allocationValidation = validatePayrollAllocations(entry, allocations);
      if (!allocationValidation.valid) {
        showNotification("error", allocationValidation.issues.join(" "));
        return;
      }
      const saved = session && supabase ? await savePayrollEntryToSupabase(entry, allocations) : { entry, allocations };
      setPayrollData((current) => ({ ...current, entries: [...current.entries.filter((item) => item.id !== saved.entry.id), saved.entry], allocations: [...current.allocations.filter((item) => item.payrollEntryId !== saved.entry.id), ...saved.allocations] }));
      showNotification("success", "Payroll entry and project allocations saved.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save payroll entry."));
    }
  };

  const handleCalculatePayrollRun = async (run: PayrollRun) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.payrollWrite)) throw new Error("You do not have permission to calculate payroll in this company.");
      if (run.status !== "DRAFT" && run.status !== "CALCULATED") {
        showNotification("error", "Only draft or calculated payroll runs can be calculated.");
        return;
      }
      const period = payrollData.periods.find((item) => item.id === run.periodId);
      if (!period || period.status === "VOID") {
        showNotification("error", "Select a valid, non-VOID payroll period before calculating.");
        return;
      }
      const existingRunEntries = payrollData.entries.filter((entry) => entry.payrollRunId === run.id);
      const hasConfiguredAutomationSources = Boolean(payrollData.workEntries.some((entry) => entry.status === "APPROVED" && entry.periodId === period.id) || (payrollData.attendanceRecords || []).some((record) => record.periodId === period.id && record.recordStatus === "CONFIRMED") || (payrollData.overtimeRequests || []).some((request) => request.periodId === period.id && request.status === "APPROVED") || (payrollData.compensationProfiles || []).length || (payrollData.recurringComponents || []).length);
      const selectedSchedule = (payrollData.schedules || []).find((schedule) => schedule.active && (!period.scheduleId || schedule.id === period.scheduleId));
      const automationMode = selectedSchedule?.automationMode || "ASSISTED";
      const scheduleEnabled = Boolean(selectedSchedule && automationMode !== "MANUAL");
      const automationEnabled = Boolean(scheduleEnabled && (hasConfiguredAutomationSources || existingRunEntries.length === 0));
      if (automationEnabled) {
        const draft = buildAutomaticPayrollDraft({
          period,
          run,
          workers: payrollData.workers,
          assignments: payrollData.assignments,
          profiles: payrollData.compensationProfiles || [],
          recurringComponents: payrollData.recurringComponents || [],
          workEntries: payrollData.workEntries,
          attendanceRecords: payrollData.attendanceRecords || [],
          leaveRequests: payrollData.leaveRequests || [],
          overtimeRequests: payrollData.overtimeRequests || [],
          holidays: payrollData.holidays || [],
          sourceRevision: period.sourceRevision,
          projects,
          mode: automationMode,
          existingAllocations: payrollData.allocations.filter((allocation) => payrollData.entries.some((entry) => entry.id === allocation.payrollEntryId && entry.payrollRunId === run.id)),
          existingEntries: payrollData.entries.filter((entry) => entry.payrollRunId === run.id),
        });
        if (draft.readiness === "BLOCKING") {
          showNotification("error", `Payroll needs attention before calculation: ${draft.exceptions.filter((issue) => issue.severity === "BLOCKING").map((issue) => issue.message).slice(0, 3).join(" ")}`);
          return;
        }
        const records = payrollDraftToRecords(draft, run.id);
        if (!records.entries.length) {
          showNotification("error", "No payroll entries are ready. Add approved work entries or configure a worker compensation profile.");
          return;
        }
        const invalidAllocations = records.entries.flatMap((entry) => validatePayrollAllocations(entry, records.allocations.filter((allocation) => allocation.payrollEntryId === entry.id)).issues);
        if (invalidAllocations.length) {
          showNotification("error", invalidAllocations.join(" "));
          return;
        }
        let savedEntries = records.entries;
        let savedAllocations = records.allocations;
        if (session && supabase) {
          const persisted = await replacePayrollRunEntriesToSupabase(run.id, period.sourceRevision ?? 0, records.entries, records.allocations);
          savedEntries = persisted.entries;
          savedAllocations = persisted.allocations;
        }
        const savedRun = session && supabase ? await savePayrollRunToSupabase({ ...run, status: "CALCULATED", calculatedAt: new Date().toISOString(), calculatedSourceRevision: draft.sourceRevision ?? period.sourceRevision, sourceFingerprint: draft.sourceFingerprint || fingerprintPayrollSources(sourceInputForPayroll(period, payrollData, projects)) }) : { ...run, status: "CALCULATED" as const, calculatedAt: new Date().toISOString(), calculatedSourceRevision: draft.sourceRevision ?? period.sourceRevision, sourceFingerprint: draft.sourceFingerprint || fingerprintPayrollSources(sourceInputForPayroll(period, payrollData, projects)) };
        setPayrollData((current) => {
          const oldEntryIds = new Set(current.entries.filter((entry) => entry.payrollRunId === run.id).map((entry) => entry.id));
          const replacementEntryIds = new Set(savedEntries.map((entry) => entry.id));
          return { ...current, runs: current.runs.map((item) => item.id === savedRun.id ? savedRun : item), entries: [...current.entries.filter((item) => item.payrollRunId !== run.id), ...savedEntries], allocations: [...current.allocations.filter((item) => !oldEntryIds.has(item.payrollEntryId) && !replacementEntryIds.has(item.payrollEntryId)), ...savedAllocations] };
        });
        const warningCount = draft.exceptions.filter((issue) => issue.severity === "WARNING").length;
        showNotification("success", `Payroll run calculated from ${draft.mode.toLowerCase()} sources for ${savedEntries.length} worker${savedEntries.length === 1 ? "" : "s"}.${warningCount ? ` ${warningCount} warning${warningCount === 1 ? "" : "s"} need review.` : ""}`);
        return;
      }

      const invalidApprovedEntries = payrollData.workEntries.filter((entry) => entry.status === "APPROVED" && (!entry.periodId || entry.workDate < period.periodStart || entry.workDate > period.periodEnd));
      if (invalidApprovedEntries.length) {
        showNotification("error", `${invalidApprovedEntries.length} approved work entr${invalidApprovedEntries.length === 1 ? "y is" : "ies are"} missing a valid period/date link.`);
        return;
      }
      const calculation = calculatePayrollRunFromWorkEntries({ runId: run.id, periodId: period.id, periodStart: period.periodStart, periodEnd: period.periodEnd, workers: payrollData.workers, assignments: payrollData.assignments, workEntries: payrollData.workEntries, attendanceRecords: payrollData.attendanceRecords || [], leaveRequests: payrollData.leaveRequests || [], overtimeRequests: payrollData.overtimeRequests || [], holidays: payrollData.holidays || [], projects, sourceRevision: period.sourceRevision });
      const existingEntries = payrollData.entries.filter((entry) => entry.payrollRunId === run.id);
      const existingAllocations = payrollData.allocations.filter((allocation) => existingEntries.some((entry) => entry.id === allocation.payrollEntryId));
      const generatedEntries: PayrollEntry[] = calculation.entries.map((entry) => ({ id: globalThis.crypto?.randomUUID?.() || `local-payroll-entry-${Date.now()}-${Math.random().toString(36).slice(2)}`, payrollRunId: run.id, workerId: entry.workerId, basePay: entry.basePay, regularPay: entry.regularPay, overtimePay: entry.overtimePay, allowances: entry.allowances, otherEarnings: 0, grossPay: entry.grossPay, deductions: entry.deductions, otherDeductions: 0, employerCosts: 0, netPay: entry.netPay, projectAllocatedCost: entry.projectAllocatedCost, calculationSnapshot: entry.calculationSnapshot, createdAt: new Date().toISOString() }));
      const generatedAllocations: PayrollProjectAllocation[] = calculation.allocations.filter((allocation) => Boolean(allocation.projectId)).map((allocation) => {
        const entry = generatedEntries.find((item) => item.workerId === allocation.workerId);
        return { id: globalThis.crypto?.randomUUID?.() || `local-payroll-allocation-${Date.now()}-${Math.random().toString(36).slice(2)}`, payrollEntryId: entry?.id || "", projectId: allocation.projectId, allocationAmount: allocation.allocationAmount, allocationPercentage: allocation.allocationPercentage, source: allocation.source };
      }).filter((allocation) => allocation.payrollEntryId);
      const entriesToSave = generatedEntries.length ? generatedEntries : existingEntries;
      const allocationsToSave = generatedEntries.length ? generatedAllocations : existingAllocations;
      if (!entriesToSave.length) {
        showNotification("error", "Add approved work entries or a manual payroll entry before calculating.");
        return;
      }
      const invalidAllocations = entriesToSave.flatMap((entry) => validatePayrollAllocations(entry, allocationsToSave.filter((allocation) => allocation.payrollEntryId === entry.id)).issues);
      if (invalidAllocations.length) {
        showNotification("error", invalidAllocations.join(" "));
        return;
      }

      let savedEntries = entriesToSave;
      let savedAllocations = allocationsToSave;
      if (session && supabase) {
        const persisted = await replacePayrollRunEntriesToSupabase(run.id, period.sourceRevision ?? 0, entriesToSave, allocationsToSave);
        savedEntries = persisted.entries;
        savedAllocations = persisted.allocations;
      }
      const calculatedAt = new Date().toISOString();
      const nextRun = { ...run, status: "CALCULATED" as const, calculatedAt, calculatedSourceRevision: calculation.sourceRevision ?? period.sourceRevision, sourceFingerprint: calculation.sourceFingerprint || fingerprintPayrollSources(sourceInputForPayroll(period, payrollData, projects)) };
      const savedRun = session && supabase ? await savePayrollRunToSupabase(nextRun) : nextRun;
      setPayrollData((current) => {
        const oldEntryIds = new Set(current.entries.filter((entry) => entry.payrollRunId === run.id).map((entry) => entry.id));
        const replacementEntryIds = new Set(savedEntries.map((entry) => entry.id));
        return { ...current, runs: current.runs.map((item) => item.id === savedRun.id ? savedRun : item), entries: [...current.entries.filter((item) => item.payrollRunId !== run.id), ...savedEntries], allocations: [...current.allocations.filter((item) => !oldEntryIds.has(item.payrollEntryId) && !replacementEntryIds.has(item.payrollEntryId)), ...savedAllocations] };
      });
      const warning = calculation.warnings.length ? ` ${calculation.warnings.join(" ")}` : "";
      showNotification("success", `Payroll run calculated. ${savedEntries.length} worker${savedEntries.length === 1 ? "" : "s"} snapshotted.${warning}`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not calculate payroll run."));
    }
  };

  const handleUpdatePayrollRun = async (run: PayrollRun) => {
    try {
      if (isSupabaseConfigured && ["APPROVED", "PAID"].includes(run.status) && !can(PERMISSION_KEYS.payrollApprove)) throw new Error("You do not have permission to approve or pay payroll in this company.");
      if (isSupabaseConfigured && !["APPROVED", "PAID"].includes(run.status) && !can(PERMISSION_KEYS.payrollWrite)) throw new Error("You do not have permission to manage payroll runs in this company.");
      const previous = payrollData.runs.find((item) => item.id === run.id);
      if (!previous || !canTransitionPayrollRun(previous.status, run.status) || (previous.status === run.status && (run.status === "APPROVED" || run.status === "PAID" || run.status === "VOID"))) {
        showNotification("error", `Invalid payroll run transition: ${previous?.status || "UNKNOWN"} → ${run.status}.`);
        return;
      }
      if (run.status === "APPROVED") {
        const approvalPeriod = payrollData.periods.find((period) => period.id === previous.periodId);
        if (approvalPeriod) {
          const freshness = validatePayrollRunSourceRevision({ run: previous, period: approvalPeriod, sourceInput: sourceInputForPayroll(approvalPeriod, payrollData, projects) });
          if (!freshness.valid) {
            showNotification("error", "Payroll sources changed after calculation. Recalculate before approval.");
            return;
          }
        }
        const approvalSchedule = (payrollData.schedules || []).find((schedule) => schedule.active && (!approvalPeriod?.scheduleId || schedule.id === approvalPeriod.scheduleId));
        const approvalMode = approvalSchedule?.automationMode || "ASSISTED";
        const automationEnabled = approvalMode !== "MANUAL" && Boolean((payrollData.workEntries.some((entry) => entry.status === "APPROVED" && entry.periodId === approvalPeriod?.id) || (payrollData.compensationProfiles || []).length || (payrollData.recurringComponents || []).length || payrollData.entries.filter((entry) => entry.payrollRunId === previous.id).length === 0));
        if (approvalPeriod && automationEnabled) {
          const draft = buildAutomaticPayrollDraft({ period: approvalPeriod, run: previous, workers: payrollData.workers, assignments: payrollData.assignments, profiles: payrollData.compensationProfiles || [], recurringComponents: payrollData.recurringComponents || [], workEntries: payrollData.workEntries, attendanceRecords: payrollData.attendanceRecords || [], leaveRequests: payrollData.leaveRequests || [], overtimeRequests: payrollData.overtimeRequests || [], holidays: payrollData.holidays || [], projects, mode: approvalMode });
          if (draft.readiness === "BLOCKING") {
            showNotification("error", `Approval is blocked until payroll issues are resolved: ${draft.exceptions.filter((issue) => issue.severity === "BLOCKING").map((issue) => issue.message).slice(0, 3).join(" ")}`);
            return;
          }
        }
        const runEntries = payrollData.entries.filter((entry) => entry.payrollRunId === run.id);
        const approval = validatePayrollRunApproval({ id: run.id, status: previous.status }, runEntries);
        const allocationIssues = runEntries.flatMap((entry) => validatePayrollAllocations(entry, payrollData.allocations.filter((allocation) => allocation.payrollEntryId === entry.id)).issues);
        if (!approval.valid || allocationIssues.length) {
          showNotification("error", [...approval.issues, ...allocationIssues].join(" "));
          return;
        }
      }
      const saved = session && supabase ? await savePayrollRunToSupabase(run) : run;
      setPayrollData((current) => ({ ...current, runs: current.runs.map((item) => item.id === saved.id ? saved : item) }));
      showNotification("success", `Payroll run marked ${saved.status.toLowerCase()}.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not update payroll run."));
    }
  };

  const handleCreatePayrollRun = async (periodId: string) => {
    if (isSupabaseConfigured && !can(PERMISSION_KEYS.payrollWrite)) {
      showNotification("error", "You do not have permission to create payroll runs in this company.");
      return;
    }
    const period = payrollData.periods.find((item) => item.id === periodId);
    if (!period || period.status === "VOID") {
      showNotification("error", "Choose a valid, non-VOID payroll period before creating a run.");
      return;
    }
    if (payrollData.runs.some((item) => item.periodId === period.id)) {
      showNotification("info", "A payroll run already exists for this period. Select it to continue.");
      return;
    }
    const run: PayrollRun = { id: globalThis.crypto?.randomUUID?.() || `local-payroll-run-${Date.now()}`, periodId: period.id, status: "DRAFT", createdAt: new Date().toISOString() };
    try {
      const saved = session && supabase ? await savePayrollRunToSupabase(run) : run;
      setPayrollData((current) => ({ ...current, runs: [saved, ...current.runs] }));
      showNotification("success", "Draft payroll run created. Link approved work entries, calculate, then approve.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not create payroll run."));
    }
  };

  const persistInvoice = async (invoice: InvoiceData, eventType = "HUMAN_EDIT", revision = editRevisionRef.current.get(invoice.id) || 0) => {
    if (!session || !supabase) {
      try {
        const localInvoices = invoicesRef.current.map((item) => item.id === invoice.id ? invoice : item);
        localStorage.setItem("extracted_invoices", JSON.stringify(localInvoices));
      } catch { /* local persistence is best effort */ }
      if (editRevisionRef.current.get(invoice.id) === revision) updateSaveState("saved");
      return;
    }

    const operation = enqueueSerializedSave<InvoiceData>(savePromisesRef.current, lastPersistedRef.current, invoice.id, async (previous) => {
      updateSaveState("saving");
      return updateInvoiceInSupabase(previous || invoice, invoice, eventType);
    });
    try {
      const saved = await operation;
      if (editRevisionRef.current.get(invoice.id) === revision) {
        const next = invoicesRef.current.map((item) => item.id === saved.id ? saved : item);
        invoicesRef.current = next;
        setInvoices(next);
        setSelectedInvoice((current) => current?.id === saved.id ? saved : current);
      }
      if (editRevisionRef.current.get(invoice.id) === revision) updateSaveState("saved");
    } catch (error) {
      if (editRevisionRef.current.get(invoice.id) === revision) updateSaveState("error");
      throw error;
    }
  };

  const flushInvoiceSave = async (invoice: InvoiceData, eventType = "HUMAN_EDIT") => {
    const timer = updateTimersRef.current.get(invoice.id);
    if (timer) {
      window.clearTimeout(timer);
      updateTimersRef.current.delete(invoice.id);
    }
    try {
      await persistInvoice(invoice, eventType);
      return true;
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save invoice. Your edits are still here; retry before continuing."));
      return false;
    }
  };

  const authReturnPath = () => {
    if (route.kind === "unknown" || route.pathname === "/reset-password") return DEFAULT_ROUTE_PATH;
    return `${route.pathname}${route.search}`;
  };

  const handleAuthenticated = async () => {
    setGuestMode(false);
    navigateToPath(authReturnPath(), true);
  };

  const handleContinueInBrowser = async () => {
    setGuestMode(true);
    if (route.pathname === "/reset-password") navigateToPath(DEFAULT_ROUTE_PATH, true);
  };

  const handlePasswordUpdated = async () => {
    setGuestMode(false);
    navigateToPath(DEFAULT_ROUTE_PATH, true);
  };

  const handleSignOut = async () => {
    if (selectedInvoice && !await flushInvoiceSave(selectedInvoice)) return;
    updateTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    updateTimersRef.current.clear();
    await Promise.allSettled([...savePromisesRef.current.values()]);
    savePromisesRef.current.clear();
    workspaceSyncControllerRef.current?.dispose();
    workspaceSyncControllerRef.current = null;
    initialWorkspaceLoadRef.current = null;
    workspaceGenerationRef.current += 1;
    sessionRef.current = null;
    setGuestMode(false);
    clearWorkspaceState();
    setWorkspaceLoading(false);
    setWorkspaceSyncStatus("guest");
    try {
      await signOutFromAccess();
    } catch (error) {
      showNotification("error", userFacingError(error, "Could not complete sign out. Please try again."));
    }
  };
  const handleUpdateInvoice = (updated: InvoiceData) => {
    const checked = applyLocalChecks(updated);
    const revision = (editRevisionRef.current.get(checked.id) || 0) + 1;
    editRevisionRef.current.set(checked.id, revision);
    const next = invoicesRef.current.map((invoice) => invoice.id === checked.id ? checked : invoice);
    invoicesRef.current = next;
    setInvoices(next);
    setSelectedInvoice(checked);
    updateSaveState("unsaved");

    if (session && supabase) {
      const existingTimer = updateTimersRef.current.get(checked.id);
      if (existingTimer) window.clearTimeout(existingTimer);
      const timer = window.setTimeout(() => {
        updateTimersRef.current.delete(checked.id);
        void persistInvoice(checked, "HUMAN_EDIT", revision).catch((error: any) => showNotification("error", userFacingError(error, "Could not save invoice edit. Your changes are still here; retry before continuing.")));
      }, 900);
      updateTimersRef.current.set(checked.id, timer);
    } else {
      updateSaveState("saved");
    }
  };

  const reloadLatestRemoteInvoice = () => {
    const pending = remoteInvoiceUpdate;
    if (!pending || saveStateRef.current === "saving") return;
    const invoiceId = pending.invoiceId;
    const timer = updateTimersRef.current.get(invoiceId);
    if (timer) {
      window.clearTimeout(timer);
      updateTimersRef.current.delete(invoiceId);
    }
    editRevisionRef.current.set(invoiceId, (editRevisionRef.current.get(invoiceId) || 0) + 1);
    const removed = remoteInvoiceRemovedRef.current.has(invoiceId);
    const latest = remoteInvoiceUpdatesRef.current.get(invoiceId) || pending.invoice;
    if (removed) {
      const next = invoicesRef.current.filter((invoice) => invoice.id !== invoiceId);
      invoicesRef.current = next;
      setInvoices(next);
      lastPersistedRef.current.delete(invoiceId);
      if (selectedInvoiceRef.current?.id === invoiceId) setSelectedInvoice(null);
    } else {
      const next = invoicesRef.current.map((invoice) => invoice.id === invoiceId ? latest : invoice);
      invoicesRef.current = next;
      setInvoices(next);
      setSelectedInvoice((current) => current?.id === invoiceId ? latest : current);
      lastPersistedRef.current.set(invoiceId, latest);
    }
    remoteInvoiceUpdatesRef.current.delete(invoiceId);
    remoteInvoiceRemovedRef.current.delete(invoiceId);
    setRemoteInvoiceUpdate(null);
    saveStateRef.current = "saved";
    updateSaveState("saved");
  };

  const keepEditingRemoteInvoice = () => {
    const invoiceId = remoteInvoiceUpdate?.invoiceId;
    if (!invoiceId) return;
    remoteInvoiceUpdatesRef.current.delete(invoiceId);
    remoteInvoiceRemovedRef.current.delete(invoiceId);
    setRemoteInvoiceUpdate(null);
  };

  const handleVerify = async (invoice: InvoiceData) => {
    const initialRevision = editRevisionRef.current.get(invoice.id) || 0;
    let verified: InvoiceData = { ...applyLocalChecks(invoice), reviewStatus: "VERIFIED" as const, verifiedAt: new Date().toISOString() };
    const persisted = await flushInvoiceSave(verified, "VERIFIED");
    if (!persisted) throw new Error("Could not save invoice verification.");
    verified = invoicesRef.current.find((item) => item.id === invoice.id) || verified;
    // If a field edit arrived while verification was saving, verify the latest
    // local values instead of replacing them with the older click snapshot.
    if (editRevisionRef.current.get(invoice.id) !== initialRevision) {
      const latest = invoicesRef.current.find((item) => item.id === invoice.id);
      if (!latest) throw new Error("The invoice is no longer available.");
      verified = { ...applyLocalChecks(latest), reviewStatus: "VERIFIED" as const, verifiedAt: new Date().toISOString() };
      if (!await flushInvoiceSave(verified, "VERIFIED")) throw new Error("Could not save invoice verification.");
      verified = invoicesRef.current.find((item) => item.id === invoice.id) || verified;
    }
    const next = invoicesRef.current.map((item) => item.id === verified.id ? verified : item);
    invoicesRef.current = next;
    setInvoices(next);
    if (selectedInvoice?.id === verified.id) setSelectedInvoice(verified);
    showNotification("success", `Verified ${verified.invoiceNumber || "invoice"}. The original AI snapshot and source file remain unchanged.`);
    return verified;
  };

  const handleRegionalSettingsChange = (next: RegionalSettings) => {
    const saved = setActiveRegionalSettings(next);
    setRegionalSettingsState(saved);
  };

  const handleReopen = async (invoice: InvoiceData) => {
    const reopened = { ...invoice, reviewStatus: "NEEDS_REVIEW" as const, verifiedAt: undefined };
    if (!await flushInvoiceSave(reopened, "REOPENED")) return;
    const saved = invoicesRef.current.find((item) => item.id === reopened.id) || reopened;
    const next = invoicesRef.current.map((item) => item.id === saved.id ? saved : item);
    invoicesRef.current = next;
    setInvoices(next);
    setSelectedInvoice((current) => current?.id === saved.id ? saved : current);
    showNotification("info", `Reopened ${saved.invoiceNumber || "invoice"} for review.`);
  };

  const handleRetryExtraction = async (invoice: InvoiceData): Promise<InvoiceData | null> => {
    if (retryingInvoiceRef.current) return null;
    retryingInvoiceRef.current = invoice.id;
    setRetryingInvoiceId(invoice.id);
    setProcessingCount((n) => n + 1);
    try {
      let sourcePayload = sourcePayloadsRef.current.get(invoice.id);
      if (!sourcePayload && session && supabase) {
        const storedPayload = await loadSourcePayloadForRetry(invoice);
        if (storedPayload) sourcePayload = { ...storedPayload, sourceType: extractionSourceType(storedPayload.sourceType) };
      }
      if (!sourcePayload && invoice.previewUrl?.startsWith("data:")) {
        const match = invoice.previewUrl.match(/^data:([^;,]+);base64,(.+)$/);
        if (match) sourcePayload = { fileData: match[2], mimeType: match[1], fileName: invoice.fileName || "invoice", sourceType: extractionSourceType(invoice.sourceType) || "UPLOAD" };
      }
      if (!sourcePayload) throw new Error("The original source is unavailable for retry.");

      const candidate = await extractPayload({ ...sourcePayload, model: "gemini-3.7-flash", retryReason: "manual", extractionFocus: "full" });
      let saved: InvoiceData;
      if (session && supabase) {
        saved = await persistExtractionAttempt(invoice, candidate, { reason: "manual", automatic: false });
      } else {
        const aiSnapshot: Partial<InvoiceData> = { ...candidate, id: invoice.id };
        delete (aiSnapshot as any).aiSnapshot;
        const retryQuality = candidate.extractionQuality
          ? { ...candidate.extractionQuality, attemptCount: (invoice.extractionQuality?.attemptCount || 1) + 1 }
          : invoice.extractionQuality;
        const retryResult = {
          ...invoice,
          ...candidate,
          id: invoice.id,
          fileName: invoice.fileName || candidate.fileName,
          fileSize: invoice.fileSize || candidate.fileSize,
          fileType: invoice.fileType || candidate.fileType,
          previewUrl: invoice.previewUrl || candidate.previewUrl,
          sourceDocumentId: invoice.sourceDocumentId || candidate.sourceDocumentId,
          sourceStoragePath: invoice.sourceStoragePath || candidate.sourceStoragePath,
          sourceSha256: invoice.sourceSha256 || candidate.sourceSha256,
          sourceEmailId: invoice.sourceEmailId || candidate.sourceEmailId,
          sourceType: invoice.sourceType || candidate.sourceType,
          sourceMetadata: invoice.sourceMetadata || candidate.sourceMetadata,
          extractionId: `local-extraction-${Date.now()}`,
          aiSnapshot,
          ...(retryQuality ? { extractionQuality: retryQuality } : {}),
          reviewStatus: "NEEDS_REVIEW" as const,
          verifiedAt: undefined,
        };
        saved = applyLocalChecks(retryResult);
      }
      sourcePayloadsRef.current.set(saved.id, sourcePayload);
      lastPersistedRef.current.set(saved.id, saved);
      const next = invoicesRef.current.map((item) => item.id === saved.id ? saved : item);
      invoicesRef.current = next;
      setInvoices(next);
      setSelectedInvoice((current) => current?.id === saved.id ? saved : current);
      updateSaveState("saved");
      if (saved.extractionQuality?.requiresRetry) showNotification("info", "Extraction is still incomplete. Review the highlighted fields manually or retry with Enhanced extraction.");
      else showNotification("success", "Extraction improved. Please review the updated fields.");
      return saved;
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Extraction failed. Your current draft is unchanged; retry the document."));
      return null;
    } finally {
      retryingInvoiceRef.current = null;
      setRetryingInvoiceId(null);
      setProcessingCount((n) => Math.max(0, n - 1));
    }
  };

  const handleRevertToAI = async (invoice: InvoiceData) => {
    if (!invoice.aiSnapshot) {
      showNotification("info", "This record does not have an immutable AI snapshot to restore.");
      return;
    }
    const reverted = applyLocalChecks({
      ...invoice,
      ...invoice.aiSnapshot,
      id: invoice.id,
      fileName: invoice.fileName,
      fileSize: invoice.fileSize,
      fileType: invoice.fileType,
      previewUrl: invoice.previewUrl,
      sourceDocumentId: invoice.sourceDocumentId,
      sourceStoragePath: invoice.sourceStoragePath,
      sourceSha256: invoice.sourceSha256,
      sourceEmailId: invoice.sourceEmailId,
      sourceType: invoice.sourceType,
      sourceMetadata: invoice.sourceMetadata,
      extractionId: invoice.extractionId,
      aiSnapshot: invoice.aiSnapshot,
      reviewStatus: "NEEDS_REVIEW",
      verifiedAt: undefined,
    });
    if (!await flushInvoiceSave(reverted, "REVERTED_TO_AI")) return;
    const saved = invoicesRef.current.find((item) => item.id === reverted.id) || reverted;
    const next = invoicesRef.current.map((item) => item.id === saved.id ? saved : item);
    invoicesRef.current = next;
    setInvoices(next);
    setSelectedInvoice((current) => current?.id === saved.id ? saved : current);
    showNotification("info", `Restored ${saved.invoiceNumber || "invoice"} to its original AI values for review.`);
  };

  const handleRevertField = async (invoice: InvoiceData, path: string) => {
    if (!invoice.aiSnapshot) return;
    const originalValue = valueAtPath(invoice.aiSnapshot, path);
    const reverted = applyLocalChecks(withPathValue(invoice, path, originalValue));
    if (!await flushInvoiceSave(reverted, "FIELD_REVERTED")) return;
    const saved = invoicesRef.current.find((item) => item.id === reverted.id) || reverted;
    const next = invoicesRef.current.map((item) => item.id === saved.id ? saved : item);
    invoicesRef.current = next;
    setInvoices(next);
    setSelectedInvoice((current) => current?.id === saved.id ? saved : current);
    showNotification("info", `Reverted ${path.replaceAll(".", " ")} to the original AI value.`);
  };

  const startReview = (requestedQueue?: InvoiceData[], initialId?: string, origin: AppTab = activeTab, returnPath = workspaceReturnPath) => {
    const queue = requestedQueue?.length ? requestedQueue : invoicesRef.current.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW" && !invoice.archivedAt && invoice.lifecycleStatus !== "VOID");
    const ids = queue.map((invoice) => invoice.id);
    const firstId = initialId && ids.includes(initialId) ? initialId : ids[0];
    if (!firstId) {
      showNotification("info", "Review queue is clear.");
      return;
    }
    const first = invoicesRef.current.find((invoice) => invoice.id === firstId);
    if (!first) return;
    setReviewSessionIds(ids);
    setReviewCompletion(null);
    setWorkspaceOrigin(origin);
    setSelectedInvoice(first);
    updateSaveState("saved");
    navigateToPath(appPathForReviewInvoice(first.id, returnPath));
  };

  const openInvoiceForReview = (invoice: InvoiceData, origin: AppTab = activeTab) => {
    const queue = invoicesRef.current.filter((item) => item.reviewStatus === "NEEDS_REVIEW");
    const returnPath = typeof window === "undefined" ? appPathForTab(origin) : appPathFromLocation(window.location);
    setWorkspaceReturnPath(returnPath);
    startReview(queue, invoice.id, origin, returnPath);
  };

  const openInvoice = (invoice: InvoiceData) => {
    if (invoice.reviewStatus === "NEEDS_REVIEW") {
      openInvoiceForReview(invoice, activeTab);
      return;
    }
    const returnPath = typeof window === "undefined" ? appPathForTab(activeTab) : appPathFromLocation(window.location);
    setWorkspaceOrigin(activeTab);
    setWorkspaceReturnPath(returnPath);
    setSelectedInvoice(invoice);
    setReviewSessionIds([]);
    setReviewCompletion(null);
    updateSaveState("saved");
    navigateToPath(appPathForInvoice(invoice.id, returnPath));
  };

  const handleBatchComplete = async (successful: InvoiceData[], failed: Array<{ name: string; error: string }>) => {
    if (successful.length) {
      try {
        const [existingVendors, existingProfiles] = await Promise.all([
          listCompanyVendors().catch(() => []),
          listEmailIntakeProfiles().catch(() => []),
        ]);
        const candidateItems = successful.map((inv) => ({
          candidateId: inv.id,
          evidence: extractVendorEvidenceFromInvoice(inv, inv.sourceMetadata),
          sourceRef: {
            fileName: inv.fileName,
            messageId: inv.sourceMetadata?.gmailMessageId,
            subject: inv.sourceMetadata?.subject,
            sender: inv.sourceMetadata?.sender,
            attachmentId: inv.sourceMetadata?.gmailAttachmentId,
          },
        }));
        const { resolutions } = resolveBatchVendors(candidateItems, existingVendors, existingProfiles);
        for (const inv of successful) {
          if (resolutions[inv.id]) {
            inv.entityResolution = resolutions[inv.id];
          }
        }
      } catch {
        // Safe fallback
      }
      startReview(successful, undefined, "extractor");
    }
    if (successful.length || failed.length) {
      const summary = `${successful.length} invoice${successful.length === 1 ? "" : "s"} extracted successfully. ${failed.length} failed.`;
      showNotification(failed.length ? "info" : "success", summary);
    }
  };

  const reviewQueue = reviewSessionIds.length ? orderedReviewQueue(invoices, reviewSessionIds) : [];
  const reviewIndex = selectedInvoice && reviewSessionIds.length ? reviewSessionIds.indexOf(selectedInvoice.id) : -1;

  const moveReview = async (direction: "next" | "previous") => {
    if (!selectedInvoice || !reviewSessionIds.length) return false;
    if (!await flushInvoiceSave(selectedInvoice)) return false;
    const targetId = nextReviewInvoiceId(reviewSessionIds, invoicesRef.current, selectedInvoice.id, direction);
    if (!targetId) {
      showNotification("info", direction === "next" ? "This is the last invoice in the review session." : "This is the first invoice in the review session.");
      return false;
    }
    const target = invoicesRef.current.find((item) => item.id === targetId);
    if (!target) return false;
    setSelectedInvoice(target);
    updateSaveState("saved");
    if (route.kind === "review-invoice") navigateToPath(appPathForReviewInvoice(target.id, workspaceReturnPath), true);
    return true;
  };

  const verifyAndNext = async () => {
    if (!selectedInvoice) return false;
    try {
      await handleVerify(selectedInvoice);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not verify invoice. Retry before continuing."));
      return false;
    }
    if (reviewSessionIds.length <= 1) {
      setReviewSessionIds([]);
      setReviewCompletion(null);
      updateSaveState("saved");
      return true;
    }
    const nextId = nextPendingReviewInvoiceId(reviewSessionIds, invoicesRef.current, selectedInvoice.id);
    if (nextId) {
      const next = invoicesRef.current.find((item) => item.id === nextId);
      if (next) {
        setSelectedInvoice(next);
        updateSaveState("saved");
        if (route.kind === "review-invoice") navigateToPath(appPathForReviewInvoice(next.id, workspaceReturnPath), true);
        return true;
      }
    }
    const verifiedCount = invoicesRef.current.filter((item) => reviewSessionIds.includes(item.id) && item.reviewStatus === "VERIFIED").length;
    const newItems = invoicesRef.current.filter((item) => item.reviewStatus === "NEEDS_REVIEW" && !reviewSessionIds.includes(item.id)).length;
    setReviewCompletion({ verifiedCount, totalCount: reviewSessionIds.length, newItems });
    return true;
  };

  const saveCurrentReview = async () => {
    if (!selectedInvoice) return false;
    return flushInvoiceSave(selectedInvoice);
  };

  const exitReview = async () => {
    if (selectedInvoice && !await flushInvoiceSave(selectedInvoice)) return;
    setSelectedInvoice(null);
    setReviewSessionIds([]);
    setReviewCompletion(null);
    navigateToPath(workspaceReturnPath, true);
  };

  const exitStandaloneWorkspace = async () => {
    if (selectedInvoice && !await flushInvoiceSave(selectedInvoice)) return;
    setSelectedInvoice(null);
    setReviewSessionIds([]);
    setReviewCompletion(null);
    navigateToPath(workspaceReturnPath, true);
  };

  const leaveWorkspace = reviewSessionIds.length ? exitReview : exitStandaloneWorkspace;
  const workspaceOriginLabel = workspaceOrigin === "dashboard"
    ? "Dashboard"
    : workspaceOrigin === "cash"
      ? "Cash & Banking"
    : workspaceOrigin === "projects"
      ? "Projects"
    : workspaceOrigin === "inbox"
      ? "Gmail Inbox"
      : workspaceOrigin === "review"
        ? "Review Queue"
        : workspaceOrigin === "extractor"
          ? "Extract"
          : "Invoices";

  const resetWorkspaceSelection = (tab: AppTab) => {
    setSelectedInvoice(null);
    setReviewSessionIds([]);
    setReviewCompletion(null);
    if (tab !== "extractor") setUploadProjectContextId(null);
    setWorkspaceOrigin(tab);
    navigateToPath(appPathForTab(tab));
  };

  const costInvoices = useMemo(() => invoices.map((invoice) => ({
    ...invoice,
    allocations: invoiceProjectAllocations.filter((allocation) => allocation.invoiceId === invoice.id),
  })), [invoices, invoiceProjectAllocations]);
  const costPayroll = useMemo(() => payrollData.runs.map((run) => {
    const period = payrollData.periods.find((candidate) => candidate.id === run.periodId);
    const entryIds = new Set(payrollData.entries.filter((entry) => entry.payrollRunId === run.id).map((entry) => entry.id));
    return {
      id: run.id,
      status: run.status,
      currency: activeCompany?.defaultCurrency || regionalSettings.currency || DEFAULT_CURRENCY,
      periodStart: period?.periodStart,
      periodEnd: period?.periodEnd,
      allocations: payrollData.allocations.filter((allocation) => entryIds.has(allocation.payrollEntryId)),
      entries: payrollData.entries.filter((entry) => entry.payrollRunId === run.id),
    };
  }), [payrollData.runs, payrollData.periods, payrollData.allocations, payrollData.entries, activeCompany?.defaultCurrency, regionalSettings.currency]);
  const aggregateCurrencyConflictProjectIds = useMemo(
    () => projectLaborAggregateCurrencyConflicts(projects, projectLaborAggregates),
    [projects, projectLaborAggregates],
  );
  const detailCurrencyConflictProjectIds = useMemo(() => projects
    .filter((project) => costPayroll.some((run) => run.allocations.some((allocation) => allocation.projectId === project.id)
      && String(run.currency || "PHP").trim().toUpperCase() !== String(project.currency || "").trim().toUpperCase()))
    .map((project) => project.id), [projects, costPayroll]);
  const projectLaborSource = useMemo<ProjectLaborSource>(() => {
    if (!isSupabaseConfigured) return "detail";
    if (hasPermission(permissions, PERMISSION_KEYS.payrollSensitiveRead)) {
      return payrollWorkspaceLoadState === "loaded" ? "detail" : "unavailable";
    }
    if (!hasPermission(permissions, PERMISSION_KEYS.payrollAggregateRead)) return "unavailable";
    if (projectLaborAggregateLoadState === "available") return "aggregate";
    if (projectLaborAggregateLoadState === "incomplete") return "incomplete";
    if (projectLaborAggregateLoadState === "currency-conflict") return "currency-conflict";
    return "unavailable";
  }, [payrollWorkspaceLoadState, permissions, projectLaborAggregateLoadState]);
  const projectCostSourceStates = useMemo(() => {
    const supplierInvoices: DataSourceState = !isSupabaseConfigured
      ? "detail"
      : hasPermission(permissions, PERMISSION_KEYS.invoicesRead) && projectCostDomainLoadState === "loaded"
        ? "detail"
        : "unavailable";
    const directExpenses: DataSourceState = !isSupabaseConfigured
      ? "detail"
      : hasPermission(permissions, PERMISSION_KEYS.expensesRead) && projectCostDomainLoadState === "loaded"
        ? "detail"
        : "unavailable";
    let payrollLabor: DataSourceState = projectLaborSource;
    if (projectLaborSource === "detail" && detailCurrencyConflictProjectIds.length) payrollLabor = "currency-conflict";
    if (projectLaborSource === "aggregate" && aggregateCurrencyConflictProjectIds.length) payrollLabor = "currency-conflict";
    return { supplierInvoices, payrollLabor, directExpenses } as const;
  }, [aggregateCurrencyConflictProjectIds, detailCurrencyConflictProjectIds.length, isSupabaseConfigured, permissions, projectCostDomainLoadState, projectLaborSource]);
  const projectCostCompleteness = useMemo(
    () => projectCostDataCompleteness(permissions, { sourceStates: projectCostSourceStates }),
    [permissions, projectCostSourceStates],
  );
  const detailPayrollForProjectCost = projectLaborSource === "detail" ? costPayroll : [];
  const projectSummaries = useMemo<Record<string, ProjectCostSummary>>(() => {
    const next: Record<string, ProjectCostSummary> = {};
    projects.forEach((project) => {
      next[project.id] = calculateProjectCost(project, {
        invoices: costInvoices,
        payroll: detailPayrollForProjectCost,
        expenses,
        purchaseOrders,
        subcontracts,
        projectLaborAggregates,
        laborSource: projectLaborSource,
      });
    });
    const unallocated = calculateProjectCost(undefined, { invoices: costInvoices, payroll: detailPayrollForProjectCost, expenses, purchaseOrders, subcontracts });
    next.__unallocated__ = unallocated;
    return next;
  }, [projects, costInvoices, detailPayrollForProjectCost, expenses, purchaseOrders, subcontracts, projectLaborAggregates, projectLaborSource]);
  const cashReconciliationCandidates = useMemo<FinancialReconciliationCandidate[]>(() => [
    ...expenses.filter((expense) => expense.status !== "VOID").map((expense) => ({ targetType: "EXPENSE" as const, targetId: expense.id, label: `${expense.category} · ${expense.description}`, amount: expense.amount, currency: expense.currency, date: expense.expenseDate, reference: expense.referenceNumber, description: `${expense.payee || ""} ${expense.description}` })),
    ...invoices.filter((invoice) => invoice.reviewStatus === "VERIFIED" && invoice.lifecycleStatus !== "VOID" && invoice.status !== "PAID").map((invoice) => ({ targetType: "INVOICE" as const, targetId: invoice.id, label: `${invoice.invoiceNumber || "Invoice"} · ${invoice.vendor?.name || "Supplier"}`, amount: Math.max(0, invoice.grandTotal - (invoice.amountPaid || 0)), currency: invoice.currency, date: invoice.invoiceDate, reference: invoice.invoiceNumber, description: invoice.vendor?.name })),
    ...payrollData.runs.filter((run) => run.status === "APPROVED" || run.status === "PAID").map((run) => ({ targetType: "PAYROLL" as const, targetId: run.id, label: `Payroll run · ${run.status}`, amount: payrollData.entries.filter((entry) => entry.payrollRunId === run.id).reduce((sum, entry) => sum + entry.netPay, 0), currency: "PHP", date: payrollData.periods.find((period) => period.id === run.periodId)?.payDate || payrollData.periods.find((period) => period.id === run.periodId)?.periodEnd, reference: run.id, description: "Payroll payment" })),
  ].filter((candidate) => candidate.amount > 0), [expenses, invoices, payrollData.runs, payrollData.entries, payrollData.periods]);
  const dashboardViewData = useMemo(() => buildDashboardViewData({
    projects,
    invoices: costInvoices,
    expenses,
    payroll: detailPayrollForProjectCost,
    purchaseOrders,
    subcontracts,
    projectLaborAggregates,
    laborSource: projectLaborSource,
    periods: payrollData.periods,
    workers: payrollData.workers,
    payrollEntries: payrollData.entries,
    payrollAllocations: payrollData.allocations,
    payrollRuns: payrollData.runs,
    cash: !isSupabaseConfigured || can(PERMISSION_KEYS.cashSummaryRead) ? cashData : undefined,
    activityPeriod: dashboardActivityPeriod,
    customStart: dashboardCustomStart,
    customEnd: dashboardCustomEnd,
    selectedCurrency: dashboardCurrency,
    projectId: dashboardProjectId,
  }), [projects, costInvoices, expenses, detailPayrollForProjectCost, purchaseOrders, subcontracts, projectLaborAggregates, projectLaborSource, payrollData.periods, payrollData.workers, payrollData.entries, payrollData.allocations, payrollData.runs, cashData, permissions, dashboardActivityPeriod, dashboardCustomStart, dashboardCustomEnd, dashboardCurrency, dashboardProjectId]);

  const projectDashboard = useMemo(() => selectedProject ? buildProjectDashboardViewData({ project: selectedProject, invoices: costInvoices, expenses, payroll: detailPayrollForProjectCost, purchaseOrders, subcontracts, projectLaborAggregates, laborSource: projectLaborSource, periods: payrollData.periods }) : undefined, [selectedProject, costInvoices, expenses, detailPayrollForProjectCost, purchaseOrders, subcontracts, projectLaborAggregates, projectLaborSource, payrollData.periods]);
  const reviewCount = invoices.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW" && !invoice.archivedAt && invoice.lifecycleStatus !== "VOID").length;
  const gmailConnection: GmailConnectionInfo = {
    configured: isSupabaseConfigured,
    signedIn: Boolean(session),
    hasGmailToken: Boolean(session && (googleProviderToken || (session as any)?.provider_token || getGoogleProviderToken())),
    email: session?.user?.email,
    displayName: session?.user?.user_metadata?.full_name,
    lastHistoryId: syncState.lastHistoryId,
    lastSyncedAt: syncState.lastSyncedAt,
  };

  const routeProject = route.kind === "project" ? resolveEntityById(projects, route.projectId) : undefined;
  const routeInvoice = route.kind === "invoice" || route.kind === "review-invoice"
    ? resolveEntityById(invoices, route.invoiceId)
    : undefined;
  const routeNotFound = route.kind === "unknown"
    || (route.kind === "project" && !workspaceLoading && !routeProject)
    || ((route.kind === "invoice" || route.kind === "review-invoice") && !workspaceLoading && !routeInvoice);
  const visibleRouteIds = useMemo<readonly RouteId[] | undefined>(() => {
    if (!isSupabaseConfigured || !session) return undefined;
    return ROUTE_DEFINITIONS
      .filter((definition) => canAccessAppTab(definition.appTab, permissions))
      .map((definition) => definition.id);
  }, [permissions, session]);
  const routePermission = route.kind === "unknown" ? null : requiredPermissionForAppTab(route.tab);
  const routeDenied = Boolean(isSupabaseConfigured && session && access.status === "ready" && (
    (route.kind !== "unknown" && activeCompanyId && routePermission && !canAccessAppTab(route.tab, permissions))
  ));
  const workspaceRouteVisible = !routeNotFound && !routeDenied;
  useEffect(() => {
    if (!routeDenied) return;
    const fallbackTab = defaultAppTabForPermissions(permissions);
    const fallbackPath = appPathForTab(fallbackTab);
    if (route.pathname !== fallbackPath) navigateToPath(fallbackPath, true);
  }, [permissions, route.pathname, routeDenied]);
  const isResetPasswordRoute = route.pathname === "/reset-password";
  if (routeDenied) return <AccessDenied permission={routePermission} companyName={activeCompany?.name} onReturn={() => navigateToPath(appPathForTab(defaultAppTabForPermissions(permissions)), true)} />;
  const authRedirectPath = authReturnPath();
  if (isSupabaseConfigured && session && companyAccess.access.status === "loading") {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-700"><Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />Loading company access…</div>;
  }
  if (isSupabaseConfigured && session && companyAccess.access.status === "error") {
    return <NoCompanyAccess onSignOut={handleSignOut}><div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-900">We couldn’t load deployment access. Refresh the page or contact a company administrator.</div></NoCompanyAccess>;
  }
  if (isSupabaseConfigured && session && (companyAccess.access.status === "no-company" || companyAccess.access.status === "company-suspended")) {
    return <NoCompanyAccess onSignOut={handleSignOut} />;
  }
  if (isSupabaseConfigured && session && companyAccess.access.status === "ready" && !companyAccess.activeCompanyId) {
    return <NoCompanyAccess onSignOut={handleSignOut} />;
  }
  const emailRedirectTo = typeof window === "undefined" ? undefined : new URL(authRedirectPath, window.location.origin).toString();
  const resetRedirectTo = typeof window === "undefined" ? undefined : new URL("/reset-password", window.location.origin).toString();
  if (isSupabaseConfigured && !authResolved) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-700"><Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />Checking your workspace session…</div>;
  }
  if (isSupabaseConfigured && (isResetPasswordRoute || (!session && !guestModeState))) {
    if (isResetPasswordRoute && session) {
      return <AuthScreen initialMode="reset-password" resetRedirectTo={resetRedirectTo} onPasswordUpdated={handlePasswordUpdated} onContinueInBrowser={handleContinueInBrowser} allowBrowserOnly={!isSupabaseConfigured} invitationRequired={isSupabaseConfigured} />;
    }
    return <AuthScreen initialMode={isResetPasswordRoute ? "reset-password" : "sign-in"} emailRedirectTo={emailRedirectTo} resetRedirectTo={resetRedirectTo} onAuthenticated={handleAuthenticated} onPasswordUpdated={handlePasswordUpdated} onContinueInBrowser={handleContinueInBrowser} allowBrowserOnly={!isSupabaseConfigured} invitationRequired={isSupabaseConfigured} />;
  }

  const engineeringDocumentsGuestMode = !isSupabaseConfigured || guestModeState;
  const engineeringDocumentsCanRead = engineeringDocumentsGuestMode || can(PERMISSION_KEYS.engineeringDocumentsRead);
  const engineeringDocumentsCanCreate = engineeringDocumentsGuestMode || can(PERMISSION_KEYS.engineeringDocumentsCreate);
  const engineeringDocumentsCanAnnotate = engineeringDocumentsGuestMode || can(PERMISSION_KEYS.engineeringDocumentsUpdate);
  const engineeringDocumentsCanManage = engineeringDocumentsGuestMode || can(PERMISSION_KEYS.engineeringDocumentsManage);

  return (
    <AssistantProvider
      currentCompanyId={activeCompanyId}
      currentCompanyGeneration={assistantCompanyGeneration}
      isAuthenticated={Boolean(isSupabaseConfigured && session)}
      guestMode={guestModeState}
      permissions={permissions}
       compactContext={{ route: route.pathname, companyName: activeCompany?.name, companyTimezone: activeCompany?.timezone || regionalSettings.timezone, currency: activeCompany?.defaultCurrency || regionalSettings.currency, locale: regionalSettings.locale, selectedInvoiceId: selectedInvoice?.id || undefined, selectedProjectId: selectedProject?.id || undefined, selectedSiteLogId: route.kind === "project" ? route.siteLogId : undefined, selectedPayrollPeriodId: route.kind === "tab" && route.tab === "payroll" ? payrollPeriodIdFromSearch(route.search) : undefined, selectedPayrollRunId: route.kind === "tab" && route.tab === "payroll" ? payrollRunIdFromSearch(route.search) : undefined, attendanceDate: route.kind === "tab" && route.tab === "payroll" ? attendanceDateFromSearch(route.search) : undefined }}
      onNavigate={(path) => navigateToPath(path)}
      onOpenInvoice={(invoiceId) => { const invoice = invoicesRef.current.find((item) => item.id === invoiceId); if (invoice) openInvoice(invoice); else navigateToPath(appPathForInvoice(invoiceId)); }}
      onOpenReviewInvoice={(invoiceId) => { const invoice = invoicesRef.current.find((item) => item.id === invoiceId); if (invoice) openInvoiceForReview(invoice, activeTab); else navigateToPath(appPathForReviewInvoice(invoiceId, appPathForTab(activeTab))); }}
      onOpenProject={(projectId) => { const project = projects.find((item) => item.id === projectId); if (project) projectController.openProject(project); else navigateToPath(appPathForProject(projectId)); }}
      onOpenPayrollPeriod={(periodId) => navigateToPath(periodId ? appPathForPayrollPeriod(periodId, appPathForTab(activeTab)) : appPathForTab("payroll"))}
      onOpenAttendanceDate={(date) => navigateToPath(date ? appPathForAttendanceDate(date, appPathForTab(activeTab)) : appPathForTab("payroll"))}
      onProcessAttachedInvoice={async (attachment) => {
        if (!attachment.dataBase64 || !attachment.mimeType || !attachment.fileName) throw new Error("The original invoice attachment is no longer available. Attach it again.");
        const saved = await handleExtract({ fileData: attachment.dataBase64, mimeType: attachment.mimeType, fileName: attachment.fileName, model: "gemini-3.5-flash-lite", sourceType: "UPLOAD" });
        openInvoiceForReview(saved, activeTab);
      }}
    >
      <AppShell
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        invoicesCount={invoices.length}
        reviewCount={reviewCount}
        onBatchExportExcel={() => { void handleBatchExportExcel(); }}
        workspaceSyncStatus={workspaceSyncStatus}
        accountEmail={session?.user?.email || undefined}
        onSignOut={handleSignOut}
        companies={companyAccess.companies}
        activeCompanyId={companyAccess.activeCompanyId}
        visibleRouteIds={visibleRouteIds}
        permissions={permissions}
        projectCostCompleteness={projectCostCompleteness}
        remoteInvoiceUpdate={remoteInvoiceUpdate}
        selectedInvoiceId={selectedInvoice?.id}
        onReloadRemoteInvoice={reloadLatestRemoteInvoice}
        onKeepEditingRemoteInvoice={keepEditingRemoteInvoice}
        saveState={saveState}
        notification={notification}
        onDismissNotification={() => setNotification(null)}
        isSupabaseConfigured={isSupabaseConfigured}
        workspaceLoading={workspaceLoading}
        routeNotFound={routeNotFound}
        onReturnToDashboard={() => navigateToPath(appPathForTab("dashboard"))}
      >
        <AppRouter
          route={route}
          activeTab={activeTab}
          onNavigatePath={navigateToPath}
          workspaceRouteVisible={workspaceRouteVisible}
          dashboardData={dashboardViewData}
          dashboardProjectId={dashboardProjectId}
          onDashboardProjectChange={(projectId) => {
            setDashboardProjectId(projectId);
            const project = projects.find((candidate) => candidate.id === projectId);
            if (project) setDashboardCurrency(project.currency.toUpperCase());
          }}
          onDashboardActivityPeriodChange={setDashboardActivityPeriod}
          onDashboardCustomRangeChange={(start, end) => {
            setDashboardCustomStart(start);
            setDashboardCustomEnd(end);
          }}
          onDashboardCurrencyChange={setDashboardCurrency}
          onNavigateTab={setActiveTab}
          projects={projects}
          clientBillings={clientBillingData.billings}
          clientBillingEvents={clientBillingData.events}
          clientBillingLoading={projectCostDomainLoadState === "loading"}
          onSaveClientBilling={handleSaveClientBilling}
          onTransitionClientBilling={handleTransitionClientBilling}
          clientCollections={clientCollectionData.collections}
          clientCollectionEvents={clientCollectionData.events}
          onSaveClientCollection={handleSaveClientCollection}
          onRecordClientCollection={handleRecordClientCollection}
          onReverseClientCollection={handleReverseClientCollection}
          companyId={activeCompanyId || undefined}
          engineeringDocumentsCanRead={engineeringDocumentsCanRead}
          engineeringDocumentsCanCreate={engineeringDocumentsCanCreate}
          engineeringDocumentsCanAnnotate={engineeringDocumentsCanAnnotate}
          engineeringDocumentsCanManage={engineeringDocumentsCanManage}
          engineeringDocumentsGuestMode={engineeringDocumentsGuestMode}
          selectedProject={selectedProject}
          projectSummaries={projectSummaries}
          projectDashboard={projectDashboard}
          costCodes={costCodes}
          purchaseOrders={purchaseOrders}
          receipts={purchaseOrderReceipts}
          vendors={vendors}
          projectLaborAggregates={projectLaborAggregates}
          laborSource={projectLaborSource}
          projectFormSeed={projectFormSeed}
           onOpenProject={projectController.openProject}
           onSaveProject={(project) => void projectController.saveProject(project)}
           onPreviewProjectLifecycle={projectController.previewProjectLifecycle}
           onApplyProjectLifecycle={projectController.applyProjectLifecycle}
           onArchiveProject={(project) => void projectController.archiveProject(project)}
           onReactivateProject={(project) => void projectController.reactivateProject(project)}
           onEditProject={() => { if (selectedProject) projectController.editProject(selectedProject); }}
           onSaveCostCode={handleSaveCostCode}
           onArchiveCostCode={handleArchiveCostCode}
           onReactivateCostCode={handleReactivateCostCode}
           onSavePO={handleSavePO}
           onTransitionPO={handleTransitionPO}
           onDeletePO={handleDeletePO}
           onRecordReceipt={handleRecordReceipt}
           onVoidReceipt={handleVoidReceipt}
           onAddVendor={handleAddVendor}
           purchaseOrderMatches={purchaseOrderMatches}
           onConfirmPurchaseOrderMatch={handleConfirmPurchaseOrderMatch}
           onUnmatchPurchaseOrderMatch={handleUnmatchPurchaseOrderMatch}
           onOpenPurchaseOrder={(_id) => navigateToPath(appPathForTab("procurement"))}
           rfqs={rfqs}
           supplierQuotations={supplierQuotations}
           onSaveRFQ={handleSaveRFQ}
           onTransitionRFQ={handleTransitionRFQ}
           onDeleteRFQ={handleDeleteRFQ}
           onSaveSupplierQuotation={handleSaveSupplierQuotation}
           onSelectSupplierQuotation={handleSelectSupplierQuotation}
           onRevertSupplierQuotationSelection={handleRevertSupplierQuotationSelection}
           onConvertQuotationToPO={handleConvertQuotationToPO}
          onProjectTabChange={(tab) => {
            if (route.kind === "project" && selectedProject) {
              navigateToPath(appPathForProject(selectedProject.id, tab as ProjectWorkspaceView));
            }
          }}
          onProjectBack={() => navigateToPath(appPathForTab("projects"))}
          onProjectUploadInvoice={() => {
            if (selectedProject) {
              setUploadProjectContextId(selectedProject.id);
              setWorkspaceOrigin("projects");
              setWorkspaceReturnPath(appPathForProject(selectedProject.id, "invoices"));
              navigateToPath(appPathForTab("extractor"));
            }
          }}
          onProjectAddExpense={() => {
            if (selectedProject) {
              setExpenseFormContext(selectedProject.id);
              setExpenseCorrectionContext(null);
              navigateToPath(appPathForTab("expenses"));
            }
          }}
          onProjectOpenExpenseCorrection={(expense) => {
            setExpenseFormContext(null);
            setExpenseCorrectionContext(expense.id);
            navigateToPath(appPathForTab("expenses"));
          }}
          onProjectOpenPayroll={() => setActiveTab("payroll")}
          onSaveInvoiceProjectAllocations={handleSaveInvoiceProjectAllocations}
          cashData={cashData}
          onSaveFinancialAccount={handleSaveFinancialAccount}
          onDeactivateFinancialAccount={handleDeactivateFinancialAccount}
          onReactivateFinancialAccount={handleReactivateFinancialAccount}
          onSaveFinancialSnapshot={handleSaveFinancialSnapshot}
          onSaveFinancialTransaction={handleSaveFinancialTransaction}
          onCommitFinancialImport={handleCommitFinancialImport}
          onSaveFinancialMatch={handleSaveFinancialMatch}
          onSaveFinancialMatchBatch={handleSaveFinancialMatchBatch}
          onReverseFinancialMatch={handleReverseFinancialMatch}
          canReverseFinancialMatch={(match) => isSupabaseConfigured
            ? can(PERMISSION_KEYS.cashReconcile)
              && (match.targetType === "INVOICE" ? can(PERMISSION_KEYS.invoicesWrite) : match.targetType === "PAYROLL" ? can(PERMISSION_KEYS.payrollApprove) : match.targetType === "EXPENSE" ? can(PERMISSION_KEYS.expensesWrite) : false)
            : true}
          onCorrectFinancialTransaction={handleCorrectFinancialTransaction}
          onReverseFinancialTransaction={handleReverseFinancialTransaction}
          onIgnoreFinancialTransaction={handleIgnoreFinancialTransaction}
          onRestoreFinancialTransactionToReview={handleRestoreFinancialTransactionToReview}
          onConfirmFinancialTransfer={handleConfirmFinancialTransfer}
          onReverseFinancialTransfer={handleReverseFinancialTransfer}
          cashReconciliationCandidates={cashReconciliationCandidates}
          canManageCashAccounts={!isSupabaseConfigured || can(PERMISSION_KEYS.cashAccountsManage)}
          canManageCashTransactions={!isSupabaseConfigured || can(PERMISSION_KEYS.cashTransactionsManage)}
          canCashImport={!isSupabaseConfigured || can(PERMISSION_KEYS.cashImport)}
          canCashReconcile={!isSupabaseConfigured || can(PERMISSION_KEYS.cashReconcile)}
          canSettleCashTarget={(targetType) => !isSupabaseConfigured || (targetType === "INVOICE" ? can(PERMISSION_KEYS.invoicesWrite) : targetType === "PAYROLL" ? can(PERMISSION_KEYS.payrollApprove) : can(PERMISSION_KEYS.expensesWrite))}
          onOpenCashDashboard={() => setActiveTab("dashboard")}
          invoices={invoices}
          selectedInvoice={selectedInvoice}
          reviewQueue={reviewQueue}
          reviewIndex={reviewIndex}
          saveState={saveState}
          reviewCompletion={reviewCompletion}
          retryingInvoiceId={retryingInvoiceId}
          onRetryExtraction={(invoice) => handleRetryExtraction(invoice)}
          onUpdateInvoice={handleUpdateInvoice}
          onInvoiceBack={leaveWorkspace}
          workspaceOriginLabel={workspaceOriginLabel}
          onReviewPrevious={() => moveReview("previous")}
          onReviewNext={() => moveReview("next")}
          onReviewSave={saveCurrentReview}
          onVerifyAndNext={verifyAndNext}
          onReopenInvoice={(invoice) => handleReopen(invoice)}
          onContinueWithNewItems={() => startReview(invoicesRef.current.filter((item) => item.reviewStatus === "NEEDS_REVIEW"), undefined, workspaceOrigin)}
          onReturnToDashboard={() => resetWorkspaceSelection("dashboard")}
          onViewVerified={() => resetWorkspaceSelection("invoices")}
          onRevertToAI={(invoice) => void handleRevertToAI(invoice)}
          onRevertField={(invoice, path) => void handleRevertField(invoice, path)}
          invoiceProjectAllocations={invoiceProjectAllocations}
          uploadProjectContextId={uploadProjectContextId}
          onExtractInvoice={handleExtract}
          onLoadInvoicePreset={(invoice) => void handleLoadPreset(invoice)}
          onBatchExtractComplete={handleBatchComplete}
          processingCount={processingCount}
          gmailConnection={gmailConnection}
          onConnectGmail={connectGoogleAndGmail}
          onSignOut={handleSignOut}
          onScanGmail={handleScanGmail}
          onSyncGmail={handleSyncGmail}
          onImportGmailMessage={handleImportGmailMessage}
          onProcessEmail={handleProcessEmail}
          onSelectInvoice={openInvoice}
          onOpenInvoiceForReview={openInvoiceForReview}
          onStartReview={(queue) => startReview(queue, undefined, "review")}
          onPreviewInvoiceCorrection={previewInvoiceCorrection}
          onApplyInvoiceCorrection={applyInvoiceCorrection}
          onAddNewInvoice={() => resetWorkspaceSelection("extractor")}
          payrollData={payrollData}
          payrollImportData={payrollImportData}
          payrollPeriodPreparationState={payrollPeriodPreparationState}
          onRetryPayrollPeriodPreparation={retryPayrollPeriodPreparation}
          onSavePayrollWorker={(worker) => void handleSaveWorker(worker)}
          onSavePayrollAssignment={(assignment) => void handleSaveAssignment(assignment)}
          onSavePayrollPeriod={(period) => void handleSavePayrollPeriod(period)}
          onSavePayrollSchedule={(schedule) => void handleSavePayrollSchedule(schedule)}
          canManagePayrollSettings={!isSupabaseConfigured || can(PERMISSION_KEYS.payrollSettings)}
          canManagePayrollMaintenance={payrollMaintenanceAllowed}
          canManageWorkforce={!isSupabaseConfigured || can(PERMISSION_KEYS.workersManage)}
          canManagePayrollSources={!isSupabaseConfigured || can(PERMISSION_KEYS.payrollWrite)}
          canManagePayrollImports={!isSupabaseConfigured || (can(PERMISSION_KEYS.payrollImport) && can(PERMISSION_KEYS.payrollWrite))}
          onPayrollLifecycle={(request) => handlePayrollLifecycle(request)}
          onSaveWorkerCompensationProfile={(profile) => void handleSaveCompensationProfile(profile)}
          onSaveRecurringPayrollComponent={(component) => void handleSaveRecurringComponent(component)}
          onSavePayrollWorkEntry={(entry) => void handleSaveWorkEntry(entry)}
          onSavePayrollAttendance={(record) => void handleSaveAttendance(record)}
          onSavePayrollAttendanceBatch={(records) => void handleSaveAttendanceBatch(records)}
          onSavePayrollLeave={(request) => void handleSaveLeave(request)}
          onSavePayrollOvertime={(request) => void handleSaveOvertime(request)}
          onSavePayrollHoliday={(holiday) => void handleSaveHoliday(holiday)}
          onSavePayrollEntry={(entry, allocations) => void handleSavePayrollEntry(entry, allocations)}
          onUpdatePayrollRun={(run) => void handleUpdatePayrollRun(run)}
          onCreatePayrollRun={handleCreatePayrollRun}
          onCalculatePayrollRun={(run) => void handleCalculatePayrollRun(run)}
          onStagePayrollImport={(batch, rows, bytes) => void handleStagePayrollImport(batch, rows, bytes)}
          onSavePayrollImportTemplate={(template) => void handleSavePayrollImportTemplate(template)}
          onCommitPayrollImport={(staged, periodStart, periodEnd, payDate) => void handleCommitPayrollImport(staged, periodStart, periodEnd, payDate)}
          onPreviewPayrollMaintenance={(action) => handlePreviewPayrollMaintenance(action)}
          onApplyPayrollMaintenance={(action, confirmation) => handleApplyPayrollMaintenance(action, confirmation)}
          onPreviewFactoryReset={() => handlePreviewPayrollWorkspaceReset()}
          onApplyFactoryReset={(confirmation) => handleApplyPayrollWorkspaceReset(confirmation)}
          expenses={expenses}
          expenseFormContext={expenseFormContext}
          expenseCorrectionContext={expenseCorrectionContext}
          onSaveExpense={(expense) => void handleSaveExpense(expense)}
          onPreviewExpenseCorrection={previewExpenseCorrection}
          onApplyExpenseCorrection={applyExpenseCorrection}
          onExpenseCorrectionContextConsumed={() => setExpenseCorrectionContext(null)}
          regionalSettings={regionalSettings}
          onRegionalSettingsChange={handleRegionalSettingsChange}
        />
      </AppShell>
    </AssistantProvider>
  );
}

export default InvoiceWorkspace;
