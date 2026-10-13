import React, { useMemo } from "react";
import type { Expense, Project, ProjectCostCode, Vendor } from "../../types.ts";
import type { VendorSaveInput } from "../../lib/vendors.ts";
import type { InventoryBalance, InventoryItem, InventoryItemSaveInput } from "../../lib/inventory.ts";
import { buildVendorSavePlan, newVendorWorksheetRow, vendorWorksheetColumns, vendorWorksheetRow, type VendorWorksheetRow } from "../../components/VendorMasterWorksheet.tsx";
import { buildWarehouseItemSavePlan, newWarehouseItemWorksheetRow, warehouseItemColumns, warehouseItemWorksheetRow, type WarehouseItemWorksheetRow } from "../../components/inventory/WarehouseItemWorksheet.tsx";
import { WorkbookRecordSheet, type WorkbookRowIssue } from "./WorkbookRecordSheet.tsx";
import { validateProjectCostCodeInput } from "../../lib/projectCostCodes.ts";
import { validateExpenseDraftField, validateExpenseDraftReferences } from "../../lib/expenseDraftRules.ts";
import { createLocalExpense, EXPENSE_CATEGORIES } from "../../lib/expenses.ts";
import { canEditExpenseWorkbookField, applyExpenseWorkbookDraftValue, expenseWorkbookOptionsForField, readExpenseWorkbookValue, saveExpenseWorkbookRows } from "../../lib/expensesWorkbookEditing.ts";
import { type WorksheetColumn } from "../../components/ui/WorksheetEditor.tsx";
import { hasAllPermissions, PERMISSION_KEYS, type PermissionKey } from "../../utils/accessControl.ts";
import type { ExpensesWorkbookRecords } from "../../lib/expensesWorkbook.ts";
import type { ProjectCostCodeSaveInput } from "../../components/projects/ProjectCostCodesWorksheet.tsx";
import { businessDateForTimeZone } from "../../utils/businessDate.ts";

function planIssues(issues: Readonly<Record<string, readonly { columnKey: string; message: string }[]>>): WorkbookRowIssue[] {
  return Object.entries(issues).flatMap(([rowId, values]) => values.map((issue) => ({ rowId, field: issue.columnKey, message: issue.message })));
}
export function WorkbookSuppliers({ vendors, save, onDirtyChange, disabled }: {
  vendors: readonly Vendor[]; save?: (input: VendorSaveInput) => Promise<Vendor>; onDirtyChange: (dirty: boolean) => void; disabled?: boolean;
}) {
  const rows = useMemo(() => vendors.map((row) => vendorWorksheetRow(row)), [vendors]);
  const columns = useMemo(() => vendorWorksheetColumns(Boolean(save)), [save]);
  return <WorkbookRecordSheet label="Suppliers" sourceRows={rows} columns={columns} disabled={disabled}
    makeRow={save ? newVendorWorksheetRow : undefined} onDirtyChange={onDirtyChange}
    validate={(all, pending) => planIssues(buildVendorSavePlan(all, new Set(pending.map((row) => row.id))).issues)}
    save={save ? async (row: VendorWorksheetRow) => {
      if (!row.isNew && !row.updatedAt) throw new Error("Reload this supplier before editing. Its current version is unavailable.");
      const plan = buildVendorSavePlan([row], new Set([row.id]));
      return save(plan.entries[0].input);
    } : undefined} />;
}

export function WorkbookWarehouse({ items, balances, save, onDirtyChange, disabled, actions }: {
  items: readonly InventoryItem[]; balances: readonly InventoryBalance[]; save?: (input: InventoryItemSaveInput) => Promise<InventoryItem>;
  onDirtyChange: (dirty: boolean) => void; disabled?: boolean; actions?: React.ReactNode;
}) {
  const rows = useMemo(() => items.map((item) => warehouseItemWorksheetRow(item, { balance: balances.find((balance) => balance.inventoryItemId === item.id) })), [items, balances]);
  const columns = useMemo(() => warehouseItemColumns(Boolean(save)).filter((column) => column.key !== "movementTotals").map((column) => ({
    ...column, mobileSummary: ["stockUnit", "onHandQuantity"].includes(column.key), editable: (row: WarehouseItemWorksheetRow) => Boolean(save && row.isNew && column.setValue && column.key !== "status"),
    readOnlyReason: column.key === "onHandQuantity" || column.key === "movementCount" ? "This stock quantity comes from recorded stock movements." : "Existing item details are read only here until their save service supports version protection.",
    protected: (row: WarehouseItemWorksheetRow) => !row.isNew || !column.setValue || column.key === "status",
  })), [save]);
  return <WorkbookRecordSheet label="Warehouse" sourceRows={rows} columns={columns} disabled={disabled} actions={actions}
    makeRow={save ? newWarehouseItemWorksheetRow : undefined} onDirtyChange={onDirtyChange}
    validate={(all, pending) => {
      const issues = planIssues(buildWarehouseItemSavePlan(all, new Set(pending.map((row) => row.id))).issues);
      for (const row of pending) {
        if (!row.isNew) issues.push({ rowId: row.id, field: "itemName", message: "Existing items are read only here. Their update service needs version protection." });
        if (row.itemCode && all.some((other) => other.id !== row.id && other.itemCode?.trim().toUpperCase() === row.itemCode?.trim().toUpperCase())) issues.push({ rowId: row.id, field: "itemCode", message: "This item code already exists. Use a different code." });
      }
      return issues;
    }}
    save={save ? async (row) => {
      if (!row.isNew) throw new Error("Existing items cannot be updated in this workbook.");
      return save(buildWarehouseItemSavePlan([row], new Set([row.id])).entries[0].input);
    } : undefined} />;
}

