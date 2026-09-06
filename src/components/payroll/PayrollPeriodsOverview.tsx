import React, { useMemo, useState } from "react";
import type { PayrollEntry, PayrollPeriod, PayrollRun } from "../../types";
import type { PayrollImportBatch } from "../../lib/payrollImportPersistence";
import type { PayrollSchedule } from "../../lib/payrollSchedule";
import { selectActualPayrollPeriod, selectNearestUpcomingPayrollPeriod } from "../../lib/payrollSchedule";
import { formatPayrollPeriodLabel, getIssueSummary, getPayrollPeriodDisplayState, getPayrollPeriodDisplayClass, type AutomaticPayrollDraftRecord, type PayrollFrequency } from "../../utils/payrollCalendar";
import { payrollPeriodFrequencyLabel } from "../../lib/payrollIntegrity";

export interface PayrollPeriodsOverviewProps {
  periods: readonly PayrollPeriod[];
  runs: readonly PayrollRun[];
  entries: readonly PayrollEntry[];
  importBatches: readonly PayrollImportBatch[];
  automaticDrafts: readonly AutomaticPayrollDraftRecord[];
  automaticDraft?: AutomaticPayrollDraftRecord;
  selectedPeriodId?: string;
  frequencyLabel?: string;
  schedules?: readonly PayrollSchedule[];
  today: string;
  onSelectPeriod?: (periodId: string) => void;
  onOpenOverview?: (period: PayrollPeriod) => void;
}

