import { useEffect, useRef, useState, type ReactNode } from "react";
import { Building2, ChevronDown, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { permissionDisplayName, type PermissionKey } from "../../utils/accessControl.ts";
import type {
  CompanyAccessAuditEntry,
  CompanyMemberSummary,
  CompanySummary,
  CreateCompanyInput,
  InviteCompanyMemberInput,
  UpdateCompanyMemberInput,
} from "../../lib/companyAccess.ts";
import { CompanyManagement } from "./CompanyManagement.tsx";

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
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  if (!companies.length) return null;
  // Management can show every company, but this switcher is strictly for
  // opening a financial workspace. Inactive companies belong in Manage
  // Companies, never in the active-workspace selector.
  const selectableCompanies = companies.filter((company) => company.status.toUpperCase() === "ACTIVE");
  const select = async (company: CompanySummary) => {
    if (disabled || !selectableCompanies.includes(company) || company.id === activeCompanyId) { setOpen(false); return; }
    setBusyId(company.id);
    try { await onSelect(company.id); setOpen(false); } finally { setBusyId(null); }
  };

  return <div ref={rootRef} className="relative min-w-0 shrink-0">
    <button ref={buttonRef} type="button" onClick={() => setOpen((value) => !value)} disabled={disabled} aria-label={activeCompany ? `Current company: ${activeCompany.name}` : "Choose a company"} aria-haspopup="listbox" aria-expanded={open} className="inline-flex max-w-[14rem] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left text-[10px] font-bold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-[18rem]">
      <Building2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-indigo-600" /><span className="min-w-0 truncate">{activeCompany?.name || "Choose company"}</span><ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div role="listbox" aria-label="Available companies" className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
      <div className="px-2 pb-1.5 pt-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{isPlatformOwner ? "Platform companies" : "Your companies"}</div>
      {companies.map((company) => <button key={company.id} type="button" role="option" aria-selected={company.id === activeCompanyId} disabled={!selectableCompanies.includes(company) || busyId !== null} onClick={() => void select(company)} className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left transition ${company.id === activeCompanyId ? "bg-indigo-50 text-indigo-950" : "text-slate-700 hover:bg-slate-50"} disabled:cursor-not-allowed disabled:opacity-50`}>
        <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-600" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{company.name}</span><span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-400">{company.companyCode || "Company workspace"}</span></span><span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${companyStatusClasses(company.status)}`}>{companyStatusLabel(company.status)}</span>{busyId === company.id && <Loader2 aria-label="Switching" className="h-3.5 w-3.5 animate-spin text-indigo-600" />}
      </button>)}
    </div>}
  </div>;
}

export function NoCompanyAccess({ isPlatformOwner = false, onSignOut, children }: { isPlatformOwner?: boolean; onSignOut?: () => void | Promise<void>; children?: ReactNode }) {
  return <main className="flex min-h-[70vh] items-center justify-center px-4 py-10"><section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_-32px_rgba(15,23,42,0.42)] sm:p-8"><div className="flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><Building2 className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Company access</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{isPlatformOwner ? "Platform management" : "No company access yet"}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{isPlatformOwner ? "You can create and manage client companies from here. Select a company when you are ready to open its workspace." : "Your account is signed in, but it has not been invited to an active company. Ask the platform owner to add your verified email to a company."}</p></div></div>{!isPlatformOwner && <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><span>Signing in alone does not create a workspace or reveal company data.</span></div>}{children}{onSignOut && <button type="button" onClick={() => void onSignOut()} className="mt-6 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">Sign out</button>}</section></main>;
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

/** Compatibility export for older imports; the page component owns all UI. */
export function PlatformManagement(props: PlatformManagementProps) {
  return <CompanyManagement companies={props.companies} activeCompanyId={props.activeCompanyId} onOpenWorkspace={props.onSelectCompany} onCreateCompany={props.onCreateCompany} onUpdateCompany={props.onUpdateCompany} onInviteCompanyMember={props.onInviteCompanyMember} onUpdateCompanyMember={props.onUpdateCompanyMember} onLoadCompanyMembers={props.onLoadCompanyMembers} onLoadAudit={props.onLoadAudit} onClose={props.onClose} />;
}

export { CompanyManagement };
