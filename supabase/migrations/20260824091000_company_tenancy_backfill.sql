-- Company tenancy data backfill and company-scoped uniqueness.
-- This migration is intentionally fail-closed: unresolved or ambiguous rows
-- abort the migration before RLS is changed.

insert into private.company_tenancy_baseline (metric_key, metric_value)
values
  ('invoices.count', (select count(*)::numeric from public.invoices)),
  ('invoices.grand_total', (select coalesce(sum(grand_total), 0)::numeric from public.invoices)),
  ('expenses.count', (select count(*)::numeric from public.expenses)),
  ('expenses.amount', (select coalesce(sum(amount), 0)::numeric from public.expenses)),
  ('projects.count', (select count(*)::numeric from public.projects)),
  ('projects.project_budget', (select coalesce(sum(project_budget), 0)::numeric from public.projects)),
  ('invoice_extractions.count', (select count(*)::numeric from public.invoice_extractions)),
  ('invoice_review_events.count', (select count(*)::numeric from public.invoice_review_events)),
  ('source_documents.count', (select count(*)::numeric from public.source_documents)),
  ('payroll_runs.finalized_count', (select count(*)::numeric from public.payroll_runs where status in ('APPROVED', 'PAID'))),
  ('payroll_entries.finalized_count', (select count(*)::numeric from public.payroll_entries pe join public.payroll_runs pr on pr.id = pe.payroll_run_id where pr.status in ('APPROVED', 'PAID'))),
  ('payroll_entries.finalized_gross_pay', (select coalesce(sum(pe.gross_pay), 0)::numeric from public.payroll_entries pe join public.payroll_runs pr on pr.id = pe.payroll_run_id where pr.status in ('APPROVED', 'PAID'))),
  ('payroll_entries.finalized_net_pay', (select coalesce(sum(pe.net_pay), 0)::numeric from public.payroll_entries pe join public.payroll_runs pr on pr.id = pe.payroll_run_id where pr.status in ('APPROVED', 'PAID'))),
  ('payroll_project_allocations.finalized_amount', (select coalesce(sum(ppa.allocation_amount), 0)::numeric from public.payroll_project_allocations ppa join public.payroll_entries pe on pe.id = ppa.payroll_entry_id join public.payroll_runs pr on pr.id = pe.payroll_run_id where pr.status in ('APPROVED', 'PAID'))),
  ('payroll_import_rows.count', (select count(*)::numeric from public.payroll_import_rows))
on conflict (metric_key) do nothing;

alter table public.gmail_connections add column if not exists company_id uuid;
alter table public.gmail_sync_state add column if not exists company_id uuid;
alter table public.email_messages add column if not exists company_id uuid;
alter table public.source_documents add column if not exists company_id uuid;
alter table public.vendors add column if not exists company_id uuid;
alter table public.invoices add column if not exists company_id uuid;
alter table public.invoice_line_items add column if not exists company_id uuid;
alter table public.invoice_extractions add column if not exists company_id uuid;
alter table public.invoice_review_events add column if not exists company_id uuid;
alter table public.projects add column if not exists company_id uuid;
alter table public.invoice_project_allocations add column if not exists company_id uuid;
alter table public.expenses add column if not exists company_id uuid;
alter table public.workers add column if not exists company_id uuid;
alter table public.project_worker_assignments add column if not exists company_id uuid;
alter table public.departments add column if not exists company_id uuid;
alter table public.worker_compensation_profiles add column if not exists company_id uuid;
alter table public.recurring_payroll_components add column if not exists company_id uuid;
alter table public.payroll_schedules add column if not exists company_id uuid;
alter table public.payroll_schedule_versions add column if not exists company_id uuid;
alter table public.payroll_periods add column if not exists company_id uuid;
alter table public.work_entries add column if not exists company_id uuid;
alter table public.payroll_runs add column if not exists company_id uuid;
alter table public.payroll_entries add column if not exists company_id uuid;
alter table public.payroll_project_allocations add column if not exists company_id uuid;
alter table public.payroll_adjustments add column if not exists company_id uuid;
alter table public.project_accounting_events add column if not exists company_id uuid;
alter table public.labor_cost_centers add column if not exists company_id uuid;
alter table public.payroll_import_batches add column if not exists company_id uuid;
alter table public.payroll_import_rows add column if not exists company_id uuid;
alter table public.payroll_import_templates add column if not exists company_id uuid;

create temporary table company_legacy_owner (
  user_id uuid primary key,
  company_id uuid
) on commit drop;

create temporary table company_legacy_observed (
  user_id uuid not null,
  company_id uuid not null,
  primary key (user_id, company_id)
) on commit drop;

do $$
declare
  r record;
