begin;
select plan(18);

select has_column('public', 'financial_transaction_matches', 'reversed_by_user_id', 'settlement reversal actor is stored');
select has_column('public', 'financial_transaction_matches', 'reversed_at', 'settlement reversal timestamp is stored');
select has_column('public', 'financial_transaction_matches', 'reversal_reason', 'settlement reversal reason is stored');
select has_column('public', 'financial_transaction_matches', 'confirmation_source', 'settlement confirmation source is stored');

select has_function('public', 'confirm_financial_settlement', 'single-settlement RPC exists');
select has_function('public', 'confirm_financial_settlement_batch', 'atomic split-settlement RPC exists');
select has_function('public', 'reverse_financial_settlement', 'settlement reversal RPC exists');
select has_function('public', 'get_financial_settlement_summary', 'canonical settlement summary RPC exists');

select isnt_empty(
  $$select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='confirm_financial_settlement'
      and p.prosecdef and coalesce(array_to_string(p.proconfig, ','),'') like '%search_path=""%'$$,
  'single-settlement RPC is SECURITY DEFINER with an empty search_path'
);
select isnt_empty(
  $$select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='confirm_financial_settlement_batch'
      and p.prosecdef and coalesce(array_to_string(p.proconfig, ','),'') like '%search_path=""%'$$,
  'batch-settlement RPC is SECURITY DEFINER with an empty search_path'
);

select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='financial_transaction_matches'
      and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')$$,
  'authenticated cannot forge confirmed settlement rows directly'
);
select isnt_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='financial_transaction_matches'
      and grantee='authenticated' and privilege_type='SELECT'$$,
  'authenticated retains permission-aware settlement history reads'
);

select isnt_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema='public' and routine_name='confirm_financial_settlement'
      and grantee='authenticated' and privilege_type='EXECUTE'$$,
  'authenticated can execute guarded single settlement confirmation'
);
select is_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema='public' and routine_name='confirm_financial_settlement'
      and grantee in ('anon','PUBLIC') and privilege_type='EXECUTE'$$,
  'anon/public cannot execute settlement confirmation'
);

select isnt_empty(
  $$select 1 from pg_constraint
    where conrelid='public.financial_transaction_matches'::regclass
      and conname='financial_transaction_matches_reversal_check'$$,
  'reversal provenance constraint exists'
);
select isnt_empty(
  $$select 1 from pg_constraint
    where conrelid='public.financial_transaction_matches'::regclass
      and conname='financial_transaction_matches_status_check'
      and pg_get_constraintdef(oid) like '%REVERSED%'$$,
  'match lifecycle constraint includes REVERSED'
);

select isnt_empty(
  $$select 1 from pg_constraint c
    where c.conrelid='public.company_audit_events'::regclass
      and c.conname='company_audit_events_event_type_check'
      and pg_get_constraintdef(c.oid) like '%CASH_SETTLEMENT_CONFIRMED%'
      and pg_get_constraintdef(c.oid) like '%CASH_SETTLEMENT_REVERSED%'$$,
  'audit allowlist includes settlement confirmation and reversal events'
);

select isnt_empty(
  $$select 1 from pg_indexes where schemaname='public'
    and tablename='financial_transaction_matches'
    and indexname='financial_transaction_matches_active_target_idx'$$,
  'active target settlement lookup is indexed'
);

select * from finish();
rollback;
