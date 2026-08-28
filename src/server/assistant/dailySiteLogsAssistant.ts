import { randomUUID } from "node:crypto";
import type { AssistantRiskTier } from "../../assistant/assistantTypes.ts";
import { DAILY_SITE_LOG_STATUSES } from "../../lib/dailySiteLogs.ts";
import { AssistantBackendError, AssistantToolError, type AssistantToolContext, type ToolExecutionResult } from "./assistantBackendTypes.ts";
import { boundedLimit, boundedText, enumValue, optionalDateOnly, optionalNumber, plainObject, requireDateOnly, requireUuid } from "./toolValidation.ts";

export interface DailySiteLogsToolDefinition {
  name: string;
  description: string;
  riskTier: AssistantRiskTier;
  permissions: string[];
  parametersJsonSchema: Record<string, unknown>;
  requiresConfirmation: boolean;
}

const uuid = { type: "string", description: "Identifier supplied by a prior tool result or the current workspace context." };
const date = { type: "string", description: "Calendar date in YYYY-MM-DD format." };
const limit = { type: "integer", minimum: 1, maximum: 50 };
const weather = {
  type: "object",
  properties: {
    id: uuid,
    condition: { type: "string", enum: ["CLEAR", "PARTLY_CLOUDY", "OVERCAST", "RAIN", "STORM", "WINDY", "EXTREME_HEAT", "OTHER", "UNKNOWN"] },
    temperature: { type: "number", minimum: -100, maximum: 100 },
    temperatureUnit: { type: "string", enum: ["C", "F"] },
    precipitationNotes: { type: "string" },
    windNotes: { type: "string" },
    humidity: { type: "number", minimum: 0, maximum: 100 },
    siteConditionNotes: { type: "string" },
  },
  additionalProperties: false,
};
const crew = {
  type: "object",
  properties: { id: uuid, trade: { type: "string" }, crewLabel: { type: "string" }, contractorLabel: { type: "string" }, headcount: { type: "integer", minimum: 0, maximum: 100000 }, regularHours: { type: "number", minimum: 0, maximum: 24 }, overtimeHours: { type: "number", minimum: 0, maximum: 24 }, notes: { type: "string" } },
  required: ["headcount"],
  additionalProperties: false,
};
const equipment = {
  type: "object",
  properties: { id: uuid, equipmentName: { type: "string" }, equipmentType: { type: "string" }, assetReference: { type: "string" }, operatingHours: { type: "number", minimum: 0, maximum: 24 }, idleHours: { type: "number", minimum: 0, maximum: 24 }, operatorCrewNote: { type: "string" }, conditionStatus: { type: "string" }, notes: { type: "string" } },
  required: ["equipmentName"],
  additionalProperties: false,
};
const safety = {
  type: "object",
  properties: { id: uuid, category: { type: "string" }, severity: { type: "string", enum: ["OBSERVATION", "LOW", "MEDIUM", "HIGH", "CRITICAL"] }, description: { type: "string" }, actionTaken: { type: "string" }, isResolved: { type: "boolean" }, notes: { type: "string" } },
  required: ["category", "description"],
  additionalProperties: false,
};

function schema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties, required, additionalProperties: false };
}
function read(name: string, description: string, permissions: string[], properties: Record<string, unknown> = {}, required: string[] = []): DailySiteLogsToolDefinition {
  return { name, description, permissions, riskTier: "READ", parametersJsonSchema: schema(properties, required), requiresConfirmation: false };
}
function navigation(name: string, description: string, permissions: string[], properties: Record<string, unknown>, required: string[]): DailySiteLogsToolDefinition {
  return { name, description, permissions, riskTier: "NAVIGATION", parametersJsonSchema: schema(properties, required), requiresConfirmation: false };
}
function prepare(name: string, description: string, permissions: string[], properties: Record<string, unknown>, required: string[] = []): DailySiteLogsToolDefinition {
  return { name, description, permissions, riskTier: "PREPARE", parametersJsonSchema: schema(properties, required), requiresConfirmation: true };
}

const aggregateProperties = {
  dailySiteLogId: uuid,
  projectId: uuid,
  siteDate: date,
  reportNumber: { type: "string" },
  workSummary: { type: "string" },
  progressNotes: { type: "string" },
  delaysConstraints: { type: "string" },
  generalNotes: { type: "string" },
  weather,
  crew: { type: "array", maxItems: 100, items: crew },
  equipment: { type: "array", maxItems: 100, items: equipment },
  safety: { type: "array", maxItems: 100, items: safety },
};

