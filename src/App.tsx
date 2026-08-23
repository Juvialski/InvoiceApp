import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Cloud, Loader2, X } from "lucide-react";
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
import { VerificationWorkspace } from "./components/VerificationWorkspace";
import type { SaveState } from "./components/VerificationWorkspace";
import { Settings as SettingsScreen } from "./components/Settings";
import { EmailClassification, GmailConnectionInfo, GmailImportedMessage, GmailMessageCandidate, GmailScanWindow, InvoiceData } from "./types";
import { exportBatchInvoicesToExcel } from "./utils/excelExport";
import { applyLocalChecks, findPossibleDuplicate } from "./utils/invoiceLogic";
import { nextPendingReviewInvoiceId, nextReviewInvoiceId, orderedReviewQueue } from "./utils/reviewQueue";
import { readAndCleanLocalInvoices } from "./utils/demoCleanup";
import { enqueueSerializedSave } from "./utils/saveSequencing";
import { currencySymbolFor, DEFAULT_CURRENCY, loadRegionalSettings, RegionalSettings, setRegionalSettings as setActiveRegionalSettings } from "./config/regional";
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
  const sourceType = invoice.sourceType || (invoice.id?.startsWith("sample") ? "SAMPLE" : "UPLOAD");
  const currency = invoice.currency || (sourceType === "SAMPLE" ? DEFAULT_CURRENCY : "");
  return applyLocalChecks({
    ...invoice,
    sourceType,
    currency,
    currencySymbol: invoice.currencySymbol || (currency ? currencySymbolFor(currency) : undefined),
    processingStatus: invoice.processingStatus || "EXTRACTED",
    duplicateStatus: invoice.duplicateStatus || "UNIQUE",
  });
}

function localFallbackInvoices() {
  const saved = readAndCleanLocalInvoices(typeof localStorage === "undefined" ? undefined : localStorage);
  return saved.map(prepareStoredInvoice);
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

function valueAtPath(value: any, path: string) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function withPathValue<T extends Record<string, any>>(source: T, path: string, value: unknown): T {
  const next: any = { ...source };
  const parts = path.split(".");
  let cursor = next;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    cursor[key] = { ...(cursor[key] || {}) };
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
  return next;
}

function userFacingError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String((error as any)?.message || "");
  return /gemini|supabase|storage|api[_ -]?key|provider|model/i.test(message) ? fallback : (message || fallback);
}

