import React, { useMemo, useState } from "react";
import { ArrowRightLeft, CheckCircle2, Cog, History, Lock, MapPin, Plus, RotateCcw, ShieldAlert, Truck, Wrench, X } from "lucide-react";
import type { EngineeringDailySiteLogsWorkspaceData } from "../../lib/dailySiteLogs.ts";
import type { Equipment, EquipmentAssignment, EquipmentLifecycleStatus, Project, ProjectEquipment } from "../../types.ts";
import type { EquipmentSaveInput } from "../../lib/equipment.ts";
import { DisclosureSection, PageHeader, StatusBadge, type StatusTone } from "../ui/OperationsUI.tsx";

const inputClass = "mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100";
const labelClass = "block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500";

type EquipmentAction = "ADD" | "EDIT" | "ASSIGN" | "TRANSFER" | "RETURN" | "LIFECYCLE";

interface EquipmentPageProps {
  equipment: readonly Equipment[];
  assignments: readonly EquipmentAssignment[];
  projects: readonly Project[];
  legacyEquipment?: readonly ProjectEquipment[];
  siteLogsData?: EngineeringDailySiteLogsWorkspaceData;
  canRead: boolean;
  canManage: boolean;
  onOpenProject?: (project: Project) => void;
  onSave?: (input: EquipmentSaveInput) => Promise<Equipment>;
  onAssign?: (equipmentId: string, projectId: string, assignmentStart: string, notes?: string) => Promise<void>;
  onTransfer?: (equipmentId: string, projectId: string, assignmentStart: string, notes?: string) => Promise<void>;
  onReturn?: (equipmentId: string, assignmentEnd: string, notes?: string) => Promise<void>;
  onSetLifecycle?: (equipmentId: string, status: EquipmentLifecycleStatus, reason: string) => Promise<void>;
}

function today() { return new Date().toISOString().slice(0, 10); }

function stateTone(state: Equipment["currentState"]): StatusTone {
  return state === "AVAILABLE" ? "success" : state === "ASSIGNED" ? "info" : state === "MAINTENANCE" ? "warning" : "neutral";
}

function stateLabel(state: Equipment["currentState"]) { return String(state || "AVAILABLE").replaceAll("_", " "); }

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4"><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-4 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-6"><div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-600">Company Equipment</p><h2 className="mt-1 text-xl font-black text-slate-950">{title}</h2></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" aria-label="Close dialog"><X className="h-5 w-5" /></button></div><div className="pt-4">{children}</div></section></div>;
}

