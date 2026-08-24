-- Additive workforce/payroll operations foundation.
--
-- This migration preserves legacy payroll rows and adds:
--   * first-class attendance, leave, overtime, and holiday sources
--   * conditional project linkage for work/labor entries
--   * deterministic payroll source revision metadata
--   * company-scoped RLS and relationship integrity
--   * finalized-source and maintenance deletion guards

alter table public.payroll_periods
  add column if not exists source_revision bigint not null default 0,
  add column if not exists source_revision_updated_at timestamptz;

alter table public.payroll_runs
  add column if not exists calculated_source_revision bigint,
  add column if not exists source_fingerprint text;

alter table public.work_entries
  alter column project_id drop not null;

alter table public.work_entries
  add column if not exists labor_context text not null default 'PROJECT';

update public.work_entries
set labor_context = 'PROJECT'
where labor_context is null;

alter table public.work_entries
  drop constraint if exists work_entries_labor_context_check;

alter table public.work_entries
  add constraint work_entries_labor_context_check check (
    labor_context in ('PROJECT', 'ADMIN_OFFICE', 'GENERAL_OVERHEAD', 'UNALLOCATED_REVIEW')
    and (
      (labor_context = 'PROJECT' and project_id is not null)
      or (labor_context <> 'PROJECT' and project_id is null)
    )
  );

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete restrict,
  period_id uuid references public.payroll_periods(id) on delete restrict,
  attendance_date date not null,
  scheduled_start time,
  scheduled_end time,
  scheduled_minutes integer not null default 0 check (scheduled_minutes >= 0),
  break_minutes integer not null default 0 check (break_minutes >= 0),
  actual_time_in time,
  actual_time_out time,
  regular_minutes integer not null default 0 check (regular_minutes >= 0),
  late_minutes integer not null default 0 check (late_minutes >= 0),
  undertime_minutes integer not null default 0 check (undertime_minutes >= 0),
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  paid_day_fraction numeric(8,4) not null default 0 check (paid_day_fraction >= 0 and paid_day_fraction <= 1),
  attendance_status text not null default 'PRESENT'
    check (attendance_status in ('PRESENT', 'ABSENT', 'PARTIAL', 'ON_LEAVE', 'REST_DAY', 'HOLIDAY', 'OFFICIAL_BUSINESS')),
  record_status text not null default 'DRAFT'
    check (record_status in ('DRAFT', 'CONFIRMED', 'VOID')),
  source text not null default 'MANUAL'
    check (source in ('MANUAL', 'BULK', 'IMPORT', 'SYSTEM', 'LEAVE')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, worker_id, attendance_date)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete restrict,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  partial_day text not null default 'FULL'
    check (partial_day in ('FULL', 'AM', 'PM')),
  paid boolean,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.overtime_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete restrict,
  period_id uuid references public.payroll_periods(id) on delete restrict,
  overtime_date date not null,
  project_id uuid references public.projects(id) on delete set null,
  labor_context text not null default 'UNALLOCATED_REVIEW'
    check (labor_context in ('PROJECT', 'ADMIN_OFFICE', 'GENERAL_OVERHEAD', 'UNALLOCATED_REVIEW')),
  requested_minutes integer not null default 0 check (requested_minutes >= 0),
  approved_minutes integer not null default 0
    check (approved_minutes >= 0 and approved_minutes <= requested_minutes),
  reason text,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  notes text,
  source text not null default 'MANUAL'
    check (source in ('MANUAL', 'IMPORT', 'SYSTEM', 'LEGACY_WORK_ENTRY')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (labor_context = 'PROJECT' and project_id is not null)
    or (labor_context <> 'PROJECT' and project_id is null)
  )
);

create table if not exists public.payroll_holidays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  category text,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, holiday_date)
);

create index if not exists attendance_records_company_date_idx
  on public.attendance_records(company_id, attendance_date desc, worker_id);
create index if not exists attendance_records_worker_date_idx
  on public.attendance_records(company_id, worker_id, attendance_date desc);
create index if not exists attendance_records_period_idx
  on public.attendance_records(company_id, period_id, attendance_date);
