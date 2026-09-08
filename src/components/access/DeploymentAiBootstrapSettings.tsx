import { useEffect, useState } from "react";
import { KeyRound, LockKeyhole, Save } from "lucide-react";
import { useCompanyAccess } from "../../context/CompanyAccessContext.tsx";
import { bootstrapDeploymentGeminiKey, loadDeploymentAiConfig } from "../../lib/deploymentAiApi.ts";
import type { CompanyAiConfigMetadata } from "../../server/ai/companyAiTypes.ts";
import { PERMISSION_KEYS } from "../../utils/accessControl.ts";

function statusText(config: CompanyAiConfigMetadata) {
  if (config.status === "ACTIVE" && config.lastTestStatus === "SUCCESS") return "Enabled and provider-validated";
  if (config.status === "ACTIVE") return config.lastTestStatus === "PROVIDER_UNAVAILABLE" ? "Enabled; provider unavailable during last test" : "Enabled; provider test not completed";
  if (config.status === "INVALID") return "Credential invalid; replace through platform maintenance";
  if (config.status === "DISABLED") return "Disabled; platform maintenance is required to change it";
  return "Not configured";
}

export function DeploymentAiBootstrapSettings() {
  const access = useCompanyAccess();
  const company = access.activeCompany;
  const isInitialOperatorCandidate = access.activeMembership?.roleKey === "COMPANY_ADMIN" && access.can(PERMISSION_KEYS.companyManage);
  const [config, setConfig] = useState<CompanyAiConfigMetadata | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [validateProvider, setValidateProvider] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!company || !isInitialOperatorCandidate) return () => { cancelled = true; };
    void loadDeploymentAiConfig(company.id).then((next) => {
      if (!cancelled) setConfig(next);
    }).catch((error) => {
      if (!cancelled) setNotice({ tone: "error", text: error instanceof Error ? error.message : "Deployment AI configuration could not be loaded safely." });
    });
    return () => { cancelled = true; };
  }, [company?.id, isInitialOperatorCandidate]);

  if (!company || !isInitialOperatorCandidate) return null;

  const submit = async () => {
    if (busy || !apiKey.trim()) {
      setNotice({ tone: "error", text: "Enter the Gemini API key supplied through the approved operator process." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const next = await bootstrapDeploymentGeminiKey(company.id, apiKey, validateProvider);
      setConfig(next);
      setApiKey("");
      setNotice({ tone: "success", text: validateProvider ? `Deployment AI bootstrap completed: ${statusText(next)}.` : "Deployment AI bootstrap completed. Provider validation was skipped by the operator." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Deployment AI bootstrap failed safely." });
    } finally {
      // Do not retain the plaintext provider key in browser state after the
      // request, regardless of whether the server accepted it.
      setApiKey("");
      setBusy(false);
    }
  };

  const configured = Boolean(config?.credentialConfigured);
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="deployment-ai-bootstrap-title" aria-busy={busy}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><KeyRound className="h-5 w-5" /></div><div><p id="deployment-ai-bootstrap-title" className="text-sm font-black text-slate-950">Deployment AI bootstrap</p><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">One-time initial deployment operator setup for this isolated company. The browser sends the key only to the authenticated server; the server encrypts it before persistence. This does not grant platform-admin access.</p></div></div><span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-500"><LockKeyhole className="h-3 w-3" />Company Admin operator</span></div>
    {notice && <p role={notice.tone === "error" ? "alert" : "status"} className={`mt-4 rounded-lg border px-3 py-2 text-xs ${notice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.text}</p>}
    {config && <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"><strong>Current status:</strong> {statusText(config)}{config.credentialLast4 ? ` · key ending ${config.credentialLast4}` : ""}</div>}
    {!configured && <div className="mt-5 space-y-3"><label className="block space-y-1"><span className="field-label">Gemini API key</span><input type="password" autoComplete="off" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setNotice(null); }} disabled={busy} className="field-input" placeholder="Paste the approved provider key" /></label><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={validateProvider} onChange={(event) => setValidateProvider(event.target.checked)} disabled={busy} />Validate the provider after encrypted storage</label><div className="flex justify-end"><button type="button" onClick={() => void submit()} disabled={busy || !apiKey.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"><Save className="h-3.5 w-3.5" />{busy ? "Configuring…" : "Configure AI for this deployment"}</button></div></div>}
    {configured && <p className="mt-4 text-[10px] leading-4 text-slate-500">The one-time bootstrap refuses replacement after configuration. Credential rotation, disablement, and removal remain platform maintenance operations.</p>}
  </section>;
}
