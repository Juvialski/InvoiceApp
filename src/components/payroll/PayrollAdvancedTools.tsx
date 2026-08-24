import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, Wrench, X } from "lucide-react";
import type { PayrollAdjustment, PayrollEntry, PayrollPeriod, PayrollProjectAllocation, PayrollRun, WorkEntry } from "../../types";
import type { PayrollImportBatch } from "../../lib/payrollImportPersistence";
import type { PayrollSchedule } from "../../lib/payrollSchedule";
import { inspectPayrollIntegrity, isPayrollPeriodDataBearing, isSafeToDeletePayrollPeriod, isSafeToDeletePayrollRun } from "../../lib/payrollIntegrity";
import type { PayrollMaintenanceAction, PayrollMaintenancePreview } from "../../lib/payrollMaintenance";
import { PAYROLL_MAINTENANCE_ACTIONS, RESET_UNAPPROVED_CONFIRMATION } from "../../lib/payrollMaintenance";

interface PayrollAdvancedToolsProps {
  schedules: readonly PayrollSchedule[];
  periods: readonly PayrollPeriod[];
  runs: readonly PayrollRun[];
  entries: readonly PayrollEntry[];
  allocations: readonly PayrollProjectAllocation[];
  adjustments?: readonly PayrollAdjustment[];
  workEntries: readonly WorkEntry[];
  importBatches: readonly PayrollImportBatch[];
  canManageMaintenance?: boolean;
  onPreview?: (action: PayrollMaintenanceAction) => Promise<PayrollMaintenancePreview>;
  onApply?: (action: PayrollMaintenanceAction, confirmation?: string) => Promise<unknown>;
}

interface ActionConfiguration { title: string; buttonLabel: string; buttonClass: string; description: string; }

const ACTION_CONFIGURATION: Record<PayrollMaintenanceAction, ActionConfiguration> = Object.freeze({
  REPAIR: { title: "Repair payroll data", buttonLabel: "Apply safe repair", buttonClass: "bg-indigo-600", description: "Fixes harmless generated-calendar inconsistencies without changing meaningful payroll history." },
  REBUILD_CALENDAR: { title: "Rebuild payroll calendar", buttonLabel: "Rebuild calendar", buttonClass: "bg-indigo-600", description: "Replaces disposable calendar infrastructure while preserving the active schedule and meaningful history." },
  RESET_UNAPPROVED: { title: "Reset unapproved payroll", buttonLabel: "Reset unapproved payroll", buttonClass: "bg-rose-700", description: "Clears unapproved derived payroll results, reopens affected imports, and rebuilds the canonical calendar." },
});

function plural(count: number, singular: string, pluralLabel = `${singular}s`) { return `${count} ${count === 1 ? singular : pluralLabel}`; }
function plainError(error: unknown, phase: "preview" | "apply") {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message || "");
  if (/permission|authorized|company|membership|suspended|revoked/i.test(message)) return "You do not have permission to manage payroll maintenance in this company.";
  if (/confirm|RESET UNAPPROVED PAYROLL/i.test(message)) return `Type ${RESET_UNAPPROVED_CONFIRMATION} exactly to continue.`;
  return phase === "preview" ? "The current payroll maintenance plan could not be loaded. Nothing was changed." : "Payroll maintenance could not be completed. The operation was rolled back and no success was recorded.";
}

