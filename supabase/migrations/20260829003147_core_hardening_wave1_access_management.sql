-- Engoryx Core Hardening Wave 1: company profile, real invitation delivery,
-- and membership-level permission overrides.
--
-- This migration is additive and preserves company/membership/audit history.
-- Roles remain the baseline preset. The override tables are intentionally
-- write-closed to browser roles; the guarded RPCs below are the authority.

alter table public.company_permission_catalog
  add column if not exists member_assignable boolean not null default true;

alter table public.company_permission_catalog
  drop constraint if exists company_permission_catalog_member_assignable_check;
alter table public.company_permission_catalog
  add constraint company_permission_catalog_member_assignable_check
  check (not (permission_key like 'platform.%' and member_assignable));

-- Company membership-management and company-settings capabilities remain role
-- controlled. A member override may customize operational permissions, but it
-- cannot manufacture another administrator or platform capability.
update public.company_permission_catalog
set member_assignable = false
where permission_key like 'platform.%'
   or permission_key in ('company.members.manage', 'company.settings.manage');

alter table public.company_invitations
  add column if not exists delivery_status text not null default 'CREATED',
  add column if not exists delivery_error text,
  add column if not exists sent_at timestamptz;

update public.company_invitations
set expires_at = coalesce(expires_at, created_at + interval '7 days')
where expires_at is null;

alter table public.company_invitations
  alter column expires_at set not null;

alter table public.company_invitations
  drop constraint if exists company_invitations_delivery_status_check;
alter table public.company_invitations
  add constraint company_invitations_delivery_status_check
  check (delivery_status in ('CREATED', 'SENT', 'FAILED'));

alter table public.company_invitations
  drop constraint if exists company_invitations_delivery_error_length_check;
alter table public.company_invitations
  add constraint company_invitations_delivery_error_length_check
  check (delivery_error is null or length(delivery_error) <= 500);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_members_company_id_id_key'
      and conrelid = 'public.company_members'::regclass
  ) then
    alter table public.company_members
      add constraint company_members_company_id_id_key unique (company_id, id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_invitations_company_id_id_key'
      and conrelid = 'public.company_invitations'::regclass
  ) then
    alter table public.company_invitations
      add constraint company_invitations_company_id_id_key unique (company_id, id);
  end if;
end $$;

create table if not exists public.company_member_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  membership_id uuid not null,
  permission_key text not null references public.company_permission_catalog(permission_key) on update restrict,
  effect text not null check (effect in ('GRANT', 'DENY')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (membership_id, permission_key),
  foreign key (company_id, membership_id)
    references public.company_members(company_id, id)
    on delete cascade
);

create index if not exists company_member_permission_overrides_company_member_idx
  on public.company_member_permission_overrides (company_id, membership_id, permission_key);

create table if not exists public.company_invitation_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  invitation_id uuid not null,
  permission_key text not null references public.company_permission_catalog(permission_key) on update restrict,
  effect text not null check (effect in ('GRANT', 'DENY')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invitation_id, permission_key),
  foreign key (company_id, invitation_id)
    references public.company_invitations(company_id, id)
    on delete cascade
);

create index if not exists company_invitation_permission_overrides_company_invitation_idx
  on public.company_invitation_permission_overrides (company_id, invitation_id, permission_key);

drop trigger if exists company_member_permission_overrides_updated_at
  on public.company_member_permission_overrides;
create trigger company_member_permission_overrides_updated_at
before update on public.company_member_permission_overrides
for each row execute function private.set_company_updated_at();

drop trigger if exists company_invitation_permission_overrides_updated_at
  on public.company_invitation_permission_overrides;
create trigger company_invitation_permission_overrides_updated_at
before update on public.company_invitation_permission_overrides
for each row execute function private.set_company_updated_at();

alter table public.company_member_permission_overrides enable row level security;
alter table public.company_invitation_permission_overrides enable row level security;
revoke all on table public.company_member_permission_overrides,
  public.company_invitation_permission_overrides from public, anon, authenticated;
grant select on table public.company_member_permission_overrides to authenticated;
drop policy if exists company_member_permission_overrides_select on public.company_member_permission_overrides;
create policy company_member_permission_overrides_select
on public.company_member_permission_overrides for select to authenticated
using (
  (select private.has_company_permission(company_id, 'company.members.read'))
  or (select private.has_company_permission(company_id, 'company.members.manage'))
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables)
     and not exists (
       select 1
       from pg_publication p
       join pg_publication_rel pr on pr.prpubid = p.oid
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime'
         and n.nspname = 'public'
         and c.relname = 'company_member_permission_overrides'
     ) then
    alter publication supabase_realtime add table public.company_member_permission_overrides;
  end if;
