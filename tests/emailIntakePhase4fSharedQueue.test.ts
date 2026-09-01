import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveEmailQueueItems,
  filterEmailQueueItems,
} from "../src/lib/emailQueue.ts";
import {
  prepareBatchEmailCandidates,
  isGmailAuthorizationError,
  resolveGmailConnectionStatus,
} from "../src/lib/emailIntake.ts";
import type {
  EmailIntakeProfile,
  Expense,
  GmailConnectionInfo,
  GmailMessageCandidate,
  InvoiceData,
  Vendor,
} from "../src/types.ts";
import type { FinancialAccount } from "../src/lib/cashBanking.ts";

function makeCandidate(overrides: Partial<GmailMessageCandidate> & Pick<GmailMessageCandidate, "id" | "subject">): GmailMessageCandidate {
  return {
    id: overrides.id,
    threadId: overrides.threadId ?? `thread-${overrides.id}`,
    sender: overrides.sender ?? "billing@example.com",
    to: overrides.to ?? [],
    cc: overrides.cc ?? [],
    subject: overrides.subject,
    receivedAt: overrides.receivedAt ?? "2026-08-30T10:00:00Z",
    snippet: overrides.snippet ?? "",
    bodyText: overrides.bodyText ?? overrides.subject,
    labels: overrides.labels ?? ["INBOX"],
    attachments: overrides.attachments ?? [],
    ...overrides,
  };
}

const sampleVendors: Vendor[] = [
  {
    id: "v-acme",
    companyId: "company-test",
    name: "Acme Industrial Supplies Inc.",
    normalizedName: "acme industrial supplies",
    taxId: "123-456-789-000",
    email: "billing@acme.ph",
  },
];

