import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(process.cwd(), "supabase/migrations/20260902150000_purchase_order_receipts.sql");

test("purchaseOrderReceiptsMigrationSafety: ensures the P2A-2 migration file exists and is non-empty", () => {
  assert.equal(fs.existsSync(migrationPath), true);
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.ok(sql.length > 100);
});

test("purchaseOrderReceiptsMigrationSafety: verifies tables, columns, and foreign keys in the migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  // Table definitions
  assert.match(sql, /create table if not exists public\.purchase_order_receipts/i);
  assert.match(sql, /create table if not exists public\.purchase_order_receipt_lines/i);

  // Columns on purchase_order_receipts
  assert.match(sql, /receipt_number text not null/i);
  assert.match(sql, /status text not null default 'RECEIVED'/i);
  assert.match(sql, /receipt_date date not null/i);
  assert.match(sql, /supplier_delivery_reference text/i);
  assert.match(sql, /void_reason text/i);
  assert.match(sql, /voided_by_user_id uuid/i);
  assert.match(sql, /voided_at timestamptz/i);

  // Status check constraint
  assert.match(sql, /status in \('RECEIVED', 'VOIDED'\)/i);

  // Columns on purchase_order_receipt_lines
  assert.match(sql, /purchase_order_receipt_id uuid not null references public\.purchase_order_receipts/i);
  assert.match(sql, /received_quantity numeric\(14,\s*4\) not null/i);
  assert.match(sql, /check \(received_quantity > 0\)/i);
});

test("purchaseOrderReceiptsMigrationSafety: verifies RLS catalog registration and strict tenant isolation", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  // Catalog inserts
  assert.ok(sql.includes("'purchase_order_receipts'"));
  assert.ok(sql.includes("'purchase_order_receipt_lines'"));
  assert.ok(sql.includes("'procurement.read'"));
  assert.ok(sql.includes("'procurement.manage'"));

  // RLS enabled on both tables
  assert.match(sql, /alter table public\.purchase_order_receipts enable row level security/i);
  assert.match(sql, /alter table public\.purchase_order_receipt_lines enable row level security/i);
});

test("purchaseOrderReceiptsMigrationSafety: verifies over-receipt trigger guards and concurrency-safe row locking", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  // Row-level lock on purchase_order_lines
  assert.match(sql, /from\s+public\.purchase_order_lines\s+pol\s+where\s+pol\.id\s*=\s*new\.purchase_order_line_id\s+for update/i);

  // Rejection of direct delete on receipts and lines
  assert.match(sql, /Historical purchase order receipts are immutable and cannot be deleted\. Void the receipt instead\./i);
  assert.match(sql, /Historical purchase order receipt lines are immutable and cannot be deleted\./i);

  // Enforce PO must be ISSUED on insert
  assert.match(sql, /Receipts can only be recorded against ISSUED purchase orders/i);

  // Enforce cumulative received <= ordered
  assert.match(sql, /errcode = '23514'/i);
  assert.match(sql, /Over-receipt is not permitted/i);
});

test("purchaseOrderReceiptsMigrationSafety: verifies atomic RPC functions for recording and voiding receipts", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /create or replace function public\.record_purchase_order_receipt/i);
  assert.match(sql, /create or replace function public\.void_purchase_order_receipt/i);
  assert.match(sql, /grant execute on function public\.record_purchase_order_receipt\(jsonb, jsonb\) to authenticated/i);
  assert.match(sql, /grant execute on function public\.void_purchase_order_receipt\(uuid, text\) to authenticated/i);
});

test("purchaseOrderReceiptsMigrationSafety: verifies forward update to private.project_lifecycle_preflight for purchase orders", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /create or replace function private\.project_lifecycle_preflight/i);
  assert.match(sql, /select count\(\*\) into v_purchase_orders\s+from public\.purchase_orders/i);
  assert.match(sql, /'purchaseOrders',\s*v_purchase_orders/i);
  assert.match(sql, /v_total\s*:=[\s\S]*?\+\s*v_purchase_orders/i);
});