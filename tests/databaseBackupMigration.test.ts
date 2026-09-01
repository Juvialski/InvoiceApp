import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const MIGRATION_PATH = path.join(
  ROOT,
  "supabase",
  "migrations",
  "20260901160000_database_growth_and_encrypted_backups.sql",
);

test("Database Backup Migration: File exists and has valid timestamp ordering", async () => {
  const content = await fs.readFile(MIGRATION_PATH, "utf-8");
  assert.ok(content.length > 0, "Migration file must not be empty");

  const files = await fs.readdir(path.join(ROOT, "supabase", "migrations"));
  const sorted = files.filter((f) => f.endsWith(".sql")).sort();

  const currentIndex = sorted.indexOf("20260901160000_database_growth_and_encrypted_backups.sql");
  assert.ok(currentIndex > 0, "Migration must be in sorted migration list");

  const prevFile = sorted[currentIndex - 1];
  assert.ok(
    prevFile < "20260901160000_database_growth_and_encrypted_backups.sql",
    `Previous migration ${prevFile} must precede 20260901160000`,
  );
});

test("Database Backup Migration: Defines database_backup_runs with constraints and RLS", async () => {
  const sql = await fs.readFile(MIGRATION_PATH, "utf-8");

  assert.match(sql, /create table if not exists public\.database_backup_runs/i);
  assert.match(sql, /company_id uuid not null references public\.companies\(id\) on delete cascade/i);
  assert.match(sql, /database_scope text not null default 'PUBLIC_APPLICATION_DATA'/i);
  assert.match(sql, /storage_provider text not null check \(storage_provider = 's3'\)/i);
  assert.doesNotMatch(sql, /storage_provider[^\n]*memory/i);
  assert.match(sql, /encrypted_sha256 text not null check \(encrypted_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/i);
  assert.match(sql, /status in \('PENDING', 'EXPORTING', 'ENCRYPTING', 'UPLOADING', 'VERIFYING', 'VERIFIED', 'FAILED'\)/i);
  assert.match(sql, /verification_status in \('UNVERIFIED', 'MATCHED', 'CORRUPTED', 'MISSING'\)/i);

  assert.match(sql, /create trigger database_backup_runs_company_boundary/i);
  assert.match(sql, /create trigger database_backup_runs_updated_at/i);

  assert.match(sql, /alter table public\.database_backup_runs enable row level security/i);
  assert.match(sql, /public\.has_company_permission\(company_id, 'storage\.read'\)/i);
  assert.match(sql, /public\.has_company_permission\(company_id, 'storage\.manage'\)/i);
  assert.match(sql, /revoke delete on table public\.database_backup_runs from authenticated/i);
});

test("Database Backup Migration: Defines database_restore_drills with constraints and RLS", async () => {
  const sql = await fs.readFile(MIGRATION_PATH, "utf-8");

  assert.match(sql, /create table if not exists public\.database_restore_drills/i);
  assert.match(sql, /company_id uuid not null references public\.companies\(id\) on delete cascade/i);
  assert.match(sql, /backup_run_id uuid not null references public\.database_backup_runs\(id\) on delete cascade/i);
  assert.match(sql, /drill_status in \('STARTED', 'SUCCESS', 'FAILED'\)/i);

  assert.match(sql, /create trigger database_restore_drills_company_boundary/i);
  assert.match(sql, /create trigger database_restore_drills_updated_at/i);

  assert.match(sql, /alter table public\.database_restore_drills enable row level security/i);
  assert.match(sql, /public\.has_company_permission\(company_id, 'storage\.read'\)/i);
  assert.match(sql, /public\.has_company_permission\(company_id, 'storage\.manage'\)/i);
  assert.match(sql, /revoke delete on table public\.database_restore_drills from authenticated/i);
});

test("Database Backup Migration: Creates high-value query performance indexes on work_entries", async () => {
  const sql = await fs.readFile(MIGRATION_PATH, "utf-8");

  assert.match(
    sql,
    /create index if not exists work_entries_company_project_date_idx\s+on public\.work_entries\(company_id, project_id, work_date desc\)/i,
  );
  assert.match(
    sql,
    /create index if not exists work_entries_company_worker_date_idx\s+on public\.work_entries\(company_id, worker_id, work_date desc\)/i,
  );
});
