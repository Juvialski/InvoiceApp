import test from "node:test";
import assert from "node:assert/strict";
import type { RFQ, RFQLine, SupplierQuotation } from "../src/types.ts";
import {
  saveRFQ,
  transitionRFQStatus,
  deleteDraftRFQ,
  fetchRFQ,
  fetchRFQs,
  saveSupplierQuotation,
  clearRFQMemoryStore,
  rfqFromRow,
  rfqLineFromRow,
} from "../src/lib/rfqs.ts";

test.beforeEach(() => {
  clearRFQMemoryStore();
});

test("rfqDomain: creates draft RFQ with lines and invited vendors", async () => {
  const rfq = await saveRFQ(
    {
      rfqNumber: "rfq-2026-001",
      title: "Structural Steel Supply",
      description: "Structural steel procurement for Phase 1",
      projectId: "proj-1",
      currency: "PHP",
    },
    [
      { description: "W12x26 Steel Beam", quantity: 50, unit: "pcs" },
      { description: "Anchor Bolts 20mm", quantity: 200, unit: "pcs" },
    ],
    ["vendor-a", "vendor-b"],
  );

  assert.equal(rfq.rfqNumber, "RFQ-2026-001");
  assert.equal(rfq.status, "DRAFT");
  assert.equal(rfq.lines?.length, 2);
  assert.equal(rfq.lines?.[0].lineNumber, 1);
  assert.equal(rfq.lines?.[0].description, "W12x26 Steel Beam");
  assert.equal(rfq.lines?.[1].lineNumber, 2);
  assert.equal(rfq.lines?.[1].quantity, 200);
  assert.deepEqual(rfq.invitedVendorIds, ["vendor-a", "vendor-b"]);
  assert.equal(rfq.invitedVendors?.length, 2);
});

test("rfqDomain: preserves line item ordering strictly as 1..N", async () => {
  const rfq = await saveRFQ(
    {
      rfqNumber: "rfq-lines-order",
      title: "Material Ordering Check",
    },
    [
      { description: "Item 1", quantity: 10 },
      { description: "Item 2", quantity: 20 },
      { description: "Item 3", quantity: 30 },
    ],
  );

  assert.equal(rfq.lines?.length, 3);
  assert.equal(rfq.lines?.[0].lineNumber, 1);
  assert.equal(rfq.lines?.[1].lineNumber, 2);
  assert.equal(rfq.lines?.[2].lineNumber, 3);
});

test("rfqDomain: validates required header and line fields on save", async () => {
  await assert.rejects(
    async () => {
      await saveRFQ({ rfqNumber: "", title: "Valid Title" }, []);
    },
    /Valid RFQ number is required/i,
  );

  await assert.rejects(
    async () => {
      await saveRFQ({ rfqNumber: "RFQ-1", title: "" }, []);
    },
    /Valid RFQ title is required/i,
  );

  await assert.rejects(
    async () => {
      await saveRFQ({ rfqNumber: "RFQ-1", title: "Title", currency: "TOOLONG" }, []);
    },
    /Currency must be a 3-letter ISO code/i,
  );

  await assert.rejects(
    async () => {
      await saveRFQ(
        { rfqNumber: "RFQ-1", title: "Title" },
        [{ description: "", quantity: 10 }],
      );
    },
    /Line 1 description is required/i,
  );

  await assert.rejects(
    async () => {
      await saveRFQ(
        { rfqNumber: "RFQ-1", title: "Title" },
        [{ description: "Rebar", quantity: 0 }],
      );
    },
    /Line 1 quantity must be positive/i,
  );
});

test("rfqDomain: transitions through full lifecycle DRAFT -> ISSUED -> CLOSED", async () => {
  const rfq = await saveRFQ(
    { rfqNumber: "rfq-lifecycle-01", title: "Lifecycle Test" },
    [{ description: "Rebar 16mm", quantity: 100 }],
  );

  assert.equal(rfq.status, "DRAFT");

  // DRAFT -> ISSUED
  const issued = await transitionRFQStatus(rfq.id, "ISSUED");
  assert.equal(issued.status, "ISSUED");
  assert.ok(issued.issuedAt);
  assert.ok(issued.issueDate);

  // ISSUED -> CLOSED
  const closed = await transitionRFQStatus(rfq.id, "CLOSED");
  assert.equal(closed.status, "CLOSED");
  assert.ok(closed.closedAt);
});

test("rfqDomain: cancels RFQ with required reason from DRAFT and ISSUED", async () => {
  // Cancel from DRAFT
  const rfqDraft = await saveRFQ(
    { rfqNumber: "rfq-cancel-draft", title: "Cancel Draft Test" },
    [{ description: "Cement", quantity: 50 }],
  );
  const cancelledDraft = await transitionRFQStatus(rfqDraft.id, "CANCELLED", "Project postponed");
  assert.equal(cancelledDraft.status, "CANCELLED");
  assert.equal(cancelledDraft.cancellationReason, "Project postponed");
  assert.ok(cancelledDraft.cancelledAt);

  // Cancel from ISSUED
  const rfqIssued = await saveRFQ(
    { rfqNumber: "rfq-cancel-issued", title: "Cancel Issued Test" },
    [{ description: "Plywood", quantity: 30 }],
  );
  await transitionRFQStatus(rfqIssued.id, "ISSUED");
  const cancelledIssued = await transitionRFQStatus(rfqIssued.id, "CANCELLED", "Design revision");
  assert.equal(cancelledIssued.status, "CANCELLED");
  assert.equal(cancelledIssued.cancellationReason, "Design revision");
});

