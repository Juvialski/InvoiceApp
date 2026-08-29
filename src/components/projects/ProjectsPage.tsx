import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, BriefcaseBusiness, ChevronRight, Filter, Pencil, Plus, RotateCcw, Search, X } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import type { Project, ProjectCostSummary, ProjectStatus } from "../../types";
import { createLocalProject, type ProjectLifecycleAction, type ProjectLifecyclePreview } from "../../lib/projects";
import { projectSearchMatches } from "../../utils/projectMatching";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { useAppPermissions, useProjectCostCompleteness } from "../../app/AppPermissionContext.tsx";
import { projectCostMissingSourceLabels } from "../../utils/dataCompleteness.ts";
import { EmptyState, MetricCard, PageHeader, StatusBadge, type StatusTone } from "../ui/OperationsUI";

interface ProjectsPageProps {
  projects: Project[];
  summaries: Record<string, ProjectCostSummary>;
  onOpenProject: (project: Project) => void;
  onSaveProject: (project: Project) => void;
  onPreviewProjectLifecycle: (project: Project) => Promise<ProjectLifecyclePreview>;
  onApplyProjectLifecycle: (project: Project, action: ProjectLifecycleAction, reason?: string) => Promise<void>;
  initialEditingProject?: Project | null;
}

const blankProject = (): Project =>
  createLocalProject({
    projectCode: "",
    projectName: "",
    description: "",
    clientName: "",
    clientReference: "",
    location: "",
    siteAddress: "",
    projectManager: "",
    status: "PLANNING",
    projectBudget: 0,
    currency: "PHP",
    notes: "",
  });

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 0 }).format(value || 0);
  } catch {
    return `${currency} ${(value || 0).toFixed(0)}`;
  }
}

