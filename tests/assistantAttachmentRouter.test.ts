import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSISTANT_MAX_ATTACHMENT_BYTES,
  ASSISTANT_MAX_TOTAL_ATTACHMENT_BYTES,
  attachmentKindFor,
  validateAssistantAttachment,
} from "../src/assistant/attachmentRouter.ts";

test("assistant attachment routing accepts the bounded supported formats", () => {
  const cases = [
    ["invoice.pdf", "application/pdf", "PDF"],
    ["invoice.JPG", "image/jpeg", "IMAGE"],
    ["invoice.jpeg", "image/jpeg", "IMAGE"],
    ["invoice.png", "image/png", "IMAGE"],
    ["invoice.webp", "image/webp", "IMAGE"],
    ["payroll.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "XLSX"],
    ["rows.csv", "text/csv", "CSV"],
    ["notes.txt", "text/plain", "TEXT"],
  ] as const;

  for (const [name, type, kind] of cases) {
    const result = validateAssistantAttachment({ name, type, size: 1024 });
    assert.equal(result.ok, true, name);
    if (result.ok) assert.equal(result.metadata.kind, kind);
  }
  assert.equal(attachmentKindFor("invoice.pdf", "application/pdf"), "PDF");
  assert.equal(attachmentKindFor("invoice.pdf", "text/plain"), null);
});

test("assistant attachments reject unsupported types, mismatched MIME, and size limits", () => {
  assert.equal(validateAssistantAttachment({ name: "invoice.exe", type: "application/octet-stream", size: 1 }).ok, false);
  const mismatch = validateAssistantAttachment({ name: "invoice.pdf", type: "image/png", size: 1 });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.code, "MIME_MISMATCH");

  const tooLarge = validateAssistantAttachment({ name: "invoice.pdf", type: "application/pdf", size: ASSISTANT_MAX_ATTACHMENT_BYTES + 1 });
  assert.equal(tooLarge.ok, false);
  if (!tooLarge.ok) assert.equal(tooLarge.code, "FILE_TOO_LARGE");

  const totalTooLarge = validateAssistantAttachment({ name: "second.pdf", type: "application/pdf", size: 1 }, { existingTotalBytes: ASSISTANT_MAX_TOTAL_ATTACHMENT_BYTES });
  assert.equal(totalTooLarge.ok, false);
  if (!totalTooLarge.ok) assert.equal(totalTooLarge.code, "TOTAL_TOO_LARGE");
});

test("spreadsheet routing is data-only and provides an explicit warning", () => {
  for (const name of ["costs.xlsx", "costs.csv"]) {
    const result = validateAssistantAttachment({ name, type: name.endsWith("xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv", size: 10 });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.metadata.routeHint, "STRUCTURED_DATA");
      assert.match(result.metadata.warning || "", /not executed/i);
    }
  }
});
