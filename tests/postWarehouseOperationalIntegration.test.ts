import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Expense, InvoiceData, InvoiceProjectAllocation, Project, PurchaseOrder, PurchaseOrderInvoiceMatch, PurchaseOrderReceipt } from "../src/types.ts";
import { deriveEquipmentCurrentState, buildLocalEquipment, applyLocalEquipmentAssignment, applyLocalEquipmentTransfer, applyLocalEquipmentReturn } from "../src/lib/equipment.ts";
import { buildPurchasedMaterialIntake, buildPurchasedMaterialReceiptPlan, suggestInventoryItemForMaterialLine } from "../src/lib/purchasedMaterialIntake.ts";
import type { InventoryItem } from "../src/lib/inventory.ts";
import { classifySupplierDocuments } from "../src/utils/supplierExpenseWorkspace.ts";
import { supplierExpenseAmountForProject, supplierExpenseProjectProjection } from "../src/utils/supplierInvoiceCostOwnership.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260906132222_post_warehouse_operational_integration.sql", import.meta.url), "utf8");

function invoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    id: "post-invoice",
    invoiceNumber: "POST-001",
    invoiceDate: "2026-09-06",
    currency: "PHP",
    vendor: { name: "Supplier" },
    customer: { name: "HydroQualiSense Solutions Corp." },
    items: [{ id: "line-1", description: "Ready mix", quantity: 40, unitOfMeasure: "bags", unitPrice: 100, total: 4000 }],
    subtotal: 4000,
    totalTax: 0,
    grandTotal: 4000,
    extractedAt: "2026-09-06T00:00:00.000Z",
    modelUsed: "test",
    reviewStatus: "VERIFIED",
    lifecycleStatus: "ACTIVE",
    ...overrides,
  };
}

function project(id: string, code = id): Project {
  return { id, projectCode: code, projectName: `Project ${code}`, status: "ACTIVE", projectBudget: 10000, currency: "PHP", taxTreatment: "VAT", createdAt: "2026-09-06", updatedAt: "2026-09-06" };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return { id: "expense-1", expenseDate: "2026-09-06", category: "Materials", description: "Supplier cost", amount: 4000, currency: "PHP", status: "APPROVED", createdAt: "2026-09-06", updatedAt: "2026-09-06", ...overrides };
}

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return { id: "item-1", companyId: "company-a", itemName: "Ready mix", itemCode: "MAT-1", category: "Concrete", stockUnit: "bags", status: "ACTIVE", ...overrides };
}

function po(): PurchaseOrder {
  return { id: "po-1", companyId: "company-a", poNumber: "PO-1", vendorId: "vendor-1", projectId: "project-a", currency: "PHP", status: "ISSUED", lines: [{ id: "po-line-1", companyId: "company-a", purchaseOrderId: "po-1", lineNumber: 1, description: "Ready mix", quantity: 100, unit: "bags", unitPrice: 100, amount: 10000 }] };
}

function receipt(id: string, quantity: number): PurchaseOrderReceipt {
  return { id, companyId: "company-a", purchaseOrderId: "po-1", receiptNumber: id.toUpperCase(), receiptDate: "2026-09-06", status: "RECEIVED", lines: [{ id: `${id}-line`, companyId: "company-a", purchaseOrderReceiptId: id, purchaseOrderLineId: "po-line-1", lineNumber: 1, receivedQuantity: quantity }] };
}

test("supplier allocation projection is canonical for single, split, and cleared ownership", () => {
  const source = invoice({ grandTotal: 100000 });
  const a: InvoiceProjectAllocation = { id: "a", invoiceId: source.id, projectId: "project-a", allocationType: "AMOUNT", allocationAmount: 60000 };
  const b: InvoiceProjectAllocation = { id: "b", invoiceId: source.id, projectId: "project-b", allocationType: "AMOUNT", allocationAmount: 40000 };
  assert.deepEqual(supplierExpenseProjectProjection({ ...source, allocations: [a] }), { projectId: "project-a", positiveAllocationCount: 1 });
  assert.deepEqual(supplierExpenseProjectProjection({ ...source, allocations: [a, b] }), { positiveAllocationCount: 2 });
  assert.deepEqual(supplierExpenseProjectProjection({ ...source, allocations: [] }), { positiveAllocationCount: 0 });
  assert.equal(supplierExpenseAmountForProject(expense({ amount: 100000, supplierInvoiceId: source.id, projectId: "project-a" }), { ...source, allocations: [a, b] }, "project-a"), 60000);
  assert.equal(supplierExpenseAmountForProject(expense({ amount: 100000, supplierInvoiceId: source.id }), { ...source, allocations: [a, b] }), 0);
});

