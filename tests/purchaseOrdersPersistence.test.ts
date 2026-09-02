import test from "node:test";
import assert from "node:assert/strict";
import type { PurchaseOrder, Vendor } from "../src/types.ts";
import {
  readPurchaseOrdersFromLocal,
  writePurchaseOrdersToLocal,
  savePurchaseOrder,
  transitionPurchaseOrderStatus,
  deleteDraftPurchaseOrder,
} from "../src/lib/purchaseOrders.ts";
import {
  readVendorsFromLocal,
  writeVendorsToLocal,
  saveVendor,
} from "../src/lib/vendors.ts";

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
}

test("local storage PO persistence reads and writes correctly", () => {
  const storage = createMockStorage();
  const initial = readPurchaseOrdersFromLocal(storage);
  assert.deepEqual(initial, []);

  const po: PurchaseOrder = {
    id: "po-local-1",
    poNumber: "PO-LOCAL-001",
    vendorId: "v-1",
    projectId: "p-1",
    currency: "PHP",
    status: "DRAFT",
    totalAmount: 10000,
    lines: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  writePurchaseOrdersToLocal([po], storage);
  const loaded = readPurchaseOrdersFromLocal(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].poNumber, "PO-LOCAL-001");
});

test("local storage vendor persistence reads and writes correctly", () => {
  const storage = createMockStorage();
  const initial = readVendorsFromLocal(storage);
  assert.deepEqual(initial, []);

  const vendor: Vendor = {
    id: "v-local-1",
    name: "Steel Dynamics",
    normalizedName: "STEEL DYNAMICS",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  writeVendorsToLocal([vendor], storage);
  const loaded = readVendorsFromLocal(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].name, "Steel Dynamics");
});
