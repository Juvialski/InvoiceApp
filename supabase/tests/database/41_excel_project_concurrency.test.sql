begin;
select no_plan();

select ok(
  has_function_privilege('authenticated', 'public.save_rfq(jsonb,jsonb,uuid[],timestamptz)', 'EXECUTE'),
  'authenticated can execute version-aware RFQ save'
);
select ok(
  has_function_privilege('authenticated', 'public.save_purchase_order(jsonb,jsonb,timestamptz)', 'EXECUTE'),
  'authenticated can execute version-aware purchase-order save'
);
select ok(
  has_function_privilege('authenticated', 'public.save_project(jsonb,timestamptz)', 'EXECUTE'),
  'authenticated can execute version-aware project save'
);
select ok(
  has_function_privilege('authenticated', 'public.apply_project_cost_control_group(uuid,timestamptz,jsonb,jsonb)', 'EXECUTE'),
  'authenticated can execute grouped project cost-control Apply'
);
select ok(
  not has_function_privilege('anon', 'public.save_project(jsonb,timestamptz)', 'EXECUTE'),
  'anonymous callers cannot execute project save'
);
select ok(
  not has_function_privilege('public', 'public.apply_project_cost_control_group(uuid,timestamptz,jsonb,jsonb)', 'EXECUTE'),
  'public callers cannot execute grouped project Apply'
);

select ok(to_regprocedure('public.save_rfq(jsonb,jsonb,uuid[],timestamptz)') is not null, 'RFQ save carries an expected timestamp argument');
select ok(to_regprocedure('public.save_purchase_order(jsonb,jsonb,timestamptz)') is not null, 'purchase-order save carries an expected timestamp argument');
select ok(to_regprocedure('public.save_project(jsonb,timestamptz)') is not null, 'project save carries an expected timestamp argument');
select ok(to_regprocedure('public.apply_project_cost_control_group(uuid,timestamptz,jsonb,jsonb)') is not null, 'grouped project Apply has project version and proposed cost-code payloads');
select ok(
  not has_table_privilege('authenticated', 'public.project_cost_codes', 'DELETE'),
  'cost-code deletion remains unavailable'
);
select ok(
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'apply_project_cost_control_group'
       and pg_get_functiondef(p.oid) ilike '%for update%'
       and pg_get_functiondef(p.oid) ilike '%40001%'
       and pg_get_functiondef(p.oid) ilike '%project_budget%'
       and pg_get_functiondef(p.oid) ilike '%currency is protected%'
  ),
  'grouped project Apply locks rows and exposes stale, budget, and protected-currency safeguards'
);

create temp table excel_concurrency_ids as
select
  '00000000-0000-4000-8000-000000004101'::uuid as admin_user,
  '00000000-0000-4000-8000-000000004102'::uuid as outsider_user,
  'aaaaaaaa-0000-4000-8000-000000004101'::uuid as company_id,
  '10000000-0000-4000-8000-000000004101'::uuid as project_id,
  '20000000-0000-4000-8000-000000004101'::uuid as vendor_id,
  '30000000-0000-4000-8000-000000004101'::uuid as rfq_id,
  '40000000-0000-4000-8000-000000004101'::uuid as po_id,
  '50000000-0000-4000-8000-000000004101'::uuid as cost_code_id;
grant select on excel_concurrency_ids to authenticated, service_role;

set local role postgres;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from excel_concurrency_ids), true);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ((select admin_user from excel_concurrency_ids), 'excel-concurrency-admin@test.local', 'x', now(), now(), now()),
  ((select outsider_user from excel_concurrency_ids), 'excel-concurrency-outsider@test.local', 'x', now(), now(), now());

insert into public.companies (
  id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id
) values (
  (select company_id from excel_concurrency_ids),
  'Excel Concurrency Test Company',
  'excel-concurrency',
  'ACTIVE',
  'PHP',
  'Asia/Manila',
  (select admin_user from excel_concurrency_ids),
  (select admin_user from excel_concurrency_ids)
);

insert into public.company_members (company_id, user_id, role_key, status)
values (
  (select company_id from excel_concurrency_ids),
  (select admin_user from excel_concurrency_ids),
  'COMPANY_ADMIN',
  'ACTIVE'
);

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from excel_concurrency_ids));

