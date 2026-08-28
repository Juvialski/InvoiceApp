import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  activeCompanyMembership,
  inviteCompanyMember as inviteCompanyMemberApi,
  loadCompanyAccess,
  loadCompanyAccessAudit as loadCompanyAccessAuditApi,
  loadCompanyInvitations as loadCompanyInvitationsApi,
  loadCompanyMembers as loadCompanyMembersApi,
  updateCompany as updateCompanyApi,
  updateCompanyMember as updateCompanyMemberApi,
  type CompanyAccessAuditEntry,
  type CompanyAccessSnapshot,
  type CompanyInvitationSummary,
  type CompanyMemberSummary,
  type CompanyMembership,
  type CompanySummary,
  type CreateCompanyInput,
  type InviteCompanyMemberInput,
  type MembershipStatus,
  type UpdateCompanyMemberInput,
} from "../lib/companyAccess.ts";
import { clearCompanyContext, setDeploymentCompanyId } from "../lib/companyContext.ts";
import { assertDeploymentCompanyId, loadDeploymentCompanyId, resolveDeploymentCompanyAccess } from "../lib/deploymentCompany.ts";
import { isSupabaseConfigured, signOutWorkspace, supabase } from "../lib/supabase.ts";
import { hasPermission, type PermissionKey } from "../utils/accessControl.ts";
import { safeErrorMessage } from "../utils/errorNormalization.ts";

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
  /** Compatibility callback. It validates the deployment company and never changes tenants. */
  selectCompany: (companyId: string) => Promise<void>;
  enterGuestMode: () => void;
  signOut: () => Promise<void>;
  createCompany: (input: CreateCompanyInput) => Promise<CompanySummary>;
  updateCompany: (companyId: string, patch: Partial<Pick<CompanySummary, "name" | "companyCode" | "status" | "defaultCurrency" | "timezone">>) => Promise<CompanySummary>;
  inviteCompanyMember: (input: InviteCompanyMemberInput) => Promise<unknown>;
  updateCompanyMember: (input: UpdateCompanyMemberInput) => Promise<unknown>;
  loadCompanyMembers: (companyId: string) => Promise<CompanyMemberSummary[]>;
  loadCompanyInvitations: (companyId: string) => Promise<CompanyInvitationSummary[]>;
  loadCompanyAccessAudit: (companyId?: string) => Promise<CompanyAccessAuditEntry[]>;
}

const CompanyAccessContext = createContext<CompanyAccessContextValue | null>(null);

