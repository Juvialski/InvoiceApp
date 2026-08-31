import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileCode,
  FileText,
  HelpCircle,
  Link2,
  Loader2,
  PlusCircle,
  Receipt,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  EmailIntakeProfile,
  EntityResolutionAction,
  EntityResolutionConflict,
  EntityResolutionResult,
  Expense,
  Project,
  Vendor,
} from "../types.ts";
import { EXPENSE_CATEGORIES, createLocalExpense } from "../lib/expenses.ts";
import {
  clearPendingEmailExpenseReview,
  findPossibleExpenseDuplicates,
  loadPendingEmailExpenseFile,
  readPendingEmailExpenseReview,
  type ExpenseDuplicateCandidate,
  type FieldProvenance,
  type PendingEmailExpenseReview,
} from "../lib/emailIntake.ts";
import {
  extractVendorEvidenceFromExpense,
  resolveVendorCandidate,
} from "../lib/entityResolution.ts";
import { listCompanyVendors, listEmailIntakeProfiles } from "../lib/persistence.ts";
import { Notice, SectionHeader, StatusBadge } from "./ui/OperationsUI.tsx";

function getResolutionActionBadge(
  action?: EntityResolutionAction,
  matchedName?: string,
  conflicts?: EntityResolutionConflict[],
) {
  const conflictSummary = conflicts?.[0]?.reason || "Conflict detected";
  switch (action) {
    case "LINK_EXISTING":
      return {
        label: `Link: ${matchedName || "Existing Vendor"}`,
        bg: "bg-emerald-100 text-emerald-800 border-emerald-300",
        icon: Link2,
      };
    case "ENRICH_EXISTING":
      return {
        label: `Enrich: ${matchedName || "Existing Vendor"}`,
        bg: "bg-blue-100 text-blue-800 border-blue-300",
        icon: Sparkles,
      };
    case "CREATE_NEW":
      return {
        label: `New: ${matchedName || "New Payee"}`,
        bg: "bg-purple-100 text-purple-800 border-purple-300",
        icon: PlusCircle,
      };
    case "POSSIBLE_DUPLICATE":
      return {
        label: `Similar: ${matchedName || "Existing Vendor"}`,
        bg: "bg-amber-100 text-amber-800 border-amber-300",
        icon: HelpCircle,
      };
    case "NEEDS_REVIEW":
    default:
      return {
        label: `Needs Review: ${conflictSummary}`,
        bg: "bg-rose-100 text-rose-800 border-rose-300",
        icon: AlertTriangle,
      };
  }
}

const FieldProvenanceBadge: React.FC<{ provenance?: FieldProvenance }> = ({ provenance }) => {
  if (!provenance) return null;
  const { state, source } = provenance;
  if (state === "DETECTED") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700" title={source || "Extracted directly from receipt"}>
        <CheckCircle2 className="h-2.5 w-2.5" /> Extracted
      </span>
    );
  }
  if (state === "AI_EXTRACTED") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700" title={source || "Extracted by AI"}>
        <Sparkles className="h-2.5 w-2.5" /> AI Extracted
      </span>
    );
  }
  if (state === "SUGGESTED") {
    return <span className="inline-flex rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700" title={source}>Suggested</span>;
  }
  if (state === "HINT") {
    return <span className="inline-flex rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700" title={source}>Hint</span>;
  }
  return <span className="inline-flex rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500" title={source}>Not detected</span>;
};

interface ConnectedExpenseReviewProps {
  projects: Project[];
  existingExpenses: Expense[];
  canManage?: boolean;
  onSaveExpense: (expense: Expense) => Promise<void> | void;
  vendors?: Vendor[];
}

