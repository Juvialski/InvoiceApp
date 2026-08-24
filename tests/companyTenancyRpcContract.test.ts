import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20260824103000_company_tenancy_lead_rpc_shapes.sql", import.meta.url), "utf8");

test("lead RPC shapes return the object/argument contract used by persistence", () => {
  assert.match(sql, /create function public\.get_my_company_access\(\)\s+returns jsonb/i);
  assert.match(sql, /'is_platform_owner'/);
  assert.match(sql, /'companies'/);
  assert.match(sql, /'memberships'/);
  assert.match(sql, /p_normalized_email text/);
  assert.match(sql, /p_status text default null/);
  assert.match(sql, /p_company_id uuid default null/);
  assert.match(sql, /p_user_id uuid default null/);
  assert.match(sql, /p_membership_id uuid default null/);
  assert.match(sql, /where p_company_id is null or ae\.company_id = p_company_id/);
});
