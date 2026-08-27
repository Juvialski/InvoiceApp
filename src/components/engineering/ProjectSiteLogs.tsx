import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, CloudRain, Cog, FileText, HardHat, History, Plus, Save, ShieldAlert, Users, X } from "lucide-react";
import type { Project } from "../../types.ts";
import { appPathForProject } from "../../utils/appRouting.ts";
import {
  DAILY_SITE_LOG_SAFETY_SEVERITIES,
  DAILY_SITE_LOG_STATUSES,
  DAILY_SITE_LOG_WEATHER_CONDITIONS,
  type DailySiteLogStatus,
  type DailySiteLogSafetySeverity,
  type DailySiteLogWeatherCondition,
  type EngineeringDailySiteLogAggregate,
  type EngineeringDailySiteLogsWorkspaceData,
} from "../../lib/dailySiteLogs.ts";
import { useDailySiteLogsController } from "../../features/engineering/useDailySiteLogsController.ts";

const inputClass = "mt-1 w-full min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";
const labelClass = "block text-[11px] font-black uppercase tracking-[0.08em] text-slate-500";
const sectionClass = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

type FormNumber = number | "";
interface SiteLogForm {
  siteDate: string;
  workSummary: string;
  progressNotes: string;
  delaysConstraints: string;
  generalNotes: string;
  weather: {
    condition: DailySiteLogWeatherCondition;
    temperature: FormNumber;
    temperatureUnit: "C" | "F";
    precipitationNotes: string;
    windNotes: string;
    humidity: FormNumber;
    siteConditionNotes: string;
  };
  crew: Array<{
    id?: string;
    trade: string;
    crewLabel: string;
    contractorLabel: string;
    headcount: FormNumber;
    regularHours: FormNumber;
    overtimeHours: FormNumber;
    notes: string;
  }>;
  equipment: Array<{
    id?: string;
    equipmentName: string;
    equipmentType: string;
    assetReference: string;
    operatingHours: FormNumber;
    idleHours: FormNumber;
    operatorCrewNote: string;
    conditionStatus: string;
    notes: string;
  }>;
  safety: Array<{
    id?: string;
    category: string;
    severity: DailySiteLogSafetySeverity;
    description: string;
    actionTaken: string;
    isResolved: boolean;
    notes: string;
  }>;
}

