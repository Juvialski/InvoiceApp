import { randomUUID } from "node:crypto";
import type { AssistantRiskTier } from "../../assistant/assistantTypes.ts";
import { BRAND } from "../../config/brand.ts";
import { AssistantBackendError, AssistantToolError, type AssistantToolContext, type ToolExecutionResult } from "./assistantBackendTypes.ts";
import { boundedLimit, boundedText, enumValue, optionalNumber, plainObject, requireUuid } from "./toolValidation.ts";

type PermissionResolver = string[] | ((args: Record<string, unknown>) => string[]);
type SettlementTargetType = "INVOICE" | "PAYROLL" | "EXPENSE";
type SupplierPaymentMode = "PAID" | "PARTIALLY_PAID";

export interface FinancialSettlementToolDefinition {
  name: string;
  description: string;
  riskTier: AssistantRiskTier;
  permissions: PermissionResolver;
  parametersJsonSchema: Record<string, unknown>;
  requiresConfirmation: boolean;
}

const uuid = { type: "string", description: `Identifier supplied by a prior tool result or current ${BRAND.productName} context.` };
const limit = { type: "integer", minimum: 1, maximum: 50 };
const amountSchema = { type: "number", minimum: 0.01, maximum: 1_000_000_000 };
const targetTypeSchema = { type: "string", enum: ["INVOICE", "PAYROLL"] };
const supplierPaymentModeSchema = { type: "string", enum: ["PAID", "PARTIALLY_PAID"] };

function schema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties, required, additionalProperties: false };
}
function read(name: string, description: string, permissions: PermissionResolver, properties: Record<string, unknown> = {}, required: string[] = []): FinancialSettlementToolDefinition {
  return { name, description, permissions, riskTier: "READ", parametersJsonSchema: schema(properties, required), requiresConfirmation: false };
}
function navigation(name: string, description: string, permissions: PermissionResolver, properties: Record<string, unknown>, required: string[]): FinancialSettlementToolDefinition {
  return { name, description, permissions, riskTier: "NAVIGATION", parametersJsonSchema: schema(properties, required), requiresConfirmation: false };
}
function prepare(name: string, description: string, permissions: PermissionResolver, properties: Record<string, unknown>, required: string[]): FinancialSettlementToolDefinition {
  return { name, description, permissions, riskTier: "PREPARE", parametersJsonSchema: schema(properties, required), requiresConfirmation: true };
}

const allocationSchema = {
  type: "object",
  properties: {
    targetType: targetTypeSchema,
    targetId: uuid,
    amount: amountSchema,
    notes: { type: "string" },
  },
  required: ["targetType", "targetId", "amount"],
  additionalProperties: false,
};

function splitPermissions(args: Record<string, unknown>) {
  const allocations = Array.isArray(args.allocations) ? args.allocations : [];
  const targetTypes = new Set(allocations.flatMap((item) => item && typeof item === "object" && !Array.isArray(item) ? [String((item as Record<string, unknown>).targetType || "")] : []));
  return [
    "cash.reconcile",
    ...(targetTypes.has("INVOICE") ? ["invoices.manage"] : []),
    ...(targetTypes.has("PAYROLL") ? ["payroll.approve"] : []),
  ];
}

