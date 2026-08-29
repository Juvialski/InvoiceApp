-- Engoryx email access preauthorization.
--
-- A company administrator authorizes a normalized email in the deployment
-- database. The user still signs up through Supabase Auth and can claim only
-- after Auth confirms the exact email address. Existing delivery columns and
-- historical delivery states remain intact for compatibility, but delivery is
-- no longer an authorization condition.

-- Keep the append-only audit allowlist a strict superset of every event
-- established by the current main branch, then add explicit preauthorization
-- lifecycle events. Existing USER_INVITED/INVITE_* records remain valid.
alter table public.company_audit_events
  drop constraint if exists company_audit_events_event_type_check;
alter table public.company_audit_events
  add constraint company_audit_events_event_type_check check (event_type in (
    'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_SUSPENDED', 'COMPANY_ARCHIVED', 'COMPANY_REACTIVATED',
    'USER_INVITED', 'INVITE_REVOKED', 'INVITE_ACCEPTED', 'INVITATION_SENT', 'INVITATION_DELIVERY_FAILED',
    'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED', 'MEMBER_REACTIVATED', 'MEMBER_REVOKED', 'MEMBER_PERMISSIONS_UPDATED',
    'PAYROLL_REPAIR_APPLIED', 'PAYROLL_CALENDAR_REBUILT', 'PAYROLL_UNAPPROVED_RESET', 'PAYROLL_WORKSPACE_RESET',
    'COMPANY_AI_CREDENTIAL_CONFIGURED', 'COMPANY_AI_CREDENTIAL_ROTATED',
    'COMPANY_AI_CREDENTIAL_TESTED', 'COMPANY_AI_CREDENTIAL_ENABLED',
    'COMPANY_AI_CREDENTIAL_DISABLED', 'COMPANY_AI_CREDENTIAL_REMOVED',
    'CASH_ACCOUNT_CREATED', 'CASH_ACCOUNT_UPDATED', 'CASH_ACCOUNT_DEACTIVATED',
    'CASH_BALANCE_SNAPSHOT_RECORDED', 'CASH_STATEMENT_IMPORTED', 'CASH_STATEMENT_REJECTED',
    'CASH_TRANSACTION_CREATED', 'CASH_TRANSACTION_UPDATED',
    'CASH_RECONCILIATION_CONFIRMED', 'CASH_RECONCILIATION_REMOVED', 'CASH_TRANSFER_MATCHED',
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
    'WORK_ENTRY_VOIDED', 'WORK_ENTRY_DELETED_UNUSED',
    'ATTENDANCE_VOIDED', 'ATTENDANCE_DELETED_UNUSED',
    'LEAVE_CANCELLED', 'LEAVE_DELETED_UNUSED',
    'OVERTIME_CANCELLED', 'OVERTIME_DELETED_UNUSED',
    'PROJECT_DELETED_UNUSED', 'PROJECT_ARCHIVED', 'PROJECT_REACTIVATED',
    'INVOICE_DELETED_UNUSED', 'INVOICE_VOIDED', 'INVOICE_ARCHIVED', 'INVOICE_RESTORED',
    'EXPENSE_DELETED_UNUSED', 'EXPENSE_VOIDED', 'EXPENSE_ARCHIVED', 'EXPENSE_RESTORED',
    'ACCESS_AUTHORIZATION_CREATED', 'ACCESS_AUTHORIZATION_PERMISSIONS_UPDATED',
    'ACCESS_AUTHORIZATION_REVOKED', 'ACCESS_AUTHORIZATION_ACCEPTED',
    'MEMBERSHIP_CREATED', 'PERMISSION_OVERRIDES_TRANSFERRED'
  ));

