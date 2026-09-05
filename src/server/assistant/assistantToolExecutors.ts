import { randomUUID } from "node:crypto";
import { calculatePayrollRunFromWorkEntries } from "../../lib/payrollCalculation.ts";
import { applyAttendanceBatch, buildDailyRoster, type AttendanceRecordInput } from "../../lib/payrollWorkforce.ts";
import { normalizedInvoiceAllocationAmount } from "../../utils/projectCosting.ts";
import type { AssistantClientAction, AssistantReference } from "../../assistant/assistantTypes.ts";
import { BRAND } from "../../config/brand.ts";
import { getHelpEntry, getHelpResponse, helpEntryPath, helpEntryReference } from "../../assistant/helpCatalog.ts";
import { getAssistantTour } from "../../assistant/tourRegistry.ts";
import { AssistantToolError, type AssistantRow, type AssistantToolContext, type ToolExecutionResult } from "./assistantBackendTypes.ts";
import { toolOk } from "./toolResults.ts";

type DbClient = any;
type Row = AssistantRow & { id?: string; status?: string };

const INVOICE_SELECT = "id,invoice_number,invoice_date,due_date,currency,grand_total,payment_status,review_status,duplicate_status,duplicate_of_id,document_type,vendor_id,current_data,verified_at,archived_at,lifecycle_status,voided_at,voided_by_user_id,void_reason,created_at,updated_at";
const PROJECT_SELECT = "id,project_code,project_name,description,client_name,client_reference,location,site_address,project_manager,status,start_date,target_end_date,actual_end_date,contract_value,project_budget,currency,notes,created_at,updated_at,archived_at";
const EXPENSE_SELECT = "id,project_id,expense_date,category,description,payee,amount,currency,payment_method,reference_number,status,notes,created_at,updated_at,archived_at,voided_at,voided_by_user_id,void_reason";
const WORKER_SELECT = "id,employee_code,first_name,middle_name,last_name,display_name,employment_type,employment_status,job_title,department,department_id,manager_worker_id,default_pay_type,default_rate,active,hire_date,end_date,working_days,working_hours_start,working_hours_end,notes,created_at,updated_at,archived_at";
const ATTENDANCE_SELECT = "id,worker_id,period_id,attendance_date,scheduled_start,scheduled_end,scheduled_minutes,break_minutes,actual_time_in,actual_time_out,regular_minutes,late_minutes,undertime_minutes,overtime_minutes,paid_day_fraction,attendance_status,record_status,source,notes,created_by,updated_by,created_at,updated_at";
const LEAVE_SELECT = "id,worker_id,leave_type,start_date,end_date,partial_day,paid,status,notes,created_by,updated_by,created_at,updated_at";
const OVERTIME_SELECT = "id,worker_id,period_id,overtime_date,project_id,labor_context,requested_minutes,approved_minutes,reason,status,approved_by,approved_at,notes,source,created_by,updated_by,created_at,updated_at";
const PERIOD_SELECT = "id,period_start,period_end,pay_date,schedule_id,schedule_version_id,auto_generated,locked_at,source_revision,source_revision_updated_at,status,notes,created_at,updated_at";
const RUN_SELECT = "id,period_id,status,created_at,calculated_at,calculated_source_revision,source_fingerprint,approved_at,paid_at,notes";
const FINANCIAL_ACCOUNT_SELECT = "id,account_type,institution_code,institution_name,display_name,masked_identifier,currency,opening_balance,opening_balance_date,connection_type,provider,provider_account_id,active,created_at,updated_at";
const FINANCIAL_SNAPSHOT_SELECT = "id,account_id,captured_at,ledger_balance,available_balance,pending_balance,source,import_batch_id,created_at";
const FINANCIAL_TRANSACTION_SELECT = "id,account_id,transaction_date,posted_at,reference_number,description,direction,amount,currency,running_balance,status,source,reconciliation_status,transfer_group_id,created_at,updated_at";
const ALLOWED_ROUTE_IDS = new Set(["dashboard", "cash", "projects", "extract", "invoices", "payroll", "expenses", "vendors", "reports", "inbox", "review", "settings"]);

function isAssistantRouteId(value: string): boolean {
  return ALLOWED_ROUTE_IDS.has(value);
}

function db(context: AssistantToolContext): DbClient {
  return context.auth.supabase as DbClient;
}

function userCompanyQuery(context: AssistantToolContext, table: string, select: string) {
  // Business records are company-scoped, not private to the user who first
  // created them. RLS and the per-tool permission check remain authoritative.
  return db(context).from(table).select(select).eq("company_id", context.auth.companyId);
}

function companyQuery(context: AssistantToolContext, table: string, select: string) {
  return db(context).from(table).select(select).eq("company_id", context.auth.companyId);
}

async function getRows(query: PromiseLike<{ data: unknown; error: unknown }>, label: string): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw new AssistantToolError("DATA_UNAVAILABLE", `${label} is temporarily unavailable.`);
  return Array.isArray(data) ? data as Row[] : [];
}

async function getOne(query: PromiseLike<{ data: unknown; error: unknown }>, label: string): Promise<Row | null> {
  const { data, error } = await query;
  if (error) throw new AssistantToolError("DATA_UNAVAILABLE", `${label} is temporarily unavailable.`);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as Row;
}

function requireFound<T extends Row>(row: T | null, message: string): T {
  if (!row) throw new AssistantToolError("NOT_FOUND", message);
  return row;
}

function text(row: Row, key: string, fallback = "") {
  const value = row[key];
  return value === null || value === undefined ? fallback : String(value);
}

