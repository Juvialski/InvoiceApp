begin;
select no_plan();

select has_function('private', 'seed_company_document_profile', 'company document profile seed trigger function exists');
select is(
  position('new.name' in pg_get_functiondef('private.seed_company_document_profile()'::regprocedure)) > 0,
  true,
  'new document profiles derive only the approved bootstrap company name'
);
select is(
  position('HydroQualiSense Solutions Corp.' in pg_get_functiondef('private.seed_company_document_profile()'::regprocedure)) = 0,
  true,
  'new document profile seed contains no HydroQualiSense legal identity'
);

create temp table qa_identity_ids as
select
  '10000000-0000-4000-8000-202609081001'::uuid as admin_user,
  '10000000-0000-4000-8000-202609081002'::uuid as company_a,
  '10000000-0000-4000-8000-202609081003'::uuid as company_b;
grant select on qa_identity_ids to service_role, authenticated;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ((select admin_user from qa_identity_ids), 'qa-identity@test.local', 'x', now(), now(), now());

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id)
values
  ((select company_a from qa_identity_ids), 'Configured Client A', 'configured-client-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from qa_identity_ids)),
  ((select company_b from qa_identity_ids), 'Unrelated Client B', 'unrelated-client-b', 'ACTIVE', 'USD', 'UTC', (select admin_user from qa_identity_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values ((select company_a from qa_identity_ids), (select admin_user from qa_identity_ids), 'COMPANY_ADMIN', 'ACTIVE');
insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from qa_identity_ids));
insert into public.company_audit_events (company_id, actor_user_id, event_type, target_type, target_id, metadata)
values (
  (select company_a from qa_identity_ids), null, 'COMPANY_CREATED', 'company', (select company_a from qa_identity_ids),
  jsonb_build_object('bootstrap', true, 'initial_admin_user_id', (select admin_user from qa_identity_ids))
);

select is((select legal_name from public.company_document_profiles where company_id = (select company_b from qa_identity_ids)), 'Unrelated Client B', 'new unrelated company receives only its approved bootstrap name');
select is((select address is null and contact_number is null and email is null and vat_tin is null and logo_path is null from public.company_document_profiles where company_id = (select company_b from qa_identity_ids)), true, 'new unrelated company receives no copied legal/contact/TIN fields');

update public.company_document_profiles
set legal_name = 'Configured Client A Legal Name', address = 'Client A Address', vat_tin = '123456789'
where company_id = (select company_a from qa_identity_ids);

select is((select legal_name from public.company_document_profiles where company_id = (select company_a from qa_identity_ids)), 'Configured Client A Legal Name', 'existing configured profile remains unchanged by future seed behavior');
select is((select vat_tin from public.company_document_profiles where company_id = (select company_a from qa_identity_ids)), '123456789', 'existing configured profile identifiers remain preserved');

select has_function('public', 'bootstrap_deployment_company_ai_credential', 'initial deployment AI bootstrap RPC exists');
select is_empty(
  $$select 1 from information_schema.routine_privileges where routine_schema = 'public' and routine_name = 'bootstrap_deployment_company_ai_credential' and lower(grantee) in ('public', 'anon', 'authenticated') and privilege_type = 'EXECUTE'$$,
  'browser roles cannot execute initial deployment AI bootstrap'
);
select isnt_empty(
  $$select 1 from information_schema.routine_privileges where routine_schema = 'public' and routine_name = 'bootstrap_deployment_company_ai_credential' and lower(grantee) = 'service_role' and privilege_type = 'EXECUTE'$$,
  'service role can execute initial deployment AI bootstrap'
);
select isnt_empty(
  $$select 1 from pg_proc where oid = 'public.bootstrap_deployment_company_ai_credential(uuid,uuid,text,text,text,integer,text)'::regprocedure and prosecdef and proconfig @> array['search_path=""']$$,
  'initial deployment AI bootstrap is a hardened SECURITY DEFINER function'
);
select is_empty(
  $$select 1 from information_schema.routine_privileges where routine_schema = 'public' and routine_name in ('server_get_company_ai_config', 'server_record_company_ai_test') and lower(grantee) in ('public', 'anon', 'authenticated') and privilege_type = 'EXECUTE'$$,
  'server-only AI metadata functions are not browser-callable'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.bootstrap_deployment_company_ai_credential(
    (select company_a from qa_identity_ids),
    (select admin_user from qa_identity_ids),
    'cipher-v1', 'iv-v1', 'tag-v1', 1, '1234'
  )->>'status',
  'ACTIVE',
  'initial deployment operator can configure encrypted company AI metadata through the service-role boundary'
);
select is((select count(*)::integer from public.company_ai_credentials where company_id = (select company_a from qa_identity_ids)), 1, 'initial AI bootstrap stores one encrypted credential row');
select is(
  (public.server_record_company_ai_test((select company_a from qa_identity_ids), 'PROVIDER_UNAVAILABLE'))->>'last_test_status',
  'PROVIDER_UNAVAILABLE',
  'server-only AI test recording preserves safe provider-unavailable status'
);
select is(
  public.bootstrap_deployment_company_ai_credential(
    (select company_a from qa_identity_ids),
    (select admin_user from qa_identity_ids),
    'cipher-v2', 'iv-v2', 'tag-v2', 1, '9999'
  )->>'idempotent',
  'true',
  'active initial AI bootstrap retry is metadata-only and idempotent'
);
select is((select ciphertext from public.company_ai_credentials where company_id = (select company_a from qa_identity_ids)), 'cipher-v1', 'idempotent active bootstrap never overwrites the first encrypted envelope');

select is(
  (public.server_record_company_ai_test((select company_a from qa_identity_ids), 'INVALID_CREDENTIAL'))->>'status',
  'INVALID',
  'invalid provider validation marks the initial bootstrap credential invalid'
);
select is(
  public.bootstrap_deployment_company_ai_credential(
    (select company_a from qa_identity_ids),
    (select admin_user from qa_identity_ids),
    'cipher-recovery', 'iv-recovery', 'tag-recovery', 1, '5678'
  )->>'recoveredInvalidBootstrap',
  'true',
  'initial operator can replace an invalid first credential before any successful validation'
);
select is((select ciphertext from public.company_ai_credentials where company_id = (select company_a from qa_identity_ids)), 'cipher-recovery', 'invalid-bootstrap recovery replaces only the failed encrypted envelope');
select is((select credential_version from public.company_ai_credentials where company_id = (select company_a from qa_identity_ids)), 2, 'invalid-bootstrap recovery advances credential version');

select is(
  (public.server_record_company_ai_test((select company_a from qa_identity_ids), 'SUCCESS'))->>'last_test_status',
  'SUCCESS',
  'successful provider validation finalizes bootstrap credential authority'
);
select is(
  (public.server_record_company_ai_test((select company_a from qa_identity_ids), 'INVALID_CREDENTIAL'))->>'status',
  'INVALID',
  'a later provider invalidation remains recorded'
);
select throws_ok(
  $$select public.bootstrap_deployment_company_ai_credential((select company_a from qa_identity_ids), (select admin_user from qa_identity_ids), 'cipher-v3', 'iv-v3', 'tag-v3', 1, '0000')$$,
  '55000', null,
  'bootstrap cannot rotate a credential after a successful provider validation'
);
select is((select ciphertext from public.company_ai_credentials where company_id = (select company_a from qa_identity_ids)), 'cipher-recovery', 'post-success invalidation requires platform maintenance and preserves the validated bootstrap envelope');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from qa_identity_ids), true);
select throws_ok(
  $$select public.bootstrap_deployment_company_ai_credential((select company_a from qa_identity_ids), (select admin_user from qa_identity_ids), 'cipher', 'iv', 'tag', 1, '1234')$$,
  '42501', null,
  'authenticated browser roles cannot call the service-only AI bootstrap RPC'
);
reset role;

select * from finish();
rollback;