export const FINANCIAL_SETTLEMENT_TOOL_DEFINITIONS: readonly FinancialSettlementToolDefinition[] = Object.freeze([
  read("get_invoice_settlement", "Return the authoritative supplier-invoice payment summary. When a verified invoice has an active linked Expense, settlement truth is read from that Expense instead of stale invoice payment status.", ["invoices.read", "cash.transactions.read"], { invoiceId: uuid }, ["invoiceId"]),
  read("get_supplier_invoice_payment_options", "Return the linked Expense payment authority, remaining balance, and eligible Cash/Bank accounts for a verified supplier invoice before preparing Paid or Partially Paid.", ["invoices.read", "expenses.read", "cash.summary.read"], { invoiceId: uuid }, ["invoiceId"]),
  read("get_payroll_settlement", "Return employee-net-pay disbursement status and linked cash evidence for one payroll run without changing payroll cost or attendance.", ["payroll.summary.read", "cash.transactions.read"], { runId: uuid }, ["runId"]),
  read("list_open_invoice_settlements", "List verified supplier invoices with an operational settlement balance still outstanding. Linked supplier invoices use their authoritative Expense settlement rather than invoice status alone.", ["invoices.read", "cash.transactions.read"], { query: { type: "string" }, limit }),
  read("get_financial_transaction_settlements", "Show confirmed or reversed settlement links for one cash transaction, including who/when provenance available to the current company.", ["cash.transactions.read", "cash.reconcile"], { transactionId: uuid }, ["transactionId"]),
  navigation("navigate_to_financial_transaction", "Open a specific Cash & Banking transaction in the reconciliation workspace.", ["cash.summary.read", "cash.transactions.read"], { transactionId: uuid }, ["transactionId"]),
  navigation("navigate_to_payroll_run", "Open a specific payroll run with its payroll-detail workspace.", ["payroll.detail.read"], { runId: uuid }, ["runId"]),
  prepare("prepare_supplier_invoice_payment", "Prepare a Paid or Partially Paid supplier-invoice payment using its authoritative linked Expense, a canonical Cash/Bank debit, and an EXPENSE settlement. A linked DRAFT Expense is approved only after human confirmation.", ["invoices.read", "expenses.manage", "cash.summary.read", "cash.transactions.manage", "cash.reconcile"], { invoiceId: uuid, accountId: uuid, paymentMode: supplierPaymentModeSchema, amount: amountSchema, paymentDate: { type: "string" }, referenceNumber: { type: "string" }, notes: { type: "string" } }, ["invoiceId", "accountId", "paymentMode", "paymentDate"]),
  prepare("prepare_match_transaction_to_invoice", "Prepare a supplier-invoice cash settlement for an invoice without a linked authoritative Expense. Human confirmation is required and project cost is not changed.", ["cash.reconcile", "invoices.manage"], { transactionId: uuid, invoiceId: uuid, amount: amountSchema, notes: { type: "string" } }, ["transactionId", "invoiceId", "amount"]),
  prepare("prepare_match_transaction_to_payroll", "Prepare a payroll-run employee-net-pay disbursement link. Human confirmation is required and payroll sources/costs are not changed.", ["cash.reconcile", "payroll.approve"], { transactionId: uuid, runId: uuid, amount: amountSchema, notes: { type: "string" } }, ["transactionId", "runId", "amount"]),
  prepare("prepare_split_transaction_allocation", "Prepare one posted debit split across multiple invoice/payroll obligations. The confirmed batch executes atomically.", splitPermissions, { transactionId: uuid, allocations: { type: "array", minItems: 2, maxItems: 20, items: allocationSchema } }, ["transactionId", "allocations"]),
  prepare("prepare_reverse_financial_settlement", "Prepare reversal of a confirmed financial settlement while preserving the original history. Human confirmation and a reason are required.", ["cash.reconcile"], { matchId: uuid, reason: { type: "string" } }, ["matchId", "reason"]),
]);

const TOOL_NAMES = new Set(FINANCIAL_SETTLEMENT_TOOL_DEFINITIONS.map((item) => item.name));
const TARGET_TYPES = ["INVOICE", "PAYROLL"] as const;
const PAYMENT_MODES = ["PAID", "PARTIALLY_PAID"] as const;

export function isFinancialSettlementTool(name: string): boolean { return TOOL_NAMES.has(name); }

function requiredMoney(value: unknown, label: string) {
  const amount = optionalNumber(value, label, { min: 0.01, max: 1_000_000_000 });
  if (amount === undefined) throw new AssistantToolError("INVALID_NUMBER", `${label} is required.`);
  return Math.round(amount * 100) / 100;
}

function preparedMatchId(value: unknown, label: string) {
  return value ? requireUuid(value, label) : randomUUID();
}

function paymentDate(value: unknown) {
  const date = boundedText(value, "paymentDate", 10)!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AssistantToolError("INVALID_DATE", "paymentDate must use YYYY-MM-DD.");
  return date;
}

export function validateFinancialSettlementToolArguments(toolName: string, input: unknown): Record<string, unknown> {
  const args = plainObject(input);
  switch (toolName) {
    case "get_invoice_settlement":
    case "get_supplier_invoice_payment_options": return { invoiceId: requireUuid(args.invoiceId, "invoiceId") };
    case "get_payroll_settlement":
    case "navigate_to_payroll_run": return { runId: requireUuid(args.runId, "runId") };
    case "list_open_invoice_settlements": return { query: boundedText(args.query, "query", 200, false), limit: boundedLimit(args.limit, 20) };
    case "get_financial_transaction_settlements":
    case "navigate_to_financial_transaction": return { transactionId: requireUuid(args.transactionId, "transactionId") };
    case "prepare_supplier_invoice_payment": return {
      invoiceId: requireUuid(args.invoiceId, "invoiceId"),
      expenseId: args.expenseId ? requireUuid(args.expenseId, "expenseId") : undefined,
      accountId: requireUuid(args.accountId, "accountId"),
      paymentMode: enumValue(args.paymentMode, "paymentMode", PAYMENT_MODES)!,
      amount: optionalNumber(args.amount, "amount", { min: 0.01, max: 1_000_000_000 }),
      paymentDate: paymentDate(args.paymentDate),
      referenceNumber: boundedText(args.referenceNumber, "referenceNumber", 200, false),
      notes: boundedText(args.notes, "notes", 500, false),
      transactionId: preparedMatchId(args.transactionId, "transactionId"),
      matchId: preparedMatchId(args.matchId, "matchId"),
    };
    case "prepare_match_transaction_to_invoice": return { transactionId: requireUuid(args.transactionId, "transactionId"), invoiceId: requireUuid(args.invoiceId, "invoiceId"), amount: requiredMoney(args.amount, "amount"), notes: boundedText(args.notes, "notes", 500, false), matchId: preparedMatchId(args.matchId, "matchId") };
    case "prepare_match_transaction_to_payroll": return { transactionId: requireUuid(args.transactionId, "transactionId"), runId: requireUuid(args.runId, "runId"), amount: requiredMoney(args.amount, "amount"), notes: boundedText(args.notes, "notes", 500, false), matchId: preparedMatchId(args.matchId, "matchId") };
    case "prepare_split_transaction_allocation": {
      if (!Array.isArray(args.allocations) || args.allocations.length < 2 || args.allocations.length > 20) throw new AssistantToolError("INVALID_BATCH", "allocations must contain 2 to 20 settlement rows.");
      const allocations = args.allocations.map((value, index) => {
        const row = plainObject(value, `allocations[${index}]`);
        return {
          targetType: enumValue(row.targetType, `allocations[${index}].targetType`, TARGET_TYPES)!,
          targetId: requireUuid(row.targetId, `allocations[${index}].targetId`),
          amount: requiredMoney(row.amount, `allocations[${index}].amount`),
          notes: boundedText(row.notes, `allocations[${index}].notes`, 500, false),
          matchId: preparedMatchId(row.matchId, `allocations[${index}].matchId`),
        };
      });
      const seen = new Set<string>();
      for (const row of allocations) {
        const key = `${row.targetType}:${row.targetId}`;
        if (seen.has(key)) throw new AssistantToolError("INVALID_BATCH", "Each target may appear only once in a prepared split allocation.");
        seen.add(key);
      }
      return { transactionId: requireUuid(args.transactionId, "transactionId"), allocations };
    }
    case "prepare_reverse_financial_settlement": return { matchId: requireUuid(args.matchId, "matchId"), reason: boundedText(args.reason, "reason", 1000)! };
    default: throw new AssistantToolError("UNKNOWN_TOOL", "That financial settlement operation is not available.");
  }
}

