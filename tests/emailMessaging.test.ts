import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseEmailProviderStatus } from "../src/lib/emailMessaging.ts";

test("email provider status accepts only safe Brevo status fields", () => {
  assert.deepEqual(parseEmailProviderStatus({
    status: "READY",
    providerId: "BREVO",
    providerLabel: "Brevo",
    senderEmail: "sender@example.com",
    senderName: "Example Company",
    message: "Brevo is ready with the configured sender.",
    apiKey: "secret-brevo-key",
  }), {
    status: "READY",
    providerId: "BREVO",
    providerLabel: "Brevo",
    senderEmail: "sender@example.com",
    senderName: "Example Company",
    message: "Brevo is ready with the configured sender.",
  });
});

test("email provider status fails closed for unknown or malformed values", () => {
  assert.deepEqual(parseEmailProviderStatus({ status: "HEALTHY", providerId: "GMAIL", message: "connected" }), {
    status: "CONNECTION_PROBLEM",
    message: "Email provider status is unavailable.",
  });
});

test("browser email delivery uses the provider-neutral messaging endpoint", () => {
  const source = readFileSync(new URL("../src/lib/documentEmail.ts", import.meta.url), "utf8");
  assert.match(source, /\/api\/messaging\/email\/send/);
  assert.doesNotMatch(source, /\/api\/gmail\/send|sendEmailMessageByGmail|gmail_message_id/i);
});

test("email provider status is a separate safe setup surface", () => {
  const panel = readFileSync(new URL("../src/components/EmailProviderStatusPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /Email setup|Brevo/);
  assert.match(panel, /Not configured|Sender setup required|Ready|Connection problem/);
  assert.doesNotMatch(panel, /BREVO_API_KEY|api-key|input[^>]+password|localStorage/i);
});
