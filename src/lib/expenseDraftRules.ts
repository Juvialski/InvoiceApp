import type { Expense, Project, ProjectCostCode } from "../types.ts";
import { getSelectableCostCodes } from "./projectCostCodes.ts";

export const EXPENSE_PAYMENT_METHODS = [
  "Cash",
  "GCash",
  "Maya",
  "Credit Card",
  "Debit Card",
  "Bank Transfer",
  "Check",
  "Petty Cash / Reimbursement",
] as const;

export interface ExpenseDraftValues {
  expenseDate?: string;
  projectId?: string;
  projectCostCodeId?: string;
  category?: string;
  description?: string;
  payee?: string;
  amount?: number | string | null;
  currency?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  notes?: string;
}

export interface ExpenseDraftReferenceIssue {
  fieldId: "projectId" | "projectCostCodeId";
  message: string;
}

function textValue(value: unknown): string {
  return String(value ?? "");
}

function optionalText(value: unknown): string | undefined {
  const normalized = textValue(value).trim();
  return normalized || undefined;
}

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

/** The direct-edit rule shared by the Expense page, XLSX review, and Operations Workbook. */
export function isEditableDirectExpenseDraft(expense?: Expense | null): boolean {
  return Boolean(expense
    && expense.status === "DRAFT"
    && !expense.archivedAt
    && !expense.supplierInvoiceId);
}

/** New drafts are editable; existing rows must pass the shared direct-draft rule. */
export function isEditableExpenseDraft(expense?: Expense | null): boolean {
  return !expense || isEditableDirectExpenseDraft(expense);
}

export function validateExpenseDraftField(fieldId: string, value: unknown): string | undefined {
  switch (fieldId) {
    case "expenseDate": {
      const date = textValue(value).trim();
      if (!date) return "Expense Date is required.";
      return validDateOnly(date) ? undefined : "Enter a real Expense Date in YYYY-MM-DD format.";
    }
    case "description":
      return textValue(value).trim() ? undefined : "Description is required.";
    case "amount": {
      if (value === null || value === undefined || value === "") return "Amount is required.";
      const amount = Number(value);
      return Number.isFinite(amount) && amount >= 0 ? undefined : "Amount must be zero or greater.";
    }
    case "currency":
      return /^[A-Z]{3}$/.test(textValue(value).trim().toUpperCase())
        ? undefined
        : "Currency must be a three-letter code such as PHP.";
    default:
      return undefined;
  }
}

/**
 * Check the same active-project/current-selection rules used by the Expense
 * draft worksheet. Existing archived selections remain valid only in place.
 */
export function validateExpenseDraftReferences(
  values: Pick<ExpenseDraftValues, "projectId" | "projectCostCodeId">,
  projects: readonly Project[],
  costCodes: readonly ProjectCostCode[],
  existingExpense?: Expense,
): ExpenseDraftReferenceIssue | undefined {
  const projectId = optionalText(values.projectId);
  const costCodeId = optionalText(values.projectCostCodeId);

  if (costCodeId && !projectId) {
    return { fieldId: "projectCostCodeId", message: "Choose a project before assigning a cost code." };
  }
  if (!projectId) return undefined;

  const selectedProject = projects.find((project) => project.id === projectId);
  if (!selectedProject || (selectedProject.status === "ARCHIVED" && (!existingExpense || selectedProject.id !== existingExpense.projectId))) {
    return { fieldId: "projectId", message: "Choose an active project before saving the expense." };
  }
  if (costCodeId && !getSelectableCostCodes(costCodes, projectId, existingExpense?.projectCostCodeId).some((costCode) => costCode.id === costCodeId)) {
    return { fieldId: "projectCostCodeId", message: "Choose a cost code belonging to the selected project." };
  }
  return undefined;
}

export function normalizeExpenseDraft(row: ExpenseDraftValues, authoritative: Expense): Expense {
  const description = textValue(row.description).trim();
  const currency = textValue(row.currency).trim().toUpperCase();
  const amount = Number(row.amount);
  const expenseDate = textValue(row.expenseDate).trim();
  const requiredIssues = [
    validateExpenseDraftField("description", description),
    validateExpenseDraftField("expenseDate", expenseDate),
    validateExpenseDraftField("amount", row.amount),
    validateExpenseDraftField("currency", currency),
  ].filter((issue): issue is string => Boolean(issue));
  if (requiredIssues.length) throw new Error(requiredIssues[0]);

  const projectId = optionalText(row.projectId);
  return {
    ...authoritative,
    expenseDate,
    projectId,
    projectCostCodeId: projectId ? optionalText(row.projectCostCodeId) : undefined,
    category: textValue(row.category).trim() || "Miscellaneous",
    description,
    payee: optionalText(row.payee),
    amount,
    currency,
    paymentMethod: optionalText(row.paymentMethod),
    referenceNumber: optionalText(row.referenceNumber),
    notes: optionalText(row.notes),
  };
}
