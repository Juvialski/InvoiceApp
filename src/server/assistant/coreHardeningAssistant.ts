import type { AssistantRiskTier } from "../../assistant/assistantTypes.ts";
import { AssistantBackendError, AssistantToolError, type AssistantToolContext, type ToolExecutionResult } from "./assistantBackendTypes.ts";
import { boundedLimit, boundedText, enumValue, optionalDateOnly, plainObject, requireDateOnly, requireUuid } from "./toolValidation.ts";
import { toolOk } from "./toolResults.ts";

type JsonSchema = Record<string, unknown>;
type PermissionResolver = string[] | ((args: Record<string, unknown>) => string[]);

export interface CoreHardeningToolDefinition {
  name: string;
  description: string;
  riskTier: AssistantRiskTier;
  permissions: PermissionResolver;
  parametersJsonSchema: JsonSchema;
  requiresConfirmation: boolean;
}

const uuid = { type: "string", description: "Identifier supplied by a prior Engoryx tool result or current workspace context." };
const date = { type: "string", description: "Calendar date in YYYY-MM-DD format." };

function schema(properties: Record<string, unknown>, required: string[] = []): JsonSchema {
  return { type: "object", properties, required, additionalProperties: false };
}

function prepare(name: string, description: string, permissions: PermissionResolver, properties: Record<string, unknown>, required: string[]): CoreHardeningToolDefinition {
  return { name, description, permissions, riskTier: "PREPARE", parametersJsonSchema: schema(properties, required), requiresConfirmation: true };
}

function read(name: string, description: string, permissions: PermissionResolver, properties: Record<string, unknown> = {}, required: string[] = []): CoreHardeningToolDefinition {
  return { name, description, permissions, riskTier: "READ", parametersJsonSchema: schema(properties, required), requiresConfirmation: false };
}

function navigation(name: string, description: string, permissions: PermissionResolver, properties: Record<string, unknown>, required: string[]): CoreHardeningToolDefinition {
  return { name, description, permissions, riskTier: "NAVIGATION", parametersJsonSchema: schema(properties, required), requiresConfirmation: false };
}

const lifecycleReason = { type: "string", description: "Short reason retained with the audited lifecycle action." };
const projectLifecycleAction = { type: "string", enum: ["DELETE_UNUSED", "ARCHIVE", "REACTIVATE"] };
const financialCorrectionAction = { type: "string", enum: ["DELETE_UNUSED", "VOID", "ARCHIVE", "RESTORE"] };
const workerLifecycleAction = { type: "string", enum: ["DELETE_UNUSED", "OFFBOARD", "REACTIVATE"] };
const assignmentLifecycleAction = { type: "string", enum: ["DELETE_UNUSED", "END"] };
const profileLifecycleAction = { type: "string", enum: ["DELETE_UNUSED", "END", "SUPERSEDE"] };
const componentLifecycleAction = { type: "string", enum: ["DELETE_UNUSED", "DEACTIVATE", "END"] };
const sourceLifecycleAction = { type: "string", enum: ["DELETE_DRAFT", "VOID", "CANCEL"] };
const engineeringDocumentLifecycleAction = { type: "string", enum: ["DELETE_UNUSED", "ARCHIVE", "SUPERSEDE"] };
const engineeringLifecycleAction = { type: "string", enum: ["DELETE_UNUSED", "VOID"] };

