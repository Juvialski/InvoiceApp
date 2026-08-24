-- Additive hardening for company AI lifecycle and encrypted-envelope access.
-- The prior company AI migration remains unchanged so existing credentials and
-- migration history are preserved.

alter table public.company_audit_events
  drop constraint if exists company_audit_events_event_type_check;

alter table public.company_audit_events
  add constraint company_audit_events_event_type_check check (event_type in (
    'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_SUSPENDED', 'COMPANY_ARCHIVED', 'COMPANY_REACTIVATED',
    'USER_INVITED', 'INVITE_REVOKED', 'INVITE_ACCEPTED',
    'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED', 'MEMBER_REACTIVATED', 'MEMBER_REVOKED',
    'PAYROLL_REPAIR_APPLIED', 'PAYROLL_CALENDAR_REBUILT', 'PAYROLL_UNAPPROVED_RESET',
    'COMPANY_AI_CREDENTIAL_CONFIGURED', 'COMPANY_AI_CREDENTIAL_ROTATED',
    'COMPANY_AI_CREDENTIAL_TESTED', 'COMPANY_AI_CREDENTIAL_ENABLED',
    'COMPANY_AI_CREDENTIAL_DISABLED', 'COMPANY_AI_CREDENTIAL_REMOVED'
  ));

alter table public.company_ai_settings
  drop constraint if exists company_ai_settings_last_test_status_check;

alter table public.company_ai_settings
  add constraint company_ai_settings_last_test_status_check check (last_test_status in (
    'SUCCESS', 'INVALID_CREDENTIAL', 'QUOTA_LIMITED', 'PROVIDER_UNAVAILABLE',
    'PROVIDER_ACCESS_DENIED', 'MODEL_UNAVAILABLE', 'NOT_TESTED'
  ));

