-- Engoryx deployment tenancy model:
-- one deployed application + one Supabase project = one client company.
--
-- company_id remains on business rows and Storage paths as defense in depth.
-- This migration removes runtime tenant selection without destructively
-- rewriting historical company-scoped data.

create table if not exists public.deployment_configuration (
  singleton boolean primary key default true check (singleton),
  company_id uuid not null unique references public.companies(id) on delete restrict,
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on table public.deployment_configuration from public, anon, authenticated;

-- Backward-compatible upgrade: configure automatically only when there is
-- exactly one ACTIVE company. Never select an arbitrary row from an ambiguous
-- legacy multi-company database.
do $$
declare
  v_count integer;
  v_company_id uuid;
begin
  if not exists (select 1 from public.deployment_configuration) then
    select count(*)::integer into v_count from public.companies where status = 'ACTIVE';
    if v_count = 1 then
      select id into v_company_id from public.companies where status = 'ACTIVE';
      insert into public.deployment_configuration (singleton, company_id)
      values (true, v_company_id)
      on conflict (singleton) do nothing;
    end if;
  end if;
end $$;

insert into public.company_permission_catalog (permission_key, description)
values ('company.members.manage', 'Invite, change roles, suspend, reactivate, and revoke members of the deployment company.')
on conflict (permission_key) do update set description = excluded.description;

insert into public.company_role_permissions (role_key, permission_key)
values ('COMPANY_ADMIN', 'company.members.manage')
on conflict do nothing;

create or replace function private.deployment_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select dc.company_id
  from public.deployment_configuration dc
  where dc.singleton = true;
$$;

revoke execute on function private.deployment_company_id() from public, anon;
grant execute on function private.deployment_company_id() to authenticated;

create or replace function public.get_deployment_company_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_active_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to resolve the Engoryx deployment company' using errcode = '42501';
  end if;

  v_company_id := (select private.deployment_company_id());
  if v_company_id is not null then return v_company_id; end if;

  select count(*)::integer into v_active_count from public.companies where status = 'ACTIVE';
  if v_active_count = 0 then
    raise exception 'Engoryx deployment company is not configured; provision exactly one client company for this deployment'
      using errcode = '55000';
  end if;
  raise exception 'Engoryx deployment company is ambiguous; multiple active companies exist and no deployment company is configured'
    using errcode = '55000';
end;
$$;

revoke execute on function public.get_deployment_company_id() from public, anon;
grant execute on function public.get_deployment_company_id() to authenticated;

create or replace function private.is_active_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_company_id is not null
     and p_company_id = (select private.deployment_company_id())
     and exists (
       select 1
       from public.company_members cm
       join public.companies c on c.id = cm.company_id
       where cm.company_id = p_company_id
         and cm.user_id = (select auth.uid())
         and cm.status = 'ACTIVE'
         and c.status = 'ACTIVE'
     );
$$;

create or replace function private.can_read_company_metadata(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_company_id is not null
     and p_company_id = (select private.deployment_company_id())
     and (
       (select private.is_platform_admin())
       or exists (
         select 1 from public.company_members cm
         where cm.company_id = p_company_id
           and cm.user_id = (select auth.uid())
       )
     );
$$;

-- Platform ownership no longer grants business-data access to arbitrary
-- companies. Business authorization is always deployment company + membership
-- + role permission.
create or replace function private.has_company_permission(p_company_id uuid, p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_company_id is not null
     and p_company_id = (select private.deployment_company_id())
     and exists (
       select 1
       from public.companies c
       join public.company_members cm on cm.company_id = c.id
       join public.company_role_permissions crp on crp.role_key = cm.role_key
       where c.id = p_company_id
         and c.status = 'ACTIVE'
         and cm.user_id = (select auth.uid())
         and cm.status = 'ACTIVE'
         and crp.permission_key = p_permission_key
     );
$$;

-- Compatibility helper used by legacy insert/update RPCs. An X-Company-Id
-- header may confirm the deployment company, but it can never choose another
-- company. Missing headers resolve deterministically to the deployment company.
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
  v_requested_id uuid;
  v_company_id uuid := (select private.deployment_company_id());
begin
  if v_company_id is null then
    raise exception 'Engoryx deployment company is not configured' using errcode = '55000';
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    v_requested := coalesce(v_headers ->> 'x-company-id', v_headers ->> 'X-Company-Id');
  exception when others then
    v_requested := null;
  end;

  if nullif(btrim(v_requested), '') is not null then
    begin
      v_requested_id := btrim(v_requested)::uuid;
    exception when invalid_text_representation then
      raise exception 'Company context is invalid' using errcode = '22P02';
    end;
    if v_requested_id is distinct from v_company_id then
      raise exception 'Company context cannot target another Engoryx deployment' using errcode = '42501';
    end if;
  end if;

  if not (select private.is_active_company_member(v_company_id)) then
    raise exception 'The current user is not an active member of this Engoryx deployment company' using errcode = '42501';
  end if;
  return v_company_id;
end;
$$;

-- Access bootstrap now returns only the configured deployment company and the
-- current user's membership in that company. Global platform-owner state is
-- deliberately not projected into the client application.
drop function if exists public.get_my_company_access();
create function public.get_my_company_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to load company access' using errcode = '42501';
  end if;
  v_company_id := public.get_deployment_company_id();

  return (
    select jsonb_build_object(
      'is_platform_owner', false,
      'companies', jsonb_build_array(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'company_code', c.company_code,
        'status', c.status,
        'default_currency', c.default_currency,
        'timezone', c.timezone,
        'created_at', c.created_at,
        'updated_at', c.updated_at
      )),
      'memberships', case when cm.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
        'id', cm.id,
        'company_id', cm.company_id,
        'user_id', cm.user_id,
        'role_key', cm.role_key,
        'status', cm.status,
        'permissions', coalesce((
          select jsonb_agg(rp.permission_key order by rp.permission_key)
          from public.company_role_permissions rp
          where rp.role_key = cm.role_key
        ), '[]'::jsonb),
        'joined_at', cm.joined_at,
        'updated_at', cm.updated_at
      )) end,
      'permissions_by_company', case when cm.id is null then '{}'::jsonb else jsonb_build_object(
        c.id::text,
        coalesce((
          select jsonb_agg(rp.permission_key order by rp.permission_key)
          from public.company_role_permissions rp
          where rp.role_key = cm.role_key
        ), '[]'::jsonb)
      ) end
    )
    from public.companies c
    left join public.company_members cm
      on cm.company_id = c.id and cm.user_id = v_user_id
    where c.id = v_company_id
  );
