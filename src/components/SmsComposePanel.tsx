import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, MessageSquareText, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useOptionalAssistant } from "../assistant/AssistantProvider.tsx";
import { useOptionalCompanyAccess } from "../context/CompanyAccessContext.tsx";
import { loadCommunicationsDeliveryHistory } from "../lib/documentDelivery.ts";
import { loadSmsProviderStatus, sendSmsMessage, SmsSendError, type SmsProviderOverview } from "../lib/messaging.ts";
import { newDocumentDeliveryAttemptKey } from "../lib/documentDelivery.ts";
import { normalizePhilippineMobileNumber, SMS_MAX_MESSAGE_LENGTH } from "../lib/smsNumber.ts";

interface SmsComposePanelProps {
  readonly canSend: boolean;
  readonly onOpenStatus: () => void;
  readonly onOpenEmailCompose?: () => void;
  readonly onSent?: () => void;
}

const EMPTY_OVERVIEW: SmsProviderOverview = {
  status: "NOT_CONFIGURED",
  providers: [
    { status: "NOT_CONFIGURED", providerId: "ANDROID_SIM_GATEWAY", providerLabel: "Company SIM Gateway" },
    { status: "NOT_CONFIGURED", providerId: "PHILSMS", providerLabel: "PhilSMS" },
  ],
};

function statusLabel(status: SmsProviderOverview["status"]) {
  if (status === "READY") return "Ready";
  if (status === "CONFIGURED_UNVERIFIED") return "Configured / awaiting verification";
  if (status === "DEGRADED") return "Offline / error";
  if (status === "UNAVAILABLE") return "Status unavailable";
  return "Not configured";
}

