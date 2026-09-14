-- Durable Google provider refresh credentials for Gmail intake and sending.
-- The browser only submits the callback refresh token to an authenticated
-- server endpoint. This table is not a browser-readable credential store.

create table if not exists public.gmail_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  email text not null check (length(btrim(email)) between 3 and 320 and position('@' in email) > 1),
  scopes jsonb not null default '[]'::jsonb check (jsonb_typeof(scopes) = 'array'),
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  encryption_version integer not null default 1 check (encryption_version >= 1),
  credential_version integer not null default 1 check (credential_version >= 1),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INVALID', 'REVOKED')),
  last_refreshed_at timestamptz,
  last_used_at timestamptz,
  invalidated_at timestamptz,
  last_error_code text check (last_error_code is null or last_error_code in ('GMAIL_REAUTH_REQUIRED', 'GMAIL_SCOPE_REQUIRED', 'GMAIL_PROVIDER_PERMISSION', 'GMAIL_PROVIDER_UNAVAILABLE', 'GMAIL_PROVIDER_SETUP_REQUIRED')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id, provider)
);

create index if not exists gmail_provider_credentials_company_user_idx
  on public.gmail_provider_credentials (company_id, user_id, provider, updated_at desc);

alter table public.gmail_provider_credentials enable row level security;
revoke all on table public.gmail_provider_credentials from public, anon, authenticated;

create or replace function private.gmail_provider_credential_json(
  p_credential public.gmail_provider_credentials,
  p_include_envelope boolean default false
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'company_id', p_credential.company_id,
    'user_id', p_credential.user_id,
    'provider', p_credential.provider,
    'email', p_credential.email,
    'scopes', p_credential.scopes,
    'status', p_credential.status,
    'credential_version', p_credential.credential_version,
    'encryption_version', p_credential.encryption_version,
    'last_refreshed_at', p_credential.last_refreshed_at,
    'last_used_at', p_credential.last_used_at,
    'invalidated_at', p_credential.invalidated_at,
    'last_error_code', p_credential.last_error_code,
    'ciphertext', case when p_include_envelope then p_credential.ciphertext else null end,
    'iv', case when p_include_envelope then p_credential.iv else null end,
    'auth_tag', case when p_include_envelope then p_credential.auth_tag else null end
  );
$$;

