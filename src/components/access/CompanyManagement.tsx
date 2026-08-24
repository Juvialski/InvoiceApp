import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  CircleUserRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";
import { roleDisplayName } from "../../utils/accessControl.ts";
import { CompanyAiConfiguration } from "./CompanyAiConfiguration.tsx";
import type { CompanyAiConfigMetadata } from "../../server/ai/companyAiTypes.ts";
import type {
  CompanyAccessAuditEntry,
  CompanyInvitationSummary,
  CompanyMemberSummary,
  CompanyStatus,
  CompanySummary,
  CreateCompanyInput,
  InviteCompanyMemberInput,
  MembershipStatus,
  UpdateCompanyMemberInput,
} from "../../lib/companyAccess.ts";

export type CompanyManagementTab = "general" | "members" | "ai" | "activity" | "danger";

const SUPPORTED_ROLE_KEYS = ["COMPANY_ADMIN", "FINANCE", "PAYROLL", "VIEWER"] as const;
const TAB_DEFINITIONS: readonly { id: CompanyManagementTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "members", label: "Members & Roles" },
  { id: "ai", label: "AI Configuration" },
  { id: "activity", label: "Activity" },
  { id: "danger", label: "Danger Zone" },
];

const STATUS_ACTIONS: readonly { status: "ACTIVE" | "SUSPENDED" | "ARCHIVED"; label: string; description: string }[] = [
  { status: "ACTIVE", label: "Reactivate company", description: "Allow the company workspace to be opened again." },
  { status: "SUSPENDED", label: "Suspend company", description: "Keep records while preventing normal workspace access." },
  { status: "ARCHIVED", label: "Archive company", description: "Retain the company and its history without deleting it." },
];

export interface CompanyManagementProps {
  companies: readonly CompanySummary[];
  activeCompanyId?: string | null;
  /** Initial management selection only. It is deliberately independent from activeCompanyId. */
  managementCompanyId?: string | null;
  /** Preferred explicit workspace-opening callback. It is not called when a management card is selected. */
  onOpenWorkspace?: (companyId: string) => void | Promise<void>;
  /** Compatibility fallback for existing integrations; it is only called by the explicit Open workspace button. */
  onSelectCompany?: (companyId: string) => void | Promise<void>;
  onCreateCompany?: (input: CreateCompanyInput) => Promise<CompanySummary>;
  onUpdateCompany?: (companyId: string, patch: Partial<Pick<CompanySummary, "name" | "companyCode" | "status" | "defaultCurrency" | "timezone">>) => Promise<CompanySummary>;
  onInviteCompanyMember?: (input: InviteCompanyMemberInput) => Promise<unknown>;
  onUpdateCompanyMember?: (input: UpdateCompanyMemberInput) => Promise<unknown>;
  onLoadCompanyMembers?: (companyId: string) => Promise<CompanyMemberSummary[]>;
  onLoadCompanyInvitations?: (companyId: string) => Promise<CompanyInvitationSummary[]>;
  onLoadAudit?: (companyId?: string) => Promise<CompanyAccessAuditEntry[]>;
  onLoadAiConfig?: (companyId: string) => Promise<CompanyAiConfigMetadata>;
  onSaveAiKey?: (companyId: string, apiKey: string) => Promise<CompanyAiConfigMetadata>;
  onTestAi?: (companyId: string) => Promise<CompanyAiConfigMetadata>;
  onDisableAi?: (companyId: string) => Promise<CompanyAiConfigMetadata>;
  onRemoveAi?: (companyId: string) => Promise<CompanyAiConfigMetadata>;
  onClose?: () => void;
}

function companyStatusLabel(status: string) {
  return status === "ACTIVE" ? "Active" : status === "SUSPENDED" ? "Suspended" : status === "ARCHIVED" ? "Archived" : status;
}

function companyStatusClasses(status: string) {
  return status === "ACTIVE"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : status === "SUSPENDED"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : status === "ARCHIVED"
        ? "border-slate-300 bg-slate-100 text-slate-700"
        : "border-slate-200 bg-slate-50 text-slate-600";
}

