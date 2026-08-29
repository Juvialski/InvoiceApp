begin;
select no_plan();

select has_function('public', 'reverse_financial_settlement', 'settlement reversal RPC exists');
select isnt_empty(
  $$select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='reverse_financial_settlement'
      and p.prosecdef and coalesce(array_to_string(p.proconfig, ','),'') like '%search_path=""%$$,
  'settlement reversal RPC is SECURITY DEFINER with an empty search_path'
);

select is_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema='public' and routine_name='reverse_financial_settlement'
      and lower(grantee) in ('anon','public') and privilege_type='EXECUTE'$$,
  'anon and public cannot execute settlement reversal RPC'
);

select isnt_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema='public' and routine_name='reverse_financial_settlement'
      and grantee='authenticated' and privilege_type='EXECUTE'$$,
  'authenticated can execute guarded settlement reversal RPC'
);

select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='financial_transaction_matches'
      and grantee='authenticated' and privilege_type in ('UPDATE', 'DELETE')$$,
  'authenticated cannot bypass reversal RPC with direct match table updates or deletes'
);

select * from finish();
rollback;