end $$;

-- Keep the audit allowlist a strict superset of all events already present in
-- the repository, then add the Wave 1 lifecycle events.
alter table public.company_audit_events
  drop constraint if exists company_audit_events_event_type_check;
alter table public.company_audit_events
  add constraint company_audit_events_event_type_check check (event_type in (
    'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_SUSPENDED', 'COMPANY_ARCHIVED', 'COMPANY_REACTIVATED',
    'USER_INVITED', 'INVITE_REVOKED', 'INVITE_ACCEPTED', 'INVITATION_SENT', 'INVITATION_DELIVERY_FAILED',
    'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED', 'MEMBER_REACTIVATED', 'MEMBER_REVOKED', 'MEMBER_PERMISSIONS_UPDATED',
    'PAYROLL_REPAIR_APPLIED', 'PAYROLL_CALENDAR_REBUILT', 'PAYROLL_UNAPPROVED_RESET',
    'COMPANY_AI_CREDENTIAL_CONFIGURED', 'COMPANY_AI_CREDENTIAL_ROTATED',
    'COMPANY_AI_CREDENTIAL_TESTED', 'COMPANY_AI_CREDENTIAL_ENABLED',
    'COMPANY_AI_CREDENTIAL_DISABLED', 'COMPANY_AI_CREDENTIAL_REMOVED',
    'PAYROLL_WORKSPACE_RESET',
    'CASH_ACCOUNT_CREATED', 'CASH_ACCOUNT_UPDATED', 'CASH_ACCOUNT_DEACTIVATED',
    'CASH_BALANCE_SNAPSHOT_RECORDED', 'CASH_STATEMENT_IMPORTED', 'CASH_STATEMENT_REJECTED',
    'CASH_TRANSACTION_CREATED', 'CASH_TRANSACTION_UPDATED',
    'CASH_RECONCILIATION_CONFIRMED', 'CASH_RECONCILIATION_REMOVED', 'CASH_TRANSFER_MATCHED',
    'CASH_SETTLEMENT_CONFIRMED', 'CASH_SETTLEMENT_REVERSED',
    'ENGINEERING_DOCUMENT_CREATED', 'ENGINEERING_DOCUMENT_UPDATED', 'ENGINEERING_DOCUMENT_ARCHIVED',
    'ENGINEERING_REVISION_UPLOADED', 'ENGINEERING_ANNOTATION_SAVED', 'ENGINEERING_ANNOTATION_DELETED',
    'ENGINEERING_RFI_CREATED', 'ENGINEERING_RFI_OPENED', 'ENGINEERING_RFI_RESPONDED', 'ENGINEERING_RFI_CLOSED', 'ENGINEERING_RFI_VOIDED',
    'ENGINEERING_SUBMITTAL_CREATED', 'ENGINEERING_SUBMITTAL_SUBMITTED', 'ENGINEERING_SUBMITTAL_REVIEW_STARTED', 'ENGINEERING_SUBMITTAL_REVIEWED',
    'ENGINEERING_SUBMITTAL_RESUBMITTED', 'ENGINEERING_SUBMITTAL_CLOSED', 'ENGINEERING_SUBMITTAL_VOIDED',
    'ENGINEERING_DAILY_SITE_LOG_CREATED', 'ENGINEERING_DAILY_SITE_LOG_UPDATED', 'ENGINEERING_DAILY_SITE_LOG_SUBMITTED',
    'ENGINEERING_DAILY_SITE_LOG_FINALIZED', 'ENGINEERING_DAILY_SITE_LOG_VOIDED'
  ));