create index if not exists leave_requests_company_dates_idx
  on public.leave_requests(company_id, start_date, end_date, worker_id);
create index if not exists leave_requests_worker_dates_idx
  on public.leave_requests(company_id, worker_id, start_date, end_date);
create index if not exists overtime_requests_company_date_idx
  on public.overtime_requests(company_id, overtime_date desc, worker_id);
create index if not exists overtime_requests_period_idx
  on public.overtime_requests(company_id, period_id, overtime_date);
create index if not exists payroll_holidays_company_date_idx
  on public.payroll_holidays(company_id, holiday_date);

insert into private.company_tenant_policy_catalog (
  table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete
)
values
  ('attendance_records', 'payroll.detail.read', 'payroll.manage', true, true, true),
  ('leave_requests', 'payroll.detail.read', 'payroll.manage', true, true, true),
  ('overtime_requests', 'payroll.detail.read', 'payroll.manage', true, true, true),
  ('payroll_holidays', 'payroll.detail.read', 'payroll.manage', true, true, true)
on conflict (table_name) do update
set read_permission = excluded.read_permission,
    write_permission = excluded.write_permission,
    allow_insert = excluded.allow_insert,
    allow_update = excluded.allow_update,
    allow_delete = excluded.allow_delete;

create or replace function public.validate_work_entry_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.workers w
    where w.id = new.worker_id
      and w.company_id = new.company_id
  ) then
    raise exception 'Work entry worker is outside the company';
  end if;

  if new.labor_context = 'PROJECT' then
    if new.project_id is null
       or not exists (
         select 1
         from public.projects p
         where p.id = new.project_id
           and p.company_id = new.company_id
       ) then
      raise exception 'Project work entry requires a project in the same company';
    end if;
  elsif new.project_id is not null then
    raise exception 'Non-project labor contexts cannot reference a project';
  end if;

  if new.period_id is not null
     and not exists (
       select 1
       from public.payroll_periods pp
       where pp.id = new.period_id
         and pp.company_id = new.company_id
     ) then
    raise exception 'Work entry payroll period is outside the company';
  end if;
  return new;
end;
$$;

drop trigger if exists work_entries_ownership on public.work_entries;
create trigger work_entries_ownership
before insert or update on public.work_entries
for each row execute function public.validate_work_entry_ownership();

create or replace function public.validate_workforce_record_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_worker_id uuid := nullif(v_row ->> 'worker_id', '')::uuid;
  v_period_id uuid := nullif(v_row ->> 'period_id', '')::uuid;
  v_project_id uuid := nullif(v_row ->> 'project_id', '')::uuid;
begin
  if tg_table_name <> 'payroll_holidays'
     and not exists (
       select 1
       from public.workers w
       where w.id = v_worker_id
         and w.company_id = new.company_id
     ) then
    raise exception 'Workforce worker is outside the company';
  end if;

  if v_period_id is not null
     and not exists (
       select 1
       from public.payroll_periods p
       where p.id = v_period_id
         and p.company_id = new.company_id
     ) then
    raise exception 'Workforce payroll period is outside the company';
  end if;

  if v_project_id is not null
     and not exists (
       select 1
       from public.projects p
       where p.id = v_project_id
         and p.company_id = new.company_id
     ) then
    raise exception 'Workforce project is outside the company';
  end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'attendance_records',
    'leave_requests',
    'overtime_requests',
    'payroll_holidays'
  ] loop
    execute format(
      'drop trigger if exists %I on public.%I',
      v_table || '_company_boundary',
      v_table
    );
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function private.enforce_company_row_boundary()',
      v_table || '_company_boundary',
      v_table
    );
    execute format(
      'drop trigger if exists %I on public.%I',
      v_table || '_updated_at',
      v_table
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_company_updated_at()',
      v_table || '_updated_at',
      v_table
    );
    if v_table <> 'payroll_holidays' then
      execute format(
        'drop trigger if exists %I on public.%I',
        v_table || '_ownership',
        v_table
      );
      execute format(
        'create trigger %I before insert or update on public.%I for each row execute function public.validate_workforce_record_ownership()',
        v_table || '_ownership',
        v_table
      );
    end if;
  end loop;
end;
$$;