type CostRow = ProjectCostCode & { isNew?: boolean };
export function validateWorkbookCostRows(rows: readonly CostRow[], pending: readonly CostRow[], projects: readonly Project[]): WorkbookRowIssue[] {
  return pending.flatMap((row) => {
    const project = projects.find((candidate) => candidate.id === row.projectId && candidate.status !== "ARCHIVED");
    if (!project) return [{ rowId: row.id, field: "projectId", message: "Choose an active project." }];
    if (row.status !== "ACTIVE" || row.archivedAt) return [{ rowId: row.id, field: "code", message: "Archived cost codes cannot be edited here." }];
    return validateProjectCostCodeInput(row, rows, project.projectBudget).issues.map((message) => ({ rowId: row.id, field: /budget|forecast/i.test(message) ? "approvedBudgetAmount" : "code", message }));
  });
}
export function WorkbookCostCodes({ costCodes, projects, save, onDirtyChange, disabled }: {
  costCodes: readonly ProjectCostCode[]; projects: readonly Project[]; save?: (input: ProjectCostCodeSaveInput) => Promise<void> | void;
  onDirtyChange: (dirty: boolean) => void; disabled?: boolean;
}) {
  const columns = useMemo<readonly WorksheetColumn<CostRow>[]>(() => [
    { key: "projectId", header: "Project", kind: "select", minWidth: "15rem", editable: (row) => Boolean(save && row.isNew), protected: (row) => !row.isNew, value: (row) => row.projectId, setValue: (row, value) => ({ ...row, projectId: String(value) }), options: projects.filter((project) => project.status !== "ARCHIVED").map((project) => ({ value: project.id, label: `${project.projectCode} · ${project.projectName}` })) },
    ...([ ["code", "Cost code"], ["name", "Work package"], ["description", "Description"], ["approvedBudgetAmount", "Approved budget"], ["forecastAmount", "Forecast"] ] as const).map(([key, header]): WorksheetColumn<CostRow> => ({ key, header, minWidth: key === "name" ? "16rem" : "10rem", kind: key.includes("Amount") ? "number" : "text", editable: (row) => Boolean(save && row.status === "ACTIVE" && !row.archivedAt), value: (row) => row[key] ?? "", setValue: (row, value) => ({ ...row, [key]: key.includes("Amount") ? value === "" && key === "forecastAmount" ? undefined : Number(value) : String(value) }) })),
    { key: "status", header: "State", mobileSummary: true, protected: true, value: (row) => row.status },
  ], [projects, save]);
  return <WorkbookRecordSheet<CostRow> label="Cost Codes" sourceRows={costCodes} columns={columns} disabled={disabled}
    onDirtyChange={onDirtyChange} makeRow={save ? () => ({ id: crypto.randomUUID(), projectId: "", code: "", name: "", approvedBudgetAmount: 0, status: "ACTIVE", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isNew: true }) : undefined}
    validate={(all, pending) => validateWorkbookCostRows(all, pending, projects)}
    save={save ? async (row) => {
      if (!row.isNew && !row.updatedAt) throw new Error("Reload this cost code before saving.");
      await save({ ...(row.isNew ? {} : { id: row.id, updatedAt: row.updatedAt }), projectId: row.projectId, code: row.code, name: row.name, description: row.description, approvedBudgetAmount: row.approvedBudgetAmount, forecastAmount: row.forecastAmount, status: row.status });
    } : undefined} />;
}