export const CORE_HARDENING_TOOL_DEFINITIONS: readonly CoreHardeningToolDefinition[] = Object.freeze([
  prepare("prepare_project_lifecycle", "Prepare deletion of an unused project, archiving an operational project, or reactivating an eligible archived project. Confirmation is required and the database rechecks dependencies.", ["projects.read", "projects.manage"], { projectId: uuid, action: projectLifecycleAction, reason: lifecycleReason }, ["projectId", "action"]),
  prepare("prepare_financial_correction", "Prepare a guarded invoice or direct-expense correction. The database decides whether the outcome is delete-unused, void, archive, or restore and preserves financial history.", (args) => String(args.entityType).toUpperCase() === "EXPENSE" ? ["expenses.read", "expenses.manage"] : ["invoices.read", "invoices.manage"], { entityType: { type: "string", enum: ["INVOICE", "EXPENSE"] }, entityId: uuid, action: financialCorrectionAction, reason: lifecycleReason }, ["entityType", "entityId", "action"]),
  prepare("prepare_worker_update", "Prepare a descriptive update to an existing worker without changing employment lifecycle fields. Confirmation is required before the company record is updated.", ["workers.manage"], { workerId: uuid, firstName: { type: "string" }, middleName: { type: "string" }, lastName: { type: "string" }, employeeCode: { type: "string" }, jobTitle: { type: "string" }, department: { type: "string" }, departmentId: uuid, defaultPayType: { type: "string", enum: ["MONTHLY", "DAILY", "HOURLY"] }, defaultRate: { type: "number", minimum: 0, maximum: 1000000000 }, defaultLaborContext: { type: "string", enum: ["PROJECT", "ADMIN_OFFICE", "GENERAL_OVERHEAD", "UNALLOCATED_REVIEW"] }, defaultProjectId: uuid, workingDays: { type: "array", maxItems: 7, items: { type: "string" } }, workingHoursStart: { type: "string" }, workingHoursEnd: { type: "string" }, notes: { type: "string" } }, ["workerId"]),
  prepare("prepare_worker_lifecycle", "Prepare unused-worker deletion, worker offboarding, or eligible worker reactivation. The database performs the authoritative dependency preflight.", ["workers.read", "workers.manage"], { workerId: uuid, action: workerLifecycleAction, reason: lifecycleReason }, ["workerId", "action"]),
  prepare("prepare_assignment_lifecycle", "Prepare deletion of an unused project assignment or end-date an assignment with downstream history. Used assignments cannot be rewritten or deleted.", ["workers.manage"], { assignmentId: uuid, action: assignmentLifecycleAction, effectiveDate: date, reason: lifecycleReason }, ["assignmentId", "action"]),
  prepare("prepare_compensation_profile_lifecycle", "Prepare deletion, ending, or supersession of a worker compensation profile while preserving consumed payroll history.", ["workers.manage"], { profileId: uuid, action: profileLifecycleAction, effectiveDate: date, reason: lifecycleReason }, ["profileId", "action"]),
  prepare("prepare_recurring_component_lifecycle", "Prepare deletion, deactivation, or ending of a recurring payroll component while preserving consumed payroll history.", ["workers.manage"], { componentId: uuid, action: componentLifecycleAction, effectiveDate: date, reason: lifecycleReason }, ["componentId", "action"]),
  prepare("prepare_workforce_source_lifecycle", "Prepare deletion of an unused draft or a reasoned correction of a work entry, attendance record, leave request, or overtime request.", ["payroll.manage"], { entityType: { type: "string", enum: ["WORK_ENTRY", "ATTENDANCE", "LEAVE", "OVERTIME"] }, entityId: uuid, action: sourceLifecycleAction, reason: lifecycleReason }, ["entityType", "entityId", "action"]),
  prepare("prepare_engineering_document_lifecycle", "Prepare deletion of an unused engineering document shell, archive, or supersession while preserving revisions, annotations, links, and source files.", ["engineering.documents.read", "engineering.documents.manage"], { documentId: uuid, action: engineeringDocumentLifecycleAction, reason: lifecycleReason }, ["documentId", "action"]),
  prepare("prepare_rfi_lifecycle", "Prepare deletion of an unused RFI draft or voiding of an active RFI with preserved response history.", ["engineering.rfis.read", "engineering.rfis.manage"], { rfiId: uuid, action: engineeringLifecycleAction, reason: lifecycleReason }, ["rfiId", "action"]),
  prepare("prepare_submittal_lifecycle", "Prepare deletion of an unused technical submittal draft or voiding of a formal submittal while preserving rounds and reviews.", ["engineering.submittals.read", "engineering.submittals.manage"], { submittalId: uuid, action: engineeringLifecycleAction, reason: lifecycleReason }, ["submittalId", "action"]),
  prepare("prepare_site_log_lifecycle", "Prepare deletion of an untouched Site Log draft or voiding of an editable submitted log. Finalized observations remain historical.", ["engineering.sitelogs.read", "engineering.sitelogs.manage"], { siteLogId: uuid, action: engineeringLifecycleAction, reason: lifecycleReason }, ["siteLogId", "action"]),
  prepare("prepare_site_log_addendum", "Prepare an append-only correction/addendum to a finalized Daily Site Log. The original field observations remain unchanged.", ["engineering.sitelogs.manage"], { siteLogId: uuid, reason: lifecycleReason, correctionText: { type: "string" } }, ["siteLogId", "reason", "correctionText"]),
  read("search_engineering_documents", "Search company engineering documents by document number, title, discipline, or status.", ["engineering.documents.read"], { projectId: uuid, query: { type: "string" }, discipline: { type: "string" }, status: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } }),
  read("get_engineering_document", "Get one company engineering document with bounded revisions and annotations.", ["engineering.documents.read"], { documentId: uuid }, ["documentId"]),
  navigation("navigate_to_engineering_document", "Open a verified company engineering document and its current revision in the project workspace.", ["engineering.documents.read", "projects.read"], { documentId: uuid, revisionId: uuid }, ["documentId"]),
  read("get_worker_payroll_setup", "Get a worker's effective-dated compensation profiles and recurring payroll components without exposing unrelated company records.", ["workers.compensation.read"], { workerId: uuid }, ["workerId"]),
]);

