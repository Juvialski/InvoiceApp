import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLocalClientBillingTransition,
  buildLocalClientBilling,
  calculateClientBillingSummary,
  clientBillingTotal,
  type ClientBilling,
} from "../src/lib/clientBilling.ts";
import { buildProjectLifecyclePreview } from "../src/lib/projects.ts";
import type { Project } from "../src/types.ts";

const project: Project = {
  id: "project-billing-1",
  projectCode: "ENG-001",
  projectName: "Billing Test Project",
  clientName: "Client A",
  clientReference: "CLIENT-001",
  status: "ACTIVE",
  contractValue: 1_000,
  projectBudget: 700,
  currency: "PHP",
  createdAt: "2026-09-04T00:00:00Z",
  updatedAt: "2026-09-04T00:00:00Z",
};

function billing(overrides: Partial<ClientBilling> = {}): ClientBilling {
  return {
    id: "billing-1",
    companyId: "company-1",
    projectId: project.id,
    billingNumber: "PB-001",
    billingDate: "2026-09-04",
    currency: "PHP",
    status: "DRAFT",
    lines: [{ id: "line-1", billingId: "billing-1", lineNumber: 1, description: "Progress", amount: 400 }],
    createdAt: "2026-09-04T00:00:00Z",
    updatedAt: "2026-09-04T00:00:00Z",
    ...overrides,
  };
}

test("client billing totals derive from line values and drafts do not inflate billed-to-date", () => {
  const draft = billing();
  const issued = billing({ id: "billing-2", billingNumber: "PB-002", status: "ISSUED", lines: [{ id: "line-2", billingId: "billing-2", lineNumber: 1, description: "Issued progress", amount: 250 }] });
  const voided = billing({ id: "billing-3", billingNumber: "PB-003", status: "VOIDED", lines: [{ id: "line-3", billingId: "billing-3", lineNumber: 1, description: "Voided progress", amount: 999 }] });
  assert.equal(clientBillingTotal({ lines: [{ amount: 100.005 }, { amount: 20 }] }), 120.01);
  const summary = calculateClientBillingSummary(project, [draft, issued, voided]);
  assert.equal(summary.billedToDate, 250);
  assert.equal(summary.remainingToBill, 750);
  assert.equal(summary.issuedBillingCount, 1);
});

test("client billing summary withholds mixed currencies instead of silently aggregating", () => {
  const summary = calculateClientBillingSummary(project, [billing({ currency: "USD", status: "ISSUED" })]);
  assert.equal(summary.hasCurrencyMismatch, true);
  assert.equal(summary.billedToDate, undefined);
  assert.equal(summary.remainingToBill, undefined);
});

test("local lifecycle requires reasons, preserves issued history, and blocks cumulative over-billing", () => {
  const draft = billing({ lines: [{ id: "line-1", billingId: "billing-1", lineNumber: 1, description: "Progress", amount: 600 }] });
  const submitted = applyLocalClientBillingTransition(draft, "SUBMITTED", project, [draft], undefined, "2026-09-04T01:00:00Z").billing;
  assert.equal(submitted.status, "SUBMITTED");
  assert.throws(() => applyLocalClientBillingTransition(submitted, "ISSUED", project, [submitted, billing({ id: "issued", status: "ISSUED", lines: [{ id: "line-issued", billingId: "issued", lineNumber: 1, description: "Earlier", amount: 500 }] })]));
  assert.throws(() => applyLocalClientBillingTransition(submitted, "DRAFT", project, [submitted]));
  const returned = applyLocalClientBillingTransition(submitted, "DRAFT", project, [submitted], "Correct the valuation", "2026-09-04T02:00:00Z");
  assert.equal(returned.billing.status, "DRAFT");
  assert.equal(returned.event.eventType, "RETURNED_TO_DRAFT");
  const issued = applyLocalClientBillingTransition(submitted, "ISSUED", project, [submitted], undefined, "2026-09-04T03:00:00Z").billing;
  assert.equal(issued.status, "ISSUED");
  assert.throws(() => applyLocalClientBillingTransition(issued, "DRAFT", project, [issued], "Undo"));
  const voided = applyLocalClientBillingTransition(issued, "VOIDED", project, [issued], "Duplicate billing", "2026-09-04T04:00:00Z").billing;
  assert.equal(voided.status, "VOIDED");
});

test("local draft builder snapshots project currency and client context without a manual total", () => {
  const saved = buildLocalClientBilling({ projectId: project.id, billingNumber: "pb-004", clientNameSnapshot: project.clientName, clientReferenceSnapshot: project.clientReference, currency: project.currency }, [{ description: "Mobilization", amount: 125 }, { description: "Site progress", amount: 75 }], undefined, "guest-company", "2026-09-04T05:00:00Z");
  assert.equal(saved.billingNumber, "PB-004");
  assert.equal(saved.currency, "PHP");
  assert.equal(saved.clientNameSnapshot, "Client A");
  assert.equal(clientBillingTotal(saved), 200);
  assert.equal(Object.hasOwn(saved, "totalAmount"), false);
});

test("client billing history is a project lifecycle dependency and demo data stays outside cash", () => {
  const preview = buildProjectLifecyclePreview(project, { clientBillings: 1 });
  assert.equal(preview.canDelete, false);
  assert.equal(preview.dependencies.clientBillings, 1);
  assert.equal(preview.recommendedAction, "ARCHIVE");
});