begin
  for r in
    select table_name
    from private.company_tenant_policy_catalog
    where table_name <> 'payroll_schedule_versions'
  loop
    execute format(
      'insert into pg_temp.company_legacy_owner (user_id)
       select distinct user_id from public.%I where user_id is not null
       on conflict (user_id) do nothing',
      r.table_name
    );
    execute format(
      'insert into pg_temp.company_legacy_observed (user_id, company_id)
       select distinct user_id, company_id
       from public.%I
       where user_id is not null and company_id is not null
       on conflict (user_id, company_id) do nothing',
      r.table_name
    );
  end loop;

  insert into pg_temp.company_legacy_observed (user_id, company_id)
  select cm.user_id, cm.company_id
  from public.company_members cm
  on conflict (user_id, company_id) do nothing;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_temp.company_legacy_observed
    group by user_id
    having count(*) > 1
  ) then
    raise exception 'Company backfill is ambiguous: one legacy user is already associated with multiple companies';
  end if;
end $$;

insert into pg_temp.company_legacy_owner (user_id, company_id)
select observed.user_id, observed.company_id
from pg_temp.company_legacy_observed observed
on conflict (user_id) do update set company_id = excluded.company_id;

do $$
begin
  if exists (
    select 1
    from pg_temp.company_legacy_owner owners
    where owners.company_id is not null
      and not exists (select 1 from public.companies c where c.id = owners.company_id)
  ) then
    raise exception 'Company backfill found a tenant reference to a missing company';
  end if;
end $$;

update pg_temp.company_legacy_owner owners
set company_id = c.id
from public.companies c
where owners.company_id is null
  and c.legacy_owner_user_id = owners.user_id;

do $$
declare
  owner_row record;
  generated_code text;
  generated_id uuid;
begin
  for owner_row in
    select user_id
    from pg_temp.company_legacy_owner
    where company_id is null
  loop
    generated_id := gen_random_uuid();
    generated_code := 'legacy-' || replace(owner_row.user_id::text, '-', '');
    if exists (select 1 from public.companies c where lower(c.company_code) = generated_code) then
      raise exception 'Company code collision while creating legacy company %', generated_code;
    end if;

    insert into public.companies (
      id, name, company_code, status, default_currency, timezone,
      created_by_user_id, legacy_owner_user_id
    ) values (
      generated_id,
      'Legacy workspace ' || left(owner_row.user_id::text, 8),
      generated_code,
      'ACTIVE',
      'PHP',
      'Asia/Manila',
      owner_row.user_id,
      owner_row.user_id
    );

    insert into public.company_audit_events (
      company_id, actor_user_id, event_type, target_type, target_id, metadata
    ) values (
      generated_id,
      owner_row.user_id,
      'COMPANY_CREATED',
      'company',
      generated_id,
      jsonb_build_object('source', 'legacy_backfill', 'legacy_owner_user_id', owner_row.user_id)
    );

    update pg_temp.company_legacy_owner
    set company_id = generated_id
    where user_id = owner_row.user_id;
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_temp.company_legacy_owner where company_id is null) then
    raise exception 'Company backfill could not resolve every persisted workspace owner';
  end if;
end $$;

insert into public.company_members (
  company_id, user_id, role_key, status, invited_by_user_id, joined_at
)
select company_id, user_id, 'COMPANY_ADMIN', 'ACTIVE', user_id, now()
from pg_temp.company_legacy_owner
on conflict (company_id, user_id) do nothing;

do $$
declare
  r record;
begin
  for r in
    select table_name
    from private.company_tenant_policy_catalog
    where table_name <> 'payroll_schedule_versions'
  loop
    execute format(
      'update public.%I tenant_rows
       set company_id = owners.company_id
       from pg_temp.company_legacy_owner owners
       where tenant_rows.company_id is null
         and tenant_rows.user_id = owners.user_id',
      r.table_name
    );
  end loop;

  update public.payroll_schedule_versions versions
  set company_id = schedules.company_id
  from public.payroll_schedules schedules
  where versions.company_id is null
    and versions.schedule_id = schedules.id;
end $$;

do $$
declare
  r record;
  unresolved_count bigint;
begin
  for r in select table_name from private.company_tenant_policy_catalog loop
    execute format('select count(*) from public.%I where company_id is null', r.table_name)
      into unresolved_count;
    if unresolved_count > 0 then
      raise exception 'Company backfill left % row(s) without company_id in %', unresolved_count, r.table_name;
    end if;
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in select table_name from private.company_tenant_policy_catalog loop
    execute format('alter table public.%I alter column company_id set not null', r.table_name);
  end loop;
end $$;

do $$
begin
  if exists (
    select 1
    from public.gmail_sync_state
    group by company_id
    having count(*) > 1
  ) then
    raise exception 'Gmail sync state backfill found multiple rows for one company';
  end if;
end $$;

alter table public.gmail_sync_state drop constraint if exists gmail_sync_state_pkey;
alter table public.gmail_sync_state add constraint gmail_sync_state_pkey primary key (company_id);

do $$
declare
  r record;
  constraint_name text;
