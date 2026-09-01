import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateSha256Hex,
  evaluateDedupStrategy,
  formatSha256Fingerprint,
  normalizeSha256,
  shouldReusePhysicalObject,
  validateDomainProvenance,
} from "../src/lib/storage/index.ts";

test("Deduplication: Invoices allow physical binary reuse when matching hash exists", () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  // Case 1: First upload of invoice
  const firstDecision = evaluateDedupStrategy({
    companyId,
    sha256,
    entityType: "INVOICE",
  });
  assert.equal(firstDecision.action, "STORE_NEW_OBJECT");
  assert.equal(firstDecision.allowBinarySharing, true);
  assert.equal(firstDecision.requiresDistinctProvenance, true);
  assert.equal(shouldReusePhysicalObject({ companyId, sha256, entityType: "INVOICE" }), false);

  // Case 2: Matching invoice already exists in company
  const duplicateDecision = evaluateDedupStrategy({
    companyId,
    sha256,
    entityType: "INVOICE",
    existingRecordId: "doc-invoice-existing-123",
  });
  assert.equal(duplicateDecision.action, "REUSE_EXISTING_RECORD");
  assert.equal(duplicateDecision.allowBinarySharing, true);
  assert.equal(duplicateDecision.requiresDistinctProvenance, false);
  assert.equal(
    shouldReusePhysicalObject({
      companyId,
      sha256,
      entityType: "INVOICE",
      existingRecordId: "doc-invoice-existing-123",
    }),
    true,
  );
});

test("Deduplication: Expenses preserve separate business records while permitting underlying receipt binary reuse", () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  // New expense record referencing an existing source document binary
  const decision = evaluateDedupStrategy({
    companyId,
    sha256,
    entityType: "EXPENSE",
    existingRecordId: "doc-receipt-existing-456",
  });

  // Physical receipt binary can be linked/reused
  assert.equal(decision.action, "REUSE_EXISTING_RECORD");
  assert.equal(decision.allowBinarySharing, true);
  assert.equal(decision.requiresDistinctProvenance, false);
});

test("Deduplication: Engineering Document Revisions strictly preserve immutable logical revision provenance even if file hash matches", () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const sha256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  const decision = evaluateDedupStrategy({
    companyId,
    sha256,
    entityType: "ENGINEERING_REVISION",
    existingRecordId: "rev-old-123", // Matching hash from previous revision
    sourceContext: { documentId: "doc-eng-1", revisionId: "rev-new-456" },
  });

  // CRITICAL INVARIANT: Engineering revisions MUST NOT reuse existing revision records or eliminate new revisions
  assert.equal(decision.action, "CREATE_PROVENANCE_RECORD");
  assert.equal(decision.allowBinarySharing, false);
  assert.equal(decision.requiresDistinctProvenance, true);

  // Validation function succeeds on valid revision context
  assert.doesNotThrow(() =>
    validateDomainProvenance({
      companyId,
      sha256,
      entityType: "ENGINEERING_REVISION",
    }),
  );
});

test("Deduplication: Payroll Import Batches preserve isolated staged lifecycle for repeated workbooks", () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const sha256 = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

  const decision = evaluateDedupStrategy({
    companyId,
    sha256,
    entityType: "PAYROLL_IMPORT",
    existingRecordId: "batch-previous-789",
  });

  // CRITICAL INVARIANT: Each payroll import batch must retain its own staging rows and audit record
  assert.equal(decision.action, "CREATE_PROVENANCE_RECORD");
  assert.equal(decision.allowBinarySharing, false);
  assert.equal(decision.requiresDistinctProvenance, true);
});

test("Deduplication: Gmail email messages and attachments maintain distinct message provenance", () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const sha256 = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

  // When a new email message carries an attachment with the same hash as another email
  const decision = evaluateDedupStrategy({
    companyId,
    sha256,
    entityType: "EMAIL_INTAKE",
    sourceContext: { emailMessageId: "msg-email-2", gmailAttachmentId: "att-2" },
  });

  assert.equal(decision.action, "CREATE_PROVENANCE_RECORD");
  assert.equal(decision.allowBinarySharing, true);
  assert.equal(decision.requiresDistinctProvenance, true);
});

test("Deduplication: Hash utility helpers normalize and format correctly", () => {
  const rawHash = "AABBCCDDEEFF00112233445566778899AABBCCDDEEFF00112233445566778899";
  const normalized = normalizeSha256(rawHash);
  assert.equal(normalized, rawHash.toLowerCase());

  const prefixed = `sha256:${rawHash}`;
  assert.equal(normalizeSha256(prefixed), rawHash.toLowerCase());

  const fingerprint = formatSha256Fingerprint(rawHash);
  assert.equal(fingerprint, `sha256:${rawHash.toLowerCase()}`);

  assert.throws(() => normalizeSha256("invalid-short-hash"), /Invalid SHA-256 hash/);
});
