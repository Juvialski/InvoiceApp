begin;
select no_plan();

-- The Wave 2A contract is intentionally exercised through the public RPCs and
-- authenticated table paths. Direct DELETE is closed for covered tables.
select has_function('public', 'preview_worker_lifecycle', 'worker lifecycle preflight exists');
select has_function('public', 'apply_worker_lifecycle', 'worker lifecycle RPC exists');
select has_function('public', 'apply_project_worker_assignment_lifecycle', 'assignment lifecycle RPC exists');
select has_function('public', 'save_worker_compensation_profile', 'compensation save RPC exists');
select has_function('public', 'apply_compensation_profile_lifecycle', 'compensation lifecycle RPC exists');
select has_function('public', 'apply_recurring_component_lifecycle', 'recurring component lifecycle RPC exists');
select has_function('public', 'apply_workforce_source_lifecycle', 'source lifecycle RPC exists');
select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('project_worker_assignments', 'worker_compensation_profiles', 'recurring_payroll_components', 'work_entries', 'attendance_records', 'leave_requests', 'overtime_requests')
      and grantee = 'authenticated'
      and privilege_type = 'DELETE'$$,
  'authenticated cannot bypass lifecycle RPCs with direct DELETE'
);
select isnt_empty(
  $$select 1 from pg_proc
    where oid = 'public.apply_worker_lifecycle(uuid,text,text)'::regprocedure
      and prosecdef
      and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'$$,
  'worker lifecycle RPC is SECURITY DEFINER with an empty search_path'
);
select isnt_empty(
  $$select 1 from pg_proc
    where oid = 'public.apply_workforce_source_lifecycle(text,uuid,text,text)'::regprocedure
      and prosecdef
      and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'$$,
  'source lifecycle RPC is SECURITY DEFINER with an empty search_path'
);
select is_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('preview_worker_lifecycle', 'apply_worker_lifecycle', 'apply_project_worker_assignment_lifecycle', 'save_worker_compensation_profile', 'apply_compensation_profile_lifecycle', 'apply_recurring_component_lifecycle', 'apply_workforce_source_lifecycle')
      and lower(grantee) in ('anon', 'public')
      and privilege_type = 'EXECUTE'$$,
  'anonymous and public roles cannot execute lifecycle RPCs'
);