async function one(context: AssistantToolContext, table: string, columns: string, id: string) {
  const result = await (context.auth.supabase as any).from(table).select(columns).eq("company_id", context.auth.companyId).eq("id", id).maybeSingle();
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "Financial settlement data could not be read safely.", 503);
  if (!result.data) throw new AssistantBackendError("NOT_FOUND", "The requested record is not available in this company.", 404);
  return result.data as Record<string, unknown>;
}

async function settlementSummary(context: AssistantToolContext, targetType: SettlementTargetType, targetId: string) {
  const result = await (context.auth.supabase as any).rpc("get_financial_settlement_summary", { p_company_id: context.auth.companyId, p_target_type: targetType, p_target_id: targetId });
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", result.error.message || "Settlement summary could not be read safely.", 503);
  return (result.data || {}) as Record<string, unknown>;
}

async function activeLinkedExpense(context: AssistantToolContext, invoiceId: string) {
  const result = await (context.auth.supabase as any).from("expenses")
    .select("id,supplier_invoice_id,status,amount,currency,description,payee,updated_at,archived_at,voided_at")
    .eq("company_id", context.auth.companyId)
    .eq("supplier_invoice_id", invoiceId)
    .neq("status", "VOID")
    .is("archived_at", null)
    .limit(2);
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "The linked supplier Expense could not be read safely.", 503);
  const rows = (result.data || []) as Record<string, unknown>[];
  if (rows.length > 1) throw new AssistantBackendError("FINANCIAL_AUTHORITY_CONFLICT", "More than one active Expense is linked to this supplier invoice. Payment is blocked until the financial authority conflict is resolved.", 409);
  return rows[0] || null;
}

async function paymentAccounts(context: AssistantToolContext, currency: string) {
  const result = await (context.auth.supabase as any).from("financial_accounts")
    .select("id,account_type,institution_name,display_name,masked_identifier,currency,active")
    .eq("company_id", context.auth.companyId)
    .eq("active", true)
    .in("account_type", ["CASH", "BANK"])
    .eq("currency", String(currency || "PHP").toUpperCase())
    .order("account_type", { ascending: true })
    .order("display_name", { ascending: true });
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "Cash/Bank payment accounts could not be read safely.", 503);
  return (result.data || []) as Record<string, unknown>[];
}

async function supplierInvoiceAuthority(context: AssistantToolContext, invoiceId: string) {
  const expense = await activeLinkedExpense(context, invoiceId);
  if (expense) {
    const summary = await settlementSummary(context, "EXPENSE", String(expense.id));
    return { targetType: "EXPENSE" as const, targetId: String(expense.id), expense, summary };
  }
  const summary = await settlementSummary(context, "INVOICE", invoiceId);
  return { targetType: "INVOICE" as const, targetId: invoiceId, expense: null, summary };
}

async function transaction(context: AssistantToolContext, transactionId: string) {
  return one(context, "financial_transactions", "id,account_id,transaction_date,posted_at,reference_number,description,direction,amount,currency,status,reconciliation_status", transactionId);
}

function num(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

async function transactionAllocated(context: AssistantToolContext, transactionId: string) {
  const result = await (context.auth.supabase as any).from("financial_transaction_matches").select("matched_amount,status").eq("company_id", context.auth.companyId).eq("transaction_id", transactionId).eq("status", "CONFIRMED");
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "Transaction allocations could not be read safely.", 503);
  return (result.data || []).reduce((sum: number, row: Record<string, unknown>) => sum + num(row.matched_amount), 0);
}

