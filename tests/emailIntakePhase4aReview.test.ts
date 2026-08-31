import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildSenderProfileQueries,
  classifyEmailIntakeCandidate,
  matchEmailIntakeProfiles,
} from "../src/lib/emailIntake.ts";
import type { EmailIntakeProfile, GmailMessageCandidate } from "../src/types.ts";

const now = "2026-08-31T00:00:00.000Z";

function profile(overrides: Partial<EmailIntakeProfile> & Pick<EmailIntakeProfile, "id" | "name" | "suggestedDestination">): EmailIntakeProfile {
  return {
    companyId: "company-1",
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function message(overrides: Partial<GmailMessageCandidate> & Pick<GmailMessageCandidate, "id" | "sender">): GmailMessageCandidate {
  return {
    threadId: `thread-${overrides.id}`,
    to: ["finance@company.example"],
    cc: [],
    subject: "Documents attached",
    receivedAt: now,
    snippet: "Documents attached",
    bodyText: "Documents attached",
    labels: [],
    attachments: [{ attachmentId: "att-1", filename: "document.pdf", mimeType: "application/pdf", size: 1000 }],
    ...overrides,
  };
}

test("Email Intake Phase 4A review: exact sender rules outrank conflicting domain rules", () => {
  const exact = profile({
    id: "exact",
    name: "Exact invoice sender",
    senderEmail: "billing@supplier.example",
    suggestedDestination: "INVOICE",
  });
  const domain = profile({
    id: "domain",
    name: "Supplier expense domain",
    senderDomain: "supplier.example",
    suggestedDestination: "EXPENSE",
  });

  const candidate = message({ id: "msg-exact", sender: "Billing <billing@supplier.example>" });
  const matches = matchEmailIntakeProfiles(candidate, [domain, exact]);

  assert.deepEqual(matches.map((item) => item.id), ["exact"]);
  assert.equal(classifyEmailIntakeCandidate(candidate, [domain, exact]).suggestedDestination, "INVOICE");
});

test("Email Intake Phase 4A review: an exact-email profile never falls back to its stored domain", () => {
  const exactOnly = profile({
    id: "exact-only",
    name: "Exact-only sender",
    senderEmail: "billing@supplier.example",
    senderDomain: "supplier.example",
    suggestedDestination: "INVOICE",
  });

  const differentMailbox = message({ id: "msg-other", sender: "alerts@supplier.example" });
  assert.deepEqual(matchEmailIntakeProfiles(differentMailbox, [exactOnly]), []);
});

test("Email Intake Phase 4A review: subject conditions inspect the subject only", () => {
  const subjectRule = profile({
    id: "subject-rule",
    name: "Monthly statement subject",
    senderEmail: "notices@bank.example",
    subjectContains: "monthly statement",
    suggestedDestination: "BANK_STATEMENT",
  });

  const bodyOnly = message({
    id: "msg-body-only",
    sender: "notices@bank.example",
    subject: "Your documents",
    snippet: "monthly statement is mentioned only in the snippet",
    bodyText: "monthly statement is mentioned only in the body",
  });
  assert.deepEqual(matchEmailIntakeProfiles(bodyOnly, [subjectRule]), []);

  const subjectMatch = { ...bodyOnly, id: "msg-subject", subject: "Your Monthly Statement" };
  assert.deepEqual(matchEmailIntakeProfiles(subjectMatch, [subjectRule]).map((item) => item.id), ["subject-rule"]);
});

test("Email Intake Phase 4A review: sender-domain Gmail queries are bounded and do not use unsupported wildcard syntax", () => {
  const profiles = Array.from({ length: 18 }, (_, index) => profile({
    id: `rule-${index}`,
    name: `Rule ${index}`,
    senderDomain: `vendor${index}.example`,
    suggestedDestination: "INVOICE",
  }));

  const queries = buildSenderProfileQueries(profiles, { days: 30 });
  assert.equal(queries.length, 3);
  assert.ok(queries.every((query) => query.includes("newer_than:30d")));
  assert.ok(queries.every((query) => !query.includes("from:*@")));
  assert.ok(queries.some((query) => query.includes("from:vendor17.example")));
});

test("Email Intake Phase 4A review: strong document evidence conflicts safely with the wrong saved rule", () => {
  const bankRule = profile({
    id: "bank-rule",
    name: "Bank sender",
    senderEmail: "docs@mixed.example",
    suggestedDestination: "BANK_STATEMENT",
  });
  const invoiceDocument = message({
    id: "invoice-conflict",
    sender: "docs@mixed.example",
    subject: "VAT Sales Invoice 2026-104",
    bodyText: "Official VAT sales invoice with TIN 123-456-789",
  });
  const invoiceConflict = classifyEmailIntakeCandidate(invoiceDocument, [bankRule]);
  assert.equal(invoiceConflict.suggestedDestination, "UNSUPPORTED");
  assert.match(invoiceConflict.conflictReason || "", /explicit invoice document signals/i);

  const invoiceRule = profile({
    id: "invoice-rule",
    name: "Invoice sender",
    senderEmail: "receipts@mixed.example",
    suggestedDestination: "INVOICE",
  });
  const receiptDocument = message({
    id: "receipt-conflict",
    sender: "receipts@mixed.example",
    subject: "Official Receipt OR-9981",
    bodyText: "Official receipt amount paid PHP 1,250.00",
    attachments: [{ attachmentId: "att-r", filename: "official_receipt.jpg", mimeType: "image/jpeg", size: 1000 }],
  });
  const receiptConflict = classifyEmailIntakeCandidate(receiptDocument, [invoiceRule]);
  assert.equal(receiptConflict.suggestedDestination, "UNSUPPORTED");
  assert.match(receiptConflict.conflictReason || "", /explicit receipt document signals/i);
});

test("Email Intake Phase 4A review: database constraints reject malformed or dangerously broad sender rules", () => {
  const sql = readFileSync("supabase/migrations/20260831130000_email_intake_profiles.sql", "utf8");

  assert.match(sql, /email_intake_profiles_name_nonblank/);
  assert.match(sql, /email_intake_profiles_sender_email_format/);
  assert.match(sql, /email_intake_profiles_sender_domain_format/);
  assert.match(sql, /'gmail\.com'/);
  assert.match(sql, /'outlook\.com'/);
  assert.match(sql, /has_company_permission\(company_id, 'gmail\.manage'\)/);
});
