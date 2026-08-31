import React, { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileSpreadsheet, FileText, Inbox, Loader2, Mail, Paperclip, RefreshCw, ScanSearch, Sparkles, UploadCloud } from "lucide-react";
import { EmailClassification, GmailConnectionInfo, GmailMessageCandidate, GmailScanWindow, InvoiceData } from "../types";
import { formatDateTime } from "../config/regional";
import { getInvoiceDisplay } from "../utils/invoiceDisplay";
import { appPathForTab } from "../utils/appRouting.ts";
import type { AppNavigate } from "../utils/clientNavigation.ts";
import {
  classifyEmailIntakeCandidate,
  prepareGmailStatementReview,
  scanConnectedMailbox,
  syncConnectedMailbox,
  type EmailIntakeClassification,
} from "../lib/emailIntake.ts";
import { PageHeader, StatusBadge } from "./ui/OperationsUI";

interface EmailInboxProps {
  invoices: InvoiceData[];
  isProcessing: boolean;
  connection: GmailConnectionInfo;
  onConnectGmail: () => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
  onScanGmail: (window: GmailScanWindow) => Promise<GmailMessageCandidate[]>;
  onSyncGmail: () => Promise<GmailMessageCandidate[]>;
  onImportGmailMessage: (message: GmailMessageCandidate) => Promise<number>;
  onProcessEmail: (input: { sender: string; subject: string; receivedAt: string; body: string; attachments: File[] }) => Promise<EmailClassification | null>;
  onOpenInvoice: (invoice: InvoiceData) => void;
  onNavigatePath?: AppNavigate;
  canManageMailbox?: boolean;
  canProcessInvoices?: boolean;
  canImportBankStatements?: boolean;
}

function destinationFor(message: GmailMessageCandidate) {
  const classification = (message.classification || classifyEmailIntakeCandidate(message)) as EmailIntakeClassification;
  return classification.suggestedDestination || (classification.isInvoiceLike ? "INVOICE" : "UNSUPPORTED");
}

