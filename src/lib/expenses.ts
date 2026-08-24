import type { Expense, ExpenseStatus } from "../types";
import { supabase } from "./supabase";
import { companyScopedRow, requireActiveCompanyId } from "./companyContext";

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
  const companyId = requireActiveCompanyId(); const { data, error } = await supabase.from("expenses").select("*").eq("company_id", companyId).is("archived_at", null).order("expense_date", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => fromRow(row as Record<string, unknown>));
}

export async function saveExpenseToSupabase(expense: Expense): Promise<Expense> {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before saving expenses.");
  const companyId = requireActiveCompanyId(); const { data, error } = await supabase.from("expenses").upsert(toRow(expense, userId, companyId)).select("*").single();
  if (error) throw error;
  return fromRow(data as Record<string, unknown>);
}

export async function archiveExpenseInSupabase(expenseId: string): Promise<Expense> {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before archiving expenses.");
  const companyId = requireActiveCompanyId(); const { data, error } = await supabase.from("expenses").update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", expenseId).eq("company_id", companyId).select("*").single();
  if (error) throw error;
  return fromRow(data as Record<string, unknown>);
}
