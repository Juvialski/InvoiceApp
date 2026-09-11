import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, History, Loader2, Mail, MessageSquareText, Printer, RotateCcw, ShieldCheck, X } from "lucide-react";
import type { FinancialDocumentSnapshot } from "../lib/documentGeneration.ts";
import { documentFileName, downloadPdfBytes, generateFinancialDocumentPdf } from "../lib/documentGeneration.ts";
import { loadCompanyDocumentProfileFromSupabase } from "../lib/companyDocumentProfile.ts";
import { ensureClientInvoiceDocumentSnapshot, ensurePurchaseOrderDocumentSnapshot } from "../lib/documentSnapshots.ts";
import { DocumentSendError, sendFinancialDocumentByGmail } from "../lib/documentEmail.ts";
import { documentDeliveryAttachmentLabel, loadDocumentDeliveryHistory, newDocumentDeliveryAttemptKey, type DocumentDeliveryHistoryEntry } from "../lib/documentDelivery.ts";
import { downloadDocxBytes, generateDocumentTemplateDocument, generateDocumentTemplatePdf } from "../lib/documentTemplates.ts";
import { useAppPermission } from "../app/AppPermissionContext.tsx";
import { useOptionalCompanyAccess } from "../context/CompanyAccessContext.tsx";
import { PERMISSION_KEYS } from "../utils/accessControl.ts";
import { useDialogFocus } from "./ui/useDialogFocus.ts";

interface DocumentPreviewModalProps {
  document: FinancialDocumentSnapshot;
  onClose: () => void;
  onSent?: (messageId?: string) => void;
  onOpenCommunications?: () => void;
}

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0); }
  catch { return `${currency} ${(value || 0).toFixed(2)}`; }
}