function emptyAccess(status: CompanyAccessSnapshot["status"] = "signed-out", error?: string): CompanyAccessSnapshot {
  return {
    status,
    isPlatformOwner: false,
    companies: [],
    memberships: [],
    activeCompanyId: null,
    permissions: [],
    ...(error ? { error } : {}),
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
  const deploymentCompanyIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  const accessLoadRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);

  const setAccessSnapshot = useCallback((next: CompanyAccessSnapshot) => {
    accessRef.current = next;
    setAccess(next);
    setDeploymentCompanyId(next.activeCompanyId);
  }, []);

  const resetAuthenticatedContext = useCallback((status: CompanyAccessSnapshot["status"], userId?: string, email?: string, error?: string) => {
    clearCompanyContext();
    deploymentCompanyIdRef.current = null;
    setAccessSnapshot({ ...emptyAccess(status, error), ...(userId ? { userId } : {}), ...(email ? { email } : {}) });
  }, [setAccessSnapshot]);

  useEffect(() => {
    if (!supabase) {
      sessionRef.current = null;
      setSession(null);
      setGuestMode(true);
      setAuthResolved(true);
      resetAuthenticatedContext("guest");
      return undefined;
    }

    let mounted = true;
    const applySession = (nextSession: Session | null) => {
      if (!mounted) return;
      const previousUserId = sessionRef.current?.user?.id || null;
      const nextUserId = nextSession?.user?.id || null;
      if (previousUserId !== nextUserId) {
        loadGenerationRef.current += 1;
        accessLoadRef.current = null;
        resetAuthenticatedContext(nextUserId ? "loading" : "signed-out", nextUserId || undefined, nextSession?.user?.email || undefined);
        setIsSwitching(Boolean(nextUserId));
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
  }, [resetAuthenticatedContext]);

  const refreshAccess = useCallback(async () => {
    const activeSession = sessionRef.current;
    const userId = activeSession?.user?.id;
    if (!supabase || !userId) {
      resetAuthenticatedContext(!isSupabaseConfigured ? "guest" : "signed-out");
      setIsSwitching(false);
      return;
    }

    const inFlight = accessLoadRef.current;
    if (inFlight?.userId === userId) {
      await inFlight.promise;
      return;
    }

    const generation = ++loadGenerationRef.current;
    setIsSwitching(true);
    // Access and deployment identity are revalidated as one unit. Clear first so
    // a role change, logout/login, or deployment reconfiguration cannot leave a
    // stale permission/company context usable while the request is in flight.
    resetAuthenticatedContext("loading", userId, activeSession.user.email || undefined);

    const request = (async () => {
      try {
        const [loaded, deploymentCompanyId] = await Promise.all([
          loadCompanyAccess(supabase),
          loadDeploymentCompanyId(supabase),
        ]);
        if (generation !== loadGenerationRef.current || sessionRef.current?.user?.id !== userId) return;
        const resolved = resolveDeploymentCompanyAccess(loaded, deploymentCompanyId);
        deploymentCompanyIdRef.current = deploymentCompanyId;
        setAccessSnapshot(resolved);
      } catch (error) {
        if (generation !== loadGenerationRef.current || sessionRef.current?.user?.id !== userId) return;
        const message = safeErrorMessage(error, "Deployment company access could not be loaded.");
        resetAuthenticatedContext("error", userId, activeSession.user.email || undefined, message);
      } finally {
        if (generation === loadGenerationRef.current) setIsSwitching(false);
      }
    })();

    accessLoadRef.current = { userId, promise: request };
    try {
      await request;
    } finally {
      if (accessLoadRef.current?.promise === request) accessLoadRef.current = null;
    }
  }, [resetAuthenticatedContext, setAccessSnapshot]);

  useEffect(() => {
    if (!authResolved) return undefined;
    if (!supabase || !session?.user?.id) {
      if (isSupabaseConfigured) resetAuthenticatedContext("signed-out");
      setIsSwitching(false);
      return undefined;
    }
    void refreshAccess();
    return undefined;
  }, [authResolved, refreshAccess, resetAuthenticatedContext, session?.user?.id]);

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

  const deploymentCompanyIdFor = useCallback((candidateCompanyId?: string | null, operation?: string) => {
    return assertDeploymentCompanyId(deploymentCompanyIdRef.current, candidateCompanyId, operation);
  }, []);

  const selectCompany = useCallback(async (companyId: string) => {
    const deploymentCompanyId = deploymentCompanyIdFor(companyId, "workspace request");
    if (accessRef.current.activeCompanyId !== deploymentCompanyId) {
      throw new Error("Your account is not an active member of this Engoryx deployment company.");
    }
  }, [deploymentCompanyIdFor]);

  const enterGuestMode = useCallback(() => {
    if (isSupabaseConfigured) throw new Error("Browser-only mode is disabled when Supabase is configured.");
    setGuestMode(true);
    resetAuthenticatedContext("guest");
  }, [resetAuthenticatedContext]);

  const signOut = useCallback(async () => {
    loadGenerationRef.current += 1;
    accessLoadRef.current = null;
    resetAuthenticatedContext(isSupabaseConfigured ? "signed-out" : "guest");
    setIsSwitching(false);
    await signOutWorkspace();
  }, [resetAuthenticatedContext]);

  const createCompany = useCallback(async (_input: CreateCompanyInput): Promise<CompanySummary> => {
    throw new Error("Creating another company is disabled. Provision a separate Engoryx deployment for another client company.");
  }, []);

  const updateCompany = useCallback(async (companyId: string, patch: Partial<Pick<CompanySummary, "name" | "companyCode" | "status" | "defaultCurrency" | "timezone">>) => {
    const deploymentCompanyId = deploymentCompanyIdFor(companyId, "company update");
    const result = await updateCompanyApi(deploymentCompanyId, patch);
    await refreshAccess();
    return result;
  }, [deploymentCompanyIdFor, refreshAccess]);

  const inviteCompanyMember = useCallback(async (input: InviteCompanyMemberInput) => {
    const deploymentCompanyId = deploymentCompanyIdFor(input.companyId, "member invitation");
    return inviteCompanyMemberApi({ ...input, companyId: deploymentCompanyId });
  }, [deploymentCompanyIdFor]);

  const updateCompanyMember = useCallback(async (input: UpdateCompanyMemberInput) => {
    const deploymentCompanyId = deploymentCompanyIdFor(input.companyId, "membership update");
    const result = await updateCompanyMemberApi({ ...input, companyId: deploymentCompanyId });
    if (input.userId && input.userId === session?.user?.id) await refreshAccess();
    return result;
  }, [deploymentCompanyIdFor, refreshAccess, session?.user?.id]);

  const loadCompanyMembers = useCallback(async (companyId: string) => {
    return loadCompanyMembersApi(deploymentCompanyIdFor(companyId, "member directory"));
  }, [deploymentCompanyIdFor]);

  const loadCompanyInvitations = useCallback(async (companyId: string) => {
    return loadCompanyInvitationsApi(deploymentCompanyIdFor(companyId, "invitation list"));
  }, [deploymentCompanyIdFor]);

  const loadCompanyAccessAudit = useCallback(async (companyId?: string) => {
    return loadCompanyAccessAuditApi(deploymentCompanyIdFor(companyId, "access audit"));
  }, [deploymentCompanyIdFor]);

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
      isPlatformOwner: false,
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
  }, [access, authResolved, createCompany, enterGuestMode, guestMode, inviteCompanyMember, isSwitching, loadCompanyAccessAudit, loadCompanyInvitations, loadCompanyMembers, refreshAccess, selectCompany, session, signOut, updateCompany, updateCompanyMember]);

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
