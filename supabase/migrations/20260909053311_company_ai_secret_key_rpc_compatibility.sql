-- Modern Supabase sb_secret_... keys are not JWTs. The Data API authorizes
-- them through the service_role Postgres role, so exact EXECUTE grants are the
-- caller boundary for these server-only RPCs. Do not inspect the legacy
-- request.jwt.claim.role setting here: it may be absent for a modern secret
-- key. Do not use current_user as an invoker test inside SECURITY DEFINER
-- functions because it resolves to the function owner while the body runs.
-- A trusted database owner can still invoke a function directly; that is
-- database administration, not a browser/API role. Public Data API callers
-- must pass the service_role grant below.

create or replace function public.bootstrap_deployment_company_ai_credential(
  p_company_id uuid,
  p_operator_user_id uuid,
  p_ciphertext text,
  p_iv text,
  p_auth_tag text,
  p_encryption_version integer,
  p_key_last4 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
  v_settings_status text;
  v_settings_version integer;
  v_credential_status text;
  v_credential_version integer;
  v_existing boolean := false;
  v_bootstrap_owned boolean := false;
  v_has_successful_test boolean := false;
  v_version integer := 1;
begin
  if p_company_id is null or p_company_id is distinct from v_company_id then
    raise exception 'Deployment AI bootstrap cannot target another company' using errcode = '42501';
  end if;
  if p_operator_user_id is null then
    raise exception 'An authenticated initial deployment operator is required' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.company_id = p_company_id
      and cm.user_id = p_operator_user_id
      and cm.role_key = 'COMPANY_ADMIN'
      and cm.status = 'ACTIVE'
      and c.status = 'ACTIVE'
  ) then
    raise exception 'The initial deployment operator must be the active Company Admin' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.company_audit_events ae
    where ae.company_id = p_company_id
      and ae.event_type = 'COMPANY_CREATED'
      and coalesce((ae.metadata ->> 'bootstrap')::boolean, false)
      and ae.metadata ->> 'initial_admin_user_id' = p_operator_user_id::text
  ) then
    raise exception 'Initial deployment operator authorization is required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_ciphertext, '')), '') is null
     or nullif(btrim(coalesce(p_iv, '')), '') is null
     or nullif(btrim(coalesce(p_auth_tag, '')), '') is null
     or p_encryption_version <> 1
     or p_key_last4 is null
     or length(p_key_last4) not between 1 and 4 then
    raise exception 'The encrypted credential envelope is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text || ':deployment-ai-bootstrap', 0)
  );

  select s.status, s.credential_version
    into v_settings_status, v_settings_version
  from public.company_ai_settings s
  where s.company_id = p_company_id and s.provider = 'GEMINI';

  select c.status, c.credential_version
    into v_credential_status, v_credential_version
  from public.company_ai_credentials c
  where c.company_id = p_company_id and c.provider = 'GEMINI';

  v_existing := v_settings_status is not null or v_credential_status is not null;
  if v_existing then
    select exists (
      select 1
      from public.company_audit_events ae
      where ae.company_id = p_company_id
        and ae.event_type in ('COMPANY_AI_CREDENTIAL_CONFIGURED', 'COMPANY_AI_CREDENTIAL_ROTATED')
        and coalesce((ae.metadata ->> 'bootstrap')::boolean, false)
        and ae.metadata ->> 'operator_user_id' = p_operator_user_id::text
    ) into v_bootstrap_owned;

    select exists (
      select 1
      from public.company_audit_events ae
      where ae.company_id = p_company_id
        and ae.event_type = 'COMPANY_AI_CREDENTIAL_TESTED'
        and ae.metadata ->> 'test_status' = 'SUCCESS'
    ) into v_has_successful_test;

    if v_settings_status = 'INVALID'
       and v_credential_status = 'INVALID'
       and v_bootstrap_owned
       and not v_has_successful_test then
      v_version := greatest(coalesce(v_settings_version, 0), coalesce(v_credential_version, 0)) + 1;

      update public.company_ai_settings
      set enabled = true,
          credential_configured = true,
          credential_last4 = p_key_last4,
          credential_version = v_version,
          status = 'ACTIVE',
          last_tested_at = null,
          last_test_status = 'NOT_TESTED',
          updated_at = now()
      where company_id = p_company_id and provider = 'GEMINI';

      update public.company_ai_credentials
      set ciphertext = p_ciphertext,
          iv = p_iv,
          auth_tag = p_auth_tag,
          encryption_version = p_encryption_version,
          credential_version = v_version,
          key_last4 = p_key_last4,
          status = 'ACTIVE',
          updated_by = p_operator_user_id,
          updated_at = now(),
          rotated_at = now()
      where company_id = p_company_id and provider = 'GEMINI';

      insert into public.company_audit_events (
        company_id, actor_user_id, event_type, target_type, target_id, metadata
      ) values (
        p_company_id, p_operator_user_id, 'COMPANY_AI_CREDENTIAL_ROTATED', 'company_ai_credential', null,
        jsonb_build_object(
          'provider', 'GEMINI',
          'credential_version', v_version,
          'key_last4', p_key_last4,
          'bootstrap', true,
          'operator_user_id', p_operator_user_id,
          'reason', 'invalid_initial_credential'
        )
      );

      return private.company_ai_config_json(p_company_id)
        || jsonb_build_object('idempotent', false, 'recoveredInvalidBootstrap', true);
    end if;

    if v_settings_status = 'INVALID' or v_credential_status = 'INVALID'
       or v_settings_status = 'DISABLED' or v_credential_status = 'DISABLED'
       or v_settings_status is null or v_credential_status is null then
      raise exception 'Initial deployment AI configuration is already complete; use the platform maintenance workflow'
        using errcode = '55000';
    end if;

    -- A network retry after the first successful persistence is metadata-only.
    -- Never overwrite an active stored credential through the bootstrap path.
    return private.company_ai_config_json(p_company_id) || jsonb_build_object('idempotent', true);
  end if;

  insert into public.company_ai_settings (
    company_id, provider, enabled, credential_configured, credential_last4,
    credential_version, status, last_test_status, updated_at
  ) values (
    p_company_id, 'GEMINI', true, true, p_key_last4,
    v_version, 'ACTIVE', 'NOT_TESTED', now()
  );

  insert into public.company_ai_credentials (
    company_id, provider, ciphertext, iv, auth_tag, encryption_version,
    credential_version, key_last4, status, created_by, updated_by, rotated_at
  ) values (
    p_company_id, 'GEMINI', p_ciphertext, p_iv, p_auth_tag, p_encryption_version,
    v_version, p_key_last4, 'ACTIVE', p_operator_user_id, p_operator_user_id, now()
  );

  insert into public.company_audit_events (
    company_id, actor_user_id, event_type, target_type, target_id, metadata
  ) values (
    p_company_id, null, 'COMPANY_AI_CREDENTIAL_CONFIGURED', 'company_ai_credential', null,
    jsonb_build_object(
      'provider', 'GEMINI',
      'credential_version', v_version,
      'key_last4', p_key_last4,
      'bootstrap', true,
      'operator_user_id', p_operator_user_id
    )
  );

  return private.company_ai_config_json(p_company_id) || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.server_get_company_ai_config(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'AI configuration must belong to the deployment company' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'Company does not exist' using errcode = '22023';
  end if;
  return private.company_ai_config_json(p_company_id);
end;
$$;

create or replace function public.server_record_company_ai_test(p_company_id uuid, p_test_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'AI configuration must belong to the deployment company' using errcode = '42501';
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
  insert into public.company_audit_events (
    company_id, actor_user_id, event_type, target_type, target_id, metadata
  ) values (
    p_company_id, null, 'COMPANY_AI_CREDENTIAL_TESTED', 'company_ai_credential', null,
    jsonb_build_object('provider', 'GEMINI', 'test_status', p_test_status, 'server_recorded', true)
  );
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
begin
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'AI configuration must belong to the deployment company' using errcode = '42501';
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
-- narrow invalid-credential transition and returns safe metadata. Its exact
-- service_role EXECUTE grant is the server-only boundary.
create or replace function public.server_mark_company_ai_invalid(p_company_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'AI configuration must belong to the deployment company' using errcode = '42501';
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

revoke all on function public.bootstrap_deployment_company_ai_credential(uuid, uuid, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.bootstrap_deployment_company_ai_credential(uuid, uuid, text, text, text, integer, text) to service_role;
revoke all on function public.server_get_company_ai_config(uuid) from public, anon, authenticated;
grant execute on function public.server_get_company_ai_config(uuid) to service_role;
revoke all on function public.server_record_company_ai_test(uuid, text) from public, anon, authenticated;
grant execute on function public.server_record_company_ai_test(uuid, text) to service_role;
revoke all on function public.resolve_company_ai_credential(uuid) from public, anon, authenticated;
grant execute on function public.resolve_company_ai_credential(uuid) to service_role;
revoke all on function public.server_mark_company_ai_invalid(uuid) from public, anon, authenticated;
grant execute on function public.server_mark_company_ai_invalid(uuid) to service_role;

comment on function public.bootstrap_deployment_company_ai_credential(uuid, uuid, text, text, text, integer, text)
  is 'One-time initial deployment AI bootstrap for encrypted company AI credentials; modern Supabase secret-key compatible through exact service_role execution grants and never platform-admin authority.';

comment on function public.server_get_company_ai_config(uuid)
  is 'Server-only safe AI metadata lookup; modern Supabase secret-key compatible through exact service_role execution grant.';

comment on function public.server_record_company_ai_test(uuid, text)
  is 'Server-only AI test-status recording; modern Supabase secret-key compatible through exact service_role execution grant.';
