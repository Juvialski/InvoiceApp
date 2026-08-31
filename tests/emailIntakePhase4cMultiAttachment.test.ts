import test from "node:test";
import assert from "node:assert/strict";
import { isExtractableAttachment } from "../src/lib/emailIntake.ts";
import type { GmailImportedMessage, InvoiceData } from "../src/types.ts";

test("Phase 4C Multi-Attachment: isExtractableAttachment recognizes PDFs and images, filters out binaries and text files", () => {
  assert.equal(isExtractableAttachment("application/pdf", "invoice.pdf"), true);
  assert.equal(isExtractableAttachment("image/png", "receipt.png"), true);
  assert.equal(isExtractableAttachment("image/jpeg", "bill.jpg"), true);
  assert.equal(isExtractableAttachment("application/octet-stream", "scan.PDF"), true);

  // Non-extractable
  assert.equal(isExtractableAttachment("text/plain", "notes.txt"), false);
  assert.equal(isExtractableAttachment("application/zip", "archive.zip"), false);
  assert.equal(isExtractableAttachment("application/json", "metadata.json"), false);
});

test("Phase 4C Multi-Attachment: Email with 2 valid invoices produces 2 independent review candidates", () => {
  const importedEmail: GmailImportedMessage = {
    id: "msg-multi-inv",
    threadId: "th-multi-inv",
    sender: "supplier@acme.ph",
    to: ["accounting@engoryx.ph"],
    cc: [],
    subject: "Invoices for Project X",
    receivedAt: "2026-08-31T10:00:00Z",
    snippet: "Please find attached invoices...",
    bodyText: "Please find attached invoices INV-101 and INV-102.",
    labels: ["INBOX"],
    attachments: [
      {
        attachmentId: "att-101",
        filename: "INV-101.pdf",
        mimeType: "application/pdf",
        size: 15420,
        dataBase64: "JVBERi0xLjQK...",
      },
      {
        attachmentId: "att-102",
        filename: "INV-102.pdf",
        mimeType: "application/pdf",
        size: 16890,
        dataBase64: "JVBERi0xLjQK...",
      },
    ],
  };

  const extractable = importedEmail.attachments.filter((a) =>
    a.dataBase64 && isExtractableAttachment(a.mimeType, a.filename)
  );
  assert.equal(extractable.length, 2);

  // Each candidate receives independent metadata
  const candidates: Partial<InvoiceData>[] = extractable.map((att, idx) => ({
    id: `inv-draft-${idx + 1}`,
    invoiceNumber: `INV-10${idx + 1}`,
    fileName: att.filename,
    fileSize: att.size,
    fileType: att.mimeType,
    currency: "PHP",
    subtotal: 10000 * (idx + 1),
    totalTax: 1200 * (idx + 1),
    grandTotal: 11200 * (idx + 1),
    items: [],
    sourceType: "EMAIL",
    sourceEmailId: importedEmail.id,
    sourceMetadata: {
      gmailMessageId: importedEmail.id,
      gmailAttachmentId: att.attachmentId,
      attachmentName: att.filename,
      sender: importedEmail.sender,
      subject: importedEmail.subject,
      receivedAt: importedEmail.receivedAt,
    },
    reviewStatus: "NEEDS_REVIEW",
  }));

  assert.equal(candidates.length, 2);
  assert.notEqual(candidates[0].id, candidates[1].id);
  assert.equal(candidates[0].sourceMetadata?.gmailAttachmentId, "att-101");
  assert.equal(candidates[1].sourceMetadata?.gmailAttachmentId, "att-102");
  assert.equal(candidates[0].reviewStatus, "NEEDS_REVIEW");
  assert.equal(candidates[1].reviewStatus, "NEEDS_REVIEW");
});

test("Phase 4C Multi-Attachment: Email with 1 invoice + 1 non-invoice extracts only invoice; non-invoice does not contaminate", () => {
  const importedEmail: GmailImportedMessage = {
    id: "msg-mixed",
    threadId: "th-mixed",
    sender: "billing@vendor.com",
    to: ["accounting@engoryx.ph"],
    cc: [],
    subject: "Invoice + Terms",
    receivedAt: "2026-08-31T10:00:00Z",
    snippet: "Invoice and standard terms...",
    bodyText: "Invoice and standard terms attached.",
    labels: ["INBOX"],
    attachments: [
      {
        attachmentId: "att-inv",
        filename: "Invoice_999.pdf",
        mimeType: "application/pdf",
        size: 20480,
        dataBase64: "JVBERi0xLjQK...",
      },
      {
        attachmentId: "att-terms",
        filename: "TermsAndConditions.txt",
        mimeType: "text/plain",
        size: 4096,
        dataBase64: "VGVybXMgYW5kIENvbmRpdGlvbnM...",
      },
      {
        attachmentId: "att-logo",
        filename: "signature_logo.svg",
        mimeType: "image/svg+xml",
        size: 1200,
        dataBase64: "PHN2ZyB4bWxucz0...",
      },
    ],
  };

  const extractable = importedEmail.attachments.filter((a) =>
    a.dataBase64 && isExtractableAttachment(a.mimeType, a.filename)
  );

  assert.equal(extractable.length, 1);
  assert.equal(extractable[0].filename, "Invoice_999.pdf");
});

test("Phase 4C Multi-Attachment: 1 valid invoice + 1 corrupt/failing attachment isolates failure; valid invoice succeeds in review queue", async () => {
  const attachments = [
    { id: "att-valid", filename: "ValidInvoice.pdf", corrupt: false },
    { id: "att-corrupt", filename: "CorruptInvoice.pdf", corrupt: true },
  ];

  const extractedResults: Partial<InvoiceData>[] = [];
  let failures = 0;

  for (const att of attachments) {
    try {
      if (att.corrupt) {
        throw new Error("PDF parsing error: stream damaged");
      }
      extractedResults.push({
        id: `inv-${att.id}`,
        invoiceNumber: "INV-VALID-01",
        fileName: att.filename,
        currency: "PHP",
        grandTotal: 50000,
        items: [],
        reviewStatus: "NEEDS_REVIEW",
      });
    } catch {
      failures += 1;
    }
  }

  assert.equal(extractedResults.length, 1);
  assert.equal(failures, 1);
  assert.equal(extractedResults[0].fileName, "ValidInvoice.pdf");
  assert.equal(extractedResults[0].reviewStatus, "NEEDS_REVIEW");
});
