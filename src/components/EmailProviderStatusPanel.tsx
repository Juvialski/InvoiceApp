import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { useAppPermission } from "../app/AppPermissionContext.tsx";
import { useOptionalCompanyAccess } from "../context/CompanyAccessContext.tsx";
import { loadEmailProviderStatus, type EmailProviderStatus, type EmailProviderUiStatus } from "../lib/emailMessaging.ts";
import { PERMISSION_KEYS } from "../utils/accessControl.ts";

interface EmailProviderStatusPanelProps {
  readonly onOpenCompose?: () => void;
}

const EMPTY_STATUS: EmailProviderStatus = {
  status: "NOT_CONFIGURED",
  message: "Configure the deployment email provider before sending.",
};

function statusLabel(status: EmailProviderUiStatus) {
  if (status === "READY") return "Ready";
  if (status === "SENDER_SETUP_REQUIRED") return "Sender setup required";
  if (status === "CONNECTION_PROBLEM") return "Connection problem";
  return "Not configured";
}

function statusClass(status: EmailProviderUiStatus) {
  if (status === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "CONNECTION_PROBLEM") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

export function EmailProviderStatusPanel({ onOpenCompose }: EmailProviderStatusPanelProps) {
  const companyAccess = useOptionalCompanyAccess();
  const canView = useAppPermission(PERMISSION_KEYS.documentSend);
  const [status, setStatus] = useState<EmailProviderStatus>(EMPTY_STATUS);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!canView || !companyAccess?.activeCompanyId) {
      setStatus(EMPTY_STATUS);
      return;
    }
    setLoading(true);
    try { setStatus(await loadEmailProviderStatus()); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [canView, companyAccess?.activeCompanyId]);

  return (
    <section className="space-y-4" data-email-provider-status={status.status} aria-labelledby="email-provider-status-title">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:p-5">
        <div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Mail className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-700">Email / SMS</p><h2 id="email-provider-status-title" className="mt-1 text-lg font-black text-slate-950">Email setup</h2><p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-slate-700">Brevo — {statusLabel(status.status)}</p></div></div>
        <button type="button" onClick={() => void load()} disabled={loading || !canView || !companyAccess?.activeCompanyId} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Verify</button>
      </div>

      {!canView ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><strong>Email provider status is restricted.</strong><p className="mt-1">This access profile does not include outbound message permission.</p></div> : <>
        <div className={`rounded-2xl border p-4 sm:p-5 ${statusClass(status.status)}`}>
          <div className="flex items-start gap-2.5">{status.status === "READY" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}<div className="min-w-0"><p className="text-sm font-black">{statusLabel(status.status)}</p><p className="mt-1 text-xs leading-5">{status.message}</p>{status.senderEmail && <p className="mt-2 text-[11px] font-semibold">Sender: {status.senderName ? `${status.senderName} · ` : ""}{status.senderEmail}</p>}</div></div>
          {status.status === "READY" && onOpenCompose && <button type="button" onClick={onOpenCompose} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700"><Mail className="h-3.5 w-3.5" />Open Compose</button>}
        </div>

        <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" open={status.status !== "READY"}>
          <summary className="cursor-pointer list-none text-sm font-black text-slate-900">How to set up email</summary>
          <div className="mt-4 grid gap-4 text-xs leading-5 text-slate-600 lg:grid-cols-2"><div><h3 className="font-black text-slate-900">Deployment operator</h3><ol className="mt-2 list-decimal space-y-1 pl-5"><li>Create a Brevo account controlled by the company.</li><li>Create a server-side API key and place it in the deployment secret store.</li><li>Set the company sender email and display name in the same secret store.</li><li>Add a Reply-To address only when the company has approved one.</li></ol></div><div><h3 className="font-black text-slate-900">Verify before sending</h3><p className="mt-2">Verify the company email/domain in Brevo before sending. Use Verify here after the deployment settings change. HydroQualiSense reports provider acceptance separately from confirmed delivery.</p><p className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500"><ShieldCheck className="h-3.5 w-3.5" />The browser never receives the provider secret.</p><a className="mt-3 inline-flex items-center gap-1 font-black text-indigo-700 hover:underline" href="https://developers.brevo.com/reference/send-transac-email" target="_blank" rel="noreferrer">Brevo transactional email guide <ExternalLink className="h-3 w-3" /></a></div></div>
        </details>
      </>}
      {loading && <p className="inline-flex items-center gap-1.5 text-[10px] text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking provider status…</p>}
    </section>
  );
}

export default EmailProviderStatusPanel;