function frequency(value?: string): PayrollFrequency | undefined {
  const normalized = value?.replaceAll(" ", "_") as PayrollFrequency | undefined;
  return normalized && ["DAILY", "WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "CUSTOM"].includes(normalized) ? normalized : undefined;
}

function shortDate(value?: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

const PeriodCard: React.FC<{
  period: PayrollPeriod;
  periods: readonly PayrollPeriod[];
  runs: readonly PayrollRun[];
  entries: readonly PayrollEntry[];
  importBatches: readonly PayrollImportBatch[];
  automaticDrafts: readonly AutomaticPayrollDraftRecord[];
  automaticDraft?: AutomaticPayrollDraftRecord;
  frequencyLabel?: string;
  schedules?: readonly PayrollSchedule[];
  today: string;
  selected: boolean;
  onSelectPeriod?: (periodId: string) => void;
  onOpenOverview?: (period: PayrollPeriod) => void;
}> = ({ period, periods, runs, entries, importBatches, automaticDrafts, automaticDraft, frequencyLabel, schedules, today, selected, onSelectPeriod, onOpenOverview }) => {
  const issueSummary = getIssueSummary(period, { periods, runs, entries, automaticDrafts, automaticDraft, importBatches });
  const periodRuns = runs.filter((run) => run.periodId === period.id);
  const periodRunIds = new Set(periodRuns.map((run) => run.id));
  const workers = new Set(entries.filter((entry) => periodRunIds.has(entry.payrollRunId)).map((entry) => entry.workerId)).size;
  const state = getPayrollPeriodDisplayState(period, runs, today);
  const ownFrequencyLabel = schedules ? payrollPeriodFrequencyLabel(period, schedules) : frequencyLabel || "Payroll period";
  return <article className={`rounded-2xl border bg-white p-4 shadow-sm ${selected ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200"}`}>
    <button type="button" onClick={() => onSelectPeriod?.(period.id)} aria-pressed={selected} className="block w-full text-left">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-base font-black text-slate-950">{formatPayrollPeriodLabel(period, frequency(ownFrequencyLabel))}</h3><p className="mt-1 text-xs text-slate-500">{ownFrequencyLabel}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${getPayrollPeriodDisplayClass(state)}`}>{state}</span></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><div><p className="text-slate-500">Pay date</p><p className="mt-0.5 font-bold text-slate-800">{shortDate(period.payDate)}</p></div><div><p className="text-slate-500">Workers</p><p className="mt-0.5 font-bold text-slate-800">{workers || "—"}</p></div><div><p className="text-slate-500">Issues</p><p className={`mt-0.5 font-bold ${issueSummary.issueCount ? "text-rose-700" : "text-emerald-700"}`}>{issueSummary.issueCount || "None"}</p></div></div>
    </button>
    {onOpenOverview && <button type="button" onClick={() => onOpenOverview(period)} className="mt-3 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-bold text-white">Open payroll</button>}
  </article>;
};

export const PayrollPeriodsOverview: React.FC<PayrollPeriodsOverviewProps> = ({ periods, runs, entries, importBatches, automaticDrafts, automaticDraft, selectedPeriodId, frequencyLabel, schedules, today, onSelectPeriod, onOpenOverview }) => {
  const [includeVoided, setIncludeVoided] = useState(false);
  const eligible = useMemo(() => periods.filter((period) => period.status !== "VOID").slice().sort((left, right) => right.periodStart.localeCompare(left.periodStart)), [periods]);
  const voided = useMemo(() => periods.filter((period) => period.status === "VOID").slice().sort((left, right) => right.periodStart.localeCompare(left.periodStart)), [periods]);
  const current = selectActualPayrollPeriod(eligible, today);
  const next = selectNearestUpcomingPayrollPeriod(eligible, today);
  const upcoming = eligible.filter((period) => period.periodStart > today).sort((left, right) => left.periodStart.localeCompare(right.periodStart)).slice(0, 6);
  const recent = eligible.filter((period) => period.periodEnd < today).sort((left, right) => right.periodEnd.localeCompare(left.periodEnd)).slice(0, 4);
  const shown = new Set<string>();
  const sections = [{ label: "Current", rows: current ? [current] : [] }, { label: "Upcoming", rows: upcoming }, { label: "Recent", rows: recent }];
  return <div className="space-y-5" aria-label="Payroll periods">
    {voided.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"><p className="text-xs font-bold text-slate-700">Voided history ({voided.length})</p><button type="button" aria-pressed={includeVoided} onClick={() => setIncludeVoided((value) => !value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700">{includeVoided ? "Hide voided" : "Include voided"}</button></div>}
    {!current && <div role="status" className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-xs text-sky-950"><p className="font-black">No active period today</p><p className="mt-1">{next ? <>Next: <strong>{formatPayrollPeriodLabel(next, frequency(schedules ? payrollPeriodFrequencyLabel(next, schedules) : frequencyLabel))}</strong>.</> : "There is no upcoming payroll period in the current calendar."}</p></div>}
    {sections.map((section) => {
      const rows = section.rows.filter((period) => !shown.has(period.id) && (shown.add(period.id), true));
      if (!rows.length) return null;
      return <section key={section.label}><div className="mb-2 flex items-center gap-2"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{section.label}</p><span className="h-px flex-1 bg-slate-100" /></div><div className="grid gap-3 lg:grid-cols-2">{rows.map((period) => <PeriodCard key={period.id} period={period} periods={periods} runs={runs} entries={entries} importBatches={importBatches} automaticDrafts={automaticDrafts} automaticDraft={automaticDraft} frequencyLabel={frequencyLabel} schedules={schedules} today={today} selected={period.id === selectedPeriodId} onSelectPeriod={onSelectPeriod} onOpenOverview={onOpenOverview} />)}</div></section>;
    })}
    {!eligible.length && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500"><p className="font-bold text-slate-700">No active payroll periods yet.</p><p className="mt-1">{voided.length ? `${voided.length} voided historical period${voided.length === 1 ? " remains" : "s remain"}. Include voided to inspect the audit history.` : "Generated or imported periods will appear here."}</p></div>}
    {includeVoided && voided.length > 0 && <section aria-label="Voided payroll periods"><div className="mb-2 flex items-center gap-2"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Voided history</p><span className="h-px flex-1 bg-slate-100" /></div><div className="grid gap-3 lg:grid-cols-2">{voided.map((period) => <PeriodCard key={period.id} period={period} periods={periods} runs={runs} entries={entries} importBatches={importBatches} automaticDrafts={automaticDrafts} automaticDraft={automaticDraft} frequencyLabel={frequencyLabel} schedules={schedules} today={today} selected={period.id === selectedPeriodId} onSelectPeriod={onSelectPeriod} onOpenOverview={onOpenOverview} />)}</div></section>}
  </div>;
};

export default PayrollPeriodsOverview;
