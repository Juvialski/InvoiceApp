import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Cloud, Loader2, X } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { Header, AppTab } from "./components/Header";
import { Dashboard } from "./components/Dashboard";
import { UploadZone, ExtractPayload } from "./components/UploadZone";
import { InvoiceDirectory } from "./components/InvoiceDirectory";
import { EmailInbox } from "./components/EmailInbox";
import { Vendors } from "./components/Vendors";
import { Reports } from "./components/Reports";
import { ReviewQueue } from "./components/ReviewQueue";
import { VerificationWorkspace } from "./components/VerificationWorkspace";
import type { SaveState } from "./components/VerificationWorkspace";
import { Settings as SettingsScreen } from "./components/Settings";
import { EngineeringDashboard } from "./components/engineering/EngineeringDashboard";
import { ProjectReports } from "./components/engineering/ProjectReports";
import { ProjectsPage } from "./components/projects/ProjectsPage";
import { PayrollOperatingCosts } from "./components/engineering/PayrollOperatingCosts";
import { ProjectWorkspace } from "./components/projects/ProjectWorkspace";
import { ExpensesPage } from "./components/expenses/ExpensesPage";
import { PayrollPage } from "./components/payroll/PayrollPage";
import { appPathForInvoice, appPathForProject, appPathForReviewInvoice, appPathForTab, appPathFromLocation, parseAppLocation, type AppLocation, type ProjectWorkspaceView } from "./utils/appRouting";
import { DEFAULT_ROUTE_PATH } from "./utils/routes";
import { Department, EmailClassification, Expense, GmailConnectionInfo, GmailImportedMessage, GmailMessageCandidate, GmailScanWindow, InvoiceData, InvoiceProjectAllocation, PayrollEntry, PayrollPeriod, PayrollProjectAllocation, PayrollRun, Project, ProjectCostSummary, ProjectWorkerAssignment, Worker, WorkEntry } from "./types";
import { exportBatchInvoicesToExcel, exportEngineeringProjectWorkbookToExcel } from "./utils/excelExport";
import { applyLocalChecks, findPossibleDuplicate } from "./utils/invoiceLogic";
import { nextPendingReviewInvoiceId, nextReviewInvoiceId, orderedReviewQueue } from "./utils/reviewQueue";
import { readAndCleanLocalInvoices } from "./utils/demoCleanup";
import { enqueueSerializedSave } from "./utils/saveSequencing";
import { currencySymbolFor, DEFAULT_CURRENCY, loadRegionalSettings, RegionalSettings, setRegionalSettings as setActiveRegionalSettings } from "./config/regional";
import { calculateProjectCost } from "./utils/projectCosting";
import { calculatePayrollRunFromWorkEntries } from "./lib/payrollCalculation";
import { captureGoogleProviderTokens, connectGoogleAndGmail, getGoogleProviderToken, isSupabaseConfigured, signOutWorkspace, supabase } from "./lib/supabase";
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
import { canTransitionPayrollRun, loadPayrollWorkspaceFromSupabase, PayrollWorkspaceData, readPayrollWorkspaceFromLocal, replacePayrollRunEntriesToSupabase, saveAssignmentToSupabase, saveDepartmentToSupabase, savePayrollEntryToSupabase, savePayrollPeriodToSupabase, savePayrollRunToSupabase, saveWorkEntryToSupabase, saveWorkerToSupabase, validatePayrollAllocations, validatePayrollRunApproval, writePayrollWorkspaceToLocal } from "./lib/payroll";
import { commitPayrollImportToSupabase, findDuplicatePayrollImportBatches, loadPayrollImportWorkspaceFromSupabase, readPayrollImportWorkspaceFromLocal, savePayrollImportBatchToSupabase, savePayrollImportRowsToSupabase, savePayrollImportTemplateToSupabase, uploadPayrollImportSourceToSupabase, writePayrollImportWorkspaceToLocal, type PayrollImportBatch, type PayrollImportRow, type PayrollImportTemplate, type PayrollImportWorkspaceData } from "./lib/payrollImportPersistence";
import { buildDraftPayrollFromImport, type StagedPayrollImport } from "./lib/payrollImportWorkflow";
import { canApplyWorkspaceLoad, decideRemoteInvoiceRefresh, resolveEntityById, shouldPersistGuestWorkspace } from "./utils/remoteConflict";
import { createBrowserWorkspaceSyncEnvironment, createWorkspaceSyncController, type WorkspaceRefreshGroup, type WorkspaceSyncController, type WorkspaceSyncStatus } from "./lib/workspaceSync";
import { replaceInvoiceProjectAllocationsLocally } from "./utils/projectAllocations";

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
  return /gemini|supabase|storage|api[_ -]?key|provider|model/i.test(message) ? fallback : (message || fallback);
}

