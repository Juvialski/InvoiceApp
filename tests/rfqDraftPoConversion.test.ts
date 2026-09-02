import test from "node:test";
import assert from "node:assert/strict";
import type { PurchaseOrder } from "../src/types.ts";
import {
  saveRFQ,
  transitionRFQStatus,
  saveSupplierQuotation,
  convertQuotationToDraftPO,
  clearRFQMemoryStore,
} from "../src/lib/rfqs.ts";
import { readPurchaseOrdersFromLocal } from "../src/lib/purchaseOrders.ts";

const store = new Map<string, string>();
const mockStorage: Storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, String(value));
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => store.clear(),
  key: (index: number) => Array.from(store.keys())[index] ?? null,
  get length() {
    return store.size;
  },
};

Object.defineProperty(globalThis, "localStorage", {
  value: mockStorage,
  writable: true,
  configurable: true,
});

test.beforeEach(() => {
  store.clear();
  clearRFQMemoryStore();
});


test("rfqDraftPoConversion: creates DRAFT PO with rfqId, quotationId, vendor, and project links", async () => {
  const rfq = await saveRFQ(
    {
      rfqNumber: "RFQ-PO-CONV-01",
      title: "Electrical Panels Procurement",
      projectId: "proj-alpha",
      currency: "PHP",
    },
    [
      {
        description: "Main Distribution Panel 400A",
        quantity: 2,
        unit: "sets",
        projectCostCodeId: "cc-elec-panels",
      },
      {
        description: "Branch Circuit Breakers 20A",
        quantity: 50,
        unit: "pcs",
        projectCostCodeId: "cc-elec-breakers",
      },
    ],
  );
  await transitionRFQStatus(rfq.id, "ISSUED");

  const quote = await saveSupplierQuotation(
    {
      rfqId: rfq.id,
      vendorId: "vendor-schneider",
      quotationNumber: "QUO-SCH-001",
      currency: "PHP",
      notes: "Quotation includes delivery to site",
    },
    [
      {
        rfqLineId: rfq.lines![0].id,
        description: "Main Distribution Panel 400A",
        quantity: 2,
        unit: "sets",
        unitPrice: 75_000,
      },
      {
        rfqLineId: rfq.lines![1].id,
        description: "Branch Circuit Breakers 20A",
        quantity: 50,
        unit: "pcs",
        unitPrice: 350,
      },
    ],
  );

  const po = await convertQuotationToDraftPO(
    quote.id,
    "po-2026-conv-01",
    "Special instruction: Expedited shipping requested",
  );

  // CRITICAL: PO must ALWAYS be in DRAFT status!
  assert.equal(po.status, "DRAFT");
  assert.equal(po.poNumber, "PO-2026-CONV-01");
  assert.equal(po.vendorId, "vendor-schneider");
  assert.equal(po.projectId, "proj-alpha");
  assert.equal(po.currency, "PHP");
  assert.equal(po.rfqId, rfq.id);
  assert.equal(po.supplierQuotationId, quote.id);
  assert.equal(po.notes, "Special instruction: Expedited shipping requested");
  assert.equal(
    po.description,
    `Generated from RFQ ${rfq.rfqNumber} / Quotation ${quote.quotationNumber}`,
  );

  // Line items check
  assert.equal(po.lines?.length, 2);
  assert.equal(po.lines?.[0].lineNumber, 1);
  assert.equal(po.lines?.[0].description, "Main Distribution Panel 400A");
  assert.equal(po.lines?.[0].quantity, 2);
  assert.equal(po.lines?.[0].unitPrice, 75_000);
  assert.equal(po.lines?.[0].amount, 150_000);
  // Preserves projectCostCodeId from the RFQ line
  assert.equal(po.lines?.[0].projectCostCodeId, "cc-elec-panels");

  assert.equal(po.lines?.[1].lineNumber, 2);
  assert.equal(po.lines?.[1].quantity, 50);
  assert.equal(po.lines?.[1].unitPrice, 350);
  assert.equal(po.lines?.[1].amount, 17_500);
  assert.equal(po.lines?.[1].projectCostCodeId, "cc-elec-breakers");

  // Total amount = 150,000 + 17,500 = 167,500
  assert.equal(po.totalAmount, 167_500);

  // Saved in purchase orders storage
  const allPos = readPurchaseOrdersFromLocal();
  assert.ok(allPos.some((p) => p.id === po.id));
});

