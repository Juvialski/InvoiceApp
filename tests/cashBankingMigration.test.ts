import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

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

test("cash migration preserves complete audit-event superset across all categories", () => {
  const allowlistMatch = sql.match(/company_audit_events_event_type_check check \(event_type in \(([\s\S]*?)\)\);/);
  assert.ok(allowlistMatch, "Cash migration must define company_audit_events_event_type_check");
  const events = [...allowlistMatch[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
  const eventSet = new Set(events);

  const companyMemberEvents = [
    "COMPANY_CREATED", "COMPANY_UPDATED", "COMPANY_SUSPENDED", "COMPANY_ARCHIVED", "COMPANY_REACTIVATED",
    "USER_INVITED", "INVITE_REVOKED", "INVITE_ACCEPTED",
    "MEMBER_ROLE_CHANGED", "MEMBER_SUSPENDED", "MEMBER_REACTIVATED", "MEMBER_REVOKED"
  ];
  const payrollEvents = [
    "PAYROLL_REPAIR_APPLIED", "PAYROLL_CALENDAR_REBUILT", "PAYROLL_UNAPPROVED_RESET", "PAYROLL_WORKSPACE_RESET"
  ];
  const companyAiEvents = [
    "COMPANY_AI_CREDENTIAL_CONFIGURED", "COMPANY_AI_CREDENTIAL_ROTATED",
    "COMPANY_AI_CREDENTIAL_TESTED", "COMPANY_AI_CREDENTIAL_ENABLED",
    "COMPANY_AI_CREDENTIAL_DISABLED", "COMPANY_AI_CREDENTIAL_REMOVED"
  ];
  const cashEvents = [
    "CASH_ACCOUNT_CREATED", "CASH_ACCOUNT_UPDATED", "CASH_ACCOUNT_DEACTIVATED",
    "CASH_BALANCE_SNAPSHOT_RECORDED", "CASH_STATEMENT_IMPORTED", "CASH_STATEMENT_REJECTED",
    "CASH_TRANSACTION_CREATED", "CASH_TRANSACTION_UPDATED",
    "CASH_RECONCILIATION_CONFIRMED", "CASH_RECONCILIATION_REMOVED", "CASH_TRANSFER_MATCHED"
  ];

  for (const event of companyMemberEvents) {
    assert.ok(eventSet.has(event), `Cash migration dropped company/member audit event: ${event}`);
  }
  for (const event of payrollEvents) {
    assert.ok(eventSet.has(event), `Cash migration dropped payroll audit event: ${event}`);
  }
  for (const event of companyAiEvents) {
    assert.ok(eventSet.has(event), `Cash migration dropped company AI audit event: ${event}`);
  }
  for (const event of cashEvents) {
    assert.ok(eventSet.has(event), `Cash migration missing cash audit event: ${event}`);
  }
  assert.equal(events.length, 33, `Expected exactly 33 unique audit events, found ${events.length}`);
});

test("migration chain invariant: audit-event allowlist only grows across all migrations", () => {
  const migrationsDir = new URL("../supabase/migrations", import.meta.url);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  let previousAllowlist: string[] = [];
  let previousMigration = "";

  for (const file of files) {
    const content = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
    const match = content.match(/company_audit_events[\s\S]*?(?:check \(event_type in|add constraint company_audit_events_event_type_check check \(event_type in)\s*\(([\s\S]*?)\)\)/i);
    if (!match) continue;

    const currentAllowlist = [...match[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    const currentSet = new Set(currentAllowlist);

    if (previousAllowlist.length > 0) {
      for (const event of previousAllowlist) {
        assert.ok(
          currentSet.has(event),
          `Migration ${file} dropped previously supported audit event '${event}' from ${previousMigration}`
        );
      }
    }

    previousAllowlist = currentAllowlist;
    previousMigration = file;
  }
});

test("upgrade-path simulation: historical payroll and AI audit rows are preserved and valid under cash migration constraint", () => {
  const allowlistMatch = sql.match(/company_audit_events_event_type_check check \(event_type in \(([\s\S]*?)\)\);/);
  assert.ok(allowlistMatch);
  const allowedEvents = new Set([...allowlistMatch[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]));

  const historicalAuditRows = [
    { event_type: "COMPANY_CREATED", target_type: "company", metadata: { company_code: "acme" } },
    { event_type: "USER_INVITED", target_type: "invitation", metadata: { role_key: "FINANCE" } },
    { event_type: "MEMBER_ROLE_CHANGED", target_type: "membership", metadata: { role_key: "PAYROLL" } },
    { event_type: "INVITE_ACCEPTED", target_type: "invitation", metadata: { role_key: "VIEWER" } },
    { event_type: "PAYROLL_REPAIR_APPLIED", target_type: "payroll_maintenance", metadata: { plan: {} } },
    { event_type: "PAYROLL_CALENDAR_REBUILT", target_type: "payroll_maintenance", metadata: { plan: {} } },
    { event_type: "PAYROLL_UNAPPROVED_RESET", target_type: "payroll_maintenance", metadata: { plan: {} } },
    { event_type: "PAYROLL_WORKSPACE_RESET", target_type: "company", metadata: { reason: "Reset" } },
    { event_type: "COMPANY_AI_CREDENTIAL_CONFIGURED", target_type: "company_ai_credential", metadata: { provider: "GEMINI" } },
    { event_type: "COMPANY_AI_CREDENTIAL_ROTATED", target_type: "company_ai_credential", metadata: { provider: "GEMINI" } },
    { event_type: "COMPANY_AI_CREDENTIAL_TESTED", target_type: "company_ai_credential", metadata: { test_status: "SUCCESS" } },
    { event_type: "COMPANY_AI_CREDENTIAL_ENABLED", target_type: "company_ai_credential", metadata: { provider: "GEMINI" } },
    { event_type: "COMPANY_AI_CREDENTIAL_DISABLED", target_type: "company_ai_credential", metadata: { provider: "GEMINI" } },
    { event_type: "COMPANY_AI_CREDENTIAL_REMOVED", target_type: "company_ai_credential", metadata: { provider: "GEMINI" } },
    { event_type: "CASH_ACCOUNT_CREATED", target_type: "financial", metadata: { display_name: "Operating Bank" } },
    { event_type: "CASH_STATEMENT_IMPORTED", target_type: "financial", metadata: { imported_count: 5 } },
    { event_type: "CASH_TRANSACTION_CREATED", target_type: "financial", metadata: { amount: 1500 } },
    { event_type: "CASH_RECONCILIATION_CONFIRMED", target_type: "financial", metadata: { match_id: "..." } },
    { event_type: "CASH_TRANSFER_MATCHED", target_type: "financial", metadata: { match_id: "..." } }
  ];

  for (const row of historicalAuditRows) {
    assert.ok(
      allowedEvents.has(row.event_type),
      `Historical audit row with event_type '${row.event_type}' violates the Cash migration constraint (would cause SQLSTATE 23514)`
    );
  }

  // Verify unknown event types are rejected
  assert.ok(!allowedEvents.has("UNKNOWN_EVENT"));
  assert.ok(!allowedEvents.has("INVALID_AUDIT_ACTION"));
});

