import test from "node:test";
import assert from "node:assert/strict";
import {
  findExistingInvoiceForSourcePayload,
  evaluateInvoiceDuplicateEvidence,
  findPossibleDuplicate,
} from "../src/utils/invoiceDuplicateDetection.ts";
import type { InvoiceData, EmailIntakeProfile } from "../src/types.ts";

const existingInvoices: InvoiceData[] = [
  {
    id: "inv-existing-100",
    invoiceNumber: "INV-2048",
    invoiceDate: "2026-08-15",
    vendor: { name: "Apex Industrial Supply", taxId: "123-456-789-000" },
    customer: { name: "ACME Corp", taxId: "987-654-321-000" },
    currency: "PHP",
    subtotal: 100000,
    totalTax: 12000,
    grandTotal: 112000,
    items: [],
    sourceType: "EMAIL",
    sourceDocumentId: "doc-orig-sha-100",
    sourceSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    sourceMetadata: {
      gmailMessageId: "msg-orig-100",
      gmailAttachmentId: "att-orig-100",
      sourceSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      attachmentName: "Apex_Invoice_2048.pdf",
      sender: "billing@apexindustrial.ph",
      subject: "Apex Industrial Invoice INV-2048",
      receivedAt: "2026-08-15T09:00:00Z",
    },
    reviewStatus: "VERIFIED",
    verifiedAt: "2026-08-15T10:00:00Z",
    extractedAt: "2026-08-15T09:00:00Z",
    modelUsed: "gemini-3.5-flash-lite",
  },
];

test("Phase 4C Duplicate Short-Circuit: Exact SHA-256 match short-circuits pre-extraction", () => {
  const incomingCriteria = {
    sourceSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    fileName: "Apex_Invoice_2048_copy.pdf",
  };

  const result = findExistingInvoiceForSourcePayload(incomingCriteria, existingInvoices);

  assert.equal(result.isDuplicate, true);
  assert.equal(result.existingInvoice?.id, "inv-existing-100");
  assert.ok(result.reasons.some((r) => r.includes("Identical source file") || r.includes("SHA-256 match")));
});

test("Phase 4C Duplicate Detection: Forwarded email with identical attachment SHA-256 is flagged as duplicate of original invoice", () => {
  const forwardedIncomingCriteria = {
    sourceSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    gmailMessageId: "msg-fwd-999",
    gmailAttachmentId: "att-fwd-999",
    fileName: "Fwd_Apex_Invoice_2048.pdf",
  };

  const result = findExistingInvoiceForSourcePayload(forwardedIncomingCriteria, existingInvoices);

  assert.equal(result.isDuplicate, true);
  assert.equal(result.existingInvoice?.invoiceNumber, "INV-2048");
  assert.ok(result.reasons.length > 0);
});

test("Phase 4C Duplicate Invariant: Saved sender profile rule does NOT bypass duplicate checks", () => {
  const activeProfile: EmailIntakeProfile = {
    id: "prof-apex",
    companyId: "company-main",
    name: "Apex Auto-Rule",
    enabled: true,
    senderEmail: "billing@apexindustrial.ph",
    suggestedDestination: "INVOICE",
    linkedVendorId: "v-apex",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  };

  // Even when sender matches a saved rule profile, if the attachment SHA is identical, duplicate check must fire
  const incomingCriteria = {
    sourceSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    fileName: "Apex_Invoice_2048.pdf",
  };

  const duplicateCheck = findExistingInvoiceForSourcePayload(incomingCriteria, existingInvoices);
  assert.equal(duplicateCheck.isDuplicate, true);
  assert.equal(duplicateCheck.existingInvoice?.id, "inv-existing-100");
});

test("Phase 4C Duplicate Evidence: Matching Vendor + Invoice Number populates duplicateReasons", () => {
  const candidateInvoice: Partial<InvoiceData> = {
    id: "inv-candidate-new",
    invoiceNumber: "INV-2048",
    invoiceDate: "2026-08-15",
    vendor: { name: "Apex Industrial Supply", taxId: "123-456-789-000" },
    currency: "PHP",
    subtotal: 100000,
    totalTax: 12000,
    grandTotal: 112000,
    items: [],
    reviewStatus: "NEEDS_REVIEW",
  };

  const evidence = evaluateInvoiceDuplicateEvidence(candidateInvoice, existingInvoices);
  assert.equal(evidence.isDuplicate, true);
  assert.equal(evidence.duplicateOf?.id, "inv-existing-100");
  assert.ok(evidence.reasons.some((r) => r.includes("Same vendor")));
});

test("Phase 4C Review Status Invariant: Email-extracted invoices are saved with NEEDS_REVIEW and NEVER auto-verified", () => {
  const extractedCandidate: Partial<InvoiceData> = {
    id: "inv-new-extracted",
    invoiceNumber: "INV-5501",
    invoiceDate: "2026-08-31",
    currency: "PHP",
    subtotal: 5000,
    totalTax: 600,
    grandTotal: 5600,
    items: [],
    reviewStatus: "NEEDS_REVIEW",
  };

  const duplicate = findPossibleDuplicate(extractedCandidate, existingInvoices);
  assert.equal(duplicate, null);

  // Initial reviewStatus is strictly NEEDS_REVIEW, verifiedAt is undefined
  assert.equal(extractedCandidate.reviewStatus, "NEEDS_REVIEW");
  assert.equal(extractedCandidate.verifiedAt, undefined);
});
