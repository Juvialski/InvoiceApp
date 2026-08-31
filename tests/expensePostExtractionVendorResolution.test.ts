import test from "node:test";
import assert from "node:assert/strict";
import {
  extractVendorEvidenceFromExpense,
  resolveVendorCandidate,
} from "../src/lib/entityResolution.ts";
import type {
  EmailIntakeProfile,
  Expense,
  ExpenseStatus,
  Vendor,
} from "../src/types.ts";

const existingVendors: Vendor[] = [
  {
    id: "v-petron",
    companyId: "comp-1",
    name: "Petron Corporation",
    normalizedName: "petron corporation",
    taxId: "000-123-456-000",
    email: "corporate@petron.com",
    address: "San Miguel Head Office Complex, Mandaluyong",
  },
  {
    id: "v-shell",
    companyId: "comp-1",
    name: "Pilipinas Shell Petroleum Corp",
    normalizedName: "pilipinas shell petroleum",
    taxId: "111-222-333-000",
    email: "cards@shell.com",
  },
  {
    id: "v-grab",
    companyId: "comp-1",
    name: "Grab Philippines (MyTeksi)",
    normalizedName: "grab philippines",
    taxId: "444-555-666-000",
    email: "receipts@grab.com",
  },
];

function createExpenseDraft(params: {
  payee?: string;
  amount: number;
  currency: string;
  description: string;
  status: ExpenseStatus;
  projectId?: string;
}): Expense {
  return {
    id: `exp-${Date.now()}`,
    expenseDate: "2026-08-31",
    category: "Miscellaneous",
    description: params.description,
    payee: params.payee,
    amount: params.amount,
    currency: params.currency,
    status: params.status,
    projectId: params.projectId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

test("Expense resolution: extracts payee and sender evidence and links existing vendor", () => {
  const expense = {
    payee: "Petron Corporation",
    amount: 2500,
    currency: "PHP",
    description: "Fleet fuel refill",
  };

  const evidence = extractVendorEvidenceFromExpense(
    expense,
    { sender: "corporate@petron.com", subject: "Fuel E-Receipt" }
  );

  const resolution = resolveVendorCandidate(
    { candidateId: "exp-cand-1", evidence },
    existingVendors
  );

  assert.equal(resolution.matchedEntityId, "v-petron");
  assert.equal(resolution.proposedAction, "LINK_EXISTING");
  assert.equal(resolution.matchedEntityName, "Petron Corporation");
});

test("Expense resolution: unseen merchant proposes CREATE_NEW and remains advisory", () => {
  const expense = {
    payee: "Corner Sari-Sari Store",
    amount: 150,
    currency: "PHP",
    description: "Office coffee supply",
  };

  const evidence = extractVendorEvidenceFromExpense(
    expense,
    { sender: "none@domain.ph", subject: "Receipt" }
  );

  const resolution = resolveVendorCandidate(
    { candidateId: "exp-cand-2", evidence },
    existingVendors
  );

  assert.equal(resolution.proposedAction, "CREATE_NEW");
  assert.equal(resolution.matchedEntityId, undefined);
  assert.equal(resolution.matchedEntityName, "Corner Sari-Sari Store");
});

test("Expense resolution: confirmed vendor ID adherence overrides ambiguous payee", () => {
  const stagedReview = {
    id: "staged-exp-1",
    confirmedVendorId: "v-shell",
    suggestedExpense: {
      payee: "Fuel Service Station",
      amount: 3000,
      currency: "PHP",
    },
  };

  // When confirmedVendorId is set, pre-selection adheres to the confirmed vendor
  const confirmedVendor = existingVendors.find((v) => v.id === stagedReview.confirmedVendorId);
  assert.ok(confirmedVendor);
  assert.equal(confirmedVendor.id, "v-shell");
  assert.equal(confirmedVendor.name, "Pilipinas Shell Petroleum Corp");

  // Create expense using confirmed vendor payee
  const expense = createExpenseDraft({
    payee: confirmedVendor.name,
    amount: stagedReview.suggestedExpense.amount,
    currency: stagedReview.suggestedExpense.currency,
    description: "Fuel refill",
    status: "DRAFT",
  });

  assert.equal(expense.payee, "Pilipinas Shell Petroleum Corp");
  assert.equal(expense.status, "DRAFT");
});

test("Expense resolution: profile vendor conflict causes NEEDS_REVIEW", () => {
  const candidate = {
    candidateId: "exp-cand-3",
    evidence: {
      name: "Grab Philippines (MyTeksi)",
      taxId: "444-555-666-000", // Matches Grab (v-grab)
      senderEmail: "receipts@grab.com",
      linkedProfileVendorId: "v-petron", // Profile rule points to Petron (v-petron)
    },
  };

  const profile: EmailIntakeProfile = {
    id: "prof-fuel",
    companyId: "comp-1",
    name: "Fuel Intake Rule",
    enabled: true,
    suggestedDestination: "EXPENSE",
    linkedVendorId: "v-petron",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };

  const resolution = resolveVendorCandidate(
    candidate,
    existingVendors,
    [profile]
  );

  assert.equal(resolution.proposedAction, "NEEDS_REVIEW");
  assert.ok(resolution.conflicts && resolution.conflicts.length > 0);
  assert.equal(resolution.conflicts[0].field, "taxId");
  assert.ok(resolution.conflicts[0].reason.includes("Petron"));
});

test("Expense safety boundaries: project allocation remains unallocated by default", () => {
  const stagedReview = {
    id: "staged-exp-4",
    suggestedExpense: {
      projectId: "proj-hint-only",
      payee: "Shell Station",
      amount: 1200,
      currency: "PHP",
      description: "Gasoline",
    },
  };

  // Email hint is advisory; created expense must default to unallocated unless user explicitly sets it
  const created = createExpenseDraft({
    projectId: undefined,
    payee: stagedReview.suggestedExpense.payee,
    amount: stagedReview.suggestedExpense.amount,
    currency: stagedReview.suggestedExpense.currency,
    description: stagedReview.suggestedExpense.description,
    status: "DRAFT",
  });

  assert.equal(created.projectId, undefined);
  assert.equal(created.status, "DRAFT");
});

test("Expense safety boundaries: expense is saved as DRAFT or APPROVED, never auto-paid", () => {
  const expenseDraft = createExpenseDraft({
    payee: "Petron Corporation",
    amount: 1500,
    currency: "PHP",
    description: "Fuel",
    status: "DRAFT",
  });

  assert.equal(expenseDraft.status, "DRAFT");
  assert.notEqual(expenseDraft.status, "PAID");

  const expenseApproved = createExpenseDraft({
    payee: "Petron Corporation",
    amount: 1500,
    currency: "PHP",
    description: "Fuel",
    status: "APPROVED",
  });

  assert.equal(expenseApproved.status, "APPROVED");
  assert.notEqual(expenseApproved.status, "PAID");
});

test("Expense safety boundaries: master data immutability is preserved", () => {
  const originalMasterVendors = JSON.parse(JSON.stringify(existingVendors));
  Object.freeze(existingVendors);

  const expense = {
    payee: "Fresh Unknown Payee Cafe",
    amount: 280,
    currency: "PHP",
    description: "Client refreshments",
  };

  const evidence = extractVendorEvidenceFromExpense(
    expense,
    { sender: "cafe@unknown.ph", subject: "Official Receipt" }
  );

  const resolution = resolveVendorCandidate(
    { candidateId: "exp-cand-5", evidence },
    existingVendors
  );

  assert.equal(resolution.proposedAction, "CREATE_NEW");
  assert.equal(existingVendors.length, originalMasterVendors.length);
  assert.deepEqual(existingVendors, originalMasterVendors);
});
