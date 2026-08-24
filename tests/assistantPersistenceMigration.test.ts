import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260824121000_invoice_operations_assistant.sql", import.meta.url),
  "utf8",
);

test("assistant persistence is additive, company scoped, private, and does not store binary content", () => {
  for (const table of ["assistant_threads", "assistant_messages", "assistant_action_events", "assistant_attachment_refs"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`${table}[\\s\\S]*company_id uuid not null`));
    assert.match(migration, /alter table public\.%I enable row level security/);
  }
  assert.match(migration, /auth\.uid\(\)\) = user_id/);
  assert.match(migration, /is_active_company_member\(company_id\)/);
  assert.match(migration, /unique \(company_id, idempotency_key\)/);
  assert.doesNotMatch(migration, /bytea|file_data|binary_data/i);
  assert.doesNotMatch(migration, /drop table/i);
});
