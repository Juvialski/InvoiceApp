import { getActiveCompanyId, requireActiveCompanyId } from "./companyContext.ts";
import { supabase } from "./supabase.ts";
import {
  emptyDailySiteLogsWorkspaceData,
  type DailySiteCrewEntry,
  type DailySiteEquipmentEntry,
  type DailySiteEvent,
  type DailySiteLog,
  type DailySiteLogAmendment,
  type DailySiteLogAttachment,
  type DailySiteLogDraftSections,
  type DailySiteLogsWorkspaceData,
  type DailySiteWeatherSnapshot,
  type DailySiteShift,
} from "./dailySiteLogs.ts";

export const DAILY_SITE_LOGS_STORAGE_KEY = "engoryx_daily_site_logs_workspace_v1";
type Row = Record<string, unknown>;

function text(value: unknown): string | undefined { return value === null || value === undefined || value === "" ? undefined : String(value); }
function num(value: unknown, fallback = 0): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }

export function dailySiteLogFromRow(row: Row): DailySiteLog {
  return {
    id: String(row.id), companyId: text(row.company_id), projectId: String(row.project_id), logDate: String(row.log_date),
    shiftCode: String(row.shift_code || "DAY") as DailySiteLog["shiftCode"], shiftLabel: text(row.shift_label), sequenceNo: num(row.sequence_no, 1),
    status: String(row.status || "DRAFT") as DailySiteLog["status"], workSummary: String(row.work_summary || ""), delaySummary: text(row.delay_summary),
    safetySummary: text(row.safety_summary), qualitySummary: text(row.quality_summary), deliveriesVisitors: text(row.deliveries_visitors), generalNotes: text(row.general_notes),
    preparedByUserId: text(row.prepared_by_user_id), submittedByUserId: text(row.submitted_by_user_id), reviewedByUserId: text(row.reviewed_by_user_id),
    preparedAt: String(row.prepared_at || row.created_at || ""), submittedAt: text(row.submitted_at), reviewedAt: text(row.reviewed_at), voidedAt: text(row.voided_at), voidReason: text(row.void_reason),
    createdAt: String(row.created_at || ""), updatedAt: String(row.updated_at || ""),
  };
}
export function weatherFromRow(row: Row): DailySiteWeatherSnapshot {
  return { id: String(row.id), companyId: text(row.company_id), dailyLogId: String(row.daily_log_id), condition: String(row.condition || ""), temperatureC: row.temperature_c == null ? undefined : num(row.temperature_c), precipitationMm: row.precipitation_mm == null ? undefined : num(row.precipitation_mm), windKph: row.wind_kph == null ? undefined : num(row.wind_kph), humidityPercent: row.humidity_percent == null ? undefined : num(row.humidity_percent), workImpact: String(row.work_impact || "NONE") as DailySiteWeatherSnapshot["workImpact"], source: String(row.source || "MANUAL") as DailySiteWeatherSnapshot["source"], observedAt: text(row.observed_at), notes: text(row.notes), createdAt: String(row.created_at || ""), updatedAt: String(row.updated_at || "") };
}
export function crewFromRow(row: Row): DailySiteCrewEntry {
  return { id: String(row.id), companyId: text(row.company_id), dailyLogId: String(row.daily_log_id), crewLabel: String(row.crew_label || ""), trade: text(row.trade), plannedCount: num(row.planned_count), actualCount: num(row.actual_count), regularHours: num(row.regular_hours), overtimeHours: num(row.overtime_hours), notes: text(row.notes), createdAt: String(row.created_at || ""), updatedAt: String(row.updated_at || "") };
}
export function equipmentFromRow(row: Row): DailySiteEquipmentEntry {
  return { id: String(row.id), companyId: text(row.company_id), dailyLogId: String(row.daily_log_id), equipmentLabel: String(row.equipment_label || ""), equipmentReference: text(row.equipment_reference), quantity: num(row.quantity, 1), operatingHours: num(row.operating_hours), idleHours: num(row.idle_hours), status: String(row.status || "OPERATING") as DailySiteEquipmentEntry["status"], operatorNote: text(row.operator_note), issueNote: text(row.issue_note), createdAt: String(row.created_at || ""), updatedAt: String(row.updated_at || "") };
}
export function eventFromRow(row: Row): DailySiteEvent {
  return { id: String(row.id), companyId: text(row.company_id), dailyLogId: String(row.daily_log_id), eventType: String(row.event_type || "WORK") as DailySiteEvent["eventType"], occurredAt: text(row.occurred_at), title: String(row.title || ""), description: String(row.description || ""), severity: String(row.severity || "INFO") as DailySiteEvent["severity"], workStoppage: Boolean(row.work_stoppage), location: text(row.location), immediateAction: text(row.immediate_action), createdAt: String(row.created_at || "") };
}
export function amendmentFromRow(row: Row): DailySiteLogAmendment {
  return { id: String(row.id), companyId: text(row.company_id), dailyLogId: String(row.daily_log_id), amendmentText: String(row.amendment_text || ""), createdByUserId: text(row.created_by_user_id), createdAt: String(row.created_at || "") };
}
export function attachmentFromRow(row: Row): DailySiteLogAttachment {
  return { id: String(row.id), companyId: text(row.company_id), dailyLogId: String(row.daily_log_id), storagePath: String(row.storage_path || ""), fileName: String(row.file_name || ""), mimeType: text(row.mime_type), fileSizeBytes: row.file_size_bytes == null ? undefined : num(row.file_size_bytes), caption: text(row.caption), capturedAt: text(row.captured_at), uploadedByUserId: text(row.uploaded_by_user_id), createdAt: String(row.created_at || "") };
}