test("rfqDomain: guards against editing non-draft RFQs", async () => {
  const rfq = await saveRFQ(
    { rfqNumber: "rfq-locked", title: "Immutable Once Issued" },
    [{ description: "Gravel", quantity: 10 }],
  );
  await transitionRFQStatus(rfq.id, "ISSUED");

  await assert.rejects(
    async () => {
      await saveRFQ(
        { id: rfq.id, rfqNumber: "rfq-locked", title: "Attempted Title Edit" },
        [{ description: "Gravel", quantity: 20 }],
      );
    },
    /Only draft RFQs may be modified/i,
  );
});

test("rfqDomain: rejects invalid lifecycle status transitions", async () => {
  const rfq = await saveRFQ(
    { rfqNumber: "rfq-invalid-trans", title: "Invalid Transitions" },
    [{ description: "Sand", quantity: 15 }],
  );

  // DRAFT -> CLOSED directly must fail
  await assert.rejects(
    async () => {
      await transitionRFQStatus(rfq.id, "CLOSED");
    },
    /Only issued RFQs may be closed/i,
  );

  // CANCELLED without reason must fail
  await assert.rejects(
    async () => {
      await transitionRFQStatus(rfq.id, "CANCELLED", "");
    },
    /Cancellation reason is required/i,
  );

  // Cancel with reason < 3 chars must fail
  await assert.rejects(
    async () => {
      await transitionRFQStatus(rfq.id, "CANCELLED", "no");
    },
    /Cancellation reason is required/i,
  );

  // Cannot issue RFQ with 0 lines
  const emptyRfq = await saveRFQ(
    { rfqNumber: "rfq-empty", title: "Empty RFQ" },
    [],
  );
  await assert.rejects(
    async () => {
      await transitionRFQStatus(emptyRfq.id, "ISSUED");
    },
    /Cannot issue an RFQ without line items/i,
  );

  // CLOSED RFQ cannot undergo further transitions
  await transitionRFQStatus(rfq.id, "ISSUED");
  await transitionRFQStatus(rfq.id, "CLOSED");
  await assert.rejects(
    async () => {
      await transitionRFQStatus(rfq.id, "CANCELLED", "Too late");
    },
    /Closed or cancelled RFQs cannot undergo further transitions/i,
  );
});

test("rfqDomain: deleteDraftRFQ deletes draft RFQ, but rejects deletion of issued or quoted RFQs", async () => {
  const draftRfq = await saveRFQ(
    { rfqNumber: "rfq-to-delete", title: "Deletable RFQ" },
    [{ description: "Scaffolding", quantity: 5 }],
  );

  // Successfully deletes draft
  await deleteDraftRFQ(draftRfq.id);
  const found = await fetchRFQ(draftRfq.id);
  assert.equal(found, null);

  // Cannot delete issued RFQ
  const issuedRfq = await saveRFQ(
    { rfqNumber: "rfq-issued-nodelete", title: "Issued RFQ" },
    [{ description: "Pipes", quantity: 10 }],
  );
  await transitionRFQStatus(issuedRfq.id, "ISSUED");
  await assert.rejects(
    async () => {
      await deleteDraftRFQ(issuedRfq.id);
    },
    /Only draft RFQs may be deleted/i,
  );

  // Cannot delete draft RFQ if quotations exist for it
  const rfqWithQuote = await saveRFQ(
    { rfqNumber: "rfq-with-quotes", title: "Quoted RFQ" },
    [{ description: "Valves", quantity: 2 }],
  );
  await saveSupplierQuotation(
    {
      rfqId: rfqWithQuote.id,
      vendorId: "v-1",
      quotationNumber: "QUO-V1",
    },
    [{ description: "Valves", quantity: 2, unitPrice: 500 }],
  );
  await assert.rejects(
    async () => {
      await deleteDraftRFQ(rfqWithQuote.id);
    },
    /Cannot delete RFQ with existing supplier quotations/i,
  );
});

test("rfqDomain: row mappers handle DB shapes correctly", () => {
  const rfq = rfqFromRow(
    {
      id: "rfq-row-1",
      company_id: "comp-1",
      rfq_number: "rfq-2026-999",
      title: "Mapper Test",
      status: "ISSUED",
      currency: "PHP",
      created_at: "2026-09-01T00:00:00Z",
    },
    [
      {
        id: "line-row-1",
        rfq_id: "rfq-row-1",
        line_number: 2,
        description: "Second Item",
        quantity: 10,
      },
      {
        id: "line-row-2",
        rfq_id: "rfq-row-1",
        line_number: 1,
        description: "First Item",
        quantity: 5,
      },
    ],
    [
      {
        id: "iv-1",
        rfq_id: "rfq-row-1",
        vendor_id: "v-100",
      },
    ],
  );

  assert.equal(rfq.rfqNumber, "RFQ-2026-999");
  assert.equal(rfq.status, "ISSUED");
  assert.equal(rfq.lines?.length, 2);
  // Checked sorted by line_number asc
  assert.equal(rfq.lines?.[0].lineNumber, 1);
  assert.equal(rfq.lines?.[0].description, "First Item");
  assert.equal(rfq.lines?.[1].lineNumber, 2);
  assert.equal(rfq.lines?.[1].description, "Second Item");
  assert.deepEqual(rfq.invitedVendorIds, ["v-100"]);
});