function statusTone(status: ProjectStatus): StatusTone {
  return status === "ACTIVE" || (status as string) === "IN_PROGRESS"
    ? "success"
    : status === "ARCHIVED" || status === "CANCELLED"
      ? "neutral"
      : status === "ON_HOLD"
        ? "warning"
        : "info";
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  projects,
  summaries,
  onOpenProject,
  onSaveProject,
  onPreviewProjectLifecycle,
  onApplyProjectLifecycle,
  initialEditingProject,
}) => {
  const permissions = useAppPermissions();
  const canManage = hasPermission(permissions, PERMISSION_KEYS.projectsWrite);
  const completeness = useProjectCostCompleteness();
  const hiddenCostSources = projectCostMissingSourceLabels(completeness);
  const costDataComplete = completeness.complete;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | ProjectStatus>("ALL");
  const [editing, setEditing] = useState<Project | null>(null);
  const [lifecycleProject, setLifecycleProject] = useState<Project | null>(null);
  const [lifecyclePreview, setLifecyclePreview] = useState<ProjectLifecyclePreview | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [lifecycleReason, setLifecycleReason] = useState("");

  useEffect(() => {
    if (canManage && initialEditingProject) setEditing(initialEditingProject);
  }, [canManage, initialEditingProject]);

  const filtered = useMemo(
    () => projects.filter((project) => projectSearchMatches(project, query) && (status === "ALL" || project.status === status)),
    [projects, query, status]
  );

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || !editing?.projectCode.trim() || !editing.projectName.trim()) return;
    onSaveProject({ ...editing, projectCode: editing.projectCode.trim(), projectName: editing.projectName.trim(), currency: (editing.currency || "PHP").toUpperCase(), projectBudget: Math.max(0, Number(editing.projectBudget) || 0) });
    setEditing(null);
  };

  const openLifecycle = async (project: Project) => {
    setLifecycleProject(project);
    setLifecyclePreview(null);
    setLifecycleError("");
    setLifecycleReason("");
    setLifecycleLoading(true);
    try {
      setLifecyclePreview(await onPreviewProjectLifecycle(project));
    } catch {
      setLifecycleError("Could not load the project lifecycle preview. No lifecycle action was taken.");
    } finally {
      setLifecycleLoading(false);
    }
  };

  const closeLifecycle = () => {
    setLifecycleProject(null);
    setLifecyclePreview(null);
    setLifecycleError("");
    setLifecycleReason("");
  };

  const applyLifecycle = async (action: ProjectLifecycleAction) => {
    if (!lifecycleProject || !lifecyclePreview) return;
    if (action === "DELETE_UNUSED" && !lifecyclePreview.canDelete) return;
    if ((action === "ARCHIVE" || action === "REACTIVATE") && lifecycleReason.trim().length < 3) return;
    setLifecycleLoading(true);
    setLifecycleError("");
    try {
      await onApplyProjectLifecycle(lifecycleProject, action, lifecycleReason.trim() || undefined);
      closeLifecycle();
    } catch {
      setLifecycleError("Could not complete the project lifecycle action. Nothing was changed.");
    } finally {
      setLifecycleLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Engineering operations" title="Projects" description="Projects are the cost context for supplier invoices, labor, and direct expenses." actions={canManage ? <Button variant="primary" label="New project" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing(blankProject())} /> : undefined} />

      {!costDataComplete && <div role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><strong>Partial cost visibility.</strong> Recorded-cost and remaining-budget figures below exclude {hiddenCostSources.join(", ")} because those sources are unavailable or incomplete.</div></div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Project register summary">
        <MetricCard label="All projects" value={projects.length} icon={BriefcaseBusiness} tone="info" />
        <MetricCard label="Active" value={projects.filter((project) => project.status === "ACTIVE" || (project.status as string) === "IN_PROGRESS").length} tone="success" />
        <MetricCard label="On hold" value={projects.filter((project) => project.status === "ON_HOLD").length} tone="warning" />
        <MetricCard label="Archived" value={projects.filter((project) => project.status === "ARCHIVED").length} tone="neutral" />
      </div>

      <Card className="p-3" elevation="low" aria-label="Project filters"><div className="flex flex-col gap-2 md:flex-row"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"><Search aria-hidden="true" className="h-4 w-4 text-slate-400" /><span className="sr-only">Search projects</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, project, client, location, manager…" className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400" /></label><label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"><Filter aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" /><span className="sr-only">Project status</span><select value={status} onChange={(event) => setStatus(event.target.value as "ALL" | ProjectStatus)} className="bg-transparent text-xs font-semibold outline-none"><option value="ALL">All statuses</option>{["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "ARCHIVED"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label></div></Card>

      {filtered.length ? <Card className="overflow-hidden p-0" elevation="low" aria-label="Projects table"><div className="ops-scrollbar overflow-auto"><table className="ops-table min-w-[900px] w-full text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Project</th><th className="px-4 py-3">Client / location</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Budget</th><th className="px-4 py-3 text-right">{costDataComplete ? "Recorded cost" : "Visible cost"}</th><th className="px-4 py-3 text-right">{costDataComplete ? "Remaining" : "Visible-data balance"}</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((project) => { const summary = summaries[project.id] || ({ budget: project.projectBudget, totalActualCost: 0, remainingBudget: project.projectBudget, budgetUsedPercent: 0 } as ProjectCostSummary); return <tr key={project.id}><td className="px-4 py-3"><button type="button" onClick={() => onOpenProject(project)} className="text-left hover:text-indigo-700"><span className="block text-[10px] font-black uppercase tracking-wide text-indigo-600">{project.projectCode}</span><strong className="mt-0.5 block text-xs text-slate-900">{project.projectName}</strong></button></td><td className="max-w-[220px] px-4 py-3"><strong className="block truncate text-[10px] text-slate-700">{project.clientName || "No client set"}</strong><span className="mt-0.5 block truncate text-[10px] text-slate-500">{project.location || project.siteAddress || "Location not set"}</span></td><td className="px-4 py-3"><StatusBadge tone={statusTone(project.status)}>{project.status.replaceAll("_", " ")}</StatusBadge></td><td className="px-4 py-3 text-right font-sans font-bold tabular-nums">{money(summary.budget, project.currency)}</td><td className="px-4 py-3 text-right font-sans font-bold tabular-nums">{money(summary.totalActualCost, project.currency)}</td><td className={`px-4 py-3 text-right font-sans font-bold tabular-nums ${summary.remainingBudget < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(summary.remainingBudget, project.currency)}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" onClick={() => onOpenProject(project)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" aria-label={`Open ${project.projectName}`}><ChevronRight className="h-4 w-4" /></button>{canManage && <button type="button" onClick={() => setEditing(project)} className="rounded-lg p-2 text-slate-400 hover:bg-indigo-50 hover:text-indigo-700" aria-label={`Edit ${project.projectName}`}><Pencil className="h-3.5 w-3.5" /></button>}{canManage && project.status !== "ARCHIVED" && <button type="button" onClick={() => void openLifecycle(project)} className="rounded-lg p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-700" title="Review archive or delete-unused options" aria-label={`Review lifecycle for ${project.projectName}`}><Archive className="h-3.5 w-3.5" /></button>}{canManage && project.status === "ARCHIVED" && <button type="button" onClick={() => void openLifecycle(project)} className="rounded-lg p-2 text-slate-400 hover:bg-indigo-50 hover:text-indigo-700" title="Review archived project options" aria-label={`Review archived project options for ${project.projectName}`}><RotateCcw className="h-3.5 w-3.5" /></button>}</div></td></tr>; })}</tbody></table></div></Card> : <EmptyState icon={BriefcaseBusiness} title={projects.length ? "No projects match this filter" : "No projects yet"} description={canManage ? "Create a project to connect supplier invoices, payroll, and direct costs." : "No projects are available for the current filter."} action={canManage ? <Button variant="primary" label="Create project" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing(blankProject())} /> : undefined} />}

      {canManage && editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="project-form-title"><form onSubmit={save} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Project register</p><h2 id="project-form-title" className="mt-1 text-lg font-black text-slate-950">{projects.some((project) => project.id === editing.id) ? "Edit project" : "New project"}</h2><p className="mt-1 text-xs text-slate-500">Codes are unique within the workspace and remain searchable.</p></div><button type="button" onClick={() => setEditing(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close project form"><X className="h-4 w-4" /></button></div><div className="grid gap-3 sm:grid-cols-2">{([ ["projectCode", "Project code"], ["projectName", "Project name"], ["clientName", "Client"], ["location", "Location"], ["projectManager", "Project manager"], ["currency", "Currency"] ] as Array<[keyof Project, string]>).map(([key, label]) => <label key={String(key)} className="space-y-1"><span className="field-label">{label}</span><input required={key === "projectCode" || key === "projectName"} value={String(editing[key] || "")} onChange={(event) => setEditing({ ...editing, [key]: event.target.value })} className="field-input" /></label>)}<label className="space-y-1"><span className="field-label">Budget</span><input type="number" min="0" step="0.01" value={editing.projectBudget} onChange={(event) => setEditing({ ...editing, projectBudget: Number(event.target.value) })} className="field-input" /></label><div className="space-y-1"><span className="field-label">Status</span><div className="field-input flex items-center bg-slate-50 font-bold text-slate-600">{editing.status.replaceAll("_", " ")}</div><p className="text-[10px] text-slate-500">Use the lifecycle action to archive or reactivate a project; metadata edits do not rewrite lifecycle history.</p></div><label className="space-y-1 sm:col-span-2"><span className="field-label">Description / notes</span><textarea value={editing.description || ""} onChange={(event) => setEditing({ ...editing, description: event.target.value, notes: event.target.value })} rows={3} className="field-input resize-y" /></label></div><div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" label="Cancel" onClick={() => setEditing(null)} /><Button variant="primary" type="submit" label="Save project" /></div></form></div>}

      {canManage && lifecycleProject && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="project-lifecycle-title"><section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Project correction</p><h2 id="project-lifecycle-title" className="mt-1 text-lg font-black text-slate-950">{lifecycleProject.projectCode} · lifecycle options</h2><p className="mt-1 text-xs text-slate-500">{lifecycleProject.projectName} · current state: {lifecycleProject.status.replaceAll("_", " ")}</p></div><button type="button" onClick={closeLifecycle} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close project lifecycle dialog"><X className="h-4 w-4" /></button></div>{lifecycleLoading && !lifecyclePreview && <p role="status" className="mt-5 rounded-xl bg-slate-50 p-4 text-xs font-semibold text-slate-600">Checking project dependencies…</p>}{lifecycleError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">{lifecycleError}</p>}{lifecyclePreview && <div className="mt-5 space-y-4"><div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-950"><p className="font-black">{lifecyclePreview.source === "database" ? "Database-checked dependency summary" : lifecyclePreview.source === "demo" ? "Demo dependency summary" : "Local dependency summary"}</p><p className="mt-1">{lifecyclePreview.totalDependencyCount ? `${lifecyclePreview.totalDependencyCount} linked record${lifecyclePreview.totalDependencyCount === 1 ? "" : "s"} preserve this project identity.` : "No linked operational or financial history was found."}</p>{lifecyclePreview.source === "demo" && <p className="mt-1 text-[10px] text-indigo-800">Sample records are counted locally; production lifecycle authorization is database-enforced.</p>}{lifecyclePreview.source === "local" && <p className="mt-1 text-[10px] text-indigo-800">Permanent deletion stays unavailable without a database preflight.</p>}{lifecyclePreview.totalDependencyCount > 0 && <ul className="mt-2 grid gap-1 text-[10px] sm:grid-cols-2">{Object.entries(lifecyclePreview.dependencies).filter(([, count]) => count > 0).map(([key, count]) => <li key={key} className="flex justify-between gap-2"><span>{key.replaceAll(/([a-z])([A-Z])/g, "$1 $2")}</span><strong>{count}</strong></li>)}</ul>}</div>{lifecyclePreview.canDelete && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3"><p className="text-xs font-black text-rose-950">Delete unused project</p><p className="mt-1 text-[10px] leading-4 text-rose-900">This permanently deletes the project because no operational or financial history exists. {lifecyclePreview.source === "database" ? "The database will recheck dependencies before deletion." : "This local preview will be rechecked before deletion."}</p><button type="button" disabled={lifecycleLoading} onClick={() => void applyLifecycle("DELETE_UNUSED")} className="mt-3 rounded-lg bg-rose-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40">{lifecycleLoading ? "Deleting…" : "Delete unused project"}</button></div>}{lifecyclePreview.status !== "ARCHIVED" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-black text-amber-950">Archive project</p><p className="mt-1 text-[10px] leading-4 text-amber-900">This keeps the project and its historical records but removes it from active workflows.</p><input value={lifecycleReason} onChange={(event) => setLifecycleReason(event.target.value)} placeholder="Reason for archive" className="mt-3 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs" /><button type="button" disabled={lifecycleLoading || lifecycleReason.trim().length < 3} onClick={() => void applyLifecycle("ARCHIVE")} className="mt-3 rounded-lg bg-amber-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40">{lifecycleLoading ? "Archiving…" : "Archive project"}</button></div>}{lifecyclePreview.status === "ARCHIVED" && lifecyclePreview.canReactivate && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-black text-emerald-950">Reactivate project</p><p className="mt-1 text-[10px] leading-4 text-emerald-900">This returns the project to its prior non-terminal workflow state. Historical records remain unchanged.</p><input value={lifecycleReason} onChange={(event) => setLifecycleReason(event.target.value)} placeholder="Reason for reactivation" className="mt-3 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs" /><button type="button" disabled={lifecycleLoading || lifecycleReason.trim().length < 3} onClick={() => void applyLifecycle("REACTIVATE")} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40">{lifecycleLoading ? "Reactivating…" : "Reactivate project"}</button></div>}{lifecyclePreview.status === "ARCHIVED" && !lifecyclePreview.canReactivate && <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] leading-4 text-slate-600">{lifecyclePreview.blockedReason || "This archived project cannot be reactivated because its prior state is unavailable or terminal."}</p>}</div>}</section></div>}
    </div>
  );
};
