-- Wave S4: Database Growth Optimization + Encrypted Database Backups
-- Forward migration creating database backup manifests, restore drill tracking, and performance indexes.

-- 1. Performance Indexes for High-Value Query Paths
-- work_entries: project labor cost and worker history access paths
create index if not exists work_entries_company_project_date_idx
  on public.work_entries(company_id, project_id, work_date desc);

create index if not exists work_entries_company_worker_date_idx
  on public.work_entries(company_id, worker_id, work_date desc);

-- 2. Database Backup Runs (Durable Manifest for Encrypted Database Exports)
create table if not exists public.database_backup_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  backup_type text not null default 'LOGICAL_FULL'
    check (backup_type in ('LOGICAL_FULL', 'SCHEMA_ONLY', 'DATA_ONLY')),
  database_scope text not null default 'ALL_PUBLIC_TABLES',
  storage_provider text not null check (storage_provider in ('s3', 'memory')),
  storage_bucket text not null,
  storage_key text not null,
  encryption_algorithm text not null default 'AES-256-GCM'
    check (encryption_algorithm in ('AES-256-GCM')),
  encryption_key_id text not null,
  encrypted_size_bytes bigint not null check (encrypted_size_bytes >= 0),
  encrypted_sha256 text not null check (encrypted_sha256 ~ '^[0-9a-f]{64}$'),
  plaintext_sha256 text check (plaintext_sha256 is null or plaintext_sha256 ~ '^[0-9a-f]{64}$'),
  pg_dump_version text,
  app_version text,
  schema_version text,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'EXPORTING', 'ENCRYPTING', 'UPLOADING', 'VERIFYING', 'VERIFIED', 'FAILED')),
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in ('UNVERIFIED', 'MATCHED', 'CORRUPTED', 'MISSING')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists database_backup_runs_company_status_idx
  on public.database_backup_runs(company_id, status);

create index if not exists database_backup_runs_company_created_idx
  on public.database_backup_runs(company_id, created_at desc);

create index if not exists database_backup_runs_company_sha_idx
  on public.database_backup_runs(company_id, encrypted_sha256);

-- Enforce company boundary and update timestamp on database_backup_runs
drop trigger if exists database_backup_runs_company_boundary on public.database_backup_runs;
create trigger database_backup_runs_company_boundary
  before insert or update on public.database_backup_runs
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists database_backup_runs_updated_at on public.database_backup_runs;
create trigger database_backup_runs_updated_at
  before update on public.database_backup_runs
  for each row execute function private.set_company_updated_at();

alter table public.database_backup_runs enable row level security;

create policy database_backup_runs_company_select on public.database_backup_runs
  for select to authenticated
  using (
    (select public.has_company_permission(company_id, 'storage.read'))
  );

create policy database_backup_runs_company_insert on public.database_backup_runs
  for insert to authenticated
  with check (
    (select public.has_company_permission(company_id, 'storage.manage'))
  );

create policy database_backup_runs_company_update on public.database_backup_runs
  for update to authenticated
  using (
    (select public.has_company_permission(company_id, 'storage.manage'))
  )
  with check (
    (select public.has_company_permission(company_id, 'storage.manage'))
  );

revoke all on table public.database_backup_runs from public, anon, authenticated;
grant select, insert, update on table public.database_backup_runs to authenticated;
revoke delete on table public.database_backup_runs from authenticated;

-- 3. Database Restore Drills (Tracking Non-Production Verification Exercises)
create table if not exists public.database_restore_drills (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  backup_run_id uuid not null references public.database_backup_runs(id) on delete cascade,
  target_environment text not null,
  drill_status text not null default 'STARTED'
    check (drill_status in ('STARTED', 'SUCCESS', 'FAILED')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  verified_schema_version text,
  verification_summary jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists database_restore_drills_company_backup_idx
  on public.database_restore_drills(company_id, backup_run_id);

create index if not exists database_restore_drills_company_created_idx
  on public.database_restore_drills(company_id, created_at desc);

-- Enforce company boundary and update timestamp on database_restore_drills
drop trigger if exists database_restore_drills_company_boundary on public.database_restore_drills;
create trigger database_restore_drills_company_boundary
  before insert or update on public.database_restore_drills
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists database_restore_drills_updated_at on public.database_restore_drills;
create trigger database_restore_drills_updated_at
  before update on public.database_restore_drills
  for each row execute function private.set_company_updated_at();

alter table public.database_restore_drills enable row level security;

create policy database_restore_drills_company_select on public.database_restore_drills
  for select to authenticated
  using (
    (select public.has_company_permission(company_id, 'storage.read'))
  );

create policy database_restore_drills_company_insert on public.database_restore_drills
  for insert to authenticated
  with check (
    (select public.has_company_permission(company_id, 'storage.manage'))
  );

create policy database_restore_drills_company_update on public.database_restore_drills
  for update to authenticated
  using (
    (select public.has_company_permission(company_id, 'storage.manage'))
  )
  with check (
    (select public.has_company_permission(company_id, 'storage.manage'))
  );

revoke all on table public.database_restore_drills from public, anon, authenticated;
grant select, insert, update on table public.database_restore_drills to authenticated;
revoke delete on table public.database_restore_drills from authenticated;