create temp table wave2_ids as
select
  '00000000-0000-4000-8000-000000000101'::uuid as admin_user,
  '00000000-0000-4000-8000-000000000102'::uuid as payroll_user,
  '00000000-0000-4000-8000-000000000103'::uuid as suspended_user,
  '00000000-0000-4000-8000-000000000104'::uuid as outsider_user,
  '00000000-0000-4000-8000-000000000105'::uuid as denied_user,
  'aaaaaaaa-0000-4000-8000-000000000101'::uuid as company_a,
  'bbbbbbbb-0000-4000-8000-000000000102'::uuid as company_b,
  '10000000-0000-4000-8000-000000000101'::uuid as project_a,
  '10000000-0000-4000-8000-000000000102'::uuid as project_b,
  '10000000-0000-4000-8000-000000000103'::uuid as project_archived,
  '20000000-0000-4000-8000-000000000101'::uuid as project_other_company,
  '30000000-0000-4000-8000-000000000101'::uuid as worker_delete,
  '30000000-0000-4000-8000-000000000102'::uuid as worker_assignment,
  '30000000-0000-4000-8000-000000000103'::uuid as worker_attendance,
  '30000000-0000-4000-8000-000000000104'::uuid as worker_work,
  '30000000-0000-4000-8000-000000000105'::uuid as worker_payroll,
  '30000000-0000-4000-8000-000000000106'::uuid as worker_lifecycle,
  '30000000-0000-4000-8000-000000000107'::uuid as worker_compensation,
  '30000000-0000-4000-8000-000000000108'::uuid as worker_context,
  '30000000-0000-4000-8000-000000000109'::uuid as worker_other_company,
  '30000000-0000-4000-8000-000000000110'::uuid as worker_unused_assignment,
  '40000000-0000-4000-8000-000000000101'::uuid as period_open,
  '40000000-0000-4000-8000-000000000102'::uuid as period_finalized,
  '40000000-0000-4000-8000-000000000103'::uuid as period_draft,
  '50000000-0000-4000-8000-000000000101'::uuid as run_finalized,
  '50000000-0000-4000-8000-000000000102'::uuid as run_draft,
  '60000000-0000-4000-8000-000000000101'::uuid as entry_payroll,
  '60000000-0000-4000-8000-000000000102'::uuid as entry_compensation,
  '60000000-0000-4000-8000-000000000103'::uuid as entry_draft,
  '60000000-0000-4000-8000-000000000104'::uuid as entry_void,
  '60000000-0000-4000-8000-000000000105'::uuid as work_draft,
  '70000000-0000-4000-8000-000000000101'::uuid as profile_consumed,
  '70000000-0000-4000-8000-000000000102'::uuid as profile_old,
  '70000000-0000-4000-8000-000000000103'::uuid as component_consumed,
  '70000000-0000-4000-8000-000000000104'::uuid as component_unused,
  '80000000-0000-4000-8000-000000000101'::uuid as assignment_used,
  '80000000-0000-4000-8000-000000000102'::uuid as assignment_unused,
  '90000000-0000-4000-8000-000000000101'::uuid as attendance_confirmed,
  '90000000-0000-4000-8000-000000000102'::uuid as attendance_draft,
  '90000000-0000-4000-8000-000000000107'::uuid as attendance_finalized,
  '90000000-0000-4000-8000-000000000103'::uuid as leave_pending,
  '90000000-0000-4000-8000-000000000104'::uuid as leave_approved,
  '90000000-0000-4000-8000-000000000105'::uuid as overtime_pending,
  '90000000-0000-4000-8000-000000000106'::uuid as overtime_approved;

grant select on wave2_ids to authenticated;

set local role service_role;
insert into auth.users (id, email, encrypted_password, created_at, updated_at)
select id, email, 'x', now(), now()
from (values
  ((select admin_user from wave2_ids), 'wave2-admin@test.local'),
  ((select payroll_user from wave2_ids), 'wave2-payroll@test.local'),
  ((select suspended_user from wave2_ids), 'wave2-suspended@test.local'),
  ((select outsider_user from wave2_ids), 'wave2-outsider@test.local'),
  ((select denied_user from wave2_ids), 'wave2-denied@test.local')
) users(id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_a from wave2_ids), 'Wave 2A Test Company', 'wave2-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from wave2_ids), (select admin_user from wave2_ids)),
  ((select company_b from wave2_ids), 'Wave 2A Other Company', 'wave2-b', 'ACTIVE', 'USD', 'UTC', (select outsider_user from wave2_ids), (select outsider_user from wave2_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_a from wave2_ids), (select admin_user from wave2_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_a from wave2_ids), (select payroll_user from wave2_ids), 'PAYROLL', 'ACTIVE'),
  ((select company_a from wave2_ids), (select suspended_user from wave2_ids), 'PAYROLL', 'SUSPENDED'),
  ((select company_a from wave2_ids), (select denied_user from wave2_ids), 'PAYROLL', 'ACTIVE'),
  ((select company_b from wave2_ids), (select outsider_user from wave2_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from wave2_ids));

insert into public.company_member_permission_overrides (company_id, membership_id, permission_key, effect, created_by_user_id)
select cm.company_id, cm.id, 'workers.manage', 'DENY', (select admin_user from wave2_ids)
from public.company_members cm
where cm.company_id = (select company_a from wave2_ids)
  and cm.user_id = (select denied_user from wave2_ids);

