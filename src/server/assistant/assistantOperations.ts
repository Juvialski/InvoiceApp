import { createHash } from "node:crypto";
import type { AssistantRiskTier } from "../../assistant/assistantTypes.ts";
import { BRAND } from "../../config/brand.ts";
import { findInternalTransferSuggestions } from "../../lib/cashBanking.ts";
import { normalizeAttendanceRecord } from "../../lib/payrollWorkforce.ts";
import { AssistantBackendError, AssistantToolError, type AssistantToolContext, type ToolExecutionResult } from "./assistantBackendTypes.ts";
import { boundedLimit, boundedText, enumValue, optionalDateOnly, optionalNumber, plainObject, requireDateOnly, requireUuid } from "./toolValidation.ts";
import { toolOk } from "./toolResults.ts";

type JsonSchema = Record<string, unknown>;
type PermissionResolver = string[] | ((args: Record<string, unknown>) => string[]);

export interface AssistantOperationToolDefinition {
  name: string;
  description: string;
  riskTier: AssistantRiskTier;
  permissions: PermissionResolver;
  parametersJsonSchema: JsonSchema;
  requiresConfirmation: boolean;
}

const uuid = { type: "string", description: `Identifier supplied by a prior ${BRAND.productName} tool result or current workspace context.` };
const date = { type: "string", description: "Calendar date in YYYY-MM-DD format." };
const reason = { type: "string", description: "Short reason retained with the audited operation." };
const lifecycle = (values: readonly string[]) => ({ type: "string", enum: values });

function schema(properties: Record<string, unknown>, required: string[] = []): JsonSchema {
  return { type: "object", properties, required, additionalProperties: false };
}

function read(name: string, description: string, permissions: PermissionResolver, properties: Record<string, unknown> = {}, required: string[] = []): AssistantOperationToolDefinition {
  return { name, description, permissions, riskTier: "READ", parametersJsonSchema: schema(properties, required), requiresConfirmation: false };
}

function prepare(name: string, description: string, permissions: PermissionResolver, properties: Record<string, unknown>, required: string[]): AssistantOperationToolDefinition {
  return { name, description, permissions, riskTier: "PREPARE", parametersJsonSchema: schema(properties, required), requiresConfirmation: true };
}

function bulkPrepare(name: string, description: string, permissions: PermissionResolver, properties: Record<string, unknown>, required: string[]): AssistantOperationToolDefinition {
  return { name, description, permissions, riskTier: "BULK_MUTATION", parametersJsonSchema: schema(properties, required), requiresConfirmation: true };
}

const assignmentSchema = {
  assignmentId: uuid,
  workerId: uuid,
  projectId: uuid,
  startDate: date,
  endDate: date,
  payType: { type: "string", enum: ["MONTHLY", "DAILY", "HOURLY"] },
  rate: { type: "number", minimum: 0, maximum: 1000000000 },
  roleOnProject: { type: "string" },
  active: { type: "boolean" },
  notes: { type: "string" },
};

const compensationSchema = {
  profileId: uuid,
  workerId: uuid,
  effectiveFrom: date,
  effectiveTo: date,
  frequency: { type: "string", enum: ["MONTHLY", "DAILY", "HOURLY"] },
  rate: { type: "number", minimum: 0, maximum: 1000000000 },
  defaultLaborContext: { type: "string", enum: ["PROJECT", "ADMIN_OFFICE", "GENERAL_OVERHEAD", "UNALLOCATED_REVIEW"] },
  defaultProjectId: uuid,
  active: { type: "boolean" },
};

const componentSchema = {
  componentId: uuid,
  workerId: uuid,
  type: { type: "string", enum: ["EARNING", "DEDUCTION", "EMPLOYER_COST"] },
  code: { type: "string" },
  name: { type: "string" },
  amount: { type: "number", minimum: 0, maximum: 1000000000 },
  rate: { type: "number", minimum: 0, maximum: 100 },
  effectiveFrom: date,
  effectiveTo: date,
  active: { type: "boolean" },
};

const workEntrySchema = {
  entryId: uuid,
  workerId: uuid,
  projectId: uuid,
  laborContext: { type: "string", enum: ["PROJECT", "ADMIN_OFFICE", "GENERAL_OVERHEAD", "UNALLOCATED_REVIEW"] },
  periodId: uuid,
  workDate: date,
  regularHours: { type: "number", minimum: 0, maximum: 744 },
  overtimeHours: { type: "number", minimum: 0, maximum: 744 },
  daysWorked: { type: "number", minimum: 0, maximum: 31 },
  rate: { type: "number", minimum: 0, maximum: 1000000000 },
  overtimeRate: { type: "number", minimum: 0, maximum: 1000000000 },
  description: { type: "string" },
  notes: { type: "string" },
  status: { type: "string", enum: ["DRAFT", "APPROVED", "VOID"] },
};

const projectUpdateSchema = {
  projectId: uuid,
  projectCode: { type: "string" },
  projectName: { type: "string" },
  description: { type: "string" },
  clientName: { type: "string" },
  clientReference: { type: "string" },
  location: { type: "string" },
  siteAddress: { type: "string" },
  projectManager: { type: "string" },
  startDate: date,
  targetEndDate: date,
  actualEndDate: date,
  contractValue: { type: "number", minimum: 0, maximum: 1000000000 },
  projectBudget: { type: "number", minimum: 0, maximum: 1000000000 },
  currency: { type: "string" },
  notes: { type: "string" },
};

const attendanceUpdateSchema = {
  attendanceId: uuid,
  attendanceStatus: { type: "string", enum: ["PRESENT", "ABSENT", "PARTIAL", "ON_LEAVE", "REST_DAY", "HOLIDAY", "OFFICIAL_BUSINESS"] },
  actualTimeIn: { type: "string" },
  actualTimeOut: { type: "string" },
  notes: { type: "string" },
};

const statementRowSchema = {
  transactionDate: date,
  postedAt: { type: "string" },
  referenceNumber: { type: "string" },
  description: { type: "string" },
  direction: { type: "string", enum: ["CREDIT", "DEBIT"] },
  amount: { type: "number", minimum: 0.01, maximum: 1000000000 },
  currency: { type: "string" },
  runningBalance: { type: "number" },
};

export const ASSISTANT_OPERATION_TOOL_DEFINITIONS: readonly AssistantOperationToolDefinition[] = Object.freeze([
  read("search_work_entries", "Search company time and labor source entries by worker, project, period, date, or status.", ["payroll.detail.read"], { workerId: uuid, projectId: uuid, periodId: uuid, from: date, to: date, status: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } }),
  read("list_internal_transfer_suggestions", "List deterministic same-currency opposite transaction pairs that the Cash & Banking reconciliation workspace can review as possible internal transfers.", ["cash.reconcile"], { limit: { type: "integer", minimum: 1, maximum: 20 } }),
  prepare("prepare_reopen_invoice_review", "Prepare reopening an invoice for human review. This does not verify the invoice, change financial totals, or replace the original extraction evidence.", ["invoices.read", "invoices.manage", "invoices.verify"], { invoiceId: uuid, reason: { type: "string" } }, ["invoiceId"]),
  prepare("prepare_update_project", "Prepare a metadata correction to an existing project without changing its archive or lifecycle state.", ["projects.manage"], projectUpdateSchema, ["projectId"]),
  prepare("prepare_update_attendance", "Prepare a correction to an existing attendance record using the same deterministic time/status normalization as the attendance workspace.", ["payroll.manage"], attendanceUpdateSchema, ["attendanceId"]),
  prepare("prepare_save_project_assignment", "Prepare creation or editing of a project worker assignment. Database lifecycle guards reject rewrites of used assignment identity or archived-project activity.", ["workers.manage"], assignmentSchema, ["workerId", "projectId", "startDate"]),
  prepare("prepare_save_compensation_profile", "Prepare an effective-dated worker compensation profile through the same guarded payroll setup RPC as the deterministic UI.", ["workers.manage"], compensationSchema, ["workerId", "effectiveFrom", "frequency", "rate", "defaultLaborContext"]),
  prepare("prepare_save_recurring_component", "Prepare creation or editing of a recurring payroll component with effective dates and lifecycle guards.", ["workers.manage"], componentSchema, ["workerId", "type", "effectiveFrom"]),
  prepare("prepare_save_work_entry", "Prepare creation or editing of an open-period work entry using the existing company-scoped workforce source contract.", ["payroll.manage"], workEntrySchema, ["workerId", "periodId", "workDate", "rate"]),
  prepare("prepare_financial_account", "Prepare creation or descriptive correction of a Cash & Banking account through the guarded account RPC.", ["cash.accounts.manage"], { accountId: uuid, accountType: { type: "string", enum: ["BANK", "EWALLET", "CASH"] }, institutionCode: { type: "string" }, institutionName: { type: "string" }, displayName: { type: "string" }, maskedIdentifier: { type: "string" }, currency: { type: "string" }, openingBalance: { type: "number" }, openingBalanceDate: date, connectionType: { type: "string", enum: ["MANUAL", "STATEMENT", "PROVIDER"] }, provider: { type: "string" }, providerAccountId: { type: "string" } }, ["accountType", "institutionName", "displayName", "currency", "openingBalance", "openingBalanceDate", "connectionType"]),
  prepare("prepare_financial_account_lifecycle", "Prepare deactivation or reactivation of a Cash & Banking account while preserving its financial history.", ["cash.accounts.manage"], { accountId: uuid, action: lifecycle(["DEACTIVATE", "REACTIVATE"]), reason }, ["accountId", "action", "reason"]),
  prepare("prepare_financial_snapshot", "Prepare recording one manual Cash & Banking balance snapshot. It is labeled Manual and never represents a live provider balance.", ["cash.accounts.manage"], { snapshotId: uuid, accountId: uuid, availableBalance: { type: "number", minimum: -1000000000, maximum: 1000000000 }, pendingBalance: { type: "number", minimum: 0, maximum: 1000000000 } }, ["accountId", "availableBalance"]),
  prepare("prepare_financial_transaction", "Prepare a manual Cash & Banking transaction through the guarded transaction RPC. Imported/provider rows are not created by this operation.", ["cash.transactions.manage"], { transactionId: uuid, accountId: uuid, transactionDate: date, postedAt: { type: "string" }, referenceNumber: { type: "string" }, description: { type: "string" }, direction: { type: "string", enum: ["CREDIT", "DEBIT"] }, amount: { type: "number", minimum: 0.01, maximum: 1000000000 }, currency: { type: "string" } }, ["accountId", "transactionDate", "description", "direction", "amount", "currency"]),
  prepare("prepare_financial_transaction_correction", "Prepare correction of an uncommitted unreconciled manual transaction. Used or imported evidence must be reversed instead.", ["cash.transactions.manage"], { transactionId: uuid, transactionDate: date, referenceNumber: { type: "string" }, description: { type: "string" }, direction: { type: "string", enum: ["CREDIT", "DEBIT"] }, amount: { type: "number", minimum: 0.01, maximum: 1000000000 }, reason }, ["transactionId", "transactionDate", "description", "direction", "amount", "reason"]),
  prepare("prepare_financial_transaction_lifecycle", "Prepare reversal, Ignore, or return-to-review for a Cash & Banking transaction using the guarded financial lifecycle RPC.", (args) => [String(args.action).toUpperCase() === "REVERSE" ? "cash.transactions.manage" : "cash.reconcile"], { transactionId: uuid, action: lifecycle(["REVERSE", "IGNORE", "RETURN_TO_REVIEW"]), reason }, ["transactionId", "action", "reason"]),
  bulkPrepare("prepare_import_cash_statement", "Prepare a validated CSV/XLSX cash statement import from structured rows. Confirmation is required before the existing atomic import RPC commits any batch or transactions.", ["cash.import"], { accountId: uuid, sourceType: { type: "string", enum: ["CSV", "XLSX"] }, fileName: { type: "string" }, fileFingerprint: { type: "string" }, statementFrom: date, statementTo: date, openingBalance: { type: "number" }, closingBalance: { type: "number" }, rows: { type: "array", minItems: 1, maxItems: 500, items: { type: "object", properties: statementRowSchema, required: ["transactionDate", "description", "direction", "amount", "currency"], additionalProperties: false } } }, ["accountId", "sourceType", "fileName", "rows"]),
  prepare("prepare_internal_transfer", "Prepare confirmation of an exact opposite same-currency internal transfer pair. Confirmation is required before both relationship rows are written.", ["cash.reconcile"], { leftTransactionId: uuid, rightTransactionId: uuid, matchedAmount: { type: "number", minimum: 0.01, maximum: 1000000000 }, transferGroupId: uuid }, ["leftTransactionId", "rightTransactionId", "matchedAmount"]),
  prepare("prepare_internal_transfer_reversal", "Prepare reversal of an exact confirmed internal transfer pair while retaining both ledger transactions and transfer history.", ["cash.reconcile"], { transferGroupId: uuid, leftTransactionId: uuid, rightTransactionId: uuid, reason }, ["transferGroupId", "leftTransactionId", "rightTransactionId", "reason"]),
  prepare("prepare_update_company_profile", "Prepare an update to the fixed deployment company's display name, default currency, and timezone. Company identity and company_id cannot change.", ["company.settings.manage"], { name: { type: "string" }, defaultCurrency: { type: "string" }, timezone: { type: "string" } }, ["name", "defaultCurrency", "timezone"]),
  read("get_company_access_summary", "Return the current deployment company's member, pending-access, and assignable-permission summary for an authorized access administrator or reader.", ["company.members.read|company.members.manage"]),
  prepare("prepare_authorize_company_member", "Prepare a company-bound email access authorization with an assignable role and optional permission overrides. It does not claim or create a user account.", ["company.members.manage"], { email: { type: "string" }, roleKey: { type: "string", enum: ["COMPANY_ADMIN", "FINANCE", "PAYROLL", "VIEWER"] }, expiresAt: { type: "string" }, permissionOverrides: { type: "array", maxItems: 80, items: { type: "object", properties: { permissionKey: { type: "string" }, effect: { type: "string", enum: ["GRANT", "DENY"] } }, required: ["permissionKey", "effect"], additionalProperties: false } } }, ["email", "roleKey"]),
  prepare("prepare_update_company_member", "Prepare a role or membership-status update for another company member. The database protects self-access and last-authority safeguards.", ["company.members.manage"], { membershipId: uuid, roleKey: { type: "string", enum: ["COMPANY_ADMIN", "FINANCE", "PAYROLL", "VIEWER"] }, status: { type: "string", enum: ["ACTIVE", "SUSPENDED", "REVOKED"] } }, ["membershipId"]),
  prepare("prepare_update_member_permissions", "Prepare replacement of another member's explicit GRANT/DENY overrides using the company permission catalog.", ["company.members.manage"], { membershipId: uuid, permissionOverrides: { type: "array", maxItems: 80, items: { type: "object", properties: { permissionKey: { type: "string" }, effect: { type: "string", enum: ["GRANT", "DENY"] } }, required: ["permissionKey", "effect"], additionalProperties: false } } }, ["membershipId", "permissionOverrides"]),
  prepare("prepare_revoke_company_invitation", "Prepare revocation of a pending company email access authorization. The database decides whether it is still revocable.", ["company.members.manage"], { invitationId: uuid }, ["invitationId"]),
]);

