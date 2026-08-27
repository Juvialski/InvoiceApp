begin;
select plan(58);

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
select has_table('public', 'engineering_documents', 'public.engineering_documents exists');
select has_table('public', 'engineering_document_revisions', 'public.engineering_document_revisions exists');
select has_table('public', 'drawing_annotations', 'public.drawing_annotations exists');
select has_table('public', 'engineering_daily_site_logs', 'public.engineering_daily_site_logs exists');
select has_table('public', 'engineering_daily_site_log_weather', 'public.engineering_daily_site_log_weather exists');
select has_table('public', 'engineering_daily_site_log_crew', 'public.engineering_daily_site_log_crew exists');
select has_table('public', 'engineering_daily_site_log_equipment', 'public.engineering_daily_site_log_equipment exists');
select has_table('public', 'engineering_daily_site_log_safety', 'public.engineering_daily_site_log_safety exists');
select has_table('public', 'engineering_daily_site_log_events', 'public.engineering_daily_site_log_events exists');

-- 2. Row Level Security active on sensitive tables
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''companies'' and c.relrowsecurity = true', 'companies RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''company_members'' and c.relrowsecurity = true', 'company_members RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''company_audit_events'' and c.relrowsecurity = true', 'company_audit_events RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''company_ai_credentials'' and c.relrowsecurity = true', 'company_ai_credentials RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''financial_accounts'' and c.relrowsecurity = true', 'financial_accounts RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''financial_transactions'' and c.relrowsecurity = true', 'financial_transactions RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''financial_transaction_matches'' and c.relrowsecurity = true', 'financial_transaction_matches RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''engineering_documents'' and c.relrowsecurity = true', 'engineering_documents RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''engineering_document_revisions'' and c.relrowsecurity = true', 'engineering_document_revisions RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''drawing_annotations'' and c.relrowsecurity = true', 'drawing_annotations RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''engineering_daily_site_logs'' and c.relrowsecurity = true', 'engineering_daily_site_logs RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''engineering_daily_site_log_weather'' and c.relrowsecurity = true', 'daily Site Log weather RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''engineering_daily_site_log_crew'' and c.relrowsecurity = true', 'daily Site Log crew RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''engineering_daily_site_log_equipment'' and c.relrowsecurity = true', 'daily Site Log equipment RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''engineering_daily_site_log_safety'' and c.relrowsecurity = true', 'daily Site Log safety RLS active');
select isnt_empty('select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''engineering_daily_site_log_events'' and c.relrowsecurity = true', 'daily Site Log events RLS active');

-- 3. Key domain RPC functions exist
select has_function('public', 'commit_financial_import', 'public.commit_financial_import exists');
select has_function('public', 'confirm_financial_transfer', 'public.confirm_financial_transfer exists');
select has_function('public', 'platform_update_company', 'public.platform_update_company exists');
select has_function('public', 'create_engineering_document_with_revision', 'public.create_engineering_document_with_revision exists');
select has_function('private', 'validate_engineering_current_revision', 'private.validate_engineering_current_revision exists');
select has_function('private', 'write_company_audit', 'private.write_company_audit exists');
select has_function('public', 'create_engineering_daily_site_log', 'public.create_engineering_daily_site_log exists');
select has_function('public', 'update_engineering_daily_site_log_draft', 'public.update_engineering_daily_site_log_draft exists');
select has_function('public', 'submit_engineering_daily_site_log', 'public.submit_engineering_daily_site_log exists');
select has_function('public', 'finalize_engineering_daily_site_log', 'public.finalize_engineering_daily_site_log exists');
select has_function('public', 'void_engineering_daily_site_log', 'public.void_engineering_daily_site_log exists');

-- 4. Check constraints exist
select isnt_empty(
  'select 1 from pg_constraint where conrelid = ''public.company_audit_events''::regclass and conname = ''company_audit_events_event_type_check''',
  'company_audit_events_event_type_check exists'
);

-- 5. Permission catalog entries exist
select isnt_empty(
  'select 1 from public.company_permission_catalog where permission_key = ''cash.summary.read''',
  'cash.summary.read permission exists'
);
select isnt_empty(
  'select 1 from public.company_permission_catalog where permission_key = ''cash.reconcile''',
  'cash.reconcile permission exists'
);
select isnt_empty(
  'select 1 from public.company_permission_catalog where permission_key = ''engineering.site_logs.read''',
  'engineering.site_logs.read permission exists'
);

-- 6. Phase 1A redline history is append-only for application roles
select isnt_empty(
  'select 1 from pg_trigger where tgname = ''drawing_annotations_append_only'' and not tgisinternal',
  'drawing annotation append-only trigger exists'
);
select is_empty(
  'select 1 from information_schema.role_table_grants where table_schema = ''public'' and table_name = ''drawing_annotations'' and grantee = ''authenticated'' and privilege_type = ''DELETE''',
  'authenticated cannot physically delete drawing annotations'
);

-- 7. Audit allowlist includes all 56 event types through Phase 1C
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
      'CASH_RECONCILIATION_CONFIRMED', 'CASH_RECONCILIATION_REMOVED', 'CASH_TRANSFER_MATCHED',
      'ENGINEERING_DOCUMENT_CREATED', 'ENGINEERING_DOCUMENT_UPDATED', 'ENGINEERING_DOCUMENT_ARCHIVED',
      'ENGINEERING_REVISION_UPLOADED', 'ENGINEERING_ANNOTATION_SAVED', 'ENGINEERING_ANNOTATION_DELETED',
      'ENGINEERING_RFI_CREATED', 'ENGINEERING_RFI_OPENED', 'ENGINEERING_RFI_RESPONDED', 'ENGINEERING_RFI_CLOSED', 'ENGINEERING_RFI_VOIDED',
      'ENGINEERING_SUBMITTAL_CREATED', 'ENGINEERING_SUBMITTAL_SUBMITTED', 'ENGINEERING_SUBMITTAL_REVIEW_STARTED', 'ENGINEERING_SUBMITTAL_REVIEWED',
      'ENGINEERING_SUBMITTAL_RESUBMITTED', 'ENGINEERING_SUBMITTAL_CLOSED', 'ENGINEERING_SUBMITTAL_VOIDED',
      'ENGINEERING_DAILY_SITE_LOG_CREATED', 'ENGINEERING_DAILY_SITE_LOG_UPDATED', 'ENGINEERING_DAILY_SITE_LOG_SUBMITTED',
      'ENGINEERING_DAILY_SITE_LOG_FINALIZED', 'ENGINEERING_DAILY_SITE_LOG_VOIDED'
    ]) as e
    join pg_constraint c on c.conname = 'company_audit_events_event_type_check' and c.conrelid = 'public.company_audit_events'::regclass
    where pg_get_constraintdef(c.oid) like '%' || quote_literal(e) || '%'
  $$,
  ARRAY[56::bigint],
  'company_audit_events constraint contains all 56 required event types'
);

select * from finish();
rollback;
