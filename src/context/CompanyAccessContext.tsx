import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  activeCompanyMembership,
  bootstrapPlatformAdmin,
  canOpenCompanyWorkspace,
  createCompany as createCompanyApi,
  inviteCompanyMember as inviteCompanyMemberApi,
  loadCompanyAccess,
  loadCompanyAccessAudit,
  loadCompanyInvitations,
  loadCompanyMembers,
  permissionsForCompany,
  updateCompany as updateCompanyApi,
  updateCompanyMember as updateCompanyMemberApi,
  type CompanyAccessAuditEntry,
  type CompanyAccessSnapshot,
  type CompanyMemberSummary,
  type CompanyMembership,
  type CompanySummary,
  type CreateCompanyInput,
  type InviteCompanyMemberInput,
  type MembershipStatus,
  type UpdateCompanyMemberInput,
} from "../lib/companyAccess.ts";
import { clearCompanyContext, getActiveCompanyId, setActiveCompanyId } from "../lib/companyContext.ts";
import { isSupabaseConfigured, signOutWorkspace, supabase } from "../lib/supabase.ts";
import { hasPermission, type PermissionKey } from "../utils/accessControl.ts";

export interface CompanyAccessContextValue {
  session: Session | null;
  authResolved: boolean;
  guestMode: boolean;
  access: CompanyAccessSnapshot;
  activeCompany: CompanySummary | null;
  activeCompanyId: string | null;
  activeMembership: CompanyMembership | null;
  companies: readonly CompanySummary[];
  permissions: readonly PermissionKey[];
  isPlatformOwner: boolean;
  isSwitching: boolean;
  can: (permission: PermissionKey) => boolean;
  refreshAccess: () => Promise<void>;
  selectCompany: (companyId: string) => Promise<void>;
  enterGuestMode: () => void;
  signOut: () => Promise<void>;
  createCompany: (input: CreateCompanyInput) => Promise<CompanySummary>;
  updateCompany: (companyId: string, patch: Partial<Pick<CompanySummary, "name" | "companyCode" | "status" | "defaultCurrency" | "timezone">>) => Promise<CompanySummary>;
  inviteCompanyMember: (input: InviteCompanyMemberInput) => Promise<unknown>;
  updateCompanyMember: (input: UpdateCompanyMemberInput) => Promise<unknown>;
  loadCompanyMembers: (companyId: string) => Promise<CompanyMemberSummary[]>;
  loadCompanyInvitations: (companyId: string) => Promise<import("../lib/companyAccess.ts").CompanyInvitationSummary[]>;
  loadCompanyAccessAudit: (companyId?: string) => Promise<CompanyAccessAuditEntry[]>;
}

const CompanyAccessContext = createContext<CompanyAccessContextValue | null>(null);

function emptyAccess(status: CompanyAccessSnapshot["status"] = "signed-out"): CompanyAccessSnapshot {
  return {
    status,
    isPlatformOwner: false,
    companies: [],
    memberships: [],
    activeCompanyId: null,
    permissions: [],
  };
}

function storageForActiveCompany() {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage; } catch { return null; }
}

function activeCompanyStorageKey(userId: string) {
  return `invoice_ops_active_company:${userId}`;
}

function readStoredCompanyId(userId: string) {
  return storageForActiveCompany()?.getItem(activeCompanyStorageKey(userId)) || null;
}

function storeCompanyId(userId: string, companyId: string | null) {
  const storage = storageForActiveCompany();
  if (!storage) return;
  try {
    if (companyId) storage.setItem(activeCompanyStorageKey(userId), companyId);
    else storage.removeItem(activeCompanyStorageKey(userId));
  } catch { /* session storage is an optimization, never the authority */ }
}

function chooseCompany(snapshot: CompanyAccessSnapshot, previousCompanyId: string | null) {
  const selectable = snapshot.companies.filter((company) => canOpenCompanyWorkspace(snapshot, company.id));
  const stored = snapshot.userId ? readStoredCompanyId(snapshot.userId) : null;
  const preferred = [previousCompanyId, stored].find((candidate) => candidate && selectable.some((company) => company.id === candidate)) || null;
  if (preferred) return preferred;
  return selectable.length === 1 ? selectable[0]!.id : null;
}