const TOOL_NAMES = new Set(ASSISTANT_OPERATION_TOOL_DEFINITIONS.map((definition) => definition.name));
const ASSIGNMENT_PAY_TYPES = ["MONTHLY", "DAILY", "HOURLY"] as const;
const LABOR_CONTEXTS = ["PROJECT", "ADMIN_OFFICE", "GENERAL_OVERHEAD", "UNALLOCATED_REVIEW"] as const;
const COMPONENT_TYPES = ["EARNING", "DEDUCTION", "EMPLOYER_COST"] as const;
const SOURCE_STATUSES = ["DRAFT", "APPROVED", "VOID"] as const;
const ACCOUNT_TYPES = ["BANK", "EWALLET", "CASH"] as const;
const CONNECTION_TYPES = ["MANUAL", "STATEMENT", "PROVIDER"] as const;
const TRANSACTION_DIRECTIONS = ["CREDIT", "DEBIT"] as const;
const MEMBER_ROLES = ["COMPANY_ADMIN", "FINANCE", "PAYROLL", "VIEWER"] as const;
const MEMBER_STATUSES = ["ACTIVE", "SUSPENDED", "REVOKED"] as const;

export function isAssistantOperationTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

function optionalUuid(value: unknown, label: string) {
  return value === undefined || value === null || value === "" ? undefined : requireUuid(value, label);
}

function deterministicUuid(seed: unknown) {
  const hex = createHash("sha256").update(typeof seed === "string" ? seed : JSON.stringify(seed)).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16] || "8", 16) % 4]!;
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function requiredMoney(value: unknown, label: string) {
  const parsed = optionalNumber(value, label, { min: 0.01, max: 1_000_000_000 });
  if (parsed === undefined) throw new AssistantToolError("INVALID_NUMBER", `${label} is required.`);
  return Math.round(parsed * 100) / 100;
}

function normalizedOverrides(value: unknown, label = "permissionOverrides") {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 80) throw new AssistantToolError("INVALID_ARGUMENT", `${label} must contain at most 80 entries.`);
  const seen = new Set<string>();
  return value.map((item, index) => {
    const override = plainObject(item, `${label}[${index}]`);
    const permissionKey = boundedText(override.permissionKey, `${label}[${index}].permissionKey`, 120)!.toLowerCase();
    const effect = enumValue(override.effect, `${label}[${index}].effect`, ["GRANT", "DENY"] as const)!;
    if (seen.has(permissionKey)) throw new AssistantToolError("INVALID_ARGUMENT", `${label} cannot contain the same permission twice.`);
    seen.add(permissionKey);
    return { permission_key: permissionKey, effect };
  });
}

function email(value: unknown) {
  const normalized = boundedText(value, "email", 320)!.toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new AssistantToolError("INVALID_ARGUMENT", "email must be a valid access-authorization address.");
  return normalized;
}

function normalizeDate(value: unknown, label: string, required = true) {
  return required ? requireDateOnly(value, label) : optionalDateOnly(value, label);
}

function nullableText(value: unknown, label: string, max: number, required = false) {
  if (value === undefined) return undefined;
  if (value === null) {
    if (required) throw new AssistantToolError("INVALID_ARGUMENT", `${label} is required.`);
    return null;
  }
  if (typeof value !== "string") throw new AssistantToolError("INVALID_ARGUMENT", `${label} must be text.`);
  const normalized = value.trim();
  if (required && !normalized) throw new AssistantToolError("INVALID_ARGUMENT", `${label} is required.`);
  if (normalized.length > max) throw new AssistantToolError("ARGUMENT_TOO_LARGE", `${label} is too long.`);
  return normalized || null;
}

function nullableDate(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return requireDateOnly(value, label);
}

function normalizeCurrency(value: unknown, label = "currency") {
  const normalized = boundedText(value, label, 3)!.toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new AssistantToolError("INVALID_ARGUMENT", `${label} must be a three-letter currency code.`);
  return normalized;
}

function normalizeProjectUpdate(args: Record<string, unknown>) {
  const projectId = requireUuid(args.projectId, "projectId");
  const fields: Record<string, unknown> = {};
  const textFields: Array<[string, number, boolean]> = [
    ["projectCode", 80, true], ["projectName", 200, true], ["description", 2000, false], ["clientName", 200, false],
    ["clientReference", 200, false], ["location", 240, false], ["siteAddress", 500, false], ["projectManager", 200, false], ["notes", 2000, false],
  ];
  for (const [key, max, required] of textFields) if (args[key] !== undefined) fields[key] = nullableText(args[key], key, max, required);
  for (const key of ["startDate", "targetEndDate", "actualEndDate"]) if (args[key] !== undefined) fields[key] = nullableDate(args[key], key);
  for (const key of ["contractValue", "projectBudget"]) if (args[key] !== undefined) fields[key] = optionalNumber(args[key], key, { min: 0, max: 1_000_000_000 });
  if (args.currency !== undefined) fields.currency = normalizeCurrency(args.currency);
  const startDate = typeof fields.startDate === "string" ? fields.startDate : undefined;
  const targetEndDate = typeof fields.targetEndDate === "string" ? fields.targetEndDate : undefined;
  if (startDate && targetEndDate && targetEndDate < startDate) throw new AssistantToolError("INVALID_DATE_RANGE", "targetEndDate cannot be before startDate.");
  if (!Object.keys(fields).length) throw new AssistantToolError("NO_CHANGES", "Provide at least one project field to update.");
  return { projectId, ...fields, ...(args.expectedUpdatedAt !== undefined ? { expectedUpdatedAt: boundedText(args.expectedUpdatedAt, "expectedUpdatedAt", 80, false) } : {}) };
}

function normalizeAttendanceUpdate(args: Record<string, unknown>) {
  const attendanceId = requireUuid(args.attendanceId, "attendanceId");
  const fields: Record<string, unknown> = { attendanceId };
  if (args.attendanceStatus !== undefined) fields.attendanceStatus = enumValue(args.attendanceStatus, "attendanceStatus", ["PRESENT", "ABSENT", "PARTIAL", "ON_LEAVE", "REST_DAY", "HOLIDAY", "OFFICIAL_BUSINESS"] as const);
  if (args.actualTimeIn !== undefined) fields.actualTimeIn = nullableText(args.actualTimeIn, "actualTimeIn", 40, false);
  if (args.actualTimeOut !== undefined) fields.actualTimeOut = nullableText(args.actualTimeOut, "actualTimeOut", 40, false);
  if (args.notes !== undefined) fields.notes = nullableText(args.notes, "notes", 500, false);
  if (Object.keys(fields).length === 1) throw new AssistantToolError("NO_CHANGES", "Provide an attendance status, clock time, or note to correct.");
  return { ...fields, ...(args.expectedUpdatedAt !== undefined ? { expectedUpdatedAt: boundedText(args.expectedUpdatedAt, "expectedUpdatedAt", 80, false) } : {}) };
}

