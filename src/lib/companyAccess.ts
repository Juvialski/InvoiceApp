import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { hasPermission, normalizePermissionKeys, type PermissionKey } from "../utils/accessControl.ts";
import { BRAND } from "../config/brand.ts";
import { supabase } from "./supabase.ts";

export const COMPANY_ACCESS_RPC = "get_my_company_access";
export const BOOTSTRAP_PLATFORM_ADMIN_RPC = "bootstrap_platform_admin";
export const CLAIM_COMPANY_INVITATIONS_RPC = "claim_company_invitations";
export const AUTHORIZE_COMPANY_MEMBER_EMAIL_RPC = "authorize_company_member_email";
export const UPDATE_COMPANY_INVITATION_PERMISSIONS_RPC = "update_company_invitation_permissions";
export const PLATFORM_CREATE_COMPANY_RPC = "platform_create_company";
export const PLATFORM_UPDATE_COMPANY_RPC = "platform_update_company";
export const PLATFORM_INVITE_MEMBER_RPC = "platform_invite_company_member";
export const PLATFORM_UPDATE_MEMBER_RPC = "platform_update_company_member";
export const PLATFORM_LIST_MEMBERS_RPC = "platform_list_company_members";
export const PLATFORM_LIST_MEMBER_DIRECTORY_RPC = "platform_list_company_member_directory";
export const PLATFORM_LIST_AUDIT_RPC = "platform_list_access_audit";
export const PLATFORM_LIST_INVITATIONS_RPC = "platform_list_company_invitations";
export const PLATFORM_LIST_INVITATIONS_WITH_OVERRIDES_RPC = "platform_list_company_invitations_with_overrides";
export const PLATFORM_LIST_PERMISSION_CATALOG_RPC = "platform_list_company_permission_catalog";
export const PLATFORM_UPDATE_MEMBER_PERMISSIONS_RPC = "platform_update_company_member_permissions";
export const REVOKE_INVITATION_RPC = "revoke_company_invitation";

export type CompanyStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED" | (string & {});
export type MembershipStatus = "ACTIVE" | "SUSPENDED" | "REVOKED" | (string & {});
export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED" | (string & {});
export type InvitationDeliveryStatus = "CREATED" | "SENT" | "FAILED" | (string & {});
export type PermissionOverrideEffect = "GRANT" | "DENY";

