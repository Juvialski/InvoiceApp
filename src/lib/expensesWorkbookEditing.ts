import { hasAllPermissions, hasAnyPermission, PERMISSION_KEYS, type PermissionKey } from "../utils/accessControl.ts";
import type { Expense, Project, ProjectCostCode } from "../types.ts";
import { EXPENSE_PAYMENT_METHODS, isEditableDirectExpenseDraft, normalizeExpenseDraft, validateExpenseDraftField, validateExpenseDraftReferences } from "./expenseDraftRules.ts";
import { formatCostCodeOptionLabel, getSelectableCostCodes } from "./projectCostCodes.ts";
import type { ExpensesWorkbookRecords } from "./expensesWorkbook.ts";
import type { WorksheetSelectOption } from "../components/ui/worksheetEditorModel.ts";

export type ExpenseWorkbookWriteMode = "none" | "existing-domain" | "synthetic-demo";
export type ExpenseWorkbookEditableField =
  | "expenseDate"
  | "projectId"
  | "projectCostCodeId"
  | "category"
  | "description"
  | "payee"
  | "amount"
  | "currency"
  | "paymentMethod"
  | "referenceNumber"
  | "notes";

export interface ExpenseWorkbookEditingIssue {
  readonly rowId: string;
  readonly fieldId: string;
  readonly kind: "validation" | "conflict" | "access";
  readonly message: string;
}

const EDITABLE_FIELDS: readonly ExpenseWorkbookEditableField[] = [
  "expenseDate",
  "projectId",
  "projectCostCodeId",
  "category",
  "description",
  "payee",
  "amount",
  "currency",
  "paymentMethod",
  "referenceNumber",
  "notes",
];

const PROJECT_REFERENCE_FIELDS = new Set<string>(["projectId", "projectCostCodeId"]);

const PROTECTED_FIELDS = [
  "id",
  "userId",
  "companyId",
  "status",
  "supplierInvoiceId",
  "receiptSourceDocumentId",
  "vendorId",
  "purchaseOrderId",
  "settlementState",
  "paidAmount",
  "paymentStatus",
  "settledAt",
  "baseCurrencyAmount",
  "phpAmount",
  "fxRate",
  "fxProvenance",
  "createdAt",
  "updatedAt",
  "archivedAt",
  "voidedAt",
  "voidedByUserId",
  "voidReason",
  "correctionState",
] as const;

function protectedIssueField(field: string): string {
  if (["id", "userId", "companyId"].includes(field)) return "expenseId";
  if (["supplierInvoiceId", "receiptSourceDocumentId"].includes(field)) return "sourceLinkage";
  if (field === "vendorId") return "vendorLinkage";
  if (field === "purchaseOrderId") return "purchaseOrderLinkage";
  if (["settlementState", "paidAmount", "paymentStatus", "settledAt"].includes(field)) return "settlementState";
  if (["baseCurrencyAmount", "phpAmount"].includes(field)) return "baseCurrencyValue";
  if (["fxRate", "fxProvenance"].includes(field)) return "fxProvenance";
  if (field === "archivedAt") return "archiveState";
  if (["voidedAt", "voidedByUserId", "voidReason", "correctionState"].includes(field)) return "voidCorrectionState";
  return field;
}

type ExpenseWorkbookCandidate = {
  readonly base: Expense;
  readonly staged: Expense;
  readonly changedFields: readonly ExpenseWorkbookEditableField[];
};

export class ExpenseWorkbookEditingError extends Error {
  readonly kind: "validation" | "conflict" | "access" | "apply" | "context";
  readonly phase: "preflight" | "apply" | "post-apply";
  readonly issues: readonly ExpenseWorkbookEditingIssue[];
  readonly appliedCount: number;
  readonly allRowsApplied: boolean;
  readonly originalError?: unknown;

  constructor(input: {
    kind: "validation" | "conflict" | "access" | "apply" | "context";
    phase?: "preflight" | "apply" | "post-apply";
    message: string;
    issues?: readonly ExpenseWorkbookEditingIssue[];
    appliedCount?: number;
    allRowsApplied?: boolean;
    originalError?: unknown;
  }) {
    super(input.message);
    this.name = "ExpenseWorkbookEditingError";
    this.kind = input.kind;
    this.phase = input.phase || "preflight";
    this.issues = input.issues || [];
    this.appliedCount = input.appliedCount || 0;
    this.allRowsApplied = input.allRowsApplied || false;
    this.originalError = input.originalError;
  }
}

