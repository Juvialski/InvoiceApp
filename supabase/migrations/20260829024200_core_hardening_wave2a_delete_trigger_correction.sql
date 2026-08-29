-- Core Hardening Wave 2A correction.
--
-- DELETE row triggers receive OLD, not NEW. The original Wave 2A lifecycle
-- guards validated NEW before branching on TG_OP, which made an otherwise
-- authorized DELETE_UNUSED fail before its historical-usage check. Keep the
-- same integrity rules while handling DELETE against OLD first.

create or replace function public.guard_worker_compensation_profile_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if private.worker_compensation_profile_has_usage(
      old.id,
      old.company_id,
      old.worker_id,
      old.effective_from,
      old.effective_to
    ) then
      raise exception 'Historically consumed compensation profiles cannot be deleted; end or supersede them'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if not exists (
    select 1
    from public.workers w
    where w.id = new.worker_id
      and w.company_id = new.company_id
  ) then
    raise exception 'Compensation profile worker must belong to the same company'
      using errcode = '42501';
  end if;

  if new.default_labor_context <> 'PROJECT' and new.default_project_id is not null then
    raise exception 'Only PROJECT compensation profiles may have a default project'
      using errcode = '22023';
  end if;

  if new.default_project_id is not null and not exists (
    select 1
    from public.projects p
    where p.id = new.default_project_id
      and p.company_id = new.company_id
      and p.status <> 'ARCHIVED'
      and p.archived_at is null
  ) then
    raise exception 'Compensation profile default project must be active and in the same company'
      using errcode = '42501';
  end if;

  if new.active and exists (
    select 1
    from public.worker_compensation_profiles p
    where p.company_id = new.company_id
      and p.worker_id = new.worker_id
      and p.id <> new.id
      and p.active
      and p.effective_from <= coalesce(new.effective_to, date '9999-12-31')
      and coalesce(p.effective_to, date '9999-12-31') >= new.effective_from
  ) then
    raise exception 'Overlapping active compensation profile periods are not allowed'
      using errcode = '23P01';
  end if;

  if tg_op = 'UPDATE'
     and private.worker_compensation_profile_has_usage(
       old.id,
       old.company_id,
       old.worker_id,
       old.effective_from,
       old.effective_to
     )
     and (
       new.worker_id is distinct from old.worker_id
       or new.effective_from is distinct from old.effective_from
       or new.frequency is distinct from old.frequency
       or new.rate is distinct from old.rate
       or new.default_labor_context is distinct from old.default_labor_context
       or new.default_project_id is distinct from old.default_project_id
     ) then
    raise exception 'Historically consumed compensation profiles cannot be rewritten; end or supersede them'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.guard_recurring_component_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if private.recurring_component_has_usage(
      old.id,
      old.company_id,
      old.worker_id,
      old.effective_from,
      old.effective_to
    ) then
      raise exception 'Historically consumed payroll components cannot be deleted; deactivate or end them'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if not exists (
    select 1
    from public.workers w
    where w.id = new.worker_id
      and w.company_id = new.company_id
  ) then
    raise exception 'Recurring component worker must belong to the same company'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and private.recurring_component_has_usage(
       old.id,
       old.company_id,
       old.worker_id,
       old.effective_from,
       old.effective_to
     )
     and (
       new.worker_id is distinct from old.worker_id
       or new.type is distinct from old.type
       or new.code is distinct from old.code
       or new.name is distinct from old.name
       or new.amount is distinct from old.amount
       or new.rate is distinct from old.rate
       or new.effective_from is distinct from old.effective_from
     ) then
    raise exception 'Historically consumed payroll components cannot be rewritten; deactivate or end them'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Trigger functions remain internal implementation details. The public
-- lifecycle RPCs are the only authenticated destructive entry points.
revoke execute on function public.guard_worker_compensation_profile_lifecycle()
  from public, anon, authenticated;
revoke execute on function public.guard_recurring_component_lifecycle()
  from public, anon, authenticated;
