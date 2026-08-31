import React, { useMemo, useRef, useState } from "react";
import { Link2, Pencil, Plus, Scissors, Trash2 } from "lucide-react";
import type { OvertimeRequest, PayType, PayrollEntry, Project, ProjectWorkerAssignment, Worker, WorkEntry } from "../../types";
import { createLocalAssignment } from "../../lib/payroll";
import { assignmentDependencySummary, type PayrollLifecycleRequest } from "../../lib/payrollLifecycle";
import { useDialogFocus } from "../ui/useDialogFocus.ts";

interface ProjectAssignmentsProps {
  assignments: ProjectWorkerAssignment[];
  workers: Worker[];
  projects: Project[];
  workEntries?: WorkEntry[];
  overtimeRequests?: OvertimeRequest[];
  payrollEntries?: PayrollEntry[];
  allocations?: Array<{ payrollEntryId: string; projectId: string }>;
  onSave: (assignment: ProjectWorkerAssignment) => void;
  onPayrollLifecycle?: (request: PayrollLifecycleRequest) => Promise<void> | void;
  canManageWorkforce?: boolean;
}

function today() { return new Date().toISOString().slice(0, 10); }
function displayProject(project?: Project) { return project ? `${project.projectCode} · ${project.projectName}` : "Project"; }

