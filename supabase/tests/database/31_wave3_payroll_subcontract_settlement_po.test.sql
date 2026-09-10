begin;
select no_plan();

create temp table wave3_ids as
select
  '00000000-0000-4000-8000-000000003101'::uuid as admin_user,
  'aaaaaaaa-0000-4000-8000-000000003101'::uuid as company_id,
  '10000000-0000-4000-8000-000000003101'::uuid as project_id,
  '20000000-0000-4000-8000-000000003101'::uuid as worker_id,
  '21000000-0000-4000-8000-000000003101'::uuid as vendor_id,
  '30000000-0000-4000-8000-000000003101'::uuid as payroll_period_id,
  '31000000-0000-4000-8000-000000003101'::uuid as payroll_run_id,
  '32000000-0000-4000-8000-000000003101'::uuid as payroll_entry_id,
  '40000000-0000-4000-8000-000000003101'::uuid as subcontract_id,
  '41000000-0000-4000-8000-000000003101'::uuid as subcontract_line_id,
  '42000000-0000-4000-8000-000000003101'::uuid as claim_id,
  '43000000-0000-4000-8000-000000003101'::uuid as claim_line_id,
  '50000000-0000-4000-8000-000000003101'::uuid as account_id,
  '51000000-0000-4000-8000-000000003101'::uuid as transaction_id,
  '52000000-0000-4000-8000-000000003101'::uuid as settlement_id,
  '60000000-0000-4000-8000-000000003101'::uuid as purchase_order_id,
  '61000000-0000-4000-8000-000000003101'::uuid as purchase_order_line_id,
  '62000000-0000-4000-8000-000000003101'::uuid as receipt_one_id,
  '63000000-0000-4000-8000-000000003101'::uuid as receipt_two_id;
grant select, update on wave3_ids to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ((select admin_user from wave3_ids), 'wave3-admin@test.local', 'x', now(), now(), now());

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values ((select company_id from wave3_ids), 'Wave 3 Company', 'wave3-company', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from wave3_ids), (select admin_user from wave3_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values ((select company_id from wave3_ids), (select admin_user from wave3_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from wave3_ids))
on conflict (singleton) do update set company_id = excluded.company_id;

insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment)
values ((select project_id from wave3_ids), (select admin_user from wave3_ids), (select company_id from wave3_ids), 'W3-PROJECT', 'Wave 3 Project', 'ACTIVE', 100000, 80000, 'PHP', 'VAT');

insert into public.workers (id, user_id, company_id, employee_code, first_name, last_name, display_name, default_pay_type, default_rate)
values ((select worker_id from wave3_ids), (select admin_user from wave3_ids), (select company_id from wave3_ids), 'W3-001', 'Wave', 'Worker', 'Wave 3 Worker', 'MONTHLY', 1000);

insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency)
values ((select vendor_id from wave3_ids), (select admin_user from wave3_ids), (select company_id from wave3_ids), 'Wave 3 Supplier', 'wave 3 supplier', 'PHP');

insert into public.payroll_periods (id, user_id, company_id, period_start, period_end, status)
values ((select payroll_period_id from wave3_ids), (select admin_user from wave3_ids), (select company_id from wave3_ids), date '2026-09-01', date '2026-09-15', 'OPEN');

insert into public.payroll_runs (id, user_id, company_id, period_id, status, calculated_at, calculated_source_revision, source_fingerprint)
values ((select payroll_run_id from wave3_ids), (select admin_user from wave3_ids), (select company_id from wave3_ids), (select payroll_period_id from wave3_ids), 'CALCULATED', now(), 0, 'wave3-payroll-source');

insert into public.payroll_entries (id, user_id, company_id, payroll_run_id, worker_id, gross_pay, net_pay, project_allocated_cost, calculation_snapshot)
values ((select payroll_entry_id from wave3_ids), (select admin_user from wave3_ids), (select company_id from wave3_ids), (select payroll_run_id from wave3_ids), (select worker_id from wave3_ids), 1000, 900, 1000, '{"source":"wave3"}'::jsonb);

select set_config('request.jwt.claim.sub', (select admin_user::text from wave3_ids), true);
set local role authenticated;