function resolvedAccess(snapshot: CompanyAccessSnapshot, previousCompanyId: string | null): CompanyAccessSnapshot {
  const activeCompanyId = chooseCompany(snapshot, previousCompanyId);
  return {
    ...snapshot,
    activeCompanyId,
    permissions: permissionsForCompany(snapshot, activeCompanyId),
  };
}

export function CompanyAccessProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authResolved, setAuthResolved] = useState(!isSupabaseConfigured);
  const [guestMode, setGuestMode] = useState(!isSupabaseConfigured);
  const [access, setAccess] = useState<CompanyAccessSnapshot>(() => emptyAccess(isSupabaseConfigured ? "loading" : "guest"));
  const [isSwitching, setIsSwitching] = useState(false);
  const accessRef = useRef(access);
  const sessionRef = useRef<Session | null>(null);
  const loadGenerationRef = useRef(0);
  const selectionGenerationRef = useRef(0);
  const accessLoadRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);

  const setAccessSnapshot = useCallback((next: CompanyAccessSnapshot) => {
    accessRef.current = next;
    setAccess(next);
    setActiveCompanyId(next.activeCompanyId);
  }, []);

  useEffect(() => {
    if (!supabase) {
      sessionRef.current = null;
      setSession(null);
      setGuestMode(true);
      setAuthResolved(true);
      setAccessSnapshot(emptyAccess("guest"));
      clearCompanyContext();
      return undefined;
    }

    let mounted = true;
    const applySession = (nextSession: Session | null) => {
      if (!mounted) return;
      const previousUserId = sessionRef.current?.user?.id || null;
      const nextUserId = nextSession?.user?.id || null;
      if (previousUserId !== nextUserId) {
        loadGenerationRef.current += 1;
        selectionGenerationRef.current += 1;
        // Do not let a request from a previous identity be reused if the
        // same user signs in again before that request settles.
        accessLoadRef.current = null;
        setAccessSnapshot(emptyAccess(nextUserId ? "loading" : "signed-out"));
        setIsSwitching(Boolean(nextUserId));
        clearCompanyContext();
      }
      sessionRef.current = nextSession;
      setSession(nextSession);
      setGuestMode(false);
      setAuthResolved(true);
    };

    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => applySession(nextSession));
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [setAccessSnapshot]);

  const refreshAccess = useCallback(async () => {
    const activeSession = sessionRef.current;
    const userId = activeSession?.user?.id;
    if (!supabase || !userId) {
      setAccessSnapshot(emptyAccess(!isSupabaseConfigured ? "guest" : "signed-out"));
      clearCompanyContext();
      setIsSwitching(false);
      return;
    }

    const inFlight = accessLoadRef.current;
    if (inFlight?.userId === userId) {
      await inFlight.promise;
      return;
    }

    const generation = ++loadGenerationRef.current;
    const selectionGeneration = selectionGenerationRef.current;
    const previousSnapshot = accessRef.current;
    const previousCompanyId = previousSnapshot.activeCompanyId;
    const hasUsableSnapshot = Boolean(previousSnapshot.activeCompanyId && (previousSnapshot.status === "ready" || previousSnapshot.status === "refreshing"));
    setIsSwitching(true);
    if (hasUsableSnapshot) {
      // Metadata/access revalidation is not a workspace switch. Keep the
      // currently authorized company and permissions visible until a valid
      // replacement arrives.
      setAccessSnapshot({ ...previousSnapshot, status: "refreshing", error: undefined });
    } else {
      setAccessSnapshot({ ...emptyAccess("loading"), userId, email: activeSession.user.email || undefined });
    }
    const request = (async () => {
      try {
        if (!hasUsableSnapshot) await bootstrapPlatformAdmin(supabase);
        const loaded = await loadCompanyAccess(supabase);
        if (generation !== loadGenerationRef.current || sessionRef.current?.user?.id !== userId) return;
        const selectionChanged = selectionGeneration !== selectionGenerationRef.current;
        const preferredCompanyId = selectionChanged ? accessRef.current.activeCompanyId : previousCompanyId;
        if (selectionChanged && !preferredCompanyId) return;
        const next = resolvedAccess(loaded, preferredCompanyId);
        setAccessSnapshot(next);
        if (next.userId) storeCompanyId(next.userId, next.activeCompanyId);
      } catch (error) {
        if (generation !== loadGenerationRef.current) return;
        const selectionChanged = selectionGeneration !== selectionGenerationRef.current;
        const latestSnapshot = selectionChanged ? accessRef.current : previousSnapshot;
        if (hasUsableSnapshot && latestSnapshot.activeCompanyId) {
          setAccessSnapshot({ ...latestSnapshot, status: "ready", error: error instanceof Error ? error.message : String(error) });
        } else {
          setAccessSnapshot({
            ...emptyAccess("error"),
            userId,
            email: activeSession.user.email || undefined,
            error: error instanceof Error ? error.message : String(error),
          });
          clearCompanyContext();
        }
      } finally {
        if (generation === loadGenerationRef.current && selectionGeneration === selectionGenerationRef.current) setIsSwitching(false);
      }
    })();
    accessLoadRef.current = { userId, promise: request };
    try {
      await request;
    } finally {
      if (accessLoadRef.current?.promise === request) accessLoadRef.current = null;
    }
  }, [setAccessSnapshot]);

  useEffect(() => {
    if (!authResolved) return undefined;
    if (!supabase || !session?.user?.id) {
      if (isSupabaseConfigured) setAccessSnapshot(emptyAccess("signed-out"));
      setIsSwitching(false);
      clearCompanyContext();
      return undefined;
    }
    void refreshAccess();
    return undefined;
  }, [authResolved, refreshAccess, session?.user?.id, setAccessSnapshot]);

  useEffect(() => {
    if (!supabase || !session?.user?.id) return undefined;
    const userId = session.user.id;
    const channel = supabase
      .channel(`invoice-access:${encodeURIComponent(userId)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_members", filter: `user_id=eq.${userId}` }, () => {
        void refreshAccess();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session?.user?.id, refreshAccess]);

  const selectCompany = useCallback(async (companyId: string) => {
    const requestGeneration = ++selectionGenerationRef.current;
    const current = accessRef.current;
    if (!canOpenCompanyWorkspace(current, companyId)) throw new Error("You do not have access to that active company workspace.");
    if (current.activeCompanyId === companyId) {
      setIsSwitching(false);
      return;
    }
    setIsSwitching(true);
    // Clear the global API context before changing React state. Any in-flight
    // loader that still reaches a mutation boundary now fails closed.
    clearCompanyContext();
    const loading = { ...current, status: "loading" as const, activeCompanyId: null, permissions: [] };
    setAccessSnapshot(loading);
    await Promise.resolve();
    if (requestGeneration !== selectionGenerationRef.current) return;
    const latest = accessRef.current;
    if (!canOpenCompanyWorkspace(latest, companyId)) {
      setIsSwitching(false);
      throw new Error("That company is no longer an active workspace.");
    }
    const next = { ...latest, status: "ready" as const, activeCompanyId: companyId, permissions: permissionsForCompany(latest, companyId) };
    setAccessSnapshot(next);
    if (next.userId) storeCompanyId(next.userId, companyId);
    setIsSwitching(false);
  }, [setAccessSnapshot]);

  const mergeCompany = useCallback((company: CompanySummary) => {
    const current = accessRef.current;
    const companies = current.companies.some((item) => item.id === company.id)
      ? current.companies.map((item) => item.id === company.id ? company : item)
      : [...current.companies, company];
    const isActive = current.activeCompanyId === company.id;
    const accessible = company.status.toUpperCase() === "ACTIVE";
    const nextActiveCompanyId = isActive && !accessible ? null : current.activeCompanyId;
    const nextStatus = nextActiveCompanyId
      ? "ready"
      : (isActive && company.status.toUpperCase() === "SUSPENDED" ? "company-suspended" : (isActive ? "no-company" : current.status));
    setAccessSnapshot({
      ...current,
      companies,
      status: nextStatus,
      activeCompanyId: nextActiveCompanyId,
      permissions: nextActiveCompanyId ? permissionsForCompany(current, nextActiveCompanyId) : [],
      error: undefined,
    });
    if (current.userId) storeCompanyId(current.userId, nextActiveCompanyId);
  }, [setAccessSnapshot]);

  const enterGuestMode = useCallback(() => {
    if (isSupabaseConfigured) throw new Error("Browser-only mode is disabled when Supabase is configured.");
    setGuestMode(true);
    setAccessSnapshot(emptyAccess("guest"));
  }, [setAccessSnapshot]);

  const signOut = useCallback(async () => {
    loadGenerationRef.current += 1;
    selectionGenerationRef.current += 1;
    accessLoadRef.current = null;
    clearCompanyContext();
    setIsSwitching(false);
    setAccessSnapshot(emptyAccess(isSupabaseConfigured ? "signed-out" : "guest"));
    await signOutWorkspace();
  }, [setAccessSnapshot]);

  const createCompany = useCallback(async (input: CreateCompanyInput) => {
    const result = await createCompanyApi(input);
    mergeCompany(result);
    return result;
  }, [mergeCompany]);

  const updateCompany = useCallback(async (companyId: string, patch: Partial<Pick<CompanySummary, "name" | "companyCode" | "status" | "defaultCurrency" | "timezone">>) => {
    const result = await updateCompanyApi(companyId, patch);
    mergeCompany(result);
    return result;
  }, [mergeCompany]);

  const inviteCompanyMember = useCallback(async (input: InviteCompanyMemberInput) => {
    const result = await inviteCompanyMemberApi(input);
    return result;
  }, []);

  const updateCompanyMember = useCallback(async (input: UpdateCompanyMemberInput) => {
    const result = await updateCompanyMemberApi(input);
    if (input.userId && input.userId === session?.user?.id) await refreshAccess();
    return result;
  }, [refreshAccess, session?.user?.id]);

  const value = useMemo<CompanyAccessContextValue>(() => {
    const activeCompany = access.companies.find((company) => company.id === access.activeCompanyId) || null;
    const membership = activeCompanyMembership(access);
    return {
      session,
      authResolved,
      guestMode,
      access,
      activeCompany,
      activeCompanyId: access.activeCompanyId,
      activeMembership: membership,
      companies: access.companies,
      permissions: access.permissions,
      isPlatformOwner: access.isPlatformOwner,
      isSwitching,
      can: (permission) => hasPermission(access.permissions, permission),
      refreshAccess,
      selectCompany,
      enterGuestMode,
      signOut,
      createCompany,
      updateCompany,
      inviteCompanyMember,
      updateCompanyMember,
      loadCompanyMembers,
      loadCompanyInvitations,
      loadCompanyAccessAudit,
    };
  }, [access, authResolved, createCompany, enterGuestMode, guestMode, inviteCompanyMember, isSwitching, refreshAccess, selectCompany, session, signOut, updateCompany, updateCompanyMember]);

  return <CompanyAccessContext.Provider value={value}>{children}</CompanyAccessContext.Provider>;
}

export function useCompanyAccess() {
  const context = useContext(CompanyAccessContext);
  if (!context) throw new Error("useCompanyAccess must be used inside CompanyAccessProvider.");
  return context;
}

export function useOptionalCompanyAccess() {
  return useContext(CompanyAccessContext);
}

export function currentCompanyFromAccess(access: CompanyAccessSnapshot) {
  return access.companies.find((company) => company.id === access.activeCompanyId) || null;
}

export type { MembershipStatus };
