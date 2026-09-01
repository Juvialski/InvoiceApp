import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveEmailQueueItems,
  filterEmailQueueItems,
  resolveEffectiveClassification,
  evaluateDuplicateEvidence,
  evaluateSourcePreservation,
  evaluateQueueStatus,
  deriveEntityMatch,
  determinePrimaryAction,
  type EmailQueueItem,
} from "../src/lib/emailQueue.ts";
import {
  prepareBatchEmailCandidates,
  isGmailAuthorizationError,
  resolveGmailConnectionStatus,
  type EmailIntakeProfile,
} from "../src/lib/emailIntake.ts";
import type {
  Expense,
  GmailConnectionInfo,
  GmailMessageCandidate,
  InvoiceData,
  Vendor,
} from "../src/types.ts";
import type { FinancialAccount } from "../src/lib/cashBanking.ts";

const sampleVendors: Vendor[] = [
  {
    id: "v-acme",
    companyId: "company-test",
    name: "Acme Industrial Supplies Inc.",
    normalizedName: "acme industrial supplies",
    taxId: "123-456-789-000",
    email: "billing@acme.ph",
  },
  {
    id: "v-meralco",
    companyId: "company-test",
    name: "Manila Electric Company",
    normalizedName: "manila electric company",
    taxId: "000-101-202-000",
    email: "ebill@meralco.com.ph",
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
    vendorName: "Acme Industrial Supplies Inc.",
    issueDate: "2026-08-15",
    dueDate: "2026-09-15",
    totalAmount: 45000,
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
    lineItems: [],
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
  },
];

test("Phase 4F: Queue state derivation across Invoice, Statement, Expense, and Unsupported destinations", () => {
  const candidateInvoice: GmailMessageCandidate = {
    id: "msg-inv-1",
    threadId: "th-1",
    sender: "Acme Billing <billing@acme.ph>",
    to: ["ap@engoryx.local"],
    cc: [],
    subject: "Tax Invoice INV-9901 for Site Materials",
    receivedAt: "2026-08-30T10:00:00Z",
    snippet: "Attached is the sales invoice...",
    bodyText: "Please find attached Tax Invoice INV-9901.",
    labels: ["INBOX"],
    attachments: [
      {
        attachmentId: "att-inv-1",
        filename: "INV-9901.pdf",
        mimeType: "application/pdf",
        size: 54000,
      },
    ],
  };

  const candidateStatement: GmailMessageCandidate = {
    id: "msg-stmt-1",
    threadId: "th-2",
    sender: "BDO Statements <ebanking@bdo.com.ph>",
    to: ["treasury@engoryx.local"],
    cc: [],
    subject: "BDO Monthly Account Statement Aug 2026",
    receivedAt: "2026-08-31T08:00:00Z",
    snippet: "Your bank account transaction statement is ready.",
    bodyText: "Attached is your monthly bank statement for account ending 4821.",
    labels: ["INBOX"],
    attachments: [
      {
        attachmentId: "att-stmt-1",
        filename: "BDO_Statement_Aug2026.pdf",
        mimeType: "application/pdf",
        size: 89000,
      },
    ],
  };

  const candidateExpense: GmailMessageCandidate = {
    id: "msg-exp-1",
    threadId: "th-3",
    sender: "Grab Philippines <receipts@grab.com>",
    to: ["eng@engoryx.local"],
    cc: [],
    subject: "Your Grab ride e-receipt on 29 Aug 2026",
    receivedAt: "2026-08-29T18:30:00Z",
    snippet: "Payment receipt for ride to project site.",
    bodyText: "Official Receipt total PHP 450.00 paid via card.",
    labels: ["INBOX"],
    attachments: [
      {
        attachmentId: "att-exp-1",
        filename: "grab-receipt.pdf",
        mimeType: "application/pdf",
        size: 32000,
      },
    ],
  };

  const candidateUnsupported: GmailMessageCandidate = {
    id: "msg-other-1",
    threadId: "th-4",
    sender: "Partner <news@partner.org>",
    to: ["info@engoryx.local"],
    cc: [],
    subject: "Project Engineering Newsletter",
    receivedAt: "2026-08-28T09:00:00Z",
    snippet: "Monthly industry updates...",
    bodyText: "Here is the latest news in civil engineering.",
    labels: ["INBOX"],
    attachments: [],
  };

  const candidates = [candidateInvoice, candidateStatement, candidateExpense, candidateUnsupported];

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

  // Check destination classifications
  const invItem = items.find((i) => i.id === "msg-inv-1")!;
  const stmtItem = items.find((i) => i.id === "msg-stmt-1")!;
  const expItem = items.find((i) => i.id === "msg-exp-1")!;
  const otherItem = items.find((i) => i.id === "msg-other-1")!;

  assert.equal(invItem.destination, "INVOICE");
  assert.equal(invItem.destinationLabel, "Invoice");
  assert.equal(invItem.queueStatus, "DISCOVERED");

  assert.equal(stmtItem.destination, "BANK_STATEMENT");
  assert.equal(stmtItem.destinationLabel, "Bank statement");
  assert.equal(stmtItem.queueStatus, "DISCOVERED");

  assert.equal(expItem.destination, "EXPENSE");
  assert.equal(expItem.destinationLabel, "Receipt");
  assert.equal(expItem.queueStatus, "DISCOVERED");

  assert.equal(otherItem.destination, "UNSUPPORTED");
  assert.equal(otherItem.destinationLabel, "Needs review");
  assert.equal(otherItem.queueStatus, "NEEDS_REVIEW");
});