function normalizeAssignment(args: Record<string, unknown>) {
  const assignmentId = optionalUuid(args.assignmentId, "assignmentId") || deterministicUuid({ operation: "assignment", workerId: args.workerId, projectId: args.projectId, startDate: args.startDate });
  const workerId = requireUuid(args.workerId, "workerId");
  const projectId = requireUuid(args.projectId, "projectId");
  const startDate = normalizeDate(args.startDate, "startDate")!;
  const endDate = normalizeDate(args.endDate, "endDate", false);
  if (endDate && endDate < startDate) throw new AssistantToolError("INVALID_DATE_RANGE", "endDate cannot be before startDate.");
  const rate = args.rate === undefined ? undefined : requiredMoney(args.rate, "rate");
  return { assignmentId, workerId, projectId, startDate, endDate, payType: enumValue(args.payType, "payType", ASSIGNMENT_PAY_TYPES, false), rate, roleOnProject: boundedText(args.roleOnProject, "roleOnProject", 240, false), active: args.active === undefined ? true : args.active === true, notes: boundedText(args.notes, "notes", 2000, false) };
}

function normalizeCompensation(args: Record<string, unknown>) {
  const profileId = optionalUuid(args.profileId, "profileId") || deterministicUuid({ operation: "compensation", workerId: args.workerId, effectiveFrom: args.effectiveFrom, frequency: args.frequency, rate: args.rate });
  const effectiveFrom = normalizeDate(args.effectiveFrom, "effectiveFrom")!;
  const effectiveTo = normalizeDate(args.effectiveTo, "effectiveTo", false);
  if (effectiveTo && effectiveTo < effectiveFrom) throw new AssistantToolError("INVALID_DATE_RANGE", "effectiveTo cannot be before effectiveFrom.");
  const defaultLaborContext = enumValue(args.defaultLaborContext, "defaultLaborContext", LABOR_CONTEXTS)!;
  const defaultProjectId = optionalUuid(args.defaultProjectId, "defaultProjectId");
  if (defaultLaborContext !== "PROJECT" && defaultProjectId) throw new AssistantToolError("INVALID_ARGUMENT", "Only PROJECT compensation can reference a default project.");
  return { profileId, workerId: requireUuid(args.workerId, "workerId"), effectiveFrom, effectiveTo, frequency: enumValue(args.frequency, "frequency", ASSIGNMENT_PAY_TYPES)!, rate: requiredMoney(args.rate, "rate"), defaultLaborContext, defaultProjectId, active: args.active === undefined ? true : args.active === true };
}

function normalizeComponent(args: Record<string, unknown>) {
  const componentId = optionalUuid(args.componentId, "componentId") || deterministicUuid({ operation: "component", workerId: args.workerId, type: args.type, effectiveFrom: args.effectiveFrom, code: args.code });
  const effectiveFrom = normalizeDate(args.effectiveFrom, "effectiveFrom")!;
  const effectiveTo = normalizeDate(args.effectiveTo, "effectiveTo", false);
  if (effectiveTo && effectiveTo < effectiveFrom) throw new AssistantToolError("INVALID_DATE_RANGE", "effectiveTo cannot be before effectiveFrom.");
  const amount = args.amount === undefined ? undefined : requiredMoney(args.amount, "amount");
  const rate = args.rate === undefined ? undefined : optionalNumber(args.rate, "rate", { min: 0, max: 100 });
  if (amount === undefined && rate === undefined) throw new AssistantToolError("INVALID_ARGUMENT", "A recurring component needs an amount or rate.");
  return { componentId, workerId: requireUuid(args.workerId, "workerId"), type: enumValue(args.type, "type", COMPONENT_TYPES)!, code: boundedText(args.code, "code", 120, false), name: boundedText(args.name, "name", 240, false), amount, rate, effectiveFrom, effectiveTo, active: args.active === undefined ? true : args.active === true };
}

function normalizeWorkEntry(args: Record<string, unknown>) {
  const entryId = optionalUuid(args.entryId, "entryId") || deterministicUuid({ operation: "work-entry", workerId: args.workerId, periodId: args.periodId, workDate: args.workDate, projectId: args.projectId });
  const laborContext = enumValue(args.laborContext || (args.projectId ? "PROJECT" : "UNALLOCATED_REVIEW"), "laborContext", LABOR_CONTEXTS)!;
  const projectId = optionalUuid(args.projectId, "projectId");
  if (laborContext === "PROJECT" && !projectId) throw new AssistantToolError("INVALID_ARGUMENT", "PROJECT work entries require a project.");
  if (laborContext !== "PROJECT" && projectId) throw new AssistantToolError("INVALID_ARGUMENT", "Non-project work entries cannot reference a project.");
  return {
    entryId, workerId: requireUuid(args.workerId, "workerId"), projectId, laborContext, periodId: requireUuid(args.periodId, "periodId"), workDate: normalizeDate(args.workDate, "workDate")!,
    regularHours: args.regularHours === undefined ? 0 : optionalNumber(args.regularHours, "regularHours", { min: 0, max: 744 }), overtimeHours: args.overtimeHours === undefined ? 0 : optionalNumber(args.overtimeHours, "overtimeHours", { min: 0, max: 744 }), daysWorked: args.daysWorked === undefined ? 0 : optionalNumber(args.daysWorked, "daysWorked", { min: 0, max: 31 }), rate: requiredMoney(args.rate, "rate"), overtimeRate: args.overtimeRate === undefined ? undefined : optionalNumber(args.overtimeRate, "overtimeRate", { min: 0, max: 1_000_000_000 }), description: boundedText(args.description, "description", 500, false), notes: boundedText(args.notes, "notes", 2000, false), status: enumValue(args.status || "DRAFT", "status", SOURCE_STATUSES)!,
  };
}

function normalizeStatementRows(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) throw new AssistantToolError("INVALID_ARGUMENT", "rows must contain between one and 500 statement rows.");
  return value.map((item, index) => {
    const row = plainObject(item, `rows[${index}]`);
    const transactionDate = requireDateOnly(row.transactionDate, `rows[${index}].transactionDate`);
    const direction = enumValue(row.direction, `rows[${index}].direction`, TRANSACTION_DIRECTIONS)!;
    const amount = requiredMoney(row.amount, `rows[${index}].amount`);
    const currency = boundedText(row.currency, `rows[${index}].currency`, 3)!.toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new AssistantToolError("INVALID_ARGUMENT", `rows[${index}].currency must be a three-letter currency code.`);
    const runningBalance = row.runningBalance === undefined ? undefined : Number(row.runningBalance);
    if (runningBalance !== undefined && !Number.isFinite(runningBalance)) throw new AssistantToolError("INVALID_NUMBER", `rows[${index}].runningBalance must be numeric.`);
    return { transactionDate, postedAt: boundedText(row.postedAt, `rows[${index}].postedAt`, 80, false), referenceNumber: boundedText(row.referenceNumber, `rows[${index}].referenceNumber`, 160, false), description: boundedText(row.description, `rows[${index}].description`, 500)!, direction, amount, currency, runningBalance, sourceFingerprint: boundedText(row.sourceFingerprint, `rows[${index}].sourceFingerprint`, 256, false) };
  });
}

function normalizeOverridesForTool(args: Record<string, unknown>) {
  return normalizedOverrides(args.permissionOverrides);
}

