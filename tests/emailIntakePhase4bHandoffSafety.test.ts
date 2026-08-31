import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("mailbox entity matches stay advisory and never override invoice post-extraction resolution", () => {
  const inbox = source("src/components/EmailInbox.tsx");
  const importStart = inbox.indexOf("const importCandidate = async");
  const statementStart = inbox.indexOf("const reviewStatement = async", importStart);
  assert.ok(importStart >= 0 && statementStart > importStart);
  const importBlock = inbox.slice(importStart, statementStart);

  assert.doesNotMatch(importBlock, /preliminaryResolution\s*:/);
  assert.doesNotMatch(importBlock, /preliminaryResolution\s*\?/);
  assert.match(importBlock, /classification:\s*effectiveClassification\(message, profiles\)/);
});

test("mailbox statement and expense hints are not staged as confirmed entity selections", () => {
  const inbox = source("src/components/EmailInbox.tsx");
  const statementStart = inbox.indexOf("const reviewStatement = async");
  const expenseStart = inbox.indexOf("const reviewExpense = async", statementStart);
  const manualStart = inbox.indexOf("const handleManualSubmit = async", expenseStart);
  assert.ok(statementStart >= 0 && expenseStart > statementStart && manualStart > expenseStart);

  const statementBlock = inbox.slice(statementStart, expenseStart);
  const expenseBlock = inbox.slice(expenseStart, manualStart);

  assert.doesNotMatch(statementBlock, /confirmedAccountId\s*:/);
  assert.match(statementBlock, /preliminaryResolution:\s*resolution/);
  assert.doesNotMatch(expenseBlock, /confirmedVendorId\s*:/);
  assert.match(expenseBlock, /preliminaryResolution:\s*resolution/);
});

test("master Vendor linkage cannot overwrite invoice document Vendor evidence", () => {
  const workspace = source("src/components/VerificationWorkspace.tsx");
  assert.match(workspace, /const resolutionChanged =/);
  assert.match(workspace, /const vendorChanged =/);
  assert.match(workspace, /if \(resolutionChanged && vendorChanged\)/);
  assert.match(workspace, /onUpdateInvoice\(\{ \.\.\.updated, vendor: invoice\.vendor \}\)/);
  assert.match(workspace, /<ReviewPanel[\s\S]*?onUpdateInvoice=\{handleInvoiceUpdate\}/);
  assert.match(workspace, /<InvoiceViewer[\s\S]*?onUpdateInvoice=\{handleInvoiceUpdate\}/);
});

test("post-extraction and post-parse resolvers remain authoritative downstream", () => {
  const statementReview = source("src/components/ConnectedStatementReview.tsx");
  const expenseReview = source("src/components/ConnectedExpenseReview.tsx");
  const app = source("src/App.tsx");

  assert.match(statementReview, /extractAccountEvidenceFromStatement/);
  assert.match(statementReview, /resolveFinancialAccountCandidate/);
  assert.match(expenseReview, /extractVendorEvidenceFromExpense/);
  assert.match(expenseReview, /resolveVendorCandidate/);
  assert.match(app, /resolveBatchVendors\(candidateItems, existingVendors, existingProfiles\)/);
});