const TOOL_NAMES = new Set(CORE_HARDENING_TOOL_DEFINITIONS.map((definition) => definition.name));
const PROJECT_ACTIONS = ["DELETE_UNUSED", "ARCHIVE", "REACTIVATE"] as const;
const FINANCIAL_ACTIONS = ["DELETE_UNUSED", "VOID", "ARCHIVE", "RESTORE"] as const;
const WORKER_ACTIONS = ["DELETE_UNUSED", "OFFBOARD", "REACTIVATE"] as const;
const ASSIGNMENT_ACTIONS = ["DELETE_UNUSED", "END"] as const;
const PROFILE_ACTIONS = ["DELETE_UNUSED", "END", "SUPERSEDE"] as const;
const COMPONENT_ACTIONS = ["DELETE_UNUSED", "DEACTIVATE", "END"] as const;
const SOURCE_ACTIONS = ["DELETE_DRAFT", "VOID", "CANCEL"] as const;
const ENGINEERING_DOCUMENT_ACTIONS = ["DELETE_UNUSED", "ARCHIVE", "SUPERSEDE"] as const;
const ENGINEERING_ACTIONS = ["DELETE_UNUSED", "VOID"] as const;
const SOURCE_ENTITIES = ["WORK_ENTRY", "ATTENDANCE", "LEAVE", "OVERTIME"] as const;

export function isCoreHardeningTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

function requiredReason(action: string, reason: string | undefined, label: string) {
  if (["ARCHIVE", "RESTORE", "REACTIVATE", "OFFBOARD", "END", "SUPERSEDE", "DEACTIVATE", "VOID", "CANCEL"].includes(action) && !reason) {
    throw new AssistantToolError("REASON_REQUIRED", `A reason is required to ${action.toLowerCase().replaceAll("_", " ")} ${label}.`);
  }
}

function validateLifecycle<T extends string>(args: Record<string, unknown>, idKey: string, actions: readonly T[], label: string) {
  const id = requireUuid(args[idKey], idKey);
  const action = enumValue(args.action, "action", actions)!;
  const reason = boundedText(args.reason, "reason", 1000, false);
  requiredReason(action, reason, label);
  return { [idKey]: id, action, reason } as Record<string, unknown>;
}

function validateDate(value: unknown, label: string, required = false) {
  return required ? requireDateOnly(value, label) : optionalDateOnly(value, label);
}

function validateWorkerUpdate(args: Record<string, unknown>) {
  const workerId = requireUuid(args.workerId, "workerId");
  const fields: Record<string, unknown> = { workerId };
  for (const key of ["firstName", "middleName", "lastName", "employeeCode", "jobTitle", "department", "workingHoursStart", "workingHoursEnd", "notes"]) {
    if (args[key] !== undefined) fields[key] = boundedText(args[key], key, key === "notes" ? 2000 : 240, false);
  }
  if (args.departmentId !== undefined) fields.departmentId = args.departmentId === null || args.departmentId === "" ? null : requireUuid(args.departmentId, "departmentId");
  if (args.defaultProjectId !== undefined) fields.defaultProjectId = args.defaultProjectId === null || args.defaultProjectId === "" ? null : requireUuid(args.defaultProjectId, "defaultProjectId");
  if (args.defaultPayType !== undefined) fields.defaultPayType = enumValue(args.defaultPayType, "defaultPayType", ["MONTHLY", "DAILY", "HOURLY"] as const);
  if (args.defaultLaborContext !== undefined) fields.defaultLaborContext = enumValue(args.defaultLaborContext, "defaultLaborContext", ["PROJECT", "ADMIN_OFFICE", "GENERAL_OVERHEAD", "UNALLOCATED_REVIEW"] as const);
  if (args.defaultRate !== undefined) {
    const value = Number(args.defaultRate);
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) throw new AssistantToolError("INVALID_NUMBER", "defaultRate must be a non-negative payroll rate.");
    fields.defaultRate = value;
  }
  if (args.workingDays !== undefined) {
    if (!Array.isArray(args.workingDays) || args.workingDays.length > 7) throw new AssistantToolError("INVALID_ARGUMENT", "workingDays must contain at most seven values.");
    fields.workingDays = args.workingDays.map((value, index) => boundedText(value, `workingDays[${index}]`, 20)!);
  }
  if (Object.keys(fields).length === 1) throw new AssistantToolError("NO_CHANGES", "Provide at least one worker field to update.");
  if (args.expectedUpdatedAt !== undefined) fields.expectedUpdatedAt = boundedText(args.expectedUpdatedAt, "expectedUpdatedAt", 80, false);
  return fields;
}