export const PayrollAdvancedTools: React.FC<PayrollAdvancedToolsProps> = ({ schedules, periods, runs, entries, allocations, adjustments = [], workEntries, importBatches, canManageMaintenance = true, onPreview, onApply }) => {
  const [actionMode, setActionMode] = useState<PayrollMaintenanceAction | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [preview, setPreview] = useState<PayrollMaintenancePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const previewRequestRef = useRef(0);
  const context = useMemo(() => ({ runs, entries, workEntries, importBatches, adjustments }), [runs, entries, workEntries, importBatches, adjustments]);
  const report = useMemo(() => inspectPayrollIntegrity(schedules, periods, runs, entries, allocations, context), [schedules, periods, runs, entries, allocations, context]);
  const fixablePeriodCount = useMemo(() => periods.filter((period) => isSafeToDeletePayrollPeriod(period, context)).length, [periods, context]);
  const fixableRunCount = useMemo(() => runs.filter((run) => isSafeToDeletePayrollRun(run, context)).length, [runs, context]);
  const finalizedHistoryCount = useMemo(() => periods.filter((period) => !isSafeToDeletePayrollPeriod(period, context) && (Boolean(period.lockedAt) || ["APPROVED", "PAID"].includes(period.status) || isPayrollPeriodDataBearing(period, context))).length, [periods, context]);
  const retiredLegacyCount = useMemo(() => periods.filter((period) => period.status === "VOID" && !isSafeToDeletePayrollPeriod(period, context)).length, [periods, context]);

  useEffect(() => {
    if (actionMode === null) return undefined;
    const requestId = ++previewRequestRef.current;
    let cancelled = false;
    setPreview(null); setPreviewError(null); setApplyError(null); setPreviewLoading(true);
    const load = onPreview ? onPreview(actionMode) : Promise.reject(new Error("Payroll maintenance preview is unavailable."));
    void load.then((result) => { if (!cancelled && requestId === previewRequestRef.current) setPreview(result); }).catch((error: unknown) => { if (!cancelled && requestId === previewRequestRef.current) setPreviewError(plainError(error, "preview")); }).finally(() => { if (!cancelled && requestId === previewRequestRef.current) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [actionMode]);

  const closeAction = () => { previewRequestRef.current += 1; setActionMode(null); setConfirmText(""); setPreview(null); setPreviewError(null); setApplyError(null); setPreviewLoading(false); };
  const startAction = (action: PayrollMaintenanceAction) => { if (!canManageMaintenance || busy) return; setConfirmText(""); setPreview(null); setPreviewError(null); setApplyError(null); setActionMode(action); };
  const apply = async () => {
    if (busy || !actionMode || !preview || !preview.eligible || preview.noChanges || !onApply) return;
    if (actionMode === "RESET_UNAPPROVED" && confirmText !== RESET_UNAPPROVED_CONFIRMATION) return;
    setBusy(true); setApplyError(null);
    try { await onApply(actionMode, actionMode === "RESET_UNAPPROVED" ? confirmText : undefined); closeAction(); }
    catch (error: unknown) { setApplyError(plainError(error, "apply")); }
    finally { setBusy(false); }
  };
  if (!canManageMaintenance) return null;

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="payroll-advanced-title">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Advanced</p><h3 id="payroll-advanced-title" className="mt-1 text-sm font-black">Payroll data integrity</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Repair harmless calendar inconsistencies, rebuild disposable calendar infrastructure, or deliberately reset unapproved derived payroll. Finalized history is protected.</p></div><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" /></div>
    <div className="mt-4 grid gap-2 text-xs sm:grid-cols-4"><Summary label="Integrity issues" value={String(report.issues.length)} tone={report.issues.length ? "text-amber-800" : "text-emerald-700"} /><Summary label="Fixable records" value={String(fixablePeriodCount + fixableRunCount)} tone="text-indigo-700" /><Summary label="Finalized history" value={String(finalizedHistoryCount)} tone="text-slate-700" /><Summary label="Retired / legacy" value={String(retiredLegacyCount)} tone="text-slate-600" /></div>
    <div className="mt-4 flex flex-wrap gap-2">{PAYROLL_MAINTENANCE_ACTIONS.map((action) => <button key={action} type="button" onClick={() => startAction(action)} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black ${action === "REPAIR" ? "bg-indigo-600 text-white" : action === "REBUILD_CALENDAR" ? "border border-indigo-200 bg-indigo-50 text-indigo-700" : "border border-rose-200 bg-rose-50 text-rose-800"}`}>{action === "REPAIR" ? <Wrench className="h-3.5 w-3.5" /> : action === "RESET_UNAPPROVED" ? <AlertTriangle className="h-3.5 w-3.5" /> : null}{ACTION_CONFIGURATION[action].title}</button>)}</div>
    {report.issues.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><p className="font-black">Integrity review</p><ul className="mt-2 space-y-1">{report.issues.slice(0, 5).map((issue, index) => <li key={`${issue.code}-${index}`}>• {issue.message}</li>)}</ul>{report.issues.length > 5 && <p className="mt-2 text-[10px] text-amber-800">{plural(report.issues.length - 5, "additional issue")} needs review.</p>}</div>}
    {!report.issues.length && <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> No payroll integrity conflicts detected.</p>}
    {actionMode !== null && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="payroll-action-title"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Preview before changes</p><h4 id="payroll-action-title" className="mt-1 text-lg font-black">{ACTION_CONFIGURATION[actionMode].title}</h4></div><button type="button" onClick={closeAction} disabled={busy} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-40" aria-label="Close payroll action preview"><X className="h-4 w-4" /></button></div><p className="mt-2 text-xs text-slate-600">{ACTION_CONFIGURATION[actionMode].description}</p>
      {previewLoading && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">Loading the current payroll plan…</p>}
      {previewError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{previewError}</p>}
      {!previewLoading && !previewError && preview && <ActionPreview action={actionMode} preview={preview} confirmText={confirmText} onConfirmTextChange={setConfirmText} />}
      {applyError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{applyError}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={closeAction} disabled={busy} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-40">Cancel</button><button type="button" onClick={() => void apply()} disabled={busy || previewLoading || !preview || !preview.eligible || preview.noChanges || (actionMode === "RESET_UNAPPROVED" && confirmText !== RESET_UNAPPROVED_CONFIRMATION)} className={`rounded-xl px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40 ${ACTION_CONFIGURATION[actionMode].buttonClass}`}>{busy ? "Applying…" : preview?.noChanges ? actionMode === "REPAIR" ? "No payroll repairs are needed" : "Nothing needs resetting" : ACTION_CONFIGURATION[actionMode].buttonLabel}</button></div>
    </div></div>}
  </section>;
};

function ActionPreview({ action, preview, confirmText, onConfirmTextChange }: { action: PayrollMaintenanceAction; preview: PayrollMaintenancePreview; confirmText: string; onConfirmTextChange: (value: string) => void }) {
  switch (action) {
    case "REPAIR": return <div className="mt-4 space-y-3 text-xs text-slate-700"><div><p className="font-black text-slate-900">Will fix</p><ul className="mt-1 space-y-1"><li>• {plural(preview.periodsToDelete, "obsolete generated period")}</li><li>• {plural(preview.runsToDelete, "duplicate empty draft run")}</li><li>• {plural(preview.protectedLockedPeriods, "safe blocking tombstone")} protected from accidental overwrite</li></ul></div><p><strong>Will create:</strong> {plural(preview.periodsToCreate, "missing canonical period")}.</p><p><strong>Protected:</strong> {plural(preview.protectedDataBearingPeriods, "finalized/data-bearing period")}.</p><p><strong>Needs manual review:</strong> {plural(preview.manualReviewIssues, "conflict")}.</p>{preview.noChanges && <p className="rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-800">No payroll repairs are needed.</p>}</div>;
    case "REBUILD_CALENDAR": return <div className="mt-4 space-y-3 text-xs text-slate-700"><p><strong>Current schedule:</strong> {preview.scheduleName || "Payroll schedule"} · {preview.scheduleFrequency?.replaceAll("_", " ") || "configured frequency"}.</p><p><strong>Calendar range:</strong> {preview.rebuildStart || "—"} – {preview.rebuildEnd || "—"}</p><p><strong>Will remove:</strong> {plural(preview.periodsToDelete, "disposable generated period")}, {plural(preview.runsToDelete, "empty draft run")}, and safe empty tombstones.</p><p><strong>Will create:</strong> {plural(preview.periodsToCreate, "canonical period")}.</p><p className="rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-800"><strong>Protected:</strong> {plural(preview.protectedDataBearingPeriods, "finalized/data-bearing historical period")}.</p></div>;
    case "RESET_UNAPPROVED": return <div className="mt-4 space-y-3 text-xs text-slate-700"><div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-950"><p className="font-black">WARNING</p><p className="mt-1">This clears unapproved derived payroll results and rebuilds the payroll calendar.</p></div><div><p className="font-black text-slate-900">Will reset</p><ul className="mt-1 space-y-1"><li>• {plural(preview.runsToDelete, "DRAFT/CALCULATED run")}</li><li>• {plural(preview.entriesToDelete, "payroll entry")}</li><li>• {plural(preview.allocationsToDelete, "project allocation")}</li><li>• {plural(preview.adjustmentsToDelete, "adjustment")}</li></ul></div><p><strong>Will reopen:</strong> {plural(preview.importBatchesToReopen, "payroll import batch")} and {plural(preview.importRowsToReopen, "import row")}.</p><p><strong>Will rebuild:</strong> {plural(preview.periodsToCreate, "period")} · {preview.rebuildStart || "—"} – {preview.rebuildEnd || "—"}</p><p className="font-semibold text-emerald-800"><strong>Protected:</strong> {plural(preview.protectedApprovedRuns, "approved run")}, {plural(preview.protectedPaidRuns, "paid run")}, and {plural(preview.protectedLockedPeriods, "locked period")}.</p>{preview.noChanges && <p className="rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-800">Nothing needs resetting.</p>}<label className="block space-y-1"><span className="field-label">Type {RESET_UNAPPROVED_CONFIRMATION} to confirm</span><input value={confirmText} onChange={(event) => onConfirmTextChange(event.target.value)} className="field-input" autoComplete="off" /></label></div>;
  }
}

function Summary({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold text-slate-500">{label}</p><p className={`mt-1 text-lg font-black tabular-nums ${tone}`}>{value}</p></div>; }