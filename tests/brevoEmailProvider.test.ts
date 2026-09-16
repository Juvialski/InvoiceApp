import assert from "node:assert/strict";
import test from "node:test";
import {
  BREVO_PROVIDER_ID,
  checkBrevoEmailProvider,
  createBrevoEmailProvider,
  type BrevoEmailProviderStatus,
} from "../src/server/messaging/brevoEmailProvider.ts";

const ENV = {
  BREVO_API_KEY: "secret-brevo-key",
  BREVO_SENDER_EMAIL: "sender@example.com",
  BREVO_SENDER_NAME: "Example Company",
  BREVO_REPLY_TO: "replies@example.com",
  BREVO_API_BASE_URL: "https://brevo.test/v3",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fetchQueue(responses: Response[]) {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected Brevo request");
    return next;
  };
  return { calls, fetchImpl };
}

test("Brevo status is not configured until the server has valid required settings", async () => {
  assert.equal(createBrevoEmailProvider({}, fetch), null);
  const status = await checkBrevoEmailProvider({}, fetch);
  assert.equal(status.status satisfies BrevoEmailProviderStatus, "NOT_CONFIGURED");
  assert.doesNotMatch(JSON.stringify(status), /secret-brevo-key/);
});

test("Brevo status requires an active configured sender after the account check", async () => {
  const queued = fetchQueue([
    response({ email: "account@example.com" }),
    response({ senders: [{ active: false, email: "sender@example.com", name: "Example Company" }] }),
  ]);
  const status = await checkBrevoEmailProvider(ENV, queued.fetchImpl);
  assert.equal(status.status, "SENDER_SETUP_REQUIRED");
  assert.deepEqual(queued.calls.map((call) => call.input), ["https://brevo.test/v3/account", "https://brevo.test/v3/senders"]);
  assert.equal(queued.calls[0].init?.headers && new Headers(queued.calls[0].init.headers).get("api-key"), "secret-brevo-key");
  assert.doesNotMatch(JSON.stringify(status), /secret-brevo-key/);
});

test("Brevo status is ready only when the configured sender is active", async () => {
  const queued = fetchQueue([
    response({ email: "account@example.com" }),
    response({ senders: [{ active: true, email: "SENDER@example.com", name: "Example Company" }] }),
  ]);
  const provider = createBrevoEmailProvider(ENV, queued.fetchImpl);
  assert.ok(provider);
  const status = await provider.checkStatus();
  assert.deepEqual(status, {
    status: "READY",
    providerId: BREVO_PROVIDER_ID,
    providerLabel: "Brevo",
    senderEmail: "sender@example.com",
    senderName: "Example Company",
    message: "Brevo is ready with the configured sender.",
  });
});

test("Brevo send maps reviewable email content, names, reply-to, and attachments", async () => {
  const queued = fetchQueue([response({ messageId: "<brevo-message-1@example.com>" }, 201)]);
  const provider = createBrevoEmailProvider(ENV, queued.fetchImpl);
  assert.ok(provider);
  const result = await provider.send({
    to: [{ email: "recipient@example.com", name: "Recipient" }],
    cc: [{ email: "copy@example.com" }],
    subject: "Reviewed message",
    textContent: "Hello\nWorld",
    replyTo: { email: "replies@example.com", name: "Replies" },
    attachment: { name: "invoice.pdf", contentBase64: "JVBERi0xLjQ=" },
    idempotencyKey: "attempt-1",
  });
  assert.deepEqual(result, {
    providerId: "BREVO",
    status: "ACCEPTED",
    providerMessageId: "<brevo-message-1@example.com>",
    providerStatus: "accepted",
    safeMessage: "Brevo accepted the message for processing; delivery is not confirmed.",
    reconciliationRequired: false,
  });
  const request = queued.calls[0];
  assert.equal(request.input, "https://brevo.test/v3/smtp/email");
  assert.equal(request.init?.method, "POST");
  const headers = new Headers(request.init?.headers);
  assert.equal(headers.get("api-key"), "secret-brevo-key");
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("Idempotency-Key"), "attempt-1");
  assert.deepEqual(JSON.parse(String(request.init?.body)), {
    sender: { email: "sender@example.com", name: "Example Company" },
    to: [{ email: "recipient@example.com", name: "Recipient" }],
    cc: [{ email: "copy@example.com" }],
    replyTo: { email: "replies@example.com", name: "Replies" },
    subject: "Reviewed message",
    textContent: "Hello\nWorld",
    attachment: [{ name: "invoice.pdf", content: "JVBERi0xLjQ=" }],
  });
});

test("Brevo failures are safe and distinguish rejected from ambiguous acceptance", async () => {
  const rejected = fetchQueue([response({ message: "sender rejected" }, 400)]);
  const provider = createBrevoEmailProvider(ENV, rejected.fetchImpl);
  assert.ok(provider);
  const failed = await provider.send({ to: [{ email: "recipient@example.com" }], cc: [], subject: "Subject", textContent: "Body", idempotencyKey: "attempt-2" });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.reconciliationRequired, false);
  assert.doesNotMatch(failed.safeMessage, /secret-brevo-key/);

  const ambiguous = fetchQueue([response({ messageId: "" }, 201)]);
  const providerWithAmbiguousResponse = createBrevoEmailProvider(ENV, ambiguous.fetchImpl);
  assert.ok(providerWithAmbiguousResponse);
  const unknown = await providerWithAmbiguousResponse.send({ to: [{ email: "recipient@example.com" }], cc: [], subject: "Subject", textContent: "Body", idempotencyKey: "attempt-3" });
  assert.equal(unknown.status, "UNKNOWN");
  assert.equal(unknown.reconciliationRequired, true);
});

test("Brevo connection failures never become ready", async () => {
  const status = await checkBrevoEmailProvider(ENV, async () => response({ error: "unavailable" }, 503));
  assert.equal(status.status, "CONNECTION_PROBLEM");
  assert.doesNotMatch(JSON.stringify(status), /secret-brevo-key/);
});