async function validatePreparedAllocation(context: AssistantToolContext, transactionId: string, targetType: SettlementTargetType, targetId: string, amount: number) {
  const tx = await transaction(context, transactionId);
  if (tx.status !== "POSTED" || tx.direction !== "DEBIT") throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "Only a POSTED debit can settle a supplier invoice, Expense, or payroll run.", 409);
  if (tx.reconciliation_status === "IGNORED") throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "Return the ignored transaction to review before confirming financial evidence.", 409);
  const summary = await settlementSummary(context, targetType, targetId);
  if (String(summary.currency || "").toUpperCase() !== String(tx.currency || "").toUpperCase()) throw new AssistantBackendError("SETTLEMENT_CURRENCY_MISMATCH", "Transaction and target currency differ. FX settlement is not supported.", 409);
  if (targetType === "INVOICE" && String(summary.lifecycleStatus) !== "VERIFIED") throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "Only a VERIFIED supplier invoice can be settled.", 409);
  if (targetType === "EXPENSE" && !["APPROVED", "PAID"].includes(String(summary.lifecycleStatus))) throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "The linked Expense must be APPROVED before settlement confirmation.", 409);
  if (targetType === "PAYROLL" && !["APPROVED", "PAID"].includes(String(summary.lifecycleStatus))) throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "Only an APPROVED or legacy PAID payroll run can receive disbursement evidence.", 409);
  const allocated = await transactionAllocated(context, transactionId);
  const transactionRemaining = Math.max(0, num(tx.amount) - allocated);
  const targetRemaining = Math.max(0, num(summary.settlementBasis) - num(summary.reconciledCashPaid));
  if (amount > transactionRemaining + 0.005) throw new AssistantBackendError("SETTLEMENT_OVERAGE", "The requested allocation exceeds the transaction remaining amount.", 409);
  if (amount > targetRemaining + 0.005) throw new AssistantBackendError("SETTLEMENT_OVERAGE", "The requested allocation exceeds the target remaining settlement obligation.", 409);
  return { tx, summary, transactionRemaining, targetRemaining };
}

async function getInvoiceSettlement(args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  const invoice = await one(context, "invoices", "id,invoice_number,invoice_date,due_date,currency,grand_total,payment_status,review_status,lifecycle_status,vendor_id,current_data", String(args.invoiceId));
  const authority = await supplierInvoiceAuthority(context, String(args.invoiceId));
  return {
    output: {
      invoice: { id: invoice.id, invoiceNumber: invoice.invoice_number, invoiceDate: invoice.invoice_date, dueDate: invoice.due_date, currency: invoice.currency, grandTotal: invoice.grand_total, storedPaymentStatus: invoice.payment_status, reviewStatus: invoice.review_status },
      settlement: authority.summary,
      paymentAuthority: authority.expense ? { targetType: "EXPENSE", targetId: authority.targetId, linkedExpense: authority.expense } : { targetType: "INVOICE", targetId: authority.targetId },
      accountingBoundary: authority.expense ? "This supplier invoice is source evidence. Its linked Expense owns payable and payment settlement truth." : "Cash settlement changes paid/payable evidence only. Verified invoice project cost is unchanged.",
    },
    references: [{ type: "invoice", id: String(invoice.id), label: String(invoice.invoice_number || "Supplier invoice") }],
  };
}

async function getSupplierPaymentOptions(args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  const invoice = await one(context, "invoices", "id,invoice_number,due_date,currency,review_status,lifecycle_status", String(args.invoiceId));
  if (String(invoice.review_status) !== "VERIFIED" || String(invoice.lifecycle_status || "ACTIVE") === "VOID") throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "Only an active VERIFIED supplier invoice can record payment.", 409);
  const expense = await activeLinkedExpense(context, String(invoice.id));
  if (!expense) throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "This supplier invoice does not have an active linked Expense. Use the existing invoice settlement workflow instead.", 409);
  if (!["DRAFT", "APPROVED", "PAID"].includes(String(expense.status))) throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "The linked Expense is not eligible for supplier payment.", 409);
  const settlement = await settlementSummary(context, "EXPENSE", String(expense.id));
  const accounts = await paymentAccounts(context, String(expense.currency));
  return {
    output: {
      invoice: { id: invoice.id, invoiceNumber: invoice.invoice_number, dueDate: invoice.due_date, reviewStatus: invoice.review_status },
      paymentAuthority: { targetType: "EXPENSE", targetId: expense.id, linkedExpense: expense },
      settlement,
      paymentAccounts: accounts,
      accountRequired: true,
      inlineAccountCreationAvailableInInvoiceUi: accounts.length === 0,
      nextAction: accounts.length ? "Ask the user to select a Cash/Bank account and Paid or Partially Paid, then prepare_supplier_invoice_payment." : "No eligible Cash/Bank account exists. Do not fabricate one; direct the user to Add Cash/Bank Account in the invoice Change Status flow if permitted.",
    },
    references: [{ type: "invoice", id: String(invoice.id), label: String(invoice.invoice_number || "Supplier invoice") }],
  };
}