function shortDate(value?: string | null) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function deliveryTime(value: string) {
  if (!value) return "Time unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function deliveryStatusClass(status: DocumentDeliveryHistoryEntry["status"]) {
  if (status === "SENT") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "FAILED") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "UNKNOWN") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({ document: initialDocument, onClose, onSent, onOpenCommunications }) => {
  const canSendIssuedDocument = useAppPermission(PERMISSION_KEYS.documentSend);
  const companyAccess = useOptionalCompanyAccess();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus({ open: true, onClose, initialFocusRef: closeButtonRef });
  const [document, setDocument] = useState(initialDocument);
  const [loadingSnapshot, setLoadingSnapshot] = useState(initialDocument.status === "ISSUED" && !initialDocument.snapshotId);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [docxBusy, setDocxBusy] = useState(false);
  const [templatePdfBusy, setTemplatePdfBusy] = useState(false);
  const [docxError, setDocxError] = useState("");
  const [templatePdfError, setTemplatePdfError] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<"INITIAL" | "RESEND">("INITIAL");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendResult, setSendResult] = useState("");
  const [deliveryHistory, setDeliveryHistory] = useState<readonly DocumentDeliveryHistoryEntry[]>([]);
  const [deliveryHistoryLoading, setDeliveryHistoryLoading] = useState(false);
  const [deliveryHistoryError, setDeliveryHistoryError] = useState("");
  const [deliveryReconciliationBlocked, setDeliveryReconciliationBlocked] = useState(false);
  const [to, setTo] = useState(() => initialDocument.documentType === "PURCHASE_ORDER" ? initialDocument.supplier.email || "" : initialDocument.billTo.email || "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(() => initialDocument.documentType === "PURCHASE_ORDER" ? `Purchase Order ${initialDocument.documentNumber}` : `Client Invoice ${initialDocument.documentNumber}`);
  const [message, setMessage] = useState(() => initialDocument.documentType === "PURCHASE_ORDER"
    ? "Please find the attached purchase order for your review and confirmation."
    : "Please find the attached client invoice for your review.");
  const [idempotencyKey, setIdempotencyKey] = useState(() => newDocumentDeliveryAttemptKey());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const profile = await loadCompanyDocumentProfileFromSupabase();
        if (cancelled) return;
        if (initialDocument.status === "ISSUED") {
          const persisted = initialDocument.documentType === "PURCHASE_ORDER"
            ? await ensurePurchaseOrderDocumentSnapshot(initialDocument.documentId || "")
            : await ensureClientInvoiceDocumentSnapshot(initialDocument.documentId || "");
          if (!cancelled && persisted) setDocument(persisted);
          else if (!cancelled) setDocument((current) => ({ ...current, company: { ...current.company, ...profile } }));
        } else {
          setDocument((current) => ({ ...current, company: { ...current.company, ...profile } }));
        }
      } catch {
        // The deterministic local snapshot remains a truthful preview if the
        // optional remote profile/snapshot is unavailable.
      } finally {
        if (!cancelled) setLoadingSnapshot(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialDocument.documentId, initialDocument.documentType, initialDocument.status]);

  const refreshDeliveryHistory = async () => {
    if (!companyAccess?.activeCompanyId || !document.documentId) {
      setDeliveryHistory([]);
      setDeliveryHistoryError("");
      setDeliveryReconciliationBlocked(false);
      setDeliveryHistoryLoading(false);
      return;
    }
    setDeliveryHistoryLoading(true);
    setDeliveryHistoryError("");
    try {
      const history = await loadDocumentDeliveryHistory(document);
      setDeliveryHistory(history);
      setDeliveryReconciliationBlocked(history.some((entry) => entry.reconciliationRequired));
    } catch (error) {
      setDeliveryHistoryError(error instanceof Error ? error.message : "Document delivery history could not be loaded safely.");
    } finally {
      setDeliveryHistoryLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!companyAccess?.activeCompanyId || !document.documentId) {
      setDeliveryHistory([]);
      setDeliveryHistoryError("");
      setDeliveryReconciliationBlocked(false);
      setDeliveryHistoryLoading(false);
      return () => { cancelled = true; };
    }
    setDeliveryHistoryLoading(true);
    setDeliveryHistoryError("");
    setDeliveryHistory([]);
    setDeliveryReconciliationBlocked(false);
    void loadDocumentDeliveryHistory(document)
      .then((history) => { if (!cancelled) { setDeliveryHistory(history); setDeliveryReconciliationBlocked(history.some((entry) => entry.reconciliationRequired)); } })
      .catch((error) => { if (!cancelled) setDeliveryHistoryError(error instanceof Error ? error.message : "Document delivery history could not be loaded safely."); })
      .finally(() => { if (!cancelled) setDeliveryHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [companyAccess?.activeCompanyId, document.documentId, document.documentType, document.snapshotId]);

  const fileName = useMemo(() => documentFileName(document), [document]);
  const download = async () => {
    setDownloadBusy(true);
    try { downloadPdfBytes(await generateFinancialDocumentPdf(document), fileName); }
    finally { setDownloadBusy(false); }
  };

  const downloadCompanyDocx = async () => {
    setDocxBusy(true);
    setDocxError("");
    try {
      if (document.status !== "ISSUED" || !document.snapshotId || !document.templateVersionId) {
        throw new Error("This issued snapshot has no pinned company template version. Use the existing PDF fallback or issue a new document after activating a template.");
      }
      const result = await generateDocumentTemplateDocument(companyAccess?.activeCompanyId || "", document.templateVersionId, {
        documentType: document.documentType,
        snapshotId: document.snapshotId,
      });
      downloadDocxBytes(result.bytes, result.fileName);
    } catch (error) {
      setDocxError(error instanceof Error ? error.message : "The company DOCX could not be generated safely.");
    } finally {
      setDocxBusy(false);
    }
  };

  const downloadCompanyPdf = async () => {
    setTemplatePdfBusy(true);
    setTemplatePdfError("");
    try {
      if (document.status !== "ISSUED" || !document.snapshotId || !document.templateVersionId) {
        throw new Error("This issued snapshot has no pinned company template version. Use the existing PDF fallback or issue a new document after activating a template.");
      }
      const result = await generateDocumentTemplatePdf(companyAccess?.activeCompanyId || "", document.templateVersionId, {
        documentType: document.documentType,
        snapshotId: document.snapshotId,
      });
      downloadPdfBytes(result.bytes, result.fileName);
    } catch (error) {
      setTemplatePdfError(error instanceof Error ? error.message : "The company-template PDF could not be finalized safely.");
    } finally {
      setTemplatePdfBusy(false);
    }
  };

  const print = () => {
    if (typeof window !== "undefined") window.print();
  };

  const deliveryHistoryBlocksSend = Boolean(
    companyAccess?.activeCompanyId
      && (deliveryReconciliationBlocked || deliveryHistoryLoading || deliveryHistoryError || deliveryHistory.some((entry) => entry.reconciliationRequired)),
  );

  const openCompose = () => {
    if (deliveryHistoryBlocksSend) return;
    const isResend = deliveryHistory.length > 0;
    setComposeMode(isResend ? "RESEND" : "INITIAL");
    if (isResend) setIdempotencyKey(newDocumentDeliveryAttemptKey());
    setSendError("");
    setSendResult("");
    setComposeOpen(true);
  };

  const startResend = (entry: DocumentDeliveryHistoryEntry) => {
    if (!isIssued || !entry.resendAllowed || entry.reconciliationRequired || deliveryHistoryBlocksSend) return;
    setTo(entry.recipients.join(", "));
    setCc(entry.cc.join(", "));
    if (entry.subject) setSubject(entry.subject);
    setComposeMode("RESEND");
    setIdempotencyKey(newDocumentDeliveryAttemptKey());
    setSendError("");
    setSendResult("");
    setComposeOpen(true);
  };

  const send = async () => {
    setSendBusy(true);
    setSendError("");
    setSendResult("");
    try {
      if (document.status !== "ISSUED" || !document.snapshotId) throw new Error("Only an issued immutable document snapshot can be sent.");
      if (!to.trim()) throw new Error("Enter at least one recipient email address.");
      const result = await sendFinancialDocumentByGmail({ snapshot: document, to, cc, subject, message, attachmentName: fileName, idempotencyKey });
      const source = result.attachmentSource || "PROGRAMMATIC_PDF_FALLBACK";
      setSendResult(`Sent successfully · ${documentDeliveryAttachmentLabel(source)}.`);
      setComposeOpen(false);
      setComposeMode("INITIAL");
      setIdempotencyKey(newDocumentDeliveryAttemptKey());
      onSent?.(result.gmailMessageId);
      await refreshDeliveryHistory();
    } catch (error) {
      if (error instanceof DocumentSendError && error.code === "DOCUMENT_SEND_FAILED") {
        // A provider-rejected attempt is terminal. A later deliberate retry
        // must use a new intent/history key rather than mutating this attempt.
        setComposeMode("RESEND");
        setIdempotencyKey(newDocumentDeliveryAttemptKey());
        await refreshDeliveryHistory();
      }
      if (error instanceof DocumentSendError && error.reconciliationRequired) {
        setComposeOpen(false);
        setDeliveryReconciliationBlocked(true);
        setDeliveryHistoryError("");
        await refreshDeliveryHistory();
      }
      setSendError(error instanceof Error ? error.message : "The document could not be sent. No send success was recorded.");
    } finally {
      setSendBusy(false);
    }
  };

  const isPo = document.documentType === "PURCHASE_ORDER";
  const isIssued = document.status === "ISSUED";
  const isDraft = document.status === "DRAFT";
  const latestDelivery = deliveryHistory[0];
  const deliveryActionLabel = latestDelivery?.status === "SENT"
    ? "Resend by Email"
    : latestDelivery?.status === "FAILED" ? "Try send again" : "Send by Email";
  return (
    <div ref={dialogRef} className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-2 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="document-preview-title">
      <section className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-100 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Document preview</p>
            <h2 id="document-preview-title" className="mt-1 truncate text-base font-black text-slate-950">{isPo ? "Purchase Order" : "Client Invoice"} {document.documentNumber}</h2>
            <p className="mt-0.5 text-[10px] text-slate-500">{isIssued ? "Issued snapshot · immutable" : isDraft ? "Draft preview · changes regenerate until issuance" : "Finalized record · sending disabled"}{loadingSnapshot ? " · loading authoritative snapshot" : ""}</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close document preview"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-5">
          <article className="mx-auto min-h-[760px] w-full max-w-[720px] bg-white px-7 py-8 text-slate-900 shadow-lg sm:px-12" id="financial-document-preview">
            <div className="relative flex min-h-16 flex-col items-center justify-center gap-2 text-center sm:block">
              {document.company.logoPath && <img src={document.company.logoPath} alt={`${document.company.legalName} logo`} className="h-12 w-20 object-contain sm:absolute sm:left-0 sm:top-0 sm:h-16 sm:w-24" />}
              <div className="w-full text-center">
                <p className="text-lg font-black uppercase tracking-tight text-[#0d2e6b] sm:text-2xl">{document.company.legalName}</p>
                {document.company.address && <p className="mt-1 text-[10px] font-bold text-[#0d2e6b]">{document.company.address}</p>}
                {document.company.contactNumber && <p className="text-[10px] text-[#0d2e6b]">Cel No.: {document.company.contactNumber}</p>}
                {document.company.email && <p className="text-[10px] text-[#0d2e6b]">Email: {document.company.email}</p>}
              </div>
            </div>
            <div className="mt-5 space-y-1"><div className="h-0.5 bg-[#0ba9df]" /><div className="h-1 bg-slate-500" /></div>
            <div className="relative mt-8 flex min-h-10 flex-col items-center justify-center gap-2 sm:block">
              <h3 className="w-full text-center text-xl font-black text-black sm:text-2xl">{isPo ? "PURCHASE ORDER" : "INVOICE"}</h3>
              <div className="border border-black px-3 py-2 text-xs font-bold sm:absolute sm:right-0 sm:top-1/2 sm:-translate-y-1/2">No: {document.documentNumber}</div>
            </div>

            {isPo ? (
              <>
                <p className="mt-7 text-xs font-bold">VAT TIN: {document.company.vatTin || ""}</p>
                <div className="mt-5 grid grid-cols-[5.5rem_minmax(0,1fr)_7rem] gap-x-2 gap-y-1 text-xs font-bold">
                  <span>Supplier</span><span>: {document.supplier.name}</span><span className="text-right">{shortDate(document.issueDate)}</span>
                  <span>Address</span><span>: {document.supplier.address || ""}</span><span className="text-right">Date</span>
                  <span>Attention</span><span>: {document.supplier.attention || ""}</span><span />
                  <span>VAT TIN</span><span>: {document.supplier.vatTin || ""}</span><span />
                </div>
                <table className="mt-7 w-full table-fixed border-collapse text-[10px]"><thead><tr className="bg-slate-100">{["Item No.", "Qty", "Unit", "Description", "Unit Price", "Amount"].map((header) => <th key={header} className="border border-slate-400 px-1.5 py-2 text-center font-black">{header}</th>)}</tr></thead><tbody>{document.lines.map((line) => <tr key={`${line.lineNumber}-${line.description}`}><td className="border border-slate-300 px-1.5 py-2 text-center">{line.lineNumber}</td><td className="border border-slate-300 px-1.5 py-2 text-center">{line.quantity ?? ""}</td><td className="border border-slate-300 px-1.5 py-2 text-center">{line.unit || ""}</td><td className="break-words border border-slate-300 px-1.5 py-2">{line.description}</td><td className="break-words border border-slate-300 px-1.5 py-2 text-right">{line.unitPrice === undefined ? "" : money(line.unitPrice, document.currency)}</td><td className="break-words border border-slate-300 px-1.5 py-2 text-right">{money(line.amount, document.currency)}</td></tr>)}<tr><td colSpan={4} className="break-words border border-slate-400 px-1.5 py-2 font-semibold">{document.amountInWords}</td><td className="break-words border border-slate-400 px-1.5 py-2 text-right font-black">Total ({document.currency})</td><td className="break-words border border-slate-400 px-1.5 py-2 text-right font-black">{money(document.totalAmount, document.currency)}</td></tr></tbody></table>
                <div className="mt-3 border border-slate-400 px-2 py-2 text-xs"><p>Deliver to: {document.project.deliverTo || ""}</p><p className="mt-1">Remarks: {document.notes || document.description || ""}</p></div>
                <div className="mt-1 border border-slate-400 px-2 py-2 text-xs"><strong>Terms and Conditions:</strong> {document.termsAndConditions || "Not specified"}</div>
                <div className="mt-16 grid grid-cols-2 gap-8 text-xs"><div><p className="font-black">Processed by: <span className="ml-2 underline">{document.processor.name}</span></p>{document.processor.title && <p className="ml-[6.2rem] text-[10px]">{document.processor.title}</p>}</div><div className="text-right"><p className="font-black">Conforme: __________________</p><p className="text-[10px]">Supplier's Authorized Representative</p></div></div>
              </>
            ) : (
              <>
                <div className="mt-7 grid gap-2 text-xs sm:grid-cols-2"><p><strong>Invoice date:</strong> {shortDate(document.invoiceDate)}</p><p><strong>Due date:</strong> {shortDate(document.dueDate)}</p><p><strong>Project:</strong> {document.project.projectCode || ""} {document.project.projectName || ""}</p><p><strong>Terms:</strong> {document.paymentTerms || ""}</p></div>
                <div className="mt-5 border border-slate-400 p-3 text-xs"><p className="font-black">Bill To</p><p className="mt-1 font-bold">{document.billTo.name || ""}</p><p>{document.billTo.contactName || ""}</p><p>{document.billTo.email || ""}</p><p>{document.billTo.address || ""}</p><p>{document.billTo.reference ? `Reference: ${document.billTo.reference}` : ""}</p></div>
                <table className="mt-5 w-full table-fixed border-collapse text-[10px]"><thead><tr className="bg-slate-100"><th className="border border-slate-400 px-1.5 py-2 text-center">#</th><th className="border border-slate-400 px-1.5 py-2 text-left">Description</th><th className="border border-slate-400 px-1.5 py-2 text-right">Amount</th></tr></thead><tbody>{document.lines.map((line) => <tr key={`${line.lineNumber}-${line.description}`}><td className="border border-slate-300 px-1.5 py-2 text-center">{line.lineNumber}</td><td className="break-words border border-slate-300 px-1.5 py-2">{line.description}</td><td className="break-words border border-slate-300 px-1.5 py-2 text-right">{money(line.amount, document.currency)}</td></tr>)}</tbody></table>
                <div className="mt-5 ml-auto max-w-xs space-y-2 text-xs"><div className="flex justify-between gap-5"><span>Subtotal</span><strong>{money(document.subtotal, document.currency)}</strong></div>{document.taxAmount !== undefined && document.taxAmount > 0 && <div className="flex justify-between gap-5"><span>{document.taxLabel || "Tax"}</span><strong>{money(document.taxAmount, document.currency)}</strong></div>}<div className="flex justify-between gap-5 border-t border-slate-400 pt-2 text-sm font-black"><span>Total ({document.currency})</span><span>{money(document.totalAmount, document.currency)}</span></div></div>
                <p className="mt-5 text-xs">{document.amountInWords}</p>
                {document.company.paymentInstructions && <p className="mt-3 text-xs">Payment instructions: {document.company.paymentInstructions}</p>}
                {document.notes && <p className="mt-3 text-xs">Notes: {document.notes}</p>}
                {document.termsAndConditions && <p className="mt-3 text-xs">Terms: {document.termsAndConditions}</p>}
                <div className="mt-12 text-xs"><p className="font-black">Prepared by: <span className="ml-2 underline">{document.processor.name}</span></p>{document.processor.title && <p className="ml-[5.6rem] text-[10px]">{document.processor.title}</p>}</div>
              </>
            )}
          </article>
        </div>

        <footer className="border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
          {sendError && <p role="alert" className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{sendError}</p>}
          {docxError && <p role="alert" className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{docxError}</p>}
          {templatePdfError && <p role="alert" className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{templatePdfError}</p>}
          {sendResult && <p role="status" className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />{sendResult}</p>}

          <section className="mb-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3" data-document-delivery-history="true" aria-labelledby="document-delivery-history-title">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><History className="h-3.5 w-3.5 text-indigo-600" /><h3 id="document-delivery-history-title" className="text-xs font-black text-slate-800">Delivery history</h3></div><div className="flex items-center gap-2">{deliveryHistoryLoading && <span className="inline-flex items-center gap-1 text-[10px] text-slate-500"><Loader2 className="h-3 w-3 animate-spin" />Loading</span>}{companyAccess?.activeCompanyId && <button type="button" onClick={() => void refreshDeliveryHistory()} disabled={deliveryHistoryLoading} className="text-[10px] font-black text-indigo-700 disabled:opacity-45">Refresh</button>}</div></div>
            {deliveryHistoryError && <p role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-900">{deliveryHistoryError}</p>}
            {!deliveryHistoryError && !deliveryHistoryLoading && !companyAccess?.activeCompanyId && <p className="mt-2 text-[10px] leading-4 text-slate-500">Connect the authenticated workspace to load immutable delivery history.</p>}
            {!deliveryHistoryError && !deliveryHistoryLoading && companyAccess?.activeCompanyId && deliveryHistory.length === 0 && <p className="mt-2 text-[10px] leading-4 text-slate-500">No outbound delivery attempts have been recorded for this document.</p>}
            {deliveryHistory.length > 0 && <div className="mt-3 space-y-2">{deliveryHistory.map((entry) => (
              <article key={entry.id} className="rounded-lg border border-slate-200 bg-white p-2.5" data-document-delivery-attempt={entry.id} data-document-delivery-status={entry.status} data-document-delivery-source={entry.attachmentSource}>
                <div className="flex flex-wrap items-start justify-between gap-2"><div className="flex flex-wrap items-center gap-1.5"><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${deliveryStatusClass(entry.status)}`}>{entry.status}</span><span className="text-[10px] font-bold text-slate-700">{entry.channel}</span><span className="text-[10px] text-slate-500">{entry.senderLabel}</span></div><time dateTime={entry.sentAt} className="text-[10px] text-slate-500">{deliveryTime(entry.sentAt)}</time></div>
                <p className="mt-2 break-words text-[10px] text-slate-700"><strong>To:</strong> {entry.recipients.join(", ") || "Not recorded"}</p>
                {entry.cc.length > 0 && <p className="mt-0.5 break-words text-[10px] text-slate-600"><strong>CC:</strong> {entry.cc.join(", ")}</p>}
                <p className="mt-1 break-words text-[10px] text-slate-600"><strong>Attachment:</strong> {documentDeliveryAttachmentLabel(entry.attachmentSource)} · {entry.attachmentName}{entry.attachmentSha256 ? ` · SHA-256 ${entry.attachmentSha256.slice(0, 16)}…` : ""}{entry.attachmentSize ? ` · ${Math.ceil(entry.attachmentSize / 1024)} KB` : ""}</p>
                {entry.templateVersion && <p className="mt-0.5 break-words text-[10px] text-slate-500"><strong>Snapshot template:</strong> {entry.templateVersion}</p>}
                <p className={`mt-1 text-[10px] leading-4 ${entry.reconciliationRequired ? "font-bold text-amber-800" : "text-slate-500"}`}>{entry.safeMessage}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">{entry.reconciliationRequired ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800"><AlertTriangle className="h-3 w-3" />Resend locked until reconciliation</span> : <span className="text-[10px] text-slate-400">Attempt {entry.attemptCount}</span>}{isIssued && canSendIssuedDocument && entry.resendAllowed && <button type="button" onClick={() => startResend(entry)} disabled={deliveryHistoryBlocksSend || sendBusy} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2.5 py-1.5 text-[10px] font-black text-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"><RotateCcw className="h-3 w-3" />Resend</button>}</div>
              </article>
            ))}</div>}
          </section>

          {composeOpen && <div className="mb-3 grid gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 sm:grid-cols-2"><p className="text-[10px] font-black uppercase tracking-wide text-indigo-700 sm:col-span-2">{composeMode === "RESEND" ? "New delivery attempt" : "Send issued document"}</p><label className="text-[10px] font-bold text-slate-700 sm:col-span-2">To<input value={to} onChange={(event) => setTo(event.target.value)} className="field-input mt-1" placeholder="vendor@example.com" /></label><label className="text-[10px] font-bold text-slate-700">CC<input value={cc} onChange={(event) => setCc(event.target.value)} className="field-input mt-1" /></label><label className="text-[10px] font-bold text-slate-700">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} className="field-input mt-1" /></label><label className="text-[10px] font-bold text-slate-700 sm:col-span-2">Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} className="field-input mt-1 resize-y" /></label><div className="flex flex-wrap justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setComposeOpen(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Cancel</button><button type="button" onClick={() => void send()} disabled={sendBusy || deliveryHistoryBlocksSend} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{sendBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}{composeMode === "RESEND" ? "Confirm new send" : "Confirm & Send"}</button></div></div>}
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-[10px] text-slate-500">{isIssued ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> : <FileText className="h-3.5 w-3.5 text-amber-600" />}{document.templateVersion}</div><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={print} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"><Printer className="h-3.5 w-3.5" />Print</button><button type="button" onClick={() => void download()} disabled={downloadBusy || loadingSnapshot} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{downloadBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Generate / Download PDF</button><button type="button" onClick={() => void downloadCompanyPdf()} disabled={!isIssued || !document.snapshotId || !document.templateVersionId || templatePdfBusy || loadingSnapshot} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 disabled:cursor-not-allowed disabled:opacity-45">{templatePdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Company-template PDF</button><button type="button" onClick={() => void downloadCompanyDocx()} disabled={!isIssued || !document.snapshotId || !document.templateVersionId || docxBusy || loadingSnapshot} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-black text-indigo-700 disabled:cursor-not-allowed disabled:opacity-45">{docxBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}Generate company DOCX</button>{onOpenCommunications && <button type="button" onClick={onOpenCommunications} disabled={!isIssued} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"><MessageSquareText className="h-3.5 w-3.5" />Open in Email / SMS</button>}<button type="button" onClick={openCompose} disabled={!isIssued || !document.snapshotId || !canSendIssuedDocument || deliveryHistoryBlocksSend} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-black text-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"><Mail className="h-3.5 w-3.5" />{deliveryActionLabel}</button></div></div>
          {!isIssued && <p className="mt-2 text-right text-[10px] text-amber-700">{isDraft ? "Issuance is required before email sending and immutable resend." : "Cancelled or voided documents cannot be emailed."}</p>}
          {isIssued && !document.templateVersionId && <p className="mt-2 text-right text-[10px] text-slate-500">This historical snapshot uses the PDF fallback because no company template version was pinned at issuance.</p>}
          {isIssued && !canSendIssuedDocument && <p className="mt-2 text-right text-[10px] text-amber-700">Issued-document sending is restricted to users with the dedicated send permission.</p>}
          {isIssued && deliveryHistoryBlocksSend && !deliveryHistoryError && <p className="mt-2 text-right text-[10px] font-bold text-amber-700">A delivery is still unresolved. Reconciliation is required before another send.</p>}
        </footer>
      </section>
    </div>
  );
};

export default DocumentPreviewModal;
