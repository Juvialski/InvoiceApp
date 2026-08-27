import React, { useMemo, useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, Clock3, HardHat, LockKeyhole, WalletCards } from "lucide-react";
import type { PayrollEntry, PayrollPeriod, PayrollProjectAllocation, PayrollRun, Project, ProjectWorkerAssignment, Worker, WorkEntry } from "../../types";
import { validatePayrollProjectAllocations } from "../../lib/payrollCalculation";
import { calculatePayrollRunFromWorkEntries } from "../../lib/payrollCalculation";
import { payrollNetPayBasis } from "../../lib/financialSettlement.ts";
import { FinancialSettlementCard } from "../FinancialSettlementCard.tsx";
import { PayrollEntryForm } from "./PayrollEntryForm";

interface PayrollRunViewProps {
  runs: PayrollRun[];
  periods: PayrollPeriod[];
  entries: PayrollEntry[];
  allocations: PayrollProjectAllocation[];
  workers: Worker[];
  projects?: Project[];
  workEntries?: WorkEntry[];
  assignments?: ProjectWorkerAssignment[];
  selectedPeriodId: string;
  onCreateRun?: (periodId: string) => void;
  onSaveEntry?: (entry: PayrollEntry, allocations: PayrollProjectAllocation[]) => void;
  onUpdateRun?: (run: PayrollRun) => void;
  onCalculateRun?: (run: PayrollRun) => void;
}

function money(value: number) { return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value || 0); }
function isLocked(status: PayrollRun["status"]) { return status === "APPROVED" || status === "PAID" || status === "VOID"; }
function statusStyle(status: PayrollRun["status"]) { if (status === "PAID") return "bg-indigo-50 text-indigo-700"; if (status === "APPROVED") return "bg-emerald-50 text-emerald-700"; if (status === "CALCULATED") return "bg-violet-50 text-violet-700"; if (status === "VOID") return "bg-slate-100 text-slate-500"; return "bg-amber-50 text-amber-800"; }

