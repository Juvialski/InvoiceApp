-- Additive worker compensation history and recurring payroll components.
-- These records are effective-dated so approved/paid payroll snapshots remain
-- reproducible when a worker's compensation changes later.

create table if not exists public.worker_compensation_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  effective_from date not null,
  effective_to date,
  frequency text not null check (frequency in ('MONTHLY','DAILY','HOURLY')),
  rate numeric(18,2) not null check (rate >= 0),
  default_labor_context text not null default 'UNALLOCATED_REVIEW'
    check (default_labor_context in ('PROJECT','ADMIN_OFFICE','GENERAL_OVERHEAD','UNALLOCATED_REVIEW')),
  default_project_id uuid references public.projects(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.recurring_payroll_components (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  type text not null check (type in ('EARNING','DEDUCTION','EMPLOYER_COST')),
  code text,
  name text not null,
  amount numeric(18,2),
  rate numeric(10,6),
  effective_from date not null,
  effective_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check ((amount is not null and amount >= 0) or (rate is not null and rate >= 0)),
  check (amount is null or rate is null)
);

create index if not exists worker_compensation_profiles_worker_effective_idx
  on public.worker_compensation_profiles(user_id, worker_id, effective_from desc, active);
create index if not exists worker_compensation_profiles_project_idx
  on public.worker_compensation_profiles(user_id, default_project_id)
  where default_project_id is not null;
create index if not exists recurring_payroll_components_worker_effective_idx
  on public.recurring_payroll_components(user_id, worker_id, effective_from desc, active);

do $$
declare table_name text;
begin
  foreach table_name in array array['worker_compensation_profiles','recurring_payroll_components'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_engineering_updated_at()', table_name || '_updated_at', table_name);
  end loop;
end $$;

create or replace function public.validate_payroll_profile_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.workers w where w.id = new.worker_id and w.user_id = new.user_id
  ) then
    raise exception 'Payroll profile worker is outside the current workspace';
  end if;
  if tg_table_name = 'worker_compensation_profiles' and new.default_project_id is not null and not exists (
    select 1 from public.projects p where p.id = new.default_project_id and p.user_id = new.user_id
  ) then
    raise exception 'Payroll profile default project is outside the current workspace';
  end if;
  return new;
end;
$$;

drop trigger if exists worker_compensation_profiles_ownership on public.worker_compensation_profiles;
create trigger worker_compensation_profiles_ownership
before insert or update on public.worker_compensation_profiles
for each row execute function public.validate_payroll_profile_ownership();

drop trigger if exists recurring_payroll_components_ownership on public.recurring_payroll_components;
create trigger recurring_payroll_components_ownership
before insert or update on public.recurring_payroll_components
for each row execute function public.validate_payroll_profile_ownership();

alter table public.worker_compensation_profiles enable row level security;
alter table public.recurring_payroll_components enable row level security;

drop policy if exists worker_compensation_profiles_select_own on public.worker_compensation_profiles;
drop policy if exists worker_compensation_profiles_insert_own on public.worker_compensation_profiles;
drop policy if exists worker_compensation_profiles_update_own on public.worker_compensation_profiles;
drop policy if exists worker_compensation_profiles_delete_own on public.worker_compensation_profiles;
create policy worker_compensation_profiles_select_own on public.worker_compensation_profiles for select to authenticated
using (user_id = (select auth.uid()));
create policy worker_compensation_profiles_insert_own on public.worker_compensation_profiles for insert to authenticated
with check (user_id = (select auth.uid()));
create policy worker_compensation_profiles_update_own on public.worker_compensation_profiles for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy worker_compensation_profiles_delete_own on public.worker_compensation_profiles for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists recurring_payroll_components_select_own on public.recurring_payroll_components;
drop policy if exists recurring_payroll_components_insert_own on public.recurring_payroll_components;
drop policy if exists recurring_payroll_components_update_own on public.recurring_payroll_components;
drop policy if exists recurring_payroll_components_delete_own on public.recurring_payroll_components;
create policy recurring_payroll_components_select_own on public.recurring_payroll_components for select to authenticated
using (user_id = (select auth.uid()));
create policy recurring_payroll_components_insert_own on public.recurring_payroll_components for insert to authenticated
with check (user_id = (select auth.uid()));
create policy recurring_payroll_components_update_own on public.recurring_payroll_components for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy recurring_payroll_components_delete_own on public.recurring_payroll_components for delete to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete on table
  public.worker_compensation_profiles,
  public.recurring_payroll_components
to authenticated;
