import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260915135236_brevo_email_delivery.sql", import.meta.url), "utf8");

test("Brevo delivery migration preserves historical Gmail rows while adding a distinct email provider", () => {
  assert.match(migration, /delivery_channel.*EMAIL/i);
  assert.match(migration, /provider_id.*BREVO/i);
  assert.match(migration, /gmail_message_id/i);
  assert.match(migration, /historical|preserv/i);
  assert.match(migration, /complete_email_delivery_intent/i);
});

test("Brevo delivery migration keeps provider acceptance separate from confirmed delivery", () => {
  assert.match(migration, /ACCEPTED/);
  assert.match(migration, /UNKNOWN/);
  assert.match(migration, /reconciliation_required/i);
  assert.match(migration, /provider_message_id/i);
});

test("Gmail refresh credentials are retired without deleting historical source or delivery evidence", () => {
  assert.match(migration, /drop table if exists public\.gmail_provider_credentials/i);
  assert.match(migration, /drop function if exists public\.server_get_gmail_provider_credential/i);
  assert.doesNotMatch(migration, /drop table if exists public\.(email_messages|source_documents|document_send_(intents|audits))/i);
});