test("rfqDraftPoConversion: skips no-bid lines and zero-quantity lines during conversion", async () => {
  const rfq = await saveRFQ(
    {
      rfqNumber: "RFQ-NOBID-CONV",
      title: "Mixed Scope Procurement",
      projectId: "proj-beta",
      currency: "PHP",
    },
    [
      { description: "Item A (Bid)", quantity: 10, projectCostCodeId: "cc-a" },
      { description: "Item B (No-Bid)", quantity: 5, projectCostCodeId: "cc-b" },
      { description: "Item C (Zero Qty)", quantity: 2, projectCostCodeId: "cc-c" },
    ],
  );
  await transitionRFQStatus(rfq.id, "ISSUED");

  const quote = await saveSupplierQuotation(
    {
      rfqId: rfq.id,
      vendorId: "vendor-mixed",
      quotationNumber: "QUO-MIXED-01",
    },
    [
      {
        rfqLineId: rfq.lines![0].id,
        description: "Item A (Bid)",
        quantity: 10,
        unitPrice: 1_000,
        isNoBid: false,
      },
      {
        rfqLineId: rfq.lines![1].id,
        description: "Item B (No-Bid)",
        quantity: 5,
        unitPrice: 0,
        isNoBid: true, // NO-BID
      },
      {
        rfqLineId: rfq.lines![2].id,
        description: "Item C (Zero Qty)",
        quantity: 0, // ZERO QTY
        unitPrice: 500,
        isNoBid: false,
      },
    ],
  );

  const po = await convertQuotationToDraftPO(quote.id, "PO-FILTERED-01");

  // Only Item A should be converted into PO lines
  assert.equal(po.lines?.length, 1);
  assert.equal(po.lines?.[0].description, "Item A (Bid)");
  assert.equal(po.lines?.[0].quantity, 10);
  assert.equal(po.lines?.[0].amount, 10_000);
  assert.equal(po.totalAmount, 10_000);
});

test("rfqDraftPoConversion: rejects conversion if RFQ has no associated Project", async () => {
  const rfqWithoutProject = await saveRFQ(
    {
      rfqNumber: "RFQ-NOPROJ",
      title: "Preliminary Inquiries",
      projectId: null, // NO PROJECT
      currency: "PHP",
    },
    [{ description: "Heavy Machinery Inquiry", quantity: 1 }],
  );
  await transitionRFQStatus(rfqWithoutProject.id, "ISSUED");

  const quote = await saveSupplierQuotation(
    {
      rfqId: rfqWithoutProject.id,
      vendorId: "vendor-heavy",
      quotationNumber: "QUO-HEAVY-01",
    },
    [{ description: "Heavy Machinery", quantity: 1, unitPrice: 2_000_000 }],
  );

  await assert.rejects(
    async () => {
      await convertQuotationToDraftPO(quote.id, "PO-SHOULD-FAIL");
    },
    /RFQ must be associated with a Project before converting to Purchase Order/i,
  );
});

test("rfqDraftPoConversion: rejects conversion with invalid or empty PO number", async () => {
  const rfq = await saveRFQ(
    {
      rfqNumber: "RFQ-VAL-PO",
      title: "Validation Test",
      projectId: "proj-1",
    },
    [{ description: "Paint 5 Gallons", quantity: 10 }],
  );
  await transitionRFQStatus(rfq.id, "ISSUED");

  const quote = await saveSupplierQuotation(
    {
      rfqId: rfq.id,
      vendorId: "vendor-paint",
      quotationNumber: "QUO-PAINT",
    },
    [{ description: "Paint 5 Gallons", quantity: 10, unitPrice: 2_500 }],
  );

  await assert.rejects(
    async () => {
      await convertQuotationToDraftPO(quote.id, "");
    },
    /Valid PO number is required/i,
  );
});
