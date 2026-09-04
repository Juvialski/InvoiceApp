import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLocalClientCollectionRecord,
  applyLocalClientCollectionReversal,
  billingCollectedAmount,
  billingOutstandingAmount,
  buildLocalClientCollection,
  calculateClientCollectionSummary,
  clientCollectionTotal,
  isClientCollectionProjectStatusAllowed,
  isRecordedClientCollection,
  type ClientCollection,
  type ClientCollectionAllocationInput,
} from "../src/lib/clientCollections.ts";
import { clientBillingTotal, type ClientBilling } from "../src/lib/clientBilling.ts";
import { buildProjectLifecyclePreview } from "../src/lib/projects.ts";
import type { Project } from "../src/types.ts";

const project: Project = {
  id: "project-col-1",
  projectCode: "ENG-COL-001",
  projectName: "Collection Test Project",
  clientName: "Alpha Industrial",
  clientReference: "ALPHA-2026",
  status: "ACTIVE",
  contractValue: 10_000,
  projectBudget: 7_000,
  currency: "PHP",
  createdAt: "2026-09-04T00:00:00Z",
  updatedAt: "2026-09-04T00:00:00Z",
};

function billing(
  id: string,
  number: string,
  amount: number,
  status: "DRAFT" | "SUBMITTED" | "ISSUED" | "VOIDED" = "ISSUED",
  currency = "PHP",
): ClientBilling {
  return {
    id,
    companyId: "company-1",
    projectId: project.id,
    billingNumber: number,
    billingDate: "2026-09-04",
    currency,
    status,
    lines: [{ id: `line-${id}`, billingId: id, lineNumber: 1, description: "Milestone", amount }],
    createdAt: "2026-09-04T00:00:00Z",
    updatedAt: "2026-09-04T00:00:00Z",
  };
}

function collection(overrides: Partial<ClientCollection> = {}): ClientCollection {
  return {
    id: "col-1",
    companyId: "company-1",
    projectId: project.id,
    collectionNumber: "CR-001",
    collectionDate: "2026-09-04",
    currency: "PHP",
    status: "DRAFT",
    allocations: [
      {
        id: "alloc-1",
        companyId: "company-1",
        collectionId: "col-1",
        billingId: "billing-1",
        amount: 1500,
        createdAt: "2026-09-04T00:00:00Z",
      },
    ],
    createdAt: "2026-09-04T00:00:00Z",
    updatedAt: "2026-09-04T00:00:00Z",
    ...overrides,
  };
}

test("client collection totals derive from allocation values and drafts do not inflate collected to date", () => {
  const b1 = billing("b1", "PB-001", 3000, "ISSUED");
  const b2 = billing("b2", "PB-002", 2000, "ISSUED");

  const draft = collection({
    id: "col-draft",
    collectionNumber: "CR-DRAFT",
    status: "DRAFT",
    allocations: [{ id: "a1", companyId: "company-1", collectionId: "col-draft", billingId: "b1", amount: 1000 }],
  });
  const recorded = collection({
    id: "col-rec",
    collectionNumber: "CR-REC",
    status: "RECORDED",
    allocations: [
      { id: "a2", companyId: "company-1", collectionId: "col-rec", billingId: "b1", amount: 1500 },
      { id: "a3", companyId: "company-1", collectionId: "col-rec", billingId: "b2", amount: 500 },
    ],
  });
  const reversed = collection({
    id: "col-rev",
    collectionNumber: "CR-REV",
    status: "REVERSED",
    reversalReason: "Cheque bounced",
    allocations: [{ id: "a4", companyId: "company-1", collectionId: "col-rev", billingId: "b2", amount: 800 }],
  });

  assert.equal(clientCollectionTotal(recorded), 2000);
  assert.equal(clientCollectionTotal({ allocations: [{ amount: 100.004 }, { amount: 50.005 }] }), 150.01);

  // Billing-level collected and outstanding amounts
  assert.equal(billingCollectedAmount("b1", [draft, recorded, reversed]), 1500);
  assert.equal(billingOutstandingAmount(b1, [draft, recorded, reversed]), 1500);
  assert.equal(billingCollectedAmount("b2", [draft, recorded, reversed]), 500);
  assert.equal(billingOutstandingAmount(b2, [draft, recorded, reversed]), 1500);

  // Project-level summary
  const summary = calculateClientCollectionSummary(project, [b1, b2], [draft, recorded, reversed]);
  assert.equal(summary.collectedToDate, 2000);
  assert.equal(summary.outstandingBilledAmount, 3000); // 5000 billed - 2000 collected
  assert.equal(summary.recordedCollectionCount, 1);
  assert.equal(summary.totalCollectionCount, 3);
  assert.equal(summary.hasCurrencyMismatch, false);
});

test("client collection summary withholds mixed currencies instead of silently aggregating", () => {
  const b1 = billing("b1", "PB-001", 1000, "ISSUED", "PHP");
  const colUsd = collection({ id: "c-usd", currency: "USD", status: "RECORDED" });

  const summary = calculateClientCollectionSummary(project, [b1], [colUsd]);
  assert.equal(summary.hasCurrencyMismatch, true);
  assert.equal(summary.collectedToDate, undefined);
  assert.equal(summary.outstandingBilledAmount, undefined);
});