async function getPayrollSettlement(args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  const run = await one(context, "payroll_runs", "id,period_id,status,approved_at,paid_at", String(args.runId));
  const period = await one(context, "payroll_periods", "id,period_start,period_end,pay_date,status", String(run.period_id));
  const summary = await settlementSummary(context, "PAYROLL", String(args.runId));
  return { output: { payrollRun: run, period, settlement: summary, accountingBoundary: "Disbursement uses employee net pay and does not recalculate payroll, attendance, overtime, or project labor cost." }, references: [{ type: "payroll_run", id: String(run.id), label: `${period.period_start} – ${period.period_end}` }] };
}

async function listOpenInvoices(args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  const limitValue = Number(args.limit || 20);
  let query = (context.auth.supabase as any).from("invoices").select("id,invoice_number,invoice_date,due_date,currency,grand_total,review_status,lifecycle_status,vendor_id,current_data").eq("company_id", context.auth.companyId).eq("review_status", "VERIFIED").neq("lifecycle_status", "VOID").is("archived_at", null).order("due_date", { ascending: true }).limit(Math.min(50, Math.max(limitValue * 2, limitValue)));
  if (typeof args.query === "string" && args.query.trim()) query = query.ilike("invoice_number", `%${args.query.trim().replace(/[\\%_]/g, "\\$&")}%`);
  const result = await query;
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "Supplier invoices could not be read safely.", 503);
  const rows = (result.data || []) as Record<string, unknown>[];
  const authorities = await Promise.all(rows.map((row) => supplierInvoiceAuthority(context, String(row.id))));
  const open = rows.map((row, index) => ({ invoice: row, settlement: authorities[index].summary, paymentAuthority: { targetType: authorities[index].targetType, targetId: authorities[index].targetId } })).filter((row) => num(row.settlement.outstanding) > 0.005).slice(0, limitValue);
  return { output: { count: open.length, invoices: open, semantics: "Outstanding is derived from the authoritative settlement target. Linked supplier invoices use EXPENSE settlement; stale invoice payment_status does not override it." }, references: open.slice(0, 10).map((row) => ({ type: "invoice" as const, id: String(row.invoice.id), label: String(row.invoice.invoice_number || "Supplier invoice") })) };
}

async function getTransactionSettlements(args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  const tx = await transaction(context, String(args.transactionId));
  const result = await (context.auth.supabase as any).from("financial_transaction_matches").select("id,target_type,target_id,matched_amount,status,confidence,confirmed_by_user_id,confirmed_at,reversed_by_user_id,reversed_at,reversal_reason,confirmation_source,notes,created_at").eq("company_id", context.auth.companyId).eq("transaction_id", String(args.transactionId)).in("status", ["CONFIRMED", "REVERSED"]).order("created_at", { ascending: false }).limit(50);
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "Settlement links could not be read safely.", 503);
  return { output: { transaction: tx, settlements: result.data || [], explanation: "A confirmed link is authoritative cash-settlement evidence after human confirmation. Confidence/notes explain deterministic suggestion context when retained; the Assistant does not make the accounting decision." }, references: [{ type: "report", id: String(tx.id), label: `${tx.transaction_date} · ${tx.reference_number || tx.description}` }] };
}

async function resolveSupplierInvoicePayment(args: Record<string, unknown>, context: AssistantToolContext) {
  const invoice = await one(context, "invoices", "id,invoice_number,due_date,currency,review_status,lifecycle_status", String(args.invoiceId));
  if (String(invoice.review_status) !== "VERIFIED" || String(invoice.lifecycle_status || "ACTIVE") === "VOID") throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "Only an active VERIFIED supplier invoice can record payment.", 409);
  const expense = await activeLinkedExpense(context, String(invoice.id));
  if (!expense) throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "This supplier invoice does not have an active linked Expense. Do not reopen it for a normal payment; use the applicable invoice settlement workflow instead.", 409);
  if (args.expenseId && String(args.expenseId) !== String(expense.id)) throw new AssistantBackendError("FINANCIAL_AUTHORITY_CHANGED", "The supplier invoice's linked Expense changed before payment confirmation. Review the current payment authority before retrying.", 409);
  if (!["DRAFT", "APPROVED", "PAID"].includes(String(expense.status))) throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "The linked Expense is not eligible for payment.", 409);
  const summary = await settlementSummary(context, "EXPENSE", String(expense.id));
  const outstanding = Math.max(0, num(summary.outstanding));
  if (outstanding <= 0.005) throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "This supplier invoice has no remaining balance to pay.", 409);

  const mode = String(args.paymentMode) as SupplierPaymentMode;
  const requested = args.amount === undefined ? undefined : num(args.amount);
  let amount = requested || 0;
  if (mode === "PAID") {
    if (requested !== undefined && Math.abs(requested - outstanding) > 0.005) throw new AssistantBackendError("SETTLEMENT_OVERAGE", "Paid must settle the full current remaining balance. Refresh the payment options before confirming.", 409);
    amount = outstanding;
  } else {
    if (!requested || requested <= 0) throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "Enter the partial payment amount before preparing the action.", 409);
    if (requested >= outstanding - 0.005) throw new AssistantBackendError("SETTLEMENT_OVERAGE", "Choose Paid when settling the full remaining balance.", 409);
  }

  const account = await one(context, "financial_accounts", "id,account_type,institution_name,display_name,masked_identifier,currency,active", String(args.accountId));
  if (!account.active || !["CASH", "BANK"].includes(String(account.account_type))) throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "Select an active Cash or Bank Account for this payment.", 409);
  if (String(account.currency || "").toUpperCase() !== String(expense.currency || "").toUpperCase()) throw new AssistantBackendError("SETTLEMENT_CURRENCY_MISMATCH", "The payment account currency must match the linked Expense. FX settlement is not supported in this flow.", 409);
  return { invoice, expense, summary, account, amount };
}