create or replace function private.member_has_company_permission(
  p_company_id uuid,
  p_user_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_company_id is not null
     and p_user_id is not null
     and exists (
       select 1
       from public.companies c
       join public.company_members cm on cm.company_id = c.id
       where c.id = p_company_id
         and c.status = 'ACTIVE'
         and cm.user_id = p_user_id
         and cm.status = 'ACTIVE'
         and (
           exists (
             select 1
             from public.company_role_permissions crp
             where crp.role_key = cm.role_key
               and crp.permission_key = p_permission_key
           )
           or exists (
             select 1
             from public.company_member_permission_overrides mpo
             where mpo.company_id = cm.company_id
               and mpo.membership_id = cm.id
               and mpo.permission_key = p_permission_key
               and mpo.effect = 'GRANT'
           )
         )
         and not exists (
           select 1
           from public.company_member_permission_overrides mpo
           where mpo.company_id = cm.company_id
             and mpo.membership_id = cm.id
             and mpo.permission_key = p_permission_key
             and mpo.effect = 'DENY'
         )
     );
$$;

create or replace function private.effective_company_permissions(
  p_company_id uuid,
  p_user_id uuid
)
returns table(permission_key text)
language sql
stable
security definer
set search_path = ''
as $$
  with member as (
    select cm.id, cm.role_key
    from public.companies c
    join public.company_members cm on cm.company_id = c.id
    where c.id = p_company_id
      and c.status = 'ACTIVE'
      and cm.user_id = p_user_id
      and cm.status = 'ACTIVE'
    limit 1
  ),
  granted as (
    select rp.permission_key
    from member m
    join public.company_role_permissions rp on rp.role_key = m.role_key
    union
    select mpo.permission_key
    from member m
    join public.company_member_permission_overrides mpo on mpo.membership_id = m.id
    where mpo.company_id = p_company_id
      and mpo.effect = 'GRANT'
  )
  select g.permission_key
  from granted g
  where not exists (
    select 1
    from member m
    join public.company_member_permission_overrides mpo on mpo.membership_id = m.id
    where mpo.company_id = p_company_id
      and mpo.permission_key = g.permission_key
      and mpo.effect = 'DENY'
  )
  order by g.permission_key;
$$;

create or replace function private.has_company_permission(p_company_id uuid, p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_company_id = (select private.deployment_company_id())
     and (select private.member_has_company_permission(p_company_id, (select auth.uid()), p_permission_key));
$$;

grant execute on function private.member_has_company_permission(uuid, uuid, text) to authenticated;
grant execute on function private.effective_company_permissions(uuid, uuid) to authenticated;
revoke execute on function private.member_has_company_permission(uuid, uuid, text) from public, anon;
revoke execute on function private.effective_company_permissions(uuid, uuid) from public, anon;
revoke execute on function private.has_company_permission(uuid, text) from public, anon;
grant execute on function private.has_company_permission(uuid, text) to authenticated;

-- The client access snapshot now contains the same effective permission set
-- used by database RLS/helpers, plus the role baseline and explicit overrides
-- needed by the access editor.
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
        'role_permissions', coalesce((
          select jsonb_agg(rp.permission_key order by rp.permission_key)
          from public.company_role_permissions rp
          where rp.role_key = cm.role_key
        ), '[]'::jsonb),
        'permission_overrides', coalesce((
          select jsonb_agg(jsonb_build_object('permission_key', mpo.permission_key, 'effect', mpo.effect) order by mpo.permission_key)
          from public.company_member_permission_overrides mpo
          where mpo.company_id = cm.company_id and mpo.membership_id = cm.id
        ), '[]'::jsonb),
        'permissions', coalesce((
          select jsonb_agg(ep.permission_key order by ep.permission_key)
          from private.effective_company_permissions(c.id, v_user_id) ep
        ), '[]'::jsonb),
        'joined_at', cm.joined_at,
        'updated_at', cm.updated_at
      )) end,
      'permissions_by_company', case when cm.id is null then '{}'::jsonb else jsonb_build_object(
        c.id::text,
        coalesce((
          select jsonb_agg(ep.permission_key order by ep.permission_key)
          from private.effective_company_permissions(c.id, v_user_id) ep
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

-- Listing is an RPC boundary so the browser never needs direct access to the
-- permission-override tables or auth.users.
drop function if exists public.platform_list_company_permission_catalog(uuid);
create function public.platform_list_company_permission_catalog(p_company_id uuid)
returns table(permission_key text, description text, member_assignable boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not ((select private.has_company_permission(p_company_id, 'company.members.read'))
      or (select private.has_company_permission(p_company_id, 'company.members.manage'))) then
    raise exception 'Company permission-catalog access is required' using errcode = '42501';
  end if;
  return query
  select c.permission_key, c.description, c.member_assignable
  from public.company_permission_catalog c
  order by c.permission_key;
end;
$$;

-- All invitation creation/delivery state changes go through the trusted
-- backend service key. Authenticated browser roles can still read through the
-- existing guarded list RPC and can revoke their own company's invitations.
create or replace function private.create_company_invitation(
  p_actor_user_id uuid,
  p_company_id uuid,
  p_email text,
  p_role_key text,
  p_expires_at timestamptz,
  p_permission_overrides jsonb
)
returns public.company_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.company_invitations;
  v_email text := lower(btrim(p_email));
  v_role_key text := upper(btrim(p_role_key));
  v_expiry timestamptz := coalesce(p_expires_at, now() + interval '7 days');
  v_item jsonb;
  v_permission_key text;
  v_effect text;
  v_seen text[] := array[]::text[];
begin
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Invitation cannot target another Engoryx deployment' using errcode = '42501';
  end if;
  if not (select private.member_has_company_permission(p_company_id, p_actor_user_id, 'company.members.manage')) then
    raise exception 'Company access-management permission is required' using errcode = '42501';
  end if;
  if p_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid invitation email is required' using errcode = '22023';
  end if;
  if v_expiry <= now() then
    raise exception 'Invitation expiry must be in the future' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.company_role_catalog rc
    where rc.role_key = v_role_key and rc.assignable and not rc.is_platform_role
  ) then
    raise exception 'Role is not assignable' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.company_invitations ci
    where ci.company_id = p_company_id and ci.normalized_email = v_email and ci.status = 'PENDING'
  ) then
    raise exception 'That email already has a pending invitation' using errcode = '23505';
  end if;
  if exists (
    select 1
    from public.company_members cm
    join auth.users u on u.id = cm.user_id
    where cm.company_id = p_company_id
      and lower(btrim(u.email)) = v_email
  ) then
    raise exception 'That email already has a company membership; update its access instead' using errcode = '23505';
  end if;
  if p_permission_overrides is null then p_permission_overrides := '[]'::jsonb; end if;
  if jsonb_typeof(p_permission_overrides) <> 'array' then
    raise exception 'Invitation permission overrides must be an array' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_permission_overrides)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each permission override must be an object' using errcode = '22023';
    end if;
    v_permission_key := lower(btrim(v_item ->> 'permission_key'));
    v_effect := upper(btrim(v_item ->> 'effect'));
    if v_permission_key is null or v_permission_key = '' or v_effect not in ('GRANT', 'DENY') then
      raise exception 'Each permission override requires a permission key and GRANT or DENY effect' using errcode = '22023';
    end if;
    if v_permission_key = any(v_seen) then
      raise exception 'A permission may appear only once in invitation overrides' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_permission_key);
    if not exists (
      select 1 from public.company_permission_catalog pc
      where pc.permission_key = v_permission_key and pc.member_assignable
    ) then
      raise exception 'Permission is not assignable to an individual member' using errcode = '42501';
    end if;
    if not (select private.member_has_company_permission(p_company_id, p_actor_user_id, v_permission_key)) then
      raise exception 'You cannot assign a permission you do not hold' using errcode = '42501';
    end if;
  end loop;

  insert into public.company_invitations (
    company_id, normalized_email, role_key, status, invited_by_user_id, expires_at, delivery_status
  ) values (
    p_company_id, v_email, v_role_key, 'PENDING', p_actor_user_id, v_expiry, 'CREATED'
  ) returning * into v_invitation;

  for v_item in select value from jsonb_array_elements(p_permission_overrides)
  loop
    insert into public.company_invitation_permission_overrides (
      company_id, invitation_id, permission_key, effect, created_by_user_id
    ) values (
      v_invitation.company_id,
      v_invitation.id,
      lower(btrim(v_item ->> 'permission_key')),
      upper(btrim(v_item ->> 'effect')),
      p_actor_user_id
    );
  end loop;

  perform private.write_company_audit(
    v_invitation.company_id,
    'USER_INVITED',
    'invitation',
    v_invitation.id,
    jsonb_build_object(
      'normalized_email', v_invitation.normalized_email,
      'role_key', v_invitation.role_key,
      'expires_at', v_invitation.expires_at,
      'delivery_status', v_invitation.delivery_status,
      'custom_override_count', jsonb_array_length(p_permission_overrides)
    )
  );
  return v_invitation;
