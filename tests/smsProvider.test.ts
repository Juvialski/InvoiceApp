import assert from "node:assert/strict";
import test from "node:test";
import {
  createAndroidSimGatewayProvider,
  createPhilSmsProvider,
  getSmsProviderStatus,
  normalizeAndroidGatewayStatus,
  normalizePhilSmsStatus,
  resolveSmsProvider,
} from "../src/server/messaging/smsProvider.ts";
import { normalizePhilippineMobileNumber } from "../src/lib/smsNumber.ts";

type Call = { url: string; init?: RequestInit };

function fakeFetch(responses: Response[]) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const response = responses.shift();
    if (!response) throw new Error("No fake provider response available.");
    return response;
  };
  return { fetch, calls };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const gatewayEnv = {
  SMS_PROVIDER: "ANDROID_SIM_GATEWAY",
  SMS_GATEWAY_BASE_URL: "https://gateway.example.test",
  SMS_GATEWAY_USERNAME: "gateway-user",
  SMS_GATEWAY_PASSWORD: "gateway-password",
  SMS_GATEWAY_SIM_NUMBER: "2",
  SMS_GATEWAY_DEVICE_ID: "device-1",
};

test("Philippine mobile numbers normalize to one canonical E.164 form and reject unsafe destinations", () => {
  assert.equal(normalizePhilippineMobileNumber("09 171-234-567"), "+639171234567");
  assert.equal(normalizePhilippineMobileNumber("639171234567"), "+639171234567");
  assert.equal(normalizePhilippineMobileNumber("+639171234567"), "+639171234567");
  assert.throws(() => normalizePhilippineMobileNumber("+14155550123"), /Philippine mobile/i);
  assert.throws(() => normalizePhilippineMobileNumber("09171234567 ext 4"), /only a Philippine mobile/i);
  assert.throws(() => normalizePhilippineMobileNumber("0917123456"), /09|639/i);
});

test("provider selection is explicit, configuration is server-only, and readiness is not inferred from env values", () => {
  assert.equal(resolveSmsProvider({ SMS_PROVIDER: "twilio", SMS_API_KEY: "secret" }), null);
  assert.equal(resolveSmsProvider({ SMS_PROVIDER: "PHILSMS", PHILSMS_API_TOKEN: "token" }), null);
  assert.deepEqual(getSmsProviderStatus({}), { status: "NOT_CONFIGURED" });
  const status = getSmsProviderStatus({ ...gatewayEnv });
  assert.equal(status.status, "CONFIGURED_UNVERIFIED");
  assert.equal(status.providerId, "ANDROID_SIM_GATEWAY");
  assert.doesNotMatch(JSON.stringify(status), /gateway-password|gateway-user/i);
});

test("Android SIM Gateway maps the private-server URL, Basic Auth, stable provider id, SIM selection, and accepted status", async () => {
  const fake = fakeFetch([jsonResponse({ id: "gateway-message-1", state: "Pending" }, 202)]);
  const provider = createAndroidSimGatewayProvider(gatewayEnv, fake.fetch);
  assert.ok(provider);
  const result = await provider.send({ destination: "09 171 234 567", message: "Hello from HydroQualiSense", idempotencyKey: "sms-attempt-1" });
  assert.equal(result.providerId, "ANDROID_SIM_GATEWAY");
  assert.equal(result.providerMessageId, "gateway-message-1");
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.reconciliationRequired, false);
  assert.equal(fake.calls[0]?.url, "https://gateway.example.test/api/3rdparty/v1/messages");
  assert.equal(fake.calls[0]?.init?.headers && new Headers(fake.calls[0].init.headers).get("Authorization"), `Basic ${Buffer.from("gateway-user:gateway-password").toString("base64")}`);
  const body = JSON.parse(String(fake.calls[0]?.init?.body));
  assert.deepEqual(body.phoneNumbers, ["+639171234567"]);
  assert.equal(body.simNumber, 2);
  assert.equal(body.deviceId, "device-1");
  assert.equal(body.id.length, 35);
  assert.doesNotMatch(JSON.stringify(result), /gateway-password|gateway-user/i);
});

test("Android duplicate response reconciles by the same provider message identity instead of sending again", async () => {
  const fake = fakeFetch([jsonResponse({ message: "already exists" }, 409), jsonResponse({ id: "ignored", state: "Delivered" })]);
  const provider = createAndroidSimGatewayProvider({ ...gatewayEnv, SMS_GATEWAY_SIM_NUMBER: "" }, fake.fetch);
  assert.ok(provider);
  const result = await provider.send({ destination: "+639171234567", message: "Same attempt", idempotencyKey: "same-attempt" });
  assert.equal(result.status, "DELIVERED");
  assert.match(result.providerMessageId || "", /^hs_[a-f0-9]{32}$/);
  assert.equal(fake.calls.length, 2);
  assert.match(fake.calls[1]?.url || "", /\/messages\//);
});

test("Android malformed or ambiguous responses remain reconciliation-required", async () => {
  const fake = fakeFetch([jsonResponse({}, 202)]);
  const provider = createAndroidSimGatewayProvider(gatewayEnv, fake.fetch);
  assert.ok(provider);
  const result = await provider.send({ destination: "+639171234567", message: "Ambiguous", idempotencyKey: "ambiguous-attempt" });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.reconciliationRequired, true);
  assert.match(result.safeMessage, /reconciliation/i);
});