-- Expired rows no longer occupy the pending-email uniqueness slot. This is
-- deliberately done before the duplicate check in the new browser RPC so an
-- administrator can authorize the same address again after expiry.
create or replace function public.authorize_company_member_email(
  p_company_id uuid,
  p_email text,
  p_role_key text,
  p_permission_overrides jsonb default '[]'::jsonb,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns public.company_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text := lower(btrim(p_email));
  v_existing_status text;
  v_invitation public.company_invitations;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to authorize company access' using errcode = '42501';
  end if;
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Access authorization cannot target another Engoryx deployment' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.companies c
    where c.id = p_company_id and c.status = 'ACTIVE'
  ) then
    raise exception 'Only an active deployment company can authorize access' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(p_company_id, 'company.members.manage')) then
    raise exception 'Company access-management permission is required' using errcode = '42501';
  end if;
  if p_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid access-authorization email is required' using errcode = '22023';
  end if;

  update public.company_invitations ci
  set status = 'EXPIRED', updated_at = now()
  where ci.company_id = p_company_id
    and ci.normalized_email = v_email
    and ci.status = 'PENDING'
    and ci.expires_at is not null
    and ci.expires_at <= now();

  select cm.status into v_existing_status
  from public.company_members cm
  join auth.users u on u.id = cm.user_id
  where cm.company_id = p_company_id
    and lower(btrim(u.email)) = v_email
  for update of cm;
  if found then
    if v_existing_status = 'ACTIVE' then
      raise exception 'This email already has company access.' using errcode = '23505';
    end if;
    raise exception 'This email already has % company access. Reactivate or correct the existing membership instead of adding access.', lower(v_existing_status)
      using errcode = '23505';
  end if;

  v_invitation := private.create_company_invitation(
    v_user_id,
    p_company_id,
    v_email,
    p_role_key,
    p_expires_at,
    p_permission_overrides
  );

  perform private.write_company_audit(
    v_invitation.company_id,
    'ACCESS_AUTHORIZATION_CREATED',
    'invitation',
    v_invitation.id,
    jsonb_build_object(
      'normalized_email', v_invitation.normalized_email,
      'role_key', v_invitation.role_key,
      'expires_at', v_invitation.expires_at,
      'permission_override_count', jsonb_array_length(coalesce(p_permission_overrides, '[]'::jsonb)),
      'delivery_required', false
    )
  );
  return v_invitation;
end;
$$;

-- Pending authorization overrides are edited through the same database-side
-- catalog, caller-held-permission, and company-boundary checks as member
-- overrides. The invitation row lock serializes this with claiming.
create or replace function public.update_company_invitation_permissions(
  p_company_id uuid,
  p_invitation_id uuid,
  p_overrides jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invitation public.company_invitations;
  v_item jsonb;
  v_permission_key text;
  v_effect text;
  v_seen text[] := array[]::text[];
  v_permission_overrides jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to update company access' using errcode = '42501';
  end if;
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Permission overrides cannot target another Engoryx deployment' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(p_company_id, 'company.members.manage')) then
    raise exception 'Company access-management permission is required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_overrides, '[]'::jsonb)) <> 'array' then
    raise exception 'Permission overrides must be an array' using errcode = '22023';
  end if;

  select ci.* into v_invitation
  from public.company_invitations ci
  where ci.id = p_invitation_id
    and ci.company_id = p_company_id
  for update;
  if not found then
    raise exception 'Access authorization does not exist in the deployment company' using errcode = '22023';
  end if;
  if v_invitation.status <> 'PENDING' then
    raise exception 'Only pending access authorizations can be edited' using errcode = '22023';
  end if;
  if v_invitation.expires_at <= now() then
    update public.company_invitations ci
    set status = 'EXPIRED', updated_at = now()
    where ci.id = v_invitation.id;
    raise exception 'Access authorization has expired; create a new authorization' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb))
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
      raise exception 'A permission may appear only once in overrides' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_permission_key);
    if not exists (
      select 1 from public.company_permission_catalog pc
      where pc.permission_key = v_permission_key and pc.member_assignable
    ) then
      raise exception 'Permission is reserved or not assignable to an individual member' using errcode = '42501';
    end if;
    if not (select private.member_has_company_permission(p_company_id, v_user_id, v_permission_key)) then
      raise exception 'You cannot assign a permission you do not hold' using errcode = '42501';
    end if;
  end loop;

  delete from public.company_invitation_permission_overrides cio
  where cio.company_id = p_company_id and cio.invitation_id = p_invitation_id;

  insert into public.company_invitation_permission_overrides (
    company_id, invitation_id, permission_key, effect, created_by_user_id
  )
  select p_company_id, p_invitation_id,
         lower(btrim(item.value ->> 'permission_key')),
         upper(btrim(item.value ->> 'effect')),
         v_user_id
  from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb)) item;

  select coalesce(jsonb_agg(jsonb_build_object('permission_key', cio.permission_key, 'effect', cio.effect) order by cio.permission_key), '[]'::jsonb)
    into v_permission_overrides
  from public.company_invitation_permission_overrides cio
  where cio.company_id = p_company_id and cio.invitation_id = p_invitation_id;

  perform private.write_company_audit(
    p_company_id,
    'ACCESS_AUTHORIZATION_PERMISSIONS_UPDATED',
    'invitation',
    p_invitation_id,
    jsonb_build_object(
      'normalized_email', v_invitation.normalized_email,
      'permission_overrides', v_permission_overrides
    )
  );

  return jsonb_build_object(
    'invitation_id', p_invitation_id,
    'permission_overrides', v_permission_overrides
  );
