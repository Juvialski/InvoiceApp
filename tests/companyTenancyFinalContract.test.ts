import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const finalSql = [
  "20260824100000_company_tenancy_security_contract.sql",
  "20260824101000_company_tenancy_sql_corrections.sql",
  "20260824102000_company_tenancy_final_grants.sql",
  "20260824103000_company_tenancy_lead_rpc_shapes.sql",
  "20260824104000_company_tenancy_platform_override.sql",
].map((name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")).join("\n");

test("final company contract preserves exact caller shapes and platform override", () => {
  assert.match(finalSql, /returns jsonb/);
  assert.match(finalSql, /p_normalized_email text/);
  assert.match(finalSql, /p_company_id uuid default null/);
  assert.match(finalSql, /p_user_id uuid default null/);
  assert.match(finalSql, /p_membership_id uuid default null/);
  assert.match(finalSql, /p_status text default null/);
  assert.match(finalSql, /p_company_id is null or ae\.company_id = p_company_id/);
  assert.match(finalSql, /private\.is_platform_admin\(\)\)\s*\n\s*or/);
  assert.match(finalSql, /revoke execute on function public\.get_my_company_access\(\) from public, anon/);
});