create or replace function public.platform_enable_company_ai(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
  v_credential public.company_ai_credentials;
begin
  if (select auth.uid()) is null or not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;

  select * into v_company
  from public.companies c
  where c.id = p_company_id
  for update;
  if not found then
    raise exception 'Company does not exist' using errcode = '22023';
  end if;

  select * into v_credential
  from public.company_ai_credentials c
  where c.company_id = p_company_id and c.provider = 'GEMINI'
  for update;
  if not found then
    raise exception 'A stored Gemini credential is required before AI can be enabled' using errcode = '22023';
  end if;
  if v_credential.status = 'INVALID' then
    raise exception 'The stored Gemini credential is invalid; replace it before enabling AI' using errcode = '22023';
  end if;

  insert into public.company_ai_settings (
    company_id, provider, enabled, credential_configured, credential_last4,
    credential_version, status, updated_at
  ) values (
    p_company_id, 'GEMINI', true, true, v_credential.key_last4,
    v_credential.credential_version, 'ACTIVE', now()
  )
  on conflict (company_id) do update set
    enabled = true,
    credential_configured = true,
    credential_last4 = excluded.credential_last4,
    credential_version = excluded.credential_version,
    status = 'ACTIVE',
    updated_at = now();

  update public.company_ai_credentials
  set status = 'ACTIVE', updated_by = (select auth.uid()), updated_at = now()
  where company_id = p_company_id and provider = 'GEMINI';

  perform private.write_company_audit(
    p_company_id,
    'COMPANY_AI_CREDENTIAL_ENABLED',
    'company_ai_credential',
    null,
    jsonb_build_object('provider', 'GEMINI', 'credential_version', v_credential.credential_version)
  );
  return private.company_ai_config_json(p_company_id);
end;
$$;

create or replace function public.platform_disable_company_ai(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'Company does not exist' using errcode = '22023';
  end if;
  if not exists (select 1 from public.company_ai_credentials c where c.company_id = p_company_id and c.provider = 'GEMINI') then
    raise exception 'A stored Gemini credential is required before AI can be disabled' using errcode = '22023';
  end if;

  update public.company_ai_settings
  set enabled = false, status = 'DISABLED', updated_at = now()
  where company_id = p_company_id and provider = 'GEMINI';
  update public.company_ai_credentials
  set status = 'DISABLED', updated_by = (select auth.uid()), updated_at = now()
  where company_id = p_company_id and provider = 'GEMINI';

  perform private.write_company_audit(p_company_id, 'COMPANY_AI_CREDENTIAL_DISABLED', 'company_ai_credential', null, jsonb_build_object('provider', 'GEMINI'));
  return private.company_ai_config_json(p_company_id);
end;
$$;

create or replace function public.platform_record_company_ai_test(p_company_id uuid, p_test_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if (select auth.uid()) is null or not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'Company does not exist' using errcode = '22023';
  end if;
  if p_test_status not in ('SUCCESS', 'INVALID_CREDENTIAL', 'QUOTA_LIMITED', 'PROVIDER_UNAVAILABLE', 'PROVIDER_ACCESS_DENIED', 'MODEL_UNAVAILABLE') then
    raise exception 'Invalid AI test status' using errcode = '22023';
  end if;

  v_status := case
    when p_test_status = 'SUCCESS' then 'ACTIVE'
    when p_test_status = 'INVALID_CREDENTIAL' then 'INVALID'
    else coalesce((select s.status from public.company_ai_settings s where s.company_id = p_company_id and s.provider = 'GEMINI'), 'NOT_CONFIGURED')
  end;

  update public.company_ai_settings
  set status = v_status,
      enabled = case when p_test_status = 'INVALID_CREDENTIAL' then false else enabled end,
      last_tested_at = now(),
      last_test_status = p_test_status,
      updated_at = now()
  where company_id = p_company_id and provider = 'GEMINI';

  if p_test_status = 'INVALID_CREDENTIAL' then
    update public.company_ai_credentials set status = 'INVALID', updated_at = now() where company_id = p_company_id and provider = 'GEMINI';
  elsif p_test_status = 'SUCCESS' then
    update public.company_ai_credentials set status = 'ACTIVE', updated_at = now() where company_id = p_company_id and provider = 'GEMINI';
  end if;

  perform private.write_company_audit(p_company_id, 'COMPANY_AI_CREDENTIAL_TESTED', 'company_ai_credential', null, jsonb_build_object('provider', 'GEMINI', 'test_status', p_test_status));
  return private.company_ai_config_json(p_company_id);
end;
$$;

create or replace function public.resolve_company_ai_credential(p_company_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_credential public.company_ai_credentials;
  v_settings public.company_ai_settings;
  v_request_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user);
begin
  if v_request_role <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Server-only AI credential resolution is required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'Company does not exist' using errcode = '22023';
  end if;

  select * into v_settings from public.company_ai_settings s where s.company_id = p_company_id and s.provider = 'GEMINI';
  select * into v_credential from public.company_ai_credentials c where c.company_id = p_company_id and c.provider = 'GEMINI';
  if not found then
    if v_settings.company_id is null then return null; end if;
    return jsonb_build_object(
      'company_id', p_company_id,
      'provider', 'GEMINI',
      'enabled', coalesce(v_settings.enabled, false),
      'status', coalesce(v_settings.status, 'NOT_CONFIGURED'),
      'credential_version', coalesce(v_settings.credential_version, 0),
      'encryption_version', 1,
      'key_last4', v_settings.credential_last4
    );
  end if;
  return jsonb_build_object(
    'company_id', p_company_id,
    'provider', 'GEMINI',
    'enabled', coalesce(v_settings.enabled, false),
    'status', v_credential.status,
    'credential_version', v_credential.credential_version,
    'encryption_version', v_credential.encryption_version,
    'ciphertext', v_credential.ciphertext,
    'iv', v_credential.iv,
    'auth_tag', v_credential.auth_tag,
    'key_last4', v_credential.key_last4
  );
end;
$$;

-- Runtime authentication failures are recorded by the already-authenticated
-- Express server, not by the browser caller. This function accepts only the
-- narrow invalid-credential transition and returns safe metadata.
create or replace function public.server_mark_company_ai_invalid(p_company_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user);
begin
  if v_request_role <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Server-only AI credential mutation is required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'Company does not exist' using errcode = '22023';
  end if;

  update public.company_ai_settings
  set enabled = false, status = 'INVALID', last_tested_at = now(), last_test_status = 'INVALID_CREDENTIAL', updated_at = now()
  where company_id = p_company_id and provider = 'GEMINI';
  update public.company_ai_credentials
  set status = 'INVALID', updated_at = now()
  where company_id = p_company_id and provider = 'GEMINI';

  perform private.write_company_audit(p_company_id, 'COMPANY_AI_CREDENTIAL_TESTED', 'company_ai_credential', null, jsonb_build_object('provider', 'GEMINI', 'test_status', 'INVALID_CREDENTIAL'));
  return private.company_ai_config_json(p_company_id);
end;
$$;

revoke execute on function public.platform_enable_company_ai(uuid) from public, anon;
grant execute on function public.platform_enable_company_ai(uuid) to authenticated;
revoke execute on function public.platform_disable_company_ai(uuid) from public, anon;
grant execute on function public.platform_disable_company_ai(uuid) to authenticated;
revoke execute on function public.platform_record_company_ai_test(uuid, text) from public, anon;
grant execute on function public.platform_record_company_ai_test(uuid, text) to authenticated;

-- The envelope is server-only. Browser roles may read safe metadata through
-- platform_get_company_ai_config but cannot execute this resolver.
revoke execute on function public.resolve_company_ai_credential(uuid) from public, anon, authenticated;
grant execute on function public.resolve_company_ai_credential(uuid) to service_role;
revoke execute on function public.server_mark_company_ai_invalid(uuid) from public, anon, authenticated;
grant execute on function public.server_mark_company_ai_invalid(uuid) to service_role;
