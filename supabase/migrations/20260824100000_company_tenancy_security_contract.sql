-- Final security contract for the lead's server/persistence workstream.
-- These names are the stable Data API surface; wrappers retain the internal
-- implementation names so the authorization logic stays in one place.

create or replace function public.get_my_company_access()
returns table(
  company_id uuid,
  company_name text,
  company_code text,
  company_status text,
  membership_id uuid,
  role_key text,
  membership_status text,
  permissions text[],
  is_platform_admin boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_platform_admin boolean := (select private.is_platform_admin());
begin
  if v_user_id is null then
    raise exception 'Authentication is required to load company access' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.name,
    c.company_code,
    c.status,
    cm.id,
    cm.role_key,
    cm.status,
    case
      when v_is_platform_admin then (select array_agg(pc.permission_key order by pc.permission_key) from public.company_permission_catalog pc)
      else coalesce(array_agg(distinct rp.permission_key order by rp.permission_key) filter (where rp.permission_key is not null), '{}'::text[])
    end,
    v_is_platform_admin
  from public.companies c
  left join public.company_members cm
    on cm.company_id = c.id
   and cm.user_id = v_user_id
  left join public.company_role_permissions rp
    on rp.role_key = cm.role_key
  where v_is_platform_admin or cm.user_id is not null
  group by c.id, c.name, c.company_code, c.status, cm.id, cm.role_key, cm.status
  order by c.name, c.id;

  if v_is_platform_admin and not exists (select 1 from public.companies) then
    company_id := null;
    company_name := null;
    company_code := null;
    company_status := null;
    membership_id := null;
    role_key := null;
    membership_status := null;
    permissions := (select array_agg(pc.permission_key order by pc.permission_key) from public.company_permission_catalog pc);
    is_platform_admin := true;
    return next;
  end if;
end;
$$;

create or replace function public.platform_create_company(
  p_name text,
  p_company_code text default null,
  p_default_currency text default 'PHP',
  p_timezone text default 'Asia/Manila'
)
returns public.companies
language sql
security definer
set search_path = ''
as $$ select public.create_company(p_name, p_company_code, p_default_currency, p_timezone); $$;

create or replace function public.platform_update_company(
  p_company_id uuid,
  p_name text default null,
  p_company_code text default null,
  p_default_currency text default null,
  p_timezone text default null
)
returns public.companies
language sql
security definer
set search_path = ''
as $$ select public.update_company(p_company_id, p_name, p_company_code, p_default_currency, p_timezone); $$;

create or replace function public.platform_invite_company_member(
  p_company_id uuid,
  p_email text,
  p_role_key text,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns public.company_invitations
language sql
security definer
set search_path = ''
as $$ select public.invite_company_member(p_company_id, p_email, p_role_key, p_expires_at); $$;

create or replace function public.platform_update_company_member(
  p_membership_id uuid,
  p_role_key text default null,
  p_status text default null
)
returns public.company_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.company_members;
begin
  if not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;
  if p_role_key is null and p_status is null then
    raise exception 'A role or status change is required' using errcode = '22023';
  end if;
  if p_role_key is not null then
    v_member := public.change_company_member_role(p_membership_id, p_role_key);
  end if;
  if p_status is not null then
    case p_status
      when 'ACTIVE' then v_member := public.reactivate_company_member(p_membership_id);
      when 'SUSPENDED' then v_member := public.suspend_company_member(p_membership_id);
      when 'REVOKED' then v_member := public.revoke_company_member(p_membership_id);
      else raise exception 'Invalid membership status' using errcode = '22023';
    end case;
  end if;
  if v_member.id is null then
    select cm.* into v_member from public.company_members cm where cm.id = p_membership_id;
  end if;
  return v_member;
end;
$$;

create or replace function public.platform_list_company_members(p_company_id uuid)
returns setof public.company_members
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;
  return query
  select cm.* from public.company_members cm where cm.company_id = p_company_id order by cm.created_at, cm.id;
end;
$$;

create or replace function public.platform_list_access_audit(p_company_id uuid)
returns setof public.company_audit_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;
  return query
  select ae.* from public.company_audit_events ae where ae.company_id = p_company_id order by ae.created_at desc, ae.id desc;
end;
$$;

create or replace function public.platform_suspend_company(p_company_id uuid)
returns public.companies
language sql
security definer
set search_path = ''
as $$ select public.suspend_company(p_company_id); $$;

create or replace function public.platform_archive_company(p_company_id uuid)
returns public.companies
language sql
security definer
set search_path = ''
as $$ select public.archive_company(p_company_id); $$;

create or replace function public.platform_reactivate_company(p_company_id uuid)
returns public.companies
language sql
security definer
set search_path = ''
as $$ select public.reactivate_company(p_company_id); $$;

grant execute on function public.get_my_company_access() to authenticated;
grant execute on function public.platform_create_company(text, text, text, text) to authenticated;
grant execute on function public.platform_update_company(uuid, text, text, text, text) to authenticated;
grant execute on function public.platform_invite_company_member(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.platform_update_company_member(uuid, text, text) to authenticated;
grant execute on function public.platform_list_company_members(uuid) to authenticated;
grant execute on function public.platform_list_access_audit(uuid) to authenticated;
grant execute on function public.platform_suspend_company(uuid) to authenticated;
grant execute on function public.platform_archive_company(uuid) to authenticated;
grant execute on function public.platform_reactivate_company(uuid) to authenticated;
revoke execute on function public.get_my_company_access() from public, anon;
revoke execute on function public.platform_create_company(text, text, text, text) from public, anon;
revoke execute on function public.platform_update_company(uuid, text, text, text, text) from public, anon;
revoke execute on function public.platform_invite_company_member(uuid, text, text, timestamptz) from public, anon;
revoke execute on function public.platform_update_company_member(uuid, text, text) from public, anon;
revoke execute on function public.platform_list_company_members(uuid) from public, anon;
revoke execute on function public.platform_list_access_audit(uuid) from public, anon;
revoke execute on function public.platform_suspend_company(uuid) from public, anon;
revoke execute on function public.platform_archive_company(uuid) from public, anon;
revoke execute on function public.platform_reactivate_company(uuid) from public, anon;

-- Reassert the exposed-schema security boundary in the final migration.
do $$
declare
  r record;
begin
  for r in select table_name from private.company_tenant_policy_catalog loop
    execute format('alter table public.%I enable row level security', r.table_name);
    execute format('revoke all on table public.%I from anon', r.table_name);
    execute format('grant select on table public.%I to authenticated', r.table_name);
  end loop;
end $$;

drop policy if exists company_access_contract_select on public.invoices;
create policy company_access_contract_select on public.invoices
for select to authenticated
using ((select public.has_company_permission(company_id, 'invoices.read')));

drop policy if exists company_access_contract_companies on public.companies;
create policy company_access_contract_companies on public.companies
for select to authenticated
using ((select private.can_read_company_metadata(id)));

revoke all on table public.platform_admin_allowlist from anon, authenticated;
revoke all on table public.platform_admins from anon;
revoke insert, update, delete on table public.company_members, public.company_invitations, public.company_audit_events from anon, authenticated;
