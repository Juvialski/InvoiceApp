-- Lightweight workforce metadata and payroll component fields.
-- This remains user_id scoped until a future workspace membership migration.

alter table public.payroll_runs
  add column if not exists calculated_at timestamptz;

alter table public.payroll_entries
  add column if not exists other_earnings numeric(18,2) not null default 0,
  add column if not exists other_deductions numeric(18,2) not null default 0,
  add column if not exists employer_costs numeric(18,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payroll_entries_other_earnings_nonnegative') then
    alter table public.payroll_entries add constraint payroll_entries_other_earnings_nonnegative check (other_earnings >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payroll_entries_other_deductions_nonnegative') then
    alter table public.payroll_entries add constraint payroll_entries_other_deductions_nonnegative check (other_deductions >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payroll_entries_employer_costs_nonnegative') then
    alter table public.payroll_entries add constraint payroll_entries_employer_costs_nonnegative check (employer_costs >= 0);
  end if;
end $$;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  manager_worker_id uuid references public.workers(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table public.workers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists employment_status text default 'ACTIVE',
  add column if not exists department_id uuid references public.departments(id) on delete set null,
  add column if not exists manager_worker_id uuid references public.workers(id) on delete set null,
  add column if not exists working_days text[],
  add column if not exists working_hours_start time,
  add column if not exists working_hours_end time;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workers_employment_status_valid') then
    alter table public.workers add constraint workers_employment_status_valid check (employment_status in ('ACTIVE','INACTIVE','ONBOARDING','OFFBOARDED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workers_manager_not_self') then
    alter table public.workers add constraint workers_manager_not_self check (manager_worker_id is null or manager_worker_id <> id);
  end if;
end $$;

create unique index if not exists departments_user_name_unique on public.departments(user_id, lower(name));
create unique index if not exists workers_auth_user_unique on public.workers(auth_user_id) where auth_user_id is not null;
create index if not exists departments_user_active_idx on public.departments(user_id, active, name);
create index if not exists workers_department_idx on public.workers(user_id, department_id, active);
create index if not exists workers_manager_idx on public.workers(user_id, manager_worker_id);

create or replace function public.validate_workforce_metadata_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'departments' and new.manager_worker_id is not null and not exists (
    select 1 from public.workers w where w.id = new.manager_worker_id and w.user_id = new.user_id
  ) then
    raise exception 'Department manager must belong to the same workspace';
  end if;

  if tg_table_name = 'workers' and new.department_id is not null and not exists (
    select 1 from public.departments d where d.id = new.department_id and d.user_id = new.user_id
  ) then
    raise exception 'Worker department must belong to the same workspace';
  end if;

  if tg_table_name = 'workers' and new.manager_worker_id is not null and not exists (
    select 1 from public.workers manager where manager.id = new.manager_worker_id and manager.user_id = new.user_id
  ) then
    raise exception 'Worker manager must belong to the same workspace';
  end if;

  return new;
end;
$$;

drop trigger if exists departments_metadata_ownership on public.departments;
create trigger departments_metadata_ownership
before insert or update on public.departments
for each row execute function public.validate_workforce_metadata_ownership();

drop trigger if exists workers_metadata_ownership on public.workers;
create trigger workers_metadata_ownership
before insert or update on public.workers
for each row execute function public.validate_workforce_metadata_ownership();

drop trigger if exists departments_updated_at on public.departments;
create trigger departments_updated_at
before update on public.departments
for each row execute function public.set_engineering_updated_at();

alter table public.departments enable row level security;
drop policy if exists departments_select_own on public.departments;
drop policy if exists departments_insert_own on public.departments;
drop policy if exists departments_update_own on public.departments;
drop policy if exists departments_delete_own on public.departments;
create policy departments_select_own on public.departments for select to authenticated using (user_id = (select auth.uid()));
create policy departments_insert_own on public.departments for insert to authenticated with check (user_id = (select auth.uid()));
create policy departments_update_own on public.departments for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy departments_delete_own on public.departments for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on table public.departments to authenticated;
