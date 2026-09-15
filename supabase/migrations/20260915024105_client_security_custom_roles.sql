-- HydroQualiSense client security assurance: company-defined roles.
--
-- Built-in roles remain global starter templates. Custom roles use generated
-- stable keys but carry an owning company_id; their display names are never
-- consulted by authorization. All effective access continues through the
-- existing role-permission plus member-override resolver.

alter table public.company_role_catalog
  add column if not exists company_id uuid references public.companies(id) on delete restrict,
  add column if not exists is_builtin boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.company_role_catalog
set is_builtin = true,
    company_id = null,
    archived_at = null,
    assignable = true,
    updated_at = coalesce(updated_at, now())
where role_key in ('COMPANY_ADMIN', 'FINANCE', 'PAYROLL', 'VIEWER');

alter table public.company_role_catalog
  drop constraint if exists company_role_catalog_scope_check;
alter table public.company_role_catalog
  add constraint company_role_catalog_scope_check check (
    (is_builtin and company_id is null and not is_platform_role)
    or (is_platform_role and company_id is null and not is_builtin)
    or (not is_builtin and not is_platform_role and company_id is not null)
  );

create unique index if not exists company_role_catalog_company_name_unique
  on public.company_role_catalog (company_id, lower(btrim(display_name)))
  where company_id is not null and archived_at is null;
create index if not exists company_role_catalog_company_assignable_idx
  on public.company_role_catalog (company_id, assignable, archived_at, display_name);

drop trigger if exists company_role_catalog_updated_at on public.company_role_catalog;
create trigger company_role_catalog_updated_at
before update on public.company_role_catalog
for each row execute function private.set_company_updated_at();

-- Preserve the complete current append-only audit allowlist and add explicit
-- custom-role lifecycle events.
alter table public.company_audit_events
  drop constraint if exists company_audit_events_event_type_check;
