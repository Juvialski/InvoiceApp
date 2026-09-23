import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { BRAND } from "../config/brand.ts";
import {
  activeCompanyMembership,
  archiveCompanyRole as archiveCompanyRoleApi,
  authorizeCompanyMemberEmail as authorizeCompanyMemberEmailApi,
  createCompanyRole as createCompanyRoleApi,
  loadCompanyAccess,
  loadCompanyAccessAudit as loadCompanyAccessAuditApi,
  loadCompanyInvitations as loadCompanyInvitationsApi,
  loadCompanyMembers as loadCompanyMembersApi,
  loadCompanyPermissionCatalog as loadCompanyPermissionCatalogApi,
  loadCompanyRoles as loadCompanyRolesApi,
  revokeCompanyInvitation as revokeCompanyInvitationApi,
  updateCompanyInvitationPermissions as updateCompanyInvitationPermissionsApi,
  updateCompany as updateCompanyApi,
  updateCompanyMember as updateCompanyMemberApi,
  updateCompanyMemberPermissions as updateCompanyMemberPermissionsApi,
  updateCompanyRole as updateCompanyRoleApi,
  type CompanyAccessAuditEntry,
  type CompanyAccessSnapshot,
  type CompanyInvitationSummary,
  type CompanyMemberSummary,
  type CompanyMembership,
  type CompanyPermissionCatalogEntry,
  type CompanyRoleSummary,
  type CompanySummary,
  type CreateCompanyInput,
  type CreateCompanyRoleInput,
  type InviteCompanyMemberInput,
  type MembershipStatus,
  type UpdateCompanyInvitationPermissionsInput,
  type UpdateCompanyMemberInput,
  type UpdateCompanyMemberPermissionsInput,
  type UpdateCompanyRoleInput,
} from "../lib/companyAccess.ts";
import {
  bindIdleSessionRecovery,
  recoverSessionBeforeAccessRefresh,
  refreshCompanyAccessState,
} from "../lib/companyAccessRecovery.ts";
import { shouldPreserveCompanyAccessDuringRefresh } from "../lib/companyAccessRefresh.ts";
import {
  refreshAccessTokenSingleFlight,
  isTerminalSessionRefreshFailure,
  SESSION_EXPIRED_EVENT,
} from "../lib/authenticatedRequestRecovery.ts";
import { clearCompanyContext, setDeploymentCompanyId } from "../lib/companyContext.ts";
import { assertDeploymentCompanyId, loadDeploymentCompanyId } from "../lib/deploymentCompany.ts";
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
  isRefreshing: boolean;
  refreshError: string | null;
  sessionExpiredNotice: boolean;
  can: (permission: PermissionKey) => boolean;
  refreshAccess: () => Promise<void>;
  /** Compatibility callback. It validates the deployment company and never changes tenants. */
  selectCompany: (companyId: string) => Promise<void>;
  enterGuestMode: () => void;
  signOut: () => Promise<void>;
  createCompany: (input: CreateCompanyInput) => Promise<CompanySummary>;
  updateCompany: (companyId: string, patch: Partial<Pick<CompanySummary, "name" | "companyCode" | "status" | "defaultCurrency" | "timezone">>) => Promise<CompanySummary>;
  authorizeCompanyMemberEmail: (input: InviteCompanyMemberInput) => Promise<unknown>;
  /** Compatibility alias for older access-management callers. */
  inviteCompanyMember: (input: InviteCompanyMemberInput) => Promise<unknown>;
  revokeCompanyInvitation: (companyId: string, invitationId: string) => Promise<unknown>;
  updateCompanyInvitationPermissions: (input: UpdateCompanyInvitationPermissionsInput) => Promise<unknown>;
  updateCompanyMember: (input: UpdateCompanyMemberInput) => Promise<unknown>;
  updateCompanyMemberPermissions: (input: UpdateCompanyMemberPermissionsInput) => Promise<unknown>;
  loadCompanyRoles: (companyId: string) => Promise<CompanyRoleSummary[]>;
  createCompanyRole: (input: CreateCompanyRoleInput) => Promise<CompanyRoleSummary>;
  updateCompanyRole: (input: UpdateCompanyRoleInput) => Promise<CompanyRoleSummary>;
  archiveCompanyRole: (companyId: string, roleKey: string) => Promise<CompanyRoleSummary>;
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);
  const accessRef = useRef(access);
  const sessionRef = useRef<Session | null>(null);
  const deploymentCompanyIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  const accessLoadRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  const activeAccessRefreshUserRef = useRef<string | null>(null);
  const explicitSignOutRef = useRef(false);
  const applySessionRef = useRef<(event: string, nextSession: Session | null) => void>(() => undefined);
  const refreshAccessRef = useRef<() => Promise<void>>(() => Promise.resolve());

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
      setIsRefreshing(false);
      setRefreshError(null);
      setSessionExpiredNotice(false);
      resetAuthenticatedContext("guest");
      return undefined;
    }

    let mounted = true;
    const applySession = (event: string, nextSession: Session | null) => {
      if (!mounted) return;
      const previousUserId = sessionRef.current?.user?.id || null;
      const nextUserId = nextSession?.user?.id || null;
      if (previousUserId !== nextUserId) {
        const refreshWasForPreviousUser = activeAccessRefreshUserRef.current === previousUserId;
        loadGenerationRef.current += 1;
        accessLoadRef.current = null;
        activeAccessRefreshUserRef.current = null;
        setIsRefreshing(false);
        setRefreshError(null);
        if (nextUserId || explicitSignOutRef.current) setSessionExpiredNotice(false);
        else if (previousUserId && (event === "SIGNED_OUT" || refreshWasForPreviousUser)) setSessionExpiredNotice(true);
        resetAuthenticatedContext(nextUserId ? "loading" : "signed-out", nextUserId || undefined, nextSession?.user?.email || undefined);
        setIsSwitching(Boolean(nextUserId));
      }
      sessionRef.current = nextSession;
      setSession(nextSession);
      setGuestMode(false);
      setAuthResolved(true);
      if (event === "TOKEN_REFRESHED" && previousUserId && previousUserId === nextUserId) {
        void refreshAccessRef.current();
      }
    };

    applySessionRef.current = applySession;
    let authEventReceived = false;
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authEventReceived = true;
      applySession(event, nextSession);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (authEventReceived) {
        if (error && isTerminalSessionRefreshFailure(error) && !sessionRef.current?.user?.id && !explicitSignOutRef.current) {
          setSessionExpiredNotice(true);
        }
        return;
      }
      applySession("INITIAL_SESSION", data.session);
      if (!data.session && error && isTerminalSessionRefreshFailure(error)) setSessionExpiredNotice(true);
    }).catch((error) => {
      if (authEventReceived) {
        if (isTerminalSessionRefreshFailure(error) && !sessionRef.current?.user?.id && !explicitSignOutRef.current) {
          setSessionExpiredNotice(true);
        }
        return;
      }
      setAuthResolved(true);
      setGuestMode(false);
      if (isTerminalSessionRefreshFailure(error)) setSessionExpiredNotice(true);
    });
    return () => {
      mounted = false;
      applySessionRef.current = () => undefined;
      listener.subscription.unsubscribe();
    };
  }, [resetAuthenticatedContext]);

  const refreshAccess = useCallback(async () => {
    const activeSession = sessionRef.current;
    const userId = activeSession?.user?.id;
    if (!supabase || !userId) {
      resetAuthenticatedContext(!isSupabaseConfigured ? "guest" : "signed-out");
      setIsSwitching(false);
      setIsRefreshing(false);
      setRefreshError(null);
      return;
    }

    const inFlight = accessLoadRef.current;
    if (inFlight?.userId === userId) {
      await inFlight.promise;
      return;
    }

    const generation = ++loadGenerationRef.current;

    const request = (async () => {
      activeAccessRefreshUserRef.current = userId;
      try {
        const result = await refreshCompanyAccessState({
          access: accessRef.current,
          isSwitching: false,
          isRefreshing: false,
          refreshError: null,
          sessionExpired: false,
        }, {
          userId,
          userEmail: activeSession.user.email || undefined,
          requestGeneration: generation,
          currentGeneration: () => loadGenerationRef.current,
          currentUserId: () => sessionRef.current?.user?.id || null,
          knownDeploymentCompanyId: deploymentCompanyIdRef.current,
          loadAccess: () => loadCompanyAccess(supabase),
          loadDeploymentCompanyId: () => loadDeploymentCompanyId(supabase),
          refreshAccessToken: () => refreshAccessTokenSingleFlight(userId, async () => {
            const { data: refreshData, error: refreshErrorValue } = await supabase.auth.refreshSession();
            if (refreshErrorValue) throw refreshErrorValue;
            if (refreshData.session?.user.id !== userId) return null;
            return refreshData.session.access_token || null;
          }),
          getSession: async () => {
            const { data, error } = await supabase.auth.getSession();
            return { session: data.session, error };
          },
        }, (nextState) => {
          setAccessSnapshot(nextState.access);
          setIsSwitching(nextState.isSwitching);
          setIsRefreshing(nextState.isRefreshing);
          setRefreshError(nextState.refreshError);
          setSessionExpiredNotice(nextState.sessionExpired);
        });

        if (!result) return;
        if (result.outcome.kind === "resolved") {
          deploymentCompanyIdRef.current = result.outcome.access.status === "ready"
            ? result.outcome.deploymentCompanyId
            : null;
          const refreshedSession = result.outcome.refreshedSession;
          if (refreshedSession && sessionRef.current?.user?.id === userId) {
            sessionRef.current = refreshedSession;
            setSession(refreshedSession);
          }
        } else if (result.outcome.kind === "deployment-mismatch") {
          deploymentCompanyIdRef.current = null;
        } else if (result.outcome.kind === "session-expired") {
          if (sessionRef.current?.user?.id === userId) {
            loadGenerationRef.current += 1;
            accessLoadRef.current = null;
            sessionRef.current = null;
            setSession(null);
            resetAuthenticatedContext("signed-out");
            setSessionExpiredNotice(true);
            void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
          }
        } else if (result.outcome.kind === "identity-changed") {
          const { data, error } = await supabase.auth.getSession();
          if (data.session && data.session.user.id !== userId) {
            applySessionRef.current("SIGNED_IN", data.session);
          } else if (error && isTerminalSessionRefreshFailure(error) && sessionRef.current?.user?.id === userId) {
            loadGenerationRef.current += 1;
            sessionRef.current = null;
            setSession(null);
            resetAuthenticatedContext("signed-out");
            setSessionExpiredNotice(true);
            void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
          } else if (!error && !data.session && sessionRef.current?.user?.id === userId) {
            loadGenerationRef.current += 1;
            sessionRef.current = null;
            setSession(null);
            resetAuthenticatedContext("signed-out");
            setSessionExpiredNotice(true);
          } else if (sessionRef.current?.user?.id === userId) {
            resetAuthenticatedContext("error", userId, activeSession.user.email || undefined, "The signed-in identity changed during access verification.");
            setIsSwitching(false);
            setIsRefreshing(false);
          }
        }
      } finally {
        if (activeAccessRefreshUserRef.current === userId) activeAccessRefreshUserRef.current = null;
        if (loadGenerationRef.current === generation && sessionRef.current?.user?.id === userId) {
          setIsSwitching(false);
          setIsRefreshing(false);
        }
      }
    })();

    accessLoadRef.current = { userId, promise: request };
    try {
      await request;
    } finally {
      if (accessLoadRef.current?.promise === request) accessLoadRef.current = null;
    }
  }, [resetAuthenticatedContext, setAccessSnapshot]);
  refreshAccessRef.current = refreshAccess;

  useEffect(() => {
    if (!supabase || !session?.user?.id || typeof document === "undefined" || typeof window === "undefined") return undefined;
    const userId = session.user.id;
    return bindIdleSessionRecovery({
      documentTarget: document,
      windowTarget: window,
      recover: async () => {
        if (sessionRef.current?.user?.id !== userId) return;
        const result = await recoverSessionBeforeAccessRefresh({
          userId,
          currentUserId: () => sessionRef.current?.user?.id || null,
          getSession: async () => {
            const { data, error } = await supabase.auth.getSession();
            return { session: data.session, error };
          },
          onSameUserSession: (nextSession) => {
            sessionRef.current = nextSession;
            setSession(nextSession);
          },
          refreshAccess,
        });

        if (explicitSignOutRef.current) return;
        if (result.kind === "recovered") return;
        if (result.kind === "transient-failure") {
          if (sessionRef.current?.user?.id === userId && shouldPreserveCompanyAccessDuringRefresh(accessRef.current, userId)) {
            setRefreshError(safeErrorMessage(result.error, "Connection interrupted while checking your session."));
          }
          return;
        }
        if (result.kind === "session-expired") {
          if (sessionRef.current?.user?.id === userId) {
            loadGenerationRef.current += 1;
            accessLoadRef.current = null;
            sessionRef.current = null;
            setSession(null);
            resetAuthenticatedContext("signed-out");
            void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
          }
          setSessionExpiredNotice(true);
          return;
        }
        if (result.kind === "identity-changed") {
          if (result.session) applySessionRef.current("SIGNED_IN", result.session);
          return;
        }
        if (sessionRef.current?.user?.id === userId) applySessionRef.current("SIGNED_OUT", null);
      },
    });
  }, [refreshAccess, resetAuthenticatedContext, session?.user?.id]);

  useEffect(() => {
    if (!supabase || typeof window === "undefined") return undefined;
    const onSessionExpired = (event: Event) => {
      const expiredUserId = (event as CustomEvent<{ sessionUserId?: string }>).detail?.sessionUserId;
      if (!expiredUserId || sessionRef.current?.user?.id !== expiredUserId) return;
      loadGenerationRef.current += 1;
      accessLoadRef.current = null;
      activeAccessRefreshUserRef.current = null;
      sessionRef.current = null;
      setSession(null);
      setIsSwitching(false);
      setIsRefreshing(false);
      setRefreshError(null);
      resetAuthenticatedContext("signed-out");
      setSessionExpiredNotice(true);
      void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, [resetAuthenticatedContext]);

  useEffect(() => {
    if (!authResolved) return undefined;
    if (!supabase || !session?.user?.id) {
      if (isSupabaseConfigured) resetAuthenticatedContext("signed-out");
      setIsSwitching(false);
      setIsRefreshing(false);
      setRefreshError(null);
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
      throw new Error(`Your account is not an active member of this ${BRAND.productName} deployment company.`);
    }
  }, [deploymentCompanyIdFor]);

  const enterGuestMode = useCallback(() => {
    if (isSupabaseConfigured) throw new Error("Browser-only mode is disabled when Supabase is configured.");
    setGuestMode(true);
    setIsRefreshing(false);
    setRefreshError(null);
    setSessionExpiredNotice(false);
    resetAuthenticatedContext("guest");
  }, [resetAuthenticatedContext]);

  const signOut = useCallback(async () => {
    explicitSignOutRef.current = true;
    loadGenerationRef.current += 1;
    accessLoadRef.current = null;
    activeAccessRefreshUserRef.current = null;
    sessionRef.current = null;
    setSession(null);
    setIsRefreshing(false);
    setRefreshError(null);
    setSessionExpiredNotice(false);
    resetAuthenticatedContext(isSupabaseConfigured ? "signed-out" : "guest");
    setIsSwitching(false);
    try {
      await signOutWorkspace();
    } finally {
      explicitSignOutRef.current = false;
    }
  }, [resetAuthenticatedContext]);

  const createCompany = useCallback(async (_input: CreateCompanyInput): Promise<CompanySummary> => {
    throw new Error(`Creating another company is disabled. Provision a separate ${BRAND.productName} deployment for another client company.`);
  }, []);

  const updateCompany = useCallback(async (companyId: string, patch: Partial<Pick<CompanySummary, "name" | "companyCode" | "status" | "defaultCurrency" | "timezone">>) => {
    const deploymentCompanyId = deploymentCompanyIdFor(companyId, "company update");
    const result = await updateCompanyApi(deploymentCompanyId, patch);
    await refreshAccess();
    return result;
  }, [deploymentCompanyIdFor, refreshAccess]);

  const authorizeCompanyMemberEmail = useCallback(async (input: InviteCompanyMemberInput) => {
    const deploymentCompanyId = deploymentCompanyIdFor(input.companyId, "member invitation");
    return authorizeCompanyMemberEmailApi({ ...input, companyId: deploymentCompanyId });
  }, [deploymentCompanyIdFor]);

  const inviteCompanyMember = authorizeCompanyMemberEmail;

  const revokeCompanyInvitation = useCallback(async (companyId: string, invitationId: string) => {
    const deploymentCompanyId = deploymentCompanyIdFor(companyId, "invitation revocation");
    return revokeCompanyInvitationApi(invitationId, deploymentCompanyId);
  }, [deploymentCompanyIdFor]);

  const updateCompanyInvitationPermissions = useCallback(async (input: UpdateCompanyInvitationPermissionsInput) => {
    const deploymentCompanyId = deploymentCompanyIdFor(input.companyId, "pending access permission update");
    return updateCompanyInvitationPermissionsApi({ ...input, companyId: deploymentCompanyId });
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

  const loadCompanyRoles = useCallback(async (companyId: string) => {
    return loadCompanyRolesApi(deploymentCompanyIdFor(companyId, "role catalog"));
  }, [deploymentCompanyIdFor]);

  const createCompanyRole = useCallback(async (input: CreateCompanyRoleInput) => {
    const deploymentCompanyId = deploymentCompanyIdFor(input.companyId, "custom role creation");
    return createCompanyRoleApi({ ...input, companyId: deploymentCompanyId });
  }, [deploymentCompanyIdFor]);

  const updateCompanyRole = useCallback(async (input: UpdateCompanyRoleInput) => {
    const deploymentCompanyId = deploymentCompanyIdFor(input.companyId, "custom role update");
    return updateCompanyRoleApi({ ...input, companyId: deploymentCompanyId });
  }, [deploymentCompanyIdFor]);

  const archiveCompanyRole = useCallback(async (companyId: string, roleKey: string) => {
    return archiveCompanyRoleApi(deploymentCompanyIdFor(companyId, "custom role archive"), roleKey);
  }, [deploymentCompanyIdFor]);

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
      isRefreshing,
      refreshError,
      sessionExpiredNotice,
      can: (permission) => hasPermission(access.permissions, permission),
      refreshAccess,
      selectCompany,
      enterGuestMode,
      signOut,
      createCompany,
      authorizeCompanyMemberEmail,
      updateCompany,
      inviteCompanyMember,
      revokeCompanyInvitation,
      updateCompanyInvitationPermissions,
      updateCompanyMember,
      updateCompanyMemberPermissions,
      loadCompanyRoles,
      createCompanyRole,
      updateCompanyRole,
      archiveCompanyRole,
      loadCompanyMembers,
      loadCompanyInvitations,
      loadCompanyPermissionCatalog,
      loadCompanyAccessAudit,
    };
  }, [access, archiveCompanyRole, authResolved, authorizeCompanyMemberEmail, createCompany, createCompanyRole, enterGuestMode, guestMode, inviteCompanyMember, isRefreshing, isSwitching, loadCompanyAccessAudit, loadCompanyInvitations, loadCompanyMembers, loadCompanyPermissionCatalog, loadCompanyRoles, refreshAccess, refreshError, revokeCompanyInvitation, selectCompany, session, sessionExpiredNotice, signOut, updateCompany, updateCompanyInvitationPermissions, updateCompanyMember, updateCompanyMemberPermissions, updateCompanyRole]);

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
