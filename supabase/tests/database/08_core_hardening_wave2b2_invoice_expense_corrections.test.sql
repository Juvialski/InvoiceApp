begin;
select no_plan();

select has_function('public', 'preview_invoice_correction', 'invoice correction preflight exists');
select has_function('public', 'apply_invoice_correction', 'invoice correction RPC exists');
select has_function('public', 'preview_expense_correction', 'expense correction preflight exists');
select has_function('public', 'apply_expense_correction', 'expense correction RPC exists');
select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('invoices', 'expenses')
      and grantee = 'authenticated' and privilege_type = 'DELETE'$$,
  'authenticated cannot bypass invoice or expense correction with direct DELETE'
);
select isnt_empty(
  $$select 1 from pg_proc where oid = 'public.preview_invoice_correction(uuid)'::regprocedure
    and prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'$$,
  'invoice correction preflight is SECURITY DEFINER with an empty search_path'
);
select isnt_empty(
  $$select 1 from pg_proc where oid = 'public.apply_invoice_correction(uuid,text,text)'::regprocedure
    and prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'$$,
  'invoice correction RPC is SECURITY DEFINER with an empty search_path'
);
select isnt_empty(
  $$select 1 from pg_proc where oid = 'public.preview_expense_correction(uuid)'::regprocedure
    and prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'$$,
  'expense correction preflight is SECURITY DEFINER with an empty search_path'
);
select isnt_empty(
  $$select 1 from pg_proc where oid = 'public.apply_expense_correction(uuid,text,text)'::regprocedure
    and prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'$$,
  'expense correction RPC is SECURITY DEFINER with an empty search_path'
);
select is_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('preview_invoice_correction', 'apply_invoice_correction', 'preview_expense_correction', 'apply_expense_correction')
      and lower(grantee) in ('anon', 'public') and privilege_type = 'EXECUTE'$$,
  'anonymous and public roles cannot execute financial correction RPCs'
);

create temp table wave2b2_ids as
select
  '00000000-0000-4000-8000-000000000301'::uuid as admin_user,
  '00000000-0000-4000-8000-000000000302'::uuid as finance_user,
  '00000000-0000-4000-8000-000000000303'::uuid as suspended_user,
  '00000000-0000-4000-8000-000000000304'::uuid as outsider_user,
  '00000000-0000-4000-8000-000000000305'::uuid as nonmember_user,
  '00000000-0000-4000-8000-000000000306'::uuid as denied_user,
  'aaaaaaaa-0000-4000-8000-000000000301'::uuid as company_a,
  'bbbbbbbb-0000-4000-8000-000000000302'::uuid as company_b,
  '10000000-0000-4000-8000-000000000301'::uuid as project_a,
  '20000000-0000-4000-8000-000000000301'::uuid as project_b,
  'b2000000-0000-4000-8000-000000000301'::uuid as invoice_unused,
  'b2000000-0000-4000-8000-000000000302'::uuid as invoice_stale,
  'b2000000-0000-4000-8000-000000000303'::uuid as invoice_verified,
  'b2000000-0000-4000-8000-000000000304'::uuid as invoice_settled,
  'b2000000-0000-4000-8000-000000000305'::uuid as invoice_other_company,
  'c2000000-0000-4000-8000-000000000301'::uuid as expense_unused,
  'c2000000-0000-4000-8000-000000000302'::uuid as expense_approved,
  'c2000000-0000-4000-8000-000000000303'::uuid as expense_settled,
  'c2000000-0000-4000-8000-000000000304'::uuid as expense_other_company,
  'd2000000-0000-4000-8000-000000000301'::uuid as financial_account,
  'e2000000-0000-4000-8000-000000000301'::uuid as invoice_transaction,
  'e2000000-0000-4000-8000-000000000302'::uuid as expense_transaction,
  'e2000000-0000-4000-8000-000000000303'::uuid as post_void_transaction,
  'f2000000-0000-4000-8000-000000000301'::uuid as invoice_match,
  'f2000000-0000-4000-8000-000000000302'::uuid as expense_match;

