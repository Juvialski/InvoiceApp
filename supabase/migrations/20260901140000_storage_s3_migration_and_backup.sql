-- Wave S3: Shared Document Migration + Deduplication + Independent Object Backup
-- Adds durable replication manifests, incremental migration records, and expands
-- storage provider metadata across Engineering Revisions and Payroll Import Batches.

-- 1. Storage Permissions Catalog (Restricted strictly to COMPANY_ADMIN)
insert into public.company_permission_catalog (permission_key, description)
values
  ('storage.read', 'View document storage provider status, migration records, and backup replication state'),
  ('storage.manage', 'Execute document storage migrations, trigger backup replication, and perform restore verification')
on conflict (permission_key) do update set description = excluded.description;

insert into public.company_role_permissions (role_key, permission_key)
select 'COMPANY_ADMIN', permission_key
from public.company_permission_catalog
where permission_key in ('storage.read', 'storage.manage')
on conflict (role_key, permission_key) do nothing;

-- 2. Expand storage provider attributes on Engineering Document Revisions
alter table public.engineering_document_revisions
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists storage_bucket text not null default 'engineering-documents';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'engineering_document_revisions_storage_provider_check'
  ) then
    alter table public.engineering_document_revisions
      add constraint engineering_document_revisions_storage_provider_check
      check (storage_provider in ('supabase', 's3'));
  end if;
end $$;

create index if not exists engineering_doc_revisions_company_provider_idx
  on public.engineering_document_revisions(company_id, storage_provider);

-- 3. Expand storage provider attributes on Payroll Import Batches
alter table public.payroll_import_batches
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists storage_bucket text not null default 'payroll-import-sources';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payroll_import_batches_storage_provider_check'
  ) then
    alter table public.payroll_import_batches
      add constraint payroll_import_batches_storage_provider_check
      check (storage_provider in ('supabase', 's3'));
  end if;
end $$;

create index if not exists payroll_import_batches_company_provider_idx
  on public.payroll_import_batches(company_id, storage_provider);

-- 4. Document Backup Replicas (Durable Replication Manifest)
create table if not exists public.document_backup_replicas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_domain text not null default 'INVOICES'
    check (document_domain in ('INVOICES', 'EMAIL_INTAKE', 'CASH_BANKING', 'PAYROLL', 'ENGINEERING', 'SOURCE_DOCUMENTS')),
  document_id text not null,
  source_provider text not null check (source_provider in ('supabase', 's3')),
  source_bucket text not null,
  source_key text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_size_bytes bigint not null check (source_size_bytes >= 0),
  replica_provider text not null check (replica_provider in ('s3')),
  replica_bucket text not null,
  replica_key text not null,
  replication_state text not null default 'PENDING'
    check (replication_state in ('PENDING', 'COPYING', 'VERIFYING', 'VERIFIED', 'FAILED', 'RETRY_PENDING')),
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in ('UNVERIFIED', 'MATCHED', 'CORRUPTED', 'MISSING')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  last_error text,
  last_attempted_at timestamptz,
  first_replicated_at timestamptz,
  last_verified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_backup_replicas_company_domain_idx
  on public.document_backup_replicas(company_id, document_domain);

create index if not exists document_backup_replicas_company_state_idx
  on public.document_backup_replicas(company_id, replication_state);

create index if not exists document_backup_replicas_company_doc_idx
  on public.document_backup_replicas(company_id, document_id);

create index if not exists document_backup_replicas_company_sha_idx
  on public.document_backup_replicas(company_id, source_sha256);

create unique index if not exists document_backup_replicas_unique_active_idx
  on public.document_backup_replicas(company_id, source_provider, source_bucket, source_key, source_sha256, replica_provider, replica_bucket, replica_key)
  where replication_state not in ('FAILED');

-- Boundary and update triggers for document_backup_replicas
drop trigger if exists document_backup_replicas_company_boundary on public.document_backup_replicas;
create trigger document_backup_replicas_company_boundary
  before insert or update on public.document_backup_replicas
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists document_backup_replicas_updated_at on public.document_backup_replicas;
create trigger document_backup_replicas_updated_at
  before update on public.document_backup_replicas
  for each row execute function private.set_company_updated_at();

