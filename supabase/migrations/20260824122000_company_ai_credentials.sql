-- Company-scoped Gemini credentials.
--
-- The browser never writes or reads these tables directly. The ciphertext is
-- produced by the Express server with AES-256-GCM before it reaches the
-- narrowly scoped RPCs below. No plaintext credential, IV, auth tag, or
-- master-key material is written to audit metadata.

alter table public.company_audit_events
  drop constraint if exists company_audit_events_event_type_check;

alter table public.company_audit_events
  add constraint company_audit_events_event_type_check check (event_type in (
    'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_SUSPENDED', 'COMPANY_ARCHIVED', 'COMPANY_REACTIVATED',
    'USER_INVITED', 'INVITE_REVOKED', 'INVITE_ACCEPTED',
    'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED', 'MEMBER_REACTIVATED', 'MEMBER_REVOKED',
    'PAYROLL_REPAIR_APPLIED', 'PAYROLL_CALENDAR_REBUILT', 'PAYROLL_UNAPPROVED_RESET',
    'COMPANY_AI_CREDENTIAL_CONFIGURED', 'COMPANY_AI_CREDENTIAL_ROTATED',
    'COMPANY_AI_CREDENTIAL_TESTED', 'COMPANY_AI_CREDENTIAL_DISABLED', 'COMPANY_AI_CREDENTIAL_REMOVED'
  ));