test("Phase 4F: Source preservation status correctly distinguishes pending vs preserved vs failed", () => {
  const discoveredCandidate: GmailMessageCandidate = {
    id: "msg-pending-1",
    threadId: "th-p1",
    sender: "billing@vendor.com",
    to: [],
    cc: [],
    subject: "Pending Bill",
    receivedAt: "2026-08-30T10:00:00Z",
    snippet: "",
    bodyText: "Invoice attached.",
    labels: ["INBOX"],
    attachments: [{ attachmentId: "att-p1", filename: "bill.pdf", mimeType: "application/pdf", size: 1000 }],
  };

  const importedCandidate: GmailMessageCandidate = {
    ...discoveredCandidate,
    id: "msg-imported-1",
    importStatus: "IMPORTED",
  };

  const failedCandidate: GmailMessageCandidate = {
    ...discoveredCandidate,
    id: "msg-failed-1",
    importStatus: "FAILED",
  };

  const { items } = deriveEmailQueueItems([discoveredCandidate, importedCandidate, failedCandidate], {
    itemErrors: { "msg-failed-1": "Storage upload timeout." },
  });

  const pendingItem = items.find((i) => i.id === "msg-pending-1")!;
  const preservedItem = items.find((i) => i.id === "msg-imported-1")!;
  const failedItem = items.find((i) => i.id === "msg-failed-1")!;

  // Discovered Gmail candidate before persistence is strictly PENDING
  assert.equal(pendingItem.sourcePreservation, "PENDING");
  assert.equal(pendingItem.sourcePreservationLabel, "Preservation pending");

  // Imported candidate is PRESERVED
  assert.equal(preservedItem.sourcePreservation, "PRESERVED");
  assert.equal(preservedItem.sourcePreservationLabel, "Source preserved");

  // Failed candidate is FAILED
  assert.equal(failedItem.sourcePreservation, "FAILED");
  assert.equal(failedItem.sourcePreservationLabel, "Preservation failed");
  assert.equal(failedItem.itemErrors[0], "Storage upload timeout.");
});

