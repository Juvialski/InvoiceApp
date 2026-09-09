import { useEffect, useState } from "react";
import { KeyRound, LockKeyhole, Save } from "lucide-react";
import { useCompanyAccess } from "../../context/CompanyAccessContext.tsx";
import { bootstrapDeploymentGeminiKey, loadDeploymentAiConfig } from "../../lib/deploymentAiApi.ts";
import type { CompanyAiConfigMetadata } from "../../server/ai/companyAiTypes.ts";
import { PERMISSION_KEYS } from "../../utils/accessControl.ts";
import {
  DEPLOYMENT_AI_STATUS_UNAVAILABLE,
  deploymentAiEnabledLabel,
  deploymentAiStatusText,
  deploymentAiValidationLabel,
  shouldShowDeploymentAiBootstrap,
  type DeploymentAiConfigLoadState,
} from "../../lib/deploymentAiPresentation.ts";

function statusText(config: CompanyAiConfigMetadata) {
  return deploymentAiStatusText(config);
}

export function DeploymentAiBootstrapSettings() {
  const access = useCompanyAccess();
  const company = access.activeCompany;
  const canReadConfiguration = access.can(PERMISSION_KEYS.settingsRead);
  const [loadState, setLoadState] = useState<DeploymentAiConfigLoadState>({ kind: "loading" });
  const [apiKey, setApiKey] = useState("");
  const [validateProvider, setValidateProvider] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!company || !canReadConfiguration) {
      setLoadState({ kind: "loading" });
      return () => { cancelled = true; };
    }
    setLoadState({ kind: "loading" });
    void loadDeploymentAiConfig(company.id).then((next) => {
      if (!cancelled) setLoadState({ kind: "loaded", config: next });
    }).catch(() => {
      if (!cancelled) setLoadState({ kind: "error", message: DEPLOYMENT_AI_STATUS_UNAVAILABLE });
    });
    return () => { cancelled = true; };
  }, [company?.id, canReadConfiguration]);

  if (!company || !canReadConfiguration) return null;

  const config = loadState.kind === "loaded" ? loadState.config : null;
  const canAttemptInitialBootstrap = config?.bootstrapAuthorized === true;

  const submit = async () => {
    if (busy || !apiKey.trim()) {
      setNotice({ tone: "error", text: "Enter the Gemini API key supplied through the approved operator process." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const next = await bootstrapDeploymentGeminiKey(company.id, apiKey, validateProvider);
      setLoadState({ kind: "loaded", config: next });
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

  const needsBootstrapCredential = shouldShowDeploymentAiBootstrap(loadState, canAttemptInitialBootstrap);
  const isInitialSetup = loadState.kind === "loaded" && loadState.config.status === "NOT_CONFIGURED";
  const title = needsBootstrapCredential && !isInitialSetup ? "AI configuration needs attention" : needsBootstrapCredential ? "Initial AI setup" : "AI configuration";
  const description = needsBootstrapCredential
    ? "Add the approved Gemini provider credential for this isolated deployment. The browser sends it only to the authenticated server, which encrypts it before persistence."
    : "AI assistance uses the provider configured for this deployment. Credential values are never shown here.";

  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="deployment-ai-settings-title" aria-busy={busy || loadState.kind === "loading"} data-ai-config-state={loadState.kind}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><KeyRound className="h-5 w-5" /></div><div><p id="deployment-ai-settings-title" className="text-sm font-black text-slate-950">{title}</p><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{description}</p></div></div>{needsBootstrapCredential && <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-500"><LockKeyhole className="h-3 w-3" />Authorized setup only</span>}</div>
    {notice && <p role={notice.tone === "error" ? "alert" : "status"} className={`mt-4 rounded-lg border px-3 py-2 text-xs ${notice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.text}</p>}
    {loadState.kind === "loading" && <p role="status" className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">Checking AI configuration status…</p>}
    {loadState.kind === "error" && <p role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{loadState.message} No credential action is available until the status can be confirmed.</p>}
    {config && <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 sm:grid-cols-3" aria-label="AI configuration status"><div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Configuration</p><p className="mt-1 font-black text-slate-900">{config.credentialConfigured ? "AI configured" : "AI not configured"}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Provider</p><p className="mt-1 font-black text-slate-900">Gemini</p></div><div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Availability</p><p className="mt-1 font-black text-slate-900">{deploymentAiEnabledLabel(config)}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Provider validation</p><p className="mt-1 font-black text-slate-900">{deploymentAiValidationLabel(config)}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Last tested</p><p className="mt-1 font-black text-slate-900">{config.lastTestedAt ? new Date(config.lastTestedAt).toLocaleString() : "Not tested"}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Status detail</p><p className="mt-1 font-black text-slate-900">{statusText(config)}</p></div></div>}
    {config && !needsBootstrapCredential && config.status === "NOT_CONFIGURED" && <p className="mt-4 text-[10px] leading-4 text-slate-500">AI is not configured for this deployment. An authorized deployment operator can complete the one-time setup.</p>}
    {config && !needsBootstrapCredential && config.status !== "NOT_CONFIGURED" && <p className="mt-4 text-[10px] leading-4 text-slate-500">Credential rotation, disablement, and removal remain separate deployment maintenance operations.</p>}
    {needsBootstrapCredential && <div className="mt-5 space-y-3"><label className="block space-y-1"><span className="field-label">Gemini API key</span><input type="password" autoComplete="off" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setNotice(null); }} disabled={busy} className="field-input" placeholder={config?.status === "INVALID" ? "Replace the invalid initial provider key" : "Paste the approved provider key"} /></label><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={validateProvider} onChange={(event) => setValidateProvider(event.target.checked)} disabled={busy} />Validate the provider after encrypted storage</label><div className="flex justify-end"><button type="button" onClick={() => void submit()} disabled={busy || !apiKey.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"><Save className="h-3.5 w-3.5" />{busy ? "Configuring…" : config?.status === "INVALID" ? "Replace invalid bootstrap key" : "Configure AI for this deployment"}</button></div></div>}
  </section>;
}
