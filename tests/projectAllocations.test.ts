import test from "node:test";
import assert from "node:assert/strict";
import {
  deterministicLocalInvoiceAllocationId,
  normalizeInvoiceProjectAllocations,
  remainingInvoiceAllocatableAmount,
  replaceInvoiceProjectAllocationsLocally,
  toInvoiceProjectAllocationPersistenceRows,
  validateInvoiceProjectAllocationSet,
} from "../src/utils/projectAllocations.ts";
import type { InvoiceProjectAllocation } from "../src/types.ts";

function allocation(overrides: Partial<InvoiceProjectAllocation> = {}): InvoiceProjectAllocation {
  return {
    id: "allocation-1",
    invoiceId: "invoice-1",
    projectId: "project-a",
    allocationType: "AMOUNT",
    allocationAmount: 0,
    ...overrides,
  };
}

test("remaining invoice allocatable amount uses cent-rounded amount and percentage allocations", () => {
  assert.equal(remainingInvoiceAllocatableAmount(1_000, [allocation({ allocationAmount: 125.25 }), allocation({ projectId: "project-b", allocationAmount: 25.25 })]), 849.5);
  assert.equal(remainingInvoiceAllocatableAmount(1_000, [allocation({ allocationType: "PERCENTAGE", allocationPercentage: 25, allocationAmount: 250 })]), 750);
});

test("allocation validation rejects duplicates, invalid values, and over-allocation", () => {
  const duplicate = validateInvoiceProjectAllocationSet(1_000, [allocation({ allocationAmount: 100 }), allocation({ id: "allocation-2", allocationAmount: 100 })]);
  assert.equal(duplicate.valid, false);
  assert.deepEqual(duplicate.duplicateProjectIds, ["project-a"]);

  const invalid = validateInvoiceProjectAllocationSet(1_000, [allocation({ allocationAmount: -1 })]);
  assert.equal(invalid.valid, false);
  assert.match(invalid.message || "", /amount/i);

  const over = validateInvoiceProjectAllocationSet(1_000, [allocation({ allocationAmount: 700 }), allocation({ id: "allocation-2", projectId: "project-b", allocationAmount: 300.02 })]);
  assert.equal(over.valid, false);
  assert.equal(over.exceedsBy, 0.02);
  assert.equal(over.remaining, 0);
});

test("replacement normalization and local fallback are deterministic", () => {
  const next = [
    allocation({ id: "", projectId: "project-b", allocationAmount: 40 }),
    allocation({ id: "", projectId: "project-a", allocationType: "PERCENTAGE", allocationPercentage: 20, allocationAmount: 20 }),
  ];
  const first = normalizeInvoiceProjectAllocations("invoice-1", 100, next);
  const second = normalizeInvoiceProjectAllocations("invoice-1", 100, next);
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((item) => item.projectId), ["project-a", "project-b"]);
  assert.equal(first[0]?.id, deterministicLocalInvoiceAllocationId("invoice-1", "project-a"));

  const replaced = replaceInvoiceProjectAllocationsLocally("invoice-1", 100, [allocation({ invoiceId: "other-invoice" }), allocation({ projectId: "project-a", allocationAmount: 10 })], next);
  assert.deepEqual(replaced.filter((item) => item.invoiceId === "invoice-1").map((item) => item.projectId), ["project-a", "project-b"]);
  assert.equal(replaced.filter((item) => item.invoiceId === "other-invoice").length, 1);

  assert.deepEqual(toInvoiceProjectAllocationPersistenceRows("invoice-1", 100, next), [
    { project_id: "project-a", project_cost_code_id: null, allocation_type: "PERCENTAGE", allocation_percentage: 20, allocation_amount: null, notes: null },
    { project_id: "project-b", project_cost_code_id: null, allocation_type: "AMOUNT", allocation_percentage: null, allocation_amount: 40, notes: null },
  ]);
});