test("Phase 4F: Duplicate detection accurately surfaces exact and suspected duplicates without silent deletion", () => {
  // 1. Exact Invoice duplicate by message ID
  const exactDuplicateCandidate: GmailMessageCandidate = {
    id: "msg-existing-1",
    threadId: "th-ex1",
    sender: "billing@acme.ph",
    to: [],
    cc: [],
    subject: "Tax Invoice INV-2026-001",
    receivedAt: "2026-08-15T10:00:00Z",
    snippet: "",
    bodyText: "Tax invoice INV-2026-001.",
    labels: ["INBOX"],
    attachments: [{ attachmentId: "att-existing-1", filename: "invoice-2026-001.pdf", mimeType: "application/pdf", size: 102400 }],
  };

  // 2. Suspected Duplicate with same filename and size but different message ID
  const suspectedDuplicateCandidate: GmailMessageCandidate = {
    id: "msg-forwarded-copy",
    threadId: "th-fwd",
    sender: "pm@engoryx.local",
    to: [],
    cc: [],
    subject: "Fwd: Invoice from Acme",
    receivedAt: "2026-08-16T10:00:00Z",
    snippet: "",
    bodyText: "Forwarding invoice.",
    labels: ["INBOX"],
    attachments: [{ attachmentId: "att-copy-1", filename: "invoice-2026-001.pdf", mimeType: "application/pdf", size: 102400 }],
  };

  // 3. Unique candidate
  const uniqueCandidate: GmailMessageCandidate = {
    id: "msg-brand-new",
    threadId: "th-new",
    sender: "billing@acme.ph",
    to: [],
    cc: [],
    subject: "Tax Invoice INV-2026-002",
    receivedAt: "2026-08-30T10:00:00Z",
    snippet: "",
    bodyText: "Tax invoice INV-2026-002.",
    labels: ["INBOX"],
    attachments: [{ attachmentId: "att-unique-1", filename: "invoice-2026-002.pdf", mimeType: "application/pdf", size: 80000 }],
  };

  const { items } = deriveEmailQueueItems([exactDuplicateCandidate, suspectedDuplicateCandidate, uniqueCandidate], {
    invoices: sampleInvoices,
    expenses: sampleExpenses,
  });

  const exactItem = items.find((i) => i.id === "msg-existing-1")!;
  const suspectedItem = items.find((i) => i.id === "msg-forwarded-copy")!;
  const uniqueItem = items.find((i) => i.id === "msg-brand-new")!;

  assert.equal(exactItem.duplicate.status, "EXACT_DUPLICATE");
  assert.equal(exactItem.duplicate.matchedRecordType, "INVOICE");
  assert.equal(exactItem.duplicate.matchedRecordId, "inv-existing-1");
  assert.equal(exactItem.duplicate.matchedRecordLabel, "Invoice INV-2026-001");
  assert.equal(exactItem.queueStatus, "SUSPECTED_DUPLICATE");

  assert.equal(suspectedItem.duplicate.status, "SUSPECTED_DUPLICATE");
  assert.equal(suspectedItem.duplicate.matchedRecordId, "inv-existing-1");
  assert.equal(suspectedItem.queueStatus, "SUSPECTED_DUPLICATE");

  assert.equal(uniqueItem.duplicate.status, "NO_KNOWN_DUPLICATE");
  assert.equal(uniqueItem.queueStatus, "DISCOVERED");
});

test("Phase 4F: Existing entity match resolution and same-batch grouping", () => {
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

  // Two candidates from same supplier in the batch
  const cand1: GmailMessageCandidate = {
    id: "cand-batch-1",
    threadId: "th-b1",
    sender: "Acme Dispatch <orders@acme.ph>",
    to: [],
    cc: [],
    subject: "Invoice for Concrete Mix",
    receivedAt: "2026-08-30T10:00:00Z",
    snippet: "",
    bodyText: "Attached invoice for concrete delivery.",
    labels: ["INBOX"],
    attachments: [{ attachmentId: "att-b1", filename: "inv-concrete.pdf", mimeType: "application/pdf", size: 50000 }],
  };

  const cand2: GmailMessageCandidate = {
    id: "cand-batch-2",
    threadId: "th-b2",
    sender: "Acme Dispatch <orders@acme.ph>",
    to: [],
    cc: [],
    subject: "Invoice for Rebar Delivery",
    receivedAt: "2026-08-30T11:00:00Z",
    snippet: "",
    bodyText: "Attached invoice for rebar delivery.",
    labels: ["INBOX"],
    attachments: [{ attachmentId: "att-b2", filename: "inv-rebar.pdf", mimeType: "application/pdf", size: 52000 }],
  };

  const { items } = deriveEmailQueueItems([cand1, cand2], {
    profiles: [profile],
    vendors: sampleVendors,
    financialAccounts: sampleAccounts,
  });

  const item1 = items.find((i) => i.id === "cand-batch-1")!;
  const item2 = items.find((i) => i.id === "cand-batch-2")!;

  // Both should resolve to existing Acme vendor via profile & domain
  assert.equal(item1.entityMatch.status, "MATCHED");
  assert.equal(item1.entityMatch.entityName, "Acme Industrial Supplies Inc.");

  assert.equal(item2.entityMatch.status, "MATCHED");
  assert.equal(item2.entityMatch.entityName, "Acme Industrial Supplies Inc.");

  // Same-batch grouping detected
  assert.ok(item1.batchGroup);
  assert.equal(item1.batchGroup?.memberCount, 2);
  assert.ok(item2.batchGroup);
  assert.equal(item2.batchGroup?.memberCount, 2);
});