test("Android device health is based on a recent registered-device heartbeat, not credentials alone", async () => {
  const recent = new Date(Date.now() - 2_000).toISOString();
  const fake = fakeFetch([jsonResponse([{ id: "device-1", name: "Company phone", lastSeen: recent, simCards: [{ simNumber: 2, carrierName: "QA Carrier", phoneNumber: "+6391****4567" }] }])]);
  const provider = createAndroidSimGatewayProvider(gatewayEnv, fake.fetch);
  assert.ok(provider);
  const result = await provider.checkStatus();
  assert.equal(result.status, "READY");
  assert.equal(result.deviceLabel, "Company phone");
  assert.equal(result.simNumber, 2);
  assert.equal(result.simCarrier, "QA Carrier");
  assert.equal(result.lastSeen, recent);

  const oldFake = fakeFetch([jsonResponse([{ id: "device-1", lastSeen: "2020-01-01T00:00:00Z" }])]);
  const oldProvider = createAndroidSimGatewayProvider(gatewayEnv, oldFake.fetch);
  assert.ok(oldProvider);
  assert.equal((await oldProvider.checkStatus()).status, "DEGRADED");
});

test("PhilSMS maps Bearer auth, a single canonical recipient, plain/unicode type, provider id, and status lookup", async () => {
  const fake = fakeFetch([
    jsonResponse({ status: "success", data: { uid: "philsms-1" } }),
    jsonResponse({ status: "success", data: { uid: "philsms-1", status: "delivered" } }),
  ]);
  const provider = createPhilSmsProvider({ SMS_PROVIDER: "PHILSMS", PHILSMS_API_TOKEN: "phil-secret", PHILSMS_SENDER_ID: "Hydro" }, fake.fetch);
  assert.ok(provider);
  const result = await provider.send({ destination: "09171234567", message: "Hello 👋", idempotencyKey: "phil-attempt-1" });
  assert.equal(result.providerId, "PHILSMS");
  assert.equal(result.providerMessageId, "philsms-1");
  assert.equal(result.status, "ACCEPTED");
  assert.equal(fake.calls[0]?.url, "https://app.philsms.com/api/v3/sms/send");
  assert.equal(fake.calls[0]?.init?.headers && new Headers(fake.calls[0].init.headers).get("Authorization"), "Bearer phil-secret");
  const body = JSON.parse(String(fake.calls[0]?.init?.body));
  assert.deepEqual(body, { recipient: "+639171234567", sender_id: "Hydro", type: "unicode", message: "Hello 👋" });
  const lookup = await provider.lookupStatus("philsms-1");
  assert.equal(lookup.status, "DELIVERED");
  assert.equal(fake.calls[1]?.url, "https://app.philsms.com/api/v3/sms/philsms-1");
  assert.doesNotMatch(JSON.stringify(result), /phil-secret/i);
});

test("PhilSMS missing provider id or network failure never claims a send", async () => {
  const ambiguous = fakeFetch([jsonResponse({ status: "success", data: { status: "queued" } })]);
  const provider = createPhilSmsProvider({ SMS_PROVIDER: "PHILSMS", PHILSMS_API_TOKEN: "phil-secret", PHILSMS_SENDER_ID: "Hydro" }, ambiguous.fetch);
  assert.ok(provider);
  const result = await provider.send({ destination: "+639171234567", message: "Ambiguous", idempotencyKey: "phil-ambiguous" });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.reconciliationRequired, true);

  const failed = createPhilSmsProvider({ SMS_PROVIDER: "PHILSMS", PHILSMS_API_TOKEN: "phil-secret", PHILSMS_SENDER_ID: "Hydro" }, async () => { throw new Error("network down"); });
  assert.ok(failed);
  const networkResult = await failed.send({ destination: "+639171234567", message: "Network", idempotencyKey: "phil-network" });
  assert.equal(networkResult.status, "UNKNOWN");
  assert.equal(networkResult.reconciliationRequired, true);
});

test("provider status vocabularies fail closed for unknown upstream states", () => {
  assert.equal(normalizeAndroidGatewayStatus("Pending"), "ACCEPTED");
  assert.equal(normalizeAndroidGatewayStatus("Delivered"), "DELIVERED");
  assert.equal(normalizeAndroidGatewayStatus("something-new"), "UNKNOWN");
  assert.equal(normalizePhilSmsStatus("queued"), "ACCEPTED");
  assert.equal(normalizePhilSmsStatus("delivered"), "DELIVERED");
  assert.equal(normalizePhilSmsStatus("something-new"), "UNKNOWN");
});