end;
$$;

create or replace function public.platform_create_company_invitation(
  p_actor_user_id uuid,
  p_company_id uuid,
  p_email text,
  p_role_key text,
  p_expires_at timestamptz default (now() + interval '7 days'),
  p_permission_overrides jsonb default '[]'::jsonb
)
returns public.company_invitations
language sql
security definer
set search_path = ''
as $$
  select private.create_company_invitation(
    p_actor_user_id,
    p_company_id,
    p_email,
    p_role_key,
    p_expires_at,
    p_permission_overrides
  );
$$;

create or replace function public.invite_company_member(
  p_company_id uuid,
  p_email text,
  p_role_key text,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns public.company_invitations
language sql
security definer
set search_path = ''
as $$
  select private.create_company_invitation((select auth.uid()), p_company_id, p_email, p_role_key, p_expires_at, '[]'::jsonb);
$$;

create or replace function public.invite_company_member_with_overrides(
  p_company_id uuid,
  p_email text,
  p_role_key text,
  p_permission_overrides jsonb default '[]'::jsonb,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns public.company_invitations
language sql
security definer
set search_path = ''
as $$
  select private.create_company_invitation((select auth.uid()), p_company_id, p_email, p_role_key, p_expires_at, p_permission_overrides);
$$;

-- Delivery updates are backend-only. A browser can never mark an email as
-- sent and then claim membership without the trusted delivery hop.
create or replace function public.platform_mark_company_invitation_delivery(
  p_actor_user_id uuid,
  p_invitation_id uuid,
  p_delivery_status text,
  p_delivery_error text default null
)
returns public.company_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.company_invitations;
  v_error text := nullif(btrim(p_delivery_error), '');
begin
  select ci.* into v_invitation
  from public.company_invitations ci
  where ci.id = p_invitation_id
  for update;
  if not found then raise exception 'Invitation does not exist' using errcode = '22023'; end if;
  if not (select private.member_has_company_permission(v_invitation.company_id, p_actor_user_id, 'company.members.manage')) then
    raise exception 'Company access-management permission is required' using errcode = '42501';
  end if;
  if v_invitation.company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Invitation cannot target another Engoryx deployment' using errcode = '42501';
  end if;
  if v_invitation.status <> 'PENDING' then
    raise exception 'Only pending invitations can receive delivery updates' using errcode = '22023';
  end if;
  if v_invitation.expires_at <= now() then
    update public.company_invitations
    set status = 'EXPIRED', updated_at = now()
    where id = v_invitation.id;
    raise exception 'Invitation has expired; create a new invitation' using errcode = '22023';
  end if;
  if p_delivery_status not in ('CREATED', 'SENT', 'FAILED') then
    raise exception 'Invalid invitation delivery status' using errcode = '22023';
  end if;
  if v_error is not null and length(v_error) > 500 then v_error := left(v_error, 500); end if;

  update public.company_invitations ci
  set delivery_status = p_delivery_status,
      delivery_error = case when p_delivery_status = 'FAILED' then v_error else null end,
      sent_at = case when p_delivery_status = 'SENT' then coalesce(ci.sent_at, now()) else null end,
      updated_at = now()
  where ci.id = v_invitation.id
  returning * into v_invitation;

  if p_delivery_status = 'SENT' then
    perform private.write_company_audit(v_invitation.company_id, 'INVITATION_SENT', 'invitation', v_invitation.id,
      jsonb_build_object('normalized_email', v_invitation.normalized_email, 'sent_at', v_invitation.sent_at));
  elsif p_delivery_status = 'FAILED' then
    perform private.write_company_audit(v_invitation.company_id, 'INVITATION_DELIVERY_FAILED', 'invitation', v_invitation.id,
      jsonb_build_object('normalized_email', v_invitation.normalized_email, 'delivery_error', v_invitation.delivery_error));
  end if;
  return v_invitation;
end;
$$;

create or replace function public.platform_reset_company_invitation_delivery(
  p_actor_user_id uuid,
  p_invitation_id uuid
)
returns public.company_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.company_invitations;
begin
  select ci.* into v_invitation
  from public.company_invitations ci
  where ci.id = p_invitation_id
  for update;
  if not found then raise exception 'Invitation does not exist' using errcode = '22023'; end if;
  if not (select private.member_has_company_permission(v_invitation.company_id, p_actor_user_id, 'company.members.manage')) then
    raise exception 'Company access-management permission is required' using errcode = '42501';
  end if;
  if v_invitation.company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Invitation cannot target another Engoryx deployment' using errcode = '42501';
  end if;
  if v_invitation.status <> 'PENDING' or v_invitation.expires_at <= now() then
    raise exception 'Only an unexpired pending invitation can be resent' using errcode = '22023';
  end if;
  update public.company_invitations ci
  set delivery_status = 'CREATED', delivery_error = null, sent_at = null, updated_at = now()
  where ci.id = v_invitation.id
  returning * into v_invitation;
  perform private.write_company_audit(v_invitation.company_id, 'USER_INVITED', 'invitation', v_invitation.id,
    jsonb_build_object('normalized_email', v_invitation.normalized_email, 'role_key', v_invitation.role_key, 'resend', true));
  return v_invitation;
end;
$$;

-- The authenticated role may not invoke backend-only creation/delivery RPCs.
revoke execute on function public.platform_create_company_invitation(uuid, uuid, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke execute on function public.platform_mark_company_invitation_delivery(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.platform_reset_company_invitation_delivery(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.invite_company_member(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.invite_company_member_with_overrides(uuid, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function public.platform_invite_company_member(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.platform_create_company_invitation(uuid, uuid, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.platform_mark_company_invitation_delivery(uuid, uuid, text, text) to service_role;
grant execute on function public.platform_reset_company_invitation_delivery(uuid, uuid) to service_role;

-- Claims are only possible after the trusted server records a successful
-- email delivery. A suspended/revoked membership is never reactivated by an
-- invitation; such access must be corrected explicitly by an administrator.
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
    and ci.expires_at <= now();

  for invitation_row in
    select ci.id, ci.company_id, ci.role_key, ci.invited_by_user_id
    from public.company_invitations ci
    join public.companies c on c.id = ci.company_id
    where ci.company_id = v_company_id
      and ci.normalized_email = v_email
      and ci.status = 'PENDING'
      and ci.delivery_status = 'SENT'
      and ci.expires_at > now()
      and c.status = 'ACTIVE'
    for update of ci
  loop
    if exists (
      select 1 from public.company_members cm
      where cm.company_id = invitation_row.company_id and cm.user_id = v_user_id
    ) then
      update public.company_invitations ci
      set status = 'REVOKED', updated_at = now()
      where ci.id = invitation_row.id;
      perform private.write_company_audit(invitation_row.company_id, 'INVITE_REVOKED', 'invitation', invitation_row.id,
        jsonb_build_object('reason', 'membership_already_exists', 'user_id', v_user_id));
      continue;
    end if;

    insert into public.company_members (
      company_id, user_id, role_key, status, invited_by_user_id, joined_at
    ) values (
      invitation_row.company_id, v_user_id, invitation_row.role_key, 'ACTIVE', invitation_row.invited_by_user_id, now()
    )
    returning id into v_membership_id;

    insert into public.company_member_permission_overrides (
      company_id, membership_id, permission_key, effect, created_by_user_id
    )
    select cio.company_id, v_membership_id, cio.permission_key, cio.effect, cio.created_by_user_id
    from public.company_invitation_permission_overrides cio
    where cio.company_id = invitation_row.company_id and cio.invitation_id = invitation_row.id
    on conflict (membership_id, permission_key) do update
      set effect = excluded.effect, updated_at = now();

    update public.company_invitations ci
    set status = 'ACCEPTED', accepted_by_user_id = v_user_id, accepted_at = now(), updated_at = now()
    where ci.id = invitation_row.id;

    perform private.write_company_audit(invitation_row.company_id, 'INVITE_ACCEPTED', 'invitation', invitation_row.id,
      jsonb_build_object('membership_id', v_membership_id, 'role_key', invitation_row.role_key));
    company_id := invitation_row.company_id;
    membership_id := v_membership_id;
    role_key := invitation_row.role_key;
    return next;
  end loop;
end;
$$;

-- Explicit profile editing is a company-admin capability, not an inherited
-- global platform-admin operation. Status lifecycle controls remain platform
-- maintenance-only through the existing guarded functions.
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
begin
  if not (select private.has_company_permission(p_company_id, 'company.settings.manage')) then
    raise exception 'Company settings permission is required' using errcode = '42501';
  end if;
  update public.companies c
  set name = coalesce(nullif(btrim(p_name), ''), c.name),
      company_code = coalesce(nullif(lower(btrim(p_company_code)), ''), c.company_code),
      default_currency = coalesce(nullif(upper(btrim(p_default_currency)), ''), c.default_currency),
      timezone = coalesce(nullif(btrim(p_timezone), ''), c.timezone),
      updated_at = now()
  where c.id = p_company_id
    and c.id = (select private.deployment_company_id())
  returning * into v_company;
  if not found then raise exception 'Deployment company does not exist' using errcode = '22023'; end if;
  perform private.write_company_audit(v_company.id, 'COMPANY_UPDATED', 'company', v_company.id,
    jsonb_build_object('name', v_company.name, 'company_code', v_company.company_code,
      'default_currency', v_company.default_currency, 'timezone', v_company.timezone));
  return v_company;
end;
$$;

drop function if exists public.platform_update_company(uuid, text, text, text, text, text);
create function public.platform_update_company(
  p_company_id uuid,
  p_name text default null,
  p_company_code text default null,
  p_status text default null,
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
begin
  v_company := public.update_company(p_company_id, p_name, p_company_code, p_default_currency, p_timezone);
  if p_status is null then return v_company; end if;
  perform private.require_platform_deployment_company(p_company_id);
  case upper(btrim(p_status))
    when 'ACTIVE' then v_company := public.reactivate_company(p_company_id);
    when 'SUSPENDED' then v_company := public.suspend_company(p_company_id);
    when 'ARCHIVED' then v_company := public.archive_company(p_company_id);
    else raise exception 'Invalid company status' using errcode = '22023';
  end case;
  return v_company;
end;
$$;

-- Role/status changes remain company-scoped and cannot be used to edit the
-- caller's own account into an accidental lockout.
create or replace function public.change_company_member_role(p_membership_id uuid, p_role_key text)
returns public.company_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.company_members;
  v_company_id uuid;
  v_target_user_id uuid;
  v_role_key text := upper(btrim(p_role_key));
begin
  select cm.company_id, cm.user_id into v_company_id, v_target_user_id
  from public.company_members cm where cm.id = p_membership_id;
  if not found then raise exception 'Membership does not exist' using errcode = '22023'; end if;
  if v_target_user_id = (select auth.uid()) then raise exception 'You cannot change your own membership from this screen' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'company.members.manage')) then raise exception 'Company access-management permission is required' using errcode = '42501'; end if;
  if not exists (select 1 from public.company_role_catalog rc where rc.role_key = v_role_key and rc.assignable and not rc.is_platform_role) then raise exception 'Role is not assignable' using errcode = '22023'; end if;
  update public.company_members cm set role_key = v_role_key, updated_at = now() where cm.id = p_membership_id returning * into v_member;
  perform private.write_company_audit(v_member.company_id, 'MEMBER_ROLE_CHANGED', 'membership', v_member.id,
    jsonb_build_object('role_key', v_member.role_key, 'user_id', v_member.user_id));
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
  v_target_user_id uuid;
begin
  select cm.company_id, cm.user_id into v_company_id, v_target_user_id from public.company_members cm where cm.id = p_membership_id;
  if not found then raise exception 'Membership does not exist' using errcode = '22023'; end if;
  if v_target_user_id = (select auth.uid()) then raise exception 'You cannot change your own membership from this screen' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'company.members.manage')) then raise exception 'Company access-management permission is required' using errcode = '42501'; end if;
  if p_status not in ('ACTIVE', 'SUSPENDED', 'REVOKED') then raise exception 'Invalid membership status' using errcode = '22023'; end if;
  update public.company_members cm set status = p_status, updated_at = now() where cm.id = p_membership_id returning * into v_member;
  perform private.write_company_audit(v_member.company_id, p_event_type, 'membership', v_member.id,
    jsonb_build_object('status', v_member.status, 'user_id', v_member.user_id));
  return v_member;
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

create or replace function public.platform_update_company_member_permissions(
  p_company_id uuid,
  p_membership_id uuid,
  p_overrides jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.company_members;
  v_item jsonb;
  v_permission_key text;
  v_effect text;
  v_seen text[] := array[]::text[];
  v_role_permissions jsonb;
  v_effective_permissions jsonb;
  v_permission_overrides jsonb;
begin
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Permission overrides cannot target another Engoryx deployment' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(p_company_id, 'company.members.manage')) then
    raise exception 'Company access-management permission is required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_overrides, '[]'::jsonb)) <> 'array' then
    raise exception 'Permission overrides must be an array' using errcode = '22023';
  end if;
  select cm.* into v_member from public.company_members cm
  where cm.id = p_membership_id and cm.company_id = p_company_id for update;
  if not found then raise exception 'Membership does not exist in the deployment company' using errcode = '22023'; end if;
  if v_member.user_id = (select auth.uid()) then raise exception 'You cannot change your own permission overrides from this screen' using errcode = '42501'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb))
  loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Each permission override must be an object' using errcode = '22023'; end if;
    v_permission_key := lower(btrim(v_item ->> 'permission_key'));
    v_effect := upper(btrim(v_item ->> 'effect'));
    if v_permission_key is null or v_permission_key = '' or v_effect not in ('GRANT', 'DENY') then
      raise exception 'Each permission override requires a permission key and GRANT or DENY effect' using errcode = '22023';
    end if;
    if v_permission_key = any(v_seen) then raise exception 'A permission may appear only once in overrides' using errcode = '22023'; end if;
    v_seen := array_append(v_seen, v_permission_key);
    if not exists (
      select 1 from public.company_permission_catalog pc
      where pc.permission_key = v_permission_key and pc.member_assignable
    ) then
      raise exception 'Permission is reserved or not assignable to an individual member' using errcode = '42501';
    end if;
    if not (select private.has_company_permission(p_company_id, v_permission_key)) then
      raise exception 'You cannot assign a permission you do not hold' using errcode = '42501';
    end if;
  end loop;

  delete from public.company_member_permission_overrides mpo
  where mpo.company_id = p_company_id and mpo.membership_id = p_membership_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb))
  loop
    insert into public.company_member_permission_overrides (
      company_id, membership_id, permission_key, effect, created_by_user_id
    ) values (
      p_company_id, p_membership_id, lower(btrim(v_item ->> 'permission_key')),
      upper(btrim(v_item ->> 'effect')), (select auth.uid())
    );
  end loop;

  if not exists (
    select 1 from public.company_members cm
    where cm.company_id = p_company_id and cm.status = 'ACTIVE'
      and (select private.member_has_company_permission(p_company_id, cm.user_id, 'company.members.manage'))
  ) then
    raise exception 'At least one active member with access-management authority must remain' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(rp.permission_key order by rp.permission_key), '[]'::jsonb)
    into v_role_permissions
  from public.company_role_permissions rp where rp.role_key = v_member.role_key;
  select coalesce(jsonb_agg(ep.permission_key order by ep.permission_key), '[]'::jsonb)
    into v_effective_permissions
  from private.effective_company_permissions(p_company_id, v_member.user_id) ep;
  select coalesce(jsonb_agg(jsonb_build_object('permission_key', mpo.permission_key, 'effect', mpo.effect) order by mpo.permission_key), '[]'::jsonb)
    into v_permission_overrides
  from public.company_member_permission_overrides mpo
  where mpo.company_id = p_company_id and mpo.membership_id = p_membership_id;

  perform private.write_company_audit(p_company_id, 'MEMBER_PERMISSIONS_UPDATED', 'membership', p_membership_id,
    jsonb_build_object('user_id', v_member.user_id, 'overrides', v_permission_overrides, 'effective_permissions', v_effective_permissions));
  return jsonb_build_object(
    'membership_id', p_membership_id,
    'role_permissions', v_role_permissions,
    'permission_overrides', v_permission_overrides,
    'effective_permissions', v_effective_permissions
  );
end;
$$;

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
  updated_at timestamptz,
  role_permissions jsonb,
  permission_overrides jsonb,
  effective_permissions jsonb
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
  select cm.id, cm.company_id, cm.user_id, u.email::text,
         coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')::text,
         cm.role_key, cm.status, cm.joined_at, cm.updated_at,
         coalesce((select jsonb_agg(rp.permission_key order by rp.permission_key) from public.company_role_permissions rp where rp.role_key = cm.role_key), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('permission_key', mpo.permission_key, 'effect', mpo.effect) order by mpo.permission_key) from public.company_member_permission_overrides mpo where mpo.company_id = cm.company_id and mpo.membership_id = cm.id), '[]'::jsonb),
         coalesce((select jsonb_agg(ep.permission_key order by ep.permission_key) from private.effective_company_permissions(cm.company_id, cm.user_id) ep), '[]'::jsonb)
  from public.company_members cm
  left join auth.users u on u.id = cm.user_id
  where cm.company_id = p_company_id
  order by lower(coalesce(u.email, '')), cm.id;