insert into public.projects (
  id, user_id, company_id, project_code, project_name, status,
  contract_value, project_budget, currency, tax_treatment, updated_at
) values (
  (select project_id from excel_concurrency_ids),
  (select admin_user from excel_concurrency_ids),
  (select company_id from excel_concurrency_ids),
  'EXCEL-CONCURRENCY',
  'Excel Concurrency Project',
  'ACTIVE',
  1500,
  1000,
  'PHP',
  'VAT',
  '2026-09-19 00:00:00+00'::timestamptz
);

insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency)
values (
  (select vendor_id from excel_concurrency_ids),
  (select admin_user from excel_concurrency_ids),
  (select company_id from excel_concurrency_ids),
  'Excel Concurrency Supplier',
  'excel concurrency supplier',
  'PHP'
);

insert into public.project_cost_codes (
  id, company_id, project_id, code, name, status, approved_budget_amount,
  forecast_amount, created_by_user_id, updated_by_user_id, updated_at
) values (
  (select cost_code_id from excel_concurrency_ids),
  (select company_id from excel_concurrency_ids),
  (select project_id from excel_concurrency_ids),
  'CIVIL',
  'Civil Works',
  'ACTIVE',
  600,
  650,
  (select admin_user from excel_concurrency_ids),
  (select admin_user from excel_concurrency_ids),
  '2026-09-19 00:00:00+00'::timestamptz
);

insert into public.rfqs (
  id, company_id, rfq_number, title, project_id, currency, status,
  created_by_user_id, updated_by_user_id, updated_at
) values (
  (select rfq_id from excel_concurrency_ids),
  (select company_id from excel_concurrency_ids),
  'RFQ-CONCURRENCY-001',
  'RFQ concurrency fixture',
  (select project_id from excel_concurrency_ids),
  'PHP',
  'DRAFT',
  (select admin_user from excel_concurrency_ids),
  (select admin_user from excel_concurrency_ids),
  '2026-09-19 00:00:00+00'::timestamptz
);

insert into public.purchase_orders (
  id, company_id, po_number, vendor_id, project_id, currency, status,
  description, created_by_user_id, updated_by_user_id, updated_at
) values (
  (select po_id from excel_concurrency_ids),
  (select company_id from excel_concurrency_ids),
  'PO-CONCURRENCY-001',
  (select vendor_id from excel_concurrency_ids),
  (select project_id from excel_concurrency_ids),
  'PHP',
  'DRAFT',
  'PO concurrency fixture',
  (select admin_user from excel_concurrency_ids),
  (select admin_user from excel_concurrency_ids),
  '2026-09-19 00:00:00+00'::timestamptz
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from excel_concurrency_ids), true);

select lives_ok(
  $$select public.save_rfq(
    jsonb_build_object(
      'id', (select rfq_id from excel_concurrency_ids),
      'companyId', (select company_id from excel_concurrency_ids),
      'rfqNumber', 'RFQ-CONCURRENCY-001',
      'title', 'RFQ matching-version update',
      'projectId', (select project_id from excel_concurrency_ids),
      'currency', 'PHP'
    ),
    '[]'::jsonb,
    null::uuid[],
    '2026-09-19 00:00:00+00'::timestamptz
  )$$,
  'RFQ matching version updates successfully'
);
select throws_ok(
  $$select public.save_rfq(
    jsonb_build_object(
      'id', (select rfq_id from excel_concurrency_ids),
      'companyId', (select company_id from excel_concurrency_ids),
      'rfqNumber', 'RFQ-CONCURRENCY-001',
      'title', 'RFQ stale overwrite',
      'projectId', (select project_id from excel_concurrency_ids),
      'currency', 'PHP'
    ),
    '[]'::jsonb,
    null::uuid[],
    '2026-09-19 00:00:00+00'::timestamptz
  )$$,
  '40001',
  null,
  'RFQ stale expected version is rejected inside the save RPC'
);
select is(
  (select title from public.rfqs where id = (select rfq_id from excel_concurrency_ids)),
  'RFQ matching-version update',
  'rejected stale RFQ save does not overwrite the authoritative row'
);

