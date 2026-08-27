import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath = new URL("../supabase/migrations/20260827150000_engineering_daily_site_logs_phase1c.sql", import.meta.url);
const migration = readFileSync(migrationPath, "utf8");
const migrationSql = migration.replace(/--[^\r\n]*/g, "");

test("Phase 1C migration creates company-scoped Site Log aggregate and observational children", () => {
  for (const table of [
    "engineering_daily_site_logs",
    "engineering_daily_site_log_weather",
    "engineering_daily_site_log_crew",
    "engineering_daily_site_log_equipment",
    "engineering_daily_site_log_safety",
    "engineering_daily_site_log_events",
  ]) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, /unique \(company_id, project_id, site_date\)/i);
  assert.match(migration, /check \(condition in \('CLEAR'.*'UNKNOWN'\)\)/s);
  assert.match(migration, /headcount integer not null/i);
  assert.match(migration, /operating_hours numeric/i);
  assert.match(migration, /is_resolved boolean/i);
  assert.doesNotMatch(migrationSql, /attendance_records|timesheet|payroll_entries/i);
});

test("Phase 1C migration exposes read RLS and authenticated guarded lifecycle RPCs only", () => {
  for (const table of [
    "engineering_daily_site_logs",
    "engineering_daily_site_log_weather",
    "engineering_daily_site_log_crew",
    "engineering_daily_site_log_equipment",
    "engineering_daily_site_log_safety",
    "engineering_daily_site_log_events",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /grant select on public\.engineering_daily_site_logs,[\s\S]*to authenticated/i);
  for (const rpc of [
    "create_engineering_daily_site_log",
    "update_engineering_daily_site_log_draft",
    "submit_engineering_daily_site_log",
    "finalize_engineering_daily_site_log",
    "void_engineering_daily_site_log",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`));
    assert.match(migration, new RegExp(`revoke execute on function public\\.${rpc}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}.*to authenticated`, "s"));
  }
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /daily_site_log_actor[\s\S]*has_company_permission/i);
  assert.match(migration, /prevent_daily_site_log_history_mutation/);
  assert.match(migration, /guard_daily_site_log_formal_mutation/);
  assert.match(migration, /prevent_daily_site_log_child_formal_mutation/);
});

test("Phase 1C migration uses additive audit events and protects finalized history", () => {
  for (const event of ["ENGINEERING_DAILY_SITE_LOG_CREATED", "ENGINEERING_DAILY_SITE_LOG_UPDATED", "ENGINEERING_DAILY_SITE_LOG_SUBMITTED", "ENGINEERING_DAILY_SITE_LOG_FINALIZED", "ENGINEERING_DAILY_SITE_LOG_VOIDED"]) assert.match(migration, new RegExp(`'${event}'`));
  assert.match(migration, /status <> 'DRAFT'/i);
  assert.match(migration, /status <> 'SUBMITTED'/i);
  assert.match(migration, /Finalized or void Site Logs cannot be voided/i);
  assert.match(migration, /Daily Site Log lifecycle history is append-only/i);
});
