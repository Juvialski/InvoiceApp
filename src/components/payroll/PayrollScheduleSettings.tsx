import React, { useEffect, useMemo, useState } from "react";
import { CalendarCog, Eye, X } from "lucide-react";
import type { PayrollPeriod } from "../../types";
import { addDateDays, findFirstGeneratablePayrollPeriod, generatePayrollPeriod, generatePayrollPeriodsAroundReference, type GeneratedPayrollPeriod, type PayrollSchedule, type PayrollScheduleVersion } from "../../lib/payrollSchedule";

interface PayrollScheduleSettingsProps {
  schedule?: PayrollSchedule;
  periods?: PayrollPeriod[];
  onSave: (schedule: PayrollSchedule) => void | PayrollSchedule | Promise<void | PayrollSchedule>;
  canManage?: boolean;
}

const weekdays = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]] as const;
type EffectiveMode = "NEXT_PERIOD" | "IMMEDIATELY" | "CHOOSE_DATE";
const frequencyCycleLabels: Record<PayrollSchedule["frequency"], string> = { DAILY: "daily", WEEKLY: "weekly", BIWEEKLY: "biweekly", SEMI_MONTHLY: "semi-monthly", MONTHLY: "monthly", CUSTOM: "custom" };
const id = (prefix: string) => globalThis.crypto?.randomUUID?.() || `local-${prefix}-${Date.now()}`;
const scheduleDateOnly = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};

function freshSchedule(): PayrollSchedule {
  const today = scheduleDateOnly();
  return { id: id("schedule"), name: "Standard payroll", effectiveFrom: today, frequency: "SEMI_MONTHLY", customCutoffDay: 15, payDateRule: { type: "BUSINESS_DAYS", offsetDays: 2 }, autoGeneratePeriods: true, autoCalculate: false, autoCreateRuns: true, autoSelectCurrentPeriod: true, automationMode: "ASSISTED", active: true };
}

function configurationDiagnostic(schedule: Pick<PayrollSchedule, "frequency" | "anchorPeriodEnd" | "customCutoffDay" | "customPeriodLengthDays" | "customPeriodStartDay" | "customPeriodEndDay" | "payDateRule">): string | null {
  if (schedule.frequency === "BIWEEKLY" && !schedule.anchorPeriodEnd) return "BIWEEKLY requires an anchor period end.";
  if (schedule.frequency === "CUSTOM" && !schedule.customCutoffDay && !schedule.customPeriodLengthDays && !(schedule.customPeriodStartDay !== undefined && schedule.customPeriodEndDay !== undefined)) return "CUSTOM schedules require a cutoff day, period length, or custom period boundary.";
  if (schedule.customPeriodLengthDays && !schedule.anchorPeriodEnd) return "Length-based CUSTOM schedules require an anchor period end.";
  if ((schedule.payDateRule.type === "CALENDAR_DAYS" || schedule.payDateRule.type === "BUSINESS_DAYS") && !Number.isInteger(schedule.payDateRule.offsetDays)) return `${schedule.payDateRule.type} requires an integer offsetDays.`;
  return null;
}

function recommendationCandidate(editing: PayrollSchedule, today: string): PayrollSchedule {
  return { id: editing.id, name: editing.name, effectiveFrom: today, frequency: editing.frequency, weekEndDay: editing.weekEndDay, anchorPeriodEnd: editing.anchorPeriodEnd, customCutoffDay: editing.customCutoffDay, customPeriodLengthDays: editing.customPeriodLengthDays, customPeriodStartDay: editing.customPeriodStartDay, customPeriodEndDay: editing.customPeriodEndDay, payDateRule: editing.payDateRule, autoGeneratePeriods: true, autoCalculate: false, active: true };
}

