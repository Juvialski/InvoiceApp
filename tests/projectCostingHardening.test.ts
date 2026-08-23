import test from "node:test";
import assert from "node:assert/strict";
import { calculateProjectCost } from "../src/utils/projectCosting.ts";
import type { InvoiceProjectAllocation, Project } from "../src/types.ts";

const project = (id: string, currency = "PHP"): Project => ({ id, projectCode: id, projectName: id, clientName: "Client", status: "ACTIVE", projectBudget: 1_000_000, currency, createdAt: "2026-01-01", updatedAt: "2026-01-01" });
const allocation = (id: string, projectId: string, amount: number): InvoiceProjectAllocation => ({ id, invoiceId: "invoice-1", projectId, allocationType: "AMOUNT", allocationAmount: amount });

test("partial invoice payment is split proportionally and never overstated per project", () => {
  const allocations = [allocation("a", "project-a", 60_000), allocation("b", "project-b", 40_000)];
  const input = { invoices: [{ id: "invoice-1", grandTotal: 100_000, amountPaid: 50_000, currency: "PHP", reviewStatus: "VERIFIED" as const, status: "PARTIALLY_PAID", allocations }] };
  const a = calculateProjectCost(project("project-a"), input);
  const b = calculateProjectCost(project("project-b"), input);
  assert.equal(a.paidInvoiceCost, 30_000);
  assert.equal(b.paidInvoiceCost, 20_000);
  assert.equal(a.paidInvoiceCost + b.paidInvoiceCost, 50_000);
  assert.equal(a.unpaidInvoiceCost + b.unpaidInvoiceCost, 50_000);
});

test("partial payment cent rounding is deterministic and stays within invoice payment", () => {
  const allocations = [allocation("a", "project-a", 33.33), allocation("b", "project-b", 33.33), allocation("c", "project-c", 33.34)];
  const input = { invoices: [{ id: "invoice-1", grandTotal: 100, amountPaid: 0.02, currency: "PHP", reviewStatus: "VERIFIED" as const, status: "PARTIALLY_PAID", allocations }] };
  const paid = ["project-a", "project-b", "project-c"].map((id) => calculateProjectCost(project(id), input).paidInvoiceCost);
  assert.deepEqual(paid, [0.01, 0, 0.01]);
  assert.ok(paid.reduce((sum, amount) => sum + amount, 0) <= 0.02);
});

test("foreign currency remains excluded from base-currency invoice totals", () => {
  const summary = calculateProjectCost(project("project-a"), {
    invoices: [{ id: "invoice-1", grandTotal: 100_000, amountPaid: 50_000, currency: "USD", reviewStatus: "VERIFIED", status: "PARTIALLY_PAID", allocations: [allocation("a", "project-a", 100_000)] }],
  });
  assert.equal(summary.totalActualCost, 0);
  assert.equal(summary.paidInvoiceCost, 0);
  assert.equal(summary.foreignCosts.USD, 100_000);
});
