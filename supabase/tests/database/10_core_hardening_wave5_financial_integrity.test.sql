-- Wave 5 focused database invariants: finalization authority, stale writes,
-- lifecycle exclusions, currency stability, and targeted source revisions.
begin;
select no_plan();

select has_function('public', 'replace_payroll_run_entries', 'revision-bound payroll replacement remains available');
select isnt_empty($$select 1 from pg_proc where oid = 'public.replace_payroll_run_entries(uuid,bigint,jsonb,jsonb)'::regprocedure and prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'$$, 'revision-bound payroll replacement is SECURITY DEFINER with an empty search_path');
select is((select has_function_privilege('authenticated', 'public.replace_payroll_run_entries(uuid,jsonb,jsonb)', 'EXECUTE')), false, 'legacy unguarded payroll replacement is not executable by authenticated clients');
select isnt_empty($$select 1 from pg_trigger where tgrelid='public.payroll_runs'::regclass and tgname='payroll_runs_transition_guard'$$, 'payroll run transition guard is installed');
select isnt_empty($$select 1 from pg_trigger where tgrelid='public.payroll_periods'::regclass and tgname='payroll_period_status_guard'$$, 'payroll period supporting-status guard is installed');
select isnt_empty($$select 1 from pg_trigger where tgrelid='public.payroll_entries'::regclass and tgname='payroll_entries_financial_integrity'$$, 'payroll entry financial integrity guard is installed');
select isnt_empty($$select 1 from pg_trigger where tgrelid='public.companies'::regclass and tgname='companies_payroll_currency_guard'$$, 'payroll currency stability guard is installed');
select isnt_empty($$select 1 from pg_policies where schemaname='public' and tablename='payroll_runs' and policyname='payroll_runs_company_update' and (qual::text like '%payroll.manage%' and qual::text like '%payroll.approve%') and (with_check::text like '%payroll.manage%' and with_check::text like '%payroll.approve%')$$, 'payroll run update RLS recognizes both management and approval authority');

create temp table wave5_ids as
select
  '00000000-0000-4000-8000-000000000501'::uuid as admin_user,
  '00000000-0000-4000-8000-000000000502'::uuid as manager_user,
  '00000000-0000-4000-8000-000000000503'::uuid as approver_user,
  'aaaaaaaa-0000-4000-8000-000000000501'::uuid as company_id,
  '10000000-0000-4000-8000-000000000501'::uuid as project_id,
  '20000000-0000-4000-8000-000000000501'::uuid as worker_id,
  '30000000-0000-4000-8000-000000000501'::uuid as period_january,
  '30000000-0000-4000-8000-000000000502'::uuid as period_december,
  '30000000-0000-4000-8000-000000000503'::uuid as period_open,
  '40000000-0000-4000-8000-000000000501'::uuid as run_main,
  '40000000-0000-4000-8000-000000000502'::uuid as run_invalid,
  '50000000-0000-4000-8000-000000000501'::uuid as entry_main,
  '50000000-0000-4000-8000-000000000502'::uuid as invoice_id;

grant select on wave5_ids to authenticated;

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
select id, email, 'x', now(), now()
from (values
  ((select admin_user from wave5_ids), 'wave5-admin@test.local'),
  ((select manager_user from wave5_ids), 'wave5-manager@test.local'),
  ((select approver_user from wave5_ids), 'wave5-approver@test.local')
) users(id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values ((select company_id from wave5_ids), 'Wave 5 Integrity Company', 'wave5-integrity', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from wave5_ids), (select admin_user from wave5_ids));
insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_id from wave5_ids), (select admin_user from wave5_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_id from wave5_ids), (select manager_user from wave5_ids), 'PAYROLL', 'ACTIVE'),
  ((select company_id from wave5_ids), (select approver_user from wave5_ids), 'PAYROLL', 'ACTIVE');
insert into public.deployment_configuration (singleton, company_id) values (true, (select company_id from wave5_ids));

insert into public.company_member_permission_overrides (company_id, membership_id, permission_key, effect, created_by_user_id)
select cm.company_id, cm.id, override_row.permission_key, 'DENY', (select admin_user from wave5_ids)
from public.company_members cm
cross join (values ('payroll.approve'), ('payroll.manage')) override_row(permission_key)
where cm.company_id = (select company_id from wave5_ids)
  and cm.user_id = case when override_row.permission_key = 'payroll.approve' then (select manager_user from wave5_ids) else (select approver_user from wave5_ids) end;