grant select on wave2b2_ids to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
select id, email, 'x', now(), now()
from (values
  ((select admin_user from wave2b2_ids), 'wave2b2-admin@test.local'),
  ((select finance_user from wave2b2_ids), 'wave2b2-finance@test.local'),
  ((select suspended_user from wave2b2_ids), 'wave2b2-suspended@test.local'),
  ((select outsider_user from wave2b2_ids), 'wave2b2-outsider@test.local'),
  ((select nonmember_user from wave2b2_ids), 'wave2b2-nonmember@test.local'),
  ((select denied_user from wave2b2_ids), 'wave2b2-denied@test.local')
) users(id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_a from wave2b2_ids), 'Wave 2B2 Test Company', 'wave2b2-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from wave2b2_ids), (select admin_user from wave2b2_ids)),
  ((select company_b from wave2b2_ids), 'Wave 2B2 Other Company', 'wave2b2-b', 'ACTIVE', 'USD', 'UTC', (select outsider_user from wave2b2_ids), (select outsider_user from wave2b2_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_a from wave2b2_ids), (select admin_user from wave2b2_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_a from wave2b2_ids), (select finance_user from wave2b2_ids), 'FINANCE', 'ACTIVE'),
  ((select company_a from wave2b2_ids), (select suspended_user from wave2b2_ids), 'FINANCE', 'SUSPENDED'),
  ((select company_a from wave2b2_ids), (select denied_user from wave2b2_ids), 'FINANCE', 'ACTIVE'),
  ((select company_b from wave2b2_ids), (select outsider_user from wave2b2_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from wave2b2_ids));

insert into public.company_member_permission_overrides (company_id, membership_id, permission_key, effect, created_by_user_id)
select cm.company_id, cm.id, permission_key, 'DENY', (select admin_user from wave2b2_ids)
from public.company_members cm
cross join (values ('invoices.manage'), ('expenses.manage')) denied(permission_key)
where cm.company_id = (select company_a from wave2b2_ids)
  and cm.user_id = (select denied_user from wave2b2_ids);

insert into public.projects (id, user_id, company_id, project_code, project_name, status, project_budget, currency)
values
  ((select project_a from wave2b2_ids), (select admin_user from wave2b2_ids), (select company_a from wave2b2_ids), 'W2B2-A', 'Wave 2B2 Project', 'ACTIVE', 100000, 'PHP'),
  ((select project_b from wave2b2_ids), (select outsider_user from wave2b2_ids), (select company_b from wave2b2_ids), 'W2B2-B', 'Wave 2B2 Foreign Project', 'ACTIVE', 100000, 'USD');

insert into public.invoices (id, user_id, company_id, invoice_number, invoice_date, currency, grand_total, payment_status, review_status, current_data)
values
  ((select invoice_unused from wave2b2_ids), (select admin_user from wave2b2_ids), (select company_a from wave2b2_ids), 'W2B2-UNUSED', date '2026-08-01', 'PHP', 100, 'UNPAID', 'NEEDS_REVIEW', '{}'::jsonb),
  ((select invoice_stale from wave2b2_ids), (select admin_user from wave2b2_ids), (select company_a from wave2b2_ids), 'W2B2-STALE', date '2026-08-02', 'PHP', 200, 'UNPAID', 'NEEDS_REVIEW', '{}'::jsonb),
  ((select invoice_verified from wave2b2_ids), (select admin_user from wave2b2_ids), (select company_a from wave2b2_ids), 'W2B2-VERIFIED', date '2026-08-03', 'PHP', 300, 'UNPAID', 'VERIFIED', jsonb_build_object('invoiceNumber', 'W2B2-VERIFIED', 'grandTotal', 300, 'currency', 'PHP')),
  ((select invoice_settled from wave2b2_ids), (select admin_user from wave2b2_ids), (select company_a from wave2b2_ids), 'W2B2-SETTLED', date '2026-08-04', 'PHP', 400, 'UNPAID', 'VERIFIED', jsonb_build_object('invoiceNumber', 'W2B2-SETTLED', 'grandTotal', 400, 'currency', 'PHP')),
  ((select invoice_other_company from wave2b2_ids), (select outsider_user from wave2b2_ids), (select company_b from wave2b2_ids), 'W2B2-FOREIGN', date '2026-08-05', 'USD', 500, 'UNPAID', 'NEEDS_REVIEW', '{}'::jsonb);

