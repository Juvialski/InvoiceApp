begin;
select plan(1);

select ok(
  coalesce((
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'guard_finalized_payroll_workforce_source'
      and pg_get_function_identity_arguments(p.oid) = ''
  ), false),
  'finalized payroll workforce source guard runs as SECURITY DEFINER independent of caller read RLS'
);

select * from finish();
rollback;
