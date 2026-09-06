begin;
select no_plan();

select has_table('public', 'financial_fx_snapshots', 'financial FX snapshots exist');
select has_column('public', 'financial_fx_snapshots', 'source_amount', 'FX source amount exists');
select has_column('public', 'financial_fx_snapshots', 'base_amount', 'FX base amount exists');
select has_column('public', 'projects', 'tax_treatment', 'project tax treatment exists');
select has_column('public', 'client_billings', 'tax_treatment', 'client billing tax treatment exists');
select has_function('public', 'upsert_financial_fx_snapshot', 'FX confirmation RPC exists');
select isnt_empty(
  $$select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'financial_fx_snapshots' and c.relrowsecurity$$,
  'financial FX snapshots have RLS enabled'
);
select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'financial_fx_snapshots'
      and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')$$,
  'authenticated cannot mutate FX snapshots directly'
);
select is_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'upsert_financial_fx_snapshot'
      and lower(grantee) in ('public', 'anon') and privilege_type = 'EXECUTE'$$,
  'anonymous and public roles cannot execute the FX RPC'
);
select isnt_empty(
  $$select 1 from pg_proc where oid = 'public.upsert_financial_fx_snapshot(text,uuid,numeric,date,text,text)'::regprocedure
    and prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'$$,
  'FX RPC is SECURITY DEFINER with an empty search_path'
);

create temp table r4_ids as
select
  '00000000-0000-4000-8000-000000000401'::uuid as admin_user,
  '00000000-0000-4000-8000-000000000402'::uuid as viewer_user,
  'aaaaaaaa-0000-4000-8000-000000000401'::uuid as company_a,
  'bbbbbbbb-0000-4000-8000-000000000402'::uuid as company_b,
  '10000000-0000-4000-8000-000000000401'::uuid as project_a,
  '20000000-0000-4000-8000-000000000402'::uuid as project_b,
  '21000000-0000-4000-8000-000000000402'::uuid as project_legacy,
  '30000000-0000-4000-8000-000000000401'::uuid as expense_usd,
  '40000000-0000-4000-8000-000000000401'::uuid as payroll_period_a,
  '50000000-0000-4000-8000-000000000401'::uuid as legacy_invoice,
  '60000000-0000-4000-8000-000000000401'::uuid as legacy_vendor;
grant select on r4_ids to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
select id, email, 'x', now(), now()
from (values
  ((select admin_user from r4_ids), 'r4-admin@test.local'),
  ((select viewer_user from r4_ids), 'r4-viewer@test.local')
) users(id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_a from r4_ids), 'R4 Company A', 'r4-company-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from r4_ids), (select admin_user from r4_ids)),
  ((select company_b from r4_ids), 'R4 Company B', 'r4-company-b', 'ACTIVE', 'USD', 'UTC', (select viewer_user from r4_ids), (select viewer_user from r4_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_a from r4_ids), (select admin_user from r4_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_a from r4_ids), (select viewer_user from r4_ids), 'VIEWER', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from r4_ids));

insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment)
values
  ((select project_a from r4_ids), (select admin_user from r4_ids), (select company_a from r4_ids), 'R4-A', 'R4 Project A', 'ACTIVE', 10000, 8000, 'PHP', 'VAT'),
  ((select project_b from r4_ids), (select viewer_user from r4_ids), (select company_b from r4_ids), 'R4-B', 'R4 Project B', 'ACTIVE', 10000, 8000, 'USD', 'NON_VAT'),
  ((select project_legacy from r4_ids), (select admin_user from r4_ids), (select company_a from r4_ids), 'R4-LEGACY', 'R4 Legacy Project', 'ACTIVE', 10000, 8000, 'USD', 'VAT');

update public.projects set tax_treatment = 'UNCLASSIFIED' where id = (select project_legacy from r4_ids);

insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency)
values ((select legacy_vendor from r4_ids), (select admin_user from r4_ids), (select company_a from r4_ids), 'R4 Legacy Supplier', 'r4 legacy supplier', 'PHP');

