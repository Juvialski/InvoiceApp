import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeStorageSegment,
  buildCanonicalTargetKey,
  calculateSha256Hex,
  evaluateDedupStrategy,
  formatSha256Fingerprint,
  isCompanyScopedPath,
  normalizeSha256,
  parseStorageKey,
  sanitizeStorageFileName,
  type DocumentStorageProvider,
  type GetObjectResult,
  type ObjectLookupQuery,
  type ObjectMetadata,
  type PutObjectInput,
  type PutObjectResult,
  type ReadUrlOptions,
} from "../src/lib/storage/index.ts";

test("buildCanonicalTargetKey creates expected company-scoped target paths", () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const documentId = "doc-12345";
  const versionOrHash = "v1-abcdef123456";
  const fileName = "invoice-2026-001.pdf";

  const key = buildCanonicalTargetKey({
    companyId,
    documentId,
    versionOrHash,
    fileName,
  });

  assert.equal(
    key,
    `companies/${companyId}/objects/${documentId}/${versionOrHash}/invoice-2026-001.pdf`,
  );

  const parsed = parseStorageKey(key);
  assert.equal(parsed.isValid, true);
  assert.equal(parsed.kind, "TARGET_CANONICAL");
  assert.equal(parsed.companyId, companyId);
  assert.equal(parsed.documentId, documentId);
  assert.equal(parsed.versionOrHash, versionOrHash);
  assert.equal(parsed.fileName, "invoice-2026-001.pdf");
});

test("sanitizeStorageFileName prevents path traversal and dangerous characters", () => {
  assert.equal(sanitizeStorageFileName("../../etc/passwd"), "passwd");
  assert.equal(sanitizeStorageFileName("..\\..\\Windows\\System32\\cmd.exe"), "cmd.exe");
  assert.equal(sanitizeStorageFileName("invoice%2e%2e%2fhidden.pdf"), "hidden.pdf");
  assert.equal(sanitizeStorageFileName(".env"), "env");
  assert.equal(sanitizeStorageFileName("...///...file.txt"), "file.txt");
  assert.equal(sanitizeStorageFileName("doc\0nullbyte.pdf"), "docnullbyte.pdf");
  assert.equal(sanitizeStorageFileName("CON.pdf"), "file_CON.pdf");
  assert.equal(sanitizeStorageFileName("aux.txt"), "file_aux.txt");
  assert.equal(sanitizeStorageFileName("normal_drawing_revA.pdf"), "normal_drawing_revA.pdf");
  assert.equal(sanitizeStorageFileName("  spaces and symbols #$@! .png  "), "spaces_and_symbols_.png");
  assert.equal(sanitizeStorageFileName(""), "document.bin");
});

test("assertSafeStorageSegment enforces strict segment boundaries", () => {
  assert.equal(assertSafeStorageSegment("11111111-2222-3333-4444-555555555555"), "11111111-2222-3333-4444-555555555555");
  assert.equal(assertSafeStorageSegment("doc-12345"), "doc-12345");

  assert.throws(() => assertSafeStorageSegment("../escaped"), /path traversal|unsafe path/);
  assert.throws(() => assertSafeStorageSegment(".."), /path traversal|unsafe path/);
  assert.throws(() => assertSafeStorageSegment(""), /must not be empty/);
  assert.throws(() => assertSafeStorageSegment("foo/bar"), /path traversal|unsafe path/);
  assert.throws(() => assertSafeStorageSegment("foo\\bar"), /path traversal|unsafe path/);
  assert.throws(() => assertSafeStorageSegment("invalid*char"), /unsafe path/);
});

