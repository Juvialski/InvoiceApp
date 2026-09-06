import { useEffect, useMemo, useState } from "react";
import { FileSignature, LockKeyhole, Save } from "lucide-react";
import { useCompanyAccess } from "../../context/CompanyAccessContext.tsx";
import { DEFAULT_COMPANY_DOCUMENT_PROFILE, loadCompanyDocumentProfileFromSupabase, saveCompanyDocumentProfileToSupabase, type CompanyDocumentProfile } from "../../lib/companyDocumentProfile.ts";
import { supabase } from "../../lib/supabase.ts";
import { PERMISSION_KEYS } from "../../utils/accessControl.ts";

export function CompanyDocumentProfileSettings() {
  const access = useCompanyAccess();
  const company = access.activeCompany;
  const canManage = access.can(PERMISSION_KEYS.companyManage);
  const [saved, setSaved] = useState<CompanyDocumentProfile>(DEFAULT_COMPANY_DOCUMENT_PROFILE);
  const [draft, setDraft] = useState<CompanyDocumentProfile>(DEFAULT_COMPANY_DOCUMENT_PROFILE);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!company) return () => { cancelled = true; };
    void loadCompanyDocumentProfileFromSupabase().then((profile) => {
      if (cancelled) return;
      setSaved(profile);
      setDraft(profile);
    }).catch(() => {
      if (!cancelled) {
        const fallback = { ...DEFAULT_COMPANY_DOCUMENT_PROFILE };
        setSaved(fallback);
        setDraft(fallback);
      }
    });
    return () => { cancelled = true; };
  }, [company?.id, company?.name]);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [draft, saved]);
  if (!company) return null;
  const setField = <K extends keyof CompanyDocumentProfile>(field: K, value: CompanyDocumentProfile[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setNotice(null);
  };
  const save = async () => {
    if (!canManage || busy) return;
    if (!draft.legalName.trim()) { setNotice({ tone: "error", text: "A legal company name is required for issued documents." }); return; }
    if (draft.email && !/^\S+@\S+\.\S+$/.test(draft.email.trim())) { setNotice({ tone: "error", text: "Enter a valid document email address." }); return; }
    setBusy(true);
    setNotice(null);
    try {
      const next = supabase ? await saveCompanyDocumentProfileToSupabase(draft) : { ...draft };
      setSaved(next);
      setDraft(next);
      setNotice({ tone: "success", text: "Company document profile saved. Future draft previews use these details; issued snapshots remain unchanged." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "The company document profile could not be saved." });
    } finally { setBusy(false); }
  };

  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="company-document-profile-title" aria-busy={busy}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><FileSignature className="h-5 w-5" /></div><div><p id="company-document-profile-title" className="text-sm font-black text-slate-950">Company document profile</p><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">One authoritative profile for the HSC PO and Client Invoice letterhead, buyer identity checks, and future issued-document snapshots.</p></div></div>{!canManage && <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-500"><LockKeyhole className="h-3 w-3" />Read-only</span>}</div>
    {notice && <p role={notice.tone === "error" ? "alert" : "status"} className={`mt-4 rounded-lg border px-3 py-2 text-xs ${notice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.text}</p>}
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="field-label">Legal name</span><input disabled={!canManage || busy} value={draft.legalName} onChange={(event) => setField("legalName", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">VAT TIN</span><input disabled={!canManage || busy} value={draft.vatTin || ""} onChange={(event) => setField("vatTin", event.target.value)} className="field-input" /></label><label className="space-y-1 sm:col-span-2"><span className="field-label">Official address</span><input disabled={!canManage || busy} value={draft.address || ""} onChange={(event) => setField("address", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Contact number</span><input disabled={!canManage || busy} value={draft.contactNumber || ""} onChange={(event) => setField("contactNumber", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Document email</span><input type="email" disabled={!canManage || busy} value={draft.email || ""} onChange={(event) => setField("email", event.target.value)} className="field-input" /></label><label className="space-y-1 sm:col-span-2"><span className="field-label">Logo path</span><input disabled={!canManage || busy} value={draft.logoPath || ""} onChange={(event) => setField("logoPath", event.target.value)} className="field-input" /></label><label className="space-y-1 sm:col-span-2"><span className="field-label">Payment instructions</span><textarea disabled={!canManage || busy} value={draft.paymentInstructions || ""} onChange={(event) => setField("paymentInstructions", event.target.value)} rows={2} className="field-input resize-y" /></label><label className="space-y-1 sm:col-span-2"><span className="field-label">Default document terms</span><textarea disabled={!canManage || busy} value={draft.defaultTerms || ""} onChange={(event) => setField("defaultTerms", event.target.value)} rows={2} className="field-input resize-y" /></label></div>
    {canManage && <div className="mt-5 flex justify-end"><button type="button" onClick={() => void save()} disabled={!dirty || busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"><Save className="h-3.5 w-3.5" />{busy ? "Saving…" : "Save document profile"}</button></div>}
  </section>;
}