export function validateAssistantOperationArguments(toolName: string, input: unknown): Record<string, unknown> {
  const args = plainObject(input);
  switch (toolName) {
    case "search_work_entries": return { workerId: optionalUuid(args.workerId, "workerId"), projectId: optionalUuid(args.projectId, "projectId"), periodId: optionalUuid(args.periodId, "periodId"), from: normalizeDate(args.from, "from", false), to: normalizeDate(args.to, "to", false), status: boundedText(args.status, "status", 40, false), limit: boundedLimit(args.limit) };
    case "list_internal_transfer_suggestions": return { limit: boundedLimit(args.limit, 10) };
    case "prepare_reopen_invoice_review": return { invoiceId: requireUuid(args.invoiceId, "invoiceId"), reason: boundedText(args.reason, "reason", 500, false) };
    case "prepare_update_project": return normalizeProjectUpdate(args);
    case "prepare_update_attendance": return normalizeAttendanceUpdate(args);
    case "prepare_save_project_assignment": return normalizeAssignment(args);
    case "prepare_save_compensation_profile": return normalizeCompensation(args);
    case "prepare_save_recurring_component": return normalizeComponent(args);
    case "prepare_save_work_entry": return normalizeWorkEntry(args);
    case "prepare_financial_account": {
      const currency = boundedText(args.currency, "currency", 3)!.toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) throw new AssistantToolError("INVALID_ARGUMENT", "currency must be a three-letter currency code.");
      const openingBalance = args.openingBalance === undefined ? 0 : Number(args.openingBalance);
      if (!Number.isFinite(openingBalance)) throw new AssistantToolError("INVALID_NUMBER", "openingBalance must be numeric.");
      return { accountId: optionalUuid(args.accountId, "accountId") || deterministicUuid({ operation: "financial-account", accountType: args.accountType, institutionName: args.institutionName, displayName: args.displayName, currency, openingBalanceDate: args.openingBalanceDate }), accountType: enumValue(args.accountType, "accountType", ACCOUNT_TYPES)!, institutionCode: boundedText(args.institutionCode, "institutionCode", 80, false), institutionName: boundedText(args.institutionName, "institutionName", 160)!, displayName: boundedText(args.displayName, "displayName", 160)!, maskedIdentifier: boundedText(args.maskedIdentifier, "maskedIdentifier", 80, false), currency, openingBalance, openingBalanceDate: requireDateOnly(args.openingBalanceDate, "openingBalanceDate"), connectionType: enumValue(args.connectionType, "connectionType", CONNECTION_TYPES)!, provider: boundedText(args.provider, "provider", 120, false), providerAccountId: boundedText(args.providerAccountId, "providerAccountId", 240, false) };
    }
    case "prepare_financial_account_lifecycle": return { accountId: requireUuid(args.accountId, "accountId"), action: enumValue(args.action, "action", ["DEACTIVATE", "REACTIVATE"] as const)!, reason: boundedText(args.reason, "reason", 500)! };
    case "prepare_financial_snapshot": {
      const availableBalance = optionalNumber(args.availableBalance, "availableBalance", { min: -1_000_000_000, max: 1_000_000_000 });
      if (availableBalance === undefined) throw new AssistantToolError("INVALID_NUMBER", "availableBalance is required.");
      return { snapshotId: optionalUuid(args.snapshotId, "snapshotId") || deterministicUuid({ operation: "financial-snapshot", accountId: args.accountId, availableBalance, pendingBalance: args.pendingBalance }), accountId: requireUuid(args.accountId, "accountId"), availableBalance, pendingBalance: optionalNumber(args.pendingBalance, "pendingBalance", { min: 0, max: 1_000_000_000 }) };
    }
    case "prepare_financial_transaction": {
      const accountId = requireUuid(args.accountId, "accountId");
      const transactionDate = requireDateOnly(args.transactionDate, "transactionDate");
      const description = boundedText(args.description, "description", 500)!;
      const direction = enumValue(args.direction, "direction", TRANSACTION_DIRECTIONS)!;
      const amount = requiredMoney(args.amount, "amount");
      const currency = boundedText(args.currency, "currency", 3)!.toUpperCase();
      const seed = { operation: "financial-transaction", accountId, transactionDate, description, direction, amount, currency, referenceNumber: args.referenceNumber || null };
      const fingerprint = createHash("sha256").update(JSON.stringify(seed)).digest("hex");
      return { transactionId: optionalUuid(args.transactionId, "transactionId") || deterministicUuid(seed), accountId, transactionDate, postedAt: boundedText(args.postedAt, "postedAt", 80, false), referenceNumber: boundedText(args.referenceNumber, "referenceNumber", 160, false), description, direction, amount, currency, sourceFingerprint: `assistant-${fingerprint}` };
    }
    case "prepare_financial_transaction_correction": return { transactionId: requireUuid(args.transactionId, "transactionId"), transactionDate: requireDateOnly(args.transactionDate, "transactionDate"), referenceNumber: boundedText(args.referenceNumber, "referenceNumber", 160, false), description: boundedText(args.description, "description", 500)!, direction: enumValue(args.direction, "direction", TRANSACTION_DIRECTIONS)!, amount: requiredMoney(args.amount, "amount"), reason: boundedText(args.reason, "reason", 500)! };
    case "prepare_financial_transaction_lifecycle": return { transactionId: requireUuid(args.transactionId, "transactionId"), action: enumValue(args.action, "action", ["REVERSE", "IGNORE", "RETURN_TO_REVIEW"] as const)!, reason: boundedText(args.reason, "reason", 500)! };
    case "prepare_import_cash_statement": {
      const rows = normalizeStatementRows(args.rows);
      const fileName = boundedText(args.fileName, "fileName", 180)!;
      const sourceType = enumValue(args.sourceType, "sourceType", ["CSV", "XLSX"] as const)!;
      const providedFingerprint = boundedText(args.fileFingerprint, "fileFingerprint", 256, false);
      const fileFingerprint = providedFingerprint || createHash("sha256").update(JSON.stringify({ fileName, rows })).digest("hex");
      if (fileFingerprint.length < 8) throw new AssistantToolError("INVALID_ARGUMENT", "fileFingerprint must contain at least eight characters.");
      const statementFrom = normalizeDate(args.statementFrom, "statementFrom", false);
      const statementTo = normalizeDate(args.statementTo, "statementTo", false);
      if (statementFrom && statementTo && statementFrom > statementTo) throw new AssistantToolError("INVALID_DATE_RANGE", "statementFrom cannot be after statementTo.");
      const currencies = new Set(rows.map((row) => row.currency));
      if (currencies.size !== 1) throw new AssistantToolError("CURRENCY_MISMATCH", "All imported statement rows must use one account currency.");
      const openingBalance = args.openingBalance === undefined ? undefined : Number(args.openingBalance);
      const closingBalance = args.closingBalance === undefined ? undefined : Number(args.closingBalance);
      if ((openingBalance !== undefined && !Number.isFinite(openingBalance)) || (closingBalance !== undefined && !Number.isFinite(closingBalance))) throw new AssistantToolError("INVALID_NUMBER", "Statement balances must be numeric.");
      return { accountId: requireUuid(args.accountId, "accountId"), sourceType, fileName, fileFingerprint, statementFrom, statementTo, openingBalance, closingBalance, rows };
    }
    case "prepare_internal_transfer": { const leftTransactionId = requireUuid(args.leftTransactionId, "leftTransactionId"); const rightTransactionId = requireUuid(args.rightTransactionId, "rightTransactionId"); const matchedAmount = requiredMoney(args.matchedAmount, "matchedAmount"); return { leftTransactionId, rightTransactionId, matchedAmount, transferGroupId: optionalUuid(args.transferGroupId, "transferGroupId") || deterministicUuid({ operation: "internal-transfer", leftTransactionId, rightTransactionId, matchedAmount }) }; }
    case "prepare_internal_transfer_reversal": return { transferGroupId: requireUuid(args.transferGroupId, "transferGroupId"), leftTransactionId: requireUuid(args.leftTransactionId, "leftTransactionId"), rightTransactionId: requireUuid(args.rightTransactionId, "rightTransactionId"), reason: boundedText(args.reason, "reason", 500)! };
    case "prepare_update_company_profile": return { name: boundedText(args.name, "name", 160)!, defaultCurrency: boundedText(args.defaultCurrency, "defaultCurrency", 3)!.toUpperCase(), timezone: boundedText(args.timezone, "timezone", 80)! };
    case "get_company_access_summary": return {};
    case "prepare_authorize_company_member": return { email: email(args.email), roleKey: enumValue(args.roleKey, "roleKey", MEMBER_ROLES)!, expiresAt: boundedText(args.expiresAt, "expiresAt", 80, false), permissionOverrides: normalizeOverridesForTool(args) };
    case "prepare_update_company_member": {
      const membershipId = requireUuid(args.membershipId, "membershipId");
      const roleKey = args.roleKey === undefined ? undefined : enumValue(args.roleKey, "roleKey", MEMBER_ROLES);
      const status = args.status === undefined ? undefined : enumValue(args.status, "status", MEMBER_STATUSES);
      if (!roleKey && !status) throw new AssistantToolError("NO_CHANGES", "Provide a roleKey or status change.");
      return { membershipId, roleKey, status };
    }
    case "prepare_update_member_permissions": return { membershipId: requireUuid(args.membershipId, "membershipId"), permissionOverrides: normalizeOverridesForTool(args) };
    case "prepare_revoke_company_invitation": return { invitationId: requireUuid(args.invitationId, "invitationId") };
    default: throw new AssistantToolError("UNKNOWN_TOOL", "That Assistant operation is not available.");
  }
}

function db(context: AssistantToolContext): any {
  return context.auth.supabase as any;
}

async function rpc(context: AssistantToolContext, name: string, args: Record<string, unknown>) {
  const result = await db(context).rpc(name, args);
  if (result.error) throw new AssistantBackendError("DOMAIN_WRITE_REJECTED", result.error.message || "The authoritative operation was rejected.", 409);
  return result.data;
}

async function readRpc(context: AssistantToolContext, name: string, args: Record<string, unknown>) {
  const result = await db(context).rpc(name, args);
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "The company access summary could not be read safely.", 503);
  return result.data;
}

async function getRow(context: AssistantToolContext, table: string, id: string, label: string, select = "*") {
  const result = await db(context).from(table).select(select).eq("company_id", context.auth.companyId).eq("id", id).maybeSingle();
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", `${label} could not be read safely.`, 503);
  if (!result.data) throw new AssistantBackendError("NOT_FOUND", `${label} is not available in this company.`, 404);
  return result.data as Record<string, unknown>;
}

function text(value: unknown, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function targetLabel(target: Record<string, unknown>, keys: string[]) {
  const value = keys.map((key) => text(target[key]).trim()).filter(Boolean).join(" · ");
  return value || "Record";
}

async function prepareOperation(context: AssistantToolContext, toolName: string, args: Record<string, unknown>, target: string, extra: Record<string, unknown> = {}) {
  return context.prepareAction({ toolName, riskTier: "PREPARE", normalizedArgs: args, contextGeneration: context.context.generation, preview: { operation: toolName.replace(/^prepare_/, "").replaceAll("_", " "), target, explicitConfirmationRequired: true, ...extra } });
}

async function prepareBulkOperation(context: AssistantToolContext, toolName: string, args: Record<string, unknown>, target: string, extra: Record<string, unknown> = {}) {
  return context.prepareAction({ toolName, riskTier: "BULK_MUTATION", normalizedArgs: args, contextGeneration: context.context.generation, preview: { operation: toolName.replace(/^prepare_/, "").replaceAll("_", " "), target, explicitConfirmationRequired: true, ...extra } });
}

async function searchWorkEntries(context: AssistantToolContext, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  let query = db(context).from("work_entries").select("id,worker_id,project_id,labor_context,period_id,work_date,regular_hours,overtime_hours,days_worked,rate,overtime_rate,description,status,voided_at,void_reason,created_at,updated_at").eq("company_id", context.auth.companyId).order("work_date", { ascending: false }).limit(Number(args.limit || 20));
  for (const key of ["workerId", "projectId", "periodId"] as const) if (args[key]) query = query.eq(key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), args[key]);
  if (args.from) query = query.gte("work_date", args.from);
  if (args.to) query = query.lte("work_date", args.to);
  if (args.status) query = query.eq("status", args.status);
  const result = await query;
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "Work entries could not be read safely.", 503);
  const records = (result.data || []) as Record<string, unknown>[];
  return toolOk({ count: records.length, records, semantics: "Work entries are payroll source records; approved or finalized payroll history remains protected." }, { references: records.slice(0, 10).map((entry) => ({ type: "report" as const, id: String(entry.id), label: `${entry.work_date || "Work entry"} · ${entry.description || "Labor source"}` })) });
}

async function prepareProjectUpdate(context: AssistantToolContext, args: Record<string, unknown>) {
  const project = await getRow(context, "projects", String(args.projectId), "Project", "id,project_code,project_name,description,client_name,client_reference,location,site_address,project_manager,start_date,target_end_date,actual_end_date,contract_value,project_budget,currency,status,updated_at");
  const changes = Object.fromEntries(Object.entries(args).filter(([key]) => key !== "projectId"));
  return prepareOperation(context, "prepare_update_project", { ...args, expectedUpdatedAt: project.updated_at || undefined }, targetLabel(project, ["project_code", "project_name"]), { currentStatus: project.status, currentCurrency: project.currency, changes, lifecyclePolicy: "Archive, reactivate, and other project state changes remain on the guarded project lifecycle operation." });
}

