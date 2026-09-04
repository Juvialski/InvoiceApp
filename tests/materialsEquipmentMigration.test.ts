import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath = new URL("../supabase/migrations/20260904121000_p3b_p3c_materials_equipment_field_operations.sql", import.meta.url);
const migration = readFileSync(migrationPath, "utf8");
const realtimeMigration = readFileSync(new URL("../supabase/migrations/20260904122000_p3b_p3c_materials_equipment_realtime.sql", import.meta.url), "utf8");
const sql = migration.replace(/--[^\r\n]*/g, "");

test("P3B/P3C migration creates minimal company/project-bound registers and structured observations", () => {
  for (const table of [
    "engineering_project_materials",
    "engineering_project_equipment",
    "engineering_daily_site_log_work",
    "engineering_daily_site_log_material_deliveries",
    "engineering_daily_site_log_issues",
  ]) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, /engineering_daily_site_log_crew[\s\S]*add column if not exists project_cost_code_id/i);
  assert.match(migration, /engineering_daily_site_log_equipment[\s\S]*add column if not exists equipment_id/i);
  assert.match(migration, /foreign key \(company_id, project_id\) references public\.projects\(company_id, id\)/i);
  assert.match(migration, /purchase_order_receipts\(company_id, id\)/i);
  assert.match(migration, /status text not null default 'OPEN'/i);
  assert.doesNotMatch(sql, /actual_cost|committed_cost|payroll_entries|attendance_records/i);
});

test("P3B/P3C migration protects source states and finalized history", () => {
  assert.match(migration, /status = 'RECEIVED'/i);
  assert.match(migration, /valid received receipt/i);
  assert.match(migration, /prevent_daily_site_log_child_formal_mutation/);
  assert.match(migration, /engineering_daily_site_log_material_deliveries_formal_guard/);
  assert.match(migration, /engineering_daily_site_log_issues_formal_guard/);
  assert.match(migration, /foreign key \(company_id, equipment_id\)[\s\S]*references public\.engineering_project_equipment\(company_id, id\)/i);
  assert.match(migration, /project_lifecycle_preflight_base/);
  assert.match(migration, /projectMaterials/);
  assert.match(migration, /projectEquipment/);
});

test("P3B/P3C migration uses RLS, guarded register RPCs, v2 Site Log RPCs, and realtime parity", () => {
  for (const table of ["engineering_project_materials", "engineering_project_equipment", "engineering_daily_site_log_work", "engineering_daily_site_log_material_deliveries", "engineering_daily_site_log_issues"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  for (const rpc of ["save_engineering_project_material", "save_engineering_project_equipment", "create_engineering_daily_site_log_v2", "update_engineering_daily_site_log_draft_v2"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}`));
  }
  assert.match(migration, /revoke all on public\.engineering_project_materials[\s\S]*from public, anon, authenticated/i);
  assert.match(realtimeMigration, /alter publication supabase_realtime add table public\.%I/i);
  assert.doesNotMatch(realtimeMigration, /create publication|alter table|create policy/i);
});
