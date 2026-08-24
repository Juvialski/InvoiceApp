import React from "react";
import type { PayrollEntry, PayrollPeriod, PayrollRun } from "../../types";
import type { PayrollImportBatch } from "../../lib/payrollImportPersistence";
import type { PayrollSchedule } from "../../lib/payrollSchedule";
import { formatPayrollPeriodLabel, getIssueSummary, type AutomaticPayrollDraftRecord, type PayrollFrequency } from "../../utils/payrollCalendar";
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

function status(period: PayrollPeriod, runs: readonly PayrollRun[], today: string) {
  const run = runs.find((candidate) => candidate.periodId === period.id && candidate.status !== "VOID");
  if (run) return run.status === "DRAFT" ? "Draft" : run.status.replaceAll("_", " ");
  if (period.periodStart > today) return "Scheduled";
  return period.status === "OPEN" || period.status === "DRAFT" ? "Draft" : period.status.replaceAll("_", " ");
}

function statusClass(value: string) {
  const normalized = value.toUpperCase();
  if (normalized === "PAID") return "bg-indigo-50 text-indigo-700";
  if (normalized === "APPROVED") return "bg-emerald-50 text-emerald-700";
  if (normalized === "CALCULATED") return "bg-violet-50 text-violet-700";
  if (normalized === "SCHEDULED") return "bg-slate-100 text-slate-600";
  return "bg-amber-50 text-amber-800";
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
  const state = status(period, runs, today);
  const ownFrequencyLabel = schedules ? payrollPeriodFrequencyLabel(period, schedules) : frequencyLabel || "Payroll period";
  return <article className={`rounded-2xl border bg-white p-4 shadow-sm ${selected ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200"}`}>
    <button type="button" onClick={() => onSelectPeriod?.(period.id)} aria-pressed={selected} className="block w-full text-left">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-base font-black text-slate-950">{formatPayrollPeriodLabel(period, frequency(ownFrequencyLabel))}</h3><p className="mt-1 text-xs text-slate-500">{ownFrequencyLabel}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${statusClass(state)}`}>{state}</span></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><div><p className="text-slate-500">Pay date</p><p className="mt-0.5 font-bold text-slate-800">{shortDate(period.payDate)}</p></div><div><p className="text-slate-500">Workers</p><p className="mt-0.5 font-bold text-slate-800">{workers || "—"}</p></div><div><p className="text-slate-500">Issues</p><p className={`mt-0.5 font-bold ${issueSummary.issueCount ? "text-rose-700" : "text-emerald-700"}`}>{issueSummary.issueCount || "None"}</p></div></div>
    </button>
    {onOpenOverview && <button type="button" onClick={() => onOpenOverview(period)} className="mt-3 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-bold text-white">Open payroll</button>}
  </article>;
};

export const PayrollPeriodsOverview: React.FC<PayrollPeriodsOverviewProps> = ({ periods, runs, entries, importBatches, automaticDrafts, automaticDraft, selectedPeriodId, frequencyLabel, schedules, today, onSelectPeriod, onOpenOverview }) => {
  const eligible = periods.filter((period) => period.status !== "VOID").slice().sort((left, right) => right.periodStart.localeCompare(left.periodStart));
  const current = eligible.find((period) => period.periodStart <= today && period.periodEnd >= today);
  const upcoming = eligible.filter((period) => period.periodStart > today).sort((left, right) => left.periodStart.localeCompare(right.periodStart)).slice(0, 6);
  const recent = eligible.filter((period) => period.periodEnd < today).sort((left, right) => right.periodEnd.localeCompare(left.periodEnd)).slice(0, 4);
  const shown = new Set<string>();
  const sections = [{ label: "Current", rows: current ? [current] : [] }, { label: "Upcoming", rows: upcoming }, { label: "Recent", rows: recent }];
  return <div className="space-y-5" aria-label="Payroll periods">
    {sections.map((section) => {
      const rows = section.rows.filter((period) => !shown.has(period.id) && (shown.add(period.id), true));
      if (!rows.length) return null;
      return <section key={section.label}><div className="mb-2 flex items-center gap-2"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{section.label}</p><span className="h-px flex-1 bg-slate-100" /></div><div className="grid gap-3 lg:grid-cols-2">{rows.map((period) => <PeriodCard key={period.id} period={period} periods={periods} runs={runs} entries={entries} importBatches={importBatches} automaticDrafts={automaticDrafts} automaticDraft={automaticDraft} frequencyLabel={frequencyLabel} schedules={schedules} today={today} selected={period.id === selectedPeriodId} onSelectPeriod={onSelectPeriod} onOpenOverview={onOpenOverview} />)}</div></section>;
    })}
    {!eligible.length && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">No payroll periods yet. Generated or imported periods will appear here.</div>}
  </div>;
};

export default PayrollPeriodsOverview;