function EquipmentForm({ item, onSave, onClose }: { item?: Equipment; onSave: (input: EquipmentSaveInput) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<EquipmentSaveInput>({ id: item?.id, assetReference: item?.assetReference || "", equipmentName: item?.equipmentName || "", equipmentType: item?.equipmentType || "", equipmentSource: item?.equipmentSource || "OWNED", providerName: item?.providerName || "", lifecycleStatus: item?.lifecycleStatus || "AVAILABLE", notes: item?.notes || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = <K extends keyof EquipmentSaveInput>(key: K, value: EquipmentSaveInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(null); try { if (!form.equipmentName?.trim()) throw new Error("Equipment name is required."); await onSave({ ...form, equipmentName: form.equipmentName.trim() }); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Equipment could not be saved."); } finally { setBusy(false); } };
  return <Modal title={`${item ? "Edit" : "Add"} canonical Equipment`} onClose={onClose}><form onSubmit={(event) => void submit(event)} className="space-y-4"><div className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs leading-5 text-orange-950">The registry is the company asset identity. Project assignment is separate auditable history; the project surface never becomes a competing asset master.</div>{error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</p>}<div className="grid gap-3 sm:grid-cols-2"><label><span className={labelClass}>Asset / reference code</span><input className={inputClass} value={form.assetReference || ""} onChange={(event) => update("assetReference", event.target.value)} placeholder="EX-01" /></label><label><span className={labelClass}>Equipment name</span><input required className={inputClass} value={form.equipmentName} onChange={(event) => update("equipmentName", event.target.value)} placeholder="Excavator 20T" /></label><label><span className={labelClass}>Type / category</span><input className={inputClass} value={form.equipmentType || ""} onChange={(event) => update("equipmentType", event.target.value)} placeholder="Earthworks" /></label><label><span className={labelClass}>Ownership / source</span><select className={inputClass} value={form.equipmentSource || "OWNED"} onChange={(event) => update("equipmentSource", event.target.value as EquipmentSaveInput["equipmentSource"])}><option value="OWNED">Owned</option><option value="RENTED">Rented</option><option value="SUBCONTRACTOR">Subcontractor</option><option value="OTHER">Other</option></select></label><label className="sm:col-span-2"><span className={labelClass}>Provider / vendor</span><input className={inputClass} value={form.providerName || ""} onChange={(event) => update("providerName", event.target.value)} placeholder="Optional" /></label><label className="sm:col-span-2"><span className={labelClass}>Notes</span><textarea rows={3} className={inputClass} value={form.notes || ""} onChange={(event) => update("notes", event.target.value)} /></label></div><div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700">Cancel</button><button type="submit" disabled={busy} className="min-h-10 rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{busy ? "Saving…" : "Save Equipment"}</button></div></form></Modal>;
}

function AssignmentForm({ action, item, projects, onSubmit, onClose }: { action: "ASSIGN" | "TRANSFER" | "RETURN"; item: Equipment; projects: readonly Project[]; onSubmit: (projectId: string, date: string, notes: string) => Promise<void>; onClose: () => void }) {
  const [projectId, setProjectId] = useState(item.currentProjectId || "");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(null); try { if (action !== "RETURN" && !projectId) throw new Error("Choose a Project."); await onSubmit(projectId, date, notes); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Equipment assignment could not be changed."); } finally { setBusy(false); } };
  return <Modal title={action === "ASSIGN" ? "Assign Equipment" : action === "TRANSFER" ? "Transfer Equipment" : "Return Equipment"} onClose={onClose}><form onSubmit={(event) => void submit(event)} className="space-y-4"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700"><strong>{item.assetReference || item.equipmentName}</strong> · current state {stateLabel(item.currentState)}{item.currentProjectId ? ` · ${projects.find((project) => project.id === item.currentProjectId)?.projectCode || "Project"}` : ""}</div>{error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</p>}{action !== "RETURN" && <label><span className={labelClass}>Project</span><select required className={inputClass} value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Choose Project</option>{projects.filter((project) => project.status !== "ARCHIVED").map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.projectName}</option>)}</select></label>}<label><span className={labelClass}>{action === "RETURN" ? "Return date" : "Assignment start"}</span><input required type="date" className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} /></label><label><span className={labelClass}>Reason / notes</span><textarea rows={3} className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={action === "TRANSFER" ? "Transfer reason" : "Optional operational note"} /></label><div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700">Cancel</button><button type="submit" disabled={busy} className="min-h-10 rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{busy ? "Saving…" : action === "ASSIGN" ? "Assign" : action === "TRANSFER" ? "Transfer" : "Return"}</button></div></form></Modal>;
}

function LifecycleForm({ item, onSubmit, onClose }: { item: Equipment; onSubmit: (status: EquipmentLifecycleStatus, reason: string) => Promise<void>; onClose: () => void }) {
  const [status, setStatus] = useState<EquipmentLifecycleStatus>(item.lifecycleStatus);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(null); try { if (reason.trim().length < 3) throw new Error("Give a reason with at least 3 characters."); await onSubmit(status, reason.trim()); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Lifecycle state could not be changed."); } finally { setBusy(false); } };
  return <Modal title="Change Equipment lifecycle" onClose={onClose}><form onSubmit={(event) => void submit(event)} className="space-y-4"><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">Setting maintenance, out of service, or retired while assigned closes the active assignment atomically. Making an assigned asset available requires an explicit Return or Transfer first.</div>{error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</p>}<label><span className={labelClass}>Lifecycle state</span><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as EquipmentLifecycleStatus)}><option value="AVAILABLE">Available</option><option value="MAINTENANCE">Maintenance</option><option value="OUT_OF_SERVICE">Out of service</option><option value="RETIRED">Retired</option></select></label><label><span className={labelClass}>Reason</span><textarea required rows={3} className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Maintenance inspection required" /></label><div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700">Cancel</button><button type="submit" disabled={busy} className="min-h-10 rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{busy ? "Saving…" : "Save state"}</button></div></form></Modal>;
}

export const EquipmentPage: React.FC<EquipmentPageProps> = ({ equipment, assignments, projects, legacyEquipment = [], siteLogsData, canRead, canManage, onOpenProject, onSave, onAssign, onTransfer, onReturn, onSetLifecycle }) => {
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<"ALL" | Equipment["currentState"]>("ALL");
  const [selected, setSelected] = useState<Equipment | null>(null);
  const [action, setAction] = useState<{ type: EquipmentAction; item?: Equipment } | null>(null);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const assignmentsByEquipment = useMemo(() => new Map(equipment.map((item) => [item.id, assignments.filter((assignment) => assignment.equipmentId === item.id).sort((left, right) => right.assignmentStart.localeCompare(left.assignmentStart))])), [assignments, equipment]);
  const evidenceByEquipment = useMemo(() => {
    const logDateById = new Map((siteLogsData?.logs || []).filter((log) => log.status !== "VOID").map((log) => [log.id, log.siteDate]));
    const result = new Map<string, { count: number; latestDate?: string; condition?: string }>();
    for (const item of equipment) {
      const legacyIds = new Set(legacyEquipment.filter((legacy) => (legacy.canonicalEquipmentId || `legacy-equipment-${legacy.id}`) === item.id).map((legacy) => legacy.id));
      const observations = (siteLogsData?.equipment || []).filter((observation) => observation.equipmentId && legacyIds.has(observation.equipmentId) && logDateById.has(observation.siteLogId)).sort((left, right) => (logDateById.get(right.siteLogId) || "").localeCompare(logDateById.get(left.siteLogId) || ""));
      result.set(item.id, { count: observations.length, latestDate: observations[0] ? logDateById.get(observations[0].siteLogId) : undefined, condition: observations[0]?.conditionStatus });
    }
    return result;
  }, [equipment, legacyEquipment, siteLogsData]);
  const unresolvedLegacyCount = legacyEquipment.filter((legacy) => !legacy.canonicalEquipmentId && !equipment.some((item) => item.id === `legacy-equipment-${legacy.id}`)).length;
  const filtered = equipment.filter((item) => (stateFilter === "ALL" || item.currentState === stateFilter) && (!query.trim() || `${item.assetReference || ""} ${item.equipmentName} ${item.equipmentType || ""} ${item.providerName || ""} ${projectById.get(item.currentProjectId || "")?.projectCode || ""}`.toLowerCase().includes(query.trim().toLowerCase())));

  if (!canRead) return <section className="space-y-4"><PageHeader eyebrow="Company operations" title="Equipment" description="Canonical company Equipment and auditable Project assignments." /><div role="status" className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-black text-slate-900">Equipment access is restricted.</p><p className="mt-1">Your current permission set does not include Equipment Registry read access. No asset or assignment details are shown.</p></div></div></section>;

  const save = async (input: EquipmentSaveInput) => { if (!onSave) throw new Error("Equipment management is unavailable."); await onSave(input); };
  const assignmentForm = action && action.item && (action.type === "ASSIGN" || action.type === "TRANSFER" || action.type === "RETURN") ? <AssignmentForm action={action.type} item={action.item} projects={projects} onClose={() => setAction(null)} onSubmit={async (projectId, date, notes) => { if (action.type === "ASSIGN") { if (!onAssign) throw new Error("Assignment management is unavailable."); await onAssign(action.item!.id, projectId, date, notes); } else if (action.type === "TRANSFER") { if (!onTransfer) throw new Error("Transfer management is unavailable."); await onTransfer(action.item!.id, projectId, date, notes); } else { if (!onReturn) throw new Error("Return management is unavailable."); await onReturn(action.item!.id, date, notes); } }} /> : null;

  return (
    <section className="space-y-5" data-domain="equipment-registry">
      <PageHeader
        eyebrow="Company operations"
        title="Equipment Registry"
        description="One canonical company asset identity, with current state derived from auditable Project assignment history."
        actions={canManage ? <button type="button" onClick={() => setAction({ type: "ADD" })} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-orange-600 px-3 py-2 text-xs font-black text-white"><Plus className="h-3.5 w-3.5" />Add Equipment</button> : undefined}
      />
      {unresolvedLegacyCount > 0 && <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div><p className="font-black">{unresolvedLegacyCount} legacy Project Equipment record{unresolvedLegacyCount === 1 ? " remains" : "s remain"} outside the canonical registry.</p><p className="mt-1">Duplicate or missing asset references need human resolution before they can be linked. They remain in the original Project register and are not silently merged.</p></div>
      </div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><p className="mt-3 text-2xl font-black text-emerald-950">{equipment.filter((item) => item.currentState === "AVAILABLE").length}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">Available</p></div>
        <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4"><MapPin className="h-5 w-5 text-sky-600" /><p className="mt-3 text-2xl font-black text-sky-950">{equipment.filter((item) => item.currentState === "ASSIGNED").length}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-sky-700">Assigned</p></div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><Wrench className="h-5 w-5 text-amber-600" /><p className="mt-3 text-2xl font-black text-amber-950">{equipment.filter((item) => item.currentState === "MAINTENANCE").length}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-amber-700">Maintenance</p></div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><ShieldAlert className="h-5 w-5 text-slate-600" /><p className="mt-3 text-2xl font-black text-slate-950">{equipment.filter((item) => item.currentState === "OUT_OF_SERVICE").length}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-600">Out of service</p></div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><Lock className="h-5 w-5 text-violet-600" /><p className="mt-3 text-2xl font-black text-violet-950">{equipment.filter((item) => item.currentState === "RETIRED").length}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-violet-700">Retired</p></div>
      </div>
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(0,1fr)_180px]">
        <input aria-label="Search Equipment" className={`${inputClass} mt-0`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search asset, name, type, provider, Project…" />
        <select aria-label="Filter Equipment state" className={`${inputClass} mt-0`} value={stateFilter} onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)}><option value="ALL">All states</option><option value="AVAILABLE">Available</option><option value="ASSIGNED">Assigned</option><option value="MAINTENANCE">Maintenance</option><option value="OUT_OF_SERVICE">Out of service</option><option value="RETIRED">Retired</option></select>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden min-w-0 grid-cols-[minmax(160px,1.3fr)_100px_110px_minmax(130px,1fr)_100px_minmax(150px,1fr)] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500 lg:grid"><span>Asset</span><span>Type / source</span><span>Current state</span><span>Current Project</span><span>Field evidence</span><span /></div>
        {filtered.length ? filtered.map((item) => {
          const project = item.currentProjectId ? projectById.get(item.currentProjectId) : undefined;
          const evidence = evidenceByEquipment.get(item.id);
          return <div key={item.id} className="grid min-w-0 gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(160px,1.3fr)_100px_110px_minmax(130px,1fr)_100px_minmax(150px,1fr)] lg:items-center">
            <div className="min-w-0"><button type="button" onClick={() => setSelected(item)} className="break-words text-left text-sm font-black text-orange-700 hover:underline">{item.assetReference || "No asset code"} · {item.equipmentName}</button><p className="mt-1 text-[10px] text-slate-500">{item.equipmentType || "Type not recorded"}{item.providerName ? ` · ${item.providerName}` : ""}</p></div>
            <div className="text-xs text-slate-700"><span className="lg:hidden text-[10px] font-black uppercase tracking-wide text-slate-400">Type / source · </span>{item.equipmentType || "Unspecified"} · {item.equipmentSource}</div>
            <div><span className="lg:hidden text-[10px] font-black uppercase tracking-wide text-slate-400">State · </span><StatusBadge tone={stateTone(item.currentState)}>{stateLabel(item.currentState)}</StatusBadge></div>
            <div className="text-xs text-slate-700"><span className="lg:hidden text-[10px] font-black uppercase tracking-wide text-slate-400">Project · </span>{project ? <>{onOpenProject ? <button type="button" onClick={() => onOpenProject(project)} className="font-black text-indigo-700 hover:underline">{project.projectCode} · {project.projectName}</button> : <span className="font-black">{project.projectCode} · {project.projectName}</span>}<span className="mt-1 block text-[10px] text-slate-500">Assigned {item.currentAssignmentStart || "date unavailable"}</span></> : <span className="text-slate-500">Company equipment pool</span>}</div>
            <div className="text-xs text-slate-700"><span className="lg:hidden text-[10px] font-black uppercase tracking-wide text-slate-400">Evidence · </span>{evidence?.count ? `${evidence.count} observation${evidence.count === 1 ? "" : "s"}` : "No linked observation"}{evidence?.latestDate && <span className="mt-1 block text-[10px] text-slate-500">Latest {evidence.latestDate}{evidence.condition ? ` · ${evidence.condition}` : ""}</span>}</div>
            <div className="flex flex-wrap justify-start gap-1.5 lg:justify-end">
              {canManage && item.currentState === "AVAILABLE" && <button type="button" onClick={() => setAction({ type: "ASSIGN", item })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-sky-200 px-2.5 py-1.5 text-[10px] font-black text-sky-800"><MapPin className="h-3 w-3" />Assign</button>}
              {canManage && item.currentState === "ASSIGNED" && <><button type="button" onClick={() => setAction({ type: "TRANSFER", item })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-indigo-200 px-2.5 py-1.5 text-[10px] font-black text-indigo-800"><ArrowRightLeft className="h-3 w-3" />Transfer</button><button type="button" onClick={() => setAction({ type: "RETURN", item })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-cyan-200 px-2.5 py-1.5 text-[10px] font-black text-cyan-800"><RotateCcw className="h-3 w-3" />Return</button></>}
              {canManage && <button type="button" onClick={() => setAction({ type: "LIFECYCLE", item })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-amber-200 px-2.5 py-1.5 text-[10px] font-black text-amber-800"><Wrench className="h-3 w-3" />Lifecycle</button>}
              {canManage && <button type="button" onClick={() => setAction({ type: "EDIT", item })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black text-slate-700">Edit</button>}
              <button type="button" onClick={() => setSelected(item)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black text-slate-700"><History className="h-3 w-3" />History</button>
            </div>
          </div>;
        }) : <div className="p-12 text-center"><Truck className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-black text-slate-700">{equipment.length ? "No Equipment matches this filter." : "No canonical Equipment yet."}</p><p className="mt-1 text-xs leading-5 text-slate-500">{equipment.length ? "Change the search or state filter." : canManage ? "Add a company Equipment asset, then assign it through the guarded workflow." : "Equipment records will appear here when authorized."}</p></div>}
      </div>
      <DisclosureSection title="Assignment authority is separate from field evidence" description="Keep the asset register focused while preserving the distinction.">
        <div className="flex items-start gap-3 text-xs leading-5 text-slate-700"><Cog className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" /><p>Daily Site Log observations can be shown beside an asset, but never rewrite formal assignment history. Available, maintenance, out-of-service, and retired states remain explicit lifecycle controls.</p></div>
      </DisclosureSection>
      {selected && <Modal title={`${selected.assetReference || "Equipment"} · ${selected.equipmentName}`} onClose={() => setSelected(null)}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-slate-50 p-3"><p className={labelClass}>State</p><p className="mt-1 text-lg font-black">{stateLabel(selected.currentState)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className={labelClass}>Project</p><p className="mt-1 text-sm font-black">{selected.currentProjectId ? projectById.get(selected.currentProjectId)?.projectCode || "Unavailable" : "Pool"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className={labelClass}>Start</p><p className="mt-1 text-sm font-black">{selected.currentAssignmentStart || "—"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className={labelClass}>Field evidence</p><p className="mt-1 text-sm font-black">{evidenceByEquipment.get(selected.id)?.count || 0} observations</p></div></div>
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">{selected.notes || "No canonical notes recorded."}</p>
          <div><p className="mb-2 text-xs font-black text-slate-900">Assignment history</p><div className="overflow-hidden rounded-xl border border-slate-200">{(assignmentsByEquipment.get(selected.id) || []).length ? (assignmentsByEquipment.get(selected.id) || []).map((assignment) => <div key={assignment.id} className="border-b border-slate-100 p-3 last:border-b-0"><p className="text-xs font-black text-slate-800">{projectById.get(assignment.projectId)?.projectCode || "Project unavailable"} · {projectById.get(assignment.projectId)?.projectName || "Historical Project"}</p><p className="mt-1 text-[10px] text-slate-500">{assignment.assignmentStart} → {assignment.assignmentEnd || "Active"}{assignment.transferFromAssignmentId ? " · transferred" : ""}</p>{assignment.notes && <p className="mt-1 text-[10px] text-slate-600">{assignment.notes}</p>}</div>) : <p className="p-4 text-xs text-slate-500">No assignment history.</p>}</div></div>
          <div className="flex flex-wrap justify-end gap-2">{canManage && selected.currentState === "AVAILABLE" && <button type="button" onClick={() => { setSelected(null); setAction({ type: "ASSIGN", item: selected }); }} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-orange-600 px-3 py-2 text-xs font-black text-white">Assign</button>}{canManage && selected.currentState === "ASSIGNED" && <><button type="button" onClick={() => { setSelected(null); setAction({ type: "TRANSFER", item: selected }); }} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-indigo-200 px-3 py-2 text-xs font-black text-indigo-800">Transfer</button><button type="button" onClick={() => { setSelected(null); setAction({ type: "RETURN", item: selected }); }} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-cyan-200 px-3 py-2 text-xs font-black text-cyan-800">Return</button></>}{canManage && <button type="button" onClick={() => { setSelected(null); setAction({ type: "LIFECYCLE", item: selected }); }} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-amber-200 px-3 py-2 text-xs font-black text-amber-800">Lifecycle</button>}</div>
        </div>
      </Modal>}
      {action?.type === "ADD" && <EquipmentForm onSave={save} onClose={() => setAction(null)} />}
      {action?.type === "EDIT" && action.item && <EquipmentForm item={action.item} onSave={save} onClose={() => setAction(null)} />}
      {action?.type === "LIFECYCLE" && action.item && <LifecycleForm item={action.item} onSubmit={async (status, reason) => { if (!onSetLifecycle) throw new Error("Lifecycle management is unavailable."); await onSetLifecycle(action.item!.id, status, reason); }} onClose={() => setAction(null)} />}
      {assignmentForm}
    </section>
  );
};

export default EquipmentPage;
