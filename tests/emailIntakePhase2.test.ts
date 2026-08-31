import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyEmailIntakeCandidate,
  connectedMailboxFinanceQuery,
  extractSuggestedExpense,
  findPossibleExpenseDuplicates,
  isSupportedExpenseAttachment,
} from "../src/lib/emailIntake.ts";
import type { Expense, GmailMessageCandidate } from "../src/types.ts";

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

function mockExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "exp-101",
    expenseDate: "2026-08-31",
    category: "Fuel",
    description: "Gasoline refill",
    payee: "Petron Gas Station",
    amount: 2500,
    currency: "PHP",
    status: "APPROVED",
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

test("connected mailbox query includes receipt, expense, and bill signals", () => {
  const query = connectedMailboxFinanceQuery({ days: 30 });
  assert.match(query, /subject:receipt/);
  assert.match(query, /subject:"official receipt"/);
  assert.match(query, /subject:expense/);
  assert.match(query, /subject:bill/);
  assert.match(query, /"official receipt"/);
  assert.match(query, /"payment receipt"/);
  assert.match(query, /"acknowledgement receipt"/);
  assert.match(query, /filename:webp/);
});

test("isSupportedExpenseAttachment accepts pdf and image formats", () => {
  assert.equal(isSupportedExpenseAttachment({ filename: "receipt.pdf", mimeType: "application/pdf" }), true);
  assert.equal(isSupportedExpenseAttachment({ filename: "or_scan.png", mimeType: "image/png" }), true);
  assert.equal(isSupportedExpenseAttachment({ filename: "gas_receipt.jpg", mimeType: "image/jpeg" }), true);
  assert.equal(isSupportedExpenseAttachment({ filename: "receipt.webp", mimeType: "image/webp" }), true);
  assert.equal(isSupportedExpenseAttachment({ filename: "statement.csv", mimeType: "text/csv" }), false);
  assert.equal(isSupportedExpenseAttachment({ filename: "contract.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), false);
});

test("shared classifier routes official receipts and expense documents to EXPENSE", () => {
  const message = candidate({
    sender: "Shell Magallanes <receipts@shell.com.ph>",
    subject: "Official Receipt - Fuel purchase",
    bodyText: "Thank you for purchasing fuel. OR Number: OR-98765. Total Amount: PHP 3,200.00.",
    attachments: [{ attachmentId: "att-1", filename: "OR-98765.pdf", mimeType: "application/pdf", size: 1024 }],
  });
  const classification = classifyEmailIntakeCandidate(message);
  assert.equal(classification.suggestedDestination, "EXPENSE");
  assert.equal(classification.documentType, "RECEIPT");
  assert.equal(classification.isInvoiceLike, false);
  assert.deepEqual(classification.expenseAttachmentIds, ["att-1"]);
  assert.ok(classification.confidence >= 80);
});

test("shared classifier routes e-receipts and transportation receipts to EXPENSE", () => {
  const message = candidate({
    sender: "Grab Philippines <no-reply@grab.com>",
    subject: "Your Grab E-Receipt",
    bodyText: "Booking ID: GRB-2026-11. Total Paid: PHP 450.00 via GCash.",
    attachments: [{ attachmentId: "att-grab", filename: "grab_receipt.png", mimeType: "image/png", size: 512 }],
  });
  const classification = classifyEmailIntakeCandidate(message);
  assert.equal(classification.suggestedDestination, "EXPENSE");
  assert.equal(classification.documentType, "RECEIPT");
  assert.equal(classification.isInvoiceLike, false);
});

test("attachment-less receipts remain unsupported until a preservable source-document review path exists", () => {
  const message = candidate({
    sender: "Grab Philippines <no-reply@grab.com>",
    subject: "Your Grab E-Receipt",
    bodyText: "Booking ID: GRB-2026-12. Total Paid: PHP 450.00 via GCash.",
    attachments: [],
  });
  const classification = classifyEmailIntakeCandidate(message);
  assert.equal(classification.suggestedDestination, "UNSUPPORTED");
  assert.deepEqual(classification.expenseAttachmentIds, []);
});

test("ambiguous receipt and explicit invoice language stays in the invoice review path", () => {
  const message = candidate({
    sender: "supplier@example.com",
    subject: "Official Receipt and VAT Invoice SI-2044",
    bodyText: "Attached is the VAT invoice and official receipt for your purchase.",
    attachments: [{ attachmentId: "amb-1", filename: "SI-2044.pdf", mimeType: "application/pdf", size: 1024 }],
  });
  const classification = classifyEmailIntakeCandidate(message);
  assert.equal(classification.suggestedDestination, "INVOICE");
  assert.equal(classification.isInvoiceLike, true);
});

test("shared classifier preserves precedence for BANK_STATEMENT and INVOICE", () => {
  const bankMessage = candidate({
    subject: "Bank statement - August",
    bodyText: "Monthly account statement",
    attachments: [{ attachmentId: "stmt-1", filename: "statement.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 2048 }],
  });
  assert.equal(classifyEmailIntakeCandidate(bankMessage).suggestedDestination, "BANK_STATEMENT");

  const invoiceMessage = candidate({
    subject: "Sales Invoice SI-2026-44",
    bodyText: "Please see attached VAT sales invoice for your recent order. Amount due: PHP 50,000.",
    attachments: [{ attachmentId: "inv-1", filename: "SI-2026-44.pdf", mimeType: "application/pdf", size: 1024 }],
  });
  assert.equal(classifyEmailIntakeCandidate(invoiceMessage).suggestedDestination, "INVOICE");
});

test("extractSuggestedExpense extracts payee, date, amount, category, payment method, and reference", () => {
  const message = candidate({
    sender: "Petron Gas Station <billing@petron.com.ph>",
    subject: "Official Receipt - Site Fuel Delivery PRJ-2026-001",
    receivedAt: "2026-08-15T14:30:00.000Z",
    bodyText: "Official Receipt: OR-45678\nDate: 2026-08-15\nTotal Amount: PHP 4,850.50\nPayment Method: GCash\nProject: PRJ-2026-001",
    attachments: [{ attachmentId: "att-1", filename: "OR-45678.pdf", mimeType: "application/pdf", size: 1024 }],
  });

  const extracted = extractSuggestedExpense(message, message.attachments[0]);
  assert.equal(extracted.payee, "Petron Gas Station");
  assert.equal(extracted.expenseDate, "2026-08-15");
  assert.equal(extracted.amount, 4850.5);
  assert.equal(extracted.currency, "PHP");
  assert.equal(extracted.category, "Fuel");
  assert.equal(extracted.paymentMethod, "GCash");
  assert.equal(extracted.referenceNumber, "OR-45678");
  assert.equal(extracted.projectId, "PRJ-2026-001");
  assert.match(extracted.notes || "", /Staged from Email Intake/);
});

test("extractSuggestedExpense categorizes hardware and materials correctly", () => {
  const message = candidate({
    sender: "Wilcon Depot <orders@wilcon.com.ph>",
    subject: "Wilcon Depot Purchase Receipt",
    receivedAt: "2026-08-20T10:00:00.000Z",
    bodyText: "Thank you for your purchase of cement, sand, and rebar. Total Paid: PHP 18,750.00 via Credit Card. Ref # TXN-998811.",
  });

  const extracted = extractSuggestedExpense(message);
  assert.equal(extracted.payee, "Wilcon Depot");
  assert.equal(extracted.category, "Materials");
  assert.equal(extracted.amount, 18750);
  assert.equal(extracted.paymentMethod, "Credit Card");
  assert.equal(extracted.referenceNumber, "TXN-998811");
});

test("findPossibleExpenseDuplicates detects source document, reference number, and exact payee-amount-date duplicates", () => {
  const existing: Expense[] = [
    mockExpense({ id: "exp-1", receiptSourceDocumentId: "source-doc-uuid-1", amount: 1500, payee: "Grab", expenseDate: "2026-08-10" }),
    mockExpense({ id: "exp-2", referenceNumber: "OR-7788", amount: 3000, payee: "Shell", expenseDate: "2026-08-12" }),
    mockExpense({ id: "exp-3", amount: 5000, payee: "Wilcon Depot", expenseDate: "2026-08-15" }),
    mockExpense({ id: "exp-4", status: "VOID", amount: 5000, payee: "Wilcon Depot", expenseDate: "2026-08-15" }),
  ];

  const match1 = findPossibleExpenseDuplicates({ sourceDocumentId: "source-doc-uuid-1" }, existing);
  assert.equal(match1.length, 1);
  assert.equal(match1[0]?.matchType, "SOURCE_DOCUMENT");
  assert.equal(match1[0]?.expense.id, "exp-1");

  const match2 = findPossibleExpenseDuplicates({ referenceNumber: "OR-7788" }, existing);
  assert.equal(match2.length, 1);
  assert.equal(match2[0]?.matchType, "REFERENCE_NUMBER");
  assert.equal(match2[0]?.expense.id, "exp-2");

  const match3 = findPossibleExpenseDuplicates({ payee: "Wilcon Depot", amount: 5000, expenseDate: "2026-08-15" }, existing);
  assert.equal(match3.length, 1);
  assert.equal(match3[0]?.matchType, "EXACT_PAYEE_AMOUNT_DATE");
  assert.equal(match3[0]?.expense.id, "exp-3");

  const match4 = findPossibleExpenseDuplicates({ payee: "Unknown Merchant", amount: 999, expenseDate: "2026-08-20" }, existing);
  assert.equal(match4.length, 0);
});

test("expense provenance migration adds index for receipt source document without a UTF-8 BOM", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260831120000_email_intake_expense_provenance.sql", import.meta.url), "utf8");
  assert.equal(sql.charCodeAt(0), "-".charCodeAt(0));
  assert.match(sql, /create index if not exists expenses_receipt_source_document_idx/i);
  assert.match(sql, /on public\.expenses\(company_id, receipt_source_document_id\)/i);
});