insert into public.invoice_extractions (id, user_id, company_id, invoice_id, model, structured_result)
values (gen_random_uuid(), (select admin_user from wave2b2_ids), (select company_a from wave2b2_ids), (select invoice_verified from wave2b2_ids), 'fixture', jsonb_build_object('invoiceNumber', 'W2B2-VERIFIED'));

insert into public.invoice_review_events (id, user_id, company_id, invoice_id, event_type, previous_value, new_value)
values (gen_random_uuid(), (select admin_user from wave2b2_ids), (select company_a from wave2b2_ids), (select invoice_verified from wave2b2_ids), 'VERIFIED', '{}'::jsonb, jsonb_build_object('reviewStatus', 'VERIFIED'));

insert into public.invoice_project_allocations (id, user_id, company_id, invoice_id, project_id, allocation_type, allocation_amount, currency)
values (gen_random_uuid(), (select admin_user from wave2b2_ids), (select company_a from wave2b2_ids), (select invoice_verified from wave2b2_ids), (select project_a from wave2b2_ids), 'AMOUNT', 300, 'PHP');

insert into public.project_accounting_events (id, user_id, company_id, project_id, entity_type, entity_id, event_type, description, metadata)
values (gen_random_uuid(), (select admin_user from wave2b2_ids), (select company_a from wave2b2_ids), (select project_a from wave2b2_ids), 'INVOICE', (select invoice_verified from wave2b2_ids), 'PROJECT_ALLOCATIONS_REPLACED', 'Invoice allocation fixture', '{}'::jsonb);

insert into public.expenses (id, user_id, company_id, project_id, expense_date, category, description, amount, currency, status)
values
  ((select expense_unused from wave2b2_ids), (select admin_user from wave2b2_ids), (select company_a from wave2b2_ids), null, date '2026-08-06', 'Meals', 'Unused draft expense', 25, 'PHP', 'DRAFT'),
  ((select expense_approved from wave2b2_ids), (select admin_user from wave2b2_ids), (select company_a from wave2b2_ids), (select project_a from wave2b2_ids), date '2026-08-07', 'Materials', 'Approved project expense', 50, 'PHP', 'APPROVED'),
  ((select expense_settled from wave2b2_ids), (select admin_user from wave2b2_ids), (select company_a from wave2b2_ids), null, date '2026-08-08', 'Fuel', 'Settled project expense', 75, 'PHP', 'APPROVED'),
  ((select expense_other_company from wave2b2_ids), (select outsider_user from wave2b2_ids), (select company_b from wave2b2_ids), (select project_b from wave2b2_ids), date '2026-08-09', 'Fuel', 'Foreign expense', 80, 'USD', 'DRAFT');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave2b2_ids), true);

insert into public.financial_accounts (id, company_id, account_type, institution_name, display_name, currency, created_by_user_id)
values ((select financial_account from wave2b2_ids), (select company_a from wave2b2_ids), 'BANK', 'Fixture Bank', 'Wave 2B2 account', 'PHP', (select admin_user from wave2b2_ids));

