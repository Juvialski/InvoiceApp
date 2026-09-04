import { engineeringId } from "./engineeringDocuments.ts";

export const DAILY_SITE_LOG_STATUSES = ["DRAFT", "SUBMITTED", "FINALIZED", "VOID"] as const;
export type DailySiteLogStatus = (typeof DAILY_SITE_LOG_STATUSES)[number];

export const DAILY_SITE_LOG_WEATHER_CONDITIONS = [
  "CLEAR",
  "PARTLY_CLOUDY",
  "OVERCAST",
  "RAIN",
  "STORM",
  "WINDY",
  "EXTREME_HEAT",
  "OTHER",
  "UNKNOWN",
] as const;
export type DailySiteLogWeatherCondition = (typeof DAILY_SITE_LOG_WEATHER_CONDITIONS)[number];

export const DAILY_SITE_LOG_SAFETY_SEVERITIES = ["OBSERVATION", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type DailySiteLogSafetySeverity = (typeof DAILY_SITE_LOG_SAFETY_SEVERITIES)[number];

export const DAILY_SITE_LOG_ISSUE_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type DailySiteLogIssueSeverity = (typeof DAILY_SITE_LOG_ISSUE_SEVERITIES)[number];
export const DAILY_SITE_LOG_ISSUE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
export type DailySiteLogIssueStatus = (typeof DAILY_SITE_LOG_ISSUE_STATUSES)[number];

export interface EngineeringDailySiteLog {
  id: string;
  companyId?: string;
  projectId: string;
  siteDate: string;
  reportNumber: string;
  status: DailySiteLogStatus;
  preparedByUserId?: string;
  submittedByUserId?: string;
  finalizedByUserId?: string;
  voidedByUserId?: string;
  workSummary: string;
  progressNotes?: string;
  delaysConstraints?: string;
  generalNotes?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  finalizedAt?: string;
  voidedAt?: string;
  voidReason?: string;
}

export interface EngineeringDailySiteLogWeather {
  id: string;
  companyId?: string;
  siteLogId: string;
  condition: DailySiteLogWeatherCondition;
  temperature?: number;
  temperatureUnit: "C" | "F";
  precipitationNotes?: string;
  windNotes?: string;
  humidity?: number;
  siteConditionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EngineeringDailySiteLogCrew {
  id: string;
  companyId?: string;
  siteLogId: string;
  trade?: string;
  crewLabel?: string;
  contractorLabel?: string;
  projectCostCodeId?: string | null;
  headcount: number;
  regularHours?: number;
  overtimeHours?: number;
  notes?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface EngineeringDailySiteLogEquipment {
  id: string;
  companyId?: string;
  siteLogId: string;
  equipmentId?: string | null;
  equipmentName: string;
  equipmentType?: string;
  assetReference?: string;
  operatingHours?: number;
  idleHours?: number;
  operatorCrewNote?: string;
  conditionStatus?: string;
  notes?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface EngineeringDailySiteLogWork {
  id: string;
  companyId?: string;
  siteLogId: string;
  projectId: string;
  description: string;
  projectCostCodeId?: string | null;
  quantity?: number;
  unit?: string;
  workLocation?: string;
  notes?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface EngineeringDailySiteLogMaterialDelivery {
  id: string;
  companyId?: string;
  siteLogId: string;
  projectId: string;
  materialId?: string | null;
  materialNameSnapshot: string;
  quantityObserved: number;
  unitSnapshot: string;
  supplierDeliveryReference?: string | null;
  purchaseOrderId?: string | null;
  purchaseOrderLineId?: string | null;
  purchaseOrderReceiptId?: string | null;
  deliveryCondition?: string | null;
  location?: string | null;
  projectCostCodeId?: string | null;
  notes?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface EngineeringDailySiteLogIssue {
  id: string;
  companyId?: string;
  siteLogId: string;
  projectId: string;
  category: string;
  description: string;
  severity: DailySiteLogIssueSeverity;
  status: DailySiteLogIssueStatus;
  mitigation?: string;
  responsibleParty?: string;
  projectCostCodeId?: string | null;
  resolvedAt?: string;
  notes?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface EngineeringDailySiteLogSafety {
  id: string;
  companyId?: string;
  siteLogId: string;
  category: string;
  severity: DailySiteLogSafetySeverity;
  description: string;
  actionTaken?: string;
  isResolved: boolean;
  notes?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type DailySiteLogEventType = "CREATED" | "UPDATED" | "SUBMITTED" | "FINALIZED" | "VOIDED";

export interface EngineeringDailySiteLogEvent {
  id: string;
  companyId?: string;
  siteLogId: string;
  eventType: DailySiteLogEventType;
  fromStatus?: DailySiteLogStatus;
  toStatus: DailySiteLogStatus;
  actorUserId?: string;
  reason?: string;
  createdAt: string;
}

export interface EngineeringDailySiteLogAddendum {
  id: string;
  companyId?: string;
  siteLogId: string;
  addendumNumber: number;
  reason: string;
  correctionText: string;
  createdByUserId?: string;
  createdAt: string;
}

export interface EngineeringDailySiteLogAggregate {
  log: EngineeringDailySiteLog;
  weather?: EngineeringDailySiteLogWeather;
  crew: EngineeringDailySiteLogCrew[];
  equipment: EngineeringDailySiteLogEquipment[];
  work: EngineeringDailySiteLogWork[];
  materialDeliveries: EngineeringDailySiteLogMaterialDelivery[];
  issues: EngineeringDailySiteLogIssue[];
  safety: EngineeringDailySiteLogSafety[];
  events: EngineeringDailySiteLogEvent[];
}

export interface EngineeringDailySiteLogsWorkspaceData {
  logs: EngineeringDailySiteLog[];
  weather: EngineeringDailySiteLogWeather[];
  crew: EngineeringDailySiteLogCrew[];
  equipment: EngineeringDailySiteLogEquipment[];
  work: EngineeringDailySiteLogWork[];
  materialDeliveries: EngineeringDailySiteLogMaterialDelivery[];
  issues: EngineeringDailySiteLogIssue[];
  safety: EngineeringDailySiteLogSafety[];
  events: EngineeringDailySiteLogEvent[];
  addenda: EngineeringDailySiteLogAddendum[];
}

export interface DailySiteLogWeatherInput {
  condition?: DailySiteLogWeatherCondition;
  temperature?: number;
  temperatureUnit?: "C" | "F";
  precipitationNotes?: string;
  windNotes?: string;
  humidity?: number;
  siteConditionNotes?: string;
}

export interface DailySiteLogCrewInput {
  id?: string;
  trade?: string;
  crewLabel?: string;
  contractorLabel?: string;
  projectCostCodeId?: string | null;
  headcount: number;
  regularHours?: number;
  overtimeHours?: number;
  notes?: string;
  sortOrder?: number;
}

export interface DailySiteLogEquipmentInput {
  id?: string;
  equipmentId?: string | null;
  equipmentName: string;
  equipmentType?: string;
  assetReference?: string;
  operatingHours?: number;
  idleHours?: number;
  operatorCrewNote?: string;
  conditionStatus?: string;
  notes?: string;
  sortOrder?: number;
}

export interface DailySiteLogWorkInput {
  id?: string;
  description: string;
  projectCostCodeId?: string | null;
  quantity?: number;
  unit?: string;
  workLocation?: string;
  notes?: string;
  sortOrder?: number;
}

export interface DailySiteLogMaterialDeliveryInput {
  id?: string;
  materialId?: string | null;
  materialNameSnapshot: string;
  quantityObserved: number;
  unitSnapshot: string;
  supplierDeliveryReference?: string | null;
  purchaseOrderId?: string | null;
  purchaseOrderLineId?: string | null;
  purchaseOrderReceiptId?: string | null;
  deliveryCondition?: string | null;
  location?: string | null;
  projectCostCodeId?: string | null;
  notes?: string | null;
  sortOrder?: number;
}

export interface DailySiteLogIssueInput {
  id?: string;
  category: string;
  description: string;
  severity: DailySiteLogIssueSeverity;
  status?: DailySiteLogIssueStatus;
  mitigation?: string;
  responsibleParty?: string;
  projectCostCodeId?: string | null;
  resolvedAt?: string;
  notes?: string;
  sortOrder?: number;
}

export interface DailySiteLogSafetyInput {
  id?: string;
  category: string;
  severity: DailySiteLogSafetySeverity;
  description: string;
  actionTaken?: string;
  isResolved?: boolean;
  notes?: string;
  sortOrder?: number;
}

export interface CreateDailySiteLogInput {
  id?: string;
  companyId?: string;
  projectId: string;
  siteDate: string;
  reportNumber?: string;
  preparedByUserId?: string;
  workSummary?: string;
  progressNotes?: string;
  delaysConstraints?: string;
  generalNotes?: string;
  weather?: DailySiteLogWeatherInput;
  crew?: DailySiteLogCrewInput[];
  equipment?: DailySiteLogEquipmentInput[];
  work?: DailySiteLogWorkInput[];
  materialDeliveries?: DailySiteLogMaterialDeliveryInput[];
  issues?: DailySiteLogIssueInput[];
  safety?: DailySiteLogSafetyInput[];
  now?: Date;
}

export const DAILY_LOG_TRANSITIONS: Readonly<Record<DailySiteLogStatus, readonly DailySiteLogStatus[]>> = Object.freeze({
  DRAFT: ["SUBMITTED", "VOID"],
  SUBMITTED: ["FINALIZED", "VOID"],
  FINALIZED: [],
  VOID: [],
});

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function normalizedText(value: unknown, label: string, max: number, required = false): string | undefined {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${label} is required.`);
    return undefined;
  }
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const result = value.trim();
  if (required && !result) throw new Error(`${label} is required.`);
  if (result.length > max) throw new Error(`${label} is too long.`);
  return result || undefined;
}

function normalizedNumber(value: unknown, label: string, options: { min?: number; max?: number; integer?: boolean } = {}): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${label} must be a finite number.`);
  if (options.integer && !Number.isInteger(result)) throw new Error(`${label} must be a whole number.`);
  if (options.min !== undefined && result < options.min) throw new Error(`${label} cannot be below ${options.min}.`);
  if (options.max !== undefined && result > options.max) throw new Error(`${label} cannot exceed ${options.max}.`);
  return result;
}

export function isDailySiteLogDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function reportNumberForSiteDate(siteDate: string): string {
  if (!isDailySiteLogDate(siteDate)) throw new Error("Site date must use a valid YYYY-MM-DD date.");
  return `DSL-${siteDate.replaceAll("-", "")}`;
}

export function canTransitionDailySiteLog(from: DailySiteLogStatus, to: DailySiteLogStatus): boolean {
  return DAILY_LOG_TRANSITIONS[from].includes(to);
}

export function emptyDailySiteLogsWorkspaceData(): EngineeringDailySiteLogsWorkspaceData {
  return { logs: [], weather: [], crew: [], equipment: [], work: [], materialDeliveries: [], issues: [], safety: [], events: [], addenda: [] };
}

/**
 * Returns one project's Site Log snapshot and its children. Callers may load a
 * company-wide snapshot for refresh efficiency, but project surfaces must only
 * receive the selected project's records.
 */
export function scopeDailySiteLogsToProject(
  data: EngineeringDailySiteLogsWorkspaceData,
  projectId: string,
): EngineeringDailySiteLogsWorkspaceData {
  const logs = data.logs.filter((log) => log.projectId === projectId);
  const logIds = new Set(logs.map((log) => log.id));
  const byLog = <T extends { siteLogId: string }>(rows: readonly T[]) => rows.filter((row) => logIds.has(row.siteLogId));
  return {
    logs,
    weather: byLog(data.weather),
    crew: byLog(data.crew),
    equipment: byLog(data.equipment),
    work: byLog(data.work || []),
    materialDeliveries: byLog(data.materialDeliveries || []),
    issues: byLog(data.issues || []),
    safety: byLog(data.safety),
    events: byLog(data.events),
    addenda: byLog(data.addenda || []),
  };
}

/**
 * Merges a project-scoped refresh back into a company-wide snapshot without
 * allowing one project's load or mutation to discard other project history.
 */
export function mergeDailySiteLogsWorkspaceData(
  current: EngineeringDailySiteLogsWorkspaceData | undefined,
  projectId: string,
  nextProjectData: EngineeringDailySiteLogsWorkspaceData,
): EngineeringDailySiteLogsWorkspaceData {
  const base = current || emptyDailySiteLogsWorkspaceData();
  const scoped = scopeDailySiteLogsToProject(nextProjectData, projectId);
  const projectLogIds = new Set(base.logs.filter((log) => log.projectId === projectId).map((log) => log.id));
  const withoutProjectLogs = <T extends { siteLogId: string }>(rows: readonly T[]) => rows.filter((row) => !projectLogIds.has(row.siteLogId));
  return {
    logs: [...base.logs.filter((log) => log.projectId !== projectId), ...scoped.logs],
    weather: [...withoutProjectLogs(base.weather), ...scoped.weather],
    crew: [...withoutProjectLogs(base.crew), ...scoped.crew],
    equipment: [...withoutProjectLogs(base.equipment), ...scoped.equipment],
    work: [...withoutProjectLogs(base.work || []), ...scoped.work],
    materialDeliveries: [...withoutProjectLogs(base.materialDeliveries || []), ...scoped.materialDeliveries],
    issues: [...withoutProjectLogs(base.issues || []), ...scoped.issues],
    safety: [...withoutProjectLogs(base.safety), ...scoped.safety],
    events: [...withoutProjectLogs(base.events), ...scoped.events],
    addenda: [...withoutProjectLogs(base.addenda || []), ...scoped.addenda],
  };
}

function normalizeWeather(input: DailySiteLogWeatherInput | undefined, siteLogId: string, companyId: string | undefined, timestamp: string): EngineeringDailySiteLogWeather {
  const condition = input?.condition || "UNKNOWN";
  if (!DAILY_SITE_LOG_WEATHER_CONDITIONS.includes(condition)) throw new Error("Weather condition is not supported.");
  const temperatureUnit = input?.temperatureUnit || "C";
  if (temperatureUnit !== "C" && temperatureUnit !== "F") throw new Error("Temperature unit is not supported.");
  return {
    id: engineeringId("daily-site-log-weather"),
    companyId,
    siteLogId,
    condition,
    temperature: normalizedNumber(input?.temperature, "Temperature", { min: -100, max: 100 }),
    temperatureUnit,
    precipitationNotes: normalizedText(input?.precipitationNotes, "Precipitation notes", 1000),
    windNotes: normalizedText(input?.windNotes, "Wind notes", 1000),
    humidity: normalizedNumber(input?.humidity, "Humidity", { min: 0, max: 100 }),
    siteConditionNotes: normalizedText(input?.siteConditionNotes, "Site condition notes", 2000),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeCrew(input: DailySiteLogCrewInput, siteLogId: string, companyId: string | undefined, timestamp: string, index: number): EngineeringDailySiteLogCrew {
  const trade = normalizedText(input.trade, "Crew trade", 120);
  const crewLabel = normalizedText(input.crewLabel, "Crew label", 160);
  const contractorLabel = normalizedText(input.contractorLabel, "Contractor label", 160);
  if (!trade && !crewLabel && !contractorLabel) throw new Error(`Crew row ${index + 1} needs a trade, crew, or contractor label.`);
  return {
    id: input.id || engineeringId("daily-site-log-crew"),
    companyId,
    siteLogId,
    trade,
    crewLabel,
    contractorLabel,
    projectCostCodeId: input.projectCostCodeId || null,
    headcount: normalizedNumber(input.headcount, `Crew row ${index + 1} headcount`, { min: 0, max: 100000, integer: true }) ?? 0,
    regularHours: normalizedNumber(input.regularHours, `Crew row ${index + 1} regular hours`, { min: 0, max: 24 }),
    overtimeHours: normalizedNumber(input.overtimeHours, `Crew row ${index + 1} overtime hours`, { min: 0, max: 24 }),
    notes: normalizedText(input.notes, `Crew row ${index + 1} notes`, 1000),
    sortOrder: input.sortOrder ?? index,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeEquipment(input: DailySiteLogEquipmentInput, siteLogId: string, companyId: string | undefined, timestamp: string, index: number): EngineeringDailySiteLogEquipment {
  return {
    id: input.id || engineeringId("daily-site-log-equipment"),
    companyId,
    siteLogId,
    equipmentId: input.equipmentId || null,
    equipmentName: normalizedText(input.equipmentName, `Equipment row ${index + 1} name`, 180, true)!,
    equipmentType: normalizedText(input.equipmentType, `Equipment row ${index + 1} type`, 120),
    assetReference: normalizedText(input.assetReference, `Equipment row ${index + 1} asset reference`, 120),
    operatingHours: normalizedNumber(input.operatingHours, `Equipment row ${index + 1} operating hours`, { min: 0, max: 24 }),
    idleHours: normalizedNumber(input.idleHours, `Equipment row ${index + 1} idle hours`, { min: 0, max: 24 }),
    operatorCrewNote: normalizedText(input.operatorCrewNote, `Equipment row ${index + 1} operator note`, 500),
    conditionStatus: normalizedText(input.conditionStatus, `Equipment row ${index + 1} condition`, 120),
    notes: normalizedText(input.notes, `Equipment row ${index + 1} notes`, 1000),
    sortOrder: input.sortOrder ?? index,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeWork(input: DailySiteLogWorkInput, siteLogId: string, projectId: string, companyId: string | undefined, timestamp: string, index: number): EngineeringDailySiteLogWork {
  return {
    id: input.id || engineeringId("daily-site-log-work"),
    companyId,
    siteLogId,
    projectId,
    description: normalizedText(input.description, `Work row ${index + 1} description`, 2000, true)!,
    projectCostCodeId: input.projectCostCodeId || null,
    quantity: normalizedNumber(input.quantity, `Work row ${index + 1} quantity`, { min: 0, max: 100000000 }),
    unit: normalizedText(input.unit, `Work row ${index + 1} unit`, 50),
    workLocation: normalizedText(input.workLocation, `Work row ${index + 1} location`, 180),
    notes: normalizedText(input.notes, `Work row ${index + 1} notes`, 2000),
    sortOrder: input.sortOrder ?? index,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeMaterialDelivery(input: DailySiteLogMaterialDeliveryInput, siteLogId: string, projectId: string, companyId: string | undefined, timestamp: string, index: number): EngineeringDailySiteLogMaterialDelivery {
  const quantityObserved = normalizedNumber(input.quantityObserved, `Material delivery row ${index + 1} quantity`, { min: 0.0001, max: 100000000 });
  if (quantityObserved === undefined) throw new Error(`Material delivery row ${index + 1} quantity is required.`);
  return {
    id: input.id || engineeringId("daily-site-log-material-delivery"),
    companyId,
    siteLogId,
    projectId,
    materialId: input.materialId || null,
    materialNameSnapshot: normalizedText(input.materialNameSnapshot, `Material delivery row ${index + 1} material`, 200, true)!,
    quantityObserved,
    unitSnapshot: normalizedText(input.unitSnapshot, `Material delivery row ${index + 1} unit`, 50, true)!,
    supplierDeliveryReference: normalizedText(input.supplierDeliveryReference, `Material delivery row ${index + 1} supplier reference`, 120) || null,
    purchaseOrderId: input.purchaseOrderId || null,
    purchaseOrderLineId: input.purchaseOrderLineId || null,
    purchaseOrderReceiptId: input.purchaseOrderReceiptId || null,
    deliveryCondition: normalizedText(input.deliveryCondition, `Material delivery row ${index + 1} condition`, 120) || null,
    location: normalizedText(input.location, `Material delivery row ${index + 1} location`, 180) || null,
    projectCostCodeId: input.projectCostCodeId || null,
    notes: normalizedText(input.notes, `Material delivery row ${index + 1} notes`, 2000) || null,
    sortOrder: input.sortOrder ?? index,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeIssue(input: DailySiteLogIssueInput, siteLogId: string, projectId: string, companyId: string | undefined, timestamp: string, index: number): EngineeringDailySiteLogIssue {
  if (!DAILY_SITE_LOG_ISSUE_SEVERITIES.includes(input.severity)) throw new Error(`Issue row ${index + 1} severity is not supported.`);
  const issueStatus = input.status || "OPEN";
  if (!DAILY_SITE_LOG_ISSUE_STATUSES.includes(issueStatus)) throw new Error(`Issue row ${index + 1} status is not supported.`);
  const resolvedAt = input.resolvedAt ? normalizedText(input.resolvedAt, `Issue row ${index + 1} resolved date`, 10) : undefined;
  if (resolvedAt && !isDailySiteLogDate(resolvedAt)) throw new Error(`Issue row ${index + 1} resolved date must use YYYY-MM-DD.`);
  return {
    id: input.id || engineeringId("daily-site-log-issue"),
    companyId,
    siteLogId,
    projectId,
    category: normalizedText(input.category, `Issue row ${index + 1} category`, 80, true)!,
    description: normalizedText(input.description, `Issue row ${index + 1} description`, 2000, true)!,
    severity: input.severity,
    status: issueStatus,
    mitigation: normalizedText(input.mitigation, `Issue row ${index + 1} mitigation`, 2000),
    responsibleParty: normalizedText(input.responsibleParty, `Issue row ${index + 1} responsible party`, 180),
    projectCostCodeId: input.projectCostCodeId || null,
    resolvedAt,
    notes: normalizedText(input.notes, `Issue row ${index + 1} notes`, 2000),
    sortOrder: input.sortOrder ?? index,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeSafety(input: DailySiteLogSafetyInput, siteLogId: string, companyId: string | undefined, timestamp: string, index: number): EngineeringDailySiteLogSafety {
  if (!DAILY_SITE_LOG_SAFETY_SEVERITIES.includes(input.severity)) throw new Error(`Safety row ${index + 1} severity is not supported.`);
  return {
    id: input.id || engineeringId("daily-site-log-safety"),
    companyId,
    siteLogId,
    category: normalizedText(input.category, `Safety row ${index + 1} category`, 120, true)!,
    severity: input.severity || "OBSERVATION",
    description: normalizedText(input.description, `Safety row ${index + 1} description`, 4000, true)!,
    actionTaken: normalizedText(input.actionTaken, `Safety row ${index + 1} action`, 2000),
    isResolved: input.isResolved !== false,
    notes: normalizedText(input.notes, `Safety row ${index + 1} notes`, 1000),
    sortOrder: input.sortOrder ?? index,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createDraftDailySiteLog(input: CreateDailySiteLogInput): EngineeringDailySiteLogAggregate {
  if (!isDailySiteLogDate(input.siteDate)) throw new Error("Site date must use a valid YYYY-MM-DD date.");
  const projectId = normalizedText(input.projectId, "Project", 120, true)!;
  const timestamp = nowIso(input.now);
  const log: EngineeringDailySiteLog = {
    id: input.id || engineeringId("daily-site-log"),
    companyId: input.companyId,
    projectId,
    siteDate: input.siteDate,
    reportNumber: normalizedText(input.reportNumber, "Report number", 100) || reportNumberForSiteDate(input.siteDate),
    status: "DRAFT",
    preparedByUserId: input.preparedByUserId,
    workSummary: normalizedText(input.workSummary, "Work summary", 8000) || "",
    progressNotes: normalizedText(input.progressNotes, "Progress notes", 8000),
    delaysConstraints: normalizedText(input.delaysConstraints, "Delays and constraints", 8000),
    generalNotes: normalizedText(input.generalNotes, "General notes", 8000),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const weather = normalizeWeather(input.weather, log.id, input.companyId, timestamp);
  return {
    log,
    weather,
    crew: (input.crew || []).map((row, index) => normalizeCrew(row, log.id, input.companyId, timestamp, index)),
    equipment: (input.equipment || []).map((row, index) => normalizeEquipment(row, log.id, input.companyId, timestamp, index)),
    work: (input.work || []).map((row, index) => normalizeWork(row, log.id, projectId, input.companyId, timestamp, index)),
    materialDeliveries: (input.materialDeliveries || []).map((row, index) => normalizeMaterialDelivery(row, log.id, projectId, input.companyId, timestamp, index)),
    issues: (input.issues || []).map((row, index) => normalizeIssue(row, log.id, projectId, input.companyId, timestamp, index)),
    safety: (input.safety || []).map((row, index) => normalizeSafety(row, log.id, input.companyId, timestamp, index)),
    events: [{
      id: engineeringId("daily-site-log-event"),
      companyId: input.companyId,
      siteLogId: log.id,
      eventType: "CREATED",
      toStatus: "DRAFT",
      actorUserId: input.preparedByUserId,
      createdAt: timestamp,
    }],
  };
}

export function validateDailySiteLogAggregate(aggregate: Pick<EngineeringDailySiteLogAggregate, "log" | "weather" | "crew" | "equipment" | "work" | "materialDeliveries" | "issues" | "safety">): void {
  if (!isDailySiteLogDate(aggregate.log.siteDate)) throw new Error("Site date must use a valid YYYY-MM-DD date.");
  if (!aggregate.log.projectId.trim()) throw new Error("Project is required.");
  if (!aggregate.log.workSummary.trim()) throw new Error("Work summary is required before submission.");
  if (!aggregate.weather?.condition) throw new Error("Weather condition is required before submission.");
  if (!aggregate.crew.length) throw new Error("Add at least one crew/headcount observation before submission.");
  aggregate.crew.forEach((row, index) => normalizeCrew(row, aggregate.log.id, aggregate.log.companyId, aggregate.log.updatedAt, index));
  aggregate.equipment.forEach((row, index) => normalizeEquipment(row, aggregate.log.id, aggregate.log.companyId, aggregate.log.updatedAt, index));
  aggregate.work.forEach((row, index) => normalizeWork(row, aggregate.log.id, aggregate.log.projectId, aggregate.log.companyId, aggregate.log.updatedAt, index));
  aggregate.materialDeliveries.forEach((row, index) => normalizeMaterialDelivery(row, aggregate.log.id, aggregate.log.projectId, aggregate.log.companyId, aggregate.log.updatedAt, index));
  aggregate.issues.forEach((row, index) => normalizeIssue(row, aggregate.log.id, aggregate.log.projectId, aggregate.log.companyId, aggregate.log.updatedAt, index));
  aggregate.safety.forEach((row, index) => normalizeSafety(row, aggregate.log.id, aggregate.log.companyId, aggregate.log.updatedAt, index));
}

export function transitionDailySiteLog(log: EngineeringDailySiteLog, target: DailySiteLogStatus, options: { actorUserId?: string; reason?: string; now?: Date } = {}): EngineeringDailySiteLog {
  if (!canTransitionDailySiteLog(log.status, target)) throw new Error(`Daily site log cannot transition from ${log.status} to ${target}.`);
  const timestamp = nowIso(options.now);
  const next: EngineeringDailySiteLog = { ...log, status: target, updatedAt: timestamp };
  if (target === "SUBMITTED") {
    next.submittedAt = timestamp;
    next.submittedByUserId = options.actorUserId;
  }
  if (target === "FINALIZED") {
    next.finalizedAt = timestamp;
    next.finalizedByUserId = options.actorUserId;
  }
  if (target === "VOID") {
    const reason = normalizedText(options.reason, "Void reason", 1000, true)!;
    next.voidedAt = timestamp;
    next.voidedByUserId = options.actorUserId;
    next.voidReason = reason;
  }
  return next;
}

export function eventForDailySiteLogTransition(log: EngineeringDailySiteLog, next: EngineeringDailySiteLog, options: { actorUserId?: string; reason?: string; now?: Date } = {}): EngineeringDailySiteLogEvent {
  const eventType: DailySiteLogEventType = next.status === "SUBMITTED" ? "SUBMITTED" : next.status === "FINALIZED" ? "FINALIZED" : next.status === "VOID" ? "VOIDED" : "UPDATED";
  return {
    id: engineeringId("daily-site-log-event"),
    companyId: log.companyId,
    siteLogId: log.id,
    eventType,
    fromStatus: log.status,
    toStatus: next.status,
    actorUserId: options.actorUserId,
    reason: options.reason?.trim() || undefined,
    createdAt: next.updatedAt,
  };
}

export function aggregateForDailySiteLog(data: EngineeringDailySiteLogsWorkspaceData, logId: string): EngineeringDailySiteLogAggregate | null {
  const log = data.logs.find((item) => item.id === logId);
  if (!log) return null;
  return {
    log,
    weather: data.weather.find((item) => item.siteLogId === logId),
    crew: data.crew.filter((item) => item.siteLogId === logId).sort((a, b) => a.sortOrder - b.sortOrder),
    equipment: data.equipment.filter((item) => item.siteLogId === logId).sort((a, b) => a.sortOrder - b.sortOrder),
    work: (data.work || []).filter((item) => item.siteLogId === logId).sort((a, b) => a.sortOrder - b.sortOrder),
    materialDeliveries: (data.materialDeliveries || []).filter((item) => item.siteLogId === logId).sort((a, b) => a.sortOrder - b.sortOrder),
    issues: (data.issues || []).filter((item) => item.siteLogId === logId).sort((a, b) => a.sortOrder - b.sortOrder),
    safety: data.safety.filter((item) => item.siteLogId === logId).sort((a, b) => a.sortOrder - b.sortOrder),
    events: data.events.filter((item) => item.siteLogId === logId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export function replaceDailySiteLogAggregate(data: EngineeringDailySiteLogsWorkspaceData, aggregate: EngineeringDailySiteLogAggregate): EngineeringDailySiteLogsWorkspaceData {
  const replace = <T extends { id: string }>(rows: T[], value: T) => rows.some((row) => row.id === value.id) ? rows.map((row) => row.id === value.id ? value : row) : [value, ...rows];
  const withoutLog = <T extends { siteLogId: string }>(rows: T[]) => rows.filter((row) => row.siteLogId !== aggregate.log.id);
  let next = { ...data, logs: replace(data.logs, aggregate.log), weather: [...withoutLog(data.weather), ...(aggregate.weather ? [aggregate.weather] : [])], crew: [...withoutLog(data.crew), ...aggregate.crew], equipment: [...withoutLog(data.equipment), ...aggregate.equipment], work: [...withoutLog(data.work || []), ...aggregate.work], materialDeliveries: [...withoutLog(data.materialDeliveries || []), ...aggregate.materialDeliveries], issues: [...withoutLog(data.issues || []), ...aggregate.issues], safety: [...withoutLog(data.safety), ...aggregate.safety] };
  const existingEvents = new Set(data.events.filter((event) => event.siteLogId === aggregate.log.id).map((event) => event.id));
  next = { ...next, events: [...data.events, ...aggregate.events.filter((event) => !existingEvents.has(event.id))] };
  return next;
}