alter table public.company_audit_events
  add constraint company_audit_events_event_type_check check (event_type in (
    'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_SUSPENDED', 'COMPANY_ARCHIVED', 'COMPANY_REACTIVATED',
    'USER_INVITED', 'INVITE_REVOKED', 'INVITE_ACCEPTED', 'INVITATION_SENT', 'INVITATION_DELIVERY_FAILED',
    'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED', 'MEMBER_REACTIVATED', 'MEMBER_REVOKED', 'MEMBER_PERMISSIONS_UPDATED',
    'CUSTOM_ROLE_CREATED', 'CUSTOM_ROLE_UPDATED', 'CUSTOM_ROLE_ARCHIVED',
    'PAYROLL_REPAIR_APPLIED', 'PAYROLL_CALENDAR_REBUILT', 'PAYROLL_UNAPPROVED_RESET', 'PAYROLL_WORKSPACE_RESET',
    'COMPANY_AI_CREDENTIAL_CONFIGURED', 'COMPANY_AI_CREDENTIAL_ROTATED',
    'COMPANY_AI_CREDENTIAL_TESTED', 'COMPANY_AI_CREDENTIAL_ENABLED',
    'COMPANY_AI_CREDENTIAL_DISABLED', 'COMPANY_AI_CREDENTIAL_REMOVED',
    'CASH_ACCOUNT_CREATED', 'CASH_ACCOUNT_UPDATED', 'CASH_ACCOUNT_DEACTIVATED', 'CASH_ACCOUNT_REACTIVATED',
    'CASH_BALANCE_SNAPSHOT_RECORDED', 'CASH_STATEMENT_IMPORTED', 'CASH_STATEMENT_REJECTED',
    'CASH_TRANSACTION_CREATED', 'CASH_TRANSACTION_UPDATED', 'CASH_TRANSACTION_CORRECTED',
    'CASH_TRANSACTION_REVERSED', 'CASH_TRANSACTION_IGNORED', 'CASH_TRANSACTION_REVIEW_RESTORED',
    'CASH_RECONCILIATION_CONFIRMED', 'CASH_RECONCILIATION_REMOVED', 'CASH_TRANSFER_MATCHED', 'CASH_TRANSFER_REVERSED',
    'CASH_SETTLEMENT_CONFIRMED', 'CASH_SETTLEMENT_REVERSED',
    'ENGINEERING_DOCUMENT_CREATED', 'ENGINEERING_DOCUMENT_UPDATED', 'ENGINEERING_DOCUMENT_ARCHIVED',
    'ENGINEERING_REVISION_UPLOADED', 'ENGINEERING_ANNOTATION_SAVED', 'ENGINEERING_ANNOTATION_DELETED',
    'ENGINEERING_DOCUMENT_DELETED_UNUSED', 'ENGINEERING_DOCUMENT_SUPERSEDED',
    'ENGINEERING_RFI_CREATED', 'ENGINEERING_RFI_OPENED', 'ENGINEERING_RFI_RESPONDED', 'ENGINEERING_RFI_CLOSED', 'ENGINEERING_RFI_VOIDED',
    'ENGINEERING_RFI_DELETED_UNUSED',
    'ENGINEERING_SUBMITTAL_CREATED', 'ENGINEERING_SUBMITTAL_SUBMITTED', 'ENGINEERING_SUBMITTAL_REVIEW_STARTED', 'ENGINEERING_SUBMITTAL_REVIEWED',
    'ENGINEERING_SUBMITTAL_RESUBMITTED', 'ENGINEERING_SUBMITTAL_CLOSED', 'ENGINEERING_SUBMITTAL_VOIDED', 'ENGINEERING_SUBMITTAL_DELETED_UNUSED',
    'ENGINEERING_DAILY_SITE_LOG_CREATED', 'ENGINEERING_DAILY_SITE_LOG_UPDATED', 'ENGINEERING_DAILY_SITE_LOG_SUBMITTED',
    'ENGINEERING_DAILY_SITE_LOG_FINALIZED', 'ENGINEERING_DAILY_SITE_LOG_VOIDED',
    'ENGINEERING_DAILY_SITE_LOG_DELETED_UNUSED', 'ENGINEERING_DAILY_SITE_LOG_ADDENDUM',
    'WORKER_OFFBOARDED', 'WORKER_REACTIVATED', 'WORKER_DELETED_UNUSED',
    'PROJECT_ASSIGNMENT_ENDED', 'PROJECT_ASSIGNMENT_DELETED_UNUSED',
    'COMPENSATION_PROFILE_ENDED', 'COMPENSATION_PROFILE_SUPERSEDED', 'COMPENSATION_PROFILE_DELETED_UNUSED',
    'PAYROLL_COMPONENT_DEACTIVATED', 'PAYROLL_COMPONENT_DELETED_UNUSED',
    'WORK_ENTRY_VOIDED', 'WORK_ENTRY_DELETED_UNUSED', 'ATTENDANCE_VOIDED', 'ATTENDANCE_DELETED_UNUSED',
    'LEAVE_CANCELLED', 'LEAVE_DELETED_UNUSED', 'OVERTIME_CANCELLED', 'OVERTIME_DELETED_UNUSED',
    'PROJECT_DELETED_UNUSED', 'PROJECT_ARCHIVED', 'PROJECT_REACTIVATED',
    'INVOICE_DELETED_UNUSED', 'INVOICE_VOIDED', 'INVOICE_ARCHIVED', 'INVOICE_RESTORED',
    'EXPENSE_DELETED_UNUSED', 'EXPENSE_VOIDED', 'EXPENSE_ARCHIVED', 'EXPENSE_RESTORED',
    'ACCESS_AUTHORIZATION_CREATED', 'ACCESS_AUTHORIZATION_PERMISSIONS_UPDATED', 'ACCESS_AUTHORIZATION_REVOKED', 'ACCESS_AUTHORIZATION_ACCEPTED',
    'MEMBERSHIP_CREATED', 'PERMISSION_OVERRIDES_TRANSFERRED',
    'CLIENT_BILLING_CREATED', 'CLIENT_BILLING_UPDATED', 'CLIENT_BILLING_SUBMITTED',
    'CLIENT_BILLING_RETURNED_TO_DRAFT', 'CLIENT_BILLING_ISSUED', 'CLIENT_BILLING_CANCELLED', 'CLIENT_BILLING_VOIDED',
    'CLIENT_COLLECTION_CREATED', 'CLIENT_COLLECTION_UPDATED', 'CLIENT_COLLECTION_RECORDED', 'CLIENT_COLLECTION_REVERSED',
    'INVENTORY_ITEM_CREATED', 'INVENTORY_ITEM_UPDATED',
    'INVENTORY_MOVEMENT_RECORDED', 'INVENTORY_MOVEMENT_REVERSED'
  ));