function recommendNextPeriodStart(periods: PayrollPeriod[], editing: PayrollSchedule, today: string): { recommendedStart?: string; diagnosticMessage?: string } {
  const current = periods.filter((period) => period.status !== "VOID" && period.periodStart <= today && period.periodEnd >= today).sort((left, right) => left.periodEnd.localeCompare(right.periodEnd))[0];
  const upcoming = periods.filter((period) => period.status !== "VOID" && period.periodStart > today).sort((left, right) => left.periodStart.localeCompare(right.periodStart))[0];
  if (upcoming) return { recommendedStart: upcoming.periodStart };
  if (current) return { recommendedStart: addDateDays(current.periodEnd, 1) };
  const knownProblem = configurationDiagnostic(editing);
  if (knownProblem) return { diagnosticMessage: knownProblem };
  try {
    const generated = findFirstGeneratablePayrollPeriod(recommendationCandidate(editing, today), today);
    if (generated) return { recommendedStart: generated.periodStart };
    return { diagnosticMessage: "This configuration does not produce any future payroll period yet. Adjust the recurrence and try again." };
  } catch (error) {
    return { diagnosticMessage: error instanceof Error ? error.message : "This payroll schedule configuration could not produce a next payroll period." };
  }
}

function readableDateOnly(value: string, today: string) {
  const [year, month, day] = value.split("-").map(Number);
  const monthLabel = new Date(Date.UTC(year, month - 1, day)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return year === Number(today.slice(0, 4)) ? `${monthLabel} ${day}` : `${monthLabel} ${day}, ${year}`;
}

function versionFor(schedule: PayrollSchedule, effectiveFrom: string): PayrollScheduleVersion {
  const versions = schedule.versions || [];
  const existing = versions.find((version) => version.effectiveFrom === effectiveFrom);
  return { id: existing?.id || id("schedule-version"), scheduleId: schedule.id, version: existing?.version || Math.max(0, ...versions.map((version) => version.version)) + 1, effectiveFrom, frequency: schedule.frequency, weekEndDay: schedule.weekEndDay, anchorPeriodEnd: schedule.anchorPeriodEnd, customCutoffDay: schedule.customCutoffDay, customPeriodLengthDays: schedule.customPeriodLengthDays, customPeriodStartDay: schedule.customPeriodStartDay, customPeriodEndDay: schedule.customPeriodEndDay, payDateRule: schedule.payDateRule, autoGeneratePeriods: schedule.autoGeneratePeriods, autoCalculate: schedule.autoCalculate, autoCreateRuns: schedule.autoCreateRuns, autoSelectCurrentPeriod: schedule.autoSelectCurrentPeriod, automationMode: schedule.automationMode, active: schedule.active };
}

function buildCandidateSchedule(editing: PayrollSchedule, schedule: PayrollSchedule | undefined, effectiveMode: EffectiveMode, chosenDate: string, recommendedStart?: string, today?: string): PayrollSchedule {
  const resolvedToday = today || scheduleDateOnly();
  const effectiveFromValue = effectiveMode === "IMMEDIATELY" ? resolvedToday : effectiveMode === "CHOOSE_DATE" ? chosenDate || recommendedStart || resolvedToday : recommendedStart || resolvedToday;
  const baseSchedule = schedule ? editing : { ...editing, effectiveFrom: effectiveFromValue };
  const versions = [...(baseSchedule.versions || [])];
  // A legacy schedule without persisted versions still generated periods that
  // reference its implicit `${id}:v1`. Materialize that version BEFORE numbering
  // the new one so existing history keeps resolving and the persisted
  // unique(schedule_id, version) contract stays satisfied.
  if (schedule && !versions.length) {
    versions.push({ id: `${schedule.id}:v1`, scheduleId: schedule.id, version: 1, effectiveFrom: schedule.effectiveFrom, frequency: schedule.frequency, weekEndDay: schedule.weekEndDay, anchorPeriodEnd: schedule.anchorPeriodEnd, customCutoffDay: schedule.customCutoffDay, customPeriodLengthDays: schedule.customPeriodLengthDays, customPeriodStartDay: schedule.customPeriodStartDay, customPeriodEndDay: schedule.customPeriodEndDay, payDateRule: schedule.payDateRule, autoGeneratePeriods: schedule.autoGeneratePeriods, autoCalculate: schedule.autoCalculate, autoCreateRuns: schedule.autoCreateRuns, autoSelectCurrentPeriod: schedule.autoSelectCurrentPeriod, automationMode: schedule.automationMode, active: true });
  }
  const nextVersion = versionFor({ ...baseSchedule, versions }, schedule ? effectiveFromValue : baseSchedule.effectiveFrom);
  const sameEffective = versions.findIndex((version) => version.effectiveFrom === nextVersion.effectiveFrom);
  if (sameEffective >= 0) {
    versions[sameEffective] = { ...versions[sameEffective], ...nextVersion };
  } else {
    const closedVersions = versions.map((version) => version.active && !version.effectiveTo && version.effectiveFrom < nextVersion.effectiveFrom
      ? { ...version, effectiveTo: addDateDays(nextVersion.effectiveFrom, -1) }
      : version);
    closedVersions.push(nextVersion);
    versions.splice(0, versions.length, ...closedVersions);
  }
  return { ...baseSchedule, versions: versions.sort((left, right) => left.version - right.version), effectiveFrom: schedule?.effectiveFrom || baseSchedule.effectiveFrom };
}

export const PayrollScheduleSettings: React.FC<PayrollScheduleSettingsProps> = ({ schedule, periods = [], onSave, canManage = true }) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PayrollSchedule>(() => schedule || freshSchedule());
  const [effectiveMode, setEffectiveMode] = useState<EffectiveMode>("NEXT_PERIOD");
  const [chosenDate, setChosenDate] = useState(scheduleDateOnly());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => { if (schedule && !open) setEditing(schedule); }, [schedule, open]);

  const today = scheduleDateOnly();
  const { recommendedStart, diagnosticMessage: recommendationDiagnostic } = useMemo(() => recommendNextPeriodStart(periods, editing, today), [periods, editing, today]);
  const candidateSchedule = useMemo(() => buildCandidateSchedule(editing, schedule, effectiveMode, chosenDate, recommendedStart, today), [editing, schedule, effectiveMode, chosenDate, recommendedStart, today]);
  const preview = useMemo<{ horizon: GeneratedPayrollPeriod[]; previewError: string | null }>(() => {
    try { return { horizon: generatePayrollPeriodsAroundReference(candidateSchedule, today, { previous: 0, next: 2 }), previewError: null }; }
    catch (error) { return { horizon: [], previewError: error instanceof Error ? error.message : "This payroll schedule configuration could not be previewed." }; }
  }, [candidateSchedule, today]);
  const midCycleNotice = useMemo(() => {
    const firstComplete = preview.horizon[0];
    if (!firstComplete || firstComplete.periodStart <= today) return null;
    try { if (generatePayrollPeriod(candidateSchedule, today)) return null; } catch { return null; }
    return `This change takes effect inside the current ${frequencyCycleLabels[candidateSchedule.frequency]} cycle, so the incomplete cycle is skipped. The first complete payroll period is ${readableDateOnly(firstComplete.periodStart, today)} – ${readableDateOnly(firstComplete.periodEnd, today)}.`;
  }, [preview, candidateSchedule, today]);

  const openEditor = () => {
    if (!canManage) return;
    setEditing(schedule || freshSchedule());
    setEffectiveMode(schedule ? "NEXT_PERIOD" : "IMMEDIATELY");
    setChosenDate(recommendedStart || scheduleDateOnly());
    setSaveError(null);
    setOpen(true);
  };

  const changeFrequency = (frequency: PayrollSchedule["frequency"]) => {
    const next = { ...editing, frequency };
    if (frequency === "BIWEEKLY" && !next.anchorPeriodEnd) next.anchorPeriodEnd = next.effectiveFrom;
    if (frequency === "WEEKLY" && next.weekEndDay === undefined) next.weekEndDay = 0;
    if (frequency === "CUSTOM" && !next.customCutoffDay) next.customCutoffDay = 15;
    setEditing(next);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const candidate = buildCandidateSchedule(editing, schedule, effectiveMode, chosenDate, recommendedStart, today);
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await onSave(candidate);
      setEditing(saved || candidate);
      setOpen(false);
    } catch {
      setSaveError("Could not save payroll schedule.");
    } finally {
      setSaving(false);
    }
  };

  return <>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Payroll settings</p><h3 className="mt-1 text-sm font-black">Payroll schedule</h3><p className="mt-1 text-xs text-slate-500">{schedule?.name || "Configure recurring periods once, then let Payroll prepare the next cycle."}</p></div><button type="button" onClick={openEditor} disabled={!canManage} className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><CalendarCog className="h-3.5 w-3.5" /> Manage</button></div>
      {schedule && <div className="mt-4 grid gap-3 text-xs sm:grid-cols-4"><div><p className="text-[10px] font-semibold text-slate-500">Frequency</p><p className="mt-1 font-black">{schedule.frequency.replace("_", " ")}</p></div><div><p className="text-[10px] font-semibold text-slate-500">Pay date</p><p className="mt-1 font-black">{schedule.payDateRule.type.replaceAll("_", " ")}{schedule.payDateRule.offsetDays !== undefined ? ` · ${schedule.payDateRule.offsetDays} days` : ""}</p></div><div><p className="text-[10px] font-semibold text-slate-500">Period generation</p><p className="mt-1 font-black text-emerald-700">{schedule.autoGeneratePeriods ? "Automatic" : "Manual"}</p></div><div><p className="text-[10px] font-semibold text-slate-500">Draft runs</p><p className="mt-1 font-black text-emerald-700">{schedule.autoCreateRuns ?? schedule.autoCalculate ? "Automatic" : "Manual"}</p></div></div>}
    </section>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={save} className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Payroll schedule</p><h3 className="mt-1 text-xl font-black">Recurring period configuration</h3><p className="mt-1 text-xs text-slate-500">Payroll workflow and project labor costing only; statutory Philippine payroll rules are not calculated here.</p></div><button type="button" onClick={() => setOpen(false)} disabled={saving} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X className="h-4 w-4" /></button></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="field-label">Schedule name</span><input required value={editing.name || ""} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="field-input" /></label><label className="space-y-1"><span className="field-label">Effective from</span><input disabled type="date" value={editing.effectiveFrom} className="field-input bg-slate-50" title="The schedule’s original start date stays with payroll history." /></label><label className="space-y-1"><span className="field-label">Frequency</span><select value={editing.frequency} onChange={(event) => changeFrequency(event.target.value as PayrollSchedule["frequency"])} className="field-input">{["DAILY", "WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "CUSTOM"].map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select></label><label className="space-y-1"><span className="field-label">Automation mode</span><select value={editing.automationMode || "ASSISTED"} onChange={(event) => setEditing({ ...editing, automationMode: event.target.value as PayrollSchedule["automationMode"] })} className="field-input"><option value="MANUAL">Manual</option><option value="ASSISTED">Assisted (recommended)</option><option value="AUTOMATED">Automated</option></select></label>{editing.frequency === "WEEKLY" && <label className="space-y-1"><span className="field-label">Period end day</span><select value={editing.weekEndDay ?? 0} onChange={(event) => setEditing({ ...editing, weekEndDay: Number(event.target.value) as PayrollSchedule["weekEndDay"] })} className="field-input">{weekdays.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}{editing.frequency === "BIWEEKLY" && <label className="space-y-1"><span className="field-label">Anchor period end</span><input required type="date" value={editing.anchorPeriodEnd || editing.effectiveFrom} onChange={(event) => setEditing({ ...editing, anchorPeriodEnd: event.target.value })} className="field-input" /></label>}{editing.frequency === "CUSTOM" && <label className="space-y-1"><span className="field-label">Recurring cutoff day</span><input required min="1" max="31" type="number" value={editing.customCutoffDay || 15} onChange={(event) => setEditing({ ...editing, customCutoffDay: Number(event.target.value) })} className="field-input" /></label>}<label className="space-y-1"><span className="field-label">Pay date rule</span><select value={editing.payDateRule.type} onChange={(event) => setEditing({ ...editing, payDateRule: { ...editing.payDateRule, type: event.target.value as PayrollSchedule["payDateRule"]["type"] } })} className="field-input"><option value="SAME_PERIOD_END">Same day as period end</option><option value="CALENDAR_DAYS">Calendar days after cutoff</option><option value="BUSINESS_DAYS">Business days after cutoff</option><option value="FIXED_FOLLOWING_MONTH">Fixed day of following month</option><option value="MANUAL">Manual</option></select></label>{(editing.payDateRule.type === "CALENDAR_DAYS" || editing.payDateRule.type === "BUSINESS_DAYS") && <label className="space-y-1"><span className="field-label">Days after cutoff</span><input required type="number" value={editing.payDateRule.offsetDays ?? 2} onChange={(event) => setEditing({ ...editing, payDateRule: { ...editing.payDateRule, offsetDays: Number(event.target.value) } })} className="field-input" /></label>}{editing.payDateRule.type === "FIXED_FOLLOWING_MONTH" && <label className="space-y-1"><span className="field-label">Day of following month</span><input required min="1" max="31" type="number" value={editing.payDateRule.dayOfMonth ?? 1} onChange={(event) => setEditing({ ...editing, payDateRule: { ...editing.payDateRule, dayOfMonth: Number(event.target.value) } })} className="field-input" /></label>}</div>
      <fieldset className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3"><legend className="px-1 text-xs font-black text-indigo-900">Apply schedule change</legend><div className="mt-2 space-y-2 text-xs text-indigo-950"><label className="flex items-start gap-2"><input type="radio" name="effective-date" checked={effectiveMode === "NEXT_PERIOD"} onChange={() => setEffectiveMode("NEXT_PERIOD")} /><span><strong>Next payroll period</strong>{recommendationDiagnostic ? <span role="alert" className="block text-[10px] font-semibold text-rose-700">{recommendationDiagnostic}</span> : <span className="block text-[10px] text-indigo-800">Recommended · starts {recommendedStart ?? "…"}</span>}</span></label><label className="flex items-start gap-2"><input type="radio" name="effective-date" checked={effectiveMode === "IMMEDIATELY"} onChange={() => setEffectiveMode("IMMEDIATELY")} /><span>Immediately <span className="block text-[10px] text-indigo-800">Starts {today}; fixed periods wait for their next valid boundary.</span></span></label><label className="flex items-center gap-2"><input type="radio" name="effective-date" checked={effectiveMode === "CHOOSE_DATE"} onChange={() => setEffectiveMode("CHOOSE_DATE")} /><span>Choose date</span>{effectiveMode === "CHOOSE_DATE" && <input required type="date" value={chosenDate} min={today} onChange={(event) => setChosenDate(event.target.value)} className="field-input max-w-[10rem]" />}</label></div></fieldset>
      <div className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs sm:grid-cols-3"><label className="flex items-center gap-2"><input type="checkbox" checked={editing.autoGeneratePeriods} onChange={(event) => setEditing({ ...editing, autoGeneratePeriods: event.target.checked })} /> Automatically create periods</label><label className="flex items-center gap-2"><input type="checkbox" checked={editing.autoCreateRuns ?? editing.autoCalculate} onChange={(event) => setEditing({ ...editing, autoCreateRuns: event.target.checked, autoCalculate: false })} /> Create a draft run when the current period opens</label><label className="flex items-center gap-2"><input type="checkbox" checked={editing.autoSelectCurrentPeriod ?? true} onChange={(event) => setEditing({ ...editing, autoSelectCurrentPeriod: event.target.checked })} /> Select current period automatically</label></div>
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3"><div className="flex items-center gap-2 text-xs font-black text-indigo-900"><Eye className="h-3.5 w-3.5" /> Next periods preview</div>{preview.previewError ? <p role="alert" className="mt-2 text-[10px] font-semibold text-rose-700">{preview.previewError}</p> : preview.horizon.length ? <><div className="mt-2 grid gap-2 sm:grid-cols-3">{preview.horizon.map((period) => <div key={period.periodKey} className="rounded-lg bg-white p-2 text-[10px]"><p className="font-black">{period.periodStart} – {period.periodEnd}</p><p className="mt-1 text-slate-500">Pay {period.payDate || "manual"}</p></div>)}</div>{midCycleNotice && <p className="mt-2 rounded-lg bg-white p-2 text-[10px] font-semibold text-indigo-900">{midCycleNotice}</p>}</> : <p className="mt-2 text-[10px] text-slate-600">Complete a valid schedule to see the preview.</p>}</div>
      {saveError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{saveError}</p>}
      <div className="flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} disabled={saving} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-40">Cancel</button><button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-60">{saving ? "Saving…" : "Save schedule"}</button></div>
    </form></div>}
  </>;
};