end;
$$;

-- Expiration is materialized before an administrator sees invitation state.
create or replace function public.platform_list_company_invitations(p_company_id uuid)
returns setof public.company_invitations
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not ((select private.has_company_permission(p_company_id, 'company.members.read')) or (select private.has_company_permission(p_company_id, 'company.members.manage'))) then
    raise exception 'Company invitation-list permission is required' using errcode = '42501';
  end if;
  update public.company_invitations ci
  set status = 'EXPIRED', updated_at = now()
  where ci.company_id = p_company_id and ci.status = 'PENDING' and ci.expires_at <= now();
  return query
  select ci.* from public.company_invitations ci
  where ci.company_id = p_company_id
  order by ci.created_at desc, ci.id desc;
end;
$$;

-- Re-apply the deployment-company check to the new RPCs and keep all direct
-- override table writes closed to browser roles.
revoke execute on function public.platform_list_company_permission_catalog(uuid) from public, anon;
revoke execute on function public.platform_update_company_member_permissions(uuid, uuid, jsonb) from public, anon;
grant execute on function public.platform_list_company_permission_catalog(uuid) to authenticated;
grant execute on function public.platform_update_company_member_permissions(uuid, uuid, jsonb) to authenticated;
revoke execute on function public.get_my_company_access() from public, anon;
grant execute on function public.get_my_company_access() to authenticated;
revoke execute on function public.claim_company_invitations() from public, anon;
grant execute on function public.claim_company_invitations() to authenticated;
revoke execute on function public.update_company(uuid, text, text, text, text) from public, anon;
revoke execute on function public.platform_update_company(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.update_company(uuid, text, text, text, text) to authenticated;
grant execute on function public.platform_update_company(uuid, text, text, text, text, text) to authenticated;
revoke execute on function public.platform_list_company_member_directory(uuid) from public, anon;
revoke execute on function public.platform_list_company_invitations(uuid) from public, anon;
grant execute on function public.platform_list_company_member_directory(uuid) to authenticated;
grant execute on function public.platform_list_company_invitations(uuid) to authenticated;
