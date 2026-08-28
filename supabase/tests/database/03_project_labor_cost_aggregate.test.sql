begin;
select no_plan();

-- Function shape and privilege boundary.
select has_function('public', 'get_project_labor_cost_aggregate', 'project labor aggregate RPC exists');
select isnt_empty(
  $$select 1
    from pg_proc p
   where p.oid = 'public.get_project_labor_cost_aggregate(uuid[])'::regprocedure
     and p.prosecdef
     and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=""%'$$,
  'project labor aggregate is SECURITY DEFINER with an empty search_path'
);
select isnt_empty(
  $$select 1
    from information_schema.routine_privileges
   where routine_schema = 'public'
     and routine_name = 'get_project_labor_cost_aggregate'
     and grantee = 'authenticated'
     and privilege_type = 'EXECUTE'$$,
  'authenticated can execute the aggregate RPC'
);
select is_empty(
  $$select 1
    from information_schema.routine_privileges
   where routine_schema = 'public'
     and routine_name = 'get_project_labor_cost_aggregate'
     and lower(grantee) in ('anon', 'public')
     and privilege_type = 'EXECUTE'$$,
  'anonymous and public roles cannot execute the aggregate RPC'
);
select is_empty(
  $$select 1
    from pg_proc
   where oid = 'public.get_project_labor_cost_aggregate(uuid[])'::regprocedure
     and pg_get_function_result(oid) ~* '(employee|worker|email|attendance|rate|deduction|net_pay|gross_pay|payroll_entry)'$$,
  'aggregate return shape contains no employee or payroll-detail fields'
);

-- Fixed test identities and two historical companies. Both companies exist
-- before the deployment singleton is configured so the wrong-company probe
-- exercises the deployment boundary rather than a missing foreign row.
create temp table project_labor_test_ids as
select
  '00000000-0000-4000-8000-000000000001'::uuid as admin_user,
  '00000000-0000-4000-8000-000000000002'::uuid as finance_user,
  '00000000-0000-4000-8000-000000000003'::uuid as viewer_user,
  '00000000-0000-4000-8000-000000000004'::uuid as payroll_user,
  '00000000-0000-4000-8000-000000000005'::uuid as outsider_user,
  '00000000-0000-4000-8000-000000000006'::uuid as suspended_user,
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid as company_a,
  'bbbbbbbb-0000-4000-8000-000000000002'::uuid as company_b,
  '10000000-0000-4000-8000-000000000001'::uuid as project_main,
  '10000000-0000-4000-8000-000000000002'::uuid as project_empty,
  '10000000-0000-4000-8000-000000000003'::uuid as project_zero,
  '10000000-0000-4000-8000-000000000004'::uuid as project_usd,
  '20000000-0000-4000-8000-000000000001'::uuid as project_other_company,
  '30000000-0000-4000-8000-000000000001'::uuid as worker_id,
  '30000000-0000-4000-8000-000000000002'::uuid as worker_two,
  '40000000-0000-4000-8000-000000000001'::uuid as period_approved,
  '40000000-0000-4000-8000-000000000002'::uuid as period_paid,
  '40000000-0000-4000-8000-000000000003'::uuid as period_draft,
  '40000000-0000-4000-8000-000000000004'::uuid as period_calculated,
  '40000000-0000-4000-8000-000000000005'::uuid as period_void,
  '50000000-0000-4000-8000-000000000001'::uuid as run_approved,
  '50000000-0000-4000-8000-000000000002'::uuid as run_paid,
  '50000000-0000-4000-8000-000000000003'::uuid as run_draft,
  '50000000-0000-4000-8000-000000000004'::uuid as run_calculated,
  '50000000-0000-4000-8000-000000000005'::uuid as run_void,
  '60000000-0000-4000-8000-000000000001'::uuid as entry_approved,
  '60000000-0000-4000-8000-000000000002'::uuid as entry_paid,
  '60000000-0000-4000-8000-000000000003'::uuid as entry_draft,
  '60000000-0000-4000-8000-000000000004'::uuid as entry_calculated,
  '60000000-0000-4000-8000-000000000005'::uuid as entry_void,
  '60000000-0000-4000-8000-000000000006'::uuid as entry_overhead,
  '60000000-0000-4000-8000-000000000007'::uuid as entry_zero,
  '60000000-0000-4000-8000-000000000008'::uuid as entry_usd;

