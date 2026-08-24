-- Company-aware RLS and audited access-management RPCs.

create or replace function public.bootstrap_platform_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to bootstrap platform access'
      using errcode = '42501';
  end if;

  select lower(btrim(u.email))
    into v_email
  from auth.users u
  where u.id = v_user_id
    and u.email is not null
    and coalesce(u.email_confirmed_at, u.confirmed_at) is not null;

  if v_email is null or not exists (
    select 1 from public.platform_admin_allowlist pa where pa.normalized_email = v_email
  ) then
    return false;
  end if;

  insert into public.platform_admins (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;
  return true;
end;
$$;
-- Seed the named initial platform owner when that verified account already
-- exists. The RPC below remains necessary if the account is created later.
insert into public.platform_admins (user_id)
select u.id
from auth.users u
join public.platform_admin_allowlist pa on pa.normalized_email = lower(btrim(u.email))
where pa.normalized_email = 'al.matubis17@gmail.com'
  and coalesce(u.email_confirmed_at, u.confirmed_at) is not null
on conflict (user_id) do nothing;

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
declare
  v_company public.companies;
  v_company_id uuid := gen_random_uuid();
  v_company_code text;
  v_currency text := upper(btrim(coalesce(p_default_currency, 'PHP')));
begin
  if not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Company name is required' using errcode = '22023';
  end if;

  v_company_code := lower(btrim(coalesce(nullif(p_company_code, ''), p_name)));
  v_company_code := regexp_replace(v_company_code, '[^a-z0-9]+', '-', 'g');
  v_company_code := btrim(left(v_company_code, 64), '-');
  if v_company_code = '' then
    v_company_code := 'client-' || left(replace(v_company_id::text, '-', ''), 12);
  end if;
  if exists (select 1 from public.companies c where lower(c.company_code) = v_company_code) then
    v_company_code := btrim(left(v_company_code, 49), '-') || '-' || left(replace(v_company_id::text, '-', ''), 14);
  end if;

  insert into public.companies (
    id, name, company_code, status, default_currency, timezone, created_by_user_id
  ) values (
    v_company_id, btrim(p_name), v_company_code, 'ACTIVE', v_currency,
    coalesce(nullif(btrim(p_timezone), ''), 'Asia/Manila'), (select auth.uid())
  ) returning * into v_company;

  perform private.write_company_audit(v_company.id, 'COMPANY_CREATED', 'company', v_company.id, jsonb_build_object('company_code', v_company.company_code));
  return v_company;
end;
$$;

create or replace function public.update_company(
  p_company_id uuid,
  p_name text default null,
  p_company_code text default null,
  p_default_currency text default null,
  p_timezone text default null
)
returns public.companies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
  v_code text;
  v_currency text;
begin
  if not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;
  select * into v_company from public.companies c where c.id = p_company_id for update;
  if not found then raise exception 'Company does not exist' using errcode = '22023'; end if;

  v_code := lower(btrim(coalesce(nullif(p_company_code, ''), v_company.company_code)));
  v_code := regexp_replace(v_code, '[^a-z0-9]+', '-', 'g');
  v_code := btrim(left(v_code, 64), '-');
  v_currency := upper(btrim(coalesce(nullif(p_default_currency, ''), v_company.default_currency)));
  if nullif(btrim(coalesce(p_name, v_company.name)), '') is null then
    raise exception 'Company name is required' using errcode = '22023';
  end if;
  if exists (select 1 from public.companies c where c.id <> p_company_id and lower(c.company_code) = v_code) then
    raise exception 'Company code is already in use' using errcode = '23505';
  end if;

  update public.companies c
  set name = coalesce(nullif(btrim(p_name), ''), c.name),
      company_code = v_code,
      default_currency = v_currency,
      timezone = coalesce(nullif(btrim(p_timezone), ''), c.timezone),
      updated_at = now()
  where c.id = p_company_id
  returning * into v_company;

  perform private.write_company_audit(v_company.id, 'COMPANY_UPDATED', 'company', v_company.id, jsonb_build_object('company_code', v_company.company_code, 'default_currency', v_company.default_currency, 'timezone', v_company.timezone));
  return v_company;
end;
$$;

create or replace function public.suspend_company(p_company_id uuid)
returns public.companies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
begin
  if not (select private.is_platform_admin()) then raise exception 'Platform administrator access is required' using errcode = '42501'; end if;
  update public.companies c set status = 'SUSPENDED', updated_at = now() where c.id = p_company_id returning * into v_company;
  if not found then raise exception 'Company does not exist' using errcode = '22023'; end if;
  perform private.write_company_audit(v_company.id, 'COMPANY_SUSPENDED', 'company', v_company.id);
  return v_company;
end;
$$;

create or replace function public.archive_company(p_company_id uuid)
returns public.companies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
begin
  if not (select private.is_platform_admin()) then raise exception 'Platform administrator access is required' using errcode = '42501'; end if;
  update public.companies c set status = 'ARCHIVED', archived_at = coalesce(c.archived_at, now()), updated_at = now() where c.id = p_company_id returning * into v_company;
  if not found then raise exception 'Company does not exist' using errcode = '22023'; end if;
  perform private.write_company_audit(v_company.id, 'COMPANY_ARCHIVED', 'company', v_company.id);
  return v_company;
end;
$$;

create or replace function public.reactivate_company(p_company_id uuid)
returns public.companies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
begin
  if not (select private.is_platform_admin()) then raise exception 'Platform administrator access is required' using errcode = '42501'; end if;
  select * into v_company from public.companies c where c.id = p_company_id for update;
  if not found then raise exception 'Company does not exist' using errcode = '22023'; end if;
  if v_company.status = 'ARCHIVED' then raise exception 'Archived companies are not reactivated; create a new company or use a controlled data decision' using errcode = '42501'; end if;
  update public.companies c set status = 'ACTIVE', updated_at = now() where c.id = p_company_id returning * into v_company;
  perform private.write_company_audit(v_company.id, 'COMPANY_REACTIVATED', 'company', v_company.id);
  return v_company;
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
  if not (select private.is_platform_admin()) then raise exception 'Platform administrator access is required' using errcode = '42501'; end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id and c.status = 'ACTIVE') then raise exception 'Only active companies can receive invitations' using errcode = '42501'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'A valid invitation email is required' using errcode = '22023'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'Invitation expiry must be in the future' using errcode = '22023'; end if;
  if not exists (select 1 from public.company_role_catalog rc where rc.role_key = p_role_key and rc.assignable and not rc.is_platform_role) then raise exception 'Role is not assignable' using errcode = '22023'; end if;
  if exists (
    select 1 from public.company_members cm join auth.users u on u.id = cm.user_id
    where cm.company_id = p_company_id and cm.status = 'ACTIVE' and lower(btrim(u.email)) = v_email
  ) then
    raise exception 'That email already has active access to the company' using errcode = '23505';
  end if;

  insert into public.company_invitations (
    company_id, normalized_email, role_key, status, invited_by_user_id, expires_at
  ) values (
    p_company_id, v_email, p_role_key, 'PENDING', (select auth.uid()), p_expires_at
  ) returning * into v_invitation;

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
begin
  if not (select private.is_platform_admin()) then raise exception 'Platform administrator access is required' using errcode = '42501'; end if;
  if not exists (select 1 from public.company_role_catalog rc where rc.role_key = p_role_key and rc.assignable and not rc.is_platform_role) then raise exception 'Role is not assignable' using errcode = '22023'; end if;
  update public.company_members cm set role_key = p_role_key, updated_at = now() where cm.id = p_membership_id returning * into v_member;
  if not found then raise exception 'Membership does not exist' using errcode = '22023'; end if;
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
begin
  if not (select private.is_platform_admin()) then raise exception 'Platform administrator access is required' using errcode = '42501'; end if;
  if p_status not in ('ACTIVE', 'SUSPENDED', 'REVOKED') then raise exception 'Invalid membership status' using errcode = '22023'; end if;
  update public.company_members cm set status = p_status, updated_at = now() where cm.id = p_membership_id returning * into v_member;
  if not found then raise exception 'Membership does not exist' using errcode = '22023'; end if;
  perform private.write_company_audit(v_member.company_id, p_event_type, 'membership', v_member.id, jsonb_build_object('status', v_member.status, 'user_id', v_member.user_id));
  return v_member;
