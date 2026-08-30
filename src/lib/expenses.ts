import type { Expense, ExpenseStatus } from "../types";
import { supabase } from "./supabase";
import { companyScopedRow, requireActiveCompanyId } from "./companyContext";
import { parseFinancialCorrectionPreview, parseFinancialCorrectionResult, type FinancialCorrectionAction, type FinancialCorrectionPreview, type FinancialCorrectionResult } from "./financialLifecycle.ts";

const EXPENSES_STORAGE_KEY = "engineering_expenses";

function id() {
  return globalThis.crypto?.randomUUID?.() || `local-expense-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function text(value: unknown) {
  return value === null || value === undefined ? undefined : String(value);
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fromRow(row: Record<string, unknown>): Expense {
  return {
    id: String(row.id),
    userId: text(row.user_id),
    projectId: text(row.project_id),
    expenseDate: String(row.expense_date || new Date().toISOString().slice(0, 10)),
    category: String(row.category || "Miscellaneous"),
    description: String(row.description || ""),
    payee: text(row.payee),
    amount: numberValue(row.amount),
    currency: String(row.currency || "PHP").toUpperCase(),
    paymentMethod: text(row.payment_method),
    referenceNumber: text(row.reference_number),
    status: String(row.status || "DRAFT") as ExpenseStatus,
    receiptSourceDocumentId: text(row.receipt_source_document_id),
    notes: text(row.notes),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    archivedAt: text(row.archived_at),
    voidedAt: text(row.voided_at),
    voidedByUserId: text(row.voided_by_user_id),
    voidReason: text(row.void_reason),
  };
}

function toRow(expense: Expense, userId?: string, companyId?: string) {
  return companyScopedRow({
    id: expense.id,
    ...(userId ? { user_id: userId } : {}),
    ...(companyId ? { company_id: companyId } : {}),
    project_id: expense.projectId || null,
    expense_date: expense.expenseDate,
    category: expense.category.trim() || "Miscellaneous",
    description: expense.description.trim(),
    payee: expense.payee || null,
    amount: expense.amount || 0,
    currency: (expense.currency || "PHP").toUpperCase(),
    payment_method: expense.paymentMethod || null,
    reference_number: expense.referenceNumber || null,
    status: expense.status,
    receipt_source_document_id: expense.receiptSourceDocumentId || null,
    notes: expense.notes || null,
    archived_at: expense.archivedAt || null,
    updated_at: new Date().toISOString(),
  });
}

async function currentUserId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

export const EXPENSE_CATEGORIES = [
  "Materials", "Equipment", "Equipment Rental", "Fuel", "Transportation", "Subcontractor",
  "Permits", "Meals", "Utilities", "Communication", "Office / Site Supplies", "Professional Fees", "Miscellaneous",
];

export function readExpensesFromLocal(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): Expense[] {
  if (!storage) return [];
  try { return JSON.parse(storage.getItem(EXPENSES_STORAGE_KEY) || "[]") as Expense[]; } catch { return []; }
}

export function writeExpensesToLocal(expenses: Expense[], storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  try { storage?.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(expenses)); } catch { /* local demo storage can be full */ }
}

export function createLocalExpense(input: Omit<Expense, "id" | "createdAt" | "updatedAt">): Expense {
  const now = new Date().toISOString();
  return { ...input, id: id(), createdAt: now, updatedAt: now };
}

export async function loadExpensesFromSupabase(): Promise<Expense[]> {
  const userId = await currentUserId();
  if (!supabase || !userId) return [];
  const companyId = requireActiveCompanyId(); const { data, error } = await supabase.from("expenses").select("*").eq("company_id", companyId).order("expense_date", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => fromRow(row as Record<string, unknown>));
}

export async function saveExpenseToSupabase(expense: Expense): Promise<Expense> {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before saving expenses.");
  const companyId = requireActiveCompanyId();
  const { data: existing, error: existingError } = await supabase.from("expenses").select("id,updated_at").eq("id", expense.id).eq("company_id", companyId).maybeSingle();
  if (existingError) throw existingError;
  const row = toRow(expense, userId, companyId);
  let data: Record<string, unknown> | null = null;
  if (existing) {
    if (!expense.updatedAt || String(existing.updated_at || "") !== expense.updatedAt) throw new Error("This expense changed in another session. Refresh it before saving.");
    const result = await supabase.from("expenses").update(row).eq("id", expense.id).eq("company_id", companyId).eq("updated_at", expense.updatedAt).select("*").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("This expense changed in another session. Refresh it before saving.");
    data = result.data as Record<string, unknown>;
  } else {
    const result = await supabase.from("expenses").insert(row).select("*").single();
    if (result.error) throw result.error;
    data = result.data as Record<string, unknown>;
  }
  return fromRow(data);
}

export async function previewExpenseCorrectionInSupabase(expenseId: string): Promise<FinancialCorrectionPreview> {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before previewing expense correction actions.");
  requireActiveCompanyId();
  const { data, error } = await supabase.rpc("preview_expense_correction", { p_expense_id: expenseId });
  if (error) throw error;
  return parseFinancialCorrectionPreview(data, "EXPENSE");
}

export async function applyExpenseCorrectionInSupabase(
  expenseId: string,
  action: FinancialCorrectionAction,
  reason?: string,
): Promise<FinancialCorrectionResult> {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before changing expense lifecycle state.");
  requireActiveCompanyId();
  const { data, error } = await supabase.rpc("apply_expense_correction", {
    p_expense_id: expenseId,
    p_action: action,
    p_reason: reason || null,
  });
  if (error) throw error;
  const parsed = parseFinancialCorrectionResult(data, "EXPENSE");
  return {
    ...parsed,
    ...(parsed.rawRecord ? { record: fromRow(parsed.rawRecord) } : {}),
  };
}

/** Compatibility wrapper for callers that still request an explicit archive. */
export async function archiveExpenseInSupabase(expenseId: string): Promise<Expense> {
  const result = await applyExpenseCorrectionInSupabase(expenseId, "ARCHIVE", "Confirmed expense archive");
  if (!result.record || !("expenseDate" in result.record)) throw new Error("Expense archive did not return the preserved expense record.");
  return result.record as Expense;
}
