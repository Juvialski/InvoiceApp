begin;
select no_plan();

-- deployment_configuration is an internal singleton used by SECURITY DEFINER
-- resolvers. Browser roles must never query or mutate it directly.
select isnt_empty(
  $$select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'deployment_configuration'
      and c.relrowsecurity = true$$,
  'deployment_configuration has RLS enabled'
);

select is_empty(
  $$select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'deployment_configuration'
      and grantee in ('anon', 'authenticated')$$,
  'browser roles have no direct deployment_configuration table privileges'
);

select is_empty(
  $$select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'deployment_configuration'$$,
  'deployment_configuration exposes no browser-facing RLS policy'
);

select ok(
  (select p.prosecdef
     from pg_proc p
     where p.oid = 'private.deployment_company_id()'::regprocedure),
  'deployment company resolver remains SECURITY DEFINER'
);

select * from finish();
rollback;
