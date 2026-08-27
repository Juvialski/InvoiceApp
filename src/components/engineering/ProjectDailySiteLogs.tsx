import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, CloudRain, HardHat, Plus, ShieldCheck, Tractor } from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import type { Project } from "../../types.ts";
import {
  dailySiteLogId,
  sectionsForDailySiteLog,
  type DailySiteCrewEntry,
  type DailySiteEquipmentEntry,
  type DailySiteEvent,
  type DailySiteLog,
  type DailySiteLogDraftSections,
  type DailySiteShift,
  type DailySiteWeatherImpact,
} from "../../lib/dailySiteLogs.ts";
import { useDailySiteLogAccess } from "../../features/engineering/useDailySiteLogAccess.ts";
import { useDailySiteLogsController } from "../../features/engineering/useDailySiteLogsController.ts";

interface ProjectDailySiteLogsProps {
  project: Project;
  companyId?: string;
  initialDailyLogId?: string;
  guestMode?: boolean;
}

type CrewDraft = Omit<DailySiteCrewEntry, "dailyLogId" | "companyId" | "createdAt" | "updatedAt">;
type EquipmentDraft = Omit<DailySiteEquipmentEntry, "dailyLogId" | "companyId" | "createdAt" | "updatedAt">;
type EventDraft = Omit<DailySiteEvent, "dailyLogId" | "companyId" | "createdAt">;

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
const labelClass = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500";

function localDate() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); }
function numberValue(value: string) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function statusClass(status: DailySiteLog["status"]) {
  if (status === "REVIEWED") return "bg-emerald-50 text-emerald-700";
  if (status === "SUBMITTED") return "bg-blue-50 text-blue-700";
  if (status === "VOID") return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}
