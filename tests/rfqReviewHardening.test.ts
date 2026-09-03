import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const migrationDir = path.resolve(process.cwd(), "supabase/migrations");
const foundation = fs.readFileSync(
  path.join(migrationDir, "20260903120000_rfqs_and_supplier_quotations.sql"),
  "utf8",
);
const integrity = fs.readFileSync(
  path.join(migrationDir, "20260903121000_rfqs_supplier_quotation_integrity_hardening.sql"),
  "utf8",
);
const selectionConsistency = fs.readFileSync(
  path.join(migrationDir, "20260903122000_rfqs_po_selection_consistency.sql"),
  "utf8",
);

test("rfqReviewHardening: case-insensitive quotation number uniqueness uses an expression index", () => {
  assert.doesNotMatch(
    foundation,
    /constraint\s+supplier_quotations_rfq_vendor_num_unique\s+unique\s*\([^;]*lower\s*\(/i,
  );
  assert.match(
    foundation,
    /create\s+unique\s+index\s+if\s+not\s+exists\s+supplier_quotations_rfq_vendor_num_unique[\s\S]*?lower\s*\(quotation_number\)/i,
  );
});

test("rfqReviewHardening: quotation edits cannot move RFQ or Vendor identity", () => {
  assert.match(integrity, /Quotation cannot be moved to another RFQ/i);
  assert.match(integrity, /Quotation Vendor identity is immutable/i);
  assert.match(integrity, /Only SUBMITTED quotations may be edited/i);
});

test("rfqReviewHardening: quotation lines stay inside the authoritative RFQ", () => {
  assert.match(integrity, /maps to an RFQ line outside this RFQ/i);
  assert.match(integrity, /Quotation line must map to a line on the same RFQ and company/i);
  assert.match(integrity, /supplier_quotation_lines_quote_rfq_line_unique/i);
});

test("rfqReviewHardening: cost-code assignment stays on the RFQ Project and active package", () => {
  assert.match(integrity, /RFQ cost code must belong to the same Project and company/i);
  assert.match(integrity, /Archived cost codes cannot receive new RFQ assignments/i);
});

test("rfqReviewHardening: only the selected quotation can create a draft PO", () => {
  assert.match(integrity, /Only the RFQ selected quotation may be converted to a Purchase Order/i);
  assert.match(integrity, /status\s*<>\s*'SELECTED'/i);
  assert.match(integrity, /selected_quotation_id\s+is\s+distinct\s+from\s+v_quote\.id/i);
  assert.match(integrity, /'DRAFT'/i);
  assert.match(integrity, /already has a non-cancelled Purchase Order/i);
});

test("rfqReviewHardening: PO provenance is immutable and cross-domain consistent", () => {
  assert.match(integrity, /Purchase order RFQ\/quotation provenance is immutable/i);
  assert.match(integrity, /must match company and Project/i);
  assert.match(integrity, /does not match RFQ, Vendor, company, and currency/i);
  assert.match(integrity, /purchase_orders_procurement_provenance_guard/i);
});

test("rfqReviewHardening: live PO prevents silent supplier reselection or reversal", () => {
  assert.match(selectionConsistency, /Current supplier selection has a non-cancelled Purchase Order/i);
  assert.match(selectionConsistency, /Selected quotation has a non-cancelled Purchase Order/i);
  assert.match(selectionConsistency, /RFQ has a non-cancelled Purchase Order and cannot be cancelled/i);
});

test("rfqReviewHardening: lifecycle mutations require issued RFQ and auditable reasons", () => {
  assert.match(integrity, /Quotation selection is only allowed while the RFQ is ISSUED/i);
  assert.match(integrity, /Selection reason is required \(at least 3 characters\)/i);
  assert.match(integrity, /Deselection reason is required \(at least 3 characters\)/i);
  assert.match(selectionConsistency, /Revert the selected quotation before cancelling the RFQ/i);
});

test("rfqReviewHardening: authenticated clients have read plus guarded RPC execution only", () => {
  assert.match(integrity, /grant\s+select\s+on\s+table[\s\S]*?to\s+authenticated/i);
  assert.match(integrity, /revoke\s+insert,\s*update,\s*delete\s+on\s+table[\s\S]*?from\s+authenticated,\s*anon/i);
  assert.match(integrity, /revoke\s+all\s+on\s+function\s+public\.convert_quotation_to_draft_po\(uuid,\s*text,\s*text\)\s+from\s+public,\s*anon/i);
  assert.match(integrity, /grant\s+execute\s+on\s+function\s+public\.convert_quotation_to_draft_po\(uuid,\s*text,\s*text\)\s+to\s+authenticated/i);
});