create table if not exists public.company_ai_settings (
  company_id uuid primary key references public.companies(id) on delete restrict,
  provider text not null default 'GEMINI' check (provider = 'GEMINI'),
  enabled boolean not null default false,
  primary_model text not null default 'gemini-3.5-flash-lite' check (primary_model = 'gemini-3.5-flash-lite'),
  fallback_model text not null default 'gemini-3.7-flash' check (fallback_model = 'gemini-3.7-flash'),
  credential_configured boolean not null default false,
  credential_last4 text,
  credential_version integer not null default 0 check (credential_version >= 0),
  status text not null default 'NOT_CONFIGURED' check (status in ('NOT_CONFIGURED', 'ACTIVE', 'DISABLED', 'INVALID')),
  last_tested_at timestamptz,
  last_test_status text not null default 'NOT_TESTED' check (last_test_status in ('SUCCESS', 'INVALID_CREDENTIAL', 'QUOTA_LIMITED', 'PROVIDER_UNAVAILABLE', 'MODEL_UNAVAILABLE', 'NOT_TESTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_ai_credentials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  provider text not null default 'GEMINI' check (provider = 'GEMINI'),
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  encryption_version integer not null default 1 check (encryption_version >= 1),
  credential_version integer not null check (credential_version >= 1),
  key_last4 text not null check (length(key_last4) between 1 and 4),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED', 'INVALID')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rotated_at timestamptz,
  unique (company_id, provider)
);

create index if not exists company_ai_credentials_company_provider_idx
  on public.company_ai_credentials (company_id, provider, credential_version);

alter table public.company_ai_settings enable row level security;
alter table public.company_ai_credentials enable row level security;
revoke all on table public.company_ai_settings, public.company_ai_credentials from public, anon, authenticated;

create or replace function private.company_ai_config_json(p_company_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'company_id', p_company_id,
    'provider', 'GEMINI',
    'enabled', coalesce(s.enabled, false),
    'primary_model', 'gemini-3.5-flash-lite',
    'fallback_model', 'gemini-3.7-flash',
    'credential_configured', coalesce(s.credential_configured, false),
    'credential_last4', s.credential_last4,
    'credential_version', coalesce(s.credential_version, 0),
    'status', coalesce(s.status, 'NOT_CONFIGURED'),
    'last_tested_at', s.last_tested_at,
    'last_test_status', coalesce(s.last_test_status, 'NOT_TESTED'),
    'updated_at', s.updated_at
  )
  from (select 1) seed
  left join public.company_ai_settings s on s.company_id = p_company_id and s.provider = 'GEMINI';
$$;

create or replace function public.platform_get_company_ai_config(p_company_id uuid)
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
  return private.company_ai_config_json(p_company_id);
end;
$$;

create or replace function public.platform_store_company_ai_credential(
  p_company_id uuid,
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
  v_version integer;
  v_event_type text;
begin
  if (select auth.uid()) is null or not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'Company does not exist' using errcode = '22023';
  end if;
  if nullif(btrim(p_ciphertext), '') is null or nullif(btrim(p_iv), '') is null or nullif(btrim(p_auth_tag), '') is null then
    raise exception 'An encrypted credential envelope is required' using errcode = '22023';
  end if;
  if p_encryption_version <> 1 or p_key_last4 is null or length(p_key_last4) not between 1 and 4 then
    raise exception 'The encrypted credential envelope is invalid' using errcode = '22023';
  end if;

  select coalesce(s.credential_version, 0) + 1 into v_version
  from public.company_ai_settings s
  where s.company_id = p_company_id and s.provider = 'GEMINI';
  v_version := coalesce(v_version, 1);

  insert into public.company_ai_settings (
    company_id, provider, enabled, credential_configured, credential_last4,
    credential_version, status, last_tested_at, last_test_status, updated_at
  ) values (
    p_company_id, 'GEMINI', true, true, p_key_last4,
    v_version, 'ACTIVE', null, 'NOT_TESTED', now()
  )
  on conflict (company_id) do update set
    enabled = true,
    credential_configured = true,
    credential_last4 = excluded.credential_last4,
    credential_version = excluded.credential_version,
    status = 'ACTIVE',
    last_tested_at = null,
    last_test_status = 'NOT_TESTED',
    updated_at = now();

  insert into public.company_ai_credentials (
    company_id, provider, ciphertext, iv, auth_tag, encryption_version,
    credential_version, key_last4, status, created_by, updated_by, rotated_at
  ) values (
    p_company_id, 'GEMINI', p_ciphertext, p_iv, p_auth_tag, p_encryption_version,
    v_version, p_key_last4, 'ACTIVE', (select auth.uid()), (select auth.uid()), now()
  )
  on conflict (company_id, provider) do update set
    ciphertext = excluded.ciphertext,
    iv = excluded.iv,
    auth_tag = excluded.auth_tag,
    encryption_version = excluded.encryption_version,
    credential_version = excluded.credential_version,
    key_last4 = excluded.key_last4,
    status = 'ACTIVE',
    updated_by = (select auth.uid()),
    updated_at = now(),
    rotated_at = now();

  v_event_type := case when v_version = 1 then 'COMPANY_AI_CREDENTIAL_CONFIGURED' else 'COMPANY_AI_CREDENTIAL_ROTATED' end;
  perform private.write_company_audit(p_company_id, v_event_type, 'company_ai_credential', null, jsonb_build_object(
    'provider', 'GEMINI', 'credential_version', v_version, 'key_last4', p_key_last4
  ));
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
  if p_test_status not in ('SUCCESS', 'INVALID_CREDENTIAL', 'QUOTA_LIMITED', 'PROVIDER_UNAVAILABLE', 'MODEL_UNAVAILABLE') then
    raise exception 'Invalid AI test status' using errcode = '22023';
  end if;
  v_status := case when p_test_status = 'SUCCESS' then 'ACTIVE' when p_test_status = 'INVALID_CREDENTIAL' then 'INVALID' else coalesce((select s.status from public.company_ai_settings s where s.company_id = p_company_id), 'NOT_CONFIGURED') end;
  update public.company_ai_settings s
  set status = v_status,
      enabled = case when p_test_status = 'INVALID_CREDENTIAL' then false else s.enabled end,
      last_tested_at = now(),
      last_test_status = p_test_status,
      updated_at = now()
  where s.company_id = p_company_id and s.provider = 'GEMINI';
  if p_test_status = 'INVALID_CREDENTIAL' then
    update public.company_ai_credentials c set status = 'INVALID', updated_at = now() where c.company_id = p_company_id and c.provider = 'GEMINI';
  elsif p_test_status = 'SUCCESS' then
    update public.company_ai_credentials c set status = 'ACTIVE', updated_at = now() where c.company_id = p_company_id and c.provider = 'GEMINI';
  end if;
  perform private.write_company_audit(p_company_id, 'COMPANY_AI_CREDENTIAL_TESTED', 'company_ai_credential', null, jsonb_build_object('provider', 'GEMINI', 'test_status', p_test_status));
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
  update public.company_ai_settings s set enabled = false, status = 'DISABLED', updated_at = now() where s.company_id = p_company_id and s.provider = 'GEMINI';
  update public.company_ai_credentials c set status = 'DISABLED', updated_at = now() where c.company_id = p_company_id and c.provider = 'GEMINI';
  perform private.write_company_audit(p_company_id, 'COMPANY_AI_CREDENTIAL_DISABLED', 'company_ai_credential', null, jsonb_build_object('provider', 'GEMINI'));
  return private.company_ai_config_json(p_company_id);
end;
$$;

create or replace function public.platform_remove_company_ai_credential(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  if (select auth.uid()) is null or not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;
  select coalesce(s.credential_version, 0) + 1 into v_version from public.company_ai_settings s where s.company_id = p_company_id and s.provider = 'GEMINI';
  delete from public.company_ai_credentials c where c.company_id = p_company_id and c.provider = 'GEMINI';
  update public.company_ai_settings s
  set enabled = false, credential_configured = false, credential_last4 = null,
      credential_version = coalesce(v_version, 1), status = 'NOT_CONFIGURED',
      last_tested_at = null, last_test_status = 'NOT_TESTED', updated_at = now()
  where s.company_id = p_company_id and s.provider = 'GEMINI';
  perform private.write_company_audit(p_company_id, 'COMPANY_AI_CREDENTIAL_REMOVED', 'company_ai_credential', null, jsonb_build_object('provider', 'GEMINI', 'credential_version', coalesce(v_version, 1)));
  return private.company_ai_config_json(p_company_id);
end;
$$;

create or replace function public.resolve_company_ai_credential(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.company_ai_credentials;
  v_settings public.company_ai_settings;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if not ((select private.is_platform_admin()) or (select private.is_active_company_member(p_company_id))) then
    raise exception 'You do not have access to this company' using errcode = '42501';
  end if;
  select * into v_settings from public.company_ai_settings s where s.company_id = p_company_id and s.provider = 'GEMINI';
  select * into v_credential from public.company_ai_credentials c where c.company_id = p_company_id and c.provider = 'GEMINI';
  if not found then
    -- Preserve the distinction between a company with no settings row and a
    -- company that was explicitly disabled or had its credential removed. The
    -- server may use the local/demo fallback only for the former case.
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

grant execute on function public.platform_get_company_ai_config(uuid) to authenticated;
grant execute on function public.platform_store_company_ai_credential(uuid, text, text, text, integer, text) to authenticated;
grant execute on function public.platform_record_company_ai_test(uuid, text) to authenticated;
grant execute on function public.platform_disable_company_ai(uuid) to authenticated;
grant execute on function public.platform_remove_company_ai_credential(uuid) to authenticated;
grant execute on function public.resolve_company_ai_credential(uuid) to authenticated;

revoke execute on function public.platform_get_company_ai_config(uuid) from public, anon;
revoke execute on function public.platform_store_company_ai_credential(uuid, text, text, text, integer, text) from public, anon;
revoke execute on function public.platform_record_company_ai_test(uuid, text) from public, anon;
revoke execute on function public.platform_disable_company_ai(uuid) from public, anon;
revoke execute on function public.platform_remove_company_ai_credential(uuid) from public, anon;
revoke execute on function public.resolve_company_ai_credential(uuid) from public, anon;

revoke execute on function private.company_ai_config_json(uuid) from public, anon, authenticated;

-- Keep the existing audit RPC contract bounded for the page-oriented
-- management view. A later cursor-based endpoint can be added without ever
-- making the default request load the entire history.
create or replace function public.platform_list_access_audit(p_company_id uuid)
returns setof public.company_audit_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;
  return query
  select ae.*
  from public.company_audit_events ae
  where ae.company_id = p_company_id
  order by ae.created_at desc, ae.id desc
  limit 100;
end;
$$;

revoke execute on function public.platform_list_access_audit(uuid) from public, anon;
grant execute on function public.platform_list_access_audit(uuid) to authenticated;

create or replace function public.platform_list_company_invitations(p_company_id uuid)
returns setof public.company_invitations
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;
  return query
  select ci.*
  from public.company_invitations ci
  where ci.company_id = p_company_id
  order by ci.created_at desc, ci.id desc
  limit 100;
end;
$$;

revoke execute on function public.platform_list_company_invitations(uuid) from public, anon;
grant execute on function public.platform_list_company_invitations(uuid) to authenticated;

create or replace function public.platform_list_company_member_directory(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', member_row.id,
      'company_id', member_row.company_id,
      'user_id', member_row.user_id,
      'email', member_row.email,
      'role_key', member_row.role_key,
      'status', member_row.status,
      'joined_at', member_row.joined_at,
      'updated_at', member_row.updated_at
    ) order by member_row.created_at, member_row.id)
    from (
      select cm.id, cm.company_id, cm.user_id, lower(btrim(u.email)) as email,
             cm.role_key, cm.status, cm.joined_at, cm.updated_at, cm.created_at
      from public.company_members cm
      left join auth.users u on u.id = cm.user_id
      where cm.company_id = p_company_id
      order by cm.created_at, cm.id
      limit 100
    ) member_row
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.platform_list_company_member_directory(uuid) from public, anon;
grant execute on function public.platform_list_company_member_directory(uuid) to authenticated;
