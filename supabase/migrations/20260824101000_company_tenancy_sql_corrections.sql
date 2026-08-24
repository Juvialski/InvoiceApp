-- Small correctness follow-up for the final security contract.

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

revoke execute on function public.claim_company_invitations() from public, anon;
grant execute on function public.claim_company_invitations() to authenticated;
