import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260906104212_warehouse_inventory_project_allocation.sql", import.meta.url), "utf8");
const realtimeMigration = readFileSync(new URL("../supabase/migrations/20260906114550_warehouse_inventory_realtime.sql", import.meta.url), "utf8");
const sql = migration.replace(/--[^\r\n]*/g, "");

test("Warehouse Inventory migration uses a canonical item plus append-only movement ledger", () => {
  for (const table of ["inventory_items", "inventory_movements"]) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  for (const view of ["inventory_movement_details", "inventory_item_balances"]) assert.match(migration, new RegExp(`create or replace view public\\.${view}`));
  for (const movementType of ["OPENING", "RECEIPT", "PROJECT_ISSUE", "PROJECT_RETURN", "REVERSAL"]) assert.match(migration, new RegExp(movementType));
  assert.match(migration, /inventory_movements_company_idempotency_unique/);
  assert.match(migration, /inventory_movements_company_receipt_line_unique/);
  assert.match(migration, /inventory_movements_company_reversal_unique/);
  assert.match(migration, /inventory_items_delete_guard/);
  assert.match(migration, /for update/);
  assert.match(migration, /Insufficient warehouse stock/);
  assert.match(migration, /Project return exceeds valid issued quantity/);
  assert.match(migration, /security_invoker/);
});

test("Warehouse Inventory migration keeps project, procurement, field, and financial sources separate", () => {
  assert.match(migration, /engineering_project_materials[\s\S]*inventory_item_id/);
  assert.match(migration, /purchase_order_receipt_lines\(company_id, purchase_order_receipt_id, purchase_order_line_id\)/i);
  assert.match(migration, /requires_reconciliation/);
  assert.match(migration, /project_lifecycle_preflight[\s\S]*inventoryMovements/);
  assert.match(migration, /INVENTORY_ITEM_CREATED/);
  assert.match(migration, /INVENTORY_MOVEMENT_REVERSED/);
  assert.doesNotMatch(sql, /create table(?: if not exists)? public\.(expenses|financial_transactions)/i);
});

test("Warehouse Inventory mutation surface is guarded by permission RPCs and no direct grants", () => {
  assert.match(migration, /inventory\.read/);
  assert.match(migration, /inventory\.manage/);
  assert.match(migration, /revoke all on table public\.inventory_items, public\.inventory_movements/);
  assert.match(migration, /revoke all on function public\.save_inventory_item\(jsonb\) from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.record_inventory_movement\(jsonb\) from public, anon, authenticated/);
  assert.match(migration, /new\.created_by_user_id := v_actor/);
  assert.match(migration, /private\.deployment_company_id\(\)/);
  assert.match(realtimeMigration, /alter publication supabase_realtime add table/);
  assert.doesNotMatch(realtimeMigration, /create publication|alter table|create policy/i);
});
