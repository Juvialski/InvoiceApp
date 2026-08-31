import React, { useRef } from "react";
import { Archive, Ban, CheckCircle2, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import type { FinancialCorrectionAction, FinancialCorrectionPreview } from "../../lib/financialLifecycle.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";

interface FinancialCorrectionDialogProps {
  entityLabel: "invoice" | "expense";
  recordLabel: string;
  preview: FinancialCorrectionPreview | null;
  loading: boolean;
  error: string;
  reason: string;
  onReasonChange: (reason: string) => void;
  onApply: (action: FinancialCorrectionAction) => void;
  onClose: () => void;
}

function titleCase(value: string) {
  return value.replaceAll(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function actionLabel(action: FinancialCorrectionAction, entityLabel: string) {
  if (action === "DELETE_UNUSED") return `Delete unused ${entityLabel}`;
  if (action === "VOID") return `Void ${entityLabel}`;
  if (action === "ARCHIVE") return `Archive ${entityLabel}`;
  return `Restore ${entityLabel} visibility`;
}

export const FinancialCorrectionDialog: React.FC<FinancialCorrectionDialogProps> = ({ entityLabel, recordLabel, preview, loading, error, reason, onReasonChange, onApply, onClose }) => {
  const displayLabel = entityLabel === "invoice" ? "Invoice" : "Expense";
  const canApply = (action: FinancialCorrectionAction) => action === "DELETE_UNUSED" || reason.trim().length >= 3;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus({ open: true, onClose: () => { if (!loading) onClose(); }, initialFocusRef: closeButtonRef });
  const actionCard = (action: FinancialCorrectionAction, enabled: boolean, tone: "danger" | "warning" | "success", description: string, Icon: React.ElementType) => {
    if (!enabled) return null;
    const tones = {
      danger: "border-rose-200 bg-rose-50 text-rose-950",
      warning: "border-amber-200 bg-amber-50 text-amber-950",
      success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    } as const;
    const buttons = {
      danger: "bg-rose-700 hover:bg-rose-800",
      warning: "bg-amber-700 hover:bg-amber-800",
      success: "bg-emerald-700 hover:bg-emerald-800",
    } as const;
    return <div className={`rounded-xl border p-3 ${tones[tone]}`} key={action}>
      <p className="flex items-center gap-1.5 text-xs font-black"><Icon className="h-4 w-4" />{actionLabel(action, entityLabel)}</p>
      <p className="mt-1 text-[10px] leading-4">{description}</p>
      {action !== "DELETE_UNUSED" && <label className="mt-3 block"><span className="sr-only">Reason for {actionLabel(action, entityLabel).toLowerCase()}</span><textarea value={reason} onChange={(event) => onReasonChange(event.target.value)} maxLength={500} rows={2} placeholder={`Reason for ${actionLabel(action, entityLabel).toLowerCase()}`} className="w-full resize-y rounded-lg border border-current/20 bg-white px-3 py-2 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400" /></label>}
      <button type="button" disabled={loading || !canApply(action)} onClick={() => onApply(action)} className={`mt-3 rounded-lg px-3 py-2 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40 ${buttons[tone]}`}>{loading ? "Working…" : actionLabel(action, entityLabel)}</button>
    </div>;
  };

  return <div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="financial-correction-title" aria-busy={loading}>
    <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">{displayLabel} correction</p><h2 id="financial-correction-title" className="mt-1 break-words text-lg font-black text-slate-950">{recordLabel}</h2><p className="mt-1 text-xs text-slate-500">Review the checked consequence before changing this financial record.</p></div><button ref={closeButtonRef} type="button" onClick={onClose} disabled={loading} className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Close ${entityLabel} correction dialog`}>×</button></div>
      {loading && !preview && <p role="status" className="mt-5 rounded-xl bg-slate-50 p-4 text-xs font-semibold text-slate-600">Checking {entityLabel} dependencies and settlement evidence…</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">{error}</p>}
      {preview && <div className="mt-5 space-y-4">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-950"><p className="font-black">{preview.source === "database" ? "Authoritative database preflight" : "Local workspace preflight"}</p><p className="mt-1">Current state: <strong>{preview.lifecycleStatus.replaceAll("_", " ")}</strong>{preview.reviewStatus ? ` · review ${preview.reviewStatus.replaceAll("_", " ")}` : ""}{preview.paymentStatus ? ` · payment ${preview.paymentStatus.replaceAll("_", " ")}` : ""}.</p><p className="mt-1">{preview.totalDependencyCount ? `${preview.totalDependencyCount} dependent or auditable record${preview.totalDependencyCount === 1 ? "" : "s"} preserve this ${entityLabel}.` : "No dependent or auditable history was found."}</p>{preview.source !== "database" && <p className="mt-1 text-[10px] text-indigo-800">Permanent deletion remains unavailable without an authoritative database preflight.</p>}<div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold">{preview.canDelete ? "Delete eligible" : "Delete guarded"}</span><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold">{preview.canVoid ? "Void available" : "Void blocked"}</span>{preview.archivedAt && <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold">Archived visibility</span>}{preview.lifecycleStatus === "VOID" && <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold">Financially void</span>}</div>{Object.values(preview.dependencies).some((count) => count > 0) && <ul className="mt-2 grid gap-1 text-[10px] sm:grid-cols-2">{Object.entries(preview.dependencies).filter(([, count]) => count > 0).map(([key, count]) => <li key={key} className="flex justify-between gap-2"><span>{titleCase(key)}</span><strong>{count}</strong></li>)}</ul>}</div>
        {preview.confirmedSettlementCount > 0 && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[10px] leading-4 text-rose-950"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" /><p><strong>Confirmed settlement blocks financial correction.</strong> {preview.blockedReason || "Use the deferred Wave 2B3 settlement correction workflow first. No cash evidence will be changed here."}</p></div>}
        {preview.confirmedSettlementCount === 0 && preview.blockedReason && !preview.canDelete && preview.lifecycleStatus !== "VOID" && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-950"><Ban className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><p>{preview.blockedReason}</p></div>}
        {actionCard("DELETE_UNUSED", preview.canDelete, "danger", `This permanently removes the ${entityLabel}. It is enabled only when the authoritative preflight found no dependent or auditable history.`, Trash2)}
        {actionCard("VOID", preview.canVoid, "warning", `This keeps the ${entityLabel}, original values, and history, but removes it from active ${entityLabel === "invoice" ? "project cost and settlement candidates" : "project cost"}. Confirmed settlement evidence must be corrected first.`, ShieldAlert)}
        {actionCard("ARCHIVE", preview.canArchive, "warning", `This changes visibility only. The ${entityLabel}'s financial status and active cost contribution remain unchanged, and its history is preserved.`, Archive)}
        {actionCard("RESTORE", preview.canRestore, "success", `This restores the ${entityLabel} to the visible directory without changing its financial status. A void record remains void.`, preview.lifecycleStatus === "VOID" ? CheckCircle2 : RotateCcw)}
        {!preview.canDelete && !preview.canVoid && !preview.canArchive && !preview.canRestore && <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] leading-4 text-slate-600">No lifecycle action is available for this record. Its history remains preserved.</p>}
      </div>}
    </section>
  </div>;
};
