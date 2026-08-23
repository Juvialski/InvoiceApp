-- Adaptive payroll spreadsheet import domain.
-- The source workbook is retained separately from invoice originals and all
-- staging rows remain user-owned until a human commits them to a DRAFT run.

create table if not exists public.labor_cost_centers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  cost_center_type text not null check (cost_center_type in ('ADMIN_OFFICE','GENERAL_OVERHEAD','EQUIPMENT_WORKSHOP','WAREHOUSE','OTHER')),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.payroll_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_filename text not null,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  file_size bigint check (file_size is null or file_size >= 0),
  mime_type text,
  storage_path text not null,
  sheet_names text[] not null default '{}'::text[],
  detected_template_id uuid,
  duplicate_of_batch_id uuid references public.payroll_import_batches(id) on delete set null,
  status text not null default 'UPLOADED' check (status in ('UPLOADED','MAPPED','VALIDATED','COMMITTED','FAILED','VOIDED')),
  mapping_snapshot jsonb not null default '{}'::jsonb,
  raw_metadata jsonb not null default '{}'::jsonb,
  warnings text[] not null default '{}'::text[],
  errors text[] not null default '{}'::text[],
  committed_payroll_period_id uuid references public.payroll_periods(id) on delete set null,
  committed_payroll_run_id uuid references public.payroll_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  committed_at timestamptz,
  voided_at timestamptz
);

create table if not exists public.payroll_import_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  structure_signature text not null,
  field_mappings jsonb not null default '[]'::jsonb,
  header_configuration jsonb not null default '{}'::jsonb,
  metadata_mappings jsonb not null default '{}'::jsonb,
  context_rules jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table public.payroll_import_batches
  drop constraint if exists payroll_import_batches_detected_template_id_fkey;
alter table public.payroll_import_batches
  add constraint payroll_import_batches_detected_template_id_fkey
  foreign key (detected_template_id) references public.payroll_import_templates(id) on delete set null;

create table if not exists public.payroll_import_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null references public.payroll_import_batches(id) on delete cascade,
  source_sheet text not null,
  source_row integer not null check (source_row > 0),
  original_employee_name text,
  canonical_data jsonb not null default '{}'::jsonb,
  raw_row jsonb not null default '[]'::jsonb,
  warnings text[] not null default '{}'::text[],
  errors text[] not null default '{}'::text[],
  confidence_level text not null default 'LOW' check (confidence_level in ('HIGH','MEDIUM','LOW')),
  confidence_score numeric(6,5) not null default 0 check (confidence_score >= 0 and confidence_score <= 1),
  status text not null default 'STAGED' check (status in ('STAGED','READY','SKIPPED','COMMITTED','ERROR')),
  worker_match_status text not null default 'UNMATCHED' check (worker_match_status in ('MATCHED','NEW_WORKER_SUGGESTED','AMBIGUOUS','UNMATCHED')),
  worker_id uuid references public.workers(id) on delete set null,
  project_match_status text not null default 'UNMATCHED' check (project_match_status in ('MATCHED','SUGGESTED','AMBIGUOUS','UNMATCHED','NOT_APPLICABLE')),
  labor_context_type text not null default 'UNALLOCATED_REVIEW' check (labor_context_type in ('PROJECT','ADMIN_OFFICE','GENERAL_OVERHEAD','UNALLOCATED_REVIEW')),
  project_id uuid references public.projects(id) on delete set null,
  cost_center_id uuid references public.labor_cost_centers(id) on delete set null,
  labor_context_label text,
  needs_review boolean not null default true,
  committed_work_entry_id uuid references public.work_entries(id) on delete set null,
  committed_payroll_entry_id uuid references public.payroll_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payroll_runs add column if not exists import_batch_id uuid references public.payroll_import_batches(id) on delete set null;
alter table public.payroll_entries add column if not exists cost_context jsonb not null default '{}'::jsonb;
alter table public.payroll_entries add column if not exists import_row_id uuid references public.payroll_import_rows(id) on delete set null;
alter table public.payroll_project_allocations drop constraint if exists payroll_project_allocations_source_check;
alter table public.payroll_project_allocations add constraint payroll_project_allocations_source_check check (source in ('TIME_ENTRY','MANUAL','DEFAULT_ASSIGNMENT','IMPORT'));

create index if not exists labor_cost_centers_user_type_idx on public.labor_cost_centers(user_id, cost_center_type, active);
create unique index if not exists labor_cost_centers_user_code_unique on public.labor_cost_centers(user_id, lower(code));
create index if not exists payroll_import_batches_user_created_idx on public.payroll_import_batches(user_id, created_at desc);
create index if not exists payroll_import_batches_user_hash_idx on public.payroll_import_batches(user_id, file_sha256);
create index if not exists payroll_import_rows_batch_source_idx on public.payroll_import_rows(user_id, batch_id, source_sheet, source_row);
create index if not exists payroll_import_rows_worker_idx on public.payroll_import_rows(user_id, worker_id, status);
create index if not exists payroll_import_templates_user_signature_idx on public.payroll_import_templates(user_id, structure_signature, active);
create index if not exists payroll_runs_import_batch_idx on public.payroll_runs(user_id, import_batch_id);
create index if not exists payroll_entries_import_row_idx on public.payroll_entries(user_id, import_row_id);