end;
$$;

-- Invitation claiming is restricted to the deployment company even if stale
-- invitations for another historical company remain in the database.
create or replace function public.claim_company_invitations()
returns table(company_id uuid, membership_id uuid, role_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text := private.current_verified_email();
  v_company_id uuid := (select private.deployment_company_id());
  invitation_row record;
  v_membership_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication is required to claim invitations' using errcode = '42501'; end if;
  if v_company_id is null then raise exception 'Engoryx deployment company is not configured' using errcode = '55000'; end if;
  if v_email is null then return; end if;

  update public.company_invitations ci
  set status = 'EXPIRED', updated_at = now()
  where ci.company_id = v_company_id
    and ci.normalized_email = v_email
    and ci.status = 'PENDING'
    and ci.expires_at is not null
    and ci.expires_at <= now();

  for invitation_row in
    select ci.id, ci.company_id, ci.role_key
    from public.company_invitations ci
    join public.companies c on c.id = ci.company_id
    where ci.company_id = v_company_id
      and ci.normalized_email = v_email
      and ci.status = 'PENDING'
      and (ci.expires_at is null or ci.expires_at > now())
      and c.status = 'ACTIVE'
    for update of ci
  loop
    insert into public.company_members as existing (
      company_id, user_id, role_key, status, invited_by_user_id, joined_at
    ) values (
      invitation_row.company_id, v_user_id, invitation_row.role_key, 'ACTIVE', null, now()
    )
    on conflict (company_id, user_id) do update set
      role_key = excluded.role_key,
      status = 'ACTIVE',
      joined_at = coalesce(existing.joined_at, excluded.joined_at),
      updated_at = now()
    returning id into v_membership_id;

    update public.company_invitations ci
    set status = 'ACCEPTED', accepted_by_user_id = v_user_id, accepted_at = now(), updated_at = now()
    where ci.id = invitation_row.id;

    perform private.write_company_audit(invitation_row.company_id, 'INVITE_ACCEPTED', 'invitation', invitation_row.id, jsonb_build_object('membership_id', v_membership_id, 'role_key', invitation_row.role_key));
    company_id := invitation_row.company_id;
    membership_id := v_membership_id;
    role_key := invitation_row.role_key;
    return next;
  end loop;
end;
$$;

-- Additional company creation is not an authenticated client operation.
create or replace function public.create_company(
  p_name text,
  p_company_code text default null,
  p_default_currency text default 'PHP',
  p_timezone text default 'Asia/Manila'
)
returns public.companies
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Creating additional companies is disabled in a single-company Engoryx deployment; provision a separate deployment instead'
    using errcode = '42501';
end;
$$;

create or replace function public.platform_create_company(
  p_name text,
  p_company_code text default null,
  p_default_currency text default 'PHP',
  p_timezone text default 'Asia/Manila'
)
returns public.companies
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Creating additional companies is disabled in a single-company Engoryx deployment; provision a separate deployment instead'
    using errcode = '42501';
end;
$$;

create or replace function public.invite_company_member(
  p_company_id uuid,
  p_email text,
  p_role_key text,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns public.company_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.company_invitations;
  v_email text := lower(btrim(p_email));
begin
  if not (select private.has_company_permission(p_company_id, 'company.members.manage')) then
    raise exception 'Company access-management permission is required' using errcode = '42501';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'A valid invitation email is required' using errcode = '22023'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'Invitation expiry must be in the future' using errcode = '22023'; end if;
  if not exists (select 1 from public.company_role_catalog rc where rc.role_key = p_role_key and rc.assignable and not rc.is_platform_role) then raise exception 'Role is not assignable' using errcode = '22023'; end if;
  if exists (
    select 1 from public.company_members cm join auth.users u on u.id = cm.user_id
    where cm.company_id = p_company_id and cm.status = 'ACTIVE' and lower(btrim(u.email)) = v_email
  ) then raise exception 'That email already has active access to the company' using errcode = '23505'; end if;

  insert into public.company_invitations (company_id, normalized_email, role_key, status, invited_by_user_id, expires_at)
  values (p_company_id, v_email, p_role_key, 'PENDING', (select auth.uid()), p_expires_at)
  returning * into v_invitation;
  perform private.write_company_audit(v_invitation.company_id, 'USER_INVITED', 'invitation', v_invitation.id, jsonb_build_object('normalized_email', v_invitation.normalized_email, 'role_key', v_invitation.role_key, 'expires_at', v_invitation.expires_at));
  return v_invitation;
end;
$$;

create or replace function public.change_company_member_role(p_membership_id uuid, p_role_key text)
returns public.company_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.company_members;
  v_company_id uuid;
begin
  select cm.company_id into v_company_id from public.company_members cm where cm.id = p_membership_id;
  if not found then raise exception 'Membership does not exist' using errcode = '22023'; end if;
  if not (select private.has_company_permission(v_company_id, 'company.members.manage')) then raise exception 'Company access-management permission is required' using errcode = '42501'; end if;
  if not exists (select 1 from public.company_role_catalog rc where rc.role_key = p_role_key and rc.assignable and not rc.is_platform_role) then raise exception 'Role is not assignable' using errcode = '22023'; end if;
  update public.company_members cm set role_key = p_role_key, updated_at = now() where cm.id = p_membership_id returning * into v_member;
  perform private.write_company_audit(v_member.company_id, 'MEMBER_ROLE_CHANGED', 'membership', v_member.id, jsonb_build_object('role_key', v_member.role_key, 'user_id', v_member.user_id));
  return v_member;
end;
$$;

create or replace function private.set_company_member_status(p_membership_id uuid, p_status text, p_event_type text)
returns public.company_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.company_members;
  v_company_id uuid;
begin
  select cm.company_id into v_company_id from public.company_members cm where cm.id = p_membership_id;
  if not found then raise exception 'Membership does not exist' using errcode = '22023'; end if;
  if not (select private.has_company_permission(v_company_id, 'company.members.manage')) then raise exception 'Company access-management permission is required' using errcode = '42501'; end if;
  if p_status not in ('ACTIVE', 'SUSPENDED', 'REVOKED') then raise exception 'Invalid membership status' using errcode = '22023'; end if;
  update public.company_members cm set status = p_status, updated_at = now() where cm.id = p_membership_id returning * into v_member;
  perform private.write_company_audit(v_member.company_id, p_event_type, 'membership', v_member.id, jsonb_build_object('status', v_member.status, 'user_id', v_member.user_id));
  return v_member;
end;
$$;

create or replace function public.revoke_company_invitation(p_invitation_id uuid)
returns public.company_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.company_invitations;
  v_company_id uuid;
begin
  select ci.company_id into v_company_id from public.company_invitations ci where ci.id = p_invitation_id and ci.status = 'PENDING';
  if not found then raise exception 'Pending invitation does not exist' using errcode = '22023'; end if;
  if not (select private.has_company_permission(v_company_id, 'company.members.manage')) then raise exception 'Company access-management permission is required' using errcode = '42501'; end if;
  update public.company_invitations ci set status = 'REVOKED', updated_at = now() where ci.id = p_invitation_id returning * into v_invitation;
  perform private.write_company_audit(v_invitation.company_id, 'INVITE_REVOKED', 'invitation', v_invitation.id, jsonb_build_object('normalized_email', v_invitation.normalized_email));
  return v_invitation;
end;
$$;

create or replace function public.platform_invite_company_member(
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

drop function if exists public.platform_list_company_member_directory(uuid);
create function public.platform_list_company_member_directory(p_company_id uuid)
returns table(
  id uuid,
  company_id uuid,
  user_id uuid,
  email text,
  display_name text,
  role_key text,
  status text,
  joined_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not ((select private.has_company_permission(p_company_id, 'company.members.read')) or (select private.has_company_permission(p_company_id, 'company.members.manage'))) then
    raise exception 'Company member-directory permission is required' using errcode = '42501';
  end if;
  return query
  select cm.id, cm.company_id, cm.user_id, u.email::text, coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')::text,
         cm.role_key, cm.status, cm.joined_at, cm.updated_at
  from public.company_members cm
  left join auth.users u on u.id = cm.user_id
  where cm.company_id = p_company_id
  order by lower(coalesce(u.email, '')), cm.id;
end;
$$;

drop function if exists public.platform_list_company_invitations(uuid);
create function public.platform_list_company_invitations(p_company_id uuid)
returns setof public.company_invitations
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not ((select private.has_company_permission(p_company_id, 'company.members.read')) or (select private.has_company_permission(p_company_id, 'company.members.manage'))) then
    raise exception 'Company invitation-list permission is required' using errcode = '42501';
  end if;
  return query
  select ci.* from public.company_invitations ci where ci.company_id = p_company_id order by ci.created_at desc, ci.id desc;
end;
$$;

create or replace function public.platform_list_access_audit(p_company_id uuid)
returns setof public.company_audit_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_company_id is null then raise exception 'Deployment company is required' using errcode = '22023'; end if;
  if not ((select private.has_company_permission(p_company_id, 'company.members.read')) or (select private.has_company_permission(p_company_id, 'company.members.manage'))) then
    raise exception 'Company access-audit permission is required' using errcode = '42501';
  end if;
  return query
  select ae.* from public.company_audit_events ae where ae.company_id = p_company_id order by ae.created_at desc, ae.id desc;
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
  v_member public.company_members;
begin
  if v_membership_id is null then
    if p_company_id is null or p_user_id is null then raise exception 'company_id and user_id or membership_id are required' using errcode = '22023'; end if;
    select cm.id into v_membership_id from public.company_members cm where cm.company_id = p_company_id and cm.user_id = p_user_id;
  end if;
  if v_membership_id is null then raise exception 'Membership does not exist' using errcode = '22023'; end if;
  select cm.company_id, cm.user_id into v_company_id, v_user_id from public.company_members cm where cm.id = v_membership_id;
  if not found then raise exception 'Membership does not exist' using errcode = '22023'; end if;
  if p_company_id is not null and p_company_id is distinct from v_company_id then raise exception 'Membership is outside the deployment company' using errcode = '42501'; end if;
  if p_user_id is not null and p_user_id is distinct from v_user_id then raise exception 'Membership is outside the requested user' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'company.members.manage')) then raise exception 'Company access-management permission is required' using errcode = '42501'; end if;
  if p_role_key is null and p_status is null then raise exception 'A role or status change is required' using errcode = '22023'; end if;
  if p_role_key is not null then v_member := public.change_company_member_role(v_membership_id, p_role_key); end if;
  if p_status is not null then
    case p_status
      when 'ACTIVE' then v_member := public.reactivate_company_member(v_membership_id);
      when 'SUSPENDED' then v_member := public.suspend_company_member(v_membership_id);
      when 'REVOKED' then v_member := public.revoke_company_member(v_membership_id);
      else raise exception 'Invalid membership status' using errcode = '22023';
    end case;
  end if;
  return v_member;
end;
$$;

revoke execute on function public.get_my_company_access() from public, anon;
revoke execute on function public.claim_company_invitations() from public, anon;
revoke execute on function public.create_company(text, text, text, text) from public, anon;
revoke execute on function public.platform_create_company(text, text, text, text) from public, anon;
revoke execute on function public.invite_company_member(uuid, text, text, timestamptz) from public, anon;
revoke execute on function public.change_company_member_role(uuid, text) from public, anon;
revoke execute on function public.revoke_company_invitation(uuid) from public, anon;
revoke execute on function public.platform_invite_company_member(uuid, text, text, timestamptz) from public, anon;
revoke execute on function public.platform_list_company_member_directory(uuid) from public, anon;
revoke execute on function public.platform_list_company_invitations(uuid) from public, anon;
revoke execute on function public.platform_list_access_audit(uuid) from public, anon;
revoke execute on function public.platform_update_company_member(uuid, uuid, uuid, text, text) from public, anon;

grant execute on function public.get_my_company_access() to authenticated;
grant execute on function public.claim_company_invitations() to authenticated;
grant execute on function public.invite_company_member(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.change_company_member_role(uuid, text) to authenticated;
grant execute on function public.revoke_company_invitation(uuid) to authenticated;
grant execute on function public.platform_invite_company_member(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.platform_list_company_member_directory(uuid) to authenticated;
grant execute on function public.platform_list_company_invitations(uuid) to authenticated;
grant execute on function public.platform_list_access_audit(uuid) to authenticated;
grant execute on function public.platform_update_company_member(uuid, uuid, uuid, text, text) to authenticated;
