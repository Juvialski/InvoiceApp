-- Core Hardening Wave 1 correction: invitation claims copy permission
-- overrides onto a newly-created membership. Because that membership cannot
-- already have overrides, use a plain insert and avoid ambiguity between the
-- RETURNS TABLE output variable `membership_id` and the table column.

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
  if v_user_id is null then
    raise exception 'Authentication is required to claim invitations' using errcode = '42501';
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
      and ci.delivery_status = 'SENT'
      and ci.expires_at > now()
      and c.status = 'ACTIVE'
    for update of ci
  loop
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
        'INVITE_REVOKED',
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

    insert into public.company_member_permission_overrides (
      company_id, membership_id, permission_key, effect, created_by_user_id
    )
    select
      cio.company_id,
      v_membership_id,
      cio.permission_key,
      cio.effect,
      cio.created_by_user_id
    from public.company_invitation_permission_overrides cio
    where cio.company_id = invitation_row.company_id
      and cio.invitation_id = invitation_row.id;

    update public.company_invitations ci
    set status = 'ACCEPTED',
        accepted_by_user_id = v_user_id,
        accepted_at = now(),
        updated_at = now()
    where ci.id = invitation_row.id;

    perform private.write_company_audit(
      invitation_row.company_id,
      'INVITE_ACCEPTED',
      'invitation',
      invitation_row.id,
      jsonb_build_object('membership_id', v_membership_id, 'role_key', invitation_row.role_key)
    );

    company_id := invitation_row.company_id;
    membership_id := v_membership_id;
    role_key := invitation_row.role_key;
    return next;
  end loop;
end;
$$;

revoke execute on function public.claim_company_invitations() from public, anon;
grant execute on function public.claim_company_invitations() to authenticated;