insert into auth.users (id, email, encrypted_password, confirmed_at, created_at, updated_at)
select id, email, 'x', now(), now(), now()
from (values
  ((select admin_user from project_labor_test_ids), 'aggregate-admin@test.local'),
  ((select finance_user from project_labor_test_ids), 'aggregate-finance@test.local'),
  ((select viewer_user from project_labor_test_ids), 'aggregate-viewer@test.local'),
  ((select payroll_user from project_labor_test_ids), 'aggregate-payroll@test.local'),
  ((select outsider_user from project_labor_test_ids), 'aggregate-outsider@test.local'),
  ((select suspended_user from project_labor_test_ids), 'aggregate-suspended@test.local')
) users(id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_a from project_labor_test_ids), 'Aggregate Test Company', 'aggregate-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from project_labor_test_ids), (select admin_user from project_labor_test_ids)),
  ((select company_b from project_labor_test_ids), 'Other Test Company', 'aggregate-b', 'ACTIVE', 'USD', 'UTC', (select outsider_user from project_labor_test_ids), (select outsider_user from project_labor_test_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_a from project_labor_test_ids), (select admin_user from project_labor_test_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_a from project_labor_test_ids), (select finance_user from project_labor_test_ids), 'FINANCE', 'ACTIVE'),
  ((select company_a from project_labor_test_ids), (select viewer_user from project_labor_test_ids), 'VIEWER', 'ACTIVE'),
  ((select company_a from project_labor_test_ids), (select payroll_user from project_labor_test_ids), 'PAYROLL', 'ACTIVE'),
  ((select company_a from project_labor_test_ids), (select suspended_user from project_labor_test_ids), 'VIEWER', 'SUSPENDED');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from project_labor_test_ids));

insert into public.projects (id, user_id, company_id, project_code, project_name, status, project_budget, currency)
values
  ((select project_main from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), 'AGG-MAIN', 'Aggregate Main Project', 'ACTIVE', 100000, 'PHP'),
  ((select project_empty from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), 'AGG-EMPTY', 'No Labor Project', 'ACTIVE', 100000, 'PHP'),
  ((select project_zero from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), 'AGG-ZERO', 'Zero Labor Project', 'ACTIVE', 100000, 'PHP'),
  ((select project_usd from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), 'AGG-USD', 'Foreign Currency Project', 'ACTIVE', 100000, 'USD'),
  ((select project_other_company from project_labor_test_ids), (select outsider_user from project_labor_test_ids), (select company_b from project_labor_test_ids), 'OTHER-001', 'Other Company Project', 'ACTIVE', 100000, 'USD');

insert into public.workers (id, user_id, company_id, employee_code, first_name, last_name, display_name, default_pay_type, default_rate)
values
  ((select worker_id from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), 'AGG-001', 'Aggregate', 'Worker', 'Aggregate Worker', 'MONTHLY', 1000),
  ((select worker_two from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), 'AGG-002', 'Second', 'Worker', 'Second Worker', 'MONTHLY', 1000);

insert into public.payroll_periods (id, user_id, company_id, period_start, period_end, status, locked_at)
values
  ((select period_approved from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), date '2026-01-01', date '2026-01-15', 'APPROVED', now()),
  ((select period_paid from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), date '2026-01-16', date '2026-01-31', 'PAID', now()),
  ((select period_draft from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), date '2026-02-01', date '2026-02-15', 'DRAFT', null),
  ((select period_calculated from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), date '2026-02-16', date '2026-02-28', 'CALCULATED', null),
  ((select period_void from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), date '2026-03-01', date '2026-03-15', 'VOID', null);

insert into public.payroll_runs (id, user_id, company_id, period_id, status)
values
  ((select run_approved from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select period_approved from project_labor_test_ids), 'APPROVED'),
  ((select run_paid from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select period_paid from project_labor_test_ids), 'PAID'),
  ((select run_draft from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select period_draft from project_labor_test_ids), 'DRAFT'),
  ((select run_calculated from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select period_calculated from project_labor_test_ids), 'CALCULATED'),
  ((select run_void from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select period_void from project_labor_test_ids), 'VOID');