export interface CompanySummary {
  id: string;
  name: string;
  companyCode?: string;
  status: CompanyStatus;
  defaultCurrency?: string;
  timezone?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CompanyMemberSummary {
  id?: string;
  companyId: string;
  userId?: string;
  email?: string;
  displayName?: string;
  roleKey?: string;
  status: MembershipStatus;
  joinedAt?: string;
  updatedAt?: string;
  rolePermissions: PermissionKey[];
  effectivePermissions: PermissionKey[];
  permissionOverrides: CompanyMemberPermissionOverride[];
}

export interface CompanyMemberPermissionOverride {
  id?: string;
  companyId?: string;
  membershipId?: string;
  permissionKey: PermissionKey;
  effect: PermissionOverrideEffect;
  createdAt?: string;
  updatedAt?: string;
}

export interface CompanyPermissionCatalogEntry {
  permissionKey: PermissionKey;
  description?: string;
  memberAssignable: boolean;
}

export interface CompanyInvitationSummary {
  id?: string;
  companyId: string;
  email?: string;
  roleKey?: string;
  status: InvitationStatus;
  deliveryStatus?: InvitationDeliveryStatus;
  deliveryError?: string;
  sentAt?: string;
  createdAt?: string;
  expiresAt?: string;
  updatedAt?: string;
  permissionOverrides: CompanyMemberPermissionOverride[];
}

export interface CompanyMembership {
  id?: string;
  companyId: string;
  userId?: string;
  roleKey?: string;
  status: MembershipStatus;
  permissions: PermissionKey[];
  rolePermissions?: PermissionKey[];
  permissionOverrides?: CompanyMemberPermissionOverride[];
  joinedAt?: string;
  updatedAt?: string;
}

export type CompanyAccessStatus = "loading" | "refreshing" | "ready" | "no-company" | "company-suspended" | "error" | "signed-out" | "guest";

export interface CompanyAccessSnapshot {
  status: CompanyAccessStatus;
  userId?: string;
  email?: string;
  isPlatformOwner: boolean;
  companies: CompanySummary[];
  memberships: CompanyMembership[];
  activeCompanyId: string | null;
  permissions: PermissionKey[];
  error?: string;
}

export interface CreateCompanyInput {
  name: string;
  companyCode?: string;
  defaultCurrency?: string;
  timezone?: string;
}

export interface InviteCompanyMemberInput {
  companyId: string;
  email: string;
  roleKey: string;
  expiresAt?: string;
  permissionOverrides?: CompanyMemberPermissionOverride[];
}

export interface UpdateCompanyMemberInput {
  companyId: string;
  userId?: string;
  membershipId?: string;
  roleKey?: string;
  status?: MembershipStatus;
}

export interface UpdateCompanyMemberPermissionsInput {
  companyId: string;
  membershipId: string;
  overrides: Array<Pick<CompanyMemberPermissionOverride, "permissionKey" | "effect">>;
}

export interface UpdateCompanyInvitationPermissionsInput {
  companyId: string;
  invitationId: string;
  overrides: Array<Pick<CompanyMemberPermissionOverride, "permissionKey" | "effect">>;
}

export interface CompanyAccessAuditEntry {
  id?: string;
  companyId?: string;
  actorUserId?: string;
  actorEmail?: string;
  action: string;
  targetUserId?: string;
  targetEmail?: string;
  details?: Record<string, unknown>;
  createdAt?: string;
}

function requireSupabaseClient(client: SupabaseClient | null = supabase) {
  if (!client) throw new Error("Supabase is not configured.");
  return client;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

function firstPresent(source: Record<string, any>, ...keys: string[]) {
  for (const key of keys) if (source[key] !== undefined && source[key] !== null) return source[key];
  return undefined;
}

function companyFromRecord(value: unknown): CompanySummary | null {
  const row = record(value);
  const id = text(firstPresent(row, "id", "company_id", "companyId"));
  if (!id) return null;
  return {
    id,
    name: text(firstPresent(row, "name", "company_name", "companyName")) || "Company",
    companyCode: text(firstPresent(row, "company_code", "companyCode", "code")),
    status: (text(firstPresent(row, "status", "company_status", "companyStatus")) || "ACTIVE").toUpperCase() as CompanyStatus,
    defaultCurrency: text(firstPresent(row, "default_currency", "defaultCurrency")),
    timezone: text(firstPresent(row, "timezone")),
    createdAt: text(firstPresent(row, "created_at", "createdAt")),
    updatedAt: text(firstPresent(row, "updated_at", "updatedAt")),
  };
}

function membershipFromRecord(value: unknown, permissionsByCompany: Record<string, unknown> = {}): CompanyMembership | null {
  const row = record(value);
  const nestedCompany = companyFromRecord(firstPresent(row, "company", "companies"));
  const companyId = text(firstPresent(row, "company_id", "companyId")) || nestedCompany?.id;
  if (!companyId) return null;
  const permissions = firstPresent(row, "permissions", "permission_keys", "permissionKeys", "role_permissions")
    ?? permissionsByCompany[companyId]
    ?? [];
  const rolePermissions = normalizePermissionKeys(firstPresent(row, "role_permissions", "rolePermissions"));
  return {
    id: text(firstPresent(row, "id", "membership_id", "membershipId")),
    companyId,
    userId: text(firstPresent(row, "user_id", "userId")),
    roleKey: text(firstPresent(row, "role_key", "roleKey", "role")),
    status: (text(firstPresent(row, "status", "membership_status", "membershipStatus")) || "ACTIVE").toUpperCase() as MembershipStatus,
    permissions: normalizePermissionKeys(permissions),
    rolePermissions: rolePermissions.length ? rolePermissions : normalizePermissionKeys(firstPresent(row, "permissions", "permission_keys", "permissionKeys")),
    permissionOverrides: permissionOverridesFromRecord(firstPresent(row, "permission_overrides", "permissionOverrides")),
    joinedAt: text(firstPresent(row, "joined_at", "joinedAt", "created_at", "createdAt")),
    updatedAt: text(firstPresent(row, "updated_at", "updatedAt")),
  };
}

function permissionOverrideFromRecord(value: unknown): CompanyMemberPermissionOverride | null {
  const row = record(value);
  const permissionKey = text(firstPresent(row, "permission_key", "permissionKey"));
  const effect = text(firstPresent(row, "effect"))?.toUpperCase();
  if (!permissionKey || (effect !== "GRANT" && effect !== "DENY")) return null;
  return {
    id: text(firstPresent(row, "id")),
    companyId: text(firstPresent(row, "company_id", "companyId")),
    membershipId: text(firstPresent(row, "membership_id", "membershipId")),
    permissionKey: permissionKey.toLowerCase() as PermissionKey,
    effect,
    createdAt: text(firstPresent(row, "created_at", "createdAt")),
    updatedAt: text(firstPresent(row, "updated_at", "updatedAt")),
  };
}

function permissionOverridesFromRecord(value: unknown): CompanyMemberPermissionOverride[] {
  return array(value).map(permissionOverrideFromRecord).filter((item): item is CompanyMemberPermissionOverride => Boolean(item));
}

function unwrapRpcPayload(value: unknown): Record<string, any> {
  if (Array.isArray(value)) return record(value[0]);
  return record(value);
}

/** Normalize the server response so the rest of the frontend has one contract. */
export function normalizeCompanyAccessPayload(payload: unknown, user?: Pick<User, "id" | "email"> | null): CompanyAccessSnapshot {
  const responseRows = array(payload);
  const rowShape = responseRows.length > 0 && responseRows.some((item) => {
    const row = record(item);
    return row.company_id !== undefined || row.is_platform_admin !== undefined || row.membership_id !== undefined;
  });

  if (rowShape) {
    const companies = new Map<string, CompanySummary>();
    const memberships: CompanyMembership[] = [];
    for (const item of responseRows) {
      const row = record(item);
      const company = companyFromRecord(row);
      if (company) companies.set(company.id, company);
      if (text(firstPresent(row, "membership_id", "membershipId", "id")) && text(firstPresent(row, "company_id", "companyId"))) {
        const membership = membershipFromRecord(row);
        if (membership) memberships.push(membership);
      }
    }
    const status: CompanyAccessStatus = memberships.some((membership) => membership.status === "ACTIVE")
      ? "ready"
      : memberships.some((membership) => membership.status === "SUSPENDED" && companies.get(membership.companyId)?.status === "SUSPENDED")
        ? "company-suspended"
        : "no-company";
    return {
      status,
      userId: user?.id,
      email: user?.email || undefined,
      isPlatformOwner: false,
      companies: [...companies.values()],
      memberships,
      activeCompanyId: null,
      permissions: [],
    };
  }

  const raw = unwrapRpcPayload(payload);
  const rawCompanies = array(firstPresent(raw, "companies", "accessible_companies", "accessibleCompanies"));
  const rawMemberships = array(firstPresent(raw, "memberships", "company_members", "companyMembers"));
  const permissionsByCompany = record(firstPresent(raw, "permissions_by_company", "permissionsByCompany"));

  const companies = new Map<string, CompanySummary>();
  for (const item of rawCompanies) {
    const company = companyFromRecord(item);
    if (company) companies.set(company.id, company);
  }
  const memberships = rawMemberships.map((item) => {
    const membership = membershipFromRecord(item, permissionsByCompany);
    const nestedCompany = companyFromRecord(firstPresent(record(item), "company", "companies"));
    if (nestedCompany) companies.set(nestedCompany.id, nestedCompany);
    return membership;
  }).filter((item): item is CompanyMembership => Boolean(item));

  if (!memberships.length) {
    for (const item of rawCompanies) {
      const membership = membershipFromRecord(item, permissionsByCompany);
      if (membership) memberships.push(membership);
    }
  }

  const status: CompanyAccessStatus = memberships.some((membership) => membership.status === "ACTIVE")
    ? "ready"
    : memberships.some((membership) => membership.status === "SUSPENDED" && companies.get(membership.companyId)?.status === "SUSPENDED")
      ? "company-suspended"
      : "no-company";

  return {
    status,
    userId: user?.id,
    email: user?.email || undefined,
    isPlatformOwner: false,
    companies: [...companies.values()],
    memberships,
    activeCompanyId: null,
    permissions: [],
  };
}
export function permissionsForCompany(snapshot: Pick<CompanyAccessSnapshot, "memberships">, companyId: string | null | undefined): PermissionKey[] {
  if (!companyId) return [];
  const membership = snapshot.memberships.find((item) => item.companyId === companyId && item.status === "ACTIVE");
  return membership ? [...membership.permissions] : [];
}

export function canManageCompany(snapshot: Pick<CompanyAccessSnapshot, "companies" | "memberships">, companyId: string): boolean {
  const company = snapshot.companies.find((item) => item.id === companyId);
  const membership = snapshot.memberships.find((item) => item.companyId === companyId && item.status === "ACTIVE");
  return Boolean(company && membership && hasPermission(membership.permissions, "company.members.manage"));
}

export function canOpenCompanyWorkspace(snapshot: Pick<CompanyAccessSnapshot, "companies" | "memberships">, companyId: string): boolean {
  const company = snapshot.companies.find((item) => item.id === companyId);
  if (!company || company.status.toUpperCase() !== "ACTIVE") return false;
  return snapshot.memberships.some((item) => item.companyId === companyId && item.status === "ACTIVE");
}

/** @deprecated Use canOpenCompanyWorkspace for workspace selection semantics. */
export function companyIsSelectable(snapshot: Pick<CompanyAccessSnapshot, "companies" | "memberships">, companyId: string): boolean {
  return canOpenCompanyWorkspace(snapshot, companyId);
}

export async function bootstrapPlatformAdmin(client: SupabaseClient | null = supabase) {
  const { data, error } = await requireSupabaseClient(client).rpc(BOOTSTRAP_PLATFORM_ADMIN_RPC);
  if (error) throw error;
  return data === true;
}
export async function claimCompanyInvitations(client: SupabaseClient | null = supabase) {
  const { data, error } = await requireSupabaseClient(client).rpc(CLAIM_COMPANY_INVITATIONS_RPC);
  if (error) throw error;
  return data;
}

export async function loadCompanyAccess(client: SupabaseClient | null = supabase): Promise<CompanyAccessSnapshot> {
  const activeClient = requireSupabaseClient(client);
  const { data: userData, error: userError } = await activeClient.auth.getUser();
  if (userError || !userData.user) throw new Error("Your session is no longer active. Please sign in again.");
  await claimCompanyInvitations(activeClient);
  const { data, error } = await activeClient.rpc(COMPANY_ACCESS_RPC);
  if (error) throw error;
  return normalizeCompanyAccessPayload(data, userData.user);
}

function unwrapRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : value ? [value as T] : [];
}

function memberFromRecord(value: unknown): CompanyMemberSummary {
  const row = record(value);
  return {
    id: text(firstPresent(row, "id", "membership_id", "membershipId")),
    companyId: text(firstPresent(row, "company_id", "companyId")) || "",
    userId: text(firstPresent(row, "user_id", "userId")),
    email: text(firstPresent(row, "email", "normalized_email", "normalizedEmail")),
    displayName: text(firstPresent(row, "display_name", "displayName", "full_name", "fullName")),
    roleKey: text(firstPresent(row, "role_key", "roleKey", "role")),
    status: (text(firstPresent(row, "status", "membership_status", "membershipStatus")) || "ACTIVE").toUpperCase() as MembershipStatus,
    joinedAt: text(firstPresent(row, "joined_at", "joinedAt", "created_at", "createdAt")),
    updatedAt: text(firstPresent(row, "updated_at", "updatedAt")),
    rolePermissions: normalizePermissionKeys(firstPresent(row, "role_permissions", "rolePermissions")),
    effectivePermissions: normalizePermissionKeys(firstPresent(row, "effective_permissions", "effectivePermissions", "permissions")),
    permissionOverrides: permissionOverridesFromRecord(firstPresent(row, "permission_overrides", "permissionOverrides")),
  };
}

function invitationFromRecord(value: unknown): CompanyInvitationSummary {
  const row = record(value);
  return {
    id: text(firstPresent(row, "id", "invitation_id", "invitationId")),
    companyId: text(firstPresent(row, "company_id", "companyId")) || "",
    email: text(firstPresent(row, "normalized_email", "email")),
    roleKey: text(firstPresent(row, "role_key", "roleKey")),
    status: (text(firstPresent(row, "status", "invitation_status", "invitationStatus")) || "PENDING").toUpperCase() as InvitationStatus,
    deliveryStatus: (text(firstPresent(row, "delivery_status", "deliveryStatus")) || "CREATED").toUpperCase() as InvitationDeliveryStatus,
    deliveryError: text(firstPresent(row, "delivery_error", "deliveryError")),
    sentAt: text(firstPresent(row, "sent_at", "sentAt")),
    createdAt: text(firstPresent(row, "created_at", "createdAt")),
    expiresAt: text(firstPresent(row, "expires_at", "expiresAt")),
    updatedAt: text(firstPresent(row, "updated_at", "updatedAt")),
    permissionOverrides: permissionOverridesFromRecord(firstPresent(row, "permission_overrides", "permissionOverrides")),
  };
}

export async function createCompany(input: CreateCompanyInput, client: SupabaseClient | null = supabase): Promise<CompanySummary> {
  const { data, error } = await requireSupabaseClient(client).rpc(PLATFORM_CREATE_COMPANY_RPC, {
    p_name: input.name.trim(),
    p_company_code: input.companyCode?.trim() || null,
    p_default_currency: input.defaultCurrency?.trim().toUpperCase() || "PHP",
    p_timezone: input.timezone?.trim() || "Asia/Manila",
  });
  if (error) throw error;
  const company = companyFromRecord(unwrapRpcPayload(data));
  if (!company) throw new Error("The company was created but its access record was not returned.");
  return company;
}

export async function updateCompany(companyId: string, patch: Partial<Pick<CompanySummary, "name" | "companyCode" | "status" | "defaultCurrency" | "timezone">>, client: SupabaseClient | null = supabase): Promise<CompanySummary> {
  const { data, error } = await requireSupabaseClient(client).rpc(PLATFORM_UPDATE_COMPANY_RPC, {
    p_company_id: companyId,
    p_name: patch.name?.trim(),
    p_company_code: patch.companyCode?.trim(),
    p_status: patch.status,
    p_default_currency: patch.defaultCurrency?.trim().toUpperCase(),
    p_timezone: patch.timezone?.trim(),
  });
  if (error) throw error;
  const company = companyFromRecord(unwrapRpcPayload(data));
  if (!company) throw new Error("The company update did not return a company record.");
  return company;
}

export async function authorizeCompanyMemberEmail(input: InviteCompanyMemberInput, client: SupabaseClient | null = supabase) {
  const { data, error } = await requireSupabaseClient(client).rpc(AUTHORIZE_COMPANY_MEMBER_EMAIL_RPC, {
    p_company_id: input.companyId,
    p_email: input.email.trim().toLowerCase(),
    p_role_key: input.roleKey,
    p_permission_overrides: input.permissionOverrides?.map((override) => ({ permission_key: override.permissionKey, effect: override.effect })) || [],
    p_expires_at: input.expiresAt || null,
  });
  if (error) throw error;
  return unwrapRpcPayload(data);
}

/** Compatibility alias for callers that still use the old invitation name. */
export const inviteCompanyMember = authorizeCompanyMemberEmail;

export async function updateCompanyMember(input: UpdateCompanyMemberInput, client: SupabaseClient | null = supabase) {
  const { data, error } = await requireSupabaseClient(client).rpc(PLATFORM_UPDATE_MEMBER_RPC, {
    p_company_id: input.companyId,
    p_user_id: input.userId || null,
    p_membership_id: input.membershipId || null,
    p_role_key: input.roleKey || null,
    p_status: input.status || null,
  });
  if (error) throw error;
  return unwrapRpcPayload(data);
}

export async function updateCompanyMemberPermissions(input: UpdateCompanyMemberPermissionsInput, client: SupabaseClient | null = supabase) {
  const { data, error } = await requireSupabaseClient(client).rpc(PLATFORM_UPDATE_MEMBER_PERMISSIONS_RPC, {
    p_company_id: input.companyId,
    p_membership_id: input.membershipId,
    p_overrides: input.overrides.map((override) => ({ permission_key: override.permissionKey, effect: override.effect })),
  });
  if (error) throw error;
  return unwrapRpcPayload(data);
}

export async function updateCompanyInvitationPermissions(input: UpdateCompanyInvitationPermissionsInput, client: SupabaseClient | null = supabase) {
  const { data, error } = await requireSupabaseClient(client).rpc(UPDATE_COMPANY_INVITATION_PERMISSIONS_RPC, {
    p_company_id: input.companyId,
    p_invitation_id: input.invitationId,
    p_overrides: input.overrides.map((override) => ({ permission_key: override.permissionKey, effect: override.effect })),
  });
  if (error) throw error;
  return unwrapRpcPayload(data);
}

export async function revokeCompanyInvitation(invitationId: string, companyId: string, client: SupabaseClient | null = supabase) {
  const deploymentCompanyId = companyId.trim();
  if (!deploymentCompanyId) throw new Error("The deployment company is required to revoke an invitation.");
  const { data, error } = await requireSupabaseClient(client).rpc(REVOKE_INVITATION_RPC, { p_invitation_id: invitationId });
  if (error) throw error;
  const invitation = unwrapRpcPayload(data);
  const returnedCompanyId = text(firstPresent(invitation, "company_id", "companyId"));
  if (returnedCompanyId && returnedCompanyId !== deploymentCompanyId) throw new Error(`The invitation is outside this ${BRAND.productName} deployment.`);
  return invitation;
}

export async function loadCompanyMembers(companyId: string, client: SupabaseClient | null = supabase): Promise<CompanyMemberSummary[]> {
  const { data, error } = await requireSupabaseClient(client).rpc(PLATFORM_LIST_MEMBER_DIRECTORY_RPC, { p_company_id: companyId });
  if (error) throw error;
  return unwrapRows<unknown>(data).map(memberFromRecord).filter((member) => member.companyId === companyId || !member.companyId);
}

export async function loadCompanyInvitations(companyId: string, client: SupabaseClient | null = supabase): Promise<CompanyInvitationSummary[]> {
  const { data, error } = await requireSupabaseClient(client).rpc(PLATFORM_LIST_INVITATIONS_WITH_OVERRIDES_RPC, { p_company_id: companyId });
  if (error) throw error;
  return unwrapRows<unknown>(data).map(invitationFromRecord).filter((invitation) => invitation.companyId === companyId || !invitation.companyId);
}

export async function loadCompanyPermissionCatalog(companyId: string, client: SupabaseClient | null = supabase): Promise<CompanyPermissionCatalogEntry[]> {
  const { data, error } = await requireSupabaseClient(client).rpc(PLATFORM_LIST_PERMISSION_CATALOG_RPC, { p_company_id: companyId });
  if (error) throw error;
  return unwrapRows<unknown>(data).map((value) => {
    const row = record(value);
    return {
      permissionKey: (text(firstPresent(row, "permission_key", "permissionKey")) || "").toLowerCase() as PermissionKey,
      description: text(firstPresent(row, "description")),
      memberAssignable: firstPresent(row, "member_assignable", "memberAssignable") !== false,
    } satisfies CompanyPermissionCatalogEntry;
  }).filter((entry) => Boolean(entry.permissionKey));
}

export async function loadCompanyAccessAudit(companyId: string | undefined, client: SupabaseClient | null = supabase): Promise<CompanyAccessAuditEntry[]> {
  const { data, error } = await requireSupabaseClient(client).rpc(PLATFORM_LIST_AUDIT_RPC, { p_company_id: companyId || null });
  if (error) throw error;
  return unwrapRows<unknown>(data).map((value) => {
    const row = record(value);
    return {
      id: text(firstPresent(row, "id")),
      companyId: text(firstPresent(row, "company_id", "companyId")),
      actorUserId: text(firstPresent(row, "actor_user_id", "actorUserId")),
      actorEmail: text(firstPresent(row, "actor_email", "actorEmail")),
      action: text(firstPresent(row, "action", "event_type", "eventType")) || "Access change",
      targetUserId: text(firstPresent(row, "target_user_id", "targetUserId")),
      targetEmail: text(firstPresent(row, "target_email", "targetEmail")),
      details: record(firstPresent(row, "details", "metadata")),
      createdAt: text(firstPresent(row, "created_at", "createdAt")),
    } satisfies CompanyAccessAuditEntry;
  });
}

export function activeCompanyMembership(snapshot: Pick<CompanyAccessSnapshot, "memberships" | "activeCompanyId">) {
  return snapshot.memberships.find((membership) => membership.companyId === snapshot.activeCompanyId && membership.status === "ACTIVE") || null;
}

export type { Session };
