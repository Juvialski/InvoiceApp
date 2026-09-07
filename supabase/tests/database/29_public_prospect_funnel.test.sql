begin;
select no_plan();

select has_table('public', 'prospect_submissions', 'public.prospect_submissions exists');
select has_table('private', 'public_prospect_funnel_configuration', 'private public funnel configuration exists');
select is(
  (select enabled from private.public_prospect_funnel_configuration where singleton = true),
  false,
  'public prospect persistence is disabled by default for operational deployments'
);
select isnt_empty(
  $$select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'prospect_submissions'
      and c.relrowsecurity = true$$,
  'prospect_submissions has RLS enabled'
);
select is_empty(
  $$select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'prospect_submissions'
      and grantee in ('public', 'anon', 'authenticated')$$,
  'browser roles have no direct prospect table privileges'
);
select is_empty(
  $$select 1
    from information_schema.role_table_grants
    where table_schema = 'private'
      and table_name = 'public_prospect_funnel_configuration'
      and grantee in ('public', 'anon', 'authenticated')$$,
  'browser roles cannot change the deployment-level public funnel gate'
);
select is_empty(
  $$select 1
    from pg_constraint
    where conrelid = 'public.prospect_submissions'::regclass
      and contype = 'f'$$,
  'public prospect intake has no operational foreign-key links'
);
select is(
  has_function_privilege('anon', 'public.submit_public_prospect(text,text,text,text,text[],text,text,text,text,text,text,boolean)', 'EXECUTE'),
  true,
  'anon can execute only the public submission RPC'
);
select is(
  has_function_privilege('authenticated', 'public.submit_public_prospect(text,text,text,text,text[],text,text,text,text,text,text,boolean)', 'EXECUTE'),
  false,
  'authenticated users cannot execute the public submission RPC'
);
select ok(
  (select p.prosecdef
     from pg_proc p
    where p.oid = 'public.submit_public_prospect(text,text,text,text,text[],text,text,text,text,text,text,boolean)'::regprocedure),
  'public submission RPC is SECURITY DEFINER for the table-without-grant insert'
);

set local role anon;
select throws_ok(
  $$select public.submit_public_prospect(
      'Disabled Funnel Test', 'Ari Santos', 'ari.santos@example.com', null,
      array['projects']::text[], '26-100', '6-20', null, null,
      'within-3-months', 'DEMO', true
    )$$,
  '42501', null,
  'anonymous prospect persistence fails closed until an operator enables this deployment'
);
reset role;

update private.public_prospect_funnel_configuration
set enabled = true,
    updated_at = now()
where singleton = true;

set local role anon;
select lives_ok(
  $$select public.submit_public_prospect(
      'Harbor Works Construction',
      'Ari Santos',
      'ari.santos@example.com',
      '+63 917 555 0123',
      array['projects', 'procurement']::text[],
      '26-100',
      '6-20',
      'Disconnected project and receipt context',
      'High-level email integration discussion',
      'within-3-months',
      'DEMO_AND_REQUIREMENTS',
      true
    )$$,
  'anonymous visitor can submit one bounded prospect request after privileged deployment enablement'
);
select throws_ok(
  $$select public.submit_public_prospect(
      'Harbor Works Construction', 'Ari Santos', 'ari.santos@example.com', null,
      array['projects', 'unknown-capability']::text[], '26-100', '6-20', null, null,
      'within-3-months', 'DEMO', true
    )$$,
  '22023', null,
  'anonymous RPC rejects an invalid capability'
);
select throws_ok(
  $$select * from public.prospect_submissions$$,
  '42501', null,
  'anonymous visitor cannot read prospect submissions'
);
select throws_ok(
  $$insert into public.prospect_submissions (company_name, contact_name, contact_email, workforce_scale, project_scale, desired_timeline, request_type)
    values ('No direct insert', 'Caller', 'caller@example.com', '1-25', '1-5', 'exploring', 'DEMO')$$,
  '42501', null,
  'anonymous visitor cannot bypass the submission RPC with direct insert'
);
select throws_ok(
  $$update public.prospect_submissions set company_name = 'Changed' where id = '00000000-0000-4000-8000-000000000001'::uuid$$,
  '42501', null,
  'anonymous visitor cannot update prospect submissions'
);
select throws_ok(
  $$delete from public.prospect_submissions where id = '00000000-0000-4000-8000-000000000001'::uuid$$,
  '42501', null,
  'anonymous visitor cannot delete prospect submissions'
);
reset role;

select is(
  (select count(*) from public.prospect_submissions),
  1::bigint,
  'one accepted prospect request is retained for operator review'
);
select is(
  (select contact_email from public.prospect_submissions limit 1),
  'ari.santos@example.com',
  'prospect email is normalized by the database function'
);

set local role authenticated;
select throws_ok(
  $$select public.submit_public_prospect(
      'Authenticated Caller', 'Caller', 'caller@example.com', null,
      array['projects']::text[], '1-25', '1-5', null, null, 'exploring', 'DEMO', true
    )$$,
  '42501', null,
  'authenticated operational users cannot invoke anonymous prospect intake'
);
select throws_ok(
  $$select * from public.prospect_submissions$$,
  '42501', null,
  'authenticated operational users cannot read prospect submissions'
);
reset role;

select * from finish();
rollback;