async function prepareSupplierInvoicePayment(args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  const resolved = await resolveSupplierInvoicePayment(args, context);
  const normalizedArgs = { ...args, expenseId: resolved.expense.id, amount: resolved.amount };
  return context.prepareAction({
    toolName: "prepare_supplier_invoice_payment",
    riskTier: "PREPARE",
    normalizedArgs,
    contextGeneration: context.context.generation,
    preview: {
      contextGeneration: context.context.generation,
      operation: args.paymentMode === "PAID" ? "Record supplier invoice as Paid" : "Record supplier invoice as Partially Paid",
      invoice: { id: resolved.invoice.id, invoiceNumber: resolved.invoice.invoice_number },
      paymentAuthority: { targetType: "EXPENSE", targetId: resolved.expense.id, linkedExpenseStatus: resolved.expense.status },
      paymentAccount: resolved.account,
      settlementBefore: resolved.summary,
      amount: resolved.amount,
      paymentDate: args.paymentDate,
      referenceNumber: args.referenceNumber,
      willApproveLinkedExpense: resolved.expense.status === "DRAFT",
      confirmationMessage: resolved.expense.status === "DRAFT" ? "This payment will approve the linked Expense and record the payment." : "This will record the payment against the linked Expense.",
      financialEvidence: "A canonical Cash/Bank debit and confirmed EXPENSE settlement will be created.",
      projectCostImpact: 0,
      confirmationRequired: true,
    },
  });
}

async function prepareSingle(name: string, args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  const targetType = name === "prepare_match_transaction_to_invoice" ? "INVOICE" as const : "PAYROLL" as const;
  const targetId = String(targetType === "INVOICE" ? args.invoiceId : args.runId);
  if (targetType === "INVOICE" && await activeLinkedExpense(context, targetId)) throw new AssistantBackendError("SETTLEMENT_AUTHORITY_IS_EXPENSE", "This supplier invoice has an active linked Expense. Do not settle or reopen the invoice directly; use prepare_supplier_invoice_payment so the EXPENSE remains the payment authority.", 409);
  const validated = await validatePreparedAllocation(context, String(args.transactionId), targetType, targetId, Number(args.amount));
  const normalizedArgs = { transactionId: args.transactionId, targetType, targetId, amount: args.amount, notes: args.notes, matchId: args.matchId };
  return context.prepareAction({ toolName: name, riskTier: "PREPARE", normalizedArgs, contextGeneration: context.context.generation, preview: { contextGeneration: context.context.generation, operation: targetType === "INVOICE" ? "Link bank payment to supplier invoice" : "Link employee-net-pay disbursement to payroll run", transaction: validated.tx, settlementBefore: validated.summary, allocationAmount: args.amount, transactionRemainingBefore: validated.transactionRemaining, targetRemainingBefore: validated.targetRemaining, projectCostImpact: 0, confirmationRequired: true } });
}

async function prepareSplit(args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  const rows = args.allocations as Array<Record<string, unknown>>;
  const tx = await transaction(context, String(args.transactionId));
  if (tx.status !== "POSTED" || tx.direction !== "DEBIT") throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "Only a POSTED debit can be split across settlement targets.", 409);
  if (tx.reconciliation_status === "IGNORED") throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "Return the ignored transaction to review before confirming financial evidence.", 409);
  const allocated = await transactionAllocated(context, String(args.transactionId));
  const transactionRemaining = Math.max(0, num(tx.amount) - allocated);
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  if (total > transactionRemaining + 0.005) throw new AssistantBackendError("SETTLEMENT_OVERAGE", "The split exceeds the transaction remaining amount.", 409);
  const previewRows = [] as Record<string, unknown>[];
  for (const row of rows) {
    if (row.targetType === "INVOICE" && await activeLinkedExpense(context, String(row.targetId))) throw new AssistantBackendError("SETTLEMENT_AUTHORITY_IS_EXPENSE", "A linked supplier invoice cannot be included as an invoice target in a split. Its authoritative Expense must own the settlement.", 409);
    const validated = await validatePreparedAllocation(context, String(args.transactionId), row.targetType as "INVOICE" | "PAYROLL", String(row.targetId), Number(row.amount));
    previewRows.push({ targetType: row.targetType, targetId: row.targetId, amount: row.amount, targetRemainingBefore: validated.targetRemaining, settlementBefore: validated.summary });
  }
  return context.prepareAction({ toolName: "prepare_split_transaction_allocation", riskTier: "PREPARE", normalizedArgs: args, contextGeneration: context.context.generation, preview: { contextGeneration: context.context.generation, operation: "Split one bank debit across multiple settlement obligations", transaction: tx, transactionRemainingBefore: transactionRemaining, allocationTotal: Math.round(total * 100) / 100, allocations: previewRows, execution: "Atomic database batch", projectCostImpact: 0, confirmationRequired: true } });
}

