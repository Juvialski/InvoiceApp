begin;
select no_plan();

select ok(
  to_regprocedure('public.create_or_update_client_billing(jsonb,jsonb,timestamptz)') is not null,
  'Client Billing draft save exposes the expected-version signature'
);
select ok(
  has_function_privilege('authenticated', 'public.create_or_update_client_billing(jsonb,jsonb,timestamptz)', 'EXECUTE'),
  'authenticated users can execute the guarded Client Billing draft save'
);
select ok(
  not has_function_privilege('anon', 'public.create_or_update_client_billing(jsonb,jsonb,timestamptz)', 'EXECUTE'),
  'anonymous users cannot execute the guarded Client Billing draft save'
);

create temp table client_billing_concurrency_ids as
select
  '00000000-0000-4000-8000-000000004201'::uuid as admin_user,
  'aaaaaaaa-0000-4000-8000-000000004201'::uuid as company_id,
  '10000000-0000-4000-8000-000000004201'::uuid as project_id;
grant select on client_billing_concurrency_ids to authenticated, service_role;

set local role postgres;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from client_billing_concurrency_ids), true);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ((select admin_user from client_billing_concurrency_ids), 'client-billing-concurrency@test.local', 'x', now(), now(), now());

insert into public.companies (
  id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id
) values (
  (select company_id from client_billing_concurrency_ids),
  'Client Billing Concurrency Test Company',
  'client-billing-concurrency',
  'ACTIVE',
  'PHP',
  'Asia/Manila',
  (select admin_user from client_billing_concurrency_ids),
  (select admin_user from client_billing_concurrency_ids)
);

insert into public.company_members (company_id, user_id, role_key, status)
values (
  (select company_id from client_billing_concurrency_ids),
  (select admin_user from client_billing_concurrency_ids),
  'COMPANY_ADMIN',
  'ACTIVE'
);

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from client_billing_concurrency_ids));

insert into public.projects (
  id, user_id, company_id, project_code, project_name, status,
  client_name, client_reference, billing_contact_name, billing_email,
  billing_address, contract_value, project_budget, currency, tax_treatment,
  updated_at
) values (
  (select project_id from client_billing_concurrency_ids),
  (select admin_user from client_billing_concurrency_ids),
  (select company_id from client_billing_concurrency_ids),
  'CLIENT-BILLING-CONCURRENCY',
  'Client Billing Concurrency Project',
  'ACTIVE',
  'Concurrency Client',
  'CONC-001',
  'Finance Contact',
  'finance@test.local',
  '1 Finance Street',
  10000,
  8000,
  'PHP',
  'VAT',
  '2026-09-20 00:00:00+00'::timestamptz
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from client_billing_concurrency_ids), true);

create temp table client_billing_concurrency_saved as
select
  (result->'billing'->>'id')::uuid as billing_id,
  (result->'billing'->>'updated_at')::timestamptz as initial_updated_at
from (
  select public.create_or_update_client_billing(
    jsonb_build_object(
      'companyId', (select company_id from client_billing_concurrency_ids),
      'projectId', (select project_id from client_billing_concurrency_ids),
      'billingNumber', 'CB-CONCURRENCY-001',
      'billingDate', '2026-09-20',
      'dueDate', '2026-10-20',
      'paymentTerms', 'Due on receipt',
      'periodStart', '2026-09-01',
      'periodEnd', '2026-09-20',
      'clientNameSnapshot', 'Concurrency Client',
      'clientReferenceSnapshot', 'CONC-001',
      'billingContactName', 'Finance Contact',
      'billingEmail', 'finance@test.local',
      'billingAddress', '1 Finance Street',
      'currency', 'PHP',
      'notes', 'Initial draft'
    ),
    jsonb_build_array(jsonb_build_object('description', 'Initial work', 'amount', 1000, 'notes', 'Initial note'))
  ) as result
) created;

