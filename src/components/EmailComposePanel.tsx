import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, Mail, MessageSquareText, Paperclip, Sparkles } from "lucide-react";
import type { GmailConnectionInfo } from "../types.ts";
import type { FinancialDocumentSnapshot } from "../lib/documentGeneration.ts";
import { documentFileName } from "../lib/documentGeneration.ts";
import { ensureClientInvoiceDocumentSnapshot, ensurePurchaseOrderDocumentSnapshot } from "../lib/documentSnapshots.ts";
import { DocumentSendError, sendEmailMessageByGmail } from "../lib/documentEmail.ts";
import { newDocumentDeliveryAttemptKey } from "../lib/documentDelivery.ts";
import { resolveGmailConnectionStatus } from "../lib/emailIntake.ts";
import type { DocumentRegisterEntry } from "../lib/documentRegister.ts";
import { useOptionalAssistant } from "../assistant/AssistantProvider.tsx";
import { useOptionalCompanyAccess } from "../context/CompanyAccessContext.tsx";
import { loadCommunicationsDeliveryHistory } from "../lib/documentDelivery.ts";

interface EmailComposePanelProps {
  readonly documents: readonly DocumentRegisterEntry[];
  readonly initialDocumentType?: "PURCHASE_ORDER" | "CLIENT_INVOICE";
  readonly initialDocumentId?: string;
  readonly connection: GmailConnectionInfo;
  readonly canSend: boolean;
  readonly onConnectGmail?: () => Promise<void> | void;
  readonly onOpenDocuments: () => void;
  readonly onNavigatePath?: (path: string, replace?: boolean) => void;
  readonly returnPath?: string;
  readonly buildSnapshot: (entry: DocumentRegisterEntry) => FinancialDocumentSnapshot;
  readonly onSent?: () => void;
}

function documentKey(entry: DocumentRegisterEntry) {
  return entry.documentType && entry.documentId ? `${entry.documentType}:${entry.documentId}` : "";
}

function splitRecipients(value: string) {
  return value.split(/[;,\n]/).map((item) => item.trim()).filter(Boolean);
}

function safeDocumentLabel(entry: DocumentRegisterEntry) {
  return `${entry.title} · ${entry.module}${entry.projectLabel ? ` · ${entry.projectLabel}` : ""}`;
}