test("Phase 4F: Filter multi-criteria operations (destination, status, duplicateOnly, query)", () => {
  const candInvoice: GmailMessageCandidate = {
    id: "c-inv",
    threadId: "t-1",
    sender: "billing@acme.ph",
    to: [],
    cc: [],
    subject: "Tax Invoice INV-100",
    receivedAt: "2026-08-30T10:00:00Z",
    snippet: "",
    bodyText: "Invoice details",
    labels: ["INBOX"],
    attachments: [{ attachmentId: "a-1", filename: "inv-100.pdf", mimeType: "application/pdf", size: 1000 }],
  };

  const candStatement: GmailMessageCandidate = {
    id: "c-stmt",
    threadId: "t-2",
    sender: "ebanking@bdo.com.ph",
    to: [],
    cc: [],
    subject: "Bank Statement",
    receivedAt: "2026-08-30T10:00:00Z",
    snippet: "",
    bodyText: "Statement details",
    labels: ["INBOX"],
    attachments: [{ attachmentId: "a-2", filename: "bdo.pdf", mimeType: "application/pdf", size: 2000 }],
  };

  const candDuplicate: GmailMessageCandidate = {
    id: "msg-existing-1",
    threadId: "t-3",
    sender: "billing@acme.ph",
    to: [],
    cc: [],
    subject: "Duplicate INV-2026-001",
    receivedAt: "2026-08-30T10:00:00Z",
    snippet: "",
    bodyText: "Duplicate invoice",
    labels: ["INBOX"],
    attachments: [{ attachmentId: "att-existing-1", filename: "invoice-2026-001.pdf", mimeType: "application/pdf", size: 102400 }],
  };

  const { items } = deriveEmailQueueItems([candInvoice, candStatement, candDuplicate], {
    invoices: sampleInvoices,
  });

  // 1. Destination filter: INVOICE
  const invoiceFiltered = filterEmailQueueItems(items, { destination: "INVOICE" });
  assert.equal(invoiceFiltered.length, 2);

  // 2. Destination filter: BANK_STATEMENT
  const statementFiltered = filterEmailQueueItems(items, { destination: "BANK_STATEMENT" });
  assert.equal(statementFiltered.length, 1);
  assert.equal(statementFiltered[0].id, "c-stmt");

  // 3. Duplicates only filter
  const duplicatesFiltered = filterEmailQueueItems(items, { duplicateOnly: true });
  assert.equal(duplicatesFiltered.length, 1);
  assert.equal(duplicatesFiltered[0].id, "msg-existing-1");

  // 4. Search query filter
  const searchFiltered = filterEmailQueueItems(items, { searchQuery: "bdo" });
  assert.equal(searchFiltered.length, 1);
  assert.equal(searchFiltered[0].id, "c-stmt");
});

test("Phase 4F: Safe batch preparation isolates per-item errors and preserves preparation-only invariants", async () => {
  const cand1: GmailMessageCandidate = {
    id: "cand-prep-1",
    threadId: "t-1",
    sender: "billing@acme.ph",
    to: [],
    cc: [],
    subject: "Tax Invoice 1",
    receivedAt: "2026-08-30T10:00:00Z",
    snippet: "",
    bodyText: "Tax invoice 1",
    labels: ["INBOX"],
    attachments: [{ attachmentId: "a-1", filename: "inv1.pdf", mimeType: "application/pdf", size: 1000 }],
  };

  const cand2Failing: GmailMessageCandidate = {
    id: "cand-prep-fail",
    threadId: "t-2",
    sender: "billing@corrupt.ph",
    to: [],
    cc: [],
    subject: "Tax Invoice 2",
    receivedAt: "2026-08-30T10:00:00Z",
    snippet: "",
    bodyText: "Tax invoice 2",
    labels: ["INBOX"],
    attachments: [{ attachmentId: "a-2", filename: "corrupt.pdf", mimeType: "application/pdf", size: 1000 }],
  };

  const cand3: GmailMessageCandidate = {
    id: "cand-prep-3",
    threadId: "t-3",
    sender: "billing@acme.ph",
    to: [],
    cc: [],
    subject: "Tax Invoice 3",
    receivedAt: "2026-08-30T10:00:00Z",
    snippet: "",
    bodyText: "Tax invoice 3",
    labels: ["INBOX"],
    attachments: [{ attachmentId: "a-3", filename: "inv3.pdf", mimeType: "application/pdf", size: 1000 }],
  };

  const candidates = [cand1, cand2Failing, cand3];
  const progressCalls: Array<{ candidateId: string; status: string; error?: string }> = [];

  const results = await prepareBatchEmailCandidates(candidates, {
    canManageMailbox: true,
    canProcessInvoices: true,
    onImportInvoice: async (candidate) => {
      if (candidate.id === "cand-prep-fail") {
        throw new Error("Attachment corrupt or unreadable");
      }
      return 1;
    },
    onItemProgress: (candidateId, status, error) => {
      progressCalls.push({ candidateId, status, error });
    },
  });

  assert.equal(results.length, 3);
  assert.equal(results[0].status, "SUCCESS");
  assert.equal(results[1].status, "FAILED");
  assert.equal(results[1].error, "Attachment corrupt or unreadable");
  assert.equal(results[2].status, "SUCCESS");

  // Progress events reported accurately
  assert.ok(progressCalls.some((p) => p.candidateId === "cand-prep-fail" && p.status === "FAILED"));
  assert.ok(progressCalls.some((p) => p.candidateId === "cand-prep-1" && p.status === "READY"));
  assert.ok(progressCalls.some((p) => p.candidateId === "cand-prep-3" && p.status === "READY"));
});