test("parseStorageKey correctly classifies legacy and canonical paths", () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const userId = "99999999-8888-7777-6666-555555555555";

  // Target canonical
  const canonical = parseStorageKey(`companies/${companyId}/objects/doc-1/sha256-abc/file.pdf`);
  assert.equal(canonical.kind, "TARGET_CANONICAL");
  assert.equal(canonical.companyId, companyId);
  assert.equal(canonical.documentId, "doc-1");

  // Legacy manual invoice
  const manualInvoice = parseStorageKey(`companies/${companyId}/invoices/manual/2026/08/abcdef-1234-inv.pdf`);
  assert.equal(manualInvoice.kind, "LEGACY_INVOICE_MANUAL");
  assert.equal(manualInvoice.companyId, companyId);
  assert.equal(manualInvoice.fileName, "abcdef-1234-inv.pdf");

  // Legacy email invoice
  const emailInvoice = parseStorageKey(`companies/${companyId}/invoices/2026/08/msg-123/att-456-abcdef-inv.pdf`);
  assert.equal(emailInvoice.kind, "LEGACY_INVOICE_EMAIL");
  assert.equal(emailInvoice.companyId, companyId);

  // Legacy email eml
  const emailEml = parseStorageKey(`companies/${companyId}/emails/2026/08/msg-123/message.eml`);
  assert.equal(emailEml.kind, "LEGACY_EMAIL_EML");
  assert.equal(emailEml.companyId, companyId);

  // Legacy payroll import
  const payroll = parseStorageKey(`companies/${companyId}/payroll-imports/batch-123/timesheet.csv`);
  assert.equal(payroll.kind, "LEGACY_PAYROLL_IMPORT");
  assert.equal(payroll.companyId, companyId);
  assert.equal(payroll.documentId, "batch-123");

  // Legacy engineering revision
  const engineering = parseStorageKey(`companies/${companyId}/documents/doc-123/revisions/rev-456/drawing.pdf`);
  assert.equal(engineering.kind, "LEGACY_ENGINEERING_REVISION");
  assert.equal(engineering.companyId, companyId);
  assert.equal(engineering.documentId, "doc-123");
  assert.equal(engineering.versionOrHash, "rev-456");

  // Legacy pre-company user-scoped path
  const userScoped = parseStorageKey(`${userId}/invoices/sample.pdf`);
  assert.equal(userScoped.kind, "LEGACY_USER_SCOPED");
  assert.equal(userScoped.legacyUserId, userId);

  // Traversal attack path
  const traversal = parseStorageKey(`companies/${companyId}/invoices/../../../etc/passwd`);
  assert.equal(traversal.kind, "INVALID");
  assert.equal(traversal.isValid, false);
});

test("isCompanyScopedPath verifies expected company isolation", () => {
  const compA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const compB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  const pathA = `companies/${compA}/objects/doc-1/v1/file.pdf`;

  assert.equal(isCompanyScopedPath(pathA, compA), true);
  assert.equal(isCompanyScopedPath(pathA, compB), false);
  assert.equal(isCompanyScopedPath(`not-a-company-path/file.pdf`, compA), false);
});

test("calculateSha256Hex and normalizeSha256 work consistently", async () => {
  const encoder = new TextEncoder();
  const sampleBytes = encoder.encode("Engoryx Document Storage Foundation Test");

  const hash = await calculateSha256Hex(sampleBytes);
  assert.match(hash, /^[0-9a-f]{64}$/);

  // Normalization
  assert.equal(normalizeSha256(hash), hash);
  assert.equal(normalizeSha256(`sha256:${hash}`), hash);
  assert.equal(normalizeSha256(`SHA256:${hash.toUpperCase()}`), hash);
  assert.equal(formatSha256Fingerprint(hash), `sha256:${hash}`);

  assert.throws(() => normalizeSha256("invalid-hash"), /Invalid SHA-256 hash format/);
});

test("evaluateDedupStrategy preserves domain provenance invariants", () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  // Engineering Revisions MUST always maintain per-revision provenance
  const engStrategy = evaluateDedupStrategy({
    companyId,
    sha256,
    entityType: "ENGINEERING_REVISION",
  });
  assert.equal(engStrategy.requiresDistinctProvenance, true);
  assert.equal(engStrategy.allowBinarySharing, false);
  assert.equal(engStrategy.action, "CREATE_PROVENANCE_RECORD");

  // Engineering Revisions regression: even with existingRecordId supplied, NEVER return REUSE_EXISTING_RECORD
  const engStrategyWithExisting = evaluateDedupStrategy({
    companyId,
    sha256,
    entityType: "ENGINEERING_REVISION",
    existingRecordId: "existing-revision-record-id",
  });
  assert.equal(engStrategyWithExisting.requiresDistinctProvenance, true);
  assert.equal(engStrategyWithExisting.allowBinarySharing, false);
  assert.equal(engStrategyWithExisting.action, "CREATE_PROVENANCE_RECORD");

  // Payroll Import Batches MUST preserve separate batch records
  const payrollStrategy = evaluateDedupStrategy({
    companyId,
    sha256,
    entityType: "PAYROLL_IMPORT",
  });
  assert.equal(payrollStrategy.requiresDistinctProvenance, true);
  assert.equal(payrollStrategy.action, "CREATE_PROVENANCE_RECORD");

  // Existing invoice record reuse
  const existingInvoiceStrategy = evaluateDedupStrategy({
    companyId,
    sha256,
    entityType: "INVOICE",
    existingRecordId: "source-doc-existing",
  });
  assert.equal(existingInvoiceStrategy.action, "REUSE_EXISTING_RECORD");
  assert.equal(existingInvoiceStrategy.requiresDistinctProvenance, false);

  // New invoice record
  const newInvoiceStrategy = evaluateDedupStrategy({
    companyId,
    sha256,
    entityType: "INVOICE",
  });
  assert.equal(newInvoiceStrategy.action, "STORE_NEW_OBJECT");
  assert.equal(newInvoiceStrategy.requiresDistinctProvenance, true);
});

