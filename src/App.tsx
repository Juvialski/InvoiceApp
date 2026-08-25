import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Cloud, Loader2, X } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { Header, AppTab } from "./components/Header";
import { AccessDenied, CompanySwitcher, NoCompanyAccess } from "./components/access/AccessStates.tsx";
import { CompanyManagement } from "./components/access/CompanyManagement.tsx";

import { AuthScreen } from "./components/auth";
import { UploadZone, ExtractPayload } from "./components/UploadZone";
import { InvoiceDirectory } from "./components/InvoiceDirectory";
import { EmailInbox } from "./components/EmailInbox";
import { Vendors } from "./components/Vendors";
import { Reports } from "./components/Reports";
import { ReviewQueue } from "./components/ReviewQueue";
import { VerificationWorkspace } from "./components/VerificationWorkspace";
import type { SaveState } from "./components/VerificationWorkspace";
import { Settings as SettingsScreen } from "./components/Settings";
import { EngineeringCostOperationsDashboard } from "./components/engineering/EngineeringCostOperationsDashboard";
import { ProjectReports } from "./components/engineering/ProjectReports";
import { ProjectsPage } from "./components/projects/ProjectsPage";
import { PayrollOperatingCosts } from "./components/engineering/PayrollOperatingCosts";
import { ProjectWorkspace } from "./components/projects/ProjectWorkspace";
import { ExpensesPage } from "./components/expenses/ExpensesPage";
import { PayrollPageV2 as PayrollPage } from "./components/payroll/PayrollPageV2";
import { appPathForInvoice, appPathForPlatformCompanies, appPathForProject, appPathForReviewInvoice, appPathForTab, appPathFromLocation, appTabForLocation, isKnownWorkspaceLocation, parseAppLocation, type AppLocation, type ProjectWorkspaceView } from "./utils/appRouting";
import { DEFAULT_ROUTE_PATH, ROUTE_DEFINITIONS, type RouteId } from "./utils/routes";
import { canAccessAppTab, defaultAppTabForPermissions, hasAnyPermission, hasPermission, PERMISSION_KEYS, permittedAppTabs, requiredPermissionForAppTab } from "./utils/accessControl";
import { Department, EmailClassification, Expense, GmailConnectionInfo, GmailImportedMessage, GmailMessageCandidate, GmailScanWindow, InvoiceData, InvoiceProjectAllocation, PayrollEntry, PayrollPeriod, PayrollProjectAllocation, PayrollRun, Project, ProjectCostSummary, ProjectWorkerAssignment, Worker, WorkEntry } from "./types";
import type { AttendanceRecord, LeaveRequest, OvertimeRequest, PayrollHoliday } from "./types";
import { exportBatchInvoicesToExcel, exportEngineeringProjectWorkbookToExcel } from "./utils/excelExport";
import { applyLocalChecks, findPossibleDuplicate } from "./utils/invoiceLogic";
import { nextPendingReviewInvoiceId, nextReviewInvoiceId, orderedReviewQueue } from "./utils/reviewQueue";
import { readAndCleanLocalInvoices } from "./utils/demoCleanup";
import { enqueueSerializedSave } from "./utils/saveSequencing";
import { currencySymbolFor, DEFAULT_CURRENCY, loadRegionalSettings, RegionalSettings, setRegionalSettings as setActiveRegionalSettings } from "./config/regional";
import { calculateProjectCost } from "./utils/projectCosting";
import type { DashboardActivityPeriod } from "./components/engineering/EngineeringCostOperationsDashboard";
import { buildDashboardViewData } from "./utils/dashboardViewModel";
import { buildProjectDashboardViewData } from "./utils/projectDashboardViewModel";
import { calculatePayrollRunFromWorkEntries } from "./lib/payrollCalculation";
import { transitionLeaveRequest } from "./lib/payrollWorkforce";
import { buildAutomaticPayrollDraft, createDefaultPayrollSchedule, dateOnly, ensurePayrollPeriodsAndRuns, payrollDraftToRecords } from "./lib/payrollWorkflow";
import { useCompanyAccess } from "./context/CompanyAccessContext.tsx";
import { companyApiRequest } from "./lib/companyApi.ts";
import type { PayrollSchedule } from "./lib/payrollSchedule";
import type { RecurringPayrollComponent, WorkerCompensationProfile } from "./lib/payrollAutomation";
import { captureGoogleProviderTokens, connectGoogleAndGmail, getGoogleProviderToken, isSupabaseConfigured, supabase } from "./lib/supabase";
import {
  deleteInvoiceFromSupabase,
  ensureWorkspaceProfile,
  loadGmailSyncState,
  loadInvoicesFromSupabase,
  loadSourcePayloadForRetry,
  markEmailClassification,
  markSourceDocumentStatus,
  persistNewInvoice,
  persistExtractionAttempt,
  saveGmailMessageSource,
  saveGmailSyncState,
  saveManualEmailRecord,
  saveManualSourceDocument,
  updateInvoiceInSupabase,
} from "./lib/persistence";
import {
  archiveProjectInSupabase,
  loadInvoiceProjectAllocationsFromSupabase,
  loadProjectsFromSupabase,
  readInvoiceProjectAllocationsFromLocal,
  readProjectsFromLocal,
  replaceInvoiceProjectAllocationsOnSupabase,
  saveProjectToSupabase,
  writeInvoiceProjectAllocationsToLocal,
  writeProjectsToLocal,
} from "./lib/projects";
import { archiveExpenseInSupabase, createLocalExpense, loadExpensesFromSupabase, readExpensesFromLocal, saveExpenseToSupabase, writeExpensesToLocal } from "./lib/expenses";
import { canTransitionPayrollRun, emptyPayrollWorkspaceData, loadPayrollWorkspaceFromSupabase, PayrollWorkspaceData, readPayrollWorkspaceFromLocal, replacePayrollRunEntriesToSupabase, saveAssignmentToSupabase, saveAttendanceRecordToSupabase, saveAttendanceRecordsToSupabase, saveDepartmentToSupabase, saveLeaveRequestToSupabase, saveOvertimeRequestToSupabase, savePayrollEntryToSupabase, savePayrollHolidayToSupabase, savePayrollPeriodToSupabase, savePayrollRunToSupabase, savePayrollScheduleToSupabase, saveRecurringPayrollComponentToSupabase, saveWorkerCompensationProfileToSupabase, saveWorkEntryToSupabase, saveWorkerToSupabase, validatePayrollAllocations, validatePayrollRunApproval, writePayrollWorkspaceToLocal } from "./lib/payroll";
import { selectPrimaryPayrollSchedule } from "./lib/payrollIntegrity";
import { applyPayrollMaintenance as applyPayrollMaintenanceRpc, localMaintenanceResult, planLocalPayrollMaintenance, previewPayrollMaintenance as previewPayrollMaintenanceRpc, type PayrollMaintenanceAction, type PayrollMaintenancePreview } from "./lib/payrollMaintenance";
import { commitPayrollImportToSupabase, findDuplicatePayrollImportBatches, loadPayrollImportWorkspaceFromSupabase, readPayrollImportWorkspaceFromLocal, savePayrollImportBatchToSupabase, savePayrollImportRowsToSupabase, savePayrollImportTemplateToSupabase, uploadPayrollImportSourceToSupabase, writePayrollImportWorkspaceToLocal, type PayrollImportBatch, type PayrollImportRow, type PayrollImportTemplate, type PayrollImportWorkspaceData } from "./lib/payrollImportPersistence";
import { fingerprintPayrollSources, validatePayrollRunSourceRevision } from "./lib/payrollSourceRevision";
import { buildDraftPayrollFromImport, type StagedPayrollImport } from "./lib/payrollImportWorkflow";
import { canApplyWorkspaceLoad, decideRemoteInvoiceRefresh, resolveEntityById, shouldPersistGuestWorkspace } from "./utils/remoteConflict";
import { createBrowserWorkspaceSyncEnvironment, createWorkspaceLoadCache, createWorkspaceSyncController, createWorkspaceSyncInstrumentation, type WorkspaceRefreshGroup, type WorkspaceSyncController, type WorkspaceSyncStatus } from "./lib/workspaceSync";
import { replaceInvoiceProjectAllocationsLocally } from "./utils/projectAllocations";
import { AssistantProvider } from "./assistant/AssistantProvider";
import { disableCompanyGemini, enableCompanyGemini, loadCompanyAiConfig as loadCompanyAiConfigApi, removeCompanyGeminiKey, saveCompanyGeminiKey, testCompanyGeminiKey } from "./lib/companyAiApi.ts";

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
  return mimeType === "application/pdf" || mimeType.startsWith("image/") || /\.(pdf|png|jpe?g|webp)$/i.test(filename);
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
  const message = error instanceof Error ? error.message : String((error as any)?.message || "");
  if (import.meta.env.DEV && message) console.error("[InvoiceApp]", error);
  if (/AI backend configuration is incomplete|AI is not configured for this company|AI is disabled for this company|configured Gemini API key is invalid|Gemini quota or rate limit reached|Gemini is temporarily unavailable|configured Gemini model is unavailable|Gemini access is denied/i.test(message)) return message;
  if (/record\s+["']?new["']?\s+has no field|project_id|default_project_id|row-level security|foreign key/i.test(message)) return fallback;
  return /gemini|supabase|storage|api[_ -]?key|provider|model/i.test(message) ? fallback : (message || fallback);
}

type PayrollWorkspaceLoadState = "idle" | "loading" | "loaded" | "failed";

function initialAppLocation(): AppLocation {
  if (typeof window === "undefined") return parseAppLocation(DEFAULT_ROUTE_PATH);
  return parseAppLocation(window.location.pathname, window.location.search);
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
  const [activeTab, setActiveTabState] = useState<AppTab>(() => appTabForLocation(initialAppLocation()));
  const [dashboardActivityPeriod, setDashboardActivityPeriod] = useState<DashboardActivityPeriod>("MONTH");
  const [dashboardCustomStart, setDashboardCustomStart] = useState("");
  const [dashboardCustomEnd, setDashboardCustomEnd] = useState("");
  const [dashboardCurrency, setDashboardCurrency] = useState("");
  const [dashboardProjectId, setDashboardProjectId] = useState("");
  const [workspaceReturnPath, setWorkspaceReturnPath] = useState<string>(appPathForTab(appTabForLocation(initialAppLocation())));
  const routeSignatureRef = useRef("");
  const platformManagementReturnPathRef = useRef<string | null>(null);
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
    isPlatformOwner,
    isSwitching,
    can,
    refreshAccess,
    selectCompany,
    enterGuestMode,
    signOut: signOutFromAccess,
    createCompany,
    updateCompany,
    inviteCompanyMember,
    updateCompanyMember,
    loadCompanyMembers,
    loadCompanyInvitations,
    loadCompanyAccessAudit,
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
  const [projects, setProjects] = useState<Project[]>(() => isSupabaseConfigured ? [] : readProjectsFromLocal());
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectFormSeed, setProjectFormSeed] = useState<Project | null>(null);
  const [payrollImportData, setPayrollImportData] = useState<PayrollImportWorkspaceData>(() => isSupabaseConfigured ? { batches: [], rows: [], templates: [] } : readPayrollImportWorkspaceFromLocal());
  const [invoiceProjectAllocations, setInvoiceProjectAllocations] = useState<InvoiceProjectAllocation[]>(() => isSupabaseConfigured ? [] : readInvoiceProjectAllocationsFromLocal());
  const [expenses, setExpenses] = useState<Expense[]>(() => isSupabaseConfigured ? [] : readExpensesFromLocal());
  const [payrollData, setPayrollData] = useState<PayrollWorkspaceData>(() => isSupabaseConfigured ? emptyPayrollWorkspaceData() : readPayrollWorkspaceFromLocal());
  const payrollDataRef = useRef<PayrollWorkspaceData>(payrollData);
  const payrollAutomationKeyRef = useRef("");
  const payrollScheduleSignature = payrollData.schedules.map((schedule) => `${schedule.id}:${schedule.frequency}:${schedule.updatedAt || ""}`).join("|");
  const [payrollWorkspaceLoadState, setPayrollWorkspaceLoadState] = useState<PayrollWorkspaceLoadState>(isSupabaseConfigured ? "loading" : "loaded");
  const [payrollRefreshing, setPayrollRefreshing] = useState(false);
  const payrollBootstrapInFlightRef = useRef<Promise<void> | null>(null);
  const payrollBootstrapPersistedUsersRef = useRef(new Set<string>());
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
  const validatedWorkspaceReturnPath = (candidate?: string | null) => {
    const fallback = appPathForTab(defaultAppTabForPermissions(permissions));
    if (!activeCompanyId || !candidate) return fallback;
    const parsed = parseAppLocation(candidate);
    if (!isKnownWorkspaceLocation(parsed)) return fallback;
    if (!isPlatformOwner && !canAccessAppTab(parsed.tab, permissions)) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  };
  const openPlatformManagement = () => {
    const currentPath = typeof window === "undefined" ? null : appPathFromLocation(window.location);
    if (currentPath && parseAppLocation(currentPath).kind !== "platform-companies") {
      platformManagementReturnPathRef.current = validatedWorkspaceReturnPath(currentPath);
    } else if (!platformManagementReturnPathRef.current) {
      platformManagementReturnPathRef.current = validatedWorkspaceReturnPath(workspaceReturnPath);
    }
    navigateToPath(appPathForPlatformCompanies(activeCompanyId));
  };
  const closePlatformManagement = () => {
    const returnPath = validatedWorkspaceReturnPath(platformManagementReturnPathRef.current || workspaceReturnPath);
    platformManagementReturnPathRef.current = null;
    navigateToPath(returnPath, true);
  };
  const loadManagedCompanyAiConfig = useCallback((companyId: string) => loadCompanyAiConfigApi(companyId), []);
  const saveManagedCompanyAiKey = useCallback((companyId: string, apiKey: string) => saveCompanyGeminiKey(companyId, apiKey), []);
  const testManagedCompanyAi = useCallback((companyId: string) => testCompanyGeminiKey(companyId), []);
  const disableManagedCompanyAi = useCallback((companyId: string) => disableCompanyGemini(companyId), []);
  const enableManagedCompanyAi = useCallback((companyId: string) => enableCompanyGemini(companyId), []);
  const removeManagedCompanyAi = useCallback((companyId: string) => removeCompanyGeminiKey(companyId), []);

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
    setActiveTabState(appTabForLocation(route));
    const signature = `${route.kind}:${route.pathname}${route.search}`;
    if (routeSignatureRef.current === signature) return;
    routeSignatureRef.current = signature;
    if (route.kind === "platform-companies") return;
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
    if (route.kind === "platform-companies") return;
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
        const ids = invoices.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW").map((invoice) => invoice.id);
        setReviewSessionIds(ids.includes(invoiceRoute.invoiceId) ? ids : [invoiceRoute.invoiceId, ...ids]);
      }
      return;
    }
    setSelectedInvoice(null);
    setReviewSessionIds([]);
  }, [route, invoices, reviewSessionIds.length, workspaceLoading]);

  useEffect(() => {
    if (route.kind !== "project") {
      setSelectedProject(null);
      return;
    }
    setSelectedProject(resolveEntityById(projects, route.projectId));
  }, [route, projects]);

  const [expenseFormContext, setExpenseFormContext] = useState<string | null>(null);
  const [uploadProjectContextId, setUploadProjectContextId] = useState<string | null>(null);
  const setGuestMode = (enabled: boolean) => {
    guestModeRef.current = enabled;
    if (enabled) enterGuestMode();
  };

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
    setProjects([]);
    setSelectedProject(null);
    setProjectFormSeed(null);
    setInvoiceProjectAllocations([]);
    setExpenses([]);
    setPayrollImportData({ batches: [], rows: [], templates: [] });
    const emptyPayrollData = emptyPayrollWorkspaceData();
    setPayrollData(emptyPayrollData);
    payrollDataRef.current = emptyPayrollData;
    payrollAutomationKeyRef.current = "";
    payrollBootstrapInFlightRef.current = null;
    setPayrollWorkspaceLoadState(isSupabaseConfigured ? "loading" : "idle");
    setPayrollRefreshing(false);
    setSyncState({});
  };

  const showNotification = (type: "success" | "error" | "info", message: string) => {
    setNotification({ type, message });
    const duration = type === "success" ? 3500 : type === "info" ? 9000 : 0;
    if (duration > 0) window.setTimeout(() => setNotification((current) => current?.message === message ? null : current), duration);
  };

  const allWorkspaceRefreshGroups: readonly WorkspaceRefreshGroup[] = ["invoices", "engineering", "payroll", "payroll-imports", "gmail"];

  const currentWorkspaceLoadToken = () => {
    const userId = sessionRef.current?.user?.id;
    return userId && activeCompanyId ? { generation: workspaceGenerationRef.current, userId, companyId: activeCompanyId } : null;
  };

  const canApplyWorkspaceResult = (token: { generation: number; userId: string; companyId: string }) =>
    canApplyWorkspaceLoad(token, currentWorkspaceLoadToken());

  const workspaceGroupsAllowedForPermissions = (groups: readonly WorkspaceRefreshGroup[]) => groups.filter((group) => group === "invoices"
    ? can(PERMISSION_KEYS.invoicesRead)
    : group === "engineering"
      ? hasAnyPermission(permissions, [PERMISSION_KEYS.projectsRead, PERMISSION_KEYS.invoicesRead, PERMISSION_KEYS.expensesRead])
      : group === "payroll"
        ? can(PERMISSION_KEYS.payrollRead)
        : group === "payroll-imports"
          ? hasAnyPermission(permissions, [PERMISSION_KEYS.payrollImport, PERMISSION_KEYS.payrollWrite])
          : group === "gmail"
            ? can(PERMISSION_KEYS.gmailRead)
            : false);

  type EngineeringWorkspaceGroup = { projects: Project[]; allocations: InvoiceProjectAllocation[]; expenses: Expense[] };
  type WorkspaceGroupData = InvoiceData[] | EngineeringWorkspaceGroup | PayrollWorkspaceData | PayrollImportWorkspaceData | { lastHistoryId?: string; lastSyncedAt?: string };

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
    setProjects(data.projects);
    setInvoiceProjectAllocations(data.allocations);
    setExpenses(data.expenses);
  };

  const loadEngineeringGroup = async (): Promise<EngineeringWorkspaceGroup> => {
    const results = await Promise.allSettled([
      can(PERMISSION_KEYS.projectsRead) ? loadProjectsFromSupabase() : Promise.resolve([]),
      can(PERMISSION_KEYS.projectsRead) || can(PERMISSION_KEYS.invoicesRead) ? loadInvoiceProjectAllocationsFromSupabase() : Promise.resolve([]),
      can(PERMISSION_KEYS.expensesRead) ? loadExpensesFromSupabase() : Promise.resolve([]),
    ]);
    const failures: string[] = [];
    const projects = results[0].status === "fulfilled" ? results[0].value : [];
    const allocations = results[1].status === "fulfilled" ? results[1].value : [];
    const expenses = results[2].status === "fulfilled" ? results[2].value : [];
    if (results[0].status !== "fulfilled") failures.push("projects");
    if (results[1].status !== "fulfilled") failures.push("invoice allocations");
    if (results[2].status !== "fulfilled") failures.push("expenses");
    if (failures.length) throw new Error(`Engineering refresh failed for: ${failures.join(", ")}.`);
    return { projects, allocations, expenses };
  };

  const loadPayrollGroup = async () => loadPayrollWorkspaceFromSupabase();

  const applyPayrollForWorkspace = (data: PayrollWorkspaceData, token: { generation: number; userId: string; companyId: string }) => {
    if (!canApplyWorkspaceResult(token)) return;
    payrollDataRef.current = data;
    setPayrollData(data);
    setPayrollWorkspaceLoadState("loaded");
  };

  const loadPayrollImportsGroup = async () => loadPayrollImportWorkspaceFromSupabase();
  const applyPayrollImportsForWorkspace = (data: PayrollImportWorkspaceData, token: { generation: number; userId: string; companyId: string }) => {
    if (!canApplyWorkspaceResult(token)) return;
    setPayrollImportData(data);
  };

  const loadGmailGroup = async () => loadGmailSyncState();
  const applyGmailForWorkspace = (data: { lastHistoryId?: string; lastSyncedAt?: string }, token: { generation: number; userId: string; companyId: string }) => {
    if (!canApplyWorkspaceResult(token)) return;
    setSyncState(data);
  };

  const loadWorkspaceGroup = async (group: WorkspaceRefreshGroup): Promise<WorkspaceGroupData> => {
    if (group === "invoices") return loadInvoicesGroup();
    if (group === "engineering") return loadEngineeringGroup();
    if (group === "payroll") return loadPayrollGroup();
    if (group === "payroll-imports") return loadPayrollImportsGroup();
    return loadGmailGroup();
  };

  const applyWorkspaceGroup = (group: WorkspaceRefreshGroup, data: WorkspaceGroupData, token: { generation: number; userId: string; companyId: string }) => {
    if (group === "invoices") applyInvoicesForWorkspace(data as InvoiceData[], token);
    else if (group === "engineering") applyEngineeringForWorkspace(data as EngineeringWorkspaceGroup, token);
    else if (group === "payroll") applyPayrollForWorkspace(data as PayrollWorkspaceData, token);
    else if (group === "payroll-imports") applyPayrollImportsForWorkspace(data as PayrollImportWorkspaceData, token);
    else applyGmailForWorkspace(data as { lastHistoryId?: string; lastSyncedAt?: string }, token);
  };

  const refreshWorkspaceGroup = async (group: WorkspaceRefreshGroup, token: { generation: number; userId: string; companyId: string }, options: { force?: boolean; reason?: string } = {}) => {
    if (group === "payroll") {
      setPayrollRefreshing(true);
      if (!workspaceLoadCacheRef.current.get({ userId: token.userId, companyId: token.companyId, group })?.hasData) setPayrollWorkspaceLoadState("loading");
    }
    const request = workspaceLoadCacheRef.current.getOrLoad(
      { userId: token.userId, companyId: token.companyId, group },
      () => loadWorkspaceGroup(group),
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
      if (group === "payroll" && canApplyWorkspaceResult(token)) setPayrollWorkspaceLoadState("failed");
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

  useEffect(() => {
    captureGoogleProviderTokens(session);
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
      setProjects(readProjectsFromLocal());
      setInvoiceProjectAllocations(readInvoiceProjectAllocationsFromLocal());
      setExpenses(readExpensesFromLocal());
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
      writeProjectsToLocal(projects);
      writeInvoiceProjectAllocationsToLocal(invoiceProjectAllocations);
      writePayrollImportWorkspaceToLocal(payrollImportData);
      writeExpensesToLocal(expenses);
      writePayrollWorkspaceToLocal(payrollData);
    }
  }, [projects, invoiceProjectAllocations, expenses, payrollData, payrollImportData, session, authResolved, guestModeState]);

  useEffect(() => {
    payrollDataRef.current = payrollData;
  }, [payrollData]);

  useEffect(() => {
    if (!authResolved || activeTab !== "payroll" || workspaceLoading || payrollRefreshing) return;
    const snapshot = payrollDataRef.current;
    const userId = session?.user?.id;
    if (userId && supabase) {
      if (payrollWorkspaceLoadState !== "loaded" || snapshot.schedules.length > 0) return;
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
        } catch (error) {
          if (canApplyWorkspaceResult(token)) {
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
    if (!snapshot.schedules.length) {
      const schedules = [{ ...createDefaultPayrollSchedule(dateOnly()), autoCalculate: false, autoCreateRuns: true, autoSelectCurrentPeriod: true }] as unknown as PayrollSchedule[];
      const next = { ...snapshot, schedules };
      payrollDataRef.current = next;
      setPayrollData(next);
      payrollAutomationKeyRef.current = `seed:${schedules[0]!.id}`;
      return;
    }
    const activeSchedule = selectPrimaryPayrollSchedule(snapshot.schedules);
    if (!activeSchedule) return;
    const today = dateOnly();
    const key = `${session?.user?.id || "guest"}:${today}:${activeSchedule.id}:${snapshot.periods.length}:${snapshot.runs.length}`;
    if (payrollAutomationKeyRef.current === key) return;
    payrollAutomationKeyRef.current = key;
    const ensured = ensurePayrollPeriodsAndRuns({
      schedules: [activeSchedule],
      periods: snapshot.periods,
      runs: snapshot.runs,
      entries: snapshot.entries,
      workEntries: snapshot.workEntries,
      importBatches: payrollImportData.batches,
      referenceDate: today,
      previous: 2,
      next: 2,
    });
    const periodChanged = ensured.periods.length !== snapshot.periods.length || ensured.periods.some((period) => {
      const previous = snapshot.periods.find((item) => item.id === period.id);
      return !previous || previous.status !== period.status || previous.payDate !== period.payDate || previous.scheduleId !== period.scheduleId || previous.scheduleVersionId !== period.scheduleVersionId || previous.lockedAt !== period.lockedAt || previous.notes !== period.notes;
    });
    const runChanged = ensured.runs.some((run) => {
      const previous = snapshot.runs.find((item) => item.id === run.id);
      return !previous || previous.status !== run.status || previous.notes !== run.notes;
    });
    if (!periodChanged && !runChanged) return;
    const next = { ...snapshot, periods: ensured.periods, runs: ensured.runs };
    payrollDataRef.current = next;
    setPayrollData(next);
    if (session && supabase) {
      void (async () => {
        try {
          for (const period of ensured.periods.filter((item) => item.autoGenerated && (!snapshot.periods.some((old) => old.id === item.id && old.status === period.status && old.payDate === period.payDate && old.scheduleVersionId === period.scheduleVersionId && old.lockedAt === period.lockedAt)))) await savePayrollPeriodToSupabase(period);
          for (const run of ensured.runs.filter((item) => !snapshot.runs.some((old) => old.id === item.id && old.status === item.status && old.notes === item.notes))) await savePayrollRunToSupabase(run);
        } catch (error) {
          showNotification("info", userFacingError(error, "Generated payroll periods are available locally; apply the latest payroll migration to sync them."));
        }
      })();
    }
  }, [activeTab, authResolved, workspaceLoading, payrollRefreshing, payrollWorkspaceLoadState, session?.user?.id, payrollData.periods.length, payrollData.runs.length, payrollScheduleSignature, payrollImportData.batches.length]);
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
      return prepared;
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Invoice extraction failed. Check the document and try again."));
      throw error;
    } finally {
      setProcessingCount((n) => Math.max(0, n - 1));
    }
  };

  const handleProcessEmail = async ({ sender, subject, receivedAt, body, attachments }: { sender: string; subject: string; receivedAt: string; body: string; attachments: File[] }): Promise<EmailClassification | null> => {
    setProcessingCount((n) => n + 1);
    try {
      const classifyResponse = await companyApiRequest("/api/classify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sender, subject, body, attachmentNames: attachments.map((file) => file.name), model: "gemini-3.5-flash-lite" }), companyId: companyAccess.activeCompanyId || "" });
      const classifyResult = await classifyResponse.json();
      if (!classifyResponse.ok || !classifyResult.success) throw new Error(classifyResult.error || "Email classification failed.");
      const classification: EmailClassification = classifyResult.data;
      const manualEmail = session ? await saveManualEmailRecord({ sender, subject, receivedAt, body }) : undefined;
      const extractedInvoices: InvoiceData[] = [];

      if (attachments.length > 0) {
        for (const attachment of attachments) {
          const encoded = await fileToBase64(attachment);
          const storedSource = session ? await saveManualSourceDocument({ ...encoded, fileName: attachment.name, emailMessageId: manualEmail?.id, sourceType: "EMAIL" }) : undefined;
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
      } else {
        let extracted = await extractPayload({ textData: body || subject, fileName: subject || "Email invoice", model: "gemini-3.5-flash-lite", sourceType: "EMAIL", emailContext: { sender, subject, receivedAt, body, emailRecordId: manualEmail?.id } });
        extracted = { ...extracted, sourceEmailId: manualEmail?.id };
        const saved = await saveExtracted(extracted);
        sourcePayloadsRef.current.set(saved.id, { textData: body || subject, fileName: subject || "Email invoice", model: "gemini-3.5-flash-lite", sourceType: "EMAIL", emailContext: { sender, subject, receivedAt, body, emailRecordId: manualEmail?.id } });
        extractedInvoices.push(saved);
      }
      if (extractedInvoices.length) startReview(extractedInvoices, undefined, "inbox");
      showNotification("success", `Email processed: ${classification.documentType || "financial document"} detected and saved for review.`);
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

  const classifyGmailCandidates = async (messages: GmailMessageCandidate[]) => {
    const output: GmailMessageCandidate[] = [];
    for (let i = 0; i < messages.length; i += 4) {
      const batch = messages.slice(i, i + 4);
      const classified = await Promise.all(batch.map(async (message) => {
        try {
          const response = await companyApiRequest("/api/classify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sender: message.sender, subject: message.subject, body: message.bodyText, attachmentNames: message.attachments.map((item) => item.filename), model: "gemini-3.5-flash-lite" }), companyId: companyAccess.activeCompanyId || "" });
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.error || "Classification failed");
          return { ...message, classification: result.data as EmailClassification, importStatus: result.data.isInvoiceLike ? "READY" as const : "IGNORED" as const };
        } catch {
          return { ...message, importStatus: "READY" as const };
        }
      }));
      output.push(...classified);
    }
    return output;
  };

  const handleScanGmail = async (window: GmailScanWindow | number): Promise<GmailMessageCandidate[]> => {
    if (!session) throw new Error("Connect Google + Gmail first.");
    setProcessingCount((n) => n + 1);
    try {
      const selectedWindow = typeof window === "number" ? { days: window } : window;
      const range = selectedWindow.after && selectedWindow.before
        ? `after:${gmailQueryDate(selectedWindow.after)} before:${gmailQueryDate(selectedWindow.before, true)}`
        : `newer_than:${selectedWindow.days || 30}d`;
      const query = `${range} {subject:invoice subject:\"sales invoice\" subject:\"service invoice\" subject:\"VAT invoice\" subject:billing subject:SOA \"statement of account\" \"credit note\" \"tax invoice\" BIR VAT TIN \"amount due\" filename:pdf filename:png filename:jpg filename:jpeg}`;
      const data = await gmailRequest("/api/gmail/scan", { query, maxResults: 30 });
      const classified = await classifyGmailCandidates(data.messages || []);
      const nextSync = await saveGmailSyncState(data.historyId, data.emailAddress);
      setSyncState(nextSync);
      showNotification("success", `Scanned Gmail and classified ${classified.length} likely finance email${classified.length === 1 ? "" : "s"}.`);
      return classified;
    } finally {
      setProcessingCount((n) => Math.max(0, n - 1));
    }
  };

  const handleSyncGmail = async (): Promise<GmailMessageCandidate[]> => {
    if (!session) throw new Error("Connect Google + Gmail first.");
    if (!syncState.lastHistoryId) return handleScanGmail({ days: 30 });
    setProcessingCount((n) => n + 1);
    try {
      const data = await gmailRequest("/api/gmail/history", { startHistoryId: syncState.lastHistoryId });
      const classified = await classifyGmailCandidates(data.messages || []);
      const nextSync = await saveGmailSyncState(data.historyId, data.emailAddress);
      setSyncState(nextSync);
      showNotification("success", classified.length ? `Found ${classified.length} new/changed Gmail message${classified.length === 1 ? "" : "s"}.` : "Gmail is up to date.");
      return classified;
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
    setProcessingCount((n) => n + 1);
    try {
      const imported = await gmailRequest("/api/gmail/import", { messageId: candidate.id }) as GmailImportedMessage;
      const stored = await saveGmailMessageSource(imported);
      if (candidate.classification) await markEmailClassification(stored.email.id, candidate.classification);
      let extractedCount = 0;
      const extractedInvoices: InvoiceData[] = [];
      for (let index = 0; index < imported.attachments.length; index += 1) {
        const attachment = imported.attachments[index];
        if (!attachment.dataBase64 || !isExtractableAttachment(attachment.mimeType, attachment.filename)) continue;
        const source = stored.documents[index];
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
      if (extractedInvoices.length) startReview(extractedInvoices, undefined, "inbox");
      showNotification("success", `Saved original Gmail message and ${stored.documents.length} attachment${stored.documents.length === 1 ? "" : "s"}; created ${extractedCount} invoice extraction${extractedCount === 1 ? "" : "s"}.`);
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

  const handleSaveProject = async (project: Project) => {
    try {
      const previous = projects.find((item) => item.id === project.id);
      const payrollRelevantChange = Boolean(previous && (previous.status !== project.status || Boolean(previous.archivedAt) !== Boolean(project.archivedAt)));
      const saved = session && supabase ? await saveProjectToSupabase(project) : { ...project, updatedAt: new Date().toISOString() };
      setProjects((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setSelectedProject((current) => current?.id === saved.id ? saved : current);
      if (payrollRelevantChange) {
        setPayrollData((current) => {
          const next = { ...current, periods: revisePayrollSourcePeriods(current.periods, { allOpen: true }) };
          payrollDataRef.current = next;
          return next;
        });
      }
      setProjectFormSeed(null);
      showNotification("success", `${saved.projectCode} saved.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save project. Your draft remains available."));
    }
  };

  const handleArchiveProject = async (project: Project) => {
    try {
      const archived = session && supabase
        ? await archiveProjectInSupabase(project.id)
        : { ...project, status: "ARCHIVED" as const, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      setProjects((current) => current.map((item) => item.id === archived.id ? archived : item));
      setSelectedProject((current) => current?.id === archived.id ? archived : current);
      setPayrollData((current) => {
        const next = { ...current, periods: revisePayrollSourcePeriods(current.periods, { allOpen: true }) };
        payrollDataRef.current = next;
        return next;
      });
      showNotification("info", `${project.projectCode} archived. Historical allocations remain visible.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not archive project."));
    }
  };

  const handleSaveInvoiceProjectAllocations = async (invoice: InvoiceData, allocations: InvoiceProjectAllocation[]) => {
    try {
      const saved = session && supabase
        ? await replaceInvoiceProjectAllocationsOnSupabase(invoice.id, invoice.grandTotal, allocations)
        : replaceInvoiceProjectAllocationsLocally(invoice.id, invoice.grandTotal, invoiceProjectAllocations, allocations).filter((allocation) => allocation.invoiceId === invoice.id);
      setInvoiceProjectAllocations((current) => [...current.filter((allocation) => allocation.invoiceId !== invoice.id), ...saved]);
      showNotification("success", allocations.length ? "Invoice project allocation saved." : "Invoice is now unallocated.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save invoice project allocation."));
      throw error;
    }
  };

  const handleSaveExpense = async (expense: Expense) => {
    try {
      const saved = session && supabase ? await saveExpenseToSupabase(expense) : { ...expense, updatedAt: new Date().toISOString() };
      setExpenses((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setExpenseFormContext(null);
      showNotification("success", "Expense saved.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save expense."));
    }
  };

  const handleArchiveExpense = async (expense: Expense) => {
    try {
      const archived = session && supabase ? await archiveExpenseInSupabase(expense.id) : { ...expense, status: "VOID" as const, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      setExpenses((current) => current.map((item) => item.id === archived.id ? archived : item));
      showNotification("info", "Expense archived and excluded from future project actual cost.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not archive expense."));
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
      if (!token) throw new Error("Select a company before previewing payroll maintenance.");
      const result = await previewPayrollMaintenanceRpc(action, referenceDate, token.companyId);
      if (!canApplyWorkspaceResult(token)) throw new Error("The selected company changed while the payroll preview was loading.");
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
      if (!token) throw new Error("Select a company before applying payroll maintenance.");
      const result = await applyPayrollMaintenanceRpc(action, referenceDate, confirmation, token.companyId);
      if (!canApplyWorkspaceResult(token)) throw new Error("The selected company changed while payroll maintenance was running.");
      payrollAutomationKeyRef.current = "";
      await refreshWorkspaceGroups(["payroll", "payroll-imports"], token, { force: true, reason: "payroll-maintenance" });
      if (!canApplyWorkspaceResult(token)) throw new Error("The selected company changed while payroll maintenance was refreshing.");
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
  const handleSaveCompensationProfile = async (profile: WorkerCompensationProfile) => {
    try {
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.workersManage)) throw new Error("You do not have permission to manage compensation profiles in this company.");
      const saved = session && supabase ? await saveWorkerCompensationProfileToSupabase(profile) : profile;
      setPayrollData((current) => { const next = { ...current, compensationProfiles: [saved, ...(current.compensationProfiles || []).filter((item) => item.id !== saved.id)], periods: revisePayrollSourcePeriods(current.periods, { allOpen: true }) }; payrollDataRef.current = next; return next; });
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
      if (isSupabaseConfigured && !can(PERMISSION_KEYS.payrollImport)) throw new Error("You do not have permission to commit payroll imports in this company.");
      const sourceBatch = payrollImportData.batches.find((item) => item.id === staged.batch.id) || staged.batch;
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
          const persisted = await replacePayrollRunEntriesToSupabase(run.id, records.entries, records.allocations);
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
        const persisted = await replacePayrollRunEntriesToSupabase(run.id, entriesToSave, allocationsToSave);
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

  const openProject = (project: Project) => {
    setSelectedProject(project);
    setProjectFormSeed(null);
    navigateToPath(appPathForProject(project.id));
  };

  const editProject = (project: Project) => {
    setProjectFormSeed(project);
    setSelectedProject(null);
    navigateToPath(appPathForTab("projects"));
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
      await updateInvoiceInSupabase(previous || invoice, invoice, eventType);
      return invoice;
    });
    try {
      await operation;
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
    let verified = { ...applyLocalChecks(invoice), reviewStatus: "VERIFIED" as const, verifiedAt: new Date().toISOString() };
    const persisted = await flushInvoiceSave(verified, "VERIFIED");
    if (!persisted) throw new Error("Could not save invoice verification.");
    // If a field edit arrived while verification was saving, verify the latest
    // local values instead of replacing them with the older click snapshot.
    if (editRevisionRef.current.get(invoice.id) !== initialRevision) {
      const latest = invoicesRef.current.find((item) => item.id === invoice.id);
      if (!latest) throw new Error("The invoice is no longer available.");
      verified = { ...applyLocalChecks(latest), reviewStatus: "VERIFIED" as const, verifiedAt: new Date().toISOString() };
      if (!await flushInvoiceSave(verified, "VERIFIED")) throw new Error("Could not save invoice verification.");
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
    const next = invoicesRef.current.map((item) => item.id === reopened.id ? reopened : item);
    invoicesRef.current = next;
    setInvoices(next);
    setSelectedInvoice((current) => current?.id === reopened.id ? reopened : current);
    showNotification("info", `Reopened ${reopened.invoiceNumber || "invoice"} for review.`);
  };

  const handleRetryExtraction = async (invoice: InvoiceData): Promise<InvoiceData | null> => {
    if (retryingInvoiceRef.current) return null;
    retryingInvoiceRef.current = invoice.id;
    setRetryingInvoiceId(invoice.id);
    setProcessingCount((n) => n + 1);
    try {
      let sourcePayload = sourcePayloadsRef.current.get(invoice.id);
      if (!sourcePayload && session && supabase) sourcePayload = (await loadSourcePayloadForRetry(invoice)) || undefined;
      if (!sourcePayload && invoice.previewUrl?.startsWith("data:")) {
        const match = invoice.previewUrl.match(/^data:([^;,]+);base64,(.+)$/);
        if (match) sourcePayload = { fileData: match[2], mimeType: match[1], fileName: invoice.fileName || "invoice", sourceType: invoice.sourceType || "UPLOAD" };
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
    const next = invoicesRef.current.map((item) => item.id === reverted.id ? reverted : item);
    invoicesRef.current = next;
    setInvoices(next);
    setSelectedInvoice((current) => current?.id === reverted.id ? reverted : current);
    showNotification("info", `Restored ${reverted.invoiceNumber || "invoice"} to its original AI values for review.`);
  };

  const handleRevertField = async (invoice: InvoiceData, path: string) => {
    if (!invoice.aiSnapshot) return;
    const originalValue = valueAtPath(invoice.aiSnapshot, path);
    const reverted = applyLocalChecks(withPathValue(invoice, path, originalValue));
    if (!await flushInvoiceSave(reverted, "FIELD_REVERTED")) return;
    const next = invoicesRef.current.map((item) => item.id === reverted.id ? reverted : item);
    invoicesRef.current = next;
    setInvoices(next);
    setSelectedInvoice((current) => current?.id === reverted.id ? reverted : current);
    showNotification("info", `Reverted ${path.replaceAll(".", " ")} to the original AI value.`);
  };

  const handleDeleteInvoice = async (id: string) => {
    if (session && supabase) await deleteInvoiceFromSupabase(id);
    const next = invoicesRef.current.filter((invoice) => invoice.id !== id);
    invoicesRef.current = next;
    setInvoices(next);
    lastPersistedRef.current.delete(id);
    if (selectedInvoice?.id === id) setSelectedInvoice(null);
    showNotification("info", "Invoice record archived. The original source file, AI snapshot, and review history remain preserved.");
  };

  const startReview = (requestedQueue?: InvoiceData[], initialId?: string, origin: AppTab = activeTab, returnPath = workspaceReturnPath) => {
    const queue = requestedQueue?.length ? requestedQueue : invoicesRef.current.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW");
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

  const handleBatchComplete = (successful: InvoiceData[], failed: Array<{ name: string; error: string }>) => {
    if (successful.length) startReview(successful, undefined, "extractor");
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
      currency: "PHP",
      periodStart: period?.periodStart,
      periodEnd: period?.periodEnd,
      allocations: payrollData.allocations.filter((allocation) => entryIds.has(allocation.payrollEntryId)),
      entries: payrollData.entries.filter((entry) => entry.payrollRunId === run.id),
    };
  }), [payrollData.runs, payrollData.periods, payrollData.allocations, payrollData.entries]);
  const projectSummaries = useMemo<Record<string, ProjectCostSummary>>(() => {
    const next: Record<string, ProjectCostSummary> = {};
    projects.forEach((project) => { next[project.id] = calculateProjectCost(project, { invoices: costInvoices, payroll: costPayroll, expenses }); });
    const unallocated = calculateProjectCost(undefined, { invoices: costInvoices, payroll: costPayroll, expenses });
    next.__unallocated__ = unallocated;
    return next;
  }, [projects, costInvoices, costPayroll, expenses]);
  const dashboardViewData = useMemo(() => buildDashboardViewData({
    projects,
    invoices: costInvoices,
    expenses,
    payroll: costPayroll,
    periods: payrollData.periods,
    workers: payrollData.workers,
    payrollEntries: payrollData.entries,
    payrollAllocations: payrollData.allocations,
    payrollRuns: payrollData.runs,
    activityPeriod: dashboardActivityPeriod,
    customStart: dashboardCustomStart,
    customEnd: dashboardCustomEnd,
    selectedCurrency: dashboardCurrency,
    projectId: dashboardProjectId,
  }), [projects, costInvoices, expenses, costPayroll, payrollData.periods, payrollData.workers, payrollData.entries, payrollData.allocations, payrollData.runs, dashboardActivityPeriod, dashboardCustomStart, dashboardCustomEnd, dashboardCurrency, dashboardProjectId]);

  const projectDashboard = useMemo(() => selectedProject ? buildProjectDashboardViewData({ project: selectedProject, invoices: costInvoices, expenses, payroll: costPayroll, periods: payrollData.periods }) : undefined, [selectedProject, costInvoices, expenses, costPayroll, payrollData.periods]);
  const reviewCount = invoices.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW").length;
  const gmailConnection: GmailConnectionInfo = {
    configured: isSupabaseConfigured,
    signedIn: Boolean(session),
    hasGmailToken: Boolean(session && getGoogleProviderToken()),
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
      .filter((definition) => isPlatformOwner || canAccessAppTab(definition.appTab, permissions))
      .map((definition) => definition.id);
  }, [isPlatformOwner, permissions, session]);
  const routePermission = route.kind === "platform-companies"
    ? PERMISSION_KEYS.platformManage
    : route.kind === "unknown" ? null : requiredPermissionForAppTab(route.tab);
  const routeDenied = Boolean(isSupabaseConfigured && session && access.status === "ready" && (
    (route.kind === "platform-companies" && !isPlatformOwner)
    || (route.kind !== "platform-companies" && route.kind !== "unknown" && activeCompanyId && !isPlatformOwner && routePermission && !canAccessAppTab(route.tab, permissions))
  ));
  const workspaceRouteVisible = !routeNotFound && !routeDenied;
  const managementView = <CompanyManagement
    companies={companyAccess.companies}
    activeCompanyId={companyAccess.activeCompanyId}
    managementCompanyId={route.kind === "platform-companies" ? route.managementCompanyId : undefined}
    initialTab={route.kind === "platform-companies" ? route.managementTab : undefined}
    onOpenWorkspace={companyAccess.selectCompany}
    onCreateCompany={createCompany}
    onUpdateCompany={updateCompany}
    onInviteCompanyMember={inviteCompanyMember}
    onUpdateCompanyMember={updateCompanyMember}
    onLoadCompanyMembers={loadCompanyMembers}
    onLoadCompanyInvitations={loadCompanyInvitations}
    onLoadAudit={loadCompanyAccessAudit}
    onLoadAiConfig={loadManagedCompanyAiConfig}
    onSaveAiKey={saveManagedCompanyAiKey}
    onTestAi={testManagedCompanyAi}
    onDisableAi={disableManagedCompanyAi}
    onEnableAi={enableManagedCompanyAi}
    onRemoveAi={removeManagedCompanyAi}
    onClose={closePlatformManagement}
  />;
  useEffect(() => {
    if (!routeDenied) return;
    if (route.kind === "platform-companies") return;
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
    return <NoCompanyAccess onSignOut={handleSignOut}><div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-900">We couldn’t load your company access. Refresh the page or contact the platform owner.</div></NoCompanyAccess>;
  }
  if (isSupabaseConfigured && session && route.kind === "platform-companies" && companyAccess.access.status !== "ready") {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-700"><Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />Checking platform access…</div>;
  }
  if (isSupabaseConfigured && session && route.kind === "platform-companies" && companyAccess.isPlatformOwner) {
    return <div className="min-h-screen bg-slate-50 text-slate-900"><Header activeTab={activeTab} setActiveTab={setActiveTab} invoicesCount={invoices.length} reviewCount={reviewCount} onBatchExportExcel={() => exportBatchInvoicesToExcel(invoices)} workspaceSyncStatus={workspaceSyncStatus} accountEmail={session.user.email || undefined} onSignOut={handleSignOut} companies={companyAccess.companies} activeCompanyId={companyAccess.activeCompanyId} isPlatformOwner={companyAccess.isPlatformOwner} onSelectCompany={companyAccess.selectCompany} onOpenPlatformManagement={openPlatformManagement} visibleRouteIds={visibleRouteIds} permissions={permissions} /><main className="px-4 py-5 sm:px-6 lg:ml-[17rem] lg:px-8"><button type="button" onClick={closePlatformManagement} className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Back to workspace</button>{managementView}</main></div>;
  }
  if (isSupabaseConfigured && session && !companyAccess.isPlatformOwner && (companyAccess.access.status === "no-company" || companyAccess.access.status === "company-suspended")) {
    return <NoCompanyAccess onSignOut={handleSignOut} />;
  }
  if (isSupabaseConfigured && session && companyAccess.isPlatformOwner && !companyAccess.activeCompanyId) {
    return <NoCompanyAccess isPlatformOwner onSignOut={handleSignOut}>
      {managementView}
    </NoCompanyAccess>;
  }
  if (isSupabaseConfigured && session && companyAccess.access.status === "ready" && !companyAccess.activeCompanyId) {
    return <NoCompanyAccess onSignOut={handleSignOut}>
      <div className="mt-6"><CompanySwitcher companies={companyAccess.companies} activeCompanyId={companyAccess.activeCompanyId} isPlatformOwner={companyAccess.isPlatformOwner} onSelect={companyAccess.selectCompany} /></div>
    </NoCompanyAccess>;
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

  return (
    <AssistantProvider
      currentCompanyId={activeCompanyId}
      currentCompanyGeneration={assistantCompanyGeneration}
      isAuthenticated={Boolean(isSupabaseConfigured && session)}
      guestMode={guestModeState}
      permissions={permissions}
      compactContext={{ route: route.pathname, companyName: activeCompany?.name, companyTimezone: activeCompany?.timezone || regionalSettings.timezone, currency: activeCompany?.defaultCurrency || regionalSettings.currency, locale: regionalSettings.locale, selectedInvoiceId: selectedInvoice?.id || undefined, selectedProjectId: selectedProject?.id || undefined }}
      onNavigate={(path) => navigateToPath(path)}
      onOpenInvoice={(invoiceId) => { const invoice = invoicesRef.current.find((item) => item.id === invoiceId); if (invoice) openInvoice(invoice); else navigateToPath(appPathForInvoice(invoiceId)); }}
      onOpenReviewInvoice={(invoiceId) => { const invoice = invoicesRef.current.find((item) => item.id === invoiceId); if (invoice) openInvoiceForReview(invoice, activeTab); else navigateToPath(appPathForReviewInvoice(invoiceId, appPathForTab(activeTab))); }}
      onOpenProject={(projectId) => { const project = projects.find((item) => item.id === projectId); if (project) openProject(project); else navigateToPath(appPathForProject(projectId)); }}
      onOpenPayrollPeriod={() => navigateToPath(appPathForTab("payroll"))}
      onOpenAttendanceDate={() => navigateToPath(appPathForTab("payroll"))}
    >
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} invoicesCount={invoices.length} reviewCount={reviewCount} onBatchExportExcel={() => exportBatchInvoicesToExcel(invoices)} workspaceSyncStatus={workspaceSyncStatus} accountEmail={session?.user?.email || undefined} onSignOut={handleSignOut} companies={companyAccess.companies} activeCompanyId={companyAccess.activeCompanyId} isPlatformOwner={companyAccess.isPlatformOwner} onSelectCompany={companyAccess.selectCompany} onOpenPlatformManagement={openPlatformManagement} visibleRouteIds={visibleRouteIds} permissions={permissions} />
      <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 sm:px-6 lg:ml-[17rem] lg:px-8 2xl:px-10">

        {remoteInvoiceUpdate && selectedInvoice?.id === remoteInvoiceUpdate.invoiceId && <div role="status" className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p><strong>This invoice was updated in another browser.</strong> Your local edits are protected.</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={reloadLatestRemoteInvoice} disabled={saveState === "saving"} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[10px] font-bold text-amber-900 disabled:cursor-not-allowed disabled:opacity-50">Reload latest</button>
            <button type="button" onClick={keepEditingRemoteInvoice} className="rounded-lg bg-amber-700 px-2.5 py-1.5 text-[10px] font-bold text-white">Keep editing</button>
          </div>
        </div>}
        {notification && <div role={notification.type === "error" ? "alert" : "status"} className={`mb-5 p-3.5 rounded-2xl text-xs flex items-center justify-between shadow-sm border ${notification.type === "success" ? "bg-emerald-50 text-emerald-900 border-emerald-200" : notification.type === "error" ? "bg-rose-50 text-rose-900 border-rose-200" : "bg-white text-slate-800 border-slate-200"}`}><div className="flex items-center gap-2.5">{notification.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}<span className="font-semibold">{notification.message}</span></div><button type="button" aria-label="Dismiss notification" onClick={() => setNotification(null)}><X className="w-3.5 h-3.5" /></button></div>}

        {!isSupabaseConfigured && <div className="mb-5 p-4 rounded-2xl border border-amber-200 bg-amber-50 flex gap-3"><Cloud className="w-5 h-5 text-amber-700 shrink-0" /><div><p className="text-xs font-black text-amber-900">Browser-only workspace</p><p className="text-[11px] text-amber-800 mt-1">Data in this workspace is stored on this device and will not sync to other browsers until you connect or sign in.</p></div></div>}
        {workspaceLoading && <div className="mb-5 p-3.5 rounded-2xl border border-slate-200 bg-white text-xs font-semibold flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-indigo-600" />Loading workspace…</div>}

                {routeNotFound && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-6"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-700">Navigation error</p><h2 className="mt-1 text-lg font-black text-rose-950">Page not found</h2><p className="mt-1 text-xs text-rose-900">The requested workspace record or destination is not available.</p><button type="button" onClick={() => navigateToPath(appPathForTab("dashboard"))} className="mt-4 rounded-xl bg-rose-700 px-3 py-2 text-xs font-black text-white">Return to dashboard</button></div>}

        {workspaceRouteVisible && route.kind === "tab" && activeTab === "dashboard" && <div className="space-y-6"><EngineeringCostOperationsDashboard data={dashboardViewData} projects={projects} selectedProjectId={dashboardProjectId} onProjectChange={(projectId) => { setDashboardProjectId(projectId); const project = projects.find((candidate) => candidate.id === projectId); if (project) setDashboardCurrency(project.currency.toUpperCase()); }} onActivityPeriodChange={setDashboardActivityPeriod} onCustomRangeChange={(start, end) => { setDashboardCustomStart(start); setDashboardCustomEnd(end); }} onCurrencyChange={setDashboardCurrency} onNavigate={setActiveTab} onOpenProject={(projectId) => { const project = projects.find((candidate) => candidate.id === projectId); if (project) openProject(project); }} onOpenInvoice={openInvoice} /></div>}
        {workspaceRouteVisible && activeTab === "projects" && (selectedProject ? <ProjectWorkspace project={selectedProject} summary={projectSummaries[selectedProject.id] || calculateProjectCost(selectedProject, { invoices: costInvoices, payroll: costPayroll, expenses })} dashboard={projectDashboard} invoices={invoices} invoiceAllocations={invoiceProjectAllocations} expenses={expenses} workers={payrollData.workers} assignments={payrollData.assignments} payrollAllocations={payrollData.allocations} payrollPeriods={payrollData.periods} initialTab={route.kind === "project" ? route.view : "overview"} onTabChange={(tab) => { if (route.kind === "project" && selectedProject) navigateToPath(appPathForProject(selectedProject.id, tab as ProjectWorkspaceView)); }} onSaveInvoiceAllocations={handleSaveInvoiceProjectAllocations} onBack={() => navigateToPath(appPathForTab("projects"))} onOpenInvoice={openInvoice} onUploadInvoice={() => { setUploadProjectContextId(selectedProject.id); setWorkspaceOrigin("projects"); setWorkspaceReturnPath(appPathForProject(selectedProject.id, "invoices")); navigateToPath(appPathForTab("extractor")); }} onEditProject={() => editProject(selectedProject)} onArchiveProject={() => void handleArchiveProject(selectedProject)} onAddExpense={() => { setExpenseFormContext(selectedProject.id); navigateToPath(appPathForTab("expenses")); }} onOpenPayroll={() => setActiveTab("payroll")} /> : <ProjectsPage projects={projects} summaries={projectSummaries} initialEditingProject={projectFormSeed} onOpenProject={openProject} onSaveProject={(project) => void handleSaveProject(project)} onArchiveProject={(project) => void handleArchiveProject(project)} />)}
        {workspaceRouteVisible && (route.kind === "invoice" || route.kind === "review-invoice") && selectedInvoice && <div className="space-y-5"><VerificationWorkspace invoice={selectedInvoice} queue={reviewQueue} queueIndex={reviewIndex} saveState={saveState} completion={reviewCompletion} isRetrying={retryingInvoiceId === selectedInvoice.id} onRetryExtraction={() => handleRetryExtraction(selectedInvoice)} onUpdateInvoice={handleUpdateInvoice} onBack={leaveWorkspace} backLabel={workspaceOriginLabel} onPrevious={() => moveReview("previous")} onNext={() => moveReview("next")} onSave={saveCurrentReview} onVerifyAndNext={verifyAndNext} onReopen={() => handleReopen(selectedInvoice)} onContinueWithNewItems={() => startReview(invoicesRef.current.filter((item) => item.reviewStatus === "NEEDS_REVIEW"), undefined, workspaceOrigin)} onReturnToDashboard={() => resetWorkspaceSelection("dashboard")} onViewVerified={() => resetWorkspaceSelection("invoices")} onRevertToAI={() => void handleRevertToAI(selectedInvoice)} onRevertField={(path) => void handleRevertField(selectedInvoice, path)} projects={projects} invoiceProjectAllocations={invoiceProjectAllocations} preferredProjectId={uploadProjectContextId || undefined} onSaveProjectAllocations={handleSaveInvoiceProjectAllocations} /></div>}
        {workspaceRouteVisible && route.kind === "tab" && activeTab === "extractor" && <div className="space-y-5"><UploadZone onExtract={handleExtract} onLoadPreset={(invoice) => void handleLoadPreset(invoice)} onBatchComplete={handleBatchComplete} isLoading={processingCount > 0} /></div>}
        {workspaceRouteVisible && route.kind === "tab" && activeTab === "inbox" && <EmailInbox invoices={invoices} isProcessing={processingCount > 0} connection={gmailConnection} onConnectGmail={connectGoogleAndGmail} onSignOut={handleSignOut} onScanGmail={handleScanGmail} onSyncGmail={handleSyncGmail} onImportGmailMessage={handleImportGmailMessage} onProcessEmail={handleProcessEmail} onOpenInvoice={openInvoice} />}
        {workspaceRouteVisible && route.kind === "tab" && activeTab === "review" && <ReviewQueue invoices={invoices} onOpenInvoice={openInvoiceForReview} onStartReview={(queue) => startReview(queue, undefined, "review")} />}
        {workspaceRouteVisible && route.kind === "tab" && activeTab === "invoices" && <InvoiceDirectory invoices={invoices} projects={projects} projectAllocations={invoiceProjectAllocations} onSelectInvoice={openInvoice} onDeleteInvoice={(id) => void handleDeleteInvoice(id)} onAddNew={() => resetWorkspaceSelection("extractor")} />}
        {workspaceRouteVisible && route.kind === "tab" && activeTab === "payroll" && <PayrollPage workers={payrollData.workers} assignments={payrollData.assignments} periods={payrollData.periods} runs={payrollData.runs} entries={payrollData.entries} allocations={payrollData.allocations} adjustments={payrollData.adjustments} workEntries={payrollData.workEntries} attendanceRecords={payrollData.attendanceRecords || []} leaveRequests={payrollData.leaveRequests || []} overtimeRequests={payrollData.overtimeRequests || []} holidays={payrollData.holidays || []} projects={projects} schedules={payrollData.schedules || []} compensationProfiles={payrollData.compensationProfiles || []} recurringComponents={payrollData.recurringComponents || []} importBatches={payrollImportData.batches} importTemplates={payrollImportData.templates} onSaveWorker={(worker) => void handleSaveWorker(worker)} onSaveAssignment={(assignment) => void handleSaveAssignment(assignment)} onSavePeriod={(period) => void handleSavePayrollPeriod(period)} onSaveSchedule={(schedule) => void handleSavePayrollSchedule(schedule)} canManagePayrollSettings={!isSupabaseConfigured || can(PERMISSION_KEYS.payrollSettings)} canManagePayrollMaintenance={payrollMaintenanceAllowed} onSaveCompensationProfile={(profile) => void handleSaveCompensationProfile(profile)} onSaveRecurringComponent={(component) => void handleSaveRecurringComponent(component)} onSaveWorkEntry={(entry) => void handleSaveWorkEntry(entry)} onSaveAttendance={(record) => void handleSaveAttendance(record)} onSaveAttendanceBatch={(records) => void handleSaveAttendanceBatch(records)} onSaveLeave={(request) => void handleSaveLeave(request)} onSaveOvertime={(request) => void handleSaveOvertime(request)} onSaveHoliday={(holiday) => void handleSaveHoliday(holiday)} onSavePayrollEntry={(entry, allocations) => void handleSavePayrollEntry(entry, allocations)} onUpdateRun={(run) => void handleUpdatePayrollRun(run)} onCreateRun={handleCreatePayrollRun} onCalculateRun={(run) => void handleCalculatePayrollRun(run)} onStagePayrollImport={(batch, rows, bytes) => void handleStagePayrollImport(batch, rows, bytes)} onSavePayrollImportTemplate={(template) => void handleSavePayrollImportTemplate(template)} onCommitPayrollImport={(staged, periodStart, periodEnd, payDate) => void handleCommitPayrollImport(staged, periodStart, periodEnd, payDate)} onPreviewPayrollMaintenance={(action) => handlePreviewPayrollMaintenance(action)} onApplyPayrollMaintenance={(action, confirmation) => handleApplyPayrollMaintenance(action, confirmation)} />}
        {workspaceRouteVisible && route.kind === "tab" && activeTab === "expenses" && <ExpensesPage expenses={expenses} projects={projects} initialProjectId={expenseFormContext || undefined} onSave={(expense) => void handleSaveExpense(expense)} onArchive={(expense) => void handleArchiveExpense(expense)} />}
        {workspaceRouteVisible && route.kind === "tab" && activeTab === "vendors" && <Vendors invoices={invoices} />}
        {workspaceRouteVisible && route.kind === "tab" && activeTab === "reports" && <div className="space-y-6"><Reports invoices={invoices} /><PayrollOperatingCosts runs={payrollData.runs} entries={payrollData.entries} allocations={payrollData.allocations} /><ProjectReports projects={projects} invoices={invoices} invoiceAllocations={invoiceProjectAllocations} expenses={expenses} workers={payrollData.workers} assignments={payrollData.assignments} periods={payrollData.periods} runs={payrollData.runs} entries={payrollData.entries} payrollAllocations={payrollData.allocations} onExport={() => exportEngineeringProjectWorkbookToExcel({ projects, invoices, invoiceAllocations: invoiceProjectAllocations, expenses, workers: payrollData.workers, assignments: payrollData.assignments, periods: payrollData.periods, runs: payrollData.runs, entries: payrollData.entries, payrollAllocations: payrollData.allocations })} /></div>}
        {workspaceRouteVisible && route.kind === "tab" && activeTab === "settings" && <SettingsScreen settings={regionalSettings} onChange={handleRegionalSettingsChange} />}
      </main>
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-[10px] text-slate-500 lg:ml-[17rem]">Invoice Operations • Gmail read-only intake • Original sources &amp; review history</footer>
    </div>
    </AssistantProvider>
  );
}

export default InvoiceWorkspace;