function resolveCompanyId(companyId?: string): string {
  const active = getActiveCompanyId();
  const resolved = companyId?.trim() || active || requireActiveCompanyId();
  if (active && active !== resolved) throw new Error("The selected company context changed. Reload Daily Logs and retry.");
  return resolved;
}
async function requireAuthenticatedCompany(companyId?: string): Promise<string> {
  if (!supabase) throw new Error("Authentication required for Daily Site Logs.");
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user?.id) throw new Error("Authentication required for Daily Site Logs.");
  return resolveCompanyId(companyId);
}
async function rpc(name: string, args: Record<string, unknown>, companyId?: string): Promise<unknown> {
  const resolvedCompanyId = await requireAuthenticatedCompany(companyId);
  const { data, error } = await supabase!.rpc(name, { p_company_id: resolvedCompanyId, ...args });
  if (error) throw error;
  return data;
}

export async function loadDailySiteLogsFromSupabase(companyId?: string, projectId?: string): Promise<DailySiteLogsWorkspaceData> {
  const resolved = await requireAuthenticatedCompany(companyId);
  let logsQuery = supabase!.from("engineering_daily_logs").select("*").eq("company_id", resolved);
  if (projectId) logsQuery = logsQuery.eq("project_id", projectId);
  const logs = await logsQuery.order("log_date", { ascending: false }).order("sequence_no", { ascending: false });
  if (logs.error) throw logs.error;
  const ids = (logs.data || []).map((row) => String((row as Row).id));
  if (!ids.length) return emptyDailySiteLogsWorkspaceData();
  const [weather, crews, equipment, events, amendments, attachments] = await Promise.all([
    supabase!.from("engineering_daily_log_weather").select("*").eq("company_id", resolved).in("daily_log_id", ids),
    supabase!.from("engineering_daily_log_crews").select("*").eq("company_id", resolved).in("daily_log_id", ids),
    supabase!.from("engineering_daily_log_equipment").select("*").eq("company_id", resolved).in("daily_log_id", ids),
    supabase!.from("engineering_daily_log_events").select("*").eq("company_id", resolved).in("daily_log_id", ids).order("occurred_at", { ascending: true }),
    supabase!.from("engineering_daily_log_amendments").select("*").eq("company_id", resolved).in("daily_log_id", ids).order("created_at", { ascending: true }),
    supabase!.from("engineering_daily_log_attachments").select("*").eq("company_id", resolved).in("daily_log_id", ids).order("created_at", { ascending: true }),
  ]);
  for (const result of [weather, crews, equipment, events, amendments, attachments]) if (result.error) throw result.error;
  return {
    logs: (logs.data || []).map((row) => dailySiteLogFromRow(row as Row)),
    weather: (weather.data || []).map((row) => weatherFromRow(row as Row)),
    crews: (crews.data || []).map((row) => crewFromRow(row as Row)),
    equipment: (equipment.data || []).map((row) => equipmentFromRow(row as Row)),
    events: (events.data || []).map((row) => eventFromRow(row as Row)),
    amendments: (amendments.data || []).map((row) => amendmentFromRow(row as Row)),
    attachments: (attachments.data || []).map((row) => attachmentFromRow(row as Row)),
  };
}

