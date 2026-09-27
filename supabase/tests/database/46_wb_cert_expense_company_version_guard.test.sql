begin;
select no_plan();

create temp table wb_cert_expense_ids as
select
  '00000000-0000-4000-8000-000000004601'::uuid as admin_user,
  'aaaaaaaa-0000-4000-8000-000000004601'::uuid as company_id,
  'bbbbbbbb-0000-4000-8000-000000004601'::uuid as other_company_id,
  '10000000-0000-4000-8000-000000004601'::uuid as project_id,
  '20000000-0000-4000-8000-000000004601'::uuid as expense_id,
  '2026-09-20 00:00:00+00'::timestamptz as exported_updated_at,
  '2026-09-21 00:00:00+00'::timestamptz as current_updated_at;
grant select on wb_cert_expense_ids to authenticated, service_role;
create temp table wb_cert_expense_update_results (operation text not null, expense_id uuid not null);
grant insert, select on wb_cert_expense_update_results to authenticated, service_role;

set local role postgres;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from wb_cert_expense_ids), true);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ((select admin_user from wb_cert_expense_ids), 'wb-cert-expense@test.local', 'x', now(), now(), now())
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_id from wb_cert_expense_ids), 'WB-CERT Expense Company', 'wb-cert-expense-4601', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from wb_cert_expense_ids), (select admin_user from wb_cert_expense_ids)),
  ((select other_company_id from wb_cert_expense_ids), 'WB-CERT Other Company', 'wb-cert-expense-4602', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from wb_cert_expense_ids), null);

insert into public.company_members (company_id, user_id, role_key, status)
values ((select company_id from wb_cert_expense_ids), (select admin_user from wb_cert_expense_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from wb_cert_expense_ids))
on conflict (singleton) do update set company_id = excluded.company_id;

insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment)
values (
  (select project_id from wb_cert_expense_ids),
  (select admin_user from wb_cert_expense_ids),
  (select company_id from wb_cert_expense_ids),
  'WB-CERT-EXPENSE-4601', 'WB-CERT Expense Project', 'ACTIVE', 1000, 800, 'PHP', 'VAT'
);

insert into public.expenses (id, user_id, company_id, project_id, expense_date, category, description, payee, amount, currency, status, created_at, updated_at)
values (
  (select expense_id from wb_cert_expense_ids),
  (select admin_user from wb_cert_expense_ids),
  (select company_id from wb_cert_expense_ids),
  (select project_id from wb_cert_expense_ids),
  date '2026-09-19', 'Materials', 'Before workbook Apply', 'WB-CERT Supplier', 125.50, 'PHP', 'DRAFT',
  '2026-09-19 00:00:00+00', (select exported_updated_at from wb_cert_expense_ids)
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from wb_cert_expense_ids), true);

with changed as (
  update public.expenses
     set description = 'Applied workbook value', updated_at = (select current_updated_at from wb_cert_expense_ids)
   where id = (select expense_id from wb_cert_expense_ids)
     and company_id = (select company_id from wb_cert_expense_ids)
     and updated_at = (select exported_updated_at from wb_cert_expense_ids)
   returning id
)
insert into wb_cert_expense_update_results (operation, expense_id)
select 'matching-version', id from changed;
select is(
  (select count(*)::integer from wb_cert_expense_update_results where operation = 'matching-version'),
  1,
  'current company and exported version permit the Expense update'
);
select is(
  (select description from public.expenses where id = (select expense_id from wb_cert_expense_ids)),
  'Applied workbook value',
  'the matching-version Expense update is authoritative'
);

with changed as (
  update public.expenses
     set description = 'Stale workbook replay'
   where id = (select expense_id from wb_cert_expense_ids)
     and company_id = (select company_id from wb_cert_expense_ids)
     and updated_at = (select exported_updated_at from wb_cert_expense_ids)
   returning id
)
insert into wb_cert_expense_update_results (operation, expense_id)
select 'stale-version', id from changed;
select is(
  (select count(*)::integer from wb_cert_expense_update_results where operation = 'stale-version'),
  0,
  'a workbook review opened before the first update cannot overwrite the newer Expense version'
);

with changed as (
  update public.expenses
     set description = 'Other company replay'
   where id = (select expense_id from wb_cert_expense_ids)
     and company_id = (select other_company_id from wb_cert_expense_ids)
     and updated_at = (select current_updated_at from wb_cert_expense_ids)
   returning id
)
insert into wb_cert_expense_update_results (operation, expense_id)
select 'other-company', id from changed;
select is(
  (select count(*)::integer from wb_cert_expense_update_results where operation = 'other-company'),
  0,
  'a workbook proposal cannot update the same Expense identity through another company scope'
);
select is(
  (select description from public.expenses where id = (select expense_id from wb_cert_expense_ids)),
  'Applied workbook value',
  'stale and cross-company attempts leave the authoritative Expense unchanged'
);

select * from finish();
rollback;
