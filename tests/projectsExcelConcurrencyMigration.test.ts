import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migrationPath = new URL("../supabase/migrations/20260919120000_excel_project_concurrency_and_apply.sql", import.meta.url);

function migrationSql() {
  return readFileSync(migrationPath, "utf8");
}

test("version-aware migration defines guarded RFQ, PO, and project mutation contracts", () => {
  const sql = migrationSql();
  assert.match(sql, /create or replace function public\.save_rfq\s*\(/i);
  assert.match(sql, /p_expected_updated_at\s+timestamptz/i);
  assert.match(sql, /create or replace function public\.save_purchase_order\s*\(/i);
  assert.match(sql, /create or replace function public\.save_project\s*\(/i);
  assert.match(sql, /using errcode = '40001'/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /is (?:not )?distinct from/i);
});

test("grouped project cost-control RPC validates final budget and stable parent identity", () => {
  const sql = migrationSql();
  assert.match(sql, /create or replace function public\.apply_project_cost_control_group\s*\(/i);
  assert.match(sql, /jsonb_to_recordset/i);
  assert.match(sql, /project_cost_codes/i);
  assert.match(sql, /approved_budget_amount/i);
  assert.match(sql, /project(?:_id|Id).*is distinct from|parent identity cannot be changed/i);
  assert.match(sql, /active cost-code budgets|project approved budget/is);
  assert.match(sql, /currency is protected/i);
  assert.match(sql, /unclassified tax treatment/i);
  assert.match(sql, /for update/i);
});

test("version-aware mutation functions are granted only to authenticated callers", () => {
  const sql = migrationSql();
  assert.match(sql, /grant execute on function public\.save_rfq\([^;]+\) to authenticated/i);
  assert.match(sql, /grant execute on function public\.save_purchase_order\([^;]+\) to authenticated/i);
  assert.match(sql, /grant execute on function public\.save_project\([^;]+\) to authenticated/i);
  assert.match(sql, /grant execute on function public\.apply_project_cost_control_group\([^;]+\) to authenticated/i);
  assert.match(sql, /revoke (?:all|execute) on function public\.save_rfq\([^;]+\) from public, anon/i);
  assert.match(sql, /revoke (?:all|execute) on function public\.save_purchase_order\([^;]+\) from public, anon/i);
});

test("grouped Apply has no deletion or generic arbitrary-cell write contract", () => {
  const sql = migrationSql();
  assert.doesNotMatch(sql, /delete\s+from\s+public\.project_cost_codes/i);
  assert.doesNotMatch(sql, /execute\s+format\s*\(.*update.*project_cost_codes/is);
  assert.match(sql, /new\.project_id|v_project_id/i);
});
