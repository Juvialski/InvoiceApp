begin;
select no_plan();

-- P2B-6 exercises the real guarded RPCs against the local Postgres schema.
-- Settlement evidence is deliberately created through the same functions the
-- browser uses; no confirmed match or finalized collection is inserted by
-- hand.
create temp table p2b6_ids as
select
  '00000000-0000-4000-8000-000000000501'::uuid as admin_user,
  '00000000-0000-4000-8000-000000000502'::uuid as viewer_user,
  '00000000-0000-4000-8000-000000000503'::uuid as finance_user,
  '00000000-0000-4000-8000-000000000504'::uuid as outsider_user,
  'aaaaaaaa-0000-4000-8000-000000000501'::uuid as company_a,
  'bbbbbbbb-0000-4000-8000-000000000504'::uuid as company_b,
  '10000000-0000-4000-8000-000000000501'::uuid as project_a,
  '20000000-0000-4000-8000-000000000504'::uuid as project_b,
  '30000000-0000-4000-8000-000000000501'::uuid as account_php,
  '30000000-0000-4000-8000-000000000502'::uuid as account_usd,
  '40000000-0000-4000-8000-000000000501'::uuid as tx_credit_one,
  '40000000-0000-4000-8000-000000000502'::uuid as tx_credit_two,
  '40000000-0000-4000-8000-000000000503'::uuid as tx_credit_three,
  '40000000-0000-4000-8000-000000000504'::uuid as tx_debit,
  '40000000-0000-4000-8000-000000000505'::uuid as tx_usd,
  '50000000-0000-4000-8000-000000000501'::uuid as billing_one,
  '50000000-0000-4000-8000-000000000502'::uuid as billing_two,
  '60000000-0000-4000-8000-000000000501'::uuid as collection_one,
  '60000000-0000-4000-8000-000000000502'::uuid as collection_two,
  '60000000-0000-4000-8000-000000000503'::uuid as collection_draft,
  '70000000-0000-4000-8000-000000000501'::uuid as match_one,
  '70000000-0000-4000-8000-000000000502'::uuid as match_one_two,
  '70000000-0000-4000-8000-000000000503'::uuid as match_two_one;
grant select on p2b6_ids to authenticated, service_role;

create temp table p2b6_created_collections (slot text primary key, collection_id uuid not null);
grant insert, select on p2b6_created_collections to authenticated;

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
select id, email, 'x', now(), now()
from (values
  ((select admin_user from p2b6_ids), 'p2b6-admin@test.local'),
  ((select viewer_user from p2b6_ids), 'p2b6-viewer@test.local'),
  ((select finance_user from p2b6_ids), 'p2b6-finance@test.local'),
  ((select outsider_user from p2b6_ids), 'p2b6-outsider@test.local')
) users(id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_a from p2b6_ids), 'P2B-6 Company A', 'p2b6-company-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from p2b6_ids), (select admin_user from p2b6_ids)),
  ((select company_b from p2b6_ids), 'P2B-6 Company B', 'p2b6-company-b', 'ACTIVE', 'USD', 'UTC', (select outsider_user from p2b6_ids), (select outsider_user from p2b6_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_a from p2b6_ids), (select admin_user from p2b6_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_a from p2b6_ids), (select viewer_user from p2b6_ids), 'VIEWER', 'ACTIVE'),
  ((select company_a from p2b6_ids), (select finance_user from p2b6_ids), 'FINANCE', 'ACTIVE'),
  ((select company_b from p2b6_ids), (select outsider_user from p2b6_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.company_member_permission_overrides (company_id, membership_id, permission_key, effect, created_by_user_id)
select (select company_a from p2b6_ids), cm.id, 'projects.manage', 'DENY', (select admin_user from p2b6_ids)
from public.company_members cm
where cm.company_id = (select company_a from p2b6_ids)
  and cm.user_id = (select finance_user from p2b6_ids);

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from p2b6_ids))
on conflict (singleton) do update set company_id = excluded.company_id;