insert into public.payroll_entries (id, user_id, company_id, payroll_run_id, worker_id, gross_pay, net_pay, project_allocated_cost, cost_context)
values
  ((select entry_approved from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select run_approved from project_labor_test_ids), (select worker_id from project_labor_test_ids), 100, 70, 100, '{}'::jsonb),
  ((select entry_paid from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select run_paid from project_labor_test_ids), (select worker_two from project_labor_test_ids), 50, 30, 50, '{}'::jsonb),
  ((select entry_draft from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select run_draft from project_labor_test_ids), (select worker_id from project_labor_test_ids), 25, 20, 25, '{}'::jsonb),
  ((select entry_calculated from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select run_calculated from project_labor_test_ids), (select worker_two from project_labor_test_ids), 10, 8, 10, '{}'::jsonb),
  ((select entry_void from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select run_void from project_labor_test_ids), (select worker_id from project_labor_test_ids), 999, 900, 999, '{}'::jsonb),
  ((select entry_overhead from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select run_approved from project_labor_test_ids), (select worker_two from project_labor_test_ids), 500, 400, 500, '{"type":"ADMIN_OFFICE"}'::jsonb),
  ((select entry_zero from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select run_approved from project_labor_test_ids), (select worker_id from project_labor_test_ids), 0, 0, 0, '{}'::jsonb),
  ((select entry_usd from project_labor_test_ids), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select run_approved from project_labor_test_ids), (select worker_two from project_labor_test_ids), 20, 15, 20, '{}'::jsonb);

insert into public.payroll_project_allocations (id, user_id, company_id, payroll_entry_id, project_id, allocation_amount, allocation_percentage, source)
values
  (gen_random_uuid(), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select entry_approved from project_labor_test_ids), (select project_main from project_labor_test_ids), 100, 100, 'MANUAL'),
  (gen_random_uuid(), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select entry_paid from project_labor_test_ids), (select project_main from project_labor_test_ids), 50, 100, 'MANUAL'),
  (gen_random_uuid(), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select entry_draft from project_labor_test_ids), (select project_main from project_labor_test_ids), 25, 100, 'MANUAL'),
  (gen_random_uuid(), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select entry_calculated from project_labor_test_ids), (select project_main from project_labor_test_ids), 10, 100, 'MANUAL'),
  (gen_random_uuid(), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select entry_void from project_labor_test_ids), (select project_main from project_labor_test_ids), 999, 100, 'MANUAL'),
  (gen_random_uuid(), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select entry_overhead from project_labor_test_ids), (select project_main from project_labor_test_ids), 500, 100, 'MANUAL'),
  (gen_random_uuid(), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select entry_zero from project_labor_test_ids), (select project_zero from project_labor_test_ids), 0, 100, 'MANUAL'),
  (gen_random_uuid(), (select admin_user from project_labor_test_ids), (select company_a from project_labor_test_ids), (select entry_usd from project_labor_test_ids), (select project_usd from project_labor_test_ids), 20, 100, 'MANUAL');

-- Finance can read the aggregate but cannot read payroll detail rows.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select finance_user::text from project_labor_test_ids), true);
select is((select count(*)::bigint from public.payroll_entries), 0::bigint, 'Finance cannot read payroll entry detail');
select is((select count(*)::bigint from public.payroll_project_allocations), 0::bigint, 'Finance cannot read payroll allocation detail');
select is((select confirmed_labor_cost from public.get_project_labor_cost_aggregate(array[(select project_main from project_labor_test_ids)])), 150::numeric, 'Finance receives confirmed project labor aggregate');
select is((select pending_labor_cost from public.get_project_labor_cost_aggregate(array[(select project_main from project_labor_test_ids)])), 35::numeric, 'Finance receives pending project labor aggregate');
select is((select aggregate_status from public.get_project_labor_cost_aggregate(array[(select project_main from project_labor_test_ids)])), 'AVAILABLE'::text, 'Finance receives an available aggregate status');
reset role;

-- All seeded roles with payroll.summary.read follow the same safe contract.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from project_labor_test_ids), true);
select is((select confirmed_labor_cost from public.get_project_labor_cost_aggregate(array[(select project_main from project_labor_test_ids)])), 150::numeric, 'Company Admin can read the aggregate');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select viewer_user::text from project_labor_test_ids), true);
select is((select confirmed_labor_cost from public.get_project_labor_cost_aggregate(array[(select project_main from project_labor_test_ids)])), 150::numeric, 'Viewer can read the aggregate without payroll detail');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select payroll_user::text from project_labor_test_ids), true);
select is((select confirmed_labor_cost from public.get_project_labor_cost_aggregate(array[(select project_main from project_labor_test_ids)])), 150::numeric, 'Payroll can read the same aggregate');
reset role;

