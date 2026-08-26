import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Power, ShieldOff, Trash2, Wifi } from "lucide-react";
import type { CompanyAiConfigMetadata, CompanyAiTestStatus } from "../../server/ai/companyAiTypes.ts";
import { BRAND } from "../../config/brand.ts";

export interface CompanyAiConfigurationProps {
  config: CompanyAiConfigMetadata | null;
  loading?: boolean;
  onSaveKey?: (apiKey: string) => Promise<CompanyAiConfigMetadata>;
  onTest?: () => Promise<CompanyAiConfigMetadata>;
  onDisable?: () => Promise<CompanyAiConfigMetadata>;
  onEnable?: () => Promise<CompanyAiConfigMetadata>;
  onRemove?: () => Promise<CompanyAiConfigMetadata>;
}

type ConfirmAction = "disable" | "remove" | null;

function statusLabel(config: CompanyAiConfigMetadata | null) {
  if (!config || !config.credentialConfigured || config.status === "NOT_CONFIGURED") return "Not configured";
  if (config.status === "DISABLED") return "Configured / Disabled";
  if (config.status === "INVALID") return "Invalid credential";
  if (config.lastTestStatus === "SUCCESS") return "Verified";
  if (config.lastTestStatus === "NOT_TESTED") return "Configured / Active · Test required";
  return "Configured / Active · Test failed";
}

