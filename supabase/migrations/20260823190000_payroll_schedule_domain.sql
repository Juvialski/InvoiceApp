-- Additive payroll schedule domain. Existing payroll_periods remain valid.
-- Generated periods are uniquely identified by schedule version and boundaries;
-- application code preserves locked historical rows during schedule changes.

create table if not exists public.payroll_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Payroll schedule',
  frequency text not null check (frequency in ('DAILY','WEEKLY','BIWEEKLY','SEMI_MONTHLY','MONTHLY','CUSTOM')),
  effective_from date not null,
  configuration jsonb not null default '{}'::jsonb,
  pay_date_rule jsonb not null default '{"type":"SAME_PERIOD_END"}'::jsonb,
  auto_generate_periods boolean not null default true,
  auto_calculate boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_schedule_versions (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.payroll_schedules(id) on delete cascade,
  version integer not null check (version > 0),
  effective_from date not null,
  effective_to date,
  frequency text not null check (frequency in ('DAILY','WEEKLY','BIWEEKLY','SEMI_MONTHLY','MONTHLY','CUSTOM')),
  configuration jsonb not null default '{}'::jsonb,
  pay_date_rule jsonb not null default '{"type":"SAME_PERIOD_END"}'::jsonb,
  auto_generate_periods boolean not null default true,
  auto_calculate boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, version),
  check (effective_to is null or effective_to >= effective_from)
);

alter table public.payroll_periods
  add column if not exists schedule_id uuid references public.payroll_schedules(id) on delete set null;
alter table public.payroll_periods
  add column if not exists schedule_version_id uuid references public.payroll_schedule_versions(id) on delete set null;
alter table public.payroll_periods
  add column if not exists locked_at timestamptz;
alter table public.payroll_periods
  add column if not exists auto_generated boolean not null default false;

create unique index if not exists payroll_periods_schedule_boundary_unique
  on public.payroll_periods(schedule_id, schedule_version_id, period_start, period_end)
  where schedule_id is not null and schedule_version_id is not null;
create index if not exists payroll_schedule_versions_effective_idx
  on public.payroll_schedule_versions(schedule_id, effective_from desc, version desc);
create index if not exists payroll_periods_schedule_end_idx
  on public.payroll_periods(user_id, schedule_id, period_end desc);

create or replace function public.guard_scheduled_payroll_period_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status in ('APPROVED', 'PAID', 'VOID') then
    if new.period_start is distinct from old.period_start
       or new.period_end is distinct from old.period_end
       or new.schedule_id is distinct from old.schedule_id
       or new.schedule_version_id is distinct from old.schedule_version_id
       or new.pay_date is distinct from old.pay_date then
      raise exception 'Locked payroll periods cannot change schedule or date boundaries';
    end if;
    new.locked_at := coalesce(old.locked_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists scheduled_payroll_period_mutation_guard on public.payroll_periods;
create trigger scheduled_payroll_period_mutation_guard
before update on public.payroll_periods
for each row execute function public.guard_scheduled_payroll_period_mutation();

do $$
declare table_name text;
begin
  foreach table_name in array array['payroll_schedules','payroll_schedule_versions'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_engineering_updated_at()', table_name || '_updated_at', table_name);
  end loop;
end $$;

alter table public.payroll_schedules enable row level security;
alter table public.payroll_schedule_versions enable row level security;

drop policy if exists payroll_schedules_select_own on public.payroll_schedules;
drop policy if exists payroll_schedules_insert_own on public.payroll_schedules;
drop policy if exists payroll_schedules_update_own on public.payroll_schedules;
drop policy if exists payroll_schedules_delete_own on public.payroll_schedules;
create policy payroll_schedules_select_own on public.payroll_schedules for select to authenticated using (user_id = (select auth.uid()));
create policy payroll_schedules_insert_own on public.payroll_schedules for insert to authenticated with check (user_id = (select auth.uid()));
create policy payroll_schedules_update_own on public.payroll_schedules for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy payroll_schedules_delete_own on public.payroll_schedules for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists payroll_schedule_versions_select_own on public.payroll_schedule_versions;
drop policy if exists payroll_schedule_versions_insert_own on public.payroll_schedule_versions;
drop policy if exists payroll_schedule_versions_update_own on public.payroll_schedule_versions;
drop policy if exists payroll_schedule_versions_delete_own on public.payroll_schedule_versions;
create policy payroll_schedule_versions_select_own on public.payroll_schedule_versions for select to authenticated
using (exists (select 1 from public.payroll_schedules s where s.id = payroll_schedule_versions.schedule_id and s.user_id = (select auth.uid())));
create policy payroll_schedule_versions_insert_own on public.payroll_schedule_versions for insert to authenticated
with check (exists (select 1 from public.payroll_schedules s where s.id = payroll_schedule_versions.schedule_id and s.user_id = (select auth.uid())));
create policy payroll_schedule_versions_update_own on public.payroll_schedule_versions for update to authenticated
using (exists (select 1 from public.payroll_schedules s where s.id = payroll_schedule_versions.schedule_id and s.user_id = (select auth.uid())))
with check (exists (select 1 from public.payroll_schedules s where s.id = payroll_schedule_versions.schedule_id and s.user_id = (select auth.uid())));
create policy payroll_schedule_versions_delete_own on public.payroll_schedule_versions for delete to authenticated
using (exists (select 1 from public.payroll_schedules s where s.id = payroll_schedule_versions.schedule_id and s.user_id = (select auth.uid())));

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.payroll_schedules, public.payroll_schedule_versions to authenticated;

-- Make the new persisted domain observable to the existing Realtime publication.
do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    foreach table_name in array array['payroll_schedules', 'payroll_schedule_versions'] loop
      if to_regclass(format('public.%I', table_name)) is not null
         and not exists (
           select 1 from pg_publication p
           join pg_publication_rel pr on pr.prpubid = p.oid
           join pg_class c on c.oid = pr.prrelid
           join pg_namespace n on n.oid = c.relnamespace
           where p.pubname = 'supabase_realtime'
             and n.nspname = 'public'
             and c.relname = table_name
         ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;