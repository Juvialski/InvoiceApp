import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const server = source("server.ts");
const preview = source("src/components/DocumentPreviewModal.tsx");
const compose = source("src/components/EmailComposePanel.tsx");

test("server exposes Brevo email status and provider-neutral send routes", () => {
  assert.match(server, /app\.get\("\/api\/messaging\/status"/);
  assert.match(server, /checkBrevoEmailProvider|createBrevoEmailProvider/);
  assert.match(server, /app\.post\("\/api\/messaging\/email\/send"/);
  assert.doesNotMatch(server, /app\.post\("\/api\/gmail\/send"/);
  assert.doesNotMatch(server, /gmail\.googleapis\.com|x-gmail-access-token/i);
});

test("Brevo email send keeps snapshot, permission, idempotency, and accepted-state guards", () => {
  const start = server.indexOf('app.post("/api/messaging/email/send"');
  assert.ok(start >= 0);
  const route = server.slice(start);
  assert.match(route, /authorizeCompanyRequest\(req, "documents\.send"\)/);
  assert.match(route, /claim_document_send_intent/);
  assert.match(route, /complete_email_delivery_intent/);
  assert.match(route, /provider\.send/);
  assert.match(route, /providerResult\.status/);
  assert.match(route, /reconciliation/i);
  assert.match(route, /idempotent/);
  assert.match(route, /issued_document_snapshots/);
});

test("compose and issued-document preview use Brevo and distinguish acceptance from delivery", () => {
  assert.match(compose, /sendEmailMessage/);
  assert.match(compose, /Brevo accepted.*delivery is not confirmed/i);
  assert.doesNotMatch(compose, /Gmail|gmail|Inbox|Connect Gmail/i);
  assert.match(preview, /sendFinancialDocumentByEmail/);
  assert.match(preview, /Brevo accepted.*delivery is not confirmed/i);
  assert.doesNotMatch(preview, /sendFinancialDocumentByGmail|Gmail/);
});

test("messaging status returns email and preserves SMS status as a separate capability", () => {
  const statusStart = server.indexOf('app.get("/api/messaging/status"');
  const statusEnd = server.indexOf('function smsIntentResponse', statusStart);
  const statusRoute = server.slice(statusStart, statusEnd >= 0 ? statusEnd : undefined);
  assert.match(statusRoute, /email/);
  assert.match(statusRoute, /sms/);
  assert.match(statusRoute, /companyId/);
});
