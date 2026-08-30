-- Wave 2B3 Cash, Banking, and Settlement correction contract.
-- The first block is safe to run without fixture data; the second block uses
-- deterministic authenticated fixtures to exercise the guarded RPC paths.
begin;
select no_plan();

select has_column('public', 'financial_transaction_matches', 'transfer_group_id', 'transfer relationship group is stored on matches');
select has_column('public', 'financial_transactions', 'reversed_by_user_id', 'transaction reversal actor is stored');
select has_column('public', 'financial_transactions', 'reversed_at', 'transaction reversal timestamp is stored');
select has_column('public', 'financial_transactions', 'reversal_reason', 'transaction reversal reason is stored');

select has_function('public', 'save_financial_account', 'account save RPC exists');
select has_function('public', 'deactivate_financial_account', 'account deactivation RPC exists');
select has_function('public', 'reactivate_financial_account', 'account reactivation RPC exists');
select has_function('public', 'create_financial_transaction', 'manual transaction creation RPC exists');
select has_function('public', 'correct_financial_transaction', 'manual transaction correction RPC exists');
select has_function('public', 'reverse_financial_transaction', 'transaction reversal RPC exists');
select has_function('public', 'ignore_financial_transaction', 'transaction ignore RPC exists');
select has_function('public', 'restore_financial_transaction_to_review', 'transaction review restoration RPC exists');
select has_function('public', 'reverse_financial_transfer', 'transfer reversal RPC exists');
select has_function('public', 'confirm_financial_settlement_batch', 'atomic settlement batch RPC remains available');
select has_function('public', 'reverse_financial_settlement', 'settlement reversal RPC remains available');

