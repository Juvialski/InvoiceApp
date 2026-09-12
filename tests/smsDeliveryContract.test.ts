import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { appPathForEmailWorkspace, emailWorkspaceContextFromSearch } from "../src/utils/appRouting.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260912061500_wave4d_sms_providers.sql", import.meta.url), "utf8");
const androidReconciliationMigration = readFileSync(new URL("../supabase/migrations/20260912073000_android_sms_reconciliation_reference.sql", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/app/routes/EmailSmsRoute.tsx", import.meta.url), "utf8");
const compose = readFileSync(new URL("../src/components/SmsComposePanel.tsx", import.meta.url), "utf8");
const status = readFileSync(new URL("../src/components/SmsProviderStatusPanel.tsx", import.meta.url), "utf8");
const clientMessaging = readFileSync(new URL("../src/lib/messaging.ts", import.meta.url), "utf8");

test("SMS compose routing carries only the channel and never message content", () => {
  const path = appPathForEmailWorkspace("compose", { channel: "sms" });
  assert.equal(path, "/email-sms?view=compose&channel=sms");
  assert.deepEqual(emailWorkspaceContextFromSearch(path.split("?", 2)[1]), { view: "compose", channel: "sms" });
  assert.doesNotMatch(path, /message|recipient|token/i);
});

test("the two approved SMS paths stay behind one server-only provider boundary", () => {
  assert.match(status, /Company SIM Gateway/);
  assert.match(status, /Recommended/);
  assert.match(status, /PhilSMS/);
  assert.match(status, /Send controlled test SMS/);
  assert.match(workspace, /<SmsComposePanel/);
  assert.match(compose, /Prepare a transactional SMS draft/);
  assert.match(compose, /Confirm & Send SMS/);
  assert.match(server, /app\.post\("\/api\/messaging\/sms\/send"/);
  assert.match(server, /confirmed !== true/);
  assert.match(server, /normalizePhilippineMobileNumber/);
  assert.match(server, /claim_sms_send_intent/);
  assert.match(server, /complete_sms_delivery_intent/);
  assert.match(server, /SMS_SEND_RECONCILE_REQUIRED/);
  assert.match(clientMessaging, /payload\.data\?\.reconciliationRequired === true/);
  assert.match(clientMessaging, /!code && response\.status >= 500/);
  assert.match(clientMessaging, /response\.ok && payload\.success !== true/);
  assert.doesNotMatch(clientMessaging, /code === "SMS_SEND_RECONCILE_REQUIRED" \|\| response\.status >= 500/);
  assert.doesNotMatch(clientMessaging, /PHILSMS_API_TOKEN|SMS_GATEWAY_PASSWORD|SMS_GATEWAY_USERNAME/);
});

test("SMS database contract reuses delivery intent/audit history with safe channel, provider, and status fields", () => {
  assert.match(migration, /delivery_channel text not null default 'GMAIL'/i);
  assert.match(migration, /delivery_kind = 'GENERAL_SMS'/i);
  assert.match(migration, /destination.*\\\+639/i);
  assert.match(migration, /provider_message_id/);
  assert.match(migration, /provider_status/);
  assert.match(migration, /reconciliation_required/);
  assert.match(migration, /claim_sms_send_intent/);
  assert.match(migration, /complete_sms_delivery_intent/);
  assert.match(migration, /document_send_audits_send_intent_status_unique/);
  assert.doesNotMatch(migration, /create table[^;]+sms_(history|messages)/i);
  assert.match(migration, /documents\.send/);
  assert.match(migration, /jsonb_array_length\(new\.recipients\) <> 1/);
  assert.match(androidReconciliationMigration, /ensure_android_sms_reconciliation_reference/);
  assert.match(androidReconciliationMigration, /extensions\.digest/);
  assert.match(androidReconciliationMigration, /'hs_' \|\| left/);
});