create or replace function public.set_payroll_import_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists labor_cost_centers_updated_at on public.labor_cost_centers;
create trigger labor_cost_centers_updated_at before update on public.labor_cost_centers
for each row execute function public.set_payroll_import_updated_at();
drop trigger if exists payroll_import_batches_updated_at on public.payroll_import_batches;
create trigger payroll_import_batches_updated_at before update on public.payroll_import_batches
for each row execute function public.set_payroll_import_updated_at();
drop trigger if exists payroll_import_rows_updated_at on public.payroll_import_rows;
create trigger payroll_import_rows_updated_at before update on public.payroll_import_rows
for each row execute function public.set_payroll_import_updated_at();
drop trigger if exists payroll_import_templates_updated_at on public.payroll_import_templates;
create trigger payroll_import_templates_updated_at before update on public.payroll_import_templates
for each row execute function public.set_payroll_import_updated_at();

alter table public.labor_cost_centers enable row level security;
alter table public.payroll_import_batches enable row level security;
alter table public.payroll_import_rows enable row level security;
alter table public.payroll_import_templates enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['labor_cost_centers','payroll_import_batches','payroll_import_rows','payroll_import_templates'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete_own', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', table_name || '_delete_own', table_name);
  end loop;
end $$;

create or replace function public.validate_payroll_import_batch_ownership() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.detected_template_id is not null and not exists (
    select 1 from public.payroll_import_templates t where t.id = new.detected_template_id and t.user_id = new.user_id
  ) then
    raise exception 'Payroll import template is outside the current workspace';
  end if;
  if new.committed_payroll_period_id is not null and not exists (
    select 1 from public.payroll_periods p where p.id = new.committed_payroll_period_id and p.user_id = new.user_id
  ) then
    raise exception 'Payroll import period is outside the current workspace';
  end if;
  if new.committed_payroll_run_id is not null and not exists (
    select 1 from public.payroll_runs r where r.id = new.committed_payroll_run_id and r.user_id = new.user_id
  ) then
    raise exception 'Payroll import run is outside the current workspace';
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_import_batches_ownership on public.payroll_import_batches;
create trigger payroll_import_batches_ownership before insert or update on public.payroll_import_batches
for each row execute function public.validate_payroll_import_batch_ownership();
-- Keep imported project/cost-center references inside the authenticated workspace.
create or replace function public.validate_payroll_import_row_ownership() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.payroll_import_batches b where b.id = new.batch_id and b.user_id = new.user_id) then
    raise exception 'Payroll import batch is outside the current workspace';
  end if;
  if new.worker_id is not null and not exists (select 1 from public.workers w where w.id = new.worker_id and w.user_id = new.user_id) then
    raise exception 'Payroll import worker is outside the current workspace';
  end if;
  if new.project_id is not null and not exists (select 1 from public.projects p where p.id = new.project_id and p.user_id = new.user_id) then
    raise exception 'Payroll import project is outside the current workspace';
  end if;
  if new.cost_center_id is not null and not exists (select 1 from public.labor_cost_centers c where c.id = new.cost_center_id and c.user_id = new.user_id) then
    raise exception 'Payroll import cost center is outside the current workspace';
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_import_rows_ownership on public.payroll_import_rows;
create trigger payroll_import_rows_ownership before insert or update on public.payroll_import_rows
for each row execute function public.validate_payroll_import_row_ownership();

