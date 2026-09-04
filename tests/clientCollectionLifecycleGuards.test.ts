import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guards = readFileSync(
  new URL("../supabase/migrations/20260904093000_client_collection_lifecycle_guards.sql", import.meta.url),
  "utf8",
);

test("P2B-5 finalized collection lifecycle is single-shot", () => {
  assert.match(guards, /guard_client_collection_finalized_update/);
  assert.match(guards, /old\.status = 'DRAFT'/);
  assert.match(guards, /new\.status not in \('DRAFT', 'RECORDED'\)/);
  assert.match(guards, /old\.status = 'RECORDED'/);
  assert.match(guards, /new\.status <> 'REVERSED'/);
  assert.match(guards, /old\.status = 'REVERSED'/);
  assert.match(guards, /Reversed client collections are terminal and immutable/);
  assert.match(guards, /client_collections_finalized_state_guard/);
});

test("P2B-5 blocks voiding billed truth while active recorded collections exist", () => {
  assert.match(guards, /prevent_client_billing_void_with_recorded_collections/);
  assert.match(guards, /old\.status = 'ISSUED' and new\.status = 'VOIDED'/);
  assert.match(guards, /public\.client_collection_allocations/);
  assert.match(guards, /public\.client_collections/);
  assert.match(guards, /c\.status = 'RECORDED'/);
  assert.match(guards, /reverse those collections first/i);
  assert.match(guards, /using errcode = '23514'/);
  assert.match(guards, /client_billings_collection_void_guard/);
});