function initialAppLocation(): AppLocation {
  if (typeof window === "undefined") return parseAppLocation(DEFAULT_ROUTE_PATH);
  return parseAppLocation(window.location.pathname, window.location.search);
}

export default function App() {
  const [invoices, setInvoices] = useState<InvoiceData[]>(localFallbackInvoices);
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
  const [activeTab, setActiveTabState] = useState<AppTab>(() => initialAppLocation().tab);
  const [workspaceReturnPath, setWorkspaceReturnPath] = useState<string>(appPathForTab(initialAppLocation().tab));
  const routeSignatureRef = useRef("");
  const [processingCount, setProcessingCount] = useState(0);
  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [authResolved, setAuthResolved] = useState(!isSupabaseConfigured);
  const workspaceGenerationRef = useRef(0);
  const [workspaceLoading, setWorkspaceLoading] = useState(isSupabaseConfigured);
  const [googleBannerDismissed, setGoogleBannerDismissed] = useState(false);
  const [syncState, setSyncState] = useState<{ lastHistoryId?: string; lastSyncedAt?: string }>({});
  const [regionalSettings, setRegionalSettingsState] = useState<RegionalSettings>(loadRegionalSettings);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const saveStateRef = useRef<SaveState>("saved");
  const [remoteInvoiceUpdate, setRemoteInvoiceUpdate] = useState<{ invoiceId: string; invoice: InvoiceData } | null>(null);
  const remoteInvoiceRemovedRef = useRef(new Set<string>());
  const remoteInvoiceUpdatesRef = useRef(new Map<string, InvoiceData>());
  const [retryingInvoiceId, setRetryingInvoiceId] = useState<string | null>(null);
  const savePromisesRef = useRef(new Map<string, Promise<unknown>>());
  const [projects, setProjects] = useState<Project[]>(readProjectsFromLocal);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectFormSeed, setProjectFormSeed] = useState<Project | null>(null);
  const [payrollImportData, setPayrollImportData] = useState<PayrollImportWorkspaceData>(readPayrollImportWorkspaceFromLocal);
  const [invoiceProjectAllocations, setInvoiceProjectAllocations] = useState<InvoiceProjectAllocation[]>(readInvoiceProjectAllocationsFromLocal);
  const [expenses, setExpenses] = useState<Expense[]>(readExpensesFromLocal);
  const [payrollData, setPayrollData] = useState<PayrollWorkspaceData>(readPayrollWorkspaceFromLocal);
  const [workspaceSyncStatus, setWorkspaceSyncStatus] = useState<WorkspaceSyncStatus>(isSupabaseConfigured ? "connecting" : "guest");
  const workspaceSyncControllerRef = useRef<WorkspaceSyncController | null>(null);
  const initialWorkspaceLoadRef = useRef<Promise<void> | null>(null);
  const workspaceRefreshFailureRef = useRef<string | null>(null);
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
    setActiveTabState(route.tab);
    const signature = `${route.kind}:${route.pathname}${route.search}`;
    if (routeSignatureRef.current === signature) return;
    routeSignatureRef.current = signature;
    if (route.kind === "invoice" || route.kind === "review-invoice") {
      const fallback = route.kind === "review-invoice" ? appPathForTab("review") : appPathForTab("invoices");
      const returnPath = route.returnTo || fallback;
      setWorkspaceReturnPath(returnPath);
      setWorkspaceOrigin(parseAppLocation(returnPath).tab);
      setReviewCompletion(null);
      if (route.kind === "invoice") setReviewSessionIds([]);
    } else if (route.kind !== "unknown") {
      setWorkspaceReturnPath(appPathForTab(route.tab));
      setWorkspaceOrigin(route.tab);
    }
  }, [route]);

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

  const showNotification = (type: "success" | "error" | "info", message: string) => {
    setNotification({ type, message });
    window.setTimeout(() => setNotification((current) => current?.message === message ? null : current), 5000);
  };

  const allWorkspaceRefreshGroups: readonly WorkspaceRefreshGroup[] = ["invoices", "engineering", "payroll", "payroll-imports", "gmail"];

  const currentWorkspaceLoadToken = () => {
    const userId = sessionRef.current?.user?.id;
    return userId ? { generation: workspaceGenerationRef.current, userId } : null;
  };

  const canApplyWorkspaceResult = (token: { generation: number; userId: string }) =>
    canApplyWorkspaceLoad(token, currentWorkspaceLoadToken());

  const refreshInvoicesForWorkspace = async (token: { generation: number; userId: string }) => {
    const storedInvoices = await loadInvoicesFromSupabase();
    if (!canApplyWorkspaceResult(token)) return;
    const prepared: InvoiceData[] = (storedInvoices as InvoiceData[]).map(prepareStoredInvoice);
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

  const refreshEngineeringForWorkspace = async (token: { generation: number; userId: string }) => {
    const results = await Promise.allSettled([
      loadProjectsFromSupabase(),
      loadInvoiceProjectAllocationsFromSupabase(),
      loadExpensesFromSupabase(),
    ]);
    if (!canApplyWorkspaceResult(token)) return;
    const failures: string[] = [];
    if (results[0].status === "fulfilled") setProjects(results[0].value);
    else failures.push("projects");
    if (results[1].status === "fulfilled") setInvoiceProjectAllocations(results[1].value);
    else failures.push("invoice allocations");
    if (results[2].status === "fulfilled") setExpenses(results[2].value);
    else failures.push("expenses");
    if (failures.length) throw new Error(`Engineering refresh failed for: ${failures.join(", ")}.`);
  };

  const refreshPayrollForWorkspace = async (token: { generation: number; userId: string }) => {
    const data = await loadPayrollWorkspaceFromSupabase();
    if (!canApplyWorkspaceResult(token)) return;
    setPayrollData(data);
  };

  const refreshPayrollImportsForWorkspace = async (token: { generation: number; userId: string }) => {
    const data = await loadPayrollImportWorkspaceFromSupabase();
    if (!canApplyWorkspaceResult(token)) return;
    setPayrollImportData(data);
  };

  const refreshGmailForWorkspace = async (token: { generation: number; userId: string }) => {
    const data = await loadGmailSyncState();
    if (!canApplyWorkspaceResult(token)) return;
    setSyncState(data);
  };

  const refreshWorkspaceGroups = async (groups: readonly WorkspaceRefreshGroup[], token = currentWorkspaceLoadToken()) => {
    if (!token) return;
    const requested = new Set(groups);
    const results = await Promise.allSettled([
      requested.has("invoices") ? refreshInvoicesForWorkspace(token) : Promise.resolve(),
      requested.has("engineering") ? refreshEngineeringForWorkspace(token) : Promise.resolve(),
      requested.has("payroll") ? refreshPayrollForWorkspace(token) : Promise.resolve(),
      requested.has("payroll-imports") ? refreshPayrollImportsForWorkspace(token) : Promise.resolve(),
      requested.has("gmail") ? refreshGmailForWorkspace(token) : Promise.resolve(),
    ]);
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
    workspaceRefreshFailureRef.current = failures.length ? failures.join(" ") : null;
    if (failures.length) throw new Error(failures.join(" "));
  };

  const loadWorkspaceGuarded = async (nextSession: Session, generation: number) => {
    const userId = nextSession.user.id;
    const token = { generation, userId };
    if (!isSupabaseConfigured || !canApplyWorkspaceResult(token)) {
      if (canApplyWorkspaceResult(token)) setWorkspaceLoading(false);
      return;
    }
    setWorkspaceLoading(true);
    workspaceRefreshFailureRef.current = null;
    try {
      await ensureWorkspaceProfile();
      if (!canApplyWorkspaceResult(token)) return;
      await refreshWorkspaceGroups(allWorkspaceRefreshGroups, token);
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
    if (!supabase) {
      sessionRef.current = null;
      setSession(null);
      setAuthResolved(true);
      return undefined;
    }
    let active = true;
    const applySession = (nextSession: Session | null) => {
      if (!active) return;
      const previousUserId = sessionRef.current?.user?.id || null;
      const nextUserId = nextSession?.user?.id || null;
      if (previousUserId !== nextUserId) workspaceGenerationRef.current += 1;
      sessionRef.current = nextSession;
      captureGoogleProviderTokens(nextSession);
      setSession(nextSession);
      setAuthResolved(true);
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => applySession(nextSession));
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authResolved) return undefined;
    const activeSession = session;
    const userId = activeSession?.user?.id || null;
    if (!supabase || !activeSession || !userId) {
      workspaceSyncControllerRef.current = null;
      setWorkspaceSyncStatus("guest");
      setWorkspaceLoading(false);
      const local = localFallbackInvoices();
      invoicesRef.current = local;
      setInvoices(local);
      setPayrollImportData(readPayrollImportWorkspaceFromLocal());
      setSyncState({});
      setProjects(readProjectsFromLocal());
      setInvoiceProjectAllocations(readInvoiceProjectAllocationsFromLocal());
      setExpenses(readExpensesFromLocal());
      setPayrollData(readPayrollWorkspaceFromLocal());
      return undefined;
    }

    const generation = workspaceGenerationRef.current;
    const controller = createWorkspaceSyncController({
      client: supabase,
      environment: createBrowserWorkspaceSyncEnvironment(),
      refresh: async (groups) => {
        const initialLoad = initialWorkspaceLoadRef.current;
        if (initialLoad) await initialLoad;
        const token = { generation, userId };
        if (canApplyWorkspaceResult(token)) await refreshWorkspaceGroups(groups, token);
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
    void controller.setSession(activeSession);

    return () => {
      if (workspaceSyncControllerRef.current === controller) workspaceSyncControllerRef.current = null;
      if (initialWorkspaceLoadRef.current === initialLoad) initialWorkspaceLoadRef.current = null;
      void controller.dispose();
    };
  }, [authResolved, session?.user?.id]);

  useEffect(() => {
    invoicesRef.current = invoices;
    if (shouldPersistGuestWorkspace(authResolved, session?.user?.id)) {
      try { localStorage.setItem("extracted_invoices", JSON.stringify(invoices)); } catch { /* preview URLs may fill local storage */ }
    }
  }, [invoices, session, authResolved]);

  useEffect(() => {
    if (shouldPersistGuestWorkspace(authResolved, session?.user?.id)) {
      writeProjectsToLocal(projects);
      writeInvoiceProjectAllocationsToLocal(invoiceProjectAllocations);
      writePayrollImportWorkspaceToLocal(payrollImportData);
      writeExpensesToLocal(expenses);
      writePayrollWorkspaceToLocal(payrollData);
    }
  }, [projects, invoiceProjectAllocations, expenses, payrollData, payrollImportData, session, authResolved]);

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
      const response = await fetch("/api/extract-invoice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
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
      const classifyResponse = await fetch("/api/classify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sender, subject, body, attachmentNames: attachments.map((file) => file.name), model: "gemini-3.5-flash-lite" }) });
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
    const response = await fetch(path, { method: body ? "POST" : "GET", headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
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
          const response = await fetch("/api/classify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sender: message.sender, subject: message.subject, body: message.bodyText, attachmentNames: message.attachments.map((item) => item.filename), model: "gemini-3.5-flash-lite" }) });
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
      const saved = session && supabase ? await saveProjectToSupabase(project) : { ...project, updatedAt: new Date().toISOString() };
      setProjects((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setSelectedProject((current) => current?.id === saved.id ? saved : current);
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
      const saved = session && supabase ? await saveWorkerToSupabase(worker) : { ...worker, updatedAt: new Date().toISOString() };
      setPayrollData((current) => ({ ...current, workers: current.workers.some((item) => item.id === saved.id) ? current.workers.map((item) => item.id === saved.id ? saved : item) : [saved, ...current.workers] }));
      showNotification("success", `${saved.displayName} saved.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save worker."));
    }
  };

  const handleSaveDepartment = async (department: Department) => {
    try {
      const saved = session && supabase ? await saveDepartmentToSupabase(department) : { ...department, updatedAt: new Date().toISOString() };
      setPayrollData((current) => ({ ...current, departments: current.departments.some((item) => item.id === saved.id) ? current.departments.map((item) => item.id === saved.id ? saved : item) : [saved, ...current.departments] }));
      showNotification("success", `${saved.name} department saved.`);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save department."));
    }
  };

  const handleSavePayrollPeriod = async (period: PayrollPeriod) => {
    try {
      const saved = session && supabase ? await savePayrollPeriodToSupabase(period) : { ...period, updatedAt: new Date().toISOString() };
      setPayrollData((current) => ({ ...current, periods: current.periods.some((item) => item.id === saved.id) ? current.periods.map((item) => item.id === saved.id ? saved : item) : [saved, ...current.periods] }));
      showNotification("success", "Payroll period saved.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save payroll period."));
    }
  };

  const handleStagePayrollImport = async (batch: PayrollImportBatch, rows: PayrollImportRow[], bytes: Uint8Array) => {
    try {
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
      const saved = session && supabase ? await savePayrollImportTemplateToSupabase(template) : { ...template, updatedAt: new Date().toISOString() };
      setPayrollImportData((current) => ({ ...current, templates: [saved, ...current.templates.filter((item) => item.id !== saved.id)] }));
      showNotification("success", "Payroll mapping template saved.");
    } catch (error: unknown) {
      showNotification("error", userFacingError(error, "Could not save the payroll mapping template."));
    }
  };

  const handleCommitPayrollImport = async (staged: StagedPayrollImport, periodStart: string, periodEnd: string, payDate?: string) => {
    try {
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
      setPayrollData((current) => ({ ...current, workEntries: current.workEntries.some((item) => item.id === saved.id) ? current.workEntries.map((item) => item.id === saved.id ? saved : item) : [saved, ...current.workEntries] }));
      showNotification("success", "Work entry saved. Calculate a payroll run to post labor allocation.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save work entry."));
    }
  };

  const handleSaveAssignment = async (assignment: ProjectWorkerAssignment) => {
    try {
      const saved = session && supabase ? await saveAssignmentToSupabase(assignment) : assignment;
      setPayrollData((current) => ({ ...current, assignments: current.assignments.some((item) => item.id === saved.id) ? current.assignments.map((item) => item.id === saved.id ? saved : item) : [saved, ...current.assignments] }));
      showNotification("success", "Worker assignment saved.");
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save worker assignment."));
    }
  };

  const handleSavePayrollEntry = async (entry: PayrollEntry, allocations: PayrollProjectAllocation[]) => {
    try {
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
      if (run.status !== "DRAFT" && run.status !== "CALCULATED") {
        showNotification("error", "Only draft or calculated payroll runs can be calculated.");
        return;
      }
      const period = payrollData.periods.find((item) => item.id === run.periodId);
      if (!period || period.status === "VOID") {
        showNotification("error", "Select a valid, non-VOID payroll period before calculating.");
        return;
      }
      const invalidApprovedEntries = payrollData.workEntries.filter((entry) => entry.status === "APPROVED" && (!entry.periodId || entry.workDate < period.periodStart || entry.workDate > period.periodEnd));
      if (invalidApprovedEntries.length) {
        showNotification("error", `${invalidApprovedEntries.length} approved work entr${invalidApprovedEntries.length === 1 ? "y is" : "ies are"} missing a valid period/date link.`);
        return;
      }
      const calculation = calculatePayrollRunFromWorkEntries({ runId: run.id, periodId: period.id, periodStart: period.periodStart, periodEnd: period.periodEnd, workers: payrollData.workers, assignments: payrollData.assignments, workEntries: payrollData.workEntries });
      const existingEntries = payrollData.entries.filter((entry) => entry.payrollRunId === run.id);
      const existingAllocations = payrollData.allocations.filter((allocation) => existingEntries.some((entry) => entry.id === allocation.payrollEntryId));
      const generatedEntries: PayrollEntry[] = calculation.entries.map((entry) => ({ id: globalThis.crypto?.randomUUID?.() || `local-payroll-entry-${Date.now()}-${Math.random().toString(36).slice(2)}`, payrollRunId: run.id, workerId: entry.workerId, basePay: entry.basePay, regularPay: entry.regularPay, overtimePay: entry.overtimePay, allowances: entry.allowances, otherEarnings: 0, grossPay: entry.grossPay, deductions: entry.deductions, otherDeductions: 0, employerCosts: 0, netPay: entry.netPay, projectAllocatedCost: entry.projectAllocatedCost, calculationSnapshot: entry.calculationSnapshot, createdAt: new Date().toISOString() }));
      const generatedAllocations: PayrollProjectAllocation[] = calculation.allocations.map((allocation) => {
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
      const nextRun = { ...run, status: "CALCULATED" as const, calculatedAt };
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
      const previous = payrollData.runs.find((item) => item.id === run.id);
      if (!previous || !canTransitionPayrollRun(previous.status, run.status) || (previous.status === run.status && (run.status === "APPROVED" || run.status === "PAID" || run.status === "VOID"))) {
        showNotification("error", `Invalid payroll run transition: ${previous?.status || "UNKNOWN"} → ${run.status}.`);
        return;
      }
      if (run.status === "APPROVED") {
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
  const costPayroll = useMemo(() => payrollData.runs.map((run) => ({
    id: run.id,
    status: run.status,
    allocations: payrollData.allocations.filter((allocation) => payrollData.entries.some((entry) => entry.id === allocation.payrollEntryId && entry.payrollRunId === run.id)),
    entries: payrollData.entries.filter((entry) => entry.payrollRunId === run.id),
  })), [payrollData.runs, payrollData.allocations, payrollData.entries]);
  const projectSummaries = useMemo<Record<string, ProjectCostSummary>>(() => {
    const next: Record<string, ProjectCostSummary> = {};
    projects.forEach((project) => { next[project.id] = calculateProjectCost(project, { invoices: costInvoices, payroll: costPayroll, expenses }); });
    const unallocated = calculateProjectCost(undefined, { invoices: costInvoices, payroll: costPayroll, expenses });
    next.__unallocated__ = unallocated;
    return next;
  }, [projects, costInvoices, costPayroll, expenses]);

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} invoicesCount={invoices.length} reviewCount={reviewCount} onBatchExportExcel={() => exportBatchInvoicesToExcel(invoices)} workspaceSyncStatus={workspaceSyncStatus} />
      <main className="flex-1 w-full px-3 sm:px-5 lg:px-7 2xl:px-8 py-6 overflow-x-hidden">
        {remoteInvoiceUpdate && selectedInvoice?.id === remoteInvoiceUpdate.invoiceId && <div role="status" className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p><strong>This invoice was updated in another browser.</strong> Your local edits are protected.</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={reloadLatestRemoteInvoice} disabled={saveState === "saving"} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[10px] font-bold text-amber-900 disabled:cursor-not-allowed disabled:opacity-50">Reload latest</button>
            <button type="button" onClick={keepEditingRemoteInvoice} className="rounded-lg bg-amber-700 px-2.5 py-1.5 text-[10px] font-bold text-white">Keep editing</button>
          </div>
        </div>}
        {notification && <div className={`mb-5 p-3.5 rounded-2xl text-xs flex items-center justify-between shadow-sm border ${notification.type === "success" ? "bg-emerald-50 text-emerald-900 border-emerald-200" : notification.type === "error" ? "bg-rose-50 text-rose-900 border-rose-200" : "bg-white text-slate-800 border-slate-200"}`}><div className="flex items-center gap-2.5">{notification.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}<span className="font-semibold">{notification.message}</span></div><button onClick={() => setNotification(null)}><X className="w-3.5 h-3.5" /></button></div>}

        {!isSupabaseConfigured && <div className="mb-5 p-4 rounded-2xl border border-amber-200 bg-amber-50 flex gap-3"><Cloud className="w-5 h-5 text-amber-700 shrink-0" /><div><p className="text-xs font-black text-amber-900">Browser-only workspace</p><p className="text-[11px] text-amber-800 mt-1">Data in this workspace is stored on this device and will not sync to other browsers until you connect or sign in.</p></div></div>}
        {workspaceLoading && <div className="mb-5 p-3.5 rounded-2xl border border-slate-200 bg-white text-xs font-semibold flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-indigo-600" />Loading workspace…</div>}
        {routeNotFound && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-6"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-700">Navigation error</p><h2 className="mt-1 text-lg font-black text-rose-950">Page not found</h2><p className="mt-1 text-xs text-rose-900">The requested workspace record or destination is not available.</p><button type="button" onClick={() => navigateToPath(appPathForTab("dashboard"))} className="mt-4 rounded-xl bg-rose-700 px-3 py-2 text-xs font-black text-white">Return to dashboard</button></div>}
        {isSupabaseConfigured && !session && !googleBannerDismissed && <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5 flex items-center justify-between gap-3"><div className="flex items-center gap-2.5 min-w-0"><Cloud className="w-4 h-4 text-indigo-600 shrink-0" /><p className="text-[11px] font-semibold text-indigo-900 truncate">Gmail sync is not connected.</p></div><div className="flex items-center gap-2 shrink-0"><button onClick={() => void connectGoogleAndGmail()} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold">Connect</button><button type="button" onClick={() => setGoogleBannerDismissed(true)} className="p-1 rounded-md text-indigo-500 hover:bg-indigo-100" aria-label="Dismiss Gmail connection notice"><X className="w-3.5 h-3.5" /></button></div></div>}

        {!routeNotFound && route.kind === "tab" && activeTab === "dashboard" && <div className="space-y-6"><Dashboard invoices={invoices} onOpenInvoice={openInvoice} onNavigate={setActiveTab} /><EngineeringDashboard projects={projects} summaries={projectSummaries} invoices={invoices} expenses={expenses} onNavigate={setActiveTab} /></div>}
        {!routeNotFound && activeTab === "projects" && (selectedProject ? <ProjectWorkspace project={selectedProject} summary={projectSummaries[selectedProject.id] || calculateProjectCost(selectedProject, { invoices: costInvoices, payroll: costPayroll, expenses })} invoices={invoices} invoiceAllocations={invoiceProjectAllocations} expenses={expenses} workers={payrollData.workers} assignments={payrollData.assignments} payrollAllocations={payrollData.allocations} payrollPeriods={payrollData.periods} initialTab={route.kind === "project" ? route.view : "overview"} onTabChange={(tab) => { if (route.kind === "project" && selectedProject) navigateToPath(appPathForProject(selectedProject.id, tab as ProjectWorkspaceView)); }} onSaveInvoiceAllocations={handleSaveInvoiceProjectAllocations} onBack={() => navigateToPath(appPathForTab("projects"))} onOpenInvoice={openInvoice} onUploadInvoice={() => { setUploadProjectContextId(selectedProject.id); setWorkspaceOrigin("projects"); setWorkspaceReturnPath(appPathForProject(selectedProject.id, "invoices")); navigateToPath(appPathForTab("extractor")); }} onEditProject={() => editProject(selectedProject)} onArchiveProject={() => void handleArchiveProject(selectedProject)} onAddExpense={() => { setExpenseFormContext(selectedProject.id); navigateToPath(appPathForTab("expenses")); }} onOpenPayroll={() => setActiveTab("payroll")} /> : <ProjectsPage projects={projects} summaries={projectSummaries} initialEditingProject={projectFormSeed} onOpenProject={openProject} onSaveProject={(project) => void handleSaveProject(project)} onArchiveProject={(project) => void handleArchiveProject(project)} />)}
        {!routeNotFound && (route.kind === "invoice" || route.kind === "review-invoice") && selectedInvoice && <div className="space-y-5"><VerificationWorkspace invoice={selectedInvoice} queue={reviewQueue} queueIndex={reviewIndex} saveState={saveState} completion={reviewCompletion} isRetrying={retryingInvoiceId === selectedInvoice.id} onRetryExtraction={() => handleRetryExtraction(selectedInvoice)} onUpdateInvoice={handleUpdateInvoice} onBack={leaveWorkspace} backLabel={workspaceOriginLabel} onPrevious={() => moveReview("previous")} onNext={() => moveReview("next")} onSave={saveCurrentReview} onVerifyAndNext={verifyAndNext} onReopen={() => handleReopen(selectedInvoice)} onContinueWithNewItems={() => startReview(invoicesRef.current.filter((item) => item.reviewStatus === "NEEDS_REVIEW"), undefined, workspaceOrigin)} onReturnToDashboard={() => resetWorkspaceSelection("dashboard")} onViewVerified={() => resetWorkspaceSelection("invoices")} onRevertToAI={() => void handleRevertToAI(selectedInvoice)} onRevertField={(path) => void handleRevertField(selectedInvoice, path)} projects={projects} invoiceProjectAllocations={invoiceProjectAllocations} preferredProjectId={uploadProjectContextId || undefined} onSaveProjectAllocations={handleSaveInvoiceProjectAllocations} /></div>}
        {!routeNotFound && route.kind === "tab" && activeTab === "extractor" && <div className="space-y-5"><UploadZone onExtract={handleExtract} onLoadPreset={(invoice) => void handleLoadPreset(invoice)} onBatchComplete={handleBatchComplete} isLoading={processingCount > 0} /></div>}
        {!routeNotFound && route.kind === "tab" && activeTab === "inbox" && <EmailInbox invoices={invoices} isProcessing={processingCount > 0} connection={gmailConnection} onConnectGmail={connectGoogleAndGmail} onSignOut={signOutWorkspace} onScanGmail={handleScanGmail} onSyncGmail={handleSyncGmail} onImportGmailMessage={handleImportGmailMessage} onProcessEmail={handleProcessEmail} onOpenInvoice={openInvoice} />}
        {!routeNotFound && route.kind === "tab" && activeTab === "review" && <ReviewQueue invoices={invoices} onOpenInvoice={openInvoiceForReview} onStartReview={(queue) => startReview(queue, undefined, "review")} />}
        {!routeNotFound && route.kind === "tab" && activeTab === "invoices" && <InvoiceDirectory invoices={invoices} projects={projects} projectAllocations={invoiceProjectAllocations} onSelectInvoice={openInvoice} onDeleteInvoice={(id) => void handleDeleteInvoice(id)} onAddNew={() => resetWorkspaceSelection("extractor")} />}
        {!routeNotFound && route.kind === "tab" && activeTab === "payroll" && <PayrollPage workers={payrollData.workers} assignments={payrollData.assignments} periods={payrollData.periods} runs={payrollData.runs} entries={payrollData.entries} allocations={payrollData.allocations} workEntries={payrollData.workEntries} projects={projects} importBatches={payrollImportData.batches} importTemplates={payrollImportData.templates} onSaveWorker={(worker) => void handleSaveWorker(worker)} onSaveAssignment={(assignment) => void handleSaveAssignment(assignment)} onSavePeriod={(period) => void handleSavePayrollPeriod(period)} onSaveWorkEntry={(entry) => void handleSaveWorkEntry(entry)} onSavePayrollEntry={(entry, allocations) => void handleSavePayrollEntry(entry, allocations)} onUpdateRun={(run) => void handleUpdatePayrollRun(run)} onCreateRun={handleCreatePayrollRun} onCalculateRun={(run) => void handleCalculatePayrollRun(run)} onStagePayrollImport={(batch, rows, bytes) => void handleStagePayrollImport(batch, rows, bytes)} onSavePayrollImportTemplate={(template) => void handleSavePayrollImportTemplate(template)} onCommitPayrollImport={(staged, periodStart, periodEnd, payDate) => void handleCommitPayrollImport(staged, periodStart, periodEnd, payDate)} />}
        {!routeNotFound && route.kind === "tab" && activeTab === "expenses" && <ExpensesPage expenses={expenses} projects={projects} initialProjectId={expenseFormContext || undefined} onSave={(expense) => void handleSaveExpense(expense)} onArchive={(expense) => void handleArchiveExpense(expense)} />}
        {!routeNotFound && route.kind === "tab" && activeTab === "vendors" && <Vendors invoices={invoices} />}
        {!routeNotFound && route.kind === "tab" && activeTab === "reports" && <div className="space-y-6"><Reports invoices={invoices} /><PayrollOperatingCosts runs={payrollData.runs} entries={payrollData.entries} allocations={payrollData.allocations} /><ProjectReports projects={projects} invoices={invoices} invoiceAllocations={invoiceProjectAllocations} expenses={expenses} workers={payrollData.workers} assignments={payrollData.assignments} periods={payrollData.periods} runs={payrollData.runs} entries={payrollData.entries} payrollAllocations={payrollData.allocations} onExport={() => exportEngineeringProjectWorkbookToExcel({ projects, invoices, invoiceAllocations: invoiceProjectAllocations, expenses, workers: payrollData.workers, assignments: payrollData.assignments, periods: payrollData.periods, runs: payrollData.runs, entries: payrollData.entries, payrollAllocations: payrollData.allocations })} /></div>}
        {!routeNotFound && route.kind === "tab" && activeTab === "settings" && <SettingsScreen settings={regionalSettings} onChange={handleRegionalSettingsChange} />}
      </main>
      <footer className="border-t border-slate-200 py-4 bg-white text-center text-[10px] text-slate-500">Invoice Operations • Gmail read-only intake • Original sources & review history</footer>
    </div>
  );
}
