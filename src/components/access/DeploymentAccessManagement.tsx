import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, KeyRound, Loader2, RefreshCw, Save, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { useCompanyAccess } from "../../context/CompanyAccessContext.tsx";
import type { CompanyInvitationSummary, CompanyMemberPermissionOverride, CompanyMemberSummary, CompanyPermissionCatalogEntry, PermissionOverrideEffect } from "../../lib/companyAccess.ts";
import { isSensitivePermission, permissionDisplayName, permissionGroupDisplayName, permissionGroupKey, PERMISSION_KEYS, roleDisplayName } from "../../utils/accessControl.ts";
import { safeErrorMessage } from "../../utils/errorNormalization.ts";

const ASSIGNABLE_ROLES = ["COMPANY_ADMIN", "FINANCE", "PAYROLL", "VIEWER"] as const;

function displayTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function authorizationStatusLabel(invitation: CompanyInvitationSummary) {
  if (invitation.status === "PENDING") return "Awaiting signup";
  if (invitation.status === "ACCEPTED") return "Access accepted";
  if (invitation.status === "REVOKED") return "Access revoked";
  if (invitation.status === "EXPIRED") return "Authorization expired";
  return invitation.status;
}

function authorizationStatusTone(invitation: CompanyInvitationSummary) {
  if (invitation.status === "ACCEPTED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (invitation.status === "REVOKED" || invitation.status === "EXPIRED") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function overrideMap(overrides: CompanyMemberPermissionOverride[]) {
  return new Map(overrides.map((override) => [override.permissionKey, override.effect]));
}

function permissionGroups(catalog: CompanyPermissionCatalogEntry[]) {
  const groups = new Map<string, CompanyPermissionCatalogEntry[]>();
  for (const entry of catalog) {
    const key = permissionGroupKey(entry.permissionKey);
    const current = groups.get(key) || [];
    current.push(entry);
    groups.set(key, current);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function overridesFromDraft(draft: Record<string, PermissionOverrideEffect | null | undefined>) {
  return Object.entries(draft)
    .filter((entry): entry is [string, PermissionOverrideEffect] => entry[1] === "GRANT" || entry[1] === "DENY")
    .map(([permissionKey, effect]) => ({ permissionKey, effect }));
}

function recordId(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) && typeof (value as { id?: unknown }).id === "string"
    ? (value as { id: string }).id
    : undefined;
}

interface PermissionEditorProps {
  member: CompanyMemberSummary;
  catalog: CompanyPermissionCatalogEntry[];
  draft: Record<string, PermissionOverrideEffect | null | undefined>;
  onChange: (permissionKey: string, effect: PermissionOverrideEffect | undefined) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

function PermissionEditor({ member, catalog, draft, onChange, onSave, onCancel, saving }: PermissionEditorProps) {
  const storedOverrides = overrideMap(member.permissionOverrides);
  const groups = permissionGroups(catalog);
  const effectiveCount = member.status === "ACTIVE" ? member.effectivePermissions.length : 0;

  return (
    <div id={`permission-editor-${member.id}`} className="border-t border-indigo-100 bg-indigo-50/40 px-3 py-4 sm:px-4" data-permission-editor={member.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-900">Permission customization</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Role defaults remain the baseline. Custom grants add access and custom denies remove a role default. Reserved administration permissions stay role-controlled.</p>
        </div>
        <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600">{effectiveCount} effective permission{effectiveCount === 1 ? "" : "s"}</span>
      </div>

      {member.status !== "ACTIVE" && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">This membership is {member.status.toLowerCase()}; all effective access remains denied until it is active.</div>}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {groups.map(([group, entries]) => (
          <section key={group} className="rounded-xl border border-slate-200 bg-white p-3.5" aria-labelledby={`permission-group-${member.id}-${group}`}>
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h4 id={`permission-group-${member.id}-${group}`} className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{permissionGroupDisplayName(group)}</h4>
              <span className="text-[10px] font-semibold text-slate-400">{entries.length} option{entries.length === 1 ? "" : "s"}</span>
            </div>
            <div className="space-y-2">
              {entries.map((entry) => {
                const storedEffect = storedOverrides.get(entry.permissionKey);
                const hasDraft = Object.prototype.hasOwnProperty.call(draft, entry.permissionKey);
                const effect = hasDraft ? draft[entry.permissionKey] : storedEffect;
                const roleDefault = member.rolePermissions.includes(entry.permissionKey);
                const effective = member.status === "ACTIVE" && (effect === "GRANT" || (effect !== "DENY" && roleDefault));
                return (
                  <div key={entry.permissionKey} className={`rounded-lg border px-3 py-2.5 ${isSensitivePermission(entry.permissionKey) ? "border-amber-200 bg-amber-50/45" : "border-slate-100 bg-slate-50/50"}`}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800">{permissionDisplayName(entry.permissionKey)}</p>
                        <p className="truncate text-[10px] text-slate-400" title={entry.permissionKey}>{entry.permissionKey}</p>
                        {entry.description && <p className="mt-1 text-xs leading-4 text-slate-500">{entry.description}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`text-[10px] font-bold ${effective ? "text-emerald-700" : "text-slate-400"}`}>{effective ? "Effective" : "No access"}</span>
                        {entry.memberAssignable ? <select aria-label={`${permissionDisplayName(entry.permissionKey)} override`} value={effect || ""} onChange={(event) => onChange(entry.permissionKey, (event.target.value || undefined) as PermissionOverrideEffect | undefined)} disabled={saving} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60">
                          <option value="">Role default</option>
                          <option value="GRANT">Custom grant</option>
                          <option value="DENY">Custom deny</option>
                        </select> : <span className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-400">Role-controlled</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {groups.length === 0 && <p className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-4 text-xs text-slate-500">No permission catalog entries were returned.</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><X className="h-3.5 w-3.5" />Cancel</button>
        <button type="button" onClick={onSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-3.5 w-3.5" />{saving ? "Saving…" : "Save permissions"}</button>
      </div>
    </div>
  );
}

interface AuthorizationPermissionPickerProps {
  catalog: CompanyPermissionCatalogEntry[];
  draft: Record<string, PermissionOverrideEffect | null | undefined>;
  onChange: (permissionKey: string, effect: PermissionOverrideEffect | undefined) => void;
  saving: boolean;
}

function AuthorizationPermissionPicker({ catalog, draft, onChange, saving }: AuthorizationPermissionPickerProps) {
  const groups = permissionGroups(catalog);
  return (
    <div id="authorization-permission-picker" className="mt-3 rounded-xl border border-indigo-100 bg-white p-3" data-authorization-permission-picker>
      <p className="text-xs font-black text-slate-900">Optional permission overrides</p>
      <p className="mt-1 text-[10px] leading-4 text-slate-500">Role defaults remain the baseline. Reserved administration permissions cannot be manufactured as individual overrides.</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {groups.map(([group, entries]) => (
          <section key={group} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3" aria-label={`${permissionGroupDisplayName(group)} access overrides`}>
            <h4 className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{permissionGroupDisplayName(group)}</h4>
            <div className="mt-2 space-y-2">
              {entries.map((entry) => {
                const effect = draft[entry.permissionKey];
                return <div key={entry.permissionKey} className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><p className="text-xs font-bold text-slate-800">{permissionDisplayName(entry.permissionKey)}</p><p className="truncate text-[10px] text-slate-400" title={entry.permissionKey}>{entry.permissionKey}</p></div>
                  {entry.memberAssignable ? <select aria-label={`${permissionDisplayName(entry.permissionKey)} authorization override`} value={effect || ""} onChange={(event) => onChange(entry.permissionKey, (event.target.value || undefined) as PermissionOverrideEffect | undefined)} disabled={saving} className="min-h-8 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-700 disabled:opacity-60"><option value="">Role default</option><option value="GRANT">Custom grant</option><option value="DENY">Custom deny</option></select> : <span className="self-start rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-bold text-slate-400 sm:self-auto">Role-controlled</span>}
                </div>;
              })}
            </div>
          </section>
        ))}
      </div>
      {groups.length === 0 && <p className="mt-3 text-xs text-slate-500">No assignable permission catalog entries were returned.</p>}
    </div>
  );
}

interface PendingPermissionEditorProps {
  invitation: CompanyInvitationSummary;
  catalog: CompanyPermissionCatalogEntry[];
  draft: Record<string, PermissionOverrideEffect | null | undefined>;
  onChange: (permissionKey: string, effect: PermissionOverrideEffect | undefined) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

function PendingPermissionEditor({ invitation, catalog, draft, onChange, onSave, onCancel, saving }: PendingPermissionEditorProps) {
  const storedOverrides = overrideMap(invitation.permissionOverrides);
  const groups = permissionGroups(catalog);
  return <div id={`access-authorization-editor-${invitation.id}`} className="border-t border-indigo-100 bg-indigo-50/40 px-3 py-4 sm:px-4" data-access-authorization-editor={invitation.id}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black text-slate-900">Pending access permissions</p><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">The selected {roleDisplayName(invitation.roleKey)} role remains the baseline. Save optional grants or denies before the user signs up.</p></div><span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600">{invitation.permissionOverrides.length} custom override{invitation.permissionOverrides.length === 1 ? "" : "s"}</span></div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">{groups.map(([group, entries]) => <section key={group} className="rounded-xl border border-slate-200 bg-white p-3.5" aria-label={`${permissionGroupDisplayName(group)} pending access`}><div className="mb-2.5 flex items-center justify-between gap-2"><h4 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{permissionGroupDisplayName(group)}</h4><span className="text-[10px] font-semibold text-slate-400">{entries.length} option{entries.length === 1 ? "" : "s"}</span></div><div className="space-y-2">{entries.map((entry) => { const storedEffect = storedOverrides.get(entry.permissionKey); const hasDraft = Object.prototype.hasOwnProperty.call(draft, entry.permissionKey); const effect = hasDraft ? draft[entry.permissionKey] : storedEffect; return <div key={entry.permissionKey} className={`rounded-lg border px-3 py-2.5 ${isSensitivePermission(entry.permissionKey) ? "border-amber-200 bg-amber-50/45" : "border-slate-100 bg-slate-50/50"}`}><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-xs font-bold text-slate-800">{permissionDisplayName(entry.permissionKey)}</p><p className="truncate text-[10px] text-slate-400" title={entry.permissionKey}>{entry.permissionKey}</p>{entry.description && <p className="mt-1 text-xs leading-4 text-slate-500">{entry.description}</p>}</div>{entry.memberAssignable ? <select aria-label={`${permissionDisplayName(entry.permissionKey)} pending override`} value={effect || ""} onChange={(event) => onChange(entry.permissionKey, (event.target.value || undefined) as PermissionOverrideEffect | undefined)} disabled={saving} className="min-h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-60"><option value="">Role default</option><option value="GRANT">Custom grant</option><option value="DENY">Custom deny</option></select> : <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-400">Role-controlled</span>}</div></div>; })}</div></section>)}</div>
    {groups.length === 0 && <p className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-4 text-xs text-slate-500">No permission catalog entries were returned.</p>}
    <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={onCancel} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><X className="h-3.5 w-3.5" />Cancel</button><button type="button" onClick={onSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><Save className="h-3.5 w-3.5" />{saving ? "Saving…" : "Save permissions"}</button></div>
  </div>;
}

export function DeploymentAccessManagement() {
  const companyAccess = useCompanyAccess();
  const company = companyAccess.activeCompany;
  const canRead = companyAccess.can(PERMISSION_KEYS.accessRead) || companyAccess.can(PERMISSION_KEYS.accessManage);
  const canManage = companyAccess.can(PERMISSION_KEYS.accessManage);
  const currentUserId = companyAccess.session?.user?.id;
  const [members, setMembers] = useState<CompanyMemberSummary[]>([]);
  const [invitations, setInvitations] = useState<CompanyInvitationSummary[]>([]);
  const [catalog, setCatalog] = useState<CompanyPermissionCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [expandedInvitationId, setExpandedInvitationId] = useState<string | null>(null);
  const [draftOverrides, setDraftOverrides] = useState<Record<string, Record<string, PermissionOverrideEffect | null | undefined>>>({});
  const [draftInvitationOverrides, setDraftInvitationOverrides] = useState<Record<string, Record<string, PermissionOverrideEffect | null | undefined>>>({});
  const [authorizationOverrides, setAuthorizationOverrides] = useState<Record<string, PermissionOverrideEffect | null | undefined>>({});
  const [showAuthorizationPermissions, setShowAuthorizationPermissions] = useState(false);
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState<string>("VIEWER");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!company || !canRead) return;
    setLoading(true);
    try {
      const [memberRows, invitationRows, permissionRows] = await Promise.all([
        companyAccess.loadCompanyMembers(company.id),
        companyAccess.loadCompanyInvitations(company.id),
        companyAccess.loadCompanyPermissionCatalog(company.id),
      ]);
      setMembers(memberRows);
      setInvitations(invitationRows);
      setCatalog(permissionRows);
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error, "Company access records could not be loaded.") });
    } finally {
      setLoading(false);
    }
  }, [canRead, company?.id, companyAccess.loadCompanyInvitations, companyAccess.loadCompanyMembers, companyAccess.loadCompanyPermissionCatalog]);

  useEffect(() => { void load(); }, [load]);

  const pendingInvitations = useMemo(() => invitations.filter((item) => item.status === "PENDING"), [invitations]);
  const historicalInvitations = useMemo(() => invitations.filter((item) => item.status !== "PENDING"), [invitations]);

  if (!company || !canRead) return null;

  const authorizeEmail = async () => {
    if (!canManage || !email.trim()) return;
    const normalizedEmail = email.trim().toLowerCase();
    setBusy("authorize");
    setNotice(null);
    try {
      const result = await companyAccess.authorizeCompanyMemberEmail({
        companyId: company.id,
        email: normalizedEmail,
        roleKey,
        permissionOverrides: overridesFromDraft(authorizationOverrides),
      });
      const authorizationId = recordId(result);
      setEmail("");
      setAuthorizationOverrides({});
      setShowAuthorizationPermissions(false);
      setNotice({ kind: "success", message: `Access authorized for ${normalizedEmail}. Ask this user to sign up using this exact email address.` });
      await load();
      if (authorizationId) setExpandedInvitationId(authorizationId);
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error, "The email access authorization could not be created.") });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const updateMember = async (member: CompanyMemberSummary, patch: { roleKey?: string; status?: "ACTIVE" | "SUSPENDED" | "REVOKED" }) => {
    if (!canManage || !member.id || member.userId === currentUserId) return;
    if (patch.status === "SUSPENDED" || patch.status === "REVOKED") {
      const action = patch.status === "SUSPENDED" ? "Suspend" : "Revoke";
      const detail = patch.status === "SUSPENDED"
        ? "The member will lose active company access until reactivated."
        : "The member will lose company access and must be explicitly restored by an authorized manager.";
      if (!window.confirm(`${action} ${member.displayName || member.email || "this member"}?\n\n${detail}`)) return;
    }
    const actionKey = `${member.id}:${patch.roleKey || patch.status}`;
    setBusy(actionKey);
    setNotice(null);
    try {
      await companyAccess.updateCompanyMember({ companyId: company.id, membershipId: member.id, userId: member.userId, ...patch });
      setNotice({ kind: "success", message: "Member access updated." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error, "The member update could not be saved.") });
    } finally {
      setBusy(null);
    }
  };

  const toggleMemberEditor = (member: CompanyMemberSummary) => {
    if (!member.id || !canManage || member.userId === currentUserId) return;
    if (expandedMemberId === member.id) {
      setExpandedMemberId(null);
      return;
    }
    setExpandedInvitationId(null);
    setExpandedMemberId(member.id);
    setDraftOverrides((current) => ({ ...current, [member.id!]: Object.fromEntries(member.permissionOverrides.map((override) => [override.permissionKey, override.effect])) }));
  };

  const saveMemberPermissions = async (member: CompanyMemberSummary) => {
    if (!canManage || !member.id || member.userId === currentUserId) return;
    setBusy(`permissions:${member.id}`);
    setNotice(null);
    try {
      await companyAccess.updateCompanyMemberPermissions({ companyId: company.id, membershipId: member.id, overrides: overridesFromDraft(draftOverrides[member.id] || {}) });
      setExpandedMemberId(null);
      setNotice({ kind: "success", message: "Member permission overrides saved." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error, "Member permission overrides could not be saved.") });
    } finally {
      setBusy(null);
    }
  };

  const toggleInvitationEditor = (invitation: CompanyInvitationSummary) => {
    if (!invitation.id || !canManage) return;
    if (expandedInvitationId === invitation.id) {
      setExpandedInvitationId(null);
      return;
    }
    setExpandedMemberId(null);
    setExpandedInvitationId(invitation.id);
    setDraftInvitationOverrides((current) => ({ ...current, [invitation.id!]: Object.fromEntries(invitation.permissionOverrides.map((override) => [override.permissionKey, override.effect])) }));
  };

  const saveInvitationPermissions = async (invitation: CompanyInvitationSummary) => {
    if (!canManage || !invitation.id) return;
    setBusy(`authorization-permissions:${invitation.id}`);
    setNotice(null);
    try {
      await companyAccess.updateCompanyInvitationPermissions({ companyId: company.id, invitationId: invitation.id, overrides: overridesFromDraft(draftInvitationOverrides[invitation.id] || {}) });
      setExpandedInvitationId(null);
      setNotice({ kind: "success", message: "Pending access permissions saved." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error, "Pending access permissions could not be saved.") });
    } finally {
      setBusy(null);
    }
  };

  const revokeAuthorization = async (invitation: CompanyInvitationSummary) => {
    if (!canManage || !invitation.id) return;
    if (!window.confirm(`Revoke pending access authorization for ${invitation.email}?\n\nThis authorization will no longer grant company access after the user signs up.`)) return;
    setBusy(`revoke:${invitation.id}`);
    setNotice(null);
    try {
      await companyAccess.revokeCompanyInvitation(company.id, invitation.id);
      setExpandedInvitationId(null);
      setNotice({ kind: "success", message: "Pending access authorization revoked. It can no longer grant company access." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error, "The access authorization could not be revoked.") });
    } finally {
      setBusy(null);
    }
  };

  return <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="company-access-title" aria-busy={loading || Boolean(busy)}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Users className="h-5 w-5" /></div><div><p className="text-sm font-black text-slate-950" id="company-access-title">Company access</p><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Manage users and email access authorizations for {company.name}. This deployment cannot grant access to another client company.</p></div></div>
      <button type="button" onClick={() => void load()} disabled={loading || Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className="h-3 w-3" />{loading ? "Refreshing…" : "Refresh"}</button>
    </div>

    {!canManage && <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] leading-5 text-slate-600"><KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" /><span>You can review company access, but only a member with the access-management permission can authorize email access or change roles and overrides.</span></div>}
    {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`mt-4 rounded-lg border px-3 py-2 text-xs leading-5 ${notice.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.message}</div>}

    {canManage && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-black text-slate-800"><UserPlus className="h-4 w-4 text-indigo-600" />Add user access</div>
      <p className="mt-1 text-[10px] leading-4 text-slate-500">Authorize an email to access this Engoryx deployment. The user can sign up using this exact email address. No invitation email is sent.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
        <label className="min-w-0"><span className="sr-only">Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@company.com" aria-label="Email address" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400" /></label>
        <label><span className="sr-only">Role</span><select value={roleKey} onChange={(event) => setRoleKey(event.target.value)} aria-label="Role" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">{ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{roleDisplayName(role)}</option>)}</select></label>
        <button type="button" onClick={() => void authorizeEmail()} disabled={busy === "authorize" || Boolean(busy && busy !== "authorize") || !email.trim()} aria-busy={busy === "authorize"} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{busy === "authorize" ? "Adding…" : "Add access"}</button>
      </div>
      <button type="button" onClick={() => setShowAuthorizationPermissions((visible) => !visible)} className="mt-3 text-[11px] font-bold text-indigo-700 hover:text-indigo-900" aria-expanded={showAuthorizationPermissions} aria-controls="authorization-permission-picker">{showAuthorizationPermissions ? "Hide optional permissions" : "Configure optional permissions before signup"}</button>
      {showAuthorizationPermissions && <AuthorizationPermissionPicker catalog={catalog} draft={authorizationOverrides} onChange={(permissionKey, effect) => setAuthorizationOverrides((current) => ({ ...current, [permissionKey]: effect || null }))} saving={busy === "authorize"} />}
    </div>}

    <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-500">Members and effective permissions</div>
      {loading ? <div className="flex items-center gap-2 px-4 py-5 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading access records…</div> : members.length === 0 ? <p className="px-4 py-5 text-xs text-slate-500">No member records were returned.</p> : <div className="divide-y divide-slate-100">{members.map((member) => {
        const isSelf = member.userId === currentUserId;
        const editorOpen = Boolean(member.id && expandedMemberId === member.id);
        const effective = member.status === "ACTIVE" ? member.effectivePermissions : [];
        return <div key={member.id || member.userId || member.email}>
          <div className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-start">
            <div className="min-w-0"><p className="truncate text-xs font-bold text-slate-900 sm:text-sm">{member.displayName || member.email || "Member"}{isSelf && <span className="ml-1.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-black text-indigo-700">You</span>}</p><p className="truncate text-xs text-slate-500">{member.email || member.userId || ""} · {member.status}</p><p className="mt-1 text-xs leading-5 text-slate-500"><span className="font-bold text-slate-700">Effective:</span> {effective.length ? effective.slice(0, 4).map(permissionDisplayName).join(", ") : "No active access"}{effective.length > 4 ? ` +${effective.length - 4} more` : ""}</p></div>
            <div className="min-w-0">{canManage && member.id && !isSelf ? <select aria-label={`Role for ${member.displayName || member.email || "member"}`} value={member.roleKey || "VIEWER"} disabled={Boolean(busy)} aria-busy={busy?.startsWith(`${member.id}:`)} onChange={(event) => void updateMember(member, { roleKey: event.target.value })} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-60">{ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{roleDisplayName(role)}</option>)}</select> : <span className="text-xs font-semibold text-slate-700">{roleDisplayName(member.roleKey)}</span>}</div>
            <div className="flex flex-wrap gap-1.5 sm:justify-end">{canManage && member.id && !isSelf ? <><button type="button" disabled={Boolean(busy)} onClick={() => toggleMemberEditor(member)} aria-expanded={editorOpen} aria-controls={editorOpen ? `permission-editor-${member.id}` : undefined} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2.5 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50">{editorOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}Permissions</button>{member.status === "ACTIVE" ? <button type="button" disabled={Boolean(busy)} aria-busy={busy === `${member.id}:SUSPENDED`} onClick={() => void updateMember(member, { status: "SUSPENDED" })} className="rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60">{busy === `${member.id}:SUSPENDED` ? "Suspending…" : "Suspend"}</button> : <button type="button" disabled={Boolean(busy)} aria-busy={busy === `${member.id}:ACTIVE`} onClick={() => void updateMember(member, { status: "ACTIVE" })} className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60">{busy === `${member.id}:ACTIVE` ? "Reactivating…" : "Reactivate"}</button>}<button type="button" disabled={Boolean(busy)} aria-busy={busy === `${member.id}:REVOKED`} onClick={() => void updateMember(member, { status: "REVOKED" })} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60">{busy === `${member.id}:REVOKED` ? "Revoking…" : "Revoke"}</button></> : <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-500"><ShieldCheck className="h-3.5 w-3.5" />Own access protected</span>}</div>
          </div>
          {editorOpen && member.id && <PermissionEditor member={member} catalog={catalog} draft={draftOverrides[member.id] || {}} onChange={(permissionKey, effect) => setDraftOverrides((current) => ({ ...current, [member.id!]: { ...(current[member.id!] || {}), [permissionKey]: effect || null } }))} onSave={() => void saveMemberPermissions(member)} onCancel={() => { setExpandedMemberId(null); setDraftOverrides((current) => ({ ...current, [member.id!]: Object.fromEntries(member.permissionOverrides.map((override) => [override.permissionKey, override.effect])) })); }} saving={busy === `permissions:${member.id}`} />}
        </div>;
      })}</div>}
    </div>

    {pendingInvitations.length > 0 && <div className="mt-5 rounded-xl border border-slate-200 p-3.5"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><UserPlus className="h-3.5 w-3.5 text-indigo-600" />Pending access</div><p className="mt-1 text-[10px] leading-4 text-slate-500">A user must sign up and verify this exact email address before Engoryx creates membership.</p><div className="mt-3 space-y-2">{pendingInvitations.map((invitation) => { const editorOpen = Boolean(invitation.id && expandedInvitationId === invitation.id); return <div key={invitation.id || `${invitation.email}:${invitation.roleKey}`} className="rounded-lg border border-slate-100 bg-slate-50/60"><div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{invitation.email}</p><p className="mt-0.5 text-xs text-slate-500">{roleDisplayName(invitation.roleKey)} · Awaiting signup{invitation.expiresAt ? ` · expires ${displayTime(invitation.expiresAt)}` : ""}</p><p className="mt-1 text-[10px] text-slate-500">{invitation.permissionOverrides.length} custom permission override{invitation.permissionOverrides.length === 1 ? "" : "s"}</p></div><div className="flex flex-wrap items-center gap-1.5"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${authorizationStatusTone(invitation)}`}><ShieldCheck className="h-3 w-3" />{authorizationStatusLabel(invitation)}</span>{canManage && invitation.id && <><button type="button" disabled={Boolean(busy)} onClick={() => toggleInvitationEditor(invitation)} aria-expanded={editorOpen} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50">{editorOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}Permissions</button><button type="button" disabled={Boolean(busy)} onClick={() => void revokeAuthorization(invitation)} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-50">{busy === `revoke:${invitation.id}` ? "Revoking…" : "Revoke"}</button></>}</div></div>{editorOpen && invitation.id && <PendingPermissionEditor invitation={invitation} catalog={catalog} draft={draftInvitationOverrides[invitation.id] || {}} onChange={(permissionKey, effect) => setDraftInvitationOverrides((current) => ({ ...current, [invitation.id!]: { ...(current[invitation.id!] || {}), [permissionKey]: effect || null } }))} onSave={() => void saveInvitationPermissions(invitation)} onCancel={() => { setExpandedInvitationId(null); setDraftInvitationOverrides((current) => ({ ...current, [invitation.id!]: Object.fromEntries(invitation.permissionOverrides.map((override) => [override.permissionKey, override.effect])) })); }} saving={busy === `authorization-permissions:${invitation.id}`} />}</div>; })}</div></div>}

    {historicalInvitations.length > 0 && <div className="mt-5 rounded-xl border border-slate-200 p-3.5"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />Access authorization history</div><div className="mt-3 space-y-2">{historicalInvitations.slice(0, 12).map((invitation) => <div key={invitation.id || `${invitation.email}:${invitation.createdAt}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs"><span className="min-w-0 truncate font-semibold text-slate-700">{invitation.email || "Access authorization"}</span><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${authorizationStatusTone(invitation)}`}><ShieldCheck className="h-3 w-3" />{authorizationStatusLabel(invitation)}</span></div>)}</div></div>}
  </section>;
}