create or replace function private.payroll_period_has_workforce_sources(
  p_period_id uuid,
  p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.attendance_records a
    where a.company_id = p_company_id
      and a.period_id = p_period_id
  )
  or exists (
    select 1
    from public.overtime_requests o
    where o.company_id = p_company_id
      and o.period_id = p_period_id
  )
  or exists (
    select 1
    from public.leave_requests l
    join public.payroll_periods p
      on p.company_id = l.company_id
     and p.id = p_period_id
    where l.company_id = p_company_id
      and p.period_start <= l.end_date
      and p.period_end >= l.start_date
  );
$$;

create or replace function public.prevent_workforce_period_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if private.payroll_period_has_workforce_sources(old.id, old.company_id) then
    raise exception 'Payroll period contains attendance, leave, or overtime source records and cannot be deleted'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists payroll_periods_workforce_source_guard on public.payroll_periods;
create trigger payroll_periods_workforce_source_guard
before delete on public.payroll_periods
for each row execute function public.prevent_workforce_period_delete();

create or replace function public.guard_finalized_payroll_workforce_source()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new jsonb := coalesce(to_jsonb(new), '{}'::jsonb);
  v_old jsonb := coalesce(to_jsonb(old), '{}'::jsonb);
  v_company_id uuid := nullif(coalesce(v_new ->> 'company_id', v_old ->> 'company_id'), '')::uuid;
  v_period_id uuid := nullif(coalesce(v_new ->> 'period_id', v_old ->> 'period_id'), '')::uuid;
  v_start_date date := nullif(coalesce(
    v_new ->> 'attendance_date',
    v_new ->> 'overtime_date',
    v_new ->> 'start_date',
    v_new ->> 'work_date',
    v_old ->> 'attendance_date',
    v_old ->> 'overtime_date',
    v_old ->> 'start_date',
    v_old ->> 'work_date'
  ), '')::date;
  v_end_date date := nullif(coalesce(
    v_new ->> 'end_date',
    v_new ->> 'attendance_date',
    v_new ->> 'overtime_date',
    v_new ->> 'work_date',
    v_old ->> 'end_date',
    v_old ->> 'attendance_date',
    v_old ->> 'overtime_date',
    v_old ->> 'work_date'
  ), '')::date;
begin
  if exists (
    select 1
    from public.payroll_periods p
    left join public.payroll_runs r
      on r.company_id = p.company_id
     and r.period_id = p.id
    where p.company_id = v_company_id
      and (
        p.status in ('APPROVED', 'PAID')
        or p.locked_at is not null
        or r.status in ('APPROVED', 'PAID')
      )
      and (
        (v_period_id is not null and p.id = v_period_id)
        or (
          v_period_id is null
          and v_start_date is not null
          and p.period_start <= v_end_date
          and p.period_end >= v_start_date
        )
      )
  ) then
    raise exception 'Finalized payroll sources are immutable; create a deliberate correction workflow'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'attendance_records',
    'leave_requests',
    'overtime_requests',
    'work_entries'
  ] loop
    execute format(
      'drop trigger if exists %I on public.%I',
      v_table || '_finalized_source_guard',
      v_table
    );
    execute format(
      'create trigger %I before insert or update or delete on public.%I for each row execute function public.guard_finalized_payroll_workforce_source()',
      v_table || '_finalized_source_guard',
      v_table
    );
  end loop;
end;
$$;

create or replace function public.bump_payroll_source_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new jsonb := coalesce(to_jsonb(new), '{}'::jsonb);
  v_old jsonb := coalesce(to_jsonb(old), '{}'::jsonb);
  v_company_id uuid := nullif(coalesce(v_new ->> 'company_id', v_old ->> 'company_id'), '')::uuid;
  v_period_id uuid := nullif(coalesce(v_new ->> 'period_id', v_old ->> 'period_id'), '')::uuid;
  v_start_date date := nullif(coalesce(
    v_new ->> 'attendance_date',
    v_new ->> 'overtime_date',
    v_new ->> 'start_date',
    v_new ->> 'work_date',
    v_old ->> 'attendance_date',
    v_old ->> 'overtime_date',
    v_old ->> 'start_date',
    v_old ->> 'work_date'
  ), '')::date;
  v_end_date date := nullif(coalesce(
    v_new ->> 'end_date',
    v_new ->> 'attendance_date',
    v_new ->> 'overtime_date',
    v_new ->> 'work_date',
    v_old ->> 'end_date',
    v_old ->> 'attendance_date',
    v_old ->> 'overtime_date',
    v_old ->> 'work_date'
  ), '')::date;
