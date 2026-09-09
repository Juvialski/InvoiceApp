begin;
select no_plan();

-- The server-only AI RPCs are public-schema endpoints with an intentionally
-- narrow Data API grant. The modern sb_secret_... key is not represented by
-- the legacy request.jwt.claim.role setting; the service_role grant is the
-- authorization boundary.
select has_function('public', 'bootstrap_deployment_company_ai_credential', 'initial AI bootstrap RPC exists');
select has_function('public', 'server_get_company_ai_config', 'server AI metadata RPC exists');
select has_function('public', 'server_record_company_ai_test', 'server AI test RPC exists');
select has_function('public', 'resolve_company_ai_credential', 'server AI credential resolver exists');
select has_function('public', 'server_mark_company_ai_invalid', 'server AI invalidation RPC exists');

select is_empty(
  $$select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in (
        'bootstrap_deployment_company_ai_credential',
        'server_get_company_ai_config',
        'server_record_company_ai_test',
        'resolve_company_ai_credential',
        'server_mark_company_ai_invalid'
      )
      and lower(grantee) in ('public', 'anon', 'authenticated')
      and privilege_type = 'EXECUTE'$$,
  'anon and authenticated roles cannot execute server-only AI RPCs'
);

select is(
  (select count(*)
     from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in (
        'bootstrap_deployment_company_ai_credential',
        'server_get_company_ai_config',
        'server_record_company_ai_test',
        'resolve_company_ai_credential',
        'server_mark_company_ai_invalid'
      )
      and lower(grantee) = 'service_role'
      and privilege_type = 'EXECUTE'),
  5::bigint,
  'service_role is the only Data API execution role for server-only AI RPCs'
);

select is_empty(
  $$select 1
    from pg_proc
   where oid in (
     'public.bootstrap_deployment_company_ai_credential(uuid,uuid,text,text,text,integer,text)'::regprocedure,
     'public.server_get_company_ai_config(uuid)'::regprocedure,
     'public.server_record_company_ai_test(uuid,text)'::regprocedure,
     'public.resolve_company_ai_credential(uuid)'::regprocedure,
     'public.server_mark_company_ai_invalid(uuid)'::regprocedure
   )
     and pg_get_functiondef(oid) ~* 'request\.jwt\.claim\.role|current_user[[:space:]]*(<>|=|in[[:space:]])'$$,
  'active server-only AI function bodies do not use legacy request-role or SECURITY DEFINER current_user checks'
);

select isnt_empty(
  $$select 1 from pg_proc
    where oid = 'public.bootstrap_deployment_company_ai_credential(uuid,uuid,text,text,text,integer,text)'::regprocedure
      and prosecdef
      and proconfig @> array['search_path=""']$$,
  'AI bootstrap remains SECURITY DEFINER with an empty search_path'
);
select isnt_empty(
  $$select 1 from pg_proc
    where oid = 'public.server_get_company_ai_config(uuid)'::regprocedure
      and prosecdef
      and proconfig @> array['search_path=""']$$,
  'server AI metadata lookup remains SECURITY DEFINER with an empty search_path'
);
select isnt_empty(
  $$select 1 from pg_proc
    where oid = 'public.server_record_company_ai_test(uuid,text)'::regprocedure
      and prosecdef
      and proconfig @> array['search_path=""']$$,
  'server AI test recording remains SECURITY DEFINER with an empty search_path'
);
select is_empty(
  $$select 1 from pg_proc
    where oid in (
      'public.resolve_company_ai_credential(uuid)'::regprocedure,
      'public.server_mark_company_ai_invalid(uuid)'::regprocedure
    )
      and prosecdef$$,
  'server AI resolver and invalidation preserve SECURITY INVOKER semantics'
);

create temp table company_ai_secret_key_ids as
select
  '10000000-0000-4000-8000-202609091001'::uuid as operator_user,
  '10000000-0000-4000-8000-202609091002'::uuid as other_admin,
  '10000000-0000-4000-8000-202609091101'::uuid as company_a,
  '10000000-0000-4000-8000-202609091102'::uuid as company_b;