type ExpenseRow = Expense & { isNew?: boolean };
export function validateWorkbookExpenseRows(pending: readonly ExpenseRow[], records: ExpensesWorkbookRecords): WorkbookRowIssue[] {
  return pending.flatMap((row) => {
    const issues = ["expenseDate", "description", "amount", "currency"].flatMap((field) => {
      const message = validateExpenseDraftField(field, row[field as keyof Expense]);
      return message ? [{ rowId: row.id, field, message }] : [];
    });
    const reference = validateExpenseDraftReferences(row, records.projects, records.costCodes, row.isNew ? undefined : records.expenses.find((expense) => expense.id === row.id));
    if (reference) issues.push({ rowId: row.id, field: reference.fieldId, message: reference.message });
    if (row.status !== "DRAFT" || row.supplierInvoiceId || row.archivedAt) issues.push({ rowId: row.id, field: "description", message: "Only direct expense drafts can be edited here." });
    return issues;
  });
}
export function WorkbookExpenses({ records, permissions, save, refresh, companyId, onDirtyChange, disabled, demoMode }: {
  records: ExpensesWorkbookRecords; permissions: readonly PermissionKey[]; save?: (expense: Expense) => Promise<void> | void;
  refresh?: () => Promise<ExpensesWorkbookRecords>; companyId?: string; demoMode?: boolean; onDirtyChange: (dirty: boolean) => void; disabled?: boolean;
}) {
  const canReadProjects = hasAllPermissions(permissions, [PERMISSION_KEYS.projectsRead]);
  const columns = useMemo<readonly WorksheetColumn<ExpenseRow>[]>(() => [
    ...([ ["expenseDate", "Date"], ["description", "Description"], ["projectId", "Project"], ["projectCostCodeId", "Cost code"], ["category", "Category"], ["amount", "Amount"], ["currency", "Currency"], ["payee", "Payee"], ["notes", "Notes"] ] as const).filter(([key]) => canReadProjects || !["projectId", "projectCostCodeId"].includes(key)).map(([key, header]): WorksheetColumn<ExpenseRow> => ({
      key, header, mobileSummary: key === "amount", minWidth: key === "description" ? "18rem" : "11rem", kind: key === "amount" ? "number" : key === "expenseDate" ? "date" : ["projectId", "projectCostCodeId", "category"].includes(key) ? "select" : "text",
      editable: (row) => Boolean(save && canEditExpenseWorkbookField(key, row, permissions)),
      value: (row) => readExpenseWorkbookValue(row, key, canReadProjects), setValue: (row, value) => applyExpenseWorkbookDraftValue(row, key, value, records.costCodes),
      options: key === "category" ? EXPENSE_CATEGORIES.map((value) => ({ value, label: value })) : (row) => expenseWorkbookOptionsForField(key, row, records.projects, records.costCodes, canReadProjects),
    })),
    { key: "status", header: "State", mobileSummary: true, protected: true, value: (row) => row.status },
    { key: "sourceLinkage", header: "Source", protected: true, value: (row) => readExpenseWorkbookValue(row, "sourceLinkage", canReadProjects) },
    ...(!canReadProjects ? (["projectId", "projectCostCodeId"] as const).map((key): WorksheetColumn<ExpenseRow> => ({ key, header: key === "projectId" ? "Project" : "Cost code", protected: true, value: (row) => readExpenseWorkbookValue(row, key, false) })) : []),
  ], [canReadProjects, records, save, permissions]);
  return <WorkbookRecordSheet<ExpenseRow> label="Expenses" sourceRows={records.expenses} columns={columns} disabled={disabled} onDirtyChange={onDirtyChange}
    makeRow={save ? () => ({ ...createLocalExpense({ expenseDate: businessDateForTimeZone(), category: "Miscellaneous", description: "", amount: 0, currency: "PHP", status: "DRAFT" }), isNew: true }) : undefined}
    validate={(_all, pending) => validateWorkbookExpenseRows(pending, records)}
    save={save ? async (row, isContextCurrent) => {
      const { isNew, ...expense } = row;
      if (isNew) { await save(expense); return; }
      if (demoMode) {
        const base = records.expenses.find((current) => current.id === row.id);
        if (!base || base.updatedAt !== row.updatedAt) throw new Error("This expense changed. Reload before saving.");
        await save(expense);
      } else await saveExpenseWorkbookRows({ writeMode: "existing-domain", stagedRows: records.expenses.map((current) => current.id === row.id ? expense : current), baseRecords: { ...records, expenses: records.expenses.map((current) => current.id === row.id ? { ...current, updatedAt: row.updatedAt } : current) }, permissions, expectedCompanyId: companyId, refresh, saveExpense: save, isContextCurrent });
    } : undefined} />;
}
