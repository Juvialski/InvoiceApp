-- Payroll needs project identity for assignments, work-entry context, and
-- payroll allocation labels. It must not receive the full Projects workspace
-- merely to populate those references.

insert into public.company_permission_catalog (permission_key, description)
values (
  'payroll.projectreference.read',
  'Read project codes, names, and lifecycle status needed for payroll context.'
)
on conflict (permission_key) do update set description = excluded.description;

insert into public.company_role_permissions (role_key, permission_key)
values
  ('COMPANY_ADMIN', 'payroll.projectreference.read'),
  ('PAYROLL', 'payroll.projectreference.read')
on conflict do nothing;

-- The built-in Payroll template retains payroll Reports access, but no longer
-- opens unrelated Dashboard, Projects, or engineering workspaces.
delete from public.company_role_permissions
where role_key = 'PAYROLL'
  and permission_key in (
    'dashboard.read',
    'projects.read',
    'engineering.documents.read',
    'engineering.rfis.read',
    'engineering.submittals.read',
    'engineering.sitelogs.read'
  );

-- Project labor aggregates are already a separate, column-limited payroll
-- reporting boundary. Preserve that legitimate Payroll capability without
-- restoring direct projects.read access to the full project table.
create or replace function public.get_project_labor_cost_aggregate(
  p_project_ids uuid[]
)
returns table(
  project_id uuid,
  currency text,
  confirmed_labor_cost numeric,
  pending_labor_cost numeric,
  aggregate_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_requested_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required for project labor cost aggregation'
      using errcode = '42501';
  end if;

  v_company_id := public.get_deployment_company_id();
  if v_company_id is distinct from (select private.resolve_transition_company()) then
    raise exception 'Project labor aggregation company context is invalid'
      using errcode = '42501';
  end if;

  if not (select private.has_company_permission(v_company_id, 'payroll.summary.read')) then
    raise exception 'Payroll summary permission is required for project labor cost aggregation'
      using errcode = '42501';
  end if;

  if not (
    (select private.has_company_permission(v_company_id, 'projects.read'))
    or (select private.has_company_permission(v_company_id, 'payroll.projectreference.read'))
  ) then
    raise exception 'Project or Payroll project-reference permission is required for project labor cost aggregation'
      using errcode = '42501';
  end if;

  if p_project_ids is null or coalesce(cardinality(p_project_ids), 0) = 0 then
    raise exception 'At least one project is required for project labor cost aggregation'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_project_ids) as requested(project_id)
    where requested.project_id is null
  ) then
    raise exception 'Project identifiers must not be null'
      using errcode = '22023';
  end if;

  select count(*)::integer
    into v_requested_count
  from (
    select distinct requested.project_id
    from unnest(p_project_ids) as requested(project_id)
  ) requested;

  if v_requested_count > 1000 then
    raise exception 'Project labor cost aggregation is limited to 1000 projects per request'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select distinct requested.project_id
      from unnest(p_project_ids) as requested(project_id)
    ) requested
    left join public.projects p
      on p.id = requested.project_id
     and p.company_id = v_company_id
    where p.id is null
  ) then
    raise exception 'Every requested project must belong to the configured deployment company'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.payroll_project_allocations ppa
    join (
      select distinct requested.project_id
      from unnest(p_project_ids) as requested(project_id)
    ) requested on requested.project_id = ppa.project_id
    left join public.payroll_entries pe on pe.id = ppa.payroll_entry_id
    left join public.payroll_runs pr on pr.id = pe.payroll_run_id
    left join public.projects p on p.id = ppa.project_id
    where ppa.company_id is distinct from v_company_id
       or pe.id is null
       or pe.company_id is distinct from v_company_id
       or pr.id is null
       or pr.company_id is distinct from v_company_id
       or p.id is null
       or p.company_id is distinct from v_company_id
  ) then
    raise exception 'Project labor cost source is incomplete for the requested project'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.payroll_entries pe
    join public.payroll_runs pr
      on pr.id = pe.payroll_run_id
     and pr.company_id = v_company_id
    join public.payroll_project_allocations ppa
      on ppa.payroll_entry_id = pe.id
     and ppa.company_id = v_company_id
    join (
      select distinct requested.project_id
      from unnest(p_project_ids) as requested(project_id)
    ) requested on requested.project_id = ppa.project_id
    group by pe.id, pe.project_allocated_cost
    having coalesce(sum(ppa.allocation_amount), 0) > pe.project_allocated_cost + 0.01
  ) then
    raise exception 'Project labor cost source exceeds its persisted payroll entry basis'
      using errcode = '55000';
  end if;

  return query
  with requested as (
    select distinct requested.project_id
    from unnest(p_project_ids) as requested(project_id)
  ),
  labor as (
    select
      ppa.project_id,
      round(coalesce(sum(ppa.allocation_amount) filter (where pr.status in ('APPROVED', 'PAID')), 0), 2) as confirmed_labor_cost,
      round(coalesce(sum(ppa.allocation_amount) filter (where pr.status not in ('APPROVED', 'PAID', 'VOID')), 0), 2) as pending_labor_cost,
      count(*) > 0 as has_qualifying_allocations
    from public.payroll_project_allocations ppa
    join public.payroll_entries pe
      on pe.id = ppa.payroll_entry_id
     and pe.company_id = v_company_id
    join public.payroll_runs pr
      on pr.id = pe.payroll_run_id
     and pr.company_id = v_company_id
    join requested
      on requested.project_id = ppa.project_id
    where ppa.company_id = v_company_id
      and coalesce(pe.cost_context ->> 'type', '') not in ('ADMIN_OFFICE', 'GENERAL_OVERHEAD')
    group by ppa.project_id
  )
  select
    requested.project_id,
    upper(c.default_currency),
    coalesce(labor.confirmed_labor_cost, 0),
    coalesce(labor.pending_labor_cost, 0),
    case
      when not coalesce(labor.has_qualifying_allocations, false) then 'ZERO'
      when coalesce(labor.confirmed_labor_cost, 0) + coalesce(labor.pending_labor_cost, 0) = 0 then 'ZERO'
      when upper(p.currency) is distinct from upper(c.default_currency) then 'CURRENCY_CONFLICT'
      else 'AVAILABLE'
    end
  from requested
  join public.companies c on c.id = v_company_id and c.status = 'ACTIVE'
  join public.projects p on p.id = requested.project_id and p.company_id = v_company_id
  left join labor on labor.project_id = requested.project_id
  order by requested.project_id;
end;
$$;

revoke execute on function public.get_project_labor_cost_aggregate(uuid[]) from public, anon, authenticated;
grant execute on function public.get_project_labor_cost_aggregate(uuid[]) to authenticated;

drop function if exists public.list_payroll_project_references(uuid);
create function public.list_payroll_project_references(p_company_id uuid)
returns table(
  id uuid,
  project_code text,
  project_name text,
  status text,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'Authentication is required for payroll project references' using errcode = '42501';
  end if;
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Payroll project references cannot target another HydroQualiSense deployment' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(p_company_id, 'payroll.projectreference.read')) then
    raise exception 'Payroll project reference permission is required' using errcode = '42501';
  end if;

  return query
  select p.id, p.project_code, p.project_name, p.status, p.archived_at
  from public.projects p
  where p.company_id = p_company_id
  order by p.archived_at nulls first, lower(p.project_code), lower(p.project_name), p.id;
end;
$$;

revoke all on function public.list_payroll_project_references(uuid) from public, anon;
grant execute on function public.list_payroll_project_references(uuid) to authenticated;
