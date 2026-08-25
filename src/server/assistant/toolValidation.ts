import { AssistantBackendError, AssistantToolError } from "./assistantBackendTypes.ts";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_ASSISTANT_MESSAGE_CHARS = 8_000;
export const MAX_TOOL_ARGUMENT_BYTES = 24_000;
export const MAX_SEARCH_LIMIT = 50;
export const MAX_BATCH_RECORDS = 50;

const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const ISO_DATE_SAMPLE = "2000-01-01T00:00:00.000Z";

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function requireUuid(value: unknown, label: string): string {
  if (!isUuid(value)) throw new AssistantToolError("INVALID_UUID", `${label} must be a valid identifier.`);
  return value;
}

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_ONLY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === ISO_DATE_SAMPLE.replace("2000-01-01", value);
}

export function requireDateOnly(value: unknown, label: string): string {
  if (!isDateOnly(value)) throw new AssistantToolError("INVALID_DATE", `${label} must use YYYY-MM-DD.`);
  return value;
}

export function optionalDateOnly(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireDateOnly(value, label);
}

export function boundedText(value: unknown, label: string, max = 240, required = true): string | undefined {
  if (value === undefined || value === null) {
    if (required) throw new AssistantToolError("INVALID_ARGUMENT", `${label} is required.`);
    return undefined;
  }
  if (typeof value !== "string") throw new AssistantToolError("INVALID_ARGUMENT", `${label} must be text.`);
  const text = value.trim();
  if (required && !text) throw new AssistantToolError("INVALID_ARGUMENT", `${label} is required.`);
  if (text.length > max) throw new AssistantToolError("ARGUMENT_TOO_LARGE", `${label} is too long.`);
  return text || undefined;
}

export function optionalNumber(value: unknown, label: string, options: { min?: number; max?: number; integer?: boolean } = {}): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new AssistantToolError("INVALID_NUMBER", `${label} must be a finite number.`);
  if (options.integer && !Number.isInteger(value)) throw new AssistantToolError("INVALID_NUMBER", `${label} must be a whole number.`);
  if (options.min !== undefined && value < options.min) throw new AssistantToolError("INVALID_NUMBER", `${label} is below the allowed minimum.`);
  if (options.max !== undefined && value > options.max) throw new AssistantToolError("INVALID_NUMBER", `${label} is above the allowed maximum.`);
  return value;
}

function requiredNumber(value: unknown, label: string, options: { min?: number; max?: number; integer?: boolean } = {}) {
  const result = optionalNumber(value, label, options);
  if (result === undefined) throw new AssistantToolError("INVALID_NUMBER", `${label} is required.`);
  return result;
}

function requiredWorkerRate(value: unknown) {
  const normalized = typeof value === "string" && /^\s*\d+(?:\.\d+)?\s*$/.test(value) ? Number(value) : value;
  return requiredNumber(normalized, "defaultRate", { min: 0, max: 1_000_000_000 });
}

export function boundedLimit(value: unknown, fallback = 20): number {
  const parsed = value === undefined ? fallback : optionalNumber(value, "limit", { min: 1, max: MAX_SEARCH_LIMIT, integer: true });
  return parsed ?? fallback;
}

export function plainObject(value: unknown, label = "arguments"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AssistantToolError("INVALID_ARGUMENTS", `${label} must be an object.`);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) throw new AssistantToolError("INVALID_ARGUMENTS", `${label} contains an unsupported field.`);
  }
  try {
    if (JSON.stringify(value).length > MAX_TOOL_ARGUMENT_BYTES) throw new AssistantToolError("ARGUMENT_TOO_LARGE", `${label} is too large.`);
  } catch (error) {
    if (error instanceof AssistantBackendError) throw error;
    throw new AssistantToolError("INVALID_ARGUMENTS", `${label} must be JSON data.`);
  }
  return value as Record<string, unknown>;
}

export function enumValue<T extends string>(value: unknown, label: string, values: readonly T[], required = true): T | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new AssistantToolError("INVALID_ARGUMENT", `${label} is required.`);
    return undefined;
  }
  if (typeof value !== "string" || !values.includes(value as T)) throw new AssistantToolError("INVALID_ARGUMENT", `${label} is not supported.`);
  return value as T;
}