insert into public.projects (id, user_id, company_id, project_code, project_name, status, project_budget, currency)
values ((select project_id from wave5_ids), (select admin_user from wave5_ids), (select company_id from wave5_ids), 'W5-PROJECT', 'Wave 5 Project', 'ACTIVE', 100000, 'PHP');
insert into public.workers (id, user_id, company_id, employee_code, first_name, last_name, display_name, default_pay_type, default_rate)
values ((select worker_id from wave5_ids), (select manager_user from wave5_ids), (select company_id from wave5_ids), 'W5-001', 'Wave', 'Worker', 'Wave 5 Worker', 'MONTHLY', 1000);
insert into public.worker_compensation_profiles (id, user_id, company_id, worker_id, effective_from, effective_to, frequency, rate)
values ('60000000-0000-4000-8000-000000000501'::uuid, (select manager_user from wave5_ids), (select company_id from wave5_ids), (select worker_id from wave5_ids), date '2026-01-01', date '2026-01-31', 'MONTHLY', 1000);
insert into public.payroll_periods (id, user_id, company_id, period_start, period_end, status)
values
  ((select period_january from wave5_ids), (select manager_user from wave5_ids), (select company_id from wave5_ids), date '2026-01-01', date '2026-01-15', 'OPEN'),
  ((select period_december from wave5_ids), (select manager_user from wave5_ids), (select company_id from wave5_ids), date '2026-12-01', date '2026-12-15', 'OPEN'),
  ((select period_open from wave5_ids), (select manager_user from wave5_ids), (select company_id from wave5_ids), date '2026-08-01', date '2026-08-15', 'OPEN');
insert into public.payroll_runs (id, user_id, company_id, period_id, status)
values
  ((select run_main from wave5_ids), (select admin_user from wave5_ids), (select company_id from wave5_ids), (select period_open from wave5_ids), 'DRAFT'),
  ((select run_invalid from wave5_ids), (select manager_user from wave5_ids), (select company_id from wave5_ids), (select period_december from wave5_ids), 'DRAFT');
insert into public.payroll_entries (id, user_id, company_id, payroll_run_id, worker_id, gross_pay, net_pay, project_allocated_cost, calculation_snapshot)
values ((select entry_main from wave5_ids), (select admin_user from wave5_ids), (select company_id from wave5_ids), (select run_main from wave5_ids), (select worker_id from wave5_ids), 100, 90, 100, '{"source":"wave5"}'::jsonb);

insert into public.invoices (id, user_id, company_id, invoice_number, invoice_date, currency, grand_total, payment_status, review_status, current_data)
values ((select invoice_id from wave5_ids), (select admin_user from wave5_ids), (select company_id from wave5_ids), 'W5-INV-001', date '2026-08-01', 'PHP', 100, 'UNPAID', 'VERIFIED', '{"netAmountPayable":120}'::jsonb);

-- Manager-only can prepare, but cannot approve/pay/void a run.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select manager_user::text from wave5_ids), true);
select lives_ok($$update public.payroll_runs set status = 'CALCULATED' where id = (select run_main from wave5_ids)$$, 'payroll.manage can calculate an open run');
select throws_ok($$update public.payroll_runs set status = 'APPROVED' where id = (select run_main from wave5_ids)$$, '42501', null, 'payroll.manage cannot approve a run without payroll.approve');
select throws_ok($$update public.payroll_periods set status = 'APPROVED' where id = (select period_open from wave5_ids)$$, '42501', null, 'a manager cannot use period APPROVED as an alternate finalization path');
select throws_ok($$select public.replace_payroll_run_entries((select run_main from wave5_ids), 99::bigint, '[]'::jsonb, '[]'::jsonb)$$, '40001', null, 'stale payroll calculation replacement is rejected before deletion');
select throws_ok($$insert into public.payroll_entries (id, user_id, company_id, payroll_run_id, worker_id, gross_pay, net_pay, project_allocated_cost, calculation_snapshot) values (gen_random_uuid(), (select manager_user from wave5_ids), (select company_id from wave5_ids), (select run_invalid from wave5_ids), (select worker_id from wave5_ids), 100, 110, 101, '{"source":"invalid"}'::jsonb)$$, '22023', null, 'project labor and net pay cannot exceed gross pay');
reset role;

-- An approve-only member can finalize the run but cannot edit it afterward.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select approver_user::text from wave5_ids), true);
select lives_ok($$update public.payroll_runs set status = 'APPROVED' where id = (select run_main from wave5_ids)$$, 'payroll.approve can approve a calculated run without payroll.manage');
select lives_ok($$update public.payroll_runs set status = 'PAID' where id = (select run_main from wave5_ids)$$, 'payroll.approve can pay an approved run');
select throws_ok($$update public.payroll_runs set notes = 'rewritten' where id = (select run_main from wave5_ids)$$, '42501', null, 'paid payroll history remains immutable');
reset role;

-- Source revision changes stay in the effective date range.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select manager_user::text from wave5_ids), true);
select lives_ok($$update public.worker_compensation_profiles set rate = 1200 where id = '60000000-0000-4000-8000-000000000501'::uuid$$, 'a compensation correction is accepted in an open period');
reset role;
select is((select source_revision from public.payroll_periods where id = (select period_january from wave5_ids)), 1::bigint, 'the overlapping open period is revised');
select is((select source_revision from public.payroll_periods where id = (select period_december from wave5_ids)), 0::bigint, 'an unrelated open period is not revised');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave5_ids), true);
select is((public.get_financial_settlement_summary((select company_id from wave5_ids), 'INVOICE', (select invoice_id from wave5_ids))->>'settlementBasis')::numeric, 100::numeric, 'malformed invoice net payable is capped at gross amount');
select throws_ok($$select public.update_company((select company_id from wave5_ids), null, null, 'USD', null)$$, '42501', null, 'deployment currency cannot be relabeled after payroll history exists');

reset role;
select * from finish();
rollback;
