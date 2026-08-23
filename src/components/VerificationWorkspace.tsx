import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileText, Keyboard, Loader2, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { InvoiceData } from "../types";
import { formatMoney } from "../config/regional";
import { InvoiceViewer } from "./InvoiceViewer";
import { ReviewPanel } from "./ReviewPanel";
import { SourceComparison } from "./SourceComparison";

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
  onPrevious: () => Promise<boolean>;
  onNext: () => Promise<boolean>;
  onSave: () => Promise<boolean>;
  onVerifyAndNext: () => Promise<boolean>;
  onContinueWithNewItems?: () => void;
  onReturnToDashboard: () => void;
  onViewVerified: () => void;
  onRevertToAI: () => void;
  onRevertField: (path: string) => void;
}

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
  onPrevious,
  onNext,
  onSave,
  onVerifyAndNext,
  onContinueWithNewItems,
  onReturnToDashboard,
  onViewVerified,
  onRevertToAI,
  onRevertField,
}) => {
  const [mobilePane, setMobilePane] = useState<"details" | "source">("details");
  const [warningConfirmation, setWarningConfirmation] = useState(false);
  const [retryConfirmation, setRetryConfirmation] = useState(false);
  const [focusFieldPath, setFocusFieldPath] = useState<string>();
  const [focusFieldToken, setFocusFieldToken] = useState(0);
  const issueCount = invoice.validation?.issues?.length || 0;
  const quality = invoice.extractionQuality;
  const extractionIncomplete = Boolean(quality?.requiresRetry || quality?.status === "NEEDS_REVIEW" || (!quality && ((!invoice.currency && invoice.grandTotal > 0) || (invoice.items.length === 0 && (invoice.subtotal > 0 || invoice.grandTotal > 0)))));
  const humanEdits = useMemo(() => {
    if (!invoice.aiSnapshot) return false;
    const paths = ["invoiceNumber", "invoiceDate", "dueDate", "purchaseOrderNumber", "projectReference", "currency", "vendor", "customer", "items", "subtotal", "totalTax", "grandTotal", "balanceDue", "philippineTaxDetails"];
    return paths.some((path) => JSON.stringify(path.split(".").reduce((value: any, key) => value?.[key], invoice.aiSnapshot) ?? null) !== JSON.stringify(path.split(".").reduce((value: any, key) => value?.[key], invoice) ?? null));
  }, [invoice]);
  const verifiedCount = useMemo(() => queue.filter((item) => item.reviewStatus === "VERIFIED").length, [queue]);
  const remainingCount = Math.max(0, queue.length - verifiedCount);
  const positionLabel = queue.length ? `${Math.min(queueIndex + 1, queue.length)} / ${queue.length}` : "—";

  const focusField = (path: string) => {
    setFocusFieldPath(path);
    setFocusFieldToken((token) => token + 1);
    setMobilePane("details");
  };

  const verifyAndNext = async () => {
    if (issueCount > 0 && !warningConfirmation) {
      setWarningConfirmation(true);
      return;
    }
    const completed = await onVerifyAndNext();
    if (completed) setWarningConfirmation(false);
  };

  const requestRetry = () => {
    if (isRetrying) return;
    if (humanEdits) setRetryConfirmation(true);
    else void onRetryExtraction();
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (typing) return;
      if (event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void onNext();
      } else if (event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        void onPrevious();
      } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void verifyAndNext();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onNext, onPrevious, verifyAndNext]);

  if (completion) {
    return <div className="space-y-4"><div className="flex items-center justify-between gap-3"><button type="button" onClick={() => void onBack()} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"><ArrowLeft className="w-4 h-4" />Review Queue</button><span className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Verification session complete</span></div><div className="min-h-[440px] rounded-2xl border border-emerald-200 bg-emerald-50 p-8 flex items-center justify-center"><div className="max-w-md text-center"><div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center"><CheckCircle2 className="w-7 h-7" /></div><h1 className="mt-4 text-2xl font-black text-emerald-950">Review complete</h1><p className="mt-2 text-sm text-emerald-900">{completion.verifiedCount} of {completion.totalCount} invoices verified. The review queue is clear for this session.</p>{completion.newItems > 0 && <p className="mt-2 text-xs text-emerald-800">{completion.newItems} new review item{completion.newItems === 1 ? "" : "s"} appeared while you were working.</p>}<div className="mt-6 flex flex-wrap justify-center gap-2">{completion.newItems > 0 && onContinueWithNewItems && <button type="button" onClick={onContinueWithNewItems} className="px-3.5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700">Continue with new items</button>}<button type="button" onClick={onReturnToDashboard} className="px-3.5 py-2.5 rounded-xl bg-white border border-emerald-200 text-emerald-900 text-xs font-bold">Return to Dashboard</button><button type="button" onClick={onViewVerified} className="px-3.5 py-2.5 rounded-xl border border-emerald-300 text-emerald-800 text-xs font-bold">View Verified Invoices</button></div></div></div></div>;
  }

  return <div className="space-y-3">
    <header className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3.5 sm:p-4"><div className="flex flex-col xl:flex-row xl:items-center gap-3"><button type="button" onClick={() => void onBack()} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 shrink-0"><ArrowLeft className="w-4 h-4" />Review Queue</button><div className="hidden xl:block h-7 w-px bg-slate-200" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><span className="text-[9px] font-black uppercase tracking-wider text-indigo-600">Verification workspace</span><span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{invoice.sourceType || "UPLOAD"}</span></div><div className="flex items-center gap-2 mt-0.5"><h1 className="text-base font-black font-mono truncate">{invoice.invoiceNumber || invoice.fileName || "Unnumbered invoice"}</h1><span className="text-[10px] text-slate-500 truncate">{invoice.vendor?.registeredName || invoice.vendor?.name || "Unknown vendor"}</span></div><p className="text-[10px] text-slate-500 font-sans tabular-nums mt-0.5">{invoice.currency ? formatMoney(invoice.grandTotal, invoice.currency) : "Currency unclear"} • {invoice.items.length} line item{invoice.items.length === 1 ? "" : "s"}</p></div><div className="flex items-center gap-3 shrink-0"><div className="text-right"><p className="text-[9px] uppercase font-black text-slate-400">Queue position</p><p className="text-sm font-black font-mono">{positionLabel}</p></div><div className="hidden sm:block h-7 w-px bg-slate-200" /><div className="text-right"><p className="text-[9px] uppercase font-black text-slate-400">Progress</p><p className="text-xs font-black text-emerald-700">{verifiedCount} verified <span className="text-slate-400">•</span> {remainingCount} remaining</p></div><div className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[10px] font-bold ${saveState === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : saveState === "unsaved" ? "border-amber-200 bg-amber-50 text-amber-800" : saveState === "saving" ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{saveState === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}{saveLabel(saveState)}</div></div></div></header>

    <div className={`rounded-2xl border px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${extractionIncomplete ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="flex gap-2.5 min-w-0"><AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${extractionIncomplete ? "text-amber-700" : "text-slate-400"}`} /><div className="min-w-0"><p className={`text-xs font-black ${extractionIncomplete ? "text-amber-950" : "text-slate-800"}`}>{extractionIncomplete ? "Extraction incomplete" : "Extraction quality checked — human review required"}</p><p className="text-[10px] text-slate-600 mt-0.5">{extractionIncomplete ? (quality?.reasons?.slice(0, 2).join(" ") || "Critical fields still need review.") : "Retry is available if you want to re-read the original document."}</p></div></div>
      <button type="button" onClick={requestRetry} disabled={isRetrying} className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-black text-indigo-800 hover:bg-indigo-50 disabled:opacity-60"><RotateCcw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />{isRetrying ? "Retrying…" : "Retry extraction"}</button>
    </div>
    {retryConfirmation && <div className="rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-[10px] text-sky-950"><p className="font-black">You have edited this extracted draft.</p><p className="mt-1">Retrying extraction may replace the current extracted draft. Your previous extraction and review history will remain preserved.</p><div className="mt-2 flex items-center gap-2"><button type="button" onClick={() => setRetryConfirmation(false)} className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 font-bold text-sky-800">Keep current draft</button><button type="button" onClick={() => { setRetryConfirmation(false); void onRetryExtraction(); }} disabled={isRetrying} className="rounded-lg bg-indigo-700 px-2.5 py-1.5 font-bold text-white disabled:opacity-60">Retry and replace draft</button></div></div>}

    <div className="lg:hidden grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1"><button type="button" onClick={() => setMobilePane("details")} className={`rounded-lg px-3 py-2 text-xs font-black ${mobilePane === "details" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Details</button><button type="button" onClick={() => setMobilePane("source")} className={`rounded-lg px-3 py-2 text-xs font-black ${mobilePane === "source" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Source</button></div>

    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] items-stretch lg:h-[calc(100vh-225px)] lg:min-h-[580px]">
      <aside className={`${mobilePane === "source" ? "block" : "hidden"} lg:block min-w-0 min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden`}><SourceComparison invoice={invoice} mode="source" /></aside>
      <section className={`${mobilePane === "details" ? "block" : "hidden"} lg:block min-w-0 min-h-0 overflow-y-auto pr-0.5 pb-24`}><div className="space-y-3"><ReviewPanel invoice={invoice} onVerify={() => void verifyAndNext()} verifyLabel="Verify & Next" onReopen={undefined} onRevertToAI={onRevertToAI} onFocusField={focusField} onRevertField={onRevertField} /><InvoiceViewer invoice={invoice} compact focusFieldPath={focusFieldPath} focusFieldToken={focusFieldToken} onUpdateInvoice={onUpdateInvoice} onBack={onBack} /></div></section>
    </div>

    <div className="sticky bottom-2 z-20 rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur p-2.5"><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => void onPrevious()} disabled={queueIndex <= 0} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40"><ChevronLeft className="w-4 h-4" />Previous <span className="hidden sm:inline text-[9px] font-normal text-slate-400">Alt+P</span></button><span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-black text-slate-500 px-1"><Clock3 className="w-3.5 h-3.5" />{positionLabel}</span><button type="button" onClick={() => void onNext()} disabled={queueIndex >= queue.length - 1} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40">Next <span className="hidden sm:inline text-[9px] font-normal text-slate-400">Alt+N</span><ChevronRight className="w-4 h-4" /></button><button type="button" onClick={() => void onSave()} disabled={saveState === "saving"} className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800 disabled:opacity-50"><Save className="w-3.5 h-3.5" />Save</button><div className="hidden md:flex items-center gap-1 text-[9px] text-slate-400"><Keyboard className="w-3.5 h-3.5" />Ctrl/Cmd+Enter</div><button type="button" onClick={() => void verifyAndNext()} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-800"><ShieldCheck className="w-4 h-4" />Verify &amp; Next <ArrowRight className="w-3.5 h-3.5" /></button></div>{warningConfirmation && <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[10px] text-amber-900"><span><strong>{issueCount} validation warning{issueCount === 1 ? "" : "s"} remain.</strong> Verify this invoice anyway?</span><div className="flex items-center gap-2"><button type="button" onClick={() => setWarningConfirmation(false)} className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 font-bold text-amber-800">Cancel</button><button type="button" onClick={() => void verifyAndNext()} className="rounded-lg bg-amber-700 px-2.5 py-1.5 font-bold text-white">Verify &amp; Continue</button></div></div>}</div>
  </div>;
};
