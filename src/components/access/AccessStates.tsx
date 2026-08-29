import type { ReactNode } from "react";
import { Building2, KeyRound, ShieldCheck } from "lucide-react";
import { permissionDisplayName, type PermissionKey } from "../../utils/accessControl.ts";
import type { CompanySummary } from "../../lib/companyAccess.ts";

export interface CompanySwitcherProps {
  companies: readonly CompanySummary[];
  activeCompanyId?: string | null;
}

/**
 * Compatibility surface retained for Header/App callers. In a client Engoryx
 * deployment this is a read-only identity badge, never a tenant selector.
 */
export function CompanySwitcher({ companies, activeCompanyId }: CompanySwitcherProps) {
  const company = companies.find((item) => item.id === activeCompanyId)
    || (companies.length === 1 ? companies.at(0) || null : null);
  if (!company) return null;
  return <div aria-label={`Deployment company: ${company.name}`} className="inline-flex max-w-[18rem] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left text-[10px] font-bold text-slate-700 shadow-sm">
    <Building2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
    <span className="min-w-0 truncate">{company.name}</span>
  </div>;
}

export function NoCompanyAccess({ onSignOut, children }: { onSignOut?: () => void | Promise<void>; children?: ReactNode }) {
  return <main className="flex min-h-[70vh] items-center justify-center px-4 py-10"><section role="alert" className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_-32px_rgba(15,23,42,0.42)] sm:p-8"><div className="flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><Building2 className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Deployment access</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Company access unavailable</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">This account is signed in, but it is not an active member of the company configured for this Engoryx deployment, or the deployment company configuration is unavailable.</p></div></div><div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><span>Contact a company administrator if you should have access. Engoryx does not select or switch between unrelated client companies inside one deployment.</span></div>{children}{onSignOut && <button type="button" onClick={() => void onSignOut()} className="mt-6 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">Sign out</button>}</section></main>;
}

export function AccessDenied({ permission, companyName, onReturn }: { permission?: PermissionKey | null; companyName?: string; onReturn?: () => void }) {
  return <div className="flex min-h-[55vh] items-center justify-center px-4 py-8"><section role="alert" className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><KeyRound className="h-5 w-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-700">Access denied</p><h1 className="mt-1 text-xl font-black text-slate-950">This area is not available</h1><p className="mt-2 text-sm leading-6 text-slate-600">You don’t have access to {permissionDisplayName(permission)}{companyName ? ` for ${companyName}` : " for this company"}. If your role recently changed, refresh your access or contact a company administrator.</p></div></div>{onReturn && <button type="button" onClick={onReturn} className="mt-6 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700">Return to an available area</button>}</section></div>;
}