select isnt_empty($$select 1 from pg_proc where oid = 'public.reverse_financial_settlement(uuid,uuid,text)'::regprocedure and prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'$$, 'settlement reversal is SECURITY DEFINER with an empty search_path');
select isnt_empty($$select 1 from pg_proc where oid = 'public.reverse_financial_transfer(uuid,uuid,uuid,uuid,text)'::regprocedure and prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'$$, 'transfer reversal is SECURITY DEFINER with an empty search_path');
select isnt_empty($$select 1 from pg_proc where oid = 'public.correct_financial_transaction(uuid,uuid,date,text,text,text,numeric,text)'::regprocedure and prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'$$, 'transaction correction is SECURITY DEFINER with an empty search_path');

select is_empty($$select 1 from information_schema.role_table_grants where table_schema='public' and table_name in ('financial_accounts','financial_transactions','financial_import_batches','financial_transaction_matches') and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')$$, 'authenticated cannot bypass guarded account, transaction, import, or match RPCs');
select is_empty($$select 1 from information_schema.role_table_grants where table_schema='public' and table_name='financial_balance_snapshots' and grantee='authenticated' and privilege_type in ('UPDATE','DELETE')$$, 'balance snapshots remain append-only');
select isnt_empty($$select 1 from information_schema.role_table_grants where table_schema='public' and table_name='financial_balance_snapshots' and grantee='authenticated' and privilege_type='INSERT'$$, 'authenticated retains append-only snapshot insert access');
select isnt_empty($$select 1 from information_schema.role_table_grants where table_schema='public' and table_name='financial_transaction_matches' and grantee='authenticated' and privilege_type='SELECT'$$, 'authenticated retains permission-aware match history reads');

select is_empty($$select 1 from information_schema.routine_privileges where routine_schema='public' and routine_name in ('save_financial_account','deactivate_financial_account','reactivate_financial_account','create_financial_transaction','correct_financial_transaction','reverse_financial_transaction','ignore_financial_transaction','restore_financial_transaction_to_review','reverse_financial_transfer') and lower(grantee) in ('anon','public') and privilege_type='EXECUTE'$$, 'anonymous and public roles cannot execute cash correction RPCs');
select isnt_empty($$select 1 from pg_constraint where conrelid='public.financial_transactions'::regclass and conname='financial_transactions_reversal_metadata_check'$$, 'transaction reversal provenance constraint exists');
select isnt_empty($$select 1 from pg_constraint where conrelid='public.financial_transaction_matches'::regclass and conname='financial_transaction_matches_reversal_check'$$, 'settlement reversal provenance constraint exists');
select isnt_empty($$select 1 from pg_indexes where schemaname='public' and tablename='financial_transaction_matches' and indexname='financial_transaction_matches_transfer_group_idx'$$, 'transfer relationship lookup is indexed');
select isnt_empty($$select 1 from pg_trigger where tgrelid='public.financial_import_batches'::regclass and tgname='financial_import_batches_immutable'$$, 'committed import provenance has an immutable trigger');
select isnt_empty($$select 1 from pg_constraint where conrelid='public.company_audit_events'::regclass and conname='company_audit_events_event_type_check' and pg_get_constraintdef(oid) like '%CASH_TRANSACTION_CORRECTED%' and pg_get_constraintdef(oid) like '%CASH_TRANSFER_REVERSED%'$$, 'audit allowlist includes Wave 2B3 correction events');

select * from finish();
rollback;

begin;
select no_plan();

create temp table wave2b3_ids as
select
  '00000000-0000-4000-8000-000000000201'::uuid as admin_user,
  '00000000-0000-4000-8000-000000000202'::uuid as finance_user,
  '00000000-0000-4000-8000-000000000203'::uuid as denied_user,
  '00000000-0000-4000-8000-000000000204'::uuid as outsider_user,
  'aaaaaaaa-0000-4000-8000-000000000201'::uuid as company_a,
  'bbbbbbbb-0000-4000-8000-000000000202'::uuid as company_b,
  '10000000-0000-4000-8000-000000000201'::uuid as account_a,
  '10000000-0000-4000-8000-000000000202'::uuid as account_b,
  '10000000-0000-4000-8000-000000000203'::uuid as account_inactive,
  '20000000-0000-4000-8000-000000000201'::uuid as tx_manual,
  '20000000-0000-4000-8000-000000000202'::uuid as tx_history,
  '20000000-0000-4000-8000-000000000203'::uuid as tx_transfer_out,
  '20000000-0000-4000-8000-000000000204'::uuid as tx_transfer_in,
  '20000000-0000-4000-8000-000000000205'::uuid as tx_inactive,
  '30000000-0000-4000-8000-000000000201'::uuid as tx_settlement,
  '30000000-0000-4000-8000-000000000202'::uuid as tx_ignored,
  '40000000-0000-4000-8000-000000000201'::uuid as invoice_a,
  '40000000-0000-4000-8000-000000000202'::uuid as invoice_b,
  '50000000-0000-4000-8000-000000000201'::uuid as settlement_match,
  '50000000-0000-4000-8000-000000000202'::uuid as settlement_history_match;

grant select on wave2b3_ids to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
select id, email, 'x', now(), now()
from (values
  ((select admin_user from wave2b3_ids), 'wave2b3-admin@test.local'),
  ((select finance_user from wave2b3_ids), 'wave2b3-finance@test.local'),
  ((select denied_user from wave2b3_ids), 'wave2b3-denied@test.local'),
  ((select outsider_user from wave2b3_ids), 'wave2b3-outsider@test.local')
) users(id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_a from wave2b3_ids), 'Wave 2B3 Cash Company', 'wave2b3-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from wave2b3_ids), (select admin_user from wave2b3_ids)),
  ((select company_b from wave2b3_ids), 'Wave 2B3 Other Company', 'wave2b3-b', 'ACTIVE', 'USD', 'UTC', (select outsider_user from wave2b3_ids), (select outsider_user from wave2b3_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_a from wave2b3_ids), (select admin_user from wave2b3_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_a from wave2b3_ids), (select finance_user from wave2b3_ids), 'VIEWER', 'ACTIVE'),
  ((select company_a from wave2b3_ids), (select denied_user from wave2b3_ids), 'FINANCE', 'ACTIVE'),
  ((select company_b from wave2b3_ids), (select outsider_user from wave2b3_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from wave2b3_ids));

insert into public.company_member_permission_overrides (company_id, membership_id, permission_key, effect, created_by_user_id)
select cm.company_id, cm.id, override_row.permission_key, 'DENY', (select admin_user from wave2b3_ids)
from public.company_members cm
cross join (values ('cash.reconcile'), ('cash.transactions.manage')) override_row(permission_key)
where cm.company_id = (select company_a from wave2b3_ids)
  and cm.user_id = (select denied_user from wave2b3_ids);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave2b3_ids), true);

select lives_ok($$select public.save_financial_account((select company_a from wave2b3_ids), (select account_a from wave2b3_ids), 'BANK', 'FIXTURE', 'Fixture Bank', 'Operating Account', '•••• 1201', 'PHP', 1000, date '2026-01-01', 'MANUAL', null, null)$$, 'admin can create a cash account through the guarded RPC');
select lives_ok($$select public.save_financial_account((select company_a from wave2b3_ids), (select account_b from wave2b3_ids), 'BANK', 'FIXTURE', 'Fixture Bank', 'Transfer Account', '•••• 1202', 'PHP', 0, date '2026-01-01', 'MANUAL', null, null)$$, 'admin can create a second cash account through the guarded RPC');
select lives_ok($$select public.save_financial_account((select company_a from wave2b3_ids), (select account_inactive from wave2b3_ids), 'BANK', 'FIXTURE', 'Fixture Bank', 'Inactive Account', '•••• 1203', 'PHP', 0, date '2026-01-01', 'MANUAL', null, null)$$, 'admin can create the account used for reactivation coverage');

select throws_ok($$insert into public.financial_accounts (id, company_id, account_type, institution_name, display_name, currency, created_by_user_id) values (gen_random_uuid(), (select company_a from wave2b3_ids), 'BANK', 'Bypass Bank', 'Bypass', 'PHP', (select admin_user from wave2b3_ids))$$, '42501', null, 'direct account insert is denied');
select throws_ok($$update public.financial_accounts set currency = 'USD' where id = (select account_a from wave2b3_ids)$$, '42501', null, 'direct account update is denied');

select lives_ok($$select public.create_financial_transaction((select company_a from wave2b3_ids), (select tx_manual from wave2b3_ids), (select account_a from wave2b3_ids), date '2026-08-30', timestamptz '2026-08-30 09:00:00+00', 'MAN-1', 'Manual correction candidate', 'DEBIT', 100, 'PHP', 'wave2b3-manual-1')$$, 'eligible manual transaction is created through the guarded RPC');
select lives_ok($$select public.create_financial_transaction((select company_a from wave2b3_ids), (select tx_history from wave2b3_ids), (select account_a from wave2b3_ids), date '2026-08-29', timestamptz '2026-08-29 09:00:00+00', 'HIST-1', 'Used transaction', 'DEBIT', 100, 'PHP', 'wave2b3-history-1')$$, 'used transaction fixture is created');
select lives_ok($$select public.create_financial_transaction((select company_a from wave2b3_ids), (select tx_transfer_out from wave2b3_ids), (select account_a from wave2b3_ids), date '2026-08-28', timestamptz '2026-08-28 09:00:00+00', 'TR-OUT', 'Transfer to second account', 'DEBIT', 75, 'PHP', 'wave2b3-transfer-out')$$, 'transfer-out fixture is created');
select lives_ok($$select public.create_financial_transaction((select company_a from wave2b3_ids), (select tx_transfer_in from wave2b3_ids), (select account_b from wave2b3_ids), date '2026-08-28', timestamptz '2026-08-28 09:05:00+00', 'TR-IN', 'Transfer from first account', 'CREDIT', 75, 'PHP', 'wave2b3-transfer-in')$$, 'transfer-in fixture is created');
select lives_ok($$select public.create_financial_transaction((select company_a from wave2b3_ids), (select tx_inactive from wave2b3_ids), (select account_inactive from wave2b3_ids), date '2026-08-27', timestamptz '2026-08-27 09:00:00+00', 'INACT-1', 'Inactive account fixture', 'DEBIT', 20, 'PHP', 'wave2b3-inactive')$$, 'inactive-account fixture transaction is created before deactivation');
select lives_ok($$select public.create_financial_transaction((select company_a from wave2b3_ids), (select tx_settlement from wave2b3_ids), (select account_a from wave2b3_ids), date '2026-08-26', timestamptz '2026-08-26 09:00:00+00', 'SET-1', 'Settlement transaction', 'DEBIT', 100, 'PHP', 'wave2b3-settlement')$$, 'settlement transaction fixture is created');
select lives_ok($$select public.create_financial_transaction((select company_a from wave2b3_ids), (select tx_ignored from wave2b3_ids), (select account_a from wave2b3_ids), date '2026-08-25', timestamptz '2026-08-25 09:00:00+00', 'IGN-1', 'Non-business fee', 'DEBIT', 10, 'PHP', 'wave2b3-ignored')$$, 'ignore transaction fixture is created');

select lives_ok($$select public.commit_financial_import((select company_a from wave2b3_ids), (select account_a from wave2b3_ids), 'CSV', 'wave2b3.csv', 'wave2b3-import-file', date '2026-08-22', date '2026-08-22', null, 1000, 1, 0, 0, '[{"transaction_date":"2026-08-22","direction":"CREDIT","amount":10,"source_fingerprint":"wave2b3-imported","currency":"PHP","description":"Imported evidence"}]'::jsonb)$$, 'committed statement import is created through its guarded operation');
select throws_ok($$update public.financial_import_batches set file_name = 'rewritten.csv' where file_fingerprint = 'wave2b3-import-file'$$, '42501', null, 'committed import batch cannot be directly rewritten');
select throws_ok($$delete from public.financial_import_batches where file_fingerprint = 'wave2b3-import-file'$$, '42501', null, 'committed import batch cannot be directly deleted');
select throws_ok($$update public.financial_transactions set amount = 99 where source_fingerprint = 'wave2b3-imported'$$, '42501', null, 'imported transaction cannot be directly rewritten');
select throws_ok($$select public.correct_financial_transaction((select company_a from wave2b3_ids), (select id from public.financial_transactions where source_fingerprint = 'wave2b3-imported'), date '2026-08-23', 'IMP-X', 'Should remain source evidence', 'CREDIT', 11, 'Attempt to rewrite imported source')$$, '42501', null, 'imported transaction correction is rejected');
select lives_ok($$select public.reverse_financial_transaction((select company_a from wave2b3_ids), (select id from public.financial_transactions where source_fingerprint = 'wave2b3-imported'), 'Imported statement row was incorrect')$$, 'incorrect imported transaction can be reversed without deleting provenance');
select is((select count(*) from public.financial_transactions where source_fingerprint = 'wave2b3-imported' and status = 'REVERSED' and import_batch_id is not null), 1::bigint, 'reversed imported transaction retains batch provenance');

select throws_ok($$insert into public.financial_transactions (id, company_id, account_id, transaction_date, description, direction, amount, currency, source, source_fingerprint, created_by_user_id) values (gen_random_uuid(), (select company_a from wave2b3_ids), (select account_a from wave2b3_ids), current_date, 'Bypass', 'DEBIT', 10, 'PHP', 'MANUAL', 'wave2b3-bypass', (select admin_user from wave2b3_ids))$$, '42501', null, 'direct transaction insert is denied');
select throws_ok($$update public.financial_transactions set amount = 999 where id = (select tx_manual from wave2b3_ids)$$, '42501', null, 'direct transaction update is denied');

insert into public.invoices (id, user_id, company_id, invoice_number, invoice_date, currency, grand_total, payment_status, review_status, current_data)
values
  ((select invoice_a from wave2b3_ids), (select admin_user from wave2b3_ids), (select company_a from wave2b3_ids), 'W2B3-INV-A', date '2026-08-20', 'PHP', 100, 'UNPAID', 'VERIFIED', '{}'::jsonb),
  ((select invoice_b from wave2b3_ids), (select admin_user from wave2b3_ids), (select company_a from wave2b3_ids), 'W2B3-INV-B', date '2026-08-21', 'PHP', 100, 'UNPAID', 'VERIFIED', '{}'::jsonb);

select lives_ok($$select public.confirm_financial_settlement((select company_a from wave2b3_ids), (select tx_settlement from wave2b3_ids), 'INVOICE', (select invoice_a from wave2b3_ids), 100, (select settlement_match from wave2b3_ids), null, 'Fixture settlement', 'RECONCILIATION_UI')$$, 'confirmed settlement fixture is created through the guarded RPC');
select is((select reconciliation_status from public.financial_transactions where id = (select tx_settlement from wave2b3_ids)), 'MATCHED', 'settlement confirmation recomputes transaction reconciliation');
select is((public.get_financial_settlement_summary((select company_a from wave2b3_ids), 'INVOICE', (select invoice_a from wave2b3_ids))->>'reconciledCashPaid')::numeric, 100::numeric, 'target summary counts confirmed settlement');
select throws_ok($$select public.reverse_financial_settlement((select company_a from wave2b3_ids), (select settlement_match from wave2b3_ids), null)$$, '22023', null, 'settlement reversal requires a reason');
select lives_ok($$select public.reverse_financial_settlement((select company_a from wave2b3_ids), (select settlement_match from wave2b3_ids), 'Wrong invoice selected')$$, 'confirmed settlement reverses with a reason');
select is((select status from public.financial_transaction_matches where id = (select settlement_match from wave2b3_ids)), 'REVERSED', 'settlement status becomes REVERSED');
select is((select reversed_by_user_id from public.financial_transaction_matches where id = (select settlement_match from wave2b3_ids)), (select admin_user from wave2b3_ids), 'settlement reversal actor is stored');
select isnt_empty($$select 1 from public.financial_transaction_matches where id = (select settlement_match from wave2b3_ids) and reversed_at is not null and reversal_reason = 'Wrong invoice selected'$$, 'settlement reversal timestamp and reason are stored');
select is((select reconciliation_status from public.financial_transactions where id = (select tx_settlement from wave2b3_ids)), 'UNMATCHED', 'settlement reversal recomputes transaction reconciliation');
select is((public.get_financial_settlement_summary((select company_a from wave2b3_ids), 'INVOICE', (select invoice_a from wave2b3_ids))->>'reconciledCashPaid')::numeric, 0::numeric, 'reversed settlement no longer counts toward target totals');
select lives_ok($$select public.reverse_financial_settlement((select company_a from wave2b3_ids), (select settlement_match from wave2b3_ids), 'Retry the same correction')$$, 'settlement double reversal is idempotent');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2b3_ids) and event_type = 'CASH_SETTLEMENT_REVERSED' and target_id = (select tx_settlement from wave2b3_ids)), 1::bigint, 'settlement reversal produces one append-only audit event');

