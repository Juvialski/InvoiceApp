import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  Scissors,
  ShieldCheck,
  TimerReset,
  XCircle,
} from "lucide-react";
import type { PayrollEntry, PayrollPeriod, PayrollRun } from "../../types";
import type { PayrollImportBatch } from "../../lib/payrollImportPersistence";
import { selectActualPayrollPeriod, selectNearestUpcomingPayrollPeriod, type PayrollSchedule } from "../../lib/payrollSchedule";
import { PayrollPeriodsOverview } from "./PayrollPeriodsOverview";
import { payrollPeriodFrequencyLabel } from "../../lib/payrollIntegrity";
import {
  buildPayrollMonthGrid,
  getImportedActivity,
  getIssueSummary,
  getLocalToday,
  selectStablePayrollPeriod,
  findPayrollCalendarConflicts,
  formatPayrollPeriodLabel,
  getPayrollPeriodDisplayState,
  getPayrollPeriodDisplayClass,
  type AutomaticPayrollDraftRecord,
  type PayrollCalendarDay,
  type PayrollPeriodSlice,
} from "../../utils/payrollCalendar";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PERIOD_TONES = [
  { bar: "bg-indigo-500", soft: "bg-indigo-50", text: "text-indigo-800", ring: "ring-indigo-300" },
  { bar: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-800", ring: "ring-violet-300" },
  { bar: "bg-cyan-500", soft: "bg-cyan-50", text: "text-cyan-800", ring: "ring-cyan-300" },
  { bar: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-800", ring: "ring-emerald-300" },
  { bar: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-800", ring: "ring-amber-300" },
] as const;

export interface PayrollCalendarProps {
  periods: readonly PayrollPeriod[];
  runs: readonly PayrollRun[];
  entries: readonly PayrollEntry[];
  importBatches?: readonly PayrollImportBatch[];
  automaticDrafts?: readonly AutomaticPayrollDraftRecord[];
  automaticDraft?: AutomaticPayrollDraftRecord;
  selectedAutomaticDraft?: AutomaticPayrollDraftRecord;
  selectedPeriodId?: string;
  onSelectPeriod?: (periodId: string) => void;
  onOpenOverview?: (period: PayrollPeriod) => void;
  onOpenRun?: (run: PayrollRun, period: PayrollPeriod) => void;
  frequencyLabel?: string;
  schedules?: readonly PayrollSchedule[];
  className?: string;
}

function dateParts(date: string) {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

function addMonth(cursor: { year: number; month: number }, amount: number) {
  const value = cursor.year * 12 + cursor.month - 1 + amount;
  return { year: Math.floor(value / 12), month: (value % 12) + 1 };
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  return new Intl.DateTimeFormat("en-PH", { ...options, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function money(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value || 0);
}

function formatMonth(cursor: { year: number; month: number }) {
  return new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(cursor.year, cursor.month - 1, 1)));
}

function readableStatus(status?: string) {
  return status ? status.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\w/g, (letter) => letter.toUpperCase()) : "No run";
}

function statusMeta(status?: string) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PAID") return { label: "Paid", icon: Banknote, className: "bg-indigo-50 text-indigo-700" };
  if (normalized === "APPROVED") return { label: "Approved", icon: ShieldCheck, className: "bg-emerald-50 text-emerald-700" };
  if (normalized === "CALCULATED") return { label: "Calculated", icon: CheckCircle2, className: "bg-violet-50 text-violet-700" };
  if (normalized === "VOID") return { label: "Void", icon: XCircle, className: "bg-slate-100 text-slate-500" };
  if (normalized === "DRAFT") return { label: "Draft", icon: FileText, className: "bg-amber-50 text-amber-800" };
  return { label: readableStatus(status), icon: Clock3, className: "bg-slate-100 text-slate-600" };
}

function periodTone(periodId: string, periods: readonly PayrollPeriod[]) {
  const index = Math.max(0, periods.findIndex((period) => period.id === periodId));
  return PERIOD_TONES[index % PERIOD_TONES.length];
}

function periodForSlice(slice: PayrollPeriodSlice, periods: readonly PayrollPeriod[]) {
  return periods.find((period) => period.id === slice.periodId) || periods.find((period) => period.periodStart === slice.period.periodStart && period.periodEnd === slice.period.periodEnd);
}

function isLocked(period: PayrollPeriod, runs: readonly PayrollRun[]) {
  return period.status === "APPROVED"
    || period.status === "PAID"
    || period.status === "VOID"
    || runs.some((run) => run.periodId === period.id && ["APPROVED", "PAID", "VOID"].includes(run.status));
}

function RunStatusBadge({ status, compact = false }: { status?: string; compact?: boolean; key?: React.Key }) {
  const meta = statusMeta(status);
  const Icon = meta.icon;
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${meta.className}`} title={meta.label}>
      <Icon className={compact ? "h-2.5 w-2.5 shrink-0" : "h-3 w-3 shrink-0"} />
      <span className="truncate">{meta.label}</span>
    </span>
  );
}

function DayMarkers({ day, compact = false }: { day: PayrollCalendarDay; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-1 ${compact ? "mt-1" : "mt-1.5"}`}>
      {day.isToday && (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold text-sky-700" title="Today in the browser's local calendar">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> Today
        </span>
      )}
      {day.cutoffMarkers.length > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700" title="Payroll period cutoff">
          <Scissors className="h-2.5 w-2.5" /> Cutoff
        </span>
      )}
      {day.payDateMarkers.length > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700" title="Payroll pay date">
          <Banknote className="h-2.5 w-2.5" /> Pay date
        </span>
      )}
    </div>
  );
}

