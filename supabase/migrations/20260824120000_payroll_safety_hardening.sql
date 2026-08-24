-- Additive payroll safety hardening.
--
-- This migration preserves finalized history while making the domain rules
-- authoritative for leave transitions and payroll-relevant project changes.

create or replace function public.validate_leave_request_operation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.end_date < new.start_date then
    raise exception 'Leave end date cannot be before start date'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    if not (
      (old.status = 'DRAFT' and new.status in ('PENDING', 'CANCELLED'))
      or (old.status = 'PENDING' and new.status in ('APPROVED', 'REJECTED', 'CANCELLED'))
      or (old.status = 'APPROVED' and new.status = 'CANCELLED')
    ) then
      raise exception 'Invalid leave status transition: % to %', old.status, new.status
        using errcode = '42501';
    end if;
  end if;

  if new.status in ('DRAFT', 'PENDING', 'APPROVED')
     and exists (
       select 1
       from public.leave_requests existing
       where existing.company_id = new.company_id
         and existing.worker_id = new.worker_id
         and existing.id <> new.id
         and existing.status in ('DRAFT', 'PENDING', 'APPROVED')
         and existing.start_date <= new.end_date
         and existing.end_date >= new.start_date
         and not (new.partial_day = 'AM' and existing.partial_day = 'PM')
         and not (new.partial_day = 'PM' and existing.partial_day = 'AM')
     ) then
    raise exception 'Overlapping active leave exists for this worker'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists leave_requests_operation_guard on public.leave_requests;
create trigger leave_requests_operation_guard
before insert or update on public.leave_requests
for each row execute function public.validate_leave_request_operation();

revoke execute on function public.validate_leave_request_operation() from public, anon, authenticated;

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
  v_project_id uuid := nullif(coalesce(v_new ->> 'id', v_old ->> 'id'), '')::uuid;
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
  -- Project UI metadata must not stale every payroll run. Only a project
  -- identity/status change used by a payroll source invalidates affected open
  -- periods; finalized periods remain immutable.
  if tg_table_name = 'projects' then
    if tg_op = 'UPDATE'
       and (old.status is not distinct from new.status)
       and (old.archived_at is not distinct from new.archived_at) then
      return new;
    end if;

    update public.payroll_periods p
    set source_revision = p.source_revision + 1,
        source_revision_updated_at = now(),
        updated_at = now()
    where p.company_id = v_company_id
      and p.status not in ('APPROVED', 'PAID', 'VOID')
      and (
        exists (
          select 1 from public.work_entries w
          where w.company_id = p.company_id
            and w.project_id = v_project_id
            and w.period_id = p.id
        )
        or exists (
          select 1 from public.project_worker_assignments a
          where a.company_id = p.company_id
            and a.project_id = v_project_id
            and a.start_date <= p.period_end
            and (a.end_date is null or a.end_date >= p.period_start)
        )
        or exists (
          select 1 from public.overtime_requests o
          where o.company_id = p.company_id
            and o.project_id = v_project_id
            and o.overtime_date between p.period_start and p.period_end
        )
      );
    return case when tg_op = 'DELETE' then old else new end;
  end if;

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

drop trigger if exists projects_source_revision on public.projects;
create trigger projects_source_revision
after insert or update or delete on public.projects
for each row execute function public.bump_payroll_source_revision();

revoke execute on function public.bump_payroll_source_revision() from public, anon, authenticated;