create or replace function private.is_assignable_company_role(p_company_id uuid, p_role_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_company_id is not null
     and p_role_key is not null
     and exists (
       select 1
       from public.company_role_catalog rc
       where rc.role_key = upper(btrim(p_role_key))
         and rc.assignable
         and not rc.is_platform_role
         and rc.archived_at is null
         and (rc.company_id is null or rc.company_id = p_company_id)
     );
$$;

create or replace function private.enforce_company_role_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.role_key := upper(btrim(new.role_key));
  if not (select private.is_assignable_company_role(new.company_id, new.role_key)) then
    raise exception 'Role is not assignable in this company' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists company_members_role_scope on public.company_members;
create trigger company_members_role_scope
before insert or update of company_id, role_key on public.company_members
for each row execute function private.enforce_company_role_scope();

drop trigger if exists company_invitations_role_scope on public.company_invitations;
create trigger company_invitations_role_scope
before insert or update of company_id, role_key on public.company_invitations
for each row execute function private.enforce_company_role_scope();

-- Only currently member-assignable operational permissions can enter a custom
-- role. Root/company-access authority remains protected even if a caller sends
-- a raw RPC payload instead of using the picker UI.
create or replace function private.assert_custom_role_permissions(p_permission_keys jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_permission_key text;
  v_seen text[] := array[]::text[];
  v_permissions jsonb := coalesce(p_permission_keys, '[]'::jsonb);
begin
  if jsonb_typeof(v_permissions) <> 'array' then
    raise exception 'Role permissions must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(v_permissions) > 100 then
    raise exception 'A custom role may contain at most 100 permissions' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(v_permissions)
  loop
    if jsonb_typeof(v_item) <> 'string' then
      raise exception 'Each role permission must be a string' using errcode = '22023';
    end if;
    v_permission_key := lower(btrim(v_item #>> '{}'));
    if v_permission_key = '' or v_permission_key = any(v_seen) then
      raise exception 'Role permissions must be unique non-empty strings' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_permission_key);
    if not exists (
      select 1
      from public.company_permission_catalog pc
      where pc.permission_key = v_permission_key
        and pc.member_assignable
        and pc.permission_key not like 'platform.%'
        and pc.permission_key not in ('company.members.manage', 'company.settings.manage')
    ) then
      raise exception 'Permission is reserved, unknown, or not assignable to a custom role' using errcode = '42501';
    end if;
  end loop;
end;
$$;

revoke execute on function private.is_assignable_company_role(uuid, text) from public, anon;
revoke execute on function private.enforce_company_role_scope() from public, anon, authenticated;
revoke execute on function private.assert_custom_role_permissions(jsonb) from public, anon, authenticated;

-- The same effective-permission authority now ignores archived roles and
-- rejects a custom role that belongs to another company.
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
       join public.company_role_catalog rc
         on rc.role_key = cm.role_key
        and (rc.company_id is null or rc.company_id = cm.company_id)
        and rc.assignable
        and not rc.is_platform_role
        and rc.archived_at is null
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
    join public.company_role_catalog rc
      on rc.role_key = cm.role_key
     and (rc.company_id is null or rc.company_id = cm.company_id)
     and rc.assignable
     and not rc.is_platform_role
     and rc.archived_at is null
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

grant execute on function private.member_has_company_permission(uuid, uuid, text) to authenticated;
grant execute on function private.effective_company_permissions(uuid, uuid) to authenticated;
revoke execute on function private.member_has_company_permission(uuid, uuid, text) from public, anon;
revoke execute on function private.effective_company_permissions(uuid, uuid) from public, anon;

drop function if exists public.platform_list_company_roles(uuid);
create function public.platform_list_company_roles(p_company_id uuid)
returns table(
  role_key text,
  company_id uuid,
  display_name text,
  description text,
  assignable boolean,
  is_builtin boolean,
  is_platform_role boolean,
  archived_at timestamptz,
  updated_at timestamptz,
  permissions jsonb,
  member_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Role catalog cannot target another HydroQualiSense deployment' using errcode = '42501';
  end if;
  if not (
    (select private.has_company_permission(p_company_id, 'company.members.read'))
    or (select private.has_company_permission(p_company_id, 'company.members.manage'))
  ) then
    raise exception 'Company role-catalog permission is required' using errcode = '42501';
  end if;

  return query
  select rc.role_key,
         rc.company_id,
         rc.display_name,
         rc.description,
         rc.assignable,
         rc.is_builtin,
         rc.is_platform_role,
         rc.archived_at,
         rc.updated_at,
         coalesce((
           select jsonb_agg(rp.permission_key order by rp.permission_key)
           from public.company_role_permissions rp
           where rp.role_key = rc.role_key
         ), '[]'::jsonb),
         (
           select count(*)
           from public.company_members cm
           where cm.company_id = p_company_id
             and cm.role_key = rc.role_key
         )
  from public.company_role_catalog rc
  where (rc.company_id is null and not rc.is_platform_role)
     or rc.company_id = p_company_id
  order by rc.is_builtin desc, (rc.archived_at is not null), lower(rc.display_name), rc.role_key;
end;
$$;

create or replace function public.create_company_role(
  p_company_id uuid,
  p_display_name text,
  p_description text default null,
  p_permission_keys jsonb default '[]'::jsonb,
  p_source_role_key text default null
)
returns public.company_role_catalog
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.company_role_catalog;
  v_source public.company_role_catalog;
  v_permissions jsonb := coalesce(p_permission_keys, '[]'::jsonb);
  v_role_key text;
begin
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Custom roles cannot target another HydroQualiSense deployment' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(p_company_id, 'company.members.manage')) then
    raise exception 'Company access-management permission is required' using errcode = '42501';
  end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 120 then
    raise exception 'A custom role name between 1 and 120 characters is required' using errcode = '22023';
  end if;
  if p_description is not null and length(btrim(p_description)) > 500 then
    raise exception 'A custom role description may not exceed 500 characters' using errcode = '22023';
  end if;

  if p_source_role_key is not null then
    select * into v_source
    from public.company_role_catalog rc
    where rc.role_key = upper(btrim(p_source_role_key))
      and rc.assignable
      and not rc.is_platform_role
      and rc.archived_at is null
      and (rc.company_id is null or rc.company_id = p_company_id)
    for share;
    if not found then
      raise exception 'The source role is not available in this company' using errcode = '42501';
    end if;
    if jsonb_array_length(v_permissions) > 0 then
      raise exception 'Choose either a source role or explicit permissions, not both' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(rp.permission_key order by rp.permission_key), '[]'::jsonb)
      into v_permissions
    from public.company_role_permissions rp
    where rp.role_key = v_source.role_key;
  end if;

  perform private.assert_custom_role_permissions(v_permissions);
  v_role_key := 'CUSTOM_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 48));

  insert into public.company_role_catalog (
    role_key, company_id, display_name, description, assignable, is_platform_role, is_builtin, archived_at
  ) values (
    v_role_key, p_company_id, btrim(p_display_name), btrim(coalesce(p_description, '')), true, false, false, null
  ) returning * into v_role;

  insert into public.company_role_permissions (role_key, permission_key)
  select v_role.role_key, lower(value)
  from jsonb_array_elements_text(v_permissions);

  perform private.write_company_audit(
    p_company_id,
    'CUSTOM_ROLE_CREATED',
    'role',
    null,
    jsonb_build_object(
      'role_key', v_role.role_key,
      'display_name', v_role.display_name,
      'permission_count', jsonb_array_length(v_permissions),
      'source_role_key', p_source_role_key
    )
  );
  return v_role;
end;
$$;

create or replace function public.update_company_role(
  p_company_id uuid,
  p_role_key text,
  p_display_name text,
  p_description text default null,
  p_permission_keys jsonb default '[]'::jsonb
)
returns public.company_role_catalog
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.company_role_catalog;
  v_permissions jsonb := coalesce(p_permission_keys, '[]'::jsonb);
begin
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Custom roles cannot target another HydroQualiSense deployment' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(p_company_id, 'company.members.manage')) then
    raise exception 'Company access-management permission is required' using errcode = '42501';
  end if;
  select * into v_role
  from public.company_role_catalog rc
  where rc.role_key = upper(btrim(p_role_key))
    and rc.company_id = p_company_id
  for update;
  if not found then
    raise exception 'Custom role does not exist in this company' using errcode = '22023';
  end if;
  if v_role.is_builtin or v_role.is_platform_role then
    raise exception 'Built-in and platform roles are protected' using errcode = '42501';
  end if;
  if v_role.archived_at is not null or not v_role.assignable then
    raise exception 'Archived roles cannot be edited' using errcode = '42501';
  end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 120 then
    raise exception 'A custom role name between 1 and 120 characters is required' using errcode = '22023';
  end if;
  if p_description is not null and length(btrim(p_description)) > 500 then
    raise exception 'A custom role description may not exceed 500 characters' using errcode = '22023';
  end if;
  perform private.assert_custom_role_permissions(v_permissions);

  update public.company_role_catalog rc
  set display_name = btrim(p_display_name),
      description = btrim(coalesce(p_description, '')),
      updated_at = now()
  where rc.role_key = v_role.role_key;

  delete from public.company_role_permissions rp where rp.role_key = v_role.role_key;
  insert into public.company_role_permissions (role_key, permission_key)
  select v_role.role_key, lower(value)
  from jsonb_array_elements_text(v_permissions);

  select * into v_role from public.company_role_catalog rc where rc.role_key = v_role.role_key;
  perform private.write_company_audit(
    p_company_id,
    'CUSTOM_ROLE_UPDATED',
    'role',
    null,
    jsonb_build_object(
      'role_key', v_role.role_key,
      'display_name', v_role.display_name,
      'permission_count', jsonb_array_length(v_permissions)
    )
  );
  return v_role;
end;
$$;

create or replace function public.archive_company_role(
  p_company_id uuid,
  p_role_key text
)
returns public.company_role_catalog
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.company_role_catalog;
begin
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Custom roles cannot target another HydroQualiSense deployment' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(p_company_id, 'company.members.manage')) then
    raise exception 'Company access-management permission is required' using errcode = '42501';
  end if;
  select * into v_role
  from public.company_role_catalog rc
  where rc.role_key = upper(btrim(p_role_key))
    and rc.company_id = p_company_id
  for update;
  if not found then
    raise exception 'Custom role does not exist in this company' using errcode = '22023';
  end if;
  if v_role.is_builtin or v_role.is_platform_role then
    raise exception 'Built-in and platform roles cannot be archived' using errcode = '42501';
  end if;
  if exists (select 1 from public.company_members cm where cm.company_id = p_company_id and cm.role_key = v_role.role_key)
     or exists (select 1 from public.company_invitations ci where ci.company_id = p_company_id and ci.role_key = v_role.role_key and ci.status = 'PENDING') then
    raise exception 'Reassign every member and pending authorization before archiving this role' using errcode = '23514';
  end if;

  update public.company_role_catalog rc
  set assignable = false, archived_at = coalesce(rc.archived_at, now()), updated_at = now()
  where rc.role_key = v_role.role_key
  returning * into v_role;

  perform private.write_company_audit(
    p_company_id,
    'CUSTOM_ROLE_ARCHIVED',
    'role',
    null,
    jsonb_build_object('role_key', v_role.role_key, 'display_name', v_role.display_name)
  );
  return v_role;
end;
$$;

revoke execute on function public.platform_list_company_roles(uuid) from public, anon;
revoke execute on function public.create_company_role(uuid, text, text, jsonb, text) from public, anon;
revoke execute on function public.update_company_role(uuid, text, text, text, jsonb) from public, anon;
revoke execute on function public.archive_company_role(uuid, text) from public, anon;
grant execute on function public.platform_list_company_roles(uuid) to authenticated;
grant execute on function public.create_company_role(uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.update_company_role(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.archive_company_role(uuid, text) to authenticated;

drop policy if exists company_role_catalog_select on public.company_role_catalog;
create policy company_role_catalog_select on public.company_role_catalog for select to authenticated
using (
  (company_id is null and not is_platform_role)
  or (
    company_id = (select private.deployment_company_id())
    and ((select private.is_platform_admin()) or (select private.is_active_company_member(company_id)))
  )
);

drop policy if exists company_role_permissions_select on public.company_role_permissions;
create policy company_role_permissions_select on public.company_role_permissions for select to authenticated
using (
  exists (
    select 1 from public.company_role_catalog rc
    where rc.role_key = company_role_permissions.role_key
      and (
        (rc.company_id is null and not rc.is_platform_role)
        or (
          rc.company_id = (select private.deployment_company_id())
          and ((select private.is_platform_admin()) or (select private.is_active_company_member(rc.company_id)))
        )
      )
  )
);
