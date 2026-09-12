begin;
select no_plan();

create temp table supplier_payables_ids as
select
  '00000000-0000-4000-8000-000000003901'::uuid as admin_user,
  'aaaaaaaa-0000-4000-8000-000000003901'::uuid as company_id,
  'bbbbbbbb-0000-4000-8000-000000003901'::uuid as other_company_id,
  '30000000-0000-4000-8000-000000003901'::uuid as invoice_id,
  '31000000-0000-4000-8000-000000003901'::uuid as expense_id,
  '32000000-0000-4000-8000-000000003901'::uuid as generic_expense_id,
  '33000000-0000-4000-8000-000000003901'::uuid as vendor_id,
  '40000000-0000-4000-8000-000000003901'::uuid as account_id,
  '41000000-0000-4000-8000-000000003901'::uuid as partial_transaction_id,
  '42000000-0000-4000-8000-000000003901'::uuid as final_transaction_id,
  '43000000-0000-4000-8000-000000003901'::uuid as generic_transaction_id,
  '44000000-0000-4000-8000-000000003901'::uuid as partial_match_id,
  '45000000-0000-4000-8000-000000003901'::uuid as final_match_id;
grant select on supplier_payables_ids to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ((select admin_user from supplier_payables_ids), 'supplier-payables-admin@test.local', 'x', now(), now(), now())
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_id from supplier_payables_ids), 'Supplier Payables Company', 'supplier-payables-901', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from supplier_payables_ids), (select admin_user from supplier_payables_ids)),
  ((select other_company_id from supplier_payables_ids), 'Other Supplier Payables Company', 'supplier-payables-902', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from supplier_payables_ids), null);

insert into public.company_members (company_id, user_id, role_key, status)
values ((select company_id from supplier_payables_ids), (select admin_user from supplier_payables_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from supplier_payables_ids))
on conflict (singleton) do update set company_id = excluded.company_id;

insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency)
values ((select vendor_id from supplier_payables_ids), (select admin_user from supplier_payables_ids), (select company_id from supplier_payables_ids), 'Supplier', 'supplier', 'PHP');

insert into public.invoices (id, user_id, company_id, vendor_id, invoice_number, invoice_date, due_date, currency, grand_total, review_status, lifecycle_status, document_type, current_data)
values (
  (select invoice_id from supplier_payables_ids),
  (select admin_user from supplier_payables_ids),
  (select company_id from supplier_payables_ids),
  (select vendor_id from supplier_payables_ids),
  'SUP-SETTLE-901',
  date '2026-09-01',
  (pg_catalog.timezone('Asia/Manila', now())::date - 1),
  'PHP',
  1000,
  'VERIFIED',
  'ACTIVE',
  'INVOICE',
  jsonb_build_object('invoiceNumber', 'SUP-SETTLE-901', 'grandTotal', 1000, 'amountPaid', 1000, 'category', 'Materials', 'description', 'Supplier settlement consistency fixture')
);

-- Insert the verification-shaped Expense as the database owner so this test
-- does not bypass the production provenance trigger. It intentionally remains
-- DRAFT, just as the guarded verification RPC creates it.
set local role postgres;
insert into public.expenses (id, user_id, company_id, expense_date, category, description, payee, amount, currency, reference_number, status, supplier_invoice_id, vendor_id, created_at, updated_at)
values (
  (select expense_id from supplier_payables_ids),
  (select admin_user from supplier_payables_ids),
  (select company_id from supplier_payables_ids),
  date '2026-09-01', 'Materials', 'Supplier settlement consistency fixture', 'Supplier', 1000, 'PHP', 'SUP-SETTLE-901', 'DRAFT',
  (select invoice_id from supplier_payables_ids), (select vendor_id from supplier_payables_ids), now(), now()
);

insert into public.expenses (id, user_id, company_id, expense_date, category, description, payee, amount, currency, status, created_at, updated_at)
values (
  (select generic_expense_id from supplier_payables_ids),
  (select admin_user from supplier_payables_ids),
  (select company_id from supplier_payables_ids),
  date '2026-09-01', 'Direct', 'Generic draft must remain pending', 'Supplier', 100, 'PHP', 'DRAFT', now(), now()
);