insert into public.projects (id, user_id, company_id, project_code, project_name, status, project_budget, currency)
values
  ((select project_a from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), 'W2A-A', 'Wave 2A Project A', 'ACTIVE', 100000, 'PHP'),
  ((select project_b from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), 'W2A-B', 'Wave 2A Project B', 'ACTIVE', 100000, 'PHP'),
  ((select project_archived from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), 'W2A-X', 'Wave 2A Archived Project', 'ARCHIVED', 100000, 'PHP'),
  ((select project_other_company from wave2_ids), (select outsider_user from wave2_ids), (select company_b from wave2_ids), 'W2B-A', 'Wave 2A Foreign Project', 'ACTIVE', 100000, 'USD');

insert into public.workers (id, user_id, company_id, employee_code, first_name, last_name, display_name, employment_status, default_pay_type, default_rate, default_labor_context, default_project_id, active)
values
  ((select worker_delete from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), 'W2A-DELETE', 'Unused', 'Worker', 'Unused Worker', 'ACTIVE', 'MONTHLY', 1000, 'UNALLOCATED_REVIEW', null, true),
  ((select worker_assignment from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), 'W2A-ASGN', 'Assignment', 'Worker', 'Assignment Worker', 'ACTIVE', 'MONTHLY', 1000, 'UNALLOCATED_REVIEW', null, true),
  ((select worker_attendance from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), 'W2A-ATT', 'Attendance', 'Worker', 'Attendance Worker', 'ACTIVE', 'DAILY', 100, 'UNALLOCATED_REVIEW', null, true),
  ((select worker_work from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), 'W2A-WORK', 'Work', 'Worker', 'Work Worker', 'ACTIVE', 'HOURLY', 100, 'UNALLOCATED_REVIEW', null, true),
  ((select worker_payroll from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), 'W2A-PAY', 'Payroll', 'Worker', 'Payroll Worker', 'ACTIVE', 'MONTHLY', 1000, 'PROJECT', (select project_a from wave2_ids), true),
  ((select worker_lifecycle from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), 'W2A-LIFE', 'Lifecycle', 'Worker', 'Lifecycle Worker', 'ACTIVE', 'MONTHLY', 1000, 'UNALLOCATED_REVIEW', null, true),
  ((select worker_compensation from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), 'W2A-COMP', 'Compensation', 'Worker', 'Compensation Worker', 'ACTIVE', 'MONTHLY', 1000, 'PROJECT', (select project_a from wave2_ids), true),
  ((select worker_context from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), 'W2A-CONTEXT', 'Context', 'Worker', 'Context Worker', 'ACTIVE', 'MONTHLY', 1000, 'PROJECT', (select project_a from wave2_ids), true),
  ((select worker_other_company from wave2_ids), (select outsider_user from wave2_ids), (select company_b from wave2_ids), 'W2B-WORK', 'Foreign', 'Worker', 'Foreign Worker', 'ACTIVE', 'MONTHLY', 1000, 'UNALLOCATED_REVIEW', null, true),
  ((select worker_unused_assignment from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), 'W2A-ASGN-UNUSED', 'Unused', 'Assignment', 'Unused Assignment Worker', 'ACTIVE', 'MONTHLY', 1000, 'UNALLOCATED_REVIEW', null, true);

insert into public.payroll_periods (id, user_id, company_id, period_start, period_end, status, locked_at)
values
  ((select period_open from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), date '2026-01-01', date '2026-01-31', 'OPEN', null),
  ((select period_finalized from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), date '2026-02-01', date '2026-02-28', 'OPEN', null),
  ((select period_draft from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), date '2026-03-01', date '2026-03-31', 'DRAFT', null);

insert into public.payroll_runs (id, user_id, company_id, period_id, status)
values
  ((select run_finalized from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select period_finalized from wave2_ids), 'DRAFT'),
  ((select run_draft from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select period_draft from wave2_ids), 'DRAFT');

insert into public.worker_compensation_profiles (id, user_id, company_id, worker_id, effective_from, frequency, rate, default_labor_context, default_project_id, active)
values
  ((select profile_consumed from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_compensation from wave2_ids), date '2026-01-01', 'MONTHLY', 1000, 'PROJECT', (select project_a from wave2_ids), true),
  ((select profile_old from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_context from wave2_ids), date '2026-01-01', 'MONTHLY', 1000, 'PROJECT', (select project_a from wave2_ids), true);