export const DAILY_SITE_LOGS_TOOL_DEFINITIONS: readonly DailySiteLogsToolDefinition[] = Object.freeze([
  read("search_site_logs", "Search the current company Daily Site Log register by project, date, status, weather, safety, or field text.", ["engineering.sitelogs.read"], { projectId: uuid, from: date, to: date, status: { type: "string", enum: DAILY_SITE_LOG_STATUSES }, weatherCondition: { type: "string" }, hasSafety: { type: "boolean" }, query: { type: "string" }, limit }),
  read("get_site_log", "Get one company Daily Site Log with weather, crew, equipment, safety, and lifecycle history.", ["engineering.sitelogs.read"], { siteLogId: uuid }, ["siteLogId"]),
  navigation("navigate_to_site_log", "Open a verified company Daily Site Log in its project workspace.", ["engineering.sitelogs.read", "projects.read"], { siteLogId: uuid }, ["siteLogId"]),
  prepare("prepare_create_site_log", "Prepare a project Daily Site Log draft. Confirmation is required before persistence.", ["engineering.sitelogs.create"], aggregateProperties, ["projectId", "siteDate"]),
  prepare("prepare_update_site_log", "Prepare an update to a project Daily Site Log draft. Submitted and finalized history remains protected.", ["engineering.sitelogs.update"], { siteLogId: uuid, ...aggregateProperties }, ["siteLogId", "projectId", "siteDate"]),
  prepare("prepare_submit_site_log", "Prepare formal submission of a complete Daily Site Log. Confirmation is required.", ["engineering.sitelogs.submit"], { siteLogId: uuid }, ["siteLogId"]),
  prepare("prepare_finalize_site_log", "Prepare finalization of a submitted Daily Site Log. Confirmation is required; the record is not silently rewritten.", ["engineering.sitelogs.manage"], { siteLogId: uuid }, ["siteLogId"]),
  prepare("prepare_void_site_log", "Prepare guarded voiding of an unfinalized Daily Site Log. A reason is required.", ["engineering.sitelogs.manage"], { siteLogId: uuid, reason: { type: "string" } }, ["siteLogId", "reason"]),
]);

const TOOL_NAMES = new Set(DAILY_SITE_LOGS_TOOL_DEFINITIONS.map((item) => item.name));
const CONDITIONS = ["CLEAR", "PARTLY_CLOUDY", "OVERCAST", "RAIN", "STORM", "WINDY", "EXTREME_HEAT", "OTHER", "UNKNOWN"] as const;
const SEVERITIES = ["OBSERVATION", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export function isDailySiteLogsTool(name: string): boolean { return TOOL_NAMES.has(name); }

function uuidOrNew(value: unknown, label: string) {
  return value === undefined || value === null || value === "" ? randomUUID() : requireUuid(value, label);
}

function optionalArray(value: unknown, label: string, max: number): Record<string, unknown>[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max) throw new AssistantToolError("INVALID_BATCH", `${label} must contain at most ${max} items.`);
  return value.map((item, index) => plainObject(item, `${label}[${index}]`));
}

function normalizeWeather(value: unknown) {
  if (value === undefined || value === null) return undefined;
  const row = plainObject(value, "weather");
  return {
    id: uuidOrNew(row.id, "weather.id"),
    condition: enumValue(row.condition || "UNKNOWN", "weather.condition", CONDITIONS)!,
    temperature: optionalNumber(row.temperature, "weather.temperature", { min: -100, max: 100 }),
    temperatureUnit: enumValue(row.temperatureUnit || "C", "weather.temperatureUnit", ["C", "F"] as const)!,
    precipitationNotes: boundedText(row.precipitationNotes, "weather.precipitationNotes", 1000, false),
    windNotes: boundedText(row.windNotes, "weather.windNotes", 1000, false),
    humidity: optionalNumber(row.humidity, "weather.humidity", { min: 0, max: 100 }),
    siteConditionNotes: boundedText(row.siteConditionNotes, "weather.siteConditionNotes", 2000, false),
  };
}

