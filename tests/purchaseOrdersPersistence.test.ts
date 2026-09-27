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
import { clearCompanyContext, getActiveCompanyId, setActiveCompanyId } from "../src/lib/companyContext.ts";

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

test("header-only local Purchase Order save preserves existing line identities and versions", async () => {
  const storage = createMockStorage();
  const previousCompanyId = getActiveCompanyId();
  const previousStorage = (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  clearCompanyContext();
  setActiveCompanyId("company-header-only");
  try {
    const po: PurchaseOrder = {
      id: "po-header-only",
      companyId: "company-header-only",
      poNumber: "PO-HEADER-ONLY",
      vendorId: "vendor-1",
      projectId: "project-1",
      currency: "PHP",
      status: "DRAFT",
      description: "Original description",
      totalAmount: 25,
      lines: [{
        id: "po-line-header-only",
        companyId: "company-header-only",
        purchaseOrderId: "po-header-only",
        lineNumber: 1,
        description: "Preserved line",
        quantity: 2,
        unit: "pcs",
        unitPrice: 12.5,
        amount: 25,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
    };
    writePurchaseOrdersToLocal([po], storage);
    const saved = await savePurchaseOrder(
      { ...po, description: "Updated description" },
      po.lines || [],
      po.updatedAt,
      true,
    );

    assert.equal(saved.description, "Updated description");
    assert.equal(saved.totalAmount, 25);
    assert.equal(saved.lines?.[0]?.id, "po-line-header-only");
    assert.equal(saved.lines?.[0]?.createdAt, "2026-01-01T00:00:00.000Z");
    assert.equal(saved.lines?.[0]?.updatedAt, "2026-01-01T00:00:00.000Z");
  } finally {
    clearCompanyContext();
    if (previousCompanyId) setActiveCompanyId(previousCompanyId);
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previousStorage });
    else delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
  }
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
