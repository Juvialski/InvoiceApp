begin;
select plan(30);

-- 1. Core tables exist across all domains
select has_table('public', 'companies', 'public.companies exists');
select has_table('public', 'company_members', 'public.company_members exists');
select has_table('public', 'company_audit_events', 'public.company_audit_events exists');
select has_table('public', 'company_role_catalog', 'public.company_role_catalog exists');
select has_table('public', 'company_permission_catalog', 'public.company_permission_catalog exists');
select has_table('public', 'company_ai_settings', 'public.company_ai_settings exists');
select has_table('public', 'company_ai_credentials', 'public.company_ai_credentials exists');
select has_table('public', 'payroll_periods', 'public.payroll_periods exists');
select has_table('public', 'payroll_runs', 'public.payroll_runs exists');
select has_table('public', 'payroll_entries', 'public.payroll_entries exists');
select has_table('public', 'financial_accounts', 'public.financial_accounts exists');
select has_table('public', 'financial_balance_snapshots', 'public.financial_balance_snapshots exists');
select has_table('public', 'financial_transactions', 'public.financial_transactions exists');
select has_table('public', 'financial_import_batches', 'public.financial_import_batches exists');
select has_table('public', 'financial_transaction_matches', 'public.financial_transaction_matches exists');

-- 2. Row Level Security active on sensitive tables
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''companies'' and c.relrowsecurity = true', 'companies RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''company_members'' and c.relrowsecurity = true', 'company_members RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''company_audit_events'' and c.relrowsecurity = true', 'company_audit_events RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''company_ai_credentials'' and c.relrowsecurity = true', 'company_ai_credentials RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''financial_accounts'' and c.relrowsecurity = true', 'financial_accounts RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''financial_transactions'' and c.relrowsecurity = true', 'financial_transactions RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''financial_transaction_matches'' and c.relrowsecurity = true', 'financial_transaction_matches RLS active');

-- 3. Key domain RPC functions exist
select has_function('public', 'commit_financial_import', 'public.commit_financial_import exists');
select has_function('public', 'confirm_financial_transfer', 'public.confirm_financial_transfer exists');
select has_function('public', 'platform_update_company', 'public.platform_update_company exists');
select has_function('private', 'write_company_audit', 'private.write_company_audit exists');

-- 4. Check constraints exist
select has_check('public', 'company_audit_events', 'company_audit_events_event_type_check', 'company_audit_events_event_type_check exists');

-- 5. Permission catalog entries exist
select isnt_empty(
  'select 1 from public.company_permission_catalog where permission_key = ''cash.summary.read''',
  'cash.summary.read permission exists'
);
select isnt_empty(
  'select 1 from public.company_permission_catalog where permission_key = ''cash.reconcile''',
  'cash.reconcile permission exists'
);

-- 6. Audit allowlist includes all 33 event types
select results_eq(
  $$
    select count(*)::bigint from unnest(array[
      'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_SUSPENDED', 'COMPANY_ARCHIVED', 'COMPANY_REACTIVATED',
      'USER_INVITED', 'INVITE_REVOKED', 'INVITE_ACCEPTED',
      'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED', 'MEMBER_REACTIVATED', 'MEMBER_REVOKED',
      'PAYROLL_REPAIR_APPLIED', 'PAYROLL_CALENDAR_REBUILT', 'PAYROLL_UNAPPROVED_RESET',
      'COMPANY_AI_CREDENTIAL_CONFIGURED', 'COMPANY_AI_CREDENTIAL_ROTATED',
      'COMPANY_AI_CREDENTIAL_TESTED', 'COMPANY_AI_CREDENTIAL_ENABLED',
      'COMPANY_AI_CREDENTIAL_DISABLED', 'COMPANY_AI_CREDENTIAL_REMOVED',
      'PAYROLL_WORKSPACE_RESET',
      'CASH_ACCOUNT_CREATED', 'CASH_ACCOUNT_UPDATED', 'CASH_ACCOUNT_DEACTIVATED',
      'CASH_BALANCE_SNAPSHOT_RECORDED', 'CASH_STATEMENT_IMPORTED', 'CASH_STATEMENT_REJECTED',
      'CASH_TRANSACTION_CREATED', 'CASH_TRANSACTION_UPDATED',
      'CASH_RECONCILIATION_CONFIRMED', 'CASH_RECONCILIATION_REMOVED', 'CASH_TRANSFER_MATCHED'
    ]) as e
    join pg_constraint c on c.conname = 'company_audit_events_event_type_check' and c.conrelid = 'public.company_audit_events'::regclass
    where pg_get_constraintdef(c.oid) like '%' || quote_literal(e) || '%'
  $$,
  ARRAY[33::bigint],
  'company_audit_events constraint contains all 33 required event types'
);

select * from finish();
rollback;