function attendanceRecordFromRow(row: Record<string, unknown>, companyId: string) {
  return {
    id: String(row.id), companyId, workerId: String(row.worker_id), periodId: row.period_id ? String(row.period_id) : undefined, attendanceDate: String(row.attendance_date),
    scheduledStart: row.scheduled_start ? String(row.scheduled_start) : undefined, scheduledEnd: row.scheduled_end ? String(row.scheduled_end) : undefined,
    scheduledMinutes: Number(row.scheduled_minutes || 0), breakMinutes: Number(row.break_minutes || 0), actualTimeIn: row.actual_time_in ? String(row.actual_time_in) : undefined, actualTimeOut: row.actual_time_out ? String(row.actual_time_out) : undefined,
    regularMinutes: Number(row.regular_minutes || 0), lateMinutes: Number(row.late_minutes || 0), undertimeMinutes: Number(row.undertime_minutes || 0), overtimeMinutes: Number(row.overtime_minutes || 0), paidDayFraction: Number(row.paid_day_fraction || 0),
    attendanceStatus: String(row.attendance_status || "PRESENT"), recordStatus: String(row.record_status || "DRAFT"), source: String(row.source || "MANUAL"), notes: row.notes ? String(row.notes) : undefined,
    createdBy: row.created_by ? String(row.created_by) : undefined, updatedBy: row.updated_by ? String(row.updated_by) : undefined, createdAt: row.created_at ? String(row.created_at) : undefined, updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function normalizedAttendanceUpdate(current: Record<string, unknown>, args: Record<string, unknown>, companyId: string) {
  const existing = attendanceRecordFromRow(current, companyId);
  const input: Record<string, unknown> = { id: existing.id, companyId, workerId: existing.workerId, attendanceDate: existing.attendanceDate, periodId: existing.periodId, source: existing.source, recordStatus: "CONFIRMED" };
  if (args.attendanceStatus !== undefined) input.attendanceStatus = args.attendanceStatus;
  if (args.actualTimeIn !== undefined) input.actualTimeIn = args.actualTimeIn || undefined;
  if (args.actualTimeOut !== undefined) input.actualTimeOut = args.actualTimeOut || undefined;
  if (args.notes !== undefined) input.notes = args.notes || undefined;
  const normalized = normalizeAttendanceRecord(input as any, { existing: existing as any, companyId, defaultSource: existing.source as any, defaultRecordStatus: "CONFIRMED" });
  if (!normalized.valid || !normalized.record) throw new AssistantToolError("ATTENDANCE_INVALID", normalized.errors.map((issue) => issue.message).join(" ") || "The attendance correction is invalid.");
  return normalized.record as Record<string, unknown>;
}

async function prepareAttendanceUpdate(context: AssistantToolContext, args: Record<string, unknown>) {
  const current = await getRow(context, "attendance_records", String(args.attendanceId), "Attendance record", "*");
  if (String(current.record_status) === "VOID") throw new AssistantToolError("ATTENDANCE_VOID", "A void attendance record is immutable and cannot be corrected.");
  if (current.period_id) {
    const period = await getRow(context, "payroll_periods", String(current.period_id), "Payroll period", "id,period_start,period_end,status,locked_at");
    if (period.locked_at || ["APPROVED", "PAID", "VOID"].includes(text(period.status))) throw new AssistantToolError("PAYROLL_LOCKED", "Attendance in a finalized payroll period cannot be corrected.");
  }
  const normalized = normalizedAttendanceUpdate(current, args, context.auth.companyId);
  return prepareOperation(context, "prepare_update_attendance", { ...args, expectedUpdatedAt: current.updated_at || undefined }, `${current.attendance_date} · ${current.worker_id}`, { currentStatus: current.record_status, targetStatus: normalized.attendanceStatus, normalizedTimes: { actualTimeIn: normalized.actualTimeIn, actualTimeOut: normalized.actualTimeOut }, historyPolicy: "Attendance correction uses the same deterministic normalization as the workspace; finalized or void history remains protected." });
}

async function listInternalTransferSuggestions(context: AssistantToolContext, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const [transactions, matches] = await Promise.all([
    (async () => {
      const result = await db(context).from("financial_transactions").select("id,account_id,transaction_date,reference_number,description,direction,amount,currency,status,reconciliation_status,transfer_group_id").eq("company_id", context.auth.companyId).order("transaction_date", { ascending: false }).limit(500);
      if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "Cash transactions could not be read safely.", 503);
      return (result.data || []) as Record<string, unknown>[];
    })(),
    (async () => {
      const result = await db(context).from("financial_transaction_matches").select("id,transaction_id,target_type,target_id,matched_amount,status,transfer_group_id").eq("company_id", context.auth.companyId).limit(500);
      if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "Cash reconciliation history could not be read safely.", 503);
      return (result.data || []) as Record<string, unknown>[];
    })(),
  ]);
  const suggestions = findInternalTransferSuggestions(transactions.map((item) => ({ id: String(item.id), accountId: String(item.account_id), transactionDate: String(item.transaction_date), referenceNumber: item.reference_number ? String(item.reference_number) : undefined, description: String(item.description || ""), direction: String(item.direction) as "CREDIT" | "DEBIT", amount: Number(item.amount), currency: String(item.currency), status: String(item.status) as "PENDING" | "POSTED" | "REVERSED", source: "MANUAL", reconciliationStatus: String(item.reconciliation_status) as "UNMATCHED" | "SUGGESTED" | "PARTIAL" | "MATCHED" | "IGNORED", transferGroupId: item.transfer_group_id ? String(item.transfer_group_id) : undefined } as any)), matches.map((item) => ({ id: String(item.id), transactionId: String(item.transaction_id), targetType: String(item.target_type), targetId: item.target_id ? String(item.target_id) : undefined, matchedAmount: Number(item.matched_amount), status: String(item.status), transferGroupId: item.transfer_group_id ? String(item.transfer_group_id) : undefined } as any))).slice(0, Number(args.limit || 10));
  const records = suggestions.map((suggestion) => ({ left: { id: suggestion.left.id, date: suggestion.left.transactionDate, description: suggestion.left.description, direction: suggestion.left.direction, amount: suggestion.left.amount, currency: suggestion.left.currency }, right: { id: suggestion.right.id, date: suggestion.right.transactionDate, description: suggestion.right.description, direction: suggestion.right.direction, amount: suggestion.right.amount, currency: suggestion.right.currency }, reasons: suggestion.reasons }));
  return toolOk({ count: records.length, suggestions: records, semantics: "Suggestions are non-authoritative. A transfer changes reconciliation evidence only after explicit human confirmation through the guarded transfer RPC." }, { references: records.slice(0, 10).flatMap((record) => [{ type: "report" as const, id: record.left.id, label: record.left.description }, { type: "report" as const, id: record.right.id, label: record.right.description }]) });
}

async function prepareReopenInvoiceReview(context: AssistantToolContext, args: Record<string, unknown>) {
  const invoice = await getRow(context, "invoices", String(args.invoiceId), "id,invoice_number,invoice_date,review_status,lifecycle_status,verified_at,updated_at");
  if (text(invoice.lifecycle_status) === "VOID") throw new AssistantToolError("INVOICE_VOID", "A void invoice cannot be reopened for review.");
  if (text(invoice.review_status) === "NEEDS_REVIEW") throw new AssistantToolError("ALREADY_IN_REVIEW", "The invoice is already in the review queue.");
  return prepareOperation(context, "prepare_reopen_invoice_review", { ...args, expectedUpdatedAt: invoice.updated_at || undefined }, targetLabel(invoice, ["invoice_number", "invoice_date"]), { currentReviewStatus: invoice.review_status, targetReviewStatus: "NEEDS_REVIEW", reason: args.reason || "Reopened for human review", historyPolicy: "The original extraction snapshot and source evidence remain unchanged." });
}

async function prepareAssignment(context: AssistantToolContext, args: Record<string, unknown>) {
  const worker = await getRow(context, "workers", String(args.workerId), "Worker", "id,display_name,employee_code,active,employment_status");
  const project = await getRow(context, "projects", String(args.projectId), "Project", "id,project_code,project_name,status,archived_at");
  if (worker.active === false || ["INACTIVE", "OFFBOARDED"].includes(text(worker.employment_status))) throw new AssistantToolError("WORKER_INACTIVE", "Inactive or offboarded workers cannot receive active assignments.");
  if (project.archived_at || text(project.status) === "ARCHIVED") throw new AssistantToolError("PROJECT_ARCHIVED", "Archived projects cannot receive worker assignments.");
  return prepareOperation(context, "prepare_save_project_assignment", args, targetLabel(worker, ["employee_code", "display_name"]), { project: targetLabel(project, ["project_code", "project_name"]), effectiveDate: args.startDate, assignmentId: args.assignmentId });
}

async function prepareCompensation(context: AssistantToolContext, args: Record<string, unknown>) {
  const worker = await getRow(context, "workers", String(args.workerId), "Worker", "id,display_name,employee_code");
  if (args.defaultProjectId) {
    const project = await getRow(context, "projects", String(args.defaultProjectId), "Default project", "id,status,archived_at");
    if (project.archived_at || text(project.status) === "ARCHIVED") throw new AssistantToolError("PROJECT_ARCHIVED", "An archived project cannot be a compensation default.");
  }
  return prepareOperation(context, "prepare_save_compensation_profile", args, targetLabel(worker, ["employee_code", "display_name"]), { effectiveFrom: args.effectiveFrom, frequency: args.frequency, rate: args.rate, historyPolicy: "A new effective profile supersedes overlapping setup without rewriting finalized payroll snapshots." });
}

async function prepareComponent(context: AssistantToolContext, args: Record<string, unknown>) {
  const worker = await getRow(context, "workers", String(args.workerId), "Worker", "id,display_name,employee_code");
  return prepareOperation(context, "prepare_save_recurring_component", args, targetLabel(worker, ["employee_code", "display_name"]), { componentType: args.type, effectiveFrom: args.effectiveFrom, effectiveTo: args.effectiveTo });
}

async function prepareWorkEntry(context: AssistantToolContext, args: Record<string, unknown>) {
  const worker = await getRow(context, "workers", String(args.workerId), "Worker", "id,display_name,employee_code,active");
  if (worker.active === false) throw new AssistantToolError("WORKER_INACTIVE", "Inactive workers cannot receive new work entries.");
  const period = await getRow(context, "payroll_periods", String(args.periodId), "Payroll period", "id,period_start,period_end,status,locked_at");
  if (period.locked_at || ["APPROVED", "PAID", "VOID"].includes(text(period.status))) throw new AssistantToolError("PAYROLL_LOCKED", "The selected payroll period is locked or finalized.");
  if (String(args.workDate) < text(period.period_start) || String(args.workDate) > text(period.period_end)) throw new AssistantToolError("DATE_OUTSIDE_PERIOD", "The work date must be inside the selected payroll period.");
  if (args.projectId) {
    const project = await getRow(context, "projects", String(args.projectId), "Project", "id,status,archived_at");
    if (project.archived_at || text(project.status) === "ARCHIVED") throw new AssistantToolError("PROJECT_ARCHIVED", "Archived projects cannot receive new labor entries.");
  }
  return prepareOperation(context, "prepare_save_work_entry", args, targetLabel(worker, ["employee_code", "display_name"]), { period: `${period.period_start} – ${period.period_end}`, workDate: args.workDate, laborContext: args.laborContext, projectId: args.projectId });
}

