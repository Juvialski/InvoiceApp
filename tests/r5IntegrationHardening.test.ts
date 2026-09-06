import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decodeBase64Payload, validateInvoiceDocumentBytes } from "../src/lib/fileSecurity.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260906070730_r5_integration_data_contract_hardening.sql", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const invoiceLogic = readFileSync(new URL("../src/utils/invoiceLogic.ts", import.meta.url), "utf8");
const extractionQuality = readFileSync(new URL("../src/utils/extractionQuality.ts", import.meta.url), "utf8");
const vendors = readFileSync(new URL("../src/components/Vendors.tsx", import.meta.url), "utf8");
const securityInventory = readFileSync(new URL("../scripts/database-security-inventory.sql", import.meta.url), "utf8");

test("R5 supplier verification is fail-closed and supplier Expenses are source-locked", () => {
  assert.match(migration, /Resolve the supplier invoice to a canonical Vendor before verification/i);
  assert.match(migration, /unknown is not zero/i);
  assert.match(migration, /Supplier-derived Expense financial and provenance fields are immutable/i);
  assert.match(migration, /expenses_company_receipt_source_active_unique/i);
  assert.doesNotMatch(migration, /coalesce\(v_invoice\.invoice_date,\s*current_date\)/i);
  assert.doesNotMatch(migration, /greatest\(coalesce\(v_invoice\.grand_total/i);
});

test("R5 no longer embeds an implicit VAT rate", () => {
  assert.doesNotMatch(server, /VAT does not reconcile to.*(?:12|0\.12)/i);
  assert.doesNotMatch(invoiceLogic, /PH_VAT_RATE|0\.12|12% of VATable/i);
  assert.doesNotMatch(extractionQuality, /PH_VAT_RATE|0\.12|12% of VATable/i);
  assert.match(invoiceLogic, /VAT rate consistency was not evaluated/i);
});

test("R5 issued-document send uses server-rendered snapshot bytes and durable intent state", () => {
  assert.match(server, /renderTrustedIssuedPdf/);
  assert.match(server, /claim_document_send_intent/);
  assert.match(server, /complete_document_send_intent/);
  assert.doesNotMatch(server, /pdfBase64/);
  assert.match(migration, /status in \('PENDING', 'SENT', 'FAILED', 'UNKNOWN'\)/i);
  assert.match(migration, /trusted_sha256/);
  assert.match(migration, /record_document_send_audit/i);
  assert.match(migration, /revoke insert on table public\.document_send_audits/i);
});

test("R5 Vendor directory consumes canonical Vendor records", () => {
  assert.match(vendors, /canonicalVendors/);
  assert.match(vendors, /Extracted supplier text remains evidence/);
  assert.doesNotMatch(vendors, /invoices\.forEach\(\(invoice\) => \{/);
  assert.match(migration, /create or replace function public\.create_or_update_vendor/i);
  assert.match(migration, /vendors_company_tax_unique/i);
  assert.match(migration, /Vendor has dependent or auditable history/i);
});

test("R5 direct extraction rejects malformed/base64 active content before AI", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7 trusted");
  assert.deepEqual(Array.from(decodeBase64Payload(Buffer.from(pdf).toString("base64"), 1024)), Array.from(pdf));
  assert.throws(() => decodeBase64Payload("not base64 %%", 1024), /valid base64/i);
  assert.throws(() => validateInvoiceDocumentBytes(new TextEncoder().encode("<svg>active</svg>"), "image/svg+xml", "invoice.svg"), /active|valid/i);
  assert.match(server, /decodeBase64Payload/);
  assert.match(server, /validateInvoiceDocumentBytes/);
  assert.match(server, /attachmentCount/);
  assert.match(readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8"), /payload\.fileData && payload\.mimeType/);
});

test("R5 database inventory retains final-catalog security checks", () => {
  for (const term of ["SECURITY DEFINER", "pg_policies", "role_table_grants", "pg_constraint", "pg_trigger", "pg_indexes"]) assert.match(securityInventory, new RegExp(term, "i"));
  assert.match(migration, /invoice_review_events_actor_integrity/i);
  assert.match(migration, /revoke insert, update, delete on table public\.vendors/i);
  assert.match(migration, /revoke all on table public\.document_send_intents/i);
  assert.match(migration, /anonymous Data API grants on company data tables/i);
  assert.match(migration, /private\.assignment_lifecycle_preflight\(uuid, uuid\)/i);
});
