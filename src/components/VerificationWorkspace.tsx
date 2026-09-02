import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Keyboard, Loader2, Plus, RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { InvoiceData, InvoiceProjectAllocation, Project, ProjectCostCode, Vendor } from "../types";
import { formatDateTime } from "../config/regional";
import { getInvoiceDisplay } from "../utils/invoiceDisplay";
import { getInvoiceWorkspaceMode } from "../utils/invoiceWorkspace";
import { InvoiceViewer } from "./InvoiceViewer";
import { ReviewPanel } from "./ReviewPanel";
import { SourceComparison } from "./SourceComparison";
import { normalizedInvoiceAllocationAmount } from "../utils/projectCosting";
import { validateInvoiceProjectAllocationSet } from "../utils/projectAllocations";
import { suggestProjectMatches } from "../utils/projectMatching";
import { listCompanyVendors } from "../lib/persistence";
import { formatCostCodeOptionLabel, getSelectableCostCodes } from "../lib/projectCostCodes";

export type SaveState = "saved" | "saving" | "unsaved" | "error";

interface ReviewCompletion {
  verifiedCount: number;
  totalCount: number;
  newItems: number;
}

interface VerificationWorkspaceProps {
  invoice: InvoiceData;
  queue: InvoiceData[];
  queueIndex: number;
  saveState: SaveState;
  completion?: ReviewCompletion | null;
  isRetrying: boolean;
  onRetryExtraction: () => Promise<InvoiceData | null>;
  onUpdateInvoice: (invoice: InvoiceData) => void;
  onBack: () => void | Promise<void>;
  backLabel?: string;
  onPrevious: () => Promise<boolean>;
  onNext: () => Promise<boolean>;
  onSave: () => Promise<boolean>;
  onVerifyAndNext: () => Promise<boolean>;
  onReopen?: () => Promise<void>;
  onContinueWithNewItems?: () => void;
  onReturnToDashboard: () => void;
  onViewVerified: () => void;
  onRevertToAI?: () => void;
  onRevertField?: (path: string) => void;
  projects?: Project[];
  costCodes?: ProjectCostCode[];
  invoiceProjectAllocations?: InvoiceProjectAllocation[];
  onSaveProjectAllocations?: (invoice: InvoiceData, allocations: InvoiceProjectAllocation[]) => Promise<void>;
  preferredProjectId?: string;
  vendors?: Vendor[];
  onOpenExistingInvoice?: (invoiceId: string) => void;
}

interface ProjectAssignmentPanelProps {
  invoice: InvoiceData;
  projects: Project[];
  costCodes?: ProjectCostCode[];
  savedAllocations: InvoiceProjectAllocation[];
  readOnly: boolean;
  preferredProject?: Project;
  onSave: (allocations: InvoiceProjectAllocation[]) => Promise<void>;
}