function IssueImportIndicators({ day }: { day: PayrollCalendarDay }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-[9px] font-bold">
      {day.issueSummary && (
        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${day.issueSummary.blockingCount ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`} title={`${day.issueSummary.issueCount} payroll issue${day.issueSummary.issueCount === 1 ? "" : "s"}`}>
          <CircleAlert className="h-2.5 w-2.5" /> {day.issueSummary.issueCount}
        </span>
      )}
      {day.importedActivity && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-600" title={`${day.importedActivity.batchCount} import batch${day.importedActivity.batchCount === 1 ? "" : "es"}`}>
          <FileSpreadsheet className="h-2.5 w-2.5" /> Import
        </span>
      )}
    </div>
  );
}

function PeriodBar({
  slice,
  date,
  periods,
  runs = [],
  today,
  gridStart,
  gridEnd,
  selectedPeriodId,
  onSelectPeriod,
  mobile = false,
}: {
  key?: React.Key;
  slice: PayrollPeriodSlice;
  date: string;
  periods: readonly PayrollPeriod[];
  runs?: readonly PayrollRun[];
  today?: string;
  gridStart?: string;
  gridEnd?: string;
  selectedPeriodId?: string;
  onSelectPeriod?: (period: PayrollPeriod) => void;
  mobile?: boolean;
}) {
  const period = periodForSlice(slice, periods);
  if (!period) return null;
  const tone = periodTone(period.id, periods);
  const selected = period.id === selectedPeriodId;
  const isSegmentStart = date === period.periodStart || (Boolean(gridStart) && date === gridStart && period.periodStart < gridStart!);
  const isSegmentEnd = date === period.periodEnd || (Boolean(gridEnd) && date === gridEnd && period.periodEnd > gridEnd!);
  const periodLabel = formatPayrollPeriodLabel(period);
  const displayState = getPayrollPeriodDisplayState(period, runs, today);

  if (mobile) {
    return (
      <button
        type="button"
        onClick={() => onSelectPeriod?.(period)}
        aria-label={`Select payroll period ${formatDate(period.periodStart)} to ${formatDate(period.periodEnd)}, status ${displayState}`}
        className={`group flex w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-lg px-2.5 py-2 text-left ${tone.soft} ${selected ? `ring-2 ${tone.ring} ring-inset` : ""} ${period.status === "VOID" ? "opacity-50" : ""}`}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`h-2.5 w-1.5 shrink-0 ${tone.bar} rounded-full`} />
          <span className={`truncate text-xs font-black ${tone.text}`}>{periodLabel}</span>
        </div>
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black ${getPayrollPeriodDisplayClass(displayState)}`}>{displayState}</span>
      </button>
    );
  }

  const segmentClasses = isSegmentStart && isSegmentEnd
    ? "w-full rounded-md px-1.5 mx-0"
    : isSegmentStart
    ? "w-[calc(100%+0.375rem)] rounded-l-md -mr-1.5 ml-0 pl-1.5 pr-0"
    : isSegmentEnd
    ? "w-[calc(100%+0.375rem)] rounded-r-md -ml-1.5 mr-0 pr-1.5 pl-0"
    : "w-[calc(100%+0.75rem)] -mx-1.5 px-0 rounded-none";

  return (
    <button
      type="button"
      onClick={() => onSelectPeriod?.(period)}
      title={`${periodLabel} · ${displayState}`}
      aria-label={`Select payroll period ${formatDate(period.periodStart)} to ${formatDate(period.periodEnd)}, status ${displayState}`}
      className={`group flex h-5 min-w-0 items-center overflow-hidden text-left transition-all ${segmentClasses} ${tone.soft} ${selected ? `ring-2 ${tone.ring} ring-inset z-10 relative` : ""} ${period.status === "VOID" ? "opacity-50" : ""}`}
    >
      {isSegmentStart && isSegmentEnd ? (
        <div className="flex w-full items-center justify-between gap-0.5">
          <span className={`h-2.5 w-1.5 shrink-0 ${tone.bar} rounded-l-full`} />
          <span className={`h-1.5 flex-1 rounded-sm opacity-40 ${tone.bar}`} />
          <span className={`h-2.5 w-1.5 shrink-0 ${tone.bar} rounded-r-full`} />
        </div>
      ) : isSegmentStart ? (
        <div className="flex w-full items-center gap-0.5">
          <span className={`h-2.5 w-1.5 shrink-0 ${tone.bar} rounded-l-full`} />
          <span className={`h-1.5 flex-1 rounded-sm opacity-40 ${tone.bar}`} />
        </div>
      ) : isSegmentEnd ? (
        <div className="flex w-full items-center justify-between gap-0.5">
          <span className={`h-1.5 flex-1 rounded-sm opacity-40 ${tone.bar}`} />
          <span className={`h-2.5 w-1.5 shrink-0 ${tone.bar} rounded-r-full`} />
        </div>
      ) : (
        <div className="flex w-full items-center">
          <span className={`h-1.5 w-full rounded-sm opacity-40 ${tone.bar}`} />
        </div>
      )}
    </button>
  );
}