export function validateCoreHardeningToolArguments(toolName: string, input: unknown): Record<string, unknown> {
  const args = plainObject(input);
  switch (toolName) {
    case "prepare_project_lifecycle": return validateLifecycle(args, "projectId", PROJECT_ACTIONS, "project");
    case "prepare_financial_correction": {
      const action = enumValue(args.action, "action", FINANCIAL_ACTIONS)!;
      const reason = boundedText(args.reason, "reason", 1000, false);
      requiredReason(action, reason, String(args.entityType).toLowerCase() === "expense" ? "expense" : "invoice");
      return { entityType: enumValue(args.entityType, "entityType", ["INVOICE", "EXPENSE"] as const)!, entityId: requireUuid(args.entityId, "entityId"), action, reason };
    }
    case "prepare_worker_update": return validateWorkerUpdate(args);
    case "prepare_worker_lifecycle": return validateLifecycle(args, "workerId", WORKER_ACTIONS, "worker");
    case "prepare_assignment_lifecycle": return { ...validateLifecycle(args, "assignmentId", ASSIGNMENT_ACTIONS, "project assignment"), effectiveDate: validateDate(args.effectiveDate, "effectiveDate") };
    case "prepare_compensation_profile_lifecycle": return { ...validateLifecycle(args, "profileId", PROFILE_ACTIONS, "compensation profile"), effectiveDate: validateDate(args.effectiveDate, "effectiveDate") };
    case "prepare_recurring_component_lifecycle": return { ...validateLifecycle(args, "componentId", COMPONENT_ACTIONS, "recurring payroll component"), effectiveDate: validateDate(args.effectiveDate, "effectiveDate") };
    case "prepare_workforce_source_lifecycle": {
      const action = enumValue(args.action, "action", SOURCE_ACTIONS)!;
      const reason = boundedText(args.reason, "reason", 1000, false);
      requiredReason(action, reason, "workforce source");
      return { entityType: enumValue(args.entityType, "entityType", SOURCE_ENTITIES)!, entityId: requireUuid(args.entityId, "entityId"), action, reason };
    }
    case "prepare_engineering_document_lifecycle": return validateLifecycle(args, "documentId", ENGINEERING_DOCUMENT_ACTIONS, "engineering document");
    case "prepare_rfi_lifecycle": return validateLifecycle(args, "rfiId", ENGINEERING_ACTIONS, "RFI");
    case "prepare_submittal_lifecycle": return validateLifecycle(args, "submittalId", ENGINEERING_ACTIONS, "technical submittal");
    case "prepare_site_log_lifecycle": return validateLifecycle(args, "siteLogId", ENGINEERING_ACTIONS, "Daily Site Log");
    case "prepare_site_log_addendum": return { siteLogId: requireUuid(args.siteLogId, "siteLogId"), reason: boundedText(args.reason, "reason", 1000)!, correctionText: boundedText(args.correctionText, "correctionText", 8000)! };
    case "search_engineering_documents": return { projectId: args.projectId ? requireUuid(args.projectId, "projectId") : undefined, query: boundedText(args.query, "query", 200, false), discipline: boundedText(args.discipline, "discipline", 80, false), status: boundedText(args.status, "status", 80, false), limit: boundedLimit(args.limit) };
    case "get_engineering_document": return { documentId: requireUuid(args.documentId, "documentId") };
    case "navigate_to_engineering_document": return { documentId: requireUuid(args.documentId, "documentId"), revisionId: args.revisionId ? requireUuid(args.revisionId, "revisionId") : undefined };
    case "get_worker_payroll_setup": return { workerId: requireUuid(args.workerId, "workerId") };
    default: throw new AssistantToolError("UNKNOWN_TOOL", "That hardening operation is not available.");
  }
}

function db(context: AssistantToolContext): any {
  return context.auth.supabase as any;
}

async function row(context: AssistantToolContext, table: string, id: string, label: string, select = "*") {
  const result = await db(context).from(table).select(select).eq("company_id", context.auth.companyId).eq("id", id).maybeSingle();
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", `${label} could not be read safely.`, 503);
  if (!result.data) throw new AssistantBackendError("NOT_FOUND", `${label} is not available in this company.`, 404);
  return result.data as Record<string, unknown>;
}

async function rows(context: AssistantToolContext, table: string, query: (builder: any) => any, label: string) {
  const result = await query(db(context).from(table).select("*").eq("company_id", context.auth.companyId));
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", `${label} could not be read safely.`, 503);
  return (result.data || []) as Record<string, unknown>[];
}

async function rpc(context: AssistantToolContext, name: string, args: Record<string, unknown>) {
  const result = await db(context).rpc(name, args);
  if (result.error) throw new AssistantBackendError("DOMAIN_WRITE_REJECTED", result.error.message || "The requested operation was rejected by the authoritative domain rule.", 409);
  return result.data;
}