insert into public.projects (id, user_id, company_id, project_code, project_name, client_name, client_reference, status, contract_value, project_budget, currency)
values
  ((select project_a from p2b6_ids), (select admin_user from p2b6_ids), (select company_a from p2b6_ids), 'P2B6-A', 'P2B-6 Project A', 'Client A', 'CLIENT-A', 'ACTIVE', 10000, 7000, 'PHP'),
  ((select project_b from p2b6_ids), (select outsider_user from p2b6_ids), (select company_b from p2b6_ids), 'P2B6-B', 'P2B-6 Project B', 'Client B', 'CLIENT-B', 'ACTIVE', 10000, 7000, 'USD');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from p2b6_ids), true);

select lives_ok($$select public.save_financial_account((select company_a from p2b6_ids), (select account_php from p2b6_ids), 'BANK', 'P2B6', 'P2B6 Bank', 'PHP Operating', '•••• 6501', 'PHP', 0, date '2026-01-01', 'MANUAL', null, null)$$, 'PHP cash account is created through the guarded RPC');
select lives_ok($$select public.save_financial_account((select company_a from p2b6_ids), (select account_usd from p2b6_ids), 'BANK', 'P2B6', 'P2B6 Bank', 'USD Operating', '•••• 6502', 'USD', 0, date '2026-01-01', 'MANUAL', null, null)$$, 'USD cash account is created through the guarded RPC');
select lives_ok($$select public.create_financial_transaction((select company_a from p2b6_ids), (select tx_credit_one from p2b6_ids), (select account_php from p2b6_ids), date '2026-09-04', now(), 'CR-1', 'Client receipt one', 'CREDIT', 1000, 'PHP', 'p2b6-credit-one')$$, 'first POSTED CREDIT transaction is created');
select lives_ok($$select public.create_financial_transaction((select company_a from p2b6_ids), (select tx_credit_two from p2b6_ids), (select account_php from p2b6_ids), date '2026-09-04', now(), 'CR-2', 'Client receipt two', 'CREDIT', 300, 'PHP', 'p2b6-credit-two')$$, 'second POSTED CREDIT transaction is created');
select lives_ok($$select public.create_financial_transaction((select company_a from p2b6_ids), (select tx_credit_three from p2b6_ids), (select account_php from p2b6_ids), date '2026-09-04', now(), 'CR-3', 'Client receipt three', 'CREDIT', 50, 'PHP', 'p2b6-credit-three')$$, 'third POSTED CREDIT transaction is created');
select lives_ok($$select public.create_financial_transaction((select company_a from p2b6_ids), (select tx_debit from p2b6_ids), (select account_php from p2b6_ids), date '2026-09-04', now(), 'DR-1', 'Payable-side debit', 'DEBIT', 100, 'PHP', 'p2b6-debit')$$, 'payable-side DEBIT transaction is created');
select lives_ok($$select public.create_financial_transaction((select company_a from p2b6_ids), (select tx_usd from p2b6_ids), (select account_usd from p2b6_ids), date '2026-09-04', now(), 'USD-1', 'USD client receipt', 'CREDIT', 100, 'USD', 'p2b6-usd')$$, 'USD CREDIT transaction is created');
select is((select count(*) from pg_trigger where tgrelid = 'public.financial_transaction_matches'::regclass and not tgisinternal and tgname in ('financial_transaction_matches_integrity', 'financial_transaction_matches_scope_guard')), 1::bigint, 'settlement match integrity trigger is installed exactly once');

insert into public.client_billings (id, company_id, project_id, billing_number, billing_date, currency, status, client_name_snapshot, client_reference_snapshot)
values
  ((select billing_one from p2b6_ids), (select company_a from p2b6_ids), (select project_a from p2b6_ids), 'PB-P2B6-001', '2026-09-04', 'PHP', 'DRAFT', 'Client A', 'CLIENT-A'),
  ((select billing_two from p2b6_ids), (select company_a from p2b6_ids), (select project_a from p2b6_ids), 'PB-P2B6-002', '2026-09-04', 'PHP', 'DRAFT', 'Client A', 'CLIENT-A');
insert into public.client_billing_lines (company_id, billing_id, line_number, description, amount)
values
  ((select company_a from p2b6_ids), (select billing_one from p2b6_ids), 1, 'P2B-6 Phase One', 2000),
  ((select company_a from p2b6_ids), (select billing_two from p2b6_ids), 1, 'P2B-6 Phase Two', 1500);