insert into public.recurring_payroll_components (id, user_id, company_id, worker_id, type, name, amount, effective_from, active)
values
  ((select component_consumed from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_compensation from wave2_ids), 'EARNING', 'Consumed allowance', 100, date '2026-01-01', true),
  ((select component_unused from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_context from wave2_ids), 'EARNING', 'Unused allowance', 50, date '2026-01-01', true);

insert into public.payroll_entries (id, user_id, company_id, payroll_run_id, worker_id, gross_pay, net_pay, project_allocated_cost, calculation_snapshot, cost_context)
values
  ((select entry_payroll from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select run_finalized from wave2_ids), (select worker_payroll from wave2_ids), 1000, 1000, 1000, '{"fixture":"payroll-history"}'::jsonb, '{"type":"PROJECT","projectId":"historical"}'::jsonb),
  ((select entry_compensation from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select run_finalized from wave2_ids), (select worker_compensation from wave2_ids), 1100, 1100, 1000, jsonb_build_object('profileId', (select profile_consumed from wave2_ids)::text, 'componentId', (select component_consumed from wave2_ids)::text), '{"type":"PROJECT"}'::jsonb),
  ((select entry_draft from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select run_draft from wave2_ids), (select worker_lifecycle from wave2_ids), 1000, 1000, 0, '{"fixture":"draft"}'::jsonb, '{"type":"UNALLOCATED_REVIEW"}'::jsonb);

insert into public.payroll_project_allocations (id, user_id, company_id, payroll_entry_id, project_id, allocation_amount, allocation_percentage, source)
values
  (gen_random_uuid(), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select entry_payroll from wave2_ids), (select project_a from wave2_ids), 1000, 100, 'MANUAL');

insert into public.project_worker_assignments (id, user_id, company_id, worker_id, project_id, start_date, end_date, active, role_on_project)
values
  ((select assignment_used from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_assignment from wave2_ids), (select project_a from wave2_ids), date '2026-01-01', date '2026-01-31', true, 'Lead'),
  ((select assignment_unused from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_unused_assignment from wave2_ids), (select project_a from wave2_ids), date '2026-03-01', null, true, 'Future'),
  (gen_random_uuid(), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_context from wave2_ids), (select project_a from wave2_ids), date '2026-01-01', null, true, 'Project A'),
  (gen_random_uuid(), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_context from wave2_ids), (select project_b from wave2_ids), date '2026-01-01', null, true, 'Project B');

insert into public.work_entries (id, user_id, company_id, worker_id, project_id, period_id, work_date, regular_hours, rate, status, labor_context)
values
  (gen_random_uuid(), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_assignment from wave2_ids), (select project_a from wave2_ids), (select period_open from wave2_ids), date '2026-01-10', 8, 100, 'APPROVED', 'PROJECT'),
  (gen_random_uuid(), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_context from wave2_ids), (select project_b from wave2_ids), (select period_open from wave2_ids), date '2026-01-11', 8, 100, 'APPROVED', 'PROJECT'),
  ((select entry_void from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_work from wave2_ids), (select project_a from wave2_ids), (select period_open from wave2_ids), date '2026-01-12', 8, 100, 'APPROVED', 'PROJECT'),
  ((select work_draft from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_lifecycle from wave2_ids), (select project_a from wave2_ids), (select period_draft from wave2_ids), date '2026-03-03', 8, 100, 'DRAFT', 'PROJECT');