select lives_ok(
  $$select public.save_purchase_order(
    jsonb_build_object(
      'id', (select po_id from excel_concurrency_ids),
      'companyId', (select company_id from excel_concurrency_ids),
      'poNumber', 'PO-CONCURRENCY-001',
      'vendorId', (select vendor_id from excel_concurrency_ids),
      'projectId', (select project_id from excel_concurrency_ids),
      'currency', 'PHP',
      'description', 'PO matching-version update'
    ),
    '[]'::jsonb,
    '2026-09-19 00:00:00+00'::timestamptz
  )$$,
  'PO matching version updates successfully'
);
select throws_ok(
  $$select public.save_purchase_order(
    jsonb_build_object(
      'id', (select po_id from excel_concurrency_ids),
      'companyId', (select company_id from excel_concurrency_ids),
      'poNumber', 'PO-CONCURRENCY-001',
      'vendorId', (select vendor_id from excel_concurrency_ids),
      'projectId', (select project_id from excel_concurrency_ids),
      'currency', 'PHP',
      'description', 'PO stale overwrite'
    ),
    '[]'::jsonb,
    '2026-09-19 00:00:00+00'::timestamptz
  )$$,
  '40001',
  null,
  'purchase-order stale expected version is rejected inside the save RPC'
);
select is(
  (select description from public.purchase_orders where id = (select po_id from excel_concurrency_ids)),
  'PO matching-version update',
  'rejected stale purchase-order save does not overwrite the authoritative row'
);

select throws_ok(
  $$select public.save_project(
    jsonb_build_object(
      'id', (select project_id from excel_concurrency_ids),
      'companyId', (select company_id from excel_concurrency_ids),
      'projectCode', 'EXCEL-CONCURRENCY',
      'projectName', 'Project stale overwrite',
      'status', 'ACTIVE',
      'contractValue', 1500,
      'projectBudget', 1000,
      'currency', 'PHP',
      'taxTreatment', 'VAT'
    ),
    '2026-09-18 00:00:00+00'::timestamptz
  )$$,
  '40001',
  null,
  'project save rejects a stale expected version'
);
select is(
  (select project_name from public.projects where id = (select project_id from excel_concurrency_ids)),
  'Excel Concurrency Project',
  'rejected stale project save leaves the authoritative project unchanged'
);

select lives_ok(
  $$select public.apply_project_cost_control_group(
    (select project_id from excel_concurrency_ids),
    '2026-09-19 00:00:00+00'::timestamptz,
    jsonb_build_object(
      'id', (select project_id from excel_concurrency_ids),
      'companyId', (select company_id from excel_concurrency_ids),
      'projectCode', 'EXCEL-CONCURRENCY',
      'projectName', 'Excel Runtime Updated',
      'status', 'ACTIVE',
      'contractValue', 1600,
      'projectBudget', 1000,
      'currency', 'PHP',
      'taxTreatment', 'VAT'
    ),
    jsonb_build_array(jsonb_build_object(
      'id', (select cost_code_id from excel_concurrency_ids),
      'projectId', (select project_id from excel_concurrency_ids),
      'code', 'CIVIL',
      'name', 'Civil Works Updated',
      'status', 'ACTIVE',
      'approvedBudgetAmount', 650,
      'forecastAmount', 700,
      'updatedAt', '2026-09-19T00:00:00+00:00'
    ))
  )$$,
  'grouped project/cost-code Apply succeeds with matching versions'
);
select is(
  (select project_name from public.projects where id = (select project_id from excel_concurrency_ids)),
  'Excel Runtime Updated',
  'successful grouped Apply updates the project'
);
select is(
  (select approved_budget_amount from public.project_cost_codes where id = (select cost_code_id from excel_concurrency_ids)),
  650.00::numeric,
  'successful grouped Apply updates the cost code in the same transaction'
);

select throws_ok(
  $$select public.apply_project_cost_control_group(
    (select project_id from excel_concurrency_ids),
    (select updated_at from public.projects where id = (select project_id from excel_concurrency_ids)),
    jsonb_build_object(
      'id', (select project_id from excel_concurrency_ids),
      'companyId', (select company_id from excel_concurrency_ids),
      'projectCode', 'EXCEL-CONCURRENCY',
      'projectName', 'Should Not Persist',
      'status', 'ACTIVE',
      'contractValue', 1600,
      'projectBudget', 1000,
      'currency', 'PHP',
      'taxTreatment', 'VAT'
    ),
    jsonb_build_array(jsonb_build_object(
      'id', (select cost_code_id from excel_concurrency_ids),
      'projectId', (select project_id from excel_concurrency_ids),
      'code', 'CIVIL',
      'name', 'Stale Cost Code',
      'status', 'ACTIVE',
      'approvedBudgetAmount', 700,
      'updatedAt', '2026-09-19T00:00:00+00:00'
    ))
  )$$,
  '40001',
  null,
  'grouped Apply rejects a stale cost-code version atomically'
);
select is(
  (select project_name from public.projects where id = (select project_id from excel_concurrency_ids)),
  'Excel Runtime Updated',
  'stale cost-code rejection rolls back the project portion of the group'
);
select is(
  (select name from public.project_cost_codes where id = (select cost_code_id from excel_concurrency_ids)),
  'Civil Works Updated',
  'stale cost-code rejection leaves the cost code unchanged'
);

