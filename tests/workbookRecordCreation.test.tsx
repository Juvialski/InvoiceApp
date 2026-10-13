import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyWorkbookRecordRows, WorkbookChangeReview } from "../src/app/routes/WorkbookRecordSheet.tsx";
import { WorkbookSuppliers, WorkbookWarehouse, validateWorkbookCostRows, validateWorkbookExpenseRows } from "../src/app/routes/WorkbookDomainSheets.tsx";
import { OperationsWorkbookRoute } from "../src/app/routes/OperationsWorkbookRoute.tsx";
import { PERMISSION_KEYS } from "../src/utils/accessControl.ts";
import { buildVendorSavePlan, newVendorWorksheetRow } from "../src/components/VendorMasterWorksheet.tsx";
import { buildWarehouseItemSavePlan, newWarehouseItemWorksheetRow } from "../src/components/inventory/WarehouseItemWorksheet.tsx";
import { createLocalExpense } from "../src/lib/expenses.ts";
import type { Project, ProjectCostCode } from "../src/types.ts";

test("partial creation removes successes before retry and retains only failed rows", async () => {
  const pending = new Map([ ["one", { id: "one", isNew: true }], ["two", { id: "two", isNew: true }] ]);
  const persisted: string[] = [];
  const result = await applyWorkbookRecordRows([...pending.values()], async (row) => {
    if (row.id === "two") throw new Error("Invalid row"); persisted.push(row.id);
  }, () => true, (row) => pending.delete(row.id));
  assert.equal(result.saved, 1);
  assert.equal(result.failures[0].rowId, "two");
  await applyWorkbookRecordRows([...pending.values()], async (row) => { persisted.push(row.id); }, () => true, (row) => pending.delete(row.id));
  assert.deepEqual(persisted, ["one", "two"]);
  assert.equal(pending.size, 0);
});

test("permission/company context invalidation stops the remaining creation batch", async () => {
  let current = true;
  const writes: string[] = [];
  await applyWorkbookRecordRows([{ id: "one" }, { id: "two" }], async (row) => { writes.push(row.id); current = false; }, () => current, () => {});
  assert.deepEqual(writes, ["one"]);
});

test("supplier creation uses canonical validation and existing atomic version preconditions", () => {
  const first = { ...newVendorWorksheetRow(), name: "Sample Supplier" };
  const second = { ...newVendorWorksheetRow(), name: "Sample Supplier" };
  assert.equal(buildVendorSavePlan([first, second], new Set([first.id, second.id])).valid, false);
  assert.equal(buildVendorSavePlan([{ ...first, email: "bad" }], new Set([first.id])).valid, false);
  const current = { ...first, isNew: false, updatedAt: "version-1" };
  assert.equal(buildVendorSavePlan([current], new Set([current.id])).entries[0].input.expectedUpdatedAt, "version-1");
  assert.equal(buildVendorSavePlan([first], new Set([first.id])).entries[0].input.id, undefined);
});

test("warehouse creation never includes balances and existing metadata stays protected", () => {
  const row = { ...newWarehouseItemWorksheetRow(), itemName: "Pipe", itemCode: "PIPE" };
  const plan = buildWarehouseItemSavePlan([row], new Set([row.id]));
  assert.equal(plan.valid, true);
  assert.equal("onHandQuantity" in plan.entries[0].input, false);
  const html = renderToStaticMarkup(<WorkbookWarehouse items={[{ id: "item", itemName: "Pipe", stockUnit: "pcs", status: "ACTIVE" }]} balances={[{ inventoryItemId: "item", itemName: "Pipe", stockUnit: "pcs", status: "ACTIVE", onHandQuantity: 15, openingQuantity: 20, receivedQuantity: 0, issuedQuantity: 5, returnedQuantity: 0, movementCount: 2 }]} save={async () => row} onDirtyChange={() => {}} />);
  assert.match(html, /item:onHandQuantity[^>]*data-worksheet-editable="false"/);
  assert.match(html, /item:itemName[^>]*data-worksheet-editable="false"/);
  assert.match(html, />15</);
});

const project: Project = { id: "project", projectCode: "P", projectName: "Project", projectBudget: 100, currency: "PHP", status: "ACTIVE", createdAt: "v1", updatedAt: "v1" };
test("multiple cost-code proposals enforce aggregate budget, duplicates and authorized parent", () => {
  const first: ProjectCostCode & { isNew: boolean } = { id: "a", projectId: "project", code: "A", name: "A", status: "ACTIVE", approvedBudgetAmount: 60, createdAt: "v1", updatedAt: "v1", isNew: true };
  const second = { ...first, id: "b", code: "B" };
  assert.ok(validateWorkbookCostRows([first, second], [first, second], [project]).some((issue) => /budget/i.test(issue.message)));
  assert.ok(validateWorkbookCostRows([first], [first], []).some((issue) => issue.field === "projectId"));
  assert.ok(validateWorkbookCostRows([first, { ...second, code: "A" }], [first], [project]).some((issue) => /already exists/.test(issue.message)));
});
test("new expenses remain direct DRAFT records and validate projects and ordinary values", () => {
  const expense = { ...createLocalExpense({ expenseDate: "2026-10-13", category: "Fuel", description: "Site fuel", amount: 25, currency: "PHP", status: "DRAFT" }), isNew: true };
  const records = { expenses: [], projects: [project], costCodes: [], invoices: [], vendors: [], purchaseOrders: [] };
  assert.deepEqual(validateWorkbookExpenseRows([expense], records), []);
  assert.ok(validateWorkbookExpenseRows([{ ...expense, projectId: "other-company" }], records).length);
  assert.ok(validateWorkbookExpenseRows([{ ...expense, status: "PAID" }], records).length);
  assert.ok(validateWorkbookExpenseRows([{ ...expense, amount: Number.NaN }], records).length);
});
test("new sheet data and creation controls require their own domain permissions", () => {
  const supplier = { ...newVendorWorksheetRow(), name: "PRIVATE-SUPPLIER", isNew: false };
  const html = renderToStaticMarkup(<OperationsWorkbookRoute projects={[]} vendors={[supplier]} inventoryItems={[]} permissions={[PERMISSION_KEYS.projectsRead]} search="?sheet=vendors" onSaveVendor={async () => supplier} />);
  assert.doesNotMatch(html, /PRIVATE-SUPPLIER|Suppliers worksheet/);
  const read = renderToStaticMarkup(<WorkbookSuppliers vendors={[supplier]} onDirtyChange={() => {}} />);
  assert.doesNotMatch(read, /Add row|Save changes/);
  const loading = renderToStaticMarkup(<WorkbookSuppliers vendors={[supplier]} disabled onDirtyChange={() => {}} />);
  assert.doesNotMatch(loading, /PRIVATE-SUPPLIER/);
  assert.match(loading, /Loading worksheet records/);
});

test("review renders ordinary fields whose optional reference resolver returns no options", () => {
  const html = renderToStaticMarkup(<WorkbookChangeReview sourceRows={[]} review={[{ id: "draft", isNew: true, description: "Site fuel" }]} columns={[{ key: "description", header: "Description", value: (row) => row.description, setValue: (row) => row, options: () => undefined }]} saving={false} onClose={() => {}} onConfirm={() => {}} />);
  assert.match(html, /Site fuel/);
});