async function prepareFinancialAccount(context: AssistantToolContext, args: Record<string, unknown>) {
  const existing = await db(context).from("financial_accounts").select("id,display_name,active,currency,account_type").eq("company_id", context.auth.companyId).eq("id", args.accountId).maybeSingle();
  if (existing.error) throw new AssistantBackendError("TOOL_READ_FAILED", "The financial account could not be checked safely.", 503);
  return prepareOperation(context, "prepare_financial_account", args, existing.data ? targetLabel(existing.data, ["display_name"]) : String(args.displayName), { existing: Boolean(existing.data), currency: args.currency, accountType: args.accountType, historyPolicy: "The account RPC locks history and prevents identity rewrites after financial use." });
}

async function prepareFinancialAccountLifecycle(context: AssistantToolContext, args: Record<string, unknown>) {
  const account = await getRow(context, "financial_accounts", String(args.accountId), "Financial account", "id,display_name,active,currency,account_type");
  return prepareOperation(context, "prepare_financial_account_lifecycle", args, targetLabel(account, ["display_name"]), { currentActive: account.active, currency: account.currency, accountType: account.account_type, historyPolicy: "Account history remains available; the guarded RPC changes only active state." });
}

async function prepareFinancialTransaction(context: AssistantToolContext, args: Record<string, unknown>) {
  const account = await getRow(context, "financial_accounts", String(args.accountId), "Financial account", "id,display_name,currency,active");
  if (account.active === false) throw new AssistantToolError("ACCOUNT_INACTIVE", "The selected financial account is inactive.");
  if (text(account.currency).toUpperCase() !== text(args.currency).toUpperCase()) throw new AssistantToolError("CURRENCY_MISMATCH", "The transaction currency must match its financial account.");
  return prepareOperation(context, "prepare_financial_transaction", args, targetLabel(account, ["display_name"]), { transactionDate: args.transactionDate, direction: args.direction, amount: args.amount, currency: args.currency });
}

async function prepareCashStatementImport(context: AssistantToolContext, args: Record<string, unknown>) {
  const account = await getRow(context, "financial_accounts", String(args.accountId), "Financial account", "id,display_name,currency,active");
  if (account.active === false) throw new AssistantToolError("ACCOUNT_INACTIVE", "The selected financial account is inactive.");
  const importedRows = args.rows as Array<Record<string, unknown>>;
  if (importedRows.some((entry) => String(entry.currency).toUpperCase() !== text(account.currency).toUpperCase())) throw new AssistantToolError("CURRENCY_MISMATCH", "Imported rows must match the selected account currency.");
  return prepareBulkOperation(context, "prepare_import_cash_statement", args, targetLabel(account, ["display_name"]), { sourceType: args.sourceType, fileName: args.fileName, rowCount: importedRows.length, fileFingerprint: args.fileFingerprint, historyPolicy: "The existing import RPC validates the account, fingerprint, row shape, duplicates, and company boundary atomically." });
}

async function prepareTransactionById(context: AssistantToolContext, toolName: string, args: Record<string, unknown>) {
  const tx = await getRow(context, "financial_transactions", String(args.transactionId), "Financial transaction", "id,account_id,transaction_date,description,status,reconciliation_status,source,amount,currency,transfer_group_id");
  return prepareOperation(context, toolName, args, targetLabel(tx, ["transaction_date", "description"]), { currentStatus: tx.status, reconciliationStatus: tx.reconciliation_status, source: tx.source, amount: tx.amount, currency: tx.currency, historyPolicy: "The guarded financial RPC decides whether correction, reversal, Ignore, or review restoration is permitted." });
}

async function prepareInternalTransfer(context: AssistantToolContext, args: Record<string, unknown>) {
  const left = await getRow(context, "financial_transactions", String(args.leftTransactionId), "Left transfer transaction", "id,account_id,transaction_date,direction,amount,currency,status,reconciliation_status");
  const right = await getRow(context, "financial_transactions", String(args.rightTransactionId), "Right transfer transaction", "id,account_id,transaction_date,direction,amount,currency,status,reconciliation_status");
  if (String(left.account_id) === String(right.account_id)) throw new AssistantToolError("INVALID_TRANSFER", "An internal transfer must connect two different accounts.");
  return prepareOperation(context, "prepare_internal_transfer", args, `${left.transaction_date} · ${right.transaction_date}`, { left: { date: left.transaction_date, direction: left.direction, amount: left.amount, currency: left.currency, status: left.status }, right: { date: right.transaction_date, direction: right.direction, amount: right.amount, currency: right.currency, status: right.status }, matchedAmount: args.matchedAmount, historyPolicy: "The transfer RPC rechecks both locked transactions, accounts, amounts, dates, currencies, and existing evidence." });
}

async function prepareCompanyProfile(context: AssistantToolContext, args: Record<string, unknown>) {
  const company = await db(context).from("companies").select("id,name,default_currency,timezone").eq("id", context.auth.companyId).maybeSingle();
  if (company.error || !company.data) throw new AssistantBackendError("TOOL_READ_FAILED", "The deployment company profile could not be read safely.", 503);
  return prepareOperation(context, "prepare_update_company_profile", args, String(company.data.name || "Deployment company"), { current: { name: company.data.name, defaultCurrency: company.data.default_currency, timezone: company.data.timezone }, changes: { name: args.name, defaultCurrency: args.defaultCurrency, timezone: args.timezone }, companyBoundary: "company_id is fixed to the authenticated deployment company" });
}

async function getCompanyAccessSummary(context: AssistantToolContext): Promise<ToolExecutionResult> {
  const [members, invitations, permissions] = await Promise.all([
    readRpc(context, "platform_list_company_member_directory", { p_company_id: context.auth.companyId }),
    readRpc(context, "platform_list_company_invitations_with_overrides", { p_company_id: context.auth.companyId }),
    readRpc(context, "platform_list_company_permission_catalog", { p_company_id: context.auth.companyId }),
  ]);
  return toolOk({ members: Array.isArray(members) ? members : [], pendingAccess: Array.isArray(invitations) ? invitations : [], assignablePermissions: Array.isArray(permissions) ? permissions : [], semantics: "Access is deployment-company bound. Effective member permissions combine the role preset with explicit GRANT/DENY overrides; pending access is Awaiting signup until the verified email claims it." });
}

async function prepareAccessOperation(context: AssistantToolContext, toolName: string, args: Record<string, unknown>, target: string, extra: Record<string, unknown> = {}) {
  return prepareOperation(context, toolName, args, target, { ...extra, securityBoundary: "The authenticated deployment company and database access RPC remain authoritative." });
}

export async function executeAssistantOperationTool(name: string, args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  switch (name) {
    case "search_work_entries": return searchWorkEntries(context, args);
    case "list_internal_transfer_suggestions": return listInternalTransferSuggestions(context, args);
    case "prepare_reopen_invoice_review": return prepareReopenInvoiceReview(context, args);
    case "prepare_update_project": return prepareProjectUpdate(context, args);
    case "prepare_update_attendance": return prepareAttendanceUpdate(context, args);
    case "prepare_save_project_assignment": return prepareAssignment(context, args);
    case "prepare_save_compensation_profile": return prepareCompensation(context, args);
    case "prepare_save_recurring_component": return prepareComponent(context, args);
    case "prepare_save_work_entry": return prepareWorkEntry(context, args);
    case "prepare_financial_account": return prepareFinancialAccount(context, args);
    case "prepare_financial_account_lifecycle": return prepareFinancialAccountLifecycle(context, args);
    case "prepare_financial_snapshot": return prepareFinancialSnapshot(context, args);
    case "prepare_financial_transaction": return prepareFinancialTransaction(context, args);
    case "prepare_financial_transaction_correction": return prepareTransactionById(context, name, args);
    case "prepare_financial_transaction_lifecycle": return prepareTransactionById(context, name, args);
    case "prepare_import_cash_statement": return prepareCashStatementImport(context, args);
    case "prepare_internal_transfer": return prepareInternalTransfer(context, args);
    case "prepare_internal_transfer_reversal": return prepareOperation(context, name, args, "Internal transfer", { historyPolicy: "Both ledger transactions remain; only the transfer relationship is reversed." });
    case "prepare_update_company_profile": return prepareCompanyProfile(context, args);
    case "get_company_access_summary": return getCompanyAccessSummary(context);
    case "prepare_authorize_company_member": return prepareAccessOperation(context, name, args, String(args.email), { roleKey: args.roleKey, permissionOverrideCount: Array.isArray(args.permissionOverrides) ? args.permissionOverrides.length : 0, result: "Awaiting signup; no user account is created by this action." });
    case "prepare_update_company_member": return prepareAccessOperation(context, name, args, "Company member", { membershipId: args.membershipId, roleKey: args.roleKey, status: args.status });
    case "prepare_update_member_permissions": return prepareAccessOperation(context, name, args, "Company member permissions", { membershipId: args.membershipId, permissionOverrideCount: Array.isArray(args.permissionOverrides) ? args.permissionOverrides.length : 0 });
    case "prepare_revoke_company_invitation": return prepareAccessOperation(context, name, args, "Pending company access authorization", { invitationId: args.invitationId });
    default: throw new AssistantToolError("UNKNOWN_TOOL", "That Assistant operation is not available.");
  }
}

function assignmentRow(args: Record<string, unknown>, userId: string, companyId: string) {
  return { id: args.assignmentId, user_id: userId, company_id: companyId, worker_id: args.workerId, project_id: args.projectId, start_date: args.startDate, end_date: args.endDate || null, pay_type: args.payType || null, rate: args.rate ?? null, role_on_project: args.roleOnProject || null, active: args.active !== false, notes: args.notes || null, updated_at: new Date().toISOString() };
}

function componentRow(args: Record<string, unknown>, userId: string, companyId: string) {
  return { id: args.componentId, user_id: userId, company_id: companyId, worker_id: args.workerId, type: args.type, code: args.code || null, name: args.name || null, amount: args.amount ?? null, rate: args.rate ?? null, effective_from: args.effectiveFrom, effective_to: args.effectiveTo || null, active: args.active !== false, updated_at: new Date().toISOString() };
}

function workEntryRow(args: Record<string, unknown>, userId: string, companyId: string) {
  return { id: args.entryId, user_id: userId, company_id: companyId, worker_id: args.workerId, project_id: args.projectId || null, labor_context: args.laborContext, period_id: args.periodId, work_date: args.workDate, regular_hours: args.regularHours ?? 0, overtime_hours: args.overtimeHours ?? 0, days_worked: args.daysWorked ?? 0, rate: args.rate, overtime_rate: args.overtimeRate ?? null, description: args.description || null, notes: args.notes || null, status: args.status || "DRAFT", updated_at: new Date().toISOString() };
}

