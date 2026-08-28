import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck, UserPlus, Users } from "lucide-react";
import { useCompanyAccess } from "../../context/CompanyAccessContext.tsx";
import type { CompanyInvitationSummary, CompanyMemberSummary } from "../../lib/companyAccess.ts";
import { PERMISSION_KEYS, roleDisplayName, type PermissionKey } from "../../utils/accessControl.ts";
import { safeErrorMessage } from "../../utils/errorNormalization.ts";

const COMPANY_MEMBERS_MANAGE = "company.members.manage" as PermissionKey;
const ASSIGNABLE_ROLES = ["COMPANY_ADMIN", "FINANCE", "PAYROLL", "VIEWER"] as const;

function displayTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function DeploymentAccessManagement() {
  const companyAccess = useCompanyAccess();
  const company = companyAccess.activeCompany;
  const canRead = companyAccess.can(PERMISSION_KEYS.accessManage);
  const canManage = companyAccess.can(COMPANY_MEMBERS_MANAGE);
  const [members, setMembers] = useState<CompanyMemberSummary[]>([]);
  const [invitations, setInvitations] = useState<CompanyInvitationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState<string>("VIEWER");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!company || !canRead) return;
    setLoading(true);
    setNotice(null);
    try {
      const [memberRows, invitationRows] = await Promise.all([
        companyAccess.loadCompanyMembers(company.id),
        companyAccess.loadCompanyInvitations(company.id),
      ]);
      setMembers(memberRows);
      setInvitations(invitationRows);
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error, "Company access records could not be loaded.") });
    } finally {
      setLoading(false);
    }
  }, [canRead, company, companyAccess]);

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
      setNotice({ kind: "success", message: "Invitation created for this deployment company." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error, "The invitation could not be created.") });
    } finally {
      setBusy(null);
    }
  };

  const updateMember = async (member: CompanyMemberSummary, patch: { roleKey?: string; status?: "ACTIVE" | "SUSPENDED" | "REVOKED" }) => {
    if (!canManage || !member.id) return;
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

  return <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Users className="h-5 w-5" /></div>
        <div><p className="text-sm font-black text-slate-950">Company access</p><p className="mt-1 text-xs leading-5 text-slate-500">Manage users and roles for {company.name}. This deployment cannot grant access to another client company.</p></div>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className="h-3 w-3" />Refresh</button>
    </div>

    {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`mt-4 rounded-lg border px-3 py-2 text-xs ${notice.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.message}</div>}

    {canManage && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-black text-slate-800"><UserPlus className="h-4 w-4 text-indigo-600" />Invite user</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@company.com" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400" />
        <select value={roleKey} onChange={(event) => setRoleKey(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">
          {ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{roleDisplayName(role)}</option>)}
        </select>
        <button type="button" onClick={() => void invite()} disabled={busy === "invite" || !email.trim()} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{busy === "invite" ? "Inviting…" : "Invite"}</button>
      </div>
    </div>}

    <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Members</div>
      {loading ? <div className="flex items-center gap-2 px-3 py-5 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading access records…</div> : members.length === 0 ? <p className="px-3 py-5 text-xs text-slate-500">No member records were returned.</p> : <div className="divide-y divide-slate-100">{members.map((member) => <div key={member.id || member.userId || member.email} className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-center">
        <div className="min-w-0"><p className="truncate text-xs font-bold text-slate-900">{member.displayName || member.email || "Member"}</p><p className="truncate text-[10px] text-slate-500">{member.email || member.userId || ""} · {member.status}</p></div>
        {canManage && member.id ? <select value={member.roleKey || "VIEWER"} disabled={Boolean(busy)} onChange={(event) => void updateMember(member, { roleKey: event.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px] font-semibold">{ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{roleDisplayName(role)}</option>)}</select> : <span className="text-xs font-semibold text-slate-700">{roleDisplayName(member.roleKey)}</span>}
        {canManage && member.id ? <div className="flex flex-wrap gap-1.5">{member.status === "ACTIVE" ? <button type="button" disabled={Boolean(busy)} onClick={() => void updateMember(member, { status: "SUSPENDED" })} className="rounded-lg border border-amber-200 px-2 py-1.5 text-[10px] font-bold text-amber-800">Suspend</button> : <button type="button" disabled={Boolean(busy)} onClick={() => void updateMember(member, { status: "ACTIVE" })} className="rounded-lg border border-emerald-200 px-2 py-1.5 text-[10px] font-bold text-emerald-800">Reactivate</button>}<button type="button" disabled={Boolean(busy)} onClick={() => void updateMember(member, { status: "REVOKED" })} className="rounded-lg border border-rose-200 px-2 py-1.5 text-[10px] font-bold text-rose-800">Revoke</button></div> : <span />}
      </div>)}</div>}
    </div>

    {pendingInvitations.length > 0 && <div className="mt-4 rounded-xl border border-slate-200 p-3"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><ShieldCheck className="h-3.5 w-3.5" />Pending invitations</div><div className="mt-2 space-y-2">{pendingInvitations.map((invitation) => <div key={invitation.id || `${invitation.email}:${invitation.roleKey}`} className="flex flex-wrap justify-between gap-2 text-xs"><span className="font-semibold text-slate-800">{invitation.email}</span><span className="text-slate-500">{roleDisplayName(invitation.roleKey)}{invitation.expiresAt ? ` · expires ${displayTime(invitation.expiresAt)}` : ""}</span></div>)}</div></div>}
  </section>;
}
