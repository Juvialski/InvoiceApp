import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, ChevronDown, CircleAlert, Settings2, Users, WalletCards } from "lucide-react";
import type { AttendanceRecord, LeaveRequest, OvertimeRequest, PayrollAdjustment, PayrollEntry, PayrollHoliday, PayrollPeriod, PayrollProjectAllocation, PayrollProjectReference, PayrollRun, ProjectCostCode, ProjectWorkerAssignment, Worker, WorkEntry } from "../../types";
import { selectActualPayrollPeriod, selectNearestUpcomingPayrollPeriod, type PayrollSchedule } from "../../lib/payrollSchedule";
import { findPayrollScheduleVersionGaps, payrollPeriodFrequencyLabel, selectPrimaryPayrollSchedule } from "../../lib/payrollIntegrity";
import { buildAutomaticPayrollDraft } from "../../lib/payrollWorkflow";
import { formatPayrollPeriodLabel, selectStablePayrollPeriod, getPayrollPeriodDisplayState } from "../../utils/payrollCalendar";
import type { PayrollException, RecurringPayrollComponent, WorkerCompensationProfile } from "../../lib/payrollAutomation";
import { appPathForCashTarget, appPathForPayrollRun } from "../../utils/appRouting";
import { buildPayrollSourceRevisionInput, validatePayrollRunSourceRevision } from "../../lib/payrollSourceRevision";
import { BRAND } from "../../config/brand";
import { PayrollPeriods } from "./PayrollPeriods";
import { PayrollRunView } from "./PayrollRunView";
import { WorkersTable } from "./WorkersTable";
import { TimeEntries } from "./TimeEntries";
import { ProjectAssignments } from "./ProjectAssignments";
import { PayrollImportWorkflow } from "./PayrollImportWorkflow";
import { PayrollScheduleSettings } from "./PayrollScheduleSettings";
import { PayrollCalendar } from "./PayrollCalendar";
import { PayrollProfiles } from "./PayrollProfiles";
import { PayrollAdvancedTools } from "./PayrollAdvancedTools";
import { AttendanceWorkspace } from "./AttendanceWorkspace";
import { ActionButton, DisclosureSection, StatusBadge } from "../ui/OperationsUI.tsx";
import type { PayrollImportBatch, PayrollImportRow, PayrollImportTemplate } from "../../lib/payrollImportPersistence";
import type { PayrollMaintenanceAction, PayrollMaintenancePreview, PayrollWorkspaceResetPreview } from "../../lib/payrollMaintenance";
import type { PayrollLifecycleRequest } from "../../lib/payrollLifecycle";
import { useWorkspaceDataPending } from "../../app/AppPermissionContext.tsx";
import type { AppNavigate } from "../../utils/clientNavigation.ts";