select lives_ok($$select public.correct_financial_transaction((select company_a from wave2b3_ids), (select tx_manual from wave2b3_ids), date '2026-08-31', 'MAN-1-CORRECTED', 'Corrected manual cash entry', 'CREDIT', 125, 'Direction and amount were entered incorrectly')$$, 'eligible manual transaction correction is allowed');
select is((select amount from public.financial_transactions where id = (select tx_manual from wave2b3_ids)), 125::numeric, 'manual correction changes the requested amount');
select is((select direction from public.financial_transactions where id = (select tx_manual from wave2b3_ids)), 'CREDIT', 'manual correction changes the requested direction');
select is((select source_fingerprint from public.financial_transactions where id = (select tx_manual from wave2b3_ids)), 'wave2b3-manual-1', 'manual correction preserves source fingerprint');
select isnt_empty($$select 1 from public.company_audit_events where company_id = (select company_a from wave2b3_ids) and event_type = 'CASH_TRANSACTION_CORRECTED' and target_id = (select tx_manual from wave2b3_ids) and metadata->>'reason' = 'Direction and amount were entered incorrectly' and metadata ? 'original_values'$$, 'manual correction audit retains reason and original values');
select throws_ok($$select public.correct_financial_transaction((select company_a from wave2b3_ids), (select tx_settlement from wave2b3_ids), date '2026-09-01', 'SET-1-X', 'Should be blocked', 'DEBIT', 90, 'Attempt to rewrite settled row')$$, '42501', null, 'transaction with settlement history cannot be silently edited');
select lives_ok($$select public.reverse_financial_transaction((select company_a from wave2b3_ids), (select tx_settlement from wave2b3_ids), 'Remove the now-cleared settlement transaction')$$, 'used transaction can be reversed after settlement evidence is reversed');
select is((select status from public.financial_transactions where id = (select tx_settlement from wave2b3_ids)), 'REVERSED', 'transaction reversal preserves row with REVERSED status');
select isnt_empty($$select 1 from public.financial_transactions where id = (select tx_settlement from wave2b3_ids) and reversed_by_user_id = (select admin_user from wave2b3_ids) and reversed_at is not null and reversal_reason = 'Remove the now-cleared settlement transaction'$$, 'transaction reversal actor, timestamp, and reason are stored');
select throws_ok($$select public.confirm_financial_settlement((select company_a from wave2b3_ids), (select tx_settlement from wave2b3_ids), 'INVOICE', (select invoice_b from wave2b3_ids), 1, gen_random_uuid(), null, 'Reversed transaction attempt', 'RECONCILIATION_UI')$$, null, null, 'reversed transaction cannot receive new settlement evidence');