export const ConnectedExpenseReview: React.FC<ConnectedExpenseReviewProps> = ({
  projects,
  existingExpenses,
  canManage = false,
  onSaveExpense,
  vendors: propVendors,
}) => {
  const [pending, setPending] = useState<PendingEmailExpenseReview | null>(null);
  const [expenseDate, setExpenseDate] = useState("");
  const [category, setCategory] = useState("Miscellaneous");
  const [description, setDescription] = useState("");
  const [payee, setPayee] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [currency, setCurrency] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [vendorsList, setVendorsList] = useState<Vendor[]>(propVendors || []);
  const [vendorResolution, setVendorResolution] = useState<EntityResolutionResult | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<"document" | "text">("document");
  const [zoomLevel, setZoomLevel] = useState(100);

  useEffect(() => {
    const staged = readPendingEmailExpenseReview();
    if (!staged) return;
    setPending(staged);
    const suggested = staged.suggestedExpense;
    const amountWasDetected = suggested.fieldProvenance?.amount?.state !== "NOT_DETECTED";
    const currencyWasDetected = suggested.fieldProvenance?.currency?.state !== "NOT_DETECTED";
    const stagedAmount = Number(suggested.amount);

    setExpenseDate(suggested.expenseDate || new Date().toISOString().slice(0, 10));
    setCategory(suggested.category || "Miscellaneous");
    setDescription(suggested.description || "");
    setPayee(suggested.payee || "");
    setAmountInput(amountWasDetected && Number.isFinite(stagedAmount) && stagedAmount > 0 ? String(stagedAmount) : "");
    setCurrency(currencyWasDetected ? (suggested.currency || "") : "");
    setPaymentMethod(suggested.paymentMethod || "");
    setReferenceNumber(suggested.referenceNumber || "");
    setNotes(suggested.notes || "");
    setProjectId("");

    void (async () => {
      try {
        const [loadedVendors, loadedProfiles] = await Promise.all([
          propVendors?.length ? Promise.resolve(propVendors) : listCompanyVendors().catch(() => [] as Vendor[]),
          listEmailIntakeProfiles().catch(() => [] as EmailIntakeProfile[]),
        ]);
        setVendorsList(loadedVendors);

        const matchingProfile = loadedProfiles.find((profile) => profile.id === staged.matchedProfileId && profile.enabled !== false)
          || (staged.matchedProfileId
            ? ({
                id: staged.matchedProfileId,
                name: staged.matchedProfileName || "Matched Profile",
                linkedVendorId: staged.linkedProfileVendorId,
                enabled: true,
              } as EmailIntakeProfile)
            : undefined);

        const candidateEvidence = extractVendorEvidenceFromExpense(
          suggested,
          { sender: staged.sender, subject: staged.subject },
          matchingProfile,
        );
        const resolution = resolveVendorCandidate(
          {
            candidateId: staged.id,
            evidence: candidateEvidence,
            sourceRef: {
              subject: staged.subject,
              sender: staged.sender,
              fileName: staged.fileName,
              attachmentId: staged.sourceDocumentId,
            },
          },
          loadedVendors,
          loadedProfiles.length ? loadedProfiles : matchingProfile ? [matchingProfile] : [],
        );
        setVendorResolution(resolution);

        const stagedConfirmedVendorIsStillValid = Boolean(
          staged.confirmedVendorId
          && resolution.proposedAction === "LINK_EXISTING"
          && resolution.conflicts.length === 0
          && resolution.matchedEntityId === staged.confirmedVendorId
          && loadedVendors.some((vendor) => vendor.id === staged.confirmedVendorId),
        );
        if (stagedConfirmedVendorIsStillValid) {
          setSelectedVendorId(staged.confirmedVendorId!);
        } else if (
          resolution.proposedAction === "LINK_EXISTING"
          && resolution.matchedEntityId
          && resolution.conflicts.length === 0
          && loadedVendors.some((vendor) => vendor.id === resolution.matchedEntityId)
        ) {
          setSelectedVendorId(resolution.matchedEntityId);
        } else {
          setSelectedVendorId("");
        }
      } catch {
        // Suggested fields remain reviewable even if master-data lookup fails.
      }
    })();
  }, [propVendors]);

  const hasReceiptAttachment = Boolean(pending?.gmailAttachmentId);

  useEffect(() => {
    if (!pending) return;
    if (!pending.gmailAttachmentId) {
      setPreviewObjectUrl(null);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    setPreviewLoading(true);
    setPreviewError(null);

    void (async () => {
      try {
        const file = await loadPendingEmailExpenseFile(pending);
        if (!active) return;
        objectUrl = URL.createObjectURL(file);
        setPreviewObjectUrl(objectUrl);
      } catch (reason: any) {
        if (active) setPreviewError(reason?.message || "Preview could not be rendered.");
      } finally {
        if (active) setPreviewLoading(false);
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pending?.sourceDocumentId, pending?.gmailAttachmentId]);

  const duplicates = useMemo<ExpenseDuplicateCandidate[]>(() => {
    if (!pending) return [];
    return findPossibleExpenseDuplicates(
      {
        payee: payee || undefined,
        amount: amountInput ? Number(amountInput) : undefined,
        currency: currency || undefined,
        expenseDate,
        referenceNumber: referenceNumber || undefined,
        sourceDocumentId: pending.sourceDocumentId,
        sourceSha256: pending.sourceSha256,
      },
      existingExpenses,
      pending.exactDuplicateExpense ? [pending.exactDuplicateExpense.id] : undefined,
    );
  }, [pending, payee, amountInput, currency, expenseDate, referenceNumber, existingExpenses]);

  if (!pending) return null;

  const exactDuplicateExpense = pending.exactDuplicateExpense;
  const prov = pending.suggestedExpense.fieldProvenance || {};
  const quality = pending.suggestedExpense.extractionQuality;
  const isPdf = pending.mimeType === "application/pdf" || pending.fileName?.toLowerCase().endsWith(".pdf");
  const isImage = pending.mimeType?.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(pending.fileName || "");

  const dismiss = () => {
    clearPendingEmailExpenseReview();
    setPending(null);
    setError(null);
  };

  const handleDownloadOriginal = async () => {
    if (!pending.gmailAttachmentId) return;
    setDownloadBusy(true);
    setError(null);
    try {
      const file = await loadPendingEmailExpenseFile(pending);
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name || pending.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (reason: any) {
      setError(reason?.message || "Could not download the preserved receipt file.");
    } finally {
      setDownloadBusy(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!canManage) {
      setError("Expense creation requires expense management permission.");
      return;
    }
    if (exactDuplicateExpense) {
      setError(`This receipt is already recorded as Expense #${exactDuplicateExpense.id.slice(0, 8)}. Open the existing expense instead of creating another record.`);
      return;
    }
    if (!hasReceiptAttachment) {
      setError("Attachment-free email receipts cannot yet be committed from Email Intake because they do not have a receipt source-document link. Create the expense manually or use an attached receipt.");
      return;
    }

    const cleanDescription = description.trim();
    const cleanCurrency = currency.trim().toUpperCase();
    const parsedAmount = Number(amountInput);

    if (!cleanDescription) {
      setError("Enter an expense description before saving.");
      return;
    }
    if (!amountInput || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Confirm and enter a positive receipt amount before saving.");
      return;
    }
    if (!/^[A-Z]{3}$/.test(cleanCurrency)) {
      setError("Confirm a three-letter currency code such as PHP before saving.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const newExpense = createLocalExpense({
        projectId: projectId || undefined,
        expenseDate,
        category: category.trim() || "Miscellaneous",
        description: cleanDescription,
        payee: payee.trim() || undefined,
        amount: parsedAmount,
        currency: cleanCurrency,
        paymentMethod: paymentMethod.trim() || undefined,
        referenceNumber: referenceNumber.trim() || undefined,
        status: "DRAFT",
        receiptSourceDocumentId: pending.sourceDocumentId,
        notes: notes.trim() || undefined,
      });
      await onSaveExpense(newExpense);
      dismiss();
    } catch (reason: any) {
      setError(reason?.message || "Could not save expense draft.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm sm:p-5" aria-label="Connected mailbox expense review">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader
          title="Review expense from Email Intake"
          description="The original source is preserved. Review extracted details before explicitly saving a Draft expense."
          icon={Receipt}
        />
        <button type="button" disabled={busy} onClick={dismiss} aria-label="Dismiss connected expense review" className="rounded-lg p-1.5 text-slate-500 hover:bg-white disabled:opacity-50">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-3 rounded-xl border border-amber-200 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black text-slate-900">{pending.subject || "Email receipt"}</p>
            {pending.isAiExtracted ? (
              <StatusBadge tone="info" icon={Sparkles}>AI Extracted (Gemini)</StatusBadge>
            ) : pending.suggestedExpense.isMachineReadable ? (
              <StatusBadge tone="success" icon={CheckCircle2}>Deterministic PDF Extraction (0 AI calls)</StatusBadge>
            ) : (
              <StatusBadge tone="warning" icon={Sparkles}>Deterministic Suggestion</StatusBadge>
            )}
            {quality && (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold ${quality.status === "GOOD" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : quality.status === "NEEDS_REVIEW" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-rose-200 bg-rose-50 text-rose-700"}`} title={`Extraction quality score: ${quality.score}/100`}>
                Quality: {quality.status} ({quality.score}%)
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">{pending.sender || "Connected mailbox"} · {hasReceiptAttachment ? `Attachment: ${pending.fileName}` : "Email-only receipt"}</p>
          <p className="mt-0.5 text-[10px] text-slate-400">Preserved source: {pending.sourceDocumentId}{pending.sourceSha256 ? ` · SHA-256: ${pending.sourceSha256.slice(0, 12)}…` : ""}</p>
        </div>
        {hasReceiptAttachment && (
          <button type="button" disabled={downloadBusy} onClick={() => void handleDownloadOriginal()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
            {downloadBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Download receipt file
          </button>
        )}
      </div>

      {exactDuplicateExpense && (
        <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-950" role="alert">
          <div className="flex items-center gap-2 font-black text-rose-900">
            <AlertTriangle className="h-4 w-4" /> Exact receipt duplicate
          </div>
          <p className="mt-1.5">This exact preserved receipt file is already recorded as Expense #{exactDuplicateExpense.id.slice(0, 8)}.</p>
          <p className="mt-1 text-[11px] text-rose-800">{exactDuplicateExpense.payee || "No payee"} · {exactDuplicateExpense.amount} {exactDuplicateExpense.currency} · {exactDuplicateExpense.expenseDate} · {exactDuplicateExpense.status}</p>
          <p className="mt-1 text-[11px] font-semibold text-rose-800">AI extraction was skipped and another Expense cannot be created from this source.</p>
        </div>
      )}

      {!hasReceiptAttachment && (
        <div className="mt-3">
          <Notice tone="warning">This is an attachment-free electronic receipt. The email can be reviewed, but Email Intake cannot commit it yet because the current Expense provenance contract requires a preserved receipt source document.</Notice>
        </div>
      )}

      {duplicates.filter((duplicate) => !exactDuplicateExpense || duplicate.expense.id !== exactDuplicateExpense.id).map((duplicate, index) => (
        <div className="mt-3" key={`${duplicate.expense.id}-${duplicate.matchType}-${index}`}>
          <Notice tone="warning"><strong>Possible duplicate ({duplicate.matchType}):</strong> {duplicate.reason} Existing Expense #{duplicate.expense.id.slice(0, 8)} · {duplicate.expense.status} · {duplicate.expense.amount} {duplicate.expense.currency}.</Notice>
        </div>
      ))}

      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" /><span>{error}</span>
        </div>
      )}

      {!canManage && <div className="mt-3"><Notice tone="warning">Your access profile is read-only for Expenses. Creating a Draft requires expense management permission.</Notice></div>}

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-6">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setPreviewTab("document")} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${previewTab === "document" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> Receipt Preview</span>
              </button>
              <button type="button" onClick={() => setPreviewTab("text")} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${previewTab === "text" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                <span className="flex items-center gap-1"><FileCode className="h-3.5 w-3.5" /> Source Text</span>
              </button>
            </div>
            {previewTab === "document" && isImage && (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setZoomLevel((level) => Math.max(50, level - 25))} className="rounded p-1 text-slate-500 hover:bg-slate-200" aria-label="Zoom receipt out"><ZoomOut className="h-3.5 w-3.5" /></button>
                <span className="text-[10px] font-bold text-slate-600">{zoomLevel}%</span>
                <button type="button" onClick={() => setZoomLevel((level) => Math.min(250, level + 25))} className="rounded p-1 text-slate-500 hover:bg-slate-200" aria-label="Zoom receipt in"><ZoomIn className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </div>

          <div className="relative flex min-h-[380px] max-h-[580px] flex-1 items-center justify-center overflow-auto bg-slate-900/5 p-2">
            {previewLoading && <div className="flex flex-col items-center gap-2 p-8 text-slate-500"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /><span className="text-xs font-medium">Loading receipt document…</span></div>}
            {!previewLoading && previewError && <div className="p-6 text-center text-xs text-slate-600"><AlertCircle className="mx-auto mb-2 h-6 w-6 text-amber-500" /><p className="font-semibold">Document preview could not be rendered.</p><p className="mt-1 text-[11px]">{previewError}</p></div>}
            {!previewLoading && !previewError && previewTab === "document" && isImage && previewObjectUrl && (
              <div className="flex h-full w-full items-center justify-center overflow-auto"><img src={previewObjectUrl} alt={pending.fileName || "Receipt"} style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: "center center" }} className="max-h-[520px] max-w-full rounded object-contain shadow-sm" /></div>
            )}
            {!previewLoading && !previewError && previewTab === "document" && isPdf && previewObjectUrl && <iframe src={previewObjectUrl} title={pending.fileName || "Receipt PDF"} className="h-[520px] w-full rounded border-0 bg-white" />}
            {!previewLoading && !previewError && previewTab === "document" && (!hasReceiptAttachment || (!isImage && !isPdf)) && (
              <div className="w-full p-4 text-xs text-slate-700"><div className="rounded-lg border border-slate-200 bg-white p-3"><p className="font-bold text-slate-900">Email receipt source</p><p className="mt-1 text-slate-500">{pending.sender}</p><p className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-slate-800">{pending.emailBody || pending.emailSnippet || "No email body text available."}</p></div></div>
            )}
            {!previewLoading && previewTab === "text" && (
              <div className="h-[520px] w-full overflow-auto rounded bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200"><p className="font-bold text-indigo-400">--- RECEIPT SOURCE TEXT ---</p><pre className="mt-2 whitespace-pre-wrap">{pending.rawText || pending.emailBody || pending.emailSnippet || "No machine-readable receipt text was detected."}</pre></div>
            )}
          </div>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); void handleSaveDraft(); }} className="space-y-4 lg:col-span-6">
          <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
            <legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-slate-700">Cost details</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1"><div className="flex items-center justify-between"><span className="field-label">Date</span><FieldProvenanceBadge provenance={prov.expenseDate} /></div><input type="date" required aria-label="Expense date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} className="field-input" /></label>
              <label className="space-y-1"><div className="flex items-center justify-between"><span className="field-label">Project allocation (Optional)</span><FieldProvenanceBadge provenance={prov.projectId} /></div><select aria-label="Expense project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className="field-input"><option value="">Unallocated (Confirm later)</option>{projects.filter((project) => project.status !== "ARCHIVED").map((project) => <option key={project.id} value={project.id}>{project.projectCode} — {project.projectName}</option>)}</select>{pending.suggestedExpense.projectId && <p className="text-[10px] leading-4 text-amber-800">Receipt hint: {pending.suggestedExpense.projectId}. Select the matching project explicitly if applicable.</p>}</label>
              <label className="space-y-1 sm:col-span-2"><div className="flex items-center justify-between"><span className="field-label">Category</span><FieldProvenanceBadge provenance={prov.category} /></div><input list="connected-expense-categories" aria-label="Expense category" value={category} onChange={(event) => setCategory(event.target.value)} className="field-input" /><datalist id="connected-expense-categories">{EXPENSE_CATEGORIES.map((item) => <option key={item} value={item} />)}</datalist></label>
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-slate-700">Amount & Payee</legend>
              {vendorResolution && (() => { const badge = getResolutionActionBadge(vendorResolution.proposedAction, vendorResolution.matchedEntityName || payee, vendorResolution.conflicts); const BadgeIcon = badge.icon; return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold ${badge.bg}`}><BadgeIcon className="h-2.5 w-2.5" />{badge.label}</span>; })()}
            </div>
            {vendorResolution?.conflicts.map((conflict, index) => <Notice key={index} tone="danger"><strong>Identity conflict:</strong> {conflict.reason}</Notice>)}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <div className="flex items-center justify-between"><span className="field-label">Amount & Currency</span><div className="flex items-center gap-1"><FieldProvenanceBadge provenance={prov.amount} /><FieldProvenanceBadge provenance={prov.currency} /></div></div>
                <div className="flex"><input type="number" min="0.01" step="0.01" required aria-label="Expense amount" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} placeholder="Confirm amount" className={`min-w-0 flex-1 rounded-l-xl border px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${!amountInput ? "border-amber-400 bg-amber-50/50" : "border-slate-200"}`} /><input maxLength={3} required aria-label="Expense currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} placeholder="---" className={`w-20 rounded-r-xl border-y border-r px-2 py-2 text-xs uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${!currency ? "border-amber-400 bg-amber-50/50" : "border-slate-200"}`} /></div>
                {!amountInput && <p className="text-[10px] font-medium text-amber-700">Amount was not detected. Verify it from the receipt before saving.</p>}
                {!currency && <p className="text-[10px] font-medium text-amber-700">Currency was not detected. Confirm the correct ISO currency code.</p>}
              </label>
              <label className="space-y-1"><div className="flex items-center justify-between"><span className="field-label">Payee / Merchant</span><FieldProvenanceBadge provenance={prov.payee} /></div><input aria-label="Expense payee" value={payee} onChange={(event) => setPayee(event.target.value)} placeholder="Merchant name" className="field-input" /></label>
              <label className="space-y-1 sm:col-span-2"><span className="field-label">Master Vendor Link (Optional)</span><select aria-label="Master Vendor Link" value={selectedVendorId} onChange={(event) => { const vendorId = event.target.value; setSelectedVendorId(vendorId); if (!vendorId) return; const vendor = vendorsList.find((item) => item.id === vendorId); if (vendor) { setPayee(vendor.name); setVendorResolution((current) => current ? { ...current, proposedAction: "LINK_EXISTING", matchedEntityId: vendor.id, matchedEntityName: vendor.name, matchedEntityDetails: { taxId: vendor.taxId, email: vendor.email, phone: vendor.phone, address: vendor.address } } : current); } }} className="field-input"><option value="">-- Free-text Payee (No Master Vendor Link) --</option>{vendorsList.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}{vendor.taxId ? ` (TIN: ${vendor.taxId})` : ""}</option>)}</select><p className="text-[10px] text-slate-400">Only an explicit reviewer selection may normalize the proposed payee to a master Vendor. Saving never mutates Vendor records.</p></label>
              <label className="space-y-1"><div className="flex items-center justify-between"><span className="field-label">Payment method</span><FieldProvenanceBadge provenance={prov.paymentMethod} /></div><input aria-label="Payment method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} placeholder="e.g. GCash, Cash" className="field-input" /></label>
              <label className="space-y-1"><div className="flex items-center justify-between"><span className="field-label">Receipt / Reference number</span><FieldProvenanceBadge provenance={prov.referenceNumber} /></div><input aria-label="Reference number" value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder="OR# or Ref#" className="field-input" /></label>
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4"><legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-slate-700">Description & Notes</legend><label className="block space-y-1"><div className="flex items-center justify-between"><span className="field-label">Description</span><FieldProvenanceBadge provenance={prov.description} /></div><input required aria-label="Expense description" value={description} onChange={(event) => setDescription(event.target.value)} className="field-input" /></label><label className="block space-y-1"><span className="field-label">Notes</span><textarea aria-label="Expense notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className="field-input resize-y" /></label></fieldset>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
            <p className="text-[10px] text-slate-500">Email Intake creates Draft expenses only. Approval remains a separate normal Expense lifecycle action.</p>
            <div className="flex items-center gap-2"><button type="button" disabled={busy} onClick={dismiss} className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-white disabled:opacity-50">Cancel</button><button type="submit" disabled={busy || !canManage || Boolean(exactDuplicateExpense) || !hasReceiptAttachment} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Save expense draft</button></div>
          </div>
        </form>
      </div>
    </section>
  );
};
