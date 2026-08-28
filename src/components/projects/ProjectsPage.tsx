import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, BriefcaseBusiness, ChevronRight, Filter, Pencil, Plus, Search, X } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import type { Project, ProjectCostSummary, ProjectStatus } from "../../types";
import { createLocalProject } from "../../lib/projects";
import { projectSearchMatches } from "../../utils/projectMatching";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { useAppPermissions } from "../../app/AppPermissionContext.tsx";
import { EmptyState, MetricCard, PageHeader, StatusBadge, type StatusTone } from "../ui/OperationsUI";

interface ProjectsPageProps {
  projects: Project[];
  summaries: Record<string, ProjectCostSummary>;
  onOpenProject: (project: Project) => void;
  onSaveProject: (project: Project) => void;
  onArchiveProject: (project: Project) => void;
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
  onArchiveProject,
  initialEditingProject,
}) => {
  const permissions = useAppPermissions();
  const canManage = hasPermission(permissions, PERMISSION_KEYS.projectsWrite);
  const hiddenCostSources = [
    !hasPermission(permissions, PERMISSION_KEYS.invoicesRead) ? "supplier invoices" : null,
    !hasPermission(permissions, PERMISSION_KEYS.payrollRead) ? "payroll detail" : null,
    !hasPermission(permissions, PERMISSION_KEYS.expensesRead) ? "direct expenses" : null,
  ].filter((value): value is string => Boolean(value));
  const costDataComplete = hiddenCostSources.length === 0;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | ProjectStatus>("ALL");
  const [editing, setEditing] = useState<Project | null>(null);

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

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Engineering operations" title="Projects" description="Projects are the cost context for supplier invoices, labor, and direct expenses." actions={canManage ? <Button variant="primary" label="New project" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing(blankProject())} /> : undefined} />

      {!costDataComplete && <div role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><strong>Partial cost visibility.</strong> Recorded-cost and remaining-budget figures below exclude {hiddenCostSources.join(", ")} because your role cannot read those source records.</div></div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Project register summary">
        <MetricCard label="All projects" value={projects.length} icon={BriefcaseBusiness} tone="info" />
        <MetricCard label="Active" value={projects.filter((project) => project.status === "ACTIVE" || (project.status as string) === "IN_PROGRESS").length} tone="success" />
        <MetricCard label="On hold" value={projects.filter((project) => project.status === "ON_HOLD").length} tone="warning" />
        <MetricCard label="Archived" value={projects.filter((project) => project.status === "ARCHIVED").length} tone="neutral" />
      </div>

      <Card className="p-3" elevation="low" aria-label="Project filters"><div className="flex flex-col gap-2 md:flex-row"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"><Search aria-hidden="true" className="h-4 w-4 text-slate-400" /><span className="sr-only">Search projects</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, project, client, location, manager…" className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400" /></label><label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"><Filter aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" /><span className="sr-only">Project status</span><select value={status} onChange={(event) => setStatus(event.target.value as "ALL" | ProjectStatus)} className="bg-transparent text-xs font-semibold outline-none"><option value="ALL">All statuses</option>{["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "ARCHIVED"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label></div></Card>

      {filtered.length ? <Card className="overflow-hidden p-0" elevation="low" aria-label="Projects table"><div className="ops-scrollbar overflow-auto"><table className="ops-table min-w-[900px] w-full text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Project</th><th className="px-4 py-3">Client / location</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Budget</th><th className="px-4 py-3 text-right">{costDataComplete ? "Recorded cost" : "Visible cost"}</th><th className="px-4 py-3 text-right">{costDataComplete ? "Remaining" : "Visible-data balance"}</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((project) => { const summary = summaries[project.id] || ({ budget: project.projectBudget, totalActualCost: 0, remainingBudget: project.projectBudget, budgetUsedPercent: 0 } as ProjectCostSummary); return <tr key={project.id}><td className="px-4 py-3"><button type="button" onClick={() => onOpenProject(project)} className="text-left hover:text-indigo-700"><span className="block text-[10px] font-black uppercase tracking-wide text-indigo-600">{project.projectCode}</span><strong className="mt-0.5 block text-xs text-slate-900">{project.projectName}</strong></button></td><td className="max-w-[220px] px-4 py-3"><strong className="block truncate text-[10px] text-slate-700">{project.clientName || "No client set"}</strong><span className="mt-0.5 block truncate text-[10px] text-slate-500">{project.location || project.siteAddress || "Location not set"}</span></td><td className="px-4 py-3"><StatusBadge tone={statusTone(project.status)}>{project.status.replaceAll("_", " ")}</StatusBadge></td><td className="px-4 py-3 text-right font-sans font-bold tabular-nums">{money(summary.budget, project.currency)}</td><td className="px-4 py-3 text-right font-sans font-bold tabular-nums">{money(summary.totalActualCost, project.currency)}</td><td className={`px-4 py-3 text-right font-sans font-bold tabular-nums ${summary.remainingBudget < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(summary.remainingBudget, project.currency)}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" onClick={() => onOpenProject(project)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" aria-label={`Open ${project.projectName}`}><ChevronRight className="h-4 w-4" /></button>{canManage && project.status !== "ARCHIVED" && <><button type="button" onClick={() => setEditing(project)} className="rounded-lg p-2 text-slate-400 hover:bg-indigo-50 hover:text-indigo-700" aria-label={`Edit ${project.projectName}`}><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => onArchiveProject(project)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700" aria-label={`Archive ${project.projectName}`}><Archive className="h-3.5 w-3.5" /></button></>}</div></td></tr>; })}</tbody></table></div></Card> : <EmptyState icon={BriefcaseBusiness} title={projects.length ? "No projects match this filter" : "No projects yet"} description={canManage ? "Create a project to connect supplier invoices, payroll, and direct costs." : "No projects are available for the current filter."} action={canManage ? <Button variant="primary" label="Create project" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing(blankProject())} /> : undefined} />}

      {canManage && editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="project-form-title"><form onSubmit={save} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Project register</p><h2 id="project-form-title" className="mt-1 text-lg font-black text-slate-950">{projects.some((project) => project.id === editing.id) ? "Edit project" : "New project"}</h2><p className="mt-1 text-xs text-slate-500">Codes are unique within the workspace and remain searchable.</p></div><button type="button" onClick={() => setEditing(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close project form"><X className="h-4 w-4" /></button></div><div className="grid gap-3 sm:grid-cols-2">{([ ["projectCode", "Project code"], ["projectName", "Project name"], ["clientName", "Client"], ["location", "Location"], ["projectManager", "Project manager"], ["currency", "Currency"] ] as Array<[keyof Project, string]>).map(([key, label]) => <label key={String(key)} className="space-y-1"><span className="field-label">{label}</span><input required={key === "projectCode" || key === "projectName"} value={String(editing[key] || "")} onChange={(event) => setEditing({ ...editing, [key]: event.target.value })} className="field-input" /></label>)}<label className="space-y-1"><span className="field-label">Budget</span><input type="number" min="0" step="0.01" value={editing.projectBudget} onChange={(event) => setEditing({ ...editing, projectBudget: Number(event.target.value) })} className="field-input" /></label><label className="space-y-1"><span className="field-label">Status</span><select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value as ProjectStatus })} className="field-input">{["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "ARCHIVED"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label className="space-y-1 sm:col-span-2"><span className="field-label">Description / notes</span><textarea value={editing.description || ""} onChange={(event) => setEditing({ ...editing, description: event.target.value, notes: event.target.value })} rows={3} className="field-input resize-y" /></label></div><div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" label="Cancel" onClick={() => setEditing(null)} /><Button variant="primary" type="submit" label="Save project" /></div></form></div>}
    </div>
  );
};