select lives_ok($$select public.confirm_financial_settlement((select company_a from wave2b3_ids), (select tx_history from wave2b3_ids), 'INVOICE', (select invoice_b from wave2b3_ids), 100, (select settlement_history_match from wave2b3_ids), null, 'History fixture settlement', 'RECONCILIATION_UI')$$, 'history transaction receives confirmed settlement evidence');
select throws_ok($$select public.correct_financial_transaction((select company_a from wave2b3_ids), (select tx_history from wave2b3_ids), date '2026-09-01', 'HIST-X', 'Should remain preserved', 'DEBIT', 90, 'Attempt to rewrite settled history')$$, '42501', null, 'confirmed settlement transaction cannot be silently edited');
select throws_ok($$select public.reverse_financial_transaction((select company_a from wave2b3_ids), (select tx_history from wave2b3_ids), 'Reverse before settlement history')$$, '42501', null, 'transaction reversal requires settlement evidence to be reversed first');
select lives_ok($$select public.reverse_financial_settlement((select company_a from wave2b3_ids), (select settlement_history_match from wave2b3_ids), 'History settlement was matched incorrectly')$$, 'history settlement can be reversed before its source transaction');
select lives_ok($$select public.reverse_financial_transaction((select company_a from wave2b3_ids), (select tx_history from wave2b3_ids), 'Remove the now-cleared history transaction')$$, 'history transaction can then be reversed with provenance');