select public.transition_client_billing((select billing_one from p2b6_ids), 'SUBMITTED', null);
select public.transition_client_billing((select billing_one from p2b6_ids), 'ISSUED', null);
select public.transition_client_billing((select billing_two from p2b6_ids), 'SUBMITTED', null);
select public.transition_client_billing((select billing_two from p2b6_ids), 'ISSUED', null);

with saved as (
  select public.create_or_update_client_collection(
    jsonb_build_object('companyId', (select company_a from p2b6_ids), 'projectId', (select project_a from p2b6_ids), 'collectionNumber', 'CR-P2B6-001', 'collectionDate', '2026-09-04', 'currency', 'PHP', 'payerSnapshot', 'Client A'),
    jsonb_build_array(jsonb_build_object('billingId', (select billing_one from p2b6_ids), 'amount', 1000, 'notes', 'First recorded collection'))
  ) as response
)
insert into p2b6_created_collections(slot, collection_id)
select 'one', (response -> 'collection' ->> 'id')::uuid from saved;

with saved as (
  select public.create_or_update_client_collection(
    jsonb_build_object('companyId', (select company_a from p2b6_ids), 'projectId', (select project_a from p2b6_ids), 'collectionNumber', 'CR-P2B6-002', 'collectionDate', '2026-09-04', 'currency', 'PHP', 'payerSnapshot', 'Client A'),
    jsonb_build_array(jsonb_build_object('billingId', (select billing_two from p2b6_ids), 'amount', 600, 'notes', 'Second recorded collection'))
  ) as response
)
insert into p2b6_created_collections(slot, collection_id)
select 'two', (response -> 'collection' ->> 'id')::uuid from saved;

with saved as (
  select public.create_or_update_client_collection(
    jsonb_build_object('companyId', (select company_a from p2b6_ids), 'projectId', (select project_a from p2b6_ids), 'collectionNumber', 'CR-P2B6-DRAFT', 'collectionDate', '2026-09-04', 'currency', 'PHP', 'payerSnapshot', 'Client A'),
    jsonb_build_array(jsonb_build_object('billingId', (select billing_two from p2b6_ids), 'amount', 100, 'notes', 'Draft only'))
  ) as response
)
insert into p2b6_created_collections(slot, collection_id)
select 'draft', (response -> 'collection' ->> 'id')::uuid from saved;

select lives_ok($$select public.record_client_collection((select collection_id from p2b6_created_collections where slot = 'one'))$$, 'RECORDED collection can be finalized');
select lives_ok($$select public.record_client_collection((select collection_id from p2b6_created_collections where slot = 'two'))$$, 'second RECORDED collection can be finalized');

select lives_ok($$select public.confirm_financial_settlement((select company_a from p2b6_ids), (select tx_credit_one from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'one'), 700, (select match_one from p2b6_ids), null, 'Partial incoming client receipt', 'RECONCILIATION_UI')$$, 'recorded collection accepts a valid POSTED CREDIT settlement');
select lives_ok($$select public.confirm_financial_settlement((select company_a from p2b6_ids), (select tx_credit_one from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'one'), 700, (select match_one from p2b6_ids), null, 'Partial incoming client receipt', 'RECONCILIATION_UI')$$, 'repeated confirmation with the same request id is idempotent');
select is((select count(*) from public.company_audit_events where event_type = 'CASH_SETTLEMENT_CONFIRMED' and metadata ->> 'target_id' = (select collection_id::text from p2b6_created_collections where slot = 'one')), 1::bigint, 'repeated confirmation writes one settlement audit event');
select is((public.get_financial_settlement_summary((select company_a from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'one'))->>'settlementState'), 'PARTIALLY_LINKED', 'partial collection linkage has explicit link state');
select is((public.get_financial_settlement_summary((select company_a from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'one'))->>'collectionTotal')::numeric, 1000::numeric, 'collection settlement basis is allocation-derived');
select is((public.get_financial_settlement_summary((select company_a from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'one'))->>'linkedAmount')::numeric, 700::numeric, 'partial linked amount is reported');
select is((public.get_financial_settlement_summary((select company_a from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'one'))->>'remainingUnlinkedAmount')::numeric, 300::numeric, 'partial remaining unlinked amount is reported');
select is((public.get_financial_settlement_summary((select company_a from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'one'))->>'basisSource'), 'CLIENT_COLLECTION_ALLOCATIONS', 'collection summary identifies its canonical basis');

