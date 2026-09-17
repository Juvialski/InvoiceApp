import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const procurementControllerPath = new URL(
  "../src/features/procurement/useProcurementController.ts",
  import.meta.url,
);
const procurementController = existsSync(procurementControllerPath)
  ? readFileSync(procurementControllerPath, "utf8")
  : "";
const inventoryEquipmentControllerPath = new URL(
  "../src/features/inventory/useInventoryEquipmentController.ts",
  import.meta.url,
);
const inventoryEquipmentController = existsSync(inventoryEquipmentControllerPath)
  ? readFileSync(inventoryEquipmentControllerPath, "utf8")
  : "";
const cashBankingControllerPath = new URL(
  "../src/features/finance/useCashBankingController.ts",
  import.meta.url,
);
const cashBankingController = existsSync(cashBankingControllerPath)
  ? readFileSync(cashBankingControllerPath, "utf8")
  : "";

test("App composes the procurement controller instead of owning procurement mutations", () => {
  assert.match(appSource, /useProcurementController/);
  assert.doesNotMatch(appSource, /const handleSavePO\s*=|const handleTransitionPO\s*=|const handleSaveSubcontract\s*=/);
  assert.doesNotMatch(appSource, /setPurchaseOrders\(|setSubcontracts\(|setRfqs\(|setSupplierQuotations\(|setVendors\(/);
});

test("procurement controller exposes a narrow workspace contract", () => {
  assert.match(procurementController, /export interface ProcurementController/);
  assert.match(procurementController, /applyWorkspaceData/);
  assert.match(procurementController, /reset/);
  assert.match(procurementController, /savePurchaseOrder/);
  assert.match(procurementController, /transitionSubcontractClaim/);
  assert.match(procurementController, /saveSupplierQuotation/);
  assert.doesNotMatch(procurementController, /useAppController|useEverything|appState/);
});

test("App composes the inventory and equipment controller instead of owning movement mutations", () => {
  assert.match(appSource, /useInventoryEquipmentController/);
  assert.doesNotMatch(appSource, /const handleSaveInventoryItem\s*=|const handleRecordInventoryMovement\s*=|const handleSaveCanonicalEquipment\s*=/);
  assert.doesNotMatch(appSource, /setInventoryItems\(|setInventoryMovements\(|setEquipmentRegistry\(|setEquipmentAssignments\(/);
});

test("inventory and equipment controller exposes a narrow workspace contract", () => {
  assert.match(inventoryEquipmentController, /export interface InventoryEquipmentController/);
  assert.match(inventoryEquipmentController, /applyWorkspaceData/);
  assert.match(inventoryEquipmentController, /recordInventoryMovement/);
  assert.match(inventoryEquipmentController, /setCanonicalEquipmentLifecycle/);
  assert.doesNotMatch(inventoryEquipmentController, /useAppController|useEverything|appState/);
});

test("App composes the cash and banking controller instead of owning reconciliation mutations", () => {
  assert.match(appSource, /useCashBankingController/);
  assert.doesNotMatch(appSource, /const handleSaveFinancialAccount\s*=|const handleSaveFinancialMatch\s*=|const handleReverseFinancialTransfer\s*=/);
  assert.doesNotMatch(appSource, /setCashData\(|cashDataRef/);
});

test("cash and banking controller exposes a narrow workspace contract", () => {
  assert.match(cashBankingController, /export interface CashBankingController/);
  assert.match(cashBankingController, /applyWorkspaceData/);
  assert.match(cashBankingController, /confirmFinancialTransfer/);
  assert.match(cashBankingController, /reverseFinancialSettlement/);
  assert.doesNotMatch(cashBankingController, /useAppController|useEverything|appState/);
});