function stringValue(value: unknown, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function label(rowValue: Record<string, unknown>, ...keys: string[]) {
  const values = keys.map((key) => stringValue(rowValue[key]).trim()).filter(Boolean);
  return values.join(" · ") || "Record";
}

function actionPreview(action: string, labelValue: string, extra: Record<string, unknown> = {}) {
  const verbs: Record<string, string> = {
    DELETE_UNUSED: "Delete only if unused and without history",
    ARCHIVE: "Archive while retaining history",
    RESTORE: "Restore visibility while retaining history",
    REACTIVATE: "Reactivate eligible operational access",
    OFFBOARD: "Offboard while retaining workforce history",
    END: "End effective activity while retaining history",
    SUPERSEDE: "Supersede while retaining lineage",
    DEACTIVATE: "Deactivate while retaining history",
    VOID: "Void while retaining audit history",
    CANCEL: "Cancel while retaining source history",
    DELETE_DRAFT: "Delete only an unused draft",
  };
  return { operation: verbs[action] || action, target: labelValue, requestedAction: action, explicitConfirmationRequired: true, ...extra };
}

async function prepareAction(context: AssistantToolContext, toolName: string, normalizedArgs: Record<string, unknown>, preview: Record<string, unknown>): Promise<ToolExecutionResult> {
  return context.prepareAction({ toolName, riskTier: "PREPARE", normalizedArgs, contextGeneration: context.context.generation, preview: { ...preview, contextGeneration: context.context.generation } });
}

async function prepareProjectLifecycle(context: AssistantToolContext, args: Record<string, unknown>) {
  const project = await row(context, "projects", String(args.projectId), "Project", "id,project_code,project_name,status,archived_at,archived_from_status");
  const preflight = record(await rpc(context, "preview_project_lifecycle", { p_project_id: args.projectId }));
  return prepareAction(context, "prepare_project_lifecycle", args, actionPreview(String(args.action), label(project, "project_code", "project_name"), { preflight, historyPolicy: "The database locks and rechecks project dependencies before applying the selected lifecycle outcome." }));
}

async function prepareFinancialCorrection(context: AssistantToolContext, args: Record<string, unknown>) {
  const entityType = String(args.entityType).toUpperCase();
  const table = entityType === "EXPENSE" ? "expenses" : "invoices";
  const target = await row(context, table, String(args.entityId), entityType === "EXPENSE" ? "Expense" : "Invoice", entityType === "EXPENSE" ? "id,expense_date,description,status,archived_at,voided_at" : "id,invoice_number,invoice_date,review_status,payment_status,lifecycle_status,archived_at,voided_at");
  const preflight = record(await rpc(context, entityType === "EXPENSE" ? "preview_expense_correction" : "preview_invoice_correction", { [entityType === "EXPENSE" ? "p_expense_id" : "p_invoice_id"]: args.entityId }));
  return prepareAction(context, "prepare_financial_correction", args, actionPreview(String(args.action), label(target, entityType === "EXPENSE" ? "expense_date" : "invoice_number", entityType === "EXPENSE" ? "description" : "invoice_date"), { entityType, preflight, historyPolicy: "Financial correction preserves dependencies and refuses to erase confirmed settlement history." }));
}

async function prepareWorkerUpdate(context: AssistantToolContext, args: Record<string, unknown>) {
  const worker = await row(context, "workers", String(args.workerId), "Worker", "id,employee_code,display_name,first_name,last_name,default_pay_type,default_rate,default_labor_context,default_project_id,updated_at");
  const fields = Object.keys(args).filter((key) => key !== "workerId");
  return prepareAction(context, "prepare_worker_update", { ...args, expectedUpdatedAt: worker.updated_at || undefined }, actionPreview("UPDATE", label(worker, "employee_code", "display_name"), { fields, lifecycleFields: "Employment status, active flag, end date, and archive state are not changed by this action." }));
}

async function prepareWorkerLifecycle(context: AssistantToolContext, args: Record<string, unknown>) {
  const worker = await row(context, "workers", String(args.workerId), "Worker", "id,employee_code,display_name,first_name,last_name,active,employment_status,end_date,archived_at");
  const preflight = record(await rpc(context, "preview_worker_lifecycle", { p_worker_id: args.workerId }));
  return prepareAction(context, "prepare_worker_lifecycle", args, actionPreview(String(args.action), label(worker, "employee_code", "display_name", "first_name", "last_name"), { preflight, historyPolicy: "Used workforce or payroll history forces OFFBOARD rather than permanent deletion." }));
}

async function prepareAssignmentLifecycle(context: AssistantToolContext, args: Record<string, unknown>) {
  const assignment = await row(context, "project_worker_assignments", String(args.assignmentId), "Project assignment", "id,worker_id,project_id,start_date,end_date,active,role_on_project,updated_at");
  const [workEntries, overtime] = await Promise.all([
    rows(context, "work_entries", (query) => query.eq("worker_id", assignment.worker_id).eq("project_id", assignment.project_id), "Assignment work entries"),
    rows(context, "overtime_requests", (query) => query.eq("worker_id", assignment.worker_id).eq("project_id", assignment.project_id), "Assignment overtime"),
  ]);
  return prepareAction(context, "prepare_assignment_lifecycle", args, actionPreview(String(args.action), label(assignment, "role_on_project", "start_date"), { currentState: assignment.active === false ? "ENDED" : "ACTIVE", startDate: assignment.start_date, endDate: assignment.end_date, knownUsage: { workEntries: workEntries.length, overtimeRequests: overtime.length }, historyPolicy: "The authoritative assignment RPC rechecks payroll allocations and snapshots before deletion or end-dating." }));
}

async function prepareSimpleLifecycle(context: AssistantToolContext, toolName: string, table: string, idKey: string, labelName: string, args: Record<string, unknown>) {
  const target = await row(context, table, String(args[idKey]), labelName, "*");
  return prepareAction(context, toolName, args, actionPreview(String(args.action), label(target, "name", "display_name", "code", "type", "effective_from"), { currentState: target.status || target.lifecycle_status || target.record_status || target.active, historyPolicy: "The authoritative lifecycle RPC rechecks current state and preserved history during confirmation." }));
}

async function prepareSourceLifecycle(context: AssistantToolContext, args: Record<string, unknown>) {
  const entityType = String(args.entityType).toUpperCase();
  const table = entityType === "WORK_ENTRY" ? "work_entries" : entityType === "ATTENDANCE" ? "attendance_records" : entityType === "LEAVE" ? "leave_requests" : "overtime_requests";
  const source = await row(context, table, String(args.entityId), entityType.replaceAll("_", " "), "*");
  return prepareAction(context, "prepare_workforce_source_lifecycle", args, actionPreview(String(args.action), label(source, "work_date", "attendance_date", "overtime_date", "description", "leave_type"), { entityType, currentStatus: source.status || source.record_status, historyPolicy: "Draft deletion and used-source correction are enforced by apply_workforce_source_lifecycle." }));
}

async function prepareEngineeringLifecycle(context: AssistantToolContext, toolName: string, table: string, idKey: string, previewRpc: string, labelName: string, args: Record<string, unknown>) {
  const target = await row(context, table, String(args[idKey]), labelName, "*");
  const preflight = record(await rpc(context, previewRpc, { [idKey === "documentId" ? "p_document_id" : idKey === "rfiId" ? "p_rfi_id" : idKey === "submittalId" ? "p_submittal_id" : "p_site_log_id"]: args[idKey] }));
  return prepareAction(context, toolName, args, actionPreview(String(args.action), label(target, "document_number", "rfi_number", "submittal_number", "report_number", "title", "subject", "site_date"), { preflight, historyPolicy: "Engineering revisions, responses, rounds, observations, and source files remain historical." }));
}

async function searchEngineeringDocuments(context: AssistantToolContext, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  let query = db(context).from("engineering_documents").select("id,project_id,document_number,title,discipline,status,current_revision_id,current_revision_number,created_at,updated_at").eq("company_id", context.auth.companyId).order("updated_at", { ascending: false }).limit(Number(args.limit || 20));
  if (args.projectId) query = query.eq("project_id", args.projectId);
  if (args.discipline) query = query.eq("discipline", args.discipline);
  if (args.status) query = query.eq("status", args.status);
  if (args.query) query = query.or(`document_number.ilike.%${String(args.query).replaceAll(",", " ")}%,title.ilike.%${String(args.query).replaceAll(",", " ")}%`);
  const result = await query;
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "Engineering documents could not be read safely.", 503);
  const records = (result.data || []) as Record<string, unknown>[];
  return toolOk({ count: records.length, records }, { references: records.slice(0, 10).map((item) => ({ type: "document" as const, id: String(item.id), label: `${item.document_number || "Document"} · ${item.title || "Untitled"}` })) });
}

