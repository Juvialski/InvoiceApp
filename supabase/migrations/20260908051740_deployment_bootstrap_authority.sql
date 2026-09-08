-- Guarded first-company bootstrap for a newly provisioned deployment.
--
-- This is an operator/service-role authority, not a browser onboarding path.
-- It deliberately refuses an already-configured or historically populated
-- project so a provisioning mistake cannot silently select or merge a company.

create or replace function public.bootstrap_deployment_company(
  p_admin_user_id uuid,
  p_name text,
  p_company_code text,
  p_default_currency text default 'PHP',
  p_timezone text default 'Asia/Manila'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_configured_company_id uuid;
  v_company public.companies;
  v_membership_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_company_code text := btrim(coalesce(p_company_code, ''));
  v_currency text := upper(btrim(coalesce(p_default_currency, 'PHP')));
  v_timezone text := btrim(coalesce(p_timezone, 'Asia/Manila'));
begin
  if p_admin_user_id is null then
    raise exception 'An existing Auth user is required for the initial Company Admin'
      using errcode = '22023';
  end if;
  if v_name = '' or length(v_name) > 200 then
    raise exception 'A deployment company name between 1 and 200 characters is required'
      using errcode = '22023';
  end if;
  if v_company_code !~ '^[a-z0-9][a-z0-9-]{0,63}$'
     or v_company_code <> lower(v_company_code) then
    raise exception 'The deployment company code must be lowercase letters, numbers, and hyphens'
      using errcode = '22023';
  end if;
  if v_currency !~ '^[A-Z]{3}$' or v_currency <> upper(v_currency) then
    raise exception 'The deployment company currency must be a three-letter uppercase code'
      using errcode = '22023';
  end if;
  if v_timezone = '' or length(v_timezone) > 100 then
    raise exception 'A deployment company timezone between 1 and 100 characters is required'
      using errcode = '22023';
  end if;

  -- Only one operator may attempt the first bootstrap at a time. This also
  -- makes a repeated provisioning command deterministic after a network retry.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hydroqualisense.deployment.bootstrap', 0)
  );

  select dc.company_id
    into v_configured_company_id
  from public.deployment_configuration dc
  where dc.singleton = true
  for update;

  if v_configured_company_id is not null then
    select c.*
      into v_company
    from public.companies c
    where c.id = v_configured_company_id;

    select cm.id
      into v_membership_id
    from public.company_members cm
    where cm.company_id = v_configured_company_id
      and cm.user_id = p_admin_user_id
      and cm.role_key = 'COMPANY_ADMIN'
      and cm.status = 'ACTIVE';

    if v_company.name = v_name
       and v_company.company_code = v_company_code
       and v_company.default_currency = v_currency
       and v_company.timezone = v_timezone
       and v_membership_id is not null then
      return jsonb_build_object(
        'company_id', v_company.id,
        'membership_id', v_membership_id,
        'admin_user_id', p_admin_user_id,
        'company_code', v_company.company_code,
        'idempotent', true
      );
    end if;

    raise exception 'This deployment is already configured; refusing to retarget its company or administrator'
      using errcode = '55000';
  end if;

  if exists (select 1 from public.companies) then
    raise exception 'This deployment contains company history but has no configuration; refusing implicit bootstrap'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = p_admin_user_id
      and u.email is not null
      and coalesce(u.email_confirmed_at, u.confirmed_at) is not null
  ) then
    raise exception 'The initial Company Admin must be an existing confirmed Auth user'
      using errcode = '22023';
  end if;

  insert into public.companies (
    name,
    company_code,
    status,
    default_currency,
    timezone
  ) values (
    v_name,
    v_company_code,
    'ACTIVE',
    v_currency,
    v_timezone
  )
  returning * into v_company;

  insert into public.deployment_configuration (singleton, company_id)
  values (true, v_company.id);

  insert into public.company_members (
    company_id,
    user_id,
    role_key,
    status,
    joined_at
  ) values (
    v_company.id,
    p_admin_user_id,
    'COMPANY_ADMIN',
    'ACTIVE',
    now()
  )
  returning id into v_membership_id;

  -- The operator service-role call has no application actor. Keep the audit
  -- actor NULL and retain the operator-controlled method plus the provisioned
  -- administrator in metadata rather than fabricating a platform user.
  insert into public.company_audit_events (
    company_id,
    actor_user_id,
    event_type,
    target_type,
    target_id,
    metadata
  ) values (
    v_company.id,
    null,
    'COMPANY_CREATED',
    'company',
    v_company.id,
    jsonb_build_object(
      'bootstrap', true,
      'operator_controlled', true,
      'initial_admin_user_id', p_admin_user_id,
      'company_code', v_company.company_code
    )
  );

  return jsonb_build_object(
    'company_id', v_company.id,
    'membership_id', v_membership_id,
    'admin_user_id', p_admin_user_id,
    'company_code', v_company.company_code,
    'idempotent', false
  );
end;
$$;

revoke all on function public.bootstrap_deployment_company(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.bootstrap_deployment_company(uuid, text, text, text, text)
  to service_role;

comment on function public.bootstrap_deployment_company(uuid, text, text, text, text)
  is 'Operator-controlled, idempotent first-company bootstrap for a blank isolated deployment; never expose to browser roles.';