export function SmsComposePanel({ canSend, onOpenStatus, onOpenEmailCompose, onSent }: SmsComposePanelProps) {
  const assistant = useOptionalAssistant();
  const companyAccess = useOptionalCompanyAccess();
  const [overview, setOverview] = useState<SmsProviderOverview>(EMPTY_OVERVIEW);
  const [statusLoading, setStatusLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyBlocked, setHistoryBlocked] = useState(false);
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => newDocumentDeliveryAttemptKey());

  const refreshStatus = async () => {
    if (!canSend || !companyAccess?.activeCompanyId) {
      setOverview(EMPTY_OVERVIEW);
      return;
    }
    setStatusLoading(true);
    try { setOverview(await loadSmsProviderStatus()); }
    finally { setStatusLoading(false); }
  };

  useEffect(() => { void refreshStatus(); }, [canSend, companyAccess?.activeCompanyId]);

  useEffect(() => {
    let cancelled = false;
    if (!canSend || !companyAccess?.activeCompanyId) {
      setHistoryLoading(false);
      setHistoryBlocked(false);
      return () => { cancelled = true; };
    }
    setHistoryLoading(true);
    void loadCommunicationsDeliveryHistory()
      .then((entries) => { if (!cancelled) setHistoryBlocked(entries.some((entry) => entry.deliveryKind === "GENERAL_SMS" && entry.reconciliationRequired)); })
      .catch(() => { if (!cancelled) setHistoryBlocked(true); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [canSend, companyAccess?.activeCompanyId]);

  const normalizedDestination = useMemo(() => {
    try { return normalizePhilippineMobileNumber(to); } catch { return to.trim() || "Not entered"; }
  }, [to]);
  const canUseSms = canSend && overview.status === "READY" && !statusLoading && !historyLoading && !historyBlocked;

  const askAssistant = async () => {
    if (!assistant) return;
    assistant.open();
    await assistant.sendMessage("Prepare a transactional SMS draft for my review. Use one Philippine mobile recipient and a concise plain-text message. Do not send anything.");
  };

  const send = async () => {
    setError("");
    setResult("");
    if (!to.trim()) { setError("Enter one Philippine mobile number."); return; }
    if (!message.trim()) { setError("Enter an SMS message before reviewing the send."); return; }
    if (!canSend) { setError("Outbound messaging is not available for this access profile."); return; }
    if (overview.status !== "READY") { setError("Verify an SMS provider before sending."); return; }
    if (historyLoading || historyBlocked) { setError("Check Sent / Delivery History and reconcile any unresolved SMS before starting another attempt."); return; }
    if (!reviewOpen) { setError("Review the SMS before confirming the send."); return; }
    setBusy(true);
    try {
      const sent = await sendSmsMessage({ destination: to, message, idempotencyKey });
      setResult(sent.status === "DELIVERED" ? "SMS delivery was confirmed." : sent.status === "SENT" ? "SMS was sent. Check history for later delivery status." : "SMS was accepted by the provider. Check history for delivery status.");
      setReviewOpen(false);
      setIdempotencyKey(newDocumentDeliveryAttemptKey());
      onSent?.();
    } catch (nextError) {
      if (nextError instanceof SmsSendError && nextError.reconciliationRequired) {
        setHistoryBlocked(true);
        setReviewOpen(false);
        setError("SMS acceptance could not be confirmed safely. Check Sent / Delivery History before retrying.");
      } else {
        setError(nextError instanceof Error ? nextError.message : "The SMS could not be sent safely.");
        setIdempotencyKey(newDocumentDeliveryAttemptKey());
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4" data-sms-compose="true" aria-labelledby="sms-compose-title">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 sm:flex-row sm:items-start sm:p-5">
        <div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm"><MessageSquareText className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Email / SMS · Compose</p><h2 id="sms-compose-title" className="mt-1 text-lg font-black text-slate-950">New SMS</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-emerald-950">Send one reviewed transactional message to one Philippine mobile recipient. The browser never receives provider credentials.</p></div></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={onOpenStatus} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-50"><ShieldCheck className="h-3.5 w-3.5" />SMS setup</button>{onOpenEmailCompose && <button type="button" onClick={onOpenEmailCompose} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">Email compose</button>}</div>
      </div>

      <section className={`rounded-2xl border p-4 sm:p-5 ${overview.status === "READY" ? "border-emerald-200 bg-emerald-50/50" : overview.status === "DEGRADED" ? "border-rose-200 bg-rose-50/50" : "border-slate-200 bg-white"}`} aria-label="SMS provider readiness">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-start gap-2.5">{overview.status === "READY" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}<div className="min-w-0"><p className="text-xs font-black text-slate-900">{overview.providerLabel || "SMS provider"} · {statusLabel(overview.status)}</p><p className="mt-0.5 break-words text-[11px] text-slate-600">{overview.message || "Open SMS setup to configure or verify one of the supported provider paths."}</p></div></div><button type="button" onClick={() => void refreshStatus()} disabled={statusLoading || !canSend || !companyAccess?.activeCompanyId} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${statusLoading ? "animate-spin" : ""}`} />Refresh</button></div>
        {!canSend && <p className="mt-3 text-[10px] font-semibold text-amber-800">Sending requires the existing outbound document/message permission.</p>}
        {historyBlocked && <p className="mt-3 text-[10px] font-semibold text-amber-800">Sending is locked until unresolved SMS delivery history is reconciled safely.</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4">
          <label className="space-y-1"><span className="field-label">Philippine mobile recipient</span><input className="field-input" type="tel" value={to} onChange={(event) => setTo(event.target.value)} placeholder="09XX XXX XXXX or +639XXXXXXXXX" autoComplete="tel" inputMode="tel" /><span className="mt-1 block text-[10px] text-slate-500">One recipient per confirmed send. Accepted input is normalized to {normalizedDestination === "Not entered" ? "E.164" : normalizedDestination}.</span></label>
          <label className="space-y-1"><span className="field-label">Message</span><textarea className="field-input min-h-36 resize-y" value={message} onChange={(event) => setMessage(event.target.value.slice(0, SMS_MAX_MESSAGE_LENGTH))} placeholder="Write a concise transactional message…" maxLength={SMS_MAX_MESSAGE_LENGTH} /><span className="mt-1 block text-right text-[10px] text-slate-500">{message.length}/{SMS_MAX_MESSAGE_LENGTH}</span></label>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => void askAssistant()} disabled={!assistant || assistant.isLoading} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" />Ask Assistant to draft</button><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setReviewOpen((value) => !value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">{reviewOpen ? "Hide review" : "Preview / Review"}</button><button type="button" onClick={() => void send()} disabled={busy || !canUseSms || !reviewOpen} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquareText className="h-3.5 w-3.5" />}{busy ? "Sending…" : "Confirm & Send SMS"}</button></div></div>

        {reviewOpen && <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3.5 text-xs" data-sms-compose-review="true"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Review before sending</p><dl className="mt-3 grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]"><dt className="font-bold text-slate-500">Recipient</dt><dd className="break-words font-semibold text-slate-900">{normalizedDestination}</dd><dt className="font-bold text-slate-500">Provider</dt><dd className="break-words text-slate-700">{overview.providerLabel || "Not verified"}</dd></dl><p className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-white/80 bg-white/70 p-3 leading-5 text-slate-800">{message || "Message body not entered."}</p><p className="mt-2 text-[10px] text-slate-500">Confirm &amp; Send executes exactly one provider call for this idempotency key. If acceptance is ambiguous, retry remains locked until status is reconciled.</p></div>}
        {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}
        {result && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />{result}</p>}
      </section>
    </section>
  );
}

export default SmsComposePanel;
