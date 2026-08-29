import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  activeCompanyMembership,
  loadCompanyAccess,
  loadCompanyAccessAudit as loadCompanyAccessAuditApi,
  loadCompanyInvitations as loadCompanyInvitationsApi,
  loadCompanyMembers as loadCompanyMembersApi,
  loadCompanyPermissionCatalog as loadCompanyPermissionCatalogApi,
  revokeCompanyInvitation as revokeCompanyInvitationApi,
  updateCompany as updateCompanyApi,
  updateCompanyMember as updateCompanyMemberApi,
  updateCompanyMemberPermissions as updateCompanyMemberPermissionsApi,
  type CompanyAccessAuditEntry,
  type CompanyAccessSnapshot,
  type CompanyInvitationSummary,
  type CompanyMemberSummary,
  type CompanyMembership,
  type CompanyPermissionCatalogEntry,
  type CompanySummary,
  type CreateCompanyInput,
  type InviteCompanyMemberInput,
  type MembershipStatus,
  type UpdateCompanyMemberInput,
  type UpdateCompanyMemberPermissionsInput,
} from "../lib/companyAccess.ts";
import { companyApiRequest } from "../lib/companyApi.ts";
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
  resendCompanyInvitation: (companyId: string, invitationId: string) => Promise<unknown>;
  revokeCompanyInvitation: (companyId: string, invitationId: string) => Promise<unknown>;
  updateCompanyMember: (input: UpdateCompanyMemberInput) => Promise<unknown>;
  updateCompanyMemberPermissions: (input: UpdateCompanyMemberPermissionsInput) => Promise<unknown>;
  loadCompanyMembers: (companyId: string) => Promise<CompanyMemberSummary[]>;
  loadCompanyInvitations: (companyId: string) => Promise<CompanyInvitationSummary[]>;
  loadCompanyPermissionCatalog: (companyId: string) => Promise<CompanyPermissionCatalogEntry[]>;
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
    const companyId = access.activeCompanyId;
    const channel = supabase
      .channel(`invoice-access:${encodeURIComponent(userId)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_members", filter: `user_id=eq.${userId}` }, () => {
        void refreshAccess();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "company_member_permission_overrides", ...(companyId ? { filter: `company_id=eq.${companyId}` } : {}) }, () => {
        void refreshAccess();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [access.activeCompanyId, refreshAccess, session?.user?.id]);

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
    const response = await companyApiRequest("/api/company/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email,
        roleKey: input.roleKey,
        expiresAt: input.expiresAt,
        permissionOverrides: input.permissionOverrides,
      }),
      companyId: deploymentCompanyId,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) throw new Error(payload?.error || "The invitation email could not be sent.");
    return payload?.invitation || payload;
  }, [deploymentCompanyIdFor]);

  const resendCompanyInvitation = useCallback(async (companyId: string, invitationId: string) => {
    const deploymentCompanyId = deploymentCompanyIdFor(companyId, "invitation resend");
    const response = await companyApiRequest(`/api/company/invitations/${encodeURIComponent(invitationId)}/resend`, {
      method: "POST",
      companyId: deploymentCompanyId,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) throw new Error(payload?.error || "The invitation email could not be resent.");
    return payload?.invitation || payload;
  }, [deploymentCompanyIdFor]);

  const revokeCompanyInvitation = useCallback(async (companyId: string, invitationId: string) => {
    const deploymentCompanyId = deploymentCompanyIdFor(companyId, "invitation revocation");
    return revokeCompanyInvitationApi(invitationId, deploymentCompanyId);
  }, [deploymentCompanyIdFor]);

  const updateCompanyMember = useCallback(async (input: UpdateCompanyMemberInput) => {
    const deploymentCompanyId = deploymentCompanyIdFor(input.companyId, "membership update");
    const result = await updateCompanyMemberApi({ ...input, companyId: deploymentCompanyId });
    if (input.userId && input.userId === session?.user?.id) await refreshAccess();
    return result;
  }, [deploymentCompanyIdFor, refreshAccess, session?.user?.id]);

  const updateCompanyMemberPermissions = useCallback(async (input: UpdateCompanyMemberPermissionsInput) => {
    const deploymentCompanyId = deploymentCompanyIdFor(input.companyId, "member permission update");
    const result = await updateCompanyMemberPermissionsApi({ ...input, companyId: deploymentCompanyId });
    const target = accessRef.current.memberships.find((membership) => membership.id === input.membershipId);
    if (target?.userId && target.userId === session?.user?.id) await refreshAccess();
    return result;
  }, [deploymentCompanyIdFor, refreshAccess, session?.user?.id]);

  const loadCompanyMembers = useCallback(async (companyId: string) => {
    return loadCompanyMembersApi(deploymentCompanyIdFor(companyId, "member directory"));
  }, [deploymentCompanyIdFor]);

  const loadCompanyInvitations = useCallback(async (companyId: string) => {
    return loadCompanyInvitationsApi(deploymentCompanyIdFor(companyId, "invitation list"));
  }, [deploymentCompanyIdFor]);

  const loadCompanyPermissionCatalog = useCallback(async (companyId: string) => {
    return loadCompanyPermissionCatalogApi(deploymentCompanyIdFor(companyId, "permission catalog"));
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
      resendCompanyInvitation,
      revokeCompanyInvitation,
      updateCompanyMember,
      updateCompanyMemberPermissions,
      loadCompanyMembers,
      loadCompanyInvitations,
      loadCompanyPermissionCatalog,
      loadCompanyAccessAudit,
    };
  }, [access, authResolved, createCompany, enterGuestMode, guestMode, inviteCompanyMember, isSwitching, loadCompanyAccessAudit, loadCompanyInvitations, loadCompanyMembers, loadCompanyPermissionCatalog, refreshAccess, resendCompanyInvitation, revokeCompanyInvitation, selectCompany, session, signOut, updateCompany, updateCompanyMember, updateCompanyMemberPermissions]);

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