insert into public.financial_transactions (id, company_id, account_id, transaction_date, description, direction, amount, currency, source, source_fingerprint, created_by_user_id)
values
  ((select invoice_transaction from wave2b2_ids), (select company_a from wave2b2_ids), (select financial_account from wave2b2_ids), date '2026-08-10', 'Invoice settlement', 'DEBIT', 400, 'PHP', 'MANUAL', 'wave2b2-invoice', (select admin_user from wave2b2_ids)),
  ((select expense_transaction from wave2b2_ids), (select company_a from wave2b2_ids), (select financial_account from wave2b2_ids), date '2026-08-11', 'Expense settlement', 'DEBIT', 75, 'PHP', 'MANUAL', 'wave2b2-expense', (select admin_user from wave2b2_ids)),
  ((select post_void_transaction from wave2b2_ids), (select company_a from wave2b2_ids), (select financial_account from wave2b2_ids), date '2026-08-12', 'Post-void settlement attempt', 'DEBIT', 300, 'PHP', 'MANUAL', 'wave2b2-post-void', (select admin_user from wave2b2_ids));

select public.confirm_financial_settlement(
  (select company_a from wave2b2_ids), (select invoice_transaction from wave2b2_ids), 'INVOICE',
  (select invoice_settled from wave2b2_ids), 400, (select invoice_match from wave2b2_ids), null, 'Fixture confirmation', 'RECONCILIATION_UI'
);
select public.confirm_financial_settlement(
  (select company_a from wave2b2_ids), (select expense_transaction from wave2b2_ids), 'EXPENSE',
  (select expense_settled from wave2b2_ids), 75, (select expense_match from wave2b2_ids), null, 'Fixture confirmation', 'RECONCILIATION_UI'
);

reset role;
set local role anon;
select throws_ok(
  $$select public.preview_invoice_correction('b2000000-0000-4000-8000-000000000301'::uuid)$$,
  '42501', null, 'anonymous invoice correction preview is denied'
);
select throws_ok(
  $$select public.preview_expense_correction('c2000000-0000-4000-8000-000000000301'::uuid)$$,
  '42501', null, 'anonymous expense correction preview is denied'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave2b2_ids), true);

select is((public.preview_invoice_correction((select invoice_unused from wave2b2_ids))->>'canDelete')::boolean, true, 'unused invoice is delete-eligible');
select is((public.preview_invoice_correction((select invoice_unused from wave2b2_ids))->>'recommendedAction'), 'DELETE_UNUSED', 'unused invoice recommends guarded deletion');

-- A stale preview cannot authorize deletion after a dependent row appears.
select is((public.preview_invoice_correction((select invoice_stale from wave2b2_ids))->>'canDelete')::boolean, true, 'stale invoice initially previews as unused');
insert into public.invoice_line_items (user_id, company_id, invoice_id, item_index, description, quantity, unit_price, line_total)
values ((select admin_user from wave2b2_ids), (select company_a from wave2b2_ids), (select invoice_stale from wave2b2_ids), 0, 'Late fixture line item', 1, 200, 200);
select throws_ok(
  $$select public.apply_invoice_correction('b2000000-0000-4000-8000-000000000302'::uuid, 'DELETE_UNUSED', null)$$,
  '42501', null, 'invoice delete rechecks dependencies after a stale preview'
);
select is((select count(*) from public.invoices where id = (select invoice_stale from wave2b2_ids)), 1::bigint, 'stale invoice remains after rejected deletion');
delete from public.invoice_line_items where invoice_id = (select invoice_stale from wave2b2_ids);

select throws_ok(
  $$delete from public.invoices where id = 'b2000000-0000-4000-8000-000000000301'::uuid$$,
  '42501', null, 'direct invoice DELETE is denied even for an unused invoice'
);
select is((public.apply_invoice_correction((select invoice_unused from wave2b2_ids), 'DELETE_UNUSED', 'Duplicate empty intake')->>'deleted')::boolean, true, 'unused invoice can be permanently deleted through the guarded RPC');
select is((select count(*) from public.invoices where id = (select invoice_unused from wave2b2_ids)), 0::bigint, 'unused invoice row is deleted');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2b2_ids) and event_type = 'INVOICE_DELETED_UNUSED' and target_id = (select invoice_unused from wave2b2_ids)), 1::bigint, 'unused invoice deletion emits one audit event');