select lives_ok($$update public.payroll_runs set status = 'APPROVED' where id = (select payroll_run_id from wave3_ids)$$, 'approved payroll run remains a separate lifecycle state');
select throws_ok($$update public.payroll_runs set status = 'PAID' where id = (select payroll_run_id from wave3_ids)$$, '42501', null, 'direct APPROVED to PAID transition is blocked without settlement evidence');

create temp table wave3_subcontract_result as
select public.create_or_update_subcontract(
  jsonb_build_object('company_id', (select company_id from wave3_ids), 'subcontract_number', 'W3-SC-001', 'vendor_id', (select vendor_id from wave3_ids), 'project_id', (select project_id from wave3_ids), 'title', 'Wave 3 certified work', 'currency', 'PHP', 'start_date', '2026-09-01'),
  jsonb_build_array(jsonb_build_object('line_number', 1, 'description', 'Certified work', 'amount', 1000, 'quantity', 1, 'unit', 'lot', 'unit_rate', 1000))
) as payload;
update wave3_ids
set subcontract_id = ((select payload from wave3_subcontract_result)->'subcontract'->>'id')::uuid,
    subcontract_line_id = ((select payload from wave3_subcontract_result)->'lines'->0->>'id')::uuid;
select ok((select payload is not null from wave3_subcontract_result), 'canonical subcontract claim source can be created through its guarded RPC');
select lives_ok($$select public.transition_subcontract((select subcontract_id from wave3_ids), 'APPROVED', null)$$, 'subcontract can be approved');
select lives_ok($$select public.transition_subcontract((select subcontract_id from wave3_ids), 'ACTIVE', null)$$, 'approved subcontract can be activated');

create temp table wave3_claim_result as
select public.create_or_update_subcontract_claim(
  jsonb_build_object('company_id', (select company_id from wave3_ids), 'subcontract_id', (select subcontract_id from wave3_ids), 'project_id', (select project_id from wave3_ids), 'claim_number', 'W3-SC-001-CLM-01', 'valuation_date', '2026-09-10', 'retention_rate', 0.10),
  jsonb_build_array(jsonb_build_object('subcontract_line_id', (select subcontract_line_id from wave3_ids), 'claimed_amount', 1000))
) as payload;
update wave3_ids
set claim_id = ((select payload from wave3_claim_result)->'claim'->>'id')::uuid,
    claim_line_id = ((select payload from wave3_claim_result)->'lines'->0->>'id')::uuid;
select ok((select payload is not null from wave3_claim_result), 'subcontract claim draft is created from the canonical claim tables');
select lives_ok($$select public.transition_subcontract_claim((select claim_id from wave3_ids), 'SUBMITTED', null, null)$$, 'subcontract claim can be submitted');
select lives_ok($$select public.transition_subcontract_claim((select claim_id from wave3_ids), 'APPROVED', null, jsonb_build_array(jsonb_build_object('claimLineId', (select claim_line_id from wave3_ids), 'approvedAmount', 1000)))$$, 'subcontract claim certification remains guarded');
select is((select net_certified_amount from public.subcontract_progress_claims where id = (select claim_id from wave3_ids)), 900::numeric, 'net certified payable is derived from approved gross less modeled retention');

select lives_ok($$select public.save_financial_account((select company_id from wave3_ids), (select account_id from wave3_ids), 'BANK', 'W3BANK', 'Wave 3 Bank', 'Wave 3 Operating', '•••• 3101', 'PHP', 0, date '2026-09-10', 'MANUAL')$$, 'existing financial account model creates the settlement account');
select lives_ok($$select public.create_financial_transaction((select company_id from wave3_ids), (select transaction_id from wave3_ids), (select account_id from wave3_ids), date '2026-09-10', now(), 'W3-SC-PAY-01', 'Wave 3 subcontract payment', 'DEBIT', 900, 'PHP', 'wave3-subcontract-payment')$$, 'settlement uses a legitimate POSTED debit transaction');
select lives_ok($$select public.confirm_financial_settlement((select company_id from wave3_ids), (select transaction_id from wave3_ids), 'SUBCONTRACT_CLAIM', (select claim_id from wave3_ids), 900, (select settlement_id from wave3_ids), null, 'Certified subcontract payment', 'RECONCILIATION_UI')$$, 'approved claim accepts settlement evidence through the shared RPC');
select is((public.get_financial_settlement_summary((select company_id from wave3_ids), 'SUBCONTRACT_CLAIM', (select claim_id from wave3_ids))->>'settlementBasis')::numeric, 900::numeric, 'settlement basis is net certified payable');
select is(public.get_financial_settlement_summary((select company_id from wave3_ids), 'SUBCONTRACT_CLAIM', (select claim_id from wave3_ids))->>'settlementState', 'SETTLED', 'full claim settlement is derived from cash evidence');
select lives_ok($$select public.reverse_financial_settlement((select company_id from wave3_ids), (select settlement_id from wave3_ids), 'Corrected subcontract payment allocation')$$, 'claim settlement reversal remains append-only and reason-gated');
select is(public.get_financial_settlement_summary((select company_id from wave3_ids), 'SUBCONTRACT_CLAIM', (select claim_id from wave3_ids))->>'settlementState', 'UNSETTLED', 'reversal restores the claim outstanding state');
select is((select approved_gross_amount from public.subcontract_progress_claims where id = (select claim_id from wave3_ids)), 1000::numeric, 'settlement does not rewrite certified gross Actual Cost truth');