export function validateToolArguments(toolName: string, input: unknown): Record<string, unknown> {
  const args = plainObject(input);
  switch (toolName) {
    case "get_invoice": return { invoiceId: requireUuid(args.invoiceId, "invoiceId") };
    case "get_project":
    case "get_project_cost_summary": return { projectId: requireUuid(args.projectId, "projectId") };
    case "get_expense_summary":
      return { projectId: args.projectId ? requireUuid(args.projectId, "projectId") : undefined, from: optionalDateOnly(args.from, "from"), to: optionalDateOnly(args.to, "to"), currency: args.currency ? boundedText(args.currency, "currency", 8)!.toUpperCase() : undefined };
    case "get_vendor_summary": return { vendorId: requireUuid(args.vendorId, "vendorId") };
    case "get_worker": return { workerId: requireUuid(args.workerId, "workerId") };
    case "prepare_create_worker": {
      const employmentStatus = enumValue(args.employmentStatus || "ACTIVE", "employmentStatus", ["ACTIVE", "INACTIVE", "ONBOARDING", "OFFBOARDED"] as const)!;
      const active = args.active === undefined ? employmentStatus === "ACTIVE" : args.active;
      if (typeof active !== "boolean") throw new AssistantToolError("INVALID_ARGUMENT", "active must be boolean.");
      if (active !== (employmentStatus === "ACTIVE")) throw new AssistantToolError("INVALID_ARGUMENT", "active must match employmentStatus.");
      return {
        firstName: boundedText(args.firstName, "firstName", 100),
        middleName: boundedText(args.middleName, "middleName", 100, false),
        lastName: boundedText(args.lastName, "lastName", 100),
        employeeCode: boundedText(args.employeeCode, "employeeCode", 80, false),
        employmentType: enumValue(args.employmentType || "OTHER", "employmentType", ["REGULAR", "PROJECT_BASED", "CONTRACTUAL", "DAILY", "HOURLY", "OTHER"] as const)!,
        employmentStatus,
        jobTitle: boundedText(args.jobTitle, "jobTitle", 160, false),
        departmentId: args.departmentId ? requireUuid(args.departmentId, "departmentId") : undefined,
        department: boundedText(args.department, "department", 160, false),
        defaultPayType: enumValue(args.defaultPayType, "defaultPayType", ["MONTHLY", "DAILY", "HOURLY"] as const)!,
        defaultRate: requiredWorkerRate(args.defaultRate),
        active,
        hireDate: optionalDateOnly(args.hireDate, "hireDate"),
        notes: boundedText(args.notes, "notes", 500, false),
      };
    }
    case "get_attendance_day": return { date: requireDateOnly(args.date, "date"), workerId: args.workerId ? requireUuid(args.workerId, "workerId") : undefined };
    case "get_attendance_period_summary": return { periodId: args.periodId ? requireUuid(args.periodId, "periodId") : undefined, from: optionalDateOnly(args.from, "from"), to: optionalDateOnly(args.to, "to") };
    case "get_payroll_period": return { periodId: requireUuid(args.periodId, "periodId") };
    case "get_payroll_run": return { runId: requireUuid(args.runId, "runId") };
    case "get_payroll_readiness": return { periodId: requireUuid(args.periodId, "periodId") };
    case "get_payroll_exceptions":
    case "get_payroll_summary": return { periodId: requireUuid(args.periodId, "periodId") };
    case "navigate_to": return { routeId: boundedText(args.routeId, "routeId", 64) };
    case "navigate_to_project": return { projectId: requireUuid(args.projectId, "projectId") };
    case "navigate_to_invoice": return { invoiceId: requireUuid(args.invoiceId, "invoiceId") };
    case "navigate_to_review_invoice": return { invoiceId: requireUuid(args.invoiceId, "invoiceId") };
    case "navigate_to_payroll_period": return { periodId: requireUuid(args.periodId, "periodId") };
    case "navigate_to_attendance_date": return { date: requireDateOnly(args.date, "date") };
    case "search_help":
    case "get_feature_help":
      return { [toolName === "search_help" ? "query" : "feature"]: boundedText(args[toolName === "search_help" ? "query" : "feature"], toolName === "search_help" ? "query" : "feature", 200) };
    case "start_tour": return { tourId: boundedText(args.tourId, "tourId", 64) };
    case "prepare_attendance_batch": return validateAttendanceBatch(args);
    case "prepare_attendance_roster":
      if (typeof args.presentAllExpected !== "boolean") throw new AssistantToolError("INVALID_ARGUMENT", "presentAllExpected must be boolean.");
      if (!Array.isArray(args.absentWorkerIds) || args.absentWorkerIds.length > MAX_BATCH_RECORDS) throw new AssistantToolError("INVALID_BATCH", "absentWorkerIds must be an array of at most 50 workers.");
      return {
        attendanceDate: requireDateOnly(args.attendanceDate, "attendanceDate"),
        periodId: args.periodId ? requireUuid(args.periodId, "periodId") : undefined,
        absentWorkerIds: args.absentWorkerIds.map((value, index) => requireUuid(value, `absentWorkerIds[${index}]`)),
        presentAllExpected: args.presentAllExpected,
      };
    case "record_presence":
    case "record_absence": return {
      workerId: requireUuid(args.workerId, "workerId"), periodId: args.periodId ? requireUuid(args.periodId, "periodId") : undefined, attendanceDate: requireDateOnly(args.attendanceDate, "attendanceDate"),
      attendanceStatus: toolName === "record_absence" ? "ABSENT" : "PRESENT", scheduledStart: boundedText(args.scheduledStart, "scheduledStart", 40, false), scheduledEnd: boundedText(args.scheduledEnd, "scheduledEnd", 40, false),
      scheduledMinutes: optionalNumber(args.scheduledMinutes, "scheduledMinutes", { min: 0, max: 24 * 60, integer: true }) ?? 0, actualTimeIn: boundedText(args.actualTimeIn, "actualTimeIn", 40, false), actualTimeOut: boundedText(args.actualTimeOut, "actualTimeOut", 40, false), notes: boundedText(args.notes, "notes", 500, false),
    };
    case "prepare_leave_request": return validateLeaveRequest(args);
    case "approve_leave": return { requestId: requireUuid(args.requestId, "requestId") };
    case "reject_leave": return { requestId: requireUuid(args.requestId, "requestId"), reason: boundedText(args.reason, "reason", 500, false) };
    case "cancel_leave": return { requestId: requireUuid(args.requestId, "requestId"), reason: boundedText(args.reason, "reason", 500, false) };
    case "prepare_overtime_request": return validateOvertimeRequest(args);
    case "approve_overtime": return { requestId: requireUuid(args.requestId, "requestId"), approvedMinutes: optionalNumber(args.approvedMinutes, "approvedMinutes", { min: 0, max: 24 * 60, integer: true }) };
    case "reject_overtime": return { requestId: requireUuid(args.requestId, "requestId"), reason: boundedText(args.reason, "reason", 500, false) };
    case "cancel_overtime": return { requestId: requireUuid(args.requestId, "requestId"), reason: boundedText(args.reason, "reason", 500, false) };
    case "prepare_payroll_recalculation": return { periodId: requireUuid(args.periodId, "periodId"), runId: args.runId ? requireUuid(args.runId, "runId") : undefined };
    case "create_expense_draft": return {
      projectId: args.projectId ? requireUuid(args.projectId, "projectId") : undefined,
      expenseDate: requireDateOnly(args.expenseDate, "expenseDate"), category: boundedText(args.category, "category", 120), description: boundedText(args.description, "description", 500),
      payee: boundedText(args.payee, "payee", 200, false), amount: requiredNumber(args.amount, "amount", { min: 0, max: 1_000_000_000 }), currency: (boundedText(args.currency || "PHP", "currency", 8) || "PHP").toUpperCase(),
      paymentMethod: boundedText(args.paymentMethod, "paymentMethod", 80, false), referenceNumber: boundedText(args.referenceNumber, "referenceNumber", 120, false), notes: boundedText(args.notes, "notes", 500, false),
    };
    case "create_project_draft": return {
      projectCode: boundedText(args.projectCode, "projectCode", 80), projectName: boundedText(args.projectName, "projectName", 200), description: boundedText(args.description, "description", 500, false), clientName: boundedText(args.clientName, "clientName", 200, false),
      projectBudget: optionalNumber(args.projectBudget, "projectBudget", { min: 0, max: 1_000_000_000 }) ?? 0, currency: (boundedText(args.currency || "PHP", "currency", 8) || "PHP").toUpperCase(),
    };
    case "assign_invoice_to_project": return {
      invoiceId: requireUuid(args.invoiceId, "invoiceId"), projectId: requireUuid(args.projectId, "projectId"),
      allocationAmount: optionalNumber(args.allocationAmount, "allocationAmount", { min: 0, max: 1_000_000_000 }), allocationPercentage: optionalNumber(args.allocationPercentage, "allocationPercentage", { min: 0, max: 100 }), notes: boundedText(args.notes, "notes", 500, false),
    };
    case "update_invoice_draft": return {
      invoiceId: requireUuid(args.invoiceId, "invoiceId"), invoiceNumber: boundedText(args.invoiceNumber, "invoiceNumber", 120, false), dueDate: optionalDateOnly(args.dueDate, "dueDate"), projectReference: boundedText(args.projectReference, "projectReference", 200, false), notes: boundedText(args.notes, "notes", 1000, false),
    };
    case "approve_payroll": return { runId: requireUuid(args.runId, "runId") };
    case "mark_payroll_paid": return { runId: requireUuid(args.runId, "runId") };
    default:
      return normalizeSearchArguments(args);
  }
}