function DayCell({
  day,
  periods,
  runs = [],
  today,
  gridStart,
  gridEnd,
  selectedPeriodId,
  onSelectPeriod,
}: {
  key?: React.Key;
  day: PayrollCalendarDay;
  periods: readonly PayrollPeriod[];
  runs?: readonly PayrollRun[];
  today?: string;
  gridStart?: string;
  gridEnd?: string;
  selectedPeriodId?: string;
  onSelectPeriod?: (periodId: string) => void;
}) {
  const selected = Boolean(selectedPeriodId && day.periodIds.includes(selectedPeriodId));
  return (
    <div
      role="gridcell"
      aria-selected={selected}
      className={`min-h-[104px] overflow-hidden border-b border-r border-slate-100 bg-white p-1.5 text-left ${day.isCurrentMonth ? "" : "bg-slate-50/70 text-slate-400"} ${selected ? "bg-indigo-50/20" : ""}`}
    >
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => {
            const period = day.periodSlices.find((slice) => slice.periodId === selectedPeriodId)?.period || day.periodSlices[0]?.period;
            if (period) onSelectPeriod?.(period.id);
          }}
          disabled={day.periodSlices.length === 0}
          aria-label={`${formatDate(day.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${day.isToday ? ", today" : ""}`}
          className={`rounded-md px-1 py-0.5 text-xs font-black tabular-nums ${day.isToday ? "bg-sky-100 text-sky-800" : day.isCurrentMonth ? "text-slate-800" : "text-slate-400"} disabled:cursor-default`}
        >
          {day.dayOfMonth}
        </button>
        {day.periodIds.length > 1 && <span className="text-[9px] font-bold text-slate-400">{day.periodIds.length} periods</span>}
      </div>

      <DayMarkers day={day} compact />
      <div className="mt-1 space-y-0.5">
        {day.periodSlices.length > 1
          ? <button type="button" onClick={() => onSelectPeriod?.(day.periodSlices[0]!.periodId)} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700"><AlertTriangle className="h-2.5 w-2.5" /> Payroll schedule conflict</button>
          : day.periodSlices.map((slice) => (
              <PeriodBar
                key={slice.periodId}
                slice={slice}
                date={day.date}
                periods={periods}
                runs={runs}
                today={today}
                gridStart={gridStart}
                gridEnd={gridEnd}
                selectedPeriodId={selectedPeriodId}
                onSelectPeriod={(period) => onSelectPeriod?.(period.id)}
              />
            ))}
      </div>
      {day.runStatuses.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {day.runStatuses.slice(0, 2).map((run) => <RunStatusBadge key={run.runId || `${run.periodId}-status`} status={run.status} compact />)}
          {day.runStatuses.length > 2 && <span className="text-[9px] font-bold text-slate-400">+${day.runStatuses.length - 2}</span>}
        </div>
      )}
      <IssueImportIndicators day={day} />
    </div>
  );
}

