import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("active authentication, server, and communications paths contain no Gmail API", () => {
  const executable = [
    "server.ts",
    "src/lib/supabase.ts",
    "src/app/routes/AppRouter.tsx",
    "src/app/routes/EmailSmsRoute.tsx",
    "src/components/EmailComposePanel.tsx",
  ].map(source).join("\n");
  assert.doesNotMatch(executable, /gmail\.googleapis\.com|gmail\.readonly|gmail\.send|x-gmail-access-token|\/api\/gmail\//i);
});

test("communications no longer exposes mailbox connection, sync, scan, or intake controls", () => {
  const route = source("src/app/routes/EmailSmsRoute.tsx");
  assert.doesNotMatch(route, /EmailInbox|onConnectGmail|onScanGmail|onSyncGmail|onImportGmailMessage|gmailConnection|Inbox \/ Intake/i);
  assert.match(route, /Email Provider Status|email-status|EmailComposePanel/);
});

test("historical Gmail source identity remains part of source compatibility", () => {
  const types = source("src/types.ts");
  const persistence = source("src/lib/persistence.ts");
  assert.match(types, /gmailMessageId\?: string/);
  assert.match(types, /gmailAttachmentId\?: string/);
  assert.match(persistence, /loadEmailSource/);
  assert.match(persistence, /email_messages/);
});

test("SMS remains limited to the approved provider choices", () => {
  const smsProvider = source("src/server/messaging/smsProvider.ts");
  assert.match(smsProvider, /ANDROID_SIM_GATEWAY/);
  assert.match(smsProvider, /PHILSMS/);
  assert.doesNotMatch(smsProvider, /TWILIO|VONAGE|SEMAPHORE/i);
});
