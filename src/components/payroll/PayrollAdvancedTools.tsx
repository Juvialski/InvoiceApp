import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, Wrench, X } from "lucide-react";
import type { PayrollEntry, PayrollPeriod, PayrollProjectAllocation, PayrollRun, WorkEntry } from "../../types";
import type { PayrollImportBatch } from "../../lib/payrollImportPersistence";
import type { PayrollSchedule } from "../../lib/payrollSchedule";
import { inspectPayrollIntegrity, isPayrollPeriodDataBearing, isPayrollPeriodLocked, isSafeToRetirePayrollPeriod } from "../../lib/payrollIntegrity";

interface PayrollAdvancedToolsProps {
  schedules: readonly PayrollSchedule[];
  periods: readonly PayrollPeriod[];
  runs: readonly PayrollRun[];
  entries: readonly PayrollEntry[];
  allocations: readonly PayrollProjectAllocation[];
  workEntries: readonly WorkEntry[];
  importBatches: readonly PayrollImportBatch[];
  onRepair?: () => void | Promise<void>;
  onResetSetup?: () => void | Promise<void>;
  onResetAllUnapproved?: () => void | Promise<void>;
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

export const PayrollAdvancedTools: React.FC<PayrollAdvancedToolsProps> = ({ schedules, periods, runs, entries, allocations, workEntries, importBatches, onRepair, onResetSetup, onResetAllUnapproved }) => {
  const [open, setOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"REPAIR" | "SAFE_RESET" | "DANGEROUS_RESET" | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const report = useMemo(() => inspectPayrollIntegrity(schedules, periods, runs, entries, allocations, { workEntries, importBatches }), [schedules, periods, runs, entries, allocations, workEntries, importBatches]);
  const safePeriodCount = useMemo(() => periods.filter((period) => isSafeToRetirePayrollPeriod(period, { runs, entries, workEntries, importBatches })).length, [periods, runs, entries, workEntries, importBatches]);
  const protectedPeriodCount = useMemo(() => periods.filter((period) => isPayrollPeriodLocked(period) || isPayrollPeriodDataBearing(period, { runs, entries, workEntries, importBatches })).length, [periods, runs, entries, workEntries, importBatches]);
  const emptyDraftRunCount = useMemo(() => runs.filter((run) => run.status === "DRAFT" && !entries.some((entry) => entry.payrollRunId === run.id)).length, [runs, entries]);
  const unapprovedDataBearingRuns = useMemo(() => runs.filter((run) => (run.status === "DRAFT" || run.status === "CALCULATED") && entries.some((entry) => entry.payrollRunId === run.id)).length, [runs, entries]);

  const apply = async (mode: "REPAIR" | "SAFE_RESET" | "DANGEROUS_RESET") => {
    if (busy) return;
    if (mode === "DANGEROUS_RESET" && confirmText !== "RESET ALL UNAPPROVED") return;
    setBusy(true);
    try {
      if (mode === "REPAIR") await onRepair?.();
      if (mode === "SAFE_RESET") await onResetSetup?.();
      if (mode === "DANGEROUS_RESET") await onResetAllUnapproved?.();
      setPreviewMode(null);
      setConfirmText("");
    } finally {
      setBusy(false);
    }
  };

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="payroll-advanced-title">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Advanced</p><h3 id="payroll-advanced-title" className="mt-1 text-sm font-black">Payroll data integrity</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Checks for duplicate or outdated payroll periods and safely fixes empty generated records. Finalized payroll is never changed.</p></div><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" /></div>
    <div className="mt-4 grid gap-2 text-xs sm:grid-cols-4"><Summary label="Integrity issues" value={String(report.issues.length)} tone={report.issues.length ? "text-amber-800" : "text-emerald-700"} /><Summary label="Safe empty periods" value={String(safePeriodCount)} tone="text-indigo-700" /><Summary label="Empty draft runs" value={String(emptyDraftRunCount)} tone="text-indigo-700" /><Summary label="Protected periods" value={String(protectedPeriodCount)} tone="text-slate-700" /></div>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => { setOpen(true); setPreviewMode("REPAIR"); }} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white"><Wrench className="h-3.5 w-3.5" /> Repair payroll data</button><button type="button" onClick={() => { setOpen(true); setPreviewMode("SAFE_RESET"); }} className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700">Reset payroll setup</button><button type="button" onClick={() => { setOpen(true); setPreviewMode("DANGEROUS_RESET"); }} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-800"><AlertTriangle className="h-3.5 w-3.5" /> Reset all unapproved payroll</button></div>
    {report.issues.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><p className="font-black">Integrity review</p><ul className="mt-2 space-y-1">{report.issues.slice(0, 5).map((issue, index) => <li key={`${issue.code}-${index}`}>• {issue.message}</li>)}</ul>{report.issues.length > 5 && <p className="mt-2 text-[10px] text-amber-800">{plural(report.issues.length - 5, "additional issue")} needs review.</p>}</div>}
    {!report.issues.length && <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> No payroll integrity conflicts detected.</p>}

    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="payroll-action-title"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Preview before changes</p><h4 id="payroll-action-title" className="mt-1 text-lg font-black">{previewMode === "REPAIR" ? "Repair payroll data" : previewMode === "SAFE_RESET" ? "Reset payroll setup" : "Reset all unapproved payroll"}</h4></div><button type="button" onClick={() => { setOpen(false); setPreviewMode(null); setConfirmText(""); }} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close payroll action preview"><X className="h-4 w-4" /></button></div>
      {previewMode === "REPAIR" && <div className="mt-4 space-y-2 text-xs text-slate-700"><p>{plural(safePeriodCount, "empty generated period")} can be retired safely.</p><p>{plural(emptyDraftRunCount, "empty draft run")} can be retired safely.</p><p>{plural(report.overlappingPeriods.length, "overlap")} will be reviewed; data-bearing or locked history is protected.</p><p>{plural(report.missingVersions.length + report.orphanRuns.length + report.orphanEntries.length + report.orphanAllocations.length, "orphan or missing-link issue")} needs manual review.</p><p className="rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-800">Approved, paid, locked, imported, and data-bearing payroll remains unchanged.</p></div>}
      {previewMode === "SAFE_RESET" && <div className="mt-4 space-y-2 text-xs text-slate-700"><p>The safe reset will rebuild the current schedule configuration and a bounded future horizon.</p><p>{plural(safePeriodCount, "empty generated period")} and {plural(emptyDraftRunCount, "empty draft run")} are eligible for retirement.</p><p>{plural(protectedPeriodCount, "period")} is explicitly protected because it is finalized, locked, or contains data.</p><p className="rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-800">Workers, assignments, compensation profiles, components, approved/paid payroll, historical entries, allocations, and source work data are preserved.</p></div>}
      {previewMode === "DANGEROUS_RESET" && <div className="mt-4 space-y-3 text-xs text-slate-700"><div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-950"><p className="font-black">This is a testing/recovery action.</p><p className="mt-1">It may retire {plural(emptyDraftRunCount, "empty draft run")} and eligible unapproved generated periods. {plural(unapprovedDataBearingRuns, "unapproved data-bearing run")} is not eligible for automatic cleanup.</p></div><p className="font-semibold text-emerald-800">Absolutely protected: approved payroll, paid payroll, locked accounting history, workers, assignments, projects, compensation profiles, approved allocations, and committed import provenance.</p><label className="block space-y-1"><span className="field-label">Type RESET ALL UNAPPROVED to confirm</span><input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} className="field-input" autoComplete="off" /></label></div>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => { setOpen(false); setPreviewMode(null); setConfirmText(""); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button>{previewMode && <button type="button" onClick={() => void apply(previewMode)} disabled={busy || (previewMode === "DANGEROUS_RESET" && confirmText !== "RESET ALL UNAPPROVED")} className={`rounded-xl px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40 ${previewMode === "DANGEROUS_RESET" ? "bg-rose-700" : "bg-indigo-600"}`}>{busy ? "Applying…" : previewMode === "REPAIR" ? "Apply safe repair" : previewMode === "SAFE_RESET" ? "Apply safe reset" : "Confirm destructive reset"}</button>}</div>
    </div></div>}
  </section>;
};

function Summary({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold text-slate-500">{label}</p><p className={`mt-1 text-lg font-black tabular-nums ${tone}`}>{value}</p></div>;
}
