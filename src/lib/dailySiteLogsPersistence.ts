import { getActiveCompanyId, requireActiveCompanyId } from "./companyContext.ts";
import { supabase } from "./supabase.ts";
import {
  emptyDailySiteLogsWorkspaceData,
  type EngineeringDailySiteLog,
  type EngineeringDailySiteLogAddendum,
  type EngineeringDailySiteLogCrew,
  type EngineeringDailySiteLogEquipment,
  type EngineeringDailySiteLogEvent,
  type EngineeringDailySiteLogIssue,
  type EngineeringDailySiteLogMaterialDelivery,
  type EngineeringDailySiteLogSafety,
  type EngineeringDailySiteLogWork,
  type EngineeringDailySiteLogWeather,
  type EngineeringDailySiteLogsWorkspaceData,
} from "./dailySiteLogs.ts";
import { parseEngineeringLifecyclePreview, parseEngineeringLifecycleResult, type EngineeringLifecyclePreview, type EngineeringLifecycleResult } from "./engineeringLifecycle.ts";

export const DAILY_SITE_LOGS_STORAGE_KEY = "invoice_engineering_daily_site_logs_v1";
type Row = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return value === undefined || value === null ? fallback : Boolean(value);
}

export function dailySiteLogFromRow(row: Row): EngineeringDailySiteLog {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    projectId: String(row.project_id),
    siteDate: String(row.site_date || ""),
    reportNumber: String(row.report_number || ""),
    status: String(row.status || "DRAFT") as EngineeringDailySiteLog["status"],
    preparedByUserId: text(row.prepared_by_user_id),
    submittedByUserId: text(row.submitted_by_user_id),
    finalizedByUserId: text(row.finalized_by_user_id),
    voidedByUserId: text(row.voided_by_user_id),
    workSummary: String(row.work_summary || ""),
    progressNotes: text(row.progress_notes),
    delaysConstraints: text(row.delays_constraints),
    generalNotes: text(row.general_notes),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    submittedAt: text(row.submitted_at),
    finalizedAt: text(row.finalized_at),
    voidedAt: text(row.voided_at),
    voidReason: text(row.void_reason),
  };
}