async function getEngineeringDocument(context: AssistantToolContext, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const document = await row(context, "engineering_documents", String(args.documentId), "Engineering document", "*");
  const [revisions, annotations] = await Promise.all([
    rows(context, "engineering_document_revisions", (query) => query.eq("document_id", document.id).order("revision_number", { ascending: false }).limit(50), "Document revisions"),
    rows(context, "drawing_annotations", (query) => query.eq("document_id", document.id).order("created_at", { ascending: false }).limit(100), "Document annotations"),
  ]);
  const projectId = typeof document.project_id === "string" ? document.project_id : undefined;
  const documentView = { id: document.id, projectId, documentNumber: document.document_number, title: document.title, discipline: document.discipline, status: document.status, currentRevisionId: document.current_revision_id, currentRevisionNumber: document.current_revision_number, createdAt: document.created_at, updatedAt: document.updated_at };
  const revisionViews = revisions.map((revision) => ({ id: revision.id, documentId: revision.document_id, revisionNumber: revision.revision_number, revisionLabel: revision.revision_label, status: revision.status, fileName: revision.file_name, fileSizeBytes: revision.file_size_bytes, pageCount: revision.page_count, changeSummary: revision.change_summary, createdAt: revision.created_at }));
  const annotationViews = annotations.map((annotation) => ({ id: annotation.id, revisionId: annotation.revision_id, pageNumber: annotation.page_number, annotationType: annotation.annotation_type, status: annotation.status, content: annotation.content, measurementValue: annotation.measurement_value, measurementUnit: annotation.measurement_unit, createdAt: annotation.created_at, updatedAt: annotation.updated_at }));
  return toolOk({ document: documentView, revisions: revisionViews, annotations: annotationViews, history: "Revisions are immutable; annotations remain revision-scoped historical records. Private Storage paths and credentials are not returned." }, { references: [{ type: "document", id: String(document.id), label: label(document, "document_number", "title") }] });
}

async function getWorkerPayrollSetup(context: AssistantToolContext, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const worker = await row(context, "workers", String(args.workerId), "Worker", "id,employee_code,display_name,first_name,last_name,active,employment_status");
  const [profiles, components] = await Promise.all([
    rows(context, "worker_compensation_profiles", (query) => query.eq("worker_id", worker.id).order("effective_from", { ascending: false }).limit(50), "Compensation profiles"),
    rows(context, "recurring_payroll_components", (query) => query.eq("worker_id", worker.id).order("effective_from", { ascending: false }).limit(50), "Recurring payroll components"),
  ]);
  return toolOk({ worker, compensationProfiles: profiles, recurringComponents: components }, { references: [{ type: "worker", id: String(worker.id), label: label(worker, "employee_code", "display_name", "first_name", "last_name") }] });
}