const ProjectAssignmentPanel: React.FC<ProjectAssignmentPanelProps> = ({ invoice, projects, costCodes = [], savedAllocations, readOnly, preferredProject, onSave }) => {
  const [allocations, setAllocations] = useState<InvoiceProjectAllocation[]>(savedAllocations);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allocationDraftDirty, setAllocationDraftDirty] = useState(false);
  useEffect(() => {
    if (readOnly || !allocationDraftDirty) {
      setAllocations(savedAllocations);
      setError(null);
    }
  }, [invoice.id, savedAllocations, readOnly, allocationDraftDirty]);
  useEffect(() => { setAllocations(savedAllocations); setAllocationDraftDirty(false); setError(null); }, [invoice.id]);
  const suggestions = useMemo(() => { const matches = suggestProjectMatches(invoice, projects); if (matches.length || !preferredProject) return matches; return [{ project: preferredProject, score: 100, matchedFields: ["code" as const], confidence: "EXACT" as const, reasons: ["project context"] }]; }, [invoice, projects, preferredProject]);
  const addAllocation = (projectId?: string) => { setAllocationDraftDirty(true); setAllocations((current) => { const allocated = current.reduce((sum, allocation) => sum + normalizedInvoiceAllocationAmount(invoice.grandTotal, allocation), 0); const remaining = Math.max(0, Math.round((invoice.grandTotal - allocated) * 100) / 100); return [...current, { id: `local-${Date.now()}-${current.length}`, invoiceId: invoice.id, projectId: projectId || projects.find((project) => project.status !== "ARCHIVED")?.id || "", projectCostCodeId: undefined, allocationType: "AMOUNT", allocationAmount: remaining }]; }); };
  const updateAllocation = (id: string, patch: Partial<InvoiceProjectAllocation>) => { setAllocationDraftDirty(true); setAllocations((current) => current.map((allocation) => allocation.id === id ? { ...allocation, ...patch } : allocation)); };
  const save = async () => { const validation = validateInvoiceProjectAllocationSet(invoice.grandTotal, allocations); if (!allocations.every((allocation) => allocation.projectId)) { setError("Choose a project for each allocation."); return; } if (allocations.some((allocation) => projects.find((project) => project.id === allocation.projectId)?.status === "ARCHIVED")) { setError("Archived projects cannot receive new allocations."); return; } if (!validation.valid) { setError(validation.message || "Allocation exceeds invoice total."); return; } setSaving(true); setError(null); try { await onSave(allocations); setAllocationDraftDirty(false); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Could not save allocation."); } finally { setSaving(false); } };
  const allocatedTotal = allocations.reduce((sum, allocation) => sum + normalizedInvoiceAllocationAmount(invoice.grandTotal, allocation), 0);
  return <section className="min-w-0 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-700">Project allocation</p><p className="mt-1 break-words text-[10px] text-indigo-900">Project links are human-confirmed. The extracted project reference remains text only until assigned. Invoice details stay read-only after verification; allocation can be updated separately.</p></div>{!readOnly && <button type="button" onClick={() => addAllocation()} disabled={!projects.some((project) => project.status !== "ARCHIVED")} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"><Plus className="h-3 w-3" /> Add allocation</button>}</div>{suggestions.length > 0 && allocations.length === 0 && <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2"><div className="min-w-0"><p className="text-[10px] font-bold text-slate-600">Suggested project</p><p className="break-words text-xs font-black text-slate-900">{suggestions[0].project.projectCode} — {suggestions[0].project.projectName}</p><p className="break-words text-[9px] text-slate-500">Matched by {suggestions[0].reasons.join(", ")}</p></div>{!readOnly && <button type="button" onClick={() => addAllocation(suggestions[0].project.id)} className="shrink-0 rounded-lg bg-indigo-100 px-2.5 py-1.5 text-[10px] font-black text-indigo-800">Use suggestion</button>}</div>}{allocations.length > 0 ? <div className="mt-3 space-y-2">{allocations.map((allocation, index) => { const selectableCodes = getSelectableCostCodes(costCodes, allocation.projectId, allocation.projectCostCodeId); return <div key={allocation.id} className="grid min-w-0 gap-2 rounded-xl border border-indigo-100 bg-white p-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_110px_34px]"><select aria-label={`Allocation ${index + 1} project`} disabled={readOnly} value={allocation.projectId} onChange={(event) => { const nextProjectId = event.target.value; const currentCode = costCodes.find((cc) => cc.id === allocation.projectCostCodeId); const nextCostCodeId = currentCode && currentCode.projectId === nextProjectId ? allocation.projectCostCodeId : undefined; updateAllocation(allocation.id, { projectId: nextProjectId, projectCostCodeId: nextCostCodeId }); }} className="min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-semibold"><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} — {project.projectName}{project.status === "ARCHIVED" ? " (archived)" : ""}</option>)}</select><select aria-label={`Allocation ${index + 1} cost code`} disabled={readOnly || !allocation.projectId} value={allocation.projectCostCodeId || ""} onChange={(event) => updateAllocation(allocation.id, { projectCostCodeId: event.target.value || undefined })} className="min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px]"><option value="">{allocation.projectId ? "Uncoded" : "Select project first"}</option>{selectableCodes.map((cc) => <option key={cc.id} value={cc.id}>{formatCostCodeOptionLabel(cc)}</option>)}</select><div className="flex min-w-0 items-center gap-1"><input aria-label={`Allocation ${index + 1} value`} disabled={readOnly} type="number" min="0" step="0.01" value={allocation.allocationType === "PERCENTAGE" ? allocation.allocationPercentage || 0 : allocation.allocationAmount} onChange={(event) => updateAllocation(allocation.id, allocation.allocationType === "PERCENTAGE" ? { allocationPercentage: Number(event.target.value) } : { allocationAmount: Number(event.target.value) })} className="min-w-0 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-right text-[10px] tabular-nums" /><select aria-label={`Allocation ${index + 1} type`} disabled={readOnly} value={allocation.allocationType} onChange={(event) => updateAllocation(allocation.id, { allocationType: event.target.value as InvoiceProjectAllocation["allocationType"], allocationAmount: event.target.value === "PERCENTAGE" ? normalizedInvoiceAllocationAmount(invoice.grandTotal, { ...allocation, allocationType: "PERCENTAGE" }) : allocation.allocationAmount })} className="w-16 shrink-0 rounded-lg border border-slate-200 px-1 py-1.5 text-[10px]"><option value="AMOUNT">Amount</option><option value="PERCENTAGE">%</option></select></div>{!readOnly && <button type="button" onClick={() => { setAllocationDraftDirty(true); setAllocations((current) => current.filter((item) => item.id !== allocation.id)); }} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove allocation ${index + 1}`}><Trash2 className="h-3.5 w-3.5" /></button>}</div>; })}</div> : <p className="mt-3 break-words rounded-xl border border-dashed border-indigo-200 bg-white/70 px-3 py-3 text-[10px] text-slate-600">Unallocated — this invoice does not affect project actual cost until a project is confirmed.</p>}<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px]"><span className="break-words font-semibold text-slate-600">Allocated {invoice.currency || ""} {allocatedTotal.toFixed(2)} / {invoice.grandTotal.toFixed(2)}</span>{!readOnly && <button type="button" onClick={() => void save()} disabled={saving} className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 font-black text-white disabled:opacity-50">{saving ? "Saving…" : "Save allocation"}</button>}</div>{error && <p role="alert" className="mt-2 break-words text-[10px] font-bold text-rose-700">{error}</p>}</section>;
};

function saveLabel(state: SaveState) {
  if (state === "saving") return "Saving…";
  if (state === "unsaved") return "Unsaved changes";
  if (state === "error") return "Save failed";
  return "Saved";
}

export const VerificationWorkspace: React.FC<VerificationWorkspaceProps> = ({
  invoice,
  queue,
  queueIndex,
  saveState,
  completion,
  isRetrying,
  onRetryExtraction,
  onUpdateInvoice,
  onBack,
  backLabel = "Invoices",
  onPrevious,
  onNext,
  onSave,
  onVerifyAndNext,
  onReopen,
  onContinueWithNewItems,
  onReturnToDashboard,
  onViewVerified,
  onRevertToAI,
  onRevertField,
  projects = [],
  costCodes = [],
  invoiceProjectAllocations = [],
  onSaveProjectAllocations,
  preferredProjectId,
  vendors,
  onOpenExistingInvoice,
}) => {
  const [loadedVendors, setLoadedVendors] = useState<Vendor[]>(vendors || []);
  const [mobilePane, setMobilePane] = useState<"details" | "source">("details");
  const [warningConfirmation, setWarningConfirmation] = useState(false);
  const [retryConfirmation, setRetryConfirmation] = useState(false);
  const [focusFieldPath, setFocusFieldPath] = useState<string>();
  const [focusFieldToken, setFocusFieldToken] = useState(0);

  useEffect(() => {
    if (vendors && vendors.length > 0) {
      setLoadedVendors(vendors);
    } else {
      listCompanyVendors().then(setLoadedVendors).catch(() => {});
    }
  }, [vendors]);
  const isVoided = invoice.lifecycleStatus === "VOID";
  const isVerified = getInvoiceWorkspaceMode(invoice) === "verified";
  // A voided invoice is a preserved, read-only financial history record even
  // when its review state predates the void correction.
  const needsReview = !isVerified && !isVoided;
  const inReviewSession = queue.length > 0 && queueIndex >= 0;
  const display = useMemo(() => getInvoiceDisplay(invoice), [invoice]);
  const issueCount = invoice.validation?.issues?.length || 0;
  const quality = invoice.extractionQuality;
  const extractionIncomplete = Boolean(quality?.requiresRetry || quality?.status === "NEEDS_REVIEW" || (!quality && ((!invoice.currency && invoice.grandTotal > 0) || (invoice.items.length === 0 && (invoice.subtotal > 0 || invoice.grandTotal > 0)))));
  const humanEdits = useMemo(() => {
    if (!invoice.aiSnapshot) return false;
    const paths = ["invoiceNumber", "invoiceDate", "dueDate", "purchaseOrderNumber", "projectReference", "currency", "vendor", "customer", "items", "subtotal", "totalTax", "grandTotal", "balanceDue", "philippineTaxDetails"];
    return paths.some((path) => JSON.stringify(path.split(".").reduce((value: any, key) => value?.[key], invoice.aiSnapshot) ?? null) !== JSON.stringify(path.split(".").reduce((value: any, key) => value?.[key], invoice) ?? null));
  }, [invoice]);
  const verifiedCount = useMemo(() => queue.filter((item) => item.reviewStatus === "VERIFIED").length, [queue]);
  const remainingCount = useMemo(() => queue.filter((item) => item.reviewStatus === "NEEDS_REVIEW").length, [queue]);
  const positionLabel = inReviewSession ? `${Math.min(queueIndex + 1, queue.length)} / ${queue.length}` : "Standalone";

  const handleInvoiceUpdate = (updated: InvoiceData) => {
    const resolutionChanged = JSON.stringify(updated.entityResolution ?? null) !== JSON.stringify(invoice.entityResolution ?? null);
    const vendorChanged = JSON.stringify(updated.vendor ?? null) !== JSON.stringify(invoice.vendor ?? null);
    // Linking a master Vendor is a relationship decision, not an edit to what
    // the invoice document actually said. Preserve extracted/manual Vendor
    // fields when a resolution control tries to change both at once.
    if (resolutionChanged && vendorChanged) {
      onUpdateInvoice({ ...updated, vendor: invoice.vendor });
      return;
    }
    onUpdateInvoice(updated);
  };

  const focusField = (path: string) => {
    setFocusFieldPath(path);
    setFocusFieldToken((token) => token + 1);
    setMobilePane("details");
  };

  const verifyAndNext = async () => {
    if (!needsReview) return;
    if (issueCount > 0 && !warningConfirmation) {
      setWarningConfirmation(true);
      return;
    }
    const completed = await onVerifyAndNext();
    if (completed) setWarningConfirmation(false);
  };

  const requestRetry = () => {
    if (!needsReview || isRetrying) return;
    if (humanEdits) setRetryConfirmation(true);
    else void onRetryExtraction();
  };

  useEffect(() => {
    setWarningConfirmation(false);
    setRetryConfirmation(false);
    setFocusFieldPath(undefined);
    setMobilePane("details");
  }, [invoice.id, invoice.reviewStatus, invoice.lifecycleStatus]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (typing) return;
      if (event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (inReviewSession) void onNext();
      } else if (event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        if (inReviewSession) void onPrevious();
      } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && needsReview) {
        event.preventDefault();
        void verifyAndNext();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [inReviewSession, needsReview, onNext, onPrevious, verifyAndNext]);

  if (completion) {
    return <div className="space-y-4"><div className="flex items-center justify-between gap-3"><button type="button" onClick={() => void onBack()} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"><ArrowLeft className="w-4 h-4" />{backLabel}</button><span className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Verification session complete</span></div><div className="min-h-[440px] rounded-2xl border border-emerald-200 bg-emerald-50 p-8 flex items-center justify-center"><div className="max-w-md text-center"><div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center"><CheckCircle2 className="w-7 h-7" /></div><h1 className="mt-4 text-2xl font-black text-emerald-950">Review complete</h1><p className="mt-2 text-sm text-emerald-900">{completion.verifiedCount} of {completion.totalCount} invoices verified. The review queue is clear for this session.</p>{completion.newItems > 0 && <p className="mt-2 text-xs text-emerald-800">{completion.newItems} new review item{completion.newItems === 1 ? "" : "s"} appeared while you were working.</p>}<div className="mt-6 flex flex-wrap justify-center gap-2">{completion.newItems > 0 && onContinueWithNewItems && <button type="button" onClick={onContinueWithNewItems} className="px-3.5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700">Continue with new items</button>}<button type="button" onClick={onReturnToDashboard} className="px-3.5 py-2.5 rounded-xl bg-white border border-emerald-200 text-emerald-900 text-xs font-bold">Return to Dashboard</button><button type="button" onClick={onViewVerified} className="px-3.5 py-2.5 rounded-xl border border-emerald-300 text-emerald-800 text-xs font-bold">View Verified Invoices</button></div></div></div></div>;
  }

  return <div className="space-y-3" data-tour="review-document">
    <header className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3.5 sm:p-4">
      <div className="flex flex-col xl:flex-row xl:items-center gap-3">
        <button type="button" onClick={() => void onBack()} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 shrink-0">
          <ArrowLeft className="w-4 h-4" />{backLabel}
        </button>
        <div className="hidden xl:block h-7 w-px bg-slate-200" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[9px] font-black uppercase tracking-wider ${isVoided ? "text-slate-600" : isVerified ? "text-emerald-700" : "text-indigo-600"}`}>{isVoided ? "Voided invoice record" : isVerified ? "Invoice workspace" : "Verification workspace"}</span>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{display.sourceLabel}</span>
            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${isVoided ? "bg-slate-200 text-slate-700" : isVerified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{isVoided ? "Voided" : isVerified ? "Verified" : "Needs review"}</span>
          </div>
          <h1 className="text-base font-black font-sans truncate mt-0.5">{display.primaryLabel}</h1>
          <p className="text-[10px] text-slate-600 font-sans tabular-nums mt-0.5">{display.invoiceLabel} • {display.dateLabel}</p>
          <p className="text-[10px] text-slate-500 font-sans tabular-nums mt-0.5">{display.amountLabel} • {display.lineItemLabel}</p>
          {display.projectKnown && <p className="text-[10px] text-indigo-700 mt-0.5 truncate">Project / reference: {display.projectLabel}</p>}
          {isVerified && <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">Verified {formatDateTime(invoice.verifiedAt)}</p>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 shrink-0">
          {inReviewSession ? <><div className="text-right"><p className="text-[9px] uppercase font-black text-slate-400">Queue position</p><p className="text-sm font-black font-mono">{positionLabel}</p></div><div className="hidden sm:block h-7 w-px bg-slate-200" /><div className="text-right"><p className="text-[9px] uppercase font-black text-slate-400">Progress</p><p className="text-xs font-black text-emerald-700">{verifiedCount} verified <span className="text-slate-400">•</span> {remainingCount} remaining</p></div></> : <div className="text-right"><p className="text-[9px] uppercase font-black text-slate-400">View</p><p className="text-xs font-black text-slate-600">Standalone</p></div>}
          {needsReview ? <div role="status" aria-live="polite" className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[10px] font-bold ${saveState === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : saveState === "unsaved" ? "border-amber-200 bg-amber-50 text-amber-800" : saveState === "saving" ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{saveState === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}{saveLabel(saveState)}</div> : <div className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[10px] font-black ${isVoided ? "border-slate-200 bg-slate-100 text-slate-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}><ShieldCheck className="w-3.5 h-3.5" />{isVoided ? "Read-only void" : "Verified"}</div>}
        </div>
      </div>
    </header>

    {needsReview && <>
      <div className={`rounded-2xl border px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${extractionIncomplete ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
        <div className="flex gap-2.5 min-w-0"><AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${extractionIncomplete ? "text-amber-700" : "text-slate-400"}`} /><div className="min-w-0"><p className={`text-xs font-black ${extractionIncomplete ? "text-amber-950" : "text-slate-800"}`}>{extractionIncomplete ? "Extraction incomplete" : "Extraction quality checked — human review required"}</p><p className="text-[10px] text-slate-600 mt-0.5">{extractionIncomplete ? (quality?.reasons?.slice(0, 2).join(" ") || "Critical fields still need review.") : "Retry is available if you want to re-read the original document."}</p></div></div>
        <button type="button" onClick={requestRetry} disabled={isRetrying} className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-black text-indigo-800 hover:bg-indigo-50 disabled:opacity-60"><RotateCcw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />{isRetrying ? "Retrying…" : "Retry extraction"}</button>
      </div>
      {retryConfirmation && <div className="rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-[10px] text-sky-950"><p className="font-black">You have edited this extracted draft.</p><p className="mt-1">Retrying extraction may replace the current extracted draft. Your previous extraction and review history will remain preserved.</p><div className="mt-2 flex items-center gap-2"><button type="button" onClick={() => setRetryConfirmation(false)} className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 font-bold text-sky-800">Keep current draft</button><button type="button" onClick={() => { setRetryConfirmation(false); void onRetryExtraction(); }} disabled={isRetrying} className="rounded-lg bg-indigo-700 px-2.5 py-1.5 font-bold text-white disabled:opacity-60">Retry and replace draft</button></div></div>}
    </>}

    <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 lg:hidden"><button type="button" aria-pressed={mobilePane === "details"} onClick={() => setMobilePane("details")} className={`rounded-lg px-3 py-2 text-xs font-black ${mobilePane === "details" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Details</button><button type="button" aria-pressed={mobilePane === "source"} onClick={() => setMobilePane("source")} className={`rounded-lg px-3 py-2 text-xs font-black ${mobilePane === "source" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Source</button></div>

    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] items-stretch lg:h-[calc(100vh-225px)] lg:min-h-[580px]">
      <aside className={`${mobilePane === "source" ? "block" : "hidden"} lg:block min-w-0 min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden`}><SourceComparison invoice={invoice} mode="source" /></aside>
      <section className={`${mobilePane === "details" ? "block" : "hidden"} lg:block min-w-0 min-h-0 overflow-y-auto pr-0.5 pb-24`}>
        <div className="space-y-3">
          {onSaveProjectAllocations && (
            <ProjectAssignmentPanel
              invoice={invoice}
              projects={projects}
              costCodes={costCodes}
              preferredProject={projects.find((project) => project.id === preferredProjectId)}
              savedAllocations={invoiceProjectAllocations.filter((allocation) => allocation.invoiceId === invoice.id)}
              readOnly={invoice.lifecycleStatus === "VOID"}
              onSave={(allocations) => onSaveProjectAllocations(invoice, allocations)}
            />
          )}
          <ReviewPanel
            invoice={invoice}
            onVerify={needsReview ? () => void verifyAndNext() : undefined}
            verifyLabel={inReviewSession ? "Verify & Next" : "Verify"}
            onReopen={isVerified && invoice.lifecycleStatus !== "VOID" ? onReopen : undefined}
            onRevertToAI={needsReview ? onRevertToAI : undefined}
            onFocusField={focusField}
            onRevertField={needsReview ? onRevertField : undefined}
            vendors={loadedVendors}
            onUpdateInvoice={handleInvoiceUpdate}
            onOpenExistingInvoice={onOpenExistingInvoice}
          />
          <InvoiceViewer
            invoice={invoice}
            readOnly={isVerified || invoice.lifecycleStatus === "VOID"}
            compact
            focusFieldPath={focusFieldPath}
            focusFieldToken={focusFieldToken}
            onUpdateInvoice={handleInvoiceUpdate}
            onBack={onBack}
            vendors={loadedVendors}
          />
        </div>
      </section>
    </div>

    {inReviewSession && <div className="sticky bottom-2 z-20 rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur p-2.5"><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => void onPrevious()} disabled={queueIndex <= 0} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40"><ChevronLeft className="w-4 h-4" />Previous <span className="hidden sm:inline text-[9px] font-normal text-slate-400">Alt+P</span></button><span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-black text-slate-500 px-1"><Clock3 className="w-3.5 h-3.5" />{positionLabel}</span><button type="button" onClick={() => void onNext()} disabled={queueIndex >= queue.length - 1} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40">Next <span className="hidden sm:inline text-[9px] font-normal text-slate-400">Alt+N</span><ChevronRight className="w-4 h-4" /></button>{needsReview ? <><button type="button" onClick={() => void onSave()} disabled={saveState === "saving"} className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800 disabled:opacity-50"><Save className="w-3.5 h-3.5" />Save</button><div className="hidden md:flex items-center gap-1 text-[9px] text-slate-400"><Keyboard className="w-3.5 h-3.5" />Ctrl/Cmd+Enter</div><button type="button" onClick={() => void verifyAndNext()} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-800"><ShieldCheck className="w-4 h-4" />Verify &amp; Next <ArrowRight className="w-3.5 h-3.5" /></button></> : <div className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black text-emerald-700"><ShieldCheck className="w-3.5 h-3.5" />Read-only verified · Reopen above</div>}</div>{needsReview && warningConfirmation && <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[10px] text-amber-900"><span><strong>{issueCount} validation warning{issueCount === 1 ? "" : "s"} remain.</strong> Verify this invoice anyway?</span><div className="flex items-center gap-2"><button type="button" onClick={() => setWarningConfirmation(false)} className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 font-bold text-amber-800">Cancel</button><button type="button" onClick={() => void verifyAndNext()} className="rounded-lg bg-amber-700 px-2.5 py-1.5 font-bold text-white">Verify &amp; Continue</button></div></div>}</div>}
  </div>;
};