select lives_ok($$select public.ignore_financial_transaction((select company_a from wave2b3_ids), (select tx_ignored from wave2b3_ids), 'Non-business bank fee')$$, 'eligible transaction can be intentionally ignored');
select is((select reconciliation_status from public.financial_transactions where id = (select tx_ignored from wave2b3_ids)), 'IGNORED', 'ignore state is persisted');
select lives_ok($$select public.ignore_financial_transaction((select company_a from wave2b3_ids), (select tx_ignored from wave2b3_ids), 'Retry ignore')$$, 'ignore is idempotent');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2b3_ids) and event_type = 'CASH_TRANSACTION_IGNORED' and target_id = (select tx_ignored from wave2b3_ids)), 1::bigint, 'ignore creates one audit event');
select lives_ok($$select public.restore_financial_transaction_to_review((select company_a from wave2b3_ids), (select tx_ignored from wave2b3_ids), 'Ignored by mistake')$$, 'ignored transaction can return to review');
select is((select reconciliation_status from public.financial_transactions where id = (select tx_ignored from wave2b3_ids)), 'UNMATCHED', 'review restoration clears ignored state');
select isnt_empty($$select 1 from public.company_audit_events where company_id = (select company_a from wave2b3_ids) and event_type = 'CASH_TRANSACTION_REVIEW_RESTORED' and target_id = (select tx_ignored from wave2b3_ids)$$, 'review restoration creates an audit event');