export interface ProjectSiteLogsProps {
  project: Project;
  companyId?: string;
  canRead?: boolean;
  canCreate?: boolean;
  canUpdate?: boolean;
  canSubmit?: boolean;
  canManage?: boolean;
  guestMode?: boolean;
  initialSiteLogId?: string;
  pathForSiteLog?: (siteLogId?: string) => string;
  controlledData?: EngineeringDailySiteLogsWorkspaceData;
  onControlledDataChange?: (data: EngineeringDailySiteLogsWorkspaceData) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(siteDate = today()): SiteLogForm {
  return {
    siteDate,
    workSummary: "",
    progressNotes: "",
    delaysConstraints: "",
    generalNotes: "",
    weather: { condition: "CLEAR", temperature: "", temperatureUnit: "C", precipitationNotes: "", windNotes: "", humidity: "", siteConditionNotes: "" },
    crew: [{ trade: "", crewLabel: "General site crew", contractorLabel: "", headcount: 0, regularHours: "", overtimeHours: "", notes: "" }],
    equipment: [],
    safety: [],
  };
}

function formFromAggregate(aggregate: EngineeringDailySiteLogAggregate): SiteLogForm {
  const weather = aggregate.weather;
  return {
    siteDate: aggregate.log.siteDate,
    workSummary: aggregate.log.workSummary,
    progressNotes: aggregate.log.progressNotes || "",
    delaysConstraints: aggregate.log.delaysConstraints || "",
    generalNotes: aggregate.log.generalNotes || "",
    weather: {
      condition: weather?.condition || "UNKNOWN",
      temperature: weather?.temperature ?? "",
      temperatureUnit: weather?.temperatureUnit || "C",
      precipitationNotes: weather?.precipitationNotes || "",
      windNotes: weather?.windNotes || "",
      humidity: weather?.humidity ?? "",
      siteConditionNotes: weather?.siteConditionNotes || "",
    },
    crew: aggregate.crew.map((row) => ({ id: row.id, trade: row.trade || "", crewLabel: row.crewLabel || "", contractorLabel: row.contractorLabel || "", headcount: row.headcount, regularHours: row.regularHours ?? "", overtimeHours: row.overtimeHours ?? "", notes: row.notes || "" })),
    equipment: aggregate.equipment.map((row) => ({ id: row.id, equipmentName: row.equipmentName, equipmentType: row.equipmentType || "", assetReference: row.assetReference || "", operatingHours: row.operatingHours ?? "", idleHours: row.idleHours ?? "", operatorCrewNote: row.operatorCrewNote || "", conditionStatus: row.conditionStatus || "", notes: row.notes || "" })),
    safety: aggregate.safety.map((row) => ({ id: row.id, category: row.category, severity: row.severity, description: row.description, actionTaken: row.actionTaken || "", isResolved: row.isResolved, notes: row.notes || "" })),
  };
}

function numberOrUndefined(value: FormNumber) {
  return value === "" ? undefined : Number(value);
}

function formNumber(value: string): FormNumber {
  return value === "" ? "" : Number(value);
}

function formToInput(form: SiteLogForm) {
  return {
    siteDate: form.siteDate,
    workSummary: form.workSummary,
    progressNotes: form.progressNotes,
    delaysConstraints: form.delaysConstraints,
    generalNotes: form.generalNotes,
    weather: { ...form.weather, temperature: numberOrUndefined(form.weather.temperature), humidity: numberOrUndefined(form.weather.humidity) },
    crew: form.crew.map((row, index) => ({ ...row, headcount: Number(row.headcount || 0), regularHours: numberOrUndefined(row.regularHours), overtimeHours: numberOrUndefined(row.overtimeHours), sortOrder: index })),
    equipment: form.equipment.map((row, index) => ({ ...row, operatingHours: numberOrUndefined(row.operatingHours), idleHours: numberOrUndefined(row.idleHours), sortOrder: index })),
    safety: form.safety.map((row, index) => ({ ...row, sortOrder: index })),
  };
}

function statusClass(status: string) {
  if (status === "FINALIZED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "SUBMITTED") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "VOID") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function conditionLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function totalHeadcount(aggregate: EngineeringDailySiteLogAggregate) {
  return aggregate.crew.reduce((sum, row) => sum + row.headcount, 0);
}

function logSummary(aggregate: EngineeringDailySiteLogAggregate) {
  return {
    headcount: totalHeadcount(aggregate),
    safetyCount: aggregate.safety.length,
    equipmentCount: aggregate.equipment.length,
  };
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</p><div className="mt-1 text-sm font-semibold text-slate-800">{children}</div></div>;
}

function Editor({ form, setForm, onSubmit, onCancel, saving, error, title }: { form: SiteLogForm; setForm: React.Dispatch<React.SetStateAction<SiteLogForm>>; onSubmit: () => void; onCancel: () => void; saving: boolean; error: string | null; title: string }) {
  const update = <K extends keyof SiteLogForm>(key: K, value: SiteLogForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Field reporting</p><h2 className="mt-1 text-xl font-black text-slate-950">{title}</h2><p className="mt-1 text-xs text-slate-500">Save a draft as you go. Submission checks the complete field record before formal history is created.</p></div>
          <button type="button" onClick={onCancel} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close Site Log editor"><X className="h-5 w-5" /></button>
        </div>
        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-800">{error}</div>}

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.6fr)]">
          <div className="space-y-4">
            <section className={sectionClass}>
              <div className="flex items-start gap-3"><FileText className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" /><div><h3 className="text-sm font-black text-slate-900">Work and progress</h3><p className="mt-1 text-xs text-slate-500">Capture what actually happened on site, not payroll timekeeping.</p></div></div>
              <div className="mt-4 space-y-4"><label className="block"><span className={labelClass}>Reporting day</span><input required type="date" className={inputClass} value={form.siteDate} onChange={(event) => update("siteDate", event.target.value)} /></label><label className="block"><span className={labelClass}>Work performed / summary</span><textarea required rows={4} className={`${inputClass} resize-y`} value={form.workSummary} onChange={(event) => update("workSummary", event.target.value)} placeholder="Excavation, formwork, concrete placement, inspections…" /></label><label className="block"><span className={labelClass}>Progress notes</span><textarea rows={3} className={`${inputClass} resize-y`} value={form.progressNotes} onChange={(event) => update("progressNotes", event.target.value)} placeholder="Quantities, locations, milestones, or progress observations…" /></label><label className="block"><span className={labelClass}>Delays and constraints</span><textarea rows={3} className={`${inputClass} resize-y`} value={form.delaysConstraints} onChange={(event) => update("delaysConstraints", event.target.value)} placeholder="Rain, delivery, access, inspection, or crew constraints…" /></label></div>
            </section>

            <section className={sectionClass}>
              <div className="flex items-start gap-3"><CloudRain className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" /><div><h3 className="text-sm font-black text-slate-900">Weather and site conditions</h3><p className="mt-1 text-xs text-slate-500">Enter only conditions observed or reported by the field team.</p></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="block sm:col-span-2 lg:col-span-2"><span className={labelClass}>Condition</span><select className={inputClass} value={form.weather.condition} onChange={(event) => update("weather", { ...form.weather, condition: event.target.value as DailySiteLogWeatherCondition })}>{DAILY_SITE_LOG_WEATHER_CONDITIONS.map((value) => <option key={value} value={value}>{conditionLabel(value)}</option>)}</select></label><label className="block"><span className={labelClass}>Temperature</span><input type="number" step="0.1" className={inputClass} value={form.weather.temperature} onChange={(event) => update("weather", { ...form.weather, temperature: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="—" /></label><label className="block"><span className={labelClass}>Unit</span><select className={inputClass} value={form.weather.temperatureUnit} onChange={(event) => update("weather", { ...form.weather, temperatureUnit: event.target.value as "C" | "F" })}><option value="C">°C</option><option value="F">°F</option></select></label><label className="block"><span className={labelClass}>Humidity %</span><input type="number" min="0" max="100" step="1" className={inputClass} value={form.weather.humidity} onChange={(event) => update("weather", { ...form.weather, humidity: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="—" /></label><label className="block sm:col-span-2 lg:col-span-3"><span className={labelClass}>Rain / precipitation notes</span><input className={inputClass} value={form.weather.precipitationNotes} onChange={(event) => update("weather", { ...form.weather, precipitationNotes: event.target.value })} placeholder="Light rain from 14:00; pour paused 35 minutes" /></label><label className="block sm:col-span-2 lg:col-span-4"><span className={labelClass}>Wind and site condition notes</span><textarea rows={2} className={`${inputClass} resize-y`} value={`${form.weather.windNotes}${form.weather.siteConditionNotes ? `${form.weather.windNotes ? "\n" : ""}${form.weather.siteConditionNotes}` : ""}`} onChange={(event) => { const [windNotes, ...siteNotes] = event.target.value.split("\n"); update("weather", { ...form.weather, windNotes, siteConditionNotes: siteNotes.join("\n") }); }} placeholder="Wind, ground, access, standing water, or other site conditions…" /></label></div>
            </section>
          </div>

          <div className="space-y-4">
            <section className={sectionClass}>
              <div className="flex items-start gap-3"><Users className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" /><div><h3 className="text-sm font-black text-slate-900">Crew / headcount</h3><p className="mt-1 text-xs text-slate-500">Operational presence observation; it does not create or change payroll attendance.</p></div></div>
              <div className="mt-4 space-y-3">{form.crew.map((row, index) => <div key={row.id || index} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className={labelClass}>Trade</span><input className={inputClass} value={row.trade} onChange={(event) => update("crew", form.crew.map((item, itemIndex) => itemIndex === index ? { ...item, trade: event.target.value } : item))} placeholder="Concrete" /></label><label className="block"><span className={labelClass}>Crew label</span><input className={inputClass} value={row.crewLabel} onChange={(event) => update("crew", form.crew.map((item, itemIndex) => itemIndex === index ? { ...item, crewLabel: event.target.value } : item))} placeholder="North bay crew" /></label><label className="block"><span className={labelClass}>Contractor</span><input className={inputClass} value={row.contractorLabel} onChange={(event) => update("crew", form.crew.map((item, itemIndex) => itemIndex === index ? { ...item, contractorLabel: event.target.value } : item))} placeholder="Optional" /></label><label className="block"><span className={labelClass}>Headcount</span><input required type="number" min="0" step="1" className={inputClass} value={row.headcount} onChange={(event) => update("crew", form.crew.map((item, itemIndex) => itemIndex === index ? { ...item, headcount: event.target.value === "" ? "" : Number(event.target.value) } : item))} /></label><label className="block"><span className={labelClass}>Regular hours observed</span><input type="number" min="0" max="24" step="0.25" className={inputClass} value={row.regularHours} onChange={(event) => update("crew", form.crew.map((item, itemIndex) => itemIndex === index ? { ...item, regularHours: event.target.value === "" ? "" : Number(event.target.value) } : item))} /></label><label className="block"><span className={labelClass}>Overtime hours observed</span><input type="number" min="0" max="24" step="0.25" className={inputClass} value={row.overtimeHours} onChange={(event) => update("crew", form.crew.map((item, itemIndex) => itemIndex === index ? { ...item, overtimeHours: event.target.value === "" ? "" : Number(event.target.value) } : item))} /></label><label className="block sm:col-span-2"><span className={labelClass}>Crew note</span><input className={inputClass} value={row.notes} onChange={(event) => update("crew", form.crew.map((item, itemIndex) => itemIndex === index ? { ...item, notes: event.target.value } : item))} placeholder="Foreman or shift note" /></label></div>{form.crew.length > 1 && <button type="button" className="mt-2 text-xs font-black text-rose-700" onClick={() => update("crew", form.crew.filter((_, itemIndex) => itemIndex !== index))}>Remove crew row</button>}</div>)}<button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-800" onClick={() => update("crew", [...form.crew, { trade: "", crewLabel: "", contractorLabel: "", headcount: 0, regularHours: "", overtimeHours: "", notes: "" }])}><Plus className="h-3.5 w-3.5" /> Add crew row</button></div>
            </section>

            <section className={sectionClass}>
              <div className="flex items-start gap-3"><Cog className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" /><div><h3 className="text-sm font-black text-slate-900">Equipment usage</h3><p className="mt-1 text-xs text-slate-500">Daily operating observations, not the future asset register.</p></div></div>
              <div className="mt-4 space-y-3">{form.equipment.map((row, index) => <div key={row.id || index} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="grid gap-3 sm:grid-cols-2"><label className="block sm:col-span-2"><span className={labelClass}>Equipment name / type</span><input required className={inputClass} value={row.equipmentName} onChange={(event) => update("equipment", form.equipment.map((item, itemIndex) => itemIndex === index ? { ...item, equipmentName: event.target.value } : item))} placeholder="Excavator 20T" /></label><label className="block"><span className={labelClass}>Asset reference</span><input className={inputClass} value={row.assetReference} onChange={(event) => update("equipment", form.equipment.map((item, itemIndex) => itemIndex === index ? { ...item, assetReference: event.target.value } : item))} placeholder="EQ-014" /></label><label className="block"><span className={labelClass}>Condition / status</span><input className={inputClass} value={row.conditionStatus} onChange={(event) => update("equipment", form.equipment.map((item, itemIndex) => itemIndex === index ? { ...item, conditionStatus: event.target.value } : item))} placeholder="Operational" /></label><label className="block"><span className={labelClass}>Operating hours</span><input type="number" min="0" max="24" step="0.25" className={inputClass} value={row.operatingHours} onChange={(event) => update("equipment", form.equipment.map((item, itemIndex) => itemIndex === index ? { ...item, operatingHours: formNumber(event.target.value) } : item))} /></label><label className="block"><span className={labelClass}>Idle / downtime hours</span><input type="number" min="0" max="24" step="0.25" className={inputClass} value={row.idleHours} onChange={(event) => update("equipment", form.equipment.map((item, itemIndex) => itemIndex === index ? { ...item, idleHours: formNumber(event.target.value) } : item))} /></label><label className="block sm:col-span-2"><span className={labelClass}>Operator / crew note</span><input className={inputClass} value={row.operatorCrewNote} onChange={(event) => update("equipment", form.equipment.map((item, itemIndex) => itemIndex === index ? { ...item, operatorCrewNote: event.target.value } : item))} placeholder="Assigned to earthworks crew" /></label></div><button type="button" className="mt-2 text-xs font-black text-rose-700" onClick={() => update("equipment", form.equipment.filter((_, itemIndex) => itemIndex !== index))}>Remove equipment row</button></div>)}<button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-black text-orange-800" onClick={() => update("equipment", [...form.equipment, { equipmentName: "", equipmentType: "", assetReference: "", operatingHours: "" as FormNumber, idleHours: "" as FormNumber, operatorCrewNote: "", conditionStatus: "", notes: "" }])}><Plus className="h-3.5 w-3.5" /> Add equipment row</button></div>
            </section>

            <section className={sectionClass}>
              <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" /><div><h3 className="text-sm font-black text-slate-900">Safety observations</h3><p className="mt-1 text-xs text-slate-500">Keep this to site-log observations and actions.</p></div></div>
              <div className="mt-4 space-y-3">{form.safety.map((row, index) => <div key={row.id || index} className="rounded-xl border border-rose-100 bg-rose-50/50 p-3"><div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className={labelClass}>Category</span><input required className={inputClass} value={row.category} onChange={(event) => update("safety", form.safety.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value } : item))} placeholder="Housekeeping" /></label><label className="block"><span className={labelClass}>Severity</span><select className={inputClass} value={row.severity} onChange={(event) => update("safety", form.safety.map((item, itemIndex) => itemIndex === index ? { ...item, severity: event.target.value as DailySiteLogSafetySeverity } : item))}>{DAILY_SITE_LOG_SAFETY_SEVERITIES.map((value) => <option key={value} value={value}>{conditionLabel(value)}</option>)}</select></label><label className="block sm:col-span-2"><span className={labelClass}>Observation / description</span><textarea required rows={2} className={`${inputClass} resize-y`} value={row.description} onChange={(event) => update("safety", form.safety.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} placeholder="Describe the observation and location…" /></label><label className="block sm:col-span-2"><span className={labelClass}>Action taken</span><input className={inputClass} value={row.actionTaken} onChange={(event) => update("safety", form.safety.map((item, itemIndex) => itemIndex === index ? { ...item, actionTaken: event.target.value } : item))} placeholder="Area cordoned and housekeeping briefed" /></label></div><label className="mt-3 flex min-h-10 items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={row.isResolved} onChange={(event) => update("safety", form.safety.map((item, itemIndex) => itemIndex === index ? { ...item, isResolved: event.target.checked } : item))} /> Resolved / action closed</label><button type="button" className="mt-2 text-xs font-black text-rose-700" onClick={() => update("safety", form.safety.filter((_, itemIndex) => itemIndex !== index))}>Remove safety row</button></div>)}<button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-800" onClick={() => update("safety", [...form.safety, { category: "", severity: "OBSERVATION", description: "", actionTaken: "", isResolved: true, notes: "" }])}><Plus className="h-3.5 w-3.5" /> Add safety observation</button></div>
            </section>
          </div>
        </div>

        <section className={`${sectionClass} mt-4`}><label className="block"><span className={labelClass}>General site notes</span><textarea rows={3} className={`${inputClass} resize-y`} value={form.generalNotes} onChange={(event) => update("generalNotes", event.target.value)} placeholder="Visitors, inspections, coordination, deliveries, or other daily context…" /></label></section>
        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} disabled={saving} className="min-h-11 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button><button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Saving draft…" : "Save draft"}</button></div>
      </form>
    </div>
  );
}