-- This models an invoice created before R3: it is already VERIFIED but has no
-- linked Expense row yet. The R3 RPC remains the one repair/posting boundary.
insert into public.invoices (id, user_id, company_id, vendor_id, invoice_number, invoice_date, currency, grand_total, review_status, document_type, current_data)
values ((select legacy_invoice from r4_ids), (select admin_user from r4_ids), (select company_a from r4_ids), (select legacy_vendor from r4_ids), 'R4-LEGACY-001', date '2026-09-06', 'PHP', 250, 'VERIFIED', 'INVOICE', jsonb_build_object('vendor', jsonb_build_object('name', 'R4 Legacy Supplier'), 'category', 'Materials', 'description', 'R4 legacy supplier invoice', 'invoiceNumber', 'R4-LEGACY-001', 'grandTotal', 250));
insert into public.invoice_project_allocations (id, user_id, company_id, invoice_id, project_id, allocation_type, allocation_amount, currency)
values (gen_random_uuid(), (select admin_user from r4_ids), (select company_a from r4_ids), (select legacy_invoice from r4_ids), (select project_a from r4_ids), 'AMOUNT', 250, 'PHP');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from r4_ids), true);

select throws_ok($$insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency)
  values ('22000000-0000-4000-8000-000000000401', (select admin_user from r4_ids), (select company_a from r4_ids), 'R4-MISSING', 'Missing Tax Project', 'ACTIVE', 10000, 8000, 'PHP')$$,
  '23514', null, 'new projects cannot omit an explicit VAT or Non-VAT classification');
select is((select tax_treatment from public.projects where id = (select project_legacy from r4_ids)), 'UNCLASSIFIED', 'legacy projects can remain explicitly unclassified until confirmation');
update public.projects set tax_treatment = 'VAT' where id = (select project_a from r4_ids);
update public.projects set tax_treatment = 'VAT' where id = (select project_legacy from r4_ids);
select is((select tax_treatment from public.projects where id = (select project_a from r4_ids)), 'VAT', 'authorized project manager can confirm VAT classification');
select is((select tax_treatment from public.projects where id = (select project_legacy from r4_ids)), 'VAT', 'authorized project manager can confirm legacy project classification');

select lives_ok($$select public.verify_supplier_invoice_and_create_expense((select legacy_invoice from r4_ids))$$, 'already-verified legacy supplier invoice can be repaired into the authoritative Expense');
select is((select count(*) from public.expenses where supplier_invoice_id = (select legacy_invoice from r4_ids)), 1::bigint, 'legacy supplier repair creates exactly one Expense');
select is((select project_id from public.expenses where supplier_invoice_id = (select legacy_invoice from r4_ids)), (select project_a from r4_ids), 'legacy supplier repair preserves project provenance');
select lives_ok($$select public.verify_supplier_invoice_and_create_expense((select legacy_invoice from r4_ids))$$, 'legacy supplier repair is idempotent on retry');
select is((select count(*) from public.expenses where supplier_invoice_id = (select legacy_invoice from r4_ids)), 1::bigint, 'legacy supplier retry cannot duplicate the Expense');

with saved as (
  select public.create_or_update_client_billing(
    jsonb_build_object('companyId', (select company_a from r4_ids), 'projectId', (select project_a from r4_ids), 'billingNumber', 'R4-BILL-001', 'currency', 'PHP'),
    jsonb_build_array(jsonb_build_object('description', 'R4 progress', 'amount', 1000))
  ) as response
)
select is((response->'billing'->>'tax_treatment'), 'VAT', 'client billing draft inherits the current project tax treatment') from saved;

select is((public.transition_client_billing((select id from public.client_billings where billing_number = 'R4-BILL-001'), 'SUBMITTED', null)->'billing'->>'tax_treatment'), 'VAT', 'submitted billing retains inherited tax treatment');
select lives_ok($$select public.transition_client_billing((select id from public.client_billings where billing_number = 'R4-BILL-001'), 'ISSUED', null)$$, 'VAT client billing can be issued');
select is((select tax_treatment from public.client_billings where billing_number = 'R4-BILL-001'), 'VAT', 'issued billing stores the tax snapshot');
select is((select snapshot->>'taxTreatment' from public.issued_document_snapshots where document_type = 'CLIENT_INVOICE' and document_id = (select id from public.client_billings where billing_number = 'R4-BILL-001')), 'VAT', 'issued client document snapshot stores tax treatment');

