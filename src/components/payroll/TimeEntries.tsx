import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Pencil, Plus, Trash2 } from "lucide-react";
import { PayrollLaborContextType, Project, ProjectWorkerAssignment, PayrollPeriod, PayrollRun, Worker, WorkEntry } from "../../types";
import { calculatePayroll, resolvePayrollRate } from "../../lib/payrollCalculation";
import { createLocalWorkEntry } from "../../lib/payroll";
import type { PayrollLifecycleRequest } from "../../lib/payrollLifecycle";

interface TimeEntriesProps {
  entries: WorkEntry[];
  workers: Worker[];
  projects: Project[];
  periods: PayrollPeriod[];
  assignments: ProjectWorkerAssignment[];
  runs: PayrollRun[];
  selectedPeriodId: string;
  onSave: (entry: WorkEntry) => void;
  onPayrollLifecycle?: (request: PayrollLifecycleRequest) => Promise<void> | void;
  canManagePayrollSources?: boolean;
}

function dateInPeriod(date: string, period?: PayrollPeriod) { return Boolean(period && date >= period.periodStart && date <= period.periodEnd); }
function money(value: number) { return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value || 0); }
function localAssignment(assignments: ProjectWorkerAssignment[], entry: WorkEntry) { return assignments.find((assignment) => assignment.workerId === entry.workerId && assignment.projectId === entry.projectId && assignment.active && assignment.startDate <= entry.workDate && (!assignment.endDate || entry.workDate <= assignment.endDate)); }