end;
$$;

create or replace function public.suspend_company_member(p_membership_id uuid)
returns public.company_members
language sql
security definer
set search_path = ''
as $$ select private.set_company_member_status(p_membership_id, 'SUSPENDED', 'MEMBER_SUSPENDED'); $$;

create or replace function public.reactivate_company_member(p_membership_id uuid)
returns public.company_members
language sql
security definer
set search_path = ''
as $$ select private.set_company_member_status(p_membership_id, 'ACTIVE', 'MEMBER_REACTIVATED'); $$;

create or replace function public.revoke_company_member(p_membership_id uuid)
returns public.company_members
language sql
security definer
set search_path = ''
as $$ select private.set_company_member_status(p_membership_id, 'REVOKED', 'MEMBER_REVOKED'); $$;

create or replace function public.revoke_company_invitation(p_invitation_id uuid)
returns public.company_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.company_invitations;
begin
  if not (select private.is_platform_admin()) then raise exception 'Platform administrator access is required' using errcode = '42501'; end if;
  update public.company_invitations ci set status = 'REVOKED' where ci.id = p_invitation_id and ci.status = 'PENDING' returning * into v_invitation;
  if not found then raise exception 'Pending invitation does not exist' using errcode = '22023'; end if;
  perform private.write_company_audit(v_invitation.company_id, 'INVITE_REVOKED', 'invitation', v_invitation.id, jsonb_build_object('normalized_email', v_invitation.normalized_email));
  return v_invitation;