async function prepareReverse(args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  const result = await (context.auth.supabase as any).from("financial_transaction_matches").select("id,transaction_id,target_type,target_id,matched_amount,status,confirmed_at,confirmation_source,notes").eq("company_id", context.auth.companyId).eq("id", String(args.matchId)).maybeSingle();
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "Settlement history could not be read safely.", 503);
  if (!result.data || result.data.status !== "CONFIRMED" || !["INVOICE", "PAYROLL", "EXPENSE"].includes(String(result.data.target_type))) throw new AssistantBackendError("SETTLEMENT_NOT_ELIGIBLE", "Only an active confirmed settlement can be reversed.", 409);
  return context.prepareAction({ toolName: "prepare_reverse_financial_settlement", riskTier: "PREPARE", normalizedArgs: args, contextGeneration: context.context.generation, preview: { contextGeneration: context.context.generation, operation: "Reverse financial settlement link", settlement: result.data, reason: args.reason, historyPolicy: "The original confirmation is retained and marked REVERSED; it is not deleted.", projectCostImpact: 0, confirmationRequired: true } });
}

export async function executeFinancialSettlementTool(name: string, args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  if (name === "get_invoice_settlement") return getInvoiceSettlement(args, context);
  if (name === "get_supplier_invoice_payment_options") return getSupplierPaymentOptions(args, context);
  if (name === "get_payroll_settlement") return getPayrollSettlement(args, context);
  if (name === "list_open_invoice_settlements") return listOpenInvoices(args, context);
  if (name === "get_financial_transaction_settlements") return getTransactionSettlements(args, context);
  if (name === "navigate_to_financial_transaction") {
    const tx = await transaction(context, String(args.transactionId));
    return { output: { transactionId: tx.id }, references: [{ type: "report", id: String(tx.id), label: `${tx.transaction_date} · ${tx.reference_number || tx.description}` }], clientActions: [{ type: "OPEN_FINANCIAL_TRANSACTION", entityId: String(tx.id), label: "Open transaction" }] };
  }
  if (name === "navigate_to_payroll_run") {
    const run = await one(context, "payroll_runs", "id,period_id,status", String(args.runId));
    return { output: { runId: run.id, periodId: run.period_id }, references: [{ type: "payroll_run", id: String(run.id), label: "Payroll run" }], clientActions: [{ type: "OPEN_PAYROLL_RUN", entityId: String(run.id), label: "Open payroll run" }] };
  }
  if (name === "prepare_supplier_invoice_payment") return prepareSupplierInvoicePayment(args, context);
  if (name === "prepare_match_transaction_to_invoice" || name === "prepare_match_transaction_to_payroll") return prepareSingle(name, args, context);
  if (name === "prepare_split_transaction_allocation") return prepareSplit(args, context);
  if (name === "prepare_reverse_financial_settlement") return prepareReverse(args, context);
  throw new AssistantBackendError("UNKNOWN_TOOL", "That financial settlement operation is not available.", 400);
}

async function rpc(context: AssistantToolContext, name: string, args: Record<string, unknown>) {
  const result = await (context.auth.supabase as any).rpc(name, { p_company_id: context.auth.companyId, ...args });
  if (result.error) throw new AssistantBackendError("DOMAIN_WRITE_REJECTED", result.error.message || "The financial settlement action was rejected.", 409);
  return result.data;
}

async function approveLinkedExpenseForPayment(context: AssistantToolContext, expense: Record<string, unknown>) {
  if (expense.status !== "DRAFT") return expense;
  const updatedAt = String(expense.updated_at || "");
  let query = (context.auth.supabase as any).from("expenses")
    .update({ status: "APPROVED", updated_at: new Date().toISOString() })
    .eq("company_id", context.auth.companyId)
    .eq("id", String(expense.id))
    .eq("status", "DRAFT");
  if (updatedAt) query = query.eq("updated_at", updatedAt);
  const result = await query.select("id,supplier_invoice_id,status,amount,currency,description,payee,updated_at,archived_at,voided_at").maybeSingle();
  if (result.error) throw new AssistantBackendError("DOMAIN_WRITE_REJECTED", result.error.message || "The linked Expense could not be approved.", 409);
  if (result.data) return result.data as Record<string, unknown>;
  const current = await activeLinkedExpense(context, String(expense.supplier_invoice_id));
  if (current && current.id === expense.id && ["APPROVED", "PAID"].includes(String(current.status))) return current;
  throw new AssistantBackendError("FINANCIAL_AUTHORITY_CHANGED", "The linked Expense changed before payment could be recorded. Review its current state before retrying.", 409);
}

