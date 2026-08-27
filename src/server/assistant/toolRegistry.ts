import type { FunctionDeclaration } from "@google/genai";
import { requiresAssistantConfirmation } from "../../assistant/confirmationPolicy.ts";
import type { AssistantRiskTier } from "../../assistant/assistantTypes.ts";
import { AssistantBackendError, type AssistantToolContext, type ToolExecutionResult } from "./assistantBackendTypes.ts";
import { normalizeAssistantFunctionDeclarations } from "./assistantGeminiSchemas.ts";
import { boundToolResult, toolError } from "./toolResults.ts";
import { validateToolArguments } from "./toolValidation.ts";
import { requireCompanyPermissions, routePermission } from "./toolAuthorization.ts";
import { executeRegisteredTool } from "./assistantToolExecutors.ts";

type JsonSchema = Record<string, unknown>;
type PermissionResolver = string[] | ((args: Record<string, unknown>) => string[]);

export interface AssistantToolDefinition {
  name: string;
  description: string;
  riskTier: AssistantRiskTier;
  permissions: PermissionResolver;
  parametersJsonSchema: JsonSchema;
  requiresConfirmation: boolean;
}

const uuid = { type: "string", description: "InvoiceApp identifier supplied by a prior tool result or display context." };
const date = { type: "string", description: "Calendar date in YYYY-MM-DD format." };
const limit = { type: "integer", minimum: 1, maximum: 50 };
const noArgs = { type: "object", properties: {}, additionalProperties: false };

function objectSchema(properties: Record<string, unknown>, required: string[] = []): JsonSchema {
  return { type: "object", properties, required, additionalProperties: false };
}

function read(name: string, description: string, permissions: PermissionResolver, properties: Record<string, unknown> = {}, required: string[] = []): AssistantToolDefinition {
  return { name, description, permissions, riskTier: "READ", parametersJsonSchema: objectSchema(properties, required), requiresConfirmation: false };
}

function navigation(name: string, description: string, permissions: PermissionResolver, properties: Record<string, unknown>, required: string[]): AssistantToolDefinition {
  return { name, description, permissions, riskTier: "NAVIGATION", parametersJsonSchema: objectSchema(properties, required), requiresConfirmation: false };
}

function prepare(name: string, description: string, permissions: PermissionResolver, properties: Record<string, unknown>, required: string[] = []): AssistantToolDefinition {
  const riskTier = "PREPARE" as const;
  return { name, description, permissions, riskTier, parametersJsonSchema: objectSchema(properties, required), requiresConfirmation: requiresAssistantConfirmation(riskTier) };
}

function mutation(name: string, description: string, permissions: PermissionResolver, properties: Record<string, unknown>, required: string[] = []): AssistantToolDefinition {
  const riskTier = "NORMAL_MUTATION" as const;
  return { name, description, permissions, riskTier, parametersJsonSchema: objectSchema(properties, required), requiresConfirmation: true };
}

function finalization(name: string, description: string, permissions: PermissionResolver, properties: Record<string, unknown>, required: string[] = []): AssistantToolDefinition {
  const riskTier = "FINANCIAL_FINALIZATION" as const;
  return { name, description, permissions, riskTier, parametersJsonSchema: objectSchema(properties, required), requiresConfirmation: true };
}

