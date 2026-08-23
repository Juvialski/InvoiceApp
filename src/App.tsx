import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Cloud, Database, Loader2, X } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { Header, AppTab } from "./components/Header";
import { Dashboard } from "./components/Dashboard";
import { UploadZone, ExtractPayload } from "./components/UploadZone";
import { InvoiceViewer } from "./components/InvoiceViewer";
import { InvoiceDirectory } from "./components/InvoiceDirectory";
import { EmailInbox } from "./components/EmailInbox";
import { Vendors } from "./components/Vendors";
import { Reports } from "./components/Reports";
import { ReviewPanel } from "./components/ReviewPanel";
import { ReviewQueue } from "./components/ReviewQueue";
import { SourceComparison } from "./components/SourceComparison";
import { EmailClassification, GmailConnectionInfo, GmailImportedMessage, GmailMessageCandidate, GmailScanWindow, InvoiceData } from "./types";
import { SAMPLE_INVOICES } from "./data/sampleInvoices";
import { exportBatchInvoicesToExcel } from "./utils/excelExport";
import { applyLocalChecks, findPossibleDuplicate } from "./utils/invoiceLogic";
import { captureGoogleProviderTokens, connectGoogleAndGmail, getGoogleProviderToken, isSupabaseConfigured, signOutWorkspace, supabase } from "./lib/supabase";
import {
  deleteInvoiceFromSupabase,
  ensureWorkspaceProfile,
  loadGmailSyncState,
  loadInvoicesFromSupabase,
  markEmailClassification,
  markSourceDocumentStatus,
  persistNewInvoice,
  saveGmailMessageSource,
  saveGmailSyncState,
  saveManualEmailRecord,
  saveManualSourceDocument,
  updateInvoiceInSupabase,
} from "./lib/persistence";

function prepareStoredInvoice(invoice: InvoiceData): InvoiceData {
  return applyLocalChecks({
    ...invoice,
    sourceType: invoice.sourceType || (invoice.id?.startsWith("sample") ? "SAMPLE" : "UPLOAD"),
    processingStatus: invoice.processingStatus || "EXTRACTED",
    duplicateStatus: invoice.duplicateStatus || "UNIQUE",
  });
}

function localFallbackInvoices() {
  try {
    const saved = localStorage.getItem("extracted_invoices");
    if (saved) return (JSON.parse(saved) as InvoiceData[]).map(prepareStoredInvoice);
  } catch { /* ignore old local data */ }
  return [prepareStoredInvoice({ ...SAMPLE_INVOICES[0].previewData, sourceType: "SAMPLE", modelUsed: "sample-data" })];
}

function fileToBase64(file: File): Promise<{ fileData: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ fileData: result.split(",")[1], mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png") });
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function isExtractableAttachment(mimeType: string, filename: string) {
  return mimeType === "application/pdf" || mimeType.startsWith("image/") || /\.(pdf|png|jpe?g|webp)$/i.test(filename);
}

function gmailQueryDate(value: string, exclusive = false) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value.replaceAll("-", "/");
  if (exclusive) parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10).replaceAll("-", "/");
}