update public.projects set tax_treatment = 'NON_VAT' where id = (select project_a from r4_ids);
select is((select tax_treatment from public.client_billings where billing_number = 'R4-BILL-001'), 'VAT', 'later project classification changes do not mutate issued billing meaning');
select is((select snapshot->>'taxTreatment' from public.issued_document_snapshots where document_type = 'CLIENT_INVOICE' and document_id = (select id from public.client_billings where billing_number = 'R4-BILL-001')), 'VAT', 'later project classification changes do not mutate issued document snapshot');

insert into public.expenses (id, user_id, company_id, project_id, expense_date, category, description, amount, currency, status)
values ((select expense_usd from r4_ids), (select admin_user from r4_ids), (select company_a from r4_ids), (select project_a from r4_ids), current_date, 'Materials', 'R4 USD expense', 10, 'USD', 'APPROVED');

select lives_ok($$select public.upsert_financial_fx_snapshot('EXPENSE', (select expense_usd from r4_ids), 56.25, date '2026-09-06', 'MANUAL', 'Approved rate reference')$$, 'authorized user can confirm an expense FX rate');
select is((select source_currency from public.financial_fx_snapshots where source_id = (select expense_usd from r4_ids)), 'USD', 'FX snapshot retains original currency');
select is((select base_currency from public.financial_fx_snapshots where source_id = (select expense_usd from r4_ids)), 'PHP', 'FX snapshot uses company base currency');
select is((select base_amount from public.financial_fx_snapshots where source_id = (select expense_usd from r4_ids)), 562.50::numeric, 'FX snapshot stores the rounded PHP equivalent');
select is((select rate_source from public.financial_fx_snapshots where source_id = (select expense_usd from r4_ids)), 'MANUAL', 'FX provenance is retained');
select is((select count(*) from public.financial_fx_snapshots where source_id = (select expense_usd from r4_ids)), 1::bigint, 'one source record has one FX snapshot');
select lives_ok($$select public.upsert_financial_fx_snapshot('EXPENSE', (select expense_usd from r4_ids), 99, date '2026-09-07', 'MANUAL', 'Retry')$$, 'repeated FX confirmation is idempotent');
select is((select rate from public.financial_fx_snapshots where source_id = (select expense_usd from r4_ids)), 56.25::numeric, 'repeated confirmation does not rewrite the historical rate');
select throws_ok($$update public.financial_fx_snapshots set rate = 99 where source_id = (select expense_usd from r4_ids)$$, '42501', null, 'FX snapshot update is rejected');
select throws_ok($$delete from public.financial_fx_snapshots where source_id = (select expense_usd from r4_ids)$$, '42501', null, 'FX snapshot deletion is rejected');

select lives_ok($$insert into public.payroll_periods (id, user_id, company_id, period_start, period_end, status) values ((select payroll_period_a from r4_ids), (select admin_user from r4_ids), (select company_a from r4_ids), date '2026-09-16', date '2026-09-30', 'DRAFT')$$, 'first active payroll period boundary is accepted');
select throws_ok($$insert into public.payroll_periods (id, user_id, company_id, period_start, period_end, status) values ('50000000-0000-4000-8000-000000000401', (select admin_user from r4_ids), (select company_a from r4_ids), date '2026-09-16', date '2026-09-30', 'DRAFT')$$, '23505', null, 'duplicate active payroll boundary is rejected');
select lives_ok($$insert into public.payroll_periods (id, user_id, company_id, period_start, period_end, status) values ('60000000-0000-4000-8000-000000000401', (select admin_user from r4_ids), (select company_a from r4_ids), date '2026-09-16', date '2026-09-30', 'VOID')$$, 'VOID payroll history remains preservable for the same boundary');
select is((select count(*) from public.payroll_periods where company_id = (select company_a from r4_ids) and period_start = date '2026-09-16' and period_end = date '2026-09-30'), 2::bigint, 'active and VOID payroll history remain distinct');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select viewer_user::text from r4_ids), true);
select throws_ok($$select public.upsert_financial_fx_snapshot('EXPENSE', (select expense_usd from r4_ids), 56.25, date '2026-09-06', 'MANUAL', 'Viewer')$$, '42501', null, 'viewer cannot manage FX rates without company settings management permission');
select is((select count(*) from public.financial_fx_snapshots where company_id = (select company_a from r4_ids)), 1::bigint, 'viewer can read the company FX snapshot without managing it');

reset role;
select * from finish();
rollback;