export const ASSISTANT_TOOL_DEFINITIONS: readonly AssistantToolDefinition[] = Object.freeze([
  read("search_invoices", "Search company invoices by number, vendor, review status, or payment status. Return bounded source records.", ["invoices.read"], { query: { type: "string" }, invoiceNumber: { type: "string" }, vendor: { type: "string" }, reviewStatus: { type: "string" }, paymentStatus: { type: "string" }, limit }),
  read("get_invoice", "Get one company invoice and its review metadata.", ["invoices.read"], { invoiceId: uuid }, ["invoiceId"]),
  read("list_review_queue", "List invoices that require human review.", ["invoices.read"], { limit }),
  read("search_projects", "Search company projects by name, code, client, or status.", ["projects.read"], { query: { type: "string" }, status: { type: "string" }, limit }),
  read("get_project", "Get one company project.", ["projects.read"], { projectId: uuid }, ["projectId"]),
  read("get_project_cost_summary", "Return bounded source-cost totals for one project without claiming accounting authority.", ["projects.read", "reports.financial.read"], { projectId: uuid }, ["projectId"]),
  read("list_expenses", "List bounded company expenses with optional project, date, and status filters.", ["expenses.read"], { projectId: uuid, status: { type: "string" }, from: date, to: date, query: { type: "string" }, limit }),
  read("get_expense_summary", "Return bounded source expense totals for a date range or project.", ["expenses.read", "reports.financial.read"], { projectId: uuid, from: date, to: date, currency: { type: "string" } }),
  read("search_vendors", "Search company vendors by name or contact fields.", ["vendors.read"], { query: { type: "string" }, limit }),
  read("get_vendor_summary", "Return a bounded summary of one company vendor and related invoices.", ["vendors.read", "invoices.read"], { vendorId: uuid }, ["vendorId"]),
  read("search_workers", "Search company workers by code, name, job title, or department.", ["workers.read"], { query: { type: "string" }, active: { type: "boolean" }, limit }),
  read("get_worker", "Get one company worker.", ["workers.read"], { workerId: uuid }, ["workerId"]),
  prepare("prepare_create_worker", "Prepare creation of one active company worker. Map salary per day to DAILY and salary per hour to HOURLY; confirmation is required before anything is written.", ["workers.manage"], {
    firstName: { type: "string" }, middleName: { type: "string" }, lastName: { type: "string" },
    employeeCode: { type: "string", description: "Optional existing employee code; a deterministic company-unique code is generated when omitted." },
    employmentType: { type: "string", enum: ["REGULAR", "PROJECT_BASED", "CONTRACTUAL", "DAILY", "HOURLY", "OTHER"] },
    employmentStatus: { type: "string", enum: ["ACTIVE", "INACTIVE", "ONBOARDING", "OFFBOARDED"] },
    jobTitle: { type: "string" }, departmentId: uuid, department: { type: "string" },
    defaultPayType: { type: "string", enum: ["MONTHLY", "DAILY", "HOURLY"], description: "Use DAILY for a salary stated per day." },
    defaultRate: { type: "number", minimum: 0, maximum: 1000000000, description: "Numeric rate in the existing company payroll currency." },
    active: { type: "boolean" }, hireDate: date, notes: { type: "string" },
  }, ["firstName", "lastName", "defaultPayType", "defaultRate"]),
  read("get_attendance_day", "Get attendance records for one calendar date in the workspace timezone.", ["payroll.detail.read"], { date, workerId: uuid }, ["date"]),
  read("get_attendance_period_summary", "Summarize bounded attendance, leave, and overtime source records.", ["payroll.detail.read"], { periodId: uuid, from: date, to: date }),
  read("get_payroll_period", "Get one payroll period and its bounded runs.", ["payroll.summary.read"], { periodId: uuid }, ["periodId"]),
  read("get_payroll_run", "Get one payroll run summary and bounded entries.", ["payroll.detail.read"], { runId: uuid }, ["runId"]),
  read("get_payroll_readiness", "Check persisted payroll source freshness, status, and blockers without calculating a run.", ["payroll.detail.read"], { periodId: uuid }, ["periodId"]),
  read("get_payroll_exceptions", "Return the current deterministic payroll blockers and warnings for a period.", ["payroll.detail.read"], { periodId: uuid }, ["periodId"]),
  read("get_payroll_summary", "Return a bounded payroll period summary without calculating authoritative figures in the model.", ["payroll.summary.read"], { periodId: uuid }, ["periodId"]),
  read("list_payroll_periods", "List bounded company payroll periods and identify current and next using the workspace timezone. Future DRAFT periods remain scheduled and are never described as current.", ["payroll.summary.read"], { status: { type: "string" }, from: date, to: date, limit }),
  read("get_current_workspace_summary", "Return a small company workspace summary using only permitted aggregate reads.", ["dashboard.read"]),
  read("get_cash_summary", "Return a company cash and bank summary with account balances grouped by currency, reconciliation status, and balance freshness.", ["cash.summary.read"], { currency: { type: "string" } }),
  read("list_financial_accounts", "List active financial bank and e-wallet accounts with masked identifiers and latest balances.", ["cash.summary.read"], { currency: { type: "string" }, accountType: { type: "string", enum: ["BANK", "EWALLET", "CASH"] }, limit }),
  read("get_financial_account", "Get one financial account, latest balance snapshot, and recent activity summary.", ["cash.summary.read"], { accountId: uuid }, ["accountId"]),
  read("list_financial_transactions", "List company bank and e-wallet transactions with date, direction, and reconciliation filters.", ["cash.transactions.read"], { accountId: uuid, from: date, to: date, direction: { type: "string", enum: ["CREDIT", "DEBIT"] }, reconciliationStatus: { type: "string" }, limit }),
  read("get_cash_reconciliation_summary", "Return a reconciliation summary across financial accounts, matched transactions, and pending items.", ["cash.summary.read", "cash.transactions.read"], { accountId: uuid }),

  navigation("navigate_to", "Navigate to an allowlisted InvoiceApp route.", (args) => [routePermission(args.routeId)], { routeId: { type: "string", enum: ["dashboard", "cash", "projects", "extract", "invoices", "payroll", "expenses", "vendors", "reports", "inbox", "review", "settings"] } }, ["routeId"]),
  navigation("navigate_to_project", "Open a company project in the app.", ["projects.read"], { projectId: uuid }, ["projectId"]),
  navigation("navigate_to_invoice", "Open a company invoice in the app.", ["invoices.read"], { invoiceId: uuid }, ["invoiceId"]),
  navigation("navigate_to_review_invoice", "Open a company invoice in the review screen.", ["invoices.read"], { invoiceId: uuid }, ["invoiceId"]),
  navigation("navigate_to_payroll_period", "Open a company payroll period.", ["payroll.summary.read"], { periodId: uuid }, ["periodId"]),
  navigation("navigate_to_attendance_date", "Open attendance for a calendar date.", ["payroll.detail.read"], { date }, ["date"]),
  read("search_help", "Search the built-in InvoiceApp help topics. Never use this tool for web search.", ["dashboard.read"], { query: { type: "string" } }, ["query"]),
  read("get_feature_help", "Get a built-in help topic for an allowlisted feature.", ["dashboard.read"], { feature: { type: "string" } }, ["feature"]),
  navigation("start_tour", "Start an allowlisted in-app tour.", ["dashboard.read"], { tourId: { type: "string", enum: ["invoiceapp-overview", "cash-banking", "first-invoice", "gmail-import", "projects-costing", "engineering-documents", "payroll-basics", "attendance-overtime", "payroll-run", "reports", "assistant-basics"] } }, ["tourId"]),

  prepare("prepare_process_attached_invoice", "Prepare extraction and draft creation from an attached invoice PDF or image file. Confirmation is required before the invoice is created.", ["invoices.extract", "invoices.read"], { fileName: { type: "string" }, notes: { type: "string" } }),
  prepare("prepare_attendance_batch", "Prepare a bounded attendance batch preview. Confirmation is required before records are written.", ["payroll.manage"], { records: { type: "array", minItems: 1, maxItems: 50, items: objectSchema({ workerId: uuid, periodId: uuid, attendanceDate: date, attendanceStatus: { type: "string" }, recordStatus: { type: "string" }, scheduledStart: { type: "string" }, scheduledEnd: { type: "string" }, scheduledMinutes: { type: "integer" }, breakMinutes: { type: "integer" }, actualTimeIn: { type: "string" }, actualTimeOut: { type: "string" }, regularMinutes: { type: "integer" }, lateMinutes: { type: "integer" }, undertimeMinutes: { type: "integer" }, overtimeMinutes: { type: "integer" }, paidDayFraction: { type: "number" }, notes: { type: "string" } }, ["workerId", "attendanceDate"]) } }, ["records"]),
  prepare("prepare_attendance_roster", "Build an expected attendance roster for one date, excluding inactive workers, rest days, approved leave, and holidays, then prepare the requested absences/presence batch.", ["payroll.manage"], { attendanceDate: date, periodId: uuid, absentWorkerIds: { type: "array", items: uuid }, presentAllExpected: { type: "boolean" } }, ["attendanceDate", "presentAllExpected"]),
  prepare("record_presence", "Prepare a single present attendance record using the same domain normalization as the manual workspace.", ["payroll.manage"], { workerId: uuid, periodId: uuid, attendanceDate: date, actualTimeIn: { type: "string" }, actualTimeOut: { type: "string" }, scheduledStart: { type: "string" }, scheduledEnd: { type: "string" }, scheduledMinutes: { type: "integer" }, notes: { type: "string" } }, ["workerId", "attendanceDate"]),
  prepare("record_absence", "Prepare a single absent attendance record that clears payable time and actual clocks.", ["payroll.manage"], { workerId: uuid, periodId: uuid, attendanceDate: date, notes: { type: "string" } }, ["workerId", "attendanceDate"]),
  prepare("prepare_leave_request", "Prepare a leave request preview. Confirmation is required before the request is created.", ["payroll.manage"], { workerId: uuid, leaveType: { type: "string" }, startDate: date, endDate: date, partialDay: { type: "string", enum: ["FULL", "AM", "PM"] }, paid: { type: "boolean" }, notes: { type: "string" } }, ["workerId", "leaveType", "startDate", "endDate"]),
  prepare("approve_leave", "Prepare approval of an existing pending leave request. Confirmation is required.", ["payroll.manage"], { requestId: uuid }, ["requestId"]),
  prepare("reject_leave", "Prepare rejection of an existing pending leave request. Confirmation is required.", ["payroll.manage"], { requestId: uuid, reason: { type: "string" } }, ["requestId"]),
  prepare("cancel_leave", "Prepare cancellation of an existing leave request. Confirmation is required.", ["payroll.manage"], { requestId: uuid, reason: { type: "string" } }, ["requestId"]),
  prepare("prepare_overtime_request", "Prepare an overtime request preview. Confirmation is required before the request is created.", ["payroll.manage"], { workerId: uuid, periodId: uuid, overtimeDate: date, projectId: uuid, laborContext: { type: "string" }, requestedMinutes: { type: "integer", minimum: 1, maximum: 1440 }, reason: { type: "string" }, notes: { type: "string" } }, ["workerId", "overtimeDate", "requestedMinutes"]),
  prepare("approve_overtime", "Prepare approval of an existing pending overtime request. Confirmation is required.", ["payroll.manage"], { requestId: uuid, approvedMinutes: { type: "integer", minimum: 0, maximum: 1440 } }, ["requestId"]),
  prepare("reject_overtime", "Prepare rejection of an existing pending overtime request. Confirmation is required.", ["payroll.manage"], { requestId: uuid, reason: { type: "string" } }, ["requestId"]),
  prepare("cancel_overtime", "Prepare cancellation of an existing overtime request. Confirmation is required.", ["payroll.manage"], { requestId: uuid, reason: { type: "string" } }, ["requestId"]),
  prepare("prepare_payroll_recalculation", "Prepare a deterministic recalculation preview for an open payroll run. Confirmation is required before entries are replaced.", ["payroll.manage"], { periodId: uuid, runId: uuid }, ["periodId"]),
  mutation("create_expense_draft", "Prepare creation of a draft expense after validating its project and fields.", ["expenses.manage"], { projectId: uuid, expenseDate: date, category: { type: "string" }, description: { type: "string" }, payee: { type: "string" }, amount: { type: "number", minimum: 0 }, currency: { type: "string" }, paymentMethod: { type: "string" }, referenceNumber: { type: "string" }, notes: { type: "string" } }, ["expenseDate", "category", "description", "amount"]),
  mutation("create_project_draft", "Prepare creation of a planning project draft.", ["projects.manage"], { projectCode: { type: "string" }, projectName: { type: "string" }, description: { type: "string" }, clientName: { type: "string" }, projectBudget: { type: "number", minimum: 0 }, currency: { type: "string" } }, ["projectCode", "projectName"]),
  mutation("assign_invoice_to_project", "Prepare a validated invoice-to-project allocation without verifying or deleting the invoice.", ["projects.manage", "invoices.read"], { invoiceId: uuid, projectId: uuid, allocationAmount: { type: "number", minimum: 0 }, allocationPercentage: { type: "number", minimum: 0, maximum: 100 }, notes: { type: "string" } }, ["invoiceId", "projectId"]),
  mutation("update_invoice_draft", "Prepare a limited update to an unverified invoice draft. Verification remains manual.", ["invoices.manage"], { invoiceId: uuid, invoiceNumber: { type: "string" }, dueDate: date, projectReference: { type: "string" }, notes: { type: "string" } }, ["invoiceId"]),
  finalization("approve_payroll", "Prepare approval of a calculated payroll run after source freshness and entry checks. Confirmation is required.", ["payroll.approve"], { runId: uuid }, ["runId"]),
  finalization("mark_payroll_paid", "Prepare marking an approved payroll run as paid. Confirmation is required.", ["payroll.approve"], { runId: uuid }, ["runId"]),
]);