export async function executeCoreHardeningTool(name: string, args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  switch (name) {
    case "prepare_project_lifecycle": return prepareProjectLifecycle(context, args);
    case "prepare_financial_correction": return prepareFinancialCorrection(context, args);
    case "prepare_worker_update": return prepareWorkerUpdate(context, args);
    case "prepare_worker_lifecycle": return prepareWorkerLifecycle(context, args);
    case "prepare_assignment_lifecycle": return prepareAssignmentLifecycle(context, args);
    case "prepare_compensation_profile_lifecycle": return prepareSimpleLifecycle(context, name, "worker_compensation_profiles", "profileId", "Compensation profile", args);
    case "prepare_recurring_component_lifecycle": return prepareSimpleLifecycle(context, name, "recurring_payroll_components", "componentId", "Recurring payroll component", args);
    case "prepare_workforce_source_lifecycle": return prepareSourceLifecycle(context, args);
    case "prepare_engineering_document_lifecycle": return prepareEngineeringLifecycle(context, name, "engineering_documents", "documentId", "preview_engineering_document_lifecycle", "Engineering document", args);
    case "prepare_rfi_lifecycle": return prepareEngineeringLifecycle(context, name, "engineering_rfis", "rfiId", "preview_engineering_rfi_lifecycle", "RFI", args);
    case "prepare_submittal_lifecycle": return prepareEngineeringLifecycle(context, name, "engineering_submittals", "submittalId", "preview_engineering_submittal_lifecycle", "Technical submittal", args);
    case "prepare_site_log_lifecycle": return prepareEngineeringLifecycle(context, name, "engineering_daily_site_logs", "siteLogId", "preview_engineering_daily_site_log_lifecycle", "Daily Site Log", args);
    case "prepare_site_log_addendum": {
      const target = await row(context, "engineering_daily_site_logs", String(args.siteLogId), "Daily Site Log", "id,project_id,report_number,site_date,status");
      return prepareAction(context, name, args, actionPreview("ADDENDUM", label(target, "report_number", "site_date"), { reason: args.reason, correctionText: args.correctionText, historyPolicy: "The original finalized Site Log remains unchanged." }));
    }
    case "search_engineering_documents": return searchEngineeringDocuments(context, args);
    case "get_engineering_document": return getEngineeringDocument(context, args);
    case "navigate_to_engineering_document": {
      const document = await row(context, "engineering_documents", String(args.documentId), "Engineering document", "id,project_id,document_number,title,current_revision_id");
      const revisionId = args.revisionId ? String(args.revisionId) : typeof document.current_revision_id === "string" ? document.current_revision_id : undefined;
      return toolOk({ documentId: document.id, projectId: document.project_id, revisionId }, { references: [{ type: "document", id: String(document.id), label: label(document, "document_number", "title") }], clientActions: [{ type: "OPEN_ENGINEERING_DOCUMENT", entityId: String(document.id), projectId: String(document.project_id), ...(revisionId ? { revisionId } : {}), label: "Open engineering document" }] });
    }
    case "get_worker_payroll_setup": return getWorkerPayrollSetup(context, args);
    default: throw new AssistantToolError("UNKNOWN_TOOL", "That hardening operation is not available.");
  }
}

function patchForWorkerUpdate(args: Record<string, unknown>, current: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  const mapping: Record<string, string> = {
    firstName: "first_name", middleName: "middle_name", lastName: "last_name", employeeCode: "employee_code", jobTitle: "job_title", department: "department", departmentId: "department_id",
    defaultPayType: "default_pay_type", defaultRate: "default_rate", defaultLaborContext: "default_labor_context", defaultProjectId: "default_project_id", workingDays: "working_days", workingHoursStart: "working_hours_start", workingHoursEnd: "working_hours_end", notes: "notes",
  };
  for (const [key, column] of Object.entries(mapping)) if (args[key] !== undefined) patch[column] = args[key] === "" ? null : args[key];
  const first = typeof args.firstName === "string" ? args.firstName.trim() : undefined;
  const last = typeof args.lastName === "string" ? args.lastName.trim() : undefined;
  if (first !== undefined || last !== undefined) {
    const currentFirst = stringValue(current.first_name).trim();
    const currentLast = stringValue(current.last_name).trim();
    patch.display_name = [first === undefined ? currentFirst : first, last === undefined ? currentLast : last].filter(Boolean).join(" ").trim();
  }
  patch.updated_at = new Date().toISOString();
  return patch;
}