insert into public.attendance_records (id, user_id, company_id, worker_id, period_id, attendance_date, regular_minutes, paid_day_fraction, attendance_status, record_status, source)
values
  ((select attendance_confirmed from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_attendance from wave2_ids), (select period_open from wave2_ids), date '2026-01-13', 480, 1, 'PRESENT', 'CONFIRMED', 'MANUAL'),
  ((select attendance_draft from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_lifecycle from wave2_ids), (select period_draft from wave2_ids), date '2026-03-03', 480, 1, 'PRESENT', 'DRAFT', 'MANUAL'),
  ((select attendance_finalized from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_context from wave2_ids), (select period_finalized from wave2_ids), date '2026-02-03', 480, 1, 'PRESENT', 'CONFIRMED', 'MANUAL');

insert into public.leave_requests (id, user_id, company_id, worker_id, leave_type, start_date, end_date, status)
values
  ((select leave_pending from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_lifecycle from wave2_ids), 'PERSONAL', date '2026-01-20', date '2026-01-20', 'PENDING'),
  ((select leave_approved from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_context from wave2_ids), 'VACATION', date '2026-02-04', date '2026-02-04', 'APPROVED');

insert into public.overtime_requests (id, user_id, company_id, worker_id, period_id, overtime_date, project_id, labor_context, requested_minutes, approved_minutes, status, source)
values
  ((select overtime_pending from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_lifecycle from wave2_ids), (select period_open from wave2_ids), date '2026-01-21', null, 'UNALLOCATED_REVIEW', 60, 0, 'PENDING', 'MANUAL'),
  ((select overtime_approved from wave2_ids), (select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_context from wave2_ids), (select period_finalized from wave2_ids), date '2026-02-05', (select project_b from wave2_ids), 'PROJECT', 60, 60, 'APPROVED', 'MANUAL');
reset role;

-- Complete the finalized run after its snapshots and source rows exist.
set local role service_role;
update public.payroll_runs set status = 'CALCULATED' where id = (select run_finalized from wave2_ids);
update public.payroll_runs set status = 'APPROVED' where id = (select run_finalized from wave2_ids);
reset role;

-- Worker preflight and delete/offboard behavior.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave2_ids), true);
select is((public.preview_worker_lifecycle((select worker_delete from wave2_ids))->>'canDelete')::boolean, true, 'unused worker is delete-eligible only after the authoritative preflight');
select is((public.apply_worker_lifecycle((select worker_delete from wave2_ids), 'DELETE_UNUSED', null)->>'deleted')::boolean, true, 'unused worker can be permanently deleted');
select is((select count(*) from public.workers where id = (select worker_delete from wave2_ids)), 0::bigint, 'unused worker was removed');
select throws_ok(
  $$select public.apply_worker_lifecycle((select worker_payroll from wave2_ids), 'DELETE_UNUSED', null)$$,
  '42501', null,
  'authoritative worker preflight rejects a payroll-history worker delete'
);
select is((public.apply_worker_lifecycle((select worker_lifecycle from wave2_ids), 'OFFBOARD', 'No longer employed')->'record'->>'employment_status'), 'OFFBOARDED', 'used worker can be offboarded');
select is((select active from public.workers where id = (select worker_lifecycle from wave2_ids)), false, 'offboarding deactivates the worker');
select is((select count(*) from public.payroll_entries where worker_id = (select worker_lifecycle from wave2_ids)), 1::bigint, 'offboarding preserves payroll identity');
select is((public.apply_worker_lifecycle((select worker_lifecycle from wave2_ids), 'REACTIVATE', 'Returned to active employment')->'record'->>'employment_status'), 'ACTIVE', 'reactivation restores the worker');
select is((select active from public.workers where id = (select worker_lifecycle from wave2_ids)), true, 'reactivation makes the worker active again');
select throws_ok(
  $$select public.apply_worker_lifecycle((select worker_other_company from wave2_ids), 'OFFBOARD', 'Wrong target')$$,
  '42501', null,
  'wrong-company worker target is rejected'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select suspended_user::text from wave2_ids), true);