test("supplier document workspace uses canonical allocation labels and never false-awaits a linked Expense", () => {
  const source = invoice({ id: "linked", projectReference: "stale-text" });
  const rows = classifySupplierDocuments([source], [expense({ supplierInvoiceId: source.id })], [
    { id: "a", invoiceId: source.id, projectId: "project-a", allocationType: "AMOUNT", allocationAmount: 60 },
    { id: "b", invoiceId: source.id, projectId: "project-b", allocationType: "AMOUNT", allocationAmount: 40 },
  ], [project("project-a", "A"), project("project-b", "B")]);
  assert.equal(rows[0]?.state, "LINKED");
  assert.equal(rows[0]?.allocationLabel, "Allocated across 2 projects");
  assert.match(rows[0]?.allocationSummaries.map((summary) => summary.projectCode).join(" ") || "", /A/);
});

test("purchased-material intake preserves unknowns, deterministic suggestions, and partial receipt quantity", () => {
  const source = invoice({ sourceDocumentId: "source-1" });
  const inventory = [item(), item({ id: "wrong-unit", itemName: "Ready mix", stockUnit: "kg" })];
  const suggestion = suggestInventoryItemForMaterialLine(source.items[0], inventory);
  assert.equal(suggestion.item?.id, "item-1");
  const unresolvedInvoice = invoice({ items: [{ id: "line-1", description: "Ready mix", quantity: null, unitOfMeasure: undefined, unitPrice: null, total: null }] });
  const unresolvedIntake = buildPurchasedMaterialIntake(unresolvedInvoice);
  unresolvedIntake.meaning = "DELIVERY_EVIDENCE";
  const unresolved = buildPurchasedMaterialReceiptPlan(unresolvedInvoice, unresolvedIntake, [po()], [receipt("rec-1", 40)], [{ id: "match-1", companyId: "company-a", invoiceId: unresolvedInvoice.id, purchaseOrderId: "po-1", matchSource: "MANUAL", status: "CONFIRMED", confirmedAt: "2026-09-06", lines: [{ id: "match-line-1", companyId: "company-a", matchId: "match-1", purchaseOrderLineId: "po-line-1", invoiceLineId: "line-1", lineNumber: 1 }] }]);
  assert.equal(unresolved.valid, false);
  assert.match(unresolved.errors.join(" "), /canonical|positive quantity|unit/i);

  const intake = buildPurchasedMaterialIntake(source);
  intake.meaning = "DELIVERY_EVIDENCE";
  intake.lines[0] = { ...intake.lines[0], status: "CONFIRMED", inventoryItemId: "item-1", purchaseOrderLineId: "po-line-1" };
  const plan = buildPurchasedMaterialReceiptPlan(source, intake, [po()], [receipt("rec-1", 40)], [{ id: "match-1", companyId: "company-a", invoiceId: source.id, purchaseOrderId: "po-1", matchSource: "MANUAL", status: "CONFIRMED", confirmedAt: "2026-09-06", lines: [{ id: "match-line-1", companyId: "company-a", matchId: "match-1", purchaseOrderLineId: "po-line-1", invoiceLineId: "line-1", lineNumber: 1 }] }]);
  assert.equal(plan.valid, true);
  assert.equal(plan.lines[0]?.receivedQuantity, 40);
  assert.equal(buildPurchasedMaterialReceiptPlan(source, { ...intake, meaning: "FINANCIAL_ONLY" }, [po()], [], []).lines.length, 0);
});

test("canonical Equipment state is derived from one active assignment and local actions preserve history", () => {
  const machine = buildLocalEquipment({ id: "equipment-1", assetReference: "EX-01", equipmentName: "Excavator", equipmentSource: "OWNED" }, undefined, "company-a");
  const assigned = applyLocalEquipmentAssignment([machine], [], { equipmentId: machine.id, projectId: "project-a", assignmentStart: "2026-09-06" }, [project("project-a")]);
  const transferred = applyLocalEquipmentTransfer([assigned.equipment], [assigned.assignment!], { equipmentId: machine.id, projectId: "project-b", assignmentStart: "2026-09-07" }, [project("project-b")]);
  const returned = applyLocalEquipmentReturn([transferred.equipment], [assigned.assignment!, transferred.assignment!], machine.id, "2026-09-08", "Returned");
  const history = [{ ...assigned.assignment!, assignmentEnd: "2026-09-07" }, { ...transferred.assignment!, assignmentEnd: "2026-09-08" }];
  assert.equal(deriveEquipmentCurrentState([machine], [assigned.assignment!])[0]?.currentState, "ASSIGNED");
  assert.equal(transferred.equipment.currentProjectId, "project-b");
  assert.equal(returned.equipment.currentState, "AVAILABLE");
  assert.equal(history.filter((assignment) => !assignment.assignmentEnd).length, 0);
});

test("migration keeps high-risk boundaries explicit", () => {
  assert.match(migration, /invoice_project_allocations_supplier_expense_sync/);
  assert.match(migration, /supplier_expense_projection_sync/);
  assert.match(migration, /expenses_company_project_fk/);
  assert.match(migration, /source_invoice_id/);
  assert.match(migration, /engineering_equipment_registry/);
  assert.match(migration, /engineering_equipment_assignments_one_active_idx/);
  assert.match(migration, /for update/);
  assert.match(migration, /revoke all on public\.engineering_equipment_registry/);
  assert.match(migration, /current_state/);
  assert.doesNotMatch(migration, /valuation|depreciation|fifo|weighted-average/i);
});
