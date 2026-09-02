import test from "node:test";
import assert from "node:assert/strict";
import type { RFQ, SupplierQuotation } from "../src/types.ts";
import {
  saveRFQ,
  transitionRFQStatus,
  saveSupplierQuotation,
  selectSupplierQuotation,
  revertSupplierQuotationSelection,
  fetchRFQ,
  fetchSupplierQuotation,
  clearRFQMemoryStore,
} from "../src/lib/rfqs.ts";

test.beforeEach(() => {
  clearRFQMemoryStore();
});

test("rfqSelectionAudit: records human selection with timestamp and reason", async () => {
  const rfq = await saveRFQ(
    { rfqNumber: "RFQ-SELECT-01", title: "HVAC Procurement" },
    [{ description: "Chiller Unit", quantity: 2 }],
  );
  await transitionRFQStatus(rfq.id, "ISSUED");

  const quote = await saveSupplierQuotation(
    {
      rfqId: rfq.id,
      vendorId: "vendor-chiller",
      quotationNumber: "QUO-CHILLER-01",
      currency: "PHP",
    },
    [{ description: "Chiller Unit", quantity: 2, unitPrice: 250_000 }],
  );

  assert.equal(quote.status, "SUBMITTED");
  assert.equal(quote.selectedAt, null);

  const selected = await selectSupplierQuotation(
    quote.id,
    "Best warranty terms and local parts availability",
  );

  assert.equal(selected.status, "SELECTED");
  assert.ok(selected.selectedAt);
  assert.equal(selected.selectionReason, "Best warranty terms and local parts availability");

  // RFQ header must point to selected quotation
  const updatedRfq = await fetchRFQ(rfq.id);
  assert.equal(updatedRfq?.selectedQuotationId, quote.id);
});

test("rfqSelectionAudit: enforces multi-quote mutual exclusivity with audit trail", async () => {
  const rfq = await saveRFQ(
    { rfqNumber: "RFQ-MULTI-SELECT", title: "Generator Supply" },
    [{ description: "500kVA Generator", quantity: 1 }],
  );
  await transitionRFQStatus(rfq.id, "ISSUED");

  const quoteA = await saveSupplierQuotation(
    {
      rfqId: rfq.id,
      vendorId: "vendor-a",
      quotationNumber: "QUO-GEN-A",
      currency: "PHP",
    },
    [{ description: "500kVA Generator", quantity: 1, unitPrice: 1_200_000 }],
  );

  const quoteB = await saveSupplierQuotation(
    {
      rfqId: rfq.id,
      vendorId: "vendor-b",
      quotationNumber: "QUO-GEN-B",
      currency: "PHP",
    },
    [{ description: "500kVA Generator", quantity: 1, unitPrice: 1_150_000 }],
  );

  // First select Quote A
  await selectSupplierQuotation(quoteA.id, "Initial selection based on brand reputation");

  let fetchedA = await fetchSupplierQuotation(quoteA.id);
  assert.equal(fetchedA?.status, "SELECTED");
  let rfqState = await fetchRFQ(rfq.id);
  assert.equal(rfqState?.selectedQuotationId, quoteA.id);

  // Now select Quote B (replaces Quote A)
  await selectSupplierQuotation(quoteB.id, "Vendor B offered discount on fuel tank package");

  // Quote A must now be SUBMITTED with deselection audit
  fetchedA = await fetchSupplierQuotation(quoteA.id);
  assert.equal(fetchedA?.status, "SUBMITTED");
  assert.ok(fetchedA?.deselectedAt);
  assert.equal(
    fetchedA?.deselectionReason,
    "Replaced by selection of quotation QUO-GEN-B",
  );

  // Quote B must now be SELECTED
  const fetchedB = await fetchSupplierQuotation(quoteB.id);
  assert.equal(fetchedB?.status, "SELECTED");
  assert.ok(fetchedB?.selectedAt);
  assert.equal(
    fetchedB?.selectionReason,
    "Vendor B offered discount on fuel tank package",
  );

  // RFQ header pointer must be Quote B
  rfqState = await fetchRFQ(rfq.id);
  assert.equal(rfqState?.selectedQuotationId, quoteB.id);
});

test("rfqSelectionAudit: reverts quotation selection and audits deselection", async () => {
  const rfq = await saveRFQ(
    { rfqNumber: "RFQ-REVERT-01", title: "Pumps Revert Test" },
    [{ description: "Submersible Pump", quantity: 4 }],
  );
  await transitionRFQStatus(rfq.id, "ISSUED");

  const quote = await saveSupplierQuotation(
    {
      rfqId: rfq.id,
      vendorId: "vendor-pumps",
      quotationNumber: "QUO-PUMP-01",
    },
    [{ description: "Submersible Pump", quantity: 4, unitPrice: 35_000 }],
  );

  await selectSupplierQuotation(quote.id, "Lowest price bid");

  // Revert selection
  const revertedRfq = await revertSupplierQuotationSelection(
    rfq.id,
    "Project scope reduced; retendering required",
  );

  assert.equal(revertedRfq.selectedQuotationId, null);

  const fetchedQuote = await fetchSupplierQuotation(quote.id);
  assert.equal(fetchedQuote?.status, "SUBMITTED");
  assert.ok(fetchedQuote?.deselectedAt);
  assert.equal(
    fetchedQuote?.deselectionReason,
    "Project scope reduced; retendering required",
  );
});

test("rfqSelectionAudit: rejects selection on cancelled RFQs", async () => {
  const rfq = await saveRFQ(
    { rfqNumber: "RFQ-CANCELLED-SEL", title: "Cancelled RFQ Test" },
    [{ description: "Lighting Fixtures", quantity: 100 }],
  );
  const quote = await saveSupplierQuotation(
    {
      rfqId: rfq.id,
      vendorId: "vendor-lights",
      quotationNumber: "QUO-LIGHTS",
    },
    [{ description: "Lighting Fixtures", quantity: 100, unitPrice: 500 }],
  );

  // Cancel the RFQ
  await transitionRFQStatus(rfq.id, "CANCELLED", "Cancelled due to client request");

  await assert.rejects(
    async () => {
      await selectSupplierQuotation(quote.id, "Attempted select");
    },
    /Cannot select quotation for cancelled RFQ/i,
  );
});
