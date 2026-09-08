begin;
select no_plan();

select has_function('public', 'bootstrap_deployment_company', 'guarded deployment bootstrap function exists');
select is_empty(
  $$select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'bootstrap_deployment_company'
      and lower(grantee) in ('public', 'anon', 'authenticated')
      and privilege_type = 'EXECUTE'$$,
  'browser roles cannot execute deployment bootstrap'
);
select isnt_empty(
  $$select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'bootstrap_deployment_company'
      and lower(grantee) = 'service_role'
      and privilege_type = 'EXECUTE'$$,
  'service role can execute deployment bootstrap'
);
select isnt_empty(
  $$select 1
    from pg_proc
    where oid = 'public.bootstrap_deployment_company(uuid,text,text,text,text)'::regprocedure
      and prosecdef
      and proconfig @> array['search_path=""']$$,
  'deployment bootstrap is a hardened SECURITY DEFINER function'
);

create temp table deployment_bootstrap_ids as
select
  '10000000-0000-4000-8000-000000000031'::uuid as admin_user,
  '10000000-0000-4000-8000-000000000032'::uuid as unconfirmed_user;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ((select admin_user from deployment_bootstrap_ids), 'qa-bootstrap-admin@test.local', 'x', now(), now(), now()),
  ((select unconfirmed_user from deployment_bootstrap_ids), 'qa-bootstrap-unconfirmed@test.local', 'x', null, now(), now());

select is(
  public.bootstrap_deployment_company(
    (select admin_user from deployment_bootstrap_ids),
    'Synthetic QA Bootstrap Company',
    'synthetic-qa',
    'PHP',
    'Asia/Manila'
  ) ->> 'idempotent',
  'false',
  'first bootstrap creates a deployment company'
);
select is((select count(*)::integer from public.companies), 1, 'first bootstrap creates exactly one company');
select is((select count(*)::integer from public.deployment_configuration), 1, 'first bootstrap creates one deployment configuration');
select is((select count(*)::integer from public.company_members where role_key = 'COMPANY_ADMIN' and status = 'ACTIVE'), 1, 'first bootstrap creates one active Company Admin');
select is((select count(*)::integer from public.company_audit_events where event_type = 'COMPANY_CREATED' and (metadata ->> 'bootstrap')::boolean), 1, 'first bootstrap records an auditable bootstrap event');
select ok((select actor_user_id is null from public.company_audit_events where event_type = 'COMPANY_CREATED'), 'bootstrap audit does not fabricate an application actor');

select is(
  public.bootstrap_deployment_company(
    (select admin_user from deployment_bootstrap_ids),
    'Synthetic QA Bootstrap Company',
    'synthetic-qa',
    'PHP',
    'Asia/Manila'
  ) ->> 'idempotent',
  'true',
  'repeated bootstrap is idempotent'
);
select is((select count(*)::integer from public.companies), 1, 'repeated bootstrap does not create a second company');
select is((select count(*)::integer from public.company_members), 1, 'repeated bootstrap does not create a second membership');
select is((select count(*)::integer from public.company_audit_events where event_type = 'COMPANY_CREATED'), 1, 'repeated bootstrap does not duplicate the creation audit');

select throws_ok(
  $$select public.bootstrap_deployment_company(
    (select admin_user from deployment_bootstrap_ids),
    'Different Company', 'different-company', 'PHP', 'Asia/Manila'
  )$$,
  '55000', null,
  'configured deployment cannot be retargeted'
);

select throws_ok(
  $$select public.bootstrap_deployment_company(
    (select unconfirmed_user from deployment_bootstrap_ids),
    'Different Company', 'different-company', 'PHP', 'Asia/Manila'
  )$$,
  '55000', null,
  'configured deployment rejects a different administrator'
);

select * from finish();
rollback;
