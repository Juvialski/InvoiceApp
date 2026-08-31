import React, { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, LockKeyhole, X } from "lucide-react";
import type { EngineeringLifecycleAction, EngineeringLifecyclePreview } from "../../lib/engineeringLifecycle.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";

export interface EngineeringLifecycleDialogAction {
  action: EngineeringLifecycleAction;
  label: string;
  description: string;
  requiresReason?: boolean;
  requiresText?: boolean;
  tone?: "danger" | "warning" | "primary";
}

interface EngineeringLifecycleDialogProps {
  entityLabel: string;
  recordLabel: string;
  preview: EngineeringLifecyclePreview;
  actions: readonly EngineeringLifecycleDialogAction[];
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onApply: (action: EngineeringLifecycleAction, reason?: string, correctionText?: string) => void;
}

function available(preview: EngineeringLifecyclePreview, action: EngineeringLifecycleAction): boolean {
  if (action === "DELETE_UNUSED") return preview.canDelete;
  if (action === "ARCHIVE") return preview.canArchive;
  if (action === "SUPERSEDE") return preview.canSupersede;
  if (action === "VOID") return preview.canVoid;
  if (action === "ADDENDUM") return preview.canAddendum;
  return false;
}

function readable(value: string) {
  return value.replaceAll("_", " ");
}

export function EngineeringLifecycleDialog({ entityLabel, recordLabel, preview, actions, busy = false, error, onClose, onApply }: EngineeringLifecycleDialogProps) {
  const [reason, setReason] = useState("");
  const [correctionText, setCorrectionText] = useState("");
  const [selectedAction, setSelectedAction] = useState<EngineeringLifecycleAction | null>(null);
  const selected = useMemo(() => actions.find((item) => item.action === selectedAction) || null, [actions, selectedAction]);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus({ open: true, onClose: () => { if (!busy) onClose(); }, initialFocusRef: closeButtonRef });

  const choose = (action: EngineeringLifecycleDialogAction) => {
    if (!available(preview, action.action)) return;
    setSelectedAction(action.action);
    setReason("");
    setCorrectionText("");
  };

  const confirm = () => {
    if (!selected || !available(preview, selected.action)) return;
    if (selected.requiresReason && reason.trim().length < 3) return;
    if (selected.requiresText && !correctionText.trim()) return;
    const consequence = selected.action === "DELETE_UNUSED"
      ? `Permanently delete this unused ${entityLabel}? This cannot be undone.`
      : selected.action === "ADDENDUM"
        ? `Add an append-only correction to ${recordLabel}? The finalized original will remain unchanged.`
        : `${selected.label} ${recordLabel}? Historical records and immutable references will remain preserved.`;
    if (typeof window !== "undefined" && !window.confirm(consequence)) return;
    onApply(selected.action, reason.trim() || undefined, correctionText.trim() || undefined);
  };

  return (
    <div ref={dialogRef} className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="engineering-lifecycle-dialog-title" aria-describedby="engineering-lifecycle-dialog-description" aria-busy={busy}>
      <div className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">Lifecycle review</p><h2 id="engineering-lifecycle-dialog-title" className="mt-1 break-words text-base font-black text-slate-950">{recordLabel}</h2><p id="engineering-lifecycle-dialog-description" className="mt-1 text-xs text-slate-500">Current state: <span className="font-black text-slate-700">{readable(preview.status)}</span>. Choose an available history-preserving action to continue.</p></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} disabled={busy} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Close lifecycle review"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3" role="status" aria-live="polite">
          <div className="flex items-start gap-2"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /><div><p className="text-xs font-black text-slate-800">Guarded history check</p><p className="mt-1 text-xs leading-5 text-slate-600">{preview.totalDependencyCount === 0 ? "No blocking dependencies were found for the selected lifecycle check." : `${preview.totalDependencyCount} blocking historical or lifecycle dependenc${preview.totalDependencyCount === 1 ? "y was" : "ies were"} found.`}</p></div></div>
          {Object.entries(preview.dependencies).some(([key, count]) => count > 0 && !(preview.entityType === "SUBMITTAL" && key === "rounds")) && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 sm:grid-cols-3">{Object.entries(preview.dependencies).filter(([key, count]) => count > 0 && !(preview.entityType === "SUBMITTAL" && key === "rounds")).map(([key, count]) => <div key={key} className="rounded-lg bg-white px-2.5 py-2"><p className="text-[10px] font-bold capitalize text-slate-400">{readable(key)}</p><p className="mt-0.5 text-sm font-black text-slate-800">{count}</p></div>)}</div>}
        </div>

        {preview.blockedReason && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p>{preview.blockedReason}</p></div>}
        {preview.source === "demo" && <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-[10px] font-bold leading-4 text-indigo-900">Demo-only lifecycle: this action changes isolated browser fixtures and never calls production Supabase or Storage.</p>}
        {error && <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900">{error}</div>}

        <div className="mt-4 space-y-2">{actions.map((action) => {
          const isAvailable = available(preview, action.action);
          const active = selectedAction === action.action;
          const tone = action.tone === "danger" ? "border-rose-200 text-rose-800" : action.tone === "warning" ? "border-amber-200 text-amber-900" : "border-indigo-200 text-indigo-800";
          return <button key={action.action} type="button" disabled={!isAvailable || busy} aria-pressed={active} onClick={() => choose(action)} className={`flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left transition ${isAvailable ? `${tone} hover:bg-slate-50` : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"} ${active ? "ring-2 ring-indigo-200" : ""}`}><span><span className="block text-xs font-black">{action.label}{!isAvailable && " · unavailable"}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{action.description}</span></span>{isAvailable ? <CheckCircle2 aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-indigo-600" : "text-slate-300"}`} /> : <LockKeyhole aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}</button>;
        })}</div>

        {selected && <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
          <p className="text-xs font-black text-slate-900">{selected.label}</p>
          <p className="mt-1 text-[11px] leading-4 text-indigo-900">This is a guarded request. Nothing changes until you confirm and the server rechecks the selected action.</p>
          {selected.requiresReason && <label htmlFor="engineering-lifecycle-reason" className="mt-3 block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Reason required</span><input id="engineering-lifecycle-reason" autoFocus value={reason} onChange={(event) => setReason(event.target.value)} aria-required="true" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="Explain the correction or lifecycle decision" /></label>}
          {selected.requiresText && <label htmlFor="engineering-lifecycle-correction" className="mt-3 block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Correction / addendum</span><textarea id="engineering-lifecycle-correction" value={correctionText} onChange={(event) => setCorrectionText(event.target.value)} aria-required="true" rows={5} className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs leading-5 text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="Record only the correction; the finalized observation is not edited." /></label>}
          <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setSelectedAction(null)} disabled={busy} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white">Back</button><button type="button" onClick={confirm} disabled={busy || (Boolean(selected.requiresReason) && reason.trim().length < 3) || (Boolean(selected.requiresText) && !correctionText.trim())} className={`rounded-lg px-4 py-2 text-xs font-black text-white disabled:opacity-50 ${selected.tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : selected.tone === "warning" ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"}`}>{busy ? "Saving…" : `Confirm ${selected.label}`}</button></div>
        </div>}
        {!selected && <div className="mt-4 flex justify-end"><button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">Close</button></div>}
      </div>
    </div>
  );
}