select is((public.preview_invoice_correction((select invoice_verified from wave2b2_ids))->>'canDelete')::boolean, false, 'verified invoice cannot be hard deleted');
select is((public.preview_invoice_correction((select invoice_verified from wave2b2_ids))->>'recommendedAction'), 'VOID', 'verified invoice recommends explicit void correction');
select is((public.preview_invoice_correction((select invoice_verified from wave2b2_ids))->'dependencies'->>'projectAllocations')::bigint, 1::bigint, 'invoice allocation dependency is reported');
select is((public.preview_invoice_correction((select invoice_verified from wave2b2_ids))->'dependencies'->>'extractions')::bigint, 1::bigint, 'invoice extraction dependency is reported');
select is((public.preview_invoice_correction((select invoice_verified from wave2b2_ids))->'dependencies'->>'reviewEvents')::bigint, 1::bigint, 'invoice review history dependency is reported');
select is((public.apply_invoice_correction((select invoice_verified from wave2b2_ids), 'VOID', 'Duplicate supplier document')->>'changed')::boolean, true, 'verified invoice can be explicitly voided with a reason');
select is((select lifecycle_status from public.invoices where id = (select invoice_verified from wave2b2_ids)), 'VOID', 'invoice void state is persisted');
select is((select void_reason from public.invoices where id = (select invoice_verified from wave2b2_ids)), 'Duplicate supplier document', 'invoice void reason is persisted');
select is((select count(*) from public.invoice_extractions where invoice_id = (select invoice_verified from wave2b2_ids)), 1::bigint, 'invoice extraction snapshot survives void');
select is((select count(*) from public.invoice_project_allocations where invoice_id = (select invoice_verified from wave2b2_ids)), 1::bigint, 'invoice allocation survives void');
select is((select count(*) from public.invoice_review_events where invoice_id = (select invoice_verified from wave2b2_ids) and event_type in ('VERIFIED', 'INVOICE_VOIDED')), 2::bigint, 'invoice review history survives and records the void event');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2b2_ids) and event_type = 'INVOICE_VOIDED' and target_id = (select invoice_verified from wave2b2_ids)), 1::bigint, 'invoice void emits one audit event');
select lives_ok(
  $$select public.apply_invoice_correction('b2000000-0000-4000-8000-000000000303'::uuid, 'VOID', null)$$,
  'repeated invoice void is idempotent without a second reason'
);
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2b2_ids) and event_type = 'INVOICE_VOIDED' and target_id = (select invoice_verified from wave2b2_ids)), 1::bigint, 'repeated invoice void emits no duplicate audit');
select throws_ok(
  $$delete from public.invoice_project_allocations where invoice_id = 'b2000000-0000-4000-8000-000000000303'::uuid$$,
  '42501', null, 'voided invoice allocations cannot be deleted through the allocation table'
);

select is((public.preview_invoice_correction((select invoice_settled from wave2b2_ids))->>'confirmedSettlementCount')::bigint, 1::bigint, 'confirmed invoice settlement is reported');
select like(public.preview_invoice_correction((select invoice_settled from wave2b2_ids))->>'blockedReason', '%Wave 2B3%', 'confirmed invoice settlement explains the deferred correction dependency');
select is((public.preview_invoice_correction((select invoice_settled from wave2b2_ids))->>'canVoid')::boolean, false, 'confirmed invoice settlement blocks void');
select throws_ok(
  $$select public.apply_invoice_correction('b2000000-0000-4000-8000-000000000304'::uuid, 'VOID', 'Wrong total')$$,
  '42501', null, 'confirmed invoice settlement blocks void mutation'
);
select throws_ok(
  $$select public.apply_invoice_correction('b2000000-0000-4000-8000-000000000304'::uuid, 'DELETE_UNUSED', null)$$,
  '42501', null, 'confirmed invoice settlement blocks invoice deletion'
);
select throws_ok(
  $$select public.confirm_financial_settlement((select company_a from wave2b2_ids), (select post_void_transaction from wave2b2_ids), 'INVOICE', (select invoice_verified from wave2b2_ids), 300, gen_random_uuid(), null, 'post void attempt', 'RECONCILIATION_UI')$$,
  '42501', null, 'voided invoice cannot receive new confirmed settlement evidence'
);