function actionClass(primary = false) {
  return `inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${primary ? "bg-indigo-600 text-white hover:bg-indigo-700" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;
}

export const ProjectDailySiteLogs: React.FC<ProjectDailySiteLogsProps> = ({ project, companyId, initialDailyLogId, guestMode = false }) => {
  const access = useDailySiteLogAccess(companyId, guestMode);
  const controller = useDailySiteLogsController({ project, companyId, canRead: access.read, guestMode });
  const [selectedId, setSelectedId] = useState<string | null>(initialDailyLogId || null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amendment, setAmendment] = useState("");
  const [voidReason, setVoidReason] = useState("");

  const [logDate, setLogDate] = useState(localDate());
  const [shiftCode, setShiftCode] = useState<DailySiteShift>("DAY");
  const [shiftLabel, setShiftLabel] = useState("");
  const [workSummary, setWorkSummary] = useState("");
  const [delaySummary, setDelaySummary] = useState("");
  const [safetySummary, setSafetySummary] = useState("");
  const [qualitySummary, setQualitySummary] = useState("");
  const [deliveriesVisitors, setDeliveriesVisitors] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const [weatherCondition, setWeatherCondition] = useState("");
  const [temperatureC, setTemperatureC] = useState("");
  const [precipitationMm, setPrecipitationMm] = useState("");
  const [windKph, setWindKph] = useState("");
  const [humidityPercent, setHumidityPercent] = useState("");
  const [weatherImpact, setWeatherImpact] = useState<DailySiteWeatherImpact>("NONE");
  const [weatherNotes, setWeatherNotes] = useState("");
  const [crews, setCrews] = useState<CrewDraft[]>([]);
  const [equipment, setEquipment] = useState<EquipmentDraft[]>([]);
  const [events, setEvents] = useState<EventDraft[]>([]);

  const selected = controller.data.logs.find((item) => item.id === selectedId) || null;
  const sortedLogs = useMemo(() => [...controller.data.logs].sort((a, b) => `${b.logDate}-${b.sequenceNo}`.localeCompare(`${a.logDate}-${a.sequenceNo}`)), [controller.data.logs]);

  useEffect(() => {
    if (creating) return;
    const requested = initialDailyLogId && controller.data.logs.some((item) => item.id === initialDailyLogId) ? initialDailyLogId : undefined;
    if (requested) setSelectedId(requested);
    else if (!selectedId && sortedLogs[0]) setSelectedId(sortedLogs[0].id);
    else if (selectedId && !controller.data.logs.some((item) => item.id === selectedId)) setSelectedId(sortedLogs[0]?.id || null);
  }, [controller.data.logs, creating, initialDailyLogId, selectedId, sortedLogs]);

  useEffect(() => {
    if (creating || !selected) return;
    const sections = sectionsForDailySiteLog(controller.data, selected.id);
    setLogDate(selected.logDate); setShiftCode(selected.shiftCode); setShiftLabel(selected.shiftLabel || "");
    setWorkSummary(selected.workSummary); setDelaySummary(selected.delaySummary || ""); setSafetySummary(selected.safetySummary || "");
    setQualitySummary(selected.qualitySummary || ""); setDeliveriesVisitors(selected.deliveriesVisitors || ""); setGeneralNotes(selected.generalNotes || "");
    setWeatherCondition(sections.weather?.condition || ""); setTemperatureC(sections.weather?.temperatureC?.toString() || "");
    setPrecipitationMm(sections.weather?.precipitationMm?.toString() || ""); setWindKph(sections.weather?.windKph?.toString() || "");
    setHumidityPercent(sections.weather?.humidityPercent?.toString() || ""); setWeatherImpact(sections.weather?.workImpact || "NONE"); setWeatherNotes(sections.weather?.notes || "");
    setCrews(sections.crews || []); setEquipment(sections.equipment || []); setEvents(sections.events || []);
    setAmendment(""); setVoidReason(""); setError(null);
  }, [controller.data, creating, selected?.id]);

  const resetNew = () => {
    setCreating(true); setSelectedId(null); setLogDate(localDate()); setShiftCode("DAY"); setShiftLabel(""); setWorkSummary(""); setDelaySummary("");
    setSafetySummary(""); setQualitySummary(""); setDeliveriesVisitors(""); setGeneralNotes(""); setWeatherCondition(""); setTemperatureC("");
    setPrecipitationMm(""); setWindKph(""); setHumidityPercent(""); setWeatherImpact("NONE"); setWeatherNotes(""); setCrews([]); setEquipment([]); setEvents([]); setError(null);
  };

  const sections = (): DailySiteLogDraftSections => ({
    workSummary, delaySummary, safetySummary, qualitySummary, deliveriesVisitors, generalNotes,
    weather: weatherCondition.trim() ? {
      condition: weatherCondition, temperatureC: temperatureC === "" ? undefined : numberValue(temperatureC), precipitationMm: precipitationMm === "" ? undefined : numberValue(precipitationMm),
      windKph: windKph === "" ? undefined : numberValue(windKph), humidityPercent: humidityPercent === "" ? undefined : numberValue(humidityPercent), workImpact: weatherImpact,
      source: "MANUAL", observedAt: new Date().toISOString(), notes: weatherNotes,
    } : undefined,
    crews, equipment, events,
  });

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await operation(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Daily Site Log operation failed."); }
    finally { setBusy(false); }
  };

  const save = () => run(async () => {
    const id = await controller.saveDraft({ id: selected?.status === "DRAFT" ? selected.id : undefined, logDate, shiftCode, shiftLabel, sequenceNo: selected?.sequenceNo || 1, sections: sections() });
    setCreating(false); setSelectedId(id);
  });

  if (access.loading) return <Card className="p-8 text-center text-sm font-semibold text-slate-600" elevation="low">Checking Daily Site Log access…</Card>;
  if (!access.read) return <Card className="p-8 text-center" elevation="low"><ShieldCheck className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">Daily Site Logs are not available for your role.</p></Card>;

  const editable = creating || selected?.status === "DRAFT";
  const weather = selected ? controller.data.weather.find((item) => item.dailyLogId === selected.id) : undefined;
  const logCrews = selected ? controller.data.crews.filter((item) => item.dailyLogId === selected.id) : [];
  const logEquipment = selected ? controller.data.equipment.filter((item) => item.dailyLogId === selected.id) : [];
  const logEvents = selected ? controller.data.events.filter((item) => item.dailyLogId === selected.id) : [];
  const logAmendments = selected ? controller.data.amendments.filter((item) => item.dailyLogId === selected.id) : [];
  const totalHeadcount = logCrews.reduce((sum, item) => sum + item.actualCount, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="h-fit overflow-hidden p-0" elevation="low">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div><p className="text-sm font-black">Daily Site Logs</p><p className="text-[11px] text-slate-500">{sortedLogs.length} project records</p></div>
          {access.create && <button className={actionClass(true)} onClick={resetNew}><Plus className="mr-1 h-3.5 w-3.5" />New</button>}
        </div>
        {controller.isLoading ? <p className="p-5 text-xs text-slate-500">Loading field records…</p> : controller.loadError ? (
          <div className="p-4"><p className="text-xs text-rose-600">{controller.loadError}</p><button className={`${actionClass()} mt-3`} onClick={controller.retryLoad}>Retry</button></div>
        ) : sortedLogs.length ? <div className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">{sortedLogs.map((log) => {
          const rowWeather = controller.data.weather.find((item) => item.dailyLogId === log.id);
          const rowHeadcount = controller.data.crews.filter((item) => item.dailyLogId === log.id).reduce((sum, item) => sum + item.actualCount, 0);
          return <button key={log.id} className={`w-full p-4 text-left transition hover:bg-slate-50 ${selectedId === log.id && !creating ? "bg-indigo-50/70" : ""}`} onClick={() => { setCreating(false); setSelectedId(log.id); }}>
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-slate-800">{log.logDate}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${statusClass(log.status)}`}>{log.status}</span></div>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-600">{log.workSummary}</p>
            <div className="mt-2 flex gap-3 text-[10px] font-semibold text-slate-500"><span>{rowWeather?.condition || "Weather not logged"}</span><span>{rowHeadcount} crew</span></div>
          </button>;
        })}</div> : <div className="p-8 text-center"><CalendarDays className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-xs font-bold text-slate-700">No site logs yet.</p></div>}
      </Card>

      <div className="space-y-4">
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
        {editable ? (
          <>
            <Card className="p-5" elevation="low">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-base font-black">{creating ? "New Daily Site Log" : `Edit ${selected?.logDate}`}</p><p className="mt-1 text-xs text-slate-500">Drafts remain editable until formal submission.</p></div><button disabled={busy || !access.create || !workSummary.trim()} className={actionClass(true)} onClick={save}>Save draft</button></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-3"><label><span className={labelClass}>Work date</span><input type="date" className={inputClass} value={logDate} onChange={(e) => setLogDate(e.target.value)} /></label><label><span className={labelClass}>Shift</span><select className={inputClass} value={shiftCode} onChange={(e) => setShiftCode(e.target.value as DailySiteShift)}><option>DAY</option><option>NIGHT</option><option>SWING</option><option>CUSTOM</option></select></label><label><span className={labelClass}>Shift label</span><input className={inputClass} value={shiftLabel} onChange={(e) => setShiftLabel(e.target.value)} placeholder="Optional" /></label></div>
              <label className="mt-4 block"><span className={labelClass}>Work performed *</span><textarea className={`${inputClass} min-h-28`} value={workSummary} onChange={(e) => setWorkSummary(e.target.value)} placeholder="What work was completed on site?" /></label>
              <div className="mt-4 grid gap-4 md:grid-cols-2"><label><span className={labelClass}>Delays / disruptions</span><textarea className={`${inputClass} min-h-20`} value={delaySummary} onChange={(e) => setDelaySummary(e.target.value)} /></label><label><span className={labelClass}>Safety observations</span><textarea className={`${inputClass} min-h-20`} value={safetySummary} onChange={(e) => setSafetySummary(e.target.value)} /></label><label><span className={labelClass}>QA / QC observations</span><textarea className={`${inputClass} min-h-20`} value={qualitySummary} onChange={(e) => setQualitySummary(e.target.value)} /></label><label><span className={labelClass}>Deliveries / visitors</span><textarea className={`${inputClass} min-h-20`} value={deliveriesVisitors} onChange={(e) => setDeliveriesVisitors(e.target.value)} /></label></div>
              <label className="mt-4 block"><span className={labelClass}>General notes</span><textarea className={`${inputClass} min-h-20`} value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} /></label>
            </Card>

            <Card className="p-5" elevation="low"><div className="flex items-center gap-2"><CloudRain className="h-4 w-4 text-indigo-500" /><p className="text-sm font-black">Weather snapshot</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label><span className={labelClass}>Conditions</span><input className={inputClass} value={weatherCondition} onChange={(e) => setWeatherCondition(e.target.value)} placeholder="Sunny, heavy rain…" /></label><label><span className={labelClass}>Temperature °C</span><input type="number" className={inputClass} value={temperatureC} onChange={(e) => setTemperatureC(e.target.value)} /></label><label><span className={labelClass}>Rainfall mm</span><input type="number" min="0" className={inputClass} value={precipitationMm} onChange={(e) => setPrecipitationMm(e.target.value)} /></label><label><span className={labelClass}>Wind km/h</span><input type="number" min="0" className={inputClass} value={windKph} onChange={(e) => setWindKph(e.target.value)} /></label><label><span className={labelClass}>Humidity %</span><input type="number" min="0" max="100" className={inputClass} value={humidityPercent} onChange={(e) => setHumidityPercent(e.target.value)} /></label><label><span className={labelClass}>Work impact</span><select className={inputClass} value={weatherImpact} onChange={(e) => setWeatherImpact(e.target.value as DailySiteWeatherImpact)}><option>NONE</option><option>LOW</option><option>MODERATE</option><option>HIGH</option><option>STOPPAGE</option></select></label></div><label className="mt-3 block"><span className={labelClass}>Weather notes</span><input className={inputClass} value={weatherNotes} onChange={(e) => setWeatherNotes(e.target.value)} /></label></Card>

            <Card className="p-5" elevation="low"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><HardHat className="h-4 w-4 text-indigo-500" /><p className="text-sm font-black">Crew snapshot</p></div><button className={actionClass()} onClick={() => setCrews((items) => [...items, { id: dailySiteLogId("crew"), crewLabel: "", trade: "", plannedCount: 0, actualCount: 0, regularHours: 8, overtimeHours: 0, notes: "" }])}>+ Crew</button></div><div className="mt-3 space-y-3">{crews.map((crew, index) => <div key={crew.id} className="grid gap-2 rounded-xl border border-slate-100 p-3 sm:grid-cols-6"><input className={`${inputClass} sm:col-span-2`} placeholder="Crew / trade" value={crew.crewLabel} onChange={(e) => setCrews((items) => items.map((item, i) => i === index ? { ...item, crewLabel: e.target.value } : item))} /><input className={inputClass} placeholder="Trade" value={crew.trade || ""} onChange={(e) => setCrews((items) => items.map((item, i) => i === index ? { ...item, trade: e.target.value } : item))} /><input type="number" min="0" className={inputClass} title="Actual headcount" value={crew.actualCount} onChange={(e) => setCrews((items) => items.map((item, i) => i === index ? { ...item, actualCount: numberValue(e.target.value) } : item))} /><input type="number" min="0" className={inputClass} title="Regular hours" value={crew.regularHours} onChange={(e) => setCrews((items) => items.map((item, i) => i === index ? { ...item, regularHours: numberValue(e.target.value) } : item))} /><button className="text-xs font-bold text-rose-600" onClick={() => setCrews((items) => items.filter((_, i) => i !== index))}>Remove</button></div>)}</div></Card>

            <Card className="p-5" elevation="low"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Tractor className="h-4 w-4 text-indigo-500" /><p className="text-sm font-black">Equipment use</p></div><button className={actionClass()} onClick={() => setEquipment((items) => [...items, { id: dailySiteLogId("equipment"), equipmentLabel: "", quantity: 1, operatingHours: 0, idleHours: 0, status: "OPERATING", operatorNote: "", issueNote: "" }])}>+ Equipment</button></div><div className="mt-3 space-y-3">{equipment.map((item, index) => <div key={item.id} className="grid gap-2 rounded-xl border border-slate-100 p-3 sm:grid-cols-6"><input className={`${inputClass} sm:col-span-2`} placeholder="Equipment" value={item.equipmentLabel} onChange={(e) => setEquipment((items) => items.map((entry, i) => i === index ? { ...entry, equipmentLabel: e.target.value } : entry))} /><input type="number" min="0" className={inputClass} title="Operating hours" value={item.operatingHours} onChange={(e) => setEquipment((items) => items.map((entry, i) => i === index ? { ...entry, operatingHours: numberValue(e.target.value) } : entry))} /><input type="number" min="0" className={inputClass} title="Idle hours" value={item.idleHours} onChange={(e) => setEquipment((items) => items.map((entry, i) => i === index ? { ...entry, idleHours: numberValue(e.target.value) } : entry))} /><select className={inputClass} value={item.status} onChange={(e) => setEquipment((items) => items.map((entry, i) => i === index ? { ...entry, status: e.target.value as EquipmentDraft["status"] } : entry))}><option>OPERATING</option><option>IDLE</option><option>DOWN</option><option>MAINTENANCE</option></select><button className="text-xs font-bold text-rose-600" onClick={() => setEquipment((items) => items.filter((_, i) => i !== index))}>Remove</button></div>)}</div></Card>

            <Card className="p-5" elevation="low"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-indigo-500" /><p className="text-sm font-black">Structured site events</p></div><button className={actionClass()} onClick={() => setEvents((items) => [...items, { id: dailySiteLogId("event"), eventType: "WORK", title: "", description: "", severity: "INFO", workStoppage: false }])}>+ Event</button></div><div className="mt-3 space-y-3">{events.map((event, index) => <div key={event.id} className="grid gap-2 rounded-xl border border-slate-100 p-3 sm:grid-cols-6"><select className={inputClass} value={event.eventType} onChange={(e) => setEvents((items) => items.map((entry, i) => i === index ? { ...entry, eventType: e.target.value as EventDraft["eventType"] } : entry))}><option>WORK</option><option>DELIVERY</option><option>VISITOR</option><option>DELAY</option><option>SAFETY</option><option>QUALITY</option></select><input className={`${inputClass} sm:col-span-2`} placeholder="Event title" value={event.title} onChange={(e) => setEvents((items) => items.map((entry, i) => i === index ? { ...entry, title: e.target.value } : entry))} /><input className={`${inputClass} sm:col-span-2`} placeholder="Description" value={event.description} onChange={(e) => setEvents((items) => items.map((entry, i) => i === index ? { ...entry, description: e.target.value } : entry))} /><button className="text-xs font-bold text-rose-600" onClick={() => setEvents((items) => items.filter((_, i) => i !== index))}>Remove</button></div>)}</div></Card>
          </>
        ) : selected ? (
          <>
            <Card className="p-5" elevation="low"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-base font-black">{selected.logDate} · {selected.shiftCode}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${statusClass(selected.status)}`}>{selected.status}</span></div><p className="mt-1 text-xs text-slate-500">Formal field record · sequence {selected.sequenceNo}</p></div><div className="flex flex-wrap gap-2">{selected.status === "SUBMITTED" && access.review && <button disabled={busy} className={actionClass(true)} onClick={() => run(() => controller.review(selected))}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Review</button>}{(selected.status === "DRAFT" || selected.status === "SUBMITTED") && access.manage && <button disabled={busy || !voidReason.trim()} className={actionClass()} onClick={() => run(() => controller.voidLog(selected, voidReason))}>Void</button>}</div></div>
              <div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Work performed</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.workSummary}</p></div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">{[["Delays / disruptions", selected.delaySummary], ["Safety", selected.safetySummary], ["QA / QC", selected.qualitySummary], ["Deliveries / visitors", selected.deliveriesVisitors]].filter(([, value]) => value).map(([title, value]) => <div key={String(title)} className="rounded-xl border border-slate-100 p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{value}</p></div>)}</div>
              {selected.generalNotes && <p className="mt-4 whitespace-pre-wrap text-xs leading-5 text-slate-600">{selected.generalNotes}</p>}
            </Card>
            <div className="grid gap-4 md:grid-cols-3"><Card className="p-4" elevation="low"><CloudRain className="h-5 w-5 text-indigo-500" /><p className="mt-3 text-sm font-black">{weather?.condition || "No weather snapshot"}</p><p className="mt-1 text-xs text-slate-500">{weather?.temperatureC != null ? `${weather.temperatureC}°C · ` : ""}{weather?.workImpact || "NONE"} work impact</p></Card><Card className="p-4" elevation="low"><HardHat className="h-5 w-5 text-indigo-500" /><p className="mt-3 text-2xl font-black tabular-nums">{totalHeadcount}</p><p className="text-xs text-slate-500">Recorded site headcount</p></Card><Card className="p-4" elevation="low"><Tractor className="h-5 w-5 text-indigo-500" /><p className="mt-3 text-2xl font-black tabular-nums">{logEquipment.length}</p><p className="text-xs text-slate-500">Equipment entries</p></Card></div>
            {(logCrews.length > 0 || logEquipment.length > 0 || logEvents.length > 0) && <Card className="p-5" elevation="low"><div className="grid gap-6 lg:grid-cols-3"><section><p className="text-xs font-black">Crews</p><div className="mt-3 space-y-2">{logCrews.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-3 text-xs"><p className="font-bold">{item.crewLabel}</p><p className="mt-1 text-slate-500">{item.actualCount} people · {item.regularHours}h regular · {item.overtimeHours}h OT</p></div>)}</div></section><section><p className="text-xs font-black">Equipment</p><div className="mt-3 space-y-2">{logEquipment.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-3 text-xs"><p className="font-bold">{item.equipmentLabel}</p><p className="mt-1 text-slate-500">{item.status} · {item.operatingHours}h operating{item.issueNote ? ` · ${item.issueNote}` : ""}</p></div>)}</div></section><section><p className="text-xs font-black">Site events</p><div className="mt-3 space-y-2">{logEvents.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-3 text-xs"><p className="font-bold">{item.eventType}: {item.title}</p><p className="mt-1 text-slate-500">{item.description}</p></div>)}</div></section></div></Card>}
            {selected.status === "DRAFT" && access.submit && <Card className="flex flex-wrap items-center justify-between gap-3 p-5" elevation="low"><div><p className="text-sm font-black">Ready for formal submission?</p><p className="mt-1 text-xs text-slate-500">Submitting freezes the recorded site-day content. Corrections after submission are append-only amendments.</p></div><button disabled={busy} className={actionClass(true)} onClick={() => run(() => controller.submit(selected))}>Submit Daily Log</button></Card>}
            {(selected.status === "SUBMITTED" || selected.status === "REVIEWED") && access.manage && <Card className="p-5" elevation="low"><p className="text-sm font-black">Append correction / supplement</p><p className="mt-1 text-xs text-slate-500">Formal content is immutable. Add a timestamped amendment instead.</p><textarea className={`${inputClass} mt-3 min-h-20`} value={amendment} onChange={(e) => setAmendment(e.target.value)} /><button disabled={busy || !amendment.trim()} className={`${actionClass(true)} mt-3`} onClick={() => run(async () => { await controller.amend(selected, amendment); setAmendment(""); })}>Add amendment</button>{logAmendments.length > 0 && <div className="mt-4 space-y-2">{logAmendments.map((item) => <div key={item.id} className="rounded-lg border border-slate-100 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">{new Date(item.createdAt).toLocaleString("en-PH")}</p><p className="mt-1 text-xs text-slate-700">{item.amendmentText}</p></div>)}</div>}</Card>}
            {(selected.status === "DRAFT" || selected.status === "SUBMITTED") && access.manage && <label className="block"><span className={labelClass}>Void reason (required only if voiding)</span><input className={inputClass} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Explain why this record should be voided" /></label>}
          </>
        ) : <Card className="p-10 text-center" elevation="low"><CalendarDays className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">Choose a Daily Site Log or create a new one.</p></Card>}
      </div>
    </div>
  );
};