update public.invoices
set current_data = current_data || jsonb_build_object('linkedExpenseId', (select expense_id::text from supplier_payables_ids))
where id = (select invoice_id from supplier_payables_ids);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from supplier_payables_ids), true);

select is((select status from public.expenses where id = (select expense_id from supplier_payables_ids)), 'DRAFT', 'verification-shaped supplier Expense remains DRAFT');
select is(public.get_financial_settlement_summary((select company_id from supplier_payables_ids), 'INVOICE', (select invoice_id from supplier_payables_ids))->>'settlementState', 'OVERDUE', 'verified unpaid supplier obligation is overdue from the business date, not document-paid text');
select is(public.get_financial_settlement_summary((select company_id from supplier_payables_ids), 'INVOICE', (select invoice_id from supplier_payables_ids))->>'authorityConflict', 'false', 'the single linked supplier Expense has no authority conflict');
select is((public.get_financial_settlement_summary((select company_id from supplier_payables_ids), 'INVOICE', (select invoice_id from supplier_payables_ids))->>'settlementBasis')::numeric, 1000::numeric, 'linked supplier invoice summary uses the canonical Expense amount');
select is((public.get_financial_settlement_summary((select company_id from supplier_payables_ids), 'INVOICE', (select invoice_id from supplier_payables_ids))->>'documentReportedPaid')::numeric, 1000::numeric, 'document-reported paid amount remains separately visible as evidence');
select is((public.get_financial_settlement_summary((select company_id from supplier_payables_ids), 'INVOICE', (select invoice_id from supplier_payables_ids))->>'effectiveSettled')::numeric, 0::numeric, 'document-paid evidence alone does not settle the supplier obligation');
select is((public.get_financial_settlement_summary((select company_id from supplier_payables_ids), 'INVOICE', (select invoice_id from supplier_payables_ids))->>'outstanding')::numeric, 1000::numeric, 'no confirmed settlement leaves the full payable outstanding');

select lives_ok($$select public.save_financial_account((select company_id from supplier_payables_ids), (select account_id from supplier_payables_ids), 'BANK', 'SP901', 'Supplier Payables Bank', 'Operating PHP', '•••• 3901', 'PHP', 0, (pg_catalog.timezone('Asia/Manila', now())::date), 'MANUAL')$$, 'fixture creates one company-scoped Cash/Bank account');
select lives_ok($$select public.create_financial_transaction((select company_id from supplier_payables_ids), (select partial_transaction_id from supplier_payables_ids), (select account_id from supplier_payables_ids), (pg_catalog.timezone('Asia/Manila', now())::date), now(), 'SP-PARTIAL', 'Supplier partial settlement', 'DEBIT', 400, 'PHP', 'supplier-payables-partial')$$, 'fixture creates a posted debit for partial settlement');
select lives_ok($$select public.confirm_financial_settlement((select company_id from supplier_payables_ids), (select partial_transaction_id from supplier_payables_ids), 'EXPENSE', (select expense_id from supplier_payables_ids), 400, (select partial_match_id from supplier_payables_ids), null, 'Partial supplier settlement', 'RECONCILIATION_UI')$$, 'supplier-linked DRAFT Expense accepts confirmed settlement without approval mutation');
select is((select status from public.expenses where id = (select expense_id from supplier_payables_ids)), 'DRAFT', 'confirmed settlement does not approve or rewrite the supplier Expense lifecycle');
select is((public.get_financial_settlement_summary((select company_id from supplier_payables_ids), 'EXPENSE', (select expense_id from supplier_payables_ids))->>'settlementState'), 'OVERDUE', 'partial past-due supplier settlement is overdue');
select is((public.get_financial_settlement_summary((select company_id from supplier_payables_ids), 'EXPENSE', (select expense_id from supplier_payables_ids))->>'reconciledCashPaid')::numeric, 400::numeric, 'partial settlement uses confirmed cash only');
select is((public.get_financial_settlement_summary((select company_id from supplier_payables_ids), 'EXPENSE', (select expense_id from supplier_payables_ids))->>'outstanding')::numeric, 600::numeric, 'partial settlement leaves the exact remaining balance');

