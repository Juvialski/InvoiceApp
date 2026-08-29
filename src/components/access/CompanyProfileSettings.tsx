import { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, LockKeyhole, Save, X } from "lucide-react";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "../../config/regional";
import { useCompanyAccess } from "../../context/CompanyAccessContext.tsx";
import { PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { safeErrorMessage } from "../../utils/errorNormalization.ts";

interface CompanyProfileDraft {
  name: string;
  companyCode: string;
  defaultCurrency: string;
  timezone: string;
}

function draftFromCompany(company: { name: string; companyCode?: string; defaultCurrency?: string; timezone?: string }): CompanyProfileDraft {
  return {
    name: company.name,
    companyCode: company.companyCode || "",
    defaultCurrency: company.defaultCurrency || DEFAULT_CURRENCY,
    timezone: company.timezone || DEFAULT_TIMEZONE,
  };
}

export function CompanyProfileSettings() {
  const companyAccess = useCompanyAccess();
  const company = companyAccess.activeCompany;
  const canManage = companyAccess.can(PERMISSION_KEYS.companyManage);
  const [draft, setDraft] = useState<CompanyProfileDraft | null>(() => company ? draftFromCompany(company) : null);
  const [savedDraft, setSavedDraft] = useState<CompanyProfileDraft | null>(() => company ? draftFromCompany(company) : null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!company) {
      setDraft(null);
      setSavedDraft(null);
      return;
    }
    const next = draftFromCompany(company);
    setDraft(next);
    setSavedDraft(next);
    setNotice(null);
  }, [company?.id, company?.name, company?.companyCode, company?.defaultCurrency, company?.timezone, company?.updatedAt]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(savedDraft), [draft, savedDraft]);

  if (!company || !draft || !savedDraft) return null;

  const setField = <K extends keyof CompanyProfileDraft>(field: K, value: CompanyProfileDraft[K]) => {
    setDraft((current) => current ? { ...current, [field]: value } : current);
    setNotice(null);
  };

  const cancel = () => {
    setDraft(savedDraft);
    setNotice(null);
  };

  const save = async () => {
    if (!canManage || busy) return;
    const name = draft.name.trim();
    const companyCode = draft.companyCode.trim().toLowerCase();
    const defaultCurrency = draft.defaultCurrency.trim().toUpperCase();
    const timezone = draft.timezone.trim();
    if (!name || name.length > 200) {
      setNotice({ kind: "error", message: "Enter a company name between 1 and 200 characters." });
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(companyCode)) {
      setNotice({ kind: "error", message: "Company code must use lowercase letters, numbers, and hyphens (up to 64 characters)." });
      return;
    }
    if (!/^[A-Z]{3}$/.test(defaultCurrency)) {
      setNotice({ kind: "error", message: "Default currency must be a three-letter code such as PHP." });
      return;
    }
    if (!timezone || timezone.length > 100) {
      setNotice({ kind: "error", message: "Enter a valid deployment timezone." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await companyAccess.updateCompany(company.id, { name, companyCode, defaultCurrency, timezone });
      const next = draftFromCompany(result);
      setDraft(next);
      setSavedDraft(next);
      setNotice({ kind: "success", message: "Company profile saved. Updated identity is now used across this deployment." });
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error, "The company profile could not be saved.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="company-profile-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Building2 className="h-5 w-5" /></div>
          <div>
            <p className="text-sm font-black text-slate-950" id="company-profile-title">Company profile</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">This is the one client company configured for the deployment. Changes are company-scoped and audited; they do not create or switch tenants.</p>
          </div>
        </div>
        {!canManage && <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-500"><LockKeyhole className="h-3 w-3" />Read-only</span>}
      </div>

      {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-5 ${notice.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
        {notice.kind === "success" && <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        <span>{notice.message}</span>
      </div>}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-[11px] font-bold text-slate-600">Company / display name
          <input value={draft.name} disabled={!canManage || busy} onChange={(event) => setField("name", event.target.value)} maxLength={200} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50" />
        </label>
        <label className="text-[11px] font-bold text-slate-600">Company code
          <input value={draft.companyCode} disabled={!canManage || busy} onChange={(event) => setField("companyCode", event.target.value)} maxLength={64} placeholder="client-company" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50" />
        </label>
        <label className="text-[11px] font-bold text-slate-600">Default currency
          <input value={draft.defaultCurrency} disabled={!canManage || busy} onChange={(event) => setField("defaultCurrency", event.target.value)} maxLength={3} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold uppercase text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50" />
        </label>
        <label className="text-[11px] font-bold text-slate-600">Deployment timezone
          <input value={draft.timezone} disabled={!canManage || busy} onChange={(event) => setField("timezone", event.target.value)} maxLength={100} placeholder="Asia/Manila" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50" />
        </label>
      </div>

      {canManage && <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={cancel} disabled={!dirty || busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"><X className="h-3.5 w-3.5" />Cancel</button>
        <button type="button" onClick={() => void save()} disabled={!dirty || busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"><Save className="h-3.5 w-3.5" />{busy ? "Saving…" : "Save profile"}</button>
      </div>}
    </section>
  );
}