export default function App() {
  const [invoices, setInvoices] = useState<InvoiceData[]>(localFallbackInvoices);
  const invoicesRef = useRef(invoices);
  const lastPersistedRef = useRef(new Map<string, InvoiceData>());
  const updateTimersRef = useRef(new Map<string, number>());
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const [processingCount, setProcessingCount] = useState(0);
  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(isSupabaseConfigured);
  const [syncState, setSyncState] = useState<{ lastHistoryId?: string; lastSyncedAt?: string }>({});

  const showNotification = (type: "success" | "error" | "info", message: string) => {
    setNotification({ type, message });
    window.setTimeout(() => setNotification((current) => current?.message === message ? null : current), 5000);
  };

  const loadWorkspace = async (nextSession: Session | null) => {
    if (!isSupabaseConfigured || !nextSession) {
      setWorkspaceLoading(false);
      return;
    }
    setWorkspaceLoading(true);
    try {
      await ensureWorkspaceProfile();
      const [storedInvoices, storedSync] = await Promise.all([loadInvoicesFromSupabase(), loadGmailSyncState()]);
      const prepared = storedInvoices.map(prepareStoredInvoice);
      invoicesRef.current = prepared;
      setInvoices(prepared);
      lastPersistedRef.current = new Map(prepared.map((invoice) => [invoice.id, invoice]));
      setSyncState(storedSync);
    } catch (error: any) {
      showNotification("error", error?.message || "Could not load the Supabase workspace. Apply the included migration and check project environment variables.");
    } finally {
      setWorkspaceLoading(false);
    }
  };

  useEffect(() => {
    if (!supabase) {
      setWorkspaceLoading(false);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      captureGoogleProviderTokens(data.session);
      setSession(data.session);
      void loadWorkspace(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      captureGoogleProviderTokens(nextSession);
      setSession(nextSession);
      if (nextSession) void loadWorkspace(nextSession);
      else {
        const local = localFallbackInvoices();
        invoicesRef.current = local;
        setInvoices(local);
        setSyncState({});
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    invoicesRef.current = invoices;
    if (!session) {
      try { localStorage.setItem("extracted_invoices", JSON.stringify(invoices)); } catch { /* preview URLs may fill local storage */ }
    }
  }, [invoices, session]);

  useEffect(() => () => {
    updateTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const saveExtracted = async (raw: InvoiceData, previewUrl?: string) => {
    let prepared = prepareStoredInvoice({ ...raw, previewUrl: previewUrl || raw.previewUrl });
    const duplicate = findPossibleDuplicate(prepared, invoicesRef.current);
    if (duplicate) prepared = { ...prepared, duplicateStatus: "POSSIBLE_DUPLICATE", duplicateOfId: duplicate.id, reviewStatus: "NEEDS_REVIEW" };

    if (session && supabase) {
      prepared = await persistNewInvoice(prepared);
      lastPersistedRef.current.set(prepared.id, prepared);
    }

    const next = [prepared, ...invoicesRef.current.filter((item) => item.id !== prepared.id)];
    invoicesRef.current = next;
    setInvoices(next);
    setSelectedInvoice(prepared);
    return prepared;
  };

  const extractPayload = async (payload: any) => {
    const response = await fetch("/api/extract-invoice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || "Invoice extraction failed.");
    return result.data as InvoiceData;
  };

  const handleExtract = async (payload: ExtractPayload) => {
    setProcessingCount((n) => n + 1);
    try {
      let storedSource: Awaited<ReturnType<typeof saveManualSourceDocument>> | undefined;
      if (session && payload.fileData && payload.mimeType && payload.fileName) {
        storedSource = await saveManualSourceDocument({ fileData: payload.fileData, mimeType: payload.mimeType, fileName: payload.fileName });
      }
      let extracted = await extractPayload(payload);
      if (storedSource) {
        extracted = {
          ...extracted,
          fileSize: storedSource.size,
          fileType: storedSource.mimeType,
          previewUrl: storedSource.previewUrl,
          sourceDocumentId: storedSource.id,
          sourceStoragePath: storedSource.storagePath,
          sourceSha256: storedSource.sha256,
          sourceMetadata: { ...(extracted.sourceMetadata || {}), sourceDocumentId: storedSource.id, sourceStoragePath: storedSource.storagePath, sourceSha256: storedSource.sha256 },
        };
      }
      const prepared = await saveExtracted(extracted, storedSource?.previewUrl || payload.previewUrl);
      if (storedSource) await markSourceDocumentStatus(storedSource.id, "EXTRACTED", prepared.documentType);
      showNotification("success", `${session ? "Saved & extracted" : "Extracted locally"} ${prepared.invoiceNumber || prepared.fileName || "invoice"} with ${prepared.modelUsed}.`);
    } catch (error: any) {
      showNotification("error", error?.message || "Invoice extraction failed.");
      throw error;
    } finally {
      setProcessingCount((n) => Math.max(0, n - 1));
    }
  };

  const handleProcessEmail = async ({ sender, subject, receivedAt, body, attachments }: { sender: string; subject: string; receivedAt: string; body: string; attachments: File[] }): Promise<EmailClassification | null> => {
    setProcessingCount((n) => n + 1);
    try {
      const classifyResponse = await fetch("/api/classify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sender, subject, body, attachmentNames: attachments.map((file) => file.name), model: "gemini-3.5-flash-lite" }) });
      const classifyResult = await classifyResponse.json();
      if (!classifyResponse.ok || !classifyResult.success) throw new Error(classifyResult.error || "Email classification failed.");
      const classification: EmailClassification = classifyResult.data;
      const manualEmail = session ? await saveManualEmailRecord({ sender, subject, receivedAt, body }) : undefined;

      if (attachments.length > 0) {
        for (const attachment of attachments) {
          const encoded = await fileToBase64(attachment);
          const storedSource = session ? await saveManualSourceDocument({ ...encoded, fileName: attachment.name, emailMessageId: manualEmail?.id, sourceType: "EMAIL" }) : undefined;
          let extracted = await extractPayload({
            ...encoded,
            fileName: attachment.name,
            model: "gemini-3.5-flash-lite",
            sourceType: "EMAIL",
            emailContext: { sender, subject, receivedAt, body, attachmentName: attachment.name, emailRecordId: manualEmail?.id, sourceDocumentId: storedSource?.id, sourceStoragePath: storedSource?.storagePath },
          });
          extracted = { ...extracted, fileSize: attachment.size, fileType: encoded.mimeType, sourceEmailId: manualEmail?.id, sourceDocumentId: storedSource?.id, sourceStoragePath: storedSource?.storagePath, sourceSha256: storedSource?.sha256, previewUrl: storedSource?.previewUrl || extracted.previewUrl };
          const saved = await saveExtracted(extracted, storedSource?.previewUrl);
          if (storedSource) await markSourceDocumentStatus(storedSource.id, "EXTRACTED", saved.documentType);
        }
      } else {
        let extracted = await extractPayload({ textData: body || subject, fileName: subject || "Email invoice", model: "gemini-3.5-flash-lite", sourceType: "EMAIL", emailContext: { sender, subject, receivedAt, body, emailRecordId: manualEmail?.id } });
        extracted = { ...extracted, sourceEmailId: manualEmail?.id };
        await saveExtracted(extracted);
      }
      showNotification("success", `Email processed: ${classification.documentType || "financial document"} detected and saved for review.`);
      return classification;
    } catch (error: any) {
      showNotification("error", error?.message || "Email processing failed.");
      return null;
    } finally {
      setProcessingCount((n) => Math.max(0, n - 1));
    }
  };

  const gmailRequest = async (path: string, body?: any) => {
    const token = getGoogleProviderToken();
    if (!token) throw new Error("Gmail authorization is missing or expired. Reconnect Google + Gmail.");
    const response = await fetch(path, { method: body ? "POST" : "GET", headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (!response.ok || !result.success) {
      const error: any = new Error(result.error || "Gmail request failed.");
      error.code = result.code;
      throw error;
    }
    return result.data;
  };

  const classifyGmailCandidates = async (messages: GmailMessageCandidate[]) => {
    const output: GmailMessageCandidate[] = [];
    for (let i = 0; i < messages.length; i += 4) {
      const batch = messages.slice(i, i + 4);
      const classified = await Promise.all(batch.map(async (message) => {
        try {
          const response = await fetch("/api/classify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sender: message.sender, subject: message.subject, body: message.bodyText, attachmentNames: message.attachments.map((item) => item.filename), model: "gemini-3.5-flash-lite" }) });
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.error || "Classification failed");
          return { ...message, classification: result.data as EmailClassification, importStatus: result.data.isInvoiceLike ? "READY" as const : "IGNORED" as const };
        } catch {
          return { ...message, importStatus: "READY" as const };
        }
      }));
      output.push(...classified);
    }
    return output;
  };

  const handleScanGmail = async (window: GmailScanWindow | number): Promise<GmailMessageCandidate[]> => {
    if (!session) throw new Error("Connect Google + Gmail first.");
    setProcessingCount((n) => n + 1);
    try {
      const selectedWindow = typeof window === "number" ? { days: window } : window;
      const range = selectedWindow.after && selectedWindow.before
        ? `after:${gmailQueryDate(selectedWindow.after)} before:${gmailQueryDate(selectedWindow.before, true)}`
        : `newer_than:${selectedWindow.days || 30}d`;
      const query = `${range} {subject:invoice subject:receipt subject:statement \"credit note\" \"tax invoice\" filename:pdf filename:png filename:jpg filename:jpeg}`;
      const data = await gmailRequest("/api/gmail/scan", { query, maxResults: 30 });
      const classified = await classifyGmailCandidates(data.messages || []);
      const nextSync = await saveGmailSyncState(data.historyId, data.emailAddress);
      setSyncState(nextSync);
      showNotification("success", `Scanned Gmail and classified ${classified.length} likely finance email${classified.length === 1 ? "" : "s"}.`);
      return classified;
    } finally {
      setProcessingCount((n) => Math.max(0, n - 1));
    }
  };

  const handleSyncGmail = async (): Promise<GmailMessageCandidate[]> => {
    if (!session) throw new Error("Connect Google + Gmail first.");
    if (!syncState.lastHistoryId) return handleScanGmail({ days: 30 });
    setProcessingCount((n) => n + 1);
    try {
      const data = await gmailRequest("/api/gmail/history", { startHistoryId: syncState.lastHistoryId });
      const classified = await classifyGmailCandidates(data.messages || []);
      const nextSync = await saveGmailSyncState(data.historyId, data.emailAddress);
      setSyncState(nextSync);
      showNotification("success", classified.length ? `Found ${classified.length} new/changed Gmail message${classified.length === 1 ? "" : "s"}.` : "Gmail is up to date.");
      return classified;
    } catch (error: any) {
      if (error?.code === "HISTORY_EXPIRED") {
        showNotification("info", "Gmail's incremental cursor expired. Rebuilding it with a fresh 30-day scan.");
        return handleScanGmail({ days: 30 });
      }
      throw error;
    } finally {
      setProcessingCount((n) => Math.max(0, n - 1));
    }
  };

  const handleImportGmailMessage = async (candidate: GmailMessageCandidate) => {
    if (!session) throw new Error("Connect Google + Gmail first.");
    setProcessingCount((n) => n + 1);
    try {
      const imported = await gmailRequest("/api/gmail/import", { messageId: candidate.id }) as GmailImportedMessage;
      const stored = await saveGmailMessageSource(imported);
      if (candidate.classification) await markEmailClassification(stored.email.id, candidate.classification);
      let extractedCount = 0;
      for (let index = 0; index < imported.attachments.length; index += 1) {
        const attachment = imported.attachments[index];
        if (!attachment.dataBase64 || !isExtractableAttachment(attachment.mimeType, attachment.filename)) continue;
        const source = stored.documents[index];
        let extracted = await extractPayload({
          fileData: attachment.dataBase64,
          mimeType: attachment.mimeType,
          fileName: attachment.filename,
          model: "gemini-3.5-flash-lite",
          sourceType: "EMAIL",
          emailContext: {
            sender: imported.sender,
            subject: imported.subject,
            receivedAt: imported.receivedAt,
            body: imported.bodyText,
            attachmentName: attachment.filename,
            gmailAttachmentId: attachment.attachmentId,
            emailReference: imported.id,
            gmailMessageId: imported.id,
            gmailThreadId: imported.threadId,
            emailRecordId: stored.email.id,
            sourceDocumentId: source?.id,
            sourceStoragePath: source?.storagePath,
            rawEmailStoragePath: stored.email.rawStoragePath,
          },
        });
        extracted = {
          ...extracted,
          fileName: attachment.filename,
          fileSize: attachment.size,
          fileType: attachment.mimeType,
          sourceEmailId: stored.email.id,
          sourceDocumentId: source?.id,
          sourceStoragePath: source?.storagePath,
          sourceSha256: source?.sha256,
          previewUrl: source?.previewUrl,
        };
        await saveExtracted(extracted, source?.previewUrl);
        if (source?.id) await markSourceDocumentStatus(source.id, "EXTRACTED", extracted.documentType);
        extractedCount += 1;
      }

      if (extractedCount === 0 && candidate.classification?.isInvoiceLike && imported.bodyText) {
        let extracted = await extractPayload({
          textData: imported.bodyText,
          fileName: imported.subject || "Gmail invoice",
          model: "gemini-3.5-flash-lite",
          sourceType: "EMAIL",
          emailContext: { sender: imported.sender, subject: imported.subject, receivedAt: imported.receivedAt, body: imported.bodyText, emailReference: imported.id, gmailMessageId: imported.id, gmailThreadId: imported.threadId, emailRecordId: stored.email.id, rawEmailStoragePath: stored.email.rawStoragePath },
        });
        extracted = { ...extracted, sourceEmailId: stored.email.id };
        await saveExtracted(extracted);
        extractedCount = 1;
      }
      showNotification("success", `Saved original Gmail message and ${stored.documents.length} attachment${stored.documents.length === 1 ? "" : "s"}; created ${extractedCount} invoice extraction${extractedCount === 1 ? "" : "s"}.`);
      return extractedCount;
    } finally {
      setProcessingCount((n) => Math.max(0, n - 1));
    }
  };

  const handleLoadPreset = async (preset: InvoiceData) => {
    const prepared = prepareStoredInvoice({ ...preset, id: crypto.randomUUID(), sourceType: "SAMPLE", extractedAt: new Date().toISOString(), modelUsed: "sample-data" });
    await saveExtracted(prepared);
    setActiveTab("extractor");
    showNotification("info", session ? "Loaded and saved sample invoice without using Gemini." : "Loaded sample invoice locally without using Gemini.");
  };

  const handleUpdateInvoice = (updated: InvoiceData) => {
    const checked = applyLocalChecks(updated);
    const next = invoicesRef.current.map((invoice) => invoice.id === checked.id ? checked : invoice);
    invoicesRef.current = next;
    setInvoices(next);
    setSelectedInvoice(checked);

    if (session && supabase) {
      const existingTimer = updateTimersRef.current.get(checked.id);
      if (existingTimer) window.clearTimeout(existingTimer);
      const timer = window.setTimeout(() => {
        const previous = lastPersistedRef.current.get(checked.id) || checked;
        void updateInvoiceInSupabase(previous, checked).then(() => {
          lastPersistedRef.current.set(checked.id, checked);
        }).catch((error: any) => showNotification("error", error?.message || "Could not save invoice edit to Supabase."));
      }, 900);
      updateTimersRef.current.set(checked.id, timer);
    }
  };

  const handleVerify = async (invoice: InvoiceData) => {
    const verified = { ...applyLocalChecks(invoice), reviewStatus: "VERIFIED" as const, verifiedAt: new Date().toISOString() };
    if (session && supabase) {
      const timer = updateTimersRef.current.get(invoice.id);
      if (timer) window.clearTimeout(timer);
      const previous = lastPersistedRef.current.get(invoice.id) || invoice;
      await updateInvoiceInSupabase(previous, verified, "VERIFIED");
      lastPersistedRef.current.set(invoice.id, verified);
    }
    const next = invoicesRef.current.map((item) => item.id === verified.id ? verified : item);
    invoicesRef.current = next;
    setInvoices(next);
    if (selectedInvoice?.id === verified.id) setSelectedInvoice(verified);
    showNotification("success", `Verified ${verified.invoiceNumber || "invoice"}. The original AI snapshot and source file remain unchanged.`);
  };

  const handleReopen = async (invoice: InvoiceData) => {
    const reopened = { ...invoice, reviewStatus: "NEEDS_REVIEW" as const, verifiedAt: undefined };
    if (session && supabase) {
      await updateInvoiceInSupabase(lastPersistedRef.current.get(invoice.id) || invoice, reopened, "REOPENED");
      lastPersistedRef.current.set(invoice.id, reopened);
    }
    const next = invoicesRef.current.map((item) => item.id === reopened.id ? reopened : item);
    invoicesRef.current = next;
    setInvoices(next);
    setSelectedInvoice((current) => current?.id === reopened.id ? reopened : current);
    showNotification("info", `Reopened ${reopened.invoiceNumber || "invoice"} for review.`);
  };

  const handleRevertToAI = async (invoice: InvoiceData) => {
    if (!invoice.aiSnapshot) {
      showNotification("info", "This record does not have an immutable AI snapshot to restore.");
      return;
    }
    const reverted = applyLocalChecks({
      ...invoice,
      ...invoice.aiSnapshot,
      id: invoice.id,
      fileName: invoice.fileName,
      fileSize: invoice.fileSize,
      fileType: invoice.fileType,
      previewUrl: invoice.previewUrl,
      sourceDocumentId: invoice.sourceDocumentId,
      sourceStoragePath: invoice.sourceStoragePath,
      sourceSha256: invoice.sourceSha256,
      sourceEmailId: invoice.sourceEmailId,
      sourceType: invoice.sourceType,
      sourceMetadata: invoice.sourceMetadata,
      extractionId: invoice.extractionId,
      aiSnapshot: invoice.aiSnapshot,
      reviewStatus: "NEEDS_REVIEW",
      verifiedAt: undefined,
    });
    if (session && supabase) {
      await updateInvoiceInSupabase(lastPersistedRef.current.get(invoice.id) || invoice, reverted, "REVERTED_TO_AI");
      lastPersistedRef.current.set(invoice.id, reverted);
    }
    const next = invoicesRef.current.map((item) => item.id === reverted.id ? reverted : item);
    invoicesRef.current = next;
    setInvoices(next);
    setSelectedInvoice((current) => current?.id === reverted.id ? reverted : current);
    showNotification("info", `Restored ${reverted.invoiceNumber || "invoice"} to its original AI values for review.`);
  };

  const handleDeleteInvoice = async (id: string) => {
    if (session && supabase) await deleteInvoiceFromSupabase(id);
    const next = invoicesRef.current.filter((invoice) => invoice.id !== id);
    invoicesRef.current = next;
    setInvoices(next);
    lastPersistedRef.current.delete(id);
    if (selectedInvoice?.id === id) setSelectedInvoice(null);
    showNotification("info", "Invoice record archived. The original source file, AI snapshot, and review history remain preserved.");
  };

  const openInvoice = (invoice: InvoiceData) => { setSelectedInvoice(invoice); setActiveTab("extractor"); };
  const reviewCount = invoices.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW").length;
  const gmailConnection: GmailConnectionInfo = {
    configured: isSupabaseConfigured,
    signedIn: Boolean(session),
    hasGmailToken: Boolean(session && getGoogleProviderToken()),
    email: session?.user?.email,
    displayName: session?.user?.user_metadata?.full_name,
    lastHistoryId: syncState.lastHistoryId,
    lastSyncedAt: syncState.lastSyncedAt,
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} invoicesCount={invoices.length} reviewCount={reviewCount} onBatchExportExcel={() => exportBatchInvoicesToExcel(invoices)} workspaceLabel={session ? "Supabase synced" : isSupabaseConfigured ? "Supabase ready" : "Local demo"} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {notification && <div className={`mb-5 p-3.5 rounded-2xl text-xs flex items-center justify-between shadow-sm border ${notification.type === "success" ? "bg-emerald-50 text-emerald-900 border-emerald-200" : notification.type === "error" ? "bg-rose-50 text-rose-900 border-rose-200" : "bg-white text-slate-800 border-slate-200"}`}><div className="flex items-center gap-2.5">{notification.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}<span className="font-semibold">{notification.message}</span></div><button onClick={() => setNotification(null)}><X className="w-3.5 h-3.5" /></button></div>}

        {!isSupabaseConfigured && <div className="mb-5 p-4 rounded-2xl border border-amber-200 bg-amber-50 flex gap-3"><Database className="w-5 h-5 text-amber-700 shrink-0" /><div><p className="text-xs font-black text-amber-900">Running in local demo mode</p><p className="text-[11px] text-amber-800 mt-1">The app remains usable in AI Studio before setup. To persist Gmail, original files, AI snapshots and verified data, connect the new Supabase project using the included migration and environment variables.</p></div></div>}
        {workspaceLoading && <div className="mb-5 p-3.5 rounded-2xl border border-slate-200 bg-white text-xs font-semibold flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-indigo-600" />Loading Supabase workspace…</div>}
        {isSupabaseConfigured && !session && <div className="mb-5 p-4 rounded-2xl border border-indigo-200 bg-indigo-50 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"><div className="flex gap-3"><Cloud className="w-5 h-5 text-indigo-600 shrink-0" /><div><p className="text-xs font-black text-indigo-900">Supabase is configured</p><p className="text-[11px] text-indigo-800 mt-1">Connect Google + Gmail from Gmail Inbox to sign in, grant read-only Gmail access, and load your persistent invoice workspace.</p></div></div><button onClick={() => void connectGoogleAndGmail()} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold">Connect Google + Gmail</button></div>}

        {activeTab === "dashboard" && <Dashboard invoices={invoices} onOpenInvoice={openInvoice} onNavigate={setActiveTab} />}
        {activeTab === "extractor" && <div className="space-y-5">{selectedInvoice ? <><ReviewPanel invoice={selectedInvoice} onVerify={() => void handleVerify(selectedInvoice)} onReopen={() => void handleReopen(selectedInvoice)} onRevertToAI={() => void handleRevertToAI(selectedInvoice)} /><SourceComparison invoice={selectedInvoice} /><InvoiceViewer invoice={selectedInvoice} onUpdateInvoice={handleUpdateInvoice} onBack={() => setSelectedInvoice(null)} /><div className="pt-5 border-t border-slate-200"><UploadZone onExtract={handleExtract} onLoadPreset={(invoice) => void handleLoadPreset(invoice)} isLoading={processingCount > 0} /></div></> : <UploadZone onExtract={handleExtract} onLoadPreset={(invoice) => void handleLoadPreset(invoice)} isLoading={processingCount > 0} />}</div>}
        {activeTab === "inbox" && <EmailInbox invoices={invoices} isProcessing={processingCount > 0} connection={gmailConnection} onConnectGmail={connectGoogleAndGmail} onSignOut={signOutWorkspace} onScanGmail={handleScanGmail} onSyncGmail={handleSyncGmail} onImportGmailMessage={handleImportGmailMessage} onProcessEmail={handleProcessEmail} onOpenInvoice={openInvoice} />}
        {activeTab === "review" && <ReviewQueue invoices={invoices} onOpenInvoice={openInvoice} onVerify={(invoice) => void handleVerify(invoice)} />}
        {activeTab === "invoices" && <InvoiceDirectory invoices={invoices} onSelectInvoice={openInvoice} onDeleteInvoice={(id) => void handleDeleteInvoice(id)} onAddNew={() => { setSelectedInvoice(null); setActiveTab("extractor"); }} onVerify={(invoice) => void handleVerify(invoice)} />}
        {activeTab === "vendors" && <Vendors invoices={invoices} />}
        {activeTab === "reports" && <Reports invoices={invoices} />}
      </main>
      <footer className="border-t border-slate-200 py-4 bg-white text-center text-[10px] text-slate-500">Invoice Operations • Gmail read-only intake • Supabase originals & review history • Gemini 3.5 Flash-Lite • Gemini 3.7 Flash fallback</footer>
    </div>
  );
}