export interface PayrollPageV2Props {
  workers: Worker[];
  assignments: ProjectWorkerAssignment[];
  periods: PayrollPeriod[];
  runs: PayrollRun[];
  entries: PayrollEntry[];
  allocations: PayrollProjectAllocation[];
  adjustments?: PayrollAdjustment[];
  workEntries?: WorkEntry[];
  attendanceRecords?: AttendanceRecord[];
  leaveRequests?: LeaveRequest[];
  overtimeRequests?: OvertimeRequest[];
  holidays?: PayrollHoliday[];
  projects: readonly PayrollProjectReference[];
  costCodes?: ProjectCostCode[];
  schedules?: PayrollSchedule[];
  compensationProfiles?: WorkerCompensationProfile[];
  recurringComponents?: RecurringPayrollComponent[];
  payrollImportWorkerIds?: readonly string[];
  departmentManagerWorkerIds?: readonly string[];
  importBatches?: PayrollImportBatch[];
  importTemplates?: PayrollImportTemplate[];
  periodPreparationState?: "NO_SCHEDULE" | "PREPARING" | "SYNCING" | "READY" | "FAILED" | "WAITING_FOR_BOUNDARY";
  onRetryPeriodPreparation?: () => void;
  onSaveWorker: (worker: Worker) => void;
  onSavePeriod: (period: PayrollPeriod) => void | Promise<PayrollPeriod | void>;
  onSaveSchedule?: (schedule: PayrollSchedule) => void | Promise<PayrollSchedule | void>;
  onSaveAttendance?: (record: AttendanceRecord) => void;
  onSaveAttendanceBatch?: (records: AttendanceRecord[]) => void;
  onSaveLeave?: (request: LeaveRequest) => void;
  onSaveOvertime?: (request: OvertimeRequest) => void;
  onSaveHoliday?: (holiday: PayrollHoliday) => void;
  onSaveCompensationProfile?: (profile: WorkerCompensationProfile) => void;
  onSaveRecurringComponent?: (component: RecurringPayrollComponent) => void;
  onSaveAssignment?: (assignment: ProjectWorkerAssignment) => void;
  onSaveWorkEntry?: (entry: WorkEntry) => void;
  onSavePayrollEntry?: (entry: PayrollEntry, allocations: PayrollProjectAllocation[]) => void;
  onUpdateRun?: (run: PayrollRun) => void | Promise<PayrollRun | void>;
  onCreateRun?: (periodId: string) => void;
  onCalculateRun?: (run: PayrollRun) => void | Promise<PayrollRun | void>;
  onStagePayrollImport?: (batch: PayrollImportBatch, rows: PayrollImportRow[], bytes: Uint8Array) => void;
  onSavePayrollImportTemplate?: (template: PayrollImportTemplate) => void;
  onCommitPayrollImport?: (staged: import("../../lib/payrollImportWorkflow").StagedPayrollImport, periodStart: string, periodEnd: string, payDate?: string) => void;
  canManagePayrollSettings?: boolean;
  canManagePayrollMaintenance?: boolean;
  canManageWorkforce?: boolean;
  canManagePayrollSources?: boolean;
  canManagePayrollImports?: boolean;
  onPayrollLifecycle?: (request: PayrollLifecycleRequest) => Promise<void> | void;
  onPreviewPayrollMaintenance?: (action: PayrollMaintenanceAction) => Promise<PayrollMaintenancePreview>;
  onApplyPayrollMaintenance?: (action: PayrollMaintenanceAction, confirmation?: string) => Promise<unknown>;
  onPreviewFactoryReset?: () => Promise<PayrollWorkspaceResetPreview>;
  onApplyFactoryReset?: (confirmation: string) => Promise<unknown>;
  onNavigatePath?: AppNavigate;
  payrollIssues?: readonly PayrollException[];
  selectedPeriodId?: string;
  attendanceDate?: string;
  onSelectedPeriodIdChange?: (periodId: string) => void;
}

