-- Align the stable RPC contract with the lead's Supabase callers.

drop function if exists public.get_my_company_access();

create function public.get_my_company_access()
returns jsonb
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

  return (
    with member_rows as (
      select
        c.id as company_id,
        c.name as company_name,
        c.company_code,
        c.status as company_status,
        c.default_currency,
        c.timezone,
        c.created_at as company_created_at,
        c.updated_at as company_updated_at,
        cm.id as membership_id,
        cm.user_id,
        cm.role_key,
        cm.status as membership_status,
        cm.joined_at,
        cm.updated_at as membership_updated_at,
        coalesce(
          (select jsonb_agg(rp.permission_key order by rp.permission_key)
           from public.company_role_permissions rp
           where rp.role_key = cm.role_key),
          '[]'::jsonb
        ) as permissions
      from public.companies c
      left join public.company_members cm
        on cm.company_id = c.id
       and cm.user_id = v_user_id
      where v_is_platform_admin or cm.id is not null
    ),
    company_rows as (
      select distinct company_id, company_name, company_code, company_status, default_currency, timezone, company_created_at, company_updated_at
      from member_rows
    )
    select jsonb_build_object(
      'is_platform_owner', v_is_platform_admin,
      'companies', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', cr.company_id,
          'name', cr.company_name,
          'company_code', cr.company_code,
          'status', cr.company_status,
          'default_currency', cr.default_currency,
          'timezone', cr.timezone,
          'created_at', cr.company_created_at,
          'updated_at', cr.company_updated_at
        ) order by cr.company_name, cr.company_id)
        from company_rows cr
      ), '[]'::jsonb),
      'memberships', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', mr.membership_id,
          'company_id', mr.company_id,
          'user_id', mr.user_id,
          'role_key', mr.role_key,
          'status', mr.membership_status,
          'permissions', mr.permissions,
          'joined_at', mr.joined_at,
          'updated_at', mr.membership_updated_at
        ) order by mr.company_name, mr.company_id)
        from member_rows mr
        where mr.membership_id is not null
      ), '[]'::jsonb),
      'permissions_by_company', coalesce((
        select jsonb_object_agg(mr.company_id::text, mr.permissions)
        from member_rows mr
        where mr.membership_id is not null
      ), '{}'::jsonb)
    )
  );
end;
$$;

drop function if exists public.platform_invite_company_member(uuid, text, text, timestamptz);

create function public.platform_invite_company_member(
  p_company_id uuid,
  p_normalized_email text,
  p_role_key text,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns public.company_invitations
language sql
security definer
set search_path = ''
as $$ select public.invite_company_member(p_company_id, p_normalized_email, p_role_key, p_expires_at); $$;

create or replace function public.platform_update_company(
  p_company_id uuid,
  p_name text default null,
  p_status text default null,
  p_default_currency text default null,
  p_timezone text default null,
  p_company_code text default null
)
returns public.companies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
begin
  if not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;
  v_company := public.update_company(p_company_id, p_name, p_company_code, p_default_currency, p_timezone);
  if p_status is null then return v_company; end if;

  case upper(p_status)
    when 'ACTIVE' then v_company := public.reactivate_company(p_company_id);
    when 'SUSPENDED' then v_company := public.suspend_company(p_company_id);
    when 'ARCHIVED' then v_company := public.archive_company(p_company_id);
    else raise exception 'Invalid company status' using errcode = '22023';
  end case;
  return v_company;
end;
$$;

create or replace function public.platform_update_company_member(
  p_company_id uuid default null,
  p_user_id uuid default null,
  p_membership_id uuid default null,
  p_role_key text default null,
  p_status text default null
)
returns public.company_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership_id uuid := p_membership_id;
  v_company_id uuid;
  v_user_id uuid;
begin
  if not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;
  if v_membership_id is null then
    if p_company_id is null or p_user_id is null then
      raise exception 'company_id and user_id or membership_id are required' using errcode = '22023';
    end if;
    select cm.id into v_membership_id
    from public.company_members cm
    where cm.company_id = p_company_id and cm.user_id = p_user_id;
  end if;
  if v_membership_id is null then raise exception 'Membership does not exist' using errcode = '22023'; end if;

  select cm.company_id, cm.user_id into v_company_id, v_user_id
  from public.company_members cm where cm.id = v_membership_id;
  if not found then raise exception 'Membership does not exist' using errcode = '22023'; end if;
  if p_company_id is not null and p_company_id is distinct from v_company_id then raise exception 'Membership is outside the requested company' using errcode = '42501'; end if;
  if p_user_id is not null and p_user_id is distinct from v_user_id then raise exception 'Membership is outside the requested user' using errcode = '42501'; end if;

  return public.platform_update_company_member(v_membership_id, p_role_key, p_status);
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
  select ae.*
  from public.company_audit_events ae
  where p_company_id is null or ae.company_id = p_company_id
  order by ae.created_at desc, ae.id desc;
end;
$$;

revoke execute on function public.get_my_company_access() from public, anon;
revoke execute on function public.platform_invite_company_member(uuid, text, text, timestamptz) from public, anon;
revoke execute on function public.platform_update_company(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.platform_update_company_member(uuid, uuid, uuid, text, text) from public, anon;
revoke execute on function public.platform_list_access_audit(uuid) from public, anon;
grant execute on function public.get_my_company_access() to authenticated;
grant execute on function public.platform_invite_company_member(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.platform_update_company(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.platform_update_company_member(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.platform_list_access_audit(uuid) to authenticated;