select throws_ok($$select public.apply_worker_lifecycle((select worker_lifecycle from wave2_ids), 'OFFBOARD', 'Suspended')$$, '42501', null, 'suspended member cannot mutate workers');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select outsider_user::text from wave2_ids), true);
select throws_ok($$select public.apply_worker_lifecycle((select worker_lifecycle from wave2_ids), 'OFFBOARD', 'Outsider')$$, '42501', null, 'non-member cannot mutate workers');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select denied_user::text from wave2_ids), true);
select throws_ok($$select public.apply_worker_lifecycle((select worker_lifecycle from wave2_ids), 'OFFBOARD', 'Denied')$$, '42501', null, 'effective custom DENY blocks worker mutation');
reset role;

-- Delete the unused assignment through the RPC, then confirm the used
-- assignment can only be ended and remains queryable.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave2_ids), true);
select is((public.apply_project_worker_assignment_lifecycle((select assignment_unused from wave2_ids), 'DELETE_UNUSED', null, null)->>'deleted')::boolean, true, 'unused assignment can be permanently deleted');
select throws_ok($$select public.apply_project_worker_assignment_lifecycle((select assignment_used from wave2_ids), 'DELETE_UNUSED', null, null)$$, '42501', null, 'used assignment cannot be deleted');
select is((public.apply_project_worker_assignment_lifecycle((select assignment_used from wave2_ids), 'END', date '2026-01-31', 'Project phase ended')->'record'->>'active')::boolean, false, 'used assignment can be ended');
select is((select end_date from public.project_worker_assignments where id = (select assignment_used from wave2_ids)), date '2026-01-31', 'ended assignment retains its historical end date');
select throws_ok(
  $$insert into public.project_worker_assignments (user_id, company_id, worker_id, project_id, start_date, end_date, active) values ((select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_lifecycle from wave2_ids), (select project_a from wave2_ids), date '2026-02-01', date '2026-01-01', true)$$,
  '22000', null,
  'assignment start/end date invariant is enforced'
);
select throws_ok(
  $$insert into public.project_worker_assignments (user_id, company_id, worker_id, project_id, start_date, active) values ((select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_context from wave2_ids), (select project_archived from wave2_ids), date '2026-03-01', true)$$,
  '42501', null,
  'archived project rejects new assignments'
);
select throws_ok(
  $$insert into public.project_worker_assignments (user_id, company_id, worker_id, project_id, start_date, active) values ((select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_other_company from wave2_ids), (select project_a from wave2_ids), date '2026-03-01', true)$$,
  '42501', null,
  'cross-company assignment is rejected'
);
reset role;

-- Worker context/default semantics and explicit actual work.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave2_ids), true);
select throws_ok(
  $$update public.workers set default_labor_context = 'ADMIN_OFFICE', default_project_id = (select project_a from wave2_ids) where id = (select worker_context from wave2_ids)$$,
  '22023', null,
  'admin office cannot retain a default project'
);
update public.workers set default_labor_context = 'ADMIN_OFFICE', default_project_id = null where id = (select worker_context from wave2_ids);
select is((select default_labor_context from public.workers where id = (select worker_context from wave2_ids)), 'ADMIN_OFFICE', 'admin office is a distinct worker context');
select is((select project_id from public.work_entries where worker_id = (select worker_context from wave2_ids) and work_date = date '2026-01-11'), (select project_b from wave2_ids), 'explicit work project remains authoritative over the worker default');
select lives_ok(
  $$insert into public.work_entries (user_id, company_id, worker_id, period_id, work_date, rate, status, labor_context, project_id) values ((select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_context from wave2_ids), (select period_open from wave2_ids), date '2026-01-14', 100, 'DRAFT', 'ADMIN_OFFICE', null)$$,
  'admin office work has no project reference'
);
select throws_ok(
  $$insert into public.work_entries (user_id, company_id, worker_id, period_id, work_date, rate, status, labor_context, project_id) values ((select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_context from wave2_ids), (select period_open from wave2_ids), date '2026-01-15', 100, 'DRAFT', 'GENERAL_OVERHEAD', (select project_a from wave2_ids))$$,
  'P0001', null,
  'general overhead cannot reference a project'
);
select throws_ok(
  $$insert into public.work_entries (user_id, company_id, worker_id, period_id, work_date, rate, status, labor_context, project_id) values ((select admin_user from wave2_ids), (select company_a from wave2_ids), (select worker_context from wave2_ids), (select period_open from wave2_ids), date '2026-01-16', 100, 'DRAFT', 'PROJECT', null)$$,
  'P0001', null,
  'project work requires a project reference'
);
reset role;

