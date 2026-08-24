-- Platform-owner access is an explicit database override for company
-- inspection, including suspended/archived companies. Normal memberships
-- still require an ACTIVE company and ACTIVE membership.

create or replace function private.has_company_permission(p_company_id uuid, p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.companies c
    where c.id = p_company_id
      and (
        (select private.is_platform_admin())
        or (
          c.status = 'ACTIVE'
          and exists (
            select 1
            from public.company_members cm
            join public.company_role_permissions crp on crp.role_key = cm.role_key
            where cm.company_id = c.id
              and cm.user_id = (select auth.uid())
              and cm.status = 'ACTIVE'
              and crp.permission_key = p_permission_key
          )
        )
      )
  );
$$;

create or replace function private.legacy_storage_company_id(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[];
  v_user_id uuid;
  v_company_id uuid;
begin
  v_parts := storage.foldername(p_name);
  if coalesce(array_length(v_parts, 1), 0) < 1 then return null; end if;
  begin v_user_id := v_parts[1]::uuid; exception when invalid_text_representation then return null; end;
  select c.id into v_company_id from public.companies c where c.legacy_owner_user_id = v_user_id;
  return v_company_id;
end;
$$;

revoke execute on function private.has_company_permission(uuid, text) from public, anon;
revoke execute on function private.legacy_storage_company_id(text) from public, anon;
grant execute on function private.has_company_permission(uuid, text) to authenticated;
grant execute on function private.legacy_storage_company_id(text) to authenticated;
-- Prefer the explicitly selected company carried by PostgREST request headers.
-- Fall back to the single-company transition rule only when no header exists.
create or replace function private.resolve_transition_company()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_requested text;
  v_company_id uuid;
  v_company_count integer;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    v_requested := coalesce(v_headers ->> 'x-company-id', v_headers ->> 'X-Company-Id');
  exception when others then
    v_requested := null;
  end;

  if nullif(btrim(v_requested), '') is not null then
    begin
      v_company_id := btrim(v_requested)::uuid;
    exception when invalid_text_representation then
      raise exception 'Company context is invalid' using errcode = '22P02';
    end;
    if not ((select private.is_platform_admin()) or (select private.is_active_company_member(v_company_id))) then
      raise exception 'Company context is not authorized for this user' using errcode = '42501';
    end if;
    return v_company_id;
  end if;

  select min(cm.company_id), count(*)::integer
    into v_company_id, v_company_count
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  where cm.user_id = (select auth.uid())
    and cm.status = 'ACTIVE'
    and c.status = 'ACTIVE';

  if v_company_count <> 1 then
    raise exception 'Company context is unavailable or ambiguous; supply company_id explicitly'
      using errcode = '42501';
  end if;
  return v_company_id;
end;
$$;