function optionalText(value: unknown): string | undefined {
  const result = String(value ?? "").trim();
  return result || undefined;
}

function normalizedFieldValue(field: ExpenseWorkbookEditableField, value: unknown): unknown {
  switch (field) {
    case "expenseDate":
    case "description":
      return String(value ?? "").trim();
    case "projectId":
    case "projectCostCodeId":
    case "payee":
    case "paymentMethod":
    case "referenceNumber":
    case "notes":
      return optionalText(value);
    case "category":
      return String(value ?? "").trim() || "Miscellaneous";
    case "amount":
      return value === null || value === undefined || value === "" ? Number.NaN : Number(value);
    case "currency":
      return String(value ?? "").trim().toUpperCase();
  }
}

function changedFields(base: Expense, staged: Expense): ExpenseWorkbookEditableField[] {
  return EDITABLE_FIELDS.filter((field) => !Object.is(
    normalizedFieldValue(field, base[field]),
    normalizedFieldValue(field, staged[field]),
  ));
}

function changedProtectedFields(base: Expense, staged: Expense): string[] {
  const baseValues = base as unknown as Record<string, unknown>;
  const stagedValues = staged as unknown as Record<string, unknown>;
  return PROTECTED_FIELDS.filter((field) => !Object.is(baseValues[field], stagedValues[field]));
}

function addIssue(
  issues: ExpenseWorkbookEditingIssue[],
  rowId: string,
  fieldId: string,
  kind: ExpenseWorkbookEditingIssue["kind"],
  message: string,
) {
  issues.push({ rowId, fieldId, kind, message });
}

function candidatesFromStagedRows(
  stagedRows: readonly Expense[],
  baseRecords: ExpensesWorkbookRecords,
): { candidates: ExpenseWorkbookCandidate[]; issues: ExpenseWorkbookEditingIssue[] } {
  const baseById = new Map(baseRecords.expenses.map((expense) => [expense.id, expense]));
  const seen = new Set<string>();
  const candidates: ExpenseWorkbookCandidate[] = [];
  const issues: ExpenseWorkbookEditingIssue[] = [];

  for (const staged of stagedRows) {
    if (seen.has(staged.id)) {
      addIssue(issues, staged.id, "expenseId", "access", "Expense identity appears more than once in the worksheet.");
      continue;
    }
    seen.add(staged.id);
    const base = baseById.get(staged.id);
    if (!base) {
      addIssue(issues, staged.id, "expenseId", "access", "Adding Expenses from the worksheet is not available.");
      continue;
    }

    const protectedFields = changedProtectedFields(base, staged);
    for (const field of protectedFields) {
      addIssue(issues, base.id, protectedIssueField(field), "access", "This Expense field is controlled by its existing workflow.");
    }

    const fields = changedFields(base, staged);
    if (!fields.length && !protectedFields.length) continue;
    if (!isEditableDirectExpenseDraft(base)) {
      addIssue(issues, base.id, "status", "access", "Only direct, active DRAFT Expenses can be edited in this worksheet.");
      continue;
    }
    candidates.push({ base, staged, changedFields: fields });
  }

  return { candidates, issues };
}

function validateCandidate(
  candidate: ExpenseWorkbookCandidate,
  records: ExpensesWorkbookRecords,
  permissions: readonly PermissionKey[],
  issues: ExpenseWorkbookEditingIssue[],
) {
  for (const field of ["expenseDate", "description", "amount", "currency"] as const) {
    const message = validateExpenseDraftField(field, candidate.staged[field]);
    if (message) addIssue(issues, candidate.base.id, field, "validation", message);
  }

  const referenceChanged = candidate.changedFields.some((field) => PROJECT_REFERENCE_FIELDS.has(field));
  const canReadProjects = hasAnyPermission(permissions, [PERMISSION_KEYS.projectsRead]);
  if (referenceChanged && !canReadProjects) {
    addIssue(issues, candidate.base.id, "projectId", "access", "Project access is required to change Project or Cost Code values.");
    return;
  }
  if (canReadProjects) {
    const referenceIssue = validateExpenseDraftReferences(
      candidate.staged,
      records.projects,
      records.costCodes,
      candidate.base,
    );
    if (referenceIssue) addIssue(issues, candidate.base.id, referenceIssue.fieldId, "validation", referenceIssue.message);
  }
}

function compareExpectedCompany(records: ExpensesWorkbookRecords, expectedCompanyId?: string): boolean {
  return !expectedCompanyId || records.expectedCompanyId === expectedCompanyId;
}

function isConcurrencyConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? (error as Error & { code?: unknown }).code : undefined;
  return /changed after|changed in another session|expected.version.mismatch|stale|conflict/i.test(error.message)
    || code === "40001";
}

function permissionSnapshot(permissions: Iterable<PermissionKey>): PermissionKey[] {
  return [...new Set(permissions)];
}

export function canEditExpenseWorkbookField(
  fieldId: string,
  expense: Expense,
  permissions: Iterable<PermissionKey> | null | undefined,
): boolean {
  const snapshot = permissions ? [...permissions] : [];
  if (!EDITABLE_FIELDS.includes(fieldId as ExpenseWorkbookEditableField)
    || !isEditableDirectExpenseDraft(expense)
    || !hasAllPermissions(snapshot, [PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.expensesWrite])) {
    return false;
  }
  return !PROJECT_REFERENCE_FIELDS.has(fieldId) || hasAnyPermission(snapshot, [PERMISSION_KEYS.projectsRead]);
}

export function applyExpenseWorkbookDraftValue(
  expense: Expense,
  fieldId: string,
  value: unknown,
  costCodes: readonly ProjectCostCode[] = [],
): Expense {
  switch (fieldId) {
    case "expenseDate": return { ...expense, expenseDate: String(value ?? "") };
    case "projectId": {
      const projectId = optionalText(value);
      const currentCostCode = costCodes.find((costCode) => costCode.id === expense.projectCostCodeId);
      return {
        ...expense,
        projectId,
        projectCostCodeId: currentCostCode?.projectId === projectId ? expense.projectCostCodeId : undefined,
      };
    }
    case "projectCostCodeId": return { ...expense, projectCostCodeId: optionalText(value) };
    case "category": return { ...expense, category: String(value ?? "") };
    case "description": return { ...expense, description: String(value ?? "") };
    case "payee": return { ...expense, payee: String(value ?? "") };
    case "amount": return { ...expense, amount: value === null || value === undefined || value === "" ? Number.NaN : Number(value) };
    case "currency": return { ...expense, currency: String(value ?? "") };
    case "paymentMethod": return { ...expense, paymentMethod: String(value ?? "") };
    case "referenceNumber": return { ...expense, referenceNumber: String(value ?? "") };
    case "notes": return { ...expense, notes: String(value ?? "") };
    default: return expense;
  }
}

export function readExpenseWorkbookValue(
  expense: Expense,
  fieldId: string,
  canReadProjects: boolean,
): unknown {
  switch (fieldId) {
    case "expenseId": return expense.id;
    case "expenseDate": return expense.expenseDate;
    case "projectId": return canReadProjects ? expense.projectId || "" : expense.projectId ? "Assigned project" : "";
    case "projectCostCodeId": return canReadProjects ? expense.projectCostCodeId || "" : expense.projectCostCodeId ? "Assigned cost code" : "";
    case "category": return expense.category;
    case "description": return expense.description;
    case "payee": return expense.payee || "";
    case "amount": return expense.amount;
    case "currency": return expense.currency;
    case "paymentMethod": return expense.paymentMethod || "";
    case "referenceNumber": return expense.referenceNumber || "";
    case "notes": return expense.notes || "";
    case "status": return expense.status;
    case "sourceLinkage": return expense.supplierInvoiceId || expense.receiptSourceDocumentId ? "Linked source · protected" : "Direct entry";
    case "vendorLinkage": return expense.vendorId ? "Canonical Vendor linked" : "No Vendor link";
    case "purchaseOrderLinkage": return expense.purchaseOrderId ? "Purchase Order linked" : "None";
    case "settlementState": return "Managed in settlement workflow";
    case "baseCurrencyValue": return "Unavailable in this sheet";
    case "fxProvenance": return "Unavailable in this sheet";
    case "archiveState": return expense.archivedAt ? "Archived · correction workflow" : "Not archived";
    case "voidCorrectionState": return expense.status === "VOID" || expense.voidedAt ? "Void / correction history" : "Correction workflow protected";
    case "createdAt": return expense.createdAt;
    case "updatedAt": return expense.updatedAt;
    default: return undefined;
  }
}

