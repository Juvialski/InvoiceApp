import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNavigationModel, getPrimaryModuleForRoute } from "../src/navigation/navigationModel.ts";
import { PERMISSION_KEYS } from "../src/utils/accessControl.ts";

const expenses = readFileSync(new URL("../src/components/expenses/ExpensesPage.tsx", import.meta.url), "utf8");
const cash = readFileSync(new URL("../src/components/CashSettlementAllocationWorkspace.tsx", import.meta.url), "utf8");
const procurement = readFileSync(new URL("../src/components/procurement/ProcurementPage.tsx", import.meta.url), "utf8");
const warehouse = readFileSync(new URL("../src/components/inventory/WarehouseInventoryPage.tsx", import.meta.url), "utf8");
const warehouseRoute = readFileSync(new URL("../src/app/routes/WarehouseInventoryRoute.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/app/AppShell.tsx", import.meta.url), "utf8");

test("Wave 2 navigation exposes the authoritative supplier invoice register without duplicating Expenses", () => {
  const model = getNavigationModel({ permissions: [PERMISSION_KEYS.invoicesRead, PERMISSION_KEYS.expensesRead] });
  assert.equal(getPrimaryModuleForRoute("invoices")?.id, "invoices");
  assert.deepEqual(model.modules.find((module) => module.id === "invoices")?.routeIds, ["invoices", "extract", "review", "vendors"]);
  assert.deepEqual(model.modules.find((module) => module.id === "expenses")?.routeIds, ["expenses"]);
});

test("Wave 2 source and continuation surfaces use exact persisted identifiers", () => {
  assert.match(expenses, /appPathForPurchaseOrder/);
  assert.match(expenses, /Open Purchase Order/);
  assert.match(expenses, /Supplier invoice/);
  assert.match(cash, /Return to Expense/);
  assert.match(procurement, /Continue to Warehouse/);
  assert.match(procurement, /appPathForWarehouseReceipt/);
  assert.match(warehouse, /appPathForPurchaseOrderReceipt/);
  assert.match(warehouse, /MovementSourceCell/);
});

test("Wave 2 Warehouse source navigation does not expose Procurement links without procurement.read", () => {
  assert.match(warehouseRoute, /canReadProcurement\s*\?\s*movements/);
  assert.match(warehouseRoute, /sourcePurchaseOrderId:\s*null/);
  assert.match(warehouseRoute, /movements=\{warehouseMovements\}/);
});

test("Wave 2 stale-link recovery copy stays domain-aware and does not expose alternate records", () => {
  assert.match(shell, /routeRecovery\?\.title/);
  assert.match(shell, /routeRecovery\?\.description/);
  assert.match(shell, /routeRecovery\?\.actionLabel/);
});
