import React, { useMemo, useState } from "react";
import { Archive, Plus, RotateCcw, Trash2, UserRound } from "lucide-react";
import type { EmploymentType, PayType, PayrollLaborContextType, Project, ProjectWorkerAssignment, Worker } from "../../types";
import { createLocalWorker } from "../../lib/payroll";
import { workerDependencySummary, workerLifecycleCopy, type PayrollLifecycleRequest, type WorkerLifecycleData } from "../../lib/payrollLifecycle";

interface WorkersTableProps {
  workers: Worker[];
  projects?: Project[];
  assignments?: ProjectWorkerAssignment[];
  lifecycleData?: Omit<WorkerLifecycleData, "workers">;
  onSave: (worker: Worker) => void;
  onPayrollLifecycle?: (request: PayrollLifecycleRequest) => Promise<void> | void;
  canManageWorkforce?: boolean;
}

const CONTEXTS: PayrollLaborContextType[] = ["PROJECT", "ADMIN_OFFICE", "GENERAL_OVERHEAD", "UNALLOCATED_REVIEW"];

function contextLabel(value?: PayrollLaborContextType) {
  return (value || "UNALLOCATED_REVIEW").replaceAll("_", " ");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export const WorkersTable: React.FC<WorkersTableProps> = ({
  workers,
  projects = [],
  assignments = [],
  lifecycleData = {},
  onSave,
  onPayrollLifecycle,
  canManageWorkforce = true,
}) => {
  const [editing, setEditing] = useState<Worker | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const projectName = useMemo(() => new Map(projects.map((project) => [project.id, `${project.projectCode} · ${project.projectName}`])), [projects]);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageWorkforce || !editing?.employeeCode.trim() || !editing.firstName.trim() || !editing.lastName.trim()) return;
    onSave({
      ...editing,
      displayName: `${editing.firstName} ${editing.lastName}`.trim(),
      defaultRate: Number(editing.defaultRate) || 0,
      defaultProjectId: editing.defaultLaborContext === "PROJECT" ? editing.defaultProjectId : undefined,
    });
    setEditing(null);
  };

  const runLifecycle = async (worker: Worker, action: "OFFBOARD" | "REACTIVATE" | "DELETE_UNUSED") => {
    if (!onPayrollLifecycle || !canManageWorkforce) return;
    const summary = workerDependencySummary(worker.id, { workers, assignments, ...lifecycleData });
    if (action === "DELETE_UNUSED" && !summary.canDelete) {
      setMessage(workerLifecycleCopy(summary));
      return;
    }
    const confirmation = action === "DELETE_UNUSED"
      ? `Delete ${worker.displayName} permanently?\n\n${workerLifecycleCopy(summary)}\n\nThis action cannot be undone.`
      : action === "OFFBOARD"
        ? `Offboard ${worker.displayName}?\n\nHistorical payroll and project records will be preserved. The employee will no longer be active for new workforce/payroll operations.`
        : `Reactivate ${worker.displayName}?\n\nThe employee will be available for new workforce and payroll operations again.`;
    if (!window.confirm(confirmation)) return;
    setBusyId(worker.id);
    setMessage(null);
    try {
      await onPayrollLifecycle({
        entity: "WORKER",
        id: worker.id,
        action,
        reason: action === "DELETE_UNUSED" ? "Confirmed unused employee deletion" : action === "OFFBOARD" ? "Employee offboarded by an authorized workforce user" : "Employee reactivated by an authorized workforce user",
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The worker lifecycle action could not be completed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <h3 className="text-sm font-black">Workers</h3>
          <p className="mt-1 text-xs text-slate-500">Worker identity is retained for payroll history. Actual work entries remain the labor-allocation source.</p>
        </div>
        {canManageWorkforce && <button type="button" onClick={() => setEditing(createLocalWorker({ employeeCode: "", firstName: "", lastName: "", displayName: "", employmentType: "OTHER", defaultPayType: "MONTHLY", defaultRate: 0, defaultLaborContext: "UNALLOCATED_REVIEW", active: true, notes: "" }))} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" /> Add worker</button>}
      </div>
      {message && <div role="alert" className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">{message}</div>}
      {workers.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Role / department</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Default work context</th><th className="px-5 py-3">Current projects</th><th className="px-5 py-3">Pay</th><th className="px-5 py-3" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {workers.map((worker) => {
                const summary = workerDependencySummary(worker.id, { workers, assignments, ...lifecycleData });
                const currentProjects = assignments.filter((assignment) => assignment.workerId === worker.id && assignment.active && (!assignment.endDate || assignment.endDate >= today()));
                const status = worker.employmentStatus || (worker.active ? "ACTIVE" : "INACTIVE");
                const busy = busyId === worker.id;
                return <tr key={worker.id} className={!worker.active ? "bg-slate-50/60" : undefined}>
                  <td className="px-5 py-3"><p className="font-bold">{worker.displayName}</p><p className="text-[10px] text-slate-500">{worker.employeeCode}</p></td>
                  <td className="px-5 py-3"><p className="text-slate-700">{worker.jobTitle || "—"}</p><p className="text-[10px] text-slate-500">{worker.department || "No department"}</p></td>
                  <td className="px-5 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${worker.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{status.replaceAll("_", " ")}</span>{worker.endDate && <p className="mt-1 text-[10px] text-slate-500">Ended {worker.endDate}</p>}</td>
                  <td className="px-5 py-3"><p className="font-bold text-slate-700">{contextLabel(worker.defaultLaborContext)}</p>{worker.defaultProjectId && <p className="text-[10px] text-slate-500">{projectName.get(worker.defaultProjectId) || "Configured project"}</p>}</td>
                  <td className="max-w-[240px] px-5 py-3"><div className="flex flex-wrap gap-1">{currentProjects.length ? currentProjects.map((assignment) => <span key={assignment.id} className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700">{projectName.get(assignment.projectId) || "Project"}</span>) : <span className="text-[10px] text-slate-400">None</span>}</div></td>
                  <td className="px-5 py-3"><p className="font-bold">{worker.defaultPayType}</p><p className="text-[10px] tabular-nums text-slate-500">₱{worker.defaultRate.toFixed(2)}</p></td>
                  <td className="px-5 py-3"><div className="flex flex-wrap justify-end gap-x-3 gap-y-2">{canManageWorkforce && <button type="button" onClick={() => setEditing(worker)} className="text-[10px] font-bold text-indigo-700">Edit</button>}{canManageWorkforce && worker.active && <button type="button" disabled={busy} onClick={() => void runLifecycle(worker, "OFFBOARD")} className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 disabled:opacity-40"><Archive className="h-3 w-3" /> Offboard</button>}{canManageWorkforce && !worker.active && <button type="button" disabled={busy} onClick={() => void runLifecycle(worker, "REACTIVATE")} className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 disabled:opacity-40"><RotateCcw className="h-3 w-3" /> Reactivate</button>}{canManageWorkforce && summary.canDelete && <button type="button" disabled={busy} onClick={() => void runLifecycle(worker, "DELETE_UNUSED")} className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 disabled:opacity-40"><Trash2 className="h-3 w-3" /> Delete unused</button>}</div>{!summary.canDelete && <p className="mt-2 text-right text-[9px] text-slate-400">History retained · offboard instead</p>}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      ) : <div className="p-10 text-center"><UserRound className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No workers yet.</p><p className="mt-1 text-xs text-slate-500">Add engineers, foremen, operators, and other project workers.</p></div>}
      {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={save} className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h3 className="text-lg font-black">{workers.some((worker) => worker.id === editing.id) ? "Edit worker" : "Add worker"}</h3><p className="mt-1 text-xs text-slate-500">Default context is a home classification only; explicit actual work wins during payroll calculation.</p></div><button type="button" onClick={() => setEditing(null)} className="text-xl text-slate-400">×</button></div><div className="grid gap-3 sm:grid-cols-2">{([['employeeCode', 'Employee code'], ['firstName', 'First name'], ['lastName', 'Last name'], ['jobTitle', 'Job title'], ['department', 'Department']] as Array<[keyof Worker, string]>).map(([key, label]) => <label key={String(key)} className="space-y-1"><span className="field-label">{label}</span><input required={key === "employeeCode" || key === "firstName" || key === "lastName"} value={String(editing[key] || "")} onChange={(event) => setEditing({ ...editing, [key]: event.target.value })} className="field-input" /></label>)}<label className="space-y-1"><span className="field-label">Employment type</span><select value={editing.employmentType} onChange={(event) => setEditing({ ...editing, employmentType: event.target.value as EmploymentType })} className="field-input">{["REGULAR", "PROJECT_BASED", "CONTRACTUAL", "DAILY", "HOURLY", "OTHER"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label className="space-y-1"><span className="field-label">Pay type</span><select value={editing.defaultPayType} onChange={(event) => setEditing({ ...editing, defaultPayType: event.target.value as PayType })} className="field-input">{["MONTHLY", "DAILY", "HOURLY"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="space-y-1"><span className="field-label">Default rate</span><input type="number" min="0" step="0.01" value={editing.defaultRate} onChange={(event) => setEditing({ ...editing, defaultRate: Number(event.target.value) })} className="field-input" /></label><label className="space-y-1"><span className="field-label">Default labor context</span><select value={editing.defaultLaborContext || "UNALLOCATED_REVIEW"} onChange={(event) => setEditing({ ...editing, defaultLaborContext: event.target.value as PayrollLaborContextType, defaultProjectId: event.target.value === "PROJECT" ? editing.defaultProjectId : undefined })} className="field-input">{CONTEXTS.map((context) => <option key={context} value={context}>{contextLabel(context)}</option>)}</select></label><label className="space-y-1 sm:col-span-2"><span className="field-label">Default project (convenience only)</span><select disabled={(editing.defaultLaborContext || "UNALLOCATED_REVIEW") !== "PROJECT"} value={editing.defaultProjectId || ""} onChange={(event) => setEditing({ ...editing, defaultProjectId: event.target.value || undefined })} className="field-input"><option value="">No default project</option>{projects.filter((project) => project.status !== "ARCHIVED").map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.projectName}</option>)}</select><span className="text-[10px] text-slate-500">Admin Office, General Overhead, and Unallocated Review never point at a project.</span></label></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button><button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white">Save worker</button></div></form></div>}
    </section>
  );
};