async function executeWorkerUpdate(context: AssistantToolContext, args: Record<string, unknown>) {
  const current = await row(context, "workers", String(args.workerId), "Worker", "id,employee_code,display_name,first_name,last_name,updated_at");
  if (args.expectedUpdatedAt !== undefined && String(current.updated_at || "") !== String(args.expectedUpdatedAt || "")) throw new AssistantToolError("STALE_PREVIEW", "The worker changed after the preview. Prepare the update again.");
  const patch = patchForWorkerUpdate(args, current);
  const updated = await db(context).from("workers").update(patch).eq("id", String(args.workerId)).eq("company_id", context.auth.companyId).select("*").maybeSingle();
  if (updated.error || !updated.data) throw new AssistantToolError("DOMAIN_WRITE_REJECTED", "The worker update was rejected by the authoritative workforce rules.");
  return { operation: "worker_updated", entityType: "WORKER", entityId: String(updated.data.id), displayLabel: label(updated.data, "employee_code", "display_name", "first_name", "last_name"), record: updated.data };
}

function lifecycleResult(operation: string, entityType: string, id: string, raw: unknown, displayLabel?: string) {
  return { operation, entityType, entityId: id, displayLabel, ...record(raw) };
}

export async function executePreparedCoreHardeningAction(context: AssistantToolContext, toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (toolName) {
    case "prepare_project_lifecycle": return lifecycleResult("project_lifecycle_applied", "PROJECT", String(args.projectId), await rpc(context, "apply_project_lifecycle", { p_project_id: args.projectId, p_action: args.action, p_reason: args.reason || null }), String(args.projectId));
    case "prepare_financial_correction": {
      const expense = String(args.entityType).toUpperCase() === "EXPENSE";
      return lifecycleResult("financial_correction_applied", String(args.entityType).toUpperCase(), String(args.entityId), await rpc(context, expense ? "apply_expense_correction" : "apply_invoice_correction", { [expense ? "p_expense_id" : "p_invoice_id"]: args.entityId, p_action: args.action, p_reason: args.reason || null }));
    }
    case "prepare_worker_update": return executeWorkerUpdate(context, args);
    case "prepare_worker_lifecycle": return lifecycleResult("worker_lifecycle_applied", "WORKER", String(args.workerId), await rpc(context, "apply_worker_lifecycle", { p_worker_id: args.workerId, p_action: args.action, p_reason: args.reason || null }));
    case "prepare_assignment_lifecycle": return lifecycleResult("assignment_lifecycle_applied", "PROJECT_ASSIGNMENT", String(args.assignmentId), await rpc(context, "apply_project_worker_assignment_lifecycle", { p_assignment_id: args.assignmentId, p_action: args.action, p_end_date: args.effectiveDate || null, p_reason: args.reason || null }));
    case "prepare_compensation_profile_lifecycle": return lifecycleResult("compensation_profile_lifecycle_applied", "COMPENSATION_PROFILE", String(args.profileId), await rpc(context, "apply_compensation_profile_lifecycle", { p_profile_id: args.profileId, p_action: args.action, p_end_date: args.effectiveDate || null, p_reason: args.reason || null }));
    case "prepare_recurring_component_lifecycle": return lifecycleResult("recurring_component_lifecycle_applied", "RECURRING_COMPONENT", String(args.componentId), await rpc(context, "apply_recurring_component_lifecycle", { p_component_id: args.componentId, p_action: args.action, p_end_date: args.effectiveDate || null, p_reason: args.reason || null }));
    case "prepare_workforce_source_lifecycle": return lifecycleResult("workforce_source_lifecycle_applied", String(args.entityType).toUpperCase(), String(args.entityId), await rpc(context, "apply_workforce_source_lifecycle", { p_entity_type: args.entityType, p_entity_id: args.entityId, p_action: args.action, p_reason: args.reason || null }));
    case "prepare_engineering_document_lifecycle": return lifecycleResult("engineering_document_lifecycle_applied", "DOCUMENT", String(args.documentId), await rpc(context, "apply_engineering_document_lifecycle", { p_document_id: args.documentId, p_action: args.action, p_reason: args.reason || null }));
    case "prepare_rfi_lifecycle": return lifecycleResult("rfi_lifecycle_applied", "RFI", String(args.rfiId), await rpc(context, "apply_engineering_rfi_lifecycle", { p_rfi_id: args.rfiId, p_action: args.action, p_reason: args.reason || null }));
    case "prepare_submittal_lifecycle": return lifecycleResult("submittal_lifecycle_applied", "SUBMITTAL", String(args.submittalId), await rpc(context, "apply_engineering_submittal_lifecycle", { p_submittal_id: args.submittalId, p_action: args.action, p_reason: args.reason || null }));
    case "prepare_site_log_lifecycle": return lifecycleResult("site_log_lifecycle_applied", "SITE_LOG", String(args.siteLogId), await rpc(context, "apply_engineering_daily_site_log_lifecycle", { p_site_log_id: args.siteLogId, p_action: args.action, p_reason: args.reason || null }));
    case "prepare_site_log_addendum": return lifecycleResult("site_log_addendum_created", "SITE_LOG", String(args.siteLogId), await rpc(context, "create_engineering_daily_site_log_addendum", { p_site_log_id: args.siteLogId, p_reason: args.reason, p_correction_text: args.correctionText }));
    default: throw new AssistantToolError("NOT_MUTATION", "That operation is not a confirmable hardening mutation.");
  }
}