function normalizeSearchArguments(args: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (["query", "vendor", "invoiceNumber", "reviewStatus", "paymentStatus", "status", "currency", "feature"].includes(key)) normalized[key] = boundedText(value, key, 200, false);
    else if (["limit"].includes(key)) normalized[key] = boundedLimit(value);
    else if (["from", "to", "date"].includes(key)) normalized[key] = optionalDateOnly(value, key);
    else if (["projectId", "vendorId", "workerId", "periodId", "runId"].includes(key)) normalized[key] = value ? requireUuid(value, key) : undefined;
    else if (["active"].includes(key)) {
      if (typeof value !== "boolean") throw new AssistantToolError("INVALID_ARGUMENT", `${key} must be boolean.`);
      normalized[key] = value;
    }
  }
  return normalized;
}

function validateAttendanceBatch(args: Record<string, unknown>) {
  if (!Array.isArray(args.records) || args.records.length === 0 || args.records.length > MAX_BATCH_RECORDS) throw new AssistantToolError("INVALID_BATCH", `records must contain 1-${MAX_BATCH_RECORDS} items.`);
  return {
    records: args.records.map((value, index) => {
      const record = plainObject(value, `records[${index}]`);
      return {
        workerId: requireUuid(record.workerId, `records[${index}].workerId`),
        periodId: record.periodId ? requireUuid(record.periodId, `records[${index}].periodId`) : undefined,
        attendanceDate: requireDateOnly(record.attendanceDate, `records[${index}].attendanceDate`),
        attendanceStatus: enumValue(record.attendanceStatus || "PRESENT", `records[${index}].attendanceStatus`, ["PRESENT", "ABSENT", "PARTIAL", "ON_LEAVE", "REST_DAY", "HOLIDAY", "OFFICIAL_BUSINESS"] as const)!,
        recordStatus: enumValue(record.recordStatus || "CONFIRMED", `records[${index}].recordStatus`, ["DRAFT", "CONFIRMED"] as const)!,
        scheduledStart: boundedText(record.scheduledStart, `records[${index}].scheduledStart`, 40, false),
        scheduledEnd: boundedText(record.scheduledEnd, `records[${index}].scheduledEnd`, 40, false),
        scheduledMinutes: optionalNumber(record.scheduledMinutes, `records[${index}].scheduledMinutes`, { min: 0, max: 24 * 60, integer: true }) ?? 0,
        breakMinutes: optionalNumber(record.breakMinutes, `records[${index}].breakMinutes`, { min: 0, max: 24 * 60, integer: true }) ?? 0,
        actualTimeIn: boundedText(record.actualTimeIn, `records[${index}].actualTimeIn`, 40, false),
        actualTimeOut: boundedText(record.actualTimeOut, `records[${index}].actualTimeOut`, 40, false),
        regularMinutes: optionalNumber(record.regularMinutes, `records[${index}].regularMinutes`, { min: 0, max: 24 * 60, integer: true }) ?? 0,
        lateMinutes: optionalNumber(record.lateMinutes, `records[${index}].lateMinutes`, { min: 0, max: 24 * 60, integer: true }) ?? 0,
        undertimeMinutes: optionalNumber(record.undertimeMinutes, `records[${index}].undertimeMinutes`, { min: 0, max: 24 * 60, integer: true }) ?? 0,
        overtimeMinutes: optionalNumber(record.overtimeMinutes, `records[${index}].overtimeMinutes`, { min: 0, max: 24 * 60, integer: true }) ?? 0,
        paidDayFraction: optionalNumber(record.paidDayFraction, `records[${index}].paidDayFraction`, { min: 0, max: 1 }) ?? 0,
        notes: boundedText(record.notes, `records[${index}].notes`, 500, false),
      };
    }),
  };
}

