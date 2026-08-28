-- Adversarial follow-up for single-company access administration.
-- Keep at least one active COMPANY_ADMIN and prevent membership/invitation rows
-- from being retargeted to another company after deployment configuration.

create or replace function private.enforce_deployment_company_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deployment_company_id uuid := (select private.deployment_company_id());
  v_other_admins integer;
begin
  if v_deployment_company_id is not null and new.company_id is distinct from v_deployment_company_id then
    raise exception 'Membership cannot target a company outside this Engoryx deployment' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id or new.user_id is distinct from old.user_id then
      raise exception 'Membership identity and deployment company are immutable' using errcode = '42501';
    end if;
    if old.role_key = 'COMPANY_ADMIN' and old.status = 'ACTIVE'
       and (new.role_key is distinct from 'COMPANY_ADMIN' or new.status is distinct from 'ACTIVE') then
      select count(*)::integer into v_other_admins
      from public.company_members cm
      where cm.company_id = old.company_id
        and cm.id <> old.id
        and cm.role_key = 'COMPANY_ADMIN'
        and cm.status = 'ACTIVE';
      if v_other_admins = 0 then
        raise exception 'At least one active Company Admin must remain in the deployment company' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_deployment_company_membership() from public, anon, authenticated;

drop trigger if exists company_members_deployment_guard on public.company_members;
create trigger company_members_deployment_guard
before insert or update on public.company_members
for each row execute function private.enforce_deployment_company_membership();

create or replace function private.enforce_deployment_company_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deployment_company_id uuid := (select private.deployment_company_id());
begin
  if v_deployment_company_id is not null and new.company_id is distinct from v_deployment_company_id then
    raise exception 'Invitation cannot target a company outside this Engoryx deployment' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then
    raise exception 'Invitation deployment company is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_deployment_company_invitation() from public, anon, authenticated;

drop trigger if exists company_invitations_deployment_guard on public.company_invitations;
create trigger company_invitations_deployment_guard
before insert or update on public.company_invitations
for each row execute function private.enforce_deployment_company_invitation();

create or replace function private.prevent_additional_deployment_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.deployment_company_id()) is not null then
    raise exception 'This Supabase project is already configured for one Engoryx client company; provision another deployment for another company'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.prevent_additional_deployment_company() from public, anon, authenticated;

drop trigger if exists companies_single_deployment_guard on public.companies;
create trigger companies_single_deployment_guard
before insert on public.companies
for each row execute function private.prevent_additional_deployment_company();