select lives_ok($$select public.confirm_financial_transfer((select company_a from wave2b3_ids), (select tx_transfer_out from wave2b3_ids), (select tx_transfer_in from wave2b3_ids), 75, '60000000-0000-4000-8000-000000000201'::uuid)$$, 'exact opposite transfer pair confirms');
select is((select count(*) from public.financial_transaction_matches where company_id = (select company_a from wave2b3_ids) and transfer_group_id = '60000000-0000-4000-8000-000000000201'::uuid and status = 'CONFIRMED'), 2::bigint, 'transfer creates two exact relationship rows');
select is((select count(*) from public.financial_transaction_matches where company_id = (select company_a from wave2b3_ids) and transfer_group_id = '60000000-0000-4000-8000-000000000201'::uuid and status = 'CONFIRMED' and target_type = 'TRANSFER'), 2::bigint, 'transfer matches carry their group');
select lives_ok($$select public.confirm_financial_transfer((select company_a from wave2b3_ids), (select tx_transfer_out from wave2b3_ids), (select tx_transfer_in from wave2b3_ids), 75, '60000000-0000-4000-8000-000000000201'::uuid)$$, 'same transfer confirmation is idempotent');
select throws_ok($$select public.confirm_financial_transfer((select company_a from wave2b3_ids), (select tx_transfer_out from wave2b3_ids), (select tx_transfer_in from wave2b3_ids), 74, gen_random_uuid())$$, '22023', null, 'transfer amount cannot be partial or changed');
select throws_ok($$select public.reverse_financial_transfer((select company_a from wave2b3_ids), '60000000-0000-4000-8000-000000000201'::uuid, (select tx_transfer_out from wave2b3_ids), (select tx_manual from wave2b3_ids), 'Wrong pair')$$, '22023', null, 'transfer reversal rejects an invalid exact pair');
select throws_ok($$select public.reverse_financial_transfer((select company_b from wave2b3_ids), '60000000-0000-4000-8000-000000000201'::uuid, (select tx_transfer_out from wave2b3_ids), (select tx_transfer_in from wave2b3_ids), 'Wrong company')$$, '42501', null, 'transfer reversal rejects wrong deployment company');
select throws_ok($$select public.reverse_financial_transfer((select company_a from wave2b3_ids), '60000000-0000-4000-8000-000000000201'::uuid, (select tx_transfer_out from wave2b3_ids), (select tx_transfer_in from wave2b3_ids), null)$$, '22023', null, 'transfer reversal requires a reason');
select lives_ok($$select public.reverse_financial_transfer((select company_a from wave2b3_ids), '60000000-0000-4000-8000-000000000201'::uuid, (select tx_transfer_out from wave2b3_ids), (select tx_transfer_in from wave2b3_ids), 'Transfer was confirmed in error')$$, 'confirmed transfer reverses with a reason');
select is((select count(*) from public.financial_transaction_matches where company_id = (select company_a from wave2b3_ids) and transfer_group_id = '60000000-0000-4000-8000-000000000201'::uuid and status = 'REVERSED'), 2::bigint, 'both transfer relationship rows are reversed');
select is((select count(*) from public.financial_transactions where id in ((select tx_transfer_out from wave2b3_ids), (select tx_transfer_in from wave2b3_ids)) and transfer_group_id is null and reconciliation_status = 'UNMATCHED'), 2::bigint, 'both transfer rows are restored to review without deletion');
select lives_ok($$select public.reverse_financial_transfer((select company_a from wave2b3_ids), '60000000-0000-4000-8000-000000000201'::uuid, (select tx_transfer_out from wave2b3_ids), (select tx_transfer_in from wave2b3_ids), 'Retry transfer correction')$$, 'transfer reversal retry is idempotent');