function statusClasses(config: CompanyAiConfigMetadata | null) {
  if (!config || !config.credentialConfigured || config.status === "NOT_CONFIGURED") return "border-slate-200 bg-slate-50 text-slate-600";
  if (config.status === "ACTIVE" && config.lastTestStatus === "SUCCESS") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (config.status === "INVALID") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function testStatusLabel(value?: CompanyAiTestStatus) {
  if (!value || value === "NOT_TESTED") return "Not tested";
  if (value === "SUCCESS") return "Successful";
  if (value === "INVALID_CREDENTIAL") return "Invalid credential";
  if (value === "QUOTA_LIMITED") return "Quota or rate limited";
  if (value === "MODEL_UNAVAILABLE") return "Model unavailable";
  if (value === "PROVIDER_ACCESS_DENIED") return "Provider access denied";
  return "Provider temporarily unavailable";
}

function testNotice(value: unknown) {
  const metadata = value && typeof value === "object" ? value as Partial<CompanyAiConfigMetadata> : {};
  if (metadata.lastTestStatus === "SUCCESS") return "Gemini connection test succeeded.";
  const reference = metadata.lastTestReference ? ` Reference: ${metadata.lastTestReference}.` : "";
  if (metadata.lastTestErrorCode === "AI_REQUEST_REJECTED") return `Gemini rejected the assistant request configuration.${reference}`;
  if (metadata.lastTestErrorCode === "AI_TIMEOUT") return `The Gemini connection test timed out.${reference}`;
  if (metadata.lastTestErrorCode === "AI_NETWORK_ERROR") return `The server could not reach Gemini.${reference}`;
  if (metadata.lastTestStatus === "INVALID_CREDENTIAL") return "Gemini rejected this credential. Replace it with a valid key.";
  if (metadata.lastTestStatus === "QUOTA_LIMITED") return `Gemini is quota or rate limited. Check the provider account before trying again.${reference}`;
  if (metadata.lastTestStatus === "MODEL_UNAVAILABLE") return `The configured Gemini model is unavailable. Try again later or contact the platform administrator.${reference}`;
  if (metadata.lastTestStatus === "PROVIDER_ACCESS_DENIED") return `Gemini denied access to this project, model, or API. Review provider permissions without replacing the stored key.${reference}`;
  if (metadata.lastTestStatus === "PROVIDER_UNAVAILABLE") return `The Gemini provider is temporarily unavailable. Try again later.${reference}`;
  return "Gemini connection test completed without a result.";
}

function messageForError(error: unknown, secret?: string) {
  const message = error instanceof Error ? error.message : String(error);
  return secret && secret.length > 0 ? message.split(secret).join("[redacted]") : message;
}

export function CompanyAiConfiguration({ config, loading = false, onSaveKey, onTest, onDisable, onEnable, onRemove }: CompanyAiConfigurationProps) {
  const [apiKey, setApiKey] = useState("");
  const [replaceMode, setReplaceMode] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    // Clear an unfinished key whenever the management target or credential
    // state changes. The metadata contract never contains the full key.
    setApiKey("");
    setReplaceMode(false);
    setConfirmAction(null);
  }, [config?.companyId, config?.credentialConfigured]);

  const run = async (key: string, action: () => Promise<unknown>, success: string | ((value: unknown) => string), secret?: string) => {
    if (busy) return;
    setBusy(key);
    setNotice(null);
    try {
      const result = await action();
      setNotice({ kind: "success", message: typeof success === "function" ? success(result) : success });
    } catch (error) {
      setNotice({ kind: "error", message: messageForError(error, secret) });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const next = apiKey.trim();
    if (!next) {
      setNotice({ kind: "error", message: "Enter a Gemini API key before saving." });
      return;
    }
    if (!onSaveKey) {
      setApiKey("");
      setReplaceMode(false);
      setNotice({ kind: "error", message: "AI credential management is unavailable for this company." });
      return;
    }

    // Clear the controlled input before any awaited operation. This also
    // clears it when the request fails or remains in flight.
    setApiKey("");
    setReplaceMode(false);
    await run("save", async () => {
      await onSaveKey(next);
      return onTest ? onTest() : undefined;
    }, onTest ? testNotice : "Gemini key saved. Test it when ready.", next);
  };

  const test = () => onTest ? run("test", onTest, testNotice) : undefined;

  const confirmDangerousAction = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "disable" && onDisable) await run("disable", onDisable, "AI is disabled for this company.");
    if (action === "remove" && onRemove) await run("remove", onRemove, "Gemini credential removed.");
  };

  return <div role="tabpanel" aria-label="AI Configuration">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h3 className="text-sm font-black text-slate-950">AI Configuration</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Configure the company’s Gemini credential for invoice extraction, email classification, {BRAND.assistantName}, and document processing.</p></div>
      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold ${statusClasses(config)}`}><span className={`h-1.5 w-1.5 rounded-full ${config?.status === "ACTIVE" ? "bg-emerald-500" : config?.status === "INVALID" ? "bg-rose-500" : config?.status === "DISABLED" ? "bg-amber-500" : "bg-slate-400"}`} />{statusLabel(config)}</span>
    </div>

    {loading ? <div className="mt-5 flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-5 text-xs font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-indigo-600" />Loading AI configuration…</div> : <>
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-start gap-3"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /><div className="min-w-0 flex-1"><p className="text-xs font-black text-slate-900">Gemini API key</p>{config?.credentialConfigured && config.credentialLast4 ? <p className="mt-1 text-xs font-semibold text-slate-600">Configured <span aria-label="last four characters">••••{config.credentialLast4}</span></p> : <p className="mt-1 text-[11px] leading-5 text-slate-500">No key is configured. AI operations fail safely until the platform administrator adds one.</p>}</div></div>
        {!config?.credentialConfigured && onSaveKey && <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="mt-4 flex flex-col gap-2 sm:flex-row"><input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Gemini API key" aria-label="Gemini API key" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /><button type="submit" disabled={!apiKey.trim() || Boolean(busy)} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{onTest ? "Save & Test" : "Save key"}</button></form>}
        {!config?.credentialConfigured && !onSaveKey && <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">AI credential management is unavailable for this company.</p>}
        {config?.credentialConfigured && onSaveKey && <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => { setApiKey(""); setReplaceMode(true); setNotice(null); }} disabled={Boolean(busy)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700 disabled:opacity-50">Replace key</button>{replaceMode && <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="flex min-w-[16rem] flex-1 gap-2"><input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="New Gemini API key" aria-label="New Gemini API key" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /><button type="submit" disabled={!apiKey.trim() || Boolean(busy)} className="rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{busy === "save" ? (onTest ? "Replacing…" : "Saving…") : (onTest ? "Replace & test" : "Replace key")}</button></form>}</div>}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-100 bg-white p-3"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Primary model</p><p className="mt-1 text-xs font-bold text-slate-800">{config?.primaryModel || "gemini-3.5-flash-lite"}</p></div><div className="rounded-xl border border-slate-100 bg-white p-3"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Fallback model</p><p className="mt-1 text-xs font-bold text-slate-800">{config?.fallbackModel || "gemini-3.7-flash"}</p></div></div>
      <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3 text-[11px] leading-5 text-slate-600"><p className="font-bold text-slate-800">Used for</p><p className="mt-1">Invoice extraction · email classification · {BRAND.assistantName} · AI document processing</p><p className="mt-2">Last tested: <span className="font-semibold">{config?.lastTestedAt ? new Date(config.lastTestedAt).toLocaleString() : "Not tested"}</span> · {testStatusLabel(config?.lastTestStatus)}</p></div>

      {config?.credentialConfigured && <div className="mt-4 flex flex-wrap gap-2">{onTest && config.status !== "DISABLED" && <button type="button" onClick={() => void test()} disabled={Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[10px] font-bold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"><Wifi className="h-3.5 w-3.5" />{busy === "test" ? "Testing…" : "Test connection"}</button>}{config.status === "DISABLED" && onEnable && <button type="button" onClick={() => void run("enable", onEnable, "AI is enabled for this company.")} disabled={Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"><Power className="h-3.5 w-3.5" />{busy === "enable" ? "Enabling…" : "Enable AI"}</button>}{config.status === "ACTIVE" && onDisable && <button type="button" onClick={() => { setConfirmAction("disable"); setNotice(null); }} disabled={Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"><ShieldOff className="h-3.5 w-3.5" />Disable AI</button>}{onRemove && <button type="button" onClick={() => { setConfirmAction("remove"); setNotice(null); }} disabled={Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Remove credential</button>}</div>}
      {confirmAction && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3" role="alert"><p className="text-xs font-bold text-rose-950">{confirmAction === "disable" ? "Disable AI for this company?" : "Remove this company’s Gemini credential?"}</p><p className="mt-1 text-[10px] leading-5 text-rose-900">{confirmAction === "disable" ? "AI operations will stop until the credential is enabled again." : "AI will stop working for this company until a new key is configured. The stored credential will be removed."}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void confirmDangerousAction()} disabled={Boolean(busy)} className="rounded-lg bg-rose-700 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{busy === confirmAction ? "Saving…" : confirmAction === "disable" ? "Confirm disable" : "Confirm removal"}</button><button type="button" onClick={() => setConfirmAction(null)} disabled={Boolean(busy)} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-[10px] font-bold text-rose-800 disabled:opacity-50">Cancel</button></div></div>}
      <p className="mt-4 flex items-start gap-2 text-[10px] leading-5 text-slate-500"><ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />Only platform owners can configure this credential. The complete key is encrypted server-side and is never returned to the browser after submission.</p>
    </>}
    {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`mt-4 rounded-xl border px-3 py-2.5 text-xs leading-5 ${notice.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{notice.message}</div>}
  </div>;
}