export const ProjectSiteLogs: React.FC<ProjectSiteLogsProps> = ({ project, companyId, canRead = true, canCreate = true, canUpdate = true, canSubmit = true, canManage = true, guestMode = false, initialSiteLogId, pathForSiteLog, controlledData, onControlledDataChange }) => {
  const controller = useDailySiteLogsController({ project, companyId, canRead, canCreate, canUpdate, canSubmit, canManage, guestMode, controlledData, onControlledDataChange });
  const [selectedId, setSelectedId] = useState<string | undefined>(initialSiteLogId);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DailySiteLogStatus | "ALL">("ALL");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [form, setForm] = useState<SiteLogForm>(() => emptyForm());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => setSelectedId(initialSiteLogId), [initialSiteLogId, project.id]);
  const selected = selectedId ? controller.aggregate(selectedId) : null;
  const filtered = useMemo(() => controller.data.logs.filter((log) => {
    if (status !== "ALL" && log.status !== status) return false;
    const aggregate = controller.aggregate(log.id);
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${log.siteDate} ${log.reportNumber} ${log.workSummary} ${log.progressNotes || ""} ${aggregate?.weather?.condition || ""}`.toLowerCase().includes(needle);
  }), [controller, query, status]);

  const selectLog = (id?: string) => {
    setSelectedId(id);
    setActionError(null);
    if (typeof window !== "undefined") window.history.replaceState({}, "", pathForSiteLog ? pathForSiteLog(id) : id ? appPathForProject(project.id, "site-logs", { siteLogId: id }) : appPathForProject(project.id, "site-logs"));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startCreate = () => { setEditingId(undefined); setForm(emptyForm()); setActionError(null); setEditorOpen(true); };
  const startEdit = (aggregate: EngineeringDailySiteLogAggregate) => { setEditingId(aggregate.log.id); setForm(formFromAggregate(aggregate)); setActionError(null); setEditorOpen(true); };
  const saveDraft = async () => {
    setBusy(true); setActionError(null);
    try {
      const input = formToInput(form);
      const saved = editingId ? await controller.updateDraft(editingId, input) : await controller.create(input);
      setEditorOpen(false);
      selectLog(saved.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The Site Log draft could not be saved. Your entries remain available for retry.");
    } finally { setBusy(false); }
  };
  const runAction = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true); setActionError(null);
    try { await action(); } catch (error) { setActionError(error instanceof Error ? error.message : fallback); } finally { setBusy(false); }
  };

  if (!canRead) return <div className={sectionClass}><div className="mx-auto max-w-md text-center"><HardHat className="mx-auto h-8 w-8 text-slate-300" /><h2 className="mt-3 text-sm font-black text-slate-800">Site Logs are restricted</h2><p className="mt-1 text-xs leading-5 text-slate-500">Your company role does not include daily Site Log read access.</p></div></div>;
  if (controller.isLoading) return <div role="status" className={`${sectionClass} p-10 text-center text-sm font-semibold text-slate-600`}>Loading Site Logs…</div>;
  if (controller.loadError) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900"><p className="font-black">Site Log register unavailable</p><p className="mt-1 text-xs leading-5">{controller.loadError}</p><button type="button" onClick={controller.retryLoad} className="mt-3 min-h-10 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm">Retry</button></div>;
  if (selectedId && !selected) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><p className="font-black">Site Log not available</p><p className="mt-1 text-xs leading-5">The requested field record is not available in this project or company.</p><button type="button" onClick={() => selectLog(undefined)} className="mt-3 min-h-10 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm">Return to register</button></div>;

  if (selected) {
    const summary = logSummary(selected);
    return <section className="space-y-4" data-phase1c="site-log-detail">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><button type="button" onClick={() => selectLog(undefined)} className="text-xs font-black text-indigo-700 hover:text-indigo-900">← Site Log register</button><div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-xs font-black text-slate-900">{selected.log.reportNumber}</span><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusClass(selected.log.status)}`}>{selected.log.status}</span><span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500"><CalendarDays className="h-3.5 w-3.5" />{selected.log.siteDate}</span></div><h2 className="mt-2 truncate text-xl font-black text-slate-950">{project.projectName}</h2><p className="mt-1 text-xs text-slate-500">Prepared by {selected.log.preparedByUserId ? "a company team member" : "field team"} · {selected.log.submittedAt ? `Submitted ${new Date(selected.log.submittedAt).toLocaleString()}` : "Not submitted"} · {selected.log.finalizedAt ? `Finalized ${new Date(selected.log.finalizedAt).toLocaleString()}` : "Not finalized"}</p></div><div className="flex flex-wrap gap-2">{selected.log.status === "DRAFT" && canUpdate && <button type="button" onClick={() => startEdit(selected)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><FileText className="h-3.5 w-3.5" />Edit draft</button>}{selected.log.status === "DRAFT" && canSubmit && <button type="button" disabled={busy} onClick={() => void runAction(() => controller.submit(selected.log.id), "The Site Log could not be submitted. It remains a draft until the server confirms submission.")} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Submit</button>}{selected.log.status === "SUBMITTED" && canManage && <button type="button" disabled={busy} onClick={() => void runAction(() => controller.finalize(selected.log.id), "The Site Log could not be finalized. It remains submitted until the server confirms finalization.")} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Finalize</button>}{!['FINALIZED', 'VOID'].includes(selected.log.status) && canManage && <button type="button" disabled={busy} onClick={() => { const reason = typeof window === "undefined" ? "Voided by manager" : window.prompt("Reason for voiding this Site Log?") || ""; if (reason.trim()) void runAction(() => controller.voidLog(selected.log.id, reason), "The Site Log could not be voided."); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-700 disabled:opacity-50">Void</button>}</div></div>
      {actionError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold leading-5 text-rose-800">{actionError}</div>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]"><div className="space-y-4">
        <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><Users className="h-5 w-5 text-violet-600" /><p className="mt-3 text-2xl font-black text-violet-950">{summary.headcount}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-violet-700">Reported headcount</p></div><div className="rounded-2xl border border-orange-100 bg-orange-50 p-4"><Cog className="h-5 w-5 text-orange-600" /><p className="mt-3 text-2xl font-black text-orange-950">{summary.equipmentCount}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-orange-700">Equipment entries</p></div><div className={`rounded-2xl border p-4 ${summary.safetyCount ? "border-rose-100 bg-rose-50" : "border-emerald-100 bg-emerald-50"}`}><ShieldAlert className={`h-5 w-5 ${summary.safetyCount ? "text-rose-600" : "text-emerald-600"}`} /><p className={`mt-3 text-2xl font-black ${summary.safetyCount ? "text-rose-950" : "text-emerald-950"}`}>{summary.safetyCount}</p><p className={`mt-1 text-[10px] font-black uppercase tracking-[0.1em] ${summary.safetyCount ? "text-rose-700" : "text-emerald-700"}`}>Safety observations</p></div></section>
        <section className={sectionClass}><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-indigo-600" /><h3 className="text-sm font-black text-slate-900">Work performed and progress</h3></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.log.workSummary || "No work summary recorded yet."}</p>{selected.log.progressNotes && <div className="mt-4 border-t border-slate-100 pt-4"><DetailItem label="Progress notes"><span className="whitespace-pre-wrap leading-6">{selected.log.progressNotes}</span></DetailItem></div>}{selected.log.delaysConstraints && <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3"><DetailItem label="Delays and constraints"><span className="whitespace-pre-wrap leading-6 text-amber-950">{selected.log.delaysConstraints}</span></DetailItem></div>}</section>
        <section className={sectionClass}><div className="flex items-center gap-2"><Users className="h-4 w-4 text-violet-600" /><h3 className="text-sm font-black text-slate-900">Crew observations</h3></div>{selected.crew.length ? <div className="mt-4 space-y-2">{selected.crew.map((row) => <div key={row.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-black text-slate-800">{row.trade || row.crewLabel || row.contractorLabel || "Site crew"}</p><p className="mt-1 text-xs text-slate-500">{[row.crewLabel, row.contractorLabel].filter(Boolean).join(" · ") || "No crew label"}</p></div><span className="rounded-lg bg-violet-100 px-2 py-1 text-xs font-black text-violet-800">{row.headcount} workers</span></div><p className="mt-2 text-[11px] font-semibold text-slate-500">{row.regularHours ?? "—"} regular hrs · {row.overtimeHours ?? "—"} overtime hrs observed{row.notes ? ` · ${row.notes}` : ""}</p></div>)}</div> : <p className="mt-4 text-xs text-slate-500">No crew observations recorded.</p>}</section>
        <section className={sectionClass}><div className="flex items-center gap-2"><Cog className="h-4 w-4 text-orange-600" /><h3 className="text-sm font-black text-slate-900">Equipment usage</h3></div>{selected.equipment.length ? <div className="mt-4 grid gap-2 md:grid-cols-2">{selected.equipment.map((row) => <div key={row.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-sm font-black text-slate-800">{row.equipmentName}</p><p className="mt-1 text-xs text-slate-500">{[row.equipmentType, row.assetReference, row.conditionStatus].filter(Boolean).join(" · ") || "Condition not recorded"}</p><p className="mt-2 text-[11px] font-semibold text-slate-600">{row.operatingHours ?? "—"} operating hrs · {row.idleHours ?? "—"} idle/downtime hrs</p>{row.operatorCrewNote && <p className="mt-1 text-[11px] text-slate-500">{row.operatorCrewNote}</p>}</div>)}</div> : <p className="mt-4 text-xs text-slate-500">No equipment usage observations recorded.</p>}</section>
        <section className={sectionClass}><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-rose-600" /><h3 className="text-sm font-black text-slate-900">Safety</h3></div>{selected.safety.length ? <div className="mt-4 space-y-2">{selected.safety.map((row) => <div key={row.id} className="rounded-xl border border-rose-100 bg-rose-50/60 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-rose-950">{row.category} · {conditionLabel(row.severity)}</p><span className={`inline-flex items-center gap-1 text-[10px] font-black ${row.isResolved ? "text-emerald-700" : "text-rose-700"}`}>{row.isResolved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{row.isResolved ? "Resolved" : "Open"}</span></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{row.description}</p>{row.actionTaken && <p className="mt-2 text-[11px] font-semibold text-slate-600">Action: {row.actionTaken}</p>}</div>)}</div> : <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />No safety observations recorded.</p>}</section>
      </div><aside className="space-y-4"><section className={sectionClass}><div className="flex items-center gap-2"><CloudRain className="h-4 w-4 text-sky-600" /><h3 className="text-sm font-black text-slate-900">Weather</h3></div>{selected.weather ? <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-1"><DetailItem label="Condition">{conditionLabel(selected.weather.condition)}</DetailItem><DetailItem label="Temperature">{selected.weather.temperature === undefined ? "Not recorded" : `${selected.weather.temperature}°${selected.weather.temperatureUnit}`}</DetailItem><DetailItem label="Humidity">{selected.weather.humidity === undefined ? "Not recorded" : `${selected.weather.humidity}%`}</DetailItem><DetailItem label="Precipitation">{selected.weather.precipitationNotes || "Not recorded"}</DetailItem><DetailItem label="Wind / site conditions"><span className="whitespace-pre-wrap">{[selected.weather.windNotes, selected.weather.siteConditionNotes].filter(Boolean).join("\n") || "Not recorded"}</span></DetailItem></div> : <p className="mt-4 text-xs text-slate-500">Weather was not recorded.</p>}</section><section className={sectionClass}><div className="flex items-center gap-2"><History className="h-4 w-4 text-slate-500" /><h3 className="text-sm font-black text-slate-900">Lifecycle history</h3></div>{selected.events.length ? <div className="mt-4 space-y-3">{selected.events.map((event) => <div key={event.id} className="border-l-2 border-indigo-200 pl-3"><p className="text-xs font-black text-slate-800">{event.eventType} {event.fromStatus ? `· ${event.fromStatus} → ` : "· "}{event.toStatus}</p><p className="mt-1 text-[10px] font-semibold text-slate-500">{new Date(event.createdAt).toLocaleString()}{event.reason ? ` · ${event.reason}` : ""}</p></div>)}</div> : <p className="mt-4 text-xs text-slate-500">No lifecycle events are available.</p>}</section><section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-indigo-700">Record boundary</p><p className="mt-2 text-xs leading-5 text-indigo-950">Crew hours and headcount are field observations only. This Site Log never creates attendance, timesheets, overtime, or payroll changes.</p></section>{selected.log.generalNotes && <section className={sectionClass}><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-slate-500" /><h3 className="text-sm font-black text-slate-900">General notes</h3></div><p className="mt-4 whitespace-pre-wrap text-xs leading-5 text-slate-700">{selected.log.generalNotes}</p></section>}</aside></div>
      {editorOpen && <Editor title="Edit Site Log draft" form={form} setForm={setForm} onSubmit={() => void saveDraft()} onCancel={() => setEditorOpen(false)} saving={busy} error={actionError} />}
    </section>;
  }

  return <section className="space-y-4" data-phase1c="site-log-register"><div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">Field reporting</p><h2 className="mt-1 text-xl font-black text-slate-950">Daily Site Logs</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">A project-scoped record of what happened on site: weather, crew presence, equipment, progress, delays, safety, and formal submission history.</p></div>{canCreate && <button type="button" onClick={startCreate} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-indigo-700"><Plus className="h-4 w-4" />New Site Log</button>}</div><div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_180px]"><label className="relative"><FileText className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Search Site Logs" className={`${inputClass} mt-0 pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search date, report number, work, weather…" /></label><select aria-label="Filter Site Logs by status" className={`${inputClass} mt-0`} value={status} onChange={(event) => setStatus(event.target.value as DailySiteLogStatus | "ALL")}><option value="ALL">All statuses</option>{DAILY_SITE_LOG_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>{filtered.length ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="hidden grid-cols-[110px_105px_minmax(220px,1fr)_110px_115px_100px_28px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 lg:grid"><span>Date</span><span>Status</span><span>Work summary</span><span>Weather</span><span>Headcount</span><span>Safety / equipment</span><span /></div>{filtered.map((log) => { const aggregate = controller.aggregate(log.id); if (!aggregate) return null; const summary = logSummary(aggregate); return <button type="button" key={log.id} onClick={() => selectLog(log.id)} className="grid w-full gap-2 border-b border-slate-100 px-4 py-4 text-left last:border-b-0 hover:bg-slate-50 lg:grid-cols-[110px_105px_minmax(220px,1fr)_110px_115px_100px_28px] lg:items-center lg:gap-3"><span className="inline-flex items-center gap-1.5 text-xs font-black text-slate-900"><CalendarDays className="h-3.5 w-3.5 text-slate-400 lg:hidden" />{log.siteDate}</span><span><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black ${statusClass(log.status)}`}>{log.status}</span><span className="mt-1 block text-[10px] font-semibold text-slate-400">{log.reportNumber}</span></span><span className="min-w-0"><span className="block line-clamp-2 text-sm font-bold text-slate-800">{log.workSummary || "Draft awaiting field notes"}</span><span className="mt-1 block text-[10px] font-semibold text-slate-500 lg:hidden">{conditionLabel(aggregate.weather?.condition || "UNKNOWN")} · {summary.headcount} workers · {summary.safetyCount} safety</span></span><span className="hidden text-xs font-bold text-slate-600 lg:block">{conditionLabel(aggregate.weather?.condition || "UNKNOWN")}</span><span className="hidden text-xs font-black text-slate-700 lg:block">{summary.headcount} workers</span><span className="hidden text-[10px] font-bold text-slate-500 lg:block">{summary.safetyCount} safety · {summary.equipmentCount} equipment</span><span className="hidden text-slate-300 lg:block">→</span></button>; })}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><HardHat className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-black text-slate-700">No Site Logs match this view.</p><p className="mt-1 text-xs text-slate-500">Create a draft for the next reporting day or clear the filters.</p>{canCreate && <button type="button" onClick={startCreate} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white"><Plus className="h-4 w-4" />Create first log</button>}</div>}{editorOpen && <Editor title="Create Site Log draft" form={form} setForm={setForm} onSubmit={() => void saveDraft()} onCancel={() => setEditorOpen(false)} saving={busy} error={actionError} />}</section>;
};
