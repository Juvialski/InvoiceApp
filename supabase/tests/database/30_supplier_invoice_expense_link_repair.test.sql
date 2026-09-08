begin;
select no_plan();

create temp table supplier_link_repair_ids as
select
  '00000000-0000-4000-8000-000000001301'::uuid as admin_user,
  '00000000-0000-4000-8000-000000001302'::uuid as viewer_user,
  '00000000-0000-4000-8000-000000001303'::uuid as other_company_user,
  'aaaaaaaa-0000-4000-8000-000000001301'::uuid as company_a,
  'aaaaaaaa-0000-4000-8000-000000001302'::uuid as company_b,
  '10000000-0000-4000-8000-000000001301'::uuid as project_a,
  '10000000-0000-4000-8000-000000001302'::uuid as project_b,
  '20000000-0000-4000-8000-000000001301'::uuid as vendor_a,
  '20000000-0000-4000-8000-000000001302'::uuid as vendor_b,
  '30000000-0000-4000-8000-000000001301'::uuid as verified_invoice,
  '30000000-0000-4000-8000-000000001303'::uuid as unlinked_verified_invoice,
  '30000000-0000-4000-8000-000000001304'::uuid as missing_description_invoice,
  '30000000-0000-4000-8000-000000001302'::uuid as invalid_invoice;

grant select on supplier_link_repair_ids to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
values
  ((select admin_user from supplier_link_repair_ids), 'supplier-link-admin@test.local', 'x', now(), now()),
  ((select viewer_user from supplier_link_repair_ids), 'supplier-link-viewer@test.local', 'x', now(), now()),
  ((select other_company_user from supplier_link_repair_ids), 'supplier-link-other@test.local', 'x', now(), now())
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_a from supplier_link_repair_ids), 'Supplier Link Company A', 'supplier-link-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from supplier_link_repair_ids), (select admin_user from supplier_link_repair_ids)),
  ((select company_b from supplier_link_repair_ids), 'Supplier Link Company B', 'supplier-link-b', 'ACTIVE', 'PHP', 'Asia/Manila', (select other_company_user from supplier_link_repair_ids), (select other_company_user from supplier_link_repair_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_a from supplier_link_repair_ids), (select admin_user from supplier_link_repair_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_a from supplier_link_repair_ids), (select viewer_user from supplier_link_repair_ids), 'VIEWER', 'ACTIVE'),
  ((select company_b from supplier_link_repair_ids), (select other_company_user from supplier_link_repair_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from supplier_link_repair_ids))
on conflict (singleton) do update set company_id = excluded.company_id;

insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment)
values
  ((select project_a from supplier_link_repair_ids), (select admin_user from supplier_link_repair_ids), (select company_a from supplier_link_repair_ids), 'SL-A', 'Supplier Link Project A', 'ACTIVE', 100000, 100000, 'PHP', 'VAT'),
  ((select project_b from supplier_link_repair_ids), (select other_company_user from supplier_link_repair_ids), (select company_b from supplier_link_repair_ids), 'SL-B', 'Supplier Link Project B', 'ACTIVE', 100000, 100000, 'PHP', 'VAT');

insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency)
values
  ((select vendor_a from supplier_link_repair_ids), (select admin_user from supplier_link_repair_ids), (select company_a from supplier_link_repair_ids), 'Supplier Link Vendor A', 'supplier link vendor a', 'PHP'),
  ((select vendor_b from supplier_link_repair_ids), (select other_company_user from supplier_link_repair_ids), (select company_b from supplier_link_repair_ids), 'Supplier Link Vendor B', 'supplier link vendor b', 'PHP');

-- This is the production-shaped repair case: the invoice is already VERIFIED,
-- has no Expense/pointer yet, and its valid legacy percentage allocation has
-- not been materialized into allocation_amount.
insert into public.invoices (id, user_id, company_id, vendor_id, invoice_number, invoice_date, currency, grand_total, review_status, document_type, current_data)
values (
  (select verified_invoice from supplier_link_repair_ids),
  (select admin_user from supplier_link_repair_ids),
  (select company_a from supplier_link_repair_ids),
  (select vendor_a from supplier_link_repair_ids),
  'SL-INV-001',
  date '2026-09-08',
  'PHP',
  19500,
  'VERIFIED',
  'INVOICE',
  jsonb_build_object(
    'vendor', jsonb_build_object('name', 'Supplier Link Vendor A'),
    'category', 'Materials',
    'description', 'Supplier link repair materials',
    'invoiceNumber', 'SL-INV-001',
    'grandTotal', 19500
  )
);

