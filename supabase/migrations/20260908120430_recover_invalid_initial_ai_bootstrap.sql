-- Allow the exact initial deployment operator to recover only a failed first
-- AI bootstrap. Once a credential has validated successfully, or platform
-- maintenance has taken over, replacement remains outside the bootstrap path.

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
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user) <> 'service_role'
     and current_user <> 'service_role' then
    raise exception 'Deployment AI bootstrap is server-only' using errcode = '42501';
  end if;
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
    p_company_id, p_operator_user_id, 'COMPANY_AI_CREDENTIAL_CONFIGURED', 'company_ai_credential', null,
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

revoke all on function public.bootstrap_deployment_company_ai_credential(uuid, uuid, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.bootstrap_deployment_company_ai_credential(uuid, uuid, text, text, text, integer, text) to service_role;

comment on function public.bootstrap_deployment_company_ai_credential(uuid, uuid, text, text, text, integer, text)
  is 'One-time initial deployment AI bootstrap with bounded recovery for an invalid first credential before any successful provider validation; service-role/server only.';