const DEFINITIONS_BY_NAME = new Map(ASSISTANT_TOOL_DEFINITIONS.map((definition) => [definition.name, definition]));

export function getAssistantToolDefinition(name: string) {
  return DEFINITIONS_BY_NAME.get(name);
}

export function assistantFunctionDeclarations(): FunctionDeclaration[] {
  return normalizeAssistantFunctionDeclarations(ASSISTANT_TOOL_DEFINITIONS);
}

function permissionsFor(definition: AssistantToolDefinition, args: Record<string, unknown>) {
  return typeof definition.permissions === "function" ? definition.permissions(args) : definition.permissions;
}

export async function executeAssistantTool(name: string, rawArgs: unknown, context: AssistantToolContext): Promise<ToolExecutionResult> {
  const definition = getAssistantToolDefinition(name);
  if (!definition) return toolError("UNKNOWN_TOOL", "That operation is not available in InvoiceApp.");
  let args: Record<string, unknown>;
  try {
    args = validateToolArguments(name, rawArgs);
    await requireCompanyPermissions({ supabase: context.auth.supabase, companyId: context.auth.companyId, userId: context.auth.user.id, context: context.context }, permissionsFor(definition, args));
  } catch (error) {
    if (error instanceof AssistantBackendError) return toolError(error.code, error.message);
    return toolError("TOOL_VALIDATION_FAILED", "The operation arguments could not be validated.");
  }
  try {
    return boundToolResult(await executeRegisteredTool(name, args, context));
  } catch (error) {
    if (error instanceof AssistantBackendError) return toolError(error.code, error.message);
    return toolError("TOOL_FAILED", "The operation could not be completed safely.");
  }
}
