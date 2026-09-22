import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, Clock3, HardHat, LockKeyhole } from "lucide-react";
import type { PayrollEntry, PayrollPeriod, PayrollProjectAllocation, PayrollProjectReference, PayrollRun, ProjectCostCode, ProjectWorkerAssignment, Worker, WorkEntry } from "../../types";
import { validatePayrollProjectAllocations } from "../../lib/payrollCalculation";
import { payrollNetPayBasis } from "../../lib/financialSettlement.ts";
import { FinancialSettlementCard } from "../FinancialSettlementCard.tsx";
import { PayrollEntryForm } from "./PayrollEntryForm";
import { useAppPermissions } from "../../app/AppPermissionContext.tsx";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { appPathForCashTarget, appPathForPayrollRun } from "../../utils/appRouting.ts";
import type { PayrollException } from "../../lib/payrollAutomation.ts";
import type { PayrollSourceRevisionValidationResult } from "../../lib/payrollSourceRevision.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";

interface PayrollRunViewProps {
  runs: PayrollRun[];
  periods: PayrollPeriod[];
  entries: PayrollEntry[];
  allocations: PayrollProjectAllocation[];
  workers: Worker[];
  projects?: readonly PayrollProjectReference[];
  costCodes?: ProjectCostCode[];
  workEntries?: WorkEntry[];
  assignments?: ProjectWorkerAssignment[];
  selectedPeriodId: string;
  onCreateRun?: (periodId: string) => void;
  onSaveEntry?: (entry: PayrollEntry, allocations: PayrollProjectAllocation[]) => void;
  onUpdateRun?: (run: PayrollRun) => void | Promise<PayrollRun | void>;
  onCalculateRun?: (run: PayrollRun) => void | Promise<PayrollRun | void>;
  onNavigatePath?: AppNavigate;
  payrollIssues?: readonly Pick<PayrollException, "severity" | "message">[];
  sourceFreshness?: PayrollSourceRevisionValidationResult;
}

function money(value: number) { return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value || 0); }
function isLocked(status: PayrollRun["status"]) { return status === "APPROVED" || status === "PAID" || status === "VOID"; }
function statusStyle(status: PayrollRun["status"]) { if (status === "PAID") return "bg-indigo-50 text-indigo-700"; if (status === "APPROVED") return "bg-emerald-50 text-emerald-700"; if (status === "CALCULATED") return "bg-violet-50 text-violet-700"; if (status === "VOID") return "bg-slate-100 text-slate-500"; return "bg-amber-50 text-amber-800"; }
function errorText(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }

