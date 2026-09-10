import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, History, Loader2, Mail, RefreshCw, RotateCcw, ShieldAlert, Smartphone } from "lucide-react";
import { useOptionalCompanyAccess } from "../context/CompanyAccessContext.tsx";
import { useAppPermission } from "../app/AppPermissionContext.tsx";
import { PERMISSION_KEYS } from "../utils/accessControl.ts";
import { loadCommunicationsDeliveryHistory, type DocumentDeliveryHistoryEntry } from "../lib/documentDelivery.ts";

interface CommunicationHistoryPanelProps {
  readonly documentType?: "PURCHASE_ORDER" | "CLIENT_INVOICE";
  readonly documentId?: string;
  readonly onOpenDocument?: (entry: DocumentDeliveryHistoryEntry) => void;
  readonly onCompose?: (entry: DocumentDeliveryHistoryEntry) => void;
}

function statusClass(status: DocumentDeliveryHistoryEntry["status"]) {
  if (status === "SENT") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "FAILED") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function timeLabel(value: string) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function CommunicationHistoryPanel({ documentType, documentId, onOpenDocument, onCompose }: CommunicationHistoryPanelProps) {
  const companyAccess = useOptionalCompanyAccess();
  const canView = useAppPermission(PERMISSION_KEYS.documentSend);
  const [entries, setEntries] = useState<readonly DocumentDeliveryHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!canView || !companyAccess?.activeCompanyId) {
      setEntries([]);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try { setEntries(await loadCommunicationsDeliveryHistory({ documentType, documentId })); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Communication delivery history could not be loaded safely."); }
    finally { setLoading(false); }
  }, [canView, companyAccess?.activeCompanyId, documentId, documentType]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <section className="space-y-4" data-communication-history="true" aria-labelledby="communication-history-title">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:p-5">
        <div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><History className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Email / SMS · Sent</p><h2 id="communication-history-title" className="mt-1 text-lg font-black text-slate-950">Sent / Delivery History</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">One company-scoped view of outbound Gmail and future channel attempts. Unresolved deliveries remain locked until they are reconciled.</p></div></div>
        <button type="button" onClick={() => void refresh()} disabled={loading || !canView || !companyAccess?.activeCompanyId} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</button>
      </div>

      {!canView && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><strong>Delivery history is restricted.</strong><p className="mt-1">This access profile does not include outbound message permission, so no recipient or delivery records are shown.</p></div>}
      {canView && !companyAccess?.activeCompanyId && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">Connect the authenticated company workspace to load immutable delivery history. No local or cross-company records are inferred.</div>}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-900"><strong>History unavailable.</strong><p className="mt-1">{error}</p></div>}
      {canView && companyAccess?.activeCompanyId && loading && <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-xs font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-indigo-600" />Loading delivery history…</div>}
      {canView && companyAccess?.activeCompanyId && !loading && !error && entries.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500"><Mail className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 font-bold text-slate-700">No outbound attempts recorded</p><p className="mt-1">Confirmed email sends and terminal failures will appear here.</p></div>}

      {entries.length > 0 && <div className="space-y-3">{entries.map((entry) => {
        const isSms = entry.channel === "SMS";
        const hasDocument = Boolean(entry.documentType && entry.documentId);
        return <article key={entry.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4" data-delivery-attempt={entry.id} data-delivery-status={entry.status}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusClass(entry.status)}`}>{entry.status}</span><span className="inline-flex items-center gap-1 text-xs font-black text-slate-800">{isSms ? <Smartphone className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}{isSms ? "SMS" : "Email"}</span><span className="text-[10px] text-slate-500">{entry.senderLabel}</span></div><time dateTime={entry.sentAt} className="text-[10px] text-slate-500">{timeLabel(entry.sentAt)}</time></div>
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-[7rem_minmax(0,1fr)]"><span className="font-bold text-slate-500">Recipient</span><span className="break-words font-semibold text-slate-900">{entry.recipients.join(", ") || "Not recorded"}</span><span className="font-bold text-slate-500">Subject</span><span className="break-words text-slate-800">{entry.subject || "No subject"}</span><span className="font-bold text-slate-500">Attachment</span><span className="break-words text-slate-700">{entry.attachmentName || "No attachment"}{entry.attachmentSource === "NONE" ? "" : ` · ${entry.attachmentSource.replaceAll("_", " ")}`}</span><span className="font-bold text-slate-500">Record</span><span className="break-words text-slate-700">{hasDocument ? `${entry.documentType === "PURCHASE_ORDER" ? "Purchase Order" : "Client Invoice"} · ${entry.documentId}` : "Ordinary email"}</span></div>
          <div className={`mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-[10px] leading-4 ${entry.reconciliationRequired ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-100 bg-slate-50 text-slate-600"}`}>{entry.reconciliationRequired ? <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : entry.status === "SENT" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}<span>{entry.safeMessage}{entry.attemptCount > 1 ? ` Attempt ${entry.attemptCount}.` : ""}</span></div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">{hasDocument && onOpenDocument && <button type="button" onClick={() => onOpenDocument(entry)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-700 hover:bg-slate-50">Open owning document</button>}{entry.resendAllowed && !entry.reconciliationRequired && onCompose && <button type="button" onClick={() => onCompose(entry)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-black text-indigo-700 hover:bg-indigo-100"><RotateCcw className="h-3 w-3" />Prepare new attempt</button>}{entry.reconciliationRequired && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800"><AlertTriangle className="h-3 w-3" />Retry locked pending reconciliation</span>}</div>
        </article>;
      })}</div>}
    </section>
  );
}

export default CommunicationHistoryPanel;
