-- Payroll needs project identity for assignments, work-entry context, and
-- payroll allocation labels. It must not receive the full Projects workspace
-- merely to populate those references.

insert into public.company_permission_catalog (permission_key, description)
values (
  'payroll.project_reference.read',
  'Read project codes, names, and lifecycle status needed for payroll context.'
)
on conflict (permission_key) do update set description = excluded.description;

insert into public.company_role_permissions (role_key, permission_key)
values
  ('COMPANY_ADMIN', 'payroll.project_reference.read'),
  ('PAYROLL', 'payroll.project_reference.read')
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
  if not (select private.has_company_permission(p_company_id, 'payroll.project_reference.read')) then
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