test("local collection lifecycle records draft, enforces over-collection guard, and requires reason for reversal", () => {
  const b1 = billing("b1", "PB-001", 2000, "ISSUED");
  const b2 = billing("b2", "PB-002", 1000, "DRAFT"); // Not issued!

  const draft = collection({
    id: "col-1",
    status: "DRAFT",
    allocations: [{ id: "a1", companyId: "company-1", collectionId: "col-1", billingId: "b1", amount: 1500 }],
  });

  // Cannot allocate to non-ISSUED billing
  const draftInvalidBilling = collection({
    id: "col-inv",
    status: "DRAFT",
    allocations: [{ id: "a-inv", companyId: "company-1", collectionId: "col-inv", billingId: "b2", amount: 500 }],
  });
  assert.throws(
    () => applyLocalClientCollectionRecord(draftInvalidBilling, project, [b1, b2], []),
    /Only ISSUED client billings may receive collection allocations/,
  );

  // Record valid draft
  const { collection: rec1, event: ev1 } = applyLocalClientCollectionRecord(draft, project, [b1], []);
  assert.equal(rec1.status, "RECORDED");
  assert.equal(isRecordedClientCollection(rec1), true);
  assert.equal(ev1.eventType, "RECORDED");
  assert.equal(ev1.toStatus, "RECORDED");

  // Attempt over-collection on b1 (already 1500 collected of 2000, trying to record 600 more)
  const draftOver = collection({
    id: "col-over",
    status: "DRAFT",
    allocations: [{ id: "a-over", companyId: "company-1", collectionId: "col-over", billingId: "b1", amount: 600 }],
  });
  assert.throws(
    () => applyLocalClientCollectionRecord(draftOver, project, [b1], [rec1]),
    /exceeds remaining uncollected billing amount/,
  );

  // Reversal requires reason >= 3 chars
  assert.throws(
    () => applyLocalClientCollectionReversal(rec1, "no"),
    /A reason of at least 3 characters is required/,
  );
  assert.throws(
    () => applyLocalClientCollectionReversal(rec1, "   "),
    /A reason of at least 3 characters is required/,
  );

  // Valid reversal
  const { collection: rev1, event: evRev } = applyLocalClientCollectionReversal(
    rec1,
    "Payment recalled by client bank",
    "2026-09-04T05:00:00Z",
  );
  assert.equal(rev1.status, "REVERSED");
  assert.equal(rev1.reversalReason, "Payment recalled by client bank");
  assert.equal(evRev.eventType, "REVERSED");
  assert.equal(evRev.reason, "Payment recalled by client bank");

  // After reversal, outstanding collectible balance is restored so draftOver (600) can now be recorded
  const { collection: recOver } = applyLocalClientCollectionRecord(draftOver, project, [b1], [rev1]);
  assert.equal(recOver.status, "RECORDED");
});

test("local draft builder snapshots project currency and client context without a manual total column", () => {
  const allocations: ClientCollectionAllocationInput[] = [
    { billingId: "b1", amount: 750, notes: "Downpayment" },
    { billingId: "b2", amount: 250, notes: "Balance" },
  ];

  const saved = buildLocalClientCollection(
    {
      projectId: project.id,
      collectionNumber: "cr-005",
      payerSnapshot: project.clientName,
      currency: project.currency,
      notes: "Direct bank wire",
    },
    allocations,
    undefined,
    "guest-company",
    "2026-09-04T06:00:00Z",
  );

  assert.equal(saved.collectionNumber, "CR-005");
  assert.equal(saved.currency, "PHP");
  assert.equal(saved.payerSnapshot, "Alpha Industrial");
  assert.equal(saved.status, "DRAFT");
  assert.equal(saved.allocations.length, 2);
  assert.equal(clientCollectionTotal(saved), 1000);
  assert.equal(Object.hasOwn(saved, "totalAmount"), false);
  assert.equal(Object.hasOwn(saved, "amount"), false);
});

test("client collection history is a project lifecycle dependency and blocks deletion", () => {
  const preview = buildProjectLifecyclePreview(project, { clientCollections: 1 });
  assert.equal(preview.canDelete, false);
  assert.equal(preview.dependencies.clientCollections, 1);
  assert.equal(preview.recommendedAction, "ARCHIVE");
});

test("project status restrictions apply to client collections", () => {
  assert.equal(isClientCollectionProjectStatusAllowed("ACTIVE"), true);
  assert.equal(isClientCollectionProjectStatusAllowed("PLANNING"), true);
  assert.equal(isClientCollectionProjectStatusAllowed("ON_HOLD"), true);
  assert.equal(isClientCollectionProjectStatusAllowed("COMPLETED"), true);
  assert.equal(isClientCollectionProjectStatusAllowed("ARCHIVED"), false);

  const archivedProject: Project = { ...project, status: "ARCHIVED" };
  const b1 = billing("b1", "PB-001", 1000, "ISSUED");
  const draft = collection({
    id: "col-arch",
    status: "DRAFT",
    allocations: [{ id: "a1", companyId: "company-1", collectionId: "col-arch", billingId: "b1", amount: 500 }],
  });
  assert.throws(
    () => applyLocalClientCollectionRecord(draft, archivedProject, [b1], []),
    /Archived or cancelled projects cannot receive new collection activity/,
  );
});

test("commercial collections maintain strict isolation from cash, settlement, and costing", () => {
  const sample = collection();
  // Ensure no financial transactions, settlement references, or cash accounts exist
  assert.equal(Object.hasOwn(sample, "bankAccountId"), false);
  assert.equal(Object.hasOwn(sample, "settlementId"), false);
  assert.equal(Object.hasOwn(sample, "journalEntryId"), false);
  assert.equal(Object.hasOwn(sample, "cashTransactionId"), false);
});
