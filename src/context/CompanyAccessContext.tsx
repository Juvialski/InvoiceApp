import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  activeCompanyMembership,
  bootstrapPlatformAdmin,
  claimCompanyInvitations,
  companyIsSelectable,
  createCompany as createCompanyApi,
  inviteCompanyMember as inviteCompanyMemberApi,
  loadCompanyAccess,
  loadCompanyAccessAudit,
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
  const selectable = snapshot.companies.filter((company) => companyIsSelectable(snapshot, company.id));
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
    if (!supabase || !session?.user?.id) {
      setAccessSnapshot(emptyAccess(!isSupabaseConfigured ? "guest" : "signed-out"));
      clearCompanyContext();
      setIsSwitching(false);
      return;
    }

    const generation = ++loadGenerationRef.current;
    const previousCompanyId = accessRef.current.activeCompanyId;
    setIsSwitching(true);
    setAccessSnapshot({ ...emptyAccess("loading"), userId: session.user.id, email: session.user.email || undefined });
    try {
      // Keep the explicit claim call here as well as inside loadCompanyAccess
      // for callers that use this context with a test adapter. The RPC is
      // idempotent and derives the verified identity on the server.
      await bootstrapPlatformAdmin(supabase);
      await claimCompanyInvitations(supabase);
      const loaded = await loadCompanyAccess(supabase);
      if (generation !== loadGenerationRef.current || sessionRef.current?.user?.id !== session.user.id) return;
      const next = resolvedAccess(loaded, previousCompanyId);
      setAccessSnapshot(next);
      if (next.userId) storeCompanyId(next.userId, next.activeCompanyId);
    } catch (error) {
      if (generation !== loadGenerationRef.current) return;
      setAccessSnapshot({
        ...emptyAccess("error"),
        userId: session.user.id,
        email: session.user.email || undefined,
        error: error instanceof Error ? error.message : String(error),
      });
      clearCompanyContext();
    } finally {
      if (generation === loadGenerationRef.current) setIsSwitching(false);
    }
  }, [session, setAccessSnapshot]);

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
  }, [refreshAccess, session?.user?.id]);

  const selectCompany = useCallback(async (companyId: string) => {
    const current = accessRef.current;
    if (!companyIsSelectable(current, companyId)) throw new Error("You do not have access to that company.");
    if (current.activeCompanyId === companyId) return;
    setIsSwitching(true);
    // Clear the global API context before changing React state. Any in-flight
    // loader that still reaches a mutation boundary now fails closed.
    clearCompanyContext();
    const loading = { ...current, status: "loading" as const, activeCompanyId: null, permissions: [] };
    setAccessSnapshot(loading);
    await Promise.resolve();
    const next = { ...current, status: "ready" as const, activeCompanyId: companyId, permissions: permissionsForCompany(current, companyId) };
    setAccessSnapshot(next);
    if (next.userId) storeCompanyId(next.userId, companyId);
    setIsSwitching(false);
  }, [setAccessSnapshot]);

  const enterGuestMode = useCallback(() => {
    if (isSupabaseConfigured) throw new Error("Browser-only mode is disabled when Supabase is configured.");
    setGuestMode(true);
    setAccessSnapshot(emptyAccess("guest"));
  }, [setAccessSnapshot]);

  const signOut = useCallback(async () => {
    loadGenerationRef.current += 1;
    clearCompanyContext();
    setIsSwitching(false);
    setAccessSnapshot(emptyAccess(isSupabaseConfigured ? "signed-out" : "guest"));
    await signOutWorkspace();
  }, [setAccessSnapshot]);

  const createCompany = useCallback(async (input: CreateCompanyInput) => {
    const result = await createCompanyApi(input);
    await refreshAccess();
    return result;
  }, [refreshAccess]);

  const updateCompany = useCallback(async (companyId: string, patch: Partial<Pick<CompanySummary, "name" | "companyCode" | "status" | "defaultCurrency" | "timezone">>) => {
    const result = await updateCompanyApi(companyId, patch);
    await refreshAccess();
    return result;
  }, [refreshAccess]);

  const inviteCompanyMember = useCallback(async (input: InviteCompanyMemberInput) => {
    const result = await inviteCompanyMemberApi(input);
    await refreshAccess();
    return result;
  }, [refreshAccess]);

  const updateCompanyMember = useCallback(async (input: UpdateCompanyMemberInput) => {
    const result = await updateCompanyMemberApi(input);
    await refreshAccess();
    return result;
  }, [refreshAccess]);

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