const sampleAccounts: FinancialAccount[] = [
  {
    id: "acc-bdo-1",
    companyId: "company-test",
    accountType: "BANK",
    institutionCode: "BDO",
    institutionName: "BDO Unibank",
    displayName: "BDO Main Operating (4821)",
    maskedIdentifier: "•••• 4821",
    currency: "PHP",
    openingBalance: 1000000,
    openingBalanceDate: "2026-01-01",
    connectionType: "STATEMENT",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

const sampleInvoices: InvoiceData[] = [
  {
    id: "inv-existing-1",
    invoiceNumber: "INV-2026-001",
    invoiceDate: "2026-08-15",
    dueDate: "2026-09-15",
    currency: "PHP",
    sourceType: "EMAIL",
    sourceEmailId: "msg-existing-1",
    sourceMetadata: {
      gmailMessageId: "msg-existing-1",
      gmailAttachmentId: "att-existing-1",
    },
    fileName: "invoice-2026-001.pdf",
    fileSize: 102400,
    reviewStatus: "VERIFIED",
    vendor: { name: "Acme Industrial Supplies Inc." },
    customer: { name: "Engoryx Test Company" },
    items: [],
    subtotal: 45000,
    totalTax: 0,
    grandTotal: 45000,
    extractedAt: "2026-08-15T10:00:00Z",
    modelUsed: "phase-4f-test-fixture",
  },
];

const sampleExpenses: Expense[] = [
  {
    id: "exp-existing-1",
    expenseDate: "2026-08-20",
    category: "Office / Site Supplies",
    description: "Office stationery and printer ink",
    payee: "National Bookstore",
    amount: 3500,
    currency: "PHP",
    status: "DRAFT",
    receiptSourceDocumentId: "att-exp-existing-1",
    referenceNumber: "NBS-99881",
    createdAt: "2026-08-20T00:00:00Z",
    updatedAt: "2026-08-20T00:00:00Z",
  },
];

test("Phase 4F: queue state derives Invoice, Statement, Expense, and unsupported destinations", () => {
  const candidates: GmailMessageCandidate[] = [
    makeCandidate({
      id: "msg-inv-1",
      sender: "Acme Billing <billing@acme.ph>",
      subject: "Tax Invoice INV-9901 for Site Materials",
      bodyText: "Please find attached Tax Invoice INV-9901.",
      attachments: [{ attachmentId: "att-inv-1", filename: "INV-9901.pdf", mimeType: "application/pdf", size: 54000 }],
    }),
    makeCandidate({
      id: "msg-stmt-1",
      sender: "BDO Statements <ebanking@bdo.com.ph>",
      subject: "BDO Monthly Account Statement Aug 2026",
      bodyText: "Attached is your monthly bank statement for account ending 4821.",
      attachments: [{ attachmentId: "att-stmt-1", filename: "BDO_Statement_Aug2026.pdf", mimeType: "application/pdf", size: 89000 }],
    }),
    makeCandidate({
      id: "msg-exp-1",
      sender: "Grab Philippines <receipts@grab.com>",
      subject: "Your Grab ride e-receipt on 29 Aug 2026",
      bodyText: "Official Receipt total PHP 450.00 paid via card.",
      attachments: [{ attachmentId: "att-exp-1", filename: "grab-receipt.pdf", mimeType: "application/pdf", size: 32000 }],
    }),
    makeCandidate({
      id: "msg-other-1",
      sender: "Partner <news@partner.org>",
      subject: "Project Engineering Newsletter",
      bodyText: "Here is the latest news in civil engineering.",
    }),
  ];

  const { items, counts } = deriveEmailQueueItems(candidates, {
    vendors: sampleVendors,
    financialAccounts: sampleAccounts,
    invoices: sampleInvoices,
    expenses: sampleExpenses,
    canManageMailbox: true,
    canProcessInvoices: true,
    canImportBankStatements: true,
    canManageExpenses: true,
  });

  assert.equal(items.length, 4);
  assert.equal(counts.total, 4);
  assert.equal(counts.invoices, 1);
  assert.equal(counts.statements, 1);
  assert.equal(counts.expenses, 1);
  assert.equal(counts.needsReview, 1);
  assert.equal(items.find((item) => item.id === "msg-inv-1")?.destination, "INVOICE");
  assert.equal(items.find((item) => item.id === "msg-stmt-1")?.destination, "BANK_STATEMENT");
  assert.equal(items.find((item) => item.id === "msg-exp-1")?.destination, "EXPENSE");
  assert.equal(items.find((item) => item.id === "msg-other-1")?.destination, "UNSUPPORTED");
});

test("Phase 4F: source preservation distinguishes pending, preserved, and failed", () => {
  const base = makeCandidate({
    id: "msg-pending-1",
    subject: "Pending Bill",
    bodyText: "Invoice attached.",
    attachments: [{ attachmentId: "att-p1", filename: "bill.pdf", mimeType: "application/pdf", size: 1000 }],
  });
  const imported = makeCandidate({ ...base, id: "msg-imported-1", importStatus: "IMPORTED" });
  const failed = makeCandidate({ ...base, id: "msg-failed-1", importStatus: "FAILED" });

  const { items } = deriveEmailQueueItems([base, imported, failed], {
    itemErrors: { "msg-failed-1": "Storage upload timeout." },
  });

  assert.equal(items.find((item) => item.id === "msg-pending-1")?.sourcePreservation, "PENDING");
  assert.equal(items.find((item) => item.id === "msg-imported-1")?.sourcePreservation, "PRESERVED");
  const failedItem = items.find((item) => item.id === "msg-failed-1")!;
  assert.equal(failedItem.sourcePreservation, "FAILED");
  assert.equal(failedItem.itemErrors[0], "Storage upload timeout.");
});

test("Phase 4F: duplicate evidence distinguishes exact, suspected, and unique candidates", () => {
  const exact = makeCandidate({
    id: "msg-existing-1",
    sender: "billing@acme.ph",
    subject: "Tax Invoice INV-2026-001",
    attachments: [{ attachmentId: "att-existing-1", filename: "invoice-2026-001.pdf", mimeType: "application/pdf", size: 102400 }],
  });
  const suspected = makeCandidate({
    id: "msg-forwarded-copy",
    sender: "pm@engoryx.local",
    subject: "Fwd: Invoice from Acme",
    attachments: [{ attachmentId: "att-copy-1", filename: "invoice-2026-001.pdf", mimeType: "application/pdf", size: 102400 }],
  });
  const unique = makeCandidate({
    id: "msg-brand-new",
    sender: "billing@acme.ph",
    subject: "Tax Invoice INV-2026-002",
    attachments: [{ attachmentId: "att-unique-1", filename: "invoice-2026-002.pdf", mimeType: "application/pdf", size: 80000 }],
  });

  const { items } = deriveEmailQueueItems([exact, suspected, unique], {
    invoices: sampleInvoices,
    expenses: sampleExpenses,
  });

  const exactItem = items.find((item) => item.id === exact.id)!;
  const suspectedItem = items.find((item) => item.id === suspected.id)!;
  const uniqueItem = items.find((item) => item.id === unique.id)!;
  assert.equal(exactItem.duplicate.status, "EXACT_DUPLICATE");
  assert.equal(exactItem.duplicate.matchedRecordId, "inv-existing-1");
  assert.equal(suspectedItem.duplicate.status, "SUSPECTED_DUPLICATE");
  assert.equal(uniqueItem.duplicate.status, "NO_KNOWN_DUPLICATE");
});

test("Phase 4F: existing entity matches remain advisory and same-batch candidates are grouped", () => {
  const profile: EmailIntakeProfile = {
    id: "prof-acme",
    companyId: "company-test",
    name: "Acme Supplier Rule",
    enabled: true,
    senderDomain: "acme.ph",
    suggestedDestination: "INVOICE",
    linkedVendorId: "v-acme",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  };
  const cand1 = makeCandidate({
    id: "cand-batch-1",
    sender: "Acme Dispatch <orders@acme.ph>",
    subject: "Invoice for Concrete Mix",
    attachments: [{ attachmentId: "att-b1", filename: "inv-concrete.pdf", mimeType: "application/pdf", size: 50000 }],
  });
  const cand2 = makeCandidate({
    id: "cand-batch-2",
    sender: "Acme Dispatch <orders@acme.ph>",
    subject: "Invoice for Rebar Delivery",
    attachments: [{ attachmentId: "att-b2", filename: "inv-rebar.pdf", mimeType: "application/pdf", size: 52000 }],
  });

  const { items } = deriveEmailQueueItems([cand1, cand2], {
    profiles: [profile],
    vendors: sampleVendors,
    financialAccounts: sampleAccounts,
  });

  for (const item of items) {
    assert.equal(item.entityMatch.status, "MATCHED");
    assert.equal(item.entityMatch.entityName, "Acme Industrial Supplies Inc.");
    assert.equal(item.batchGroup?.memberCount, 2);
  }
});

test("Phase 4F: queue filters support destination, duplicates, and search", () => {
  const invoice = makeCandidate({
    id: "c-inv",
    sender: "billing@acme.ph",
    subject: "Tax Invoice INV-100",
    attachments: [{ attachmentId: "a-1", filename: "inv-100.pdf", mimeType: "application/pdf", size: 1000 }],
  });
  const statement = makeCandidate({
    id: "c-stmt",
    sender: "ebanking@bdo.com.ph",
    subject: "Bank Statement",
    bodyText: "Bank statement details",
    attachments: [{ attachmentId: "a-2", filename: "bdo.pdf", mimeType: "application/pdf", size: 2000 }],
  });
  const duplicate = makeCandidate({
    id: "msg-existing-1",
    sender: "billing@acme.ph",
    subject: "Duplicate INV-2026-001",
    attachments: [{ attachmentId: "att-existing-1", filename: "invoice-2026-001.pdf", mimeType: "application/pdf", size: 102400 }],
  });

  const { items } = deriveEmailQueueItems([invoice, statement, duplicate], { invoices: sampleInvoices });
  assert.equal(filterEmailQueueItems(items, { destination: "INVOICE" }).length, 2);
  assert.deepEqual(filterEmailQueueItems(items, { destination: "BANK_STATEMENT" }).map((item) => item.id), ["c-stmt"]);
  assert.deepEqual(filterEmailQueueItems(items, { duplicateOnly: true }).map((item) => item.id), ["msg-existing-1"]);
  assert.deepEqual(filterEmailQueueItems(items, { searchQuery: "bdo" }).map((item) => item.id), ["c-stmt"]);
});

test("Phase 4F: batch preparation isolates item failures and remains preparation-only", async () => {
  const candidates = [
    makeCandidate({
      id: "cand-prep-1",
      sender: "billing@acme.ph",
      subject: "Tax Invoice 1",
      attachments: [{ attachmentId: "a-1", filename: "inv1.pdf", mimeType: "application/pdf", size: 1000 }],
    }),
    makeCandidate({
      id: "cand-prep-fail",
      sender: "billing@corrupt.ph",
      subject: "Tax Invoice 2",
      attachments: [{ attachmentId: "a-2", filename: "corrupt.pdf", mimeType: "application/pdf", size: 1000 }],
    }),
    makeCandidate({
      id: "cand-prep-3",
      sender: "billing@acme.ph",
      subject: "Tax Invoice 3",
      attachments: [{ attachmentId: "a-3", filename: "inv3.pdf", mimeType: "application/pdf", size: 1000 }],
    }),
  ];
  const progress: Array<{ candidateId: string; status: string; error?: string }> = [];
  let preparedInvoices = 0;

  const results = await prepareBatchEmailCandidates(candidates, {
    canManageMailbox: true,
    canProcessInvoices: true,
    onImportInvoice: async (candidate) => {
      if (candidate.id === "cand-prep-fail") throw new Error("Attachment corrupt or unreadable");
      preparedInvoices += 1;
      return 1;
    },
    onItemProgress: (candidateId, status, error) => progress.push({ candidateId, status, error }),
  });

  assert.deepEqual(results.map((result) => result.status), ["SUCCESS", "FAILED", "SUCCESS"]);
  assert.equal(results[1].error, "Attachment corrupt or unreadable");
  assert.equal(preparedInvoices, 2);
  assert.ok(progress.some((entry) => entry.candidateId === "cand-prep-fail" && entry.status === "FAILED"));
  assert.ok(progress.some((entry) => entry.candidateId === "cand-prep-1" && entry.status === "READY"));
  assert.ok(progress.some((entry) => entry.candidateId === "cand-prep-3" && entry.status === "READY"));
});

test("Phase 4F: Gmail access does not grant destination mutation permissions", () => {
  const invoice = makeCandidate({
    id: "msg-perm-inv",
    sender: "billing@acme.ph",
    subject: "Invoice for Parts",
    attachments: [{ attachmentId: "att-p1", filename: "inv.pdf", mimeType: "application/pdf", size: 1000 }],
  });
  const statement = makeCandidate({
    id: "msg-perm-stmt",
    sender: "ebanking@bdo.com.ph",
    subject: "Monthly Statement",
    bodyText: "Bank statement attached.",
    attachments: [{ attachmentId: "att-p2", filename: "stmt.pdf", mimeType: "application/pdf", size: 1000 }],
  });

  const invoiceItem = deriveEmailQueueItems([invoice], {
    canManageMailbox: true,
    canProcessInvoices: false,
  }).items[0];
  assert.equal(invoiceItem.primaryAction.enabled, false);
  assert.equal(invoiceItem.isEligibleForBatchPrep, false);
  assert.match(invoiceItem.primaryAction.disabledReason ?? "", /invoice permission/i);

  const statementItem = deriveEmailQueueItems([statement], {
    canManageMailbox: true,
    canImportBankStatements: false,
  }).items[0];
  assert.equal(statementItem.primaryAction.enabled, false);
  assert.equal(statementItem.isEligibleForBatchPrep, false);
  assert.match(statementItem.primaryAction.disabledReason ?? "", /cash import/i);
});

test("Phase 4F: Gmail connection state distinguishes authorization loss from ordinary preparation errors", () => {
  const healthyConnection: GmailConnectionInfo = {
    configured: true,
    signedIn: true,
    hasGmailToken: true,
    email: "finance@company.com",
    lastSyncedAt: "2026-08-31T10:00:00Z",
  };

  const ordinaryError = "PDF extraction timed out after 30 seconds";
  assert.equal(isGmailAuthorizationError(ordinaryError), false);
  assert.equal(resolveGmailConnectionStatus(healthyConnection, ordinaryError), "HEALTHY");

  const authError = "invalid_grant: Token has been expired or revoked";
  assert.equal(isGmailAuthorizationError(authError), true);
  assert.equal(resolveGmailConnectionStatus(healthyConnection, authError), "RECONNECT_REQUIRED");
});
