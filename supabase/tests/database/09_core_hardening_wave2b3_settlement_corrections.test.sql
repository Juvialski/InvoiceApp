begin;
select no_plan();

select has_function('public', 'reverse_financial_settlement', 'settlement reversal RPC exists');
select isnt_empty(
  $$select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='reverse_financial_settlement'
      and p.prosecdef and coalesce(array_to_string(p.proconfig, ','),'') like '%search_path=""%'$$,
  'settlement reversal RPC is SECURITY DEFINER with an empty search_path'
);

select ok(
  not has_function_privilege('anon', 'public.reverse_financial_settlement(uuid,uuid,text)', 'EXECUTE'),
  'anon and public cannot execute settlement reversal RPC'
);

select ok(
  has_function_privilege('authenticated', 'public.reverse_financial_settlement(uuid,uuid,text)', 'EXECUTE'),
  'authenticated can execute guarded settlement reversal RPC'
);

select ok(
  not has_table_privilege('authenticated', 'public.financial_transaction_matches', 'INSERT')
  and not has_table_privilege('authenticated', 'public.financial_transaction_matches', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.financial_transaction_matches', 'DELETE'),
  'authenticated cannot bypass settlement RPCs with direct match table writes'
);

select * from finish();
rollback;
