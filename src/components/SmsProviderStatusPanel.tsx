import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { useAppPermission } from "../app/AppPermissionContext.tsx";
import { useOptionalCompanyAccess } from "../context/CompanyAccessContext.tsx";
import { PERMISSION_KEYS } from "../utils/accessControl.ts";
import { loadSmsProviderStatus, type SmsProviderUiStatus } from "../lib/messaging.ts";

export function SmsProviderStatusPanel() {
  const companyAccess = useOptionalCompanyAccess();
  const canView = useAppPermission(PERMISSION_KEYS.documentSend);
  const [status, setStatus] = useState<SmsProviderUiStatus>("NOT_CONFIGURED");
  const [providerLabel, setProviderLabel] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!canView || !companyAccess?.activeCompanyId) {
      setStatus("NOT_CONFIGURED");
      setProviderLabel("");
      return;
    }
    setLoading(true);
    const result = await loadSmsProviderStatus();
    setStatus(result.status);
    setProviderLabel(result.providerLabel || result.providerId || "");
    setLoading(false);
  };

  useEffect(() => { void load(); }, [canView, companyAccess?.activeCompanyId]);

  return (
    <section className="space-y-4" data-sms-provider-status={status} aria-labelledby="sms-provider-status-title">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:p-5">
        <div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Smartphone className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Email / SMS · Provider</p><h2 id="sms-provider-status-title" className="mt-1 text-lg font-black text-slate-950">SMS provider status</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">SMS is kept behind a server-side provider adapter. No provider credentials are sent to the browser, and no delivery claim is made until an approved provider is configured and tested.</p></div></div>
        <button type="button" onClick={() => void load()} disabled={loading || !canView || !companyAccess?.activeCompanyId} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</button>
      </div>

      {!canView ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><strong>SMS provider status is restricted.</strong><p className="mt-1">This access profile does not include outbound message permission.</p></div>
        : status === "READY" ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><div className="flex items-center gap-2 font-black"><CheckCircle2 className="h-4 w-4 text-amber-700" />Provider configuration detected</div><p className="mt-2">{providerLabel || "An approved server-side adapter"} is configured. Real SMS sending and delivery status still require synthetic-recipient QA before this channel can be treated as available.</p></div>
          : status === "UNAVAILABLE" ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-900"><div className="flex items-center gap-2 font-black"><AlertCircle className="h-4 w-4" />Provider status unavailable</div><p className="mt-1">The current configuration could not be checked safely. SMS has not been marked as configured.</p></div>
            : <div className="rounded-xl border border-slate-200 bg-slate-50 p-5"><div className="flex items-center gap-2 text-sm font-black text-slate-900"><Smartphone className="h-4 w-4 text-slate-500" />SMS · Not configured</div><p className="mt-2 text-xs leading-5 text-slate-600">No approved SMS provider is configured for this deployment. SMS sending, delivery receipts, sender identity, pricing, and provider health are unavailable.</p><p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">External provider activation required</p></div>}
      {loading && <p className="inline-flex items-center gap-1.5 text-[10px] text-slate-500"><Loader2 className="h-3 w-3 animate-spin" />Checking server-side status…</p>}
    </section>
  );
}

export default SmsProviderStatusPanel;
