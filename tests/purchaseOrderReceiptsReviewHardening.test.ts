import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260902151000_purchase_order_receipts_integrity_hardening.sql",
);

function migrationSql() {
  assert.equal(fs.existsSync(migrationPath), true, "receipt hardening migration must exist");
  return fs.readFileSync(migrationPath, "utf8");
}

test("receipt review hardening restores the canonical project lifecycle dependency sources", () => {
  const sql = migrationSql();

  assert.match(sql, /create or replace function private\.project_lifecycle_preflight/i);
  assert.match(sql, /language plpgsql\s+stable\s+security definer/i);
  assert.match(sql, /from public\.overtime_requests\s+o/i);
  assert.doesNotMatch(sql, /payroll_overtime_requests/i);
  assert.match(sql, /e\.cost_context\s*->>\s*'projectId'/i);
  assert.match(sql, /e\.calculation_snapshot\s*#>>\s*'\{costContext,projectId\}'/i);
  assert.match(sql, /from public\.purchase_orders\s+po/i);
  assert.match(sql, /'purchaseOrders',\s*v_purchase_orders/i);
});

test("receipt review hardening makes receipt writes guarded-RPC only", () => {
  const sql = migrationSql();

  assert.match(sql, /allow_insert\s*=\s*false/i);
  assert.match(sql, /allow_update\s*=\s*false/i);
  assert.match(sql, /allow_delete\s*=\s*false/i);
  assert.match(sql, /revoke insert, update, delete on table public\.purchase_order_receipts from public, anon, authenticated/i);
  assert.match(sql, /revoke insert, update, delete on table public\.purchase_order_receipt_lines from public, anon, authenticated/i);
  assert.match(sql, /alter function public\.record_purchase_order_receipt\(jsonb, jsonb\) security definer/i);
  assert.match(sql, /alter function public\.void_purchase_order_receipt\(uuid, text\) security definer/i);
});

test("receipt review hardening prevents stale-PO line insertion and silent history rewrites", () => {
  const sql = migrationSql();

  assert.match(sql, /Receipt lines can only be recorded while the purchase order is ISSUED/i);
  assert.match(sql, /for update of por, po/i);
  assert.match(sql, /Recorded purchase order receipts are immutable; use the guarded void operation for corrections/i);
  assert.match(sql, /Recorded purchase order receipt lines are immutable; void the parent receipt and record a replacement/i);
  assert.match(sql, /before update on public\.purchase_order_receipts/i);
  assert.match(sql, /before update on public\.purchase_order_receipt_lines/i);
  assert.match(sql, /before insert on public\.purchase_order_receipt_lines/i);
});