function MobileAgenda({
  days,
  periods,
  runs = [],
  today,
  selectedPeriodId,
  onSelectPeriod,
}: {
  days: PayrollCalendarDay[];
  periods: readonly PayrollPeriod[];
  runs?: readonly PayrollRun[];
  today?: string;
  selectedPeriodId?: string;
  onSelectPeriod?: (periodId: string) => void;
}) {
  const eventDays = days.filter((day) => day.isCurrentMonth && (day.periodSlices.some((slice) => day.date === slice.period.periodStart || day.date === slice.period.periodEnd) || day.isToday || day.cutoffMarkers.length || day.payDateMarkers.length || day.issueSummary || day.importedActivity));
  if (!eventDays.length) return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">No payroll periods or calendar activity in this month.</div>;
  return (
    <ol className="space-y-2" aria-label="Payroll calendar agenda">
      {eventDays.map((day) => (
        <li key={day.date} className={`rounded-xl border bg-white p-3 ${day.isToday ? "border-sky-200 shadow-sm" : "border-slate-200"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black text-slate-900">{formatDate(day.date, { weekday: "short", month: "short", day: "numeric" })}</p>
              <DayMarkers day={day} compact />
            </div>
            <IssueImportIndicators day={day} />
          </div>
          <div className="mt-2 space-y-1.5">
            {day.periodSlices.map((slice) => (
              <PeriodBar
                key={slice.periodId}
                slice={slice}
                date={day.date}
                periods={periods}
                runs={runs}
                today={today}
                selectedPeriodId={selectedPeriodId}
                onSelectPeriod={(period) => onSelectPeriod?.(period.id)}
                mobile
              />
            ))}
          </div>
          {day.runStatuses.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {day.runStatuses.map((run) => <RunStatusBadge key={run.runId || `${run.periodId}-status`} status={run.status} />)}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function PeriodDetailPanel({
  period,
  periods,
  runs,
  entries,
  importBatches,
  automaticDrafts,
  automaticDraft,
  frequencyLabel,
  today,
  onOpenOverview,
  onOpenRun,
}: {
  period?: PayrollPeriod;
  periods: readonly PayrollPeriod[];
  runs: readonly PayrollRun[];
  entries: readonly PayrollEntry[];
  importBatches: readonly PayrollImportBatch[];
  automaticDrafts: readonly AutomaticPayrollDraftRecord[];
  automaticDraft?: AutomaticPayrollDraftRecord;
  frequencyLabel?: string;
  today?: string;
  onOpenOverview?: (period: PayrollPeriod) => void;
  onOpenRun?: (run: PayrollRun, period: PayrollPeriod) => void;
}) {
  if (!period) {
    return (
      <aside className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-xs text-slate-500" aria-label="Payroll period details">
        Select a period on the calendar to see its details.
      </aside>
    );
  }

  const periodRuns = runs.filter((run) => run.periodId === period.id);
  const periodRunIds = new Set(periodRuns.map((run) => run.id));
  const periodEntries = entries.filter((entry) => periodRunIds.has(entry.payrollRunId));
  const workerCount = new Set(periodEntries.map((entry) => entry.workerId).filter(Boolean)).size;
  const gross = periodEntries.reduce((sum, entry) => sum + entry.grossPay, 0);
  const net = periodEntries.reduce((sum, entry) => sum + entry.netPay, 0);
  const projectLabor = periodEntries.reduce((sum, entry) => sum + entry.projectAllocatedCost, 0);
  const adminOverhead = Math.max(0, gross - projectLabor);
  const issueSummary = getIssueSummary(period, { periods, runs, entries, automaticDrafts, automaticDraft, importBatches });
  const importedActivity = getImportedActivity(period, importBatches, periods);
  const locked = isLocked(period, runs);
  const displayState = getPayrollPeriodDisplayState(period, runs, today);

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="payroll-calendar-detail-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Selected period</p>
          <h3 id="payroll-calendar-detail-title" className="mt-1 text-base font-black text-slate-950">{formatDate(period.periodStart)} – {formatDate(period.periodEnd)}</h3>
          <p className="mt-1 text-[10px] text-slate-500">{frequencyLabel ? `${frequencyLabel} · ` : ""}Pay date {period.payDate ? formatDate(period.payDate) : "not set"}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[9px] font-black ${getPayrollPeriodDisplayClass(displayState)}`}>{displayState}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-slate-500">Runs</p><p className="mt-0.5 text-sm font-black text-slate-900">{periodRuns.length}</p></div>
        <div className={`rounded-xl p-2.5 ${issueSummary.blockingCount ? "bg-rose-50" : issueSummary.issueCount ? "bg-amber-50" : "bg-emerald-50"}`}><p className="text-slate-500">Issues</p><p className="mt-0.5 text-sm font-black text-slate-900">{issueSummary.issueCount}</p></div>
      </div>

      {periodEntries.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Payroll period metrics">
          {[
            ["Workers", String(workerCount)],
            ["Gross", money(gross)],
            ["Net", money(net)],
            ["Project labor", money(projectLabor)],
            ["Admin / overhead", money(adminOverhead)],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
              <p className="truncate text-[9px] font-semibold text-slate-500">{label}</p>
              <p className="mt-0.5 truncate text-xs font-black tabular-nums text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-2.5 py-2 text-[10px] text-slate-500">No calculated payroll entries for this period yet.</p>
      )}
      {locked && <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-2 text-[10px] font-semibold text-slate-600"><LockKeyhole className="h-3.5 w-3.5" /> Locked history is read-only.</p>}

      {periodRuns.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Run status</p>
          {periodRuns.map((run) => (
            <div key={run.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-2.5 py-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-700">Payroll run</p>
                <RunStatusBadge status={run.status} />
              </div>
              {onOpenRun && <button type="button" onClick={() => onOpenRun(run, period)} className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50">Open run</button>}
            </div>
          ))}
        </div>
      )}

      {issueSummary.issueCount > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-black text-amber-900"><AlertTriangle className="h-3.5 w-3.5" /> Review issues</p>
          <div className="mt-2 space-y-1 text-[10px] text-amber-950">
            {issueSummary.issues.slice(0, 3).map((issue, index) => <p key={`${issue.code || "issue"}-${index}`}>{issue.message}</p>)}
            {issueSummary.issueCount > 3 && <p className="font-bold">+{issueSummary.issueCount - 3} more issue{issueSummary.issueCount - 3 === 1 ? "" : "s"}</p>}
          </div>
        </div>
      )}

      {importedActivity && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-2 text-[10px] font-semibold text-slate-600">
          <FileSpreadsheet className="h-3.5 w-3.5" /> {importedActivity.batchCount} import batch{importedActivity.batchCount === 1 ? "" : "es"} · {importedActivity.hasCommittedImport ? "committed" : importedActivity.statuses.join(", ")}
        </p>
      )}

      {onOpenOverview && <button type="button" onClick={() => onOpenOverview(period)} className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"><CalendarDays className="h-3.5 w-3.5" /> Open period overview</button>}
    </aside>
  );
}

export const PayrollCalendar: React.FC<PayrollCalendarProps> = ({
  periods,
  runs,
  entries,
  importBatches = [],
  automaticDrafts = [],
  automaticDraft,
  selectedAutomaticDraft,
  selectedPeriodId,
  onSelectPeriod,
  onOpenOverview,
  onOpenRun,
  frequencyLabel,
  schedules,
  className = "",
}) => {
  const today = useMemo(() => getLocalToday(), []);
  const [view, setView] = useState<"periods" | "month">("periods");
  const conflicts = useMemo(() => findPayrollCalendarConflicts(periods), [periods]);
  const actualCurrentPeriod = useMemo(() => selectActualPayrollPeriod(periods, today), [periods, today]);
  const nextUpcomingPeriod = useMemo(() => selectNearestUpcomingPayrollPeriod(periods, today), [periods, today]);
  const initialCursor = useMemo(() => {
    const selected = selectStablePayrollPeriod(periods, selectedPeriodId, today);
    return dateParts(selected?.periodStart || today);
  }, [periods, selectedPeriodId, today]);
  const [cursor, setCursor] = useState(initialCursor);
  const selectedPeriod = useMemo(() => {
    const explicitlySelected = selectedPeriodId ? periods.find((period) => period.id === selectedPeriodId && period.status !== "VOID") : undefined;
    if (explicitlySelected) return explicitlySelected;
    const stable = selectStablePayrollPeriod(periods, undefined, today);
    return stable ? periods.find((period) => period.id === stable.id) : undefined;
  }, [periods, selectedPeriodId, today]);
  const selectedId = selectedPeriod?.id;
  const selectedDraft = selectedAutomaticDraft || automaticDraft;
  const grid = useMemo(() => buildPayrollMonthGrid(cursor.year, cursor.month, {
    periods,
    runs,
    entries,
    importBatches,
    automaticDrafts,
    automaticDraft: selectedDraft,
    today,
    fixedWeeks: true,
  }), [cursor, periods, runs, entries, importBatches, automaticDrafts, selectedDraft, today]);

  return (
    <section className={`space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Payroll calendar</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">Payroll periods</h2>
          <p className="mt-1 text-xs text-slate-500">Current and upcoming payroll stay simple; Month view is available for date-level visualization.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="Payroll calendar view"><button type="button" role="tab" aria-selected={view === "periods"} onClick={() => setView("periods")} className={`rounded-md px-3 py-1.5 text-[10px] font-bold ${view === "periods" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}>Periods</button><button type="button" role="tab" aria-selected={view === "month"} onClick={() => setView("month")} className={`rounded-md px-3 py-1.5 text-[10px] font-bold ${view === "month" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}>Month</button></div>
          {view === "month" && <div className="flex items-center gap-1.5"><button type="button" onClick={() => setCursor((current) => addMonth(current, -1))} aria-label="Previous month" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-3.5 w-3.5" /> Previous</button><button type="button" onClick={() => setCursor(dateParts(today))} className="rounded-lg bg-indigo-600 px-2.5 py-2 text-[10px] font-bold text-white hover:bg-indigo-700">Today</button><button type="button" onClick={() => setCursor((current) => addMonth(current, 1))} aria-label="Next month" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50">Next <ArrowRight className="h-3.5 w-3.5" /></button></div>}
        </div>
      </header>

      {conflicts.find((conflict) => conflict.overlapEnd >= today) && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900"><AlertTriangle className="h-3.5 w-3.5" /><strong>Payroll schedule conflict.</strong><span>Active payroll periods overlap. Review before calculating.</span></div>}
      {view === "month" && !actualCurrentPeriod && <div role="status" className="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs text-sky-950"><strong>No active period today.</strong>{nextUpcomingPeriod ? <> Next: {formatDate(nextUpcomingPeriod.periodStart)} – {formatDate(nextUpcomingPeriod.periodEnd)}.</> : " No upcoming payroll period is scheduled."}</div>}
      {view === "month" && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-indigo-600" /><p className="text-sm font-black text-slate-900">{formatMonth(cursor)}</p>{frequencyLabel && !schedules && <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-slate-500">{frequencyLabel}</span>}</div>
        <div className="flex flex-wrap items-center gap-2 text-[9px] font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> Today</span>
          <span className="inline-flex items-center gap-1 text-rose-700"><Scissors className="h-2.5 w-2.5" /> Cutoff</span>
          <span className="inline-flex items-center gap-1 text-emerald-700"><Banknote className="h-2.5 w-2.5" /> Pay date</span>
          <span className="inline-flex items-center gap-1"><TimerReset className="h-2.5 w-2.5" /> Run status</span>
        </div>
      </div>}

      {view === "periods" ? <PayrollPeriodsOverview periods={periods} runs={runs} entries={entries} importBatches={importBatches} automaticDrafts={automaticDrafts} automaticDraft={selectedDraft} selectedPeriodId={selectedId} frequencyLabel={frequencyLabel} schedules={schedules} today={today} onSelectPeriod={onSelectPeriod} onOpenOverview={onOpenOverview} /> : <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="hidden min-w-0 md:block">
          <div role="grid" aria-label={`Payroll calendar for ${formatMonth(cursor)}`} className="overflow-hidden rounded-xl border border-slate-200">
            <div className="grid grid-cols-7 bg-slate-50" role="row">
              {DAY_LABELS.map((label) => <div key={label} role="columnheader" className="border-b border-slate-200 px-2 py-2 text-center text-[9px] font-black uppercase tracking-wide text-slate-500">{label}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {grid.days.map((day) => <DayCell key={day.date} day={day} periods={periods} runs={runs} today={today} gridStart={grid.gridStart} gridEnd={grid.gridEnd} selectedPeriodId={selectedId} onSelectPeriod={onSelectPeriod} />)}
            </div>
          </div>
        </div>

        <div className="md:hidden">
          <MobileAgenda days={grid.days} periods={periods} runs={runs} today={today} selectedPeriodId={selectedId} onSelectPeriod={onSelectPeriod} />
        </div>

        <PeriodDetailPanel
          period={selectedPeriod}
          periods={periods}
          runs={runs}
          entries={entries}
          importBatches={importBatches}
          automaticDrafts={automaticDrafts}
          automaticDraft={selectedDraft}
          frequencyLabel={selectedPeriod ? payrollPeriodFrequencyLabel(selectedPeriod, schedules || []) : frequencyLabel}
          today={today}
          onOpenOverview={onOpenOverview}
          onOpenRun={onOpenRun}
        />
      </div>}

      {periods.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-xs text-slate-500">No payroll periods yet. The calendar will show generated or imported periods when available.</div>}
    </section>
  );
};

export default PayrollCalendar;