export function readDailySiteLogsFromLocal(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): DailySiteLogsWorkspaceData {
  if (!storage) return emptyDailySiteLogsWorkspaceData();
  try { const raw = storage.getItem(DAILY_SITE_LOGS_STORAGE_KEY); return raw ? { ...emptyDailySiteLogsWorkspaceData(), ...JSON.parse(raw) } : emptyDailySiteLogsWorkspaceData(); }
  catch { return emptyDailySiteLogsWorkspaceData(); }
}
export function writeDailySiteLogsToLocal(data: DailySiteLogsWorkspaceData, storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): void {
  try { storage?.setItem(DAILY_SITE_LOGS_STORAGE_KEY, JSON.stringify(data)); } catch { /* demo/offline best effort */ }
}

function sectionRows(sections: DailySiteLogDraftSections) {
  return {
    p_weather: sections.weather ? {
      condition: sections.weather.condition, temperature_c: sections.weather.temperatureC ?? null, precipitation_mm: sections.weather.precipitationMm ?? null,
      wind_kph: sections.weather.windKph ?? null, humidity_percent: sections.weather.humidityPercent ?? null, work_impact: sections.weather.workImpact,
      source: sections.weather.source, observed_at: sections.weather.observedAt ?? null, notes: sections.weather.notes ?? null,
    } : null,
    p_crews: (sections.crews || []).map((item) => ({ id: item.id, crew_label: item.crewLabel, trade: item.trade ?? null, planned_count: item.plannedCount, actual_count: item.actualCount, regular_hours: item.regularHours, overtime_hours: item.overtimeHours, notes: item.notes ?? null })),
    p_equipment: (sections.equipment || []).map((item) => ({ id: item.id, equipment_label: item.equipmentLabel, equipment_reference: item.equipmentReference ?? null, quantity: item.quantity, operating_hours: item.operatingHours, idle_hours: item.idleHours, status: item.status, operator_note: item.operatorNote ?? null, issue_note: item.issueNote ?? null })),
    p_events: (sections.events || []).map((item) => ({ id: item.id, event_type: item.eventType, occurred_at: item.occurredAt ?? null, title: item.title, description: item.description, severity: item.severity, work_stoppage: item.workStoppage, location: item.location ?? null, immediate_action: item.immediateAction ?? null })),
  };
}

export function saveDailySiteLogDraftRpc(input: { id: string; projectId: string; logDate: string; shiftCode: DailySiteShift; shiftLabel?: string; sequenceNo: number; sections: DailySiteLogDraftSections }, companyId?: string) {
  return rpc("save_engineering_daily_log_draft", {
    p_daily_log_id: input.id, p_project_id: input.projectId, p_log_date: input.logDate, p_shift_code: input.shiftCode, p_shift_label: input.shiftLabel || null,
    p_sequence_no: input.sequenceNo, p_work_summary: input.sections.workSummary, p_delay_summary: input.sections.delaySummary || null, p_safety_summary: input.sections.safetySummary || null,
    p_quality_summary: input.sections.qualitySummary || null, p_deliveries_visitors: input.sections.deliveriesVisitors || null, p_general_notes: input.sections.generalNotes || null,
    ...sectionRows(input.sections),
  }, companyId);
}
export function submitDailySiteLogRpc(id: string, companyId?: string) { return rpc("submit_engineering_daily_log", { p_daily_log_id: id }, companyId); }
export function reviewDailySiteLogRpc(id: string, companyId?: string) { return rpc("review_engineering_daily_log", { p_daily_log_id: id }, companyId); }
export function voidDailySiteLogRpc(id: string, reason: string, companyId?: string) { return rpc("void_engineering_daily_log", { p_daily_log_id: id, p_reason: reason }, companyId); }
export function amendDailySiteLogRpc(id: string, amendmentId: string, text: string, companyId?: string) { return rpc("amend_engineering_daily_log", { p_daily_log_id: id, p_amendment_id: amendmentId, p_amendment_text: text }, companyId); }