test("Phase 4F: Permission boundaries enforce separation between Gmail access and destination mutation", () => {
  const candidateInvoice: GmailMessageCandidate = {
    id: "msg-perm-inv",
    threadId: "th-p1",
    sender: "billing@acme.ph",
    to: [],
    cc: [],
    subject: "Invoice for Parts",
    receivedAt: "2026-08-30T10:00:00Z",
    snippet: "",
    bodyText: "Invoice attached.",
    labels: ["INBOX"],
    attachments: [{ attachmentId: "att-p1", filename: "inv.pdf", mimeType: "application/pdf", size: 1000 }],
  };

  const candidateStatement: GmailMessageCandidate = {
    id: "msg-perm-stmt",
    threadId: "th-p2",
    sender: "ebanking@bdo.com.ph",
    to: [],
    cc: [],
    subject: "Monthly Statement",
    receivedAt: "2026-08-30T10:00:00Z",
    snippet: "",
    bodyText: "Bank statement attached.",
    labels: ["INBOX"],
    attachments: [{ attachmentId: "att-p2", filename: "stmt.pdf", mimeType: "application/pdf", size: 1000 }],
  };

  // Scenario 1: User has Gmail read/manage, but NO invoice permissions
  const { items: invoiceNoPerms } = deriveEmailQueueItems([candidateInvoice], {
    canManageMailbox: true,
    canProcessInvoices: false,
  });

  const invItemNoPerms = invoiceNoPerms[0];
  assert.equal(invItemNoPerms.primaryAction.enabled, false);
  assert.ok(invItemNoPerms.primaryAction.disabledReason?.includes("invoice permission"));
  assert.equal(invItemNoPerms.isEligibleForBatchPrep, false);

  // Scenario 2: User has Gmail read/manage, but NO bank statement import permissions
  const { items: stmtNoPerms } = deriveEmailQueueItems([candidateStatement], {
    canManageMailbox: true,
    canImportBankStatements: false,
  });

  const stmtItemNoPerms = stmtNoPerms[0];
  assert.equal(stmtItemNoPerms.primaryAction.enabled, false);
  assert.ok(stmtItemNoPerms.primaryAction.disabledReason?.includes("cash import"));
  assert.equal(stmtItemNoPerms.isEligibleForBatchPrep, false);
});

test("Phase 4F: Gmail connection state invariants distinguish authorization loss from parsing errors", () => {
  const healthyConnection: GmailConnectionInfo = {
    configured: true,
    signedIn: true,
    hasGmailToken: true,
    email: "finance@company.com",
    lastSyncedAt: "2026-08-31T10:00:00Z",
  };

  // 1. Parsing error does NOT trigger reconnect required
  const ordinaryError = "PDF extraction timed out after 30 seconds";
  assert.equal(isGmailAuthorizationError(ordinaryError), false);
  assert.equal(resolveGmailConnectionStatus(healthyConnection, ordinaryError), "HEALTHY");

  // 2. Genuine auth revocation triggers reconnect required
  const authError = "invalid_grant: Token has been expired or revoked";
  assert.equal(isGmailAuthorizationError(authError), true);
  assert.equal(resolveGmailConnectionStatus(healthyConnection, authError), "RECONNECT_REQUIRED");
});