create or replace function public.server_store_gmail_provider_credential(
  p_company_id uuid,
  p_user_id uuid,
  p_email text,
  p_scopes jsonb,
  p_ciphertext text,
  p_iv text,
  p_auth_tag text,
  p_encryption_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.gmail_provider_credentials;
  v_version integer;
  v_email text := nullif(btrim(p_email), '');
begin
  if p_company_id is null or p_user_id is null then
    raise exception 'Gmail credential ownership is required' using errcode = '22023';
  end if;
  if v_email is null or length(v_email) > 320 or position('@' in v_email) < 2 then
    raise exception 'A valid Gmail account is required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_scopes, '[]'::jsonb)) <> 'array' then
    raise exception 'Gmail scopes must be an array' using errcode = '22023';
  end if;
  if nullif(btrim(p_ciphertext), '') is null or nullif(btrim(p_iv), '') is null or nullif(btrim(p_auth_tag), '') is null or p_encryption_version <> 1 then
    raise exception 'An encrypted Gmail credential envelope is required' using errcode = '22023';
  end if;

  select coalesce(c.credential_version, 0) + 1
    into v_version
  from public.gmail_provider_credentials c
  where c.company_id = p_company_id and c.user_id = p_user_id and c.provider = 'google'
  for update;
  v_version := coalesce(v_version, 1);

  insert into public.gmail_provider_credentials (
    company_id, user_id, provider, email, scopes, ciphertext, iv, auth_tag,
    encryption_version, credential_version, status, last_refreshed_at,
    last_used_at, invalidated_at, last_error_code, created_by, updated_by
  ) values (
    p_company_id, p_user_id, 'google', v_email, coalesce(p_scopes, '[]'::jsonb),
    p_ciphertext, p_iv, p_auth_tag, p_encryption_version, v_version, 'ACTIVE',
    null, now(), null, null, p_user_id, p_user_id
  )
  on conflict (company_id, user_id, provider) do update set
    email = excluded.email,
    scopes = excluded.scopes,
    ciphertext = excluded.ciphertext,
    iv = excluded.iv,
    auth_tag = excluded.auth_tag,
    encryption_version = excluded.encryption_version,
    credential_version = excluded.credential_version,
    status = 'ACTIVE',
    last_refreshed_at = null,
    last_used_at = now(),
    invalidated_at = null,
    last_error_code = null,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_credential;

  return private.gmail_provider_credential_json(v_credential, false);
end;
$$;

create or replace function public.server_get_gmail_provider_credential(
  p_company_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.gmail_provider_credentials;
begin
  if p_company_id is null or p_user_id is null then
    raise exception 'Gmail credential ownership is required' using errcode = '22023';
  end if;
  select * into v_credential
  from public.gmail_provider_credentials c
  where c.company_id = p_company_id and c.user_id = p_user_id and c.provider = 'google';
  if not found then return null; end if;
  return private.gmail_provider_credential_json(v_credential, true);
end;
$$;

create or replace function public.server_mark_gmail_provider_credential_status(
  p_company_id uuid,
  p_user_id uuid,
  p_status text,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.gmail_provider_credentials;
begin
  if p_status not in ('INVALID', 'REVOKED') then
    raise exception 'Invalid Gmail credential status' using errcode = '22023';
  end if;
  update public.gmail_provider_credentials c
  set status = p_status,
      invalidated_at = now(),
      last_error_code = case when p_reason_code in ('GMAIL_REAUTH_REQUIRED', 'GMAIL_SCOPE_REQUIRED', 'GMAIL_PROVIDER_PERMISSION', 'GMAIL_PROVIDER_UNAVAILABLE', 'GMAIL_PROVIDER_SETUP_REQUIRED') then p_reason_code else null end,
      updated_at = now()
  where c.company_id = p_company_id and c.user_id = p_user_id and c.provider = 'google'
  returning * into v_credential;
  if not found then return null; end if;
  return private.gmail_provider_credential_json(v_credential, false);
end;
$$;

create or replace function public.server_touch_gmail_provider_credential(
  p_company_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.gmail_provider_credentials
    set last_refreshed_at = now(), last_used_at = now(), updated_at = now()
    where company_id = p_company_id and user_id = p_user_id and provider = 'google' and status = 'ACTIVE'
    returning 1
  )
  select exists(select 1 from updated);
$$;

create or replace function public.server_revoke_gmail_provider_credential(
  p_company_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.gmail_provider_credentials;
begin
  delete from public.gmail_provider_credentials c
  where c.company_id = p_company_id and c.user_id = p_user_id and c.provider = 'google'
  returning * into v_credential;
  if not found then return null; end if;
  return jsonb_build_object(
    'company_id', v_credential.company_id,
    'user_id', v_credential.user_id,
    'provider', v_credential.provider,
    'email', v_credential.email,
    'status', 'REVOKED',
    'credential_version', v_credential.credential_version,
    'encryption_version', v_credential.encryption_version,
    'invalidated_at', now()
  );
end;
$$;

revoke all on function private.gmail_provider_credential_json(public.gmail_provider_credentials, boolean) from public, anon, authenticated, service_role;
revoke all on function public.server_store_gmail_provider_credential(uuid, uuid, text, jsonb, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.server_get_gmail_provider_credential(uuid, uuid) from public, anon, authenticated;
revoke all on function public.server_mark_gmail_provider_credential_status(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.server_touch_gmail_provider_credential(uuid, uuid) from public, anon, authenticated;
revoke all on function public.server_revoke_gmail_provider_credential(uuid, uuid) from public, anon, authenticated;
grant execute on function public.server_store_gmail_provider_credential(uuid, uuid, text, jsonb, text, text, text, integer) to service_role;
grant execute on function public.server_get_gmail_provider_credential(uuid, uuid) to service_role;
grant execute on function public.server_mark_gmail_provider_credential_status(uuid, uuid, text, text) to service_role;
grant execute on function public.server_touch_gmail_provider_credential(uuid, uuid) to service_role;
grant execute on function public.server_revoke_gmail_provider_credential(uuid, uuid) to service_role;