select lives_ok($$select public.create_financial_transaction((select company_id from supplier_payables_ids), (select final_transaction_id from supplier_payables_ids), (select account_id from supplier_payables_ids), (pg_catalog.timezone('Asia/Manila', now())::date), now(), 'SP-FINAL', 'Supplier final settlement', 'DEBIT', 600, 'PHP', 'supplier-payables-final')$$, 'fixture creates a posted debit for the remaining balance');
select lives_ok($$select public.confirm_financial_settlement((select company_id from supplier_payables_ids), (select final_transaction_id from supplier_payables_ids), 'EXPENSE', (select expense_id from supplier_payables_ids), 600, (select final_match_id from supplier_payables_ids), null, 'Final supplier settlement', 'RECONCILIATION_UI')$$, 'full settlement uses the remaining payable exactly once');
select is((public.get_financial_settlement_summary((select company_id from supplier_payables_ids), 'INVOICE', (select invoice_id from supplier_payables_ids))->>'settlementState'), 'PAID', 'full confirmed settlement produces PAID');
select is((public.get_financial_settlement_summary((select company_id from supplier_payables_ids), 'INVOICE', (select invoice_id from supplier_payables_ids))->>'outstanding')::numeric, 0::numeric, 'full confirmed settlement removes the outstanding balance');
select lives_ok($$select public.reverse_financial_settlement((select company_id from supplier_payables_ids), (select final_match_id from supplier_payables_ids), 'Reopen corrected supplier settlement')$$, 'settlement reversal is reasoned and append-only');
select is((public.get_financial_settlement_summary((select company_id from supplier_payables_ids), 'INVOICE', (select invoice_id from supplier_payables_ids))->>'settlementState'), 'OVERDUE', 'reversing a settlement restores the overdue state');
select is((public.get_financial_settlement_summary((select company_id from supplier_payables_ids), 'INVOICE', (select invoice_id from supplier_payables_ids))->>'outstanding')::numeric, 600::numeric, 'reversing a settlement restores the exact remaining balance');
select is((select count(*) from public.financial_transaction_matches where company_id = (select company_id from supplier_payables_ids) and target_type = 'EXPENSE' and target_id = (select expense_id from supplier_payables_ids) and status = 'REVERSED'), 1::bigint, 'reversal preserves the original settlement history');

select lives_ok($$select public.create_financial_transaction((select company_id from supplier_payables_ids), (select generic_transaction_id from supplier_payables_ids), (select account_id from supplier_payables_ids), (pg_catalog.timezone('Asia/Manila', now())::date), now(), 'SP-GENERIC', 'Generic draft settlement', 'DEBIT', 100, 'PHP', 'supplier-payables-generic')$$, 'fixture creates a posted debit for generic draft guard');
select throws_ok($$select public.confirm_financial_settlement((select company_id from supplier_payables_ids), (select generic_transaction_id from supplier_payables_ids), 'EXPENSE', (select generic_expense_id from supplier_payables_ids), 100, null, null, 'Generic draft settlement', 'RECONCILIATION_UI')$$, '42501', null, 'generic direct DRAFT Expense remains ineligible');
select throws_ok($$select public.confirm_financial_settlement((select company_id from supplier_payables_ids), (select generic_transaction_id from supplier_payables_ids), 'INVOICE', (select invoice_id from supplier_payables_ids), 100, null, null, 'Wrong invoice target', 'RECONCILIATION_UI')$$, '42501', null, 'linked supplier invoice cannot receive a second direct invoice settlement target');
select is((select count(*) from public.financial_transaction_matches where company_id = (select company_id from supplier_payables_ids) and target_id = (select invoice_id from supplier_payables_ids) and status = 'CONFIRMED'), 0::bigint, 'blocked direct invoice settlement creates no duplicate match');

reset role;
select * from finish();
rollback;
