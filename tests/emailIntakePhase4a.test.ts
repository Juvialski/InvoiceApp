import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyEmailIntakeCandidate,
  matchEmailIntakeProfiles,
  validateEmailIntakeProfile,
  buildSenderProfileQueries,
  normalizeEmail,
  normalizeDomain,
  parseSenderAddress,
  DISALLOWED_DOMAIN_RULES,
  type EmailIntakeClassification,
} from "../src/lib/emailIntake.ts";
import type { EmailIntakeProfile, GmailMessageCandidate } from "../src/types.ts";

test("Email Intake Phase 4A: Normalization & Parsing Helpers", () => {
  // normalizeEmail
  assert.equal(normalizeEmail("  TEST.User+1@Example.COM  "), "test.user+1@example.com");
  assert.equal(normalizeEmail(""), "");
  assert.equal(normalizeEmail(undefined), "");

  // normalizeDomain
  assert.equal(normalizeDomain("  @Acme-Corp.COM  "), "acme-corp.com");
  assert.equal(normalizeDomain("*.billing.example.org"), "billing.example.org");
  assert.equal(normalizeDomain("http://supplier.com/invoices"), "supplier.com");
  assert.equal(normalizeDomain(""), "");

  // parseSenderAddress
  const parsed1 = parseSenderAddress('"Acme Accounts" <billing@acme.com>');
  assert.equal(parsed1.name, "Acme Accounts");
  assert.equal(parsed1.email, "billing@acme.com");
  assert.equal(parsed1.domain, "acme.com");

  const parsed2 = parseSenderAddress("statement-service@bdo.com.ph");
  assert.equal(parsed2.name, "");
  assert.equal(parsed2.email, "statement-service@bdo.com.ph");
  assert.equal(parsed2.domain, "bdo.com.ph");

  const parsed3 = parseSenderAddress("Supplier Notifications");
  assert.equal(parsed3.name, "Supplier Notifications");
  assert.equal(parsed3.email, "");
  assert.equal(parsed3.domain, "");
});

test("Email Intake Phase 4A: Profile Validation Rules", () => {
  // 1. Valid email-only rule
  const v1 = validateEmailIntakeProfile({
    name: "Supplier Invoice Rule",
    senderEmail: "billing@supplier.com",
    suggestedDestination: "INVOICE",
  });
  assert.equal(v1.valid, true);
  assert.equal(v1.errors.length, 0);

  // 2. Valid domain-only rule
  const v2 = validateEmailIntakeProfile({
    name: "Bank Domain Rule",
    senderDomain: "bdo.com.ph",
    suggestedDestination: "BANK_STATEMENT",
  });
  assert.equal(v2.valid, true);

  // 3. Rejection of blank/missing name
  const v3 = validateEmailIntakeProfile({
    name: "   ",
    senderEmail: "test@vendor.com",
    suggestedDestination: "INVOICE",
  });
  assert.equal(v3.valid, false);
  assert.ok(v3.errors.some((e) => e.includes("Profile name is required")));

  // 4. Rejection of missing both senderEmail and senderDomain
  const v4 = validateEmailIntakeProfile({
    name: "Incomplete Rule",
    suggestedDestination: "EXPENSE",
  });
  assert.equal(v4.valid, false);
  assert.ok(v4.errors.some((e) => e.includes("Either a specific sender email or a sender domain is required")));

  // 5. Rejection of disallowed/generic consumer domains for domain-only rules
  for (const domain of ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"]) {
    const v = validateEmailIntakeProfile({
      name: `Generic ${domain} rule`,
      senderDomain: domain,
      suggestedDestination: "INVOICE",
    });
    assert.equal(v.valid, false, `Domain ${domain} should be rejected for domain-only rules`);
    assert.ok(v.errors.some((e) => e.includes("generic email provider")));
  }

  // 6. Generic consumer domain IS allowed when specific senderEmail is provided
  const vEmail = validateEmailIntakeProfile({
    name: "Specific Freelancer Gmail",
    senderEmail: "individual.contractor@gmail.com",
    suggestedDestination: "INVOICE",
  });
  assert.equal(vEmail.valid, true);
});