begin
  update public.payroll_periods p
  set source_revision = p.source_revision + 1,
      source_revision_updated_at = now(),
      updated_at = now()
  where p.company_id = v_company_id
    and p.status not in ('APPROVED', 'PAID', 'VOID')
    and (
      (v_period_id is not null and p.id = v_period_id)
      or (
        v_period_id is null
        and v_start_date is not null
        and p.period_start <= v_end_date
        and p.period_end >= v_start_date
      )
      or (v_period_id is null and v_start_date is null)
    );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'attendance_records',
    'leave_requests',
    'overtime_requests',
    'work_entries',
    'workers',
    'project_worker_assignments',
    'worker_compensation_profiles',
    'recurring_payroll_components',
    'payroll_holidays'
  ] loop
    execute format(
      'drop trigger if exists %I on public.%I',
      v_table || '_source_revision',
      v_table
    );
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.bump_payroll_source_revision()',
      v_table || '_source_revision',
      v_table
    );
  end loop;
end;
$$;

create or replace function public.guard_payroll_run_source_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_revision bigint;
begin
  if new.status = 'APPROVED'
     and new.calculated_source_revision is not null then
    select source_revision
    into v_current_revision
    from public.payroll_periods
    where id = new.period_id
      and company_id = new.company_id;
    if v_current_revision is null
       or new.calculated_source_revision <> v_current_revision then
      raise exception 'Payroll sources changed after calculation. Recalculate before approval'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_runs_source_revision_guard on public.payroll_runs;
create trigger payroll_runs_source_revision_guard
before update on public.payroll_runs
for each row execute function public.guard_payroll_run_source_revision();

-- Keep the existing maintenance decision logic, but make workforce source rows
-- an explicit reason a generated period is not disposable.
create or replace function private.payroll_maintenance_period_is_disposable(
  p_company_id uuid,
  p_period_id uuid,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period public.payroll_periods;
begin
  select *
  into v_period
  from public.payroll_periods p
  where p.id = p_period_id
    and p.company_id = p_company_id;
  if not found or not v_period.auto_generated or v_period.locked_at is not null then
    return false;
  end if;
  if private.payroll_period_has_workforce_sources(v_period.id, p_company_id) then
    return false;
  end if;
  if p_action = 'RESET_UNAPPROVED' then
    if v_period.status not in ('DRAFT', 'OPEN', 'CALCULATED', 'VOID') then return false; end if;
    if v_period.status = 'VOID' and not private.payroll_maintenance_system_note(v_period.notes) then return false; end if;
    if not private.payroll_maintenance_system_note(v_period.notes) then return false; end if;
    if exists (select 1 from public.payroll_runs r where r.company_id = p_company_id and r.period_id = v_period.id and r.status in ('DRAFT', 'VOID') and not private.payroll_maintenance_system_note(r.notes)) then return false; end if;
    if exists (select 1 from public.payroll_runs r join public.payroll_entries e on e.payroll_run_id = r.id where r.company_id = p_company_id and e.company_id = p_company_id and r.period_id = v_period.id and r.status = 'VOID') then return false; end if;
    if exists (select 1 from public.work_entries w where w.company_id = p_company_id and w.period_id = v_period.id and w.status <> 'VOID') then return false; end if;
    if exists (select 1 from public.payroll_runs r where r.company_id = p_company_id and r.period_id = v_period.id and r.status in ('APPROVED', 'PAID')) then return false; end if;
    if exists (select 1 from public.payroll_runs r where r.company_id = p_company_id and r.period_id = v_period.id and r.status not in ('DRAFT', 'CALCULATED', 'VOID')) then return false; end if;
    return true;
  end if;
  if v_period.status not in ('DRAFT', 'OPEN', 'VOID') or not private.payroll_maintenance_system_note(v_period.notes) then return false; end if;
  if exists (select 1 from public.payroll_runs r where r.company_id = p_company_id and r.period_id = v_period.id and r.status in ('DRAFT', 'VOID') and not private.payroll_maintenance_system_note(r.notes)) then return false; end if;
  if exists (select 1 from public.payroll_runs r where r.company_id = p_company_id and r.period_id = v_period.id and r.status in ('DRAFT', 'VOID') and r.import_batch_id is not null and not exists (select 1 from public.payroll_import_batches b where b.id = r.import_batch_id and b.company_id = p_company_id and b.status = 'VOIDED')) then return false; end if;
  if exists (select 1 from public.work_entries w where w.company_id = p_company_id and w.period_id = v_period.id and w.status <> 'VOID') then return false; end if;
  if exists (select 1 from public.payroll_runs r where r.company_id = p_company_id and r.period_id = v_period.id and r.status in ('CALCULATED', 'APPROVED', 'PAID')) then return false; end if;
  if exists (select 1 from public.payroll_entries e join public.payroll_runs r on r.id = e.payroll_run_id where e.company_id = p_company_id and r.company_id = p_company_id and r.period_id = v_period.id) then return false; end if;
  if exists (select 1 from public.payroll_import_batches b where b.company_id = p_company_id and b.status <> 'VOIDED' and b.committed_payroll_period_id = v_period.id) then return false; end if;
  return true;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'attendance_records',
    'leave_requests',
    'overtime_requests',
    'payroll_holidays'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_company_select', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_company_insert', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_company_update', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_company_delete', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.has_company_permission(company_id, ''payroll.detail.read'')))',
      v_table || '_company_select',
      v_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.has_company_permission(company_id, ''payroll.manage'')))',
      v_table || '_company_insert',
      v_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.has_company_permission(company_id, ''payroll.manage''))) with check ((select public.has_company_permission(company_id, ''payroll.manage'')))',
      v_table || '_company_update',
      v_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.has_company_permission(company_id, ''payroll.manage'')))',
      v_table || '_company_delete',
      v_table
    );
  end loop;
