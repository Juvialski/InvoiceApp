export type DailySiteLogStatus = "DRAFT" | "SUBMITTED" | "REVIEWED" | "VOID";
export type DailySiteShift = "DAY" | "NIGHT" | "SWING" | "CUSTOM";
export type DailySiteWeatherImpact = "NONE" | "LOW" | "MODERATE" | "HIGH" | "STOPPAGE";
export type DailySiteWeatherSource = "MANUAL" | "PROVIDER";
export type DailySiteEquipmentStatus = "OPERATING" | "IDLE" | "DOWN" | "MAINTENANCE";
export type DailySiteEventType = "WORK" | "DELIVERY" | "VISITOR" | "DELAY" | "SAFETY" | "QUALITY";
export type DailySiteEventSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DailySiteLog {
  id: string;
  companyId?: string;
  projectId: string;
  logDate: string;
  shiftCode: DailySiteShift;
  shiftLabel?: string;
  sequenceNo: number;
  status: DailySiteLogStatus;
  workSummary: string;
  delaySummary?: string;
  safetySummary?: string;
  qualitySummary?: string;
  deliveriesVisitors?: string;
  generalNotes?: string;
  preparedByUserId?: string;
  submittedByUserId?: string;
  reviewedByUserId?: string;
  preparedAt: string;
  submittedAt?: string;
  reviewedAt?: string;
  voidedAt?: string;
  voidReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailySiteWeatherSnapshot {
  id: string;
  companyId?: string;
  dailyLogId: string;
  condition: string;
  temperatureC?: number;
  precipitationMm?: number;
  windKph?: number;
  humidityPercent?: number;
  workImpact: DailySiteWeatherImpact;
  source: DailySiteWeatherSource;
  observedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailySiteCrewEntry {
  id: string;
  companyId?: string;
  dailyLogId: string;
  crewLabel: string;
  trade?: string;
  plannedCount: number;
  actualCount: number;
  regularHours: number;
  overtimeHours: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailySiteEquipmentEntry {
  id: string;
  companyId?: string;
  dailyLogId: string;
  equipmentLabel: string;
  equipmentReference?: string;
  quantity: number;
  operatingHours: number;
  idleHours: number;
  status: DailySiteEquipmentStatus;
  operatorNote?: string;
  issueNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailySiteEvent {
  id: string;
  companyId?: string;
  dailyLogId: string;
  eventType: DailySiteEventType;
  occurredAt?: string;
  title: string;
  description: string;
  severity: DailySiteEventSeverity;
  workStoppage: boolean;
  location?: string;
  immediateAction?: string;
  createdAt: string;
}

export interface DailySiteLogAmendment {
  id: string;
  companyId?: string;
  dailyLogId: string;
  amendmentText: string;
  createdByUserId?: string;
  createdAt: string;
}

export interface DailySiteLogAttachment {
  id: string;
  companyId?: string;
  dailyLogId: string;
  storagePath: string;
  fileName: string;
  mimeType?: string;
  fileSizeBytes?: number;
  caption?: string;
  capturedAt?: string;
  uploadedByUserId?: string;
  createdAt: string;
}

export interface DailySiteLogsWorkspaceData {
  logs: DailySiteLog[];
  weather: DailySiteWeatherSnapshot[];
  crews: DailySiteCrewEntry[];
  equipment: DailySiteEquipmentEntry[];
  events: DailySiteEvent[];
  amendments: DailySiteLogAmendment[];
  attachments: DailySiteLogAttachment[];
}

export interface DailySiteLogDraftSections {
  workSummary: string;
  delaySummary?: string;
  safetySummary?: string;
  qualitySummary?: string;
  deliveriesVisitors?: string;
  generalNotes?: string;
  weather?: Omit<DailySiteWeatherSnapshot, "id" | "dailyLogId" | "companyId" | "createdAt" | "updatedAt">;
  crews?: Array<Omit<DailySiteCrewEntry, "dailyLogId" | "companyId" | "createdAt" | "updatedAt">>;
  equipment?: Array<Omit<DailySiteEquipmentEntry, "dailyLogId" | "companyId" | "createdAt" | "updatedAt">>;
  events?: Array<Omit<DailySiteEvent, "dailyLogId" | "companyId" | "createdAt">>;
}

export function emptyDailySiteLogsWorkspaceData(): DailySiteLogsWorkspaceData {
  return { logs: [], weather: [], crews: [], equipment: [], events: [], amendments: [], attachments: [] };
}

export function dailySiteLogId(prefix = "daily-log"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function boundedText(value: string | undefined, max: number, required = false): string | undefined {
  const normalized = value?.trim();
  if (required && !normalized) throw new Error("A required daily log field is missing.");
  if (!normalized) return undefined;
  if (normalized.length > max) throw new Error(`Daily log text must be ${max} characters or fewer.`);
  return normalized;
}

function nonNegative(value: number | undefined, fallback = 0): number {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < 0) throw new Error("Daily log numeric values must be non-negative numbers.");
  return number;
}

function isoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Daily log date must use YYYY-MM-DD format.");
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) throw new Error("Daily log date is invalid.");
  return value;
}

export function createDraftDailySiteLog(input: {
  id?: string;
  companyId?: string;
  projectId: string;
  logDate: string;
  shiftCode?: DailySiteShift;
  shiftLabel?: string;
  sequenceNo?: number;
  sections: DailySiteLogDraftSections;
  now?: string;
}): { data: DailySiteLogsWorkspaceData; log: DailySiteLog } {
  const now = input.now || new Date().toISOString();
  const id = input.id || dailySiteLogId();
  const shiftCode = input.shiftCode || "DAY";
  const sequenceNo = Math.max(1, Math.floor(nonNegative(input.sequenceNo, 1)));
  const log: DailySiteLog = {
    id,
    companyId: input.companyId,
    projectId: input.projectId,
    logDate: isoDate(input.logDate),
    shiftCode,
    shiftLabel: boundedText(input.shiftLabel, 80),
    sequenceNo,
    status: "DRAFT",
    workSummary: boundedText(input.sections.workSummary, 12000, true)!,
    delaySummary: boundedText(input.sections.delaySummary, 8000),
    safetySummary: boundedText(input.sections.safetySummary, 8000),
    qualitySummary: boundedText(input.sections.qualitySummary, 8000),
    deliveriesVisitors: boundedText(input.sections.deliveriesVisitors, 8000),
    generalNotes: boundedText(input.sections.generalNotes, 12000),
    preparedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  return { log, data: buildSections(log, input.sections, now) };
}

export function updateDraftDailySiteLog(
  current: DailySiteLogsWorkspaceData,
  log: DailySiteLog,
  sections: DailySiteLogDraftSections,
  options?: { logDate?: string; shiftCode?: DailySiteShift; shiftLabel?: string; sequenceNo?: number; now?: string },
): DailySiteLogsWorkspaceData {
  if (log.status !== "DRAFT") throw new Error("Submitted daily logs are immutable. Add an amendment instead.");
  const now = options?.now || new Date().toISOString();
  const updated: DailySiteLog = {
    ...log,
    logDate: options?.logDate ? isoDate(options.logDate) : log.logDate,
    shiftCode: options?.shiftCode || log.shiftCode,
    shiftLabel: options?.shiftLabel === undefined ? log.shiftLabel : boundedText(options.shiftLabel, 80),
    sequenceNo: options?.sequenceNo === undefined ? log.sequenceNo : Math.max(1, Math.floor(nonNegative(options.sequenceNo, 1))),
    workSummary: boundedText(sections.workSummary, 12000, true)!,
    delaySummary: boundedText(sections.delaySummary, 8000),
    safetySummary: boundedText(sections.safetySummary, 8000),
    qualitySummary: boundedText(sections.qualitySummary, 8000),
    deliveriesVisitors: boundedText(sections.deliveriesVisitors, 8000),
    generalNotes: boundedText(sections.generalNotes, 12000),
    updatedAt: now,
  };
  const retained = withoutLogSections(current, log.id);
  const rebuilt = buildSections(updated, sections, now);
  return {
    ...retained,
    logs: current.logs.map((item) => item.id === log.id ? updated : item),
    weather: [...retained.weather, ...rebuilt.weather],
    crews: [...retained.crews, ...rebuilt.crews],
    equipment: [...retained.equipment, ...rebuilt.equipment],
    events: [...retained.events, ...rebuilt.events],
  };
}

function buildSections(log: DailySiteLog, sections: DailySiteLogDraftSections, now: string): DailySiteLogsWorkspaceData {
  const weather = sections.weather ? [{
    ...sections.weather,
    id: dailySiteLogId("weather"),
    companyId: log.companyId,
    dailyLogId: log.id,
    condition: boundedText(sections.weather.condition, 160, true)!,
    temperatureC: sections.weather.temperatureC === undefined ? undefined : Number(sections.weather.temperatureC),
    precipitationMm: sections.weather.precipitationMm === undefined ? undefined : nonNegative(sections.weather.precipitationMm),
    windKph: sections.weather.windKph === undefined ? undefined : nonNegative(sections.weather.windKph),
    humidityPercent: sections.weather.humidityPercent === undefined ? undefined : Math.min(100, nonNegative(sections.weather.humidityPercent)),
    notes: boundedText(sections.weather.notes, 2000),
    createdAt: now,
    updatedAt: now,
  }] : [];
  const crews = (sections.crews || []).map((entry) => ({
    ...entry,
    id: entry.id || dailySiteLogId("crew"),
    companyId: log.companyId,
    dailyLogId: log.id,
    crewLabel: boundedText(entry.crewLabel, 160, true)!,
    trade: boundedText(entry.trade, 120),
    plannedCount: Math.floor(nonNegative(entry.plannedCount)),
    actualCount: Math.floor(nonNegative(entry.actualCount)),
    regularHours: nonNegative(entry.regularHours),
    overtimeHours: nonNegative(entry.overtimeHours),
    notes: boundedText(entry.notes, 2000),
    createdAt: now,
    updatedAt: now,
  }));
  const equipment = (sections.equipment || []).map((entry) => ({
    ...entry,
    id: entry.id || dailySiteLogId("equipment"),
    companyId: log.companyId,
    dailyLogId: log.id,
    equipmentLabel: boundedText(entry.equipmentLabel, 160, true)!,
    equipmentReference: boundedText(entry.equipmentReference, 120),
    quantity: Math.max(1, Math.floor(nonNegative(entry.quantity, 1))),
    operatingHours: nonNegative(entry.operatingHours),
    idleHours: nonNegative(entry.idleHours),
    operatorNote: boundedText(entry.operatorNote, 2000),
    issueNote: boundedText(entry.issueNote, 2000),
    createdAt: now,
    updatedAt: now,
  }));
  const events = (sections.events || []).map((entry) => ({
    ...entry,
    id: entry.id || dailySiteLogId("event"),
    companyId: log.companyId,
    dailyLogId: log.id,
    title: boundedText(entry.title, 200, true)!,
    description: boundedText(entry.description, 8000, true)!,
    location: boundedText(entry.location, 255),
    immediateAction: boundedText(entry.immediateAction, 4000),
    createdAt: now,
  }));
  return { logs: [log], weather, crews, equipment, events, amendments: [], attachments: [] };
}

function withoutLogSections(data: DailySiteLogsWorkspaceData, dailyLogId: string): DailySiteLogsWorkspaceData {
  return {
    ...data,
    weather: data.weather.filter((item) => item.dailyLogId !== dailyLogId),
    crews: data.crews.filter((item) => item.dailyLogId !== dailyLogId),
    equipment: data.equipment.filter((item) => item.dailyLogId !== dailyLogId),
    events: data.events.filter((item) => item.dailyLogId !== dailyLogId),
  };
}

export function transitionDailySiteLog(log: DailySiteLog, next: DailySiteLogStatus, options?: { userId?: string; reason?: string; now?: string }): DailySiteLog {
  const now = options?.now || new Date().toISOString();
  if (log.status === "VOID") throw new Error("A void daily log cannot transition.");
  if (next === "SUBMITTED") {
    if (log.status !== "DRAFT") throw new Error("Only a draft daily log can be submitted.");
    return { ...log, status: "SUBMITTED", submittedByUserId: options?.userId, submittedAt: now, updatedAt: now };
  }
  if (next === "REVIEWED") {
    if (log.status !== "SUBMITTED") throw new Error("Only a submitted daily log can be reviewed.");
    return { ...log, status: "REVIEWED", reviewedByUserId: options?.userId, reviewedAt: now, updatedAt: now };
  }
  if (next === "VOID") {
    if (log.status === "REVIEWED") throw new Error("Reviewed daily logs must be corrected by amendment, not voided.");
    const reason = boundedText(options?.reason, 1000, true)!;
    return { ...log, status: "VOID", voidedAt: now, voidReason: reason, updatedAt: now };
  }
  throw new Error("Unsupported daily log lifecycle transition.");
}

export function appendDailySiteLogAmendment(data: DailySiteLogsWorkspaceData, log: DailySiteLog, amendmentText: string, options?: { id?: string; companyId?: string; userId?: string; now?: string }): DailySiteLogsWorkspaceData {
  if (log.status !== "SUBMITTED" && log.status !== "REVIEWED") throw new Error("Amendments are only available after a daily log is submitted.");
  const now = options?.now || new Date().toISOString();
  const amendment: DailySiteLogAmendment = {
    id: options?.id || dailySiteLogId("amendment"),
    companyId: options?.companyId || log.companyId,
    dailyLogId: log.id,
    amendmentText: boundedText(amendmentText, 8000, true)!,
    createdByUserId: options?.userId,
    createdAt: now,
  };
  return { ...data, amendments: [...data.amendments, amendment] };
}

export function sectionsForDailySiteLog(data: DailySiteLogsWorkspaceData, logId: string): DailySiteLogDraftSections {
  const log = data.logs.find((item) => item.id === logId);
  return {
    workSummary: log?.workSummary || "",
    delaySummary: log?.delaySummary,
    safetySummary: log?.safetySummary,
    qualitySummary: log?.qualitySummary,
    deliveriesVisitors: log?.deliveriesVisitors,
    generalNotes: log?.generalNotes,
    weather: data.weather.find((item) => item.dailyLogId === logId),
    crews: data.crews.filter((item) => item.dailyLogId === logId),
    equipment: data.equipment.filter((item) => item.dailyLogId === logId),
    events: data.events.filter((item) => item.dailyLogId === logId),
  };
}
