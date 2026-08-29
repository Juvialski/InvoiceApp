import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, KeyRound, Loader2, MailCheck, MailWarning, RefreshCw, Save, ShieldCheck, UserPlus, Users, X } from "lucide-react";
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

function deliveryLabel(invitation: CompanyInvitationSummary) {
  if (invitation.status === "ACCEPTED") return "Accepted";
  if (invitation.status === "REVOKED") return "Revoked";
  if (invitation.status === "EXPIRED") return "Expired";
  if (invitation.deliveryStatus === "SENT") return "Sent";
  if (invitation.deliveryStatus === "FAILED") return "Delivery failed";
  return "Created";
}

function deliveryTone(invitation: CompanyInvitationSummary) {
  const label = deliveryLabel(invitation);
  if (label === "Sent" || label === "Accepted") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (label === "Delivery failed" || label === "Expired" || label === "Revoked") return "border-rose-200 bg-rose-50 text-rose-800";
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
    <div className="border-t border-indigo-100 bg-indigo-50/40 px-3 py-4 sm:px-4" data-permission-editor={member.id}>
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
  const [draftOverrides, setDraftOverrides] = useState<Record<string, Record<string, PermissionOverrideEffect | null | undefined>>>({});
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

  if (!company || !canRead) return null;

  const invite = async () => {
    if (!canManage || !email.trim()) return;
    setBusy("invite");
    setNotice(null);
    try {
      await companyAccess.inviteCompanyMember({ companyId: company.id, email: email.trim(), roleKey });
      setEmail("");
      setNotice({ kind: "success", message: "Invitation email sent. The recipient must use that verified email to claim company access." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error, "The invitation email could not be sent.") });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const updateMember = async (member: CompanyMemberSummary, patch: { roleKey?: string; status?: "ACTIVE" | "SUSPENDED" | "REVOKED" }) => {
    if (!canManage || !member.id || member.userId === currentUserId) return;
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

  const toggleEditor = (member: CompanyMemberSummary) => {
    if (!member.id || !canManage || member.userId === currentUserId) return;
    if (expandedMemberId === member.id) {
      setExpandedMemberId(null);
      return;
    }
    setExpandedMemberId(member.id);
    setDraftOverrides((current) => ({
      ...current,
      [member.id!]: Object.fromEntries(member.permissionOverrides.map((override) => [override.permissionKey, override.effect])),
    }));
  };

  const savePermissions = async (member: CompanyMemberSummary) => {
    if (!canManage || !member.id || member.userId === currentUserId) return;
    const draft = draftOverrides[member.id] || {};
    const overrides = Object.entries(draft).filter((entry): entry is [string, PermissionOverrideEffect] => entry[1] === "GRANT" || entry[1] === "DENY").map(([permissionKey, effect]) => ({ permissionKey, effect }));
    setBusy(`permissions:${member.id}`);
    setNotice(null);
    try {
      await companyAccess.updateCompanyMemberPermissions({ companyId: company.id, membershipId: member.id, overrides });
      setExpandedMemberId(null);
      setNotice({ kind: "success", message: "Member permission overrides saved." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error, "Member permission overrides could not be saved.") });
    } finally {
      setBusy(null);
    }
  };

  const revokeInvitation = async (invitation: CompanyInvitationSummary) => {
    if (!canManage || !invitation.id) return;
    setBusy(`revoke:${invitation.id}`);
    setNotice(null);
    try {
      await companyAccess.revokeCompanyInvitation(company.id, invitation.id);
      setNotice({ kind: "success", message: "Invitation revoked. Its link can no longer grant company access." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error, "The invitation could not be revoked.") });
    } finally {
      setBusy(null);
    }
  };

  const resendInvitation = async (invitation: CompanyInvitationSummary) => {
    if (!canManage || !invitation.id) return;
    setBusy(`resend:${invitation.id}`);
    setNotice(null);
    try {
      await companyAccess.resendCompanyInvitation(company.id, invitation.id);
      setNotice({ kind: "success", message: "Invitation email sent again." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error, "The invitation email could not be resent.") });
      await load();
    } finally {
      setBusy(null);
    }
  };

  return <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="company-access-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Users className="h-5 w-5" /></div>
        <div><p className="text-sm font-black text-slate-950" id="company-access-title">Company access</p><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Manage users and effective permissions for {company.name}. This deployment cannot grant access to another client company.</p></div>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className="h-3 w-3" />Refresh</button>
    </div>

    {!canManage && <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] leading-5 text-slate-600"><KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" /><span>You can review company access, but only a member with the access-management permission can invite users or change roles and overrides.</span></div>}
    {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`mt-4 rounded-lg border px-3 py-2 text-xs leading-5 ${notice.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.message}</div>}

    {canManage && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-black text-slate-800"><UserPlus className="h-4 w-4 text-indigo-600" />Invite user</div>
      <p className="mt-1 text-[10px] leading-4 text-slate-500">The email is sent by the trusted Engoryx server. Membership is created only after the recipient verifies that invited email.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@company.com" className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400" />
        <select value={roleKey} onChange={(event) => setRoleKey(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">
          {ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{roleDisplayName(role)}</option>)}
        </select>
        <button type="button" onClick={() => void invite()} disabled={busy === "invite" || !email.trim()} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{busy === "invite" ? "Sending…" : "Invite"}</button>
      </div>
    </div>}    <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-500">Members and effective permissions</div>
      {loading ? <div className="flex items-center gap-2 px-4 py-5 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading access records…</div> : members.length === 0 ? <p className="px-4 py-5 text-xs text-slate-500">No member records were returned.</p> : <div className="divide-y divide-slate-100">{members.map((member) => {
        const isSelf = member.userId === currentUserId;
        const editorOpen = Boolean(member.id && expandedMemberId === member.id);
        const effective = member.status === "ACTIVE" ? member.effectivePermissions : [];
        return <div key={member.id || member.userId || member.email}>
          <div className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-start">
            <div className="min-w-0"><p className="truncate text-xs sm:text-sm font-bold text-slate-900">{member.displayName || member.email || "Member"}{isSelf && <span className="ml-1.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-black text-indigo-700">You</span>}</p><p className="truncate text-xs text-slate-500">{member.email || member.userId || ""} · {member.status}</p><p className="mt-1 text-xs leading-5 text-slate-500"><span className="font-bold text-slate-700">Effective:</span> {effective.length ? effective.slice(0, 4).map(permissionDisplayName).join(", ") : "No active access"}{effective.length > 4 ? ` +${effective.length - 4} more` : ""}</p></div>
            <div className="min-w-0">{canManage && member.id && !isSelf ? <select value={member.roleKey || "VIEWER"} disabled={Boolean(busy)} onChange={(event) => void updateMember(member, { roleKey: event.target.value })} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800">{ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{roleDisplayName(role)}</option>)}</select> : <span className="text-xs font-semibold text-slate-700">{roleDisplayName(member.roleKey)}</span>}</div>
            <div className="flex flex-wrap gap-1.5 sm:justify-end">{canManage && member.id && !isSelf ? <><button type="button" disabled={Boolean(busy)} onClick={() => toggleEditor(member)} aria-expanded={editorOpen} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2.5 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50">{editorOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}Permissions</button>{member.status === "ACTIVE" ? <button type="button" disabled={Boolean(busy)} onClick={() => void updateMember(member, { status: "SUSPENDED" })} className="rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-50">Suspend</button> : <button type="button" disabled={Boolean(busy)} onClick={() => void updateMember(member, { status: "ACTIVE" })} className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50">Reactivate</button>}<button type="button" disabled={Boolean(busy)} onClick={() => void updateMember(member, { status: "REVOKED" })} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-50">Revoke</button></> : <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-500"><ShieldCheck className="h-3.5 w-3.5" />Own access protected</span>}</div>
          </div>
          {editorOpen && member.id && <PermissionEditor member={member} catalog={catalog} draft={draftOverrides[member.id] || {}} onChange={(permissionKey, effect) => setDraftOverrides((current) => { const next = { ...(current[member.id!] || {}) }; next[permissionKey] = effect || null; return { ...current, [member.id!]: next }; })} onSave={() => void savePermissions(member)} onCancel={() => { setExpandedMemberId(null); setDraftOverrides((current) => ({ ...current, [member.id!]: Object.fromEntries(member.permissionOverrides.map((override) => [override.permissionKey, override.effect])) })); }} saving={busy === `permissions:${member.id}`} />}
        </div>;
      })}</div>}
    </div>

    {pendingInvitations.length > 0 && <div className="mt-5 rounded-xl border border-slate-200 p-3.5"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><MailCheck className="h-3.5 w-3.5 text-indigo-600" />Pending invitations</div><div className="mt-3 space-y-2">{pendingInvitations.map((invitation) => <div key={invitation.id || `${invitation.email}:${invitation.roleKey}`} className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{invitation.email}</p><p className="mt-0.5 text-xs text-slate-500">{roleDisplayName(invitation.roleKey)}{invitation.expiresAt ? ` · expires ${displayTime(invitation.expiresAt)}` : ""}</p></div><div className="flex flex-wrap items-center gap-1.5"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${deliveryTone(invitation)}`}>{invitation.deliveryStatus === "FAILED" ? <MailWarning className="h-3 w-3" /> : <MailCheck className="h-3 w-3" />}{deliveryLabel(invitation)}</span>{canManage && invitation.id && <><button type="button" disabled={Boolean(busy)} onClick={() => void resendInvitation(invitation)} className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50">{busy === `resend:${invitation.id}` ? "Sending…" : "Resend"}</button><button type="button" disabled={Boolean(busy)} onClick={() => void revokeInvitation(invitation)} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-50">{busy === `revoke:${invitation.id}` ? "Revoking…" : "Revoke"}</button></>}</div></div>)}</div></div>}

    {invitations.filter((item) => item.status !== "PENDING").length > 0 && <div className="mt-5 rounded-xl border border-slate-200 p-3.5"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />Invitation history</div><div className="mt-3 space-y-2">{invitations.filter((item) => item.status !== "PENDING").slice(0, 12).map((invitation) => <div key={invitation.id || `${invitation.email}:${invitation.createdAt}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs"><span className="min-w-0 truncate font-semibold text-slate-700">{invitation.email || "Invitation"}</span><div className="flex flex-wrap items-center gap-1.5"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${deliveryTone(invitation)}`}>{deliveryLabel(invitation)}</span>{canManage && invitation.id && invitation.status !== "ACCEPTED" && <button type="button" disabled={Boolean(busy)} onClick={() => void resendInvitation(invitation)} className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50">{busy === `resend:${invitation.id}` ? "Sending…" : "Resend"}</button>}</div></div>)}</div></div>}
  </section>;
}
