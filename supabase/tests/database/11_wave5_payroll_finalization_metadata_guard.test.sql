-- Wave 5 follow-up invariant: approval/payment authority must not smuggle
-- unrelated payroll-run metadata changes into a finalization transition.
begin;
select plan(3);

select isnt_empty(
  $$select 1
    from pg_trigger
   where tgrelid = 'public.payroll_runs'::regclass
     and tgname = 'payroll_runs_finalization_metadata_guard'
     and not tgisinternal$$,
  'payroll finalization metadata guard is installed'
);

select isnt_empty(
  $$select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'guard_payroll_run_finalization_metadata'
     and p.prosrc like '%new.created_at is distinct from old.created_at%'
     and p.prosrc like '%new.notes is distinct from old.notes%'$$,
  'CALCULATED to APPROVED freezes created_at and notes'
);

select isnt_empty(
  $$select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'guard_payroll_run_finalization_metadata'
     and p.prosrc like '%old.status = ''APPROVED'' and new.status in (''PAID'', ''VOID'')%'
     and p.prosrc like '%new.created_at is distinct from old.created_at%'$$,
  'APPROVED to PAID or VOID preserves run creation history'
);

select * from finish();
rollback;