export function expenseWorkbookOptionsForField(
  fieldId: string,
  expense: Expense,
  projects: readonly Project[],
  costCodes: readonly ProjectCostCode[],
  canReadProjects: boolean,
): readonly WorksheetSelectOption[] | undefined {
  if (fieldId === "projectId") {
    if (!canReadProjects) return [];
    return projects
      .filter((project) => project.status !== "ARCHIVED" || project.id === expense.projectId)
      .map((project) => ({
        value: project.id,
        label: project.projectCode + " — " + project.projectName + (project.status === "ARCHIVED" ? " (archived)" : ""),
      }));
  }
  if (fieldId === "projectCostCodeId") {
    if (!canReadProjects) return [];
    return getSelectableCostCodes(costCodes, expense.projectId, expense.projectCostCodeId)
      .map((costCode) => ({ value: costCode.id, label: formatCostCodeOptionLabel(costCode) }));
  }
  if (fieldId === "paymentMethod") {
    return [...new Set([...EXPENSE_PAYMENT_METHODS, expense.paymentMethod || ""].filter(Boolean))]
      .map((value) => ({ value, label: value }));
  }
  return undefined;
}

export async function saveExpenseWorkbookRows(input: {
  writeMode: ExpenseWorkbookWriteMode;
  stagedRows: readonly Expense[];
  baseRecords: ExpensesWorkbookRecords;
  permissions: Iterable<PermissionKey>;
  expectedCompanyId?: string;
  saveSyntheticRows?: (rows: readonly Expense[]) => void | Promise<void>;
  refresh?: () => Promise<ExpensesWorkbookRecords>;
  saveExpense?: (expense: Expense) => Promise<void> | void;
  isContextCurrent: () => boolean;
}): Promise<{
  writeMode: Exclude<ExpenseWorkbookWriteMode, "none">;
  refreshedRecords: ExpensesWorkbookRecords;
  appliedExpenseCount: number;
}> {
  const permissions = permissionSnapshot(input.permissions);
  if (input.writeMode === "none" || !hasAllPermissions(permissions, [PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.expensesWrite])) {
    throw new ExpenseWorkbookEditingError({ kind: "access", message: "Expense worksheet editing is not available for this access profile." });
  }

  const initial = candidatesFromStagedRows(input.stagedRows, input.baseRecords);
  if (initial.issues.length) {
    const kind = initial.issues.some((issue) => issue.kind === "access") ? "access" : "validation";
    throw new ExpenseWorkbookEditingError({ kind, message: "Review the highlighted Expense worksheet issues before saving.", issues: initial.issues });
  }
  if (!initial.candidates.length) {
    return { writeMode: input.writeMode as Exclude<ExpenseWorkbookWriteMode, "none">, refreshedRecords: input.baseRecords, appliedExpenseCount: 0 };
  }

  const expectedCompanyId = input.expectedCompanyId || input.baseRecords.expectedCompanyId;
  if (!compareExpectedCompany(input.baseRecords, expectedCompanyId)) {
    throw new ExpenseWorkbookEditingError({ kind: "conflict", message: "Company access changed. Reopen the workbook before saving Expense changes." });
  }

  const initialIssues: ExpenseWorkbookEditingIssue[] = [];
  for (const candidate of initial.candidates) validateCandidate(candidate, input.baseRecords, permissions, initialIssues);
  if (initialIssues.length) {
    const kind = initialIssues.some((issue) => issue.kind === "access") ? "access" : "validation";
    throw new ExpenseWorkbookEditingError({ kind, message: "Review the highlighted Expense worksheet issues before saving.", issues: initialIssues });
  }

  if (input.writeMode === "synthetic-demo") {
    if (!input.saveSyntheticRows) {
      throw new ExpenseWorkbookEditingError({ kind: "access", message: "Synthetic Expense worksheet save is not configured." });
    }
    if (!input.isContextCurrent()) {
      throw new ExpenseWorkbookEditingError({ kind: "context", message: "Company or access changed during save. Reopen the workbook before editing." });
    }
    const byId = new Map(initial.candidates.map((candidate) => [candidate.base.id, candidate]));
    const nextRows = input.baseRecords.expenses.map((base) => {
      const candidate = byId.get(base.id);
      return candidate ? normalizeExpenseDraft(candidate.staged, base) : base;
    });
    await input.saveSyntheticRows(nextRows);
    return {
      writeMode: "synthetic-demo",
      refreshedRecords: { ...input.baseRecords, expenses: nextRows },
      appliedExpenseCount: initial.candidates.length,
    };
  }

  if (!input.refresh || !input.saveExpense) {
    throw new ExpenseWorkbookEditingError({ kind: "access", message: "Expense-domain refresh and save callbacks are not configured." });
  }

  let latest: ExpensesWorkbookRecords;
  try {
    latest = await input.refresh();
  } catch (error) {
    throw new ExpenseWorkbookEditingError({
      kind: "apply",
      phase: "preflight",
      message: "Could not refresh current Expense data before saving. Staged edits remain in the worksheet.",
      originalError: error,
    });
  }
  if (!input.isContextCurrent()) {
    throw new ExpenseWorkbookEditingError({ kind: "context", message: "Company or access changed during save. Reopen the workbook before editing." });
  }
  if (!compareExpectedCompany(latest, expectedCompanyId)) {
    throw new ExpenseWorkbookEditingError({ kind: "conflict", message: "Expense data belongs to a different company context. Review current rows before saving." });
  }

  const latestById = new Map(latest.expenses.map((expense) => [expense.id, expense]));
  const prepared: Expense[] = [];
  const preflightIssues: ExpenseWorkbookEditingIssue[] = [];
  for (const candidate of initial.candidates) {
    const current = latestById.get(candidate.base.id);
    if (!current || !candidate.base.updatedAt || !current.updatedAt || current.updatedAt !== candidate.base.updatedAt) {
      addIssue(preflightIssues, candidate.base.id, "updatedAt", "conflict", "This Expense changed after the worksheet opened. Review the refreshed row before re-entering changes.");
      continue;
    }
    if (!isEditableDirectExpenseDraft(current)) {
      addIssue(preflightIssues, current.id, "status", "conflict", "This Expense is no longer an eligible direct draft. Review its current workflow state.");
      continue;
    }
    const freshCandidate = { ...candidate, base: current };
    validateCandidate(freshCandidate, latest, permissions, preflightIssues);
    if (!preflightIssues.some((issue) => issue.rowId === current.id)) {
      try {
        prepared.push(normalizeExpenseDraft(candidate.staged, current));
      } catch (error) {
        addIssue(preflightIssues, current.id, "description", "validation", error instanceof Error ? error.message : "Review the Expense draft values.");
      }
    }
  }
  if (preflightIssues.length) {
    const hasConflict = preflightIssues.some((issue) => issue.kind === "conflict");
    const kind = hasConflict ? "conflict" : preflightIssues.some((issue) => issue.kind === "access") ? "access" : "validation";
    throw new ExpenseWorkbookEditingError({
      kind,
      phase: "preflight",
      message: hasConflict
        ? "Expense data changed while you were editing. Review the refreshed rows before re-entering changes."
        : "Review the highlighted Expense worksheet issues before saving.",
      issues: preflightIssues,
    });
  }

  let appliedCount = 0;
  for (const expense of prepared) {
    if (!input.isContextCurrent()) {
      throw new ExpenseWorkbookEditingError({
        kind: "context",
        phase: "apply",
        message: "Company or access changed during save. Reopen the workbook before editing.",
        appliedCount,
      });
    }
    try {
      await input.saveExpense(expense);
      appliedCount += 1;
    } catch (error) {
      const conflict = isConcurrencyConflict(error);
      throw new ExpenseWorkbookEditingError({
        kind: conflict ? "conflict" : "apply",
        phase: "apply",
        message: conflict
          ? "This Expense changed before it could be saved. Review the current row before re-entering changes."
          : error instanceof Error && error.message ? error.message : "Could not save Expense worksheet changes.",
        appliedCount,
        originalError: error,
      });
    }
  }

  let refreshedRecords: ExpensesWorkbookRecords;
  try {
    refreshedRecords = await input.refresh();
  } catch (error) {
    throw new ExpenseWorkbookEditingError({
      kind: "apply",
      phase: "post-apply",
      message: "Expense changes were saved, but the latest rows could not be refreshed. Reload before continuing.",
      appliedCount,
      allRowsApplied: true,
      originalError: error,
    });
  }
  if (!input.isContextCurrent()) {
    throw new ExpenseWorkbookEditingError({
      kind: "context",
      phase: "post-apply",
      message: "Expense changes were saved, but company or access changed during refresh. Reopen the workbook.",
      appliedCount,
      allRowsApplied: true,
    });
  }
  if (!compareExpectedCompany(refreshedRecords, expectedCompanyId)) {
    throw new ExpenseWorkbookEditingError({
      kind: "conflict",
      phase: "post-apply",
      message: "Expense changes were saved, but the refreshed company context changed. Reopen the workbook before continuing.",
      appliedCount,
      allRowsApplied: true,
    });
  }
  return { writeMode: "existing-domain", refreshedRecords, appliedExpenseCount: appliedCount };
}