export const ProjectAssignments: React.FC<ProjectAssignmentsProps> = ({
  assignments,
  workers,
  projects,
  workEntries = [],
  overtimeRequests = [],
  payrollEntries = [],
  allocations = [],
  onSave,
  onPayrollLifecycle,
  canManageWorkforce = true,
}) => {
  const [editing, setEditing] = useState<ProjectWorkerAssignment | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const assignmentWorkerInputRef = useRef<HTMLSelectElement>(null);
  const assignmentDialogRef = useDialogFocus({ open: Boolean(editing), onClose: () => setEditing(null), initialFocusRef: assignmentWorkerInputRef });
  const activeProjects = useMemo(() => projects.filter((project) => project.status !== "ARCHIVED" && !project.archivedAt), [projects]);

  const open = () => setEditing(createLocalAssignment({ workerId: workers[0]?.id || "", projectId: activeProjects[0]?.id || "", startDate: today(), active: true, roleOnProject: "", notes: "" }));
  const dependenciesFor = (assignment: ProjectWorkerAssignment) => assignmentDependencySummary(assignment, { workEntries, overtimeRequests, payrollEntries, allocations });
  const editingUsed = Boolean(editing && !editing.id.startsWith("local-") && dependenciesFor(editing).hasDownstreamUsage);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageWorkforce) return;
    if (!editing?.workerId || !editing.projectId || !editing.startDate || (editing.endDate && editing.endDate < editing.startDate)) {
      setMessage("Assignment dates are invalid. End date must be on or after start date.");
      return;
    }
    onSave(editing);
    setEditing(null);
  };

  const runLifecycle = async (assignment: ProjectWorkerAssignment, action: "END" | "DELETE_UNUSED") => {
    if (!onPayrollLifecycle || !canManageWorkforce) return;
    const summary = dependenciesFor(assignment);
    if (action === "DELETE_UNUSED" && !summary.canDelete) {
      setMessage("This project assignment has downstream workforce or payroll history and cannot be deleted; end it instead.");
      return;
    }
    const worker = workers.find((item) => item.id === assignment.workerId);
    const project = projects.find((item) => item.id === assignment.projectId);
    const confirmation = action === "DELETE_UNUSED"
      ? `Delete the unused assignment for ${worker?.displayName || "this employee"} on ${displayProject(project)}?\n\nThis action cannot be undone.`
      : `End ${worker?.displayName || "this employee"}'s assignment on ${displayProject(project)}?\n\nExisting work and payroll history will remain unchanged.`;
    if (!window.confirm(confirmation)) return;
    setBusyId(assignment.id);
    setMessage(null);
    try {
      const effectiveDate = assignment.endDate || (assignment.startDate > today() ? assignment.startDate : today());
      await onPayrollLifecycle({ entity: "PROJECT_ASSIGNMENT", id: assignment.id, action, effectiveDate: action === "END" ? effectiveDate : undefined, reason: action === "END" ? "Project assignment ended by an authorized workforce user" : "Confirmed unused assignment deletion" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The project assignment lifecycle action could not be completed.");
    } finally {
      setBusyId(null);
    }
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="workforce-assignments-title">
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h3 id="workforce-assignments-title" className="text-sm font-black">Project assignments</h3><p className="mt-1 text-xs text-slate-500">Assignments are date-ranged access/context records. Multiple concurrent projects do not split or duplicate payroll cost.</p></div><button type="button" onClick={open} disabled={!canManageWorkforce || !workers.length || !activeProjects.length} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Assign worker</button></div>
    {message && <div role="alert" className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">{message}</div>}
    {assignments.length ? <div className="divide-y divide-slate-100">{assignments.slice().sort((left, right) => right.startDate.localeCompare(left.startDate)).map((assignment) => { const worker = workers.find((item) => item.id === assignment.workerId); const project = projects.find((item) => item.id === assignment.projectId); const summary = dependenciesFor(assignment); const busy = busyId === assignment.id; return <div key={assignment.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-xs font-black">{worker?.displayName || "Worker"} <span className="font-normal text-slate-400">→</span> {displayProject(project)}</p><p className="mt-1 text-[10px] text-slate-500">{assignment.roleOnProject || worker?.jobTitle || "Role not set"} · {assignment.startDate}{assignment.endDate ? ` → ${assignment.endDate}` : " · open-ended"}</p><p className="mt-1 text-[10px] text-slate-400">{summary.hasDownstreamUsage ? "Used by workforce or payroll history · edit dates/rates is protected" : "No downstream usage · safe correction available"}</p></div><div className="flex flex-wrap items-center justify-end gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${assignment.active && (!assignment.endDate || assignment.endDate >= today()) ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{assignment.active && (!assignment.endDate || assignment.endDate >= today()) ? "Active" : "Ended"}</span>{canManageWorkforce && <><button type="button" onClick={() => setEditing(assignment)} className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700"><Pencil className="h-3 w-3" /> Edit</button>{assignment.active && <button type="button" disabled={busy} onClick={() => void runLifecycle(assignment, "END")} className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 disabled:opacity-40"><Scissors className="h-3 w-3" /> End</button>}{summary.canDelete && <button type="button" disabled={busy} onClick={() => void runLifecycle(assignment, "DELETE_UNUSED")} className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 disabled:opacity-40"><Trash2 className="h-3 w-3" /> Delete unused</button>}</>}</div></div>; })}</div> : <div className="p-10 text-center"><Link2 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No project assignments yet.</p><p className="mt-1 text-xs text-slate-500">Assign workers to connect actual work entries and payroll costs to projects.</p></div>}
    {editing && <div ref={assignmentDialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="assignment-form-title" aria-describedby="assignment-form-description"><form onSubmit={save} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h3 id="assignment-form-title" className="text-lg font-black">{assignments.some((item) => item.id === editing.id) ? "Edit project assignment" : "Assign worker to project"}</h3><p id="assignment-form-description" className="mt-1 text-xs text-slate-500">{editingUsed ? "This assignment has downstream usage. Identity, dates, and pay overrides are protected; end it to close future work." : "A worker may be assigned to several projects at the same time."}</p></div><button type="button" onClick={() => setEditing(null)} className="rounded-lg p-2 text-xl leading-none text-slate-400 hover:bg-slate-100" aria-label="Close project assignment form">×</button></div><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="field-label">Worker</span><select ref={assignmentWorkerInputRef} disabled={editingUsed} value={editing.workerId} onChange={(event) => setEditing({ ...editing, workerId: event.target.value })} className="field-input">{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.displayName}</option>)}</select></label><label className="space-y-1"><span className="field-label">Project</span><select disabled={editingUsed} value={editing.projectId} onChange={(event) => setEditing({ ...editing, projectId: event.target.value })} className="field-input">{activeProjects.map((project) => <option key={project.id} value={project.id}>{displayProject(project)}</option>)}</select></label><label className="space-y-1"><span className="field-label">Start date</span><input disabled={editingUsed} type="date" value={editing.startDate} onChange={(event) => setEditing({ ...editing, startDate: event.target.value })} className="field-input" /></label><label className="space-y-1"><span className="field-label">End date</span><input type="date" value={editing.endDate || ""} min={editing.startDate} onChange={(event) => setEditing({ ...editing, endDate: event.target.value || undefined })} className="field-input" /></label><label className="space-y-1"><span className="field-label">Role on project</span><input value={editing.roleOnProject || ""} onChange={(event) => setEditing({ ...editing, roleOnProject: event.target.value })} className="field-input" /></label><label className="space-y-1"><span className="field-label">Pay type override</span><select disabled={editingUsed} value={editing.payType || ""} onChange={(event) => setEditing({ ...editing, payType: (event.target.value || undefined) as PayType | undefined })} className="field-input"><option value="">Worker default</option>{["MONTHLY", "DAILY", "HOURLY"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="space-y-1 sm:col-span-2"><span className="field-label">Rate override</span><input disabled={editingUsed} type="number" min="0" step="0.01" value={editing.rate ?? ""} onChange={(event) => setEditing({ ...editing, rate: event.target.value === "" ? undefined : Number(event.target.value) })} className="field-input" /></label></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button><button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white">Save assignment</button></div></form></div>}
  </section>;
};
