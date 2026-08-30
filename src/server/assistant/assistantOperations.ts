import { createHash, randomUUID } from "node:crypto";
import type { AssistantRiskTier } from "../../assistant/assistantTypes.ts";
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

const uuid = { type: "string", description: "Identifier supplied by a prior Engoryx tool result or current workspace context." };
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
  prepare("prepare_save_project_assignment", "Prepare creation or editing of a project worker assignment. Database lifecycle guards reject rewrites of used assignment identity or archived-project activity.", ["workers.manage"], assignmentSchema, ["workerId", "projectId", "startDate"]),
  prepare("prepare_save_compensation_profile", "Prepare an effective-dated worker compensation profile through the same guarded payroll setup RPC as the deterministic UI.", ["workers.manage"], compensationSchema, ["workerId", "effectiveFrom", "frequency", "rate", "defaultLaborContext"]),
  prepare("prepare_save_recurring_component", "Prepare creation or editing of a recurring payroll component with effective dates and lifecycle guards.", ["workers.manage"], componentSchema, ["workerId", "type", "effectiveFrom"]),
  prepare("prepare_save_work_entry", "Prepare creation or editing of an open-period work entry using the existing company-scoped workforce source contract.", ["payroll.manage"], workEntrySchema, ["workerId", "periodId", "workDate", "rate"]),
  prepare("prepare_financial_account", "Prepare creation or descriptive correction of a Cash & Banking account through the guarded account RPC.", ["cash.accounts.manage"], { accountId: uuid, accountType: { type: "string", enum: ["BANK", "EWALLET", "CASH"] }, institutionCode: { type: "string" }, institutionName: { type: "string" }, displayName: { type: "string" }, maskedIdentifier: { type: "string" }, currency: { type: "string" }, openingBalance: { type: "number" }, openingBalanceDate: date, connectionType: { type: "string", enum: ["MANUAL", "STATEMENT", "PROVIDER"] }, provider: { type: "string" }, providerAccountId: { type: "string" } }, ["accountType", "institutionName", "displayName", "currency", "openingBalance", "openingBalanceDate", "connectionType"]),
  prepare("prepare_financial_account_lifecycle", "Prepare deactivation or reactivation of a Cash & Banking account while preserving its financial history.", ["cash.accounts.manage"], { accountId: uuid, action: lifecycle(["DEACTIVATE", "REACTIVATE"]), reason }, ["accountId", "action", "reason"]),
  prepare("prepare_financial_transaction", "Prepare a manual Cash & Banking transaction through the guarded transaction RPC. Imported/provider rows are not created by this operation.", ["cash.transactions.manage"], { transactionId: uuid, accountId: uuid, transactionDate: date, postedAt: { type: "string" }, referenceNumber: { type: "string" }, description: { type: "string" }, direction: { type: "string", enum: ["CREDIT", "DEBIT"] }, amount: { type: "number", minimum: 0.01, maximum: 1000000000 }, currency: { type: "string" } }, ["accountId", "transactionDate", "description", "direction", "amount", "currency"]),
  prepare("prepare_financial_transaction_correction", "Prepare correction of an uncommitted unreconciled manual transaction. Used or imported evidence must be reversed instead.", ["cash.transactions.manage"], { transactionId: uuid, transactionDate: date, postedAt: { type: "string" }, referenceNumber: { type: "string" }, description: { type: "string" }, direction: { type: "string", enum: ["CREDIT", "DEBIT"] }, amount: { type: "number", minimum: 0.01, maximum: 1000000000 }, reason }, ["transactionId", "transactionDate", "description", "direction", "amount", "reason"]),
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

function requiredMoney(value: unknown, label: string) {
  const parsed = optionalNumber(value, label, { min: 0.01, max: 1_000_000_000 });
  if (parsed === undefined) throw new AssistantToolError("INVALID_NUMBER", `${label} is required.`);
  return Math.round(parsed * 100) / 100;
}