end;
$$;

create or replace function public.claim_company_invitations()
returns table(company_id uuid, membership_id uuid, role_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text := private.current_verified_email();
  invitation_row record;
  v_membership_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication is required to claim invitations' using errcode = '42501'; end if;
  if v_email is null then return; end if;

  update public.company_invitations ci
  set status = 'EXPIRED'
  where ci.normalized_email = v_email
    and ci.status = 'PENDING'
    and ci.expires_at is not null
    and ci.expires_at <= now();

  for invitation_row in
    select ci.id, ci.company_id, ci.role_key
    from public.company_invitations ci
    join public.companies c on c.id = ci.company_id
    where ci.normalized_email = v_email
      and ci.status = 'PENDING'
      and (ci.expires_at is null or ci.expires_at > now())
      and c.status = 'ACTIVE'
    for update of ci
  loop
    insert into public.company_members (
      company_id, user_id, role_key, status, invited_by_user_id, joined_at
    ) values (
      invitation_row.company_id, v_user_id, invitation_row.role_key, 'ACTIVE', null, now()
    )
    on conflict (company_id, user_id) do update set
      role_key = excluded.role_key,
      status = 'ACTIVE',
      joined_at = coalesce(public.company_members.joined_at, excluded.joined_at),
      updated_at = now()
    returning id into v_membership_id;

    update public.company_invitations ci
    set status = 'ACCEPTED', accepted_by_user_id = v_user_id, accepted_at = now()
    where ci.id = invitation_row.id;

    perform private.write_company_audit(invitation_row.company_id, 'INVITE_ACCEPTED', 'invitation', invitation_row.id, jsonb_build_object('membership_id', v_membership_id, 'role_key', invitation_row.role_key));
    company_id := invitation_row.company_id;
    membership_id := v_membership_id;
    role_key := invitation_row.role_key;
    return next;
  end loop;
end;
$$;

grant execute on function public.bootstrap_platform_admin() to authenticated;
grant execute on function public.create_company(text, text, text, text) to authenticated;
grant execute on function public.update_company(uuid, text, text, text, text) to authenticated;
grant execute on function public.suspend_company(uuid) to authenticated;
grant execute on function public.archive_company(uuid) to authenticated;
grant execute on function public.reactivate_company(uuid) to authenticated;
grant execute on function public.invite_company_member(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.change_company_member_role(uuid, text) to authenticated;
grant execute on function public.suspend_company_member(uuid) to authenticated;
grant execute on function public.reactivate_company_member(uuid) to authenticated;
grant execute on function public.revoke_company_member(uuid) to authenticated;
grant execute on function public.revoke_company_invitation(uuid) to authenticated;
grant execute on function public.claim_company_invitations() to authenticated;
revoke execute on function public.bootstrap_platform_admin() from public, anon;
revoke execute on function public.create_company(text, text, text, text) from public, anon;
revoke execute on function public.update_company(uuid, text, text, text, text) from public, anon;
revoke execute on function public.suspend_company(uuid) from public, anon;
revoke execute on function public.archive_company(uuid) from public, anon;
revoke execute on function public.reactivate_company(uuid) from public, anon;
revoke execute on function public.invite_company_member(uuid, text, text, timestamptz) from public, anon;
revoke execute on function public.change_company_member_role(uuid, text) from public, anon;
revoke execute on function public.suspend_company_member(uuid) from public, anon;
revoke execute on function public.reactivate_company_member(uuid) from public, anon;
revoke execute on function public.revoke_company_member(uuid) from public, anon;
revoke execute on function public.revoke_company_invitation(uuid) from public, anon;
revoke execute on function public.claim_company_invitations() from public, anon;
revoke execute on function private.set_company_member_status(uuid, text, text) from public, anon, authenticated;

-- Replace all user-only policies. The catalog is the single table-level
-- permission map; row authorization is always company_id plus active role.
do $$
declare
  r record;
begin
  for r in select * from private.company_tenant_policy_catalog loop
    execute format('alter table public.%I enable row level security', r.table_name);
    execute format('drop policy if exists %I on public.%I', r.table_name || '_select_own', r.table_name);
    execute format('drop policy if exists %I on public.%I', r.table_name || '_insert_own', r.table_name);
    execute format('drop policy if exists %I on public.%I', r.table_name || '_update_own', r.table_name);
    execute format('drop policy if exists %I on public.%I', r.table_name || '_delete_own', r.table_name);
    execute format('drop policy if exists %I on public.%I', r.table_name || '_company_select', r.table_name);
    execute format('drop policy if exists %I on public.%I', r.table_name || '_company_insert', r.table_name);
    execute format('drop policy if exists %I on public.%I', r.table_name || '_company_update', r.table_name);
    execute format('drop policy if exists %I on public.%I', r.table_name || '_company_delete', r.table_name);

    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.has_company_permission(company_id, %L)))',
      r.table_name || '_company_select', r.table_name, r.read_permission
    );
    if r.allow_insert then
      execute format(
        'create policy %I on public.%I for insert to authenticated with check ((select public.has_company_permission(company_id, %L)))',
        r.table_name || '_company_insert', r.table_name, r.write_permission
      );
    end if;
    if r.allow_update then
      execute format(
        'create policy %I on public.%I for update to authenticated using ((select public.has_company_permission(company_id, %L))) with check ((select public.has_company_permission(company_id, %L)))',
        r.table_name || '_company_update', r.table_name, r.write_permission, r.write_permission
      );
    end if;
    if r.allow_delete then
      execute format(
        'create policy %I on public.%I for delete to authenticated using ((select public.has_company_permission(company_id, %L)))',
        r.table_name || '_company_delete', r.table_name, r.write_permission
      );
    end if;

    execute format('revoke all on table public.%I from anon, authenticated', r.table_name);
    execute format('grant select on table public.%I to authenticated', r.table_name);
    if r.allow_insert then execute format('grant insert on table public.%I to authenticated', r.table_name); end if;
    if r.allow_update then execute format('grant update on table public.%I to authenticated', r.table_name); end if;
    if r.allow_delete then execute format('grant delete on table public.%I to authenticated', r.table_name); end if;
  end loop;