export const PayrollRunView: React.FC<PayrollRunViewProps> = ({ runs, periods, entries, allocations, workers, projects = [], costCodes = [], workEntries = [], assignments = [], selectedPeriodId, onCreateRun, onSaveEntry, onUpdateRun, onCalculateRun, onNavigatePath, payrollIssues = [], sourceFreshness }) => {
  const [message, setMessage] = useState<{ tone: "error" | "info" | "success"; text: string } | null>(null);
  const [calculatingRunId, setCalculatingRunId] = useState<string | null>(null);
  const permissions = useAppPermissions();
  const canManagePayroll = hasPermission(permissions, PERMISSION_KEYS.payrollWrite);
  const canApprovePayroll = hasPermission(permissions, PERMISSION_KEYS.payrollApprove);
  const period = periods.find((item) => item.id === selectedPeriodId);
  const periodRuns = useMemo(() => selectedPeriodId ? runs.filter((run) => run.periodId === selectedPeriodId) : [], [runs, selectedPeriodId]);
  const editableRuns = periodRuns.filter((run) => run.status === "DRAFT" || run.status === "CALCULATED");

  const calculateRun = async (run: PayrollRun) => {
    const runPeriod = periods.find((item) => item.id === run.periodId);
    if (!runPeriod || runPeriod.status === "VOID") { setMessage({ tone: "error", text: "This run has no valid payroll period." }); return; }
    const linkedWork = workEntries.filter((entry) => entry.periodId === run.periodId);
    const invalidWork = linkedWork.filter((entry) => entry.workDate < runPeriod.periodStart || entry.workDate > runPeriod.periodEnd || entry.status === "VOID");
    const unlinkedWork = workEntries.filter((entry) => !entry.periodId && entry.workDate >= runPeriod.periodStart && entry.workDate <= runPeriod.periodEnd);
    if (unlinkedWork.length || invalidWork.length) {
      const count = unlinkedWork.length + invalidWork.length;
      setMessage({ tone: "error", text: `${count} time entr${count === 1 ? "y is" : "ies are"} missing a valid period/date link. Fix the time entries before calculating.` });
      return;
    }
    if (!canManagePayroll || !onCalculateRun) { setMessage({ tone: "error", text: "Payroll calculation requires payroll management permission." }); return; }
    if (calculatingRunId) return;
    setCalculatingRunId(run.id);
    setMessage({ tone: "info", text: "Calculating payroll…" });
    try {
      await onCalculateRun(run);
      setMessage({ tone: "success", text: "Payroll calculation completed. Review the refreshed calculated snapshot before approval." });
    } catch (error) {
      setMessage({ tone: "error", text: errorText(error, "Payroll calculation failed. Review the inputs and try again.") });
    } finally {
      setCalculatingRunId(null);
    }
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-tour="payroll-runs">
    <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-black">Payroll runs</h3><p className="mt-1 text-xs text-slate-500">Review inputs, calculate a snapshot, confirm approval, then record employee net-pay disbursement through Cash &amp; Banking.</p></div><div className="flex flex-wrap gap-2">{canManagePayroll && onSaveEntry && <PayrollEntryForm runs={editableRuns} workers={workers} projects={projects} costCodes={costCodes} onSave={onSaveEntry} />}{canManagePayroll && onCreateRun && period && <button onClick={() => onCreateRun(period.id)} className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><HardHat className="mr-1 inline h-3.5 w-3.5" /> Create run</button>}</div></div>
    {message && <div role={message.tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 border-b px-5 py-3 text-xs ${message.tone === "error" ? "border-rose-100 bg-rose-50 text-rose-800" : message.tone === "success" ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-indigo-100 bg-indigo-50 text-indigo-800"}`}><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{message.text}</div>}
    {!period && <div className="p-10 text-center"><Clock3 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">Select a payroll period</p><p className="mt-1 text-xs text-slate-500">Payroll history and lifecycle actions are scoped to an explicit period.</p></div>}
    {period && !periodRuns.length && <div className="p-10 text-center"><HardHat className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No runs for {period.periodStart} – {period.periodEnd}.</p><p className="mt-1 text-xs text-slate-500">Create a draft run, add linked time, then review and calculate it.</p></div>}
    {periodRuns.length > 0 && <div className="divide-y divide-slate-100">{periodRuns.map((run) => <RunCard key={run.id} run={run} period={period!} entries={entries.filter((entry) => entry.payrollRunId === run.id)} allocations={allocations} workers={workers} projects={projects} onCalculate={() => void calculateRun(run)} calculating={calculatingRunId === run.id} onUpdateRun={onUpdateRun} onNavigatePath={onNavigatePath} canManagePayroll={canManagePayroll} canApprovePayroll={canApprovePayroll} payrollIssues={payrollIssues} sourceFreshness={sourceFreshness} />)}</div>}
  </section>;
};

interface RunCardProps {
  run: PayrollRun;
  period: PayrollPeriod;
  entries: PayrollEntry[];
  allocations: PayrollProjectAllocation[];
  workers: Worker[];
  projects: readonly PayrollProjectReference[];
  onCalculate: () => void;
  calculating: boolean;
  onUpdateRun?: (run: PayrollRun) => void | Promise<PayrollRun | void>;
  onNavigatePath?: AppNavigate;
  canManagePayroll: boolean;
  canApprovePayroll: boolean;
  payrollIssues: readonly Pick<PayrollException, "severity" | "message">[];
  sourceFreshness?: PayrollSourceRevisionValidationResult;
}

const RunCard: React.FC<RunCardProps> = ({ run, period, entries, allocations, workers, projects, onCalculate, calculating, onUpdateRun, onNavigatePath, canManagePayroll, canApprovePayroll, payrollIssues, sourceFreshness }) => {
  const permissions = useAppPermissions();
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalResult, setApprovalResult] = useState<string | null>(null);
  const approvalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const canSettlePayroll = hasPermission(permissions, PERMISSION_KEYS.cashReconcile) && hasPermission(permissions, PERMISSION_KEYS.payrollApprove);
  const runAllocations = allocations.filter((allocation) => entries.some((entry) => entry.id === allocation.payrollEntryId));
  const total = entries.reduce((sum, entry) => sum + entry.grossPay, 0);
  const netPay = payrollNetPayBasis(entries);
  const allocated = runAllocations.reduce((sum, allocation) => sum + allocation.allocationAmount, 0);
  const completeness = validatePayrollProjectAllocations(total, runAllocations);
  const locked = isLocked(run.status);
  const blockingIssues = payrollIssues.filter((issue) => issue.severity === "BLOCKING");
  const warningIssues = payrollIssues.filter((issue) => issue.severity === "WARNING");
  const approvalBlocked = blockingIssues.length > 0 || Boolean(sourceFreshness?.stale);
  const projectTotals: Record<string, number> = runAllocations.reduce((result, allocation) => { result[allocation.projectId] = (result[allocation.projectId] || 0) + allocation.allocationAmount; return result; }, {} as Record<string, number>);

  useEffect(() => {
    if (!approvalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !approvalBusy) {
        setApprovalOpen(false);
        approvalTriggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [approvalOpen, approvalBusy]);

  const closeApproval = () => {
    if (approvalBusy) return;
    setApprovalOpen(false);
    approvalTriggerRef.current?.focus();
  };

  const confirmApproval = async () => {
    if (!onUpdateRun || approvalBusy || run.status !== "CALCULATED" || approvalBlocked) return;
    setApprovalBusy(true);
    setApprovalError(null);
    setApprovalResult(null);
    try {
      await onUpdateRun({ ...run, status: "APPROVED" });
      setApprovalOpen(false);
      setApprovalResult("Payroll approved. Record payment in Cash & Banking.");
      approvalTriggerRef.current?.focus();
    } catch (error) {
      setApprovalError(errorText(error, "Payroll approval failed. Review the calculated result and try again."));
    } finally {
      setApprovalBusy(false);
    }
  };

  return <div className="px-4 py-5 sm:px-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="flex min-w-0 items-start gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${run.status === "APPROVED" || run.status === "PAID" ? "bg-emerald-50 text-emerald-700" : run.status === "VOID" ? "bg-slate-100 text-slate-400" : "bg-violet-50 text-violet-700"}`}>{locked ? <LockKeyhole className="h-4 w-4" /> : run.status === "DRAFT" ? <Clock3 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black">{period.periodStart} – {period.periodEnd}</p><span className={`rounded-full px-2 py-1 text-[10px] font-black ${statusStyle(run.status)}`}>{run.status}</span></div><p className="mt-1 text-[10px] text-slate-500">Payroll run · created {run.createdAt.slice(0, 10)}{run.approvedAt ? ` · approved ${run.approvedAt.slice(0, 10)}` : ""}{run.paidAt ? ` · paid ${run.paidAt.slice(0, 10)}` : ""}</p></div></div><div className="flex flex-wrap items-center gap-2 xl:justify-end">{canManagePayroll && <button type="button" onClick={onCalculate} disabled={calculating || (run.status !== "DRAFT" && run.status !== "CALCULATED")} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-2 text-[10px] font-bold text-violet-800 disabled:cursor-not-allowed disabled:opacity-40"><Calculator className="h-3.5 w-3.5" /> {calculating ? "Calculating…" : run.status === "CALCULATED" ? "Recalculate" : "Calculate"}</button>}{canApprovePayroll && <button ref={approvalTriggerRef} type="button" onClick={() => { setApprovalError(null); setApprovalOpen(true); }} disabled={run.status !== "CALCULATED" || !onUpdateRun || approvalBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="h-3.5 w-3.5" /> Review approval</button>}</div></div>
    {sourceFreshness?.stale && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900"><p className="font-black">Recalculation required</p><p className="mt-1">Payroll sources changed after calculation. Recalculate this run before approval.</p></div>}
    {approvalResult && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{approvalResult}</p>}
    {approvalOpen && <section role="dialog" aria-labelledby={`payroll-approval-${run.id}`} className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Approval confirmation</p><h4 id={`payroll-approval-${run.id}`} className="mt-1 text-base font-black text-emerald-950">Review approval</h4><p className="mt-1 text-xs leading-5 text-emerald-900">This confirms the calculated Payroll snapshot for {period.periodStart} – {period.periodEnd}. Approval locks normal Payroll source/result edits; payment remains a separate Cash &amp; Banking action.</p></div><button type="button" autoFocus onClick={closeApproval} disabled={approvalBusy} className="rounded-lg px-2 py-1 text-xs font-bold text-emerald-800 disabled:opacity-40">Cancel</button></div><div className="mt-4 grid gap-2 sm:grid-cols-4"><Summary label="Workers / entries" value={`${new Set(entries.map((entry) => entry.workerId)).size} / ${entries.length}`} /><Summary label="Gross cost" value={money(total)} /><Summary label="Employee net pay" value={money(netPay)} /><Summary label="Project allocated" value={money(allocated)} /></div><div className="mt-2 grid gap-2 sm:grid-cols-2"><Summary label="Unallocated project cost" value={money(completeness.unallocatedAmount)} warning={completeness.unallocatedAmount > 0} /><Summary label="Calculated status" value={run.status} /></div>{blockingIssues.length > 0 && <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900"><p className="font-black">Approval blocked</p>{blockingIssues.slice(0, 4).map((issue, index) => <p key={`${issue.message}-${index}`} className="mt-1">{issue.message}</p>)}</div>}{sourceFreshness?.stale && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">Recalculation required before approval.</p>}{warningIssues.length > 0 && <div role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p className="font-black">Warnings to review</p>{warningIssues.slice(0, 4).map((issue, index) => <p key={`${issue.message}-${index}`} className="mt-1">{issue.message}</p>)}</div>}{approvalError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{approvalError}</p>}<div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={closeApproval} disabled={approvalBusy} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-900 disabled:opacity-40">Cancel</button><button type="button" onClick={() => void confirmApproval()} disabled={approvalBusy || approvalBlocked || run.status !== "CALCULATED" || !onUpdateRun} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{approvalBusy ? "Approving…" : "Confirm approval"}</button></div></section>}
    <div className="mt-4 grid gap-3 sm:grid-cols-4"><Summary label="Gross cost" value={money(total)} /><Summary label="Employee net pay" value={money(netPay)} /><Summary label="Project allocated cost" value={money(allocated)} /><Summary label="Unallocated project cost" value={money(completeness.unallocatedAmount)} warning={completeness.unallocatedAmount > 0} /></div>
    {(run.status === "APPROVED" || run.status === "PAID") && <div className="mt-4"><FinancialSettlementCard targetType="PAYROLL" targetId={run.id} compact canReverse={canSettlePayroll} canRecordPayment={canSettlePayroll} recordPaymentPath={appPathForCashTarget("PAYROLL", run.id, appPathForPayrollRun(run.id))} lifecycleStatus={run.status} targetLabel={`Payroll Period ${period.periodStart} – ${period.periodEnd}`} onNavigatePath={onNavigatePath} /></div>}
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"><div><div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Allocation completeness</p><p className="text-[10px] font-bold text-slate-600">{completeness.allocationPercentage.toFixed(2)}% allocated</p></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${completeness.unallocatedAmount > 0 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, completeness.allocationPercentage)}%` }} /></div>{completeness.unallocatedAmount > 0 && <p className="mt-2 flex items-start gap-1.5 text-[10px] text-amber-800"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />Labor is not fully allocated to projects; it remains visible as unallocated.</p>}<div className="mt-3 space-y-1">{Object.entries(projectTotals).map(([projectId, amount]) => <ProjectLine key={projectId} project={projects.find((item) => item.id === projectId)} amount={amount} />)}</div></div><History entries={entries} allocations={runAllocations} workers={workers} /></div>
    {locked && <p className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-500"><LockKeyhole className="h-3 w-3" /> Entry and allocation edits are disabled after approval, payment, or voiding. Cash reconciliation only links disbursement evidence; it does not unlock or recalculate payroll.</p>}
  </div>;
};

const ProjectLine: React.FC<{ project?: PayrollProjectReference; amount: number }> = ({ project, amount }) => <div className="flex justify-between gap-3 text-[10px]"><span className="truncate text-slate-600">{project ? `${project.projectCode} · ${project.projectName}` : "Unknown project"}</span><span className="font-bold tabular-nums">{money(amount)}</span></div>;
function History({ entries, allocations, workers }: { entries: PayrollEntry[]; allocations: PayrollProjectAllocation[]; workers: Worker[] }) { return <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-500">Payroll history</p>{entries.length ? <div className="space-y-2">{entries.map((entry) => { const worker = workers.find((item) => item.id === entry.workerId); const count = allocations.filter((allocation) => allocation.payrollEntryId === entry.id).length; const source = typeof entry.calculationSnapshot?.rateSource === "string" ? entry.calculationSnapshot.rateSource : "SNAPSHOT"; return <div key={entry.id} className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2 last:border-0 last:pb-0"><div className="min-w-0"><p className="truncate text-[10px] font-bold text-slate-700">{worker?.displayName || "Unknown worker"} <span className="font-normal text-slate-400">· {count} project{count === 1 ? "" : "s"}</span></p><p className="text-[10px] text-slate-500">{source} rate · {entry.netPay === entry.grossPay ? "no deductions" : `${money(entry.deductions)} deductions`}</p></div><span className="shrink-0 text-[10px] font-black tabular-nums">{money(entry.grossPay)}</span></div>; })}</div> : <p className="text-[10px] text-slate-500">No payroll entries yet.</p>}</div>; }
function Summary({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) { return <div className={`rounded-xl border p-3 ${warning ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50"}`}><p className="text-[10px] font-semibold text-slate-500">{label}</p><p className={`mt-1 text-sm font-black tabular-nums ${warning ? "text-amber-900" : "text-slate-800"}`}>{value}</p></div>; }