function normalizeAggregate(args: Record<string, unknown>, options: { requireProject?: boolean } = {}) {
  const projectId = args.projectId ? requireUuid(args.projectId, "projectId") : undefined;
  if (options.requireProject !== false && !projectId) throw new AssistantToolError("INVALID_ARGUMENT", "projectId is required.");
  const siteDate = requireDateOnly(args.siteDate, "siteDate");
  const crewRows = optionalArray(args.crew, "crew", 100).map((row, index) => ({
    id: uuidOrNew(row.id, `crew[${index}].id`), trade: boundedText(row.trade, `crew[${index}].trade`, 120, false), crewLabel: boundedText(row.crewLabel, `crew[${index}].crewLabel`, 160, false), contractorLabel: boundedText(row.contractorLabel, `crew[${index}].contractorLabel`, 160, false), headcount: optionalNumber(row.headcount, `crew[${index}].headcount`, { min: 0, max: 100000, integer: true }) ?? 0, regularHours: optionalNumber(row.regularHours, `crew[${index}].regularHours`, { min: 0, max: 24 }), overtimeHours: optionalNumber(row.overtimeHours, `crew[${index}].overtimeHours`, { min: 0, max: 24 }), notes: boundedText(row.notes, `crew[${index}].notes`, 1000, false), sort_order: index,
  }));
  const equipmentRows = optionalArray(args.equipment, "equipment", 100).map((row, index) => ({
    id: uuidOrNew(row.id, `equipment[${index}].id`), equipmentName: boundedText(row.equipmentName, `equipment[${index}].equipmentName`, 180)!, equipmentType: boundedText(row.equipmentType, `equipment[${index}].equipmentType`, 120, false), assetReference: boundedText(row.assetReference, `equipment[${index}].assetReference`, 120, false), operatingHours: optionalNumber(row.operatingHours, `equipment[${index}].operatingHours`, { min: 0, max: 24 }), idleHours: optionalNumber(row.idleHours, `equipment[${index}].idleHours`, { min: 0, max: 24 }), operatorCrewNote: boundedText(row.operatorCrewNote, `equipment[${index}].operatorCrewNote`, 500, false), conditionStatus: boundedText(row.conditionStatus, `equipment[${index}].conditionStatus`, 120, false), notes: boundedText(row.notes, `equipment[${index}].notes`, 1000, false), sort_order: index,
  }));
  const safetyRows = optionalArray(args.safety, "safety", 100).map((row, index) => ({
    id: uuidOrNew(row.id, `safety[${index}].id`), category: boundedText(row.category, `safety[${index}].category`, 120)!, severity: enumValue(row.severity || "OBSERVATION", `safety[${index}].severity`, SEVERITIES)!, description: boundedText(row.description, `safety[${index}].description`, 4000)!, actionTaken: boundedText(row.actionTaken, `safety[${index}].actionTaken`, 2000, false), isResolved: row.isResolved === undefined ? true : row.isResolved, notes: boundedText(row.notes, `safety[${index}].notes`, 1000, false), sort_order: index,
  }));
  if (args.weather !== undefined && args.weather !== null && !normalizeWeather(args.weather)) throw new AssistantToolError("INVALID_ARGUMENT", "weather is invalid.");
  if (args.hasSafety !== undefined && typeof args.hasSafety !== "boolean") throw new AssistantToolError("INVALID_ARGUMENT", "hasSafety must be boolean when provided.");
  for (const [index, row] of crewRows.entries()) if (!row.trade && !row.crewLabel && !row.contractorLabel) throw new AssistantToolError("INVALID_ARGUMENT", `crew[${index}] needs a trade, crew, or contractor label.`);
  for (const [index, row] of safetyRows.entries()) if (typeof row.isResolved !== "boolean") throw new AssistantToolError("INVALID_ARGUMENT", `safety[${index}].isResolved must be boolean.`);
  return {
    projectId,
    siteDate,
    reportNumber: boundedText(args.reportNumber, "reportNumber", 100, false),
    workSummary: boundedText(args.workSummary, "workSummary", 8000, false),
    progressNotes: boundedText(args.progressNotes, "progressNotes", 8000, false),
    delaysConstraints: boundedText(args.delaysConstraints, "delaysConstraints", 8000, false),
    generalNotes: boundedText(args.generalNotes, "generalNotes", 8000, false),
    weather: normalizeWeather(args.weather),
    crew: crewRows,
    equipment: equipmentRows,
    safety: safetyRows,
  };
}