export const EmailInbox: React.FC<EmailInboxProps> = ({
  invoices,
  isProcessing,
  connection,
  onConnectGmail,
  onImportGmailMessage,
  onProcessEmail,
  onOpenInvoice,
  onNavigatePath,
  canManageMailbox = true,
  canProcessInvoices = true,
  canImportBankStatements = false,
}) => {
  const [days, setDays] = useState(30);
  const [scanMode, setScanMode] = useState<"days" | "custom">("days");
  const [customAfter, setCustomAfter] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [customBefore, setCustomBefore] = useState(() => new Date().toISOString().slice(0, 10));
  const [candidates, setCandidates] = useState<GmailMessageCandidate[]>([]);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState(connection.lastHistoryId || "");
  const [lastSyncedAt, setLastSyncedAt] = useState(connection.lastSyncedAt || "");
  const [statementAttachmentSelection, setStatementAttachmentSelection] = useState<Record<string, string>>({});
  const [sender, setSender] = useState("");
  const [subject, setSubject] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [classification, setClassification] = useState<EmailClassification | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  const emailInvoices = useMemo(() => invoices.filter((invoice) => invoice.sourceType === "EMAIL").slice(0, 10), [invoices]);

  const connectMailbox = async () => {
    if (!canManageMailbox) {
      setGmailError("Mailbox connection management requires Gmail management permission. Your Engoryx session remains active.");
      return;
    }
    setConnectBusy(true);
    setGmailError(null);
    try { await onConnectGmail(); }
    catch (error: any) { setGmailError(error?.message || "Gmail could not be connected. Your Engoryx session remains active."); }
    finally { setConnectBusy(false); }
  };

  const runScan = async (incremental = false) => {
    setGmailBusy(true);
    setGmailError(null);
    try {
      if (!incremental && scanMode === "custom" && (!customAfter || !customBefore || customAfter > customBefore)) throw new Error("Choose a valid custom Gmail date range.");
      const scanWindow: GmailScanWindow = scanMode === "custom" ? { after: customAfter, before: customBefore } : { days };
      const result = incremental && historyId ? await syncConnectedMailbox(historyId) : await scanConnectedMailbox(scanWindow);
      setCandidates(result.messages);
      if (result.historyId) setHistoryId(result.historyId);
      if (result.lastSyncedAt) setLastSyncedAt(result.lastSyncedAt);
    } catch (error: any) {
      setGmailError(error?.message || "Connected mailbox scan failed.");
    } finally {
      setGmailBusy(false);
    }
  };

  const importCandidate = async (message: GmailMessageCandidate) => {
    if (!canManageMailbox) {
      setGmailError("Preserving and importing an email requires Gmail management permission.");
      return;
    }
    if (!canProcessInvoices) {
      setGmailError("Invoice extraction requires invoice management, extraction, and verification permissions in this company.");
      return;
    }
    setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "IMPORTING" } : item));
    try {
      await onImportGmailMessage(message);
      setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "IMPORTED" } : item));
    } catch (error: any) {
      setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "FAILED" } : item));
      setGmailError(error?.message || `Could not import ${message.subject || "email"}.`);
    }
  };

  const reviewStatement = async (message: GmailMessageCandidate) => {
    if (!canManageMailbox) {
      setGmailError("Preserving a statement email requires Gmail management permission.");
      return;
    }
    if (!canImportBankStatements) {
      setGmailError("Reviewing a bank statement requires Cash & Banking import permission.");
      return;
    }
    setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "IMPORTING" } : item));
    try {
      const classification = (message.classification || classifyEmailIntakeCandidate(message)) as EmailIntakeClassification;
      const attachmentId = statementAttachmentSelection[message.id] || classification.statementAttachmentIds?.[0];
      await prepareGmailStatementReview(message, attachmentId);
      setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "IMPORTED" } : item));
      const cashPath = appPathForTab("cash");
      if (onNavigatePath) onNavigatePath(cashPath);
      else if (typeof window !== "undefined") window.location.assign(cashPath);
    } catch (error: any) {
      setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "FAILED" } : item));
      setGmailError(error?.message || `Could not prepare ${message.subject || "statement"} for review.`);
    }
  };

  const handleManualSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setManualError(null);
    if (!canProcessInvoices) {
      setManualError("Invoice extraction requires invoice management, extraction, and verification permissions in this company.");
      return;
    }
    if (!subject.trim() && !body.trim() && attachments.length === 0) {
      setManualError("Add an email subject/body or at least one invoice attachment.");
      return;
    }
    const result = await onProcessEmail({ sender, subject, receivedAt, body, attachments });
    setClassification(result);
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Operational intake" title="Email Intake" description="Scan a connected read-only Gmail mailbox, classify finance documents, and route supported invoices or bank statements into their existing review workflows." />

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${connection.hasGmailToken ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600"}`}><Mail className="w-5 h-5" /></div>
            <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-black">{connection.hasGmailToken ? "Connected mailbox" : "Connect Gmail"}</h3><StatusBadge tone={connection.hasGmailToken ? "success" : "warning"}>{connection.hasGmailToken ? "Read-only" : "Action required"}</StatusBadge></div><p className="mt-1 text-xs text-slate-500">{connection.email || "Each user authorizes their own mailbox. Entering an email address alone never grants access."}</p>{lastSyncedAt && <p className="mt-1 text-[10px] text-slate-400">Last sync: {formatDateTime(lastSyncedAt)}</p>}<p className="mt-1 text-[10px] text-slate-400">Gmail authorization is separate from your Engoryx sign-in. Reconnecting Gmail does not sign you out of Engoryx.</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!connection.hasGmailToken ? <button disabled={!connection.configured || !connection.signedIn || !canManageMailbox || connectBusy} onClick={() => void connectMailbox()} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-2">{connectBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}Connect Google + Gmail</button> : <><button onClick={() => void runScan(true)} disabled={gmailBusy} className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${gmailBusy ? "animate-spin" : ""}`} />Sync new</button>{canManageMailbox && <button onClick={() => void connectMailbox()} disabled={connectBusy} className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${connectBusy ? "animate-spin" : ""}`} />Reconnect Gmail</button>}</>}
          </div>
        </div>

        {!connection.configured && <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900"><b>Email connection is not configured.</b> Contact your administrator to enable mailbox access.</div>}
        {connection.configured && !canManageMailbox && !connection.hasGmailToken && <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900"><b>Mailbox connection requires Gmail management permission.</b> Existing read-only authorization can still be used for scanning when available.</div>}

        {connection.hasGmailToken && <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-end gap-3"><label className="text-[10px] font-bold uppercase text-slate-500">Initial scan window<select value={scanMode === "custom" ? "custom" : String(days)} onChange={(e) => { if (e.target.value === "custom") setScanMode("custom"); else { setScanMode("days"); setDays(Number(e.target.value)); } }} className="block mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value="custom">Custom range</option></select></label>{scanMode === "custom" && <div className="flex items-end gap-2"><label className="text-[10px] uppercase font-bold text-slate-500">From<input type="date" value={customAfter} onChange={(e) => setCustomAfter(e.target.value)} className="block mt-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-800" /></label><label className="text-[10px] uppercase font-bold text-slate-500">To<input type="date" value={customBefore} onChange={(e) => setCustomBefore(e.target.value)} className="block mt-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-800" /></label></div>}<button onClick={() => void runScan(false)} disabled={gmailBusy} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50">{gmailBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}Scan finance emails</button><p className="text-[10px] text-slate-500 sm:pb-2">Search is bounded by date and finance signals. Classification does not import or mutate records.</p></div>}
        {gmailError && <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{gmailError}</div>}
      </section>

      {candidates.length > 0 && <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="text-sm font-black">Connected mailbox results</h3><p className="text-[10px] text-slate-500 mt-1">Nothing is imported until you choose an invoice extraction or statement review action.</p></div><span className="text-[10px] font-black bg-slate-100 px-2.5 py-1 rounded-full">{candidates.length} candidates</span></div><div className="mt-4 space-y-2.5">{candidates.map((message) => {
        const cls = (message.classification || classifyEmailIntakeCandidate(message)) as EmailIntakeClassification;
        const destination = destinationFor(message);
        const statementAttachments = destination === "BANK_STATEMENT" ? message.attachments.filter((attachment) => cls.statementAttachmentIds?.includes(attachment.attachmentId)) : [];
        const selectedStatementAttachment = statementAttachmentSelection[message.id] || statementAttachments[0]?.attachmentId || "";
        const destinationLabel = destination === "BANK_STATEMENT" ? "Bank statement" : destination === "INVOICE" ? "Invoice" : "Needs review";
        const destinationTone = destination === "BANK_STATEMENT" ? "bg-sky-100 text-sky-800" : destination === "INVOICE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600";
        return <div key={message.id} className="border border-slate-200 rounded-2xl p-3.5 flex flex-col lg:flex-row lg:items-center gap-3"><div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${destination === "BANK_STATEMENT" ? "bg-sky-50 text-sky-700" : destination === "INVOICE" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>{destination === "BANK_STATEMENT" ? <FileSpreadsheet className="w-4 h-4" /> : <Inbox className="w-4 h-4" />}</div><div className="min-w-0 flex-1"><div className="flex gap-2 items-center flex-wrap"><p className="text-xs font-black truncate">{message.subject || "(No subject)"}</p><span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase ${destinationTone}`}>{destinationLabel} {Math.round(cls.confidence || 0)}%</span></div><p className="text-[10px] text-slate-500 mt-1 truncate">{message.sender} • {formatDateTime(message.receivedAt)} • {message.attachments.length} attachment{message.attachments.length === 1 ? "" : "s"}</p>{cls.reason && <p className="text-[10px] text-slate-600 mt-1 line-clamp-2">{cls.reason}</p>}{destination === "BANK_STATEMENT" && statementAttachments.length > 1 && <label className="mt-2 block max-w-sm text-[10px] font-bold uppercase text-slate-500">Statement attachment<select className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold normal-case text-slate-800" value={selectedStatementAttachment} onChange={(event) => setStatementAttachmentSelection((current) => ({ ...current, [message.id]: event.target.value }))}>{statementAttachments.map((attachment) => <option key={attachment.attachmentId} value={attachment.attachmentId}>{attachment.filename}</option>)}</select></label>}</div>{destination === "INVOICE" ? (canManageMailbox && canProcessInvoices ? <button disabled={message.importStatus === "IMPORTING" || message.importStatus === "IMPORTED"} onClick={() => void importCandidate(message)} className="px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 bg-indigo-600 text-white">{message.importStatus === "IMPORTING" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : message.importStatus === "IMPORTED" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <UploadCloud className="w-3.5 h-3.5" />}{message.importStatus === "IMPORTED" ? "Imported" : "Import & extract"}</button> : <span className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900">{!canManageMailbox && !canProcessInvoices ? "Requires Gmail + invoice permission" : !canManageMailbox ? "Requires Gmail permission" : "Requires invoice permission"}</span>) : destination === "BANK_STATEMENT" ? (canManageMailbox && canImportBankStatements ? <button disabled={message.importStatus === "IMPORTING"} onClick={() => void reviewStatement(message)} className="px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 bg-sky-700 text-white">{message.importStatus === "IMPORTING" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}Review statement</button> : <span className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900">{!canManageMailbox && !canImportBankStatements ? "Requires Gmail + cash import permission" : !canManageMailbox ? "Requires Gmail permission" : "Requires cash import permission"}</span>) : <span className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-600">No automatic destination</span>}</div>;
      })}</div></section>}

      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-600" /><div><h3 className="text-sm font-black">Manual invoice email fallback</h3><p className="text-[10px] text-slate-500">Keep this for forwarded invoice messages or unsupported mailboxes.</p></div></div>
        {!canProcessInvoices && <div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">Invoice extraction requires invoice management, extraction, and verification permissions. Connected-mailbox scanning remains available, but this access profile cannot create invoice records.</div>}
        <form onSubmit={handleManualSubmit} className="mt-4 grid lg:grid-cols-2 gap-4">
          <div className="space-y-3"><input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="Sender" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs" /><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs" /><input type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs" /><label className="block rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-600 cursor-pointer"><div className="flex items-center gap-2"><Paperclip className="w-4 h-4" /><span>{attachments.length ? `${attachments.length} attachment(s) selected` : "Attach PDF/image invoices"}</span></div><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf" className="hidden" onChange={(e) => setAttachments(Array.from(e.target.files || []))} /></label></div>
          <div className="space-y-3"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Paste email body..." className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs resize-y" /><button disabled={isProcessing || !canProcessInvoices} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50">{isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Classify & extract</button></div>
        </form>
        {manualError && <div className="mt-3 text-xs text-rose-700 flex gap-2"><AlertCircle className="w-4 h-4" />{manualError}</div>}
        {classification && <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs"><b>{classification.documentType}</b>{classification.invoiceSubtype ? ` • ${classification.invoiceSubtype}` : ""} • {Math.round(classification.confidence || 0)}% • {classification.reason}</div>}
      </section>

      {emailInvoices.length > 0 && <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><h3 className="text-sm font-black">Recently imported from email</h3><div className="mt-3 grid md:grid-cols-2 gap-2">{emailInvoices.map((invoice) => { const display = getInvoiceDisplay(invoice); return <button key={invoice.id} onClick={() => onOpenInvoice(invoice)} className="text-left border border-slate-200 rounded-xl p-3 hover:bg-slate-50"><div className="flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-600" /><span className="text-xs font-black truncate">{display.primaryLabel}</span></div><p className="text-[10px] text-slate-600 mt-1 truncate">{display.invoiceLabel} • {display.dateLabel}</p><p className="text-[10px] text-slate-500 mt-1 truncate">{invoice.sourceMetadata?.subject || invoice.sourceMetadata?.sender || "Email source"}</p></button>; })}</div></section>}
    </div>
  );
};
