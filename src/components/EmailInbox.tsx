import React, { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Inbox, Loader2, LogOut, Mail, Paperclip, RefreshCw, ScanSearch, Sparkles, UploadCloud } from "lucide-react";
import { EmailClassification, GmailConnectionInfo, GmailMessageCandidate, InvoiceData } from "../types";

interface EmailInboxProps {
  invoices: InvoiceData[];
  isProcessing: boolean;
  connection: GmailConnectionInfo;
  onConnectGmail: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onScanGmail: (days: number) => Promise<GmailMessageCandidate[]>;
  onSyncGmail: () => Promise<GmailMessageCandidate[]>;
  onImportGmailMessage: (message: GmailMessageCandidate) => Promise<number>;
  onProcessEmail: (input: { sender: string; subject: string; receivedAt: string; body: string; attachments: File[] }) => Promise<EmailClassification | null>;
  onOpenInvoice: (invoice: InvoiceData) => void;
}

export const EmailInbox: React.FC<EmailInboxProps> = ({ invoices, isProcessing, connection, onConnectGmail, onSignOut, onScanGmail, onSyncGmail, onImportGmailMessage, onProcessEmail, onOpenInvoice }) => {
  const [days, setDays] = useState(30);
  const [candidates, setCandidates] = useState<GmailMessageCandidate[]>([]);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [sender, setSender] = useState("");
  const [subject, setSubject] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [classification, setClassification] = useState<EmailClassification | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  const emailInvoices = useMemo(() => invoices.filter((invoice) => invoice.sourceType === "EMAIL").slice(0, 10), [invoices]);

  const runScan = async (incremental = false) => {
    setGmailBusy(true);
    setGmailError(null);
    try {
      const results = incremental ? await onSyncGmail() : await onScanGmail(days);
      setCandidates(results);
    } catch (error: any) {
      setGmailError(error?.message || "Gmail scan failed.");
    } finally {
      setGmailBusy(false);
    }
  };

  const importCandidate = async (message: GmailMessageCandidate) => {
    setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "IMPORTING" } : item));
    try {
      await onImportGmailMessage(message);
      setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "IMPORTED" } : item));
    } catch (error: any) {
      setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "FAILED" } : item));
      setGmailError(error?.message || `Could not import ${message.subject || "email"}.`);
    }
  };

  const handleManualSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setManualError(null);
    if (!subject.trim() && !body.trim() && attachments.length === 0) {
      setManualError("Add an email subject/body or at least one invoice attachment.");
      return;
    }
    const result = await onProcessEmail({ sender, subject, receivedAt, body, attachments });
    setClassification(result);
  };

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-black text-slate-900">Gmail invoice inbox</h2><p className="text-xs text-slate-500 mt-1">Connect an authorized Gmail account, scan likely invoice emails, preserve the original message and attachments in Supabase, then send the documents through Gemini for review.</p></div>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${connection.hasGmailToken ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600"}`}><Mail className="w-5 h-5" /></div>
            <div><div className="flex items-center gap-2 flex-wrap"><h3 className="text-sm font-black">{connection.hasGmailToken ? "Gmail connected" : "Connect Gmail"}</h3>{connection.hasGmailToken && <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">read-only</span>}</div><p className="text-xs text-slate-500 mt-1">{connection.email || "Each user authorizes their own mailbox. Entering an email address alone never grants access."}</p>{connection.lastSyncedAt && <p className="text-[10px] text-slate-400 mt-1">Last sync: {new Date(connection.lastSyncedAt).toLocaleString()}</p>}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!connection.hasGmailToken ? <button disabled={!connection.configured} onClick={() => void onConnectGmail()} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-2"><Mail className="w-4 h-4" />Connect Google + Gmail</button> : <><button onClick={() => void runScan(true)} disabled={gmailBusy} className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${gmailBusy ? "animate-spin" : ""}`} />Sync new</button><button onClick={() => void onSignOut()} className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold inline-flex items-center gap-2"><LogOut className="w-3.5 h-3.5" />Sign out</button></>}
          </div>
        </div>

        {!connection.configured && <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900"><b>Supabase setup required:</b> add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, apply the included migration, then enable Google OAuth in the new Supabase project.</div>}

        {connection.hasGmailToken && <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-end gap-3"><label className="text-[10px] font-bold uppercase text-slate-500">Initial scan window<select value={days} onChange={(e) => setDays(Number(e.target.value))} className="block mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={180}>Last 180 days</option></select></label><button onClick={() => void runScan(false)} disabled={gmailBusy} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50">{gmailBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}Scan likely invoice emails</button><p className="text-[10px] text-slate-500 sm:pb-2">Gmail search narrows candidates first; Gemini then classifies them before import.</p></div>}
        {gmailError && <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{gmailError}</div>}
      </section>

      {candidates.length > 0 && <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="text-sm font-black">Gmail scan results</h3><p className="text-[10px] text-slate-500 mt-1">Import saves the original email + attachments first, then extracts supported PDF/image documents.</p></div><span className="text-[10px] font-black bg-slate-100 px-2.5 py-1 rounded-full">{candidates.length} candidates</span></div><div className="mt-4 space-y-2.5">{candidates.map((message) => {
        const cls = message.classification;
        const recommended = cls?.isInvoiceLike;
        return <div key={message.id} className="border border-slate-200 rounded-2xl p-3.5 flex flex-col lg:flex-row lg:items-center gap-3"><div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${recommended ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}><Inbox className="w-4 h-4" /></div><div className="min-w-0 flex-1"><div className="flex gap-2 items-center flex-wrap"><p className="text-xs font-black truncate">{message.subject || "(No subject)"}</p>{cls && <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase ${recommended ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{cls.documentType} {Math.round(cls.confidence || 0)}%</span>}</div><p className="text-[10px] text-slate-500 mt-1 truncate">{message.sender} • {new Date(message.receivedAt).toLocaleString()} • {message.attachments.length} attachment{message.attachments.length === 1 ? "" : "s"}</p>{cls?.reason && <p className="text-[10px] text-slate-600 mt-1 line-clamp-1">{cls.reason}</p>}</div><button disabled={message.importStatus === "IMPORTING" || message.importStatus === "IMPORTED"} onClick={() => void importCandidate(message)} className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 ${recommended ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{message.importStatus === "IMPORTING" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : message.importStatus === "IMPORTED" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <UploadCloud className="w-3.5 h-3.5" />}{message.importStatus === "IMPORTED" ? "Imported" : recommended ? "Import & extract" : "Import anyway"}</button></div>;
      })}</div></section>}

      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-600" /><div><h3 className="text-sm font-black">Manual email fallback</h3><p className="text-[10px] text-slate-500">Keep this for forwarded messages or unsupported mailboxes.</p></div></div>
        <form onSubmit={handleManualSubmit} className="mt-4 grid lg:grid-cols-2 gap-4">
          <div className="space-y-3"><input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="Sender" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs" /><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs" /><input type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs" /><label className="block rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-600 cursor-pointer"><div className="flex items-center gap-2"><Paperclip className="w-4 h-4" /><span>{attachments.length ? `${attachments.length} attachment(s) selected` : "Attach PDF/image invoices"}</span></div><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf" className="hidden" onChange={(e) => setAttachments(Array.from(e.target.files || []))} /></label></div>
          <div className="space-y-3"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Paste email body..." className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs resize-y" /><button disabled={isProcessing} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50">{isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Classify & extract</button></div>
        </form>
        {manualError && <div className="mt-3 text-xs text-rose-700 flex gap-2"><AlertCircle className="w-4 h-4" />{manualError}</div>}
        {classification && <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs"><b>{classification.documentType}</b> • {Math.round(classification.confidence || 0)}% • {classification.reason}</div>}
      </section>

      {emailInvoices.length > 0 && <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><h3 className="text-sm font-black">Recently imported from email</h3><div className="mt-3 grid md:grid-cols-2 gap-2">{emailInvoices.map((invoice) => <button key={invoice.id} onClick={() => onOpenInvoice(invoice)} className="text-left border border-slate-200 rounded-xl p-3 hover:bg-slate-50"><div className="flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-600" /><span className="text-xs font-black">{invoice.invoiceNumber || invoice.fileName}</span></div><p className="text-[10px] text-slate-500 mt-1 truncate">{invoice.sourceMetadata?.subject || invoice.sourceMetadata?.sender || "Email source"}</p></button>)}</div></section>}
    </div>
  );
};