insert into public.purchase_orders (id, company_id, po_number, vendor_id, project_id, currency, status, created_by_user_id, updated_by_user_id)
values ((select purchase_order_id from (select (select '60000000-0000-4000-8000-000000003101'::uuid) as purchase_order_id) ids), (select company_id from wave3_ids), 'W3-PO-001', (select vendor_id from wave3_ids), (select project_id from wave3_ids), 'PHP', 'DRAFT', (select admin_user from wave3_ids), (select admin_user from wave3_ids));

insert into public.purchase_order_lines (id, company_id, purchase_order_id, line_number, description, quantity, unit, unit_price, amount)
values ((select '61000000-0000-4000-8000-000000003101'::uuid), (select company_id from wave3_ids), (select '60000000-0000-4000-8000-000000003101'::uuid), 1, 'PO receipt line', 10, 'pcs', 100, 1000);

select lives_ok($$select public.transition_purchase_order_status((select '60000000-0000-4000-8000-000000003101'::uuid), 'APPROVED', null)$$, 'PO can be approved');
select lives_ok($$select public.transition_purchase_order_status((select '60000000-0000-4000-8000-000000003101'::uuid), 'ISSUED', null)$$, 'PO can be issued');
select lives_ok($$select public.record_purchase_order_receipt(jsonb_build_object('id', (select '62000000-0000-4000-8000-000000003101'::uuid), 'companyId', (select company_id from wave3_ids), 'purchaseOrderId', (select '60000000-0000-4000-8000-000000003101'::uuid), 'receiptNumber', 'W3-PO-REC-001', 'receiptDate', '2026-09-10'), jsonb_build_array(jsonb_build_object('purchaseOrderLineId', (select '61000000-0000-4000-8000-000000003101'::uuid), 'receivedQuantity', 4)))$$, 'partial receipt is preserved as procurement history');
select throws_ok($$select public.transition_purchase_order_status((select '60000000-0000-4000-8000-000000003101'::uuid), 'CLOSED', null)$$, '23514', null, 'PO close is blocked while committed quantity remains outstanding');
select is((select status from public.purchase_orders where id = (select '60000000-0000-4000-8000-000000003101'::uuid)), 'ISSUED', 'blocked PO close leaves the issued lifecycle state unchanged');
select lives_ok($$select public.record_purchase_order_receipt(jsonb_build_object('id', (select '63000000-0000-4000-8000-000000003101'::uuid), 'companyId', (select company_id from wave3_ids), 'purchaseOrderId', (select '60000000-0000-4000-8000-000000003101'::uuid), 'receiptNumber', 'W3-PO-REC-002', 'receiptDate', '2026-09-10'), jsonb_build_array(jsonb_build_object('purchaseOrderLineId', (select '61000000-0000-4000-8000-000000003101'::uuid), 'receivedQuantity', 6)))$$, 'remaining PO quantity can be received explicitly');
select lives_ok($$select public.transition_purchase_order_status((select '60000000-0000-4000-8000-000000003101'::uuid), 'CLOSED', null)$$, 'fully received PO can close without deleting receipt history');
select is((select count(*) from public.purchase_order_receipts where purchase_order_id = (select '60000000-0000-4000-8000-000000003101'::uuid) and status = 'RECEIVED'), 2::bigint, 'PO close preserves receipt history');

reset role;
select * from finish();
rollback;