select throws_ok(
  $$update public.invoices set lifecycle_status = 'VOID' where id = 'b2000000-0000-4000-8000-000000000302'::uuid$$,
  '42501', null, 'direct invoice lifecycle update is denied'
);

select is((public.preview_expense_correction((select expense_unused from wave2b2_ids))->>'canDelete')::boolean, true, 'unused draft expense is delete-eligible');
select is((public.preview_expense_correction((select expense_unused from wave2b2_ids))->>'recommendedAction'), 'DELETE_UNUSED', 'unused draft expense recommends guarded deletion');
select throws_ok(
  $$delete from public.expenses where id = 'c2000000-0000-4000-8000-000000000301'::uuid$$,
  '42501', null, 'direct expense DELETE is denied even for an unused draft'
);
select is((public.apply_expense_correction((select expense_unused from wave2b2_ids), 'DELETE_UNUSED', null)->>'deleted')::boolean, true, 'unused draft expense can be permanently deleted through the guarded RPC');
select is((select count(*) from public.expenses where id = (select expense_unused from wave2b2_ids)), 0::bigint, 'unused draft expense row is deleted');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2b2_ids) and event_type = 'EXPENSE_DELETED_UNUSED' and target_id = (select expense_unused from wave2b2_ids)), 1::bigint, 'unused expense deletion emits one audit event');

select is((public.preview_expense_correction((select expense_approved from wave2b2_ids))->>'canDelete')::boolean, false, 'approved expense cannot be hard deleted');
select is((public.preview_expense_correction((select expense_approved from wave2b2_ids))->>'recommendedAction'), 'VOID', 'approved expense recommends explicit void correction');
select throws_ok(
  $$update public.expenses set status = 'DRAFT' where id = 'c2000000-0000-4000-8000-000000000302'::uuid$$,
  '42501', null, 'approved expense cannot be downgraded to bypass correction history'
);
select is((public.apply_expense_correction((select expense_approved from wave2b2_ids), 'ARCHIVE', 'Hide closed receipt')->>'changed')::boolean, true, 'approved expense can be archived for visibility');
select is((select status from public.expenses where id = (select expense_approved from wave2b2_ids)), 'APPROVED', 'archive does not change approved expense financial status');
select isnt_empty($$select 1 from public.expenses where id = 'c2000000-0000-4000-8000-000000000302'::uuid and archived_at is not null$$, 'expense archive timestamp is persisted');
select lives_ok($$select public.apply_expense_correction('c2000000-0000-4000-8000-000000000302'::uuid, 'ARCHIVE', null)$$, 'repeated expense archive is idempotent without a second reason');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2b2_ids) and event_type = 'EXPENSE_ARCHIVED' and target_id = (select expense_approved from wave2b2_ids)), 1::bigint, 'repeated expense archive emits no duplicate audit');
select is((public.apply_expense_correction((select expense_approved from wave2b2_ids), 'RESTORE', 'Review closed receipt')->>'changed')::boolean, true, 'archived expense visibility can be restored');
select is((select status from public.expenses where id = (select expense_approved from wave2b2_ids)), 'APPROVED', 'restore preserves approved expense financial status');
select is((public.apply_expense_correction((select expense_approved from wave2b2_ids), 'VOID', 'Receipt was entered twice')->>'changed')::boolean, true, 'approved expense can be explicitly voided with a reason');
select is((select status from public.expenses where id = (select expense_approved from wave2b2_ids)), 'VOID', 'expense void status is persisted');
select is((select void_reason from public.expenses where id = (select expense_approved from wave2b2_ids)), 'Receipt was entered twice', 'expense void reason is persisted');
select is((select project_id from public.expenses where id = (select expense_approved from wave2b2_ids)), (select project_a from wave2b2_ids), 'expense project history survives void');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2b2_ids) and event_type = 'EXPENSE_VOIDED' and target_id = (select expense_approved from wave2b2_ids)), 1::bigint, 'expense void emits one audit event');
select lives_ok($$select public.apply_expense_correction('c2000000-0000-4000-8000-000000000302'::uuid, 'VOID', null)$$, 'repeated expense void is idempotent without a second reason');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2b2_ids) and event_type = 'EXPENSE_VOIDED' and target_id = (select expense_approved from wave2b2_ids)), 1::bigint, 'repeated expense void emits no duplicate audit');
select throws_ok(
  $$update public.expenses set status = 'DRAFT' where id = 'c2000000-0000-4000-8000-000000000302'::uuid$$,
  '42501', null, 'direct update cannot rewrite a voided expense'
);

