import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Building2, ChevronDown, CircleUserRound, KeyRound, Loader2, Plus, RefreshCw, ShieldCheck, UserPlus, X } from "lucide-react";
import {
  roleDisplayName,
  permissionDisplayName,
  type PermissionKey,
} from "../../utils/accessControl.ts";
import type {
  CompanyAccessAuditEntry,
  CompanyMemberSummary,
  CompanySummary,
  CreateCompanyInput,
  InviteCompanyMemberInput,
  MembershipStatus,
  UpdateCompanyMemberInput,
} from "../../lib/companyAccess.ts";

function companyStatusLabel(status: string) {
  return status === "ACTIVE" ? "Active" : status === "SUSPENDED" ? "Suspended" : status === "ARCHIVED" ? "Archived" : status;
}

function companyStatusClasses(status: string) {
  return status === "ACTIVE"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : status === "SUSPENDED"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-slate-200 bg-slate-100 text-slate-600";
}

export interface CompanySwitcherProps {
  companies: readonly CompanySummary[];
  activeCompanyId?: string | null;
  isPlatformOwner?: boolean;
  disabled?: boolean;
  onSelect: (companyId: string) => void | Promise<void>;
}

export function CompanySwitcher({ companies, activeCompanyId, isPlatformOwner = false, disabled = false, onSelect }: CompanySwitcherProps) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const activeCompany = companies.find((company) => company.id === activeCompanyId) || null;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectableCompanies = isPlatformOwner ? companies : companies.filter((company) => company.status === "ACTIVE");
  if (!companies.length) return null;

  const select = async (company: CompanySummary) => {
    if (disabled || (!isPlatformOwner && company.status !== "ACTIVE") || company.id === activeCompanyId) {
      setOpen(false);
      return;
    }
    setBusyId(company.id);
    try {
      await onSelect(company.id);
      setOpen(false);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0 shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-label={activeCompany ? `Current company: ${activeCompany.name}` : "Choose a company"}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex max-w-[14rem] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left text-[10px] font-bold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-[18rem]"
      >
        <Building2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
        <span className="min-w-0 truncate">{activeCompany?.name || "Choose company"}</span>
        <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && <div role="listbox" aria-label="Available companies" className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
        <div className="px-2 pb-1.5 pt-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{isPlatformOwner ? "Platform companies" : "Your companies"}</div>
        {companies.map((company) => {
          const selectable = selectableCompanies.includes(company);
          return <button
            key={company.id}
            type="button"
            role="option"
            aria-selected={company.id === activeCompanyId}
            disabled={!selectable || busyId !== null}
            onClick={() => void select(company)}
            className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left transition ${company.id === activeCompanyId ? "bg-indigo-50 text-indigo-950" : "text-slate-700 hover:bg-slate-50"} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-600" />
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{company.name}</span><span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-400">{company.companyCode || "Company workspace"}</span></span>
            <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${companyStatusClasses(company.status)}`}>{companyStatusLabel(company.status)}</span>
            {busyId === company.id && <Loader2 aria-label="Switching" className="h-3.5 w-3.5 animate-spin text-indigo-600" />}
          </button>;
        })}
      </div>}
    </div>
  );
}

export function NoCompanyAccess({ isPlatformOwner = false, onSignOut, children }: { isPlatformOwner?: boolean; onSignOut?: () => void | Promise<void>; children?: import("react").ReactNode }) {
  return <main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
    <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_-32px_rgba(15,23,42,0.42)] sm:p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><Building2 className="h-5 w-5" /></div>
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Company access</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{isPlatformOwner ? "Platform management" : "No company access yet"}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{isPlatformOwner ? "You can create and manage client companies from here. Select a company when you are ready to open its workspace." : "Your account is signed in, but it has not been invited to an active company. Ask the platform owner to add your verified email to a company."}</p></div>
      </div>
      {!isPlatformOwner && <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><span>Signing in alone does not create a workspace or reveal company data.</span></div>}
      {children}
      {onSignOut && <button type="button" onClick={() => void onSignOut()} className="mt-6 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">Sign out</button>}
    </section>
  </main>;
}

export function AccessDenied({ permission, companyName, onReturn }: { permission?: PermissionKey | null; companyName?: string; onReturn?: () => void }) {
  return <div className="flex min-h-[55vh] items-center justify-center px-4 py-8"><section role="alert" className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><KeyRound className="h-5 w-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-700">Access denied</p><h1 className="mt-1 text-xl font-black text-slate-950">This area is not available</h1><p className="mt-2 text-sm leading-6 text-slate-600">You don’t have access to {permissionDisplayName(permission)}{companyName ? ` for ${companyName}` : " for this company"}. If your role recently changed, refresh your access or contact the platform owner.</p></div></div>{onReturn && <button type="button" onClick={onReturn} className="mt-6 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700">Return to an available area</button>}</section></div>;
}

interface PlatformManagementProps {
  companies: readonly CompanySummary[];
  activeCompanyId?: string | null;
  onSelectCompany: (companyId: string) => void | Promise<void>;
  onCreateCompany: (input: CreateCompanyInput) => Promise<CompanySummary>;
  onUpdateCompany?: (companyId: string, patch: Partial<Pick<CompanySummary, "name" | "companyCode" | "status" | "defaultCurrency" | "timezone">>) => Promise<CompanySummary>;
  onInviteCompanyMember?: (input: InviteCompanyMemberInput) => Promise<unknown>;
  onUpdateCompanyMember?: (input: UpdateCompanyMemberInput) => Promise<unknown>;
  onLoadCompanyMembers?: (companyId: string) => Promise<CompanyMemberSummary[]>;
  onLoadAudit?: (companyId?: string) => Promise<CompanyAccessAuditEntry[]>;
  onClose?: () => void;
}

export function PlatformManagement({ companies, activeCompanyId, onSelectCompany, onCreateCompany, onUpdateCompany, onInviteCompanyMember, onUpdateCompanyMember, onLoadCompanyMembers, onLoadAudit, onClose }: PlatformManagementProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [currency, setCurrency] = useState("PHP");
  const [timezone, setTimezone] = useState("Asia/Manila");
  const [selectedCompanyId, setSelectedCompanyId] = useState(activeCompanyId || companies[0]?.id || "");
  const [members, setMembers] = useState<CompanyMemberSummary[]>([]);
  const [audit, setAudit] = useState<CompanyAccessAuditEntry[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("VIEWER");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) || null;

  const roleOptions = useMemo(() => ["COMPANY_ADMIN", "FINANCE", "PAYROLL", "VIEWER"], []);

  useEffect(() => {
    if (!selectedCompanyId || !onLoadCompanyMembers) return undefined;
    let active = true;
    setMembers([]);
    void onLoadCompanyMembers(selectedCompanyId).then((rows) => { if (active) setMembers(rows); }).catch((error) => { if (active) setNotice(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [onLoadCompanyMembers, selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId || !onLoadAudit) return undefined;
    let active = true;
    void onLoadAudit(selectedCompanyId).then((rows) => { if (active) setAudit(rows.slice(0, 8)); }).catch(() => { if (active) setAudit([]); });
    return () => { active = false; };
  }, [onLoadAudit, selectedCompanyId]);

  const run = async (action: () => Promise<void>, success: string) => {
    if (busy) return;
    setBusy(true); setNotice(null);
    try { await action(); setNotice(success); } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  };

  const create = async () => {
    await run(async () => {
      const company = await onCreateCompany({ name, companyCode: code, defaultCurrency: currency, timezone });
      setName(""); setCode(""); setSelectedCompanyId(company.id);
    }, "Company created. Select it from the company switcher to open the workspace.");
  };

  const invite = async () => {
    if (!selectedCompanyId || !onInviteCompanyMember) return;
    await run(async () => {
      await onInviteCompanyMember({ companyId: selectedCompanyId, email: inviteEmail, roleKey: inviteRole });
      setInviteEmail("");
      if (onLoadCompanyMembers) setMembers(await onLoadCompanyMembers(selectedCompanyId));
    }, "Invitation saved. The user must sign in with that verified email to claim access.");
  };

  const updateMember = async (member: CompanyMemberSummary, patch: Pick<UpdateCompanyMemberInput, "roleKey" | "status">) => {
    if (!selectedCompanyId || !onUpdateCompanyMember) return;
    await run(async () => {
      await onUpdateCompanyMember({ companyId: selectedCompanyId, membershipId: member.id, userId: member.userId, ...patch });
      if (onLoadCompanyMembers) setMembers(await onLoadCompanyMembers(selectedCompanyId));
    }, "Member access updated.");
  };

  return <section className="mt-7 border-t border-slate-100 pt-6" aria-label="Platform management">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-black text-slate-950">Client companies</h2><p className="mt-1 text-xs leading-5 text-slate-500">Create, open, suspend, or archive company workspaces. Financial history is never deleted here.</p></div>{onClose && <button type="button" onClick={onClose} aria-label="Close platform management" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{companies.map((company) => <button key={company.id} type="button" onClick={() => { setSelectedCompanyId(company.id); void onSelectCompany(company.id); }} className={`rounded-2xl border p-3 text-left transition ${company.id === selectedCompanyId ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-200"}`}><div className="flex items-start gap-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-slate-900">{company.name}</span><span className="mt-1 block truncate text-[10px] font-semibold text-slate-400">{company.companyCode || "Company workspace"}</span></span><span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${companyStatusClasses(company.status)}`}>{companyStatusLabel(company.status)}</span></div></button>)}</div>

    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <form onSubmit={(event) => { event.preventDefault(); void create(); }} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"><div className="flex items-center gap-2"><Plus className="h-4 w-4 text-indigo-600" /><h3 className="text-xs font-black text-slate-900">Create company</h3></div><div className="mt-3 space-y-2.5"><input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Company name" aria-label="Company name" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /><div className="grid grid-cols-2 gap-2"><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Company code" aria-label="Company code" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /><input value={currency} onChange={(event) => setCurrency(event.target.value)} placeholder="Currency" aria-label="Default currency" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs uppercase outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></div><input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Timezone" aria-label="Timezone" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></div><button type="submit" disabled={busy} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Create company</button></form>

      <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-xs font-black text-slate-900">{selectedCompany ? selectedCompany.name : "Select a company"}</h3><p className="mt-1 text-[10px] font-semibold text-slate-400">Manage invitations and membership status</p></div>{selectedCompany && <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${companyStatusClasses(selectedCompany.status)}`}>{companyStatusLabel(selectedCompany.status)}</span>}</div>{selectedCompany && <><form onSubmit={(event) => { event.preventDefault(); void invite(); }} className="mt-4 flex flex-col gap-2 sm:flex-row"><input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Invited work email" aria-label="Invited work email" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} aria-label="Invitation role" className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">{roleOptions.map((role) => <option key={role} value={role}>{roleDisplayName(role)}</option>)}</select><button type="submit" disabled={busy || !onInviteCompanyMember} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"><UserPlus className="h-3.5 w-3.5" />Invite</button></form><div className="mt-4 space-y-2">{members.length ? members.map((member) => <div key={member.id || member.userId || member.email} className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:flex-row sm:items-center"><CircleUserRound className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{member.displayName || member.email || "Invited member"}</p><p className="truncate text-[10px] font-semibold text-slate-400">{member.email || "Verified account"}</p></div><select value={member.roleKey || "VIEWER"} onChange={(event) => void updateMember(member, { roleKey: event.target.value })} disabled={busy || !onUpdateCompanyMember} aria-label={`Role for ${member.email || "member"}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold"><option value="COMPANY_ADMIN">Company admin</option><option value="FINANCE">Finance</option><option value="PAYROLL">Payroll</option><option value="VIEWER">Viewer</option></select><button type="button" disabled={busy || !onUpdateCompanyMember} onClick={() => void updateMember(member, { status: member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-600 hover:border-slate-300 disabled:opacity-50">{member.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button></div>) : <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs font-semibold text-slate-400">No membership rows returned.</p>}</div></>}</div>
    </div>
    {notice && <div role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-xs leading-5 text-indigo-900"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{notice}</div>}
    {audit.length > 0 && <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4"><div className="flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 text-indigo-600" /><h3 className="text-xs font-black text-slate-900">Recent access activity</h3></div><div className="mt-3 space-y-2">{audit.map((entry, index) => <p key={entry.id || `${entry.action}-${index}`} className="text-[10px] leading-5 text-slate-600"><span className="font-bold text-slate-800">{entry.action}</span>{entry.targetEmail ? ` · ${entry.targetEmail}` : ""}{entry.createdAt ? ` · ${new Date(entry.createdAt).toLocaleString()}` : ""}</p>)}</div></div>}
  </section>;
}