-- Rebuild a calculated run atomically. The UI still validates before calling this
-- RPC, but the database transaction prevents a delete-then-partial-insert state.
create or replace function public.replace_payroll_run_entries(
  p_run_id uuid,
  p_entries jsonb,
  p_allocations jsonb
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  current_status text;
  entry_row jsonb;
  allocation_row jsonb;
begin
  select status into current_status
  from public.payroll_runs
  where id = p_run_id and user_id = current_user_id
  for update;

  if current_status is null then raise exception 'Payroll run is outside the current workspace'; end if;
  if current_status not in ('DRAFT','CALCULATED') then raise exception 'Locked payroll runs cannot be rebuilt'; end if;

  if exists (
    select 1 from (
      select value->>'workerId' as worker_id, count(*) as row_count
      from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb))
      group by value->>'workerId'
      having count(*) > 1
    ) duplicates
  ) then raise exception 'A payroll run cannot contain duplicate workers'; end if;

  delete from public.payroll_project_allocations
  where payroll_entry_id in (select id from public.payroll_entries where payroll_run_id = p_run_id and user_id = current_user_id);
  delete from public.payroll_entries where payroll_run_id = p_run_id and user_id = current_user_id;

  for entry_row in select value from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    insert into public.payroll_entries (
      id, user_id, payroll_run_id, worker_id, base_pay, regular_pay, overtime_pay, allowances,
      other_earnings, gross_pay, deductions, other_deductions, employer_costs, net_pay,
      project_allocated_cost, calculation_snapshot, cost_context, import_row_id
    ) values (
      (entry_row->>'id')::uuid, current_user_id, p_run_id, (entry_row->>'workerId')::uuid,
      coalesce((entry_row->>'basePay')::numeric, 0), coalesce((entry_row->>'regularPay')::numeric, 0),
      coalesce((entry_row->>'overtimePay')::numeric, 0), coalesce((entry_row->>'allowances')::numeric, 0),
      coalesce((entry_row->>'otherEarnings')::numeric, 0), coalesce((entry_row->>'grossPay')::numeric, 0),
      coalesce((entry_row->>'deductions')::numeric, 0), coalesce((entry_row->>'otherDeductions')::numeric, 0),
      coalesce((entry_row->>'employerCosts')::numeric, 0), coalesce((entry_row->>'netPay')::numeric, 0),
      coalesce((entry_row->>'projectAllocatedCost')::numeric, 0), coalesce(entry_row->'calculationSnapshot', '{}'::jsonb),
      coalesce(entry_row->'costContext', '{}'::jsonb), nullif(entry_row->>'importRowId', '')::uuid
    );
  end loop;

  for allocation_row in select value from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    insert into public.payroll_project_allocations (
      id, user_id, payroll_entry_id, project_id, allocation_amount, allocation_percentage, source
    ) values (
      (allocation_row->>'id')::uuid, current_user_id, (allocation_row->>'payrollEntryId')::uuid,
      (allocation_row->>'projectId')::uuid, coalesce((allocation_row->>'allocationAmount')::numeric, 0),
      nullif(allocation_row->>'allocationPercentage', '')::numeric, coalesce(allocation_row->>'source', 'MANUAL')
    );
  end loop;
end;
$$;

-- Atomically commit a staged import, its DRAFT period/run, and the audit links.
create or replace function public.commit_payroll_import(
  p_batch_id uuid,
  p_period jsonb,
  p_run jsonb,
  p_entries jsonb,
  p_allocations jsonb,
  p_rows jsonb
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  period_id uuid := (p_period->>'id')::uuid;
  run_id uuid := (p_run->>'id')::uuid;
  row_value jsonb;
begin
  if not exists (
    select 1 from public.payroll_import_batches
    where id = p_batch_id and user_id = current_user_id and status not in ('COMMITTED','VOIDED')
  ) then
    raise exception 'Payroll import batch is unavailable for commit';
  end if;

  insert into public.payroll_periods (id, user_id, period_start, period_end, pay_date, status, notes)
  values (
    period_id, current_user_id, (p_period->>'periodStart')::date, (p_period->>'periodEnd')::date,
    nullif(p_period->>'payDate','')::date, coalesce(p_period->>'status','DRAFT'),
    p_period->>'notes'
  );

  insert into public.payroll_runs (id, user_id, period_id, import_batch_id, status, notes)
  values (run_id, current_user_id, period_id, p_batch_id, 'DRAFT', p_run->>'notes');

  perform public.replace_payroll_run_entries(run_id, p_entries, p_allocations);

  for row_value in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    update public.payroll_import_rows
    set status = coalesce(row_value->>'status','COMMITTED'),
        committed_payroll_entry_id = nullif(row_value->>'committedPayrollEntryId','')::uuid,
        updated_at = now()
    where id = (row_value->>'id')::uuid
      and batch_id = p_batch_id
      and user_id = current_user_id;
    if not found then raise exception 'Payroll import row is outside the current workspace'; end if;
  end loop;

  update public.payroll_import_batches
  set status = 'COMMITTED',
      committed_payroll_period_id = period_id,
      committed_payroll_run_id = run_id,
      committed_at = now(),
      updated_at = now()
  where id = p_batch_id and user_id = current_user_id;
end;
$$;
grant select, insert, update, delete on table public.labor_cost_centers, public.payroll_import_batches, public.payroll_import_rows, public.payroll_import_templates to authenticated;
grant execute on function public.replace_payroll_run_entries(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.commit_payroll_import(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

insert into storage.buckets (id, name, public)
values ('payroll-import-sources', 'payroll-import-sources', false)
on conflict (id) do update set public = false;

drop policy if exists "payroll import sources read own" on storage.objects;
drop policy if exists "payroll import sources insert own" on storage.objects;
drop policy if exists "payroll import sources update own" on storage.objects;
drop policy if exists "payroll import sources delete own" on storage.objects;
create policy "payroll import sources read own" on storage.objects for select to authenticated
using (bucket_id = 'payroll-import-sources' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "payroll import sources insert own" on storage.objects for insert to authenticated
with check (bucket_id = 'payroll-import-sources' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "payroll import sources update own" on storage.objects for update to authenticated
using (bucket_id = 'payroll-import-sources' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'payroll-import-sources' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "payroll import sources delete own" on storage.objects for delete to authenticated
using (bucket_id = 'payroll-import-sources' and (storage.foldername(name))[1] = (select auth.uid())::text);