test("Email Intake Phase 4A: Profile Matching Engine", () => {
  const profile1: EmailIntakeProfile = {
    id: "prof-1",
    companyId: "comp-1",
    name: "Acme Billing Email",
    enabled: true,
    senderEmail: "invoices@acme.com",
    suggestedDestination: "INVOICE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const profile2: EmailIntakeProfile = {
    id: "prof-2",
    companyId: "comp-1",
    name: "Bank Statements Domain",
    enabled: true,
    senderDomain: "bank.example",
    attachmentCondition: "SPREADSHEET",
    suggestedDestination: "BANK_STATEMENT",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const profile3Disabled: EmailIntakeProfile = {
    id: "prof-3",
    companyId: "comp-1",
    name: "Disabled Rule",
    enabled: false,
    senderEmail: "disabled@vendor.com",
    suggestedDestination: "EXPENSE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Exact email match
  const msg1: GmailMessageCandidate = {
    id: "msg-1",
    threadId: "t-1",
    sender: "Acme Finance <invoices@acme.com>",
    to: ["ap@company.com"],
    cc: [],
    subject: "Monthly Bill",
    receivedAt: new Date().toISOString(),
    snippet: "Here is your invoice",
    bodyText: "Here is your invoice",
    labels: [],
    attachments: [{ attachmentId: "att-1", filename: "bill.pdf", mimeType: "application/pdf", size: 1024 }],
  };
  const matches1 = matchEmailIntakeProfiles(msg1, [profile1, profile2, profile3Disabled]);
  assert.equal(matches1.length, 1);
  assert.equal(matches1[0].id, "prof-1");

  // Domain match with attachment condition
  const msg2: GmailMessageCandidate = {
    id: "msg-2",
    threadId: "t-2",
    sender: "alerts@bank.example",
    to: ["ap@company.com"],
    cc: [],
    subject: "Your periodic statement",
    receivedAt: new Date().toISOString(),
    snippet: "Statement attached",
    bodyText: "Statement attached",
    labels: [],
    attachments: [{ attachmentId: "att-2", filename: "statement_aug.csv", mimeType: "text/csv", size: 2048 }],
  };
  const matches2 = matchEmailIntakeProfiles(msg2, [profile1, profile2, profile3Disabled]);
  assert.equal(matches2.length, 1);
  assert.equal(matches2[0].id, "prof-2");

  // Domain match fails when required attachment condition is not met (PDF instead of spreadsheet)
  const msg2Pdf: GmailMessageCandidate = {
    ...msg2,
    id: "msg-2-pdf",
    attachments: [{ attachmentId: "att-3", filename: "notice.pdf", mimeType: "application/pdf", size: 1024 }],
  };
  const matches2Pdf = matchEmailIntakeProfiles(msg2Pdf, [profile1, profile2, profile3Disabled]);
  assert.equal(matches2Pdf.length, 0);

  // Disabled profile never matches
  const msg3: GmailMessageCandidate = {
    id: "msg-3",
    threadId: "t-3",
    sender: "disabled@vendor.com",
    to: ["ap@company.com"],
    cc: [],
    subject: "Expense report",
    receivedAt: new Date().toISOString(),
    snippet: "Receipt",
    bodyText: "Receipt",
    labels: [],
    attachments: [{ attachmentId: "att-4", filename: "receipt.jpg", mimeType: "image/jpeg", size: 500 }],
  };
  const matches3 = matchEmailIntakeProfiles(msg3, [profile1, profile2, profile3Disabled]);
  assert.equal(matches3.length, 0);
});

test("Email Intake Phase 4A: Query Augmentation & Bounded Chunking", () => {
  const window = { days: 14 };

  // 1. Empty profiles -> returns empty sender queries array
  const queriesEmpty = buildSenderProfileQueries([], window);
  assert.equal(queriesEmpty.length, 0);

  // 2. Multiple enabled profiles chunked into max 8 per query
  const profiles: EmailIntakeProfile[] = Array.from({ length: 18 }).map((_, i) => ({
    id: `prof-${i}`,
    companyId: "comp-1",
    name: `Vendor ${i}`,
    enabled: i !== 5, // prof-5 is disabled
    senderEmail: i % 2 === 0 ? `billing@vendor${i}.com` : undefined,
    senderDomain: i % 2 !== 0 ? `vendor${i}.com` : undefined,
    suggestedDestination: "INVOICE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  const queries = buildSenderProfileQueries(profiles, window);
  // Total enabled senders = 17. 17 / 8 = 3 chunks. Total queries = 3
  assert.equal(queries.length, 3);

  // Senders queries contain "from:" clauses and time window
  for (let i = 0; i < queries.length; i++) {
    assert.ok(queries[i].includes("from:"));
    assert.ok(queries[i].includes("newer_than:14d"));
  }

  // prof-5 (disabled) should not appear in any query
  for (const q of queries) {
    assert.ok(!q.includes("vendor5.com"));
  }
});

test("Email Intake Phase 4A: Precedence Ladder & Conflict Resolution", () => {
  const invoiceRule: EmailIntakeProfile = {
    id: "rule-inv",
    companyId: "comp-1",
    name: "Supplier Invoice Rule",
    enabled: true,
    senderEmail: "vendor@supplier.com",
    suggestedDestination: "INVOICE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const expenseRule: EmailIntakeProfile = {
    id: "rule-exp",
    companyId: "comp-1",
    name: "Rideshare Rule",
    enabled: true,
    senderDomain: "grab.example",
    suggestedDestination: "EXPENSE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const statementRule: EmailIntakeProfile = {
    id: "rule-bank",
    companyId: "comp-1",
    name: "Metrobank Statement Rule",
    enabled: true,
    senderDomain: "metrobank.example",
    suggestedDestination: "BANK_STATEMENT",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 1. Rule Agreement (Rule + Document signal agree -> high confidence 96%)
  const invCandidate: GmailMessageCandidate = {
    id: "c-1",
    threadId: "t-1",
    sender: "vendor@supplier.com",
    to: ["ap@company.com"],
    cc: [],
    subject: "Sales Invoice #1029",
    receivedAt: new Date().toISOString(),
    snippet: "Please find attached Sales Invoice",
    bodyText: "Please find attached Sales Invoice with VAT TIN",
    labels: [],
    attachments: [{ attachmentId: "a-1", filename: "invoice_1029.pdf", mimeType: "application/pdf", size: 1024 }],
  };
  const clsInv = classifyEmailIntakeCandidate(invCandidate, [invoiceRule]);
  assert.equal(clsInv.suggestedDestination, "INVOICE");
  assert.equal(clsInv.isInvoiceLike, true);
  assert.equal(clsInv.matchedProfileId, "rule-inv");
  assert.equal(clsInv.matchedProfileName, "Supplier Invoice Rule");
  assert.equal(clsInv.confidence, 96);

  // 2. Rule Match with Ambiguous Document -> Confidence 86%
  const ambigCandidate: GmailMessageCandidate = {
    id: "c-2",
    threadId: "t-2",
    sender: "vendor@supplier.com",
    to: ["ap@company.com"],
    cc: [],
    subject: "Attached file for your records",
    receivedAt: new Date().toISOString(),
    snippet: "Attached file",
    bodyText: "Attached file",
    labels: [],
    attachments: [{ attachmentId: "a-2", filename: "doc.pdf", mimeType: "application/pdf", size: 1024 }],
  };
  const clsAmbig = classifyEmailIntakeCandidate(ambigCandidate, [invoiceRule]);
  assert.equal(clsAmbig.suggestedDestination, "INVOICE");
  assert.equal(clsAmbig.matchedProfileId, "rule-inv");
  assert.equal(clsAmbig.confidence, 86);

  // 3. Rule vs Document Conflict: Rule says EXPENSE, but document has explicit Invoice signals (Sales Invoice / VAT / BIR)
  const conflictInvExpense: GmailMessageCandidate = {
    id: "c-3",
    threadId: "t-3",
    sender: "billing@grab.example",
    to: ["ap@company.com"],
    cc: [],
    subject: "Official Sales Invoice BIR Tax Invoice",
    receivedAt: new Date().toISOString(),
    snippet: "VAT registered tax sales invoice",
    bodyText: "VAT registered tax sales invoice BIR TIN 123-456-789",
    labels: [],
    attachments: [{ attachmentId: "a-3", filename: "official_vat_invoice.pdf", mimeType: "application/pdf", size: 1024 }],
  };
  const clsConflict = classifyEmailIntakeCandidate(conflictInvExpense, [expenseRule]);
  // Because rule says EXPENSE but document is clearly an explicit VAT Invoice, resolution is UNSUPPORTED with conflictReason
  assert.equal(clsConflict.suggestedDestination, "UNSUPPORTED");
  assert.ok(clsConflict.conflictReason);
  assert.ok(clsConflict.conflictReason?.includes("conflicts with explicit invoice document signals"));

  // 4. Bank Statement signals override conflicting invoice rule
  const conflictBankInv: GmailMessageCandidate = {
    id: "c-4",
    threadId: "t-4",
    sender: "vendor@supplier.com", // matches invoice rule
    to: ["ap@company.com"],
    cc: [],
    subject: "Monthly Bank Statement of Account",
    receivedAt: new Date().toISOString(),
    snippet: "Account statement transactions",
    bodyText: "Account statement transactions",
    labels: [],
    attachments: [{ attachmentId: "a-4", filename: "bank_statement_aug.csv", mimeType: "text/csv", size: 4096 }],
  };
  const clsConflictBank = classifyEmailIntakeCandidate(conflictBankInv, [invoiceRule]);
  assert.equal(clsConflictBank.suggestedDestination, "UNSUPPORTED");
  assert.ok(clsConflictBank.conflictReason?.includes("conflicts with bank statement document signals"));

  // 5. Multiple Conflicting Rules -> UNSUPPORTED with conflictReason
  const conflictingRule2: EmailIntakeProfile = {
    id: "rule-inv-alt",
    companyId: "comp-1",
    name: "Conflicting Expense Rule",
    enabled: true,
    senderEmail: "vendor@supplier.com",
    suggestedDestination: "EXPENSE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const clsMultiRule = classifyEmailIntakeCandidate(ambigCandidate, [invoiceRule, conflictingRule2]);
  assert.equal(clsMultiRule.suggestedDestination, "UNSUPPORTED");
  assert.ok(clsMultiRule.conflictReason?.includes("Multiple matching sender rules conflict"));
});

test("Email Intake Phase 4A: Deterministic Fast-Path vs Ambiguous Candidates", () => {
  // Deterministic candidates without any rules
  const deterministicInv: GmailMessageCandidate = {
    id: "det-1",
    threadId: "t-1",
    sender: "unregistered@vendor.com",
    to: ["ap@company.com"],
    cc: [],
    subject: "Sales Invoice 2026-0881",
    receivedAt: new Date().toISOString(),
    snippet: "Official invoice BIR VAT",
    bodyText: "Official invoice BIR VAT TIN",
    labels: [],
    attachments: [{ attachmentId: "a-1", filename: "invoice.pdf", mimeType: "application/pdf", size: 1024 }],
  };
  const clsDet = classifyEmailIntakeCandidate(deterministicInv);
  assert.equal(clsDet.suggestedDestination, "INVOICE");
  assert.equal(clsDet.isInvoiceLike, true);
  assert.equal(clsDet.confidence, 92);

  // Ambiguous candidate without rules -> UNSUPPORTED locally
  const ambigMsg: GmailMessageCandidate = {
    id: "amb-1",
    threadId: "t-2",
    sender: "contact@random.org",
    to: ["ap@company.com"],
    cc: [],
    subject: "Hello team",
    receivedAt: new Date().toISOString(),
    snippet: "Just checking in regarding the upcoming meeting",
    bodyText: "Just checking in regarding the upcoming meeting",
    labels: [],
    attachments: [],
  };
  const clsAmb = classifyEmailIntakeCandidate(ambigMsg);
  assert.equal(clsAmb.suggestedDestination, "UNSUPPORTED");
  assert.equal(clsAmb.isInvoiceLike, false);
});