async function saveAssignment(context: AssistantToolContext, args: Record<string, unknown>) {
  const result = await db(context).from("project_worker_assignments").upsert(assignmentRow(args, context.auth.user.id, context.auth.companyId)).select("*").single();
  if (result.error) throw new AssistantToolError("DOMAIN_WRITE_REJECTED", "The project assignment was rejected by the authoritative workforce rules.");
  return { operation: "project_assignment_saved", entityType: "PROJECT_ASSIGNMENT", entityId: String(result.data.id), displayLabel: targetLabel(result.data, ["role_on_project", "start_date"]), projectId: String(result.data.project_id), record: result.data };
}

function projectUpdatePatch(args: Record<string, unknown>, now: string) {
  const mapping: Record<string, string> = {
    projectCode: "project_code", projectName: "project_name", description: "description", clientName: "client_name", clientReference: "client_reference",
    location: "location", siteAddress: "site_address", projectManager: "project_manager", startDate: "start_date", targetEndDate: "target_end_date",
    actualEndDate: "actual_end_date", contractValue: "contract_value", projectBudget: "project_budget", currency: "currency", notes: "notes",
  };
  const patch: Record<string, unknown> = { updated_at: now };
  for (const [key, column] of Object.entries(mapping)) if (args[key] !== undefined) patch[column] = args[key];
  return patch;
}

async function updateProject(context: AssistantToolContext, args: Record<string, unknown>) {
  const current = await getRow(context, "projects", String(args.projectId), "Project", "*");
  if (args.expectedUpdatedAt !== undefined && String(current.updated_at || "") !== String(args.expectedUpdatedAt || "")) throw new AssistantToolError("STALE_PREVIEW", "The project changed after the preview. Prepare the update again.");
  let query = db(context).from("projects").update(projectUpdatePatch(args, context.now.toISOString())).eq("id", String(args.projectId)).eq("company_id", context.auth.companyId);
  if (args.expectedUpdatedAt !== undefined) query = query.eq("updated_at", args.expectedUpdatedAt);
  const result = await query.select("*").maybeSingle();
  if (result.error || !result.data) throw new AssistantToolError("DOMAIN_WRITE_REJECTED", "The project update was rejected by the authoritative project rules.");
  return { operation: "project_updated", entityType: "PROJECT", entityId: String(result.data.id), displayLabel: targetLabel(result.data, ["project_code", "project_name"]), record: result.data };
}

async function updateAttendance(context: AssistantToolContext, args: Record<string, unknown>) {
  const current = await getRow(context, "attendance_records", String(args.attendanceId), "Attendance record", "*");
  if (String(current.record_status) === "VOID") throw new AssistantToolError("ATTENDANCE_VOID", "A void attendance record is immutable and cannot be corrected.");
  if (args.expectedUpdatedAt !== undefined && String(current.updated_at || "") !== String(args.expectedUpdatedAt || "")) throw new AssistantToolError("STALE_PREVIEW", "The attendance record changed after the preview. Prepare the correction again.");
  if (current.period_id) {
    const period = await getRow(context, "payroll_periods", String(current.period_id), "Payroll period", "id,status,locked_at");
    if (period.locked_at || ["APPROVED", "PAID", "VOID"].includes(text(period.status))) throw new AssistantToolError("PAYROLL_LOCKED", "Attendance in a finalized payroll period cannot be corrected.");
  }
  const normalized = normalizedAttendanceUpdate(current, args, context.auth.companyId);
  const payload = {
    id: normalized.id, user_id: context.auth.user.id, company_id: context.auth.companyId, worker_id: normalized.workerId, period_id: normalized.periodId || null, attendance_date: normalized.attendanceDate,
    scheduled_start: normalized.scheduledStart || null, scheduled_end: normalized.scheduledEnd || null, scheduled_minutes: normalized.scheduledMinutes || 0, break_minutes: normalized.breakMinutes || 0,
    actual_time_in: normalized.actualTimeIn || null, actual_time_out: normalized.actualTimeOut || null, regular_minutes: normalized.regularMinutes || 0, late_minutes: normalized.lateMinutes || 0,
    undertime_minutes: normalized.undertimeMinutes || 0, overtime_minutes: normalized.overtimeMinutes || 0, paid_day_fraction: normalized.paidDayFraction || 0, attendance_status: normalized.attendanceStatus,
    record_status: "CONFIRMED", source: normalized.source || "MANUAL", notes: normalized.notes || null, voided_at: current.voided_at || null, void_reason: current.void_reason || null,
    created_by: current.created_by || context.auth.user.id, updated_by: context.auth.user.id, updated_at: context.now.toISOString(),
  };
  let query = db(context).from("attendance_records").update(payload).eq("id", String(current.id)).eq("company_id", context.auth.companyId);
  if (args.expectedUpdatedAt !== undefined) query = query.eq("updated_at", args.expectedUpdatedAt);
  const result = await query.select("*").maybeSingle();
  if (result.error || !result.data) throw new AssistantToolError("DOMAIN_WRITE_REJECTED", "The attendance correction was rejected by the authoritative workforce rules.");
  return { operation: "attendance_corrected", entityType: "ATTENDANCE", entityId: String(result.data.id), displayLabel: `${result.data.attendance_date || "Attendance"} · ${result.data.attendance_status || "record"}`, record: result.data };
}

async function prepareFinancialSnapshot(context: AssistantToolContext, args: Record<string, unknown>) {
  const account = await getRow(context, "financial_accounts", String(args.accountId), "Financial account", "id,display_name,currency,active");
  if (account.active === false) throw new AssistantToolError("ACCOUNT_INACTIVE", "An inactive financial account cannot receive a new balance snapshot.");
  return prepareOperation(context, "prepare_financial_snapshot", args, targetLabel(account, ["display_name"]), { currency: account.currency, availableBalance: args.availableBalance, pendingBalance: args.pendingBalance, source: "MANUAL", semantics: "A manual balance is dated evidence, not a live provider balance." });
}

async function saveFinancialSnapshot(context: AssistantToolContext, args: Record<string, unknown>) {
  const account = await getRow(context, "financial_accounts", String(args.accountId), "Financial account", "id,display_name,active,currency");
  if (account.active === false) throw new AssistantToolError("ACCOUNT_INACTIVE", "An inactive financial account cannot receive a balance snapshot.");
  const result = await db(context).from("financial_balance_snapshots").insert({ id: args.snapshotId, company_id: context.auth.companyId, account_id: account.id, captured_at: context.now.toISOString(), ledger_balance: args.availableBalance, available_balance: args.availableBalance, pending_balance: args.pendingBalance ?? null, source: "MANUAL", created_by_user_id: context.auth.user.id }).select("*").single();
  if (result.error || !result.data) throw new AssistantToolError("DOMAIN_WRITE_REJECTED", "The manual balance snapshot was rejected by the authoritative cash rules.");
  return { operation: "financial_snapshot_recorded", entityType: "FINANCIAL_SNAPSHOT", entityId: String(result.data.id), displayLabel: targetLabel(account, ["display_name"]), action: "RECORD_MANUAL_BALANCE", record: result.data };
}

async function reopenInvoiceReview(context: AssistantToolContext, args: Record<string, unknown>) {
  const current = await getRow(context, "invoices", String(args.invoiceId), "Invoice", "id,company_id,invoice_number,review_status,lifecycle_status,verified_at,updated_at,current_data");
  if (text(current.lifecycle_status) === "VOID") throw new AssistantToolError("INVOICE_VOID", "A void invoice cannot be reopened for review.");
  if (text(current.review_status) === "NEEDS_REVIEW") return { operation: "invoice_already_in_review", entityType: "INVOICE", entityId: String(current.id), displayLabel: targetLabel(current, ["invoice_number"]), record: current };
  if (args.expectedUpdatedAt !== undefined && String(current.updated_at || "") !== String(args.expectedUpdatedAt || "")) throw new AssistantToolError("STALE_PREVIEW", "The invoice changed after the preview. Prepare the review action again.");
  const currentData = current.current_data && typeof current.current_data === "object" && !Array.isArray(current.current_data) ? (() => { const next: Record<string, unknown> = { ...(current.current_data as Record<string, unknown>), reviewStatus: "NEEDS_REVIEW" }; delete next.verifiedAt; return next; })() : undefined;
  let query = db(context).from("invoices").update({ review_status: "NEEDS_REVIEW", verified_at: null, ...(currentData ? { current_data: currentData } : {}), updated_at: context.now.toISOString() }).eq("id", String(args.invoiceId)).eq("company_id", context.auth.companyId).neq("lifecycle_status", "VOID");
  if (args.expectedUpdatedAt !== undefined) query = query.eq("updated_at", args.expectedUpdatedAt);
  const result = await query.select("*").maybeSingle();
  if (result.error || !result.data) throw new AssistantToolError("DOMAIN_WRITE_REJECTED", "The invoice changed before it could be reopened for review.");
  const event = await db(context).from("invoice_review_events").insert({ user_id: context.auth.user.id, company_id: context.auth.companyId, invoice_id: args.invoiceId, event_type: "REOPENED", previous_value: { reviewStatus: current.review_status, verifiedAt: current.verified_at }, new_value: { reviewStatus: "NEEDS_REVIEW", reason: args.reason || "Reopened for human review" } });
  if (event.error) throw new AssistantToolError("DOMAIN_WRITE_REJECTED", "The invoice reopened, but its review history could not be recorded safely.");
  return { operation: "invoice_reopened_for_review", entityType: "INVOICE", entityId: String(result.data.id), displayLabel: targetLabel(result.data, ["invoice_number", "invoice_date"]), record: result.data };
}

async function saveCompensationProfile(context: AssistantToolContext, args: Record<string, unknown>) {
  const result = await rpc(context, "save_worker_compensation_profile", { p_profile_id: args.profileId, p_worker_id: args.workerId, p_effective_from: args.effectiveFrom, p_effective_to: args.effectiveTo || null, p_frequency: args.frequency, p_rate: args.rate, p_default_labor_context: args.defaultLaborContext, p_default_project_id: args.defaultProjectId || null, p_active: args.active !== false });
  return { operation: "compensation_profile_saved", entityType: "COMPENSATION_PROFILE", entityId: String((result as Record<string, unknown>)?.id || args.profileId), displayLabel: "Worker compensation profile", workerId: String(args.workerId), record: result };
}

async function saveComponent(context: AssistantToolContext, args: Record<string, unknown>) {
  const result = await db(context).from("recurring_payroll_components").upsert(componentRow(args, context.auth.user.id, context.auth.companyId)).select("*").single();
  if (result.error) throw new AssistantToolError("DOMAIN_WRITE_REJECTED", "The recurring payroll component was rejected by the authoritative payroll rules.");
  return { operation: "recurring_component_saved", entityType: "RECURRING_COMPONENT", entityId: String(result.data.id), displayLabel: targetLabel(result.data, ["name", "code", "type"]), workerId: String(result.data.worker_id), record: result.data };
}