select lives_ok($$select public.save_financial_account((select company_a from wave2b3_ids), (select account_a from wave2b3_ids), 'BANK', 'FIXTURE', 'Renamed Fixture Bank', 'Renamed Operating Account', '•••• 1201', 'PHP', 1000, date '2026-01-01', 'MANUAL', null, null)$$, 'descriptive account correction remains allowed after history');
select throws_ok($$select public.save_financial_account((select company_a from wave2b3_ids), (select account_a from wave2b3_ids), 'BANK', 'FIXTURE', 'Renamed Fixture Bank', 'Renamed Operating Account', '•••• 1201', 'USD', 1000, date '2026-01-01', 'MANUAL', null, null)$$, '42501', null, 'account currency cannot change after transaction history');
select throws_ok($$select public.save_financial_account((select company_a from wave2b3_ids), (select account_a from wave2b3_ids), 'BANK', 'FIXTURE', 'Renamed Fixture Bank', 'Renamed Operating Account', '•••• 1201', 'PHP', 9000, date '2026-01-01', 'MANUAL', null, null)$$, '42501', null, 'account opening balance cannot change after transaction history');
select lives_ok($$select public.deactivate_financial_account((select account_inactive from wave2b3_ids), 'Account temporarily retired')$$, 'account can be deactivated explicitly');
select throws_ok($$select public.create_financial_transaction((select company_a from wave2b3_ids), gen_random_uuid(), (select account_inactive from wave2b3_ids), current_date, now(), 'INACT-2', 'Should be blocked', 'DEBIT', 5, 'PHP', 'wave2b3-inactive-blocked')$$, '42501', null, 'inactive account rejects new manual activity');
select throws_ok($$select public.commit_financial_import((select company_a from wave2b3_ids), (select account_inactive from wave2b3_ids), 'CSV', 'inactive.csv', 'wave2b3-inactive-file', current_date, current_date, null, null, 1, 0, 0, '[{"transaction_date":"2026-08-30","direction":"DEBIT","amount":5,"source_fingerprint":"wave2b3-inactive-import","currency":"PHP","description":"Blocked"}]'::jsonb)$$, '42501', null, 'inactive account rejects new statement activity');
select lives_ok($$select public.reactivate_financial_account((select account_inactive from wave2b3_ids), 'Account returned to service')$$, 'account can be explicitly reactivated');
select lives_ok($$select public.create_financial_transaction((select company_a from wave2b3_ids), gen_random_uuid(), (select account_inactive from wave2b3_ids), current_date, now(), 'INACT-3', 'Allowed after reactivation', 'DEBIT', 5, 'PHP', 'wave2b3-reactivated')$$, 'reactivated account accepts new manual activity');

select set_config('request.jwt.claim.sub', (select finance_user::text from wave2b3_ids), true);
select throws_ok($$select public.reverse_financial_transaction((select company_a from wave2b3_ids), (select tx_manual from wave2b3_ids), 'Finance user lacks transaction manage')$$, '42501', null, 'finance member without transaction manage cannot reverse transaction');
select set_config('request.jwt.claim.sub', (select denied_user::text from wave2b3_ids), true);
select throws_ok($$select public.ignore_financial_transaction((select company_a from wave2b3_ids), (select tx_ignored from wave2b3_ids), 'Denied reviewer')$$, '42501', null, 'custom DENY blocks reconciliation ignore');
select set_config('request.jwt.claim.sub', (select outsider_user::text from wave2b3_ids), true);
select throws_ok($$select public.save_financial_account((select company_a from wave2b3_ids), gen_random_uuid(), 'BANK', 'OUT', 'Outside', 'Outside', '•••• 9999', 'PHP', 0, current_date, 'MANUAL', null, null)$$, '42501', null, 'another company member cannot manage deployment cash accounts');

select * from finish();
rollback;