export const TimeEntries: React.FC<TimeEntriesProps> = ({ entries, workers, projects, periods, assignments, runs, selectedPeriodId, onSave, onPayrollLifecycle, canManagePayrollSources = true }) => {
  const [editing, setEditing] = useState<WorkEntry | null>(null);
  const period = periods.find((item) => item.id === selectedPeriodId);
  const visibleEntries = selectedPeriodId ? entries.filter((entry) => entry.periodId === selectedPeriodId || !entry.periodId) : entries;
  const lockedPeriodIds = useMemo(() => new Set(runs.filter((run) => run.status === "APPROVED" || run.status === "PAID" || run.status === "VOID").map((run) => run.periodId)), [runs]);
  const periodLocked = Boolean(period && lockedPeriodIds.has(period.id));
  const invalidCount = visibleEntries.filter((entry) => !entry.periodId || !periods.some((item) => item.id === entry.periodId && dateInPeriod(entry.workDate, item))).length;

  const effectiveRate = (entry: WorkEntry) => {
    const worker = workers.find((item) => item.id === entry.workerId);
    if (!worker) return undefined;
    const assignment = localAssignment(assignments, entry);
    return resolvePayrollRate({ worker, assignment, workDate: entry.workDate, manualOverride: assignment ? undefined : entry.rate > 0 ? { rate: entry.rate } : undefined });
  };

  const openNew = () => {
    if (!period || periodLocked) return;
    const worker = workers[0];
    const project = projects.find((item) => item.status !== "ARCHIVED");
    const laborContext: PayrollLaborContextType = project ? "PROJECT" : "GENERAL_OVERHEAD";
    const seed = createLocalWorkEntry({ workerId: worker?.id || "", projectId: project?.id, laborContext, periodId: period.id, workDate: period.periodStart, regularHours: 0, overtimeHours: 0, daysWorked: 0, rate: worker?.defaultRate || 0, status: "DRAFT" });
    setEditing(seed);
  };

  const openEdit = (entry: WorkEntry) => { if (!canManagePayrollSources) return; if (!lockedPeriodIds.has(entry.periodId || "") && entry.status !== "VOID" && entry.status !== "APPROVED") setEditing(entry); };

  const runLifecycle = async (entry: WorkEntry, action: "DELETE_DRAFT" | "VOID") => {
    if (!onPayrollLifecycle || !canManagePayrollSources) return;
    const worker = workers.find((item) => item.id === entry.workerId);
    const confirmation = action === "DELETE_DRAFT"
      ? `Delete this unused draft work entry for ${worker?.displayName || "this worker"}?\n\nThis action cannot be undone.`
      : `Void this work entry for ${worker?.displayName || "this worker"}?\n\nThe source remains in history and will be excluded from future calculation.`;
    if (!window.confirm(confirmation)) return;
    try {
      await onPayrollLifecycle({ entity: "WORK_ENTRY", id: entry.id, action, reason: action === "VOID" ? "Work entry corrected by an authorized payroll user" : "Confirmed unused draft work entry deletion" });
    } catch {
      // The parent owns the user-facing notification/error mapping.
    }
  };

  const updateWorker = (workerId: string) => {
    if (!editing) return;
    const worker = workers.find((item) => item.id === workerId);
    setEditing({ ...editing, workerId, rate: worker?.defaultRate || 0 });
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManagePayrollSources || !editing || !editing.workerId || !editing.periodId || !editing.workDate || (editing.laborContext === "PROJECT" && !editing.projectId)) return;
    const entryPeriod = periods.find((item) => item.id === editing.periodId);
    if (!entryPeriod || entryPeriod.status === "VOID" || !dateInPeriod(editing.workDate, entryPeriod) || lockedPeriodIds.has(editing.periodId)) return;
    onSave({ ...editing, laborContext: editing.laborContext || (editing.projectId ? "PROJECT" : "UNALLOCATED_REVIEW"), projectId: editing.laborContext === "PROJECT" ? editing.projectId : undefined, rate: Number(editing.rate) || 0, regularHours: Number(editing.regularHours) || 0, overtimeHours: Number(editing.overtimeHours) || 0, daysWorked: Number(editing.daysWorked) || 0 });
    setEditing(null);
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-black">Time / work entries</h3><p className="mt-1 text-xs text-slate-500">Attendance records presence; Time / Labor records project, office, overhead, or review allocation.</p></div><button type="button" onClick={openNew} disabled={!period || periodLocked || !workers.length || !canManagePayrollSources} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add entry</button></div>
    {!period && <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-900">Select a non-VOID payroll period before adding or editing time.</div>}
    {periodLocked && <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-xs text-rose-900">This period is locked by an approved, paid, or void run. Time entries are read-only.</div>}
    {invalidCount > 0 && <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{invalidCount} entry{invalidCount === 1 ? " is" : "s are"} unlinked or outside its period. Link it to a period before calculating.</span></div>}
    {visibleEntries.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-5 py-3">Date / worker</th><th className="px-5 py-3">Period</th><th className="px-5 py-3">Project</th><th className="px-5 py-3">Pay source</th><th className="px-5 py-3">Units</th><th className="px-5 py-3">Cost</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{visibleEntries.map((entry) => {
      const worker = workers.find((item) => item.id === entry.workerId);
      const project = projects.find((item) => item.id === entry.projectId);
      const entryPeriod = periods.find((item) => item.id === entry.periodId);
      const resolution = effectiveRate(entry);
      const cost = resolution && resolution.rate > 0 ? calculatePayroll({ payType: resolution.payType, rate: resolution.rate, regularHours: entry.regularHours, daysWorked: entry.daysWorked, overtimeHours: entry.overtimeHours, overtimeRate: entry.overtimeRate }).grossPay : 0;
      const locked = lockedPeriodIds.has(entry.periodId || "");
      const valid = Boolean(entry.periodId && entryPeriod && entryPeriod.status !== "VOID" && dateInPeriod(entry.workDate, entryPeriod));
      return <tr key={entry.id} className={!valid ? "bg-amber-50/40" : undefined}><td className="px-5 py-3"><p className="font-bold">{entry.workDate}</p><p className="text-[10px] text-slate-500">{worker?.displayName || "Unknown worker"}</p></td><td className="px-5 py-3"><p className="font-bold">{entryPeriod ? `${entryPeriod.periodStart} – ${entryPeriod.periodEnd}` : "Not linked"}</p><p className="text-[10px] text-slate-500">{entryPeriod?.status || "Needs period"}</p></td><td className="px-5 py-3 text-slate-600">{project ? `${project.projectCode} · ${project.projectName}` : entry.laborContext?.replaceAll("_", " ") || "Unallocated review"}</td><td className="px-5 py-3"><p className="font-bold">{resolution ? `${resolution.payType} · ${money(resolution.rate)}` : "Unavailable"}</p><p className="text-[10px] text-slate-500">{resolution?.rateSource || "No worker rate"} rate</p></td><td className="px-5 py-3 text-slate-600">{resolution?.payType === "DAILY" ? `${entry.daysWorked || 0} days` : `${entry.regularHours || 0} regular h`}{(entry.overtimeHours || 0) > 0 ? ` · ${entry.overtimeHours} OT h` : ""}</td><td className="px-5 py-3 font-black tabular-nums">{money(cost)}</td><td className="px-5 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${entry.status === "VOID" ? "bg-slate-100 text-slate-500" : valid ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{valid ? entry.status : "INVALID LINK"}</span></td><td className="px-5 py-3 text-right"><div className="flex flex-wrap justify-end gap-2">{canManagePayrollSources && entry.status !== "VOID" && <button type="button" onClick={() => openEdit(entry)} disabled={locked || entry.status === "APPROVED"} className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 disabled:cursor-not-allowed disabled:text-slate-300"><Pencil className="h-3 w-3" /> Edit</button>}{canManagePayrollSources && entry.status === "DRAFT" && !locked && <button type="button" onClick={() => void runLifecycle(entry, "DELETE_DRAFT")} className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700"><Trash2 className="h-3 w-3" /> Delete draft</button>}{canManagePayrollSources && entry.status !== "DRAFT" && entry.status !== "VOID" && !locked && <button type="button" onClick={() => void runLifecycle(entry, "VOID")} className="text-[10px] font-bold text-amber-700">Void</button>}</div></td></tr>;
    })}</tbody></table></div> : <div className="p-10 text-center"><Clock3 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No time entries in this period.</p><p className="mt-1 text-xs text-slate-500">Add daily or hourly work after selecting a payroll period.</p></div>}
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><form noValidate onSubmit={save} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h3 className="text-lg font-black">{entries.some((entry) => entry.id === editing.id) ? "Edit work entry" : "Add work entry"}</h3><p className="mt-1 text-xs text-slate-500">Period linkage and date range are required.</p></div><button type="button" onClick={() => setEditing(null)} className="text-xl text-slate-400">×</button></div><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Payroll period</span><select required value={editing.periodId || ""} onChange={(event) => setEditing({ ...editing, periodId: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="">Select period</option>{periods.filter((item) => item.status !== "VOID").map((item) => <option key={item.id} value={item.id}>{item.periodStart} – {item.periodEnd} · {item.status}</option>)}</select></label><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Work date</span><input required type="date" min={periods.find((item) => item.id === editing.periodId)?.periodStart} max={periods.find((item) => item.id === editing.periodId)?.periodEnd} value={editing.workDate} onChange={(event) => setEditing({ ...editing, workDate: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" /></label><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Worker</span><select required value={editing.workerId} onChange={(event) => updateWorker(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs">{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.displayName} · {worker.employeeCode}</option>)}</select></label><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Project</span><select required value={editing.projectId} onChange={(event) => setEditing({ ...editing, projectId: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="">Select project</option>{projects.filter((project) => project.status !== "ARCHIVED").map((project) => <option key={project.id} value={project.id}>{project.projectCode} — {project.projectName}</option>)}</select></label><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Effective rate</span><input required type="number" min="0" step="0.01" value={editing.rate} onChange={(event) => setEditing({ ...editing, rate: Number(event.target.value) })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" /><span className="block text-[10px] text-slate-500">Assignment rate wins in calculation when date-valid; this saved rate is the visible snapshot.</span></label><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Days worked</span><input type="number" min="0" step="0.25" value={editing.daysWorked || 0} onChange={(event) => setEditing({ ...editing, daysWorked: Number(event.target.value) })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" /></label><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Regular hours</span><input type="number" min="0" step="0.25" value={editing.regularHours || 0} onChange={(event) => setEditing({ ...editing, regularHours: Number(event.target.value) })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" /></label><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Overtime hours</span><input type="number" min="0" step="0.25" value={editing.overtimeHours || 0} onChange={(event) => setEditing({ ...editing, overtimeHours: Number(event.target.value) })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" /></label></div><div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-[10px] text-slate-600"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />Choose a date inside the selected period. Entries without a valid period link cannot be included in a calculated run.</div><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button><button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white">Save entry</button></div></form></div>}
    {editing && <div className="mb-2 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs"><label className="flex items-center gap-2 font-bold text-indigo-950"><span>Labor context</span><select value={editing.laborContext || (editing.projectId ? "PROJECT" : "UNALLOCATED_REVIEW")} onChange={(event) => setEditing({ ...editing, laborContext: event.target.value as PayrollLaborContextType })} className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[10px]">{["PROJECT", "ADMIN_OFFICE", "GENERAL_OVERHEAD", "UNALLOCATED_REVIEW"].map((context) => <option key={context} value={context}>{context.replaceAll("_", " ")}</option>)}</select><span className="font-normal text-indigo-800">Project is required only for PROJECT.</span></label></div>}
  </section>;
};