select is(
  (select due_date from public.client_billings where id = (select billing_id from client_billing_concurrency_saved)),
  '2026-10-20'::date,
  'draft creation persists due date inside the aggregate RPC'
);
select is(
  (select payment_terms from public.client_billings where id = (select billing_id from client_billing_concurrency_saved)),
  'Due on receipt',
  'draft creation persists payment terms inside the aggregate RPC'
);
select is(
  (select notes from public.client_billing_lines where billing_id = (select billing_id from client_billing_concurrency_saved)),
  'Initial note',
  'draft creation persists line notes'
);

select lives_ok(
  $$select public.create_or_update_client_billing(
    jsonb_build_object(
      'id', (select billing_id from client_billing_concurrency_saved),
      'companyId', (select company_id from client_billing_concurrency_ids),
      'projectId', (select project_id from client_billing_concurrency_ids),
      'billingNumber', 'CB-CONCURRENCY-001',
      'billingDate', '2026-09-20',
      'dueDate', '2026-10-31',
      'paymentTerms', 'Net 30',
      'billingContactName', 'Updated Finance Contact',
      'billingEmail', 'updated-finance@test.local',
      'billingAddress', '2 Finance Street',
      'currency', 'PHP',
      'notes', 'Matching version update'
    ),
    jsonb_build_array(jsonb_build_object('description', 'Updated work', 'amount', 1250, 'notes', 'Updated note')),
    (select initial_updated_at from client_billing_concurrency_saved)
  )$$,
  'matching expected version updates the complete billing aggregate'
);

select is(
  (select payment_terms from public.client_billings where id = (select billing_id from client_billing_concurrency_saved)),
  'Net 30',
  'matching version updates metadata'
);
select is(
  (select amount from public.client_billing_lines where billing_id = (select billing_id from client_billing_concurrency_saved)),
  1250.00::numeric,
  'matching version replaces the authoritative line set'
);

-- The database trigger uses transaction-stable now(); use a trigger-scoped
-- fixture update with clock_timestamp() to model a newer concurrent version
-- without committing test data outside the enclosing rollback.
set local role postgres;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from client_billing_concurrency_ids), true);
alter table public.client_billings disable trigger client_billings_updated_at;
update public.client_billings
set payment_terms = 'Concurrent edit', updated_at = clock_timestamp()
where id = (select billing_id from client_billing_concurrency_saved);
alter table public.client_billings enable trigger client_billings_updated_at;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from client_billing_concurrency_ids), true);
select isnt(
  (select updated_at from public.client_billings where id = (select billing_id from client_billing_concurrency_saved)),
  (select initial_updated_at from client_billing_concurrency_saved),
  'a concurrent transaction advances the authoritative draft version'
);

select throws_ok(
  $$select public.create_or_update_client_billing(
    jsonb_build_object(
      'id', (select billing_id from client_billing_concurrency_saved),
      'companyId', (select company_id from client_billing_concurrency_ids),
      'projectId', (select project_id from client_billing_concurrency_ids),
      'billingNumber', 'CB-CONCURRENCY-001',
      'billingDate', '2026-09-20',
      'paymentTerms', 'Stale overwrite',
      'currency', 'PHP'
    ),
    jsonb_build_array(jsonb_build_object('description', 'Stale work', 'amount', 9999)),
    (select initial_updated_at from client_billing_concurrency_saved)
  )$$,
  '40001',
  null,
  'stale expected version is rejected inside the Client Billing save RPC'
);

select is(
  (select payment_terms from public.client_billings where id = (select billing_id from client_billing_concurrency_saved)),
  'Concurrent edit',
  'stale metadata does not overwrite the authoritative draft'
);
select is(
  (select amount from public.client_billing_lines where billing_id = (select billing_id from client_billing_concurrency_saved)),
  1250.00::numeric,
  'stale line replacement rolls back atomically'
);

select * from finish();
rollback;
