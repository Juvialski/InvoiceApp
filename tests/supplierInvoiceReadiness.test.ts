import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Expense, InvoiceData } from "../src/types.ts";
import { applyLocalChecks } from "../src/utils/invoiceLogic.ts";
import { classifySupplierDocuments, getSupplierInvoiceExpenseReadiness, getSupplierInvoiceValidationAdvisories, suggestSupplierExpenseDescription } from "../src/utils/supplierExpenseWorkspace.ts";

const expensesPage = readFileSync(new URL("../src/components/expenses/ExpensesPage.tsx", import.meta.url), "utf8");
const reviewSource = readFileSync(new URL("../src/components/SupplierInvoiceReview.tsx", import.meta.url), "utf8");
const readinessSource = readFileSync(new URL("../src/utils/supplierExpenseWorkspace.ts", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/components/VerificationWorkspace.tsx", import.meta.url), "utf8");
const correctionSource = readFileSync(new URL("../src/components/financial/FinancialCorrectionDialog.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const persistenceSource = readFileSync(new URL("../src/lib/persistence.ts", import.meta.url), "utf8");
const r3Migration = readFileSync(new URL("../supabase/migrations/20260906010750_hydroqualisense_r3_unified_financial_documents.sql", import.meta.url), "utf8");
const repairGuardMigration = readFileSync(new URL("../supabase/migrations/20260908024017_supplier_invoice_repair_guards.sql", import.meta.url), "utf8");
const configuredBuyerProfile = { legalName: "HydroQualiSense Solutions Corp.", vatTin: "777-823-517-000" };

function invoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    id: "readiness-invoice",
    invoiceNumber: "READY-001",
    invoiceDate: "2026-09-08",
    currency: "PHP",
    vendor: { name: "Canonical Supplier", vendorId: "vendor-1" },
    customer: { name: "HydroQualiSense Solutions Corp." },
    items: [{ id: "line-1", description: "Confirmed materials", quantity: 1, unitPrice: 100, total: 100 }],
    subtotal: 100,
    totalTax: 0,
    grandTotal: 100,
    description: "Confirmed materials",
    category: "Materials",
    extractedAt: "2026-09-08T00:00:00.000Z",
    modelUsed: "test",
    reviewStatus: "VERIFIED",
    lifecycleStatus: "ACTIVE",
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "readiness-expense",
    expenseDate: "2026-09-08",
    category: "Materials",
    description: "Confirmed materials",
    amount: 100,
    currency: "PHP",
    status: "DRAFT",
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

test("VERIFIED with no canonical Vendor is not READY_TO_LINK", () => {
  const row = classifySupplierDocuments([invoice({ vendor: { name: "Extracted Supplier" } })], [], [], [], configuredBuyerProfile)[0]!;
  assert.equal(row.state, "NEEDS_REVIEW");
  assert.equal(row.readiness.readyToLink, false);
  assert.match(row.readiness.blockingReasons.join(" "), /canonical Vendor/i);
});

test("VERIFIED with a missing Expense description is not READY_TO_LINK", () => {
  const row = classifySupplierDocuments([invoice({ description: "   " })], [], [], [], configuredBuyerProfile)[0]!;
  assert.equal(row.state, "NEEDS_REVIEW");
  assert.equal(row.readiness.readyToLink, false);
  assert.match(row.readiness.blockingReasons.join(" "), /Expense description/i);
});

test("an incomplete deployment buyer profile blocks posting even when the source omits buyer evidence", () => {
  const source = invoice({ customer: undefined });
  const readiness = getSupplierInvoiceExpenseReadiness(source, { buyerProfile: { legalName: "" } });
  assert.equal(readiness.readyToLink, false);
  assert.ok(readiness.issues.some((issue) => issue.code === "BUYER_PROFILE_UNAVAILABLE"));
  assert.match(readiness.blockingReasons.join(" "), /document profile/i);
});

test("a complete VERIFIED invoice with no Expense is READY_TO_LINK", () => {
  const row = classifySupplierDocuments([invoice()], [], [], [], configuredBuyerProfile)[0]!;
  assert.equal(row.state, "READY_TO_LINK");
  assert.equal(row.readiness.complete, true);
  assert.equal(row.readiness.readyToLink, true);
  assert.deepEqual(row.readiness.blockingReasons, []);
});

test("a linked invoice remains LINKED even when its source facts need no new posting", () => {
  const row = classifySupplierDocuments([invoice()], [expense({ supplierInvoiceId: "readiness-invoice" })], [], [], configuredBuyerProfile)[0]!;
  assert.equal(row.state, "LINKED");
  assert.equal(row.linkedExpense?.id, "readiness-expense");
});

test("fixing required facts changes readiness without changing the historical review status", () => {
  const incomplete = invoice({ vendor: { name: "Extracted Supplier" }, description: "" });
  const before = getSupplierInvoiceExpenseReadiness(incomplete, { buyerProfile: configuredBuyerProfile });
  const fixed = { ...incomplete, vendor: { ...incomplete.vendor, vendorId: "vendor-1" }, description: "Confirmed materials" };
  const after = getSupplierInvoiceExpenseReadiness(fixed, { buyerProfile: configuredBuyerProfile });
  assert.equal(before.readyToLink, false);
  assert.equal(after.readyToLink, true);
  assert.equal(fixed.reviewStatus, "VERIFIED");
});

test("extracted vendor evidence is not automatically promoted to a canonical Vendor", () => {
  const readiness = getSupplierInvoiceExpenseReadiness(invoice({
    vendor: { name: "Extracted Supplier" },
    entityResolution: { proposedAction: "CREATE_NEW", entityType: "VENDOR", candidateId: "readiness-invoice", confidence: "HIGH", confidenceScore: 99, matchReasons: [], conflicts: [], proposedEnrichments: [], extractedEvidence: { name: "Extracted Supplier" }, normalizedEvidence: { name: "extracted supplier" } },
  }), { buyerProfile: configuredBuyerProfile });
  assert.equal(readiness.readyToLink, false);
  assert.ok(readiness.issues.some((issue) => issue.code === "CANONICAL_VENDOR"));
});

test("description suggestions use preserved line-item evidence and remain human-confirmed", () => {
  assert.equal(suggestSupplierExpenseDescription(invoice({ description: "", items: [{ id: "line-1", description: "Concrete materials", quantity: 2, unitPrice: 50, total: 100 }] })), "Concrete materials");
  assert.equal(suggestSupplierExpenseDescription(invoice({ description: "", items: [], invoiceNumber: "READY-002" })), "Supplier invoice READY-002");
});

test("partial persisted invoices with no line-item collection remain reviewable instead of crashing", () => {
  const partial = invoice({
    items: undefined as unknown as InvoiceData["items"],
    vendor: { name: "Extracted Supplier" },
    description: "",
  });

  assert.doesNotThrow(() => applyLocalChecks(partial));
  const checked = applyLocalChecks(partial);
  assert.deepEqual(checked.items, []);
  assert.equal(checked.philippineInvoiceCompleteness?.status, "MISSING_INFORMATION");
  assert.equal(suggestSupplierExpenseDescription(partial), "Supplier invoice READY-001");
});

test("VAT-rate validation remains an advisory when the posting readiness contract is complete", () => {
  const source = invoice({ validation: { status: "REVIEW", issues: [{ id: "ph-vat-rate-not-evaluated", severity: "warning", field: "philippineTaxDetails.vatAmount", message: "VAT rate consistency was not evaluated because no authoritative VAT rate is configured." }] } });
  const readiness = getSupplierInvoiceExpenseReadiness(source, { buyerProfile: configuredBuyerProfile });
  assert.equal(readiness.complete, true);
  assert.equal(getSupplierInvoiceValidationAdvisories(source, readiness).length, 1);
  assert.match(getSupplierInvoiceValidationAdvisories(source, readiness)[0]!.message, /no authoritative VAT rate/i);
});

test("the posting boundary remains the guarded idempotent RPC and the linked Expense remains one authoritative row", () => {
  assert.match(persistenceSource, /verify_supplier_invoice_and_create_expense/);
  assert.match(r3Migration, /expenses_company_supplier_invoice_unique/);
  assert.match(r3Migration, /for update/);
  assert.match(repairGuardMigration, /active linked Expense cannot be reopened/i);
  assert.match(persistenceSource, /const reopenOnly = eventType === "REOPENED"/);
  assert.match(persistenceSource, /const vendorId = reopenOnly\s*\?\s*existingRow\.vendor_id/);
  assert.match(persistenceSource, /invoice_number: reopenOnly \? existingRow\.invoice_number/);
  assert.match(persistenceSource, /duplicate_status: reopenOnly \? existingRow\.duplicate_status/);
  assert.match(persistenceSource, /document_type: reopenOnly \? existingRow\.document_type/);
  assert.match(persistenceSource, /currentData = reopenOnly\s*\?\s*\{\s*\.\.\.\(existingRow\.current_data \|\| \{\}\)/s);
  assert.match(persistenceSource, /const persistedReviewStatus = reopenOnly \? "NEEDS_REVIEW"/);
  assert.match(persistenceSource, /reviewStatus: persistedReviewStatus/);
  assert.match(persistenceSource, /verifiedAt: null/);
  assert.match(persistenceSource, /if \(!reopenOnly\) await replaceLineItems\(updated\.id, updated\.items\)/);
});

test("the UI presents readiness reasons, exposes Expense posting facts, and routes legacy repairs into review", () => {
  assert.match(expensesPage, /Needs completion/);
  assert.match(expensesPage, /Fix invoice/);
  assert.match(expensesPage, /Supplier documents requiring review or completion/);
  assert.match(reviewSource, /Expense description/);
  assert.match(reviewSource, /Create &amp; Link Vendor/);
  assert.match(reviewSource, /Link this Vendor/);
  assert.match(reviewSource, /Confirm description/);
  assert.match(reviewSource, /Blocking actions required/);
  assert.match(reviewSource, /Advisories and review notes/);
  assert.match(reviewSource, /Editing correction/);
  assert.match(reviewSource, /Invoice actions/);
  assert.match(readinessSource, /Select or create a canonical Vendor/);
  assert.match(workspaceSource, /supplierReadiness\.complete/);
  assert.match(workspaceSource, /repairMode/);
  assert.match(appSource, /active authoritative Expense/);
  assert.match(appSource, /handleFixSupplierInvoice/);
  assert.match(expensesPage, /onClick=\{\(\) => void onFix\(invoice\)\}/);
  assert.match(appSource, /const currentInvoice = invoicesRef\.current\.find\(\(candidate\) => candidate\.id === invoice\.id\)/);
  assert.match(appSource, /setSupplierRepairInvoiceId\(repairInvoice\.id\);\s*openInvoiceForReview\(repairInvoice, "expenses"\)/);
  assert.match(appSource, /workspaceOrigin === "expenses"/);
  assert.match(appSource, /const revisionIsCurrent = \(editRevisionRef\.current\.get\(invoice\.id\) \|\| 0\) === revision/);
  assert.match(correctionSource, /Delete unused invoice/);
  assert.match(correctionSource, /Archive \/ hide invoice/);
  assert.match(correctionSource, /window\.confirm\(`Delete permanently\? This unused \$\{entityLabel\}/);
});