-- One CREDIT can be allocated across collections, and a second CREDIT can
-- complete the first collection.
select lives_ok($$select public.confirm_financial_settlement((select company_a from p2b6_ids), (select tx_credit_one from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'two'), 300, (select match_one_two from p2b6_ids), null, 'Split incoming client receipt', 'RECONCILIATION_UI')$$, 'one CREDIT can allocate across multiple collections');
select lives_ok($$select public.confirm_financial_settlement((select company_a from p2b6_ids), (select tx_credit_two from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'one'), 300, (select match_two_one from p2b6_ids), null, 'Second incoming client receipt', 'RECONCILIATION_UI')$$, 'multiple CREDIT transactions can link one collection');
select is((public.get_financial_settlement_summary((select company_a from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'one'))->>'settlementState'), 'LINKED', 'full collection linkage is reported as LINKED');
select is((select reconciliation_status from public.financial_transactions where id = (select tx_credit_one from p2b6_ids)), 'MATCHED', 'split CREDIT transaction is fully reconciled');
select is((select count(*) from public.financial_transaction_matches where target_type = 'CLIENT_COLLECTION' and status = 'CONFIRMED'), 3::bigint, 'three active collection settlement matches exist');

select throws_ok($$select public.confirm_financial_settlement((select company_a from p2b6_ids), (select tx_credit_one from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'two'), 1, gen_random_uuid(), null, 'Transaction overage', 'RECONCILIATION_UI')$$, null, null, 'transaction ceiling rejects an over-allocation');
select throws_ok($$select public.confirm_financial_settlement((select company_a from p2b6_ids), (select tx_credit_three from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'one'), 1, gen_random_uuid(), null, 'Collection overage', 'RECONCILIATION_UI')$$, null, null, 'collection ceiling rejects an over-link');
select throws_ok($$select public.confirm_financial_settlement((select company_a from p2b6_ids), (select tx_debit from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'two'), 1, gen_random_uuid(), null, 'Wrong direction', 'RECONCILIATION_UI')$$, '22023', null, 'CLIENT_COLLECTION rejects DEBIT settlement evidence');
select throws_ok($$select public.confirm_financial_settlement((select company_a from p2b6_ids), (select tx_usd from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'two'), 1, gen_random_uuid(), null, 'Wrong currency', 'RECONCILIATION_UI')$$, '22023', null, 'collection/transaction currency mismatch is rejected');
select throws_ok($$select public.confirm_financial_settlement((select company_a from p2b6_ids), (select tx_credit_three from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'draft'), 1, gen_random_uuid(), null, 'Draft target', 'RECONCILIATION_UI')$$, '42501', null, 'DRAFT collection cannot settle');
select throws_ok($$select public.confirm_financial_settlement((select company_b from p2b6_ids), (select tx_credit_three from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'two'), 1, gen_random_uuid(), null, 'Cross company', 'RECONCILIATION_UI')$$, '42501', null, 'cross-company collection settlement is rejected');

-- P2B-5 billing protection remains intact while a recorded collection is
-- still active.
select throws_ok($$select public.transition_client_billing((select billing_one from p2b6_ids), 'VOIDED', 'Attempt while collection is active')$$, '23514', null, 'issued billing cannot be voided while a recorded collection references it');

-- Viewer lacks cash.reconcile. Finance has cash.reconcile but lacks the
-- project-management permission required for client collections.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select viewer_user::text from p2b6_ids), true);
select throws_ok($$select public.confirm_financial_settlement((select company_a from p2b6_ids), (select tx_credit_three from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'two'), 1, gen_random_uuid(), null, 'Viewer attempt', 'RECONCILIATION_UI')$$, '42501', null, 'user without cash reconciliation permission is rejected');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select finance_user::text from p2b6_ids), true);
select throws_ok($$select public.confirm_financial_settlement((select company_a from p2b6_ids), (select tx_credit_three from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'two'), 1, gen_random_uuid(), null, 'Finance without project authority', 'RECONCILIATION_UI')$$, '42501', null, 'cash reconciler without project management permission is rejected');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from p2b6_ids), true);

