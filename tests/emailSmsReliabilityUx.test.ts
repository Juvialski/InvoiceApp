import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inbox = readFileSync(new URL("../src/components/EmailInbox.tsx", import.meta.url), "utf8");
const sms = readFileSync(new URL("../src/components/SmsProviderStatusPanel.tsx", import.meta.url), "utf8");

test("Inbox first viewport keeps status and actions ahead of progressive-help copy", () => {
  assert.doesNotMatch(inbox, /Supported inbox workflows/);
  assert.match(inbox, /Sync new/);
  assert.match(inbox, /Scan/);
  assert.match(inbox, /Intake Rules/);
  assert.match(inbox, /How intake works|Help/);
  assert.doesNotMatch(inbox, /SMS boundary\.</i);
});

test("SMS status keeps normal state compact and moves operating detail into closed help", () => {
  assert.match(sms, /<details/);
  assert.match(sms, /Setup \/ Help|Setup instructions/);
  assert.match(sms, /Company SIM Gateway/);
  assert.match(sms, /PhilSMS/);
  assert.doesNotMatch(sms, /<details[^>]*open=/);
});

test("Company SIM setup distinguishes the Android device API from the HydroQualiSense server API", () => {
  assert.match(sms, /Android app[\s\S]*\/api\/mobile\/v1/);
  assert.match(sms, /HydroQualiSense[\s\S]*\/api\/3rdparty\/v1/);
  assert.doesNotMatch(sms, /In the Android app[\s\S]{0,250}\/api\/3rdparty\/v1/);
});