select throws_ok(
  $$select public.apply_project_cost_control_group(
    (select project_id from excel_concurrency_ids),
    (select updated_at from public.projects where id = (select project_id from excel_concurrency_ids)),
    jsonb_build_object(
      'id', (select project_id from excel_concurrency_ids),
      'companyId', (select company_id from excel_concurrency_ids),
      'projectCode', 'EXCEL-CONCURRENCY',
      'projectName', 'Excel Runtime Updated',
      'status', 'ACTIVE',
      'contractValue', 1600,
      'projectBudget', 600,
      'currency', 'PHP',
      'taxTreatment', 'VAT'
    ),
    '[]'::jsonb
  )$$,
  '23514',
  null,
  'grouped Apply rejects a final active cost-code allocation above the project budget'
);
select is(
  (select project_budget from public.projects where id = (select project_id from excel_concurrency_ids)),
  1000.00::numeric,
  'budget-ceiling rejection leaves the authoritative project budget unchanged'
);

select throws_ok(
  $$select public.apply_project_cost_control_group(
    (select project_id from excel_concurrency_ids),
    (select updated_at from public.projects where id = (select project_id from excel_concurrency_ids)),
    jsonb_build_object(
      'id', (select project_id from excel_concurrency_ids),
      'companyId', (select company_id from excel_concurrency_ids),
      'projectCode', 'EXCEL-CONCURRENCY',
      'projectName', 'Excel Runtime Updated',
      'status', 'ACTIVE',
      'contractValue', 1600,
      'projectBudget', 1000,
      'currency', 'USD',
      'taxTreatment', 'VAT'
    ),
    '[]'::jsonb
  )$$,
  '42501',
  null,
  'grouped workbook Apply rejects protected currency mutation at the database boundary'
);
select is(
  (select currency from public.projects where id = (select project_id from excel_concurrency_ids)),
  'PHP',
  'protected project currency remains unchanged after rejected workbook Apply'
);

select throws_ok(
  $select public.apply_project_cost_control_group(
    (select project_id from excel_concurrency_ids),
    (select updated_at from public.projects where id = (select project_id from excel_concurrency_ids)),
    jsonb_build_object(
      'id', (select project_id from excel_concurrency_ids),
      'companyId', (select company_id from excel_concurrency_ids),
      'projectCode', 'EXCEL-CONCURRENCY',
      'projectName', 'Excel Runtime Updated',
      'status', 'ACTIVE',
      'contractValue', 1600,
      'projectBudget', 1000,
      'currency', 'PHP',
      'taxTreatment', 'UNCLASSIFIED'
    ),
    '[]'::jsonb
  )$,
  '42501',
  null,
  'grouped workbook Apply rejects tax declassification for a classified project'
);
select is(
  (select tax_treatment from public.projects where id = (select project_id from excel_concurrency_ids)),
  'VAT',
  'classified project tax treatment remains unchanged after rejected workbook Apply'
);

select set_config('request.jwt.claim.sub', (select outsider_user::text from excel_concurrency_ids), true);
select throws_ok(
  $$select public.apply_project_cost_control_group(
    (select project_id from excel_concurrency_ids),
    (select updated_at from public.projects where id = (select project_id from excel_concurrency_ids)),
    jsonb_build_object(
      'id', (select project_id from excel_concurrency_ids),
      'companyId', (select company_id from excel_concurrency_ids),
      'projectCode', 'EXCEL-CONCURRENCY',
      'projectName', 'Unauthorized overwrite',
      'status', 'ACTIVE',
      'projectBudget', 1000,
      'currency', 'PHP',
      'taxTreatment', 'VAT'
    ),
    '[]'::jsonb
  )$$,
  '42501',
  null,
  'non-member cannot apply a project workbook group'
);

set local role postgres;
select * from finish();
rollback;
