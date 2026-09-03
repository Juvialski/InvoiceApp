import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260903141000_subcontract_archived_project_wind_down.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

test("archived projects block new subcontract activity but allow existing commitments to wind down", () => {
  assert.match(migration, /v_project_status = 'ARCHIVED' or v_project_archived_at is not null/i);
  assert.match(migration, /if tg_op = 'INSERT' then[\s\S]*?Archived projects cannot receive subcontract activity/i);
  assert.match(migration, /if new\.status is not distinct from old\.status then[\s\S]*?Archived projects cannot receive subcontract activity/i);
  assert.match(
    migration,
    /new\.status <> 'CANCELLED'[\s\S]*?old\.status = 'ACTIVE' and new\.status = 'CLOSED'[\s\S]*?Archived projects only permit subcontract wind-down to CLOSED or CANCELLED/i,
  );
});

test("archived-project wind-down keeps the guarded lifecycle and approval permission intact", () => {
  assert.match(migration, /procurement\.approve permission is required for subcontract lifecycle transitions/i);
  assert.match(migration, /Draft subcontracts can only be approved or cancelled/i);
  assert.match(migration, /Approved subcontracts can only be activated or cancelled/i);
  assert.match(migration, /Active subcontracts can only be closed or cancelled/i);
  assert.match(migration, /Closed or cancelled subcontracts cannot undergo further transitions/i);
  assert.match(migration, /Cancellation reason is required when cancelling a subcontract/i);
});