end;
$$;

-- The browser directory needs the pending override state but does not get
-- direct table write access. Historical delivery fields are returned for
-- secondary compatibility consumers; the primary UI intentionally ignores
-- them for pending access.
create or replace function public.platform_list_company_invitations_with_overrides(p_company_id uuid)
returns table(
  id uuid,
  company_id uuid,
  normalized_email text,
  role_key text,
  status text,
  invited_by_user_id uuid,
  accepted_by_user_id uuid,
  created_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz,
  delivery_status text,
  delivery_error text,
  sent_at timestamptz,
  permission_overrides jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to list company access' using errcode = '42501';
  end if;
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Access authorizations cannot be listed outside this Engoryx deployment' using errcode = '42501';
  end if;
  if not (
    (select private.has_company_permission(p_company_id, 'company.members.read'))
    or (select private.has_company_permission(p_company_id, 'company.members.manage'))
  ) then
    raise exception 'Company access-authorization list permission is required' using errcode = '42501';
  end if;

  update public.company_invitations ci
  set status = 'EXPIRED', updated_at = now()
  where ci.company_id = p_company_id
    and ci.status = 'PENDING'
    and ci.expires_at <= now();

  return query
  select ci.id,
         ci.company_id,
         ci.normalized_email,
         ci.role_key,
         ci.status,
         ci.invited_by_user_id,
         ci.accepted_by_user_id,
         ci.created_at,
         ci.accepted_at,
         ci.expires_at,
         ci.updated_at,
         ci.delivery_status,
         ci.delivery_error,
         ci.sent_at,
         coalesce((
           select jsonb_agg(jsonb_build_object('permission_key', cio.permission_key, 'effect', cio.effect) order by cio.permission_key)
           from public.company_invitation_permission_overrides cio
           where cio.company_id = ci.company_id and cio.invitation_id = ci.id
         ), '[]'::jsonb)
  from public.company_invitations ci
  where ci.company_id = p_company_id
  order by ci.created_at desc, ci.id desc;
end;
$$;

-- Revoke is an access-authorization lifecycle operation. Keep the legacy
-- INVITE_REVOKED event for consumers that still classify the same row as an
-- invitation, while adding an explicit preauthorization event.
create or replace function public.revoke_company_invitation(p_invitation_id uuid)
returns public.company_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.company_invitations;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to revoke company access' using errcode = '42501';
  end if;
  select ci.* into v_invitation
  from public.company_invitations ci
  where ci.id = p_invitation_id
  for update;
  if not found then
    raise exception 'Access authorization does not exist' using errcode = '22023';
  end if;
  if v_invitation.company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Access authorization cannot target another Engoryx deployment' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(v_invitation.company_id, 'company.members.manage')) then
    raise exception 'Company access-management permission is required' using errcode = '42501';
  end if;
  if v_invitation.status <> 'PENDING' then
    raise exception 'Only pending access authorizations can be revoked' using errcode = '22023';
  end if;

  update public.company_invitations ci
  set status = 'REVOKED', updated_at = now()
  where ci.id = p_invitation_id
  returning * into v_invitation;

  perform private.write_company_audit(
    v_invitation.company_id,
    'ACCESS_AUTHORIZATION_REVOKED',
    'invitation',
    v_invitation.id,
    jsonb_build_object('normalized_email', v_invitation.normalized_email, 'reason', 'administrator_revoked')
  );
  perform private.write_company_audit(
    v_invitation.company_id,
    'INVITE_REVOKED',
    'invitation',
    v_invitation.id,
    jsonb_build_object('normalized_email', v_invitation.normalized_email, 'authorization_mode', 'EMAIL_PREAUTHORIZATION')
  );
  return v_invitation;
end;
$$;

-- Claiming requires authenticated Supabase Auth plus a trusted, verified
-- email. Delivery state remains historical metadata and is intentionally not
-- consulted. The invitation lock and membership unique key make retries and
-- concurrent claims safe.
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
  v_override_count bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to claim company access' using errcode = '42501';
  end if;
  if v_company_id is null then
    raise exception 'Engoryx deployment company is not configured' using errcode = '55000';
  end if;
  if v_email is null then
    return;
  end if;

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
      and ci.expires_at > now()
      and c.status = 'ACTIVE'
    for update of ci
  loop
    -- Never reactivate an existing membership. This also handles a stale
    -- authorization created before an administrator added the same user.
    if exists (
      select 1
      from public.company_members cm
      where cm.company_id = invitation_row.company_id
        and cm.user_id = v_user_id
    ) then
      update public.company_invitations ci
      set status = 'REVOKED', updated_at = now()
      where ci.id = invitation_row.id;
      perform private.write_company_audit(
        invitation_row.company_id,
        'ACCESS_AUTHORIZATION_REVOKED',
        'invitation',
        invitation_row.id,
        jsonb_build_object('reason', 'membership_already_exists', 'user_id', v_user_id)
      );
      continue;
    end if;

    insert into public.company_members (
      company_id, user_id, role_key, status, invited_by_user_id, joined_at
    ) values (
      invitation_row.company_id,
      v_user_id,
      invitation_row.role_key,
      'ACTIVE',
      invitation_row.invited_by_user_id,
      now()
    )
    returning id into v_membership_id;

    select count(*) into v_override_count
    from public.company_invitation_permission_overrides cio
    where cio.company_id = invitation_row.company_id
      and cio.invitation_id = invitation_row.id;

    insert into public.company_member_permission_overrides (
      company_id, membership_id, permission_key, effect, created_by_user_id
    )
    select cio.company_id, v_membership_id, cio.permission_key, cio.effect, cio.created_by_user_id
    from public.company_invitation_permission_overrides cio
    where cio.company_id = invitation_row.company_id
      and cio.invitation_id = invitation_row.id;

    perform private.write_company_audit(
      invitation_row.company_id,
      'MEMBERSHIP_CREATED',
      'membership',
      v_membership_id,
      jsonb_build_object('user_id', v_user_id, 'role_key', invitation_row.role_key, 'authorization_id', invitation_row.id)
    );
    if v_override_count > 0 then
      perform private.write_company_audit(
        invitation_row.company_id,
        'PERMISSION_OVERRIDES_TRANSFERRED',
        'membership',
        v_membership_id,
        jsonb_build_object('authorization_id', invitation_row.id, 'override_count', v_override_count)
      );
    end if;

    update public.company_invitations ci
    set status = 'ACCEPTED', accepted_by_user_id = v_user_id, accepted_at = now(), updated_at = now()
    where ci.id = invitation_row.id;

    perform private.write_company_audit(
      invitation_row.company_id,
      'ACCESS_AUTHORIZATION_ACCEPTED',
      'invitation',
      invitation_row.id,
      jsonb_build_object('membership_id', v_membership_id, 'role_key', invitation_row.role_key, 'verified_email', v_email)
    );
    -- Preserve the established invitation lifecycle event for existing audit
    -- consumers; this does not assert that an email was delivered.
    perform private.write_company_audit(
      invitation_row.company_id,
      'INVITE_ACCEPTED',
      'invitation',
      invitation_row.id,
      jsonb_build_object('membership_id', v_membership_id, 'role_key', invitation_row.role_key, 'authorization_mode', 'EMAIL_PREAUTHORIZATION')
    );

    company_id := invitation_row.company_id;
    membership_id := v_membership_id;
    role_key := invitation_row.role_key;
    return next;
  end loop;
end;
$$;

revoke execute on function public.authorize_company_member_email(uuid, text, text, jsonb, timestamptz) from public, anon;
grant execute on function public.authorize_company_member_email(uuid, text, text, jsonb, timestamptz) to authenticated;
revoke execute on function public.update_company_invitation_permissions(uuid, uuid, jsonb) from public, anon;
grant execute on function public.update_company_invitation_permissions(uuid, uuid, jsonb) to authenticated;
revoke execute on function public.platform_list_company_invitations_with_overrides(uuid) from public, anon;
grant execute on function public.platform_list_company_invitations_with_overrides(uuid) to authenticated;
revoke execute on function public.revoke_company_invitation(uuid) from public, anon;
grant execute on function public.revoke_company_invitation(uuid) to authenticated;
revoke execute on function public.claim_company_invitations() from public, anon;
grant execute on function public.claim_company_invitations() to authenticated;