export function dailySiteLogWeatherFromRow(row: Row): EngineeringDailySiteLogWeather {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    siteLogId: String(row.site_log_id),
    condition: String(row.condition || "UNKNOWN") as EngineeringDailySiteLogWeather["condition"],
    temperature: row.temperature === null || row.temperature === undefined ? undefined : numberValue(row.temperature),
    temperatureUnit: String(row.temperature_unit || "C") as EngineeringDailySiteLogWeather["temperatureUnit"],
    precipitationNotes: text(row.precipitation_notes),
    windNotes: text(row.wind_notes),
    humidity: row.humidity === null || row.humidity === undefined ? undefined : numberValue(row.humidity),
    siteConditionNotes: text(row.site_condition_notes),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

export function dailySiteLogCrewFromRow(row: Row): EngineeringDailySiteLogCrew {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    siteLogId: String(row.site_log_id),
    trade: text(row.trade),
    crewLabel: text(row.crew_label),
    contractorLabel: text(row.contractor_label),
    projectCostCodeId: text(row.project_cost_code_id) || null,
    headcount: numberValue(row.headcount),
    regularHours: row.regular_hours === null || row.regular_hours === undefined ? undefined : numberValue(row.regular_hours),
    overtimeHours: row.overtime_hours === null || row.overtime_hours === undefined ? undefined : numberValue(row.overtime_hours),
    notes: text(row.notes),
    sortOrder: numberValue(row.sort_order),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

export function dailySiteLogEquipmentFromRow(row: Row): EngineeringDailySiteLogEquipment {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    siteLogId: String(row.site_log_id),
    equipmentId: text(row.equipment_id) || null,
    equipmentName: String(row.equipment_name || ""),
    equipmentType: text(row.equipment_type),
    assetReference: text(row.asset_reference),
    operatingHours: row.operating_hours === null || row.operating_hours === undefined ? undefined : numberValue(row.operating_hours),
    idleHours: row.idle_hours === null || row.idle_hours === undefined ? undefined : numberValue(row.idle_hours),
    operatorCrewNote: text(row.operator_crew_note),
    conditionStatus: text(row.condition_status),
    notes: text(row.notes),
    sortOrder: numberValue(row.sort_order),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

export function dailySiteLogWorkFromRow(row: Row): EngineeringDailySiteLogWork {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    siteLogId: String(row.site_log_id),
    projectId: String(row.project_id),
    description: String(row.description || ""),
    projectCostCodeId: text(row.project_cost_code_id) || null,
    quantity: row.quantity === null || row.quantity === undefined ? undefined : numberValue(row.quantity),
    unit: text(row.unit),
    workLocation: text(row.work_location),
    notes: text(row.notes),
    sortOrder: numberValue(row.sort_order),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

export function dailySiteLogMaterialDeliveryFromRow(row: Row): EngineeringDailySiteLogMaterialDelivery {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    siteLogId: String(row.site_log_id),
    projectId: String(row.project_id),
    materialId: text(row.material_id) || null,
    materialNameSnapshot: String(row.material_name_snapshot || ""),
    quantityObserved: numberValue(row.quantity_observed),
    unitSnapshot: String(row.unit_snapshot || ""),
    supplierDeliveryReference: text(row.supplier_delivery_reference) || null,
    purchaseOrderId: text(row.purchase_order_id) || null,
    purchaseOrderLineId: text(row.purchase_order_line_id) || null,
    purchaseOrderReceiptId: text(row.purchase_order_receipt_id) || null,
    deliveryCondition: text(row.delivery_condition) || null,
    location: text(row.location) || null,
    projectCostCodeId: text(row.project_cost_code_id) || null,
    notes: text(row.notes) || null,
    sortOrder: numberValue(row.sort_order),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

export function dailySiteLogIssueFromRow(row: Row): EngineeringDailySiteLogIssue {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    siteLogId: String(row.site_log_id),
    projectId: String(row.project_id),
    category: String(row.category || ""),
    description: String(row.description || ""),
    severity: String(row.severity || "MEDIUM") as EngineeringDailySiteLogIssue["severity"],
    status: String(row.status || "OPEN") as EngineeringDailySiteLogIssue["status"],
    mitigation: text(row.mitigation),
    responsibleParty: text(row.responsible_party),
    projectCostCodeId: text(row.project_cost_code_id) || null,
    resolvedAt: text(row.resolved_at),
    notes: text(row.notes),
    sortOrder: numberValue(row.sort_order),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

export function dailySiteLogSafetyFromRow(row: Row): EngineeringDailySiteLogSafety {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    siteLogId: String(row.site_log_id),
    category: String(row.category || ""),
    severity: String(row.severity || "OBSERVATION") as EngineeringDailySiteLogSafety["severity"],
    description: String(row.description || ""),
    actionTaken: text(row.action_taken),
    isResolved: booleanValue(row.is_resolved, true),
    notes: text(row.notes),
    sortOrder: numberValue(row.sort_order),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

export function dailySiteLogEventFromRow(row: Row): EngineeringDailySiteLogEvent {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    siteLogId: String(row.site_log_id),
    eventType: String(row.event_type || "UPDATED") as EngineeringDailySiteLogEvent["eventType"],
    fromStatus: text(row.from_status) as EngineeringDailySiteLogEvent["fromStatus"],
    toStatus: String(row.to_status || "DRAFT") as EngineeringDailySiteLogEvent["toStatus"],
    actorUserId: text(row.actor_user_id),
    reason: text(row.reason),
    createdAt: String(row.created_at || ""),
  };
}

export function dailySiteLogAddendumFromRow(row: Row): EngineeringDailySiteLogAddendum {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    siteLogId: String(row.site_log_id),
    addendumNumber: numberValue(row.addendum_number, 1),
    reason: String(row.reason || ""),
    correctionText: String(row.correction_text || ""),
    createdByUserId: text(row.created_by_user_id),
    createdAt: String(row.created_at || ""),
  };
}

function resolveCompanyId(companyId?: string): string {
  const active = getActiveCompanyId();
  const resolved = companyId?.trim() || active || requireActiveCompanyId();
  if (active && active !== resolved) throw new Error("Deployment company access changed. Reload Site Logs and retry.");
  return resolved;
}

async function requireAuthenticatedCompany(companyId?: string): Promise<string> {
  if (!supabase) throw new Error("Authentication required for Site Logs.");
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user?.id) throw new Error("Authentication required for Site Logs.");
  return resolveCompanyId(companyId);
}

async function rpc(name: string, args: Record<string, unknown>, companyId?: string): Promise<unknown> {
  const resolvedCompanyId = await requireAuthenticatedCompany(companyId);
  const { data, error } = await supabase!.rpc(name, { p_company_id: resolvedCompanyId, ...args });
  if (error) throw error;
  return data;
}

async function lifecycleRpc(name: string, args: Record<string, unknown>, companyId?: string): Promise<unknown> {
  await requireAuthenticatedCompany(companyId);
  const { data, error } = await supabase!.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function loadDailySiteLogsFromSupabase(companyId?: string, projectId?: string): Promise<EngineeringDailySiteLogsWorkspaceData> {
  const resolvedCompanyId = await requireAuthenticatedCompany(companyId);
  let logsQuery = supabase!.from("engineering_daily_site_logs").select("*").eq("company_id", resolvedCompanyId).order("site_date", { ascending: false }).order("created_at", { ascending: false });
  if (projectId) logsQuery = logsQuery.eq("project_id", projectId);
  const [logs, weather, crew, equipment, work, materialDeliveries, issues, safety, events, addenda] = await Promise.all([
    logsQuery,
    supabase!.from("engineering_daily_site_log_weather").select("*").eq("company_id", resolvedCompanyId).order("created_at", { ascending: true }),
    supabase!.from("engineering_daily_site_log_crew").select("*").eq("company_id", resolvedCompanyId).order("sort_order", { ascending: true }),
    supabase!.from("engineering_daily_site_log_equipment").select("*").eq("company_id", resolvedCompanyId).order("sort_order", { ascending: true }),
    supabase!.from("engineering_daily_site_log_work").select("*").eq("company_id", resolvedCompanyId).order("sort_order", { ascending: true }),
    supabase!.from("engineering_daily_site_log_material_deliveries").select("*").eq("company_id", resolvedCompanyId).order("sort_order", { ascending: true }),
    supabase!.from("engineering_daily_site_log_issues").select("*").eq("company_id", resolvedCompanyId).order("sort_order", { ascending: true }),
    supabase!.from("engineering_daily_site_log_safety").select("*").eq("company_id", resolvedCompanyId).order("sort_order", { ascending: true }),
    supabase!.from("engineering_daily_site_log_events").select("*").eq("company_id", resolvedCompanyId).order("created_at", { ascending: true }),
    supabase!.from("engineering_daily_site_log_addenda").select("*").eq("company_id", resolvedCompanyId).order("addendum_number", { ascending: true }),
  ]);
  for (const result of [logs, weather, crew, equipment, work, materialDeliveries, issues, safety, events, addenda]) if (result.error) throw result.error;
  const logIds = new Set((logs.data || []).map((row) => String((row as Row).id)));
  const onlyProjectLogs = (rows: Row[]) => rows.filter((row) => logIds.has(String(row.site_log_id)));
  return {
    logs: (logs.data || []).map((row) => dailySiteLogFromRow(row as Row)),
    weather: onlyProjectLogs((weather.data || []) as Row[]).map(dailySiteLogWeatherFromRow),
    crew: onlyProjectLogs((crew.data || []) as Row[]).map(dailySiteLogCrewFromRow),
    equipment: onlyProjectLogs((equipment.data || []) as Row[]).map(dailySiteLogEquipmentFromRow),
    work: onlyProjectLogs((work.data || []) as Row[]).map(dailySiteLogWorkFromRow),
    materialDeliveries: onlyProjectLogs((materialDeliveries.data || []) as Row[]).map(dailySiteLogMaterialDeliveryFromRow),
    issues: onlyProjectLogs((issues.data || []) as Row[]).map(dailySiteLogIssueFromRow),
    safety: onlyProjectLogs((safety.data || []) as Row[]).map(dailySiteLogSafetyFromRow),
    events: onlyProjectLogs((events.data || []) as Row[]).map(dailySiteLogEventFromRow),
    addenda: onlyProjectLogs((addenda.data || []) as Row[]).map(dailySiteLogAddendumFromRow),
  };
}

export function readDailySiteLogsFromLocal(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): EngineeringDailySiteLogsWorkspaceData {
  if (!storage) return emptyDailySiteLogsWorkspaceData();
  try {
    const raw = storage.getItem(DAILY_SITE_LOGS_STORAGE_KEY);
    if (!raw) return emptyDailySiteLogsWorkspaceData();
    const parsed = JSON.parse(raw) as Partial<EngineeringDailySiteLogsWorkspaceData>;
    const result: Partial<EngineeringDailySiteLogsWorkspaceData> = {
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      weather: Array.isArray(parsed.weather) ? parsed.weather : [],
      crew: Array.isArray(parsed.crew) ? parsed.crew : [],
      equipment: Array.isArray(parsed.equipment) ? parsed.equipment : [],
      safety: Array.isArray(parsed.safety) ? parsed.safety : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      addenda: Array.isArray(parsed.addenda) ? parsed.addenda : [],
    };
    if (Array.isArray(parsed.work)) result.work = parsed.work;
    if (Array.isArray(parsed.materialDeliveries)) result.materialDeliveries = parsed.materialDeliveries;
    if (Array.isArray(parsed.issues)) result.issues = parsed.issues;
    return result as EngineeringDailySiteLogsWorkspaceData;
  } catch {
    return emptyDailySiteLogsWorkspaceData();
  }
}

export function writeDailySiteLogsToLocal(data: EngineeringDailySiteLogsWorkspaceData, storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): void {
  try { storage?.setItem(DAILY_SITE_LOGS_STORAGE_KEY, JSON.stringify(data)); } catch { /* browser-only best effort */ }
}

export function dailySiteLogAggregateToRpcPayload(aggregate: { log: EngineeringDailySiteLog; weather?: EngineeringDailySiteLogWeather; crew: EngineeringDailySiteLogCrew[]; equipment: EngineeringDailySiteLogEquipment[]; work?: EngineeringDailySiteLogWork[]; materialDeliveries?: EngineeringDailySiteLogMaterialDelivery[]; issues?: EngineeringDailySiteLogIssue[]; safety: EngineeringDailySiteLogSafety[] }) {
  return {
    p_daily_site_log_id: aggregate.log.id,
    p_project_id: aggregate.log.projectId,
    p_site_date: aggregate.log.siteDate,
    p_report_number: aggregate.log.reportNumber,
    p_work_summary: aggregate.log.workSummary,
    p_progress_notes: aggregate.log.progressNotes || null,
    p_delays_constraints: aggregate.log.delaysConstraints || null,
    p_general_notes: aggregate.log.generalNotes || null,
    p_weather: aggregate.weather ? {
      id: aggregate.weather.id,
      condition: aggregate.weather.condition,
      temperature: aggregate.weather.temperature ?? null,
      temperature_unit: aggregate.weather.temperatureUnit,
      precipitation_notes: aggregate.weather.precipitationNotes || null,
      wind_notes: aggregate.weather.windNotes || null,
      humidity: aggregate.weather.humidity ?? null,
      site_condition_notes: aggregate.weather.siteConditionNotes || null,
    } : null,
    p_crew: aggregate.crew.map((row) => ({ id: row.id, trade: row.trade || null, crew_label: row.crewLabel || null, contractor_label: row.contractorLabel || null, project_cost_code_id: row.projectCostCodeId || null, headcount: row.headcount, regular_hours: row.regularHours ?? null, overtime_hours: row.overtimeHours ?? null, notes: row.notes || null, sort_order: row.sortOrder })),
    p_equipment: aggregate.equipment.map((row) => ({ id: row.id, equipment_id: row.equipmentId || null, equipment_name: row.equipmentName, equipment_type: row.equipmentType || null, asset_reference: row.assetReference || null, operating_hours: row.operatingHours ?? null, idle_hours: row.idleHours ?? null, operator_crew_note: row.operatorCrewNote || null, condition_status: row.conditionStatus || null, notes: row.notes || null, sort_order: row.sortOrder })),
    p_work: (aggregate.work || []).map((row) => ({ id: row.id, description: row.description, project_cost_code_id: row.projectCostCodeId || null, quantity: row.quantity ?? null, unit: row.unit || null, work_location: row.workLocation || null, notes: row.notes || null, sort_order: row.sortOrder })),
    p_material_deliveries: (aggregate.materialDeliveries || []).map((row) => ({ id: row.id, material_id: row.materialId || null, material_name_snapshot: row.materialNameSnapshot, quantity_observed: row.quantityObserved, unit_snapshot: row.unitSnapshot, supplier_delivery_reference: row.supplierDeliveryReference || null, purchase_order_id: row.purchaseOrderId || null, purchase_order_line_id: row.purchaseOrderLineId || null, purchase_order_receipt_id: row.purchaseOrderReceiptId || null, delivery_condition: row.deliveryCondition || null, location: row.location || null, project_cost_code_id: row.projectCostCodeId || null, notes: row.notes || null, sort_order: row.sortOrder })),
    p_issues: (aggregate.issues || []).map((row) => ({ id: row.id, category: row.category, description: row.description, severity: row.severity, status: row.status, mitigation: row.mitigation || null, responsible_party: row.responsibleParty || null, project_cost_code_id: row.projectCostCodeId || null, resolved_at: row.resolvedAt || null, notes: row.notes || null, sort_order: row.sortOrder })),
    p_safety: aggregate.safety.map((row) => ({ id: row.id, category: row.category, severity: row.severity, description: row.description, action_taken: row.actionTaken || null, is_resolved: row.isResolved, notes: row.notes || null, sort_order: row.sortOrder })),
  };
}

export function createDailySiteLogRpc(aggregate: Parameters<typeof dailySiteLogAggregateToRpcPayload>[0], companyId?: string) {
  return rpc("create_engineering_daily_site_log_v2", dailySiteLogAggregateToRpcPayload(aggregate), companyId);
}

export function updateDailySiteLogDraftRpc(aggregate: Parameters<typeof dailySiteLogAggregateToRpcPayload>[0], companyId?: string) {
  return rpc("update_engineering_daily_site_log_draft_v2", dailySiteLogAggregateToRpcPayload(aggregate), companyId);
}

export function submitDailySiteLogRpc(siteLogId: string, companyId?: string) {
  return rpc("submit_engineering_daily_site_log", { p_daily_site_log_id: siteLogId }, companyId);
}

export function finalizeDailySiteLogRpc(siteLogId: string, companyId?: string) {
  return rpc("finalize_engineering_daily_site_log", { p_daily_site_log_id: siteLogId }, companyId);
}

export function voidDailySiteLogRpc(siteLogId: string, reason: string, companyId?: string) {
  return rpc("void_engineering_daily_site_log", { p_daily_site_log_id: siteLogId, p_reason: reason }, companyId);
}

export async function previewDailySiteLogLifecycleInSupabase(siteLogId: string, companyId?: string): Promise<EngineeringLifecyclePreview> {
  return parseEngineeringLifecyclePreview(await lifecycleRpc("preview_engineering_daily_site_log_lifecycle", { p_site_log_id: siteLogId }, companyId), "SITE_LOG");
}

export async function applyDailySiteLogLifecycleInSupabase(siteLogId: string, action: "DELETE_UNUSED" | "VOID", reason?: string, companyId?: string): Promise<EngineeringLifecycleResult> {
  return parseEngineeringLifecycleResult(await lifecycleRpc("apply_engineering_daily_site_log_lifecycle", { p_site_log_id: siteLogId, p_action: action, p_reason: reason || null }, companyId), "SITE_LOG");
}

export async function createDailySiteLogAddendumRpc(siteLogId: string, reason: string, correctionText: string, companyId?: string): Promise<EngineeringDailySiteLogAddendum> {
  return dailySiteLogAddendumFromRow(await lifecycleRpc("create_engineering_daily_site_log_addendum", { p_site_log_id: siteLogId, p_reason: reason, p_correction_text: correctionText }, companyId) as Row);
}