insert into public.invoice_project_allocations (user_id, company_id, invoice_id, project_id, allocation_type, allocation_percentage, allocation_amount, currency)
values (
  (select admin_user from supplier_link_repair_ids),
  (select company_a from supplier_link_repair_ids),
  (select verified_invoice from supplier_link_repair_ids),
  (select project_a from supplier_link_repair_ids),
  'PERCENTAGE',
  100,
  null,
  'PHP'
);

insert into public.invoices (id, user_id, company_id, vendor_id, invoice_number, invoice_date, currency, grand_total, review_status, document_type, current_data)
values (
  (select invalid_invoice from supplier_link_repair_ids),
  (select admin_user from supplier_link_repair_ids),
  (select company_a from supplier_link_repair_ids),
  (select vendor_a from supplier_link_repair_ids),
  'SL-INV-INVALID',
  date '2026-09-08',
  'PHP',
  0,
  'VERIFIED',
  'INVOICE',
  jsonb_build_object('category', 'Materials', 'description', 'Invalid supplier invoice')
);

insert into public.invoices (id, user_id, company_id, vendor_id, invoice_number, invoice_date, currency, grand_total, review_status, document_type, current_data)
values (
  (select unlinked_verified_invoice from supplier_link_repair_ids),
  (select admin_user from supplier_link_repair_ids),
  (select company_a from supplier_link_repair_ids),
  (select vendor_a from supplier_link_repair_ids),
  'SL-INV-UNLINKED',
  date '2026-09-08',
  'PHP',
  2500,
  'VERIFIED',
  'INVOICE',
  jsonb_build_object('category', 'Materials', 'description', 'Unlinked repair invoice')
);

insert into public.invoices (id, user_id, company_id, vendor_id, invoice_number, invoice_date, currency, grand_total, review_status, document_type, current_data)
values (
  (select missing_description_invoice from supplier_link_repair_ids),
  (select admin_user from supplier_link_repair_ids),
  (select company_a from supplier_link_repair_ids),
  (select vendor_a from supplier_link_repair_ids),
  'SL-INV-DESCRIPTION',
  date '2026-09-08',
  'PHP',
  2500,
  'VERIFIED',
  'INVOICE',
  jsonb_build_object('category', 'Materials')
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from supplier_link_repair_ids), true);

select is(
  (public.verify_supplier_invoice_and_create_expense((select verified_invoice from supplier_link_repair_ids)))->>'idempotent',
  'false',
  'already-verified supplier invoice without an Expense creates a new authoritative link'
);
select is(
  (select count(*) from public.expenses where company_id = (select company_a from supplier_link_repair_ids) and supplier_invoice_id = (select verified_invoice from supplier_link_repair_ids)),
  1::bigint,
  'supplier invoice link repair creates exactly one Expense'
);
select is(
  (select project_id from public.expenses where supplier_invoice_id = (select verified_invoice from supplier_link_repair_ids)),
  (select project_a from supplier_link_repair_ids),
  'percentage allocation projects the repaired Expense through the canonical projection helper'
);
select is(
  (select amount from public.expenses where supplier_invoice_id = (select verified_invoice from supplier_link_repair_ids)),
  19500::numeric,
  'repaired Expense retains the authoritative supplier invoice amount'
);
select is(
  (select current_data->>'linkedExpenseId' from public.invoices where id = (select verified_invoice from supplier_link_repair_ids)),
  (select id::text from public.expenses where supplier_invoice_id = (select verified_invoice from supplier_link_repair_ids)),
  'invoice durable pointer is repaired to the one authoritative Expense'
);
select is(
  (public.verify_supplier_invoice_and_create_expense((select verified_invoice from supplier_link_repair_ids)))->>'idempotent',
  'true',
  'repeating supplier link repair reuses the authoritative Expense'
);
select is(
  (select count(*) from public.expenses where company_id = (select company_a from supplier_link_repair_ids) and supplier_invoice_id = (select verified_invoice from supplier_link_repair_ids)),
  1::bigint,
  'repeating supplier link repair cannot create a second payable or cost row'
);

