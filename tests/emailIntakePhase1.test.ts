import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gmailProviderAuthorizationHeader } from "../src/lib/companyApi.ts";
import { classifyEmailIntakeCandidate, connectedMailboxFinanceQuery, isSupportedBankStatementAttachment } from "../src/lib/emailIntake.ts";
import type { GmailMessageCandidate } from "../src/types.ts";

function candidate(overrides: Partial<GmailMessageCandidate> = {}): GmailMessageCandidate {
  return {
    id: "message-1",
    threadId: "thread-1",
    sender: "finance@example.com",
    to: ["ops@example.com"],
    cc: [],
    subject: "",
    receivedAt: "2026-08-31T00:00:00.000Z",
    snippet: "",
    bodyText: "",
    labels: ["INBOX"],
    attachments: [],
    ...overrides,
  };
}

test("Gmail provider token uses one canonical Bearer header", () => {
  assert.equal(gmailProviderAuthorizationHeader("google-access-token"), "Bearer google-access-token");
  assert.throws(() => gmailProviderAuthorizationHeader("Bearer google-access-token"), /invalid/i);
  assert.throws(() => gmailProviderAuthorizationHeader("token with spaces"), /invalid/i);
  assert.throws(() => gmailProviderAuthorizationHeader("   "), /invalid/i);
});

test("connected mailbox query is bounded and includes statement signals supported by Cash & Banking", () => {
  const query = connectedMailboxFinanceQuery({ days: 30 });
  assert.match(query, /^newer_than:30d /);
  assert.match(query, /"bank statement"/);
  assert.match(query, /"account statement"/);
  assert.match(query, /"transaction statement"/);
  assert.match(query, /"e-statement"/);
  assert.match(query, /"monthly statement"/);
  assert.match(query, /filename:csv/);
  assert.match(query, /filename:xlsx/);

  const custom = connectedMailboxFinanceQuery({ after: "2026-08-01", before: "2026-08-31" });
  assert.match(custom, /^after:2026\/08\/01 before:2026\/09\/01 /);
});

test("shared classifier routes supported spreadsheet bank statements to Cash & Banking", () => {
  const message = candidate({
    subject: "August monthly bank statement",
    bodyText: "Attached is your transaction statement and ending balance.",
    attachments: [{ attachmentId: "a1", filename: "August-Statement.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 2048 }],
  });
  const classification = classifyEmailIntakeCandidate(message);
  assert.equal(classification.suggestedDestination, "BANK_STATEMENT");
  assert.equal(classification.isInvoiceLike, false);
  assert.deepEqual(classification.statementAttachmentIds, ["a1"]);
  assert.ok(classification.confidence >= 80);
});

test("PDF bank statements are classified as BANK_STATEMENT when statement signals are present", () => {
  const message = candidate({
    subject: "Monthly bank statement",
    bodyText: "Your bank statement is attached.",
    attachments: [{ attachmentId: "a1", filename: "statement.pdf", mimeType: "application/pdf", size: 2048 }],
  });
  const classification = classifyEmailIntakeCandidate(message);
  assert.equal(classification.suggestedDestination, "BANK_STATEMENT");
  assert.equal(isSupportedBankStatementAttachment(message.attachments[0]!), true);
});

test("invoice routing remains compatible with the existing invoice extraction path", () => {
  const classification = classifyEmailIntakeCandidate(candidate({ subject: "VAT invoice INV-2042", bodyText: "Amount due PHP 12,500", attachments: [{ attachmentId: "a1", filename: "INV-2042.pdf", mimeType: "application/pdf", size: 1024 }] }));
  assert.equal(classification.suggestedDestination, "INVOICE");
  assert.equal(classification.isInvoiceLike, true);
});

test("statement provenance migration is company-scoped and permission guarded", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260831103000_email_intake_statement_provenance.sql", import.meta.url), "utf8");
  assert.match(sql, /source_document_id uuid references public\.source_documents\(id\) on delete restrict/i);
  assert.match(sql, /sd\.company_id = new\.company_id/i);
  assert.match(sql, /public\.has_company_permission\(p_company_id, 'cash\.import'\)/i);
  assert.match(sql, /link_financial_import_source/i);
  assert.match(sql, /status = 'IMPORTED'/i);
});
