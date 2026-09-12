import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, CircleHelp, ExternalLink, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { useAppPermission } from "../app/AppPermissionContext.tsx";
import { useOptionalCompanyAccess } from "../context/CompanyAccessContext.tsx";
import { PERMISSION_KEYS } from "../utils/accessControl.ts";
import { loadSmsProviderStatus, type SmsProviderOverview, type SmsProviderStatus, type SmsProviderUiStatus } from "../lib/messaging.ts";

interface SmsProviderStatusPanelProps {
  readonly onOpenCompose?: () => void;
}

const EMPTY_OVERVIEW: SmsProviderOverview = {
  status: "NOT_CONFIGURED",
  providers: [
    { status: "NOT_CONFIGURED", providerId: "ANDROID_SIM_GATEWAY", providerLabel: "Company SIM Gateway" },
    { status: "NOT_CONFIGURED", providerId: "PHILSMS", providerLabel: "PhilSMS" },
  ],
};

function statusLabel(status: SmsProviderUiStatus) {
  if (status === "READY") return "Ready";
  if (status === "CONFIGURED_UNVERIFIED") return "Configured / awaiting verification";
  if (status === "DEGRADED") return "Offline / error";
  if (status === "UNAVAILABLE") return "Status unavailable";
  return "Not configured";
}

function statusClass(status: SmsProviderUiStatus) {
  if (status === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "DEGRADED" || status === "UNAVAILABLE") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "CONFIGURED_UNVERIFIED") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function lastSeenLabel(value?: string) {
  if (!value) return "Last seen: unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? `Last seen: ${value}` : `Last seen: ${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(parsed)}`;
}

