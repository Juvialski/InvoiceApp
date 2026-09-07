begin;
select plan(6);

create temp table projection_guard_ids as
select
  '00000000-0000-4000-8000-000000001291'::uuid as user_id,
  'aaaaaaaa-0000-4000-8000-000000001291'::uuid as company_id,
  '10000000-0000-4000-8000-000000001291'::uuid as project_a,
  '10000000-0000-4000-8000-000000001292'::uuid as project_b,
  '20000000-0000-4000-8000-000000001291'::uuid as vendor_id,
  '30000000-0000-4000-8000-000000001291'::uuid as invoice_id;

grant select on projection_guard_ids to authenticated;

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
values ((select user_id from projection_guard_ids), 'projection-guard@test.local', 'x', now(), now())
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values (
  (select company_id from projection_guard_ids),
  'Projection Guard Company',
  'projection-guard-company',
  'ACTIVE',
  'PHP',
  'Asia/Manila',
  (select user_id from projection_guard_ids),
  (select user_id from projection_guard_ids)
);

insert into public.company_members (company_id, user_id, role_key, status)
values ((select company_id from projection_guard_ids), (select user_id from projection_guard_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from projection_guard_ids))
on conflict (singleton) do update set company_id = excluded.company_id;

insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment)
values
  ((select project_a from projection_guard_ids), (select user_id from projection_guard_ids), (select company_id from projection_guard_ids), 'PG-A', 'Projection Guard Project A', 'ACTIVE', 1000, 1000, 'PHP', 'VAT'),
  ((select project_b from projection_guard_ids), (select user_id from projection_guard_ids), (select company_id from projection_guard_ids), 'PG-B', 'Projection Guard Project B', 'ACTIVE', 1000, 1000, 'PHP', 'VAT');

insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency)
values ((select vendor_id from projection_guard_ids), (select user_id from projection_guard_ids), (select company_id from projection_guard_ids), 'Projection Guard Supplier', 'projection guard supplier', 'PHP');

insert into public.invoices (id, user_id, company_id, vendor_id, invoice_number, invoice_date, currency, grand_total, review_status, document_type, current_data)
values (
  (select invoice_id from projection_guard_ids),
  (select user_id from projection_guard_ids),
  (select company_id from projection_guard_ids),
  (select vendor_id from projection_guard_ids),
  'PG-INV-001',
  current_date,
  'PHP',
  100,
  'NEEDS_REVIEW',
  'INVOICE',
  jsonb_build_object(
    'vendor', jsonb_build_object('name', 'Projection Guard Supplier'),
    'category', 'Materials',
    'description', 'Projection guard materials',
    'grandTotal', 100
  )
);

insert into public.invoice_project_allocations(user_id, company_id, invoice_id, project_id, allocation_type, allocation_amount, currency)
values (
  (select user_id from projection_guard_ids),
  (select company_id from projection_guard_ids),
  (select invoice_id from projection_guard_ids),
  (select project_a from projection_guard_ids),
  'AMOUNT',
  100,
  'PHP'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select user_id::text from projection_guard_ids), true);

select lives_ok(
  $$select public.verify_supplier_invoice_and_create_expense((select invoice_id from projection_guard_ids))$$,
  'guard fixture creates one authoritative supplier-derived Expense'
);

select is(
  (select amount from public.expenses where company_id = (select company_id from projection_guard_ids) and supplier_invoice_id = (select invoice_id from projection_guard_ids)),
  100::numeric,
  'supplier-derived Expense starts with the verified invoice amount'
);

select set_config('app.supplier_expense_projection_sync', 'on', false);
select throws_ok(
  $$update public.expenses
      set amount = amount + 1
    where company_id = (select company_id from projection_guard_ids)
      and supplier_invoice_id = (select invoice_id from projection_guard_ids)$$,
  '42501',
  null,
  'authenticated callers cannot use the internal projection GUC to bypass supplier Expense immutability'
);
select set_config('app.supplier_expense_projection_sync', '', false);

select is(
  (select amount from public.expenses where company_id = (select company_id from projection_guard_ids) and supplier_invoice_id = (select invoice_id from projection_guard_ids)),
  100::numeric,
  'failed bypass leaves the authoritative Expense amount unchanged'
);

select lives_ok(
  $$select public.replace_invoice_project_allocations(
      (select invoice_id from projection_guard_ids),
      jsonb_build_array(jsonb_build_object(
        'project_id', (select project_b from projection_guard_ids),
        'allocation_type', 'AMOUNT',
        'allocation_amount', 100
      )),
      (select updated_at from public.invoices where id = (select invoice_id from projection_guard_ids))
    )$$,
  'private SECURITY DEFINER reconciliation still updates the allowed project convenience projection'
);

select is(
  (select project_id from public.expenses where company_id = (select company_id from projection_guard_ids) and supplier_invoice_id = (select invoice_id from projection_guard_ids)),
  (select project_b from projection_guard_ids),
  'legitimate allocation reconciliation still projects the canonical Project'
);

reset role;
rollback;