async function saveWorkEntry(context: AssistantToolContext, args: Record<string, unknown>) {
  const result = await db(context).from("work_entries").upsert(workEntryRow(args, context.auth.user.id, context.auth.companyId)).select("*").single();
  if (result.error) throw new AssistantToolError("DOMAIN_WRITE_REJECTED", "The work entry was rejected by the authoritative workforce rules.");
  return { operation: "work_entry_saved", entityType: "WORK_ENTRY", entityId: String(result.data.id), displayLabel: targetLabel(result.data, ["work_date", "description"]), projectId: typeof result.data.project_id === "string" ? result.data.project_id : undefined, record: result.data };
}

async function saveFinancialAccount(context: AssistantToolContext, args: Record<string, unknown>) {
  const result = await rpc(context, "save_financial_account", { p_company_id: context.auth.companyId, p_account_id: args.accountId, p_account_type: args.accountType, p_institution_code: args.institutionCode || null, p_institution_name: args.institutionName, p_display_name: args.displayName, p_masked_identifier: args.maskedIdentifier || null, p_currency: args.currency, p_opening_balance: args.openingBalance, p_opening_balance_date: args.openingBalanceDate, p_connection_type: args.connectionType, p_provider: args.provider || null, p_provider_account_id: args.providerAccountId || null });
  return { operation: "financial_account_saved", entityType: "FINANCIAL_ACCOUNT", entityId: String((result as Record<string, unknown>)?.id || args.accountId), displayLabel: String((result as Record<string, unknown>)?.display_name || args.displayName), record: result };
}

async function financialAccountLifecycle(context: AssistantToolContext, args: Record<string, unknown>) {
  const rpcName = args.action === "DEACTIVATE" ? "deactivate_financial_account" : "reactivate_financial_account";
  const result = await rpc(context, rpcName, { p_account_id: args.accountId, p_reason: args.reason });
  return { operation: "financial_account_lifecycle_applied", entityType: "FINANCIAL_ACCOUNT", entityId: String(args.accountId), displayLabel: String((result as Record<string, unknown>)?.display_name || "Financial account"), action: args.action, record: result };
}

async function saveFinancialTransaction(context: AssistantToolContext, args: Record<string, unknown>) {
  const result = await rpc(context, "create_financial_transaction", { p_company_id: context.auth.companyId, p_transaction_id: args.transactionId, p_account_id: args.accountId, p_transaction_date: args.transactionDate, p_posted_at: args.postedAt || null, p_reference_number: args.referenceNumber || null, p_description: args.description, p_direction: args.direction, p_amount: args.amount, p_currency: args.currency, p_source_fingerprint: args.sourceFingerprint });
  return { operation: "financial_transaction_created", entityType: "FINANCIAL_TRANSACTION", entityId: String((result as Record<string, unknown>)?.id || args.transactionId), displayLabel: targetLabel((result || {}) as Record<string, unknown>, ["transaction_date", "description"]), record: result };
}

async function importCashStatement(context: AssistantToolContext, args: Record<string, unknown>) {
  const rows = (args.rows as Array<Record<string, unknown>>).map((item) => ({
    transaction_date: item.transactionDate,
    posted_at: item.postedAt || null,
    reference_number: item.referenceNumber || null,
    description: item.description,
    direction: item.direction,
    amount: item.amount,
    currency: item.currency,
    running_balance: item.runningBalance ?? null,
    source_fingerprint: item.sourceFingerprint || createHash("sha256").update(JSON.stringify(item)).digest("hex"),
  }));
  const result = await rpc(context, "commit_financial_import", { p_company_id: context.auth.companyId, p_account_id: args.accountId, p_source_type: args.sourceType, p_file_name: args.fileName, p_file_fingerprint: args.fileFingerprint, p_statement_from: args.statementFrom || null, p_statement_to: args.statementTo || null, p_opening_balance: args.openingBalance ?? null, p_closing_balance: args.closingBalance ?? null, p_row_count: rows.length, p_duplicate_count: 0, p_rejected_count: 0, p_rows: rows });
  return { operation: "cash_statement_imported", entityType: "FINANCIAL_IMPORT", entityId: String((result as Record<string, unknown>)?.batch_id || args.fileFingerprint), displayLabel: String(args.fileName), action: "IMPORT", imported: result };
}

async function correctFinancialTransaction(context: AssistantToolContext, args: Record<string, unknown>) {
  const result = await rpc(context, "correct_financial_transaction", { p_company_id: context.auth.companyId, p_transaction_id: args.transactionId, p_transaction_date: args.transactionDate, p_reference_number: args.referenceNumber || null, p_description: args.description, p_direction: args.direction, p_amount: args.amount, p_reason: args.reason });
  return { operation: "financial_transaction_corrected", entityType: "FINANCIAL_TRANSACTION", entityId: String(args.transactionId), displayLabel: targetLabel((result || {}) as Record<string, unknown>, ["transaction_date", "description"]), record: result };
}

async function financialTransactionLifecycle(context: AssistantToolContext, args: Record<string, unknown>) {
  const rpcName = args.action === "REVERSE" ? "reverse_financial_transaction" : args.action === "IGNORE" ? "ignore_financial_transaction" : "restore_financial_transaction_to_review";
  const result = await rpc(context, rpcName, { p_company_id: context.auth.companyId, p_transaction_id: args.transactionId, p_reason: args.reason });
  return { operation: "financial_transaction_lifecycle_applied", entityType: "FINANCIAL_TRANSACTION", entityId: String(args.transactionId), action: args.action, displayLabel: targetLabel((result || {}) as Record<string, unknown>, ["transaction_date", "description"]), record: result };
}

async function internalTransfer(context: AssistantToolContext, args: Record<string, unknown>) {
  const result = await rpc(context, "confirm_financial_transfer", { p_company_id: context.auth.companyId, p_left_transaction_id: args.leftTransactionId, p_right_transaction_id: args.rightTransactionId, p_matched_amount: args.matchedAmount, p_transfer_group_id: args.transferGroupId });
  return { operation: "internal_transfer_confirmed", entityType: "FINANCIAL_TRANSFER", entityId: String(args.transferGroupId), action: "CONFIRM", displayLabel: "Internal transfer", record: result };
}

async function internalTransferReversal(context: AssistantToolContext, args: Record<string, unknown>) {
  const result = await rpc(context, "reverse_financial_transfer", { p_company_id: context.auth.companyId, p_transfer_group_id: args.transferGroupId, p_left_transaction_id: args.leftTransactionId, p_right_transaction_id: args.rightTransactionId, p_reason: args.reason });
  return { operation: "internal_transfer_reversed", entityType: "FINANCIAL_TRANSFER", entityId: String(args.transferGroupId), action: "REVERSE", displayLabel: "Internal transfer", record: result };
}

async function updateCompanyProfile(context: AssistantToolContext, args: Record<string, unknown>) {
  const result = await rpc(context, "update_company", { p_company_id: context.auth.companyId, p_name: args.name, p_default_currency: args.defaultCurrency, p_timezone: args.timezone });
  return { operation: "company_profile_updated", entityType: "COMPANY", entityId: context.auth.companyId, displayLabel: String((result as Record<string, unknown>)?.name || args.name), record: result };
}

async function accessMutation(context: AssistantToolContext, toolName: string, args: Record<string, unknown>) {
  if (toolName === "prepare_authorize_company_member") {
    const result = await rpc(context, "authorize_company_member_email", { p_company_id: context.auth.companyId, p_email: args.email, p_role_key: args.roleKey, p_permission_overrides: args.permissionOverrides || [], p_expires_at: args.expiresAt || null });
    return { operation: "company_access_authorized", entityType: "INVITATION", entityId: String((result as Record<string, unknown>)?.id || ""), displayLabel: String(args.email), action: "AUTHORIZE", record: result };
  }
  if (toolName === "prepare_update_company_member") {
    const result = await rpc(context, "platform_update_company_member", { p_company_id: context.auth.companyId, p_membership_id: args.membershipId, p_role_key: args.roleKey || null, p_status: args.status || null });
    return { operation: "company_member_updated", entityType: "MEMBERSHIP", entityId: String(args.membershipId), displayLabel: "Company member", action: args.status || "ROLE_UPDATED", record: result };
  }
  if (toolName === "prepare_update_member_permissions") {
    const result = await rpc(context, "platform_update_company_member_permissions", { p_company_id: context.auth.companyId, p_membership_id: args.membershipId, p_overrides: args.permissionOverrides || [] });
    return { operation: "company_member_permissions_updated", entityType: "MEMBERSHIP", entityId: String(args.membershipId), displayLabel: "Company member permissions", action: "OVERRIDES_UPDATED", record: result };
  }
  const result = await rpc(context, "revoke_company_invitation", { p_invitation_id: args.invitationId });
  return { operation: "company_invitation_revoked", entityType: "INVITATION", entityId: String(args.invitationId), displayLabel: "Pending company access authorization", action: "REVOKE", record: result };
}

export async function executePreparedAssistantOperation(context: AssistantToolContext, toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (toolName) {
    case "prepare_reopen_invoice_review": return reopenInvoiceReview(context, args);
    case "prepare_update_project": return updateProject(context, args);
    case "prepare_update_attendance": return updateAttendance(context, args);
    case "prepare_save_project_assignment": return saveAssignment(context, args);
    case "prepare_save_compensation_profile": return saveCompensationProfile(context, args);
    case "prepare_save_recurring_component": return saveComponent(context, args);
    case "prepare_save_work_entry": return saveWorkEntry(context, args);
    case "prepare_financial_account": return saveFinancialAccount(context, args);
    case "prepare_financial_account_lifecycle": return financialAccountLifecycle(context, args);
    case "prepare_financial_snapshot": return saveFinancialSnapshot(context, args);
    case "prepare_financial_transaction": return saveFinancialTransaction(context, args);
    case "prepare_import_cash_statement": return importCashStatement(context, args);
    case "prepare_financial_transaction_correction": return correctFinancialTransaction(context, args);
    case "prepare_financial_transaction_lifecycle": return financialTransactionLifecycle(context, args);
    case "prepare_internal_transfer": return internalTransfer(context, args);
    case "prepare_internal_transfer_reversal": return internalTransferReversal(context, args);
    case "prepare_update_company_profile": return updateCompanyProfile(context, args);
    case "prepare_authorize_company_member":
    case "prepare_update_company_member":
    case "prepare_update_member_permissions":
    case "prepare_revoke_company_invitation": return accessMutation(context, toolName, args);
    default: throw new AssistantToolError("NOT_MUTATION", "That operation is not a confirmable Assistant mutation.");
  }
}