-- Compensation profile lifecycle, superseding, overlap and office context.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave2_ids), true);
select is((public.save_worker_compensation_profile((select profile_old from wave2_ids), (select worker_context from wave2_ids), date '2026-01-01', null, 'MONTHLY', 1000, 'PROJECT', (select project_a from wave2_ids), true)->>'id'), (select profile_old::text from wave2_ids), 'existing compensation profile can be saved by identity');
select is((select effective_to from public.worker_compensation_profiles where id = (select profile_old from wave2_ids)), date '2026-12-31', 'new effective profile supersedes the older profile without erasing it');
select is((public.save_worker_compensation_profile(gen_random_uuid(), (select worker_context from wave2_ids), date '2027-01-01', null, 'MONTHLY', 1200, 'ADMIN_OFFICE', null, true)->>'default_labor_context'), 'ADMIN_OFFICE', 'admin office profile stores without a project');
select throws_ok(
  $$select public.save_worker_compensation_profile(gen_random_uuid(), (select worker_context from wave2_ids), date '2027-02-01', null, 'MONTHLY', 1200, 'ADMIN_OFFICE', (select project_a from wave2_ids), true)$$,
  '22023', null,
  'admin office profile rejects an incompatible project'
);
select throws_ok(
  $$delete from public.worker_compensation_profiles where id = (select profile_consumed from wave2_ids)$$,
  '42501', null,
  'direct compensation profile delete is closed'
);
select throws_ok(
  $$select public.apply_compensation_profile_lifecycle((select profile_consumed from wave2_ids), 'DELETE_UNUSED', null, null)$$,
  '42501', null,
  'consumed compensation profile cannot be deleted'
);
select throws_ok(
  $$update public.worker_compensation_profiles set rate = 2000 where id = (select profile_consumed from wave2_ids)$$,
  '42501', null,
  'consumed compensation rate cannot be rewritten'
);
select lives_ok(
  $$select public.apply_compensation_profile_lifecycle((select profile_consumed from wave2_ids), 'END', date '2026-02-28', 'Rate replaced')$$,
  'consumed compensation profile can be ended without rewriting its row'
);
select is((select rate from public.worker_compensation_profiles where id = (select profile_consumed from wave2_ids)), 1000::numeric, 'historical compensation rate remains unchanged');
reset role;

-- Recurring component lifecycle mirrors compensation history behavior.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave2_ids), true);
update public.recurring_payroll_components set name = 'Corrected unused allowance' where id = (select component_unused from wave2_ids);
select is((select name from public.recurring_payroll_components where id = (select component_unused from wave2_ids)), 'Corrected unused allowance', 'unused component can be corrected');
select lives_ok($$select public.apply_recurring_component_lifecycle((select component_unused from wave2_ids), 'DEACTIVATE', date '2026-03-31', 'Configuration ended')$$, 'unused component can be deactivated/end-dated');
select is((select active from public.recurring_payroll_components where id = (select component_unused from wave2_ids)), false, 'component deactivation is persisted');
select throws_ok($$select public.apply_recurring_component_lifecycle((select component_consumed from wave2_ids), 'DELETE_UNUSED', null, null)$$, '42501', null, 'consumed component cannot be deleted');
select throws_ok($$update public.recurring_payroll_components set amount = 999 where id = (select component_consumed from wave2_ids)$$, '42501', null, 'consumed component amount cannot be rewritten');
select lives_ok($$select public.apply_recurring_component_lifecycle((select component_consumed from wave2_ids), 'DEACTIVATE', date '2026-02-28', 'Component replaced')$$, 'consumed component can be deactivated');
select is((select amount from public.recurring_payroll_components where id = (select component_consumed from wave2_ids)), 100::numeric, 'historical component amount remains unchanged');
select is((public.apply_recurring_component_lifecycle((select component_unused from wave2_ids), 'DELETE_UNUSED', null, null)->>'deleted')::boolean, true, 'unused component can be deleted after safe deactivation');
reset role;