function normalizedReason(value: unknown, required = false) {
  return boundedText(value, "reason", 1000, !required);
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

function normalizeAssignment(args: Record<string, unknown>) {
  const assignmentId = optionalUuid(args.assignmentId, "assignmentId") || randomUUID();
  const workerId = requireUuid(args.workerId, "workerId");
  const projectId = requireUuid(args.projectId, "projectId");
  const startDate = normalizeDate(args.startDate, "startDate")!;
  const endDate = normalizeDate(args.endDate, "endDate", false);
  if (endDate && endDate < startDate) throw new AssistantToolError("INVALID_DATE_RANGE", "endDate cannot be before startDate.");
  const rate = args.rate === undefined ? undefined : requiredMoney(args.rate, "rate");
  return { assignmentId, workerId, projectId, startDate, endDate, payType: enumValue(args.payType, "payType", ASSIGNMENT_PAY_TYPES, false), rate, roleOnProject: boundedText(args.roleOnProject, "roleOnProject", 240, false), active: args.active === undefined ? true : args.active === true, notes: boundedText(args.notes, "notes", 2000, false) };
}

function normalizeCompensation(args: Record<string, unknown>) {
  const profileId = optionalUuid(args.profileId, "profileId") || randomUUID();
  const effectiveFrom = normalizeDate(args.effectiveFrom, "effectiveFrom")!;
  const effectiveTo = normalizeDate(args.effectiveTo, "effectiveTo", false);
  if (effectiveTo && effectiveTo < effectiveFrom) throw new AssistantToolError("INVALID_DATE_RANGE", "effectiveTo cannot be before effectiveFrom.");
  const defaultLaborContext = enumValue(args.defaultLaborContext, "defaultLaborContext", LABOR_CONTEXTS)!;
  const defaultProjectId = optionalUuid(args.defaultProjectId, "defaultProjectId");
  if (defaultLaborContext !== "PROJECT" && defaultProjectId) throw new AssistantToolError("INVALID_ARGUMENT", "Only PROJECT compensation can reference a default project.");
  return { profileId, workerId: requireUuid(args.workerId, "workerId"), effectiveFrom, effectiveTo, frequency: enumValue(args.frequency, "frequency", ASSIGNMENT_PAY_TYPES)!, rate: requiredMoney(args.rate, "rate"), defaultLaborContext, defaultProjectId, active: args.active === undefined ? true : args.active === true };
}

function normalizeComponent(args: Record<string, unknown>) {
  const componentId = optionalUuid(args.componentId, "componentId") || randomUUID();
  const effectiveFrom = normalizeDate(args.effectiveFrom, "effectiveFrom")!;
  const effectiveTo = normalizeDate(args.effectiveTo, "effectiveTo", false);
  if (effectiveTo && effectiveTo < effectiveFrom) throw new AssistantToolError("INVALID_DATE_RANGE", "effectiveTo cannot be before effectiveFrom.");
  const amount = args.amount === undefined ? undefined : requiredMoney(args.amount, "amount");
  const rate = args.rate === undefined ? undefined : optionalNumber(args.rate, "rate", { min: 0, max: 100 });
  if (amount === undefined && rate === undefined) throw new AssistantToolError("INVALID_ARGUMENT", "A recurring component needs an amount or rate.");
  return { componentId, workerId: requireUuid(args.workerId, "workerId"), type: enumValue(args.type, "type", COMPONENT_TYPES)!, code: boundedText(args.code, "code", 120, false), name: boundedText(args.name, "name", 240, false), amount, rate, effectiveFrom, effectiveTo, active: args.active === undefined ? true : args.active === true };
}

function normalizeWorkEntry(args: Record<string, unknown>) {
  const entryId = optionalUuid(args.entryId, "entryId") || randomUUID();
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
    case "prepare_save_project_assignment": return normalizeAssignment(args);
    case "prepare_save_compensation_profile": return normalizeCompensation(args);
    case "prepare_save_recurring_component": return normalizeComponent(args);
    case "prepare_save_work_entry": return normalizeWorkEntry(args);
    case "prepare_financial_account": return { accountId: optionalUuid(args.accountId, "accountId") || randomUUID(), accountType: enumValue(args.accountType, "accountType", ACCOUNT_TYPES)!, institutionCode: boundedText(args.institutionCode, "institutionCode", 80, false), institutionName: boundedText(args.institutionName, "institutionName", 160)!, displayName: boundedText(args.displayName, "displayName", 160)!, maskedIdentifier: boundedText(args.maskedIdentifier, "maskedIdentifier", 80, false), currency: boundedText(args.currency, "currency", 3)!.toUpperCase(), openingBalance: args.openingBalance === undefined ? 0 : Number(args.openingBalance), openingBalanceDate: requireDateOnly(args.openingBalanceDate, "openingBalanceDate"), connectionType: enumValue(args.connectionType, "connectionType", CONNECTION_TYPES)!, provider: boundedText(args.provider, "provider", 120, false), providerAccountId: boundedText(args.providerAccountId, "providerAccountId", 240, false) };
    case "prepare_financial_account_lifecycle": return { accountId: requireUuid(args.accountId, "accountId"), action: enumValue(args.action, "action", ["DEACTIVATE", "REACTIVATE"] as const)!, reason: boundedText(args.reason, "reason", 500)! };
    case "prepare_financial_transaction": return { transactionId: optionalUuid(args.transactionId, "transactionId") || randomUUID(), accountId: requireUuid(args.accountId, "accountId"), transactionDate: requireDateOnly(args.transactionDate, "transactionDate"), postedAt: boundedText(args.postedAt, "postedAt", 80, false), referenceNumber: boundedText(args.referenceNumber, "referenceNumber", 160, false), description: boundedText(args.description, "description", 500)!, direction: enumValue(args.direction, "direction", TRANSACTION_DIRECTIONS)!, amount: requiredMoney(args.amount, "amount"), currency: boundedText(args.currency, "currency", 3)!.toUpperCase(), sourceFingerprint: `assistant-${randomUUID()}` };
    case "prepare_financial_transaction_correction": return { transactionId: requireUuid(args.transactionId, "transactionId"), transactionDate: requireDateOnly(args.transactionDate, "transactionDate"), referenceNumber: boundedText(args.referenceNumber, "referenceNumber", 160, false), description: boundedText(args.description, "description", 500)!, direction: enumValue(args.direction, "direction", TRANSACTION_DIRECTIONS)!, amount: requiredMoney(args.amount, "amount"), reason: boundedText(args.reason, "reason", 500)! };
    case "prepare_financial_transaction_lifecycle": return { transactionId: requireUuid(args.transactionId, "transactionId"), action: enumValue(args.action, "action", ["REVERSE", "IGNORE", "RETURN_TO_REVIEW"] as const)!, reason: boundedText(args.reason, "reason", 500)! };
    case "prepare_import_cash_statement": {
      const rows = normalizeStatementRows(args.rows);
      const fileName = boundedText(args.fileName, "fileName", 180)!;
      const sourceType = enumValue(args.sourceType, "sourceType", ["CSV", "XLSX"] as const)!;
      const providedFingerprint = boundedText(args.fileFingerprint, "fileFingerprint", 256, false);
      const fileFingerprint = providedFingerprint || createHash("sha256").update(JSON.stringify({ fileName, rows })).digest("hex");
      const statementFrom = normalizeDate(args.statementFrom, "statementFrom", false);
      const statementTo = normalizeDate(args.statementTo, "statementTo", false);
      if (statementFrom && statementTo && statementFrom > statementTo) throw new AssistantToolError("INVALID_DATE_RANGE", "statementFrom cannot be after statementTo.");
      const currencies = new Set(rows.map((row) => row.currency));
      if (currencies.size !== 1) throw new AssistantToolError("CURRENCY_MISMATCH", "All imported statement rows must use one account currency.");
      return { accountId: requireUuid(args.accountId, "accountId"), sourceType, fileName, fileFingerprint, statementFrom, statementTo, openingBalance: args.openingBalance === undefined ? undefined : Number(args.openingBalance), closingBalance: args.closingBalance === undefined ? undefined : Number(args.closingBalance), rows };
    }
    case "prepare_internal_transfer": return { leftTransactionId: requireUuid(args.leftTransactionId, "leftTransactionId"), rightTransactionId: requireUuid(args.rightTransactionId, "rightTransactionId"), matchedAmount: requiredMoney(args.matchedAmount, "matchedAmount"), transferGroupId: optionalUuid(args.transferGroupId, "transferGroupId") || randomUUID() };
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
  return prepareOperation(context, "prepare_internal_transfer", args, `${left.transaction_date} · ${right.transaction_date}`, { left, right, matchedAmount: args.matchedAmount, historyPolicy: "The transfer RPC rechecks both locked transactions, accounts, amounts, dates, currencies, and existing evidence." });
}

async function prepareCompanyProfile(context: AssistantToolContext, args: Record<string, unknown>) {
  const company = await db(context).from("companies").select("id,name,default_currency,timezone").eq("id", context.auth.companyId).maybeSingle();
  if (company.error || !company.data) throw new AssistantBackendError("TOOL_READ_FAILED", "The deployment company profile could not be read safely.", 503);
  return prepareOperation(context, "prepare_update_company_profile", args, String(company.data.name || "Deployment company"), { current: company.data, changes: { name: args.name, defaultCurrency: args.defaultCurrency, timezone: args.timezone }, companyBoundary: "company_id is fixed to the authenticated deployment company" });
}

async function getCompanyAccessSummary(context: AssistantToolContext): Promise<ToolExecutionResult> {
  const [members, invitations, permissions] = await Promise.all([
    rpc(context, "platform_list_company_member_directory", { p_company_id: context.auth.companyId }),
    rpc(context, "platform_list_company_invitations_with_overrides", { p_company_id: context.auth.companyId }),
    rpc(context, "platform_list_company_permission_catalog", { p_company_id: context.auth.companyId }),
  ]);
  return toolOk({ members: Array.isArray(members) ? members : [], pendingAccess: Array.isArray(invitations) ? invitations : [], assignablePermissions: Array.isArray(permissions) ? permissions : [], semantics: "Access is deployment-company bound. Effective member permissions combine the role preset with explicit GRANT/DENY overrides; pending access is Awaiting signup until the verified email claims it." });
}

async function prepareAccessOperation(context: AssistantToolContext, toolName: string, args: Record<string, unknown>, target: string, extra: Record<string, unknown> = {}) {
  return prepareOperation(context, toolName, args, target, { ...extra, securityBoundary: "The authenticated deployment company and database access RPC remain authoritative." });
}

export async function executeAssistantOperationTool(name: string, args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  switch (name) {
    case "search_work_entries": return searchWorkEntries(context, args);
    case "prepare_save_project_assignment": return prepareAssignment(context, args);
    case "prepare_save_compensation_profile": return prepareCompensation(context, args);
    case "prepare_save_recurring_component": return prepareComponent(context, args);
    case "prepare_save_work_entry": return prepareWorkEntry(context, args);
    case "prepare_financial_account": return prepareFinancialAccount(context, args);
    case "prepare_financial_account_lifecycle": return prepareFinancialAccountLifecycle(context, args);
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
    case "prepare_save_project_assignment": return saveAssignment(context, args);
    case "prepare_save_compensation_profile": return saveCompensationProfile(context, args);
    case "prepare_save_recurring_component": return saveComponent(context, args);
    case "prepare_save_work_entry": return saveWorkEntry(context, args);
    case "prepare_financial_account": return saveFinancialAccount(context, args);
    case "prepare_financial_account_lifecycle": return financialAccountLifecycle(context, args);
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