export function validateDailySiteLogsToolArguments(toolName: string, input: unknown): Record<string, unknown> {
  const args = plainObject(input);
  switch (toolName) {
    case "search_site_logs": {
      const from = optionalDateOnly(args.from, "from");
      const to = optionalDateOnly(args.to, "to");
      if (from && to && from > to) throw new AssistantToolError("INVALID_DATE_RANGE", "The start date cannot be after the end date.");
      if (args.hasSafety !== undefined && typeof args.hasSafety !== "boolean") throw new AssistantToolError("INVALID_ARGUMENT", "hasSafety must be boolean when provided.");
      return { projectId: args.projectId ? requireUuid(args.projectId, "projectId") : undefined, from, to, status: enumValue(args.status, "status", DAILY_SITE_LOG_STATUSES, false), weatherCondition: boundedText(args.weatherCondition, "weatherCondition", 40, false)?.toUpperCase(), hasSafety: args.hasSafety === undefined ? undefined : args.hasSafety, query: boundedText(args.query, "query", 200, false), limit: boundedLimit(args.limit) };
    }
    case "get_site_log":
    case "navigate_to_site_log":
    case "prepare_submit_site_log":
    case "prepare_finalize_site_log": return { siteLogId: requireUuid(args.siteLogId, "siteLogId") };
    case "prepare_void_site_log": return { siteLogId: requireUuid(args.siteLogId, "siteLogId"), reason: boundedText(args.reason, "reason", 1000)! };
    case "prepare_create_site_log": {
      const aggregate = normalizeAggregate(args);
      return { dailySiteLogId: uuidOrNew(args.dailySiteLogId, "dailySiteLogId"), ...aggregate };
    }
    case "prepare_update_site_log": {
      const aggregate = normalizeAggregate(args);
      return { siteLogId: requireUuid(args.siteLogId, "siteLogId"), ...aggregate };
    }
    default: throw new AssistantToolError("UNKNOWN_TOOL", "That Site Log operation is not available.");
  }
}

function compactRow(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null && value !== undefined));
}

async function queryOne(context: AssistantToolContext, table: string, id: string) {
  const result = await (context.auth.supabase as any).from(table).select("*").eq("company_id", context.auth.companyId).eq("id", id).maybeSingle();
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "Daily Site Logs could not be read safely.", 503);
  if (!result.data) throw new AssistantBackendError("NOT_FOUND", "The Daily Site Log is not available in this company.", 404);
  return result.data as Record<string, unknown>;
}

async function queryProject(context: AssistantToolContext, projectId: string) {
  const result = await (context.auth.supabase as any).from("projects").select("id,project_name,status,archived_at").eq("company_id", context.auth.companyId).eq("id", projectId).maybeSingle();
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "The project could not be verified safely.", 503);
  if (!result.data) throw new AssistantBackendError("NOT_FOUND", "The project is not available in this company.", 404);
  if (result.data.archived_at || result.data.status === "ARCHIVED") throw new AssistantBackendError("PROJECT_UNAVAILABLE", "Archived projects cannot receive new Site Logs.", 409);
  return result.data as Record<string, unknown>;
}

async function getSiteLog(args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  const log = await queryOne(context, "engineering_daily_site_logs", String(args.siteLogId));
  const [weather, crew, equipment, safety, events] = await Promise.all([
    (context.auth.supabase as any).from("engineering_daily_site_log_weather").select("*").eq("company_id", context.auth.companyId).eq("site_log_id", log.id).maybeSingle(),
    (context.auth.supabase as any).from("engineering_daily_site_log_crew").select("*").eq("company_id", context.auth.companyId).eq("site_log_id", log.id).order("sort_order"),
    (context.auth.supabase as any).from("engineering_daily_site_log_equipment").select("*").eq("company_id", context.auth.companyId).eq("site_log_id", log.id).order("sort_order"),
    (context.auth.supabase as any).from("engineering_daily_site_log_safety").select("*").eq("company_id", context.auth.companyId).eq("site_log_id", log.id).order("sort_order"),
    (context.auth.supabase as any).from("engineering_daily_site_log_events").select("*").eq("company_id", context.auth.companyId).eq("site_log_id", log.id).order("created_at"),
  ]);
  if (weather.error || crew.error || equipment.error || safety.error || events.error) throw new AssistantBackendError("TOOL_READ_FAILED", "Daily Site Log details could not be read safely.", 503);
  return { output: { log: compactRow(log), weather: weather.data ? compactRow(weather.data) : null, crew: (crew.data || []).map(compactRow), equipment: (equipment.data || []).map(compactRow), safety: (safety.data || []).map(compactRow), events: (events.data || []).map(compactRow) }, references: [{ type: "report", id: String(log.id), label: `${log.report_number}: ${log.site_date}` }] };
}

