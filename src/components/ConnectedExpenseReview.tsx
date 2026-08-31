import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileCode,
  FileText,
  Hash,
  HelpCircle,
  Image as ImageIcon,
  Info,
  Link2,
  Loader2,
  Maximize2,
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
  ExpenseStatus,
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
  const conflictSummary =
    conflicts && conflicts.length > 0 ? conflicts[0].reason : "Conflict detected";
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

const FieldProvenanceBadge: React.FC<{ provenance?: FieldProvenance; label?: string }> = ({ provenance, label }) => {
  if (!provenance) return null;
  const { state, source } = provenance;
  if (state === "DETECTED") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200"
        title={source || "Extracted directly from receipt"}
      >
        <CheckCircle2 className="h-2.5 w-2.5" />
        Extracted
      </span>
    );
  }
  if (state === "AI_EXTRACTED") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 border border-indigo-200"
        title={source || "Extracted by AI model"}
      >
        <Sparkles className="h-2.5 w-2.5" />
        AI Extracted
      </span>
    );
  }
  if (state === "SUGGESTED") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 border border-amber-200"
        title={source || "Suggested classification"}
      >
        Suggested
      </span>
    );
  }
  if (state === "HINT") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 border border-blue-200"
        title={source || "Advisory context hint"}
      >
        Hint
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 border border-slate-200"
      title={source || "Not detected on receipt"}
    >
      Not detected
    </span>
  );
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
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState("PHP");
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

  // Preview pane state
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<"document" | "text">("document");
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  useEffect(() => {
    const staged = readPendingEmailExpenseReview();
    if (!staged) return;
    setPending(staged);
    const suggested = staged.suggestedExpense;
    setExpenseDate(suggested.expenseDate || new Date().toISOString().slice(0, 10));
    setCategory(suggested.category || "Miscellaneous");
    setDescription(suggested.description || "");
    setPayee(suggested.payee || "");
    setAmount(Number(suggested.amount) || 0);
    setCurrency(suggested.currency || "PHP");
    setPaymentMethod(suggested.paymentMethod || "");
    setReferenceNumber(suggested.referenceNumber || "");
    setNotes(suggested.notes || "");
    // Project context remains advisory. The user must explicitly choose a
    // project before an allocation can be persisted with the expense.
    setProjectId("");

    void (async () => {
      try {
        const [loadedVendors, loadedProfiles] = await Promise.all([
          propVendors && propVendors.length > 0 ? Promise.resolve(propVendors) : listCompanyVendors().catch(() => [] as Vendor[]),
          listEmailIntakeProfiles().catch(() => [] as EmailIntakeProfile[]),
        ]);
        setVendorsList(loadedVendors);

        const matchingProfile =
          loadedProfiles.find((p) => p.id === staged.matchedProfileId && p.enabled !== false) ||
          (staged.matchedProfileId
            ? ({
                id: staged.matchedProfileId,
                name: staged.matchedProfileName || "Matched Profile",
                linkedVendorId: staged.linkedProfileVendorId,
                enabled: true,
              } as EmailIntakeProfile)
            : undefined);

        const candidateEvidence = extractVendorEvidenceFromExpense(
          suggested,
          {
            sender: staged.sender,
            subject: staged.subject,
          },
          matchingProfile,
        );

        const res = resolveVendorCandidate(
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

        setVendorResolution(res);

        const stagedConfirmedVendorIsStillValid = Boolean(
          staged.confirmedVendorId
          && res.proposedAction === "LINK_EXISTING"
          && res.conflicts.length === 0
          && res.matchedEntityId === staged.confirmedVendorId
          && loadedVendors.some((v) => v.id === staged.confirmedVendorId),
        );
        if (stagedConfirmedVendorIsStillValid) {
          setSelectedVendorId(staged.confirmedVendorId!);
        } else if (
          res.proposedAction === "LINK_EXISTING" &&
          res.matchedEntityId &&
          loadedVendors.some((v) => v.id === res.matchedEntityId)
        ) {
          setSelectedVendorId(res.matchedEntityId);
        } else {
          setSelectedVendorId("");
        }
      } catch {
        // Leave suggested values on error
      }
    })();
  }, [propVendors]);

  // Load preview file blob
  useEffect(() => {
    if (!pending) return;
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
      } catch (err: any) {
        if (active) setPreviewError(err?.message || "Preview could not be rendered.");
      } finally {
        if (active) setPreviewLoading(false);
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pending?.sourceDocumentId]);

  const duplicates = useMemo<ExpenseDuplicateCandidate[]>(() => {
    if (!pending) return [];
    return findPossibleExpenseDuplicates(
      {
        payee: payee || undefined,
        amount: Number(amount) || 0,
        currency,
        expenseDate,
        referenceNumber: referenceNumber || undefined,
        sourceDocumentId: pending.sourceDocumentId,
        sourceSha256: pending.sourceSha256,
      },
      existingExpenses
    );
  }, [pending, payee, amount, currency, expenseDate, referenceNumber, existingExpenses]);

  if (!pending) return null;

  const dismiss = () => {
    clearPendingEmailExpenseReview();
    setPending(null);
    setError(null);
  };

  const handleDownloadOriginal = async () => {
    if (!pending) return;
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
    } catch (err: any) {
      setError(err?.message || "Could not download the preserved receipt file.");
    } finally {
      setDownloadBusy(false);
    }
  };

  const handleSubmit = async (saveStatus: ExpenseStatus) => {
    if (!canManage) {
      setError("Expense creation requires expense management permission.");
      return;
    }
    const cleanDesc = description.trim();
    const cleanCurr = currency.trim().toUpperCase();
    const parsedAmount = Number(amount);

    if (!cleanDesc) {
      setError("Enter an expense description before saving.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError("Enter a valid non-negative expense amount.");
      return;
    }
    if (parsedAmount === 0 && pending.suggestedExpense.fieldProvenance?.amount?.state === "NOT_DETECTED") {
      setError("Receipt amount was not detected. Please verify and enter the confirmed amount before saving.");
      return;
    }
    if (!/^[A-Z]{3}$/.test(cleanCurr)) {
      setError("Enter a three-letter currency code such as PHP.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const newExpense = createLocalExpense({
        projectId: projectId || undefined,
        expenseDate,
        category: category.trim() || "Miscellaneous",
        description: cleanDesc,
        payee: payee.trim() || undefined,
        amount: parsedAmount,
        currency: cleanCurr,
        paymentMethod: paymentMethod.trim() || undefined,
        referenceNumber: referenceNumber.trim() || undefined,
        status: saveStatus,
        receiptSourceDocumentId: pending.sourceDocumentId,
        notes: notes.trim() || undefined,
      });

      await onSaveExpense(newExpense);
      dismiss();
    } catch (err: any) {
      setError(err?.message || "Could not save expense draft.");
    } finally {
      setBusy(false);
    }
  };

  const isPdf = pending.mimeType === "application/pdf" || pending.fileName?.toLowerCase().endsWith(".pdf");
  const isImage = pending.mimeType?.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(pending.fileName || "");
  const prov = pending.suggestedExpense.fieldProvenance || {};
  const quality = pending.suggestedExpense.extractionQuality;

  return (
    <section
      className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm sm:p-5"
      aria-label="Connected mailbox expense review"
    >
      <div className="flex items-start justify-between gap-3">
        <SectionHeader
          title="Review expense from Email Intake"
          description="The original email and receipt attachment are preserved. Review extracted details against the original source before saving."
          icon={Receipt}
        />
        <button
          type="button"
          disabled={busy}
          onClick={dismiss}
          aria-label="Dismiss connected expense review"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-white disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Header bar with extraction provenance summary */}
      <div className="mt-3 flex flex-col gap-3 rounded-xl border border-amber-200 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black text-slate-900">{pending.subject || "Email receipt"}</p>
            {pending.isAiExtracted ? (
              <StatusBadge tone="info" icon={Sparkles}>
                AI Extracted (Gemini)
              </StatusBadge>
            ) : pending.suggestedExpense.isMachineReadable ? (
              <StatusBadge tone="success" icon={CheckCircle2}>
                Deterministic PDF Extraction (0 AI calls)
              </StatusBadge>
            ) : (
              <StatusBadge tone="warning" icon={Sparkles}>
                Deterministic Suggestion
              </StatusBadge>
            )}
            {quality && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold ${
                  quality.status === "GOOD"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : quality.status === "NEEDS_REVIEW"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
                title={`Extraction Quality Score: ${quality.score}/100`}
              >
                Quality: {quality.status} ({quality.score}%)
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {pending.sender || "Connected mailbox"} · Attachment: {pending.fileName}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">
            Preserved source: {pending.sourceDocumentId}
            {pending.sourceSha256 ? ` · SHA-256: ${pending.sourceSha256.slice(0, 12)}…` : ""}
          </p>
        </div>
        <button
          type="button"
          disabled={downloadBusy}
          onClick={() => void handleDownloadOriginal()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {downloadBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          Download receipt file
        </button>
      </div>

      {duplicates.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {duplicates.map((dup, i) => (
            <Notice key={i} tone="warning">
              <div className="flex flex-col gap-0.5">
                <span>
                  <strong>Duplicate warning ({dup.matchType}):</strong> {dup.reason}
                </span>
                <span className="text-[10px] text-amber-900/80">
                  Existing Expense #{dup.expense.id.slice(0, 8)} · Status: <strong>{dup.expense.status}</strong> · {dup.expense.payee || "No Payee"} · {dup.expense.amount} {dup.expense.currency} · {dup.expense.expenseDate}
                </span>
              </div>
            </Notice>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {!canManage && (
        <div className="mt-3">
          <Notice tone="warning">
            Your access profile has read-only access to expenses. Creating or saving expense drafts requires expense management permission.
          </Notice>
        </div>
      )}

      {/* Dual-pane layout on desktop, stacked on mobile */}
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left Pane: Live Receipt Preview (6 cols on lg) */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-6">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPreviewTab("document")}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                  previewTab === "document"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  Receipt Preview
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab("text")}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                  previewTab === "text"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="flex items-center gap-1">
                  <FileCode className="h-3.5 w-3.5" />
                  Source Text
                </span>
              </button>
            </div>

            {previewTab === "document" && isImage && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(50, z - 25))}
                  className="rounded p-1 text-slate-500 hover:bg-slate-200"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="text-[10px] font-bold text-slate-600">{zoomLevel}%</span>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(250, z + 25))}
                  className="rounded p-1 text-slate-500 hover:bg-slate-200"
                  title="Zoom In"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="relative flex min-h-[380px] max-h-[580px] flex-1 items-center justify-center overflow-auto bg-slate-900/5 p-2">
            {previewLoading && (
              <div className="flex flex-col items-center gap-2 p-8 text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                <span className="text-xs font-medium">Loading receipt document…</span>
              </div>
            )}

            {!previewLoading && previewError && (
              <div className="flex flex-col items-center gap-2 p-6 text-center text-slate-600">
                <AlertCircle className="h-6 w-6 text-amber-500" />
                <p className="text-xs font-semibold">Document preview not directly renderable</p>
                <p className="text-[11px] text-slate-500 max-w-xs">{previewError}</p>
                <button
                  type="button"
                  onClick={() => void handleDownloadOriginal()}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Download receipt file
                </button>
              </div>
            )}

            {!previewLoading && !previewError && previewTab === "document" && (
              <>
                {isImage && previewObjectUrl && (
                  <div className="flex h-full w-full items-center justify-center overflow-auto">
                    <img
                      src={previewObjectUrl}
                      alt={pending.fileName || "Receipt"}
                      style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: "center center" }}
                      className="max-h-[520px] max-w-full rounded object-contain shadow-sm transition-transform duration-150"
                    />
                  </div>
                )}

                {isPdf && previewObjectUrl && (
                  <iframe
                    src={previewObjectUrl}
                    title={pending.fileName || "Receipt PDF"}
                    className="h-[520px] w-full rounded border-0 bg-white"
                  />
                )}

                {!isImage && !isPdf && (
                  <div className="flex flex-col gap-2 p-4 text-xs text-slate-700">
                    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
                      <p className="font-bold text-slate-900">Email Context & Receipt Snippet</p>
                      <p className="mt-1 text-slate-500">{pending.sender}</p>
                      <p className="mt-2 text-slate-800 whitespace-pre-wrap font-mono text-[11px]">
                        {pending.emailBody || pending.emailSnippet || "No email body text available."}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {!previewLoading && previewTab === "text" && (
              <div className="h-[520px] w-full overflow-auto rounded bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
                <p className="font-bold text-indigo-400">--- EXTRACTED RECEIPT TEXT ---</p>
                <pre className="mt-2 whitespace-pre-wrap">
                  {pending.rawText || pending.emailBody || pending.emailSnippet || "No raw text detected from receipt."}
                </pre>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
            <span>
              File: <strong>{pending.fileName}</strong> ({pending.mimeType || "Unknown type"})
            </span>
          </div>
        </div>

        {/* Right Pane: Review Form & Provenance (6 cols on lg) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit("DRAFT");
          }}
          className="space-y-4 lg:col-span-6"
        >
          {/* Cost details */}
          <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
            <legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-slate-700">
              Cost details
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="field-label">Date</span>
                  <FieldProvenanceBadge provenance={prov.expenseDate} />
                </div>
                <input
                  type="date"
                  required
                  aria-label="Expense date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="field-input"
                />
              </label>

              <label className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="field-label">Project allocation (Optional)</span>
                  <FieldProvenanceBadge provenance={prov.projectId} />
                </div>
                <select
                  aria-label="Expense project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="field-input"
                >
                  <option value="">Unallocated (Confirm later)</option>
                  {projects
                    .filter((p) => p.status !== "ARCHIVED")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.projectCode} — {p.projectName}
                      </option>
                    ))}
                </select>
                {pending.suggestedExpense.projectId && (
                  <p className="text-[10px] leading-4 text-amber-800">
                    Email hint: {pending.suggestedExpense.projectId}. Choose the matching project explicitly if this receipt belongs to it.
                  </p>
                )}
              </label>

              <label className="space-y-1 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <span className="field-label">Category</span>
                  <FieldProvenanceBadge provenance={prov.category} />
                </div>
                <input
                  list="connected-expense-categories"
                  aria-label="Expense category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="field-input"
                />
                <datalist id="connected-expense-categories">
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </label>
            </div>
          </fieldset>

          {/* Amount & Payee */}
          <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-slate-700">
                Amount & Payee
              </legend>
              {vendorResolution && (() => {
                const badge = getResolutionActionBadge(
                  vendorResolution.proposedAction,
                  vendorResolution.matchedEntityName || payee,
                  vendorResolution.conflicts,
                );
                const BadgeIcon = badge.icon;
                return (
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold ${badge.bg}`}>
                    <BadgeIcon className="w-2.5 h-2.5" />
                    {badge.label}
                  </span>
                );
              })()}
            </div>

            {vendorResolution?.conflicts && vendorResolution.conflicts.length > 0 && (
              <div className="space-y-1">
                {vendorResolution.conflicts.map((conflict, i) => (
                  <Notice key={i} tone="danger">
                    <strong>Identity conflict:</strong> {conflict.reason}
                  </Notice>
                ))}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="field-label">Amount & Currency</span>
                  <div className="flex items-center gap-1">
                    <FieldProvenanceBadge provenance={prov.amount} />
                    <FieldProvenanceBadge provenance={prov.currency} />
                  </div>
                </div>
                <div className="flex">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    aria-label="Expense amount"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className={`min-w-0 flex-1 rounded-l-xl border px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      amount === 0 && prov.amount?.state === "NOT_DETECTED"
                        ? "border-amber-400 bg-amber-50/50 text-amber-900"
                        : "border-slate-200"
                    }`}
                  />
                  <input
                    maxLength={3}
                    aria-label="Expense currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    className="w-20 rounded-r-xl border-y border-r border-slate-200 px-2 py-2 text-xs uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  />
                </div>
                {amount === 0 && prov.amount?.state === "NOT_DETECTED" && (
                  <p className="text-[10px] text-amber-700 font-medium">
                    Amount was not detected from receipt text. Please verify from the receipt preview.
                  </p>
                )}
              </label>

              <label className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="field-label">Payee / Merchant</span>
                  <FieldProvenanceBadge provenance={prov.payee} />
                </div>
                <input
                  aria-label="Expense payee"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder="Merchant name"
                  className="field-input"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="field-label">Master Vendor Link (Optional)</span>
                <select
                  aria-label="Master Vendor Link"
                  value={selectedVendorId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedVendorId(id);
                    if (!id) {
                      setVendorResolution((prev) =>
                        prev
                          ? {
                              ...prev,
                              proposedAction: "CREATE_NEW",
                              matchedEntityId: undefined,
                              matchedEntityName: payee || "New Payee",
                            }
                          : null
                      );
                    } else {
                      const v = vendorsList.find((item) => item.id === id);
                      if (v) {
                        setPayee(v.name);
                        setVendorResolution((prev) =>
                          prev
                            ? {
                                ...prev,
                                proposedAction: "LINK_EXISTING",
                                matchedEntityId: v.id,
                                matchedEntityName: v.name,
                                matchedEntityDetails: {
                                  taxId: v.taxId,
                                  email: v.email,
                                  phone: v.phone,
                                  address: v.address,
                                },
                              }
                            : null
                        );
                      }
                    }
                  }}
                  className="field-input"
                >
                  <option value="">-- Free-text Payee (No Master Vendor Link) --</option>
                  {vendorsList.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} {v.taxId ? `(TIN: ${v.taxId})` : ""} {v.email ? `• ${v.email}` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400">
                  Automatic matching does not rewrite the extracted payee. Choosing a Vendor here explicitly may normalize the proposed expense payee; saving never mutates master Vendor records.
                </p>
              </label>

              <label className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="field-label">Payment method</span>
                  <FieldProvenanceBadge provenance={prov.paymentMethod} />
                </div>
                <input
                  aria-label="Payment method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  placeholder="e.g. GCash, Cash, Credit Card"
                  className="field-input"
                />
              </label>

              <label className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="field-label">Receipt / Reference number</span>
                  <FieldProvenanceBadge provenance={prov.referenceNumber} />
                </div>
                <input
                  aria-label="Reference number"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="OR# or Ref#"
                  className="field-input"
                />
              </label>
            </div>
          </fieldset>

          {/* Description & Notes */}
          <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
            <legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-slate-700">
              Description & Notes
            </legend>
            <div className="grid gap-3">
              <label className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="field-label">Description</span>
                  <FieldProvenanceBadge provenance={prov.description} />
                </div>
                <input
                  required
                  aria-label="Expense description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the expense"
                  className="field-input"
                />
              </label>
              <label className="space-y-1">
                <span className="field-label">Notes</span>
                <textarea
                  aria-label="Expense notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="field-input resize-y"
                />
              </label>
            </div>
          </fieldset>

          {/* Form Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
            <p className="text-[10px] text-slate-500">
              Explicit confirmation creates an auditable expense linked to the preserved email source.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={dismiss}
                className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !canManage}
                onClick={() => void handleSubmit("DRAFT")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Save expense draft
              </button>
              <button
                type="button"
                disabled={busy || !canManage}
                onClick={() => void handleSubmit("APPROVED")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Save & Approve
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
};