select set_config('request.jwt.claim.sub', (select viewer_user::text from supplier_link_repair_ids), true);
select throws_ok(
  $$select public.verify_supplier_invoice_and_create_expense((select verified_invoice from supplier_link_repair_ids))$$,
  '42501',
  null,
  'a company Viewer without invoice/Expense management cannot link supplier evidence'
);

select set_config('request.jwt.claim.sub', (select other_company_user::text from supplier_link_repair_ids), true);
select throws_ok(
  $$select public.verify_supplier_invoice_and_create_expense((select verified_invoice from supplier_link_repair_ids))$$,
  '42501',
  null,
  'a caller from another company cannot link the supplier invoice'
);

select set_config('request.jwt.claim.sub', (select admin_user::text from supplier_link_repair_ids), true);
select throws_ok(
  $$select public.verify_supplier_invoice_and_create_expense((select invalid_invoice from supplier_link_repair_ids))$$,
  '22023',
  null,
  'invalid supplier amount fails closed before creating an Expense'
);
select is(
  (select count(*) from public.expenses where supplier_invoice_id = (select invalid_invoice from supplier_link_repair_ids)),
  0::bigint,
  'invalid supplier invoice failure leaves no partial Expense'
);
select is(
  (select review_status from public.invoices where id = (select invalid_invoice from supplier_link_repair_ids)),
  'VERIFIED',
  'invalid supplier invoice failure leaves source review state unchanged'
);

select set_config('app.supplier_expense_projection_sync', 'on', false);
select throws_ok(
  $$update public.expenses
      set amount = amount + 1
    where company_id = (select company_a from supplier_link_repair_ids)
      and supplier_invoice_id = (select verified_invoice from supplier_link_repair_ids)$$,
  '42501',
  null,
  'authenticated callers cannot bypass the supplier-derived Expense mutation guard with the projection GUC'
);
select set_config('app.supplier_expense_projection_sync', '', false);
select is(
  (select amount from public.expenses where supplier_invoice_id = (select verified_invoice from supplier_link_repair_ids)),
  19500::numeric,
  'blocked supplier-derived Expense mutation leaves the authoritative amount unchanged'
);

select throws_ok(
  $$update public.invoices
      set review_status = 'NEEDS_REVIEW', verified_at = null
    where id = (select verified_invoice from supplier_link_repair_ids)$$,
  '42501',
  null,
  'a verified invoice with an active linked Expense cannot be reopened through generic invoice editing'
);

select lives_ok(
  $$update public.invoices
      set review_status = 'NEEDS_REVIEW', verified_at = null
    where id = (select unlinked_verified_invoice from supplier_link_repair_ids)$$,
  'an already-verified invoice without an active Expense can be reopened for deliberate repair'
);
select is(
  (select review_status from public.invoices where id = (select unlinked_verified_invoice from supplier_link_repair_ids)),
  'NEEDS_REVIEW',
  'reopening an unlinked verified source changes only its review state'
);

select throws_ok(
  $$select public.verify_supplier_invoice_and_create_expense((select missing_description_invoice from supplier_link_repair_ids))$$,
  '22023',
  null,
  'a verified invoice without a confirmed Expense description cannot post'
);
select lives_ok(
  $$update public.invoices
      set review_status = 'NEEDS_REVIEW', verified_at = null
    where id = (select missing_description_invoice from supplier_link_repair_ids)$$,
  'the missing-description invoice can enter the deliberate repair review state'
);
select lives_ok(
  $$update public.invoices
      set current_data = current_data || jsonb_build_object('description', 'Confirmed repair description'), updated_at = now()
    where id = (select missing_description_invoice from supplier_link_repair_ids)$$,
  'repairing the Expense description is a human-editable source fact after reopen'
);
select lives_ok(
  $$select public.verify_supplier_invoice_and_create_expense((select missing_description_invoice from supplier_link_repair_ids))$$,
  'fixing the required description allows the existing guarded posting path'
);
select is(
  (select count(*) from public.expenses where supplier_invoice_id = (select missing_description_invoice from supplier_link_repair_ids)),
  1::bigint,
  'the repaired invoice creates exactly one authoritative Expense'
);

reset role;
select * from finish();
rollback;
