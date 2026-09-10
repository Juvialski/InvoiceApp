import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  documentDeliveryAttachmentLabel,
  newDocumentDeliveryAttemptKey,
} from "../src/lib/documentDelivery.ts";
import { mapDocumentDeliveryHistory } from "../src/server/documentDelivery/documentDeliveryHistory.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260910110000_document_delivery_history.sql", import.meta.url), "utf8");
const terminalAuditMigration = readFileSync(new URL("../supabase/migrations/20260910113000_document_delivery_terminal_audit_atomicity.sql", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const preview = readFileSync(new URL("../src/components/DocumentPreviewModal.tsx", import.meta.url), "utf8");
const documentEmail = readFileSync(new URL("../src/lib/documentEmail.ts", import.meta.url), "utf8");

const HASH = "a".repeat(64);

test("delivery attachment labels and deliberate attempt keys are explicit", () => {
  assert.equal(documentDeliveryAttachmentLabel("COMPANY_TEMPLATE_PDF"), "Company-template PDF");
  assert.equal(documentDeliveryAttachmentLabel("PROGRAMMATIC_PDF_FALLBACK"), "Programmatic PDF fallback");
  assert.match(newDocumentDeliveryAttemptKey(), /^([0-9a-f]{8}-[0-9a-f-]{27}|document-send-\d+-[a-z0-9]+)$/i);
});

test("delivery history keeps sent and deliberate resend attempts separate", () => {
  const history = mapDocumentDeliveryHistory([
    {
      id: "attempt-2",
      sender_user_id: "user-1",
      recipients: ["client@example.test"],
      cc: [],
      subject: "Invoice resend",
      attachment_name: "INV-2.pdf",
      trusted_sha256: HASH,
      status: "SENT",
      attempt_count: 1,
      created_at: "2026-09-10T10:02:00Z",
      updated_at: "2026-09-10T10:02:00Z",
      attachment_source: "COMPANY_TEMPLATE_PDF",
      attachment_size: 1200,
      template_version: "Company Invoice v2",
    },
    {
      id: "attempt-1",
      sender_user_id: "user-1",
      recipients: ["client@example.test"],
      cc: ["finance@example.test"],
      subject: "Invoice",
      attachment_name: "INV-2.pdf",
      trusted_sha256: HASH,
      status: "SENT",
      attempt_count: 1,
      created_at: "2026-09-10T10:01:00Z",
      updated_at: "2026-09-10T10:01:00Z",
      attachment_source: "PROGRAMMATIC_PDF_FALLBACK",
      template_version: "HSC-CLIENT-INVOICE-v1",
    },
  ], [
    { id: "audit-2", send_intent_id: "attempt-2", status: "SENT", created_at: "2026-09-10T10:02:01Z", attachment_source: "COMPANY_TEMPLATE_PDF", attachment_sha256: HASH },
    { id: "audit-1", send_intent_id: "attempt-1", status: "SENT", created_at: "2026-09-10T10:01:01Z", attachment_source: "PROGRAMMATIC_PDF_FALLBACK", attachment_sha256: HASH },
  ], "user-1");

  assert.equal(history.length, 2);
  assert.equal(history[0]?.id, "attempt-2");
  assert.equal(history[0]?.attachmentSource, "COMPANY_TEMPLATE_PDF");
  assert.equal(history[0]?.resendAllowed, true);
  assert.equal(history[1]?.attachmentSource, "PROGRAMMATIC_PDF_FALLBACK");
  assert.equal(history[1]?.cc[0], "finance@example.test");
});

test("unknown or incomplete delivery states remain locked from blind resend", () => {
  const history = mapDocumentDeliveryHistory([
    { id: "unknown", sender_user_id: "other-user", recipients: ["client@example.test"], status: "UNKNOWN", attempt_count: 1, updated_at: "2026-09-10T10:00:00Z", attachment_source: "PROGRAMMATIC_PDF_FALLBACK", trusted_sha256: HASH },
    { id: "incomplete", sender_user_id: "other-user", recipients: ["client@example.test"], status: "SENT", attempt_count: 1, updated_at: "2026-09-10T09:00:00Z", attachment_source: "PROGRAMMATIC_PDF_FALLBACK", trusted_sha256: HASH },
  ], [], "user-1");
  assert.equal(history[0]?.reconciliationRequired, true);
  assert.equal(history[0]?.resendAllowed, false);
  assert.equal(history[1]?.reconciliationRequired, true);
  assert.equal(history[1]?.resendAllowed, false);
  assert.match(history[0]?.safeMessage || "", /reconciliation/i);
});

test("pre-intent immutable audit rows remain visible as legacy delivery history", () => {
  const history = mapDocumentDeliveryHistory([], [
    {
      id: "legacy-audit",
      sender_user_id: "user-1",
      recipients: ["legacy@example.test"],
      cc: [],
      subject: "Legacy invoice",
      attachment_name: "legacy.pdf",
      attachment_sha256: HASH,
      status: "SENT",
      created_at: "2026-09-10T08:00:00Z",
    },
  ], "user-1");
  assert.equal(history.length, 1);
  assert.equal(history[0]?.attachmentSource, "LEGACY_PDF");
  assert.equal(history[0]?.auditRecorded, true);
  assert.equal(history[0]?.resendAllowed, true);
});

test("terminal delivery outcomes commit their audit atomically while ambiguous outcomes remain unresolved", () => {
  assert.match(terminalAuditMigration, /after update of status on public\.document_send_intents/i);
  assert.match(terminalAuditMigration, /new\.status in \('SENT', 'FAILED'\)/);
  assert.match(terminalAuditMigration, /insert into public\.document_send_audits/i);
  assert.doesNotMatch(terminalAuditMigration, /new\.status in \([^)]*UNKNOWN[^)]*\)/i);
  assert.match(documentEmail, /!reconciliationRequired \? "DOCUMENT_SEND_FAILED" : undefined/);
});

test("Wave 4C reuses Gmail sending, binds exact PDF provenance, and exposes read-only history", () => {
  assert.match(server, /finalizeIssuedDocumentTemplatePdfForDelivery/);
  assert.match(server, /app\.get\("\/api\/document-delivery-history"/);
  assert.match(server, /attachmentSource/);
  assert.match(server, /trustedSha256/);
  assert.match(documentEmail, /DOCUMENT_SEND_RECONCILE_REQUIRED/);
  assert.match(preview, /data-document-delivery-history/);
  assert.match(preview, /Resend/);
  assert.match(preview, /Resend locked until reconciliation/);
  assert.match(migration, /attachment_source/);
  assert.match(migration, /Company-template delivery must reference the exact trusted PDF generation evidence/);
  assert.match(migration, /Only issued or closed purchase orders can receive a new document delivery/);
  assert.match(migration, /Only issued client invoices can receive a new document delivery/);
  assert.match(migration, /document_send_intents_select/);
  assert.match(migration, /procurement\.read/);
  assert.match(migration, /projects\.read/);
  assert.match(migration, /grant execute on function public\.record_document_send_audit/i);
});