function optionalText(row: Row, key: string) {
  const value = row[key];
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function amount(row: Row, key: string) {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : 0;
}

function bool(row: Row, key: string, fallback = false) {
  return row[key] === undefined || row[key] === null ? fallback : Boolean(row[key]);
}

function safeLabel(...values: unknown[]) {
  return values.map((value) => String(value || "").trim()).filter(Boolean).join(" — ") || "Record";
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function dateRange(args: Record<string, unknown>) {
  const from = typeof args.from === "string" ? args.from : undefined;
  const to = typeof args.to === "string" ? args.to : undefined;
  if (from && to && from > to) throw new AssistantToolError("INVALID_DATE_RANGE", "The start date cannot be after the end date.");
  return { from, to };
}

function reference(type: AssistantReference["type"], id: string, label: string): AssistantReference {
  return { type, id, label };
}

async function getInvoice(context: AssistantToolContext, invoiceId: string) {
  return requireFound(await getOne(userCompanyQuery(context, "invoices", INVOICE_SELECT).eq("id", invoiceId).is("archived_at", null).maybeSingle(), "Invoice"), "Invoice was not found in this company.");
}

async function getProject(context: AssistantToolContext, projectId: string) {
  return requireFound(await getOne(userCompanyQuery(context, "projects", PROJECT_SELECT).eq("id", projectId).maybeSingle(), "Project"), "Project was not found in this company.");
}

async function getWorker(context: AssistantToolContext, workerId: string) {
  return requireFound(await getOne(userCompanyQuery(context, "workers", WORKER_SELECT).eq("id", workerId).maybeSingle(), "Worker"), "Worker was not found in this company.");
}

async function getPeriod(context: AssistantToolContext, periodId: string) {
  return requireFound(await getOne(userCompanyQuery(context, "payroll_periods", PERIOD_SELECT).eq("id", periodId).maybeSingle(), "Payroll period"), "Payroll period was not found in this company.");
}

async function getRun(context: AssistantToolContext, runId: string) {
  return requireFound(await getOne(userCompanyQuery(context, "payroll_runs", RUN_SELECT).eq("id", runId).maybeSingle(), "Payroll run"), "Payroll run was not found in this company.");
}

function invoiceView(row: Row) {
  return {
    id: text(row, "id"),
    invoiceNumber: optionalText(row, "invoice_number"),
    invoiceDate: optionalText(row, "invoice_date"),
    dueDate: optionalText(row, "due_date"),
    currency: optionalText(row, "currency"),
    grandTotal: amount(row, "grand_total"),
    paymentStatus: text(row, "payment_status"),
    reviewStatus: text(row, "review_status"),
    duplicateStatus: text(row, "duplicate_status"),
    documentType: text(row, "document_type"),
    vendorId: optionalText(row, "vendor_id"),
    verifiedAt: optionalText(row, "verified_at"),
    lifecycleStatus: text(row, "lifecycle_status", "ACTIVE"),
    voidedAt: optionalText(row, "voided_at"),
    voidedByUserId: optionalText(row, "voided_by_user_id"),
    voidReason: optionalText(row, "void_reason"),
    archivedAt: optionalText(row, "archived_at"),
    createdAt: optionalText(row, "created_at"),
  };
}

function projectView(row: Row) {
  return {
    id: text(row, "id"),
    code: text(row, "project_code"),
    name: text(row, "project_name"),
    description: optionalText(row, "description"),
    clientName: optionalText(row, "client_name"),
    clientReference: optionalText(row, "client_reference"),
    location: optionalText(row, "location"),
    projectManager: optionalText(row, "project_manager"),
    status: text(row, "status"),
    startDate: optionalText(row, "start_date"),
    targetEndDate: optionalText(row, "target_end_date"),
    budget: amount(row, "project_budget"),
    currency: text(row, "currency", "PHP"),
    createdAt: optionalText(row, "created_at"),
    updatedAt: optionalText(row, "updated_at"),
  };
}

function expenseView(row: Row) {
  return {
    id: text(row, "id"),
    projectId: optionalText(row, "project_id"),
    date: text(row, "expense_date"),
    category: text(row, "category"),
    description: text(row, "description"),
    payee: optionalText(row, "payee"),
    amount: amount(row, "amount"),
    currency: text(row, "currency", "PHP"),
    status: text(row, "status"),
    referenceNumber: optionalText(row, "reference_number"),
    archivedAt: optionalText(row, "archived_at"),
    voidedAt: optionalText(row, "voided_at"),
    voidedByUserId: optionalText(row, "voided_by_user_id"),
    voidReason: optionalText(row, "void_reason"),
  };
}

function workerView(row: Row) {
  return {
    id: text(row, "id"),
    employeeCode: text(row, "employee_code"),
    displayName: text(row, "display_name", safeLabel(row.first_name, row.last_name)),
    employmentType: text(row, "employment_type"),
    employmentStatus: optionalText(row, "employment_status"),
    jobTitle: optionalText(row, "job_title"),
    department: optionalText(row, "department"),
    payType: text(row, "default_pay_type"),
    active: bool(row, "active", true),
    hireDate: optionalText(row, "hire_date"),
    endDate: optionalText(row, "end_date"),
  };
}

function periodView(row: Row) {
  return {
    id: text(row, "id"),
    startDate: text(row, "period_start"),
    endDate: text(row, "period_end"),
    payDate: optionalText(row, "pay_date"),
    status: text(row, "status"),
    sourceRevision: Number.isFinite(Number(row.source_revision)) ? Number(row.source_revision) : 0,
    locked: Boolean(row.locked_at) || ["APPROVED", "PAID", "VOID"].includes(text(row, "status")),
    lockedAt: optionalText(row, "locked_at"),
    scheduleId: optionalText(row, "schedule_id"),
    notes: optionalText(row, "notes"),
  };
}

function runView(row: Row) {
  return {
    id: text(row, "id"),
    periodId: text(row, "period_id"),
    status: text(row, "status"),
    createdAt: optionalText(row, "created_at"),
    calculatedAt: optionalText(row, "calculated_at"),
    calculatedSourceRevision: row.calculated_source_revision === null || row.calculated_source_revision === undefined ? undefined : Number(row.calculated_source_revision),
    sourceFingerprint: optionalText(row, "source_fingerprint"),
    approvedAt: optionalText(row, "approved_at"),
    paidAt: optionalText(row, "paid_at"),
  };
}

function financialAccountView(row: Row, latestSnapshot?: Row | null) {
  return {
    id: text(row, "id"),
    accountType: text(row, "account_type"),
    institutionCode: optionalText(row, "institution_code"),
    institutionName: text(row, "institution_name"),
    displayName: text(row, "display_name"),
    maskedIdentifier: optionalText(row, "masked_identifier"),
    currency: text(row, "currency", "PHP"),
    openingBalance: amount(row, "opening_balance"),
    openingBalanceDate: text(row, "opening_balance_date"),
    connectionType: text(row, "connection_type", "MANUAL"),
    provider: optionalText(row, "provider"),
    active: bool(row, "active", true),
    latestBalance: latestSnapshot ? {
      ledgerBalance: amount(latestSnapshot, "ledger_balance"),
      availableBalance: latestSnapshot.available_balance !== null && latestSnapshot.available_balance !== undefined ? amount(latestSnapshot, "available_balance") : undefined,
      pendingBalance: latestSnapshot.pending_balance !== null && latestSnapshot.pending_balance !== undefined ? amount(latestSnapshot, "pending_balance") : undefined,
      source: text(latestSnapshot, "source", "MANUAL"),
      capturedAt: optionalText(latestSnapshot, "captured_at"),
    } : {
      ledgerBalance: amount(row, "opening_balance"),
      source: "OPENING_BALANCE",
      capturedAt: optionalText(row, "opening_balance_date"),
    },
    createdAt: optionalText(row, "created_at"),
    updatedAt: optionalText(row, "updated_at"),
  };
}

function financialTransactionView(row: Row) {
  return {
    id: text(row, "id"),
    accountId: text(row, "account_id"),
    transactionDate: text(row, "transaction_date"),
    postedAt: optionalText(row, "posted_at"),
    referenceNumber: optionalText(row, "reference_number"),
    description: text(row, "description"),
    direction: text(row, "direction"),
    amount: amount(row, "amount"),
    currency: text(row, "currency", "PHP"),
    runningBalance: row.running_balance !== null && row.running_balance !== undefined ? amount(row, "running_balance") : undefined,
    status: text(row, "status"),
    source: text(row, "source"),
    reconciliationStatus: text(row, "reconciliation_status"),
    isTransfer: Boolean(row.transfer_group_id),
    createdAt: optionalText(row, "created_at"),
  };
}

async function searchInvoices(context: AssistantToolContext, args: Record<string, unknown>) {
  const queryText = typeof args.query === "string" ? args.query : typeof args.invoiceNumber === "string" ? args.invoiceNumber : undefined;
  const limit = Number(args.limit || 20);
  let query = userCompanyQuery(context, "invoices", INVOICE_SELECT).is("archived_at", null).order("created_at", { ascending: false }).limit(limit);
  if (typeof args.reviewStatus === "string") query = query.eq("review_status", args.reviewStatus);
  if (typeof args.paymentStatus === "string") query = query.eq("payment_status", args.paymentStatus);
  if (queryText) query = query.ilike("invoice_number", `%${escapeLike(queryText)}%`);
  const invoices = await getRows(query, "Invoice search");
  let filtered = invoices;
  if (typeof args.vendor === "string" && args.vendor.trim()) {
    const vendors = await getRows(userCompanyQuery(context, "vendors", "id,name,normalized_name").ilike("name", `%${escapeLike(args.vendor.trim())}%`).limit(limit), "Vendor search");
    const vendorIds = new Set(vendors.map((vendor) => text(vendor, "id")));
    filtered = invoices.filter((invoice) => vendorIds.has(text(invoice, "vendor_id")));
  }
  return toolOk({ records: filtered.slice(0, limit).map(invoiceView), count: Math.min(filtered.length, limit), source: "persisted invoice records" }, { references: filtered.slice(0, limit).map((row) => reference("invoice", text(row, "id"), safeLabel(row.invoice_number, row.invoice_date))) });
}

async function getInvoiceTool(context: AssistantToolContext, args: Record<string, unknown>) {
  const row = await getInvoice(context, String(args.invoiceId));
  const vendor = row.vendor_id ? await getOne(userCompanyQuery(context, "vendors", "id,name,email,phone,tax_id,default_currency").eq("id", String(row.vendor_id)).maybeSingle(), "Vendor") : null;
  const reviewEvents = await getRows(userCompanyQuery(context, "invoice_review_events", "id,event_type,field_name,previous_value,new_value,created_at").eq("invoice_id", String(row.id)).order("created_at", { ascending: false }).limit(20), "Invoice review history");
  return toolOk({ invoice: { ...invoiceView(row), vendor: vendor ? { id: text(vendor, "id"), name: text(vendor, "name"), email: optionalText(vendor, "email"), phone: optionalText(vendor, "phone") } : undefined, reviewEvents: reviewEvents.map((event) => ({ eventType: text(event, "event_type"), field: optionalText(event, "field_name"), createdAt: optionalText(event, "created_at") })) } }, { references: [reference("invoice", text(row, "id"), safeLabel(row.invoice_number, row.invoice_date))] });
}

async function listReviewQueue(context: AssistantToolContext, args: Record<string, unknown>) {
  const limit = Number(args.limit || 20);
  const rows = await getRows(userCompanyQuery(context, "invoices", INVOICE_SELECT).eq("review_status", "NEEDS_REVIEW").neq("lifecycle_status", "VOID").is("archived_at", null).order("created_at", { ascending: true }).limit(limit), "Review queue");
  return toolOk({ records: rows.map(invoiceView), count: rows.length, label: "Invoices needing review" }, { references: rows.map((row) => reference("invoice", text(row, "id"), safeLabel(row.invoice_number, row.invoice_date))), clientActions: rows.length ? [{ type: "OPEN_REVIEW_INVOICE", entityId: text(rows[0], "id"), label: "Open review queue" }] : [] });
}

async function searchProjects(context: AssistantToolContext, args: Record<string, unknown>) {
  const limit = Number(args.limit || 20);
  let query = userCompanyQuery(context, "projects", PROJECT_SELECT).order("updated_at", { ascending: false }).limit(limit);
  if (typeof args.status === "string") query = query.eq("status", args.status);
  if (typeof args.query === "string" && args.query.trim()) query = query.ilike("project_name", `%${escapeLike(args.query.trim())}%`);
  const rows = await getRows(query, "Project search");
  return toolOk({ records: rows.map(projectView), count: rows.length }, { references: rows.map((row) => reference("project", text(row, "id"), safeLabel(row.project_code, row.project_name))) });
}

async function getProjectTool(context: AssistantToolContext, args: Record<string, unknown>) {
  const row = await getProject(context, String(args.projectId));
  const [invoiceAllocations, expenses, assignments] = await Promise.all([
    getRows(userCompanyQuery(context, "invoice_project_allocations", "id,invoice_id,allocation_amount,allocation_percentage,allocation_type,notes").eq("project_id", String(row.id)).limit(50), "Project invoice allocations"),
    getRows(userCompanyQuery(context, "expenses", EXPENSE_SELECT).eq("project_id", String(row.id)).order("expense_date", { ascending: false }).limit(50), "Project expenses"),
    getRows(userCompanyQuery(context, "project_worker_assignments", "id,worker_id,project_id,start_date,end_date,pay_type,rate,role_on_project,active").eq("project_id", String(row.id)).order("start_date", { ascending: false }).limit(50), "Project worker assignments"),
  ]);
  return toolOk({ project: projectView(row), invoiceAllocations, expenses: expenses.map(expenseView), workerAssignments: assignments }, { references: [reference("project", text(row, "id"), safeLabel(row.project_code, row.project_name))] });
}

async function getProjectCostSummary(context: AssistantToolContext, args: Record<string, unknown>) {
  const projectId = String(args.projectId);
  const project = await getProject(context, projectId);
  const allocations = await getRows(userCompanyQuery(context, "invoice_project_allocations", "invoice_id,allocation_type,allocation_percentage,allocation_amount,currency").eq("project_id", projectId).limit(500), "Project invoice allocations");
  const invoiceIds = allocations.map((row) => text(row, "invoice_id")).filter(Boolean);
  const invoices = invoiceIds.length ? await getRows(userCompanyQuery(context, "invoices", "id,review_status,payment_status,invoice_date,currency,grand_total,archived_at,lifecycle_status").in("id", invoiceIds).limit(500), "Project invoices") : [];
  const invoiceById = new Map(invoices.map((row) => [text(row, "id"), row]));
  if (new Set(invoiceIds).size !== invoiceById.size) throw new AssistantToolError("DATA_UNAVAILABLE", "The project invoice-cost source is incomplete.");
  const expenses = await getRows(userCompanyQuery(context, "expenses", "id,amount,currency,status,expense_date,archived_at").eq("project_id", projectId).limit(500), "Project expenses");
  const aggregateResult = await db(context).rpc("get_project_labor_cost_aggregate", { p_project_ids: [projectId] });
  if (aggregateResult.error) throw new AssistantToolError("DATA_UNAVAILABLE", "The project labor-cost aggregate is temporarily unavailable.");
  const aggregateRow = Array.isArray(aggregateResult.data) && aggregateResult.data.length === 1 ? aggregateResult.data[0] as Row : null;
  if (!aggregateRow || text(aggregateRow, "project_id") !== projectId) throw new AssistantToolError("DATA_UNAVAILABLE", "The project labor-cost aggregate returned an incomplete result.");
  const aggregateCurrency = text(aggregateRow, "currency", "UNKNOWN").toUpperCase();
  const aggregateStatus = text(aggregateRow, "aggregate_status", "INCOMPLETE");
  if (!/^[A-Z]{3}$/.test(aggregateCurrency) || !["AVAILABLE", "ZERO", "CURRENCY_CONFLICT"].includes(aggregateStatus)) throw new AssistantToolError("DATA_UNAVAILABLE", "The project labor-cost aggregate returned an invalid result.");
  const payrollConfirmed = amount(aggregateRow, "confirmed_labor_cost");
  const payrollPending = amount(aggregateRow, "pending_labor_cost");
  const totalsByCurrency = new Map<string, { invoiceConfirmed: number; invoicePending: number; expenseConfirmed: number; expensePending: number; payrollConfirmed: number; payrollPending: number }>();
  const bucket = (currency: string) => {
    const code = currency.trim().toUpperCase() || "UNKNOWN";
    const current = totalsByCurrency.get(code) || { invoiceConfirmed: 0, invoicePending: 0, expenseConfirmed: 0, expensePending: 0, payrollConfirmed: 0, payrollPending: 0 };
    totalsByCurrency.set(code, current);
    return current;
  };
  for (const allocation of allocations) {
    const invoice = invoiceById.get(text(allocation, "invoice_id"));
    if (!invoice) continue;
    if (text(invoice, "lifecycle_status", "ACTIVE") === "VOID") continue;
    const allocationType = text(allocation, "allocation_type").toUpperCase();
    if (allocationType !== "AMOUNT" && allocationType !== "PERCENTAGE") throw new AssistantToolError("DATA_UNAVAILABLE", "The project invoice-cost source contains an invalid allocation type.");
    const allocationAmount = normalizedInvoiceAllocationAmount(amount(invoice, "grand_total"), {
      allocationType: allocationType as "AMOUNT" | "PERCENTAGE",
      allocationAmount: amount(allocation, "allocation_amount"),
      allocationPercentage: amount(allocation, "allocation_percentage"),
    });
    const current = bucket(text(invoice, "currency", "UNKNOWN"));
    if (text(invoice, "review_status") === "VERIFIED" && text(invoice, "lifecycle_status", "ACTIVE") !== "VOID") current.invoiceConfirmed += allocationAmount;
    else current.invoicePending += allocationAmount;
  }
  for (const expense of expenses) {
    const current = bucket(text(expense, "currency", "UNKNOWN"));
    if (["APPROVED", "PAID"].includes(text(expense, "status"))) current.expenseConfirmed += amount(expense, "amount");
    else if (text(expense, "status") === "DRAFT") current.expensePending += amount(expense, "amount");
  }
  const laborBucket = bucket(aggregateCurrency);
  laborBucket.payrollConfirmed += payrollConfirmed;
  laborBucket.payrollPending += payrollPending;
  const byCurrency = [...totalsByCurrency.entries()].map(([currency, values]) => ({
    currency,
    invoiceConfirmed: values.invoiceConfirmed,
    invoicePending: values.invoicePending,
    expenseConfirmed: values.expenseConfirmed,
    expensePending: values.expensePending,
    payrollConfirmed: values.payrollConfirmed,
    payrollPending: values.payrollPending,
  }));
  const projectCurrency = text(project, "currency", "UNKNOWN").toUpperCase();
  return toolOk({
    project: { id: text(project, "id"), code: text(project, "project_code"), name: text(project, "project_name"), budget: amount(project, "project_budget"), currency: projectCurrency },
    sourceTotals: {
      byCurrency,
      currencyStatus: byCurrency.length <= 1 && byCurrency[0]?.currency === projectCurrency ? "COMBINABLE" : "NON_COMBINABLE",
    },
    laborAggregate: { currency: aggregateCurrency, confirmedLaborCost: payrollConfirmed, pendingLaborCost: payrollPending, status: aggregateStatus },
    privacy: "Project-level labor totals only; employee identity, payroll detail, attendance, rates, deductions, net pay, and allocation rows are not returned.",
    semantics: "Project labor uses persisted payroll_project_allocations.allocation_amount through the guarded aggregate. Net pay and cash settlement are not project labor cost. Source currencies remain separate and no FX conversion is applied.",
    truncated: allocations.length >= 500 || expenses.length >= 500,
  }, { references: [reference("project", projectId, safeLabel(project.project_code, project.project_name))] });
}

async function listExpenses(context: AssistantToolContext, args: Record<string, unknown>) {
  const limit = Number(args.limit || 20);
  const range = dateRange(args);
  let query = userCompanyQuery(context, "expenses", EXPENSE_SELECT).order("expense_date", { ascending: false }).limit(limit);
  if (typeof args.projectId === "string") query = query.eq("project_id", args.projectId);
  if (typeof args.status === "string") query = query.eq("status", args.status);
  if (range.from) query = query.gte("expense_date", range.from);
  if (range.to) query = query.lte("expense_date", range.to);
  if (typeof args.query === "string" && args.query.trim()) query = query.ilike("description", `%${escapeLike(args.query.trim())}%`);
  const rows = await getRows(query, "Expense list");
  return toolOk({ records: rows.map(expenseView), count: rows.length }, { references: rows.map((row) => reference("report", text(row, "id"), safeLabel(row.expense_date, row.description))) });
}

async function getExpenseSummary(context: AssistantToolContext, args: Record<string, unknown>) {
  const range = dateRange(args);
  let query = userCompanyQuery(context, "expenses", "id,project_id,expense_date,amount,currency,status,archived_at").limit(500);
  if (typeof args.projectId === "string") query = query.eq("project_id", args.projectId);
  if (range.from) query = query.gte("expense_date", range.from);
  if (range.to) query = query.lte("expense_date", range.to);
  if (typeof args.currency === "string") query = query.eq("currency", args.currency);
  const rows = await getRows(query, "Expense summary");
  const activeRows = rows.filter((row) => text(row, "status") !== "VOID");
  const confirmed = activeRows.filter((row) => ["APPROVED", "PAID"].includes(text(row, "status")));
  const pending = activeRows.filter((row) => text(row, "status") === "DRAFT");
  return toolOk({ count: rows.length, confirmedTotal: confirmed.reduce((sum, row) => sum + amount(row, "amount"), 0), pendingTotal: pending.reduce((sum, row) => sum + amount(row, "amount"), 0), byCurrency: [...new Set(activeRows.map((row) => text(row, "currency", "PHP")))].map((currency) => ({ currency, total: activeRows.filter((row) => text(row, "currency", "PHP") === currency).reduce((sum, row) => sum + amount(row, "amount"), 0) })), semantics: "Persisted expense source totals; count includes preserved VOID history, while financial totals exclude VOID rows." });
}

async function searchVendors(context: AssistantToolContext, args: Record<string, unknown>) {
  const limit = Number(args.limit || 20);
  let query = userCompanyQuery(context, "vendors", "id,name,email,phone,tax_id,address,default_currency,default_category,created_at,updated_at").order("name").limit(limit);
  if (typeof args.query === "string" && args.query.trim()) query = query.ilike("name", `%${escapeLike(args.query.trim())}%`);
  const rows = await getRows(query, "Vendor search");
  const records = rows.map((row) => ({ id: text(row, "id"), name: text(row, "name"), email: optionalText(row, "email"), phone: optionalText(row, "phone"), taxId: optionalText(row, "tax_id"), defaultCurrency: optionalText(row, "default_currency"), defaultCategory: optionalText(row, "default_category") }));
  return toolOk({ records, count: records.length }, { references: rows.map((row) => reference("report", text(row, "id"), text(row, "name"))) });
}

async function getVendorSummary(context: AssistantToolContext, args: Record<string, unknown>) {
  const vendor = requireFound(await getOne(userCompanyQuery(context, "vendors", "id,name,email,phone,tax_id,address,default_currency,default_category").eq("id", String(args.vendorId)).maybeSingle(), "Vendor"), "Vendor was not found in this company.");
  const invoices = await getRows(userCompanyQuery(context, "invoices", "id,invoice_number,invoice_date,currency,grand_total,payment_status,review_status,lifecycle_status,voided_at,voided_by_user_id,void_reason,archived_at").eq("vendor_id", String(vendor.id)).is("archived_at", null).order("invoice_date", { ascending: false }).limit(50), "Vendor invoices");
  return toolOk({ vendor: { id: text(vendor, "id"), name: text(vendor, "name"), email: optionalText(vendor, "email"), phone: optionalText(vendor, "phone"), taxId: optionalText(vendor, "tax_id"), defaultCurrency: optionalText(vendor, "default_currency") }, invoiceCount: invoices.length, invoices: invoices.map(invoiceView), note: "Totals are shown per source currency; no exchange-rate conversion is applied." }, { references: [reference("report", text(vendor, "id"), text(vendor, "name"))] });
}

async function searchWorkers(context: AssistantToolContext, args: Record<string, unknown>) {
  const limit = Number(args.limit || 20);
  let query = userCompanyQuery(context, "workers", WORKER_SELECT).order("last_name").order("first_name").limit(limit);
  if (typeof args.active === "boolean") query = query.eq("active", args.active);
  if (typeof args.query === "string" && args.query.trim()) query = query.ilike("display_name", `%${escapeLike(args.query.trim())}%`);
  const rows = await getRows(query, "Worker search");
  return toolOk({ records: rows.map(workerView), count: rows.length }, { references: rows.map((row) => reference("worker", text(row, "id"), text(row, "display_name", safeLabel(row.first_name, row.last_name)))) });
}

async function getWorkerTool(context: AssistantToolContext, args: Record<string, unknown>) {
  const row = await getWorker(context, String(args.workerId));
  const assignments = await getRows(userCompanyQuery(context, "project_worker_assignments", "id,project_id,start_date,end_date,pay_type,rate,role_on_project,active").eq("worker_id", String(row.id)).order("start_date", { ascending: false }).limit(50), "Worker assignments");
  return toolOk({ worker: workerView(row), assignments }, { references: [reference("worker", text(row, "id"), text(row, "display_name", safeLabel(row.first_name, row.last_name)))] });
}

function attendanceView(row: Row) {
  return {
    id: text(row, "id"), workerId: text(row, "worker_id"), periodId: optionalText(row, "period_id"), date: text(row, "attendance_date"),
    scheduledMinutes: amount(row, "scheduled_minutes"), breakMinutes: amount(row, "break_minutes"), regularMinutes: amount(row, "regular_minutes"),
    lateMinutes: amount(row, "late_minutes"), undertimeMinutes: amount(row, "undertime_minutes"), overtimeMinutes: amount(row, "overtime_minutes"),
    paidDayFraction: amount(row, "paid_day_fraction"), attendanceStatus: text(row, "attendance_status"), recordStatus: text(row, "record_status"), source: text(row, "source"), notes: optionalText(row, "notes"),
  };
}

function leaveView(row: Row) {
  return {
    id: text(row, "id"), workerId: text(row, "worker_id"), leaveType: text(row, "leave_type"), startDate: text(row, "start_date"), endDate: text(row, "end_date"),
    partialDay: text(row, "partial_day", "FULL"), paid: row.paid === null || row.paid === undefined ? undefined : Boolean(row.paid), status: text(row, "status"), notes: optionalText(row, "notes"),
  };
}

function overtimeView(row: Row) {
  return {
    id: text(row, "id"), workerId: text(row, "worker_id"), periodId: optionalText(row, "period_id"), date: text(row, "overtime_date"), projectId: optionalText(row, "project_id"),
    laborContext: text(row, "labor_context"), requestedMinutes: amount(row, "requested_minutes"), approvedMinutes: amount(row, "approved_minutes"), status: text(row, "status"), reason: optionalText(row, "reason"),
  };
}

async function getAttendanceDay(context: AssistantToolContext, args: Record<string, unknown>) {
  let query = userCompanyQuery(context, "attendance_records", ATTENDANCE_SELECT).eq("attendance_date", String(args.date)).order("worker_id").limit(50);
  if (typeof args.workerId === "string") query = query.eq("worker_id", args.workerId);
  const rows = await getRows(query, "Attendance records");
  return toolOk({ date: String(args.date), records: rows.map(attendanceView), count: rows.length }, { references: rows.map((row) => reference("attendance", text(row, "id"), safeLabel(row.attendance_date, row.worker_id))) });
}

async function getAttendancePeriodSummary(context: AssistantToolContext, args: Record<string, unknown>) {
  let from = typeof args.from === "string" ? args.from : undefined;
  let to = typeof args.to === "string" ? args.to : undefined;
  if (typeof args.periodId === "string") {
    const period = await getPeriod(context, args.periodId);
    from = text(period, "period_start");
    to = text(period, "period_end");
  }
  if (from && to && from > to) throw new AssistantToolError("INVALID_DATE_RANGE", "The start date cannot be after the end date.");
  let attendanceQuery = userCompanyQuery(context, "attendance_records", ATTENDANCE_SELECT).order("attendance_date").limit(500);
  let leaveQuery = userCompanyQuery(context, "leave_requests", LEAVE_SELECT).order("start_date").limit(500);
  let overtimeQuery = userCompanyQuery(context, "overtime_requests", OVERTIME_SELECT).order("overtime_date").limit(500);
  if (from) {
    attendanceQuery = attendanceQuery.gte("attendance_date", from);
    leaveQuery = leaveQuery.gte("end_date", from);
    overtimeQuery = overtimeQuery.gte("overtime_date", from);
  }
  if (to) {
    attendanceQuery = attendanceQuery.lte("attendance_date", to);
    leaveQuery = leaveQuery.lte("start_date", to);
    overtimeQuery = overtimeQuery.lte("overtime_date", to);
  }
  if (typeof args.periodId === "string") {
    attendanceQuery = attendanceQuery.eq("period_id", args.periodId);
    overtimeQuery = overtimeQuery.eq("period_id", args.periodId);
  }
  const [attendance, leave, overtime] = await Promise.all([
    getRows(attendanceQuery, "Attendance summary"), getRows(leaveQuery, "Leave summary"), getRows(overtimeQuery, "Overtime summary"),
  ]);
  return toolOk({
    from, to, attendanceCount: attendance.length, confirmedAttendanceCount: attendance.filter((row) => text(row, "record_status") === "CONFIRMED").length,
    regularMinutes: attendance.reduce((sum, row) => sum + amount(row, "regular_minutes"), 0), overtimeMinutes: attendance.reduce((sum, row) => sum + amount(row, "overtime_minutes"), 0),
    leaveCount: leave.length, activeLeaveCount: leave.filter((row) => ["DRAFT", "PENDING", "APPROVED"].includes(text(row, "status"))).length,
    overtimeCount: overtime.length, approvedOvertimeMinutes: overtime.filter((row) => text(row, "status") === "APPROVED").reduce((sum, row) => sum + amount(row, "approved_minutes"), 0),
    records: { attendance: attendance.slice(0, 50).map(attendanceView), leave: leave.slice(0, 50).map(leaveView), overtime: overtime.slice(0, 50).map(overtimeView) },
  }, { references: typeof args.periodId === "string" ? [reference("payroll_period", args.periodId, `${from || ""} – ${to || ""}`)] : [] });
}

async function getPayrollPeriodTool(context: AssistantToolContext, args: Record<string, unknown>) {
  const period = await getPeriod(context, String(args.periodId));
  const runs = await getRows(userCompanyQuery(context, "payroll_runs", RUN_SELECT).eq("period_id", String(period.id)).order("created_at", { ascending: false }).limit(10), "Payroll period runs");
  return toolOk({ period: periodView(period), runs: runs.map(runView) }, { references: [reference("payroll_period", text(period, "id"), `${text(period, "period_start")} – ${text(period, "period_end")}`)] });
}

async function getPayrollRunTool(context: AssistantToolContext, args: Record<string, unknown>) {
  const run = await getRun(context, String(args.runId));
  const period = await getPeriod(context, text(run, "period_id"));
  const entries = await getRows(userCompanyQuery(context, "payroll_entries", "id,worker_id,base_pay,regular_pay,overtime_pay,allowances,other_earnings,gross_pay,deductions,other_deductions,employer_costs,net_pay,project_allocated_cost,cost_context,calculation_snapshot,created_at").eq("payroll_run_id", String(run.id)).limit(50), "Payroll entries");
  const workerIds = [...new Set(entries.map((entry) => text(entry, "worker_id")))].filter(Boolean);
  const workers = workerIds.length ? await getRows(userCompanyQuery(context, "workers", "id,display_name,employee_code").in("id", workerIds).limit(50), "Payroll workers") : [];
  const names = new Map(workers.map((worker) => [text(worker, "id"), safeLabel(worker.display_name, worker.employee_code)]));
  return toolOk({ run: runView(run), period: periodView(period), entryCount: entries.length, entries: entries.map((entry) => ({ id: text(entry, "id"), workerId: text(entry, "worker_id"), worker: names.get(text(entry, "worker_id")), grossPay: amount(entry, "gross_pay"), netPay: amount(entry, "net_pay"), projectAllocatedCost: amount(entry, "project_allocated_cost"), hasCalculationSnapshot: Boolean(entry.calculation_snapshot && typeof entry.calculation_snapshot === "object" && Object.keys(entry.calculation_snapshot as object).length) })) }, { references: [reference("payroll_run", text(run, "id"), `${text(period, "period_start")} – ${text(period, "period_end")}`)] });
}

async function getPayrollReadiness(context: AssistantToolContext, args: Record<string, unknown>) {
  const period = await getPeriod(context, String(args.periodId));
  const runs = await getRows(userCompanyQuery(context, "payroll_runs", RUN_SELECT).eq("period_id", String(period.id)).order("created_at", { ascending: false }).limit(5), "Payroll readiness runs");
  const run = runs[0];
  const [attendance, leave, overtime, workEntries, entries] = await Promise.all([
    getRows(userCompanyQuery(context, "attendance_records", "id,record_status,attendance_date").eq("period_id", String(period.id)).limit(500), "Attendance readiness"),
    getRows(userCompanyQuery(context, "leave_requests", "id,status,start_date,end_date").gte("end_date", text(period, "period_start")).lte("start_date", text(period, "period_end")).limit(500), "Leave readiness"),
    getRows(userCompanyQuery(context, "overtime_requests", "id,status,approved_minutes").eq("period_id", String(period.id)).limit(500), "Overtime readiness"),
    getRows(userCompanyQuery(context, "work_entries", "id,status,work_date").eq("period_id", String(period.id)).limit(500), "Work-entry readiness"),
    run ? getRows(userCompanyQuery(context, "payroll_entries", "id,calculation_snapshot").eq("payroll_run_id", String(run.id)).limit(500), "Payroll-entry readiness") : Promise.resolve([]),
  ]);
  const blockers: string[] = [];
  if (!run) blockers.push("No payroll run exists for this period.");
  if (run && !["DRAFT", "CALCULATED"].includes(text(run, "status")) && text(run, "status") !== "APPROVED") blockers.push(`Payroll run is ${text(run, "status")}.`);
  if (periodView(period).locked) blockers.push("The payroll period is locked or finalized.");
  if (run && text(run, "status") === "CALCULATED" && Number(run.calculated_source_revision) !== Number(period.source_revision)) blockers.push("Sources changed after the last calculation; recalculate before approval.");
  if (run && text(run, "status") === "CALCULATED" && entries.some((entry) => !entry.calculation_snapshot || typeof entry.calculation_snapshot !== "object" || !Object.keys(entry.calculation_snapshot as object).length)) blockers.push("At least one payroll entry lacks a calculation snapshot.");
  return toolOk({ period: periodView(period), run: run ? runView(run) : undefined, sourceCounts: { confirmedAttendance: attendance.filter((row) => text(row, "record_status") === "CONFIRMED").length, activeLeave: leave.filter((row) => ["DRAFT", "PENDING", "APPROVED"].includes(text(row, "status"))).length, approvedOvertime: overtime.filter((row) => text(row, "status") === "APPROVED").length, approvedWorkEntries: workEntries.filter((row) => text(row, "status") === "APPROVED").length, payrollEntries: entries.length }, blockers, readyForApproval: blockers.length === 0 && Boolean(run && text(run, "status") === "CALCULATED"), authoritativeCalculation: false });
}

async function getPayrollSummary(context: AssistantToolContext, args: Record<string, unknown>) {
  const period = await getPeriod(context, String(args.periodId));
  const runs = await getRows(userCompanyQuery(context, "payroll_runs", RUN_SELECT).eq("period_id", String(period.id)).order("created_at", { ascending: false }).limit(10), "Payroll summary runs");
  const currentRun = runs[0];
  return toolOk({
    period: periodView(period),
    runs: runs.map(runView),
    currentRun: currentRun ? runView(currentRun) : null,
    sourceRevision: Number(period.source_revision || 0),
    lifecycle: currentRun ? { status: text(currentRun, "status"), calculated: text(currentRun, "status") === "CALCULATED", approved: text(currentRun, "status") === "APPROVED", paid: text(currentRun, "status") === "PAID" } : { status: "NO_RUN", calculated: false, approved: false, paid: false },
    semantics: "This is a period and run-status summary. Employee entries, rates, deductions, net pay, and attendance detail require payroll-detail permission and are not included.",
  }, { references: [reference("payroll_period", text(period, "id"), `${text(period, "period_start")} – ${text(period, "period_end")}`)] });
}

function workspaceToday(context: AssistantToolContext) {
  const timezone = context.context.companyTimezone || "Asia/Manila";
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(context.now);
  } catch {
    return context.now.toISOString().slice(0, 10);
  }
}

async function listPayrollPeriods(context: AssistantToolContext, args: Record<string, unknown>) {
  const today = workspaceToday(context);
  const timezone = context.context.companyTimezone || "Asia/Manila";
  const limit = Number(args.limit || 50);
  let query = userCompanyQuery(context, "payroll_periods", PERIOD_SELECT).neq("status", "VOID").order("period_start", { ascending: true }).limit(limit);
  if (typeof args.status === "string") query = query.eq("status", args.status);
  if (typeof args.from === "string") query = query.gte("period_start", args.from);
  if (typeof args.to === "string") query = query.lte("period_end", args.to);
  const rows = await getRows(query, "Payroll periods");
  const current = rows
    .filter((row) => text(row, "period_start") <= today && text(row, "period_end") >= today)
    .sort((left, right) => text(right, "period_end").localeCompare(text(left, "period_end")) || text(right, "period_start").localeCompare(text(left, "period_start")))[0];
  const next = rows
    .filter((row) => text(row, "period_start") > today)
    .sort((left, right) => text(left, "period_start").localeCompare(text(right, "period_start")) || text(left, "period_end").localeCompare(text(right, "period_end")))[0];
  const relationship = (row: Row) => row === current ? "CURRENT" : row === next ? "NEXT" : text(row, "period_start") > today && text(row, "status") === "DRAFT" ? "SCHEDULED" : "OTHER";
  return toolOk({
    referenceDate: today,
    timezone,
    currentPeriod: current ? periodView(current) : null,
    nextPeriod: next ? periodView(next) : null,
    periods: rows.map((row) => ({ ...periodView(row), relationship: relationship(row) })),
    semantics: "Current means the persisted period boundaries contain the workspace date. A future DRAFT period is scheduled, not current or open.",
  }, { references: rows.slice(0, 20).map((row) => reference("payroll_period", text(row, "id"), `${text(row, "period_start")} – ${text(row, "period_end")}`)) });
}

async function countRows(context: AssistantToolContext, table: string) {
  const { count, error } = await db(context).from(table).select("id", { count: "exact", head: true }).eq("company_id", context.auth.companyId);
  return error ? undefined : count ?? 0;
}

async function getCurrentWorkspaceSummary(context: AssistantToolContext) {
  const company = await getOne(db(context).from("companies").select("id,name,default_currency,timezone,status").eq("id", context.auth.companyId).maybeSingle(), "Workspace");
  const [invoices, projects, expenses, workers, periods] = await Promise.all(["invoices", "projects", "expenses", "workers", "payroll_periods"].map((table) => countRows(context, table)));
  return toolOk({ workspace: company ? { name: text(company, "name"), currency: text(company, "default_currency", "PHP"), timezone: text(company, "timezone", "Asia/Manila"), status: text(company, "status") } : { name: context.context.companyName || "Current workspace" }, counts: { invoices, projects, expenses, workers, payrollPeriods: periods }, note: "Counts are bounded permission-aware summaries; no financial total is inferred." });
}

async function getCashSummary(context: AssistantToolContext, args: Record<string, unknown>) {
  const [accountRows, snapshotRows, transactionRows] = await Promise.all([
    getRows(userCompanyQuery(context, "financial_accounts", FINANCIAL_ACCOUNT_SELECT).eq("active", true).order("display_name").limit(100), "Financial accounts"),
    getRows(userCompanyQuery(context, "financial_balance_snapshots", FINANCIAL_SNAPSHOT_SELECT).order("captured_at", { ascending: false }).limit(500), "Financial balance snapshots"),
    getRows(userCompanyQuery(context, "financial_transactions", FINANCIAL_TRANSACTION_SELECT).order("transaction_date", { ascending: false }).limit(500), "Financial transactions"),
  ]);
  const snapshotsByAccount = new Map<string, Row>();
  for (const snapshot of snapshotRows) {
    const accountId = text(snapshot, "account_id");
    if (accountId && !snapshotsByAccount.has(accountId)) {
      snapshotsByAccount.set(accountId, snapshot);
    }
  }
  const filterCurrency = typeof args.currency === "string" ? args.currency.trim().toUpperCase() : undefined;
  const filteredAccounts = filterCurrency ? accountRows.filter((row) => text(row, "currency", "PHP").toUpperCase() === filterCurrency) : accountRows;
  const currencies = [...new Set(filteredAccounts.map((row) => text(row, "currency", "PHP").toUpperCase()))];
  const positionsByCurrency = currencies.map((curr) => {
    const currencyAccounts = filteredAccounts.filter((row) => text(row, "currency", "PHP").toUpperCase() === curr);
    const accountViews = currencyAccounts.map((account) => financialAccountView(account, snapshotsByAccount.get(text(account, "id"))));
    const totalLedger = accountViews.reduce((sum, item) => sum + (item.latestBalance?.ledgerBalance || 0), 0);
    const totalAvailable = accountViews.reduce((sum, item) => sum + (item.latestBalance?.availableBalance ?? item.latestBalance?.ledgerBalance ?? 0), 0);
    return {
      currency: curr,
      accountCount: currencyAccounts.length,
      totalLedgerBalance: totalLedger,
      totalAvailableBalance: totalAvailable,
      accounts: accountViews,
    };
  });
  const unmatchedTransactions = transactionRows.filter((row) => text(row, "reconciliation_status") === "UNMATCHED");
  const suggestedTransactions = transactionRows.filter((row) => text(row, "reconciliation_status") === "SUGGESTED");
  const matchedTransactions = transactionRows.filter((row) => ["MATCHED", "PARTIAL"].includes(text(row, "reconciliation_status")));
  return toolOk({
    positionsByCurrency,
    reconciliationSummary: {
      totalTransactions: transactionRows.length,
      unmatchedCount: unmatchedTransactions.length,
      suggestedCount: suggestedTransactions.length,
      matchedCount: matchedTransactions.length,
    },
    semantics: "Balances are separated by source currency and are never summed across currencies. Internal transfers between company accounts are excluded from income or expense metrics.",
  }, {
    references: filteredAccounts.map((row) => reference("report", text(row, "id"), `${text(row, "display_name")} (${text(row, "currency", "PHP")})`)),
  });
}

async function listFinancialAccounts(context: AssistantToolContext, args: Record<string, unknown>) {
  const limit = Number(args.limit || 50);
  let query = userCompanyQuery(context, "financial_accounts", FINANCIAL_ACCOUNT_SELECT).eq("active", true).order("display_name").limit(limit);
  if (typeof args.accountType === "string") query = query.eq("account_type", args.accountType);
  if (typeof args.currency === "string") query = query.eq("currency", args.currency.trim().toUpperCase());
  const accounts = await getRows(query, "Financial accounts list");
  const accountIds = accounts.map((row) => text(row, "id")).filter(Boolean);
  const snapshots = accountIds.length
    ? await getRows(userCompanyQuery(context, "financial_balance_snapshots", FINANCIAL_SNAPSHOT_SELECT).in("account_id", accountIds).order("captured_at", { ascending: false }).limit(500), "Snapshots")
    : [];
  const snapshotsByAccount = new Map<string, Row>();
  for (const snapshot of snapshots) {
    const accountId = text(snapshot, "account_id");
    if (accountId && !snapshotsByAccount.has(accountId)) snapshotsByAccount.set(accountId, snapshot);
  }
  const accountViews = accounts.map((account) => financialAccountView(account, snapshotsByAccount.get(text(account, "id"))));
  return toolOk({ accounts: accountViews, count: accountViews.length }, {
    references: accounts.map((row) => reference("report", text(row, "id"), text(row, "display_name"))),
  });
}

async function getFinancialAccountTool(context: AssistantToolContext, args: Record<string, unknown>) {
  const accountId = String(args.accountId);
  const account = requireFound(await getOne(userCompanyQuery(context, "financial_accounts", FINANCIAL_ACCOUNT_SELECT).eq("id", accountId).maybeSingle(), "Financial account"), "Financial account was not found in this company.");
  const [snapshots, transactions] = await Promise.all([
    getRows(userCompanyQuery(context, "financial_balance_snapshots", FINANCIAL_SNAPSHOT_SELECT).eq("account_id", accountId).order("captured_at", { ascending: false }).limit(5), "Account balance snapshots"),
    getRows(userCompanyQuery(context, "financial_transactions", FINANCIAL_TRANSACTION_SELECT).eq("account_id", accountId).order("transaction_date", { ascending: false }).limit(20), "Account transactions"),
  ]);
  const view = financialAccountView(account, snapshots[0]);
  return toolOk({
    account: view,
    recentTransactions: transactions.map(financialTransactionView),
    historySnapshots: snapshots.map((s) => ({ ledgerBalance: amount(s, "ledger_balance"), availableBalance: amount(s, "available_balance"), source: text(s, "source"), capturedAt: optionalText(s, "captured_at") })),
  }, {
    references: [reference("report", text(account, "id"), text(account, "display_name"))],
  });
}

async function listFinancialTransactions(context: AssistantToolContext, args: Record<string, unknown>) {
  const limit = Number(args.limit || 50);
  const range = dateRange(args);
  let query = userCompanyQuery(context, "financial_transactions", FINANCIAL_TRANSACTION_SELECT).order("transaction_date", { ascending: false }).limit(limit);
  if (typeof args.accountId === "string") query = query.eq("account_id", args.accountId);
  if (typeof args.direction === "string") query = query.eq("direction", args.direction);
  if (typeof args.reconciliationStatus === "string") query = query.eq("reconciliation_status", args.reconciliationStatus);
  if (range.from) query = query.gte("transaction_date", range.from);
  if (range.to) query = query.lte("transaction_date", range.to);
  const transactions = await getRows(query, "Financial transactions");
  return toolOk({ transactions: transactions.map(financialTransactionView), count: transactions.length }, {
    references: transactions.slice(0, 10).map((row) => reference("report", text(row, "id"), safeLabel(row.transaction_date, row.description))),
  });
}

async function getCashReconciliationSummary(context: AssistantToolContext, args: Record<string, unknown>) {
  const accountId = typeof args.accountId === "string" ? args.accountId : undefined;
  let txQuery = userCompanyQuery(context, "financial_transactions", FINANCIAL_TRANSACTION_SELECT).limit(500);
  let accQuery = userCompanyQuery(context, "financial_accounts", FINANCIAL_ACCOUNT_SELECT).eq("active", true).limit(50);
  if (accountId) {
    txQuery = txQuery.eq("account_id", accountId);
    accQuery = accQuery.eq("id", accountId);
  }
  const [transactions, accounts, matches] = await Promise.all([
    getRows(txQuery, "Transactions"),
    getRows(accQuery, "Accounts"),
    getRows(userCompanyQuery(context, "financial_transaction_matches", "id,transaction_id,target_type,matched_amount,status,confidence").limit(500), "Matches"),
  ]);
  const unmatched = transactions.filter((row) => text(row, "reconciliation_status") === "UNMATCHED");
  const suggested = transactions.filter((row) => text(row, "reconciliation_status") === "SUGGESTED");
  const matched = transactions.filter((row) => ["MATCHED", "PARTIAL"].includes(text(row, "reconciliation_status")));
  return toolOk({
    accountCount: accounts.length,
    totalTransactions: transactions.length,
    unmatchedCount: unmatched.length,
    suggestedCount: suggested.length,
    matchedCount: matched.length,
    matches: matches.slice(0, 20).map((m) => ({ id: text(m, "id"), targetType: text(m, "target_type"), amount: amount(m, "matched_amount"), status: text(m, "status") })),
  });
}

async function prepareProcessAttachedInvoice(context: AssistantToolContext, args: Record<string, unknown>) {
  const requestedFileName = typeof args.fileName === "string" ? args.fileName.trim() : undefined;
  const existingRefs = await getRows(userCompanyQuery(context, "assistant_attachment_refs", "id,file_name,mime_type,byte_size,kind,sha256").in("kind", ["PDF", "IMAGE"]).order("created_at", { ascending: false }).limit(10), "Attachment refs");
  const targetAttachment = requestedFileName
    ? existingRefs.find((r) => text(r, "file_name").toLowerCase() === requestedFileName.toLowerCase()) || existingRefs[0]
    : existingRefs[0];
  const fileName = targetAttachment ? text(targetAttachment, "file_name") : requestedFileName || "invoice-attachment.pdf";
  const kind = targetAttachment ? text(targetAttachment, "kind") : "PDF";
  const sha256 = targetAttachment ? text(targetAttachment, "sha256") : undefined;
  return context.prepareAction({
    toolName: "prepare_process_attached_invoice",
    riskTier: "PREPARE",
    normalizedArgs: { fileName, kind, sha256, notes: args.notes || undefined },
    contextGeneration: context.context.generation,
    preview: {
      operation: "Process attached invoice",
      fileName,
      documentKind: kind,
      reviewStatusAfterConfirmation: "NEEDS_REVIEW",
      writeStatus: "Extracts invoice and creates unverified draft in review queue upon confirmation",
    },
  });
}

async function executeProcessAttachedInvoice(context: AssistantToolContext, args: Record<string, unknown>, actionId?: string) {
  const fileName = String(args.fileName || "invoice-document.pdf");
  const sha256 = typeof args.sha256 === "string" ? args.sha256 : undefined;
  if (sha256) {
    const existing = await getOne(userCompanyQuery(context, "invoices", INVOICE_SELECT).eq("source_sha256", sha256).maybeSingle(), "Existing invoice");
    if (existing) {
      return { operation: "invoice_already_processed", invoice: invoiceView(existing), invoiceId: text(existing, "id") };
    }
  }
  // The binary payload remains in the validated browser attachment draft. The
  // confirmation endpoint authorizes this explicit handoff; the host then
  // invokes the existing deterministic extraction pipeline with that payload.
  // No invoice row is claimed to exist until that pipeline returns.
  return { operation: "invoice_attachment_handoff_confirmed", fileName, clientExecutionRequired: true, reviewStatusAfterProcessing: "NEEDS_REVIEW" };
}

async function searchHelp(_context: AssistantToolContext, args: Record<string, unknown>) {
  const response = getHelpResponse(String(args.query || ""), { limit: 10 });
  if (response.kind === "unknown") return toolOk({ topics: [], count: 0, message: response.message });
  const topics = response.matches.map((entry) => ({ feature: entry.id, title: entry.title, summary: entry.summary, details: entry.details, routeId: entry.routeId, path: helpEntryPath(entry) }));
  const routeIds = [...new Set(response.matches.map((entry) => entry.routeId))];
  return toolOk({ topics, count: topics.length }, { references: response.references, clientActions: routeIds.slice(0, 3).map((routeId) => ({ type: "NAVIGATE" as const, routeId, label: `Open ${routeId}` })) });
}

async function getFeatureHelp(_context: AssistantToolContext, args: Record<string, unknown>) {
  const entry = getHelpEntry(args.feature);
  if (!entry) throw new AssistantToolError("HELP_NOT_FOUND", `That verified ${BRAND.productName} help topic is not available.`);
  return toolOk({ feature: entry.id, title: entry.title, summary: entry.summary, details: entry.details, routeId: entry.routeId, path: helpEntryPath(entry) }, { references: [helpEntryReference(entry)], clientActions: [{ type: "NAVIGATE", routeId: entry.routeId, label: `Open ${entry.title}` }] });
}

async function startTour(_context: AssistantToolContext, args: Record<string, unknown>) {
  const tourId = String(args.tourId || "").toLowerCase();
  const tour = getAssistantTour(tourId);
  if (!tour) throw new AssistantToolError("TOUR_NOT_FOUND", "That in-app tour is not available.");
  const action: AssistantClientAction = { type: "START_TOUR", tourId, label: tour.title };
  return toolOk({ started: false, tourId, title: tour.title, summary: tour.summary, message: "The tour is ready to start in the app." }, { clientActions: [action] });
}

async function navigateTo(context: AssistantToolContext, args: Record<string, unknown>) {
  const routeId = String(args.routeId);
  if (!isAssistantRouteId(routeId)) throw new AssistantToolError("ROUTE_NOT_ALLOWED", "That app destination is not available.");
  const action: AssistantClientAction = { type: "NAVIGATE", routeId, label: routeId };
  return toolOk({ destination: routeId }, { clientActions: [action] });
}

async function navigateToEntity(context: AssistantToolContext, type: "project" | "invoice" | "review-invoice" | "payroll-period", id: string, view?: string) {
  if (type === "project") await getProject(context, id);
  if (type === "invoice" || type === "review-invoice") await getInvoice(context, id);
  if (type === "payroll-period") await getPeriod(context, id);
  const action: AssistantClientAction = type === "project"
    ? { type: "OPEN_PROJECT", entityId: id, label: "Open project" }
    : type === "invoice"
      ? { type: "OPEN_INVOICE", entityId: id, label: "Open invoice" }
      : type === "review-invoice"
        ? { type: "OPEN_REVIEW_INVOICE", entityId: id, label: "Open invoice review" }
        : { type: "OPEN_PAYROLL_PERIOD", entityId: id, label: "Open payroll period" };
  if (type === "project" && view && view !== "overview") action.view = view;
  return toolOk({ destination: type }, { clientActions: [action] });
}

async function assertOpenPeriod(context: AssistantToolContext, periodId: string) {
  const period = await getPeriod(context, periodId);
  if (Boolean(period.locked_at) || ["APPROVED", "PAID", "VOID"].includes(text(period, "status"))) throw new AssistantToolError("PAYROLL_LOCKED", "The payroll period is finalized or locked and cannot be changed.");
  return period;
}

function employeeCodeBase(args: Record<string, unknown>) {
  const pieces = [args.firstName, args.lastName]
    .map((value) => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean);
  const base = `EMP-${pieces.join("-") || "WORKER"}`;
  return base.slice(0, 72).replace(/-+$/g, "") || "EMP-WORKER";
}

function uniqueEmployeeCode(args: Record<string, unknown>, rows: Row[]) {
  const existing = new Set(rows.map((row) => text(row, "employee_code").trim().toLowerCase()).filter(Boolean));
  const requested = typeof args.employeeCode === "string" ? args.employeeCode.trim() : "";
  if (requested) return existing.has(requested.toLowerCase()) ? undefined : requested;
  const base = employeeCodeBase(args);
  if (!existing.has(base.toLowerCase())) return base;
  for (let suffix = 2; suffix <= 9999; suffix += 1) {
    const candidate = `${base.slice(0, Math.max(1, 76 - String(suffix).length))}-${suffix}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  return undefined;
}

async function prepareWorkerCreation(context: AssistantToolContext, args: Record<string, unknown>) {
  const workers = await getRows(companyQuery(context, "workers", "id,employee_code").limit(5000), "Workers");
  const employeeCode = uniqueEmployeeCode(args, workers);
  if (!employeeCode) throw new AssistantToolError("EMPLOYEE_CODE_EXISTS", "That employee code is already used in this company. Provide a different code.");
  if (typeof args.departmentId === "string") {
    const department = await getOne(companyQuery(context, "departments", "id,name,active,archived_at").eq("id", args.departmentId).maybeSingle(), "Department");
    if (!department) throw new AssistantToolError("DEPARTMENT_NOT_FOUND", "The selected department is not available in this company.");
  }
  const displayName = [args.firstName, args.lastName].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
  const normalizedArgs = { ...args, employeeCode, displayName };
  return context.prepareAction({
    toolName: "prepare_create_worker",
    riskTier: "PREPARE",
    normalizedArgs,
    contextGeneration: context.context.generation,
    preview: {
      operation: "Create employee",
      name: displayName,
      employeeCode,
      employmentType: args.employmentType,
      payBasis: args.defaultPayType,
      rate: args.defaultRate,
      currency: context.context.currency || "PHP",
      active: args.active === true,
      department: args.department || undefined,
      statusAfterConfirmation: args.active === true ? "ACTIVE" : "INACTIVE",
      writeStatus: "PREPARED only until confirmation",
      revalidateOnConfirmation: true,
    },
  });
}

async function prepareAttendanceBatch(context: AssistantToolContext, args: Record<string, unknown>) {
  const records = args.records as Array<Record<string, unknown>>;
  const workerIds = [...new Set(records.map((record) => String(record.workerId)))];
  const workers = await getRows(userCompanyQuery(context, "workers", "id,display_name,employee_code,active").in("id", workerIds).limit(50), "Attendance workers");
  if (workers.length !== workerIds.length) throw new AssistantToolError("WORKER_NOT_FOUND", "One or more attendance workers are not in this company.");
  const periodIds = [...new Set(records.map((record) => typeof record.periodId === "string" ? record.periodId : undefined).filter(Boolean) as string[])];
  const periods = periodIds.length ? await getRows(userCompanyQuery(context, "payroll_periods", PERIOD_SELECT).in("id", periodIds).limit(50), "Attendance periods") : [];
  if (periods.length !== periodIds.length) throw new AssistantToolError("PERIOD_NOT_FOUND", "One or more attendance periods are not in this company.");
  for (const period of periods) if (Boolean(period.locked_at) || ["APPROVED", "PAID", "VOID"].includes(text(period, "status"))) throw new AssistantToolError("PAYROLL_LOCKED", "Attendance cannot be prepared for a finalized payroll period.");
  const workerLabels = new Map(workers.map((worker) => [text(worker, "id"), safeLabel(worker.display_name, worker.employee_code)]));
  const normalized = records.map((record) => ({ ...record, workerId: String(record.workerId), periodId: typeof record.periodId === "string" ? record.periodId : undefined }));
  return context.prepareAction({
    toolName: "prepare_attendance_batch", riskTier: "PREPARE", normalizedArgs: { records: normalized }, contextGeneration: context.context.generation,
    preview: { operation: "Save attendance records", recordCount: normalized.length, workers: workerIds.map((id) => workerLabels.get(id) || "Worker"), dates: [...new Set(normalized.map((record) => String((record as Record<string, unknown>).attendanceDate)))], writeStatus: "CONFIRMED records after confirmation", source: "attendance_records" },
  });
}

async function prepareAttendanceRoster(context: AssistantToolContext, args: Record<string, unknown>) {
  const date = String(args.attendanceDate);
  const periodId = typeof args.periodId === "string" ? args.periodId : undefined;
  if (periodId) await assertOpenPeriod(context, periodId);
  const [workerRows, leaveRows, holidayRows] = await Promise.all([
    getRows(userCompanyQuery(context, "workers", WORKER_SELECT).eq("active", true).limit(500), "Attendance workers"),
    getRows(userCompanyQuery(context, "leave_requests", LEAVE_SELECT).lte("start_date", date).gte("end_date", date).in("status", ["APPROVED"]).limit(500), "Approved leave"),
    getRows(userCompanyQuery(context, "payroll_holidays", "id,holiday_date,name,category,notes,active,created_at,updated_at").eq("holiday_date", date).eq("active", true).limit(20), "Payroll holidays"),
  ]);
  const workers = workerRows.map((row) => ({
    id: text(row, "id"), active: bool(row, "active", true), employmentStatus: optionalText(row, "employment_status") as any, hireDate: optionalText(row, "hire_date"), endDate: optionalText(row, "end_date"),
    workingDays: Array.isArray(row.working_days) ? row.working_days.map(String) : undefined, workingHoursStart: optionalText(row, "working_hours_start"), workingHoursEnd: optionalText(row, "working_hours_end"), employeeCode: optionalText(row, "employee_code"), displayName: text(row, "display_name", safeLabel(row.first_name, row.last_name)),
  })) as any;
  const leaves = leaveRows.map((row) => ({ id: text(row, "id"), workerId: text(row, "worker_id"), leaveType: text(row, "leave_type"), startDate: text(row, "start_date"), endDate: text(row, "end_date"), partialDay: text(row, "partial_day", "FULL"), paid: row.paid === null ? undefined : Boolean(row.paid), status: "APPROVED", createdAt: text(row, "created_at"), updatedAt: text(row, "updated_at") })) as any;
  const holidays = holidayRows.map((row) => ({ id: text(row, "id"), holidayDate: text(row, "holiday_date"), name: text(row, "name"), category: optionalText(row, "category"), notes: optionalText(row, "notes"), active: true, createdAt: text(row, "created_at"), updatedAt: text(row, "updated_at") })) as any;
  const roster = buildDailyRoster({ date, workers, leaveRequests: leaves, holidays });
  if (!roster.valid) throw new AssistantToolError("ROSTER_INVALID", roster.errors.map((issue) => issue.message).join(" ") || "The expected roster could not be built.");
  const absentWorkerIds = new Set((args.absentWorkerIds as string[]).map(String));
  const expectedWorkerIds = new Set(roster.items.map((item) => item.workerId));
  const invalidAbsence = [...absentWorkerIds].filter((workerId) => !expectedWorkerIds.has(workerId));
  if (invalidAbsence.length) throw new AssistantToolError("WORKER_NOT_EXPECTED", "One or more requested absences are not expected to work on that date (rest day, approved leave, holiday, or inactive).", { workerIds: invalidAbsence });
  const records = roster.items.filter((item) => args.presentAllExpected === true || absentWorkerIds.has(item.workerId)).map((item) => ({
    workerId: item.workerId, periodId, attendanceDate: date, scheduledStart: item.scheduledStart, scheduledEnd: item.scheduledEnd, scheduledMinutes: item.scheduledMinutes, breakMinutes: item.breakMinutes,
    actualTimeIn: undefined, actualTimeOut: undefined, regularMinutes: absentWorkerIds.has(item.workerId) ? 0 : item.scheduledMinutes, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0,
    paidDayFraction: absentWorkerIds.has(item.workerId) ? 0 : 1, attendanceStatus: absentWorkerIds.has(item.workerId) ? "ABSENT" : "PRESENT", recordStatus: "CONFIRMED", source: "BULK", notes: undefined,
  }));
  return prepareAttendanceBatch(context, { records });
}

async function prepareSingleAttendance(context: AssistantToolContext, toolName: string, args: Record<string, unknown>) {
  const absent = toolName === "record_absence";
  return prepareAttendanceBatch(context, {
    records: [{
      ...args, recordStatus: "CONFIRMED", source: "MANUAL", attendanceStatus: absent ? "ABSENT" : "PRESENT",
      regularMinutes: absent ? 0 : args.scheduledMinutes || 0, paidDayFraction: absent ? 0 : 1, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0, breakMinutes: 0,
    }],
  });
}

async function prepareLeaveRequest(context: AssistantToolContext, args: Record<string, unknown>) {
  const worker = await getWorker(context, String(args.workerId));
  if (!bool(worker, "active", true)) throw new AssistantToolError("WORKER_INACTIVE", "Leave cannot be prepared for an inactive worker.");
  const overlap = await getRows(userCompanyQuery(context, "leave_requests", LEAVE_SELECT).eq("worker_id", String(args.workerId)).in("status", ["DRAFT", "PENDING", "APPROVED"]).lte("start_date", String(args.endDate)).gte("end_date", String(args.startDate)).limit(10), "Existing leave requests");
  if (overlap.some((row) => !(String(args.partialDay || "FULL") === "AM" && text(row, "partial_day") === "PM") && !(String(args.partialDay || "FULL") === "PM" && text(row, "partial_day") === "AM"))) throw new AssistantToolError("LEAVE_OVERLAP", "An active leave request already overlaps those dates.");
  const normalized = { ...args, workerId: String(args.workerId), partialDay: String(args.partialDay || "FULL") };
  return context.prepareAction({
    toolName: "prepare_leave_request", riskTier: "PREPARE", normalizedArgs: normalized, contextGeneration: context.context.generation,
    preview: { operation: "Create leave request", worker: workerView(worker).displayName, leaveType: String(args.leaveType), startDate: String(args.startDate), endDate: String(args.endDate), partialDay: normalized.partialDay, statusAfterConfirmation: "PENDING", writeStatus: "PREPARED only until confirmation" },
  });
}

async function prepareLeaveTransition(context: AssistantToolContext, toolName: string, args: Record<string, unknown>) {
  const row = requireFound(await getOne(userCompanyQuery(context, "leave_requests", LEAVE_SELECT).eq("id", String(args.requestId)).maybeSingle(), "Leave request"), "Leave request was not found in this company.");
  const current = text(row, "status");
  const target = toolName === "approve_leave" ? "APPROVED" : toolName === "reject_leave" ? "REJECTED" : "CANCELLED";
  const valid = target === "APPROVED" || target === "REJECTED" ? current === "PENDING" : ["DRAFT", "PENDING", "APPROVED"].includes(current);
  if (!valid && current !== target) throw new AssistantToolError("INVALID_TRANSITION", `Leave request cannot move from ${current} to ${target}.`);
  return context.prepareAction({ toolName, riskTier: "PREPARE", normalizedArgs: args, contextGeneration: context.context.generation, preview: { operation: `Set leave request to ${target}`, workerId: text(row, "worker_id"), currentStatus: current, targetStatus: target, reason: args.reason || undefined, revalidateOnConfirmation: true } });
}

async function prepareOvertimeRequest(context: AssistantToolContext, args: Record<string, unknown>) {
  if (!args.requestedMinutes) throw new AssistantToolError("INVALID_ARGUMENT", "requestedMinutes is required.");
  const worker = await getWorker(context, String(args.workerId));
  if (!bool(worker, "active", true)) throw new AssistantToolError("WORKER_INACTIVE", "Overtime cannot be prepared for an inactive worker.");
  if (typeof args.periodId === "string") await assertOpenPeriod(context, args.periodId);
  if (typeof args.projectId === "string") await getProject(context, args.projectId);
  const normalized = { ...args, laborContext: String(args.laborContext || (args.projectId ? "PROJECT" : "UNALLOCATED_REVIEW")), approvedMinutes: 0, source: "MANUAL" };
  return context.prepareAction({
    toolName: "prepare_overtime_request", riskTier: "PREPARE", normalizedArgs: normalized, contextGeneration: context.context.generation,
    preview: { operation: "Create overtime request", worker: workerView(worker).displayName, date: String(args.overtimeDate), requestedMinutes: Number(args.requestedMinutes), laborContext: normalized.laborContext, projectId: args.projectId || undefined, statusAfterConfirmation: "PENDING", writeStatus: "PREPARED only until confirmation" },
  });
}

async function prepareOvertimeTransition(context: AssistantToolContext, toolName: string, args: Record<string, unknown>) {
  const row = requireFound(await getOne(userCompanyQuery(context, "overtime_requests", OVERTIME_SELECT).eq("id", String(args.requestId)).maybeSingle(), "Overtime request"), "Overtime request was not found in this company.");
  const current = text(row, "status");
  const target = toolName === "approve_overtime" ? "APPROVED" : toolName === "reject_overtime" ? "REJECTED" : "CANCELLED";
  const valid = target === "APPROVED" || target === "REJECTED" ? current === "PENDING" : ["DRAFT", "PENDING", "APPROVED"].includes(current);
  if (!valid && current !== target) throw new AssistantToolError("INVALID_TRANSITION", `Overtime request cannot move from ${current} to ${target}.`);
  if (typeof row.period_id === "string") await assertOpenPeriod(context, String(row.period_id));
  return context.prepareAction({ toolName, riskTier: "PREPARE", normalizedArgs: args, contextGeneration: context.context.generation, preview: { operation: `Set overtime request to ${target}`, workerId: text(row, "worker_id"), currentStatus: current, targetStatus: target, requestedMinutes: amount(row, "requested_minutes"), approvedMinutes: args.approvedMinutes, revalidateOnConfirmation: true } });
}

async function preparePayrollRecalculation(context: AssistantToolContext, args: Record<string, unknown>) {
  const period = await assertOpenPeriod(context, String(args.periodId));
  const runs = await getRows(userCompanyQuery(context, "payroll_runs", RUN_SELECT).eq("period_id", String(period.id)).order("created_at", { ascending: false }).limit(5), "Payroll runs");
  const run = typeof args.runId === "string" ? await getRun(context, args.runId) : runs[0];
  if (!run) throw new AssistantToolError("RUN_NOT_FOUND", "No payroll run exists for this period.");
  if (text(run, "period_id") !== text(period, "id")) throw new AssistantToolError("PERIOD_MISMATCH", "The payroll run is not linked to the requested period.");
  if (!['DRAFT', 'CALCULATED'].includes(text(run, "status"))) throw new AssistantToolError("PAYROLL_LOCKED", "Only draft or calculated payroll runs can be recalculated.");
  return context.prepareAction({
    toolName: "prepare_payroll_recalculation", riskTier: "PREPARE", normalizedArgs: { periodId: String(period.id), runId: String(run.id) }, contextGeneration: context.context.generation,
    preview: { operation: "Recalculate payroll run", periodStart: text(period, "period_start"), periodEnd: text(period, "period_end"), runStatus: text(run, "status"), sourceRevision: Number(period.source_revision || 0), writeStatus: "Replace only the open run's calculated entries after confirmation", authoritativeCalculation: false },
  });
}

async function preparePayrollRunCreation(context: AssistantToolContext, args: Record<string, unknown>) {
  const period = await assertOpenPeriod(context, String(args.periodId));
  const runs = await getRows(userCompanyQuery(context, "payroll_runs", RUN_SELECT).eq("period_id", String(period.id)).limit(10), "Payroll runs");
  if (runs.some((run) => text(run, "status") !== "VOID")) throw new AssistantToolError("RUN_EXISTS", "A non-void payroll run already exists for this period.");
  return context.prepareAction({
    toolName: "create_payroll_run", riskTier: "NORMAL_MUTATION", normalizedArgs: { periodId: String(period.id) }, contextGeneration: context.context.generation,
    preview: { operation: "Create draft payroll run", periodStart: text(period, "period_start"), periodEnd: text(period, "period_end"), statusAfterConfirmation: "DRAFT", writeStatus: "PREPARED only until confirmation" },
  });
}

async function preparePayrollFinalization(context: AssistantToolContext, toolName: string, args: Record<string, unknown>) {
  const run = await getRun(context, String(args.runId));
  const period = await getPeriod(context, text(run, "period_id"));
  const target = toolName === "approve_payroll" ? "APPROVED" : "PAID";
  if (target === "APPROVED" && text(run, "status") !== "CALCULATED") throw new AssistantToolError("INVALID_TRANSITION", "Only a calculated payroll run can be approved.");
  if (target === "PAID" && text(run, "status") !== "APPROVED") throw new AssistantToolError("INVALID_TRANSITION", "Only an approved payroll run can be marked paid.");
  if (periodView(period).locked && target === "APPROVED") throw new AssistantToolError("PAYROLL_LOCKED", "The payroll period is already locked or finalized.");
  const entries = await getRows(userCompanyQuery(context, "payroll_entries", "id,calculation_snapshot,gross_pay,net_pay").eq("payroll_run_id", String(run.id)).limit(500), "Payroll entries");
  if (target === "APPROVED" && (!entries.length || entries.some((entry) => !entry.calculation_snapshot || typeof entry.calculation_snapshot !== "object" || !Object.keys(entry.calculation_snapshot as object).length))) throw new AssistantToolError("PAYROLL_NOT_READY", "Approval requires at least one persisted entry with a calculation snapshot.");
  if (target === "APPROVED" && Number(run.calculated_source_revision) !== Number(period.source_revision)) throw new AssistantToolError("STALE_PAYROLL", "Payroll sources changed after calculation. Recalculate before approval.");
  return context.prepareAction({ toolName, riskTier: "FINANCIAL_FINALIZATION", normalizedArgs: args, contextGeneration: context.context.generation, preview: { operation: target === "APPROVED" ? "Approve payroll run" : "Mark payroll run paid", periodStart: text(period, "period_start"), periodEnd: text(period, "period_end"), currentStatus: text(run, "status"), targetStatus: target, entryCount: entries.length, sourceRevision: Number(period.source_revision || 0), explicitConfirmationRequired: true } });
}

async function prepareExpenseDraft(context: AssistantToolContext, args: Record<string, unknown>) {
  if (typeof args.projectId === "string") {
    const project = await getProject(context, args.projectId);
    if (text(project, "status") === "ARCHIVED" || project.archived_at) throw new AssistantToolError("PROJECT_ARCHIVED", "Archived projects cannot receive new expenses.");
  }
  return context.prepareAction({
    toolName: "create_expense_draft", riskTier: "NORMAL_MUTATION", normalizedArgs: args, contextGeneration: context.context.generation,
    preview: { operation: "Create expense draft", date: args.expenseDate, category: args.category, description: args.description, amount: args.amount, currency: args.currency, projectId: args.projectId || undefined, statusAfterConfirmation: "DRAFT" },
  });
}

async function prepareProjectDraft(context: AssistantToolContext, args: Record<string, unknown>) {
  const existing = await getOne(companyQuery(context, "projects", "id,project_code,project_name,status").eq("project_code", String(args.projectCode)).maybeSingle(), "Project");
  if (existing) throw new AssistantToolError("PROJECT_EXISTS", "A project with that code already exists in this company.");
  return context.prepareAction({
    toolName: "create_project_draft", riskTier: "NORMAL_MUTATION", normalizedArgs: args, contextGeneration: context.context.generation,
    preview: { operation: "Create planning project", projectCode: args.projectCode, projectName: args.projectName, projectBudget: args.projectBudget || 0, currency: args.currency || "PHP", statusAfterConfirmation: "PLANNING" },
  });
}

async function prepareInvoiceProjectAssignment(context: AssistantToolContext, args: Record<string, unknown>) {
  if (args.allocationAmount === undefined && args.allocationPercentage === undefined) throw new AssistantToolError("ALLOCATION_REQUIRED", "Provide an allocation amount or percentage.");
  if (args.allocationAmount !== undefined && args.allocationPercentage !== undefined) throw new AssistantToolError("ALLOCATION_AMBIGUOUS", "Provide either an allocation amount or a percentage, not both.");
  const invoice = await getInvoice(context, String(args.invoiceId));
  const project = await getProject(context, String(args.projectId));
  if (text(project, "status") === "ARCHIVED" || project.archived_at) throw new AssistantToolError("PROJECT_ARCHIVED", "Archived projects cannot receive new invoice allocations.");
  if (text(invoice, "review_status") !== "VERIFIED") throw new AssistantToolError("INVOICE_NOT_VERIFIED", "Invoice project allocation requires a human-verified invoice.");
  if (text(invoice, "lifecycle_status", "ACTIVE") === "VOID") throw new AssistantToolError("INVOICE_VOID", "Voided invoices retain their allocation history and cannot receive new project allocations.");
  return context.prepareAction({
    toolName: "assign_invoice_to_project", riskTier: "NORMAL_MUTATION", normalizedArgs: args, contextGeneration: context.context.generation,
    preview: { operation: "Assign verified invoice to project", invoice: safeLabel(invoice.invoice_number, invoice.id), project: safeLabel(project.project_code, project.project_name), allocationAmount: args.allocationAmount, allocationPercentage: args.allocationPercentage },
  });
}

async function prepareInvoiceDraftUpdate(context: AssistantToolContext, args: Record<string, unknown>) {
  const invoice = await getInvoice(context, String(args.invoiceId));
  if (text(invoice, "review_status") !== "NEEDS_REVIEW") throw new AssistantToolError("INVOICE_LOCKED", "Only an unverified invoice draft can be updated through the assistant.");
  const fields = ["invoiceNumber", "dueDate", "projectReference", "notes"].filter((key) => args[key] !== undefined);
  if (!fields.length) throw new AssistantToolError("NO_CHANGES", "Provide at least one supported invoice draft field to update.");
  return context.prepareAction({
    toolName: "update_invoice_draft", riskTier: "NORMAL_MUTATION", normalizedArgs: args, contextGeneration: context.context.generation,
    preview: { operation: "Update unverified invoice draft", invoice: safeLabel(invoice.invoice_number, invoice.id), fields, humanVerificationRequired: true },
  });
}

async function updateOne(context: AssistantToolContext, table: string, id: string, patch: Record<string, unknown>, expectedStatus?: string) {
  let query = db(context).from(table).update(patch).eq("id", id).eq("company_id", context.auth.companyId);
  if (expectedStatus) query = query.eq("status", expectedStatus);
  return requireFound(await getOne(query.select("*").maybeSingle(), "Operation result"), "The record changed before confirmation; no update was applied.");
}

async function executeAttendanceBatch(context: AssistantToolContext, args: Record<string, unknown>) {
  const records = args.records as Array<Record<string, unknown>>;
  const workerIds = [...new Set(records.map((record) => String(record.workerId)))];
  const workers = await getRows(userCompanyQuery(context, "workers", "id,active").in("id", workerIds).limit(50), "Attendance workers");
  if (workers.length !== workerIds.length || workers.some((worker) => !bool(worker, "active", true))) throw new AssistantToolError("WORKER_CHANGED", "An attendance worker is missing or inactive.");
  const periodIds = [...new Set(records.map((record) => typeof record.periodId === "string" ? record.periodId : undefined).filter(Boolean) as string[])];
  for (const periodId of periodIds) await assertOpenPeriod(context, periodId);
  const dates = records.map((record) => String(record.attendanceDate)).sort();
  const existingQuery = userCompanyQuery(context, "attendance_records", ATTENDANCE_SELECT).in("worker_id", workerIds).gte("attendance_date", dates[0]).lte("attendance_date", dates.at(-1));
  const existing = await getRows(existingQuery.limit(500), "Current attendance records");
  if (existing.some((row) => text(row, "record_status") === "VOID" && records.some((record) => text(row, "workerId") === text(row, "worker_id") && String(record.attendanceDate) === text(row, "attendance_date")))) throw new AssistantToolError("ATTENDANCE_CHANGED", "A targeted attendance record is void and cannot be overwritten.");
  const existingRecords = existing.map((row) => ({
    id: text(row, "id"), companyId: context.auth.companyId, workerId: text(row, "worker_id"), periodId: optionalText(row, "period_id"), attendanceDate: text(row, "attendance_date"),
    scheduledStart: optionalText(row, "scheduled_start"), scheduledEnd: optionalText(row, "scheduled_end"), scheduledMinutes: amount(row, "scheduled_minutes"), breakMinutes: amount(row, "break_minutes"),
    actualTimeIn: optionalText(row, "actual_time_in"), actualTimeOut: optionalText(row, "actual_time_out"), regularMinutes: amount(row, "regular_minutes"), lateMinutes: amount(row, "late_minutes"),
    undertimeMinutes: amount(row, "undertime_minutes"), overtimeMinutes: amount(row, "overtime_minutes"), paidDayFraction: amount(row, "paid_day_fraction"), attendanceStatus: text(row, "attendance_status", "PRESENT"),
    recordStatus: text(row, "record_status", "DRAFT"), source: text(row, "source", "MANUAL"), notes: optionalText(row, "notes"), createdBy: optionalText(row, "created_by"), updatedBy: optionalText(row, "updated_by"),
    createdAt: optionalText(row, "created_at"), updatedAt: optionalText(row, "updated_at"),
  })) as any;
  const normalizedBatch = applyAttendanceBatch({ records: records as AttendanceRecordInput[], existingRecords, companyId: context.auth.companyId, defaultSource: "BULK", defaultRecordStatus: "CONFIRMED" });
  if (!normalizedBatch.valid) throw new AssistantToolError("ATTENDANCE_INVALID", normalizedBatch.errors.map((issue) => issue.message).join(" ") || "Attendance records are invalid.");
  const changed = [...normalizedBatch.created, ...normalizedBatch.updated];
  const rows = changed.map((record) => ({
    id: record.id || randomUUID(), user_id: context.auth.user.id, company_id: context.auth.companyId, worker_id: record.workerId, period_id: record.periodId || null, attendance_date: record.attendanceDate,
    scheduled_start: record.scheduledStart || null, scheduled_end: record.scheduledEnd || null, scheduled_minutes: record.scheduledMinutes || 0, break_minutes: record.breakMinutes || 0,
    actual_time_in: record.actualTimeIn || null, actual_time_out: record.actualTimeOut || null, regular_minutes: record.regularMinutes || 0, late_minutes: record.lateMinutes || 0,
    undertime_minutes: record.undertimeMinutes || 0, overtime_minutes: record.overtimeMinutes || 0, paid_day_fraction: record.paidDayFraction || 0, attendance_status: record.attendanceStatus,
    record_status: record.recordStatus || "CONFIRMED", source: record.source || "BULK", notes: record.notes || null, created_by: record.createdBy || context.auth.user.id, updated_by: context.auth.user.id, updated_at: context.now.toISOString(),
  }));
  if (!rows.length) return { operation: "attendance_unchanged", count: 0, records: [] };
  const { data, error } = await db(context).from("attendance_records").upsert(rows, { onConflict: "company_id,worker_id,attendance_date" }).select(ATTENDANCE_SELECT);
  if (error) throw new AssistantToolError("WRITE_FAILED", "Attendance could not be saved.");
  return { operation: "attendance_saved", count: Array.isArray(data) ? data.length : rows.length, records: Array.isArray(data) ? (data as Row[]).map(attendanceView) : [] };
}

async function executeWorkerCreate(context: AssistantToolContext, args: Record<string, unknown>, actionId?: string, preview: Record<string, unknown> = {}) {
  const employeeCode = String(args.employeeCode || "").trim();
  if (!employeeCode) throw new AssistantToolError("EMPLOYEE_CODE_REQUIRED", "The employee code could not be generated safely. Prepare the employee again with a code.");
  const current = await getRows(companyQuery(context, "workers", "id,employee_code").limit(5000), "Current workers");
  const duplicate = current.find((row) => text(row, "employee_code").trim().toLowerCase() === employeeCode.toLowerCase());
  if (duplicate) {
    if (text(duplicate, "id") !== String(actionId || "")) throw new AssistantToolError("EMPLOYEE_CODE_CHANGED", "That employee code was used before confirmation. Prepare the employee again.");
    const existing = requireFound(await getOne(companyQuery(context, "workers", WORKER_SELECT).eq("id", String(actionId)).maybeSingle(), "Worker"), "The prepared employee already exists in this company.");
    return { operation: "worker_created", worker: workerView(existing), compensation: { payType: text(existing, "default_pay_type"), rate: amount(existing, "default_rate"), currency: preview.currency || context.context.currency || "PHP" }, confirmedPreview: preview };
  }
  if (typeof args.departmentId === "string") {
    const department = await getOne(companyQuery(context, "departments", "id,name,active,archived_at").eq("id", args.departmentId).maybeSingle(), "Department");
    if (!department) throw new AssistantToolError("DEPARTMENT_CHANGED", "The selected department is no longer available in this company.");
  }
  const firstName = String(args.firstName).trim();
  const lastName = String(args.lastName).trim();
  const displayName = `${firstName} ${lastName}`.trim();
  const row = {
    id: actionId || randomUUID(),
    user_id: context.auth.user.id,
    company_id: context.auth.companyId,
    auth_user_id: null,
    employee_code: employeeCode,
    first_name: firstName,
    middle_name: args.middleName || null,
    last_name: lastName,
    display_name: displayName,
    employment_type: args.employmentType || "OTHER",
    employment_status: args.employmentStatus || "ACTIVE",
    job_title: args.jobTitle || null,
    department: args.department || null,
    department_id: args.departmentId || null,
    manager_worker_id: null,
    default_pay_type: args.defaultPayType,
    default_rate: args.defaultRate,
    active: args.active === true,
    hire_date: args.hireDate || null,
    end_date: null,
    working_days: null,
    working_hours_start: null,
    working_hours_end: null,
    notes: args.notes || null,
    archived_at: null,
    updated_at: context.now.toISOString(),
  };
  const { data, error } = await db(context).from("workers").insert(row).select(WORKER_SELECT).single();
  if (error) {
    if (String((error as any)?.code || "") === "23505") throw new AssistantToolError("EMPLOYEE_CODE_CHANGED", "That employee code was used before confirmation. Prepare the employee again.");
    throw new AssistantToolError("WRITE_FAILED", "The employee could not be created.");
  }
  return {
    operation: "worker_created",
    worker: workerView(data as Row),
    compensation: { payType: args.defaultPayType, rate: args.defaultRate, currency: preview.currency || context.context.currency || "PHP" },
    confirmedPreview: preview,
  };
}

async function executeLeaveCreate(context: AssistantToolContext, args: Record<string, unknown>, actionId?: string) {
  const worker = await getWorker(context, String(args.workerId));
  if (!bool(worker, "active", true)) throw new AssistantToolError("WORKER_CHANGED", "The worker is no longer active.");
  const overlap = await getRows(userCompanyQuery(context, "leave_requests", LEAVE_SELECT).eq("worker_id", String(args.workerId)).in("status", ["DRAFT", "PENDING", "APPROVED"]).lte("start_date", String(args.endDate)).gte("end_date", String(args.startDate)).limit(10), "Current leave requests");
  if (overlap.some((row) => !(String(args.partialDay || "FULL") === "AM" && text(row, "partial_day") === "PM") && !(String(args.partialDay || "FULL") === "PM" && text(row, "partial_day") === "AM"))) throw new AssistantToolError("LEAVE_CHANGED", "An active leave request now overlaps those dates.");
  const row = {
    id: actionId || randomUUID(), user_id: context.auth.user.id, company_id: context.auth.companyId, worker_id: args.workerId, leave_type: args.leaveType,
    start_date: args.startDate, end_date: args.endDate, partial_day: args.partialDay || "FULL", paid: args.paid ?? null, status: "PENDING", notes: args.notes || null,
    created_by: context.auth.user.id, updated_by: context.auth.user.id, updated_at: context.now.toISOString(),
  };
  const { data, error } = await db(context).from("leave_requests").insert(row).select(LEAVE_SELECT).single();
  if (error) throw new AssistantToolError("WRITE_FAILED", "The leave request could not be created.");
  return { operation: "leave_created", request: leaveView(data as Row) };
}

async function executeLeaveTransition(context: AssistantToolContext, toolName: string, args: Record<string, unknown>) {
  const current = requireFound(await getOne(userCompanyQuery(context, "leave_requests", LEAVE_SELECT).eq("id", String(args.requestId)).maybeSingle(), "Leave request"), "Leave request was not found in this company.");
  const currentStatus = text(current, "status");
  const target = toolName === "approve_leave" ? "APPROVED" : toolName === "reject_leave" ? "REJECTED" : "CANCELLED";
  if (currentStatus === target) return { operation: "leave_already_in_target_state", request: leaveView(current) };
  const valid = target === "APPROVED" || target === "REJECTED" ? currentStatus === "PENDING" : ["DRAFT", "PENDING", "APPROVED"].includes(currentStatus);
  if (!valid) throw new AssistantToolError("LEAVE_CHANGED", `Leave request is now ${currentStatus}; it was not changed.`);
  if (toolName === "cancel_leave") {
    const lifecycle = await db(context).rpc("apply_workforce_source_lifecycle", { p_entity_type: "LEAVE", p_entity_id: args.requestId, p_action: "CANCEL", p_reason: args.reason || "Leave request cancelled by an authorized payroll user" });
    if (lifecycle.error) throw new AssistantToolError("DOMAIN_WRITE_REJECTED", "The leave cancellation was rejected by the authoritative payroll lifecycle.");
    const record = lifecycle.data && typeof lifecycle.data === "object" && !Array.isArray(lifecycle.data) && (lifecycle.data as Record<string, unknown>).record && typeof (lifecycle.data as Record<string, unknown>).record === "object"
      ? (lifecycle.data as Record<string, unknown>).record as Row
      : lifecycle.data as Row;
    return { operation: "leave_updated", request: leaveView(record) };
  }
  const updated = await updateOne(context, "leave_requests", String(current.id), { status: target, notes: args.reason || current.notes || null, updated_by: context.auth.user.id, updated_at: context.now.toISOString() }, currentStatus);
  return { operation: "leave_updated", request: leaveView(updated) };
}

async function executeOvertimeCreate(context: AssistantToolContext, args: Record<string, unknown>, actionId?: string) {
  const worker = await getWorker(context, String(args.workerId));
  if (!bool(worker, "active", true)) throw new AssistantToolError("WORKER_CHANGED", "The worker is no longer active.");
  if (typeof args.periodId === "string") await assertOpenPeriod(context, args.periodId);
  if (typeof args.projectId === "string") await getProject(context, args.projectId);
  const row = {
    id: actionId || randomUUID(), user_id: context.auth.user.id, company_id: context.auth.companyId, worker_id: args.workerId, period_id: args.periodId || null, overtime_date: args.overtimeDate,
    project_id: args.projectId || null, labor_context: args.laborContext || (args.projectId ? "PROJECT" : "UNALLOCATED_REVIEW"), requested_minutes: args.requestedMinutes, approved_minutes: 0,
    reason: args.reason || null, status: "PENDING", notes: args.notes || null, source: "MANUAL", created_by: context.auth.user.id, updated_by: context.auth.user.id, updated_at: context.now.toISOString(),
  };
  const { data, error } = await db(context).from("overtime_requests").insert(row).select(OVERTIME_SELECT).single();
  if (error) throw new AssistantToolError("WRITE_FAILED", "The overtime request could not be created.");
  return { operation: "overtime_created", request: overtimeView(data as Row) };
}

async function executeOvertimeTransition(context: AssistantToolContext, toolName: string, args: Record<string, unknown>) {
  const current = requireFound(await getOne(userCompanyQuery(context, "overtime_requests", OVERTIME_SELECT).eq("id", String(args.requestId)).maybeSingle(), "Overtime request"), "Overtime request was not found in this company.");
  const currentStatus = text(current, "status");
  const target = toolName === "approve_overtime" ? "APPROVED" : toolName === "reject_overtime" ? "REJECTED" : "CANCELLED";
  if (currentStatus === target) return { operation: "overtime_already_in_target_state", request: overtimeView(current) };
  if (typeof current.period_id === "string") await assertOpenPeriod(context, String(current.period_id));
  const valid = target === "APPROVED" || target === "REJECTED" ? currentStatus === "PENDING" : ["DRAFT", "PENDING", "APPROVED"].includes(currentStatus);
  if (!valid) throw new AssistantToolError("OVERTIME_CHANGED", `Overtime request is now ${currentStatus}; it was not changed.`);
  if (toolName === "cancel_overtime") {
    const lifecycle = await db(context).rpc("apply_workforce_source_lifecycle", { p_entity_type: "OVERTIME", p_entity_id: args.requestId, p_action: "CANCEL", p_reason: args.reason || "Overtime request cancelled by an authorized payroll user" });
    if (lifecycle.error) throw new AssistantToolError("DOMAIN_WRITE_REJECTED", "The overtime cancellation was rejected by the authoritative payroll lifecycle.");
    const record = lifecycle.data && typeof lifecycle.data === "object" && !Array.isArray(lifecycle.data) && (lifecycle.data as Record<string, unknown>).record && typeof (lifecycle.data as Record<string, unknown>).record === "object"
      ? (lifecycle.data as Record<string, unknown>).record as Row
      : lifecycle.data as Row;
    return { operation: "overtime_updated", request: overtimeView(record) };
  }
  const approvedMinutes = target === "APPROVED" ? Number(args.approvedMinutes ?? current.requested_minutes) : 0;
  if (target === "APPROVED" && (!Number.isInteger(approvedMinutes) || approvedMinutes < 0 || approvedMinutes > amount(current, "requested_minutes"))) throw new AssistantToolError("INVALID_APPROVAL", "Approved overtime cannot exceed requested minutes.");
  const updated = await updateOne(context, "overtime_requests", String(current.id), { status: target, approved_minutes: approvedMinutes, approved_by: target === "APPROVED" ? context.auth.user.id : null, approved_at: target === "APPROVED" ? context.now.toISOString() : null, notes: args.reason || current.notes || null, updated_by: context.auth.user.id, updated_at: context.now.toISOString() }, currentStatus);
  return { operation: "overtime_updated", request: overtimeView(updated) };
}

async function executePayrollRecalculation(context: AssistantToolContext, args: Record<string, unknown>, preview: Record<string, unknown>) {
  const period = await assertOpenPeriod(context, String(args.periodId));
  const run = await getRun(context, String(args.runId));
  if (text(run, "period_id") !== text(period, "id")) throw new AssistantToolError("PERIOD_MISMATCH", "The payroll run is not linked to the requested period.");
  if (!['DRAFT', 'CALCULATED'].includes(text(run, "status"))) throw new AssistantToolError("PAYROLL_LOCKED", "Only an open payroll run can be recalculated.");
  if (preview.sourceRevision !== undefined && Number(preview.sourceRevision) !== Number(period.source_revision || 0)) throw new AssistantToolError("STALE_PREVIEW", "Payroll sources changed after the preview. Prepare the recalculation again.");
  const startDate = text(period, "period_start");
  const endDate = text(period, "period_end");
  const [workerRows, assignmentRows, workEntryRows, attendanceRows, leaveRows, overtimeRows, holidayRows, projectRows] = await Promise.all([
    getRows(userCompanyQuery(context, "workers", WORKER_SELECT).eq("active", true).limit(500), "Payroll workers"),
    getRows(userCompanyQuery(context, "project_worker_assignments", "id,worker_id,project_id,start_date,end_date,pay_type,rate,role_on_project,active").limit(1000), "Payroll assignments"),
    getRows(userCompanyQuery(context, "work_entries", "id,worker_id,project_id,labor_context,period_id,work_date,regular_hours,overtime_hours,days_worked,rate,overtime_rate,status").eq("period_id", String(period.id)).limit(1000), "Payroll work entries"),
    getRows(userCompanyQuery(context, "attendance_records", ATTENDANCE_SELECT).eq("period_id", String(period.id)).limit(1000), "Payroll attendance"),
    getRows(userCompanyQuery(context, "leave_requests", LEAVE_SELECT).gte("end_date", startDate).lte("start_date", endDate).limit(1000), "Payroll leave"),
    getRows(userCompanyQuery(context, "overtime_requests", OVERTIME_SELECT).eq("period_id", String(period.id)).limit(1000), "Payroll overtime"),
    getRows(userCompanyQuery(context, "payroll_holidays", "id,holiday_date,name,category,active").gte("holiday_date", startDate).lte("holiday_date", endDate).eq("active", true).limit(100), "Payroll holidays"),
    getRows(userCompanyQuery(context, "projects", "id,status,archived_at").limit(500), "Payroll projects"),
  ]);
  const workers = workerRows.map((row) => ({ id: text(row, "id"), displayName: text(row, "display_name", safeLabel(row.first_name, row.last_name)), active: bool(row, "active", true), defaultRate: amount(row, "default_rate"), defaultPayType: text(row, "default_pay_type", "MONTHLY"), employeeCode: optionalText(row, "employee_code") })) as any;
  const assignments = assignmentRows.map((row) => ({ id: text(row, "id"), workerId: text(row, "worker_id"), projectId: text(row, "project_id"), startDate: text(row, "start_date"), endDate: optionalText(row, "end_date"), payType: optionalText(row, "pay_type"), rate: row.rate === null ? undefined : amount(row, "rate"), active: bool(row, "active", true), roleOnProject: optionalText(row, "role_on_project") })) as any;
  const workEntries = workEntryRows.map((row) => ({ id: text(row, "id"), workerId: text(row, "worker_id"), projectId: optionalText(row, "project_id"), laborContext: optionalText(row, "labor_context"), periodId: optionalText(row, "period_id"), workDate: text(row, "work_date"), regularHours: row.regular_hours === null ? undefined : amount(row, "regular_hours"), overtimeHours: row.overtime_hours === null ? undefined : amount(row, "overtime_hours"), daysWorked: row.days_worked === null ? undefined : amount(row, "days_worked"), rate: amount(row, "rate"), overtimeRate: row.overtime_rate === null ? undefined : amount(row, "overtime_rate"), status: text(row, "status") })) as any;
  const projects = projectRows.map((row) => ({ id: text(row, "id"), status: text(row, "status"), archivedAt: optionalText(row, "archived_at") })) as any;
  const calculation = calculatePayrollRunFromWorkEntries({
    runId: text(run, "id"), periodId: text(period, "id"), periodStart: startDate, periodEnd: endDate, workers, assignments, workEntries, projects,
    attendanceRecords: attendanceRows as any, leaveRequests: leaveRows as any, overtimeRequests: overtimeRows as any, holidays: holidayRows as any, sourceRevision: Number(period.source_revision || 0),
  });
  if (!calculation.entries.length) throw new AssistantToolError("PAYROLL_NO_SOURCES", "No usable approved work, confirmed attendance, or approved overtime sources were found for this run.");
  const generatedEntries = calculation.entries.map((entry) => ({ id: randomUUID(), payrollRunId: text(run, "id"), workerId: entry.workerId, basePay: entry.basePay, regularPay: entry.regularPay, overtimePay: entry.overtimePay, allowances: entry.allowances, otherEarnings: 0, grossPay: entry.grossPay, deductions: entry.deductions, otherDeductions: 0, employerCosts: 0, netPay: entry.netPay, projectAllocatedCost: entry.projectAllocatedCost, calculationSnapshot: entry.calculationSnapshot, costContext: {}, importRowId: undefined }));
  const entryByWorker = new Map(generatedEntries.map((entry) => [entry.workerId, entry.id]));
  const generatedAllocations = calculation.allocations.filter((allocation) => Boolean(allocation.projectId)).map((allocation) => ({ id: randomUUID(), payrollEntryId: entryByWorker.get(allocation.workerId), projectId: allocation.projectId, allocationAmount: allocation.allocationAmount, allocationPercentage: allocation.allocationPercentage, source: allocation.source })).filter((allocation) => Boolean(allocation.payrollEntryId));
  const { error: replaceError } = await db(context).rpc("replace_payroll_run_entries", { p_run_id: String(run.id), p_expected_source_revision: Number(period.source_revision || 0), p_entries: generatedEntries, p_allocations: generatedAllocations });
  if (replaceError) throw new AssistantToolError("WRITE_FAILED", "The calculated payroll entries could not be replaced atomically.");
  const calculatedAt = context.now.toISOString();
  const updatedRun = requireFound(await getOne(db(context).from("payroll_runs").update({ status: "CALCULATED", calculated_at: calculatedAt, calculated_source_revision: calculation.sourceRevision ?? Number(period.source_revision || 0), source_fingerprint: calculation.sourceFingerprint || null }).eq("id", String(run.id)).eq("company_id", context.auth.companyId).select(RUN_SELECT).single(), "Payroll run update"), "The payroll run could not be marked calculated.");
  return { operation: "payroll_recalculated", run: runView(updatedRun), entryCount: generatedEntries.length, warnings: calculation.warnings.slice(0, 20), sourceRevision: calculation.sourceRevision, authoritativeCalculation: false };
}

async function executePayrollRunCreation(context: AssistantToolContext, args: Record<string, unknown>, actionId?: string) {
  const period = await assertOpenPeriod(context, String(args.periodId));
  const runs = await getRows(userCompanyQuery(context, "payroll_runs", RUN_SELECT).eq("period_id", String(period.id)).limit(10), "Current payroll runs");
  const existing = runs.find((run) => text(run, "status") !== "VOID");
  if (existing) {
    if (actionId && text(existing, "id") === actionId) return { operation: "payroll_run_already_created", entityType: "PAYROLL_RUN", entityId: actionId, displayLabel: `${text(period, "period_start")} – ${text(period, "period_end")}`, period: periodView(period), run: runView(existing) };
    throw new AssistantToolError("RUN_EXISTS", "A payroll run already exists for this period; no second run was created.");
  }
  const { data, error } = await db(context).from("payroll_runs").insert({ id: actionId || randomUUID(), user_id: context.auth.user.id, company_id: context.auth.companyId, period_id: period.id, status: "DRAFT", calculated_at: null, calculated_source_revision: null, source_fingerprint: null, approved_at: null, paid_at: null, notes: null }).select(RUN_SELECT).single();
  if (error) throw new AssistantToolError("WRITE_FAILED", "The draft payroll run could not be created.");
  return { operation: "payroll_run_created", entityType: "PAYROLL_RUN", entityId: String((data as Row).id), displayLabel: `${text(period, "period_start")} – ${text(period, "period_end")}`, period: periodView(period), run: runView(data as Row) };
}

async function executePayrollFinalization(context: AssistantToolContext, toolName: string, args: Record<string, unknown>, preview: Record<string, unknown>) {
  const run = await getRun(context, String(args.runId));
  const period = await getPeriod(context, text(run, "period_id"));
  const target = toolName === "approve_payroll" ? "APPROVED" : "PAID";
  const currentStatus = text(run, "status");
  if (currentStatus === target) return { operation: "payroll_already_in_target_state", run: runView(run) };
  if (target === "APPROVED") {
    if (currentStatus !== "CALCULATED") throw new AssistantToolError("PAYROLL_CHANGED", "Only a calculated payroll run can be approved.");
    if (periodView(period).locked) throw new AssistantToolError("PAYROLL_LOCKED", "The payroll period is already locked or finalized.");
    if (Number(run.calculated_source_revision) !== Number(period.source_revision || 0)) throw new AssistantToolError("STALE_PAYROLL", "Payroll sources changed after calculation. Recalculate before approval.");
    const entries = await getRows(userCompanyQuery(context, "payroll_entries", "id,calculation_snapshot").eq("payroll_run_id", String(run.id)).limit(500), "Payroll entries");
    if (!entries.length || entries.some((entry) => !entry.calculation_snapshot || typeof entry.calculation_snapshot !== "object" || !Object.keys(entry.calculation_snapshot as object).length)) throw new AssistantToolError("PAYROLL_NOT_READY", "Approval requires persisted calculated entries with source snapshots.");
  } else if (currentStatus !== "APPROVED") {
    throw new AssistantToolError("PAYROLL_CHANGED", "Only an approved payroll run can be marked paid.");
  }
  if (preview.currentStatus && String(preview.currentStatus) !== currentStatus) throw new AssistantToolError("STALE_PREVIEW", "The payroll run changed after the preview. Prepare the action again.");
  const updated = requireFound(await getOne(db(context).from("payroll_runs").update({ status: target, ...(target === "APPROVED" ? { approved_at: context.now.toISOString() } : { paid_at: context.now.toISOString() }) }).eq("id", String(run.id)).eq("company_id", context.auth.companyId).eq("status", currentStatus).select(RUN_SELECT).single(), "Payroll finalization"), "The payroll run changed before confirmation; no finalization was applied.");
  return { operation: target === "APPROVED" ? "payroll_approved" : "payroll_paid", run: runView(updated), financialFinalization: true };
}

async function executeExpenseDraft(context: AssistantToolContext, args: Record<string, unknown>, actionId?: string) {
  if (typeof args.projectId === "string") {
    const project = await getProject(context, args.projectId);
    if (text(project, "status") === "ARCHIVED" || project.archived_at) throw new AssistantToolError("PROJECT_CHANGED", "The selected project is archived and cannot receive the expense.");
  }
  const { data, error } = await db(context).from("expenses").insert({
    id: actionId || randomUUID(), user_id: context.auth.user.id, company_id: context.auth.companyId, project_id: args.projectId || null, expense_date: args.expenseDate,
    category: args.category, description: args.description, payee: args.payee || null, amount: args.amount, currency: args.currency || "PHP", payment_method: args.paymentMethod || null,
    reference_number: args.referenceNumber || null, status: "DRAFT", notes: args.notes || null, updated_at: context.now.toISOString(),
  }).select(EXPENSE_SELECT).single();
  if (error) throw new AssistantToolError("WRITE_FAILED", "The expense draft could not be created.");
  return { operation: "expense_draft_created", expense: expenseView(data as Row) };
}

async function executeProjectDraft(context: AssistantToolContext, args: Record<string, unknown>, actionId?: string) {
  const existing = await getOne(companyQuery(context, "projects", "id,project_code").eq("project_code", String(args.projectCode)).maybeSingle(), "Project");
  if (existing) throw new AssistantToolError("PROJECT_CHANGED", "A project with that code now exists. Prepare the project again.");
  const { data, error } = await db(context).from("projects").insert({
    id: actionId || randomUUID(), user_id: context.auth.user.id, company_id: context.auth.companyId, project_code: args.projectCode, project_name: args.projectName,
    description: args.description || null, client_name: args.clientName || null, project_budget: args.projectBudget || 0, currency: args.currency || "PHP", status: "PLANNING", updated_at: context.now.toISOString(),
  }).select(PROJECT_SELECT).single();
  if (error) throw new AssistantToolError("WRITE_FAILED", "The planning project could not be created.");
  return { operation: "project_draft_created", project: projectView(data as Row) };
}

async function executeInvoiceProjectAssignment(context: AssistantToolContext, args: Record<string, unknown>, actionId?: string) {
  const invoice = await getInvoice(context, String(args.invoiceId));
  const project = await getProject(context, String(args.projectId));
  if (text(invoice, "review_status") !== "VERIFIED" || text(invoice, "lifecycle_status", "ACTIVE") === "VOID" || text(project, "status") === "ARCHIVED" || project.archived_at) throw new AssistantToolError("SOURCE_CHANGED", "The verified invoice or project is no longer eligible for allocation.");
  const allocationType = args.allocationPercentage !== undefined ? "PERCENTAGE" : "AMOUNT";
  const existing = await getRows(userCompanyQuery(context, "invoice_project_allocations", "id,project_id,allocation_type,allocation_percentage,allocation_amount,notes").eq("invoice_id", String(args.invoiceId)).limit(50), "Invoice project allocations");
  const allocations = existing.filter((row) => text(row, "project_id") !== String(args.projectId)).map((row) => ({ id: text(row, "id"), project_id: text(row, "project_id"), allocation_type: text(row, "allocation_type"), allocation_percentage: row.allocation_percentage ?? null, allocation_amount: row.allocation_amount ?? null, notes: row.notes ?? null }));
  const previous = existing.find((row) => text(row, "project_id") === String(args.projectId));
  allocations.push({ id: (previous ? text(previous, "id") : undefined) || actionId || randomUUID(), project_id: String(args.projectId), allocation_type: allocationType, allocation_percentage: allocationType === "PERCENTAGE" ? args.allocationPercentage : null, allocation_amount: allocationType === "AMOUNT" ? args.allocationAmount : null, notes: args.notes || null });
  const expectedUpdatedAt = optionalText(invoice, "updated_at");
  if (!expectedUpdatedAt) throw new AssistantToolError("DATA_UNAVAILABLE", "Invoice freshness is unavailable; prepare the allocation again.");
  const result = await db(context).rpc("replace_invoice_project_allocations", { p_invoice_id: args.invoiceId, p_allocations: allocations, p_expected_updated_at: expectedUpdatedAt });
  if (result.error) throw new AssistantToolError("WRITE_FAILED", "The invoice project allocation could not be saved through the authoritative allocation workflow.");
  return { operation: "invoice_project_assignment_saved", allocations: result.data || [], invoiceId: args.invoiceId, projectId: args.projectId };
}

async function executeInvoiceDraftUpdate(context: AssistantToolContext, args: Record<string, unknown>) {
  const invoice = await getInvoice(context, String(args.invoiceId));
  if (text(invoice, "review_status") !== "NEEDS_REVIEW" || text(invoice, "lifecycle_status", "ACTIVE") === "VOID") throw new AssistantToolError("INVOICE_CHANGED", "The invoice is no longer an editable draft.");
  const currentData = invoice.current_data && typeof invoice.current_data === "object" && !Array.isArray(invoice.current_data) ? invoice.current_data as Record<string, unknown> : {};
  const nextData = { ...currentData };
  const patch: Record<string, unknown> = { updated_at: context.now.toISOString(), current_data: nextData };
  if (args.invoiceNumber !== undefined) { patch.invoice_number = args.invoiceNumber; nextData.invoiceNumber = args.invoiceNumber; }
  if (args.dueDate !== undefined) { patch.due_date = args.dueDate; nextData.dueDate = args.dueDate; }
  if (args.projectReference !== undefined) nextData.projectReference = args.projectReference;
  if (args.notes !== undefined) nextData.notes = args.notes;
  const updated = requireFound(await getOne(db(context).from("invoices").update(patch).eq("id", String(args.invoiceId)).eq("company_id", context.auth.companyId).eq("review_status", "NEEDS_REVIEW").eq("updated_at", String(invoice.updated_at || "")).select(INVOICE_SELECT).maybeSingle(), "Invoice update"), "The invoice changed before confirmation; no update was applied.");
  const event = await db(context).from("invoice_review_events").insert({ user_id: context.auth.user.id, company_id: context.auth.companyId, invoice_id: args.invoiceId, event_type: "HUMAN_EDIT", previous_value: currentData, new_value: nextData });
  if (event.error) throw new AssistantToolError("DOMAIN_WRITE_REJECTED", "The invoice was updated, but its review history could not be recorded safely.");
  return { operation: "invoice_draft_updated", invoice: invoiceView(updated) };
}

export async function executePreparedAction(context: AssistantToolContext, toolName: string, args: Record<string, unknown>, actionId?: string, preview: Record<string, unknown> = {}) {
  switch (toolName) {
    case "prepare_process_attached_invoice": return executeProcessAttachedInvoice(context, args, actionId);
    case "prepare_attendance_batch": return executeAttendanceBatch(context, args);
    case "prepare_create_worker": return executeWorkerCreate(context, args, actionId, preview);
    case "prepare_leave_request": return executeLeaveCreate(context, args, actionId);
    case "approve_leave":
    case "reject_leave":
    case "cancel_leave": return executeLeaveTransition(context, toolName, args);
    case "prepare_overtime_request": return executeOvertimeCreate(context, args, actionId);
    case "approve_overtime":
    case "reject_overtime":
    case "cancel_overtime": return executeOvertimeTransition(context, toolName, args);
    case "prepare_payroll_recalculation": return executePayrollRecalculation(context, args, preview);
    case "create_payroll_run": return executePayrollRunCreation(context, args, actionId);
    case "create_expense_draft": return executeExpenseDraft(context, args, actionId);
    case "create_project_draft": return executeProjectDraft(context, args, actionId);
    case "assign_invoice_to_project": return executeInvoiceProjectAssignment(context, args, actionId);
    case "update_invoice_draft": return executeInvoiceDraftUpdate(context, args);
    case "approve_payroll":
    case "mark_payroll_paid": return executePayrollFinalization(context, toolName, args, preview);
    default: throw new AssistantToolError("NOT_MUTATION", "That operation is not a confirmable mutation.");
  }
}

export async function executeRegisteredTool(name: string, args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  switch (name) {
    case "search_invoices": return searchInvoices(context, args);
    case "get_invoice": return getInvoiceTool(context, args);
    case "list_review_queue": return listReviewQueue(context, args);
    case "search_projects": return searchProjects(context, args);
    case "get_project": return getProjectTool(context, args);
    case "get_project_cost_summary": return getProjectCostSummary(context, args);
    case "list_expenses": return listExpenses(context, args);
    case "get_expense_summary": return getExpenseSummary(context, args);
    case "search_vendors": return searchVendors(context, args);
    case "get_vendor_summary": return getVendorSummary(context, args);
    case "search_workers": return searchWorkers(context, args);
    case "get_worker": return getWorkerTool(context, args);
    case "get_attendance_day": return getAttendanceDay(context, args);
    case "get_attendance_period_summary": return getAttendancePeriodSummary(context, args);
    case "get_payroll_period": return getPayrollPeriodTool(context, args);
    case "get_payroll_run": return getPayrollRunTool(context, args);
    case "get_payroll_readiness": return getPayrollReadiness(context, args);
    case "get_payroll_exceptions": return getPayrollReadiness(context, args);
    case "get_payroll_summary": return getPayrollSummary(context, args);
    case "list_payroll_periods": return listPayrollPeriods(context, args);
    case "get_current_workspace_summary": return getCurrentWorkspaceSummary(context);
    case "get_cash_summary": return getCashSummary(context, args);
    case "list_financial_accounts": return listFinancialAccounts(context, args);
    case "get_financial_account": return getFinancialAccountTool(context, args);
    case "list_financial_transactions": return listFinancialTransactions(context, args);
    case "get_cash_reconciliation_summary": return getCashReconciliationSummary(context, args);
    case "navigate_to": return navigateTo(context, args);
    case "navigate_to_project": return navigateToEntity(context, "project", String(args.projectId), typeof args.view === "string" ? args.view : undefined);
    case "navigate_to_invoice": return navigateToEntity(context, "invoice", String(args.invoiceId));
    case "navigate_to_review_invoice": return navigateToEntity(context, "review-invoice", String(args.invoiceId));
    case "navigate_to_payroll_period": return navigateToEntity(context, "payroll-period", String(args.periodId));
    case "navigate_to_attendance_date": return toolOk({ destination: "attendance", date: String(args.date) }, { clientActions: [{ type: "OPEN_ATTENDANCE_DATE", date: String(args.date), label: "Open attendance" }] });
    case "search_help": return searchHelp(context, args);
    case "get_feature_help": return getFeatureHelp(context, args);
    case "start_tour": return startTour(context, args);
    case "prepare_process_attached_invoice": return prepareProcessAttachedInvoice(context, args);
    case "prepare_create_worker": return prepareWorkerCreation(context, args);
    case "prepare_attendance_batch": return prepareAttendanceBatch(context, args);
    case "prepare_attendance_roster": return prepareAttendanceRoster(context, args);
    case "record_presence":
    case "record_absence": return prepareSingleAttendance(context, name, args);
    case "prepare_leave_request": return prepareLeaveRequest(context, args);
    case "approve_leave":
    case "reject_leave":
    case "cancel_leave": return prepareLeaveTransition(context, name, args);
    case "prepare_overtime_request": return prepareOvertimeRequest(context, args);
    case "approve_overtime":
    case "reject_overtime":
    case "cancel_overtime": return prepareOvertimeTransition(context, name, args);
    case "prepare_payroll_recalculation": return preparePayrollRecalculation(context, args);
    case "create_payroll_run": return preparePayrollRunCreation(context, args);
    case "create_expense_draft": return prepareExpenseDraft(context, args);
    case "create_project_draft": return prepareProjectDraft(context, args);
    case "assign_invoice_to_project": return prepareInvoiceProjectAssignment(context, args);
    case "update_invoice_draft": return prepareInvoiceDraftUpdate(context, args);
    case "approve_payroll":
    case "mark_payroll_paid": return preparePayrollFinalization(context, name, args);
    default: throw new AssistantToolError("UNKNOWN_TOOL", `That operation is not available in ${BRAND.productName}.`);
  }
}
