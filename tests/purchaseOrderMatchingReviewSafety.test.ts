import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { InvoiceData, PurchaseOrder } from "../src/types.ts";
import { evaluatePurchaseOrderMatch, resolvedInvoiceVendorId } from "../src/utils/purchaseOrderMatching.ts";
import { confirmPurchaseOrderMatch } from "../src/lib/purchaseOrderMatches.ts";
import { writePurchaseOrdersToLocal } from "../src/lib/purchaseOrders.ts";
import { clearCompanyContext, setActiveCompanyId } from "../src/lib/companyContext.ts";

function mockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
}

function invoice(): InvoiceData {
  return {
    id: "inv-review-1",
    invoiceNumber: "INV-REVIEW-1",
    invoiceDate: "2026-09-03",
    purchaseOrderNumber: "PO-REVIEW-1",
    currency: "PHP",
    subtotal: 1000,
    totalTax: 0,
    grandTotal: 1000,
    vendor: { name: "Review Supplier", vendorId: "vendor-1" },
    customer: { name: "Engoryx" },
    items: [{ id: "inv-line-1", description: "Materials", quantity: 1, unitPrice: 1000, total: 1000 }],
    extractedAt: "2026-09-03T00:00:00Z",
    modelUsed: "test",
  };
}

function po(): PurchaseOrder {
  return {
    id: "po-review-1",
    companyId: "company-1",
    poNumber: "PO-REVIEW-1",
    vendorId: "vendor-1",
    projectId: "project-1",
    currency: "PHP",
    status: "ISSUED",
    totalAmount: 1000,
    lines: [{
      id: "po-line-1",
      companyId: "company-1",
      purchaseOrderId: "po-review-1",
      lineNumber: 1,
      description: "Materials",
      quantity: 1,
      unit: "lot",
      unitPrice: 1000,
      amount: 1000,
    }],
  };
}

test("purchaseOrderMatchingReviewSafety: nested authoritative vendorId is recognized", () => {
  const inv = invoice();
  const order = po();
  assert.equal(resolvedInvoiceVendorId(inv), "vendor-1");
  const result = evaluatePurchaseOrderMatch(inv, order);
  assert.equal(result.vendorMatch, "EXACT");
  assert.equal(result.isEligibleForConfirmation, true);
});

test("purchaseOrderMatchingReviewSafety: local fallback accepts nested authoritative vendorId", async () => {
  clearCompanyContext();
  setActiveCompanyId("company-1");
  const storage = mockStorage();
  writePurchaseOrdersToLocal([po()], storage);

  const match = await confirmPurchaseOrderMatch({
    invoiceId: "inv-review-1",
    purchaseOrderId: "po-review-1",
    invoice: invoice(),
    purchaseOrder: po(),
    lines: [{
      invoiceLineId: "inv-line-1",
      purchaseOrderLineId: "po-line-1",
      matchedQuantity: 1,
      matchedAmount: 1000,
    }],
    storage,
  });

  assert.equal(match.status, "CONFIRMED");
  assert.equal(match.purchaseOrderId, "po-review-1");
  clearCompanyContext();
});

test("purchaseOrderMatchingReviewSafety: guarded RPCs use definer privileges while direct writes stay closed", () => {
  const baseSql = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20260903100000_purchase_order_invoice_matching.sql"),
    "utf8",
  );
  const hardeningSql = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20260903101000_purchase_order_invoice_matching_rpc_hardening.sql"),
    "utf8",
  );

  assert.match(baseSql, /revoke insert, update, delete on table public\.purchase_order_invoice_matches from public, anon, authenticated/i);
  assert.match(baseSql, /for insert to authenticated with check \(false\)/i);
  assert.match(hardeningSql, /alter function public\.confirm_purchase_order_invoice_match\(uuid, uuid, text, text, jsonb\)\s+security definer/i);
  assert.match(hardeningSql, /alter function public\.unmatch_purchase_order_invoice\(uuid, text\)\s+security definer/i);
  assert.match(hardeningSql, /revoke all on function public\.confirm_purchase_order_invoice_match[\s\S]*from public, anon/i);
  assert.match(hardeningSql, /grant execute on function public\.confirm_purchase_order_invoice_match[\s\S]*to authenticated/i);
});

test("purchaseOrderMatchingReviewSafety: invoice review exposes mutation only with both manage permissions", () => {
  const route = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/routes/InvoicesRoute.tsx"),
    "utf8",
  );
  assert.match(route, /canManageProcurement=\{canManageInvoices && canManageProcurement\}/);
});