async function searchSiteLogs(args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  let query = (context.auth.supabase as any).from("engineering_daily_site_logs").select("id,project_id,site_date,report_number,status,work_summary,delays_constraints").eq("company_id", context.auth.companyId).order("site_date", { ascending: false }).limit(Number(args.limit || 20));
  if (args.projectId) query = query.eq("project_id", args.projectId);
  if (args.from) query = query.gte("site_date", args.from);
  if (args.to) query = query.lte("site_date", args.to);
  if (args.status) query = query.eq("status", args.status);
  const result = await query;
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "The Daily Site Log register could not be read safely.", 503);
  let records = (result.data || []) as Record<string, unknown>[];
  if (args.query) {
    const needle = String(args.query).toLowerCase();
    records = records.filter((row) => `${row.work_summary || ""} ${row.delays_constraints || ""}`.toLowerCase().includes(needle));
  }
  const ids = records.map((row) => String(row.id));
  const safetyRows = ids.length ? await (context.auth.supabase as any).from("engineering_daily_site_log_safety").select("site_log_id").eq("company_id", context.auth.companyId).in("site_log_id", ids) : { data: [], error: null };
  const weatherRows = ids.length ? await (context.auth.supabase as any).from("engineering_daily_site_log_weather").select("site_log_id,condition").eq("company_id", context.auth.companyId).in("site_log_id", ids) : { data: [], error: null };
  if (safetyRows.error || weatherRows.error) throw new AssistantBackendError("TOOL_READ_FAILED", "Daily Site Log filters could not be read safely.", 503);
  const safetyIds = new Set((safetyRows.data || []).map((row: Record<string, unknown>) => String(row.site_log_id)));
  const weatherById = new Map((weatherRows.data || []).map((row: Record<string, unknown>) => [String(row.site_log_id), String(row.condition || "UNKNOWN")]));
  if (args.hasSafety !== undefined) records = records.filter((row) => safetyIds.has(String(row.id)) === args.hasSafety);
  if (args.weatherCondition) records = records.filter((row) => weatherById.get(String(row.id)) === String(args.weatherCondition));
  const output: Record<string, unknown>[] = records.map((row) => ({ ...compactRow(row), weatherCondition: weatherById.get(String(row.id)) || "UNKNOWN", hasSafety: safetyIds.has(String(row.id)) }));
  return { output: { count: output.length, records: output }, references: output.slice(0, 10).map((row) => ({ type: "report" as const, id: String(row.id), label: `${row.report_number}: ${row.site_date}` })) };
}

async function prepareAction(toolName: string, args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  let preview: Record<string, unknown> = { contextGeneration: context.context.generation, ...args };
  if (args.projectId) {
    const project = await queryProject(context, String(args.projectId));
    preview = { ...preview, projectName: project.project_name };
  }
  if (args.siteLogId) {
    const log = await queryOne(context, "engineering_daily_site_logs", String(args.siteLogId));
    if (args.projectId && String(log.project_id) !== String(args.projectId)) throw new AssistantBackendError("NOT_FOUND", "The Daily Site Log is not part of the selected project.", 404);
    preview = { ...preview, reportNumber: log.report_number, siteDate: log.site_date, currentStatus: log.status, projectId: log.project_id };
  }
  if (args.dailySiteLogId) preview = { ...preview, operation: "Create Daily Site Log draft" };
  return context.prepareAction({ toolName, riskTier: "PREPARE", normalizedArgs: args, preview, contextGeneration: context.context.generation });
}