-- Work entries and attendance use DELETE_DRAFT or VOID; finalized sources stay
-- immutable and VOID/CANCEL operations require a reason.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave2_ids), true);
select is((public.apply_workforce_source_lifecycle('WORK_ENTRY', (select work_draft from wave2_ids), 'DELETE_DRAFT', null)->>'deleted')::boolean, true, 'draft work entry can be deleted');
select throws_ok($$delete from public.work_entries where id = (select entry_void from wave2_ids)$$, '42501', null, 'approved work source cannot be directly deleted');
select is((public.apply_workforce_source_lifecycle('WORK_ENTRY', (select entry_void from wave2_ids), 'VOID', 'Corrected source')->'record'->>'status'), 'VOID', 'approved work source can be voided in an open period');
select throws_ok($$select public.apply_workforce_source_lifecycle('WORK_ENTRY', (select entry_void from wave2_ids), 'VOID', null)$$, '22023', null, 'void requires a reason');
select is((public.apply_workforce_source_lifecycle('ATTENDANCE', (select attendance_draft from wave2_ids), 'DELETE_DRAFT', null)->>'deleted')::boolean, true, 'draft attendance can be deleted');
select throws_ok($$select public.apply_workforce_source_lifecycle('ATTENDANCE', (select attendance_confirmed from wave2_ids), 'VOID', 'Late correction')$$, '42501', null, 'finalized attendance cannot be voided');
select is((public.apply_workforce_source_lifecycle('LEAVE', (select leave_pending from wave2_ids), 'CANCEL', 'Employee correction')->'record'->>'status'), 'CANCELLED', 'pending leave can be cancelled with a reason');
select is((public.apply_workforce_source_lifecycle('OVERTIME', (select overtime_pending from wave2_ids), 'CANCEL', 'Employee correction')->'record'->>'status'), 'CANCELLED', 'pending overtime can be cancelled with a reason');
select throws_ok($$select public.apply_workforce_source_lifecycle('LEAVE', (select leave_approved from wave2_ids), 'CANCEL', 'Correction')$$, '42501', null, 'finalized leave cannot be cancelled');
select throws_ok($$select public.apply_workforce_source_lifecycle('OVERTIME', (select overtime_approved from wave2_ids), 'CANCEL', 'Correction')$$, '42501', null, 'finalized overtime cannot be cancelled');
reset role;

-- Audit records are generated only for lifecycle outcomes and contain no
-- salary/payroll amounts in the metadata contract.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave2_ids), true);
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2_ids) and event_type = 'WORKER_OFFBOARDED' and target_id = (select worker_lifecycle from wave2_ids)), 1::bigint, 'worker offboarding writes an audit event');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2_ids) and event_type = 'WORKER_REACTIVATED' and target_id = (select worker_lifecycle from wave2_ids)), 1::bigint, 'worker reactivation writes an audit event');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2_ids) and event_type = 'PROJECT_ASSIGNMENT_ENDED' and target_id = (select assignment_used from wave2_ids)), 1::bigint, 'assignment ending writes an audit event');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2_ids) and event_type = 'ATTENDANCE_VOIDED'), 0::bigint, 'finalized attendance correction writes no false success audit');
select is_empty(
  $$select 1 from public.company_audit_events where company_id = (select company_a from wave2_ids) and metadata::text ~* '(gross|net|salary|rate|amount)'$$,
  'lifecycle audit metadata does not expose payroll amounts'
);
reset role;

select * from finish();
rollback;