type PayrollTab = "overview" | "calendar" | "attendance" | "workers" | "time" | "runs" | "import";
function money(value: number) { return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value || 0); }
function localDateOnly() { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`; }
function periodIdForToday(periods: PayrollPeriod[], today = localDateOnly()) { return selectStablePayrollPeriod(periods.filter((period) => period.status !== "VOID"), undefined, today)?.id || ""; }

type PayrollNextStep = { title: string; detail: string; actionLabel?: string; action: "IMPORT" | "RUNS" | "CASH" | "NONE" };

function payrollNextStep(input: {
  selectedPeriod?: PayrollPeriod;
  selectedRun?: PayrollRun;
  hasInputs: boolean;
  blockingCount: number;
  sourceStale: boolean;
  canImport: boolean;
}): PayrollNextStep {
  if (!input.selectedPeriod) return { title: "Select a payroll period", detail: "Choose the period you are preparing before reviewing payroll inputs.", action: "NONE" };
  if (!input.selectedRun) return { title: "Create a draft payroll run", detail: "Open Payroll Runs to create the draft that will hold this period's review and calculation.", actionLabel: "Open payroll runs", action: "RUNS" };
  if (input.blockingCount > 0) return { title: `Resolve ${input.blockingCount} blocking issue${input.blockingCount === 1 ? "" : "s"}`, detail: "Correct the source problem before calculation or approval can continue.", actionLabel: "Review exceptions", action: "RUNS" };
  if (input.selectedRun.status === "DRAFT" && !input.hasInputs) return { title: "Prepare payroll inputs", detail: "Import reviewed source work or collect approved work before calculation.", actionLabel: input.canImport ? "Import workbook" : "Open payroll runs", action: input.canImport ? "IMPORT" : "RUNS" };
  if (input.selectedRun.status === "DRAFT") return { title: "Review payroll before calculation", detail: "Inspect the linked inputs and calculated basis on the Run surface before calculating.", actionLabel: "Review payroll", action: "RUNS" };
  if (input.selectedRun.status === "CALCULATED" && input.sourceStale) return { title: "Recalculate because sources changed", detail: "The calculated snapshot no longer matches the current payroll sources.", actionLabel: "Review and recalculate", action: "RUNS" };
  if (input.selectedRun.status === "CALCULATED") return { title: "Review calculated payroll", detail: "Confirm gross cost, employee net pay, allocations, and warnings before approval.", actionLabel: "Review payroll", action: "RUNS" };
  if (input.selectedRun.status === "APPROVED") return { title: "Record payment in Cash & Banking", detail: "Payroll is approved and locked. Confirm employee net-pay disbursement through Cash & Banking; it remains separate from Payroll.", actionLabel: "Open Cash & Banking", action: "CASH" };
  if (input.selectedRun.status === "PAID") return { title: "Payroll paid — history locked", detail: "Settlement evidence confirms payment. Review or reverse it through the established Cash & Banking path when authorized.", action: "NONE" };
  return { title: "Payroll history is locked", detail: "This run is voided and remains available as history.", action: "NONE" };
}

export const PayrollPageV2: React.FC<PayrollPageV2Props> = ({ workers, assignments, periods, runs, entries, allocations, adjustments = [], workEntries = [], attendanceRecords = [], leaveRequests = [], overtimeRequests = [], holidays = [], projects, costCodes = [], schedules = [], compensationProfiles = [], recurringComponents = [], payrollImportWorkerIds = [], departmentManagerWorkerIds = [], importBatches = [], importTemplates = [], periodPreparationState = periods.length ? "READY" : schedules.length ? "PREPARING" : "NO_SCHEDULE", onRetryPeriodPreparation, onPreviewFactoryReset, onApplyFactoryReset, onSaveWorker, onSavePeriod, onSaveSchedule, onSaveCompensationProfile, onSaveRecurringComponent, onSaveAssignment, onSaveWorkEntry, onSaveAttendance, onSaveAttendanceBatch, onSaveLeave, onSaveOvertime, onSaveHoliday, onSavePayrollEntry, onUpdateRun, onCreateRun, onCalculateRun, onStagePayrollImport, onSavePayrollImportTemplate, onCommitPayrollImport, canManagePayrollSettings = true, canManagePayrollMaintenance = true, canManageWorkforce = true, canManagePayrollSources = true, canManagePayrollImports = true, onPayrollLifecycle, onPreviewPayrollMaintenance, onApplyPayrollMaintenance, onNavigatePath, payrollIssues = [], selectedPeriodId: controlledSelectedPeriodId, attendanceDate, onSelectedPeriodIdChange }) => {
  const [tab, setTab] = useState<PayrollTab>(() => attendanceDate ? "attendance" : "overview");
  const [localSelectedPeriodId, setLocalSelectedPeriodId] = useState("");
  const selectedPeriodId = controlledSelectedPeriodId ?? localSelectedPeriodId;
  const setSelectedPeriod = (periodId: string) => {
    if (controlledSelectedPeriodId === undefined) setLocalSelectedPeriodId(periodId);
    onSelectedPeriodIdChange?.(periodId);
  };
  const today = localDateOnly();
  const selectablePeriods = useMemo(() => periods.filter((period) => period.status !== "VOID").slice().sort((left, right) => right.periodStart.localeCompare(left.periodStart)), [periods]);
  const selectedPeriod = selectablePeriods.find((period) => period.id === selectedPeriodId);
  const setSelectedPeriodId = setSelectedPeriod;
  const actualCurrentPeriod = selectActualPayrollPeriod<PayrollPeriod>(selectablePeriods, today);
  const nextUpcomingPeriod = selectNearestUpcomingPayrollPeriod<PayrollPeriod>(selectablePeriods, today);
  const currentSuggestedId = useMemo(() => periodIdForToday(periods, today), [periods, today]);
  const periodJumpTarget = actualCurrentPeriod || nextUpcomingPeriod;
  const periodJumpLabel = actualCurrentPeriod ? "Current period" : nextUpcomingPeriod ? "Next period" : "No active period";
  const selectedPeriodRelationship = actualCurrentPeriod?.id === selectedPeriod?.id ? "Current period" : nextUpcomingPeriod?.id === selectedPeriod?.id ? "Next period" : "Selected period";
  useEffect(() => { if (!selectedPeriodId || !selectablePeriods.some((period) => period.id === selectedPeriodId)) setSelectedPeriodId(currentSuggestedId); }, [selectedPeriodId, selectablePeriods, currentSuggestedId]);
  useEffect(() => { if (attendanceDate) setTab("attendance"); }, [attendanceDate]);
  const selectedPeriodRuns = selectedPeriod ? runs.filter((run) => run.periodId === selectedPeriod.id) : [];
  const selectedPeriodEntries = selectedPeriodRuns.flatMap((run) => entries.filter((entry) => entry.payrollRunId === run.id));
  const selectedPeriodAllocations = selectedPeriodEntries.flatMap((entry) => allocations.filter((allocation) => allocation.payrollEntryId === entry.id));
  const selectedPeriodWorkEntries = selectedPeriod ? workEntries.filter((entry) => entry.periodId === selectedPeriod.id) : [];
  const selectedRun = selectedPeriodRuns.find((run) => run.status !== "VOID") || selectedPeriodRuns[0];
  const activeSchedule = selectPrimaryPayrollSchedule(schedules);
  const scheduleVersionGaps = schedules.filter((schedule) => schedule.active && schedule.autoGeneratePeriods).flatMap(findPayrollScheduleVersionGaps);
  const automationMode = activeSchedule?.automationMode || "ASSISTED";
  const hasAutomaticSources = Boolean(workEntries.some((entry) => entry.status === "APPROVED" && entry.periodId === selectedPeriodId) || attendanceRecords.some((record) => record.periodId === selectedPeriodId && record.recordStatus === "CONFIRMED") || overtimeRequests.some((request) => request.periodId === selectedPeriodId && request.status === "APPROVED") || compensationProfiles.length || recurringComponents.length);
  const automationEnabled = automationMode !== "MANUAL" && Boolean(hasAutomaticSources || (schedules.length > 0 && selectedPeriodEntries.length === 0));
  const draft = selectedPeriod && selectedRun && automationEnabled ? buildAutomaticPayrollDraft({ period: selectedPeriod, run: selectedRun, workers, assignments, profiles: compensationProfiles, recurringComponents, workEntries, attendanceRecords, leaveRequests, overtimeRequests, holidays, projects, mode: automationMode }) : undefined;
  const issues = draft?.exceptions || [];
  const blockingIssues = issues.filter((issue) => issue.severity === "BLOCKING");
  const warningIssues = issues.filter((issue) => issue.severity === "WARNING");
  const selectedRunSourceFreshness = selectedPeriod && selectedRun?.status === "CALCULATED"
    ? validatePayrollRunSourceRevision({
      run: selectedRun,
      period: selectedPeriod,
      sourceInput: buildPayrollSourceRevisionInput(selectedPeriod, {
        workers,
        attendanceRecords,
        leaveRequests,
        overtimeRequests,
        holidays,
        workEntries,
        compensationProfiles,
        assignments,
        recurringComponents,
        projects,
      }),
    })
    : undefined;
  const nextStep = payrollNextStep({ selectedPeriod, selectedRun, hasInputs: Boolean(selectedPeriodWorkEntries.length || selectedPeriodEntries.length), blockingCount: blockingIssues.length, sourceStale: Boolean(selectedRunSourceFreshness?.stale), canImport: canManagePayrollImports });
  const gross = selectedPeriodEntries.reduce((sum, entry) => sum + entry.grossPay, 0);
  const projectLabor = selectedPeriodEntries.reduce((sum, entry) => sum + entry.projectAllocatedCost, 0);
  const overhead = Math.max(0, gross - projectLabor);
  const activeWorkers = workers.filter((worker) => worker.active).length;
  const readyWorkers = Math.max(0, activeWorkers - new Set(blockingIssues.map((issue) => issue.workerId).filter(Boolean)).size);
  const selectedIndex = selectablePeriods.findIndex((period) => period.id === selectedPeriodId);
  const previousPeriod = selectablePeriods[selectedIndex + 1];
  const nextPeriod = selectablePeriods[selectedIndex - 1];
  const workspaceDataPending = useWorkspaceDataPending();
  const isHydrating = workspaceDataPending && !periods.length && !workers.length;
  const navigatePeriod = (period?: PayrollPeriod) => { if (!period) return; setSelectedPeriodId(period.id); setTab("overview"); };
  const openNextStep = () => {
    if (nextStep.action === "IMPORT") { setTab("import"); return; }
    if (nextStep.action === "CASH" && selectedRun) {
      onNavigatePath?.(appPathForCashTarget("PAYROLL", selectedRun.id, appPathForPayrollRun(selectedRun.id)));
      return;
    }
    if (nextStep.action === "RUNS") setTab("runs");
  };
  const payrollTabButton = (value: PayrollTab, label: string, accessibleLabel = label) => <button key={value} type="button" onClick={() => setTab(value)} aria-label={`Open ${accessibleLabel}`} title={accessibleLabel} aria-current={tab === value ? "page" : undefined} className={"inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold " + (tab === value ? "bg-indigo-600 text-white" : "hqs-secondary-text hover:bg-slate-50")}>{label}</button>;

  return <div className="space-y-5" data-tour="payroll-overview">
    <section className="hqs-surface rounded-xl p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><h1 className="hqs-primary-text text-2xl font-black sm:text-[1.75rem]">Payroll &amp; labor</h1><p className="hqs-secondary-text mt-1 max-w-2xl text-xs leading-5">Review this pay period. Approval, payment, and finalized history stay protected.</p></div>
        <label className="sm:min-w-[280px]"><span className="sr-only">Jump to period</span><span className="relative block"><select aria-label="Jump to period" value={selectedPeriodId} onChange={(event) => { setSelectedPeriodId(event.target.value); setTab("overview"); }} className="field-input appearance-none pr-8"><option value="">No period yet</option>{selectablePeriods.map((period) => <option key={period.id} value={period.id}>{period.periodStart} – {period.periodEnd} · {getPayrollPeriodDisplayState(period, runs, today)}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /></span></label>
      </div>
      {selectedPeriod && <div className="hqs-surface-muted mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg p-2.5"><div><p className="hqs-primary-text text-xs font-bold">{selectedPeriodRelationship} · {payrollPeriodFrequencyLabel(selectedPeriod, schedules)}</p><p className="hqs-secondary-text text-xs">Pay date {selectedPeriod.payDate || "manual"}</p></div><div className="flex items-center gap-1.5"><button type="button" onClick={() => navigatePeriod(previousPeriod)} disabled={!previousPeriod} className="hqs-control hqs-focus-ring inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"><ArrowLeft className="h-3 w-3" />Previous</button><button type="button" onClick={() => navigatePeriod(periodJumpTarget)} disabled={!periodJumpTarget} className="hqs-action-button inline-flex min-h-9 items-center rounded-lg bg-indigo-600 px-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{periodJumpLabel}</button><button type="button" onClick={() => navigatePeriod(nextPeriod)} disabled={!nextPeriod} className="hqs-control hqs-focus-ring inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50">Next<ArrowRight className="h-3 w-3" /></button></div></div>}
    </section>
    {isHydrating && <div role="status" aria-label="Loading payroll details" className="hqs-surface-muted flex min-h-10 items-center gap-2 rounded-lg px-3 py-2"><span aria-hidden="true" className="hqs-border h-3.5 w-3.5 animate-pulse rounded-full border-2" /><span className="hqs-secondary-text text-xs font-semibold">Loading payroll details…</span></div>}
    {!isHydrating && !selectedPeriod && periodPreparationState !== "READY" && <div role={periodPreparationState === "FAILED" || periodPreparationState === "WAITING_FOR_BOUNDARY" ? "alert" : "status"} className={`flex items-start gap-3 rounded-2xl p-4 text-sm ${periodPreparationState === "FAILED" ? "border border-rose-200 bg-rose-50 text-rose-900" : periodPreparationState === "NO_SCHEDULE" ? "border border-slate-200 bg-white text-slate-700" : "border border-amber-200 bg-amber-50 text-amber-900"}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0"><p className="font-black">{periodPreparationState === "FAILED" ? "Payroll periods could not be prepared." : periodPreparationState === "NO_SCHEDULE" ? "Set up payroll schedule" : periodPreparationState === "SYNCING" ? "Syncing your payroll calendar…" : periodPreparationState === "WAITING_FOR_BOUNDARY" ? "Payroll calendar is waiting for a valid period" : "Preparing your payroll calendar…"}</p><p className="mt-1 leading-5">{periodPreparationState === "FAILED" ? "The schedule is still available. Retry calendar preparation when the workspace connection is ready." : periodPreparationState === "NO_SCHEDULE" ? `An active schedule is required before ${BRAND.productName} can create the payroll calendar.` : periodPreparationState === "SYNCING" ? "Generated periods are being persisted and reloaded from Supabase. The calendar becomes durable once syncing finishes." : periodPreparationState === "WAITING_FOR_BOUNDARY" ? "Your automatic payroll schedule did not produce any payroll period yet. The saved recurrence may be invalid or unable to start. Open Payroll Schedule settings to correct the recurrence, then retry calendar preparation." : `${BRAND.productName} is generating a bounded period horizon. This does not depend on having workers yet.`}</p>{(periodPreparationState === "FAILED" || periodPreparationState === "WAITING_FOR_BOUNDARY") && onRetryPeriodPreparation && <button type="button" onClick={onRetryPeriodPreparation} className="mt-3 rounded-xl bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800">Retry</button>}</div></div>}
    {scheduleVersionGaps.length > 0 && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" /><div className="min-w-0"><p className="font-black">Payroll schedule has an uncovered date range</p><p className="mt-1 leading-5">The automatic recurrence does not cover {scheduleVersionGaps[0]!.gapStart} – {scheduleVersionGaps[0]!.gapEnd}. Review Payroll Schedule settings before creating or approving payroll for this range.</p></div></div>}

    {selectedPeriod && <div data-payroll-review-state="true" className="flex flex-wrap gap-2"><StatusBadge tone="success">Ready to review · {readyWorkers} workers</StatusBadge><StatusBadge tone={blockingIssues.length ? "danger" : "neutral"}>Blocking issues · {blockingIssues.length}</StatusBadge><StatusBadge tone={warningIssues.length ? "warning" : "neutral"}>Warnings · {warningIssues.length}</StatusBadge></div>}
    {selectedPeriod && issues.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black text-amber-950">{blockingIssues.length ? "Review issues before approval" : "A few warnings need review"}</p><p className="mt-1 text-xs text-amber-900">Correct source data or confirm the warning before the run is finalized.</p></div><button type="button" onClick={() => setTab("runs")} className="rounded-xl bg-amber-700 px-3 py-2 text-xs font-bold text-white">Review {issues.length} issue{issues.length === 1 ? "" : "s"}</button></div><div className="mt-3 grid gap-2 md:grid-cols-2">{issues.slice(0, 4).map((issue, index) => <div key={`${issue.code}-${issue.workerId || "workspace"}-${index}`} className="flex items-start gap-2 rounded-xl bg-white/80 p-3 text-xs"><CircleAlert className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${issue.severity === "BLOCKING" ? "text-rose-600" : "text-amber-600"}`} /><div><p className="font-bold text-slate-800">{issue.severity === "BLOCKING" ? "Needs attention" : "Warning"}</p><p className="mt-0.5 text-slate-600">{issue.message}</p></div></div>)}</div></section>}
    {tab === "overview" && <PayrollOverviewCard nextStep={nextStep} onAction={openNextStep} />}
    <nav aria-label="Payroll workflow navigation" className="hqs-surface flex min-w-0 gap-1 overflow-x-auto rounded-lg p-1.5" data-payroll-navigation="true">
      <div data-payroll-navigation-group="overview" role="group" aria-label="Overview" className="flex shrink-0 items-center gap-1">{payrollTabButton("overview", "Overview", "Payroll overview")}</div>
      <div data-payroll-navigation-group="people" role="group" aria-label="People" className="flex shrink-0 items-center gap-1">{payrollTabButton("workers", "People", "People and assignments")}</div>
      <div data-payroll-navigation-group="attendance-time" role="group" aria-label="Attendance &amp; Time" className="flex shrink-0 items-center gap-1">{payrollTabButton("calendar", "Calendar", "Payroll calendar")}{payrollTabButton("attendance", "Attendance", "Attendance")}{payrollTabButton("time", "Time" + (selectedPeriodWorkEntries.length ? " (" + selectedPeriodWorkEntries.length + ")" : ""), "Time entries")}</div>
      <div data-payroll-navigation-group="payroll-runs" role="group" aria-label="Payroll Runs" className="flex shrink-0 items-center gap-1">{payrollTabButton("runs", "Runs" + (selectedPeriodRuns.length ? " (" + selectedPeriodRuns.length + ")" : ""), "Payroll runs")}</div>
      <div data-payroll-navigation-group="imports-setup" role="group" aria-label="Imports &amp; Setup" className="flex shrink-0 items-center gap-1">{payrollTabButton("import", "Setup", "Payroll imports and setup")}</div>
    </nav>
    <div data-payroll-period-summary="true"><DisclosureSection title="Payroll period summary" description="Worker count and selected-period pay totals.">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Metric icon={<Users className="h-4 w-4 text-indigo-600" />} value={activeWorkers} loading={isHydrating} label="Active workers" /><Metric icon={<CalendarDays className="h-4 w-4 text-indigo-600" />} value={actualCurrentPeriod ? `${actualCurrentPeriod.periodStart} – ${actualCurrentPeriod.periodEnd}` : "No active period"} secondary={!actualCurrentPeriod && nextUpcomingPeriod ? `Next: ${formatPayrollPeriodLabel(nextUpcomingPeriod)}` : undefined} loading={isHydrating} label="Current period" small /><Metric icon={<WalletCards className="h-4 w-4 text-violet-600" />} value={money(gross)} loading={isHydrating} label="Estimated gross" /><Metric icon={<WalletCards className="h-4 w-4 text-emerald-600" />} value={money(projectLabor)} loading={isHydrating} label="Project labor" /><Metric icon={<WalletCards className="h-4 w-4 text-slate-600" />} value={money(overhead)} loading={isHydrating} label="Admin / overhead" /></div>
    </DisclosureSection></div>
    {tab === "overview" && <DisclosureSection title="Payroll settings and automation" description="Manage schedule, calculation mode, and administrative maintenance.">
      <div className="space-y-4"><PayrollScheduleSettings schedule={activeSchedule} periods={periods} canManage={canManagePayrollSettings} onSave={onSaveSchedule || (() => undefined)} /><div className="rounded-xl border hqs-border hqs-surface p-4"><div className="flex items-center gap-2"><Settings2 className="h-4 w-4 hqs-accent-text" /><h3 className="text-sm font-black">Automation mode</h3></div><p className="hqs-secondary-text mt-2 text-xs leading-5">Assisted mode is the recommended starting point. It combines work entries, effective compensation, assignments, recurring components, and safe import context. Approval and payment remain human-controlled.</p><span className="mt-3 inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700">{automationMode} · audit snapshots on calculate</span></div><PayrollAdvancedTools schedules={schedules} periods={periods} runs={runs} entries={entries} allocations={allocations} adjustments={adjustments} workEntries={workEntries} importBatches={importBatches} canManageMaintenance={canManagePayrollMaintenance} onPreview={onPreviewPayrollMaintenance} onApply={onApplyPayrollMaintenance} /></div>
    </DisclosureSection>}    {tab === "workers" && <div className="space-y-4"><PayrollProfiles workers={workers} projects={projects} profiles={compensationProfiles} components={recurringComponents} payrollEntries={entries} payrollRuns={runs} periods={periods} onSaveProfile={onSaveCompensationProfile || (() => undefined)} onSaveComponent={onSaveRecurringComponent || (() => undefined)} onPayrollLifecycle={onPayrollLifecycle} canManageWorkforce={canManageWorkforce} /><WorkersTable workers={workers} projects={projects} assignments={assignments} lifecycleData={{ attendanceRecords, leaveRequests, overtimeRequests, workEntries, payrollEntries: entries, payrollRuns: runs, periods, compensationProfiles, recurringComponents, payrollImportWorkerIds, departmentManagerWorkerIds }} onSave={onSaveWorker} onPayrollLifecycle={onPayrollLifecycle} canManageWorkforce={canManageWorkforce} />{onSaveAssignment && <ProjectAssignments assignments={assignments} workers={workers} projects={projects} workEntries={workEntries} overtimeRequests={overtimeRequests} payrollEntries={entries} allocations={allocations} onSave={onSaveAssignment} onPayrollLifecycle={onPayrollLifecycle} canManageWorkforce={canManageWorkforce} />}<PayrollPeriods periods={periods} runs={runs} schedules={schedules} onSave={onSavePeriod} canManage={canManagePayrollSources} /></div>}
    {tab === "time" && (onSaveWorkEntry ? <TimeEntries entries={workEntries} workers={workers} projects={projects} periods={periods} assignments={assignments} runs={runs} selectedPeriodId={selectedPeriodId} onSave={onSaveWorkEntry} onPayrollLifecycle={onPayrollLifecycle} canManagePayrollSources={canManagePayrollSources} /> : <Empty label="Time entry persistence is not available in this workspace." />)}
    {tab === "runs" && <PayrollRunView runs={runs} periods={periods} entries={entries} allocations={allocations} workers={workers} projects={projects} costCodes={costCodes} workEntries={workEntries} assignments={assignments} selectedPeriodId={selectedPeriodId} onSaveEntry={onSavePayrollEntry} onUpdateRun={onUpdateRun} onCreateRun={onCreateRun} onCalculateRun={onCalculateRun} onNavigatePath={onNavigatePath} payrollIssues={issues.length ? issues : payrollIssues} sourceFreshness={selectedRunSourceFreshness} />}
    {tab === "import" && (canManagePayrollImports && onStagePayrollImport && onSavePayrollImportTemplate && onCommitPayrollImport ? <PayrollImportWorkflow workers={workers} projects={projects} periods={periods} selectedPeriodId={selectedPeriodId} batches={importBatches} templates={importTemplates} onStage={onStagePayrollImport} onSaveTemplate={onSavePayrollImportTemplate} onCommit={onCommitPayrollImport} /> : <Empty label="Payroll import management requires payroll import and payroll management permission." />)}
    {selectedPeriodRuns.some((run) => ["APPROVED", "PAID", "VOID"].includes(run.status)) && <p className="text-[10px] text-slate-500">This period contains a locked run. Approved, paid, or void run data is read-only.</p>}
  </div>;
};

function Metric({ icon, value, secondary, label, small = false, loading = false }: { icon: React.ReactNode; value: React.ReactNode; secondary?: React.ReactNode; label: string; small?: boolean; loading?: boolean }) { return <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5"><div>{icon}</div><p className={`${small ? "text-[11px] sm:text-xs leading-snug break-words" : "text-lg sm:text-xl truncate"} mt-3 font-black tabular-nums`}>{loading ? <span className="inline-block h-6 w-16 animate-pulse rounded bg-slate-200 align-middle" /> : value}</p>{secondary && !loading && <p className="mt-1 break-words text-[10px] font-semibold leading-4 text-indigo-700">{secondary}</p>}<p className="text-[10px] font-semibold text-slate-500">{label}</p></div>; }
function PayrollOverviewCard({ nextStep, onAction }: { nextStep: PayrollNextStep; onAction: () => void }) {
  return <section data-payroll-next-step="true" className="hqs-surface-raised rounded-xl p-3.5" aria-label="Payroll normal cycle next step">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="hqs-accent-text text-xs font-semibold">Normal cycle</p><h3 className="mt-0.5 text-base font-bold">Next step</h3></div>{nextStep.actionLabel && <ActionButton size="sm" variant="primary" label={nextStep.actionLabel} onClick={onAction} />}</div>
    <div className="hqs-surface-muted mt-2 rounded-lg p-3" role="status"><h4 className="hqs-primary-text text-sm font-bold">{nextStep.title}</h4><p className="hqs-secondary-text mt-0.5 text-xs leading-5">{nextStep.detail}</p></div>
    <p className="hqs-secondary-text mt-2 text-xs leading-5">Approval and payment stay separate; record payment through Cash &amp; Banking.</p>
  </section>;
}
function Empty({ label }: { label: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">{label}</div>; }
