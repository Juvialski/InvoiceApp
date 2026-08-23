import test from "node:test";
import assert from "node:assert/strict";
import type { InvoiceData } from "../src/types.ts";
import { cleanupLegacyDemoInvoices, isLegacyDemoInvoice, readAndCleanLocalInvoices } from "../src/utils/demoCleanup.ts";

function invoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    id: "invoice-1",
    sourceType: "UPLOAD",
    invoiceNumber: "REAL-001",
    invoiceDate: "2026-08-23",
    currency: "PHP",
    vendor: { name: "Real Supplier", country: "Philippines" },
    customer: { name: "Real Buyer" },
    items: [],
    subtotal: 100,
    totalTax: 12,
    grandTotal: 112,
    extractedAt: "2026-08-23T00:00:00.000Z",
    modelUsed: "server-model",
    ...overrides,
  };
}

test("legacy demo fingerprints are identified without using currency", () => {
  assert.equal(isLegacyDemoInvoice(invoice({ id: "sample-1", sourceType: "SAMPLE", currency: "USD", modelUsed: "sample-data" })), true);
  assert.equal(isLegacyDemoInvoice(invoice({ sourceType: "SAMPLE", invoiceNumber: "INV-2026-8894", currency: "USD" })), true);
  assert.equal(isLegacyDemoInvoice(invoice({ sourceType: "SAMPLE", vendor: { name: "Apex Wholesale Distributors Ltd." } })), true);
  assert.equal(isLegacyDemoInvoice(invoice({ id: "random-id", sourceType: "SAMPLE", modelUsed: "sample-data", sourceMetadata: { attachmentName: "fictional-demo.txt" } })), true);
  assert.equal(isLegacyDemoInvoice(invoice({ sourceType: "UPLOAD", invoiceNumber: "INV-2026-8894", currency: "USD" })), false);
});

test("cleanup preserves real PHP, USD upload, and USD Gmail invoices", () => {
  const records = [
    invoice({ id: "legacy-cloudtech", sourceType: "SAMPLE", vendor: { name: "CloudTech Solutions Inc." }, currency: "USD" }),
    invoice({ id: "php-upload", sourceType: "UPLOAD", currency: "PHP" }),
    invoice({ id: "usd-upload", sourceType: "UPLOAD", currency: "USD" }),
    invoice({ id: "usd-email", sourceType: "EMAIL", currency: "USD", vendor: { name: "CloudTech Solutions Inc." } }),
  ];
  assert.deepEqual(cleanupLegacyDemoInvoices(records).map((item) => item.id), ["php-upload", "usd-upload", "usd-email"]);
});

test("local cleanup is idempotent and writes the cleaned array", () => {
  let value = JSON.stringify([
    invoice({ id: "sample-2", sourceType: "SAMPLE", currency: "USD", modelUsed: "sample-data" }),
    invoice({ id: "kept", sourceType: "UPLOAD", currency: "USD" }),
  ]);
  const storage = {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
  };
  assert.deepEqual(readAndCleanLocalInvoices(storage).map((item) => item.id), ["kept"]);
  assert.deepEqual(readAndCleanLocalInvoices(storage).map((item) => item.id), ["kept"]);
  assert.deepEqual(JSON.parse(value).map((item: InvoiceData) => item.id), ["kept"]);
});

test("empty or malformed local storage becomes an empty workspace", () => {
  let value = "not-json";
  const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
  assert.deepEqual(readAndCleanLocalInvoices(storage), []);
  assert.equal(value, "[]");

  value = JSON.stringify([null, "not an invoice", invoice({ id: "kept" })]);
  assert.deepEqual(readAndCleanLocalInvoices(storage).map((item) => item.id), ["kept"]);
});