export const PayrollRunView: React.FC<PayrollRunViewProps> = ({ runs, periods, entries, allocations, workers, projects = [], workEntries = [], assignments = [], selectedPeriodId, onCreateRun, onSaveEntry, onUpdateRun, onCalculateRun }) => {
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const period = periods.find((item) => item.id === selectedPeriodId);
  const periodRuns = useMemo(() => selectedPeriodId ? runs.filter((run) => run.periodId === selectedPeriodId) : [], [runs, selectedPeriodId]);
  const editableRuns = periodRuns.filter((run) => run.status === "DRAFT" || run.status === "CALCULATED");

  const calculateRun = (run: PayrollRun) => {
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
    if (!onCalculateRun) { setMessage({ tone: "error", text: "Payroll entry persistence is not available in this workspace." }); return; }
    onCalculateRun(run);
    setMessage({ tone: "info", text: "Payroll calculation started. Review the updated snapshot before approval." });
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-tour="payroll-runs">
    <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-black">Payroll runs</h3><p className="mt-1 text-xs text-slate-500">Review a selected period, calculate its snapshot, approve it, then reconcile employee net-pay disbursement in Cash & Banking.</p></div><div className="flex flex-wrap gap-2">{onSaveEntry && <PayrollEntryForm runs={editableRuns} workers={workers} projects={projects} onSave={onSaveEntry} />}{onCreateRun && period && <button onClick={() => onCreateRun(period.id)} className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><HardHat className="mr-1 inline h-3.5 w-3.5" /> Create run</button>}</div></div>
    {message && <div className={`flex items-start gap-2 border-b px-5 py-3 text-xs ${message.tone === "error" ? "border-rose-100 bg-rose-50 text-rose-800" : "border-indigo-100 bg-indigo-50 text-indigo-800"}`}><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{message.text}</div>}
    {!period && <div className="p-10 text-center"><Clock3 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">Select a payroll period</p><p className="mt-1 text-xs text-slate-500">Payroll history and lifecycle actions are scoped to an explicit period.</p></div>}
    {period && !periodRuns.length && <div className="p-10 text-center"><HardHat className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No runs for {period.periodStart} – {period.periodEnd}.</p><p className="mt-1 text-xs text-slate-500">Create a draft run, add linked time, then calculate it.</p></div>}
    {periodRuns.length > 0 && <div className="divide-y divide-slate-100">{periodRuns.map((run) => <RunCard key={run.id} run={run} period={period!} entries={entries.filter((entry) => entry.payrollRunId === run.id)} allocations={allocations} workers={workers} projects={projects} onCalculate={() => calculateRun(run)} onUpdateRun={onUpdateRun} />)}</div>}
  </section>;
};

interface RunCardProps { run: PayrollRun; period: PayrollPeriod; entries: PayrollEntry[]; allocations: PayrollProjectAllocation[]; workers: Worker[]; projects: Project[]; onCalculate: () => void; onUpdateRun?: (run: PayrollRun) => void; }
const RunCard: React.FC<RunCardProps> = ({ run, period, entries, allocations, workers, projects, onCalculate, onUpdateRun }) => {
  const runAllocations = allocations.filter((allocation) => entries.some((entry) => entry.id === allocation.payrollEntryId));
  const total = entries.reduce((sum, entry) => sum + entry.grossPay, 0);
  const netPay = payrollNetPayBasis(entries);
  const allocated = runAllocations.reduce((sum, allocation) => sum + allocation.allocationAmount, 0);
  const completeness = validatePayrollProjectAllocations(total, runAllocations);
  const locked = isLocked(run.status);
  const projectTotals: Record<string, number> = runAllocations.reduce((result, allocation) => { result[allocation.projectId] = (result[allocation.projectId] || 0) + allocation.allocationAmount; return result; }, {} as Record<string, number>);
  return <div className="px-4 py-5 sm:px-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="flex min-w-0 items-start gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${run.status === "APPROVED" || run.status === "PAID" ? "bg-emerald-50 text-emerald-700" : run.status === "VOID" ? "bg-slate-100 text-slate-400" : "bg-violet-50 text-violet-700"}`}>{locked ? <LockKeyhole className="h-4 w-4" /> : run.status === "DRAFT" ? <Clock3 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black">{period.periodStart} – {period.periodEnd}</p><span className={`rounded-full px-2 py-1 text-[10px] font-black ${statusStyle(run.status)}`}>{run.status}</span></div><p className="mt-1 text-[10px] text-slate-500">Payroll run · created {run.createdAt.slice(0, 10)}{run.approvedAt ? ` · approved ${run.approvedAt.slice(0, 10)}` : ""}{run.paidAt ? ` · paid ${run.paidAt.slice(0, 10)}` : ""}</p></div></div><div className="flex flex-wrap items-center gap-2 xl:justify-end"><button onClick={onCalculate} disabled={run.status !== "DRAFT" && run.status !== "CALCULATED"} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-2 text-[10px] font-bold text-violet-800 disabled:cursor-not-allowed disabled:opacity-40"><Calculator className="h-3.5 w-3.5" /> {run.status === "CALCULATED" ? "Recalculate" : "Calculate"}</button><button onClick={() => onUpdateRun?.({ ...run, status: "APPROVED", approvedAt: new Date().toISOString() })} disabled={run.status !== "CALCULATED" || !onUpdateRun} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="h-3.5 w-3.5" /> Approve</button><button onClick={() => onUpdateRun?.({ ...run, status: "PAID", paidAt: new Date().toISOString() })} disabled={run.status !== "APPROVED" || !onUpdateRun} title="Legacy/manual lifecycle action. Bank settlement evidence remains separate." className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-[10px] font-bold text-indigo-800 disabled:cursor-not-allowed disabled:opacity-40"><WalletCards className="h-3.5 w-3.5" /> Mark paid manually</button></div></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-4"><Summary label="Gross cost" value={money(total)} /><Summary label="Employee net pay" value={money(netPay)} /><Summary label="Project allocated cost" value={money(allocated)} /><Summary label="Unallocated project cost" value={money(completeness.unallocatedAmount)} warning={completeness.unallocatedAmount > 0} /></div>
    {(run.status === "APPROVED" || run.status === "PAID") && <div className="mt-4"><FinancialSettlementCard targetType="PAYROLL" targetId={run.id} compact /></div>}
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"><div><div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Allocation completeness</p><p className="text-[10px] font-bold text-slate-600">{completeness.allocationPercentage.toFixed(2)}% allocated</p></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${completeness.unallocatedAmount > 0 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, completeness.allocationPercentage)}%` }} /></div>{completeness.unallocatedAmount > 0 && <p className="mt-2 flex items-start gap-1.5 text-[10px] text-amber-800"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />Labor is not fully allocated to projects; it remains visible as unallocated.</p>}<div className="mt-3 space-y-1">{Object.entries(projectTotals).map(([projectId, amount]) => <ProjectLine key={projectId} project={projects.find((item) => item.id === projectId)} amount={amount} />)}</div></div><History entries={entries} allocations={runAllocations} workers={workers} /></div>
    {locked && <p className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-500"><LockKeyhole className="h-3 w-3" /> Entry and allocation edits are disabled after approval, payment, or voiding. Cash reconciliation only links disbursement evidence; it does not unlock or recalculate payroll.</p>}
  </div>;
};

const ProjectLine: React.FC<{ project?: Project; amount: number }> = ({ project, amount }) => <div className="flex justify-between gap-3 text-[10px]"><span className="truncate text-slate-600">{project ? `${project.projectCode} · ${project.projectName}` : "Unknown project"}</span><span className="font-bold tabular-nums">{money(amount)}</span></div>;
function History({ entries, allocations, workers }: { entries: PayrollEntry[]; allocations: PayrollProjectAllocation[]; workers: Worker[] }) { return <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-500">Payroll history</p>{entries.length ? <div className="space-y-2">{entries.map((entry) => { const worker = workers.find((item) => item.id === entry.workerId); const count = allocations.filter((allocation) => allocation.payrollEntryId === entry.id).length; const source = typeof entry.calculationSnapshot?.rateSource === "string" ? entry.calculationSnapshot.rateSource : "SNAPSHOT"; return <div key={entry.id} className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2 last:border-0 last:pb-0"><div className="min-w-0"><p className="truncate text-[10px] font-bold text-slate-700">{worker?.displayName || "Unknown worker"} <span className="font-normal text-slate-400">· {count} project{count === 1 ? "" : "s"}</span></p><p className="text-[10px] text-slate-500">{source} rate · {entry.netPay === entry.grossPay ? "no deductions" : `${money(entry.deductions)} deductions`}</p></div><span className="shrink-0 text-[10px] font-black tabular-nums">{money(entry.grossPay)}</span></div>; })}</div> : <p className="text-[10px] text-slate-500">No payroll entries yet.</p>}</div>; }
function Summary({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) { return <div className={`rounded-xl border p-3 ${warning ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50"}`}><p className="text-[10px] font-semibold text-slate-500">{label}</p><p className={`mt-1 text-sm font-black tabular-nums ${warning ? "text-amber-900" : "text-slate-800"}`}>{value}</p></div>; }