function ProviderChoice({ provider, active, onOpenCompose }: { provider: SmsProviderStatus; active: boolean; onOpenCompose?: () => void }) {
  const isGateway = provider.providerId === "ANDROID_SIM_GATEWAY";
  return <article className={`rounded-2xl border p-4 ${active ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200 bg-white"}`} data-sms-provider={provider.providerId}>
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2.5"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isGateway ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}>{isGateway ? <Smartphone className="h-4 w-4" /> : <CircleHelp className="h-4 w-4" />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-black text-slate-950">{provider.providerLabel || (isGateway ? "Company SIM Gateway" : "PhilSMS")}</h3>{isGateway && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-800">Recommended</span>}</div><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{isGateway ? "Use the company SIM" : "Hosted SMS"}</p></div></div><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusClass(provider.status)}`}>{statusLabel(provider.status)}</span></div>
    <p className="mt-3 text-xs leading-5 text-slate-600">{isGateway ? "Use an Android phone with the company SIM. The phone can stay minimized and in normal use while its supported background service connects to the private gateway, using the company's existing load or plan." : "Use the hosted Philippine SMS API when the company does not want to maintain an Android gateway phone. PhilSMS currently describes its Standard offering as having no minimum top-up; Sender ID approval, credits, and account pricing remain provider requirements."}</p>
    {!isGateway && <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-indigo-700">Low-cost hosted SMS · no minimum top-up under the current Standard offering</p>}
    <p className="mt-2 text-[10px] leading-4 text-slate-500">{provider.message || (isGateway ? "Connect the server-side private gateway configuration, then verify the phone heartbeat." : "Connect the server-side API token and approved Sender ID, then verify the account.")}</p>
    {isGateway && <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500"><span>{lastSeenLabel(provider.lastSeen)}</span>{provider.deviceLabel && <span>Device: {provider.deviceLabel}</span>}{provider.simNumber && <span>SIM: {provider.simNumber}</span>}{provider.simCarrier && <span>Carrier: {provider.simCarrier}</span>}</div>}
    {active && onOpenCompose && <button type="button" onClick={onOpenCompose} disabled={provider.status !== "READY"} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45">Send controlled test SMS</button>}
  </article>;
}

export function SmsProviderStatusPanel({ onOpenCompose }: SmsProviderStatusPanelProps) {
  const companyAccess = useOptionalCompanyAccess();
  const canView = useAppPermission(PERMISSION_KEYS.documentSend);
  const canManage = useAppPermission(PERMISSION_KEYS.companyManage);
  const [overview, setOverview] = useState<SmsProviderOverview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const load = async () => {
    if (!canView || !companyAccess?.activeCompanyId) {
      setOverview(EMPTY_OVERVIEW);
      return;
    }
    setLoading(true);
    try { setOverview(await loadSmsProviderStatus()); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [canView, companyAccess?.activeCompanyId]);

  return (
    <section className="space-y-4" data-sms-provider-status={overview.status} aria-labelledby="sms-provider-status-title">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:p-5"><div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Smartphone className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Email / SMS · Provider setup</p><h2 id="sms-provider-status-title" className="mt-1 text-lg font-black text-slate-950">SMS setup</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Choose one of the two supported SMS paths. The server-side provider adapter keeps credentials private, and readiness is based on a real provider or phone check.</p>{overview.status === "NOT_CONFIGURED" && <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-slate-500">SMS · Not configured</p>}</div></div><button type="button" onClick={() => void load()} disabled={loading || !canView || !companyAccess?.activeCompanyId} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Verify connection</button></div>

      {!canView ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><strong>SMS provider status is restricted.</strong><p className="mt-1">This access profile does not include outbound message permission.</p></div> : <div className="grid gap-4 lg:grid-cols-2">{overview.providers.map((provider) => <ProviderChoice key={provider.providerId} provider={provider} active={provider.providerId === overview.activeProviderId} onOpenCompose={onOpenCompose} />)}</div>}

      {canView && <details open={setupOpen} onToggle={(event) => setSetupOpen((event.currentTarget as HTMLDetailsElement).open)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><summary className="cursor-pointer list-none text-sm font-black text-slate-900">{setupOpen ? "Hide setup instructions" : "Setup instructions"}</summary><div className="mt-4 grid gap-4 text-xs leading-5 text-slate-600 lg:grid-cols-2"><div><h3 className="font-black text-slate-900">Connect Company SIM</h3><ol className="mt-2 list-decimal space-y-1 pl-5"><li>Install the maintained Android SMS Gateway app.</li><li>Insert the company SIM and grant SMS permission.</li><li>In the app, open Settings → Cloud Server and enter the private server API URL ending in <code>/api/mobile/v1</code> plus the private token supplied by the gateway operator.</li><li>Activate the connection, then allow reliable background operation and exclude the app from restrictive battery optimization when Android requires it.</li><li>Confirm the phone reports a recent heartbeat here before sending a controlled test SMS.</li></ol><p className="mt-3 text-[10px] text-slate-500">The app can remain minimized or the phone locked while you use calls, Messenger, a browser, and other normal apps. Android/OEM battery management, internet connectivity, cellular signal, and SIM load/plan can still interrupt service.</p></div><div><h3 className="font-black text-slate-900">Configure PhilSMS</h3><ol className="mt-2 list-decimal space-y-1 pl-5"><li>Create or use the company PhilSMS account and obtain its server-side API token.</li><li>Register and obtain approval for the company Sender ID where required.</li><li>Configure the token and Sender ID on the deployment server, then verify the account balance endpoint here.</li><li>Use SMS credits for controlled Philippine transactional messages; pricing can vary by account/dashboard.</li></ol><p className="mt-3 text-[10px] text-slate-500">{canManage ? "An administrator must change provider environment configuration in the deployment secret store; this screen never displays or stores the token." : "Only a deployment administrator should change provider environment configuration; this screen never displays or stores the token."}</p><a className="mt-3 inline-flex items-center gap-1 font-black text-indigo-700 hover:underline" href="https://docs.sms-gate.app/getting-started/private-server/" target="_blank" rel="noreferrer">Android private-server guide <ExternalLink className="h-3 w-3" /></a></div></div></details>}
      {loading && <p className="inline-flex items-center gap-1.5 text-[10px] text-slate-500"><Loader2 className="h-3 w-3 animate-spin" />Checking server-side provider status…</p>}
      {overview.status === "UNAVAILABLE" && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900"><div className="flex items-center gap-2 font-black"><AlertCircle className="h-4 w-4" />Provider status unavailable</div><p className="mt-1">The current configuration could not be checked safely. SMS has not been marked ready.</p></div>}
      {overview.status === "READY" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><div className="flex items-center gap-2 font-black"><CheckCircle2 className="h-4 w-4 text-amber-700" />Configuration verified</div><p className="mt-1">Provider configuration or gateway health is responding. SMS still remains a provider-backed capability pending controlled QA evidence.</p></div>}
    </section>
  );
}

export default SmsProviderStatusPanel;
