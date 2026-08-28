import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_GMAIL_ATTACHMENT_COUNT,
  safeStorageSegment,
  validateGmailAttachmentEnvelope,
  validateGmailRawMessage,
  validateInvoiceDocumentBytes,
  validatePayrollImportBytes,
} from "../src/lib/fileSecurity.ts";

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

test("persisted document validation rejects MIME/signature confusion", () => {
  assert.doesNotThrow(() => validateInvoiceDocumentBytes(pdf, "application/pdf", "invoice.pdf"));
  assert.throws(() => validateInvoiceDocumentBytes(png, "application/pdf", "invoice.pdf"), /valid PDF/i);
  assert.throws(() => validateInvoiceDocumentBytes(pdf, "image/png", "invoice.png"), /valid PDF|JPEG|PNG|WebP/i);
});

test("Storage path segments reject traversal and separators", () => {
  assert.equal(safeStorageSegment("abc-123", "id"), "abc-123");
  assert.throws(() => safeStorageSegment("../other", "id"), /unsafe path/i);
  assert.throws(() => safeStorageSegment("a/b", "id"), /unsafe path/i);
});

test("Gmail envelope and raw message limits fail closed", () => {
  assert.throws(() => validateGmailAttachmentEnvelope(Array.from({ length: MAX_GMAIL_ATTACHMENT_COUNT + 1 }, () => ({ dataBase64: "AA==" }))), /at most/i);
  assert.doesNotThrow(() => validateGmailRawMessage(new TextEncoder().encode("From: sender@example.com\r\nSubject: Invoice\r\n\r\nBody")));
  assert.throws(() => validateGmailRawMessage(new Uint8Array([0, 1, 2, 3])), /RFC-style/i);
});

test("payroll imports require supported signatures", () => {
  const xlsx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
  assert.doesNotThrow(() => validatePayrollImportBytes(xlsx, "payroll.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
  assert.throws(() => validatePayrollImportBytes(pdf, "payroll.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), /signature/i);
});