export async function executePreparedFinancialSettlementAction(context: AssistantToolContext, toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (toolName === "prepare_supplier_invoice_payment") {
    const resolved = await resolveSupplierInvoicePayment(args, context);
    const approvedExpense = await approveLinkedExpenseForPayment(context, resolved.expense);
    const transactionId = String(args.transactionId);
    let transactionCreated = false;
    let settlementConfirmed = false;
    try {
      const transaction = await rpc(context, "create_financial_transaction", {
        p_transaction_id: transactionId,
        p_account_id: args.accountId,
        p_transaction_date: args.paymentDate,
        p_posted_at: new Date().toISOString(),
        p_reference_number: args.referenceNumber || null,
        p_description: `Supplier invoice ${resolved.invoice.invoice_number || resolved.invoice.id} payment`,
        p_direction: "DEBIT",
        p_amount: resolved.amount,
        p_currency: String(approvedExpense.currency || "PHP").toUpperCase(),
        p_source_fingerprint: `assistant-supplier-payment-${transactionId}`,
      });
      transactionCreated = true;
      await validatePreparedAllocation(context, transactionId, "EXPENSE", String(approvedExpense.id), resolved.amount);
      const match = await rpc(context, "confirm_financial_settlement", {
        p_transaction_id: transactionId,
        p_target_type: "EXPENSE",
        p_target_id: approvedExpense.id,
        p_matched_amount: resolved.amount,
        p_match_id: args.matchId,
        p_confidence: 100,
        p_notes: args.notes || null,
        p_confirmation_source: "ASSISTANT",
      });
      settlementConfirmed = true;
      let settlement: Record<string, unknown> | null = null;
      let settlementRefreshRequired = false;
      try {
        settlement = await settlementSummary(context, "EXPENSE", String(approvedExpense.id));
      } catch {
        settlementRefreshRequired = true;
      }
      return { operation: "supplier_invoice_payment_recorded", invoiceId: resolved.invoice.id, paymentAuthority: { targetType: "EXPENSE", targetId: approvedExpense.id }, transaction, match, settlement, settlementRefreshRequired, paymentMode: args.paymentMode, amount: resolved.amount, projectCostImpact: 0 };
    } catch (cause) {
      if (transactionCreated && !settlementConfirmed) {
        try {
          await rpc(context, "reverse_financial_transaction", { p_transaction_id: transactionId, p_reason: "Assistant supplier invoice payment flow did not complete." });
        } catch {
          throw new AssistantBackendError("PAYMENT_COMPENSATION_FAILED", "The payment could not be completed and its created Cash/Bank transaction could not be reversed automatically. Review Cash & Banking before retrying.", 409);
        }
      }
      throw cause;
    }
  }
  if (toolName === "prepare_match_transaction_to_invoice" || toolName === "prepare_match_transaction_to_payroll") {
    const targetType = String(args.targetType) as "INVOICE" | "PAYROLL";
    if (targetType === "INVOICE" && await activeLinkedExpense(context, String(args.targetId))) throw new AssistantBackendError("SETTLEMENT_AUTHORITY_IS_EXPENSE", "This supplier invoice now has an active linked Expense. The invoice cannot be settled directly.", 409);
    await validatePreparedAllocation(context, String(args.transactionId), targetType, String(args.targetId), Number(args.amount));
    const match = await rpc(context, "confirm_financial_settlement", { p_transaction_id: args.transactionId, p_target_type: targetType, p_target_id: args.targetId, p_matched_amount: args.amount, p_match_id: args.matchId, p_confidence: 100, p_notes: args.notes || null, p_confirmation_source: "ASSISTANT" });
    const settlement = await settlementSummary(context, targetType, String(args.targetId));
    return { operation: "financial_settlement_confirmed", match, settlement, targetType, targetId: args.targetId, transactionId: args.transactionId, projectCostImpact: 0 };
  }
  if (toolName === "prepare_split_transaction_allocation") {
    const rows = args.allocations as Array<Record<string, unknown>>;
    for (const row of rows) if (row.targetType === "INVOICE" && await activeLinkedExpense(context, String(row.targetId))) throw new AssistantBackendError("SETTLEMENT_AUTHORITY_IS_EXPENSE", "A supplier invoice in this split now has an active linked Expense. Review the allocation before confirming.", 409);
    const payload = rows.map((row) => ({ target_type: row.targetType, target_id: row.targetId, matched_amount: row.amount, match_id: row.matchId, confidence: 100, notes: row.notes || null }));
    const matches = await rpc(context, "confirm_financial_settlement_batch", { p_transaction_id: args.transactionId, p_allocations: payload, p_confirmation_source: "ASSISTANT" });
    return { operation: "financial_settlement_split_confirmed", matches, transactionId: args.transactionId, allocationCount: rows.length, projectCostImpact: 0 };
  }
  if (toolName === "prepare_reverse_financial_settlement") {
    const match = await rpc(context, "reverse_financial_settlement", { p_match_id: args.matchId, p_reason: args.reason });
    return { operation: "financial_settlement_reversed", match, matchId: args.matchId, projectCostImpact: 0 };
  }
  throw new AssistantToolError("UNKNOWN_TOOL", "That prepared financial settlement operation is no longer available.");
}