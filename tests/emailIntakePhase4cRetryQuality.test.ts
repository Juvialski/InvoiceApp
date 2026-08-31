import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateExtractionQuality,
  shouldRunAutomaticRetry,
  chooseBestExtractionCandidate,
  retryFocusForQuality,
} from "../src/utils/extractionQuality.ts";
import type { InvoiceData } from "../src/types.ts";

test("Phase 4C Retry Quality: Clean first extraction with GOOD status does NOT trigger a second call", () => {
  const goodInvoice: Partial<InvoiceData> = {
    invoiceNumber: "INV-88001",
    invoiceDate: "2026-08-31",
    vendor: { name: "Prime Power Corp", taxId: "111-222-333-000" },
    customer: { name: "ACME Engineering", taxId: "999-888-777-000" },
    currency: "PHP",
    subtotal: 50000,
    totalTax: 6000,
    grandTotal: 56000,
    items: [
      {
        id: "item-1",
        description: "Industrial Generator Maintenance",
        quantity: 1,
        unitPrice: 50000,
        total: 50000,
      },
    ],
  };

  const quality = evaluateExtractionQuality(goodInvoice);
  assert.equal(quality.status, "GOOD");
  assert.equal(quality.requiresRetry, false);

  const shouldRetry = shouldRunAutomaticRetry("gemini-3.5-flash-lite", quality);
  assert.equal(shouldRetry, false);
});

test("Phase 4C Retry Quality: Poor first extraction triggers bounded automatic retry", () => {
  const poorInvoice: Partial<InvoiceData> = {
    // Missing invoiceNumber, vendor, items, and tax
    grandTotal: 56000,
  };

  const quality = evaluateExtractionQuality(poorInvoice);
  assert.equal(quality.requiresRetry, true);

  const shouldRetry = shouldRunAutomaticRetry("gemini-3.5-flash-lite", quality);
  assert.equal(shouldRetry, true);

  const retryFocus = retryFocusForQuality(quality);
  assert.ok(retryFocus.length > 0);
});

test("Phase 4C Retry Selection: Better candidate from retry attempt is selected", () => {
  const candidate1: Partial<InvoiceData> = {
    id: "cand-attempt-1",
    invoiceNumber: "INV-001",
    grandTotal: 1000,
    currency: "PHP",
    items: [],
    reviewStatus: "NEEDS_REVIEW",
  };
  const quality1 = evaluateExtractionQuality(candidate1);

  const candidate2: Partial<InvoiceData> = {
    id: "cand-attempt-2",
    invoiceNumber: "INV-001",
    invoiceDate: "2026-08-31",
    vendor: { name: "Total Energy PH", taxId: "444-555-666-000" },
    customer: { name: "ACME Engineering" },
    subtotal: 892.86,
    totalTax: 107.14,
    grandTotal: 1000,
    currency: "PHP",
    items: [
      { id: "row-1", description: "Fuel delivery", quantity: 1, unitPrice: 892.86, total: 892.86 },
    ],
    reviewStatus: "NEEDS_REVIEW",
  };
  const quality2 = evaluateExtractionQuality(candidate2);

  assert.ok(quality2.score > quality1.score);

  const selected = chooseBestExtractionCandidate([
    { candidate: candidate1, quality: quality1 },
    { candidate: candidate2, quality: quality2 },
  ]);

  assert.equal(selected?.candidate.id, "cand-attempt-2");
  assert.equal(selected?.candidate.vendor?.name, "Total Energy PH");
  assert.equal(selected?.candidate.reviewStatus, "NEEDS_REVIEW");
});

test("Phase 4C Retry Invariant: Candidate preserves NEEDS_REVIEW and is never auto-verified", () => {
  const candidate: Partial<InvoiceData> = {
    id: "cand-final",
    invoiceNumber: "INV-900",
    invoiceDate: "2026-08-31",
    vendor: { name: "Delta Supplies", taxId: "123-123-123-000" },
    subtotal: 5000,
    totalTax: 600,
    grandTotal: 5600,
    currency: "PHP",
    items: [{ id: "1", description: "Part A", quantity: 1, unitPrice: 5000, total: 5000 }],
    reviewStatus: "NEEDS_REVIEW",
  };
  const quality = evaluateExtractionQuality(candidate);

  const selected = chooseBestExtractionCandidate([{ candidate, quality }]);

  assert.equal(selected?.candidate.reviewStatus, "NEEDS_REVIEW");
  assert.equal(selected?.candidate.verifiedAt, undefined);
});