alter table public.document_backup_replicas enable row level security;

create policy document_backup_replicas_company_select on public.document_backup_replicas
  for select to authenticated
  using (
    (select public.has_company_permission(company_id, 'storage.read'))
  );

create policy document_backup_replicas_company_insert on public.document_backup_replicas
  for insert to authenticated
  with check (
    (select public.has_company_permission(company_id, 'storage.manage'))
  );

create policy document_backup_replicas_company_update on public.document_backup_replicas
  for update to authenticated
  using (
    (select public.has_company_permission(company_id, 'storage.manage'))
  )
  with check (
    (select public.has_company_permission(company_id, 'storage.manage'))
  );

revoke all on table public.document_backup_replicas from public, anon, authenticated;
grant select, insert, update on table public.document_backup_replicas to authenticated;
revoke delete on table public.document_backup_replicas from authenticated;

-- 5. Document Migration Records (Resumable Migration State)
create table if not exists public.document_migration_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_domain text not null default 'INVOICES'
    check (document_domain in ('INVOICES', 'EMAIL_INTAKE', 'CASH_BANKING', 'PAYROLL', 'ENGINEERING', 'SOURCE_DOCUMENTS')),
  document_id text not null,
  source_provider text not null check (source_provider in ('supabase', 's3')),
  source_bucket text not null,
  source_key text not null,
  target_provider text not null check (target_provider in ('s3')),
  target_bucket text not null,
  target_key text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes >= 0),
  migration_state text not null default 'DISCOVERED'
    check (migration_state in (
      'DISCOVERED', 'COPYING', 'VERIFYING', 'DUAL_READ',
      'PRIMARY_SWITCH', 'GRACE_PERIOD', 'AUDIT_PROOF',
      'CLEANUP', 'FAILED', 'RETRY_PENDING'
    )),
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in ('UNVERIFIED', 'MATCHED', 'CORRUPTED', 'MISSING')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  last_error text,
  last_attempted_at timestamptz,
  switched_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_migration_records_company_domain_idx
  on public.document_migration_records(company_id, document_domain);

create index if not exists document_migration_records_company_state_idx
  on public.document_migration_records(company_id, migration_state);

create index if not exists document_migration_records_company_doc_idx
  on public.document_migration_records(company_id, document_id);

create index if not exists document_migration_records_company_sha_idx
  on public.document_migration_records(company_id, sha256);

create unique index if not exists document_migration_records_unique_active_idx
  on public.document_migration_records(company_id, document_domain, document_id, source_provider, target_provider, target_bucket)
  where migration_state not in ('FAILED');

-- Boundary and update triggers for document_migration_records
drop trigger if exists document_migration_records_company_boundary on public.document_migration_records;
create trigger document_migration_records_company_boundary
  before insert or update on public.document_migration_records
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists document_migration_records_updated_at on public.document_migration_records;
create trigger document_migration_records_updated_at
  before update on public.document_migration_records
  for each row execute function private.set_company_updated_at();

alter table public.document_migration_records enable row level security;

create policy document_migration_records_company_select on public.document_migration_records
  for select to authenticated
  using (
    (select public.has_company_permission(company_id, 'storage.read'))
  );

create policy document_migration_records_company_insert on public.document_migration_records
  for insert to authenticated
  with check (
    (select public.has_company_permission(company_id, 'storage.manage'))
  );

create policy document_migration_records_company_update on public.document_migration_records
  for update to authenticated
  using (
    (select public.has_company_permission(company_id, 'storage.manage'))
  )
  with check (
    (select public.has_company_permission(company_id, 'storage.manage'))
  );

revoke all on table public.document_migration_records from public, anon, authenticated;
grant select, insert, update on table public.document_migration_records to authenticated;
revoke delete on table public.document_migration_records from authenticated;