end $$;

alter table public.companies enable row level security;
alter table public.company_role_catalog enable row level security;
alter table public.company_permission_catalog enable row level security;
alter table public.company_role_permissions enable row level security;
alter table public.platform_admin_allowlist enable row level security;
alter table public.platform_admins enable row level security;
alter table public.company_members enable row level security;
alter table public.company_invitations enable row level security;
alter table public.company_audit_events enable row level security;

revoke all on table public.companies, public.company_role_catalog, public.company_permission_catalog, public.company_role_permissions,
  public.platform_admin_allowlist, public.platform_admins, public.company_members, public.company_invitations, public.company_audit_events
from anon, authenticated;
grant select on table public.companies, public.company_role_catalog, public.company_permission_catalog, public.company_role_permissions, public.company_members, public.company_invitations, public.company_audit_events to authenticated;

drop policy if exists companies_metadata_select on public.companies;
create policy companies_metadata_select on public.companies for select to authenticated
using ((select private.can_read_company_metadata(id)));

drop policy if exists company_role_catalog_select on public.company_role_catalog;
create policy company_role_catalog_select on public.company_role_catalog for select to authenticated using (true);
drop policy if exists company_permission_catalog_select on public.company_permission_catalog;
create policy company_permission_catalog_select on public.company_permission_catalog for select to authenticated using (true);
drop policy if exists company_role_permissions_select on public.company_role_permissions;
create policy company_role_permissions_select on public.company_role_permissions for select to authenticated using (true);

drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins for select to authenticated
using ((select public.is_platform_admin()));

drop policy if exists company_members_select on public.company_members;
create policy company_members_select on public.company_members for select to authenticated
using (
  (select public.is_platform_admin())
  or user_id = (select auth.uid())
  or (select public.has_company_permission(company_id, 'company.members.read'))
);

drop policy if exists company_invitations_select on public.company_invitations;
create policy company_invitations_select on public.company_invitations for select to authenticated
using (
  (select public.is_platform_admin())
  or (status = 'PENDING' and normalized_email = (select private.current_verified_email()))
);

drop policy if exists company_audit_events_select on public.company_audit_events;
create policy company_audit_events_select on public.company_audit_events for select to authenticated
using (
  (select public.is_platform_admin())
  or (select public.has_company_permission(company_id, 'company.members.read'))
);
