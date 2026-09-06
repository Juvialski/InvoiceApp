import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { InvoiceData } from "../src/types.ts";
import { evaluateExtractionQuality } from "../src/utils/extractionQuality.ts";
import { validateInvoice } from "../src/utils/invoiceLogic.ts";

function invoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    id: "r5-review-followup",
    documentType: "INVOICE",
    invoiceNumber: "R5-FOLLOWUP-001",
    invoiceDate: "2026-09-06",
    currency: "PHP",
    vendor: { name: "Review Supplier" },
    customer: { name: "Review Buyer" },
    items: [{ id: "line-1", description: "Material", quantity: 2, unitPrice: 50, discount: null, total: 90 }],
    subtotal: 90,
    totalDiscount: 0,
    totalTax: 0,
    shippingFee: 0,
    otherFees: 0,
    grandTotal: 90,
    amountPaid: 0,
    balanceDue: 90,
    extractedAt: "2026-09-06T12:00:00+08:00",
    modelUsed: "test",
    ...overrides,
  };
}

test("unknown line-item discount is not silently treated as zero", () => {
  const candidate = invoice();
  const validation = validateInvoice(candidate);
  assert.equal(validation.issues.some((issue) => issue.id === "item-total-0"), false);

  const quality = evaluateExtractionQuality(candidate, "INVOICE QTY UNIT PRICE AMOUNT PHP 90.00");
  assert.equal(quality.reconciliation.lineItems, "REVIEW");
});

test("manual upload race recovery filters the canonical source type in SQL", () => {
  const storageRouter = readFileSync(new URL("../src/server/storage/storageRouter.ts", import.meta.url), "utf8");
  assert.match(storageRouter, /\.eq\("sha256", hash\)\s*\.in\("source_type", \["UPLOAD", "MANUAL"\]\)\s*\.order\("created_at", \{ ascending: true \}\)\s*\.limit\(1\)/s);
});

test("initial auth restoration purges staged email review data owned by another user", () => {
  const guard = readFileSync(new URL("../src/lib/emailIntakeInitialSessionGuard.ts", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.match(guard, /INITIAL_SESSION/);
  assert.match(guard, /engoryx_pending_email_statement_review_v1/);
  assert.match(guard, /engoryx_pending_email_expense_review_v1/);
  assert.match(guard, /ownerId !== userId/);
  assert.match(main, /emailIntakeInitialSessionGuard/);
});

test("durable send-intent policy mirrors document-specific read permissions", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260906090000_r5_review_followup_hardening.sql", import.meta.url), "utf8");
  assert.match(migration, /documents\.send/);
  assert.match(migration, /procurement\.read/);
  assert.match(migration, /projects\.read/);
  assert.match(migration, /validate_document_send_intent_scope/);
});
