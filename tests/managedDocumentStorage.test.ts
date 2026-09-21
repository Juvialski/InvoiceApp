import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_MANAGED_DOCUMENT_BYTES,
  validateManagedDocumentBytes,
} from "../src/lib/fileSecurity.ts";
import {
  buildManagedDocumentStoragePath,
  isManagedDocumentStoragePath,
  parseStorageKey,
} from "../src/lib/storage/keys.ts";

const COMPANY_ID = "11111111-2222-4333-8444-555555555555";
const DOCUMENT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const VERSION_ID = "99999999-8888-4777-8666-555555555555";

test("managed Storage paths are company/document/version scoped and sanitized", () => {
  const path = buildManagedDocumentStoragePath(COMPANY_ID, DOCUMENT_ID, VERSION_ID, "../../Warranty Certificate.pdf");
  assert.equal(path, `companies/${COMPANY_ID}/managed-documents/${DOCUMENT_ID}/versions/${VERSION_ID}/Warranty_Certificate.pdf`);
  assert.equal(parseStorageKey(path).kind, "MANAGED_DOCUMENT_VERSION");
  assert.equal(isManagedDocumentStoragePath(path, COMPANY_ID, DOCUMENT_ID, VERSION_ID), true);
  assert.equal(isManagedDocumentStoragePath(path, "22222222-2222-4333-8444-555555555555", DOCUMENT_ID, VERSION_ID), false);
  assert.equal(isManagedDocumentStoragePath(path, COMPANY_ID, DOCUMENT_ID, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"), false);
});

test("managed file policy accepts safe repository-supported document types", () => {
  validateManagedDocumentBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), "application/pdf", "warranty.pdf");
  validateManagedDocumentBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg", "photo.jpg");
  validateManagedDocumentBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "checklist.docx");
  validateManagedDocumentBytes(new TextEncoder().encode("item,quantity\nPump,2\n"), "text/csv", "materials.csv");
});

test("managed file policy rejects active content, mismatched types, binary text, and oversized uploads", () => {
  assert.throws(() => validateManagedDocumentBytes(new TextEncoder().encode("<svg><script>alert(1)</script></svg>"), "image/svg+xml", "bad.svg"), /Active HTML, SVG, or XML/);
  assert.throws(() => validateManagedDocumentBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), "image/png", "wrong.png"), /must match/);
  assert.throws(() => validateManagedDocumentBytes(new Uint8Array([0x00, 0x01]), "text/plain", "binary.txt"), /binary data/);
  assert.throws(() => validateManagedDocumentBytes(new Uint8Array(MAX_MANAGED_DOCUMENT_BYTES + 1), "text/plain", "large.txt"), /exceeds/);
});