grant select on company_ai_secret_key_ids to service_role, authenticated, anon;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ((select operator_user from company_ai_secret_key_ids), 'ai-secret-operator@test.local', 'x', now(), now(), now()),
  ((select other_admin from company_ai_secret_key_ids), 'ai-secret-other@test.local', 'x', now(), now(), now());

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id)
values
  ((select company_a from company_ai_secret_key_ids), 'AI Secret Key Client A', 'ai-secret-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select operator_user from company_ai_secret_key_ids)),
  ((select company_b from company_ai_secret_key_ids), 'AI Secret Key Client B', 'ai-secret-b', 'ACTIVE', 'USD', 'UTC', (select other_admin from company_ai_secret_key_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_a from company_ai_secret_key_ids), (select operator_user from company_ai_secret_key_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_a from company_ai_secret_key_ids), (select other_admin from company_ai_secret_key_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from company_ai_secret_key_ids));

insert into public.company_audit_events (company_id, actor_user_id, event_type, target_type, target_id, metadata)
values (
  (select company_a from company_ai_secret_key_ids), null, 'COMPANY_CREATED', 'company', (select company_a from company_ai_secret_key_ids),
  jsonb_build_object('bootstrap', true, 'initial_admin_user_id', (select operator_user from company_ai_secret_key_ids))
);

-- No legacy role claim is supplied. This is the metadata state needed by the
-- Settings route before the approved QA credential bootstrap is performed.
set local role service_role;
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (public.server_get_company_ai_config((select company_a from company_ai_secret_key_ids))->>'status'),
  'NOT_CONFIGURED',
  'modern service-role execution returns a healthy NOT_CONFIGURED state'
);
select is(
  (public.server_get_company_ai_config((select company_a from company_ai_secret_key_ids))->>'credential_configured'),
  'false',
  'unconfigured metadata reports credential_configured false'
);
select ok(
  not (public.server_get_company_ai_config((select company_a from company_ai_secret_key_ids)) ? 'ciphertext')
  and not (public.server_get_company_ai_config((select company_a from company_ai_secret_key_ids)) ? 'iv')
  and not (public.server_get_company_ai_config((select company_a from company_ai_secret_key_ids)) ? 'auth_tag'),
  'metadata lookup exposes no encrypted credential fields'
);

select throws_ok(
  $$select public.server_get_company_ai_config('10000000-0000-4000-8000-202609091102')$$,
  '42501', null,
  'server metadata lookup rejects a cross-company target'
);
select throws_ok(
  $$select public.server_record_company_ai_test('10000000-0000-4000-8000-202609091102', 'PROVIDER_UNAVAILABLE')$$,
  '42501', null,
  'server test recording rejects a cross-company target'
);
select throws_ok(
  $$select public.bootstrap_deployment_company_ai_credential('10000000-0000-4000-8000-202609091102', '10000000-0000-4000-8000-202609091002', 'cipher-b', 'iv-b', 'tag-b', 1, '2222')$$,
  '42501', null,
  'AI bootstrap rejects a cross-company target'
);
select throws_ok(
  $$select public.resolve_company_ai_credential('10000000-0000-4000-8000-202609091102')$$,
  '42501', null,
  'server credential resolution rejects a cross-company target'
);
select throws_ok(
  $$select public.server_mark_company_ai_invalid('10000000-0000-4000-8000-202609091102')$$,
  '42501', null,
  'server credential invalidation rejects a cross-company target'
);

select is(
  (public.server_record_company_ai_test((select company_a from company_ai_secret_key_ids), 'PROVIDER_UNAVAILABLE'))->>'status',
  'NOT_CONFIGURED',
  'server-only test recording remains callable through the service-role boundary'
);
select throws_ok(
  $$select public.bootstrap_deployment_company_ai_credential('10000000-0000-4000-8000-202609091101', '10000000-0000-4000-8000-202609091002', 'cipher-unauthorized', 'iv-unauthorized', 'tag-unauthorized', 1, '1111')$$,
  '42501', null,
  'an active non-initial Company Admin cannot bootstrap AI configuration'
);

select is(
  public.bootstrap_deployment_company_ai_credential(
    (select company_a from company_ai_secret_key_ids),
    (select operator_user from company_ai_secret_key_ids),
    'cipher-first', 'iv-first', 'tag-first', 1, '1111'
  )->>'idempotent',
  'false',
  'the authorized initial operator can perform the first AI bootstrap'
);
select is((select count(*)::integer from public.company_ai_settings where company_id = (select company_a from company_ai_secret_key_ids)), 1, 'first AI bootstrap creates one settings row');
select is((select count(*)::integer from public.company_ai_credentials where company_id = (select company_a from company_ai_secret_key_ids)), 1, 'first AI bootstrap creates one encrypted credential row');

select is(
  (public.server_get_company_ai_config((select company_a from company_ai_secret_key_ids))->>'status'),
  'ACTIVE',
  'configured metadata remains readable through the modern service-role path'
);
select ok(
  not (public.server_get_company_ai_config((select company_a from company_ai_secret_key_ids)) ? 'ciphertext')
  and not (public.server_get_company_ai_config((select company_a from company_ai_secret_key_ids)) ? 'iv')
  and not (public.server_get_company_ai_config((select company_a from company_ai_secret_key_ids)) ? 'auth_tag'),
  'configured metadata still exposes no ciphertext, IV, or auth tag'
);