export default function App() {
  const [invoices, setInvoices] = useState<InvoiceData[]>(localFallbackInvoices);
  const invoicesRef = useRef(invoices);
  const lastPersistedRef = useRef(new Map<string, InvoiceData>());
  const updateTimersRef = useRef(new Map<string, number>());
  const editRevisionRef = useRef(new Map<string, number>());
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [verificationMode, setVerificationMode] = useState(false);
  const [reviewSessionIds, setReviewSessionIds] = useState<string[]>([]);
  const [reviewCompletion, setReviewCompletion] = useState<{ verifiedCount: number; totalCount: number; newItems: number } | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const [processingCount, setProcessingCount] = useState(0);
  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(isSupabaseConfigured);
  const [syncState, setSyncState] = useState<{ lastHistoryId?: string; lastSyncedAt?: string }>({});
  const [regionalSettings, setRegionalSettingsState] = useState<RegionalSettings>(loadRegionalSettings);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const savePromisesRef = useRef(new Map<string, Promise<unknown>>());

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
      showNotification("error", userFacingError(error, "Could not load the workspace. Check your connection or contact your administrator."));
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
    prepared = { ...prepared, reviewStatus: prepared.reviewStatus || "NEEDS_REVIEW" };
    const duplicate = findPossibleDuplicate(prepared, invoicesRef.current);
    if (duplicate) prepared = { ...prepared, duplicateStatus: "POSSIBLE_DUPLICATE", duplicateOfId: duplicate.id, reviewStatus: "NEEDS_REVIEW" };

    if (session && supabase) {
      prepared = await persistNewInvoice(prepared);
      lastPersistedRef.current.set(prepared.id, prepared);
    }

    const next = [prepared, ...invoicesRef.current.filter((item) => item.id !== prepared.id)];
    invoicesRef.current = next;
    setInvoices(next);
    setReviewCompletion(null);
    setSaveState("saved");
    return prepared;
  };

  const extractPayload = async (payload: any) => {
    const response = await fetch("/api/extract-invoice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || "Invoice extraction failed.");
    return result.data as InvoiceData;
  };

  const handleExtract = async (payload: ExtractPayload): Promise<InvoiceData> => {
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
      return prepared;
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Invoice extraction failed. Check the document and try again."));
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
      const extractedInvoices: InvoiceData[] = [];

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
          extractedInvoices.push(saved);
          if (storedSource) await markSourceDocumentStatus(storedSource.id, "EXTRACTED", saved.documentType);
        }
      } else {
        let extracted = await extractPayload({ textData: body || subject, fileName: subject || "Email invoice", model: "gemini-3.5-flash-lite", sourceType: "EMAIL", emailContext: { sender, subject, receivedAt, body, emailRecordId: manualEmail?.id } });
        extracted = { ...extracted, sourceEmailId: manualEmail?.id };
        extractedInvoices.push(await saveExtracted(extracted));
      }
      if (extractedInvoices.length) startReview(extractedInvoices);
      showNotification("success", `Email processed: ${classification.documentType || "financial document"} detected and saved for review.`);
      return classification;
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Email processing failed. Check the message and try again."));
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
      const query = `${range} {subject:invoice subject:\"sales invoice\" subject:\"service invoice\" subject:\"VAT invoice\" subject:billing subject:SOA \"statement of account\" \"credit note\" \"tax invoice\" BIR VAT TIN \"amount due\" filename:pdf filename:png filename:jpg filename:jpeg}`;
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
      const extractedInvoices: InvoiceData[] = [];
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
        extractedInvoices.push(await saveExtracted(extracted, source?.previewUrl));
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
        extractedInvoices.push(await saveExtracted(extracted));
        extractedCount = 1;
      }
      if (extractedInvoices.length) startReview(extractedInvoices);
      showNotification("success", `Saved original Gmail message and ${stored.documents.length} attachment${stored.documents.length === 1 ? "" : "s"}; created ${extractedCount} invoice extraction${extractedCount === 1 ? "" : "s"}.`);
      return extractedCount;
    } finally {
      setProcessingCount((n) => Math.max(0, n - 1));
    }
  };

  const handleLoadPreset = (preset: InvoiceData) => {
    // Presets are QA-only. Never send them through saveExtracted, which is the
    // same persistence path used by uploads and email-derived invoices.
    showNotification("info", `${preset.invoiceNumber || "Sample preset"} is available for QA only and was not added to invoice records.`);
  };

  const persistInvoice = async (invoice: InvoiceData, eventType = "HUMAN_EDIT", revision = editRevisionRef.current.get(invoice.id) || 0) => {
    if (!session || !supabase) {
      try {
        const localInvoices = invoicesRef.current.map((item) => item.id === invoice.id ? invoice : item);
        localStorage.setItem("extracted_invoices", JSON.stringify(localInvoices));
      } catch { /* local persistence is best effort */ }
      if (editRevisionRef.current.get(invoice.id) === revision) setSaveState("saved");
      return;
    }

    const operation = enqueueSerializedSave<InvoiceData>(savePromisesRef.current, lastPersistedRef.current, invoice.id, async (previous) => {
      setSaveState("saving");
      await updateInvoiceInSupabase(previous || invoice, invoice, eventType);
      return invoice;
    });
    try {
      await operation;
      if (editRevisionRef.current.get(invoice.id) === revision) setSaveState("saved");
    } catch (error) {
      if (editRevisionRef.current.get(invoice.id) === revision) setSaveState("error");
      throw error;
    }
  };

  const flushInvoiceSave = async (invoice: InvoiceData, eventType = "HUMAN_EDIT") => {
    const timer = updateTimersRef.current.get(invoice.id);
    if (timer) {
      window.clearTimeout(timer);
      updateTimersRef.current.delete(invoice.id);
    }
    try {
      await persistInvoice(invoice, eventType);
      return true;
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not save invoice. Your edits are still here; retry before continuing."));
      return false;
    }
  };

  const handleUpdateInvoice = (updated: InvoiceData) => {
    const checked = applyLocalChecks(updated);
    const revision = (editRevisionRef.current.get(checked.id) || 0) + 1;
    editRevisionRef.current.set(checked.id, revision);
    const next = invoicesRef.current.map((invoice) => invoice.id === checked.id ? checked : invoice);
    invoicesRef.current = next;
    setInvoices(next);
    setSelectedInvoice(checked);
    setSaveState("unsaved");

    if (session && supabase) {
      const existingTimer = updateTimersRef.current.get(checked.id);
      if (existingTimer) window.clearTimeout(existingTimer);
      const timer = window.setTimeout(() => {
        updateTimersRef.current.delete(checked.id);
        void persistInvoice(checked, "HUMAN_EDIT", revision).catch((error: any) => showNotification("error", userFacingError(error, "Could not save invoice edit. Your changes are still here; retry before continuing.")));
      }, 900);
      updateTimersRef.current.set(checked.id, timer);
    } else {
      setSaveState("saved");
    }
  };

  const handleVerify = async (invoice: InvoiceData) => {
    const initialRevision = editRevisionRef.current.get(invoice.id) || 0;
    let verified = { ...applyLocalChecks(invoice), reviewStatus: "VERIFIED" as const, verifiedAt: new Date().toISOString() };
    const persisted = await flushInvoiceSave(verified, "VERIFIED");
    if (!persisted) throw new Error("Could not save invoice verification.");
    // If a field edit arrived while verification was saving, verify the latest
    // local values instead of replacing them with the older click snapshot.
    if (editRevisionRef.current.get(invoice.id) !== initialRevision) {
      const latest = invoicesRef.current.find((item) => item.id === invoice.id);
      if (!latest) throw new Error("The invoice is no longer available.");
      verified = { ...applyLocalChecks(latest), reviewStatus: "VERIFIED" as const, verifiedAt: new Date().toISOString() };
      if (!await flushInvoiceSave(verified, "VERIFIED")) throw new Error("Could not save invoice verification.");
    }
    const next = invoicesRef.current.map((item) => item.id === verified.id ? verified : item);
    invoicesRef.current = next;
    setInvoices(next);
    if (selectedInvoice?.id === verified.id) setSelectedInvoice(verified);
    showNotification("success", `Verified ${verified.invoiceNumber || "invoice"}. The original AI snapshot and source file remain unchanged.`);
    return verified;
  };

  const handleRegionalSettingsChange = (next: RegionalSettings) => {
    const saved = setActiveRegionalSettings(next);
    setRegionalSettingsState(saved);
  };

  const handleReopen = async (invoice: InvoiceData) => {
    const reopened = { ...invoice, reviewStatus: "NEEDS_REVIEW" as const, verifiedAt: undefined };
    if (!await flushInvoiceSave(reopened, "REOPENED")) return;
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
    if (!await flushInvoiceSave(reverted, "REVERTED_TO_AI")) return;
    const next = invoicesRef.current.map((item) => item.id === reverted.id ? reverted : item);
    invoicesRef.current = next;
    setInvoices(next);
    setSelectedInvoice((current) => current?.id === reverted.id ? reverted : current);
    showNotification("info", `Restored ${reverted.invoiceNumber || "invoice"} to its original AI values for review.`);
  };

  const handleRevertField = async (invoice: InvoiceData, path: string) => {
    if (!invoice.aiSnapshot) return;
    const originalValue = valueAtPath(invoice.aiSnapshot, path);
    const reverted = applyLocalChecks(withPathValue(invoice, path, originalValue));
    if (!await flushInvoiceSave(reverted, "FIELD_REVERTED")) return;
    const next = invoicesRef.current.map((item) => item.id === reverted.id ? reverted : item);
    invoicesRef.current = next;
    setInvoices(next);
    setSelectedInvoice((current) => current?.id === reverted.id ? reverted : current);
    showNotification("info", `Reverted ${path.replaceAll(".", " ")} to the original AI value.`);
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

  const startReview = (requestedQueue?: InvoiceData[], initialId?: string) => {
    const queue = requestedQueue?.length ? requestedQueue : invoicesRef.current.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW");
    const ids = queue.map((invoice) => invoice.id);
    const firstId = initialId && ids.includes(initialId) ? initialId : ids[0];
    if (!firstId) {
      showNotification("info", "Review queue is clear.");
      return;
    }
    const first = invoicesRef.current.find((invoice) => invoice.id === firstId);
    if (!first) return;
    setReviewSessionIds(ids);
    setReviewCompletion(null);
    setSelectedInvoice(first);
    setVerificationMode(true);
    setSaveState("saved");
    setActiveTab("extractor");
  };

  const openInvoiceDetails = (invoice: InvoiceData) => {
    setSelectedInvoice(invoice);
    setVerificationMode(false);
    setReviewCompletion(null);
    setReviewSessionIds([]);
    setSaveState("saved");
    setActiveTab("extractor");
  };

  const openInvoiceForReview = (invoice: InvoiceData) => {
    const queue = invoicesRef.current.filter((item) => item.reviewStatus === "NEEDS_REVIEW");
    startReview(queue, invoice.id);
  };

  const openInvoice = (invoice: InvoiceData) => {
    if (invoice.reviewStatus === "NEEDS_REVIEW") openInvoiceForReview(invoice);
    else openInvoiceDetails(invoice);
  };

  const handleBatchComplete = (successful: InvoiceData[], failed: Array<{ name: string; error: string }>) => {
    if (successful.length) startReview(successful);
    if (successful.length || failed.length) {
      const summary = `${successful.length} invoice${successful.length === 1 ? "" : "s"} extracted successfully. ${failed.length} failed.`;
      showNotification(failed.length ? "info" : "success", summary);
    }
  };

  const reviewQueue = orderedReviewQueue(invoices, reviewSessionIds.length ? reviewSessionIds : undefined);
  const reviewIndex = selectedInvoice ? reviewSessionIds.indexOf(selectedInvoice.id) : -1;

  const moveReview = async (direction: "next" | "previous") => {
    if (!selectedInvoice || !reviewSessionIds.length) return false;
    if (!await flushInvoiceSave(selectedInvoice)) return false;
    const targetId = nextReviewInvoiceId(reviewSessionIds, invoicesRef.current, selectedInvoice.id, direction);
    if (!targetId) {
      showNotification("info", direction === "next" ? "This is the last invoice in the review session." : "This is the first invoice in the review session.");
      return false;
    }
    const target = invoicesRef.current.find((item) => item.id === targetId);
    if (!target) return false;
    setSelectedInvoice(target);
    setSaveState("saved");
    return true;
  };

  const verifyAndNext = async () => {
    if (!selectedInvoice) return false;
    try {
      await handleVerify(selectedInvoice);
    } catch (error: any) {
      showNotification("error", userFacingError(error, "Could not verify invoice. Retry before continuing."));
      return false;
    }
    const nextId = nextPendingReviewInvoiceId(reviewSessionIds, invoicesRef.current, selectedInvoice.id);
    if (nextId) {
      const next = invoicesRef.current.find((item) => item.id === nextId);
      if (next) {
        setSelectedInvoice(next);
        setSaveState("saved");
        return true;
      }
    }
    const verifiedCount = invoicesRef.current.filter((item) => reviewSessionIds.includes(item.id) && item.reviewStatus === "VERIFIED").length;
    const newItems = invoicesRef.current.filter((item) => item.reviewStatus === "NEEDS_REVIEW" && !reviewSessionIds.includes(item.id)).length;
    setReviewCompletion({ verifiedCount, totalCount: reviewSessionIds.length, newItems });
    return true;
  };

  const saveCurrentReview = async () => {
    if (!selectedInvoice) return false;
    return flushInvoiceSave(selectedInvoice);
  };

  const exitReview = async () => {
    if (selectedInvoice && !await flushInvoiceSave(selectedInvoice)) return;
    setSelectedInvoice(null);
    setVerificationMode(false);
    setReviewSessionIds([]);
    setReviewCompletion(null);
    setActiveTab("review");
  };

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
      <Header activeTab={activeTab} setActiveTab={setActiveTab} invoicesCount={invoices.length} reviewCount={reviewCount} onBatchExportExcel={() => exportBatchInvoicesToExcel(invoices)} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 overflow-x-hidden">
        {notification && <div className={`mb-5 p-3.5 rounded-2xl text-xs flex items-center justify-between shadow-sm border ${notification.type === "success" ? "bg-emerald-50 text-emerald-900 border-emerald-200" : notification.type === "error" ? "bg-rose-50 text-rose-900 border-rose-200" : "bg-white text-slate-800 border-slate-200"}`}><div className="flex items-center gap-2.5">{notification.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}<span className="font-semibold">{notification.message}</span></div><button onClick={() => setNotification(null)}><X className="w-3.5 h-3.5" /></button></div>}

        {!isSupabaseConfigured && <div className="mb-5 p-4 rounded-2xl border border-amber-200 bg-amber-50 flex gap-3"><Cloud className="w-5 h-5 text-amber-700 shrink-0" /><div><p className="text-xs font-black text-amber-900">Workspace connection is not configured</p><p className="text-[11px] text-amber-800 mt-1">The local workspace is available for document review. Connect the workspace to persist Gmail, original files, and review history.</p></div></div>}
        {workspaceLoading && <div className="mb-5 p-3.5 rounded-2xl border border-slate-200 bg-white text-xs font-semibold flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-indigo-600" />Loading workspace…</div>}
        {isSupabaseConfigured && !session && <div className="mb-5 p-4 rounded-2xl border border-indigo-200 bg-indigo-50 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"><div className="flex gap-3"><Cloud className="w-5 h-5 text-indigo-600 shrink-0" /><div><p className="text-xs font-black text-indigo-900">Workspace connection available</p><p className="text-[11px] text-indigo-800 mt-1">Connect Google + Gmail to sign in, grant read-only mailbox access, and load your persistent invoice workspace.</p></div></div><button onClick={() => void connectGoogleAndGmail()} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold">Connect Google + Gmail</button></div>}

        {activeTab === "dashboard" && <Dashboard invoices={invoices} onOpenInvoice={openInvoice} onNavigate={setActiveTab} />}
        {activeTab === "extractor" && <div className="space-y-5">{selectedInvoice ? verificationMode ? <VerificationWorkspace invoice={selectedInvoice} queue={reviewQueue} queueIndex={reviewIndex} saveState={saveState} completion={reviewCompletion} onUpdateInvoice={handleUpdateInvoice} onBack={exitReview} onPrevious={() => moveReview("previous")} onNext={() => moveReview("next")} onSave={saveCurrentReview} onVerifyAndNext={verifyAndNext} onContinueWithNewItems={() => startReview(invoicesRef.current.filter((item) => item.reviewStatus === "NEEDS_REVIEW"))} onReturnToDashboard={() => { setSelectedInvoice(null); setVerificationMode(false); setReviewCompletion(null); setActiveTab("dashboard"); }} onViewVerified={() => { setSelectedInvoice(null); setVerificationMode(false); setReviewCompletion(null); setActiveTab("invoices"); }} onRevertToAI={() => void handleRevertToAI(selectedInvoice)} onRevertField={(path) => void handleRevertField(selectedInvoice, path)} /> : <><ReviewPanel invoice={selectedInvoice} onVerify={() => void handleVerify(selectedInvoice)} onReopen={() => void handleReopen(selectedInvoice)} onRevertToAI={() => void handleRevertToAI(selectedInvoice)} /><SourceComparison invoice={selectedInvoice} onRevertField={(path) => void handleRevertField(selectedInvoice, path)} /><InvoiceViewer invoice={selectedInvoice} onUpdateInvoice={handleUpdateInvoice} onBack={() => setSelectedInvoice(null)} /><div className="pt-5 border-t border-slate-200"><UploadZone onExtract={handleExtract} onLoadPreset={(invoice) => void handleLoadPreset(invoice)} onBatchComplete={handleBatchComplete} isLoading={processingCount > 0} /></div></> : <UploadZone onExtract={handleExtract} onLoadPreset={(invoice) => void handleLoadPreset(invoice)} onBatchComplete={handleBatchComplete} isLoading={processingCount > 0} />}</div>}
        {activeTab === "inbox" && <EmailInbox invoices={invoices} isProcessing={processingCount > 0} connection={gmailConnection} onConnectGmail={connectGoogleAndGmail} onSignOut={signOutWorkspace} onScanGmail={handleScanGmail} onSyncGmail={handleSyncGmail} onImportGmailMessage={handleImportGmailMessage} onProcessEmail={handleProcessEmail} onOpenInvoice={openInvoice} />}
        {activeTab === "review" && <ReviewQueue invoices={invoices} onOpenInvoice={openInvoiceForReview} onVerify={(invoice) => void handleVerify(invoice)} onStartReview={(queue) => startReview(queue)} />}
        {activeTab === "invoices" && <InvoiceDirectory invoices={invoices} onSelectInvoice={openInvoice} onDeleteInvoice={(id) => void handleDeleteInvoice(id)} onAddNew={() => { setSelectedInvoice(null); setVerificationMode(false); setReviewCompletion(null); setActiveTab("extractor"); }} onVerify={(invoice) => void handleVerify(invoice)} />}
        {activeTab === "vendors" && <Vendors invoices={invoices} />}
        {activeTab === "reports" && <Reports invoices={invoices} />}
        {activeTab === "settings" && <SettingsScreen settings={regionalSettings} onChange={handleRegionalSettingsChange} />}
      </main>
      <footer className="border-t border-slate-200 py-4 bg-white text-center text-[10px] text-slate-500">Invoice Operations • Gmail read-only intake • Original sources & review history</footer>
    </div>
  );
}