function validateLeaveRequest(args: Record<string, unknown>) {
  const startDate = requireDateOnly(args.startDate, "startDate");
  const endDate = requireDateOnly(args.endDate, "endDate");
  if (endDate < startDate) throw new AssistantToolError("INVALID_DATE_RANGE", "endDate cannot be before startDate.");
  if (args.paid !== undefined && typeof args.paid !== "boolean") throw new AssistantToolError("INVALID_ARGUMENT", "paid must be boolean when provided.");
  return {
    workerId: requireUuid(args.workerId, "workerId"),
    leaveType: boundedText(args.leaveType, "leaveType", 80),
    startDate,
    endDate,
    partialDay: enumValue(args.partialDay || "FULL", "partialDay", ["FULL", "AM", "PM"] as const)!,
    paid: args.paid === undefined ? undefined : args.paid,
    notes: boundedText(args.notes, "notes", 500, false),
  };
}

function validateOvertimeRequest(args: Record<string, unknown>) {
  const overtimeDate = requireDateOnly(args.overtimeDate, "overtimeDate");
  const laborContext = enumValue(args.laborContext || (args.projectId ? "PROJECT" : "UNALLOCATED_REVIEW"), "laborContext", ["PROJECT", "ADMIN_OFFICE", "GENERAL_OVERHEAD", "UNALLOCATED_REVIEW"] as const)!;
  const projectId = args.projectId ? requireUuid(args.projectId, "projectId") : undefined;
  if (laborContext === "PROJECT" && !projectId) throw new AssistantToolError("PROJECT_REQUIRED", "A project is required for project overtime.");
  if (laborContext !== "PROJECT" && projectId) throw new AssistantToolError("PROJECT_NOT_ALLOWED", "Non-project overtime cannot reference a project.");
  return {
    workerId: requireUuid(args.workerId, "workerId"),
    periodId: args.periodId ? requireUuid(args.periodId, "periodId") : undefined,
    overtimeDate,
    projectId,
    laborContext,
    requestedMinutes: optionalNumber(args.requestedMinutes, "requestedMinutes", { min: 1, max: 24 * 60, integer: true }),
    reason: boundedText(args.reason, "reason", 500, false),
    notes: boundedText(args.notes, "notes", 500, false),
  };
}

export function validateAssistantMessage(message: unknown): string {
  if (typeof message !== "string" || !message.trim()) throw new AssistantBackendError("MESSAGE_REQUIRED", "A message is required.", 400);
  const trimmed = message.trim();
  if (trimmed.length > MAX_ASSISTANT_MESSAGE_CHARS) throw new AssistantBackendError("MESSAGE_TOO_LARGE", "The message is too long.", 413);
  return trimmed;
}