export function EmailComposePanel({
  documents,
  initialDocumentType,
  initialDocumentId,
  connection,
  canSend,
  onConnectGmail,
  onOpenDocuments,
  onNavigatePath,
  returnPath,
  buildSnapshot,
  onSent,
}: EmailComposePanelProps) {
  const assistant = useOptionalAssistant();
  const companyAccess = useOptionalCompanyAccess();
  const eligibleDocuments = useMemo(() => documents.filter((entry) => entry.emailEligible && entry.documentType && entry.documentId), [documents]);
  const initialKey = initialDocumentType && initialDocumentId
    ? `${initialDocumentType}:${initialDocumentId}`
    : "";
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => newDocumentDeliveryAttemptKey());
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyBlocked, setHistoryBlocked] = useState(false);

  const selectedDocument = useMemo(
    () => eligibleDocuments.find((entry) => documentKey(entry) === selectedKey),
    [eligibleDocuments, selectedKey],
  );
  const connectionStatus = resolveGmailConnectionStatus(connection, error);
  const canUseGmail = canSend && connectionStatus === "HEALTHY" && !historyLoading && !historyBlocked;

  useEffect(() => {
    const requested = initialDocumentType && initialDocumentId ? `${initialDocumentType}:${initialDocumentId}` : "";
    setSelectedKey(requested && eligibleDocuments.some((entry) => documentKey(entry) === requested) ? requested : "");
  }, [eligibleDocuments, initialDocumentId, initialDocumentType]);

  useEffect(() => {
    if (!selectedDocument) return;
    setTo((current) => current.trim() ? current : selectedDocument.counterpartyEmail || "");
    setSubject((current) => current.trim() ? current : selectedDocument.documentType === "PURCHASE_ORDER"
      ? `Purchase Order ${selectedDocument.title}`
      : `Client Invoice ${selectedDocument.title}`);
    setMessage((current) => current.trim() ? current : selectedDocument.documentType === "PURCHASE_ORDER"
      ? "Please find the attached purchase order for your review and confirmation."
      : "Please find the attached client invoice for your review.");
  }, [selectedDocument]);

  useEffect(() => {
    let cancelled = false;
    if (!canSend || !companyAccess?.activeCompanyId) {
      setHistoryLoading(false);
      setHistoryBlocked(false);
      return () => { cancelled = true; };
    }
    setHistoryLoading(true);
    void loadCommunicationsDeliveryHistory()
      .then((entries) => { if (!cancelled) setHistoryBlocked(entries.some((entry) => entry.deliveryKind === "GENERAL_EMAIL" && entry.reconciliationRequired)); })
      .catch(() => { if (!cancelled) setHistoryBlocked(true); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [canSend, companyAccess?.activeCompanyId]);

  const reconnect = async () => {
    if (!onConnectGmail) return;
    setConnectBusy(true);
    setError("");
    try { await onConnectGmail(); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Gmail could not be connected safely."); }
    finally { setConnectBusy(false); }
  };

  const askAssistant = async () => {
    if (!assistant) return;
    const target = selectedDocument ? ` Use the authorized document ${selectedDocument.title} as the optional attachment.` : " Do not assume an attachment is required.";
    assistant.open();
    await assistant.sendMessage(`Prepare an email draft for my review.${target} Include the recipient, subject, and concise message body. Do not send anything.`);
  };

  const send = async () => {
    setError("");
    setResult("");
    const recipients = splitRecipients(to);
    if (!recipients.length) { setError("Enter at least one To recipient email address."); return; }
    if (!subject.trim()) { setError("Enter a subject before reviewing the message."); return; }
    if (!message.trim()) { setError("Enter a message body before reviewing the message."); return; }
    if (!canSend) { setError("Outbound messaging is not available for this access profile."); return; }
    if (connectionStatus !== "HEALTHY") { setError("Connect or reconnect Gmail before sending."); return; }
    if (historyLoading || historyBlocked) { setError("Check Sent / Delivery History and reconcile any unresolved email before starting another attempt."); return; }
    setBusy(true);
    try {
      let snapshot: FinancialDocumentSnapshot | undefined;
      if (selectedDocument) {
        const localSnapshot = buildSnapshot(selectedDocument);
        snapshot = selectedDocument.documentType === "PURCHASE_ORDER"
          ? await ensurePurchaseOrderDocumentSnapshot(selectedDocument.documentId || "") || localSnapshot
          : await ensureClientInvoiceDocumentSnapshot(selectedDocument.documentId || "") || localSnapshot;
      }
      await sendEmailMessageByGmail({
        to: recipients,
        cc: splitRecipients(cc),
        subject,
        message,
        ...(snapshot ? { snapshot, attachmentName: documentFileName(snapshot) } : {}),
        idempotencyKey,
      });
      setResult(selectedDocument ? `Sent with ${selectedDocument.title} attached. Delivery history was recorded.` : "Sent without an attachment. Delivery history was recorded.");
      setReviewOpen(false);
      setIdempotencyKey(newDocumentDeliveryAttemptKey());
      onSent?.();
    } catch (nextError) {
      if (nextError instanceof DocumentSendError && nextError.reconciliationRequired) {
        setError("Gmail delivery could not be confirmed safely. Check Sent / Delivery History before retrying.");
      } else {
        setError(nextError instanceof Error ? nextError.message : "The message could not be sent safely.");
      }
      setIdempotencyKey(newDocumentDeliveryAttemptKey());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4" data-email-compose="true" aria-labelledby="email-compose-title">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 sm:flex-row sm:items-start sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-700 shadow-sm"><MessageSquareText className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-700">Email / SMS · Compose</p>
            <h2 id="email-compose-title" className="mt-1 text-lg font-black text-slate-950">New message</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-indigo-950">Prepare an ordinary email or attach one eligible issued document. Sending always uses the shared Gmail delivery intent and immutable history.</p>
          </div>
        </div>
        <button type="button" onClick={onOpenDocuments} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-50"><FileText className="h-3.5 w-3.5" />Browse Documents</button>
      </div>

      <section className={`rounded-2xl border p-4 sm:p-5 ${connectionStatus === "HEALTHY" ? "border-emerald-200 bg-emerald-50/50" : connectionStatus === "RECONNECT_REQUIRED" ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-white"}`} aria-label="Gmail connection for compose">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {connectionStatus === "HEALTHY" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
            <div className="min-w-0"><p className="text-xs font-black text-slate-900">{connectionStatus === "HEALTHY" ? "Gmail ready for sending" : connectionStatus === "RECONNECT_REQUIRED" ? "Gmail needs reauthorization" : connection.configured ? "Gmail not connected" : "Gmail is not configured"}</p><p className="mt-0.5 break-words text-[11px] text-slate-600">{connectionStatus === "HEALTHY" ? connection.email || "Connected Google identity" : "The workspace remains usable for drafting; connect Gmail before sending."}</p></div>
          </div>
          {connectionStatus !== "HEALTHY" && onConnectGmail && <button type="button" onClick={() => void reconnect()} disabled={connectBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50"><RefreshIcon busy={connectBusy} />{connectionStatus === "RECONNECT_REQUIRED" ? "Reconnect Gmail" : "Connect Gmail"}</button>}
        </div>
        {!canSend && <p className="mt-3 text-[10px] font-semibold text-amber-800">Sending requires the existing outbound document/message permission. Your access profile can still view this workspace where permitted.</p>}
        {canSend && historyBlocked && <p className="mt-3 text-[10px] font-semibold text-amber-800">Sending is locked until unresolved email delivery history is reconciled safely.</p>}
        {canSend && historyLoading && <p className="mt-3 text-[10px] text-slate-500">Checking unresolved delivery history before enabling send…</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-1 lg:col-span-2"><span className="field-label">To</span><input className="field-input" value={to} onChange={(event) => setTo(event.target.value)} placeholder="recipient@example.com, another@example.com" autoComplete="email" /></label>
          <label className="space-y-1"><span className="field-label">CC <span className="font-normal normal-case text-slate-400">(optional)</span></span><input className="field-input" value={cc} onChange={(event) => setCc(event.target.value)} placeholder="copy@example.com" /></label>
          <label className="space-y-1"><span className="field-label">Subject</span><input className="field-input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" /></label>
          <label className="space-y-1 lg:col-span-2"><span className="field-label">Attachment / document <span className="font-normal normal-case text-slate-400">(optional)</span></span><select className="field-input" value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}><option value="">No document attachment</option>{eligibleDocuments.map((entry) => <option key={documentKey(entry)} value={documentKey(entry)}>{safeDocumentLabel(entry)}</option>)}</select><span className="mt-1 block text-[10px] text-slate-500">Only issued Purchase Orders and issued Client Invoices are eligible for the immutable document attachment path.</span></label>
          <label className="space-y-1 lg:col-span-2"><span className="field-label">Message</span><textarea className="field-input min-h-40 resize-y" value={message} onChange={(event) => setMessage(event.target.value.slice(0, 20000))} placeholder="Write the message body…" /></label>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => void askAssistant()} disabled={!assistant || assistant.isLoading} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" />Ask Assistant to draft</button>
          <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setReviewOpen((value) => !value)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><Paperclip className="h-3.5 w-3.5" />{reviewOpen ? "Hide review" : "Preview / Review"}</button><button type="button" onClick={() => void send()} disabled={busy || !canUseGmail} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"><Mail className="h-3.5 w-3.5" />{busy ? "Sending…" : "Confirm & Send"}</button></div>
        </div>

        {reviewOpen && <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5 text-xs" data-email-compose-review="true"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-700">Review before sending</p><dl className="mt-3 grid gap-2 sm:grid-cols-[6rem_minmax(0,1fr)]"><dt className="font-bold text-slate-500">To</dt><dd className="break-words font-semibold text-slate-900">{splitRecipients(to).join(", ") || "Not entered"}</dd><dt className="font-bold text-slate-500">CC</dt><dd className="break-words text-slate-700">{splitRecipients(cc).join(", ") || "None"}</dd><dt className="font-bold text-slate-500">Subject</dt><dd className="break-words text-slate-900">{subject || "Not entered"}</dd><dt className="font-bold text-slate-500">Attachment</dt><dd className="break-words text-slate-700">{selectedDocument ? `${selectedDocument.title} · immutable issued snapshot` : "None — ordinary email"}</dd></dl><p className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-white/80 bg-white/70 p-3 leading-5 text-slate-800">{message || "Message body not entered."}</p><p className="mt-2 text-[10px] text-slate-500">Confirm &amp; Send creates one audited delivery attempt. If Gmail acceptance cannot be confirmed, retry remains locked until history is reconciled.</p></div>}
        {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}
        {result && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />{result}</p>}
      </section>

      {returnPath && <button type="button" onClick={() => onNavigatePath?.(returnPath)} className="text-xs font-black text-indigo-700 hover:underline">Return to {returnPath === "/documents" ? "Documents" : "the previous workspace"}</button>}
    </section>
  );
}

function RefreshIcon({ busy }: { busy: boolean }) {
  return <Loader2 className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />;
}

export default EmailComposePanel;