function membershipStatusClasses(status: MembershipStatus) {
  return status === "ACTIVE"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : status === "SUSPENDED"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-slate-200 bg-slate-100 text-slate-600";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function displayDate(value?: string) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function CompanyManagement({ companies, activeCompanyId, managementCompanyId: initialManagementCompanyId, onOpenWorkspace, onSelectCompany, onCreateCompany, onUpdateCompany, onInviteCompanyMember, onUpdateCompanyMember, onLoadCompanyMembers, onLoadCompanyInvitations, onLoadAudit, onLoadAiConfig, onSaveAiKey, onTestAi, onDisableAi, onRemoveAi }: CompanyManagementProps) {
  const [managementCompanyId, setManagementCompanyId] = useState(() => {
    if (initialManagementCompanyId && companies.some((company) => company.id === initialManagementCompanyId)) return initialManagementCompanyId;
    return companies[0]?.id || "";
  });
  const [activeTab, setActiveTab] = useState<CompanyManagementTab>("general");
  const [companySearch, setCompanySearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [members, setMembers] = useState<CompanyMemberSummary[]>([]);
  const [invitations, setInvitations] = useState<CompanyInvitationSummary[]>([]);
  const [audit, setAudit] = useState<CompanyAccessAuditEntry[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [aiConfig, setAiConfig] = useState<CompanyAiConfigMetadata | null>(null);
  const [aiConfigLoading, setAiConfigLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pendingStatus, setPendingStatus] = useState<"ACTIVE" | "SUSPENDED" | "ARCHIVED" | null>(null);

  const [name, setName] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("PHP");
  const [timezone, setTimezone] = useState("Asia/Manila");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("VIEWER");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCode, setCreateCode] = useState("");
  const [createCurrency, setCreateCurrency] = useState("PHP");
  const [createTimezone, setCreateTimezone] = useState("Asia/Manila");

  const selectedCompany = companies.find((company) => company.id === managementCompanyId) || null;
  const workspaceOpener = onOpenWorkspace || onSelectCompany;
  const managementCompanyIdRef = useRef(managementCompanyId);
  managementCompanyIdRef.current = managementCompanyId;

  const filteredCompanies = useMemo(() => {
    const query = companySearch.trim().toLowerCase();
    if (!query) return companies;
    return companies.filter((company) => [company.name, company.companyCode, company.status].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [companies, companySearch]);

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) => [member.displayName, member.email, member.roleKey, member.status].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [memberSearch, members]);

  useEffect(() => {
    setManagementCompanyId((current) => companies.some((company) => company.id === current) ? current : companies[0]?.id || "");
  }, [companies]);

  useEffect(() => {
    if (!selectedCompany) {
      setName("");
      setCompanyCode("");
      setDefaultCurrency("PHP");
      setTimezone("Asia/Manila");
      return;
    }
    setName(selectedCompany.name);
    setCompanyCode(selectedCompany.companyCode || "");
    setDefaultCurrency(selectedCompany.defaultCurrency || "PHP");
    setTimezone(selectedCompany.timezone || "Asia/Manila");
    setPendingStatus(null);
    setMemberSearch("");
  }, [selectedCompany?.companyCode, selectedCompany?.defaultCurrency, selectedCompany?.id, selectedCompany?.name, selectedCompany?.timezone]);

  useEffect(() => {
    if (!managementCompanyId || !onLoadCompanyMembers) {
      setMembers([]);
      setMembersLoading(false);
      return undefined;
    }
    let current = true;
    setMembers([]);
    setMembersLoading(true);
    void onLoadCompanyMembers(managementCompanyId)
      .then((rows) => { if (current) setMembers(rows); })
      .catch((error) => { if (current) setNotice({ kind: "error", message: errorMessage(error) }); })
      .finally(() => { if (current) setMembersLoading(false); });
    return () => { current = false; };
  }, [managementCompanyId, onLoadCompanyMembers]);

  useEffect(() => {
    if (!managementCompanyId || !onLoadCompanyInvitations) {
      setInvitations([]);
      return undefined;
    }
    let current = true;
    void onLoadCompanyInvitations(managementCompanyId)
      .then((rows) => { if (current) setInvitations(rows); })
      .catch((error) => { if (current) setNotice({ kind: "error", message: errorMessage(error) }); });
    return () => { current = false; };
  }, [managementCompanyId, onLoadCompanyInvitations]);

  useEffect(() => {
    if (!managementCompanyId || !onLoadAudit) {
      setAudit([]);
      setAuditLoading(false);
      return undefined;
    }
    let current = true;
    setAudit([]);
    setAuditLoading(true);
    void onLoadAudit(managementCompanyId)
      .then((rows) => { if (current) setAudit(rows); })
      .catch((error) => { if (current) setNotice({ kind: "error", message: errorMessage(error) }); })
      .finally(() => { if (current) setAuditLoading(false); });
    return () => { current = false; };
  }, [managementCompanyId, onLoadAudit]);

  useEffect(() => {
    if (!managementCompanyId || !onLoadAiConfig) {
      setAiConfig(null);
      setAiConfigLoading(false);
      return undefined;
    }
    let current = true;
    setAiConfig(null);
    setAiConfigLoading(true);
    void onLoadAiConfig(managementCompanyId)
      .then((value) => { if (current) setAiConfig(value); })
      .catch((error) => { if (current) setNotice({ kind: "error", message: errorMessage(error) }); })
      .finally(() => { if (current) setAiConfigLoading(false); });
    return () => { current = false; };
  }, [managementCompanyId, onLoadAiConfig]);

  const aiAction = async (action: ((companyId: string) => Promise<CompanyAiConfigMetadata>) | undefined) => {
    const companyId = managementCompanyId;
    if (!companyId || !selectedCompany || !action) throw new Error("AI configuration is unavailable.");
    const next = await action(companyId);
    if (managementCompanyIdRef.current === companyId) setAiConfig(next);
    return next;
  };

  const saveAiKey = async (apiKey: string) => {
    const companyId = managementCompanyId;
    if (!companyId || !selectedCompany || !onSaveAiKey) throw new Error("AI configuration is unavailable.");
    const next = await onSaveAiKey(companyId, apiKey);
    if (managementCompanyIdRef.current === companyId) setAiConfig(next);
    return next;
  };

  const run = async (actionKey: string, action: () => Promise<void>, successMessage: string) => {
    if (busyAction) return;
    setBusyAction(actionKey);
    setNotice(null);
    try {
      await action();
      setNotice({ kind: "success", message: successMessage });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusyAction(null);
    }
  };

  const saveGeneral = async () => {
    if (!selectedCompany || !onUpdateCompany) return;
    await run("general", async () => {
      const updated = await onUpdateCompany(selectedCompany.id, {
        name: name.trim(),
        companyCode: companyCode.trim() || undefined,
        defaultCurrency: defaultCurrency.trim().toUpperCase() || "PHP",
        timezone: timezone.trim() || "Asia/Manila",
      });
      setName(updated.name);
      setCompanyCode(updated.companyCode || "");
      setDefaultCurrency(updated.defaultCurrency || "PHP");
      setTimezone(updated.timezone || "Asia/Manila");
    }, "General company settings saved.");
  };

  const createCompany = async () => {
    if (!onCreateCompany) return;
    await run("create", async () => {
      const created = await onCreateCompany({
        name: createName.trim(),
        companyCode: createCode.trim() || undefined,
        defaultCurrency: createCurrency.trim().toUpperCase() || "PHP",
        timezone: createTimezone.trim() || "Asia/Manila",
      });
      setCreateName("");
      setCreateCode("");
      setCreateCurrency("PHP");
      setCreateTimezone("Asia/Manila");
      setShowCreateForm(false);
      setManagementCompanyId(created.id);
      setActiveTab("general");
    }, "Company created. Review its settings, then open the workspace explicitly when ready.");
  };

  const inviteMember = async () => {
    if (!selectedCompany || !onInviteCompanyMember) return;
    await run("invite", async () => {
      await onInviteCompanyMember({ companyId: selectedCompany.id, email: inviteEmail.trim(), roleKey: inviteRole });
      setInviteEmail("");
      if (onLoadCompanyMembers) setMembers(await onLoadCompanyMembers(selectedCompany.id));
      if (onLoadCompanyInvitations) setInvitations(await onLoadCompanyInvitations(selectedCompany.id));
    }, "Invitation saved. The invited user must sign in with that verified email to claim access.");
  };

  const updateMember = async (member: CompanyMemberSummary, patch: Pick<UpdateCompanyMemberInput, "roleKey" | "status">) => {
    if (!selectedCompany || !onUpdateCompanyMember) return;
    await run(`member:${member.id || member.userId || member.email || "row"}`, async () => {
      await onUpdateCompanyMember({ companyId: selectedCompany.id, membershipId: member.id, userId: member.userId, ...patch });
      if (onLoadCompanyMembers) setMembers(await onLoadCompanyMembers(selectedCompany.id));
    }, "Member access updated.");
  };

  const revokeMember = (member: CompanyMemberSummary) => {
    if (!window.confirm(`Revoke access for ${member.email || member.displayName || "this member"}?`)) return;
    return updateMember(member, { status: "REVOKED" });
  };

  const confirmStatusChange = async () => {
    if (!selectedCompany || !pendingStatus || !onUpdateCompany) return;
    const nextStatus = pendingStatus;
    await run(`status:${nextStatus}`, async () => {
      await onUpdateCompany(selectedCompany.id, { status: nextStatus as CompanyStatus });
      setPendingStatus(null);
    }, `Company status changed to ${companyStatusLabel(nextStatus)}.`);
  };

  const openWorkspace = async () => {
    if (!selectedCompany || !workspaceOpener) return;
    await run("open-workspace", async () => { await workspaceOpener(selectedCompany.id); }, "Workspace opened.");
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-6" aria-label="Company management">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Platform management</p>
          <h1 className="mt-1 text-xl font-black tracking-tight text-slate-950">Companies and access</h1>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600">Manage company settings, membership access, and audited status changes. Selecting a company here does not open its workspace.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(15rem,0.34fr)_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3" aria-label="Company list">
          <div className="flex items-center justify-between gap-2 px-1">
            <div><h2 className="text-xs font-black text-slate-900">Companies</h2><p className="mt-0.5 text-[10px] font-semibold text-slate-400">{companies.length} available</p></div>
            {onCreateCompany && <button type="button" onClick={() => setShowCreateForm((value) => !value)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100"><Plus className="h-3 w-3" />New</button>}
          </div>
          <label className="relative mt-3 block"><Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" /><input value={companySearch} onChange={(event) => setCompanySearch(event.target.value)} placeholder="Search companies" aria-label="Search companies" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-2.5 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label>
          <div className="mt-3 max-h-[30rem] space-y-1.5 overflow-y-auto">
            {filteredCompanies.length ? filteredCompanies.map((company) => <button key={company.id} type="button" aria-pressed={company.id === managementCompanyId} onClick={() => { setManagementCompanyId(company.id); setActiveTab("general"); setNotice(null); }} className={`w-full rounded-xl border p-3 text-left transition ${company.id === managementCompanyId ? "border-indigo-300 bg-indigo-50" : "border-transparent hover:border-slate-200 hover:bg-slate-50"}`}>
              <div className="flex items-start gap-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-slate-900">{company.name}</span><span className="mt-1 block truncate text-[10px] font-semibold text-slate-400">{company.companyCode || "Company workspace"}</span></span><span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${companyStatusClasses(company.status)}`}>{companyStatusLabel(company.status)}</span></div>
              {company.id === activeCompanyId && <span className="mt-2 inline-flex rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">Current workspace</span>}
            </button>) : <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs font-semibold text-slate-400">No companies match this search.</p>}
          </div>

          {showCreateForm && onCreateCompany && <form onSubmit={(event) => { event.preventDefault(); void createCompany(); }} className="mt-4 border-t border-slate-100 pt-4" aria-label="Create company">
            <h3 className="text-xs font-black text-slate-900">Create company</h3>
            <div className="mt-3 space-y-2"><input value={createName} onChange={(event) => setCreateName(event.target.value)} required placeholder="Company name" aria-label="New company name" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /><input value={createCode} onChange={(event) => setCreateCode(event.target.value)} placeholder="Company code" aria-label="New company code" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /><div className="grid grid-cols-2 gap-2"><input value={createCurrency} onChange={(event) => setCreateCurrency(event.target.value)} placeholder="Currency" aria-label="New company currency" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs uppercase outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /><input value={createTimezone} onChange={(event) => setCreateTimezone(event.target.value)} placeholder="Timezone" aria-label="New company timezone" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></div></div>
            <button type="submit" disabled={Boolean(busyAction)} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{busyAction === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Create company</button>
          </form>}
        </aside>

        <div className="min-w-0">
          {!selectedCompany ? <div className="flex min-h-[28rem] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center"><div><Building2 className="mx-auto h-8 w-8 text-slate-300" /><h2 className="mt-3 text-sm font-black text-slate-900">Select a company to manage</h2><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Management selection is local to this page. Use Open workspace only when you want to change the active company.</p></div></div> : <>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-black text-slate-950">{selectedCompany.name}</h2><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${companyStatusClasses(selectedCompany.status)}`}>{companyStatusLabel(selectedCompany.status)}</span>{selectedCompany.id === activeCompanyId && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-700">Current workspace</span>}</div><p className="mt-1 text-[11px] font-semibold text-slate-400">{selectedCompany.companyCode || "Company workspace"}</p></div><button type="button" onClick={() => void openWorkspace()} disabled={!workspaceOpener || Boolean(busyAction)} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"><ArrowUpRight className="h-3.5 w-3.5" />{selectedCompany.id === activeCompanyId ? "Current workspace" : "Open workspace"}</button></div>
              <div className="mt-5 flex min-w-0 gap-1 overflow-x-auto border-b border-slate-100" role="tablist" aria-label="Company management sections">{TAB_DEFINITIONS.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`shrink-0 border-b-2 px-3 pb-2.5 text-xs font-bold transition ${activeTab === tab.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-800"}`}>{tab.label}</button>)}</div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              {activeTab === "general" && <form onSubmit={(event) => { event.preventDefault(); void saveGeneral(); }} role="tabpanel" aria-label="General company settings">
                <div><h3 className="text-sm font-black text-slate-950">General</h3><p className="mt-1 text-xs leading-5 text-slate-500">Only supported company profile fields are editable here.</p></div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Company name</span><input value={name} onChange={(event) => setName(event.target.value)} required className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label><label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Company code</span><input value={companyCode} onChange={(event) => setCompanyCode(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label><label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Default currency</span><input value={defaultCurrency} onChange={(event) => setDefaultCurrency(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs uppercase outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label><label className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Timezone</span><input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label></div>
                <button type="submit" disabled={!onUpdateCompany || Boolean(busyAction)} className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{busyAction === "general" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Save changes</button>
              </form>}

              {activeTab === "members" && <div role="tabpanel" aria-label="Members and roles">
                <div><h3 className="text-sm font-black text-slate-950">Members &amp; Roles</h3><p className="mt-1 text-xs leading-5 text-slate-500">Invite members and update their supported role or membership status.</p></div>
                {onInviteCompanyMember && <form onSubmit={(event) => { event.preventDefault(); void inviteMember(); }} className="mt-5 flex flex-col gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3 sm:flex-row sm:items-end"><label className="min-w-0 flex-1"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-indigo-700">Invite work email</span><input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@company.com" className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label><label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-indigo-700">Role</span><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-xs font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 sm:w-36">{SUPPORTED_ROLE_KEYS.map((role) => <option key={role} value={role}>{roleDisplayName(role)}</option>)}</select></label><button type="submit" disabled={Boolean(busyAction)} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">{busyAction === "invite" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}Invite</button></form>}
                <label className="relative mt-4 block"><Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" /><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search members" aria-label="Search members" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-2.5 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label>
                <div className="mt-4 space-y-2">{membersLoading ? <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-5 text-xs font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-indigo-600" />Loading members…</div> : filteredMembers.length ? filteredMembers.map((member) => <div key={member.id || member.userId || member.email} className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:flex-row sm:items-center"><CircleUserRound className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{member.displayName || member.email || "Member"}</p><p className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">{member.email || member.userId || "Verified account"}</p></div><span className={`self-start rounded-full border px-1.5 py-0.5 text-[9px] font-bold sm:self-auto ${membershipStatusClasses(member.status)}`}>{companyStatusLabel(member.status)}</span><select value={member.roleKey || "VIEWER"} onChange={(event) => void updateMember(member, { roleKey: event.target.value })} disabled={!onUpdateCompanyMember || Boolean(busyAction) || member.status === "REVOKED"} aria-label={`Role for ${member.email || "member"}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold"><option value="COMPANY_ADMIN">{roleDisplayName("COMPANY_ADMIN")}</option><option value="FINANCE">{roleDisplayName("FINANCE")}</option><option value="PAYROLL">{roleDisplayName("PAYROLL")}</option><option value="VIEWER">{roleDisplayName("VIEWER")}</option></select>{member.status !== "REVOKED" && <button type="button" disabled={!onUpdateCompanyMember || Boolean(busyAction)} onClick={() => void updateMember(member, { status: member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-600 hover:border-slate-300 disabled:opacity-50">{member.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button>}{member.status !== "REVOKED" && <button type="button" disabled={!onUpdateCompanyMember || Boolean(busyAction)} onClick={() => void revokeMember(member)} className="rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-[10px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Revoke</button>}</div>) : <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs font-semibold text-slate-400">{onLoadCompanyMembers ? "No membership rows returned." : "Member loading is not available in this integration."}</p>}</div>
                {invitations.filter((invitation) => invitation.status === "PENDING").length > 0 && <div className="mt-4 space-y-2"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Pending invitations</p>{invitations.filter((invitation) => invitation.status === "PENDING").map((invitation) => <div key={invitation.id || invitation.email} className="flex flex-col gap-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-3 sm:flex-row sm:items-center"><UserPlus className="h-4 w-4 shrink-0 text-indigo-600" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-indigo-950">{invitation.email || "Pending invitation"}</p><p className="mt-0.5 text-[10px] font-semibold text-indigo-700">{roleDisplayName(invitation.roleKey)} · Invited {displayDate(invitation.createdAt)}{invitation.expiresAt ? ` · Expires ${displayDate(invitation.expiresAt)}` : ""}</p></div><span className="rounded-full border border-indigo-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">Pending</span></div>)}</div>}
              </div>}

              {activeTab === "ai" && <CompanyAiConfiguration config={aiConfig} loading={aiConfigLoading} onSaveKey={onSaveAiKey ? saveAiKey : undefined} onTest={onTestAi ? () => aiAction(onTestAi) : undefined} onDisable={onDisableAi ? () => aiAction(onDisableAi) : undefined} onRemove={onRemoveAi ? () => aiAction(onRemoveAi) : undefined} />}

              {activeTab === "activity" && <div role="tabpanel" aria-label="Company activity"><div><h3 className="text-sm font-black text-slate-950">Activity</h3><p className="mt-1 text-xs leading-5 text-slate-500">Recent access changes for the selected management company.</p></div>{auditLoading ? <div className="mt-5 flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-5 text-xs font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-indigo-600" />Loading activity…</div> : audit.length ? <div className="mt-5 space-y-2">{audit.map((entry, index) => <div key={entry.id || `${entry.action}-${entry.createdAt || index}`} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3"><div className="flex items-start gap-2"><RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" /><div className="min-w-0"><p className="text-xs font-bold text-slate-800">{entry.action}</p><p className="mt-1 text-[10px] leading-5 text-slate-500">{entry.targetEmail ? `Target: ${entry.targetEmail}` : "Company access change"}{entry.actorEmail ? ` · By ${entry.actorEmail}` : ""} · {displayDate(entry.createdAt)}</p></div></div></div>)}</div> : <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs font-semibold text-slate-400">{onLoadAudit ? "No access activity recorded." : "Activity loading is not available in this integration."}</div>}</div>}

              {activeTab === "danger" && <div role="tabpanel" aria-label="Danger zone"><div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><h3 className="text-sm font-black text-amber-950">Status and retention</h3><p className="mt-1 text-xs leading-5 text-amber-900">Status changes are confirmed before they are submitted. Company records and financial history are retained; hard delete is not supported here.</p></div></div><div className="mt-5 space-y-2">{STATUS_ACTIONS.filter((action) => action.status !== selectedCompany.status).map((action) => <div key={action.status} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold text-slate-800">{action.label}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{action.description}</p></div><button type="button" disabled={!onUpdateCompany || Boolean(busyAction)} onClick={() => setPendingStatus(action.status)} className={`shrink-0 rounded-lg border px-2.5 py-2 text-[10px] font-bold disabled:opacity-50 ${action.status === "ARCHIVED" ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>{action.label}</button></div>)}</div>{pendingStatus && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4" role="alert"><p className="text-xs font-bold text-rose-950">Confirm changing this company to {companyStatusLabel(pendingStatus)}?</p><p className="mt-1 text-[10px] leading-5 text-rose-900">This uses the existing company status operation and does not delete any records.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void confirmStatusChange()} disabled={Boolean(busyAction)} className="rounded-lg bg-rose-700 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{busyAction === `status:${pendingStatus}` ? "Saving…" : "Confirm status change"}</button><button type="button" onClick={() => setPendingStatus(null)} disabled={Boolean(busyAction)} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-[10px] font-bold text-rose-800 disabled:opacity-50">Cancel</button></div></div>}</div>}
            </div>
          </>}
        </div>
      </div>

      {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-5 ${notice.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{notice.message}</div>}
      <p className="mt-4 flex items-start gap-2 text-[10px] leading-5 text-slate-500"><Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />Management selection is local to this page. The active company changes only after Open workspace is pressed.</p>
    </section>
  );
}
