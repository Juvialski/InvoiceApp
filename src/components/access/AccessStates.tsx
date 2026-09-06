import type { ReactNode } from "react";
import { Building2, KeyRound, ShieldCheck } from "lucide-react";
import { BRAND } from "../../config/brand.ts";
import { BrandMark } from "../BrandMark.tsx";
import { permissionDisplayName, type PermissionKey } from "../../utils/accessControl.ts";
import type { CompanySummary } from "../../lib/companyAccess.ts";

export interface CompanySwitcherProps {
  companies: readonly CompanySummary[];
  activeCompanyId?: string | null;
  collapsed?: boolean;
}

/**
 * Compatibility surface retained for Header/App callers. In a client HydroQualiSense
 * deployment this is a read-only identity badge, never a tenant selector.
 */
export function CompanySwitcher({ companies, activeCompanyId, collapsed = false }: CompanySwitcherProps) {
  const company = companies.find((item) => item.id === activeCompanyId)
    || (companies.length === 1 ? companies.at(0) || null : null);
  if (!company) return null;
  if (collapsed) {
    return (
      <div
        aria-label={`Deployment company: ${company.name}`}
        title={`Deployment company: ${company.name}`}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-200 shadow-sm mx-auto transition-colors hover:border-slate-700"
      >
        <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-400" />
      </div>
    );
  }
  return (
    <div
      aria-label={`Deployment company: ${company.name}`}
      title={company.name}
      className="flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2.5 text-left text-xs font-bold text-slate-200 shadow-sm transition-colors hover:border-slate-700"
    >
      <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-400" />
      <span className="min-w-0 flex-1 line-clamp-2 leading-snug break-words">{company.name}</span>
    </div>
  );
}

export function NoCompanyAccess({ onSignOut, children }: { onSignOut?: () => void | Promise<void>; children?: ReactNode }) {
  return <main className="flex min-h-[70vh] items-center justify-center px-4 py-10"><section role="alert" className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_-32px_rgba(15,23,42,0.42)] sm:p-8"><div className="flex items-start gap-4"><BrandMark variant="compact" decorative /><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Deployment access</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Company access unavailable</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">This email has not been authorized for this {BRAND.productName} deployment, or its existing access is inactive. Contact your company administrator.</p></div></div><div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><span>{BRAND.productName} only opens company data after authenticated membership resolution. It does not select or switch between unrelated client companies inside one deployment.</span></div>{children}{onSignOut && <button type="button" onClick={() => void onSignOut()} className="mt-6 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">Sign out</button>}</section></main>;
}

export function AccessDenied({ permission, companyName, onReturn }: { permission?: PermissionKey | null; companyName?: string; onReturn?: () => void }) {
  return <div className="flex min-h-[55vh] items-center justify-center px-4 py-8"><section role="alert" className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><KeyRound className="h-5 w-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-700">Access denied</p><h1 className="mt-1 text-xl font-black text-slate-950">This area is not available</h1><p className="mt-2 text-sm leading-6 text-slate-600">You don’t have access to {permissionDisplayName(permission)}{companyName ? ` for ${companyName}` : " for this company"}. If your role recently changed, refresh your access or contact a company administrator.</p></div></div>{onReturn && <button type="button" onClick={onReturn} className="mt-6 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700">Return to an available area</button>}</section></div>;
}