export async function executeDailySiteLogsTool(name: string, args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  if (name === "search_site_logs") return searchSiteLogs(args, context);
  if (name === "get_site_log") return getSiteLog(args, context);
  if (name === "navigate_to_site_log") {
    const log = await queryOne(context, "engineering_daily_site_logs", String(args.siteLogId));
    return { output: { siteLogId: log.id, projectId: log.project_id }, references: [{ type: "report", id: String(log.id), label: `${log.report_number}: ${log.site_date}` }], clientActions: [{ type: "OPEN_SITE_LOG", entityId: String(log.id), projectId: String(log.project_id), label: "Open Site Log" }] };
  }
  if (name.startsWith("prepare_")) return prepareAction(name, args, context);
  throw new AssistantBackendError("UNKNOWN_TOOL", "That Site Log operation is not available.", 400);
}

async function rpc(context: AssistantToolContext, name: string, args: Record<string, unknown>) {
  const result = await (context.auth.supabase as any).rpc(name, { p_company_id: context.auth.companyId, ...args });
  if (result.error) throw new AssistantBackendError("DOMAIN_WRITE_REJECTED", result.error.message || "The Daily Site Log action was rejected.", 409);
  return result.data as Record<string, unknown>;
}

function rpcAggregate(args: Record<string, unknown>) {
  const weather = args.weather as Record<string, unknown> | undefined;
  return {
    p_daily_site_log_id: args.dailySiteLogId || args.siteLogId,
    p_project_id: args.projectId,
    p_site_date: args.siteDate,
    p_report_number: args.reportNumber || null,
    p_work_summary: args.workSummary || "",
    p_progress_notes: args.progressNotes || null,
    p_delays_constraints: args.delaysConstraints || null,
    p_general_notes: args.generalNotes || null,
    p_weather: weather ? { id: weather.id, condition: weather.condition, temperature: weather.temperature ?? null, temperature_unit: weather.temperatureUnit || "C", precipitation_notes: weather.precipitationNotes || null, wind_notes: weather.windNotes || null, humidity: weather.humidity ?? null, site_condition_notes: weather.siteConditionNotes || null } : null,
    p_crew: (Array.isArray(args.crew) ? args.crew : []).map((row: Record<string, unknown>, index: number) => ({ id: row.id, trade: row.trade || null, crew_label: row.crewLabel || null, contractor_label: row.contractorLabel || null, headcount: row.headcount ?? 0, regular_hours: row.regularHours ?? null, overtime_hours: row.overtimeHours ?? null, notes: row.notes || null, sort_order: row.sort_order ?? index })),
    p_equipment: (Array.isArray(args.equipment) ? args.equipment : []).map((row: Record<string, unknown>, index: number) => ({ id: row.id, equipment_name: row.equipmentName, equipment_type: row.equipmentType || null, asset_reference: row.assetReference || null, operating_hours: row.operatingHours ?? null, idle_hours: row.idleHours ?? null, operator_crew_note: row.operatorCrewNote || null, condition_status: row.conditionStatus || null, notes: row.notes || null, sort_order: row.sort_order ?? index })),
    p_safety: (Array.isArray(args.safety) ? args.safety : []).map((row: Record<string, unknown>, index: number) => ({ id: row.id, category: row.category, severity: row.severity || "OBSERVATION", description: row.description, action_taken: row.actionTaken || null, is_resolved: row.isResolved !== false, notes: row.notes || null, sort_order: row.sort_order ?? index })),
  };
}

export async function executePreparedDailySiteLogsAction(context: AssistantToolContext, toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (toolName) {
    case "prepare_create_site_log": return { log: await rpc(context, "create_engineering_daily_site_log", rpcAggregate(args)) };
    case "prepare_update_site_log": return { log: await rpc(context, "update_engineering_daily_site_log_draft", rpcAggregate(args)) };
    case "prepare_submit_site_log": return { log: await rpc(context, "submit_engineering_daily_site_log", { p_daily_site_log_id: args.siteLogId }) };
    case "prepare_finalize_site_log": return { log: await rpc(context, "finalize_engineering_daily_site_log", { p_daily_site_log_id: args.siteLogId }) };
    case "prepare_void_site_log": return { log: await rpc(context, "void_engineering_daily_site_log", { p_daily_site_log_id: args.siteLogId, p_reason: args.reason }) };
    default: throw new AssistantToolError("UNKNOWN_TOOL", "That prepared Site Log operation is no longer available.");
  }
}
