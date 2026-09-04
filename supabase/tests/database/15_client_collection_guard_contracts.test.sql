begin;
select no_plan();

select isnt_empty(
  $$select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'client_collections'
      and t.tgname = 'client_collections_finalized_state_guard'
      and not t.tgisinternal$$,
  'client collections have a finalized-state lifecycle guard'
);

select isnt_empty(
  $$select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'client_billings'
      and t.tgname = 'client_billings_collection_void_guard'
      and not t.tgisinternal$$,
  'client billings prevent voiding while active recorded collections exist'
);

select isnt_empty(
  $$select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'guard_client_collection_finalized_update'
      and pg_get_functiondef(p.oid) like '%old.status = ''RECORDED''%'
      and pg_get_functiondef(p.oid) like '%new.status <> ''REVERSED''%'$$,
  'finalized collection guard permits only the one-way recorded-to-reversed correction'
);

select isnt_empty(
  $$select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'prevent_client_billing_void_with_recorded_collections'
      and pg_get_functiondef(p.oid) like '%c.status = ''RECORDED''%'
      and pg_get_functiondef(p.oid) like '%using errcode = ''23514''%'$$,
  'billing void guard checks active recorded collection allocations'
);

select * from finish();
rollback;