end;
$$;

grant select, insert, update, delete
on table public.attendance_records, public.leave_requests, public.overtime_requests, public.payroll_holidays
to authenticated;
revoke all
on table public.attendance_records, public.leave_requests, public.overtime_requests, public.payroll_holidays
from anon;

-- Include workforce sources in the maintenance preview contract as well as the
-- final delete guard. This keeps the operator-facing count honest.
create or replace function public.preview_payroll_maintenance(
  p_company_id uuid,
  p_action text,
  p_reference_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan jsonb;
  v_protected_data_periods bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required for payroll maintenance'
      using errcode = '42501';
  end if;

  v_plan := private.build_payroll_maintenance_plan(
    p_company_id,
    p_action,
    p_reference_date
  );

  select count(*)
  into v_protected_data_periods
  from public.payroll_periods p
  where p.company_id = p_company_id
    and (
      exists (
        select 1
        from public.work_entries w
        where w.company_id = p_company_id
          and w.period_id = p.id
          and w.status <> 'VOID'
      )
      or exists (
        select 1
        from public.payroll_entries e
        join public.payroll_runs r on r.id = e.payroll_run_id
        where e.company_id = p_company_id
          and r.company_id = p_company_id
          and r.period_id = p.id
      )
      or exists (
        select 1
        from public.payroll_import_batches b
        where b.company_id = p_company_id
          and b.status <> 'VOIDED'
          and b.committed_payroll_period_id = p.id
      )
      or not private.payroll_maintenance_system_note(p.notes)
      or private.payroll_period_has_workforce_sources(p.id, p_company_id)
    );

  return jsonb_set(
    v_plan,
    '{protectedDataBearingPeriods}',
    to_jsonb(v_protected_data_periods),
    true
  );
end;
$$;

revoke execute on function public.preview_payroll_maintenance(uuid, text, date)
from public, anon;
grant execute on function public.preview_payroll_maintenance(uuid, text, date)
to authenticated;

revoke execute on function private.payroll_period_has_workforce_sources(uuid, uuid)
from public, anon, authenticated;
