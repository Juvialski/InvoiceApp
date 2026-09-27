import assert from "node:assert/strict";
import test from "node:test";
import type { Expense, Project, ProjectCostCode } from "../src/types.ts";
import { PERMISSION_KEYS } from "../src/utils/accessControl.ts";
import {
  isEditableDirectExpenseDraft,
  normalizeExpenseDraft,
  validateExpenseDraftField,
  validateExpenseDraftReferences,
} from "../src/lib/expenseDraftRules.ts";
import {
  applyExpenseWorkbookDraftValue,
  canEditExpenseWorkbookField,
  expenseWorkbookOptionsForField,
  ExpenseWorkbookEditingError,
  saveExpenseWorkbookRows,
} from "../src/lib/expensesWorkbookEditing.ts";
import type { ExpensesWorkbookRecords } from "../src/lib/expensesWorkbook.ts";

const project: Project = {
  id: "project-1",
  projectCode: "PRJ-001",
  projectName: "Water Upgrade",
  status: "ACTIVE",
  projectBudget: 1000,
  currency: "PHP",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const secondProject: Project = {
  ...project,
  id: "project-2",
  projectCode: "PRJ-002",
  projectName: "Pump Station",
};

const archivedProject: Project = {
  ...project,
  id: "project-archived",
  projectCode: "PRJ-OLD",
  projectName: "Archived project",
  status: "ARCHIVED",
};

const costCode: ProjectCostCode = {
  id: "cost-code-1",
  projectId: project.id,
  code: "01-GEN",
  name: "General works",
  status: "ACTIVE",
  approvedBudgetAmount: 500,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const otherProjectCostCode: ProjectCostCode = {
  ...costCode,
  id: "cost-code-2",
  projectId: secondProject.id,
  code: "02-PUMP",
};

const archivedCostCode: ProjectCostCode = {
  ...costCode,
  id: "cost-code-archived",
  projectId: archivedProject.id,
  status: "ARCHIVED",
};

const archivedCurrentCostCode: ProjectCostCode = {
  ...costCode,
  status: "ARCHIVED",
};

const directExpense: Expense = {
  id: "expense-direct-1",
  projectId: project.id,
  projectCostCodeId: costCode.id,
  expenseDate: "2026-09-20",
  category: "Fuel",
  description: "Site fuel",
  payee: "Direct Supplier",
  amount: 100,
  currency: "PHP",
  paymentMethod: "Cash",
  referenceNumber: "REF-001",
  status: "DRAFT",
  notes: "Original note",
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const linkedExpense: Expense = {
  ...directExpense,
  id: "expense-linked-1",
  supplierInvoiceId: "invoice-secret-id",
  vendorId: "vendor-secret-id",
  purchaseOrderId: "po-secret-id",
};

const authorizedPermissions = [PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.expensesWrite, PERMISSION_KEYS.projectsRead] as const;

function records(overrides: Partial<ExpensesWorkbookRecords> = {}): ExpensesWorkbookRecords {
  return {
    expenses: [directExpense, linkedExpense],
    projects: [project, secondProject, archivedProject],
    costCodes: [costCode, otherProjectCostCode, archivedCostCode],
    invoices: [],
    purchaseOrders: [],
    vendors: [],
    expectedCompanyId: "company-1",
    ...overrides,
  };
}

test("direct DRAFT eligibility is shared and requires read plus manage for ordinary edits", () => {
  assert.equal(isEditableDirectExpenseDraft(directExpense), true);
  assert.equal(isEditableDirectExpenseDraft(linkedExpense), false);
  assert.equal(isEditableDirectExpenseDraft({ ...directExpense, archivedAt: "2026-09-21T00:00:00.000Z" }), false);
  assert.equal(isEditableDirectExpenseDraft({ ...directExpense, status: "APPROVED" }), false);
  assert.equal(isEditableDirectExpenseDraft({ ...directExpense, status: "VOID" }), false);

  assert.equal(canEditExpenseWorkbookField("description", directExpense, authorizedPermissions), true);
  assert.equal(canEditExpenseWorkbookField("description", directExpense, [PERMISSION_KEYS.expensesRead]), false);
  assert.equal(canEditExpenseWorkbookField("description", directExpense, [PERMISSION_KEYS.expensesWrite]), false);
  assert.equal(canEditExpenseWorkbookField("projectId", directExpense, [PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.expensesWrite]), false);
  assert.equal(canEditExpenseWorkbookField("projectId", linkedExpense, authorizedPermissions), false);
});

test("draft staging changes only ordinary fields and clears a cost code when Project changes", () => {
  let staged = applyExpenseWorkbookDraftValue(directExpense, "description", " Revised fuel ");
  staged = applyExpenseWorkbookDraftValue(staged, "amount", 125);
  staged = applyExpenseWorkbookDraftValue(staged, "currency", "usd");
  staged = applyExpenseWorkbookDraftValue(staged, "projectId", secondProject.id, [costCode, otherProjectCostCode]);

  assert.equal(staged.description, " Revised fuel ");
  assert.equal(staged.amount, 125);
  assert.equal(staged.currency, "usd");
  assert.equal(staged.projectId, secondProject.id);
  assert.equal(staged.projectCostCodeId, undefined);
  assert.equal(staged.status, directExpense.status);
  assert.equal(staged.updatedAt, directExpense.updatedAt);

  for (const [field, value] of [
    ["status", "APPROVED"],
    ["supplierInvoiceId", "invoice-override"],
    ["vendorId", "vendor-override"],
    ["purchaseOrderId", "po-override"],
    ["settlementState", "PAID"],
    ["baseCurrencyAmount", 900],
    ["updatedAt", "2099-01-01T00:00:00.000Z"],
    ["archivedAt", "2099-01-01T00:00:00.000Z"],
  ] as const) {
    assert.equal(applyExpenseWorkbookDraftValue(directExpense, field, value), directExpense, field);
  }
});

test("shared Expense draft validation rejects missing fields, invalid dates, amounts, and currencies", () => {
  assert.match(validateExpenseDraftField("description", "  ") || "", /required/i);
  assert.match(validateExpenseDraftField("expenseDate", "") || "", /required/i);
  assert.match(validateExpenseDraftField("expenseDate", "2026-02-31") || "", /real/i);
  assert.equal(validateExpenseDraftField("expenseDate", "2026-02-28"), undefined);
  assert.match(validateExpenseDraftField("amount", null) || "", /required/i);
  assert.match(validateExpenseDraftField("amount", -1) || "", /zero or greater/i);
  assert.match(validateExpenseDraftField("amount", Number.NaN) || "", /zero or greater/i);
  assert.equal(validateExpenseDraftField("amount", 0), undefined);
  assert.match(validateExpenseDraftField("currency", "US") || "", /three-letter/i);
  assert.equal(validateExpenseDraftField("currency", "usd"), undefined);

  assert.throws(() => normalizeExpenseDraft({ ...directExpense, expenseDate: "2026-02-31" }, directExpense), /real Expense Date/i);
  assert.throws(() => normalizeExpenseDraft({ ...directExpense, amount: Number.NaN }, directExpense), /Amount must/i);
  assert.equal(normalizeExpenseDraft({ ...directExpense, currency: "usd" }, directExpense).currency, "USD");
});

test("Project and Cost Code selections keep active/current and same-Project rules", () => {
  assert.equal(validateExpenseDraftReferences({ projectId: secondProject.id, projectCostCodeId: otherProjectCostCode.id }, [project, secondProject], [costCode, otherProjectCostCode], directExpense), undefined);
  assert.match(validateExpenseDraftReferences({ projectId: secondProject.id, projectCostCodeId: costCode.id }, [project, secondProject], [costCode, otherProjectCostCode], directExpense)?.message || "", /belonging to the selected project/i);
  assert.match(validateExpenseDraftReferences({ projectId: archivedProject.id }, [archivedProject], [archivedCostCode], directExpense)?.message || "", /active project/i);

  const archivedSelection: Expense = { ...directExpense, projectId: archivedProject.id, projectCostCodeId: archivedCostCode.id };
  assert.equal(validateExpenseDraftReferences(archivedSelection, [archivedProject], [archivedCostCode], archivedSelection), undefined);
  assert.equal(validateExpenseDraftReferences({ projectId: project.id, projectCostCodeId: archivedCurrentCostCode.id }, [project], [archivedCurrentCostCode], directExpense), undefined);
  assert.match(validateExpenseDraftReferences({ projectCostCodeId: costCode.id }, [project], [costCode], directExpense)?.message || "", /choose a project/i);

  const projectOptions = expenseWorkbookOptionsForField("projectId", directExpense, [project, secondProject, archivedProject], [costCode], true);
  assert.deepEqual(projectOptions?.map((option) => option.value), [project.id, secondProject.id]);
  const codeOptions = expenseWorkbookOptionsForField("projectCostCodeId", directExpense, [project], [costCode, otherProjectCostCode], true);
  assert.deepEqual(codeOptions?.map((option) => option.value), [costCode.id]);
  const currentArchivedOptions = expenseWorkbookOptionsForField("projectCostCodeId", { ...directExpense, projectCostCodeId: archivedCurrentCostCode.id }, [project], [archivedCurrentCostCode], true);
  assert.deepEqual(currentArchivedOptions?.map((option) => option.value), [archivedCurrentCostCode.id]);
  assert.deepEqual(expenseWorkbookOptionsForField("projectId", directExpense, [project], [costCode], false), []);
  assert.ok(expenseWorkbookOptionsForField("paymentMethod", { ...directExpense, paymentMethod: "Other method" }, [], [], false)?.some((option) => option.value === "Other method"));
});

test("production Save refreshes before mutation, delegates only normalized safe fields, then refreshes again", async () => {
  const base = records();
  let stagedDirect = applyExpenseWorkbookDraftValue(directExpense, "expenseDate", "2026-09-21");
  stagedDirect = applyExpenseWorkbookDraftValue(stagedDirect, "projectId", secondProject.id, [costCode, otherProjectCostCode]);
  stagedDirect = applyExpenseWorkbookDraftValue(stagedDirect, "projectCostCodeId", otherProjectCostCode.id);
  stagedDirect = applyExpenseWorkbookDraftValue(stagedDirect, "category", "  Transport  ");
  stagedDirect = applyExpenseWorkbookDraftValue(stagedDirect, "description", "  Revised fuel  ");
  stagedDirect = applyExpenseWorkbookDraftValue(stagedDirect, "payee", "  Revised supplier  ");
  stagedDirect = applyExpenseWorkbookDraftValue(stagedDirect, "amount", 125);
  stagedDirect = applyExpenseWorkbookDraftValue(stagedDirect, "currency", "usd");
  stagedDirect = applyExpenseWorkbookDraftValue(stagedDirect, "paymentMethod", "Check");
  stagedDirect = applyExpenseWorkbookDraftValue(stagedDirect, "referenceNumber", " REF-002 ");
  stagedDirect = applyExpenseWorkbookDraftValue(stagedDirect, "notes", " Updated note ");
  const staged = [stagedDirect, linkedExpense];
  const calls: string[] = [];
  let latest = base;
  let saved: Expense | undefined;

  const result = await saveExpenseWorkbookRows({
    writeMode: "existing-domain",
    stagedRows: staged,
    baseRecords: base,
    permissions: authorizedPermissions,
    expectedCompanyId: "company-1",
    refresh: async () => { calls.push("refresh"); return latest; },
    saveExpense: async (expense) => {
      calls.push("save");
      saved = expense;
      latest = records({ expenses: [{ ...expense, updatedAt: "2026-09-27T00:00:00.000Z" }, linkedExpense] });
    },
    isContextCurrent: () => true,
  });

  assert.deepEqual(calls, ["refresh", "save", "refresh"]);
  assert.equal(result.appliedExpenseCount, 1);
  assert.equal(saved?.expenseDate, "2026-09-21");
  assert.equal(saved?.projectId, secondProject.id);
  assert.equal(saved?.projectCostCodeId, otherProjectCostCode.id);
  assert.equal(saved?.category, "Transport");
  assert.equal(saved?.description, "Revised fuel");
  assert.equal(saved?.payee, "Revised supplier");
  assert.equal(saved?.amount, 125);
  assert.equal(saved?.currency, "USD");
  assert.equal(saved?.paymentMethod, "Check");
  assert.equal(saved?.referenceNumber, "REF-002");
  assert.equal(saved?.notes, "Updated note");
  assert.equal(saved?.updatedAt, directExpense.updatedAt);
  assert.equal(saved?.status, directExpense.status);
  assert.equal(saved?.supplierInvoiceId, undefined);
  assert.equal(saved?.projectCostCodeId, otherProjectCostCode.id);
});

test("stale or cross-company refresh blocks every overwrite", async () => {
  const base = records();
  const staged = [applyExpenseWorkbookDraftValue(directExpense, "amount", 200), linkedExpense];
  let saveCalls = 0;
  let refreshCalls = 0;

  await assert.rejects(saveExpenseWorkbookRows({
    writeMode: "existing-domain",
    stagedRows: staged,
    baseRecords: base,
    permissions: authorizedPermissions,
    expectedCompanyId: "company-1",
    refresh: async () => {
      refreshCalls += 1;
      return records({ expenses: [{ ...directExpense, updatedAt: "2026-09-22T00:00:00.000Z" }, linkedExpense] });
    },
    saveExpense: async () => { saveCalls += 1; },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ExpenseWorkbookEditingError && error.kind === "conflict" && error.issues.some((issue) => issue.fieldId === "updatedAt"));
  assert.equal(refreshCalls, 1);
  assert.equal(saveCalls, 0);

  await assert.rejects(saveExpenseWorkbookRows({
    writeMode: "existing-domain",
    stagedRows: staged,
    baseRecords: base,
    permissions: authorizedPermissions,
    expectedCompanyId: "company-1",
    refresh: async () => records({ expectedCompanyId: "company-2" }),
    saveExpense: async () => { saveCalls += 1; },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ExpenseWorkbookEditingError && error.kind === "conflict");
  assert.equal(saveCalls, 0);
});

test("invalid references and values are rejected before refresh or persistence", async () => {
  const base = records();
  const invalidAmount = applyExpenseWorkbookDraftValue(directExpense, "amount", Number.NaN);
  let refreshCalls = 0;
  let saveCalls = 0;
  await assert.rejects(saveExpenseWorkbookRows({
    writeMode: "existing-domain",
    stagedRows: [invalidAmount, linkedExpense],
    baseRecords: base,
    permissions: authorizedPermissions,
    refresh: async () => { refreshCalls += 1; return base; },
    saveExpense: async () => { saveCalls += 1; },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ExpenseWorkbookEditingError && error.kind === "validation" && error.issues.some((issue) => issue.fieldId === "amount"));
  assert.equal(refreshCalls, 0);
  assert.equal(saveCalls, 0);

  const invalidDate = applyExpenseWorkbookDraftValue(directExpense, "expenseDate", "2026-02-31");
  await assert.rejects(saveExpenseWorkbookRows({
    writeMode: "existing-domain",
    stagedRows: [invalidDate, linkedExpense],
    baseRecords: base,
    permissions: authorizedPermissions,
    refresh: async () => { refreshCalls += 1; return base; },
    saveExpense: async () => { saveCalls += 1; },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ExpenseWorkbookEditingError && error.issues.some((issue) => issue.fieldId === "expenseDate"));
  assert.equal(refreshCalls, 0);

  const invalidReference = applyExpenseWorkbookDraftValue(directExpense, "projectId", secondProject.id, [costCode, otherProjectCostCode]);
  const invalidCostCode = applyExpenseWorkbookDraftValue(invalidReference, "projectCostCodeId", costCode.id);
  await assert.rejects(saveExpenseWorkbookRows({
    writeMode: "existing-domain",
    stagedRows: [invalidCostCode, linkedExpense],
    baseRecords: base,
    permissions: authorizedPermissions,
    refresh: async () => { refreshCalls += 1; return base; },
    saveExpense: async () => { saveCalls += 1; },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ExpenseWorkbookEditingError && error.issues.some((issue) => issue.fieldId === "projectCostCodeId"));
  assert.equal(refreshCalls, 0);
  assert.equal(saveCalls, 0);
});

test("Expenses manage without Expenses read cannot Save and demo updates stay local", async () => {
  const base = records();
  const staged = [applyExpenseWorkbookDraftValue(directExpense, "notes", "Demo only"), linkedExpense];
  let syntheticRows: readonly Expense[] = [];
  let refreshCalls = 0;
  let persistentSaveCalls = 0;

  await assert.rejects(saveExpenseWorkbookRows({
    writeMode: "existing-domain",
    stagedRows: staged,
    baseRecords: base,
    permissions: [PERMISSION_KEYS.expensesWrite],
    refresh: async () => { refreshCalls += 1; return base; },
    saveExpense: async () => { persistentSaveCalls += 1; },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ExpenseWorkbookEditingError && error.kind === "access");

  const result = await saveExpenseWorkbookRows({
    writeMode: "synthetic-demo",
    stagedRows: staged,
    baseRecords: base,
    permissions: [PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.expensesWrite],
    saveSyntheticRows: (rows) => { syntheticRows = rows; },
    refresh: async () => { refreshCalls += 1; return base; },
    saveExpense: async () => { persistentSaveCalls += 1; },
    isContextCurrent: () => true,
  });

  assert.equal(result.writeMode, "synthetic-demo");
  assert.equal(syntheticRows.find((expense) => expense.id === directExpense.id)?.notes, "Demo only");
  assert.equal(refreshCalls, 0);
  assert.equal(persistentSaveCalls, 0);
});