-- Collection reversal is blocked until every active settlement link is
-- reversed. Settlement reversal itself is idempotent and preserves history.
select throws_ok($$select public.reverse_client_collection((select collection_id from p2b6_created_collections where slot = 'one'), 'Attempt while bank link exists')$$, '23514', null, 'active collection settlement blocks collection reversal');
select lives_ok($$select public.reverse_financial_settlement((select company_a from p2b6_ids), (select match_one from p2b6_ids), 'Wrong incoming receipt allocation')$$, 'first collection settlement can be reversed with a reason');
select lives_ok($$select public.reverse_financial_settlement((select company_a from p2b6_ids), (select match_one from p2b6_ids), 'Repeated reversal request')$$, 'repeated settlement reversal is idempotent');
select is((select count(*) from public.company_audit_events where event_type = 'CASH_SETTLEMENT_REVERSED' and metadata ->> 'target_id' = (select collection_id::text from p2b6_created_collections where slot = 'one')), 1::bigint, 'repeated settlement reversal writes one reversal audit event');
select is((select status from public.client_collections where id = (select collection_id from p2b6_created_collections where slot = 'one')), 'RECORDED', 'settlement reversal does not reverse the collection');
select is((public.get_financial_settlement_summary((select company_a from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'one'))->>'settlementState'), 'PARTIALLY_LINKED', 'settlement reversal restores the collection link balance');
select is((public.get_financial_settlement_summary((select company_a from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'one'))->>'remainingUnlinkedAmount')::numeric, 700::numeric, 'settlement reversal restores remaining unlinked amount');

-- Settlement-only reversal leaves commercial billing/collection totals alone.
select is((select sum(l.amount) from public.client_billings b join public.client_billing_lines l on l.company_id = b.company_id and l.billing_id = b.id where b.company_id = (select company_a from p2b6_ids) and b.status = 'ISSUED'), 3500::numeric, 'settlement evidence does not alter Billed to Date basis');
select is((select sum(a.amount) from public.client_collection_allocations a join public.client_collections c on c.company_id = a.company_id and c.id = a.collection_id where a.company_id = (select company_a from p2b6_ids) and c.status = 'RECORDED'), 1600::numeric, 'settlement evidence reversal does not alter Collected to Date basis');

select lives_ok($$select public.reverse_financial_settlement((select company_a from p2b6_ids), (select match_two_one from p2b6_ids), 'Second incoming receipt reversed')$$, 'second collection settlement can be reversed');
select lives_ok($$select public.reverse_client_collection((select collection_id from p2b6_created_collections where slot = 'one'), 'Collection reversal after bank links reversed')$$, 'collection reversal succeeds after active links are reversed');
select is((select status from public.client_collections where id = (select collection_id from p2b6_created_collections where slot = 'one')), 'REVERSED', 'collection reversal is persisted after settlement cleanup');
select throws_ok($$select public.confirm_financial_settlement((select company_a from p2b6_ids), (select tx_credit_three from p2b6_ids), 'CLIENT_COLLECTION', (select collection_id from p2b6_created_collections where slot = 'one'), 1, gen_random_uuid(), null, 'Reversed target', 'RECONCILIATION_UI')$$, '42501', null, 'REVERSED collection cannot receive settlement evidence');
select is((select count(*) from public.company_audit_events where event_type = 'CASH_SETTLEMENT_CONFIRMED'), 3::bigint, 'settlement confirmations are auditable without duplicate idempotent events');
select is((select count(*) from public.company_audit_events where event_type = 'CASH_SETTLEMENT_REVERSED'), 2::bigint, 'settlement reversals are auditable');
select is((select count(*) from public.company_audit_events where event_type = 'CLIENT_COLLECTION_REVERSED' and target_id = (select collection_id from p2b6_created_collections where slot = 'one')), 1::bigint, 'collection reversal has one lifecycle audit event');

reset role;
select * from finish();
rollback;