-- A no-membership user and a suspended member fail closed.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select outsider_user::text from project_labor_test_ids), true);
select throws_ok(
  $$select * from public.get_project_labor_cost_aggregate(array['10000000-0000-4000-8000-000000000001'::uuid])$$,
  '42501', null,
  'No-membership user cannot read the aggregate'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select suspended_user::text from project_labor_test_ids), true);
select throws_ok(
  $$select * from public.get_project_labor_cost_aggregate(array['10000000-0000-4000-8000-000000000001'::uuid])$$,
  '42501', null,
  'Suspended membership cannot read the aggregate'
);
reset role;

-- Project/company context, malformed input, and deployment configuration are
-- rejected rather than converted to empty or zero results.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select finance_user::text from project_labor_test_ids), true);
select throws_ok(
  $$select * from public.get_project_labor_cost_aggregate(array['20000000-0000-4000-8000-000000000001'::uuid])$$,
  '42501', null,
  'Cross-company project is rejected'
);
select set_config('request.headers', jsonb_build_object('x-company-id', (select company_b::text from project_labor_test_ids))::text, true);
select throws_ok(
  $$select * from public.get_project_labor_cost_aggregate(array['10000000-0000-4000-8000-000000000001'::uuid])$$,
  '42501', null,
  'Fabricated company header is rejected'
);
select set_config('request.headers', '{}'::text, true);
select throws_ok(
  $$select * from public.get_project_labor_cost_aggregate(array['not-a-uuid'::uuid])$$,
  '22P02', null,
  'Malformed project identifier is rejected'
);
select throws_ok(
  $$select * from public.get_project_labor_cost_aggregate(array[]::uuid[])$$,
  '22023', null,
  'Empty project identifier list is rejected'
);
reset role;

delete from public.deployment_configuration;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from project_labor_test_ids), true);
select throws_ok(
  $$select * from public.get_project_labor_cost_aggregate(array['10000000-0000-4000-8000-000000000001'::uuid])$$,
  '55000', null,
  'Missing deployment configuration is rejected'
);
reset role;
insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from project_labor_test_ids));

-- Legitimate zero, no qualifying labor, lifecycle exclusion, and overhead
-- semantics remain explicit in the project-level response.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select finance_user::text from project_labor_test_ids), true);
select is((select confirmed_labor_cost from public.get_project_labor_cost_aggregate(array[(select project_zero from project_labor_test_ids)])), 0::numeric, 'Legitimate zero labor cost is returned as zero');
select is((select aggregate_status from public.get_project_labor_cost_aggregate(array[(select project_zero from project_labor_test_ids)])), 'ZERO'::text, 'Zero allocation remains distinguishable from unavailable data');
select is((select aggregate_status from public.get_project_labor_cost_aggregate(array[(select project_empty from project_labor_test_ids)])), 'ZERO'::text, 'No qualifying labor rows return an explicit zero status');
select is((select confirmed_labor_cost from public.get_project_labor_cost_aggregate(array[(select project_main from project_labor_test_ids)])), 150::numeric, 'VOID labor is excluded from confirmed cost');
select is((select pending_labor_cost from public.get_project_labor_cost_aggregate(array[(select project_main from project_labor_test_ids)])), 35::numeric, 'DRAFT and CALCULATED labor remain pending');
select is((select confirmed_labor_cost from public.get_project_labor_cost_aggregate(array[(select project_usd from project_labor_test_ids)])), 20::numeric, 'Foreign project labor amount is preserved');
select is((select currency from public.get_project_labor_cost_aggregate(array[(select project_usd from project_labor_test_ids)])), 'PHP'::text, 'Current schema reports the deployment payroll currency explicitly');
select is((select aggregate_status from public.get_project_labor_cost_aggregate(array[(select project_usd from project_labor_test_ids)])), 'CURRENCY_CONFLICT'::text, 'Currency mismatch is explicit and non-combinable');
reset role;

select * from finish();
rollback;