select is(
  public.bootstrap_deployment_company_ai_credential(
    (select company_a from company_ai_secret_key_ids),
    (select operator_user from company_ai_secret_key_ids),
    'cipher-second', 'iv-second', 'tag-second', 1, '2222'
  )->>'idempotent',
  'true',
  'an active bootstrap retry is metadata-only'
);
select is(
  (select ciphertext from public.company_ai_credentials where company_id = (select company_a from company_ai_secret_key_ids)),
  'cipher-first',
  'an active bootstrap retry never overwrites the original encrypted envelope'
);

select is(
  (public.server_record_company_ai_test((select company_a from company_ai_secret_key_ids), 'INVALID_CREDENTIAL'))->>'status',
  'INVALID',
  'invalid provider validation marks the initial credential invalid'
);
select is(
  public.bootstrap_deployment_company_ai_credential(
    (select company_a from company_ai_secret_key_ids),
    (select operator_user from company_ai_secret_key_ids),
    'cipher-recovery', 'iv-recovery', 'tag-recovery', 1, '3333'
  )->>'recoveredInvalidBootstrap',
  'true',
  'the initial operator can recover a failed first credential before success'
);
select is(
  (select ciphertext from public.company_ai_credentials where company_id = (select company_a from company_ai_secret_key_ids)),
  'cipher-recovery',
  'invalid-bootstrap recovery stores the replacement encrypted envelope'
);
select is(
  (public.server_record_company_ai_test((select company_a from company_ai_secret_key_ids), 'SUCCESS'))->>'last_test_status',
  'SUCCESS',
  'successful provider validation finalizes bootstrap authority'
);
select is(
  public.bootstrap_deployment_company_ai_credential(
    (select company_a from company_ai_secret_key_ids),
    (select operator_user from company_ai_secret_key_ids),
    'cipher-third', 'iv-third', 'tag-third', 1, '4444'
  )->>'idempotent',
  'true',
  'an active validated credential treats a network retry as metadata-only'
);
select is(
  (select ciphertext from public.company_ai_credentials where company_id = (select company_a from company_ai_secret_key_ids)),
  'cipher-recovery',
  'an active validated retry preserves the validated envelope'
);
select is(
  (public.server_record_company_ai_test((select company_a from company_ai_secret_key_ids), 'INVALID_CREDENTIAL'))->>'status',
  'INVALID',
  'a later provider invalidation remains auditable'
);
select throws_ok(
  $$select public.bootstrap_deployment_company_ai_credential('10000000-0000-4000-8000-202609091101', '10000000-0000-4000-8000-202609091001', 'cipher-third', 'iv-third', 'tag-third', 1, '4444')$$,
  '55000', null,
  'bootstrap cannot replace a credential after successful validation and later invalidation'
);
select is(
  (select ciphertext from public.company_ai_credentials where company_id = (select company_a from company_ai_secret_key_ids)),
  'cipher-recovery',
  'post-success bootstrap refusal preserves the validated envelope'
);

reset role;
set local role anon;
select throws_ok($$select public.server_get_company_ai_config('10000000-0000-4000-8000-202609091101')$$, '42501', null, 'anon cannot execute server metadata lookup');
select throws_ok($$select public.server_record_company_ai_test('10000000-0000-4000-8000-202609091101', 'SUCCESS')$$, '42501', null, 'anon cannot execute server test recording');
select throws_ok($$select public.bootstrap_deployment_company_ai_credential('10000000-0000-4000-8000-202609091101', '10000000-0000-4000-8000-202609091001', 'cipher', 'iv', 'tag', 1, '1111')$$, '42501', null, 'anon cannot execute AI bootstrap');
select throws_ok($$select public.resolve_company_ai_credential('10000000-0000-4000-8000-202609091101')$$, '42501', null, 'anon cannot execute credential resolution');
select throws_ok($$select public.server_mark_company_ai_invalid('10000000-0000-4000-8000-202609091101')$$, '42501', null, 'anon cannot execute credential invalidation');

reset role;
set local role authenticated;
select throws_ok($$select public.server_get_company_ai_config('10000000-0000-4000-8000-202609091101')$$, '42501', null, 'authenticated cannot execute server metadata lookup');
select throws_ok($$select public.server_record_company_ai_test('10000000-0000-4000-8000-202609091101', 'SUCCESS')$$, '42501', null, 'authenticated cannot execute server test recording');
select throws_ok($$select public.bootstrap_deployment_company_ai_credential('10000000-0000-4000-8000-202609091101', '10000000-0000-4000-8000-202609091001', 'cipher', 'iv', 'tag', 1, '1111')$$, '42501', null, 'authenticated cannot execute AI bootstrap');
select throws_ok($$select public.resolve_company_ai_credential('10000000-0000-4000-8000-202609091101')$$, '42501', null, 'authenticated cannot execute credential resolution');
select throws_ok($$select public.server_mark_company_ai_invalid('10000000-0000-4000-8000-202609091101')$$, '42501', null, 'authenticated cannot execute credential invalidation');

reset role;
select * from finish();
rollback;
