import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20260826120000_cash_banking_foundation.sql", import.meta.url), "utf8");
const rpcSql = readFileSync(new URL("../supabase/migrations/20260826121000_company_update_rpc_contract.sql", import.meta.url), "utf8");
const realtimeSql = readFileSync(new URL("../supabase/migrations/20260826122000_cash_banking_realtime.sql", import.meta.url), "utf8");

test("cash migration defines additive tables, money invariants, and company RLS", () => {
  for (const table of ["financial_accounts", "financial_balance_snapshots", "financial_transactions", "financial_import_batches", "financial_transaction_matches"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /amount numeric\(20,2\) not null check \(amount > 0\)/);
  assert.match(sql, /direction text not null check \(direction in \('CREDIT', 'DEBIT'\)\)/);
  assert.match(sql, /unique \(account_id, source_fingerprint\)/);
  assert.match(sql, /cash\.summary\.read/);
  assert.match(sql, /cash\.transactions\.read/);
  assert.match(sql, /cash\.accounts\.manage/);
  assert.match(sql, /cash\.import/);
  assert.match(sql, /cash\.reconcile/);
  assert.match(sql, /has_company_permission\(company_id, 'cash\.summary\.read'\)/);
  assert.match(sql, /\('FINANCE', 'cash\.summary\.read'\)/);
  assert.doesNotMatch(sql, /\('PAYROLL', 'cash\./);
  assert.doesNotMatch(sql, /\('VIEWER', 'cash\./);
  assert.match(sql, /Confirmed matches cannot exceed the transaction amount/);
  assert.match(sql, /create or replace function public\.commit_financial_import/);
  assert.match(sql, /create or replace function public\.confirm_financial_transfer/);
  assert.match(sql, /security definer\s+set search_path = ''/i);
});

test("company update migration removes overloaded RPC ambiguity and preserves the company ID path", () => {
  assert.match(rpcSql, /drop function if exists public\.platform_update_company\(uuid, text, text, text, text\)/);
  assert.match(rpcSql, /drop function if exists public\.platform_update_company\(uuid, text, text, text, text, text\)/);
  assert.match(rpcSql, /p_company_code text default null,\s+p_status text default null/);
  assert.match(rpcSql, /public\.update_company\(p_company_id, p_name, p_company_code, p_default_currency, p_timezone\)/);
  assert.match(rpcSql, /grant execute on function public\.platform_update_company\(uuid, text, text, text, text, text\) to authenticated/);
});

test("cash tables are added to the existing realtime publication without replacing it", () => {
  for (const table of ["financial_accounts", "financial_balance_snapshots", "financial_transactions", "financial_import_batches", "financial_transaction_matches"]) assert.match(realtimeSql, new RegExp(`'${table}'`));
  assert.match(realtimeSql, /alter publication supabase_realtime add table/);
  assert.doesNotMatch(realtimeSql, /create publication\s+supabase_realtime/i);
  assert.doesNotMatch(realtimeSql, /create policy\s+/i);
});