test("DocumentStorageProvider in-memory mock validates neutral interface contracts", async () => {
  class MemoryStorageProvider implements DocumentStorageProvider {
    readonly id = "memory" as const;
    private readonly store = new Map<string, { bytes: Uint8Array; metadata: ObjectMetadata }>();

    private makeKey(companyId: string, bucket: string, key: string) {
      return `${companyId}:${bucket}:${key}`;
    }

    async putObject(input: PutObjectInput): Promise<PutObjectResult> {
      const sha256 = input.sha256 || (await calculateSha256Hex(input.bytes));
      const metadata: ObjectMetadata = {
        companyId: input.companyId,
        bucket: input.bucket,
        key: input.key,
        sizeBytes: input.bytes.byteLength,
        contentType: input.contentType,
        sha256,
        createdAt: new Date().toISOString(),
        customMetadata: input.customMetadata,
      };
      this.store.set(this.makeKey(input.companyId, input.bucket, input.key), {
        bytes: new Uint8Array(input.bytes),
        metadata,
      });
      return {
        ref: {
          providerId: this.id,
          bucket: input.bucket,
          key: input.key,
          companyId: input.companyId,
          sha256,
          sizeBytes: input.bytes.byteLength,
          contentType: input.contentType,
        },
        metadata,
      };
    }

    async getObject(query: ObjectLookupQuery): Promise<GetObjectResult> {
      const item = this.store.get(this.makeKey(query.companyId, query.bucket, query.key));
      if (!item) throw new Error("Object not found.");
      return { bytes: new Uint8Array(item.bytes), metadata: { ...item.metadata } };
    }

    async getSignedUrl(query: ObjectLookupQuery, options?: ReadUrlOptions): Promise<string> {
      const item = this.store.get(this.makeKey(query.companyId, query.bucket, query.key));
      if (!item) throw new Error("Object not found.");
      const expires = options?.expiresInSeconds || 3600;
      return `https://storage.mock.local/${query.bucket}/${query.key}?token=mock&exp=${expires}`;
    }

    async deleteObject(query: ObjectLookupQuery): Promise<void> {
      this.store.delete(this.makeKey(query.companyId, query.bucket, query.key));
    }

    async headObject(query: ObjectLookupQuery): Promise<ObjectMetadata | null> {
      const item = this.store.get(this.makeKey(query.companyId, query.bucket, query.key));
      return item ? { ...item.metadata } : null;
    }
  }

  const provider: DocumentStorageProvider = new MemoryStorageProvider();
  const companyId = "11111111-2222-3333-4444-555555555555";
  const bucket = "invoice-originals";
  const key = `companies/${companyId}/objects/doc-test/v1/test.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 Mock PDF Content");

  const putResult = await provider.putObject({
    companyId,
    bucket,
    key,
    bytes,
    contentType: "application/pdf",
  });

  assert.equal(putResult.ref.companyId, companyId);
  assert.equal(putResult.ref.bucket, bucket);
  assert.equal(putResult.ref.key, key);
  assert.equal(putResult.metadata.sizeBytes, bytes.byteLength);

  const headResult = await provider.headObject({ companyId, bucket, key });
  assert.ok(headResult);
  assert.equal(headResult?.sha256, putResult.metadata.sha256);

  const getResult = await provider.getObject({ companyId, bucket, key });
  assert.equal(getResult.bytes.byteLength, bytes.byteLength);
  assert.equal(new TextDecoder().decode(getResult.bytes), "%PDF-1.4 Mock PDF Content");

  const url = await provider.getSignedUrl({ companyId, bucket, key }, { expiresInSeconds: 1800 });
  assert.ok(url.includes("exp=1800"));

  await provider.deleteObject({ companyId, bucket, key });
  const afterDelete = await provider.headObject({ companyId, bucket, key });
  assert.equal(afterDelete, null);
});
