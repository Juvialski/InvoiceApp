import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260902140000_purchase_orders_and_commitments.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

test("procurement migration uses real company roles and leaves platform admins to permission resolution", () => {
  assert.equal(migration.includes("('PLATFORM_OWNER', 'procurement."), false);
  assert.match(migration, /\('COMPANY_ADMIN', 'procurement\.approve'\)/);
  assert.match(migration, /\('FINANCE', 'procurement\.approve'\)/);
});

test("purchase orders cannot bypass guarded draft and approval lifecycle through direct table writes", () => {
  assert.match(migration, /purchase orders must be created as DRAFT/i);
  assert.match(migration, /procurement\.approve permission is required for purchase order lifecycle transitions/i);
  assert.match(migration, /Draft purchase orders can only be approved or cancelled/i);
  assert.match(migration, /Approved purchase orders can only be issued or cancelled/i);
  assert.match(migration, /Issued purchase orders can only be closed or cancelled/i);
  assert.match(migration, /requires at least one line item before approval/i);
});

test("committed purchase order lines are immutable and cannot be re-parented", () => {
  assert.match(migration, /new\.purchase_order_id is distinct from old\.purchase_order_id/);
  assert.match(migration, /Purchase order lines cannot be moved between orders or companies/i);
  assert.match(migration, /Cannot modify lines on a non-draft purchase order/i);
  assert.match(migration, /new\.amount := round\(new\.quantity \* new\.unit_price, 2\)/);
});

test("purchase order lifecycle provenance is derived at the database boundary", () => {
  assert.match(migration, /new\.approved_by_user_id := v_user_id/);
  assert.match(migration, /new\.issued_by_user_id := v_user_id/);
  assert.match(migration, /new\.cancelled_by_user_id := v_user_id/);
  assert.match(migration, /new\.closed_by_user_id := v_user_id/);
  assert.match(migration, /Purchase order lifecycle audit metadata is immutable outside a lifecycle transition/i);
});