select is((public.preview_expense_correction((select expense_settled from wave2b2_ids))->>'confirmedSettlementCount')::bigint, 1::bigint, 'confirmed expense settlement is reported');
select like(public.preview_expense_correction((select expense_settled from wave2b2_ids))->>'blockedReason', '%Wave 2B3%', 'confirmed expense settlement explains the deferred correction dependency');
select is((public.preview_expense_correction((select expense_settled from wave2b2_ids))->>'canVoid')::boolean, false, 'confirmed expense settlement blocks void');
select throws_ok(
  $$select public.apply_expense_correction('c2000000-0000-4000-8000-000000000303'::uuid, 'VOID', 'Wrong receipt')$$,
  '42501', null, 'confirmed expense settlement blocks void mutation'
);

select set_config('request.jwt.claim.sub', (select denied_user::text from wave2b2_ids), true);
select throws_ok(
  $$select public.preview_invoice_correction('b2000000-0000-4000-8000-000000000302'::uuid)$$,
  '42501', null, 'effective permission deny blocks invoice correction preview'
);
select throws_ok(
  $$select public.preview_expense_correction('c2000000-0000-4000-8000-000000000302'::uuid)$$,
  '42501', null, 'effective permission deny blocks expense correction preview'
);

select set_config('request.jwt.claim.sub', (select suspended_user::text from wave2b2_ids), true);
select throws_ok(
  $$select public.preview_invoice_correction('b2000000-0000-4000-8000-000000000302'::uuid)$$,
  '42501', null, 'suspended member cannot preview invoice correction'
);

select set_config('request.jwt.claim.sub', (select nonmember_user::text from wave2b2_ids), true);
select throws_ok(
  $$select public.preview_expense_correction('c2000000-0000-4000-8000-000000000302'::uuid)$$,
  '42501', null, 'non-member cannot preview expense correction'
);

select set_config('request.jwt.claim.sub', (select outsider_user::text from wave2b2_ids), true);
select throws_ok(
  $$select public.preview_invoice_correction('b2000000-0000-4000-8000-000000000302'::uuid)$$,
  '42501', null, 'member of another company cannot preview deployment invoice correction'
);

select set_config('request.jwt.claim.sub', (select admin_user::text from wave2b2_ids), true);
select throws_ok(
  $$select public.preview_invoice_correction('b2000000-0000-4000-8000-000000000305'::uuid)$$,
  '42501', null, 'cross-company invoice target is denied even to a deployment administrator'
);
select throws_ok(
  $$select public.preview_expense_correction('c2000000-0000-4000-8000-000000000304'::uuid)$$,
  '42501', null, 'cross-company expense target is denied even to a deployment administrator'
);

select * from finish();
rollback;