begin
  for r in select table_name from private.company_tenant_policy_catalog loop
    constraint_name := r.table_name || '_company_id_fkey';
    if not exists (
      select 1
      from pg_constraint c
      where c.conrelid = format('public.%I', r.table_name)::regclass
        and c.conname = constraint_name
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (company_id) references public.companies(id) on delete restrict',
        r.table_name,
        constraint_name
      );
    end if;
  end loop;
end $$;

-- Replace user-scoped uniqueness with company-scoped uniqueness. UUID primary
-- keys remain globally unique; these indexes prevent collisions within a
-- tenant and let one user work for multiple companies safely.
alter table public.gmail_connections drop constraint if exists gmail_connections_user_id_provider_email_key;
alter table public.email_messages drop constraint if exists email_messages_user_id_gmail_message_id_key;
alter table public.vendors drop constraint if exists vendors_user_id_normalized_name_key;
alter table public.invoice_project_allocations drop constraint if exists invoice_project_allocations_invoice_id_project_id_key;
alter table public.payroll_runs drop constraint if exists payroll_runs_user_id_period_id_key;
alter table public.payroll_project_allocations drop constraint if exists payroll_project_allocations_payroll_entry_id_project_id_key;

drop index if exists public.projects_user_code_unique;
drop index if exists public.workers_user_code_unique;
drop index if exists public.workers_auth_user_unique;
drop index if exists public.labor_cost_centers_user_code_unique;
drop index if exists public.payroll_schedules_one_active_per_user;
drop index if exists public.source_documents_gmail_attachment_unique;
drop index if exists public.payroll_entries_user_run_worker_unique;

create unique index if not exists gmail_connections_company_provider_email_unique
  on public.gmail_connections (company_id, provider, lower(email));
create unique index if not exists email_messages_company_gmail_message_unique
  on public.email_messages (company_id, gmail_message_id);
create unique index if not exists vendors_company_normalized_name_unique
  on public.vendors (company_id, normalized_name);
create unique index if not exists source_documents_company_gmail_attachment_unique
  on public.source_documents (company_id, email_message_id, gmail_attachment_id)
  where gmail_attachment_id is not null;
create unique index if not exists projects_company_code_unique
  on public.projects (company_id, lower(project_code));
create unique index if not exists workers_company_employee_code_unique
  on public.workers (company_id, lower(employee_code));
create unique index if not exists workers_company_auth_user_unique
  on public.workers (company_id, auth_user_id)
  where auth_user_id is not null;
create unique index if not exists departments_company_name_unique
  on public.departments (company_id, lower(name));
create unique index if not exists labor_cost_centers_company_code_unique
  on public.labor_cost_centers (company_id, lower(code));
create unique index if not exists payroll_schedules_one_active_per_company
  on public.payroll_schedules (company_id)
  where active = true;
create unique index if not exists payroll_runs_company_period_unique
  on public.payroll_runs (company_id, period_id);
create unique index if not exists payroll_entries_company_run_worker_unique
  on public.payroll_entries (company_id, payroll_run_id, worker_id);
create unique index if not exists invoice_project_allocations_company_invoice_project_unique
  on public.invoice_project_allocations (company_id, invoice_id, project_id);
create unique index if not exists payroll_project_allocations_company_entry_project_unique
  on public.payroll_project_allocations (company_id, payroll_entry_id, project_id);

create index if not exists gmail_connections_company_updated_idx
  on public.gmail_connections (company_id, updated_at desc);
create index if not exists email_messages_company_received_idx
  on public.email_messages (company_id, received_at desc);
create index if not exists source_documents_company_sha_idx
  on public.source_documents (company_id, sha256);
create index if not exists invoices_company_review_idx
  on public.invoices (company_id, review_status, created_at desc);
create index if not exists projects_company_status_idx
  on public.projects (company_id, status, updated_at desc);
create index if not exists expenses_company_status_idx
  on public.expenses (company_id, status, expense_date desc);
create index if not exists workers_company_active_idx
  on public.workers (company_id, active, last_name, first_name);
create index if not exists payroll_periods_company_status_idx
  on public.payroll_periods (company_id, status, period_end desc);
create index if not exists payroll_runs_company_status_idx
  on public.payroll_runs (company_id, status, created_at desc);
create index if not exists payroll_entries_company_run_idx
  on public.payroll_entries (company_id, payroll_run_id, worker_id);
create index if not exists payroll_import_batches_company_created_idx
  on public.payroll_import_batches (company_id, created_at desc);
create index if not exists payroll_import_rows_company_batch_idx
  on public.payroll_import_rows (company_id, batch_id, source_sheet, source_row);

-- The latest payroll repair migration used one active schedule per user. The
-- company invariant is now authoritative; duplicate active rows fail rather
-- than being silently deleted.
do $$
begin
  if exists (
    select company_id
    from public.payroll_schedules
    where active
    group by company_id
    having count(*) > 1
  ) then
    raise exception 'Company migration found multiple active payroll schedules; reconcile explicitly before deployment';
  end if;
end $$;
