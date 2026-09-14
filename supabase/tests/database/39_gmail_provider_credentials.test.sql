begin;
select no_plan();

create temp table gmail_credential_ids as
select
  '00000000-0000-4000-8000-000000009901'::uuid as admin_user,
  'aaaaaaaa-0000-4000-8000-000000009901'::uuid as company_id;
grant select on gmail_credential_ids to authenticated, service_role;

select has_table('public', 'gmail_provider_credentials', 'durable Gmail provider credential table exists');
select has_function('public', 'server_store_gmail_provider_credential', 'server Gmail credential store RPC exists');
select has_function('public', 'server_get_gmail_provider_credential', 'server Gmail credential read RPC exists');
select has_function('public', 'server_mark_gmail_provider_credential_status', 'server Gmail credential status RPC exists');
select has_function('public', 'server_revoke_gmail_provider_credential', 'server Gmail credential revoke RPC exists');
select is_empty($$select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'gmail_provider_credentials' and grantee in ('anon', 'authenticated')$$, 'browser roles have no direct credential table grant');

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ((select admin_user from gmail_credential_ids), 'gmail-credential-admin@test.local', 'x', now(), now(), now());
insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values ((select company_id from gmail_credential_ids), 'Gmail Credential Company', 'gmail-credential-company', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from gmail_credential_ids), (select admin_user from gmail_credential_ids));

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  (public.server_store_gmail_provider_credential(
    (select company_id from gmail_credential_ids),
    (select admin_user from gmail_credential_ids),
    'finance@gmail.com',
    '["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"]'::jsonb,
    'ciphertext-only-test', 'iv-only-test', 'tag-only-test', 1
  ))->>'ciphertext',
  null,
  'server store response does not return encrypted envelope fields'
);
select is(
  (public.server_get_gmail_provider_credential((select company_id from gmail_credential_ids), (select admin_user from gmail_credential_ids)))->>'ciphertext',
  'ciphertext-only-test',
  'server credential read returns the encrypted envelope only to the server role'
);
select is(
  (public.server_mark_gmail_provider_credential_status((select company_id from gmail_credential_ids), (select admin_user from gmail_credential_ids), 'INVALID', 'GMAIL_REAUTH_REQUIRED'))->>'status',
  'INVALID',
  'server can mark a rejected provider credential invalid'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from gmail_credential_ids), true);
select throws_ok($$select * from public.gmail_provider_credentials$$, '42501', null, 'authenticated users cannot read the provider credential table');
select throws_ok($$select public.server_get_gmail_provider_credential((select company_id from gmail_credential_ids), (select admin_user from gmail_credential_ids))$$, '42501', null, 'authenticated users cannot call the server credential read RPC');

select * from finish();
rollback;
